#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
process.env.DFO_GLOBAL_FONTS='1';
const {chromium}=require(process.env.DFO_PLAYWRIGHT_MODULE||'playwright'),{server}=require('./test-item-cards-browser.cjs');
const mod=path.resolve(process.env.DFO_CARD_MOD_DIR||path.join(__dirname,'../src/mod')),build=process.env.DFO_BUILD_DIR;
const {transformAsset}=require(path.join(mod,'transforms.cjs'));
async function main(){
 let browser;await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.DFO_CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.stack));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/?ru&online');await page.waitForFunction(()=>window.ready&&window.nativeFontTest);
  const report=await page.evaluate(async()=>{
   const c=document.createElement('canvas'),g=c.getContext('2d');const initial=g.font;c.width=42;const resize=g.font;g.reset?.();const reset=g.font;
   const off=new OffscreenCanvas(42,42),og=off.getContext('2d'),offscreen=og.font;off.height=50;const offscreenReset=og.font;
   const fake=new FontFace('Pixelify Sans',new Uint8Array([0,1,2,3]).buffer);await fake.load();document.fonts.add(fake);
   const redirected=fake.family;fake.family='Old Native Face';document.fonts.add(fake);
   const frame=document.createElement('iframe');frame.hidden=true;document.body.append(frame);
   const foreign=new frame.contentWindow.FontFace('Foreign Old Face',await fetch('/dfo-mod/item-font-text.ttf?dfo=1.21.0').then(r=>r.arrayBuffer()));await foreign.load();document.fonts.add(foreign);frame.remove();
   const families=[...document.fonts].map(f=>f.family),fnts=[];
   for(let i=0;i<5;i++){
    const raw=new Uint8Array(await fetch('/arena2/FONT000'+i+'.FNT').then(r=>r.arrayBuffer()));
    const fnt=new nativeFontTest.FntFile().load(raw),view=new DataView(raw.buffer);let changed=false;
    for(let j=0;j<240&&!changed;j++){const offset=view.getUint16(4+j*4,true);changed=fnt.glyphs[j].data.some((b,n)=>b!==raw[offset+n])}
    fnts.push({name:'FONT000'+i,height:fnt.fixedHeight,changed});
   }
   // Keep FNT handles alive while dropping their owners: metadata must not
   // retain a dead renderer's atlas and GL context through a global cache.
   window.keptFontHandles=[];window.rendererRefs=[];
   for(let i=0;i<16;i++){
    const renderer={textures:new Map(),uploadTexture(){return{}},releaseTexture(){},drawScreenQuadRun(){}};
    const bytes=new Uint8Array(await fetch('/arena2/FONT0003.FNT').then(r=>r.arrayBuffer()));
    const font=nativeFontTest.makeFont(renderer,new nativeFontTest.FntFile().load(bytes),'FONT0003');
    nativeFontTest.draw(renderer,font,'Герой Dragonborn',0,0);keptFontHandles.push(font);rendererRefs.push(new WeakRef(renderer));
   }
   return {initial,resize,reset,offscreen,offscreenReset,redirected,families,fnts,stats:__dfoFonts.stats()};
  });
  for(const key of ['initial','resize','reset','offscreen','offscreenReset'])assert.match(report[key],/DFO Gabin/,key);
  assert.equal(report.redirected.replace(/["']/g,''),'DFO Gabin');assert.equal(report.families.length,7);for(const f of report.families)assert.match(f,/^DFO /);
  for(const f of report.fnts)assert.equal(f.changed,true,f.name+' must ignore cached old glyph bytes');
  const cdp=await page.context().newCDPSession(page);await cdp.send('HeapProfiler.collectGarbage');await page.waitForTimeout(50);await cdp.send('HeapProfiler.collectGarbage');
  report.aliveRenderers=await page.evaluate(()=>rendererRefs.filter(r=>r.deref()).length);assert.equal(report.aliveRenderers,0,'Kept font metadata must not retain renderers');
  report.staleMetadataWidth=await page.evaluate(()=>nativeFontTest.measure(keptFontHandles[0].fnt,'Герой Dragonborn'));assert.ok(report.staleMetadataWidth>0);
  report.workers=await page.evaluate(async()=>{
   const probe=policy=>new Promise((resolve,reject)=>{const t=performance.now(),w=new Worker('/assets/fontPolicyWorker-probe.js'+(policy?'':'?font-policy-off'),{type:'module'}),bytes=new Uint8Array([3,8,13,21]);const timeout=setTimeout(()=>{w.terminate();reject(Error('Lost early worker message'))},15000);w.onerror=e=>{clearTimeout(timeout);w.terminate();reject(Error(e.message))};const replies=[];w.onmessage=e=>{replies.push(e.data);if(replies.length<2)return;clearTimeout(timeout);w.terminate();resolve({...replies[0],sequences:replies.map(x=>x.sequence),ms:performance.now()-t})};w.postMessage({id:7,bytes:bytes.buffer},[bytes.buffer]);const next=new Uint8Array([34,55]);w.postMessage({id:8,bytes:next.buffer},[next.buffer]);});
   return {plain:await probe(false),custom:await probe(true)};
  });
  assert.deepEqual(report.workers.custom.bytes,[3,8,13,21]);assert.equal(report.workers.custom.id,7);assert.deepEqual(report.workers.custom.sequences,[1,2]);assert.deepEqual(report.workers.custom.sequences,report.workers.plain.sequences);
  for(const key of ['initial','first','assigned','reset'])assert.match(report.workers.custom[key],/DFO Gabin/,key);
  assert.equal(report.workers.custom.faces.length,7);for(const f of report.workers.custom.faces){assert.match(f.family,/^["']?DFO /);assert.equal(f.status,'loaded')}
  const decoder=fs.readdirSync(path.join(build,'assets')).find(f=>/^vanillaEnhancedDecodeWorker-.*\.js$/.test(f));assert.ok(decoder);
  report.imageDecoder=await page.evaluate(async file=>{
   const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;const ctx=canvas.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,1,2);ctx.fillStyle='blue';ctx.fillRect(1,0,1,2);const url=canvas.toDataURL();
   const decode=policy=>new Promise((resolve,reject)=>{const w=new Worker('/assets/'+file+(policy?'':'?font-policy-off'),{type:'module'}),timer=setTimeout(()=>{w.terminate();reject(Error('Lost image decode'))},15000);w.onerror=e=>{clearTimeout(timer);w.terminate();reject(Error(e.message))};w.onmessage=e=>{clearTimeout(timer);w.terminate();resolve({...e.data,data:e.data.data?[...e.data.data]:null})};w.postMessage({id:42,url,maxSize:2});});
   return {plain:await decode(false),custom:await decode(true)};
  },decoder);
  for(const key of ['id','width','height','data'])assert.deepEqual(report.imageDecoder.custom[key],report.imageDecoder.plain[key]);assert.equal(report.imageDecoder.custom.auditCanvasChanges,0,'Image-only canvases must do no font work');assert.deepEqual(report.imageDecoder.custom.data,[255,0,0,255,0,0,255,255,255,0,0,255,0,0,255,255]);
  // Execute the shipped plaque source interface after production transforms,
  // without starting a networked world or moving any game entity.
  const world=fs.readdirSync(path.join(build,'assets')).find(f=>/^world-.*\.js$/.test(f)),source=fs.readFileSync(path.join(build,'assets',world),'utf8');
  const transformed=transformAsset('assets/'+world,source,{fonts:true,ru:false,nearbyLoot:false,dungeons:false,itemCards:false,marks:false});
  assert.ok(transformed.log.some(([id,n])=>id==='fonts.pixels'&&n>0));
  const acorn=require(process.env.DFO_ACORN_MODULE||'acorn'),ast=acorn.parse(transformed.text,{sourceType:'module',ecmaVersion:'latest'});let block,fnt;
  for(const node of ast.body){
   if(node.type==='VariableDeclaration')for(const d of node.declarations)if(d.init&&transformed.text.slice(d.init.start,d.init.end).includes('__dfoFonts?.pixelLetters()??'))block=d.init;
   if(node.type==='FunctionDeclaration'&&transformed.text.slice(node.start,node.end).includes('return globalThis.__dfoFonts.pixelLetters('))fnt=node;
  }
  assert.ok(block&&fnt);await page.addScriptTag({content:'globalThis.plaqueFontProbe={source:'+transformed.text.slice(block.start,block.end)+',fromFnt:'+transformed.text.slice(fnt.start,fnt.end)+'};'});
  report.pixelLetters=await page.evaluate(()=>{
   const p=plaqueFontProbe.source,other=plaqueFontProbe.fromFnt({fixedHeight:7,getGlyphPixels(){throw Error('Old cached pixel font used')}});
   const rows={};for(const char of ['A','G','Ф','Я']){const code=char.codePointAt(0),width=p.widthOf(code);rows[char]=Array.from({length:p.height},(_,y)=>Array.from({length:width},(_,x)=>p.lit(code,x,y)?'#':'.').join(''))}
   return {height:p.height,shared:p===other,rows};
  });
  assert.equal(report.pixelLetters.shared,true);for(const rows of Object.values(report.pixelLetters.rows))assert.ok(rows.some(row=>row.includes('#')));
  report.errors=errors;assert.deepEqual(errors,[]);
  if(process.env.DFO_FONT_POLICY_REPORT)fs.writeFileSync(process.env.DFO_FONT_POLICY_REPORT,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
