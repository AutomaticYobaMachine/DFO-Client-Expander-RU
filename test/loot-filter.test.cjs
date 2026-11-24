'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const {flatCollider}=require('./helpers/loot-geometry.cjs');
const R=require('../src/mod/page/dfo_loot_rules.js');
const {createSession,controller}=require('../src/mod/page/dfo_loot.js');
const {createClient}=require('../src/mod/page/dfo_loot_ui.js');
const {createLootStore}=require('../src/mod/loot-store.cjs');
const {wrap}=require('../src/mod/hook.cjs');
const mk=(name,group='Weapons',index=113,extra={})=>({name,group,templateIndex:index,stackCount:1,...extra});
const tools={
  tagInfo:it=>({page:it.group==='Armor'?'armor':'weapons',rarity:it.rarity||'common',kind:it.group,material:it.materialName||'',enchanted:!!it.magic,identified:it.isIdentified!==false,bound:!!it.bound,materialItem:!!it.materialItem}),
  planTake:(it,{entity})=>({ok:entity.items.length<entity.capacity,amount:Math.min(it.stackCount,entity.free??Infinity)}),
  applyTransfer(it,plan,from,to){
    if(plan.amount<it.stackCount){it.stackCount-=plan.amount;to.push({...it,stackCount:plan.amount});}
    else{from.splice(from.indexOf(it),1);to.push(it);}
  },
};
const host=(lists, entity={items:[],capacity:100},open=()=>({done:false}))=>({kind:'exterior',entity,collider:()=>flatCollider,feet:()=>[0,0,0],blocked:()=>false,open,
  sources:()=>lists.map((items,i)=>({key:'loot:'+i,pos:[i,0,0],items:()=>items,visit:fn=>fn(items)}))});

test('white/black lists use ANY selected tag, across axes, and have explicit empty-list semantics',()=>{
  const sword=mk('Sword'), rareArmor=mk('Armor','Armor',102,{rarity:'rare'}), plainArmor=mk('Armor','Armor',102);
  const filter={mode:'white',tags:['group:Weapons','rarity:rare']};
  assert.equal(R.visible(sword,filter,tools),true);assert.equal(R.visible(rareArmor,filter,tools),true);assert.equal(R.visible(plainArmor,filter,tools),false);
  filter.mode='black';assert.equal(R.visible(sword,filter,tools),false);assert.equal(R.visible(rareArmor,filter,tools),false);assert.equal(R.visible(plainArmor,filter,tools),true);
  assert.equal(R.visible(sword,{mode:'white',tags:[]},tools),false);assert.equal(R.visible(sword,{mode:'black',tags:[]},tools),true);
  assert.deepEqual([sword.name,rareArmor.name],['Sword','Armor']);
});

test('filtering and sorting are display-only; raw sources are neither moved nor duplicated',()=>{
  const a=mk('A'),b=mk('B','Armor',102),first=[a],second=[b];
  let settings=R.cleanSettings({filter:{mode:'white',tags:['group:Weapons']}});
  const loot=createSession(host([first,second]),{tools:()=>tools,settings:()=>settings});
  assert.deepEqual(loot.items(),[a]);assert.deepEqual(loot.rawItems(),[a,b]);
  settings=R.cleanSettings({filter:{mode:'black',tags:['group:Weapons']}});
  assert.deepEqual(loot.items(),[b]);loot.items().reverse();
  assert.deepEqual(first,[a]);assert.deepEqual(second,[b]);loot.closed();assert.deepEqual(first,[a]);
});

test('auto-loot ignores display filters and consumes only live source lists, once per press',()=>{
  const a=mk('Arrow','Weapons',131,{stackCount:9}),b=mk('Sword'),source=[a,b];
  const settings=R.cleanSettings({filter:{mode:'black',tags:['type:Weapons:131']},autoLoot:{enabled:true,items:['type:Weapons:131']}});
  const h=host([source]); const loot=createSession(h,{tools:()=>tools,settings:()=>settings});
  assert.deepEqual(loot.items(),[b]);assert.deepEqual(loot.autoLoot(settings.autoLoot),{taken:1,failed:0});
  assert.deepEqual(source,[b]);assert.equal(h.entity.items[0],a);assert.deepEqual(loot.autoLoot(settings.autoLoot),{taken:0,failed:0});
  assert.deepEqual(loot.items(),[b]);
});

