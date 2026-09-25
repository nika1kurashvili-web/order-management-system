"use client";

import {useEffect, useRef, useState} from "react";
import {createClient} from "@/lib/supabase-browser";
import {parsePurchasePrice} from "@/lib/purchase-prices";

export default function PurchasePriceField({id, kind, value, onSaved}: {
  id: string; kind: "product" | "variant"; value: number | null; onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  useEffect(() => { setDraft(value == null ? "" : String(value)); }, [value]);
  async function save() {
    if (running.current) return;
    running.current = true; setBusy(true); setMessage("");
    try {
      const price = parsePurchasePrice(draft);
      const c = createClient();
      const {data: {user}} = await c.auth.getUser();
      if (!user) throw new Error("სესია დასრულებულია.");
      const {data: profile, error} = await c.from("profiles").select("role,active").eq("id", user.id).single();
      if (error || profile?.role !== "admin" || profile.active !== true) throw new Error("შესყიდვის ფასის შეცვლა მხოლოდ Admin-ს შეუძლია.");
      const column = kind === "product" ? "product_id" : "variant_id";
      const {error: saveError} = await c.from("product_purchase_prices")
        .upsert({[column]: id, purchase_price: price}, {onConflict: column}).select(column).single();
      if (saveError) throw new Error("შესყიდვის ფასი ვერ შეინახა: " + saveError.message);
      setMessage("შენახულია.");
      await onSaved();
    } catch (e) { setMessage(e instanceof Error ? e.message : "შესყიდვის ფასი ვერ შეინახა."); }
    finally { running.current = false; setBusy(false); }
  }
  return <div style={{maxWidth: 220}}>
    <label>შესყიდვის ფასი (₾)
      <input className="mini-input" type="number" min="0" step="0.01" placeholder="არ არის მითითებული"
        disabled={busy} value={draft} onChange={e => setDraft(e.target.value)} />
    </label>
    <button type="button" className="btn secondary" disabled={busy} onClick={save}>{busy ? "ინახება..." : "შენახვა"}</button>
    {message && <small role="status">{message}</small>}
  </div>;
}
