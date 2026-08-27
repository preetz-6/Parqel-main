import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireActorOrThrow } from '@/server/dal'
import { toErrorResponse } from '@/server/api-error'
import { clientIp } from '@/server/auth/request-ip'
import { PassError, revokePass } from '@/server/passes/service'

export async function POST(_request: NextRequest, ctx: RouteContext<'/api/passes/[id]/revoke'>) {
  try {
    const actor = await requireActorOrThrow()
    const { id } = await ctx.params

    await revokePass(actor, id, await clientIp())

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof PassError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    return toErrorResponse(error)
  }
}
