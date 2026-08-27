import { NextResponse } from 'next/server'
import { z } from 'zod'
import { VehicleClass } from '@/generated/prisma/enums'
import { requireActorOrThrow } from '@/server/dal'
import { toErrorResponse } from '@/server/api-error'
import { clientIp } from '@/server/auth/request-ip'
import { PassError, issuePass } from '@/server/passes/service'

const schema = z.object({
  visitorName: z.string().trim().min(1, 'Who is visiting?').max(200),
  plate: z.string().trim().min(4, 'Enter the full number plate.'),
  vehicleClass: z.enum(VehicleClass),
  zoneId: z.string().min(1).nullable().optional(),
  validFrom: z.coerce.date(),
  validTo: z.coerce.date(),
  hostUserId: z.string().min(1).nullable().optional(),
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

    const pass = await issuePass(
      actor,
      {
        ...parsed.data,
        zoneId: parsed.data.zoneId ?? null,
        hostUserId: parsed.data.hostUserId ?? null,
      },
      await clientIp(),
    )

    return NextResponse.json(pass, { status: 201 })
  } catch (error) {
    if (error instanceof PassError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    return toErrorResponse(error)
  }
}
