import { NextResponse } from 'next/server'
import { z } from 'zod'
import { authorize } from '@/server/dal'
import { toErrorResponse } from '@/server/api-error'
import { clientIp } from '@/server/auth/request-ip'
import { commitImport, isImportKind, planImport } from '@/server/import/importer'
import { IMPORT_KINDS } from '@/server/import/schemas'

const schema = z.object({
  kind: z.enum(IMPORT_KINDS),
  csv: z.string().min(1, 'Paste or upload a CSV.').max(2_000_000),
  mode: z.enum(['plan', 'commit']),
})

export async function POST(request: Request) {
  try {
    const actor = await authorize('import:csv')

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
        { status: 400 },
      )
    }

    const { kind, csv, mode } = parsed.data
    if (!isImportKind(kind)) {
      return NextResponse.json({ error: 'Unknown import type.' }, { status: 400 })
    }

    if (mode === 'plan') {
      return NextResponse.json({ plan: await planImport(kind, csv) })
    }

    const outcome = await commitImport(actor, kind, csv, await clientIp())

    if (!outcome.ok) {
      // Something changed between preview and commit.
      return NextResponse.json({ plan: outcome.plan }, { status: 422 })
    }

    return NextResponse.json({ result: outcome.result })
  } catch (error) {
    return toErrorResponse(error)
  }
}
