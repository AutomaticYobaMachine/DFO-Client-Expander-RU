'use strict';
// SPELLBOOK v2 TRANSFORM (hooks enhancedSpellbook, deepWaterRuntime opener/firmament, wagonKinds skills,
// spellcast modifier folds, lootPowers attune regen, and optional spellbookWindow SFX).
// Every match uses unminified structural anchors (string literals, property names, syntax shapes),
// skips Web Workers, and fails closed to native game behavior if the page script is absent or throws.
const ID = '[\\w$]+';
const rx = (s, f) => new RegExp(s, f);
const esc = (s) => s.replace(/[$]/g, '\\$');
const put = (s, from, to) => s.replace(from, () => to);

function once(text, re, name) {
  const all = text.match(rx(re.source, 'g')) || [];
  if (all.length !== 1) throw new Error(`spellbook ${name}: ${all.length} places`);
  const m = re.exec(text);
  if (!m) throw new Error(`spellbook ${name}: missing`);
  return m;
}

const ENV_INIT = '(globalThis.__dfoSpellbookEnv=globalThis.__dfoSpellbookEnv||{})';

// 1. enhancedSpellbook-*.js: intercept mountEnhancedSpellbook(host, deps) and hand full live bridge to __dfoSpellbook.mount
function hookEnhancedSpellbook(text, hits) {
  // Structural match on bookModel (Z), mountEnhancedSpellbook (oe), hotbar/quickslot/pvp/icon/mutate helpers
  const bookM = once(
    text,
    rx(`function (${ID})\\((${ID}),(${ID})\\)\\{return\\(\\2\\?\\?\\[\\]\\)\\.map\\(\\((${ID}),(${ID})\\)=>\\(\\{i:\\5,name:(${ID})\\(\\4\\)\\?\\?\`\`,cost:(${ID})\\(\\4,\\3\\),undeletable:\\4\\?\\.tag===\`vampire\`\\?(${ID})\\(\\):\\4\\?\\.tag===\`lycanthrope\`\\?(${ID})\\(\\):null,effects:(${ID})\\(\\4\\)\\.map\\((${ID})\\)\\.filter\\(Boolean\\),frame:(${ID})\\(\\4\\),spell:\\4\\}\\)\\)\\}`),
    'bookModel',
  );
  const [, , , , , , spellNameFn, calcCostFn, vampMsgFn, lycanMsgFn, effectsOfFn, , spellFrameFn] = bookM;

  const readyM = once(
    text,
    rx(`\\.onReady\\?\\.\\(${ID}\\.spell,\\{noSpellPointCost:${ID}\\.spell\\?\\.tag===(${ID})\\}\\)`),
    'lycanTag',
  );
  const lycanTagVar = readyM[1];

  const hotbarM = once(
    text,
    rx(`(?:if\\(|,)(${ID})\\(\\)\\)\\{let (${ID})=(${ID})\\((${ID})\\.spell,\\{spell:!0\\}\\),${ID}=${ID}\\(\`button\`,\`act sb-slot\\$\\{\\2>=0\\?\` on\`:\`\`\\}\`,\\2>=0\\?\`Off hotbar \\$\\{\\2\\+1\\}\`:\`Add to hotbar\`\\);${ID}\\.onclick=\\(\\)=>\\{${ID}=(${ID})\\(\\4\\.spell\\),${ID}\\(\\)\\},${ID}\\.append\\(${ID}\\)\\}else\\{let (${ID})=Number\\.isFinite\\(\\4\\.spell\\?\\.index\\)&&(${ID})\\(\\)\\?\\.index===\\4\\.spell\\.index,${ID}=${ID}\\(\`button\`,\`act sb-slot\\$\\{\\6\\?\` on\`:\`\`\\}\`,\\6\\?\`Unslot\`:\`Quickslot\`\\);${ID}\\.onclick=\\(\\)=>\\{\\6\\?(${ID})\\(\\):(${ID})\\(\\4\\.spell\\),`),
    'hotbarApi',
  );
  const [, hotbarEnabledFn, , hotbarSlotFn, , toggleHotbarFn, , quickslotGetFn, quickslotClearFn, quickslotSetFn] = hotbarM;

  const dragM = once(
    text,
    rx(`\\.onpointerdown=(${ID})=>\\{(${ID})\\(\\)&&${ID}===null&&(${ID})\\(\\1,\\{kind:\`spell\`,spell:(${ID})\\.spell\\},\\{sigil:\\4\\.spell\\?\\.noIcon\\?(${ID})\\(\\4\\.name\\):(${ID})\\(\\4\\.name\\),element:\\4\\.spell\\?\\.element\\?\\?null,icon:\\4\\.spell\\?\\.noIcon\\?null:(${ID})\\(\\4\\.spell\\?\\.icon,\\{box:(${ID})\\}\\)\\}\\)\\},${ID}\\.onclick=\\(\\)=>\\{(${ID})\\(\\)\\|\\|`),
    'hotbarDrag',
  );
  const [, , hotbarOpenFn, startHotbarDragFn, , sigilNoIconFn, sigilShortFn, iconBoxFn, iconBoxSize, wasHotbarDragFn] = dragM;

  const pvpM = rx(`if\\((${ID})\\(\\)\\)\\{let (${ID})=${ID}\\(\`button\`,\`act sb-pvp\`,(${ID})\\(\\)\\);\\2\\.onclick=\\(\\)=>\\{${ID}\\(\\),(${ID})\\(\\)\\},${ID}\\.append\\(\\2\\)\\}`).exec(text);
  const pvpAvailFn = pvpM?.[1] ?? null;
  const pvpLabelFn = pvpM?.[3] ?? null;
  const pvpOpenFn = pvpM?.[4] ?? null;

  const mutateM = once(
    text,
    rx(`(${ID})\\(${ID}\\.spells\\?\\.\\(\\),${ID}\\.i,\\{noIcon:!(${ID})\\}\\)`),
    'mutateSpell',
  );
  const mutateSpellFn = mutateM[1];

  const iconUrlM = once(
    text,
    rx(`let (${ID})=(${ID})\\((${ID})\\);if\\(\\1\\)\\{let (${ID})=${ID}\\(\`img\`\\);\\4\\.src=\\1,\\4\\.alt=\`\`,`),
    'iconUrl',
  );
  const iconUrlFn = iconUrlM[2];

  const dismissM = rx(`(${ID})\\((${ID}),\`\\.px-win\`,\\(\\)=>(${ID})\\(\\)\\)`).exec(text);
  const overlayDismissFn = dismissM?.[1] ?? null;

  const keyM = once(
    text,
    rx(`\\((${ID})\\((${ID})\\)===\`back\`\\|\\|(${ID})\\(\\2,\`CastSpell\`\\)\\)`),
    'keyBindings',
  );
  const keyActionFn = keyM[1];
  const isActionFn = keyM[3];

  const mountM = once(
    text,
    rx(`function (${ID})\\((${ID}),(${ID})=\\{\\}\\)\\{return (${ID})\\(\\),(${ID})\\(\\),${ID}=\\2,${ID}=\\3,${ID}=\\3\\.onExit\\?\\?\\(\\(\\)=>\\{\\}\\),${ID}=0,${ID}=null,${ID}=null,${ID}=null,${ID}=!1,(${ID})\\(\\),${ID}\\?\\.\\(\\),${ID}=(${ID})\\(\\3\\.owner,(${ID})\\),(${ID})\\(\`book\`,!0,\\3\\.entity\\?\\?null\\),(${ID})\\(\`book\`,\\{selected:`),
    'mountEnhancedSpellbook',
  );
  const [mountWhole, mountFn, hostArg, depsArg, style1Fn, style2Fn, , winStackFn, , setHotbarWinFn, regPickerFn] = mountM;
  const bodyIdx = mountWhole.indexOf('){');
  if (bodyIdx < 0) throw new Error('spellbook mountEnhancedSpellbook: body brace missing');
  const restOfMount = mountWhole.slice(bodyIdx + 2);

  const bridgeFields = [
    `ensureStyles:()=>{${style1Fn}();${style2Fn}()}`,
    `spellName:${spellNameFn}`,
    `calcCost:${calcCostFn}`,
    `vampMsg:${vampMsgFn}`,
    `lycanMsg:${lycanMsgFn}`,
    `effectsOf:${effectsOfFn}`,
    `spellFrame:${spellFrameFn}`,
    `lycanTag:${lycanTagVar}`,
    `mutateSpell:${mutateSpellFn}`,
    `iconUrl:${iconUrlFn}`,
    `iconBox:${iconBoxFn}`,
    `iconBoxSize:${iconBoxSize}`,
    `sigilNoIcon:${sigilNoIconFn}`,
    `sigilShort:${sigilShortFn}`,
    `hotbarEnabled:${hotbarEnabledFn}`,
    `hotbarSlot:${hotbarSlotFn}`,
    `toggleHotbar:${toggleHotbarFn}`,
    `hotbarOpen:${hotbarOpenFn}`,
    `startHotbarDrag:${startHotbarDragFn}`,
    `wasHotbarDrag:${wasHotbarDragFn}`,
    `quickslotGet:${quickslotGetFn}`,
    `quickslotSet:${quickslotSetFn}`,
    `quickslotClear:${quickslotClearFn}`,
    `setHotbarWindow:${setHotbarWinFn}`,
    `registerHotbarPicker:${regPickerFn}`,
    `registerKeys:${winStackFn}`,
    `keyAction:${keyActionFn}`,
    `isAction:${isActionFn}`,
    overlayDismissFn ? `overlayDismiss:${overlayDismissFn}` : null,
    pvpAvailFn ? `pvpAvailable:${pvpAvailFn}` : null,
    pvpLabelFn ? `pvpLabel:${pvpLabelFn}` : null,
    pvpOpenFn ? `pvpOpen:${pvpOpenFn}` : null,
  ].filter(Boolean).join(',');

  // Define bridge factory at module scope before mountFn so mountFn's minified params (e, t) never shadow module imports!
  const replacement =
    `const __dfoSbBridge=()=>({${bridgeFields}});` +
    `function ${mountFn}(${hostArg},${depsArg}={}){` +
    `try{if(globalThis.__dfoSpellbook&&typeof globalThis.__dfoSpellbook.mount==="function"){` +
    `const __dfoSbH=globalThis.__dfoSpellbook.mount(${hostArg},${depsArg},__dfoSbBridge());` +
    `if(__dfoSbH)return __dfoSbH;` +
    `}}catch(__dfoSbErr){console.warn("[dfo-spellbook] fallback to native:",__dfoSbErr);}` +
    `${restOfMount}`;

  hits.push(['spellbook.mount', 1]);
  return put(text, mountWhole, replacement);
}

