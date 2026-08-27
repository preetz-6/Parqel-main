import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireActor } from '@/server/dal'
import { can, holdsPermission, scopedZoneIds } from '@/server/permissions'
import { AlertStatus, DispatchStatus, Role } from '@/generated/prisma/enums'
import { SeverityBadge } from '@/components/status-badge'
import { RaiseAlertForm } from './raise-form'
import { AssignPanel, MyDispatchPanel } from './dispatch-panels'

export default async function DispatchPage() {
  const actor = await requireActor()

  if (!holdsPermission(actor, 'dispatch:read')) redirect('/')

  const mayAssign = can(actor, 'dispatch:assign')
  const scope = scopedZoneIds(actor)

  const [openAlerts, myDispatches, guards, zones] = await Promise.all([
    prisma.alert.findMany({
      where: { status: { in: [AlertStatus.OPEN, AlertStatus.DISPATCHED] } },
      select: {
        id: true,
        severity: true,
        status: true,
        message: true,
        createdAt: true,
        createdBy: { select: { name: true, employeeId: true } },
        vehicle: { select: { plateNumber: true } },
        dispatches: {
          select: {
            id: true,
            status: true,
            assignedGuard: { select: { name: true, employeeId: true } },
          },
        },
      },
      orderBy: [{ severity: 'desc' }, { createdAt: 'asc' }],
      take: 50,
    }),
    prisma.dispatch.findMany({
      where: { assignedGuardId: actor.userId, status: { not: DispatchStatus.RESOLVED } },
      select: {
        id: true,
        status: true,
        createdAt: true,
        alert: { select: { severity: true, message: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    mayAssign
      ? prisma.user.findMany({
          where: { roles: { some: { role: { in: [Role.GUARD, Role.SUPERVISOR] } } } },
          select: { id: true, name: true, employeeId: true },
          orderBy: { name: 'asc' },
        })
      : Promise.resolve([]),
    prisma.parkingZone.findMany({
      where: scope === null ? {} : { id: { in: scope } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-neutral-200 pb-4 dark:border-neutral-800">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            Dispatch
          </h1>
          <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
            Things that need someone to walk over now.
          </p>
        </div>
        <Link
          href="/security"
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          Queue
        </Link>
      </header>

      {myDispatches.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Assigned to you
          </h2>
          <ul className="space-y-3">
            {myDispatches.map((dispatch) => (
              <li
                key={dispatch.id}
                className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={dispatch.alert.severity} />
                  <span className="text-xs text-neutral-400">
                    {dispatch.status === DispatchStatus.RESPONDING ? 'On the way' : 'New'}
                  </span>
                </div>
                <p className="mt-2 text-sm text-neutral-900 dark:text-neutral-100">
                  {dispatch.alert.message}
                </p>
                <MyDispatchPanel dispatchId={dispatch.id} status={dispatch.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Visibility asks "could they ever"; the form names a zone and the
          service does the scoped check on it. */}
      {zones.length > 0 && holdsPermission(actor, 'alert:raise') && (
        <RaiseAlertForm zones={zones} />
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Open alerts
          <span className="ml-2 tabular-nums text-neutral-400">{openAlerts.length}</span>
        </h2>

        {openAlerts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-400 dark:border-neutral-700">
            Nothing open.
          </p>
        ) : (
          <ul className="space-y-3">
            {openAlerts.map((alert) => (
              <li
                key={alert.id}
                className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={alert.severity} />
                    {alert.vehicle && (
                      <span className="font-mono text-sm text-neutral-900 dark:text-neutral-100">
                        {alert.vehicle.plateNumber}
                      </span>
                    )}
                  </div>
                  <time className="text-xs text-neutral-400">
                    {alert.createdAt.toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>

                <p className="mt-2 text-sm text-neutral-900 dark:text-neutral-100">
                  {alert.message}
                </p>
                <p className="mt-1 text-xs text-neutral-400">
                  Raised by {alert.createdBy.name} ({alert.createdBy.employeeId})
                </p>

                {alert.dispatches.length > 0 && (
                  <ul className="mt-3 space-y-1 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                    {alert.dispatches.map((dispatch) => (
                      <li key={dispatch.id} className="text-xs text-neutral-500 dark:text-neutral-400">
                        {dispatch.assignedGuard.name} — {dispatch.status.toLowerCase()}
                      </li>
                    ))}
                  </ul>
                )}

                {mayAssign && <AssignPanel alertId={alert.id} guards={guards} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
