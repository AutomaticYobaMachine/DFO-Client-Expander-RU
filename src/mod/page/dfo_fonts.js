(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root?.document)api.install(root);else if(typeof root?.postMessage==='function')root.__dfoFontTools=api;
})(typeof globalThis==='object'?globalThis:null,function(){
  'use strict';
  const files={Gabin:'item-font-text.ttf',Greengoth:'item-font-title.ttf',Flexi:'item-font-numbers.ttf',Hangyaku:'book-font-text.ttf',Ckazka:'item-font-sigil.ttf',Ritalin:'item-font-set.ttf',Wolga:'item-font-legendary.otf',Flow:'item-font-description.otf'};
  const stacks={body:"'DFO Gabin','DFO Flexi','DFO Ritalin',sans-serif",title:"'DFO Greengoth','DFO Gabin','DFO Flexi',sans-serif",number:"'DFO Flexi','DFO Gabin','DFO Ritalin',sans-serif",book:"'DFO Hangyaku','DFO Gabin','DFO Flexi',sans-serif",sigil:"'DFO Ckazka','DFO Gabin','DFO Flexi',sans-serif",set:"'DFO Ritalin','DFO Gabin','DFO Flexi',sans-serif",power:"'DFO Wolga','DFO Gabin','DFO Flexi',sans-serif",description:"'DFO Flow','DFO Gabin','DFO Flexi',sans-serif"};
  for(const role of Object.keys(stacks)){const names=[...stacks[role].matchAll(/'DFO ([^']+)'/g)].map(m=>m[1]);stacks[role]=[...new Set([...names,...Object.keys(files)])].map(n=>"'DFO "+n+"'").join(',')+',sans-serif';}
  const ownFamily=/\bDFO (Gabin|Greengoth|Flexi|Hangyaku|Ckazka|Ritalin|Wolga|Flow)\b/;
  const roles={Gabin:'body',Greengoth:'title',Flexi:'number',Hangyaku:'book',Ckazka:'sigil',Ritalin:'set',Wolga:'power',Flow:'description'};
  const fontMappings=new Map();
  const bookSize=px=>Math.max(1,Math.round(px*1.35));
  const seed=[...Array.from({length:95},(_,i)=>32+i),...Array.from({length:64},(_,i)=>1040+i),1025,1105,8211,8212,8230,8470,8594,177,215,8734,...Array.from({length:96},(_,i)=>160+i)];
  function css(base,revision='1.25.2'){
    const faces=Object.entries(files).map(([name,file])=>`@font-face{font-family:'DFO ${name}';src:url(${JSON.stringify(base+file+'?dfo='+encodeURIComponent(revision))}) format('${file.endsWith('.otf')?'opentype':'truetype'}');font-style:normal;font-weight:400;font-display:swap;}`).join('\n');
    return faces+`\n/* DFO community fonts */
@layer dfo-community-fonts {
 :root {--display:${stacks.title}!important;--data:${stacks.body}!important;--body:${stacks.body}!important;--dfo-text-font:${stacks.body}!important;}
 :root body,:root body *,:root body *::before,:root body *::after {font-family:${stacks.body}!important;--dfo-title-step:0px!important;}
 :root body :is(h1,h2,h3,h4,h5,h6,[role=heading],.px-wordmark,.brand h1,.look-emblem,.window-title,.dialog-title,.panel-title),
 :root body :is(h1,h2,h3,h4,h5,h6,[role=heading],.px-wordmark,.brand h1,.look-emblem,.window-title,.dialog-title,.panel-title) * {font-family:${stacks.title}!important;--dfo-title-step:2px!important;}
 :root body :is(.dfo-item-group>h4,.dfo-item-stat-heading),:root body :is(.dfo-item-group>h4,.dfo-item-stat-heading) * {font-family:${stacks.body}!important;--dfo-title-step:0px!important;}
 :root body :is(.sigil-stage,.sigilbox .sigil-stage),:root body :is(.sigil-stage,.sigilbox .sigil-stage) * {font-family:${stacks.sigil}!important;--dfo-title-step:0px!important;}
 :root body :is(.set-name,.setbox .set-name),:root body :is(.set-name,.setbox .set-name) * {font-family:${stacks.set}!important;--dfo-title-step:0px!important;}
 :root body .dfo-item-power-name,:root body .dfo-item-power-name * {font-family:${stacks.power}!important;--dfo-title-step:0px!important;}
 :root body .dfo-item-text,:root body .dfo-item-text * {font-family:${stacks.description}!important;--dfo-title-step:0px!important;}
 :root body .dfo-item-title h3,:root body .dfo-item-title h3 * {font-family:${stacks.title}!important;--dfo-title-step:2px!important;}
 :root body :is(.itemname>span,.wornname,.inv-menu-head),:root body :is(.itemname>span,.wornname,.inv-menu-head) * {font-family:${stacks.title}!important;--dfo-title-step:2px!important;}
 :root body .pack-shell .wornname,:root body .pack-shell .wornname * {--dfo-title-step:0px!important;}
 :root body :is(.dfo-item-primary strong,.dfo-item-price-value),:root body :is(.dfo-item-primary strong,.dfo-item-price-value) * {font-family:${stacks.number}!important;--dfo-title-step:0px!important;}
 /* Lower-priority defaults cover headings/names without an authored size.
    Their descendants inherit the result; no repeated +2 on nested spans. */
 :where(h1){font-size:calc(2em + var(--dfo-title-step,0px));}
 :where(h2){font-size:calc(1.5em + var(--dfo-title-step,0px));}
 :where(h3){font-size:calc(1.17em + var(--dfo-title-step,0px));}
 :where(h4){font-size:calc(1em + var(--dfo-title-step,0px));}
 :where(h5){font-size:calc(.83em + var(--dfo-title-step,0px));}
 :where(h6){font-size:calc(.67em + var(--dfo-title-step,0px));}
 :where([role=heading],.px-wordmark,.look-emblem,.window-title,.dialog-title,.panel-title,.itemname>span,.inv-menu-head){font-size:calc(1em + var(--dfo-title-step,0px));}
}
/* /DFO community fonts */
@layer dfo-community-fonts {
 :root body .hst-name {font-size:11px!important;line-height:1.2!important;white-space:normal!important;word-break:normal!important;overflow-wrap:normal!important;hyphens:none!important;max-width:240px!important;overflow:visible!important;text-overflow:clip!important;align-self:center!important;}
 :root body .hst-cell {align-items:center!important;}
 :root body .pack-shell .shelflabel {max-width:none!important;overflow:visible!important;text-overflow:clip!important;white-space:normal!important;word-break:normal!important;overflow-wrap:normal!important;text-align:center!important;}
 :root body .pack-shell .shelfgrp {min-width:min-content!important;}
 :root body .pack-shell .wornshelf {flex-wrap:wrap!important;}
 :root body .pack-shell .packtab .count {flex-shrink:0!important;min-width:4ch!important;text-align:right!important;}
 :root body :is(.itemrow .count,.itemrow .rowcount,.worncount,.hud-qcount,.hb-count) {font-family:${stacks.number}!important;font-size:12px!important;font-weight:400!important;line-height:1.1!important;letter-spacing:0!important;font-variant-numeric:tabular-nums;--dfo-title-step:0px!important;text-shadow:1px 0 #000,-1px 0 #000,0 1px #000,0 -1px #000,0 0 3px #000!important;}
 @media(min-width:1200px){
  :root body .pack-shell:not(.paired)>.pack-win {width:min(1160px,95vw)!important;}
  :root body .pack-shell:not(.paired) .pack {grid-template-columns:minmax(0,1fr) minmax(420px,500px)!important;}
 }
 /* Arms and hit rectangles occupy fixed directions; text cannot move a ray.
    All ornaments are shapes, independent of the font's diamond glyph. */
 :root body .px-rose .px-arm {box-sizing:border-box!important;width:32%!important;height:70px!important;min-width:0!important;min-height:0!important;padding:4px!important;gap:5px!important;justify-content:center!important;text-align:center!important;white-space:normal!important;overflow-wrap:normal!important;letter-spacing:.06em!important;text-indent:0!important;transform:translate(-50%,-50%)!important;flex-direction:column!important;line-height:1.2!important;}
 :root body .px-rose .px-n {left:50%!important;top:12%!important;right:auto!important;bottom:auto!important;}
 :root body .px-rose .px-s {left:50%!important;top:88%!important;right:auto!important;bottom:auto!important;}
 :root body .px-rose .px-e {left:84%!important;top:50%!important;right:auto!important;bottom:auto!important;}
 :root body .px-rose .px-w {left:16%!important;top:50%!important;right:auto!important;bottom:auto!important;}
 :root body .px-arm::before,:root body .px-arm::after {display:none!important;}
 :root body .dfo-dial-ray {position:absolute!important;pointer-events:none!important;background:rgba(125,116,96,.55)!important;}
 :root body .dfo-ray-n,:root body .dfo-ray-s {left:calc(50% - 1px)!important;width:2px!important;height:26%!important;}
 :root body .dfo-ray-n {top:24%!important;}
 :root body .dfo-ray-s {top:50%!important;}
 :root body .dfo-ray-e,:root body .dfo-ray-w {top:calc(50% - 1px)!important;height:2px!important;width:18%!important;}
 :root body .dfo-ray-e {left:50%!important;}
 :root body .dfo-ray-w {left:32%!important;}
 :root body .px-arm .px-term,:root body .px-arm .px-c {font-size:0!important;text-shadow:none!important;width:7px!important;height:7px!important;border:1px solid currentColor!important;transform:rotate(45deg)!important;flex:none!important;order:0!important;}
 :root body .px-arm .px-c {position:absolute!important;bottom:0!important;background:currentColor!important;width:3px!important;height:3px!important;}
 :root body .px-knot {font-size:0!important;text-shadow:none!important;box-sizing:border-box!important;transform:translate(-50%,-50%) rotate(45deg)!important;}
 :root body .px-knot-outer {width:32px!important;height:32px!important;border:2px solid rgba(125,116,96,.4)!important;}
 :root body .px-knot-mid {width:18px!important;height:18px!important;border:2px solid var(--brass,#b08d57)!important;}
 :root body .px-knot-core {width:6px!important;height:6px!important;background:#f3ef2c!important;}
}`;
  }
  // No observers or frame callbacks: layout follows native CSS, marks the
  // native map draw, and book work only runs when a book is typeset.
  function uiCalibration(win){
    let player=null,ctx=null;
    const scaled=new WeakMap();
    const metric=(face,text)=>{ctx??=(typeof win.OffscreenCanvas==='function'?new win.OffscreenCanvas(1,1):win.document.createElement('canvas')).getContext('2d');ctx.font=face.fnt.font;ctx.textBaseline='alphabetic';return ctx.measureText(text)};
    const sizeFace=(face,scale)=>{
      if(!face?.fnt?.canvas||scale===1)return face;
      let cache=scaled.get(face);if(!cache){cache=new Map();scaled.set(face,cache)}
      if(cache.has(scale))return cache.get(scale);
      const f=face.fnt,px=Math.max(.1,f.px*scale),font=`${f.weight??400} ${px}px ${f.family||stacks.book}`;
      const out={...face,fnt:{...f,px,font,fixedHeight:Math.ceil(px*1.3)}};
      if(cache.size>=128)cache.delete(cache.keys().next().value);cache.set(scale,out);return out;
    };
    const width=(face,text)=>{
      if(face.fnt.canvas){const m=metric(face,text);return Math.max(m.width,(m.actualBoundingBoxLeft||0)+(m.actualBoundingBoxRight||0));}
      return win.__dfoFonts.measure(face.fnt,text)??0;
    };
    function wrap(face,text,max){
      const rows=[];let row='';
      for(const para of String(text).split(/\r?\n/)){
        row='';for(const word of para.split(/\s+/).filter(Boolean)){
          const next=row?row+' '+word:word;
          if(width(face,next)<=max){row=next;continue}
          if(row){rows.push(row);row=''}
          if(width(face,word)<=max){row=word;continue}
          // Books may contain an URL or one unbroken token. Preserve all its
          // characters across rows rather than clipping it at the paper edge.
          const chars=Array.from(word);let start=0;
          while(start<chars.length){let lo=1,hi=Math.min(32,chars.length-start);while(hi<chars.length-start&&width(face,chars.slice(start,start+hi).join(''))<=max){lo=hi;hi=Math.min(chars.length-start,hi*2)}while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(width(face,chars.slice(start,start+mid).join(''))<=max)lo=mid;else hi=mid-1}const part=chars.slice(start,start+lo).join('');start+=lo;if(start<chars.length)rows.push(part);else row=part;}
        }
        rows.push(row);
      }
      return rows;
    }
    function place(lines,fontFor,maxWidth=300){
      const placed=[];let y=0;
      for(const line of lines){
        let face=fontFor(line.font),scale=Number(line.scale??1);if(!(scale>0&&Number.isFinite(scale)))scale=1;
        if(face?.fnt?.canvas){face=sizeFace(face,scale);scale=1;}
        const m=face?.fnt?.canvas?metric(face,'MgЙЁру'):null;
        const rowH=m?Math.ceil(Math.max(face.fnt.fixedHeight,(m.fontBoundingBoxAscent??m.actualBoundingBoxAscent)+(m.fontBoundingBoxDescent??m.actualBoundingBoxDescent))):(face?.fnt?.fixedHeight??0)*scale;
        const rows=face&&line.text?wrap(face,line.text,Math.max(1,maxWidth/scale-.5)):[line.text??''];
        const h=rows.length*rowH;placed.push({...line,face,scale,rows,rowH,y,h});y+=h;
      }
      return {placed,maxHeight:y};
    }
    return {
      host(value){const p=value?.player;player=p&&typeof p==='object'?new WeakRef(p):null},
      mark(m){
        const kind=String(m.kind||''),key=String(m.key||'');
        // Never include settlements, player names or friendly living-road
        // travellers. Only dungeon / hostile / gathering marks are quieter.
        const small=!!m.dfoDungeon||/(?:^| )(?:dungeon|lair|gather|band|camp|raider|chase)(?: |$)/.test(kind)||/^giant:|^hideout:/.test(key);
        if(!small)return {};
        const pos=player?.deref()?.pos;
        const distance=pos&&m.at?Math.hypot(m.at[0]-pos[0],m.at[2]-pos[2]):NaN;
        return {dfoSmall:true,dfoQuiet:Number.isFinite(distance)&&distance>1000};
      },
      markerBox:q=>({x0:q.x-12,x1:q.x+12,y0:q.y-12,y1:q.y+12}),
      place,
      paint(ctx,face,text,x,y,{color,align='left',w=0}={}){
        if(!face?.fnt?.canvas)return false;
        if(!text)return true;
        const m=metric(face,text),left=Math.max(0,m.actualBoundingBoxLeft||0),advance=Math.max(m.width,left+(m.actualBoundingBoxRight||0));
        ctx.font=face.fnt.font;ctx.fillStyle=color;ctx.textBaseline='alphabetic';ctx.textAlign='left';
        const ascent=Math.ceil(m.fontBoundingBoxAscent??metric(face,'MgЙЁру').actualBoundingBoxAscent);
        ctx.fillText(text,x+left+(align==='center'?Math.max(0,(w-advance)/2):0),y+ascent);return true;
      },
    };
  }
  function mapFont(font){
    if(typeof font!=='string')return font;
    if(fontMappings.has(font))return fontMappings.get(font);
    const size=/^(.*?\b(?:[\d.]+(?:px|pt|em|rem|%|pc|in|cm|mm|q)|xx-small|x-small|small|medium|large|x-large|xx-large|smaller|larger)(?:\s*\/\s*(?:normal|[\d.]+[a-z%]*))?\s+)(.+)$/i.exec(font);
    const own=size&&ownFamily.exec(size[2]);
    const role=own?roles[own[1]]:'body';
    const mapped=size?size[1]+stacks[role]:font;
    if(font.length<=512){if(fontMappings.size>=128)fontMappings.delete(fontMappings.keys().next().value);fontMappings.set(font,mapped);}
    return mapped;
  }
  function installCanvas(win,stats){
    const contextFonts=new WeakMap();
    for(const Type of [win.CanvasRenderingContext2D,win.OffscreenCanvasRenderingContext2D]){
      if(!Type?.prototype)continue;
      const proto=Type.prototype,font=Object.getOwnPropertyDescriptor(proto,'font');
      if(!font?.get||!font?.set)continue;
      const ensure=ctx=>{const actual=font.get.call(ctx);if(contextFonts.get(ctx)?.actual!==actual){const own=mapFont(actual);font.set.call(ctx,own);contextFonts.set(ctx,{actual:font.get.call(ctx)});if(own!==actual)stats.canvasChanges++;}};
      Object.defineProperty(proto,'font',{...font,get(){ensure(this);return font.get.call(this)},set(value){
        const previous=contextFonts.get(this);
        // Reading the native value still detects resize/reset/save/restore.
        // The repeated font assignment in book glyph measurement can skip
        // both shorthand parsing and the native setter when nothing changed.
        if(typeof value==='string'&&previous?.input===value&&previous.actual===font.get.call(this))return;
        const own=mapFont(value);font.set.call(this,own);const actual=font.get.call(this);
        if(ownFamily.test(actual))contextFonts.set(this,{input:value,actual});else contextFonts.delete(this);
        if(own!==value)stats.canvasChanges++;
      }});
      for(const method of ['fillText','strokeText','measureText']){
        const original=proto[method];if(typeof original!=='function')continue;
        proto[method]=function(...args){ensure(this);return original.apply(this,args)};
      }
    }
  }
  function installFontSet(win,base,stats){
    const fontSet=win.document?.fonts||win.fonts,Native=win.FontFace;
    const load=fontSet.load.bind(fontSet),check=fontSet.check.bind(fontSet),add=fontSet.add.bind(fontSet);
    const canonical=family=>Object.keys(files).find(name=>String(family).replace(/["']/g,'').toLowerCase()==='dfo '+name.toLowerCase());
    const ownUrl=name=>`url(${JSON.stringify(base+files[name]+'?dfo=1.25.2')})`;
    win.FontFace=new Proxy(Native,{construct(Type,args,New){
      const name=canonical(args[0])||'Gabin';
      stats.faceRedirects=(stats.faceRedirects||0)+1;
      return Reflect.construct(Type,['DFO '+name,ownUrl(name),args[2]],New===win.FontFace?Type:New);
    }});
    fontSet.add=face=>{
      let family;try{family=Object.getOwnPropertyDescriptor(Native.prototype,'family').get.call(face)}catch{return add(face)}
      if(!canonical(family)){stats.blockedFonts=(stats.blockedFonts||0)+1;return fontSet;}
      // CSS already owns one face per family. Legacy JS loaders must not
      // register a second copy under an old alias or replace that primary.
      for(const existing of fontSet)if(existing!==face&&canonical(existing.family)===canonical(family))return fontSet;
      return add(face);
    };
    fontSet.load=(font,text)=>load(mapFont(font),text);
    fontSet.check=(font,text)=>check(mapFont(font),text);
    return {fontSet,load,add,Native,ownUrl};
  }
  function bitmapFonts(win){
    const bytes=new Map(),letters=new Map();
    const get=input=>{
      let height=7;
      if(typeof input==='string')height=Object.keys(win.__dfoFontData?.fonts||{}).find(h=>win.__dfoFontData.fonts[h].name===input.replace(/\.FNT$/i,'').toUpperCase())||7;
      else if(input?.byteLength>=4)height=new DataView(input.buffer,input.byteOffset,input.byteLength).getUint16(2,true);
      const entry=win.__dfoFontData?.fonts[height]||win.__dfoFontData?.fonts[7];
      if(!entry)return null;
      if(!bytes.has(entry.name))bytes.set(entry.name,Uint8Array.from(win.atob(entry.base64),c=>c.charCodeAt(0)));
      return bytes.get(entry.name);
    };
    return {bytes:get,letters(height=7){
      if(letters.has(height))return letters.get(height);
      const canvas=typeof win.OffscreenCanvas==='function'?new win.OffscreenCanvas(32,32):win.document.createElement('canvas');canvas.width=32;canvas.height=32;
      const ctx=canvas.getContext('2d',{willReadFrequently:true}),family=[6,8,11,13].includes(height)?stacks.title:stacks.body,glyphs=new Map();
      ctx.font='64px '+family;const sample=ctx.measureText('AgЙЁjQ'),total=(sample.actualBoundingBoxAscent||50)+(sample.actualBoundingBoxDescent||14),ratio=height/total;
      const font=(64*ratio)+'px '+family,baseline=(sample.actualBoundingBoxAscent||50)*ratio;
      const glyph=code=>{
        if(glyphs.has(code))return glyphs.get(code);
        const char=code>=32&&code<=0x10ffff?String.fromCodePoint(code):'?';
        ctx.clearRect(0,0,32,32);ctx.font=font;ctx.textBaseline='alphabetic';ctx.fillStyle='#fff';
        const measured=ctx.measureText(char),left=Math.max(0,Math.ceil(measured.actualBoundingBoxLeft||0));
        ctx.fillText(char,left,baseline);
        const width=Math.min(32,Math.max(1,Math.ceil(measured.width+left))),rgba=ctx.getImageData(0,0,width,height).data;
        const mask=Uint8Array.from({length:width*height},(_,i)=>rgba[i*4+3]>=80?1:0);
        const value={mask,width};if(glyphs.size>=1024)glyphs.delete(glyphs.keys().next().value);glyphs.set(code,value);return value;
      };
      const source=Object.freeze({height,space:glyph(32).width,widthOf:code=>glyph(code).width,lit:(code,x,y)=>{const g=glyph(code);return x>=0&&x<g.width&&y>=0&&y<height&&!!g.mask[y*g.width+x]}});
      letters.set(height,source);return source;
    }};
  }
  function installWorker(win,base){
    if(win.__dfoFonts)return win.__dfoFonts;
    const stats={canvasChanges:0,failures:[]};installCanvas(win,stats);
    if(!win.fonts||!win.FontFace||!win.OffscreenCanvas){win.__dfoFonts={ready:Promise.resolve(false),enabled:false,stacks,register(){},measure(){return null},draw(){return null},makeFont(){return null},bookFont:font=>font};return win.__dfoFonts;}
    const policy=installFontSet(win,base,stats),faces=new Map();
    for(const name of Object.keys(files)){const face=new policy.Native('DFO '+name,policy.ownUrl(name));policy.add(face);faces.set(name,face);}
    // Wait once at worker startup so its very first text also has the same
    // fallback coverage as the main window. No font work runs per frame.
    const ready=Promise.all(Object.keys(files).map(async name=>{try{await faces.get(name).load();return true}catch(e){stats.failures.push({font:name,error:String(e)});return false}})).then(all=>all.some(Boolean));
    const bitmaps=bitmapFonts(win);
    win.__dfoFonts=Object.freeze({ready,enabled:true,stacks,register(){},measure(){return null},draw(){return null},makeFont(){return null},bookFont:font=>font,fntBytes:bitmaps.bytes,pixelLetters:bitmaps.letters,stats:()=>({...stats,shorthandCacheSize:fontMappings.size})});return win.__dfoFonts;
  }
  function install(win){
    if(win.__dfoFonts||win.__DFO_MOD_CFG__?.fonts?.enabled===false)return;
    const doc=win.document,base=new URL('.',doc.currentScript?.src||new URL('dfo-mod/dfo_fonts.js',doc.baseURI)).href;
    const style=doc.createElement('style');style.id='dfo-community-fonts';style.textContent=css(base,win.__DFO_MOD_CFG__?.fonts?.revision||'1.25.2');doc.head.append(style);
    const stats={canvasChanges:0,classicDraws:0,classicBatches:0,glyphsDrawn:0,faces:0,failures:[]};
    const native={},renderers=new WeakMap(),fnts=new WeakMap(),firstFaces=new Map(),bookFonts=new WeakMap(),fontOwners=new WeakMap(),titleHeights=new WeakMap();let enabled=false,serial=0;
    const translate=text=>typeof win.__translate==='function'?win.__translate(text):text;
    installCanvas(win,stats);
    const {fontSet,load}=installFontSet(win,base,stats);
    const bitmaps=bitmapFonts(win);
    // Load the faces declared by our stylesheet. Creating another FontFace
    // for each family duplicates registrations and needlessly retains them.
    const ready=Promise.all(Object.keys(files).map(async name=>{
      try{const faces=await load(`16px "DFO ${name}"`);if(!faces.length)throw Error('Font declaration unavailable');return name;}
      catch(error){stats.failures.push({font:name,error:String(error?.message||error)});return null;}
    })).then(loaded=>{enabled=loaded.some(Boolean);return enabled});
    const createCanvas=()=>typeof win.OffscreenCanvas==='function'?new win.OffscreenCanvas(1,1):doc.createElement('canvas');
    const measurer=createCanvas().getContext('2d');
    function faceFor(role,renderer){
      let faces=renderer?renderers.get(renderer):firstFaces;
      if(!faces){faces=new Map();renderers.set(renderer,faces)}
      let face=faces.get(role);if(face)return face;
      if(typeof native.glyphFace!=='function')return null;
      const family=stacks[role];
      face=native.glyphFace(family,{name:'dfo-font-'+role+'-'+(++serial),raster:64,page:1024});
      // Seed common text before the first upload; new players' ordinary names
      // must not cause a succession of full-atlas uploads on their first frame.
      for(const code of seed)face.add(code);
      measurer.font='64px '+family;
      const sample=measurer.measureText('АgЙЁjQ'),ascent=sample.actualBoundingBoxAscent||50,descent=sample.actualBoundingBoxDescent||14;
      face.dfoAscent=ascent*45/64;face.dfoHeight=(ascent+descent)*45/64;
      faces.set(role,face);stats.faces++;return face;
    }
    const roleOf=fnt=>fnt?.dfoFontRole==='book'?'book':fnt?.fontName==='FONT0000'||fnt?.fontName==='FONT0004'?'title':'body';
    const classic=fnt=>fnt&&!fnt.canvas&&typeof fnt.glyphWidth==='function'&&Number.isFinite(fnt.fixedHeight)&&fnt.fixedHeight>0;
    function glyphs(face,text){
      const result=[];for(const char of text){const code=char.codePointAt(0);if(!face.glyphs.has(code))face.add(code);result.push(face.glyphs.get(code)||face.glyphs.get(63));}return result;
    }
    win.__dfoFonts=Object.freeze({
      ready,get enabled(){return enabled},stacks,bookSize,calibration:uiCalibration(win),fntBytes:bitmaps.bytes,pixelLetters:bitmaps.letters,register(parts){if(typeof parts?.glyphFace==='function')native.glyphFace=parts.glyphFace;},
      bookFont(font){
        if(!enabled||!classic(font?.fnt)||typeof native.glyphFace!=='function')return font;
        if(font.fnt.dfoFontRole==='book')return font;
        let book=bookFonts.get(font);if(book)return book;
        // A book's default font is also used by the rest of the UI. Give
        // the reader a stable view rather than changing that shared FNT.
        const fnt=Object.assign(Object.create(Object.getPrototypeOf(font.fnt)),font.fnt,{dfoFontRole:'book',fixedHeight:bookSize(titleHeights.get(font.fnt)??font.fnt.fixedHeight)});
        const owner=fontOwners.get(font)?.deref(),face=faceFor('book',owner);if(face)fnts.set(fnt,new WeakRef(face));
        book={...font,fnt};bookFonts.set(font,book);return book;
      },
      makeFont(renderer,fnt,name){
        if(!enabled||typeof native.glyphFace!=='function')return null;
        fnt.fontName??=name;if(!classic(fnt))return null;
        // Native layouts also read fixedHeight: change the logical metrics
        // with the draw, once per FNT, so the larger title cannot overlap rows.
        if(roleOf(fnt)==='title'&&!titleHeights.has(fnt)){titleHeights.set(fnt,fnt.fixedHeight);fnt.fixedHeight+=2;}
        const face=faceFor(roleOf(fnt),renderer);if(!face)return null;fnts.set(fnt,new WeakRef(face));const font={fnt,tex:null};fontOwners.set(font,new WeakRef(renderer));return font;
      },
      measure(fnt,text){
        if(!enabled||typeof text!=='string')return null;text=translate(text);
        if(fnt?.canvas&&fnt.font){measurer.font=mapFont(fnt.font);return measurer.measureText(text).width;}
        if(!classic(fnt))return null;
        const face=fnts.get(fnt)?.deref()||faceFor(roleOf(fnt));if(!face)return null;
        const scale=fnt.fixedHeight/face.dfoHeight;
        let width=0;for(const char of text){const code=char.codePointAt(0);if(!face.glyphs.has(code))face.add(code);width+=(face.glyphs.get(code)?.advance||0)*scale;}return width;
      },
      draw(renderer,font,text,x,y,scale=1,color=[1,1,1,1]){
        if(!enabled||!classic(font?.fnt)||typeof text!=='string')return null;
        const fnt=font.fnt,face=faceFor(roleOf(fnt),renderer);if(!face)return null;
        text=translate(text);const letters=glyphs(face,text),r=fnt.fixedHeight/face.dfoHeight*scale,baseline=y+face.dfoAscent*r;
        // The native renderer may evict UI textures or restore a GL context.
        // Learn its actual cache keys once per upload, without assuming their format.
        const cache=renderer.textures;
        if(cache instanceof Map)for(const page of face.pages)if(page.dfoCacheKey!=null&&cache.get(page.dfoCacheKey)!==page.tex){page.tex=null;page.dirty=true;}
        const uploads=face.flush(renderer);
        if(uploads&&cache instanceof Map)for(const page of face.pages)if(page.dfoKnownTex!==page.tex){page.dfoKnownTex=page.tex;page.dfoCacheKey=undefined;for(const [key,tex]of cache)if(tex===page.tex){page.dfoCacheKey=key;break;}}
        let cx=x,texture=null,run=[];
        const flush=()=>{if(!run.length)return;if(typeof renderer.drawScreenQuadRun==='function'){renderer.drawScreenQuadRun(texture,run,color);stats.classicBatches++;}else for(const q of run){renderer.drawScreenQuad(texture,q.dst,q.src,color);stats.classicBatches++;}run=[];};
        for(const g of letters){
          if(!g)continue;
          if(g.w>0&&g.h>0){const tex=face.texOf(g);if(texture!==tex){flush();texture=tex;}run.push({dst:{x:cx+g.offX*r,y:baseline-g.offY*r,w:g.w*r,h:g.h*r},src:g.src});stats.glyphsDrawn++;}
          cx+=g.advance*r;
        }
        flush();stats.classicDraws++;return cx-x;
      },
      stats:()=>({...stats,failures:[...stats.failures],enabled,shorthandCacheSize:fontMappings.size}),
    });
  }
  return {install,installWorker,css,mapFont,stacks,files,uiCalibration,bookSize};
});
