'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {derive,effectGroup,effectParts,materialPalette}=require('../src/mod/page/dfo_item_cards.js');
// These checks read the Russian install's words; the English ones are checked where the locales are compared.
globalThis.__dfoUi=require('../src/mod/item-text.cjs').uiText('ru');
const {transformItemCards}=require('../src/mod/item-cards-transform.cjs');
const {transformAsset,injectIndex,EXPECTED}=require('../src/mod/transforms.cjs');
const {wrap}=require('../src/mod/hook.cjs');
const native={isAmmo:item=>item.templateIndex===131,isHandWraps:item=>item.templateIndex===527,
  saysMaterial:()=>true,variantWord:()=>'',material:()=> 'Steel',materialLabel:word=>word,
  template:index=>index===120?{basePrice:15}:null,value:()=>1440,
  sale:item=>({cost:(Number.isFinite(item.value)?item.value:1440)*2*(item.stackCount??1)}),isGold:item=>item.group==='Currency'&&item.templateIndex===276};
const line={weight:1.25,material:'Steel'},known={known:()=>true};
const sword={group:'Weapons',templateIndex:120,material:5,value:3425,affixes:[{id:'damage',value:19}],enchantments:[{type:0,param:0}]};

test('named enchantment triggers remain distinct from numerical bonuses in either locale',()=>{
  for(const text of ['When Strikes: Wildfire','Cast When Strikes: Wildfire','При ударе: Дикий огонь'])assert.equal(effectGroup(text).key,'strike');
  assert.deepEqual(effectGroup('При попадании: Ледяная буря'),{key:'strike',label:'Накладывает при попадании',text:'Ледяная буря'});
  assert.equal(effectGroup('Soul Bound: Dragonling').label,'Пассивные свойства');
  assert.equal(effectGroup('When Used: Restore Power').key,'use');
  assert.equal(effectGroup('При ношении: Невесомость').key,'held');
  assert.equal(effectGroup('+22% к урону [10–25]').key,'bonuses');
  assert.equal(effectGroup('Soul Bound: Dragonling').key,'properties');
});
test('effect colors preserve every character while distinguishing labels, values and trailing ranges',()=>{
  const lines=[['+16 Скрытность [10–20]','bonuses'],['Улучшает навык: Критический удар','properties'],['Extra spell pts During Winter','properties'],['Ледяная буря','strike'],['+10 к урону [5–10] [3–7]','bonuses']];
  for(const [text,key]of lines)assert.equal(effectParts(text,key,['Extra spell pts']).map(p=>p.text).join(''),text);
  assert.deepEqual(effectParts('Улучшает навык: Критический удар'),[{kind:'label',text:'Улучшает навык: '},{kind:'value',text:'Критический удар'}]);
  assert.equal(effectParts('+16 Скрытность [10–20]','bonuses').at(-1).kind,'range');
  assert.equal(effectParts('Extra spell pts During Winter','properties',['Extra spell pts'])[1].text,'During Winter');
  assert.equal(effectParts('Ледяная буря','strike')[0].kind,'value');
});
test('ten metals have distinct colors; Ebony and Daedric retain black with their requested outlines',()=>{
  assert.equal(Object.keys(materialPalette).length,10);
  assert.equal(new Set(Object.values(materialPalette).map(p=>p.color)).size,10);
  assert.ok(materialPalette.Ebony.stroke.includes('#f4f1e8'));assert.ok(materialPalette.Daedric.stroke.includes('#f05a55'));
  assert.equal(derive(sword,line,native,known).materialKey,'Steel');
  assert.equal(derive(sword,line,{...native,saysMaterial:()=>false},known).materialKey,null,'Do not reveal a hidden metal through its color');
});

test('all supplied card fonts are served locally with their original bytes and font MIME types',async()=>{
  const handle=wrap(async()=>new Response('native fallback'));
  for(const file of ['item-font-title.ttf','item-font-text.ttf','item-font-sigil.ttf','item-font-set.ttf','item-font-legendary.otf','item-font-description.otf']){
    const response=await handle(new Request('dagger://game/dfo-mod/'+file));
    assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),file.endsWith('.otf')?'font/otf':'font/ttf');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),fs.readFileSync(path.join(__dirname,'../src/mod/fonts',file)));
  }
  assert.equal((await handle(new Request('dagger://game/dfo-mod/other-font.ttf'))).status,404,'No arbitrary font/file route');
});

