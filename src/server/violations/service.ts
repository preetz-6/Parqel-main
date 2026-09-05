import 'server-only'

import { prisma } from '@/lib/prisma'
import { ViolationStatus, type ViolationType } from '@/generated/prisma/enums'
import { audited, type AuditContext, type AuditEntry } from '../audit'
import { assertCan, can, ForbiddenError, type Actor } from '../permissions'
import { assertNotSelfDecided, assertVoidNotDelete } from '../rules'
import { raiseViolationAlert, severityFor } from '../notifications'
import { storeEvidence } from '../storage'
import { assertTransition } from './access'
import { readPlateFromEvidence } from './ocr'
import { normalisePlate, isValidPlateFormat } from './plate-match'

export class ViolationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ViolationError'
  }
}

/**
 * Reporting.
 *
 * The reporter supplies a plate but never learns who owns it â€” resolution
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
    latitude?: number | null
    longitude?: number | null
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
  if (!isValidPlateFormat(plate)) {
    throw new ViolationError('Enter a valid registration number plate format (e.g. KA05MN1234).')
  }

  // Written outside the transaction: a stored file with no row is harmless
  // litter, a row pointing at a missing file is a broken evidence record.
  const evidence = await storeEvidence(input.photo)

  // A suggestion for the person who triages this, nothing more. Returns null
  // on every failure path, so an unreachable vendor cannot stop a report being
  // filed â€” and it never sets matchedVehicleId.
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
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
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
      triagedAt: true,
      plateEntered: true,
      imageOriginal: true,
      note: true,
      zone: { select: { name: true } },
    },
  })
  if (!violation) throw new ViolationError('That report no longer exists.')
  return violation
}

/**
 * Triage: a guard confirms the report is real and, crucially, confirms *which*
 * registered vehicle it refers to. This notifies the owner and starts the buffer timer.
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

  const owner = input.matchedVehicleId
    ? await prisma.vehicle.findUnique({
        where: { id: input.matchedVehicleId },
        select: { id: true, userId: true },
      })
    : null

  if (input.matchedVehicleId && !owner) {
    throw new ViolationError('That vehicle is not in the registry.')
  }

  const ctx: AuditContext = { actorUserId: actor.userId, ip }

  await audited(
    ctx,
    async (tx) => {
      const updated = await tx.violation.update({
        where: { id: violationId },
        data: {
          status: ViolationStatus.TRIAGED,
          matchedVehicleId: input.matchedVehicleId,
          triagedById: actor.userId,
          triagedAt: new Date(),
          note: input.note?.trim() || undefined,
        },
      })

      let alertId: string | null = null
      if (owner) {
        const alert = await raiseViolationAlert(tx, {
          violationId: updated.id,
          vehicleId: owner.id,
          ownerUserId: owner.userId,
          type: violation.type,
          zoneName: violation.zone.name,
          createdById: actor.userId,
        })
        alertId = alert.alertId
      }

      return { updated, alertId }
    },
    ({ updated, alertId }) => {
      const entries: AuditEntry[] = [
        {
          action: 'violation.triage',
          entity: 'Violation',
          entityId: updated.id,
          oldValue: { status: violation.status, matchedVehicleId: violation.matchedVehicleId },
          newValue: { status: updated.status, matchedVehicleId: updated.matchedVehicleId },
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
}



/**
 * Unregistered vehicle resolution on site.
 *
 * When no matched registered vehicle exists, the report bypasses owner notification
 * and buffer timers. Guard creates a standalone UnknownVehicleLog entry and closes
 * the violation as VOIDED.
 */
