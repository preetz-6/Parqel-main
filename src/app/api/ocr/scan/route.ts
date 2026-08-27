import { NextResponse } from 'next/server'
import { requireActorOrThrow } from '@/server/dal'
import { toErrorResponse } from '@/server/api-error'
import { ForbiddenError, holdsPermission } from '@/server/permissions'
import { ocrConfigured, readPlateFromBuffer } from '@/server/violations/ocr'

/**
 * Scan a plate from an uploaded image.
 *
 * Gated on `violation:report` — only users who can file reports should be
 * able to probe the OCR service. Returns 404 when OCR is not configured so
 * the client knows not to show the button.
 */
export async function POST(request: Request) {
  try {
    const actor = await requireActorOrThrow()

    if (!holdsPermission(actor, 'violation:report')) {
      throw new ForbiddenError('violation:report')
    }

    if (!ocrConfigured()) {
      return NextResponse.json(
        { error: 'OCR is not configured.' },
        { status: 404 },
      )
    }

    const form = await request.formData()
    const image = form.get('image')

    if (!(image instanceof File)) {
      return NextResponse.json(
        { error: 'Attach an image of the plate.' },
        { status: 400 },
      )
    }

    const buffer = Buffer.from(await image.arrayBuffer())
    const reading = await readPlateFromBuffer(buffer, image.type)

    if (!reading) {
      return NextResponse.json({ plate: null, confidence: 0 })
    }

    return NextResponse.json({
      plate: reading.plate,
      confidence: reading.confidence,
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