// 2. deepWaterRuntime-*.js: expose readied/readiedIndex/abortReady in sq() AND firmament stats (mpRegen + skill.*)
function hookDeepWaterRuntime(text, hits) {
  let out = text;

  if (text.includes('noSpellPointCost:') && text.includes('enhanced-spellbook')) {
    const openerM = once(
      out,
      rx(`let\\{entity:(${ID}),magic:(${ID}),castCost:(${ID}),rows:(${ID}),onClose:(${ID})\\}=(${ID}),(${ID})=\\{spells:\\(\\)=>\\1\\.spells\\?\\?=\\[\\],entity:\\1,castCost:\\3,onReady:\\((${ID}),\\{noSpellPointCost:(${ID})\\}=\\{\\}\\)\\=>\\(\\9\\|\\|${ID}\\(\\8\\),\\2\\?\\.readySpell\\?\\.\\(\\8,\\{free:!!\\9\\}\\)\\),rows:\\4\\?\\?\\(\\(\\)=>\\[\\]\\)\\};`),
      'opener',
    );
    const [whole, ent, magic, castCost, rows, onClose, arg, obj, spArg, freeArg] = openerM;
    const tail = `,readied:()=>${magic}?.readied?.()??null,readiedIndex:()=>${magic}?.readiedIndex?.()??null,abortReady:()=>${magic}?.abortReadySpell?.()??!1`;
    const patchedOpener = whole.slice(0, -2) + tail + '};';
    out = put(out, whole, patchedOpener);
    hits.push(['spellbook.opener', 1]);
  }

  if (text.includes('.mpRegen&&') && text.includes('`firmament`')) {
    const firmM = once(
      out,
      rx(`function (${ID})\\((${ID})\\)\\{if\\(!(${ID})\\(\\2\\)\\)return;(${ID})\\(\\2\\);let (${ID})=(${ID})\\(\\2\\);if\\(\\5\\.hpRegen&&\\2\\.health>0&&\\2\\.health<\\2\\.maxHealth\\)\\{let ${ID}=${ID}\\(\\2\\.maxHealth\\*\\5\\.hpRegen/1e3,\`firmament\`,\\2\\);${ID}>0&&${ID}\\(\\2,${ID}\\)\\}\\5\\.mpRegen&&\\2\\.magicka<\\2\\.maxMagicka&&${ID}\\(\\2,\\2\\.maxMagicka\\*\\5\\.mpRegen/1e3\\)\\}`),
      'firmament',
    );
    const [, , , isPlayerFn, , , statsFn] = firmM;
    out = out + `\n;try{${ENV_INIT}.firmamentStats=(e)=>{try{return ${isPlayerFn}(e)?${statsFn}(e):null}catch{return null}}}catch{}\n`;
    hits.push(['spellbook.firmament', 1]);
  }

  return out;
}

