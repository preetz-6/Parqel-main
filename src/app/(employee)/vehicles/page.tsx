import { prisma } from '@/lib/prisma'
import { requireActor } from '@/server/dal'
import { VehicleStatus } from '@/generated/prisma/enums'
import { AddVehicleForm } from './add-vehicle-form'

export default async function MyVehiclesPage() {
  const actor = await requireActor()

  const vehicles = await prisma.vehicle.findMany({
    where: { userId: actor.userId },
    select: {
      id: true,
      plateNumber: true,
      vehicleClass: true,
      makeModel: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  const STATUS_STYLES: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    APPROVED: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
    REJECTED: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  }

  return (
    <>
      <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
        My vehicles
      </h1>

      {/* ── Add new vehicle ─────────────────────────────────────── */}
      <section className="mt-6">
        <h2 className="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Add a vehicle
        </h2>
        <AddVehicleForm />
      </section>

      {/* ── My vehicles list ────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Registered vehicles
        </h2>
        {vehicles.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-400 dark:border-neutral-700">
            You have not registered any vehicles yet.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {vehicles.map((vehicle) => (
              <li
                key={vehicle.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {vehicle.plateNumber}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${STATUS_STYLES[vehicle.status] ?? ''}`}
                    >
                      {vehicle.status === VehicleStatus.APPROVED
                        ? 'Approved'
                        : vehicle.status === VehicleStatus.REJECTED
                          ? 'Rejected'
                          : 'Pending approval'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                    {vehicle.vehicleClass === 'TWO_WHEELER' ? '2-wheeler' : '4-wheeler'}
                    {vehicle.makeModel ? ` · ${vehicle.makeModel}` : ''}
                  </p>
                </div>
                <time
                  dateTime={vehicle.createdAt.toISOString()}
                  className="shrink-0 text-xs text-neutral-400"
                >
                  {vehicle.createdAt.toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
