'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { flatCollider } = require('./helpers/loot-geometry.cjs');
const { createSession, controller, sources, groundPile } = require('../src/mod/page/dfo_loot.js');
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

test('15 m is inclusive and spherical; searchables, graves, chests and invalid coordinates are excluded', () => {
  const f = fixture([
    pile('corpse:1', [item('body')], [9, 0, 12]),
    pile('loot:0', [item('floor')], [0, 0, 15]),
    pile('droppedLoot:2', [item('drop')], [14, 0, 0]),
    pile('corpse:2', [item('far')], [15.001, 0, 0]),
    pile('loot:3', [item('other floor')], [12, 10, 0]),
    ...['search:1', 'srch:1', 'chest:1', 'delve:1', 'aurum:1'].map(k => pile(k, [item(k)])),
    pile('loot:4', [item('invalid')], [NaN, 0, 0]),
  ]);
  assert.deepEqual(f.loot.items().map(x => x.name), ['body', 'floor', 'drop']);
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
  f.entity.capacity = 20; f.at[0] = 16;
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
