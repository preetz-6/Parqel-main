import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireActorOrThrow } from '@/server/dal'
import { toErrorResponse } from '@/server/api-error'
import { clientIp } from '@/server/auth/request-ip'
import { EventError, createEvent } from '@/server/events/service'

const schema = z.object({
  name: z.string().trim().min(3, 'Give the event a name.').max(200),
  zoneIds: z.array(z.string().min(1)).min(1, 'Choose at least one zone.'),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
})

export async function POST(request: Request) {
  try {
    const actor = await requireActorOrThrow()

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Check the form.' },
        { status: 400 },
      )
    }

    const event = await createEvent(actor, parsed.data, await clientIp())

    return NextResponse.json(event, { status: 201 })
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    return toErrorResponse(error)
  }
}
