import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs, tool, type ModelMessage } from "ai";
import { z } from "zod";
import { areas, bookViewing, rentalRoi, getNews, NEWS_TOPICS, findAreas, freeSlots, matchBuyer, meta, searchListings, viewings, type Area, type Listing } from "@/lib/market";

const withChange = (a: Area) => ({
  ...a,
  forecast_vs_last_quarter: a.sales_change == null ? null : `${a.sales_change >= 0 ? "+" : ""}${Math.round(100 * a.sales_change)}%`,
});

const registration = z.enum(["Off-Plan", "Ready"]).optional();
const brief = (l: Listing) => ({
  id: l.id, title: l.title, price_aed: l.price_aed, size_m2: l.size_m2, beds: l.beds, registration: l.registration, area_trend: l.area_trend,
  annual_rent_aed: l.annual_rent_aed, gross_yield: l.gross_yield,
});

const tools = {
  search_listings: tool({
    description: "Search listings by area, price range in AED, bedrooms (0 = studio) and off-plan or ready.",
    inputSchema: z.object({
      area: z.string().optional(), minPrice: z.number().optional(), maxPrice: z.number().optional(),
      beds: z.number().int().optional(), registration,
    }),
    execute: async (q) => {
      const found = searchListings(q);
      return { count: found.length, listings: found.sort((a, b) => a.price_aed - b.price_aed).slice(0, 8).map(brief) };
    },
  }),
  match_buyer: tool({
    description: "Rank listings for a buyer: budget in AED, minimum bedrooms, preferred areas, off-plan or ready, and goal (live or invest).",
    inputSchema: z.object({
      budget: z.number(), beds: z.number().int().optional(), areas: z.array(z.string()).optional(), registration,
      goal: z.enum(["live", "invest"]),
    }),
    execute: async (b) => ({ matches: matchBuyer(b).map((m) => ({ ...brief(m), score: m.score, reasons: m.reasons })) }),
  }),
  get_area_outlook: tool({
    description: "Trend label and next-quarter forecast (sales, price per m2 in AED) for an area. Common names work, e.g. JVC or Dubai Marina.",
    inputSchema: z.object({ area: z.string() }),
    execute: async ({ area }) => {
      const rows = findAreas(area);
      return rows.length ? { quarter: meta.quarter, forecast_quarter: meta.forecastQuarter, segments: rows.map(withChange) } : { error: `No forecast for ${area}` };
    },
  }),
  top_areas: tool({
    description: "Area segments with the most forecast sales next quarter, optionally only rising ones. For investors.",
    inputSchema: z.object({ risingOnly: z.boolean().optional(), limit: z.number().int().max(10).optional() }),
    execute: async ({ risingOnly, limit }) => ({
      forecast_quarter: meta.forecastQuarter,
      areas: areas.filter((a) => !risingOnly || a.trend === "Rising").slice(0, limit ?? 5).map(withChange),
    }),
  }),
  get_available_slots: tool({
    description: "Free viewing slots for a listing over the next seven days (Dubai time).",
    inputSchema: z.object({ listingId: z.string() }),
    execute: async ({ listingId }) => ({ slots: freeSlots(listingId).slice(0, 8) }),
  }),
  book_viewing: tool({
    description: "Book a viewing. The slot must come from get_available_slots.",
    inputSchema: z.object({ listingId: z.string(), slot: z.string(), buyer: z.string() }),
    execute: async ({ listingId, slot, buyer }) => bookViewing(listingId, slot, buyer),
  }),
  rental_roi: tool({
    description: "If the buyer buys a listing and rents it out: annual rent, gross and net yield, and years to repay, from DLD Ejari rents. runningCostsShare defaults to 0.25.",
    inputSchema: z.object({ listingId: z.string(), runningCostsShare: z.number().min(0).max(0.9).optional(), price: z.number().optional() }),
    execute: async ({ listingId, runningCostsShare, price }) => rentalRoi(listingId, runningCostsShare, price),
  }),
  get_news: tool({
    description: "Recent Dubai property and city news from approved sources only (DLD, Dubai Media Office, WAM, RTA, Dubai Municipality, Gulf News, Khaleej Times, The National, Arabian Business, Zawya). Filter by topic, area or tier.",
    inputSchema: z.object({
      topic: z.enum(NEWS_TOPICS).optional(), area: z.string().optional(), tier: z.enum(["official", "press"]).optional(),
      limit: z.number().int().max(10).optional(),
    }),
    execute: async (q) => getNews(q),
  }),
  list_viewings: tool({
    description: "Viewings booked so far.",
    inputSchema: z.object({}),
    execute: async () => ({ viewings }),
  }),
};

const system = (mode: string, name: string) => `You are Estaro, an AI property agent for Dubai, working for ${name}, who is ${
  mode === "investor" ? "an investor planning ahead" : "a buyer looking for a home now"
}.
Act on your own: search, match, check the area outlook and book viewings with the tools, then report what you did.
Rules:
- Every number must come from a tool result. Never invent prices, forecasts or listings.
- Make no claim a tool result does not support. No "strong demand" or "good investment" unless the numbers show it.
- The trend label (Rising, Stable, Declining) describes the last year, not the future. The forecast is separate: when you give a forecast, always give forecast_vs_last_quarter next to it, even when it is negative, worded as a forecast, e.g. \"forecast 1,089 sales, 57% fewer than last quarter\".
- Money is in AED (UAE dirham), written like AED 1,250,000.
- Listings are synthetic demo listings priced from real DLD price per m2. Say so if asked where they come from.
- Market data is DLD sales to ${meta.dataTo}; ${meta.quarter} is provisional. Forecasts are for ${meta.forecastQuarter} and are a guide, not a promise.
- For news, use get_news and name each story's source; never cite news from anywhere else.
- For rent, ROI or what the buyer earns by renting a home out, use rental_roi and mention the running-costs assumption.
- Before booking, get free slots and book only a slot from that list. Confirm with the date and time.
- ${mode === "investor" ? "Lead with forecasts and area direction." : "Lead with what fits the budget today."}
- The app shows every tool result as cards under your reply (listings, areas, slots, bookings). So reply in 1 to 3 short sentences: what you did, the one thing that matters most, and a next step. Do not list the listings or areas again, and use no numbered lists or tables.`;

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: "OPENAI_API_KEY is not set in .env.local" }, { status: 500 });
  const { messages, mode, name } = (await req.json()) as { messages: ModelMessage[]; mode: string; name: string };
  try {
    const result = await generateText({
      model: openai.chat("gpt-4.1-mini"),
      system: system(mode, name),
      messages,
      tools,
      stopWhen: stepCountIs(8),
    });
    const steps = result.steps.flatMap((s) => s.toolResults.map((r) => ({ tool: r.toolName, input: r.input, output: r.output })));
    return Response.json({ text: result.text, steps });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Agent failed" }, { status: 502 });
  }
}
