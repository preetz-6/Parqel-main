import 'server-only'

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { UserStatus } from '@/generated/prisma/enums'
import { auditEvent } from '../audit'

/**
 * Employee-ID + OTP login.
 *
 * The employee ID is *not* a secret — it is printed on an ID card and is often
 * sequential. It identifies; the OTP to the roster-registered phone
 * authenticates. That is why a code is never sent to a number supplied in the
 * request: only to the number already on the roster.
 *
 * There is no registration path here. If the employee ID is not on the roster,
 * there is nothing to log in to.
 */

const CODE_LENGTH = 6
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
const RATE_LIMIT_MAX_CHALLENGES = 3

function ttlSeconds(): number {
  return Number(process.env.OTP_TTL_SECONDS ?? 300)
}

function maxAttempts(): number {
  return Number(process.env.OTP_MAX_ATTEMPTS ?? 5)
}

function hashCode(employeeId: string, code: string): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')
  // Binding the hash to the employee ID stops a code issued for one user from
  // ever validating for another.
  return createHmac('sha256', secret).update(`${employeeId}:${code}`).digest('hex')
}

function codesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/** Masks a phone for display: +919876543210 -> +91 ****** 3210 */
export function maskPhone(phone: string): string {
  const tail = phone.slice(-4)
  const head = phone.startsWith('+') ? phone.slice(0, 3) : ''
  return `${head} ****** ${tail}`.trim()
}

export type RequestOtpResult =
  | { ok: true; maskedPhone: string; expiresInSeconds: number }
  | { ok: false; reason: 'unknown_employee' | 'no_phone' | 'rate_limited' | 'inactive' }

/**
 * Always returns quickly and never reveals whether an employee ID exists —
 * the caller shows the same message either way. The distinction is preserved
 * in the return value for the audit log only.
 */
export async function requestOtp(
  employeeIdRaw: string,
  ip?: string | null,
): Promise<RequestOtpResult> {
  const employeeId = employeeIdRaw.trim().toUpperCase()

  const user = await prisma.user.findUnique({
    where: { employeeId },
    select: { id: true, phone: true, status: true },
  })

  if (!user) {
    await auditEvent(
      { actorUserId: null, ip },
      {
        action: 'auth.otp.request.unknown_employee',
        entity: 'User',
        entityId: employeeId,
      },
    )
    return { ok: false, reason: 'unknown_employee' }
  }

  if (user.status !== UserStatus.ACTIVE) {
    await auditEvent(
      { actorUserId: user.id, ip },
      { action: 'auth.otp.request.inactive', entity: 'User', entityId: user.id },
    )
    return { ok: false, reason: 'inactive' }
  }

  if (!user.phone) {
    // Roster row has no phone — this person can only sign in via SSO.
    return { ok: false, reason: 'no_phone' }
  }

  const recentCount = await prisma.otpChallenge.count({
    where: {
      employeeId,
      createdAt: { gte: new Date(Date.now() - RATE_LIMIT_WINDOW_MS) },
    },
  })

  if (recentCount >= RATE_LIMIT_MAX_CHALLENGES) {
    await auditEvent(
      { actorUserId: user.id, ip },
      { action: 'auth.otp.request.rate_limited', entity: 'User', entityId: user.id },
    )
    return { ok: false, reason: 'rate_limited' }
  }

  const code = String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0')
  const expiresAt = new Date(Date.now() + ttlSeconds() * 1000)

  // Any earlier live challenge is retired so only the newest code works.
  await prisma.otpChallenge.updateMany({
    where: { employeeId, consumedAt: null },
    data: { consumedAt: new Date() },
  })

  await prisma.otpChallenge.create({
    data: {
      employeeId,
      phone: user.phone,
      codeHash: hashCode(employeeId, code),
      expiresAt,
    },
  })

  await deliverCode(user.phone, code)

  await auditEvent(
    { actorUserId: user.id, ip },
    { action: 'auth.otp.request', entity: 'User', entityId: user.id },
  )

  return { ok: true, maskedPhone: maskPhone(user.phone), expiresInSeconds: ttlSeconds() }
}

/**
 * v1 has exactly one provider: the server log.
 *
 * Real SMS needs TRAI DLT registration — sender ID and every template
 * pre-registered with the operator, using the pilot org's paperwork. That is a
 * multi-week dependency on someone else's admin office, so it is deliberately
 * not on the critical path for building the rest of the system.
 */
async function deliverCode(phone: string, code: string): Promise<void> {
  const provider = process.env.OTP_PROVIDER ?? 'console'

  if (provider === 'console') {
    console.info(`\n  [OTP] ${maskPhone(phone)} -> ${code}  (expires in ${ttlSeconds()}s)\n`)
    return
  }

  throw new Error(
    `OTP_PROVIDER "${provider}" is not implemented. SMS delivery requires DLT registration; see docs.`,
  )
}

export type VerifyOtpResult =
  | { ok: true; userId: string; employeeId: string }
  | { ok: false; reason: 'no_challenge' | 'expired' | 'too_many_attempts' | 'bad_code' | 'inactive' }

export async function verifyOtp(
  employeeIdRaw: string,
  code: string,
  ip?: string | null,
): Promise<VerifyOtpResult> {
  const employeeId = employeeIdRaw.trim().toUpperCase()

  const challenge = await prisma.otpChallenge.findFirst({
    where: { employeeId, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  })

  if (!challenge) return { ok: false, reason: 'no_challenge' }

  if (challenge.expiresAt < new Date()) {
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    })
    return { ok: false, reason: 'expired' }
  }

  if (challenge.attempts >= maxAttempts()) {
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    })
    await auditEvent(
      { actorUserId: null, ip },
      { action: 'auth.otp.verify.too_many_attempts', entity: 'User', entityId: employeeId },
    )
    return { ok: false, reason: 'too_many_attempts' }
  }

  if (!codesMatch(challenge.codeHash, hashCode(employeeId, code.trim()))) {
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    })
    return { ok: false, reason: 'bad_code' }
  }

  // Correct code — burn the challenge before issuing anything.
  await prisma.otpChallenge.update({
    where: { id: challenge.id },
    data: { consumedAt: new Date() },
  })

  const user = await prisma.user.findUnique({
    where: { employeeId },
    select: { id: true, employeeId: true, status: true },
  })

  if (!user || user.status !== UserStatus.ACTIVE) {
    return { ok: false, reason: 'inactive' }
  }

  await auditEvent(
    { actorUserId: user.id, ip },
    { action: 'auth.login.otp', entity: 'User', entityId: user.id },
  )

  return { ok: true, userId: user.id, employeeId: user.employeeId }
}
