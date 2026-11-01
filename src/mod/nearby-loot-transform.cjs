'use strict';
// Bind only to property names and structural signatures, never to a particular build's minified identifiers.
const ID = '[\\w$]+';
const rx = (s, flags) => new RegExp(s, flags);
const need = (s, pattern) => { const m = pattern.exec(s); if (!m) throw new Error(`unsupported signature: ${pattern.source.slice(0, 100)}`); return m; };

function outdoor(text, kind) {
  const pool = need(text, rx(`(${ID})=(${ID})=>\\2\\.startsWith\\(\`foeCorpse:\`\\)\\?(${ID}):(${ID})`));
  const inv = need(text, rx(`(${ID})=\\((${ID})=\\{\\}\\)=>(${ID})\\(\\{[^;]{0,250}?items:\\(\\)=>(${ID})\\.items`));
  const start = text.indexOf('bagItems:()=>', inv.index), slice = text.slice(start, pool.index);
  const drop = need(slice, rx(`physicalDropOn:\\(\\)=>(${ID})\\.physical\\.on\\(\\)`))[1];
  const modes = need(slice, rx(`usingRightHand:\\(\\)=>\\((${ID})\\?\\.liveArm`))[1];
  const talk = need(text.slice(inv.index, start), rx(`say:(${ID})=>(${ID})\\.say\\(\\1\\)`))[2];
  const feet = need(text, rx(`(${ID})=\\(\\)=>\\{let (${ID})=(${ID})\\?\\[\\.\\.\\.(${ID})\\.pos\\]`));
  const collider = need(text.slice(feet.index, feet.index + 400), rx(`(${ID})\\.raycast\\(${feet[2]},\\[0,-1,0\\],10\\)`))[1];
  const paused = need(text, rx(`blocked:(${ID})\\(\\),entity:${inv[4]},onTap:`))[1];
  const quest = need(text.slice(pool.index, pool.index + 750), rx(`getQuest:(${ID}=>[^,]{1,150}),took:`))[1];
  const bonus = kind === 'world' ? need(text, rx(`(${ID})&&(${ID})\\(\`pile\`,\\1\\)`))[2] : null;
  const pileTaken = bonus ? `pileTaken:p=>${bonus}("pile",p),` : '';
  const code = `globalThis.__dfoLoot?.register(${JSON.stringify(kind)},{kind:"exterior",entity:${inv[4]},feet:()=>${feet[3]}?${feet[4]}.pos:null,collider:()=>${collider},blocked:()=>${paused}(),resolve:()=>${modes}?.mode&&${modes}.mode!=="exterior"?(${modes}.dfoNearbyLoot??false):null,${pileTaken}getQuest:${quest},pools:()=>[${pool[3]},${pool[4]}],dropped:()=>${drop},say:s=>${talk}.say(s),open:loot=>{const w=${inv[1]}({loot});if(w)${talk}.showOverlay(w);return w}})`;
  return text.slice(0, pool.index) + text.slice(pool.index).replace(pool[0], `${pool[1]}=(${code},${pool[2]}=>${pool[2]}.startsWith(\`foeCorpse:\`)?${pool[3]}:${pool[4]})`);
}

