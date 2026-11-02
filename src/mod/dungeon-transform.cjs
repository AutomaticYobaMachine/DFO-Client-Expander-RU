'use strict';
// Bind by native property names and function bodies, never release-specific minified names.
const ID = '[\\w$]+', rx = s => new RegExp(s);
const need = (text, re) => { const m = re.exec(text); if (!m) throw new Error(`unsupported signature: ${re.source.slice(0, 100)}`); return m; };
const funcAt = (text, needle) => {
  const at = text.indexOf(needle); if (at < 0) throw new Error(`missing ${needle}`);
  const all = [...text.slice(0, at).matchAll(/function ([\w$]+)\(/g)];
  if (!all.length) throw new Error(`missing function for ${needle}`);
  return all.at(-1)[1];
};
const expose = (text, fields) => text + `\n;globalThis.__dfoDungeonTools={...globalThis.__dfoDungeonTools,${fields}};\n`;
function arrayOf(text, test) {
  const found = [...text.matchAll(/([\w$]+)=Object\.freeze\(\[([^\[\]]+)\]\)/g)].filter(m => {
    try { return test(/^[\d.,e+\s-]+$/.test(m[2]) ? m[2].split(',').map(Number) : JSON.parse('[' + m[2].replace(/`/g, '"').replace(/,(\s*)$/, '$1') + ']')); } catch { return false; }
  });
  if (found.length !== 1) throw new Error(`expected one data array, found ${found.length}`);
  return found[0][1];
}

function world(text) {
  const ctor = need(text, rx(`function (${ID})\\((${ID})\\)\\{let\\{TV_PLACE_LIFT:`));
  const inv = need(text, rx(`(${ID})=\\((${ID})=\\{\\}\\)=>(${ID})\\(\\{[^;]{0,250}?items:\\(\\)=>(${ID})\\.items`));
  const modes = need(text.slice(inv.index, inv.index + 2200), rx(`usingRightHand:\\(\\)=>\\((${ID})\\?\\.liveArm`))[1];
  const ledger = need(text, rx(`spawnLedger:\\(\\)=>(${ID})`))[1];
  // The ticker clock is also passed live to the existing spawned-ground host.
  const clockRead = need(text, rx(`get _spawnClock\\(\\)\\{return (${ID})\\}`))[1];
  const wall = need(text, rx(`(${ID})=>(${ID})\\(\\1\\)-(${ID}),\\{sky:`));
  const handlerName = funcAt(text, '.startsWith(`bounty:`)');
  const handler = need(text, rx(`function (${handlerName})\\((${ID}),(${ID})=null\\)\\{`));
  const tail = text.slice(handler.index, handler.index + 1400);
  const spawn = need(tail, rx(`if\\(${handler[2]}\\.startsWith\\(\`spawn:\`\\)\\)\\{(${ID})\\(${handler[2]}\\);return\\}`))[1];
  const route = need(tail, rx(`${handler[2]}===\`dest\`\\)\\{let (${ID})=[^;]+;\\1&&(${ID})\\(\\)&&(${ID})\\(\\1\\)`));
  const view = need(text, rx(`!(${ID})\\?\\.active\\|\\|!${route[2]}\\(\\)`))[1];
  const reset = need(tail, rx(`if\\((${ID})=null,${handler[2]}\\.startsWith\\(\`bounty:\`\\)\\)`));
  const luck = need(text, rx(`luck:(${ID})\\(${inv[4]},\`luck\`\\)`))[1];
  const weapon = need(text, rx(`(${ID})\\.playerWeapon\\.strikingWeapon`))[1];
  const viewOpen = `["rising","up"].includes(${view}?.state)`;
  const native = `{player:()=>${inv[4]},modes:()=>${modes},viewOpen:()=>${viewOpen},now:()=>Date.now(),serverNow:()=>Date.now()+${wall[3]},wallTime:m=>${wall[2]}(m)-${wall[3]},luck:p=>${luck}(p,"luck"),weapon:()=>${weapon}.playerWeapon?.strikingWeapon??null,spawnRecord:p=>{const k=p.px+","+p.py;if(!${ledger}.has(k,${clockRead}()))return null;const r=${ledger}.wireRow(k);return r?{seen:r[2],cleared:r[3]}:null},travel:p=>${viewOpen}&&(p.loc.spawned?${spawn}(p.key):p.summary&&${route[2]}()?${route[3]}(p.summary):false)}`;
  let out = text.replace('({TV_PLACE_LIFT:', `({__dfoWorld:${native},TV_PLACE_LIFT:`);
  if (out === text) throw new Error('missing marks host construction');
  out = out.replace(ctor[0], ctor[0].replace('{let{', `{globalThis.__dfoDungeons?.register(${ctor[2]});let{`));
  // Keep the native confirmation/attack guards and clear any queued attack first.
  // Only then intercept known dungeon marks, leaving other marks' handler intact.
  out = out.replace(reset[0], `if(${reset[1]}=null,globalThis.__dfoDungeons?.open(${handler[2]}))return;if(${handler[2]}.startsWith(\`bounty:\`))`);
  // Decorate the constructor's own return list, before projection and hit testing.
  const start = out.indexOf(`function ${ctor[1]}(`), region = out.slice(start, start + 40000);
  const list = need(region, rx(`return\\{travelViewMarks:(${ID})\\}`));
  const replace = `return{travelViewMarks:(...a)=>globalThis.__dfoDungeons?.decorate(${list[1]}(...a))??${list[1]}(...a)}`;
  out = out.slice(0, start) + out.slice(start).replace(list[0], replace);
  return out;
}

function hud(text) {
  const draw = need(text, rx(`function (${ID})\\((${ID}),(${ID}),(${ID}),(${ID}),(${ID})=null\\)\\{let (${ID})=${ID}\\.canvas;`));
  const begin = draw.index, body = text.slice(begin, begin + 15000);
  const loop = need(body, rx(`for\\(let (${ID}) of (${ID})\\)\\1\\.m\\.badge`));
  const doc = need(body, rx(`(${ID})=${draw[7]}\\.ownerDocument`))[1];
  let out = text.replace(loop[0], loop[0].replace(`${loop[1]}.m.badge`, `${loop[1]}.m.dfoDungeon&&(${loop[1]}.sp=globalThis.__dfoDungeons?.sprite(${doc},${loop[1]}.m,${draw[5]}),${loop[1]}.bk=${loop[1]}.m.dfoDungeon.signature),${loop[1]}.m.badge`));
  // Leave ordinary marks' subtitles untouched: our sprite already contains all three lines.
  out = out.replace(/([\w$]+)=([\w$]+)\.sub\?([\w$]+)\(([^,]+),\2\.sub,`sub`/g, '$1=$2.sub&&!$2.dfoDungeon?$3($4,$2.sub,`sub`');
  const box = need(out, rx(`function (${ID})\\((${ID}),(${ID})\\)\\{let (${ID})=\\2\\.look===\`place\`\\|\\|\\2\\.look===\`far\`,(${ID})=${ID}\\(\\2\\),`));
  out = out.replace(box[0], box[0].replace('{let ', `{if(${box[2]}.m.dfoDungeon&&${box[2]}.sp)return globalThis.__dfoDungeons.box(${box[2]},${box[3]});let `));
  return out;
}

function transformDungeons(rel, source, log) {
  const actions = [];
  if (/\/world-[^/]+\.js$/.test(rel)) actions.push(['dungeon.world', world]);
  if (source.includes('GetRandomBlock() failed to find a suitable block.')) actions.push(['dungeon.layout', text => {
    const size = need(text, rx(`function (${ID})\\((${ID}),(${ID})=\\{\\}\\)\\{let (${ID})=${ID}\\(\\2,\\3\\);return \\4!==\`full\`&&${ID}\\(\\2,${ID}\\[\\4\\]\\)\\?\\4:\`full\`\\}`))[1];
    const curated = need(text, rx(`\\.whole\\?(${ID}):(${ID})\\(\\1\\)`))[2];
    return expose(text, `layoutSize:${size},curated:${curated}`);
  }]);
  if (/function [\w$]+\([\w$]+\)\{let ([\w$]+)=[\w$]+\?\.dungeon\?\.blocks\?\.length\?\?0;return \1\?/.test(source)) actions.push(['dungeon.sizes', text => {
    const size = need(text, rx(`function (${ID})\\((${ID})\\)\\{let (${ID})=\\2\\?\\.dungeon\\?\\.blocks\\?\\.length\\?\\?0;return \\3\\?`))[1];
    const made = need(text, rx(`function ${ID}\\((${ID})\\)\\{let (${ID})=${ID}\\(\\1\\);if\\(!\\2\\|\\|(${ID})\\(\\1\\)\\)return null;let`))[3];
    return expose(text, `allowed:l=>!${made}(l),size:(l,on)=>{const t=globalThis.__dfoDungeonTools,s=t.layoutSize?.(l,{online:on});return s==="full"?${size}(t.curated?.(l)??l):s??null}`);
  }]);
  if (source.includes('`--tview-block-top`')) actions.push(['dungeon.hud', hud]);
  if (source.includes('maleTexture:255') && source.includes('minMetalToHit')) actions.push(['dungeon.bestiary', text => {
    const basics = need(text, rx(`(${ID})=\\{0:\\{maleTexture:255`))[1], name = funcAt(text, '43+');
    return expose(text, `basics:${basics},enemyName:${name},enemyLevel:(id,lv)=>(id&128)?lv:${basics}[id]?.level`);
  }]);
  if (source.includes('registerEncounterTableSelector: { table(index, place)')) actions.push(['dungeon.tables', text => {
    const reader = need(text, rx(`function (${ID})\\((${ID}),(${ID})=null,(${ID})=null\\)\\{if\\(\\3\\?\\.local\\|\\|\\3\\?\\.dungeon\\)`));
    const choice = need(text.slice(reader.index, reader.index + 850), rx(`let (${ID})=(${ID})\\(${reader[2]}\\);if\\(\\1\\.length<2\\)`))[2];
    return expose(text, `tables:${choice}`);
  }]);
  if (source.includes('`elite-dungeon`') && source.includes('`normal-dungeon`')) actions.push(['dungeon.elites', text => {
    const pick = funcAt(text, '`elite-dungeon`');
    // Native selection uses a private seeded RNG and only writes the supplied candidate
    // records. Four isolated candidates read its requested budget, without creating foes.
    return expose(text, `eliteSlots:(key,elite)=>${pick}(Array.from({length:4},()=>({mobileType:128,reaction:"hostile"})),key,{elite,classLevel:Infinity})`);
  }]);
  if (source.includes('AlternateRandomEnemySelection') && source.includes('`aurumCache.name`')) actions.push(['dungeon.runtime', text => {
    const alt = need(text, rx(`alternate:${ID}=(${ID})\\(\`Enhancements\`,\`AlternateRandomEnemySelection\`\\)`))[1];
    const hero = need(text, rx(`function (${ID})\\((${ID}),\\{puppet:(${ID})=!1\\}=\\{\\}\\)\\{if\\(!\\2\\|\\|!(${ID})\\(\\)\\)return null;let (${ID})=${ID}\\((${ID})\\(\\2\\),\\2\\._mentor\\?null:(${ID})\\(\\)\\)`));
    const identity = need(text, rx(`function (${ID})\\((${ID}),${ID}=${ID}\\)\\{let (${ID})=\\2\\.mapTableData\\.mapId[^]{0,350}?return\\{id:`))[1];
    const key = need(text, rx(`function (${ID})\\((${ID})\\)\\{let (${ID})=\\2\\?\\.mapTableData\\?\\.mapId;[^]{0,250}?===\`super\``))[1];
    const stand = need(text, rx(`function ${ID}\\(${ID},${ID},${ID},(${ID})=\\{\\}\\)\\{let (${ID})=\\1\\.storage===void 0\\?(${ID})\\(\\):\\1\\.storage`));
    const s = text.slice(stand.index, stand.index + 800);
    const session = need(s, rx(`${stand[1]}\\.session\\?\\?\\(\\(\\)=>(${ID})\\(${stand[2]}\\)\\)`))[1];
    const week = need(s, rx(`${stand[1]}\\.week\\?\\?(${ID})`))[1];
    const kept = need(s, rx(`(${ID})\\(${stand[2]},${ID}\\.id,${ID}\\(\\)\\)`))[1];
    return expose(text, `alternate:()=>${alt}("Enhancements","AlternateRandomEnemySelection"),hero:${hero[1]},lootOn:${hero[4]},effectiveLevel:${hero[6]},renown:${hero[7]},identity:${identity},aurumKey:${key},aurumTaken:id=>{const s=${stand[3]}(),me=${session}(s);return me?.id?${kept}(s,me.id,${week}()).includes(id):null}`);
  }]);
  if (source.includes('Number.isFinite(e.cleared)?e.cleared+') || /Number.isFinite\([\w$]+\.cleared\)\?[\w$]+\.cleared\+/.test(source)) actions.push(['dungeon.lifetime', text => {
    const m = need(text, rx(`function (${ID})\\((${ID})\\)\\{if\\(!\\2\\)return NaN;let ${ID}=Number.isFinite\\(\\2\\.cleared\\)`));
    return expose(text, `spawnDeath:${m[1]}`);
  }]);
  if (source.includes('|aurum`')) actions.push(['dungeon.aurum', text => {
    const m = need(text, rx(`(${ID})=(${ID})=>\\d+\\+Math.floor\\(${ID}\\(\`\\$\\{\\2\\}\\|aurum\`\\)\\*\\d+\\)`));
    return expose(text, `aurumAmount:${m[1]}`);
  }]);
  if (/for\(let [\w$]+=0;[\w$]+<[\w$]+\([\w$]+\.dungeon,[\w$]+\.day\)/.test(source)) actions.push(['dungeon.ore', text => {
    const m = need(text, rx(`function (${ID})\\((${ID})\\)\\{let ${ID}=\\[\\];for\\(let (${ID})=0;\\3<${ID}\\(\\2\\.dungeon,\\2\\.day\\)`));
    return expose(text, `veins:${m[1]}`);
  }]);
  if (/=\([\w$]+,[\w$]+=null\)=>[\w$]+\(10\*Math.min\(/.test(source)) actions.push(['dungeon.renown', text => {
    const m = need(text, rx(`(${ID})=\\((${ID}),(${ID})=null\\)=>${ID}\\(10\\*Math.min\\(${ID}\\(\\2,1,30\\),${ID}\\(\\3\\)\\)\\)`));
    return expose(text, `killXp:${m[1]}`);
  }]);
  if (/=\(\{elite:[\w$]+=!1,wild:[\w$]+=!1,superTier:/.test(source)) actions.push(['dungeon.respawn', text => {
    const m = need(text, rx(`(${ID})=\\(\\{elite:${ID}=!1,wild:${ID}=!1,superTier:${ID}=!1\\}=\\{\\}\\)=>`));
    return expose(text, `respawn:${m[1]}`);
  }]);
  if (source.includes('veteranFrom:75')) actions.push(['dungeon.scaling', text => {
    const share = arrayOf(text, xs => xs.length === 19 && xs.every(n => typeof n === 'number' && n >= 0 && n <= 1));
    const progression = funcAt(text, 'challengeLevels:Math.round('), standing = need(text, rx(`(${ID})=(${ID})=>\\(\\{veteran:(${ID})\\(\\2\\),edge:`))[1];
    const quality = funcAt(text, '<.75'), place = need(text, rx(`(${ID})=(${ID})=>Number.isFinite\\(\\2\\)\\?${ID}\\(\\(\\2-${ID}\\.from\\)/`))[1];
    const fshare = need(text, rx(`(${ID})=\\((${ID}),(${ID})\\)=>\\3\\?1:`))[1];
    const ids = need(text, rx(`(${ID})=Object.freeze\\(\\[\\.\\.\\.${ID},\\.\\.\\.${ID}\\]\\),${ID}=Object.freeze\\(\\{veteranFrom:`))[1];
    return expose(text, `scaling:${progression},standing:${standing},share:t=>${share}[t]??0,foeShare:${fshare},placeVeteran:${place},challenge:${quality},skillIds:${ids}`);
  }]);
  if (source.includes('magic:Object.freeze({base:100,perTier:15')) actions.push(['dungeon.rewards', text => {
    const rank = arrayOf(text, xs => xs.length === 19 && xs.every(Number.isInteger) && xs.every(n => n >= 0 && n <= 21) && Math.max(...xs) > 10);
    const fam = arrayOf(text, xs => xs.length === 19 && xs[0] === 'undead' && xs[1] === 'brute');
    const chance = funcAt(text, 'rollerLevel:');
    const families = need(text, rx(`(${ID})=Object.freeze\\(\\{undead:Object.freeze\\(\\[`))[1];
    const legendary = need(text, rx(`(${ID})=(?:Object\\.freeze\\()?\\[\\{id:\`[^\`]+\`,name:`))[1];
    const found = need(text, rx(`(${ID})=(${ID})=>typeof \\2==\`string\`\\?(${ID})\\[\\2\\]\\?\\?${ID}\\(\\2\\)\\?\\.found\\?\\?null:null`))[1];
    const find = need(text, rx(`function (${ID})\\(\\)\\{let (${ID})=1;for\\(let ${ID} of ${ID}\\.values\\(\\)\\)try\\{let ${ID}=${ID}\\(\\)`))[1];
    return expose(text, `rank:t=>${rank}[t]??null,family:t=>${fam}[t]??null,chances:${chance},legendaryFind:${find},foeFamily:id=>Object.keys(${families}).find(k=>${families}[k].includes(id))??null,signatures:f=>${legendary}.filter(r=>${found}(r.id)===f).map(r=>({id:r.id,name:r.name}))`);
  }]);
  let text = source;
  for (const [id, run] of actions) {
    if (text.includes(`/*${id}*/`)) continue;
    try { text = run(text) + `\n/*${id}*/\n`; log.push([id, 1]); }
    catch (e) { log.push([`${id}!error ${e.message}`, 0]); }
  }
  return text;
}
module.exports = { transformDungeons };
