import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireActorOrThrow } from '@/server/dal'
import { toErrorResponse } from '@/server/api-error'
import { readEvidence } from '@/server/storage'
import { canViewViolation } from '@/server/violations/access'

/**
 * Serves violation evidence. Every request is authorized against the specific
 * violation — this is why photos are not in /public.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<'/api/violations/[id]/image'>) {
  try {
    const actor = await requireActorOrThrow()
    const { id } = await ctx.params

    const violation = await prisma.violation.findUnique({
      where: { id },
      select: {
        imageOriginal: true,
        reportedById: true,
        zoneId: true,
        status: true,
        matchedVehicle: { select: { userId: true } },
      },
    })

    if (!violation) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    }

    // Same response for "does not exist" and "not yours", so this endpoint
    // cannot be used to discover which violation ids are real.
    if (!canViewViolation(actor, violation)) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    }

    const file = await readEvidence(violation.imageOriginal)
    if (!file) {
      return NextResponse.json({ error: 'Evidence file is missing.' }, { status: 410 })
    }

    return new NextResponse(new Uint8Array(file.body), {
      headers: {
        'Content-Type': file.contentType,
        'Content-Length': String(file.body.byteLength),
        // Private: this is evidence, it must not sit in a shared cache.
        'Cache-Control': 'private, max-age=300, no-store',
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