// 3. wagonKinds-*.js: expose exact live skill evaluators (effective, sheet, base, modTotal, real)
function hookWagonKindsSkills(text, hits) {
  const m = once(
    text,
    rx(`function (${ID})\\((${ID}),(${ID})\\)\\{let (${ID})=\\2\\.skillOverrides;if\\(\\4&&\\4\\[\\3\\]!=null\\)return \\4\\[\\3\\];let (${ID})=\\2\\.skills;return typeof \\5==\`number\`\\?\\5:\\5\\?\\.\\[\\3\\]\\?\\?0\\}function (${ID})\\((${ID}),(${ID})\\)\\{let (${ID})=\\7\\.skillOverrides;if\\(\\9&&\\9\\[\\8\\]!=null\\)return \\9\\[\\8\\];let (${ID})=\\7\\._enchantMods\\?\\.skillMods\\?\\.\\[\\8\\]\\?\\?0,(${ID})=\\7\\.activeEffects;if\\(\\11\\)for\\(let ${ID} of \\11\\)${ID}\\.kind===\`racialOverride\`&&!${ID}\\.ended&&\\(\\10\\+=${ID}\\.skillMods\\?\\.\\[\\8\\]\\?\\?0\\);return \\10\\+=\\7\\._mods\\?\\.skills\\?\\.\\[\\8\\]\\?\\?0,(${ID})\\((${ID})\\(\\7,(${ID})\\(\\7,${esc('$1')}\\(\\7,\\8\\),\\8\\)\\)\\)\\+\\10\\}`
      .replace(/\\\$1/, '\\1')),
    'wagonSkills',
  );
  // Also match yt, bt, xt right after vt
  const rawFn = m[1];
  const effFn = m[6];
  const capFn = m[12];
  const mentorFn = m[13];
  const softFn = m[14];
  const after = text.slice(m.index + m[0].length, m.index + m[0].length + 500);
  const more = rx(`function (${ID})\\(${ID},${ID}\\)[\\s\\S]{0,220}?function (${ID})\\(${ID},${ID}\\)[\\s\\S]{0,140}?function (${ID})\\(${ID},${ID}\\)`).exec(after);
  if (!more) throw new Error('spellbook wagonSkills: yt/bt/xt missing');
  const [, modTotFn, sheetFn, realFn] = more;

  const snippet =
    `\n;try{Object.assign(${ENV_INIT},{` +
    `skillRaw:(e,id)=>{try{return ${rawFn}(e,id)}catch{return 0}},` +
    `skillEffective:(e,id)=>{try{return ${effFn}(e,id)}catch{return 0}},` +
    `skillModTotal:(e,id)=>{try{return ${modTotFn}(e,id)}catch{return 0}},` +
    `skillSheet:(e,id)=>{try{return ${sheetFn}(e,id)}catch{return 0}},` +
    `skillReal:(e,id)=>{try{return ${realFn}(e,id)}catch{return 0}},` +
    `skillCappedBase:(e,id)=>{try{return ${capFn}(${mentorFn}(e,${softFn}(e,${rawFn}(e,id),id)))}catch{return ${rawFn}(e,id)}}` +
    `})}catch{}\n`;

  hits.push(['spellbook.skills', 1]);
  return text + snippet;
}

