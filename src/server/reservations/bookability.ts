import {
  AllocationType,
  ZoneVehicleClass,
  type UserType,
  type VehicleClass,
} from '@/generated/prisma/enums'

/**
 * Whether a zone can be booked, and if not, why.
 *
 * Pure so it can be tested without a database — this is the branchiest logic in
 * booking and the easiest place to get an off-by-one rule wrong. The reason
 * strings are shown to users, so the UI explains rather than just greying a row
 * out.
 */

export type BookabilityInput = {
  allocationType: AllocationType
  vehicleClass: ZoneVehicleClass
  /** Null means the zone is open to every user type. */
  entitledUserTypes: UserType[] | null
  eventActive: boolean
  userType: UserType
}

export type Bookability = { bookable: true } | { bookable: false; reason: string }

export function bookability(input: BookabilityInput): Bookability {
  // Capacity-only by design: bikes do not occupy discrete numbered slots, so
  // there is nothing to reserve.
  if (input.vehicleClass === ZoneVehicleClass.TWO_WHEELER) {
    return { bookable: false, reason: 'Two-wheeler parking is first come, first served.' }
  }

  // Fixed zones need enforcement, not booking — unless an event has
  // temporarily opened them, which is the one case that overrides assignment.
  if (input.allocationType === AllocationType.FIXED && !input.eventActive) {
    return { bookable: false, reason: 'Assigned parking — not bookable.' }
  }

  if (input.allocationType === AllocationType.EVENT && !input.eventActive) {
    return { bookable: false, reason: 'Open only during events.' }
  }

  // Entitlements are eligibility, not permission: absent means unrestricted.
  if (input.entitledUserTypes && !input.entitledUserTypes.includes(input.userType)) {
    return { bookable: false, reason: 'Not available to your role.' }
  }

  return { bookable: true }
}

/** A MIXED zone takes anything; otherwise the classes must match exactly. */
export function vehicleFitsZone(vehicle: VehicleClass, zone: ZoneVehicleClass): boolean {
  if (zone === ZoneVehicleClass.MIXED) return true
  return String(vehicle) === String(zone)
}
