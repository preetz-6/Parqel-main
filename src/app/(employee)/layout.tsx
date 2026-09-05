import { redirect } from 'next/navigation'
import { requireActor } from '@/server/dal'
import { holdsPermission } from '@/server/permissions'
import { EmployeeSidebar } from '@/components/employee-sidebar'

/**
 * Shared layout for all employee-facing pages.
 *
 * Admin-level users are redirected to /admin — they should never see
 * this layout. The redirect is the same check that page.tsx used to do
 * inline; centralising it here covers every employee route.
 */
export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor()

  // Admin-level users land on the admin dashboard instead.
  const isAdmin =
    holdsPermission(actor, 'import:csv') ||
    holdsPermission(actor, 'zone:write') ||
    holdsPermission(actor, 'user:manage')
  if (isAdmin) redirect('/admin')

  // Security personnel (guards/supervisors) land on the security queue.
  const isSecurity = holdsPermission(actor, 'violation:triage')
  if (isSecurity) redirect('/security')

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <EmployeeSidebar actor={actor} />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-6 py-6">
          {children}
        </div>
      </main>
    </div>
  )
}
