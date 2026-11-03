(function (root) {
  'use strict';
  const point = p => p && p.length >= 3 && [p[0],p[1],p[2]].every(Number.isFinite) ? [p[0],p[1],p[2]] : null;
  const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  const length = pts => pts.slice(1).reduce((n,p,i)=>n+distance(pts[i],p),0);
  const regions = new WeakMap();
  function components(chf) {
    if(regions.has(chf))return regions.get(chf);
    const ps=chf.mesh.polys,ids=new Int32Array(ps.length).fill(-1);let next=0;
    for(let i=0;i<ps.length;i++)if(ids[i]<0){const stack=[i];ids[i]=next;while(stack.length){const p=stack.pop();for(const n of ps[p].neis)if(n>=0&&ids[n]<0){ids[n]=next;stack.push(n);}}next++;}
    regions.set(chf,ids);return ids;
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
    const hit=ray(col,[p[0],p[1]+.55,p[2]],[0,-1,0],1.2,skip);
    if(!Number.isFinite(hit?.dist)||(hit.normal&&hit.normal[1]<.5))return null;
    const at=[p[0],p[1]+.55-hit.dist,p[2]],head=ray(col,[at[0],at[1]+.08,at[2]],[0,1,0],1.62,skip);
    return Number.isFinite(head?.dist)&&head.dist<1.6?null:at;
  }
  function clearance(col,a,b,skip=[],wide=true) {
    const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],len=Math.hypot(dx,dy,dz);
    if(len<.001)return null;
    const dir=[dx/len,dy/len,dz/len],h=Math.hypot(dx,dz)||1,side=[-dz/h*.32,dx/h*.32];
    for(const off of wide?[-1,0,1]:[0])for(const y of [.5,1.35]){
      const hit=ray(col,[a[0]+off*side[0],a[1]+y,a[2]+off*side[1]],dir,len+.015,skip);
      if(Number.isFinite(hit?.dist)&&hit.dist<len-.005)return{key:hit.key,dist:hit.dist};
    }
    return null;
  }
  function grounded(mesh,native,p,col,skip=[]) {
    const pi=native.locate(mesh,p[0],p[2],p[1]);if(pi<0)return null;
    const y=native.height(mesh,pi,p[0],p[2]);if(!Number.isFinite(y)||Math.abs(y-p[1])>1)return null;
    const at=floor(col,[p[0],y,p[2]],skip);return at&&Math.abs(at[1]-y)<.6?at:null;
  }
  function transitionPoint(col,p,skip=[]) {
    const at=point(p);if(!at)return null;
    // The automap's teleporter pins are raised above the action's transform; drops already use feet.
    const hit=ray(col,[at[0],at[1]+.15,at[2]],[0,-1,0],2.7,skip);
    return Number.isFinite(hit?.dist)&&(!hit.normal||hit.normal[1]>=.5)?floor(col,[at[0],at[1]+.15-hit.dist,at[2]],skip):null;
  }
  // Keep every portal and floor in the native corridor if its 2D funnel cuts a stacked stair.
  function corridorPoints(mesh,native,polys,from,to) {
    const out=[from],world=(x,z,pi)=>[mesh.xmin+x*mesh.cs,native.height(mesh,pi,mesh.xmin+x*mesh.cs,mesh.zmin+z*mesh.cs),mesh.zmin+z*mesh.cs];
    for(let k=0;k<polys.length;k++){
      const pi=polys[k],p=mesh.mesh.polys[pi],vs=p.verts.map(i=>mesh.mesh.verts[i]);
      if(k){const prev=mesh.mesh.polys[polys[k-1]],edge=prev.neis.indexOf(pi);if(edge<0)return null;const a=mesh.mesh.verts[prev.verts[edge]],b=mesh.mesh.verts[prev.verts[(edge+1)%prev.verts.length]];out.push(world((a.x+b.x)/2,(a.z+b.z)/2,pi));}
      if(k>0&&k+1<polys.length)out.push(world(vs.reduce((n,v)=>n+v.x,0)/vs.length,vs.reduce((n,v)=>n+v.z,0)/vs.length,pi));
    }
    out.push(to);return out.every(point)?out:null;
  }
  async function drape(points,col,skip=[],checkpoint=async()=>{}) {
    if(!points?.length)return null;
    const first=floor(col,points[0],skip);if(!first)return null;
    const out=[first];let steps=0;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],n=Math.max(1,Math.ceil(distance(a,b)/.28));
      for(let j=1;j<=n;j++){
        const t=j/n,hint=a.map((v,k)=>v+(b[k]-v)*t),p=floor(col,hint,skip),prev=out[out.length-1];
        if(!p||Math.abs(p[1]-prev[1])>.52||clearance(col,prev,p,skip))return null;
        if(distance(prev,p)>.015)out.push(p);
        if(++steps%48===0)await checkpoint();
      }
    }
    return out.length>1?out:null;
  }
  function nativeRoute(mesh,native,from,to,col,skip) {
    const a=grounded(mesh,native,from,col,skip),b=grounded(mesh,native,to,col,skip);if(!a||!b)return null;
    const ids=components(mesh),ia=native.locate(mesh,a[0],a[2],a[1]),ib=native.locate(mesh,b[0],b[2],b[1]);if(ia<0||ib<0||ids[ia]!==ids[ib])return null;
    const result=native.solve(mesh,a,b);return result?.polys?.length&&result.points?.length?{...result,from:a,to:b}:null;
  }
  async function plan(mesh,native,from,target,col,skip=[],checkpoint=async()=>{}) {
    // A stand at a wall or a coffer need only be approached, not stood inside.
    const ends=[target.at];for(const radius of [.7,1.1])for(let n=0;n<8;n++)ends.push([target.at[0]+Math.cos(n*Math.PI/4)*radius,target.at[1],target.at[2]+Math.sin(n*Math.PI/4)*radius]);
    let tries=0,queries=0;
    for(const end of ends){
      if(++queries%4===0)await checkpoint();
      if(distance(end,target.at)>.05){const hit=clearance(col,end,target.at,skip,false);if(hit&&(!target.transitionGoal||hit.dist<distance(end,target.at)-.2))continue;}
      const r=nativeRoute(mesh,native,from,end,col,skip);if(!r)continue;
      let pts=await drape(r.points,col,skip,checkpoint);
      if(!pts)pts=await drape(corridorPoints(mesh,native,r.polys,r.from,r.to),col,skip,checkpoint);
      if(pts)return{points:pts,distance:length(pts),target};
      if(++tries>=4)break;await checkpoint();
    }
    return null;
  }
  async function planConnected(mesh,native,from,target,col,skip=[],transitions=[],checkpoint=async()=>{}) {
    const direct=await plan(mesh,native,from,target,col,skip,checkpoint);if(direct)return direct;
    const links=transitions.map((t,i)=>({i,from:transitionPoint(col,t?.entrance?.pos,skip),to:transitionPoint(col,t?.exit?.pos,skip)})).filter(t=>t.from&&t.to).slice(0,64);
    const queue=[{at:from,cost:0,first:null}],best=new Map();let queries=0;
    while(queue.length){
      queue.sort((a,b)=>a.cost-b.cost);const cur=queue.shift();
      const end=nativeRoute(mesh,native,cur.at,target.at,col,skip);
      if(end&&cur.first){const leg=await plan(mesh,native,from,{...target,at:cur.first.from,transitionGoal:true},col,skip,checkpoint);if(leg)return{...leg,target,transition:cur.first,distance:cur.cost+length(end.points)};}
      for(const link of links){
        if(++queries%4===0)await checkpoint();
        const route=nativeRoute(mesh,native,cur.at,link.from,col,skip);if(!route)continue;
        const cost=cur.cost+length(route.points)+.1;if((best.get(link.i)??Infinity)<=cost)continue;
        best.set(link.i,cost);queue.push({at:link.to,cost,first:cur.first||link});
      }
    }
    return null;
  }
  function trim(points,feet) {
    if(!points?.length)return{points:[],distance:Infinity,off:Infinity};
    let index=0,best=Infinity,at=points[0];
    for(let i=0;i+1<points.length;i++){
      const a=points[i],b=points[i+1],v=b.map((x,k)=>x-a[k]),len=v.reduce((n,x)=>n+x*x,0),t=Math.max(0,Math.min(1,len?feet.reduce((n,x,k)=>n+(x-a[k])*v[k],0)/len:0)),p=a.map((x,k)=>x+v[k]*t),d=distance(feet,p);
      if(d<best){best=d;index=i;at=p;}
    }
    const pts=[at,...points.slice(index+1)];return{points:pts,distance:length(pts),off:best};
  }
  function visible(points,col,actions,native,limit=45) {
    if(!points?.length)return{points:[],blocked:null};
    const out=[points[0]];let walked=0;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],hit=clearance(col,a,b);
      if(hit){const o=actions?.objects?.get(hit.key);return{points:out,blocked:native.isDoor?.(o)?'door':'geometry'};}
      const p=floor(col,b);if(!p||Math.abs(p[1]-b[1])>.35)return{points:out,blocked:'geometry'};
      out.push(b);walked+=distance(a,b);if(walked>=limit)break;
    }
    return{points:out,blocked:null};
  }
  const api={point,distance,length,targets,exitPoint,ended,floor,clearance,grounded,transitionPoint,components,corridorPoints,drape,plan,planConnected,trim,visible,nativeRoute};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.__dfoDungeonNavModel=api;
})(globalThis);
