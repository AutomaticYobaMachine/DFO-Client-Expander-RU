(function navigationPage(root) {
  'use strict';
  // The mod's own words, in the install's language (page/dfo_ui_text.js; English without the translation).
  const T = (key, params) => (root.__dfoUi ? root.__dfoUi.t(key, params) : key);
  const M = typeof module === 'object' && module.exports ? require('./dfo_dungeon_nav_model.js') : root.__dfoDungeonNavModel;
  const labels = { exit: T('nav.target.exit'), quest: T('nav.target.quest') };
  const none = { exit: T('nav.none.exit'), quest: T('nav.none.quest') };
  const G = typeof module === 'object' && module.exports ? require('./dfo_dungeon_graph.js') : root.__dfoDungeonGraph;
  function createNavigation(deps) {
    let state = { phase: 'idle', kind: null, uid: null, name: '', distance: null, message: '' };
    let owner = null, ownerSource = null, wanted = null, client = null, building = null, graphRevision = null, readKey = '';
    let seq = 0, calculating = false, route = null, routeLen = 0, routeSeq = 0, showing = [], plannedAt = -Infinity, lastAttempt = -Infinity, failedView = '';
    const now = () => deps.now?.() ?? Date.now();
    const hasEffect = v => v?.cartography != null ? !!v.cartography : M.hasCartography(v?.player ?? v?.sources?.entity);
    const notify = next => {
      const phase = next.phase !== undefined ? next.phase : state.phase;
      const kind = next.kind !== undefined ? next.kind : state.kind;
      const uid = next.uid !== undefined ? next.uid : state.uid;
      const name = next.name !== undefined ? next.name : state.name;
      const distance = next.distance !== undefined ? next.distance : state.distance;
      const message = next.message !== undefined ? next.message : state.message;
      if (phase === state.phase && kind === state.kind && uid === state.uid && name === state.name && distance === state.distance && message === state.message) return;
      state = { phase, kind, uid, name, distance, message };
      deps.changed?.({ ...state });
    };
    const read = (details = true, quests = wanted?.kind === 'quest', withGeo = details) => { try { const v = deps.read(details, quests); if (!v) return null; return withGeo ? { ...v, nav: { ...v.nav, collider: M.navigationGeometry(v.nav.collider) } } : v; } catch { return null; } };
    const groups = v => M.targets(v.live, v.sources, v.tools, v.questIds, wanted?.kind);
    const source = v => v.nav.collider?.source || v.nav.collider;
    const candidates = v => {
      let list = groups(v)[wanted.kind] || [];
      if (wanted.kind === 'quest') {
        if (wanted.uid) list = list.filter(t => t.uid === wanted.uid);
        else if (v.sources?.followedId != null && list.some(t => t.uid === String(v.sources.followedId))) list = list.filter(t => t.uid === String(v.sources.followedId));
      }
      return list;
    };
    const revision = v => G.revision(v.nav.collider, v.live.ctx.actions);
    const attemptKey = v => JSON.stringify([Array.from(v.nav.feet, x => Math.round(x)), candidates(v).map(t => [t.key, ...t.at.map(x => Math.round(x))]), revision(v)]);
    const disposeClient = () => { client?.dispose(); client = null; building = null; graphRevision = null; };
    function stop(hard = false) {
      seq++; calculating = false; wanted = null; route = null; routeLen = 0; showing = []; failedView = '';
      if (hard) { disposeClient(); owner = ownerSource = null; readKey = ''; }
      notify({ phase: 'idle', kind: null, uid: null, name: '', distance: null, message: '' });
    }
    function checkScene(v) {
      const latest = read(false);
      if (!latest || !hasEffect(latest) || latest.live.ctx !== v.live.ctx || source(latest) !== source(v) || latest.nav.key !== v.nav.key || latest.room !== v.room) throw Object.assign(new Error('cancelled'), { cancelled: true });
    }
    function check(v, token) { if (token !== seq || !wanted) throw Object.assign(new Error('cancelled'), { cancelled: true }); checkScene(v); }
    async function acquire(v) {
      const stamp = revision(v); if (client && graphRevision === stamp) { if (building) await building; return; }
      disposeClient(); graphRevision = stamp;
      const pause = async () => { checkScene(v); await deps.checkpoint?.(); checkScene(v); };
      const mine = deps.makeGraphClient?.({ checkpoint: pause }) || G.client({ checkpoint: pause }); client = mine;
      building = (async () => { const input = await G.snapshot(v.nav.collider, v.live.ctx.actions, pause); await mine.build(input); })();
      try { await building; } catch (e) { if (client === mine) disposeClient(); throw e; }
      finally { if (client === mine) building = null; }
    }
    async function solve(v, token) {
      calculating = true; plannedAt = lastAttempt = now(); let retry = false;
      try {
        await acquire(v); check(v, token);
        const current = read(); if (!current || !hasEffect(current)) throw Object.assign(new Error('cancelled'), { cancelled: true }); v = { ...current, nav: { ...current.nav, feet: M.point(current.nav.feet) } };
        const stamp = revision(v), targets = candidates(v).map(t => ({ ...t, at: M.point(t.at) }));
        if (stamp !== graphRevision) { retry = true; return; }
        if (!targets.length) { route = null; showing = []; notify({ phase: 'unavailable', distance: null, message: none[wanted.kind] }); return; }
        notify({ phase: 'routing', message: T('nav.routing'), distance: null });
        const pins = typeof v.nav.transitions === 'function' ? v.nav.transitions() : v.nav.transitions || [];
        const result = await client.route(v.nav.feet, targets, M.portalTransitions(v.live.ctx.actions, pins, v.nav.portalSurfaces), { riding: M.riding(v.nav.feet, v.nav.collider, v.live.ctx.actions) }); check(v, token);
        if (revision(v) !== stamp) { retry = true; return; }
        if (!result) { route = null; showing = []; failedView = attemptKey(v); notify({ phase: 'unavailable', distance: null, message: T('nav.noPath') }); return; }
        const latest = read(), fresh = latest && hasEffect(latest) ? candidates(latest).find(t => t.key === result.target.key) : null;
        if (!fresh || M.distance(fresh.at, result.target.at) > 1.1) { route = null; showing = []; retry = true; return; }
        route = result; routeLen = result.transition ? M.length(result.points) : 0; routeSeq++; failedView = '';
        const initialFollow = M.follow(result, latest.nav.feet, latest.nav.collider, latest.live.ctx.actions);
        if (initialFollow) showing = initialFollow.points;
        notify({ phase: 'following', name: fresh.name, message: '', distance: Math.ceil(result.distance) });
      } catch (e) {
        if (!e.cancelled && token === seq) { disposeClient(); route = null; routeLen = 0; showing = []; failedView = attemptKey(v); notify({ phase: 'unavailable', distance: null, message: e.message || T('nav.failed') }); }
      } finally { if (token === seq) { calculating = false; lastAttempt = retry ? -Infinity : now(); } }
    }
    function request(v) {
      const token = ++seq; route = null; routeLen = 0; showing = []; failedView = '';
      v = { ...v, nav: { ...v.nav, feet: M.point(v.nav.feet) } };
      notify({ phase: client ? 'routing' : 'building', name: labels[wanted.kind], message: client ? T('nav.routing') : T('nav.building'), distance: null });
      void solve(v, token);
    }
    function start(kind, uid = null) {
      const v = read(true, kind === 'quest'); if (!G || !labels[kind] || !v || !hasEffect(v) || !M.point(v.nav?.feet) || !v.nav.collider?._buckets) return false;
      if (owner && (owner !== v.live.ctx || ownerSource !== source(v) || readKey !== v.nav.key + '|' + v.room)) stop(true);
      wanted = { kind, uid: uid == null ? null : String(uid) }; owner = v.live.ctx; ownerSource = source(v); readKey = v.nav.key + '|' + v.room;
      notify({ kind, uid: wanted.uid, name: labels[kind] });
      if (!candidates(v).length) { seq++; calculating = false; route = null; routeLen = 0; showing = []; notify({ phase: 'unavailable', distance: null, message: none[kind] }); return false; }
      request(v); return true;
    }
    function tick() {
      const v = read(!!wanted);
      if (owner && (!v || owner !== v.live.ctx || ownerSource !== source(v) || readKey !== v.nav.key + '|' + v.room)) { stop(true); return; }
      if ((wanted || state.phase !== 'idle') && (!v || !hasEffect(v))) { stop(false); return; }
      if (!wanted || !v || calculating || !M.point(v.nav.feet)) return;
      const list = candidates(v);
      if (!list.length) { route = null; routeLen = 0; showing = []; notify({ phase: 'unavailable', distance: null, message: none[wanted.kind] }); return; }
      if (!route) { if (now() - lastAttempt > 1200 && (!failedView || failedView !== attemptKey(v))) request(v); return; }
      const target = list.find(t => t.key === route.target.key);
      if (!target || M.distance(target.at, route.target.at) > 1.1 || revision(v) !== graphRevision) { showing = []; if (now() - plannedAt > 350) request(v); return; }
      const followed = M.follow(route, v.nav.feet, v.nav.collider, v.live.ctx.actions);
      if (!followed) { showing = []; if (now() - plannedAt > 350) request(v); return; }
      showing = followed.points;
      const extra = route.transition ? Math.max(0, route.distance - routeLen) : 0;
      if (followed.remaining < (route.transition?.contact ? .15 : 1.2) && followed.off < (route.transition?.contact ? .5 : 1.6) && (route.transition || M.goalReached(target, v.nav.feet, v.nav.collider))) {
        showing = []; notify({ phase: route.transition ? 'transition' : 'arrived', name: target.name, distance: route.transition ? Math.ceil(followed.remaining + extra) : 0, message: route.transition ? '' : T('nav.arrived') }); return;
      }
      notify({ phase: 'following', name: target.name, distance: Math.ceil(followed.remaining + extra), message: '' });
    }
    return {
      start, stop, tick, state: () => ({ ...state }), points: () => showing, routeSeq: () => routeSeq, context: () => owner,
      matches: v => !!v && hasEffect(v) && owner === v.live.ctx && ownerSource === source(v) && readKey === v.nav.key + '|' + v.room,
      availability() { const v = read(true, true); if (!G || !v?.nav.collider?._buckets || !hasEffect(v)) return { ready: false }; const all = M.targets(v.live, v.sources, v.tools, v.questIds); return { ready: true, ...Object.fromEntries(Object.entries(all).map(([k, a]) => [k, a.length])) }; }
    };
  }
  if (typeof module === 'object' && module.exports) { module.exports = { createNavigation }; return; }
  if (root.__dfoDungeonNavigation || root.__DFO_MOD_CFG__?.dungeonNav?.enabled === false) return;
  let navHost = null;
  if (!root.__dfoDungeons) {
    // Minimal live bridge when Dungeon Intel (dfo_dungeons.js) is disabled while Dungeon Navigation stays enabled.
    root.__dfoDungeons = {
      register(value) { navHost = value; },
      liveInfo() {
        const t = { ...root.__dfoDungeonTools, ...navHost?.__dfoWorld, online: () => navHost?.params?.has('online') === true };
        const modes = t.modes?.();
        if (modes?.mode !== 'dungeon' || modes.transitioning) return null;
        const live = modes.dungeonCtx?.dfoDungeonLive;
        return live ? { live, world: t, tools: t, heading: null } : null;
      },
      isOpen: () => false,
      open: () => false,
      decorate: m => m,
      ensureStyles() { },
    };
  }
  const origRibbon = G?.ribbon;
  const doc = root.document; let drawPass = null, drawGL = null, budgetAt = performance.now(), questAt = -Infinity, questContext = null, questBridge = null, questIds = null, questRows = null, castPlayer = null, current = null, clockOffsetMs = 0, syncing = false;
  const FADE_IN_MS = 850, HOLD_MS = 3000, DISSIPATE_MS = 2000;
  const visualNow = () => performance.now() + clockOffsetMs;
  const lightPool = Array.from({ length: 8 }, () => ({ x: 0, y: 0, z: 0, range: 0, color: [0, 0, 0], aura: true, kind: 'particle', distFromPlayer: 0 }));
  const trailScratch = Array.from({ length: 5 }, () => ({ buf: new Float32Array(0) }));
  let mergeBuf = new Float32Array(0), frameCache = null, lastHudHidden = true, lastHudText = '';
  const trail = { ctx: null, sceneKey: '', colliderSource: null, active: null, fading: [], lights: [], lastRibbonPts: null, lastRibbonFn: null };
  const clearTrail = () => { trail.ctx = null; trail.sceneKey = ''; trail.colliderSource = null; trail.active = null; trail.fading = []; trail.lights = []; trail.lastRibbonPts = null; trail.lastRibbonFn = null; frameCache = null; };
  const copyPts = pts => pts.map(p => [p[0], p[1], p[2]]);
  const retireActive = now => {
    if (!trail.active) return;
    trail.fading.push({ points: trail.active.points, appearAt: trail.active.appearAt, lostAt: now, alpha: trail.active.alpha, dissipate: 0 });
    if (trail.fading.length > 4) trail.fading.splice(0, trail.fading.length - 4);
    trail.active = null; frameCache = null;
  };
  const CLOUD_VS = `#version 300 es
precision highp float;
layout(location=0)in vec3 aCenter;
layout(location=1)in vec2 aLocal;
layout(location=2)in vec4 aMeta;
layout(location=3)in vec3 aTail;
uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uEye;
out vec2 vLocal;
out vec4 vMeta;
out vec3 vTail;
out float vDist;
void main(){
  vec3 right=normalize(vec3(uView[0].x,uView[1].x,uView[2].x));
  vec3 up=normalize(vec3(uView[0].y,uView[1].y,uView[2].y));
  float radius=aMeta.x;
  float camDist=max(0.25,length(uEye-aCenter));
  if(aMeta.w>=2.5){
    float pxScale=camDist/max(0.5,uProj[1][1]);
    if(aMeta.w>=3.8){
      radius=clamp(radius,pxScale*0.012,pxScale*0.052);
    }else{
      radius=clamp(radius,pxScale*0.005,pxScale*0.024);
    }
  }
  vec3 worldPos;
  if(aMeta.w<1.5&&aTail.x>0.01){
    float tilt=(aTail.z-3.0)*0.24+sin(aMeta.z*6.2831853)*0.20;
    float ct=cos(tilt),st=sin(tilt);
    vec2 shaped=vec2(aLocal.x*aTail.x,aLocal.y*aTail.y);
    vec2 rot=vec2(shaped.x*ct-shaped.y*st,shaped.x*st+shaped.y*ct);
    worldPos=aCenter+(right*rot.x+up*rot.y)*radius;
  }else if(aMeta.w>=2.5&&aMeta.w<3.8&&dot(aTail,aTail)>1e-5){
    vec3 toEye=normalize(uEye-aCenter);
    vec3 side=cross(toEye,aTail);
    float sideLen=length(side);
    vec3 across=sideLen>1e-3?(side/sideLen):right;
    vec3 headFwd=sideLen>1e-3?normalize(cross(across,toEye)):up;
    if(dot(headFwd,-aTail)<0.0)headFwd=-headFwd;
    float tTail=clamp((0.5-aLocal.y)/1.5,0.0,1.0);
    float tCap=max(0.0,(aLocal.y-0.5)*2.0);
    vec3 spine=aCenter+aTail*tTail+headFwd*(tCap*radius);
    worldPos=spine+across*(aLocal.x*radius);
  }else{
    worldPos=aCenter+(right*aLocal.x+up*aLocal.y)*radius;
  }
  vLocal=aLocal;
  vMeta=aMeta;
  vTail=aTail;
  vDist=distance(worldPos,uEye);
  gl_Position=uProj*uView*vec4(worldPos,1.0);
}`;
  const CLOUD_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec4 vMeta;
in vec3 vTail;
in float vDist;
uniform float uTime;
uniform vec2 uFade;
out vec4 outColor;
float hash21(vec2 p){
  p=fract(p*vec2(123.34,456.21));
  p+=dot(p,p+45.32);
  return fract(p.x*p.y);
}
float noise2(vec2 p){
  vec2 i=floor(p);
  vec2 f=fract(p);
  vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash21(i),hash21(i+vec2(1.0,0.0)),u.x),mix(hash21(i+vec2(0.0,1.0)),hash21(i+vec2(1.0,1.0)),u.x),u.y);
}
float fbm3(vec2 p){
  float v=0.51*noise2(p);
  p=mat2(0.8,-0.6,0.6,0.8)*p*2.04+vec2(17.1,31.7);
  v+=0.30*noise2(p);
  p=mat2(0.8,0.6,-0.6,0.8)*p*2.06+vec2(43.9,11.3);
  v+=0.19*noise2(p);
  return v;
}
float fbm4(vec2 p){
  float v=0.46*noise2(p);
  p=mat2(0.8,-0.6,0.6,0.8)*p*2.04+vec2(17.1,31.7);
  v+=0.27*noise2(p);
  p=mat2(0.8,0.6,-0.6,0.8)*p*2.06+vec2(43.9,11.3);
  v+=0.17*noise2(p);
  p=mat2(0.76,-0.65,0.65,0.76)*p*2.03+vec2(19.4,57.2);
  v+=0.10*noise2(p);
  return v;
}
void main(){
  float distFade=1.0-smoothstep(uFade.x,uFade.y,vDist);
  float alpha=vMeta.y*distFade;
  if(alpha<=0.001)discard;
  float seed=vMeta.z;
  float mode=vMeta.w;
  // Exact 1:1 School of Mysticism stand color (#f472b6 = rgb(244, 114, 182))
  const vec3 MYSTICISM=vec3(244.0/255.0,114.0/255.0,182.0/255.0);
  const vec3 WHITE=vec3(1.0,1.0,1.0);
  if(mode>=3.8){
    // Mode 4.0: Per-particle bright-white bloom source (only within <= 50m of player)
    if(vDist>50.0)discard;
    float r2=dot(vLocal,vLocal);
    if(r2>1.0)discard;
    float glow=exp(-r2*3.6)*(1.0-r2)*(1.0-r2);
    float a=alpha*glow*(1.0-smoothstep(42.0,50.0,vDist));
    if(a<=0.001)discard;
    outColor=vec4(WHITE*(a*1.38),a*0.26);
    return;
  }
  if(mode>=2.5){
    // Mode 3.0 (near <= 50m) & Mode 3.5 (far > 50m cheap uniform): Crisp bright-white spark with sleek comet tail
    float x2=vLocal.x*vLocal.x;
    if(x2>1.0)discard;
    float intensity=0.0;
    if(vLocal.y>=0.5){
      float dy=(vLocal.y-0.5)*2.0;
      float hd2=x2+dy*dy;
      if(hd2>1.0)discard;
      intensity=exp(-hd2*10.5)*1.45+exp(-hd2*3.8)*(1.0-hd2)*0.52;
    }else{
      float tTail=clamp((0.5-vLocal.y)/1.5,0.0,1.0);
      float dyHead=tTail*2.8;
      float hd2=x2+dyHead*dyHead;
      float headPart=hd2<1.0?(exp(-hd2*10.5)*1.45+exp(-hd2*3.8)*(1.0-hd2)*0.52):0.0;
      float tailW=mix(0.46,0.04,tTail);
      float qx=vLocal.x/max(tailW,0.02);
      float qx2=qx*qx;
      float tailPart=qx2<1.0?(exp(-qx2*2.6)*(1.0-qx2)*(1.0-tTail)*(1.0-tTail)*0.95):0.0;
      intensity=max(headPart,tailPart);
    }
    float a=alpha*intensity;
    if(a<=0.001)discard;
    outColor=vec4(WHITE*min(1.5,a*1.32),min(1.0,a*0.62));
    return;
  }
  float r2=dot(vLocal,vLocal);
  if(r2>1.0)discard;
  if(mode>=1.5){
    // Mode 2.0: Pale soft Mysticism (#f472b6 1:1 hue) cloud bloom halo (drawn no further than 100m from player)
    if(vDist>100.0)discard;
    float glow=exp(-r2*3.2)*(1.0-r2)*(1.0-r2);
    float a=alpha*glow*(1.0-smoothstep(84.0,100.0,vDist));
    if(a<=0.001)discard;
    vec3 bloomCol=mix(MYSTICISM,vec3(1.0,0.90,0.96),0.28);
    outColor=vec4(bloomCol*(a*0.86),a*0.22);
    return;
  }
  // Mode 0..1: Pale translucent, ragged, domain-warped billowing Mysticism cloud (7 presets in vTail)
  if(r2>=0.90)discard;
  float dissipate=clamp(mode,0.0,1.0);
  float pid=vTail.z;
  float pScale=1.65+0.20*pid;
  float flowSign=mod(pid,2.0)<0.5?1.0:-1.0;
  float flowT=(0.48+0.14*seed)*uTime;
  float ang=seed*6.2831853+uTime*(0.22+0.14*seed)*flowSign;
  float ca=cos(ang),sa=sin(ang);
  vec2 ruv=mat2(ca,-sa,sa,ca)*(vLocal*vec2(1.0+0.16*sin(pid*1.7),1.0+0.16*cos(pid*2.3)));
  vec2 p=ruv*(pScale+0.95*dissipate)+vec2(seed*17.1+pid*5.3,seed*31.7-pid*3.9);
  vec2 q=vec2(
    fbm3(p*1.15+vec2(flowT*0.36*flowSign,-flowT*0.24)),
    fbm3(p*1.15+vec2(-flowT*0.28,flowT*0.34*flowSign)+vec2(4.7,8.3))
  );
  vec2 warp=q-0.5;
  vec2 r=vec2(
    fbm3(p*1.65+1.55*warp+vec2(flowT*0.48,-flowT*0.32*flowSign)),
    fbm3(p*1.65+1.55*warp+vec2(-flowT*0.41*flowSign,flowT*0.44)+vec2(9.2,1.8))
  );
  float f=fbm4(p*1.35+1.25*(r-0.5)+vec2(0.0,-flowT*0.22));
  float wisps=smoothstep(0.20,0.88,f)*0.64+smoothstep(0.26,0.92,1.0-abs(r.x-0.5)*2.0)*0.36;
  float edgeMask=1.0-smoothstep(0.42,0.90,r2);
  float warpedR2=r2+(q.x-0.5)*0.44+(r.y-0.5)*0.32+(f-0.5)*0.20;
  float radial=pow(max(0.0,1.0-warpedR2),1.70+0.65*dissipate)*edgeMask;
  float density=radial*wisps*1.40;
  float cut=0.14+dissipate*0.44;
  float smoke=smoothstep(cut,cut+0.78,density)*(0.45+0.55*f)*(1.0-0.88*dissipate);
  float a=alpha*smoke;
  if(a<=0.001)discard;
  vec3 paleMist=mix(MYSTICISM,vec3(0.99,0.91,0.96),0.48+0.18*r.x);
  vec3 col=paleMist*(0.76+0.34*smoothstep(0.18,0.82,f));
  outColor=vec4(col*a,min(0.95,a*0.86));
}`;
  class CloudPass {
    constructor(gl) {
      this.gl = gl; this.capBytes = 0;
      const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader compile failed'); return s; };
      const vs = compile(gl.VERTEX_SHADER, CLOUD_VS), fs = compile(gl.FRAGMENT_SHADER, CLOUD_FS);
      const prog = this.program = gl.createProgram();
      gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
      gl.deleteShader(vs); gl.deleteShader(fs);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'program link failed');
      this.u = {
        proj: gl.getUniformLocation(prog, 'uProj'),
        view: gl.getUniformLocation(prog, 'uView'),
        eye: gl.getUniformLocation(prog, 'uEye'),
        time: gl.getUniformLocation(prog, 'uTime'),
        fade: gl.getUniformLocation(prog, 'uFade')
      };
      this.vao = gl.createVertexArray();
      this.buf = gl.createBuffer();
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      const stride = 12 * 4;
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 20);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, stride, 36);
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
    draw(renderer, vertices, count, timeSec) {
      const gl = this.gl, proj = renderer._proj, view = renderer._view, eye = renderer._camPos;
      if (!proj || !view || !eye || !count) return;
      renderer.endUiRun?.();
      gl.useProgram(this.program);
      gl.uniformMatrix4fv(this.u.proj, false, proj);
      gl.uniformMatrix4fv(this.u.view, false, view);
      gl.uniform3f(this.u.eye, eye[0], eye[1], eye[2]);
      gl.uniform1f(this.u.time, timeSec % 240);
      gl.uniform2f(this.u.fade, 95, 130);
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      const byteLen = count * 12 * 4;
      const upload = vertices.byteLength === byteLen ? vertices : vertices.subarray(0, count * 12);
      if (byteLen > this.capBytes) {
        this.capBytes = Math.max(byteLen, this.capBytes * 2, 65536);
        gl.bufferData(gl.ARRAY_BUFFER, this.capBytes, gl.DYNAMIC_DRAW);
      }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, upload);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLES, 0, count);
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.depthFunc(gl.LESS);
      gl.depthMask(true);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.BLEND);
      gl.enable(gl.CULL_FACE);
      renderer.markForeignPass?.();
    }
    dispose() {
      const gl = this.gl; if (!gl) return;
      if (this.buf) gl.deleteBuffer(this.buf);
      if (this.vao) gl.deleteVertexArray(this.vao);
      if (this.program) gl.deleteProgram(this.program);
      this.buf = this.vao = this.program = null; this.capBytes = 0;
    }
  }
  const tr = s => { try { return root.__translate?.(s) || s; } catch { return s; } };
  const el = (tag, cls, text) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const button = (text, fn, cls = 'dfo-ornate-btn') => { const n = el('button', cls, text); n.type = 'button'; n.onclick = fn; return n; };
  const disposeDraw = () => { try { drawPass?.dispose(); } catch { } drawPass = drawGL = null; clearTrail(); };
  const read = (details = true, includeQuests = details) => {
    const info = root.__dfoDungeons?.liveInfo(false);
    const nextContext = info?.live?.ctx ?? null, nextBridge = info?.live?.questBridge ?? null;
    if (questContext !== nextContext || questBridge !== nextBridge) { questContext = nextContext; questBridge = nextBridge; questIds = questRows = null; questAt = -Infinity; }
    if (!info) return null;
    const nav = info.live.ctx.dfoDungeonNavigation; if (!nav?.collider || !nav.feet) return null;
    const modes = info.world.modes?.();
    const player = info.world?.player?.() ?? info.tools?.player?.() ?? modes?.dfoDungeonQuestSources?.entity ?? castPlayer?.deref?.() ?? null;
    const cartography = M.hasCartography(player);
    if (details && includeQuests && performance.now() - questAt >= 250) {
      questAt = performance.now(); let log = null, failed = false; try { log = questBridge?.questLog?.({ windows: false }); } catch { failed = true; }
      const rows = failed ? [] : log ? [...(log.active || []), ...(log.unlogged || [])] : null;
      questIds = rows ? new Set(rows.map(q => String(q.id))) : null; questRows = rows ? new Map(rows.map(q => [String(q.id), q])) : null;
    }
    return { ...info, nav, player, cartography, sources: { entity: player, ...modes?.dfoDungeonQuestSources, questRows }, questIds: details && includeQuests ? questIds : null, room: info.world.presence?.()?.room || '' };
  };
  const FRAME_SVG_URI = "url(\"data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20width%3D'25'%20height%3D'25'%20shape-rendering%3D'crispEdges'%3E%3Crect%20x%3D'0'%20y%3D'0'%20width%3D'25'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'0'%20y%3D'1'%20width%3D'1'%20height%3D'24'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'1'%20y%3D'1'%20width%3D'9'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'10'%20y%3D'1'%20width%3D'1'%20height%3D'5'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'11'%20y%3D'1'%20width%3D'3'%20height%3D'1'%20fill%3D'%23c2b79a'%2F%3E%3Crect%20x%3D'14'%20y%3D'1'%20width%3D'1'%20height%3D'5'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'15'%20y%3D'1'%20width%3D'9'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'24'%20y%3D'1'%20width%3D'1'%20height%3D'24'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'1'%20y%3D'2'%20width%3D'1'%20height%3D'8'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'2'%20y%3D'2'%20width%3D'7'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'9'%20y%3D'2'%20width%3D'1'%20height%3D'4'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'11'%20y%3D'2'%20width%3D'3'%20height%3D'1'%20fill%3D'%239a9079'%2F%3E%3Crect%20x%3D'15'%20y%3D'2'%20width%3D'1'%20height%3D'4'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'16'%20y%3D'2'%20width%3D'7'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'23'%20y%3D'2'%20width%3D'1'%20height%3D'8'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'11'%20y%3D'3'%20width%3D'3'%20height%3D'1'%20fill%3D'%237a7260'%2F%3E%3Crect%20x%3D'2'%20y%3D'4'%20width%3D'2'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'4'%20y%3D'4'%20width%3D'3'%20height%3D'1'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'7'%20y%3D'4'%20width%3D'2'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'11'%20y%3D'4'%20width%3D'3'%20height%3D'1'%20fill%3D'%235a5446'%2F%3E%3Crect%20x%3D'16'%20y%3D'4'%20width%3D'2'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'18'%20y%3D'4'%20width%3D'3'%20height%3D'1'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'21'%20y%3D'4'%20width%3D'2'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'4'%20y%3D'5'%20width%3D'1'%20height%3D'2'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'5'%20y%3D'5'%20width%3D'1'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'6'%20y%3D'5'%20width%3D'1'%20height%3D'2'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'11'%20y%3D'5'%20width%3D'3'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'5'%20width%3D'1'%20height%3D'2'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'19'%20y%3D'5'%20width%3D'1'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'20'%20y%3D'5'%20width%3D'1'%20height%3D'2'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'5'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'7'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'8'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'9'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'10'%20y%3D'6'%20width%3D'5'%20height%3D'1'%20fill%3D'%2316140f'%2F%3E%3Crect%20x%3D'15'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'16'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'17'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'19'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'4'%20y%3D'7'%20width%3D'3'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'7'%20y%3D'7'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'8'%20y%3D'7'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'9'%20y%3D'7'%20width%3D'7'%20height%3D'1'%20fill%3D'%230c0d10'%2F%3E%3Crect%20x%3D'16'%20y%3D'7'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'17'%20y%3D'7'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'18'%20y%3D'7'%20width%3D'3'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'4'%20y%3D'8'%20width%3D'2'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'6'%20y%3D'8'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'7'%20y%3D'8'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'17'%20y%3D'8'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'8'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'19'%20y%3D'8'%20width%3D'2'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'2'%20y%3D'9'%20width%3D'4'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'6'%20y%3D'9'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'7'%20y%3D'9'%20width%3D'1'%20height%3D'7'%20fill%3D'%230c0d10'%2F%3E%3Crect%20x%3D'17'%20y%3D'9'%20width%3D'1'%20height%3D'7'%20fill%3D'%231c1a15'%2F%3E%3Crect%20x%3D'18'%20y%3D'9'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'19'%20y%3D'9'%20width%3D'4'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'1'%20y%3D'10'%20width%3D'5'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'6'%20y%3D'10'%20width%3D'1'%20height%3D'5'%20fill%3D'%2316140f'%2F%3E%3Crect%20x%3D'18'%20y%3D'10'%20width%3D'1'%20height%3D'5'%20fill%3D'%235a5446'%2F%3E%3Crect%20x%3D'19'%20y%3D'10'%20width%3D'5'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'1'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%23c2b79a'%2F%3E%3Crect%20x%3D'2'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%239a9079'%2F%3E%3Crect%20x%3D'3'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%237a7260'%2F%3E%3Crect%20x%3D'4'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%235a5446'%2F%3E%3Crect%20x%3D'5'%20y%3D'11'%20width%3D'1'%20height%3D'4'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'19'%20y%3D'11'%20width%3D'1'%20height%3D'4'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'20'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%234f4838'%2F%3E%3Crect%20x%3D'21'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%23443e31'%2F%3E%3Crect%20x%3D'22'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%233a352a'%2F%3E%3Crect%20x%3D'23'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%2325221b'%2F%3E%3Crect%20x%3D'1'%20y%3D'14'%20width%3D'4'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'20'%20y%3D'14'%20width%3D'4'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'1'%20y%3D'15'%20width%3D'1'%20height%3D'9'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'2'%20y%3D'15'%20width%3D'4'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'6'%20y%3D'15'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'15'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'19'%20y%3D'15'%20width%3D'4'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'23'%20y%3D'15'%20width%3D'1'%20height%3D'9'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'2'%20y%3D'16'%20width%3D'4'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'6'%20y%3D'16'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'7'%20y%3D'16'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'17'%20y%3D'16'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'16'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'19'%20y%3D'16'%20width%3D'4'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'6'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'7'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'8'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'9'%20y%3D'17'%20width%3D'7'%20height%3D'1'%20fill%3D'%231c1a15'%2F%3E%3Crect%20x%3D'16'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'17'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'18'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'2'%20y%3D'18'%20width%3D'2'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'4'%20y%3D'18'%20width%3D'1'%20height%3D'3'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'5'%20y%3D'18'%20width%3D'2'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'7'%20y%3D'18'%20width%3D'1'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'8'%20y%3D'18'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'9'%20y%3D'18'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'10'%20y%3D'18'%20width%3D'5'%20height%3D'1'%20fill%3D'%235a5446'%2F%3E%3Crect%20x%3D'15'%20y%3D'18'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'16'%20y%3D'18'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'17'%20y%3D'18'%20width%3D'1'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'18'%20y%3D'18'%20width%3D'2'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'20'%20y%3D'18'%20width%3D'1'%20height%3D'3'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'21'%20y%3D'18'%20width%3D'2'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'5'%20y%3D'19'%20width%3D'1'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'6'%20y%3D'19'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'8'%20y%3D'19'%20width%3D'1'%20height%3D'4'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'9'%20y%3D'19'%20width%3D'1'%20height%3D'4'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'10'%20y%3D'19'%20width%3D'5'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'15'%20y%3D'19'%20width%3D'1'%20height%3D'4'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'16'%20y%3D'19'%20width%3D'1'%20height%3D'4'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'18'%20y%3D'19'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'19'%20y%3D'19'%20width%3D'1'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'5'%20y%3D'20'%20width%3D'2'%20height%3D'1'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'10'%20y%3D'20'%20width%3D'1'%20height%3D'5'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'11'%20y%3D'20'%20width%3D'3'%20height%3D'1'%20fill%3D'%234f4838'%2F%3E%3Crect%20x%3D'14'%20y%3D'20'%20width%3D'1'%20height%3D'5'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'20'%20width%3D'2'%20height%3D'1'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'4'%20y%3D'21'%20width%3D'3'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'11'%20y%3D'21'%20width%3D'3'%20height%3D'1'%20fill%3D'%23443e31'%2F%3E%3Crect%20x%3D'18'%20y%3D'21'%20width%3D'3'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'11'%20y%3D'22'%20width%3D'3'%20height%3D'1'%20fill%3D'%233a352a'%2F%3E%3Crect%20x%3D'2'%20y%3D'23'%20width%3D'8'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'11'%20y%3D'23'%20width%3D'3'%20height%3D'1'%20fill%3D'%2325221b'%2F%3E%3Crect%20x%3D'15'%20y%3D'23'%20width%3D'8'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'1'%20y%3D'24'%20width%3D'9'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'11'%20y%3D'24'%20width%3D'3'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'15'%20y%3D'24'%20width%3D'9'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3C%2Fsvg%3E\")";
  const hud = doc.createElement('div'); hud.className = 'dfo-navigation-hud'; hud.hidden = true; hud.setAttribute('aria-live', 'polite');
  const style = doc.createElement('style'); style.textContent = `
