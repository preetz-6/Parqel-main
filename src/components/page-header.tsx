import Link from 'next/link'

/**
 * Shared page header used across all dashboard pages.
 *
 * Provides consistent navigation (home link, page title, optional nav children),
 * the signed-in user's employee ID, and a sign-out button. Every protected page
 * should use this so there is always a visible way to end the session.
 */
export function PageHeader({
  title,
  subtitle,
  employeeId,
  children,
  backHref = '/',
  backLabel = 'Parqel',
}: {
  title: string
  subtitle?: string
  employeeId: string
  /** Optional nav links rendered between the title and the user info. */
  children?: React.ReactNode
  backHref?: string
  backLabel?: string
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-200 pb-4 dark:border-neutral-800">
      <div className="flex flex-wrap items-baseline gap-4">
        <div>
          <Link
            href={backHref}
            className="text-sm font-semibold text-neutral-900 dark:text-neutral-50"
          >
            {backLabel}
          </Link>
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">{title}</h1>
          {subtitle && (
            <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">{subtitle}</p>
          )}
        </div>
        {children && <nav className="flex flex-wrap gap-3 text-sm">{children}</nav>}
      </div>

      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-neutral-400">{employeeId}</span>
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  )
}
