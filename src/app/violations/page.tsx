import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { requireActor } from '@/server/dal'
import { StatusBadge, VIOLATION_LABELS } from '@/components/status-badge'
import { PageHeader } from '@/components/page-header'

export default async function MyViolationsPage() {
  const actor = await requireActor()

  const [filed, against] = await Promise.all([
    prisma.violation.findMany({
      where: { reportedById: actor.userId },
      select: {
        id: true,
        type: true,
        status: true,
        plateEntered: true,
        createdAt: true,
        zone: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    // Only decided ones — before that the plate match is still a guess.
    prisma.violation.findMany({
      where: {
        matchedVehicle: { userId: actor.userId },
        status: { in: ['APPROVED', 'VOIDED'] },
      },
      select: {
        id: true,
        type: true,
        status: true,
        createdAt: true,
        zone: { select: { name: true } },
        matchedVehicle: { select: { plateNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ])

  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <PageHeader
        title="My reports"
        employeeId={actor.employeeId}
      />

      <Section title="Filed by me" empty="You have not reported anything yet.">
        {filed.map((violation) => (
          <Row
            key={violation.id}
            href={`/violations/${violation.id}`}
            plate={violation.plateEntered ?? '—'}
            type={violation.type}
            zone={violation.zone.name}
            status={violation.status}
            when={violation.createdAt}
          />
        ))}
      </Section>

      <Section title="Against my vehicles" empty="Nothing recorded against your vehicles.">
        {against.map((violation) => (
          <Row
            key={violation.id}
            href={`/violations/${violation.id}`}
            plate={violation.matchedVehicle?.plateNumber ?? '—'}
            type={violation.type}
            zone={violation.zone.name}
            status={violation.status}
            when={violation.createdAt}
          />
        ))}
      </Section>
    </main>
  )
}

function Section({
  title,
  empty,
  children,
}: {
  title: string
  empty: string
  children: React.ReactNode[]
}) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">{title}</h2>
      {children.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-400 dark:border-neutral-700">
          {empty}
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {children}
        </ul>
      )}
    </section>
  )
}

function Row({
  href,
  plate,
  type,
  zone,
  status,
  when,
}: {
  href: string
  plate: string
  type: string
  zone: string
  status: Parameters<typeof StatusBadge>[0]['status']
  when: Date
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {plate}
            </span>
            <StatusBadge status={status} />
          </div>
          <p className="mt-0.5 truncate text-sm text-neutral-500 dark:text-neutral-400">
            {VIOLATION_LABELS[type] ?? type} · {zone}
          </p>
        </div>
        <time dateTime={when.toISOString()} className="shrink-0 text-xs text-neutral-400">
          {when.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
        </time>
      </Link>
    </li>
  )
}
