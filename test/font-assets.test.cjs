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
test('protocol returns owned fonts on legacy paths and launcher host, with a real off switch',async()=>{
 const {wrap}=require('../src/mod/hook.cjs'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'dfo-font-policy-'));
 try{
  fs.writeFileSync(path.join(temp,'dfo-mod.json'),JSON.stringify({ru:false,marks:false,nearbyLoot:false,dungeons:false,itemCards:false,fonts:true}));
  let calls=0;const original=async req=>{calls++;return new Response(req.url.endsWith('.css')?'@font-face{font-family:Old;src:url(old.woff2)}body{color:white}':'<head><script type="module" src="./app.js"></script></head>',{headers:{'Content-Type':'text/html'}})};
  const handle=wrap(original,{app:{getPath:()=>temp}}),body=fs.readFileSync(path.join(__dirname,'../src/mod/fonts/item-font-text.ttf'));
  for(const url of ['dagger://game/fonts/opendyslexic/opendyslexic-latin-400-normal.woff2','dagger://game/art/grimoire-ui/Fonts/FONT0003-SDF.ttf','dagger://launcher/fonts/PixelifySans-latin.woff2','dagger://launcher/dfo-mod/fonts/item-font-text.ttf']){
   const response=await handle(new Request(url));assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),body,url);
  }
  assert.equal(calls,0,'Original font bytes must never be delegated');
  const fnt=await handle(new Request('dagger://game/arena2/FONT0003.FNT'));assert.deepEqual(Buffer.from(await fnt.arrayBuffer()),replacement('FONT0003.FNT').body);
  const css=await handle(new Request('dagger://game/assets/theme.css'));assert.equal(await css.text(),'body{color:white}');
  const html=await handle(new Request('dagger://launcher/index.html'));const text=await html.text();assert.match(text,/dfo_font_data.js/);assert.match(text,/dfo_fonts.js/);assert.doesNotMatch(text,/dfo_dungeon|ru_locale/);
  assert.equal((await handle(new Request('dagger://game/%FF.ttf'))).status,400);
  fs.writeFileSync(path.join(temp,'dfo-mod.json'),JSON.stringify({fonts:false,ru:false}));
  const off=wrap(original,{app:{getPath:()=>temp}}),before=calls;await off(new Request('dagger://game/fonts/old.woff2'));assert.equal(calls,before+1);
 }finally{fs.rmSync(temp,{recursive:true,force:true})}
});
