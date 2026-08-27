import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireActorOrThrow } from '@/server/dal'
import { toErrorResponse } from '@/server/api-error'
import { clientIp } from '@/server/auth/request-ip'
import { ViolationError, triageViolation } from '@/server/violations/service'
import { TransitionError } from '@/server/violations/access'

const schema = z.object({
  matchedVehicleId: z.string().min(1).nullable(),
  note: z.string().trim().max(500).optional(),
})

export async function POST(request: NextRequest, ctx: RouteContext<'/api/violations/[id]/triage'>) {
  try {
    const actor = await requireActorOrThrow()
    const { id } = await ctx.params

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }

    await triageViolation(actor, id, parsed.data, await clientIp())

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof ViolationError || error instanceof TransitionError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    return toErrorResponse(error)
  }
}
