'use client'

import Link from 'next/link'
import { AlertSeverity, ViolationType } from '@/generated/prisma/enums'
import { SeverityBadge, VIOLATION_LABELS } from '@/components/status-badge'
import { Radio, AlertTriangle } from 'lucide-react'

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type ActiveAlertItem = {
  dispatchId: string
  alertId: string
  severity: AlertSeverity
  message: string
  plateNumber: string | null
  raisedByName: string
  raisedByEmployeeId: string
  createdAtISO: string
}

export type WorklistItem = {
  id: string
  type: ViolationType
  plate: string | null
  hasMatchedVehicle: boolean
  zoneName: string
  reportedByName: string
  reportedByEmployeeId: string
  createdAtISO: string
  isOwnReport: boolean
}

/* ------------------------------------------------------------------ */
/* Relative Time Helper                                               */
/* ------------------------------------------------------------------ */

function formatRelativeTime(dateIso: string): string {
  const now = Date.now()
  const diffMs = now - new Date(dateIso).getTime()
  const diffSec = Math.max(0, Math.floor(diffMs / 1000))
  const diffMin = Math.floor(diffSec / 60)
  const diffHr = Math.floor(diffMin / 60)

  if (diffSec < 60) return 'Reported just now'
  if (diffMin === 1) return 'Reported 1 min ago'
  if (diffMin < 60) return `Reported ${diffMin} min ago`
  if (diffHr === 1) return 'Reported 1 hr ago'
  return `Reported ${diffHr} hrs ago`
}

/* ------------------------------------------------------------------ */
/* Zone 1 — Active alerts card                                        */
/* ------------------------------------------------------------------ */

export function ActiveAlertCard({ item }: { item: ActiveAlertItem }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-red-200 bg-red-50/70 p-4 transition-shadow hover:shadow-sm dark:border-red-900/60 dark:bg-red-950/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={item.severity} />
          {item.plateNumber && (
            <span className="rounded bg-red-100 px-2 py-0.5 font-mono text-xs font-semibold text-red-900 dark:bg-red-900/50 dark:text-red-100">
              {item.plateNumber}
            </span>
          )}
        </div>
        <span className="flex items-center gap-1 text-[11px] font-medium text-red-700 dark:text-red-300">
          <Radio className="h-3 w-3 animate-pulse text-red-600 dark:text-red-400" />
          Live dispatch
        </span>
      </div>

      <p className="mt-2.5 text-sm font-medium text-neutral-900 dark:text-neutral-100">
        {item.message}
      </p>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-red-200/60 pt-3 dark:border-red-900/40">
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          Raised by {item.raisedByName}{' '}
          <span className="font-mono text-[11px] text-neutral-400">({item.raisedByEmployeeId})</span>
        </span>
        <Link
          href="/security/dispatch"
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700 active:scale-95 dark:bg-red-700 dark:hover:bg-red-600"
        >
          Respond →
        </Link>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Zone 2 — Awaiting verification card (Guard worklist)               */
/* ------------------------------------------------------------------ */

export function WorklistCard({ item }: { item: WorklistItem }) {
  return (
    <Link
      href={`/security/${item.id}`}
      className="group relative block rounded-xl border border-neutral-200 bg-white p-4 transition-all hover:border-neutral-300 hover:bg-neutral-50/80 hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900/40 dark:hover:border-neutral-700 dark:hover:bg-neutral-900"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {item.plate ? (
            <span className="font-mono text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {item.plate}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              <AlertTriangle className="h-3 w-3" />
              Unregistered vehicle
            </span>
          )}

          <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
            {VIOLATION_LABELS[item.type] ?? item.type}
          </span>

          {item.isOwnReport && (
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
              Your report
            </span>
          )}
        </div>

        <span className="text-xs text-neutral-400 dark:text-neutral-500">
          {formatRelativeTime(item.createdAtISO)}
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500 dark:text-neutral-400">
        <span>{item.zoneName}</span>
        <span>
          Reported by {item.reportedByName}{' '}
          <span className="font-mono text-[11px] text-neutral-400">({item.reportedByEmployeeId})</span>
        </span>
      </div>
    </Link>
  )
}
