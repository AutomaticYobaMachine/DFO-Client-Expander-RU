'use strict';
// Lock the game's UI Overhaul exclusively to our mod's base Enhanced Plus (Slate) interface style.
// Prevents choosing Classic, GrimoireUI, Daggerfall Online Grimoire, or non-Slate UI color themes
// (Stone/Iron/Ember/Forest/Night) and neutralizes any pre-existing saved localStorage preferences or
// URL query overrides (?skin=, ?uipack=, ?dress=), while preserving Enhanced Plus sub-settings
// (cursor, hover info, community fonts, controller) as well as Texture Overhaul and Sound Overhaul.
const ID = '[\\w$]+';
const rx = (s, f) => new RegExp(s, f);
const esc = (s) => s.replace(/[$]/g, '\\$');
const put = (s, from, to) => s.replace(from, () => to);
const once = (s, re, what) => {
  const all = s.match(rx(re.source, 'g')) || [];
  if (all.length !== 1) throw new Error(`${what}: ${all.length} places`);
  const m = re.exec(s);
  if (!m) throw new Error(`unsupported ${what} signature`);
  return m;
};

/** Scan from `openIdx` (pointing at `[`, `(`, or `{`) to its matching closing bracket, skipping strings/templates. */
function findMatchingClose(src, openIdx, openCh, closeCh) {
  let depth = 0;
  let quote = '';
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = '';
      else if (quote === '`' && ch === '$' && src[i + 1] === '{') {
        const endExpr = findMatchingClose(src, i + 1, '{', '}');
        if (endExpr < 0) return -1;
        i = endExpr;
      }
      continue;
    }
    if (ch === '\'' || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === openCh) depth++;
    else if (ch === closeCh) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** uiSkin-*.js: force skin getter to 'enhanced', ignore ?skin= URL overrides, coerce setSkin to 'enhanced'. */
function lockSkin(text) {
  let out = text;
  const urlM = once(
    out,
    rx(`function (${ID})\\(${ID}=globalThis\\.location\\?\\.search\\?\\?\`\`\\)\\{return ${ID}\\(${ID}\\(\`skin\`,${ID}\\)\\)\\}`),
    'uiSkin urlSkin'
  );
  const getM = once(
    out,
    rx(`function (${ID})\\((${ID})\\)\\{let ${ID}=\\2===void 0\\?globalThis\\.location\\?\\.search\\?\\?\`\`:\\2;if\\(typeof ${ID}!=\`string\`\\)return ${esc(urlM[1])}\\(\\2\\)\\?\\?${ID}\\(${ID}\\(\`skin\`\\)\\)\\?\\?\`enhanced\`;[^{}]*?return [^{}]*?\\}`),
    'uiSkin getSkin'
  );
  const setM = once(
    out,
    rx(`function (${ID})\\((${ID})\\)\\{return (${ID})\\(\\2\\)\\?(${ID})\\(\`skin\`,\\2\\)===!1\\?null:\\2:\\3\\(${ID}\\(\`skin\`\\)\\)\\?\\?\`enhanced\`\\}`),
    'uiSkin setSkin'
  );
  out = put(out, urlM[0], `function ${urlM[1]}(){return null}`);
  out = put(out, getM[0], `function ${getM[1]}(){return\`enhanced\`}`);
  out = put(out, setM[0], `function ${setM[1]}(){return ${setM[4]}(\`skin\`,\`enhanced\`)===!1?null:\`enhanced\`}`);
  return out;
}

