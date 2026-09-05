import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireActorOrThrow } from '@/server/dal'
import { toErrorResponse } from '@/server/api-error'
import { clientIp } from '@/server/auth/request-ip'
import { ViolationError, resolveViolationOnSite } from '@/server/violations/service'
import { TransitionError } from '@/server/violations/access'

const schema = z.object({
  note: z.string().trim().max(500).optional(),
})

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActorOrThrow()
    const { id } = await ctx.params

    const parsed = schema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }

    await resolveViolationOnSite(actor, id, parsed.data.note, await clientIp())

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof ViolationError || error instanceof TransitionError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    return toErrorResponse(error)
  }
}
