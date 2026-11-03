'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const G=require('../src/mod/page/dfo_dungeon_graph.js'),M=require('../src/mod/page/dfo_dungeon_nav_model.js');
const {room,quad,wall}=require('./helpers/dungeon-navigation.cjs');
const native={skip:!process.env.DFO_UPSTREAM_DIR};
async function build(r){const g=new G.Graph();await g.build(await G.snapshot(M.navigationGeometry(r.col),r.actions));return g;}
const target=at=>({key:'goal',at});
async function shaft(){
  const r=await room();
  quad(r.col,'upper',[[7,4,0],[14,4,0],[14,4,12],[7,4,12]]);
  wall(r.col,'shaft-wall',7,0,12,0,4);
  return r;
}
test('own graph passes broad rooms, obstacles, ramps, stairs and narrow treads without an AI mesh',native,async()=>{
  for(const opts of [{},{pillar:true},{ramp:true},{stairs:true},{narrowStairs:true}]){
    const r=await room(opts),before=[...r.col._buckets].map(([k,b])=>[k,b.tris.length]),g=await build(r);
    const to=opts.ramp?[2,3,6]:opts.stairs?[2,3.6,6]:opts.narrowStairs?[2,4.2,6]:[12,0,6];
    const route=await g.route(r.from,[target(to)]);assert.ok(route,JSON.stringify(opts));
    if(opts.pillar)assert.ok(route.points.some(p=>p[2]<3||p[2]>9));
    if(opts.stairs||opts.narrowStairs)assert.ok(route.points.some(p=>p[1]>.1&&p[1]<to[1]-.1));
    assert.deepEqual([...r.col._buckets].map(([k,b])=>[k,b.tris.length]),before);
    const checked=g.tested;assert.ok(await g.route(r.from,[target(to)]));assert.equal(g.tested,checked,'repeat requests reuse proven edges');
  }
});
test('shaft wall gives a continuous climb and a directed descent with no lever milestone',native,async()=>{
  const r=await shaft(),g=await build(r),up=await g.route([2,0,6],[target([10,4,6])]);
  assert.ok(up);assert.ok(up.kinds.includes('climb'));assert.ok(up.points.some((p,i)=>i&&p[1]-up.points[i-1][1]>2));
  assert.ok(g.geo.climb([6.58,0,6],[7.42,4,6]));
  const down=await g.route([10,4,6],[target([2,0,6])]);assert.ok(down);assert.ok(down.kinds.includes('drop'));
  for(const p of up.points)assert.ok(Number.isFinite(p[0]+p[1]+p[2]));
  assert.equal(JSON.stringify(up).includes('lever'),false);
});
test('a climb accepted at a real wall can be completed by the original player motor',native,async()=>{
  const {pathToFileURL}=require('node:url'),path=require('node:path');
  const {PlayerMotor}=await import(pathToFileURL(path.join(process.env.DFO_UPSTREAM_DIR,'src/player/motor.js')));
  const r=await shaft(),g=await build(r);assert.ok(g.geo.climb([6.58,0,6],[7.42,4,6]));
  const motor=new PlayerMotor(r.col,{speed:50,running:30},{parkour:{enabled:()=>true,inputs:()=>({climbing:100,fatigue:1}),tally(){},say(){}}});
  motor.spawn(6.58,.02,6);
  for(let i=0;i<1500;i++){motor.update(1/60,{forward:1,strafe:0,run:false,jump:false,crouch:false},Math.PI/2);if(motor.grounded&&motor.pos[1]>3.8)break;}
  assert.ok(motor.grounded&&motor.pos[1]>3.8,JSON.stringify([...motor.pos]));
});
test('descending through an open shaft does not invent an upward climb on air',native,async()=>{
  const r=await room();r.col.removeBucket('edge-left');r.col.removeBucket('edge-right');r.col.removeBucket('edge-front');r.col.removeBucket('edge-back');
  quad(r.col,'upper',[[7,4,0],[14,4,0],[14,4,12],[7,4,12]]);const g=await build(r);
  assert.ok(g.geo.drop([7.42,4,6],[6.58,0,6]));assert.equal(g.geo.climb([6.58,0,6],[7.42,4,6]),null);
  assert.equal(await g.route([2,0,6],[target([10,4,6])]),null);
});
test('solid floor slabs, headroom, body width and a wall at a segment endpoint remain solid',native,async()=>{
  const r=await room();wall(r.col,'partition',7,0,12,0,8);const g=await build(r);
  assert.equal(g.geo.walk([6,0,6],[7,0,6]),null);assert.equal(g.geo.walk([7,0,6],[8,0,6]),null);
  assert.equal(await g.route([6,0,6],[target([8,0,6])]),null);
  const s=await room({stacked:true}),gs=await build(s);
  assert.equal(gs.geo.climb([2,0,6],[2,3,6]),null);assert.equal(gs.geo.drop([2,3,6],[2,0,6]),null);
  for(const y of [.8,1.5]){
    const c=await room();wall(c.col,'bar',7,0,12,y,.25);const gc=await build(c);
    assert.equal(await gc.route([6,0,6],[target([8,0,6])]),null,'a crossbar cannot be walked through');
  }
  const c=await room();quad(c.col,'ceiling',[[5,1.7,0],[8,1.7,0],[8,1.7,12],[5,1.7,12]]);const gc=await build(c);
  assert.equal(gc.geo.fits([6,0,6]),false);
});
test('a standing route needs the actual player capsule width',native,async()=>{
  for(const width of [.66,.74]){const r=await room();wall(r.col,'narrow-left',7,0,12,0,8);wall(r.col,'narrow-right',7+width,0,12,0,8);const g=await build(r),route=await g.route([7+width/2,0,2],[target([7+width/2,0,10])]);assert.equal(!!route,width>.7);}
});
test('centimetre seams are bridged but large unsupported gaps are not walking edges',native,async()=>{
  const r=await room();r.col.removeBucket('floor');quad(r.col,'first',[[0,0,0],[14,0,0],[14,0,6.23],[0,0,6.23]]);quad(r.col,'second',[[0,0,6.27],[14,0,6.27],[14,0,12],[0,0,12]]);
  let g=await build(r);assert.ok(await g.route([7,0,4],[target([7,0,8])]));
  r.col.removeBucket('second');quad(r.col,'second',[[0,0,7],[14,0,7],[14,0,12],[0,0,12]]);g=await build(r);
  assert.equal(g.geo.walk([7,0,4],[7,0,8]),null);
});
test('all actionable doors and controls are ignored only in the navigation geometry',native,async()=>{
  const r=await room({door:true});r.actions.objects.get('door:1').special=true;r.actions.objects.get('door:1').currentLockValue=100;
  M.notePlacement(r.col,'floor',{modelIdNum:74037});wall(r.col,'floor',4,0,12,0,2);
  const physical=()=>r.col.raycastHit([2,1,6],[1,0,0],12,{bodies:true}).dist,before=physical();
  const g=await build(r);assert.ok(await g.route(r.from,[target([12,0,6])]));assert.equal(physical(),before);
  wall(r.col,'real-wall',5,0,12,0,8);const blocked=await build(r);assert.equal(await blocked.route(r.from,[target([12,0,6])]),null);
});
test('moving a lift does not invalidate static profiles or introduce a switch objective',native,async()=>{
  const r=await shaft();quad(r.col,'lift',[[5,0,5],[7,0,5],[7,0,7],[5,0,7]]);
  r.actions.objects.set('lift',{kind:'action',key:'lift',state:'start'});
  const before=G.revision(r.col,r.actions),g=await build(r);assert.ok(await g.route([2,0,6],[target([10,4,6])]));
  r.col.removeBucket('lift');quad(r.col,'lift',[[5,4,5],[7,4,5],[7,4,7],[5,4,7]]);r.actions.objects.get('lift').state='end';
  assert.equal(G.revision(r.col,r.actions),before);assert.ok(await g.route([2,0,6],[target([10,4,6])]));
});
test('a rotating bridge supplies its horizontal end pose without a switch milestone',native,async()=>{
  const r=await room();r.col.removeBucket('floor');quad(r.col,'floor-left',[[0,0,0],[6,0,0],[6,0,12],[0,0,12]]);quad(r.col,'floor-right',[[10,0,0],[14,0,0],[14,0,12],[10,0,12]]);
  const without=await build(r);assert.equal(await without.route([3,0,6],[target([12,0,6])]),null);
  const cpu={positions:Float32Array.from([0,0,0,0,4,0,0,4,12,0,0,12]),normals:Float32Array.from([-1,0,0,-1,0,0,-1,0,0,-1,0,0]),indices:new Uint16Array([0,1,2,0,2,3])};
  r.actions.objects.set('bridge',{key:'bridge',kind:'action',cpu,base:Float32Array.from([1,0,0,0,0,1,0,0,0,0,1,0,6,0,0,1]),translation:{x:0,y:0,z:0},rotation:{x:0,y:0,z:-90}});
  const g=await build(r),p=await g.route([3,0,6],[target([12,0,6])]);assert.ok(p);assert.ok(p.distance<12);assert.equal(p.kinds.every(k=>k==='walk'),true);
});
test('directed unvisited portals are searched with an admissible shortcut heuristic',native,async()=>{
  const r=await room({stacked:true}),g=await build(r),links=[{entrance:{pos:[3,1,6]},exit:{pos:[8,3.2,6]}}];
  const route=await g.route([2,0,6],[target([2,3,6])],links);assert.ok(route?.transition);assert.ok(route.points.at(-1)[0]<4);assert.ok(route.distance<10);
  assert.equal(route.points.some(p=>p[1]>1),false,'no ribbon is drawn across teleportation');
  const flat=await room(),gf=await build(flat),p=await gf.route([2,0,6],[{key:'near',at:[6,0,6]},{key:'via-portal',at:[12,0,6]}],[{entrance:{pos:[2.5,.2,6]},exit:{pos:[11,.2,6]}}]);
  assert.equal(p.target.key,'via-portal');assert.ok(p.transition);
});
test('snapshot copies only three triangle vertices despite collider query caches',native,async()=>{
  const r=await room(),a=await G.snapshot(r.col,r.actions);
  for(const b of r.col._buckets.values())for(const t of b.tris){t[3]=[-100,-100,-100];t[4]=[100,100,100];}
  const b=await G.snapshot(r.col,r.actions);assert.equal(a.total,b.total);assert.equal(b.total%9,0);assert.deepEqual(a.parts.map(p=>p.key),b.parts.map(p=>p.key));
});
test('profiles reuse translated geometry and change their key after a real mesh edit',native,async()=>{
  const r=await room();r.col.removeBucket('floor');quad(r.col,'one',[[0,0,0],[4,0,0],[4,0,4],[0,0,4]]);quad(r.col,'two',[[10,0,0],[14,0,0],[14,0,4],[10,0,4]]);
  let input=await G.snapshot(r.col,r.actions);const one=input.parts.find(p=>p.origin[0]===0&&p.data.length===18&&p.data.every((x,i)=>i%3!==1||x===0)),two=input.parts.find(p=>p.origin[0]===10);assert.equal(one.key,two.key);
  r.col.removeBucket('two');quad(r.col,'two',[[10,0,0],[14.1,0,0],[14.1,0,4],[10,0,4]]);input=await G.snapshot(r.col,r.actions);assert.notEqual(one.key,input.parts.find(p=>p.origin[0]===10).key);
});
test('vertical line has visible nondegenerate 3D ribbon triangles',()=>{
  const ps=G.ribbon([[0,0,0],[0,8,0]]);assert.equal(ps.length,36);
  for(let i=0;i<ps.length;i+=9){const a=ps.slice(i,i+3),u=ps.slice(i+3,i+6).map((x,k)=>x-a[k]),v=ps.slice(i+6,i+9).map((x,k)=>x-a[k]);assert.ok(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])>.01);}
});
test('long graph work yields and an interrupted build cannot return a partial route',native,async()=>{
  const r=await room();let n=0;const g=new G.Graph();await assert.rejects(g.build(await G.snapshot(r.col,r.actions),async()=>{if(++n>2)throw Error('cancelled');}),/cancelled/);assert.ok(n>2);
});
test('rapid selections wait for a cooperative fallback build and discard an older request',native,async()=>{
  const r=await room(),input=await G.snapshot(r.col,r.actions);let release,held=false;
  const c=G.client({WorkerCtor:null,checkpoint:async()=>{if(!held){held=true;await new Promise(resolve=>release=resolve);}}}),building=c.build(input);
  const first=c.route([2,0,6],[target([12,0,6])],[]),check=assert.rejects(first,e=>e.cancelled===true),second=c.route([2,0,6],[target([2,0,10])],[]);
  release();await building;await check;assert.ok(await second);c.dispose();
});
test('the real Privateer’s Hold seam and multiple floors route without any AI navmesh',{skip:!process.env.DFO_UPSTREAM_DIR||!process.env.ARENA2_PATH},async()=>{
  const {realDungeon}=require('./helpers/dungeon-navigation.cjs'),r=await realDungeon(),g=await build(r);
  const seam=await g.route([53.5,19.69,31.25],[target([56.1,19.2,33.04])]);assert.ok(seam);assert.ok(seam.points.some(p=>p[2]>32));
  for(const at of r.anchors.slice(0,2)){const p=await g.route(r.from,[target(at)],r.transitions);assert.ok(p);assert.ok(p.distance>50);const tested=g.tested;assert.ok(await g.route(r.from,[target(at)],r.transitions));assert.equal(g.tested,tested);}
});
test('the real volumetric S0000140 elevator connects its 12.8 metre shaft in both directions',{skip:!process.env.DFO_UPSTREAM_DIR||!process.env.ARENA2_PATH},async()=>{
  const {realBlock}=require('./helpers/dungeon-navigation.cjs'),r=await realBlock('S0000140.RDB'),g=await build(r);
  const lift=[...r.actions.objects.values()].find(o=>o.modelIdNum===74013);assert.ok(lift);assert.ok(lift.aabb.max[1]-lift.aabb.min[1]>3,'this elevator is not a thin deck');
  const at=[24,12.8,25.6],to=[24,0,25.6];
  for(const [from,end]of [[at,to],[to,at]]){const p=await g.route(from,[target(end)]);assert.ok(p);assert.ok(p.kinds.includes('lift'));assert.ok(p.distance<16);}
  const before=G.revision(r.col,r.actions);lift.state='forward';lift.t=.5;assert.equal(G.revision(r.col,r.actions),before);
});
