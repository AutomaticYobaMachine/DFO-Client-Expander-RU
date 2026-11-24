(function dungeonGraphModule(root) {
  'use strict';
  // The mod's own words, in the install's language (page/dfo_ui_text.js; English without the translation).
  const T = (key, params) => (root.__dfoUi ? root.__dfoUi.t(key, params) : key);
  // Player navigation only. No NavClient, NPC navmesh, world mutations or action dispatch.
  const BODY=Object.freeze({height:1.8,radius:.35,step:.505,slope:70,floorUp:.56,floorDown:1.24,probes:Object.freeze([.54,1.05,1.55,1.72]),centres:Object.freeze([.35,.9,1.45])});
  const VERSION = 1, CELL = 2, STEP = BODY.step, RADIUS = BODY.radius;
  const url = root.document?.currentScript?.src;
  const dist = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  const lerp = (a,b,t) => [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
  const length = ps => {let s=0;for(let i=1;i<ps.length;i++)s+=dist(ps[i-1],ps[i]);return s;};
  const xyz = p => p?.length>=3&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Number.isFinite(p[2])?[p[0],p[1],p[2]]:null;
  const key2 = (x,z) => (x>=-0x80000&&x<0x80000&&z>=-0x80000&&z<0x80000)?(x+0x80000)*0x100000+(z+0x80000):`${x},${z}`;
  const key3 = (x,y,z) => (x>=-0x10000&&x<0x10000&&y>=-0x10000&&y<0x10000&&z>=-0x10000&&z<0x10000)?((x+0x10000)*0x20000+(y+0x10000))*0x20000+(z+0x10000):`${x},${y},${z}`;
  const cell = (x,z,size=CELL) => key2(Math.floor(x/size),Math.floor(z/size));
  const spatial = (p,size) => key3(Math.floor(p[0]/size),Math.floor(p[1]/size),Math.floor(p[2]/size));
  const put = (map,key,value) => {let a=map.get(key);if(!a)map.set(key,a=[]);a.push(value);};
  // The standing motor resolves three overlapping radius-.35 spheres. Sweep their
  // volumes, not a handful of rays: a thin rail can sit between every ray height.
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  function faceOf(a,b,c){
    const ex=b[0]-a[0],ey=b[1]-a[1],ez=b[2]-a[2],fx=c[0]-a[0],fy=c[1]-a[1],fz=c[2]-a[2];
    const nx=ey*fz-ez*fy,ny=ez*fx-ex*fz,nz=ex*fy-ey*fx,nl=Math.hypot(nx,ny,nz);
    if(nl<1e-8)return null;
    const inv=1/nl;
    return{
      a,b,c,e:[ex,ey,ez],f:[fx,fy,fz],n:[nx*inv,ny*inv,nz*inv],ny:Math.abs(ny)*inv,
      ee:ex*ex+ey*ey+ez*ez,ef:ex*fx+ey*fy+ez*fz,ff:fx*fx+fy*fy+fz*fz,
      lo:[Math.min(a[0],b[0],c[0]),Math.min(a[1],b[1],c[1]),Math.min(a[2],b[2],c[2])],
      hi:[Math.max(a[0],b[0],c[0]),Math.max(a[1],b[1],c[1]),Math.max(a[2],b[2],c[2])]
    };
  }
  function pointTriangle2XYZ(px,py,pz,t){
    const ta=t.a,te=t.e,tf=t.f,vx=px-ta[0],vy=py-ta[1],vz=pz-ta[2];
    const d1=te[0]*vx+te[1]*vy+te[2]*vz,d2=tf[0]*vx+tf[1]*vy+tf[2]*vz,d3=d1-t.ee,d4=d2-t.ef,d5=d1-t.ef,d6=d2-t.ff;
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
    const rx=vx-u*te[0]-w*tf[0],ry=vy-u*te[1]-w*tf[1],rz=vz-u*te[2]-w*tf[2];
    return rx*rx+ry*ry+rz*rz;
  }
  const pointTriangle2=(p,t)=>pointTriangle2XYZ(p[0],p[1],p[2],t);
  function segments2(a,b,c,d){
    const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=d[0]-c[0],vy=d[1]-c[1],vz=d[2]-c[2],wx=a[0]-c[0],wy=a[1]-c[1],wz=a[2]-c[2];
    const aa=ux*ux+uy*uy+uz*uz,bb=ux*vx+uy*vy+uz*vz,cc=vx*vx+vy*vy+vz*vz,dd=ux*wx+uy*wy+uz*wz,ee=vx*wx+vy*wy+vz*wz,den=aa*cc-bb*bb;
    let s=aa<1e-18?0:den>1e-18?Math.max(0,Math.min(1,(bb*ee-cc*dd)/den)):0,t=cc>1e-18?(bb*s+ee)/cc:0;
    if(t<0){t=0;s=aa>1e-18?Math.max(0,Math.min(1,-dd/aa)):0;}
    else if(t>1){t=1;s=aa>1e-18?Math.max(0,Math.min(1,(bb-dd)/aa)):0;}
    const rx=wx+s*ux-t*vx,ry=wy+s*uy-t*vy,rz=wz+s*uz-t*vz;
    return rx*rx+ry*ry+rz*rz;
  }
  function sphereSweep(a,b,t,r){
    const ta=t.a,tn=t.n;
    const s0=(a[0]-ta[0])*tn[0]+(a[1]-ta[1])*tn[1]+(a[2]-ta[2])*tn[2],s1=(b[0]-ta[0])*tn[0]+(b[1]-ta[1])*tn[1]+(b[2]-ta[2])*tn[2];
    if((s0<s1?s0:s1)>r||(s0>s1?s0:s1)<-r)return false;
    if(s0*s1<=0&&Math.abs(s0-s1)>1e-12){
      const at=s0/(s0-s1),vx=a[0]+(b[0]-a[0])*at-ta[0],vy=a[1]+(b[1]-a[1])*at-ta[1],vz=a[2]+(b[2]-a[2])*at-ta[2];
      const te=t.e,tf=t.f,ve=vx*te[0]+vy*te[1]+vz*te[2],vf=vx*tf[0]+vy*tf[1]+vz*tf[2],den=t.ee*t.ff-t.ef*t.ef;
      const u=(ve*t.ff-vf*t.ef)/den,w=(vf*t.ee-ve*t.ef)/den;
      if(u>=0&&w>=0&&u+w<=1)return true;
    }
    const r2=r*r;
    return pointTriangle2XYZ(a[0],a[1],a[2],t)<r2||pointTriangle2XYZ(b[0],b[1],b[2],t)<r2||segments2(a,b,ta,t.b)<r2||segments2(a,b,t.b,t.c)<r2||segments2(a,b,t.c,ta)<r2;
  }
  function stepSupport(t,a,b){
    const maxY=a[1]>b[1]?a[1]:b[1];
    if(t.hi[1]<=maxY+STEP)return true;
    if(t.ny<.34)return false;
    const nx=t.n[0],ny=t.n[1],nz=t.n[2],ax=t.a[0],ay=t.a[1],az=t.a[2];
    return ay-(nx*(a[0]-ax)+nz*(a[2]-az))/ny<=a[1]+STEP&&ay-(nx*(b[0]-ax)+nz*(b[2]-az))/ny<=b[1]+STEP;
  }
  function ceilingAcross(t,a,b,lift){
    if(t.ny<.34||lift<=0)return false;
    // A step retry cannot lift a body THROUGH an overhead floor. Intersect
    // floor-like faces with the continuous vertical curtain over the centre
    // path, above the allowed step, including ceilings between floor samples.
    const dx=b[0]-a[0],dz=b[2]-a[2],run2=dx*dx+dz*dz,low=STEP+.01,high=BODY.height+lift-.005;
    if(run2<1e-14){const y=t.a[1]-(t.n[0]*(a[0]-t.a[0])+t.n[2]*(a[2]-t.a[2]))/t.n[1];return y>a[1]+low&&y<a[1]+high&&pointTriangle2XYZ(a[0],y,a[2],t)<1e-12;}
    const v0=t.a,v1=t.b,v2=t.c,s0=(v0[0]-a[0])*dz-(v0[2]-a[2])*dx,s1=(v1[0]-a[0])*dz-(v1[2]-a[2])*dx,s2=(v2[0]-a[0])*dz-(v2[2]-a[2])*dx;
    let h0s=0,h0y=0,h1s=0,h1y=0,hc=0;
    const dy=b[1]-a[1];
    const edge=(p,q,sp,sq)=>{
      if(sp*sq>0||Math.abs(sp-sq)<1e-14)return;
      const f=sp/(sp-sq),vx=p[0]+(q[0]-p[0])*f,vy=p[1]+(q[1]-p[1])*f,vz=p[2]+(q[2]-p[2])*f;
      const s=((vx-a[0])*dx+(vz-a[2])*dz)/run2,ry=vy-a[1]-dy*s;
      if(hc===0){h0s=s;h0y=ry;hc=1;}else if(hc===1){h1s=s;h1y=ry;hc=2;}
    };
    edge(v0,v1,s0,s1);edge(v1,v2,s1,s2);if(hc<2)edge(v2,v0,s2,s0);
    if(hc<2)return false;
    let enter=0,leave=1;
    const ds=h1s-h0s;
    if(Math.abs(ds)<1e-14){if(h0s<0||h0s>1)return false;}
    else{const u=(0-h0s)/ds,w=(1-h0s)/ds;enter=Math.max(enter,u<w?u:w);leave=Math.min(leave,u>w?u:w);if(enter>leave)return false;}
    const dhy=h1y-h0y;
    if(Math.abs(dhy)<1e-14){if(h0y<low||h0y>high)return false;}
    else{const u=(low-h0y)/dhy,w=(high-h0y)/dhy;enter=Math.max(enter,u<w?u:w);leave=Math.min(leave,u>w?u:w);if(enter>leave)return false;}
    return true;
  }
  const liveFaces=new WeakMap(),bbSeen=new Set();
  const bbPa=[0,0,0],bbPb=[0,0,0],bbP0=[0,0,0],bbQ0=[0,0,0],bbP1=[0,0,0],bbQ1=[0,0,0],bbP2=[0,0,0],bbQ2=[0,0,0];
  // Use the physical collider's existing read-only triangle filing for short live
  // connectors. No second full-dungeon index or AI data is built on the UI thread.
  function bodyBlocked(col,a,b,skip=[],grounded=false,lift=0){
    const omitted=skip instanceof Set?skip:(skip&&skip.length?new Set(skip):null),radius=RADIUS-.005;
    const ax=a[0],ay=a[1],az=a[2],bx=b[0],by=b[1],bz=b[2];
    const c0=BODY.centres[0]+lift,c1=BODY.centres[1]+lift,c2=BODY.centres[2]+lift;
    const minABY=ay<by?ay:by,maxABY=ay>by?ay:by;
    const wMinX=(ax<bx?ax:bx)-radius,wMaxX=(ax>bx?ax:bx)+radius;
    const wMinZ=(az<bz?az:bz)-radius,wMaxZ=(az>bz?az:bz)+radius;
    let wMinY=minABY+c0-radius;
    const wMaxY=maxABY+c2+radius;
    if(grounded&&lift>0){const gy=minABY+STEP+.01-radius;if(gy<wMinY)wMinY=gy;}
    for(const [key,bucket]of col._bodyBuckets||col._buckets||[]){
      if(omitted?.has(key))continue;
      const shift=bucket.t?.(),rot=bucket.r?.();
      const sx=shift?shift[0]:0,sy=shift?shift[1]:0,sz=shift?shift[2]:0;
      let lo0,lo1,lo2,hi0,hi1,hi2;
      if(!rot){
        lo0=wMinX-sx;hi0=wMaxX-sx;lo1=wMinY-sy;hi1=wMaxY-sy;lo2=wMinZ-sz;hi2=wMaxZ-sz;
        if(bucket.min&&bucket.max&&(lo0>bucket.max[0]||hi0<bucket.min[0]||lo1>bucket.max[1]||hi1<bucket.min[1]||lo2>bucket.max[2]||hi2<bucket.min[2]))continue;
        bbPa[0]=ax-sx;bbPa[1]=ay-sy;bbPa[2]=az-sz;
        bbPb[0]=bx-sx;bbPb[1]=by-sy;bbPb[2]=bz-sz;
        bbP0[0]=bbPa[0];bbP0[1]=bbPa[1]+c0;bbP0[2]=bbPa[2];
        bbQ0[0]=bbPb[0];bbQ0[1]=bbPb[1]+c0;bbQ0[2]=bbPb[2];
        bbP1[0]=bbPa[0];bbP1[1]=bbPa[1]+c1;bbP1[2]=bbPa[2];
        bbQ1[0]=bbPb[0];bbQ1[1]=bbPb[1]+c1;bbQ1[2]=bbPb[2];
        bbP2[0]=bbPa[0];bbP2[1]=bbPa[1]+c2;bbP2[2]=bbPa[2];
        bbQ2[0]=bbPb[0];bbQ2[1]=bbPb[1]+c2;bbQ2[2]=bbPb[2];
      }else{
        const r0=rot[0],r1=rot[1],r2=rot[2],r3=rot[3],r4=rot[4],r5=rot[5],r6=rot[6],r7=rot[7],r8=rot[8];
        const xform=(out,px,py,pz)=>{
          const vx=px-sx,vy=py-sy,vz=pz-sz;
          out[0]=r0*vx+r1*vy+r2*vz;out[1]=r3*vx+r4*vy+r5*vz;out[2]=r6*vx+r7*vy+r8*vz;
        };
        xform(bbP0,ax,ay+c0,az);xform(bbQ0,bx,by+c0,bz);
        xform(bbP1,ax,ay+c1,az);xform(bbQ1,bx,by+c1,bz);
        xform(bbP2,ax,ay+c2,az);xform(bbQ2,bx,by+c2,bz);
        lo0=Math.min(bbP0[0],bbQ0[0],bbP1[0],bbQ1[0],bbP2[0],bbQ2[0]);
        hi0=Math.max(bbP0[0],bbQ0[0],bbP1[0],bbQ1[0],bbP2[0],bbQ2[0]);
        lo1=Math.min(bbP0[1],bbQ0[1],bbP1[1],bbQ1[1],bbP2[1],bbQ2[1]);
        hi1=Math.max(bbP0[1],bbQ0[1],bbP1[1],bbQ1[1],bbP2[1],bbQ2[1]);
        lo2=Math.min(bbP0[2],bbQ0[2],bbP1[2],bbQ1[2],bbP2[2],bbQ2[2]);
        hi2=Math.max(bbP0[2],bbQ0[2],bbP1[2],bbQ1[2],bbP2[2],bbQ2[2]);
        if(grounded&&lift>0){
          xform(bbPa,ax,ay+STEP+.01,az);xform(bbPb,bx,by+STEP+.01,bz);
          lo0=Math.min(lo0,bbPa[0],bbPb[0]);hi0=Math.max(hi0,bbPa[0],bbPb[0]);
          lo1=Math.min(lo1,bbPa[1],bbPb[1]);hi1=Math.max(hi1,bbPa[1],bbPb[1]);
          lo2=Math.min(lo2,bbPa[2],bbPb[2]);hi2=Math.max(hi2,bbPa[2],bbPb[2]);
        }
        lo0-=radius;hi0+=radius;lo1-=radius;hi1+=radius;lo2-=radius;hi2+=radius;
        if(bucket.min&&bucket.max&&(lo0>bucket.max[0]||hi0<bucket.min[0]||lo1>bucket.max[1]||hi1<bucket.min[1]||lo2>bucket.max[2]||hi2<bucket.min[2]))continue;
        xform(bbPa,ax,ay,az);xform(bbPb,bx,by,bz);
      }
      bbSeen.clear();
      const tris=bucket.tris,sight=bucket.sight;
      const test=id=>{
        if(bbSeen.has(id)||sight?.[id])return false;bbSeen.add(id);const tri=tris[id];if(!tri)return false;
        let t=liveFaces.get(tri);if(!t){t=faceOf(tri[0],tri[1],tri[2]);if(!t)return false;liveFaces.set(tri,t);}
        if(t.hi[0]<lo0||t.hi[1]<lo1||t.hi[2]<lo2||t.lo[0]>hi0||t.lo[1]>hi1||t.lo[2]>hi2)return false;
        if(grounded&&lift>0){
          let face=t;
          if(rot){
            const ta=t.a,tb=t.b,tc=t.c;
            face=faceOf(
              [rot[0]*ta[0]+rot[3]*ta[1]+rot[6]*ta[2]+sx,rot[1]*ta[0]+rot[4]*ta[1]+rot[7]*ta[2]+sy,rot[2]*ta[0]+rot[5]*ta[1]+rot[8]*ta[2]+sz],
              [rot[0]*tb[0]+rot[3]*tb[1]+rot[6]*tb[2]+sx,rot[1]*tb[0]+rot[4]*tb[1]+rot[7]*tb[2]+sy,rot[2]*tb[0]+rot[5]*tb[1]+rot[8]*tb[2]+sz],
              [rot[0]*tc[0]+rot[3]*tc[1]+rot[6]*tc[2]+sx,rot[1]*tc[0]+rot[4]*tc[1]+rot[7]*tc[2]+sy,rot[2]*tc[0]+rot[5]*tc[1]+rot[8]*tc[2]+sz]
            )||t;
          }
          if(ceilingAcross(face,rot?a:bbPa,rot?b:bbPb,lift))return true;
        }
        if(!(grounded&&!rot&&stepSupport(t,bbPa,bbPb))&&sphereSweep(bbP0,bbQ0,t,radius))return true;
        if(sphereSweep(bbP1,bbQ1,t,radius))return true;
        return sphereSweep(bbP2,bbQ2,t,radius);
      };
      // Current Collider uses 2 m cells and a numeric X/Z key. Fall back to
      // triangles if an upstream revision changes that filing representation.
      if(bucket.grid&&bucket.grid.size>0&&typeof bucket.grid.keys().next().value==='number'){
        const gx0=Math.floor(lo0/2),gx1=Math.floor(hi0/2),gz0=Math.floor(lo2/2),gz1=Math.floor(hi2/2);
        for(let x=gx0;x<=gx1;x++)for(let z=gz0;z<=gz1;z++){
          const cellIds=bucket.grid.get((x+0x100000)*0x200000+(z+0x100000));
          if(cellIds)for(let k=0;k<cellIds.length;k++)if(test(cellIds[k]))return{key,dist:0};
        }
        const wide=bucket.wide;
        if(wide)for(let k=0;k<wide.length;k++)if(test(wide[k]))return{key,dist:0};
      }else for(let i=0;i<tris.length;i++)if(test(i))return{key,dist:0};
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
  const CLIMB_DIRS=Array.from({length:12},(_,i)=>Object.freeze([Math.cos(i*Math.PI/6),0,Math.sin(i*Math.PI/6)]));
  const bcP0=[0,0,0],bcQ0=[0,0,0],bcP1=[0,0,0],bcQ1=[0,0,0],bcP2=[0,0,0],bcQ2=[0,0,0];
  class Geometry {
    constructor(data,support=null){this.data=data;this.support=support;this.faces=[];this.grid=new Map();this.wide=[];this.stamp=0;this.climbStarts=new Map();}
    async index(checkpoint){
      const data=this.data;
      for(let i=0;i<data.length;i+=9){
        const a=[data[i],data[i+1],data[i+2]],b=[data[i+3],data[i+4],data[i+5]],c=[data[i+6],data[i+7],data[i+8]];
        const face=faceOf(a,b,c);if(!face)continue;const {lo,hi}=face;
        const id=this.faces.length;face.support=!!this.support?.[i/9];this.faces.push(face);
        const x0=Math.floor(lo[0]/CELL),x1=Math.floor(hi[0]/CELL),y0=Math.floor(lo[1]/CELL),y1=Math.floor(hi[1]/CELL),z0=Math.floor(lo[2]/CELL),z1=Math.floor(hi[2]/CELL);
        if((x1-x0+1)*(y1-y0+1)*(z1-z0+1)>1024)this.wide.push(id);
        else for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++)put(this.grid,key3(x,y,z),id);
        if(i%9216===0)await checkpoint();
      }
      this.marks=new Int32Array(this.faces.length);
    }
    rayXYZ(ox,oy,oz,dx,dy,dz,max,support=false,any=false){
      const faces=this.faces,marks=this.marks;
      if(++this.stamp>=0x7ffffffe){marks.fill(0);this.stamp=1;}
      const stamp=this.stamp;
      let best=max+.00001,face=null;
      const ex=ox+dx*max,ey=oy+dy*max,ez=oz+dz*max;
      const x0=(ox<ex?ox:ex)-.0001,x1=(ox>ex?ox:ex)+.0001;
      const y0=(oy<ey?oy:ey)-.0001,y1=(oy>ey?oy:ey)+.0001;
      const z0=(oz<ez?oz:ez)-.0001,z1=(oz>ez?oz:ez)+.0001;
      let x=Math.floor(ox/CELL),y=Math.floor(oy/CELL),z=Math.floor(oz/CELL),at=0;
      const sx=dx>=0?1:-1,sy=dy>=0?1:-1,sz=dz>=0?1:-1;
      const adx=Math.abs(dx),ady=Math.abs(dy),adz=Math.abs(dz);
      const dtx=adx<1e-10?Infinity:CELL/adx,dty=ady<1e-10?Infinity:CELL/ady,dtz=adz<1e-10?Infinity:CELL/adz;
      let tx=dtx===Infinity?Infinity:((x+(sx>0?1:0))*CELL-ox)/dx;
      let ty=dty===Infinity?Infinity:((y+(sy>0?1:0))*CELL-oy)/dy;
      let tz=dtz===Infinity?Infinity:((z+(sz>0?1:0))*CELL-oz)/dz;
      const grid=this.grid;
      for(let steps=0;steps<10000&&at<=max&&at<=best;steps++){
        const ids=grid.get(key3(x,y,z));
        if(ids){
          for(let k=0;k<ids.length;k++){
            const id=ids[k];if(marks[id]===stamp)continue;marks[id]=stamp;
            const t=faces[id];if((t.support&&!support)||t.hi[0]<x0||t.lo[0]>x1||t.hi[1]<y0||t.lo[1]>y1||t.hi[2]<z0||t.lo[2]>z1)continue;
            const tf=t.f,te=t.e,ta=t.a;
            const px=dy*tf[2]-dz*tf[1],py=dz*tf[0]-dx*tf[2],pz=dx*tf[1]-dy*tf[0],det=te[0]*px+te[1]*py+te[2]*pz;
            if(Math.abs(det)<1e-9)continue;
            const vx=ox-ta[0],vy=oy-ta[1],vz=oz-ta[2],inv=1/det,u=(vx*px+vy*py+vz*pz)*inv;if(u<-1e-5||u>1+1e-5)continue;
            const qx=vy*te[2]-vz*te[1],qy=vz*te[0]-vx*te[2],qz=vx*te[1]-vy*te[0],w=(dx*qx+dy*qy+dz*qz)*inv;
            if(w<-1e-5||u+w>1+1e-5)continue;
            const hit=(tf[0]*qx+tf[1]*qy+tf[2]*qz)*inv;
            if(hit>.0001&&hit<best){best=hit;face=t;if(any)return{dist:best,face};}
          }
        }
        if(tx===Infinity&&ty===Infinity&&tz===Infinity)break;
        if(tx<=ty&&tx<=tz){at=tx;x+=sx;tx+=dtx;}else if(ty<=tz){at=ty;y+=sy;ty+=dty;}else{at=tz;z+=sz;tz+=dtz;}
      }
      const wide=this.wide;
      for(let k=0;k<wide.length;k++){
        const id=wide[k];if(marks[id]===stamp)continue;marks[id]=stamp;
        const t=faces[id];if((t.support&&!support)||t.hi[0]<x0||t.lo[0]>x1||t.hi[1]<y0||t.lo[1]>y1||t.hi[2]<z0||t.lo[2]>z1)continue;
        const tf=t.f,te=t.e,ta=t.a;
        const px=dy*tf[2]-dz*tf[1],py=dz*tf[0]-dx*tf[2],pz=dx*tf[1]-dy*tf[0],det=te[0]*px+te[1]*py+te[2]*pz;
        if(Math.abs(det)<1e-9)continue;
        const vx=ox-ta[0],vy=oy-ta[1],vz=oz-ta[2],inv=1/det,u=(vx*px+vy*py+vz*pz)*inv;if(u<-1e-5||u>1+1e-5)continue;
        const qx=vy*te[2]-vz*te[1],qy=vz*te[0]-vx*te[2],qz=vx*te[1]-vy*te[0],w=(dx*qx+dy*qy+dz*qz)*inv;
        if(w<-1e-5||u+w>1+1e-5)continue;
        const hit=(tf[0]*qx+tf[1]*qy+tf[2]*qz)*inv;
        if(hit>.0001&&hit<best){best=hit;face=t;if(any)return{dist:best,face};}
      }
      return face?{dist:best,face}:null;
    }
    ray(o,d,max,support=false,any=false){return this.rayXYZ(o[0],o[1],o[2],d[0],d[1],d[2],max,support,any);}
    blocked(o,d,max){return !!this.rayXYZ(o[0],o[1],o[2],d[0],d[1],d[2],max,false,true);}
    ground(p,up=BODY.floorUp,down=BODY.floorDown){
      const h=this.rayXYZ(p[0],p[1]+up,p[2],0,-1,0,down,true,false);
      return h&&h.face.ny>=.34?[p[0],p[1]+up-h.dist,p[2]]:null;
    }
    floor(p){
      let at=this.ground(p);
      if(!at){
        const px=p[0],py=p[1],pz=p[2];
        let ha=this.rayXYZ(px-.1,py+BODY.floorUp,pz,0,-1,0,BODY.floorDown,true,false);
        let hb=ha&&ha.face.ny>=.34?this.rayXYZ(px+.1,py+BODY.floorUp,pz,0,-1,0,BODY.floorDown,true,false):null;
        if(ha&&hb&&hb.face.ny>=.34){
          const ya=py+BODY.floorUp-ha.dist,yb=py+BODY.floorUp-hb.dist;
          if(Math.abs(ya-yb)<=STEP)return [px,(ya+yb)*.5,pz];
        }
        ha=this.rayXYZ(px,py+BODY.floorUp,pz-.1,0,-1,0,BODY.floorDown,true,false);
        hb=ha&&ha.face.ny>=.34?this.rayXYZ(px,py+BODY.floorUp,pz+.1,0,-1,0,BODY.floorDown,true,false):null;
        if(ha&&hb&&hb.face.ny>=.34){
          const ya=py+BODY.floorUp-ha.dist,yb=py+BODY.floorUp-hb.dist;
          if(Math.abs(ya-yb)<=STEP)return [px,(ya+yb)*.5,pz];
        }
      }
      return at;
    }
    fits(p,lift=0){
      return this.clear(p,p,lift,true,true);
    }
    bodyClear(a,b,lift,grounded){
      const r=RADIUS-.005,ax=a[0],ay=a[1],az=a[2],bx=b[0],by=b[1],bz=b[2];
      const c0=BODY.centres[0]+lift,c1=BODY.centres[1]+lift,c2=BODY.centres[2]+lift;
      const minY=ay<by?ay:by,maxY=ay>by?ay:by;
      const lo0=(ax<bx?ax:bx)-r,hi0=(ax>bx?ax:bx)+r;
      let lo1=minY+c0-r;const hi1=maxY+c2+r;
      const lo2=(az<bz?az:bz)-r,hi2=(az>bz?az:bz)+r;
      if(grounded&&lift>0){const gy=minY+STEP+.01;if(gy<lo1)lo1=gy;}
      const marks=this.marks,faces=this.faces;
      if(++this.stamp>=0x7ffffffe){marks.fill(0);this.stamp=1;}
      const stamp=this.stamp;
      bcP0[0]=ax;bcP0[1]=ay+c0;bcP0[2]=az;bcQ0[0]=bx;bcQ0[1]=by+c0;bcQ0[2]=bz;
      bcP1[0]=ax;bcP1[1]=ay+c1;bcP1[2]=az;bcQ1[0]=bx;bcQ1[1]=by+c1;bcQ1[2]=bz;
      bcP2[0]=ax;bcP2[1]=ay+c2;bcP2[2]=az;bcQ2[0]=bx;bcQ2[1]=by+c2;bcQ2[2]=bz;
      const grid=this.grid;
      const x0=Math.floor(lo0/CELL),x1=Math.floor(hi0/CELL),y0=Math.floor(lo1/CELL),y1=Math.floor(hi1/CELL),z0=Math.floor(lo2/CELL),z1=Math.floor(hi2/CELL);
      for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++){
        const ids=grid.get(key3(x,y,z));if(!ids)continue;
        for(let k=0;k<ids.length;k++){
          const id=ids[k];if(marks[id]===stamp)continue;marks[id]=stamp;
          const t=faces[id];if(t.support||t.hi[0]<lo0||t.hi[1]<lo1||t.hi[2]<lo2||t.lo[0]>hi0||t.lo[1]>hi1||t.lo[2]>hi2)continue;
          if(grounded&&ceilingAcross(t,a,b,lift))return false;
          if(!(grounded&&stepSupport(t,a,b))&&sphereSweep(bcP0,bcQ0,t,r))return false;
          if(sphereSweep(bcP1,bcQ1,t,r))return false;
          if(sphereSweep(bcP2,bcQ2,t,r))return false;
        }
      }
      const wide=this.wide;
      for(let k=0;k<wide.length;k++){
        const id=wide[k];if(marks[id]===stamp)continue;marks[id]=stamp;
        const t=faces[id];if(t.support||t.hi[0]<lo0||t.hi[1]<lo1||t.hi[2]<lo2||t.lo[0]>hi0||t.lo[1]>hi1||t.lo[2]>hi2)continue;
        if(grounded&&ceilingAcross(t,a,b,lift))return false;
        if(!(grounded&&stepSupport(t,a,b))&&sphereSweep(bcP0,bcQ0,t,r))return false;
        if(sphereSweep(bcP1,bcQ1,t,r))return false;
        if(sphereSweep(bcP2,bcQ2,t,r))return false;
      }
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
          for(let pi=0;pi<2;pi++){
            const p=pi===0?a:b;
            for(let oi=0;oi<4;oi++){
              const ox=oi===0?.18:oi===1?-.18:0,oz=oi===2?.18:oi===3?-.18:0;
              const q=this.floor([p[0]+ox,p[1],p[2]+oz]),rise=q&&Math.abs(q[1]-p[1]);
              if(q&&rise<=STEP)rest=Math.max(rest,RADIUS*(Math.sqrt(1+(rise/.18)**2)-1));
            }
          }
          const top=STEP+rest;
          if(rest>.001)for(let extra=lift+.1;extra<top+.1;extra+=.1)if(this.bodyClear(a,b,Math.min(top,extra),true))return true;
        }
        return false;
      }
      const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],len=Math.hypot(dx,dy,dz);if(len<.0001)return true;
      const inv=1/len,ux=dx*inv,uy=dy*inv,uz=dz*inv,max=len+.004;
      const sx=a[0]-ux*.002,sy=a[1]-uy*.002+lift,sz=a[2]-uz*.002;
      for(let i=0;i<BODY.probes.length;i++){
        if(this.rayXYZ(sx,sy+BODY.probes[i],sz,ux,uy,uz,max,false,true))return false;
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
        const last=sweeps.length?sweeps[sweeps.length-1]:null;
        if(last&&Math.abs(last.lift-lift)<1e-8){
          const vx=last.b[0]-last.a[0],vy=last.b[1]-last.a[1],vz=last.b[2]-last.a[2];
          const wx=p[0]-last.b[0],wy=p[1]-last.b[1],wz=p[2]-last.b[2];
          if(Math.hypot(vy*wz-vz*wy,vz*wx-vx*wz,vx*wy-vy*wx)<1e-8)last.b=p;
          else sweeps.push({a:prev,b:p,lift});
        }else sweeps.push({a:prev,b:p,lift});
        if(points.length>1){
          const x=points[points.length-2],y=points[points.length-1];
          const vx=y[0]-x[0],vy=y[1]-x[1],vz=y[2]-x[2],wx=p[0]-y[0],wy=p[1]-y[1],wz=p[2]-y[2];
          if(Math.hypot(vy*wz-vz*wy,vz*wx-vx*wz,vx*wy-vy*wx)<.000001)points.pop();
        }
        points.push(p);prev=p;
      }
      for(let i=0;i<sweeps.length;i++)if(!this.clear(sweeps[i].a,sweeps[i].b,sweeps[i].lift,true,true))return null;
      return dist(prev,b)<.12?points:null;
    }
    drop(a,b){
      if(a[1]-b[1]<=STEP||Math.hypot(a[0]-b[0],a[2]-b[2])>1.8)return null;
      // Step out over the lower landing's column, then descend; never cut a floor slab.
      const lip=[b[0],a[1]+.06,b[2]],low=[b[0],b[1]+.06,b[2]];
      const ray=this.rayXYZ(lip[0],lip[1]-.02,lip[2],0,-1,0,a[1]-b[1]+.12,true,false);
      if(!ray||Math.abs(lip[1]-.02-ray.dist-b[1])>.15)return null;
      if(!this.clear([a[0],a[1]+.06,a[2]],lip)||!this.clear(lip,low))return null;
      return [a,lip,low,b];
    }
    climb(a,b){
      if(b[1]-a[1]<=STEP||Math.hypot(a[0]-b[0],a[2]-b[2])>1.8)return null;
      const probeY=Math.min(1,(b[1]-a[1])*.5),key=`${a[0]},${a[1]},${a[2]},${probeY}`;let starts=this.climbStarts.get(key);
      if(!starts){
        starts=[];
        for(let i=0;i<12;i++){
          const d=CLIMB_DIRS[i],h=this.rayXYZ(a[0],a[1]+probeY,a[2],d[0],0,d[2],1.45,false,false);
          if(!h||h.face.ny>.5)continue;
          const off=Math.max(0,h.dist-.37),wall=[a[0]+d[0]*off,a[1],a[2]+d[2]*off];
          if(this.clear(a,wall))starts.push({d,wall});
        }
        this.climbStarts.set(key,starts);if(this.climbStarts.size>50000)this.climbStarts.delete(this.climbStarts.keys().next().value);
      }
      for(let i=0;i<starts.length;i++){
        const {d,wall}=starts[i],top=[wall[0],b[1]+.06,wall[2]];
        if(Math.hypot(top[0]-b[0],top[2]-b[2])>1.5||!this.clear(wall,top)||!this.clear(top,[b[0],b[1]+.06,b[2]]))continue;
        let continuous=true;
        for(let y=a[1]+.6;y<b[1]-.08;y+=.45){
          const hit=this.rayXYZ(wall[0],y,wall[2],d[0],0,d[2],.65,false,false);if(!hit||hit.face.ny>.5){continuous=false;break;}
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
  const CONTROLS=new Set([61027,61028,74037,61032]),deckCache=new WeakMap(),roleCache=new WeakMap();
  function flatDeckStats(cpu,m){
    let flatArea=0,wallArea=0,minY=Infinity,maxY=-Infinity,fMinX=Infinity,fMaxX=-Infinity,fMinZ=Infinity,fMaxZ=-Infinity;
    const pos=cpu.positions,idx=cpu.indices;
    const m0=m[0],m1=m[1],m2=m[2],m4=m[4],m5=m[5],m6=m[6],m8=m[8],m9=m[9],m10=m[10],m12=m[12],m13=m[13],m14=m[14];
    for(let k=0;k<idx.length;k+=3){
      const i0=idx[k]*3,i1=idx[k+1]*3,i2=idx[k+2]*3;
      const a0=pos[i0],a1=pos[i0+1],a2=pos[i0+2];
      const b0=pos[i1],b1=pos[i1+1],b2=pos[i1+2];
      const c0=pos[i2],c1=pos[i2+1],c2=pos[i2+2];
      const x0=m0*a0+m4*a1+m8*a2+m12,y0=m1*a0+m5*a1+m9*a2+m13,z0=m2*a0+m6*a1+m10*a2+m14;
      const x1=m0*b0+m4*b1+m8*b2+m12,y1=m1*b0+m5*b1+m9*b2+m13,z1=m2*b0+m6*b1+m10*b2+m14;
      const x2=m0*c0+m4*c1+m8*c2+m12,y2=m1*c0+m5*c1+m9*c2+m13,z2=m2*c0+m6*c1+m10*c2+m14;
      if(y0<minY)minY=y0;if(y0>maxY)maxY=y0;
      if(y1<minY)minY=y1;if(y1>maxY)maxY=y1;
      if(y2<minY)minY=y2;if(y2>maxY)maxY=y2;
      const ux=x1-x0,uy=y1-y0,uz=z1-z0,vx=x2-x0,vy=y2-y0,vz=z2-z0;
      const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,nl=Math.hypot(nx,ny,nz);
      if(nl<1e-8)continue;
      const area=nl*.5,ay=Math.abs(ny)/nl;
      if(ay>=.7){
        flatArea+=area;
        if(x0<fMinX)fMinX=x0;if(x0>fMaxX)fMaxX=x0;if(z0<fMinZ)fMinZ=z0;if(z0>fMaxZ)fMaxZ=z0;
        if(x1<fMinX)fMinX=x1;if(x1>fMaxX)fMaxX=x1;if(z1<fMinZ)fMinZ=z1;if(z1>fMaxZ)fMaxZ=z1;
        if(x2<fMinX)fMinX=x2;if(x2>fMaxX)fMaxX=x2;if(z2<fMinZ)fMinZ=z2;if(z2>fMaxZ)fMaxZ=z2;
      }else if(ay<.34)wallArea+=area;
    }
    return{flatArea,wallArea,height:maxY-minY,flatSpanMin:Number.isFinite(fMinX)?Math.min(fMaxX-fMinX,fMaxZ-fMinZ):0};
  }
  function isLiftAction(o,col){
    if(!o||o.kind!=='action'||CONTROLS.has(Number(o.modelIdNum)))return false;
    if(!o.cpu?.positions||!o.cpu?.indices||!o.base)return false;
    const hasCol=!!col?._buckets,inBuckets=hasCol?col._buckets.has(o.key):false;
    if(hasCol&&!inBuckets)return true;
    const mv=o.translation,rot=o.rotation;
    const rx=rot?.x||0,ry=rot?.y||0,rz=rot?.z||0;
    if(rx*rx+ry*ry+rz*rz>.0001)return false;
    const mx=mv?.x||0,my=mv?.y||0,mz=mv?.z||0;
    const hMove=Math.hypot(mx,mz),vMove=Math.abs(my);
    if(!((vMove>=1.5&&hMove<.25)||(hMove>=1.5&&vMove<.25)))return false;
    let byBase=deckCache.get(o.cpu);if(!byBase)deckCache.set(o.cpu,byBase=new WeakMap());
    let stats=byBase.get(o.base);if(!stats)byBase.set(o.base,stats=flatDeckStats(o.cpu,o.base));
    return stats.flatArea>=4&&stats.flatSpanMin>=1.5&&(inBuckets?stats.height>=.25:(stats.height<.05||stats.height>=.25))&&stats.wallArea<=stats.flatArea*3;
  }
  function actionRole(o,col){
    if(!o)return'static';
    if(o.kind==='door')return'door';
    if(o.kind!=='action')return'static';
    if(CONTROLS.has(Number(o.modelIdNum)))return'control';
    const hasCol=!!col?._buckets,inBuckets=hasCol?col._buckets.has(o.key):false;
    const mv=o.translation,rot=o.rotation;
    const tx=mv?.x||0,ty=mv?.y||0,tz=mv?.z||0,rx=rot?.x||0,ry=rot?.y||0,rz=rot?.z||0;
    const c=roleCache.get(o);
    if(c&&c.hasCol===hasCol&&c.inBuckets===inBuckets&&c.cpu===o.cpu&&c.base===o.base&&c.tx===tx&&c.ty===ty&&c.tz===tz&&c.rx===rx&&c.ry===ry&&c.rz===rz)return c.role;
    const role=isLiftAction(o,col)?'lift':'obstacle';
    roleCache.set(o,{hasCol,inBuckets,cpu:o.cpu,base:o.base,tx,ty,tz,rx,ry,rz,role});
    return role;
  }
  // Snapshot static geometry + live settled obstacles (gates/walls/hatches) while keeping lift decks as fixed potential channels.
  async function snapshot(col,actions,checkpoint=async()=>{}){
    if(!col?._buckets)throw new Error(T('nav.graph.noGeometry'));
    const roles=new Map([...actions?.objects?.values?.()||[]].map(o=>[o.key,actionRole(o,col)]));
    const parts=[],channels=[];let total=0;
    for(const [key,b]of col._buckets){
      const role=roles.get(key);
      if(role==='door'||role==='control'||role==='lift')continue;
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
      if(roles.get(o.key)!=='lift')continue;
      const cpu=o.cpu,m=o.base;
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
            for(const id of this.columns.get(key2(x,z))||[]){
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
      const px=p[0],py=p[1],pz=p[2],nodes=this.nodes;
      const x0=Math.floor((px-r)/size),x1=Math.floor((px+r)/size),z0=Math.floor((pz-r)/size),z1=Math.floor((pz+r)/size);
      if(vertical){
        for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){
          const ids=map.get(key2(x,z));if(!ids)continue;
          for(let k=0;k<ids.length;k++){
            const id=ids[k],q=nodes[id].p,dx=q[0]-px,dy=q[1]-py,dz=q[2]-pz,sq=dx*dx+dz*dz;
            if(sq<=limit)found.push({id,d:Math.sqrt(sq)+Math.abs(dy)*.015});
          }
        }
      }else{
        const y0=Math.floor((py-r)/size),y1=Math.floor((py+r)/size);
        for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++)for(let y=y0;y<=y1;y++){
          const ids=map.get(key3(x,y,z));if(!ids)continue;
          for(let k=0;k<ids.length;k++){
            const id=ids[k],q=nodes[id].p,dx=q[0]-px,dy=q[1]-py,dz=q[2]-pz,sq=dx*dx+dy*dy+dz*dz;
            if(sq<=limit)found.push({id,d:Math.sqrt(sq)});
          }
        }
      }
      found.sort((a,b)=>a.d-b.d);
      const len=Math.min(cap,found.length),out=new Array(len);
      for(let i=0;i<len;i++)out[i]=found[i].id;
      return out;
    }
    verticalNear(p,r=1.8){
      // Choose by landing height first. A dozen points on the current floor
      // must not hide every exit of a deep shaft or its neighbouring shafts.
      const levels=new Map(),px=p[0],py=p[1],pz=p[2],nodes=this.nodes,cols=this.columns;
      for(let x=Math.floor(px-r);x<=Math.floor(px+r);x++)for(let z=Math.floor(pz-r);z<=Math.floor(pz+r);z++){
        const ids=cols.get(key2(x,z));if(!ids)continue;
        for(let k=0;k<ids.length;k++){
          const id=ids[k],q=nodes[id].p,d=Math.hypot(q[0]-px,q[2]-pz),dy=q[1]-py;if(d>r||Math.abs(dy)<.7)continue;
          const level=Math.round(q[1]*2);let group=levels.get(level);if(!group)levels.set(level,group=[]);group.push({id,d,dy});
        }
      }
      const selected=[];
      for(const sign of [-1,1]){
        const ordered=[...levels.values()].filter(a=>a[0].dy*sign>0).sort((a,b)=>Math.abs(a[0].dy)-Math.abs(b[0].dy));
        for(const group of ordered.slice(0,4))selected.push(...group.sort((a,b)=>a.d-b.d).slice(0,2).map(v=>v.id));
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
    hasSight(landed,raw,heights){
      const ex=landed[0],ey=landed[1]+BODY.height-.2,ez=landed[2],rx=raw[0],ry=raw[1],rz=raw[2];
      for(let i=0;i<heights.length;i++){
        const dx=rx-ex,dy=ry+heights[i]-ey,dz=rz-ez,d=Math.hypot(dx,dy,dz);
        if(d<=.0001||!this.geo.rayXYZ(ex,ey,ez,dx/d,dy/d,dz/d,d,false,true))return true;
      }
      return false;
    }
    async route(from,targets,transitions=[],checkpoint=async()=>{},options={}){
      from=xyz(from);targets=targets.map(t=>({...t,at:xyz(t.at)})).filter(t=>t.at);if(!from||!targets.length)return null;
      const anchors=[],extra=new Map(),portals=[],base=this.nodes.length;
      const at=id=>id<base?this.nodes[id].p:anchors[id-base].at;
      const link=(a,b,edge)=>put(extra,a,{to:b,edge});
      const anchor=(p,goal=false,riding=null)=>{
        const id=base+anchors.length,attached=this.attach(p,goal,riding);anchors.push({id,at:attached.at});
        for(const e of attached.links)goal?link(e.id,id,e):link(id,e.id,e);
        return id;
      };
      const start=anchor(from,false,options.riding);
      const goalSeen=new Map();
      let hasInnerSkipped=false;
      const buildGoals=async(pass2=false)=>{
        const out=[];
        for(const target of targets){
          const explicit=target.kind==='quest'&&Number.isFinite(target.reach)?Math.max(0,Math.min(2.25,target.reach)):0;
          const isFallbackFoe=pass2&&target.kind==='quest'&&explicit===0;
          const isInnerReach=pass2&&explicit>0;
          if(pass2&&!isFallbackFoe&&!isInnerReach)continue;
          const raw=target.at,reach=isFallbackFoe?2.45:explicit;
          let gSeen=goalSeen.get(target);if(!gSeen)goalSeen.set(target,gSeen=new Set());
          const heights=isFallbackFoe?[.45,.75,1.05]:[.06,.45,.75,.95];
          const tryPoint=(p,acceptHeights)=>{
            const landed=reach?this.geo.ground(p,BODY.floorUp,reach+BODY.floorUp)??this.geo.floor(p):this.geo.floor(p);
            if(!landed||Math.abs(landed[1]-raw[1])>(reach||.7)||!this.geo.fits(landed))return 0;
            if(reach?(dist(landed,raw)>reach||!this.hasSight(landed,raw,heights)):!this.geo.clear(landed,raw,0,false))return 0;
            const gk=`${Math.round(landed[0]*4)},${Math.round(landed[1]*4)},${Math.round(landed[2]*4)}`;
            if(gSeen.has(gk))return 0;
            if(acceptHeights){
              for(let i=0;i<acceptHeights.length;i++)if(Math.abs(landed[1]-acceptHeights[i])<=.45){hasInnerSkipped=true;return 2;}
              acceptHeights.push(landed[1]);
            }
            gSeen.add(gk);
            out.push({id:anchor(landed,true),target,at:landed});
            return 1;
          };
          if(!pass2){
            const rawOk=tryPoint(raw,null);
            if(rawOk&&!reach&&out.length&&dist(out[out.length-1].at,raw)<.05){await checkpoint();continue;}
            if(reach){
              const radii=[2.25,1.9,1.5,1.05,.65];
              for(let n=0;n<16;n++){
                const ang=n*Math.PI/8,ca=Math.cos(ang),sa=Math.sin(ang),ys=[];
                for(let ri=0;ri<radii.length;ri++)tryPoint([raw[0]+ca*radii[ri],raw[1],raw[2]+sa*radii[ri]],ys);
              }
            }else{
              for(const radius of [.65,1.05])for(let n=0;n<16;n++){
                const ang=n*Math.PI/8;
                tryPoint([raw[0]+Math.cos(ang)*radius,raw[1],raw[2]+Math.sin(ang)*radius],null);
              }
            }
          }else if(isFallbackFoe){
            for(const radius of [2.35,2.05,1.65,1.25,.85])for(let n=0;n<16;n++){
              const ang=n*Math.PI/8;
              tryPoint([raw[0]+Math.cos(ang)*radius,raw[1],raw[2]+Math.sin(ang)*radius],null);
            }
          }else if(isInnerReach){
            for(const radius of [1.9,1.5,1.05,.65])for(let n=0;n<16;n++){
              const ang=n*Math.PI/8;
              tryPoint([raw[0]+Math.cos(ang)*radius,raw[1],raw[2]+Math.sin(ang)*radius],null);
            }
          }
          await checkpoint();
        }
        return out;
      };
      const goals=await buildGoals(false);
      const canFallback=targets.some(t=>t.kind==='quest'&&!(Number.isFinite(t.reach)&&t.reach>0));
      if(!goals.length&&!canFallback&&!hasInnerSkipped)return null;
      for(const t of transitions){
        const b=xyz(t.exit?.pos);if(!b)continue;
        const entrances=this.portalEntries(t),pb=this.geo.ground([b[0],b[1]+.15,b[2]],0,128);
        if(!entrances.length||!pb||!this.geo.fits(pb))continue;
        const exit=anchor(pb),contact=t.activation?.kind==='on'||t.activation?.kind==='into';
        portals.push({from:entrances,to:pb,exit});
        for(const pa of entrances){const enter=anchor(pa,true);link(enter,exit,{kind:'portal',points:[pa,pb],cost:.05,contact});}
        await checkpoint();
      }
      const runSearch=async goalList=>{
        if(!goalList.length)return null;
        // An admissible heuristic includes shortcuts through every directed portal.
        const pLen=portals.length,gLen=goalList.length,tails=new Float64Array(pLen);
        for(let i=0;i<pLen;i++){
          const pto=portals[i].to;let bestD=Infinity;
          for(let j=0;j<gLen;j++){const ga=goalList[j].at,d=Math.hypot(pto[0]-ga[0],pto[1]-ga[1],pto[2]-ga[2]);if(d<bestD)bestD=d;}
          tails[i]=bestD;
        }
        const approach=(p,t)=>{
          const from=t.from,px=p[0],py=p[1],pz=p[2];let bestD=Infinity;
          for(let k=0;k<from.length;k++){const a=from[k],d=Math.hypot(px-a[0],py-a[1],pz-a[2]);if(d<bestD)bestD=d;}
          return bestD;
        };
        for(let pass=0;pass<pLen;pass++)for(let i=0;i<pLen;i++)for(let j=0;j<pLen;j++){
          const cand=approach(portals[i].to,portals[j])+.05+tails[j];if(cand<tails[i])tails[i]=cand;
        }
        const heuristic=p=>{
          const px=p[0],py=p[1],pz=p[2];let h=Infinity;
          for(let i=0;i<gLen;i++){const ga=goalList[i].at,d=Math.hypot(px-ga[0],py-ga[1],pz-ga[2]);if(d<h)h=d;}
          for(let i=0;i<pLen;i++){
            const from=portals[i].from,tail=.05+tails[i];let ap=Infinity;
            for(let k=0;k<from.length;k++){const a=from[k],d=Math.hypot(px-a[0],py-a[1],pz-a[2]);if(d<ap)ap=d;}
            if(ap+tail<h)h=ap+tail;
          }
          return h;
        };
        const finish=new Map();for(let i=0;i<gLen;i++)finish.set(goalList[i].id,goalList[i]);
        const heap=new Heap(),best=new Map([[start,0]]),parent=new Map([[start,{from:-1,edges:[]}]]);
        heap.push({id:start,cost:0,score:heuristic(at(start))});let count=0;
        const relax=(from,to,cost,edges)=>{if(cost>=(best.get(to)??Infinity)-1e-8)return;best.set(to,cost);parent.set(to,{from,edges});heap.push({id:to,cost,score:cost+heuristic(at(to))});};
        while(heap.size){
          const cur=heap.pop();if(cur.cost!==best.get(cur.id))continue;
          if(finish.has(cur.id))return {id:cur.id,goal:finish.get(cur.id),cost:cur.cost,parent};
          const ex=extra.get(cur.id);
          if(ex)for(let i=0;i<ex.length;i++)relax(cur.id,ex[i].to,cur.cost+ex[i].edge.cost,[ex[i].edge]);
          if(cur.id>=base){
            // Start, goals and portal pins are true graph vertices: no detour through an arbitrary room centroid.
            const curAt=at(cur.id);
            for(let i=0;i<anchors.length;i++){
              const n=anchors[i];
              if(n.id===cur.id||cur.cost+dist(curAt,n.at)>=(best.get(n.id)??Infinity))continue;
              const edge=this.connect(curAt,n.at);if(edge)relax(cur.id,n.id,cur.cost+edge.cost,[edge]);
              if(++count%16===0)await checkpoint();
            }
          }else{
            const nb=this.neighbours(cur.id),curAt=at(cur.id);
            for(let i=0;i<nb.length;i++){
              const id=nb[i],lower=cur.cost+dist(curAt,at(id));if(lower>=(best.get(id)??Infinity))continue;
              const e=this.edge(cur.id,id);if(e)relax(cur.id,id,cur.cost+e.cost,[e]);if(++count%24===0)await checkpoint();
            }
          }
        }
        return {exhausted:true,best,parent};
      };
      const first=await runSearch(goals);
      let answer=first&&!first.exhausted?first:null;
      if(!answer&&(canFallback||hasInnerSkipped)){
        const priorAnchorCount=anchors.length;
        const fbGoals=await buildGoals(true);
        if(fbGoals.length){
          if(first?.exhausted){
            // Pass 1 already settled optimal distances from start to every reachable node and portal exit.
            const bestMap=first.best,reachableAnchors=[];
            for(let i=0;i<priorAnchorCount;i++){
              const a=anchors[i],c=bestMap.get(a.id);
              if(c!==undefined)reachableAnchors.push({id:a.id,at:a.at,cost:c});
            }
            let bestGoal=null,bestCost=Infinity,bestFrom=-1,bestEdge=null;
            for(let i=0;i<fbGoals.length;i++){
              const g=fbGoals[i],attached=this.attach(g.at,true);
              for(let j=0;j<attached.links.length;j++){
                const e=attached.links[j],bc=bestMap.get(e.id);
                if(bc!==undefined&&bc+e.cost<bestCost){bestCost=bc+e.cost;bestGoal=g;bestFrom=e.id;bestEdge=e;}
              }
              for(let j=0;j<reachableAnchors.length;j++){
                const ra=reachableAnchors[j];
                if(ra.cost+dist(ra.at,g.at)>=bestCost)continue;
                const edge=this.connect(ra.at,g.at);
                if(edge&&ra.cost+edge.cost<bestCost){bestCost=ra.cost+edge.cost;bestGoal=g;bestFrom=ra.id;bestEdge=edge;}
              }
              if(i%8===0)await checkpoint();
            }
            if(bestGoal){
              first.parent.set(bestGoal.id,{from:bestFrom,edges:[bestEdge]});
              answer={id:bestGoal.id,goal:bestGoal,cost:bestCost,parent:first.parent};
            }
          }else{
            const second=await runSearch(fbGoals);
            if(second&&!second.exhausted)answer=second;
          }
        }
      }
      if(!answer)return null;
      let id=answer.id;const path=[];
      while(id!==-1){const p=answer.parent.get(id);if(!p)return null;path.unshift(...p.edges);id=p.from;}
      const points=[],kinds=[];let transition=null;
      for(const e of path){
        if(e.kind==='portal'){transition={from:e.points[0],to:e.points[1],contact:!!e.contact};break;}
        for(const p of e.points)if(!points.length||dist(points.at(-1),p)>.005){points.push(p);kinds.push(e.kind);}
      }
      return {target:answer.goal.target,points,kinds,transition,distance:answer.cost,stats:{nodes:this.nodes.length,edges:this.edges.size,tested:this.tested}};
    }
  }

  // Stable static revisions: query stamps and moving action buckets never invalidate profiles, while settled obstacle states trigger rebuilds.
  const revisions=new WeakMap(),settledActions=new WeakMap();
  function settledState(source,o){
    let states=settledActions.get(source);if(!states)settledActions.set(source,states=new Map());
    if(o.state==='forward'||o.state==='reverse')return states.get(o.key)??'moving';
    const s=o.state??'start';states.set(o.key,s);return s;
  }
  function revision(col,actions){
    const source=col?.source||col;if(!source?._buckets)return 0;
    const objs=actions?.objects,hasGet=typeof objs?.get==='function';
    let ignored=null;
    if(objs&&!hasGet){
      ignored=new Set();
      for(const o of objs.values?.()||[])if(o.kind==='door'||o.kind==='action')ignored.add(o.key);
    }else if(objs){
      // Verify map keys match o.key without allocating; fall back to Set only on custom keyed maps.
      for(const o of objs.values?.()||[]){
        if((o.kind==='door'||o.kind==='action')&&objs.get(o.key)!==o){
          ignored=new Set();
          for(const x of objs.values())if(x.kind==='door'||x.kind==='action')ignored.add(x.key);
          break;
        }
      }
    }
    const old=revisions.get(source),oldFlat=old?.flat,oldLen=oldFlat?oldFlat.length:-1;
    let same=!!oldFlat,idx=0;
    const check=v=>{if(same&&(idx>=oldLen||oldFlat[idx]!==v))same=false;idx++;};
    for(const [key,b]of source._buckets){
      if(ignored){if(ignored.has(key))continue;}
      else if(objs){const ao=objs.get(key);if(ao&&(ao.kind==='door'||ao.kind==='action'))continue;}
      check(key);check(b);check(b.tris.length);check(b.parts);
    }
    if(objs)for(const o of objs.values?.()||[])if(o.kind==='action'){
      const role=actionRole(o,col);
      if(role==='lift'&&o.cpu&&o.base){
        check(o.key);check(role);check(o.cpu);check(o.base);
        check(o.translation?.x);check(o.translation?.y);check(o.translation?.z);
        check(o.rotation?.x);check(o.rotation?.y);check(o.rotation?.z);
      }else if(role==='obstacle'){
        check(o.key);check(role);check(o.cpu);check(o.base);
        check(o.translation?.x);check(o.translation?.y);check(o.translation?.z);
        check(o.rotation?.x);check(o.rotation?.y);check(o.rotation?.z);
        check(settledState(source,o));
      }
    }
    if(same&&idx===oldLen)return old.value;
    const flat=new Array(idx);let p=0;
    for(const [key,b]of source._buckets){
      if(ignored){if(ignored.has(key))continue;}
      else if(objs){const ao=objs.get(key);if(ao&&(ao.kind==='door'||ao.kind==='action'))continue;}
      flat[p++]=key;flat[p++]=b;flat[p++]=b.tris.length;flat[p++]=b.parts;
    }
    if(objs)for(const o of objs.values?.()||[])if(o.kind==='action'){
      const role=actionRole(o,col);
      if(role==='lift'&&o.cpu&&o.base){
        flat[p++]=o.key;flat[p++]=role;flat[p++]=o.cpu;flat[p++]=o.base;
        flat[p++]=o.translation?.x;flat[p++]=o.translation?.y;flat[p++]=o.translation?.z;
        flat[p++]=o.rotation?.x;flat[p++]=o.rotation?.y;flat[p++]=o.rotation?.z;
      }else if(role==='obstacle'){
        flat[p++]=o.key;flat[p++]=role;flat[p++]=o.cpu;flat[p++]=o.base;
        flat[p++]=o.translation?.x;flat[p++]=o.translation?.y;flat[p++]=o.translation?.z;
        flat[p++]=o.rotation?.x;flat[p++]=o.rotation?.y;flat[p++]=o.rotation?.z;
        flat[p++]=settledState(source,o);
      }
    }
    const value=(old?.value||0)+1;revisions.set(source,{flat,value});return value;
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
  const hash01 = n => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
  const smooth01 = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / ((b - a) || 1))); return t * t * (3 - 2 * t); };
  const MYSTICISM_RGB = Object.freeze([244 / 255, 114 / 255, 182 / 255]); // #f472b6 1:1 from Spellmaker stand
  const CLOUD_PRESETS = Object.freeze([
    Object.freeze({ id: 0, radiusScale: 0.62, aspectX: 1.30, aspectY: 0.76, alphaMul: 0.90, yOff: -0.05 }),
    Object.freeze({ id: 1, radiusScale: 0.76, aspectX: 0.86, aspectY: 1.14, alphaMul: 0.84, yOff:  0.04 }),
    Object.freeze({ id: 2, radiusScale: 0.90, aspectX: 1.22, aspectY: 0.88, alphaMul: 0.78, yOff: -0.03 }),
    Object.freeze({ id: 3, radiusScale: 1.04, aspectX: 0.94, aspectY: 1.08, alphaMul: 0.74, yOff:  0.05 }),
    Object.freeze({ id: 4, radiusScale: 1.18, aspectX: 1.34, aspectY: 0.80, alphaMul: 0.68, yOff: -0.02 }),
    Object.freeze({ id: 5, radiusScale: 1.32, aspectX: 1.02, aspectY: 1.18, alphaMul: 0.62, yOff:  0.07 }),
    Object.freeze({ id: 6, radiusScale: 1.48, aspectX: 1.28, aspectY: 0.94, alphaMul: 0.56, yOff:  0.01 })
  ]);
  const trailPathCache = new WeakMap();
  const trailSampleA = new Float64Array(8);
  const trailSampleB = new Float64Array(8);
  const defaultTrailOut = { buf: new Float32Array(2048 * 72) };
  const EMPTY_FLOATS = new Float32Array(0);
  const EMPTY_ARR = Object.freeze([]);
  function buildTrailPath(points) {
    const len = points.length;
    const p0 = points[0], pMid = points[len >> 1], pLast = points[len - 1];
    const cached = trailPathCache.get(points);
    if (
      cached && cached.len === len &&
      cached.p0x === p0[0] && cached.p0y === p0[1] && cached.p0z === p0[2] &&
      cached.pmx === pMid[0] && cached.pmy === pMid[1] && cached.pmz === pMid[2] &&
      cached.plx === pLast[0] && cached.ply === pLast[1] && cached.plz === pLast[2]
    ) return cached;
    const raw = [p0];
    let lastRaw = p0;
    for (let i = 1; i < len; i++) {
      const pi = points[i];
      if (Math.hypot(pi[0] - lastRaw[0], pi[1] - lastRaw[1], pi[2] - lastRaw[2]) > 0.01) {
        raw.push(pi); lastRaw = pi;
      }
    }
    if (raw.length < 2) {
      const empty = { len, p0x: p0[0], p0y: p0[1], p0z: p0[2], pmx: pMid[0], pmy: pMid[1], pmz: pMid[2], plx: pLast[0], ply: pLast[1], plz: pLast[2], valid: false };
      trailPathCache.set(points, empty);
      return empty;
    }
    // Smooth sharp interior corners with quadratic Bezier subdivisions
    const curved = [raw[0]];
    let lastCurved = raw[0];
    for (let i = 1; i + 1 < raw.length; i++) {
      const a = raw[i - 1], b = raw[i], c = raw[i + 1];
      const d1 = dist(a, b), d2 = dist(b, c);
      if (d1 > 0.25 && d2 > 0.25) {
        const r1 = Math.min(0.42, d1 * 0.38) / d1, r2 = Math.min(0.42, d2 * 0.38) / d2;
        const p0x = b[0] + (a[0] - b[0]) * r1, p0y = b[1] + (a[1] - b[1]) * r1, p0z = b[2] + (a[2] - b[2]) * r1;
        const p2x = b[0] + (c[0] - b[0]) * r2, p2y = b[1] + (c[1] - b[1]) * r2, p2z = b[2] + (c[2] - b[2]) * r2;
        for (let ti = 0; ti < 4; ti++) {
          const t = ti === 0 ? 0 : ti === 1 ? 0.33 : ti === 2 ? 0.67 : 1;
          const u = 1 - t, uu = u * u, ut2 = 2 * u * t, tt = t * t;
          const px = uu * p0x + ut2 * b[0] + tt * p2x;
          const py = uu * p0y + ut2 * b[1] + tt * p2y;
          const pz = uu * p0z + ut2 * b[2] + tt * p2z;
          if (Math.hypot(px - lastCurved[0], py - lastCurved[1], pz - lastCurved[2]) > 0.01) {
            lastCurved = [px, py, pz]; curved.push(lastCurved);
          }
        }
      } else if (Math.hypot(b[0] - lastCurved[0], b[1] - lastCurved[1], b[2] - lastCurved[2]) > 0.01) {
        lastCurved = b; curved.push(b);
      }
    }
    const rawEnd = raw[raw.length - 1];
    if (Math.hypot(rawEnd[0] - lastCurved[0], rawEnd[1] - lastCurved[1], rawEnd[2] - lastCurved[2]) > 0.01) curved.push(rawEnd);
    const segs = [];
    let totalLen = 0;
    for (let i = 1; i < curved.length; i++) {
      const a = curved[i - 1], b = curved[i], ddx = b[0] - a[0], ddy = b[1] - a[1], ddz = b[2] - a[2];
      const segLen = Math.hypot(ddx, ddy, ddz);
      if (segLen <= 0.002) continue;
      const inv = 1 / segLen, dx = ddx * inv, dy = ddy * inv, dz = ddz * inv;
      const run = Math.hypot(dx, dz);
      const ax = run > 0.001 ? -dz / run : 1, az = run > 0.001 ? dx / run : 0;
      segs.push({ ax: a[0], ay: a[1], az: a[2], ddx, ddy, ddz, len: segLen, invLen: inv, s0: totalLen, s1: totalLen + segLen, dirX: dx, dirY: dy, dirZ: dz, acrossX: ax, acrossZ: az });
      totalLen += segLen;
    }
    const segEnds = new Float64Array(segs.length);
    for (let i = 0; i < segs.length; i++) segEnds[i] = segs[i].s1;
    const entry = {
      len, p0x: p0[0], p0y: p0[1], p0z: p0[2], pmx: pMid[0], pmy: pMid[1], pmz: pMid[2], plx: pLast[0], ply: pLast[1], plz: pLast[2],
      valid: segs.length > 0 && totalLen > 0.01,
      raw0: raw[0], curved, segs, segEnds, totalLen, liftedLift: NaN, liftedPoints: null
    };
    trailPathCache.set(points, entry);
    return entry;
  }
  function cloudTrail(points, timeSec = 0, opts = {}) {
    const alpha = Math.max(0, Math.min(1, Number(opts.alpha ?? 1)));
    const dissipate = Math.max(0, Math.min(1, Number(opts.dissipate ?? 0)));
    const lift = Number.isFinite(opts.lift) ? opts.lift : 1.0;
    const minimal = !!opts.minimal;
    if (!Array.isArray(points) || points.length < 2 || alpha <= 0.001) {
      return { vertices: minimal ? EMPTY_FLOATS : new Float32Array(0), count: 0, lights: [], particles: minimal ? EMPTY_ARR : [], totalLen: 0, liftedPoints: minimal ? EMPTY_ARR : [] };
    }
    const path = buildTrailPath(points);
    if (!path.valid) {
      return { vertices: minimal ? EMPTY_FLOATS : new Float32Array(0), count: 0, lights: [], particles: minimal ? EMPTY_ARR : [], totalLen: 0, liftedPoints: minimal ? EMPTY_ARR : [] };
    }
    const { segs, segEnds, totalLen, raw0, curved } = path;
    const segCount = segs.length;
    const pOrigin = opts.playerPos;
    const pox = (pOrigin?.length >= 3 && Number.isFinite(pOrigin[0]) && Number.isFinite(pOrigin[1]) && Number.isFinite(pOrigin[2])) ? pOrigin[0] : raw0[0];
    const poy = (pOrigin?.length >= 3 && Number.isFinite(pOrigin[0]) && Number.isFinite(pOrigin[1]) && Number.isFinite(pOrigin[2])) ? pOrigin[1] : raw0[1];
    const poz = (pOrigin?.length >= 3 && Number.isFinite(pOrigin[0]) && Number.isFinite(pOrigin[1]) && Number.isFinite(pOrigin[2])) ? pOrigin[2] : raw0[2];
    const liftDelta = lift - 0.25;
    const sampleInto = (s, out) => {
      const clamped = s <= 0 ? 0 : (s >= totalLen ? totalLen : s);
      let lo = 0, hi = segCount - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (segEnds[mid] < clamped) lo = mid + 1;
        else hi = mid;
      }
      const seg = segs[lo];
      let t = seg.len > 1e-6 ? (clamped - seg.s0) * seg.invLen : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const h = 0.25 + liftDelta * (clamped < 1.6 ? clamped / 1.6 : 1);
      out[0] = seg.ax + seg.ddx * t;
      out[1] = seg.ay + seg.ddy * t + h;
      out[2] = seg.az + seg.ddz * t;
      out[3] = seg.dirX; out[4] = seg.dirY; out[5] = seg.dirZ;
      out[6] = seg.acrossX; out[7] = seg.acrossZ;
    };
    let liftedPoints = EMPTY_ARR;
    if (!minimal) {
      if (path.liftedLift !== lift || !path.liftedPoints) {
        const lp = new Array(curved.length);
        let accS = 0;
        for (let idx = 0; idx < curved.length; idx++) {
          if (idx > 0 && idx - 1 < segCount) accS += segs[idx - 1].len;
          const p = curved[idx];
          lp[idx] = [p[0], p[1] + 0.25 + liftDelta * (accS < 1.6 ? accS / 1.6 : 1), p[2]];
        }
        path.liftedLift = lift; path.liftedPoints = lp;
      }
      liftedPoints = path.liftedPoints;
    }
    const outHolder = opts.out || defaultTrailOut;
    let vBuf = outHolder.buf, ptr = 0;
    const pushQuad = (cx, cy, cz, radius, a, seed, mode, tx = 0, ty = 0, tz = 0) => {
      if (a <= 0.002 || radius <= 0.003) return;
      if (ptr + 72 > vBuf.length) {
        const grown = new Float32Array(Math.max(ptr + 72, vBuf.length * 2, 4096 * 12));
        grown.set(vBuf.subarray(0, ptr));
        vBuf = outHolder.buf = grown;
      }
      vBuf[ptr]=cx;vBuf[ptr+1]=cy;vBuf[ptr+2]=cz;vBuf[ptr+3]=-1;vBuf[ptr+4]=-1;vBuf[ptr+5]=radius;vBuf[ptr+6]=a;vBuf[ptr+7]=seed;vBuf[ptr+8]=mode;vBuf[ptr+9]=tx;vBuf[ptr+10]=ty;vBuf[ptr+11]=tz;
      vBuf[ptr+12]=cx;vBuf[ptr+13]=cy;vBuf[ptr+14]=cz;vBuf[ptr+15]=1;vBuf[ptr+16]=-1;vBuf[ptr+17]=radius;vBuf[ptr+18]=a;vBuf[ptr+19]=seed;vBuf[ptr+20]=mode;vBuf[ptr+21]=tx;vBuf[ptr+22]=ty;vBuf[ptr+23]=tz;
      vBuf[ptr+24]=cx;vBuf[ptr+25]=cy;vBuf[ptr+26]=cz;vBuf[ptr+27]=1;vBuf[ptr+28]=1;vBuf[ptr+29]=radius;vBuf[ptr+30]=a;vBuf[ptr+31]=seed;vBuf[ptr+32]=mode;vBuf[ptr+33]=tx;vBuf[ptr+34]=ty;vBuf[ptr+35]=tz;
      vBuf[ptr+36]=cx;vBuf[ptr+37]=cy;vBuf[ptr+38]=cz;vBuf[ptr+39]=-1;vBuf[ptr+40]=-1;vBuf[ptr+41]=radius;vBuf[ptr+42]=a;vBuf[ptr+43]=seed;vBuf[ptr+44]=mode;vBuf[ptr+45]=tx;vBuf[ptr+46]=ty;vBuf[ptr+47]=tz;
      vBuf[ptr+48]=cx;vBuf[ptr+49]=cy;vBuf[ptr+50]=cz;vBuf[ptr+51]=1;vBuf[ptr+52]=1;vBuf[ptr+53]=radius;vBuf[ptr+54]=a;vBuf[ptr+55]=seed;vBuf[ptr+56]=mode;vBuf[ptr+57]=tx;vBuf[ptr+58]=ty;vBuf[ptr+59]=tz;
      vBuf[ptr+60]=cx;vBuf[ptr+61]=cy;vBuf[ptr+62]=cz;vBuf[ptr+63]=-1;vBuf[ptr+64]=1;vBuf[ptr+65]=radius;vBuf[ptr+66]=a;vBuf[ptr+67]=seed;vBuf[ptr+68]=mode;vBuf[ptr+69]=tx;vBuf[ptr+70]=ty;vBuf[ptr+71]=tz;
      ptr += 72;
    };
    const minCloudS = opts.detached ? 0.12 : (totalLen > 2.2 ? 0.78 : Math.min(0.32, totalLen * 0.20));
    // 1. Soft outer Mysticism bloom halo along the cloud chain (mode = 2.0, ONLY within <= 100m of player)
    const bloomStep = 0.88;
    let bloomEmitted = 0;
    for (let u = 0.25; u <= totalLen + 0.01; u += bloomStep) {
      const k = Math.round(u / bloomStep);
      const seed = hash01(k * 7.13 + 19.7);
      const atS = totalLen - (u + (seed - 0.5) * 0.22);
      if (atS < minCloudS * 0.85 || atS > totalLen - 0.02) continue;
      sampleInto(atS, trailSampleA);
      const dxp = trailSampleA[0] - pox, dyp = trailSampleA[1] - poy, dzp = trailSampleA[2] - poz;
      const d2 = dxp * dxp + dyp * dyp + dzp * dzp;
      if (d2 > 10000.0) continue;
      const dPlayer = Math.sqrt(d2);
      const bloomDistFade = 1 - smooth01(84.0, 100.0, dPlayer);
      const localDiss = dissipate <= 0 ? 0 : Math.min(1, Math.max(0, dissipate * 1.18 - seed * 0.18));
      const r = Math.min(0.34, 0.03 + 0.12 * atS) * (1.0 + 0.45 * localDiss);
      const pulse = 0.88 + 0.12 * Math.sin(timeSec * 2.0 + k * 0.9 + seed * 6.28);
      const a = 0.14 * alpha * pulse * bloomDistFade * Math.pow(1 - localDiss, 1.3);
      pushQuad(trailSampleA[0], trailSampleA[1] + 0.32 * localDiss * localDiss, trailSampleA[2], r, a, seed, 2.0);
      bloomEmitted++;
    }
    if (!bloomEmitted && totalLen > 0.15) {
      const atS = totalLen * 0.55;
      sampleInto(atS, trailSampleA);
      const dxp = trailSampleA[0] - pox, dyp = trailSampleA[1] - poy, dzp = trailSampleA[2] - poz;
      if (dxp * dxp + dyp * dyp + dzp * dzp <= 10000.0) {
        const localDiss = dissipate <= 0 ? 0 : Math.min(1, dissipate * 1.1);
        const r = Math.min(0.32, 0.03 + 0.12 * atS) * (1.0 + 0.45 * localDiss);
        pushQuad(trailSampleA[0], trailSampleA[1] + 0.32 * localDiss * localDiss, trailSampleA[2], r, 0.14 * alpha * Math.pow(1 - localDiss, 1.3), 0.37, 2.0);
      }
    }

    // 2. Chain of 7 varied-size, pale, tattered, internally billowing cloud presets placed slightly closer together
    const puffStep = 0.68;
    let puffsEmitted = 0;
    let prevPreset = -1;
    const presetCount = CLOUD_PRESETS.length;
    const emitPuff = (atS, k, seed) => {
      let presetIdx = Math.floor(hash01(k * 23.17 + 7.9) * presetCount);
      if (presetIdx === prevPreset) presetIdx = (presetIdx + 1 + Math.floor(seed * 5)) % presetCount;
      prevPreset = presetIdx;
      const preset = CLOUD_PRESETS[presetIdx];
      sampleInto(atS, trailSampleA);
      const maxR = Math.min(0.28, 0.03 + 0.125 * atS);
      const taper = maxR / 0.28;
      const period = 2.9 + 1.4 * seed;
      const cycle = ((timeSec / period + seed + k * 0.17) % 1 + 1) % 1;
      const lifeEnv = smooth01(0.0, 0.25, cycle) * (1 - smooth01(0.72, 1.0, cycle));
      const localDiss = dissipate <= 0 ? 0 : Math.min(0.999, Math.max(0, dissipate * 1.24 - seed * 0.24));
      const sway = Math.sin(timeSec * 1.15 + k * 1.1 + seed * 6.28) * 0.048 * taper;
      const bob = (Math.cos(timeSec * 1.0 + k * 1.5 + seed * 6.28) * 0.032 + (cycle - 0.35) * 0.055) * taper;
      const smokeX = trailSampleA[6] * (sway + Math.sin(seed * 19.1 + timeSec * 1.7) * 0.22 * localDiss * taper);
      const smokeZ = trailSampleA[7] * (sway + Math.cos(seed * 17.3 + timeSec * 1.6) * 0.22 * localDiss * taper);
      const smokeY = bob + preset.yOff * taper + 0.48 * localDiss * localDiss;
      const r = Math.min(0.42, maxR * preset.radiusScale) * (0.90 + 0.18 * cycle) * (1.0 + 0.80 * localDiss);
      const a = alpha * (0.28 + 0.72 * lifeEnv) * Math.pow(1 - localDiss, 1.25) * 0.44 * preset.alphaMul;
      pushQuad(trailSampleA[0] + smokeX, trailSampleA[1] + smokeY, trailSampleA[2] + smokeZ, r, a, seed, localDiss, preset.aspectX, preset.aspectY, preset.id);
      puffsEmitted++;
    };
    for (let u = 0.20; u <= totalLen + 0.01; u += puffStep) {
      const k = Math.round(u / puffStep);
      const seed = hash01(k * 13.37 + 5.1);
      const atS = totalLen - (u + (seed - 0.5) * 0.18);
      if (atS < minCloudS || atS > totalLen - 0.02) continue;
      emitPuff(atS, k, seed);
    }
    if (!puffsEmitted && totalLen > 0.15) {
      emitPuff(totalLen * 0.58, 1, 0.42);
      if (totalLen > 0.75) emitPuff(totalLen * 0.85, 2, 0.77);
    }

    // 3. Smaller (~10-25px), fewer, gentler bright-white particles appearing/disappearing inside the line
    const particleStep = totalLen > 128 ? totalLen / 76 : 1.65;
    const minParticleS = opts.detached ? 0.15 : (totalLen > 2.4 ? 1.05 : totalLen * 0.25);
    const particles = minimal ? EMPTY_ARR : [];
    const nearParticleCandidates = [];
    const maxU = Math.max(0.2, totalLen - minParticleS * 0.35);
    for (let u = 0.35, slot = 0; u <= maxU + 0.05; u += particleStep, slot++) {
      const k = Math.round(u / particleStep);
      const s1 = hash01(k * 3.17 + 101.3), s2 = hash01(k * 7.31 + 211.7), s3 = hash01(k * 11.53 + 307.9);
      const uSpawn = Math.max(0.18, Math.min(totalLen - 0.08, u + (s1 - 0.5) * (particleStep * 0.48)));
      const maxTravelHere = Math.max(0.22, uSpawn - 0.05);
      const candSpeed = 3.8 - 1.6 * s2;
      const baseDur = 1.7 + 0.85 * s1;
      const dur = totalLen < 3.0 ? Math.min(baseDur, Math.max(0.60, maxTravelHere / candSpeed)) : baseDur;
      const age = ((timeSec / dur + s3) % 1 + 1) % 1;
      const rawTravel = candSpeed * (age * dur) * (1 - 0.35 * dissipate);
      if (totalLen >= 3.0 && rawTravel > maxTravelHere) continue;
      const uCur = Math.max(0.05, uSpawn - Math.min(maxTravelHere, rawTravel));
      const curS = totalLen - uCur;
      if (curS < Math.max(0.08, minParticleS - 0.25) || curS > totalLen - 0.02) continue;
      sampleInto(curS, trailSampleA);
      const px = trailSampleA[0], py = trailSampleA[1], pz = trailSampleA[2];
      const dxp = px - pox, dyp = py - poy, dzp = pz - poz;
      const dPlayer = Math.hypot(dxp, dyp, dzp);
      const near50 = dPlayer <= 50.0;
      // Within 50m: randomized ~10-25px screen size (larger = slower, faster = longer tail). Beyond 50m: uniform cheap particles.
      const sizeRand = near50 ? s2 : 0.5;
      const baseRadius = near50 ? (0.022 + 0.024 * sizeRand) : 0.032;
      // Calm speed (~2.2..3.8 m/s), inverse to particle size
      const speed = near50 ? (3.8 - 1.6 * sizeRand) : 3.0;
      // Tail length proportional to speed (faster = longer tail)
      const fullTailLen = speed * 0.14;
      const born = smooth01(0.0, 0.26, age);
      const died = 1 - smooth01(0.68, 1.0, age);
      const playerZoneFade = opts.detached ? 1.0 : smooth01(Math.max(0, minParticleS - 0.25), minParticleS + 0.35, curS);
      const goalFade = smooth01(0.04, 0.26, uCur);
      const life = born * died * playerZoneFade * goalFade;
      const localDiss = dissipate <= 0 ? 0 : Math.min(1, Math.max(0, dissipate * 1.2 - s1 * 0.2));
      const twinkle = 0.84 + 0.16 * Math.sin(timeSec * (5.2 + 2.8 * s1) + s2 * 14.0);
      const pAlpha = alpha * life * twinkle * Math.pow(1 - localDiss, 1.45) * 0.96;
      if (pAlpha <= 0.005) continue;
      const maxAllowedR = Math.min(0.45, 0.03 + 0.125 * curS);
      const maxSwirl = Math.min(0.055, maxAllowedR * 0.18) * (near50 ? (0.4 + 0.6 * s3) : 0.35);
      const ang = age * 4.2 + s1 * 6.2831853 + timeSec * 1.25;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const ox = trailSampleA[6] * ca * maxSwirl;
      const oz = trailSampleA[7] * ca * maxSwirl;
      const oy = sa * maxSwirl + 0.36 * localDiss * localDiss;
      const hx = px + ox, hy = py + oy, hz = pz + oz;
      const pRad = Math.min(baseRadius, maxAllowedR * 0.55) * (0.76 + 0.24 * life);
      const activeTailLen = Math.min(curS * 0.85, fullTailLen * (0.35 + 0.65 * born) * (1 - 0.3 * localDiss));
      sampleInto(Math.max(0, curS - activeTailLen), trailSampleB);
      let tx = (trailSampleB[0] + ox * 0.3) - hx;
      let ty = (trailSampleB[1] + oy * 0.3) - hy;
      let tz = (trailSampleB[2] + oz * 0.3) - hz;
      if (tx * tx + ty * ty + tz * tz < 0.0004) {
        tx = -trailSampleA[3] * activeTailLen; ty = -trailSampleA[4] * activeTailLen; tz = -trailSampleA[5] * activeTailLen;
      }
      if (near50) {
        // Attached white bloom source per particle (< 50m), brighter than the cloud bloom
        const nearFade = 1 - smooth01(42.0, 50.0, dPlayer);
        const bloomR = Math.min(maxAllowedR, pRad * 2.5);
        const bloomA = Math.min(1, pAlpha * 0.44 * nearFade);
        pushQuad(hx, hy, hz, bloomR, bloomA, s1, 4.0, 0, 0, 0);
        pushQuad(hx, hy, hz, pRad, pAlpha, s1, 3.0, tx, ty, tz);
        const candA = pAlpha * nearFade;
        if (candA > 0.05) nearParticleCandidates.push({ x: hx, y: hy, z: hz, alpha: candA, radius: baseRadius, dPlayer });
      } else {
        // Cheap uniform particle with tail (> 50m), no attached bloom source or point light
        pushQuad(hx, hy, hz, pRad, pAlpha * 0.9, s1, 3.5, tx, ty, tz);
      }
      if (!minimal) particles.push({ near: near50, radius: baseRadius, baseRadius, renderedRadius: pRad, speed, tailLen: fullTailLen, fullTailLen, activeTailLen, distFromPlayer: dPlayer, pos: [hx, hy, hz] });
    }
    const vertices = minimal ? vBuf.subarray(0, ptr) : vBuf.slice(0, ptr);
    // 4. Dynamic lighting: white particle lights (ONLY within <= 50m of player) + dim Mysticism (#f472b6) cloud lights
    const lights = [];
    const envGain = alpha * Math.pow(1 - dissipate, 1.35);
    if (envGain > 0.01) {
      // Pick up to 4 well-spaced bright near particles (<= 50m) for white particle illumination
      nearParticleCandidates.sort((a, b) => b.alpha - a.alpha);
      const chosenParticles = [];
      for (let i = 0; i < nearParticleCandidates.length; i++) {
        const cand = nearParticleCandidates[i];
        let tooClose = false;
        for (let j = 0; j < chosenParticles.length; j++) {
          const cp = chosenParticles[j];
          const dx = cp.x - cand.x, dy = cp.y - cand.y, dz = cp.z - cand.z;
          if (dx * dx + dy * dy + dz * dz < 4.84) { tooClose = true; break; }
        }
        if (tooClose) continue;
        chosenParticles.push(cand);
        if (chosenParticles.length >= 4) break;
      }
      for (let i = 0; i < chosenParticles.length; i++) {
        const p = chosenParticles[i];
        const g = Math.min(0.22, 0.20 * p.alpha);
        lights.push({
          kind: 'particle',
          distFromPlayer: p.dPlayer,
          x: p.x, y: p.y, z: p.z,
          range: 2.0 + 1.4 * Math.min(1, p.radius / 0.046) * envGain,
          color: [g, g, g]
        });
      }
      // Plus up to 2 dim Mysticism (#f472b6 1:1) cloud ambient lights near the player
      const stCount = totalLen < 2.5 ? 1 : (6.5 <= totalLen + 0.4 ? 2 : (1.8 <= totalLen + 0.4 ? 1 : 0));
      for (let i = 0; i < stCount; i++) {
        const st = totalLen < 2.5 ? totalLen : (i === 0 ? 1.8 : 6.5);
        const atS = st < totalLen ? st : totalLen;
        sampleInto(atS, trailSampleA);
        const dPlayer = Math.hypot(trailSampleA[0] - pox, trailSampleA[1] - poy, trailSampleA[2] - poz);
        if (dPlayer > 50.0) continue;
        const pulse = 0.92 + 0.08 * Math.sin(timeSec * 2.2 + i * 1.7);
        const cg = envGain * 0.14 * pulse;
        lights.push({
          kind: 'cloud',
          distFromPlayer: dPlayer,
          x: trailSampleA[0], y: trailSampleA[1], z: trailSampleA[2],
          range: 2.2 + 1.6 * envGain,
          color: [MYSTICISM_RGB[0] * cg, MYSTICISM_RGB[1] * cg, MYSTICISM_RGB[2] * cg]
        });
      }
    }
    return { vertices, count: ptr / 12, lights, particles, totalLen, liftedPoints };
  }
  const api={VERSION,BODY,Geometry,Graph,profile,snapshot,revision,actionRole,client,dist,length,xyz,ribbon,cloudTrail,MYSTICISM_RGB,CLOUD_PRESETS,bodyBlocked};
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
