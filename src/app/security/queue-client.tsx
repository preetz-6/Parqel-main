'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertSeverity, ViolationType } from '@/generated/prisma/enums'
import { SeverityBadge, VIOLATION_LABELS } from '@/components/status-badge'
import { CheckCircle2, ChevronDown, ChevronRight, Clock, Radio, AlertTriangle } from 'lucide-react'

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

export type BufferTimerItem = {
  id: string
  type: ViolationType
  plate: string
  zoneName: string
  triagedAtISO: string
  expiresAtISO: string
  reportedByName: string
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

export type AwaitingDecisionItem = {
  id: string
  type: ViolationType
  plate: string | null
  hasMatchedVehicle: boolean
  zoneName: string
  reportedByName: string
  reportedByEmployeeId: string
  createdAtISO: string
  triagedAtISO: string | null
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
/* Zone 2 — Buffer countdown timer card                               */
/* ------------------------------------------------------------------ */

export function BufferTimerCard({ item }: { item: BufferTimerItem }) {
  const router = useRouter()
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    const remainingMs = new Date(item.expiresAtISO).getTime() - Date.now()
    return Math.max(0, Math.floor(remainingMs / 1000))
  })
  const [isPending, startTransition] = useTransition()
  const [resolved, setResolved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const updateCountdown = () => {
      const remainingMs = new Date(item.expiresAtISO).getTime() - Date.now()
      const secs = Math.max(0, Math.floor(remainingMs / 1000))
      setSecondsRemaining(secs)
    }

    updateCountdown()
    const timer = setInterval(updateCountdown, 1000)
    return () => clearInterval(timer)
  }, [item.expiresAtISO])

  const mins = Math.floor(secondsRemaining / 60)
  const secs = secondsRemaining % 60
  const formattedCountdown = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  const isExpiringSoon = secondsRemaining > 0 && secondsRemaining <= 120
  const hasExpired = secondsRemaining === 0

  async function handleMarkResolved(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setError(null)

    startTransition(async () => {
      try {
        const res = await fetch(`/api/violations/${item.id}/resolve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note: 'Resolved on-site by guard' }),
        })
        const data = await res.json().catch(() => ({}))

        if (!res.ok) {
          setError(data.error ?? 'Could not resolve report.')
          return
        }

        setResolved(true)
        router.refresh()
      } catch {
        setError('Network error. Please try again.')
      }
    })
  }

  if (resolved) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-xs font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
        ✓ Marked resolved on-site (soft warning recorded for {item.plate}).
      </div>
    )
  }

  return (
    <Link
      href={`/security/${item.id}`}
      className="group relative block rounded-xl border border-amber-200 bg-amber-50/40 p-4 transition-all hover:border-amber-300 hover:bg-amber-50/70 hover:shadow-sm dark:border-amber-900/50 dark:bg-amber-950/20 dark:hover:border-amber-800"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-neutral-900 px-2.5 py-1 font-mono text-sm font-semibold tracking-wide text-white dark:bg-neutral-100 dark:text-neutral-900">
            {item.plate}
          </span>
          <span className="text-xs text-neutral-600 dark:text-neutral-300">
            {VIOLATION_LABELS[item.type] ?? item.type} · <span className="font-medium">{item.zoneName}</span>
          </span>
        </div>

        {/* Live Countdown */}
        <div
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-xs font-bold ${
            hasExpired
              ? 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
              : isExpiringSoon
                ? 'animate-pulse bg-red-100 text-red-700 ring-1 ring-red-300 dark:bg-red-950 dark:text-red-300 dark:ring-red-800'
                : 'bg-amber-100 text-amber-900 ring-1 ring-amber-300 dark:bg-amber-900/50 dark:text-amber-200 dark:ring-amber-800'
          }`}
        >
          <Clock className="h-3.5 w-3.5" />
          {hasExpired ? 'Timer expired' : formattedCountdown}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-amber-200/50 pt-3 dark:border-amber-900/30">
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          Owner notified · buffer running
        </span>

        <button
          type="button"
          onClick={handleMarkResolved}
          disabled={isPending || hasExpired}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {isPending ? 'Resolving…' : 'Mark resolved'}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </Link>
  )
}

/* ------------------------------------------------------------------ */
/* Zone 3 — Awaiting verification card (Guard worklist)               */
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

/* ------------------------------------------------------------------ */
/* Zone 4 — Awaiting decision (read-only for Guard, collapsible)      */
/* ------------------------------------------------------------------ */

export function AwaitingDecisionSection({ items }: { items: AwaitingDecisionItem[] }) {
  const [open, setOpen] = useState(false)

  if (items.length === 0) return null

  return (
    <section className="mt-8">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50/60 px-4 py-3 text-left transition-colors hover:bg-neutral-100/70 dark:border-neutral-800 dark:bg-neutral-900/30 dark:hover:bg-neutral-900/60"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
          )}
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Awaiting decision
          </span>
          <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
            {items.length}
          </span>
        </div>
        <span className="text-xs text-neutral-400">
          {open ? 'Tap to collapse' : 'Waiting on Supervisor'}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-2.5">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/security/${item.id}`}
              className="group block rounded-xl border border-neutral-200/80 bg-neutral-50/40 p-3.5 opacity-80 transition-all hover:opacity-100 hover:shadow-sm dark:border-neutral-800/80 dark:bg-neutral-900/20"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    {item.plate ?? 'Unregistered'}
                  </span>
                  <span className="rounded bg-neutral-200/70 px-1.5 py-0.5 text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                    {VIOLATION_LABELS[item.type] ?? item.type}
                  </span>
                </div>
                <span className="rounded-full bg-neutral-200/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-neutral-600 dark:bg-neutral-800/60 dark:text-neutral-400">
                  Waiting on Supervisor
                </span>
              </div>
              <div className="mt-1.5 flex justify-between text-xs text-neutral-400">
                <span>{item.zoneName}</span>
                <span>By {item.reportedByName}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
