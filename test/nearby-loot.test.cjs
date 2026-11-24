'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { flatCollider } = require('./helpers/loot-geometry.cjs');
const { DEFAULT_RADIUS, NEARBY_PLAYER_RADIUS, PEER_DETECT_RADIUS, hasNearbyPlayer, activeRadius, canReach, createSession, controller, sources, groundPile } = require('../src/mod/page/dfo_loot.js');
const { transformAsset, injectPage, EXPECTED } = require('../src/mod/transforms.cjs');

function fixture(records = []) {
  const entity = { items: [], capacity: 20 }, at = [0, 0, 0];
  const events = [], host = { entity, collider: () => flatCollider, feet: () => at, blocked: () => false, sources: () => records };
  const tools = {
    planTake: it => ({ ok: entity.items.length < entity.capacity, amount: it.stackCount ?? 1 }),
    applyTransfer(item, {amount:n}, list, to) {
      assert.notEqual(list, loot.items(), 'native transfer must consume the real source, never the detector view');
      if (n < (item.stackCount ?? 1)) { item.stackCount -= n; to.push({ ...item, stackCount: n }); }
      else { list.splice(list.indexOf(item), 1); to.push(item); }
    },
  };
  const loot = createSession(host, { tools: () => tools });
  function move(item, n = item.stackCount ?? 1) {
    return loot.commit('take', item, n, () => assert.fail('the UI must never transfer from the detector view'));
  }
  return { host, loot, entity, at, move, events };
}
const item = (name, stackCount = 1) => ({ name, stackCount });
const pile = (key, items, pos = [0, 0, 0]) => ({ key, pos, items: () => items, visit: fn => fn(items) });

test('10 m default is inclusive and spherical; searchables, graves, chests, coffers and invalid coordinates are excluded', () => {
  const f = fixture([
    pile('corpse:1', [item('body')], [6, 0, 8]),
    pile('loot:0', [item('floor')], [0, 0, 10]),
    pile('droppedLoot:2', [item('drop')], [9, 0, 0]),
    pile('corpse:2', [item('far')], [10.001, 0, 0]),
    pile('loot:3', [item('other floor')], [6, 8, 0]),
    // srch: is a searched chest's find, minted only while its search cools (dungeonSources); search: would roll one.
    ...['search:1', 'chest:1', 'container:1', 'delve:1', 'aurum:1', 'spoilGold:1'].map(k => pile(k, [item(k)])),
    pile('loot:4', [item('invalid')], [NaN, 0, 0]),
  ]);
  assert.deepEqual(f.loot.items().map(x => x.name), ['body', 'floor', 'drop']);
});

