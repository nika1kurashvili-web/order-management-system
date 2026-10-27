const assert = require('node:assert/strict');
const fs = require('node:fs'); const ts = require('typescript');
const out = ts.transpileModule(fs.readFileSync(require('node:path').resolve(__dirname, '../lib/regions.ts'), 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText;
const m = {exports: {}}; new Function('module', 'exports', out)(m, m.exports);
const {regionOf} = m.exports;
assert.equal(regionOf('თბილისი'), 'tbilisi'); assert.equal(regionOf('Tbilisi'), 'tbilisi');
assert.equal(regionOf('რუსთავი'), 'rustavi');
for (const c of ['ბათუმი', 'ქუთაისი', '', null, undefined]) assert.equal(regionOf(c), 'other');
console.log('regions ok');
