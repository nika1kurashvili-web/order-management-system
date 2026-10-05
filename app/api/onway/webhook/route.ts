import {NextRequest, NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {timingSafeEqual} from "crypto";
import {parseOnwayWebhook} from "@/lib/onway-webhook";

// Receives status pushes from OnWay (POST, JSON). Only a "delivered" status changes
// anything: the matching OnWay order goes from shipping to delivered. Every other
// status is acknowledged and ignored.
export const dynamic = "force-dynamic";

function sameSecret(given: string, expected: string) {
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Health check: some providers open the URL first to verify it is alive.
export async function GET() {
  return NextResponse.json({ok: true});
}

export async function POST(req: NextRequest) {
  const expected = process.env.ONWAY_WEBHOOK_SECRET;
  if (!expected) return NextResponse.json({error: "not configured"}, {status: 503});

  // The secret may arrive as ?key=... in the URL or as the x-webhook-secret / Bearer header.
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const given = req.nextUrl.searchParams.get("key") || req.headers.get("x-webhook-secret") || bearer;
  if (!given || !sameSecret(given, expected)) return NextResponse.json({error: "unauthorized"}, {status: 401});

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({error: "invalid json"}, {status: 400}); }

  const deliveredIds = (process.env.ONWAY_DELIVERED_STATUS_IDS || "").split(",");
  const info = parseOnwayWebhook(body, deliveredIds);
  // Log only what is needed to learn the status names; no customer data.
  console.log("[onway-webhook]", JSON.stringify({tracking: info.tracking, status: info.statusName, status_id: info.statusId, delivered: info.delivered}));

  if (!info.tracking) return NextResponse.json({ok: true, ignored: "no tracking"});
  if (!info.delivered) return NextResponse.json({ok: true, ignored: "not delivered"});

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({error: "not configured"}, {status: 503});

  const server = createClient(url, serviceKey, {auth: {persistSession: false, autoRefreshToken: false}});
  const {data, error} = await server.rpc("nexo_mark_onway_delivered", {p_tracking: info.tracking});
  if (error) {
    console.error("[onway-webhook] rpc failed", error.message);
    return NextResponse.json({error: "update failed"}, {status: 500});
  }
  console.log("[onway-webhook] result", JSON.stringify({tracking: info.tracking, result: data}));
  return NextResponse.json({ok: true, result: data});
}
