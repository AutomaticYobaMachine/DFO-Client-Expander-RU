'use strict';
// Optional integration check against a locally built upstream checkout (npm ci there supplies Playwright).
// node tools/test-nearby-loot-browser.cjs /path/to/daggerfall-js-source
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const os = require('node:os');
const { wrap } = require('../src/mod/hook.cjs');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'dfo-browser-'));
const handle = wrap(async () => new Response('not found', {status:404}), { app: {getPath:()=>userData} });
const { transformAsset } = require('../src/mod/transforms.cjs');
const upstream = path.resolve(process.argv[2] || '.');
const { chromium } = require(process.env.DFO_PLAYWRIGHT_MODULE || path.join(upstream, 'node_modules/playwright'));
const dist = process.argv[3] ? path.resolve(process.argv[3]) : path.join(upstream, 'dist');
const entry = fs.readdirSync(path.join(dist, 'assets')).find(f => f.startsWith('enhancedInventory-') && fs.readFileSync(path.join(dist, 'assets', f), 'utf8').includes('as mountEnhancedInventory'));
assert(entry, 'Build upstream with Vite before running this check');
const cache = new Map();
let failNextSettings = false, failNextPreset = false, presetPosts = 0;
const html = `<!doctype html><html><head><meta charset="utf-8"><script>window.__DFO_MOD_CFG__={nearbyLoot:{keyCode:new URLSearchParams(location.search).get('lootKey')||'KeyJ'}};</script><script src="/dfo_item_cards.js"></script><script src="/dfo_loot_rules.js"></script><script src="/dfo_loot_ui.js"></script><script src="/dfo_loot.js"></script></head><body><canvas></canvas><script type="module">
import {mountEnhancedInventory} from '/assets/${entry}';
const mk=(name,templateIndex,extra={})=>({name,templateIndex,group:'Weapons',stackCount:1,currentCondition:50,maxCondition:50,...extra});
const rare=mk('Longsword',120,{rarity:'rare'}),plain=mk('Dagger',113),arrows=mk('Arrow',131,{stackCount:10});
const a=[plain],b=[rare,arrows];
const entity={name:'Loot check',career:{name:'Spellsword'},stats:{strength:50,endurance:50},items:[],goldPieces:0};
const feet=new Float32Array([0,0,0]); // Same storage as the live PlayerMotor in world/town/buildings.
let mounts=0,view=null,win=null;
const source=(key,items,pos)=>({key,pos,items:()=>items,visit:fn=>fn(items)});
const scene={wall:false,upper:false,table:false},collider={raycast:(_p,dir)=>scene.wall&&dir[2]>.5?3:Infinity,surfaceHit:(p,d,max)=>({dist:d[1]<0&&p[1]/-d[1]<=max?p[1]/-d[1]:Infinity,normal:[0,1,0]})};
window.fixture={entity,a,b,rare,plain,arrows,scene,feet,ordinary:false,get mounts(){return mounts},get view(){return view}};
// The real hosts prevent browser back/forward on both mouse edges too.
for(const type of ['mousedown','mouseup']) addEventListener(type,e=>{if(e.button===3||e.button===4)e.preventDefault()});
__dfoLoot.register('test',{entity,collider:()=>collider,feet:()=>feet,blocked:()=>!!win&&!win.done,sources:()=>[source('corpse:0',a,[1,0,0]),source('loot:0',b,scene.upper?[0,3,5]:scene.table?[0,1.35,5]:[0,0,15]),source('search:0',[mk('Excluded grave',113)],[0,0,0])],open(loot){
 mounts++; const host=document.createElement('div');host.id='enhanced-inventory';document.body.append(host);
 win={done:false};
 const close=()=>{if(win.done)return;win.done=true;view.unmount();host.remove();loot.closed()};
 view=mountEnhancedInventory(host,{entity,items:()=>entity.items,loot:fixture.ordinary?{...loot,nearby:false}:loot,owner:win,onExit:close});
 return win;
}});
window.ready=true;
</script></body></html>`;
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/dfo-mod/loot-') || url.pathname === '/dfo-mod/cache') {
      const chunks=[]; for await(const c of req) chunks.push(c);
      if (req.method === 'POST' && url.pathname.endsWith('loot-presets')) presetPosts++;
      if (req.method === 'POST' && ((failNextSettings && url.pathname.endsWith('loot-settings')) || (failNextPreset && url.pathname.endsWith('loot-presets')))) {
        failNextSettings = failNextPreset = false; res.statusCode=500; res.setHeader('Content-Type','application/json'); return res.end(JSON.stringify({error:'Тест: ошибка записи кеша'}));
      }
      const response=await handle(new Request('dagger://game'+url.pathname,{method:req.method,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})}));
      res.statusCode=response.status;response.headers.forEach((v,k)=>res.setHeader(k,v));return res.end(Buffer.from(await response.arrayBuffer()));
    }
    if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(html); }
    if (['/dfo_item_cards.js','/dfo_loot.js','/dfo_loot_rules.js','/dfo_loot_ui.js'].includes(url.pathname)) { res.setHeader('Content-Type', 'text/javascript'); return res.end(fs.readFileSync(path.join(__dirname, '../src/mod/page',url.pathname.slice(1)))); }
    const file = path.resolve(dist, '.' + url.pathname);
    if (!file.startsWith(dist + path.sep)) { res.statusCode=403;return res.end(); }
    let body=fs.readFileSync(file);
    if (url.pathname.endsWith('.js')) {
      res.setHeader('Content-Type','text/javascript');
      if (!cache.has(file)) cache.set(file, transformAsset(url.pathname.slice(1),body.toString(),{marks:false,ru:false,nearbyLoot:true,itemCards:true}).text);
      body=cache.get(file);
    } else if (url.pathname.endsWith('.css')) res.setHeader('Content-Type','text/css');
    res.end(body);
  } catch { if(req.url.endsWith('.js')) console.error('Missing module:', req.url); res.statusCode=404;res.end('not found'); }
});
(async()=>{
  let browser, page;
  try {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    browser=await chromium.launch({executablePath:process.env.DFO_CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    page=await browser.newPage({viewport:{width:1400,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(()=>window.ready);
    await page.keyboard.press('j');
    await page.waitForSelector('.loot-win');
    assert.equal(await page.locator('#enhanced-inventory').count(),1);
    assert.match(await page.locator('.loot-win').innerText(),/Лут рядом/i);
    assert.equal(await page.evaluate(()=>fixture.mounts),1);
    await page.locator('.loot-win .itemrow').first().hover();
    await page.locator('.inv-tip .dfo-item-card').waitFor();
    assert.equal(await page.evaluate(()=>__dfoItemCards.stats().failures),0);
    await page.mouse.move(2,2);
    const frame=page.locator('.loot-win'), fixed=await frame.boundingBox();
    const skin=await frame.evaluate(n=>{const s=getComputedStyle(n);return [s.backgroundColor,s.borderTopColor,s.borderTopWidth,s.fontFamily]});
    async function stableFrame() {
      const box=await frame.boundingBox();assert.ok(Math.abs(box.width-fixed.width)<1&&Math.abs(box.height-fixed.height)<1,'item count/search/takes must not resize the detector');
      assert.equal(await frame.locator('.remotelist').evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length),2,'detector retains two item columns');
    }
    await stableFrame();
    const first=await frame.locator('.itemrow').nth(0).boundingBox(), second=await frame.locator('.itemrow').nth(1).boundingBox();
    assert.ok(Math.abs(first.y-second.y)<1&&second.x>first.x+first.width-1,'few items actually occupy both columns');
    if(process.env.DFO_SCREENSHOT_DIR){fs.mkdirSync(process.env.DFO_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.DFO_SCREENSHOT_DIR,'loot-window.png')});}
    // Native sort: click twice; verify identity, stable ordering, and original containers unchanged.
    assert.equal(await page.locator('.loot-win .sortbtn').count(),1);
    await page.locator('.loot-win .sortbtn').click();
    assert.match(await page.locator('.loot-win .itemrow').first().innerText(),/Longsword/);
    const before=await page.locator('.loot-win .itemrow').allTextContents();
    await page.locator('.loot-win .sortbtn').click();
    assert.deepEqual(await page.locator('.loot-win .itemrow').allTextContents(),before);
    assert.deepEqual(await page.evaluate(()=>[fixture.a.map(x=>x.name),fixture.b.map(x=>x.name)]),[['Dagger'],['Longsword','Arrow']]);
    // Search and category menus refill the existing list. Typing the activation key in search is harmless.
    const search=page.locator('.loot-win input.storesearch');
    await search.fill('j'); await page.keyboard.press('j');
    assert.equal(await page.evaluate(()=>fixture.mounts),1);
    await search.fill('Longsword');
    assert.equal(await page.locator('.loot-win .itemrow').count(),1);
    await stableFrame();
    await page.locator('.loot-win .itemrow').first().click();
    await page.waitForFunction(()=>fixture.entity.items.some(x=>x.templateIndex===120));
    assert.deepEqual(await page.evaluate(()=>fixture.a.map(x=>x.name)),['Dagger']);
    assert.deepEqual(await page.evaluate(()=>fixture.b.map(x=>x.name)),['Arrow']);
    await stableFrame();
    await page.locator('.loot-win input.storesearch').fill('');
    const cat=page.locator('.loot-win select.storecat');
    for (let i=0;i<15;i++) { await cat.selectOption('all'); await page.keyboard.press('j'); }
    assert.equal(await page.locator('#enhanced-inventory').count(),1);
    assert.equal(await page.evaluate(()=>fixture.mounts),1);
    // Native filtered Take all settles both containers exactly once.
    await page.locator('.loot-win input.storesearch').fill('Arrow');
    await page.locator('.loot-win').getByRole('button',{name:'Забрать все',exact:true}).click();
    await page.locator('#enhanced-inventory').waitFor({state:'hidden'});
    assert.deepEqual(await page.evaluate(()=>fixture.a.map(x=>x.name)),['Dagger']);
    assert.equal(await page.evaluate(()=>fixture.entity.items.find(x=>x.templateIndex===131).stackCount),10);
    await page.keyboard.press('j');await page.waitForSelector('.loot-win');assert.equal(await page.evaluate(()=>fixture.mounts),2);
    // A long aggregate keeps the game's virtual rows; scrolling and refiltering still use one mount.
    await page.locator('.loot-win input.storesearch').fill('');
    await page.evaluate(()=>{
      fixture.a.push(...Array.from({length:1200},(_,i)=>({name:'Dagger',templateIndex:113,group:'Weapons',stackCount:1,uid:'stress-'+i,currentCondition:50,maxCondition:50})));
      fixture.view.repaint();
    });
    const scroller=page.locator('.loot-win .remotelist');
    await scroller.evaluate(el=>{el.scrollTop=el.scrollHeight;el.dispatchEvent(new Event('scroll'));});
    assert.ok(await page.locator('.loot-win .itemrow').count()<100,'the native list virtualizes 1200+ items');
    await stableFrame();
    assert.equal(await page.evaluate(()=>fixture.mounts),2);
    const actualTags=await page.evaluate(()=>__dfoLootRules.tagsOf(fixture.rare,__dfoLootTools));
    for(const expected of ['group:Weapons','page:weapons','rarity:rare','kind:Weapons','material:Iron','state:identified']) assert.ok(actualTags.includes(expected),expected);
    const hiddenTags=await page.evaluate(()=>__dfoLootRules.tagsOf({...fixture.rare,rarity:'magic',isIdentified:false,enchantments:[{type:0,param:0}],affixes:[{id:'damage',value:10}]},__dfoLootTools));
    assert.ok(hiddenTags.includes('state:unidentified'));assert.ok(!hiddenTags.includes('material:Iron'));assert.ok(!hiddenTags.includes('affix:damage'));
    const catalogIds=await page.evaluate(()=>__dfoLootRules.catalog(__dfoLootTools).map(t=>t.id));
    assert.ok(catalogIds.some(id=>id.startsWith('type:*:')),'custom template definitions without groups are included');
    for(const expected of ['group:PlantIngredients1','kind:Arrows','rarity:artifact','rarity:aetheric','rarity:gilded','material:Daedric','type:Armor:102','affix:damage','affix:stat:strength','affix:skill:34']) assert.ok(catalogIds.includes(expected),expected);
    // New controls use the same overlay and actual disk-backed settings endpoint.
    assert.equal(await page.locator('.loot-win').getByRole('button',{name:'Лутфильтр',exact:true}).count(),1);
    await page.locator('.loot-win').getByRole('button',{name:'Лутфильтр',exact:true}).click();
    let filter=page.getByRole('dialog',{name:'Лутфильтр',exact:true});
    assert.equal(await filter.count(),1);
    const black=filter.getByRole('button',{name:'Чёрный список',exact:true}),white=filter.getByRole('button',{name:'Белый список',exact:true});
    assert.equal(await black.getAttribute('aria-pressed'),'true');
    await white.click();assert.equal(await white.getAttribute('aria-pressed'),'true');assert.equal(await black.getAttribute('aria-pressed'),'false');
    await page.waitForFunction(()=>getComputedStyle([...document.querySelectorAll('.dfo-loot-modes button')].find(n=>n.getAttribute('aria-pressed')==='true')).backgroundColor==='rgb(216, 179, 79)');
    await page.evaluate(()=>__dfoLootSettings.flush());
    failNextSettings=true; await black.click();
    await page.waitForFunction(()=>document.querySelector('.dfo-loot-dialog [role="status"]').textContent.includes('ошибка записи'));
    assert.equal(await white.getAttribute('aria-pressed'),'true','failed mode changes restore the saved button state');
    assert.equal(await black.getAttribute('aria-pressed'),'false');
    await black.click();
    await page.evaluate(()=>__dfoLootSettings.flush());
    failNextSettings=true; await filter.locator('input[data-tag="group:Armor"]').evaluate(n=>n.click());
    await page.waitForFunction(()=>document.querySelector('.dfo-loot-dialog [role="status"]').textContent.includes('ошибка записи'));
    assert.equal(await filter.locator('input[data-tag="group:Armor"]').isChecked(),false,'a failed checkbox edit is visibly rolled back');
    await filter.locator('input[data-tag="type:Weapons:131"]').check();
    await filter.getByRole('combobox',{name:'Группа тегов'}).click();await page.keyboard.press('Escape');
    assert.equal(await filter.count(),1,'Escape dismisses an open native select without closing its dialog');
    assert.equal(await filter.locator('.dfo-loot-tags').evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length),2);
    assert.ok(await page.evaluate(()=>__dfoLootRules.catalog(__dfoLootTools).length)>300,'catalog is game-wide, not just nearby drops');
    if(process.env.DFO_SCREENSHOT_DIR){fs.mkdirSync(process.env.DFO_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.DFO_SCREENSHOT_DIR,'loot-filter.png')});}
    await page.setViewportSize({width:720,height:600});
    assert.equal(await frame.evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight}),true,'fixed loot frame fits a small screen');
    assert.equal(await filter.evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight}),true,'filter stays within a small viewport');
    assert.equal(await filter.getByRole('button',{name:'Закрыть',exact:true}).evaluate(n=>{const r=n.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight}),true,'filter footer remains reachable');
    assert.equal(await filter.locator('.wb').evaluate(n=>n.scrollWidth<=n.clientWidth),true,'filter body must not overflow horizontally');
    await filter.locator('.dfo-loot-tags').evaluate(n=>{n.scrollTop=n.scrollHeight});
    await filter.locator('.dfo-loot-tag').last().click();
    await filter.locator('.dfo-loot-tag').last().click();
    if(process.env.DFO_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.DFO_SCREENSHOT_DIR,'loot-filter-small.png')});
    await page.evaluate(()=>__dfoLootSettings.flush());
    await page.setViewportSize({width:1400,height:900});
    assert.deepEqual(await page.evaluate(()=>fixture.a.length),1201,'changing a display filter moved no loot');
    await filter.getByRole('button',{name:'Сохранить',exact:true}).click();
    let nameDialog=page.getByRole('dialog',{name:'Имя сохранённого фильтра',exact:true});
    await nameDialog.getByRole('textbox').fill('Лут J');
    await page.evaluate(()=>__dfoLootSettings.flush());
    failNextPreset=true;await nameDialog.getByRole('button',{name:'Сохранить',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.dfo-loot-dialog')[1]?.querySelector('[role="status"]').textContent.includes('ошибка записи'));
    assert.equal(await nameDialog.getByRole('textbox').inputValue(),'Лут J');
    assert.equal(await page.evaluate(()=>__dfoLootSettings.get().presets.length),0,'failed saves do not fabricate a preset');
    const downloadWait=page.waitForEvent('download');
    const postsBefore=presetPosts;
    await nameDialog.locator('form').evaluate(n=>{n.requestSubmit();n.requestSubmit();});
    const savedDownload=await downloadWait;
    assert.equal(savedDownload.suggestedFilename(),'Лут J.json');
    await nameDialog.waitFor({state:'hidden'});
    assert.equal(presetPosts-postsBefore,1,'double submit writes exactly one preset');
    const persisted=JSON.parse(fs.readFileSync(path.join(userData,'dfo-mod-cache.json'),'utf8'));
    assert.equal(persisted.loot.presets[0].name,'Лут J');
    const presetFile=path.join(userData,'dfo-mod-loot-presets',persisted.loot.presets[0].id+'.json');
    assert.equal(JSON.parse(fs.readFileSync(presetFile,'utf8')).format,'dfo-loot-filter');
    await filter.getByRole('button',{name:'Сохранить',exact:true}).click();
    nameDialog=page.getByRole('dialog',{name:'Имя сохранённого фильтра',exact:true});await nameDialog.getByRole('textbox').fill('Лут J');
    await nameDialog.getByRole('button',{name:'Сохранить',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.dfo-loot-dialog')[1]?.querySelector('[role="status"]').textContent.includes('уже существует'));
    assert.equal(await page.evaluate(()=>__dfoLootSettings.get().presets.length),1);await nameDialog.getByRole('button',{name:'Отмена',exact:true}).click();
    await filter.getByRole('button',{name:'Сохранить',exact:true}).click();
    nameDialog=page.getByRole('dialog',{name:'Имя сохранённого фильтра',exact:true});
    await nameDialog.getByRole('textbox').fill('Отмена ');await page.keyboard.press('j');assert.equal(await nameDialog.getByRole('textbox').inputValue(),'Отмена j');await page.keyboard.press('Escape');
    await nameDialog.waitFor({state:'hidden'});assert.equal(await filter.count(),1);assert.equal(await page.evaluate(()=>fixture.mounts),2);
    await white.click();
    await filter.getByRole('button',{name:'Загрузить',exact:true}).click();
    let loadDialog=page.getByRole('dialog',{name:'Загрузить фильтр',exact:true});
    await loadDialog.getByRole('option',{name:/Лут J/}).click();
    await loadDialog.getByRole('button',{name:'Отмена',exact:true}).click();
    assert.equal(await filter.getByRole('button',{name:'Белый список',exact:true}).getAttribute('aria-pressed'),'true','cancel does not apply the selected preset');
    await filter.getByRole('button',{name:'Загрузить',exact:true}).click();
    loadDialog=page.getByRole('dialog',{name:'Загрузить фильтр',exact:true});
    await loadDialog.getByRole('option',{name:/Лут J/}).click();
    await loadDialog.getByRole('button',{name:'Загрузить',exact:true}).click();
    await loadDialog.waitFor({state:'hidden'});
    assert.equal(await filter.getByRole('button',{name:'Чёрный список',exact:true}).getAttribute('aria-pressed'),'true');
    // A refresh from another game window must synchronize the parent even on Cancel.
    const store=require('../src/mod/loot-store.cjs').createLootStore(userData),current=store.state();
    store.saveSettings({...current,filter:{mode:'white',tags:['rarity:rare']}});
    await filter.getByRole('button',{name:'Загрузить',exact:true}).click();
    loadDialog=page.getByRole('dialog',{name:'Загрузить фильтр',exact:true});await loadDialog.getByRole('option',{name:/Лут J/}).waitFor();
    await loadDialog.getByRole('button',{name:'Отмена',exact:true}).click();
    assert.equal(await white.getAttribute('aria-pressed'),'true');assert.equal(await filter.locator('input[data-tag="rarity:rare"]').isChecked(),true);
    assert.equal(await filter.locator('input[data-tag="type:Weapons:131"]').isChecked(),false);
    await filter.getByRole('button',{name:'Загрузить',exact:true}).click();loadDialog=page.getByRole('dialog',{name:'Загрузить фильтр',exact:true});
    await loadDialog.getByRole('option',{name:/Лут J/}).click();await loadDialog.getByRole('button',{name:'Загрузить',exact:true}).click();await loadDialog.waitFor({state:'hidden'});
    await filter.getByRole('button',{name:'Закрыть',exact:true}).click();
    await page.keyboard.press('Escape');await page.locator('#enhanced-inventory').waitFor({state:'hidden'});
    await page.reload();await page.waitForFunction(()=>window.ready);
    await page.keyboard.press('j');await page.waitForSelector('.loot-win');
    assert.equal(await page.locator('.loot-win .itemrow').count(),2,'saved filter hides only Arrow after a reload');
    assert.equal(await page.evaluate(()=>fixture.b.length),2,'hidden loot remains at its source');
    await page.locator('.loot-win').getByRole('button',{name:'Автолут',exact:true}).click();
    const auto=page.getByRole('dialog',{name:'Автолут по кнопке лута',exact:true});
    failNextSettings=true;await auto.locator('input[data-autoloot-enabled]').evaluate(n=>n.click());
    await page.waitForFunction(()=>document.querySelector('.dfo-loot-dialog [role="status"]').textContent.includes('ошибка записи'));
    assert.equal(await auto.locator('input[data-autoloot-enabled]').isChecked(),false);
    await auto.locator('input[data-autoloot-enabled]').check();
    await auto.getByRole('searchbox',{name:'Поиск конкретного предмета'}).fill('Arrow');
    await page.evaluate(()=>__dfoLootSettings.flush());failNextSettings=true;
    await auto.locator('input[data-item-key="type:Weapons:131"]').evaluate(n=>n.click());
    await page.waitForFunction(()=>document.querySelector('.dfo-loot-dialog [role="status"]').textContent.includes('ошибка записи'));
    assert.equal(await auto.locator('input[data-item-key="type:Weapons:131"]').isChecked(),false);
    assert.match(await auto.locator('p.dfo-loot-note').last().innerText(),/Правил: 0/);
    await auto.locator('input[data-item-key="type:Weapons:131"]').check();
    assert.match(await auto.locator('p.dfo-loot-note').last().innerText(),/Правил: 1/);
    if(process.env.DFO_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.DFO_SCREENSHOT_DIR,'auto-loot.png')});
    await auto.getByRole('button',{name:'Закрыть',exact:true}).click();
    await page.evaluate(()=>__dfoLootSettings.flush());
    assert.equal(await page.evaluate(()=>fixture.entity.items.length),0,'configuring auto-loot alone never picks up items');
    await page.keyboard.press('Escape');await page.locator('#enhanced-inventory').waitFor({state:'hidden'});
    await page.keyboard.press('j');await page.waitForSelector('.loot-win');
    assert.equal(await page.evaluate(()=>fixture.entity.items.find(x=>x.templateIndex===131)?.stackCount),10,'auto-loot bypasses blacklist');
    assert.equal(await page.evaluate(()=>fixture.b.filter(x=>x.templateIndex===131).length),0);
    assert.equal(await page.locator('#enhanced-inventory').count(),1);
    await page.reload();await page.waitForFunction(()=>window.ready);await page.keyboard.press('j');await page.waitForSelector('.loot-win');
    assert.equal(await page.evaluate(()=>fixture.entity.items.find(x=>x.templateIndex===131)?.stackCount),10,'auto-loot rules survive a restart');
    assert.equal(await page.locator('.loot-win .itemrow').count(),2);
    await page.reload();await page.waitForFunction(()=>window.ready);await page.evaluate(()=>fixture.scene.wall=true);
    await page.keyboard.press('j');await page.waitForSelector('.loot-win');
    assert.equal(await page.locator('.loot-win .itemrow').count(),1);assert.equal(await page.evaluate(()=>fixture.b.length),2);assert.equal(await page.evaluate(()=>fixture.entity.items.length),0,'wall blocks auto-loot too');
    await page.keyboard.press('Escape');await page.locator('#enhanced-inventory').waitFor({state:'hidden'});
    await page.evaluate(()=>fixture.scene.wall=false);await page.keyboard.press('j');await page.waitForSelector('.loot-win');
    assert.equal(await page.locator('.loot-win .itemrow').count(),2);assert.equal(await page.evaluate(()=>fixture.entity.items.length),1);
    await page.evaluate(()=>fixture.scene.wall=true);
    await page.locator('.loot-win .itemrow').filter({hasText:'Longsword'}).click();
    await page.waitForFunction(()=>fixture.entity.items.every(x=>x.templateIndex!==120)&&![...document.querySelectorAll('.loot-win .itemrow')].some(n=>n.textContent.includes('Longsword')));
    assert.equal(await page.evaluate(()=>fixture.b.some(x=>x.templateIndex===120)),true,'a stale row cannot take loot after a door closes');
    assert.equal(await page.locator('#enhanced-inventory').count(),1);
    await page.reload();await page.waitForFunction(()=>window.ready);await page.evaluate(()=>fixture.scene.upper=true);
    await page.keyboard.press('j');await page.waitForSelector('.loot-win');
    assert.equal(await page.locator('.loot-win .itemrow').count(),1);assert.equal(await page.evaluate(()=>fixture.b.length),2);assert.equal(await page.evaluate(()=>fixture.entity.items.length),0,'upper storey is excluded from display and auto-loot');
    await page.reload();await page.waitForFunction(()=>window.ready);
    await page.evaluate(async()=>{fixture.scene.table=true;await __dfoLootSettings.load();await __dfoLootSettings.update({filter:{mode:'black',tags:[]},autoLoot:{enabled:false}});});
    await page.keyboard.press('j');await page.waitForSelector('.loot-win');assert.equal(await page.locator('.loot-win .itemrow').count(),3,'visible table loot is included');
    await page.locator('.loot-win .itemrow').filter({hasText:'Longsword'}).click();
    await page.waitForFunction(()=>fixture.entity.items.some(it=>it.templateIndex===120)&&!fixture.b.some(it=>it.templateIndex===120));
    assert.equal(await page.locator('#enhanced-inventory').count(),1);assert.equal(await page.evaluate(()=>fixture.mounts),1);
    // Collect all uses current rows and real carry plans, and closes only after success.
    await page.evaluate(()=>__dfoLootSettings.update({filter:{mode:'black',tags:[]},autoLoot:{enabled:false}}));
    await page.reload();await page.waitForFunction(()=>window.ready);await page.keyboard.press('j');await page.waitForSelector('.loot-win');
    await page.locator('.loot-win').getByRole('button',{name:'Забрать все',exact:true}).click();
    await page.locator('#enhanced-inventory').waitFor({state:'hidden'});
    assert.deepEqual(await page.evaluate(()=>[fixture.a.length,fixture.b.length,fixture.entity.items.length]),[0,0,3]);
    await page.reload();await page.waitForFunction(()=>window.ready);await page.evaluate(()=>fixture.entity.goldPieces=1000000);
    await page.keyboard.press('j');await page.waitForSelector('.loot-win');
    await page.locator('.loot-win').getByRole('button',{name:'Забрать все',exact:true}).click();
    await page.waitForFunction(()=>/cannot carry|нести|перегруж/i.test(document.body.textContent));
    await page.waitForFunction(()=>{const n=document.querySelector('.notice.notice-in');if(!n)return false;const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;});
    assert.equal(await page.locator('#enhanced-inventory').count(),1);assert.equal(await page.locator('.loot-win .itemrow').count(),2);
    assert.deepEqual(await page.evaluate(()=>[fixture.a.length,fixture.b.length,fixture.entity.items.map(it=>it.templateIndex)]),[1,1,[131]],'the game allows zero-weight arrows while leaving heavy weapons');
    if(process.env.DFO_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.DFO_SCREENSHOT_DIR,'loot-overweight.png')});
    // Test the actual inventory under different persisted physical bindings.
    const address=`http://127.0.0.1:${server.address().port}`;
    for(const code of ['Numpad1','NumpadEnter','NumpadAdd','NumpadDecimal','Tab']) {
      await page.goto(address+'/?lootKey='+code);await page.waitForFunction(()=>window.ready);
      await page.keyboard.press(code==='NumpadEnter'?'Enter':'Digit1');
      assert.equal(await page.locator('#enhanced-inventory').count(),0,'main keyboard key aliased '+code);
      await page.keyboard.press(code);await page.waitForSelector('.loot-win');
      assert.equal(await page.evaluate(()=>fixture.mounts),1);
      await page.keyboard.press(code);assert.equal(await page.evaluate(()=>fixture.mounts),1);
      if(code==='NumpadEnter') {
        await page.locator('.loot-win').getByRole('button',{name:'Лутфильтр',exact:true}).focus();
        await page.keyboard.press('NumpadEnter');
        await page.getByRole('dialog',{name:'Лутфильтр',exact:true}).waitFor();
        await page.keyboard.press('Escape');
        await page.getByRole('dialog',{name:'Лутфильтр',exact:true}).waitFor({state:'hidden'});
      }
      await page.keyboard.press('Escape');await page.locator('#enhanced-inventory').waitFor({state:'hidden'});
    }
    const mouseSession=await page.context().newCDPSession(page);
    async function sideMouse(button) {
      // Playwright's high-level Mouse API exposes only left/right/middle;
      // CDP emits trusted physical back/forward input, including all DOM phases.
      await mouseSession.send('Input.dispatchMouseEvent',{type:'mousePressed',x:400,y:300,button,buttons:button==='back'?8:16,clickCount:1});
      await mouseSession.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:400,y:300,button,buttons:0,clickCount:1});
    }
    for(const [code,button] of [['Mouse4','back'],['Mouse5','forward']]) {
      await page.goto(address+'/?lootKey='+code);await page.waitForFunction(()=>window.ready);
      const search=await page.evaluateHandle(()=>{const n=document.createElement('input');document.body.append(n);n.focus();return n});
      await sideMouse(button);assert.equal(await page.evaluate(()=>fixture.mounts),0,'side mouse button activated while editing');
      await search.evaluate(n=>n.remove());
      await sideMouse(button);await page.waitForSelector('.loot-win');
      assert.equal(await page.evaluate(()=>fixture.mounts),1);
      await page.locator('.loot-win .sortbtn').click();
      await sideMouse(button);assert.equal(await page.evaluate(()=>fixture.mounts),1);
      assert.equal(await page.locator('#enhanced-inventory').count(),1);
      assert.equal(page.url(),address+'/?lootKey='+code,'side mouse button navigated browser history');
      await page.keyboard.press('Escape');await page.locator('#enhanced-inventory').waitFor({state:'hidden'});
      await sideMouse(button);await page.waitForSelector('.loot-win');
      assert.equal(await page.evaluate(()=>fixture.mounts),2);
    }
    await page.keyboard.press('Escape');await page.locator('#enhanced-inventory').waitFor({state:'hidden'});
    await page.goto(address+'/');await page.waitForFunction(()=>window.ready);
    await page.evaluate(async()=>{await __dfoLootSettings.load();await __dfoLootSettings.update({filter:{mode:'black',tags:[]},autoLoot:{enabled:false}});fixture.b.length=0});
    await page.keyboard.press('j');await page.waitForSelector('.loot-win');
    assert.equal(await frame.locator('.itemrow').count(),1);await stableFrame();
    if(process.env.DFO_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.DFO_SCREENSHOT_DIR,'loot-single.png')});
    await page.keyboard.press('Escape');await page.locator('#enhanced-inventory').waitFor({state:'hidden'});
    await page.evaluate(()=>fixture.a.length=0);await page.keyboard.press('j');await page.waitForSelector('.loot-win');
    assert.equal(await frame.locator('.itemrow').count(),0);await stableFrame();
    if(process.env.DFO_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.DFO_SCREENSHOT_DIR,'loot-empty.png')});
    // Scope: with the mod's stylesheet still loaded, an ordinary corpse keeps
    // its adaptive frame and the same native colors, border and typography.
    await page.keyboard.press('Escape');await page.locator('#enhanced-inventory').waitFor({state:'hidden'});
    await page.evaluate(()=>{fixture.ordinary=true;fixture.a.push(fixture.plain)});
    await page.keyboard.press('j');await page.waitForSelector('.loot-win');
    const ordinary=await frame.boundingBox();assert.ok(ordinary.width<fixed.width&&ordinary.height<fixed.height);
    assert.equal(await frame.locator('.dfo-loot-actions').count(),0);
    assert.deepEqual(await frame.evaluate(n=>{const s=getComputedStyle(n);return [s.backgroundColor,s.borderTopColor,s.borderTopWidth,s.fontFamily]}),skin,'native styling stays unchanged');
    assert.deepEqual(errors,[]);
    console.log('PASS: actual upstream inventory: fixed two-column detector for 0/1/1200+ items, native container styling/fit unchanged, sorting/search, filtered Take all, one overlay, virtualized lists, nested dialogs/Escape/cancel, failed writes visibly roll back, double-submit and duplicate names, disk/export presets and restart, independent auto-loot, live wall/door/floor restrictions, no page errors');
  } catch(e) {
    if(page) console.error('Browser state:',await page.evaluate(()=>({text:document.querySelector('.loot-win')?.textContent.slice(-1400),items:window.fixture?.entity.items.map(it=>it.name),pageErrors:document.querySelectorAll('.dfo-loot-dialog').length})).catch(()=>null));
    throw e;
  } finally { await browser?.close();server.close();fs.rmSync(userData,{recursive:true,force:true}); }
})().catch(e=>{console.error(e);process.exitCode=1});
