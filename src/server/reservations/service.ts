import 'server-only'

import { prisma } from '@/lib/prisma'
import {
  AllocationType,
  CheckInMethod,
  ReservationStatus,
  SpotStatus,
  VehicleClass,
  VehicleStatus,
  ZoneVehicleClass,
} from '@/generated/prisma/enums'
import { audited, type AuditContext, type AuditEntry } from '../audit'
import { assertCan, type Actor } from '../permissions'
import { assertEntitled, entitlementMap } from '../entitlements'
import { bookability, vehicleFitsZone } from './bookability'

export class ReservationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReservationError'
  }
}

/**
 * Booking, holds and no-show release.
 *
 * Only SHARED and EVENT zones are bookable. Fixed zones need enforcement, not
 * booking — the problem there is somebody else in your slot, not allocation.
 * Two-wheeler zones are capacity-only and have no spots to reserve.
 */

/** How long a held slot waits for its booker before being released. */
const HOLD_MINUTES = Number(process.env.RESERVATION_HOLD_MINUTES ?? 10)

const LIVE_STATUSES = [ReservationStatus.HELD, ReservationStatus.CHECKED_IN]

/**
 * Releases holds whose grace period lapsed without a check-in.
 *
 * Swept lazily on read rather than by a scheduled job: a stale hold only
 * matters at the moment somebody asks what is free, so computing it then keeps
 * the system correct with no cron, no worker, and nothing to forget to deploy.
 * Returns how many were released.
 */
export async function releaseExpiredHolds(): Promise<number> {
  const { count } = await prisma.reservation.updateMany({
    where: { status: ReservationStatus.HELD, holdUntil: { lt: new Date() } },
    data: { status: ReservationStatus.RELEASED_NOSHOW },
  })
  return count
}

export type ZoneAvailability = {
  zoneId: string
  name: string
  building: string | null
  allocationType: AllocationType
  vehicleClass: ZoneVehicleClass
  capacity: number
  /** Spots free right now, or remaining capacity for two-wheeler zones. */
  free: number
  bookable: boolean
  /** Why it is not bookable, for the UI to explain rather than just grey out. */
  reason: string | null
}

/**
 * Live availability for every zone the actor can see.
 *
 * Sweeps expired holds first, so a slot abandoned by a no-show is free the
 * moment somebody looks for one.
 */
export async function zoneAvailability(actor: Actor): Promise<ZoneAvailability[]> {
  await releaseExpiredHolds()

  const now = new Date()

  const zones = await prisma.parkingZone.findMany({
    select: {
      id: true,
      name: true,
      building: true,
      allocationType: true,
      vehicleClass: true,
      capacity: true,
      _count: { select: { spots: { where: { status: { not: SpotStatus.BLOCKED } } } } },
      events: {
        where: { startTime: { lte: now }, endTime: { gte: now } },
        select: { id: true },
      },
    },
    orderBy: { name: 'asc' },
  })

  const [entitlements, liveReservations, openCheckIns] = await Promise.all([
    entitlementMap(zones.map((zone) => zone.id)),
    prisma.reservation.groupBy({
      by: ['zoneId'],
      where: { status: { in: LIVE_STATUSES }, endTime: { gte: now } },
      _count: { _all: true },
    }),
    // Walk-ins only. A check-in that came from a reservation is already
    // counted by the query above — counting both made one car occupy two
    // slots, so availability fell every time somebody arrived.
    prisma.checkIn.groupBy({
      by: ['zoneId'],
      where: { checkedOutAt: null, reservationId: null },
      _count: { _all: true },
    }),
  ])

  const reservedByZone = new Map(liveReservations.map((r) => [r.zoneId, r._count._all]))
  const occupiedByZone = new Map(openCheckIns.map((c) => [c.zoneId, c._count._all]))

  return zones.map((zone) => {
    const isTwoWheeler = zone.vehicleClass === ZoneVehicleClass.TWO_WHEELER
    // Two-wheeler zones have no spot rows by design — capacity is the truth.
    const total = isTwoWheeler ? zone.capacity : zone._count.spots
    const taken = (reservedByZone.get(zone.id) ?? 0) + (occupiedByZone.get(zone.id) ?? 0)

    const verdict = bookability({
      allocationType: zone.allocationType,
      vehicleClass: zone.vehicleClass,
      entitledUserTypes: entitlements.get(zone.id) ?? null,
      eventActive: zone.events.length > 0,
      userType: actor.userType,
    })

    const bookable = verdict.bookable
    const reason = verdict.bookable ? null : verdict.reason

    return {
      zoneId: zone.id,
      name: zone.name,
      building: zone.building,
      allocationType: zone.allocationType,
      vehicleClass: zone.vehicleClass,
      capacity: zone.capacity,
      free: Math.max(0, total - taken),
      bookable,
      reason,
    }
  })
}

