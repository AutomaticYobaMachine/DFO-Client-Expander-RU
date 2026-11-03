'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../src/mod/page/dfo_dungeon_nav_model.js'),{createNavigation}=require('../src/mod/page/dfo_dungeon_nav.js');
const {room,quad,wall}=require('./helpers/dungeon-navigation.cjs');
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
  let baked=0,disposed=0,time=0;const ctx={exitDoors:[{pos:[5,0,0]}],actions:{objects:new Map()},people:[],foes:[]};
  const view={live:{ctx,foes:[]},nav:{feet:[0,0,0],key:'test',mesh:null,collider:{}},room:'dungeon:m1',sources:{},tools:{}};
  const api=createNavigation({read:()=>view,now:()=>time,native:()=>({solve(){assert.fail('no query without a mesh')},Draw:class{},isDoor:()=>false}),makeClient:()=>({_hadWorker:false,bake(){baked++;},dispose(){disposed++;}})});
  assert.equal(api.start('exit'),true);await new Promise(r=>setTimeout(r,0));assert.equal(api.state().phase,'unavailable');assert.match(api.state().message,/Фоновый расчёт/);assert.equal(baked,0);assert.equal(disposed,1);assert.equal(api.points().length,0);
  for(let i=0;i<10;i++){time+=5000;api.tick();await new Promise(r=>setTimeout(r,0));}assert.equal(disposed,1,'an unchanged failed request must not start expensive background work forever');
});
test('a missing, failed or empty worker mesh still allows cooperative navigation over real geometry',native,async()=>{
  const r=await room();
  for(const makeClient of [()=>({_hadWorker:false,bake(){assert.fail('must not bake synchronously')},dispose(){}}),()=>{throw Error('worker creation refused')},()=>({bake:async()=>{throw Error('worker died')},dispose(){}}),()=>({bake:async()=>({chf:{mesh:{polys:[]}}}),dispose(){}})]){
    const h=controller(r,{makeClient});h.nav.mesh=null;h.api.start('exit');const state=await settle(h.api);assert.equal(state.phase,'following');assert.ok(h.api.points().length>1);h.api.stop(true);
  }
});
test('surface routing does not require a native navigation mesh',native,async()=>{
  const r=await room({pillar:true}),result=await M.planConnected(null,{},r.from,{at:[12,0,6]},r.col);
  assert.ok(result);assert.ok(result.points.some(p=>p[2]<3||p[2]>9));
});
test('native navmesh and collider route around a wall, and every displayed segment stays on the floor',native,async()=>{
  const r=await room({pillar:true}),target={key:'goal',at:[12,0,6]};
  const result=await M.plan(r.mesh,r.native,r.from,target,r.col);
  assert.ok(result,'a supported path exists around the pillar');assert.ok(result.points.some(p=>p[2]<3||p[2]>9));
  for(const p of result.points)assert.ok(Math.abs(p[1])<.05);
  for(let i=1;i<result.points.length;i++)assert.equal(M.clearance(r.col,result.points[i-1],result.points[i]),null);
});
test('a wall exactly at a segment endpoint or grid node blocks both adjacent segments',native,async()=>{
  const r=await room();wall(r.col,'grid-wall',7,0,12);
  assert.ok(M.clearance(r.col,[6.5,0,6],[7,0,6]));assert.ok(M.clearance(r.col,[7,0,6],[7.5,0,6]));
  assert.equal(await M.planConnected(r.mesh,r.native,[6,0,6],{at:[8,0,6]},r.col),null);
});
test('stacked floors are never joined by a straight line; a connected ramp reaches its own upper floor',native,async()=>{
  const split=await room({stacked:true});assert.equal(await M.plan(split.mesh,split.native,[2,0,6],{at:[2,3,6]},split.col),null);
  const r=await room({ramp:true}),result=await M.plan(r.mesh,r.native,[2,0,6],{at:[2,3,6]},r.col);
  assert.ok(result,'the route must use the ramp, not jump vertically');assert.ok(result.points.some(p=>p[0]>10));assert.ok(result.points.at(-1)[1]>2.9);
});
test('all actionable doors stay in the route; ignoring them never removes the surrounding wall',native,async()=>{
  const r=await room({door:true}),target={at:[12,0,6]};
  const route=await M.plan(r.mesh,r.native,r.from,target,r.col,['door:1']);assert.ok(route);
  const blocked=M.visible(route.points,r.col,r.actions,r.native);assert.equal(blocked.blocked,null);assert.ok(blocked.points.at(-1)[0]>10);
  r.shift[2]=20;assert.equal(M.visible(route.points,r.col,r.actions,r.native).blocked,null);
  r.shift[2]=0;r.actions.objects.get('door:1').currentLockValue=20;
  const locked=r.bake();assert.equal(await M.plan(locked,r.native,r.from,target,r.col),null);
  for(const special of [false,true]){r.actions.objects.get('door:1').special=special;const skip=[...M.passable(r.actions)];assert.deepEqual(skip,['door:1']);assert.ok(await M.planConnected(locked,r.native,r.from,target,r.col,skip));}
  assert.equal(await M.plan(locked,r.native,[6,0,6],{at:[7.3,0,6]},r.col),null,'a nearby approach point across a thin locked door is not a reachable goal');
});
test('real stair treads and risers connect different floors even when the AI polygons do not',native,async()=>{
  const r=await room({stairs:true}),shape=()=>JSON.stringify([r.mesh.mesh.verts,r.mesh.mesh.polys]),before=shape(),result=await M.planConnected(r.mesh,r.native,[2,0,6],{at:[2,3.6,6]},r.col);
  assert.ok(result,'45 cm treads and room seams are walkable');assert.ok(result.points.some(p=>p[0]>12.4));assert.ok(result.points.some(p=>p[1]>.4&&p[1]<3.5));assert.ok(result.points.at(-1)[1]>3.5);assert.equal(shape(),before,'the AI mesh must not be changed');
  for(let i=1;i<result.points.length;i++)assert.ok(Math.abs(result.points[i][1]-result.points[i-1][1])<=.505);
  assert.equal(M.visible(result.points,r.col,r.actions,r.native,Infinity).blocked,null,'the line must remain visible through every stair flight');
});
test('adaptive sampling visits narrow intermediate treads instead of rejecting their combined rise',native,async()=>{
  const r=await room({narrowStairs:true}),result=await M.walkRoute([2,0,6],{at:[2,4.2,6]},r.col);
  assert.ok(result);assert.ok(result.points.at(-1)[1]>4.1);assert.ok(result.points.some(p=>p[1]>.1&&p[1]<4));
  for(let i=1;i<result.points.length;i++)assert.ok(Math.abs(result.points[i][1]-result.points[i-1][1])<=.505);
  assert.equal(M.visible(result.points,r.col,r.actions,r.native,Infinity).blocked,null);
  wall(r.col,'new-wall',12.5,0,3,0,8);assert.equal(M.visible(result.points,r.col,r.actions,r.native,Infinity).blocked,'geometry','the stair envelope must never waive a real wall');
});
test('the displayed line retains intermediate treads even when both ends of a coarse edge are on the same floor',native,async()=>{
  const r=await room();quad(r.col,'low-step',[[6.65,.4,0],[6.85,.4,0],[6.85,.4,12],[6.65,.4,12]]);
  const result=await M.walkRoute([6,0,6],{at:[8,0,6]},r.col);assert.ok(result);assert.ok(result.points.some(p=>p[0]>=6.65&&p[0]<=6.85&&p[1]>.39),'the ribbon follows the intervening raised surface');
  assert.equal(M.visible(result.points,r.col,r.actions,r.native,Infinity).blocked,null);
});
test('static levers and wheels in the shared dungeon bucket are ignored only by navigation',native,async()=>{
  const r=await room(),model={modelIdNum:74037},hit=()=>r.col.raycastHit([6,.8,6],[1,0,0],2,{bodies:true});
  M.notePlacement(r.col,'floor',model);wall(r.col,'floor',7,4,8,0,2);const before=hit();assert.ok(Number.isFinite(before.dist));
  const nav=M.navigationGeometry(r.col);assert.equal(nav.raycastHit([6,.8,6],[1,0,0],2,{bodies:true}).dist,Infinity);assert.equal(hit().dist,before.dist,'physical collisions survive');
  wall(r.col,'wall',8,4,8);const fresh=M.navigationGeometry(r.col);assert.ok(Number.isFinite(fresh.raycastHit([6,.8,6],[1,0,0],4,{bodies:true}).dist),'real walls are still solid');assert.notEqual(fresh,nav);
});
test('the capsule bridges centimetre room seams on a grid row but never an unsupported gap',native,async()=>{
  const r=await room();r.col.removeBucket('floor');
  quad(r.col,'first',[[0,0,0],[14,0,0],[14,0,6.23],[0,0,6.23]]);quad(r.col,'second',[[0,0,6.27],[14,0,6.27],[14,0,12],[0,0,12]]);
  assert.ok(M.floor(r.col,[7,0,6.25]));const route=await M.walkRoute([7,0,4],{at:[7,0,8]},r.col);assert.ok(route,'a tiny seam cannot sever the whole room');
  r.col.removeBucket('second');quad(r.col,'second',[[0,0,7],[14,0,7],[14,0,12],[0,0,12]]);assert.equal(M.floor(r.col,[7,0,6.6]),null);assert.equal(await M.walkRoute([7,0,4],{at:[7,0,8]},r.col),null);
});
test('floor validation rejects gaps and a newly lowered ceiling even when the old mesh has a route',native,async()=>{
  const r=await room();quad(r.col,'low-ceiling',[[5,1.4,0],[8,1.4,0],[8,1.4,12],[5,1.4,12]]);
  assert.equal(await M.plan(r.mesh,r.native,r.from,{at:[12,0,6]},r.col),null);
  const before=JSON.stringify(r.from);assert.equal(M.floor({raycastHit:()=>({dist:Infinity})},r.from),null);assert.equal(JSON.stringify(r.from),before);
});
test('body clearance sees a waist or head obstacle between the original two probe heights',native,async()=>{
  for(const [bottom,top]of [[.8,1.1],[1.5,1.75]]){
    const r=await room();wall(r.col,'crossbar',7,0,12,bottom,top-bottom);
    assert.ok(M.clearance(r.col,[6,0,6],[8,0,6]));assert.equal(M.visible([[6,0,6],[8,0,6]],r.col,r.actions,r.native).blocked,'geometry');
    assert.equal(await M.walkRoute([6,0,6],{at:[8,0,6]},r.col),null,'a standing route may not pass through the suspended solid');
  }
});
test('known teleporter edges keep their direction and show only the leg before the transition',native,async()=>{
  const r=await room({stacked:true}),target={at:[2,3,6],key:'up'},transition={entrance:{pos:[11,1,6],yawDeg:0},exit:{pos:[8,3.2,6],yawDeg:0}};
  const result=await M.planConnected(r.mesh,r.native,[2,0,6],target,r.col,[],[transition]);
  assert.ok(result?.transition);assert.ok(result.points.every(p=>Math.abs(p[1])<.05));
  assert.equal(await M.planConnected(r.mesh,r.native,[2,3,6],{at:[2,0,6]},r.col,[],[transition]),null,'a one-way step cannot be used backwards');
});
test('surface search chains unvisited one-way portals between three floors without drawing across a jump',native,async()=>{
  const r=await room({stacked:true});quad(r.col,'third-floor',[[0,6,0],[10,6,0],[10,6,12],[0,6,12]]);
  const links=[{entrance:{pos:[11,1,6]},exit:{pos:[8,3.2,6]}},{entrance:{pos:[2,4,6]},exit:{pos:[8,6.2,6]}}];
  const result=await M.walkRoute([2,0,6],{at:[2,6,6]},r.col,[],links);
  assert.ok(result?.transition);assert.ok(result.points.every(p=>Math.abs(p[1])<.05));assert.ok(result.distance>10);assert.ok(result.points.at(-1)[0]>10);
  const next=await M.walkRoute([8,3,6],{at:[2,6,6]},r.col,[],links);assert.ok(next?.transition);assert.ok(next.points.every(p=>Math.abs(p[1]-3)<.05));
  assert.equal(await M.walkRoute([2,6,6],{at:[2,0,6]},r.col,[],links),null,'the two directed portals do not create reverse passages');
});
test('a shorter available portal is considered even when a direct walking route exists',native,async()=>{
  const r=await room(),links=[{entrance:{pos:[3,1,6]},exit:{pos:[11,.2,6]}}],result=await M.planConnected(r.mesh,r.native,[2,0,6],{at:[12,0,6]},r.col,[],links);
  assert.ok(result?.transition);assert.ok(result.distance<4);assert.ok(result.points.at(-1)[0]<4);
});
test('a shorter portal omitted by the native mesh is not hidden by an available long walking route',native,async()=>{
  const r=await room(),locate=r.native.locate,partial={...r.native,locate:(mesh,x,z,y)=>x>2.2&&x<4.6?-1:locate(mesh,x,z,y)},links=[{entrance:{pos:[3.4,1,6]},exit:{pos:[11,.2,6]}}];
  const result=await M.planConnected(r.mesh,partial,r.from,{at:[12,0,6]},r.col,[],links);
  assert.ok(result?.transition);assert.ok(result.distance<4.5);assert.ok(result.points.at(-1)[0]<4.5);
});
test('long surface searches yield and cancel without changing the collider',native,async()=>{
  const r=await room({stacked:true}),keys=[...r.col._buckets.keys()];let yielded=0;
  await assert.rejects(M.walkRoute([2,0,6],{at:[2,3,6]},r.col,[],[],async()=>{if(++yielded>=3)throw new Error('cancelled')}),/cancelled/);
  assert.ok(yielded>=3);assert.deepEqual([...r.col._buckets.keys()],keys);
});
test('asynchronous path queries retain the input pose and goal even if their live buffers move',native,async()=>{
  const r=await room({pillar:true}),feet=new Float32Array([2,0,6]),goal=new Float32Array([12,0,6]);let moved=false;
  const result=await M.walkRoute(feet,{at:goal},r.col,[],[],async()=>{if(!moved){moved=true;feet.set([2,0,10]);goal.set([12,0,10]);}});
  assert.ok(moved);assert.ok(result);assert.deepEqual(result.points[0],[2,0,6]);assert.deepEqual(result.points.at(-1),[12,0,6]);
});
test('original Privateer’s Hold geometry connects stair flights and a room seam without revealing a map',{skip:!process.env.ARENA2_PATH||!process.env.DFO_UPSTREAM_DIR},async()=>{
  const {realDungeon}=require('./helpers/dungeon-navigation.cjs'),r=await realDungeon(),skip=[...M.passable(r.actions)];
  assert.ok(M.floor(r.geometry,[55.5,19.2,32],skip),'the real centimetre seam remains supported');
  // Landings of a long native stair flight and the next room, previously cut exactly on Z=32.
  const from=[53.5,19.69,31.25],target={at:[56.1,19.2,33.04]};
  const result=await M.walkRoute(from,target,r.geometry,skip,[],async()=>{await new Promise(setImmediate)});
  assert.ok(result);assert.ok(result.points.some(p=>p[2]>32));assert.ok(result.points.at(-1)[2]>33);
  for(let i=1;i<result.points.length;i++)assert.equal(M.clearance(r.geometry,result.points[i-1],result.points[i],skip),null);
});
test('controller tracks target movement/death, chooses reachable elite by walking distance and tears down on exit',native,async()=>{
  const r=await room({pillar:true}),h=controller(r),mk=p=>({entity:{eliteFoe:true},ai:{feet:p}});
  h.ctx.foes.push(mk([8,0,6]),mk([2,0,10]));assert.equal(h.api.start('elite'),true);
  const s=await settle(h.api);assert.equal(s.phase,'following');assert.ok(s.distance<6,'nearby reachable elite wins over one behind a wall');
  h.ctx.foes[1].dead=true;h.advance();await settle(h.api);assert.ok(h.api.state().distance>8);
  h.ctx.foes[0].ai.feet=[12,0,2];h.advance();assert.equal(h.api.points().length,0,'old line is hidden during a replan');await settle(h.api);assert.equal(h.api.state().phase,'following');
  h.ctx.foes[0].entity.properName='Новое имя цели';h.advance();assert.equal(h.api.state().name,'Новое имя цели');
  h.current=null;h.advance();assert.equal(h.api.state().phase,'idle');assert.equal(h.api.points().length,0);
});
test('deviating to a parallel corridor behind a wall cannot report arrival through that wall',native,async()=>{
  const r=await room(),h=controller(r);h.api.start('exit');await settle(h.api);
  quad(r.col,'parallel-wall',[[0,0,6.4],[14,0,6.4],[14,3,6.4],[0,3,6.4]]);h.nav.feet.set([12,0,6.8]);h.advance();
  assert.notEqual(h.api.state().phase,'arrived');assert.equal(h.api.points().length,0);assert.equal((await settle(h.api)).phase,'unavailable');
});
test('joining an existing route checks support across the lateral gap',native,async()=>{
  const r=await room();r.col.removeBucket('floor');quad(r.col,'first',[[0,0,0],[14,0,0],[14,0,6.2],[0,0,6.2]]);quad(r.col,'second',[[0,0,6.8],[14,0,6.8],[14,0,12],[0,0,12]]);
  assert.equal(M.rejoin([[7,0,6],[8,0,6]],[7,0,7],r.col,r.actions,r.native),null);
});
test('a failed route retries after real geometry changes without requiring the player to move',native,async()=>{
  const r=await room(),h=controller(r);wall(r.col,'blocking-wall',7,0,12);h.api.start('exit');assert.equal((await settle(h.api)).phase,'unavailable');
  r.col.removeBucket('blocking-wall');h.advance(5000);assert.equal((await settle(h.api)).phase,'following');assert.ok(h.api.points().at(-1)[0]>10);
});
test('a passage opening during a failed query cannot be cached as a final failure for the new world',native,async()=>{
  const r=await room(),h=controller(r),original=M.planConnected;wall(r.col,'late-wall',7,0,12);h.nav.mesh=null;let changed=false;
  M.planConnected=async(...args)=>{const result=await original(...args);if(!changed&&!result){changed=true;r.col.removeBucket('late-wall');}return result;};
  try{h.api.start('exit');assert.equal((await settle(h.api)).phase,'following');assert.ok(changed);assert.ok(h.api.points().length>1);}finally{M.planConnected=original;h.api.stop(true);}
});
test('the geometry revision tracks real support but ignores unlocked door animation and query bookkeeping',native,async()=>{
  const r=await room({door:true}),skip=M.passable(r.actions),before=M.geometryVersion(r.col,skip);
  r.col.raycastHit([2,1,6],[1,0,0],12);assert.equal(M.geometryVersion(r.col,skip),before);
  r.shift[2]=10;assert.equal(M.geometryVersion(r.col,skip),before);quad(r.col,'new-floor',[[0,3,0],[4,3,0],[4,3,4],[0,3,4]]);assert.notEqual(M.geometryVersion(r.col,skip),before);
});
test('waiting at a portal keeps the remaining distance to the actual goal',native,async()=>{
  const r=await room({stacked:true}),h=controller(r);h.ctx.exitDoors=[{pos:[2,3,6]}];h.nav.transitions=[{entrance:{pos:[11,1,6]},exit:{pos:[8,3.2,6]}}];
  h.api.start('exit');await settle(h.api);h.nav.feet.set([10.5,0,6]);h.advance();assert.equal(h.api.state().phase,'transition');assert.ok(h.api.state().distance>=5);
});
test('an elite omitted by the AI mesh is checked on the real floor before choosing a farther foe',native,async()=>{
  const r=await room(),locate=r.native.locate;const partial={...r,native:{...r.native,locate:(mesh,x,z,y)=>x>4.8&&x<7.2?-1:locate(mesh,x,z,y)}},h=controller(partial);
  h.ctx.foes.push({entity:{eliteFoe:true,properName:'Ближе'},ai:{feet:[6,0,6]}},{entity:{eliteFoe:true,properName:'Дальше'},ai:{feet:[12,0,6]}});
  h.api.start('elite');const state=await settle(h.api);assert.equal(state.name,'Ближе');assert.ok(state.distance<=5);
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
  const col={raycastHit(){}},feet=new Float32Array([1,0,2]),context={},[portals,walked]=props.get('transitions').body.elements.map(e=>e.argument);context[props.get('collider').name]=col;context[props.get('key').name]='d1';context[props.get('mesh').object.name]={chf:{native:true}};context[portals.callee.object.callee.name]=()=>new Map([['unvisited',{entrance:{pos:[3,1,2]},exit:{pos:[8,3.2,6]}}]]);context[walked.callee.name]=()=>[];context[walked.arguments[0].name]={revealed:new Set(),teleporters:new Map()};context.feet=feet;
  const api=vm.runInNewContext('({swimmer(){return{feet}},'+getter+'})',context);assert.equal(api.dfoDungeonNavigation.collider,col);assert.equal(api.dfoDungeonNavigation.feet,feet);assert.equal(api.dfoDungeonNavigation.key,'d1');context[props.get('mesh').object.name].chf={next:true};assert.equal(api.dfoDungeonNavigation.mesh.next,true);
  assert.equal(api.dfoDungeonNavigation.transitions().length,1,'all level portals are available before the automap reveals anything');assert.match(deep.text,/notePlacement\(/);
  const at=deep.text.indexOf('globalThis.__dfoDungeonNavigation?.draw(');assert.ok(at>=0);assert.ok(deep.text.indexOf('.drawWater(',at)>at,'line is drawn before the world pass is resolved by HUD quads');
  const modes=load('arenaGate-');assert.ok(modes.log.some(([id])=>id==='dungeon.navQuests'));
  const world=load('world-');assert.ok(world.log.some(([id])=>id==='dungeon.navDraw'));assert.match(world.text,/dfoContinuous\?\{dash:1e9,gap:0/);
  for(const changed of [deep,modes,world])parse(changed.text,{ecmaVersion:'latest',sourceType:'module'});
});
