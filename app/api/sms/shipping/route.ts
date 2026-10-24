import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canEditOrders } from "@/lib/order-options";
import { sendOrderSms } from "@/lib/sms";

// Called by the UI after a private-courier order is switched to "shipping".
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") || "";
    if (!auth.startsWith("Bearer ")) return NextResponse.json({ error: "ავტორიზაცია ვერ დადასტურდა." }, { status: 401 });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const c = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: ue } = await c.auth.getUser(auth.slice(7));
    if (ue || !user) return NextResponse.json({ error: "სესია დასრულებულია." }, { status: 401 });
    const { data: profile } = await c.from("profiles").select("role,active").eq("id", user.id).single();
    if (!profile || profile.active !== true || !canEditOrders(profile.role)) return NextResponse.json({ error: "უფლება არ გაქვთ." }, { status: 403 });
    const { orderId } = await req.json();
    if (!orderId) return NextResponse.json({ error: "შეკვეთის ID არ არის მითითებული." }, { status: 400 });
    const { data: o } = await c.from("orders").select("status,delivery_method,created_by").eq("id", orderId).single();
    if (!o) return NextResponse.json({ error: "შეკვეთა ვერ მოიძებნა." }, { status: 403 });
    if (profile.role === "operator" && o.created_by !== user.id) return NextResponse.json({ error: "შეკვეთაზე წვდომა არ გაქვთ." }, { status: 403 });
    if (o.delivery_method !== "private_courier" || o.status !== "shipping") return NextResponse.json({ sent: false, reason: "not_applicable" });
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) return NextResponse.json({ sent: false, reason: "no_service_key" });
    const server = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    return NextResponse.json(await sendOrderSms(server, String(orderId), "courier"));
  } catch (e: any) {
    return NextResponse.json({ sent: false, error: String(e?.message || e) });
  }
}
