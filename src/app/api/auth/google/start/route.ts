import { NextResponse } from 'next/server'
import { beginGoogleLogin, ssoConfigured } from '@/server/auth/google'

export async function GET() {
  if (!ssoConfigured()) {
    return NextResponse.redirect(
      new URL('/login?error=sso_unconfigured', process.env.APP_URL ?? 'http://localhost:3000'),
    )
  }

  return NextResponse.redirect(await beginGoogleLogin())
}
