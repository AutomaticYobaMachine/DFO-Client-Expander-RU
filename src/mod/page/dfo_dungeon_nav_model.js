(function (root) {
  'use strict';
  const G=typeof module==='object'&&module.exports?require('./dfo_dungeon_graph.js'):root.__dfoDungeonGraph;
  const BODY=G.BODY;
  const point = p => p && p.length >= 3 && [p[0],p[1],p[2]].every(Number.isFinite) ? [p[0],p[1],p[2]] : null;
  const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  const length = pts => pts.slice(1).reduce((n,p,i)=>n+distance(pts[i],p),0);
  const controls = new Set([61027,61028,74037]), placements = new WeakMap(), geometryViews = new WeakMap();
  // Map pins carry display offsets and no trigger information. A walk-on/into
  // portal must be approached at its real collision surface, not at that pin.
  function portalTransitions(actions, pins = [], surfaces = null) {
    const objects = [...actions?.objects?.values?.() || []], byPosition = new Map(objects.map(o => [`${o.ns}:${o.positionKey}`, o]));
    if (!objects.length || typeof actions?.resolvePosition !== 'function') return pins;
    const out = [], represented = new Set();
    const walkFlags = new Set([1, 3, 8, 9]), directFlags = new Set([2, 5, 6, 8, 9, 10]);
    const boxOf = o => point(o.aabb?.min) && point(o.aabb?.max) ? { min: point(o.aabb.min), max: point(o.aabb.max) } : null;
    const meshOf = o => {
      const b = surfaces?._buckets?.get(o.key) ?? actions.collider?._buckets?.get(o.key);
      if (!b) return null;
      const values = [], shift = b.t?.() || [0,0,0], r = b.r?.();
      for (let i = 0; i < b.tris.length; i++) if (!b.sight?.[i]) for (const p of b.tris[i].slice(0,3)) {
        if (r) values.push(r[0]*p[0]+r[3]*p[1]+r[6]*p[2]+shift[0],r[1]*p[0]+r[4]*p[1]+r[7]*p[2]+shift[1],r[2]*p[0]+r[5]*p[1]+r[8]*p[2]+shift[2]);
        else values.push(p[0]+shift[0],p[1]+shift[1],p[2]+shift[2]);
      }
      return values.length ? Float32Array.from(values) : null;
    };
    for (const o of objects) if (o.actionFlag === 14) {
      const a = actions.resolvePosition(o.ns, o.positionKey)?.pos ?? o.origin, b = actions.resolvePosition(o.ns, o.nextKey)?.pos;
      if (point(a) && point(b)) represented.add(JSON.stringify([point(a).map(x => Math.round(x * 100)), point(b).map(x => Math.round(x * 100))]));
    }
    for (const root of objects) {
      const walk = walkFlags.has(root.triggerFlag) && !(root.kind === 'relay' && root.isFlat);
      if (!walk && !directFlags.has(root.triggerFlag)) continue;
      let o = root; const visited = new Set();
      while (o && !visited.has(o)) {
        visited.add(o);
        if (o.actionFlag === 14) break;
        // The native input dialog stops its chain until answered. It is not a walk-through shortcut.
        if (o.actionFlag === 12 || o.nextKey == null || o.nextKey < 0) { o = null; break; }
        o = byPosition.get(`${o.ns}:${o.nextKey}`);
      }
      if (!o || o.actionFlag !== 14) continue;
      const raw = actions.resolvePosition(o.ns, o.positionKey) ?? (o.origin ? { pos: o.origin } : null);
      const entrance = actions.resolvePosition(root.ns, root.positionKey) ?? (root.origin ? { pos: root.origin } : null);
      const exit = actions.resolvePosition(o.ns, o.nextKey);
      if (!point(entrance?.pos) || !point(exit?.pos)) continue;
      if (point(raw?.pos)) represented.add(JSON.stringify([point(raw.pos).map(x => Math.round(x * 100)), point(exit.pos).map(x => Math.round(x * 100))]));
      out.push({ key: root.key, entrance: { pos: point(entrance.pos) }, exit: { pos: point(exit.pos) },
        activation: { kind: walk ? root.triggerFlag === 1 ? 'on' : 'into' : 'use', box: boxOf(root), surfaces: walk ? meshOf(root) : null } });
    }
    for (const pin of pins) {
      const a = point(pin.entrance?.pos), b = point(pin.exit?.pos);
      if (!a || !b) continue;
      const key = JSON.stringify([[a[0], a[1] - 1, a[2]].map(x => Math.round(x * 100)), [b[0], b[1] - .2, b[2]].map(x => Math.round(x * 100))]);
      // An actionless map connection is retained as a compatibility fallback.
      if (!represented.has(key)) out.push(pin);
    }
    return out;
  }
  function notePlacement(col,key,model) {
    if(!controls.has(Number(model?.modelIdNum)))return;
    let parts=placements.get(col);if(!parts)placements.set(col,parts=new Map());
    let ignored=parts.get(key);if(!ignored)parts.set(key,ignored=new Set());
    ignored.add(col._buckets.get(key)?.parts??0);
  }
  function navigationGeometry(col) {
    const parts=placements.get(col);if(!parts?.size)return col;
    const entries=[...col._buckets],old=geometryViews.get(col);
    if(old&&entries.length===old.entries.length&&entries.every(([k,b],i)=>k===old.entries[i][0]&&b===old.entries[i][1]&&b.tris.length===old.sizes[i]))return old.view;
    // A separate query index shares immutable triangles, never the game's mutable bucket bookkeeping.
    const query=new col.constructor(()=>-Infinity),buckets=new Map();
    for(const [key,b]of entries){
      const ignored=parts.get(key),mask=ignored?Uint8Array.from(b.tris,(_,i)=>b.sight?.[i]||ignored.has(b.part[i])?1:0):b.sight;
      query._buckets.set(key,{...b,rayMark:null,sight:mask});
      buckets.set(key,ignored?{...b,tris:b.tris.filter((_,i)=>!mask[i]),part:b.part?.filter((_,i)=>!mask[i]),sight:null}:b);
    }
    const view={source:col,_buckets:buckets,_bodyBuckets:query._buckets,raycastHit:(...args)=>query.raycastHit(...args)};
    geometryViews.set(col,{entries,sizes:entries.map(([,b])=>b.tris.length),view});return view;
  }
  const ended = b => { const q=b?.targetQuest??b?.targetResource?.parentQuest;return !!(q?.questComplete||q?.questTombstoned||q?.shelvedAt!=null); };
  const liveFoe = f => !!f?.entity&&!f.dead&&!f.corpse&&!f._gone&&!f._absentHere&&!f._pupMismatch&&!f.removed;
  const enemyName = (f,tools) => String(f.entity?.revenant?.name||f.entity?.champion?.name||f.entity?.properName||tools.enemyName?.(f.mobileType??f.src?.mobileType)||'Элитный противник');
  const values = x => Array.isArray(x) ? x : typeof x?.values === 'function' ? [...x.values()] : [];
  const symbol = s => typeof s === 'string' ? s.replace(/^_+|_+$/g,'') : s?.name ?? symbol(s?.original ?? '');
  const questKeys = new WeakMap();let nextQuestKey=0;
  const questKey = object => {let key=questKeys.get(object);if(key==null){key=++nextQuestKey;questKeys.set(object,key);}return key;};
  const questEnded = q => !!(q?.questComplete||q?.questTombstoned||q?.shelvedAt!=null);
  const peek = (fn,fallback=null) => {try{return fn()??fallback;}catch{return fallback;}};

  function questTargets(live, sources, tools, questIds) {
    const ctx=live.ctx, machine=live.questBridge?.machine, quests=new Map(values(machine?.quests).map(q=>[String(q.uid),q]));
    const records=new Map(), candidates=[], seen=new Set();
    if(questIds?.size===0||machine?.quests&&quests.size===0)return [];
    function record(uid,fallback=null) {
      if(uid==null||String(uid)==='0'||questIds&&!questIds.has(String(uid)))return null;
      uid=String(uid);if(records.has(uid))return records.get(uid);
      const q=machine?.quests?quests.get(uid):fallback;
      if(!q||questEnded(q)){records.set(uid,null);return null;}
      const resources=new Map(values(q.resources).filter(Boolean).map(r=>[symbol(r.symbol),r]));
      const row=sources.questRows?.get(uid), objectives=row?.ql?.objectives, open=Array.isArray(objectives)?objectives.filter(o=>o.state==='open'):null;
      const marks=new Set((open||[]).map(o=>symbol(o.mark)).filter(Boolean)), wantedItems=new Set(), needed=new Set();
      for(const mark of marks)if(resources.get(mark)?.isItem)wantedItems.add(mark);
      // HaveItem runs independently of Killed. Read only its running task, never
      // call update/checkTrigger or infer a monster from an item/quest title.
      for(const task of values(q.tasks))if(!task.dropped)for(const a of task.actions||[])if(!a.isComplete){
        if(task.triggered===true&&a.typeName==='HaveItem'){const key=symbol(a.targetItem);if(key)wantedItems.add(key);}
        if(a.typeName==='KilledFoe'&&task.triggered!==true){const key=symbol(a.foeSymbol);if((resources.get(key)?.killCount??0)<a.killsRequired)needed.add(key);}
        else if(a.isTriggerCondition&&task.triggered!==true)for(const field of ['foeSymbol','npcSymbol','targetSymbol']){const key=symbol(a[field]);if(resources.has(key))needed.add(key);}
      }
      const held=new Map();
      const owns=r=>{
        if(!r)return false;const key=symbol(r.symbol);if(held.has(key))return held.get(key);
        const item=r.daggerfallUnityItem, inventory=sources.entity?.items||[];
        const yes=typeof q.hooks?.carriesQuestItem==='function'?peek(()=>q.hooks.carriesQuestItem(r),true)===true:
          inventory.some(it=>it===item||String(it.questUID)===uid&&symbol(it.questSymbol)===key);
        held.set(key,yes);return yes;
      };
      const pending=new Set([...wantedItems].filter(key=>!owns(resources.get(key))));
      const rec={uid,q,resources,open,marks,pending,wantedItems,needed,owns,hasPending:false};records.set(uid,rec);return rec;
    }
    function behaviour(b) {
      if(!b||b.isComponentDestroyed)return null;
      const uid=b.questUID||b.targetQuest?.uid||b.targetResource?.parentQuest?.uid, rec=record(uid,b.targetQuest??b.targetResource?.parentQuest);
      if(!rec)return null;
      const key=symbol(b.targetSymbol??b.targetResource?.symbol), res=key?rec.resources.get(key):b.targetResource;
      return res&&!res.isDestroyed?{rec,res,key}:null;
    }
    function itemGoal(item,hint=null,includeHeld=false) {
      if(!item)return null;
      const rec=record(item.questUID,hint?.q)??(hint&&[...hint.resources.values()].some(r=>r.isItem&&r.daggerfallUnityItem===item)?hint:null);
      if(!rec)return null;
      const key=symbol(item.questSymbol), res=key?rec.resources.get(key):[...rec.resources.values()].find(r=>r.isItem&&r.daggerfallUnityItem===item);
      if(!res?.isItem||!includeHeld&&rec.owns(res))return null;
      return {rec,res,key:symbol(res.symbol)};
    }
    function put(goal,at,key,name,item=false) {
      if(!goal||!at)return;
      const {rec,res}=goal, token=symbol(res.symbol)||goal.key||'';
      if(!item&&(res.isHidden||res.isDestroyed))return;
      if(rec.open?.length===0)return;
      const id=rec.uid+'|'+key+'|'+token;if(seen.has(id))return;seen.add(id);
      if(item&&rec.pending.has(token))rec.hasPending=true;
      candidates.push({key:'quest:'+rec.uid+':'+key+':'+token,kind:'quest',uid:rec.uid,name:String(name||res.displayName||'Цель задания'),at,...(item&&!key.startsWith('carrier:')?{reach:2.25}:{}),token,item,rec});
    }
    for(const [i,f] of (live.foes||[]).entries()) {
      if(!f?.entity||f.active===false||f._gone||f._absentHere||f._pupMismatch||f.removed)continue;
      const b=peek(()=>ctx.questFoeBehaviour?.(f),f.questBehaviour), goal=behaviour(b), id=questKey(f), alive=liveFoe(f);
      if(alive) {
        if((goal?.res??b?.targetResource)?.isHidden||(goal?.res??b?.targetResource)?.isDestroyed)continue;
        const at=point(f.ai?.feet), doneCarrier=goal&&goal.res.itemQueue?.some(it=>{const g=itemGoal(it,goal.rec,true);return g&&goal.rec.wantedItems.has(g.key)&&goal.rec.owns(g.res);});
        if(!doneCarrier||goal.rec.needed.has(goal.key)||goal.rec.marks.has(goal.key))put(goal,at,'foe:'+id,goal?.res.displayName||tools.enemyName?.(f.mobileType));
        const items=new Set([...(Array.isArray(f.entity.items)?f.entity.items:[]),...(Array.isArray(goal?.res.itemQueue)?goal.res.itemQueue:[])]);
        for(const it of items){const g=itemGoal(it,goal?.rec);if(g)put(g,at,'carrier:'+id,(g.res.displayName||it.name||'Предмет задания')+' — '+(tools.enemyName?.(f.mobileType)||'носитель'),true);}
      } else if(f.dead&&f.corpse&&f._ownFrom==null&&!f.corpseDisabled) {
        const key=typeof ctx.corpseKeyOf==='function'?peek(()=>ctx.corpseKeyOf(f)):'corpse:'+i;if(!key)continue;
        const items=typeof ctx.lootContents==='function'?peek(()=>ctx.lootContents(key)):f.entity.items;
        for(const it of Array.isArray(items)?items:[]){const g=itemGoal(it,goal?.rec);if(g)put(g,point(peek(()=>ctx.corpseAt?.(f))??f.corpsePos??f.ai?.feet),'body:'+id,g.res.displayName||it.name,true);}
      }
    }
    for(const s of sources.stands||[])if(s?.active&&!s.dead) {
      const goal=behaviour(s.behaviour);if(!goal||goal.res.isHidden||goal.res.isItem&&goal.rec.owns(goal.res))continue;
      const box=peek(()=>sources.boxOf?.(s));if(box?.min&&box.max)put(goal,point([(box.min[0]+box.max[0])/2,box.min[1],(box.min[2]+box.max[2])/2]),'stand:'+questKey(s),null,!!goal.res.isItem);
    }
    for(const p of ctx.people||[])if(p&&p.active!==false)put(behaviour(p.questBehaviour),point([p.x,p.y,p.z]),'person:'+questKey(p));
    // These native getters only expose already-existing lists. Never open a
    // container, roll loot, request another owner's body or perform a transfer.
    if(typeof ctx.lootTargets==='function'&&typeof ctx.lootContents==='function')for(const t of peek(()=>ctx.lootTargets(),[])) {
      if(!/^(loot|droppedLoot):/.test(t.key))continue;
      const at=point(t.pos??(t.aabb&&[(t.aabb.min[0]+t.aabb.max[0])/2,t.aabb.min[1],(t.aabb.min[2]+t.aabb.max[2])/2]));
      if(!at)continue;const items=peek(()=>ctx.lootContents(t.key));
      for(const it of Array.isArray(items)?items:[]){const g=itemGoal(it);if(g)put(g,at,'loot:'+t.key,g.res.displayName||it.name,true);}
    }
    const destinations=new Set();
    return candidates.filter(c=>{
      const {rec,token}=c;
      if(rec.marks.size&&!rec.open.some(o=>!o.mark))return rec.marks.has(token)||[...rec.marks].some(k=>rec.resources.get(k)?.isPlace&&rec.resources.get(k).siteDetails?.mapId===live.location?.mapTableData?.mapId);
      if(rec.hasPending)return c.item&&rec.pending.has(token);
      return true;
    }).filter(c=>{const key=JSON.stringify([c.uid,c.at]);if(destinations.has(key))return false;destinations.add(key);return true;}).map(({token,item,rec,...target})=>target);
  }
  function exitPoint(d) {
    const m=d?.matrix,c=d?.centre,n=d?.normal;
    if(!m||!c||!n)return point(d?.pos);
    const at=[m[0]*c.x+m[4]*c.y+m[8]*c.z+m[12],m[1]*c.x+m[5]*c.y+m[9]*c.z+m[13],m[2]*c.x+m[6]*c.y+m[10]*c.z+m[14]];
    const normal=[m[0]*n.x+m[4]*n.y+m[8]*n.z,m[1]*n.x+m[5]*n.y+m[9]*n.z,m[2]*n.x+m[6]*n.y+m[10]*n.z],len=Math.hypot(...normal)||1;
    at[0]+=normal[0]/len*.9;at[2]+=normal[2]/len*.9;at[1]-=(d.size?.y??2)/2;
    return point(at);
  }
  function targets(live, sources={}, tools={}, questIds=null, kind=null) {
    const out={exit:[],aurum:[],elite:[],quest:[]},ctx=live.ctx;
    for(const [i,d]of(ctx.exitDoors||[]).entries()){const at=exitPoint(d);if(at)out.exit.push({key:'exit:'+i,kind:'exit',name:'Выход из данжа',at});}
    const coffer=live.aurum,foot=point(coffer?.foot);
    if(coffer&&!coffer.open&&foot)out.aurum.push({key:'aurum:'+coffer.id,kind:'aurum',name:'Сундук с аурумом',at:foot});
    if(kind==null||kind==='elite')for(const[i,f]of(live.foes||[]).entries()){
      if(!liveFoe(f))continue;
      const at=point(f.ai?.feet);if(!at)continue;
      if(f.entity.eliteFoe===true&&!f.src?.allied&&f.companion==null&&f.entity.team!=='PlayerAlly'&&f.entity.mobileTeam!=='PlayerAlly')out.elite.push({key:'elite:'+i,kind:'elite',name:enemyName(f,tools),at});
    }
    if(kind==null||kind==='quest')out.quest=questTargets(live,sources,tools,questIds);
    return out;
  }
  const ray = (col,origin,dir,max,skip=[]) => col.raycastHit(origin,dir,max,{skip,bodies:true});
  function goalReached(target,feet,col) {
    if(target.kind!=='quest'||!target.reach)return true;
    if(distance(feet,target.at)>target.reach)return false;
    const eye=[feet[0],feet[1]+BODY.height-.2,feet[2]],end=[target.at[0],target.at[1]+.06,target.at[2]],delta=end.map((x,i)=>x-eye[i]),len=Math.hypot(...delta);
    if(len<.0001)return true;
    try{const hit=ray(col,eye,delta.map(x=>x/len),len);return hit==null||hit.dist===Infinity||Number.isFinite(hit.dist)&&hit.dist>=len-.0001;}catch{return false;}
  }
  function floor(col,p,skip=[]) {
    if(!point(p)||!col?.raycastHit)return null;
    const probe=(x,z)=>{const h=ray(col,[x,p[1]+BODY.floorUp,z],[0,-1,0],BODY.floorDown,skip);return Number.isFinite(h?.dist)&&(!h.normal||h.normal[1]>=.34)?p[1]+BODY.floorUp-h.dist:null;};
    let y=probe(p[0],p[2]);
    if(y==null){
      // Classic room seams have centimetre-wide cracks, often exactly on a grid row. The player's
      // 70 cm capsule bridges them. Require support on BOTH sides; never fill an abyss or join floors.
      for(const [dx,dz]of [[.1,0],[0,.1]]){const a=probe(p[0]-dx,p[2]-dz),b=probe(p[0]+dx,p[2]+dz);if(a!=null&&b!=null&&Math.abs(a-b)<=.5){y=(a+b)/2;break;}}
      if(y==null)return null;
    }
    const at=[p[0],y,p[2]],head=ray(col,[at[0],at[1]+.08,at[2]],[0,1,0],BODY.height-.09,skip);
    return Number.isFinite(head?.dist)?null:at;
  }
  function clearance(col,a,b,skip=[],wide=true,grounded=false) {
    if(wide&&col?._buckets){
      const hit=G.bodyBlocked(col,a,b,skip,grounded);if(!hit||!grounded)return hit;
      let rest=0;
      for(const p of [a,b])for(const [x,z]of [[.18,0],[-.18,0],[0,.18],[0,-.18]]){
        const q=floor(col,[p[0]+x,p[1],p[2]+z],skip),rise=q&&Math.abs(q[1]-p[1]);
        if(q&&rise<=BODY.step)rest=Math.max(rest,BODY.radius*(Math.sqrt(1+(rise/.18)**2)-1));
      }
      const top=BODY.step+rest;
      if(rest>.001)for(let lift=.1;lift<top+.1;lift+=.1)if(!G.bodyBlocked(col,a,b,skip,true,Math.min(top,lift)))return null;
      return hit;
    }
    const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],len=Math.hypot(dx,dy,dz);
    if(len<1e-6)return null;
    const dir=[dx/len,dy/len,dz/len],h=Math.hypot(dx,dz),radius=BODY.radius-.01,side=h>.00001?[-dz/h*radius,dx/h*radius]:[radius,0];
    const skin=.002;
    const offsets=!wide?[[0,0]]:h>.00001?[side,side.map(x=>-x),[0,0]]:[[radius,0],[-radius,0],[0,radius],[0,-radius],[0,0]];
    for(const off of offsets)for(const y of BODY.probes){
      // Include BOTH ends: a grid node exactly on a wall cannot enter at one edge's end and
      // leave through a zero-distance hit ignored by the next ray's triangle epsilon.
      const hit=ray(col,[a[0]+off[0]-dir[0]*skin,a[1]+y-dir[1]*skin,a[2]+off[1]-dir[2]*skin],dir,len+2*skin,skip);
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
    return [...new Set([...(actions?.objects?.values?.()||[])].filter(o=>o.kind==='door'||o.kind==='action'||controls.has(Number(o.modelIdNum))).map(o=>o.key))];
  }
  function riding(feet,col,actions){
    const support=ray(col,[feet[0],feet[1]+.15,feet[2]],[0,-1,0],.4);
    return actions?.objects?.get(support?.key)?.kind==='action'?support.key:null;
  }
  function follow(route,feet,col,actions,limit=45) {
    const onLift=riding(feet,col,actions);
    let cut=trim(route.points,feet);const skip=routingSkip(actions);if(cut.points.length<1)return null;
    if(onLift){
      const vertical=trim(route.points,feet,i=>route.kinds?.[i+1]!=='walk'&&feet[1]>=Math.min(route.points[i][1],route.points[i+1][1])-.3&&feet[1]<=Math.max(route.points[i][1],route.points[i+1][1])+.3);
      if(vertical.off<20)cut=vertical;
    }
    if(cut.off>(onLift?20:1.8))return null;
    const kind=route.kinds?.[cut.index+1]||'walk',connector=[];
    if(kind==='walk'||onLift){
      const start=floor(col,feet);if(!start||distance(start,feet)>.7)return null;
      connector.push(start);const steps=Math.max(1,Math.ceil(distance(start,cut.points[0])/.14));let prev=start;
      for(let i=1;i<=steps;i++){
        const p=floor(col,start.map((x,k)=>x+(cut.points[0][k]-x)*i/steps));if(!p||Math.abs(p[1]-prev[1])>.505)return null;
        const run=Math.hypot(p[0]-prev[0],p[2]-prev[2]),rise=Math.abs(p[1]-prev[1]);
        const lift=run>.01&&rise>.03?Math.min(.45,.35*(Math.sqrt(1+(rise/run)**2)-1)):0;
        if(clearance(col,[prev[0],prev[1]+lift,prev[2]],[p[0],p[1]+lift,p[2]],skip,true,true))return null;
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
  const api={point,distance,length,portalTransitions,notePlacement,routingSkip,navigationGeometry,targets,questTargets,goalReached,exitPoint,ended,floor,clearance,riding,trim,follow};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.__dfoDungeonNavModel=api;
})(globalThis);
