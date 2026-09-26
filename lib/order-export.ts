import {createClient} from "./supabase-browser";
import {PurchasePrice, readPurchasePrices} from "./purchase-prices";

// Always verify the current session, not the Dashboard's cached role.
export async function exportPurchasePrices(c: ReturnType<typeof createClient>) {
  const {data: {user}, error: authError} = await c.auth.getUser();
  if (authError || !user) throw new Error("სესია დასრულებულია. თავიდან შედით სისტემაში.");
  const {data: profile, error} = await c.from("profiles").select("role,active").eq("id", user.id).single();
  if (error || profile?.active !== true || !["admin", "manager"].includes(profile.role)) {
    throw new Error("Excel-ის ჩამოტვირთვის უფლება არ გაქვთ.");
  }
  const includeCosts = profile.role === "admin";
  // Managers never request confidential rows; database RLS independently denies them.
  return {includeCosts, costs: includeCosts ? await readPurchasePrices(c) : []};
}

export function purchasePriceLookup(costs: PurchasePrice[]) {
  const products = new Map(costs.filter(c => c.product_id).map(c => [c.product_id, c.purchase_price]));
  const variants = new Map(costs.filter(c => c.variant_id).map(c => [c.variant_id, c.purchase_price]));
  return (item: {product_id?: string | null; variant_id?: string | null; variant_name?: string | null}): number | "" => {
    // A deleted variant keeps its historical name but loses its FK. Never replace
    // its missing cost with a parent cost or guess identity from a snapshot name.
    const value = item.variant_id ? variants.get(item.variant_id)
      : item.variant_name?.trim() ? null
      : item.product_id ? products.get(item.product_id) : null;
    if (value == null) return "";
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : "";
  };
}

export function tbilisiOrderDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("ka-GE", {
    timeZone: "Asia/Tbilisi", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value || "";
  return `${part("day")}.${part("month")}.${part("year")} ${part("hour")}:${part("minute")}`;
}
