'use strict';
// The nearby-loot detector's sources beyond bodies and plain piles (docs/nearby-loot.md, 1.27.0): stuck arrows and the
// loose kinds another pass draws, an instance's reward lying on the floor, a searched chest's open find, an item thrown
// by Physical Items away from its body - and the open-ground geometry that hillsides and cliffs need.
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { canReach, createSession, dungeonSources, sources, groundPile, pileShape } = require('../src/mod/page/dfo_loot.js');
const native = { skip: !process.env.DFO_UPSTREAM_DIR };
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
async function world(height) {
  const { pathToFileURL } = require('node:url');
  const { Collider } = await import(pathToFileURL(path.join(process.env.DFO_UPSTREAM_DIR, 'src/player/collider.js')).href);
  return new Collider(height);
}
const wall = (c, key, x, low = -1, high = 4, z0 = -3, z1 = 3) =>
  c.addMesh(key, new Float32Array([x, low, z0, x, high, z0, x, high, z1, x, low, z1]), new Uint16Array([0, 1, 2, 0, 2, 3]), identity);
// A terrain of its own: the bare ground sampled by heightAt, no meshes (raycast) at all.
const terrain = height => ({ raycast: () => Infinity, heightAt: (x, z) => height(x, z) });
// A vertical wall at x = `at`, struck by a ray going +x below `top`.
const planeAt = (at, top = Infinity) => (o, dir, max) => {
  if (!(dir[0] > 0) || o[0] > at) return Infinity;
  const d = (at - o[0]) / dir[0];
  return d <= max && o[1] + dir[1] * d <= top ? d : Infinity;
};
const transfer = { planTake: it => ({ ok: true, amount: it.stackCount ?? 1 }),
  applyTransfer(it, plan, list, bag) {
    if (plan.amount < (it.stackCount ?? 1)) { it.stackCount -= plan.amount; bag.push({ ...it, stackCount: plan.amount }); }
    else { list.splice(list.indexOf(it), 1); bag.push(it); }
  } };

test('ground piles: stuck arrows, sunken caches and a hideout\'s spill are offered; remains and hidden lists never', () => {
  const it = [{ name: 'Arrow' }];
  for (const p of [{ items: it }, { owner: 'stuckArrow', drawn: false, items: it }, { owner: 'deepWaters', drawn: false, items: it }, { owner: 'lw-hideout', items: it }])
    assert.equal(groundPile(p), true, JSON.stringify(p));
  for (const p of [{ owner: 'wild', items: it }, { wildBody: 'peer', owner: 'wild', drawn: false, items: it }, { wild: { mine: true }, items: it },
    { owner: 'legacy', items: it }, { owner: 'coffer', items: it }, { drawn: false, items: it }, { owner: 'lw-hideout', drawn: false, items: it },
    { owner: 'stuckArrow', drawn: false, inactive: true, items: it }, { dead: true, items: it }, null])
    assert.equal(groundPile(p), false, JSON.stringify(p));
  assert.deepEqual(pileShape({ owner: 'stuckArrow', stuckDir: [1, 0, 0] }), { dir: [1, 0, 0], lift: 0.3 });
  assert.equal(pileShape({ owner: 'stuckArrow' }), null);assert.equal(pileShape({ items: it }), null);
});

test('open ground: a hillside or a cliff foot is limited by the sphere and sight, a bridge keeps the storey limit', () => {
  const up = terrain(x => x * 0.3), down = terrain(x => -x * 0.3);
  assert.equal(canReach([0, 0, 0], [12, 3.6, 0], up), true, 'uphill, 3.6 m over the feet');
  assert.equal(canReach([0, 0, 0], [12, -3.6, 0], down), true, 'downhill');
  const crest = terrain(x => (x < 6 ? x : 12 - x) * 0.6);
  assert.equal(canReach([0, 0, 0], [12, 0, 0], crest), false, 'a crest between hides the whole pile');
  const flat = terrain(() => 0);
  assert.equal(canReach([0, 3, 0], [6, 0, 0], flat), false, 'standing on a bridge or a wall, another level stays out');
  assert.equal(canReach([0, 0, 0], [6, 3, 0], flat), false, 'loot on a structure over the ground keeps the storey limit');
  assert.equal(canReach([0, 0, 0], [6, 0.5, 0], terrain(x => (x > 5.4 ? 0.62 : 0))), true, 'a pile whose foot sits under the sampled ground is still seen');
});