export async function createReservation(
  actor: Actor,
  input: {
    zoneId: string
    vehicleId: string
    startTime: Date
    endTime: Date
    /** Booking for someone else, e.g. a guard helping a visitor. */
    onBehalfOfUserId?: string | null
  },
  ip?: string | null,
): Promise<{ id: string; spotCode: string; holdUntil: Date }> {
  const bookingForSelf = !input.onBehalfOfUserId || input.onBehalfOfUserId === actor.userId

  assertCan(actor, bookingForSelf ? 'reservation:create' : 'reservation:create:onBehalf', {
    zoneId: input.zoneId,
  })

  if (input.endTime <= input.startTime) {
    throw new ReservationError('The booking must end after it starts.')
  }

  await releaseExpiredHolds()

  const now = new Date()

  const zone = await prisma.parkingZone.findUnique({
    where: { id: input.zoneId },
    select: {
      id: true,
      name: true,
      allocationType: true,
      vehicleClass: true,
      events: {
        where: { startTime: { lte: input.endTime }, endTime: { gte: input.startTime } },
        select: { id: true },
      },
    },
  })

  if (!zone) throw new ReservationError('That zone no longer exists.')

  if (zone.vehicleClass === ZoneVehicleClass.TWO_WHEELER) {
    throw new ReservationError(
      'Two-wheeler parking is capacity-only and cannot be booked — just park in the shed.',
    )
  }

  const eventCovers = zone.events.length > 0

  if (zone.allocationType === AllocationType.FIXED && !eventCovers) {
    throw new ReservationError('That zone is assigned parking, not bookable.')
  }
  if (zone.allocationType === AllocationType.EVENT && !eventCovers) {
    throw new ReservationError('That zone is only open during an event.')
  }

  const holder = bookingForSelf
    ? { id: actor.userId, userType: actor.userType }
    : await prisma.user.findUnique({
        where: { id: input.onBehalfOfUserId! },
        select: { id: true, userType: true },
      })

  if (!holder) throw new ReservationError('That person is not on the roster.')

  await assertEntitled(zone, holder.userType)

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: input.vehicleId },
    select: { id: true, userId: true, vehicleClass: true, status: true, plateNumber: true },
  })

  if (!vehicle || vehicle.userId !== holder.id) {
    throw new ReservationError('That vehicle is not registered to you.')
  }
  if (vehicle.status !== VehicleStatus.APPROVED) {
    throw new ReservationError('That vehicle is still awaiting approval.')
  }
  if (!vehicleFitsZone(vehicle.vehicleClass, zone.vehicleClass)) {
    throw new ReservationError('That zone does not take that kind of vehicle.')
  }

  // One live booking per person at a time — hoarding slots is the failure mode
  // that makes shared pools useless.
  const existing = await prisma.reservation.findFirst({
    where: {
      userId: holder.id,
      status: { in: LIVE_STATUSES },
      endTime: { gte: now },
    },
    select: { id: true },
  })
  if (existing) {
    throw new ReservationError('You already have a booking. Cancel it before making another.')
  }

  const holdUntil = new Date(
    Math.max(input.startTime.getTime(), now.getTime()) + HOLD_MINUTES * 60_000,
  )

  const ctx: AuditContext = { actorUserId: actor.userId, ip }

  const reservation = await audited(
    ctx,
    async (tx) => {
      // Pick a free spot inside the transaction so two people booking the last
      // slot at once cannot both win.
      const taken = await tx.reservation.findMany({
        where: {
          zoneId: zone.id,
          status: { in: LIVE_STATUSES },
          startTime: { lt: input.endTime },
          endTime: { gt: input.startTime },
          spotId: { not: null },
        },
        select: { spotId: true },
      })

      const spot = await tx.parkingSpot.findFirst({
        where: {
          zoneId: zone.id,
          status: { not: SpotStatus.BLOCKED },
          id: { notIn: taken.map((t) => t.spotId!).filter(Boolean) },
        },
        orderBy: { code: 'asc' },
        select: { id: true, code: true },
      })

      if (!spot) throw new ReservationError('No spots left in that zone for those times.')

      const created = await tx.reservation.create({
        data: {
          userId: holder.id,
          vehicleId: vehicle.id,
          zoneId: zone.id,
          spotId: spot.id,
          eventId: eventCovers ? zone.events[0]!.id : null,
          startTime: input.startTime,
          endTime: input.endTime,
          holdUntil,
        },
      })

      return { created, spotCode: spot.code }
    },
    ({ created, spotCode }) => ({
      action: bookingForSelf ? 'reservation.create' : 'reservation.create.onBehalf',
      entity: 'Reservation',
      entityId: created.id,
      newValue: {
        zoneId: zone.id,
        spotCode,
        userId: holder.id,
        holdUntil: created.holdUntil,
      },
    }),
  )

  return {
    id: reservation.created.id,
    spotCode: reservation.spotCode,
    holdUntil: reservation.created.holdUntil,
  }
}

