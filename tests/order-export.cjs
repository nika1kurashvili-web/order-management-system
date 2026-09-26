// Run with: node tests/order-export.cjs. Uses mocked Supabase; no network or file exports.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const XLSX = require('xlsx');
const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const compile = code => ts.transpileModule(code, {compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
}}).outputText;

let costReads = 0;
const costs = [
  {product_id: 'p1', variant_id: null, purchase_price: 25.5},
  {product_id: 'p2', variant_id: null, purchase_price: 99},
  {product_id: null, variant_id: 'v2', purchase_price: 40},
  {product_id: 'p0', variant_id: null, purchase_price: 0},
];
const moduleState = {exports: {}};
vm.runInNewContext(compile(source('lib/order-export.ts')), {
  module: moduleState, exports: moduleState.exports,
  require(name) {
    assert.equal(name, './purchase-prices');
    return {readPurchasePrices: async () => { costReads++; return costs; }};
  },
});
const helpers = moduleState.exports;

const items = [
  {order_id: 'o1', product_id: 'p1', variant_id: null, product_name: 'Standalone', quantity: 3, unit_price: 50, total_price: 150},
  {order_id: 'o1', product_id: 'p2', variant_id: 'v2', variant_name: 'Black', product_name: 'Variant', quantity: 1, unit_price: 80, total_price: 80},
  ...Array.from({length: 6}, (_, i) => ({order_id: 'o2', product_id: i === 0 ? 'p0' : null,
    variant_id: null, variant_name: i === 1 ? 'Deleted variant' : null,
    product_name: `Snapshot ${i}`, quantity: 2, unit_price: 50, total_price: 100})),
];
function client(role, active = true) {
  const reads = [];
  return {reads, auth: {getUser: async () => ({data: {user: {id: 'user'}}})},
    from(table) {
      reads.push(table);
      return {select() {return this;}, eq() {return this;},
        single: async () => ({data: {role, active}}),
        in: async () => ({data: items}),
      };
    },
  };
}
async function exportAs(role, active = true, cachedAllowed = true) {
  let workbook;
  const alerts = [];
  costReads = 0;
  const c = client(role, active);
  const dashboard = source('app/dashboard/page.tsx');
  const start = dashboard.indexOf('async function exportExcel(){');
  const end = dashboard.indexOf('\n return <>', start);
  assert.ok(start >= 0 && end > start);
  const result = vm.runInNewContext(compile(dashboard.slice(start, end) + '\nexportExcel();'), {
    ...helpers, createClient: () => c, canReport: cachedAllowed, exporting: false,
    filtered: ['o1', 'o2'].map((id, i) => ({id, order_number: i + 1, status: 'current',
      created_at: '2026-09-26T07:42:00Z', delivery_method: 'onway', delivery_fee: 5.5, discount: 3})),
    deliveryLabel: () => 'OnWay', parseDeliveryFee: value => value,
    labels: {current: 'მიმდინარე'}, dateFrom: '', dateTo: '',
    setExporting() {}, alert: value => alerts.push(value),
    XLSX: {...XLSX, writeFile: book => {workbook = book;}},
  });
  await result;
  return {workbook, alerts, costReads, reads: c.reads};
}

(async () => {
  assert.equal(helpers.tbilisiOrderDate('2026-09-26T07:42:00Z'), '26.09.2026 11:42');
  assert.equal(helpers.tbilisiOrderDate('2026-09-25T21:42:00Z'), '26.09.2026 01:42');
  assert.equal(helpers.tbilisiOrderDate('invalid'), '—');
  const lookup = helpers.purchasePriceLookup(costs);
  assert.equal(lookup(items[0]), 25.5);
  assert.equal(lookup(items[1]), 40);
  assert.equal(lookup({product_id: 'p2', variant_id: null, variant_name: 'Deleted'}), '');
  assert.equal(lookup({product_id: 'p2', variant_id: 'missing'}), '');
  assert.equal(lookup({product_id: null, variant_id: null}), '');
  assert.equal(lookup({product_id: 'p0'}), 0);

  let result = await exportAs('admin');
  assert.equal(result.alerts.length, 0);
  assert.equal(result.costReads, 1);
  assert.ok(result.workbook.SheetNames.includes('განმარტება'));
  let rows = XLSX.utils.sheet_to_json(result.workbook.Sheets['შეკვეთები'], {defval: ''});
  assert.equal(rows.length, 7); // One slotted order plus six continuation rows.
  assert.equal(rows[0]['შესყიდვის ფასი 1'], 25.5); // Unit cost, not multiplied by 3.
  assert.equal(rows[0]['შესყიდვის ფასი 2'], 40);
  assert.equal(rows[0]['შესყიდვის ფასი 3'], '');
  assert.equal(rows[0]['მიტანის საფასური'], 5.5);
  assert.equal(rows[0]['ფასდაკლება (₾)'], 3);
  assert.equal(rows[0]['თარიღი'], '26.09.2026 11:42');
  assert.equal(rows[1]['შესყიდვის ფასი'], 0);
  assert.equal(rows[2]['შესყიდვის ფასი'], '');
  assert.equal(rows[6]['პროდუქტის №'], 6);

  result = await exportAs('manager');
  assert.equal(result.costReads, 0);
  assert.equal(result.workbook.SheetNames.length, 1);
  rows = XLSX.utils.sheet_to_json(result.workbook.Sheets['შეკვეთები']);
  assert.equal(rows.length, 7);
  assert.ok(rows.every(row => Object.keys(row).every(key => !key.includes('შესყიდვის'))));
  for (const [role, active] of [['operator', true], ['admin', false], ['manager', false]]) {
    result = await exportAs(role, active); // Cached UI access must not authorize export.
    assert.equal(result.costReads, 0);
    assert.equal(result.workbook, undefined);
    assert.equal(result.alerts.length, 1);
    assert.ok(!result.reads.includes('order_items'));
  }
  result = await exportAs('operator', true, false);
  assert.equal(result.reads.length, 0);
  console.log('PASS: Tbilisi timestamps, fresh role checks, manager cost isolation, unit costs, deleted references, zero vs missing costs, and both Excel layouts.');
})().catch(error => {console.error(error); process.exitCode = 1;});
