import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireActorOrThrow } from '@/server/dal'
import { toErrorResponse } from '@/server/api-error'
import { clientIp } from '@/server/auth/request-ip'
import {
  ReservationError,
  cancelReservation,
  checkInReservation,
  forceRelease,
} from '@/server/reservations/service'

const schema = z.object({
  action: z.enum(['checkIn', 'cancel', 'forceRelease']),
  reason: z.string().trim().max(500).optional(),
})

export async function POST(request: NextRequest, ctx: RouteContext<'/api/reservations/[id]'>) {
  try {
    const actor = await requireActorOrThrow()
    const { id } = await ctx.params

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }

    const ip = await clientIp()

    switch (parsed.data.action) {
      case 'checkIn':
        await checkInReservation(actor, id, undefined, ip)
        break
      case 'cancel':
        await cancelReservation(actor, id, ip)
        break
      case 'forceRelease':
        await forceRelease(actor, id, parsed.data.reason ?? '', ip)
        break
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof ReservationError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    return toErrorResponse(error)
  }
}
