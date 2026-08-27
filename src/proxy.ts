import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Next 16 renamed `middleware` to `proxy`. Its own docs are explicit that this
 * layer "should not be used as a full session management or authorization
 * solution" — so this does exactly one thing: bounce requests that carry no
 * session cookie at all, saving a render for obviously signed-out traffic.
 *
 * It does not verify the cookie and it makes no authorization decision. Every
 * real check happens in the Data Access Layer next to the data (src/server/dal.ts).
 * Treat a request that gets past this point as entirely unauthenticated.
 */

const PUBLIC_PATHS = ['/login', '/api/auth']

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next()
  }

  if (!request.cookies.has('parqel_session')) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Everything except Next internals and static assets.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
