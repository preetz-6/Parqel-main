'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Zone = { id: string; name: string }
type Vehicle = { id: string; plateNumber: string }

/**
 * Emergency alert button for the employee home dashboard.
 *
 * Tap → reveals a compact form (zone, optional vehicle, message) →
 * POST /api/alerts → success confirmation. The severity is always
 * CRITICAL for an employee-triggered emergency.
 */
export function EmergencyAlertButton({
  zones,
  vehicles,
}: {
  zones: Zone[]
  vehicles: Vehicle[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [zoneId, setZoneId] = useState(zones[0]?.id ?? '')
  const [vehicleId, setVehicleId] = useState<string>('')
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)

    const response = await fetch('/api/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        severity: 'CRITICAL',
        message,
        zoneId,
        vehicleId: vehicleId || null,
      }),
    })
    const data = (await response.json().catch(() => ({}))) as { error?: string }
    setPending(false)

    if (!response.ok) {
      setError(data.error ?? 'Could not raise the alert.')
      return
    }

    setSent(true)
    router.refresh()
  }

  if (sent) {
    return (
      <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/30">
        <p className="text-sm font-medium text-green-800 dark:text-green-200">
          ✓ Emergency alert sent — security has been notified.
        </p>
      </div>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-red-300 px-4 py-3 text-sm font-medium text-red-600 transition-colors hover:border-red-400 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:border-red-700 dark:hover:bg-red-950/30"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        Raise emergency alert
      </button>
    )
  }

  const field =
    'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 ' +
    'focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 ' +
    'dark:text-neutral-100 dark:focus:border-neutral-400'

  return (
    <form
      onSubmit={submit}
      className="mt-4 rounded-xl border border-red-200 bg-red-50/50 p-4 dark:border-red-900 dark:bg-red-950/20"
    >
      <h3 className="text-sm font-semibold text-red-700 dark:text-red-300">
        Emergency alert
      </h3>
      <p className="mt-1 text-xs text-red-600/70 dark:text-red-400/70">
        This notifies all on-duty security immediately.
      </p>

      <div className="mt-3 space-y-3">
        <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className={field}>
          {zones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.name}
            </option>
          ))}
        </select>

        {vehicles.length > 0 && (
          <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className={field}>
            <option value="">No vehicle involved</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plateNumber}
              </option>
            ))}
          </select>
        )}

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What is happening?"
          required
          minLength={5}
          maxLength={500}
          rows={2}
          className={field}
        />
      </div>

      {error && (
        <p className="mt-2 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={pending || message.trim().length < 5}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
        >
          {pending ? 'Sending…' : 'Send alert'}
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
