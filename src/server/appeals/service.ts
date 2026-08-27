import 'server-only'

import { prisma } from '@/lib/prisma'
import { AppealDecision, ViolationStatus } from '@/generated/prisma/enums'
import { audited, type AuditContext, type AuditEntry } from '../audit'
import { assertCan, type Actor } from '../permissions'
import { assertImpartialAppealReviewer } from '../rules'

export class AppealError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AppealError'
  }
}

/**
 * Deciding an appeal.
 *
 * `UPHELD` means the *violation* stands. `OVERTURNED` means the appellant won,
 * and the violation stops standing — it is voided with a reason rather than
 * deleted, so the record of both the original report and its reversal
 * survives. That trail is the point: an overturned violation is evidence the
 * process works, not something to erase.
 *
 * Integrity rule 2 is enforced here and nowhere else, so this function is the
 * only path by which an appeal may be decided.
 */
export async function reviewAppeal(
  actor: Actor,
  appealId: string,
  input: { decision: 'UPHELD' | 'OVERTURNED'; note?: string | null },
  ip?: string | null,
): Promise<void> {
  assertCan(actor, 'appeal:review')

  const appeal = await prisma.appeal.findUnique({
    where: { id: appealId },
    select: {
      id: true,
      decision: true,
      violationId: true,
      userId: true,
      violation: {
        select: {
          id: true,
          status: true,
          decidedById: true,
          reportedById: true,
        },
      },
    },
  })

  if (!appeal) throw new AppealError('That appeal no longer exists.')

  if (appeal.decision !== AppealDecision.PENDING) {
    throw new AppealError('That appeal has already been decided.')
  }

  // An appeal reviewed by the person who made the original decision is not an
  // appeal. With one Parking Admin this deliberately escalates to an Admin.
  assertImpartialAppealReviewer(actor, appeal.violation)

  // The appellant reviewing their own appeal is the obvious remaining case.
  if (appeal.userId === actor.userId) {
    throw new AppealError('You cannot review your own appeal.')
  }

  const decision =
    input.decision === 'UPHELD' ? AppealDecision.UPHELD : AppealDecision.OVERTURNED

  const ctx: AuditContext = { actorUserId: actor.userId, ip }

  await audited(
    ctx,
    async (tx) => {
      const updated = await tx.appeal.update({
        where: { id: appeal.id },
        data: {
          decision,
          reviewedById: actor.userId,
          decidedAt: new Date(),
          reviewNote: input.note?.trim() || null,
        },
      })

      if (decision !== AppealDecision.OVERTURNED) {
        return { updated, voided: false }
      }

      // Only void a violation that is actually standing.
      if (appeal.violation.status !== ViolationStatus.APPROVED) {
        return { updated, voided: false }
      }

      await tx.violation.update({
        where: { id: appeal.violationId },
        data: {
          status: ViolationStatus.VOIDED,
          voidReason: `Overturned on appeal by ${actor.employeeId}${
            input.note?.trim() ? `: ${input.note.trim()}` : ''
          }`,
        },
      })

      return { updated, voided: true }
    },
    ({ updated, voided }) => {
      const entries: AuditEntry[] = [
        {
          action: `appeal.${decision.toLowerCase()}`,
          entity: 'Appeal',
          entityId: updated.id,
          oldValue: { decision: AppealDecision.PENDING },
          newValue: { decision, violationId: appeal.violationId },
        },
      ]

      if (voided) {
        entries.push({
          action: 'violation.void',
          entity: 'Violation',
          entityId: appeal.violationId,
          oldValue: { status: ViolationStatus.APPROVED },
          newValue: { status: ViolationStatus.VOIDED, reason: 'overturned on appeal' },
        })
      }

      return entries
    },
  )
}
