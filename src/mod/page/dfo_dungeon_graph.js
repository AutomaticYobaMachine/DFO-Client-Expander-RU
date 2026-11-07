(function dungeonGraphModule(root) {
  'use strict';
  // The mod's own words, in the install's language (page/dfo_ui_text.js; English without the translation).
  const T = (key, params) => (root.__dfoUi ? root.__dfoUi.t(key, params) : key);
  // Player navigation only. No NavClient, NPC navmesh, world mutations or action dispatch.
  const BODY=Object.freeze({height:1.8,radius:.35,step:.505,slope:70,floorUp:.56,floorDown:1.24,probes:Object.freeze([.54,1.05,1.55,1.72]),centres:Object.freeze([.35,.9,1.45])});
  const VERSION = 1, CELL = 2, STEP = BODY.step, RADIUS = BODY.radius;
  const url = root.document?.currentScript?.src;
  const dist = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  const lerp = (a,b,t) => a.map((x,k)=>x+(b[k]-x)*t);
  const length = ps => ps.slice(1).reduce((s,p,i)=>s+dist(ps[i],p),0);
  const xyz = p => p?.length>=3&&[p[0],p[1],p[2]].every(Number.isFinite)?[p[0],p[1],p[2]]:null;
  const cell = (x,z,size=CELL) => `${Math.floor(x/size)},${Math.floor(z/size)}`;
  const spatial = (p,size) => `${Math.floor(p[0]/size)},${Math.floor(p[1]/size)},${Math.floor(p[2]/size)}`;
  const put = (map,key,value) => {let a=map.get(key);if(!a)map.set(key,a=[]);a.push(value);};
  // The standing motor resolves three overlapping radius-.35 spheres. Sweep their
  // volumes, not a handful of rays: a thin rail can sit between every ray height.
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  function faceOf(a,b,c){
    const e=b.map((x,k)=>x-a[k]),f=c.map((x,k)=>x-a[k]),n=[e[1]*f[2]-e[2]*f[1],e[2]*f[0]-e[0]*f[2],e[0]*f[1]-e[1]*f[0]],nl=Math.hypot(...n);
    if(nl<1e-8)return null;
    return{a,b,c,e,f,n:n.map(x=>x/nl),ny:Math.abs(n[1])/nl,ee:dot(e,e),ef:dot(e,f),ff:dot(f,f),lo:a.map((x,k)=>Math.min(x,b[k],c[k])),hi:a.map((x,k)=>Math.max(x,b[k],c[k]))};
  }
  function pointTriangle2(p,t){
    const v=p.map((x,k)=>x-t.a[k]),d1=dot(t.e,v),d2=dot(t.f,v),d3=d1-t.ee,d4=d2-t.ef,d5=d1-t.ef,d6=d2-t.ff;
    let u=0,w=0;
    if(d1<=0&&d2<=0){}
    else if(d3>=0&&d4<=d3)u=1;
    else if(d6>=0&&d5<=d6)w=1;
    else{const vc=d1*d4-d3*d2,vb=d5*d2-d1*d6,va=d3*d6-d5*d4;
      if(vc<=0&&d1>=0&&d3<=0)u=d1/(d1-d3);
      else if(vb<=0&&d2>=0&&d6<=0)w=d2/(d2-d6);
      else if(va<=0&&d4-d3>=0&&d5-d6>=0){w=(d4-d3)/(d4-d3+d5-d6);u=1-w;}
      else{const den=1/(va+vb+vc);u=vb*den;w=vc*den;}
    }
    return (v[0]-u*t.e[0]-w*t.f[0])**2+(v[1]-u*t.e[1]-w*t.f[1])**2+(v[2]-u*t.e[2]-w*t.f[2])**2;
  }
  function segments2(a,b,c,d){
    const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=d[0]-c[0],vy=d[1]-c[1],vz=d[2]-c[2],wx=a[0]-c[0],wy=a[1]-c[1],wz=a[2]-c[2];
    const aa=ux*ux+uy*uy+uz*uz,bb=ux*vx+uy*vy+uz*vz,cc=vx*vx+vy*vy+vz*vz,dd=ux*wx+uy*wy+uz*wz,ee=vx*wx+vy*wy+vz*wz,den=aa*cc-bb*bb;
    let s=aa<1e-18?0:den>1e-18?Math.max(0,Math.min(1,(bb*ee-cc*dd)/den)):0,t=cc>1e-18?(bb*s+ee)/cc:0;
    if(t<0){t=0;s=aa>1e-18?Math.max(0,Math.min(1,-dd/aa)):0;}
    else if(t>1){t=1;s=aa>1e-18?Math.max(0,Math.min(1,(bb-dd)/aa)):0;}
    return(wx+s*ux-t*vx)**2+(wy+s*uy-t*vy)**2+(wz+s*uz-t*vz)**2;
  }
  function sphereSweep(a,b,t,r){
    const s0=(a[0]-t.a[0])*t.n[0]+(a[1]-t.a[1])*t.n[1]+(a[2]-t.a[2])*t.n[2],s1=(b[0]-t.a[0])*t.n[0]+(b[1]-t.a[1])*t.n[1]+(b[2]-t.a[2])*t.n[2];
    if(Math.min(s0,s1)>r||Math.max(s0,s1)<-r)return false;
    if(s0*s1<=0&&Math.abs(s0-s1)>1e-12){
      const at=s0/(s0-s1),v=a.map((x,k)=>x+(b[k]-x)*at-t.a[k]),ve=dot(v,t.e),vf=dot(v,t.f),den=t.ee*t.ff-t.ef*t.ef,u=(ve*t.ff-vf*t.ef)/den,w=(vf*t.ee-ve*t.ef)/den;
      if(u>=0&&w>=0&&u+w<=1)return true;
    }
    const r2=r*r;
    return pointTriangle2(a,t)<r2||pointTriangle2(b,t)<r2||segments2(a,b,t.a,t.b)<r2||segments2(a,b,t.b,t.c)<r2||segments2(a,b,t.c,t.a)<r2;
  }
  function stepSupport(t,a,b){
    return t.hi[1]<=Math.max(a[1],b[1])+STEP||t.ny>=.34&&[a,b].every(v=>t.a[1]-(t.n[0]*(v[0]-t.a[0])+t.n[2]*(v[2]-t.a[2]))/t.n[1]<=v[1]+STEP);
  }
  function ceilingAcross(t,a,b,lift){
    if(t.ny<.34||lift<=0)return false;
    // A step retry cannot lift a body THROUGH an overhead floor. Intersect
    // floor-like faces with the continuous vertical curtain over the centre
    // path, above the allowed step, including ceilings between floor samples.
    const dx=b[0]-a[0],dz=b[2]-a[2],run2=dx*dx+dz*dz,low=STEP+.01,high=BODY.height+lift-.005;
    if(run2<1e-14){const y=t.a[1]-(t.n[0]*(a[0]-t.a[0])+t.n[2]*(a[2]-t.a[2]))/t.n[1];return y>a[1]+low&&y<a[1]+high&&pointTriangle2([a[0],y,a[2]],t)<1e-12;}
    const vertices=[t.a,t.b,t.c],side=vertices.map(p=>(p[0]-a[0])*dz-(p[2]-a[2])*dx),hits=[];
    for(let i=0;i<3;i++){const j=(i+1)%3;if(side[i]*side[j]>0||Math.abs(side[i]-side[j])<1e-14)continue;const v=lerp(vertices[i],vertices[j],side[i]/(side[i]-side[j])),s=((v[0]-a[0])*dx+(v[2]-a[2])*dz)/run2;hits.push([s,v[1]-a[1]-(b[1]-a[1])*s]);}
    if(hits.length<2)return false;
    let enter=0,leave=1;const p=hits[0],q=hits[1];
    for(const [k,min,max]of [[0,0,1],[1,low,high]]){const v=q[k]-p[k];if(Math.abs(v)<1e-14){if(p[k]<min||p[k]>max)return false;}else{const u=(min-p[k])/v,w=(max-p[k])/v;enter=Math.max(enter,Math.min(u,w));leave=Math.min(leave,Math.max(u,w));if(enter>leave)return false;}}
    return true;
  }
  const liveFaces=new WeakMap();
  // Use the physical collider's existing read-only triangle filing for short live
  // connectors. No second full-dungeon index or AI data is built on the UI thread.
  function bodyBlocked(col,a,b,skip=[],grounded=false,lift=0){
    const omitted=new Set(skip),radius=RADIUS-.005;
    for(const [key,bucket]of col._bodyBuckets||col._buckets||[]){
      if(omitted.has(key))continue;
      const shift=bucket.t?.()||[0,0,0],rot=bucket.r?.(),local=p=>{const v=p.map((x,k)=>x-shift[k]);return rot?[dot(rot.slice(0,3),v),dot(rot.slice(3,6),v),dot(rot.slice(6,9),v)]:v;};
      const paths=BODY.centres.map(y=>[local([a[0],a[1]+y+lift,a[2]]),local([b[0],b[1]+y+lift,b[2]])]),ends=paths.flat();
      if(grounded&&lift>0)for(const p of [a,b])ends.push(local([p[0],p[1]+STEP+.01,p[2]]));
      const lo=[0,1,2].map(k=>Math.min(...ends.map(p=>p[k]))-radius),hi=[0,1,2].map(k=>Math.max(...ends.map(p=>p[k]))+radius);
      if(bucket.min&&bucket.max&&lo.some((x,k)=>x>bucket.max[k]||hi[k]<bucket.min[k]))continue;
      const seen=new Set(),pa=local(a),pb=local(b),test=id=>{
        if(seen.has(id)||bucket.sight?.[id])return false;seen.add(id);const tri=bucket.tris[id];if(!tri)return false;
        let t=liveFaces.get(tri);if(!t){t=faceOf(...tri.slice(0,3));if(!t)return false;liveFaces.set(tri,t);}
        if(t.hi.some((x,k)=>x<lo[k])||t.lo.some((x,k)=>x>hi[k]))return false;
        if(grounded&&lift>0){const world=rot?faceOf(...[t.a,t.b,t.c].map(p=>[rot[0]*p[0]+rot[3]*p[1]+rot[6]*p[2]+shift[0],rot[1]*p[0]+rot[4]*p[1]+rot[7]*p[2]+shift[1],rot[2]*p[0]+rot[5]*p[1]+rot[8]*p[2]+shift[2]])):null;if(ceilingAcross(world||t,rot?a:pa,rot?b:pb,lift))return true;}
        return paths.some(([p,q],i)=>!(grounded&&i===0&&!rot&&stepSupport(t,pa,pb))&&sphereSweep(p,q,t,radius));
      };
      // Current Collider uses 2 m cells and a numeric X/Z key. Fall back to
      // triangles if an upstream revision changes that filing representation.
      if(bucket.grid&&typeof bucket.grid.keys().next().value==='number'){
        for(let x=Math.floor(lo[0]/2);x<=Math.floor(hi[0]/2);x++)for(let z=Math.floor(lo[2]/2);z<=Math.floor(hi[2]/2);z++)for(const id of bucket.grid.get((x+0x100000)*0x200000+(z+0x100000))||[])if(test(id))return{key,dist:0};
        for(const id of bucket.wide||[])if(test(id))return{key,dist:0};
      }else for(let i=0;i<bucket.tris.length;i++)if(test(i))return{key,dist:0};
    }
    return null;
  }
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
    constructor(data,support=null){this.data=data;this.support=support;this.faces=[];this.grid=new Map();this.wide=[];this.stamp=0;this.climbStarts=new Map();}
    async index(checkpoint){
      const data=this.data;
      for(let i=0;i<data.length;i+=9){
        const a=Array.from(data.subarray(i,i+3)),b=Array.from(data.subarray(i+3,i+6)),c=Array.from(data.subarray(i+6,i+9));
        const face=faceOf(a,b,c);if(!face)continue;const {lo,hi}=face;
        const id=this.faces.length;this.faces.push({...face,support:!!this.support?.[i/9]});
        const x0=Math.floor(lo[0]/CELL),x1=Math.floor(hi[0]/CELL),y0=Math.floor(lo[1]/CELL),y1=Math.floor(hi[1]/CELL),z0=Math.floor(lo[2]/CELL),z1=Math.floor(hi[2]/CELL);
        if((x1-x0+1)*(y1-y0+1)*(z1-z0+1)>1024)this.wide.push(id);
        else for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++)put(this.grid,`${x},${y},${z}`,id);
        if(i%9216===0)await checkpoint();
      }
      this.marks=new Int32Array(this.faces.length);
    }
    ray(o,d,max,support=false,any=false){
      const faces=this.faces,marks=this.marks,stamp=++this.stamp;if(stamp>=0x7ffffffe){marks.fill(0);this.stamp=1;}
      let best=max+.00001,face=null;
      const y0=Math.min(o[1],o[1]+d[1]*max)-.0001,y1=Math.max(o[1],o[1]+d[1]*max)+.0001;
      const x0=Math.min(o[0],o[0]+d[0]*max)-.0001,x1=Math.max(o[0],o[0]+d[0]*max)+.0001,z0=Math.min(o[2],o[2]+d[2]*max)-.0001,z1=Math.max(o[2],o[2]+d[2]*max)+.0001;
      const test=id=>{
        if(marks[id]===stamp)return false;marks[id]=stamp;const t=faces[id];if((t.support&&!support)||t.hi[0]<x0||t.lo[0]>x1||t.hi[1]<y0||t.lo[1]>y1||t.hi[2]<z0||t.lo[2]>z1)return false;
        const px=d[1]*t.f[2]-d[2]*t.f[1],py=d[2]*t.f[0]-d[0]*t.f[2],pz=d[0]*t.f[1]-d[1]*t.f[0],det=t.e[0]*px+t.e[1]*py+t.e[2]*pz;
        if(Math.abs(det)<1e-9)return;
        const vx=o[0]-t.a[0],vy=o[1]-t.a[1],vz=o[2]-t.a[2],inv=1/det,u=(vx*px+vy*py+vz*pz)*inv;if(u<0||u>1)return;
        const qx=vy*t.e[2]-vz*t.e[1],qy=vz*t.e[0]-vx*t.e[2],qz=vx*t.e[1]-vy*t.e[0],w=(d[0]*qx+d[1]*qy+d[2]*qz)*inv;
        if(w<0||u+w>1)return;
        const hit=(t.f[0]*qx+t.f[1]*qy+t.f[2]*qz)*inv;if(hit>.0001&&hit<best){best=hit;face=t;return true;}return false;
      };
      let x=Math.floor(o[0]/CELL),y=Math.floor(o[1]/CELL),z=Math.floor(o[2]/CELL),at=0;
      const sx=d[0]>=0?1:-1,sy=d[1]>=0?1:-1,sz=d[2]>=0?1:-1,dx=Math.abs(d[0])<1e-10?Infinity:CELL/Math.abs(d[0]),dy=Math.abs(d[1])<1e-10?Infinity:CELL/Math.abs(d[1]),dz=Math.abs(d[2])<1e-10?Infinity:CELL/Math.abs(d[2]);
      let tx=dx===Infinity?Infinity:((x+(sx>0?1:0))*CELL-o[0])/d[0],ty=dy===Infinity?Infinity:((y+(sy>0?1:0))*CELL-o[1])/d[1],tz=dz===Infinity?Infinity:((z+(sz>0?1:0))*CELL-o[2])/d[2];
      for(let steps=0;steps<10000&&at<=max&&at<=best;steps++){
        for(const id of this.grid.get(`${x},${y},${z}`)||[])if(test(id)&&any)return{dist:best,face};
        if(tx===Infinity&&ty===Infinity&&tz===Infinity)break;
        if(tx<=ty&&tx<=tz){at=tx;x+=sx;tx+=dx;}else if(ty<=tz){at=ty;y+=sy;ty+=dy;}else{at=tz;z+=sz;tz+=dz;}
      }
      for(const id of this.wide)if(test(id)&&any)return{dist:best,face};
      return face?{dist:best,face}:null;
    }
    blocked(o,d,max){return !!this.ray(o,d,max,false,true);}
    ground(p,up=BODY.floorUp,down=BODY.floorDown){
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
      return this.clear(p,p,lift,true,true);
    }
    bodyClear(a,b,lift,grounded){
        const r=RADIUS-.005,lo=a.map((x,k)=>Math.min(x,b[k])-r),hi=a.map((x,k)=>Math.max(x,b[k])+r);lo[1]+=BODY.centres[0]+lift;hi[1]+=BODY.centres.at(-1)+lift;
        if(grounded&&lift>0)lo[1]=Math.min(lo[1],Math.min(a[1],b[1])+STEP+.01);
        const stamp=++this.stamp;if(stamp>=0x7ffffffe){this.marks.fill(0);this.stamp=1;}
        const paths=BODY.centres.map(y=>[[a[0],a[1]+y+lift,a[2]],[b[0],b[1]+y+lift,b[2]]]);
        const test=id=>{if(this.marks[id]===stamp)return false;this.marks[id]=stamp;const t=this.faces[id];if(t.support||t.hi.some((x,k)=>x<lo[k])||t.lo.some((x,k)=>x>hi[k]))return false;
          if(grounded&&ceilingAcross(t,a,b,lift))return true;
          return paths.some(([p,q],i)=>{
            // The motor's grounded lower sphere stands on slopes and steps up
            // ledges <= STEP. Upper spheres, ceilings and airborne sweeps stay solid.
            if(grounded&&i===0){
              if(stepSupport(t,a,b))return false;
            }
            return sphereSweep(p,q,t,r);
          });};
        for(let x=Math.floor(lo[0]/CELL);x<=Math.floor(hi[0]/CELL);x++)for(let y=Math.floor(lo[1]/CELL);y<=Math.floor(hi[1]/CELL);y++)for(let z=Math.floor(lo[2]/CELL);z<=Math.floor(hi[2]/CELL);z++)for(const id of this.grid.get(`${x},${y},${z}`)||[])if(test(id))return false;
        for(const id of this.wide)if(test(id))return false;
        return true;
    }
    clear(a,b,lift=0,wide=true,grounded=false){
      if(wide){
        if(this.bodyClear(a,b,lift,grounded))return true;
        // Like the motor's step retry, raise the whole capsule (head included),
        // at most one step above the local slope's resting height. Short treads lift a body above its
        // centre's floor; merely ignoring its lower half would miss real rails.
        if(grounded){
          let rest=lift;
          for(const p of [a,b])for(const [x,z]of [[.18,0],[-.18,0],[0,.18],[0,-.18]]){
            const q=this.floor([p[0]+x,p[1],p[2]+z]),rise=q&&Math.abs(q[1]-p[1]);
            if(q&&rise<=STEP)rest=Math.max(rest,RADIUS*(Math.sqrt(1+(rise/.18)**2)-1));
          }
          const top=STEP+rest;
          if(rest>.001)for(let extra=lift+.1;extra<top+.1;extra+=.1)if(this.bodyClear(a,b,Math.min(top,extra),true))return true;
        }
        return false;
      }
      const d=b.map((x,k)=>x-a[k]),len=Math.hypot(...d);if(len<.0001)return true;
      for(let i=0;i<3;i++)d[i]/=len;
      for(const y of BODY.probes){
        const p=a.map((x,k)=>x-d[k]*.002);p[1]+=y+lift;
        if(this.blocked(p,d,len+.004))return false;
      }
      return true;
    }
    walk(a,b){
      if(Math.hypot(a[0]-b[0],a[2]-b[2])+.02<Math.abs(a[1]-b[1])/Math.tan(BODY.slope*Math.PI/180))return null;
      const points=[a],sweeps=[],count=Math.max(1,Math.ceil(dist(a,b)/.18));let prev=a;
      for(let i=1;i<=count;i++){
        const p=this.floor(lerp(a,b,i/count));if(!p||Math.abs(p[1]-prev[1])>STEP)return null;
        const run=Math.hypot(p[0]-prev[0],p[2]-prev[2]),rise=Math.abs(p[1]-prev[1]);
        const lift=run>.01&&rise>.03?Math.min(.45,RADIUS*(Math.sqrt(1+(rise/run)**2)-1)):0;
        // Adjacent straight sweeps with the same capsule lift are one continuous
        // volume. Prove that volume once instead of recasting the same walls at
        // every 18 cm floor sample. Stair corners/lift changes stay separate.
        const last=sweeps.at(-1),v=last&&last.b.map((x,k)=>x-last.a[k]),w=last&&p.map((x,k)=>x-last.b[k]);
        if(last&&Math.abs(last.lift-lift)<1e-8&&Math.hypot(v[1]*w[2]-v[2]*w[1],v[2]*w[0]-v[0]*w[2],v[0]*w[1]-v[1]*w[0])<1e-8)last.b=p;
        else sweeps.push({a:prev,b:p,lift});
        if(points.length>1){const x=points.at(-2),y=points.at(-1),v=y.map((n,k)=>n-x[k]),w=p.map((n,k)=>n-y[k]);
          if(Math.hypot(v[1]*w[2]-v[2]*w[1],v[2]*w[0]-v[0]*w[2],v[0]*w[1]-v[1]*w[0])<.000001)points.pop();}
        points.push(p);prev=p;
      }
      for(const sweep of sweeps)if(!this.clear(sweep.a,sweep.b,sweep.lift,true,true))return null;
      return dist(prev,b)<.12?points:null;
    }
    drop(a,b){
      if(a[1]-b[1]<=STEP||Math.hypot(a[0]-b[0],a[2]-b[2])>1.8)return null;
      // Step out over the lower landing's column, then descend; never cut a floor slab.
      const lip=[b[0],a[1]+.06,b[2]],low=[b[0],b[1]+.06,b[2]];
      const ray=this.ray([lip[0],lip[1]-.02,lip[2]],[0,-1,0],a[1]-b[1]+.12,true);
      if(!ray||Math.abs(lip[1]-.02-ray.dist-b[1])>.15)return null;
      if(!this.clear([a[0],a[1]+.06,a[2]],lip)||!this.clear(lip,low))return null;
      return [a,lip,low,b];
    }
    climb(a,b){
      if(b[1]-a[1]<=STEP||Math.hypot(a[0]-b[0],a[2]-b[2])>1.8)return null;
      const probeY=Math.min(1,(b[1]-a[1])*.5),key=JSON.stringify([a,probeY]);let starts=this.climbStarts.get(key);
      if(!starts){
        starts=[];
        for(let i=0;i<12;i++){
          const ang=i*Math.PI/6,d=[Math.cos(ang),0,Math.sin(ang)],h=this.ray([a[0],a[1]+probeY,a[2]],d,.85);
          if(!h||h.face.ny>.5)continue;
          const wall=[a[0]+d[0]*Math.max(0,h.dist-.37),a[1],a[2]+d[2]*Math.max(0,h.dist-.37)];
          if(this.clear(a,wall))starts.push({d,wall});
        }
        this.climbStarts.set(key,starts);if(this.climbStarts.size>50000)this.climbStarts.delete(this.climbStarts.keys().next().value);
      }
      for(const {d,wall}of starts){
        const top=[wall[0],b[1]+.06,wall[2]];
        if(Math.hypot(top[0]-b[0],top[2]-b[2])>1.5||!this.clear(wall,top)||!this.clear(top,[b[0],b[1]+.06,b[2]]))continue;
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
    if(!col?._buckets)throw new Error(T('nav.graph.noGeometry'));
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
          for(const p of ps.slice(0,256)){const a=p.map((x,i)=>x+origin[i]),b=a.map((x,i)=>x+ends[1].move[i]);channels.push({from:a,to:b,key:o.key});}
        }
      }
      await checkpoint();
    }
    if(!total)throw new Error(T('nav.graph.noSurfaces'));
    if(total>9000000)throw new Error(T('nav.graph.tooLarge'));
    return {parts,total,channels};
  }
  class Graph {
    constructor(){this.nodes=[];this.grid=new Map();this.columns=new Map();this.edges=new Map();this.attachments=new Map();this.channels=[];this.serial=0;this.tested=0;}
    async build(input,checkpoint=async()=>{}){
      const all=new Float32Array(input.total),support=new Uint8Array(input.total/9);let offset=0;
      for(const p of input.parts){for(let i=0;i<p.data.length;i++)all[offset+i]=p.data[i]+p.origin[i%3];if(p.support)support.fill(1,offset/9,(offset+p.data.length)/9);offset+=p.data.length;await checkpoint();}
      this.geo=new Geometry(all,support);await this.geo.index(checkpoint);const seen=new Map();
      const add=(hint,floating=false)=>{
        const p=floating?xyz(hint):this.geo.floor(hint);if(!p||!floating&&Math.abs(p[1]-hint[1])>.55)return -1;
        const key=[Math.round(p[0]*2),Math.round(p[1]*16),Math.round(p[2]*2)].join(',');if(seen.has(key))return seen.get(key);
        if(!this.geo.fits(p))return -1;
        const id=this.nodes.length;seen.set(key,id);this.nodes.push({p,links:new Set(),floating});put(this.grid,spatial(p,3),id);put(this.columns,cell(p[0],p[2],1),id);return id;
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
      const liftLink=(a,b,grounded=false)=>{
        if(a<0||b<0||a===b||this.edges.has(`${a}:${b}`))return;
        const p=this.nodes[a].p,q=this.nodes[b].p;if(!this.geo.clear(p,q,0,true,grounded))return;
        this.nodes[a].links.add(b);this.nodes[b].links.add(a);
        this.edges.set(`${a}:${b}`,{kind:'lift',points:[p,q],cost:dist(p,q)});
        this.edges.set(`${b}:${a}`,{kind:'lift',points:[q,p],cost:dist(p,q)});
      };
      for(const c of input.channels||[]){
        const a=add(c.from),b=add(c.to);if(a<0||b<0||a===b)continue;
        const pins=[a,b],dy=c.to[1]-c.from[1];
        if(Math.abs(dy)>STEP&&Math.hypot(c.to[0]-c.from[0],c.to[2]-c.from[2])<.01){
          const levels=new Map();
          for(let x=Math.floor(c.from[0]-1.05);x<=Math.floor(c.from[0]+1.05);x++)for(let z=Math.floor(c.from[2]-1.05);z<=Math.floor(c.from[2]+1.05);z++)
            for(const id of this.columns.get(`${x},${z}`)||[]){
              const n=this.nodes[id],t=(n.p[1]-c.from[1])/dy,d=Math.hypot(n.p[0]-c.from[0],n.p[2]-c.from[2]);
              if(n.floating||t<=.01||t>=.99||d>1.05)continue;
              const key=Math.round(n.p[1]*8);let group=levels.get(key);if(!group)levels.set(key,group=[]);group.push({id,d});
            }
          // A lift may pass several real side landings, not just its two stops.
          // Only real supported landings get a bridge to its actual trajectory.
          for(const group of levels.values())for(const {id}of group.sort((a,b)=>a.d-b.d).slice(0,4)){
            const p=this.nodes[id].p,pin=add([c.from[0],p[1],c.from[2]],true);if(pin<0)continue;
            liftLink(id,pin,true);if(this.edges.has(`${id}:${pin}`)||id===pin)pins.push(pin);
          }
        }
        const ordered=[...new Set(pins)].sort((a,b)=>this.nodes[a].p[1]-this.nodes[b].p[1]);
        for(let i=1;i<ordered.length;i++)liftLink(ordered[i-1],ordered[i]);
        this.channels.push({...c,pins:ordered});
        await checkpoint();
      }
      this.serial++;return this;
    }
    near(p,r=6,cap=32,vertical=false){
      const map=vertical?this.columns:this.grid,size=vertical?1:3,found=[],limit=r*r;
      const take=key=>{for(const id of map.get(key)||[]){const q=this.nodes[id].p,dx=q[0]-p[0],dy=q[1]-p[1],dz=q[2]-p[2],squared=dx*dx+dz*dz+(vertical?0:dy*dy);if(squared<=limit)found.push({id,d:Math.sqrt(squared)+(vertical?Math.abs(dy)*.015:0)});}};
      for(let x=Math.floor((p[0]-r)/size);x<=Math.floor((p[0]+r)/size);x++)for(let z=Math.floor((p[2]-r)/size);z<=Math.floor((p[2]+r)/size);z++){
        if(vertical)take(`${x},${z}`);
        else for(let y=Math.floor((p[1]-r)/size);y<=Math.floor((p[1]+r)/size);y++)take(`${x},${y},${z}`);
      }
      found.sort((a,b)=>a.d-b.d);return found.slice(0,cap).map(x=>x.id);
    }
    verticalNear(p,r=1.8){
      // Choose by landing height first. A dozen points on the current floor
      // must not hide every exit of a deep shaft or its neighbouring shafts.
      const levels=new Map();
      for(let x=Math.floor(p[0]-r);x<=Math.floor(p[0]+r);x++)for(let z=Math.floor(p[2]-r);z<=Math.floor(p[2]+r);z++)
        for(const id of this.columns.get(`${x},${z}`)||[]){
          const q=this.nodes[id].p,d=Math.hypot(q[0]-p[0],q[2]-p[2]),dy=q[1]-p[1];if(d>r||Math.abs(dy)<.7)continue;
          const level=Math.round(q[1]*2);let group=levels.get(level);if(!group)levels.set(level,group=[]);group.push({id,d,dy});
        }
      const selected=[];
      for(const sign of [-1,1]){
        const ordered=[...levels.values()].filter(a=>a[0].dy*sign>0).sort((a,b)=>Math.abs(a[0].dy)-Math.abs(b[0].dy));
        for(const group of ordered.slice(0,2))selected.push(...group.sort((a,b)=>a.d-b.d).slice(0,2).map(v=>v.id));
      }
      return selected;
    }
    neighbours(id){
      const n=this.nodes[id];if(n.neighbours)return n.neighbours;
      const nearby=this.near(n.p,6,200),rays=new Map();
      for(const i of nearby){const p=this.nodes[i].p,dx=p[0]-n.p[0],dz=p[2]-n.p[2],d=Math.hypot(dx,dz);if(Math.abs(p[1]-n.p[1])>.7+d*2.75)continue;
        const sector=Math.round(Math.atan2(dz,dx)*4/Math.PI),old=rays.get(sector);if(!old||old.d<d)rays.set(sector,{i,d});}
      return n.neighbours=[...new Set([...n.links,...nearby.slice(0,10),...[...rays.values()].map(x=>x.i),...this.verticalNear(n.p)])].filter(i=>i!==id);
    }
    edge(a,b){
      const key=`${a}:${b}`;if(this.edges.has(key))return this.edges.get(key);
      const p=this.nodes[a].p,q=this.nodes[b].p,result=this.connect(p,q);this.edges.set(key,result);this.tested++;
      // A multi-block search may prove more than 100k edges. A fixed smaller
      // FIFO cache evicts its own beginning before the next identical query,
      // causing every repeat to recompute everything. Bound it by graph size.
      const limit=Math.max(101000,Math.min(600000,this.nodes.length*8));
      if(this.edges.size>limit){let left=1000;for(const [k,e]of this.edges)if(e?.kind!=='lift'){this.edges.delete(k);if(!--left)break;}}
      return result;
    }
    connect(a,b){
      let points=this.geo.walk(a,b),kind='walk';
      if(!points){points=this.geo.climb(a,b);kind='climb';}
      if(!points){points=this.geo.drop(a,b);kind='drop';}
      return points?{points,kind,cost:length(points)}:null;
    }
    attach(p,goal=false,riding=null){
      const floor=this.geo.floor(p),at=!riding&&floor&&Math.abs(floor[1]-p[1])<.7?floor:p,links=[];
      const key=JSON.stringify([at,goal,riding]),old=this.attachments.get(key);if(old)return old;
      const ids=[...new Set([...this.near(at,8,36),...this.verticalNear(at)])];
      for(const id of ids){const q=this.nodes[id].p,edge=goal?this.connect(q,at):this.connect(at,q);if(edge)links.push({id,...edge});}
      if(riding&&!goal){
        const candidates=[];
        for(const c of this.channels){
          if(c.key!==riding)continue;
          const v=c.to.map((x,k)=>x-c.from[k]),len2=dot(v,v),t=len2?dot(at.map((x,k)=>x-c.from[k]),v)/len2:-1;
          if(t<0||t>1)continue;const on=lerp(c.from,c.to,t),off=dist(on,at);if(off<=1.8)candidates.push({c,on,off});
        }
        for(const {c,on}of candidates.sort((a,b)=>a.off-b.off).slice(0,8)){
          if(!this.geo.clear(at,on))continue;
          for(const id of c.pins){const q=this.nodes[id].p;if(!this.geo.clear(on,q))continue;const points=[at,on,q];links.push({id,kind:'lift',points,cost:length(points)});}
        }
      }
      const result={at,links};this.attachments.set(key,result);if(this.attachments.size>512)this.attachments.delete(this.attachments.keys().next().value);return result;
    }
    portalEntries(t){
      const raw=xyz(t.entrance?.pos);if(!raw)return [];
      const activation=t.activation,box=activation?.box,min=xyz(box?.min),max=xyz(box?.max);
      if(!min||!max){const p=this.geo.ground([raw[0],raw[1]+.15,raw[2]],0,2.8);return p&&this.geo.fits(p)?[p]:[];}
      const centre=min.map((x,k)=>(x+max[k])/2),hints=[],margin=RADIUS+.006;
      const own=[],mesh=activation.surfaces;
      for(let i=0;mesh&&i+8<mesh.length;i+=9){const t=faceOf(Array.from(mesh.slice(i,i+3)),Array.from(mesh.slice(i+3,i+6)),Array.from(mesh.slice(i+6,i+9)));if(t)own.push(t);}
      const xs=[centre[0],min[0]+(max[0]-min[0])*.22,min[0]+(max[0]-min[0])*.78];
      const zs=[centre[2],min[2]+(max[2]-min[2])*.22,min[2]+(max[2]-min[2])*.78];
      if(activation.kind==='on')for(const x of xs)for(const z of zs)hints.push([x,max[1],z]);
      else{
        hints.push(raw);
        for(const z of zs)for(const x of [min[0]-margin,max[0]+margin])hints.push([x,raw[1],z]);
        for(const x of xs)for(const z of [min[2]-margin,max[2]+margin])hints.push([x,raw[1],z]);
      }
      for(const face of own){
        const hub=face.a.map((x,k)=>(x+face.b[k]+face.c[k])/3);
        if(activation.kind==='on'&&face.ny>=.34){
          hints.push(hub);
          for(const p of [face.a,face.b,face.c])hints.push(lerp(p,hub,.2));
        }else if(activation.kind==='into'&&face.ny<.5){
          const run=Math.hypot(face.n[0],face.n[2]),off=margin/(run||1);
          for(const p of [hub,...[face.a,face.b,face.c].map(p=>lerp(p,hub,.3))])for(const s of [-1,1])
            hints.push([p[0]+face.n[0]*off*s,p[1]-BODY.height/2,p[2]+face.n[2]*off*s]);
        }
      }
      const result=[],seen=new Set();
      for(const hint of hints){
        const p=this.geo.ground(hint,.6,3.4);if(!p||!this.geo.fits(p))continue;
        if(activation.kind==='on'&&(own.length?!own.some(f=>f.ny>=.34&&pointTriangle2(p,f)<.001):Math.abs(p[1]-max[1])>.1))continue;
        if(activation.kind==='into'&&(p[1]+BODY.height<min[1]||p[1]>max[1]+.1))continue;
        if(activation.kind==='into'&&own.length&&!own.some(f=>f.ny<.5&&BODY.centres.some(y=>pointTriangle2([p[0],p[1]+y,p[2]],f)<(RADIUS+.015)**2)))continue;
        const key=p.map(x=>Math.round(x*100)).join(',');if(seen.has(key))continue;seen.add(key);result.push(p);
        if(result.length>=32)break;
      }
      return result;
    }
    async route(from,targets,transitions=[],checkpoint=async()=>{},options={}){
      from=xyz(from);targets=targets.map(t=>({...t,at:xyz(t.at)})).filter(t=>t.at);if(!from||!targets.length)return null;
      const anchors=[],extra=new Map(),goals=[],portals=[],base=this.nodes.length;
      const at=id=>id<base?this.nodes[id].p:anchors[id-base].at;
      const link=(a,b,edge)=>put(extra,a,{to:b,edge});
      const anchor=(p,goal=false,riding=null)=>{
        const id=base+anchors.length,attached=this.attach(p,goal,riding);anchors.push({id,at:attached.at});
        for(const e of attached.links)goal?link(e.id,id,e):link(id,e.id,e);
        return id;
      };
      const start=anchor(from,false,options.riding);
      for(const target of targets){
        const raw=target.at,reach=target.kind==='quest'&&Number.isFinite(target.reach)?Math.max(0,Math.min(2.25,target.reach)):0,approaches=[raw];
        for(const radius of reach?[.65,1.05,1.6]:[.65,1.05])for(let n=0;n<8;n++)approaches.push([raw[0]+Math.cos(n*Math.PI/4)*radius,raw[1],raw[2]+Math.sin(n*Math.PI/4)*radius]);
        for(const p of approaches){
          const landed=reach?this.geo.ground(p,BODY.floorUp,reach+BODY.floorUp)??this.geo.floor(p):this.geo.floor(p);
          if(!landed||Math.abs(landed[1]-raw[1])>(reach||.7)||!this.geo.fits(landed))continue;
          if(reach){
            const eye=[landed[0],landed[1]+BODY.height-.2,landed[2]],end=[raw[0],raw[1]+.06,raw[2]],delta=end.map((x,i)=>x-eye[i]),d=Math.hypot(...delta);
            if(dist(landed,raw)>reach||d>.0001&&this.geo.ray(eye,delta.map(x=>x/d),d))continue;
          }else if(!this.geo.clear(landed,raw,0,false))continue;
          const id=anchor(landed,true);goals.push({id,target,at:landed});if(!reach&&dist(landed,raw)<.05)break;
        }
        await checkpoint();
      }
      if(!goals.length)return null;
      for(const t of transitions){
        const b=xyz(t.exit?.pos);if(!b)continue;
        const entrances=this.portalEntries(t),pb=this.geo.ground([b[0],b[1]+.15,b[2]],0,128);
        if(!entrances.length||!pb||!this.geo.fits(pb))continue;
        const exit=anchor(pb),contact=t.activation?.kind==='on'||t.activation?.kind==='into';
        portals.push({from:entrances,to:pb,exit});
        for(const pa of entrances){const enter=anchor(pa,true);link(enter,exit,{kind:'portal',points:[pa,pb],cost:.05,contact});}
        await checkpoint();
      }
      // An admissible heuristic includes shortcuts through every directed portal.
      const tails=portals.map(p=>Math.min(...goals.map(g=>dist(p.to,g.at))));
      const approach=(p,t)=>Math.min(...t.from.map(a=>dist(p,a)));
      for(let pass=0;pass<portals.length;pass++)for(let i=0;i<portals.length;i++)for(let j=0;j<portals.length;j++)tails[i]=Math.min(tails[i],approach(portals[i].to,portals[j])+.05+tails[j]);
      const heuristic=p=>Math.min(...goals.map(g=>dist(p,g.at)),...portals.map((t,i)=>approach(p,t)+.05+tails[i]));
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
        if(e.kind==='portal'){transition={from:e.points[0],to:e.points[1],contact:!!e.contact};break;}
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
      worker=new WorkerCtor(url);worker.onmessage=e=>{const p=pending.get(e.data.id);if(!p)return;pending.delete(e.data.id);e.data.error?p.reject(Object.assign(new Error(e.data.error),{cancelled:!!e.data.cancelled})):p.resolve(e.data.result);};worker.onerror=()=>fail(new Error(T('nav.graph.cancelled')));
    }catch{}
    const send=(op,data)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});worker.postMessage({id,op,...data});});
    return {
      async build(input){
        if(closed)throw Object.assign(new Error('cancelled'),{cancelled:true});inputCache=input;
        if(worker)try{return await send('build',{input});}catch(e){if(closed)throw e;fail(e);}
        const own=graph=new Graph();graphReady=own.build(input,async()=>{if(closed)throw Object.assign(new Error('cancelled'),{cancelled:true});await checkpoint();});await graphReady;return {nodes:own.nodes.length};
      },
      async route(from,targets,transitions,options={}){
        const mine=++latestRoute;
        if(closed)throw Object.assign(new Error('cancelled'),{cancelled:true});
        if(worker)try{return await send('route',{from,targets,transitions,options});}catch(e){if(closed||e.cancelled)throw e;fail(e);}
        if(!graph){graph=new Graph();graphReady=graph.build(inputCache,checkpoint);}
        if(graphReady)await graphReady;
        if(closed||mine!==latestRoute)throw Object.assign(new Error('cancelled'),{cancelled:true});
        return graph.route(from,targets,transitions,async()=>{if(closed||mine!==latestRoute)throw Object.assign(new Error('cancelled'),{cancelled:true});await checkpoint();},options);
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
  const api={VERSION,BODY,Geometry,Graph,profile,snapshot,revision,client,dist,length,xyz,ribbon,bodyBlocked};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else if(!root.document&&typeof root.postMessage==='function'){
    let graph=null,queue=Promise.resolve(),latest=0;
    const checkpoint=async()=>{if(performance.now()-(checkpoint.at||0)>8){await new Promise(r=>setTimeout(r,0));checkpoint.at=performance.now();}};
    root.onmessage=e=>{const m=e.data;if(m.op==='route')latest=m.id;queue=queue.then(async()=>{try{
      let result;if(m.op==='build'){graph=new Graph();await graph.build(m.input,checkpoint);result={nodes:graph.nodes.length};}
      else if(m.op==='route'){if(!graph)throw new Error(T('nav.graph.notReady'));const pause=async()=>{if(latest!==m.id)throw Object.assign(new Error('cancelled'),{cancelled:true});await checkpoint();};await pause();result=await graph.route(m.from,m.targets,m.transitions,pause,m.options);}
      else throw new Error(T('nav.graph.badRequest'));root.postMessage({id:m.id,result});
    }catch(err){root.postMessage({id:m.id,error:err.message,cancelled:!!err.cancelled});}});};
  }else root.__dfoDungeonGraph=api;
})(globalThis);
