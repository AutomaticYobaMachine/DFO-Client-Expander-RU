#!/usr/bin/env node
'use strict';
// Defined state axes and original/native parity, using the actual published builder and optional real ARENA2 art.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.DFO_PLAYWRIGHT_MODULE||'playwright');
const {server}=require('./test-item-cards-browser.cjs');
async function main(){
 let browser;
 await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r)});
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.DFO_CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];
  page.on('pageerror',e=>errors.push(e.stack));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/?ru`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.ready);
  await page.evaluate(async()=>{probe.show('steel');await Promise.all(['DFO Flexi','DFO Gabin','DFO Ckazka','DFO Ritalin','DFO Wolga'].map(f=>document.fonts.load('16px "'+f+'"')))});
  if(process.env.DFO_ARENA2_DIR){
   await page.evaluate(()=>{probe.show('steel');probe.show('rare')});
   await page.waitForFunction(()=>document.querySelector('.inv-tip .bigicon img')?.naturalWidth>0,null,{timeout:30000});
   assert.match(await page.locator('.inv-tip h3').innerText(),/Mithril|мифрил/i,'Late pictures cannot replace the current item with a previous one');
  }
  await page.evaluate(async()=>{
   const [rows,data]=await Promise.all([fetch('/audit-catalog.json').then(r=>r.json()),fetch('/audit-item-states.json').then(r=>r.json())]);
   __cardAuditRegister(rows.filter(r=>!auditNative.readers.template(r.index)));
   const scenarios=[],mk=(templateIndex,group,extra={})=>({templateIndex,group,material:group==='Armor'?513:1,stackCount:1,currentCondition:100,maxCondition:100,value:1000,isIdentified:true,...extra});
   const push=(axis,label,item,more={})=>scenarios.push({axis,label,item,...more});
   for(const row of rows)for(const group of row.groups?.length?row.groups:[row.group||'UselessItems2']){
    const item=mk(row.index,group,{name:row.name});
    for(const [label,extra]of Object.entries({new:{},worn:{currentCondition:50},broken:{currentCondition:0},locked:{locked:true},stolen:{stolen:true},bound:{bound:true},quest:{questItem:true,questUID:7},stack:{stackCount:20},empty:{stackCount:0}}))push('template states',row.index+' '+group+' '+label,{...item,...extra});
   }
   const gear=[mk(120,'Weapons'),mk(102,'Armor'),mk(0,'MensClothing'),mk(141,'Jewellery')];
   for(const item of gear){
    for(const rarity of Object.keys(data.enums.rarities))for(const isIdentified of [false,true])push('rarity/identity',item.group+' '+rarity+' '+isIdentified,{...item,rarity,isIdentified,affixes:[{id:'stat',param:'strength',value:10}],enchantments:[{type:0,param:4}]});
    for(const currentCondition of [0,1,24,25,49,50,74,75,99,100])push('condition thresholds',item.group+' '+currentCondition,{...item,currentCondition});
    for(const quality of [0,1,2,3,4])push('crafting',item.group+' '+quality,{...item,quality,maker:'Test',provenance:'0123456789abcdef'});
    for(const rarity of ['rare','legendary'])for(const extra of [{exalted:true},{cursed:{type:16,param:0},enchantments:[{type:16,param:0}]},{cursed:{type:21,param:0},enchantments:[{type:21,param:0}]},{}])push('extended tier labels',item.group+' '+rarity+' '+JSON.stringify(extra),{...item,rarity,affixes:[{id:'stat',param:'strength',value:rarity==='rare'?10:15}],...extra});
    push('heirloom',item.group,{...item,heirloom:{line:'line',house:'Hlaalu',from:'Ancestor',of:'House',gen:3,base:'Heirloom'}});
    push('long metadata',item.group,{...item,quality:4,maker:'A'.repeat(100),provenance:'0123456789abcdef',heirloom:{line:'line',house:'B'.repeat(100),from:'C'.repeat(100),gen:3,base:'Heirloom'}});
    for(const slot of [item.group==='Weapons'?19:item.group==='Armor'?18:4])push('equipped',item.group,{...item,equipSlot:slot},{worn:true});
    push('realm restrictions',item.group,{...item,uid:'state-realm-copy'},{realm:true});
   }
   for(const material of [0,256,259,512,513,514,515,516,517,518,519,520,521])for(const template of [102,107,110,515,520])push('armor materials',template+' '+material,mk(template,'Armor',{material}));
   for(let material=0;material<10;material++)for(const template of [113,120,127,130,563])push('weapon materials',template+' '+material,mk(template,'Weapons',{material}));
   for(const value of [0,1,1000,undefined,NaN,Infinity,-1,Number.MAX_SAFE_INTEGER+1])for(const stackCount of [1,20])push('money edge cases',String(value)+' '+stackCount,mk(561,'Weapons',{value,stackCount}));
   for(const e of data.records.enchants)for(const param of e.params?.length?e.params:[{value:0}])for(const isIdentified of [false,true])push('enchantment catalog',e.name+' '+param.value+' '+isIdentified,mk(120,'Weapons',{rarity:'rare',isIdentified,enchantments:[{type:e.type,param:param.value}]}));
   for(const [id,rule]of Object.entries(data.enums.affixes)){
    const params=Array.isArray(rule.params)&&rule.params.length?rule.params:[null];
    for(const rarity of ['magic','rare','legendary'])for(const param of params)for(const value of rule.ranges?.[rarity]||[10]){
     if(id==='technique')continue;
     const group=rule.groups?.[0]||'Weapons';push('affix catalog',id+' '+param+' '+rarity+' '+value,mk(group==='Armor'?102:120,group,{rarity,affixes:[{id,param,value}]}));
    }
   }
   for(const socket of data.enums.sockets)for(const group of ['Weapons','Armor','Jewellery'])push('sockets',group+' '+socket,mk(group==='Armor'?102:group==='Jewellery'?141:120,group,{rarity:'rare',sockets:[socket]}));
   for(const [id,t]of Object.entries(data.records.techniques))for(const duel of [false,true])push('techniques',id+' '+duel,mk(t.families.includes('archery')?130:120,'Weapons',{rarity:'rare',affixes:[{id:'technique',param:id,value:20}]}),{duel});
   for(const r of data.records.legendaries)push('legendary records',r.id,mk(r.templates?.[0]||120,r.group,{rarity:'legendary',legendary:r.id,name:r.name,affixes:r.affixes,enchantments:r.enchantment?[r.enchantment]:[]}));
   for(const r of data.records.aetheric)push('aetheric records',r.id,mk(r.templateIndex,r.group,{rarity:'aetheric',aetheric:r.id,name:r.name,affixes:r.affixes,material:r.make==='Leather'?0:r.make==='Mithril'?(r.group==='Armor'?517:5):(r.group==='Armor'?521:9),sigil:{set:r.set,party:1,xp:37500}}));
   for(const r of data.records.gilded)push('gilded records',r.id,mk(r.templateIndex,r.group,{rarity:'gilded',gilded:r.id,name:r.name,affixes:r.affixes,material:r.material}));
   for(const set of data.enums.sigilSets)for(const xp of [0,4999,5000,12499,12500,22499,22500,37499,37500])for(const renown of [null,1,10,20,30,40])push('sigil/set stages',set+' '+xp+' '+renown,mk(102,'Armor',{rarity:'rare',sigil:{set,party:1,xp}}),{renown});
   for(const set of data.enums.sigilSets)for(const wornCount of [2,4,6,9])for(const renown of [1,20,40])push('active set tiers',set+' '+wornCount+' '+renown,mk(102,'Armor',{rarity:'rare',sigil:{set,party:1,xp:37500}}),{renown,wornCount,set});
   for(const item of gear)for(const isIdentified of [false,true])push('rarity disabled',item.group+' '+isIdentified,{...item,rarity:'rare',isIdentified,enchantments:[{type:0,param:4}],affixes:[{id:'stat',param:'strength',value:10}]},{rarityOff:true});
   for(const row of rows.filter(r=>/Torch|Lantern|Candle/.test(r.name)))for(const lit of [false,true])push('lighting',row.name+' '+lit,mk(row.index,row.groups?.[0]||'UselessItems2'),{lit});
   window.stateAudit={scenarios,totals:{},metals:{},failures:[],checked:0,images:0};
   window.checkState=(s,body)=>{
    const api=window.__dfoItemCards,item=structuredClone(s.item),before=JSON.stringify(item),savedItems=probe.entity.items,savedSlots=[...probe.entity.equip.slots];
    const host=document.createElement('div');host.className=body?'packtip packdetail open':'inv-tip';
    (body?document.querySelector('.pack-shell .pack-win'):document.body).append(host);
    if(s.worn){probe.entity.items=[item];probe.entity.equip.slots.fill(null);probe.entity.equip.slots[item.equipSlot]=item}
    if(s.wornCount){
     const templates=[107,106,105,102,103,104,108,110,120],slots=[12,13,15,18,20,23,26,21,19];
     probe.entity.equip.slots.fill(null);probe.entity.items=templates.slice(0,s.wornCount).map((templateIndex,i)=>({templateIndex,group:i===8?'Weapons':'Armor',material:i===8?9:521,rarity:'rare',value:1000,equipSlot:slots[i],sigil:{set:s.set,xp:37500,party:1}}));
     for(const worn of probe.entity.items)probe.entity.equip.slots[worn.equipSlot]=worn;
    }
    probe.entity.lightSource=s.lit?item:null;
    __cardTestActivate(Object.hasOwn(s,'renown')?s.renown:20);
    __cardAuditDuel(!!s.duel);__cardAuditRealm(s.realm?['state-realm-copy']:[]);
    if(s.rarityOff)__cardAuditPref('lootRarity',false);
    const capture=n=>{
     const into=n.querySelector(':scope>.card-body')||n;
     return {powers:[...into.querySelectorAll(':scope>ul.rarity>li')].map(x=>x.textContent),stats:[...into.querySelectorAll(':scope>dl.stats>.pair')].map(x=>[x.querySelector('dt').textContent,x.querySelector('dd').textContent]),statuses:[...into.querySelectorAll(':scope>.lockline,:scope>.boundline')].map(x=>[x.className,x.textContent]),blocks:[...into.querySelectorAll(':scope>.sigilbox,:scope>.setbox,:scope>.techbox,:scope>.cmp')].map(x=>x.outerHTML),name:into.querySelector('h3')?.textContent};
    };
    try{
     window.__dfoItemCards=undefined;
     const native=__cardAuditBuild(item,'local',{body});host.replaceChildren(native);const expected=capture(native);
     window.__dfoItemCards=api;
     const actual=__cardAuditBuild(item,'local',{body});host.replaceChildren(actual);body?api.fitCard(actual,900):api.fitTip(host);
     if(!actual.classList.contains('dfo-item-card'))throw new Error('Card fell back to vanilla');
     const blocks=['.dfo-item-effects','.dfo-item-overflow'].flatMap(selector=>[...actual.querySelector(selector).children].filter(n=>n.matches('.sigilbox,.setbox,.techbox,.cmp')).map(x=>x.outerHTML));
     if(JSON.stringify(blocks)!==JSON.stringify(expected.blocks))throw new Error('Native integration DOM changed');
     const powers=[...actual.querySelectorAll('.dfo-item-lines>li,.dfo-item-meta>li,.dfo-item-tier')].map(x=>x.getAttribute('aria-label')||x.textContent).sort();
     if(JSON.stringify(powers)!==JSON.stringify(expected.powers.sort()))throw new Error('A native power line was lost or duplicated');
     if(actual.dataset.rarity&&!actual.querySelector('.dfo-item-title>.dfo-item-tier'))throw new Error('Extended rarity label is missing from the left heading');
     const material=actual.querySelector('.dfo-item-material'),metal=material?.querySelector('.dfo-item-metal');
     if(material){
      if(!material.closest('.dfo-item-head')||actual.querySelector('.dfo-item-stats .dfo-item-metal'))throw new Error('Material must be in the name header');
      const nameBox=actual.querySelector('h3').getBoundingClientRect(),materialBox=material.getBoundingClientRect(),primaryBox=actual.querySelector('.dfo-item-primary')?.getBoundingClientRect();
      if(materialBox.top<nameBox.bottom-.5||(primaryBox&&materialBox.bottom>primaryBox.top+.5))throw new Error('Material must be between the name and main stat');
      const palette={Iron:'rgb(116, 121, 128)',Steel:'rgb(198, 203, 209)',Silver:'rgb(255, 255, 255)',Elven:'rgb(149, 207, 255)',Dwarven:'rgb(223, 184, 79)',Mithril:'rgb(64, 191, 255)',Adamantium:'rgb(203, 179, 232)',Orcish:'rgb(97, 200, 126)',Ebony:'rgb(16, 17, 22)',Daedric:'rgb(19, 14, 16)'};
      if(palette[metal.dataset.metal]&&getComputedStyle(metal).color!==palette[metal.dataset.metal])throw new Error('Wrong metal color: '+metal.dataset.metal);
      if(['Ebony','Daedric'].includes(metal.dataset.metal)&&!(parseFloat(getComputedStyle(metal).webkitTextStrokeWidth)>0))throw new Error('Dark metal name needs its outline');
      if(palette[metal.dataset.metal])stateAudit.metals[metal.dataset.metal]={label:metal.textContent,color:getComputedStyle(metal).color,stroke:getComputedStyle(metal).webkitTextStrokeColor};
     }
     for(const [selector,color]of [['.dfo-effect-label','rgb(237, 213, 164)'],['.dfo-effect-value','rgb(243, 242, 237)'],['.dfo-effect-range','rgb(105, 107, 114)']])for(const span of actual.querySelectorAll(selector))if(getComputedStyle(span).color!==color)throw new Error('Effect text color overwritten by native selection style: '+selector);
     if(auditNative.readers.saysMaterial(item)){
      const word=auditNative.readers.material(item),expectedMaterial={Daedric:'Даэдрический металл',Orcish:'Орочий металл'}[word];
      if(expectedMaterial){if(actual.querySelector('.dfo-item-material .dfo-item-metal')?.textContent!==expectedMaterial)throw new Error('Material was translated as a language skill')}
     }
     const statuses=[...actual.querySelectorAll('.dfo-item-statuses>p')].map(x=>[x.className,x.textContent]);
     if(JSON.stringify(statuses)!==JSON.stringify(expected.statuses))throw new Error('A native status was lost');
     if(actual.querySelector('h3')?.textContent!==expected.name)throw new Error('Name changed');
     for(const [label,value]of expected.stats){
      if(label===document.createElement('span').appendChild(document.createTextNode('Worth')).textContent)continue;
      if(!actual.textContent.includes(value))throw new Error('Missing stat '+label+': '+value);
     }
     const main=actual.querySelector('.dfo-item-main'),left=actual.querySelector('.dfo-item-left'),right=actual.querySelector('.dfo-item-effects'),footer=actual.querySelector('.dfo-item-footer');
     if(getComputedStyle(main).gridTemplateColumns.split(' ').length!==2)throw new Error('Not two columns');
     if(left.getBoundingClientRect().right>right.getBoundingClientRect().left)throw new Error('Columns overlap');
     if(footer.getBoundingClientRect().top<main.getBoundingClientRect().bottom-.5)throw new Error('Price overlaps columns');
     if(actual.querySelector('h3').closest('.dfo-item-left')!==left)throw new Error('Name is not in left column');
     if(getComputedStyle(actual.querySelector('.dfo-item-price-value')).fontSize!=='21px')throw new Error('Unexpected price typography');
     for(const [selector,size]of [['.dfo-item-lines','14px'],['.dfo-item-stats dt','13px'],['.dfo-item-statuses p','11px'],['.dfo-item-meta','11px']]){
      const n=actual.querySelector(selector);if(n&&getComputedStyle(n).fontSize!==size)throw new Error('Hover/selection typography mismatch: '+selector);
     }
     for(const n of actual.querySelectorAll('.dfo-item-stats dt'))if(getComputedStyle(n).textAlign!=='left')throw new Error('Stat label aligned like a native value');
     for(const n of actual.querySelectorAll('.dfo-item-lines>li'))if(getComputedStyle(n).color!==getComputedStyle(n.parentElement).color)throw new Error('First affix incorrectly wears the native tier-heading color');
     const leftBox=left.getBoundingClientRect(),walk=document.createTreeWalker(left,NodeFilter.SHOW_TEXT);let text;
     while((text=walk.nextNode())){if(!text.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(text);for(const r of range.getClientRects())if(r.width&&r.height&&(r.left<leftBox.left-.5||r.right>leftBox.right+.5))throw new Error('Left-column text overlaps effects: '+text.textContent.slice(0,60))}
     const rect=host.getBoundingClientRect();if(rect.left<0||rect.top<0||rect.right>innerWidth+.2||rect.bottom>innerHeight+.2)throw new Error('Outside viewport');
     if([...actual.querySelectorAll('.dfo-item-lines>li')].some(n=>!n.getClientRects().length))throw new Error('Hidden native power');
     if(JSON.stringify(item)!==before)throw new Error('Item was mutated');
     stateAudit.images+=actual.querySelector('.bigicon img')?.naturalWidth>0?1:0;
     stateAudit.checked++;stateAudit.totals[s.axis]=(stateAudit.totals[s.axis]||0)+1;
    }catch(e){if(stateAudit.failures.length<15)stateAudit.failures.push({axis:s.axis,label:s.label,body,error:String(e)})}
    finally{window.__dfoItemCards=api;host.remove();probe.entity.items=savedItems;probe.entity.equip.slots.splice(0,27,...savedSlots);probe.entity.lightSource=null;if(s.rarityOff)__cardAuditPref('lootRarity',true)}
   };
  });
  if(process.env.DFO_STATE_FILTER)await page.evaluate(filter=>{stateAudit.scenarios=stateAudit.scenarios.filter(s=>filter.includes(s.axis))},process.env.DFO_STATE_FILTER.split(','));
  const count=await page.evaluate(()=>stateAudit.scenarios.length);
  for(let at=0;at<count;at+=75){
   await page.evaluate(({at,end})=>{for(let i=at;i<end;i++){checkState(stateAudit.scenarios[i],false);checkState(stateAudit.scenarios[i],true)}},{at,end:Math.min(count,at+75)});
   const failed=await page.evaluate(()=>stateAudit.failures);assert.deepEqual(failed,[],'Actual state renderer differs from original/layout contract');
   if(at%750===0)console.log('checked state scenarios',Math.min(count,at+75),'/',count);
  }
  // Repeated native fits pass a numeric room; it must not be mistaken for an invalidation flag.
  const repeated=await page.evaluate(()=>{
   probe.show('steel');const c=document.querySelector('.inv-tip .dfo-item-card'),start=__dfoItemCards.stats().layouts;
   const observer=new MutationObserver(()=>{});observer.observe(c.parentElement,{attributes:true,subtree:true});
   for(let i=0;i<30;i++)__dfoItemCards.fitCard(c,900);
   const mutations=observer.takeRecords().length;observer.disconnect();return {layouts:__dfoItemCards.stats().layouts-start,mutations};
  });
  assert.deepEqual(repeated,{layouts:0,mutations:0},'Unchanged native fitCard calls must not force remeasure or DOM writes');
  assert.equal(await page.evaluate(()=>__dfoItemCards.fitCard(null,900)),false,'Preserve native null-card handling');
  assert.equal(await page.evaluate(()=>__dfoItemCards.fitCard(document.createElement('div'),900)),false,'Do not take over foreign windows');
  assert.equal(await page.evaluate(()=>{
   const c=document.querySelector('.inv-tip .dfo-item-card'),p=document.createElement('p');p.textContent='Deferred property '.repeat(150);c.querySelector('.dfo-item-effects').append(p);
   const before=__dfoItemCards.stats().layouts;__dfoItemCards.fitCard(c,900);return __dfoItemCards.stats().layouts-before;
  }),1,'A changed card still remeasures synchronously when native code explicitly fits it');
  await page.evaluate(()=>{probe.hide();__cardAuditPref('plusItemHover',false);probe.show('steel')});
  assert.equal(await page.locator('.inv-tip').count(),0,'Respect the native disabled-hover setting');
  await page.evaluate(()=>__cardAuditPref('plusItemHover',true));
  const cdp=await page.context().newCDPSession(page);
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await cdp.send('HeapProfiler.collectGarbage');const heapBefore=(await cdp.send('Runtime.getHeapUsage')).usedSize;
  for(let i=0;i<10;i++)await page.evaluate(()=>{for(let j=0;j<100;j++){probe.show(j%2?'rare':'steel');probe.hide()}});
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await cdp.send('HeapProfiler.collectGarbage');const heapAfter=(await cdp.send('Runtime.getHeapUsage')).usedSize;
  assert.equal(await page.evaluate(()=>__dfoItemCards.stats().active),0,'No retained open-card observers after 1000 hover/close cycles');
  assert.ok(heapAfter-heapBefore<Math.max(2*1024*1024,heapBefore*.2),'Tooltip cycles retained excessive heap');
  await page.evaluate(()=>{__cardTestActivate(20);__cardAuditDuel(false);probe.show('ruhn')});
  assert.deepEqual(errors,[]);
  const report=await page.evaluate(()=>({checked:stateAudit.checked,axes:stateAudit.totals,metals:stateAudit.metals,images:stateAudit.images,failures:stateAudit.failures,stats:__dfoItemCards.stats()}));
  if(report.axes['weapon materials'])assert.equal(Object.keys(report.metals).length,10,'All ten native metals must exercise their colors');
  report.lifecycle={cycles:1000,heapGrowthBytes:heapAfter-heapBefore,repeatedNativeFits:repeated};
  assert.equal(report.stats.failures,0);
  if(process.env.DFO_ARENA2_DIR)assert.ok(report.images>0,'Actual palette/texture icons were exercised');
  if(process.env.DFO_STATE_REPORT)fs.writeFileSync(path.resolve(process.env.DFO_STATE_REPORT),JSON.stringify(report,null,2));
  if(process.env.DFO_SCREENSHOT_DIR){fs.mkdirSync(process.env.DFO_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.DFO_SCREENSHOT_DIR,'final-item-card.png')})}
  console.log(JSON.stringify(report,null,2));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
