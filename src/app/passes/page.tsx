import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireActor } from '@/server/dal'
import { can, scopedZoneIds } from '@/server/permissions'
import { remainingQuota } from '@/server/passes/service'
import { PassStatus } from '@/generated/prisma/enums'
import { PageHeader } from '@/components/page-header'
import { IssuePassForm } from './issue-form'
import { PassList } from './pass-list'

export default async function PassesPage() {
  const actor = await requireActor()
  if (!can(actor, 'pass:issue')) redirect('/')

  const scope = scopedZoneIds(actor)

  const [zones, quota, passes] = await Promise.all([
    prisma.parkingZone.findMany({
      where: scope === null ? {} : { id: { in: scope } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    remainingQuota(actor),
    prisma.visitorPass.findMany({
      where: {
        OR: [{ issuedById: actor.userId }, { hostUserId: actor.userId }],
      },
      select: {
        id: true,
        code: true,
        visitorName: true,
        plate: true,
        status: true,
        validFrom: true,
        validTo: true,
        scannedAt: true,
        zone: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ])

  const active = passes.filter(
    (pass) => pass.status !== PassStatus.REVOKED && pass.validTo > new Date(),
  )

  const subtitle = quota === null
    ? 'You can issue passes without a limit.'
    : `${quota} left this week${active.length > 0 ? ` · ${active.length} active` : ''}`

  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <PageHeader
        title="Visitor passes"
        subtitle={subtitle}
        employeeId={actor.employeeId}
      />

      {quota !== null && quota <= 0 ? (
        <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          You have used all your visitor passes for this week. Ask security if
          you need another.
        </p>
      ) : (
        <IssuePassForm zones={zones} />
      )}

      <PassList passes={passes} />
    </main>
  )
}
