import {NextRequest, NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {timingSafeEqual} from "crypto";
import {parseEasyWebhook} from "@/lib/easy-webhook";

// Receives status pushes from Easy (POST, JSON, header x-event-key = our secret).
// Two statuses change anything: "ჩაბარებულია" -> delivered (from shipping or return_pending)
// and "არ ჩაიბარა" -> return_pending (from shipping). Everything else is acknowledged and ignored.
export const dynamic = "force-dynamic";

function sameSecret(given: string, expected: string) {
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET() {
  return NextResponse.json({ok: true});
}

export async function POST(req: NextRequest) {
  const expected = process.env.EASY_WEBHOOK_SECRET;
  if (!expected) return NextResponse.json({error: "not configured"}, {status: 503});

  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const given = req.headers.get("x-event-key") || req.nextUrl.searchParams.get("key") || req.headers.get("x-webhook-secret") || bearer;
  if (!given || !sameSecret(given, expected)) return NextResponse.json({error: "unauthorized"}, {status: 401});

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({error: "invalid json"}, {status: 400}); }

  const info = parseEasyWebhook(body);
  console.log("[easy-webhook]", JSON.stringify({tracking: info.tracking, status: info.statusName, status_id: info.statusId, delivered: info.delivered, not_delivered: info.notDelivered}));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const server = url && serviceKey ? createClient(url, serviceKey, {auth: {persistSession: false, autoRefreshToken: false}}) : null;

  // Best effort: the event log must never make Easy's request fail.
  async function record(result: string, orderNumber: string | null = null, trackingUsed: string | null = null) {
    const trk = trackingUsed || info.tracking;
    if (!server || !trk) return;
    try {
      const {error} = await server.from("onway_webhook_events").insert({
        tracking: trk, status_name: info.statusName ? `Easy: ${info.statusName}` : "Easy", status_id: info.statusId || null,
        delivered: info.delivered, result, order_number: orderNumber,
      });
      if (error) console.error("[easy-webhook] event log failed", error.message);
    } catch (e) { console.error("[easy-webhook] event log failed", e); }
  }

  if (!info.tracking) return NextResponse.json({ok: true, ignored: "no tracking"});
  if (!info.delivered && !info.notDelivered) {
    await record("ignored");
    return NextResponse.json({ok: true, ignored: "status not handled"});
  }
  if (!server) return NextResponse.json({error: "not configured"}, {status: 503});

  const fn = info.delivered ? "nexo_mark_easy_delivered" : "nexo_mark_easy_return_pending";
  // Easy may append a suffix after "/" (e.g. UB123/1); try the exact code first, then the part before "/".
  const candidates = [info.tracking];
  const base = info.tracking.split("/")[0].trim();
  if (base && base !== info.tracking) candidates.push(base);

  let data: unknown = "not_found";
  let used = info.tracking;
  for (const trk of candidates) {
    const res = await server.rpc(fn, {p_tracking: trk});
    if (res.error) {
      console.error("[easy-webhook] rpc failed", res.error.message);
      await record("error");
      return NextResponse.json({error: "update failed"}, {status: 500});
    }
    data = res.data;
    used = trk;
    if (data !== "not_found") break;
  }
  console.log("[easy-webhook] result", JSON.stringify({tracking: used, result: data}));

  let orderNumber: string | null = null;
  if (data === "updated" || data === "already_delivered" || data === "return_updated" || data === "already_return_pending") {
    const {data: orders} = await server.from("orders").select("order_number").eq("tracking_code", used).limit(1);
    orderNumber = orders?.[0]?.order_number != null ? String(orders[0].order_number) : null;
  }
  await record(String(data), orderNumber, used);
  return NextResponse.json({ok: true, result: data});
}
