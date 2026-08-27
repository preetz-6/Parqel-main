import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireActorOrThrow } from '@/server/dal'
import { toErrorResponse } from '@/server/api-error'
import { clientIp } from '@/server/auth/request-ip'
import { AppealError, reviewAppeal } from '@/server/appeals/service'

const schema = z.object({
  decision: z.enum(['UPHELD', 'OVERTURNED']),
  note: z.string().trim().max(2000).optional(),
})

export async function POST(request: NextRequest, ctx: RouteContext<'/api/appeals/[id]/review'>) {
  try {
    const actor = await requireActorOrThrow()
    const { id } = await ctx.params

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }

    await reviewAppeal(actor, id, parsed.data, await clientIp())

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof AppealError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    return toErrorResponse(error)
  }
}
