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
    fs.mkdirSync(user);fs.writeFileSync(path.join(user,'dfo-mod.json'),JSON.stringify({nearbyLootOptions:{keyCode:'KeyK'},marks:false}));
    const cache=Buffer.from(JSON.stringify({towns:{kept:true},loot:{revision:7,presets:[]},dungeons:{'12345':{at:1}}}));fs.writeFileSync(path.join(user,'dfo-mod-cache.json'),cache);
    const run=(cmd,...args)=>cp.execFileSync(process.execPath,[path.join(dist,'patcher/patcher.cjs'),cmd,'--asar',asar,'--user-data',user,...args],{encoding:'utf8'});
    for(let i=0;i<2;i++){
      run('install');
      const a=openAsar(asar),files=listFiles(a.header);
      for(const file of ['nearby-loot-transform.cjs','loot-tags-transform.cjs','dungeon-transform.cjs','page/dfo_dungeon_model.js','page/dfo_dungeons.js','loot-store.cjs','page/dfo_loot_rules.js','page/dfo_loot_ui.js','page/dfo_loot.js','transforms.cjs']){
        assert.ok(files.has('dfo-mod/'+file));assert.deepEqual(readFile(a,'dfo-mod/'+file),fs.readFileSync(path.join(dist,'mod',file)));
      }
      assert.match(readFile(a,'main.cjs').toString(),/dfo-mod\/hook.cjs/);
      assert.deepEqual(readFile(a,'untouched.bin'),Buffer.from([0,10,42,255]));a.close();
      const cfg=JSON.parse(fs.readFileSync(path.join(user,'dfo-mod.json')));
      assert.equal(cfg.nearbyLoot,true);assert.equal(cfg.dungeons,true);assert.equal(cfg.nearbyLootOptions.keyCode,'KeyK');assert.equal(cfg.marks,false);
    }
    run('install','--no-ru','--set','ru=0','--set','marks=1','--set','nearbyLoot=0','--set','dungeons=0','--set','onlyVisited=0','--set','enabled=1');
    let cfg=JSON.parse(fs.readFileSync(path.join(user,'dfo-mod.json')));
    assert.equal(cfg.enabled,true);assert.equal(cfg.ru,false);assert.equal(cfg.marks,true);assert.equal(cfg.nearbyLoot,false);assert.equal(cfg.dungeons,false);assert.equal(cfg.marksOptions.onlyVisited,false);assert.equal(cfg.nearbyLootOptions.keyCode,'KeyK');
    let current=openAsar(asar);assert.equal(listFiles(current.header).has('dfo-mod/page/ru_dict.js'),false);current.close();
    run('install','--set','ru=1','--set','marks=0','--set','nearbyLoot=1','--set','dungeons=1','--set','onlyVisited=1');
    cfg=JSON.parse(fs.readFileSync(path.join(user,'dfo-mod.json')));assert.equal(cfg.ru,true);assert.equal(cfg.marks,false);assert.equal(cfg.nearbyLoot,true);assert.equal(cfg.dungeons,true);assert.equal(cfg.marksOptions.onlyVisited,true);assert.equal(cfg.nearbyLootOptions.keyCode,'KeyK');
    current=openAsar(asar);assert.equal(listFiles(current.header).has('dfo-mod/page/ru_dict.js'),true);current.close();
    assert.deepEqual(fs.readFileSync(asar+'.dfo-mod-original.bak'),original);
    run('uninstall');assert.deepEqual(fs.readFileSync(asar),original);
    assert.deepEqual(fs.readFileSync(path.join(user,'dfo-mod-cache.json')),cache,'town, filter and dungeon caches survive every installer operation');
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
