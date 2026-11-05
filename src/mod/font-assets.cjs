'use strict';
// The active resource view contains community faces. Original game packs stay
// immutable so the upstream updater can continue validating its own manifests.
const data=require('./page/dfo_font_data.js');
const cache=new Map();
function fnt(name){
 const entry=Object.values(data.fonts).find(f=>f.name===String(name).toUpperCase())||data.fonts['7'];
 if(!cache.has(entry.name))cache.set(entry.name,Buffer.from(entry.base64,'base64'));
 return cache.get(entry.name);
}
function replacement(rel){
 if(/(?:^|\/)FONT\d{4}\.FNT$/i.test(rel))return {body:fnt(rel.split('/').at(-1).slice(0,-4)),type:'application/octet-stream'};
 if(/\.(?:ttf|otf|woff2?)$/i.test(rel))return {file:/FONT000[04]/i.test(rel)?'item-font-title.ttf':'item-font-text.ttf',type:'font/ttf'};
 return null;
}
// Curly interpolation in JS template strings is balanced too. Only font-face
// declarations are removed, not ordinary CSS or image data URIs.
function stripFaces(text){
 let out='',at=0,count=0,match;const re=/@font-face\s*\{/gi;
 while((match=re.exec(text))){
  let end=re.lastIndex,depth=1;
  for(;end<text.length&&depth;end++){if(text[end]==='{')depth++;else if(text[end]==='}')depth--;}
  if(depth)break;
  out+=text.slice(at,match.index);at=end;re.lastIndex=end;count++;
 }
 return {text:count?out+text.slice(at):text,count};
}
module.exports={fnt,replacement,stripFaces};
