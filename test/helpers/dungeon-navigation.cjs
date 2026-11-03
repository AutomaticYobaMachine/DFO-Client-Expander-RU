'use strict';
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
let loaded;
async function nativeModules(){
  if(!loaded)loaded=(async()=>{
    const dir=process.env.DFO_UPSTREAM_DIR,load=f=>import(pathToFileURL(path.join(dir,f)).href);
    const [{Collider},{bakeNavFromCollider}]=await Promise.all([load('src/player/collider.js'),load('src/ai/nav/navBake.js')]);
    const source=fs.readFileSync(path.join(dir,'src/ai/nav/navmesh.js'),'utf8');
    const queries=await import('data:text/javascript;base64,'+Buffer.from(source+'\nexport {solvePath};').toString('base64'));
    const native={solve:queries.solvePath,locate:queries.__locatePolyIndexed,height:queries.polyHeight,Draw:class{},isDoor:o=>!!o&&o.kind==='door'&&!o.special,
      openDoors:a=>new Set([...(a?.objects?.values?.()||[])].filter(o=>o.kind==='door'&&!o.special&&!(o.currentLockValue>0)).map(o=>o.key))};
    return{Collider,bakeNavFromCollider,native};
  })();return loaded;
}
const quad=(col,key,ps,translation=null)=>col.addMesh(key,new Float32Array(ps.flat()),new Uint16Array([0,1,2,0,2,3]),identity,translation);
function wall(col,key,x,z0,z1,y=0,high=3,move=null){quad(col,key,[[x,y,z0],[x,y+high,z0],[x,y+high,z1],[x,y,z1]],move);}
async function room({pillar=false,door=false,stacked=false,ramp=false,stairs=false,narrowStairs=false}={}){
  const {Collider,bakeNavFromCollider,native}=await nativeModules(),col=new Collider(()=>-Infinity),shift=[0,0,0],actions={objects:new Map()};
  quad(col,'floor',[[0,0,0],[14,0,0],[14,0,12],[0,0,12]]);
  wall(col,'edge-left',0,0,12);wall(col,'edge-right',14,0,12);
  quad(col,'edge-front',[[0,0,0],[14,0,0],[14,3,0],[0,3,0]]);quad(col,'edge-back',[[0,0,12],[14,0,12],[14,3,12],[0,3,12]]);
  if(pillar){wall(col,'pillar-a',6,3,9);wall(col,'pillar-b',7,3,9);quad(col,'pillar-c',[[6,0,3],[7,0,3],[7,3,3],[6,3,3]]);quad(col,'pillar-d',[[6,0,9],[7,0,9],[7,3,9],[6,3,9]]);}
  if(door){wall(col,'partition-a',7,0,5.3);wall(col,'partition-b',7,6.7,12);wall(col,'door:1',7,5.3,6.7,0,2.5,()=>shift);actions.objects.set('door:1',{kind:'door',key:'door:1',currentLockValue:0});}
  if(stacked)quad(col,'upper-floor',[[0,3,0],[10,3,0],[10,3,12],[0,3,12]]);
  if(ramp){quad(col,'upper-floor',[[0,3,0],[7,3,0],[7,3,12],[0,3,12]]);quad(col,'ramp',[[7,3,0],[13,0,0],[13,0,3],[7,3,3]]);}
  if(stairs||narrowStairs){const run=narrowStairs ? .18 : .45,rise=narrowStairs ? .35 : .45,count=narrowStairs?12:8,end=13-count*run,top=count*rise;quad(col,'upper-floor',[[0,top,0],[end,top,0],[end,top,12],[0,top,12]]);for(let i=0;i<count;i++){const x=13-i*run,y=(i+1)*rise;quad(col,'stairs',[[x-run,y,0],[x,y,0],[x,y,3],[x-run,y,3]]);wall(col,'risers',x,0,3,i*rise,rise);}}
  const from=[2,0,6],anchors=[[12,0,6],...(stacked?[[2,3,6]]:[]),...(ramp?[[2,3,6],[10,1.5,1.5]]:[]),...(stairs?[[2,3.6,6]]:[]),...(narrowStairs?[[2,4.2,6]]:[])];
  const bake=()=>bakeNavFromCollider(col,{anchor:from,anchors,exclude:native.openDoors(actions)}).chf;
  return{col,actions,shift,from,native,bake,mesh:bake()};
}
async function realDungeon(name="Privateer's Hold") {
  const load=f=>import(pathToFileURL(path.join(process.env.DFO_UPSTREAM_DIR,f)).href);
  const [{MapsFile},{BlocksFile},{Arch3dFile},{dfMeshToModel},{customModelFor,emptyModel},{layoutDungeon},{trs,multiply},{ActionSystem,classifyPlacementAction},{floorLanding},{collectDungeonEnemies},{patchSeams},{worldAabb},{ACTION_FLAGS},{teleporterConnection}]=await Promise.all([
    'src/formats/mapsFile.js','src/formats/blocksFile.js','src/formats/arch3dFile.js','src/world/meshReader.js','src/world/customModels.js','src/world/dungeon/dungeonLayout.js','src/world/mat4.js','src/world/actionSystem.js','src/player/enterExit.js','src/characters/dungeonEnemies.js','src/world/arch3dSeams.js','src/player/activate.js','src/world/rdbLayout.js','src/systems/automap/automap.js'
  ].map(load));
  const {Collider,bakeNavFromCollider,native}=await nativeModules(),M=require('../../src/mod/page/dfo_dungeon_nav_model.js');
  const rd=f=>new Uint8Array(fs.readFileSync(path.join(process.env.ARENA2_PATH,f))),maps=new MapsFile(),blocks=new BlocksFile(),arch=new Arch3dFile();
  maps.load(rd('MAPS.BSA'),rd('CLIMATE.PAK'),rd('POLITIC.PAK'));blocks.load(rd('BLOCKS.BSA'));arch.load(rd('ARCH3D.BSA'));
  const loc=maps.getLocationByName('Daggerfall',name),models=new Map();
  const model=id=>{if(!models.has(id)){const c=customModelFor(id),i=c?-1:arch.getRecordIndex(id),cpu=c??(i<0?null:dfMeshToModel(patchSeams(id,arch.getMesh(i)),()=>({width:1,height:1})));models.set(id,cpu?{...cpu,modelIdNum:id}:null);}return models.get(id);};
  const dungeon=layoutDungeon(loc,blocks,id=>model(id)??emptyModel()),col=new Collider(()=>-Infinity),actions=new ActionSystem(col,{}),positions=new Map();
  for(const [bi,b]of dungeon.blocks.entries()){
    const origin=trs(b.originX,0,b.originZ,0,0,0);
    for(const [key,p]of b.layout.objectPositions)positions.set(`${bi}:${key}`,{pos:[p.x+b.originX,p.y,p.z+b.originZ],yawDeg:p.yawDeg});
    for(const p of b.layout.placements){
      const cpu=model(p.modelIdNum);if(!cpu)continue;const m=multiply(origin,p.matrix),box=worldAabb(cpu.positions,m),cls=p.action?classifyPlacementAction(p.action.actionFlag,false):null;
      if(cls==='move'){actions.addAction(bi,p.position,cpu,m,p.action).aabb=box;continue;}
      if(cls==='specialDoor'){actions.addSpecialDoor(bi,p.position,cpu,m,p.action).aabb=box;continue;}
      if(p.action)actions.addRelay(bi,p.position,p.action,box,[m[12],m[13],m[14]],p.modelIdNum);
      M.notePlacement(col,'dungeon',cpu);col.addMesh('dungeon',cpu.positions,cpu.indices,m);
    }
    for(const d of b.layout.actionDoors){if(d.disabled)continue;const cpu=model(d.modelIdNum);if(cpu)actions.addDoor(cpu,multiply(origin,d.matrix),{ns:bi,positionKey:d.position,action:d.action,startingLockValue:d.startingLockValue});}
  }
  actions.resolvePosition=(ns,key)=>positions.get(`${ns}:${key}`)??null;
  const transitions=[];for(const o of actions.objects.values())if(o.actionFlag===ACTION_FLAGS.Teleport){const a=actions.resolvePosition(o.ns,o.positionKey),b=actions.resolvePosition(o.ns,o.nextKey),c=a&&b?teleporterConnection(a,b):null;if(c)transitions.push(c.conn);}
  const enemies=collectDungeonEnemies(dungeon.blocks.map(b=>({markers:b.layout.markers,waterLevel:b.layout.waterLevel,originX:b.originX,originZ:b.originZ})),{locationId:loc.dungeon.recordElement.header.locationId,dungeonType:loc.mapTableData.dungeonType,playerLevel:1});
  const s=dungeon.startMarker,from=floorLanding(col,[s.x,s.y+1.08,s.z]),anchors=enemies.map(e=>floorLanding(col,[e.x,e.y+.2,e.z]));
  const geometry=M.navigationGeometry(col),skip=[...M.passable(actions)];
  const bake=()=>bakeNavFromCollider(geometry,{anchor:from,anchors,exclude:new Set(skip),agent:M.agent}).chf;
  return{col,geometry,actions,dungeon,from,anchors,transitions,native,bake};
}
module.exports={nativeModules,quad,wall,room,realDungeon};
