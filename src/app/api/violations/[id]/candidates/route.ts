import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireActorOrThrow } from '@/server/dal'
import { toErrorResponse } from '@/server/api-error'
import { assertCan } from '@/server/permissions'
import { findPlateCandidates } from '@/server/violations/plate-match'

/**
 * Registry candidates for a reported plate.
 *
 * Gated on `violation:triage` rather than `violation:read:any` because the
 * response contains owner names — this is the one place the registry is
 * readable, and only for someone authorized to decide the match.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<'/api/violations/[id]/candidates'>,
) {
  try {
    const actor = await requireActorOrThrow()
    const { id } = await ctx.params

    const violation = await prisma.violation.findUnique({
      where: { id },
      select: { zoneId: true, plateEntered: true, ocrPlate: true },
    })

    if (!violation) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

    assertCan(actor, 'violation:triage', { zoneId: violation.zoneId })

    const query =
      request.nextUrl.searchParams.get('plate') ??
      violation.plateEntered ??
      violation.ocrPlate ??
      ''

    return NextResponse.json({ candidates: await findPlateCandidates(query) })
  } catch (error) {
    return toErrorResponse(error)
  }
}
