import { prisma } from '@/lib/prisma'
import { requireActor } from '@/server/dal'
import { ReservationStatus, VehicleStatus } from '@/generated/prisma/enums'
import { zoneAvailability } from '@/server/reservations/service'
import { PageHeader } from '@/components/page-header'
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
    <main className="mx-auto w-full max-w-2xl p-6">
      <PageHeader
        title="Parking"
        subtitle="Live availability. Booking applies to shared and event zones only."
        employeeId={actor.employeeId}
      />

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
    </main>
  )
}
