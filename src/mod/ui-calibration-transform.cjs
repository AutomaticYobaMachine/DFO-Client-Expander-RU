'use strict';
const need=(s,re)=>{const m=re.exec(s);if(!m)throw Error('Unsupported UI calibration: '+re.source.slice(0,90));return m};
// Change authored px sizes once, before CSS reaches the browser. No walk of
// computed styles, inherited subtraction or per-frame measurement of the HUD.
function sizes(source){
 const expressions=[];
 const shield=source.replace(/\$\{[^{}]*\}/g,s=>'__DFO_SIZE_EXPR_'+(expressions.push(s)-1)+'__');
 // Start only at a brace boundary (or the file's start). An unanchored
 // [^{}]+ search can rescan a large image/data literal quadratically.
 return shield.replace(/(?<![^{}])([^{}]*)\{([^{}]*)\}/g,(all,selector,body)=>{
  if(!/\bfont-size\s*:/.test(body))return all;
  const s=selector.replace(/\/\*[\s\S]*?\*\//g,'');
  if(/(?:\bh[1-6]\b|title|heading|wordmark|emblem|sigil|setbox|set-|rarity|\.card\b|\.itemname\b|\.wornname\b|\.inv-menu-head\b|\.px-(?:knot|gem|arm|term|c)\b|\.tview|\.hst-|\.shelflabel)/i.test(s))return all;
  return selector+'{'+body.replace(/(font-size\s*:\s*(?:calc\(\s*)?)(\d+(?:\.\d+)?)px/g,(_,p,n)=>p+Math.max(1,+n-2)+'px')+'}';
 }).replace(/__DFO_SIZE_EXPR_(\d+)__/g,(_,n)=>expressions[n]);
}
function titleSizes(source){
 const expressions=[];
 const shield=source.replace(/\$\{[^{}]*\}/g,s=>'__DFO_TITLE_EXPR_'+(expressions.push(s)-1)+'__');
 const value=(v,selector)=>{
  if(/[`"'<>{}=]/.test(v)||/^(?:inherit|initial|unset|revert(?:-layer)?|xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|smaller|larger|0(?:px|pt|em|rem|%|vw|vh)?)$/.test(v)||v.includes('--dfo-title-step'))return v;
  const relative=/^([\d.]+)(em|%)$/.exec(v);
  // A relative-size child of a heading already inherits its parent's +2.
  // Remove that inherited step before evaluating the child's own size.
  if(relative&&/\bh[1-6]\b\s+(?:[^,{}]+)$/.test(selector))return `calc((1em - var(--dfo-title-step,0px)) * ${+relative[1]/(relative[2]==='%'?100:1)} + var(--dfo-title-step,0px))`;
  return `calc(${v} + var(--dfo-title-step,0px))`;
 };
 return shield.replace(/(?<![^{}])([^{}]*)\{([^{}]*)\}/g,(all,selector,body)=>{
  if(body.includes('`')||!/\bfont(?:-size)?\s*:/.test(body))return all;
  body=body.replace(/(\bfont-size\s*:)\s*([^;\n]+?)(\s*!important)?(?=;|$)/g,(_,p,v,priority)=>p+value(v.trim(),selector)+(priority||''));
  body=body.replace(/((?:^|;)\s*font\s*:\s*)([^;]+)(;|$)/g,(all,p,v,end)=>{
   const m=/^(?:(?:normal|italic|oblique|small-caps|bold|bolder|lighter|condensed|expanded|[1-9]00)\s+)*([\d.]+(?:px|pt|em|rem|%|vw|vh))(?=\s|\/)/.exec(v.trim());return m?all+(end?'':';')+'font-size:'+value(m[1],selector)+(/!important/.test(v)?'!important':'')+';':all;
  });
  return selector+'{'+body+'}';
 }).replace(/__DFO_TITLE_EXPR_(\d+)__/g,(_,n)=>expressions[n]);
}
function dial(text){
 const m=need(text,/([\w$]+)=([\w$]+)\(`div`,`px-rose`\)/);
 return text.replace(m[0],m[0]+`;for(const d of ['n','e','s','w'])${m[1]}.append(${m[2]}('span','dfo-dial-ray dfo-ray-'+d))`);
}
function world(text){
 const m=need(text,/function ([\w$]+)\(([\w$]+)\)\{(?:globalThis\.__dfoDungeons\?\.register\([\w$]+\);)?let\{TV_PLACE_LIFT:/);
 return text.replace(m[0],m[0].replace('{','{globalThis.__dfoFonts?.calibration.host('+m[2]+');'));
}
function project(text){
 const m=need(text,/\{let ([\w$]+)=([\w$]+)\(([\w$]+)\.at\);([\w$]+)\.push\(\{(?:dfoDungeon:[\w$]+\.dfoDungeon,)?key:\3\.key,/);
 // The loop binding is const upstream; add fields to the projected record,
 // never replace the world entity or alter its native filter/pick flags.
 return text.replace(m[0],m[0].replace('key:',`...globalThis.__dfoFonts?.calibration.mark(${m[3]}),key:`));
}
function hud(text){
 const draw=need(text,/function ([\w$]+)\(([\w$]+),([\w$]+),([\w$]+),([\w$]+),([\w$]+)=null\)\{let ([\w$]+)=[\w$]+\.canvas;/);
 const region=text.slice(draw.index,draw.index+21000);
 // Run immediately before the placed-list layout. A far caption gets no
 // sprite, width or subtitle reservation; its marker is still native.
 const place=need(region,/([\w$]+)\.length=0,\1\.push\(\.\.\.([\w$]+)\);/);
 text=text.replace(place[0],place[0]+`for(const q of ${place[1]})if(q.m.dfoQuiet){q.bk='';q.sp=null}`);
 text=text.replace(/([\w$]+)\.m\.dfoDungeon&&\(/g,'$1.m.dfoDungeon&&!$1.m.dfoQuiet&&(');
 const box=need(text,/function ([\w$]+)\(([\w$]+),([\w$]+)\)\{(?:if\([^;]+;)?let ([\w$]+)=\2\.look===`place`\|\|\2\.look===`far`,/);
 text=text.replace(box[0],box[0].replace('{',`{if(${box[2]}.m.dfoQuiet)return globalThis.__dfoFonts.calibration.markerBox(${box[2]});`));
 const width=need(text,/([\w$]+)=([\w$]+)=>\{let ([\w$]+)=\2\.m;if\(\2\.sp\)return \2\.sp\.w;/);
 text=text.replace(width[0],width[0].replace('if(',`if(${width[3]}.dfoQuiet)return 24;if(`));
 const extra=need(text,/([\w$]+)=([\w$]+)=>\(\2\.m\.sub\?16:0\)\+/);
 text=text.replace(extra[0],extra[0].replace('=>','=>'+extra[2]+'.m.dfoQuiet?0:'));
 const hit=need(text,/if\(!([\w$]+)\.m\.pick\)continue;let ([\w$]+)=([\w$]+)\(\1,([\w$]+)\);/);
 text=text.replace(hit[0],`if(!${hit[1]}.m.pick&&!${hit[1]}.m.dfoSmall)continue;let ${hit[2]}=${hit[1]}.m.dfoQuiet?globalThis.__dfoFonts.calibration.markerBox(${hit[1]}):${hit[3]}(${hit[1]},${hit[4]});`);
 // Non-pickable resource marks can be hovered without becoming clickable.
 const paint=need(text,/if\(!([\w$]+)\.label\)continue;let ([\w$]+)=([\w$]+)===`place`\|\|\3===`far`;/);
 const near=text.slice(paint.index,paint.index+1800);
 const sprite=need(near,/([\w$]+)=([\w$]+)\.sp\?\?([\w$]+)\(([^;]+?)\);if\(!\1\)continue;/);
 const hover=need(sprite[4],/([\w$]+)\.key===([\w$]+)/)[2];
 text=text.replace(paint[0],`if(!${paint[1]}.label||${paint[1]}.dfoQuiet&&${paint[1]}.key!==${hover})continue;let ${paint[2]}=${paint[3]}===\`place\`||${paint[3]}===\`far\`;`);
 const doc=need(sprite[4],/^([\w$]+),/)[1];
 text=text.replace(sprite[0],sprite[0].replace(sprite[2]+'.sp??',`${sprite[2]}.sp??(${paint[1]}.dfoDungeon?globalThis.__dfoDungeons?.sprite(${doc},${paint[1]},${draw[5]}):null)??`).replace(/\?11:([\w$]+)\?13:12,/,`?(${paint[1]}.dfoSmall?10:11):$1?(${paint[1]}.dfoSmall?12:13):(${paint[1]}.dfoSmall?11:12),`));
 const sub=new RegExp(`(${paint[1]}\\.sub,\x60sub\x60,)11,`);
 need(text,sub);text=text.replace(sub,`$1${paint[1]}.dfoSmall?10:11,`);
 // A range transition must invalidate an otherwise stationary canvas.
 const signature=need(text,/([\w$]+)\.m\.kind\?\?``,\1\.bk,/);
 return text.replace(signature[0],signature[0]+`${signature[1]}.m.dfoQuiet?1:0,`);
}
function transformCalibration(rel,text,log){
 const jobs=[];
 if(/\/enhanced(?:Style|PlusStyle)-[^/]+\.js$/.test(rel)||text.includes('.dfchat-line {'))jobs.push(['fonts.uiSizes',sizes]);
 if(text.includes('font-size:')||text.includes('font:'))jobs.push(['fonts.titleSizes',titleSizes]);
 if(text.includes('aboveWidth:')&&text.includes('.tile+8+120'))jobs.push(['fonts.statusLayout',t=>t.replace(/\.tile\+8\+120\)/g,'.tile+8+240)')]);
 if(/([\w$]+)=([\w$]+)\(`div`,`px-rose`\)/.test(text))jobs.push(['fonts.dial',dial]);
 if(/function [\w$]+\([\w$]+\)\{(?:globalThis\.__dfoDungeons\?\.register\([\w$]+\);)?let\{TV_PLACE_LIFT:/.test(text))jobs.push(['fonts.mapHost',world]);
 if(text.includes('.marks?.()??[]')&&text.includes('routeDots:'))jobs.push(['fonts.mapProject',project]);
 if(text.includes('as drawTravelViewHud')||text.includes('.m.badge')&&text.includes('canvasSig')||text.includes('.m.kind??``,')&&text.includes('side:-1,bk:``'))jobs.push(['fonts.mapHud',hud]);
 for(const[id,fn]of jobs){if(text.includes('/*'+id+'*/'))continue;try{const next=fn(text);if(next===text){if(id==='fonts.titleSizes')continue;throw Error('No matching calibration')}text=next+'\n/*'+id+'*/';log.push([id,1])}catch(e){log.push([id+'!error '+e.message,0])}}
 return text;
}
module.exports={transformCalibration,sizes,titleSizes};
