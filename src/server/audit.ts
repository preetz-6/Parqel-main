import 'server-only'

import { prisma } from '@/lib/prisma'
import type { PrismaClient } from '@/generated/prisma/client'

export type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>

export type AuditContext = {
  actorUserId: string | null
  ip?: string | null
}

export type AuditEntry = {
  action: string
  entity: string
  entityId: string
  oldValue?: unknown
  newValue?: unknown
}

/**
 * Fields never written to the audit log in full. The log records *that* a
 * contact detail changed and what it changed to at a coarse level, not the
 * value itself — an audit trail should not become a second copy of the
 * roster's personal data.
 */
const REDACTED_KEYS = new Set(['phone', 'email', 'codeHash', 'code_hash'])

function maskValue(value: unknown): unknown {
  if (typeof value !== 'string' || value.length === 0) return value === undefined ? undefined : '***'
  if (value.length <= 4) return '***'
  return `***${value.slice(-4)}`
}

export function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map(redact)
  if (value instanceof Date) return value.toISOString()

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACTED_KEYS.has(key) ? maskValue(val) : redact(val)
    }
    return out
  }

  return value
}

/** Only the keys that actually changed, so the log stays readable. */
export function diff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): { oldValue: Record<string, unknown> | null; newValue: Record<string, unknown> | null } {
  if (!before || !after) {
    return {
      oldValue: before ? (redact(before) as Record<string, unknown>) : null,
      newValue: after ? (redact(after) as Record<string, unknown>) : null,
    }
  }

  const oldValue: Record<string, unknown> = {}
  const newValue: Record<string, unknown> = {}

  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[key]
    const b = after[key]
    if (JSON.stringify(redact(a)) === JSON.stringify(redact(b))) continue
    oldValue[key] = redact(a)
    newValue[key] = redact(b)
  }

  return { oldValue, newValue }
}

/**
 * Runs a mutation and its audit entries in a single transaction.
 *
 * The transaction is the point: an audited change cannot commit without its
 * audit row, and an audit row cannot survive a rolled-back change. Any code
 * path that mutates state should go through here rather than touching
 * `prisma` directly, so "what happened and who did it" is never a
 * reconstruction exercise.
 *
 *   const violation = await audited(ctx, (tx) => tx.violation.update(...),
 *     (v) => ({ action: 'violation.approve', entity: 'Violation', entityId: v.id }))
 */
export async function audited<T>(
  ctx: AuditContext,
  mutate: (tx: TxClient) => Promise<T>,
  describe: (result: T) => AuditEntry | AuditEntry[],
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const result = await mutate(tx as TxClient)

    const described = describe(result)
    const entries = Array.isArray(described) ? described : [described]

    if (entries.length > 0) {
      await tx.auditLog.createMany({
        data: entries.map((entry) => ({
          actorUserId: ctx.actorUserId,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId,
          oldValue: (entry.oldValue === undefined
            ? undefined
            : redact(entry.oldValue)) as never,
          newValue: (entry.newValue === undefined
            ? undefined
            : redact(entry.newValue)) as never,
          ip: ctx.ip ?? null,
        })),
      })
    }

    return result
  })
}

/**
 * Records an event that is not itself a database mutation — a failed login,
 * a denied permission, an OTP send. Fire-and-forget: a logging failure must
 * never break the request it is describing.
 */
export async function auditEvent(ctx: AuditContext, entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: ctx.actorUserId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        oldValue: (entry.oldValue === undefined ? undefined : redact(entry.oldValue)) as never,
        newValue: (entry.newValue === undefined ? undefined : redact(entry.newValue)) as never,
        ip: ctx.ip ?? null,
      },
    })
  } catch (error) {
    console.error('[audit] failed to record event', entry.action, error)
  }
}
