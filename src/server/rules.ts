import { Role } from '@/generated/prisma/enums'
import type { Actor } from './permissions'
import { hasRole } from './permissions'

/**
 * Integrity rules that outrank the permission matrix.
 *
 * These exist because "has the permission" is not the same as "may do it in
 * this particular case". Holding `violation:decide` does not mean you may
 * decide a violation *you reported*. Each rule below closes an abuse path we
 * identified in design, and each is enforced here rather than left to the UI.
 */

export class IntegrityError extends Error {
  readonly rule: string

  constructor(rule: string, message: string) {
    super(message)
    this.name = 'IntegrityError'
    this.rule = rule
  }
}

/**
 * Rule 1 — a reporter can never approve, reject or triage their own report.
 *
 * This is the rule that makes the whole system safe to deploy in a workplace.
 * Without it, one colleague can file and self-approve reports against another,
 * which is exactly the harassment vector that sinks community-reporting apps.
 */
export function assertNotSelfDecided(
  actor: Actor,
  violation: { reportedById: string },
): void {
  if (violation.reportedById === actor.userId) {
    throw new IntegrityError(
      'reporter-is-not-decider',
      'You reported this violation, so you cannot triage or decide it. Route it to another reviewer.',
    )
  }
}

/**
 * Rule 2 — the appeal reviewer must differ from whoever decided the violation.
 *
 * In a small pilot with a single Parking Admin this forces the appeal up to an
 * Admin. That is the intended behaviour, not an edge case to work around: an
 * appeal reviewed by the original decider is not an appeal.
 */
export function assertImpartialAppealReviewer(
  actor: Actor,
  violation: { decidedById: string | null; reportedById: string },
): void {
  if (violation.decidedById && violation.decidedById === actor.userId) {
    throw new IntegrityError(
      'reviewer-is-not-decider',
      'You decided this violation, so you cannot review its appeal. Escalate to an administrator.',
    )
  }

  if (violation.reportedById === actor.userId) {
    throw new IntegrityError(
      'reviewer-is-not-reporter',
      'You reported this violation, so you cannot review its appeal.',
    )
  }
}

/**
 * Rule 3 — only ADMIN may grant or revoke roles.
 *
 * The permission matrix already withholds `role:assign` from PARKING_ADMIN;
 * this is the belt-and-braces check at the mutation site so that a future
 * widening of the matrix cannot silently hand out privilege escalation.
 */
export function assertMayAssignRoles(actor: Actor): void {
  if (!hasRole(actor, Role.ADMIN)) {
    throw new IntegrityError(
      'only-admin-assigns-roles',
      'Only an administrator may change role assignments.',
    )
  }
}

/**
 * Rule 3b — nobody may edit their own roles, including an ADMIN.
 *
 * Prevents a lone admin from quietly self-elevating without a second party in
 * the audit trail.
 */
export function assertNotSelfRoleChange(actor: Actor, targetUserId: string): void {
  if (actor.userId === targetUserId) {
    throw new IntegrityError(
      'no-self-role-change',
      'You cannot change your own roles. Ask another administrator.',
    )
  }
}

/**
 * Rule 4 — violations are never destroyed, only voided with a reason.
 *
 * Call this at any code path tempted to delete. The record stays; the reason
 * becomes part of the audit trail.
 */
export function assertVoidNotDelete(reason: string | null | undefined): string {
  const trimmed = reason?.trim()

  if (!trimmed || trimmed.length < 10) {
    throw new IntegrityError(
      'void-requires-reason',
      'Voiding a violation requires a written reason of at least 10 characters. Violations are never deleted.',
    )
  }

  return trimmed
}

/**
 * A vehicle may only be claimed once. Re-registration of an already-approved
 * plate has to go through an admin, because silently re-pointing a plate at a
 * new owner would reroute that vehicle's alerts to the wrong person — the
 * exact defect we found in the original prototype.
 */
export function assertPlateUnclaimed(
  existing: { userId: string; status: string } | null,
  requestingUserId: string,
): void {
  if (!existing) return
  if (existing.userId === requestingUserId) return

  throw new IntegrityError(
    'plate-already-claimed',
    'That plate is already registered to another user. An administrator must transfer it.',
  )
}
