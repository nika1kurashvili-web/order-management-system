import {createClient} from "./supabase-browser";

export type PurchasePrice = {product_id: string | null; variant_id: string | null; purchase_price: number | null};
export function parsePurchasePrice(value: string): number | null {
  if (!value.trim()) return null;
  if (!/^\+?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) throw new Error("შესყიდვის ფასი უნდა იყოს არაუარყოფითი რიცხვი ან ცარიელი.");
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) throw new Error("შესყიდვის ფასი უნდა იყოს არაუარყოფითი რიცხვი ან ცარიელი.");
  return price;
}

// Only called after a fresh admin check. The table independently enforces admin RLS.
export async function readPurchasePrices(c: ReturnType<typeof createClient>): Promise<PurchasePrice[]> {
  const rows: PurchasePrice[] = [];
  let expected: number | null = null;
  for (;;) {
    const {data, error, count} = await c.from("product_purchase_prices")
      .select("product_id,variant_id,purchase_price", {count: "exact"})
      .order("product_id", {nullsFirst: true}).order("variant_id", {nullsFirst: true})
      .range(rows.length, rows.length + 499);
    if (error) throw new Error("შესყიდვის ფასები ვერ ჩაიტვირთა. შეამოწმეთ მიგრაცია და წვდომა: " + error.message);
    if (!data || count === null || (expected !== null && expected !== count)) throw new Error("შესყიდვის ფასების სია შეიცვალა. სცადეთ ხელახლა.");
    expected = count;
    rows.push(...data as PurchasePrice[]);
    if (rows.length === count) return rows;
    if (!data.length || rows.length > count) throw new Error("შესყიდვის ფასების სია არასრულია.");
  }
}
