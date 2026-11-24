#!/usr/bin/env node
'use strict';
// Real native blocks: test height reduction, intact nodes, deferred changes and cached layout.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.DFO_PLAYWRIGHT_MODULE||'playwright');
const {server}=require('./test-item-cards-browser.cjs');
async function main(){
 let browser;await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.DFO_CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[],cases=[];
  page.on('pageerror',e=>errors.push(e.stack));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/?ru&online');await page.waitForFunction(()=>window.ready);
  await page.evaluate(async()=>{
   probe.show('combined');await Promise.all(['DFO Greengoth','DFO Flexi','DFO Gabin','DFO Ckazka','DFO Ritalin','DFO Wolga'].map(f=>document.fonts.load('16px "'+f+'"')));
   probe.cases.leftHeavy={...probe.cases.steel,name:'Кираса с очень длинным именем '.repeat(14)};
   probe.cases.passive={...probe.cases.combined,name:'Passive and active powers',enchantments:[{type:10,param:5},{type:3,param:0},{type:3,param:1},{type:0,param:4},{type:1,param:37},{type:2,param:50}]};
   window.balanceOrder=n=>[...n.querySelector('.dfo-item-effects').children,...n.querySelector('.dfo-item-overflow').children];
   window.balanceReference=n=>{
    const copy=n.closest('.dfo-item-host').cloneNode(true);copy.style.cssText+=';visibility:hidden!important;zoom:1;left:-10000px;top:0';
    n.closest('.dfo-item-host').parentElement.append(copy);
    try{
     const card=copy.querySelector('.dfo-item-card'),right=card.querySelector('.dfo-item-effects'),left=card.querySelector('.dfo-item-overflow'),blocks=balanceOrder(card);
     right.append(...blocks);const original=card.offsetHeight;let best=original;
     for(let at=blocks.length-1;at>0;at--){left.prepend(blocks[at]);if(left.scrollWidth<=left.clientWidth+1)best=Math.min(best,card.offsetHeight)}
     return {original,best};
    }finally{copy.remove()}
   };
  });
  const frames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  for(const id of ['steel','ruhn','wyrd','spells','combined','passive','leftHeavy']){
   await page.evaluate(id=>probe.show(id),id);await frames();
   const result=await page.evaluate(()=>{
    const card=document.querySelector('.inv-tip .dfo-item-card'),right=card.querySelector('.dfo-item-effects'),left=card.querySelector('.dfo-item-overflow');
    const reference=balanceReference(card),all=balanceOrder(card);
    window.balanceCard=card;window.balanceSaved=all;window.balanceMarkup=all.map(n=>n.outerHTML);
    return {...reference,height:card.offsetHeight,width:card.offsetWidth,moved:left.children.length,blocks:all.length,right:right.children.length,passive:card.querySelector('[data-group=properties]>h4')?.textContent,strike:card.querySelector('[data-group=strike]>h4')?.textContent};
   });
   assert.ok(result.height<=result.original+1,id+' cannot grow taller through balancing: '+JSON.stringify(result));
   assert.ok(result.height<=result.best+1,id+' should choose the shortest whole-tail split: '+JSON.stringify(result));
   assert.ok(result.right>0||result.blocks===0,id+' keeps its leading groups on the right');
   if(result.passive)assert.equal(result.passive,'Пассивные свойства');
   if(result.strike)assert.equal(result.strike,'Накладывает при попадании');
   if(id==='leftHeavy')assert.equal(result.moved,0,'No transfer when the left column is already taller');
   // Scaling changes available column widths without the native resize handler dismissing hover.
   await page.evaluate(()=>{document.body.style.transformOrigin='0 0';document.body.style.transform='scale(4)'});await frames();
   await page.evaluate(()=>{document.body.style.transform='none'});await frames();
   const identity=await page.evaluate(()=>({connected:balanceCard.isConnected,unchanged:balanceSaved.every((n,i)=>n.outerHTML===balanceMarkup[i]),sameOrder:balanceOrder(balanceCard).every((n,i)=>n===balanceSaved[i]),unique:new Set(balanceSaved).size===balanceSaved.length}));
   assert.deepEqual(identity,{connected:true,unchanged:true,sameOrder:true,unique:true},id+' moves intact nodes without altering block internals');
   cases.push({id,...result});
  }
  assert.ok(cases.some(c=>c.moved&&c.original-c.height>=20),'A real heavy item must become materially shorter');
  await page.evaluate(()=>{
   probe.show('combined');const card=document.querySelector('.inv-tip .dfo-item-card');
   window.balanceCard=card;window.balanceSaved=balanceOrder(card);window.balanceReads={...auditNative.calls};
   const extra=document.createElement('div');extra.textContent='Deferred native block';
   extra.onclick=()=>window.balanceClicks=(window.balanceClicks||0)+1;
   window.balanceExtra=extra;window.balanceSaved.push(extra);card.querySelector('.dfo-item-effects').append(extra);
   __dfoItemCards.fitCard(card,900);
   window.balanceImmediate=balanceOrder(card).every((n,i)=>n===balanceSaved[i]);
  });
  await frames();await frames();
  const deferred=await page.evaluate(()=>{
   const order=balanceOrder(balanceCard);balanceExtra.click();
   return {sameOrder:order.length===balanceSaved.length&&order.every((n,i)=>n===balanceSaved[i]),immediateOrder:balanceImmediate,clicks:balanceClicks,sameReads:JSON.stringify(auditNative.calls)===JSON.stringify(balanceReads)};
  });
  assert.deepEqual(deferred,{sameOrder:true,immediateOrder:true,clicks:1,sameReads:true},'Deferred blocks keep their logical order, handlers and cached price, including immediate native fit');
  await page.evaluate(()=>{balanceExtra.style.minWidth='270px';balanceExtra.firstChild.textContent='A native block with a minimum width.'});
  await frames();await frames();
  assert.equal(await page.evaluate(()=>balanceExtra.parentElement===balanceCard.querySelector('.dfo-item-effects')),true,'A block too wide for the left column must remain on the right');
  await page.evaluate(()=>balanceExtra.remove());await frames();await frames();
  const before=await page.evaluate(()=>__dfoItemCards.stats());
  await page.evaluate(()=>{for(let i=0;i<40;i++)__dfoItemCards.fitCard(balanceCard,900)});await frames();
  const after=await page.evaluate(()=>__dfoItemCards.stats());
  assert.equal(after.layouts,before.layouts,'Repeated native fits must not rebalance an unchanged card');
  assert.equal(after.balances,before.balances,'Internal node moves must not cause an observer loop');
  assert.equal(after.failures,0);assert.deepEqual(errors,[]);
  if(process.env.DFO_SCREENSHOT_DIR){
   await page.evaluate(()=>probe.show('passive'));await frames();
   fs.mkdirSync(process.env.DFO_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.DFO_SCREENSHOT_DIR,'balanced-item-card.png')});
  }
  const report={cases,deferred,unchangedFits:40,stats:after,errors};
  if(process.env.DFO_BALANCE_REPORT)fs.writeFileSync(process.env.DFO_BALANCE_REPORT,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
