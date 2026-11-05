(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root?.document)api.install(root);
})(typeof globalThis==='object'?globalThis:null,function(){
  'use strict';
  const files={Gabin:'item-font-text.ttf',Flexi:'item-font-title.ttf',Ckazka:'item-font-sigil.ttf',Ritalin:'item-font-set.ttf',Wolga:'item-font-legendary.otf'};
  const stacks={body:"'DFO Gabin','DFO Flexi','DFO Ritalin',sans-serif",title:"'DFO Flexi','DFO Gabin','DFO Ritalin',sans-serif",sigil:"'DFO Ckazka','DFO Gabin','DFO Flexi',sans-serif",set:"'DFO Ritalin','DFO Gabin','DFO Flexi',sans-serif",power:"'DFO Wolga','DFO Gabin','DFO Flexi',sans-serif"};
  const seed=[...Array.from({length:95},(_,i)=>32+i),...Array.from({length:64},(_,i)=>1040+i),1025,1105,8211,8212,8230,8470,8594,177,215,8734,...Array.from({length:96},(_,i)=>160+i)];
  function css(base){
    const faces=Object.entries(files).map(([name,file])=>`@font-face{font-family:'DFO ${name}';src:url(${JSON.stringify(base+file)}) format('${file.endsWith('.otf')?'opentype':'truetype'}');font-style:normal;font-weight:400;font-display:swap;}`).join('\n');
    return faces+`\n/* DFO community fonts */
@layer dfo-community-fonts {
 :root {--display:${stacks.title}!important;--data:${stacks.body}!important;--body:${stacks.body}!important;--dfo-text-font:${stacks.body}!important;}
 :root body,:root body *,:root body *::before,:root body *::after {font-family:${stacks.body}!important;}
 :root body :is(h1,h2,h3,h4,h5,h6,[role=heading],.px-wordmark,.brand h1,.look-emblem,.window-title,.dialog-title,.panel-title) {font-family:${stacks.title}!important;}
 :root body :is(.dfo-item-group>h4,.dfo-item-stat-heading) {font-family:${stacks.body}!important;}
 :root body :is(.sigil-stage,.sigilbox .sigil-stage) {font-family:${stacks.sigil}!important;}
 :root body :is(.set-name,.setbox .set-name) {font-family:${stacks.set}!important;}
 :root body .dfo-item-power-name {font-family:${stacks.power}!important;}
 :root body :is(.dfo-item-title h3,.dfo-item-primary strong,.dfo-item-price-value) {font-family:${stacks.title}!important;}
}
/* /DFO community fonts */`;
  }
  function mapFont(font){
    if(typeof font!=='string')return font;
    const size=/^(.*?\b(?:[\d.]+(?:px|pt|em|rem|%|pc|in|cm|mm|q)|xx-small|x-small|small|medium|large|x-large|xx-large|smaller|larger)(?:\s*\/\s*(?:normal|[\d.]+[a-z%]*))?\s+)(.+)$/i.exec(font);
    const own=size&&/\bDFO (Gabin|Flexi|Ckazka|Ritalin|Wolga)\b/.exec(size[2]);
    const role=own?{Gabin:'body',Flexi:'title',Ckazka:'sigil',Ritalin:'set',Wolga:'power'}[own[1]]:'body';
    return size?size[1]+stacks[role]:font;
  }
  function install(win){
    if(win.__dfoFonts||win.__DFO_MOD_CFG__?.fonts?.enabled===false)return;
    const doc=win.document,base=new URL('.',doc.currentScript?.src||new URL('dfo-mod/dfo_fonts.js',doc.baseURI)).href;
    const style=doc.createElement('style');style.id='dfo-community-fonts';style.textContent=css(base);doc.head.append(style);
    const stats={canvasChanges:0,classicDraws:0,classicBatches:0,glyphsDrawn:0,faces:0,failures:[]};
    const native={},renderers=new WeakMap(),fnts=new WeakMap(),firstFaces=new Map();let enabled=false,serial=0;
    const translate=text=>typeof win.__translate==='function'?win.__translate(text):text;
    const contextFonts=new WeakMap();
    for(const Type of [win.CanvasRenderingContext2D,win.OffscreenCanvasRenderingContext2D]){
      if(!Type?.prototype)continue;
      const proto=Type.prototype,font=Object.getOwnPropertyDescriptor(proto,'font');
      if(!font?.get||!font?.set)continue;
      const ensure=ctx=>{const actual=font.get.call(ctx);if(contextFonts.get(ctx)!==actual){const own=mapFont(actual);font.set.call(ctx,own);contextFonts.set(ctx,font.get.call(ctx));if(own!==actual)stats.canvasChanges++;}};
      Object.defineProperty(proto,'font',{...font,get:font.get,set(value){const own=mapFont(value);font.set.call(this,own);const actual=font.get.call(this);if(/\bDFO (?:Gabin|Flexi|Ckazka|Ritalin|Wolga)\b/.test(actual))contextFonts.set(this,actual);else contextFonts.delete(this);if(own!==value)stats.canvasChanges++;}});
      for(const method of ['fillText','strokeText','measureText']){
        const original=proto[method];if(typeof original!=='function')continue;
        proto[method]=function(...args){ensure(this);return original.apply(this,args)};
      }
    }
    const fontSet=doc.fonts,load=fontSet.load.bind(fontSet),check=fontSet.check.bind(fontSet);
    fontSet.load=(font,text)=>load(mapFont(font),text);
    fontSet.check=(font,text)=>check(mapFont(font),text);
    const ready=Promise.all(Object.entries(files).map(async([name,file])=>{
      try{const face=new win.FontFace('DFO '+name,`url(${JSON.stringify(base+file)})`);await face.load();fontSet.add(face);return name;}
      catch(error){stats.failures.push({font:name,error:String(error?.message||error)});return null;}
    })).then(loaded=>{enabled=loaded.includes('Gabin')&&loaded.includes('Flexi');return enabled});
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
      faces.set(role,face);if(!firstFaces.has(role))firstFaces.set(role,face);stats.faces++;return face;
    }
    const roleOf=fnt=>fnt?.fontName==='FONT0000'||fnt?.fontName==='FONT0004'?'title':'body';
    const classic=fnt=>fnt&&!fnt.canvas&&typeof fnt.glyphWidth==='function'&&Number.isFinite(fnt.fixedHeight)&&fnt.fixedHeight>0;
    function glyphs(face,text){
      const result=[];for(const char of text){const code=char.codePointAt(0);if(!face.glyphs.has(code))face.add(code);result.push(face.glyphs.get(code)||face.glyphs.get(63));}return result;
    }
    win.__dfoFonts=Object.freeze({
      ready,get enabled(){return enabled},stacks,register(parts){if(typeof parts?.glyphFace==='function')native.glyphFace=parts.glyphFace;},
      makeFont(renderer,fnt,name){
        if(!enabled||typeof native.glyphFace!=='function')return null;
        fnt.fontName??=name;if(!classic(fnt))return null;
        const face=faceFor(roleOf(fnt),renderer);if(!face)return null;fnts.set(fnt,face);return {fnt,tex:null};
      },
      measure(fnt,text){
        if(!enabled||typeof text!=='string')return null;text=translate(text);
        if(fnt?.canvas&&fnt.font){measurer.font=mapFont(fnt.font);return measurer.measureText(text).width;}
        if(!classic(fnt))return null;
        const face=fnts.get(fnt)||faceFor(roleOf(fnt));if(!face)return null;
        const scale=fnt.fixedHeight/face.dfoHeight;
        return glyphs(face,text).reduce((sum,g)=>sum+(g?.advance||0)*scale,0);
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
      stats:()=>({...stats,failures:[...stats.failures],enabled}),
    });
  }
  return {install,css,mapFont,stacks,files};
});
