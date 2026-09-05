import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { requireActor } from '@/server/dal'
import { scopedZoneIds } from '@/server/permissions'
import { DispatchStatus, ViolationStatus } from '@/generated/prisma/enums'
import { Camera } from 'lucide-react'
import {
  ActiveAlertCard,
  WorklistCard,
  type ActiveAlertItem,
  type WorklistItem,
} from './queue-client'

export default async function SecurityQueuePage() {
  const actor = await requireActor()
  const scope = scopedZoneIds(actor)

  const [myDispatches, violations] = await Promise.all([
    // Zone 1 — Live dispatches assigned to this guard
    prisma.dispatch.findMany({
      where: {
        assignedGuardId: actor.userId,
        status: { not: DispatchStatus.RESOLVED },
      },
      select: {
        id: true,
        alertId: true,
        createdAt: true,
        alert: {
          select: {
            id: true,
            severity: true,
            message: true,
            vehicle: { select: { plateNumber: true } },
            createdBy: { select: { name: true, employeeId: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),

    // Zone 2 — Violations in scope awaiting on-site verification
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
        reportedById: true,
        zone: { select: { name: true } },
        reportedBy: { select: { name: true, employeeId: true } },
        matchedVehicle: { select: { id: true, plateNumber: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    }),
  ])

  // ── Zone 1: Active alerts ──────────────────────────────────
  const activeAlerts: ActiveAlertItem[] = myDispatches.map((d) => ({
    dispatchId: d.id,
    alertId: d.alert.id,
    severity: d.alert.severity,
    message: d.alert.message,
    plateNumber: d.alert.vehicle?.plateNumber ?? null,
    raisedByName: d.alert.createdBy.name,
    raisedByEmployeeId: d.alert.createdBy.employeeId,
    createdAtISO: d.createdAt.toISOString(),
  }))

  // ── Zone 2: Awaiting verification ──────────────────────────
  const awaitingVerification: WorklistItem[] = violations.map((v) => ({
    id: v.id,
    type: v.type,
    plate: v.matchedVehicle?.plateNumber ?? v.plateEntered,
    hasMatchedVehicle: !!v.matchedVehicle,
    zoneName: v.zone.name,
    reportedByName: v.reportedBy.name,
    reportedByEmployeeId: v.reportedBy.employeeId,
    createdAtISO: v.createdAt.toISOString(),
    isOwnReport: v.reportedById === actor.userId,
  }))

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">
            Security queue
          </h1>
          <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
            {scope === null
              ? 'All zones'
              : `${scope.length} zone${scope.length === 1 ? '' : 's'} in your scope`}
          </p>
        </div>

        <Link
          href="/security/report"
          className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          <Camera className="h-4 w-4" />
          Report vehicle on patrol
        </Link>
      </header>

      {/* ── Zone 1 — Active alerts (if any, top of page, most urgent) ── */}
      {activeAlerts.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-red-600 animate-ping" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
              Active alerts ({activeAlerts.length})
            </h2>
          </div>
          <div className="space-y-3">
            {activeAlerts.map((item) => (
              <ActiveAlertCard key={item.dispatchId} item={item} />
            ))}
          </div>
        </section>
      )}

      {/* ── Zone 2 — Awaiting verification (Guard's main worklist) ─ */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Awaiting verification
          </h2>
          <span className="tabular-nums text-xs text-neutral-400">
            {awaitingVerification.length} {awaitingVerification.length === 1 ? 'report' : 'reports'}
          </span>
        </div>

        {awaitingVerification.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-800">
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
              Nothing awaiting verification.
            </p>
            <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
              New reports in your scope will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {awaitingVerification.map((item) => (
              <WorklistCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
