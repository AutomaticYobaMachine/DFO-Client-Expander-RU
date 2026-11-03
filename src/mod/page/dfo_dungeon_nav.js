(function navigationPage(root) {
  'use strict';
  const M = typeof module === 'object' && module.exports ? require('./dfo_dungeon_nav_model.js') : root.__dfoDungeonNavModel;
  const labels = { exit:'Выход из данжа', aurum:'Сундук с аурумом', elite:'Ближайший элитный противник', quest:'Цель задания' };
  const none = { exit:'Выход в этой локации не найден.', aurum:'Сундук с аурумом недоступен или уже открыт.', elite:'Живых элитных противников здесь нет.', quest:'Активных целей этого задания в данже нет.' };
  function createNavigation(deps) {
    let state={phase:'idle',kind:null,uid:null,name:'',distance:null,message:''};
    let owner=null,wanted=null,mesh=null,meshSource='',meshLocks='',failedLocks=null,client=null;
    let seq=0,calculating=false,route=null,showing=[],plannedAt=-Infinity,lastAttempt=-Infinity,readKey='',cancelPlan=null;
    const expansions=new Set();
    const now=()=>deps.now?.()??Date.now(),native=()=>deps.native();
    const notify=next=>{const value={...state,...next};if(JSON.stringify(value)!==JSON.stringify(state)){state=value;deps.changed?.({...state});}};
    const read=(details=true)=>{try{return deps.read(details)??null;}catch{return null;}};
    const groups=v=>M.targets(v.live,v.sources,v.tools,v.questIds);
    const candidates=v=>{
      let list=groups(v)[wanted.kind]||[];
      if(wanted.kind==='quest'){
        if(wanted.uid)list=list.filter(t=>t.uid===wanted.uid);
        else if(v.sources?.followedId!=null&&list.some(t=>t.uid===String(v.sources.followedId)))list=list.filter(t=>t.uid===String(v.sources.followedId));
      }
      return list;
    };
    const locks=v=>JSON.stringify([...(v.live.ctx.actions?.objects?.values?.()??[])].filter(o=>native().isDoor(o)).map(o=>[o.key,o.currentLockValue>0]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
    const clearClient=()=>{try{client?.dispose();}catch{}client=null;};
    const invalidate=()=>{seq++;cancelPlan?.();cancelPlan=null;calculating=false;};
    function stop(hard=false){
      invalidate();wanted=null;route=null;showing=[];
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
      if(mesh&&meshLocks===key&&!(force&&meshSource==='native')){
        const skip=[...native().openDoors(v.live.ctx.actions)];
        if(M.grounded(mesh,native(),v.nav.feet,v.nav.collider,skip)||!M.floor(v.nav.collider,v.nav.feet,skip))return mesh;
        const cell=key+'|'+v.nav.feet.map(x=>Math.round(x)).join(',');
        if(expansions.has(cell))return mesh;
        expansions.add(cell);force=true;
      }
      mesh=null;route=null;showing=[];
      if(!force&&v.nav.mesh&&!meshLocks){mesh=v.nav.mesh;meshLocks=key;meshSource='native';return mesh;}
      if(failedLocks===key)throw new Error('Проходы этой локации пока недоступны. Попробуйте выбрать цель ещё раз.');
      notify({phase:'building',distance:null,message:'Подготавливаю карту проходов…'});
      clearClient();const mine=deps.makeClient(native());client=mine;
      if(mine._hadWorker===false){clearClient();failedLocks=key;throw new Error('Фоновый расчёт недоступен. Перезайдите в данж и попробуйте снова.');}
      const anchors=[],add=p=>{const q=M.point(p);if(q)anchors.push(q);};
      for(const e of v.live.ctx.enemies||[])add([e.x,e.y,e.z]);
      for(const list of Object.values(groups(v)))for(const t of list)add(t.at);
      for(const t of v.nav.transitions||[]){add(M.transitionPoint(v.nav.collider,t.entrance?.pos));add(M.transitionPoint(v.nav.collider,t.exit?.pos));}
      let hash=2166136261;for(const c of key)hash=Math.imul(hash^c.charCodeAt(0),16777619);
      const baked=await Promise.race([mine.bake({collider:v.nav.collider,anchor:[...v.nav.feet],anchors,exclude:native().openDoors(v.live.ctx.actions),key:'dfo-navigation:1:'+v.nav.key+':'+(hash>>>0)}),cancelled]);
      check(v,token);
      if(!baked?.chf?.mesh?.polys?.length){failedLocks=key;throw new Error('Не удалось подготовить проходы этого данжа.');}
      mesh=baked.chf;meshLocks=key;meshSource='own';return mesh;
    }
    async function select(v,token){
      const list=candidates(v).sort((a,b)=>M.distance(v.nav.feet,a.at)-M.distance(v.nav.feet,b.at));
      const skip=[...native().openDoors(v.live.ctx.actions)],pause=checkpoint(v,token);let best=null;
      for(const target of list){
        check(v,token);
        if(best&&!v.nav.transitions?.length&&M.distance(v.nav.feet,target.at)>best.distance+1.2)continue;
        const result=await M.planConnected(mesh,native(),v.nav.feet,target,v.nav.collider,skip,v.nav.transitions||[],pause);
        if(result&&(!best||result.distance<best.distance))best=result;
        await pause();
      }
      return best;
    }
    async function solve(v,token,cancelled){
      calculating=true;plannedAt=lastAttempt=now();
      try{
        await acquire(v,token,cancelled);check(v,token);
        notify({phase:'routing',message:'Прокладываю путь…',distance:null});
        let result=await select(v,token);
        if(!result&&meshSource==='native'){await acquire(v,token,cancelled,true);result=await select(v,token);}
        check(v,token);
        if(!result){route=null;showing=[];notify({phase:'unavailable',distance:null,message:'Проходимый путь не найден. Возможно, нужен рычаг, лифт или ещё не исследованный переход.'});return;}
        const latest=read(),fresh=candidates(latest).find(t=>t.key===result.target.key);
        if(!fresh||M.distance(fresh.at,result.target.at)>1.5){route=null;showing=[];lastAttempt=-Infinity;return;}
        route=result;notify({phase:'following',name:result.target.name,message:'',distance:Math.ceil(result.distance)});
      }catch(e){
        if(!e.cancelled&&token===seq){route=null;showing=[];notify({phase:'unavailable',distance:null,message:e.message||'Не удалось проложить путь.'});}
      }finally{if(token===seq){calculating=false;cancelPlan=null;}}
    }
    function request(v){
      invalidate();const token=seq,cancelled=new Promise(resolve=>cancelPlan=()=>resolve(null));route=null;showing=[];
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
      if(!route){if(now()-lastAttempt>2500)request(v);return;}
      const target=list.find(t=>t.key===route.target.key),trimmed=M.trim(route.points,v.nav.feet);
      if(!target||M.distance(target.at,route.target.at)>1.1||locks(v)!==meshLocks||trimmed.off>1.6){
        showing=[];if(now()-plannedAt>600)request(v);return;
      }
      if(trimmed.distance<1.2&&trimmed.off<1.6){
        showing=[];notify({phase:route.transition?'transition':'arrived',distance:0,message:route.transition?'Пройдите отмеченный переход. Путь продолжится после него.':'Цель рядом.'});return;
      }
      const vis=M.visible(trimmed.points,v.nav.collider,v.live.ctx.actions,native());showing=vis.points;
      const extra=route.transition?Math.max(0,route.distance-M.length(route.points)):0;
      notify({phase:vis.blocked?'blocked':'following',distance:Math.ceil(trimmed.distance+extra),message:vis.blocked==='door'?'Впереди закрытая дверь. Откройте её — маршрут продолжится.':vis.blocked?'Проход перекрыт. После изменения пути маршрут будет пересчитан.':route.transition?'Маршрут ведёт к переходу между участками.':''});
      if(vis.blocked==='geometry'&&now()-plannedAt>2500){mesh=null;meshSource='';request(v);}
    }
    return{
      start,stop,tick,state:()=>({...state}),points:()=>showing,context:()=>owner,
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
      const v=read(false);if(!v||v.live.ctx!==ctx||v.live.blocked())return;
      try{
        if(drawGL!==renderer.gl){disposeDraw();drawGL=renderer.gl;drawPass=new root.__dfoNavNative.Draw(drawGL);}
        drawPass.draw(renderer,[],[{pts,color:[.12,.55,1],alpha:.18,dfoContinuous:true,dfoWidth:.15},{pts,color:[.28,.76,1],alpha:1,dfoContinuous:true,dfoWidth:.045}]);
      }catch(e){disposeDraw();controller.stop();console.warn('[dfo-mod] navigation draw:',e);}
    },
    dispose(){root.clearInterval(timer);controller.stop(true);disposeDraw();hud.remove();style.remove();}
  };
  root.addEventListener('pagehide',()=>root.__dfoDungeonNavigation.dispose(),{once:true});
})(globalThis);
