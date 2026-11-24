import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseEasyWebhook } from "@/lib/easy-webhook";

// Catch-up (admin/operator/manager button, the dashboard's background timer, or Vercel cron with CRON_SECRET): asks Easy for the current status of every Easy order that is still
// "shipping" / "return_pending" here and applies the same two rules as the webhook
// ("ჩაბარებულია" -> delivered, "არ ჩაიბარა" -> return_pending).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EASY = "https://easy.online.ge/api/v1";

async function runSync(): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.EASY_API_KEY;
  if (!serviceKey) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY არ არის დამატებული." }, { status: 500 });
  if (!apiKey) return NextResponse.json({ error: "Vercel-ში EASY_API_KEY არ არის დამატებული." }, { status: 500 });
  const server = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: rows, error } = await server.from("orders").select("order_number,tracking_code,status")
    .eq("delivery_method", "easy").in("status", ["shipping", "return_pending"]).not("tracking_code", "is", null)
    .order("created_at", { ascending: false }).limit(300);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const list = (rows || []).filter(r => String(r.tracking_code || "").trim() !== "");

  const out = { checked: 0, delivered: 0, return_pending: 0, unchanged: 0, not_found: 0, failed: 0 };
  const changed: string[] = [];
  let index = 0;
  async function worker() {
    while (index < list.length) {
      const r = list[index++];
      const trk = String(r.tracking_code).trim();
      try {
        const res = await fetch(`${EASY}/orders?tracking_code=${encodeURIComponent(trk)}`, { headers: { "x-api-key": apiKey! }, cache: "no-store" });
        if (!res.ok) { out.failed++; continue; }
        const json: any = await res.json().catch(() => null);
        const items: any[] = Array.isArray(json?.data) ? json.data : [];
        const hit = items.find(i => String(i?.tracking_code || "").toLowerCase() === trk.toLowerCase()) || items[0];
        out.checked++;
        if (!hit) { out.not_found++; continue; }
        const info = parseEasyWebhook({ data: { tracking_code: trk, new_status: hit.statusName, new_status_code: hit.status } });
        if (!info.delivered && !info.notDelivered) { out.unchanged++; continue; }
        const fn = info.delivered ? "nexo_mark_easy_delivered" : "nexo_mark_easy_return_pending";
        const rpc = await server.rpc(fn, { p_tracking: trk });
        if (rpc.error) { out.failed++; continue; }
        if (rpc.data === "updated") { out.delivered++; changed.push(`#${r.order_number}`); }
        else if (rpc.data === "return_updated") { out.return_pending++; changed.push(`#${r.order_number}`); }
        else out.unchanged++;
      } catch { out.failed++; }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker(), worker()]);
  return NextResponse.json({ ok: true, total: list.length, ...out, changed: changed.slice(0, 50) });
}

// Vercel cron (GET with "Authorization: Bearer <CRON_SECRET>").
export async function GET(req: NextRequest) {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return runSync();
}

// Signed-in staff (dashboard button / background timer).
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") || "";
    if (!auth.startsWith("Bearer ")) return NextResponse.json({ error: "ავტორიზაცია ვერ დადასტურდა." }, { status: 401 });
    const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: ue } = await c.auth.getUser(auth.slice(7));
    if (ue || !user) return NextResponse.json({ error: "სესია დასრულებულია." }, { status: 401 });
    const { data: profile } = await c.from("profiles").select("role,active").eq("id", user.id).single();
    if (!profile || profile.active !== true || !["admin", "operator", "manager"].includes(String(profile.role))) {
      return NextResponse.json({ error: "წვდომა არ გაქვთ." }, { status: 403 });
    }
    return await runSync();
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "სინქრონიზაცია ვერ მოხერხდა." }, { status: 500 });
  }
}