test('radius shrinks dynamically from 10 m to 3 m when another player is within 50 m in all 3 coordinates (x, y, z)', () => {
  assert.equal(DEFAULT_RADIUS, 10);
  assert.equal(NEARBY_PLAYER_RADIUS, 3);
  assert.equal(PEER_DETECT_RADIUS, 50);

  const feet = new Float32Array([0, 0, 0]);
  assert.equal(hasNearbyPlayer(feet, null), false);
  assert.equal(hasNearbyPlayer(feet, []), false);
  assert.equal(hasNearbyPlayer(feet, [{ id: 'self', feet: [1, 0, 0] }], 'self'), false, 'self id must never shrink own radius');
  // 2D (x, z) distance is 30 m <= 50, but 3D distance including y is sqrt(30^2 + 41^2) ≈ 50.80 m > 50 m.
  assert.equal(hasNearbyPlayer(feet, [{ id: 'p1', feet: [30, 41, 0] }], 'self'), false, 'all 3 coordinates participate in the 50 m check');
  assert.equal(hasNearbyPlayer(feet, [{ id: 'p1', feet: new Float32Array([30, 40, 0]) }], 'self'), true, 'exact 50 m 3D sphere edge counts');
  assert.equal(hasNearbyPlayer(feet, [{ id: 'p2', feet: [0, -50, 0] }], 'self'), true, 'vertical 50 m counts');
  assert.equal(hasNearbyPlayer(feet, [{ id: 'p2', feet: [0, -50.01, 0] }], 'self'), false);
  assert.equal(hasNearbyPlayer(feet, [{ id: 'bad', feet: [NaN, 0, 0] }, { id: 'p3', pos: [0, 0, 49.9] }], 'self'), true);

  let peers = [], entity = { items: [], capacity: 20 };
  const close = item('Close'), edge3 = item('Edge3'), mid = item('Mid'), edge10 = item('Edge10');
  const piles = [
    pile('loot:1', [close], [2, 0, 0]),
    pile('corpse:1', [edge3], [0, 0, 3]),
    pile('droppedLoot:1', [mid], [6, 0, 0]),
    pile('loot:2', [edge10], [8, 0, 6]),
  ];
  const tools = {
    planTake: it => ({ ok: true, amount: it.stackCount ?? 1 }),
    applyTransfer(it, _p, from, to) { from.splice(from.indexOf(it), 1); to.push(it); },
  };
  const host = {
    entity, collider: () => flatCollider, feet: () => feet,
    peers: () => peers, selfId: () => 'self',
    sources: () => piles,
  };
  const prevUi = globalThis.__dfoUi;
  const uiRuntime = require('../src/mod/page/dfo_ui_text.js');
  const itemText = require('../src/mod/item-text.cjs');
  try {
    globalThis.__dfoUi = uiRuntime.make(itemText.uiPack('ru'));
    assert.equal(activeRadius(host), 10);
    const loot = createSession(host, { tools: () => tools });
    assert.deepEqual(loot.items(), [close, edge3, mid, edge10]);
    assert.equal(loot.title, 'Лут рядом · 10 м');

    // Peer arrives inside 50 m 3D sphere immediately (<150 ms cache TTL): radius shrinks to 3 m.
    peers = [{ id: 'other', feet: [30, 40, 0] }];
    assert.equal(activeRadius(host), 3);
    assert.equal(loot.title, 'Лут рядом · 3 м');
    assert.deepEqual(loot.items(), [close, edge3], 'cache stamp includes radius so 6 m & 10 m items vanish immediately');

    // Even without calling items() again after peer moves closer, fresh commit/autoLoot obey the 3 m radius.
    peers = [];
    assert.deepEqual(loot.items(), [close, edge3, mid, edge10], 'peer leaves >50 m -> immediately restores 10 m');
    globalThis.__dfoUi = uiRuntime.make(itemText.uiPack('en'));
    assert.equal(loot.title, 'Loot nearby · 10 m');

    // Simulate another player entering 50 m AFTER the UI opened on a 6 m stale row.
    peers = [{ id: 'other', feet: [10, 48, 0] }]; // hypot(10, 48, 0) ≈ 49.03 <= 50
    assert.equal(loot.title, 'Loot nearby · 3 m');
    assert.equal(loot.commit('take', mid, 1), false, 'fresh commit blocks 6 m pick once another player is within 50 m');
    assert.equal(piles[2].items().length, 1);
    // Autoloot collects items within 3 m while leaving 6 m & 10 m untouched.
    assert.equal(loot.autoLoot({ enabled: true, tags: [], items: ['type::-1'] }).taken, 2);
    assert.deepEqual(entity.items, [close, edge3]);
    assert.deepEqual(piles[2].items(), [mid]);
    assert.deepEqual(piles[3].items(), [edge10]);
    // With only 6 m & 10 m left, autoloot & takeAll cannot collect them while peer stays within 50 m.
    assert.equal(loot.autoLoot({ enabled: true, tags: [], items: ['type::-1'] }).taken, 0);
    assert.deepEqual(loot.takeAll(), { taken: 0, failed: 0, refusal: null });

    // Peer leaves >50 m -> remaining 6 m & 10 m loot becomes collectable again.
    peers = [{ id: 'other', feet: [10, 49.5, 0] }]; // hypot(10, 49.5, 0) ≈ 50.5 > 50
    assert.deepEqual(loot.items(), [mid, edge10]);
    assert.equal(loot.commit('take', mid, 1), true);
    assert.equal(loot.commit('take', edge10, 1), true);
    assert.equal(entity.items.length, 4);

  // If peers() getter throws, activeRadius fails safely to default 10 m rather than breaking looting.
  assert.equal(activeRadius({ feet: () => feet, peers() { throw new Error('offline'); } }), 10);
  loot.closed();

  // Regression & optimization checks: recomposed network items still respect dynamic 3 m radius,
  // and out-of-reach commit() does not scan peers redundantly for identical item/live refs.
  let peerCalls = 0;
  const netItem = item('NetBow');
  const netList = [netItem];
  const recomposedSource = {
    key: 'foeCorpse:9',
    pos: [7, 0, 0],
    items: () => netList,
    visit(fn) {
      netList[0] = { ...netList[0] };
      return fn(netList);
    },
  };
  let livePeers = [];
  const countedHost = {
    entity: { items: [], capacity: 10 },
    collider: () => flatCollider,
    feet: () => [0, 0, 0],
    peers: () => { peerCalls++; return livePeers; },
    selfId: () => 'self',
    sources: () => [recomposedSource],
  };
  const countedLoot = createSession(countedHost, { tools: () => tools });
  assert.deepEqual(countedLoot.items(), [netItem]);
  livePeers = [{ id: 'other', feet: [0, 0, 40] }];
  peerCalls = 0;
  assert.equal(countedLoot.commit('take', netItem, 1), false);
  // Expect 1 check in pre-visit reachable() + 1 check in post-commit refresh() (never re-scanning on visit failure).
  assert.equal(peerCalls, 2);
  livePeers = [];
  assert.equal(countedLoot.commit('take', netItem, 1), true);
  assert.equal(countedHost.entity.items.length, 1);
  countedLoot.closed();

  // Batch takeAll performance: N items must NOT run N O(N) refresh() passes, while preserving live per-item radius enforcement.
  let bulkSourcesCalls = 0, bulkPeerCalls = 0;
  const bulkItems = Array.from({ length: 20 }, (_, i) => item('Bulk' + i));
  const bulkCol = { raycast: () => Infinity };
  const pA = bulkItems.slice(0, 10), pB = bulkItems.slice(10);
  const dynFeet = new Float32Array([0, 0, 0]);
  const cleanBulkHost = {
    entity: { items: [], capacity: 50 },
    collider: () => bulkCol,
    feet: () => dynFeet,
    peers: () => { bulkPeerCalls++; return []; },
    selfId: () => 'self',
    sources: () => { bulkSourcesCalls++; return [pile('loot:0', pA, [2, 0, 0]), pile('loot:1', pB, [7, 0, 0])]; },
  };
  const bulkLoot = createSession(cleanBulkHost, { tools: () => tools });
  assert.equal(bulkLoot.items().length, 20);
  bulkSourcesCalls = 0; bulkPeerCalls = 0;
  const takenAll = bulkLoot.takeAll();
  assert.deepEqual(takenAll, { taken: 20, failed: 0, refusal: null });
  // Without batching, 20 items caused 21 refresh() calls (~42 sources calls + ~60 peers calls); with batching only commit source lookup + 1 final refresh.
  assert.ok(bulkSourcesCalls <= 22, 'sources calls stayed linear: ' + bulkSourcesCalls);
  assert.equal(bulkLoot.items().length, 0);
  // Zero-alloc numeric cache still catches in-place Float32Array mutation within <150ms TTL.
  pB.push(item('Respawn'));
  assert.equal(bulkLoot.items().length, 1);
  dynFeet[0] = 20; // mutated in place to 13 m away from [7, 0, 0]
  assert.equal(bulkLoot.items().length, 0, 'in-place Float32Array move immediately invalidates numeric cache');
  dynFeet[0] = 0;

  // Mid-batch safety: even with batching enabled, a peer arriving mid-takeAll blocks later >3 m items immediately.
  const nearB = item('NearB'), farB = item('FarB'), nearList = [nearB];
  let midPeers = [];
  const midHost = {
    entity: { items: [], capacity: 10 },
    collider: () => bulkCol,
    feet: () => dynFeet,
    peers: () => midPeers,
    selfId: () => 'self',
    sources: () => [
      { key: 'loot:near', pos: [2, 0, 0], items: () => nearList, visit(fn) { const ok = fn(nearList); midPeers = [{ id: 'p2', feet: [0, 0, 49] }]; return ok; } },
      pile('loot:far', [farB], [7, 0, 0]),
    ],
  };
  const midLoot = createSession(midHost, { tools: () => tools });
  assert.deepEqual(midLoot.items(), [nearB, farB]);
  assert.deepEqual(midLoot.takeAll(), { taken: 1, failed: 1, refusal: undefined });
  assert.deepEqual(midHost.entity.items, [nearB]);
  assert.deepEqual(midLoot.items(), [], 'final refresh clears out-of-range item after batch');
  midLoot.closed();

  assert.equal(hasNearbyPlayer(new Float32Array([0, 0, 0]), new Set([{ id: 'x', feet: [0, 50, 0] }])), true);
  assert.equal(hasNearbyPlayer([0, 0, 0], 'not-a-peer-list'), false);
  bulkLoot.closed();
  } finally {
    if (prevUi === undefined) delete globalThis.__dfoUi;
    else globalThis.__dfoUi = prevUi;
  }
});

