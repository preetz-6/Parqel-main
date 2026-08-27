import 'dotenv/config'

import { Client } from 'pg'

/**
 * Creates the application database on the local Prisma dev server.
 *
 * `npx prisma dev` hands you a URL pointing at `template1`. Do not use it:
 * template1 is the template Postgres clones for every new database, so any
 * schema created there leaks into every database made afterwards — including
 * the shadow database Prisma builds to plan migrations, which then fails with
 * "type already exists".
 *
 * This creates a dedicated database from `template0` (the pristine template)
 * and can also clean a previously polluted template1.
 *
 *   npx tsx scripts/bootstrap-db.ts            # create parqel
 *   npx tsx scripts/bootstrap-db.ts --clean    # also strip template1
 */

const ADMIN_URL = 'postgres://postgres:postgres@localhost:51218/postgres?sslmode=disable'
const TEMPLATE1_URL = 'postgres://postgres:postgres@localhost:51218/template1?sslmode=disable'
const DB_NAME = 'parqel'

async function createDatabase() {
  const client = new Client({ connectionString: ADMIN_URL })
  await client.connect()

  const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME])

  if (existing.rowCount === 0) {
    // template0 is guaranteed pristine; template1 may have been polluted.
    await client.query(`CREATE DATABASE ${DB_NAME} TEMPLATE template0`)
    console.info(`Created database "${DB_NAME}".`)
  } else {
    console.info(`Database "${DB_NAME}" already exists.`)
  }

  await client.end()
}

/** Removes application objects that were mistakenly created in template1. */
async function cleanTemplate1() {
  const client = new Client({ connectionString: TEMPLATE1_URL })
  await client.connect()

  const tables = await client.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  )
  const types = await client.query<{ typname: string }>(
    `SELECT t.typname FROM pg_type t
       JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typtype = 'e'`,
  )

  if (tables.rowCount === 0 && types.rowCount === 0) {
    console.info('template1 is already clean.')
    await client.end()
    return
  }

  for (const { tablename } of tables.rows) {
    await client.query(`DROP TABLE IF EXISTS "${tablename}" CASCADE`)
  }
  for (const { typname } of types.rows) {
    await client.query(`DROP TYPE IF EXISTS "${typname}" CASCADE`)
  }

  console.info(
    `Cleaned template1: dropped ${tables.rowCount} table(s) and ${types.rowCount} enum type(s).`,
  )
  await client.end()
}

/**
 * `prisma migrate dev` needs a scratch database. This server cannot host one on
 * the main port, but runs a separate shadow instance — conventionally the next
 * port up. Probe for it rather than assuming the documented default, which only
 * holds when nothing else claimed the port first.
 */
async function findShadowPort(dbPort: number): Promise<number | null> {
  for (const port of [dbPort + 1, 51215]) {
    const client = new Client({
      connectionString: `postgres://postgres:postgres@localhost:${port}/shadow?sslmode=disable`,
      connectionTimeoutMillis: 1500,
    })
    try {
      await client.connect()
      await client.end()
      return port
    } catch {
      // Not listening, or not a Postgres endpoint — try the next candidate.
    }
  }
  return null
}

async function main() {
  await createDatabase()
  if (process.argv.includes('--clean')) await cleanTemplate1()

  const dbPort = Number(new URL(ADMIN_URL.replace('postgres://', 'http://')).port)
  const shadowPort = await findShadowPort(dbPort)

  console.info(`
Put these in .env:

  DATABASE_URL="postgres://postgres:postgres@localhost:${dbPort}/${DB_NAME}?sslmode=disable"`)

  if (shadowPort) {
    console.info(
      `  SHADOW_DATABASE_URL="postgres://postgres:postgres@localhost:${shadowPort}/shadow?sslmode=disable"\n`,
    )
  } else {
    console.info(`
  SHADOW_DATABASE_URL=  <-- could not find the shadow instance.
  Find it with:  netstat -ano -p TCP | grep LISTEN | grep 512
`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
