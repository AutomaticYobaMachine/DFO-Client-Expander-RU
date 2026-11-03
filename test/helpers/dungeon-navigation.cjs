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
async function room({pillar=false,door=false,stacked=false,ramp=false}={}){
  const {Collider,bakeNavFromCollider,native}=await nativeModules(),col=new Collider(()=>-Infinity),shift=[0,0,0],actions={objects:new Map()};
  quad(col,'floor',[[0,0,0],[14,0,0],[14,0,12],[0,0,12]]);
  wall(col,'edge-left',0,0,12);wall(col,'edge-right',14,0,12);
  quad(col,'edge-front',[[0,0,0],[14,0,0],[14,3,0],[0,3,0]]);quad(col,'edge-back',[[0,0,12],[14,0,12],[14,3,12],[0,3,12]]);
  if(pillar){wall(col,'pillar-a',6,3,9);wall(col,'pillar-b',7,3,9);quad(col,'pillar-c',[[6,0,3],[7,0,3],[7,3,3],[6,3,3]]);quad(col,'pillar-d',[[6,0,9],[7,0,9],[7,3,9],[6,3,9]]);}
  if(door){wall(col,'partition-a',7,0,5.3);wall(col,'partition-b',7,6.7,12);wall(col,'door:1',7,5.3,6.7,0,2.5,()=>shift);actions.objects.set('door:1',{kind:'door',key:'door:1',currentLockValue:0});}
  if(stacked)quad(col,'upper-floor',[[0,3,0],[10,3,0],[10,3,12],[0,3,12]]);
  if(ramp){quad(col,'upper-floor',[[0,3,0],[7,3,0],[7,3,12],[0,3,12]]);quad(col,'ramp',[[7,3,0],[13,0,0],[13,0,3],[7,3,3]]);}
  const from=[2,0,6],anchors=[[12,0,6],...(stacked?[[2,3,6]]:[]),...(ramp?[[2,3,6],[10,1.5,1.5]]:[])];
  const bake=()=>bakeNavFromCollider(col,{anchor:from,anchors,exclude:native.openDoors(actions)}).chf;
  return{col,actions,shift,from,native,bake,mesh:bake()};
}
module.exports={nativeModules,quad,wall,room};