// 4. spellcast-*.js: expose read-only inspection of ALL registered entity-modifier folds (ny) + EnhancesSkill id
function hookSpellcastFolds(text, hits) {
  const m = once(
    text,
    rx(`for\\(let (${ID}) of (${ID})\\.values\\(\\)\\)\\{let (${ID});try\\{\\3=\\1\\((${ID})\\)\\}catch\\((${ID})\\)\\{console\\.warn\\(\`\\[entityMods\\] a fold threw\``),
    'modFolds',
  );
  const foldMap = m[2];
  const enchM = rx(`\\[(${ID})\\.EnhancesSkill,\\{flags:${ID}\\.Held,constant\\(\\{param:${ID},mods:${ID}\\}\\)\\{${ID}\\.skillMods\\[${ID}\\]=\\(${ID}\\.skillMods\\[${ID}\\]\\?\\?0\\)\\+15\\}\\}\\]`).exec(text);
  const enchExpr = enchM ? `${enchM[1]}.EnhancesSkill` : 'null';

  const snippet =
    `\n;try{Object.assign(${ENV_INIT},{` +
    `enhancesSkillType:${enchExpr},` +
    `inspectModFolds:(ent)=>{const out=[];if(!ent)return out;for(const[k,fn]of ${foldMap}.entries()){try{const r=fn(ent);if(r&&r.skills)out.push({id:String(k),skills:r.skills})}catch{}}return out}` +
    `})}catch{}\n`;

  hits.push(['spellbook.folds', 1]);
  return text + snippet;
}

