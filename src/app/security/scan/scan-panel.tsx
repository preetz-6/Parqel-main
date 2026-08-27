'use client'

import { useState } from 'react'

type Verdict = {
  valid: boolean
  reason: 'ok' | 'not_found' | 'revoked' | 'expired' | 'not_yet_valid'
  pass?: {
    code: string
    visitorName: string
    plate: string
    vehicleClass: string
    validFrom: string
    validTo: string
    zoneName: string | null
    hostName: string
    hostEmployeeId: string
    previouslyScannedAt: string | null
  }
}

const REASONS: Record<Verdict['reason'], string> = {
  ok: 'Let them in',
  not_found: 'No such pass',
  revoked: 'This pass was revoked',
  expired: 'This pass has expired',
  not_yet_valid: 'This pass is not valid yet',
}

export function ScanPanel() {
  const [code, setCode] = useState('')
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function check(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    setVerdict(null)

    const response = await fetch('/api/passes/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    const data = (await response.json().catch(() => ({}))) as Verdict & { error?: string }

    setPending(false)

    if (!response.ok) {
      setError(data.error ?? 'Could not check that code.')
      return
    }

    setVerdict(data)
  }

  return (
    <div className="mt-6 space-y-5">
      <form onSubmit={check} className="space-y-3">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABCD2345"
          autoFocus
          autoCapitalize="characters"
          autoComplete="off"
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-3 text-center font-mono text-2xl tracking-[0.3em] text-neutral-900 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        />
        <button
          type="submit"
          disabled={pending || code.length < 4}
          className="w-full rounded-lg bg-neutral-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {pending ? 'Checking…' : 'Check pass'}
        </button>
      </form>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {verdict && (
        <div
          className={
            verdict.valid
              ? 'rounded-xl border-2 border-green-500 bg-green-50 p-5 dark:bg-green-950/30'
              : 'rounded-xl border-2 border-red-500 bg-red-50 p-5 dark:bg-red-950/30'
          }
        >
          <p
            className={
              verdict.valid
                ? 'text-lg font-semibold text-green-800 dark:text-green-300'
                : 'text-lg font-semibold text-red-800 dark:text-red-300'
            }
          >
            {REASONS[verdict.reason]}
          </p>

          {verdict.pass && (
            <>
              {/* The plate is the thing the guard actually compares against the
                  vehicle in front of them, so it leads. */}
              <p className="mt-3 font-mono text-2xl font-semibold tracking-wider text-neutral-900 dark:text-neutral-50">
                {verdict.pass.plate}
              </p>
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                {verdict.pass.vehicleClass === 'TWO_WHEELER' ? 'Two-wheeler' : 'Car'} ·{' '}
                {verdict.pass.visitorName}
              </p>

              <dl className="mt-4 space-y-1 border-t border-black/10 pt-3 text-sm dark:border-white/10">
                <div className="flex justify-between gap-3">
                  <dt className="text-neutral-500 dark:text-neutral-400">Host</dt>
                  <dd className="text-neutral-900 dark:text-neutral-100">
                    {verdict.pass.hostName} ({verdict.pass.hostEmployeeId})
                  </dd>
                </div>
                {verdict.pass.zoneName && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-neutral-500 dark:text-neutral-400">Zone</dt>
                    <dd className="text-neutral-900 dark:text-neutral-100">{verdict.pass.zoneName}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <dt className="text-neutral-500 dark:text-neutral-400">Valid until</dt>
                  <dd className="text-neutral-900 dark:text-neutral-100">
                    {new Date(verdict.pass.validTo).toLocaleString('en-IN', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </dd>
                </div>
              </dl>

              {verdict.pass.previouslyScannedAt && (
                <p className="mt-3 rounded-lg bg-black/5 px-3 py-2 text-sm text-neutral-700 dark:bg-white/10 dark:text-neutral-200">
                  Already checked in at{' '}
                  {new Date(verdict.pass.previouslyScannedAt).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  . Re-entry is normal — use your judgement.
                </p>
              )}
            </>
          )}

          <button
            type="button"
            onClick={() => {
              setVerdict(null)
              setCode('')
            }}
            className="mt-4 w-full rounded-lg border border-black/15 px-4 py-2 text-sm font-medium text-neutral-700 dark:border-white/20 dark:text-neutral-200"
          >
            Check another
          </button>
        </div>
      )}
    </div>
  )
}
