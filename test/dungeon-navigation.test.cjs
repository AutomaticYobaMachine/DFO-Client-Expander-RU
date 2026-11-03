
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../src/mod/page/dfo_dungeon_nav_model.js'),G=require('../src/mod/page/dfo_dungeon_graph.js'),{createNavigation}=require('../src/mod/page/dfo_dungeon_nav.js');
const {room,quad,wall}=require('./helpers/dungeon-navigation.cjs');
const native={skip:!process.env.DFO_UPSTREAM_DIR};
const settle=async(c,predicate=s=>['following','transition','unavailable'].includes(s.phase))=>{for(let i=0;i<400;i++){await new Promise(r=>setTimeout(r,2));c.tick();if(predicate(c.state()))return c.state();}assert.fail('navigation did not settle: '+JSON.stringify(c.state()));};
function controller(r,extra={}){
  let time=10000,current;
  const ctx={actions:r.actions,exitDoors:[{pos:[12,0,6]}],foes:[],people:[],enemies:[]};
  const live={ctx,foes:ctx.foes,aurum:{id:'d1',open:false,foot:[11,0,8]}};
  const nav={feet:Float32Array.from(r.from),collider:r.col,key:'d1',transitions:[]};
  current={live,nav,sources:{},tools:{enemyName:()=> 'Enemy'},room:'dungeon:m1'};
  const api=createNavigation({read:()=>current,native:()=>({solve(){assert.fail('NPC solver must never run')},NavClient:class{constructor(){assert.fail('NPC navmesh must never bake')}},Draw:class{}}),now:()=>time,...extra});
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

test('controller is independent of AI and reuses its own graph across selections',native,async()=>{
  const r=await room({pillar:true});let builds=0;
  const h=controller(r,{makeGraphClient:opts=>{const c=G.client({...opts,WorkerCtor:null}),build=c.build;return {...c,async build(input){builds++;return build(input);}};}});
  assert.equal(h.api.availability().ready,true);assert.equal(h.api.start('exit'),true);assert.equal((await settle(h.api)).phase,'following');assert.ok(h.api.points().length>1);
  h.api.start('aurum');await settle(h.api);assert.equal(builds,1);assert.equal(h.api.state().kind,'aurum');h.api.stop(true);
});
test('a request at the goal reports arrival without a repeated zero-length search',native,async()=>{
  const r=await room(),h=controller(r);h.ctx.exitDoors=[{pos:[...h.nav.feet]}];h.api.start('exit');await settle(h.api,s=>s.phase==='arrived');
  for(let i=0;i<5;i++)h.advance(5000);assert.equal(h.api.state().phase,'arrived');assert.equal(h.api.state().distance,0);assert.equal(h.api.points().length,0);
});
test('controller tracks the nearest reachable elite, movement, death, name and exact quest UID',native,async()=>{
  const r=await room({pillar:true}),h=controller(r),mk=p=>({entity:{eliteFoe:true},ai:{feet:p}});
  h.ctx.foes.push(mk([8,0,6]),mk([2,0,10]));h.api.start('elite');assert.ok((await settle(h.api)).distance<6);
  h.ctx.foes[1].dead=true;h.advance();await settle(h.api);assert.ok(h.api.state().distance>8);
  h.ctx.foes[0].ai.feet=[12,0,2];h.advance();assert.equal(h.api.points().length,0);await settle(h.api);
  h.ctx.foes[0].entity.properName='Новое имя';h.advance();assert.equal(h.api.state().name,'Новое имя');
  const q={uid:42},b={questUID:42,targetQuest:q,targetResource:{displayName:'Цель 42'}};
  h.ctx.foes.push({entity:{},ai:{feet:[2,0,10]},questBehaviour:b});h.api.start('quest','42');await settle(h.api);assert.equal(h.api.state().uid,'42');assert.equal(h.api.state().name,'Цель 42');
  q.questComplete=true;h.advance();assert.equal(h.api.state().phase,'unavailable');h.current=null;h.advance();assert.equal(h.api.state().phase,'idle');assert.equal(h.api.points().length,0);
});
test('a parallel corridor or another floor cannot count as arrival through a wall',native,async()=>{
  const r=await room(),h=controller(r);h.api.start('exit');await settle(h.api);
  quad(r.col,'parallel-wall',[[0,0,6.4],[14,0,6.4],[14,3,6.4],[0,3,6.4]]);h.nav.feet.set([12,0,6.8]);h.advance();
  assert.notEqual(h.api.state().phase,'arrived');assert.equal(h.api.points().length,0);assert.equal((await settle(h.api)).phase,'unavailable');
});
test('failed routes stay quiet until real static geometry, target or position changes',native,async()=>{
  const r=await room(),h=controller(r);wall(r.col,'blocking-wall',7,0,12,0,8);h.api.start('exit');assert.equal((await settle(h.api)).phase,'unavailable');
  for(let i=0;i<5;i++){h.advance(5000);assert.equal(h.api.state().phase,'unavailable');}
  r.col.removeBucket('blocking-wall');h.advance(5000);assert.equal((await settle(h.api)).phase,'following');assert.ok(h.api.points().at(-1)[0]>10);
});
test('a manual retry recovers from a failed graph client instead of reusing its rejected build',native,async()=>{
  const r=await room();let made=0;
  const h=controller(r,{makeGraphClient:opts=>++made===1?{async build(){},async route(){throw Error('temporary graph failure');},dispose(){}}:G.client({...opts,WorkerCtor:null})});
  h.api.start('exit');assert.equal((await settle(h.api)).phase,'unavailable');h.api.start('exit');assert.equal((await settle(h.api)).phase,'following');assert.equal(made,2);
});
test('an old result cannot restore the route after exit or replace a new target',native,async()=>{
  const r=await room(),pending=[];let disposed=0;
  const h=controller(r,{makeGraphClient:()=>({async build(){},route:(from,targets)=>new Promise(resolve=>pending.push({resolve,target:targets[0],from})),dispose(){disposed++;}})});
  const result=p=>({target:p.target,points:[p.from,p.target.at],kinds:['walk','walk'],distance:10});
  h.api.start('exit');await new Promise(setImmediate);assert.equal(pending.length,1);h.api.stop(true);pending[0].resolve(result(pending[0]));await new Promise(setImmediate);assert.equal(h.api.state().phase,'idle');assert.equal(disposed,1);
  h.api.start('exit');await new Promise(setImmediate);h.api.start('aurum');await new Promise(setImmediate);pending.at(-1).resolve(result(pending.at(-1)));await settle(h.api);assert.equal(h.api.state().kind,'aurum');pending[1].resolve(result(pending[1]));await new Promise(setImmediate);assert.equal(h.api.state().kind,'aurum');
});
test('portal arrival retains remaining distance with no interaction instructions',native,async()=>{
  const r=await room({stacked:true}),h=controller(r);h.ctx.exitDoors=[{pos:[2,3,6]}];h.nav.transitions=[{entrance:{pos:[3,1,6]},exit:{pos:[8,3.2,6]}}];
  h.api.start('exit');await settle(h.api);h.nav.feet.set([2.8,0,6]);h.advance();assert.equal(h.api.state().phase,'transition');assert.ok(h.api.state().distance>=5);assert.equal(h.api.state().message,'');
  h.nav.feet.set([8,3,6]);h.advance();await settle(h.api);assert.equal(h.api.state().phase,'following');assert.ok(h.api.state().distance<9);
});
test('a route remains drawn while following a wall climb in midair',native,async()=>{
  const r=await room();quad(r.col,'upper',[[7,4,0],[14,4,0],[14,4,12],[7,4,12]]);wall(r.col,'shaft-wall',7,0,12,0,4);
  const h=controller(r);h.ctx.exitDoors=[{pos:[10,4,6]}];h.api.start('exit');await settle(h.api);const ps=h.api.points();
  let i=ps.findIndex((p,i)=>i&&p[1]-ps[i-1][1]>2);assert.ok(i>0);const a=ps[i-1],b=ps[i];h.nav.feet.set(a.map((x,k)=>(x+b[k])/2));h.advance();
  assert.equal(h.api.state().phase,'following');assert.ok(h.api.points().length>1);assert.equal(h.api.state().message,'');
});
test('riding a wide platform preserves a supported connection to the vertical route',native,async()=>{
  const r=await room();quad(r.col,'upper',[[7,4,0],[14,4,0],[14,4,12],[7,4,12]]);wall(r.col,'shaft-wall',7,0,12,0,4);
  const h=controller(r);h.ctx.exitDoors=[{pos:[10,4,6]}];h.api.start('exit');await settle(h.api);const ps=h.api.points(),i=ps.findIndex((p,i)=>i&&p[1]-ps[i-1][1]>2),a=ps[i-1],b=ps[i],y=(a[1]+b[1])/2;
  quad(r.col,'platform',[[1,y,0],[7,y,0],[7,y,12],[1,y,12]]);r.actions.objects.set('platform',{key:'platform',kind:'action'});h.nav.feet.set([2,y,a[2]]);h.advance();
  assert.equal(h.api.state().phase,'following');assert.ok(h.api.points().length>1);assert.ok(M.distance(h.api.points()[0],h.nav.feet)<.1);
});
test('published navigation getters use live context geometry, feet, quest stands and native world rendering slot',{skip:!process.env.DFO_BUILD_DIR||!process.env.DFO_UPSTREAM_DIR},()=>{
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{transformAsset}=require('../src/mod/transforms.cjs'),{parse}=require(path.join(process.env.DFO_UPSTREAM_DIR,'node_modules/acorn'));
  const dir=path.join(process.env.DFO_BUILD_DIR,'assets'),load=prefix=>{const file=fs.readdirSync(dir).find(f=>f.startsWith(prefix));return transformAsset('assets/'+file,fs.readFileSync(path.join(dir,file),'utf8'),{dungeons:true,ru:false,marks:false,nearbyLoot:false});};
  const deep=load('deepWaterRuntime-');assert.ok(deep.log.some(([id])=>id==='dungeon.navContext'));
  const start=deep.text.indexOf('get dfoDungeonNavigation(){'),end=deep.text.indexOf('get dfoDungeonLive(){',start),getter=deep.text.slice(start,end).replace(/,$/,'');
  const ast=parse('({'+getter+'})',{ecmaVersion:'latest'}),obj=ast.body[0].expression.properties[0].value.body.body[0].argument,props=new Map(obj.properties.map(p=>[p.key.name,p.value]));
  const col={raycastHit(){}},feet=new Float32Array([1,0,2]),context={},[portals]=props.get('transitions').body.elements.map(e=>e.argument);context[props.get('collider').name]=col;context[props.get('key').name]='d1';context[portals.callee.object.callee.name]=()=>new Map([['unvisited',{entrance:{pos:[3,1,2]},exit:{pos:[8,3.2,6]}}]]);context.feet=feet;
  const api=vm.runInNewContext('({swimmer(){return{feet}},'+getter+'})',context);assert.equal(api.dfoDungeonNavigation.collider,col);assert.equal(api.dfoDungeonNavigation.feet,feet);assert.equal(api.dfoDungeonNavigation.key,'d1');assert.equal('mesh' in api.dfoDungeonNavigation,false);
  assert.equal(api.dfoDungeonNavigation.transitions().length,1,'all level portals are available before the automap reveals anything');assert.match(deep.text,/notePlacement\(/);
  const at=deep.text.indexOf('globalThis.__dfoDungeonNavigation?.draw(');assert.ok(at>=0);assert.ok(deep.text.indexOf('.drawWater(',at)>at,'line is drawn before the world pass is resolved by HUD quads');
  const modes=load('arenaGate-');assert.ok(modes.log.some(([id])=>id==='dungeon.navQuests'));
  const world=load('world-');assert.ok(world.log.some(([id])=>id==='dungeon.navDraw'));assert.match(world.text,/dfoContinuous\?globalThis\.__dfoDungeonGraph\.ribbon/);
  for(const changed of [deep,modes,world])parse(changed.text,{ecmaVersion:'latest',sourceType:'module'});
});
