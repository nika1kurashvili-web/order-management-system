const assert = require('node:assert/strict');
const fs = require('node:fs'); const ts = require('typescript');
const out = ts.transpileModule(fs.readFileSync(require('node:path').resolve(__dirname, '../lib/order-options.ts'), 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText;
const m = {exports: {}}; new Function('module', 'exports', out)(m, m.exports);
const {countsAsSale} = m.exports;
for (const s of ['current', 'shipping', 'delivered']) assert.equal(countsAsSale(s), true, s);
for (const s of ['cancelled', 'return_pending', 'returned', 'exchange', '', null, undefined]) assert.equal(countsAsSale(s), false, String(s));
console.log('sales-statuses ok');
