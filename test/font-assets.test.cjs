'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {replacement,stripFaces}=require('../src/mod/font-assets.cjs');
const defaults=require('../src/mod/page/dfo_font_data.js');
const crypto=require('node:crypto');
test('compatibility FNTs contain only generated community glyphs and preserved client heights',()=>{
 for(const [file,hash]of Object.entries(defaults.sources))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../src/mod/fonts',file))).digest('hex'),hash);
 for(const [height,entry]of Object.entries(defaults.fonts)){
  const bytes=replacement('play/arena2/'+entry.name+'.FNT').body;
  assert.equal(bytes.readUInt16LE(2),Number(height));assert.equal(bytes.length,8644);
  assert.ok(bytes.subarray(964).some(x=>x!==0));
  for(let i=0;i<240;i++){assert.ok(bytes.readUInt16LE(6+i*4)<=16);assert.equal(bytes.readUInt16LE(4+i*4),964+i*32);}
  if(process.env.DFO_ARENA2_DIR)assert.notDeepEqual(bytes,fs.readFileSync(path.join(process.env.DFO_ARENA2_DIR,entry.name+'.FNT')));
 }
});
test('font declarations are removed without swallowing interpolation or image data',()=>{
 const src="const x=`@font-face{font-family:'${family}';src:url(data:font/woff2;base64,AAAA)}body{background:url(data:image/png;base64,BBBB)}`;";
 const out=stripFaces(src);assert.equal(out.count,1);assert.equal(out.text,"const x=`body{background:url(data:image/png;base64,BBBB)}`;");
 assert.equal(stripFaces(out.text).text,out.text);
});
test('protocol unconditionally replaces legacy vanilla fonts with base or custom user fonts across game and launcher',async()=>{
 const {wrap,VERSION}=require('../src/mod/hook.cjs'),{createFontStore}=require('../src/mod/font-store.cjs'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'dfo-font-policy-'));
 try{
  fs.writeFileSync(path.join(temp,'dfo-mod.json'),JSON.stringify({ru:false,marks:false,nearbyLoot:false,dungeons:false,itemCards:false,fonts:true}));
  let calls=0;const original=async req=>{calls++;return new Response(req.url.endsWith('.css')?'@font-face{font-family:Old;src:url(old.woff2)}body{color:white}':'<head><script type="module" src="./app.js"></script></head>',{headers:{'Content-Type':'text/html'}})};
  const handle=wrap(original,{app:{getPath:()=>temp}}),body=fs.readFileSync(path.join(__dirname,'../src/mod/fonts/item-font-text.ttf')),title=fs.readFileSync(path.join(__dirname,'../src/mod/fonts/item-font-title.ttf'));
  for(const url of ['dagger://game/fonts/opendyslexic/opendyslexic-latin-400-normal.woff2','dagger://game/art/grimoire-ui/Fonts/FONT0003-SDF.ttf','dagger://launcher/fonts/PixelifySans-latin.woff2','dagger://launcher/dfo-mod/fonts/item-font-text.ttf','dagger://game/fonts/legacy.ttc']){
   const response=await handle(new Request(url));assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),body,url);
  }
  for(const url of ['dagger://launcher/fonts/Jacquard12-latin.woff2','dagger://game/art/FONT0000-SDF.ttf']){
   const response=await handle(new Request(url));assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),title,url);
  }
  assert.equal(calls,0,'Original font bytes must never be delegated');
  const fnt=await handle(new Request('dagger://game/arena2/FONT0003.FNT'));assert.deepEqual(Buffer.from(await fnt.arrayBuffer()),replacement('FONT0003.FNT').body);
  const css=await handle(new Request('dagger://game/assets/theme.css'));assert.equal(await css.text(),'body{color:white}');
  const launcherCssRes=await handle(new Request('dagger://launcher/launcher.css'));assert.equal(await launcherCssRes.text(),'body{color:white}');
  const html=await handle(new Request('dagger://launcher/index.html'));const text=await html.text();assert.match(text,/href="\/dfo-mod\/dfo_fonts\.css"/);assert.match(text,/dfo_font_preset\.js/);assert.match(text,/dfo_font_data\.js/);assert.match(text,/dfo_fonts\.js/);assert.match(text,/<script type="module" src="\.\/app\.js"><\/script>/,'Launcher external module scripts stay external under strict CSP script-src self');assert.doesNotMatch(text,/dfo_dungeon|ru_locale/);
  const dynCss=await handle(new Request('dagger://launcher/dfo-mod/dfo_fonts.css'));assert.equal(dynCss.status,200);assert.match(dynCss.headers.get('content-type'),/text\/css/);assert.match(await dynCss.text(),/@font-face\{font-family:'DFO Gabin'/);
  const playDirHtml=await handle(new Request('dagger://game/play/'));assert.equal(playDirHtml.status,200);const playDirText=await playDirHtml.text();assert.match(playDirText,/\.\.\/dfo-mod\/dfo_font_preset\.js/);assert.match(playDirText,/\.\.\/dfo-mod\/dfo_fonts\.js/);
  assert.equal((await handle(new Request('dagger://game/%FF.ttf'))).status,400);
  // Even an older dfo-mod.json with fonts:false must never bring vanilla fonts back.
  fs.writeFileSync(path.join(temp,'dfo-mod.json'),JSON.stringify({fonts:false,ru:false}));
  const stillBase=wrap(original,{app:{getPath:()=>temp}}),before=calls;
  const legacyRes=await stillBase(new Request('dagger://game/fonts/old.woff2'));assert.equal(calls,before,'Vanilla font requests must never fall through');
  assert.deepEqual(Buffer.from(await legacyRes.arrayBuffer()),body);
  // User custom font override stored in <userData>/dfo-mod-fonts/ is served dynamically on game & launcher hosts.
  const customBody=Buffer.concat([Buffer.from([0x00,0x01,0x00,0x00]),Buffer.alloc(60,0x42)]);
  const customSrc=path.join(temp,'PlayerCustom.ttf');fs.writeFileSync(customSrc,customBody);
  const store=createFontStore(temp);const saved=store.setSlot('body',customSrc);
  const presetJs=await (await stillBase(new Request('dagger://game/dfo-mod/dfo_font_preset.js'))).text();
  assert.match(presetJs,/PlayerCustom\.ttf/);
  assert.match(presetJs,new RegExp(`"version":"${VERSION.replace(/\./g,'\\.')}"`),'preset bundle must embed mod VERSION for Worker & Launcher immutable cache-key parity');
  const servedGame=await stillBase(new Request('dagger://game/dfo-mod/user-fonts/'+encodeURIComponent(saved.slots.body.file)));
  assert.equal(servedGame.status,200);assert.equal(servedGame.headers.get('cache-control'),'no-store');assert.deepEqual(Buffer.from(await servedGame.arrayBuffer()),customBody);
  const servedImmutable=await stillBase(new Request('dagger://game/dfo-mod/user-fonts/'+encodeURIComponent(saved.slots.body.file)+'?dfo='+VERSION+'-'+saved.revision));
  assert.equal(servedImmutable.status,200);assert.match(servedImmutable.headers.get('cache-control'),/immutable/);assert.deepEqual(Buffer.from(await servedImmutable.arrayBuffer()),customBody);
  const baseImmutable=await stillBase(new Request('dagger://game/dfo-mod/item-font-text.ttf?dfo='+VERSION));
  assert.equal(baseImmutable.status,200);assert.match(baseImmutable.headers.get('cache-control'),/immutable/);
  const servedLauncher=await stillBase(new Request('dagger://launcher/dfo-mod/user-fonts/'+encodeURIComponent(saved.slots.body.file)+'?dfo='+VERSION+'-'+saved.revision));
  assert.equal(servedLauncher.status,200);assert.match(servedLauncher.headers.get('cache-control'),/immutable/);assert.deepEqual(Buffer.from(await servedLauncher.arrayBuffer()),customBody);
  const updatedDynCss=await (await stillBase(new Request('dagger://launcher/dfo-mod/dfo_fonts.css'))).text();
  assert.match(updatedDynCss,new RegExp(saved.slots.body.file.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),'Cached dfo_fonts.css must invalidate immediately when preset revision changes');
  const overriddenLegacy=await stillBase(new Request('dagger://game/fonts/old.woff2'));
  assert.deepEqual(Buffer.from(await overriddenLegacy.arrayBuffer()),customBody,'Legacy vanilla font paths resolve to active user body font');
 }finally{fs.rmSync(temp,{recursive:true,force:true})}
});
