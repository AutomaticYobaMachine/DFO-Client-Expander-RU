'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const upstream = path.resolve(process.argv[2] || '/tmp/dfo-upstream'), dist = path.resolve(process.argv[3] || '/tmp/dfo-release-0.1.14517');
const { chromium } = require(path.join(upstream, 'node_modules/playwright'));
const { transformAsset } = require('../src/mod/transforms.cjs');
const assets = path.join(dist, 'assets'), chronicle = fs.readdirSync(assets).find(f => /^enhancedChronicle-/.test(f));
assert.ok(chronicle);
const html = `<!doctype html><html><head><meta charset="utf-8"><script>const p=new URLSearchParams(location.search);window.__DFO_MOD_CFG__={dungeons:{enabled:!p.has('disabled'),keyCode:p.get('key')||'KeyK'},nearbyLoot:{enabled:false}};</script>
${['dfo_dungeon_model.js','dfo_dungeons.js','dfo_dungeon_live_model.js','dfo_dungeon_live.js'].map(f => '<script src="/'+f+'"></script>').join('')}
</head><body><canvas></canvas><script type="module">
import {mountEnhancedChronicle} from '/assets/${chronicle}';
const loc={name:'Castle of Many Shadows',hasDungeon:true,mapTableData:{mapId:12345,dungeonType:0},dungeon:{blocks:[{}],recordElement:{header:{locationId:9}}}},player={level:25,stats:{luck:50},skills:[]};
const mk=(name,type=1,extra={})=>({mobileType:type,src:{mobileType:type},ai:{isHostile:true},entity:{name,level:12,health:15,maxHealth:20,...extra}});
const foes=[mk('Rat'),mk('Rat'),mk('Rat',1,{eliteFoe:true,bossTraits:['Swift']}),mk('Vampire',28),{...mk('Dead'),dead:true},{...mk('Ally'),companion:1}];
const quests=new Map([1,2].map(uid=>[uid,{uid,displayName:'Задание в крепости',questName:'Quest'+uid,resources:new Map([['place',{siteDetails:{siteType:2,mapId:12345}}]])}]));
const questLog=()=>({active:[...quests.values()].filter(q=>!q.questComplete).map(q=>({id:q.uid,name:q.displayName,questName:q.questName,messages:[[{formatting:'text',text:'Подробное описание задания номер '+q.uid}]]})),finished:[]});
const session={room:'dungeon:m12345',status:'open',peers:new Map([['a',{}],['b',{}]]),_rooms:new Map([['dungeon:m12345',new Set(['a','b'])]])};
let overlay=null, mountCount=0, questOwner=null, journalView=null, journalHost=null, mapCount=0, keys=0;
const clock={now:10000000,interval:1200000,stamps:[9700000]};
const ctx={foes},live={ctx,location:loc,foes,questBridge:{machine:{quests},questLog},aurum:{id:'d12345',open:false},regen:()=>clock,blocked:()=>!!overlay&&!overlay.done,
 owns:w=>overlay===w,mount:w=>{if(overlay&&!overlay.done)return false;overlay=w;mountCount++;return true},unmount:w=>{if(overlay===w)overlay=null},journal:uid=>{
 if(overlay)return false;questOwner={done:false};overlay=questOwner;
 journalHost=document.createElement('div');journalHost.id='enhanced-chronicle';journalHost.style.cssText='position:fixed;inset:0;z-index:11';document.body.append(journalHost);
 const exit=()=>{questOwner.done=true;overlay=null;journalView?.destroy();journalHost.remove()};
 journalView=mountEnhancedChronicle(journalHost,{section:'quests',focusQuest:uid,questLog,entity:player,owner:questOwner,onExit:exit});return true;
 }};
Object.defineProperty(ctx,'dfoDungeonLive',{get:()=>live});
const modes={mode:'exterior',dungeonCtx:ctx,dungeonLocation:loc,transitioning:false,toggleAutomap(){mapCount++}};
const tools={modes:()=>modes,player:()=>player,presence:()=>session,viewOpen:()=>false,rank:()=>8,allowed:()=>true,size:()=> 'S',enemyName:id=>id===28?'Vampire':'Rat',traits:e=>e.bossTraits||[],aurumKey:()=> 'd12345',aurumAmount:()=>7};
const place={key:'place:12345',loc,found:true,px:1,py:2};
const host={params:new URLSearchParams('online'),__dfoWorld:tools,travelViewPlaces:()=>[],travelViewFarPlaces:()=>[],travelViewDungeons:()=>[place]};
if(window.__dfoDungeons)__dfoDungeons.register(host);
const mark=window.__dfoDungeons?.decorate([{key:'place:12345',label:'Castle of Many Shadows'}])[0];
window.fixture={modes,live,foes,quests,session,mark,mk,questLog,clock,get mounts(){return mountCount},get overlay(){return overlay},replaceOverlay(w){overlay=w},get mapCount(){return mapCount},get keys(){return keys},closeJournal(){journalView?.destroy();journalHost?.remove();overlay=null}};
addEventListener('keydown',()=>keys++,true);window.ready=true;
</script></body></html>`;
const cache = new Map();
const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') { res.setHeader('Content-Type','text/html;charset=utf-8');return res.end(html); }
    if (url.pathname.startsWith('/dfo-mod/dungeon-notes')) { res.setHeader('Content-Type','application/json');return res.end('{"notes":[]}'); }
    if (/^\/dfo_.*\.js$/.test(url.pathname)) { res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(__dirname,'../src/mod/page',url.pathname.slice(1)))); }
    const file = path.resolve(dist, '.'+url.pathname);if (!file.startsWith(dist+path.sep)) throw new Error('bad path');
    let body = fs.readFileSync(file);
    if (url.pathname.endsWith('.js')) { res.setHeader('Content-Type','text/javascript');if (!cache.has(file)) cache.set(file, transformAsset(url.pathname.slice(1), body.toString(), {dungeons:true,nearbyLoot:false,marks:false,ru:false}).text);body=cache.get(file); }
    res.end(body);
  } catch { res.statusCode=404;res.end('not found'); }
});
(async()=>{
 let browser,page;
 try {
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const address='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({executablePath:process.env.DFO_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});page=await browser.newPage({viewport:{width:1400,height:900}});
  const errors=[];page.on('pageerror',e=>{errors.push(String(e));console.error('Page error:',String(e))});await page.goto(address);await page.waitForFunction(()=>window.ready);
  await page.keyboard.press('k');assert.equal(await page.locator('.dfo-dungeon-live').count(),0,'no dungeon window outside');
  await page.evaluate(()=>fixture.modes.mode='dungeon');await page.locator('.dfo-dungeon-launch').waitFor({state:'visible'});
  await page.keyboard.press('k');const dialog=page.locator('.dfo-dungeon-live');await dialog.waitFor();assert.equal(await page.evaluate(()=>fixture.mounts),1);
  assert.equal(await dialog.locator('.dfo-dungeon-title').innerText(),await page.evaluate(()=>fixture.mark.label),'full title is inherited from the Overworld mark');
  assert.deepEqual(await dialog.locator('.dfo-live-stat strong').allTextContents(),['4','1','3']);assert.match(await dialog.innerText(),/15 мин/);assert.match(await dialog.innerText(),/7 Aurum/);assert.equal(await dialog.locator('[data-quest]').count(),2);
  const before=await page.evaluate(()=>fixture.keys);await page.keyboard.press('j');assert.equal(await page.evaluate(()=>fixture.keys),before,'dialog blocks gameplay keys');
  for(let i=0;i<8;i++)await page.keyboard.press('k');assert.equal(await dialog.count(),1);assert.equal(await page.evaluate(()=>fixture.mounts),1);
  for(const name of ['Враги','Добыча','Подготовка','Сводка']){
   await dialog.getByRole('tab',{name,exact:true}).click();const foot=await dialog.locator('.acts').boundingBox();assert.ok(foot.y+foot.height<=900);
   for(const label of ['Автокарта','Журнал заданий','Закрыть'])assert.equal(await dialog.getByRole('button',{name:label,exact:true}).isVisible(),true);
   assert.equal(await dialog.getByRole('button',{name:'Обновить',exact:true}).count(),0,'all tabs update automatically without a refresh button');
  }
  if(process.env.DFO_SCREENSHOT_DIR){fs.mkdirSync(process.env.DFO_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.DFO_SCREENSHOT_DIR,'live-summary.png')});}
  await page.evaluate(()=>{fixture.foes[0].dead=true;fixture.live.aurum.open=true});await page.waitForFunction(()=>document.querySelector('.dfo-live-stat strong')?.textContent==='3');assert.match(await dialog.innerText(),/получение отмечено/);
  await page.evaluate(()=>{fixture.clock.now+=60000;fixture.session._rooms.get(fixture.session.room).add('new-player');fixture.quests.get(1).questComplete=true});
  await page.waitForFunction(()=>document.querySelectorAll('.dfo-live-stat strong')[2]?.textContent==='4'&&document.querySelector('.dfo-dungeon-live .wb')?.textContent.includes('14 мин.')&&document.querySelectorAll('.dfo-dungeon-live [data-quest]').length===1);
  await page.evaluate(()=>{fixture.session._rooms.get(fixture.session.room).delete('new-player');fixture.quests.get(1).questComplete=false});
  await dialog.getByRole('tab',{name:'Враги',exact:true}).click();assert.match(await dialog.innerText(),/Элитный, Swift/);assert.equal(await dialog.locator('tbody tr').count(),3);
  await page.evaluate(()=>{fixture.foes[2].entity.health=7;fixture.foes[2].entity.bossTraits=['Swift','Frenzied']});
  await page.waitForFunction(()=>{const row=[...document.querySelectorAll('.dfo-dungeon-live tbody tr')].find(n=>n.textContent.includes('Frenzied'));return row?.textContent.includes('7 / 20')});
  await page.evaluate(()=>{fixture.foes.push(fixture.mk('<img src=x onerror=window.injected=1>',5,{properName:'<img src=x onerror=window.injected=1>'}))});
  await page.waitForFunction(()=>document.querySelector('.dfo-dungeon-live .wb')?.textContent.includes('<img src=x'));assert.equal(await dialog.locator('img').count(),0);assert.equal(await page.evaluate(()=>window.injected),undefined);
  if(process.env.DFO_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.DFO_SCREENSHOT_DIR,'live-enemies.png')});
  await page.setViewportSize({width:720,height:600});assert.equal(await dialog.evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight}),true);
  const footer=await dialog.locator('.acts').boundingBox();assert.ok(footer.y+footer.height<=600);await page.setViewportSize({width:1400,height:900});
  await dialog.getByRole('tab',{name:'Сводка',exact:true}).click();await dialog.locator('[data-quest="2"]').click();await dialog.waitFor({state:'hidden'});
  const selected=page.locator('#enhanced-chronicle [data-dfo-quest="2"]');await selected.waitFor();assert.equal(await page.locator('#enhanced-chronicle [data-dfo-quest]').count(),2);await page.waitForFunction(()=>document.activeElement?.dataset.dfoQuest==='2');assert.match(await selected.innerText(),/номер 2/);
  if(process.env.DFO_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.DFO_SCREENSHOT_DIR,'live-quest.png')});
  await page.evaluate(()=>fixture.closeJournal());await page.keyboard.press('k');await dialog.waitFor();
  await page.evaluate(()=>fixture.session.status='connecting');await page.waitForFunction(()=>document.querySelectorAll('.dfo-live-stat strong')[2]?.textContent==='—');
  await page.evaluate(()=>fixture.session.status='open');await page.waitForFunction(()=>document.querySelectorAll('.dfo-live-stat strong')[2]?.textContent==='3');
  await dialog.getByRole('button',{name:'Автокарта',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>fixture.mapCount),1);
  await page.keyboard.press('k');await dialog.waitFor();await page.evaluate(()=>fixture.replaceOverlay({done:false,nativePopup:true}));await dialog.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>fixture.overlay.nativePopup),true,'teardown must not clear a newer native popup');await page.evaluate(()=>fixture.replaceOverlay(null));
  await page.keyboard.press('k');await dialog.waitFor();await page.evaluate(()=>fixture.modes.mode='exterior');await dialog.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>fixture.overlay),null,'leaving releases the native overlay');
  for(const key of ['NumpadEnter','Numpad1','Mouse4','Mouse5']){
   await page.goto(address+'/?key='+key);await page.waitForFunction(()=>window.ready);await page.evaluate(()=>fixture.modes.mode='dungeon');
   let press;
   if(key.startsWith('Mouse')){const cd=await page.context().newCDPSession(page),button=key==='Mouse4'?'back':'forward';await cd.send('Page.resetNavigationHistory');press=async()=>{await cd.send('Input.dispatchMouseEvent',{type:'mousePressed',x:500,y:300,button,buttons:button==='back'?8:16,clickCount:1});await cd.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:500,y:300,button,buttons:0,clickCount:1})};}
   else { const cd=await page.context().newCDPSession(page);press=async()=>{const event={code:key,key:key==='NumpadEnter'?'Enter':'1',windowsVirtualKeyCode:key==='NumpadEnter'?13:97,location:3,isKeypad:true};await cd.send('Input.dispatchKeyEvent',{type:'keyDown',...event});await cd.send('Input.dispatchKeyEvent',{type:'keyUp',...event})}; }
   const input=await page.evaluateHandle(()=>{const n=document.createElement('input');document.body.append(n);n.focus();return n});
   await press();assert.equal(await page.evaluate(()=>fixture.mounts),0,'shortcut must ignore the focused chat/search input');await input.evaluate(n=>n.remove());
   await page.evaluate(()=>{const url=location.href;history.replaceState(null,'',url+'&previous=1');history.pushState(null,'',url);history.pushState(null,'',url+'&next=1');history.back()});await page.waitForURL(address+'/?key='+key);
   await press();await dialog.waitFor();await dialog.getByRole('tab',{name:'Сводка',exact:true}).focus();await press();assert.equal(await dialog.count(),1);await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});await press();await dialog.waitFor();assert.equal(await page.evaluate(()=>fixture.mounts),2);assert.equal(page.url(),address+'/?key='+key,'side button must not navigate history');
  }
  await page.goto(address+'/?disabled=1');await page.waitForFunction(()=>window.ready);await page.evaluate(()=>fixture.modes.mode='dungeon');await page.keyboard.press('k');assert.equal(await page.locator('.dfo-dungeon-launch').count(),0);
  assert.deepEqual(errors,[]);console.log('PASS: live dungeon tabs/counters, inherited mark title, fixed footer/small screen, safe names, exact native journal UID focus, live changes, reconnect/exit teardown, keyboard/NumPad/mouse shortcuts and no duplicates/page errors');
 }catch(e){if(page)console.error('Browser state:',await page.evaluate(()=>({text:document.body.innerText.slice(-2400),ready:window.ready,tools:Object.keys(window.__dfoDungeonTools||{})})).catch(()=>null));throw e}
 finally{await browser?.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
