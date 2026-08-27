import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireActorOrThrow } from '@/server/dal'
import { toErrorResponse } from '@/server/api-error'
import { clientIp } from '@/server/auth/request-ip'
import { NotEntitledError } from '@/server/entitlements'
import { ReservationError, createReservation } from '@/server/reservations/service'

const schema = z.object({
  zoneId: z.string().min(1, 'Choose a zone.'),
  vehicleId: z.string().min(1, 'Choose a vehicle.'),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  onBehalfOfUserId: z.string().min(1).nullable().optional(),
})

export async function POST(request: Request) {
  try {
    const actor = await requireActorOrThrow()

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Check the form.' },
        { status: 400 },
      )
    }

    const reservation = await createReservation(
      actor,
      { ...parsed.data, onBehalfOfUserId: parsed.data.onBehalfOfUserId ?? null },
      await clientIp(),
    )

    return NextResponse.json(reservation, { status: 201 })
  } catch (error) {
    // Not being eligible for a zone is a normal outcome, not a failure.
    if (error instanceof NotEntitledError || error instanceof ReservationError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    return toErrorResponse(error)
  }
}