test('real collider: hillsides and a cliff\'s foot; a ridge still occludes', native, async () => {
  const hill = await world(x => x * 0.3);
  assert.equal(canReach([0, 0, 0], [12, 3.6, 0], hill), true);
  const valley = await world(x => -x * 0.3);
  assert.equal(canReach([0, 0, 0], [12, -3.6, 0], valley), true);
  const cliff = await world(x => (x >= 6 ? 5 : 0));
  assert.equal(canReach([0, 0, 0], [8, 5, 0], cliff), false, 'from the foot, a body back from the edge is out of sight');
  assert.equal(canReach([0, 0, 0], [4, 0, 0], cliff), true, 'what fell to the foot is in reach');
  const ridge = await world(x => (x > 3 && x < 5 ? 3 : 0));
  assert.equal(canReach([0, 0, 0], [8, 0, 0], ridge), false);
});

test('a stuck shaft is reached where it stands out of the wall; a wall between hides it', () => {
  const pile = { owner: 'stuckArrow', drawn: false, pos: [5, 1.2, 0], stuckDir: [1, 0, 0], items: [{ name: 'Arrow' }] };
  const struck = { raycast: planeAt(5) };
  assert.equal(canReach([0, 0, 0], pile.pos, struck, [0, 1.6, 0], pileShape(pile)), true);
  const between = { raycast: (o, d, m) => Math.min(planeAt(3)(o, d, m), planeAt(5)(o, d, m)) };
  assert.equal(canReach([0, 0, 0], pile.pos, between, [0, 1.6, 0], pileShape(pile)), false);
  const high = { ...pile, pos: [5, 2.3, 0] };
  assert.equal(canReach([0, 0, 0], high.pos, struck, [0, 1.6, 0], pileShape(high)), false, 'a shaft over the next storey stays out indoors');
});

test('real collider: a shaft in a wall at eye height, and the same behind a partition', native, async () => {
  const c = await world(() => -Infinity);
  c.addMesh('floor', new Float32Array([-2, 0, -3, 9, 0, -3, 9, 0, 3, -2, 0, 3]), new Uint16Array([0, 1, 2, 0, 2, 3]), identity);
  wall(c, 'struck', 5);
  const shape = { dir: [1, 0, 0], lift: 0.3 };
  assert.equal(canReach([0, 0, 0], [5, 1.2, 0], c, [0, 1.6, 0], shape), true);
  wall(c, 'partition', 3);
  assert.equal(canReach([0, 0, 0], [5, 1.2, 0], c, [0, 1.6, 0], shape), false);
});

test('Physical Items: a body up a ledge is out of reach, the item thrown down to the player is listed and taken through the body\'s door', () => {
  const fell = { name: 'Fell', stackCount: 1 }, stayed = { name: 'Stayed', stackCount: 1 }, body = [fell, stayed], visits = [];
  const pool = { lootTargets: () => [{ key: 'foeCorpse:1', pos: [3, 6, 0] }], hoverContents: () => body,
    takeLoot: (key, _say, visit) => { visits.push(key); return visit({ items: () => body }); } };
  const drops = { _piles: [], releaseEmptied() {}, physical: { state: () => [{ kind: 'corpse', item: fell, pos: [2, 0, 0.4] }, { kind: 'corpse', item: stayed, pos: [3, 6, 0.5] }] } };
  const entity = { items: [] }, open = { raycast: () => Infinity };
  const host = { entity, feet: () => [0, 0, 0], eye: () => [0, 1.6, 0], collider: () => open, pools: () => [pool], dropped: () => drops, say() {} };
  const loot = createSession(host, { tools: () => transfer });
  assert.deepEqual(loot.items(), [fell], 'only what lies at the player\'s level');
  assert.equal(loot.commit('take', fell, 1), true);
  assert.deepEqual(visits, ['foeCorpse:1']);assert.deepEqual(body, [stayed]);assert.deepEqual(entity.items, [fell]);
  assert.equal(loot.commit('take', stayed, 1), false, 'the item still up the ledge is not taken from below');
  assert.deepEqual(loot.items(), []);loot.closed();
});

