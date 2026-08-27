import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireActorOrThrow } from '@/server/dal'
import { toErrorResponse } from '@/server/api-error'
import { audited } from '@/server/audit'
import { clientIp } from '@/server/auth/request-ip'
import { assertCan } from '@/server/permissions'
import { ViolationStatus } from '@/generated/prisma/enums'

const schema = z.object({
  reason: z.string().trim().min(20, 'Explain in at least 20 characters why this is wrong.').max(2000),
})

export async function POST(request: NextRequest, ctx: RouteContext<'/api/violations/[id]/appeal'>) {
  try {
    const actor = await requireActorOrThrow()
    const { id } = await ctx.params

    assertCan(actor, 'appeal:file')

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
        { status: 400 },
      )
    }

    const violation = await prisma.violation.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        matchedVehicle: { select: { userId: true } },
        appeals: { select: { id: true } },
      },
    })

    if (!violation) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

    // Only the accused may appeal, and only once a decision exists to appeal.
    if (violation.matchedVehicle?.userId !== actor.userId) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    }

    if (violation.status !== ViolationStatus.APPROVED) {
      return NextResponse.json(
        { error: 'There is nothing to appeal — this report was not upheld.' },
        { status: 409 },
      )
    }

    if (violation.appeals.length > 0) {
      return NextResponse.json({ error: 'You have already appealed this.' }, { status: 409 })
    }

    await audited(
      { actorUserId: actor.userId, ip: await clientIp() },
      (tx) =>
        tx.appeal.create({
          data: { violationId: violation.id, userId: actor.userId, reason: parsed.data.reason },
        }),
      (appeal) => ({
        action: 'appeal.file',
        entity: 'Appeal',
        entityId: appeal.id,
        newValue: { violationId: violation.id },
      }),
    )

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