/** Arriving converts the hold into an occupancy, and stops the release sweep. */
export async function checkInReservation(
  actor: Actor,
  reservationId: string,
  method: CheckInMethod = CheckInMethod.MANUAL,
  ip?: string | null,
): Promise<void> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      userId: true,
      vehicleId: true,
      zoneId: true,
      spotId: true,
      status: true,
      holdUntil: true,
    },
  })

  if (!reservation) throw new ReservationError('That booking no longer exists.')
  if (reservation.userId !== actor.userId) {
    throw new ReservationError('That booking is not yours.')
  }

  if (reservation.status === ReservationStatus.CHECKED_IN) return

  if (reservation.status !== ReservationStatus.HELD) {
    throw new ReservationError(
      reservation.status === ReservationStatus.RELEASED_NOSHOW
        ? 'That booking was released because it was not claimed in time. Book again.'
        : 'That booking is no longer active.',
    )
  }

  if (reservation.holdUntil < new Date()) {
    // Caught here as well as in the sweep, so a stale page cannot claim a slot
    // that has already lapsed.
    await releaseExpiredHolds()
    throw new ReservationError('That booking was released because it was not claimed in time.')
  }

  await audited(
    { actorUserId: actor.userId, ip },
    async (tx) => {
      const updated = await tx.reservation.update({
        where: { id: reservation.id },
        data: { status: ReservationStatus.CHECKED_IN },
      })

      await tx.checkIn.create({
        data: {
          userId: reservation.userId,
          vehicleId: reservation.vehicleId,
          zoneId: reservation.zoneId,
          spotId: reservation.spotId,
          reservationId: reservation.id,
          method,
        },
      })

      return updated
    },
    (updated) =>
      [
        {
          action: 'reservation.checkIn',
          entity: 'Reservation',
          entityId: updated.id,
          oldValue: { status: ReservationStatus.HELD },
          newValue: { status: ReservationStatus.CHECKED_IN },
        },
      ] satisfies AuditEntry[],
  )
}

export async function cancelReservation(
  actor: Actor,
  reservationId: string,
  ip?: string | null,
): Promise<void> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: { id: true, userId: true, status: true, zoneId: true },
  })

  if (!reservation) throw new ReservationError('That booking no longer exists.')

  if (reservation.userId !== actor.userId) {
    assertCan(actor, 'reservation:cancel:any', { zoneId: reservation.zoneId })
  }

  if (!LIVE_STATUSES.includes(reservation.status as never)) return

  await audited(
    { actorUserId: actor.userId, ip },
    (tx) =>
      tx.reservation.update({
        where: { id: reservation.id },
        data: { status: ReservationStatus.CANCELLED },
      }),
    (updated) => ({
      action: 'reservation.cancel',
      entity: 'Reservation',
      entityId: updated.id,
      oldValue: { status: reservation.status },
      newValue: { status: ReservationStatus.CANCELLED },
    }),
  )
}

/**
 * Supervisor override: free a slot that is booked but visibly empty, or
 * occupied past its end time.
 */
export async function forceRelease(
  actor: Actor,
  reservationId: string,
  reason: string,
  ip?: string | null,
): Promise<void> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: { id: true, status: true, zoneId: true },
  })

  if (!reservation) throw new ReservationError('That booking no longer exists.')

  assertCan(actor, 'reservation:forceRelease', { zoneId: reservation.zoneId })

  const trimmed = reason.trim()
  if (trimmed.length < 5) {
    throw new ReservationError('Say why you are releasing this slot.')
  }

  await audited(
    { actorUserId: actor.userId, ip },
    async (tx) => {
      const updated = await tx.reservation.update({
        where: { id: reservation.id },
        data: { status: ReservationStatus.RELEASED_NOSHOW },
      })

      // Close any open check-in so occupancy does not stay stuck.
      await tx.checkIn.updateMany({
        where: { reservationId: reservation.id, checkedOutAt: null },
        data: { checkedOutAt: new Date() },
      })

      return updated
    },
    (updated) => ({
      action: 'reservation.forceRelease',
      entity: 'Reservation',
      entityId: updated.id,
      oldValue: { status: reservation.status },
      newValue: { status: ReservationStatus.RELEASED_NOSHOW, reason: trimmed },
    }),
  )
}
