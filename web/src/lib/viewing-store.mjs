import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export function loadViewings(file) {
  let contents
  try {
    contents = readFileSync(file, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
  const rows = JSON.parse(contents)
  const fields = ['id', 'listingId', 'title', 'buyer', 'slot', 'bookedAt']
  if (!Array.isArray(rows) || rows.some((row) => !row || fields.some((key) => typeof row[key] !== 'string'))) {
    throw new Error('Invalid viewing store. Restore the file from backup before restarting.')
  }
  return rows
}

/** Atomic replacement avoids truncating the previous bookings on a failed write. */
export function saveViewings(file, rows) {
  mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporary, JSON.stringify(rows, null, 2), { mode: 0o600 })
    renameSync(temporary, file)
  } finally {
    try {
      unlinkSync(temporary)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
}
