import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canEditOrders } from "@/lib/order-options";
import { sendOrderSms } from "@/lib/sms";

// Sends one order to Easy (easy.online.ge). Mirrors the OnWay send route:
// auth by the caller's JWT, one-time send (no tracking yet), the result is saved by a
// service-role RPC (tracking + status "shipping" + delivery fee), then the customer SMS.
export const dynamic = "force-dynamic";

const EASY = "https://easy.online.ge/api/v1";

function contactOf(phone: unknown): string | null {
  let d = String(phone ?? "").replace(/\D+/g, "");
  if (d.length === 12 && d.startsWith("995")) d = d.slice(3);
  return /^\d{9}$/.test(d) ? d : null;
}

export async function POST(req: NextRequest) {
  let receivedTracking: string | null = null;
  try {
    const auth = req.headers.get("authorization") || "";
    if (!auth.startsWith("Bearer ")) return NextResponse.json({ error: "ავტორიზაცია ვერ დადასტურდა." }, { status: 401 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const c = createClient(url, anon, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: ue } = await c.auth.getUser(auth.slice(7));
    if (ue || !user) return NextResponse.json({ error: "სესია დასრულებულია." }, { status: 401 });

    const { data: profile, error: profileError } = await c.from("profiles").select("role,active").eq("id", user.id).single();
    if (profileError || !profile || profile.active !== true || !canEditOrders(profile.role)) {
      return NextResponse.json({ error: "Easy-ში გაგზავნის უფლება არ გაქვთ." }, { status: 403 });
    }

    const { orderId, resend } = await req.json();
    if (!orderId) return NextResponse.json({ error: "შეკვეთის ID არ არის მითითებული." }, { status: 400 });

    const { data: o, error: oe } = await c.from("orders").select("*").eq("id", orderId).single();
    if (oe || !o) return NextResponse.json({ error: "შეკვეთაზე წვდომა არ გაქვს ან შეკვეთა ვერ მოიძებნა." }, { status: 403 });
    if (profile.role === "operator" && o.created_by !== user.id) {
      return NextResponse.json({ error: "შეკვეთაზე წვდომა არ გაქვთ." }, { status: 403 });
    }
    if (o.delivery_method !== "easy") {
      return NextResponse.json({ error: "ეს შეკვეთა Easy-ით არ იგზავნება. თუ მიწოდების მეთოდი ახლახან შეცვალე, ჯერ დააჭირე „ცვლილებების შენახვას“." }, { status: 400 });
    }

    // Re-sending (also after switching from another courier): admins any time, the operator who
    // created the order during the first 24 hours. The new tracking code replaces the old one.
    const resending = resend === true && !!o.tracking_code;
    if (resending) {
      if (["delivered", "cancelled"].includes(String(o.status))) {
        return NextResponse.json({ error: "ჩაბარებული ან გაუქმებული შეკვეთა ხელახლა ვერ გაიგზავნება." }, { status: 409 });
      }
      if (profile.role === "operator" && Date.now() - new Date(o.created_at).getTime() > 24 * 3600 * 1000) {
        return NextResponse.json({ error: "შეკვეთის დაფიქსირებიდან 24 საათი გავიდა; ხელახლა გაგზავნა მხოლოდ ადმინს შეუძლია." }, { status: 403 });
      }
    }
    if (o.tracking_code && !resending) {
      return NextResponse.json({ error: "ამ შეკვეთას უკვე აქვს Tracking კოდი და ხელახლა არ გაიგზავნა." }, { status: 409 });
    }
    if (!o.customer_city_id || !o.customer_city || !o.customer_name || !o.customer_phone || !o.customer_address) {
      return NextResponse.json({ error: "მომხმარებლის რაიონი, სახელი, ტელეფონი და მისამართი სავალდებულოა." }, { status: 400 });
    }
    const contact = contactOf(o.customer_phone);
    if (!contact) {
      return NextResponse.json({ error: "Easy-სთვის ტელეფონი უნდა იყოს ზუსტად 9 ციფრი (მაგ. 599123456)." }, { status: 400 });
    }

    const { data: creator } = await c.from("profiles").select("full_name").eq("id", o.created_by).single();
    const { data: items, error: ie } = await c.from("order_items").select("product_name,variant_name,quantity").eq("order_id", orderId);
    if (ie || !items?.length) return NextResponse.json({ error: "შეკვეთაში პროდუქტები ვერ მოიძებნა." }, { status: 400 });

    const apiKey = process.env.EASY_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Vercel-ში EASY_API_KEY არ არის დამატებული." }, { status: 500 });

    // Find the zone of the chosen district (and its delivery price) from Easy's own list.
    const zr = await fetch(`${EASY}/logistic/zones`, { headers: { "x-api-key": apiKey }, cache: "no-store" });
    if (!zr.ok) return NextResponse.json({ error: `Easy-ს ზონების სია ვერ ჩაიტვირთა (HTTP ${zr.status}).` }, { status: 502 });
    const zones: any[] = await zr.json().catch(() => []);
    let zone: any = null, district: any = null;
    for (const z of Array.isArray(zones) ? zones : []) {
      const d = (Array.isArray(z?.districts) ? z.districts : []).find((x: any) => Number(x?.id) === Number(o.customer_city_id));
      if (d) { zone = z; district = d; break; }
    }
    if (!zone || !district) {
      return NextResponse.json({ error: "არჩეული რაიონი Easy-ს სიაში ვერ მოიძებნა. თავიდან აირჩიე რაიონი Easy-ს სიიდან." }, { status: 400 });
    }
    const priceRaw = Number(district.delivery_price ?? zone.delivery_price);
    const shippingFee = Number.isFinite(priceRaw) && priceRaw >= 0 ? priceRaw : null;

    const detail = items.map((i: any) => `${i.product_name}${i.variant_name ? ` — ${i.variant_name}` : ""} x${i.quantity}`).join(", ");
    const additionalInfo = [detail, o.customer_comment].filter(Boolean).join(" | ")
      .concat(creator?.full_name?.trim() ? ` (${creator.full_name.trim()})` : "").slice(0, 500);

    // A re-sent shipment gets a suffix (631-2, 631-3, ...) so the team can tell it was sent more than once.
    let externalId = String(o.order_number);
    if (resending) {
      const { count } = await c.from("order_activity").select("id", { count: "exact", head: true })
        .eq("order_id", orderId).eq("action", "tracking_changed").not("old_value", "is", null).neq("old_value", "");
      externalId += `-${2 + (count || 0)}`;
    }

    const orderBody: Record<string, unknown> = {
      name: String(o.customer_name).trim(),
      deliveryZone: Number(zone.id),
      district: Number(district.id),
      address: String(o.customer_address).trim(),
      contact,
      codAmount: o.payment_type === "cod" ? Number(o.total || 0) : 0,
      additionalInfo,
      external_id: externalId,
    };
    const payload: Record<string, unknown> = { orders: [orderBody] };
    const pickup = Number(process.env.EASY_PICKUP_ADDRESS_ID);
    if (Number.isFinite(pickup) && pickup > 0) payload.pickupAddressId = pickup;

    const r = await fetch(`${EASY}/orders/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const text = await r.text();
    let data: any = text;
    try { data = JSON.parse(text); } catch { /* keep text */ }

    if (!r.ok || (data && typeof data === "object" && (data.success === false || data.error))) {
      const msgs = Array.isArray(data?.errors) ? data.errors.map((e: any) => `${e.field}: ${e.message}`).join("; ") : "";
      return NextResponse.json({
        error: "Easy-მ შეკვეთა არ მიიღო." + (data?.message ? " " + data.message : "") + (msgs ? " (" + msgs + ")" : "") + (!msgs && !data?.message && data?.error ? " " + data.error : ""),
        details: data,
      }, { status: 502 });
    }

    const tracking = String(data?.addedOrders?.[0]?.tracking_code ?? "").trim();
    if (!tracking) {
      return NextResponse.json({
        error: "Easy-მ შეკვეთა მიიღო, მაგრამ Tracking კოდი ვერ ამოვიკითხეთ. ხელახლა ნუ გააგზავნი; შეამოწმე Easy-ს პანელი.",
        details: data,
      }, { status: 502 });
    }
    receivedTracking = tracking;

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const server = serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
    const sms = server ? await sendOrderSms(server, String(orderId), "onway", tracking, resending) : { sent: false, reason: "no_service_key" };

    if (server) {
      const { data: recorded, error: recordError } = await server.rpc(resending ? "nexo_record_easy_resend" : "nexo_record_easy_result", {
        p_order_id: String(orderId), p_actor: user.id, p_tracking: tracking, p_delivery_fee: shippingFee,
      });
      if (!recordError && recorded) return NextResponse.json({ ok: true, tracking, easy: data, sms });
    }

    if (resending) {
      return NextResponse.json({
        error: "Easy-ში ხელახლა გაიგზავნა, მაგრამ ახალი Tracking Nexo-ში ვერ შეინახა. ხელახლა ნუ გააგზავნით; ახალი Tracking: " + tracking +
          ". შეიყვანეთ ხელით თრექინგის ველში. (ბაზაში გაუშვით 202611130002 მიგრაცია, თუ ეს ჯერ არ გაგიკეთებიათ.)",
        tracking,
      }, { status: 500 });
    }

    // Fallback if the RPC is not installed yet: plain update that keeps RLS/trigger protections
    // and never overwrites an existing tracking. The courier submission is never retried.
    const trackingPatch = { tracking_code: tracking, status: "shipping" };
    const upd = (patch: Record<string, unknown>) =>
      c.from("orders").update(patch).eq("id", orderId).eq("delivery_method", "easy").is("tracking_code", null).select("id").single();
    const { data: saved, error: up } = await upd({ ...trackingPatch, ...(shippingFee === null ? {} : { delivery_fee: shippingFee }) });
    if ((up || !saved) && shippingFee !== null) {
      const { data: fb, error: fbErr } = await upd(trackingPatch);
      if (!fbErr && fb) {
        return NextResponse.json({ ok: true, tracking, easy: data, sms,
          warning: "Tracking შენახულია, მაგრამ მიტანის საფასური ვერ შეინახა. Admin-მა შეასწოროს საფასური; ხელახლა ნუ გააგზავნით." });
      }
    }
    if (up || !saved) {
      return NextResponse.json({
        error: "Easy-ში გაიგზავნა, მაგრამ Tracking/სტატუსი Nexo-ში ვერ შეინახა: " + (up?.message || "ჩანაწერის განახლება ვერ დადასტურდა.") +
          " ხელახლა ნუ გააგზავნით; შეინახეთ დაბრუნებული Tracking კოდი: " + tracking,
        tracking,
      }, { status: 500 });
    }
    return NextResponse.json({ ok: true, tracking, easy: data, sms });
  } catch (e: any) {
    return NextResponse.json({
      ...(receivedTracking ? { tracking: receivedTracking } : {}),
      error: receivedTracking
        ? "Easy-ში გაიგზავნა, მაგრამ შენახვა ვერ დადასტურდა. ხელახლა ნუ გააგზავნით; შეინახეთ Tracking კოდი: " + receivedTracking
        : e?.message || "Easy-ში გაგზავნა ვერ მოხერხდა.",
    }, { status: 500 });
  }
}
