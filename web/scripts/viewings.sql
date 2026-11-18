-- Run once in the Neon SQL editor for each Production/Preview database.
CREATE TABLE IF NOT EXISTS estaro_viewings (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  title TEXT NOT NULL,
  buyer TEXT NOT NULL,
  slot TEXT NOT NULL,
  booked_at TEXT NOT NULL,
  UNIQUE (listing_id, slot)
);
