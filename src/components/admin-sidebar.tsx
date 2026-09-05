import Link from 'next/link'
import {
  LayoutDashboard,
  CalendarDays,
  BarChart3,
  ScrollText,
  ClipboardList,
  Camera,
  QrCode,
  CarFront,
  Radio,
  Scale,
  UploadCloud,
  Home,
  LogOut,
} from 'lucide-react'
import type { Actor, Permission } from '@/server/permissions'
import { activeRoles, holdsPermission, can } from '@/server/permissions'

const ROLE_LABELS: Record<string, string> = {
  EMPLOYEE: 'Employee',
  GUARD: 'Guard',
  SUPERVISOR: 'Supervisor',
  ADMIN: 'Administrator',
}

/* ------------------------------------------------------------------ */
/* Operations navigation                                              */
/* ------------------------------------------------------------------ */

type NavItem = {
  href: string
  label: string
  icon: React.ReactNode
  anyOf: Permission[]
}

const OPERATIONS_NAV: NavItem[] = [
  { href: '/admin', label: 'Overview', icon: <LayoutDashboard size={18} />, anyOf: ['zone:write', 'user:manage', 'import:csv'] },
  { href: '/security', label: 'Violation Queue', icon: <ClipboardList size={18} />, anyOf: ['violation:triage'] },
  { href: '/security/report', label: 'Report a vehicle', icon: <Camera size={18} />, anyOf: ['violation:report'] },
  { href: '/admin/appeals', label: 'Appeals', icon: <Scale size={18} />, anyOf: ['appeal:review'] },
  { href: '/security/dispatch', label: 'Dispatch', icon: <Radio size={18} />, anyOf: ['dispatch:read'] },
  { href: '/security/scan', label: 'Gate scan', icon: <QrCode size={18} />, anyOf: ['pass:scan'] },
  { href: '/security/unknown', label: 'Unknown vehicles', icon: <CarFront size={18} />, anyOf: ['unknownVehicle:log'] },
  { href: '/admin/events', label: 'Events', icon: <CalendarDays size={18} />, anyOf: ['event:create'] },
  { href: '/admin/analytics', label: 'Analytics', icon: <BarChart3 size={18} />, anyOf: ['analytics:read'] },
  { href: '/admin/audit', label: 'Audit log', icon: <ScrollText size={18} />, anyOf: ['audit:read'] },
  { href: '/admin/import', label: 'Import data', icon: <UploadCloud size={18} />, anyOf: ['import:csv'] },
]

/* ------------------------------------------------------------------ */
/* Sidebar component                                                  */
/* ------------------------------------------------------------------ */

function filterNav(items: NavItem[], actor: Actor): NavItem[] {
  return items.filter((item) =>
    item.anyOf.some((permission) => holdsPermission(actor, permission) || can(actor, permission)),
  )
}

/**
 * Persistent sidebar for admin and security operations.
 *
 * All features are unified under role permissions so supervisors and
 * administrators do not drop into an isolated sub-dashboard when viewing
 * queues, dispatch, or events.
 */
export function AdminSidebar({
  actor,
  variant,
}: {
  actor: Actor
  variant?: 'admin' | 'security'
}) {
  const nav = filterNav(OPERATIONS_NAV, actor)
  const roles = activeRoles(actor)

  const isOnlyGuard = roles.length === 1 && roles[0].role === 'GUARD'
  const isOnlyAdmin = roles.length === 1 && roles[0].role === 'ADMIN'
  const sectionTitle = isOnlyGuard ? 'Security' : isOnlyAdmin ? 'Administration' : 'Operations'

  return (
    <>
      {/* â”€â”€ Mobile top bar (below md) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex flex-col border-b border-neutral-200 bg-neutral-50 px-4 py-3 md:hidden dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
            Parqel
          </Link>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-neutral-400">{actor.employeeId}</span>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="rounded-md border border-neutral-300 p-1.5 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                aria-label="Sign out"
              >
                <LogOut size={14} />
              </button>
            </form>
          </div>
        </div>
        <nav className="mt-2 flex gap-1 overflow-x-auto">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-200/60 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* â”€â”€ Desktop sidebar (md and above) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <aside className="hidden md:flex md:w-60 md:shrink-0 md:flex-col md:border-r md:border-neutral-200 md:bg-neutral-50 dark:md:border-neutral-800 dark:md:bg-neutral-950">
        {/* Brand */}
        <div className="px-5 pt-6 pb-4">
          <Link href="/" className="text-base font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
            Parqel
          </Link>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
            {sectionTitle}
          </p>
        </div>

        {/* Main nav */}
        <nav className="flex-1 space-y-0.5 px-3">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-200/60 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            >
              <span className="text-neutral-400 dark:text-neutral-500">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* User section */}
        <div className="border-t border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
            {actor.name}
          </p>
          <p className="mt-0.5 font-mono text-xs text-neutral-400">{actor.employeeId}</p>

          <div className="mt-2 flex flex-wrap gap-1">
            {roles.map((role) => (
              <span
                key={role.role}
                className="rounded-full border border-neutral-200 px-2 py-0.5 text-[10px] font-medium text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
              >
                {ROLE_LABELS[role.role] ?? role.role}
              </span>
            ))}
          </div>

          <form action="/api/auth/logout" method="post" className="mt-3">
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </form>
        </div>
      </aside>
    </>
  )
}
