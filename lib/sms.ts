// SMS Office (https://smsoffice.ge) integration. Server-side only.
export type SmsKind = "onway" | "courier";

const VOUCHER = "ასევე თქვენ გაგიაქტიურდათ საყოფაცხოვრებო ტექნიკაზე 10% ფასდაკლების ვაუჩერი.";
const THANKS = "მადლობას გიხდით ნდობისთვის!";

export function codText(paymentType: unknown, total: unknown): string {
  if (paymentType !== "cod") return "";
  const n = Math.round(Number(total) * 100) / 100;
  return Number.isFinite(n) ? `კურიერთან გადაიხდით ${n} ლარს. ` : "";
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

export function buildOnwayText(o: { name: string; tracking: string; city: string; items: string; cod?: string }): string {
  const days = isTbilisi(o.city) ? 2 : 4;
  return `მოგესალმებით ${o.name}, თქვენი შეკვეთა გადაეცა საკურიერო კომპანია ონვეის შემდეგი თრექინგით: ${o.tracking}. ` +
    `თქვენს შეკვეთას, ${o.items} მიიღებთ ${days} სამუშაო დღეში. ${VOUCHER} ${o.cod || ""}${THANKS}`;
}

export function buildCourierText(o: { name: string; cod?: string }): string {
  return `მოგესალმებით ${o.name}, თქვენი შეკვეთა გადაეცა კურიერს და გთხოვთ, ყურადღებით იყავით ტელეფონთან. ${VOUCHER} ${o.cod || ""}${THANKS}`;
}

export async function sendSms(phone: string, content: string, reference: string) {
  const key = process.env.SMSOFFICE_API_KEY;
  if (!key) return { ok: false, error: "SMSOFFICE_API_KEY არ არის მითითებული", raw: "" };
  const body = new URLSearchParams({
    key, destination: phone, sender: process.env.SMSOFFICE_SENDER || "NEXO.GE", content, reference,
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
export async function sendOrderSms(server: any, orderId: string, kind: SmsKind, trackingOverride?: string | null) {
  try {
    const { data: o } = await server.from("orders").select("customer_name,customer_phone,customer_city,tracking_code,delivery_method,payment_type,total").eq("id", orderId).single();
    if (!o) return { sent: false, reason: "order_not_found" };
    if (o.delivery_method === "warehouse_pickup") return { sent: false, reason: "warehouse_pickup" };
    const real = normalizePhone(o.customer_phone);
    const test = process.env.SMSOFFICE_TEST_PHONE ? normalizePhone(process.env.SMSOFFICE_TEST_PHONE) : null;
    if (!real && !test) return { sent: false, reason: "bad_phone" };
    const phone = (test || real) as string;
    const name = String(o.customer_name ?? "").trim();
    const cod = codText(o.payment_type, o.total);
    let content: string;
    if (kind === "onway") {
      const tracking = String(trackingOverride || o.tracking_code || "").trim();
      if (!tracking) return { sent: false, reason: "no_tracking" };
      const { data: items } = await server.from("order_items").select("product_name,variant_name,quantity").eq("order_id", orderId);
      content = buildOnwayText({ name, tracking, city: o.customer_city, items: itemsText(items || []), cod });
    } else {
      content = buildCourierText({ name, cod });
    }
    const { error: claim } = await server.from("order_sms").insert({ order_id: orderId, kind, phone, content });
    if (claim) return { sent: false, reason: "already_sent" };
    const res = await sendSms(phone, content, `${kind}-${orderId}`.slice(0, 40));
    if (!res.ok) {
      await server.from("order_sms").delete().eq("order_id", orderId).eq("kind", kind);
      return { sent: false, reason: "provider_error", error: res.error };
    }
    await server.from("order_sms").update({ provider_response: res.raw.slice(0, 500) }).eq("order_id", orderId).eq("kind", kind);
    return { sent: true, test: !!test };
  } catch (e: any) {
    return { sent: false, reason: "exception", error: String(e?.message || e) };
  }
}

// Client helper: fire-and-forget after a status change to "shipping".
export async function notifyCourierShipping(supabase: any, orderId: string) {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return;
    await fetch("/api/sms/shipping", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ orderId }) });
  } catch {}
}
