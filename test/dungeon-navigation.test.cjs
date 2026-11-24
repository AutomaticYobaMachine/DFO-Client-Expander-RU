
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../src/mod/page/dfo_dungeon_nav_model.js'),G=require('../src/mod/page/dfo_dungeon_graph.js'),{createNavigation}=require('../src/mod/page/dfo_dungeon_nav.js');
const {room,quad,wall}=require('./helpers/dungeon-navigation.cjs');
const native={skip:!process.env.DFO_UPSTREAM_DIR};
const settle=async(c,predicate=s=>['following','transition','unavailable'].includes(s.phase))=>{for(let i=0;i<400;i++){await new Promise(r=>setTimeout(r,2));c.tick();if(predicate(c.state()))return c.state();}assert.fail('navigation did not settle: '+JSON.stringify(c.state()));};
function controller(r,extra={}){
  let time=10000,current;
  const player={activeEffects:[{kind:'sharedCartography'}]};
  const ctx={actions:r.actions,exitDoors:[{pos:[12,0,6]}],foes:[],people:[],enemies:[]};
  const live={ctx,foes:ctx.foes,aurum:{id:'d1',open:false,foot:[11,0,8]}};
  const nav={feet:Float32Array.from(r.from),collider:r.col,key:'d1',transitions:[]};
  current={live,nav,player,sources:{entity:player},tools:{enemyName:()=> 'Enemy'},room:'dungeon:m1'};
  const api=createNavigation({read:()=>current,now:()=>time,...extra});
  return{api,ctx,live,nav,player,get current(){return current},set current(x){current=x},advance(n=1000){time+=n;api.tick();}};
}
test('navigation targets expose only dungeon exit and exact active quest identities without changing the game',()=>{
  const q={uid:42},b={questUID:42,targetQuest:q,targetResource:{displayName:'Item'}};
  const foe=(elite,other={})=>({entity:{eliteFoe:elite,elite:true},ai:{feet:Float32Array.from([1,0,2])},...other});
  const live={ctx:{exitDoors:[{pos:[0,0,2]}],people:[]},foes:[foe(true),foe(false),foe(true,{dead:true}),foe(true,{companion:1}),foe(false,{questBehaviour:b})],aurum:{id:'d1',foot:[3,0,0],open:false}};
  const sources={stands:[{active:true,behaviour:b}],boxOf:()=>({min:[4,0,3],max:[5,1,4]})};
  const before=JSON.stringify(live),out=M.targets(live,sources,{},new Set(['42']));
  assert.deepEqual(Object.keys(out),['exit','quest']);
  assert.equal('elite' in out,false);assert.equal('aurum' in out,false);
  assert.equal(out.exit.length,1);assert.equal(out.quest.length,2);assert.equal(JSON.stringify(live),before);
  q.questComplete=true;assert.equal(M.targets(live,sources,{}).quest.length,0);
  q.questComplete=false;b.targetResource.isHidden=true;assert.equal(M.targets(live,sources,{}).quest.length,0);
});

test('navigation requires active Shared Cartography effect and immediately stops when the effect expires',async()=>{
  assert.equal(M.hasCartography(null),false);
  assert.equal(M.hasCartography({activeEffects:[]}),false);
  assert.equal(M.hasCartography({activeEffects:[{kind:'sharedCartography',ended:true}]}),false);
  assert.equal(M.hasCartography({activeEffects:[{kind:'sharedCartography',roundsRemaining:0}]}),true);
  assert.equal(M.hasCartography({activeEffects:[{type:46,subType:255}]}),true);
  const col={_buckets:new Map([['floor',{tris:[[[0,0,0],[14,0,0],[14,0,12]]]}]]),raycastHit:(o,d)=>d[1]<-.5?{dist:o[1],key:'floor',normal:[0,1,0]}:null};
  const h=controller({actions:{objects:new Map()},from:[2,0,6],col},{
    makeGraphClient:()=>({
      async build(){return{ready:true};},
      async route(from,goals){return{points:[from,goals[0].at],distance:10,target:goals[0],transition:null};},
      dispose(){}
    })
  });
  assert.equal(h.api.start('aurum'),false);
  assert.equal(h.api.start('elite'),false);
  assert.equal(h.api.start('exit'),true);
  assert.equal((await settle(h.api)).phase,'following');
  assert.ok(h.api.points().length>1);
  assert.equal(h.api.matches(h.current),true);
  h.player.activeEffects[0].ended=true;
  assert.equal(h.api.matches(h.current),false);
  h.advance();
  assert.equal(h.api.state().phase,'idle');
  assert.equal(h.api.points().length,0);
  assert.equal(h.api.availability().ready,false);
  assert.equal(h.api.start('exit'),false);
});

