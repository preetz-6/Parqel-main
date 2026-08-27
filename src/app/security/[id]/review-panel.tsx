'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ViolationStatus } from '@/generated/prisma/enums'

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
  matchedVehicleId: string | null
  candidates: Candidate[]
  mayTriage: boolean
  mayDecide: boolean
  isOwnReport: boolean
}) {
  const router = useRouter()

  const [selected, setSelected] = useState<string | null>(
    matchedVehicleId ?? candidates.find((c) => c.exact)?.vehicleId ?? null,
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
      setError(data.error ?? 'That did not work.')
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

  if (status === 'SUBMITTED') {
    if (!mayTriage) return <Notice>Waiting for security to verify this report.</Notice>

    return (
      <div className="mt-5 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          Which registered vehicle is this?
        </h2>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Compare the photo against the plate. The owner is only contacted once
          this is confirmed.
        </p>

        {candidates.length === 0 ? (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            No registered vehicle matches that plate. It may be a visitor or an
            unregistered vehicle — there is nobody to notify, so dismiss this
            and log it as an unknown vehicle instead.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {candidates.map((candidate) => (
              <li key={candidate.vehicleId}>
                <button
                  type="button"
                  onClick={() => setSelected(candidate.vehicleId)}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left ${
                    selected === candidate.vehicleId
                      ? 'border-neutral-900 bg-neutral-50 dark:border-neutral-300 dark:bg-neutral-800'
                      : 'border-neutral-200 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800'
                  }`}
                >
                  <span>
                    <span className="font-mono text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {candidate.plateNumber}
                    </span>
                    <span className="ml-2 text-sm text-neutral-500 dark:text-neutral-400">
                      {candidate.ownerName}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 text-xs ${
                      candidate.exact
                        ? 'font-medium text-green-700 dark:text-green-400'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {candidate.exact ? 'exact' : `${Math.round(candidate.confidence * 100)}% — check`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && <ErrorText>{error}</ErrorText>}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || !selected}
            onClick={() => post(`/api/violations/${violationId}/triage`, { matchedVehicleId: selected })}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {pending ? 'Saving…' : 'Confirm match'}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => post(`/api/violations/${violationId}/decide`, { decision: 'REJECTED' })}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200"
          >
            Dismiss report
          </button>
        </div>
      </div>
    )
  }

  if (status === 'TRIAGED') {
    if (!mayDecide) return <Notice>Verified. Waiting on a supervisor decision.</Notice>

    return (
      <div className="mt-5 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Decision</h2>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Upholding this notifies the owner immediately.
        </p>

        {error && <ErrorText>{error}</ErrorText>}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => post(`/api/violations/${violationId}/decide`, { decision: 'APPROVED' })}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {pending ? 'Working…' : 'Uphold and notify owner'}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => post(`/api/violations/${violationId}/decide`, { decision: 'REJECTED' })}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200"
          >
            Dismiss
          </button>
        </div>
      </div>
    )
  }

  return <Notice>This report is closed. Nothing further to do.</Notice>
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
      {children}
    </p>
  )
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
      {children}
    </p>
  )
}
