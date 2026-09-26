"use client";

import { useRef, useState } from "react";
import { compare, headers, readSource, reportWorkbook, statuses, type Source } from "@/lib/excel-comparison";

type Upload = { name: string; source: Source; code: string; price: string };
export default function ExcelPriceFillPage() {
  const [files, setFiles] = useState<(Upload | null)[]>([null, null]);
  const [loading, setLoading] = useState([false, false]);
  const [errors, setErrors] = useState(["", ""]);
  const [result, setResult] = useState<ReturnType<typeof compare> | null>(null);
  const [error, setError] = useState("");
  const [showEqual, setShowEqual] = useState(false);
  const [page, setPage] = useState(0);
  const versions = useRef([0, 0]);
  const replace = <T,>(values: T[], index: number, value: T) => values.map((v, i) => i === index ? value : v);
  function reset() { setResult(null); setError(""); setPage(0); }
  async function upload(index: number, file?: File) {
    if (!file) return;
    const version = ++versions.current[index];
    reset();
    setFiles(v => replace(v, index, null));
    setErrors(v => replace(v, index, ""));
    setLoading(v => replace(v, index, true));
    try {
      if (!/\.xlsx$/i.test(file.name)) throw new Error("აირჩიეთ .xlsx ფაილი.");
      if (file.size > 20 * 1024 * 1024) throw new Error("ფაილის მაქსიმალური ზომაა 20 MB.");
      const source = readSource(await file.arrayBuffer());
      if (versions.current[index] === version) setFiles(v => replace(v, index, { name: file.name, source, code: "", price: "" }));
    } catch (e) {
      if (versions.current[index] === version) setErrors(v => replace(v, index, e instanceof Error ? e.message : "ფაილის წაკითხვა ვერ მოხერხდა."));
    } finally {
      if (versions.current[index] === version) setLoading(v => replace(v, index, false));
    }
  }
  function select(index: number, field: "code" | "price", value: string) {
    reset(); setFiles(v => v.map((file, i) => i === index && file ? { ...file, [field]: value } : file));
  }
  function run() {
    reset();
    try {
      const [a, b] = files;
      if (a && b) setResult(compare(a.source, Number(a.code), Number(a.price), b.source, Number(b.code), Number(b.price)));
    } catch (e) { setError(e instanceof Error ? e.message : "შედარება ვერ მოხერხდა."); }
  }
  async function download() {
    if (!result) return;
    try {
      const XLSX = await import("xlsx");
      XLSX.writeFile(reportWorkbook(result.rows), "price_comparison_report.xlsx");
    } catch { setError("რეპორტის ჩამოტვირთვა ვერ მოხერხდა."); }
  }
  const visible = result?.rows.filter(r => showEqual || r.status !== statuses.equal) || [];
  const format = (n: number | null, signed = false, percent = false) => n === null ? "—" : `${signed && n > 0 ? "+" : ""}${n.toLocaleString("ka-GE", { maximumFractionDigits: 6 })}${percent ? "%" : ""}`;
  return <div>
    <div className="simple-head"><div><h1>Extra</h1><p>შეადარე ორი Excel ფაილი პროდუქტის კოდით და ფასით.</p></div></div>
    <p className="muted">ფაილები მუშავდება მხოლოდ თქვენს ბრაუზერში. ორიგინალი ფაილები არ იცვლება. გამოიყენება პირველი ფურცელი, რომლის პირველი შევსებული სტრიქონი უნდა შეიცავდეს სათაურებს.</p>
    <div className="grid2">{files.map((file, index) => <section className="panel" key={index}>
      <h2>ფაილი {index + 1}</h2>
      <label className="field">Excel ფაილი (.xlsx, მაქს. 20 MB)<input type="file" accept=".xlsx" onChange={e => { void upload(index, e.target.files?.[0]); e.target.value = ""; }} /></label>
      {loading[index] && <p role="status">იკითხება...</p>}
      {errors[index] && <p className="error" role="alert">{errors[index]}</p>}
      {file && <><p style={{ overflowWrap: "anywhere" }}>{file.name}<br /><span className="muted">ფურცელი: {file.source.sheetName}</span></p>
        {([['code', 'კოდის სვეტი'], ['price', 'ფასის სვეტი']] as const).map(([field, label]) => <label className="field" key={field}>{label}<select value={file[field]} onChange={e => select(index, field, e.target.value)}><option value="">აირჩიეთ სვეტი</option>{file.source.columns.map(c => <option key={c.index} value={c.index}>{c.label}</option>)}</select></label>)}
      </>}
    </section>)}</div>
    <button className="btn" disabled={loading.some(Boolean) || files.some(f => !f || f.code === "" || f.price === "")} onClick={run}>შედარება</button>
    {error && <p className="error" role="alert">{error}</p>}
    {result && <div style={{ marginTop: 20 }}>
      <div className="grid2" aria-live="polite">{[["სულ უნიკალური კოდი", result.rows.length], ...Object.values(statuses).map(s => [s, result.rows.filter(r => r.status === s).length])].map(([label, count]) => <div className="card" key={label}><span>{label}: </span><strong>{count}</strong></div>)}</div>
      {result.warnings.length > 0 && <details style={{ margin: "16px 0" }}><summary>მონაცემების გაფრთხილებები ({result.warnings.length})</summary><div style={{ maxHeight: 280, overflow: "auto" }}>{result.warnings.map((w, i) => <p key={i}>{w}</p>)}</div></details>}
      <p className="muted">ცარიელი/ორაზროვანი ფასი ნულად არ ითვლება. 1,234 და 1.234 ტექსტური ფასები ორაზროვანია. საწყისი ფასი 0-ისას პროცენტული სხვაობა არ ითვლება.</p>
      <div className="row" style={{ flexWrap: "wrap", margin: "18px 0" }}><button className="excel-btn" onClick={() => void download()}>რეპორტის ჩამოტვირთვა</button><label><input type="checkbox" checked={showEqual} onChange={e => { setShowEqual(e.target.checked); setPage(0); }} /> დამთხვეული პროდუქტების ჩვენება</label></div>
      <p className="muted">რეპორტი ყოველთვის შეიცავს მხოლოდ პრობლემურ კოდებს. ცარიელი კოდის სტრიქონები ჩამოთვლილია გაფრთხილებებში.</p>
      <div className="simple-table-wrap"><table className="table"><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{visible.slice(page * 100, (page + 1) * 100).map(r => <tr key={r.code}><td>{r.code}</td><td>{format(r.price1)}</td><td>{format(r.price2)}</td><td>{format(r.difference, true)}</td><td>{format(r.percent, true, true)}</td><td>{r.status}</td></tr>)}</tbody></table></div>
      {!visible.length && <p>საჩვენებელი პრობლემური კოდები არ არის.</p>}
      {visible.length > 100 && <div className="row" style={{ marginTop: 16 }}><button className="btn secondary" disabled={page === 0} onClick={() => setPage(p => p - 1)}>წინა</button><span>{page + 1} / {Math.ceil(visible.length / 100)}</span><button className="btn secondary" disabled={(page + 1) * 100 >= visible.length} onClick={() => setPage(p => p + 1)}>შემდეგი</button></div>}
    </div>}
  </div>;
}
