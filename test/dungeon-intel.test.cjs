'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const M = require('../src/mod/page/dfo_dungeon_model.js');
// These checks read the Russian install's words; the English ones are checked where the locales are compared.
globalThis.__dfoUi = require('../src/mod/item-text.cjs').uiText('ru');
const { createLootStore } = require('../src/mod/loot-store.cjs');
const { wrap } = require('../src/mod/hook.cjs');
const { transformDungeons } = require('../src/mod/dungeon-transform.cjs');
const { injectPage } = require('../src/mod/transforms.cjs');
const native = { skip: !process.env.DFO_UPSTREAM_DIR };
const load = file => import(require('node:url').pathToFileURL(path.join(process.env.DFO_UPSTREAM_DIR, file)).href);
const place = (extra = {}) => ({ key: 'place:12345', px: 12, py: 34, loc: { hasDungeon: true, name: 'Castle', regionIndex: 1,
  mapTableData: { mapId: 12345, dungeonType: 8 }, dungeon: { blocks: Array.from({length:24},()=>({})), recordElement: { header: { locationId: 12345 } } }, ...extra } });

test('forecast integrates every native RNG branch exactly without spending any game rolls', native, async () => {
  const { chooseRandomEnemyType } = await load('src/characters/dungeonEnemies.js');
  const table = Array.from({ length: 20 }, (_, i) => i);
  const context = { randomRangeInclusive: null }, choose = vm.runInNewContext('(' + chooseRandomEnemyType.toString() + ')', context);
  for (const level of [1, 2, 3, 5, 6, 16, 17, 18, 19, 20, 30]) {
    const expected = new Map();
    for (let roll = 1; roll <= 100; roll++) {
      let range;
      context.randomRangeInclusive = (a, b) => range ? a : (range = [a,b], roll);
      // First call reads the branch's exact native min/max, without touching DFRandom.
      let calls = 0; context.randomRangeInclusive = (a, b) => ++calls === 1 ? roll : (range = [a,b], a); choose(table, level);
      const [lo, hi] = range;
      for (let i = lo; i <= hi; i++) expected.set(i, (expected.get(i) || 0) + .01 / (hi - lo + 1));
    }
    const actual = new Map(M.distribution(table, level).map(r => [r.type, r.probability]));
    for (const [id, mass] of expected) assert.ok(Math.abs(actual.get(id) - mass) < 1e-10, `level ${level}, slot ${id}`);
    assert.ok(Math.abs([...actual.values()].reduce((a,b)=>a+b,0)-1)<1e-10);
  }
});

test('alternate selection follows the real native power band, including both level-20 endpoints', native, async () => {
  const { alternateRandomEnemyType } = await load('src/characters/dungeonEnemies.js');
  const table = Array.from({length:20},(_,i)=>i);
  for(const level of [1,5,10,19,20,50]){
    let bounds;alternateRandomEnemyType(table,level,(lo,exclusive)=>{bounds=[lo,exclusive-1];return lo});
    const rows=M.distribution(table,level,true);assert.deepEqual(rows.map(r=>r.type),table.slice(bounds[0],bounds[1]+1));
    assert.ok(rows.every(r=>Math.abs(r.probability-1/rows.length)<1e-10));
  }
});

async function nativeTools() {
  await load('test/modsOff.js');
  const [E, T, R, S, H, A, V, I, N, Resp, Label, Layout, Curated, Elite] = await Promise.all([
    load('src/characters/enemy/enemyBasics.js'), load('src/characters/encounterTableDoor.js'), load('src/systems/loot/lootRarity.js'),
    load('src/systems/skillSoftcap.js'), load('src/systems/heroThreat.js'), load('src/net/aurumCacheLaw.js'), load('src/net/nodeLaw.js'),
    load('src/scenes/dungeonIdentity.js'), load('src/net/renown.js'), load('src/systems/dungeon/dungeonRespawn.js'), load('src/world/dungeon/dungeonLabel.js'), load('src/world/smallerDungeons.js'), load('src/world/dungeon/curatedSplice.js'), load('src/systems/eliteFoes.js')]);
  return { tables:T.encounterTableChoices,basics:E.ENEMY_BASICS,enemyName:E.enemyDisplayName,enemyLevel:E.enemyLevelOf,
    rank:R.dungeonRarityTier,family:R.dungeonFamily,foeFamily:R.foeFamily,chances:R.rarityChances,lootOn:()=>true,
    standing:S.combatStanding,scaling:S.progressionScaling,share:S.dungeonShare,foeShare:S.foeShare,placeVeteran:S.placeVeteran,
    challenge:S.challengeQuality,skillIds:S.EDGE_SKILL_IDS,hero:p=>H.heroThreat(p.level,20),effectiveLevel:p=>p.level,
    online:()=>true,renown:()=>20,killXp:N.renownKillXp,luck:p=>p.stats.luck,now:()=>Date.UTC(2026,10,2,7),
    size:(loc,online)=>{const size=Layout.builtSizeFor(loc,{online});return size==='full'?Label.dungeonSizeClass(Curated.curatedLocation(loc)):size},identity:I.dungeonIdentity,veins:V.dungeonVeins,
    eliteSlots:(key,elite)=>Elite.pickDungeonElites(Array.from({length:4},()=>({mobileType:128,reaction:'hostile'})),key,{elite,classLevel:Infinity}),
    aurumKey:loc=>A.aurumCacheDungeonKey(I.dungeonIdOf(loc.mapTableData.mapId)),aurumAmount:A.aurumCacheAurumOf,
    respawn:Resp.dungeonRespawnMs,weapon:()=>({material:0,name:'Iron sword'}) };
}

