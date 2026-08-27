import { z } from 'zod'
import {
  AllocationType,
  SpotType,
  UserType,
  VehicleClass,
  ZoneVehicleClass,
} from '@/generated/prisma/enums'

/**
 * CSV import schemas.
 *
 * Someone has to enter every user, vehicle, zone and spot before a pilot can
 * run. For a few hundred vehicles that is a day of tedious work, and it is the
 * step that actually stalls deployments — so bulk import is a Phase A feature,
 * not a nicety.
 *
 * Column names are snake_case to match what comes out of a spreadsheet export.
 * Everything is trimmed and case-normalised, because real rosters are messy.
 */

const trimmed = z.string().trim()

/** Accepts "two_wheeler", "TWO WHEELER", "2 wheeler", "bike" etc. */
function looseEnum<T extends Record<string, string>>(
  enumObject: T,
  aliases: Record<string, keyof T & string> = {},
) {
  const values = Object.values(enumObject) as string[]

  return trimmed.transform((raw, ctx) => {
    const normalised = raw.toUpperCase().replace(/[\s-]+/g, '_')

    if (values.includes(normalised)) return normalised as T[keyof T]

    const aliased = aliases[raw.toLowerCase().replace(/[\s-]+/g, '_')]
    if (aliased) return aliased as T[keyof T]

    ctx.addIssue({
      code: 'custom',
      message: `must be one of: ${values.join(', ')}`,
    })
    return z.NEVER
  })
}

/** Indian plates are stored without spaces so lookups are stable. */
export const plateSchema = trimmed
  .min(4, 'plate is too short')
  .max(16)
  .transform((value) => value.toUpperCase().replace(/[\s-]/g, ''))

const phoneSchema = trimmed
  .transform((value) => value.replace(/[\s-()]/g, ''))
  .refine(
    (value) => value === '' || /^(\+91)?[6-9]\d{9}$/.test(value),
    'must be a valid 10 digit Indian mobile number',
  )
  .transform((value) => {
    if (value === '') return null
    return value.startsWith('+91') ? value : `+91${value}`
  })

const optionalText = trimmed.transform((v) => (v === '' ? null : v))

export const userRowSchema = z.object({
  employee_id: trimmed.min(1, 'required').max(64).transform((v) => v.toUpperCase()),
  name: trimmed.min(1, 'required').max(200),
  email: trimmed
    .transform((v) => v.toLowerCase())
    .refine((v) => v === '' || z.email().safeParse(v).success, 'must be a valid email')
    .transform((v) => (v === '' ? null : v)),
  phone: phoneSchema,
  user_type: looseEnum(UserType, {
    employee: 'STAFF',
    teacher: 'FACULTY',
    professor: 'FACULTY',
    vendor: 'CONTRACTOR',
  }),
  department: optionalText,
})

export const vehicleRowSchema = z.object({
  plate_number: plateSchema,
  vehicle_class: looseEnum(VehicleClass, {
    '2_wheeler': 'TWO_WHEELER',
    '4_wheeler': 'FOUR_WHEELER',
    bike: 'TWO_WHEELER',
    scooter: 'TWO_WHEELER',
    motorcycle: 'TWO_WHEELER',
    car: 'FOUR_WHEELER',
  }),
  make_model: optionalText,
  employee_id: trimmed.min(1, 'required').transform((v) => v.toUpperCase()),
})

export const zoneRowSchema = z.object({
  name: trimmed.min(1, 'required').max(200),
  building: optionalText,
  floor: optionalText,
  allocation_type: looseEnum(AllocationType),
  vehicle_class: looseEnum(ZoneVehicleClass, {
    '2_wheeler': 'TWO_WHEELER',
    '4_wheeler': 'FOUR_WHEELER',
    both: 'MIXED',
    all: 'MIXED',
  }),
  capacity: z.coerce.number().int().min(0).max(10_000),
})

export const spotRowSchema = z.object({
  zone_name: trimmed.min(1, 'required'),
  code: trimmed.min(1, 'required').max(32).transform((v) => v.toUpperCase()),
  type: looseEnum(SpotType, {
    normal: 'STANDARD',
    handicapped: 'ACCESSIBLE',
    disabled: 'ACCESSIBLE',
    electric: 'EV',
  })
    .optional()
    .default('STANDARD'),
})

export const IMPORT_KINDS = ['users', 'vehicles', 'zones', 'spots'] as const
export type ImportKind = (typeof IMPORT_KINDS)[number]

export const ROW_SCHEMAS = {
  users: userRowSchema,
  vehicles: vehicleRowSchema,
  zones: zoneRowSchema,
  spots: spotRowSchema,
} as const

export const REQUIRED_COLUMNS: Record<ImportKind, string[]> = {
  users: ['employee_id', 'name', 'user_type'],
  vehicles: ['plate_number', 'vehicle_class', 'employee_id'],
  zones: ['name', 'allocation_type', 'vehicle_class', 'capacity'],
  spots: ['zone_name', 'code'],
}

export const SAMPLE_CSV: Record<ImportKind, string> = {
  users: `employee_id,name,email,phone,user_type,department
FAC102,Ravi Shankar,ravi.s@example.edu,9876543210,faculty,Mechanical
STU2202,Divya Prakash,divya.p@example.edu,9876543211,student,Electronics`,

  vehicles: `plate_number,vehicle_class,make_model,employee_id
KA 09 PQ 3344,four_wheeler,Tata Nexon,FAC102
KA 02 RS 7788,two_wheeler,Bajaj Pulsar,STU2202`,

  zones: `name,building,floor,allocation_type,vehicle_class,capacity
Library Basement,Library,B1,shared,four_wheeler,25
Hostel Bike Stand,Hostel,Ground,shared,two_wheeler,120`,

  spots: `zone_name,code,type
Library Basement,L01,standard
Library Basement,L02,ev`,
}
