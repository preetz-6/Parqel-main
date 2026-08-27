import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { requireActor } from '@/server/dal'
import { can } from '@/server/permissions'
import { VehicleStatus, ZoneVehicleClass } from '@/generated/prisma/enums'

export default async function AdminOverviewPage() {
  const actor = await requireActor()

  const [users, vehicles, pendingVehicles, zones, spots, bikeZones] = await Promise.all([
    prisma.user.count(),
    prisma.vehicle.count(),
    prisma.vehicle.count({ where: { status: VehicleStatus.PENDING } }),
    prisma.parkingZone.count(),
    prisma.parkingSpot.count(),
    prisma.parkingZone.count({ where: { vehicleClass: ZoneVehicleClass.TWO_WHEELER } }),
  ])

  const stats = [
    { label: 'People on roster', value: users },
    { label: 'Registered vehicles', value: vehicles },
    { label: 'Awaiting approval', value: pendingVehicles },
    { label: 'Zones', value: zones },
    { label: 'Numbered spots', value: spots },
    { label: 'Two-wheeler zones', value: bikeZones, hint: 'capacity-only' },
  ]

  const empty = users === 0 && zones === 0

  return (
    <main className="py-6">
      <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
        Parking administration
      </h1>

      {empty ? (
        <div className="mt-6 rounded-xl border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-700">
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            Nothing loaded yet. Start by importing the roster.
          </p>
          {can(actor, 'import:csv') && (
            <Link
              href="/admin/import"
              className="mt-4 inline-block rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
            >
              Import data
            </Link>
          )}
        </div>
      ) : (
        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
            >
              <dd className="text-2xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">
                {stat.value}
              </dd>
              <dt className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                {stat.label}
                {stat.hint && (
                  <span className="text-neutral-400 dark:text-neutral-500"> · {stat.hint}</span>
                )}
              </dt>
            </div>
          ))}
        </dl>
      )}

      <p className="mt-8 text-xs text-neutral-400 dark:text-neutral-500">
        Slot allocation, the violation queue and the audit viewer land next.
      </p>
    </main>
  )
}
