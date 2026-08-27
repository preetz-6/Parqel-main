import { NextResponse } from 'next/server'
import { ForbiddenError } from './permissions'
import { IntegrityError } from './rules'
import { UnauthenticatedError, getActor } from './dal'
import { auditEvent } from './audit'
import { clientIp } from './auth/request-ip'

/**
 * Maps domain errors to responses.
 *
 * Integrity violations return 422 with their message, because those messages
 * are written for the person reading them ("You reported this violation, so
 * you cannot decide it") and are meant to be shown. Permission failures return
 * a bare 403 — telling someone precisely which permission they lack is a hint
 * they do not need.
 *
 * Both are recorded. In a system whose entire purpose is accountability, an
 * attempt to act beyond your authority is exactly the kind of thing the audit
 * log exists for — and a burst of them is the signal that someone is probing.
 */
export async function toErrorResponse(error: unknown): Promise<NextResponse> {
  if (error instanceof UnauthenticatedError) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  if (error instanceof ForbiddenError) {
    await recordDenial('authz.denied', {
      permission: error.permission,
      zoneId: error.zoneId ?? null,
    })
    return NextResponse.json({ error: 'You do not have access to that.' }, { status: 403 })
  }

  if (error instanceof IntegrityError) {
    await recordDenial('integrity.blocked', { rule: error.rule })
    return NextResponse.json({ error: error.message, rule: error.rule }, { status: 422 })
  }

  console.error('[api] unhandled error', error)
  return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
}

async function recordDenial(action: string, detail: Record<string, unknown>): Promise<void> {
  try {
    // getActor() is memoised for the request, so this is not an extra query.
    const actor = await getActor()
    await auditEvent(
      { actorUserId: actor?.userId ?? null, ip: await clientIp() },
      {
        action,
        entity: 'Authorization',
        entityId: actor?.employeeId ?? 'anonymous',
        newValue: detail,
      },
    )
  } catch {
    // Never let audit failure mask the original error.
  }
}
