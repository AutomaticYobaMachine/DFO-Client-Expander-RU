'use strict';
// Bind to the shared native card and pure item readers, never to minified names.
const ID = '[\\w$]+';
// Start identifier searches at token boundaries. Without this guard, a missing binding can
// retry at every character of a long embedded base64 word in a worker (quadratic backtracking).
const rx = source => new RegExp(`(?<![\\w$])${source}`);
const escapeRx = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function need(text, pattern) {
  const match = pattern.exec(text);
  if (!match) throw new Error('unsupported item-card signature: ' + pattern.source.slice(0, 100));
  return match;
}

function inventory(text) {
  const head = need(text, /function ([\w$]+)\(([\w$]+),([\w$]+),([\w$]+)=([\w$]+),\{body:([\w$]+)=!1,own:([\w$]+)=!0\}=\{\}\)\{/);
  const tail = need(text.slice(head.index, head.index + 16000), /return\{c:([\w$]+),line:([\w$]+),big:([\w$]+)\}/);
  if ([...text.matchAll(/return\{c:[\w$]+,line:[\w$]+,big:[\w$]+\}/g)].length !== 1) throw new Error('ambiguous shared card');
  const piece = need(text, /([\w$]+)\.unshift\(\.\.\.([\w$]+)\(([\w$]+),([\w$]+)\(\3\)\)\);\{let ([\w$]+)=([\w$]+)\(\3\);/);
  const known = need(text.slice(piece.index, piece.index + 1100), /let ([\w$]+)=([\w$]+)\(([\w$]+)\);if\(\1\|\|![\w$]+\.includes\(`Unidentified`\)\)/)[2];
  const credit = need(text.slice(head.index, head.index + tail.index), /[\w$]+\(`Worth`,([\w$]+)\([\w$]+\)\)/)[1];
  const item = head[2];
  if (text.includes('__dfoItemCardContext')) throw new Error('item-card helper name collision');
  // Resolve game imports at module scope: minifiers reuse those identifiers as card-local variables.
  const context = `\nfunction __dfoItemCardContext(_item,_body){return {body:_body,known:()=>${known}(_item),meta:[${piece[6]}(_item),...${piece[2]}(_item,${piece[4]}(_item))].filter(Boolean),credit:()=>${credit}(_item)}}\n`;
  const call = `try{globalThis.__dfoItemCards?.dress(${tail[1]},${tail[2]},__dfoItemCardContext(${item},${head[6]}))}catch(_dfoItemCard){}`;
  const at = head.index + tail.index;
  let out = text.slice(0, at) + call + text.slice(at);
  const fitCard = /function ([\w$]+)\(([\w$]+),([\w$]+)\)\{if\(!\2\|\|!\(\3>0\)\)return\[\];\2\.style\.maxHeight=/;
  const card = need(out, fitCard);
  out = out.replace(card[0], card[0].replace('{if(', `{if(globalThis.__dfoItemCards?.fitCard(${card[2]},${card[3]}))return[];if(`));
  const fitTip = /function ([\w$]+)\(([\w$]+),([\w$]+)=\(globalThis\.innerHeight\?\?0\)-16\)\{/;
  const tip = need(out, fitTip);
  out = out.replace(tip[0], `${tip[0]}if(globalThis.__dfoItemCards?.fitTip(${tip[2]},${tip[3]}))return;`);
  return out + context;
}

function templates(text) {
  const value = need(text, /([\w$]+)=([\w$]+)=>Number\.isFinite\(\2\?\.value\)\?\2\.value:([\w$]+)\(\2\?\?\{\}\)/);
  const base = need(text, rx(`function ${escapeRx(value[3])}\\((${ID}),(${ID})=(${ID})\\)\\{let ${ID}=\\2\\(\\1\\.templateIndex\\)`));
  const variant = need(text, /function ([\w$]+)\(([\w$]+)\)\{let ([\w$]+)=\2\?[\w$]+\(\2\.templateIndex\):null;return \3\?\.variantWord\?\3\.variantWord\(\2\):``\}/);
  return text + `\n;globalThis.__dfoItemCards?.register({value:${value[1]},template:${base[3]},variantWord:${variant[1]}});\n`;
}

function materials(text) {
  const material = need(text, /function ([\w$]+)\(([\w$]+)\)\{let ([\w$]+)=\2\?\.material;return \2\?\.group===`Armor`\?/)[1];
  const materialText = need(text, rx(`(${ID})=(${ID})=>(${ID})\\[${escapeRx(material)}\\(\\2\\)\\]\\?\\?\x60\x60`));
  // Other chunks carry a tree-shaken decoder but no complete public reader; leave those alone.
  const labelMatch = rx(`(${ID})=(${ID})=>${escapeRx(materialText[3])}\\[\\2\\]\\?\\?\\2`).exec(text);
  if (!labelMatch) return null;
  const label = labelMatch[1];
  const rareAt = text.indexOf('[`rare`,`legendary`,`aetheric`,`gilded`]');
  if (rareAt < 0) throw new Error('missing material visibility gate');
  const says = need(text.slice(rareAt, rareAt + 900), /([\w$]+)=([\w$]+)=>!!([\w$]+)\(\2\)&&\(![\w$]+\(\2\)\|\|[\w$]+\(\2\)\)/);
  const gear = need(text, rx(`function ${escapeRx(says[3])}\\((${ID})\\)\\{return`));
  const physical = need(text.slice(gear.index, gear.index + 400), /!([\w$]+)\(([\w$]+)\)&&!([\w$]+)\(\2\)/);
  return text + `\n;globalThis.__dfoItemCards?.register({material:${material},materialLabel:${label},saysMaterial:${says[1]},isAmmo:${physical[1]},isHandWraps:${physical[3]}});\n`;
}

function powers(text) {
  const power = need(text, /([\w$]+)\.legendary\?([\w$]+)\(\1\.legendary\):\1\.gilded\?\2\(\1\.gilded\):null/)[2];
  return text + `\n;globalThis.__dfoItemCards?.register({power:_item=>${power}(_item?.legendary??_item?.imprint??_item?.gilded)});\n`;
}

function prices(text) {
  const cost = need(text, /function ([\w$]+)\([\w$]+,[\w$]+=\[\],\{quality:[\w$]+=0,priceAdjustment:[\w$]+=(?:1e3|1000),/)[1];
  // Bind the actual Sell arm, including found-condition/craft/Daedric/resale rules.
  need(text, /case`Sell`:\{[^}]{0,150}?[\w$]+\([\w$]+\(([\w$]+)\),[\w$]+,[\w$]+,[\w$]+\(\1,\{online:[\w$]+\}\)\)/);
  return text + `\n;globalThis.__dfoItemCards?.register({sale:_item=>${cost}('Sell',[_item],{quality:10,priceAdjustment:1000,online:true})});\n`;
}

function currency(text) {
  const gold = need(text, /([\w$]+)=([\w$]+)=>\2\?\.group===`Currency`&&\2\?\.templateIndex===[\w$]+/)[1];
  return text + `\n;globalThis.__dfoItemCards?.register({isGold:${gold}});\n`;
}
function effectLabels(text) {
  const labels=need(text,/([\w$]+)=\(\)=>([\w$]+)\(`itemPowers`,/)[1];
  return text+`\n;globalThis.__dfoItemCards?.register({effectLabels:${labels}});\n`;
}

function transformItemCards(rel, text, log) {
  // Worker entries cannot display DOM cards; they duplicate large, tree-shaken item tables.
  if (/Worker-[^/]+\.js$/.test(rel)) return text;
  const jobs = [];
  if (/\/enhancedInventory-[^/]+\.js$/.test(rel) && text.includes('return{c:') && text.includes('tip-tight')) jobs.push(['itemCards.inventory', inventory]);
  if (text.includes('.variantWord?') && /Number\.isFinite\([\w$]+\?\.value\)/.test(text)) jobs.push(['itemCards.values', templates]);
  if (text.includes('HelmAndShieldMaterialDisplay') && text.includes('[`rare`,`legendary`,`aetheric`,`gilded`]')) jobs.push(['itemCards.materials', materials]);
  if (text.includes('Imprint: ') && text.includes('.legendary?') && text.includes('.gilded?')) jobs.push(['itemCards.powers', powers]);
  if (text.includes('modeActionEnabled:') && /function [\w$]+\([\w$]+,[\w$]+=\[\],\{quality:/.test(text)) jobs.push(['itemCards.prices', prices]);
  if (/\/equip-[^/]+\.js$/.test(rel) && text.includes('`Currency`')) jobs.push(['itemCards.currency', currency]);
  if (text.includes('`itemPowers`')) jobs.push(['itemCards.effectLabels',effectLabels]);
  let out = text;
  for (const [id, run] of jobs) {
    if (out.includes(`/*${id}*/`)) continue;
    try { const next = run(out); if (next == null) continue; out = next + `\n/*${id}*/\n`; log.push([id, 1]); }
    catch (error) { log.push([`${id}!error ${error.message}`, 0]); }
  }
  return out;
}
module.exports = { transformItemCards };