test('native data produce personalized forecasts, correct loot/renown units and read-only enemy/ore facts', native, async () => {
  const tools=await nativeTools(),p=place(),player={level:20,skills:Array(35).fill(140),stats:{luck:50}};
  const random=await load('src/formats/dfRandom.js');random.setSeed(12345);const seed=random.getSeed();
  const before=JSON.stringify([p,player,tools.basics]);
  const m=M.forecast(p,player,tools);
  assert.equal(m.ready,true);assert.equal(m.rank,14);assert.equal(m.family,'undead');
  assert.equal(m.rows.length,2);assert.ok(m.rows.every(r=>r.probability===.5||Math.abs(r.probability-.5)<1e-10));
  assert.ok(Math.abs(m.boss-1)<1e-10);assert.ok(Math.abs(m.blocked-1)<1e-10);assert.equal(m.respawn,20*60000);assert.ok(m.aurum>=5&&m.aurum<=10);
  assert.ok(m.veins.length>=1&&m.veins.length<=4);assert.ok(m.scores.renown>=0&&m.scores.renown<=5);
  assert.ok(m.chances.magic>m.chances.rare&&m.chances.rare>m.chances.legendary);
  const highLuck=M.forecast(p,{...player,stats:{luck:100}},tools);assert.ok(highLuck.chances.legendary>m.chances.legendary);
  const daedric=M.forecast(p,player,{...tools,weapon:()=>({material:9})});assert.equal(daedric.blocked,0);
  const stronger=M.forecast(p,{...player,level:30},tools);assert.ok(stronger.damage>m.damage,'native hero threat includes character level');
  const elite=M.forecast(place({elite:true}),player,tools);assert.equal(elite.respawn,40*60000);assert.equal(elite.hp,m.hp*2);
  assert.equal(JSON.stringify([p,player,tools.basics]),before,'forecasts never mutate locations, players or native tables');
  assert.equal(random.getSeed(),seed,'size, resources and forecasts never change the shared RNG seed');
});

test('pure size rules match actual native layouts; elite budgets do not touch the shared RNG',native,async()=>{
  const tools=await nativeTools(),Layout=await load('src/world/smallerDungeons.js'),Label=await load('src/world/dungeon/dungeonLabel.js'),random=await load('src/formats/dfRandom.js');
  const sizes=new Set(),budgets=new Set();
  for(const blocks of [3,5,8,24])for(let id=12345;id<12357;id++){
    const loc=place().loc;loc.mapTableData.mapId=id;loc.dungeon.recordElement.header.locationId=id;
    loc.dungeon.blocks=Array.from({length:blocks},(_,i)=>({x:i%6,z:Math.floor(i/6),blockName:i%4===0?'B0000000.RDB':`N000000${i%4}.RDB`}));
    const expected=Label.dungeonSizeClass(Layout.dungeonLocationFor(loc,{online:true}));
    random.setSeed(34567);const seed=random.getSeed();
    assert.equal(tools.size(loc,true),expected);sizes.add(expected);
    const normal=tools.eliteSlots(id,false),elite=tools.eliteSlots(id,true);budgets.add(normal);
    assert.ok(normal===0||normal===1);assert.ok(elite===3||elite===4);
    assert.equal(random.getSeed(),seed);
  }
  assert.deepEqual([...sizes].sort(),['large','medium','small']);assert.deepEqual([...budgets].sort(),[0,1]);
});

test('unsupported and event/zone dungeons do not acquire fabricated ratings or markers',()=>{
  for(const loc of [{hasDungeon:false},{hasDungeon:true,superTier:true,mapTableData:{dungeonType:0}},{hasDungeon:true,wildHall:true,mapTableData:{dungeonType:0}},{hasDungeon:true,mapTableData:{dungeonType:99}}])assert.equal(M.eligible(loc),false);
  const m=M.forecast(place(),{level:20,skills:[]},{});assert.equal(m.ready,false);assert.equal(m.scores.threat,null);assert.equal(m.scores.loot,null);assert.equal(m.meanLevel,null);assert.equal(m.hp,null);
});

