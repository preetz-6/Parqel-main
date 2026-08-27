import 'server-only'

import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'

const SESSION_COOKIE = 'parqel_session'

/** 12 hours — one working day. Exported for sliding-expiry logic. */
export const SESSION_TTL_SECONDS = 60 * 60 * 12

/**
 * A session is refreshed only when it is past the halfway mark of its TTL.
 * This avoids re-signing on every single request while still preventing
 * hard kicks for active users.
 */
const REFRESH_AFTER_SECONDS = SESSION_TTL_SECONDS / 2

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error(
      'SESSION_SECRET must be set to at least 32 characters. See .env.example.',
    )
  }
  return new TextEncoder().encode(secret)
}

export type SessionPayload = {
  userId: string
  employeeId: string
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: SESSION_TTL_SECONDS,
} as const

async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey())
}

/**
 * Cookie spec for Route Handlers.
 *
 * Route Handlers must set this on the NextResponse they return —
 * `response.cookies.set(...)`. Mutating the async `cookies()` store instead
 * does *not* merge into a response object you constructed yourself, which
 * fails silently: the handler returns 200 and the browser gets no cookie.
 */
export async function buildSessionCookie(payload: SessionPayload) {
  return {
    name: SESSION_COOKIE,
    value: await signSession(payload),
    ...COOKIE_OPTIONS,
  }
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE

/** For Server Actions and Server Components, where the cookie store is applied for you. */
export async function createSession(payload: SessionPayload): Promise<void> {
  // `cookies()` is async as of Next.js 16.
  const store = await cookies()
  store.set(SESSION_COOKIE, await signSession(payload), COOKIE_OPTIONS)
}

export async function readSession(): Promise<SessionPayload | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] })
    if (typeof payload.userId !== 'string' || typeof payload.employeeId !== 'string') {
      return null
    }
    return { userId: payload.userId, employeeId: payload.employeeId }
  } catch {
    // Expired or tampered — treat as signed out rather than erroring.
    return null
  }
}

/**
 * Sliding session expiry for Server Components.
 *
 * If the current session JWT is past the halfway mark of its TTL, re-signs it
 * with a fresh `iat` / `exp` and writes the new cookie via the `cookies()`
 * store (which works in Server Components and Server Actions).
 *
 * Does nothing if there is no valid session or the token is still young.
 * Called from the root layout so every page render transparently extends
 * active sessions without the proxy touching authorization.
 */
export async function refreshSession(): Promise<void> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return

  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] })
    if (typeof payload.userId !== 'string' || typeof payload.employeeId !== 'string') return

    const iat = payload.iat
    if (typeof iat !== 'number') return

    const ageSeconds = Math.floor(Date.now() / 1000) - iat
    if (ageSeconds < REFRESH_AFTER_SECONDS) return

    // Past the halfway mark — re-sign with a fresh TTL.
    const freshToken = await signSession({
      userId: payload.userId,
      employeeId: payload.employeeId,
    })
    store.set(SESSION_COOKIE, freshToken, COOKIE_OPTIONS)
  } catch {
    // Expired or tampered — `readSession` / `getActor` will handle it.
  }
}

/** Expiring cookie spec for Route Handlers — same caveat as buildSessionCookie. */
export function clearedSessionCookie() {
  return { name: SESSION_COOKIE, value: '', ...COOKIE_OPTIONS, maxAge: 0 }
}

/** For Server Actions and Server Components. */
export async function destroySession(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}
