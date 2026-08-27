'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const field =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 ' +
  'focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 ' +
  'dark:text-neutral-100 dark:focus:border-neutral-400'

/** Local datetime string for <input type="datetime-local">. */
function toLocalInput(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function IssuePassForm({ zones }: { zones: { id: string; name: string }[] }) {
  const router = useRouter()
  const now = new Date()

  const [visitorName, setVisitorName] = useState('')
  const [plate, setPlate] = useState('')
  const [vehicleClass, setVehicleClass] = useState('FOUR_WHEELER')
  const [zoneId, setZoneId] = useState('')
  const [validFrom, setValidFrom] = useState(toLocalInput(now))
  const [validTo, setValidTo] = useState(toLocalInput(new Date(now.getTime() + 8 * 3600_000)))
  const [issued, setIssued] = useState<{ code: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)

    const response = await fetch('/api/passes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visitorName,
        plate,
        vehicleClass,
        zoneId: zoneId || null,
        validFrom: new Date(validFrom).toISOString(),
        validTo: new Date(validTo).toISOString(),
      }),
    })
    const data = (await response.json().catch(() => ({}))) as { code?: string; error?: string }

    setPending(false)

    if (!response.ok || !data.code) {
      setError(data.error ?? 'Could not issue that pass.')
      return
    }

    setIssued({ code: data.code })
    setVisitorName('')
    setPlate('')
    router.refresh()
  }

  if (issued) {
    return (
      <div className="mt-6 rounded-xl border border-neutral-200 p-6 text-center dark:border-neutral-800">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Pass code</p>
        <p className="mt-2 font-mono text-3xl font-semibold tracking-[0.3em] text-neutral-900 dark:text-neutral-50">
          {issued.code}
        </p>
        <p className="mx-auto mt-3 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
          Send this to your visitor. Security will check it at the gate against
          the number plate you entered.
        </p>
        <button
          type="button"
          onClick={() => setIssued(null)}
          className="mt-5 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          Issue another
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="visitorName" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Visitor name
          </label>
          <input
            id="visitorName"
            value={visitorName}
            onChange={(e) => setVisitorName(e.target.value)}
            required
            maxLength={200}
            className={field}
          />
        </div>

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
          <label htmlFor="vehicleClass" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Vehicle
          </label>
          <select
            id="vehicleClass"
            value={vehicleClass}
            onChange={(e) => setVehicleClass(e.target.value)}
            className={field}
          >
            <option value="FOUR_WHEELER">Car</option>
            <option value="TWO_WHEELER">Two-wheeler</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="zone" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Zone <span className="font-normal text-neutral-400">— optional</span>
          </label>
          <select id="zone" value={zoneId} onChange={(e) => setZoneId(e.target.value)} className={field}>
            <option value="">Anywhere visitors are allowed</option>
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="validFrom" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Valid from
          </label>
          <input
            id="validFrom"
            type="datetime-local"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
            required
            className={field}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="validTo" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Valid until
          </label>
          <input
            id="validTo"
            type="datetime-local"
            value={validTo}
            onChange={(e) => setValidTo(e.target.value)}
            required
            className={field}
          />
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !visitorName || !plate}
        className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 sm:w-auto"
      >
        {pending ? 'Issuing…' : 'Issue pass'}
      </button>
    </form>
  )
}
