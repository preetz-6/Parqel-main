import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireActorOrThrow } from '@/server/dal'
import { toErrorResponse } from '@/server/api-error'
import { clientIp } from '@/server/auth/request-ip'
import { UploadError } from '@/server/storage'
import { ForbiddenError, holdsPermission } from '@/server/permissions'
import { UnknownVehicleError, logUnknownVehicle } from '@/server/gate/unknown'

const fields = z.object({
  plate: z.string().trim().min(4, 'Enter the full number plate.'),
  zoneId: z.string().min(1, 'Choose the zone.'),
  note: z.string().trim().max(500).optional(),
})

export async function POST(request: Request) {
  try {
    const actor = await requireActorOrThrow()

    // Refuse before reading the body. The zone-scoped check still happens in
    // the service — this only stops an unauthorized caller making us parse a
    // multipart upload first.
    if (!holdsPermission(actor, 'unknownVehicle:log')) {
      throw new ForbiddenError('unknownVehicle:log')
    }

    const form = await request.formData()
    const photo = form.get('photo')

    const parsed = fields.safeParse({
      plate: form.get('plate'),
      zoneId: form.get('zoneId'),
      note: form.get('note') || undefined,
    })

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Check the form.' },
        { status: 400 },
      )
    }

    const result = await logUnknownVehicle(
      actor,
      {
        ...parsed.data,
        // A photo helps but is not required — a guard noting a plate in
        // passing is still useful data.
        photo: photo instanceof File && photo.size > 0 ? photo : null,
      },
      await clientIp(),
    )

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    if (error instanceof UnknownVehicleError || error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return toErrorResponse(error)
  }
}
