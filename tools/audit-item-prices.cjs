#!/usr/bin/env node
'use strict';
// Calls the actual released counter's functions. No replacement economy or player actions.
// DFO_PLAYWRIGHT_MODULE=... node tools/audit-item-prices.cjs <published-build>
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
process.env.DFO_CARD_PRICE_AUDIT='1';
const {chromium}=require(process.env.DFO_PLAYWRIGHT_MODULE||'playwright');
const {server}=require('./test-item-cards-browser.cjs');
(async()=>{
 let browser;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 try{
  browser=await chromium.launch({executablePath:process.env.DFO_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];
  page.on('pageerror',e=>errors.push(e.stack));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/?online`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.ready&&globalThis.__dfoPriceAudit&&globalThis.__dfoCost&&globalThis.__dfoTradePrice);
  const result=await page.evaluate(()=>{
    const api=__dfoPriceAudit,skills={mercantile:60,personality:70},quality=10,priceAdjustment=1000;
    const base={templateIndex:120,group:'Weapons',material:0,name:'Price audit fixture',value:1000,stackCount:1,currentCondition:100,maxCondition:100,isIdentified:true};
    const fixtures=[['iron, whole',{}],['iron, worn 20%',{currentCondition:20}],['iron, repaired by smith',{foundCondition:20,currentCondition:100,selfMended:0}],['iron, self mended',{foundCondition:20,currentCondition:100,selfMended:80}],['daedric, whole',{material:9}],['crafted rare',{value:2000,provenance:'smith audit',rarity:'rare',affixes:[{id:'damage',value:20}]}],['three pieces',{stackCount:3}],['counter-bought piece',{counterBought:true,counterPaid:95,counterValue:1000}]];
    const probe=100000;
    const percent=who=>100*__dfoTradePrice(__dfoCost(probe,quality,priceAdjustment,-1),quality,who,true,{online:true})/probe;
    const rows=fixtures.map(([name,fields])=>{
      const item={...base,...fields},before=JSON.stringify(item),lot=api.tradeCost('Sell',[item],{quality,priceAdjustment,online:true});
      const nativeDefault=__dfoTradePrice(lot.cost,quality,undefined,true,{online:true}),nativePersonal=__dfoTradePrice(lot.cost,quality,skills,true,{online:true});
      const nominal=auditNative.readers.value(item)*item.stackCount;
      const injected=auditNative.readers.sale(item);
      if(JSON.stringify(injected)!==JSON.stringify(lot))throw Error('The production bridge changed native Sell results');
      let estimate=lot.cost*.2;
      if(lot.resale)estimate=Math.min(estimate,Math.max(0,lot.cost-lot.resale.cost)*.2+lot.resale.paid);
      const displayed='~'+new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(Math.round(estimate/10)*10);
      window.probe.cases['price-audit']=item;window.probe.show('price-audit');
      const actual=document.querySelector('.inv-tip .dfo-item-price-value').textContent;
      if(actual!==displayed)throw Error('Wrong native 40% estimate: '+name+'; expected '+displayed+'; actual '+actual);
      if(JSON.stringify(item)!==before)throw Error('Pricing mutated item');
      return {name,nominal,counterUnit:api.counterValue(item),saleCondition:api.saleCondition(item,{online:true}),nativeCost:lot.cost,nativeDefault,nativePersonal,nominalOverSale:nominal/nativePersonal,empiricalDivide73Plus40:Math.round(nominal/7.3*1.4),resale:lot.resale??null,estimate40:estimate,displayed:actual};
    });
    const shopSamples=[];
    for(const q of [1,10,20])for(const adjustment of [800,1000,1250]){
      const cost=__dfoCost(probe,q,adjustment,-1);
      shopSamples.push({quality:q,priceAdjustment:adjustment,basePercent:100*__dfoTradePrice(cost,q,undefined,true,{online:true})/probe,personalPercent:100*__dfoTradePrice(cost,q,skills,true,{online:true})/probe});
    }
    return {quality,priceAdjustment,skills,basePercent:percent(undefined),personalPercent:percent(skills),rows,shopSamples};
  });
  assert.deepEqual(errors,[],'No exceptions from the real released client');
  const build=path.resolve(process.argv[2]||process.env.DFO_BUILD_DIR),manifest=path.join(build,'verified-manifest.json');
  const verified=fs.existsSync(manifest)?JSON.parse(fs.readFileSync(manifest)):null;
  result.version=verified?.version??path.basename(build);
  result.nativeAssets=verified?.files.filter(f=>/^assets\/(worldTick-|equip-|enhancedInventory-)/.test(f.path)).map(({path,sha256})=>({path,sha256}));
  result.limits=['Controlled item fixtures; player screenshots do not expose their hidden foundCondition/provenance fields.','Calls actual released JS with online=true; does not perform a live trade.','nativeDefault/nativePersonal show the haggle before the counter-bought resale cap; estimate40/displayed include that cap.'];
  console.log(JSON.stringify(result,null,2));
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
