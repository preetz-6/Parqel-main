import 'server-only'

import { prisma } from '@/lib/prisma'
import { ViolationStatus, type ViolationType } from '@/generated/prisma/enums'
import { audited, type AuditContext, type AuditEntry } from '../audit'
import { assertCan, type Actor } from '../permissions'
import { assertNotSelfDecided, assertVoidNotDelete } from '../rules'
import { raiseViolationAlert, severityFor } from '../notifications'
import { storeEvidence } from '../storage'
import { assertTransition } from './access'
import { readPlateFromEvidence } from './ocr'
import { normalisePlate } from './plate-match'

export class ViolationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ViolationError'
  }
}

/**
 * Reporting.
 *
 * The reporter supplies a plate but never learns who owns it — resolution
 * happens at triage, by someone authorized to see the registry. A reporter
 * who could type plates and read back owner names would have built a
 * lookup service, which is the thing this design exists to avoid.
 */
export async function createViolation(
  actor: Actor,
  input: {
    type: ViolationType
    zoneId: string
    spotId?: string | null
    plateEntered: string
    note?: string | null
    photo: File
  },
  ip?: string | null,
): Promise<{ id: string }> {
  assertCan(actor, 'violation:report', { zoneId: input.zoneId })

  const zone = await prisma.parkingZone.findUnique({
    where: { id: input.zoneId },
    select: { id: true },
  })
  if (!zone) throw new ViolationError('That parking zone no longer exists.')

  const plate = normalisePlate(input.plateEntered)
  if (plate.length < 4) throw new ViolationError('Enter the full number plate.')

  // Written outside the transaction: a stored file with no row is harmless
  // litter, a row pointing at a missing file is a broken evidence record.
  const evidence = await storeEvidence(input.photo)

  // A suggestion for the person who triages this, nothing more. Returns null
  // on every failure path, so an unreachable vendor cannot stop a report being
  // filed — and it never sets matchedVehicleId.
  const reading = await readPlateFromEvidence(evidence.key)

  const ctx: AuditContext = { actorUserId: actor.userId, ip }

  const violation = await audited(
    ctx,
    (tx) =>
      tx.violation.create({
        data: {
          type: input.type,
          status: ViolationStatus.SUBMITTED,
          reportedById: actor.userId,
          zoneId: input.zoneId,
          spotId: input.spotId ?? null,
          plateEntered: plate,
          ocrPlate: reading?.plate ?? null,
          ocrConfidence: reading?.confidence ?? null,
          imageOriginal: evidence.key,
          note: input.note?.trim() || null,
        },
      }),
    (created) => ({
      action: 'violation.report',
      entity: 'Violation',
      entityId: created.id,
      newValue: {
        type: created.type,
        plateEntered: created.plateEntered,
        zoneId: created.zoneId,
        ocrPlate: created.ocrPlate,
        ocrConfidence: created.ocrConfidence,
      },
    }),
  )

  return { id: violation.id }
}

async function loadForDecision(violationId: string) {
  const violation = await prisma.violation.findUnique({
    where: { id: violationId },
    select: {
      id: true,
      status: true,
      type: true,
      zoneId: true,
      reportedById: true,
      matchedVehicleId: true,
      zone: { select: { name: true } },
    },
  })
  if (!violation) throw new ViolationError('That report no longer exists.')
  return violation
}

/**
 * Triage: a guard confirms the report is real and, crucially, confirms *which*
 * registered vehicle it refers to. This is the human-in-the-loop step that
 * `matchedVehicleId` waits for.
 */
