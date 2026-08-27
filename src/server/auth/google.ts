import 'server-only'

import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { SignJWT, createRemoteJWKSet, jwtVerify } from 'jose'
import { prisma } from '@/lib/prisma'
import { UserStatus } from '@/generated/prisma/enums'
import { auditEvent } from '../audit'

/**
 * Google Workspace SSO.
 *
 * Signing in with Google proves who you are to Google. It does not create an
 * account here — the verified email must already match a roster user, or the
 * login is refused. That is the property that keeps plate-to-owner mapping
 * trustworthy, so it must not be relaxed for convenience.
 */

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']

const STATE_COOKIE = 'parqel_oauth_state'
const STATE_TTL_SECONDS = 600

const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))

export function ssoConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set. See .env.example.`)
  return value
}

function redirectUri(): string {
  const appUrl = requiredEnv('APP_URL').replace(/\/$/, '')
  return `${appUrl}/api/auth/google/callback`
}

function allowedDomains(): string[] {
  return (process.env.ALLOWED_EMAIL_DOMAINS ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
}

function stateSecret(): Uint8Array {
  return new TextEncoder().encode(requiredEnv('SESSION_SECRET'))
}

/**
 * Builds the consent URL and stashes state + nonce in a short-lived signed
 * cookie. The state defends the callback against CSRF; the nonce binds the
 * returned id_token to this specific attempt.
 */
export async function beginGoogleLogin(): Promise<string> {
  const state = randomBytes(16).toString('base64url')
  const nonce = randomBytes(16).toString('base64url')

  const token = await new SignJWT({ state, nonce })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${STATE_TTL_SECONDS}s`)
    .sign(stateSecret())

  const store = await cookies()
  store.set(STATE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: STATE_TTL_SECONDS,
  })

  const params = new URLSearchParams({
    client_id: requiredEnv('GOOGLE_CLIENT_ID'),
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    prompt: 'select_account',
  })

  // Nudges Google's account chooser toward the org domain when there is one.
  const [primaryDomain] = allowedDomains()
  if (primaryDomain) params.set('hd', primaryDomain)

  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

async function consumeState(): Promise<{ state: string; nonce: string } | null> {
  const store = await cookies()
  const token = store.get(STATE_COOKIE)?.value
  store.delete(STATE_COOKIE)
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, stateSecret(), { algorithms: ['HS256'] })
    if (typeof payload.state !== 'string' || typeof payload.nonce !== 'string') return null
    return { state: payload.state, nonce: payload.nonce }
  } catch {
    return null
  }
}

export type GoogleLoginResult =
  | { ok: true; userId: string; employeeId: string }
  | {
      ok: false
      reason:
        | 'bad_state'
        | 'token_exchange_failed'
        | 'invalid_token'
        | 'unverified_email'
        | 'domain_not_allowed'
        | 'not_on_roster'
        | 'inactive'
    }

export async function completeGoogleLogin(
  code: string,
  returnedState: string,
  ip?: string | null,
): Promise<GoogleLoginResult> {
  const stored = await consumeState()
  if (!stored || stored.state !== returnedState) {
    return { ok: false, reason: 'bad_state' }
  }

  const body = new URLSearchParams({
    code,
    client_id: requiredEnv('GOOGLE_CLIENT_ID'),
    client_secret: requiredEnv('GOOGLE_CLIENT_SECRET'),
    redirect_uri: redirectUri(),
    grant_type: 'authorization_code',
  })

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  })

  if (!response.ok) return { ok: false, reason: 'token_exchange_failed' }

  const tokens = (await response.json()) as { id_token?: string }
  if (!tokens.id_token) return { ok: false, reason: 'token_exchange_failed' }

  let email: string
  let emailVerified: boolean
  let hostedDomain: string | undefined

  try {
    const { payload } = await jwtVerify(tokens.id_token, jwks, {
      issuer: GOOGLE_ISSUERS,
      audience: requiredEnv('GOOGLE_CLIENT_ID'),
    })

    if (payload.nonce !== stored.nonce) return { ok: false, reason: 'invalid_token' }
    if (typeof payload.email !== 'string') return { ok: false, reason: 'invalid_token' }

    email = payload.email.toLowerCase()
    emailVerified = payload.email_verified === true
    hostedDomain = typeof payload.hd === 'string' ? payload.hd.toLowerCase() : undefined
  } catch {
    return { ok: false, reason: 'invalid_token' }
  }

  if (!emailVerified) return { ok: false, reason: 'unverified_email' }

  // Check both the hosted-domain claim and the address itself, so a personal
  // account that happens to spoof a display name cannot slip through.
  const domains = allowedDomains()
  if (domains.length > 0) {
    const emailDomain = email.split('@')[1] ?? ''
    const domainOk = domains.includes(emailDomain) && (!hostedDomain || domains.includes(hostedDomain))
    if (!domainOk) {
      await auditEvent(
        { actorUserId: null, ip },
        { action: 'auth.login.sso.domain_rejected', entity: 'User', entityId: email },
      )
      return { ok: false, reason: 'domain_not_allowed' }
    }
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, employeeId: true, status: true },
  })

  // Verified by Google but absent from the roster: no account is created.
  if (!user) {
    await auditEvent(
      { actorUserId: null, ip },
      { action: 'auth.login.sso.not_on_roster', entity: 'User', entityId: email },
    )
    return { ok: false, reason: 'not_on_roster' }
  }

  if (user.status !== UserStatus.ACTIVE) return { ok: false, reason: 'inactive' }

  await auditEvent(
    { actorUserId: user.id, ip },
    { action: 'auth.login.sso', entity: 'User', entityId: user.id },
  )

  return { ok: true, userId: user.id, employeeId: user.employeeId }
}