test('auto-loot off or empty never takes anything; native capacity, partial stacks, source loss and radius still apply',()=>{
  const a=mk('Arrow','Weapons',131,{stackCount:9}),b=mk('Sword'),h=host([[a,b]],{items:[],capacity:1,free:4});
  const loot=createSession(h,{tools:()=>tools});
  assert.deepEqual(loot.autoLoot({enabled:false,tags:['group:Weapons']}),{taken:0,failed:0});
  assert.deepEqual(loot.autoLoot({enabled:true,tags:[]}),{taken:0,failed:0});
  assert.deepEqual(loot.autoLoot({enabled:true,tags:['group:Weapons']}),{taken:1,failed:1});
  assert.equal(a.stackCount,5);assert.equal(h.entity.items[0].stackCount,4);assert.equal(h.entity.items.length,1);
});

test('a specific-item rule ignores UID/count/condition but distinguishes potions, named weapons, material and affix kinds',()=>{
  const a=mk('Potion','UselessItems1',91,{potionRecipeKey:1,uid:'a',currentCondition:50});
  assert.equal(R.variantKey(a),R.variantKey({...a,uid:'b',stackCount:9,currentCondition:5}));
  assert.notEqual(R.variantKey(a),R.variantKey({...a,potionRecipeKey:2}));
  const sword=mk('Sword','Weapons',120,{material:0,affixes:[{id:'elemental',param:'fire',value:3}]});
  assert.notEqual(R.variantKey(sword),R.variantKey({...sword,material:7}));
  assert.notEqual(R.variantKey(sword),R.variantKey({...sword,affixes:[{id:'elemental',param:'frost',value:3}]}));
  assert.equal(R.variantKey(sword),R.variantKey({...sword,affixes:[{id:'elemental',param:'fire',value:9}]}));
  assert.equal(R.automatic(a,{enabled:true,items:[R.variantKey(a)]},tools),true);
  assert.equal(R.automatic({...a,potionRecipeKey:2},{enabled:true,items:[R.variantKey(a)]},tools),false);
});

test('J waits for settings, blocks repeats/reentry, auto-loots before mounting, and opens no window if all was taken',async()=>{
  const a=mk('Arrow','Weapons',131),source=[a];let mounts=0,unblock;
  const ready=new Promise(r=>unblock=r), settings=R.cleanState({autoLoot:{enabled:true,items:['type:Weapons:131']}});
  globalThis.__dfoLootTools=tools;
  const h=host([source],undefined,()=>{mounts++;return{done:false}});
  const c=controller({client:{load:()=>ready,flush:async()=>{},get:()=>settings},prepare:async()=>{}});c.register('world',h);
  const first=c.activate();assert.equal(await c.activate(),false);assert.equal(mounts,0);assert.equal(source.length,1);
  unblock();assert.equal(await first,true);assert.equal(source.length,0);assert.equal(mounts,0);assert.equal(h.entity.items.length,1);
  assert.equal(await c.activate(),true);assert.equal(mounts,1,'next press with no loot can still open settings');
  delete globalThis.__dfoLootTools;
});

