import { prisma } from '@/lib/prisma'
import { requireActor } from '@/server/dal'
import { ReservationStatus, VehicleStatus } from '@/generated/prisma/enums'
import { zoneAvailability } from '@/server/reservations/service'
import { BookingPanel } from './booking-panel'

export default async function ParkingPage() {
  const actor = await requireActor()

  // zoneAvailability sweeps expired holds first, so what is shown is current.
  const zones = await zoneAvailability(actor)

  const [vehicles, booking] = await Promise.all([
    prisma.vehicle.findMany({
      where: { userId: actor.userId, status: VehicleStatus.APPROVED },
      select: { id: true, plateNumber: true, vehicleClass: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.reservation.findFirst({
      where: {
        userId: actor.userId,
        status: { in: [ReservationStatus.HELD, ReservationStatus.CHECKED_IN] },
        endTime: { gte: new Date() },
      },
      select: {
        id: true,
        status: true,
        startTime: true,
        endTime: true,
        holdUntil: true,
        zone: { select: { name: true } },
        spot: { select: { code: true } },
        vehicle: { select: { plateNumber: true } },
      },
    }),
  ])

  return (
    <>
      <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
        Parking
      </h1>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Live availability. Booking applies to shared and event zones only.
      </p>

      <BookingPanel
        zones={zones}
        vehicles={vehicles}
        booking={
          booking && {
            id: booking.id,
            status: booking.status,
            startTime: booking.startTime.toISOString(),
            endTime: booking.endTime.toISOString(),
            holdUntil: booking.holdUntil.toISOString(),
            zoneName: booking.zone.name,
            spotCode: booking.spot?.code ?? null,
            plateNumber: booking.vehicle.plateNumber,
          }
        }
      />
    </>
  )
}
