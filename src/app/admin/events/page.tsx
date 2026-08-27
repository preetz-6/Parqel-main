import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { currentCan } from '@/server/dal'
import { AllocationType } from '@/generated/prisma/enums'
import { upcomingEvents } from '@/server/events/service'
import { CreateEventForm } from './create-form'

export default async function EventsPage() {
  if (!(await currentCan('event:create'))) redirect('/admin')

  const [zones, events] = await Promise.all([
    prisma.parkingZone.findMany({
      select: { id: true, name: true, allocationType: true },
      orderBy: { name: 'asc' },
    }),
    upcomingEvents(),
  ])

  return (
    <main className="py-6">
      <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Events</h1>
      <p className="mt-1 max-w-prose text-sm text-neutral-500 dark:text-neutral-400">
        An event temporarily opens zones for a programme. Including an assigned
        zone is allowed — everyone holding a slot there is notified
        automatically, because arriving to find your bay taken is exactly what
        this system exists to prevent.
      </p>

      <CreateEventForm zones={zones} />

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Upcoming
          <span className="ml-2 tabular-nums text-neutral-400">{events.length}</span>
        </h2>

        {events.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-400 dark:border-neutral-700">
            No events scheduled.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {events.map((event) => {
              const overridesFixed = event.zones.filter(
                (zone) => zone.allocationType === AllocationType.FIXED,
              )
              return (
                <li key={event.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {event.name}
                    </span>
                    <time className="text-xs text-neutral-400">
                      {event.startTime.toLocaleString('en-IN', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </time>
                  </div>
                  <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                    {event.zones.map((zone) => zone.name).join(', ')}
                  </p>
                  {overridesFixed.length > 0 && (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                      Overrides assigned parking in {overridesFixed.map((z) => z.name).join(', ')}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-neutral-400">
                    Created by {event.createdBy.name} ({event.createdBy.employeeId})
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </main>
  )
}
