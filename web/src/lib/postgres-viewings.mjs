/** Tagged queries keep buyer input parameterized; the unique key prevents double bookings. */
export function postgresViewings(sql) {
  return {
    async list() {
      return sql`
        SELECT id, listing_id AS "listingId", title, buyer, slot, booked_at AS "bookedAt"
        FROM estaro_viewings ORDER BY booked_at, id
      `
    },
    async insert(viewing) {
      const rows = await sql`
        INSERT INTO estaro_viewings (id, listing_id, title, buyer, slot, booked_at)
        VALUES (${viewing.id}, ${viewing.listingId}, ${viewing.title}, ${viewing.buyer}, ${viewing.slot}, ${viewing.bookedAt})
        ON CONFLICT (listing_id, slot) DO NOTHING
        RETURNING id, listing_id AS "listingId", title, buyer, slot, booked_at AS "bookedAt"
      `
      return rows[0] ?? null
    },
  }
}
