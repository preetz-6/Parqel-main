import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireActorOrThrow } from '@/server/dal'
import { toErrorResponse } from '@/server/api-error'
import { clientIp } from '@/server/auth/request-ip'
import { PassError, scanPass } from '@/server/passes/service'

const schema = z.object({
  code: z.string().trim().min(4, 'Enter the pass code.').max(32),
})

export async function POST(request: Request) {
  try {
    const actor = await requireActorOrThrow()

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Enter the pass code.' }, { status: 400 })
    }

    const verdict = await scanPass(actor, parsed.data.code, await clientIp())

    // 200 either way: an invalid pass is a normal outcome at a gate, not an
    // error, and the guard needs the detail to act on it.
    return NextResponse.json(verdict)
  } catch (error) {
    if (error instanceof PassError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    return toErrorResponse(error)
  }
}
