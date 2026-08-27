import 'server-only'

import Papa from 'papaparse'
import { prisma } from '@/lib/prisma'
import { VehicleStatus, ZoneVehicleClass } from '@/generated/prisma/enums'
import { audited, type AuditContext, type TxClient } from '../audit'
import type { Actor } from '../permissions'
import {
  IMPORT_KINDS,
  REQUIRED_COLUMNS,
  ROW_SCHEMAS,
  type ImportKind,
} from './schemas'

const MAX_ROWS = 5000

export type RowIssue = {
  /** 1-based, matching the spreadsheet row the user is looking at (header is row 1). */
  row: number
  column?: string
  message: string
}

export type ImportPlan = {
  kind: ImportKind
  totalRows: number
  toCreate: number
  toUpdate: number
  issues: RowIssue[]
  /** Non-blocking observations, e.g. "3 rows unchanged". */
  notes: string[]
}

type ValidRow<K extends ImportKind> = {
  row: number
  data: ReturnType<(typeof ROW_SCHEMAS)[K]['parse']>
}

export function isImportKind(value: unknown): value is ImportKind {
  return typeof value === 'string' && (IMPORT_KINDS as readonly string[]).includes(value)
}

/** Parses and per-row validates. Never touches the database. */
function parseRows<K extends ImportKind>(
  kind: K,
  csvText: string,
): { rows: ValidRow<K>[]; issues: RowIssue[] } {
  const issues: RowIssue[] = []

  const parsed = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim().toLowerCase().replace(/[\s-]+/g, '_'),
  })

  const headers = parsed.meta.fields ?? []
  const missing = REQUIRED_COLUMNS[kind].filter((column) => !headers.includes(column))

  if (missing.length > 0) {
    issues.push({
      row: 1,
      message: `Missing required column(s): ${missing.join(', ')}. Found: ${headers.join(', ') || '(none)'}`,
    })
    return { rows: [], issues }
  }

  if (parsed.data.length > MAX_ROWS) {
    issues.push({ row: 1, message: `File has more than ${MAX_ROWS} rows. Split it up.` })
    return { rows: [], issues }
  }

  const schema = ROW_SCHEMAS[kind]
  const rows: ValidRow<K>[] = []

  parsed.data.forEach((raw, index) => {
    // +2: one for the header line, one to get from 0-based to 1-based.
    const rowNumber = index + 2
    const result = schema.safeParse(raw)

    if (!result.success) {
      for (const issue of result.error.issues) {
        issues.push({
          row: rowNumber,
          column: issue.path.join('.') || undefined,
          message: issue.message,
        })
      }
      return
    }

    rows.push({ row: rowNumber, data: result.data as ValidRow<K>['data'] })
  })

  return { rows, issues }
}

/** The natural key each import kind is upserted on. */
function keyOf(kind: ImportKind, data: Record<string, unknown>): string {
  switch (kind) {
    case 'users':
      return String(data.employee_id)
    case 'vehicles':
      return String(data.plate_number)
    case 'zones':
      return String(data.name).toLowerCase()
    case 'spots':
      return `${String(data.zone_name).toLowerCase()}::${String(data.code)}`
  }
}

function findDuplicates(kind: ImportKind, rows: { row: number; data: never }[]): RowIssue[] {
  const seen = new Map<string, number>()
  const issues: RowIssue[] = []

  for (const { row, data } of rows) {
    const key = keyOf(kind, data)
    const firstSeen = seen.get(key)
    if (firstSeen !== undefined) {
      issues.push({ row, message: `Duplicate of row ${firstSeen} in this file (${key})` })
      continue
    }
    seen.set(key, row)
  }

  return issues
}

/**
 * Cross-references the file against the database: resolves foreign keys,
 * flags conflicts, and counts creates vs updates.
 */
