import Link from 'next/link'
import {
  Home,
  ClipboardList,
  Car,
  Ticket,
  CarFront,
  LogOut,
} from 'lucide-react'
import type { Actor, Permission } from '@/server/permissions'
import { activeRoles, holdsPermission, can } from '@/server/permissions'
import { MobileSidebarToggle } from './mobile-sidebar-toggle'

const ROLE_LABELS: Record<string, string> = {
  EMPLOYEE: 'Employee',
  GUARD: 'Guard',
  SUPERVISOR: 'Supervisor',
  ADMIN: 'Administrator',
}

type NavItem = {
  href: string
  label: string
  icon: React.ReactNode
  anyOf: Permission[]
}

const EMPLOYEE_NAV: NavItem[] = [
  { href: '/', label: 'Home', icon: <Home size={18} />, anyOf: ['zone:read'] },
  { href: '/violations', label: 'Reports & Appeals', icon: <ClipboardList size={18} />, anyOf: ['violation:report'] },
  { href: '/parking', label: 'Find parking', icon: <Car size={18} />, anyOf: ['reservation:create'] },
  { href: '/passes', label: 'Visitor passes', icon: <Ticket size={18} />, anyOf: ['pass:issue'] },
  { href: '/vehicles', label: 'My vehicles', icon: <CarFront size={18} />, anyOf: ['vehicle:request'] },
]

function filterNav(items: NavItem[], actor: Actor): NavItem[] {
  return items.filter((item) =>
    item.anyOf.some((permission) => holdsPermission(actor, permission) || can(actor, permission)),
  )
}

/** Shared nav list used by both mobile slide-out and desktop sidebar. */
function NavLinks({ items }: { items: NavItem[] }) {
  return (
    <nav className="flex-1 space-y-0.5 px-3">
      {items.map((item) => (
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
  )
}

/** User badge + sign-out shown at the bottom of both mobile and desktop sidebars. */
function UserSection({ actor, roles }: { actor: Actor; roles: ReturnType<typeof activeRoles> }) {
  return (
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
  )
}

/**
 * Persistent sidebar for the employee dashboard.
 *
 * Mobile: hamburger → slide-out panel with full nav + user info.
 * Desktop: fixed-width left sidebar.
 */
export function EmployeeSidebar({ actor }: { actor: Actor }) {
  const nav = filterNav(EMPLOYEE_NAV, actor)
  const roles = activeRoles(actor)

  return (
    <>
      {/* ── Mobile top bar (below md) ───────────────────────────── */}
      <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-4 py-3 md:hidden dark:border-neutral-800 dark:bg-neutral-950">
        <Link href="/" className="text-sm font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
          Parqel
        </Link>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-neutral-400">{actor.employeeId}</span>
          <MobileSidebarToggle>
            {/* Brand inside slide-out */}
            <div className="px-5 pb-4">
              <Link href="/" className="text-base font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
                Parqel
              </Link>
            </div>
            <NavLinks items={nav} />
            <UserSection actor={actor} roles={roles} />
          </MobileSidebarToggle>
        </div>
      </div>

      {/* ── Desktop sidebar (md and above) ──────────────────────── */}
      <aside className="hidden md:flex md:w-60 md:shrink-0 md:flex-col md:border-r md:border-neutral-200 md:bg-neutral-50 dark:md:border-neutral-800 dark:md:bg-neutral-950">
        {/* Brand */}
        <div className="px-5 pt-6 pb-4">
          <Link href="/" className="text-base font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
            Parqel
          </Link>
        </div>

        <NavLinks items={nav} />
        <UserSection actor={actor} roles={roles} />
      </aside>
    </>
  )
}
