import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { UserStatus } from '@/generated/prisma/enums'
import { auditEvent } from '../audit'

/**
 * Employee-ID + password login.
 *
 * Passwords are hashed with scrypt (Node built-in) using a per-user random
 * salt. The hash format stored in the database is:
 *   <hex-salt>:<hex-derived-key>
 *
 * No self-registration: the employee ID must already exist on the roster.
 */

const KEY_LENGTH = 64

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex')
  const derived = scryptSync(plain, salt, KEY_LENGTH).toString('hex')
  return `${salt}:${derived}`
}

function checkHash(plain: string, stored: string): boolean {
  const [salt, key] = stored.split(':')
  if (!salt || !key) return false
  const derived = scryptSync(plain, salt, KEY_LENGTH)
  const storedBuf = Buffer.from(key, 'hex')
  if (derived.length !== storedBuf.length) return false
  return timingSafeEqual(derived, storedBuf)
}

export type VerifyPasswordResult =
  | { ok: true; userId: string; employeeId: string }
  | { ok: false; reason: 'unknown_employee' | 'inactive' | 'no_password' | 'bad_password' }

export async function verifyPassword(
  employeeIdRaw: string,
  password: string,
  ip?: string | null,
): Promise<VerifyPasswordResult> {
  const employeeId = employeeIdRaw.trim().toUpperCase()

  const user = await prisma.user.findUnique({
    where: { employeeId },
    select: { id: true, employeeId: true, passwordHash: true, status: true },
  })

  if (!user) {
    await auditEvent(
      { actorUserId: null, ip },
      {
        action: 'auth.password.unknown_employee',
        entity: 'User',
        entityId: employeeId,
      },
    )
    return { ok: false, reason: 'unknown_employee' }
  }

  if (user.status !== UserStatus.ACTIVE) {
    await auditEvent(
      { actorUserId: user.id, ip },
      { action: 'auth.password.inactive', entity: 'User', entityId: user.id },
    )
    return { ok: false, reason: 'inactive' }
  }

  if (!user.passwordHash) {
    return { ok: false, reason: 'no_password' }
  }

  if (!checkHash(password, user.passwordHash)) {
    await auditEvent(
      { actorUserId: user.id, ip },
      { action: 'auth.password.bad_password', entity: 'User', entityId: user.id },
    )
    return { ok: false, reason: 'bad_password' }
  }

  await auditEvent(
    { actorUserId: user.id, ip },
    { action: 'auth.login.password', entity: 'User', entityId: user.id },
  )

  return { ok: true, userId: user.id, employeeId: user.employeeId }
}
