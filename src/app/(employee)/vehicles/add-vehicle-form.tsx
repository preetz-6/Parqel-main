'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const field =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 ' +
  'focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 ' +
  'dark:text-neutral-100 dark:focus:border-neutral-400'

export function AddVehicleForm() {
  const router = useRouter()
  const [plate, setPlate] = useState('')
  const [vehicleClass, setVehicleClass] = useState<'TWO_WHEELER' | 'FOUR_WHEELER'>('FOUR_WHEELER')
  const [makeModel, setMakeModel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [success, setSuccess] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setPending(true)

    const response = await fetch('/api/vehicles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plateNumber: plate.trim(),
        vehicleClass,
        makeModel: makeModel.trim() || undefined,
      }),
    })
    const data = (await response.json().catch(() => ({}))) as { error?: string }
    setPending(false)

    if (!response.ok) {
      setError(data.error ?? 'Could not register that vehicle.')
      return
    }

    setPlate('')
    setMakeModel('')
    setSuccess(true)
    router.refresh()
    setTimeout(() => setSuccess(false), 3000)
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
    >
      <div className="space-y-3">
        <div>
          <label htmlFor="plate" className="mb-1 block text-sm text-neutral-600 dark:text-neutral-400">
            Number plate
          </label>
          <input
            id="plate"
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
            placeholder="KA 05 MN 1234"
            required
            minLength={4}
            className={`${field} font-mono tracking-wider`}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-neutral-600 dark:text-neutral-400">
            Vehicle class
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setVehicleClass('TWO_WHEELER')}
              className={
                vehicleClass === 'TWO_WHEELER'
                  ? 'flex-1 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900'
                  : 'flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800'
              }
            >
              2-wheeler
            </button>
            <button
              type="button"
              onClick={() => setVehicleClass('FOUR_WHEELER')}
              className={
                vehicleClass === 'FOUR_WHEELER'
                  ? 'flex-1 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900'
                  : 'flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800'
              }
            >
              4-wheeler
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="makeModel" className="mb-1 block text-sm text-neutral-600 dark:text-neutral-400">
            Make / model <span className="text-neutral-400">— optional</span>
          </label>
          <input
            id="makeModel"
            value={makeModel}
            onChange={(e) => setMakeModel(e.target.value)}
            placeholder="e.g. Honda Activa, Maruti Swift"
            maxLength={100}
            className={field}
          />
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {success && (
        <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-300">
          Vehicle submitted for approval.
        </p>
      )}

      <button
        type="submit"
        disabled={pending || plate.trim().length < 4}
        className="mt-4 w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {pending ? 'Submitting…' : 'Submit for approval'}
      </button>
    </form>
  )
}
