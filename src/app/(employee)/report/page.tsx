import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireActor } from '@/server/dal'
import { can, holdsPermission, scopedZoneIds } from '@/server/permissions'
import { ocrConfigured } from '@/server/violations/ocr'
import { ReportForm } from './report-form'

export default async function ReportPage() {
  const actor = await requireActor()

  if (!holdsPermission(actor, 'violation:report')) redirect('/')

  const scope = scopedZoneIds(actor)

  const zones = await prisma.parkingZone.findMany({
    where: scope === null ? {} : { id: { in: scope } },
    select: { id: true, name: true, building: true, vehicleClass: true },
    orderBy: { name: 'asc' },
  })

  // A zone-scoped guard with no zones in scope has nowhere to report.
  const reportable = zones.filter((zone) => can(actor, 'violation:report', { zoneId: zone.id }))

  return (
    <>
      <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
        Report a vehicle
      </h1>

      {reportable.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
          There are no zones you can report in yet.
        </p>
      ) : (
        <div className="mt-4">
          <ReportForm zones={reportable} ocrEnabled={ocrConfigured()} />
        </div>
      )}

      <p className="mt-6 text-xs leading-relaxed text-neutral-400 dark:text-neutral-500">
        Reports go to security for verification before the owner is contacted.
        You will not be told who owns the vehicle. Filing a knowingly false
        report is itself a violation.
      </p>
    </>
  )
}
