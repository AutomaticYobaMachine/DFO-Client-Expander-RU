#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
process.env.DFO_GLOBAL_FONTS='1';
const {chromium}=require(process.env.DFO_PLAYWRIGHT_MODULE||'playwright'),{server}=require('./test-item-cards-browser.cjs');
async function main(){
 let browser;await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.DFO_CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.stack));
  await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();external.push(r.request().url());return r.abort()});
  await page.goto('http://127.0.0.1:'+server.address().port+'/?ru&online');await page.waitForFunction(()=>window.ready&&window.nativeFontTest);
  assert.equal(await page.evaluate(()=>__dfoFonts.enabled),true);
  const bookAssets=fs.readdirSync(path.join(process.env.DFO_BUILD_DIR,'assets'));
  const bookModules={classic:bookAssets.find(f=>/^bookReader-.*\.js$/.test(f)),canvas:bookAssets.find(f=>/^enhancedBook-.*\.js$/.test(f))};
  assert.ok(bookModules.classic&&bookModules.canvas);
  await page.evaluate(async modules=>{await import('/assets/'+modules.classic);window.nativeCanvasBook=await import('/assets/'+modules.canvas)},bookModules);
  const report=await page.evaluate(async()=>{
   const panel=document.createElement('section');panel.id='font-gallery';panel.style.cssText='position:fixed;left:16px;top:16px;width:610px;padding:16px;background:#0e1013;color:#e9e4d9;border:1px solid #756346;z-index:999';
   panel.innerHTML='<h2 id="font-heading">ШРИФТЫ СООБЩЕСТВА · DFO Online</h2><p id="font-body">Игрок Dragonborn №5. Ёжик и йод. ~40 зол. [10–20] → ± × ∞</p><p style="font-family:Pixelify Sans">Текст с заданным в игре шрифтом тоже заменён.</p><label>Поиск <input value="Проверка латиницы и кириллицы"></label><button>Продолжить</button><p class="sigilbox"><span class="sigil-stage">Название сигила</span></p><p class="setbox"><span class="set-name">Название набора</span></p><p class="dfo-item-power-name">Легендарное свойство</p>';
   document.body.append(panel);
   const nested=document.createElement('span');nested.id='font-nested-heading';nested.textContent=' · вложенный заголовок';panel.querySelector('h2').append(nested);
   const nodes=[...panel.querySelectorAll('h2,p,input,button,.sigil-stage,.set-name,.dfo-item-power-name')].map(n=>({text:n.textContent||n.value,font:getComputedStyle(n).fontFamily}));
   const drawCanvas=document.createElement('canvas');drawCanvas.id='font-classic';drawCanvas.width=580;drawCanvas.height=290;panel.append(drawCanvas);
   const output=drawCanvas.getContext('2d'),draws=[],textures=new Map();let uploads=0,releases=0;
   const makeRenderer=(target=output)=>{const owned=new Set(),cache=new Map();return {
    textures:cache,loseTextures(){cache.clear();owned.clear()},drawScreenQuad(){},
    uploadTexture(kind,key,image){uploads++;const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const g=c.getContext('2d');g.putImageData(new ImageData(new Uint8ClampedArray(image.colors.buffer,image.colors.byteOffset,image.colors.byteLength),image.width,image.height),0,0);const tex={canvas:c,key};cache.set(kind+'_'+key,tex);textures.set(tex,true);owned.add(tex);return tex;},
    releaseTexture(kind,key){releases++;const tex=cache.get(kind+'_'+key);owned.delete(tex);cache.delete(kind+'_'+key)},
    drawScreenQuadRun(tex,run,color){if(!owned.has(tex))throw Error('Wrong atlas owner');draws.push({glyphs:run.length,color:[...color]});for(const q of run){const s=q.src,d=q.dst;if(d.x>=0&&d.y>=0)target.drawImage(tex.canvas,s.u0*tex.canvas.width,s.v0*tex.canvas.height,(s.u1-s.u0)*tex.canvas.width,(s.v1-s.v0)*tex.canvas.height,d.x,d.y,d.w,d.h)}},
   }};
   const renderer=makeRenderer(),classic=[];
   for(let i=0;i<5;i++){
    const bytes=new Uint8Array(await fetch('/arena2/FONT000'+i+'.FNT').then(r=>r.arrayBuffer()));
    const fnt=new nativeFontTest.FntFile().load(bytes),font=nativeFontTest.makeFont(renderer,fnt,'FONT000'+i);
    const text='FONT000'+i+': Герой Dragonborn №5 — Ёжик, 12345',before=draws.length;
    const measured=nativeFontTest.measure(fnt,text),scale=Math.min(3,570/measured),drawn=nativeFontTest.draw(renderer,font,text,4,8+i*48,scale,[1,1,1,1]);
    const height=fnt.fixedHeight;nativeFontTest.makeFont(renderer,fnt,'FONT000'+i);if(fnt.fixedHeight!==height)throw Error('Title increase applied twice');
    classic.push({name:fnt.fontName,height:fnt.fixedHeight,bookHeight:__dfoFonts.bookFont(font).fnt.fixedHeight,scale,measured,drawn,batches:draws.length-before,nativeBitmapUnused:font.tex===null});
   }
   const checkCanvas=document.createElement('canvas'),ctx=checkCanvas.getContext('2d');ctx.fillText('По умолчанию',1,10);const defaultFont=ctx.font;
   checkCanvas.width=200;ctx.fillText('После сброса',1,10);const resetFont=ctx.font;
   checkCanvas.width=200;ctx.font='';ctx.fillText('После пустого значения',1,10);const invalidFont=ctx.font;
   ctx.font='italic 700 24px Georgia';const mapped=ctx.font;
   const off=new OffscreenCanvas(20,20).getContext('2d');off.font='12px Arial';off.measureText('Ёё');const offscreen=off.font;
   const fnt=new nativeFontTest.FntFile().load(new Uint8Array(await fetch('/arena2/FONT0003.FNT').then(r=>r.arrayBuffer()))),other=makeRenderer();
   const font=nativeFontTest.makeFont(other,fnt,'FONT0003');nativeFontTest.draw(other,font,'Другой renderer',-1000,-1000,2);
   other.loseTextures();nativeFontTest.draw(other,font,'После сброса',-1000,-1000,2);
   const warm=__dfoFonts.stats(),uploaded=uploads,hotStart=performance.now();
   for(let n=0;n<1000;n++)nativeFontTest.draw(other,font,'Другой renderer',-1000,-1000,1);
   const hotMs=performance.now()-hotStart,hot=__dfoFonts.stats();
   window.fontUploaded={warm,hot,uploadsBefore:uploaded,uploadsAfter:uploads};
   probe.cases.fontShowcase={...probe.cases.combined,enchantments:[{type:10,param:5},{type:3,param:0},{type:2,param:50}]};probe.show('fontShowcase');
   const originalFont=font,bookFont=__dfoFonts.bookFont(originalFont),bookAgain=__dfoFonts.bookFont(originalFont);
   const bookLines=[{text:'Книга о герое Dragonborn. Ёжик и йод. '+ 'Длинный текст проверяет переносы строк. '.repeat(8),font:0},...Array.from({length:5},(_,i)=>({text:'Другой размер: '+i,font:i+1}))];
   const placed=nativeBookReader.place(bookLines,()=>originalFont,300);
   const classicBook={role:bookFont.fnt.dfoFontRole,stable:bookAgain===bookFont,idempotent:__dfoFonts.bookFont(bookFont)===bookFont,sharedFontUnchanged:originalFont.fnt.dfoFontRole===undefined,fonts:placed.placed.map(p=>p.face.fnt.dfoFontRole),rows:placed.placed.flatMap(p=>p.rows.map(text=>({text,width:nativeFontTest.measure(p.face.fnt,text)}))),height:placed.maxHeight};
   const reader=new nativeBookReader.Reader({title:'Книга испытаний',author:'DFO RU',content:bookLines[0].text});
   reader.draw(makeRenderer(document.createElement('canvas').getContext('2d')),{width:580,height:290},originalFont,1);
   const cf=nativeCanvasBook.canvasFace(24),paint=document.createElement('canvas');paint.width=580;paint.height=100;const pg=paint.getContext('2d');
   nativeCanvasBook.paintRow(pg,cf,'Книга Book: Ёжик и йод.',0,0);const canvasBook={family:cf.fnt.family,font:pg.font,measured:nativeFontTest.measure(cf.fnt,'Книга Book: Ёжик и йод.'),nativeWidth:pg.measureText('Книга Book: Ёжик и йод.').width};
   ctx.font='16px Georgia';ctx.measureText('Текст');const beforeCache=__dfoFonts.stats().canvasChanges;
   for(let i=0;i<1000;i++){ctx.font='16px Georgia';ctx.measureText('Текст')}
   const repeatedFontAssignments=__dfoFonts.stats().canvasChanges-beforeCache;
   ctx.save();ctx.font=cf.fnt.font;ctx.restore();ctx.measureText('После restore');const restored=ctx.font;
   const registrations={};for(const face of document.fonts)if(face.family.startsWith('DFO '))registrations[face.family]=(registrations[face.family]||0)+1;
   const frame=document.createElement('iframe');document.body.append(frame);const proto=frame.contentWindow.CanvasRenderingContext2D.prototype,nativeSet=Object.getOwnPropertyDescriptor(proto,'font').set,nativeMeasure=proto.measureText;
   const baseline=()=>{for(let i=0;i<10000;i++){nativeSet.call(ctx,'16px "DFO Gabin"');nativeMeasure.call(ctx,'Текст Dragonborn')}},wrapped=()=>{for(let i=0;i<10000;i++){ctx.font='16px Georgia';ctx.measureText('Текст Dragonborn')}};
   baseline();wrapped();const time=fn=>{const t=performance.now();fn();return performance.now()-t};const baseTimes=[],wrappedTimes=[];for(let i=0;i<5;i++){baseTimes.push(time(baseline));wrappedTimes.push(time(wrapped))}frame.remove();
   return {nodes,classic,defaultFont,resetFont,invalidFont,mapped,offscreen,uploads,releases,...fontUploaded,books:{classic:classicBook,canvas:canvasBook},registrations,repeatedFontAssignments,restored,performance:{hot1000NamesMs:hotMs,canvas10000:{nativeMs:baseTimes,wrappedMs:wrappedTimes},scope:'Recording renderer and native canvas calls; not live-game FPS'}};
  });
  for(const n of report.nodes){assert.match(n.font,/DFO /,n.text);assert.doesNotMatch(n.font,/Pixelify|Cormorant|Barlow|Jacquard|Alagard/)}
  for(const row of report.classic){assert.ok(row.measured>0);assert.ok(Math.abs(row.drawn-row.measured*row.scale)<.0001,JSON.stringify(row));assert.ok(row.batches<=2);assert.equal(row.nativeBitmapUnused,true)}
  assert.deepEqual(report.classic.map(r=>r.height),[13,14,5,7,8]);
  assert.deepEqual(report.classic.map(r=>r.bookHeight),[15,19,7,9,8],'Hangyaku is enlarged once from original FNT heights');
  for(const key of ['defaultFont','resetFont','invalidFont','mapped','offscreen'])assert.match(report[key],/DFO Gabin/);
  assert.match(report.mapped,/24px/);assert.match(report.mapped,/italic/);
  assert.equal(report.uploadsBefore,report.uploadsAfter,'Hot strings cannot re-upload glyph atlases');
  assert.equal(report.hot.classicBatches-report.warm.classicBatches,1000,'One draw batch per name, not per glyph');
  assert.deepEqual(report.hot.failures,[]);assert.deepEqual(errors,[]);assert.deepEqual(external,[],'No old remote font requests');
  assert.equal(report.books.classic.role,'book');assert.equal(report.books.classic.stable,true);assert.equal(report.books.classic.idempotent,true);assert.equal(report.books.classic.sharedFontUnchanged,true);
  for(const role of report.books.classic.fonts)assert.equal(role,'book');
  for(const row of report.books.classic.rows)assert.ok(row.width<=301,JSON.stringify(row));
  assert.match(report.books.canvas.family,/DFO Hangyaku/);assert.match(report.books.canvas.font,/DFO Hangyaku/);assert.equal(report.books.canvas.measured,report.books.canvas.nativeWidth);
  assert.equal(report.repeatedFontAssignments,0,'Repeated canvas font assignments use the cache');assert.match(report.restored,/DFO Gabin/);
  assert.equal(Object.keys(report.registrations).length,8);for(const count of Object.values(report.registrations))assert.equal(count,1,'One registration per font');
  const cdp=await page.context().newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const document=await cdp.send('DOM.getDocument');report.platform=[];
  for(const selector of ['#font-heading','#font-nested-heading','#font-body','.pack-who','.dfo-item-title h3']){const node=await cdp.send('DOM.querySelector',{nodeId:document.root.nodeId,selector});assert.ok(node.nodeId,selector);const result=await cdp.send('CSS.getPlatformFontsForNode',{nodeId:node.nodeId});report.platform.push({selector,fonts:result.fonts});for(const f of result.fonts)assert.equal(f.isCustomFont,true,'Ordinary text must use the supplied files: '+f.familyName);if(selector!=='#font-body')assert.ok(result.fonts.some(f=>/Greengoth/.test(f.familyName)),selector+': heading letters must use Greengoth; punctuation may use a supplied fallback')}
  report.errors=errors;report.external=external;
  const disabled=await browser.newPage();await disabled.setContent('<script>window.__DFO_MOD_CFG__={fonts:{enabled:false}};</script>');
  await disabled.addScriptTag({path:path.join(process.env.DFO_CARD_MOD_DIR||path.resolve(__dirname,'../src/mod'),'page/dfo_fonts.js')});
  report.disabled=await disabled.evaluate(()=>{const c=document.createElement('canvas').getContext('2d');c.font='14px Georgia';return {installed:!!window.__dfoFonts,font:c.font,style:!!document.getElementById('dfo-community-fonts')}});
  assert.equal(report.disabled.installed,false);assert.equal(report.disabled.style,false);assert.match(report.disabled.font,/Georgia/);await disabled.close();
  if(process.env.DFO_SCREENSHOT_DIR){fs.mkdirSync(process.env.DFO_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.DFO_SCREENSHOT_DIR,'global-fonts.png')})}
  await page.evaluate(()=>{
   const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:1000';document.body.append(canvas);
   const model=new nativeBookReader.Reader({title:'Книга испытаний',author:'Сообщество DFO RU',content:('Ёжик и йод. Герой Dragonborn спускается в древние катакомбы. '+ 'Здесь мы проверяем русский текст, переносы строк и новое начертание книги. ').repeat(60)});
   const proto=CanvasRenderingContext2D.prototype,original=proto.fillText,fonts=new Set();let paints=0;
   proto.fillText=function(...args){const result=original.apply(this,args);fonts.add(this.font);paints++;return result};
   const beforeFaces=globalThis.__bookFaceCalls||0,view=nativeCanvasBook.mountEnhancedBook(canvas,{model});window.bookRenderingTest={view,canvas,fonts,beforeFaces,restore(){proto.fillText=original},get paints(){return paints}};
  });
  try{
   for(let i=0;i<18;i++){await page.evaluate(()=>bookRenderingTest.view.frame());await page.waitForTimeout(100)}
   report.books.window=await page.evaluate(()=>({bodySize:nativeCanvasBook.bodySize(nativeCanvasBook.leafSize(innerWidth*devicePixelRatio,innerHeight*devicePixelRatio).ph,devicePixelRatio),spreads:bookRenderingTest.view.spreads(),fonts:[...bookRenderingTest.fonts],paints:bookRenderingTest.paints,facesBuilt:globalThis.__bookFaceCalls-bookRenderingTest.beforeFaces}));
   assert.equal(report.books.window.bodySize,35,'Full HD book body grows from 26 to 35 px');assert.ok(report.books.window.fonts.some(f=>/\b35px\b/.test(f)),'Enlarged body reaches the actual page painter');assert.ok(report.books.window.spreads>0);assert.ok(report.books.window.paints>0);for(const f of report.books.window.fonts)assert.match(f,/DFO Hangyaku/);
   assert.equal(report.books.window.facesBuilt,6,'Six book cuts, built once with fonts already loaded');
   if(process.env.DFO_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.DFO_SCREENSHOT_DIR,'book-fonts.png')});
   await page.setViewportSize({width:1280,height:720});
   for(let i=0;i<3;i++)await page.evaluate(()=>bookRenderingTest.view.frame());
   report.books.window.facesAfterResize=await page.evaluate(()=>globalThis.__bookFaceCalls-bookRenderingTest.beforeFaces);
   assert.equal(report.books.window.facesAfterResize,12,'Resize rebuilds once, steady frames reuse it');
  }finally{await page.evaluate(()=>{bookRenderingTest.view.destroy();bookRenderingTest.restore();bookRenderingTest.canvas.remove();delete window.bookRenderingTest})}
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  const damaged=await browser.newPage();
  await damaged.route('**/book-font-text.ttf*',r=>r.abort());await damaged.goto('http://127.0.0.1:'+server.address().port+'/?ru&online');
  await damaged.waitForFunction(()=>window.ready&&window.__dfoFonts);
  report.missingBookFont=await damaged.evaluate(()=>({ready:window.ready,enabled:__dfoFonts.enabled,failures:__dfoFonts.stats().failures.map(f=>f.font)}));
  assert.equal(report.missingBookFont.ready,true);assert.equal(report.missingBookFont.enabled,true);assert.deepEqual(report.missingBookFont.failures,['Hangyaku']);await damaged.close();
  if(process.env.DFO_FONT_REPORT)fs.writeFileSync(process.env.DFO_FONT_REPORT,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
