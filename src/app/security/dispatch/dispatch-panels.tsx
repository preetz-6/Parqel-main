'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const smallButton =
  'rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 ' +
  'hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 ' +
  'dark:hover:bg-neutral-800'

export function MyDispatchPanel({ dispatchId, status }: { dispatchId: string; status: string }) {
  const router = useRouter()
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function update(next: 'RESPONDING' | 'RESOLVED') {
    setPending(next)
    setError(null)

    const response = await fetch(`/api/dispatches/${dispatchId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    const data = (await response.json().catch(() => ({}))) as { error?: string }

    setPending(null)

    if (!response.ok) {
      setError(data.error ?? 'Could not update that.')
      return
    }

    router.refresh()
  }

  return (
    <div className="mt-3 space-y-2">
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {status !== 'RESPONDING' && (
          <button
            type="button"
            onClick={() => update('RESPONDING')}
            disabled={pending !== null}
            className={smallButton}
          >
            {pending === 'RESPONDING' ? 'Updating…' : 'On my way'}
          </button>
        )}
        <button
          type="button"
          onClick={() => update('RESOLVED')}
          disabled={pending !== null}
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {pending === 'RESOLVED' ? 'Closing…' : 'Resolved'}
        </button>
      </div>
    </div>
  )
}

export function AssignPanel({
  alertId,
  guards,
}: {
  alertId: string
  guards: { id: string; name: string; employeeId: string }[]
}) {
  const router = useRouter()
  const [guardId, setGuardId] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function assign() {
    if (!guardId) return
    setPending(true)
    setError(null)

    const response = await fetch(`/api/alerts/${alertId}/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guardUserId: guardId }),
    })
    const data = (await response.json().catch(() => ({}))) as { error?: string }

    setPending(false)

    if (!response.ok) {
      setError(data.error ?? 'Could not dispatch.')
      return
    }

    setGuardId('')
    router.refresh()
  }

  return (
    <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <select
          value={guardId}
          onChange={(e) => setGuardId(e.target.value)}
          className="flex-1 rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        >
          <option value="">Send someone…</option>
          {guards.map((guard) => (
            <option key={guard.id} value={guard.id}>
              {guard.name} ({guard.employeeId})
            </option>
          ))}
        </select>
        <button type="button" onClick={assign} disabled={pending || !guardId} className={smallButton}>
          {pending ? 'Sending…' : 'Dispatch'}
        </button>
      </div>
    </div>
  )
}
