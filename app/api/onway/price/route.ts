import {NextRequest, NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {canEditOrders, parseDeliveryFee} from "@/lib/order-options";

export async function POST(req: NextRequest) {
  const failure = (status: number, error = "OnWay-ის ფასის მიღება ვერ მოხერხდა") =>
    NextResponse.json({error}, {status});
  try {
    const auth = req.headers.get("authorization") || "";
    if (!auth.startsWith("Bearer ")) return failure(401, "სესია დასრულებულია. თავიდან შედით სისტემაში.");
    const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: {headers: {Authorization: auth}}, auth: {persistSession: false, autoRefreshToken: false},
    });
    const {data: {user}, error: authError} = await c.auth.getUser(auth.slice(7));
    if (authError || !user) return failure(401);
    const {data: profile, error: roleError} = await c.from("profiles").select("role,active").eq("id", user.id).single();
    if (roleError || profile?.active !== true || !canEditOrders(profile.role)) return failure(403);

    let input;
    try { input = await req.json(); } catch { return failure(400); }
    const {to_city_id, weight} = input || {};
    if (!Number.isSafeInteger(to_city_id) || to_city_id <= 0 || typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0) {
      return failure(400, "აირჩიეთ OnWay-ის ქალაქი და მიუთითეთ პროდუქტების სწორი წონა.");
    }
    const secret = process.env.NEXO_PROXY_SECRET;
    if (!secret) return failure(503);
    const regionsResponse = await fetch("https://onway.ge/index.php?route=api/order/regions", {
      next: {revalidate: 3600}, signal: AbortSignal.timeout(10000),
    });
    if (!regionsResponse.ok) return failure(502);
    const regions = await regionsResponse.json();
    const zones: {zone_id: string | number; name: string}[] = Array.isArray(regions?.zones) ? regions.zones : [];
    const origin = zones.find(zone => typeof zone.name === "string" && zone.name.trim() === "თბილისი");
    if (!origin || Number(origin.zone_id) !== 1 || !zones.some(zone => Number(zone.zone_id) === to_city_id)) {
      return failure(400, "ქალაქის OnWay-ის რეგიონთან შესაბამისობა ვერ დადასტურდა.");
    }

    // Verified price-only proxy contract. The proxy enforces package quantity=1.
    // Never forward caller-supplied origin, quantity, URLs or additional fields.
    const response = await fetch("https://onway-api.nexo.ge/onway/price", {
      method: "POST", headers: {"Content-Type": "application/json", Authorization: `Bearer ${secret}`},
      body: JSON.stringify({from_city_id: 1, to_city_id, weight}),
      cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return failure(502);
    const data = await response.json();
    const price = parseDeliveryFee(data?.shipping_amount);
    if (data?.error || price === null) return failure(502);
    // Return only the verified fee, never raw upstream responses or credentials.
    return NextResponse.json({shipping_amount: price});
  } catch { return failure(502); }
}
