"use client";

import {useRef, useState} from "react";
import {createClient} from "@/lib/supabase-browser";
import type {Product, ProductVariant} from "@/lib/types";

const headers = ["კოდი", "დასახელება", "ვარიანტი", "ფასი", "წონა"];
type Row = {row: number; code: string; name: string; variant: string; price: number; weight: number};
type Result = {products: number; variants: number; skipped: number; failed: number; messages: string[]};
const cleanName = (value: string) => value.normalize("NFC").trim().replace(/\s+/g, " ");
const normalizedName = (value: string) => cleanName(value).toLowerCase();

export default function ExcelImport({onImported}: {onImported: () => Promise<void>}) {
  const input = useRef<HTMLInputElement>(null);
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  async function template() {
    try {
      const XLSX = await import("xlsx");
      const sheet = XLSX.utils.aoa_to_sheet([
        headers,
        ["LED-H7-01", "LED ნათურა", "H7", 65, 0.2],
        ["LED-H4-01", "LED ნათურა", "H4", 70, 0.22],
        ["LED-H11-01", "LED ნათურა", "H11", 75, 0.25],
      ]);
      for (const address of ["A2", "A3", "A4"]) sheet[address].z = "@";
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
        const code = text(r, 0), name = cleanName(text(r, 1)), variant = cleanName(text(r, 2));
        const price = number(r, 3), weight = number(r, 4);
        if (!code) problems.push("კოდი სავალდებულოა");
        if (cell(r, 0)?.t === "n" && (!Number.isSafeInteger(cell(r, 0).v) || Math.abs(cell(r, 0).v) >= 1e15)) problems.push("კოდი შეინახეთ ტექსტად, რათა Excel-მა მისი სიზუსტე არ დაკარგოს");
        if (!name) problems.push("დასახელება სავალდებულოა");
        if (!variant) problems.push("ვარიანტის დასახელება სავალდებულოა");
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

      // Validate SKU ownership and names across the entire file before writes.
      const rowsBySku = new Map<string, Row[]>();
      const rowsByVariant = new Map<string, Row[]>();
      for (const row of rows) {
        const skuRows = rowsBySku.get(row.code) || [];
        skuRows.push(row);
        rowsBySku.set(row.code, skuRows);
        const key = JSON.stringify([normalizedName(row.name), normalizedName(row.variant)]);
        const nameRows = rowsByVariant.get(key) || [];
        nameRows.push(row);
        rowsByVariant.set(key, nameRows);
      }
      const invalidRows = new Set<number>();
      const invalid = (row: Row, reason: string) => {
        if (!invalidRows.has(row.row)) summary.failed++;
        invalidRows.add(row.row);
        summary.messages.push(`რიგი ${row.row}: ${reason}`);
      };
      for (const group of rowsBySku.values()) {
        const signatures = new Set(group.map(row => JSON.stringify([normalizedName(row.name), normalizedName(row.variant), row.price, row.weight])));
        if (signatures.size > 1) group.forEach(row => invalid(row, "იგივე ვარიანტის კოდი ფაილში განსხვავებულ პროდუქტს/ვარიანტს ან ფასს/წონას უკავშირდება."));
      }
      for (const group of rowsByVariant.values()) {
        const signatures = new Set(group.map(row => JSON.stringify([row.code, row.price, row.weight])));
        if (signatures.size > 1) group.forEach(row => invalid(row, "ერთი პროდუქტის იმავე ვარიანტს ფაილში განსხვავებული კოდი, ფასი ან წონა აქვს."));
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
      // Read all pages: normalization must also find names with different spacing/case,
      // and SKU ownership must be checked across every product, including inactive ones.
      async function catalog<T>(table: "products" | "product_variants"): Promise<T[]> {
        const all: T[] = [];
        let expected: number | null = null;
        for (;;) {
          const {data, error: readError, count} = await c.from(table).select("*", {count: "exact"}).order("id").range(all.length, all.length + 499);
          if (readError) throw new Error(`${table}: ${readError.message}`);
          if (count === null || !data || (expected !== null && count !== expected)) throw new Error("კატალოგის სრული სია ვერ დადასტურდა ან შეიცვალა. სცადეთ ხელახლა.");
          expected = count;
          all.push(...data as T[]);
          if (all.length === count) return all;
          if (!data.length || all.length > count) throw new Error("კატალოგის სია არასრულია. იმპორტი შეჩერდა.");
        }
      }
      const [products, variants] = await Promise.all([catalog<Product>("products"), catalog<ProductVariant>("product_variants")]);
      const productsByName = new Map<string, Product[]>();
      const variantsBySku = new Map<string, ProductVariant[]>();
      const variantsByName = new Map<string, ProductVariant[]>();
      for (const product of products) {
        const key = normalizedName(product.name);
        productsByName.set(key, [...(productsByName.get(key) || []), product]);
      }
      for (const variant of variants) {
        const code = variant.sku?.trim();
        if (code) variantsBySku.set(code, [...(variantsBySku.get(code) || []), variant]);
        const key = JSON.stringify([variant.product_id, normalizedName(variant.name)]);
        variantsByName.set(key, [...(variantsByName.get(key) || []), variant]);
      }
      const groups = new Map<string, Row[]>();
      for (const group of rowsBySku.values()) {
        const first = group[0];
        const key = normalizedName(first.name);
        groups.set(key, [...(groups.get(key) || []), first]);
        group.slice(1).forEach(row => skip(row, `იგივე მონაცემები უკვე არის რიგში ${first.row}; დუბლირებული რიგი გამოტოვებულია.`));
      }
      const plans: {product: Product | undefined; rows: Row[]}[] = [];
      for (const [name, group] of groups) {
        const matches = productsByName.get(name) || [];
        if (matches.length > 1) { group.forEach(row => fail(row, "ამ ნორმალიზებული დასახელებით რამდენიმე პროდუქტია; შესაბამისობა გაურკვეველია.")); continue; }
        const product = matches[0];
        if (product?.active === false) { group.forEach(row => fail(row, "არსებული პროდუქტი არააქტიურია. მონაცემები არ შეცვლილა.")); continue; }
        const newRows: Row[] = [];
        for (const row of group) {
          const bySku = variantsBySku.get(row.code) || [];
          const byName = product ? variantsByName.get(JSON.stringify([product.id, normalizedName(row.variant)])) || [] : [];
          if (bySku.length > 1 || byName.length > 1) { fail(row, "ბაზაში განმეორებული ვარიანტის კოდი ან სახელი მოიძებნა; შესაბამისობა გაურკვეველია."); continue; }
          if (bySku.length) {
            const variant = bySku[0];
            if (!product || variant.product_id !== product.id || normalizedName(variant.name) !== normalizedName(row.variant)) {
              fail(row, "ეს კოდი უკვე სხვა პროდუქტს ან ვარიანტს ეკუთვნის.");
            } else if (byName[0]?.id !== variant.id || variant.active === false || Number(variant.price) !== row.price || Number(variant.weight_kg ?? product.weight_kg) !== row.weight) {
              fail(row, "არსებული ვარიანტის ფასი, წონა ან სტატუსი განსხვავდება. მონაცემები არ შეცვლილა.");
            } else skip(row, "ვარიანტი ამ კოდითა და მონაცემებით უკვე არსებობს; გამოტოვებულია.");
          } else if (byName.length) {
            fail(row, "ამ პროდუქტის იმავე სახელის ვარიანტს სხვა კოდი აქვს ან კოდი არ აქვს. მონაცემები არ შეცვლილა.");
          } else newRows.push(row);
        }
        if (newRows.length) plans.push({product, rows: newRows});
      }
      if (summary.failed) {
        for (const row of rows) if (pending.has(row.row)) skip(row, "არ იმპორტირებულა — ფაილში ბაზის მონაცემებთან კონფლიქტებია.");
        throw new Error("კონფლიქტები მოიძებნა. არაფერი იმპორტირებულა; შეასწორეთ მითითებული რიგები.");
      }

      // Only a fully validated file reaches the write phase. Database unique
      // constraints are still required to protect against concurrent writers.
      for (const plan of plans) {
        let product = plan.product;
        if (!product) {
          const first = plan.rows[0];
          const {data: created, error: createError} = await c.from("products").insert({sku: null, name: first.name, price: first.price, weight_kg: first.weight, active: true}).select().single();
          if (createError || !created) { plan.rows.forEach(row => fail(row, "პროდუქტი ვერ შეიქმნა: " + (createError?.message || "უცნობი შეცდომა"))); continue; }
          product = created as Product;
          summary.products++;
        }
        for (const row of plan.rows) {
          const {data: created, error: variantError} = await c.from("product_variants").insert({product_id: product.id, name: row.variant, sku: row.code, price: row.price, weight_kg: row.weight, active: true}).select().single();
          if (variantError || !created) { fail(row, "ვარიანტი ვერ შეიქმნა: " + (variantError?.message || "უცნობი შეცდომა")); continue; }
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
    <p className="muted">სვეტები: {headers.join(" | ")}. კოდი არის ვარიანტის SKU — შეინახეთ Excel-ში ტექსტად, რათა საწყისი ნულები შენარჩუნდეს. ვარიანტის დასახელება სავალდებულოა. წონა — კგ, ათწილადი — წერტილით. შაბლონის მაგალითები ჩაანაცვლეთ თქვენი მონაცემებით.</p>
    <p className="muted">პროდუქტები ერთიანდება დასახელებით (ზედმეტი გამოტოვებებისა და ასოების რეგისტრის გარეშე). ახალი პროდუქტის კოდი ცარიელია, საბაზისო ფასი/წონა აიღება პირველი ვარიანტიდან. არსებული მონაცემები არ იცვლება. ფაილი სრულად მოწმდება იმპორტამდე; შეცდომის ან კონფლიქტის შემთხვევაში არაფერი იმპორტირდება.</p>
    {error && <p role="alert">{error}</p>}
    {result && <div role="status">
      <p>შექმნილი პროდუქტები: {result.products} · შექმნილი ვარიანტები: {result.variants} · გამოტოვებული რიგები: {result.skipped} · წარუმატებელი რიგები: {result.failed}</p>
      {result.messages.length > 0 && <ul style={{maxHeight: 300, overflowY: "auto"}}>{result.messages.map((message, i) => <li key={i}>{message}</li>)}</ul>}
    </div>}
  </div>;
}
