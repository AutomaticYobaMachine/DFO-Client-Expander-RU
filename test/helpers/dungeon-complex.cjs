'use strict';
const {playerModules,quad,wall}=require('./dungeon-navigation.cjs');
const SIDE=51.2;
// Three independently placed block instances, overlapping floors, two different ascents,
// narrow inter-block thresholds, an obstacle and a rotated model in the last block.
async function multiblock({sealed=false}={}){
  const {Collider}=await playerModules(),col=new Collider(()=>-Infinity),actions={objects:new Map()},levels=[0,3.6,7.2],blocks=[];
  const floor=(key,x0,x1,y,z0=0,z1=12)=>quad(col,key,[[x0,y,z0],[x1,y,z0],[x1,y,z1],[x0,y,z1]]);
  const partition=(key,x,y,z0,z1,h=3)=>wall(col,key,x,z0,z1,y,h);
  for(let i=0;i<3;i++){
    const x=i*SIDE,lo=x+(i?.02:0),hi=x+SIDE-(i<2?.02:0);blocks.push({name:'lab:'+i,index:i,originX:x,originZ:0});
    floor(`block:${i}:ground`,lo,hi,0);
    quad(col,`block:${i}:front`,[[lo,0,0],[hi,0,0],[hi,14,0],[lo,14,0]]);
    quad(col,`block:${i}:back`,[[lo,0,12],[hi,0,12],[hi,14,12],[lo,14,12]]);
    if(i)floor(`block:${i}:middle`,lo,hi,3.6);
  }
  partition('start-wall',0,0,0,12,14);partition('end-wall',SIDE*3,0,0,12,14);
  floor('block:0:upper',12,SIDE-.02,3.6);
  if(!sealed)for(let i=0;i<8;i++){
    const x=8+i*.5,y=(i+1)*.45;floor('block:0:stair-treads',x,x+.5,y,4,8);partition('block:0:stair-risers',x,i*.45,4,8,.45);
  }
  const bx=SIDE;
  floor('block:1:upper',bx+26,SIDE*2-.02,7.2);
  if(!sealed)quad(col,'block:1:ramp',[[bx+18,3.6,4],[bx+26,7.2,4],[bx+26,7.2,8],[bx+18,3.6,8]]);
  partition('block:1:pillar-left',bx+8,3.6,4,8,3.6);partition('block:1:pillar-right',bx+10,3.6,4,8,3.6);
  quad(col,'block:1:pillar-front',[[bx+8,3.6,4],[bx+10,3.6,4],[bx+10,7.2,4],[bx+8,7.2,4]]);
  quad(col,'block:1:pillar-back',[[bx+8,3.6,8],[bx+10,3.6,8],[bx+10,7.2,8],[bx+8,7.2,8]]);
  // This model's natural long axis is Z; the instance's 90-degree turn lays it along X.
  const m=[0,0,-1,0,0,1,0,0,1,0,0,0,SIDE*2+.02,7.2,12,1];
  col.addMesh('block:2:rotated-upper',new Float32Array([0,0,0,12,0,0,12,0,SIDE-.02,0,0,SIDE-.02]),new Uint16Array([0,1,2,0,2,3]),m);
  for(let i=1;i<=2;i++){
    const x=i*SIDE,y=i===1?3.6:7.2;
    partition(`boundary:${i}:left`,x,y,0,4.3,3);partition(`boundary:${i}:right`,x,y,7.7,12,3);
    const key=`act:${i}:42`;partition(key,x,y,4.3,7.7,2.5);actions.objects.set(key,{key,ns:i,positionKey:42,loadID:42,kind:'door',currentLockValue:0});
  }
  return {col,actions,blocks,levels,from:[2,0,6],goal:[SIDE*3-2,7.2,6],side:SIDE};
}
function crossedBlocks(points,blocks){
  const sampled=[];
  for(let i=0;i<points.length;i++){
    const a=points[Math.max(0,i-1)],b=points[i],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[2]-a[2])/2));
    for(let j=1;j<=n;j++)sampled.push(a.map((x,k)=>x+(b[k]-x)*j/n));
  }
  return [...new Set(sampled.map(p=>blocks.find(b=>p[0]>=b.originX-.001&&p[0]<b.originX+SIDE-.001&&p[2]>=b.originZ-.001&&p[2]<b.originZ+SIDE-.001)?.index).filter(i=>i!=null))];
}
async function replayWalk(fixture,points){
  const {PlayerMotor}=await playerModules(),motor=new PlayerMotor(fixture.col,{speed:50,running:30},{});
  for(const o of fixture.actions.objects.values())if(o.kind==='door')fixture.col.removeBucket(o.key);
  motor.spawn(...[points[0][0],points[0][1]+.02,points[0][2]]);let cursor=1,minY=Infinity,maxY=-Infinity;const visited=[];
  for(let frame=0;frame<18000;frame++){
    const p=points[cursor];if(!p)return{motor,minY,maxY,visited,frames:frame};
    const dx=p[0]-motor.pos[0],dz=p[2]-motor.pos[2],run=Math.hypot(dx,dz);
    if(run<.15&&Math.abs(p[1]-motor.pos[1])<.6){cursor++;continue;}
    motor.update(1/60,{forward:1,strafe:0,run:false,jump:false,crouch:false},Math.atan2(dx,dz));
    minY=Math.min(minY,motor.pos[1]);maxY=Math.max(maxY,motor.pos[1]);visited.push([...motor.pos]);
    if(frame%600===0)await new Promise(setImmediate);
  }
  throw Error('Original player motor did not reach waypoint '+cursor+'/'+points.length+' at '+JSON.stringify([...motor.pos])+' expected '+JSON.stringify(points[cursor]));
}
async function deepShaftCluster(){
  const {Collider}=await playerModules(),col=new Collider(()=>-Infinity),actions={objects:new Map()};
  const levels=[0,18,45,12,96,35,120,58,144,76,176],side=3.2,width=3;
  for(let i=0;i<levels.length;i++){
    const x=i*side,y=levels[i];
    quad(col,`landing:${i}`,[[x,y,0],[x+side,y,0],[x+side,y,width],[x,y,width]]);
    if(i){const low=Math.min(levels[i-1],y),high=Math.max(levels[i-1],y);wall(col,`shaft:${i}`,x,0,width,low,high-low);}
    const low=Math.min(y,levels[i-1]??y,levels[i+1]??y)-2,high=Math.max(y,levels[i-1]??y,levels[i+1]??y)+3;
    for(const z of [0,width])quad(col,`sides:${i}:${z}`,[[x,low,z],[x+side,low,z],[x+side,high,z],[x,high,z]]);
  }
  return{col,actions,levels,from:[1,0,1.5],goal:[side*levels.length-1,levels.at(-1),1.5]};
}
module.exports={SIDE,multiblock,crossedBlocks,replayWalk,deepShaftCluster};
