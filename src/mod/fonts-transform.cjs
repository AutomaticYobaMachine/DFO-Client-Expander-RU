'use strict';
const {css}=require('./page/dfo_fonts.js');
const {stripFaces}=require('./font-assets.cjs');
const {transformCalibration}=require('./ui-calibration-transform.cjs');
function need(text,pattern){const m=pattern.exec(text);if(!m)throw Error('Unsupported font signature: '+pattern.source.slice(0,100));return m;}
function classic(text){
 const factory=need(text,/function ([\w$]+)\(([\w$]+),([\w$]+),([\w$]+)\)\{\3\.fontName\?\?=\4;/)[1];
 const measure=need(text,/function ([\w$]+)\(([\w$]+),([\w$]+)\)\{(?:if\(typeof globalThis\.__translate[^;]+;)?let [\w$]+=0;if\(/)[1];
 const draw=need(text,/function ([\w$]+)\(([\w$]+),([\w$]+),([\w$]+),([\w$]+),([\w$]+),([\w$]+)=1,([\w$]+)=\[1,1,1,1\]\)\{/)[1];
 const face=need(text,/([\w$]+)\(`"\$\{[\w$]+\}"`,\{raster:[\w$]+,page:[\w$]+,name:`\$\{[\w$]+\}#sdf`\}\)/)[1];
 return text+`\n;globalThis.__dfoFonts?.register({glyphFace:${face}});\n{const m=${measure},d=${draw},f=${factory};${measure}=function(...a){return globalThis.__dfoFonts?.measure(...a)??m(...a)};${draw}=function(...a){return globalThis.__dfoFonts?.draw(...a)??d(...a)};${factory}=function(...a){return globalThis.__dfoFonts?.makeFont(...a)??f(...a)}}\n`;
}
function classicBook(text){
 const place=need(text,/function ([\w$]+)\(([\w$]+),([\w$]+),([\w$]+)=[\w$]+\)\{let [\w$]+=\[\],[\w$]+=0;for\(let [\w$]+ of \2\)\{let [\w$]+=\3\([\w$]+\.font\)/)[1];
 const reader=need(text,/var ([\w$]+)=class\{constructor\([\w$]+\)\{this\.book=/)[1];
 need(text,/_drawFallback\([\w$]+,[\w$]+,[\w$]+,[\w$]+\)\{/);
 return text+`\n;{const p=${place},d=${reader}.prototype._drawFallback;${place}=function(lines,fontFor,...args){const own=x=>{const f=fontFor(x);return globalThis.__dfoFonts?.bookFont(f)??f};return globalThis.__dfoFonts?.enabled?globalThis.__dfoFonts.calibration.place(lines,own,...args):p(lines,own,...args)};${reader}.prototype._drawFallback=function(renderer,canvas,font,...args){return d.call(this,renderer,canvas,globalThis.__dfoFonts?.bookFont(font)??font,...args)}}\n`;
}
function canvasBook(text){
 const family="`Cormorant, 'Cormorant Garamond', Georgia, 'Times New Roman', serif`";
 need(text,/let [\w$]+=globalThis\.document\?\.fonts;/);
 if(!text.includes(family))throw Error('Unsupported book family');
 // Entry modules already waited for these local faces. The native async
 // web-font seam would otherwise paginate the whole book a second time.
 const paint=need(text,/([\w$]+) as paintRow/)[1];
 const ink=need(text,/([\w$]+) as rowInk/)[1];
 const body=need(text,/([\w$]+) as bodySize/)[1];
 return text.replace(family,'(globalThis.__dfoFonts?.stacks.book??'+family+')')
  .replace(/(let [\w$]+=)globalThis\.document\?\.fonts;/,'$1globalThis.__dfoFonts?.enabled?null:globalThis.document?.fonts;')
  +`\n;{const b=${body},p=${paint};${body}=function(...args){const px=b(...args);return globalThis.__dfoFonts?.enabled?(globalThis.__dfoFonts.bookSize?.(px)??px):px};${paint}=function(ctx,face,text,x,y,opts={}){if(!globalThis.__dfoFonts?.enabled)return p(ctx,face,text,x,y,opts);return globalThis.__dfoFonts.calibration.paint(ctx,face,text,x,y,{...opts,color:opts.color??${ink}(null)})||p(ctx,face,text,x,y,opts)}}\n`;
}
function transformFonts(rel,text,log){
 const stripped=stripFaces(text);if(stripped.count){text=stripped.text;log.push(['fonts.resources',stripped.count]);}
 if(/Worker-[^/]+\.js$/.test(rel)){
  if(text.includes('/*fonts.worker*/'))return text;
  log.push(['fonts.worker',1]);
  return `import '../dfo-mod/dfo_font_data.js?dfo=1.25.2';import '../dfo-mod/dfo_fonts.js?dfo=1.25.2';\nconst __dfoFontMessages=[];let __dfoFontReplay=false;const __dfoFontGate=e=>{if(!__dfoFontReplay){e.stopImmediatePropagation();__dfoFontMessages.push(e)}};globalThis.addEventListener('message',__dfoFontGate,true);await globalThis.__dfoFontTools.installWorker(globalThis,new URL('../dfo-mod/',import.meta.url).href).ready;\n`+text+`\n{const ch=new MessageChannel();ch.port1.onmessage=()=>{const e=__dfoFontMessages.shift();if(!e){globalThis.removeEventListener('message',__dfoFontGate,true);ch.port1.close();ch.port2.close();return}__dfoFontReplay=true;try{globalThis.dispatchEvent(new MessageEvent('message',{data:e.data,ports:e.ports,origin:e.origin,lastEventId:e.lastEventId}))}finally{__dfoFontReplay=false;ch.port2.postMessage(0)}};ch.port2.postMessage(0)}/*fonts.worker*/\n`;
 }
 const jobs=[];
 if(/^assets\/notify-[^/]+\.js$/.test(rel)&&text.includes('this.fixedWidth='))jobs.push(['fonts.fnt',text=>text.replace(/load\(([\w$]+)\)\{(?=let [\w$]+=new DataView\(\1\.buffer,\1\.byteOffset,\1\.byteLength\);this\.fixedWidth=)/,'load($1){$1=globalThis.__dfoFonts?.fntBytes($1)??$1;')]);
 if(text.includes('height:7,space:3,widthOf:'))jobs.push(['fonts.pixels',text=>{
  const block=need(text,/Object\.freeze\(\{height:7,space:3,widthOf:[\s\S]*?lit:[\s\S]*?\}\)/)[0];
  const map=need(block,/widthOf:[\w$]+=>[\w$]+\[/)[0].split('=>')[1].slice(0,-1);
  const definition=need(text,new RegExp(map.replace(/\$/g,'\\$')+'=Object\\.freeze\\(\\{'));
  let end=definition.index+definition[0].length,depth=1;
  for(;end<text.length&&depth;end++){if(text[end]==='{')depth++;else if(text[end]==='}')depth--;}
  if(depth||text[end]!==')')throw Error('Unsupported legacy pixel table');
  const fnt=need(text,/function ([\w$]+)\(([\w$]+)\)\{let [\w$]+=new Map,[\w$]+=[\w$]+=>\{let [\w$]+=[\w$]+-33;/);
  text=text.slice(0,definition.index)+map+'=Object.freeze({})'+text.slice(end+1);
  return text.replace(block,'(globalThis.__dfoFonts?.pixelLetters()??'+block+')').replace(fnt[0],fnt[0].replace('{let','{if(globalThis.__dfoFonts)return globalThis.__dfoFonts.pixelLetters('+fnt[2]+'.fixedHeight);let'));
 }]);
 if(text.includes('#sdf')&&text.includes('drawScreenQuadRun'))jobs.push(['fonts.classic',classic]);
 if(/^assets\/bookReader-[^/]+\.js$/.test(rel)&&text.includes('BOOK00I0.IMG'))jobs.push(['fonts.bookClassic',classicBook]);
 if(/^assets\/enhancedBook-[^/]+\.js$/.test(rel))jobs.push(['fonts.bookCanvas',canvasBook]);
 if(text.includes('dyslexic:`Dyslexic`'))jobs.push(['fonts.choices',text=>text.replace('Object.freeze({game:`Game`,sans:`Sans`,mono:`Monospace`,dyslexic:`Dyslexic`,system:`My font`})','Object.freeze({game:globalThis.__dfoUi?.t(`fonts.community`)??`Community fonts`})')]);
 if(text.includes('dagger-enhanced-fonts'))jobs.push(['fonts.network',text=>text.replace(/(function [\w$]+\([\w$]+=document,[\w$]+=globalThis\.location\?\.search\?\?``\)\{)/,'$1if(globalThis.__dfoFonts)return;')]);
 for(const [id,apply]of jobs){if(text.includes('/*'+id+'*/'))continue;try{const next=apply(text);if(next===text)throw Error('No matching declaration');text=next+'\n/*'+id+'*/\n';log.push([id,1])}catch(e){log.push([id+'!error '+e.message,0])}}
 return transformCalibration(rel,text,log);
}
function preparePage(html){
 html=stripFaces(html).text;
 html=html.replace(/<link\b[^>]*\bas=["']font["'][^>]*>/gi,'');
 html=html.replace(/<link\b[^>]*\bhref=["'][^"']*(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^"']*["'][^>]*>/gi,'');
 return html.replace(/<script\b([^>]*\btype=["']module["'][^>]*)>([\s\S]*?)<\/script>/gi,(all,attrs,body)=>{
  const src=/\bsrc=["']([^"']+)["']/.exec(attrs);
  if(src)return `<script ${attrs.replace(src[0],'')}>await globalThis.__dfoFonts?.ready;await import(new URL(${JSON.stringify(src[1])},document.baseURI).href);</script>`;
  return `<script ${attrs}>await globalThis.__dfoFonts?.ready;\n${body}</script>`;
 });
}
module.exports={transformFonts,preparePage,stripFaces,launcherCss:()=>stripFaces(css('../dfo-mod/fonts/')).text};
