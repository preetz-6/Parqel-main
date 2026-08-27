import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { auditEvent } from '@/server/audit'
import { clientIp } from '@/server/auth/request-ip'
import { readSession, clearedSessionCookie } from '@/server/session'

/**
 * Checks that the request originated from our own app. `sameSite: lax` cookies
 * are still sent on top-level cross-origin form POSTs, so a malicious page
 * could otherwise trigger logout via `<form action="…/logout" method="post">`.
 */
function originAllowed(request: NextRequest): boolean {
  const appUrl = process.env.APP_URL ?? request.nextUrl.origin
  const allowed = new URL(appUrl).origin

  const origin = request.headers.get('origin')
  if (origin) return origin === allowed

  // Fallback for clients that send Referer but not Origin.
  const referer = request.headers.get('referer')
  if (referer) {
    try {
      return new URL(referer).origin === allowed
    } catch {
      return false
    }
  }

  // No origin and no referer — reject.
  return false
}

export async function POST(request: NextRequest) {
  if (!originAllowed(request)) {
    return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 })
  }

  const session = await readSession()

  if (session) {
    await auditEvent(
      { actorUserId: session.userId, ip: await clientIp() },
      { action: 'auth.logout', entity: 'User', entityId: session.userId },
    )
  }

  const response = NextResponse.redirect(
    new URL('/login', process.env.APP_URL ?? request.nextUrl.origin),
    { status: 303 },
  )
  response.cookies.set(clearedSessionCookie())
  return response
}