test('cache storage preserves city data; map replacement preserves all loot settings/presets; presets are real portable files',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dfo-loot-cache-'));
  try{
    const s=createLootStore(dir);s.replaceCityCache({v:1,towns:{abc:{name:'Town'}},asked:{who:3}});
    const first=s.saveSettings({...R.cleanSettings({filter:{mode:'white',tags:['rarity:rare']}}),revision:0});
    assert.equal(first.revision,1);
    const result=s.savePreset({name:'Мой фильтр',filter:first.filter,revision:first.revision});
    const file=JSON.parse(fs.readFileSync(path.join(dir,result.file),'utf8'));
    assert.equal(file.format,'dfo-loot-filter');assert.equal(file.name,'Мой фильтр');assert.deepEqual(file.filter,first.filter);
    assert.equal(s.read().towns.abc.name,'Town');
    s.replaceCityCache({towns:{def:{name:'New'}},loot:{filter:{mode:'black'}}});
    assert.deepEqual(s.state().presets,result.state.presets);assert.deepEqual(s.state().filter,first.filter);
    assert.equal(s.read().towns.def.name,'New');assert.equal(s.read().asked,undefined);
    assert.throws(()=>s.saveSettings({...R.cleanSettings(),revision:0}),{status:409});
    assert.throws(()=>s.savePreset({name:'мой фильтр',revision:s.state().revision}),{status:409});
    assert.equal(fs.readdirSync(path.join(dir,'dfo-mod-loot-presets')).length,1);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('malformed cache cannot be overwritten and failed preset saves cannot be reported as successful',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dfo-loot-failure-'));
  try{
    const file=path.join(dir,'dfo-mod-cache.json');fs.writeFileSync(file,'{broken');
    const s=createLootStore(dir);assert.throws(()=>s.savePreset({name:'X'}));assert.equal(fs.readFileSync(file,'utf8'),'{broken');
    assert.throws(()=>s.replaceCityCache({towns:{}}));
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('settings endpoint/client serialize updates and preset saves; city POST cannot clobber presets',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dfo-loot-http-'));
  try{
    const handle=wrap(async()=>new Response('not found',{status:404}),{app:{getPath:()=>dir}});
    const req=(url,init={})=>handle(new Request('dagger://game'+url,init));
    const client=createClient({request:req});await client.load();
    await Promise.all([client.update({filter:{mode:'white',tags:['rarity:rare']}}),client.update({filter:{mode:'black',tags:['group:Weapons']}})]);
    const preset=await client.savePreset('JSON-пресет');
    assert.deepEqual(preset.preset.filter,{mode:'black',tags:['group:Weapons']});
    const res=await req('/dfo-mod/cache',{method:'POST',body:JSON.stringify({v:1,towns:{city:{at:10}}})});assert.equal(res.status,204);
    const restarted=createClient({request:req});await restarted.load();assert.equal(restarted.get().presets[0].name,'JSON-пресет');assert.equal(restarted.get().filter.mode,'black');
    const stale=createClient({request:req});await stale.load();await restarted.update({filter:{mode:'white',tags:['rarity:rare']}});
    await assert.rejects(stale.update({filter:{mode:'black',tags:[]}}),{status:409});
    assert.equal(stale.get().filter.mode,'white');
    const disk=JSON.parse(fs.readFileSync(path.join(dir,'dfo-mod-cache.json')));
    assert.equal(disk.towns.city.at,10);assert.equal(disk.loot.presets.length,1);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('preset/settings schemas store only rules and identifiers, never caller-provided item entities',()=>{
  const cleaned=R.cleanSettings({items:[mk('Never store me')],autoLoot:{enabled:true,items:[mk('Never store me'), 'type:Weapons:131']}});
  assert.equal(cleaned.items,undefined);assert.deepEqual(cleaned.autoLoot.items,['type:Weapons:131']);
  assert.equal(R.presetName('  Фильтр\n J  '),'Фильтр J');
});

test('rapid checkbox edits coalesce into a bounded number of disk writes while keeping the latest settings',async()=>{
  let saved=R.cleanState(),posts=0;
  const request=async(url,init)=>{
    if(init.method==='POST'){
      posts++;const payload=JSON.parse(init.body);assert.equal(payload.revision,saved.revision);
      saved={...R.cleanState(payload),revision:saved.revision+1};
    }
    return new Response(JSON.stringify(saved));
  };
  const client=createClient({request});await client.load();
  await Promise.all(Array.from({length:80},(_,i)=>client.update({filter:{mode:'black',tags:['type:Weapons:'+i]}})));
  await client.flush();assert.ok(posts<=2);assert.deepEqual(saved.filter.tags,['type:Weapons:79']);
});

test('a dialog or transition appearing while J is loading cancels auto-loot before any source mutation',async()=>{
  let release,blocked=false,mounts=0;
  const ready=new Promise(r=>release=r),source=[mk('Arrow','Weapons',131)];
  const h=host([source],undefined,()=>{mounts++;return{done:false}});h.blocked=()=>blocked;
  const settings=R.cleanState({autoLoot:{enabled:true,items:['type:Weapons:131']}});
  const c=controller({client:{load:()=>ready,flush:async()=>{},get:()=>settings},prepare:async()=>{}});c.register('world',h);
  const pending=c.activate();blocked=true;release();assert.equal(await pending,false);assert.equal(mounts,0);assert.equal(source.length,1);
});

test('registered custom templates without a declared group match by their globally unique template ID',()=>{
  const it=mk('Custom reagent','PlantIngredients1',1880);
  const rule={enabled:true,items:['type:*:1880']};
  assert.equal(R.automatic(it,rule,tools),true);assert.equal(R.compileAuto(rule,tools)(it),true);
  assert.equal(R.automatic({...it,templateIndex:1881},rule,tools),false);
  assert.equal(R.visible(it,{mode:'white',tags:['type:*:1880']},tools),true);
});

test('failed settings writes restore authoritative cache and local storage; later successful edits still persist',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dfo-loot-write-error-')), memory=new Map(), events=[];
  try{
    const handle=wrap(async()=>new Response('not found',{status:404}),{app:{getPath:()=>dir}});
    let fail=false;
    const request=(url,init={})=>fail&&init.method==='POST'
      ? Promise.resolve(new Response(JSON.stringify({error:'Диск недоступен'}),{status:500}))
      : handle(new Request('dagger://game'+url,init));
    const client=createClient({request,storage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)}});
    client.subscribe((_s,reason)=>events.push(reason));await client.load();
    await client.update({filter:{mode:'white',tags:['rarity:rare']}});
    fail=true;await assert.rejects(client.update({filter:{mode:'black',tags:['group:Weapons']}}),{status:500});
    assert.deepEqual(client.get().filter,{mode:'white',tags:['rarity:rare']});assert.ok(events.includes('rollback'));
    assert.deepEqual(JSON.parse(memory.get('dfoMod.nearbyLoot')).filter,client.get().filter);
    assert.deepEqual(createLootStore(dir).state().filter,client.get().filter);
    fail=false;await client.update({autoLoot:{enabled:true,items:['type:Weapons:131']}});await client.flush();
    const restarted=createClient({request});await restarted.load();assert.deepEqual(restarted.get(),client.get());
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('a failed in-flight write never rolls back a newer queued checkbox edit',async()=>{
  let disk=R.cleanState(), release, started;
  const sent=new Promise(r=>started=r), pending=new Promise(r=>release=r);let posts=0;
  const request=async(_url,init={})=>{
    if(init.method==='POST'){
      const body=JSON.parse(init.body);posts++;
      if(posts===1){started();await pending;return new Response(JSON.stringify({error:'temporary'}),{status:500});}
      assert.equal(body.revision,disk.revision);disk={...R.cleanState(body),revision:disk.revision+1};
    }
    return new Response(JSON.stringify(disk));
  };
  const c=createClient({request});await c.load();
  const first=c.update({filter:{mode:'white',tags:['rarity:rare']}});await sent;
  const second=c.update({filter:{mode:'black',tags:['group:Weapons']}});release();
  const result=await Promise.allSettled([first,second]);assert.equal(result[0].status,'rejected');assert.equal(result[1].status,'fulfilled');
  assert.deepEqual(c.get().filter,{mode:'black',tags:['group:Weapons']});assert.deepEqual(c.get(),disk);
});

test('explicit preset Save retries a transient pending settings error and preserves the same active filter after restart',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dfo-loot-preset-retry-'));
  try{
    const handle=wrap(async()=>new Response('not found',{status:404}),{app:{getPath:()=>dir}});let fail=true;
    const request=(url,init={})=>{
      if(url.endsWith('loot-settings')&&init.method==='POST'&&fail){fail=false;return Promise.resolve(new Response(JSON.stringify({error:'temporary'}),{status:500}));}
      return handle(new Request('dagger://game'+url,init));
    };
    const c=createClient({request});await c.load();
    const edit=c.update({filter:{mode:'white',tags:['rarity:rare']}}), save=c.savePreset('Повтор');
    const [a,b]=await Promise.allSettled([edit,save]);assert.equal(a.status,'rejected');assert.equal(b.status,'fulfilled');
    assert.deepEqual(c.get().filter,b.value.preset.filter);
    const restarted=createClient({request});await restarted.load();assert.deepEqual(restarted.get(),c.get());
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('a stale preset Save cannot accept a new revision while keeping obsolete active settings',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dfo-loot-preset-conflict-'));
  try{
    const handle=wrap(async()=>new Response('not found',{status:404}),{app:{getPath:()=>dir}}), request=(url,init={})=>handle(new Request('dagger://game'+url,init));
    const a=createClient({request}),b=createClient({request});await a.load();await b.load();
    await a.update({filter:{mode:'white',tags:['rarity:rare']}});
    await assert.rejects(b.savePreset('Устаревший'),{status:409});assert.deepEqual(b.get(),a.get());
    assert.equal(fs.existsSync(path.join(dir,'dfo-mod-loot-presets')),false);
    const result=await b.savePreset('Текущий');assert.deepEqual(result.preset.filter,a.get().filter);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('a preset file is rolled back when the shared cache write fails, without losing previously saved presets',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dfo-loot-preset-atomic-'));
  try{
    const store=createLootStore(dir), first=store.savePreset({name:'Первый',revision:0});
    fs.mkdirSync(path.join(dir,'dfo-mod-cache.json.tmp'));
    assert.throws(()=>store.savePreset({name:'Второй',revision:1}));
    assert.deepEqual(store.state(),first.state);
    assert.deepEqual(fs.readdirSync(path.join(dir,'dfo-mod-loot-presets')),[first.preset.id+'.json']);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('collect all rechecks capacity per transfer, takes partial stacks, attempts lighter later items, and preserves filtered-out loot',()=>{
  const arrows=mk('Arrow','Weapons',131,{stackCount:10}),heavy=mk('Heavy','Armor',102),light=mk('Light'),hidden=mk('Hidden');
  const h=host([[arrows,heavy],[light,hidden]]),loot=createSession(h,{tools:()=>({
    planTake(it,{entity}){
      const used=entity.items.reduce((n,it)=>n+(it.stackCount??1),0),amount=Math.min(it.stackCount??1,5-used);
      return {ok:amount>0&&it!==heavy,amount,refusal:amount<=0||it===heavy?{reason:'cannotCarry',text:'Native: cannot carry'}:null};
    },applyTransfer:tools.applyTransfer,
  })});
  const result=loot.takeAll([arrows,heavy]);assert.deepEqual(result,{taken:1,failed:2,refusal:'Native: cannot carry'});
  assert.equal(arrows.stackCount,5);assert.equal(h.entity.items[0].stackCount,5);assert.equal(loot.items().length,4);
  assert.equal(loot.takeAll([arrows]).taken,0);assert.equal(h.entity.items[0].stackCount,5);
  h.entity.items.length=0;
  const again=loot.takeAll([heavy,light]);assert.deepEqual(again,{taken:1,failed:1,refusal:'Native: cannot carry'});
  assert.deepEqual(h.entity.items,[light]);assert.ok(loot.items().includes(hidden),'a hidden/search-excluded row was not selected');
});
