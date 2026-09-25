"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

export default function DeleteOrder({ id, orderNumber, trackingCode, role }: {
  id: string; orderNumber: number; trackingCode: string | null; role: string;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    if (role !== "admin" || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const c = createClient();
      const { data: { user }, error: authError } = await c.auth.getUser();
      if (authError || !user) throw new Error("სესია დასრულებულია. თავიდან შედით სისტემაში.");
      const { data: profile, error: roleError } = await c.from("profiles")
        .select("role,active").eq("id", user.id).single();
      if (roleError || profile?.role !== "admin" || profile.active !== true) {
        throw new Error("შეკვეთის წაშლის უფლება მხოლოდ აქტიურ Admin-ს აქვს.");
      }
      // The verified order FKs cascade to items/history/activity. No courier call.
      const { data, error: deleteError } = await c.from("orders")
        .delete().eq("id", id).select("id").single();
      if (deleteError) {
        throw new Error(deleteError.code === "23503"
          ? "შეკვეთის წაშლას დაკავშირებული ჩანაწერი ზღუდავს. მიმართეთ ადმინისტრატორს."
          : `შეკვეთის წაშლა ვერ მოხერხდა: ${deleteError.message}`);
      }
      if (!data) throw new Error("წაშლა ვერ დადასტურდა. განაახლეთ გვერდი და შეამოწმეთ წვდომა.");
      const message = `შეკვეთა #${orderNumber} სამუდამოდ წაიშალა.`;
      try { sessionStorage.setItem("nexo-deleted-order", message); }
      catch { alert(message); }
      dialog.current?.close();
      router.replace("/dashboard");
      router.refresh();
      // Keep the lock until navigation unmounts the component.
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "შეკვეთის წაშლა ვერ მოხერხდა. სცადეთ ხელახლა.");
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (role !== "admin") return null;
  return <div className="panel danger-zone">
    <h3>Admin მოქმედება</h3>
    <button type="button" className="btn danger" disabled={busy}
      onClick={() => { setError(""); dialog.current?.showModal(); }}>წაშლა</button>
    <dialog ref={dialog} onCancel={e => { if (inFlight.current) e.preventDefault(); }}
      style={{ maxWidth: 520, width: "calc(100% - 32px)", border: 0, borderRadius: 12, padding: 24 }}
      aria-labelledby="delete-order-title">
      <h3 id="delete-order-title">შეკვეთის სამუდამოდ წაშლა</h3>
      <p>ნამდვილად გსურთ შეკვეთის #{orderNumber} სამუდამოდ წაშლა? წაიშლება შეკვეთა და მასთან დაკავშირებული მონაცემები. ეს მოქმედება ვერ გაუქმდება.</p>
      {trackingCode && <p>ამ შეკვეთას აქვს Tracking კოდი. Nexo-დან წაშლა OnWay-ში შეკვეთას არ გააუქმებს.</p>}
      {error && <p role="alert" className="error-box">{error}</p>}
      <div className="row" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button type="button" className="btn secondary" disabled={busy} onClick={() => dialog.current?.close()}>გაუქმება</button>
        <button type="button" className="btn danger" disabled={busy} onClick={remove}>{busy ? "იშლება..." : "წაშლა"}</button>
      </div>
    </dialog>
  </div>;
}
