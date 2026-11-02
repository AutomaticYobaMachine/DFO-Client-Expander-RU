'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createLootStore,validLootKey,cachedLootKey}=require('../src/mod/loot-store.cjs');
const {wrap}=require('../src/mod/hook.cjs');

test('cached hotkey survives city replacement, loot settings and dungeon notes without losing another namespace',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dfo-import-cache-'));
  try {
    const s=createLootStore(dir);
    s.replaceCityCache({v:1,towns:{old:{name:'Town'}},asked:{kept:1}});
    s.saveHotkeys({loot:'Mouse5',other:'KeyK'});
    s.saveSettings({revision:0,filter:{mode:'white',tags:['rarity:rare']}});
    s.saveDungeonNote({id:'12345',at:Date.now(),counts:[],alive:0});
    s.replaceCityCache({towns:{next:{name:'Next'}},hotkeys:{loot:'KeyJ'},loot:{},dungeons:{}});
    const cache=s.read();assert.equal(cache.hotkeys.loot,'Mouse5');assert.equal(cache.hotkeys.other,'KeyK');
    assert.equal(cache.loot.filter.mode,'white');assert.equal(cache.dungeons['12345'].alive,0);assert.equal(cache.towns.next.name,'Next');
    assert.equal(s.lootKey(),'Mouse5');
    assert.throws(()=>s.saveHotkeys({loot:'Mouse6'}),{status:400});assert.equal(s.lootKey(),'Mouse5');
    assert.equal(validLootKey('NumpadEnter'),true);assert.equal(validLootKey('Mouse1'),false);
    assert.equal(cachedLootKey({hotkeys:{loot:'invalid'},loot:{keyCode:'KeyK'}}),'KeyK');
  } finally {fs.rmSync(dir,{recursive:true,force:true})}
});

test('live hook uses the same cached binding as the installer, even if the config vanished or was reset',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dfo-import-hook-'));
  try {
    const store=createLootStore(dir);store.saveHotkeys({loot:'Mouse4'});
    const cfg=path.join(dir,'dfo-mod.json');fs.writeFileSync(cfg,JSON.stringify({nearbyLootOptions:{keyCode:'KeyJ',custom:123}}));
    const html='<html><head></head><body></body></html>';
    const page=async()=>{
      const handler=wrap(async()=>new Response(html,{headers:{'Content-Type':'text/html'}}),{app:{getPath:()=>dir}});
      return (await handler(new Request('dagger://game/play/index.html'))).text();
    };
    const first=await page();assert.match(first,/"keyCode":"Mouse4"/);assert.match(first,/"custom":123/);
    assert.equal(JSON.parse(fs.readFileSync(cfg)).nearbyLootOptions.keyCode,'KeyJ','runtime reads must not rewrite preferences');
    fs.unlinkSync(cfg);assert.match(await page(),/"keyCode":"Mouse4"/);assert.equal(fs.existsSync(cfg),false);
    fs.writeFileSync(path.join(dir,'dfo-mod-cache.json'),'{broken');
    const fallback=await page();assert.match(fallback,/dfo_loot\.js/,'bad optional cache must not stop the game');
    assert.equal(fs.readFileSync(path.join(dir,'dfo-mod-cache.json'),'utf8'),'{broken');
  } finally {fs.rmSync(dir,{recursive:true,force:true})}
});

test('published dungeon loot getter returns the live physical collider instead of an absent public property',
  {skip:!process.env.DFO_BUILD_DIR},()=>{
    const {transformAsset}=require('../src/mod/transforms.cjs');
    const dir=path.join(process.env.DFO_BUILD_DIR,'assets');let found=false;
    for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.js'))) {
      const source=fs.readFileSync(path.join(dir,file),'utf8');
      if(!source.includes('openLootList(')||!source.includes('lootContents(')||!source.includes('takeLoot('))continue;
      const changed=transformAsset('assets/'+file,source,{nearbyLoot:true,ru:false,marks:false,dungeons:false});
      if(!changed.log.some(([key])=>key==='loot.dungeon'))continue;
      const getter=/get dfoNearbyLoot\(\)\{const api=this;return \{kind:"dungeon",[\s\S]*?return api\.overlayWindow\(\)\}\}\}/.exec(changed.text)?.[0];
      assert.ok(getter,'missing transformed dungeon getter');
      const collider=/collider:\(\)=>([\w$]+),blocked:/.exec(getter)?.[1];
      const entity=/kind:"dungeon",entity:([\w$]+),/.exec(getter)?.[1];
      assert.ok(collider&&entity,'collider must come from a live lexical binding');
      assert.ok(source.includes('.physical.attach({collider:()=>'+collider),'binding must be the collider attached to the original physical loot');
      const check=new Function('_first','_next','_player',`let ${collider}=_first;const ${entity}=_player;const _api={${getter}};const _view=_api.dfoNearbyLoot;const _ok=_view.collider()===_first;${collider}=_next;return _ok&&_view.collider()===_next;`);
      assert.equal(check({raycast(){}},{raycast(){}},{items:[]}),true,'the same view must see a replaced live collider');
      found=true;break;
    }
    assert.ok(found,'published dungeon module not found');
  });