test('sorted/filtered selections take the actual item from the correct source; duplicate names stay distinct', () => {
  const a = item('Sword'), b = { ...item('Sword'), rarity: 'rare' }, c = item('Apple');
  const first = [a, c], second = [b];
  const f = fixture([pile('corpse:1', first), pile('loot:0', second)]);
  f.loot.items().reverse();
  const filtered = f.loot.items().filter(it => it.rarity === 'rare');
  assert.equal(f.move(filtered[0]), true);
  assert.deepEqual(first, [a, c]); assert.deepEqual(second, []); assert.deepEqual(f.entity.items, [b]);
});

test('partial stacks and full takes remain in sync; a second take cannot duplicate an item', () => {
  const arrows = item('Arrow', 10), real = [arrows];
  const f = fixture([pile('corpse:0', real)]);
  assert.equal(f.move(arrows, 3), true);
  assert.equal(real[0].stackCount, 7); assert.equal(f.entity.items[0].stackCount, 3);
  assert.equal(f.move(arrows, 7), true); assert.deepEqual(real, []);
  assert.equal(f.move(arrows), false);
});

test('a native network door may recompose records; partial and full takes settle the live records', () => {
  const old = item('Arrow', 5), real = [old];
  const s = pile('foeCorpse:1', real);
  s.visit = fn => { real[0] = { ...real[0] }; return fn(real); };
  const f = fixture([s]);
  assert.equal(f.move(old, 2), true); assert.equal(real[0].stackCount, 3);
  const next = f.loot.items()[0];
  assert.equal(f.move(next), true); assert.equal(real.length, 0);
  assert.equal(f.entity.items.reduce((n,it) => n + it.stackCount, 0), 5);
});

