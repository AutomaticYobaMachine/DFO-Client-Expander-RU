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
    let peerList = [];
    if (kind === 'interior') {
      bind('feet', motor);bind('collider', { collider: c });
      const blocked = props.get('blocked').body;context[blocked.left.callee.name] = () => false;context[blocked.right.name] = false;
      const peerVar = refs('peers')[0];assert.equal(peerVar, refs('selfId')[0]);
      context[peerVar] = { peers: () => peerList, selfId: () => 'self' };
    } else {
      const feet = props.get('feet').body;context[feet.test.name] = true;context[feet.consequent.object.name] = motor;
      bind('collider', c);bind('blocked', () => false);bind('resolve', { mode: 'exterior' });
      if (kind === 'world') {
        bind('peers', () => peerList);
        bind('selfId', { id: 'self' });
      }
    }
    const host = vm.runInNewContext('(' + nodeText(expression) + ')', context);
    assert.equal(host.feet(), motor.pos, kind + ': real motor buffer');assert.equal(host.collider(), c);assert.equal(host.blocked(), false);
    assert.deepEqual([...host.eye()], [...motor.eye], kind + ': actual player eye');
    const loot = createSession(host, { tools: () => ({ planTake, applyTransfer }) });
    assert.equal(loot.items().length, 2, kind + ': body and floor loot are visible');
    if (kind !== 'exterior') {
      peerList = [{ id: 'other', feet: [100, 52, -20] }]; // 40 m vertical <= 50 m 3D sphere
      assert.equal(loot.items().length, 0, kind + ': 5 m body and 9 m drop are hidden once a peer is within 50 m in 3D');
      peerList = [{ id: 'other', feet: [130, 53, -20] }]; // sqrt(30^2 + 41^2) > 50 m in 3D
      assert.equal(loot.items().length, 2, kind + ': >50 m 3D peer restores the 10 m default radius');
      peerList = [];
    }
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

test('published world, exterior, interior and dungeon hooks wire peers/selfId and switch 10 m -> 3 m on the real bundle', {
  skip: !process.env.DFO_BUILD_DIR || !(() => { try { require.resolve(process.env.DFO_ACORN_MODULE || 'acorn'); return true; } catch { return false; } })(),
}, () => {
  const acorn = require(process.env.DFO_ACORN_MODULE || 'acorn');
  const assets = path.join(process.env.DFO_BUILD_DIR, 'assets');
  const files = fs.readdirSync(assets).filter(f => f.endsWith('.js') && !/Worker-/.test(f));
  const findGetter = (code, propName) => {
    const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
    const stack = [ast];
    while (stack.length) {
      const n = stack.pop();
      if (!n || typeof n !== 'object') continue;
      if (n.type === 'Property' && n.kind === 'get' && n.key?.name === propName) {
        return n.value.body.body.find(s => s.type === 'ReturnStatement')?.argument ?? null;
      }
      for (const v of Object.values(n)) if (v && typeof v === 'object') Array.isArray(v) ? stack.push(...v) : stack.push(v);
    }
    return null;
  };
  const findCall = (code, needle) => {
    const at = code.indexOf(needle);
    assert.ok(at >= 0, needle);
    const parsed = acorn.parseExpressionAt(code, at, { ecmaVersion: 'latest' });
    const call = parsed.type === 'SequenceExpression' ? parsed.expressions[0] : parsed;
    return (call.expression ?? call).arguments[1];
  };

  for (const kind of ['world', 'exterior', 'interior', 'dungeon']) {
    const file = kind === 'interior'
      ? files.find(f => fs.readFileSync(path.join(assets, f), 'utf8').includes('get questOverlay(){'))
      : kind === 'dungeon'
        ? files.find(f => fs.readFileSync(path.join(assets, f), 'utf8').includes('peerBodies:') && fs.readFileSync(path.join(assets, f), 'utf8').includes('openLootList('))
        : files.find(f => new RegExp('^' + kind + '-[^.]+\\.js$').test(f));
    assert.ok(file, kind);
    const out = transformAsset('assets/' + file, fs.readFileSync(path.join(assets, file), 'utf8'), { nearbyLoot: true, ru: false, marks: false, dungeons: false });
    const expectedHook = kind === 'interior' ? 'loot.modes' : 'loot.' + kind;
    assert.ok(out.log.some(([id, n]) => id === expectedHook && n === 1), kind + ': hook');
    // Verify idempotency and valid ESM parse after injection.
    assert.equal(transformAsset('assets/' + file, out.text, { nearbyLoot: true, ru: false, marks: false, dungeons: false }).text, out.text, kind + ': idempotent');
    const expr = (kind === 'interior' || kind === 'dungeon')
      ? findGetter(out.text, 'dfoNearbyLoot')
      : findCall(out.text, `globalThis.__dfoLoot?.register("${kind}"`);
    assert.equal(expr?.type, 'ObjectExpression', kind);
    const propNames = new Set(expr.properties.map(p => p.key.name));
    if (kind === 'exterior') {
      assert.equal(propNames.has('peers'), false);
    } else {
      assert.ok(propNames.has('peers') && propNames.has('selfId'), kind + ': peers & selfId present');
      // Evaluate the injected peers() & selfId() arrow expressions directly.
      const props = new Map(expr.properties.map(p => [p.key.name, p.value]));
      const peersSrc = out.text.slice(props.get('peers').start, props.get('peers').end);
      const selfSrc = out.text.slice(props.get('selfId').start, props.get('selfId').end);
      let seenOpts = null, samplePeers = [{ id: 'self', feet: [1, 0, 0] }, { id: 'p1', feet: [30, 40, 0] }];
      const ctx = {};
      if (kind === 'world') {
        const fbName = /\(\)=>([\w$]+)\(/.exec(peersSrc)[1];
        const yName = /\(\)=>([\w$]+)\?\./.exec(selfSrc)[1];
        ctx[fbName] = opts => { seenOpts = opts; return samplePeers; };
        ctx[yName] = { id: 'self' };
      } else {
        const hostName = /\(\)=>([\w$]+)\.peers/.exec(peersSrc)[1];
        assert.equal(hostName, /\(\)=>([\w$]+)\.selfId/.exec(selfSrc)[1]);
        ctx[hostName] = { peers: opts => { seenOpts = opts; return samplePeers; }, selfId: () => 'self' };
      }
      const peersFn = vm.runInNewContext('(' + peersSrc + ')', ctx);
      const selfFn = vm.runInNewContext('(' + selfSrc + ')', ctx);
      const collider = { raycast: () => Infinity };
      const midPile = { key: 'loot:0', pos: [6, 0, 0], items: () => [{ name: 'Mid' }] };
      const host = { entity: { items: [] }, feet: () => [0, 0, 0], eye: () => [0, 1.6, 0], collider: () => collider, peers: peersFn, selfId: selfFn, sources: () => [midPile] };
      const loot = createSession(host);
      assert.equal(loot.items().length, 0, kind + ': 6 m loot hidden when peer at [30,40,0] (50 m 3D)');
      if (kind !== 'dungeon') assert.equal(seenOpts?.presenceOnly, true, kind);
      samplePeers = [{ id: 'self', feet: [1, 0, 0] }, { id: 'p1', feet: [30, 41, 0] }];
      assert.equal(loot.items().length, 1, kind + ': 6 m loot visible once peer is >50 m in 3D');
      loot.closed();
    }
  }
});
