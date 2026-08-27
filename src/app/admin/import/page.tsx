import { redirect } from 'next/navigation'
import { currentCan } from '@/server/dal'
import { SAMPLE_CSV } from '@/server/import/schemas'
import { ImportClient } from './import-client'

export default async function ImportPage() {
  if (!(await currentCan('import:csv'))) redirect('/admin')

  return (
    <main className="py-6">
      <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Import data</h1>
      <p className="mt-1 max-w-prose text-sm text-neutral-500 dark:text-neutral-400">
        Load the roster, vehicles, zones and spots from spreadsheet exports.
        Import in that order — vehicles need their owners to exist, and spots
        need their zones. Every import is previewed before anything is written.
      </p>

      <ImportClient samples={SAMPLE_CSV} />
    </main>
  )
}
