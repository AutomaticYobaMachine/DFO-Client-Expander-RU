(function navigationPage(root) {
  'use strict';
  // The mod's own words, in the install's language (page/dfo_ui_text.js; English without the translation).
  const T = (key, params) => (root.__dfoUi ? root.__dfoUi.t(key, params) : key);
  const M = typeof module === 'object' && module.exports ? require('./dfo_dungeon_nav_model.js') : root.__dfoDungeonNavModel;
  const labels = { exit:T('nav.target.exit'), aurum:T('nav.target.aurum'), elite:T('nav.target.elite'), quest:T('nav.target.quest') };
  const none = { exit:T('nav.none.exit'), aurum:T('nav.none.aurum'), elite:T('nav.none.elite'), quest:T('nav.none.quest') };
  const G = typeof module === 'object' && module.exports ? require('./dfo_dungeon_graph.js') : root.__dfoDungeonGraph;
  function createNavigation(deps) {
    let state={phase:'idle',kind:null,uid:null,name:'',distance:null,message:''};
    let owner=null,ownerSource=null,wanted=null,client=null,building=null,graphRevision=null,readKey='';
    let seq=0,calculating=false,route=null,showing=[],plannedAt=-Infinity,lastAttempt=-Infinity,failedView='';
    const now=()=>deps.now?.()??Date.now();
    const notify=next=>{const value={...state,...next};if(JSON.stringify(value)!==JSON.stringify(state)){state=value;deps.changed?.({...state});}};
    const read=(details=true,quests=wanted?.kind==='quest')=>{try{const v=deps.read(details,quests);return v?{...v,nav:{...v.nav,collider:M.navigationGeometry(v.nav.collider)}}:null;}catch{return null;}};
    const groups=v=>M.targets(v.live,v.sources,v.tools,v.questIds,wanted?.kind);
    const source=v=>v.nav.collider?.source||v.nav.collider;
    const candidates=v=>{
      let list=groups(v)[wanted.kind]||[];
      if(wanted.kind==='quest'){
        if(wanted.uid)list=list.filter(t=>t.uid===wanted.uid);
        else if(v.sources?.followedId!=null&&list.some(t=>t.uid===String(v.sources.followedId)))list=list.filter(t=>t.uid===String(v.sources.followedId));
      }
      return list;
    };
    const revision=v=>G.revision(v.nav.collider,v.live.ctx.actions);
    const attemptKey=v=>JSON.stringify([Array.from(v.nav.feet,x=>Math.round(x)),candidates(v).map(t=>[t.key,...t.at.map(x=>Math.round(x))]),revision(v)]);
    const disposeClient=()=>{client?.dispose();client=null;building=null;graphRevision=null;};
    function stop(hard=false){
      seq++;calculating=false;wanted=null;route=null;showing=[];failedView='';
      if(hard){disposeClient();owner=ownerSource=null;readKey='';}
      notify({phase:'idle',kind:null,uid:null,name:'',distance:null,message:''});
    }
    function checkScene(v){
      const latest=read(false);
      if(!latest||latest.live.ctx!==v.live.ctx||source(latest)!==source(v)||latest.nav.key!==v.nav.key||latest.room!==v.room)throw Object.assign(new Error('cancelled'),{cancelled:true});
    }
    function check(v,token){if(token!==seq||!wanted)throw Object.assign(new Error('cancelled'),{cancelled:true});checkScene(v);}
    async function acquire(v){
      const stamp=revision(v);if(client&&graphRevision===stamp){if(building)await building;return;}
      disposeClient();graphRevision=stamp;
      const pause=async()=>{checkScene(v);await deps.checkpoint?.();checkScene(v);};
      const mine=deps.makeGraphClient?.({checkpoint:pause})||G.client({checkpoint:pause});client=mine;
      building=(async()=>{const input=await G.snapshot(v.nav.collider,v.live.ctx.actions,pause);await mine.build(input);})();
      try{await building;}catch(e){if(client===mine)disposeClient();throw e;}
      finally{if(client===mine)building=null;}
    }
    async function solve(v,token){
      calculating=true;plannedAt=lastAttempt=now();let retry=false;
      try{
        await acquire(v);check(v,token);
        const current=read();if(!current)throw Object.assign(new Error('cancelled'),{cancelled:true});v={...current,nav:{...current.nav,feet:M.point(current.nav.feet)}};
        const stamp=revision(v),targets=candidates(v).map(t=>({...t,at:M.point(t.at)}));
        if(stamp!==graphRevision){retry=true;return;}
        if(!targets.length){route=null;showing=[];notify({phase:'unavailable',distance:null,message:none[wanted.kind]});return;}
        notify({phase:'routing',message:T('nav.routing'),distance:null});
        const pins=typeof v.nav.transitions==='function'?v.nav.transitions():v.nav.transitions||[];
        const result=await client.route(v.nav.feet,targets,M.portalTransitions(v.live.ctx.actions,pins,v.nav.portalSurfaces),{riding:M.riding(v.nav.feet,v.nav.collider,v.live.ctx.actions)});check(v,token);
        if(revision(v)!==stamp){retry=true;return;}
        if(!result){route=null;showing=[];failedView=attemptKey(v);notify({phase:'unavailable',distance:null,message:T('nav.noPath')});return;}
        const latest=read(),fresh=candidates(latest).find(t=>t.key===result.target.key);
        if(!fresh||M.distance(fresh.at,result.target.at)>1.1){route=null;showing=[];retry=true;return;}
        route=result;failedView='';notify({phase:'following',name:fresh.name,message:'',distance:Math.ceil(result.distance)});
      }catch(e){
        if(!e.cancelled&&token===seq){disposeClient();route=null;showing=[];failedView=attemptKey(v);notify({phase:'unavailable',distance:null,message:e.message||T('nav.failed')});}
      }finally{if(token===seq){calculating=false;lastAttempt=retry?-Infinity:now();}}
    }
    function request(v){
      const token=++seq;route=null;showing=[];failedView='';
      v={...v,nav:{...v.nav,feet:M.point(v.nav.feet)}};
      notify({phase:client?'routing':'building',name:labels[wanted.kind],message:client?T('nav.routing'):T('nav.building'),distance:null});
      void solve(v,token);
    }
    function start(kind,uid=null){
      const v=read(true,kind==='quest');if(!G||!labels[kind]||!v||!M.point(v.nav?.feet)||!v.nav.collider?._buckets)return false;
      if(owner&&(owner!==v.live.ctx||ownerSource!==source(v)||readKey!==v.nav.key+'|'+v.room))stop(true);
      wanted={kind,uid:uid==null?null:String(uid)};owner=v.live.ctx;ownerSource=source(v);readKey=v.nav.key+'|'+v.room;
      notify({kind,uid:wanted.uid,name:labels[kind]});
      if(!candidates(v).length){seq++;calculating=false;route=null;showing=[];notify({phase:'unavailable',distance:null,message:none[kind]});return false;}
      request(v);return true;
    }
    function tick(){
      const v=read(!!wanted);
      if(owner&&(!v||owner!==v.live.ctx||ownerSource!==source(v)||readKey!==v.nav.key+'|'+v.room)){stop(true);return;}
      if(!wanted||!v||calculating||!M.point(v.nav.feet))return;
      const list=candidates(v);
      if(!list.length){route=null;showing=[];notify({phase:'unavailable',distance:null,message:none[wanted.kind]});return;}
      if(!route){if(now()-lastAttempt>1200&&(!failedView||failedView!==attemptKey(v)))request(v);return;}
      const target=list.find(t=>t.key===route.target.key);
      if(!target||M.distance(target.at,route.target.at)>1.1||revision(v)!==graphRevision){showing=[];if(now()-plannedAt>350)request(v);return;}
      const followed=M.follow(route,v.nav.feet,v.nav.collider,v.live.ctx.actions);
      if(!followed){showing=[];if(now()-plannedAt>350)request(v);return;}
      showing=followed.points;
      const extra=route.transition?Math.max(0,route.distance-M.length(route.points)):0;
      if(followed.remaining < (route.transition?.contact ? .15 : 1.2) && followed.off < (route.transition?.contact ? .5 : 1.6) && (route.transition||M.goalReached(target,v.nav.feet,v.nav.collider))){
        showing=[];notify({phase:route.transition?'transition':'arrived',name:target.name,distance:route.transition?Math.ceil(followed.remaining+extra):0,message:route.transition?'':T('nav.arrived')});return;
      }
      notify({phase:'following',name:target.name,distance:Math.ceil(followed.remaining+extra),message:''});
    }
    return{
      start,stop,tick,state:()=>({...state}),points:()=>showing,context:()=>owner,
      matches:v=>!!v&&owner===v.live.ctx&&ownerSource===source(v)&&readKey===v.nav.key+'|'+v.room,
      availability(){const v=read(true,true);if(!G||!v?.nav.collider?._buckets)return{ready:false};const all=M.targets(v.live,v.sources,v.tools,v.questIds);return{ready:true,...Object.fromEntries(Object.entries(all).map(([k,a])=>[k,a.length]))};}
    };
  }
  if(typeof module==='object'&&module.exports){module.exports={createNavigation};return;}
  if(root.__dfoDungeonNavigation||root.__DFO_MOD_CFG__?.dungeons?.enabled===false)return;
  const doc=root.document;let drawPass=null,drawGL=null,budgetAt=performance.now(),questAt=-Infinity,questContext=null,questBridge=null,questIds=null,questRows=null;
  const disposeDraw=()=>{try{drawPass?.dispose();}catch{}drawPass=drawGL=null;};
  const read=(details=true,includeQuests=details)=>{
    const info=root.__dfoDungeons?.liveInfo(false);
    const nextContext=info?.live?.ctx??null,nextBridge=info?.live?.questBridge??null;
    if(questContext!==nextContext||questBridge!==nextBridge){questContext=nextContext;questBridge=nextBridge;questIds=questRows=null;questAt=-Infinity;}
    if(!info)return null;
    const nav=info.live.ctx.dfoDungeonNavigation;if(!nav?.collider||!nav.feet)return null;
    const modes=info.world.modes?.();
    if(details&&includeQuests&&performance.now()-questAt>=250){
      questAt=performance.now();let log=null,failed=false;try{log=questBridge?.questLog?.({windows:false});}catch{failed=true;}
      const rows=failed?[]:log?[...(log.active||[]),...(log.unlogged||[])]:null;
      questIds=rows?new Set(rows.map(q=>String(q.id))):null;questRows=rows?new Map(rows.map(q=>[String(q.id),q])):null;
    }
    return{...info,nav,sources:{...modes?.dfoDungeonQuestSources,questRows},questIds:details&&includeQuests?questIds:null,room:info.world.presence?.()?.room||''};
  };
  const hud=doc.createElement('div');hud.className='dfo-navigation-hud';hud.hidden=true;hud.setAttribute('aria-live','polite');
  const style=doc.createElement('style');style.textContent='.dfo-navigation-hud{position:fixed;left:50%;bottom:16vh;transform:translateX(-50%);max-width:80vw;z-index:7;pointer-events:none;text-align:center;white-space:pre-line;padding:8px 14px;border:1px solid rgba(83,191,255,.5);background:rgba(11,22,31,.78);color:#b4e8ff;font:13px var(--data,system-ui,sans-serif);line-height:1.5}.dfo-navigation-hud[hidden]{display:none}';
  doc.head.append(style);if(doc.body)doc.body.append(hud);else doc.addEventListener('DOMContentLoaded',()=>doc.body.append(hud),{once:true});
  const controller=createNavigation({
    read,now:()=>performance.now(),
    async checkpoint(){if(performance.now()-budgetAt<4)return;await new Promise(r=>root.requestAnimationFrame(r));budgetAt=performance.now();},
    changed(s){if(s.phase==='idle')disposeDraw();root.dispatchEvent(new CustomEvent('dfo-navigation-change'));}
  });
  const timer=root.setInterval(()=>{
    controller.tick();const s=controller.state();if(s.phase==='idle'){hud.hidden=true;return;}const v=read(false);
    hud.hidden=!v||v.live.blocked()||root.__dfoDungeonLive?.isOpen();
    if(!hud.hidden)hud.textContent=s.name+(s.distance==null?'':' · '+T('live.metres',{n:s.distance}))+(s.message?'\n'+T(s.message):'');
  },250);
  root.__dfoDungeonNavigation={
    start:controller.start,stop:controller.stop,state:controller.state,availability:controller.availability,
    draw(ctx,renderer){
      if(controller.context()!==ctx)return;const pts=controller.points();if(pts.length<2)return;
      const v=read(false);if(!controller.matches(v)){controller.stop(true);return;}if(v.live.ctx!==ctx||v.live.blocked()||M.distance(v.nav.feet,pts[0])>2.5)return;
      try{
        if(drawGL!==renderer.gl){disposeDraw();drawGL=renderer.gl;drawPass=new root.__dfoDungeonRender.Draw(drawGL);}
        drawPass.draw(renderer,[],[{pts,color:[.12,.55,1],alpha:.18,dfoContinuous:true,dfoWidth:.15},{pts,color:[.28,.76,1],alpha:1,dfoContinuous:true,dfoWidth:.045}]);
      }catch(e){disposeDraw();controller.stop();console.warn('[dfo-mod] navigation draw:',e);}
    },
    dispose(){root.clearInterval(timer);controller.stop(true);disposeDraw();hud.remove();style.remove();}
  };
  root.addEventListener('pagehide',()=>root.__dfoDungeonNavigation.dispose(),{once:true});
})(globalThis);
