"use client";
import {useEffect, useState} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase-browser";

type EventRow = {id: number; received_at: string; tracking: string; status_name: string | null; status_id: string | null; delivered: boolean; result: string | null; order_number: string | null};
type OrderInfo = {orderNumber: string | null; total: number | null; payment: string | null};
const payLabel = (p: string | null | undefined) => (p === "cod" ? "COD" : p === "prepaid" ? "წინასწარ" : "");
const money = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(2) + " ₾");
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
// Inclusive calendar days in Tbilisi time -> [start, end) in UTC.
function rangeBounds(from: string, to: string) {
  const [y, m, d] = to.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return {start: new Date(`${from}T00:00:00+04:00`).toISOString(), end: new Date(`${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}T00:00:00+04:00`).toISOString()};
}
const monthStart = (month: string) => `${month}-01`;
function monthEnd(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
}
const today = () => new Intl.DateTimeFormat("en-CA", {timeZone: tz}).format(new Date());
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
  const [dateFrom, setDateFrom] = useState(monthStart(currentMonth()));
  const [dateTo, setDateTo] = useState(today());
  const [showAll, setShowAll] = useState(false);
  const [rows, setRows] = useState<EventRow[]>([]);
  const [counts, setCounts] = useState<{month: string; count: number | null}[]>([]);
  const [info, setInfo] = useState<Record<string, OrderInfo>>({});
  const [warning, setWarning] = useState("");
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
    if (!authorized || !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) return;
    if (dateFrom > dateTo) { setError("საწყისი თარიღი ბოლო თარიღზე გვიანია."); setRows([]); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true); setError(""); setWarning("");
      try {
        const c = createClient(), {start, end} = rangeBounds(dateFrom, dateTo), all: EventRow[] = [];
        for (let from = 0; from < 20 * PAGE; from += PAGE) {
          let q = c.from("onway_webhook_events").select("*").gte("received_at", start).lt("received_at", end).order("received_at", {ascending: false}).order("id", {ascending: false}).range(from, from + PAGE - 1);
          if (!showAll) q = q.eq("result", "updated");
          const {data, error: e} = await q;
          if (e) throw e;
          all.push(...((data || []) as EventRow[]));
          if (!data || data.length < PAGE) break;
        }
        // Order amounts come from the orders themselves (matched by tracking code).
        const infoMap: Record<string, OrderInfo> = {};
        let lookupFailed = false;
        const trackings = Array.from(new Set(all.map(r => r.tracking)));
        for (let i = 0; i < trackings.length; i += 100) {
          const {data: od, error: oe} = await c.from("orders").select("tracking_code,order_number,total,payment_type").in("tracking_code", trackings.slice(i, i + 100));
          if (oe) { lookupFailed = true; break; }
          for (const o of od || []) infoMap[String(o.tracking_code).trim()] = {orderNumber: o.order_number != null ? String(o.order_number) : null, total: o.total != null ? Number(o.total) : null, payment: o.payment_type ?? null};
        }
        const monthly = await Promise.all(lastMonths(6).map(async m => {
          const b = bounds(m);
          const {count, error: e} = await c.from("onway_webhook_events").select("id", {count: "exact", head: true}).eq("result", "updated").gte("received_at", b.start).lt("received_at", b.end);
          return {month: m, count: e ? null : count};
        }));
        if (!cancelled) { setRows(all); setCounts(monthly); setInfo(infoMap); if (lookupFailed) setWarning("შეკვეთების თანხები ვერ ჩაიტვირთა."); }
      } catch (e: any) {
        if (!cancelled) setError("მონაცემები ვერ ჩაიტვირთა: " + (e?.message || "უცნობი შეცდომა") + ". შეამოწმე, გაშვებულია თუ არა ცხრილის შექმნის SQL.");
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [authorized, dateFrom, dateTo, showAll]);

  if (!authorized) return <div className="panel">იტვირთება...</div>;
  const fmt = (iso: string) => new Date(iso).toLocaleString("ka-GE", {timeZone: tz, dateStyle: "short", timeStyle: "short"});
  const delivered = rows.filter(r => r.result === "updated").length;
  const seen = new Set<string>();
  let sum = 0;
  for (const r of rows) if (r.result === "updated" && !seen.has(r.tracking)) { seen.add(r.tracking); sum += info[r.tracking]?.total ?? 0; }
  async function exportExcel() {
    try {
      const XLSX = await import("xlsx");
      const header = ["დრო", "თრექინგი", "შეკვეთა №", "თანხა (₾)", "გადახდა", ...(showAll ? ["სტატუსი OnWay-ში", "სტატუსის ID"] : []), "შედეგი"];
      const body = rows.map(r => { const o = info[r.tracking]; return [fmt(r.received_at), r.tracking, o?.orderNumber || r.order_number || "", o?.total ?? "", payLabel(o?.payment), ...(showAll ? [r.status_name || "", r.status_id || ""] : []), label(r.result)]; });
      const sheet = XLSX.utils.aoa_to_sheet([header, ...body, [], ["", "", "ჯამი", sum]]);
      for (let r = 1; r <= body.length + 3; r++) { const cell = sheet[XLSX.utils.encode_cell({r, c: 3})]; if (cell && cell.t === "n") cell.z = "0.00"; }
      sheet["!cols"] = [{wch: 18}, {wch: 14}, {wch: 14}, {wch: 12}, {wch: 12}, ...(showAll ? [{wch: 24}, {wch: 12}] : []), {wch: 30}];
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "OnWay ჩაბარებები");
      XLSX.writeFile(book, `onway-chabarebebi_${dateFrom}_${dateTo}.xlsx`);
    } catch { setError("Excel ფაილის შექმნა ვერ მოხერხდა."); }
  }
  return <>
    <div className="top"><div><div className="title">OnWay ჩაბარებები</div><div className="muted">რომელ შეკვეთებს გადაეცა „ჩაბარებული“ სტატუსი OnWay-დან, თვეების მიხედვით</div></div></div>
    {error && <div className="error">{error}</div>}
    {warning && <div className="warning-box">{warning}</div>}
    <div className="panel">
      <div className="formline">
        <div className="field"><label>თარიღიდან</label><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
        <div className="field"><label>თარიღამდე</label><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
        <label style={{display: "flex", gap: 8, alignItems: "center"}}><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> აჩვენე OnWay-ის ყველა შეტყობინება</label>
      </div>
      <p>არჩეულ პერიოდში ჩაბარებულზე გადავიდა: <b>{loading ? "…" : delivered}</b> შეკვეთა · ჯამური თანხა: <b>{loading ? "…" : money(sum)}</b></p>
      <div className="formline"><button className="btn" disabled={loading || !rows.length} onClick={() => void exportExcel()}>Excel-ში ჩამოტვირთვა</button></div>
      <p className="muted">ბოლო 6 თვე: {counts.map(c => <button key={c.month} className="btn secondary" style={{marginRight: 6}} onClick={() => {setDateFrom(monthStart(c.month)); setDateTo(monthEnd(c.month));}}>{c.month}: {c.count ?? "?"}</button>)}</p>
    </div>
    <div className="panel">
      <table className="table">
        <thead><tr><th>დრო</th><th>თრექინგი</th><th>შეკვეთა №</th><th>თანხა</th><th>გადახდა</th>{showAll && <th>სტატუსი OnWay-ში</th>}<th>შედეგი</th></tr></thead>
        <tbody>
          {rows.map(r => <tr key={r.id}><td>{fmt(r.received_at)}</td><td>{r.tracking}</td><td>{info[r.tracking]?.orderNumber || r.order_number || "—"}</td><td>{money(info[r.tracking]?.total)}</td><td>{payLabel(info[r.tracking]?.payment) || "—"}</td>{showAll && <td>{r.status_name || "—"}{r.status_id ? ` (${r.status_id})` : ""}</td>}<td>{label(r.result)}</td></tr>)}
          {!loading && !rows.length && <tr><td colSpan={showAll ? 7 : 6}>ამ პერიოდში ჩანაწერი არ არის. ჩანაწერები იწყება იმ მომენტიდან, როცა ჩართულია ეს ფუნქცია.</td></tr>}
        </tbody>
      </table>
    </div>
  </>;
}
