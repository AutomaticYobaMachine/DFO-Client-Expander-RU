'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../src/mod/page/dfo_dungeon_nav_model.js'),Live=require('../src/mod/page/dfo_dungeon_live_model.js');
const {createNavigation}=require('../src/mod/page/dfo_dungeon_nav.js'),{room,quad}=require('./helpers/dungeon-navigation.cjs');
const G=require('../src/mod/page/dfo_dungeon_graph.js');
const native={skip:!process.env.DFO_UPSTREAM_DIR};
const sym=name=>({name,original:'_'+name+'_'});
function fixture(uid=42){
  const entity={items:[]},q={uid,resources:new Map(),tasks:new Map()},resource=(name,kind)=>{
    const r={symbol:sym(name),parentQuest:q,displayName:name,['is'+kind]:true};q.resources.set(name,r);return r;
  };
  const item=resource('relic','Item');item.daggerfallUnityItem={name:'Relic',questItem:true,questUID:uid,questSymbol:sym('relic')};
  const carrier=resource('carrier','Foe');carrier.itemQueue=[item.daggerfallUnityItem];
  q.tasks.set('startup',{triggered:true,actions:[{typeName:'HaveItem',targetItem:sym('relic')}]});
  const b={questUID:uid,targetQuest:q,targetResource:carrier,targetSymbol:sym('carrier')};
  const foe={entity:{items:[]},mobileType:1,ai:{feet:[10,0,6]},questBehaviour:b};
  const quests=new Map([[uid,q]]),ctx={people:[],actions:{objects:new Map()},foes:[foe]};
  const live={ctx,foes:ctx.foes,location:{mapTableData:{mapId:123}},questBridge:{machine:{quests}}};
  const sources={entity},goals=()=>M.targets(live,sources,{},new Set([...quests.keys()].map(String)),'quest').quest;
  return{q,item,carrier,b,foe,entity,quests,ctx,live,sources,resource,goals};
}
test('an item objective routes to its queued carrier without a kill requirement or a pre-generated corpse',()=>{
  const f=fixture(),decoy=f.resource('decoy','Foe');
  f.ctx.foes.unshift({entity:{items:[]},ai:{feet:[3,0,6]},questBehaviour:{questUID:42,targetQuest:f.q,targetResource:decoy,targetSymbol:sym('decoy')}});
  const result=f.goals();assert.equal(result.length,1);assert.deepEqual(result[0].at,[10,0,6]);assert.match(result[0].key,/:carrier:/);
  assert.equal(f.foe.entity.items.length,0);assert.equal(f.carrier.itemQueue[0],f.item.daggerfallUnityItem);
  assert.equal(f.carrier.killCount,undefined);assert.equal(f.q.tasks.get('startup').actions[0].isComplete,undefined);
});
test('carrier to real corpse to world drop to inventory follows live ownership and the actual corpse floor',()=>{
  const f=fixture(),it={...f.item.daggerfallUnityItem,questClone:true};
  const first=f.goals()[0].key;f.foe.dead=true;f.foe.corpse={};f.foe.corpsePos=[8,-3,6];f.foe.entity.items.push(it);
  const body=f.goals();assert.equal(body.length,1);assert.notEqual(body[0].key,first);assert.match(body[0].key,/:body:/);assert.deepEqual(body[0].at,[8,-3,6]);
  f.ctx.corpseKeyOf=()=>null;assert.equal(f.goals().length,0,'A native refusal cannot be replaced with a fabricated corpse key');delete f.ctx.corpseKeyOf;
  f.foe._ownFrom='party-host';assert.equal(f.goals().length,0,'Another host owns the quest body');delete f.foe._ownFrom;
  f.foe.corpseDisabled=true;assert.equal(f.goals().length,0);f.foe.corpseDisabled=false;
  f.foe.entity.items.length=0;
  let taken=false;
  f.ctx.lootTargets=()=>[{key:'droppedLoot:pi1',pos:[7,1.2,2]},{key:'search:0',pos:[2,0,2]}];
  f.ctx.lootContents=key=>key==='droppedLoot:pi1'&&!taken?[it]:[];
  f.ctx.takeLoot=()=>assert.fail('Navigation cannot take, generate or roll an item');
  assert.deepEqual(f.goals().map(t=>t.at),[[7,1.2,2]]);
  taken=true;f.entity.items.push(it);assert.equal(f.goals().length,0);
});
test('quest-linked drops on an ordinary mob use exact UID and symbol, never template/name similarity',()=>{
  const a=fixture(42),b=fixture(43);a.quests.set(43,b.q);a.ctx.foes.length=0;
  for(const [q,at]of [[a,[9,0,2]],[b,[2,0,2]]])a.ctx.foes.push({entity:{items:[{...q.item.daggerfallUnityItem,name:'Same name',templateIndex:275}]},ai:{feet:at}});
  assert.deepEqual(a.goals().map(t=>[t.uid,t.at]),[['42',[9,0,2]],['43',[2,0,2]]]);
  const only=M.targets(a.live,a.sources,{},new Set(['42']),'quest').quest;assert.equal(only.length,1);assert.equal(only[0].uid,'42');
  a.ctx.foes[0].entity.items[0].questSymbol=sym('unknown');assert.equal(a.goals().filter(t=>t.uid==='42').length,0);
});
test('open native objective marks select items, people and places and stop obsolete branches',()=>{
  const f=fixture(),person=f.resource('recipient','Person');
  f.ctx.people.push({active:true,x:3,y:0,z:2,questBehaviour:{questUID:42,targetQuest:f.q,targetSymbol:person.symbol}});
  const rows=new Map([['42',{ql:{objectives:[{state:'open',mark:'relic'}]}}]]);f.sources.questRows=rows;
  assert.match(f.goals()[0].key,/:carrier:/);assert.equal(f.goals().length,1);
  f.entity.items.push({...f.item.daggerfallUnityItem});rows.get('42').ql.objectives=[{state:'done',mark:'relic'},{state:'open',mark:'recipient'}];
  assert.equal(f.goals().length,1);assert.match(f.goals()[0].key,/:person:/);
  const elsewhere=f.resource('elsewhere','Place');elsewhere.siteDetails={siteType:2,mapId:456};
  rows.get('42').ql.objectives=[{state:'open',mark:'elsewhere'}];assert.equal(f.goals().length,0,'Do not fall back to unrelated enemies in this dungeon');
  for(const state of ['done','failed','hidden']){rows.get('42').ql.objectives=[{state,mark:'relic'}];assert.equal(f.goals().length,0);}
});
test('future receipt HaveItem watches do not hide current kill/injury/talk targets; collected carriers stay gone',()=>{
  const f=fixture(),receipt=f.resource('receipt','Item');receipt.daggerfallUnityItem={questUID:42,questSymbol:receipt.symbol};
  f.q.tasks.get('startup').actions=[{typeName:'HaveItem',targetItem:receipt.symbol}];
  assert.ok(f.goals().some(t=>/:foe:/.test(t.key)),'The future reward has no standing carrier yet');
  f.q.tasks.get('startup').actions=[{typeName:'HaveItem',targetItem:f.item.symbol}];f.entity.items.push({...f.item.daggerfallUnityItem});assert.equal(f.goals().length,0);
  f.carrier.killCount=0;f.q.tasks.set('kill',{triggered:false,actions:[{typeName:'KilledFoe',foeSymbol:f.carrier.symbol,killsRequired:1}]});
  assert.ok(f.goals().some(t=>/:foe:/.test(t.key)),'A genuinely remaining kill objective is independent of the carried item');
  f.q.tasks.delete('kill');f.q.tasks.set('hurt',{triggered:false,actions:[{typeName:'InjuredFoe',isTriggerCondition:true,foeSymbol:f.carrier.symbol}]});
  assert.ok(f.goals().some(t=>/:foe:/.test(t.key)),'Retrieving an item does not remove a separate injury/spell/talk goal');
});
test('shared/lazily-bound and resynced behaviours resolve current resources; ended or missing quests never revive',()=>{
  const f=fixture();f.foe.questBehaviour=null;f.ctx.questFoeBehaviour=()=>({questUID:42,targetSymbol:{original:'_carrier_'}});
  assert.match(f.goals()[0].key,/:carrier:/);
  const old=f.carrier;f.q.resources.set('carrier',{...old,itemQueue:[],isHidden:true});assert.equal(f.goals().length,0);
  f.q.resources.set('carrier',old);
  for(const [field,value]of [['questComplete',true],['questTombstoned',true],['shelvedAt',0]]){f.q[field]=value;assert.equal(f.goals().length,0);delete f.q[field];}
  f.quests.clear();assert.equal(f.goals().length,0);
});
test('quest keys survive native pool reordering and unreadable/missing targets fail closed',()=>{
  const f=fixture(),key=f.goals()[0].key;f.ctx.foes.unshift(null,{entity:{items:[]},ai:{feet:[1,0,1]}});
  assert.equal(f.goals()[0].key,key);
  f.ctx.people.push(null);f.foe.ai.feet=[NaN,0,0];assert.equal(f.goals().length,0);
  f.foe.dead=true;f.foe.corpse={};f.foe.corpsePos=[4,0,4];f.foe.entity.items=[f.item.daggerfallUnityItem];
  f.ctx.lootContents=()=>{throw Error('waiting for room terms')};assert.equal(f.goals().length,0);
});
test('non-quest routes never inspect the quest machine, inventories, journal or loot lists',()=>{
  const fail=()=>assert.fail('No quest scan for an exit/aurum/elite route'),live={ctx:{exitDoors:[],people:[]},foes:[]};
  Object.defineProperty(live,'questBridge',{get:fail});live.ctx.lootTargets=fail;
  for(const kind of ['exit','aurum','elite'])assert.doesNotThrow(()=>M.targets(live,{}, {},null,kind));
});
test('dungeon quest list includes item-only and party-bound quests and their unlogged state without map-id guesses',()=>{
  const f=fixture();f.live.questBridge.questLog=()=>({active:[],unlogged:[{id:42,ql:{objectives:[{state:'open',text:'Find the relic'}]}}]});
  f.foe.questBehaviour=null;f.foe.entity.items.push(f.item.daggerfallUnityItem);
  assert.deepEqual(Live.quests(f.live.questBridge,f.live.location,f.ctx.foes,f.ctx)[0].objectives,['Find the relic']);
  f.foe.entity.items.length=0;f.ctx.questFoeBehaviour=()=>f.b;
  assert.equal(Live.quests(f.live.questBridge,f.live.location,f.ctx.foes,f.ctx).length,1);
  delete f.ctx.questFoeBehaviour;
  assert.equal(Live.quests(f.live.questBridge,f.live.location,[],f.ctx,[{active:true,behaviour:{questUID:42}}]).length,1,'A placed item/NPC is enough even without Place metadata');
});
test('large sets of linked item copies read ownership once per resource per snapshot and keep no stale held cache',()=>{
  const f=fixture();let held=false,reads=0;f.q.hooks={carriesQuestItem:()=>{reads++;return held}};
  f.ctx.foes.length=0;
  for(let i=0;i<400;i++)f.ctx.foes.push({entity:{items:[{...f.item.daggerfallUnityItem}]},ai:{feet:[i,0,6]}});
  assert.equal(f.goals().length,400);assert.equal(reads,1);
  held=true;assert.equal(f.goals().length,0);assert.equal(reads,2,'A new snapshot reads current ownership again');
});
test('original HaveItem/GiveItem queue and native behaviour work without any KilledFoe action',native,async()=>{
  const path=require('node:path'),{pathToFileURL}=require('node:url'),load=p=>import(pathToFileURL(path.join(process.env.DFO_UPSTREAM_DIR,p)));
  const [{Quest},{Item},{Foe},{Task},{Symbol:Sym},{GiveItem,HaveItem},{QuestResourceBehaviour}]=await Promise.all(['src/systems/quest/quest.js','src/systems/quest/item.js','src/systems/quest/foe.js','src/systems/quest/task.js','src/systems/quest/symbol.js','src/systems/quest/actions.js','src/systems/quest/resourceBehaviour.js'].map(load));
  const inventory=[],q=new Quest({rolls:()=>.5,hooks:{carriesQuestItem:r=>inventory.some(it=>it.questUID===q.uid&&it.questSymbol.name===r.symbol.name)}});
  const item=new Item(q),foe=new Foe(q);item.symbol=new Sym('_relic_');foe.symbol=new Sym('_carrier_');
  item.daggerfallUnityItem={questItem:true,questUID:q.uid,questSymbol:item.symbol,name:'Relic',stackCount:1};
  q.resources.set('relic',item);q.resources.set('carrier',foe);const found=new Task(q);found.symbol=new Sym('_found_');q.tasks.set('found',found);
  const startup=new Task(q);startup.triggered=true;
  const give=new GiveItem().createNew('give item _relic_ to _carrier_',q),have=new HaveItem().createNew('have _relic_ set _found_',q);startup.actions=[give,have];q.tasks.set('startup',startup);
  give.update(startup);assert.equal(foe.itemQueue[0],item.daggerfallUnityItem);
  const machine={quests:new Map([[q.uid,q]]),getQuest:uid=>uid===q.uid?q:null};
  const b=new QuestResourceBehaviour(machine);b.assignResource(foe); // deliberately before cacheTarget's first update
  const actor={entity:{items:[]},ai:{feet:[10,0,6]},questBehaviour:b},ctx={people:[],foes:[actor]},live={ctx,foes:ctx.foes,questBridge:{machine}};
  const targets=()=>M.targets(live,{}, {},new Set([String(q.uid)]),'quest').quest;
  assert.match(targets()[0].key,/:carrier:/);assert.equal(b.targetResource,null,'Looking does not cache/update the native behaviour');
  b.addItemQueue(foe,{hasCorpseLootContainer:()=>false,addItemsToEntity:items=>actor.entity.items.push(...items)});
  assert.equal(actor.entity.items[0].questClone,true);actor.dead=true;actor.corpse={};actor.corpsePos=[9,-3,6];assert.match(targets()[0].key,/:body:/);
  inventory.push(actor.entity.items.pop());have.update(startup);assert.equal(found.triggered,true);assert.equal(targets().length,0);
  assert.equal(foe.killCount,0,'Retrieving the drop never requires a kill counter');
});
test('a real graph route switches carrier to corpse/drop and stops when the item is gone',native,async()=>{
  const r=await room(),f=fixture(),nav={feet:r.from,collider:r.col,key:'quest-room',transitions:()=>[]};let time=10000;
  f.ctx.actions=r.actions;const api=createNavigation({read:()=>({live:f.live,nav,sources:f.sources,tools:{},questIds:new Set(['42']),room:'room'}),now:()=>time});
  const settle=async()=>{for(let i=0;i<300;i++){await new Promise(setImmediate);time+=20;api.tick();if(api.state().phase==='following')return;}assert.fail(JSON.stringify(api.state()));};
  assert.equal(api.start('quest','42'),true);await settle();assert.match(api.state().name,/relic/);
  f.foe.dead=true;f.foe.corpse={};f.foe.corpsePos=[8,0,2];f.foe.entity.items.push({...f.item.daggerfallUnityItem});time+=500;api.tick();await settle();assert.ok(M.distance(api.points().at(-1),[8,0,2])<=2.25);
  f.foe.entity.items.length=0;time+=500;api.tick();assert.equal(api.state().phase,'unavailable');assert.equal(api.points().length,0);api.stop(true);
});
test('quest items on a raised surface get a supported visible approach; walls and other floors still block it',native,async()=>{
  const r=await room();quad(r.col,'table',[[9,1.2,5],[11,1.2,5],[11,1.2,7],[9,1.2,7]]);
  const graph=new G.Graph();await graph.build(await G.snapshot(r.col,r.actions));
  const route=await graph.route(r.from,[{key:'table-item',kind:'quest',reach:2.25,at:[10,1.2,6]}]);
  assert.ok(route);assert.equal(route.points.at(-1)[1],0,'Approach the table from its real floor');
  assert.ok(M.distance(route.points.at(-1),[10,1.2,6])<=2.25);
  const hidden=await graph.route(r.from,[{key:'outside',kind:'quest',reach:2.25,at:[16,0,6]}]);assert.equal(hidden,null,'No sight ray through the room wall');
  const upper=await graph.route(r.from,[{key:'upper',kind:'quest',reach:2.25,at:[3,4,6]}]);assert.equal(upper,null,'Do not attach to an unrelated lower storey');
  assert.equal(M.goalReached({kind:'quest',reach:2.25,at:[15.5,0,6]},[13.5,0,6],r.col),false,'Close across a wall is not arrival');
  assert.equal(M.goalReached({kind:'quest',reach:2.25,at:[3,0,6]},[1,0,6],r.col),true);
  assert.equal(M.goalReached({kind:'quest',reach:2.25,at:[3,0,6]},[1,0,6],{raycastHit:()=>({dist:NaN})}),false);
});
test('an in-flight carrier result is discarded when the mob dies; the same graph then routes to the corpse',native,async()=>{
  const r=await room(),f=fixture(),nav={feet:r.from,collider:r.col,key:'room'},pending=[];let builds=0,time=10000;
  const api=createNavigation({read:()=>({live:f.live,nav,sources:f.sources,questIds:new Set(['42']),room:'room'}),now:()=>time,
    makeGraphClient:()=>({async build(){builds++;},route:(from,targets)=>new Promise(resolve=>pending.push({resolve,from,target:targets[0]})),dispose(){}})});
  const wait=async count=>{for(let i=0;i<200&&pending.length<count;i++)await new Promise(r=>setTimeout(r,2));assert.equal(pending.length,count,JSON.stringify(api.state()));};
  api.start('quest','42');await wait(1);f.foe.dead=true;f.foe.corpse={};f.foe.corpsePos=[8,0,2];f.foe.entity.items.push({...f.item.daggerfallUnityItem});
  const complete=p=>p.resolve({target:p.target,points:[p.from,p.target.at],kinds:['walk','walk'],distance:M.distance(p.from,p.target.at)});
  complete(pending[0]);await new Promise(setImmediate);assert.equal(api.points().length,0,'Never draw the old live-carrier result');
  time+=2000;api.tick();await wait(2);assert.match(pending[1].target.key,/:body:/);complete(pending[1]);await new Promise(setImmediate);
  assert.equal(api.state().phase,'following');assert.equal(builds,1);api.stop(true);
});