test('instance rewards: each resting item is listed and taken by the pool\'s own press, never copied; gold stays for the purse', () => {
  const sword = { name: 'Reward sword', stackCount: 1 }, gem = { name: 'Reward gem', stackCount: 1 }, picked = [];
  const floor = new Map([['spoil:0', sword], ['spoil:2', gem]]);
  const box = x => ({ min: [x - 0.45, 0, -0.45], max: [x + 0.45, 0.5, 0.45] });
  globalThis.__dfoLootSpoils = {
    targets: () => [...floor.keys()].map(key => ({ key, aabb: box(key === 'spoil:0' ? 2 : 20) })).concat([{ key: 'spoilGold:1', aabb: box(3) }]),
    contents: key => (floor.has(key) ? [floor.get(key)] : null),
    pick: key => { picked.push(key); return floor.delete(key); },
  };
  try {
    const entity = { items: [] }, flat = { raycast: () => Infinity };
    const host = { entity, feet: () => [0, 0, 0], eye: () => [0, 1.6, 0], collider: () => flat, pools: () => [], dropped: () => null, say() {} };
    const noCopy = { planTake: () => assert.fail('a reward is pressed, not planned from a list'), applyTransfer: () => assert.fail('never copied out of the pool') };
    const loot = createSession(host, { tools: () => noCopy });
    assert.deepEqual(loot.items(), [sword], 'the piece 20 m away and the gold are not listed');
    assert.deepEqual(loot.takeAll(), { taken: 1, failed: 0, refusal: null });
    assert.deepEqual(picked, ['spoil:0']);assert.deepEqual(loot.items(), []);assert.deepEqual(entity.items, [], 'the pool\'s press fills the pack');
    // The same pool from a dungeon host (the Sky-Ketch's deck and the Hour are dungeon contexts).
    floor.set('spoil:0', sword);
    const api = { lootTargets: () => [], lootContents: () => null, takeLoot: () => 0 };
    assert.deepEqual(dungeonSources(api, { _piles: [], pileFor: () => null }).map(s => s.key).sort(), ['spoil:0', 'spoil:2']);
    assert.deepEqual(sources({ pools: () => [] }).map(s => s.key).sort(), ['spoil:0', 'spoil:2']);
    loot.closed();
  } finally { delete globalThis.__dfoLootSpoils; }
  assert.deepEqual(sources({ pools: () => [] }), [], 'no pool, no reward sources');
});

test('searched chests: only a find open in its cooling search is listed; its own mesh does not hide it', () => {
  const coin = { name: 'Gold', stackCount: 5 }, ring = { name: 'Ring', stackCount: 1 }, find = [coin, ring], visits = [];
  const aabb = { min: [2, 0, -0.5], max: [3, 0.8, 0.5] };
  let cooling = true;
  const api = {
    lootTargets: () => [{ key: 'search:2', aabb, surface: true }], lootContents: () => null,
    finds: () => (cooling ? [{ index: 2, items: find, aabb }] : []),
    takeLoot(key, mode, keys, visit) { visits.push(key); return visit(find); },
  };
  // The chest is a solid box in the collider: a ray meets its side before its middle.
  const chest = { raycast: planeAt(2, 0.8) }, entity = { items: [] };
  const host = { entity, feet: () => [0, 0, 0], eye: () => [0, 1.6, 0], collider: () => chest, sources: () => dungeonSources(api, { _piles: [], pileFor: () => null }) };
  const loot = createSession(host, { tools: () => transfer });
  assert.deepEqual(loot.items(), [coin, ring]);
  assert.equal(loot.commit('take', ring, 1), true);assert.deepEqual(visits, ['srch:2'], 'opened as the press opens it, never searched');
  assert.deepEqual(find, [coin]);
  cooling = false;assert.deepEqual(loot.items(), [], 'cooled down: the next press would search anew, so nothing is offered');
  assert.equal(loot.commit('take', coin, 5), false);assert.deepEqual(visits, ['srch:2']);
  const wallBefore = { raycast: (o, d, m) => Math.min(planeAt(1)(o, d, m), planeAt(2, 0.8)(o, d, m)) };
  cooling = true;
  assert.equal(canReach([0, 0, 0], [2.5, 0, 0], wallBefore, [0, 1.6, 0], { height: 0.8, box: aabb, solid: true }), false, 'a wall before the chest still hides it');
  loot.closed();
});