/** uiPrefs-*.js: normalize stored skin/uiPack/plusDress/plusTheme on load, read, and write so old saves boot cleanly. */
function lockPrefs(text) {
  let out = text;
  const loadM = once(
    out,
    rx(`(catch\\(${ID}\\)\\{console\\.warn\\(\`\\[uiPrefs\\] stored screen preferences unreadable; using defaults\`,${ID}\\)\\})(return (${ID})\\})`),
    'uiPrefs load'
  );
  const getM = once(
    out,
    rx(`function (${ID})\\((${ID})\\)\\{let (${ID})=(${ID})\\(\\2\\);return \\3===void 0\\?\\((${ID})===null&&(${ID})\\(\\),\\5\\[\\2\\]\\?\\?(${ID})\\[\\2\\]\\):\\3\\}`),
    'uiPrefs getPref'
  );
  const setM = once(
    out,
    rx(`function (${ID})\\((${ID}),(${ID})\\)\\{return (${ID})===null&&(${ID})\\(\\),\\4\\[\\2\\]=\\3,(${ID})\\(\\)\\}`),
    'uiPrefs setPref'
  );
  const storeVar = loadM[3];
  out = put(out, loadM[0], `${loadM[1]}${storeVar}.skin=\`enhanced\`,${storeVar}.uiPack=\`none\`,${storeVar}.plusDress=\`none\`,${storeVar}.plusTheme=\`slate\`;${loadM[2]}`);
  out = put(
    out,
    getM[0],
    `function ${getM[1]}(${getM[2]}){if(${getM[2]}===\`skin\`)return\`enhanced\`;if(${getM[2]}===\`uiPack\`||${getM[2]}===\`plusDress\`)return\`none\`;if(${getM[2]}===\`plusTheme\`)return\`slate\`;let ${getM[3]}=${getM[4]}(${getM[2]});return ${getM[3]}===void 0?(${getM[5]}===null&&${getM[6]}(),${getM[5]}[${getM[2]}]??${getM[7]}[${getM[2]}]):${getM[3]}}`
  );
  out = put(
    out,
    setM[0],
    `function ${setM[1]}(${setM[2]},${setM[3]}){if(${setM[2]}===\`skin\`)${setM[3]}=\`enhanced\`;else if(${setM[2]}===\`uiPack\`||${setM[2]}===\`plusDress\`)${setM[3]}=\`none\`;else if(${setM[2]}===\`plusTheme\`)${setM[3]}=\`slate\`;return ${setM[4]}===null&&${setM[5]}(),${setM[4]}[${setM[2]}]=${setM[3]},${setM[6]}()}`
  );
  return out;
}

