import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { scryptSync, timingSafeEqual } from 'node:crypto'

const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

function checkHash(plain: string, stored: string): boolean {
  const [salt, key] = stored.split(':')
  if (!salt || !key) return false
  const derived = scryptSync(plain, salt, 64)
  const storedBuf = Buffer.from(key, 'hex')
  if (derived.length !== storedBuf.length) return false
  return timingSafeEqual(derived, storedBuf)
}

async function main() {
  const users = await p.user.findMany({
    select: { employeeId: true, name: true, passwordHash: true, status: true },
  })

  for (const u of users) {
    const hasHash = !!u.passwordHash
    const passOk = hasHash ? checkHash('parqel123', u.passwordHash!) : false
    console.log(
      `${u.employeeId.padEnd(10)} ${u.name.padEnd(25)} status=${u.status.padEnd(8)} hasHash=${String(hasHash).padEnd(5)} passOk=${passOk}`,
    )
  }

  await p.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
