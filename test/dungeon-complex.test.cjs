'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const G=require('../src/mod/page/dfo_dungeon_graph.js'),M=require('../src/mod/page/dfo_dungeon_nav_model.js');
const {multiblock,crossedBlocks,replayWalk}=require('./helpers/dungeon-complex.cjs');
const {quad}=require('./helpers/dungeon-navigation.cjs');
const enabled={skip:!process.env.DFO_UPSTREAM_DIR};
const pause=async()=>new Promise(setImmediate);
async function graph(r){const g=new G.Graph();await g.build(await G.snapshot(M.navigationGeometry(r.col),r.actions,pause),pause);return g;}
test('a three-storey route crosses three block instances, both thresholds, stairs, a ramp and a rotated model',enabled,async()=>{
  const r=await multiblock(),g=await graph(r),result=await g.route(r.from,[{key:'goal',at:r.goal}],[],pause);
  assert.ok(result);assert.deepEqual(crossedBlocks(result.points,r.blocks),[0,1,2]);assert.ok(result.distance>150);
  assert.ok(result.points.some(p=>p[1]>.3&&p[1]<3.4));assert.ok(result.points.some(p=>p[1]>3.8&&p[1]<6.9));
  assert.ok(result.kinds.every(k=>k==='walk'));assert.ok(result.points.at(-1)[1]>7.1);
  const moved=await replayWalk(r,result.points);assert.ok(M.distance(moved.motor.pos,r.goal)<.4);assert.ok(moved.maxY>7.1);
  assert.deepEqual(crossedBlocks(moved.visited,r.blocks),[0,1,2]);
});
test('overlapping floors across three blocks cannot replace removed stair and ramp connections',enabled,async()=>{
  const r=await multiblock({sealed:true}),g=await graph(r);
  assert.equal(await g.route(r.from,[{key:'upper',at:r.goal}],[],pause),null);
  assert.ok(await g.route(r.from,[{key:'lower',at:[r.goal[0],0,r.goal[2]]}],[],pause));
});
test('a raised step retry cannot move through a thin overhead slab between floor samples',enabled,async()=>{
  const r=await multiblock();quad(r.col,'thin-overhead',[[60.447,4.7,4],[60.46,4.7,4],[60.46,4.7,8],[60.447,4.7,8]]);const g=await graph(r);
  for(const [a,b]of [[[60,3.6,6],[61,3.6,6]],[[61,3.6,6],[60,3.6,6]],[[60.45,3.6,6],[60.45,3.6,6]]]){
    assert.equal(g.geo.bodyClear(a,b,1.2,true),false);
    assert.ok(G.bodyBlocked(r.col,a,b,M.routingSkip(r.actions),true,1.2));
  }
});
test('3D spatial queries agree with the original collider across floors and exact cell boundaries',enabled,async()=>{
  const r=await multiblock(),g=await graph(r),skip=M.routingSkip(r.actions);let seed=1234567;
  const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  const queries=[];
  for(let i=0;i<600;i++){const origin=[random()*r.side*3,random()*13,random()*12],v=[random()-.5,random()-.5,random()-.5],n=Math.hypot(...v);queries.push([origin,v.map(x=>x/n),15]);}
  for(const x of [0,2,8,12,50,102.4])for(const y of [0,2,3.6,4,6,7.2,10])for(const d of [[0,-1,0],[0,1,0],[1,0,0],[0,0,-1],[1/Math.sqrt(3),-1/Math.sqrt(3),1/Math.sqrt(3)]])queries.push([[x,y,6],d,20]);
  for(const [origin,dir,max]of queries){const original=r.col.raycastHit(origin,dir,max,{skip,bodies:true}),actual=g.geo.ray(origin,dir,max);if(Number.isFinite(original.dist))assert.ok(actual&&Math.abs(original.dist-actual.dist)<.0001,JSON.stringify({origin,dir,original:original.dist,actual:actual?.dist}));else assert.equal(actual,null,JSON.stringify({origin,dir,actual:actual?.dist}));}
});
test('body sweeps match the original exact sphere/triangle sweep, including live translated and rotated buckets',enabled,async()=>{
  const {pathToFileURL}=require('node:url'),path=require('node:path'),{sweepSphereTriangle}=await import(pathToFileURL(path.join(process.env.DFO_UPSTREAM_DIR,'src/player/collider.js')));
  const r=await multiblock(),I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  r.col.addMesh('posed-rail',new Float32Array([0,.92,0,2,.92,0,2,.93,0,0,.93,0]),new Uint16Array([0,1,2,0,2,3]),I,()=>[20,0,6],()=>[0,0,-1,0,1,0,1,0,0]);
  const g=await graph(r),skip=M.routingSkip(r.actions),triangles=[];
  for(const [key,b]of r.col._buckets){if(skip.includes(key))continue;const t=b.t(),rot=b.r?.();for(let i=0;i<b.tris.length;i++){if(b.sight?.[i])continue;triangles.push(b.tris[i].slice(0,3).map(p=>rot?[rot[0]*p[0]+rot[3]*p[1]+rot[6]*p[2]+t[0],rot[1]*p[0]+rot[4]*p[1]+rot[7]*p[2]+t[1],rot[2]*p[0]+rot[5]*p[1]+rot[8]*p[2]+t[2]]:p.map((x,k)=>x+t[k])));}}
  let seed=98765;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296),queries=[];
  for(let i=0;i<400;i++){const a=[random()*r.side*3,random()*11,random()*12],b=a.map(x=>x+(random()-.5)*8);queries.push([a,b]);}
  queries.push([[19,0,5],[22,0,7]],[[20,0,3],[20,0,8]],[[7,0,6],[13,3.6,6]]);
  for(const [a,b]of queries){const d=b.map((x,k)=>x-a[k]),len=Math.hypot(...d),dir=d.map(x=>x/len),out=[];
    const hit=G.BODY.centres.some(y=>triangles.some(tri=>sweepSphereTriangle(a[0],a[1]+y,a[2],G.BODY.radius-.005,...dir,len,...tri,out)));
    assert.equal(!g.geo.clear(a,b),hit,JSON.stringify({a,b,query:'graph'}));assert.equal(!!G.bodyBlocked(r.col,a,b,skip),hit,JSON.stringify({a,b,query:'live'}));
  }
});
test('portals across block instances preserve direction and never draw a line across teleportation',enabled,async()=>{
  const r=await multiblock(),g=await graph(r),links=[{entrance:{pos:[8,1,2]},exit:{pos:[r.goal[0]-4,7.4,9]}}];
  const a=await g.route(r.from,[{key:'goal',at:r.goal}],links,pause);assert.ok(a?.transition);assert.ok(a.distance<30);assert.deepEqual(crossedBlocks(a.points,r.blocks),[0]);
  const b=await g.route(a.transition.to,[{key:'goal',at:r.goal}],links,pause);assert.ok(b&&!b.transition);assert.deepEqual(crossedBlocks(b.points,r.blocks),[2]);
  const reverse=await g.route(r.goal,[{key:'start',at:r.from}],links,pause);assert.ok(reverse&&!reverse.transition);assert.ok(reverse.distance>140);
});
test('original multi-block dungeons connect distant markers across several floors',{
  skip:!process.env.DFO_UPSTREAM_DIR||!process.env.ARENA2_PATH,timeout:120000
},async t=>{
  const {realDungeon}=require('./helpers/dungeon-navigation.cjs');
  for(const [name,index,minBlocks,minHeight]of [["The Convocation of Elona",21,4,25],["Ruins of Old Carololda's Farm",97,5,31]]){
    const r=await realDungeon(name),g=await graph(r),at=performance.now(),route=await g.route(r.from,[{key:'marker:'+index,at:r.anchors[index]}],r.transitions,pause);
    assert.ok(route,name);const blocks=r.dungeon.blocks.map((b,index)=>({...b,index})),crossed=crossedBlocks(route.points,blocks),ys=route.points.map(p=>p[1]);
    assert.ok(crossed.length>=minBlocks,JSON.stringify({name,crossed}));assert.ok(Math.max(...ys)-Math.min(...ys)>minHeight);assert.ok(route.distance>200);
    t.diagnostic(JSON.stringify({name,blocks:crossed,distance:Math.round(route.distance),height:Math.round(Math.max(...ys)-Math.min(...ys)),ms:Math.round(performance.now()-at)}));
    const proven=g.tested,repeated=await g.route(r.from,[{key:'marker:'+index,at:r.anchors[index]}],r.transitions,pause);assert.ok(repeated);assert.equal(g.tested,proven,'a long query must not evict its own proven edges before a repeated request');
  }
});
