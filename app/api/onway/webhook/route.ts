import {NextRequest, NextResponse} from "next/server";
import {timingSafeEqual} from "crypto";

// Receives status pushes from OnWay (POST, JSON). FIRST VERSION: it only checks the
// secret and logs the payload so the real field names can be confirmed. It does NOT
// change any order yet.
export const dynamic = "force-dynamic";

function sameSecret(given: string, expected: string) {
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Health check: some providers open the URL first to verify it is alive.
export async function GET() {
  return NextResponse.json({ok: true});
}

export async function POST(req: NextRequest) {
  const expected = process.env.ONWAY_WEBHOOK_SECRET;
  if (!expected) return NextResponse.json({error: "not configured"}, {status: 503});

  // The secret may arrive as ?key=... in the URL or as the x-webhook-secret / Bearer header.
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const given = req.nextUrl.searchParams.get("key") || req.headers.get("x-webhook-secret") || bearer;
  if (!given || !sameSecret(given, expected)) return NextResponse.json({error: "unauthorized"}, {status: 401});

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({error: "invalid json"}, {status: 400}); }

  // Temporary: visible in Vercel → Logs, to learn the exact payload format.
  console.log("[onway-webhook]", JSON.stringify(body).slice(0, 4000));
  return NextResponse.json({ok: true});
}
