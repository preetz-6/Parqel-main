import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requestOtp } from '@/server/auth/otp'
import { clientIp } from '@/server/auth/request-ip'

const schema = z.object({
  employeeId: z.string().trim().min(1).max(64),
})

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter your employee ID.' }, { status: 400 })
  }

  const result = await requestOtp(parsed.data.employeeId, await clientIp())

  if (result.ok) {
    return NextResponse.json({ sentTo: result.maskedPhone, expiresIn: result.expiresInSeconds })
  }

  switch (result.reason) {
    case 'rate_limited':
      return NextResponse.json(
        { error: 'Too many code requests. Wait 15 minutes and try again.' },
        { status: 429 },
      )
    case 'no_phone':
      return NextResponse.json(
        { error: 'No phone number on file for that ID. Sign in with your work Google account instead.' },
        { status: 409 },
      )
    default:
      // Unknown employee and deactivated accounts return the same message, so
      // this endpoint cannot be used to probe the roster. The distinction is
      // recorded in the audit log.
      return NextResponse.json(
        { error: 'That employee ID is not recognised. Contact the parking office.' },
        { status: 404 },
      )
  }
}