.dfo-navigation-hud{position:fixed;left:50%;bottom:16vh;transform:translateX(-50%);max-width:80vw;z-index:7;pointer-events:none;text-align:center;white-space:pre-line;padding:8px 14px;border:1px solid rgba(244,114,182,.55);background:rgba(15,17,22,.90);box-shadow:inset 0 0 0 1px rgba(0,0,0,.85),0 4px 14px rgba(0,0,0,.65);color:#f6e7b0;font:13px 'DFO Gabin',var(--data,serif);line-height:1.5}
.dfo-navigation-hud[hidden]{display:none}
dialog.dfo-cartography-dialog{width:min(540px,calc(100vw - 32px));max-height:min(440px,calc(100vh - 40px));padding:0;margin:auto;display:flex;flex-direction:column;box-sizing:border-box;border:2px solid #7d7460;border-image:${FRAME_SVG_URI} 12 / 12px / 6px stretch;background-color:var(--dfo-bg-window,rgba(12,14,18,.93));background-image:var(--dfo-bg-dither-img,repeating-conic-gradient(rgba(255,255,255,.022) 0 25%,transparent 0 50%));background-size:var(--dfo-bg-dither-size,4px 4px);box-shadow:4px 4px 0 6px rgba(0,0,0,.42),0 12px 34px rgba(0,0,0,.78);border-radius:0;color:var(--bone,#f1e6c8);font-family:'DFO Gabin',var(--data,serif);outline:none;backdrop-filter:none;-webkit-backdrop-filter:none}
dialog.dfo-cartography-dialog:not([open]){display:none}
dialog.dfo-cartography-dialog::backdrop{background:var(--dfo-bg-scrim,rgba(5,7,10,.72));backdrop-filter:none;-webkit-backdrop-filter:none}
dialog.dfo-dungeon-dialog.dfo-cartography-dialog .wh{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px 10px 15px;background-color:rgba(14,16,21,.94);background-image:linear-gradient(180deg,rgba(62,56,44,.38) 0%,rgba(24,26,32,.55) 56%,rgba(10,12,16,.72) 100%);border-bottom:1px solid #050608;box-shadow:0 1px 0 rgba(163,152,128,.28),inset 0 1px 0 rgba(255,244,214,.08);color:#f6e7b0;font-family:'DFO Greengoth',var(--display,Georgia,serif);font-size:15px;letter-spacing:.06em}
dialog.dfo-dungeon-dialog.dfo-cartography-dialog .dfo-dungeon-title{white-space:normal;overflow-wrap:anywhere;font-size:16.5px;color:#f6e7b0;text-shadow:0 2px 0 #000,0 0 6px rgba(0,0,0,.75)}
dialog.dfo-dungeon-dialog.dfo-cartography-dialog .dfo-dungeon-title::before{content:'◆ ';font-size:10px;color:#b7a071;vertical-align:1px;margin-right:4px;text-shadow:none}
dialog.dfo-dungeon-dialog.dfo-cartography-dialog .wh button.dfo-win-x{background:rgba(14,16,21,.88);border:1px solid rgba(154,144,121,.48);color:#d7cbb0;cursor:pointer;font:inherit;font-size:15px;line-height:1;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border-radius:1px;box-shadow:inset 0 1px 0 rgba(255,244,214,.10);transition:color 120ms ease,border-color 120ms ease,background 120ms ease}
dialog.dfo-dungeon-dialog.dfo-cartography-dialog .wh button.dfo-win-x:hover{color:#fff7dc;border-color:#d5b26e;background:rgba(213,178,110,.14)}
.dfo-cartography-dialog .wb{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:12px 14px 14px;display:flex;flex-direction:column;gap:10px;font-size:13px;line-height:1.45;scrollbar-width:thin;scrollbar-color:#756346 #0c0e11}
.dfo-cartography-dialog .wb::-webkit-scrollbar{width:7px;height:7px}
.dfo-cartography-dialog .wb::-webkit-scrollbar-track{background:#0c0e11}
.dfo-cartography-dialog .wb::-webkit-scrollbar-thumb{background:linear-gradient(180deg,#5e4f37,#3e3424);border:1px solid #14171c}
.dfo-cartography-dialog .dfo-rar-card{--dfo-rar:#9a9079;position:relative;padding:10px 12px;background-color:var(--dfo-bg-panel,rgba(15,17,22,.92));background-image:linear-gradient(180deg,rgba(154,144,121,.08) 0%,rgba(154,144,121,.02) 32px,transparent 68px);border:1px solid rgba(154,144,121,.46);box-shadow:inset 0 0 0 1px rgba(0,0,0,.85),0 4px 14px rgba(0,0,0,.55);color:#e9e4d9}
.dfo-cartography-dialog .dfo-rar-card::before{content:"";position:absolute;inset:3px;border:1px solid rgba(255,255,255,.06);pointer-events:none}
.dfo-cartography-dialog .dfo-item-corners{position:absolute;inset:0;pointer-events:none}
.dfo-cartography-dialog .dfo-item-corners>i{position:absolute;width:9px;height:9px;background:var(--dfo-rar);opacity:.92}
.dfo-cartography-dialog .dfo-item-corners>i:nth-child(1){top:0;left:0;clip-path:polygon(0 0,100% 0,0 100%)}
.dfo-cartography-dialog .dfo-item-corners>i:nth-child(2){top:0;right:0;clip-path:polygon(0 0,100% 0,100% 100%)}
.dfo-cartography-dialog .dfo-item-corners>i:nth-child(3){bottom:0;left:0;clip-path:polygon(0 0,0 100%,100% 100%)}
.dfo-cartography-dialog .dfo-item-corners>i:nth-child(4){bottom:0;right:0;clip-path:polygon(100% 0,0 100%,100% 100%)}
.dfo-cartography-dialog .dfo-rar-card-desc{font-family:'DFO Flow',var(--body,Georgia,serif);font-size:12.5px;line-height:1.42;color:#d6ceb8}
.dfo-cartography-dialog .dfo-stat-plaque{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;background-color:var(--dfo-bg-panel,rgba(15,17,22,.92));background-image:linear-gradient(180deg,rgba(213,178,110,.11) 0%,transparent 38px);border:1px solid rgba(117,99,70,.55);border-left:3px solid #d5b26e;box-shadow:inset 0 0 0 1px rgba(0,0,0,.72)}
.dfo-cartography-dialog .dfo-stat-label{font-family:'DFO Gabin',var(--data,serif);font-size:12px;letter-spacing:.04em;color:#f1e6c8}
.dfo-cartography-dialog .dfo-stat-value{font-family:'DFO Flexi',var(--data,monospace);font-variant-numeric:tabular-nums;font-size:13.5px;color:#f5d451;text-shadow:0 1px 0 #000}
.dfo-nav-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:2px 0}
.dfo-cartography-dialog .dfo-ornate-btn{--dfo-c:#d4b16a;position:relative;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:32px;padding:7px 14px;box-sizing:border-box;border:1px solid #6e5c3e;border-top-color:#9e8355;border-bottom-color:#3b301f;border-radius:1px;background:linear-gradient(180deg,#272219 0%,#191510 55%,#120f0b 100%);box-shadow:inset 0 1px 0 rgba(255,224,150,.14),inset 0 -1px 0 rgba(0,0,0,.72),0 1px 2px rgba(0,0,0,.55);color:#f1e6c8;font-family:'DFO Gabin',var(--data,serif);font-size:13px;letter-spacing:.03em;line-height:1.2;text-shadow:0 1px 0 #000;cursor:pointer;user-select:none;transition:filter 120ms ease,transform 80ms ease,border-color 120ms ease}
.dfo-cartography-dialog .dfo-ornate-btn::before{content:"";position:absolute;inset:2px;border:1px solid rgba(213,178,110,.24);pointer-events:none}
.dfo-cartography-dialog .dfo-ornate-btn::after{content:"";position:absolute;inset:2px;pointer-events:none;background:linear-gradient(var(--dfo-c),var(--dfo-c)) top left/5px 1px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) top left/1px 5px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) top right/5px 1px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) top right/1px 5px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) bottom left/5px 1px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) bottom left/1px 5px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) bottom right/5px 1px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) bottom right/1px 5px no-repeat}
.dfo-cartography-dialog .dfo-ornate-btn:hover:not(:disabled){filter:brightness(1.16);border-color:#9e8355;border-top-color:#d5b26e}
.dfo-cartography-dialog .dfo-ornate-btn:active:not(:disabled){transform:translateY(1px);filter:brightness(.95)}
.dfo-cartography-dialog .dfo-ornate-btn:disabled{opacity:.45;cursor:default;filter:grayscale(.4)}
.dfo-cartography-dialog .dfo-ornate-btn.primary{--dfo-c:#fde68a;border-color:#a6823f;border-top-color:#e4c175;border-bottom-color:#4f3b18;background:linear-gradient(180deg,#4b391a 0%,#2f230e 56%,#1f1709 100%);color:#fde68a}
.dfo-cartography-dialog .dfo-ornate-btn.primary::before{border-color:rgba(253,230,138,.32)}
.dfo-cartography-dialog .dfo-ornate-btn.silver{--dfo-c:#f08a80;border-color:#a1463e #4c1b18 #2d0e0c #782e28;background:repeating-linear-gradient(-45deg,rgba(176,56,48,.22) 0 4px,rgba(16,7,9,.34) 4px 8px),linear-gradient(180deg,#3d1618 0%,#250c0e 58%,#160709 100%);box-shadow:0 0 0 1px #050608,inset 0 0 0 1px rgba(240,138,128,.18),inset 0 1px 0 rgba(255,204,198,.16);color:#fce0dc}
.dfo-cartography-dialog .dfo-ornate-btn.silver::before{border-color:rgba(240,138,128,.28)}
.dfo-cartography-dialog .dfo-ornate-btn.silver:hover:not(:disabled){--dfo-c:#ffb0a7;color:#fff0ee;border-color:#c85a46;background:repeating-linear-gradient(-45deg,rgba(212,78,66,.28) 0 4px,rgba(22,9,11,.28) 4px 8px),linear-gradient(180deg,#521d20 0%,#341114 58%,#200a0c 100%);box-shadow:0 0 0 1px #050608,0 0 10px rgba(200,90,70,.3),inset 0 0 0 1px rgba(255,176,167,.28)}
.dfo-cartography-dialog .dfo-nav-actions .dfo-ornate-btn{min-height:42px;padding:10px 14px;font-size:13.5px}
.dfo-cartography-dialog .dfo-nav-actions .dfo-ornate-btn[aria-pressed="true"]{--dfo-c:#fde68a;border-color:#a6823f;border-top-color:#e4c175;border-bottom-color:#4f3b18;background:linear-gradient(180deg,#4b391a 0%,#2f230e 56%,#1f1709 100%);color:#fde68a}
.dfo-cartography-dialog .dfo-nav-actions .dfo-ornate-btn[aria-pressed="true"]::before{border-color:rgba(253,230,138,.32)}
.dfo-cartography-dialog .acts{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding:8px 14px 12px;background:var(--dfo-bg-footer,rgba(0,0,0,.22));border-top:1px solid #050608;box-shadow:inset 0 1px 0 rgba(163,152,128,.26)}
.dfo-cartography-dialog .dfo-dungeon-footer-btns{display:flex;gap:8px;margin-left:auto}
@media(max-width:520px){.dfo-nav-actions{grid-template-columns:1fr}}
`;
  doc.head.append(style); if (doc.body) doc.body.append(hud); else doc.addEventListener('DOMContentLoaded', () => doc.body.append(hud), { once: true });
  const controller = createNavigation({
    read, now: () => performance.now(),
    async checkpoint() { if (performance.now() - budgetAt < 4) return; await new Promise(r => root.requestAnimationFrame(r)); budgetAt = performance.now(); },
    changed() {
      frameCache = null;
      if (current) renderDialog(true);
      const syncCtx = controller.context() || trail.ctx;
      if (syncCtx && !syncing) syncTrail(syncCtx, false);
      root.dispatchEvent(new CustomEvent('dfo-navigation-change'));
    }
  });
  function syncTrail(ctx, buildGeom = true) {
    if (syncing) return null;
    syncing = true;
    try {
      const now = visualNow(), v = read(false);
      const colliderSource = v?.nav?.collider?.source || v?.nav?.collider || null;
      const sceneKey = v ? `${v.nav?.key ?? ''}|${v.room ?? ''}` : '';
      if (!v || v.live?.ctx !== ctx || (trail.ctx && (trail.ctx !== ctx || trail.sceneKey !== sceneKey || trail.colliderSource !== colliderSource))) {
        clearTrail();
        if (!v || v.live?.ctx !== ctx) { if (controller.context() === ctx) controller.stop(true); return null; }
      }
      if (controller.context() === ctx && !controller.matches(v)) {
        controller.stop(!v || controller.context() !== v.live?.ctx);
      }
      const rawPts = controller.context() === ctx && controller.matches(v) ? controller.points() : [];
      const curSeq = controller.routeSeq();
      const routeLive = rawPts.length >= 2 && M.distance(v.nav.feet, rawPts[0]) <= 2.5;
      trail.ctx = ctx; trail.sceneKey = sceneKey; trail.colliderSource = colliderSource;
      if (routeLive) {
        if (trail.active && trail.active.routeSeq !== curSeq) retireActive(now);
        if (!trail.active) {
          trail.active = { points: copyPts(rawPts), rawRef: rawPts, routeSeq: curSeq, appearAt: now, alpha: 0.38 };
        } else if (trail.active.rawRef !== rawPts) {
          trail.active.points = copyPts(rawPts);
          trail.active.rawRef = rawPts;
        }
        const graphApi = root.__dfoDungeonGraph;
        if (!v.live.blocked() && graphApi?.ribbon && graphApi.ribbon !== origRibbon && (trail.lastRibbonPts !== rawPts || trail.lastRibbonFn !== graphApi.ribbon)) {
          trail.lastRibbonPts = rawPts; trail.lastRibbonFn = graphApi.ribbon;
          graphApi.ribbon(rawPts, .055);
        }
      } else {
        retireActive(now);
      }
      for (let i = 0; i < trail.fading.length; i++) {
        const f = trail.fading[i], elapsed = Math.max(0, now - f.lostAt);
        if (elapsed >= HOLD_MS + DISSIPATE_MS) { trail.fading.splice(i--, 1); continue; }
        const inT = Math.max(0, Math.min(1, (now - f.appearAt) / FADE_IN_MS));
        const fadeIn = 0.38 + 0.62 * (inT * inT * (3 - 2 * inT));
        let diss = 0, fadeOut = 1;
        if (elapsed > HOLD_MS) {
          const u = Math.max(0, Math.min(1, (elapsed - HOLD_MS) / DISSIPATE_MS));
          diss = u * u * (3 - 2 * u);
          fadeOut = Math.pow(1 - diss, 1.35);
        }
        f.alpha = fadeIn * fadeOut;
        f.dissipate = diss;
      }
      if (v.live.blocked() || (!trail.active && !trail.fading.length)) {
        trail.lights = []; frameCache = null;
        return null;
      }
      if (!buildGeom) {
        if (trail.active) {
          const inT = Math.max(0, Math.min(1, (now - trail.active.appearAt) / FADE_IN_MS));
          trail.active.alpha = 0.38 + 0.62 * (inT * inT * (3 - 2 * inT));
        }
        frameCache = null;
        return null;
      }
      const builtList = [], builtLights = [], nowSec = now / 1000, cloudFn = root.__dfoDungeonGraph?.cloudTrail;
      let slot = 0;
      if (trail.active) {
        const inT = Math.max(0, Math.min(1, (now - trail.active.appearAt) / FADE_IN_MS));
        trail.active.alpha = 0.38 + 0.62 * (inT * inT * (3 - 2 * inT));
        const b = cloudFn?.(trail.active.points, nowSec, {
          alpha: trail.active.alpha, dissipate: 0, lift: 1.0, playerPos: v?.nav?.feet, minimal: true, out: trailScratch[slot++]
        });
        if (b && b.count) { builtList.push(b); if (b.lights?.length) for (let i = 0; i < b.lights.length; i++)builtLights.push(b.lights[i]); }
      }
      for (let fi = 0; fi < trail.fading.length; fi++) {
        const f = trail.fading[fi];
        if (f.alpha <= 0.002) continue;
        const holder = trailScratch[slot] || (trailScratch[slot] = { buf: new Float32Array(0) }); slot++;
        const b = cloudFn?.(f.points, nowSec, {
          alpha: f.alpha, dissipate: f.dissipate, lift: 1.0, playerPos: v?.nav?.feet, detached: true, minimal: true, out: holder
        });
        if (b && b.count) { builtList.push(b); if (b.lights?.length) for (let i = 0; i < b.lights.length; i++)builtLights.push(b.lights[i]); }
      }
      if (!builtList.length) { trail.lights = []; frameCache = null; return null; }
      let vertices, count;
      if (builtList.length === 1) {
        vertices = builtList[0].vertices; count = builtList[0].count;
      } else {
        let totalFloats = 0; count = 0;
        for (let i = 0; i < builtList.length; i++) { totalFloats += builtList[i].vertices.length; count += builtList[i].count; }
        if (mergeBuf.length < totalFloats) mergeBuf = new Float32Array(Math.max(totalFloats, mergeBuf.length * 2));
        let off = 0;
        for (let i = 0; i < builtList.length; i++) { const bv = builtList[i].vertices; mergeBuf.set(bv, off); off += bv.length; }
        vertices = mergeBuf.subarray(0, totalFloats);
      }
      const activeLights = [];
      for (let i = 0; i < builtLights.length && i < lightPool.length; i++) {
        const src = builtLights[i], dst = lightPool[i];
        dst.x = src.x; dst.y = src.y; dst.z = src.z;
        dst.range = src.range;
        dst.kind = src.kind || 'particle';
        dst.distFromPlayer = src.distFromPlayer ?? 0;
        dst.color[0] = src.color[0]; dst.color[1] = src.color[1]; dst.color[2] = src.color[2];
        activeLights.push(dst);
      }
      trail.lights = activeLights;
      const step = { built: { vertices, count, lights: activeLights }, nowSec };
      frameCache = { ctx, at: now, rawPts, routeSeq: curSeq, step };
      return step;
    } finally { syncing = false; }
  }
  function closeDialog() {
    const state = current; if (!state) return; current = null; state.owner.done = true; state.live.unmount(state.owner); state.node.close(); state.node.remove();
    if (state.prior?.isConnected) state.prior.focus({ preventScroll: true });
  }
  function makeCornerCard(text) {
    const card = el('div', 'dfo-rar-card');
    const corners = el('span', 'dfo-item-corners');
    for (let i = 0; i < 4; i++)corners.append(doc.createElement('i'));
    const desc = el('div', 'dfo-rar-card-desc dfo-dungeon-note', text);
    card.append(corners, desc);
    return card;
  }
  function renderDialog(force = false) {
    const state = current, v = read(true, true); if (!state) return;
    if (!v || !v.cartography || v.live.ctx !== state.ctx || state.owner.done || v.live.owns?.(state.owner) === false) { closeDialog(); return; }
    const available = controller.availability(), navState = controller.state();
    const signature = `${available.ready ? 1 : 0}|${available.exit || 0}|${available.quest || 0}|${navState?.phase || ''}|${navState?.kind || ''}|${navState?.uid || ''}|${navState?.name || ''}|${navState?.distance ?? ''}|${navState?.message || ''}`;
    if (!force && state.signature === signature) return;
    state.signature = signature;
    const focused = doc.activeElement?.dataset?.navControl;
    state.body.replaceChildren();
    state.body.append(makeCornerCard(T('live.nav.help')));
    const buttons = el('div', 'dfo-nav-actions');
    for (const [kind, text, reason] of [['exit', T('live.nav.toExit'), T('live.nav.noExit')], ['quest', T('live.nav.toQuest'), T('live.nav.noQuest')]]) {
      const active = navState?.kind === kind && navState.phase !== 'idle';
      const b = button(text, () => { if (controller.start(kind)) closeDialog(); else renderDialog(true); }, active ? 'dfo-ornate-btn primary' : 'dfo-ornate-btn');
      b.dataset.navControl = kind; b.disabled = !available.ready || !available[kind];
      b.title = !available.ready ? T('live.nav.preparing') : available[kind] ? '' : reason;
      b.setAttribute('aria-pressed', String(active));
      buttons.append(b);
    }
    state.body.append(buttons);
    if (navState?.phase !== 'idle' && navState?.kind) {
      const plaque = el('div', 'dfo-stat-plaque');
      plaque.append(
        el('div', 'dfo-stat-label', tr(navState.name)),
        el('div', 'dfo-stat-value', [navState.distance == null ? '' : T('live.metres', { n: navState.distance }), navState.message ? T(navState.message) : ''].filter(Boolean).join(' · '))
      );
      state.body.append(plaque);
    }
    state.stopBtn.disabled = !navState || navState.phase === 'idle';
    if (focused) [...state.node.querySelectorAll('[data-nav-control]')].find(n => n.dataset.navControl === focused)?.focus({ preventScroll: true });
  }
  function openDialog() {
    if (root.__dfoDungeonLive?.isOpen?.()) root.__dfoDungeonLive.close();
    const v = read(true, true);
    if (current) {
      if (v && v.cartography && v.live.ctx === current.ctx && !current.owner.done && v.live.owns?.(current.owner) !== false) { renderDialog(true); return true; }
      closeDialog();
    }
    if (!v || !v.cartography || v.live.blocked() || root.__dfoDungeons?.isOpen?.() || root.__dfoLootUI?.isDialogOpen?.()) return false;
    root.__dfoDungeons?.ensureStyles?.();
    const node = el('dialog', 'dfo-panel dfo-win dfo-window-frame dfo-dungeon-dialog dfo-cartography-dialog'), prior = doc.activeElement;
    const wh = el('div', 'wh'), left = el('div', 'dfo-dungeon-header-left'), heading = el('div', 't dfo-dungeon-title', T('live.nav.title'));
    heading.id = 'dfo-cartography-nav-title'; node.setAttribute('aria-labelledby', heading.id); left.append(heading);
    const wx = button('✕', closeDialog, 'x dfo-win-x'); wx.setAttribute('aria-label', T('live.close')); wh.append(left, wx);
    const body = el('div', 'wb'); body.id = 'dfo-cartography-nav-content';
    const foot = el('div', 'acts'), status = el('span', 'dfo-dungeon-status'), actions = el('div', 'dfo-dungeon-footer-btns'); status.setAttribute('role', 'status');
    const stopBtn = button(T('live.nav.clear'), () => { controller.stop(); renderDialog(true); }, 'dfo-ornate-btn dfo-nav-stop'); stopBtn.dataset.navControl = 'stop';
    const closeBtn = button(T('live.close'), closeDialog, 'dfo-ornate-btn silver');
    actions.append(stopBtn, closeBtn); foot.append(status, actions);
    const owner = { done: false, holdsScreen: true, isChoiceWindow: true, input() { }, click() { }, wheel() { }, hover() { }, tick() { }, draw() { }, close() { if (current?.owner === owner) closeDialog(); }, dispose() { this.close(); }, destroy() { this.close(); } };
    if (!v.live.mount(owner)) return false;
    current = { node, ctx: v.live.ctx, live: v.live, owner, prior, body, status, stopBtn, signature: '' };
    node.append(wh, body, foot); node.addEventListener('cancel', e => { e.preventDefault(); closeDialog(); });
    for (const type of ['click', 'pointerdown', 'mousedown', 'mouseup', 'wheel']) node.addEventListener(type, e => e.stopPropagation());
    doc.body.append(node); root.dispatchEvent(new Event('blur')); renderDialog(true); node.showModal();
    const first = [...body.querySelectorAll('button:not(:disabled)')][0] || closeBtn; first.focus();
    return true;
  }
  const onKeyDown = e => {
    if (current && (current.owner.done || current.live.owns?.(current.owner) === false)) closeDialog();
    if (!current) return;
    e.stopImmediatePropagation();
    if (e.code === 'Escape' || e.key === 'Escape') { e.preventDefault(); if (!e.repeat) closeDialog(); }
  };
  root.addEventListener('keydown', onKeyDown, true);
  const timer = root.setInterval(() => {
    controller.tick();
    const syncCtx = controller.context() || trail.ctx;
    if (syncCtx) syncTrail(syncCtx, false);
    const s = controller.state();
    if (!current && s.phase === 'idle') {
      if (!lastHudHidden) { hud.hidden = true; lastHudHidden = true; }
      return;
    }
    const v = read(false);
    if (current) {
      if (!v || !v.cartography || v.live.ctx !== current.ctx || current.owner.done || v.live.owns?.(current.owner) === false) closeDialog();
      else renderDialog();
    }
    if (s.phase === 'idle') { if (!lastHudHidden) { hud.hidden = true; lastHudHidden = true; } return; }
    const nextHidden = !v || !v.cartography || v.live.blocked() || root.__dfoDungeonLive?.isOpen?.() || !!current;
    if (nextHidden !== lastHudHidden) { hud.hidden = nextHidden; lastHudHidden = nextHidden; }
    if (!nextHidden) {
      const nextText = s.name + (s.distance == null ? '' : ' · ' + T('live.metres', { n: s.distance })) + (s.message ? '\n' + T(s.message) : '');
      if (nextText !== lastHudText) { hud.textContent = nextText; lastHudText = nextText; }
    }
  }, 250);
  root.__dfoDungeonNavigation = {
    start: controller.start, stop: controller.stop, state: controller.state, availability: controller.availability,
    open: openDialog, close: closeDialog, isOpen: () => !!current,
    onCartographyCast(player) {
      if (player && typeof player === 'object') castPlayer = new WeakRef(player);
      return openDialog();
    },
    lights(ctx) {
      if (controller.context() !== ctx && trail.ctx !== ctx) return [];
      syncTrail(ctx, true);
      return trail.ctx === ctx ? trail.lights || [] : [];
    },
    trailState() {
      if (trail.ctx) syncTrail(trail.ctx, true);
      const lastFade = trail.fading.at(-1);
      const alpha = Math.max(trail.active?.alpha ?? 0, lastFade?.alpha ?? 0);
      return {
        active: !!(trail.active || trail.fading.length),
        hasLive: !!trail.active,
        fadingCount: trail.fading.length,
        fadingPoints: trail.fading.map(f => f.points),
        losing: trail.fading.length > 0,
        alpha,
        dissipate: lastFade?.dissipate ?? 0,
        lightCount: trail.lights.length
      };
    },
    advanceVisualClock(ms) {
      clockOffsetMs += Number(ms) || 0;
      frameCache = null;
      return visualNow();
    },
    draw(ctx, renderer) {
      if (controller.context() !== ctx && trail.ctx !== ctx) return;
      let step = null;
      if (frameCache && frameCache.ctx === ctx && frameCache.rawPts === controller.points() && frameCache.routeSeq === controller.routeSeq() && Math.abs(visualNow() - frameCache.at) <= 12) {
        step = frameCache.step; frameCache = null;
      } else {
        frameCache = null; step = syncTrail(ctx, true);
      }
      if (!step) return;
      try {
        if (drawGL !== renderer.gl) { try { drawPass?.dispose(); } catch { } drawGL = renderer.gl; drawPass = new CloudPass(drawGL); }
        drawPass.draw(renderer, step.built.vertices, step.built.count, step.nowSec);
      } catch (e) { disposeDraw(); controller.stop(); console.warn('[dfo-mod] navigation draw:', e); }
    },
    dispose() { root.clearInterval(timer); closeDialog(); controller.stop(true); disposeDraw(); hud.remove(); style.remove(); root.removeEventListener('keydown', onKeyDown, true); }
  };
  root.addEventListener('pagehide', () => root.__dfoDungeonNavigation.dispose(), { once: true });
})(globalThis);
