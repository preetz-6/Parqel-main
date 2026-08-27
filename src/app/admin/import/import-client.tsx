'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const KINDS = [
  { id: 'users', label: 'People', order: 1 },
  { id: 'vehicles', label: 'Vehicles', order: 2 },
  { id: 'zones', label: 'Zones', order: 3 },
  { id: 'spots', label: 'Spots', order: 4 },
] as const

type Kind = (typeof KINDS)[number]['id']

type RowIssue = { row: number; column?: string; message: string }
type Plan = {
  kind: Kind
  totalRows: number
  toCreate: number
  toUpdate: number
  issues: RowIssue[]
  notes: string[]
}

export function ImportClient({ samples }: { samples: Record<Kind, string> }) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)

  const [kind, setKind] = useState<Kind>('users')
  const [csv, setCsv] = useState('')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [done, setDone] = useState<{ created: number; updated: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function reset() {
    setPlan(null)
    setDone(null)
    setError(null)
  }

  async function send(mode: 'plan' | 'commit') {
    setPending(true)
    setError(null)

    const response = await fetch('/api/admin/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, csv, mode }),
    })
    const data = (await response.json().catch(() => ({}))) as {
      plan?: Plan
      result?: { created: number; updated: number }
      error?: string
    }

    setPending(false)

    if (data.error) {
      setError(data.error)
      return
    }

    if (mode === 'plan') {
      setPlan(data.plan ?? null)
      setDone(null)
      return
    }

    if (data.result) {
      setDone(data.result)
      setPlan(null)
      setCsv('')
      if (fileInput.current) fileInput.current.value = ''
      router.refresh()
    } else if (data.plan) {
      // The file stopped being valid between preview and commit.
      setPlan(data.plan)
      setError('The file changed or the data moved on. Review and try again.')
    }
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setCsv(await file.text())
    reset()
  }

  const blocked = (plan?.issues.length ?? 0) > 0

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap gap-2">
        {KINDS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => {
              setKind(option.id)
              reset()
            }}
            className={
              kind === option.id
                ? 'rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900'
                : 'rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800'
            }
          >
            <span className="mr-1.5 text-xs opacity-60">{option.order}</span>
            {option.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            className="text-sm text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:text-sm file:text-neutral-700 dark:text-neutral-300 dark:file:bg-neutral-800 dark:file:text-neutral-200"
          />
          <button
            type="button"
            onClick={() => {
              setCsv(samples[kind])
              reset()
            }}
            className="text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            Load a sample
          </button>
        </div>

        <textarea
          value={csv}
          onChange={(e) => {
            setCsv(e.target.value)
            reset()
          }}
          rows={8}
          spellCheck={false}
          placeholder="Upload a .csv above, or paste rows here…"
          className="w-full rounded-lg border border-neutral-300 bg-white p-3 font-mono text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => send('plan')}
          disabled={pending || !csv.trim()}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          {pending ? 'Checking…' : 'Preview'}
        </button>

        {plan && !blocked && (
          <button
            type="button"
            onClick={() => send('commit')}
            disabled={pending}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {pending
              ? 'Importing…'
              : `Import ${plan.toCreate + plan.toUpdate} row${plan.toCreate + plan.toUpdate === 1 ? '' : 's'}`}
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {done && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-300">
          Imported. {done.created} created, {done.updated} updated.
        </div>
      )}

      {plan && (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800">
          <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-neutral-200 px-4 py-3 text-sm dark:border-neutral-800">
            <span className="text-neutral-900 dark:text-neutral-100">
              <strong className="tabular-nums">{plan.toCreate}</strong> to create
            </span>
            <span className="text-neutral-900 dark:text-neutral-100">
              <strong className="tabular-nums">{plan.toUpdate}</strong> to update
            </span>
            {blocked && (
              <span className="text-red-600 dark:text-red-400">
                <strong className="tabular-nums">{plan.issues.length}</strong> problem
                {plan.issues.length === 1 ? '' : 's'}
              </span>
            )}
          </div>

          {plan.notes.length > 0 && (
            <ul className="border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
              {plan.notes.map((note) => (
                <li key={note} className="text-xs text-neutral-500 dark:text-neutral-400">
                  {note}
                </li>
              ))}
            </ul>
          )}

          {blocked ? (
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
                  <tr>
                    <th className="px-4 py-2 font-medium">Row</th>
                    <th className="px-4 py-2 font-medium">Column</th>
                    <th className="px-4 py-2 font-medium">Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.issues.map((issue, index) => (
                    <tr
                      key={`${issue.row}-${issue.column}-${index}`}
                      className="border-t border-neutral-100 dark:border-neutral-800"
                    >
                      <td className="px-4 py-2 tabular-nums text-neutral-500">{issue.row}</td>
                      <td className="px-4 py-2 font-mono text-xs text-neutral-500">
                        {issue.column ?? '—'}
                      </td>
                      <td className="px-4 py-2 text-neutral-800 dark:text-neutral-200">
                        {issue.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-neutral-200 px-4 py-2 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                Nothing is imported while there are problems. Fix the spreadsheet and preview again.
              </p>
            </div>
          ) : (
            <p className="px-4 py-3 text-sm text-neutral-600 dark:text-neutral-300">
              No problems found. Ready to import.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
