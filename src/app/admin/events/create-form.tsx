'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Zone = { id: string; name: string; allocationType: string }

const field =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 ' +
  'focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 ' +
  'dark:text-neutral-100'

function toLocalInput(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function CreateEventForm({ zones }: { zones: Zone[] }) {
  const router = useRouter()
  const now = new Date()

  const [name, setName] = useState('')
  const [zoneIds, setZoneIds] = useState<string[]>([])
  const [startTime, setStartTime] = useState(toLocalInput(now))
  const [endTime, setEndTime] = useState(toLocalInput(new Date(now.getTime() + 6 * 3600_000)))
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function toggleZone(id: string) {
    setZoneIds((current) =>
      current.includes(id) ? current.filter((z) => z !== id) : [...current, id],
    )
  }

  const displacingFixed = zones.filter(
    (zone) => zoneIds.includes(zone.id) && zone.allocationType === 'FIXED',
  )

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    setNotice(null)

    const response = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        zoneIds,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
      }),
    })
    const data = (await response.json().catch(() => ({}))) as {
      displacedCount?: number
      error?: string
    }

    setPending(false)

    if (!response.ok) {
      setError(data.error ?? 'Could not create that event.')
      return
    }

    setNotice(
      data.displacedCount
        ? `Event created. ${data.displacedCount} slot holder(s) notified.`
        : 'Event created.',
    )
    setName('')
    setZoneIds([])
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="name" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Event name
        </label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={200}
          placeholder="Convocation 2026"
          className={field}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Zones to open
        </legend>
        <div className="flex flex-wrap gap-2">
          {zones.map((zone) => (
            <button
              key={zone.id}
              type="button"
              onClick={() => toggleZone(zone.id)}
              className={
                zoneIds.includes(zone.id)
                  ? 'rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900'
                  : 'rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800'
              }
            >
              {zone.name}
              {zone.allocationType === 'FIXED' && (
                <span className="ml-1.5 text-xs opacity-60">assigned</span>
              )}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="from" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            From
          </label>
          <input
            id="from"
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
            className={field}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="until" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Until
          </label>
          <input
            id="until"
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            required
            className={field}
          />
        </div>
      </div>

      {displacingFixed.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          This overrides assigned parking in{' '}
          {displacingFixed.map((zone) => zone.name).join(', ')}. Everyone holding
          a slot there will be notified.
        </p>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-300">
          {notice}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || name.trim().length < 3 || zoneIds.length === 0}
        className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 sm:w-auto"
      >
        {pending ? 'Creating…' : 'Create event'}
      </button>
    </form>
  )
}
