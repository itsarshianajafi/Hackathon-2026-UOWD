import { connection } from "next/server";
import { viewings } from "@/lib/market";

export async function GET() {
  await connection();
  return Response.json({ viewings });
}
