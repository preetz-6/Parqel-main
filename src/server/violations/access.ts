import 'server-only'

import { ViolationStatus } from '@/generated/prisma/enums'
import { can, type Actor } from '../permissions'

/**
 * Who may see a violation and its evidence photo.
 *
 * The subtle case is the accused. Before a human has confirmed the plate
 * match, `matchedVehicleId` is a *guess* â€” showing the photo to whoever owns
 * the guessed plate would leak someone else's evidence to an uninvolved
 * person on the strength of a typo. So the owner gains access only once the
 * violation is approved, which is also the moment they are notified and
 * therefore the first moment they need it to respond or appeal.
 */

export type ViewableViolation = {
  reportedById: string
  zoneId: string
  status: ViolationStatus
  matchedVehicle: { userId: string } | null
}

export function canViewViolation(actor: Actor, violation: ViewableViolation): boolean {
  // You can always see what you reported.
  if (violation.reportedById === actor.userId) return true

  // Guards, supervisors and parking admins â€” subject to zone scope.
  if (can(actor, 'violation:read:any', { zoneId: violation.zoneId })) return true

  // The accused, once the match has been confirmed by a human.
  const decided =
    violation.status === ViolationStatus.APPROVED ||
    violation.status === ViolationStatus.WARNED ||
    violation.status === ViolationStatus.VOIDED
  if (decided && violation.matchedVehicle?.userId === actor.userId) return true

  return false
}

/** Statuses a violation may move to from its current one. */
const TRANSITIONS: Record<ViolationStatus, ViolationStatus[]> = {
  SUBMITTED: [ViolationStatus.APPROVED, ViolationStatus.REJECTED, ViolationStatus.VOIDED, ViolationStatus.TRIAGED],
  TRIAGED: [ViolationStatus.APPROVED, ViolationStatus.REJECTED, ViolationStatus.VOIDED, ViolationStatus.WARNED],
  WARNED: [ViolationStatus.VOIDED],
  APPROVED: [ViolationStatus.VOIDED],
  REJECTED: [ViolationStatus.VOIDED],
  VOIDED: [],
}

export function canTransition(from: ViolationStatus, to: ViolationStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

export class TransitionError extends Error {
  constructor(from: ViolationStatus, to: ViolationStatus) {
    super(`A ${from.toLowerCase()} violation cannot become ${to.toLowerCase()}.`)
    this.name = 'TransitionError'
  }
}

export function assertTransition(from: ViolationStatus, to: ViolationStatus): void {
  if (!canTransition(from, to)) throw new TransitionError(from, to)
}
