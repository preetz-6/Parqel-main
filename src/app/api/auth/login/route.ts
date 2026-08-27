import { NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyPassword } from '@/server/auth/password'
import { clientIp } from '@/server/auth/request-ip'
import { buildSessionCookie } from '@/server/session'

const schema = z.object({
  employeeId: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
})

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Enter your employee ID and password.' },
      { status: 400 },
    )
  }

  const result = await verifyPassword(
    parsed.data.employeeId,
    parsed.data.password,
    await clientIp(),
  )

  if (!result.ok) {
    const messages: Record<typeof result.reason, string> = {
      unknown_employee: 'That employee ID is not recognised. Contact the parking office.',
      inactive: 'That account is not active. Contact the parking office.',
      no_password: 'No password set for that account. Contact the parking office.',
      bad_password: 'Incorrect password.',
    }
    const status = result.reason === 'bad_password' ? 401 : 404
    return NextResponse.json({ error: messages[result.reason] }, { status })
  }

  // Route Handlers must set cookies on the response object, not via the
  // cookies() store — that fails silently with a 200 and no cookie.
  const response = NextResponse.json({ ok: true })
  response.cookies.set(
    await buildSessionCookie({ userId: result.userId, employeeId: result.employeeId }),
  )
  return response
}
