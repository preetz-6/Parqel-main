'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Pass = {
  id: string
  code: string
  visitorName: string
  plate: string
  status: string
  validFrom: Date
  validTo: Date
  scannedAt: Date | null
  zone: { name: string } | null
}

function describe(pass: Pass): { label: string; className: string } {
  if (pass.status === 'REVOKED') {
    return { label: 'Revoked', className: 'text-neutral-400' }
  }
  if (new Date(pass.validTo) < new Date()) {
    return { label: 'Expired', className: 'text-neutral-400' }
  }
  if (pass.scannedAt) {
    return { label: 'Arrived', className: 'text-green-600 dark:text-green-400' }
  }
  if (new Date(pass.validFrom) > new Date()) {
    return { label: 'Upcoming', className: 'text-blue-600 dark:text-blue-400' }
  }
  return { label: 'Active', className: 'text-neutral-600 dark:text-neutral-300' }
}

export function PassList({ passes }: { passes: Pass[] }) {
  const router = useRouter()
  const [revoking, setRevoking] = useState<string | null>(null)

  async function revoke(id: string) {
    setRevoking(id)
    await fetch(`/api/passes/${id}/revoke`, { method: 'POST' })
    setRevoking(null)
    router.refresh()
  }

  if (passes.length === 0) {
    return (
      <p className="mt-8 rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-400 dark:border-neutral-700">
        You have not issued any passes yet.
      </p>
    )
  }

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Passes you issued
      </h2>

      <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {passes.map((pass) => {
          const state = describe(pass)
          const revocable = pass.status !== 'REVOKED' && new Date(pass.validTo) > new Date()

          return (
            <li key={pass.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-medium tracking-wider text-neutral-900 dark:text-neutral-100">
                    {pass.code}
                  </span>
                  <span className={`text-xs font-medium ${state.className}`}>{state.label}</span>
                </div>
                <p className="mt-0.5 truncate text-sm text-neutral-500 dark:text-neutral-400">
                  {pass.visitorName} · <span className="font-mono">{pass.plate}</span>
                  {pass.zone ? ` · ${pass.zone.name}` : ''}
                </p>
                <p className="text-xs text-neutral-400">
                  until{' '}
                  {new Date(pass.validTo).toLocaleString('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </p>
              </div>

              {revocable && (
                <button
                  type="button"
                  onClick={() => revoke(pass.id)}
                  disabled={revoking === pass.id}
                  className="shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  {revoking === pass.id ? 'Revoking…' : 'Revoke'}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
