#!/usr/bin/env node
'use strict';
// Exhaustive public template/group coverage plus adversarial viewport/lifecycle checks against the real game renderer.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.DFO_PLAYWRIGHT_MODULE||'playwright');
const {server}=require('./test-item-cards-browser.cjs');
const nextFrame=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function main(){
 let browser;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 try{
  browser=await chromium.launch({executablePath:process.env.DFO_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];
  page.on('pageerror',e=>errors.push(e.stack));page.setDefaultTimeout(10000);
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.ready);
  await page.evaluate(async()=>{probe.show('steel');await Promise.all(['DFO Greengoth','DFO Flexi','DFO Gabin','DFO Ckazka','DFO Ritalin','DFO Wolga'].map(f=>document.fonts.load('16px "'+f+'"')))});
  const catalog=await page.evaluate(async()=>{
   const rows=await fetch('/audit-catalog.json').then(r=>r.json()),groups=new Set(),skipped=[],failures=[];let checked=0;
   const customFixtures=rows.filter(row=>!auditNative.readers.template(row.index));
   if(customFixtures.length){if(!globalThis.__cardAuditRegister)throw new Error('Native custom-template fixture registration unavailable');__cardAuditRegister(customFixtures)}
   const fmt=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2});
   for(const row of rows){
    const template=auditNative.readers.template(row.index);
    if(!template){skipped.push(row.index);continue}
    const families=row.groups?.length?row.groups:[template.group||'UselessItems2'];
    for(const group of families){
     const item={templateIndex:row.index,group,name:template.name,stackCount:1,currentCondition:template.hitPoints||100,maxCondition:template.hitPoints||100,material:group==='Armor'?513:0,flags:0,message:0,isIdentified:true};
     const before=JSON.stringify(item),id='catalog-'+row.index+'-'+group;probe.cases[id]=item;
     try{
      probe.show(id);const n=document.querySelector('.inv-tip .dfo-item-card');
      if(!n)throw new Error('No new card');
      const v=n.getBoundingClientRect();if(v.left<0||v.top<0||v.right>innerWidth+.1||v.bottom>innerHeight+.1)throw new Error('Card outside screen');
      const sale=auditNative.readers.sale(item),credit=row.index===275;
      let expected=sale.cost*.2;
      if(sale.resale)expected=Math.min(expected,Math.max(0,sale.cost-sale.resale.cost)*.2+sale.resale.paid);
      expected=auditNative.readers.isGold(item)?1:Math.round(expected/10)*10;
      const shown=n.querySelector('.dfo-item-price-value').textContent;
      if(credit){if(shown!=='—')throw new Error('Credit with no face value must remain unknown')}
      else if(Number.isFinite(expected)&&!shown.includes(fmt.format(expected)))throw new Error('Wrong 40% native-sale estimate: '+expected+'; shown '+shown);
      if(JSON.stringify(item)!==before)throw new Error('Item mutated');
      if(!n.querySelector('h3')?.textContent)throw new Error('Missing name');
      checked++;groups.add(group);
     }catch(e){failures.push({template:row.index,group,error:String(e)})}
     delete probe.cases[id];
    }
   }
   return {templates:rows.length,checked,groups:[...groups].sort(),customFixtures:customFixtures.map(r=>r.index),skipped,failures};
  });
  assert.deepEqual(catalog.failures,[],'All public templates/groups render without lost cards or fabricated prices');
  assert.ok(catalog.checked>450&&catalog.groups.length===27,JSON.stringify(catalog));
  await nextFrame(page);
  assert.ok((await page.evaluate(()=>__dfoItemCards.stats().active))<=1,'Detached hover observers are released');
  async function within(label){
   await nextFrame(page);
   const state=await page.evaluate(()=>{
    const vv=visualViewport,view={left:vv.offsetLeft,top:vv.offsetTop,width:vv.width,height:vv.height};
    return [...document.querySelectorAll('.dfo-item-host')].map(n=>{
     const r=n.getBoundingClientRect(),outside=[],walk=document.createTreeWalker(n,NodeFilter.SHOW_TEXT);let t;
     while((t=walk.nextNode())){
      if(!t.textContent.trim())continue;
      const range=document.createRange();range.selectNodeContents(t);
      for(const b of range.getClientRects())if(b.width&&b.height&&(b.left<view.left-.5||b.top<view.top-.5||b.right>view.left+view.width+.5||b.bottom>view.top+view.height+.5))outside.push(t.textContent.slice(0,70));
     }
     return {box:{left:r.left,top:r.top,right:r.right,bottom:r.bottom},view,zoom:n.style.zoom,outside,scroll:n.querySelector('.card-body')?getComputedStyle(n.querySelector('.card-body')).overflowY:null};
    });
   });
   assert.ok(state.length,label+' has a visible card');
   for(const {box,view,outside}of state){assert.ok(box.left>=view.left-.2&&box.top>=view.top-.2&&box.right<=view.left+view.width+.2&&box.bottom<=view.top+view.height+.2,label+': '+JSON.stringify(state));assert.deepEqual(outside,[],label+' text must stay on screen');}
   return state;
  }
  const sizes=[[1920,1080],[1920,992],[1366,768],[1280,720],[1024,768],[860,600],[800,600],[640,480],[360,640],[320,240],[240,160]];
  const matrix=[];
  for(const [width,height]of sizes){
   await page.setViewportSize({width,height});await nextFrame(page); // Native breakpoint changes repaint and dismiss old hover cards.
   for(const id of ['steel','spells','combined']){
    for(const corner of ['tl','tr','bl','br']){
     await page.evaluate(({id,corner})=>{const target=document.getElementById('hover-target');target.style.left=corner.endsWith('l')?'0':'auto';target.style.right=corner.endsWith('r')?'0':'auto';target.style.top=corner.startsWith('t')?'0':'auto';target.style.bottom=corner.startsWith('b')?'0':'auto';probe.show(id)},{id,corner});
     const [s]=await within(width+'x'+height+' '+id+' '+corner);matrix.push({width,height,id,corner,zoom:s.zoom});
    }
   }
  }
  await page.setViewportSize({width:1920,height:1080});await page.evaluate(()=>probe.show('combined'));await within('restore Full HD');
  assert.equal(await page.locator('.inv-tip').evaluate(n=>n.style.zoom),'1','Emergency zoom must reset on a large screen');
  // Parent transforms and browser zoom change the coordinate space; check without rebuilding the tooltip.
  await page.evaluate(()=>{document.body.style.transform='scale(1.3)';document.body.style.transformOrigin='0 0'});await within('scaled ancestor');
  await page.evaluate(()=>{document.body.style.transform='';document.body.style.transformOrigin=''});await within('ancestor reset');
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:2});await within('visual viewport / pinch zoom');
  await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});await within('visual viewport restored');
  await page.evaluate(()=>{
   window.auditHeightDescriptor=Object.getOwnPropertyDescriptor(window,'innerHeight');
   Object.defineProperty(window,'innerHeight',{configurable:true,value:0});window.dispatchEvent(new Event('resize'));
  });
  await nextFrame(page);
  assert.equal(await page.locator('.inv-tip').evaluate(n=>getComputedStyle(n).visibility),'hidden','A minimized/zero-size viewport must not paint a stray tooltip');
  await page.evaluate(()=>{Object.defineProperty(window,'innerHeight',auditHeightDescriptor);window.dispatchEvent(new Event('resize'))});
  await within('restored zero-size viewport');
  // Deferred content/image changes, arbitrarily long names and effects still cannot move the plaque off screen.
  await page.evaluate(()=>{
   const tip=document.querySelector('.inv-tip'),effects=tip.querySelector('.dfo-item-effects');
   tip.querySelector('h3').textContent='VERY_LONG_ITEM_NAME_'.repeat(30);
   for(let i=0;i<120;i++){const line=document.createElement('div');line.textContent='Extra effect '+i+': '+'Long property '.repeat(6);effects.append(line)}
  });
  await within('120 additional effects');
  assert.ok(await page.locator('.inv-tip').evaluate(n=>Number(n.style.zoom)<1));
  assert.equal(await page.locator('.inv-tip :is(.dfo-item-effects,.dfo-item-overflow)>div').count()>=120,true,'No effect may be removed to fit');
  await page.evaluate(()=>probe.show('steel'));await within('normal card after huge card');
  // No idle timers, whole-HUD mutation observer, repeated price reads or unbounded layout feedback.
  await nextFrame(page);
  const before=await page.evaluate(()=>({stats:__dfoItemCards.stats(),calls:{...auditNative.calls}}));
  await page.evaluate(async()=>{
   const hud=document.createElement('div');hud.id='audit-hud';document.body.append(hud);const n=document.createElement('span');hud.append(n);
   for(let i=0;i<300;i++)n.textContent='Unrelated HUD tick '+i;
   await new Promise(resolve=>setTimeout(resolve,150));hud.remove();
  });
  await nextFrame(page);const after=await page.evaluate(()=>({stats:__dfoItemCards.stats(),calls:{...auditNative.calls}}));
  assert.equal(after.stats.layouts,before.stats.layouts,'Unrelated HUD updates cannot rerun card layout');
  assert.deepEqual(after.calls,before.calls,'Sizing/HUD activity cannot reread material/pricing game rules');
  assert.equal(after.stats.failures,0);
  for(let i=0;i<80;i++)await page.evaluate(i=>probe.show(i%2?'spells':'steel'),i);
  await page.evaluate(()=>probe.hide());await nextFrame(page);
  assert.equal(await page.evaluate(()=>__dfoItemCards.stats().active),0,'Closing hover releases observers and strong references');
  const timing=await page.evaluate(()=>{
   const times=[];
   for(let i=0;i<45;i++){const start=performance.now();probe.show(i%2?'combined':'rare');times.push(performance.now()-start)}
   probe.hide();times.sort((a,b)=>a-b);return {medianMs:times[22],p95Ms:times[42],maxMs:times.at(-1)};
  });
  await nextFrame(page);
  // Real selected-detail frames, including their action footer and image note, must fit as a whole too.
  for(const [width,height]of [[1920,1080],[1280,720],[640,480],[360,640]]){
   await page.setViewportSize({width,height});await nextFrame(page);
   await page.evaluate(()=>{probe.view.repaint();document.querySelector('.itemrow:not(.on)')?.click()});
   await within(width+'x'+height+' selected card');
   assert.ok(await page.locator('.packdetail .acts button').count()>0,'Keep original actions');
  }
  await page.setViewportSize({width:1280,height:720});await nextFrame(page);
  await page.evaluate(()=>{
   probe.cases.wallet={group:'UselessItems2',templateIndex:580,stackCount:1,value:1,name:'Wallet'};
   probe.cases.binder={group:'UselessItems2',templateIndex:582,stackCount:1,value:1,name:'Card Binder',decks:[]};
   probe.entity.items.push(probe.cases.wallet,probe.cases.binder,{group:'UselessItems2',templateIndex:581,card:'rat',stackCount:12,value:1});probe.view.repaint();
  });
  for(const [id,tab]of [['wallet',7],['binder',6]]){
   await page.evaluate(({id,tab})=>{
    document.querySelectorAll('.packtab')[tab].click();
    const row=[...document.querySelectorAll('.itemrow')].find(n=>n._padItem===probe.cases[id]);
    if(!row)throw new Error('Missing '+id+' row');row.click();
   },{id,tab});
   await within(id+' native sheet appended after the shared card builder');
   assert.ok(await page.locator('.packdetail .walletsheet').count()>0,id+' sheet must survive');
  }
  assert.deepEqual(errors,[],'No exceptions in renderer, resize/observer or native actions');
  const report={catalog,viewportCases:matrix.length,scales:matrix.filter(r=>r.zoom!=='1').length,renderTiming:timing,performance:after.stats,errors};
  if(process.env.DFO_AUDIT_REPORT)fs.writeFileSync(path.resolve(process.env.DFO_AUDIT_REPORT),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