async function reconcile(
  kind: ImportKind,
  rows: { row: number; data: never }[],
): Promise<{ issues: RowIssue[]; toCreate: number; toUpdate: number }> {
  const issues: RowIssue[] = []
  let toCreate = 0
  let toUpdate = 0

  if (kind === 'users') {
    const ids = rows.map((r) => String((r.data as Record<string, unknown>).employee_id))
    const existing = new Set(
      (
        await prisma.user.findMany({
          where: { employeeId: { in: ids } },
          select: { employeeId: true },
        })
      ).map((u) => u.employeeId),
    )
    for (const { data } of rows) {
      existing.has(String((data as Record<string, unknown>).employee_id)) ? toUpdate++ : toCreate++
    }
  }

  if (kind === 'vehicles') {
    const employeeIds = [
      ...new Set(rows.map((r) => String((r.data as Record<string, unknown>).employee_id))),
    ]
    const owners = new Map(
      (
        await prisma.user.findMany({
          where: { employeeId: { in: employeeIds } },
          select: { id: true, employeeId: true },
        })
      ).map((u) => [u.employeeId, u.id]),
    )

    const plates = rows.map((r) => String((r.data as Record<string, unknown>).plate_number))
    const existingVehicles = new Map(
      (
        await prisma.vehicle.findMany({
          where: { plateNumber: { in: plates } },
          select: { plateNumber: true, userId: true },
        })
      ).map((v) => [v.plateNumber, v.userId]),
    )

    for (const { row, data } of rows) {
      const record = data as Record<string, unknown>
      const employeeId = String(record.employee_id)
      const ownerId = owners.get(employeeId)

      if (!ownerId) {
        issues.push({
          row,
          column: 'employee_id',
          message: `No roster user with employee ID "${employeeId}". Import users first.`,
        })
        continue
      }

      const plate = String(record.plate_number)
      const currentOwner = existingVehicles.get(plate)

      if (currentOwner === undefined) {
        toCreate++
      } else if (currentOwner === ownerId) {
        toUpdate++
      } else {
        // Silently re-pointing a plate would reroute that vehicle's alerts to
        // the wrong person. Refuse and make a human decide.
        issues.push({
          row,
          column: 'plate_number',
          message: `${plate} is already registered to a different user. Transfer it manually before importing.`,
        })
      }
    }
  }

  if (kind === 'zones') {
    const names = rows.map((r) => String((r.data as Record<string, unknown>).name))
    const existing = new Set(
      (
        await prisma.parkingZone.findMany({
          where: { name: { in: names } },
          select: { name: true },
        })
      ).map((z) => z.name.toLowerCase()),
    )
    for (const { data } of rows) {
      existing.has(String((data as Record<string, unknown>).name).toLowerCase())
        ? toUpdate++
        : toCreate++
    }
  }

  if (kind === 'spots') {
    const zoneNames = [
      ...new Set(rows.map((r) => String((r.data as Record<string, unknown>).zone_name))),
    ]
    const zones = await prisma.parkingZone.findMany({
      where: { name: { in: zoneNames } },
      select: { id: true, name: true, vehicleClass: true },
    })
    const zoneByName = new Map(zones.map((z) => [z.name.toLowerCase(), z]))

    const existingSpots = new Set(
      (
        await prisma.parkingSpot.findMany({
          where: { zoneId: { in: zones.map((z) => z.id) } },
          select: { zoneId: true, code: true },
        })
      ).map((s) => `${s.zoneId}::${s.code}`),
    )

    for (const { row, data } of rows) {
      const record = data as Record<string, unknown>
      const zone = zoneByName.get(String(record.zone_name).toLowerCase())

      if (!zone) {
        issues.push({
          row,
          column: 'zone_name',
          message: `No zone named "${record.zone_name}". Import zones first.`,
        })
        continue
      }

      // Bikes do not occupy discrete numbered slots — these zones are
      // capacity-only by design, so spot rows would be meaningless.
      if (zone.vehicleClass === ZoneVehicleClass.TWO_WHEELER) {
        issues.push({
          row,
          column: 'zone_name',
          message: `"${zone.name}" is a two-wheeler zone. Those track capacity only and cannot have numbered spots.`,
        })
        continue
      }

      existingSpots.has(`${zone.id}::${String(record.code)}`) ? toUpdate++ : toCreate++
    }
  }

  return { issues, toCreate, toUpdate }
}

/** Validates a file and reports what would happen. Writes nothing. */
export async function planImport(kind: ImportKind, csvText: string): Promise<ImportPlan> {
  const { rows, issues: parseIssues } = parseRows(kind, csvText)
  const duplicateIssues = findDuplicates(kind, rows as never)

  const { issues: dbIssues, toCreate, toUpdate } =
    parseIssues.length > 0
      ? { issues: [] as RowIssue[], toCreate: 0, toUpdate: 0 }
      : await reconcile(kind, rows as never)

  const issues = [...parseIssues, ...duplicateIssues, ...dbIssues].sort((a, b) => a.row - b.row)

  const notes: string[] = []
  if (toUpdate > 0) notes.push(`${toUpdate} existing record(s) will be updated in place.`)
  if (kind === 'vehicles' && toCreate > 0) {
    notes.push('Imported vehicles are marked approved — an admin loading the roster is the approval.')
  }

  return {
    kind,
    totalRows: rows.length + parseIssues.filter((i) => i.row > 1).length,
    toCreate,
    toUpdate,
    issues,
    notes,
  }
}

export type ImportResult = { created: number; updated: number }

/**
 * Applies a file. All-or-nothing: a single bad row aborts the whole import.
 *
 * Partial imports of a roster are worse than no import — you cannot tell what
 * landed without diffing, so the operator fixes the spreadsheet and re-runs.
 */
