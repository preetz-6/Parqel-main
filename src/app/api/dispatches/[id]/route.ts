import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireActorOrThrow } from '@/server/dal'
import { toErrorResponse } from '@/server/api-error'
import { clientIp } from '@/server/auth/request-ip'
import { DispatchError, updateDispatch } from '@/server/dispatch/service'

const schema = z.object({
  status: z.enum(['RESPONDING', 'RESOLVED']),
})

export async function POST(request: NextRequest, ctx: RouteContext<'/api/dispatches/[id]'>) {
  try {
    const actor = await requireActorOrThrow()
    const { id } = await ctx.params

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }

    await updateDispatch(actor, id, parsed.data.status, await clientIp())

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof DispatchError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    return toErrorResponse(error)
  }
}
