'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { guardRender, inventory } = require('../src/mod/inventory-transform.cjs');

// The user's real Electron trace recorded 46 .pack-shell nodes in one host.
// fpArm.preloadIcon() can invoke its subscribers synchronously when the
// async function takes a branch without await. This harness models exactly
// that nesting, including the outer render appending its shell on unwind.
function setup(iconKeys = 46) {
  const frames = [];
  const context = { requestAnimationFrame: (fn) => { frames.push(fn); } };
  context.document = { getElementById: (id) => id === 'enhanced-inventory' ? context.host : null };
  const base = [
    "const ready = new Set(); let paints = 0;",
    "const host = { isConnected: true, shells: [] };",
    "globalThis.host = host;",
    "function R() {",
    "  paints++; host.shells = [];",
    `  for (let i = 0; i < ${iconKeys}; i++) {`,
    "    if (!ready.has(i)) { ready.add(i); R(); }",
    "  }",
    "  host.shells.push('pack-shell');",
    "}",
    "globalThis.paint = () => R();",
    "globalThis.snapshot = () => ({ paints, shells: host.shells.length });",
  ].join('\n');
  vm.runInNewContext(guardRender(base, 'R'), context, { timeout: 1000 });
  return { context, frames };
}

test('46 synchronous icon notifications produce one shell, not 46 layered shells', () => {
  const { context, frames } = setup();
  context.paint();
  assert.equal(context.snapshot().shells, 1);
  assert.equal(context.snapshot().paints, 1);
  assert.equal(frames.length, 1, 'one deferred repaint for the whole icon burst');
  frames.shift()();
  assert.equal(context.snapshot().shells, 1);
  assert.equal(context.snapshot().paints, 2);
  assert.equal(frames.length, 0);
});

test('a queued icon repaint does not draw into an inventory host already closed', () => {
  const { context, frames } = setup(10);
  context.paint();
  context.host.isConnected = false;
  frames.shift()();
  assert.equal(context.snapshot().paints, 1, 'no redraw after host removal');
  assert.equal(frames.length, 0);
});

test('ordinary non-reentrant inventory actions still repaint synchronously', () => {
  const { context, frames } = setup(0);
  context.paint();
  assert.equal(context.snapshot().paints, 1);
  context.paint();
  assert.equal(context.snapshot().paints, 2);
  assert.equal(context.snapshot().shells, 1);
  assert.equal(frames.length, 0);
});

test('inventory transform attaches the guarded renderer to its actual minified render symbol', () => {
  assert.match(inventory.toString(), /guardRender\(out, render\)/);
});
