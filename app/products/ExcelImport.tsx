"use client";

import {useRef, useState} from "react";
import {createClient} from "@/lib/supabase-browser";

const headers = ["კოდი", "დასახელება", "ვარიანტი", "ფასი", "წონა"];
type Row = {row: number; code: string; name: string; variant: string; price: number; weight: number};
type Result = {products: number; variants: number; skipped: number; failed: number; messages: string[]};

export default function ExcelImport({onImported}: {onImported: () => Promise<void>}) {
  const input = useRef<HTMLInputElement>(null);
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  async function template() {
    try {
      const XLSX = await import("xlsx");
      const sheet = XLSX.utils.aoa_to_sheet([headers, ["00125", "LED ნათურა", "H7", 65, 0.2]]);
      sheet.A2.z = "@";
      sheet["!cols"] = [{wch: 18}, {wch: 32}, {wch: 22}, {wch: 14}, {wch: 14}];
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "პროდუქტები");
      XLSX.writeFile(book, "products-template.xlsx");
    } catch {
      setError("Excel შაბლონის შექმნა ვერ მოხერხდა.");
    }
  }

  async function upload(file: File) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setResult(null);
    const summary: Result = {products: 0, variants: 0, skipped: 0, failed: 0, messages: []};
    let pending = new Set<number>();
    try {
      if (!/\.xlsx$/i.test(file.name)) throw new Error("აირჩიეთ .xlsx ფაილი.");
      const XLSX = await import("xlsx");
      const book = XLSX.read(await file.arrayBuffer(), {type: "array", cellText: true, cellNF: true});
      if (book.SheetNames.length !== 1) throw new Error("ფაილი უნდა შეიცავდეს მხოლოდ ერთ ფურცელს.");
      const sheet = book.Sheets[book.SheetNames[0]];
      if (!sheet?.["!ref"]) throw new Error("Excel ფაილი ცარიელია.");
      const range = XLSX.utils.decode_range(sheet["!ref"]);
      if (range.e.r > 10000 || range.e.c > 4) throw new Error("ფაილში უნდა იყოს ზუსტად 5 სვეტი და მაქსიმუმ 10000 მონაცემთა რიგი.");
      const cell = (r: number, c: number) => sheet[XLSX.utils.encode_cell({r, c})];
      const text = (r: number, c: number) => {
        const value = cell(r, c);
        return value ? String(value.w ?? value.v ?? "").trim() : "";
      };
      if (headers.some((header, c) => text(0, c) !== header)) {
        throw new Error("პირველი რიგის სვეტები უნდა იყოს: " + headers.join(" | "));
      }
      const number = (r: number, c: number): number | null => {
        const value = cell(r, c);
        if (!value || (value.t !== "n" && value.t !== "s")) return null;
        if (value.t === "n") return typeof value.v === "number" && Number.isFinite(value.v) && value.v >= 0 ? value.v : null;
        const raw = String(value.v ?? "").trim();
        if (!/^\+?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)) return null;
        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
      };
      const rows: Row[] = [];
      for (let r = 1; r <= range.e.r; r++) {
        if (headers.every((_, c) => !text(r, c) && !cell(r, c)?.f)) continue;
        const problems: string[] = [];
        const code = text(r, 0), name = text(r, 1), variant = text(r, 2);
        const price = number(r, 3), weight = number(r, 4);
        if (!code) problems.push("კოდი სავალდებულოა");
        if (cell(r, 0)?.t === "n" && (!Number.isSafeInteger(cell(r, 0).v) || Math.abs(cell(r, 0).v) >= 1e15)) problems.push("კოდი შეინახეთ ტექსტად, რათა Excel-მა მისი სიზუსტე არ დაკარგოს");
        if (!name) problems.push("დასახელება სავალდებულოა");
        if (price === null) problems.push("ფასი უნდა იყოს არაუარყოფითი რიცხვი");
        if (weight === null) problems.push("წონა უნდა იყოს არაუარყოფითი რიცხვი (კგ)");
        if (headers.some((_, c) => cell(r, c)?.f || cell(r, c)?.t === "e")) problems.push("ფორმულები და Excel შეცდომები დაუშვებელია");
        if ([0, 1, 2].some(c => cell(r, c) && !["s", "n"].includes(cell(r, c).t))) problems.push("კოდი, დასახელება და ვარიანტი უნდა იყოს ტექსტი ან რიცხვი");
        if (problems.length) {
          summary.failed++;
          summary.messages.push(`რიგი ${r + 1}: ${problems.join("; ")}.`);
        } else rows.push({row: r + 1, code, name, variant, price: price!, weight: weight!});
      }
      if (!rows.length && !summary.failed) throw new Error("ფაილში მონაცემთა რიგები არ არის.");

      // Validate every product group before allowing any database writes.
      const groups = new Map<string, Row[]>();
      for (const row of rows) {
        const group = groups.get(row.code) || [];
        group.push(row);
        groups.set(row.code, group);
      }
      const invalidRows = new Set<number>();
      const invalid = (row: Row, reason: string) => {
        if (!invalidRows.has(row.row)) summary.failed++;
        invalidRows.add(row.row);
        summary.messages.push(`რიგი ${row.row}: ${reason}`);
      };
      for (const group of groups.values()) {
        if (new Set(group.map(row => row.name)).size !== 1 || (group.some(row => !row.variant) && group.some(row => row.variant))) {
          group.forEach(row => invalid(row, "ერთი კოდის რიგებს განსხვავებული დასახელება ან შერეული ცარიელი/შევსებული ვარიანტები აქვს. შეასწორეთ ფაილი."));
          continue;
        }
        const firstByVariant = new Map<string, Row>();
        const conflicting = new Set<string>();
        for (const row of group) {
          const first = firstByVariant.get(row.variant);
          if (first && (first.price !== row.price || first.weight !== row.weight)) conflicting.add(row.variant);
          else if (!first) firstByVariant.set(row.variant, row);
        }
        group.filter(row => conflicting.has(row.variant)).forEach(row => invalid(row, "იმავე კოდსა და ვარიანტს ფაილში განსხვავებული ფასი/წონა აქვს."));
      }
      if (summary.failed) {
        for (const row of rows) {
          if (invalidRows.has(row.row)) continue;
          summary.skipped++;
          summary.messages.push(`რიგი ${row.row}: არ იმპორტირებულა — ფაილში სხვა რიგების შეცდომებია.`);
        }
        throw new Error("ფაილში შეცდომებია. არაფერი იმპორტირებულა; შეასწორეთ მითითებული რიგები და ატვირთეთ ხელახლა.");
      }

      pending = new Set(rows.map(row => row.row));
      const c = createClient();
      const {data: auth, error: authError} = await c.auth.getUser();
      if (authError || !auth.user) throw new Error("სესია დასრულებულია. თავიდან შედით სისტემაში.");
      const {data: profile, error: profileError} = await c.from("profiles").select("role,active").eq("id", auth.user.id).single();
      if (profileError || profile?.role !== "admin" || profile.active === false) throw new Error("იმპორტი მხოლოდ აქტიურ Admin-ს შეუძლია.");

      const fail = (row: Row, message: string) => {
        summary.failed++;
        pending.delete(row.row);
        summary.messages.push(`რიგი ${row.row}: ${message}`);
      };
      const skip = (row: Row, message: string) => {
        summary.skipped++;
        pending.delete(row.row);
        summary.messages.push(`რიგი ${row.row}: ${message}`);
      };
      for (const [code, valid] of groups) {
        // Escape LIKE metacharacters; exact code comparison below preserves case.
        const pattern = code.replace(/[\\%_]/g, "\\$&");
        const {data: matches, error: lookupError, count: matchCount} = await c.from("products").select("*", {count: "exact"}).like("sku", `%${pattern}%`);
        if (lookupError) { valid.forEach(row => fail(row, "პროდუქტის მოძებნა ვერ მოხერხდა: " + lookupError.message)); continue; }
        if (matchCount !== null && matchCount > (matches || []).length) { valid.forEach(row => fail(row, "ბაზამ კოდების არასრული სია დააბრუნა; დუბლირების თავიდან ასაცილებლად იმპორტი შეჩერდა.")); continue; }
        const exact = (matches || []).filter(product => String(product.sku ?? "").trim() === code);
        if (exact.length > 1) { valid.forEach(row => fail(row, "ბაზაში ამ კოდით რამდენიმე პროდუქტია; ავტომატური შესაბამისობა შეუძლებელია.")); continue; }
        let product = exact[0];
        const first = valid[0];
        if (product && (String(product.name).trim() !== first.name || product.active === false)) {
          valid.forEach(row => skip(row, "არსებული პროდუქტის დასახელება განსხვავდება ან პროდუქტი არააქტიურია. მონაცემები არ შეცვლილა."));
          continue;
        }
        if (!product) {
          const {data: created, error: createError} = await c.from("products").insert({sku: code, name: first.name, price: first.price, weight_kg: first.weight, active: true}).select().single();
          if (createError || !created) { valid.forEach(row => fail(row, "პროდუქტი ვერ შეიქმნა: " + (createError?.message || "უცნობი შეცდომა"))); continue; }
          product = created;
          summary.products++;
        }
        const {data: stored, error: variantsError, count: variantCount} = await c.from("product_variants").select("*", {count: "exact"}).eq("product_id", product.id);
        if (variantsError) { valid.forEach(row => fail(row, "ვარიანტები ვერ ჩაიტვირთა: " + variantsError.message)); continue; }
        if (variantCount !== null && variantCount > (stored || []).length) { valid.forEach(row => fail(row, "ბაზამ ვარიანტების არასრული სია დააბრუნა; დუბლირების თავიდან ასაცილებლად იმპორტი შეჩერდა.")); continue; }
        const existing = stored || [];
        for (const row of valid) {
          if (!row.variant) {
            if (existing.length || Number(product.price) !== row.price || Number(product.weight_kg) !== row.weight) {
              skip(row, "არსებულ პროდუქტს განსხვავებული ფასი/წონა ან ვარიანტები აქვს. მონაცემები არ შეცვლილა.");
            } else if (exact.length || row !== first) skip(row, "პროდუქტი უკვე არსებობს; მონაცემები არ შეცვლილა.");
            else pending.delete(row.row);
            continue;
          }
          const same = existing.filter(variant => String(variant.name).trim() === row.variant);
          if (same.length) {
            const variant = same[0];
            const conflict = same.length > 1 || variant.active === false || Number(variant.price) !== row.price || Number(variant.weight_kg ?? product.weight_kg) !== row.weight;
            skip(row, conflict ? "არსებული ვარიანტი კონფლიქტურია (ფასი, წონა, სტატუსი ან განმეორებული სახელი). მონაცემები არ შეცვლილა." : "ვარიანტი უკვე არსებობს; გამოტოვებულია.");
            continue;
          }
          const {data: created, error: variantError} = await c.from("product_variants").insert({product_id: product.id, name: row.variant, sku: null, price: row.price, weight_kg: row.weight, active: true}).select().single();
          if (variantError || !created) { fail(row, "ვარიანტი ვერ შეიქმნა: " + (variantError?.message || "უცნობი შეცდომა")); continue; }
          existing.push(created);
          summary.variants++;
          pending.delete(row.row);
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Excel-ის იმპორტი ვერ მოხერხდა.");
      for (const row of pending) {
        summary.failed++;
        summary.messages.push(`რიგი ${row}: იმპორტი შეწყდა; რიგი ვერ დასრულდა. ხელახლა ატვირთვამდე შეამოწმეთ პროდუქტების სია.`);
      }
    } finally {
      setResult(summary);
      try { await onImported(); } catch { setError(previous => previous + " პროდუქტების სია ვერ განახლდა; განაახლეთ გვერდი."); }
      running.current = false;
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return <div className="panel">
    <div className="formline">
      <button className="btn" disabled={busy} onClick={() => input.current?.click()}>{busy ? "იტვირთება..." : "Excel-ით ატვირთვა"}</button>
      <button className="btn secondary" disabled={busy} onClick={template}>Excel შაბლონი</button>
      <input ref={input} type="file" accept=".xlsx" hidden onChange={event => {const file = event.target.files?.[0]; if (file) void upload(file);}} />
    </div>
    <p className="muted">სვეტები: {headers.join(" | ")}. კოდი შეინახეთ Excel-ში ტექსტად, რათა საწყისი ნულები შენარჩუნდეს. ვარიანტი შეიძლება იყოს ცარიელი. წონა — კგ, ათწილადი — წერტილით. შაბლონის მაგალითი ჩაანაცვლეთ თქვენი მონაცემებით.</p>
    <p className="muted">ახალი პროდუქტის საბაზისო ფასი/წონა აიღება პირველი რიგიდან. არსებული მონაცემები არ იცვლება. ფაილი სრულად მოწმდება იმპორტამდე; თუ რომელიმე რიგი არასწორია, არაფერი იმპორტირდება.</p>
    {error && <p role="alert">{error}</p>}
    {result && <div role="status">
      <p>შექმნილი პროდუქტები: {result.products} · შექმნილი ვარიანტები: {result.variants} · გამოტოვებული რიგები: {result.skipped} · წარუმატებელი რიგები: {result.failed}</p>
      {result.messages.length > 0 && <ul style={{maxHeight: 300, overflowY: "auto"}}>{result.messages.map((message, i) => <li key={i}>{message}</li>)}</ul>}
    </div>}
  </div>;
}
