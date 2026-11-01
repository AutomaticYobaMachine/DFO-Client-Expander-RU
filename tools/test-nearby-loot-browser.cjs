'use strict';
// Optional integration check against a locally built upstream checkout (npm ci there supplies Playwright).
// node tools/test-nearby-loot-browser.cjs /path/to/daggerfall-js-source
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const { transformAsset } = require('../src/mod/transforms.cjs');
const upstream = path.resolve(process.argv[2] || '.');
const { chromium } = require(path.join(upstream, 'node_modules/playwright'));
const dist = process.argv[3] ? path.resolve(process.argv[3]) : path.join(upstream, 'dist');
const entry = fs.readdirSync(path.join(dist, 'assets')).find(f => f.startsWith('enhancedInventory-') && fs.readFileSync(path.join(dist, 'assets', f), 'utf8').includes('as mountEnhancedInventory'));
assert(entry, 'Build upstream with Vite before running this check');
const cache = new Map();
const html = `<!doctype html><html><head><meta charset="utf-8"><script>window.__DFO_MOD_CFG__={nearbyLoot:{keyCode:'KeyJ'}};</script><script src="/dfo_loot.js"></script></head><body><canvas></canvas><script type="module">
import {mountEnhancedInventory} from '/assets/${entry}';
const mk=(name,templateIndex,extra={})=>({name,templateIndex,group:'Weapons',stackCount:1,currentCondition:50,maxCondition:50,...extra});
const rare=mk('Longsword',120,{rarity:'rare'}),plain=mk('Dagger',113),arrows=mk('Arrow',131,{stackCount:10});
const a=[plain],b=[rare,arrows];
const entity={name:'Loot check',career:{name:'Spellsword'},stats:{strength:50,endurance:50},items:[],goldPieces:0};
let mounts=0,view=null,win=null;
const source=(key,items,pos)=>({key,pos,items:()=>items,visit:fn=>fn(items)});
window.fixture={entity,a,b,rare,plain,arrows,get mounts(){return mounts},get view(){return view}};
__dfoLoot.register('test',{entity,feet:()=>[0,0,0],blocked:()=>!!win&&!win.done,sources:()=>[source('corpse:0',a,[1,0,0]),source('loot:0',b,[0,0,15]),source('search:0',[mk('Excluded grave',113)],[0,0,0])],open(loot){
 mounts++; const host=document.createElement('div');host.id='enhanced-inventory';document.body.append(host);
 win={done:false};
 const close=()=>{if(win.done)return;win.done=true;view.unmount();host.remove();loot.closed()};
 view=mountEnhancedInventory(host,{entity,items:()=>entity.items,loot,owner:win,onExit:close});
 return win;
}});
window.ready=true;
</script></body></html>`;
const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(html); }
    if (url.pathname === '/dfo_loot.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(fs.readFileSync(path.join(__dirname, '../src/mod/page/dfo_loot.js'))); }
    const file = path.resolve(dist, '.' + url.pathname);
    if (!file.startsWith(dist + path.sep)) { res.statusCode=403;return res.end(); }
    let body=fs.readFileSync(file);
    if (url.pathname.endsWith('.js')) {
      res.setHeader('Content-Type','text/javascript');
      if (!cache.has(file)) cache.set(file, transformAsset(url.pathname.slice(1),body.toString(),{marks:false,ru:false,nearbyLoot:true}).text);
      body=cache.get(file);
    } else if (url.pathname.endsWith('.css')) res.setHeader('Content-Type','text/css');
    res.end(body);
  } catch { if(req.url.endsWith('.js')) console.error('Missing module:', req.url); res.statusCode=404;res.end('not found'); }
});
(async()=>{
  let browser;
  try {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    browser=await chromium.launch({executablePath:process.env.DFO_CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    const page=await browser.newPage({viewport:{width:1400,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(()=>window.ready);
    await page.keyboard.press('j');
    await page.waitForSelector('.loot-win');
    assert.equal(await page.locator('#enhanced-inventory').count(),1);
    assert.match(await page.locator('.loot-win').innerText(),/Лут рядом/i);
    assert.equal(await page.evaluate(()=>fixture.mounts),1);
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
    await page.locator('.loot-win .itemrow').first().click();
    await page.waitForFunction(()=>fixture.entity.items.some(x=>x.templateIndex===120));
    assert.deepEqual(await page.evaluate(()=>fixture.a.map(x=>x.name)),['Dagger']);
    assert.deepEqual(await page.evaluate(()=>fixture.b.map(x=>x.name)),['Arrow']);
    await page.locator('.loot-win input.storesearch').fill('');
    const cat=page.locator('.loot-win select.storecat');
    for (let i=0;i<15;i++) { await cat.selectOption('all'); await page.keyboard.press('j'); }
    assert.equal(await page.locator('#enhanced-inventory').count(),1);
    assert.equal(await page.evaluate(()=>fixture.mounts),1);
    // Native filtered Take all settles both containers exactly once.
    await page.locator('.loot-win input.storesearch').fill('Arrow');
    await page.locator('.loot-win button').filter({hasText:/^Take all$/}).click();
    await page.waitForFunction(()=>fixture.b.length===0);
    assert.deepEqual(await page.evaluate(()=>fixture.a.map(x=>x.name)),['Dagger']);
    assert.equal(await page.evaluate(()=>fixture.entity.items.find(x=>x.templateIndex===131).stackCount),10);
    // A long aggregate keeps the game's virtual rows; scrolling and refiltering still use one mount.
    await page.locator('.loot-win input.storesearch').fill('');
    await page.evaluate(()=>{
      fixture.a.push(...Array.from({length:1200},(_,i)=>({name:'Dagger',templateIndex:113,group:'Weapons',stackCount:1,uid:'stress-'+i,currentCondition:50,maxCondition:50})));
      fixture.view.repaint();
    });
    const scroller=page.locator('.loot-win .remotelist');
    await scroller.evaluate(el=>{el.scrollTop=el.scrollHeight;el.dispatchEvent(new Event('scroll'));});
    assert.ok(await page.locator('.loot-win .itemrow').count()<100,'the native list virtualizes 1200+ items');
    assert.equal(await page.evaluate(()=>fixture.mounts),1);
    assert.deepEqual(errors,[]);
    console.log('PASS: actual upstream inventory: sort, search, category filters, correct sources, filtered Take all, one overlay, virtualized 1200+ items, no page errors');
  } finally { await browser?.close();server.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
