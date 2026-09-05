'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Zone = { id: string; name: string; building: string | null; vehicleClass: string }

const TYPES = [
  { id: 'BLOCKING', label: 'Blocking my vehicle' },
  { id: 'WRONG_SLOT', label: 'In my assigned slot' },
  { id: 'FIRE_LANE', label: 'Blocking a fire lane or exit' },
  { id: 'DOUBLE_PARK', label: 'Double parked' },
  { id: 'NO_PERMIT', label: 'No permit for this zone' },
  { id: 'OTHER', label: 'Other' },
] as const

const field =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 ' +
  'focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 ' +
  'dark:text-neutral-100 dark:focus:border-neutral-400'

export function ReportForm({
  zones,
  ocrEnabled = false,
  redirectPrefix,
}: {
  zones: Zone[]
  ocrEnabled?: boolean
  redirectPrefix?: string
}) {
  const router = useRouter()
  const photoInput = useRef<HTMLInputElement>(null)
  const scanInput = useRef<HTMLInputElement>(null)

  const [type, setType] = useState<string>('BLOCKING')
  const [zoneId, setZoneId] = useState(zones[0]?.id ?? '')
  const [plate, setPlate] = useState('')
  const [note, setNote] = useState('')
  const [otherReason, setOtherReason] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  // Scan state
  const [scanning, setScanning] = useState(false)
  const [scanHint, setScanHint] = useState<string | null>(null)

  // Silent GPS — captured on mount, never shown to the user.
  const gpsRef = useRef<{ latitude: number; longitude: number } | null>(null)

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        gpsRef.current = { latitude: pos.coords.latitude, longitude: pos.coords.longitude }
      },
      () => { /* denied or unavailable — silently skip */ },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }, [])

  // The object URL is created in the change handler rather than an effect —
  // deriving it in an effect sets state during render and cascades. The ref
  // exists only so unmount can revoke whatever the current URL is.
  const previewUrlRef = useRef<string | null>(null)

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    },
    [],
  )

  function choosePhoto(file: File | null) {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const url = file ? URL.createObjectURL(file) : null
    previewUrlRef.current = url
    setPhoto(file)
    setPreviewUrl(url)
  }

  async function handleScanPlate(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setScanning(true)
    setScanHint(null)

    try {
      const body = new FormData()
      body.set('image', file)

      const response = await fetch('/api/ocr/scan', { method: 'POST', body })
      const data = (await response.json().catch(() => ({}))) as {
        plate?: string | null
        confidence?: number
        error?: string
      }

      if (data.plate) {
        setPlate(data.plate)
        const pct = data.confidence ? Math.round(data.confidence * 100) : 0
        setScanHint(`Scanned (${pct}% confidence) — edit if needed`)
      } else {
        setScanHint('Could not read the plate — type it manually')
      }
    } catch {
      setScanHint('Scan failed — type the plate manually')
    } finally {
      setScanning(false)
      // Reset so the same image can be re-selected
      if (scanInput.current) scanInput.current.value = ''
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (!photo) {
      setError('Attach a photo of the vehicle.')
      return
    }

    setPending(true)

    const body = new FormData()
    body.set('photo', photo)
    body.set('type', type)
    body.set('zoneId', zoneId)
    body.set('plateEntered', plate)

    // When the type is OTHER, prepend the reason to the note so security sees
    // the context without a schema change.
    const fullNote =
      type === 'OTHER' && otherReason.trim()
        ? note.trim()
          ? `Other: ${otherReason.trim()} — ${note.trim()}`
          : `Other: ${otherReason.trim()}`
        : note.trim()
    if (fullNote) body.set('note', fullNote)

    // Attach GPS if available — silent, no user prompt.
    if (gpsRef.current) {
      body.set('latitude', String(gpsRef.current.latitude))
      body.set('longitude', String(gpsRef.current.longitude))
    }

    const response = await fetch('/api/violations', { method: 'POST', body })
    const data = (await response.json().catch(() => ({}))) as { id?: string; error?: string }

    setPending(false)

    if (!response.ok || !data.id) {
      setError(data.error ?? 'Could not file that report.')
      return
    }

    const dest = redirectPrefix ? `${redirectPrefix}/${data.id}` : `/report/${data.id}`
    router.push(dest)
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          What is wrong?
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {TYPES.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setType(option.id)}
              className={
                type === option.id
                  ? 'rounded-lg bg-neutral-900 px-3 py-2 text-left text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900'
                  : 'rounded-lg border border-neutral-300 px-3 py-2 text-left text-sm text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800'
              }
            >
              {option.label}
            </button>
          ))}
        </div>

        {type === 'OTHER' && (
          <div className="mt-3">
            <label htmlFor="otherReason" className="mb-1 block text-sm text-neutral-600 dark:text-neutral-400">
              Describe the issue <span className="text-neutral-400">— required</span>
            </label>
            <input
              id="otherReason"
              value={otherReason}
              onChange={(e) => setOtherReason(e.target.value)}
              placeholder="e.g. Vehicle leaking fluids"
              required
              maxLength={200}
              className={field}
            />
          </div>
        )}
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="photo" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Photo <span className="font-normal text-neutral-400">— required as evidence</span>
        </label>
        <input
          ref={photoInput}
          id="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onChange={(e) => choosePhoto(e.target.files?.[0] ?? null)}
          className="w-full text-sm text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:text-neutral-700 dark:text-neutral-300 dark:file:bg-neutral-800 dark:file:text-neutral-200"
        />
        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- local blob preview, never optimised
          <img
            src={previewUrl}
            alt="Selected evidence"
            className="max-h-56 w-full rounded-lg border border-neutral-200 object-contain dark:border-neutral-800"
          />
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="plate" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Number plate
        </label>
        <div className="flex gap-2">
          <input
            id="plate"
            value={plate}
            onChange={(e) => {
              setPlate(e.target.value.toUpperCase())
              setScanHint(null)
            }}
            placeholder="KA 05 MN 1234"
            required
            className={`${field} font-mono tracking-wider flex-1`}
          />
          {ocrEnabled && (
            <>
              <input
                ref={scanInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={handleScanPlate}
                className="hidden"
                aria-hidden="true"
              />
              <button
                type="button"
                disabled={scanning}
                onClick={() => scanInput.current?.click()}
                className="shrink-0 rounded-lg border border-neutral-300 px-3 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                title="Scan the number plate with your camera"
              >
                {scanning ? (
                  <span className="flex items-center gap-1.5">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Reading…
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    Scan
                  </span>
                )}
              </button>
            </>
          )}
        </div>
        {scanHint ? (
          <p className={`text-xs ${scanHint.startsWith('Scanned') ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
            {scanHint}
          </p>
        ) : (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Security will confirm the match. Small typos are fine.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="zone" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Where
        </label>
        <select id="zone" value={zoneId} onChange={(e) => setZoneId(e.target.value)} className={field}>
          {zones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.name}
              {zone.building ? ` — ${zone.building}` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label htmlFor="note" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Anything else <span className="font-normal text-neutral-400">— optional</span>
        </label>
        <textarea
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={500}
          className={field}
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !plate || !photo || (type === 'OTHER' && !otherReason.trim())}
        className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {pending ? 'Filing…' : 'File report'}
      </button>
    </form>
  )
}
