import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  MAX_NEAR_MATCH_DISTANCE,
  canonicalPlate,
  normalisePlate,
  nearMatchConfidence,
  plateDistance,
  isValidPlateFormat,
} from './plate-normalise'

describe('plate normalisation', () => {
  test('strips separators and upper-cases', () => {
    for (const input of ['KA 05 MN 1234', 'ka-05-mn-1234', ' ka05mn1234 ']) {
      assert.equal(normalisePlate(input), 'KA05MN1234')
    }
  })
})

describe('confusable glyphs', () => {
  test('letter O and digit 0 collapse together', () => {
    assert.equal(canonicalPlate('KAO3HH8899'), canonicalPlate('KA03HH8899'))
  })

  test('a plate differing only by confusable glyphs has distance 0', () => {
    // Regression: this case was previously filtered out as if it were the
    // exact match, so the strongest possible near miss surfaced no candidate
    // at all and a guard saw "no registered vehicle matches".
    assert.equal(plateDistance('KAO3HH8899', 'KA03HH8899'), 0)
    assert.equal(plateDistance('KA05MNI234', 'KA05MN1234'), 0)
    assert.equal(plateDistance('KA0SMN1234', 'KA05MN1234'), 0)
  })

  test('distance 0 still scores below an exact match', () => {
    // A confusable-only match must never read as certainty — the reader
    // has to eyeball the photo.
    assert.equal(nearMatchConfidence(0), 0.95)
    assert.ok(nearMatchConfidence(0) < 1)
  })
})

describe('edit distance', () => {
  test('counts real character differences', () => {
    assert.equal(plateDistance('KA05MN1234', 'KA05MN1284'), 1)
    assert.equal(plateDistance('KA05MN1234', 'KA05MN1289'), 2)
    assert.equal(plateDistance('KA05MN1234', 'KA05MN9984'), 3)
  })

  test('genuinely different plates fall outside the near-match window', () => {
    assert.ok(plateDistance('KA05MN1234', 'MH12AB5678') > MAX_NEAR_MATCH_DISTANCE)
    assert.ok(plateDistance('KA03HH8899', 'KA51XY9090') > MAX_NEAR_MATCH_DISTANCE)
  })

  test('confidence decreases as edits grow and never reaches certainty', () => {
    assert.equal(nearMatchConfidence(1), 0.8)
    assert.equal(nearMatchConfidence(2), 0.6)
    for (const edits of [0, 1, 2]) {
      assert.ok(nearMatchConfidence(edits) < 1, `${edits} edits must not score 1`)
    }
  })
})

describe('isValidPlateFormat', () => {
  test('accepts valid Indian state and Bharat series plates', () => {
    const valid = [
      'KA 05 MN 1234',
      'ka-05-mn-1234',
      'MH12AB1234',
      'DL 1C AA 1111',
      '22 BH 1234 AA',
      '21BH9999Z',
      'GA01A1',
    ]
    for (const plate of valid) {
      assert.equal(isValidPlateFormat(plate), true, `${plate} should be valid`)
    }
  })

  test('rejects invalid or gibberish plates', () => {
    const invalid = [
      '',
      '   ',
      '123',
      'ABC',
      'NOTAPLATE',
      'KA!05@MN',
      'TOOLONG1234567890',
    ]
    for (const plate of invalid) {
      assert.equal(isValidPlateFormat(plate), false, `${plate} should be invalid`)
    }
  })
})