export async function logUnregisteredViolation(
  actor: Actor,
  violationId: string,
  note?: string | null,
  ip?: string | null,
): Promise<{ unknownLogId: string }> {
  const violation = await loadForDecision(violationId)

  assertCan(actor, 'violation:triage', { zoneId: violation.zoneId })
  assertCan(actor, 'unknownVehicle:log', { zoneId: violation.zoneId })
  assertNotSelfDecided(actor, violation)

  const ctx: AuditContext = { actorUserId: actor.userId, ip }

  const result = await audited(
    ctx,
    async (tx) => {
      const unknownLog = await tx.unknownVehicleLog.create({
        data: {
          plate: violation.plateEntered ?? 'UNKNOWN',
          zoneId: violation.zoneId,
          loggedById: actor.userId,
          note: note?.trim() || `Logged from violation report on-site (${violation.type})`,
          image: violation.imageOriginal,
        },
      })

      const updated = await tx.violation.update({
        where: { id: violationId },
        data: {
          status: ViolationStatus.VOIDED,
          voidReason: 'Logged as unregistered/unknown vehicle on-site',
          decidedById: actor.userId,
          decidedAt: new Date(),
        },
      })

      return { unknownLog, updated }
    },
    ({ unknownLog, updated }) => [
      {
        action: 'unknownVehicle.log',
        entity: 'UnknownVehicleLog',
        entityId: unknownLog.id,
        newValue: { plate: unknownLog.plate, zoneId: unknownLog.zoneId },
      },
      {
        action: 'violation.void',
        entity: 'Violation',
        entityId: updated.id,
        oldValue: { status: violation.status },
        newValue: { status: updated.status, voidReason: 'Logged as unregistered vehicle' },
      },
    ],
  )

  return { unknownLogId: result.unknownLog.id }
}

/**
 * The decision. Approving is what formalizes the violation and closes supervisor review.
 * Dismissing (REJECTED) can be done by a supervisor or a triage guard for false reports.
 */
export async function decideViolation(
  actor: Actor,
  violationId: string,
  decision: 'APPROVED' | 'REJECTED',
  options?: { matchedVehicleId?: string | null; note?: string | null },
  ip?: string | null,
): Promise<{ alerted: boolean }> {
  const violation = await loadForDecision(violationId)

  if (decision === 'APPROVED') {
    assertCan(actor, 'violation:decide', { zoneId: violation.zoneId })
  } else {
    // Dismissing false/mistaken reports is allowed for triagers or deciders
    if (
      !can(actor, 'violation:decide', { zoneId: violation.zoneId }) &&
      !can(actor, 'violation:triage', { zoneId: violation.zoneId })
    ) {
      throw new ForbiddenError('violation:triage', violation.zoneId)
    }
  }

  assertNotSelfDecided(actor, violation)

  const target =
    decision === 'APPROVED' ? ViolationStatus.APPROVED : ViolationStatus.REJECTED
  assertTransition(violation.status, target)

  const matchedVehicleId = options?.matchedVehicleId ?? violation.matchedVehicleId

  if (decision === 'APPROVED' && !matchedVehicleId) {
    throw new ViolationError(
      'Confirm which registered vehicle this refers to before approving — there is nobody to notify otherwise.',
    )
  }

  const owner =
    decision === 'APPROVED' && matchedVehicleId
      ? await prisma.vehicle.findUnique({
          where: { id: matchedVehicleId },
          select: { id: true, userId: true },
        })
      : null

  if (decision === 'APPROVED' && !owner) {
    throw new ViolationError('The matched vehicle is not in the registry.')
  }

  const ctx: AuditContext = { actorUserId: actor.userId, ip }

  const result = await audited(
    ctx,
    async (tx) => {
      const updated = await tx.violation.update({
        where: { id: violationId },
        data: {
          status: target,
          decidedById: actor.userId,
          decidedAt: new Date(),
          ...(matchedVehicleId ? { matchedVehicleId } : {}),
          ...(options?.note ? { note: options.note.trim() } : {}),
        },
      })

      // If already alerted at triage, check existing alert
      const existingAlert = await tx.alert.findFirst({
        where: { violationId: updated.id },
        select: { id: true },
      })

      if (decision !== 'APPROVED' || !owner || existingAlert) {
        return { updated, alertId: null as string | null }
      }

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