// node tests/employee-delete.cjs — no network; Supabase and Next are mocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'app/api/employees/delete/route.ts'), 'utf8');
const out = ts.transpileModule(src, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText;

function run({me = {role: 'admin', active: true}, target = {id: 't1', role: 'operator', active: true, deleted_at: null}, admins = 2, orders = 3, profileUpdateError = null, authError = null}, body, headers = {authorization: 'Bearer tok'}) {
  const calls = {profileUpdate: null, authUpdate: null};
  const chain = (table, svc) => {
    const st = {table, filters: {}};
    const q = {
      select(_c, o) { st.head = o && o.head; return q; },
      eq(k, v) { st.filters[k] = v; return q; },
      is() { return q; },
      single: async () => ({data: me, error: null}),
      maybeSingle: async () => ({data: target, error: null}),
      update(p) { st.upd = p; return {eq: async () => { calls.profileUpdate = p; return {error: profileUpdateError}; }}; },
      then(res) {
        if (st.table === 'profiles') return Promise.resolve({count: admins, error: null}).then(res);
        return Promise.resolve({count: orders, error: null}).then(res);
      },
    };
    return q;
  };
  const createClient = (url, key) => key === 'svc'
    ? {from: t => chain(t, true), auth: {admin: {updateUserById: async (id, a) => { calls.authUpdate = {id, a}; return {error: authError}; }}}}
    : {from: t => chain(t, false), auth: {getUser: async () => ({data: {user: {id: 'me1'}}, error: null})}};
  const mod = {exports: {}};
  const NextResponse = {json: (b, i) => ({body: b, status: (i && i.status) || 200})};
  const require_ = n => n === '@supabase/supabase-js' ? {createClient} : {NextResponse};
  vm.runInNewContext(out, {module: mod, exports: mod.exports, require: require_, process: {env: {NEXT_PUBLIC_SUPABASE_URL: 'u', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 'svc'}}, console, Date, JSON});
  const req = {headers: {get: k => headers[k.toLowerCase()] || null}, json: async () => body};
  return mod.exports.POST(req).then(r => ({r, calls}));
}
(async () => {
  let x = await run({}, {id: 't1'}, {});
  assert.equal(x.r.status, 401);
  x = await run({me: {role: 'operator', active: true}}, {id: 't1'});
  assert.equal(x.r.status, 403);
  x = await run({}, {id: 'me1'});
  assert.equal(x.r.status, 400); assert.equal(x.calls.profileUpdate, null);
  x = await run({}, {});
  assert.equal(x.r.status, 400);
  x = await run({target: {id: 'a2', role: 'admin', active: true, deleted_at: null}, admins: 1}, {id: 'a2'});
  assert.equal(x.r.status, 400); assert.equal(x.calls.authUpdate, null);
  x = await run({}, {id: 't1'});
  assert.equal(x.r.status, 200); assert.equal(x.r.body.orders, 3);
  assert.equal(x.calls.profileUpdate.active, false); assert.ok(x.calls.profileUpdate.deleted_at);
  assert.equal(x.calls.authUpdate.id, 't1'); assert.equal(x.calls.authUpdate.a.ban_duration, '876000h');
  assert.match(x.calls.authUpdate.a.email, /@deleted\.invalid$/);
  x = await run({target: {id: 't1', role: 'operator', active: false, deleted_at: 'x'}}, {id: 't1'});
  assert.equal(x.r.body.alreadyDeleted, true); assert.equal(x.calls.authUpdate, null);
  x = await run({profileUpdateError: {message: 'no column'}}, {id: 't1'});
  assert.equal(x.r.status, 500); assert.equal(x.calls.authUpdate, null);
  console.log('employee-delete ok');
})();
