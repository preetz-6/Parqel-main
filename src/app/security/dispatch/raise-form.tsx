'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const field =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 ' +
  'focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 ' +
  'dark:text-neutral-100'

const SEVERITIES = [
  { id: 'CRITICAL', label: 'Critical — fire lane or exit blocked' },
  { id: 'HIGH', label: 'High — someone is blocked in' },
  { id: 'MEDIUM', label: 'Medium' },
  { id: 'LOW', label: 'Low' },
]

export function RaiseAlertForm({ zones }: { zones: { id: string; name: string }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [severity, setSeverity] = useState('HIGH')
  const [message, setMessage] = useState('')
  const [zoneId, setZoneId] = useState(zones[0]?.id ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)

    const response = await fetch('/api/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ severity, message, zoneId }),
    })
    const data = (await response.json().catch(() => ({}))) as { error?: string }

    setPending(false)

    if (!response.ok) {
      setError(data.error ?? 'Could not raise that alert.')
      return
    }

    setMessage('')
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 w-full rounded-lg border border-red-300 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/30"
      >
        Raise an emergency alert
      </button>
    )
  }

  return (
    <form
      onSubmit={submit}
      className="mt-6 space-y-3 rounded-xl border border-red-300 p-4 dark:border-red-900"
    >
      <select value={severity} onChange={(e) => setSeverity(e.target.value)} className={field}>
        {SEVERITIES.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>

      <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className={field}>
        {zones.map((zone) => (
          <option key={zone.id} value={zone.id}>
            {zone.name}
          </option>
        ))}
      </select>

      <input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="What is happening?"
        maxLength={500}
        required
        className={field}
      />

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || message.trim().length < 5}
          className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Raising…' : 'Raise alert'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
