'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const M = require('../src/mod/page/dfo_dungeon_live_model.js');
// The model's words come from the install's pack; these checks read the Russian one (each test file runs alone in CI).
globalThis.__dfoUi = require('../src/mod/item-text.cjs').uiText('ru');
const { createLootStore } = require('../src/mod/loot-store.cjs');
const foe = (type, extra = {}) => ({ mobileType: type, entity: { level: 12, health: 15, maxHealth: 20, ...extra }, src: {}, ai: { isHostile: true } });

test('live enemy counts distinguish individual elites, dungeon scaling, allies and deleted/network records', () => {
  const a = foe(1), elite = foe(1, { eliteFoe: true, bossTraits: ['swift'] }), scaled = foe(1, { elite: true });
  const foes = [a, a, elite, scaled, { ...foe(2), dead: true }, { ...foe(2), corpse: true }, { ...foe(2), _gone: true }, { ...foe(2), _absentHere: true }, { ...foe(2), companion: 0 }, { ...foe(2), src: { allied: true } }, foe(2, { team: 'PlayerAlly' }), { ...foe(2), _pupMismatch: true }];
  const before = JSON.stringify(foes), result = M.enemies(foes, { enemyName: () => '<img src=x>', traits: e => e.bossTraits || [] });
  assert.equal(result.count, 3);assert.equal(result.elites, 1);assert.equal(result.rows.length, 3);assert.equal(result.syncing, true);
  assert.ok(result.rows.find(r => r.mods.includes('Усиление данжа')));assert.ok(result.rows[0].mods.includes('swift'));
  assert.equal(JSON.stringify(foes), before);assert.equal('bosses' in result, false);
});
test('player counts use room membership including distant players, preserve private room identity and flag capped/reconnecting data', () => {
  const room = 'dungeon:m123.i42.1', session = { room, status: 'open', _rooms: new Map([[room, new Set(['a', 'b'])]]), peers: new Map([['a', {}], ['b', { shown: null }]]) };
  assert.deepEqual(M.players(session, 123, true), { count: 3, complete: true, connected: true, note: 'Включая вас; участники этой сетевой комнаты.' });
  assert.equal(M.players(session, 1234, true).count, null);
  session._rooms.set(room, new Set(Array.from({ length: 64 }, (_, i) => String(i))));assert.equal(M.players(session, 123, true).complete, false);
  session.roomCount = 101;assert.equal(M.players(session, 123, true).count, 101);
  session.status = 'connecting';assert.equal(M.players(session, 123, true).count, null);assert.equal(M.players(null, 123, false).count, 1);
});
test('quests match active UIDs and exact dungeon map IDs without touching tracking or advancing a quest', () => {
  const q = (uid, mapId) => ({ uid, displayName: 'Одинаковое имя', resources: new Map([['place', { siteDetails: { siteType: 2, mapId } }]]) });
  const a = q(1, 123), b = q(2, 123), c = q(3, 1234), ended = { ...q(4, 123), questComplete: true }, hidden = q(5, 123);
  const bridge = { machine: { quests: new Map([a, b, c, ended, hidden].map(q => [q.uid, q])) }, questLog: () => ({ active: [1, 2, 3, 4].map(id => ({ id })) }) };
  assert.deepEqual(M.quests(bridge, { mapTableData: { mapId: 123 } }, []).map(q => q.uid), ['1', '2']);
  assert.equal(a.questComplete, undefined);assert.equal(bridge.machine.quests.size, 5);
});
test('compact counters share live filtering without evaluating journal, forecast, names or chest state', () => {
  const elite=foe(1,{eliteFoe:true}),ordinary=foe(2),room='dungeon:m123.i9',session={room,status:'open',_rooms:new Map([[room,new Set(['far-away'])]]),peers:new Map()};
  const forbidden=()=>assert.fail('compact HUD must only read live counts'),live={location:{mapTableData:{mapId:123}},foes:[ordinary,ordinary,elite,{...foe(3),dead:true},{...foe(4),companion:0}],regen:forbidden};
  Object.defineProperties(live,{questBridge:{get:forbidden},aurum:{get:forbidden}});
  const tools={online:()=>true,enemyName:forbidden,traits:forbidden,aurumAmount:forbidden},world={presence:()=>session};
  const a=M.counters(live,world,tools);assert.deepEqual(a.enemies,{count:2,elites:1,syncing:false});assert.equal(a.players.count,2);
  elite.dead=true;session._rooms.get(room).clear();assert.equal(M.counters(live,world,tools).enemies.elites,0);assert.equal(M.counters(live,world,tools).players.count,1);
  ordinary._pupMismatch=true;assert.deepEqual(M.counters(live,world,tools).enemies,{count:0,elites:0,syncing:true});
  session.status='connecting';assert.equal(M.counters(live,world,tools).players.count,null);
  assert.equal(M.counters(live,world,{online:()=>false}).players.count,1);assert.equal(M.counters(null,world,tools),null);
  live.foes=null;assert.deepEqual(M.counters(live,world,tools).enemies,{count:null,elites:null,syncing:true});
});
test('regen is the next individual known recovery in minutes, never a fabricated full dungeon reset', () => {
  assert.equal(M.regen({ now: 10e6, interval: 1200000, stamps: [10e6 - 60000, 10e6 - 300000] }).minutes, 15);
  assert.equal(M.regen({ now: 10e6, interval: 1200000, stamps: [] }).state, 'idle');
  assert.equal(M.regen({ now: null, interval: 1200000, stamps: [0] }).state, 'offline');
  const due = M.regen({ now: 10e6, interval: 1200000, stamps: [0] });assert.equal(due.minutes, 0);assert.equal(due.state, 'due');
});
test('aurum uses personal observed coffer state and keeps unknown separate from not received', () => {
  const tools = { aurumKey: () => 'd123', aurumAmount: () => 7 };
  assert.deepEqual(M.aurum({ open: true }, tools, {}, true), { state: 'taken', amount: 7 });
  assert.equal(M.aurum({ open: false }, tools, {}, true).state, 'unconfirmed');assert.equal(M.aurum(null, tools, {}, true).state, 'unknown');
  assert.equal(M.aurum(null, { aurumKey: () => null }, {}, true).state, 'absent');assert.equal(M.aurum(null, tools, {}, false).state, 'offline');
});
test('dungeon shortcut shares the atomic cache with loot presets, city and observations', () => {
  const os = require('node:os'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfo-live-cache-'));
  try {
    const store = createLootStore(dir);store.saveHotkeys({ loot: 'Mouse5', dungeon: 'NumpadEnter' });
    store.replaceCityCache({ towns: { kept: true }, hotkeys: { dungeon: 'KeyJ' } });
    store.saveSettings({ revision: 0, filter: { mode: 'black', tags: [] } });
    store.saveDungeonNote({ id: '123', at: Date.now(), counts: [], alive: 0 });
    assert.equal(store.dungeonKey(), 'NumpadEnter');assert.equal(store.lootKey(), 'Mouse5');
    assert.throws(() => store.saveHotkeys({ dungeon: 'Mouse6' }));assert.equal(store.dungeonKey(), 'NumpadEnter');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('published dungeon bridge mounts a native overlay, reads the real death clock and routes journal by UID', { skip: !process.env.DFO_UPSTREAM_DIR || !process.env.DFO_BUILD_DIR }, () => {
  const { transformDungeonLive } = require('../src/mod/dungeon-live-transform.cjs');
  const assets = path.join(process.env.DFO_BUILD_DIR, 'assets');
  const file = fs.readdirSync(assets).find(f => f.endsWith('.js') && fs.readFileSync(path.join(assets, f), 'utf8').includes('get uiOverlayActive(){') && fs.readFileSync(path.join(assets, f), 'utf8').includes('lootContents('));
  const log = [], out = transformDungeonLive(file, fs.readFileSync(path.join(assets, file), 'utf8'), log);
  assert.ok(log.some(([id]) => id === 'dungeon.live'));assert.ok(log.some(([id]) => id === 'dungeon.journalDoor'));
  const getter = out.slice(out.indexOf('get dfoDungeonLive(){'), out.indexOf('get uiOverlayActive(){')).replace(/,$/, '');
  const { parse } = require(path.join(process.env.DFO_UPSTREAM_DIR, 'node_modules/acorn'));
  const ast = parse('({' + getter + '})', { ecmaVersion: 'latest' });
  const body = ast.body[0].expression.properties[0].value.body.body.find(n => n.type === 'ReturnStatement').argument;
  const props = new Map(body.properties.map(p => [p.key.name, p.value]));
  const context = {};
  context[props.get('foes').name] = [{ ...foe(1), dead: true, _diedAt: 50000 }];
  context[props.get('location').name] = { name: 'Native dungeon' };context[props.get('aurum').name] = { id: 'd123', open: false };
  context[props.get('questBridge').object.name] = { questBridge: { machine: { quests: new Map([[42, { uid: 42 }]]) } } };
  const reg = /const _dfoStamps=([\w$]+)\.slice\(0,([\w$]+)\)/.exec(getter);context[reg[2]] = 1;
  context[/for\(const [\w$]+ of ([\w$]+)\)/.exec(getter)[1]] = new Set();
  const clock = /return\{now:([\w$]+)\(\),interval:([\w$]+),stamps:_dfoStamps/.exec(getter);context[clock[1]] = () => 100000;context[clock[2]] = 1200000;
  const loot = /for\(const ([\w$]+) of ([\w$]+)\)\{if\(\1===([\w$]+)\)continue;if\(([\w$]+)\(\1\)\)\{const ([\w$]+)=([\w$]+)\(\1\),([\w$]+)=([\w$]+)\.get\(\1\),([\w$]+)=\7\?([\w$]+)\.get\(\1\):null;if\(([\w$]+)\(\1,\5\)\|\|!\5\?\.pile\|\|!\7\|\|!\9\|\|!([\w$]+)\(\7,\9\.items\.length\)\)continue/.exec(getter);
  assert.ok(loot,'native container timer dependencies must remain structural');
  const seen=new Set(['base:empty','base:full','base:open','base:gone','loot:0','loot:1']);
  context[loot[2]]=seen;context[loot[3]]='base:open';context[loot[4]]=key=>key.startsWith('base:');
  context[loot[6]]=()=>({pile:{}});context[loot[8]]=new Map([...seen].map(key=>[key,{empty:key!=='base:full'}]));
  context[loot[10]]=new Map([...seen].map(key=>[key,{items:[{}]}]));context[loot[11]]=key=>key==='base:gone';context[loot[12]]=state=>state.empty;
  const piles=/const _dfoPile=([\w$]+)\[/.exec(getter)[1],at=/const _dfoStamp=([\w$]+)\.get\(/.exec(getter)[1];
  context[piles]=[{items:[]},{items:[{}]}];context[at]=new Map([...seen].map((key,i)=>[key,60000+i]));
  const overlay = /mount:_dfoWin=>\{if\(([\w$]+)&&/.exec(getter)[1];context[overlay] = null;
  const factory = /([\w$]+)=([\w$]+)\("activeQuests",_dfoUid==null/.exec(getter);context[factory[2]] = (_mode, uid) => ({ done: false, focusQuest: uid });
  const live = vm.runInNewContext('({' + getter + ',uiOverlayActive:false}).dfoDungeonLive', context);
  const owner = { done: false };assert.equal(live.mount(owner), true);assert.equal(live.mount({}), false);
  assert.equal(live.owns(owner),true);assert.equal(live.owns({}),false);
  assert.equal(live.regen().stamps[0], 50000);assert.equal(live.regen().interval, 1200000);
  assert.deepEqual([...live.regen().stamps],[50000,60000,60004],'only dead native foes and closed empty live sources contribute; full/open/gone sources do not');
  assert.equal(live.journal('42'), false);live.unmount(owner);assert.equal(live.journal('42'), true);assert.equal(context[overlay].focusQuest, '42');
  assert.equal(context[reg[1]][0]._diedAt, 50000, 'reading does not change the native respawn stamp');
  assert.equal(context[piles][0].items.length,0);assert.equal(seen.size,6,'no loot, generation or timer writes during observation');
});

test('published classic journal selects the requested quest UID even when quest names repeat', {skip:!process.env.DFO_UPSTREAM_DIR||!process.env.DFO_BUILD_DIR},()=>{
  const {transformDungeonLive}=require('../src/mod/dungeon-live-transform.cjs');
  const assets=path.join(process.env.DFO_BUILD_DIR,'assets'),file=fs.readdirSync(assets).find(f=>f.endsWith('.js')&&fs.readFileSync(path.join(assets,f),'utf8').includes('constructor({questMessages:'));
  const log=[],out=transformDungeonLive(file,fs.readFileSync(path.join(assets,file),'utf8'),log);
  assert.ok(log.some(([id])=>id==='dungeon.journalClassic'));
  const {parse}=require(path.join(process.env.DFO_UPSTREAM_DIR,'node_modules/acorn'));
  const start=out.indexOf('constructor({focusQuest:'),method=out.slice(start,out.indexOf('hover(',start));
  const source='(class {'+method+'})',ast=parse(source,{ecmaVersion:'latest'}),ctor=ast.body[0].expression.body.body[0];
  const context={};
  function walk(n){if(!n||typeof n!=='object')return;
    if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.property.name==='includes')context[n.callee.object.name]=['activeQuests'];
    if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.property.name==='playOneShot'){context[n.callee.object.name]={playOneShot(){}};context[n.arguments[0].object.name]={OpenBook:0};}
    if(n.type==='NewExpression')context[n.callee.name]=class{};
    for(const value of Object.values(n))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);
  }walk(ctor);
  const Journal=vm.runInNewContext(source,context),messages=[{parentQuest:{uid:1}},{parentQuest:{uid:1}},{parentQuest:{uid:2}}];
  assert.equal(new Journal({questMessages:()=>messages,focusQuest:'2'}).currentMessageIndex,2);
  assert.equal(new Journal({questMessages:()=>messages,focusQuest:'missing'}).currentMessageIndex,0);
  assert.equal(new Journal({questMessages:()=>messages}).currentMessageIndex,0);
});
