// SMS Office (https://smsoffice.ge) integration. Server-side only.
export type SmsKind = "onway" | "courier";

const VOUCHER = "10% ვაუჩერი გაგიაქტიურდათ.";

// Cash-on-delivery amount, e.g. "35" (null when the order is already paid).
function codAmount(paymentType: unknown, total: unknown): string | null {
  if (paymentType !== "cod") return null;
  const n = Math.round(Number(total) * 100) / 100;
  return Number.isFinite(n) ? String(n) : null;
}

export function normalizePhone(raw: unknown): string | null {
  let d = String(raw ?? "").replace(/\D+/g, "");
  if (d.startsWith("00995")) d = d.slice(2);
  if (d.length === 9 && d.startsWith("5")) d = "995" + d;
  return /^995[5]\d{8}$/.test(d) ? d : null;
}

export function isTbilisi(city: unknown): boolean {
  const s = String(city ?? "").toLowerCase();
  return s.includes("თბილის") || s.includes("tbilisi");
}

export function itemsText(items: { product_name?: string | null; variant_name?: string | null; quantity?: number | string | null }[]): string {
  return items.map((i) => {
    const v = String(i.variant_name ?? "").trim();
    return `${String(i.product_name ?? "").trim()}${v ? ` (${v})` : ""} x${Number(i.quantity) || 1}`;
  }).join(", ");
}

export function buildOnwayText(o: { tracking: string; paymentType: unknown; total: unknown; city: unknown }): string {
  const cod = codAmount(o.paymentType, o.total);
  const tail = cod !== null ? `კურიერთან ${cod} ლარი` : `მიწოდების ვადა ${isTbilisi(o.city) ? 2 : 4}დღე`;
  return `${VOUCHER}შეკვეთა ${o.tracking} გზაშია, ${tail}`.replace(", მიწოდების", ",მიწოდების");
}

export function buildCourierText(o: { paymentType: unknown; total: unknown }): string {
  const cod = codAmount(o.paymentType, o.total);
  return cod !== null
    ? `${VOUCHER}შეკვეთა გზაშია,კურიერთან გადაიხდით ${cod}ლარს`
    : `${VOUCHER}შეკვეთა გზაშია,ყურადღებით იყავით ტელეფონთან`;
}

export async function sendSms(phone: string, content: string, _reference?: string) {
  const key = process.env.SMSOFFICE_API_KEY;
  if (!key) return { ok: false, error: "SMSOFFICE_API_KEY არ არის მითითებული", raw: "" };
  const body = new URLSearchParams({
    key, destination: phone, sender: process.env.SMSOFFICE_SENDER || "NEXO.GE", content,
  });
  try {
    const r = await fetch("https://smsoffice.ge/api/v2/send/", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
    });
    const raw = await r.text();
    let j: any = null; try { j = JSON.parse(raw); } catch {}
    const ok = !!j && j.Success === true && Number(j.ErrorCode ?? 0) === 0;
    return { ok, error: ok ? null : `SMS Office: ${j?.Message || raw.slice(0, 200)} (${j?.ErrorCode ?? r.status})`, raw };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e), raw: "" };
  }
}

// Best-effort: never throws. `server` must be a service-role Supabase client.
export async function sendOrderSms(server: any, orderId: string, kind: SmsKind, trackingOverride?: string | null, force = false) {
  try {
    const { data: o } = await server.from("orders").select("customer_name,customer_phone,customer_city,tracking_code,delivery_method,payment_type,total").eq("id", orderId).single();
    if (!o) return { sent: false, reason: "order_not_found" };
    if (o.delivery_method === "warehouse_pickup") return { sent: false, reason: "warehouse_pickup" };
    const real = normalizePhone(o.customer_phone);
    const test = process.env.SMSOFFICE_TEST_PHONE ? normalizePhone(process.env.SMSOFFICE_TEST_PHONE) : null;
    if (!real && !test) return { sent: false, reason: "bad_phone" };
    const phone = (test || real) as string;
    let content: string;
    if (kind === "onway") {
      const tracking = String(trackingOverride || o.tracking_code || "").trim();
      if (!tracking) return { sent: false, reason: "no_tracking" };
      content = buildOnwayText({ tracking, paymentType: o.payment_type, total: o.total, city: o.customer_city });
    } else {
      content = buildCourierText({ paymentType: o.payment_type, total: o.total });
    }
    if (!force) {
      const { error: claim } = await server.from("order_sms").insert({ order_id: orderId, kind, phone, content });
      if (claim) return { sent: false, reason: "already_sent" };
    }
    const res = await sendSms(phone, content, `${kind}-${orderId}`.slice(0, 40));
    if (!res.ok && force) return { sent: false, reason: "provider_error", error: res.error };
    if (!res.ok) {
      const { error: delErr } = await server.from("order_sms").delete().eq("order_id", orderId).eq("kind", kind);
      if (delErr) return { sent: false, reason: "provider_error", error: `${res.error} (ჩანაწერის გასუფთავება ვერ მოხერხდა: ${delErr.message})` };
      return { sent: false, reason: "provider_error", error: res.error };
    }
    if (force) await server.from("order_sms").upsert({ order_id: orderId, kind, phone, content, provider_response: res.raw.slice(0, 500) }, { onConflict: "order_id,kind" });
    else await server.from("order_sms").update({ provider_response: res.raw.slice(0, 500) }).eq("order_id", orderId).eq("kind", kind);
    return { sent: true, test: !!test };
  } catch (e: any) {
    return { sent: false, reason: "exception", error: String(e?.message || e) };
  }
}

// Client helper: after a status change to "shipping". Shows the outcome (testing aid).
export async function notifyCourierShipping(supabase: any, orderId: string) {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) { alert("SMS: სესია ვერ მოიძებნა."); return; }
    const r = await fetch("/api/sms/shipping", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ orderId }) });
    const j = await r.json().catch(() => ({}));
    if (j?.sent === true) { alert("SMS გაიგზავნა" + (j?.test ? " (სატესტო ნომერზე)" : "") + "."); return; }
    alert("SMS არ გაიგზავნა: " + (j?.error || j?.reason || r.status));
  } catch (e: any) { alert("SMS შეცდომა: " + String(e?.message || e)); }
}
