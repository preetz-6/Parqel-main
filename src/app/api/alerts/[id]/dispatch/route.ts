import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireActorOrThrow } from '@/server/dal'
import { toErrorResponse } from '@/server/api-error'
import { clientIp } from '@/server/auth/request-ip'
import { DispatchError, dispatchGuard } from '@/server/dispatch/service'

const schema = z.object({
  guardUserId: z.string().min(1, 'Choose who to send.'),
})

export async function POST(request: NextRequest, ctx: RouteContext<'/api/alerts/[id]/dispatch'>) {
  try {
    const actor = await requireActorOrThrow()
    const { id } = await ctx.params

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Choose who to send.' }, { status: 400 })
    }

    await dispatchGuard(actor, id, parsed.data.guardUserId, await clientIp())

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof DispatchError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    return toErrorResponse(error)
  }
}