function modes(text) {
  const door = need(text, rx(`openLootList\\((${ID}),(${ID})\\)\\{if\\((${ID})===\`dungeon\`\\)return!!(${ID})\\?\\.openLootList`));
  const body = need(text, rx(`function (${ID})\\((${ID}),(${ID})=null\\)\\{let (${ID})=(${ID})=>\\5\\.startsWith\\(\`foeCorpse:\`\\)\\?(${ID}):(${ID});`));
  const tail = text.slice(body.index, body.index + 650);
  const factory = need(tail, rx(`(${ID})\\(\\{loot:(${ID})\\?\\{\\.\\.\\.(${ID}),pile:\\2\\}:\\3\\}\\);return (${ID})\\(`));
  const entity = need(tail, rx(`getQuest:(${ID})=>(${ID})\\?\\.machine`));
  // The quick-loot call identifies the entity immediately before its say closure.
  const who = need(tail, rx(`${body[2]},${ID},(${ID}),${ID}=>`))[1];
  const feet = need(text, rx(`player:\\(\\)=>\\(\\{feet:(${ID})\\.pos,eye:`))[1];
  const drops = need(text, rx(`droppedPool\\(\\)\\{return ${door[3]}===\`dungeon\`\\?${door[4]}\\?\\.droppedPool\\?\\.\\(\\)\\?\\?null:${door[3]}===\`interior\`\\?(${ID}):null\\}`))[1];
  const paused = need(text, rx(`get uiOverlayActive\\(\\)\\{return (${ID})\\(\\)\\}`))[1];
  const transitioning = need(text, rx(`get transitioning\\(\\)\\{return (${ID})\\}`))[1];
  const interior = need(text.slice(door.index, door.index + 500), rx(`${door[3]}!==\`interior\`\\|\\|!(${ID})`))[1];
  const talk = need(tail, rx(`\\.takeLoot\\(${body[2]},${ID}=>(${ID})\\(`))[1];
  const pileKey = need(text, rx(`(${ID})\\.containerKey\\?\`int:\\$\\{(${ID})\\((${ID})\\)\\}:\\$\\{\\3\\?\\.buildingKey\\?\\?\`\`\\}:\\$\\{\\1\\.containerKey\\}\`:\\1`));
  const bonus = need(text, rx(`(${ID})&&(${ID})\\(\`pile\`,\\1\\)`))[2];
  const code = `get dfoNearbyLoot(){if(${door[3]}==="dungeon")return ${door[4]}?.dfoNearbyLoot;if(${door[3]}!=="interior")return null;return {kind:"interior",entity:${who},feet:()=>${feet}.pos,collider:()=>${interior}?.collider,blocked:()=>${paused}()||${transitioning},pileTaken:p=>${bonus}("pile",p.containerKey?\`int:\${${pileKey[2]}(${pileKey[3]})}:\${${pileKey[3]}?.buildingKey??""}:\${p.containerKey}\`:p),pools:()=>[${body[6]},${body[7]}],dropped:()=>${drops},say:s=>${talk}(s),getQuest:uid=>${entity[2]}?.machine.getQuest(uid)??null,open:loot=>{const w=${factory[1]}({loot});${factory[4]}(w);return w}}},`;
  return text.slice(0, door.index) + code + text.slice(door.index);
}