/** enhancedStyle-*.js: block classic UI packs (?uipack=), block Grimoire plus dress (?dress=), and lock plusTheme strictly to Slate. */
function lockDress(text) {
  let out = text;

  // 1. Restrict PLUS_THEMES (Ve) strictly to Slate so no other theme swatches render and no non-Slate CSS sheets are generated.
  const themesHeadM = once(
    out,
    rx(`(${ID})=Object\\.freeze\\(\\{slate:\\{name:\`Slate\`,swatch:\`#171b21\`\\},`),
    'enhancedStyle plusThemes'
  );
  const themesVar = themesHeadM[1];
  const objOpen = themesHeadM.index + themesHeadM[0].indexOf('{');
  const objClose = findMatchingClose(out, objOpen, '{', '}');
  if (objClose < 0 || out[objClose + 1] !== ')') throw new Error('unbalanced enhancedStyle plusThemes');
  out = out.slice(0, themesHeadM.index)
    + `${themesVar}=Object.freeze({slate:Object.freeze({name:globalThis.__dfoUi?.t('uiStyle.themeSlate')??\`Slate\`,swatch:\`#171b21\`})})`
    + out.slice(objClose + 2);

  // 2. Lock activeUiPack, setUiPack, activePlusDress, activePlusTheme, applyPlusTheme, and setPlusTheme.
  const activePackM = once(
    out,
    rx(`function (${ID})\\((${ID})\\)\\{if\\(${ID}\\(\\2\\)!==\`classic\`\\)return null;let (${ID})=${ID}\\(\\2\\)\\?\\?\\(${ID}\\(\\2\\)\\?\`none\`:${ID}\\(${ID}\\(\`uiPack\`\\)\\)\\?\\?\`none\`\\);return \\3===\`none\`\\?null:${ID}\\[\\3\\]\\}`),
    'enhancedStyle activeUiPack'
  );
  const setPackM = once(
    out,
    rx(`function (${ID})\\((${ID})\\)\\{return ${ID}\\(\\2\\)\\?(${ID})\\(\`uiPack\`,\\2\\):!1\\}`),
    'enhancedStyle setUiPack'
  );
  const dressM = once(
    out,
    rx(`(${ID})=(${ID})=>\\{let (${ID})=${ID}\\(\`dress\`,\\2\\?\\?globalThis\\.location\\?\\.search\\?\\?\`\`\\);return\\(\\3===\`grimoire\`\\|\\|\\3===\`none\`\\?\\3:${ID}\\(\`plusDress\`\\)\\)===\`grimoire\`\\?${ID}:\`none\`\\}`),
    'enhancedStyle activePlusDress'
  );
  const activeThemeM = once(
    out,
    rx(`(${ID})=\\(\\)=>Object\\.hasOwn\\(${esc(themesVar)},${ID}\\(\`plusTheme\`\\)\\)\\?${ID}\\(\`plusTheme\`\\):(${ID})`),
    'enhancedStyle activePlusTheme'
  );
  const slateVar = activeThemeM[2];
  const applyThemeM = once(
    out,
    rx(`function (${ID})\\((${ID})=globalThis\\.document\\)\\{let (${ID})=\\2\\?\\.documentElement;\\3\\?\\.dataset&&\\((${ID})\\(\\2\\),${esc(dressM[1])}\\(\\)===\`grimoire\`\\?\\(\\3\\.dataset\\.plusTheme=${esc(slateVar)},${ID}\\(\\2\\)\\):\\3\\.dataset\\.plusTheme=${esc(activeThemeM[1])}\\(\\)\\)\\}`),
    'enhancedStyle applyPlusTheme'
  );
  const setThemeM = once(
    out,
    rx(`function (${ID})\\((${ID}),(${ID})=globalThis\\.document\\)\\{return Object\\.hasOwn\\(${esc(themesVar)},\\2\\)\\?\\((${ID})\\(\`plusTheme\`,\\2\\),${esc(applyThemeM[1])}\\(\\3\\),!0\\):!1\\}`),
    'enhancedStyle setPlusTheme'
  );

  out = put(out, activePackM[0], `function ${activePackM[1]}(){return null}`);
  out = put(out, setPackM[0], `function ${setPackM[1]}(${setPackM[2]}){return ${setPackM[2]}===\`none\`?${setPackM[3]}(\`uiPack\`,\`none\`):!1}`);
  out = put(out, dressM[0], `${dressM[1]}=()=>\`none\``);
  out = put(out, activeThemeM[0], `${activeThemeM[1]}=()=>${slateVar}`);
  out = put(
    out,
    applyThemeM[0],
    `function ${applyThemeM[1]}(${applyThemeM[2]}=globalThis.document){let ${applyThemeM[3]}=${applyThemeM[2]}?.documentElement;${applyThemeM[3]}?.dataset&&(${applyThemeM[4]}(${applyThemeM[2]}),delete ${applyThemeM[3]}.dataset.plusDress,${applyThemeM[3]}.dataset.plusTheme=${slateVar})}`
  );
  out = put(
    out,
    setThemeM[0],
    `function ${setThemeM[1]}(${setThemeM[2]},${setThemeM[3]}=globalThis.document){return ${setThemeM[2]}===${slateVar}?(${setThemeM[4]}(\`plusTheme\`,${slateVar}),${applyThemeM[1]}(${setThemeM[3]}),!0):!1}`
  );
  return out;
}

