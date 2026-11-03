'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { transformAsset } = require('../src/mod/transforms.cjs');
const { createSession, controller } = require('../src/mod/page/dfo_loot.js');

test('published world, town and interior bridges expose and take real ground loot with native motor coordinates', {
  skip: !process.env.DFO_UPSTREAM_DIR || !process.env.DFO_BUILD_DIR,
}, async () => {
  const upstream = path.resolve(process.env.DFO_UPSTREAM_DIR), assets = path.join(process.env.DFO_BUILD_DIR, 'assets');
  const { parse, parseExpressionAt } = require(path.join(upstream, 'node_modules/acorn'));
  const { analyze } = require(path.join(upstream, 'node_modules/eslint-scope'));
  const load = file => import(pathToFileURL(path.join(upstream, file)).href);
  const { PlayerMotor } = await load('src/player/motor.js'), { Collider } = await load('src/player/collider.js');
  const { corpseLootTargets } = await load('src/scenes/corpseMarker.js');
  const { planTake, applyTransfer } = await load('src/systems/item/itemTransfer.js');
  const files = fs.readdirSync(assets).filter(f => f.endsWith('.js'));
  for (const kind of ['world', 'exterior', 'interior']) {
    const file = kind === 'interior'
      ? files.find(f => fs.readFileSync(path.join(assets, f), 'utf8').includes('get questOverlay(){'))
      : files.find(f => new RegExp('^' + kind + '-[^.]+\\.js$').test(f));
    assert.ok(file, kind);
    const out = transformAsset('assets/' + file, fs.readFileSync(path.join(assets, file), 'utf8'), { nearbyLoot: true, ru: false, marks: false, dungeons: false });
    assert.ok(out.log.some(([id, n]) => id === 'loot.' + (kind === 'interior' ? 'modes' : kind) && n === 1), kind + ': hook');
    let expression;
    if (kind === 'interior') {
      const pending = [parse(out.text, { ecmaVersion: 'latest', sourceType: 'module' })];
      while (pending.length) {
        const n = pending.pop();if (!n || typeof n !== 'object') continue;
        if (n.type === 'Property' && n.key.name === 'dfoNearbyLoot' && n.kind === 'get') {
          expression = n.value.body.body.find(s => s.type === 'ReturnStatement').argument;break;
        }
        for (const v of Object.values(n)) if (v && typeof v === 'object') Array.isArray(v) ? pending.push(...v) : pending.push(v);
      }
    } else {
      const at = out.text.indexOf('globalThis.__dfoLoot?.register("' + kind + '"');assert.ok(at >= 0);
      const parsed = parseExpressionAt(out.text, at, { ecmaVersion: 'latest' });
      const call = parsed.type === 'SequenceExpression' ? parsed.expressions[0] : parsed;
      expression = (call.expression ?? call).arguments[1];
    }
    assert.equal(expression?.type, 'ObjectExpression', kind + ': injected host');
    const props = new Map(expression.properties.map(p => [p.key.name, p.value])), context = {};
    const nodeText = node => out.text.slice(node.start, node.end);
    const refs = field => [...new Set(analyze(parse('(' + nodeText(props.get(field)) + ')', { ecmaVersion: 'latest', ranges: true }), { ecmaVersion: 2024 }).globalScope.through.map(r => r.identifier.name))];
    const bind = (field, value) => { const names = refs(field);assert.equal(names.length, 1, kind + ': ' + field);context[names[0]] = value; };
    const c = new Collider(() => kind === 'interior' ? -Infinity : 12), motor = new PlayerMotor(c);motor.pinFeet(100, 12, -20);
    if (kind === 'interior') c.addMesh('floor', new Float32Array([98, 12, -22, 116, 12, -22, 116, 12, -18, 98, 12, -18]), new Uint16Array([0, 1, 2, 0, 2, 3]), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const entity = { items: [], goldPieces: 0, stats: { strength: 50, endurance: 50 } }, events = [];
    const gold = n => ({ name: 'Gold pieces', templateIndex: 276, group: 'Currency', stackCount: n });
    const body = { id: 9, feet: [105, 12, -20], items: [gold(7)] };
    const pool = {
      lootTargets: () => corpseLootTargets([body], 'foeCorpse', { isCorpse: () => true, feetOf: e => e.feet, idOf: e => e.id }),
      hoverContents: () => body.items,
      takeLoot: (_key, _say, visit) => visit({ items: () => body.items, opened: () => events.push('open'), closed: () => events.push('close') }),
    };
    const drop = { id: 1, pos: [109, 12, -20], items: [gold(3)], drawn: true };
    const hidden = { id: 2, pos: drop.pos, items: [gold(100)], owner: 'coffer' };
    bind('entity', entity);bind('dropped', { _piles: [drop, hidden], releaseEmptied() {} });
    const pools = refs('pools');assert.equal(pools.length, 2);context[pools[0]] = pool;context[pools[1]] = { lootTargets: () => [] };
    bind('say', { say() {} });bind('getQuest', null);
    if (kind === 'interior') {
      bind('feet', motor);bind('collider', { collider: c });
      const blocked = props.get('blocked').body;context[blocked.left.callee.name] = () => false;context[blocked.right.name] = false;
    } else {
      const feet = props.get('feet').body;context[feet.test.name] = true;context[feet.consequent.object.name] = motor;
      bind('collider', c);bind('blocked', () => false);bind('resolve', { mode: 'exterior' });
    }
    const host = vm.runInNewContext('(' + nodeText(expression) + ')', context);
    assert.equal(host.feet(), motor.pos, kind + ': real motor buffer');assert.equal(host.collider(), c);assert.equal(host.blocked(), false);
    const loot = createSession(host, { tools: () => ({ planTake, applyTransfer }) });
    assert.equal(loot.items().length, 2, kind + ': body and floor loot are visible');
    motor.pinFeet(100, 15, -20);assert.equal(loot.items().length, 0, kind + ': another storey stays excluded');
    motor.pinFeet(100, 12, -20);assert.equal(loot.items().length, 2);
    const taken = loot.takeAll();assert.equal(taken.taken, 2, kind);assert.equal(taken.failed, 0);assert.equal(entity.goldPieces, 10);
    assert.deepEqual(events, ['open', 'close']);assert.equal(body.items.length, 0);assert.equal(drop.items.length, 0);assert.equal(hidden.items[0].stackCount, 100);
    assert.equal(loot.takeAll().taken, 0);loot.closed();
    if (kind !== 'interior') {
      const ctl = controller(), modes = context[refs('resolve')[0]], building = { ...host, kind: 'interior' };let opened;
      modes.mode = 'interior';modes.dfoNearbyLoot = building;building.open = l => { opened = l;return { done: false }; };
      ctl.register(kind, host);assert.equal(ctl.open(), true, kind + ': switches to the building host');opened.closed();
      modes.dfoNearbyLoot = null;assert.equal(ctl.open(), false, kind + ': no stale outside loot during a transition');
    }
  }
});
