(function (root) {
  'use strict';
  const point = p => p && p.length >= 3 && [p[0],p[1],p[2]].every(Number.isFinite) ? [p[0],p[1],p[2]] : null;
  const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  const length = pts => pts.slice(1).reduce((n,p,i)=>n+distance(pts[i],p),0);
  // The AI's 35-degree slope / 40 cm voxel step is not the player's 70-degree / 50 cm step.
  // Erosion supplies candidates only; the live body-width probes below decide what is passable.
  const agent = Object.freeze({radius:0,height:1.7,maxStep:.6,maxSlope:Math.tan(70*Math.PI/180),cs:.25,ch:.1});
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
      bake.set(key,ignored?{...b,tris:b.tris.filter((_,i)=>!mask[i])}:b);
    }
    const view={_buckets:bake,raycastHit:(...args)=>query.raycastHit(...args)};
    geometryViews.set(col,{entries,sizes:entries.map(([,b])=>b.tris.length),view});return view;
  }
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
    if(len<.001)return null;
    const dir=[dx/len,dy/len,dz/len],h=Math.hypot(dx,dz)||1,side=[-dz/h*.32,dx/h*.32];
    for(const off of wide?[-1,0,1]:[0])for(const y of [.53,1.35]){
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
    return Number.isFinite(hit?.dist)&&(!hit.normal||hit.normal[1]>=.34)?floor(col,[at[0],at[1]+.15-hit.dist,at[2]],skip):null;
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
  function centre(col,p,skip) {
    const original=p;let at=p.slice();
    for(let pass=0;pass<3;pass++){
      let moved=false;
      for(let i=0;i<8;i++)for(const y of [1,1.5]){
        const dir=[Math.cos(i*Math.PI/4),0,Math.sin(i*Math.PI/4)],h=ray(col,[at[0],at[1]+y,at[2]],dir,.36,skip),normal=h?.normal;
        if(!Number.isFinite(h?.dist)||h.dist>=.34||!normal)continue;
        const len=Math.hypot(normal[0],normal[2]);if(len<.8)continue;
        at[0]+=normal[0]/len*(.35-h.dist);at[2]+=normal[2]/len*(.35-h.dist);moved=true;
      }
      if(distance(original,at)>.65||clearance(col,original,at,skip,false))return null;
      at=floor(col,at,skip);if(!at)return null;if(!moved)break;
    }
    return at;
  }
  async function drape(points,col,skip=[],checkpoint=async()=>{},centred=false) {
    if(!points?.length)return null;
    const first=floor(col,points[0],skip);if(!first)return null;
    const out=[first];let steps=0;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],n=Math.max(1,Math.ceil(distance(a,b)/.14));
      for(let j=1;j<=n;j++){
        const t=j/n,hint=a.map((v,k)=>v+(b[k]-v)*t),landed=floor(col,hint,skip),p=landed&&(centred?centre(col,landed,skip):landed),prev=out[out.length-1];
        if(!p||Math.abs(p[1]-prev[1])>.52||clearance(col,prev,p,skip))return null;
        if(distance(prev,p)>.015)out.push(p);
        if(++steps%(centred?4:48)===0)await checkpoint();
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
      if(!pts)pts=await drape(r.points,col,skip,checkpoint,true);
      if(!pts)pts=await drape(corridorPoints(mesh,native,r.polys,r.from,r.to),col,skip,checkpoint,true);
      if(pts)return{points:pts,distance:length(pts),target};
      if(++tries>=4)break;await checkpoint();
    }
    return null;
  }
  function transitionLinks(col,skip,transitions) {
    const seen=new Set(),out=[];
    for(const t of transitions){const from=transitionPoint(col,t?.entrance?.pos,skip),to=transitionPoint(col,t?.exit?.pos,skip);if(!from||!to)continue;
      const key=[...from,...to].map(x=>Math.round(x*20)).join(',');if(seen.has(key))continue;seen.add(key);out.push({i:out.length,from,to});}
    return out;
  }
  // Collider A*: this layer does not depend on the automap's reveal state, polygon contours or AI erosion.
  // Nodes retain Y, so stacked floors never become neighbours just because X/Z match.
  async function surfaceRoute(from,target,col,skip,transitions,checkpoint,search=null) {
    const support=search?.support||(p=>floor(col,p,skip)),cs=.5,start=support(from);if(!start)return null;
    const links=transitionLinks(col,skip,transitions),nodes=search?.own||new Map(),closed=new Set(),heap=[];
    const key=p=>Math.round(p[0]/(cs/4))+','+Math.round(p[2]/(cs/4))+','+Math.round(p[1]*20);
    const push=n=>{heap.push(n);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p].f<=n.f)break;heap[i]=heap[p];i=p;}heap[i]=n;};
    const pop=()=>{const n=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].f<heap[c].f)c++;if(heap[c].f>=last.f)break;heap[i]=heap[c];i=c;}heap[i]=last;}return n;};
    // The lower bound includes chains of portals; plain Euclidean distance would wrongly prune a detour to one.
    const tail=links.map(l=>distance(l.to,target.at));
    for(let pass=0;pass<links.length;pass++){let changed=false;for(let i=0;i<links.length;i++)for(let j=0;j<links.length;j++){const d=distance(links[i].to,links[j].from)+.1+tail[j];if(d<tail[i]){tail[i]=d;changed=true;}}if(!changed)break;if(pass%4===0)await checkpoint();}
    const heuristic=p=>Math.min(distance(p,target.at),...links.map((l,i)=>distance(p,l.from)+.1+tail[i]));
    const add=(p,g,parent,jump=null,via=[])=>{const id=key(p),prev=nodes.get(id);if(closed.has(id)||prev&&prev.g<=g+1e-6)return;const n={p,g,f:g+heuristic(p),parent,jump,via,id};nodes.set(id,n);push(n);};
    const trace=chain=>chain.flatMap((n,i)=>i?[...(n.via||[]),n.p]:[n.p]);
    const sample=(x,z,y)=>support([x*cs,y,z*cs]);
    add(start,0,null);let visited=0;
    while(heap.length&&visited<90000){
      const cur=pop();if(nodes.get(cur.id)!==cur||closed.has(cur.id))continue;closed.add(cur.id);
      if(++visited%24===0)await checkpoint();
      const meeting=search?.other?.get(cur.id);
      if(meeting&&distance(cur.p,meeting.p)<.12&&!clearance(col,cur.p,meeting.p,skip)){
        const a=[],b=[];for(let n=cur;n;n=n.parent)a.push(n);for(let n=meeting;n;n=n.parent)b.push(n);
        const here=trace(a.reverse()),there=trace(b.reverse()),points=search.reverse?[...there,...here.reverse()]:[...here,...there.reverse()];
        return{points,distance:length(points),target};
      }
      const p=cur.p,dx=target.at[0]-p[0],dz=target.at[2]-p[2];
      if(Math.hypot(dx,dz)<=1.15&&Math.abs(p[1]-target.at[1])<.65&&!clearance(col,p,target.at,skip,false)){
        const end=floor(col,target.at,skip),last=end&&Math.abs(end[1]-p[1])<=.52?await drape([p,end],col,skip,checkpoint):null;
        if(Math.hypot(dx,dz)<=.05||last){
          const chain=[];for(let n=cur;n;n=n.parent)chain.push(n);chain.reverse();const jump=chain.findIndex(n=>n.jump);
          const points=trace(chain.slice(0,jump<0?chain.length:jump));if(jump<0&&last)points.push(...last.slice(1));
          if(points.length===1)points.push(points[0].slice());
          if(search?.reverse)points.reverse();
          return{points,distance:cur.g+(last?length(last):0),target,...(jump>=0?{transition:chain[jump].jump}:{})};
        }
      }
      for(const l of links)if(distance(p,l.from)<.8&&!clearance(col,p,l.from,skip,false)){
        const leg=await drape([p,l.from],col,skip,checkpoint);if(leg)add(l.to,cur.g+length(leg)+.1,{...cur,p:l.from,g:cur.g+length(leg),parent:cur,via:leg.slice(1,-1)},l);
      }
      const ix=Math.round(p[0]/cs),iz=Math.round(p[2]/cs);
      const edge=q=>{
        if(!q||Math.abs(q[1]-p[1])>.505||clearance(col,p,q,skip))return false;
        let prev=p;const count=Math.max(2,Math.ceil(distance(p,q)/.16)),via=[];
        for(let i=1;i<count;i++){const mid=support(p.map((v,k)=>v+(q[k]-v)*i/count));if(!mid||Math.abs(mid[1]-prev[1])>.505)return false;prev=mid;via.push(mid);}
        if(Math.abs(q[1]-prev[1])>.505)return false;
        add(q,cur.g+length([p,...via,q]),cur,null,via);return true;
      };
      for(const [sx,sz]of [[1,0],[0,1],[-1,0],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
        // Flat rooms use 50 cm spacing. On a blocked edge refine to 25 / 12.5 cm so two narrow
        // classic treads are not mistaken for one wall. Accepted long edges sample all intermediate floors.
        if(!edge(sample(ix+sx,iz+sz,p[1]))&&!edge(sample(p[0]/cs+sx/2,p[2]/cs+sz/2,p[1])))edge(sample(p[0]/cs+sx/4,p[2]/cs+sz/4,p[1]));
      }
    }
    return null;
  }
  async function walkRoute(from,target,col,skip=[],transitions=[],checkpoint=async()=>{}) {
    // Meeting in the middle avoids scanning every side room when the goal is on a nearby, different floor.
    // Portals stay directed, so those queries use the single forward graph with portal-aware lower bounds.
    const maps=[new Map(),new Map()],finished={},cancelled={},terrain=new Map();let done=false;
    const support=p=>{const key=p[0].toFixed(5)+','+p[2].toFixed(5)+','+Math.round(p[1]*10);if(!terrain.has(key))terrain.set(key,floor(col,p,skip));return terrain.get(key);};
    if(transitions.length||!floor(col,target.at,skip))return surfaceRoute(from,target,col,skip,transitions,checkpoint,{support});
    const pause=async()=>{if(done)throw cancelled;await checkpoint();if(done)throw cancelled;};
    const run=async(reverse)=>{try{const result=await surfaceRoute(reverse?target.at:from,reverse?{...target,at:from}:target,col,skip,[],pause,{own:maps[+reverse],other:maps[+!reverse],reverse,support});if(result){done=true;finished.result={...result,target};}}catch(e){if(e!==cancelled)throw e;}};
    await Promise.all([run(false),run(true)]);return finished.result||null;
  }
  async function planConnected(mesh,native,from,target,col,skip=[],transitions=[],checkpoint=async()=>{},fallback=true) {
    const direct=await plan(mesh,native,from,target,col,skip,checkpoint);
    const links=transitionLinks(col,skip,transitions),queue=[{at:from,cost:0,first:null}],best=new Map();let queries=0,result=direct;
    while(queue.length){
      queue.sort((a,b)=>a.cost-b.cost);const cur=queue.shift();
      if(result&&cur.cost>=result.distance)continue;
      const end=cur.first&&(!result||cur.cost+distance(cur.at,target.at)<result.distance)?await plan(mesh,native,cur.at,target,col,skip,checkpoint):null;
      if(end&&(!result||cur.cost+end.distance<result.distance)){const leg=await plan(mesh,native,from,{...target,at:cur.first.from,transitionGoal:true},col,skip,checkpoint);if(leg)result={...leg,target,transition:cur.first,distance:cur.cost+end.distance};}
      for(const link of links){
        if(++queries%4===0)await checkpoint();
        const route=await plan(mesh,native,cur.at,{...target,at:link.from,transitionGoal:true},col,skip,checkpoint);if(!route)continue;
        const cost=cur.cost+route.distance+.1;if((best.get(link.i)??Infinity)<=cost)continue;
        best.set(link.i,cost);queue.push({at:link.to,cost,first:cur.first||link});
      }
    }
    if(result||!fallback)return result;
    return await walkRoute(from,target,col,skip,transitions,checkpoint);
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
    const out=[points[0]],skip=[...passable(actions)];let walked=0;
    const bodyLift=index=>{
      const p=points[index];let lift=0;
      // A capsule's feet stand above the centre floor on a steep stair, before the next tread
      // reaches its centre. The floor ribbon stays down; its body-clearance envelope must not.
      for(let j=Math.max(0,index-4);j<=Math.min(points.length-1,index+4);j++){
        const q=points[j],run=Math.hypot(q[0]-p[0],q[2]-p[2]),rise=Math.abs(q[1]-p[1]);
        if(run>.015&&run<.45&&rise>.03&&rise<=.51)lift=Math.max(lift,Math.min(.45,.35*(Math.sqrt(1+(rise/run)**2)-1)));
      }
      return lift;
    };
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i];let hit=clearance(col,a,b,skip);
      if(hit){const lift=Math.max(bodyLift(i-1),bodyLift(i));if(lift>.01)hit=clearance(col,[a[0],a[1]+lift,a[2]],[b[0],b[1]+lift,b[2]],skip);}
      if(hit){const o=actions?.objects?.get(hit.key);return{points:out,blocked:native.isDoor?.(o)?'door':'geometry'};}
      const p=floor(col,b,skip);if(!p||Math.abs(p[1]-b[1])>.35)return{points:out,blocked:'geometry'};
      out.push(b);walked+=distance(a,b);if(walked>=limit)break;
    }
    return{points:out,blocked:null};
  }
  const api={point,distance,length,agent,notePlacement,passable,navigationGeometry,targets,exitPoint,ended,floor,clearance,grounded,transitionPoint,transitionLinks,components,corridorPoints,drape,plan,planConnected,walkRoute,trim,visible,nativeRoute};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.__dfoDungeonNavModel=api;
})(globalThis);