function dungeon(text) {
  const start = need(text, rx(`takeLoot\\((${ID}),(${ID})=\`grab\`,(${ID})=null\\)\\{`));
  const end = text.indexOf('openLootList(', start.index);
  if (end < 0) throw new Error('missing dungeon list door');
  let body = text.slice(start.index, end);
  const tail = need(body, rx(`let (${ID})=(${ID})\\(${start[1]}\\),(${ID})=(${ID})\\((${ID}),(${ID}),\\{lootHooks:(${ID}),lootKey:\\1\\}\\);return \\3&&\\((${ID})=\\3\\),\\3&&\\1&&\\((${ID})=\\1,(${ID})\\(\\1,\\{claim:!0\\}\\)\\),\\3&&(${ID})&&(${ID})\\(\\11\\.kind,\\11\\.key\\),\\5\\.length`));
  const [key, canonical, win, factory, items, emptied, hooks, overlay, openKey, publish, find, silver] = tail.slice(1);
  const drop = need(body, rx(`if\\((${ID})\\.physical\\.owns\\(`))[1];
  const f = need(text, rx(`function ${factory}\\(${ID},${ID}=null,\\{wagonPrompt:${ID}=!1,lootHooks:${ID}=null,lootKey:${ID}=null\\}=\\{\\}\\)\\{return ${ID}\\(\\{[\\s\\S]{0,400}?items:\\(\\)=>(${ID})\\.items`));
  const near = need(text.slice(f.index, f.index + 1000), rx(`nearExit:\\(\\)=>!!(${ID})&&`))[1];
  const insertion = `if(_dfoVisit){const _dfoKey=${canonical}(${start[1]}),_dfoWas=${openKey};let _dfoMoved=false;try{if(_dfoKey){${openKey}=_dfoKey;${publish}(_dfoKey,{claim:true})}_dfoMoved=_dfoVisit(${items})!==false;return _dfoMoved}finally{if(_dfoMoved&&${find})${silver}(${find}.kind,${find}.key);${openKey}=_dfoWas;if(_dfoKey)${publish}(_dfoKey);${emptied}?.();${drop}.releaseEmptied()}}`;
  body = body.replace(start[0], start[0].replace('=null){', '=null,_dfoVisit=null){'));
  const guard = `if(${overlay}&&!${overlay}.done)return ${items}.length;`;
  if (!body.includes(guard)) throw new Error('missing dungeon overlay guard');
  body = body.replace(guard, `if(!_dfoVisit&&${overlay}&&!${overlay}.done)return ${items}.length;`);
  const quick = `if(!${start[3]}&&`;
  if (!body.includes(quick)) throw new Error('missing dungeon quick door');
  body = body.replace(quick, insertion + quick);
  const quest = need(body, rx(`getQuest:(${ID}=>[^,]{1,150}),took:`))[1];
  const getter = `get dfoNearbyLoot(){const api=this;return {kind:"dungeon",entity:${f[1]},getQuest:${quest},feet:()=>${near},collider:()=>api.collider,blocked:()=>api.uiOverlayActive,sources:()=>api.lootTargets().filter(t=>/^(loot|corpse|droppedLoot):/.test(t.key)&&!t.key.startsWith("droppedLoot:pi")).filter(t=>!t.key.startsWith("droppedLoot:")||globalThis.__dfoLootGround(${drop}.pileFor(t.key))).map(t=>({...t,items:()=>api.lootContents(t.key),visit:fn=>api.takeLoot(t.key,"grab",[],fn)})),open:loot=>{if(!api.openLootList(loot.items(),loot))return null;return api.overlayWindow()}}},`;
  return text.slice(0, start.index) + getter + body + text.slice(end);
}

function inventory(text) {
  const gate = need(text, rx(`(${ID})=\\(\\)=>(${ID})\\.has\\((${ID})\\?\\.kind\\)&&!(${ID})\\((${ID})\\)`));
  const sort = need(text.slice(gate.index, gate.index + 350), rx(`!(${ID})\\(${ID}\\(${gate[5]},${ID}\\(\\)\\),\\{nameOf:(${ID})\\}`));
  const plan = need(text, rx(`(${ID})\\((${ID}),\\{bag:(${ID}),entity:${gate[5]}\\.entity,mode:\`remove\``));
  let out = text.replace(gate[0], `${gate[1]}=()=>${gate[5]}.loot?.nearby||(${gate[2]}.has(${gate[3]}?.kind)&&!${gate[4]}(${gate[5]}))`);
  const title = rx(`(${ID})===\`storage\`&&typeof (${ID})\\.loot\\?\\.title`);
  const titleMatch = need(out, title);
  out = out.replace(title, `(${titleMatch[1]}===\`storage\`||${titleMatch[2]}.loot?.nearby)&&typeof ${titleMatch[2]}.loot?.title`);
  const notice = need(text.slice(gate.index, gate.index + 400), rx(`if\\((${ID})=null,!${sort[1]}`))[1];
  const picked = need(text.slice(gate.index, gate.index + 400), rx(`return ${ID}\\(\\);(${ID})=null,`))[1];
  const held = rx(`Promise\\.resolve\\((${ID})\\((${ID}),(${ID}),(${ID}),(${ID})\\)\\)\\.then\\(\\(\\)=>\\{`);
  need(out, held);
  out = out.replace(held, (all) => all.replace('then(()=>{', `then(_dfoOk=>{if(${gate[5]}.loot?.nearby){${picked}=null;if(_dfoOk===false)${notice}="Лут уже недоступен или превышен допустимый вес.";}`));
  out = out.replace(/([\w$]+)\(`inventory.store.chestShut`,`The chest stays shut\.`\)/g,
    all => `(${gate[5]}.loot?.nearby?"Лут уже недоступен или превышен допустимый вес.":${all})`);
  const update = need(text, rx(`\\.then\\(\\(\\)=>\\{${ID}\\.delete\\(${ID}\\),(${ID})\\(\\),(${ID})\\(\\)\\}`));
  const take = need(text, rx(`if\\((${ID})\\.has\\((${ID})\\.kind\\)\\)\\{let (${ID})=${ID}\\(\`button\`,\`act\`,${ID}\\(\`inventory.store.takeAll\`,\`Take all\`\\)\\);\\3\\.onclick=\\(\\)=>(${ID})\\(\`take\`\\)`));
  const shown = need(text, rx(`function ${take[4]}\\((${ID})\\)\\{${notice}=null;let (${ID})=\\1===\`take\`,${ID}=\\2\\?(${ID})\\(${take[2]}\\.items,(${ID})\\(\\),(${ID})\\)`));
  out = out.replace(take[0], take[0].replace('if(', `if(!${gate[5]}.loot?.nearby&&`));
  const acts = need(out, rx(`let (${ID})=${ID}\\(\`div\`,\`remoteacts\`\\)`))[1];
  const head = rx(`(${ID})\\.append\\(${acts}\\),(${ID})\\.append\\(\\1\\)`);
  need(out, head);
  out = out.replace(head, (all, h, col) => `${h}.append(${acts}),globalThis.__dfoLootUI?.toolbar(${h},${gate[5]}.loot,()=>{${update[1]}();${update[2]}()},{shown:()=>${shown[3]}(${gate[5]}.loot.items(),${shown[4]}(),${shown[5]}),close:()=>${gate[5]}.onExit?.(),notice:text=>{${notice}=text;${picked}=null;${update[1]}();${update[2]}()}}),${col}.append(${h})`);
  return out + `\n;globalThis.__dfoLootTools={...globalThis.__dfoLootTools,planTake:${plan[1]},sort:${sort[1]},nameOf:${sort[2]}};\n`;
}

