import { NextResponse } from 'next/server'
import { z } from 'zod'
import { AlertSeverity } from '@/generated/prisma/enums'
import { requireActorOrThrow } from '@/server/dal'
import { toErrorResponse } from '@/server/api-error'
import { clientIp } from '@/server/auth/request-ip'
import { DispatchError, raiseEmergencyAlert } from '@/server/dispatch/service'

const schema = z.object({
  severity: z.enum(AlertSeverity),
  message: z.string().trim().min(5, 'Describe what is happening.').max(500),
  zoneId: z.string().min(1, 'Choose the zone.'),
  vehicleId: z.string().min(1).nullable().optional(),
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

    const alert = await raiseEmergencyAlert(
      actor,
      { ...parsed.data, vehicleId: parsed.data.vehicleId ?? null },
      await clientIp(),
    )

    return NextResponse.json(alert, { status: 201 })
  } catch (error) {
    if (error instanceof DispatchError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    return toErrorResponse(error)
  }
}