test('capacity is rechecked for each item in a bulk move; missing, moved, closed and put operations are refused', () => {
  const a = item('A'), b = item('B'), real = [a, b];
  const f = fixture([pile('loot:1', real)]); f.entity.capacity = 1;
  assert.equal(f.move(a), true); assert.equal(f.move(b), false); assert.deepEqual(real, [b]);
  f.entity.capacity = 20; f.at[0] = 11;
  assert.equal(f.move(b), false); f.at[0] = 0;
  assert.equal(f.loot.commit('put', a, 1, () => assert.fail()), false);
  real.length = 0; assert.equal(f.move(b), false);
  f.loot.closed(); assert.equal(f.move(a), false);
});

test('body protocol opens and closes per transaction; hidden backing containers and player remains are excluded', () => {
  const a = item('A'), real = [a], calls = [];
  const pool = { lootTargets: () => [{ key: 'foeCorpse:1', pos: [0,0,0] }], hoverContents: () => real,
    takeLoot(key, say, open) { return open({ items: () => real, opened: () => calls.push('open'), closed: () => calls.push('close') }); } };
  const host = { pools: () => [pool], dropped: () => ({ _piles: [{ id: 2, items: [], drawn: false }, { id: 3, wildBody: true }] }) };
  const found = sources(host); assert.equal(found.length, 1);
  found[0].visit(() => calls.push('take'));
  assert.deepEqual(calls, ['open', 'take', 'close']);
  assert.equal(groundPile({ drawn: true, container: true }), true);
  assert.equal(groundPile({ drawn: false }), false); assert.equal(groundPile({ owner: 'coffer' }), false);
});

test('opening/repeating/reentering an existing window creates exactly one overlay', () => {
  const c = controller(); let n = 0, loot;
  const w = { done: false };
  c.register('world', { feet: () => [0,0,0], entity: {}, blocked: () => false, sources: () => [], open(l) { n++; loot = l; assert.equal(c.open(), false); return w; } });
  assert.equal(c.open(), true);
  for (let i=0; i<30; i++) assert.equal(c.open(), false);
  assert.equal(n, 1); w.done = true; loot.closed();
  assert.equal(c.open(), true); assert.equal(n, 2);
});

