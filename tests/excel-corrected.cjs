// Pure logic of the "corrected file 1" rule; the workbook writing is covered by excel-comparison.cjs-style runs with xlsx installed.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const mod = {exports: {}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/excel-comparison.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText, {module: mod, exports: mod.exports, require: () => ({utils: {}})});
const {isFixable, statuses} = mod.exports;
const row = (status, price2, percent) => ({code: 'A', price1: 10, price2, difference: 1, percent, status});
assert.equal(isFixable(row(statuses.different, 11, 10)), true);
assert.equal(isFixable(row(statuses.different, 9, -10)), true);
assert.equal(isFixable(row(statuses.different, 20, 100)), false);
assert.equal(isFixable(row(statuses.different, 0, -100)), false);
assert.equal(isFixable(row(statuses.different, 20.000000001, 100.00000001)), false);
assert.equal(isFixable(row(statuses.different, 21, 110)), true);
assert.equal(isFixable(row(statuses.different, 5, null)), false);
for (const s of ['equal', 'missing1', 'missing2', 'invalid', 'duplicate', 'ambiguous']) assert.equal(isFixable(row(statuses[s], 11, 10)), false, s);
console.log('excel-corrected ok');
