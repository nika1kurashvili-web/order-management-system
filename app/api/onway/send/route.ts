
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

function findTracking(v: any): string | null {
  if (!v) return null;

  if (typeof v === "string") {
    const m = v.match(
      /(?:tracking|barcode)[^A-Za-z0-9]*([A-Za-z0-9-]{5,})/i
    );
    return m?.[1] || null;
  }

  if (Array.isArray(v)) {
    for (const x of v) {
      const r = findTracking(x);
      if (r) return r;
    }
    return null;
  }

  if (typeof v === "object") {
    for (const k of [
      "tracking",
      "tracking_number",
      "trackingNumber",
      "barcode",
    ]) {
      if (v[k]) return String(v[k]);
    }

    for (const x of Object.values(v)) {
      const r = findTracking(x);
      if (r) return r;
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") || "";

    if (!auth.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "ავტორიზაცია ვერ დადასტურდა." },
        { status: 401 }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const c = createClient(url, anon, {
      global: {
        headers: {
          Authorization: auth,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: ue,
    } = await c.auth.getUser(auth.slice(7));

    if (ue || !user) {
      return NextResponse.json(
        { error: "სესია დასრულებულია." },
        { status: 401 }
      );
    }

    const { orderId } = await req.json();

    const { data: o, error: oe } = await c
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (oe || !o) {
      return NextResponse.json(
        {
          error:
            "შეკვეთაზე წვდომა არ გაქვს ან შეკვეთა ვერ მოიძებნა.",
        },
        { status: 403 }
      );
    }

    if (o.tracking_code) {
      return NextResponse.json(
        {
          error:
            "ამ შეკვეთას უკვე აქვს Tracking კოდი და ხელახლა არ გაიგზავნა.",
        },
        { status: 409 }
      );
    }

    const { data: creator } = await c
      .from("profiles")
      .select("full_name,phone")
      .eq("id", o.created_by)
      .single();

    if (!creator?.phone) {
      return NextResponse.json(
        {
          error:
            "შეკვეთის გამფორმებელი ოპერატორის ტელეფონის ნომერი არ არის მითითებული Employees გვერდზე.",
        },
        { status: 400 }
      );
    }

    if (!creator?.full_name?.trim()) {
      return NextResponse.json(
        {
          error:
            "შეკვეთის გამფორმებელი ოპერატორის სახელი არ არის მითითებული Employees გვერდზე.",
        },
        { status: 400 }
      );
    }

    const { data: items, error: ie } = await c
      .from("order_items")
      .select(
        "product_name,variant_name,quantity,weight_kg"
      )
      .eq("order_id", orderId);

    if (ie || !items?.length) {
      return NextResponse.json(
        { error: "შეკვეთაში პროდუქტები ვერ მოიძებნა." },
        { status: 400 }
      );
    }

    if (
      !o.customer_city_id ||
      !o.customer_city ||
      !o.customer_name ||
      !o.customer_phone ||
      !o.customer_address
    ) {
      return NextResponse.json(
        {
          error:
            "მომხმარებლის ქალაქი/რეგიონი, სახელი, ტელეფონი და მისამართი სავალდებულოა.",
        },
        { status: 400 }
      );
    }

    const weight = items.reduce(
      (s: number, i: any) =>
        s +
        Number(i.weight_kg || 1) *
          Number(i.quantity || 1),
      0
    );

    const quantity = items.reduce(
      (s: number, i: any) =>
        s + Number(i.quantity || 1),
      0
    );

    const username =
      process.env.ONWAY_API_USERNAME;

    const key =
      process.env.ONWAY_API_KEY;

    if (!username || !key) {
      return NextResponse.json(
        {
          error:
            "Vercel-ში ONWAY_API_USERNAME ან ONWAY_API_KEY არ არის დამატებული.",
        },
        { status: 500 }
      );
    }

    const payment = Number(
      process.env.ONWAY_PAYMENT || 3
    );

    const payer = Number(
      process.env.ONWAY_PAYER || 3
    );

    const detail = items
      .map(
        (i: any) =>
          `${i.product_name}${
            i.variant_name
              ? ` — ${i.variant_name}`
              : ""
          } x${i.quantity}`
      )
      .join(", ");

    const payload = {
      username,
      key,

      from_city:
        process.env.ONWAY_FROM_CITY ||
        "თბილისი",

      from_name:
        process.env.ONWAY_FROM_NAME ||
        "Nexo.Ge",

      from_phone: String(creator.phone),

      from_address:
        process.env.ONWAY_FROM_ADDRESS ||
        "ბერი გაბრიელ სალოსის 17",

      from_company:
        process.env.ONWAY_FROM_COMPANY ||
        "Nexo.Ge",

      to_city_id: Number(
        o.customer_city_id
      ),

      to_name: o.customer_name,
      to_phone: o.customer_phone,
      to_address: o.customer_address,

      services: [],

      payment,
      payer,

      spo: 0,

      order_price:
        o.payment_type === "cod"
          ? Number(o.total || 0)
          : 0,

      weight: Math.max(0.01, weight),

      quantity: Math.max(1, quantity),

      service_level: 1,

      order_number: String(
        order_number: `NEXO-${o.order_number}`,

      order_detail: [
        detail,
        o.customer_comment,
      ]
        .filter(Boolean)
        .join(" | ")
        .concat(
          ` (${creator.full_name.trim()})`
        )
        .slice(0, 500),

      brittle: 0,

      receiver_shipprice_pay: 0,

      additional_information: "",
    };

    const proxySecret =
      process.env.NEXO_PROXY_SECRET;
console.log(
  "NEXO_PROXY_SECRET SHA:",
  createHash("sha256")
    .update(proxySecret || "")
    .digest("hex")
);
console.log(
  "NEXO_PROXY_SECRET length:",
  proxySecret?.length || 0
);

    if (!proxySecret) {
      return NextResponse.json(
        {
          error:
            "NEXO_PROXY_SECRET არ არის დამატებული.",
        },
        { status: 500 }
      );
    }

    /*
     * IMPORTANT:
     * OnWay request goes through our
     * DigitalOcean static-IP proxy.
     */
    const r = await fetch(
      "https://onway-api.nexo.ge/onway/send",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${proxySecret}`,
        },

        body: JSON.stringify(payload),

        cache: "no-store",
      }
    );

    const text = await r.text();

    let data: any = text;

    try {
      data = JSON.parse(text);
    } catch {
      // Keep original text response.
    }

    if (!r.ok) {
      return NextResponse.json(
        {
          error:
            "OnWay API-მ დააბრუნა შეცდომა.",
          details: data,
        },
        { status: 502 }
      );
    }

    const low =
      typeof data === "string"
        ? data.toLowerCase()
        : JSON.stringify(
            data
          ).toLowerCase();

    if (
      low.includes("error") ||
      low.includes("შეცდომ")
    ) {
      return NextResponse.json(
        {
          error:
            "OnWay-მ შეკვეთა არ მიიღო.",
          details: data,
        },
        { status: 502 }
      );
    }

    const tracking =
      findTracking(data);

    if (!tracking) {
      return NextResponse.json(
        {
          error:
            "OnWay-მ პასუხი დააბრუნა, მაგრამ Tracking კოდი ვერ ამოვიკითხეთ. ხელახლა ნუ გააგზავნი — მოგვაწოდე OnWay-ის პასუხი.",
          details: data,
        },
        { status: 502 }
      );
    }

    const { error: up } = await c
      .from("orders")
      .update({
        tracking_code: tracking,
        status: "shipping",
      })
      .eq("id", orderId);

    if (up) {
      return NextResponse.json(
        {
          error:
            "OnWay-ში გაიგზავნა, მაგრამ Tracking/სტატუსი Nexo-ში ვერ შეინახა: " +
            up.message,
          tracking,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      tracking,
    });
  } catch (e: any) {
    console.error(
      "OnWay send route error:",
      e
    );

    return NextResponse.json(
      {
        error:
          e?.message ||
          "OnWay-ში გაგზავნა ვერ მოხერხდა.",
      },
      { status: 500 }
    );
  }
}