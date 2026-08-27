import { redirect } from 'next/navigation'
import { requireActor } from '@/server/dal'
import { holdsPermission } from '@/server/permissions'
import { buildAnalytics, rangeFromDays } from '@/server/analytics/service'
import { VIOLATION_LABELS } from '@/components/status-badge'

const RANGES = [7, 30, 90]

export default async function AnalyticsPage(props: PageProps<'/admin/analytics'>) {
  const actor = await requireActor()
  if (!holdsPermission(actor, 'analytics:read')) redirect('/')

  const params = await props.searchParams
  const requested = Number(Array.isArray(params.days) ? params.days[0] : params.days)
  const days = RANGES.includes(requested) ? requested : 30

  const data = await buildAnalytics(actor, rangeFromDays(days))

  return (
    <main className="py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Analytics</h1>
          <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
            {data.range.label}
            {data.scopedToZones !== null &&
              ` · limited to your ${data.scopedToZones} zone${data.scopedToZones === 1 ? '' : 's'}`}
          </p>
        </div>
        <nav className="flex gap-2">
          {RANGES.map((option) => (
            <a
              key={option}
              href={`/admin/analytics?days=${option}`}
              className={
                option === days
                  ? 'rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900'
                  : 'rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800'
              }
            >
              {option}d
            </a>
          ))}
        </nav>
      </div>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Violations filed" value={data.violations.total} />
        <Stat
          label="Upheld on review"
          value={data.violations.approvalRate === null ? '—' : `${data.violations.approvalRate}%`}
          hint={data.violations.approvalRate === null ? 'none decided yet' : undefined}
        />
        <Stat
          label="Avg stay"
          value={data.parking.averageMinutes === null ? '—' : formatMinutes(data.parking.averageMinutes)}
          hint={
            data.parking.closedSessions === 0
              ? 'no completed sessions'
              : `${data.parking.closedSessions} sessions`
          }
        />
        <Stat
          label="Avg response"
          value={
            data.response.averageResponseMinutes === null
              ? '—'
              : formatMinutes(data.response.averageResponseMinutes)
          }
          hint={data.response.dispatches === 0 ? 'no dispatches' : `${data.response.dispatches} sent`}
        />
      </section>

      <Panel title="Zone utilisation" empty={data.zones.length === 0 ? 'No zones.' : null}>
        <ul className="space-y-3">
          {data.zones.map((zone) => (
            <li key={zone.zoneId}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-neutral-900 dark:text-neutral-100">
                  {zone.name}
                  {zone.isCapacityOnly && (
                    <span className="ml-1.5 text-xs text-neutral-400">capacity-only</span>
                  )}
                </span>
                <span className="tabular-nums text-neutral-500 dark:text-neutral-400">
                  {zone.occupied}/{zone.capacity} · {zone.percent}%
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                <div
                  className="h-full rounded-full bg-neutral-900 dark:bg-neutral-100"
                  style={{ width: `${Math.min(100, zone.percent)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <Panel
          title="By type"
          empty={data.violations.byType.length === 0 ? 'Nothing reported yet.' : null}
        >
          <ul className="space-y-2 text-sm">
            {data.violations.byType.map((entry) => (
              <li key={entry.type} className="flex justify-between gap-3">
                <span className="text-neutral-700 dark:text-neutral-300">
                  {VIOLATION_LABELS[entry.type] ?? entry.type}
                </span>
                <span className="tabular-nums text-neutral-900 dark:text-neutral-100">
                  {entry.count}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="Repeat offenders"
          empty={data.repeatOffenders.length === 0 ? 'Nobody has more than one upheld report.' : null}
        >
          <ul className="space-y-2 text-sm">
            {data.repeatOffenders.map((offender) => (
              <li key={offender.plateNumber} className="flex justify-between gap-3">
                <span>
                  <span className="font-mono text-neutral-900 dark:text-neutral-100">
                    {offender.plateNumber}
                  </span>
                  <span className="ml-2 text-neutral-500 dark:text-neutral-400">
                    {offender.ownerName}
                  </span>
                </span>
                <span className="tabular-nums text-neutral-900 dark:text-neutral-100">
                  {offender.upheld}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Appeals" empty={data.appeals.filed === 0 ? 'No appeals filed.' : null}>
          <dl className="space-y-2 text-sm">
            <Line label="Filed" value={data.appeals.filed} />
            <Line label="Decided" value={data.appeals.decided} />
            <Line label="Overturned" value={data.appeals.overturned} />
            <Line
              label="Success rate"
              value={data.appeals.successRate === null ? '—' : `${data.appeals.successRate}%`}
            />
          </dl>
        </Panel>

        <Panel
          title="Busiest arrival hours"
          empty={data.parking.peakHours.length === 0 ? 'No check-ins yet.' : null}
        >
          <ul className="space-y-2 text-sm">
            {data.parking.peakHours.map((entry) => (
              <li key={entry.hour} className="flex justify-between gap-3">
                <span className="text-neutral-700 dark:text-neutral-300">
                  {String(entry.hour).padStart(2, '0')}:00 – {String(entry.hour + 1).padStart(2, '0')}:00
                </span>
                <span className="tabular-nums text-neutral-900 dark:text-neutral-100">
                  {entry.count}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <p className="mt-8 text-xs text-neutral-400 dark:text-neutral-500">
        Durations count only completed sessions — an open check-in has no end,
        and averaging it in would understate every figure. There is no revenue
        metric because v1 issues no fines.
      </p>
    </main>
  )
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string
  value: string | number
  hint?: string
}) {
  return (
    <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <p className="text-2xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{label}</p>
      {hint && <p className="text-xs text-neutral-400 dark:text-neutral-500">{hint}</p>}
    </div>
  )
}

function Panel({
  title,
  empty,
  children,
}: {
  title: string
  empty: string | null
  children: React.ReactNode
}) {
  return (
    <section className="mt-6 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">{title}</h2>
      {empty ? <p className="text-sm text-neutral-400">{empty}</p> : children}
    </section>
  )
}

function Line({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-neutral-700 dark:text-neutral-300">{label}</dt>
      <dd className="tabular-nums text-neutral-900 dark:text-neutral-100">{value}</dd>
    </div>
  )
}
