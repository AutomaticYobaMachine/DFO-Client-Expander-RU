'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const { createInventoryTraceStore, MAX_BATCH, MAX_FILE } = require('../src/mod/inventory-trace-store.cjs');
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
  assert.equal(createInventoryTraceStore(null).write(JSON.stringify([event()])), 503);
});

test('trace script is injected before native modules only when inventory is on', () => {
  const html = '<html><head></head><body><script type="module" src="assets/game.js"></script></body></html>';
  const active = injectPage(html, './', { inventory: true, nearbyLoot: false, pageCfg: {} });
  assert.ok(active.indexOf('dfo_inventory_trace.js') < active.indexOf('dfo_pack.js'));
  assert.ok(active.indexOf('dfo_inventory_trace.js') < active.indexOf('type="module"'));
  assert.ok(!injectPage(html, './', { inventory: false, nearbyLoot: false, pageCfg: {} }).includes('dfo_inventory_trace'));
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
  await api.flush();
  const observed = posts.flatMap(p => JSON.parse(p.body));
  assert.ok(observed.some(x => x.type === 'trace.started'));
  assert.ok(observed.some(x => x.type === 'ui.click'));
  assert.ok(observed.every(x => x.session && x.seq && Number.isFinite(x.at)));
});
