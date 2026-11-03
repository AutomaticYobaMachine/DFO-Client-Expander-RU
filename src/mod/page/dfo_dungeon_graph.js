(function dungeonGraphModule(root) {
  'use strict';
  // Player navigation only. No NavClient, NPC navmesh, world mutations or action dispatch.
  const VERSION = 1, CELL = 2, STEP = .505, RADIUS = .35;
  const url = root.document?.currentScript?.src;
  const dist = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  const lerp = (a,b,t) => a.map((x,k)=>x+(b[k]-x)*t);
  const length = ps => ps.slice(1).reduce((s,p,i)=>s+dist(ps[i],p),0);
  const xyz = p => p?.length>=3&&[p[0],p[1],p[2]].every(Number.isFinite)?[p[0],p[1],p[2]]:null;
  const cell = (x,z,size=CELL) => `${Math.floor(x/size)},${Math.floor(z/size)}`;
  const put = (map,key,value) => {let a=map.get(key);if(!a)map.set(key,a=[]);a.push(value);};
  // ActionSystem applies world translation * base * Ry * Rx * Rz (degrees).
  function turn(v,angles){
    const [x,y,z]=angles.map(a=>a*Math.PI/180),cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z);
    const a=v[0]*cz-v[1]*sz,b=v[0]*sz+v[1]*cz,c=b*cx-v[2]*sx,d=b*sx+v[2]*cx;
    return [a*cy+d*sy,c,-a*sy+d*cy];
  }
  const hash = values => {let a=2166136261,b=5381;for(const x of values){const n=Math.round(x*1e4);a=Math.imul(a^n,16777619);b=Math.imul(b,33)^n;}return `${VERSION}:${values.length}:${a>>>0}:${b>>>0}`;};
  class Heap {
    constructor(){this.a=[];}
    push(item){const a=this.a;let i=a.length;a.push(item);while(i){const p=(i-1)>>1;if(a[p].score<=item.score)break;a[i]=a[p];i=p;}a[i]=item;}
    pop(){const a=this.a,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1].score<a[c].score)c++;if(a[c].score>=last.score)break;a[i]=a[c];i=c;}a[i]=last;}return first;}
    get size(){return this.a.length;}
  }
  // Mesh profiles contain local candidate points and connectivity hints, never scene entities.
  // Geometry is fingerprinted AFTER the original client's seam/model repairs.
  function profile(data) {
    const points=[],links=[],seen=new Map();
    const add=p=>{const k=p.map(x=>Math.round(x*100)).join(',');if(seen.has(k))return seen.get(k);const i=points.length;seen.set(k,i);points.push(p);return i;};
    for(let i=0;i<data.length;i+=9){
      const a=Array.from(data.subarray(i,i+3)),b=Array.from(data.subarray(i+3,i+6)),c=Array.from(data.subarray(i+6,i+9));
      const u=b.map((x,k)=>x-a[k]),v=c.map((x,k)=>x-a[k]);
      const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],nl=Math.hypot(...n);if(nl<1e-7)continue;
      const centre=a.map((x,k)=>(x+b[k]+c[k])/3);
      if(Math.abs(n[1])/nl>=.34){
        const hub=add(centre);
        for(const [p,q]of [[a,b],[b,c],[c,a]]){
          const count=Math.max(1,Math.ceil(dist(p,q)/2));
          for(let j=0;j<=count;j++){
            const on=lerp(p,q,j/count),d=Math.hypot(on[0]-centre[0],on[2]-centre[2]);
            const id=add(lerp(on,centre,Math.min(.35,d>.001?.43/d:.35)));
            if(id!==hub)links.push([hub,id]);
          }
        }
      }else if(Math.abs(n[1])/nl<.5){
        // Wall feet/heads and obstacle corners give a visibility roadmap inside broad floor faces.
        for(const p of [a,b,c])for(const [x,z]of [[-.42,-.42],[-.42,.42],[.42,-.42],[.42,.42]])add([p[0]+x,p[1],p[2]+z]);
        for(const[p,q]of [[a,b],[b,c],[c,a]])if(Math.abs(p[1]-q[1])<.1){
          const count=Math.ceil(dist(p,q)/3);
          for(let j=1;j<count;j++){
            const p0=lerp(p,q,j/count),nx=n[0]/nl*.42,nz=n[2]/nl*.42;
            add([p0[0]+nx,p0[1],p0[2]+nz]);add([p0[0]-nx,p0[1],p0[2]-nz]);
          }
        }
      }
    }
    return {points,links};
  }
  class Geometry {
    constructor(data,support=null){this.data=data;this.support=support;this.faces=[];this.grid=new Map();this.wide=[];this.stamp=0;}
    async index(checkpoint){
      const data=this.data;
      for(let i=0;i<data.length;i+=9){
        const a=Array.from(data.subarray(i,i+3)),b=Array.from(data.subarray(i+3,i+6)),c=Array.from(data.subarray(i+6,i+9));
        const e=b.map((x,k)=>x-a[k]),f=c.map((x,k)=>x-a[k]);
        const n=[e[1]*f[2]-e[2]*f[1],e[2]*f[0]-e[0]*f[2],e[0]*f[1]-e[1]*f[0]],nl=Math.hypot(...n);if(nl<1e-8)continue;
        const lo=a.map((x,k)=>Math.min(x,b[k],c[k])),hi=a.map((x,k)=>Math.max(x,b[k],c[k]));
        const id=this.faces.length;this.faces.push({a,e,f,ny:Math.abs(n[1])/nl,lo,hi,support:!!this.support?.[i/9]});
        const x0=Math.floor(lo[0]/CELL),x1=Math.floor(hi[0]/CELL),z0=Math.floor(lo[2]/CELL),z1=Math.floor(hi[2]/CELL);
        if((x1-x0+1)*(z1-z0+1)>1024)this.wide.push(id);
        else for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++)put(this.grid,`${x},${z}`,id);
        if(i%9216===0)await checkpoint();
      }
      this.marks=new Int32Array(this.faces.length);
    }
    ray(o,d,max,support=false){
      const faces=this.faces,marks=this.marks,stamp=++this.stamp;if(stamp>=0x7ffffffe){marks.fill(0);this.stamp=1;}
      let best=max+.00001,face=null;
      const y0=Math.min(o[1],o[1]+d[1]*max)-.0001,y1=Math.max(o[1],o[1]+d[1]*max)+.0001;
      const test=id=>{
        if(marks[id]===stamp)return;marks[id]=stamp;const t=faces[id];if((t.support&&!support)||t.hi[1]<y0||t.lo[1]>y1)return;
        const px=d[1]*t.f[2]-d[2]*t.f[1],py=d[2]*t.f[0]-d[0]*t.f[2],pz=d[0]*t.f[1]-d[1]*t.f[0],det=t.e[0]*px+t.e[1]*py+t.e[2]*pz;
        if(Math.abs(det)<1e-9)return;
        const vx=o[0]-t.a[0],vy=o[1]-t.a[1],vz=o[2]-t.a[2],inv=1/det,u=(vx*px+vy*py+vz*pz)*inv;if(u<-.00001||u>1.00001)return;
        const qx=vy*t.e[2]-vz*t.e[1],qy=vz*t.e[0]-vx*t.e[2],qz=vx*t.e[1]-vy*t.e[0],w=(d[0]*qx+d[1]*qy+d[2]*qz)*inv;
        if(w<-.00001||u+w>1.00001)return;
        const hit=(t.f[0]*qx+t.f[1]*qy+t.f[2]*qz)*inv;if(hit>.00001&&hit<best){best=hit;face=t;}
      };
      let x=Math.floor(o[0]/CELL),z=Math.floor(o[2]/CELL),at=0;
      const sx=d[0]>=0?1:-1,sz=d[2]>=0?1:-1,dx=Math.abs(d[0])<1e-10?Infinity:CELL/Math.abs(d[0]),dz=Math.abs(d[2])<1e-10?Infinity:CELL/Math.abs(d[2]);
      let tx=dx===Infinity?Infinity:((x+(sx>0?1:0))*CELL-o[0])/d[0],tz=dz===Infinity?Infinity:((z+(sz>0?1:0))*CELL-o[2])/d[2];
      for(let steps=0;steps<10000&&at<=max&&at<=best;steps++){
        for(const id of this.grid.get(`${x},${z}`)||[])test(id);
        if(tx===Infinity&&tz===Infinity)break;
        if(tx<tz){at=tx;x+=sx;tx+=dx;}else{at=tz;z+=sz;tz+=dz;}
      }
      for(const id of this.wide)test(id);
      return face?{dist:best,face}:null;
    }
    ground(p,up=.56,down=1.24){
      const h=this.ray([p[0],p[1]+up,p[2]],[0,-1,0],down,true);
      return h&&h.face.ny>=.34?[p[0],p[1]+up-h.dist,p[2]]:null;
    }
    floor(p){
      let at=this.ground(p);
      if(!at)for(const [x,z]of [[.1,0],[0,.1]]){
        const a=this.ground([p[0]-x,p[1],p[2]-z]),b=this.ground([p[0]+x,p[1],p[2]+z]);
        if(a&&b&&Math.abs(a[1]-b[1])<=STEP){at=[p[0],(a[1]+b[1])/2,p[2]];break;}
      }
      return at;
    }
    fits(p,lift=0){
      const h=this.ray([p[0],p[1]+.08+lift,p[2]],[0,1,0],1.71);if(h)return false;
      for(let i=0;i<8;i++){
        const a=i*Math.PI/4,d=[Math.cos(a),0,Math.sin(a)];
        for(const y of [.54,1.05,1.55])if(this.ray([p[0],p[1]+y+lift,p[2]],d,.345))return false;
      }
      return true;
    }
    clear(a,b,lift=0,wide=true){
      const d=b.map((x,k)=>x-a[k]),len=Math.hypot(...d);if(len<.0001)return true;
      for(let i=0;i<3;i++)d[i]/=len;
      const run=Math.hypot(d[0],d[2]),side=run>.00001?[-d[2]/run*.34,0,d[0]/run*.34]:[.34,0,0];
      const offsets=!wide?[[0,0,0]]:run>.00001?[side,side.map(x=>-x),[0,0,0]]:[[.34,0,0],[-.34,0,0],[0,0,.34],[0,0,-.34],[0,0,0]];
      for(const off of offsets)for(const y of [.54,1.05,1.55,1.72]){
        const p=a.map((x,k)=>x+off[k]-d[k]*.002);p[1]+=y+lift;
        if(this.ray(p,d,len+.004))return false;
      }
      return true;
    }
    walk(a,b){
      if(Math.hypot(a[0]-b[0],a[2]-b[2])+.02<Math.abs(a[1]-b[1])/Math.tan(70*Math.PI/180))return null;
      const points=[a],count=Math.max(1,Math.ceil(dist(a,b)/.18));let prev=a;
      for(let i=1;i<=count;i++){
        const p=this.floor(lerp(a,b,i/count));if(!p||Math.abs(p[1]-prev[1])>STEP)return null;
        const run=Math.hypot(p[0]-prev[0],p[2]-prev[2]),rise=Math.abs(p[1]-prev[1]);
        const lift=run>.01&&rise>.03?Math.min(.45,RADIUS*(Math.sqrt(1+(rise/run)**2)-1)):0;
        if(!this.clear(prev,p,lift))return null;
        if(points.length>1){const x=points.at(-2),y=points.at(-1),v=y.map((n,k)=>n-x[k]),w=p.map((n,k)=>n-y[k]);
          if(Math.hypot(v[1]*w[2]-v[2]*w[1],v[2]*w[0]-v[0]*w[2],v[0]*w[1]-v[1]*w[0])<.000001)points.pop();}
        points.push(p);prev=p;
      }
      return dist(prev,b)<.12?points:null;
    }
    drop(a,b){
      if(a[1]-b[1]<=STEP||Math.hypot(a[0]-b[0],a[2]-b[2])>1.8)return null;
      // Step out over the lower landing's column, then descend; never cut a floor slab.
      const lip=[b[0],a[1]+.06,b[2]],low=[b[0],b[1]+.06,b[2]];
      if(!this.clear([a[0],a[1]+.06,a[2]],lip)||!this.clear(lip,low))return null;
      const ray=this.ray([lip[0],lip[1]-.02,lip[2]],[0,-1,0],a[1]-b[1]+.12,true);
      if(!ray||Math.abs(lip[1]-.02-ray.dist-b[1])>.15)return null;
      return [a,lip,low,b];
    }
    climb(a,b){
      if(b[1]-a[1]<=STEP||b[1]-a[1]>64||Math.hypot(a[0]-b[0],a[2]-b[2])>1.8)return null;
      for(let i=0;i<12;i++){
        const ang=i*Math.PI/6,d=[Math.cos(ang),0,Math.sin(ang)],h=this.ray([a[0],a[1]+1,a[2]],d,.85);
        if(!h||h.face.ny>.5)continue;
        const wall=[a[0]+d[0]*Math.max(0,h.dist-.37),a[1],a[2]+d[2]*Math.max(0,h.dist-.37)];
        const top=[wall[0],b[1]+.06,wall[2]];
        if(Math.hypot(top[0]-b[0],top[2]-b[2])>1.5||!this.clear(a,wall)||!this.clear(wall,top)||!this.clear(top,[b[0],b[1]+.06,b[2]]))continue;
        let continuous=true;
        for(let y=a[1]+.6;y<b[1]-.08;y+=.45){
          const hit=this.ray([wall[0],y,wall[2]],d,.65);if(!hit||hit.face.ny>.5){continuous=false;break;}
        }
        if(continuous)return [a,wall,top,b];
      }
      return null;
    }
  }
  const templates=new Map();let dbPromise;
  async function database(){
    if(!root.indexedDB)return null;
    return dbPromise??=(new Promise(resolve=>{try{const q=root.indexedDB.open('dfo-player-route-profiles',VERSION);q.onupgradeneeded=()=>{if(!q.result.objectStoreNames.contains('profiles'))q.result.createObjectStore('profiles',{keyPath:'key'});};q.onblocked=()=>resolve(null);q.onerror=()=>resolve(null);q.onsuccess=()=>resolve(q.result);}catch{resolve(null);}}));
  }
  async function cachedProfile(key,data){
    if(templates.has(key))return templates.get(key);
    const db=await database();let result=null;
    if(db)try{result=await new Promise(resolve=>{const q=db.transaction('profiles').objectStore('profiles').get(key);q.onsuccess=()=>resolve(q.result?.profile??null);q.onerror=()=>resolve(null);});}catch{}
    const valid=result&&Array.isArray(result.points)&&Array.isArray(result.links)&&result.points.length<200000&&result.links.length<400000
      &&result.points.every(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite))
      &&result.links.every(e=>Array.isArray(e)&&e.length===2&&e.every(i=>Number.isInteger(i)&&i>=0&&i<result.points.length));
    if(!valid)result=profile(data);
    templates.set(key,result);if(templates.size>256)templates.delete(templates.keys().next().value);
    if(db)try{const tx=db.transaction('profiles','readwrite'),s=tx.objectStore('profiles');s.put({key,profile:result});const q=s.count();q.onsuccess=()=>{if(q.result>256){let left=q.result-256;const cursor=s.openCursor();cursor.onsuccess=()=>{const c=cursor.result;if(c&&left>0){if(c.key!==key){c.delete();left--;}c.continue();}};}};}catch{}
    return result;
  }
  // Snapshot immutable static parts. Live action buckets do not invalidate the whole dungeon graph.
  async function snapshot(col,actions,checkpoint=async()=>{}){
    if(!col?._buckets)throw new Error('Геометрия данжа недоступна.');
    const dynamic=new Set([...actions?.objects?.values?.()||[]].filter(o=>o.kind==='action'||o.kind==='door').map(o=>o.key));
    const parts=[],channels=[];let total=0;
    for(const [key,b]of col._buckets){
      if(dynamic.has(key))continue;
      const groups=new Map(),t=b.t?.()||[0,0,0],r=b.r?.();
      for(let i=0;i<b.tris.length;i++){
        if(b.sight?.[i])continue;
        const id=b.part?.[i]??0;let g=groups.get(id);if(!g)groups.set(id,g=[]);
        // The collider may append cached bounds after a triangle's three vertices.
        for(const p of b.tris[i].slice(0,3)){
          if(r)g.push(r[0]*p[0]+r[3]*p[1]+r[6]*p[2]+t[0],r[1]*p[0]+r[4]*p[1]+r[7]*p[2]+t[1],r[2]*p[0]+r[5]*p[1]+r[8]*p[2]+t[2]);
          else g.push(p[0]+t[0],p[1]+t[1],p[2]+t[2]);
        }
        if(i%1024===0)await checkpoint();
      }
      for(const g of groups.values()){
        const origin=g.slice(0,3),local=Float32Array.from(g,(x,i)=>x-origin[i%3]);
        parts.push({origin,data:local,key:hash(local)});total+=g.length;
      }
    }
    // Lift/bridge decks remain potential support at their fixed end poses. They neither
    // become solid walls in the shaft nor trigger rebuilds on each animation frame.
    for(const o of actions?.objects?.values?.()||[]){
      const cpu=o.cpu,m=o.base;
      if(o.kind!=='action'||!cpu?.positions||!cpu.indices||!m||[61027,61028,74037].includes(Number(o.modelIdNum)))continue;
      const move=o.translation||{x:0,y:0,z:0},rotation=o.rotation||{x:0,y:0,z:0},angles=[rotation.x,rotation.y,rotation.z],rotates=Math.hypot(...angles)>.01;
      const ends=[{move:[0,0,0],angles:[0,0,0]}];
      if(Math.hypot(move.x,move.y,move.z)>.01||rotates)ends.push({move:[move.x,move.y,move.z],angles});
      for(const end of ends){
        const values=[];
        for(let k=0;k<cpu.indices.length;k+=3){
          if(cpu.normals){const id=cpu.indices[k]*3,n=turn([cpu.normals[id],cpu.normals[id+1],cpu.normals[id+2]],end.angles),ny=m[1]*n[0]+m[5]*n[1]+m[9]*n[2];if(ny<.34)continue;}
          for(let j=k;j<k+3;j++){const id=cpu.indices[j],[x,y,z]=turn([cpu.positions[id*3],cpu.positions[id*3+1],cpu.positions[id*3+2]],end.angles);values.push(m[0]*x+m[4]*y+m[8]*z+m[12]+end.move[0],m[1]*x+m[5]*y+m[9]*z+m[13]+end.move[1],m[2]*x+m[6]*y+m[10]*z+m[14]+end.move[2]);}
        }
        if(!values.length)continue;
        const origin=values.slice(0,3),local=Float32Array.from(values,(x,i)=>x-origin[i%3]);
        parts.push({origin,data:local,key:hash(local),support:true});total+=values.length;
        if(end===ends[0]&&ends.length>1&&!rotates){
          const ps=profile(local).points;
          for(const p of ps.slice(0,256)){const a=p.map((x,i)=>x+origin[i]),b=a.map((x,i)=>x+ends[1].move[i]);channels.push({from:a,to:b});}
        }
      }
      await checkpoint();
    }
    if(!total)throw new Error('В данже нет загруженных поверхностей для маршрута.');
    if(total>9000000)throw new Error('Геометрия данжа слишком велика для текущего построителя маршрутов.');
    return {parts,total,channels};
  }
  class Graph {
    constructor(){this.nodes=[];this.grid=new Map();this.columns=new Map();this.edges=new Map();this.serial=0;this.tested=0;}
    async build(input,checkpoint=async()=>{}){
      const all=new Float32Array(input.total),support=new Uint8Array(input.total/9);let offset=0;
      for(const p of input.parts){for(let i=0;i<p.data.length;i++)all[offset+i]=p.data[i]+p.origin[i%3];if(p.support)support.fill(1,offset/9,(offset+p.data.length)/9);offset+=p.data.length;await checkpoint();}
      this.geo=new Geometry(all,support);await this.geo.index(checkpoint);const seen=new Map();
      const add=hint=>{
        const p=this.geo.floor(hint);if(!p||Math.abs(p[1]-hint[1])>.55)return -1;
        const key=[Math.round(p[0]*2),Math.round(p[1]*16),Math.round(p[2]*2)].join(',');if(seen.has(key))return seen.get(key);
        if(!this.geo.fits(p))return -1;
        const id=this.nodes.length;seen.set(key,id);this.nodes.push({p,links:new Set()});put(this.grid,cell(p[0],p[2],3),id);put(this.columns,cell(p[0],p[2],1),id);return id;
      };
      let n=0;
      for(const part of input.parts){
        const template=await cachedProfile(part.key,part.data),ids=[];
        for(const p of template.points){ids.push(add(p.map((x,k)=>x+part.origin[k])));if(++n%64===0)await checkpoint();}
        for(const [a,b]of template.links)if(ids[a]>=0&&ids[b]>=0&&ids[a]!==ids[b]){this.nodes[ids[a]].links.add(ids[b]);this.nodes[ids[b]].links.add(ids[a]);}
        await checkpoint();
      }
      // A genuine moving support connects its end poses even where there is no
      // continuous climbable wall. This is one spatial line, without switch states.
      for(const c of input.channels||[]){
        const a=add(c.from),b=add(c.to);if(a<0||b<0||a===b)continue;
        const p=this.nodes[a].p,q=this.nodes[b].p;
        if(!this.geo.clear(p,q))continue;
        this.nodes[a].links.add(b);this.nodes[b].links.add(a);
        this.edges.set(`${a}:${b}`,{kind:'lift',points:[p,q],cost:dist(p,q)});
        this.edges.set(`${b}:${a}`,{kind:'lift',points:[q,p],cost:dist(p,q)});
        await checkpoint();
      }
      this.serial++;return this;
    }
    near(p,r=6,cap=32,vertical=false){
      const map=vertical?this.columns:this.grid,size=vertical?1:3,found=[];
      for(let x=Math.floor((p[0]-r)/size);x<=Math.floor((p[0]+r)/size);x++)for(let z=Math.floor((p[2]-r)/size);z<=Math.floor((p[2]+r)/size);z++)for(const id of map.get(`${x},${z}`)||[]){
        const q=this.nodes[id].p,d=vertical?Math.hypot(q[0]-p[0],q[2]-p[2]):dist(p,q);if(d<=r)found.push({id,d:vertical?d+Math.abs(q[1]-p[1])*.015:d});
      }
      found.sort((a,b)=>a.d-b.d);return found.slice(0,cap).map(x=>x.id);
    }
    neighbours(id){
      const n=this.nodes[id];if(n.neighbours)return n.neighbours;
      const nearby=this.near(n.p,6,200),rays=new Map();
      for(const i of nearby){const p=this.nodes[i].p,dx=p[0]-n.p[0],dz=p[2]-n.p[2],d=Math.hypot(dx,dz);if(Math.abs(p[1]-n.p[1])>.7+d*2.75)continue;
        const sector=Math.round(Math.atan2(dz,dx)*4/Math.PI),old=rays.get(sector);if(!old||old.d<d)rays.set(sector,{i,d});}
      return n.neighbours=[...new Set([...n.links,...nearby.slice(0,10),...[...rays.values()].map(x=>x.i),...this.near(n.p,1.8,12,true)])].filter(i=>i!==id);
    }
    edge(a,b){
      const key=`${a}:${b}`;if(this.edges.has(key))return this.edges.get(key);
      const p=this.nodes[a].p,q=this.nodes[b].p,result=this.connect(p,q);this.edges.set(key,result);this.tested++;
      if(this.edges.size>101000){let left=1000;for(const [k,e]of this.edges)if(e?.kind!=='lift'){this.edges.delete(k);if(!--left)break;}}
      return result;
    }
    connect(a,b){
      let points=this.geo.walk(a,b),kind='walk';
      if(!points){points=this.geo.climb(a,b);kind='climb';}
      if(!points){points=this.geo.drop(a,b);kind='drop';}
      return points?{points,kind,cost:length(points)}:null;
    }
    attach(p,goal=false){
      const floor=this.geo.floor(p),at=floor&&Math.abs(floor[1]-p[1])<.7?floor:p,links=[];
      const ids=[...new Set([...this.near(at,8,36),...this.near(at,1.8,16,true)])];
      for(const id of ids){const q=this.nodes[id].p,edge=goal?this.connect(q,at):this.connect(at,q);if(edge)links.push({id,...edge});}
      return {at,links};
    }
    async route(from,targets,transitions=[],checkpoint=async()=>{}){
      from=xyz(from);targets=targets.map(t=>({...t,at:xyz(t.at)})).filter(t=>t.at);if(!from||!targets.length)return null;
      const anchors=[],extra=new Map(),goals=[],portals=[],base=this.nodes.length;
      const at=id=>id<base?this.nodes[id].p:anchors[id-base].at;
      const link=(a,b,edge)=>put(extra,a,{to:b,edge});
      const anchor=(p,goal=false)=>{
        const id=base+anchors.length,attached=this.attach(p,goal);anchors.push({id,at:attached.at});
        for(const e of attached.links)goal?link(e.id,id,e):link(id,e.id,e);
        return id;
      };
      const start=anchor(from);
      for(const target of targets){
        const raw=target.at,approaches=[raw];
        for(const radius of [.65,1.05])for(let n=0;n<8;n++)approaches.push([raw[0]+Math.cos(n*Math.PI/4)*radius,raw[1],raw[2]+Math.sin(n*Math.PI/4)*radius]);
        for(const p of approaches){
          const landed=this.geo.floor(p);if(!landed||Math.abs(landed[1]-raw[1])>.7||!this.geo.fits(landed)||!this.geo.clear(landed,raw,0,false))continue;
          const id=anchor(landed,true);goals.push({id,target,at:landed});if(dist(landed,raw)<.05)break;
        }
        await checkpoint();
      }
      if(!goals.length)return null;
      for(const t of transitions){
        const a=xyz(t.entrance?.pos),b=xyz(t.exit?.pos);if(!a||!b)continue;
        const landing=p=>this.geo.ground([p[0],p[1]+.15,p[2]],0,2.8);
        const pa=landing(a),pb=landing(b);if(!pa||!pb)continue;
        const enter=anchor(pa,true),exit=anchor(pb);portals.push({from:pa,to:pb,enter,exit});
        link(enter,exit,{kind:'portal',points:[pa,pb],cost:.05});
      }
      // An admissible heuristic includes shortcuts through every directed portal.
      const tails=portals.map(p=>Math.min(...goals.map(g=>dist(p.to,g.at))));
      for(let pass=0;pass<portals.length;pass++)for(let i=0;i<portals.length;i++)for(let j=0;j<portals.length;j++)tails[i]=Math.min(tails[i],dist(portals[i].to,portals[j].from)+.05+tails[j]);
      const heuristic=p=>Math.min(...goals.map(g=>dist(p,g.at)),...portals.map((t,i)=>dist(p,t.from)+.05+tails[i]));
      const finish=new Map(goals.map(g=>[g.id,g])),heap=new Heap(),best=new Map([[start,0]]),parent=new Map([[start,{from:-1,edges:[]}]]);
      heap.push({id:start,cost:0,score:heuristic(at(start))});let answer=null,count=0;
      const relax=(from,to,cost,edges)=>{if(cost>=(best.get(to)??Infinity)-1e-8)return;best.set(to,cost);parent.set(to,{from,edges});heap.push({id:to,cost,score:cost+heuristic(at(to))});};
      while(heap.size){
        const cur=heap.pop();if(cur.cost!==best.get(cur.id))continue;
        if(finish.has(cur.id)){answer={id:cur.id,goal:finish.get(cur.id),cost:cur.cost};break;}
        for(const e of extra.get(cur.id)||[])relax(cur.id,e.to,cur.cost+e.edge.cost,[e.edge]);
        if(cur.id>=base){
          // Start, goals and portal pins are true graph vertices: no detour through an arbitrary room centroid.
          for(const n of anchors){
            if(n.id===cur.id||cur.cost+dist(at(cur.id),n.at)>=(best.get(n.id)??Infinity))continue;
            const edge=this.connect(at(cur.id),n.at);if(edge)relax(cur.id,n.id,cur.cost+edge.cost,[edge]);
            if(++count%16===0)await checkpoint();
          }
        }else for(const id of this.neighbours(cur.id)){
          const lower=cur.cost+dist(at(cur.id),at(id));if(lower>=(best.get(id)??Infinity))continue;
          const e=this.edge(cur.id,id);if(e)relax(cur.id,id,cur.cost+e.cost,[e]);if(++count%24===0)await checkpoint();
        }
      }
      if(!answer)return null;
      let id=answer.id;const path=[];
      while(id!==-1){const p=parent.get(id);if(!p)return null;path.unshift(...p.edges);id=p.from;}
      const points=[],kinds=[];let transition=null;
      for(const e of path){
        if(e.kind==='portal'){transition={from:e.points[0],to:e.points[1]};break;}
        for(const p of e.points)if(!points.length||dist(points.at(-1),p)>.005){points.push(p);kinds.push(e.kind);}
      }
      return {target:answer.goal.target,points,kinds,transition,distance:answer.cost,stats:{nodes:this.nodes.length,edges:this.edges.size,tested:this.tested}};
    }
  }

  // Stable static revisions: query stamps and moving action buckets never invalidate profiles.
  const revisions=new WeakMap();
  function revision(col,actions){
    const source=col?.source||col;if(!source?._buckets)return 0;
    const ignored=new Set([...actions?.objects?.values?.()||[]].filter(o=>o.kind==='door'||o.kind==='action').map(o=>o.key)),rows=[];
    for(const [key,b]of source._buckets)if(!ignored.has(key))rows.push([key,b,b.tris.length,b.parts]);
    for(const o of actions?.objects?.values?.()||[])if(o.kind==='action'&&o.cpu&&o.base)rows.push([o.key,o.cpu,o.base,o.translation?.x,o.translation?.y,o.translation?.z,o.rotation?.x,o.rotation?.y,o.rotation?.z]);
    const old=revisions.get(source),same=old&&rows.length===old.rows.length&&rows.every((r,i)=>r.every((v,k)=>v===old.rows[i][k]));
    if(same)return old.value;const value=(old?.value||0)+1;revisions.set(source,{rows,value});return value;
  }
  function client({WorkerCtor=root.Worker,checkpoint=async()=>{}}={}){
    let worker=null,graph=null,graphReady=null,seq=0,closed=false,inputCache=null,latestRoute=0;const pending=new Map();
    const fail=err=>{for(const p of pending.values())p.reject(err);pending.clear();worker?.terminate();worker=null;};
    if(WorkerCtor&&url)try{
      worker=new WorkerCtor(url);worker.onmessage=e=>{const p=pending.get(e.data.id);if(!p)return;pending.delete(e.data.id);e.data.error?p.reject(Object.assign(new Error(e.data.error),{cancelled:!!e.data.cancelled})):p.resolve(e.data.result);};worker.onerror=()=>fail(new Error('Фоновый расчёт маршрута прерван.'));
    }catch{}
    const send=(op,data)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});worker.postMessage({id,op,...data});});
    return {
      async build(input){
        if(closed)throw Object.assign(new Error('cancelled'),{cancelled:true});inputCache=input;
        if(worker)try{return await send('build',{input});}catch(e){if(closed)throw e;fail(e);}
        const own=graph=new Graph();graphReady=own.build(input,async()=>{if(closed)throw Object.assign(new Error('cancelled'),{cancelled:true});await checkpoint();});await graphReady;return {nodes:own.nodes.length};
      },
      async route(from,targets,transitions){
        const mine=++latestRoute;
        if(closed)throw Object.assign(new Error('cancelled'),{cancelled:true});
        if(worker)try{return await send('route',{from,targets,transitions});}catch(e){if(closed||e.cancelled)throw e;fail(e);}
        if(!graph){graph=new Graph();graphReady=graph.build(inputCache,checkpoint);}
        if(graphReady)await graphReady;
        if(closed||mine!==latestRoute)throw Object.assign(new Error('cancelled'),{cancelled:true});
        return graph.route(from,targets,transitions,async()=>{if(closed||mine!==latestRoute)throw Object.assign(new Error('cancelled'),{cancelled:true});await checkpoint();});
      },
      dispose(){closed=true;fail(Object.assign(new Error('cancelled'),{cancelled:true}));graph=null;graphReady=null;inputCache=null;}
    };
  }
  function ribbon(points,half=.055){
    const out=[];
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],run=Math.hypot(dx,dz);
      if(Math.hypot(run,dy)<.001)continue;
      const sides=run<.001?[[half,0],[0,half]]:[[-dz/run*half,dx/run*half]];
      for(const [x,z]of sides){
        const p=[a[0]+x,a[1]+.045,a[2]+z],q=[b[0]+x,b[1]+.045,b[2]+z],r=[b[0]-x,b[1]+.045,b[2]-z],s=[a[0]-x,a[1]+.045,a[2]-z];
        out.push(...p,...q,...r,...p,...r,...s);
      }
    }
    return out;
  }
  const api={VERSION,Geometry,Graph,profile,snapshot,revision,client,dist,length,xyz,ribbon};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else if(!root.document&&typeof root.postMessage==='function'){
    let graph=null,queue=Promise.resolve(),latest=0;
    const checkpoint=async()=>{if(performance.now()-(checkpoint.at||0)>8){await new Promise(r=>setTimeout(r,0));checkpoint.at=performance.now();}};
    root.onmessage=e=>{const m=e.data;if(m.op==='route')latest=m.id;queue=queue.then(async()=>{try{
      let result;if(m.op==='build'){graph=new Graph();await graph.build(m.input,checkpoint);result={nodes:graph.nodes.length};}
      else if(m.op==='route'){if(!graph)throw new Error('Профили данжа ещё не готовы.');const pause=async()=>{if(latest!==m.id)throw Object.assign(new Error('cancelled'),{cancelled:true});await checkpoint();};await pause();result=await graph.route(m.from,m.targets,m.transitions,pause);}
      else throw new Error('Неизвестный запрос навигации.');root.postMessage({id:m.id,result});
    }catch(err){root.postMessage({id:m.id,error:err.message,cancelled:!!err.cancelled});}});};
  }else root.__dfoDungeonGraph=api;
})(globalThis);
