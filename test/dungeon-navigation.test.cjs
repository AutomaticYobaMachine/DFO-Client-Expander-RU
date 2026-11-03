'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../src/mod/page/dfo_dungeon_nav_model.js'),{createNavigation}=require('../src/mod/page/dfo_dungeon_nav.js');
const {room,quad}=require('./helpers/dungeon-navigation.cjs');
const native={skip:!process.env.DFO_UPSTREAM_DIR};
const settle=async(c,predicate=s=>['following','unavailable'].includes(s.phase))=>{for(let i=0;i<200;i++){await new Promise(r=>setTimeout(r,2));c.tick();if(predicate(c.state()))return c.state();}assert.fail('navigation did not settle: '+JSON.stringify(c.state()));};
function controller(r,extra={}){
  let time=10000,current;
  const ctx={actions:r.actions,exitDoors:[{pos:[12,0,6]}],foes:[],people:[],enemies:[]};
  const live={ctx,foes:ctx.foes,aurum:{id:'d1',open:false,foot:[11,0,8]}};
  const nav={feet:Float32Array.from(r.from),collider:r.col,key:'d1',mesh:r.mesh,transitions:[]};
  current={live,nav,sources:{},tools:{enemyName:()=> 'Enemy'},room:'dungeon:m1'};
  const api=createNavigation({read:()=>current,native:()=>r.native,now:()=>time,makeClient:()=>({bake:async()=>({chf:r.mesh}),dispose(){}}),...extra});
  return{api,ctx,live,nav,get current(){return current},set current(x){current=x},advance(n=1000){time+=n;api.tick();}};
}
test('navigation targets keep individual elites and exact active quest identities without changing the game',()=>{
  const q={uid:42},b={questUID:42,targetQuest:q,targetResource:{displayName:'Item'}};
  const foe=(elite,other={})=>({entity:{eliteFoe:elite,elite:true},ai:{feet:Float32Array.from([1,0,2])},...other});
  const live={ctx:{exitDoors:[{pos:[0,0,2]}],people:[]},foes:[foe(true),foe(false),foe(true,{dead:true}),foe(true,{companion:1}),foe(false,{questBehaviour:b})],aurum:{id:'d1',foot:[3,0,0],open:false}};
  const sources={stands:[{active:true,behaviour:b}],boxOf:()=>({min:[4,0,3],max:[5,1,4]})};
  const before=JSON.stringify(live),out=M.targets(live,sources,{},new Set(['42']));
  assert.equal(out.elite.length,1);assert.equal(out.exit.length,1);assert.equal(out.aurum.length,1);assert.equal(out.quest.length,2);assert.equal(JSON.stringify(live),before);
  q.questComplete=true;assert.equal(M.targets(live,sources,{}).quest.length,0);
  q.questComplete=false;b.targetResource.isHidden=true;assert.equal(M.targets(live,sources,{}).quest.length,0);
  live.aurum.open=true;assert.equal(M.targets(live,sources,{}).aurum.length,0);
});
test('a failed worker never falls back to baking the dungeon on the main thread',async()=>{
  let baked=0,disposed=0;const ctx={exitDoors:[{pos:[5,0,0]}],actions:{objects:new Map()},people:[],foes:[]};
  const view={live:{ctx,foes:[]},nav:{feet:[0,0,0],key:'test',mesh:null,collider:{}},room:'dungeon:m1',sources:{},tools:{}};
  const api=createNavigation({read:()=>view,native:()=>({solve(){assert.fail('no query without a mesh')},Draw:class{},isDoor:()=>false}),makeClient:()=>({_hadWorker:false,bake(){baked++;},dispose(){disposed++;}})});
  assert.equal(api.start('exit'),true);await new Promise(r=>setTimeout(r,0));assert.equal(api.state().phase,'unavailable');assert.match(api.state().message,/Фоновый расчёт/);assert.equal(baked,0);assert.equal(disposed,1);assert.equal(api.points().length,0);
});
test('native navmesh and collider route around a wall, and every displayed segment stays on the floor',native,async()=>{
  const r=await room({pillar:true}),target={key:'goal',at:[12,0,6]};
  const result=await M.plan(r.mesh,r.native,r.from,target,r.col);
  assert.ok(result,'a supported path exists around the pillar');assert.ok(result.points.some(p=>p[2]<3||p[2]>9));
  for(const p of result.points)assert.ok(Math.abs(p[1])<.05);
  for(let i=1;i<result.points.length;i++)assert.equal(M.clearance(r.col,result.points[i-1],result.points[i]),null);
});
test('stacked floors are never joined by a straight line; a connected ramp reaches its own upper floor',native,async()=>{
  const split=await room({stacked:true});assert.equal(await M.plan(split.mesh,split.native,[2,0,6],{at:[2,3,6]},split.col),null);
  const r=await room({ramp:true}),result=await M.plan(r.mesh,r.native,[2,0,6],{at:[2,3,6]},r.col);
  assert.ok(result,'the route must use the ramp, not jump vertically');assert.ok(result.points.some(p=>p[0]>10));assert.ok(result.points.at(-1)[1]>2.9);
});
test('unlocked doors pause the visible line and opening resumes it; locked doors are walls',native,async()=>{
  const r=await room({door:true}),target={at:[12,0,6]};
  const route=await M.plan(r.mesh,r.native,r.from,target,r.col,['door:1']);assert.ok(route);
  const blocked=M.visible(route.points,r.col,r.actions,r.native);assert.equal(blocked.blocked,'door');assert.ok(blocked.points.at(-1)[0]<7);
  r.shift[2]=20;assert.equal(M.visible(route.points,r.col,r.actions,r.native).blocked,null);
  r.shift[2]=0;r.actions.objects.get('door:1').currentLockValue=20;
  const locked=r.bake();assert.equal(await M.plan(locked,r.native,r.from,target,r.col),null);
  assert.equal(await M.plan(locked,r.native,[6,0,6],{at:[7.3,0,6]},r.col),null,'a nearby approach point across a thin locked door is not a reachable goal');
});
test('floor validation rejects gaps and a newly lowered ceiling even when the old mesh has a route',native,async()=>{
  const r=await room();quad(r.col,'low-ceiling',[[5,1.4,0],[8,1.4,0],[8,1.4,12],[5,1.4,12]]);
  assert.equal(await M.plan(r.mesh,r.native,r.from,{at:[12,0,6]},r.col),null);
  const before=JSON.stringify(r.from);assert.equal(M.floor({raycastHit:()=>({dist:Infinity})},r.from),null);assert.equal(JSON.stringify(r.from),before);
});
test('known teleporter edges keep their direction and show only the leg before the transition',native,async()=>{
  const r=await room({stacked:true}),target={at:[2,3,6],key:'up'},transition={entrance:{pos:[11,1,6],yawDeg:0},exit:{pos:[8,3.2,6],yawDeg:0}};
  const result=await M.planConnected(r.mesh,r.native,[2,0,6],target,r.col,[],[transition]);
  assert.ok(result?.transition);assert.ok(result.points.every(p=>Math.abs(p[1])<.05));
  assert.equal(await M.planConnected(r.mesh,r.native,[2,3,6],{at:[2,0,6]},r.col,[],[transition]),null,'a one-way step cannot be used backwards');
});
test('controller tracks target movement/death, chooses reachable elite by walking distance and tears down on exit',native,async()=>{
  const r=await room({pillar:true}),h=controller(r),mk=p=>({entity:{eliteFoe:true},ai:{feet:p}});
  h.ctx.foes.push(mk([8,0,6]),mk([2,0,10]));assert.equal(h.api.start('elite'),true);
  const s=await settle(h.api);assert.equal(s.phase,'following');assert.ok(s.distance<6,'nearby reachable elite wins over one behind a wall');
  h.ctx.foes[1].dead=true;h.advance();await settle(h.api);assert.ok(h.api.state().distance>8);
  h.ctx.foes[0].ai.feet=[12,0,2];h.advance();assert.equal(h.api.points().length,0,'old line is hidden during a replan');await settle(h.api);assert.equal(h.api.state().phase,'following');
  h.current=null;h.advance();assert.equal(h.api.state().phase,'idle');assert.equal(h.api.points().length,0);
});
test('cancelled worker results cannot restore a route after exit or replace a newer request',native,async()=>{
  const r=await room();let finish,disposed=0;const h=controller(r,{makeClient:()=>({bake:()=>new Promise(res=>finish=res),dispose(){disposed++;}})});h.nav.mesh=null;
  assert.equal(h.api.start('exit'),true);assert.equal(h.api.state().phase,'building');h.api.stop(true);finish({chf:r.mesh});await new Promise(res=>setTimeout(res,10));
  assert.equal(h.api.state().phase,'idle');assert.equal(h.api.points().length,0);assert.equal(disposed,1);
});
test('a late result from the previous selection cannot replace the current target',native,async()=>{
  const r=await room(),pending=[];const h=controller(r,{makeClient:()=>({bake:()=>new Promise(res=>pending.push(res)),dispose(){}})});h.nav.mesh=null;
  h.api.start('exit');h.api.start('aurum');assert.equal(pending.length,2);pending[1]({chf:r.mesh});await settle(h.api);
  assert.equal(h.api.state().kind,'aurum');pending[0]({chf:r.mesh});await new Promise(res=>setTimeout(res,10));assert.equal(h.api.state().kind,'aurum');
});
test('entering a floor missing from the old mesh rebuilds around the current feet instead of getting stuck',native,async()=>{
  const r=await room({stacked:true}),{nativeModules}=require('./helpers/dungeon-navigation.cjs'),{bakeNavFromCollider}=await nativeModules();let bakes=0;
  const partial=bakeNavFromCollider(r.col,{anchor:[2,0,6]}).chf,h=controller(r,{makeClient:()=>({bake:async()=>{bakes++;return{chf:r.mesh}},dispose(){}})});h.nav.mesh=partial;
  h.api.start('exit');await settle(h.api);assert.equal(bakes,0);
  h.nav.feet=Float32Array.from([2,3,6]);h.ctx.exitDoors[0].pos=[8,3,6];h.advance();await settle(h.api);assert.equal(h.api.state().phase,'following');assert.equal(bakes,1,'a newly reached floor gets its own anchor once');
});
test('published navigation getters use live context geometry, feet, quest stands and native world rendering slot',{skip:!process.env.DFO_BUILD_DIR||!process.env.DFO_UPSTREAM_DIR},()=>{
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{transformAsset}=require('../src/mod/transforms.cjs'),{parse}=require(path.join(process.env.DFO_UPSTREAM_DIR,'node_modules/acorn'));
  const dir=path.join(process.env.DFO_BUILD_DIR,'assets'),load=prefix=>{const file=fs.readdirSync(dir).find(f=>f.startsWith(prefix));return transformAsset('assets/'+file,fs.readFileSync(path.join(dir,file),'utf8'),{dungeons:true,ru:false,marks:false,nearbyLoot:false});};
  const deep=load('deepWaterRuntime-');assert.ok(deep.log.some(([id])=>id==='dungeon.navContext'));assert.ok(deep.log.some(([id])=>id==='dungeon.navQueries'));
  const start=deep.text.indexOf('get dfoDungeonNavigation(){'),end=deep.text.indexOf('get dfoDungeonLive(){',start),getter=deep.text.slice(start,end).replace(/,$/,'');
  const ast=parse('({'+getter+'})',{ecmaVersion:'latest'}),obj=ast.body[0].expression.properties[0].value.body.body[0].argument,props=new Map(obj.properties.map(p=>[p.key.name,p.value]));
  const col={raycastHit(){}},feet=new Float32Array([1,0,2]),context={};context[props.get('collider').name]=col;context[props.get('key').name]='d1';context[props.get('mesh').object.name]={chf:{native:true}};context[props.get('transitions').body.callee.name]=()=>[];context[props.get('transitions').body.arguments[0].name]={};context.feet=feet;
  const api=vm.runInNewContext('({swimmer(){return{feet}},'+getter+'})',context);assert.equal(api.dfoDungeonNavigation.collider,col);assert.equal(api.dfoDungeonNavigation.feet,feet);assert.equal(api.dfoDungeonNavigation.key,'d1');context[props.get('mesh').object.name].chf={next:true};assert.equal(api.dfoDungeonNavigation.mesh.next,true);
  const at=deep.text.indexOf('globalThis.__dfoDungeonNavigation?.draw(');assert.ok(at>=0);assert.ok(deep.text.indexOf('.drawWater(',at)>at,'line is drawn before the world pass is resolved by HUD quads');
  const modes=load('arenaGate-');assert.ok(modes.log.some(([id])=>id==='dungeon.navQuests'));
  const world=load('world-');assert.ok(world.log.some(([id])=>id==='dungeon.navDraw'));assert.match(world.text,/dfoContinuous\?\{dash:1e9,gap:0/);
  for(const changed of [deep,modes,world])parse(changed.text,{ecmaVersion:'latest',sourceType:'module'});
});