test('stored worth includes improvements once; tooltip is a read-only projection',()=>{
  const item=Object.freeze({...sword,affixes:Object.freeze(sword.affixes),enchantments:Object.freeze(sword.enchantments)});
  const data=derive(item,line,{...native,value:()=>assert.fail('Do not recalculate an already priced item')},known);
  assert.equal(data.unitValue,3425);assert.equal(data.total,3425);assert.equal(data.source,'stored');assert.equal(data.perKg,1096);assert.equal(data.price,1370);
  assert.equal(item.value,3425);assert.equal(derive({...item,stackCount:3},line,native,known).total,10275);
  assert.equal(derive({...item,stackCount:3},{weight:3.75},native,known).perKg,1096,'Stack weight is already the total, not the unit weight');
});
test('40% estimate uses the native corrected lot basis, rounds once to tens and respects native resale limits',()=>{
  const item=Object.freeze({...sword,value:1000});
  assert.equal(derive(item,line,native,known).price,400);
  assert.equal(derive(item,line,{...native,sale:()=>({cost:400})},known).price,80,'Found-at-20% basis, even after paid repair');
  assert.equal(derive(item,line,{...native,sale:()=>({cost:1000})},known).price,200,'Daedric half belongs to native sale math');
  assert.equal(derive({...item,value:1013},line,native,known).price,410);
  assert.equal(derive({...item,value:2,stackCount:20},line,native,known).price,20,'Price the whole stack, then round');
  assert.equal(derive(item,line,{...native,sale:()=>({cost:2000,resale:{cost:2000,paid:95}})},known).price,100);
  assert.equal(derive(item,line,{...native,sale:()=>({cost:2000,resale:{cost:1000,paid:95}})},known).price,300,'Only bought-back share is capped');
  for(const sale of [{cost:NaN},{cost:Infinity},{cost:-1},{cost:2000,resale:{cost:NaN,paid:95}}])assert.equal(derive(item,line,{...native,sale:()=>sale},known).price,null);
  assert.equal(derive(item,line,native,known).approximate,true);
});
test('fallback is explicitly a template estimate; missing data is never the native placeholder price 1',()=>{
  const {value,...item}=sword;
  assert.equal(derive(item,line,native,known).source,'base');assert.equal(derive(item,line,native,known).total,1440);
  assert.equal(derive({...item,templateIndex:999999},line,native,known).total,null);
  assert.equal(derive({...item,value:0},line,native,known).total,0);
  assert.equal(derive({...item,value:NaN},line,native,known).total,1440);
});
test('unknown identity keeps powers hidden but uses the same sale valuation; malformed inputs never fabricate money',()=>{
  const hidden=derive(sword,line,{...native,power:()=>assert.fail('Do not reveal an unidentified power')},{known:()=>false});
  assert.equal(hidden.unitValue,3425);assert.equal(hidden.price,1370);assert.equal(hidden.perKg,1096);assert.equal(hidden.power,null);assert.equal(hidden.known,false);
  for(const count of [0,-1,1.5,'2',NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.equal(derive({...sword,stackCount:count},line,native,known).total,null);
  for(const weight of [0,-1,NaN,Infinity])assert.equal(derive(sword,{...line,weight},native,known).perKg,null);
  assert.equal(derive({...sword,stackCount:Number.MAX_SAFE_INTEGER},line,native,known).total,null);
  assert.equal(derive({...sword,value:Number.MAX_SAFE_INTEGER+1},line,{...native,value:item=>item.value},known).unitValue,null,'Do not print imprecise unit prices');
  assert.equal(derive({group:'UselessItems2',value:10},line,native,known).perKg,null);
});
test('credit nominal is native face value, distinct from paper price and merchant offers',()=>{
  const item={group:'MiscItems',templateIndex:171,value:20000};
  const data=derive(item,{weight:0},native,{...known,credit:()=> '20,000 gold'});
  assert.equal(data.total,20000);assert.equal(data.price,20000);assert.equal(data.approximate,false);assert.equal(data.source,'credit');assert.equal(data.perKg,null);
  assert.equal(derive({...item,value:20000.75},{weight:0},native,{...known,credit:()=> '20,000 gold'}).total,20000,'Credit face value truncates exactly as the native reader');
  assert.equal(derive({...item,value:undefined},{weight:0},native,{...known,credit:()=> '0 gold'}).price,null,'An absent face value is not the template paper price');
  assert.equal(derive({...item,value:20003},{weight:0},native,{...known,credit:()=> '20,003 gold'}).price,20003,'Face value is never approximate or rounded to tens');
  const coins=derive({group:'Currency',templateIndex:276,stackCount:27,value:999},{weight:0},native,known);
  assert.equal(coins.price,27);assert.equal(coins.approximate,false,'A pile of 27 gold pieces is worth 27, not an NPC item offer');
});
test('construction, metal and absent material remain distinct and obey native visibility',()=>{
  const armor={...sword,group:'Armor',templateIndex:102,material:513};
  assert.equal(derive(armor,line,native,known).material,'Сталь');
  assert.equal(derive({...armor,material:521},line,{...native,material:()=> 'Daedric',materialLabel:()=> 'Язык даэдра'},known).material,'Даэдрический металл');
  assert.equal(derive({...armor,material:520},line,{...native,material:()=> 'Orcish',materialLabel:()=> 'Орочий язык'},known).material,'Орочий металл');
  assert.equal(derive({...armor,material:undefined},line,native,known).material,'Нет данных');
  assert.equal(derive({...armor,material:256},line,{...native,material:()=> 'Chain'},known).material,'Металл не указан');
  assert.equal(derive({...armor,templateIndex:520},line,{...native,variantWord:()=> 'Fur '},known).material,'Мех');
  const mail=derive({...armor,templateIndex:515},line,{...native,variantWord:()=> 'Mail '},known);
  assert.equal(mail.material,'Сталь');assert.equal(mail.construction,'Кольчужная');
  assert.equal(derive(armor,{...line,material:null},{...native,saysMaterial:()=>false},known).material,'Не указан');
  assert.equal(derive({...sword,templateIndex:527},line,native,known).material,'Ткань');
  assert.equal(derive({...sword,templateIndex:131},line,native,known).material,null);
});

test('feature configuration and script route work independently of every other feature',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dfo-item-card-hook-'));
  try {
    const file=path.join(dir,'dfo-mod.json');
    const html='<html><head></head><body></body></html>';
    const read=async(on)=>{
      fs.writeFileSync(file,JSON.stringify({ru:false,marks:false,nearbyLoot:false,dungeons:false,itemCards:on}));
      const handle=wrap(async()=>new Response(html,{headers:{'Content-Type':'text/html'}}),{app:{getPath:()=>dir}});
      const page=await(await handle(new Request('dagger://game/play/index.html'))).text();
      const script=await handle(new Request('dagger://game/dfo-mod/dfo_item_cards.js'));
      assert.equal(script.status,200);assert.match(await script.text(),/__dfoItemCards/);return page;
    };
    const on=await read(true);assert.match(on,/dfo_item_cards\.js/);assert.match(on,/"itemCards":\{"enabled":true\}/);
    const off=await read(false);assert.doesNotMatch(off,/src="[^"]*dfo_item_cards\.js/);assert.match(off,/"itemCards":\{"enabled":false\}/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('all card hooks match current published game assets, parse and apply once; bad signatures fall back atomically',
 {skip:!process.env.DFO_BUILD_DIR},()=>{
  const acorn=require(process.env.DFO_ACORN_MODULE||'acorn');
  const assets=path.join(process.env.DFO_BUILD_DIR,'assets'),seen=[];
  for(const file of fs.readdirSync(assets).filter(f=>f.endsWith('.js'))){
    const src=fs.readFileSync(path.join(assets,file),'utf8'),log=[];
    const out=transformItemCards('assets/'+file,src,log);
    if(out===src)continue;
    assert.equal(transformItemCards('assets/itemWorker-test.js',src,[]),src,'Worker entries must not receive a DOM card bridge');
    seen.push(...log.filter(x=>x[1]>0).map(x=>x[0]));acorn.parse(out,{ecmaVersion:'latest',sourceType:'module'});
    assert.equal(transformItemCards('assets/'+file,out,[]),out,'Idempotent hook');
    assert.equal(transformAsset('assets/'+file,src,{ru:false,marks:false,nearbyLoot:false,dungeons:false,itemCards:false}).text,src);
    if(log.some(x=>x[0]==='itemCards.inventory')){
      const broken=src.replace('-16){','-17){'),badlog=[];
      assert.notEqual(broken,src);assert.equal(transformItemCards('assets/'+file,broken,badlog),broken,'Never partially wrap a card whose fit cannot be replaced');
      assert.ok(badlog.some(x=>x[0].includes('!error')));
    }
  }
  assert.deepEqual(seen.sort(),[...EXPECTED.itemCards].sort());
});

test('the description is told only what the card shows: identification, a shown metal, the native armour type',()=>{
  // dfo_item_text.js facts, derived beside the card's own rows: never a hidden metal, never a decoded type.
  assert.deepEqual(derive(sword,line,native,known).facts,{known:true,material:'steel'});
  assert.deepEqual(derive(sword,line,native,{known:()=>false}).facts,{known:false,material:'steel'});
  assert.deepEqual(derive(sword,line,{...native,saysMaterial:()=>false},known).facts,{known:true},'a hidden metal is not told');
  const cuirass={group:'Armor',templateIndex:102,material:513,value:600};
  assert.deepEqual(derive(cuirass,{...line,armorType:'Plate'},native,known).facts,{known:true,material:'steel',armorType:'plate'});
  assert.deepEqual(derive({...cuirass,material:256},{...line,armorType:'Chain'},{...native,material:()=>'Chain'},known).facts,{known:true,material:'chain',armorType:'chain'});
  assert.deepEqual(derive({...cuirass,templateIndex:515},{...line,armorType:'Chain'},{...native,variantWord:()=>'Mail'},known).facts,{known:true,construction:'mail',material:'steel',armorType:'chain'});
  assert.deepEqual(derive({...cuirass,templateIndex:520,material:0},{...line,armorType:'Leather'},{...native,variantWord:()=>'Fur'},known).facts,{known:true,material:'fur',armorType:'leather'});
  assert.deepEqual(derive({...cuirass,material:undefined},{...line,armorType:'Plate'},native,known).facts,{known:true,armorType:'plate'},'a missing material is never decoded');
  assert.deepEqual(derive({group:'Weapons',templateIndex:527,material:0},line,native,known).facts,{known:true,material:'cloth'});
  assert.deepEqual(derive({group:'WomensClothing',templateIndex:205,dye:0},line,native,known).facts,{known:true});
  assert.equal(derive({...cuirass,material:513},{...line,armorType:'Robe'},native,known).facts.armorType,undefined,'only the three native types');
});

test('the slot and the weapon skill are the game\'s answers, told in the pack\'s words',()=>{
  // Native readers as item-cards-transform.cjs registers them: enum member names (equip table, hand law, weaponSkillUsed).
  const slots={120:'RightHand',130:'RightHand',111:'LeftHand',135:'Ring0',106:'RightArm',102:'ChestArmor',205:'ChestClothes',131:'None',140:'None'};
  const hands={120:'Either',130:'Both',111:'LeftOnly'};
  const skills={120:'LongBlade',130:'Archery'};
  const worn={...native,slotName:item=>slots[item.templateIndex]??'None',handsName:item=>hands[item.templateIndex]??'None',weaponSkill:t=>skills[t]??'HandToHand'};
  const at=(group,templateIndex,extra={})=>derive({group,templateIndex,material:1,value:10,...extra},line,worn,known);
  assert.deepEqual([at('Weapons',120).slot,at('Weapons',120).skill],['Любая рука','Длинные Клинки']);
  assert.deepEqual([at('Weapons',130).slot,at('Weapons',130).skill],['Обе руки','Стрельба из лука']);
  assert.deepEqual([at('Armor',111,{material:513}).slot,at('Armor',111,{material:513}).skill],['Левая рука',null],'a shield is held, but trains no weapon skill');
  assert.equal(at('Jewellery',135).slot,'Кольцо','a paired slot is one word');
  assert.equal(at('Armor',106,{material:513}).slot,'Правое плечо');
  assert.equal(at('WomensClothing',205).slot,'Грудь, одежда');
  assert.deepEqual([at('Weapons',131).slot,at('Weapons',131).skill],[null,null],'ammunition is worn nowhere');
  assert.equal(at('Jewellery',140).slot,null,'a slot the inventory would not offer Wear for gets no row');
  assert.equal(derive({group:'Weapons',templateIndex:999,material:1},line,{...worn,slotName:()=>'RightHand',handsName:()=>'Either'},known).skill,'Рукопашный бой','an unmapped weapon swings Hand-to-Hand');
  assert.deepEqual([derive(sword,line,native,known).slot,derive(sword,line,native,known).skill],[null,null],'without the readers the card keeps its rows');
  assert.deepEqual(at('Weapons',120,{isIdentified:false}).slot,'Любая рука','the template is visible before identification');
  const en=globalThis.__dfoUi;globalThis.__dfoUi=require('../src/mod/item-text.cjs').uiText('en');
  try{assert.deepEqual([at('Weapons',120).slot,at('Weapons',120).skill],['Either hand','Long Blade']);}finally{globalThis.__dfoUi=en;}
});
