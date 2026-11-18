import assert from 'node:assert/strict'
import test from 'node:test'
import { postgresViewings } from '../src/lib/postgres-viewings.mjs'

test('Postgres inserts parameterize input and return the saved booking', async () => {
  const viewing = { id: 'V1', listingId: 'L1', title: 'Demo home', buyer: "'; DROP TABLE estaro_viewings; --", slot: '2026-12-01T10:00:00+04:00', bookedAt: '2026-11-18T10:00:00Z' }
  const sql = async (strings, ...values) => {
    const statement = strings.join('?')
    assert.match(statement, /ON CONFLICT \(listing_id, slot\) DO NOTHING/)
    assert.ok(!statement.includes(viewing.buyer))
    assert.deepEqual(values, Object.values(viewing))
    return [viewing]
  }
  assert.deepEqual(await postgresViewings(sql).insert(viewing), viewing)
})

test('a conflicting booking returns null rather than a false confirmation', async () => {
  assert.equal(await postgresViewings(async () => []).insert({}), null)
})

test('listing uses fresh database rows and preserves the API field names', async () => {
  const rows = [{ id: 'V1', listingId: 'L1', bookedAt: '2026-11-18T10:00:00Z' }]
  const sql = async (strings) => {
    assert.match(strings.join(''), /listing_id AS "listingId"/)
    assert.match(strings.join(''), /booked_at AS "bookedAt"/)
    return rows
  }
  assert.deepEqual(await postgresViewings(sql).list(), rows)
})

test('database errors propagate instead of pretending data was saved', async () => {
  const store = postgresViewings(async () => { throw new Error('Database offline') })
  await assert.rejects(store.list(), /Database offline/)
  await assert.rejects(store.insert({}), /Database offline/)
})
