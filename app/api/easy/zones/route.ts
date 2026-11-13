import {NextResponse} from "next/server";

// Easy delivery zones/districts, flattened to one searchable list.
// id = district id (unique). Name = "რაიონი (ზონა)". price = district price, else zone price.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const headers: Record<string, string> = {};
    if (process.env.EASY_API_KEY) headers["x-api-key"] = process.env.EASY_API_KEY;
    const r = await fetch("https://easy.online.ge/api/v1/logistic/zones", {method: "GET", headers, cache: "no-store"});
    const text = await r.text();
    if (!r.ok) return NextResponse.json({error: `Easy zones HTTP ${r.status}`}, {status: 502});
    let data: any;
    try { data = JSON.parse(text); } catch { return NextResponse.json({error: "Easy-ს ზონების პასუხი JSON არ არის."}, {status: 502}); }
    const zones = Array.isArray(data) ? data : [];
    const regions: {id: number; name: string; price: number | null}[] = [];
    for (const z of zones) {
      const zoneName = String(z?.name || "").trim();
      const zonePrice = Number(z?.delivery_price);
      for (const d of Array.isArray(z?.districts) ? z.districts : []) {
        if (d?.active === false) continue;
        const id = Number(d?.id);
        const dn = String(d?.name || "").trim();
        if (!Number.isFinite(id) || !dn) continue;
        const dp = Number(d?.delivery_price);
        regions.push({id, name: `${dn} (${zoneName})`, price: Number.isFinite(dp) ? dp : Number.isFinite(zonePrice) ? zonePrice : null});
      }
    }
    regions.sort((a, b) => a.name.localeCompare(b.name, "ka"));
    if (!regions.length) return NextResponse.json({error: "Easy-დან ზონების სია ცარიელი დაბრუნდა."}, {status: 502});
    return NextResponse.json({regions});
  } catch (e: any) {
    return NextResponse.json({error: e?.message || "Easy-ს ზონების სია ვერ ჩაიტვირთა."}, {status: 500});
  }
}
