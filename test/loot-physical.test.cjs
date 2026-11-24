'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createSession,dungeonSources,sources}=require('../src/mod/page/dfo_loot.js');
const {flatCollider}=require('./helpers/loot-geometry.cjs');

test('physical visual proxies resolve to original backing piles, never a synthetic storage or a duplicate row',()=>{
  const a={name:'A',stackCount:4},b={name:'B'},hidden={name:'Hidden'},p={id:1,physical:true,pos:[0,0,1],items:[a]},q={id:2,physical:true,pos:[0,0,2],items:[b]};
  const drops={_piles:[p,q,{id:3,physical:true,items:[hidden],owner:'coffer'}],pileFor:key=>drops._piles.find(p=>key===`droppedLoot:${p.id}`),
    physical:{state:()=>[{kind:'pile',item:a,pos:[1,1.35,3]},{kind:'corpse',item:b,pos:[10,10,10]}]},releaseEmptied(){for(const p of drops._piles)if(!p.items.length)p.inactive=true;}};
  const visits=[],api={lootTargets:()=>[{key:'droppedLoot:pi99',pos:[1,1.35,3]},{key:'droppedLoot:2',pos:q.pos},{key:'search:1'}],
    lootContents:key=>drops.pileFor(key)?.items,takeLoot(key,_mode,_keys,visit){visits.push(key);const list=drops.pileFor(key).items;try{return visit(list);}finally{drops.releaseEmptied();}}};
  const entity={items:[]},tools={planTake:it=>({ok:true,amount:it.stackCount??1}),applyTransfer(it,plan,list,bag){
    assert.ok(list===p.items||list===q.items);
    if(plan.amount<(it.stackCount??1)){it.stackCount-=plan.amount;bag.push({...it,stackCount:plan.amount});}else{list.splice(list.indexOf(it),1);bag.push(it);}
  }};
  const host={entity,feet:()=>[0,0,0],eye:()=>[0,1.6,0],collider:()=>flatCollider,sources:()=>dungeonSources(api,drops)};
  const loot=createSession(host,{tools:()=>tools});assert.deepEqual(loot.items(),[b,a]);
  assert.deepEqual(dungeonSources(api,drops).find(s=>s.key==='droppedLoot:1').pos,[1,1.35,3]);
  assert.equal(loot.commit('take',a,2),true);assert.equal(p.items[0].stackCount,2);assert.equal(loot.items().filter(it=>it===a).length,1);
  assert.deepEqual(loot.takeAll(),{taken:2,failed:0,refusal:null});assert.equal(loot.commit('take',a,1),false);
  assert.equal(entity.items.filter(it=>it.name==='A').reduce((n,it)=>n+it.stackCount,0),4);assert.deepEqual(visits,['droppedLoot:1','droppedLoot:2','droppedLoot:1']);
  assert.deepEqual(loot.items(),[]);assert.equal(drops._piles[2].items[0],hidden);
  // Exterior/interior pools use the same current physical position.
  p.inactive=false;p.items.push(a);assert.deepEqual(sources({dropped:()=>drops}).find(s=>s.key==='droppedLoot:1').pos,[1,1.35,3]);
  loot.closed();
});

test('native Shift-drop stays visible with Physical Items on/off and is consumed exactly once through native transfers',{
  skip:!process.env.DFO_UPSTREAM_DIR
},async()=>{
  const path=require('node:path'),{pathToFileURL}=require('node:url'),load=f=>import(pathToFileURL(path.join(process.env.DFO_UPSTREAM_DIR,f)));
  await load('test/modsOff.js');
  const {createDroppedLoot}=await load('src/scenes/droppedLoot.js'),{readPhysicalItemsSettings}=await load('src/systems/physicalItems.js');
  const {planTake,applyTransfer}=await load('src/systems/item/itemTransfer.js'),{Collider}=await load('src/player/collider.js');
  const col=new Collider(()=>0),renderer={createBillboardBatch:()=>({}),destroyBillboardBatch(){},uploadTexture(){},releaseTexture(){}};
  let enabled=true;
  const drops=createDroppedLoot({renderer,getTexture:async()=>({}),uploadRecordFrame(){},physical:{enabled:()=>enabled,settings:()=>readPhysicalItemsSettings(()=>undefined),
    iconOf:async()=>({key:'check',width:4,height:4,colors:new Uint8ClampedArray(64).fill(255)}),mw:{stamp:()=>null,picture:async()=>null}}});
  drops.physical.attach({collider:()=>col});
  const arrow={templateIndex:131,group:'Weapons',name:'Arrow',stackCount:10,currentCondition:50,maxCondition:50};
  const sword={templateIndex:120,group:'Weapons',name:'Longsword',stackCount:1,currentCondition:50,maxCondition:50};
  const piles=drops.dropPhysical([arrow,sword],[0,0,0],[0,0,1]);assert.equal(piles.length,2);
  const tick=async()=>{drops.tickFlats(.02);await new Promise(setImmediate);for(let i=0;i<100;i++)drops.tickFlats(.02);};await tick();
  assert.ok(drops.lootTargets().every(t=>t.key.startsWith('droppedLoot:pi')),'the game exposes only visual proxy targets');
  const entity={items:[],stats:{strength:50,endurance:50},goldPieces:0},visits=[];
  const api={lootTargets:()=>drops.lootTargets(),lootContents:key=>drops.contents(key),takeLoot(key,_mode,_keys,visit){
    assert.match(key,/^droppedLoot:\d+$/,'only canonical backing keys enter the native loot transaction');visits.push(key);
    const p=drops.pileFor(key);if(!p)return false;try{return visit(p.items);}finally{drops.releaseEmptied();}
  }};
  const host={entity,feet:()=>[0,0,0],eye:()=>[0,1.6,0],collider:()=>col,sources:()=>dungeonSources(api,drops)};
  const loot=createSession(host,{tools:()=>({planTake,applyTransfer})});assert.equal(loot.items().length,2);
  enabled=false;await tick();assert.equal(loot.items().length,2,'switching to bags does not duplicate or hide the same records');
  enabled=true;await tick();assert.equal(loot.items().length,2);
  assert.equal(loot.commit('take',arrow,3),true);assert.equal(piles[0].items[0].stackCount,7);await tick();
  assert.equal(loot.items().length,2);assert.equal(loot.takeAll().taken,2);await tick();
  assert.equal(entity.items.filter(it=>it.templateIndex===131).reduce((n,it)=>n+it.stackCount,0),10);
  assert.equal(entity.items.filter(it=>it.templateIndex===120).length,1);assert.equal(drops._piles.length,0);assert.equal(drops.lootTargets().length,0);
  assert.equal(loot.takeAll().taken,0);assert.equal(visits.length,3);loot.closed();
});
