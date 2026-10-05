// node tests/onway-webhook.cjs — no network; Supabase and Next are mocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, context = {}) {
  const out = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
  }).outputText;
  const mod = {exports: {}};
  vm.runInNewContext(out, {module: mod, exports: mod.exports, Buffer, JSON, console, process, ...context});
  return mod.exports;
}
const {parseOnwayWebhook} = load('lib/onway-webhook.ts');
const sample = (status, id = '37', tn = '100889776') =>
  ({hash: 'x', order_info: {trackingnumber: tn, traking: tn, status, order_status_id: id}});

// parsing
let r = parseOnwayWebhook(sample('გაფორმებული'));
assert.equal(r.tracking, '100889776'); assert.equal(r.delivered, false);
assert.equal(parseOnwayWebhook(sample(' ჩაბარებული ')).delivered, true);
assert.equal(parseOnwayWebhook(sample('ჩაბარებულია')).delivered, false);
assert.equal(parseOnwayWebhook(sample('x', '99'), ['99']).delivered, true);
assert.equal(parseOnwayWebhook(sample('x', '99'), ['', '100']).delivered, false);
assert.equal(parseOnwayWebhook(null).tracking, null);
assert.equal(parseOnwayWebhook({order_info: {traking: ' 55 '}}).tracking, '55');

// route
async function call(body, {key = 'k', secret = 'k', rpc} = {}) {
  const calls = [];
  const env = {ONWAY_WEBHOOK_SECRET: secret, NEXT_PUBLIC_SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 's'};
  const route = load('app/api/onway/webhook/route.ts', {
    process: {env},
    require(name) {
      if (name === 'next/server') return {NextResponse: {json: (b, i) => ({body: b, status: i?.status || 200})}};
      if (name === 'crypto') return require('node:crypto');
      if (name === '@supabase/supabase-js') return {createClient: () => ({rpc: async (n, a) => { calls.push([n, a]); return rpc || {data: 'updated', error: null}; }})};
      if (name === '@/lib/onway-webhook') return {parseOnwayWebhook};
      throw new Error(name);
    },
  });
  const req = {nextUrl: {searchParams: new URLSearchParams(key ? {key} : {})}, headers: {get: () => null},
    json: async () => { if (body === 'bad') throw new Error('x'); return body; }};
  const res = await route.POST(req);
  return {res, calls};
}
(async () => {
  let o = await call(sample('ჩაბარებული'));
  assert.equal(o.res.status, 200); assert.equal(JSON.stringify(o.calls), JSON.stringify([['nexo_mark_onway_delivered', {p_tracking: '100889776'}]]));
  o = await call(sample('გაფორმებული')); assert.equal(o.calls.length, 0); assert.equal(o.res.body.ignored, 'not delivered');
  o = await call(sample('ჩაბარებული'), {key: 'wrong'}); assert.equal(o.res.status, 401); assert.equal(o.calls.length, 0);
  o = await call(sample('ჩაბარებული'), {key: ''}); assert.equal(o.res.status, 401);
  o = await call(sample('ჩაბარებული'), {secret: ''}); assert.equal(o.res.status, 503);
  o = await call('bad'); assert.equal(o.res.status, 400);
  o = await call(sample('ჩაბარებული'), {rpc: {data: null, error: {message: 'boom'}}}); assert.equal(o.res.status, 500);
  console.log('PASS: webhook parsing, secret check, delivered-only update, error handling.');
})().catch(e => { console.error(e); process.exit(1); });
