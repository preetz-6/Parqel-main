import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireActorOrThrow } from '@/server/dal'
import { toErrorResponse } from '@/server/api-error'
import { clientIp } from '@/server/auth/request-ip'
import { flushQueuedPush } from '@/server/notifications'
import { ViolationError, decideViolation } from '@/server/violations/service'
import { TransitionError } from '@/server/violations/access'

const schema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  matchedVehicleId: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
})

export async function POST(request: NextRequest, ctx: RouteContext<'/api/violations/[id]/decide'>) {
  try {
    const actor = await requireActorOrThrow()
    const { id } = await ctx.params

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }

    const { alerted } = await decideViolation(
      actor,
      id,
      parsed.data.decision,
      {
        matchedVehicleId: parsed.data.matchedVehicleId,
        note: parsed.data.note,
      },
      await clientIp(),
    )

    // Delivery is outside the decision transaction on purpose: a push
    // provider being down must not roll back an approval.
    if (alerted) await flushQueuedPush()

    return NextResponse.json({ ok: true, alerted })
  } catch (error) {
    if (error instanceof ViolationError || error instanceof TransitionError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    return toErrorResponse(error)
  }
}
