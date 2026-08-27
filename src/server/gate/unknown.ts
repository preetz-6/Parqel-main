import 'server-only'

import { prisma } from '@/lib/prisma'
import { audited, type AuditContext } from '../audit'
import { assertCan, type Actor } from '../permissions'
import { storeEvidence } from '../storage'
import { normalisePlate } from '../violations/plate-normalise'
import { findPlateCandidates } from '../violations/plate-match'

export class UnknownVehicleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnknownVehicleError'
  }
}

/**
 * Vehicles with no registered owner.
 *
 * The whole enforcement model assumes there is somebody to notify. Delivery
 * riders, contractors and parents at drop-off break that assumption, so these
 * get their own path: a logged sighting that routes to guard dispatch instead
 * of the alert pipeline, because there is no owner to alert.
 *
 * A plate seen repeatedly is the interesting signal — one delivery van is
 * noise, the same van every day is a conversation with facilities.
 */
export async function logUnknownVehicle(
  actor: Actor,
  input: { plate: string; zoneId: string; note?: string | null; photo?: File | null },
  ip?: string | null,
): Promise<{ id: string; matchedAfterAll: boolean }> {
  assertCan(actor, 'unknownVehicle:log', { zoneId: input.zoneId })

  const plate = normalisePlate(input.plate)
  if (plate.length < 4) throw new UnknownVehicleError('Enter the full number plate.')

  const zone = await prisma.parkingZone.findUnique({
    where: { id: input.zoneId },
    select: { id: true },
  })
  if (!zone) throw new UnknownVehicleError('That parking zone no longer exists.')

  // Check the registry before recording it as unknown — a typo at the gate
  // should not turn a registered vehicle into an "unknown" one.
  const candidates = await findPlateCandidates(plate, 1)
  const matchedAfterAll = candidates.some((candidate) => candidate.exact)

  const image = input.photo ? (await storeEvidence(input.photo)).key : null

  const logged = await audited(
    { actorUserId: actor.userId, ip } satisfies AuditContext,
    (tx) =>
      tx.unknownVehicleLog.create({
        data: {
          plate,
          zoneId: input.zoneId,
          loggedById: actor.userId,
          note: input.note?.trim() || null,
          image,
        },
      }),
    (created) => ({
      action: 'unknownVehicle.log',
      entity: 'UnknownVehicleLog',
      entityId: created.id,
      newValue: { plate: created.plate, zoneId: created.zoneId },
    }),
  )

  return { id: logged.id, matchedAfterAll }
}

export type UnknownSighting = {
  plate: string
  sightings: number
  lastSeen: Date
  zones: string[]
}

/** Grouped by plate so repeat offenders surface without reading a log. */
export async function recentUnknownVehicles(
  zoneIds: string[] | null,
  limit = 50,
): Promise<UnknownSighting[]> {
  const logs = await prisma.unknownVehicleLog.findMany({
    where: zoneIds === null ? {} : { zoneId: { in: zoneIds } },
    select: {
      plate: true,
      createdAt: true,
      zone: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })

  const byPlate = new Map<string, UnknownSighting>()

  for (const log of logs) {
    const existing = byPlate.get(log.plate)
    if (existing) {
      existing.sightings++
      if (!existing.zones.includes(log.zone.name)) existing.zones.push(log.zone.name)
      continue
    }
    byPlate.set(log.plate, {
      plate: log.plate,
      sightings: 1,
      lastSeen: log.createdAt,
      zones: [log.zone.name],
    })
  }

  return [...byPlate.values()]
    .sort((a, b) => b.sightings - a.sightings || b.lastSeen.getTime() - a.lastSeen.getTime())
    .slice(0, limit)
}
