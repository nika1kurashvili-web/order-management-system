// node tests/onway-quote.cjs — all HTTP/Supabase interactions are mocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function code(file) {
  return ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
  }).outputText;
}
function load(file, context = {}) {
  const mod = {exports: {}};
  vm.runInNewContext(code(file), {module: mod, exports: mod.exports, ...context});
  return mod.exports;
}
const weights = load('lib/onway-quote.ts');
const options = load('lib/order-options.ts');
const item = (weight, quantity = 1, variant = null) => ({product: {weight_kg: weight}, variant, quantity});

async function server(config = {}) {
  const calls = [];
  const client = {auth: {getUser: async () => ({data: {user: {id: 'user'}}})},
    from: () => ({select() {return this;}, eq() {return this;},
      single: async () => ({data: {role: config.role || 'operator', active: config.active !== false}})}),
  };
  const route = load('app/api/onway/price/route.ts', {
    require(name) {
      if (name === 'next/server') return {NextResponse: {json: (body, init) => ({body, status: init?.status || 200})}};
      if (name === '@supabase/supabase-js') return {createClient: () => client};
      if (name === '@/lib/order-options') return options;
      throw Error(name);
    },
    process: {env: {NEXO_PROXY_SECRET: 'test-only-secret'}}, AbortSignal,
    fetch: async (url, init) => {
      calls.push({url, init});
      assert.ok(!url.includes('/send'));
      if (url.includes('/regions')) return {ok: true, json: async () => ({zones: [
        {zone_id: '1', name: 'თბილისი'}, {zone_id: '2', name: 'ბათუმი'},
      ]})};
      assert.equal(url, 'https://onway-api.nexo.ge/onway/price');
      return {ok: !config.httpError, json: async () => config.reply || {shipping_amount: '5.5', additional_services: 0}};
    },
  });
  const result = await route.POST({headers: {get: () => config.noAuth ? '' : 'Bearer user-token'},
    json: async () => ({to_city_id: 2, weight: 2.2, quantity: 99, from_city_id: 999, ...config.input})});
  return {result, calls};
}

function hookHarness() {
  let index = 0, states = [], dependencies, cleanup, nextTimer = 0;
  let delivery = 'manual';
  const timers = new Map(), requests = [];
  const setDelivery = value => {delivery = value;};
  const hooks = load('app/orders/new/useOnwayQuote.ts', {
    require(name) {
      if (name === 'react') return {
        useState(initial) {const i = index++; if (!(i in states)) states[i] = initial;
          return [states[i], value => {states[i] = value;}];},
        useEffect(fn, deps) {
          if (!dependencies || deps.some((d, i) => !Object.is(d, dependencies[i]))) {
            cleanup?.(); dependencies = deps; cleanup = fn();
          }
        },
      };
      if (name === '@/lib/order-options') return options;
      if (name === '@/lib/supabase-browser') return {createClient: () => ({auth: {
        getSession: async () => ({data: {session: {access_token: 'test-user-token'}}}),
      }})};
      throw Error(name);
    },
    AbortController, setTimeout(fn) {timers.set(++nextTimer, fn); return nextTimer;},
    clearTimeout(id) {timers.delete(id);},
    fetch: (url, init) => new Promise(resolve => {requests.push({url, init, resolve});}),
  });
  return {
    render(changes = {}) { index = 0; return hooks.useOnwayQuote({enabled: true, destination: 1, weight: 1, itemKey: 'a', onQuote: setDelivery, ...changes}); },
    flush() {const [id, fn] = timers.entries().next().value; timers.delete(id); return fn();},
    get pending() {return timers.size;}, get delivery() {return delivery;},
    manual(value) {delivery = value;}, requests,
  };
}
const tick = async () => {await Promise.resolve(); await Promise.resolve();};
const respond = (request, price, ok = true) => request.resolve({ok, json: async () => ({shipping_amount: price})});

async function verifyManualSave(catalogWeight) {
  const writes = [], errors = [], navigations = [];
  const client = {auth: {getUser: async () => ({data: {user: {id: 'operator'}}})},
    from(table) {
      return {select() {return this;}, eq() {return this;},
        insert(value) {writes.push({table, value}); return this;},
        single: async () => ({data: table === 'profiles' ? {role: 'operator', active: true} : {id: 'new-order'}}),
        then(resolve) {resolve({error: null});},
      };
    },
  };
  const source = fs.readFileSync(path.join(root, 'app/orders/new/page.tsx'), 'utf8');
  const start = source.indexOf('async function save(){');
  const end = source.indexOf('\nif(!canCreate)return', start);
  assert.ok(start > 0 && end > start);
  const script = ts.transpileModule(source.slice(start, end) + '\nsave();', {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
  }).outputText;
  await vm.runInNewContext(script, {
    ...options, canCreate: true, setError: value => errors.push(value), deliveryMethod: 'onway', delivery: '6.00',
    customer: {name: 'Test', phone: '555000000', cityId: 1, city: 'თბილისი', address: 'Test address', comment: ''},
    items: [{product: {id: 'p', name: 'Test', weight_kg: catalogWeight}, variant: null, quantity: 1, price: 50, weight: 1}],
    paymentType: 'cod', packageWeight: 1, subtotal: 50, discount: '', total: 56,
    createClient: () => client, router: {push: value => navigations.push(value)},
    fetch: () => {throw Error('Saving a Nexo order must not call a quote or shipment endpoint');},
  });
  assert.ok(errors.every(value => value === ''));
  assert.equal(writes[0].table, 'orders');
  assert.equal(writes[0].value.delivery_fee, 6);
  assert.equal(writes[0].value.total, 56);
  assert.equal(navigations[0], '/orders/new-order');
}

