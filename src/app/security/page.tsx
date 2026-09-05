import { prisma } from '@/lib/prisma'
import { requireActor } from '@/server/dal'
import { scopedZoneIds } from '@/server/permissions'
import { DispatchStatus, ViolationStatus } from '@/generated/prisma/enums'
import { DEFAULT_BUFFER_MINUTES } from '@/server/violations/service'
import {
  ActiveAlertCard,
  BufferTimerCard,
  WorklistCard,
  AwaitingDecisionSection,
  type ActiveAlertItem,
  type BufferTimerItem,
  type WorklistItem,
  type AwaitingDecisionItem,
} from './queue-client'

export default async function SecurityQueuePage() {
  const actor = await requireActor()
  const scope = scopedZoneIds(actor)
  const now = Date.now()
  const bufferMs = DEFAULT_BUFFER_MINUTES * 60 * 1000

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

    // Zones 2, 3 & 4 — Violations in scope
    prisma.violation.findMany({
      where: {
        status: { in: [ViolationStatus.SUBMITTED, ViolationStatus.TRIAGED] },
        ...(scope === null ? {} : { zoneId: { in: scope } }),
      },
      select: {
        id: true,
        type: true,
        status: true,
        plateEntered: true,
        createdAt: true,
        triagedAt: true,
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

  // ── Zone 2 vs Zone 4 partition ─────────────────────────────
  const bufferTimers: (BufferTimerItem & { expiresMs: number })[] = []
  const awaitingDecision: AwaitingDecisionItem[] = []
  const awaitingVerification: WorklistItem[] = []

  for (const v of violations) {
    if (v.status === ViolationStatus.SUBMITTED) {
      awaitingVerification.push({
        id: v.id,
        type: v.type,
        plate: v.matchedVehicle?.plateNumber ?? v.plateEntered,
        hasMatchedVehicle: !!v.matchedVehicle,
        zoneName: v.zone.name,
        reportedByName: v.reportedBy.name,
        reportedByEmployeeId: v.reportedBy.employeeId,
        createdAtISO: v.createdAt.toISOString(),
        isOwnReport: v.reportedById === actor.userId,
      })
    } else if (v.status === ViolationStatus.TRIAGED) {
      const triagedMs = v.triagedAt ? v.triagedAt.getTime() : v.createdAt.getTime()
      const expiresMs = triagedMs + bufferMs

      if (now < expiresMs) {
        // Active buffer countdown running
        bufferTimers.push({
          id: v.id,
          type: v.type,
          plate: v.matchedVehicle?.plateNumber ?? v.plateEntered ?? '—',
          zoneName: v.zone.name,
          triagedAtISO: new Date(triagedMs).toISOString(),
          expiresAtISO: new Date(expiresMs).toISOString(),
          reportedByName: v.reportedBy.name,
          expiresMs,
        })
      } else {
        // Buffer expired -> Awaiting Supervisor decision
        awaitingDecision.push({
          id: v.id,
          type: v.type,
          plate: v.matchedVehicle?.plateNumber ?? v.plateEntered,
          hasMatchedVehicle: !!v.matchedVehicle,
          zoneName: v.zone.name,
          reportedByName: v.reportedBy.name,
          reportedByEmployeeId: v.reportedBy.employeeId,
          createdAtISO: v.createdAt.toISOString(),
          triagedAtISO: v.triagedAt ? v.triagedAt.toISOString() : null,
        })
      }
    }
  }

  // Zone 2: Sorted soonest-expiring first (so the ones about to escalate are on top)
  bufferTimers.sort((a, b) => a.expiresMs - b.expiresMs)

  // Zone 3: Sorted oldest-first (already sorted by createdAt: 'asc')

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header>
        <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">
          Security queue
        </h1>
        <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
          {scope === null
            ? 'All zones'
            : `${scope.length} zone${scope.length === 1 ? '' : 's'} in your scope`}
        </p>
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

      {/* ── Zone 2 — Active buffer timers ──────────────────────── */}
      {bufferTimers.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Active buffer timers
            </h2>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              {bufferTimers.length} running
            </span>
          </div>
          <div className="space-y-3">
            {bufferTimers.map((item) => (
              <BufferTimerCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {/* ── Zone 3 — Awaiting verification (Guard's main worklist) ─ */}
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

      {/* ── Zone 4 — Awaiting decision (Read-only, collapsed by default) ── */}
      <AwaitingDecisionSection items={awaitingDecision} />
    </div>
  )
}
