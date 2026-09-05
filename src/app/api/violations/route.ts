import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ViolationType } from '@/generated/prisma/enums'
import { requireActorOrThrow } from '@/server/dal'
import { toErrorResponse } from '@/server/api-error'
import { clientIp } from '@/server/auth/request-ip'
import { UploadError } from '@/server/storage'
import { ForbiddenError, holdsPermission } from '@/server/permissions'
import { ViolationError, createViolation } from '@/server/violations/service'

const fields = z.object({
  type: z.enum(ViolationType),
  zoneId: z.string().min(1, 'Choose the zone.'),
  spotId: z.string().optional(),
  plateEntered: z.string().trim().min(4, 'Enter the full number plate.'),
  note: z.string().trim().max(500).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
})

export async function POST(request: Request) {
  try {
    const actor = await requireActorOrThrow()

    // Cheap gate before reading an 8 MB photo; the zone-scoped check is still
    // enforced in createViolation.
    if (!holdsPermission(actor, 'violation:report')) {
      throw new ForbiddenError('violation:report')
    }

    const form = await request.formData()
    const photo = form.get('photo')

    // Evidence is not optional. A report without a photo cannot be verified,
    // and an unverifiable report is exactly what makes these systems abusable.
    if (!(photo instanceof File)) {
      return NextResponse.json({ error: 'Attach a photo of the vehicle.' }, { status: 400 })
    }

    const parsed = fields.safeParse({
      type: form.get('type'),
      zoneId: form.get('zoneId'),
      spotId: form.get('spotId') || undefined,
      plateEntered: form.get('plateEntered'),
      note: form.get('note') || undefined,
      latitude: form.get('latitude') || undefined,
      longitude: form.get('longitude') || undefined,
    })

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Check the form.' },
        { status: 400 },
      )
    }

    const { id } = await createViolation(
      actor,
      {
        ...parsed.data,
        spotId: parsed.data.spotId ?? null,
        latitude: parsed.data.latitude ?? null,
        longitude: parsed.data.longitude ?? null,
        photo,
      },
      await clientIp(),
    )

    return NextResponse.json({ id }, { status: 201 })
  } catch (error) {
    if (error instanceof UploadError || error instanceof ViolationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return toErrorResponse(error)
  }
}