/** enhancedMenu-*.js: remove Classic/Grimoire options from UI Overhaul card, hide unused pager controls when 1 option. */
function lockMenu(text) {
  let out = text;

  // 1. Force menu's local dress reader to 'none'.
  const dressM = once(
    out,
    rx(`(${ID})=\\((${ID})=globalThis\\.location\\?\\.search\\?\\?\`\`\\)=>\\{let (${ID})=${ID}\\(\`dress\`,\\2\\);return\\(\\3===\`grimoire\`\\|\\|\\3===\`none\`\\?\\3:${ID}\\(\`plusDress\`\\)\\)===\`grimoire\`\\?\`grimoire\`:\`none\`\\}`),
    'enhancedMenu activeDress'
  );
  out = put(out, dressM[0], `${dressM[1]}=()=>\`none\``);

  // 2. Replace the UI Overhaul options array with ONLY our single Enhanced Plus option.
  const uiHeadM = once(
    out,
    rx(`Object\\.freeze\\(\\{id:\`ui\`,title:\`UI Overhaul\`,[\\s\\S]{0,400}?options:Object\\.freeze\\(\\[`),
    'enhancedMenu ui overhaul options'
  );
  const arrOpen = uiHeadM.index + uiHeadM[0].length - 1;
  const arrClose = findMatchingClose(out, arrOpen, '[', ']');
  if (arrClose < 0) throw new Error('unbalanced ui overhaul options array');
  const arrBody = out.slice(arrOpen + 1, arrClose);

  const enhHeadM = rx(`(${ID})\\(\`enhanced-plus\`,(${ID})\\.enhanced,\`enhanced\`,(${ID}),\\{`).exec(arrBody);
  if (!enhHeadM) throw new Error('missing enhanced-plus option in ui overhaul');
  const [, txFn, labelsVar, packNoneVar] = enhHeadM;
  const singleOption =
    `${txFn}(\`enhanced-plus\`,globalThis.__dfoUi?.t('uiStyle.name')??${labelsVar}.enhanced,\`enhanced\`,${packNoneVar},{`
    + `by:globalThis.__dfoUi?.t('uiStyle.by')??\`Daggerfall Online · DFO Client Expander\`,`
    + `blurb:globalThis.__dfoUi?.t('uiStyle.blurb')??\`Base Enhanced Plus (Slate) interface enhanced by DFO Client Expander. Other interface styles and color themes are disabled while this mod is installed; cursor, hover info, and controller bindings remain configurable below.\``
    + `})`;
  out = out.slice(0, arrOpen + 1) + singleOption + out.slice(arrClose);

  // 3. Polish tk(e) when a card has only 1 option (n < 2): ignore ArrowLeft/Right, hide arrows cleanly, omit dot strip.
  const navM = once(
    out,
    rx(`(${ID})\\.onkeydown=(${ID})=>\\{\\2\\.key===\`ArrowLeft\`\\?\\(\\2\\.preventDefault\\(\\),${ID}\\(-1\\)\\):\\2\\.key===\`ArrowRight\`&&\\(\\2\\.preventDefault\\(\\),${ID}\\(1\\)\\)\\}`),
    'enhancedMenu look-panel keydown'
  );
  const arrowM = once(
    out,
    rx(`(${ID})\\.disabled=(${ID})<2,\\1\\.onclick=(${ID})=>\\{\\3\\.stopPropagation\\(\\),${ID}\\(${ID}\\)\\},\\1\\}`),
    'enhancedMenu look-arrow disabled'
  );
  const countVar = arrowM[2];
  const dotsM = once(
    out,
    rx(`(let ${ID}=${ID}\\(\`div\`,\`look-dots\`\\);if\\()(${ID}\\.options\\.forEach\\()`),
    'enhancedMenu look-dots'
  );
  out = put(out, navM[0], `${navM[1]}.onkeydown=${navM[2]}=>{if(${countVar}<2)return;${navM[0].slice(`${navM[1]}.onkeydown=${navM[2]}=>{`.length)}`);
  out = put(
    out,
    arrowM[0],
    `${arrowM[1]}.disabled=${countVar}<2,${countVar}<2&&(${arrowM[1]}.style.visibility=\`hidden\`,${arrowM[1]}.setAttribute(\`aria-hidden\`,\`true\`)),${arrowM[1]}.onclick=${arrowM[3]}=>{${arrowM[3]}.stopPropagation(),${arrowM[0].slice(arrowM[0].indexOf('stopPropagation(),') + 'stopPropagation(),'.length)}`
  );
  out = put(out, dotsM[0], `${dotsM[1]}${countVar}>1&&${dotsM[2]}`);

  return out;
}

const JOBS = [
  ['uiStyle.skin', (rel, text) => !/Worker-/.test(rel) && text.includes('Object.freeze([`enhanced`,`classic`])') && text.includes('Enhanced Plus'), lockSkin],
  ['uiStyle.prefs', (rel, text) => !/Worker-/.test(rel) && text.includes('`dagger.ui.v1`') && text.includes('plusDress:`none`'), lockPrefs],
  ['uiStyle.dress', (rel, text) => !/Worker-/.test(rel) && text.includes('`uiPack`') && text.includes('`uipack`') && text.includes('`plusDress`') && text.includes('data-plus-theme'), lockDress],
  ['uiStyle.menu', (rel, text) => !/Worker-/.test(rel) && text.includes('id:`ui`,title:`UI Overhaul`') && text.includes('`enhanced-plus`'), lockMenu],
];

function transformUiStyleLock(rel, text, log) {
  if (/Worker-[^/]+\.js$/.test(rel)) return text;
  let out = text;
  for (const [id, on, run] of JOBS) {
    if (!on(rel, out) || out.includes(`/*${id}*/`)) continue;
    try {
      out = run(out) + `\n/*${id}*/\n`;
      log.push([id, 1]);
    } catch (e) {
      log.push([`${id}!error ${e.message}`, 0]);
    }
  }
  return out;
}

module.exports = { transformUiStyleLock, lockSkin, lockPrefs, lockDress, lockMenu };
