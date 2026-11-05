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
  const report=await page.evaluate(async()=>{
   const panel=document.createElement('section');panel.id='font-gallery';panel.style.cssText='position:fixed;left:16px;top:16px;width:610px;padding:16px;background:#0e1013;color:#e9e4d9;border:1px solid #756346;z-index:999';
   panel.innerHTML='<h2 id="font-heading">ШРИФТЫ СООБЩЕСТВА · DFO Online</h2><p id="font-body">Игрок Dragonborn №5. Ёжик и йод. ~40 зол. [10–20] → ± × ∞</p><p style="font-family:Pixelify Sans">Текст с заданным в игре шрифтом тоже заменён.</p><label>Поиск <input value="Проверка латиницы и кириллицы"></label><button>Продолжить</button><p class="sigilbox"><span class="sigil-stage">Название сигила</span></p><p class="setbox"><span class="set-name">Название набора</span></p><p class="dfo-item-power-name">Легендарное свойство</p>';
   document.body.append(panel);
   const nodes=[...panel.querySelectorAll('h2,p,input,button,.sigil-stage,.set-name,.dfo-item-power-name')].map(n=>({text:n.textContent||n.value,font:getComputedStyle(n).fontFamily}));
   const drawCanvas=document.createElement('canvas');drawCanvas.id='font-classic';drawCanvas.width=580;drawCanvas.height=290;panel.append(drawCanvas);
   const output=drawCanvas.getContext('2d'),draws=[],textures=new Map();let uploads=0,releases=0;
   const makeRenderer=()=>{const owned=new Set(),cache=new Map();return {
    textures:cache,loseTextures(){cache.clear();owned.clear()},
    uploadTexture(kind,key,image){uploads++;const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const g=c.getContext('2d');g.putImageData(new ImageData(new Uint8ClampedArray(image.colors.buffer,image.colors.byteOffset,image.colors.byteLength),image.width,image.height),0,0);const tex={canvas:c,key};cache.set(kind+'_'+key,tex);textures.set(tex,true);owned.add(tex);return tex;},
    releaseTexture(kind,key){releases++;const tex=cache.get(kind+'_'+key);owned.delete(tex);cache.delete(kind+'_'+key)},
    drawScreenQuadRun(tex,run,color){if(!owned.has(tex))throw Error('Wrong atlas owner');draws.push({glyphs:run.length,color:[...color]});for(const q of run){const s=q.src,d=q.dst;if(d.x>=0&&d.y>=0)output.drawImage(tex.canvas,s.u0*tex.canvas.width,s.v0*tex.canvas.height,(s.u1-s.u0)*tex.canvas.width,(s.v1-s.v0)*tex.canvas.height,d.x,d.y,d.w,d.h)}},
   }};
   const renderer=makeRenderer(),classic=[];
   for(let i=0;i<5;i++){
    const bytes=new Uint8Array(await fetch('/arena2/FONT000'+i+'.FNT').then(r=>r.arrayBuffer()));
    const fnt=new nativeFontTest.FntFile().load(bytes),font=nativeFontTest.makeFont(renderer,fnt,'FONT000'+i);
    const text='FONT000'+i+': Герой Dragonborn №5 — Ёжик, 12345',before=draws.length;
    const measured=nativeFontTest.measure(fnt,text),scale=Math.min(3,570/measured),drawn=nativeFontTest.draw(renderer,font,text,4,8+i*48,scale,[1,1,1,1]);
    classic.push({name:fnt.fontName,height:fnt.fixedHeight,scale,measured,drawn,batches:draws.length-before,nativeBitmapUnused:font.tex===null});
   }
   const checkCanvas=document.createElement('canvas'),ctx=checkCanvas.getContext('2d');ctx.fillText('По умолчанию',1,10);const defaultFont=ctx.font;
   checkCanvas.width=200;ctx.fillText('После сброса',1,10);const resetFont=ctx.font;
   checkCanvas.width=200;ctx.font='';ctx.fillText('После пустого значения',1,10);const invalidFont=ctx.font;
   ctx.font='italic 700 24px Georgia';const mapped=ctx.font;
   const off=new OffscreenCanvas(20,20).getContext('2d');off.font='12px Arial';off.measureText('Ёё');const offscreen=off.font;
   const fnt=new nativeFontTest.FntFile().load(new Uint8Array(await fetch('/arena2/FONT0003.FNT').then(r=>r.arrayBuffer()))),other=makeRenderer();
   const font=nativeFontTest.makeFont(other,fnt,'FONT0003');nativeFontTest.draw(other,font,'Другой renderer',4,260,2);
   other.loseTextures();nativeFontTest.draw(other,font,'После сброса',4,260,2);
   const warm=__dfoFonts.stats(),uploaded=uploads;
   for(let n=0;n<1000;n++)nativeFontTest.draw(other,font,'Другой renderer',-1000,-1000,1);
   const hot=__dfoFonts.stats();
   window.fontUploaded={warm,hot,uploadsBefore:uploaded,uploadsAfter:uploads};
   probe.cases.fontShowcase={...probe.cases.combined,enchantments:[{type:10,param:5},{type:3,param:0},{type:2,param:50}]};probe.show('fontShowcase');
   return {nodes,classic,defaultFont,resetFont,invalidFont,mapped,offscreen,uploads,releases,...fontUploaded};
  });
  for(const n of report.nodes){assert.match(n.font,/DFO /,n.text);assert.doesNotMatch(n.font,/Pixelify|Cormorant|Barlow|Jacquard|Alagard/)}
  for(const row of report.classic){assert.ok(row.measured>0);assert.ok(Math.abs(row.drawn-row.measured*row.scale)<.0001,JSON.stringify(row));assert.ok(row.batches<=2);assert.equal(row.nativeBitmapUnused,true)}
  for(const key of ['defaultFont','resetFont','invalidFont','mapped','offscreen'])assert.match(report[key],/DFO Gabin/);
  assert.match(report.mapped,/24px/);assert.match(report.mapped,/italic/);
  assert.equal(report.uploadsBefore,report.uploadsAfter,'Hot strings cannot re-upload glyph atlases');
  assert.equal(report.hot.classicBatches-report.warm.classicBatches,1000,'One draw batch per name, not per glyph');
  assert.deepEqual(report.hot.failures,[]);assert.deepEqual(errors,[]);assert.deepEqual(external,[],'No old remote font requests');
  const cdp=await page.context().newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const document=await cdp.send('DOM.getDocument');report.platform=[];
  for(const selector of ['#font-heading','#font-body']){const node=await cdp.send('DOM.querySelector',{nodeId:document.root.nodeId,selector});const result=await cdp.send('CSS.getPlatformFontsForNode',{nodeId:node.nodeId});report.platform.push({selector,fonts:result.fonts});for(const f of result.fonts)assert.equal(f.isCustomFont,true,'Ordinary text must use the supplied files: '+f.familyName)}
  report.errors=errors;report.external=external;
  const disabled=await browser.newPage();await disabled.setContent('<script>window.__DFO_MOD_CFG__={fonts:{enabled:false}};</script>');
  await disabled.addScriptTag({path:path.join(process.env.DFO_CARD_MOD_DIR||path.resolve(__dirname,'../src/mod'),'page/dfo_fonts.js')});
  report.disabled=await disabled.evaluate(()=>{const c=document.createElement('canvas').getContext('2d');c.font='14px Georgia';return {installed:!!window.__dfoFonts,font:c.font,style:!!document.getElementById('dfo-community-fonts')}});
  assert.equal(report.disabled.installed,false);assert.equal(report.disabled.style,false);assert.match(report.disabled.font,/Georgia/);await disabled.close();
  if(process.env.DFO_FONT_REPORT)fs.writeFileSync(process.env.DFO_FONT_REPORT,JSON.stringify(report,null,2)+'\n');
  if(process.env.DFO_SCREENSHOT_DIR){fs.mkdirSync(process.env.DFO_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.DFO_SCREENSHOT_DIR,'global-fonts.png')})}
  console.log(JSON.stringify(report,null,2));
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
