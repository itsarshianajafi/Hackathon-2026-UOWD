import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import areasFile from "@/data/areas.json";
import listingsFile from "@/data/listings.json";

export type Area = (typeof areasFile.rows)[number];
export type Listing = (typeof listingsFile.rows)[number];
export type Viewing = { id: string; listingId: string; title: string; buyer: string; slot: string; bookedAt: string };

export const areas = areasFile.rows;
export const listings = listingsFile.rows;
export const meta = { quarter: areasFile.quarter, forecastQuarter: areasFile.forecast_quarter, dataTo: areasFile.data_to };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const matches = (query: string, a: { area: string; name: string }) =>
  norm(a.name).includes(norm(query)) || norm(a.area).includes(norm(query));

export function findAreas(query: string) {
  return areas.filter((a) => matches(query, a));
}

export function searchListings(q: { area?: string; minPrice?: number; maxPrice?: number; beds?: number; registration?: "Off-Plan" | "Ready" }) {
  return listings.filter(
    (l) =>
      (!q.area || matches(q.area, l)) &&
      (q.minPrice === undefined || l.price_aed >= q.minPrice) &&
      (q.maxPrice === undefined || l.price_aed <= q.maxPrice) &&
      (q.beds === undefined || l.beds === q.beds) &&
      (!q.registration || l.registration === q.registration),
  );
}

/** Ranks listings for a buyer brief: hard filters, then a fixed score the model only explains. */
export function matchBuyer(b: { budget: number; beds?: number; areas?: string[]; registration?: "Off-Plan" | "Ready"; goal: "live" | "invest" }) {
  const segment = (l: Listing) => areas.find((a) => a.area === l.area && a.registration === l.registration);
  return listings
    .filter(
      (l) =>
        l.price_aed <= b.budget &&
        (b.beds === undefined || l.beds >= b.beds) &&
        (!b.registration || l.registration === b.registration) &&
        (!b.areas?.length || b.areas.some((q) => matches(q, l))),
    )
    .map((l) => {
      const s = segment(l);
      const reasons = [`uses ${Math.round((100 * l.price_aed) / b.budget)}% of budget`];
      let score = (50 * l.price_aed) / b.budget;
      if (s?.trend === "Rising") {
        score += 20;
        reasons.push("area is rising");
      }
      if (s?.trend === "Declining") {
        score -= 20;
        reasons.push("area is declining");
      }
      if (b.goal === "invest" && s?.sales_change != null) {
        score += Math.max(-15, Math.min(15, 50 * s.sales_change));
        reasons.push(`forecast sales ${s.sales_change >= 0 ? "+" : ""}${Math.round(100 * s.sales_change)}% next quarter`);
      }
      return { ...l, score: Math.round(score), reasons };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, 5);
}

// Saved to .data/viewings.json so bookings survive a server restart.
const VIEWINGS_FILE = path.join(process.cwd(), ".data", "viewings.json");
const store = globalThis as unknown as { viewings?: Viewing[] };
export const viewings: Viewing[] = (store.viewings ??= existsSync(VIEWINGS_FILE) ? JSON.parse(readFileSync(VIEWINGS_FILE, "utf8")) : []);

function saveViewings() {
  mkdirSync(path.dirname(VIEWINGS_FILE), { recursive: true });
  writeFileSync(VIEWINGS_FILE, JSON.stringify(viewings, null, 2));
}

/** Two-hour slots, 10:00 to 16:00 Dubai time, over the next seven days, minus booked ones. */
export function freeSlots(listingId: string, from = new Date()) {
  const taken = new Set(viewings.filter((v) => v.listingId === listingId).map((v) => v.slot));
  const slots: string[] = [];
  for (let d = 1; d <= 7; d++) {
    const date = new Date(from.getTime() + d * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
    for (const hour of ["10:00", "12:00", "14:00", "16:00"]) {
      const slot = `${date}T${hour}:00+04:00`;
      if (!taken.has(slot)) slots.push(slot);
    }
  }
  return slots;
}

export function bookViewing(listingId: string, slot: string, buyer: string) {
  const listing = listings.find((l) => l.id === listingId);
  if (!listing) return { ok: false as const, error: `No listing ${listingId}` };
  if (!freeSlots(listingId).includes(slot)) return { ok: false as const, error: "That slot is not available. Get free slots first." };
  const viewing: Viewing = { id: `V${viewings.length + 1}`, listingId, title: listing.title, buyer, slot, bookedAt: new Date().toISOString() };
  viewings.push(viewing);
  saveViewings();
  return { ok: true as const, viewing };
}