(async () => {
  assert.equal(weights.quoteTotalWeight([item(1)]), 1);
  assert.equal(weights.quoteTotalWeight([item(0.5), item(0.7), item(1.2)]), 2.4);
  assert.equal(weights.quoteTotalWeight([item(0.5, 3)]), 1.5);
  assert.equal(weights.quoteTotalWeight([item(0.5, 2), item(1.2)]), 2.2);
  assert.equal(weights.quoteTotalWeight([item(2, 1, {weight_kg: 0.5})]), 0.5);
  for (const invalid of [null, undefined, 0, -1, '', 'bad', Infinity]) {
    assert.equal(weights.quoteTotalWeight([item(2, 1, {weight_kg: invalid})]), 2);
    assert.equal(weights.quoteTotalWeight([item(invalid)]), null);
  }
  assert.equal(weights.quoteTotalWeight([]), null);
  assert.equal(weights.quoteTotalWeight([item(1, NaN)]), null);

  let r = await server();
  assert.equal(r.result.status, 200);
  assert.equal(r.result.body.shipping_amount, 5.5);
  assert.equal(Object.keys(r.result.body).length, 1);
  assert.deepEqual(JSON.parse(r.calls[1].init.body), {from_city_id: 1, to_city_id: 2, weight: 2.2});
  assert.equal(r.calls[1].init.headers.Authorization, 'Bearer test-only-secret');
  for (const [config, status, count] of [
    [{noAuth: true}, 401, 0], [{role: 'manager'}, 403, 0], [{active: false}, 403, 0],
    [{input: {weight: 0}}, 400, 0], [{input: {weight: '1'}}, 400, 0],
    [{input: {to_city_id: 999}}, 400, 1], [{httpError: true}, 502, 2],
    [{reply: {shipping_amount: 'invalid'}}, 502, 2], [{reply: {price: 5.5}}, 502, 2],
    [{reply: {shipping_amount: '-1'}}, 502, 2],
  ]) {r = await server(config); assert.equal(r.result.status, status); assert.equal(r.calls.length, count);}

  let h = hookHarness(); h.render();
  let pending = h.flush(); await tick();
  assert.deepEqual(JSON.parse(h.requests[0].init.body), {to_city_id: 1, weight: 1});
  respond(h.requests[0], '5.5'); await pending;
  assert.equal(h.render().price, 5.5); assert.equal(h.delivery, '5.50');
  h.manual('6.00'); h.render(); assert.equal(h.delivery, '6.00'); assert.equal(h.pending, 0);
  assert.equal(Number(h.delivery), 6); // The form saves Number(delivery || 0).

  h.render({weight: 2, itemKey: 'b'}); pending = h.flush(); await tick();
  respond(h.requests[1], null, false); await pending;
  assert.equal(h.delivery, '6.00'); assert.ok(h.render({weight: 2, itemKey: 'b'}).error);
  for (const changes of [{enabled: false}, {weight: null}, {destination: null}]) {
    const blocked = hookHarness(); blocked.render(changes); assert.equal(blocked.pending, 0); assert.equal(blocked.requests.length, 0);
  }
  h = hookHarness(); h.render(); const old = h.flush(); await tick();
  h.render({weight: 3, itemKey: 'c'}); const fresh = h.flush(); await tick();
  assert.equal(h.requests[0].init.signal.aborted, true);
  respond(h.requests[1], '7.5'); await fresh;
  respond(h.requests[0], '5.5'); await old; assert.equal(h.delivery, '7.50');
  h = hookHarness(); h.render(); h.render({itemKey: 'new'}); assert.equal(h.pending, 1); assert.equal(h.requests.length, 0);
  await verifyManualSave(1);
  await verifyManualSave(null); // Missing catalog weight suppresses quoting, not existing creation.
  console.log('PASS: quote weights, proxy whitelist, auth/roles, real response field, manual override, failures, debounce and stale-response protection.');
})().catch(error => {console.error(error); process.exitCode = 1;});
