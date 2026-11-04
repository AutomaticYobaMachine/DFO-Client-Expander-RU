#!/usr/bin/env node
'use strict';
// Presentation/hover checks for the standalone stand, not game compatibility.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require(process.env.DFO_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
async function main(){
 const html=fs.readFileSync(path.join(root,'docs/item-card-stand.html'));
 const server=http.createServer((req,res)=>{if(req.url!=='/'){res.writeHead(404);res.end();return;}res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);});
 await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});
 let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.DFO_CHROMIUM_PATH?{executablePath:process.env.DFO_CHROMIUM_PATH}:{}),args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[],external=[];
  page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack);});
  await page.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){external.push(route.request().url());return route.abort();}return route.continue();});
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(()=>window.cardStand,null,{timeout:5000});
  const card=page.locator('#item-card'),target=page.locator('#preview-target');
  const snapshot=()=>page.evaluate(()=>cardStand.snapshot());
  const choose=async id=>{await page.mouse.move(5,5);await page.selectOption('#example-select',id);assert.equal(await card.isVisible(),false,'Selection pinned tooltip');await target.hover();assert.equal(await card.isVisible(),true,'Hover failed: '+id);};
  async function checkFit(label){
   const view=await snapshot();assert.equal(view.layout.fits,true,`${label}: ${JSON.stringify(view.layout)}`);assert(view.layout.height<=960);assert(view.layout.width<=740,'Tooltip widened instead of using height');assert.equal(view.layout.columns,2);
   const c=await card.evaluate(n=>{
    const r=n.getBoundingClientRect(),all=[n,...n.querySelectorAll('*')].filter(e=>e instanceof HTMLElement),badOverflow=[],tiny=[],outside=[];
    for(const e of all){const s=getComputedStyle(e);if([s.overflowX,s.overflowY].some(v=>['auto','scroll','hidden','clip'].includes(v)))badOverflow.push(e.className);}
    const w=document.createTreeWalker(n,NodeFilter.SHOW_TEXT);let t;
    while((t=w.nextNode())){if(!t.textContent.trim()||!(t.parentElement instanceof HTMLElement))continue;const s=getComputedStyle(t.parentElement);if(parseFloat(s.fontSize)<11)tiny.push(t.textContent);const range=document.createRange();range.selectNodeContents(t);const boxes=[...range.getClientRects()];if(!boxes.length||boxes.some(b=>b.left<r.left-1||b.right>r.right+1||b.top<r.top-1||b.bottom>r.bottom+1))outside.push(t.textContent);}
    const left=n.querySelector('.card-left').getBoundingClientRect(),right=n.querySelector('.card-effects').getBoundingClientRect(),foot=n.querySelector('.card-bottom').getBoundingClientRect(),price=n.querySelector('.price-value').getBoundingClientRect(),style=getComputedStyle(n),loreStyle=getComputedStyle(n.querySelector('.lore'));
    return {badOverflow,tiny,outside,within:r.left>=8&&r.right<=innerWidth-8&&r.top>=8&&r.bottom<=innerHeight-8,content:n.scrollHeight<=n.clientHeight+1&&n.scrollWidth<=n.clientWidth+1,footer:foot.top>=Math.max(left.bottom,right.bottom)-1&&foot.left<left.left&&foot.right>right.right,price:r.bottom-price.bottom<18&&r.right-price.right<18&&n.querySelector('.price').lastElementChild.classList.contains('price-value'),italic:loreStyle.fontStyle==='italic',loreColor:loreStyle.color,events:style.pointerEvents,transform:style.transform,zoom:style.zoom};
   });
   assert.deepEqual(c.badOverflow,[],'Scroll/clipping: '+label);assert.deepEqual(c.tiny,[],'Small text: '+label);assert.deepEqual(c.outside,[],'Text outside: '+label);
   assert(c.within&&c.content&&c.footer&&c.price&&c.italic,`Composition: ${label} ${JSON.stringify(c)}`);
   const color=c.loreColor.match(/\d+/g).slice(0,3).map(Number);assert(Math.max(...color)-Math.min(...color)<25,'Description is not grey');
   assert.equal(c.events,'none');assert.equal(c.transform,'none');assert.equal(Number(c.zoom),1);
   assert.equal(await card.locator('button,a,input,select,textarea,summary,[tabindex],[title]').count(),0);assert.equal(await page.locator('#item-card').count(),1);
   assert(!/NaN|undefined|Infinity/.test(await card.innerText()));
  }
  assert.equal(await card.isVisible(),false);
  const ids=await page.evaluate(()=>cardStand.caseIds),sizes=[];assert.equal(ids.length,20);
  for(const id of ids){
   await choose(id);const text=await card.innerText();await card.evaluate(n=>{window.standCardIdentity=n;});
   for(const host of ['inventory','loot','shop','chat']){await page.selectOption('#context-select',host);assert.equal(await card.innerText(),text,`${id}/${host}: content changed`);assert.equal(await page.evaluate(()=>standCardIdentity===document.querySelector('#item-card')),true);await checkFit(id+'/'+host);}
   sizes.push({id,...(await snapshot()).layout});await page.mouse.move(5,5);assert.equal(await card.isVisible(),false,'Stuck tooltip: '+id);
  }
  await choose('snac');assert.equal(await card.locator('[data-block=affixes] li').count(),4);assert.equal(await card.locator('[data-block=enchantments] li').count(),7);
  for(const s of ['Дикий огонь','Ледяной снаряд','Ледяная буря','Вампирское касание','Рука упадка','Огненная буря','Огонь волшебника','Дракончик','Критический удар','Many Endings','Сила воли +5','Язык великанов +16','Уклонение +11'])assert((await card.innerText()).includes(s),'Missing screenshot field: '+s);
  assert.match(await card.locator('.cmp').first().innerText(),/2 - 17 → 11 - 23/);assert.match(await card.locator('.cmp').first().innerText(),/5 - 17 → 11 - 23/);assert.match(await card.locator('.price-value').innerText(),/Нет данных/);
  assert.equal(await card.locator('.card-left .item-art').count(),1);assert.equal(await card.locator('.card-left [data-block=comparison]').count(),0);assert.equal(await card.locator('.card-effects [data-block=comparison]').count(),1);
  const rows=await card.locator('[data-block=enchantments] li').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().top));
  for(let index=1;index<rows.length;index++)assert(rows[index]>rows[index-1]+8,'Named effects are not separate rows');
  await choose('grave');assert.equal(await card.locator('[data-block=enchantments] li').count(),4);assert.match(await card.innerText(),/Soul Siphon/);assert.match(await card.innerText(),/15% магии/);assert.equal(await card.locator('[data-block=comparison]').count(),0);
  await choose('enchanted-sheet');assert.equal(await card.locator('[data-block=enchantments] li').count(),9);assert.match(await card.innerText(),/В полнолуние/);assert.match(await card.innerText(),/Royal Bearing/);
  for(const id of ['gatherer-gloves','ruhn-greaves']){
   await choose(id);assert.equal(await card.locator('.sigilbox.compact').count(),1);assert.equal(await card.locator('.setbox.compact').count(),1);
   assert.equal(await card.locator('.sigil-meter').count(),0);assert.equal(await card.locator('.sigil-stages[role=progressbar]').count(),1);
   assert.equal(await card.locator('.sigil-gem').count(),5);assert.equal(await card.locator('.sigil-gem.grown').count(),5);assert.equal(await card.locator('.sigil-gem.awake').count(),3);
   assert.match(await card.locator('.sigil-progress').innerText(),/Взрослый/);assert.match(await card.locator('.set-count').innerText(),/1\/9 · Bright/);
   assert.match(await card.locator('.sigil-note').innerText(),/Radiant.*30/);assert.equal(await card.locator('.set-tier.awake').count(),0);
   const nativeLayout=await card.evaluate(node=>({sigil:getComputedStyle(node.querySelector('.sigilbox')).display,set:getComputedStyle(node.querySelector('.setbox')).display,head:getComputedStyle(node.querySelector('.sigil-head')).display,places:getComputedStyle(node.querySelector('.set-places')).display}));
   assert.deepEqual(nativeLayout,{sigil:'block',set:'block',head:'flex',places:'flex'});
   assert.match(await card.locator('.set-tier-every').innerText(),id==='gatherer-gloves'?/30s/:/135s/);
  }
  await choose('snac');
  assert.equal(await card.evaluate(n=>{const r=n.getBoundingClientRect(),e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return e===n||n.contains(e);}),false,'Tooltip intercepts cursor');
  await card.evaluate(n=>{n.scrollTop=200;});assert.equal(await card.evaluate(n=>n.scrollTop),0);
  await page.keyboard.press('Escape');assert.equal(await card.isVisible(),false);await page.mouse.move(5,5);await target.hover();assert.equal(await card.isVisible(),true);
  await choose('set');assert.equal(await card.locator('.set-place').count(),9);assert.equal(await card.locator('.set-tier').count(),3);
  for(const count of ['2','4','6']){await page.selectOption('#pieces',count);assert.equal(await card.locator('.set-place.on').count(),Number(count));assert.equal(await card.locator('.set-tier.awake').count(),Number(count)/2);await checkFit('set/'+count);}
  await page.check('#duel');await target.hover();assert.equal(await card.locator('.set-tier.awake').count(),0);assert.match(await card.locator('.setbox').innerText(),/Не действует в дуэли/);await checkFit('set/duel');await page.uncheck('#duel');await page.selectOption('#pieces','4');
  await choose('sigil');assert.equal((await snapshot()).sigil.rank,3);assert.equal((await snapshot()).sigil.stage,1);assert.equal(await card.locator('.sigil-gem.grown').count(),4);assert.equal(await card.locator('.sigil-gem.awake').count(),2);
  await page.selectOption('#renown','25');assert.equal((await snapshot()).sigil.stage,2);assert.equal((await snapshot()).sigil.xp,24000);await page.selectOption('#renown','40');
  for(let i=0;i<14;i++)await page.click('#grow');await target.hover();assert.equal((await snapshot()).sigil.xp,37500);assert.equal((await snapshot()).sigil.to,null);assert.match(await card.locator('.sigil-progress').innerText(),/Взрослый/);await checkFit('sigil/max');await page.selectOption('#renown','14');
  await choose('combined');for(const block of ['affixes','enchantments','sockets','power','technique','sigil','set','craft','comparison','lore'])assert((await snapshot()).blocks.includes(block));assert.equal(await card.locator('.sock-well').count(),3);assert.equal(await card.locator('.card-left [data-block=craft]').count(),1);
  await page.check('#duel');await target.hover();await checkFit('combined/duel');await page.uncheck('#duel');
  await choose('unknown');assert.equal(await card.locator('.setbox,.sigilbox,.techbox,.power,.sock-wells,.cmp-lines').count(),0);assert(!/3\s?425|Язык гарпий|Регалии Руна/.test(await card.innerText()));
  await choose('potion');assert.match(await card.locator('.price-value').innerText(),/960/);assert.match(await card.locator('.price-subtotal').innerText(),/80/);assert.match(await card.locator('.card-left').innerText(),/2,4 кг/);
  await choose('missing');assert.match(await card.innerText(),/Металл не указан/);assert(!/Ценность \/ кг/.test(await card.innerText()));
  // Exercise the actual hover source at all four edges without changing any item data.
  await choose('snac');await page.evaluate(()=>{const t=document.querySelector('#preview-target');window.standTargetParent=t.parentNode;window.standTargetNext=t.nextSibling;document.querySelector('#scene').append(t);});
  for(const corner of ['top-left','top-right','bottom-left','bottom-right']){await page.mouse.move(5,5);await target.evaluate((n,c)=>{n.style.cssText='position:absolute;width:190px;min-height:75px;';n.style[c.endsWith('left')?'left':'right']='8px';n.style[c.startsWith('top')?'top':'bottom']='8px';},corner);await target.hover();await checkFit('corner/'+corner);}
  await page.evaluate(()=>{const t=document.querySelector('#preview-target');t.removeAttribute('style');standTargetParent.insertBefore(t,standTargetNext);});
  // Reserve vertical space for desktop chrome as well as testing the requested baseline.
  await page.setViewportSize({width:1920,height:992});for(const id of ids.filter(id=>id!=='combined')){await choose(id);await checkFit(id+'/client992');}
  await page.setViewportSize({width:1920,height:1080});await choose('snac');await page.selectOption('#context-select','inventory');
  await page.screenshot({path:path.join(root,'docs/item-card-stand.png')});await card.screenshot({path:path.join(root,'docs/item-card-snac-tooltip.png')});
  await choose('set');await card.screenshot({path:path.join(root,'docs/item-card-stand-set.png')});await choose('combined');await page.screenshot({path:path.join(root,'docs/item-card-stand-combined.png')});
  for(const id of ['grave','enchanted-sheet','gatherer-gloves','ruhn-greaves']){await choose(id);await card.screenshot({path:path.join(root,'docs/item-card-'+id+'.png')});}
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log(JSON.stringify(sizes));
  console.log('PASS: 20 examples × 4 hosts in Full HD; 19 ordinary examples with client chrome reserve; native compact Sigil/Set blocks; all effects on separate lines; every text visible; narrow 2-column tooltip; no scroll/clipping/scaling; hover/leave/Esc; states; corners; grey italic footer and bottom-right price; no external requests.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
