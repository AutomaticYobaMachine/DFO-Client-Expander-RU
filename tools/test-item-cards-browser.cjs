#!/usr/bin/env node
'use strict';
// Actual published inventory renderer and game laws, served unchanged except for production hooks.
// DFO_PLAYWRIGHT_MODULE=... DFO_CHROMIUM_PATH=... node tools/test-item-cards-browser.cjs <game-build>
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require(process.env.DFO_PLAYWRIGHT_MODULE || 'playwright');
const {buildDict,buildI18n,buildQuests}=require('../src/ru-build.cjs');
const root = path.resolve(__dirname, '..'), build = path.resolve(process.argv[2] || process.env.DFO_BUILD_DIR || '../daggerfall-js-source/dist');
const modDir=path.resolve(process.env.DFO_CARD_MOD_DIR||path.join(root,'src/mod'));
const { transformAsset } = require(path.join(modDir,'transforms.cjs'));
const assets = path.join(build, 'assets');
const fullRu=process.env.DFO_CARD_AUDIT_FULL_RU==='1';
const ruContext=fullRu?{fontB64:fs.readFileSync(path.join(root,'data/ru/tiny5_cyrillic.woff2')).toString('base64'),quests:buildQuests(path.join(root,'data/ru')),ql:JSON.parse(fs.readFileSync(path.join(root,'data/ru/ql_ru.json')))}:{};
const entry = fs.readdirSync(assets).find(file => /^enhancedInventory-.*\.js$/.test(file) && fs.readFileSync(path.join(assets, file), 'utf8').includes('as mountEnhancedInventory'));
assert.ok(entry, 'Need the actual published game assets');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:#172029;height:100%;overflow:hidden}#hover-target{position:fixed;right:20px;bottom:20px;width:90px;height:45px;z-index:2147483647}
</style><script>window.__DFO_MOD_CFG__={itemCards:{enabled:!location.search.includes('off')},ru:{on:new URLSearchParams(location.search).has('ru')}};</script><script src="/dfo-mod/dfo_item_cards.js"></script>
<script>
if(window.__dfoItemCards){
 const api=window.__dfoItemCards;window.auditNative={readers:{},calls:{}};
 window.__dfoItemCards={...api,register(parts){
  Object.assign(auditNative.readers,parts);
  api.register(Object.fromEntries(Object.entries(parts).map(([key,fn])=>[key,(...args)=>{auditNative.calls[key]=(auditNative.calls[key]||0)+1;return fn(...args)}])));
 }};
}
</script></head><body>
<div id="enhanced-inventory"></div><button id="hover-target">Item</button><script type="module">
import {mountEnhancedInventory,showItemHover,hideItemHover,itemLine,itemPowerLines} from '/assets/${entry}';
const base={stackCount:1,currentCondition:100,maxCondition:100,flags:0,isIdentified:true};
const mk=(name,group,templateIndex,material,extra={})=>({...base,name,group,templateIndex,material,...extra});
const cases={
 steel:mk('Steel cuirass','Armor',102,513,{value:600}),
 chain:mk('Chain cuirass','Armor',102,256,{value:200}),
 missing:mk('Missing material','Armor',102,undefined,{value:100}),
 rare:mk('Rare Mithril longsword','Weapons',120,5,{rarity:'rare',value:3425,affixes:[{id:'damage',value:19},{id:'skill',param:29,value:14},{id:'skill',param:5,value:11}]}),
 unknown:mk('Secret sword','Weapons',120,5,{rarity:'magic',isIdentified:false,value:99999,enchantments:[{type:0,param:0}]}),
 stack:mk('Arrows','Weapons',131,1,{value:2,stackCount:40}),
 pellets:mk('Dwemer pellets','Weapons',561,0,{value:4,stackCount:20}),
 ruhn:mk('Ruhn greaves','Armor',104,521,{rarity:'aetheric',aetheric:'ruhn-greaves',value:1600,sigil:{set:'ruhn',party:1,xp:37500},affixes:[{id:'armor',value:20},{id:'resist',param:'fire',value:10},{id:'weight',value:50}]}),
 wyrd:mk('Gatherer gloves','Armor',103,0,{rarity:'aetheric',aetheric:'wyrd-gloves',value:1000,sigil:{set:'wyrd',party:1,xp:37500},affixes:[{id:'armor',value:12},{id:'stat',param:'agility',value:10},{id:'skill',param:34,value:20}]}),
 spells:mk('Many spells','Weapons',120,9,{rarity:'rare',value:7000,affixes:[{id:'damage',value:22},{id:'skill',param:29,value:17},{id:'skill',param:5,value:16},{id:'skill',param:7,value:19}],enchantments:Array.from({length:8},(_,i)=>({type:2,param:i}))}),
 base:mk('Base sword','Weapons',120,5),
 invalid:mk('Invalid template','UselessItems2',99999,undefined),
 sockets:mk('Socket sword','Weapons',120,1,{rarity:'rare',value:100,sockets:['empty','empty']}),
 gem:mk('Set gem','Weapons',120,1,{rarity:'rare',value:100,sockets:['ruby']}),
 credit:mk('Letter of credit','MiscItems',275,undefined,{value:20000}),
 coins:mk('Gold pieces','Currency',276,undefined,{value:1,stackCount:27}),
 mail:mk('Mail hauberk','Armor',515,513,{value:480}),
 fur:mk('Fur jerkin','Armor',520,0,{message:1,value:120}),
};
cases.combined={...cases.spells,name:'Set weapon with spells and sockets',sockets:['ruby'],sigil:{set:'ruhn',power:8,party:2,xp:37500}};
const entity={isPlayer:true,name:'Card check',career:{name:'Spellsword'},level:12,stats:{strength:50,endurance:50,willpower:50,intelligence:50,agility:50,speed:50,personality:50,luck:50},skills:new Array(35).fill(40),items:Object.values(cases),goldPieces:0,spells:[],activeEffects:[],health:100,maxHealth:100,magicka:20,maxMagicka:20,fatigue:200,maxFatigue:200};
globalThis.__cardTestActivate?.(20);
const worn=mk('Worn iron sword','Weapons',120,0,{equipSlot:19,value:100,rarity:'rare',affixes:[{id:'stat',param:'willpower',value:15}]});
entity.items.push(worn);
const before=JSON.stringify(entity.items),host=document.getElementById('enhanced-inventory');
const view=mountEnhancedInventory(host,{entity,items:()=>entity.items,getQuest:id=>id===7?{displayName:'A named quest with a deliberately long title'}:null,owner:{done:false}});
const target=document.getElementById('hover-target');let selected='steel',side='shop';
target.addEventListener('mouseenter',()=>showItemHover(cases[selected],{entity},target,side));
target.addEventListener('mouseleave',hideItemHover);
window.probe={cases,entity,view,show(id,s='shop'){selected=id;side=s;showItemHover(cases[id],{entity},target,s)},hide:hideItemHover,before,line:id=>itemLine(cases[id],entity),powers:id=>itemPowerLines(cases[id],{entity},{set:false,lore:false,technique:false})};
window.ready=true;
</script></body></html>`;
const cache = new Map(), logs = [];
const server = http.createServer((req,res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if(url.pathname==='/audit-catalog.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(JSON.parse(fs.readFileSync(path.join(root,'docs/item-field-catalog.json'))).knownPublicTemplates));}
    if(url.pathname==='/audit-item-states.json'){
      const {enums,records}=JSON.parse(fs.readFileSync(path.join(root,'docs/item-field-catalog.json')));
      res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({enums,records}));
    }
    if(url.pathname.startsWith('/arena2/')&&process.env.DFO_ARENA2_DIR){
      const basename=url.pathname.slice('/arena2/'.length);
      if(!/^[A-Za-z0-9_.-]+$/.test(basename)){res.writeHead(400);return res.end();}
      res.setHeader('Content-Type','application/octet-stream');return res.end(fs.readFileSync(path.join(process.env.DFO_ARENA2_DIR,basename.toUpperCase())));
    }
    if (url.pathname === '/') {
      res.setHeader('Content-Type','text/html;charset=utf-8');
      return res.end(url.searchParams.has('ru')?html.replace('<script src="/dfo-mod/dfo_item_cards.js">','<script src="/dfo-mod/ru_dict.js"></script><script src="/dfo-mod/ru_i18n.js"></script><script src="/dfo-mod/ru_items.js"></script><script src="/dfo-mod/dfo_item_cards.js">'):html);
    }
    if(url.pathname==='/dfo-mod/ru_dict.js'){res.setHeader('Content-Type','text/javascript');return res.end(buildDict(path.join(root,'data/ru')));}
    if(url.pathname==='/dfo-mod/ru_i18n.js'){res.setHeader('Content-Type','text/javascript');return res.end(buildI18n(path.join(root,'data/ru')));}
    if(url.pathname==='/dfo-mod/ru_items.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(modDir,'page/ru_items.js')));}
    if (url.pathname === '/dfo-mod/dfo_item_cards.js') {res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(modDir,'page/dfo_item_cards.js')));}
    if (/^\/dfo-mod\/item-font-(?:text|title|sigil|set|legendary)\.(?:ttf|otf)$/.test(url.pathname)) {
      res.setHeader('Content-Type',url.pathname.endsWith('.otf')?'font/otf':'font/ttf');return res.end(fs.readFileSync(path.join(modDir,'fonts',path.basename(url.pathname))));
    }
    const file = path.resolve(build, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(build + path.sep)) {res.writeHead(403);return res.end();}
    let body = fs.readFileSync(file);
    if (file.endsWith('.js')) {
      res.setHeader('Content-Type','text/javascript');
      const on = !req.headers.referer?.includes('?off');
      const key = file + on;
      if (!cache.has(key)) {
        const result = transformAsset(url.pathname.slice(1), body.toString(), {ru:fullRu,...ruContext,marks:process.env.DFO_CARD_PRICE_AUDIT==='1',nearbyLoot:false,dungeons:false,itemCards:on});
        // Test-only access to the published game's own online/renown setters (no replacement laws).
        const renown=/function ([\w$]+)\(([\w$]+)\)\{([\w$]+)=([\w$]+)&&Number.isSafeInteger\(\2\)&&\2>=1\?\2:null\}/.exec(body.toString());
        let extra='';
        if(process.env.DFO_CARD_PRICE_AUDIT==='1'&&body.toString().includes('modeActionEnabled:')){
          const raw=body.toString(),head=/function ([\w$]+)\([\w$]+,[\w$]+=\[\],\{quality:[\w$]+=0,priceAdjustment:[\w$]+=(?:1e3|1000),/.exec(raw);
          const sale=/case`Sell`:\{[^}]{0,150}?([\w$]+)\(([\w$]+)\(([\w$]+)\),[\w$]+,[\w$]+,([\w$]+)\(\3,\{online:[\w$]+\}\)\)/.exec(raw);
          if(head&&sale)extra+='\n;globalThis.__dfoPriceAudit={tradeCost:'+head[1]+',counterValue:'+sale[2]+',saleCondition:'+sale[4]+'};';
        }
        if(renown){
          const online=/function ([\w$]+)\(([\w$]+)\)\{([\w$]+)=!!\2,\3\|\|\(([\w$]+)=null\)\}/.exec(body.toString());
          assert.ok(online);extra='\n;globalThis.__cardTestActivate=level=>{'+online[1]+'(level!=null);'+renown[1]+'(level)};';
          const duel=/function ([\w$]+)\(([\w$]+)\)\{([\w$]+)=!!\2\}var [\w$]+=\(\)=>\3;/.exec(body.toString());
          if(duel)extra+='\n;globalThis.__cardAuditDuel='+duel[1]+';';
        }
        const custom=/function ([\w$]+)\(([\w$]+)\)\{for\(let ([\w$]+) of \2\?\?\[\]\)!Number\.isFinite\(\3\?\.index\)/.exec(body.toString());
        if(custom)extra+='\n;globalThis.__cardAuditRegister='+custom[1]+';';
        const card=/function ([\w$]+)\([\w$]+,[\w$]+,[\w$]+=[\w$]+,\{body:[\w$]+=!1,own:[\w$]+=!0\}=\{\}\)\{/.exec(body.toString());
        if(card)extra+='\n;globalThis.__cardAuditBuild=(item,side,opts)=>'+card[1]+'(item,side,()=>{},opts).c;';
        if(/\/uiPrefs-[^/]+\.js$/.test(url.pathname)){
          const pref=/function ([\w$]+)\(([\w$]+),([\w$]+)\)\{return ([\w$]+)===null&&[\w$]+\(\),\4\[\2\]=\3,[\w$]+\(\)\}/.exec(body.toString());
          assert.ok(pref);extra+='\n;globalThis.__cardAuditPref='+pref[1]+';';
        }
        if(body.toString().includes('`realm.locked.line`')){
          const realm=/function ([\w$]+)\(([\w$]+)\)\{([\w$]+)=new Set\(\2\?\?\[\]\)\}/.exec(body.toString());
          if(realm)extra+='\n;globalThis.__cardAuditRealm='+realm[1]+';';
        }
        logs.push(...result.log);cache.set(key,result.text+extra);
      }
      body = cache.get(key);
    } else if(file.endsWith('.css'))res.setHeader('Content-Type','text/css');
    res.end(body);
  } catch {res.writeHead(404);res.end();}
});
async function main() {
  let browser;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  try {
    browser = await chromium.launch({executablePath:process.env.DFO_CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    const page=await browser.newPage({viewport:{width:1920,height:1080}}), errors=[];
    page.on('pageerror',error=>{errors.push(error.stack);console.error(error.stack);});
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    page.setDefaultTimeout(8000);
    await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.ready);
    assert.equal(await page.evaluate(()=>__dfoItemCards.stats().ready),true,'All pure native data readers registered');
    const card=page.locator('.inv-tip .dfo-item-card'), report=[];
    for (const id of await page.evaluate(()=>Object.keys(probe.cases))) {
      await page.evaluate(id=>probe.show(id),id);
      if(!await card.count())throw new Error(id+': '+JSON.stringify(await page.evaluate(()=>({stats:__dfoItemCards.stats(),tip:document.querySelector('.inv-tip')?.outerHTML}))));
      await card.waitFor();
      await page.evaluate(async()=>{await Promise.all(['DFO Flexi','DFO Gabin','DFO Ckazka','DFO Ritalin','DFO Wolga'].map(f=>document.fonts.load('16px "'+f+'"')));});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const result=await card.evaluate(n=>{
        const r=n.getBoundingClientRect(),s=getComputedStyle(n),bad=[];
        for(const el of [n,...n.querySelectorAll('*')]){
          if(!(el instanceof HTMLElement)||!el.getClientRects().length)continue;
          const st=getComputedStyle(el);
          if(['auto','scroll'].includes(st.overflowY)&&el.scrollHeight>el.clientHeight+1)bad.push(el.className);
        }
        const textOutside=[],walker=document.createTreeWalker(n,NodeFilter.SHOW_TEXT);let text;
        while((text=walker.nextNode())){
          if(!text.textContent.trim())continue;
          const range=document.createRange();range.selectNodeContents(text);
          for(const box of range.getClientRects())if(box.width&&box.height&&(box.left<r.left-1||box.right>r.right+1||box.top<r.top-1||box.bottom>r.bottom+1))textOutside.push(text.textContent);
        }
        return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,bad,textOutside,columns:getComputedStyle(n.querySelector('.dfo-item-main')).gridTemplateColumns.split(' ').length,text:n.innerText,powers:[...n.querySelectorAll('.dfo-item-lines>li,.dfo-item-meta>li,.dfo-item-tier')].map(e=>e.getAttribute('aria-label')||e.textContent),money:n.querySelector('.dfo-item-price-value').textContent,footer:n.querySelector('.dfo-item-footer').innerText,blocks:[...n.querySelectorAll('.sigilbox,.setbox,.techbox,.cmp')].map(e=>[e.className,e.outerHTML]),left:n.querySelector('.dfo-item-left').innerText,effects:n.querySelector('.dfo-item-effects').innerText};
      });
      assert.ok(result.width>=600&&result.width<=740,id+' width');assert.ok(result.height<=960,id+' height: '+result.height);
      assert.ok(result.x>=7&&result.y>=7&&result.right<=1913&&result.bottom<=1073,id+' viewport: '+JSON.stringify(result));
      assert.equal(result.columns,2);assert.deepEqual(result.bad,[],id+' no scroll');
      assert.deepEqual(result.textOutside,[],id+' all text stays inside the card');
      assert.equal(await card.locator('.dfo-item-footer').count(),1);assert.equal(await card.locator('.lore,.description').count(),0);
      if(id==='steel'){assert.match(result.left,/Материал\nSteel/);assert.match(result.left,/Тип брони\nPlate/);assert.equal(result.money,'~240');}
      if(id==='chain')assert.match(result.left,/Металл не указан/);
      if(id==='missing')assert.match(result.left,/Нет данных/);
      if(id==='rare')assert.match(result.money,/^~1\s370$/);
      if(id==='unknown'){assert.doesNotMatch(result.text,/99\s999/);assert.equal(result.money,'—');}
      if(id==='stack')assert.equal(result.money,'~30');
      if(id==='pellets'){assert.match(result.left,/Цена \/ кг\n~10 зол\./);assert.equal(result.money,'~30');}
      if(id==='base')assert.match(result.money,/\d/);
      if(id==='invalid')assert.equal(result.money,'—');
      if(id==='credit')assert.match(result.money,/20\s000/);
      if(id==='coins')assert.equal(result.money,'27');
      if(!['credit','coins','unknown','invalid'].includes(id))assert.match(result.money,/^~[\d\s.,]+$/,'Estimated price is marked and rounded to tens');
      assert.equal(result.footer,result.money,'footer contains only the requested money number and coin');
      assert.equal(await card.locator('svg.dfo-item-coin').count(),1);assert.equal(await card.locator('.dfo-item-corners>i').count(),4);
      if(id==='mail'){assert.match(result.left,/Кольчужная/);assert.match(result.left,/Steel/);}
      if(id==='fur')assert.match(result.left,/Мех/);
      if(['ruhn','wyrd'].includes(id)){assert.ok(result.blocks.some(x=>x[0].includes('sigilbox')),id+' native sigil');assert.ok(result.blocks.some(x=>x[0].includes('setbox')),id+' native set');}
      report.push({id,...result});
    }
    assert.deepEqual(await page.evaluate(()=>__dfoItemCards.stats().failures),0);
    // The same shared card is used for local, shop, remote/trade and chat links.
    for(const side of ['local','shop','remote']){
      await page.evaluate(side=>probe.show('rare',side),side);await card.waitFor();assert.match(await card.locator('.dfo-item-price-value').innerText(),/^~1\s370$/);
    }
    await page.evaluate(()=>probe.hide());await page.locator('#hover-target').hover();await card.waitFor();
    await page.mouse.move(2,2);assert.equal(await page.locator('.inv-tip').count(),0,'Leaving item dismisses tooltip');
    // Inventory's real pointer and selected-detail flow, including native action controls.
    const row=page.locator('#enhanced-inventory .itemrow').first();await row.hover();await card.waitFor();
    await row.click();await page.locator('.packdetail .dfo-item-card').waitFor();
    assert.equal(await page.locator('.inv-tip').count(),0,'Selection must not stack a hover over its own card');
    assert.ok(await page.locator('.packdetail .acts button').count()>0,'Native selected actions survive');
    const detail=await page.locator('.packdetail .dfo-item-card').boundingBox();assert.ok(detail.x>=0&&detail.y>=0&&detail.x+detail.width<=1920&&detail.y+detail.height<=1080,JSON.stringify(detail));
    assert.equal(await page.evaluate(()=>JSON.stringify(probe.entity.items)===probe.before),true,'Viewing cards cannot mutate items');
    // Actual socket buttons must keep their original event handlers after being moved to the left column.
    await page.evaluate(()=>{const row=[...document.querySelectorAll('.itemrow')].find(n=>n.textContent.includes('Socket sword'));row?.click();});
    await page.locator('.packdetail button.sock-well').first().click();
    await page.locator('.packdetail .sock-choose,.packdetail .sock-none').waitFor();
    assert.equal(await page.evaluate(()=>JSON.stringify(probe.entity.items)===probe.before),true,'Opening a socket chooser cannot alter the item');
    // Independent on/off switch: native data and integrations stay byte-for-byte DOM-equivalent.
    const original=await browser.newPage({viewport:{width:1920,height:1080}});original.on('pageerror',e=>errors.push(e.stack));
    await original.goto(`http://127.0.0.1:${server.address().port}/?off`);await original.waitForFunction(()=>window.ready);
    for(const {id,blocks,powers} of report){
      await original.evaluate(id=>probe.show(id),id);assert.equal(await original.locator('.dfo-item-card').count(),0);
      const native=await original.locator('.inv-tip .card').evaluate(n=>[...n.querySelectorAll('.sigilbox,.setbox,.techbox,.cmp')].map(e=>[e.className,e.outerHTML]));
      assert.deepEqual(blocks,native,id+' preserve exact native integration DOM');
      for(const power of await original.locator('.inv-tip ul.rarity>li').allTextContents())assert.ok(powers.includes(power),id+' preserves native power: '+power);
    }
    assert.deepEqual(errors,[],'No browser exceptions');
    for(const key of ['itemCards.inventory','itemCards.values','itemCards.materials','itemCards.powers','itemCards.prices','itemCards.currency'])assert.ok(logs.some(x=>x[0]===key&&x[1]===1),key);
    await page.evaluate(()=>probe.show('ruhn'));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));
    if(process.env.DFO_SCREENSHOT_DIR){fs.mkdirSync(process.env.DFO_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.DFO_SCREENSHOT_DIR,'item-card-game.png')});}
    const ru=await browser.newPage({viewport:{width:1920,height:1080}});ru.on('pageerror',e=>errors.push(e.stack));
    await ru.goto(`http://127.0.0.1:${server.address().port}/?ru`,{waitUntil:'domcontentloaded'});await ru.waitForFunction(()=>window.ready);
    for(const id of ['steel','rare','ruhn','wyrd','spells','credit']){
      await ru.evaluate(id=>probe.show(id),id);const c=ru.locator('.inv-tip .dfo-item-card');await c.waitFor();
      if(id==='steel'){assert.equal(await c.locator('.dfo-item-primary').count(),1);assert.match(await c.locator('.dfo-item-stats').innerText(),/Тип брони/);}
      assert.equal(await c.locator('.dfo-item-effects li').evaluateAll(list=>list.every(n=>getComputedStyle(n).display!=='none')),true);
    }
    if(process.env.DFO_SCREENSHOT_DIR){
      await ru.evaluate(async()=>{probe.show('ruhn');await Promise.all(['DFO Flexi','DFO Gabin','DFO Ckazka','DFO Ritalin','DFO Wolga'].map(f=>document.fonts.load('16px "'+f+'"')))});
      if(process.env.DFO_ARENA2_DIR)await ru.waitForFunction(()=>document.querySelector('.inv-tip .bigicon img')?.naturalWidth>0);
      await ru.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      await ru.screenshot({path:path.join(process.env.DFO_SCREENSHOT_DIR,'item-card-game-ru.png')});
    }
    assert.deepEqual(errors,[],'RU runtime has no interaction exceptions');
    console.log(JSON.stringify({passed:report.map(({id,width,height})=>({id,width,height})),nativeBlocksPreserved:true,errors},null,2));
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={server};
