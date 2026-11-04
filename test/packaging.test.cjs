'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const {openAsar,readFile,writeAsar,listFiles}=require('../src/asar.cjs');
const dist=path.resolve(__dirname,'../dist/payload');
const installer=path.resolve(__dirname,'../dist/DFO-Client-Expander-RU/DFO-Client-Expander-RU.exe');

test('distribution installer: install, reinstall and uninstall preserve original ASAR and package loot/dungeon files',
  {skip:!fs.existsSync(installer)},()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'dfo-package-'));
  try {
    const base=path.join(temp,'base.asar'),asar=path.join(temp,'app.asar'),user=path.join(temp,'profile');
    const json=Buffer.from('{"files":{}}'),pad=(4-json.length%4)%4,header=Buffer.alloc(8+json.length+pad),size=Buffer.alloc(8);
    header.writeUInt32LE(4+json.length+pad,0);header.writeUInt32LE(json.length,4);json.copy(header,8);
    size.writeUInt32LE(4,0);size.writeUInt32LE(header.length,4);fs.writeFileSync(base,Buffer.concat([size,header]));
    const blank=openAsar(base);
    writeAsar(blank,asar,{put:new Map([
      ['main.cjs',Buffer.from("const protocol={handle(){}};function handleDagger(){};protocol.handle('dagger',handleDagger);")],
      ['package.json',Buffer.from('{"version":"0.1.0"}')],
      ['untouched.bin',Buffer.from([0,10,42,255])],
    ])});blank.close();
    const original=fs.readFileSync(asar);
    fs.mkdirSync(user);fs.writeFileSync(path.join(user,'dfo-mod.json'),JSON.stringify({nearbyLootOptions:{keyCode:'KeyK',customOption:123},dungeonOptions:{customOption:456},marks:false}));
    const cache=Buffer.from(JSON.stringify({towns:{kept:true},loot:{revision:7,presets:[]},dungeons:{'12345':{at:1}}}));fs.writeFileSync(path.join(user,'dfo-mod-cache.json'),cache);
    const run=(cmd,...args)=>cp.execFileSync(process.execPath,[path.join(dist,'patcher/patcher.cjs'),cmd,'--no-proc-check','--asar',asar,'--user-data',user,...args],{encoding:'utf8'});
    for(let i=0;i<2;i++){
      run('install');
      const a=openAsar(asar),files=listFiles(a.header);
      for(const file of ['item-cards-transform.cjs','page/dfo_item_cards.js','nearby-loot-transform.cjs','loot-tags-transform.cjs','dungeon-transform.cjs','dungeon-live-transform.cjs','dungeon-nav-transform.cjs','page/dfo_dungeon_model.js','page/dfo_dungeons.js','page/dfo_dungeon_live_model.js','page/dfo_dungeon_live.js','page/dfo_dungeon_graph.js', 'page/dfo_dungeon_nav_model.js','page/dfo_dungeon_nav.js','loot-store.cjs','page/dfo_loot_rules.js','page/dfo_loot_ui.js','page/dfo_loot.js','transforms.cjs']){
        assert.ok(files.has('dfo-mod/'+file));assert.deepEqual(readFile(a,'dfo-mod/'+file),fs.readFileSync(path.join(dist,'mod',file)));
      }
      assert.match(readFile(a,'main.cjs').toString(),/dfo-mod\/hook.cjs/);
      assert.deepEqual(readFile(a,'untouched.bin'),Buffer.from([0,10,42,255]));a.close();
      const cfg=JSON.parse(fs.readFileSync(path.join(user,'dfo-mod.json')));
      assert.equal(cfg.nearbyLoot,true);assert.equal(cfg.dungeons,true);assert.equal(cfg.itemCards,true);assert.equal(cfg.nearbyLootOptions.keyCode,'KeyK');assert.equal(cfg.marks,false);
      assert.equal(cfg.dungeonOptions.keyCode,'KeyK');assert.equal(cfg.dungeonOptions.customOption,456);
    }
    run('install','--no-ru','--loot-key','Mouse4','--dungeon-key','NumpadAdd','--set','ru=0','--set','marks=1','--set','nearbyLoot=0','--set','dungeons=0','--set','itemCards=0','--set','onlyVisited=0','--set','enabled=1');
    let cfg=JSON.parse(fs.readFileSync(path.join(user,'dfo-mod.json')));
    assert.equal(cfg.itemCards,false);
    assert.equal(cfg.enabled,true);assert.equal(cfg.ru,false);assert.equal(cfg.marks,true);assert.equal(cfg.nearbyLoot,false);assert.equal(cfg.dungeons,false);assert.equal(cfg.marksOptions.onlyVisited,false);assert.equal(cfg.nearbyLootOptions.keyCode,'Mouse4');
    let current=openAsar(asar);assert.equal(listFiles(current.header).has('dfo-mod/page/ru_dict.js'),false);current.close();
    run('install','--loot-key','NumpadEnter','--set','ru=1','--set','marks=0','--set','nearbyLoot=1','--set','dungeons=1','--set','onlyVisited=1');
    cfg=JSON.parse(fs.readFileSync(path.join(user,'dfo-mod.json')));assert.equal(cfg.ru,true);assert.equal(cfg.marks,false);assert.equal(cfg.nearbyLoot,true);assert.equal(cfg.dungeons,true);assert.equal(cfg.marksOptions.onlyVisited,true);assert.equal(cfg.nearbyLootOptions.keyCode,'NumpadEnter');
    run('install','--loot-key','Mouse5','--dungeon-key','Mouse4');run('install');
    cfg=JSON.parse(fs.readFileSync(path.join(user,'dfo-mod.json')));assert.equal(cfg.nearbyLootOptions.keyCode,'Mouse5');assert.equal(cfg.nearbyLootOptions.customOption,123);
    const beforeInvalid=fs.readFileSync(asar),configBeforeInvalid=fs.readFileSync(path.join(user,'dfo-mod.json'));
    const invalid=cp.spawnSync(process.execPath,[path.join(dist,'patcher/patcher.cjs'),'install','--no-proc-check','--asar',asar,'--user-data',user,'--loot-key','Mouse6'],{encoding:'utf8'});
    assert.notEqual(invalid.status,0);assert.match(invalid.stdout+invalid.stderr,/Некорректная кнопка лута/);
    assert.deepEqual(fs.readFileSync(asar),beforeInvalid);assert.deepEqual(fs.readFileSync(path.join(user,'dfo-mod.json')),configBeforeInvalid);
    const invalidDungeon=cp.spawnSync(process.execPath,[path.join(dist,'patcher/patcher.cjs'),'install','--no-proc-check','--asar',asar,'--user-data',user,'--dungeon-key','Mouse6'],{encoding:'utf8'});
    assert.notEqual(invalidDungeon.status,0);assert.match(invalidDungeon.stdout+invalidDungeon.stderr,/Некорректная кнопка/);
    assert.deepEqual(fs.readFileSync(asar),beforeInvalid);assert.deepEqual(fs.readFileSync(path.join(user,'dfo-mod.json')),configBeforeInvalid);
    current=openAsar(asar);assert.equal(listFiles(current.header).has('dfo-mod/page/ru_dict.js'),true);current.close();
    assert.deepEqual(fs.readFileSync(asar+'.dfo-mod-original.bak'),original);
    run('uninstall');assert.deepEqual(fs.readFileSync(asar),original);
    const finalCache=JSON.parse(fs.readFileSync(path.join(user,'dfo-mod-cache.json'),'utf8'));
    assert.deepEqual(finalCache.towns,{kept:true});assert.equal(finalCache.loot?.revision,7);assert.deepEqual(finalCache.dungeons,{'12345':{at:1}});
    assert.equal(finalCache.hotkeys?.loot,'Mouse5','hotkey must be saved in cache across installer operations');
    assert.equal(finalCache.hotkeys?.dungeon,'Mouse4');

    // Verify that status and reinstall without --loot-key restore previously assigned hotkey from cache
    const statusWithCache=JSON.parse(run('status','--json'));
    assert.equal(statusWithCache.cachedLootKey,'Mouse5','status must read cached hotkey');
    assert.equal(statusWithCache.cfg.nearbyLootOptions.keyCode,'Mouse5');
    assert.equal(statusWithCache.cachedDungeonKey,'Mouse4');assert.equal(statusWithCache.cfg.dungeonOptions.keyCode,'Mouse4');
    fs.unlinkSync(path.join(user,'dfo-mod.json'));
    const statusNoConfig=JSON.parse(run('status','--json'));
    assert.equal(statusNoConfig.cachedLootKey,'Mouse5','status must read cached hotkey even if config is absent');
    assert.equal(statusNoConfig.cfg.nearbyLootOptions.keyCode,'Mouse5');
    assert.equal(statusNoConfig.cachedDungeonKey,'Mouse4');assert.equal(statusNoConfig.cfg.dungeonOptions.keyCode,'Mouse4');
    run('install');
    const restoredCfg=JSON.parse(fs.readFileSync(path.join(user,'dfo-mod.json'),'utf8'));
    assert.equal(restoredCfg.nearbyLootOptions.keyCode,'Mouse5','install must restore previously assigned hotkey from cache');
    assert.equal(restoredCfg.dungeonOptions.keyCode,'Mouse4','dungeon shortcut must restore independently from the same cache');
    const beforeCacheFailure=fs.readFileSync(path.join(user,'dfo-mod-cache.json'));
    const beforeCfgFailure=fs.readFileSync(path.join(user,'dfo-mod.json'));
    fs.mkdirSync(path.join(user,'dfo-mod-cache.json.tmp'));
    const failedCache=cp.spawnSync(process.execPath,[path.join(dist,'patcher/patcher.cjs'),'install','--no-proc-check','--asar',asar,'--user-data',user,'--loot-key','Mouse4'],{encoding:'utf8'});
    assert.notEqual(failedCache.status,0);assert.match(failedCache.stdout+failedCache.stderr,/Не удалось сохранить/);
    assert.deepEqual(fs.readFileSync(path.join(user,'dfo-mod-cache.json')),beforeCacheFailure);assert.deepEqual(fs.readFileSync(path.join(user,'dfo-mod.json')),beforeCfgFailure);
    fs.rmdirSync(path.join(user,'dfo-mod-cache.json.tmp'));
    fs.writeFileSync(path.join(user,'dfo-mod-cache.json'),'{broken');
    const beforeBadCacheAsar=fs.readFileSync(asar);
    const badCache=cp.spawnSync(process.execPath,[path.join(dist,'patcher/patcher.cjs'),'install','--no-proc-check','--asar',asar,'--user-data',user,'--loot-key','Mouse4'],{encoding:'utf8'});
    assert.notEqual(badCache.status,0);assert.match(badCache.stdout+badCache.stderr,/файлы клиента не изменены/);
    assert.deepEqual(fs.readFileSync(asar),beforeBadCacheAsar);assert.equal(fs.readFileSync(path.join(user,'dfo-mod-cache.json'),'utf8'),'{broken');
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});

