'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const { createInventoryTraceStore, traceDirectory, MAX_BATCH, MAX_FILE } = require('../src/mod/inventory-trace-store.cjs');
const { injectPage } = require('../src/mod/transforms.cjs');

const event = (type = 'view.render.end', seq = 1, data = { completed: true }) =>
  ({ session: 'i-test', seq, at: Date.now(), type, data });

test('inventory diagnostic batches persist as bounded NDJSON, with restart-safe rotation', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfo-inventory-trace-'));
  try {
    const recorder = createInventoryTraceStore(dir);
    assert.equal(recorder.write(JSON.stringify([event()])), 204);
    const first = JSON.parse(fs.readFileSync(recorder.file, 'utf8').trim());
    assert.equal(first.type, 'view.render.end');
    assert.equal(first.data.completed, true);
    assert.equal(first.session, 'i-test');
    assert.equal(typeof first.received, 'string');
    // Rotation protects the disk even if the user reproduces a fault repeatedly.
    fs.writeFileSync(recorder.file, 'x'.repeat(MAX_FILE - 10));
    assert.equal(recorder.write(JSON.stringify([event('overlay.dispose', 2)])), 204);
    assert.ok(fs.statSync(recorder.previous).size > MAX_FILE - 100);
    assert.equal(JSON.parse(fs.readFileSync(recorder.file, 'utf8').trim()).type, 'overlay.dispose');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('trace endpoint rejects invalid, oversized and unstructured diagnostics', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfo-inventory-trace-bad-'));
  try {
    const r = createInventoryTraceStore(dir);
    assert.equal(r.write('invalid JSON'), 400);
    assert.equal(r.write(JSON.stringify([{ ...event(), type: '../outside' }])), 400);
    assert.equal(r.write(JSON.stringify([{ ...event(), data: ['array'] }])), 400);
    assert.equal(r.write(JSON.stringify(Array.from({ length: 129 }, (_, n) => event('ui.click', n)))), 400);
    assert.equal(r.write('x'.repeat(MAX_BATCH + 1)), 413);
    assert.equal(r.write(JSON.stringify([event('runtime.error', 3, { stack: 'x'.repeat(6000) })])), 413);
    assert.equal(fs.existsSync(r.file), false, 'rejected events never reach the file');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  assert.equal(traceDirectory('/tmp/profile', { APPDATA: 'C:/AppData/Roaming' }),
    path.join('C:/AppData/Roaming', 'DFO-Client-Expander-RU'));
});

test('trace script is injected before native modules only when inventory is on', () => {
  const html = '<html><head></head><body><script type="module" src="assets/game.js"></script></body></html>';
  const active = injectPage(html, './', { inventory: true, nearbyLoot: false, pageCfg: {} });
  assert.ok(active.indexOf('dfo_inventory_trace.js') < active.indexOf('dfo_pack.js'));
  assert.ok(active.indexOf('dfo_inventory_trace.js') < active.indexOf('type="module"'));
  assert.ok(!injectPage(html, './', { inventory: false, nearbyLoot: false, pageCfg: {} }).includes('dfo_inventory_trace'));
});

test('Electron dagger handler writes the trace locally and does not fall through to the game', async () => {
  const { wrap } = require('../src/mod/hook.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfo-inventory-trace-route-'));
  try {
    let forwarded = 0;
    const handler = wrap(async () => { forwarded++; return new Response('native'); },
      { app: { getPath: () => dir } });
    const url = 'dagger://game/dfo-mod/inventory-trace';
    const ok = await handler(new Request(url, { method: 'POST', body: JSON.stringify([event('overlay.dismiss')]) }));
    assert.equal(ok.status, 204);
    assert.equal(forwarded, 0);
    const records = fs.readFileSync(path.join(dir, 'DFO-Client-Expander-RU', 'dfo-mod-inventory-trace.ndjson'), 'utf8')
      .trim().split('\n').map(JSON.parse);
    assert.equal(records[0].type, 'bridge.ready', 'the renderer is not required for the trace file to exist');
    assert.ok(records.some(x => x.type === 'overlay.dismiss'));
    assert.equal((await handler(new Request(url))).status, 405);
    assert.equal((await handler(new Request(url, { method: 'POST', body: '{bad' }))).status, 400);
    assert.equal(forwarded, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('main process creates a trace without any inventory renderer, and serves fallback/status', async () => {
  const { wrap } = require('../src/mod/hook.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfo-inventory-trace-main-'));
  try {
    const handler = wrap(async () => new Response('<html><head></head><body><script type="module"></script></body></html>'),
      { app: { getPath: () => dir } });
    const file = path.join(dir, 'DFO-Client-Expander-RU', 'dfo-mod-inventory-trace.ndjson');
    assert.ok(fs.existsSync(file), 'bootstrap file must already exist before HTML/JS/POST');
    const boot = JSON.parse(fs.readFileSync(file, 'utf8').trim());
    assert.equal(boot.type, 'bridge.ready');
    const base = 'dagger://game/dfo-mod/';
    let status = await (await handler(new Request(base + 'inventory-trace-status'))).json();
    assert.equal(status.exists, true);
    assert.equal(status.path, file);
    assert.ok(status.bytes > 0);
    const src = 'assets/game.js';
    const page = await (await handler(new Request('dagger://game/play/index.html'))).text();
    assert.ok(page.includes('dfo_inventory_trace.js'));
    const script = await handler(new Request(base + 'dfo_inventory_trace.js'));
    assert.equal(script.status, 200);
    assert.ok((await script.text()).includes('trace.started'));
    const eventString = encodeURIComponent(JSON.stringify(event('trace.started', 200)));
    const fallback = await handler(new Request(base + 'inventory-trace-fallback?event=' + eventString));
    assert.equal(fallback.status, 200);
    status = await (await handler(new Request(base + 'inventory-trace-status'))).json();
    assert.ok(status.recorded >= 4, 'main boot, page, script and fallback are in one trace');
    const events = fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse).map(x => x.type);
    for (const expected of ['bridge.ready','bridge.page','bridge.script.served','trace.started'])
      assert.ok(events.includes(expected), expected);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('renderer startup survives blocked POST and reaches real Electron GET fallback, with visible status', async () => {
  const { wrap } = require('../src/mod/hook.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfo-trace-e2e-'));
  try {
    const handler = wrap(async () => new Response('native'), { app: { getPath: () => dir } });
    const file = path.join(dir, 'DFO-Client-Expander-RU', 'dfo-mod-inventory-trace.ndjson');
    const labels = [];
    const doc = {
      readyState: 'complete',
      querySelectorAll() { return []; },
      addEventListener() {},
      body: { append(node) { labels.push(node); } },
      createElement() { return { style: {}, textContent: '', title: '' }; },
    };
    const sandbox = {
      document: doc,
      fetch: (url, init = {}) => {
        if (init.method === 'POST') return Promise.reject(new Error('POST unsupported by custom scheme'));
        return handler(new Request(new URL(url, 'dagger://game/play/index.html')));
      },
      setTimeout() {},
      addEventListener() {},
      console: { warn() {} },
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/mod/page/dfo_inventory_trace.js'),'utf8'), sandbox);
    await new Promise(resolve => setImmediate(resolve));
    const records = fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
    assert.ok(records.some(x => x.type === 'bridge.ready'), 'the Electron bootstrap must persist');
    assert.ok(records.some(x => x.type === 'trace.started'), 'GET fallback must deliver the renderer handshake');
    assert.equal(labels.length, 1, 'a visible diagnostic badge must be created');
    assert.match(labels[0].textContent, /GET OK/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('passive client tracer observes and flushes events without intercepting clicks', async () => {
  const handlers = new Map(), timers = [], posts = [];
  const document = {
    querySelectorAll() { return []; },
    addEventListener(type, fn) { handlers.set(type, fn); },
  };
  const sandbox = {
    document,
    fetch: async (_url, options) => { posts.push(options); return { ok: true, status: 204 }; },
    setTimeout: (fn) => { timers.push(fn); },
    addEventListener() {},
    console: { warn() {} },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/mod/page/dfo_inventory_trace.js'), 'utf8'), sandbox);
  const api = sandbox.__dfoInventoryTrace;
  assert.equal(typeof api?.record, 'function');
  const target = {
    tagName: 'BUTTON', classList: ['packtab'],
    disabled: false, getAttribute() { return null; },
    closest(selector) { return selector.includes('.pack-shell') ? this : this; },
  };
  const click = { target, button: 0, preventDefault() { throw Error('must not call'); },
    stopPropagation() { throw Error('must not call'); } };
  handlers.get('click')(click);
  assert.ok(api.tail().some(x => x.type === 'ui.click'));
  // Startup flush runs immediately; wait for its microtasks to settle before draining clicks.
  await new Promise(resolve => setImmediate(resolve));
  await api.flush();
  const observed = posts.flatMap(p => JSON.parse(p.body));
  assert.ok(observed.some(x => x.type === 'trace.started'));
  assert.ok(observed.some(x => x.type === 'ui.click'));
  assert.ok(observed.every(x => x.session && x.seq && Number.isFinite(x.at)));
});
