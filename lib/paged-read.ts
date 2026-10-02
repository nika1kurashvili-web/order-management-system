import {createClient} from "./supabase-browser";

type Client = ReturnType<typeof createClient>;
const PAGE = 1000; // Supabase returns at most 1000 rows per request by default.

// Reads order_items for many orders without exceeding URL limits (id chunks)
// or the default row cap (range pages). Throws on any error.
export async function readOrderItems<T>(c: Client, orderIds: string[], columns: string): Promise<T[]> {
  const all: T[] = [];
  for (let i = 0; i < orderIds.length; i += 100) {
    const chunk = orderIds.slice(i, i + 100);
    for (let from = 0; ; from += PAGE) {
      const {data, error} = await c.from("order_items").select(columns).in("order_id", chunk)
        .order("id").range(from, from + PAGE - 1);
      if (error) throw error;
      all.push(...((data || []) as unknown as T[]));
      if (!data || data.length < PAGE) break;
    }
  }
  return all;
}

// Reads every order visible to the caller, newest first, in pages of 1000.
export async function readAllOrders<T>(c: Client, columns: string, userId?: string): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = c.from("orders").select(columns).order("created_at", {ascending: false}).order("id").range(from, from + PAGE - 1);
    if (userId) query = query.eq("created_by", userId);
    const {data, error} = await query;
    if (error) throw error;
    all.push(...((data || []) as unknown as T[]));
    if (!data || data.length < PAGE) break;
  }
  return all;
}