export async function triageViolation(
  actor: Actor,
  violationId: string,
  input: { matchedVehicleId: string | null; note?: string | null },
  ip?: string | null,
): Promise<void> {
  const violation = await loadForDecision(violationId)

  assertCan(actor, 'violation:triage', { zoneId: violation.zoneId })
  assertNotSelfDecided(actor, violation)
  assertTransition(violation.status, ViolationStatus.TRIAGED)

  if (input.matchedVehicleId) {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: input.matchedVehicleId },
      select: { id: true },
    })
    if (!vehicle) throw new ViolationError('That vehicle is not in the registry.')
  }

  const ctx: AuditContext = { actorUserId: actor.userId, ip }

  await audited(
    ctx,
    (tx) =>
      tx.violation.update({
        where: { id: violationId },
        data: {
          status: ViolationStatus.TRIAGED,
          matchedVehicleId: input.matchedVehicleId,
          triagedById: actor.userId,
          triagedAt: new Date(),
          note: input.note?.trim() || undefined,
        },
      }),
    (updated) => ({
      action: 'violation.triage',
      entity: 'Violation',
      entityId: updated.id,
      oldValue: { status: violation.status, matchedVehicleId: violation.matchedVehicleId },
      newValue: { status: updated.status, matchedVehicleId: updated.matchedVehicleId },
    }),
  )
}

/**
 * The decision. Approving is what notifies the owner, so it is the only place
 * a matched vehicle becomes mandatory — an approved violation with nobody to
 * tell is a dead record.
 */
export async function decideViolation(
  actor: Actor,
  violationId: string,
  decision: 'APPROVED' | 'REJECTED',
  ip?: string | null,
): Promise<{ alerted: boolean }> {
  const violation = await loadForDecision(violationId)

  assertCan(actor, 'violation:decide', { zoneId: violation.zoneId })
  assertNotSelfDecided(actor, violation)

  const target =
    decision === 'APPROVED' ? ViolationStatus.APPROVED : ViolationStatus.REJECTED
  assertTransition(violation.status, target)

  if (decision === 'APPROVED' && !violation.matchedVehicleId) {
    throw new ViolationError(
      'Confirm which registered vehicle this refers to before approving — there is nobody to notify otherwise.',
    )
  }

  const owner =
    decision === 'APPROVED' && violation.matchedVehicleId
      ? await prisma.vehicle.findUnique({
          where: { id: violation.matchedVehicleId },
          select: { id: true, userId: true },
        })
      : null

  if (decision === 'APPROVED' && !owner) {
    throw new ViolationError('The matched vehicle is no longer in the registry.')
  }

  const ctx: AuditContext = { actorUserId: actor.userId, ip }

  const result = await audited(
    ctx,
    async (tx) => {
      const updated = await tx.violation.update({
        where: { id: violationId },
        data: { status: target, decidedById: actor.userId, decidedAt: new Date() },
      })

      if (decision !== 'APPROVED' || !owner) return { updated, alertId: null as string | null }

      const alert = await raiseViolationAlert(tx, {
        violationId: updated.id,
        vehicleId: owner.id,
        ownerUserId: owner.userId,
        type: violation.type,
        zoneName: violation.zone.name,
        createdById: actor.userId,
      })

      return { updated, alertId: alert.alertId }
    },
    ({ updated, alertId }) => {
      const entries: AuditEntry[] = [
        {
          action: `violation.${decision.toLowerCase()}`,
          entity: 'Violation',
          entityId: updated.id,
          oldValue: { status: violation.status },
          newValue: { status: updated.status },
        },
      ]

      if (alertId) {
        entries.push({
          action: 'alert.raise',
          entity: 'Alert',
          entityId: alertId,
          newValue: { violationId: updated.id, severity: severityFor(violation.type) },
        })
      }

      return entries
    },
  )

  return { alerted: result.alertId !== null }
}

/** Violations are never deleted. */
export async function voidViolation(
  actor: Actor,
  violationId: string,
  reason: string,
  ip?: string | null,
): Promise<void> {
  const violation = await loadForDecision(violationId)

  assertCan(actor, 'violation:void', { zoneId: violation.zoneId })
  assertTransition(violation.status, ViolationStatus.VOIDED)
  const voidReason = assertVoidNotDelete(reason)

  const ctx: AuditContext = { actorUserId: actor.userId, ip }

  await audited(
    ctx,
    (tx) =>
      tx.violation.update({
        where: { id: violationId },
        data: { status: ViolationStatus.VOIDED, voidReason, decidedById: actor.userId },
      }),
    (updated) => ({
      action: 'violation.void',
      entity: 'Violation',
      entityId: updated.id,
      oldValue: { status: violation.status },
      newValue: { status: updated.status, voidReason },
    }),
  )
}