test('hotkey ignores chat, search, selects, modifiers and repeats; filters never mount another window', async () => {
  const handlers = [], cfg = { nearbyLoot: { keyCode: 'KeyJ' } };
  const ctx = { __DFO_MOD_CFG__: cfg, console, addEventListener: (type, fn) => handlers.push(fn) };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/mod/page/dfo_loot_rules.js'), 'utf8'), ctx);
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/mod/page/dfo_loot.js'), 'utf8'), ctx);
  let mounts=0; ctx.__dfoLoot.register('world', { feet: () => [0,0,0], blocked: () => false, entity: {}, sources: () => [], open: () => { mounts++; return { done: false }; } });
  const key = (extra={}) => ({ code: 'KeyJ', preventDefault(){}, stopImmediatePropagation(){}, ...extra });
  for (const event of [key({repeat:true}), key({target:{closest:()=>({})}}), key({ctrlKey:true}), key({code:'KeyV'})]) handlers[0](event);
  assert.equal(mounts,0); handlers[0](key()); await new Promise(setImmediate);
  for(let i=0;i<30;i++) { handlers[0](key({repeat:true})); handlers[0](key({target:{closest:()=>({})}})); }
  assert.equal(mounts,1);
});

test('page injection and disabling the feature preserve the original asset', () => {
  const html = '<head><script type="module" src="/assets/world-12345678.js"></script></head>';
  const injected = injectPage(html, './', { nearbyLoot: true });
  assert.equal(injectPage(injected, './', {}), injected);
  assert.equal((injected.match(/dfo_loot.js/g)||[]).length,1);
  assert.ok(!injectPage(html, './', { nearbyLoot: false }).includes('dfo_loot'));
  const src='unsupported source';
  assert.equal(transformAsset('assets/world-12345678.js', src, {nearbyLoot:false}).text, src);
  assert.ok(EXPECTED.nearbyLoot.includes('loot.dungeon'));

  const { transformTags } = require('../src/mod/loot-tags-transform.cjs');
  const raritySrc = 'var $=e=>!dn(e)||e?.isIdentified===!0,L=Object.freeze({damage:Object.freeze({slot:`prefix`})});';
  const logRar = [];
  const outRar = transformTags('assets/lootRarity-B3D_-YTh.js', raritySrc, logRar);
  assert.deepEqual(logRar, [['loot.identified', 1]]);
  assert.match(outRar, /__dfoLootIdentified=\$;globalThis\.__dfoLootAffixes=L;/);
  assert.equal(transformTags('assets/lootRarity-B3D_-YTh.js', outRar, []), outRar, 'loot.identified is idempotent');
  assert.equal(transformTags('assets/tamrielRoadsWorker-vkrS9uO-.js', raritySrc, []), raritySrc, 'workers never receive loot.identified');
  const logTrade = [];
  assert.equal(transformTags('assets/realmTradeLaw-JqcLaV7I.js', 'var x=1;', logTrade), 'var x=1;');
  assert.deepEqual(logTrade, [], 'realmTradeLaw without affix/identified table logs zero errors');
});

test('real upstream transfers: gold, partial stacks, sorting and live capacity conserve items without a display-array transfer',
  { skip: !process.env.DFO_UPSTREAM_DIR }, async () => {
  const path = require('node:path'), { pathToFileURL } = require('node:url');
  const load = file => import(pathToFileURL(path.join(process.env.DFO_UPSTREAM_DIR, file)).href);
  await load('test/modsOff.js');
  const {planTake,applyTransfer} = await load('src/systems/item/itemTransfer.js');
  const {sortInPlace} = await load('src/ui/packSort.js');
  const {itemNameParts} = await load('src/systems/item/itemInfo.js');
  const arrow={...item('Arrow',10),templateIndex:131,group:'Weapons',currentCondition:50,maxCondition:50};
  const gold={...item('Gold pieces',30),templateIndex:276,group:'Currency'};
  const first=[arrow],second=[gold];
  const entity={name:'Check',stats:{strength:50,endurance:50},items:[],goldPieces:0};
  const records=[pile('corpse:0',first),pile('loot:1',second)];
  const seen=[];
  const loot=createSession({entity,collider:()=>flatCollider,feet:()=>[0,0,0],sources:()=>records},{tools:()=>({planTake,sort:sortInPlace,nameOf:it=>itemNameParts(it).name,
    applyTransfer(it,plan,from,to,opts){assert.ok(from===first||from===second);seen.push(from);return applyTransfer(it,plan,from,to,opts);}})});
  const never=()=>assert.fail('not a storage: never use the inventory UI transfer callback');
  assert.equal(loot.items().length,2);
  assert.equal(loot.commit('take',arrow,3,never),true);
  assert.equal(first[0].stackCount,7);assert.equal(entity.items[0].stackCount,3);
  assert.equal(loot.commit('take',gold,30,never),true);
  assert.equal(entity.goldPieces,30);assert.equal(second.length,0);
  assert.equal(loot.commit('take',arrow,7,never),true);
  assert.equal(first.length,0);assert.equal(entity.items.reduce((sum,it)=>sum+it.stackCount,0),10);
  assert.equal(loot.commit('take',arrow,7,never),false);
  assert.equal(loot.items().length,0);assert.equal(seen.length,3);
});

