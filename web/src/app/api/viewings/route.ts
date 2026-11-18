import { connection } from "next/server";
import { listViewings } from "@/lib/market";

export async function GET() {
  await connection();
  try {
    return Response.json({ viewings: await listViewings() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Viewing storage unavailable", error);
    return Response.json({ error: "Booking storage is unavailable. Please try again later." }, { status: 503 });
  }
}
