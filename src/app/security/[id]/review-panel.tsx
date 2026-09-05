'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ViolationStatus } from '@/generated/prisma/enums'
import { CheckCircle2, ShieldAlert } from 'lucide-react'

type Candidate = {
  vehicleId: string
  plateNumber: string
  ownerName: string
  ownerEmployeeId: string
  vehicleClass: string
  confidence: number
  exact: boolean
}

export function ReviewPanel({
  violationId,
  status,
  matchedVehicleId,
  candidates,
  mayTriage,
  mayDecide,
  isOwnReport,
}: {
  violationId: string
  status: ViolationStatus
  triagedAt?: string | null
  matchedVehicleId: string | null
  candidates: Candidate[]
  mayTriage: boolean
  mayDecide: boolean
  isOwnReport: boolean
}) {
  const router = useRouter()

  const [selected, setSelected] = useState<string | null>(
    matchedVehicleId ?? candidates.find((c) => c.exact)?.vehicleId ?? candidates[0]?.vehicleId ?? null,
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function post(url: string, body: unknown) {
    setPending(true)
    setError(null)

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await response.json().catch(() => ({}))) as { error?: string }

    setPending(false)

    if (!response.ok) {
      setError(data.error ?? 'That action could not be completed.')
      return false
    }

    router.refresh()
    return true
  }

  if (isOwnReport) {
    return (
      <Notice>
        You filed this report, so you cannot verify or decide it. Another
        reviewer has to take it.
      </Notice>
    )
  }

  /* ------------------------------------------------------------------ */
  /* SUBMITTED — Awaiting on-site verification & issuance               */
  /* ------------------------------------------------------------------ */
  if (status === 'SUBMITTED') {
    if (!mayTriage && !mayDecide) {
      return <Notice>Waiting for security to verify this report.</Notice>
    }

    // Unregistered vehicle branch
    if (candidates.length === 0) {
      return (
        <div className="mt-5 rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900/40">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Unregistered vehicle
            </h2>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            No registered vehicle matches that plate. Log it as an unknown vehicle to track repeat sightings on campus, or dismiss if this was a false report.
          </p>

          {error && <ErrorText>{error}</ErrorText>}

          <div className="mt-4 flex flex-wrap gap-2.5">
            <button
              type="button"
              disabled={pending}
              onClick={() => post(`/api/violations/${violationId}/unregistered`, {})}
              className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {pending ? 'Logging…' : 'Log as unknown vehicle & close'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => post(`/api/violations/${violationId}/decide`, { decision: 'REJECTED' })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Dismiss (false report)
            </button>
          </div>
        </div>
      )
    }

    // Registered vehicle match branch
    return (
      <div className="mt-5 rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900/40">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Verify on-site plate & issue violation
        </h2>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Compare the photo and physical vehicle against candidate plates. Confirming will formally issue the violation and notify the registered owner.
        </p>

        <ul className="mt-3.5 space-y-2">
          {candidates.map((candidate) => (
            <li key={candidate.vehicleId}>
              <button
                type="button"
                onClick={() => setSelected(candidate.vehicleId)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
                  selected === candidate.vehicleId
                    ? 'border-neutral-900 bg-neutral-50 ring-1 ring-neutral-900 dark:border-neutral-200 dark:bg-neutral-800 dark:ring-neutral-200'
                    : 'border-neutral-200 hover:bg-neutral-50/70 dark:border-neutral-700 dark:hover:bg-neutral-800'
                }`}
              >
                <span>
                  <span className="font-mono text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                    {candidate.plateNumber}
                  </span>
                  <span className="ml-2 text-xs text-neutral-500 dark:text-neutral-400">
                    {candidate.ownerName} ({candidate.ownerEmployeeId})
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                    candidate.exact
                      ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                  }`}
                >
                  {candidate.exact ? 'Exact match' : `${Math.round(candidate.confidence * 100)}% match`}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {error && <ErrorText>{error}</ErrorText>}

        <div className="mt-4 flex flex-wrap gap-2.5">
          <button
            type="button"
            disabled={pending || !selected}
            onClick={() =>
              post(`/api/violations/${violationId}/decide`, {
                decision: 'APPROVED',
                matchedVehicleId: selected,
              })
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-600"
          >
            <CheckCircle2 className="h-4 w-4" />
            {pending ? 'Confirming…' : 'Confirm & Issue Violation'}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => post(`/api/violations/${violationId}/decide`, { decision: 'REJECTED' })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            Dismiss (false report)
          </button>
        </div>
      </div>
    )
  }

  /* ------------------------------------------------------------------ */
  /* Closed States                                                      */
  /* ------------------------------------------------------------------ */
  if (status === 'APPROVED') {
    return <Notice>This violation has been confirmed and issued to the vehicle owner.</Notice>
  }

  if (status === 'REJECTED') {
    return <Notice>This report was dismissed.</Notice>
  }

  if (status === 'WARNED') {
    return (
      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
        ✓ Resolved on-site — soft warning recorded in vehicle owner history.
      </div>
    )
  }

  if (status === 'VOIDED') {
    return <Notice>This report is closed / voided.</Notice>
  }

  return <Notice>This report is closed. Nothing further to do.</Notice>
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 rounded-xl border border-neutral-200 bg-neutral-50/50 px-4 py-3 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/30 dark:text-neutral-400">
      {children}
    </p>
  )
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
      {children}
    </p>
  )
}