// 5. lootPowers-*.js: expose exact live attune power & NoRegenSpellPoints check for magicka regeneration
function hookLootPowersRegen(text, hits) {
  const m = once(
    text,
    rx(`let (${ID})=(${ID})\\((${ID}),\`attune\`\\);if\\(\\1&&\\3\\.maxMagicka>0&&\\3\\.health>0&&Number\\.isFinite\\(\\3\\.magicka\\)&&\\3\\.magicka<\\3\\.maxMagicka&&\\(!(${ID})\\(\\3\\.career,(${ID})\\.NoRegenSpellPoints\\)\\|\\|(${ID})\\(\\)\\)&&${ID}\\(\\3,\\3\\.maxMagicka\\*\\(\\3\\.magicka<\\3\\.maxMagicka/2\\?\\1\\.low:\\1\\.pct\\)/100\\)`),
    'attuneRegen',
  );
  const [, , getPowerFn, , hasDisadvFn, disadvEnum, overrideFn] = m;
  const listPowersM = rx(`function (${ID})\\((${ID})\\)\\{if\\(!${ID}\\(\\2\\)\\|\\|!${ID}\\(\\)\\|\\|${ID}\\(\\)\\)return\\[\\];let ${ID}=\\[\\],${ID}=new Set;for\\(let ${ID} of ${ID}\\(\\2\\)\\)`).exec(text);
  const listPowersFn = listPowersM?.[1] ?? null;

  const snippet =
    `\n;try{${ENV_INIT}.inspectAttune=(ent)=>{try{` +
    `const blocked=!!(${hasDisadvFn}(ent?.career,${disadvEnum}.NoRegenSpellPoints)&&!${overrideFn}());` +
    `const power=${getPowerFn}(ent,\`attune\`)||null;` +
    `const all=${listPowersFn ? `${listPowersFn}(ent)` : '[]'};` +
    `return{power,blocked,powers:all}` +
    `}catch{return null}}}catch{}\n`;

  hits.push(['spellbook.regen', 1]);
  return text + snippet;
}

// 6. spellbookWindow-*.js: optional audio/clips hook for authentic OpenBook / PageTurn / ButtonClick SFX
function hookSpellbookAudio(text, hits) {
  const m = rx(`(${ID})\\.playOneShot\\(this\\.buyMode\\?(${ID})\\.ButtonClick:\\2\\.OpenBook,1\\)`).exec(text);
  if (!m) return text;
  hits.push(['spellbook.audio', 1]);
  return text + `\n;try{Object.assign(${ENV_INIT},{audio:${m[1]},clips:${m[2]}})}catch{}\n`;
}

function transformSpellbook(rel, text, log) {
  if (!rel.endsWith('.js') || /(?:^|\/)[^/]*[Ww]orker-[^/]+\.js$/.test(rel) || text.includes('/*dfo.spellbook*/')) {
    return text;
  }
  const hits = [];
  let out = text;
  try {
    if (text.includes('`act sb-slot') && text.includes('`act sb-iconbtn') && text.includes('`CastSpell`')) {
      out = hookEnhancedSpellbook(out, hits);
    }
    if ((text.includes('noSpellPointCost:') && text.includes('enhanced-spellbook')) || (text.includes('.mpRegen&&') && text.includes('`firmament`'))) {
      out = hookDeepWaterRuntime(out, hits);
    }
    if (text.includes('e._enchantMods?.skillMods') && text.includes('e.skillOverrides') && text.includes('`racialOverride`')) {
      out = hookWagonKindsSkills(out, hits);
    }
    if (text.includes('[entityMods] a fold threw') && text.includes('EnhancesSkill')) {
      out = hookSpellcastFolds(out, hits);
    }
    if (text.includes('`attune`') && text.includes('NoRegenSpellPoints')) {
      out = hookLootPowersRegen(out, hits);
    }
    if (text.includes('`SPBK00I0.IMG`') && text.includes('.OpenBook')) {
      out = hookSpellbookAudio(out, hits);
    }
  } catch (e) {
    log.push(['spellbook!error ' + (e?.message || e), 0]);
    return text;
  }
  if (hits.length) {
    log.push(...hits);
    return out + '\n/*dfo.spellbook*/';
  }
  return text;
}

module.exports = { transformSpellbook };
