import * as XLSX from "xlsx";

export const headers = ["კოდი", "ფაილი 1 ფასი", "ფაილი 2 ფასი", "სხვაობა", "სხვაობა %", "სტატუსი"];
export const statuses = { equal: "ემთხვევა", different: "ფასი განსხვავდება", missing1: "ფაილი 1-ში ვერ მოიძებნა", missing2: "ფაილი 2-ში ვერ მოიძებნა", invalid: "არასწორი ფასი", duplicate: "დუბლირებული კოდი სხვადასხვა ფასით" };
export type Source = { sheet: XLSX.WorkSheet; sheetName: string; columns: { index: number; label: string }[]; start: number; end: number };
export type Result = { code: string; price1: number | null; price2: number | null; difference: number | null; percent: number | null; status: string };

export function readSource(data: ArrayBuffer): Source {
  const book = XLSX.read(data, { type: "array", cellText: true });
  const sheetName = book.SheetNames[0];
  const sheet = book.Sheets[sheetName];
  if (!sheet?.["!ref"]) throw new Error("პირველი ფურცელი ცარიელია.");
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  if (range.e.r > 100000 || range.e.c > 1023) throw new Error("მაქსიმუმ 100 000 სტრიქონი და 1 024 სვეტია დაშვებული.");
  const columns: Source["columns"] = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c })];
    const label = cell?.t === "s" ? String(cell.v).trim() : "";
    if (label) columns.push({ index: c, label: `${XLSX.utils.encode_col(c)} — ${label}` });
  }
  if (columns.length < 2) throw new Error("პირველ სტრიქონში საჭიროა მინიმუმ ორი დასათაურებული სვეტი.");
  if (range.e.r === range.s.r) throw new Error("ფურცელში მხოლოდ სათაურებია; მონაცემები არ არის.");
  return { sheet, sheetName, columns, start: range.s.r + 1, end: range.e.r };
}

// Reject ambiguous single separators with three trailing digits (e.g. 1,234).
export function parsePrice(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER ? value : null;
  if (typeof value !== "string") return null;
  let s = value.trim().replace(/^(?:GEL|USD|EUR|₾|\$|€)\s*/i, "").replace(/\s*(?:GEL|USD|EUR|₾|\$|€)$/i, "").trim();
  if (!s) return null;
  if (/\s/.test(s)) {
    if (!/^[+-]?\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d{1,2})?$/.test(s)) return null;
    s = s.replace(/[ \u00a0\u202f]/g, "");
  }
  if (s.includes(",") && s.includes(".")) {
    if (/^[+-]?\d{1,3}(?:,\d{3})+\.\d{1,2}$/.test(s)) s = s.replace(/,/g, "");
    else if (/^[+-]?\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else return null;
  } else {
    if (!/^[+-]?\d+(?:[.,]\d{1,2})?$/.test(s)) return null;
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER ? n : null;
}

type Entry = { prices: Set<number>; invalid: boolean; rows: number[] };
function entries(source: Source, codeColumn: number, priceColumn: number, file: number) {
  if (codeColumn === priceColumn || ![codeColumn, priceColumn].every(c => source.columns.some(h => h.index === c))) throw new Error("აირჩიეთ კოდისა და ფასის განსხვავებული სვეტები.");
  const map = new Map<string, Entry>();
  const warnings: string[] = [];
  for (let r = source.start; r <= source.end; r++) {
    const codeCell = source.sheet[XLSX.utils.encode_cell({ r, c: codeColumn })];
    const priceCell = source.sheet[XLSX.utils.encode_cell({ r, c: priceColumn })];
    const code = codeCell && codeCell.t !== "e" ? (codeCell.t === "n" ? XLSX.utils.format_cell(codeCell) : String(codeCell.v ?? "")).trim() : "";
    if (!code) {
      const nonempty = source.columns.some(c => {
        const cell = source.sheet[XLSX.utils.encode_cell({ r, c: c.index })];
        return cell?.v != null && String(cell.v).trim() !== "";
      });
      if (nonempty) warnings.push(`ფაილი ${file}, სტრიქონი ${r + 1}: კოდი ცარიელია ან არასწორია; გამოტოვებულია.`);
      continue;
    }
    const price = priceCell?.t === "e" ? null : parsePrice(priceCell?.v);
    const entry = map.get(code) || { prices: new Set<number>(), invalid: false, rows: [] };
    entry.rows.push(r + 1);
    if (price === null) {
      entry.invalid = true;
      warnings.push(`ფაილი ${file}, სტრიქონი ${r + 1}, კოდი ${code}: ფასი ცარიელია, არასწორია ან ორაზროვანია.`);
    } else entry.prices.add(price);
    map.set(code, entry);
  }
  for (const [code, entry] of map) if (entry.prices.size > 1) warnings.push(`ფაილი ${file}, სტრიქონები ${entry.rows.join(", ")}, კოდი ${code}: ${statuses.duplicate}.`);
  return { map, warnings };
}

export function compare(a: Source, ac: number, ap: number, b: Source, bc: number, bp: number) {
  const first = entries(a, ac, ap, 1), second = entries(b, bc, bp, 2);
  const rows: Result[] = [];
  const price = (entry?: Entry) => entry && !entry.invalid && entry.prices.size === 1 ? [...entry.prices][0] : null;
  for (const code of new Set([...first.map.keys(), ...second.map.keys()])) {
    const x = first.map.get(code), y = second.map.get(code);
    const price1 = price(x), price2 = price(y);
    let status: string;
    if ((x?.prices.size || 0) > 1 || (y?.prices.size || 0) > 1) status = statuses.duplicate;
    else if (x?.invalid || y?.invalid) status = statuses.invalid;
    else if (!x) status = statuses.missing1;
    else if (!y) status = statuses.missing2;
    else status = price1 === price2 ? statuses.equal : statuses.different;
    const difference = [statuses.equal, statuses.different].includes(status) ? Number((price2! - price1!).toPrecision(15)) : null;
    const ratio = difference !== null && price1 !== 0 ? difference / price1! * 100 : null;
    rows.push({ code, price1, price2, difference, percent: ratio !== null && Number.isFinite(ratio) ? ratio : null, status });
  }
  return { rows, warnings: [...first.warnings, ...second.warnings] };
}

export function reportWorkbook(rows: Result[]) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows.filter(r => r.status !== statuses.equal).map(r => [r.code, r.price1, r.price2, r.difference, r.percent === null ? null : r.percent / 100, r.status])]);
  sheet["!cols"] = [24, 20, 20, 20, 20, 52].map(wch => ({ wch }));
  sheet["!autofilter"] = { ref: sheet["!ref"]! };
  const range = XLSX.utils.decode_range(sheet["!ref"]!);
  for (let r = 1; r <= range.e.r; r++) for (let c = 1; c <= 4; c++) {
    const cell = sheet[XLSX.utils.encode_cell({ r, c })];
    if (cell?.t === "n") cell.z = c === 4 ? '+0.00%;-0.00%;0.00%' : c === 3 ? '+0.00;-0.00;0.00' : '0.00';
  }
  // SheetJS Community Edition does not write bold fonts or frozen panes.
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Comparison");
  return book;
}
