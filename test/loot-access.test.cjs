'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { canReach, createSession, distance } = require('../src/mod/page/dfo_loot.js');
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

test('native typed coordinates work for terrain and source positions without changing either vector', () => {
  for (const Vector of [Array, Float32Array, Float64Array]) for (const Target of [Array, Float32Array, Float64Array]) {
    const feet = Vector.from([100, 12, -20]), target = Target.from([109, 12, -8]);
    const collider = { ...flatCollider, surfaceHit: p => ({ dist: p[1] - 12, normal: [0, 1, 0] }) };
    assert.equal(distance(feet, target), 15);
    assert.equal(canReach(feet, target, collider), true, `${Vector.name} feet / ${Target.name} target`);
    assert.deepEqual([...feet], [100, 12, -20]);assert.deepEqual([...target], [109, 12, -8]);
    assert.equal(canReach(feet, Target.from([109, 15, -8]), collider), false, 'typed coordinates cannot bypass the floor limit');
  }
  for (const invalid of [new Float32Array([NaN, 0, 0]), new Float64Array([0, Infinity, 0]), new Float32Array(2), new DataView(new ArrayBuffer(12)), [0, , 0], { 0: 0, 1: 0, 2: 0, length: 3 }, '000']) {
    assert.equal(canReach(invalid, [0, 0, 0], flatCollider), false);
    assert.equal(canReach([0, 0, 0], invalid, flatCollider), false);
    assert.equal(distance(invalid, [0, 0, 0]), Infinity);
  }
});

test('real player motor: the street loot list and native transfers work at terrain height and after movement', native, async () => {
  const { pathToFileURL } = require('node:url'), path = require('node:path');
  const load = file => import(pathToFileURL(path.join(process.env.DFO_UPSTREAM_DIR, file)).href);
  const { PlayerMotor } = await load('src/player/motor.js');
  const { corpseLootTargets } = await load('src/scenes/corpseMarker.js');
  const { planTake, applyTransfer } = await load('src/systems/item/itemTransfer.js');
  const c = await world(() => 12), player = new PlayerMotor(c);player.pinFeet(100, 12, -20);
  assert.ok(player.pos instanceof Float32Array);
  const item = { name: 'Gold pieces', templateIndex: 276, group: 'Currency', stackCount: 7 };
  const body = { id: 9, feet: new Float32Array([105, 12, -20]), items: [item] }, entity = { items: [], goldPieces: 0, stats: { strength: 50, endurance: 50 } };
  const pool = {
    lootTargets: () => corpseLootTargets([body], 'foeCorpse', { isCorpse: () => true, feetOf: e => e.feet, idOf: e => e.id }),
    hoverContents: () => body.items,
    takeLoot: (_key, _say, visit) => visit({ items: () => body.items }),
  };
  const loot = createSession({ entity, feet: () => player.pos, collider: () => c, pools: () => [pool] }, { tools: () => ({ planTake, applyTransfer }) });
  assert.deepEqual(loot.items(), [item], 'live motor feet must not hide outdoor bodies');
  player.pinFeet(85, 12, -20);assert.deepEqual(loot.items(), [], 'the same typed buffer moved outside 15 m');
  player.pinFeet(100, 12, -20);assert.deepEqual(loot.items(), [item]);
  assert.equal(loot.commit('take', item, 7), true);assert.equal(entity.goldPieces, 7);assert.deepEqual(body.items, []);
  assert.equal(loot.commit('take', item, 7), false);loot.closed();
});

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
