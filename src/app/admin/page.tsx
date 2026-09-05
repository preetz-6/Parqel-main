import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { requireActor } from '@/server/dal'
import { holdsPermission, scopedZoneIds } from '@/server/permissions'
import {
  AppealDecision,
  DispatchStatus,
  VehicleStatus,
  ViolationStatus,
  ZoneVehicleClass,
} from '@/generated/prisma/enums'
import { VIOLATION_LABELS } from '@/components/status-badge'
import { ArrowRight, CheckCircle2 } from 'lucide-react'

export default async function AdminOverviewPage() {
  const actor = await requireActor()
  const scope = scopedZoneIds(actor)

  const [
    usersCount,
    vehiclesCount,
    pendingVehiclesCount,
    zonesCount,
    spotsCount,
    bikeZonesCount,
    zonesList,
    submittedCount,
    pendingAppealsCount,
    activeDispatchesCount,
    recentViolations,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.vehicle.count(),
    prisma.vehicle.count({ where: { status: VehicleStatus.PENDING } }),
    prisma.parkingZone.count(),
    prisma.parkingSpot.count(),
    prisma.parkingZone.count({ where: { vehicleClass: ZoneVehicleClass.TWO_WHEELER } }),
    prisma.parkingZone.findMany({
      select: {
        id: true,
        name: true,
        allocationType: true,
        vehicleClass: true,
        capacity: true,
        building: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.violation.count({
      where: {
        status: ViolationStatus.SUBMITTED,
        ...(scope === null ? {} : { zoneId: { in: scope } }),
      },
    }),
    prisma.appeal.count({
      where: { decision: AppealDecision.PENDING },
    }),
    prisma.dispatch.count({
      where: { status: { not: DispatchStatus.RESOLVED } },
    }),
    prisma.violation.findMany({
      where: {
        status: ViolationStatus.SUBMITTED,
        ...(scope === null ? {} : { zoneId: { in: scope } }),
      },
      select: {
        id: true,
        type: true,
        status: true,
        plateEntered: true,
        createdAt: true,
        zone: { select: { name: true } },
        reportedBy: { select: { name: true, employeeId: true } },
        matchedVehicle: { select: { plateNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 6,
    }),
  ])

  const canTriage = holdsPermission(actor, 'violation:triage')
  const totalQueueUrgent = submittedCount

  return (
    <div className="space-y-8 py-4">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 pb-5 dark:border-neutral-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
            Operations Dashboard
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Campus parking accountability, live enforcement queue, and field operations
          </p>
        </div>
        <div className="flex items-center gap-2">
          {actor.roles.map((r) => (
            <span
              key={r.role}
              className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
            >
              {r.role}
            </span>
          ))}
          <span className="font-mono text-xs text-neutral-400">({actor.employeeId})</span>
        </div>
      </header>

      {/* ── Quick Alert / Urgent Status Bar ─────────────────────── */}
      {(totalQueueUrgent > 0 || pendingAppealsCount > 0 || activeDispatchesCount > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-sm font-medium text-amber-950 dark:text-amber-200">
                Action needed:
              </span>
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
                {submittedCount > 0 && (
                  <span className="rounded bg-amber-100 px-2 py-0.5 dark:bg-amber-900/50">
                    {submittedCount} {submittedCount === 1 ? 'report' : 'reports'} awaiting verification
                  </span>
                )}
                {pendingAppealsCount > 0 && (
                  <span className="rounded bg-blue-100 px-2 py-0.5 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                    {pendingAppealsCount} appeals pending
                  </span>
                )}
                {activeDispatchesCount > 0 && (
                  <span className="rounded bg-red-100 px-2 py-0.5 text-red-800 dark:bg-red-950/60 dark:text-red-300">
                    {activeDispatchesCount} active dispatches
                  </span>
                )}
              </div>
            </div>
            {canTriage && (
              <Link
                href="/security"
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500"
              >
                Go to Queue
                <ArrowRight size={14} />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── Campus Infrastructure & Capacity Overview ───────────── */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          Campus Parking Infrastructure
        </h2>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <dd className="text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
              {zonesCount}
            </dd>
            <dt className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">Total Zones</dt>
          </div>
          <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <dd className="text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
              {spotsCount}
            </dd>
            <dt className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">Numbered Spots</dt>
          </div>
          <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <dd className="text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
              {bikeZonesCount}
            </dd>
            <dt className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">Two-wheeler Sheds</dt>
          </div>
          <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <dd className="text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
              {usersCount}
            </dd>
            <dt className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">Roster Users</dt>
          </div>
          <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <dd className="text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
              {vehiclesCount}
            </dd>
            <dt className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">Registered Vehicles</dt>
          </div>
          <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <dd className="text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
              {pendingVehiclesCount}
            </dd>
            <dt className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">Pending Approval</dt>
          </div>
        </dl>
      </section>

      {/* ── Active Queue Spotlight ──────────────────────────────── */}
      {canTriage && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                Active Violation Queue
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Review and decide recent reports directly
              </p>
            </div>
            <Link
              href="/security"
              className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-700 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100"
            >
              Full queue view
              <ArrowRight size={13} />
            </Link>
          </div>

          {recentViolations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-800">
              <CheckCircle2 size={24} className="mx-auto text-emerald-500" />
              <p className="mt-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Queue is clear
              </p>
              <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
                No reports awaiting triage or decisions right now.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
              <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {recentViolations.map((v) => {
                  const plate = v.matchedVehicle?.plateNumber ?? v.plateEntered ?? '—'

                  return (
                    <li
                      key={v.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-4 transition hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs font-bold text-neutral-800 dark:text-neutral-200">
                          {plate}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100">
                              {VIOLATION_LABELS[v.type] ?? v.type}
                            </span>
                            <span className="text-[11px] text-neutral-400">· {v.zone.name}</span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-neutral-400">
                            Reported by {v.reportedBy.name} ({v.reportedBy.employeeId}) ·{' '}
                            {v.createdAt.toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200 ring-inset dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900">
                          Awaiting verification
                        </span>

                        <Link
                          href={`/security/${v.id}`}
                          className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100 hover:text-neutral-900 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                        >
                          Review
                        </Link>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ── Zone Configuration Breakdown ────────────────────────── */}
      {zonesList.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            Zone Configuration & Allocation
          </h2>
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {zonesList.map((z) => (
                <div
                  key={z.id}
                  className="flex flex-col gap-1.5 px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                  <div>
                    <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                      {z.name}
                    </span>
                    {z.building && (
                      <span className="ml-1.5 text-neutral-400">({z.building})</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-neutral-100 px-2 py-0.5 font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                      {z.vehicleClass.replace('_', ' ')}
                    </span>
                    <span className="rounded bg-neutral-100 px-2 py-0.5 font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                      {z.allocationType}
                    </span>
                    <span className="font-semibold tabular-nums text-neutral-800 dark:text-neutral-200">
                      {z.capacity} slots
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
