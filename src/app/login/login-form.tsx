'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const inputClass =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 ' +
  'placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none ' +
  'dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-400'

const primaryButtonClass =
  'w-full rounded-lg bg-neutral-900 px-3 py-2.5 text-sm font-medium text-white ' +
  'hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed ' +
  'dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200'

export function LoginForm({
  ssoEnabled,
  initialError,
}: {
  ssoEnabled: boolean
  initialError: string | null
}) {
  const router = useRouter()

  const [employeeId, setEmployeeId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(initialError)
  const [pending, setPending] = useState(false)

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId, password }),
    })
    const data = (await response.json().catch(() => ({}))) as { error?: string }

    if (!response.ok) {
      setPending(false)
      setError(data.error ?? 'Could not sign in.')
      return
    }

    router.replace('/')
    router.refresh()
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      {ssoEnabled && (
        <>
          <a
            href="/api/auth/google/start"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-300 px-3 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            Continue with work Google account
          </a>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
            <span className="text-xs text-neutral-400">or</span>
            <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
          </div>
        </>
      )}

      <form onSubmit={handleLogin} className="space-y-3">
        <div>
          <label
            htmlFor="employeeId"
            className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
          >
            Employee ID
          </label>
          <input
            id="employeeId"
            name="employeeId"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
            autoComplete="username"
            autoFocus
            required
            placeholder="ADM001"
            className={inputClass}
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            placeholder="••••••••"
            className={inputClass}
          />
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={pending || !employeeId || !password}
          className={primaryButtonClass}
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
