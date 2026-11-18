import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { loadViewings, saveViewings } from '../src/lib/viewing-store.mjs'

const viewing = { id: 'V1', listingId: 'L1', title: 'Demo home', buyer: 'Test buyer', slot: '2026-12-01T10:00:00+04:00', bookedAt: '2026-11-18T10:00:00Z' }

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'estaro-viewings-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  return path.join(directory, 'viewings.json')
}

test('new local store is empty and bookings survive reloading', (t) => {
  const file = fixture(t)
  assert.deepEqual(loadViewings(file), [])
  saveViewings(file, [viewing])
  assert.deepEqual(loadViewings(file), [viewing])
  saveViewings(file, [viewing, { ...viewing, id: 'V2' }])
  assert.equal(loadViewings(file).length, 2)
  assert.deepEqual(readdirSync(path.dirname(file)), ['viewings.json'])
})

test('corrupt data is rejected without overwriting the file', (t) => {
  const file = fixture(t)
  for (const value of ['not json', '{}', '[null]', '[{"id":"V1"}]']) {
    writeFileSync(file, value)
    assert.throws(() => loadViewings(file))
    assert.equal(readFileSync(file, 'utf8'), value)
  }
})

test('failed serialization preserves the previous local bookings', (t) => {
  const file = fixture(t)
  saveViewings(file, [viewing])
  const circular = {}
  circular.self = circular
  assert.throws(() => saveViewings(file, [circular]))
  assert.deepEqual(loadViewings(file), [viewing])
  assert.deepEqual(readdirSync(path.dirname(file)), ['viewings.json'])
})
