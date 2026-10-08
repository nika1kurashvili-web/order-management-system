"use client";
import {useEffect, useState} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase-browser";

type EventRow = {id: number; received_at: string; tracking: string; status_name: string | null; status_id: string | null; delivered: boolean; result: string | null; order_number: string | null};
const tz = "Asia/Tbilisi";
const PAGE = 1000;
const pad = (n: number) => String(n).padStart(2, "0");
const currentMonth = () => new Intl.DateTimeFormat("en-CA", {timeZone: tz, year: "numeric", month: "2-digit"}).format(new Date()).slice(0, 7);
// Tbilisi has no daylight saving: always UTC+04:00.
function bounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  return {start: new Date(`${y}-${pad(m)}-01T00:00:00+04:00`).toISOString(), end: new Date(`${ny}-${pad(nm)}-01T00:00:00+04:00`).toISOString()};
}
function lastMonths(count: number) {
  const [y, m] = currentMonth().split("-").map(Number);
  return Array.from({length: count}, (_, i) => { const d = new Date(Date.UTC(y, m - 1 - i, 1)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; });
}
const resultLabel: Record<string, string> = {
  updated: "ჩაბარებულზე გადავიდა", already_delivered: "უკვე ჩაბარებული იყო", not_found: "შეკვეთა ვერ მოიძებნა",
  ambiguous: "რამდენიმე შეკვეთა ერთი თრექინგით", ignored: "სხვა სტატუსი (არ შეცვლილა)", error: "შეცდომა",
};
const label = (result: string | null) => (result && (resultLabel[result] || (result.startsWith("skipped_") ? "შეკვეთა გზაში არ იყო: " + result.slice(8) : result))) || "—";

export default function OnwayStatus() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [month, setMonth] = useState(currentMonth());
  const [showAll, setShowAll] = useState(false);
  const [rows, setRows] = useState<EventRow[]>([]);
  const [counts, setCounts] = useState<{month: string; count: number | null}[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const c = createClient();
      const {data: u} = await c.auth.getUser();
      if (!u.user) { router.replace("/login"); return; }
      const {data: p} = await c.from("profiles").select("role,active").eq("id", u.user.id).single();
      if (p?.active !== true || !["admin", "manager"].includes(p?.role || "")) { router.replace("/dashboard"); return; }
      setAuthorized(true);
    })();
  }, [router]);

  useEffect(() => {
    if (!authorized || !/^\d{4}-\d{2}$/.test(month)) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setError("");
      try {
        const c = createClient(), {start, end} = bounds(month), all: EventRow[] = [];
        for (let from = 0; from < 20 * PAGE; from += PAGE) {
          let q = c.from("onway_webhook_events").select("*").gte("received_at", start).lt("received_at", end).order("received_at", {ascending: false}).order("id", {ascending: false}).range(from, from + PAGE - 1);
          if (!showAll) q = q.eq("result", "updated");
          const {data, error: e} = await q;
          if (e) throw e;
          all.push(...((data || []) as EventRow[]));
          if (!data || data.length < PAGE) break;
        }
        const monthly = await Promise.all(lastMonths(6).map(async m => {
          const b = bounds(m);
          const {count, error: e} = await c.from("onway_webhook_events").select("id", {count: "exact", head: true}).eq("result", "updated").gte("received_at", b.start).lt("received_at", b.end);
          return {month: m, count: e ? null : count};
        }));
        if (!cancelled) { setRows(all); setCounts(monthly); }
      } catch (e: any) {
        if (!cancelled) setError("მონაცემები ვერ ჩაიტვირთა: " + (e?.message || "უცნობი შეცდომა") + ". შეამოწმე, გაშვებულია თუ არა ცხრილის შექმნის SQL.");
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [authorized, month, showAll]);

  if (!authorized) return <div className="panel">იტვირთება...</div>;
  const fmt = (iso: string) => new Date(iso).toLocaleString("ka-GE", {timeZone: tz, dateStyle: "short", timeStyle: "short"});
  const delivered = rows.filter(r => r.result === "updated").length;
  return <>
    <div className="top"><div><div className="title">OnWay ჩაბარებები</div><div className="muted">რომელ შეკვეთებს გადაეცა „ჩაბარებული“ სტატუსი OnWay-დან, თვეების მიხედვით</div></div></div>
    {error && <div className="error">{error}</div>}
    <div className="panel">
      <div className="formline">
        <div className="field"><label>თვე</label><input type="month" value={month} onChange={e => setMonth(e.target.value)} /></div>
        <label style={{display: "flex", gap: 8, alignItems: "center"}}><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> აჩვენე OnWay-ის ყველა შეტყობინება</label>
      </div>
      <p>ამ თვეში ჩაბარებულზე გადავიდა: <b>{loading ? "…" : showAll ? delivered : rows.length}</b> შეკვეთა</p>
      <p className="muted">ბოლო 6 თვე: {counts.map(c => <button key={c.month} className="btn secondary" style={{marginRight: 6}} onClick={() => setMonth(c.month)}>{c.month}: {c.count ?? "?"}</button>)}</p>
    </div>
    <div className="panel">
      <table className="table">
        <thead><tr><th>დრო</th><th>თრექინგი</th><th>შეკვეთა №</th>{showAll && <th>სტატუსი OnWay-ში</th>}<th>შედეგი</th></tr></thead>
        <tbody>
          {rows.map(r => <tr key={r.id}><td>{fmt(r.received_at)}</td><td>{r.tracking}</td><td>{r.order_number || "—"}</td>{showAll && <td>{r.status_name || "—"}{r.status_id ? ` (${r.status_id})` : ""}</td>}<td>{label(r.result)}</td></tr>)}
          {!loading && !rows.length && <tr><td colSpan={showAll ? 5 : 4}>ამ თვეში ჩანაწერი არ არის. ჩანაწერები იწყება იმ მომენტიდან, როცა ჩართულია ეს ფუნქცია.</td></tr>}
        </tbody>
      </table>
    </div>
  </>;
}
