'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {mapFont,css}=require('../src/mod/page/dfo_fonts.js');
const {transformFonts,preparePage}=require('../src/mod/fonts-transform.cjs');
const {transformAsset,injectPage,EXPECTED}=require('../src/mod/transforms.cjs');
test('font mapping preserves canvas size and emphasis while replacing legacy families',()=>{
 for(const value of ['italic 700 24px Georgia,serif','12px monospace','400 64px Cormorant']){
  const mapped=mapFont(value);assert.match(mapped,/DFO Gabin/);assert.doesNotMatch(mapped,/Georgia|monospace|Cormorant/);assert.equal(mapFont(mapped),mapped);
 }
 assert.match(mapFont('italic 700 24px Georgia'),/^italic 700 24px /);
 assert.match(mapFont("20px 'DFO Wolga',Georgia"),/DFO Wolga/);
 assert.equal(mapFont('not a font'),'not a font');
 assert.match(css('../dfo-mod/fonts/'),/@layer dfo-community-fonts/);
});
test('entry modules wait for local fonts, keep relative URL resolution and remove remote font links',()=>{
 const html='<head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Pixelify"><script type="module" crossorigin src="./assets/game.js"></script></head>';
 const out=preparePage(html);assert.doesNotMatch(out,/fonts.googleapis/);assert.match(out,/await globalThis\.__dfoFonts\?\.ready/);assert.match(out,/new URL\("\.\/assets\/game\.js",document.baseURI\)/);assert.match(out,/crossorigin/);
 const on=injectPage(html,'../',{fonts:true,nearbyLoot:false,dungeons:false,itemCards:false,ru:false});
 assert.ok(on.indexOf('dfo-mod/dfo_fonts.js')<on.indexOf('await globalThis'));assert.equal(injectPage(on,'../',{fonts:true}),on);
 const off=injectPage(html,'../',{fonts:false,nearbyLoot:false,dungeons:false,itemCards:false,ru:false});assert.doesNotMatch(off,/dfo_fonts|await globalThis/);
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
   assert.equal(transformFonts('assets/textWorker-probe.js',src,[]),src);
   if(log.some(([id])=>id==='fonts.classic')){
    const head=/function [\w$]+\([\w$]+,[\w$]+,[\w$]+,[\w$]+,[\w$]+,[\w$]+=1,[\w$]+=\[1,1,1,1\]\)\{/.exec(src)[0];
    const bad=src.replace(head,head.replace('=1,','=2,')),notes=[];assert.notEqual(bad,src);assert.equal(transformFonts('assets/'+file,bad,notes),bad);assert.ok(notes.some(([id])=>id.includes('!error')));
   }
  }
  assert.deepEqual(found.sort(),[...EXPECTED.fonts].sort());
 }
});
