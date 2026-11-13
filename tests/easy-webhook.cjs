const assert = require('node:assert/strict');
const fs = require('node:fs'); const ts = require('typescript');
const out = ts.transpileModule(fs.readFileSync(require('node:path').resolve(__dirname, '../lib/easy-webhook.ts'), 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText;
const m = {exports: {}}; new Function('module', 'exports', out)(m, m.exports);
const {parseEasyWebhook} = m.exports;
const ev = (name, code, trk = 'UB123') => ({event: 'status_changed', data: {tracking_code: trk, old_status: 'x', new_status: name, new_status_code: code}});

let r = parseEasyWebhook(ev('ჩაბარებულია', 6));
assert.equal(r.tracking, 'UB123'); assert.equal(r.delivered, true); assert.equal(r.notDelivered, false);
r = parseEasyWebhook(ev('არ ჩაიბარა', 8));
assert.equal(r.delivered, false); assert.equal(r.notDelivered, true);
// name wins over a conflicting code (docs example shows 5 for "ჩაბარებულია")
r = parseEasyWebhook(ev('ჩაბარებულია', 5)); assert.equal(r.delivered, true);
r = parseEasyWebhook(ev('გაუქმებულია', 6)); assert.equal(r.delivered, false); assert.equal(r.notDelivered, false);
r = parseEasyWebhook(ev('  ჩაბარებულია ', 6)); assert.equal(r.delivered, true);
// no name: fall back to the code
r = parseEasyWebhook(ev('', 6)); assert.equal(r.delivered, true);
r = parseEasyWebhook(ev('', 8)); assert.equal(r.notDelivered, true);
r = parseEasyWebhook(ev('', 5)); assert.equal(r.delivered, false); assert.equal(r.notDelivered, false);
// other statuses are ignored
for (const n of ['ასაღები', 'საწყობშია', 'დასაბრუნებელია გამგზავნთან', 'დაბრუნებულია გამგზავნთან', 'ანაზღაურებულია']) {
  r = parseEasyWebhook(ev(n, 1)); assert.equal(r.delivered, false); assert.equal(r.notDelivered, false);
}
// broken payloads
for (const b of [null, undefined, 'x', {}, {data: null}, {data: {}}]) { r = parseEasyWebhook(b); assert.equal(r.tracking, null); assert.equal(r.delivered, false); assert.equal(r.notDelivered, false); }
console.log('easy-webhook ok');
