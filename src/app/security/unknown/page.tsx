import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireActor } from '@/server/dal'
import { can, holdsPermission, scopedZoneIds } from '@/server/permissions'
import { recentUnknownVehicles } from '@/server/gate/unknown'
import { LogUnknownForm } from './log-form'

export default async function UnknownVehiclesPage() {
  const actor = await requireActor()
  if (!holdsPermission(actor, 'unknownVehicle:log')) redirect('/')

  const scope = scopedZoneIds(actor)

  const [zones, sightings] = await Promise.all([
    prisma.parkingZone.findMany({
      where: scope === null ? {} : { id: { in: scope } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    recentUnknownVehicles(scope),
  ])

  const loggable = zones.filter((zone) =>
    can(actor, 'unknownVehicle:log', { zoneId: zone.id }),
  )

  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-neutral-200 pb-4 dark:border-neutral-800">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            Unknown vehicles
          </h1>
          <p className="mt-0.5 max-w-prose text-sm text-neutral-500 dark:text-neutral-400">
            Plates with no registered owner. There is nobody to notify, so these
            are logged for security to follow up rather than alerted on.
          </p>
        </div>
        <Link
          href="/security"
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          Queue
        </Link>
      </header>

      {loggable.length > 0 && <LogUnknownForm zones={loggable} />}

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Seen recently
          <span className="ml-2 tabular-nums text-neutral-400">{sightings.length}</span>
        </h2>

        {sightings.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-400 dark:border-neutral-700">
            Nothing logged yet.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {sightings.map((sighting) => (
              <li
                key={sighting.plate}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {sighting.plate}
                    </span>
                    {/* Repeats are the signal worth acting on. */}
                    {sighting.sightings > 1 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        seen {sighting.sightings}×
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-neutral-500 dark:text-neutral-400">
                    {sighting.zones.join(', ')}
                  </p>
                </div>
                <time className="shrink-0 text-xs text-neutral-400">
                  {sighting.lastSeen.toLocaleString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