test('published hooks: the chest finds and the reward pool read the very declarations the native code reads', {
  skip: !process.env.DFO_BUILD_DIR || !process.env.DFO_UPSTREAM_DIR,
}, () => {
  const acorn = require(process.env.DFO_ACORN_MODULE || 'acorn');
  const { analyze } = require(path.join(process.env.DFO_UPSTREAM_DIR, 'node_modules/eslint-scope'));
  const { transformNearby } = require('../src/mod/nearby-loot-transform.cjs');
  const dir = path.join(process.env.DFO_BUILD_DIR, 'assets'), seen = [];
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js') && !/Worker-/.test(f))) {
    const src = fs.readFileSync(path.join(dir, file), 'utf8'), log = [];
    const out = transformNearby('assets/' + file, src, log);
    const mine = log.filter(([id]) => id === 'loot.finds' || id === 'loot.spoils');
    if (!mine.length) continue;
    for (const [id, ok] of mine) { assert.equal(ok, 1, `${file}: ${id}`); seen.push(id); }
    assert.equal(transformNearby('assets/' + file, out, []), out, 'applied once');
    const ast = acorn.parse(out, { ecmaVersion: 'latest', sourceType: 'module', ranges: true });
    const scopes = analyze(ast, { ecmaVersion: 2024, sourceType: 'module' }).scopes;
    // Every name an injected reader uses resolves to the declaration the native reader of the same thing uses.
    const resolve = (from, name) => {
      let best = null;
      for (const s of scopes) for (const r of s.references) {
        const at = r.identifier.range[0];
        if (r.identifier.name === name && at >= from && (!best || at < best.identifier.range[0])) best = r;
      }
      return best?.resolved ?? null;
    };
    const pairs = [];
    if (mine.some(([id]) => id === 'loot.finds')) {
      const reader = /finds:\(\)=>([\w$]+)\.map\(\(_s,_i\)=>_s&&_s\.items\.length>0&&([\w$]+)\(([\w$]+)\(([\w$]+)\(\),_s\.key\),([\w$]+)\(\)\)>0/.exec(out);
      assert.ok(reader, 'finds reader');
      const nativeAt = out.search(/function [\w$]+\([\w$]+,[\w$]+=`grab`\)\{let [\w$]+=[\w$]+\[[\w$]+\];if\(![\w$]+\)return 0;/);
      for (const name of reader.slice(1)) pairs.push([reader.index, nativeAt, name]);
    }
    if (mine.some(([id]) => id === 'loot.spoils')) {
      const reader = /__dfoLootSpoils=\{targets:\(\)=>([\w$]+)\(\)/.exec(out);
      pairs.push([reader.index, out.indexOf('takeSpoil:'), reader[1]]);
    }
    for (const [injected, nativeAt, name] of pairs) {
      const a = resolve(injected, name), b = resolve(nativeAt, name);
      assert.ok(a && a === b, `${file}: ${name} names the native declaration`);
    }
  }
  assert.deepEqual(seen.sort(), ['loot.finds', 'loot.spoils']);
});

test('the real reward pool through the very binding the hook injects: every resting item listed and pressed once', native, async () => {
  const { pathToFileURL } = require('node:url'), vm = require('node:vm');
  const load = f => import(pathToFileURL(path.join(process.env.DFO_UPSTREAM_DIR, f)).href);
  await load('test/modsOff.js').catch(() => {});
  const { createSpoilsPool } = await load('src/scenes/spoilsPool.js');
  let t = 0; const pack = [];
  const ground = (from, dir, len) => (dir[1] < 0 && from[1] / -dir[1] <= len ? { dist: from[1] / -dir[1], normal: [0, 1, 0] } : null);
  const pool = createSpoilsPool({ ray: ground, now: () => t, take: piece => pack.push(piece), wall: () => 1e12 });
  pool.spew({ day: 1, seed: 12345, level: 20, at: [0, 1, 0], bearing: 0 });
  for (let i = 0; i < 600; i++) { t += 16; pool.frame(); }
  // The world host's own reader (world.js: spoilTargets/spoilContents/takeSpoil over floorPool), hooked as in the game.
  const { transformNearby } = require('../src/mod/nearby-loot-transform.cjs');
  const native = 'var host={spoilTargets:()=>oR()?.targets()??null,spoilName:e=>oR()?.nameOf(e)??null,spoilContents:e=>oR()?.contentsOf(e)??null,takeSpoil:e=>!!oR()?.pick(e)};';
  const log = [], hooked = transformNearby('assets/world-test.js', native, log);
  assert.deepEqual(log.filter(([id]) => id.startsWith('loot.spoils')), [['loot.spoils', 1]]);
  const context = { globalThis: {}, oR: () => pool };
  vm.runInNewContext(hooked, context);
  globalThis.__dfoLootSpoils = context.globalThis.__dfoLootSpoils;
  try {
    const items = pool.state().pieces.filter(p => p.kind === 'item').length;
    assert.ok(items >= 3, `${items} resting items`);
    const entity = { items: [] }, flat = { raycast: () => Infinity };
    const host = { entity, feet: () => [0, 0, 0], eye: () => [0, 1.6, 0], collider: () => flat, pools: () => [], dropped: () => null, say() {} };
    const loot = createSession(host, { tools: () => ({}) });
    const listed = [...loot.items()];
    assert.equal(listed.length, items, 'every resting item, never the gold');
    assert.deepEqual(loot.takeAll(), { taken: items, failed: 0, refusal: null });
    assert.equal(pack.length, items, 'each pressed once into the pack');
    assert.deepEqual(new Set(pack.map(p => p.item)), new Set(listed), 'the very items listed - the pool\'s own, never copies');
    assert.deepEqual(loot.items(), []);
    assert.equal(pool.state().pieces.find(p => p.kind === 'gold').taken, false, 'the gold waits for the purse');
    loot.closed();
  } finally { delete globalThis.__dfoLootSpoils; }
});
