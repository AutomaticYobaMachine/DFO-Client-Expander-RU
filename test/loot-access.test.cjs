'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { canReach, createSession } = require('../src/mod/page/dfo_loot.js');
const { flatCollider } = require('./helpers/loot-geometry.cjs');
const native = { skip: !process.env.DFO_UPSTREAM_DIR };
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
async function world(height = () => 0) {
  const { pathToFileURL } = require('node:url'), path = require('node:path');
  const { Collider } = await import(pathToFileURL(path.join(process.env.DFO_UPSTREAM_DIR, 'src/player/collider.js')).href);
  return new Collider(height);
}
const quad = (c, key, points, move = null) => c.addMesh(key, new Float32Array(points.flat()), new Uint16Array([0, 1, 2, 0, 2, 3]), identity, move);
const wall = (c, key, x, low = -1, high = 3, z0 = -3, z1 = 3, move = null) => quad(c, key, [[x, low, z0], [x, high, z0], [x, high, z1], [x, low, z1]], move);

test('access fails closed for missing/invalid geometry and excludes vertical floors within the 15 m sphere', () => {
  assert.equal(canReach([0, 0, 0], [0, 0, 15], flatCollider), true);
  for (const target of [[15.001, 0, 0], [0, 3, 0], [1, -3, 1], [0, 1.26, 0], [0, NaN, 0], [0, 0]]) assert.equal(canReach([0, 0, 0], target, flatCollider), false);
  for (const c of [null, {}, { raycast: () => NaN }, { raycast() { throw new Error('unloaded'); } }]) assert.equal(canReach([0, 0, 0], [3, 0, 0], c), false);
});

test('real game collider: walls and closed moving doors block loot; the same door opened restores access', native, async () => {
  const c = await world(), shift = [0, 0, 0];
  assert.equal(canReach([0, 0, 0], [5, 0, 0], c), true, 'outdoor terrain is support even without a floor mesh');
  wall(c, 'door', 2, -1, 3, -1, 1, () => shift);
  assert.equal(canReach([0, 0, 0], [5, 0, 0], c), false);
  shift[2] = 5;
  assert.equal(canReach([0, 0, 0], [5, 0, 0], c), true);
  wall(c, 'wall', 4);
  assert.equal(canReach([0, 0, 0], [5, 0, 0], c), false);
});

test('real game collider: an eye ray through a window or a narrow slit does not grant walking access', native, async () => {
  const window = await world(); wall(window, 'sill', 2, -1, 1.1);
  assert.equal(window.raycast([0, 1.6, 0], [1, 0, 0], 5), Infinity);
  assert.equal(canReach([0, 0, 0], [5, 0, 0], window), false);
  const slit = await world(); wall(slit, 'left', 2, -1, 3, -3, -0.2); wall(slit, 'right', 2, -1, 3, 0.2, 3);
  assert.equal(slit.raycast([0, 1, 0], [1, 0, 0], 5), Infinity);
  assert.equal(canReach([0, 0, 0], [5, 0, 0], slit), false);
  const door = await world(); wall(door, 'left', 2, -1, 3, -3, -0.65); wall(door, 'right', 2, -1, 3, 0.65, 3);
  assert.equal(canReach([0, 0, 0], [5, 0, 0], door), true);
});

test('real game collider: pits, low ceilings and separate storeys are blocked; supported slopes and small steps work', native, async () => {
  const pit = await world(x => x > 2 && x < 4 ? -10 : 0);
  assert.equal(canReach([0, 0, 0], [6, 0, 0], pit), false);
  const slope = await world(x => x * 0.1);
  assert.equal(canReach([0, 0, 0], [6, 0.6, 0], slope), true);
  const step = await world(x => x >= 2 ? 0.4 : 0);
  assert.equal(canReach([0, 0, 0], [5, 0.4, 0], step), true);
  const cliff = await world(x => x >= 2 ? 0.8 : 0);
  assert.equal(canReach([0, 0, 0], [5, 0.8, 0], cliff), false);
  const room = await world(() => -Infinity);
  quad(room, 'floor', [[-2, 0, -2], [7, 0, -2], [7, 0, 2], [-2, 0, 2]]);
  assert.equal(canReach([0, 0, 0], [5, 0, 0], room), true, 'native indoor mesh floor');
  quad(room, 'upper-storey', [[-2, 3, -2], [7, 3, -2], [7, 3, 2], [-2, 3, 2]]);
  assert.equal(canReach([0, 0, 0], [5, 3, 0], room), false);
  quad(room, 'low-ceiling', [[1, 1.5, -2], [4, 1.5, -2], [4, 1.5, 2], [1, 1.5, 2]]);
  assert.equal(canReach([0, 0, 0], [5, 0, 0], room), false);
});

test('live access is rechecked before AND inside native transfers; stale rows, bulk and auto-loot cannot bypass a closing door', () => {
  let shut = false, visits = 0, shutOnVisit = false;
  const a = { name: 'A', stackCount: 1 }, b = { name: 'B', stackCount: 1 }, pile = [a, b], entity = { items: [] };
  const collider = { ...flatCollider, raycast: (_o, dir) => shut && Math.abs(dir[0]) > 0.5 ? 0.2 : Infinity };
  const host = { entity, feet: () => [0, 0, 0], collider: () => collider, sources: () => [{
    key: 'loot:0', pos: [3, 0, 0], items: () => pile, visit(fn) { visits++; if (shutOnVisit) shut = true; return fn(pile); },
  }] };
  const tools = { planTake: () => ({ ok: true, amount: 1 }), applyTransfer(it, _p, from, to) { from.splice(from.indexOf(it), 1); to.push(it); } };
  const loot = createSession(host, { tools: () => tools }); assert.deepEqual(loot.items(), [a, b]);
  shut = true; assert.equal(loot.commit('take', a, 1), false); assert.equal(visits, 0);
  assert.equal(loot.autoLoot({ enabled: true, items: ['type::-1'] }).taken, 0); assert.deepEqual(entity.items, []);
  shut = false; shutOnVisit = true; assert.equal(loot.commit('take', a, 1), false); assert.equal(visits, 1); assert.deepEqual(pile, [a, b]);
  shut = false; shutOnVisit = false; assert.equal(loot.commit('take', a, 1), true);
  shut = true; assert.equal(loot.commit('take', b, 1), false); assert.deepEqual(entity.items, [a]); assert.deepEqual(pile, [b]);
});

test('geometry is cached per source, independent of the number of visible item stacks', () => {
  let rays = 0; const collider = { ...flatCollider, raycast() { rays++; return Infinity; } };
  const items = Array.from({ length: 1500 }, (_, i) => ({ name: String(i) }));
  const loot = createSession({ entity: {}, feet: () => [0, 0, 0], collider: () => collider, sources: () => [{ key: 'loot:0', pos: [10, 0, 0], items: () => items }] });
  assert.equal(loot.items().length, 1500); const scanned = rays;
  loot.items(); loot.rawItems(); assert.equal(rays, scanned); assert.ok(scanned < 40, `${scanned} rays for a 10 m flat corridor`);
});