export async function commitImport(
  actor: Actor,
  kind: ImportKind,
  csvText: string,
  ip?: string | null,
): Promise<{ ok: true; result: ImportResult } | { ok: false; plan: ImportPlan }> {
  const plan = await planImport(kind, csvText)
  if (plan.issues.length > 0) return { ok: false, plan }

  const { rows } = parseRows(kind, csvText)
  const ctx: AuditContext = { actorUserId: actor.userId, ip }

  const result = await audited(
    ctx,
    async (tx) => applyRows(tx, kind, rows as never, actor.userId),
    (applied) => [
      ...applied.entries,
      {
        action: `import.${kind}`,
        entity: 'Import',
        entityId: kind,
        newValue: { created: applied.created, updated: applied.updated },
      },
    ],
  )

  return { ok: true, result: { created: result.created, updated: result.updated } }
}

type Applied = {
  created: number
  updated: number
  entries: { action: string; entity: string; entityId: string; newValue?: unknown }[]
}

async function applyRows(
  tx: TxClient,
  kind: ImportKind,
  rows: { row: number; data: Record<string, unknown> }[],
  actorUserId: string,
): Promise<Applied> {
  const applied: Applied = { created: 0, updated: 0, entries: [] }

  /** Records the outcome using the real create/update result, not a guess. */
  function record(
    existed: boolean,
    entity: string,
    entityId: string,
    newValue: unknown,
    noun: string,
  ) {
    existed ? applied.updated++ : applied.created++
    applied.entries.push({
      action: `import.${noun}.${existed ? 'update' : 'create'}`,
      entity,
      entityId,
      newValue,
    })
  }

  for (const { data } of rows) {
    if (kind === 'users') {
      const existing = await tx.user.findUnique({
        where: { employeeId: String(data.employee_id) },
        select: { id: true },
      })
      const row = await tx.user.upsert({
        where: { employeeId: String(data.employee_id) },
        create: {
          employeeId: String(data.employee_id),
          name: String(data.name),
          email: (data.email as string | null) ?? null,
          phone: (data.phone as string | null) ?? null,
          userType: data.user_type as never,
          department: (data.department as string | null) ?? null,
          // Every imported person can at least use the app as an employee.
          roles: { create: [{ role: 'EMPLOYEE', scopeZoneIds: [] }] },
        },
        update: {
          name: String(data.name),
          email: (data.email as string | null) ?? null,
          phone: (data.phone as string | null) ?? null,
          userType: data.user_type as never,
          department: (data.department as string | null) ?? null,
        },
      })
      record(
        existing !== null,
        'User',
        row.id,
        { employeeId: row.employeeId, name: row.name },
        'user',
      )
    }

    if (kind === 'vehicles') {
      const owner = await tx.user.findUniqueOrThrow({
        where: { employeeId: String(data.employee_id) },
        select: { id: true },
      })
      const existing = await tx.vehicle.findUnique({
        where: { plateNumber: String(data.plate_number) },
        select: { id: true },
      })
      const row = await tx.vehicle.upsert({
        where: { plateNumber: String(data.plate_number) },
        create: {
          plateNumber: String(data.plate_number),
          vehicleClass: data.vehicle_class as never,
          makeModel: (data.make_model as string | null) ?? null,
          userId: owner.id,
          status: VehicleStatus.APPROVED,
          approvedById: actorUserId,
          approvedAt: new Date(),
        },
        update: {
          vehicleClass: data.vehicle_class as never,
          makeModel: (data.make_model as string | null) ?? null,
        },
      })
      record(existing !== null, 'Vehicle', row.id, { plateNumber: row.plateNumber }, 'vehicle')
    }

    if (kind === 'zones') {
      const existing = await tx.parkingZone.findFirst({
        where: { name: String(data.name) },
        select: { id: true },
      })
      const values = {
        name: String(data.name),
        building: (data.building as string | null) ?? null,
        floor: (data.floor as string | null) ?? null,
        allocationType: data.allocation_type as never,
        vehicleClass: data.vehicle_class as never,
        capacity: Number(data.capacity),
      }
      const row = existing
        ? await tx.parkingZone.update({ where: { id: existing.id }, data: values })
        : await tx.parkingZone.create({ data: values })

      record(
        existing !== null,
        'ParkingZone',
        row.id,
        { name: row.name, capacity: row.capacity },
        'zone',
      )
    }

    if (kind === 'spots') {
      const zone = await tx.parkingZone.findFirstOrThrow({
        where: { name: String(data.zone_name) },
        select: { id: true },
      })
      const existing = await tx.parkingSpot.findUnique({
        where: { zoneId_code: { zoneId: zone.id, code: String(data.code) } },
        select: { id: true },
      })
      const row = await tx.parkingSpot.upsert({
        where: { zoneId_code: { zoneId: zone.id, code: String(data.code) } },
        create: { zoneId: zone.id, code: String(data.code), type: data.type as never },
        update: { type: data.type as never },
      })
      record(existing !== null, 'ParkingSpot', row.id, { code: row.code }, 'spot')
    }
  }

  return applied
}
