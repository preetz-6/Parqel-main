import 'server-only'

import { randomInt } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { PassStatus, VehicleClass } from '@/generated/prisma/enums'
import { audited, type AuditContext } from '../audit'
import { assertCan, holdsPermission, type Actor } from '../permissions'
import { normalisePlate } from '../violations/plate-normalise'

export class PassError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PassError'
  }
}

/**
 * Visitor passes.
 *
 * Visitors deliberately have no account — a visitor is a pass, not a user.
 * Keeping them out of the identity model means a guest never becomes a row
 * that has to be deprovisioned, and the roster stays exactly the set of people
 * the organisation actually employs.
 */

/** No I, L, O, 0, 1 — codes get read aloud at a gate and copied off a screen. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 8

/**
 * Rolling quota for plain employees. Unlimited invites are an abuse channel;
 * zero makes the feature useless. Guards and above are not limited — issuing
 * passes is their job.
 */
const EMPLOYEE_QUOTA = Number(process.env.VISITOR_PASS_WEEKLY_QUOTA ?? 5)
const QUOTA_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

const MAX_VALIDITY_MS = 14 * 24 * 60 * 60 * 1000

function generateCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)]
  }
  return code
}

/** Only plain employees are quota-limited. */
function isQuotaLimited(actor: Actor): boolean {
  // Any role that holds 'pass:revoke:any' is staff-level and exempt from quotas.
  return !holdsPermission(actor, 'pass:revoke:any')
}

export async function remainingQuota(actor: Actor): Promise<number | null> {
  if (!isQuotaLimited(actor)) return null

  const used = await prisma.visitorPass.count({
    where: {
      issuedById: actor.userId,
      createdAt: { gte: new Date(Date.now() - QUOTA_WINDOW_MS) },
      status: { not: PassStatus.REVOKED },
    },
  })

  return Math.max(0, EMPLOYEE_QUOTA - used)
}

export async function issuePass(
  actor: Actor,
  input: {
    visitorName: string
    plate: string
    vehicleClass: VehicleClass
    zoneId?: string | null
    validFrom: Date
    validTo: Date
    hostUserId?: string | null
  },
  ip?: string | null,
): Promise<{ id: string; code: string }> {
  assertCan(actor, 'pass:issue', input.zoneId ? { zoneId: input.zoneId } : {})

  if (input.validTo <= input.validFrom) {
    throw new PassError('The pass must expire after it starts.')
  }

  if (input.validTo.getTime() - input.validFrom.getTime() > MAX_VALIDITY_MS) {
    throw new PassError('Passes cannot be valid for more than 14 days.')
  }

  const plate = normalisePlate(input.plate)
  if (plate.length < 4) throw new PassError('Enter the full number plate.')

  const remaining = await remainingQuota(actor)
  if (remaining !== null && remaining <= 0) {
    throw new PassError(
      `You have used all ${EMPLOYEE_QUOTA} visitor passes for this week. Ask security to issue one.`,
    )
  }

  // A guard issuing on someone's behalf names the host; otherwise the issuer
  // is the host. Either way a pass always has a person accountable for it.
  const hostUserId = input.hostUserId ?? actor.userId

  if (hostUserId !== actor.userId) {
    const host = await prisma.user.findUnique({
      where: { id: hostUserId },
      select: { id: true },
    })
    if (!host) throw new PassError('That host is not on the roster.')
  }

  const ctx: AuditContext = { actorUserId: actor.userId, ip }

  const pass = await audited(
    ctx,
    async (tx) => {
      // Codes are short enough that a collision is possible, if unlikely.
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateCode()
        const clash = await tx.visitorPass.findUnique({ where: { code }, select: { id: true } })
        if (clash) continue

        return tx.visitorPass.create({
          data: {
            code,
            issuedById: actor.userId,
            hostUserId,
            visitorName: input.visitorName.trim(),
            plate,
            vehicleClass: input.vehicleClass,
            zoneId: input.zoneId ?? null,
            validFrom: input.validFrom,
            validTo: input.validTo,
          },
        })
      }
      throw new PassError('Could not allocate a pass code. Try again.')
    },
    (created) => ({
      action: 'pass.issue',
      entity: 'VisitorPass',
      entityId: created.id,
      newValue: { plate: created.plate, validTo: created.validTo, hostUserId },
    }),
  )

  return { id: pass.id, code: pass.code }
}