test('standalone Windows binary embeds the complete payload, product metadata, icon and DPI manifest',
 {skip:!fs.existsSync(installer)},()=>{
  const exe=fs.readFileSync(installer),payload=fs.readFileSync(path.resolve(__dirname,'../src/gui/payload_windows.zip'));
  const versionName=JSON.parse(fs.readFileSync(path.join(dist,'mod/version.json'))).version;
  const release=path.resolve(__dirname,'../dist/DFO-Client-Expander-RU-'+versionName);
  assert.deepEqual(fs.readFileSync(release+'.exe'),exe,'versioned download must be the current standalone build');
  cp.execFileSync('python3',['-c','import pathlib,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.read("DFO-Client-Expander-RU/DFO-Client-Expander-RU.exe")==pathlib.Path(sys.argv[2]).read_bytes()',release+'.zip',installer]);
  assert.equal(exe.subarray(0,2).toString(),'MZ');assert.ok(exe.includes(payload),'standalone EXE carries the exact built payload');
  const pe=exe.readUInt32LE(0x3c);assert.equal(exe.readUInt32LE(pe),0x4550);assert.equal(exe.readUInt16LE(pe+4),0x8664);
  const count=exe.readUInt16LE(pe+6),section=pe+24+exe.readUInt16LE(pe+20);let rsrc;
  for(let i=0;i<count;i++){const at=section+i*40;if(exe.subarray(at,at+8).toString().replace(/\0/g,'')==='.rsrc')rsrc={rva:exe.readUInt32LE(at+12),size:exe.readUInt32LE(at+16),offset:exe.readUInt32LE(at+20)}}assert.ok(rsrc);
  const data=exe.subarray(rsrc.offset,rsrc.offset+rsrc.size);
  for(const value of ['DFO-Client-Expander-RU','AutomaticYobaMachine','Создано специально для русского сообщества DFO Online.'])assert.ok(data.includes(Buffer.from(value,'utf16le')),value);
  assert.ok(data.includes(Buffer.from('PerMonitorV2')));assert.ok(data.includes(Buffer.from('asInvoker')));
  function resource(ids){let at=0;for(const id of ids){const n=data.readUInt16LE(at+12)+data.readUInt16LE(at+14);let target;for(let i=0;i<n;i++){const p=at+16+8*i;if(data.readUInt32LE(p)===id)target=data.readUInt32LE(p+4)}assert.notEqual(target,undefined,'missing resource '+id);if(target&0x80000000)at=target&0x7fffffff;else{const p=data.readUInt32LE(target)-rsrc.rva,size=data.readUInt32LE(target+4);assert.ok(p>=0&&p+size<=data.length);return data.subarray(p,p+size)}}throw new Error('not a leaf')}
  const version=resource([16,1,0x409]);let at=6;while(version.readUInt16LE(at)!==0)at+=2;at=(at+2+3)&~3;assert.equal(version.readUInt32LE(at),0xfeef04bd);
  const expected=JSON.parse(fs.readFileSync(path.join(dist,'mod/version.json'))).version.split('.').map(Number);
  assert.deepEqual([version.readUInt16LE(at+10),version.readUInt16LE(at+8),version.readUInt16LE(at+14)],expected);
  assert.ok(resource([14,1,0x409]).length>20);assert.match(resource([24,1,0x409]).toString(),/DFO\.Client\.Expander\.RU/);
 });
