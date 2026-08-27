import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentCan } from '@/server/dal'
import { ScanPanel } from './scan-panel'

export default async function ScanPage() {
  if (!(await currentCan('pass:scan'))) redirect('/')

  return (
    <main className="mx-auto w-full max-w-md p-6">
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
          Check a visitor pass
        </h1>
        <Link
          href="/security"
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          Queue
        </Link>
      </header>

      <ScanPanel />
    </main>
  )
}
