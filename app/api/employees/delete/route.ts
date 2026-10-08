import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Admin-only. "Deleting" an employee removes their ability to log in, but keeps
// the profile row so orders / history / reports still show who did what.
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") || "";
    if (!auth.startsWith("Bearer ")) {
      return NextResponse.json({ error: "ავტორიზაცია ვერ დადასტურდა." }, { status: 401 });
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return NextResponse.json({ error: "სერვერზე SUPABASE_SERVICE_ROLE_KEY არ არის დაყენებული." }, { status: 500 });
    }

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: ue } = await userClient.auth.getUser(auth.slice(7));
    if (ue || !user) {
      return NextResponse.json({ error: "სესია დასრულებულია." }, { status: 401 });
    }
    const { data: me } = await userClient.from("profiles").select("role,active").eq("id", user.id).single();
    if (!me || me.role !== "admin" || me.active !== true) {
      return NextResponse.json({ error: "წაშლის უფლება მხოლოდ Admin-ს აქვს." }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const id = typeof body?.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "თანამშრომელი არ არის მითითებული." }, { status: 400 });
    if (id === user.id) {
      return NextResponse.json({ error: "საკუთარი თავის წაშლა შეუძლებელია." }, { status: 400 });
    }

    const svc = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: target, error: te } = await svc
      .from("profiles").select("id,role,active,deleted_at").eq("id", id).maybeSingle();
    if (te) {
      return NextResponse.json({ error: "პროფილი ვერ ჩაიტვირთა: " + te.message }, { status: 500 });
    }
    if (!target) return NextResponse.json({ error: "თანამშრომელი ვერ მოიძებნა." }, { status: 404 });
    if (target.deleted_at) return NextResponse.json({ ok: true, alreadyDeleted: true });

    if (target.role === "admin" && target.active === true) {
      const { count } = await svc.from("profiles").select("id", { count: "exact", head: true })
        .eq("role", "admin").eq("active", true).is("deleted_at", null);
      if ((count ?? 0) <= 1) {
        return NextResponse.json({ error: "ბოლო აქტიური Admin-ის წაშლა შეუძლებელია." }, { status: 400 });
      }
    }

    const { count: orders } = await svc.from("orders").select("id", { count: "exact", head: true }).eq("created_by", id);

    // 1) revoke database access immediately, 2) remove the login.
    const { error: pe } = await svc.from("profiles")
      .update({ active: false, deleted_at: new Date().toISOString() }).eq("id", id);
    if (pe) {
      return NextResponse.json({
        error: "პროფილი ვერ განახლდა (სავარაუდოდ SQL მიგრაცია არ არის გაშვებული): " + pe.message,
      }, { status: 500 });
    }
    const { error: ae } = await svc.auth.admin.updateUserById(id, {
      ban_duration: "876000h",
      email: `deleted-${id}@deleted.invalid`,
      email_confirm: true,
    });
    if (ae) {
      return NextResponse.json({ error: "პროფილი გამორთულია, მაგრამ ლოგინი ვერ წაიშალა: " + ae.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, orders: orders ?? 0 });
  } catch {
    return NextResponse.json({ error: "სერვერის შეცდომა." }, { status: 500 });
  }
}