test('cloudTrail builds sparse 1m lifted 1:1 Mysticism clouds (bloom <=100m), small ~10-25px calm white particles inside the line, per-particle bloom/light <=50m and cheap particles >50m',()=>{
  const pts=[[0,0,0],[50,0,0],[120,0,0]];
  const t0=G.cloudTrail(pts,0,{alpha:1,dissipate:0,lift:1,playerPos:[0,0,0]});
  assert.ok(t0.count>120,'cloud trail generates quads for bloom, puffs, near particles+bloom and far cheap particles');
  assert.equal(t0.vertices.length,t0.count*12);
  assert.ok(t0.liftedPoints.at(-1)[1]>=0.99,'cloud trail is lifted ~1m above the surface');
  assert.ok(t0.particles.length>10&&t0.particles.length<=90,'particle count is sparse (<= 0.75/m)');

  // Verify 1:1 Mysticism color (#f472b6 = [244/255, 114/255, 182/255])
  assert.ok(Math.abs(G.MYSTICISM_RGB[0]-244/255)<1e-6);
  assert.ok(Math.abs(G.MYSTICISM_RGB[1]-114/255)<1e-6);
  assert.ok(Math.abs(G.MYSTICISM_RGB[2]-182/255)<1e-6);

  // Verify 7 distinct cloud presets (varying sizes), slightly closer spacing yet non-overlapping mob, and world-space lock when walking forward
  assert.equal(G.CLOUD_PRESETS.length,7,'defines 7 distinct cloud presets');
  assert.equal(new Set(G.CLOUD_PRESETS.map(p=>p.radiusScale)).size,7,'each preset has a distinct size');
  let cloudCount=0;
  const usedPresets=new Set(),cloudRadii=new Set();
  const cloudX0=[];
  for(let i=0;i<t0.vertices.length;i+=72)if(t0.vertices[i+8]<1.5){
    cloudCount++;
    cloudRadii.add(Number(t0.vertices[i+5].toFixed(3)));
    usedPresets.add(t0.vertices[i+11]);
    if(t0.vertices[i]>25)cloudX0.push(Number(t0.vertices[i].toFixed(3)));
  }
  assert.equal(usedPresets.size,7,'all 7 cloud presets are used along a long route');
  assert.ok(cloudRadii.size>=7,'varied cloud sizes appear in emitted geometry');
  assert.ok(cloudCount>140&&cloudCount<=220,'clouds are spaced cleanly around ~1.4-1.5/m across 120m');
  const tWalked=G.cloudTrail([[10,0,0],[50,0,0],[120,0,0]],0,{alpha:1,dissipate:0,lift:1,playerPos:[10,0,0]});
  const cloudX1=[];
  for(let i=0;i<tWalked.vertices.length;i+=72)if(tWalked.vertices[i+8]<1.5&&tWalked.vertices[i]>25)cloudX1.push(Number(tWalked.vertices[i].toFixed(3)));
  assert.deepEqual(cloudX1,cloudX0,'clouds ahead stay locked in world space as player walks forward');

  const nearParticles=t0.particles.filter(p=>p.near);
  const farParticles=t0.particles.filter(p=>!p.near);
  assert.ok(nearParticles.length>3,'has near particles within 50m');
  assert.ok(farParticles.length>3,'has far cheap particles beyond 50m');

  // Within <=50m: small (~10-25px world radius 0.022..0.046m), calm speed, larger is slower, faster has longer tail, none shoot from player
  const nearRadii=new Set(nearParticles.map(p=>p.baseRadius.toFixed(4)));
  assert.ok(nearRadii.size>2,'near particles have randomized sizes');
  for(const p of nearParticles){
    assert.ok(p.pos[0]>=0.75,'particles appear inside the navigation line, not emanating from the player body');
    assert.ok(p.distFromPlayer<=50.001,'near particles are within 50m of player');
    assert.ok(p.baseRadius>=0.020&&p.baseRadius<=0.050,'near particle radius produces ~10-25px sparks on screen, not giant orbs');
    assert.ok(p.speed>=2.0&&p.speed<=4.0,'particle speed is calm and readable (~2.2..3.8 m/s)');
    assert.ok(p.tailLen>0.2,'near particles leave a comet tail');
  }
  for(let i=0;i<nearParticles.length;i++){
    for(let j=i+1;j<nearParticles.length;j++){
      const a=nearParticles[i],b=nearParticles[j];
      if(Math.abs(a.baseRadius-b.baseRadius)>1e-4){
        if(a.baseRadius>b.baseRadius){
          assert.ok(a.speed<b.speed,'larger particle moves slower');
          assert.ok(a.fullTailLen<b.fullTailLen,'faster particle has longer full tail');
        }else{
          assert.ok(a.speed>b.speed,'smaller particle moves faster');
          assert.ok(a.fullTailLen>b.fullTailLen,'faster particle has longer full tail');
        }
      }
    }
  }

  // Beyond >50m: cheap single-size particles with tails
  for(const p of farParticles){
    assert.ok(p.distFromPlayer>50,'far particles are beyond 50m');
    assert.ok(Math.abs(p.baseRadius-0.032)<1e-6,'far particles are uniform small size');
    assert.ok(Math.abs(p.speed-3.0)<1e-6,'far particles have uniform speed');
    assert.ok(p.tailLen>0.2,'far particles still have tails');
  }

  // Inspect emitted quad modes & distance thresholds (stride = 72 floats per 6-vertex quad)
  let hasCloud=false,hasCloudBloom=false,hasNearParticle=false,hasParticleBloom=false,hasFarCheapParticle=false;
  const particles0=[];
  for(let i=0;i<t0.vertices.length;i+=72){
    const x=t0.vertices[i],mode=t0.vertices[i+8];
    const tx=t0.vertices[i+9],ty=t0.vertices[i+10],tz=t0.vertices[i+11];
    if(mode<1.5)hasCloud=true;
    else if(Math.abs(mode-2.0)<0.1){
      hasCloudBloom=true;
      assert.ok(x<=100.001,'cloud bloom is never drawn beyond 100m from player');
    }else if(Math.abs(mode-3.0)<0.1){
      hasNearParticle=true;
      particles0.push(x);
      assert.ok(x<=50.001,'detailed near particles only within 50m');
      assert.ok(Math.hypot(tx,ty,tz)>0.05,'particle quad carries 3D comet tail vector');
    }else if(Math.abs(mode-3.5)<0.1){
      hasFarCheapParticle=true;
      assert.ok(x>50.0,'cheap uniform particles used beyond 50m');
      assert.ok(Math.hypot(tx,ty,tz)>0.05,'cheap far particle quad carries 3D comet tail vector');
    }else if(Math.abs(mode-4.0)<0.1){
      hasParticleBloom=true;
      assert.ok(x<=50.001,'per-particle white bloom source is only within 50m of player');
    }
  }
  assert.equal(hasCloud&&hasCloudBloom&&hasNearParticle&&hasParticleBloom&&hasFarCheapParticle,true,'emits all expected quad modes');

  // Verify lighting rules: particle lights only <=50m (white), cloud lights 1:1 Mysticism ratio
  const pLights=t0.lights.filter(l=>l.kind==='particle');
  const cLights=t0.lights.filter(l=>l.kind==='cloud');
  assert.ok(pLights.length>0,'emits white particle point lights within 50m');
  assert.ok(cLights.length>0,'emits dim Mysticism cloud point lights');
  for(const l of pLights){
    assert.ok(l.distFromPlayer<=50.001,'particle point light is strictly within 50m of player');
    assert.equal(l.color[0],l.color[1],'particle light is pure white (R === G)');
    assert.equal(l.color[1],l.color[2],'particle light is pure white (G === B)');
  }
  for(const l of cLights){
    assert.ok(Math.abs(l.color[0]/l.color[1]-244/114)<1e-4,'cloud light matches 1:1 Mysticism R:G ratio');
    assert.ok(Math.abs(l.color[0]/l.color[2]-244/182)<1e-4,'cloud light matches 1:1 Mysticism R:B ratio');
  }

  // Far player position >50m from all points produces zero particle lights
  const tFar=G.cloudTrail([[60,0,0],[80,0,0]],0,{alpha:1,dissipate:0,lift:1,playerPos:[0,0,0]});
  assert.equal(tFar.lights.filter(l=>l.kind==='particle').length,0,'no particle lights beyond 50m from player');

  const t1=G.cloudTrail(pts,0.45,{alpha:1,dissipate:0,lift:1,playerPos:[0,0,0]});
  const particles1=[];
  for(let i=0;i<t1.vertices.length;i+=72)if(Math.abs(t1.vertices[i+8]-3.0)<0.1)particles1.push(t1.vertices[i]);
  assert.notDeepEqual(particles0,particles1,'particles move along the line over time');
  const smoke=G.cloudTrail(pts,1.2,{alpha:0.4,dissipate:0.75,lift:1,playerPos:[0,0,0]});
  assert.ok(smoke.lights[0].color[0]<t0.lights[0].color[0]*0.35,'lighting dims smoothly during smoke dissipation');
  assert.equal(G.cloudTrail(pts,2.0,{alpha:0,dissipate:1,lift:1,playerPos:[0,0,0]}).count,0,'fully dissipated trail emits no geometry');
});

