/**
 * Pure plate comparison. No database, no server-only — so it can be tested
 * directly, which matters because this is where misreads and typos are caught.
 */

export function normalisePlate(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * Glyph pairs that dominate real errors on Indian plates, whether from a
 * human typing or OCR reading: 0/O, 1/I, 5/S, 8/B, 2/Z.
 */
const CONFUSABLE: Record<string, string> = {
  O: '0',
  Q: '0',
  D: '0',
  I: '1',
  L: '1',
  S: '5',
  B: '8',
  Z: '2',
  G: '6',
}

/** Collapses confusable glyphs so 'KA05MN1234' and 'KAO5MNI234' compare equal. */
export function canonicalPlate(plate: string): string {
  return [...plate].map((char) => CONFUSABLE[char] ?? char).join('')
}

/** Levenshtein distance, capped — we only care about "close or not". */
export function editDistance(a: string, b: string, cap = 3): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > cap) return cap + 1

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)

  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    let rowMin = i

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const value = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost)
      current.push(value)
      if (value < rowMin) rowMin = value
    }

    if (rowMin > cap) return cap + 1
    previous = current
  }

  return previous[b.length]!
}

/**
 * Distance between two plates after normalisation and glyph collapsing.
 * 0 means "identical or differs only by confusable glyphs".
 */
export function plateDistance(a: string, b: string): number {
  return editDistance(canonicalPlate(normalisePlate(a)), canonicalPlate(normalisePlate(b)))
}

/**
 * Never returns 1 — a near miss must not read as certainty in the triage UI.
 * Only an exact string match earns full confidence, and that is decided
 * before this is called.
 */
export function nearMatchConfidence(edits: number): number {
  if (edits === 0) return 0.95
  return Number((1 - edits * 0.2).toFixed(2))
}

/** Near misses worth showing a human. Beyond this it is a different vehicle. */
export const MAX_NEAR_MATCH_DISTANCE = 2
