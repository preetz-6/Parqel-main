'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Zone = {
  zoneId: string
  name: string
  building: string | null
  vehicleClass: string
  capacity: number
  free: number
  bookable: boolean
  reason: string | null
}

type Vehicle = { id: string; plateNumber: string; vehicleClass: string }

type Booking = {
  id: string
  status: string
  startTime: string
  endTime: string
  holdUntil: string
  zoneName: string
  spotCode: string | null
  plateNumber: string
}

const field =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 ' +
  'focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 ' +
  'dark:text-neutral-100'

function toLocalInput(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

/** Live countdown to the hold expiry, so a no-show is visible before it happens. */
function HoldCountdown({ holdUntil }: { holdUntil: string }) {
  const [remaining, setRemaining] = useState(() => Date.parse(holdUntil) - Date.now())

  useEffect(() => {
    const timer = setInterval(() => setRemaining(Date.parse(holdUntil) - Date.now()), 1000)
    return () => clearInterval(timer)
  }, [holdUntil])

  if (remaining <= 0) {
    return (
      <span className="text-sm font-medium text-red-600 dark:text-red-400">
        Hold expired — refresh to rebook
      </span>
    )
  }

  const minutes = Math.floor(remaining / 60_000)
  const seconds = Math.floor((remaining % 60_000) / 1000)

  return (
    <span className="text-sm text-neutral-600 dark:text-neutral-300">
      Check in within{' '}
      <strong className="tabular-nums">
        {minutes}:{String(seconds).padStart(2, '0')}
      </strong>{' '}
      or the slot is released
    </span>
  )
}

export function BookingPanel({
  zones,
  vehicles,
  booking,
}: {
  zones: Zone[]
  vehicles: Vehicle[]
  booking: Booking | null
}) {
  const router = useRouter()
  const now = new Date()

  const bookable = zones.filter((zone) => zone.bookable && zone.free > 0)

  const [zoneId, setZoneId] = useState(bookable[0]?.zoneId ?? '')
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? '')
  const [startTime, setStartTime] = useState(toLocalInput(now))
  const [endTime, setEndTime] = useState(toLocalInput(new Date(now.getTime() + 4 * 3600_000)))
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)

  async function book(event: React.FormEvent) {
    event.preventDefault()
    setPending('book')
    setError(null)

    const response = await fetch('/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        zoneId,
        vehicleId,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
      }),
    })
    const data = (await response.json().catch(() => ({}))) as { error?: string }

    setPending(null)
    if (!response.ok) {
      setError(data.error ?? 'Could not book that.')
      return
    }
    router.refresh()
  }

  async function act(action: 'checkIn' | 'cancel') {
    if (!booking) return
    setPending(action)
    setError(null)

    const response = await fetch(`/api/reservations/${booking.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    const data = (await response.json().catch(() => ({}))) as { error?: string }

    setPending(null)
    if (!response.ok) {
      setError(data.error ?? 'Could not do that.')
      return
    }
    router.refresh()
  }

  return (
    <div className="mt-6 space-y-8">
      {booking && (
        <section className="rounded-xl border-2 border-neutral-900 p-5 dark:border-neutral-100">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {booking.status === 'CHECKED_IN' ? 'You are parked' : 'Your booking'}
            </h2>
            <span className="font-mono text-sm text-neutral-500">{booking.plateNumber}</span>
          </div>

          <p className="mt-2 text-neutral-900 dark:text-neutral-50">
            <span className="text-2xl font-semibold">{booking.spotCode ?? '—'}</span>
            <span className="ml-2 text-sm text-neutral-500 dark:text-neutral-400">
              {booking.zoneName}
            </span>
          </p>

          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {new Date(booking.startTime).toLocaleString('en-IN', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}{' '}
            —{' '}
            {new Date(booking.endTime).toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>

          {booking.status === 'HELD' && (
            <p className="mt-3">
              <HoldCountdown holdUntil={booking.holdUntil} />
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {booking.status === 'HELD' && (
              <button
                type="button"
                onClick={() => act('checkIn')}
                disabled={pending !== null}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
              >
                {pending === 'checkIn' ? 'Checking in…' : "I've parked — check in"}
              </button>
            )}
            <button
              type="button"
              onClick={() => act('cancel')}
              disabled={pending !== null}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              {pending === 'cancel' ? 'Cancelling…' : 'Cancel'}
            </button>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Availability
        </h2>
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {zones.map((zone) => (
            <li key={zone.zoneId} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {zone.name}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  {zone.building ? `${zone.building} · ` : ''}
                  {zone.reason ?? 'Bookable'}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p
                  className={
                    zone.free === 0
                      ? 'text-sm font-semibold tabular-nums text-red-600 dark:text-red-400'
                      : 'text-sm font-semibold tabular-nums text-neutral-900 dark:text-neutral-100'
                  }
                >
                  {zone.free}
                </p>
                <p className="text-xs text-neutral-400">free</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {!booking && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Book a slot
          </h2>

          {vehicles.length === 0 ? (
            <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
              You have no approved vehicles. Ask the parking office to add one.
            </p>
          ) : bookable.length === 0 ? (
            <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
              Nothing is bookable for you right now.
            </p>
          ) : (
            <form onSubmit={book} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="zone" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Zone
                  </label>
                  <select id="zone" value={zoneId} onChange={(e) => setZoneId(e.target.value)} className={field}>
                    {bookable.map((zone) => (
                      <option key={zone.zoneId} value={zone.zoneId}>
                        {zone.name} ({zone.free} free)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="vehicle" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Vehicle
                  </label>
                  <select
                    id="vehicle"
                    value={vehicleId}
                    onChange={(e) => setVehicleId(e.target.value)}
                    className={field}
                  >
                    {vehicles.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.plateNumber}
                      </option>
                    ))}
                  </select>
                </div>

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

              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={pending !== null || !zoneId || !vehicleId}
                className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 sm:w-auto"
              >
                {pending === 'book' ? 'Booking…' : 'Book'}
              </button>
            </form>
          )}
        </section>
      )}

      {booking && error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  )
}
