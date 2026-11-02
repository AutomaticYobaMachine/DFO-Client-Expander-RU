'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { transformAsset } = require('../src/mod/transforms.cjs');

// Evaluate the actual injected object from the published bundle. Keep the world's
// dependencies small, but use the original spawn ledger and clock conversion.
test('published world bridge reads live equipment, clock and spawn ledger and gates native travel', {
  skip: !process.env.DFO_UPSTREAM_DIR || !process.env.DFO_BUILD_DIR,
}, async () => {
  const upstream = path.resolve(process.env.DFO_UPSTREAM_DIR);
  const { parse } = require(path.join(upstream, 'node_modules/acorn'));
  const { analyze } = require(path.join(upstream, 'node_modules/eslint-scope'));
  const assets = path.join(process.env.DFO_BUILD_DIR, 'assets');
  const file = fs.readdirSync(assets).find(f => /^world-[^.]+\.js$/.test(f));
  assert.ok(file);
  const result = transformAsset('assets/' + file, fs.readFileSync(path.join(assets, file), 'utf8'), {
    ru: false, marks: false, nearbyLoot: false, dungeons: true,
  });
  assert.ok(result.log.some(([id, count]) => id === 'dungeon.world' && count === 1));
  const pending = [parse(result.text, { ecmaVersion: 'latest', sourceType: 'module' })], bridges = [];
  while (pending.length) {
    const node = pending.pop(); if (!node || typeof node !== 'object') continue;
    if (node.type === 'Property' && node.key.name === '__dfoWorld') bridges.push(node.value);
    for (const value of Object.values(node)) if (value && typeof value === 'object') {
      if (Array.isArray(value)) pending.push(...value); else pending.push(value);
    }
  }
  assert.equal(bridges.length, 1);
  const bridge = bridges[0], properties = new Map(bridge.properties.map(p => [p.key.name, p.value]));
  const context = { Date: { now: () => now } }, now = Date.UTC(2026, 10, 2, 12);
  const bind = (field, value) => {
    const node = properties.get(field); assert.ok(node, field);
    const ast = parse('(' + result.text.slice(node.start, node.end) + ')', { ecmaVersion: 'latest', ranges: true });
    const refs = [...new Set(analyze(ast, { ecmaVersion: 2024, sourceType: 'script' }).globalScope.through.map(r => r.identifier.name))];
    const free = refs.filter(name => !Object.hasOwn(context, name));
    assert.equal(free.length, 1, field + ': unexpected native dependencies'); context[free[0]] = value;
  };
  const load = file => import(pathToFileURL(path.join(upstream, file)).href);
  const { createSpawnLedger, spawnDeath } = await load('src/world/spawnedDungeons.js');
  const { sharedClassicMinutes, wallMsForClassicMinutes } = await load('src/net/wire.js');
  const player = { level: 20, stats: { luck: 65 } }, modes = { mode: 'exterior' }, view = { state: 'up' };
  const weapon = { material: 2 }, rig = { playerWeapon: { strikingWeapon: weapon } };
  bind('player', player); bind('modes', modes); bind('viewOpen', view);
  bind('serverNow', 5000); bind('wallTime', wallMsForClassicMinutes);
  bind('luck', (entity, key) => { assert.equal(entity, player); assert.equal(key, 'luck'); return entity.stats[key]; });
  bind('weapon', rig);
  const ledger = createSpawnLedger(); let clock = sharedClassicMinutes(now);
  const ifNode = properties.get('spawnRecord').body.body.find(n => n.type === 'IfStatement');
  const hasCall = ifNode.test.argument;
  context[hasCall.callee.object.name] = ledger;
  context[hasCall.arguments[1].callee.name] = () => clock;
  const journey = properties.get('travel').body.right, calls = []; let canGo = true;
  context[journey.consequent.callee.name] = key => { calls.push(['spawn', key]); return canGo; };
  context[journey.alternate.test.right.callee.name] = () => canGo;
  context[journey.alternate.consequent.callee.name] = summary => { calls.push(['place', summary]); return true; };
  const native = vm.runInNewContext('(' + result.text.slice(bridge.start, bridge.end) + ')', context);

  assert.equal(native.player(), player); assert.equal(native.modes(), modes);
  assert.equal(native.now(), now); assert.equal(native.serverNow(), now + 5000);
  assert.equal(native.wallTime(clock), wallMsForClassicMinutes(clock) - 5000);
  assert.equal(native.luck(player), 65); player.stats.luck = 80; assert.equal(native.luck(player), 80);
  assert.equal(native.weapon(), weapon); rig.playerWeapon.strikingWeapon = null; assert.equal(native.weapon(), null);
  const place = { key: 'spawn:54,32', px: 54, py: 32, loc: { spawned: true } };
  assert.equal(native.spawnRecord(place), null);
  ledger.note('54,32', clock); assert.equal(native.spawnRecord(place).seen, clock);
  ledger.clear('54,32', clock + 10); assert.equal(native.spawnRecord(place).cleared, clock + 10);
  clock = spawnDeath({ seen: clock, cleared: clock + 10 }) + 24 * 12 * 60 + 1;
  assert.equal(native.spawnRecord(place), null, 'a row from a previous spawn life is not reused');

  assert.equal(native.viewOpen(), true); assert.equal(native.travel(place), true);
  assert.deepEqual(calls.pop(), ['spawn', place.key]);
  const summary = { mapId: 12345 }, permanent = { key: 'place:12345', loc: {}, summary };
  assert.equal(native.travel(permanent), true); assert.deepEqual(calls.pop(), ['place', summary]);
  canGo = false; assert.equal(native.travel(permanent), false); assert.equal(calls.length, 0);
  canGo = true;
  for (const state of ['falling', 'off']) {
    view.state = state; assert.equal(native.viewOpen(), false); assert.equal(native.travel(permanent), false);
    assert.equal(native.travel(place), false); assert.equal(calls.length, 0);
  }
  view.state = 'rising'; assert.equal(native.viewOpen(), true);
});
