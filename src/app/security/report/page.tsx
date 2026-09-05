import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireActor } from '@/server/dal'
import { can, holdsPermission, scopedZoneIds } from '@/server/permissions'
import { ocrConfigured } from '@/server/violations/ocr'
import { ReportForm } from '@/app/(employee)/report/report-form'

export default async function SecurityPatrolReportPage() {
  const actor = await requireActor()

  if (!holdsPermission(actor, 'violation:report')) {
    redirect('/security')
  }

  const scope = scopedZoneIds(actor)

  const zones = await prisma.parkingZone.findMany({
    where: scope === null ? {} : { id: { in: scope } },
    select: { id: true, name: true, building: true, vehicleClass: true },
    orderBy: { name: 'asc' },
  })

  // A zone-scoped guard with no zones in scope has nowhere to report.
  const reportable = zones.filter((zone) => can(actor, 'violation:report', { zoneId: zone.id }))

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div>
        <Link
          href="/security"
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          ← Security Queue
        </Link>
        <h1 className="mt-2 text-xl font-bold text-neutral-900 dark:text-neutral-50">
          Report a vehicle on patrol
        </h1>
        <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
          File a parking violation report directly from patrol. Another guard or supervisor on shift will verify and issue the citation.
        </p>
      </div>

      {reportable.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
          There are no zones you can report in.
        </p>
      ) : (
        <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900/40">
          <ReportForm
            zones={reportable}
            ocrEnabled={ocrConfigured()}
            redirectPrefix="/security"
          />
        </div>
      )}
    </div>
  )
}