test('spawned dungeon timer formats remaining lifetime cleanly as "Исчезнет через: X ч. Yм."', () => {
  assert.equal(M.formatRemaining(30720000), '8 ч. 32м.');
  assert.equal(M.formatRemaining(300000), '0 ч. 05м.');
  assert.equal(M.formatRemaining(60000), '0 ч. 01м.');
  assert.equal(M.formatRemaining(0), 'срок истёк');
  assert.equal(M.formatRemaining(-5000), 'срок истёк');
  assert.equal(M.formatRemaining(NaN), 'срок истёк');

  const now = 1000000000;
  const tools = {
    now: () => now,
    spawnRecord: () => ({ seen: 10 }),
    spawnDeath: () => 100,
    wallTime: () => now + 30720000,
  };
  const spawned = place({ spawned: true });
  const life = M.lifetime(spawned, tools);
  assert.equal(life.kind, 'spawned');
  assert.equal(life.remaining, '8 ч. 32м.');
  assert.equal(life.timerText, 'Исчезнет через: 8 ч. 32м.');
  assert.equal(life.text, 'порождённый, Исчезнет через: 8 ч. 32м.');

  const expiredTools = { ...tools, wallTime: () => now - 1000 };
  const expLife = M.lifetime(spawned, expiredTools);
  assert.equal(expLife.expired, true);
  assert.equal(expLife.remaining, 'срок истёк');
  assert.equal(expLife.timerText, 'срок истёк');
  assert.equal(expLife.text, 'порождённый, срок истёк');
});

