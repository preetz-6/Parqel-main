import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { completeGoogleLogin } from '@/server/auth/google'
import { clientIp } from '@/server/auth/request-ip'
import { buildSessionCookie } from '@/server/session'

function loginUrl(base: string, error?: string): URL {
  const url = new URL('/login', base)
  if (error) url.searchParams.set('error', error)
  return url
}

export async function GET(request: NextRequest) {
  const base = process.env.APP_URL ?? request.nextUrl.origin
  const params = request.nextUrl.searchParams

  // The user declined consent, or Google returned an error.
  if (params.get('error')) {
    return NextResponse.redirect(loginUrl(base, 'sso_cancelled'))
  }

  const code = params.get('code')
  const state = params.get('state')
  if (!code || !state) {
    return NextResponse.redirect(loginUrl(base, 'sso_failed'))
  }

  const result = await completeGoogleLogin(code, state, await clientIp())

  if (!result.ok) {
    return NextResponse.redirect(loginUrl(base, result.reason))
  }

  const response = NextResponse.redirect(new URL('/', base))
  response.cookies.set(
    await buildSessionCookie({ userId: result.userId, employeeId: result.employeeId }),
  )
  return response
}
