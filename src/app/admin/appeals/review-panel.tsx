'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function ReviewAppealPanel({ appealId }: { appealId: string }) {
  const router = useRouter()
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<null | 'UPHELD' | 'OVERTURNED'>(null)

  async function decide(decision: 'UPHELD' | 'OVERTURNED') {
    setPending(decision)
    setError(null)

    const response = await fetch(`/api/appeals/${appealId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, note: note.trim() || undefined }),
    })
    const data = (await response.json().catch(() => ({}))) as { error?: string }

    setPending(null)

    if (!response.ok) {
      setError(data.error ?? 'Could not record that decision.')
      return
    }

    router.refresh()
  }

  return (
    <div className="mt-4 space-y-3 border-t border-neutral-100 pt-4 dark:border-neutral-800">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={2000}
        placeholder="Reason for your decision — shown to the appellant if overturned…"
        className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
      />

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => decide('OVERTURNED')}
          disabled={pending !== null}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {pending === 'OVERTURNED' ? 'Overturning…' : 'Overturn — void the violation'}
        </button>
        <button
          type="button"
          onClick={() => decide('UPHELD')}
          disabled={pending !== null}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          {pending === 'UPHELD' ? 'Recording…' : 'Uphold the violation'}
        </button>
      </div>
    </div>
  )
}