test('forecast cleans coordinates and redundant Elite prefix from dungeon name and title', () => {
  const p = place({ name: "Elite Hawkwind's Hold (396,344)", mapTableData: { dungeonType: 0 } });
  const f = M.forecast(p, { level: 20, skills: [] }, { size: () => 'Medium' });
  assert.equal(f.name, "Hawkwind's Hold");
  assert.equal(f.rawName, "Elite Hawkwind's Hold (396,344)");
  assert.match(f.title, /\[Крипта - \? ранг\] M Hawkwind's Hold/);
});

test('dungeon transform decorates travelView marks loop with dfoDungeon preservation', () => {
  const { transformDungeons } = require('../src/mod/dungeon-transform.cjs');
  const dummy = 'for(let t of e.marks?.()??[]){let e=l(t.at);d.push({key:t.key,x:e?.x??0,y:e?.y??0});}e.hud.update({marks:d,routeDots:[]});';
  const log = [];
  const out = transformDungeons('assets/travelView-test.js', dummy, log);
  assert.deepEqual(log, [['dungeon.travelView', 1]]);
  assert.ok(out.includes('d.push({dfoDungeon:t.dfoDungeon,key:t.key,'));
});

test('the cached projection of 0.1.14574+: dungeon data and quiet labels go into the record builder and its updater', () => {
  const { transformDungeons } = require('../src/mod/dungeon-transform.cjs');
  const { transformAsset } = require('../src/mod/transforms.cjs');
  // The release's own shape: one record per mark key, built by rl and refreshed in place by il.
  const dummy = 'function rl(e,t){return{key:e.key,x:t?.x??0,y:t?.y??0,front:!!t?.front,label:e.label}}'
    + 'function il(e,t,n){e.key=t.key,e.x=n?.x??0,e.y=n?.y??0,e.front=!!n?.front,e.label=t.label}'
    + 'function ne(){let d=t=>e.project&&t?e.project(t):null,f=e.route?.()??[];K++;let p=[],g=0;for(let t of e.marks?.()??[]){let e=d(t.at),n=nl(t),r=G.get(t.key);'
    + 'r?.frame===K?p.push(rl(t,e)):(r?.fields===n?il(r.record,t,e):G.set(t.key,r={fields:n,frame:0,record:rl(t,e)}),r.frame=K,g++,p.push(r.record))}e.hud.update({marks:p,routeDots:[]})}';
  const log = [];
  const out = transformDungeons('assets/travelView-test.js', dummy, log);
  assert.deepEqual(log, [['dungeon.travelView', 1]]);
  assert.ok(out.includes('function rl(e,t){return{dfoDungeon:e.dfoDungeon,key:e.key,'));
  assert.ok(out.includes('function il(e,t,n){e.dfoDungeon=t.dfoDungeon,e.key=t.key,'));
  // Every hook of the full chain finds its place, in any order, and each only once.
  const all = transformAsset('assets/travelView-test.js', dummy, { fonts: true, marks: true, dungeons: true });
  for (const id of ['dungeon.travelView', 'fonts.mapProject', 'town.markFilter']) assert.ok(all.log.some(([k, n]) => k === id && n === 1), id);
  assert.ok(all.text.includes('return{...globalThis.__dfoFonts?.calibration.mark(e),dfoDungeon:e.dfoDungeon,key:e.key,'));
  assert.ok(all.text.includes('Object.assign(e,{dfoSmall:!1,dfoQuiet:!1},globalThis.__dfoFonts?.calibration.mark(t)),e.dfoDungeon=t.dfoDungeon,e.key=t.key,'));
  assert.ok(all.text.includes('(e.marks?.()??[])){let e=d(t.at),n=nl(t),'), 'the town filter keeps the declaration going');
  // The record functions run: a reused record loses a stale dungeon and quiet flag.
  const fn = new Function('globalThis', all.text.split('function ne(')[0] + ';return {rl,il};')({ __dfoFonts: { calibration: { mark: m => (m.far ? { dfoSmall: true, dfoQuiet: true } : {}) } } });
  const record = fn.rl({ key: 'a', far: true, dfoDungeon: { s: 1 } }, { x: 1, y: 2, front: true });
  assert.deepEqual([record.dfoQuiet, record.dfoDungeon], [true, { s: 1 }]);
  fn.il(record, { key: 'a' }, { x: 3, y: 4, front: true });
  assert.deepEqual([record.dfoQuiet, record.dfoSmall, record.dfoDungeon, record.x], [false, false, undefined, 3]);
});

test('lifetime reads the real ledger deadline; missing records stay unknown and permanent dungeons have no timer', native, async()=>{
  const {spawnDeath}=await load('src/world/spawnedDungeons.js'),{sharedClassicMinutes,wallMsForClassicMinutes}=await load('src/net/wire.js');
  const now=Date.UTC(2026,10,2,12),minutes=sharedClassicMinutes(now),rec={seen:minutes-60,cleared:minutes-20};
  const tools={spawnRecord:()=>rec,spawnDeath,wallTime:wallMsForClassicMinutes,now:()=>now};
  const value=M.lifetime(place({spawned:true}),tools);assert.equal(value.expires,wallMsForClassicMinutes(spawnDeath(rec)));assert.equal(value.cleared,true);
  assert.equal(M.lifetime(place({spawned:true}),{...tools,spawnRecord:()=>null}).expires,undefined);
  assert.match(M.lifetime(place({spawned:true}),{...tools,spawnRecord:()=>null}).text,/неизвестен/);
  assert.equal(M.lifetime(place(),tools).kind,'permanent');
});

test('shared cache preserves town, loot and dungeon notes across writes; note payloads cannot persist entities',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dfo-intel-store-'));
  try{
    const store=createLootStore(dir),at=Date.now(),note={id:'12345',at,online:true,counts:[{type:28,count:3,items:[{uid:'never'}]}],alive:2,dead:1,items:[{uid:'never'}]};
    store.replaceCityCache({towns:{a:{}}});store.saveSettings({revision:0});store.saveDungeonNote(note);
    store.replaceCityCache({towns:{b:{}},dungeons:{evil:note}});
    assert.equal(store.state().revision,1);assert.deepEqual(store.read().towns,{b:{}});assert.equal(store.dungeonNotes().length,1);
    const disk=fs.readFileSync(path.join(dir,'dfo-mod-cache.json'),'utf8');assert.ok(!disk.includes('never'));
    assert.equal(store.saveDungeonNote({...note,at:at-1,dead:2}).dead,1,'older observations cannot overwrite newer ones');
    const handle=wrap(async()=>new Response('404',{status:404}),{app:{getPath:()=>dir}});
    const res=await handle(new Request('dagger://game/dfo-mod/dungeon-notes'));assert.equal(res.status,200);assert.equal((await res.json()).notes[0].counts[0].type,28);
    const wrong=await handle(new Request('dagger://game/dfo-mod/dungeon-notes',{method:'POST',body:'{"id":"../../etc","at":1}'}));assert.equal(wrong.status,400);
    assert.throws(()=>store.saveDungeonNote({...note,at:Date.now()+600000}));
    assert.deepEqual(M.cleanNote({...note,counts:[null,{},'bad',{type:28,count:3}]}).counts,[{type:28,count:3}]);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('unknown source signatures are unchanged and logged; dungeon scripts respect the feature switch',()=>{
  const log=[];assert.equal(transformDungeons('assets/world-abcd.js','original',log),'original');assert.match(log[0][0],/!error/);
  const html='<head><script type="module" src="/assets/main.js"></script></head>';
  assert.ok(injectPage(html,'./',{}).includes('dfo_dungeons.js'));assert.ok(!injectPage(html,'./',{dungeons:false}).includes('dfo_dungeons.js'));
});
