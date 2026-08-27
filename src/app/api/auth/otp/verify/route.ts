import { NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyOtp } from '@/server/auth/otp'
import { clientIp } from '@/server/auth/request-ip'
import { buildSessionCookie } from '@/server/session'

const schema = z.object({
  employeeId: z.string().trim().min(1).max(64),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6 digit code.'),
})

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter the 6 digit code.' }, { status: 400 })
  }

  const result = await verifyOtp(parsed.data.employeeId, parsed.data.code, await clientIp())

  if (!result.ok) {
    const messages: Record<typeof result.reason, string> = {
      no_challenge: 'That code has expired. Request a new one.',
      expired: 'That code has expired. Request a new one.',
      too_many_attempts: 'Too many incorrect attempts. Request a new code.',
      bad_code: 'Incorrect code.',
      inactive: 'That account is not active. Contact the parking office.',
    }
    const status = result.reason === 'bad_code' ? 401 : 410
    return NextResponse.json({ error: messages[result.reason] }, { status })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(
    await buildSessionCookie({ userId: result.userId, employeeId: result.employeeId }),
  )
  return response
}
