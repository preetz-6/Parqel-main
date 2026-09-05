import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireActor } from '@/server/dal'
import { can } from '@/server/permissions'
import { readAuditLog } from '@/server/audit-query'

function one(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  return raw && raw.length > 0 ? raw : undefined
}

export default async function AuditPage(props: PageProps<'/admin/audit'>) {
  const actor = await requireActor()

  if (!can(actor, 'audit:read')) redirect('/admin')

  const params = await props.searchParams
  const filters = {
    action: one(params.action),
    entity: one(params.entity),
    actorEmployeeId: one(params.who),
    page: Number(one(params.page) ?? 1) || 1,
  }

  const log = await readAuditLog(actor, filters)

  const queryFor = (overrides: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams()
    const merged = {
      action: filters.action,
      entity: filters.entity,
      who: filters.actorEmployeeId,
      page: filters.page,
      ...overrides,
    }
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined && value !== '' && !(key === 'page' && value === 1)) {
        next.set(key, String(value))
      }
    }
    const qs = next.toString()
    return qs ? `/admin/audit?${qs}` : '/admin/audit'
  }

  return (
    <main className="py-6">
      <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Audit log</h1>
      <p className="mt-1 max-w-prose text-sm text-neutral-500 dark:text-neutral-400">
        Append-only. Every change commits with its audit row in the same
        transaction, so nothing that happened is missing here.
        {log.restricted && (
          <>
            {' '}
            You are seeing parking actions only — sign-ins and access denials
            are visible to administrators.
          </>
        )}
      </p>

      <form method="get" className="mt-5 flex flex-wrap items-end gap-3">
        <label className="text-xs text-neutral-500 dark:text-neutral-400">
          Action
          <select
            name="action"
            defaultValue={filters.action ?? ''}
            className="mt-1 block rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          >
            <option value="">All</option>
            {log.actions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-neutral-500 dark:text-neutral-400">
          Employee ID
          <input
            name="who"
            defaultValue={filters.actorEmployeeId ?? ''}
            placeholder="PRK001"
            className="mt-1 block rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
        </label>

        <button
          type="submit"
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          Filter
        </button>

        {(filters.action || filters.actorEmployeeId) && (
          <Link href="/admin/audit" className="text-sm text-neutral-500 underline underline-offset-2">
            Clear
          </Link>
        )}
      </form>

      <p className="mt-4 text-xs text-neutral-400">
        {log.total} entr{log.total === 1 ? 'y' : 'ies'}
        {log.pageCount > 1 && ` · page ${log.page} of ${log.pageCount}`}
      </p>

      {log.rows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-400 dark:border-neutral-700">
          Nothing matches those filters.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Who</th>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Entity</th>
              </tr>
            </thead>
            <tbody>
              {log.rows.map((row) => (
                <tr key={row.id} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="whitespace-nowrap px-4 py-2 text-xs tabular-nums text-neutral-500">
                    {row.createdAt.toLocaleString('en-IN', {
                      dateStyle: 'short',
                      timeStyle: 'medium',
                    })}
                  </td>
                  <td className="px-4 py-2">
                    {row.actor ? (
                      <>
                        <span className="text-neutral-900 dark:text-neutral-100">
                          {row.actor.name}
                        </span>
                        <span className="ml-1.5 font-mono text-xs text-neutral-400">
                          {row.actor.employeeId}
                        </span>
                      </>
                    ) : (
                      <span className="text-neutral-400">anonymous</span>
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-neutral-800 dark:text-neutral-200">
                    {row.action}
                  </td>
                  <td className="px-4 py-2 text-xs text-neutral-500">
                    {row.entity}
                    <span className="ml-1.5 font-mono text-neutral-400">
                      {row.entityId.slice(0, 8)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {log.pageCount > 1 && (
        <nav className="mt-4 flex justify-between">
          {log.page > 1 ? (
            <Link
              href={queryFor({ page: log.page - 1 })}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
            >
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          {log.page < log.pageCount && (
            <Link
              href={queryFor({ page: log.page + 1 })}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
            >
              Older →
            </Link>
          )}
        </nav>
      )}
    </main>
  )
}