test('controller is independent of AI and reuses its own graph across selections',native,async()=>{
  const r=await room({pillar:true});let builds=0;
  const h=controller(r,{makeGraphClient:opts=>{const c=G.client({...opts,WorkerCtor:null}),build=c.build;return {...c,async build(input){builds++;return build(input);}};}});
  const q={uid:42},b={questUID:42,targetQuest:q,targetResource:{displayName:'Цель 42'}};
  h.ctx.foes.push({entity:{},ai:{feet:[11,0,8]},questBehaviour:b});
  assert.equal(h.api.availability().ready,true);
  assert.equal(h.api.start('aurum'),false);assert.equal(h.api.start('elite'),false);
  assert.equal(h.api.start('exit'),true);assert.equal((await settle(h.api)).phase,'following');assert.ok(h.api.points().length>1);
  assert.equal(h.api.start('quest','42'),true);await settle(h.api);assert.equal(builds,1);assert.equal(h.api.state().kind,'quest');h.api.stop(true);
});
test('a request at the goal reports arrival without a repeated zero-length search',native,async()=>{
  const r=await room(),h=controller(r);h.ctx.exitDoors=[{pos:[...h.nav.feet]}];h.api.start('exit');await settle(h.api,s=>s.phase==='arrived');
  for(let i=0;i<5;i++)h.advance(5000);assert.equal(h.api.state().phase,'arrived');assert.equal(h.api.state().distance,0);assert.equal(h.api.points().length,0);
});
test('replacing the collider cannot reuse an old graph even when context, room and revision number match',native,async()=>{
  const r=await room(),h=controller(r);h.api.start('exit');await settle(h.api);
  const replacement=await room();wall(replacement.col,'closed',7,0,12,0,8);
  assert.equal(G.revision(r.col,r.actions),G.revision(replacement.col,r.actions));
  h.nav.collider=replacement.col;assert.equal(h.api.matches(h.current),false);h.advance();assert.equal(h.api.state().phase,'idle');assert.equal(h.api.points().length,0);
  h.api.start('exit');assert.equal((await settle(h.api)).phase,'unavailable');
});
test('controller tracks quest movement, exact quest UID and works only while Shared Cartography effect is active',native,async()=>{
  const r=await room({pillar:true}),h=controller(r);
  const q={uid:42},b={questUID:42,targetQuest:q,targetResource:{displayName:'Цель 42'}};
  const foe={entity:{},ai:{feet:[2,0,10]},questBehaviour:b};
  h.ctx.foes.push(foe);
  assert.equal(h.api.start('quest','42'),true);await settle(h.api);
  assert.equal(h.api.state().uid,'42');assert.equal(h.api.state().name,'Цель 42');assert.ok(h.api.state().distance<6);
  foe.ai.feet=[12,0,2];h.advance();assert.equal(h.api.points().length,0);await settle(h.api);assert.ok(h.api.state().distance>8);
  b.targetResource.displayName='Новое имя цели';h.advance();assert.equal(h.api.state().name,'Новое имя цели');
  // Removing Shared Cartography effect immediately stops navigation and blocks starting until re-applied
  h.player.activeEffects=[];
  assert.equal(h.api.matches(h.current),false);
  h.advance();assert.equal(h.api.state().phase,'idle');assert.equal(h.api.points().length,0);
  assert.equal(h.api.availability().ready,false);
  assert.equal(h.api.start('exit'),false);assert.equal(h.api.start('quest','42'),false);
  h.player.activeEffects=[{kind:'sharedCartography',ended:true}];
  assert.equal(h.api.start('exit'),false);
  h.player.activeEffects=[{kind:'sharedCartography'}];
  assert.equal(h.api.start('quest','42'),true);await settle(h.api);assert.equal(h.api.state().phase,'following');
  q.questComplete=true;h.advance();assert.equal(h.api.state().phase,'unavailable');h.current=null;h.advance();assert.equal(h.api.state().phase,'idle');assert.equal(h.api.points().length,0);
});
test('a parallel corridor or another floor cannot count as arrival through a wall',native,async()=>{
  const r=await room(),h=controller(r);h.api.start('exit');await settle(h.api);
  quad(r.col,'parallel-wall',[[0,0,6.4],[14,0,6.4],[14,3,6.4],[0,3,6.4]]);h.nav.feet.set([12,0,6.8]);h.advance();
  assert.notEqual(h.api.state().phase,'arrived');assert.equal(h.api.points().length,0);assert.equal((await settle(h.api)).phase,'unavailable');
});
test('rejoining a route refuses an overhead crossbar that intersects the standing player head',native,async()=>{
  for(const [y,height]of [[1.68,.1],[.92,.01]]){
    const r=await room();quad(r.col,'crossbar',[[0,y,6.4],[14,y,6.4],[14,y+height,6.4],[0,y+height,6.4]]);
    const route={points:[[2,0,6],[12,0,6]],kinds:['walk','walk']};
    assert.equal(M.follow(route,[7,0,6.85],r.col,r.actions),null);
  }
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
  const q={uid:42},b={questUID:42,targetQuest:q,targetResource:{displayName:'Цель 42'}};
  h.ctx.foes.push({entity:{},ai:{feet:[11,0,8]},questBehaviour:b});
  const result=p=>({target:p.target,points:[p.from,p.target.at],kinds:['walk','walk'],distance:10});
  h.api.start('exit');await new Promise(setImmediate);assert.equal(pending.length,1);h.api.stop(true);pending[0].resolve(result(pending[0]));await new Promise(setImmediate);assert.equal(h.api.state().phase,'idle');assert.equal(disposed,1);
  h.api.start('exit');await new Promise(setImmediate);h.api.start('quest','42');await new Promise(setImmediate);pending.at(-1).resolve(result(pending.at(-1)));await settle(h.api);assert.equal(h.api.state().kind,'quest');pending[1].resolve(result(pending[1]));await new Promise(setImmediate);assert.equal(h.api.state().kind,'quest');
});
test('portal arrival retains remaining distance with no interaction instructions',native,async()=>{
  const r=await room({stacked:true}),h=controller(r);h.ctx.exitDoors=[{pos:[2,3,6]}];h.nav.transitions=[{entrance:{pos:[3,1,6]},exit:{pos:[8,3.2,6]}}];
  h.api.start('exit');await settle(h.api);h.nav.feet.set([2.8,0,6]);h.advance();assert.equal(h.api.state().phase,'transition');assert.ok(h.api.state().distance>=5);assert.equal(h.api.state().message,'');
  h.nav.feet.set([8,3,6]);h.advance();await settle(h.api);assert.equal(h.api.state().phase,'following');assert.ok(h.api.state().distance<9);
});
test('a contact portal keeps its last metre of line visible and continues automatically after the warp',native,async()=>{
  const r=await room({stacked:true}),h=controller(r),key='act:0:100';
  wall(r.col,key,7,0,12,0,2.5);r.actions.objects.set(key,{key,ns:0,positionKey:100,kind:'relay',triggerFlag:3,actionFlag:14,nextKey:200,aabb:{min:[7,0,0],max:[7,2.5,12]},origin:[7,0,6]});
  r.actions.resolvePosition=(_ns,k)=>({pos:k===100?[7,0,6]:[8,3,6]});h.nav.portalSurfaces=r.col;h.ctx.exitDoors=[{pos:[2,3,6]}];
  h.api.start('exit');await settle(h.api);h.nav.feet.set([5.9,0,6]);h.advance();
  assert.equal(h.api.state().phase,'following');assert.ok(h.api.points().length>1,'do not hide the line before touching the portal');
  h.nav.feet.set([6.64,0,6]);h.advance();assert.equal(h.api.state().phase,'transition');assert.equal(h.api.state().message,'');
  h.nav.feet.set([8,3,6]);h.advance();await settle(h.api);assert.equal(h.api.state().phase,'following');assert.ok(h.api.state().distance<8);
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
test('published navigation getters use live context geometry, feet, quest stands and native world rendering slot',{skip:!process.env.DFO_BUILD_DIR||(!process.env.DFO_UPSTREAM_DIR&&!process.env.DFO_ACORN_MODULE)},()=>{
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{transformAsset}=require('../src/mod/transforms.cjs'),{parse}=require(process.env.DFO_ACORN_MODULE||path.join(process.env.DFO_UPSTREAM_DIR,'node_modules/acorn'));
  const dir=path.join(process.env.DFO_BUILD_DIR,'assets'),load=prefix=>{const file=fs.readdirSync(dir).find(f=>f.startsWith(prefix));return transformAsset('assets/'+file,fs.readFileSync(path.join(dir,file),'utf8'),{dungeons:true,ru:false,marks:false,nearbyLoot:false});};
  const deep=load('deepWaterRuntime-');assert.ok(deep.log.some(([id])=>id==='dungeon.navContext'));
  const start=deep.text.indexOf('get dfoDungeonNavigation(){'),end=deep.text.indexOf('get dfoDungeonLive(){',start),getter=deep.text.slice(start,end).replace(/,$/,'');
  const ast=parse('({'+getter+'})',{ecmaVersion:'latest'}),obj=ast.body[0].expression.properties[0].value.body.body[0].argument,props=new Map(obj.properties.map(p=>[p.key.name,p.value]));
  const col={raycastHit(){}},feet=new Float32Array([1,0,2]),context={},[portals]=props.get('transitions').body.elements.map(e=>e.argument);context[props.get('collider').name]=col;context[props.get('portalSurfaces').name]=col;context[portals.callee.object.callee.name]=()=>new Map([['unvisited',{entrance:{pos:[3,1,2]},exit:{pos:[8,3.2,6]}}]]);context.feet=feet;
  const api=vm.runInNewContext('({dfoDungeonLive:{location:{mapTableData:{mapId:123}}},swimmer(){return{feet}},'+getter+'})',context);assert.equal(api.dfoDungeonNavigation.collider,col);assert.equal(api.dfoDungeonNavigation.feet,feet);assert.equal(api.dfoDungeonNavigation.key,123);assert.equal('mesh' in api.dfoDungeonNavigation,false);
  assert.equal(api.dfoDungeonNavigation.transitions().length,1,'all level portals are available before the automap reveals anything');assert.match(deep.text,/notePlacement\(/);assert.match(deep.text,/onCartographyCast\?\.\(/);
  const castMatch=deep.text.match(/createItem&&[\w$]+\?\.\([\w$]+\.createItem\),\(\(!([\w$]+)\?\.entity\|\|\1\.entity===([\w$]+)\)&&!([\w$]+)\?\.allyCast&&!\3\?\.reflectedCount&&!\(([\w$]+)\?\.saved\|\|\4\?\.chanceFailed\|\|\4\?\.reflected\)&&\(([\w$]+)\?\.effects[^]+?onCartographyCast\?\.\(\2,\5\)\}catch\(_dfoNavCast\)\{\}\}\)\(\)\)/);
  assert.ok(castMatch,'applySpellToPlayer hook present in deepWaterRuntime');
  const [,casterVar,playerVar,optsVar,resVar,spellVar]=castMatch,expr=castMatch[0].slice(castMatch[0].indexOf(',((')+1);
  const calls=[],playerObj={activeEffects:[{kind:'sharedCartography'}]};
  const castEnv={globalThis:{__dfoDungeonNavigation:{onCartographyCast:(p,sp)=>calls.push([p,sp])}}};
  const applyFn=vm.runInNewContext(`(${playerVar},${spellVar},${casterVar},${optsVar},${resVar})=>${expr}`,castEnv);
  applyFn(playerObj,{effects:[{type:46,subType:255}]},{entity:playerObj},null,{});assert.equal(calls.length,1);assert.equal(calls[0][0],playerObj);
  applyFn(playerObj,{settings:{effects:[{type:46,subType:255}]}},null,null,{});assert.equal(calls.length,2);
  applyFn(playerObj,{effects:[{type:35,subType:255}]},{entity:playerObj},null,{});assert.equal(calls.length,2);
  applyFn(playerObj,{effects:[{type:46,subType:255}]},{entity:{}},null,{});assert.equal(calls.length,2);
  applyFn(playerObj,{effects:[{type:46,subType:255}]},{entity:playerObj},{allyCast:true},{});assert.equal(calls.length,2);
  applyFn(playerObj,{effects:[{type:46,subType:255}]},{entity:playerObj},null,{chanceFailed:true});assert.equal(calls.length,2);
  const at=deep.text.indexOf('globalThis.__dfoDungeonNavigation?.draw(');assert.ok(at>=0);assert.ok(deep.text.indexOf('.drawWater(',at)>at,'line is drawn before the world pass is resolved by HUD quads');
  assert.match(deep.text,/torchLights:\(\)=>\{const _dfoL=[\w$]+\.lights\(\),_dfoN=globalThis\.__dfoDungeonNavigation\?\.lights\?\.\([\w$]+\);return _dfoN\?\.length\?\[\.\.\._dfoL,\.\.\._dfoN\]:_dfoL\}/);
  const modes=load('arenaGate-');assert.ok(modes.log.some(([id])=>id==='dungeon.navQuests'));
  const world=load('world-');assert.ok(world.log.some(([id])=>id==='dungeon.navDraw'));assert.match(world.text,/dfoContinuous\?globalThis\.__dfoDungeonGraph\.ribbon/);
  assert.match(world.text,/__dfoDungeonRender=/);assert.equal(world.text.includes('__dfoNavNative'),false);
  for(const changed of [deep,modes,world])parse(changed.text,{ecmaVersion:'latest',sourceType:'module'});
});
test('navigation hooks still attach when every AI bake and navmesh signature is absent',{skip:!process.env.DFO_BUILD_DIR},()=>{
  const fs=require('node:fs'),path=require('node:path'),{transformDungeonNav}=require('../src/mod/dungeon-nav-transform.cjs');
  const dir=path.join(process.env.DFO_BUILD_DIR,'assets'),file=fs.readdirSync(dir).find(f=>f.startsWith('deepWaterRuntime-'));
  const {transformAsset}=require('../src/mod/transforms.cjs'),raw=fs.readFileSync(path.join(dir,file),'utf8'),transformed=transformAsset('assets/'+file,raw,{dungeons:true,ru:false,marks:false,nearbyLoot:false}).text;
  const start=transformed.indexOf('get dfoDungeonNavigation(){'),end=transformed.indexOf('get dfoDungeonLive(){',start);
  const stripped=(transformed.slice(0,start)+transformed.slice(end)).replace('/*dungeon.navContext*/','').replaceAll('navMesh:','removedAiMesh:').replaceAll('.client.bake(','.unusedAiBake('),log=[];
  const next=transformDungeonNav('assets/'+file,stripped,log);assert.ok(log.some(([id,n])=>id==='dungeon.navContext'&&n===1));assert.ok(next.includes('get dfoDungeonNavigation(){'));
});
