'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const {openAsar,readFile,writeAsar,listFiles}=require('../src/asar.cjs');
const dist=path.resolve(__dirname,'../dist/DFO_Mod');

test('distribution installer: install, reinstall and uninstall preserve original ASAR and package all detector files',
  {skip:!fs.existsSync(path.join(dist,'DFO_Mod.exe'))},()=>{
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
    const run=cmd=>cp.execFileSync(process.execPath,[path.join(dist,'patcher/patcher.cjs'),cmd,'--asar',asar,'--user-data',user],{encoding:'utf8'});
    for(let i=0;i<2;i++){
      run('install');
      const a=openAsar(asar),files=listFiles(a.header);
      for(const file of ['nearby-loot-transform.cjs','loot-tags-transform.cjs','loot-store.cjs','page/dfo_loot_rules.js','page/dfo_loot_ui.js','page/dfo_loot.js','transforms.cjs']){
        assert.ok(files.has('dfo-mod/'+file));assert.deepEqual(readFile(a,'dfo-mod/'+file),fs.readFileSync(path.join(dist,'mod',file)));
      }
      assert.match(readFile(a,'main.cjs').toString(),/dfo-mod\/hook.cjs/);
      assert.deepEqual(readFile(a,'untouched.bin'),Buffer.from([0,10,42,255]));a.close();
      const cfg=JSON.parse(fs.readFileSync(path.join(user,'dfo-mod.json')));
      assert.equal(cfg.nearbyLoot,true);assert.equal(cfg.nearbyLootOptions.keyCode,'KeyK');assert.equal(cfg.marks,false);
    }
    run('uninstall');assert.deepEqual(fs.readFileSync(asar),original);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
