// node tests/product-names.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const out = ts.transpileModule(fs.readFileSync(require('node:path').resolve(__dirname, '../lib/product-names.ts'), 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText;
const m = {exports: {}}; new Function('module', 'exports', out)(m, m.exports);
const {nameKey, duplicateNameGroups} = m.exports;
assert.equal(nameKey('ლოგო სანათი'), nameKey('ლოგო-სანათი'));
assert.equal(nameKey(' ლოგო  სანათი '), nameKey('ლოგო_სანათი'));
assert.equal(nameKey('LED Lamp'), nameKey('led-lamp'));
assert.notEqual(nameKey('ლოგო სანათი'), nameKey('ლოგო სანათი 2'));
assert.notEqual(nameKey('A1'), nameKey('A 1 2'));
assert.equal(nameKey(null), '');
const g = duplicateNameGroups([{name: 'ლოგო სანათი'}, {name: 'ლოგო-სანათი'}, {name: 'სხვა'}, {name: ''}, {name: '-'}]);
assert.equal(g.length, 1); assert.equal(g[0].length, 2);
console.log('product-names ok');
