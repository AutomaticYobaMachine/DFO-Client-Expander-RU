(function (root) {
  'use strict';
  const point = p => p && p.length >= 3 && [p[0],p[1],p[2]].every(Number.isFinite) ? [p[0],p[1],p[2]] : null;
  const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  const length = pts => pts.slice(1).reduce((n,p,i)=>n+distance(pts[i],p),0);
  const controls = new Set([61027,61028,74037]), placements = new WeakMap(), geometryViews = new WeakMap();
  function notePlacement(col,key,model) {
    if(!controls.has(Number(model?.modelIdNum)))return;
    let parts=placements.get(col);if(!parts)placements.set(col,parts=new Map());
    let ignored=parts.get(key);if(!ignored)parts.set(key,ignored=new Set());
    ignored.add(col._buckets.get(key)?.parts??0);
  }
  function passable(actions) {
    const keys=new Set();
    for(const o of actions?.objects?.values?.()||[]){
      // Keep lift/bridge decks as support. A door (including a secret or locked one) is an actionable passage.
      const box=o.aabb,deck=box?.min&&box?.max&&box.max[1]-box.min[1]<.65;
      if(o.kind==='door'||controls.has(Number(o.modelIdNum))||(o.kind==='action'&&!deck))keys.add(o.key);
    }
    return keys;
  }
  function navigationGeometry(col) {
    const parts=placements.get(col);if(!parts?.size)return col;
    const entries=[...col._buckets],old=geometryViews.get(col);
    if(old&&entries.length===old.entries.length&&entries.every(([k,b],i)=>k===old.entries[i][0]&&b===old.entries[i][1]&&b.tris.length===old.sizes[i]))return old.view;
    // A separate query index shares immutable triangles, never the game's mutable bucket bookkeeping.
    const query=new col.constructor(()=>-Infinity),bake=new Map();
    for(const [key,b]of entries){
      const ignored=parts.get(key),mask=ignored?Uint8Array.from(b.tris,(_,i)=>b.sight?.[i]||ignored.has(b.part[i])?1:0):b.sight;
      query._buckets.set(key,{...b,rayMark:null,sight:mask});
      bake.set(key,ignored?{...b,tris:b.tris.filter((_,i)=>!mask[i]),part:b.part?.filter((_,i)=>!mask[i]),sight:null}:b);
    }
    const view={source:col,_buckets:bake,raycastHit:(...args)=>query.raycastHit(...args)};
    geometryViews.set(col,{entries,sizes:entries.map(([,b])=>b.tris.length),view});return view;
  }
  const ended = b => { const q=b?.targetQuest??b?.targetResource?.parentQuest;return !!(q?.questComplete||q?.questTombstoned||q?.shelvedAt!=null); };
  const liveFoe = f => !!f?.entity&&!f.dead&&!f.corpse&&!f._gone&&!f._absentHere&&!f._pupMismatch&&!f.removed;
  const enemyName = (f,tools) => String(f.entity?.revenant?.name||f.entity?.champion?.name||f.entity?.properName||tools.enemyName?.(f.mobileType??f.src?.mobileType)||'Элитный противник');
  function exitPoint(d) {
    const m=d?.matrix,c=d?.centre,n=d?.normal;
    if(!m||!c||!n)return point(d?.pos);
    const at=[m[0]*c.x+m[4]*c.y+m[8]*c.z+m[12],m[1]*c.x+m[5]*c.y+m[9]*c.z+m[13],m[2]*c.x+m[6]*c.y+m[10]*c.z+m[14]];
    const normal=[m[0]*n.x+m[4]*n.y+m[8]*n.z,m[1]*n.x+m[5]*n.y+m[9]*n.z,m[2]*n.x+m[6]*n.y+m[10]*n.z],len=Math.hypot(...normal)||1;
    at[0]+=normal[0]/len*.9;at[2]+=normal[2]/len*.9;at[1]-=(d.size?.y??2)/2;
    return point(at);
  }
  function targets(live, sources={}, tools={}, questIds=null) {
    const out={exit:[],aurum:[],elite:[],quest:[]},ctx=live.ctx;
    for(const [i,d]of(ctx.exitDoors||[]).entries()){const at=exitPoint(d);if(at)out.exit.push({key:'exit:'+i,kind:'exit',name:'Выход из данжа',at});}
    const coffer=live.aurum,foot=point(coffer?.foot);
    if(coffer&&!coffer.open&&foot)out.aurum.push({key:'aurum:'+coffer.id,kind:'aurum',name:'Сундук с аурумом',at:foot});
    const put=(b,at,key,name)=>{
      const res=b?.targetResource,uid=b?.questUID??b?.targetQuest?.uid??res?.parentQuest?.uid;
      if(!at||uid==null||res?.isHidden===true||res?.isDestroyed===true||ended(b)||(questIds&&!questIds.has(String(uid))))return;
      out.quest.push({key,kind:'quest',uid:String(uid),name:String(name||res?.displayName||'Цель задания'),at});
    };
    for(const[i,f]of(live.foes||[]).entries()){
      if(!liveFoe(f))continue;
      const at=point(f.ai?.feet);if(!at)continue;
      if(f.entity.eliteFoe===true&&!f.src?.allied&&f.companion==null&&f.entity.team!=='PlayerAlly'&&f.entity.mobileTeam!=='PlayerAlly')out.elite.push({key:'elite:'+i,kind:'elite',name:enemyName(f,tools),at});
      const b=ctx.questFoeBehaviour?.(f)??f.questBehaviour;
      put(b,at,'quest:foe:'+i,b?.targetResource?.displayName||tools.enemyName?.(f.mobileType));
    }
    for(const[i,s]of(sources.stands||[]).entries()){
      if(!s?.active||s.dead)continue;
      const box=sources.boxOf?.(s);if(!box?.min||!box.max)continue;
      put(s.behaviour,point([(box.min[0]+box.max[0])/2,box.min[1],(box.min[2]+box.max[2])/2]),'quest:stand:'+i);
    }
    for(const[i,p]of(ctx.people||[]).entries())if(p.active!==false)put(p.questBehaviour,point([p.x,p.y,p.z]),'quest:person:'+i);
    return out;
  }
  const ray = (col,origin,dir,max,skip=[]) => col.raycastHit(origin,dir,max,{skip,bodies:true});
  function floor(col,p,skip=[]) {
    if(!point(p)||!col?.raycastHit)return null;
    const probe=(x,z)=>{const h=ray(col,[x,p[1]+.62,z],[0,-1,0],1.3,skip);return Number.isFinite(h?.dist)&&(!h.normal||h.normal[1]>=.34)?p[1]+.62-h.dist:null;};
    let y=probe(p[0],p[2]);
    if(y==null){
      // Classic room seams have centimetre-wide cracks, often exactly on a grid row. The player's
      // 70 cm capsule bridges them. Require support on BOTH sides; never fill an abyss or join floors.
      for(const [dx,dz]of [[.1,0],[0,.1]]){const a=probe(p[0]-dx,p[2]-dz),b=probe(p[0]+dx,p[2]+dz);if(a!=null&&b!=null&&Math.abs(a-b)<=.5){y=(a+b)/2;break;}}
      if(y==null)return null;
    }
    const at=[p[0],y,p[2]],head=ray(col,[at[0],at[1]+.08,at[2]],[0,1,0],1.62,skip);
    return Number.isFinite(head?.dist)&&head.dist<1.6?null:at;
  }
  function clearance(col,a,b,skip=[],wide=true) {
    const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],len=Math.hypot(dx,dy,dz);
    if(len<1e-6)return null;
    const dir=[dx/len,dy/len,dz/len],h=Math.hypot(dx,dz)||1,side=[-dz/h*.32,dx/h*.32];
    const skin=.002;
    for(const off of wide?[-1,0,1]:[0])for(const y of [.53,.9,1.35,1.6]){
      // Include BOTH ends: a grid node exactly on a wall cannot enter at one edge's end and
      // leave through a zero-distance hit ignored by the next ray's triangle epsilon.
      const hit=ray(col,[a[0]+off*side[0]-dir[0]*skin,a[1]+y-dir[1]*skin,a[2]+off*side[1]-dir[2]*skin],dir,len+2*skin,skip);
      if(Number.isFinite(hit?.dist)&&hit.dist<=len+skin+.0002)return{key:hit.key,dist:Math.max(0,hit.dist-skin)};
    }
    return null;
  }
  function trim(points,feet,accept=()=>true) {
    if(!points?.length)return{points:[],distance:Infinity,off:Infinity};
    if(points.length===1)return{points:[points[0]],distance:0,off:distance(feet,points[0]),index:0};
    let index=0,best=Infinity,at=points[0];
    for(let i=0;i+1<points.length;i++){
      if(!accept(i))continue;
      const a=points[i],b=points[i+1],v=b.map((x,k)=>x-a[k]),len=v.reduce((n,x)=>n+x*x,0),t=Math.max(0,Math.min(1,len?feet.reduce((n,x,k)=>n+(x-a[k])*v[k],0)/len:0)),p=a.map((x,k)=>x+v[k]*t),d=distance(feet,p);
      if(d<best){best=d;index=i;at=p;}
    }
    const pts=[at,...points.slice(index+1)];return{points:pts,distance:length(pts),off:best,index};
  }
  function routingSkip(actions) {
    return [...new Set([...passable(actions),...[...(actions?.objects?.values?.()||[])].filter(o=>o.kind==='action').map(o=>o.key)])];
  }
  function follow(route,feet,col,actions,limit=45) {
    const support=ray(col,[feet[0],feet[1]+.15,feet[2]],[0,-1,0],.4),riding=actions?.objects?.get(support?.key)?.kind==='action';
    let cut=trim(route.points,feet);const skip=routingSkip(actions);if(cut.points.length<1)return null;
    if(riding){
      const vertical=trim(route.points,feet,i=>route.kinds?.[i+1]!=='walk'&&feet[1]>=Math.min(route.points[i][1],route.points[i+1][1])-.3&&feet[1]<=Math.max(route.points[i][1],route.points[i+1][1])+.3);
      if(vertical.off<20)cut=vertical;
    }
    if(cut.off>(riding?20:1.8))return null;
    const kind=route.kinds?.[cut.index+1]||'walk',connector=[];
    if(kind==='walk'||riding){
      const start=floor(col,feet);if(!start||distance(start,feet)>.7)return null;
      connector.push(start);const steps=Math.max(1,Math.ceil(distance(start,cut.points[0])/.14));let prev=start;
      for(let i=1;i<=steps;i++){
        const p=floor(col,start.map((x,k)=>x+(cut.points[0][k]-x)*i/steps));if(!p||Math.abs(p[1]-prev[1])>.505)return null;
        const run=Math.hypot(p[0]-prev[0],p[2]-prev[2]),rise=Math.abs(p[1]-prev[1]);
        const lift=run>.01&&rise>.03?Math.min(.45,.35*(Math.sqrt(1+(rise/run)**2)-1)):0;
        if(clearance(col,[prev[0],prev[1]+lift,prev[2]],[p[0],p[1]+lift,p[2]],skip))return null;
        connector.push(p);prev=p;
      }
    }else{
      if(clearance(col,feet,cut.points[0],skip))return null;
      connector.push(point(feet),cut.points[0]);
    }
    const all=[...connector.slice(0,-1),...cut.points],out=[all[0]];let visible=0;
    for(let i=1;i<all.length;i++){
      const a=all[i-1],b=all[i],d=distance(a,b);
      if(visible+d>limit){const t=(limit-visible)/d;out.push(a.map((x,k)=>x+(b[k]-x)*t));break;}
      out.push(b);visible+=d;
    }
    return {points:out,remaining:length(all),off:cut.off};
  }
  const api={point,distance,length,notePlacement,passable,routingSkip,navigationGeometry,targets,exitPoint,ended,floor,clearance,trim,follow};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.__dfoDungeonNavModel=api;
})(globalThis);
