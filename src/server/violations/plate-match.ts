import 'server-only'

import { prisma } from '@/lib/prisma'
import { VehicleStatus } from '@/generated/prisma/enums'
import {
  MAX_NEAR_MATCH_DISTANCE,
  canonicalPlate,
  editDistance,
  nearMatchConfidence,
  normalisePlate,
  isValidPlateFormat,
} from './plate-normalise'

export { normalisePlate, isValidPlateFormat }

/**
 * Plate resolution against the organisation's own registry.
 *
 * The whole reason this is tractable: we are not reading arbitrary plates from
 * the open world, we are picking from a few hundred known ones. A near-miss
 * against a registered plate is far more likely to be a typo or a misread
 * character than a genuine unknown vehicle, so we surface candidates and let a
 * human confirm. Comparison logic lives in ./plate-normalise so it is testable
 * without a database.
 */

export type PlateCandidate = {
  vehicleId: string
  plateNumber: string
  ownerName: string
  ownerEmployeeId: string
  vehicleClass: string
  /** 1 for an exact match, at most 0.95 for anything else. */
  confidence: number
  exact: boolean
}

/**
 * Returns candidates best-first. An exact hit returns exactly one candidate;
 * otherwise up to `limit` near misses ordered by confidence.
 */
export async function findPlateCandidates(rawPlate: string, limit = 5): Promise<PlateCandidate[]> {
  const plate = normalisePlate(rawPlate)
  if (plate.length < 4) return []

  const vehicles = await prisma.vehicle.findMany({
    where: { status: VehicleStatus.APPROVED },
    select: {
      id: true,
      plateNumber: true,
      vehicleClass: true,
      owner: { select: { name: true, employeeId: true } },
    },
  })

  const exact = vehicles.find((v) => normalisePlate(v.plateNumber) === plate)
  if (exact) {
    return [
      {
        vehicleId: exact.id,
        plateNumber: exact.plateNumber,
        ownerName: exact.owner.name,
        ownerEmployeeId: exact.owner.employeeId,
        vehicleClass: exact.vehicleClass,
        confidence: 1,
        exact: true,
      },
    ]
  }

  const target = canonicalPlate(plate)

  return vehicles
    .map((vehicle) => ({
      vehicle,
      edits: editDistance(target, canonicalPlate(normalisePlate(vehicle.plateNumber))),
    }))
    // edits === 0 here means the plates differ *only* by confusable glyphs
    // (KAO3 vs KA03). That is the strongest possible near match, not a
    // duplicate of the exact case — the exact case already returned above.
    .filter(({ edits }) => edits <= MAX_NEAR_MATCH_DISTANCE)
    .sort((a, b) => a.edits - b.edits)
    .slice(0, limit)
    .map(({ vehicle, edits }) => ({
      vehicleId: vehicle.id,
      plateNumber: vehicle.plateNumber,
      ownerName: vehicle.owner.name,
      ownerEmployeeId: vehicle.owner.employeeId,
      vehicleClass: vehicle.vehicleClass,
      confidence: nearMatchConfidence(edits),
      exact: false,
    }))
}
