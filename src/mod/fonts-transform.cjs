'use strict';
const {css}=require('./page/dfo_fonts.js');
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
 return text+`\n;{const p=${place},d=${reader}.prototype._drawFallback;${place}=function(lines,fontFor,...args){return p(lines,x=>{const f=fontFor(x);return globalThis.__dfoFonts?.bookFont(f)??f},...args)};${reader}.prototype._drawFallback=function(renderer,canvas,font,...args){return d.call(this,renderer,canvas,globalThis.__dfoFonts?.bookFont(font)??font,...args)}}\n`;
}
function canvasBook(text){
 const family="`Cormorant, 'Cormorant Garamond', Georgia, 'Times New Roman', serif`";
 need(text,/let [\w$]+=globalThis\.document\?\.fonts;/);
 if(!text.includes(family))throw Error('Unsupported book family');
 // Entry modules already waited for these local faces. The native async
 // web-font seam would otherwise paginate the whole book a second time.
 return text.replace(family,'(globalThis.__dfoFonts?.stacks.book??'+family+')')
  .replace(/(let [\w$]+=)globalThis\.document\?\.fonts;/,'$1globalThis.__dfoFonts?.enabled?null:globalThis.document?.fonts;');
}
function transformFonts(rel,text,log){
 if(/Worker-[^/]+\.js$/.test(rel))return text;
 const jobs=[];
 if(text.includes('#sdf')&&text.includes('drawScreenQuadRun'))jobs.push(['fonts.classic',classic]);
 if(/^assets\/bookReader-[^/]+\.js$/.test(rel)&&text.includes('BOOK00I0.IMG'))jobs.push(['fonts.bookClassic',classicBook]);
 if(/^assets\/enhancedBook-[^/]+\.js$/.test(rel))jobs.push(['fonts.bookCanvas',canvasBook]);
 if(text.includes('dyslexic:`Dyslexic`'))jobs.push(['fonts.choices',text=>text.replace('Object.freeze({game:`Game`,sans:`Sans`,mono:`Monospace`,dyslexic:`Dyslexic`,system:`My font`})','Object.freeze({game:`Шрифты сообщества`})')]);
 if(text.includes('dagger-enhanced-fonts'))jobs.push(['fonts.network',text=>text.replace(/(function [\w$]+\([\w$]+=document,[\w$]+=globalThis\.location\?\.search\?\?``\)\{)/,'$1if(globalThis.__dfoFonts)return;')]);
 for(const [id,apply]of jobs){if(text.includes('/*'+id+'*/'))continue;try{const next=apply(text);if(next===text)throw Error('No matching declaration');text=next+'\n/*'+id+'*/\n';log.push([id,1])}catch(e){log.push([id+'!error '+e.message,0])}}
 return text;
}
function preparePage(html){
 html=html.replace(/<link\b[^>]*\bhref=["'][^"']*(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^"']*["'][^>]*>/gi,'');
 return html.replace(/<script\b([^>]*\btype=["']module["'][^>]*)>([\s\S]*?)<\/script>/gi,(all,attrs,body)=>{
  const src=/\bsrc=["']([^"']+)["']/.exec(attrs);
  if(src)return `<script ${attrs.replace(src[0],'')}>await globalThis.__dfoFonts?.ready;await import(new URL(${JSON.stringify(src[1])},document.baseURI).href);</script>`;
  return `<script ${attrs}>await globalThis.__dfoFonts?.ready;\n${body}</script>`;
 });
}
module.exports={transformFonts,preparePage,launcherCss:()=>css('../dfo-mod/fonts/')};
