'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {mapFont,css}=require('../src/mod/page/dfo_fonts.js');
const {transformFonts,preparePage,stripFaces}=require('../src/mod/fonts-transform.cjs');
const {transformAsset,injectPage,EXPECTED}=require('../src/mod/transforms.cjs');
test('font mapping preserves canvas size and emphasis while replacing legacy families',()=>{
 for(const value of ['italic 700 24px Georgia,serif','12px monospace','400 64px Cormorant']){
  const mapped=mapFont(value);assert.match(mapped,/DFO Gabin/);assert.doesNotMatch(mapped,/Georgia|monospace|Cormorant/);assert.equal(mapFont(mapped),mapped);
 }
 assert.match(mapFont('italic 700 24px Georgia'),/^italic 700 24px /);
 assert.match(mapFont("20px 'DFO Wolga',Georgia"),/DFO Wolga/);
 assert.match(mapFont("20px 'DFO Greengoth',Georgia"),/DFO Greengoth/);
 assert.match(mapFont("italic 600 24px 'DFO Hangyaku',serif"),/^italic 600 24px 'DFO Hangyaku'/);
 assert.match(mapFont("20px 'DFO Flexi',Georgia"),/^20px 'DFO Flexi'/);
 assert.match(mapFont('64px "dfu-sdf-FONT0000"'),/^64px 'DFO Greengoth'/);
 assert.match(mapFont('64px "dfu-sdf-FONT0004"'),/^64px 'DFO Greengoth'/);
 assert.equal(mapFont('not a font'),'not a font');
 const sheet=css('../dfo-mod/fonts/');
 assert.match(sheet,/@layer dfo-community-fonts/);
 assert.match(sheet,/--brand:'DFO Greengoth'/);
 assert.match(sheet,/--daggerfall-online-text-font:'DFO Gabin'/);
 assert.match(sheet,/--pixel-font:'DFO Gabin'/);
 assert.match(sheet,/--dfo-font-num:'DFO Flexi'/);
 assert.match(sheet,/\.port-bank \.port-title[\s\S]*?font-family:'DFO Greengoth'/);
 assert.match(sheet,/\.dfo-bank-coin-val[\s\S]*?\.dfo-sm-res-val[\s\S]*?font-family:'DFO Flexi'/);
 assert.match(sheet,/\.setline-name[\s\S]*?font-family:'DFO Ritalin'/);
 assert.match(sheet,/\.dfo-fate-plea[\s\S]*?\.dfo-gm-p[\s\S]*?font-family:'DFO Flow'/);
 assert.match(sheet,/\[data-dfo-font="power"\][\s\S]*?font-family:'DFO Wolga'/);
 const workerRes=transformAsset('assets/imperialPrebuildWorker-12345678.js','@font-face{font-family:Old;src:url(old.woff2)}const x="[unbound]";',{fonts:true,ru:true,dungeons:true,nearbyLoot:true,marks:true,inventory:true,itemCards:true});
 assert.ok(workerRes.log.every(([id])=>id.startsWith('fonts.')&&!id.includes('!error')),'Workers must run only font transforms without errors');
 assert.match(workerRes.text,/dfo_font_preset\.js/);
});
test('entry modules wait for local fonts, keep relative URL resolution and remove remote font links',()=>{
 const html='<head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Pixelify"><script type="module" crossorigin src="./assets/game.js"></script></head>';
 const out=preparePage(html);assert.doesNotMatch(out,/fonts.googleapis/);assert.match(out,/await globalThis\.__dfoFonts\?\.ready/);assert.match(out,/new URL\("\.\/assets\/game\.js",document.baseURI\)/);assert.match(out,/crossorigin/);
 const on=injectPage(html,'../',{fonts:true,nearbyLoot:false,dungeons:false,itemCards:false,ru:false});
 assert.ok(on.indexOf('dfo-mod/dfo_fonts.js')<on.indexOf('await globalThis'));assert.equal(injectPage(on,'../',{fonts:true}),on);
 const off=injectPage(html,'../',{fonts:false,nearbyLoot:false,dungeons:false,itemCards:false,ru:false});assert.doesNotMatch(off,/dfo_fonts|await globalThis/);
});
test('classic WebGL measure and draw skip control chars and agree on missing printable glyphs',async()=>{
 const {install}=require('../src/mod/page/dfo_fonts.js');
 const drawn=[];
 const fakeFace={
  glyphs:new Map([[65,{advance:10,offX:0,offY:8,w:8,h:10,src:{u0:0,v0:0,u1:1,v1:1}}],[63,{advance:7,offX:0,offY:8,w:6,h:10,src:{u0:0,v0:0,u1:1,v1:1}}]]),
  pages:[],
  add(){},
  flush(){return 0;},
  texOf(){return 'tex0';},
 };
 const fakeWin={
  document:{
   baseURI:'dagger://game/play/index.html',
   currentScript:{src:'dagger://game/dfo-mod/dfo_fonts.js'},
   head:{append(){}},
   querySelector(){return null;},
   createElement(){return {getContext(){return {font:'',measureText(){return {width:10,actualBoundingBoxAscent:50,actualBoundingBoxDescent:14};}};}};},
   fonts:{load:async()=>[{}],check:()=>true,add(){},[Symbol.iterator]:function*(){}},
  },
  FontFace:class{constructor(f,s){this.family=f;this.src=s;}},
  __DFO_MOD_CFG__:{fonts:{revision:'1.30.0'}},
 };
 install(fakeWin);
 await fakeWin.__dfoFonts.ready;
 fakeWin.__dfoFonts.register({glyphFace:()=>fakeFace});
 const renderer={textures:new Map(),drawScreenQuadRun(tex,run){drawn.push(...run);}};
 const fnt={fixedHeight:9,fontName:'FONT0003',glyphWidth(){return 5;}};
 const font=fakeWin.__dfoFonts.makeFont(renderer,fnt,'FONT0003');
 const mCtrl=fakeWin.__dfoFonts.measure(fnt,'A\n\r\tA');
 const dCtrl=fakeWin.__dfoFonts.draw(renderer,font,'A\n\r\tA',0,0);
 assert.equal(drawn.length,2,'control chars must not emit fallback ? quads');
 assert.equal(dCtrl,mCtrl,'measure and draw widths must match with control chars');
 drawn.length=0;
 const mMiss=fakeWin.__dfoFonts.measure(fnt,'A\u2603A');
 const dMiss=fakeWin.__dfoFonts.draw(renderer,font,'A\u2603A',0,0);
 assert.equal(drawn.length,3,'printable missing glyph uses fallback ? quad');
 assert.equal(dMiss,mMiss,'measure and draw widths must match with missing printable glyph');
});
test('all font hooks match actual assets with and without Russian, parse and apply once',{skip:!process.env.DFO_BUILD_DIR},()=>{
 const acorn=require(process.env.DFO_ACORN_MODULE||'acorn');
 for(const ru of [false,true]){
  const found=[],dir=path.join(process.env.DFO_BUILD_DIR,'assets');
  for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.js'))){
   const src=fs.readFileSync(path.join(dir,file),'utf8'),ctx={fonts:true,ru,nearbyLoot:false,dungeons:false,itemCards:false,marks:false};
   const result=transformAsset('assets/'+file,src,ctx),log=result.log.filter(([id])=>id.startsWith('fonts.'));
   if(!log.length)continue;
   assert.equal(log.some(([id])=>id.includes('!error')),false,JSON.stringify(log));found.push(...log.filter(([,n])=>n>0).map(([id])=>id));
   acorn.parse(result.text,{ecmaVersion:'latest',sourceType:'module'});
   assert.equal(transformFonts('assets/'+file,result.text,[]),result.text);
   const worker=transformFonts('assets/textWorker-probe.js',src,[]);assert.ok(worker.includes(stripFaces(src).text));assert.match(worker,/installWorker/);acorn.parse(worker,{ecmaVersion:'latest',sourceType:'module'});
   if(log.some(([id])=>id==='fonts.classic')){
    const head=/function [\w$]+\([\w$]+,[\w$]+,[\w$]+,[\w$]+,[\w$]+,[\w$]+=1,[\w$]+=\[1,1,1,1\]\)\{/.exec(src)[0];
    const bad=src.replace(head,head.replace('=1,','=2,')),notes=[];assert.notEqual(bad,src);const failed=transformFonts('assets/'+file,bad,notes);assert.doesNotMatch(failed,/register\(\{glyphFace:/);assert.ok(notes.some(([id])=>id.includes('fonts.classic!error')));acorn.parse(failed,{ecmaVersion:'latest',sourceType:'module'});
   }
   if(log.some(([id])=>id==='fonts.bookClassic')){
    const bad=src.replaceAll('_drawFallback(', '_removedBookFallback('),notes=[];
    assert.equal(transformFonts('assets/'+file,bad,notes),bad);assert.ok(notes.some(([id])=>id.includes('!error')));
   }
   if(log.some(([id])=>id==='fonts.bookCanvas')){
    const bad=src.replace('globalThis.document?.fonts','globalThis.document?.oldFonts'),notes=[];
    assert.equal(transformFonts('assets/'+file,bad,notes),bad);assert.ok(notes.some(([id])=>id.includes('!error')));
   }
  }
  assert.deepEqual([...new Set(found)].sort(),[...EXPECTED.fonts].sort());
 }
});
