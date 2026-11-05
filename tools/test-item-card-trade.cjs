#!/usr/bin/env node
'use strict';
// Real inventory rows and real enhanced trade rows; identical item objects, no sales/identification.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.DFO_PLAYWRIGHT_MODULE||'playwright'),{server}=require('./test-item-cards-browser.cjs');
const build=path.resolve(process.argv[2]||process.env.DFO_BUILD_DIR),assets=path.join(build,'assets');
const trade=fs.readdirSync(assets).find(f=>/^enhancedTrade-.*\.js$/.test(f)&&fs.readFileSync(path.join(assets,f),'utf8').includes('as mountEnhancedTrade'));
const inventoryFile=fs.readdirSync(assets).find(f=>/^equip-.*\.js$/.test(f));
const inventoryText=fs.readFileSync(path.join(assets,inventoryFile),'utf8');
const enchantedName=/function ([\w$]+)\(([\w$]+)\)\{return!!\(\2\?\.enchantments\?\.length\|\|\2\?\.customEnchantments\?\.length\)\}/.exec(inventoryText)?.[1];
assert.ok(enchantedName,'Need native isEnchanted used by worldModes, not a rarity approximation');
const enchantedExport=new RegExp('(?:\\{|,)'+enchantedName.replace(/\$/g,'\\$')+' as ([\\w$]+)').exec(inventoryText.slice(inventoryText.lastIndexOf('export{')))?.[1];
assert.ok(enchantedExport,'Need native isEnchanted export');
async function main(){
 let browser;await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.DFO_CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.stack));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  const russian=process.env.DFO_CARD_TRADE_RU==='1';
  await page.goto('http://127.0.0.1:'+server.address().port+'/?online'+(russian?'&ru':''));await page.waitForFunction(()=>window.ready);
  await page.evaluate(async ({trade,inventoryFile,enchantedExport})=>{
   const module=await import('/assets/'+trade);window.mountTrade=module.mountEnhancedTrade;
   window.nativeEnchanted=(await import('/assets/'+inventoryFile))[enchantedExport];
   const base={group:'Weapons',templateIndex:120,material:0,name:'Condition probe',value:1000,stackCount:1,currentCondition:100,maxCondition:100,isIdentified:true};
   probe.cases.found={...base,currentCondition:100,foundCondition:20,selfMended:0};
   probe.cases.crafted={...base,rarity:'rare',value:2000,provenance:'smith test',affixes:[{id:'damage',value:20}]};
   probe.cases.unknownRare={...base,rarity:'rare',isIdentified:false,value:2000,affixes:[{id:'damage',value:20}],enchantments:[{type:10,param:5}]};
   probe.cases.effects={...base,name:'Silver enchanted sword',material:2,rarity:'rare',value:2000,affixes:[{id:'damage',value:20},{id:'skill',param:5,value:16}],enchantments:[{type:10,param:5},{type:3,param:0},{type:2,param:50}]};
   window.cardTradeHost=document.createElement('div');cardTradeHost.id='card-trade-host';document.body.append(cardTradeHost);
   window.cardCases=['steel','rare','unknown','unknownRare','stack','ruhn','found','crafted','effects'];
   window.itemCopies=Object.fromEntries(cardCases.map(id=>[id,JSON.stringify(probe.cases[id])]));
  },{trade,inventoryFile,enchantedExport});
  await page.evaluate(async()=>{probe.show('steel');await Promise.all(['DFO Greengoth','DFO Flexi','DFO Gabin','DFO Ckazka','DFO Ritalin','DFO Wolga'].map(f=>document.fonts.load('16px "'+f+'"')));probe.hide()});
  const card=page.locator('.inv-tip .dfo-item-card');
  async function findRow(host){
   for(let i=0;i<=await host.locator('.packtab').count();i++){
    if(await host.locator('.itemrow').count())return host.locator('.itemrow').first();
    const buttons=host.locator('.packtab');if(i<await buttons.count())await buttons.nth(i).click();
   }
   throw Error('Native window has no row: '+(await host.innerText()).slice(0,500));
  }
  async function value(row){await page.mouse.move(1,1);await row.hover();await card.waitFor();return card.locator('.dfo-item-price-value').innerText();}
  const baselines={},rows=[];
  for(const id of await page.evaluate(()=>cardCases)){
   await page.evaluate(id=>{probe.entity.items=[probe.cases[id]];probe.view.repaint()},id);
   baselines[id]=await value(await findRow(page.locator('#enhanced-inventory')));
  }
  await page.evaluate(()=>{probe.hide();document.getElementById('enhanced-inventory').style.display='none'});
  for(const config of [{mode:'Sell',quality:1,priceAdjustment:800,skills:{mercantile:0,personality:20}},{mode:'Sell',quality:20,priceAdjustment:1250,skills:{mercantile:100,personality:90}},{mode:'SellMagic',quality:10,priceAdjustment:1000,skills:{mercantile:60,personality:70}},{mode:'Buy',quality:15,priceAdjustment:900,skills:{mercantile:20,personality:50}}]){
   for(const id of Object.keys(baselines)){
    if(config.mode==='SellMagic'&&!await page.evaluate(id=>nativeEnchanted(probe.cases[id]),id))continue;
    await page.evaluate(({id,config})=>{
     const item=probe.cases[id];probe.entity.items=[item];Object.assign(probe.entity.stats,{personality:config.skills.personality});
     window.tradeView=mountTrade(cardTradeHost,{mode:config.mode,entity:probe.entity,packItems:()=>probe.entity.items,shelfItems:()=>[],accepts:()=>true,enchanted:nativeEnchanted,isEquipped:()=>false,gold:()=>100000,shopName:'Price parity fixture',priceCtx:()=>({...config,online:true}),owner:{done:false}});
    },{id,config});
    let actual;try{actual=await value(await findRow(page.locator('#card-trade-host')))}catch(e){throw new Error(JSON.stringify({id,config})+': '+e.message,{cause:e})}
    assert.equal(actual,baselines[id],JSON.stringify({id,config,actual,inventory:baselines[id]}));
    if(id.startsWith('unknown')){
     const hidden=await page.evaluate(id=>({native:probe.powers(id).map(text=>{const span=document.createElement('span');span.textContent=text;return span.textContent}),actual:[...document.querySelectorAll('.inv-tip .dfo-item-lines>li,.inv-tip .dfo-item-meta>li,.inv-tip .dfo-item-tier')].map(x=>x.getAttribute('aria-label')||x.textContent)}),id);
     assert.deepEqual(hidden.actual.sort(),hidden.native.sort(),'Only native unidentified information may appear in trade');
    }
    const identity=await page.evaluate(id=>({unchanged:JSON.stringify(probe.cases[id])===itemCopies[id],identified:probe.cases[id].isIdentified}),id);
    assert.equal(identity.unchanged,true,'No transfer/identification/item mutation on hover');
    if(id.startsWith('unknown'))assert.equal(identity.identified,false);
    rows.push({id,mode:config.mode,quality:config.quality,priceAdjustment:config.priceAdjustment,skills:config.skills,inventory:baselines[id],trade:actual});
    if(process.env.DFO_SCREENSHOT_DIR&&id==='effects'&&config.mode==='Sell'&&config.quality===20){
     fs.mkdirSync(process.env.DFO_SCREENSHOT_DIR,{recursive:true});
     await page.screenshot({path:path.join(process.env.DFO_SCREENSHOT_DIR,'trade-effects-'+(russian?'ru':'en')+'.png')});
    }
    await page.evaluate(()=>{tradeView.unmount();probe.hide()});
   }
  }
  assert.deepEqual(errors,[]);
  const report={gameVersion:JSON.parse(fs.readFileSync(path.join(build,'verified-manifest.json'))).version,language:russian?'ru':'en',rows,unknownPowersRemainHidden:true,errors};
  if(process.env.DFO_TRADE_REPORT)fs.writeFileSync(process.env.DFO_TRADE_REPORT,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
