'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const G=require('../src/mod/page/dfo_dungeon_graph.js'),M=require('../src/mod/page/dfo_dungeon_nav_model.js');
const {room,quad,wall,playerModules,realBlock}=require('./helpers/dungeon-navigation.cjs');
const {deepShaftCluster}=require('./helpers/dungeon-complex.cjs');
const native={skip:!process.env.DFO_UPSTREAM_DIR};
const pause=async()=>new Promise(setImmediate);
async function build(r){const g=new G.Graph();await g.build(await G.snapshot(M.navigationGeometry(r.col),r.actions,pause),pause);return g;}
const goal=at=>[{key:'goal',at}];

test('ten clustered shafts keep all distinct landings, including a 100 m climb and downward returns',native,async t=>{
  const r=await deepShaftCluster(),at=performance.now(),g=await build(r);
  for(const [from,to]of [[r.from,r.goal],[r.goal,r.from]]){
    const route=await g.route(from,goal(to),[],pause);assert.ok(route);
    assert.ok(route.kinds.includes('climb'));assert.ok(route.kinds.includes('drop'));
    assert.ok(route.points.some((p,i)=>i&&Math.abs(p[1]-route.points[i-1][1])>80));
    for(const y of r.levels)assert.ok(route.points.some(p=>Math.abs(p[1]-y)<.1),`landing ${y}`);
    const tested=g.tested;assert.ok(await g.route(from,goal(to),[],pause));assert.equal(g.tested,tested);
  }
  t.diagnostic(JSON.stringify({nodes:g.nodes.length,tested:g.tested,ms:Math.round(performance.now()-at)}));
});

test('the original motor climbs beyond 64 m while the graph validates the deep wall and its upper exit',native,async()=>{
  const r=await room();quad(r.col,'upper',[[7,96,0],[14,96,0],[14,96,12],[7,96,12]]);wall(r.col,'deep-wall',7,0,12,0,96);
  const g=await build(r),path=g.geo.climb([6.58,0,6],[7.42,96,6]);assert.ok(path);
  const {PlayerMotor}=await playerModules();
  const motor=new PlayerMotor(r.col,{speed:50,running:30},{climbing:{inputs:()=>({climbing:100,luck:100}),rolls:()=>0,tally(){},say(){}}});
  motor.spawn(6.58,.02,6);
  for(let i=0;i<18000;i++){motor.update(1/60,{forward:1,strafe:0,run:false,jump:false,crouch:false},Math.PI/2);if(motor.pos[1]>80)break;}
  assert.ok(motor.pos[1]>80,JSON.stringify([...motor.pos]));
  assert.ok(g.geo.fits(path.at(-1))); // Stamina/skill checks are not a navigation prediction.
});

test('a walk-into portal ends at the actual contact surface and the native action really teleports there',native,async()=>{
  const {pathToFileURL}=require('node:url'),path=require('node:path');
  const {ActionSystem,actionContact}=await import(pathToFileURL(path.join(process.env.DFO_UPSTREAM_DIR,'src/world/actionSystem.js')));
  const r=await room({stacked:true});r.actions=new ActionSystem(r.col,{});
  const box={min:[7,0,0],max:[7,2.5,12]},o=r.actions.addRelay(0,100,{actionFlag:14,triggerFlag:3,nextObject:200},box,[7,0,6]);
  wall(r.col,o.key,7,0,12,0,2.5);
  r.actions.resolvePosition=(_ns,key)=>key===100?{pos:[7,0,6]}:key===200?{pos:[8,3,6]}:null;
  const g=await build(r),transitions=M.portalTransitions(r.actions),route=await g.route([2,0,6],goal([2,3,6]),transitions,pause);
  assert.ok(route?.transition?.contact);assert.ok(route.points.at(-1)[0]<7);
  assert.ok(route.points.at(-1)[0]>6.5,'line goes all the way to the contact');
  const {PlayerMotor}=await playerModules(),motor=new PlayerMotor(r.col);motor.spawn(...route.points.at(-1));
  motor.update(1/60,{forward:1,strafe:0,run:false,jump:false,crouch:false},Math.PI/2);
  assert.equal(actionContact(o,motor.pos,motor.height,r.col,[1,0]),'WalkInto');
  let teleported=null;r.actions.onTeleport=p=>{teleported=p;};
  r.actions.receive(o,'WalkInto');assert.deepEqual(teleported.pos,[8,3,6]);
  assert.equal(route.points.some(p=>p[1]>1),false,'no line across the teleport');
});

test('portal trigger metadata follows native action chains, retains direction and never calls a mechanism',()=>{
  const roots=[{key:'walk',ns:1,positionKey:1,triggerFlag:3,actionFlag:0,nextKey:2,aabb:{min:[0,0,0],max:[1,2,1]}},
    {key:'tele',ns:1,positionKey:2,triggerFlag:0,actionFlag:14,nextKey:3},
    {key:'flat',ns:2,positionKey:4,triggerFlag:3,actionFlag:14,nextKey:5,kind:'relay',isFlat:true}];
  const actions={objects:new Map(roots.map(o=>[o.key,o])),resolvePosition:(ns,key)=>({pos:[key,ns,0]}),receive(){assert.fail('read only');}};
  const before=JSON.stringify([...actions.objects]),out=M.portalTransitions(actions);
  assert.equal(out.length,1);assert.equal(out[0].activation.kind,'into');assert.deepEqual(out[0].entrance.pos,[1,1,0]);assert.deepEqual(out[0].exit.pos,[3,1,0]);
  assert.equal(JSON.stringify([...actions.objects]),before);
  roots[0].actionFlag=12;assert.equal(M.portalTransitions(actions).length,0,'an input dialog is not an unconditional walk-through portal');
});

