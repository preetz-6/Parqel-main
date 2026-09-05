import { NextResponse } from 'next/server'
import { z } from 'zod'
import { VehicleClass } from '@/generated/prisma/enums'
import { prisma } from '@/lib/prisma'
import { requireActorOrThrow } from '@/server/dal'
import { toErrorResponse } from '@/server/api-error'
import { ForbiddenError, holdsPermission } from '@/server/permissions'
import { audited } from '@/server/audit'
import { clientIp } from '@/server/auth/request-ip'

const schema = z.object({
  plateNumber: z.string().trim().min(4, 'Enter the full number plate.').max(20),
  vehicleClass: z.enum(VehicleClass),
  makeModel: z.string().trim().max(100).optional(),
})

export async function POST(request: Request) {
  try {
    const actor = await requireActorOrThrow()

    if (!holdsPermission(actor, 'vehicle:request')) {
      throw new ForbiddenError('vehicle:request')
    }

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Check the form.' },
        { status: 400 },
      )
    }

    // Normalise plate: uppercase, collapse whitespace.
    const plate = parsed.data.plateNumber.toUpperCase().replace(/\s+/g, ' ').trim()

    // Check for duplicate plate.
    const existing = await prisma.vehicle.findUnique({
      where: { plateNumber: plate },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json(
        { error: 'That number plate is already registered.' },
        { status: 409 },
      )
    }

    const ip = await clientIp()

    const vehicle = await audited(
      { actorUserId: actor.userId, ip },
      (tx) =>
        tx.vehicle.create({
          data: {
            plateNumber: plate,
            vehicleClass: parsed.data.vehicleClass,
            makeModel: parsed.data.makeModel?.trim() || null,
            userId: actor.userId,
            // Status defaults to PENDING — admin must approve.
          },
        }),
      (created) => ({
        action: 'vehicle.request' as const,
        entity: 'Vehicle' as const,
        entityId: created.id,
        detail: `Requested vehicle ${plate} (${parsed.data.vehicleClass})`,
      }),
    )

    return NextResponse.json({ id: vehicle.id }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
