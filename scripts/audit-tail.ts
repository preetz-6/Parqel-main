import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

/**
 * Prints the most recent audit entries. Useful for confirming that a flow
 * actually recorded what it should have.
 *
 *   npm run audit:tail
 *   npm run audit:tail -- 100
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

async function main() {
  const limit = Number(process.argv[2] ?? 40)

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { actor: { select: { employeeId: true, name: true } } },
  })

  if (logs.length === 0) {
    console.info('No audit entries yet.')
    return
  }

  console.info(`\nLast ${logs.length} audit entries (newest first):\n`)

  for (const log of logs.reverse()) {
    const who = log.actor ? `${log.actor.employeeId} ${log.actor.name}` : '(anonymous)'
    const time = log.createdAt.toISOString().slice(11, 19)
    console.info(`  ${time}  ${log.action.padEnd(38)}  ${who}`)
  }

  console.info('')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