test('real upstream multiplayer: concurrent detector takes conserve the owner body and both players inventories',
  { skip: !process.env.DFO_UPSTREAM_DIR }, async () => {
  const path=require('node:path'), {pathToFileURL}=require('node:url');
  const load=file=>import(pathToFileURL(path.join(process.env.DFO_UPSTREAM_DIR,file)).href);
  const h=await load('test/net/bodyLootHarness.mjs');
  const tools=await load('src/systems/item/itemTransfer.js');
  try {
    const s=await h.scene('street',['mac-0001','eve-0003']);
    await h.runLive(s.net,3500);
    const sessions=s.them.map(p=>createSession({entity:p.entity,collider:()=>flatCollider,feet:()=>p.feet,pools:()=>[p.pool()],say:()=>{}},{tools:()=>tools}));
    const chosen=sessions.map(l=>l.items().find(it=>h.pieceOf(it)===h.SHORTSWORD));
    assert.ok(chosen.every(Boolean),'both readers have the native authoritative view of the body');
    chosen.forEach((it,i)=>assert.equal(sessions[i].commit('take',it,it.stackCount??1,()=>assert.fail('detector is not storage')),true));
    h.run(s.net,h.SETTLED_MS);
    assert.deepEqual(h.misplaced(s),[],'every original piece has exactly one authoritative holder');
    const holders=h.census(s).get(h.SHORTSWORD);
    assert.equal(holders.length,1);assert.equal(holders[0][1],1);
    assert.notEqual(holders[0][0],"the owner's body");
    sessions.forEach(l=>l.closed());
  } finally {h.restoreRandom();}
});

test('real upstream multiplayer auto-loot: empty whitelist never blocks automatic takes or duplicates a contested piece',
  { skip: !process.env.DFO_UPSTREAM_DIR }, async () => {
  const path=require('node:path'),{pathToFileURL}=require('node:url');
  const load=file=>import(pathToFileURL(path.join(process.env.DFO_UPSTREAM_DIR,file)).href);
  const h=await load('test/net/bodyLootHarness.mjs'),tools=await load('src/systems/item/itemTransfer.js');
  const Rules=require('../src/mod/page/dfo_loot_rules.js');
  try{
    const s=await h.scene('building',['mac-0001','eve-0003']);await h.runLive(s.net,3500);
    const type=Rules.typeKey(s.body.find(it=>h.pieceOf(it)===h.SHORTSWORD));
    const settings=Rules.cleanSettings({filter:{mode:'white',tags:[]},autoLoot:{enabled:true,items:[type]}});
    const sessions=s.them.map(p=>createSession({entity:p.entity,collider:()=>flatCollider,feet:()=>p.feet,pools:()=>[p.pool()],say:()=>{}},{tools:()=>tools,settings:()=>settings}));
    for(const loot of sessions){assert.deepEqual(loot.items(),[]);assert.equal(loot.autoLoot(settings.autoLoot).taken,1);}
    h.run(s.net,h.SETTLED_MS);
    assert.deepEqual(h.misplaced(s),[]);const at=h.census(s).get(h.SHORTSWORD);assert.equal(at.length,1);assert.equal(at[0][1],1);
    sessions.forEach(loot=>{assert.equal(loot.autoLoot(settings.autoLoot).taken,0);loot.closed();});
  }finally{h.restoreRandom();}
});