export type ScanVerdict = {
  valid: boolean
  reason: 'ok' | 'not_found' | 'revoked' | 'expired' | 'not_yet_valid'
  pass?: {
    id: string
    code: string
    visitorName: string
    plate: string
    vehicleClass: VehicleClass
    validFrom: Date
    validTo: Date
    zoneName: string | null
    hostName: string
    hostEmployeeId: string
    previouslyScannedAt: Date | null
  }
}

/**
 * Gate check.
 *
 * A second scan is reported rather than refused — a visitor leaving and
 * re-entering is normal, and a guard needs the fact ("first seen 09:14"), not
 * a door slammed on a legitimate guest.
 */
export async function scanPass(actor: Actor, rawCode: string, ip?: string | null): Promise<ScanVerdict> {
  assertCan(actor, 'pass:scan')

  const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')

  const pass = await prisma.visitorPass.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      visitorName: true,
      plate: true,
      vehicleClass: true,
      validFrom: true,
      validTo: true,
      status: true,
      scannedAt: true,
      zone: { select: { name: true } },
      hostUser: { select: { name: true, employeeId: true } },
    },
  })

  if (!pass) return { valid: false, reason: 'not_found' }

  const details = {
    id: pass.id,
    code: pass.code,
    visitorName: pass.visitorName,
    plate: pass.plate,
    vehicleClass: pass.vehicleClass,
    validFrom: pass.validFrom,
    validTo: pass.validTo,
    zoneName: pass.zone?.name ?? null,
    hostName: pass.hostUser.name,
    hostEmployeeId: pass.hostUser.employeeId,
    previouslyScannedAt: pass.scannedAt,
  }

  const now = new Date()

  if (pass.status === PassStatus.REVOKED) {
    return { valid: false, reason: 'revoked', pass: details }
  }
  if (now < pass.validFrom) {
    return { valid: false, reason: 'not_yet_valid', pass: details }
  }
  if (now > pass.validTo) {
    return { valid: false, reason: 'expired', pass: details }
  }

  await audited(
    { actorUserId: actor.userId, ip },
    (tx) =>
      tx.visitorPass.update({
        where: { id: pass.id },
        data: {
          status: PassStatus.USED,
          // First scan wins, so "when did they arrive" stays answerable.
          scannedAt: pass.scannedAt ?? now,
          scannedById: pass.scannedAt ? undefined : actor.userId,
        },
      }),
    (updated) => ({
      action: pass.scannedAt ? 'pass.rescan' : 'pass.scan',
      entity: 'VisitorPass',
      entityId: updated.id,
      newValue: { plate: updated.plate },
    }),
  )

  return { valid: true, reason: 'ok', pass: details }
}

export async function revokePass(actor: Actor, passId: string, ip?: string | null): Promise<void> {
  const pass = await prisma.visitorPass.findUnique({
    where: { id: passId },
    select: { id: true, status: true, issuedById: true, hostUserId: true, zoneId: true },
  })

  if (!pass) throw new PassError('That pass no longer exists.')

  // You may always revoke a pass you issued or host; revoking anyone else's
  // needs the explicit permission.
  const isOwn = pass.issuedById === actor.userId || pass.hostUserId === actor.userId
  if (!isOwn) {
    assertCan(actor, 'pass:revoke:any', pass.zoneId ? { zoneId: pass.zoneId } : {})
  }

  if (pass.status === PassStatus.REVOKED) return

  await audited(
    { actorUserId: actor.userId, ip },
    (tx) =>
      tx.visitorPass.update({
        where: { id: pass.id },
        data: { status: PassStatus.REVOKED },
      }),
    (updated) => ({
      action: 'pass.revoke',
      entity: 'VisitorPass',
      entityId: updated.id,
      oldValue: { status: pass.status },
      newValue: { status: PassStatus.REVOKED },
    }),
  )
}
