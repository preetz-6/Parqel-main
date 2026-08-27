'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function AppealForm({ violationId }: { violationId: string }) {
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)

    const response = await fetch(`/api/violations/${violationId}/appeal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    const data = (await response.json().catch(() => ({}))) as { error?: string }

    setPending(false)

    if (!response.ok) {
      setError(data.error ?? 'Could not file that appeal.')
      return
    }

    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-5 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
      >
        Appeal this
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="mt-5 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <label htmlFor="reason" className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
        Why is this wrong?
      </label>
      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
        Give the reviewer something concrete — where you actually were, who
        authorised it, or why the vehicle is not yours.
      </p>
      <textarea
        id="reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={4}
        minLength={20}
        maxLength={2000}
        required
        autoFocus
        className="mt-3 w-full rounded-lg border border-neutral-300 bg-white p-3 text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
      />

      {error && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={pending || reason.trim().length < 20}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {pending ? 'Sending…' : 'Submit appeal'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-4 py-2 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
