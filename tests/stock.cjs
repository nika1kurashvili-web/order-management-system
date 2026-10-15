const assert = require('node:assert/strict');
const fs = require('node:fs'); const ts = require('typescript');
const out = ts.transpileModule(fs.readFileSync(require('node:path').resolve(__dirname, '../lib/stock.ts'), 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText;
const m = {exports: {}}; new Function('module', 'exports', out)(m, m.exports);
const {hasStock, sellable} = m.exports;
assert.equal(hasStock(5), true); assert.equal(hasStock('3'), true); assert.equal(hasStock(0), false); assert.equal(hasStock('0'), false);
assert.equal(hasStock(-1), false); assert.equal(hasStock(null), true); assert.equal(hasStock(undefined), true);
const r = sellable(
  [{id: 'a', stock: 0}, {id: 'b', stock: 4}, {id: 'c', stock: 0}, {id: 'd', stock: 9}, {id: 'e', stock: null}],
  [{product_id: 'c', stock: 2}, {product_id: 'c', stock: 0}, {product_id: 'd', stock: 0}]);
assert.deepEqual(r.products.map(p => p.id), ['b', 'c', 'e']); // a out; d's only variant out; c has a variant in stock
assert.equal(r.variants.length, 1);
console.log('stock ok');