test('walk-on portals use their own lower support surface, not the top of a tall bounding box or an unrelated floor',native,async()=>{
  const r=await room(),key='act:0:1';
  quad(r.col,key,[[3,.8,4],[5,.8,4],[5,.8,8],[3,.8,8]]);wall(r.col,key,3,4,8,.8,2.2);wall(r.col,key,5,4,8,.8,2.2);
  const o={key,ns:0,positionKey:1,kind:'relay',triggerFlag:1,actionFlag:14,nextKey:2,aabb:{min:[3,.8,4],max:[5,3,8]},origin:[4,.8,6]};
  r.actions={objects:new Map([[key,o]]),collider:r.col,resolvePosition:(_ns,k)=>({pos:k===1?[4,.8,6]:[12,0,6]})};
  const g=await build(r),[t]=M.portalTransitions(r.actions),entries=g.portalEntries(t);assert.ok(entries.length);
  assert.ok(entries.every(p=>Math.abs(p[1]-.8)<.01),'only the actual portal seat counts as a WalkOn');
  const {pathToFileURL}=require('node:url'),path=require('node:path'),{actionContact}=await import(pathToFileURL(path.join(process.env.DFO_UPSTREAM_DIR,'src/world/actionSystem.js')));
  assert.ok(entries.some(p=>actionContact(o,p,1.8,r.col)==='WalkOn'));
});

test('a 96 m moving support connects intermediate side landings without a wall, lever or an invented floor',native,async()=>{
  const r=await room();for(const key of ['edge-left','edge-right','edge-front','edge-back'])r.col.removeBucket(key);
  quad(r.col,'middle',[[7,40,0],[14,40,0],[14,40,12],[7,40,12]]);
  quad(r.col,'higher',[[0,72,0],[4,72,0],[4,72,12],[0,72,12]]);
  quad(r.col,'upper',[[7,96,0],[14,96,0],[14,96,12],[7,96,12]]);
  const cpu={positions:Float32Array.from([4,0,4,7,0,4,7,0,8,4,0,8]),normals:Float32Array.from([0,1,0,0,1,0,0,1,0,0,1,0]),indices:Uint16Array.from([0,1,2,0,2,3])};
  r.actions.objects.set('lift',{key:'lift',kind:'action',cpu,base:Float32Array.from([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),translation:{x:0,y:96,z:0},rotation:{x:0,y:0,z:0}});
  const before=[...r.col._buckets].map(([k,b])=>[k,b.tris.length]),g=await build(r);
  for(const [from,to]of [[[10,40,6],[10,96,6]],[[2,72,6],[10,40,6]],[[10,96,6],[2,72,6]]]){
    const route=await g.route(from,goal(to),[],pause);assert.ok(route,JSON.stringify({from,to}));if(to[1]>from[1])assert.ok(route.kinds.includes('lift'));
  }
  quad(r.col,'lift',[[4,60,4],[7,60,4],[7,60,8],[4,60,8]]);
  const riding=M.riding([5.5,60,6],r.col,r.actions);assert.equal(riding,'lift');
  const mid=await g.route([5.5,60,6],goal([10,96,6]),[],pause,{riding});assert.ok(mid);assert.ok(mid.kinds.includes('lift'));assert.ok(mid.distance<45,'a request while riding continues upward');
  const wrong=await g.route([5.5,60,6],goal([10,96,6]),[],pause,{riding:'another-lift'});
  assert.ok(!wrong||wrong.distance>100,'an airborne start cannot ride the wrong shaft directly; a real descent and return may still exist');
  r.col.removeBucket('lift');
  assert.deepEqual([...r.col._buckets].map(([k,b])=>[k,b.tris.length]),before,'the game receives no extra floor or collider');
  wall(r.col,'sealed-side',7,0,12,38,4);const blocked=await build(r);assert.equal(await blocked.route([10,40,6],goal([10,96,6]),[],pause),null);
});

test('real N0000037 walk-in portals have supported contact approaches on the original block',{
  skip:!process.env.DFO_UPSTREAM_DIR||!process.env.ARENA2_PATH,timeout:120000
},async()=>{
  const r=await realBlock('N0000037.RDB'),g=await build(r),walk=r.transitions.filter(t=>t.activation.kind==='into');assert.ok(walk.length>=7);
  const {pathToFileURL}=require('node:url'),path=require('node:path'),{actionContact}=await import(pathToFileURL(path.join(process.env.DFO_UPSTREAM_DIR,'src/world/actionSystem.js'))),{PlayerMotor}=await playerModules();
  for(const t of walk){
    const entries=g.portalEntries(t);assert.ok(entries.length,t.key);assert.ok(entries.every(p=>g.geo.fits(p)));assert.ok(t.activation.surfaces?.length,'actual trigger triangles are included');
    const raw=t.exit.pos,end=g.geo.ground([raw[0],raw[1]+.15,raw[2]],0,128);assert.ok(end&&g.geo.fits(end));
    const route=await g.route(entries[0],goal(end),[t],pause);assert.ok(route?.transition,t.key);
    const object=r.actions.objects.get(t.key);let contact=false;
    for(const entry of entries){
      const wish=[t.entrance.pos[0]-entry[0],t.entrance.pos[2]-entry[2]],motor=new PlayerMotor(r.col);motor.spawn(...entry);
      if(actionContact(object,motor.pos,motor.height,r.portalSurfaces,wish)==='WalkInto'){contact=true;break;}
      motor.update(1/60,{forward:1,strafe:0,run:false,jump:false,crouch:false},Math.atan2(wish[0],wish[1]));
      if(actionContact(object,motor.pos,motor.height,r.portalSurfaces,wish)==='WalkInto'){contact=true;break;}
    }
    assert.ok(contact,t.key+': the native contact actually hears a walk into this portal');
  }
});
