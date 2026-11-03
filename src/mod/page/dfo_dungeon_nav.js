(function navigationPage(root) {
  'use strict';
  const M = typeof module === 'object' && module.exports ? require('./dfo_dungeon_nav_model.js') : root.__dfoDungeonNavModel;
  const labels = { exit:'Выход из данжа', aurum:'Сундук с аурумом', elite:'Ближайший элитный противник', quest:'Цель задания' };
  const none = { exit:'Выход в этой локации не найден.', aurum:'Сундук с аурумом недоступен или уже открыт.', elite:'Живых элитных противников здесь нет.', quest:'Активных целей этого задания в данже нет.' };
  function createNavigation(deps) {
    let state={phase:'idle',kind:null,uid:null,name:'',distance:null,message:''};
    let owner=null,wanted=null,mesh=null,meshSource='',meshLocks='',failedLocks=null,client=null;
    let seq=0,calculating=false,route=null,showing=[],plannedAt=-Infinity,lastAttempt=-Infinity,readKey='',cancelPlan=null,failedView='';
    const expansions=new Set();
    const now=()=>deps.now?.()??Date.now(),native=()=>deps.native();
    const notify=next=>{const value={...state,...next};if(JSON.stringify(value)!==JSON.stringify(state)){state=value;deps.changed?.({...state});}};
    const read=(details=true)=>{try{const v=deps.read(details);return v?{...v,nav:{...v.nav,collider:M.navigationGeometry(v.nav.collider)}}:null;}catch{return null;}};
    const groups=v=>M.targets(v.live,v.sources,v.tools,v.questIds);
    const candidates=v=>{
      let list=groups(v)[wanted.kind]||[];
      if(wanted.kind==='quest'){
        if(wanted.uid)list=list.filter(t=>t.uid===wanted.uid);
        else if(v.sources?.followedId!=null&&list.some(t=>t.uid===String(v.sources.followedId)))list=list.filter(t=>t.uid===String(v.sources.followedId));
      }
      return list;
    };
    const locks=v=>JSON.stringify([...M.passable(v.live.ctx.actions)].sort());
    const attemptKey=v=>JSON.stringify([v.nav.feet.map(x=>Math.round(x)),candidates(v).map(t=>[t.key,...t.at.map(x=>Math.round(x))]),M.geometryVersion(v.nav.collider,M.passable(v.live.ctx.actions)),[...(v.live.ctx.actions?.objects?.values?.()||[])].filter(o=>o.kind==='action').map(o=>[o.key,o.state])]);
    const clearClient=()=>{try{client?.dispose();}catch{}client=null;};
    const invalidate=()=>{seq++;cancelPlan?.();cancelPlan=null;calculating=false;};
    function stop(hard=false){
      invalidate();wanted=null;route=null;showing=[];failedView='';
      if(hard){clearClient();mesh=null;owner=null;meshSource='';meshLocks=readKey='';failedLocks=null;expansions.clear();}
      notify({phase:'idle',kind:null,uid:null,name:'',distance:null,message:''});
    }
    function check(v,token){
      const latest=read(false);
      if(token!==seq||!wanted||!latest||latest.live.ctx!==v.live.ctx||latest.nav.key!==v.nav.key||latest.room!==v.room)throw Object.assign(new Error('cancelled'),{cancelled:true});
    }
    const checkpoint=(v,token)=>async()=>{check(v,token);await deps.checkpoint?.();check(v,token);};
    async function acquire(v,token,cancelled,force=false){
      const key=locks(v);
      if(meshSource==='surface'&&meshLocks===key)return null;
      if(mesh&&meshLocks===key&&!(force&&meshSource==='native')){
        const skip=[...M.passable(v.live.ctx.actions)];
        if(M.grounded(mesh,native(),v.nav.feet,v.nav.collider,skip)||!M.floor(v.nav.collider,v.nav.feet,skip))return mesh;
        const cell=key+'|'+v.nav.feet.map(x=>Math.round(x)).join(',');
        if(expansions.has(cell))return mesh;
        expansions.add(cell);force=true;
      }
      mesh=null;route=null;showing=[];
      if(!force&&v.nav.mesh&&!meshLocks){mesh=v.nav.mesh;meshLocks=key;meshSource='native';return mesh;}
      try{
        if(failedLocks===key)throw new Error('Проходы этой локации пока недоступны. Попробуйте выбрать цель ещё раз.');
        notify({phase:'building',distance:null,message:'Подготавливаю карту проходов…'});
        clearClient();const mine=deps.makeClient(native());client=mine;
        if(mine._hadWorker===false){clearClient();failedLocks=key;throw new Error('Фоновый расчёт недоступен. Перезайдите в данж и попробуйте снова.');}
        const anchors=[],add=p=>{const q=M.point(p);if(q)anchors.push(q);};
        for(const e of v.live.ctx.enemies||[])add([e.x,e.y,e.z]);
        for(const list of Object.values(groups(v)))for(const t of list)add(t.at);
        for(const t of v.nav.transitions||[]){add(M.transitionPoint(v.nav.collider,t.entrance?.pos,[...M.passable(v.live.ctx.actions)]));add(M.transitionPoint(v.nav.collider,t.exit?.pos,[...M.passable(v.live.ctx.actions)]));}
        let hash=2166136261;for(const c of key)hash=Math.imul(hash^c.charCodeAt(0),16777619);
        const baked=await Promise.race([mine.bake({collider:v.nav.collider,anchor:[...v.nav.feet],anchors,exclude:M.passable(v.live.ctx.actions),agent:M.agent,key:'dfo-navigation:2:'+v.nav.key+':'+(hash>>>0)}),cancelled]);
        check(v,token);
        if(!baked?.chf?.mesh?.polys?.length){failedLocks=key;throw new Error('Не удалось подготовить проходы этого данжа.');}
        mesh=baked.chf;meshLocks=key;meshSource='own';return mesh;
      }catch(e){
        check(v,token);clearClient();
        if(!M.floor(v.nav.collider,v.nav.feet,[...M.passable(v.live.ctx.actions)]))throw e;
        // The Collider search is cooperative and independent of the worker; never replace a failed
        // worker with a synchronous bake, or disable a real passage just because no mesh was produced.
        failedLocks=null;mesh=null;meshSource='surface';meshLocks=key;return null;
      }
    }
    async function select(v,token){
      const list=candidates(v).sort((a,b)=>M.distance(v.nav.feet,a.at)-M.distance(v.nav.feet,b.at));
      const skip=[...M.passable(v.live.ctx.actions)],pause=checkpoint(v,token),missing=[];let best=null;
      for(const target of list){
        check(v,token);
        if(best&&!v.nav.transitions?.length&&M.distance(v.nav.feet,target.at)>best.distance+1.2)continue;
        const result=await M.planConnected(mesh,native(),v.nav.feet,target,v.nav.collider,skip,v.nav.transitions||[],pause,meshSource!=='native');
        if(result&&(!best||result.distance<best.distance))best=result;
        if(!result&&meshSource==='native')missing.push(target);
        await pause();
      }
      // A route to another foe must not hide a nearer candidate merely omitted by the AI's mesh.
      if(best)for(const target of missing){
        check(v,token);if(!v.nav.transitions?.length&&M.distance(v.nav.feet,target.at)>best.distance+1.2)continue;
        const result=await M.planConnected(mesh,native(),v.nav.feet,target,v.nav.collider,skip,v.nav.transitions||[],pause,true);
        if(result&&result.distance<best.distance)best=result;await pause();
      }
      return best;
    }
    async function solve(v,token,cancelled){
      calculating=true;plannedAt=lastAttempt=now();let retry=false;
      try{
        await acquire(v,token,cancelled);check(v,token);
        const current=read();if(!current)throw Object.assign(new Error('cancelled'),{cancelled:true});v={...current,nav:{...current.nav,feet:M.point(current.nav.feet)}};
        const geometryAtStart=M.geometryVersion(v.nav.collider,M.passable(v.live.ctx.actions));
        notify({phase:'routing',message:'Прокладываю путь…',distance:null});
        let result=await select(v,token);
        if(!result&&meshSource==='native'){await acquire(v,token,cancelled,true);result=await select(v,token);}
        check(v,token);
        if(!result){
          route=null;showing=[];
          if(geometryAtStart!==M.geometryVersion(v.nav.collider,M.passable(v.live.ctx.actions))){retry=true;notify({phase:'routing',distance:null,message:'Проходы изменились. Перестраиваю путь…'});return;}
          failedView=attemptKey(v);notify({phase:'unavailable',distance:null,message:'Проходимый путь в загруженной геометрии не найден. Попробуйте подойти к проходу и выбрать цель снова.'});return;
        }
        const latest=read(),fresh=candidates(latest).find(t=>t.key===result.target.key);
        if(!fresh||M.distance(fresh.at,result.target.at)>1.5){route=null;showing=[];retry=true;return;}
        route=result;notify({phase:'following',name:result.target.name,message:'',distance:Math.ceil(result.distance)});
      }catch(e){
        if(!e.cancelled&&token===seq){route=null;showing=[];failedView=attemptKey(v);notify({phase:'unavailable',distance:null,message:e.message||'Не удалось проложить путь.'});}
      }finally{if(token===seq){calculating=false;cancelPlan=null;lastAttempt=retry?-Infinity:now();}}
    }
    function request(v){
      invalidate();const token=seq,cancelled=new Promise(resolve=>cancelPlan=()=>resolve(null));route=null;showing=[];failedView='';
      v={...v,nav:{...v.nav,feet:M.point(v.nav.feet)}};
      notify({phase:mesh?'routing':'building',name:labels[wanted.kind],message:'Прокладываю путь…',distance:null});
      void solve(v,token,cancelled);
    }
    function start(kind,uid=null){
      const v=read(),n=native();
      if(!labels[kind]||!v||!M.point(v.nav?.feet)||!n?.solve||!n.Draw)return false;
      if(owner&&(owner!==v.live.ctx||readKey!==v.nav.key+'|'+v.room))stop(true);
      wanted={kind,uid:uid==null?null:String(uid)};owner=v.live.ctx;readKey=v.nav.key+'|'+v.room;failedLocks=null;
      notify({kind,uid:wanted.uid,name:labels[kind]});
      if(!candidates(v).length){invalidate();route=null;showing=[];notify({phase:'unavailable',distance:null,message:none[kind]});return false;}
      request(v);return true;
    }
    function tick(){
      const v=read(!!wanted);
      if(owner&&(!v||owner!==v.live.ctx||readKey!==v.nav.key+'|'+v.room)){stop(true);return;}
      if(!wanted||!v||calculating||!M.point(v.nav.feet))return;
      const list=candidates(v);
      if(!list.length){route=null;showing=[];notify({phase:'unavailable',distance:null,message:none[wanted.kind]});return;}
      if(!route){if(now()-lastAttempt>2500&&(!failedView||failedView!==attemptKey(v)))request(v);return;}
      const target=list.find(t=>t.key===route.target.key),trimmed=M.trim(route.points,v.nav.feet);
      if(!target||M.distance(target.at,route.target.at)>1.1||locks(v)!==meshLocks||trimmed.off>1.6){
        showing=[];if(now()-plannedAt>600)request(v);return;
      }
      const joined=M.rejoin(trimmed.points,v.nav.feet,v.nav.collider,v.live.ctx.actions,native());
      if(!joined){showing=[];if(now()-plannedAt>600)request(v);return;}
      const remaining=M.length(joined),vis=M.visible(joined,v.nav.collider,v.live.ctx.actions,native());showing=vis.points;
      const extra=route.transition?Math.max(0,route.distance-M.length(route.points)):0;
      if(!vis.blocked&&remaining<1.2&&trimmed.off<1.6){
        showing=[];notify({phase:route.transition?'transition':'arrived',name:target.name,distance:route.transition?Math.ceil(remaining+extra):0,message:route.transition?'Пройдите отмеченный переход. Путь продолжится после него.':'Цель рядом.'});return;
      }
      notify({phase:vis.blocked?'blocked':'following',name:target.name,distance:Math.ceil(remaining+extra),message:vis.blocked==='door'?'Впереди закрытая дверь. Откройте её — маршрут продолжится.':vis.blocked?'Проход перекрыт. После изменения пути маршрут будет пересчитан.':route.transition?'Маршрут ведёт к переходу между участками.':''});
      if(vis.blocked==='geometry'&&now()-plannedAt>2500){mesh=null;meshSource='';request(v);}
    }
    return{
      start,stop,tick,state:()=>({...state}),points:()=>showing,context:()=>owner,
      matches:v=>!!v&&owner===v.live.ctx&&readKey===v.nav.key+'|'+v.room,
      availability(){const v=read(),n=native();if(!v||!n?.solve||!n.Draw)return{ready:false};const all=groups(v);return{ready:true,...Object.fromEntries(Object.entries(all).map(([k,a])=>[k,a.length]))};}
    };
  }
  if(typeof module==='object'&&module.exports){module.exports={createNavigation};return;}
  if(root.__dfoDungeonNavigation||root.__DFO_MOD_CFG__?.dungeons?.enabled===false)return;
  const doc=root.document;let drawPass=null,drawGL=null,budgetAt=performance.now(),questAt=-Infinity,questContext=null,questIds=null;
  const disposeDraw=()=>{try{drawPass?.dispose();}catch{}drawPass=drawGL=null;};
  const read=(details=true)=>{
    const info=root.__dfoDungeons?.liveInfo(false);if(!info)return null;
    const nav=info.live.ctx.dfoDungeonNavigation;if(!nav?.collider||!nav.feet)return null;
    const modes=info.world.modes?.();
    if(details&&(questContext!==info.live.ctx||performance.now()-questAt>=250)){
      questContext=info.live.ctx;questAt=performance.now();questIds=new Set(root.__dfoDungeonLiveModel.quests(info.live.questBridge,info.live.location,info.live.foes).map(q=>q.uid));
    }
    const view=details?{...nav,transitions:typeof nav.transitions==='function'?nav.transitions():nav.transitions||[]}:nav;
    return{...info,nav:view,sources:modes?.dfoDungeonQuestSources||{},questIds:details?questIds:null,room:info.world.presence?.()?.room||''};
  };
  const hud=doc.createElement('div');hud.className='dfo-navigation-hud';hud.hidden=true;hud.setAttribute('aria-live','polite');
  const style=doc.createElement('style');style.textContent='.dfo-navigation-hud{position:fixed;left:50%;bottom:16vh;transform:translateX(-50%);max-width:80vw;z-index:7;pointer-events:none;text-align:center;white-space:pre-line;padding:8px 14px;border:1px solid rgba(83,191,255,.5);background:rgba(11,22,31,.78);color:#b4e8ff;font:13px var(--data,system-ui,sans-serif);line-height:1.5}.dfo-navigation-hud[hidden]{display:none}';
  doc.head.append(style);if(doc.body)doc.body.append(hud);else doc.addEventListener('DOMContentLoaded',()=>doc.body.append(hud),{once:true});
  const controller=createNavigation({
    read,native:()=>root.__dfoNavNative,now:()=>performance.now(),
    makeClient(n){if(typeof root.Worker!=='function')throw new Error('Фоновый расчёт проходов недоступен в этом клиенте.');return new n.NavClient();},
    async checkpoint(){if(performance.now()-budgetAt<4)return;await new Promise(r=>root.requestAnimationFrame(r));budgetAt=performance.now();},
    changed(s){if(s.phase==='idle')disposeDraw();root.dispatchEvent(new CustomEvent('dfo-navigation-change'));}
  });
  const timer=root.setInterval(()=>{
    controller.tick();const s=controller.state();if(s.phase==='idle'){hud.hidden=true;return;}const v=read(false);
    hud.hidden=!v||v.live.blocked()||root.__dfoDungeonLive?.isOpen();
    if(!hud.hidden)hud.textContent=s.name+(s.distance==null?'':' · '+s.distance+' м')+(s.message?'\n'+s.message:'');
  },250);
  root.__dfoDungeonNavigation={
    start:controller.start,stop:controller.stop,state:controller.state,availability:controller.availability,
    draw(ctx,renderer){
      if(controller.context()!==ctx)return;const pts=controller.points();if(pts.length<2)return;
      const v=read(false);if(!controller.matches(v)){controller.stop(true);return;}if(v.live.ctx!==ctx||v.live.blocked()||M.distance(v.nav.feet,pts[0])>2.5)return;
      try{
        if(drawGL!==renderer.gl){disposeDraw();drawGL=renderer.gl;drawPass=new root.__dfoNavNative.Draw(drawGL);}
        drawPass.draw(renderer,[],[{pts,color:[.12,.55,1],alpha:.18,dfoContinuous:true,dfoWidth:.15},{pts,color:[.28,.76,1],alpha:1,dfoContinuous:true,dfoWidth:.045}]);
      }catch(e){disposeDraw();controller.stop();console.warn('[dfo-mod] navigation draw:',e);}
    },
    dispose(){root.clearInterval(timer);controller.stop(true);disposeDraw();hud.remove();style.remove();}
  };
  root.addEventListener('pagehide',()=>root.__dfoDungeonNavigation.dispose(),{once:true});
})(globalThis);