function arrows(text) {
  const at = text.indexOf('You collect the arrows.');
  const before = text.slice(Math.max(0, at - 200), at);
  const m = need(before, rx(`(${ID})\\((${ID})\\)\\?\\((${ID})\\.items=\\3\\.items\\|\\|\\[\\]`));
  const i = Math.max(0, at - 200) + m.index;
  return text.slice(0, i) + text.slice(i).replace(m[0], m[0].replace('?(', '&&!globalThis.__dfoLootVisiting?('));
}

function transformNearby(rel, text, log) {
  const actions = [];
  if (/\/world-[^/]+\.js$/.test(rel)) actions.push(['loot.world', t => outdoor(t, 'world')]);
  if (/\/exterior-[^/]+\.js$/.test(rel)) actions.push(['loot.exterior', t => outdoor(t, 'exterior')]);
  if (text.includes('get questOverlay(){')) actions.push(['loot.modes', modes]);
  if (text.includes('openLootList(') && text.includes('lootKey:') && text.includes('lootContents(') && text.includes('takeLoot(')) actions.push(['loot.dungeon', dungeon]);
  if (text.includes('`storesearch`') && text.includes('sortbtn')) actions.push(['loot.inventory', inventory]);
  if (/\/itemTransfer-[^/]+\.js$/.test(rel)) actions.push(['loot.transfer', t => {
    const m = need(t, rx(`function (${ID})\\((${ID}),\\{bag:(${ID})=\\[\\],entity:(${ID})=null,mode:`));
    const transfer = need(t, rx(`function (${ID})\\((${ID}),(${ID}),(${ID}),(${ID}),\\{entity:(${ID})=null,fromLocal:(${ID})=!1,toPlayer:`));
    return t + `\n;globalThis.__dfoLootTools={...globalThis.__dfoLootTools,planTake:${m[1]},applyTransfer:${transfer[1]}};\n`;
  }]);
  if (text.includes('You collect the arrows.')) actions.push(['loot.arrows', arrows]);
  let out = text;
  for (const [id, run] of actions) {
    if (out.includes(`/*${id}*/`)) continue;
    try { out = run(out) + `\n/*${id}*/\n`; log.push([id, 1]); }
    catch (e) { log.push([`${id}!error ${e.message}`, 0]); }
  }
  return out;
}
module.exports = { transformNearby };
