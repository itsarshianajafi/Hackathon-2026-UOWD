import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import areasFile from "@/data/areas.json";
import listingsFile from "@/data/listings.json";
import newsFile from "@/data/news.json";

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

export const rentWindow = listingsFile.rent_window;

/** If you buy this home and rent it out: DLD Ejari new-contract rent per m2 for the segment times the size. */
export function rentalRoi(listingId: string, runningCostsShare = 0.25, price?: number) {
  const l = listings.find((x) => x.id === listingId);
  if (!l) return { ok: false as const, error: `No listing ${listingId}` };
  if (l.annual_rent_aed == null || l.rent_per_m2_aed == null) {
    return { ok: false as const, error: `Too few rent contracts in ${l.name} (${l.kind}) to estimate rent; at least 30 are needed.` };
  }
  const paid = price ?? l.price_aed;
  const rent = l.rent_per_m2_aed * l.size_m2;
  const net = rent * (1 - runningCostsShare);
  const caveats = [
    "Rent is the area's median new Ejari contract per m2, times this home's size.",
    `Running costs (service charges, vacancy, fees) are assumed at ${Math.round(runningCostsShare * 100)}% of rent; DLD has no figures for them.`,
  ];
  if (l.registration === "Off-Plan") caveats.push("Off-plan: rent starts only after handover; today's rents for finished homes are used.");
  return {
    ok: true as const, listingId: l.id, title: l.title, price_aed: paid, size_m2: l.size_m2,
    annual_rent_aed: Math.round(rent), monthly_rent_aed: Math.round(rent / 12),
    gross_yield: rent / paid, running_costs_share: runningCostsShare,
    net_annual_rent_aed: Math.round(net), net_yield: net / paid, years_to_repay: paid / net,
    rent_contracts: l.rent_contracts, rent_window: rentWindow, caveats,
  };
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

export const NEWS_TOPICS = ["market_data", "supply", "infrastructure", "regulation", "economy"] as const;

/** Newest stories from approved sources only (team news branch snapshot), filtered by topic, area or tier. */
export function getNews(q: { topic?: string; area?: string; tier?: "official" | "press"; limit?: number }) {
  const dld = q.area ? new Set(findAreas(q.area).map((a) => a.area)) : null;
  if (q.area && !dld?.size) return { error: `No area called ${q.area}` };
  const items = newsFile.items
    .filter((i) => (!q.topic || i.topic === q.topic) && (!q.tier || i.tier === q.tier) && (!dld || i.areas.some((a) => dld.has(a))))
    .sort((a, b) => b.published.localeCompare(a.published))
    .slice(0, q.limit ?? 6)
    .map((i) => ({ title: i.title, source: i.source_name, tier: i.tier, topic: i.topic, published: i.published, link: i.link, areas: i.areas }));
  return { fetched_at: newsFile.fetched_at, count: items.length, items, note: "Approved sources only: DLD, Dubai Media Office, WAM, RTA, Dubai Municipality, and five newspapers." };
}
