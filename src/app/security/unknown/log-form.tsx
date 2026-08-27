'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const field =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 ' +
  'focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 ' +
  'dark:text-neutral-100 dark:focus:border-neutral-400'

export function LogUnknownForm({ zones }: { zones: { id: string; name: string }[] }) {
  const router = useRouter()

  const [plate, setPlate] = useState('')
  const [zoneId, setZoneId] = useState(zones[0]?.id ?? '')
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    setNotice(null)

    const body = new FormData()
    body.set('plate', plate)
    body.set('zoneId', zoneId)
    if (note.trim()) body.set('note', note.trim())
    if (photo) body.set('photo', photo)

    const response = await fetch('/api/unknown-vehicles', { method: 'POST', body })
    const data = (await response.json().catch(() => ({}))) as {
      matchedAfterAll?: boolean
      error?: string
    }

    setPending(false)

    if (!response.ok) {
      setError(data.error ?? 'Could not log that.')
      return
    }

    setNotice(
      data.matchedAfterAll
        ? 'Logged — but that plate is actually registered. Report it as a violation instead so the owner gets notified.'
        : 'Logged.',
    )
    setPlate('')
    setNote('')
    setPhoto(null)
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="plate" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Number plate
          </label>
          <input
            id="plate"
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
            required
            placeholder="KA 09 PQ 3344"
            className={`${field} font-mono tracking-wider`}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="zone" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Where
          </label>
          <select id="zone" value={zoneId} onChange={(e) => setZoneId(e.target.value)} className={field}>
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="note" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Note <span className="font-normal text-neutral-400">— optional</span>
        </label>
        <input
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="Delivery van, parked across two bays"
          className={field}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="photo" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Photo <span className="font-normal text-neutral-400">— optional</span>
        </label>
        <input
          id="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          className="w-full text-sm text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:text-neutral-700 dark:text-neutral-300 dark:file:bg-neutral-800 dark:file:text-neutral-200"
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
          {notice}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || plate.length < 4}
        className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 sm:w-auto"
      >
        {pending ? 'Logging…' : 'Log vehicle'}
      </button>
    </form>
  )
}
