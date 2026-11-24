'use strict';
// THE INVENTORY (docs/inventory.md): the pack's pages, its list view, the automatic sort and the quest letter's lock.
// Every hook only hands a native value to page/dfo_pack.js and keeps the native path whole when the page script is
// missing or throws: the helpers below catch, and each answers what the game would have used.
const ID = '[\\w$]+';
const rx = (s, f) => new RegExp(s, f);
const need = (s, re, what) => { const m = re.exec(s); if (!m) throw new Error(`unsupported ${what} signature`); return m; };
const esc = (s) => s.replace(/[$]/g, '\\$');
const put = (s, from, to) => s.replace(from, () => to);   // never the replacement's $-patterns
const once = (s, re, what) => { const all = s.match(rx(re.source, 'g')) || []; if (all.length !== 1) throw new Error(`${what}: ${all.length} places`); return need(s, re, what); };

// storeFilter-*.js: PACK_PAGES and pageOf (ui/packPages.js). The page list goes through the page script once, as the
// module evaluates (the mod's scripts stand before the game's first module); pageOf asks the page script with the
// native answer and the answer without the Magic page beside it.
function pages(text) {
  const list = once(text, rx(`(${ID})=(Object\\.freeze\\(\\[\\[\`weapons\`,\`Weapons\`\\](?:,\\[\`\\w+\`,\`\\w+\`\\])*\\]\\))`), 'pack pages');
  if (!/`magic`,`Magic`/.test(list[2]) || !/`misc`,`Misc`/.test(list[2])) throw new Error('pack pages: unexpected list');
  const page = once(text, rx(`function (${ID})\\((${ID})\\)\\{if\\(!\\2\\)return\`misc\`;(if\\(${ID}\\(\\2\\)\\|\\|\\2\\.templateIndex===\\d+\\)return\`magic\`;)(let ${ID}=\\2\\.group;return [^{}]*?:\`misc\`)\\}`), 'pageOf');
  const [whole, name, arg, magic, rest] = page;
  const tabMatch = rx(`(${ID})=\\((${ID}),(${ID})\\)=>\\2\\.filter\\((${ID})=>!(${ID})\\(\\4\\)&&${esc(name)}\\(\\4\\)===\\3\\)(?=[,;\\n])`).exec(text);
  const native = `function __dfoPageNative$(${arg}){if(!${arg})return\`misc\`;${magic}${rest}}`;
  const base = `function __dfoPageBase$(${arg}){if(!${arg})return\`misc\`;${rest}}`;
  let out = put(text, list[0], `${list[1]}=__dfoPackPages$(${list[2]})`);
  out = put(out, whole, `function ${name}(${arg}){return __dfoPackPage$(${arg})}${native}${base}`);
  if (tabMatch) {
    const [tWhole, tFn, tArr, tTab, , tWorn] = tabMatch;
    out = put(out, tWhole, `${tFn}=(${tArr},${tTab})=>__dfoTabFilter$(${tArr},${tTab},${tWorn})`);
  }
  return out + '\n;function __dfoPackPages$(p){try{return globalThis.__dfoPack?.pages?.(p)??p}catch{return p}}'
    + 'function __dfoPackPage$(e){try{const p=globalThis.__dfoPack?.page;return p?p(e,__dfoPageBase$,__dfoPageNative$):__dfoPageNative$(e)}catch{return __dfoPageNative$(e)}}'
    + ';try{globalThis.__dfoStorePageOf=__dfoPackPage$;globalThis.__dfoStorePageBase=__dfoPageBase$;globalThis.__dfoStorePageNative=__dfoPageNative$;}catch{}\n'
    + (tabMatch ? `;let __dfoTI=null,__dfoTL=-1,__dfoTE=-1,__dfoTB=null,__dfoTS=null;function __dfoTabFilter$(xs,tb,wf){try{if(!Array.isArray(xs))return[];const ep=globalThis.__dfoPack?.epoch?.()??0;if(xs===__dfoTI&&xs.length===__dfoTL&&ep===__dfoTE&&!__dfoTS.has(tb)){__dfoTS.add(tb);const r=__dfoTB.get(tb)||[];if(__dfoTS.size>=${list[1]}.length){__dfoTI=null;__dfoTB=null;__dfoTS=null;}return r;}const b=new Map(),ps=${list[1]};for(let i=0;i<ps.length;i++)b.set(ps[i][0],[]);for(let i=0;i<xs.length;i++){const it=xs[i];if(!it||wf(it))continue;const p=__dfoPackPage$(it);let a=b.get(p);if(!a)b.set(p,a=[]);a.push(it);}__dfoTI=xs;__dfoTL=xs.length;__dfoTE=ep;__dfoTB=b;__dfoTS=new Set([tb]);Promise.resolve().then(()=>{if(__dfoTB===b){__dfoTI=null;__dfoTB=null;__dfoTS=null;}});return b.get(tb)||[];}catch{return Array.isArray(xs)?xs.filter(e=>!wf(e)&&__dfoPackPage$(e)===tb):[]}}\n` : '');
}

// enhancedInventory-*.js: the dock's list (listCol), its rows' picture box (itemRow), the header's buttons (render) and
// the refresh every act and every open runs (refresh) - where the sort stands, by the native Sort's own call.
function inventory(text) {
  let out = text;
  // listCol: the page's rows -> the display list (surrogate stacks); each row built through the page script (the list
  // view's dress); the rows' heights kept per view, as the list keeps them per page.
  const list = once(out, rx(`(${ID})=(${ID})\\.tabs\\.find\\(((${ID})=>\\4\\.tab===(${ID}))\\)\\?\\.items\\?\\?\\[\\];return \\1\\.length\\|\\|(${ID})\\.append\\((${ID})\\(\`p\`,\`packempty\``), 'pack list');
  const [, rows, model, finder, , tab] = list;
  out = put(out, list[0], put(list[0], `${rows}=${model}.tabs.find(${finder})?.items??[];`, `${rows}=__dfoPackList$(${model}.tabs.find(${finder})?.items??[],${tab},${model},__dfoPackDeps$);`));
  const build = once(out, rx(`(${ID})\\((${ID}),${esc(rows)},(${ID})=>(${ID})\\(\\3\\),\\{onAim:(${ID}),sizes:(${ID})\\(\`pack:\\$\\{${esc(tab)}\\}\`\\)\\}\\)`), 'pack rows');
  const [bWhole, virtual, col, arg, itemRow, onAim, sizes] = build;
  out = put(out, bWhole, `${virtual}(${col},${rows},${arg}=>__dfoPackBuild$(${itemRow},${arg}),{onAim:${onAim},sizes:${sizes}(\`pack:\${${tab}}\`+__dfoPackMode$())})`);
  // itemRow: a list-view row of the pack draws its picture at the loot window's box, not the grid's plate
  const tile = once(out, rx(`(${ID})\\.append\\((${ID})\\((${ID}),\\1,(${ID})===\`remote\`\\?(${ID})\\.loot:(${ID})\\(\\)\\)\\)`), 'pack tile');
  out = put(out, tile[0], `${tile[1]}.append(${tile[2]}(${tile[3]},${tile[1]},${tile[4]}===\`remote\`||__dfoPackListRow$()?${tile[5]}.loot:${tile[6]}()))`);
  // render: the header's buttons, before Close
  const doll = need(out, rx(`\\(\\)=>\\{(${ID})\\(\`packPhoneDoll\`,!(${ID})\\),(${ID})\\(\\)\\}`), 'pack render');
  const render = doll[3];
  const close = once(out, rx(`let (${ID})=(${ID})\\(\`button\`,\`act\`,\`Close\`\\);\\1\\.onclick=\\(\\)=>(${ID})\\(\\),(${ID})\\.append\\(\\1\\),(${ID})\\.append\\(\\4\\);let (${ID})=\\2\\(\`div\`,\`pack\`\\)`), 'pack header');
  // refresh, and the native Sort (sortPack): its guards and its call
  const pm = need(out, rx(`function (${ID})\\((${ID})=\\{\\}\\)\\{let (${ID})=\\2\\.entity\\?\\?\\{\\},(${ID})=\\(\\2\\.items\\?\\.\\(\\)\\?\\?\\[\\]\\)\\.filter\\(Boolean\\)`), 'packModel')[1];
  const refresh = once(out, rx(`(${ID})=\\(\\)=>\\{(${ID})=${esc(pm)}\\((${ID})\\),`), 'pack refresh');
  const sort = once(out, rx(`function (${ID})\\(\\)\\{if\\(!(${ID})\\)\\{(${ID})=null;\\{let (${ID})=(${ID})\\((${ID})\\);if\\(\\4\\)return (${ID})\\(\\4\\)\\}if\\(!(${ID})\\(\\6\\.entity\\?\\.items,\\{nameOf:(${ID})\\}\\)\\)return ${esc(render)}\\(\\);`), 'pack sort');
  const [, , salvage, , , chestRefusal, deps, , sortInPlace, nameOf] = sort;
  if (deps !== refresh[3]) throw new Error('pack refresh: another deps');
  // Capture native sort metadata & wrap Ao (sortInPlace) so dfo_pack.js can apply the player's chosen sort profile.
  const doMatch = once(out, rx(`function ${ID}\\((${ID}),${ID},${ID}\\)\\{if\\(!\\1\\)return\\{it:\\1,hole:!0[^}]+\\};let ${ID}=(${ID})\\(\\1\\),(${ID})=(${ID})\\(\\1\\);return\\{it:\\1,hole:!1,quest:!!\\1\\.questItem,at:${ID},page:(${ID})\\.indexOf\\((${ID})\\(\\1\\)\\),rank:\\3\\?0:(${ID})\\.indexOf\\((${ID})\\(\\1\\)\\)`), 'pack sort entry');
  const colMatch = once(out, rx(`(${ID})\\.compare\\((${ID})\\.name,(${ID})\\.name\\)`), 'pack sort collator');
  const koMatch = once(out, rx(`function (${ID})\\((${ID}),\\{nameOf:${ID}=${ID}\\}=\\{\\}\\)\\{let ${ID}=\\(\\2\\?\\?\\[\\]\\)\\.map\\([^{}]+\\);${ID}\\.sort\\(${ID}\\);let ${ID}=new Map;[^{}]+\\(${ID},${ID}\\)\\=>\\{let ${ID}=${ID}\\.hole\\?null:(${ID})\\(${ID}\\.it\\);[^}]+\\}\\);[\\s\\S]{0,180}?\\}function ${esc(sortInPlace)}\\((${ID}),(${ID})=\\{\\}\\)\\{if\\(!Array\\.isArray\\(\\4\\)\\|\\|\\4\\.length<2\\)return!1;let (${ID})=\\1\\(\\4,\\5\\)`), 'pack sort in place');
  const koCall = `let ${koMatch[6]}=${koMatch[1]}(${koMatch[4]},${koMatch[5]})`;
  if (!koMatch[0].endsWith(koCall)) throw new Error('pack sort call mismatch');
  // Hook native footer (`footer.packbar`) right before it appends into the pack window.
  const footMatch = once(out, rx(`let (${ID})=${esc(close[2])}\\(\`footer\`,\`packbar\`\\)([\\s\\S]{0,950}?)(${ID})\\.append\\(\\1\\)`), 'packbar footer');
  const footCall = `${footMatch[3]}.append(${footMatch[1]})`;
  if (!footMatch[0].endsWith(footCall)) throw new Error('packbar append mismatch');
  const bagMatch = once(footMatch[2], rx(`(${ID})\\(\\)&&(${ID})\\?\\.kind===\`ground\`&&!\\(\\2\\.count>0\\)\\)\\{let ${ID}=${esc(close[2])}\\(\`button\`,\`act bagbtn\`,\`Materials Bag\`\\);${ID}\\.type=\`button\`,${ID}\\.onclick=(${ID}),${esc(footMatch[1])}\\.append\\(${ID}\\)\\}`), 'packbar materials bag');
  const wornMatch = rx(`${esc(refresh[2])}=${esc(pm)}\\(${esc(refresh[3])}\\),(${ID})=${ID}\\(${esc(refresh[3])},${ID}\\(\\)\\),(${ID})=${ID}\\(${esc(refresh[3])}\\.entity\\)`).exec(out);
  const lineFn = rx(`function ${ID}\\((${ID}),${ID}=\`local\`\\)\\{let (${ID})=(${ID})\\(\\1\\)`).exec(out)?.[3];
  const linesFn = rx(`function (${ID})\\(${ID},${ID}=${esc(deps)},\\{set:${ID}=!0,lore:${ID}=!0,technique:${ID}=!0\\}=\\{\\}\\)\\{`).exec(out)?.[1];
  const useFn = rx(`\\.lightSource===(${ID})\\?\\([^{};]+\\):(${ID})\\(\\1,null\\)`).exec(out)?.[2];
  const cardFnMatch = once(out, rx(`function (${ID})\\(${ID},${ID},${ID}=${ID},\\{body:${ID}=!1,own:${ID}=!0\\}=\\{\\}\\)\\{`), 'pack card');
  const disposeMatch = once(out, rx(`function (${ID})\\(${ID}=null\\)\\{(${ID})=\\2\\.filter\\(${ID}=>${ID}&&${ID}\\.container!==`), 'pack dispose list');
  const syncMatch = once(out, rx(`(${ID})=(${ID})=>\\{for\\(let (${ID}) of ${esc(disposeMatch[2])}\\)\\3\\.sync\\(\\2\\)\\}`), 'pack sync list');
  const dockMatch = once(out, rx(`((${ID})\\.append\\((${ID})\\(\\)\\),)(${ID})\\.append\\((${ID})\\(\\),\\2\\)`), 'pack dock mount');
  const stashMatch = once(out, rx(`function (${ID})\\((${ID})\\)\\{${ID}=null;let (${ID})=\\2===\`take\`,(${ID})=\\3\\?${ID}\\(${ID}\\.items,${ID}\\(\\),${ID}\\):(${ID})\\.tabs\\.find\\(((${ID})=>\\7\\.tab===(${ID}))\\)\\?\\.items\\?\\?\\[\\]`), 'pack stash list');
  const udMatch = once(out, rx(`function (${ID})\\(\\)\\{let (${ID})=(${ID})\\?\\.ownerDocument\\?\\.activeElement\\?\\?globalThis\\.document\\?\\.activeElement;return!\\2\\|\\|\\2\\.dataset\\?\\.focus!==\`store-filter\`\\|\\|!\\3\\?\\.contains\\?\\.\\(\\2\\)\\?null:\\{at:typeof \\2\\.selectionStart==\`number\`\\?\\[\\2\\.selectionStart,\\2\\.selectionEnd\\]:null\\}\\}function (${ID})\\((${ID})\\)\\{let (${ID})=\\3\\?\\.querySelector\\?\\.\\(\`\\[data-focus="store-filter"\\]\`\\);if\\(\\6&&\\(\\6\\.focus\\?\\.\\(\\{preventScroll:!0\\}\\),\\5\\.at\\)\\)try\\{\\6\\.setSelectionRange\\(\\5\\.at\\[0\\],\\5\\.at\\[1\\]\\)\\}catch\\{\\}\\}`), 'pack focus');
  const scrollSaveMatch = once(out, rx(`(${ID})&&(${ID})&&(${ID})\\.set\\(\\2,\\1\\.scrollTop\\),(${esc(disposeMatch[1])})\\(\\),(${ID})\\.clear\\(\\)`), 'pack scroll save');
  const scrollRestoreMatch = once(out, rx(`(${ID})&&${esc(scrollSaveMatch[3])}\\.has\\((${ID})\\)&&\\(\\1\\.scrollTop=${esc(scrollSaveMatch[3])}\\.get\\(\\2\\)\\),${esc(scrollSaveMatch[2])}=\\2`), 'pack scroll restore');
  const rarityOnFn = rx(`if\\(${ID}\\.value=${ID}\\.cat,[\\s\\S]{0,140}?(${ID})\\(\\)\\)\\{let ${ID}=${esc(close[2])}\\(\`select\`,\`storerarity\`\\)`).exec(out)?.[1] ?? null;
  const decM = rx(`function (${ID})\\((${ID}),(${ID})\\)\\{let ${ID}=(${ID})\\(\\3\\);return ${ID}&&\\(\\2\\.dataset\\.rarity=${ID}\\),${ID}===\`legendary\`&&\\3\\?\\.exalted===!0&&\\(\\2\\.dataset\\.exalted=\`\`\\),${ID}\\(\\3\\?\\.sigil\\)&&\\(\\2\\.dataset\\.sigil=\`\`\\),${ID}\\(\\2,\\3\\),(${ID})\\(\\3\\)&&\\(\\2\\.dataset\\.locked=\`\`\\),(${ID})\\(\\3\\)&&\\(\\2\\.dataset\\.junk=\`\`\\),`).exec(out);
  const sockKoM = rx(`if\\(!${ID}\\(\\)\\)return null;let (${ID})=(${ID})\\((${ID})\\);if\\(!\\1\\.length\\)return null;`).exec(out);
  const sockGoM = rx(`function ${ID}\\((${ID}),(${ID})\\)\\{if\\(\\2===\`empty\`\\)return\`Empty socket\`;let (${ID})=(${ID})\\(\\1,\\2\\);return \\3\\?\`\\$\\{(${ID})\\[\\2\\]\\}: \\$\\{(${ID})\\(\\3\\)\\}\`:\`\`\\}`).exec(out);
  const worthM = rx(`(${ID})\\(\`Worth\`,(${ID})\\((${ID})\\)\\)`).exec(out);
  const boundM = rx(`let (${ID})=(${ID})\\((${ID})\\);\\1&&${ID}\\.append\\(${esc(close[2])}\\(\`p\`,\`boundline\`,\\1\\)\\)`).exec(out);
  const insuredM = rx(`let (${ID})=${ID}===\`local\`\\?(${ID})\\(\\)\\?\\.lineOf\\((${ID})\\):null;\\1&&${ID}\\.append\\(${esc(close[2])}\\(\`p\`,\`boundline insuredline\`,\\1\\)\\)`).exec(out);
  const setM = rx(`let (${ID})=(${ID})\\((${ID})\\((${ID})\\)\\);return \\1&&${ID}\\.push\\(${ID}\\?(${ID})\\(\\4\\)\\[0\\]\\?\\?\\1\\.name:\`\\$\\{\\1\\.name\\} set\`\\)`).exec(out);
  const techM = rx(`function ${ID}\\((${ID}),\\{full:${ID}=!1,keyWord:${ID}=\`\`\\}=\\{\\}\\)\\{let (${ID})=(${ID})\\(\\1\\);if\\(!\\2\\|\\|typeof document>\`u\`\\)return null;`).exec(out);
  const sortMetaExpr = `{pageOf:${doMatch[6]},pages:${doMatch[5]},rarityOf:${doMatch[8]},rarityRanks:${doMatch[7]},valueOf:${doMatch[2]},horseOf:${doMatch[4]},pinOf:${koMatch[3]},collator:${colMatch[1]}}`;
  const pureCardFields = (lineFn && linesFn && decM) ? [
    `live:!0`,
    `rarityOn:()=>{try{return ${rarityOnFn ? `!!${rarityOnFn}()` : '!0'}}catch{return!0}}`,
    `lightSource:()=>{try{return ${deps}.entity?.lightSource??null}catch{return null}}`,
    `itemLine:(it)=>{try{return ${lineFn}(it)}catch{return null}}`,
    `itemValue:(it)=>{try{const v=${doMatch[2]}(it);return Number.isFinite(v)?v:(Number(it?.value)||0)}catch{return Number(it?.value)||0}}`,
    `itemEffects:(it,opts)=>{try{return ${linesFn}(it,${deps},opts??{set:!1,lore:!1,technique:!0})}catch{return[]}}`,
    techM ? `techInfo:(it)=>{try{const t=${techM[3]}(it);return t?{name:t.name||\`\`,what:t.what||\`\`,value:t.value,band:t.band??null}:null}catch{return null}}` : null,
    `rarityOf:(it)=>{try{return ${decM[4]}(it)||\`common\`}catch{return\`common\`}}`,
    `isLocked:(it)=>{try{return!!${decM[5]}(it)}catch{return!1}}`,
    `isJunk:(it)=>{try{return!!${decM[6]}(it)}catch{return!1}}`,
    sockKoM ? `socketsOf:(it)=>{try{return ${sockKoM[2]}(it)??[]}catch{return[]}}` : null,
    sockGoM ? `gemName:(id)=>${sockGoM[5]}?.[id]??id` : null,
    sockGoM ? `gemBonus:(it,id)=>{try{const b=${sockGoM[4]}(it,id);return b?${sockGoM[6]}(b):\`\`}catch{return\`\`}}` : null,
    worthM ? `letterWorth:(it)=>{try{return ${worthM[2]}(it)}catch{return null}}` : null,
    boundM ? `boundLine:(it)=>{try{return ${boundM[2]}(it)}catch{return null}}` : null,
    insuredM ? `insuredLine:(it)=>{try{return ${insuredM[2]}()?.lineOf?.(it)??null}catch{return null}}` : null,
    setM ? `setInfo:(it)=>{try{const s=${setM[2]}(${setM[3]}(it));return s?{name:s.name,tiers:${setM[5]}(it)}:null}catch{return null}}` : null,
  ].filter(Boolean).join(',') + ',' : '';
  const findHeadCtx = `{${pureCardFields}cardOf:(it)=>{try{return ${cardFnMatch[1]}(it,\`local\`,()=>{},{body:!1})?.c??null}catch{return null}},sortFlat:(arr)=>__dfoPackSortList$(arr,{nameOf:${nameOf},flat:!0},${koMatch[1]},${sortMetaExpr})}`;
  const extraCtx = [
    `repaint:()=>{${refresh[1]}();${render}()}`,
    wornMatch?.[2] ? `worn:()=>${wornMatch[2]}` : null,
    tile?.[2] && lineFn ? `makeTile:(it,host,box)=>${tile[2]}(${lineFn}(it),host,box,!1)` : null,
    linesFn ? `itemLines:(it)=>${linesFn}(it,${deps},{set:!1,lore:!1,technique:!1})` : null,
    useFn ? `useItem:(it)=>${useFn}(it,null)` : null,
  ].filter(Boolean).join(',');

  out = out.replace(`__dfoPackDeps$`, deps);
  out = put(out, koMatch[0], koMatch[0].slice(0, -koCall.length)
    + `let ${koMatch[6]}=__dfoPackSortList$(${koMatch[4]},${koMatch[5]},${koMatch[1]},${sortMetaExpr})`);
  out = put(out, footMatch[0], footMatch[0].slice(0, -footCall.length)
    + `(__dfoPackFoot$(${footMatch[1]},${footMatch[3]},${deps},{kind:${bagMatch[2]}?.kind??null,hasBag:!!${bagMatch[1]}(),toggleBag:${bagMatch[3]},${extraCtx}}),${footCall})`);
  out = put(out, close[0], `let ${close[1]}=${close[2]}(\`button\`,\`act\`,\`Close\`);${close[1]}.onclick=()=>${close[3]}(),${close[4]}.append(${close[1]}),__dfoPackHead$(${close[4]},()=>{${refresh[1]}();${render}()},${deps},${findHeadCtx}),${close[5]}.append(${close[4]});let ${close[6]}=${close[2]}(\`div\`,\`pack\`)`);
  out = put(out, dockMatch[0], `${dockMatch[1]}${dockMatch[4]}.append(__dfoPackShelf$(${dockMatch[5]}(),${dockMatch[2]},()=>{let __c=${dockMatch[2]}.firstElementChild;__c&&${disposeMatch[1]}(__c);${dockMatch[2]}.innerHTML=\`\`;${dockMatch[2]}.append(${dockMatch[3]}());${syncMatch[1]}({draw:!1});${syncMatch[1]}()},${model},${deps}),${dockMatch[2]})`);
  out = put(out, stashMatch[0], stashMatch[0].replace(`:${stashMatch[5]}.tabs.find(${stashMatch[6]})?.items??[]`, `:__dfoPackStash$(${stashMatch[5]}.tabs.find(${stashMatch[6]})?.items??[],${stashMatch[8]},${stashMatch[5]},${deps})`));
  out = put(out, udMatch[0], `function ${udMatch[1]}(){let e=${udMatch[3]}?.ownerDocument?.activeElement??globalThis.document?.activeElement;let k=e?.dataset?.focus;return!e||(k!==\`store-filter\`&&k!==\`dfo-pack-find\`)||!${udMatch[3]}?.contains?.(e)?null:{key:k,at:typeof e.selectionStart==\`number\`?[e.selectionStart,e.selectionEnd]:null}}function ${udMatch[4]}(e){let t=e?.key?${udMatch[3]}?.querySelector?.(\`[data-focus="\${e.key}"]\`):null;if(t&&(t.focus?.({preventScroll:!0}),e.at))try{t.setSelectionRange(e.at[0],e.at[1])}catch{}}`);
  out = put(out, scrollSaveMatch[0], `(globalThis.__dfoPack?.isFindRendered?.()===!0?globalThis.__dfoPack?.syncFindScroll?.(${scrollSaveMatch[1]}?.scrollTop):${scrollSaveMatch[1]}&&${scrollSaveMatch[2]}&&${scrollSaveMatch[3]}.set(${scrollSaveMatch[2]},${scrollSaveMatch[1]}.scrollTop)),${scrollSaveMatch[4]}(),${scrollSaveMatch[5]}.clear()`);
  out = put(out, scrollRestoreMatch[0], `(globalThis.__dfoPack?.isFindOpen?.()===!0?${scrollRestoreMatch[1]}&&(${scrollRestoreMatch[1]}.scrollTop=globalThis.__dfoPack?.findScrollTop?.()??0):${scrollRestoreMatch[1]}&&${scrollSaveMatch[3]}.has(${scrollRestoreMatch[2]})&&(${scrollRestoreMatch[1]}.scrollTop=${scrollSaveMatch[3]}.get(${scrollRestoreMatch[2]}))),${scrollSaveMatch[2]}=${scrollRestoreMatch[2]}`);
  out = put(out, refresh[0], `${refresh[1]}=()=>{__dfoPackRefresh$(${deps},()=>!!${salvage}||!!${chestRefusal}(${deps}),()=>${sortInPlace}(${deps}.entity?.items,{nameOf:${nameOf}}));${refresh[2]}=${pm}(${refresh[3]}),`);
  out = packLockGuards(out, { elFn: close[2], refreshFn: refresh[1], renderFn: render });
  out = gemSocketing(out, { elFn: close[2], refreshFn: refresh[1], renderFn: render, lockedFn: decM?.[5] ?? null });
  out = disableModelIcons(out);
  out = cleanSameHostRemount(out);
  out = sessionHandle(out);
  out = lifecycle(out, render, deps, true);
  out = fastInteractions(out, {
    renderFn: render,
    salvageVar: salvage,
    tabVar: tab,
    disposeFn: disposeMatch[1],
    syncFn: syncMatch[1],
    listColFn: dockMatch[3],
    scrollPrevVar: scrollSaveMatch[2],
    scrollMapVar: scrollSaveMatch[3],
    elFn: close[2],
  });
  const packDelPack = ',delete globalThis.__pack}';
  if (out.includes(packDelPack)) out = put(out, packDelPack, ',__dfoPackUnmount$()' + packDelPack);
  return out + '\n;function __dfoPackList$(t,p,m,d){try{return globalThis.__dfoPack?.list?.(t,p,m,d)??t}catch{return t}}'
    + 'function __dfoPackStash$(t,p,m,d){try{return globalThis.__dfoPack?.stashList?.(t,p,m,d)??t}catch{return t}}'
    + 'function __dfoPackShelf$(s,l,r,m,d){try{return globalThis.__dfoPack?.shelf?.(s,l,r,m,d)??s}catch{return s}}'
    + 'function __dfoPackBuild$(f,e){const p=globalThis.__dfoPack;return typeof p?.build===\'function\'?p.build(f,e):f(e)}'
    + 'function __dfoPackMode$(){try{return globalThis.__dfoPack?.mode?.()??\'\'}catch{return\'\'}}'
    + 'function __dfoPackListRow$(){try{return globalThis.__dfoPack?.listRow?.()===!0}catch{return!1}}'
    + 'function __dfoPackHead$(h,r,d,f){try{globalThis.__dfoPack?.head?.(h,r,d,f)}catch{}}'
    + 'function __dfoPackFoot$(f,w,d,c){try{globalThis.__dfoPack?.foot?.(f,w,d,c)}catch{}}'
    + 'function __dfoPackSortList$(e,o,f,m){try{const fn=globalThis.__dfoPack?.sortList;return fn?fn(e,o,f,m):f(e,o)}catch{return f(e,o)}}'
    + 'function __dfoPackRefresh$(d,b,s){try{globalThis.__dfoPack?.refresh?.(d,{busy:b,sort:s})}catch{}}'
    + 'function __dfoPackUnmount$(){try{globalThis.__dfoPack?.onUnmount?.()}catch{}}\n';
}

// Keep locked items in the player's inventory across ALL container transfers (wagon/storage/container/bag/reward/ground),
// blocking drag-and-drop hints, manual one-by-one stowing, and batch "Stash all", and refresh/re-sort on lock toggle.
function packLockGuards(out, { elFn = null, refreshFn = null, renderFn = null } = {}) {
  const drag = once(
    out,
    rx(`function (${ID})\\((${ID})\\)\\{if\\((${ID})\\?\\.kind===\`ground\`&&(${ID})\\(\\2,\`drop\`\\)\\|\\|(${ID})\\(\\2\\)\\|\\|\\3&&(${ID})\\(\\2,\\3\\.kind\\)\\|\\|\\3&&(${ID})\\(\\2\\)\\)return\\{kind:\`stow\`,label:null,speaks:!0\\}`),
    'pack drag lock guard'
  );
  let t = put(out, drag[0], `function ${drag[1]}(${drag[2]}){if(${drag[3]}&&${drag[4]}(${drag[2]},\`drop\`)||${drag[5]}(${drag[2]})||${drag[3]}&&${drag[6]}(${drag[2]},${drag[3]}.kind)||${drag[3]}&&${drag[7]}(${drag[2]}))return{kind:\`stow\`,label:null,speaks:!0}`);

  const single = once(
    t,
    rx(`function (${ID})\\((${ID})\\)\\{if\\((${ID})=null,${esc(drag[3])}\\?\\.kind===\`ground\`&&${esc(drag[4])}\\(\\2,\`drop\`\\)\\)return (${ID})=`),
    'pack transfer single lock guard'
  );
  t = put(t, single[0], `function ${single[1]}(${single[2]}){if(${single[3]}=null,${drag[4]}(${single[2]},\`drop\`))return ${single[4]}=`);

  const stash = once(
    t,
    rx(`if\\(${esc(drag[3])}\\.kind===\`ground\`&&${esc(drag[4])}\\((${ID}),\`drop\`\\)\\)return\\{verdict:\`skip\`,refusal:\\{text:`),
    'pack stash all lock guard'
  );
  t = put(t, stash[0], `if(${drag[4]}(${stash[1]},\`drop\`))return{verdict:\`skip\`,refusal:{text:`);

  if (elFn && refreshFn && renderFn) {
    const lockBtn = once(
      t,
      rx(`if\\((${ID})===\`local\`\\)\\{let (${ID})=${esc(elFn)}\\(\`button\`,\`act\`,(${ID})\\((${ID})\\)\\?\`Unlock\`:\`Lock\`\\);\\2\\.onclick=\\(\\)=>\\{(${ID})\\(\\4\\),(${ID})\\(\\4\\),(${ID})=null,${esc(renderFn)}\\(\\)\\}`),
      'pack lock toggle refresh'
    );
    t = put(t, lockBtn[0], `if(${lockBtn[1]}===\`local\`){let ${lockBtn[2]}=${elFn}(\`button\`,\`act\`,${lockBtn[3]}(${lockBtn[4]})?\`Unlock\`:\`Lock\`);${lockBtn[2]}.onclick=()=>{${lockBtn[5]}(${lockBtn[4]}),${lockBtn[6]}(${lockBtn[4]}),${lockBtn[7]}=null,${refreshFn}(),${renderFn}()}`);
    const junkRx = rx(`let (${ID})=${esc(elFn)}\\(\`button\`,\`act\`,(${ID})\\((${ID})\\)\\?\`Not junk\`:\`Junk\`\\);\\1\\.onclick=\\(\\)=>\\{(${ID})\\(\\3\\),(${ID})=null,${esc(renderFn)}\\(\\)\\}`);
    const junkBtn = junkRx.exec(t);
    if (junkBtn) {
      if (junkRx.exec(t.slice(junkBtn.index + junkBtn[0].length))) {
        throw new Error('[dfo-mod] inventory transform ambiguity: multiple pack junk toggle refresh');
      }
      t = put(t, junkBtn[0], `let ${junkBtn[1]}=${elFn}(\`button\`,\`act\`,${junkBtn[2]}(${junkBtn[3]})?\`Not junk\`:\`Junk\`);${junkBtn[1]}.onclick=()=>{${junkBtn[4]}(${junkBtn[3]}),${junkBtn[5]}=null,${refreshFn}(),${renderFn}()}`);
    }
  }
  return t;
}

// Fix gem socketing from both the right-click context menu ("Set in..." opening a target chooser modal like nd())
// and the gem detail card (.acts / .gem-home), enforcing item-lock checks and clearing stale detail selection.
function gemSocketing(out, { elFn = null, refreshFn = null, renderFn = null, lockedFn = null } = {}) {
  if (out.includes('__dfoGemMenuPick$')) return out;
  const el = elFn || once(out, rx(`let ${ID}=(${ID})\\(\`button\`,\`act\`,\`Close\`\\)`), 'gem elFn')[1];
  const rfr = refreshFn || once(out, rx(`(${ID})=\\(\\)=>\\{${ID}=${ID}\\(${ID}\\),`), 'gem refreshFn')[1];
  const rnd = renderFn || once(out, rx(`\\(\\)=>\\{${ID}\\(\`packPhoneDoll\`,!${ID}\\),(${ID})\\(\\)\\}`), 'gem renderFn')[1];
  const lck = lockedFn || rx(`${esc(el)}\\(\`button\`,\`act\`,(${ID})\\(${ID}\\)\\?\`Unlock\`:\`Lock\`\\)`).exec(out)?.[1] || null;

  const pickedM = once(out, rx(`function ${ID}\\((${ID}),${ID}=\`local\`\\)\\{let ${ID}=${ID}\\(\\1\\),[^;]{0,120}?${esc(el)}\\(\`button\`,\`itemrow\\$\\{(${ID})===\\1&&`), 'gem picked var');
  const pickedVar = pickedM[2];

  const tdM = once(
    out,
    rx(`function (${ID})\\(\\)\\{(${ID})\\?\\.remove\\(\\),\\2=null,(${ID})\\?\\.\\(\\),\\3=null\\}function ${ID}\\(${ID},${ID}\\)\\{((?:${ID}\\(\\),)+)\\1\\(\\),\\2=${esc(el)}\\(\`div\`,\`inv-info inv-target\`\\)`),
    'gem target modal'
  );
  const [, tdFn, modalVar, cleanupVar, preModalCalls] = tdM;

  const duM = once(
    out,
    rx(`if\\((${ID})===\`local\`&&(${ID})\\(\\)&&(${ID})\\((${ID})\\)&&!\\4\\.questItem&&(${ID})\\(\\)\\.length\\)\\{let (${ID})=(${ID})===\\4,(${ID})=${esc(el)}\\(\`button\`,\`act\\$\\{\\6\\?\` on\`:\`\`\\}\`,\`Set in\\.\\.\\.\`\\);if\\(\\8\\.onclick=\\(\\)=>\\{\\7=\\6\\?null:\\4,${esc(rnd)}\\(\\)\\},(${ID})\\.append\\(\\8\\),\\6\\)[\\s\\S]{0,600}?\\.append\\(${ID}\\)\\}\\}`),
    'gem Du block'
  );
  const duHeadRe = rx(`^if\\((${ID})===\`local\`&&(${ID})\\(\\)&&(${ID})\\((${ID})\\)&&!\\4\\.questItem&&(${ID})\\(\\)\\.length\\)\\{let (${ID})=(${ID})===\\4,(${ID})=${esc(el)}\\(\`button\`,\`act\\$\\{\\6\\?\` on\`:\`\`\\}\`,\`Set in\\.\\.\\.\`\\);if\\(\\8\\.onclick=\\(\\)=>\\{\\7=\\6\\?null:\\4,${esc(rnd)}\\(\\)\\},(${ID})\\.append\\(\\8\\),\\6\\)`);
  const duHead = duHeadRe.exec(duM[0]);
  if (!duHead) throw new Error('unsupported gem Du head signature');
  const [, sideVar, srFn, gemIdFn, itemArg, targetsFn, openFlag, vsVar, btnVar, actsEl] = duHead;

  const duTail = duM[0].slice(duHead[0].length);
  const duBodyRe = rx(`^for\\(let (${ID}) of ${esc(targetsFn)}\\(\\)\\)\\{let (${ID})=${esc(el)}\\(\`button\`,\`act gem-home\`,\`Set in \\$\\{(${ID})\\(\\1,\\{getQuest:(${ID})\\.getQuest\\?\\?null\\}\\)\\}\`\\);\\2\\.onclick=\\(\\)=>\\{let (${ID})=${esc(gemIdFn)}\\(${esc(itemArg)}\\),(${ID})=(${ID})\\(\\1,\\5,(${ID})\\(\\),null,\\{from:${esc(itemArg)}\\}\\);${esc(vsVar)}=null,(${ID})=\\6\\.ok\\?(${ID})\\(\\3\\(\\1,\\{getQuest:\\4\\.getQuest\\?\\?null\\}\\),\\5\\):(${ID})\\[\\6\\.reason\\?\\?\`\`\\]\\?\\?\`That will not set\\.\`,\\6\\.ok&&!\\(\\4\\.items\\?\\.\\(\\)\\?\\?\\[\\]\\)\\.includes\\(${esc(itemArg)}\\)&&\\(${esc(itemArg)}=null\\),(${ID})\\(\\),(${ID})\\(\\)\\},${esc(actsEl)}\\.append\\(\\2\\)\\}\\}$`);
  const duBody = duBodyRe.exec(duTail);
  if (!duBody) throw new Error('unsupported gem Du body signature');
  const [, targetIt, homeBtn, targetNameFn, depsVar, gemKindVar, resVar, setGemFn, bagCtxFn, noticeVar, okMsgFn, errMap] = duBody;

  const xlM = once(out, rx(`(function (${ID})\\((${ID}),(${ID}),(${ID}),(${ID})\\)\\{[\\s\\S]{0,360}?append\\(${esc(el)}\\(\`p\`,\`inv-menu-head\`,(${ID})\\(\\3,${esc(depsVar)}\\.entity\\)\\.name\\)\\);)for\\(let (${ID}) of (${ID})\\)\\{\\8\\.className=\`inv-menu-item\`,\\8\\.setAttribute\\(\`role\`,\`menuitem\`\\);let (${ID})=\\8\\.onclick;\\8\\.onclick=(${ID})=>\\{\\11\\.stopPropagation\\(\\),(${ID})\\(\\),\\10\\?\\.\\(\\11\\)\\},(${ID})\\.append\\(\\8\\)\\}(?=document\\.body\\.append\\(\\13\\))`), 'gem context menu Xl');
  const [, xlHead, , menuItem, menuSide, , , nameCardFn, , btnsArr, , , closeMenuFn, menuEl] = xlM;

  const lockCheck = lck ? `${lck}(${itemArg})` : `(${itemArg}?.locked===!0)`;
  const lockCheckPick = lck ? `${lck}(__dfoGItem)` : `(__dfoGItem?.locked===!0)`;

  const newDuBlock =
    `if(${sideVar}===\`local\`&&${srFn}()&&${gemIdFn}(${itemArg})&&!${itemArg}.questItem&&${targetsFn}().length){`
    + `let ${openFlag}=${vsVar}===${itemArg},${btnVar}=${el}(\`button\`,\`act\${${openFlag}?\` on\`:\`\`}\`,\`Set in...\`);`
    + `${btnVar}.dataset.dfoSetGem=\`1\`;`
    + `if(${btnVar}.onclick=()=>{if(${lockCheck}){${vsVar}=null,${noticeVar}=\`Locked. Unlock it first\`,${rfr}(),${rnd}();return}${vsVar}=${openFlag}?null:${itemArg},${rnd}()},${actsEl}.append(${btnVar}),${openFlag})`
    + `for(let ${targetIt} of ${targetsFn}()){`
    + `let ${homeBtn}=${el}(\`button\`,\`act gem-home\`,\`Set in \${${targetNameFn}(${targetIt},{getQuest:${depsVar}.getQuest??null})}\`);`
    + `${homeBtn}.onclick=()=>{if(${lockCheck}){${vsVar}=null,${noticeVar}=\`Locked. Unlock it first\`,${rfr}(),${rnd}();return}`
    + `let ${gemKindVar}=${gemIdFn}(${itemArg}),${resVar}=${setGemFn}(${targetIt},${gemKindVar},${bagCtxFn}(),null,{from:${itemArg}});`
    + `${vsVar}=null,${noticeVar}=${resVar}.ok?${okMsgFn}(${targetNameFn}(${targetIt},{getQuest:${depsVar}.getQuest??null}),${gemKindVar}):${errMap}[${resVar}.reason??\`\`]??\`That will not set.\`,`
    + `${resVar}.ok&&!(${depsVar}.items?.()??[]).includes(${itemArg})&&${pickedVar}===${itemArg}&&(${pickedVar}=null),${rfr}(),${rnd}()},`
    + `${actsEl}.append(${homeBtn})}}`;

  const newXlLoop =
    `${xlHead}for(let __dfoBi of ${btnsArr}){`
    + `__dfoBi.className=\`inv-menu-item\`,__dfoBi.setAttribute(\`role\`,\`menuitem\`);`
    + `let __dfoBo=__dfoBi.dataset?.dfoSetGem===\`1\`&&${menuSide}===\`local\`?()=>__dfoGemMenuPick$(${menuItem}):__dfoBi.onclick;`
    + `__dfoBi.onclick=__dfoMe=>{__dfoMe.stopPropagation(),${closeMenuFn}(),__dfoBo?.(__dfoMe)},`
    + `${menuEl}.append(__dfoBi)}`;

  const helper =
    `\n;function __dfoGemMenuPick$(__dfoGItem){`
    + `if(${lockCheckPick}){${vsVar}=null,${noticeVar}=\`Locked. Unlock it first\`,${rfr}(),${rnd}();return}`
    + `let __dfoGTs=${targetsFn}();if(!__dfoGTs.length){${vsVar}=null,${noticeVar}=\`That will not set.\`,${rfr}(),${rnd}();return}`
    + `${preModalCalls}${tdFn}();`
    + `let __dfoGWrap=${modalVar}=${el}(\`div\`,\`inv-info inv-target\`);__dfoGWrap.setAttribute(\`role\`,\`dialog\`),__dfoGWrap.setAttribute(\`aria-label\`,\`Set in...\`),__dfoGWrap.setAttribute(\`aria-modal\`,\`true\`);`
    + `let __dfoGCard=${el}(\`div\`,\`card\`),__dfoGBox=${el}(\`div\`,\`inv-info-box\`);__dfoGBox.append(${el}(\`p\`,\`center\`,${nameCardFn}(__dfoGItem,${depsVar}.entity).name),${el}(\`p\`,\`center\`,\`Set in...\`)),__dfoGCard.append(__dfoGBox);`
    + `let __dfoGBody=${el}(\`div\`,\`inv-info-body\`);__dfoGBody.setAttribute(\`role\`,\`listbox\`);`
    + `let __dfoGOpts=__dfoGTs.map(__dfoGt=>{let __dfoGb=${el}(\`button\`,\`inv-menu-item\`,\`Set in \${${targetNameFn}(__dfoGt,{getQuest:${depsVar}.getQuest??null})}\`);__dfoGb.setAttribute(\`role\`,\`option\`);__dfoGb.onclick=__dfoGev=>{__dfoGev?.stopPropagation?.(),${tdFn}();if(${lockCheckPick}){${vsVar}=null,${noticeVar}=\`Locked. Unlock it first\`,${rfr}(),${rnd}();return}let __dfoGg=${gemIdFn}(__dfoGItem),__dfoGr=${setGemFn}(__dfoGt,__dfoGg,${bagCtxFn}(),null,{from:__dfoGItem});${vsVar}=null,${noticeVar}=__dfoGr.ok?${okMsgFn}(${targetNameFn}(__dfoGt,{getQuest:${depsVar}.getQuest??null}),__dfoGg):${errMap}[__dfoGr.reason??\`\`]??\`That will not set.\`,__dfoGr.ok&&!(${depsVar}.items?.()??[]).includes(__dfoGItem)&&${pickedVar}===__dfoGItem&&(${pickedVar}=null),${rfr}(),${rnd}()};return __dfoGBody.append(__dfoGb),__dfoGb});`
    + `__dfoGCard.append(__dfoGBody);let __dfoGActs=${el}(\`div\`,\`acts\`),__dfoGCancel=${el}(\`button\`,\`act\`,\`Cancel\`);__dfoGCancel.onclick=__dfoGev=>{__dfoGev?.stopPropagation?.(),${tdFn}()};__dfoGActs.append(__dfoGCancel),__dfoGCard.append(__dfoGActs),__dfoGWrap.append(__dfoGCard),document.body.append(__dfoGWrap),__dfoGOpts[0]?.focus?.({preventScroll:!0});`
    + `let __dfoGDown=__dfoGev=>{(__dfoGev.target===__dfoGWrap||!__dfoGWrap.contains(__dfoGev.target))&&(__dfoGev.stopPropagation(),${tdFn}())};`
    + `let __dfoGKey=__dfoGev=>{if(__dfoGev.key===\`Escape\`){__dfoGev.preventDefault(),__dfoGev.stopPropagation(),${tdFn}();return}let __dfoGd=__dfoGev.key===\`ArrowDown\`?1:__dfoGev.key===\`ArrowUp\`?-1:0;if(!__dfoGd)return;__dfoGev.preventDefault(),__dfoGev.stopPropagation();let __dfoGDoc=__dfoGWrap.ownerDocument??document,__dfoGIdx=__dfoGOpts.indexOf(__dfoGDoc.activeElement);__dfoGOpts[Math.max(0,Math.min(__dfoGOpts.length-1,__dfoGIdx<0?0:__dfoGIdx+__dfoGd))]?.focus?.({preventScroll:!1})};`
    + `let __dfoGTid=setTimeout(()=>{document.addEventListener(\`pointerdown\`,__dfoGDown,!0),document.addEventListener(\`keydown\`,__dfoGKey,!0)},0);`
    + `${cleanupVar}=()=>{clearTimeout(__dfoGTid),document.removeEventListener(\`pointerdown\`,__dfoGDown,!0),document.removeEventListener(\`keydown\`,__dfoGKey,!0)};}\n`;

  let next = put(out, duM[0], newDuBlock);
  next = put(next, xlM[0], newXlLoop);
  return next + helper;
}

// nativeInventory-*.js: refuse moving a locked item into any container in classic inventory too.
function nativeLock(text) {
  const m = once(
    text,
    rx(`if\\((${ID})\\((${ID}),\`drop\`\\)&&(${ID})\\(this\\.hooks,\\{usingWagon:this\\.usingWagon,chooseOne:this\\.chooseOne\\}\\)===(${ID})\\.Dropped\\)\\{this\\._refuse\\(\\{text:(${ID})\\(`),
    'native inventory container lock'
  );
  return put(text, m[0], `if(${m[1]}(${m[2]},\`drop\`)){this._refuse({text:${m[5]}(`);
}

// Morrowind item-icon replacements are disabled in both worldTick and enhancedInventory, so cold
// item misses never preload .nif icons or notify fpArm. Genuine 3D character figure updates
// can still notify fpArm.subscribe synchronously or in bursts; cache invalidation stays
// synchronous while full repaints coalesce after the current render stack unwinds.

// Morrowind 3D item icons (hl/gl -> Ev/NV -> fpArm.itemIcon) are replaced by native 2D icons (ss).
function disableModelIcons(out) {
  const m = once(
    out,
    rx(`(${ID})=\\((${ID}),(${ID})\\)=>${ID}\\(\\2,\\3,${ID}\\.fpArm\\)[;,]function (${ID})\\(${ID},${ID}\\)\\{let (${ID})=\\1\\([^}]+\\);return \\5\\?\\{src:\\5,w:${ID},h:${ID},smooth:!0\\}:null\\}`),
    'inventory modelPicture'
  );
  return put(out, m[0], `${m[1]}=()=>null;function ${m[4]}(){return null}`);
}

// Neutralize NV (Ev) and fpArm.itemIcon in worldTick so inventory, hotbar, and quick-slots
// always use 2D sprites / custom vendor textures and never trigger cold Morrowind mesh preloads.
function worldItemIcons(text) {
  const urlFn = once(
    text,
    rx(`(function ${ID}\\((${ID}),${ID},(${ID})\\)\\{)(if\\(!\\3\\|\\|typeof \\3\\.itemIcon!=\`function\`\\|\\|!\\2\\)return null;)`),
    'worldTick modelItemIconUrl'
  );
  let out = put(text, urlFn[0], `${urlFn[1]}return null;${urlFn[4]}`);
  const methodFn = once(
    out,
    rx(`(itemIcon\\((${ID}),\\{size:${ID}=96\\}=\\{\\}\\)\\{)(if\\(!\\((${ID})&&\\4\\.ok&&\\4\\.catalog&&${ID}\\)\\|\\|!\\2\\)return null;)`),
    'worldTick fpArm.itemIcon'
  );
  return put(out, methodFn[0], `${methodFn[1]}return null;${methodFn[3]}`);
}

// An old paperdoll compose may resolve after A has been replaced by B.
// Only the session that scheduled the promise may repaint on its completion.
function guardFigureAsync(out, owner, deps, render, required) {
  if (!deps) return out;
  const pattern = 'function (' + ID + ')\\(\\)\\{Promise\\.resolve\\((' + ID + ')\\(' + esc(deps) + '\\.entity\\)\\)\\.then\\(\\(\\)=>\\{' + esc(owner) + '&&' + esc(render) + '\\(\\)\\}\\)';
  const found = [...out.matchAll(new RegExp(pattern, 'g'))];
  if (found.length !== 1) {
    if (required) throw new Error('inventory paperdoll async owner: ' + found.length + ' places');
    return out;
  }
  const whole = found[0][0];
  const patched = whole
    .replace('(){Promise.resolve(', '(){const __dfoFigureHost$=' + owner + ',__dfoFigureSession$=' + deps + ',__dfoFigureGeneration$=__dfoFigureGen$,__dfoFigureFilterEpoch$=__dfoFilterEpoch$;Promise.resolve(')
    .replace(owner + '&&' + render + '()', () => owner + '===__dfoFigureHost$&&' + deps + '===__dfoFigureSession$&&__dfoFigureGen$===__dfoFigureGeneration$&&__dfoFilterEpoch$===__dfoFigureFilterEpoch$&&' + render + '()');
  return put(out, whole, patched);
}
function lifecycle(out, render, deps = null, requireFigure = false) {
  const decl = `function ${render}(){`;
  once(out, rx(`function ${esc(render)}\\(\\)\\{`), 'inventory native render');
  const callbacks = [...out.matchAll(/\.subscribe\(\(\)=>\{((?:[^{}]|\{[^{}]*\}){0,400})\}\)/g)]
    .filter(m => m[1].includes('key:null,img:null') && m[1].includes(`${render}()`));
  if (callbacks.length !== 1) throw new Error(`inventory fpArm callback: ${callbacks.length} places`);
  const whole = callbacks[0][0], body = callbacks[0][1];
  const call = `${render}()`, at = body.indexOf(call);
  if (at < 0 || body.indexOf(call, at + call.length) >= 0) throw new Error('inventory figure callback has ambiguous repaint');
  const guard = /(?:if\(([\w$]+)\)|([\w$]+)&&)\s*$/.exec(body.slice(0, at));
  if (!guard) throw new Error('inventory figure callback has unsupported owner guard');
  const owner = guard[1] || guard[2];
  out = guardFigureAsync(out, owner, deps, render, requireFigure);
  const session = deps ?? 'null';
  const nextBody = body.slice(0, at) + `__dfoFigureNotice$(${owner})` + body.slice(at + call.length);
  const subscription = whole.replace(body, nextBody).replace('.subscribe(', '.subscribe(__dfoOwnFigure$(').replace(/\)$/, '))');
  out = put(out, whole, subscription);
  out = put(out, decl, 'function __dfoNativeRender$(){');
  const syncs = [...out.matchAll(/(?:\b(?:const|let|var)\s+|,)([\w$]+)=\(?([\w$]+)\)?=>\{for\((?:const|let|var) ([\w$]+) of ([\w$]+)\)\3\.sync\(\2\)\}/g)];
  const syncName = syncs.length === 1 ? syncs[0][1] : null;
  const runtime = "\n;let __dfoRenderBusy$=false,__dfoRenderActive$=null,__dfoRenderDirty$=false,__dfoRenderPending$=null;\nlet __dfoFigureGen$=0,__dfoNoticeSeq$=0,__dfoRenderedNoticeSeq$=0;\nlet __dfoFilterEpoch$=0,__dfoFilterWatcherBound$=false,__dfoPipelinePhase$=\"idle\";\nfunction __dfoWatchFilter$(){\n  if(__dfoFilterWatcherBound$||typeof globalThis.document?.addEventListener!==\"function\")return;\n  __dfoFilterWatcherBound$=true;\n  const changed=(event)=>{\n    const node=event?.target,classes=node?.classList;\n    if(!classes||!@@OWNER@@?.contains?.(node))return;\n    const select=event.type===\"change\"&&(classes.contains(\"storecat\")||classes.contains(\"storerarity\")||classes.contains(\"storemat\"));\n    const search=event.type===\"input\"&&classes.contains(\"storesearch\");\n    if(!select&&!search)return;\n    const revision=++__dfoFilterEpoch$;\n    __dfoPipelinePhase$=\"filtering\";\n    Promise.resolve().then(()=>{\n      if(revision===__dfoFilterEpoch$&&__dfoPipelinePhase$===\"filtering\")__dfoPipelinePhase$=\"ready\";\n    });\n  };\n  globalThis.document.addEventListener(\"change\",changed,true);\n  globalThis.document.addEventListener(\"input\",changed,true);\n}\nfunction __dfoOwnFigure$(callback){\n  __dfoWatchFilter$();\n  const generation=++__dfoFigureGen$,ownedHost=@@OWNER@@,ownedSession=@@SESSION@@;\n  return (...args)=>{\n    if(generation===__dfoFigureGen$&&ownedHost===@@OWNER@@&&ownedSession===@@SESSION@@)callback(...args);\n  };\n}\nfunction __dfoFigureNotice$(owner){\n  ++__dfoNoticeSeq$;\n  __dfoRequestRender$(owner,@@SESSION@@);\n}\nfunction __dfoRequestRender$(owner,session,force=false){\n  if(!owner||@@OWNER@@!==owner||@@SESSION@@!==session)return;\n  const generation=__dfoFigureGen$,seq=__dfoNoticeSeq$;\n  const previous=__dfoRenderPending$;\n  if(previous&&previous.owner===owner&&previous.session===session&&previous.generation===generation){\n    previous.seq=Math.max(previous.seq,seq);\n    previous.force=previous.force||force;\n    return;\n  }\n  const pending={owner,session,generation,seq,force,filterEpoch:__dfoFilterEpoch$};\n  __dfoRenderPending$=pending;\n  Promise.resolve().then(()=>{\n    if(__dfoRenderPending$!==pending)return;\n    __dfoRenderPending$=null;\n    if(@@OWNER@@!==owner||@@SESSION@@!==session||__dfoFigureGen$!==generation||__dfoFilterEpoch$!==pending.filterEpoch)return;\n    if(!pending.force&&pending.seq<=__dfoRenderedNoticeSeq$)return;\n    try{@@RENDER@@()}catch(e){console.warn('[dfo-mod inventory] deferred repaint failed',e)}\n  });\n}\nfunction @@RENDER@@(){\n  if(!@@OWNER@@)return;\n  const live={owner:@@OWNER@@,session:@@SESSION@@,generation:__dfoFigureGen$};\n  if(__dfoRenderBusy$){\n    const active=__dfoRenderActive$;\n    if(active&&active.owner===live.owner&&active.session===live.session&&active.generation===live.generation)\n      __dfoRenderDirty$=true;\n    else __dfoRequestRender$(live.owner,live.session,true);\n    return;\n  }\n  const noticeAtStart=__dfoNoticeSeq$;\n  let completed=false;\n  __dfoPipelinePhase$=\"building\";\n  __dfoRenderBusy$=true;__dfoRenderActive$=live;\n  try{__dfoNativeRender$();completed=true}\n  finally{\n    __dfoPipelinePhase$=completed?\"ready\":\"failed\";\n    __dfoRenderBusy$=false;__dfoRenderActive$=null;\n    const dirty=__dfoRenderDirty$;__dfoRenderDirty$=false;\n    const stillOwns=@@OWNER@@===live.owner&&@@SESSION@@===live.session&&__dfoFigureGen$===live.generation;\n    if(completed){\n      if(stillOwns){\n        __dfoRenderedNoticeSeq$=Math.max(__dfoRenderedNoticeSeq$,noticeAtStart);\n        if(dirty)__dfoRequestRender$(live.owner,live.session,true);\n      }\n    }else if(__dfoRenderPending$&&__dfoRenderPending$.owner===live.owner&&__dfoRenderPending$.session===live.session){\n      __dfoRenderPending$=null;\n    }\n  }\n}\n";
  const syncCode = "\n;globalThis.__dfoInventoryRemeasure$=(shell,opts)=>{\n  if(!shell?.isConnected||!@@OWNER@@?.contains?.(shell))return false;\n  try{@@SYNC@@(opts?.soft?{draw:true}:{remeasure:true});return true}\n  catch(e){console.warn('[dfo-mod inventory] list remeasure failed',e);return false}\n};\n";
  return out + runtime.replaceAll('@@OWNER@@', owner).replaceAll('@@SESSION@@', session).replaceAll('@@RENDER@@', render) +
    (syncName ? syncCode.replaceAll('@@OWNER@@', owner).replaceAll('@@SYNC@@', syncName) : '');
}

// Performance fast-paths on the real enhancedInventory view:
// 1. Replace domRepaint's full querySelectorAll('*') scroll scan on #enhanced-inventory with targeted scrollable-container scan.
// 2. Skip redundant async paperdoll full repaint on open when the 2D/3D avatar output did not change.
// 3. Patch item selection (.packtip.packdetail + .on highlight) and category tab switches in place without rebuilding
//    the entire 3,600-node DOM / Charcol V2 / Set Relics; any non-trivial state (batch salvage, gold form, notice, layered slots)
//    falls back seamlessly to full native render().
function fastInteractions(out, { renderFn, salvageVar, tabVar, disposeFn, syncFn, listColFn, scrollPrevVar, scrollMapVar, elFn }) {
  const nativeHead = rx(`function __dfoNativeRender\\$\\(\\)\\{(?:[\\s\\S]{0,160}?)if\\((${ID})\\(\\),!(${ID})\\)return;(${ID})\\+\\+,${esc(salvageVar)}&&[\\s\\S]{0,140}?(${ID})\\?\\[\\{text:\\4,center:!0\\}\\]:null,[\\s\\S]{0,80}?(${ID})\\(\\2,\\(\\)\\=>\\{`).exec(out);
  if (!nativeHead) return out;
  const [, closeTipsFn, ownerVar, , noticeVar, repaintFn] = nativeHead;

  // 1. Targeted scroll preservation instead of scanning all 3,600+ SVG/DOM nodes with querySelectorAll('*')
  const fastRepaintCall = `${repaintFn}(${ownerVar},()=>{`;
  if (nativeHead[0].endsWith(fastRepaintCall)) {
    out = put(out, nativeHead[0], nativeHead[0].slice(0, -fastRepaintCall.length) + `__dfoFastRepaint$(${ownerVar},()=>{`);
  }

  // 2. Skip no-op async paperdoll full repaint on open when rendered doll state is unchanged
  let dollHelper = '';
  const dollM = rx(`let (${ID})=(${ID})\\(\\),([\\w$]+)=\\1\\?null:(${ID})\\((${ID})\\(\\),\\{scale:4\\}\\),(${ID})=${esc(elFn)}\\(\`div\`,\`wornmap-doll`).exec(out);
  const figGuardM = rx(`&&__dfoFilterEpoch\\$===__dfoFigureFilterEpoch\\$&&${esc(renderFn)}\\(\\)`).exec(out);
  if (dollM && figGuardM) {
    const [, nVar, modelFn, rVar, drawFn, snapFn] = dollM;
    out = put(out, dollM[0], `let ${nVar}=${modelFn}(),${rVar}=${nVar}?null:${drawFn}(${snapFn}(),{scale:4});if(${ownerVar})${ownerVar}.__dfoDollSig$=${nVar}?\`M\`:(${rVar}||\x60\x60);let ${dollM[6]}=${elFn}(\`div\`,\`wornmap-doll`);
    out = put(out, figGuardM[0], `&&__dfoFilterEpoch$===__dfoFigureFilterEpoch$&&__dfoMaybeFigureRepaint$()`);
    dollHelper = `\nfunction __dfoMaybeFigureRepaint$(){if(!${ownerVar})return;const __s=${modelFn}()?\`M\`:(${drawFn}(${snapFn}(),{scale:4})||\x60\x60);if(${ownerVar}.__dfoDollSig$===__s&&${ownerVar}.querySelector?.(\`.wornmap-doll\`))return;${renderFn}()}\n`;
  }

  // 3. In-place selection (.packtip.packdetail) & tab-switch fast-paths
  const tipBlock = rx(`let (${ID})=(${ID})\\?(${ID}):(${ID})\\?\\?\\3;if\\((${ID})\\)\\{let (${ID})=(${ID})\\(\\);\\6\\.classList\\.add\\(\`packtip\`\\),\\1\\.append\\(\\6\\),requestAnimationFrame\\(\\(\\)=>\\{let (${ID})=\\{worn:\`\\.wornmap \\.wornrow\\.on, \\.wornshelf \\.wornsock\\.on\`,dock:\`\\.pack-dock \\.itemrow\\.on\`,loot:\`\\.loot-win \\.itemrow\\.on\`\\}\\[(${ID})\\][\\s\\S]{0,650}?if\\((${ID})\\((${ID}),\\((${ID})\\?Math\\.round\\(window\\.innerHeight\\*(${ID})\\):`).exec(out);
  const outsideClickM = tipBlock && rx(`${esc(tipBlock[1])}\\.addEventListener\\(\`click\`,(${ID})=>\\{\\(${esc(tipBlock[5])}\\|\\|(${ID})!=null\\)&&\\(\\1\\.target\\.closest\\(\`\\.packtip\`\\)\\|\\|\\1\\.target\\.closest\\(\`button, input, \\.goldfield\`\\)\\|\\|\\(${esc(tipBlock[5])}=null,\\2=null,${esc(renderFn)}\\(\\)\\)\\)\\}\\)`).exec(out);
  const itemRowM = tipBlock && rx(`function ${ID}\\((${ID}),(${ID})=\`local\`\\)\\{[\\s\\S]{0,420}?let (${ID})=${esc(tipBlock[5])}===\\1&&(${ID})===\\2;[\\s\\S]{0,1200}?\\(${esc(tipBlock[5])}=\\3\\?null:\\1,${esc(tipBlock[5])}&&\\(${esc(outsideClickM?.[2] ?? ID)}=null\\),${esc(tipBlock[9])}=\\2===\`remote\`\\?\`loot\`:\`dock\`,\\4=\\2,${esc(noticeVar)}=null,${esc(renderFn)}\\(\\)\\)`).exec(out);

  let interactionHelpers = `
;const __DFO_SCROLL_SEL$='.packlists,.remotelist,.statflip-scroll,.card-body,.dfo-loot-list,.inv-info-body,.walletsheet,.packcol,.packdetail';
function __dfoFastRepaint$(host,fn){
  const saved=[];
  if(host?.querySelectorAll){
    for(const el of host.querySelectorAll(__DFO_SCROLL_SEL$)){
      if(el.scrollTop>0||el.scrollLeft>0){
        const path=[];
        for(let c=el;c&&c!==host;c=c.parentNode){
          const p=c.parentNode;if(!p)break;
          path.push([...p.children].indexOf(c));
        }
        saved.push([path.reverse(),el.tagName,el.className||'',el.scrollTop,el.scrollLeft]);
      }
    }
  }
  fn();
  if(saved.length&&host){
    for(const [at,tag,cls,st,sl] of saved){
      let cur=host;
      for(let i=0;i<at.length;i++){cur=cur?.children?.[at[i]];if(!cur)break;}
      if(cur&&cur.tagName===tag&&(cur.className||'')===cls){if(st)cur.scrollTop=st;if(sl)cur.scrollLeft=sl;}
    }
  }
}
${dollHelper}`;

  if (tipBlock && outsideClickM && itemRowM) {
    const [, , showPackVar, , , pickedVar, , detailFn, , anchorSideVar, fitCardFn, , , fitScaleConst] = tipBlock;
    const goldVar = outsideClickM[2];
    const [, rowItem, rowFrom, rowPickedBool, sideVar] = itemRowM;

    // 3a. Item row click: read live selection (not stale rowPickedBool closure) + in-place patch
    const oldRowTail = `(${pickedVar}=${rowPickedBool}?null:${rowItem},${pickedVar}&&(${goldVar}=null),${anchorSideVar}=${rowFrom}===\`remote\`?\`loot\`:\`dock\`,${sideVar}=${rowFrom},${noticeVar}=null,${renderFn}())`;
    const newRowTail = `(${pickedVar}=(${pickedVar}===${rowItem}&&${sideVar}===${rowFrom})?null:${rowItem},${pickedVar}&&(${goldVar}=null),${anchorSideVar}=${rowFrom}===\`remote\`?\`loot\`:\`dock\`,${sideVar}=${rowFrom},${noticeVar}=null,__dfoPatchSelection$())`;
    if (itemRowM[0].endsWith(oldRowTail)) {
      out = put(out, itemRowM[0], itemRowM[0].slice(0, -oldRowTail.length) + newRowTail);
    }

    // 3b. Worn row click (single-item slots use in-place fast-path; multi-item layered slots use full render)
    const wornRowM = rx(`let (${ID})=(${ID})\\.findIndex\\((${ID})=>\\3\\.item===${esc(pickedVar)}\\),(${ID})=\\2\\[\\(\\1\\+1\\)%\\2\\.length\\]\\.item;${esc(pickedVar)}=\\1>=0&&\\4===${esc(pickedVar)}\\?null:\\4,${esc(pickedVar)}&&\\(${esc(goldVar)}=null\\),${esc(anchorSideVar)}=\`worn\`,${esc(sideVar)}=\`local\`,${esc(noticeVar)}=null,${esc(renderFn)}\\(\\)`).exec(out);
    if (wornRowM) {
      out = put(out, wornRowM[0], wornRowM[0].slice(0, -`${renderFn}()`.length) + `(${wornRowM[2]}.length===1?__dfoPatchSelection$():${renderFn}())`);
    }

    // 3c. Worn accessory socket click
    const wornSockM = rx(`\\(${esc(pickedVar)}=${esc(pickedVar)}===(${ID})\\?null:\\1,${esc(pickedVar)}&&\\(${esc(goldVar)}=null\\),${esc(anchorSideVar)}=\`worn\`,${esc(sideVar)}=\`local\`,${esc(noticeVar)}=null,${esc(renderFn)}\\(\\)\\)`).exec(out);
    if (wornSockM) {
      out = put(out, wornSockM[0], wornSockM[0].slice(0, -`${renderFn}())`.length) + `__dfoPatchSelection$())`);
    }

    // 3d. Setstrip / Set Relic click
    const setPickM = rx(`onPick:(${ID})=>\\{${esc(pickedVar)}=\\1,${esc(goldVar)}=null,${esc(anchorSideVar)}=\`worn\`,${esc(sideVar)}=\`local\`,${esc(noticeVar)}=null,${esc(renderFn)}\\(\\)\\}`).exec(out);
    if (setPickM) {
      out = put(out, setPickM[0], setPickM[0].replace(`${renderFn}()`, '__dfoPatchSelection$()'));
    }

    // 3e. Detail close button
    const closeDetailM = rx(`let (${ID})=${esc(elFn)}\\(\`button\`,\`sheet-close\`,\`Close\`\\);if\\(\\1\\.onclick=\\(\\)=>\\{${esc(pickedVar)}=null,${esc(renderFn)}\\(\\)\\}`).exec(out);
    if (closeDetailM) {
      out = put(out, closeDetailM[0], closeDetailM[0].replace(`${renderFn}()`, '__dfoPatchSelection$()'));
    }

    // 3f. Outside click on pack-win / loot-win (in-place when gold field isn't open)
    const oldOutClick = `(${pickedVar}=null,${goldVar}=null,${renderFn}())`;
    if (outsideClickM[0].includes(oldOutClick)) {
      out = put(out, outsideClickM[0], outsideClickM[0].replace(oldOutClick, `(${goldVar}!=null?(${pickedVar}=null,${goldVar}=null,${renderFn}()):(${pickedVar}=null,__dfoPatchSelection$()))`));
    }

    // 3g. Escape key closing detail card
    const escDetailM = rx(`&&${esc(pickedVar)}\\)\\{(${ID})\\.preventDefault\\(\\),\\1\\.stopPropagation\\(\\),\\1\\.repeat\\|\\|\\(${esc(pickedVar)}=null,${esc(renderFn)}\\(\\)\\);return\\}`).exec(out);
    if (escDetailM) {
      out = put(out, escDetailM[0], escDetailM[0].replace(`${renderFn}()`, '__dfoPatchSelection$()'));
    }

    // 3h. Gem "Set in..." toggle inside detail card .acts
    const gemToggleM = rx(`\\.dataset\\.dfoSetGem=\`1\`;if\\((${ID})\\.onclick=\\(\\)=>\\{if\\([^}]+\\{[^}]+return\\}(${ID})=(${ID})\\?null:(${ID}),${esc(renderFn)}\\(\\)\\}`).exec(out);
    if (gemToggleM) {
      out = put(out, gemToggleM[0], gemToggleM[0].slice(0, -`${renderFn}()}`.length) + `__dfoPatchSelection$()}`);
    }

    // 3i. Empty socket well click inside detail card
    const sockWellM = rx(`if\\((${ID})===\`empty\`\\)\\{(${ID})=\\2\\?\\.item===(${ID})&&\\2\\.at===(${ID})\\?null:\\{item:\\3,at:\\4\\},(${ID})=null,${esc(renderFn)}\\(\\);return\\}`).exec(out);
    if (sockWellM) {
      out = put(out, sockWellM[0], sockWellM[0].replace(`${renderFn}()`, '__dfoPatchSelection$()'));
    }

    // 3j. Wallet / Binder link inside detail card
    const wbRx = rx(`return (${ID})\\.onclick=\\(\\)=>\\{${esc(pickedVar)}=(${ID}),${esc(sideVar)}=\`local\`,${esc(noticeVar)}=null,${esc(renderFn)}\\(\\)\\}`, 'g');
    out = out.replace(wbRx, (m) => m.replace(`${renderFn}()`, '__dfoPatchSelection$()'));

    // 3k. Category tab switch fast-path
    const tabClickM = rx(`(${ID})\\.append\\(${esc(elFn)}\\(\`span\`,\`count\`,String\\((${ID})\\)\\)\\),\\1\\.onclick=\\(\\)=>\\{${esc(tabVar)}=(${ID}),${esc(pickedVar)}=null,${esc(renderFn)}\\(\\)\\}`).exec(out);
    if (tabClickM) {
      const [, tabBtn, countVar, tabIdVar] = tabClickM;
      out = put(out, tabClickM[0], `${tabBtn}.dataset.dfoTab=${tabIdVar},${tabBtn}.append(${elFn}(\`span\`,\`count\`,String(${countVar}))),${tabBtn}.onclick=()=>__dfoPatchTab$(${tabIdVar})`);
    }

    // 3l. Hover tooltip single-pass measure + position + clamp (avoids (0,0) clamp & positionObserver second fit)
    const hoverTipM = rx(`(${ID})=${esc(elFn)}\\(\`div\`,\`inv-tip\`\\),(${ID})=(${ID}),\\1\\.setAttribute\\(\`role\`,\`tooltip\`\\),\\1\\.append\\((${ID})\\),document\\.body\\.append\\(\\1\\),(${ID})\\(\\1\\),(${ID})\\(\\1,(${ID})\\)`).exec(out);
    if (hoverTipM) {
      const [whole, tipVar, plVar, itemVar, cardVar, fitTipFn, posTipFn, anchorVar] = hoverTipM;
      out = put(out, whole,
        `${tipVar}=${elFn}(\`div\`,\`inv-tip\`),${plVar}=${itemVar},${tipVar}.setAttribute(\`role\`,\`tooltip\`),${tipVar}.append(${cardVar}),globalThis.__dfoItemCards?.fitAnchored&&${tipVar}.classList.add(\`dfo-item-host\`),document.body.append(${tipVar}),globalThis.__dfoItemCards?.fitAnchored?.(${cardVar},()=>${posTipFn}(${tipVar},${anchorVar}))||(${fitTipFn}(${tipVar}),${posTipFn}(${tipVar},${anchorVar}))`
      );
    }

    interactionHelpers += `
function __dfoPatchSelection$(){
  if(!${ownerVar}||${salvageVar}||${goldVar}!=null||${noticeVar})return ${renderFn}();
  const o=${ownerVar}.querySelector?.(':scope > .pack-shell');
  if(!o||!o.isConnected)return ${renderFn}();
  const l=${showPackVar}?o.querySelector(':scope > .pack-win'):(o.querySelector(':scope > .loot-win')??o.querySelector(':scope > .pack-win'));
  if(!l||l.querySelector('.goldfield, .sheet-notice'))return ${renderFn}();
  let anchor=null;
  if(${pickedVar}){
    if(${anchorSideVar}==='worn'){
      for(const el of o.querySelectorAll('.wornrow:not(.wornempty), .wornsock:not(.wornempty)')){
        if(el.dataset?.fam==='cart')continue;
        if(el._hotbarItem===${pickedVar}){anchor=el;break;}
      }
    }else{
      const scope=${anchorSideVar}==='loot'?o.querySelector('.loot-win'):o.querySelector('.pack-dock');
      if(scope){
        for(const el of scope.querySelectorAll('.itemrow')){
          if(el._padItem===${pickedVar}&&el._padFrom===${sideVar}){anchor=el;break;}
        }
      }
    }
  }
  const r=${pickedVar}?l.getBoundingClientRect():null;
  const i=${pickedVar}?(anchor?anchor.getBoundingClientRect():{left:r.right,right:r.right,top:(r.top+r.bottom)/2,height:0}):null;
  ${closeTipsFn}();
  for(const old of o.querySelectorAll('.itemrow.on, .wornrow.on, .wornsock.on')){
    if(old.dataset?.fam==='cart')continue;
    old.classList.remove('on');
  }
  if(anchor)anchor.classList.add('on');
  for(const oldTip of o.querySelectorAll('.packtip.packdetail'))oldTip.remove();
  if(${pickedVar}){
    const e=${detailFn}();
    const hasMod=typeof globalThis.__dfoItemCards?.fitCard==='function';
    e.classList.add('packtip');
    if(hasMod)e.classList.add('dfo-item-host');
    l.append(e);
    if(e.isConnected){
      const a=e.querySelector('.card');
      const s=hasMod?0:(a?Math.max(0,e.offsetHeight-a.offsetHeight):0);
      const c=window.getComputedStyle(e).position==='fixed';
      const u=Math.max(r.top,0)+10,d=Math.min(r.bottom,window.innerHeight)-10;
      const placeAt=(f,p)=>{
        let m=i.right+12;
        if(m+f>r.right-10)m=i.left-f-12;
        if(m<r.left+10)m=r.left+10;
        const h=Math.max(u,Math.min(i.top+i.height/2-p/2,d-p));
        const g=e.offsetParent??l,_=g===l?r:g.getBoundingClientRect();
        e.style.left=\`\${Math.round(m-_.left-(g.clientLeft??0))}px\`;
        e.style.top=\`\${Math.round(h-_.top-(g.clientTop??0))}px\`;
      };
      if(hasMod&&!c&&typeof globalThis.__dfoItemCards.fitAnchored==='function'&&globalThis.__dfoItemCards.fitAnchored(a,placeAt)){
        // Single-pass measure + position + clamp completed inside fitAnchored.
      }else{
        ${fitCardFn}(a,(c?Math.round(window.innerHeight*${fitScaleConst}):d-u)-s);
        if(!c){
          placeAt(e.offsetWidth,e.offsetHeight);
          if(hasMod)globalThis.__dfoItemCards.fitTip?.(e);
        }
      }
    }
  }
}
function __dfoPatchTab$(nextTab){
  if(${tabVar}===nextTab&&!${pickedVar})return;
  if(!${ownerVar}||${salvageVar}||${goldVar}!=null||${noticeVar}||globalThis.__dfoPack?.isFindOpen?.()===!0){${tabVar}=nextTab;${pickedVar}=null;return ${renderFn}();}
  const o=${ownerVar}.querySelector?.(':scope > .pack-shell');
  const lists=o?.querySelector('.pack-dock .packlists');
  const tabs=o?.querySelector('.pack-dock .packcats .packtabs');
  if(!o||!lists||!tabs||o.querySelector('.goldfield, .sheet-notice')){${tabVar}=nextTab;${pickedVar}=null;return ${renderFn}();}
  ${closeTipsFn}();
  for(const oldTip of o.querySelectorAll('.packtip.packdetail'))oldTip.remove();
  for(const oldOn of o.querySelectorAll('.wornrow.on, .wornsock.on')){if(oldOn.dataset?.fam!=='cart')oldOn.classList.remove('on');}
  if(${scrollPrevVar})${scrollMapVar}.set(${scrollPrevVar},lists.scrollTop);
  ${tabVar}=nextTab;${pickedVar}=null;${scrollPrevVar}=${tabVar};
  for(const tb of tabs.children)tb.classList.toggle('on',tb.dataset?.dfoTab===nextTab);
  const oldCol=lists.firstElementChild;
  if(oldCol)${disposeFn}(oldCol);
  lists.innerHTML='';
  const nextCol=${listColFn}();
  if(!o.classList.contains('paired')&&globalThis.__dfoPack?.settings?.()?.view==='rows'&&globalThis.matchMedia?.('(min-width: 1000px)')?.matches!==!1){
    nextCol.style.setProperty('display','grid','important');
    nextCol.style.setProperty('grid-template-columns','repeat(2,minmax(0,1fr))','important');
  }
  lists.append(nextCol);
  ${syncFn}({draw:!1});
  lists.scrollTop=${scrollMapVar}.has(${tabVar})?${scrollMapVar}.get(${tabVar}):0;
  ${syncFn}();
}
`;
  }
  return out + interactionHelpers;
}

// The view is an ESM singleton; an old A handle may close after a B mount.
// Preserve the native close law but bind dropped/repaint/unmount to their owner.
// A lazy-chunk retry can mount the *same* host again. Native JAN2 only
// disposes when the host changes, so retrying leaks the previous view's
// virtual-list listeners, figure subscription, key handler and hotbar scope.
// Retire that live view first, but do not remove the host being reused.
function cleanSameHostRemount(out) {
  // esbuild folds leading calls into the condition: if(Pr(),Fr(),host&&host!==incoming).
  // Its block-local "let e=host" may shadow the incoming parameter also named "e".
  // Never compare against that shadow, and preserve the leading side effects.
  const pattern = /if\(((?:[\w$]+\(\),)*)([\w$]+)&&\2!==([\w$]+)\)\{(?:let|const|var) ([\w$]+)=\2;([\w$]+)\?\.unmount\(\)[;,]\4\.remove\?\.\(\)\}/g;
  const hits = [...out.matchAll(pattern)];
  if (hits.length !== 1) {
    const clues = [...out.matchAll(/\.unmount\(\)/g)]
      .map(m => out.slice(Math.max(0, m.index - 105), m.index + 115))
      .filter(span => span.includes('.remove')).slice(0, 2);
    throw new Error('inventory same-host cleanup: ' + hits.length + ' places; native context: ' + clues.join(' | ').slice(0, 450));
  }
  if (out.includes('__dfoPreviousHost$')) throw new Error('inventory remount helper name collision');
  const [whole, prefix, currentHost, incomingHost, previousHost, view] = hits[0];
  const replacement = 'if(' + prefix + currentHost + '){const __dfoPreviousHost$=' + currentHost +
    ';' + view + '?.unmount();if(__dfoPreviousHost$!==' + incomingHost + ')__dfoPreviousHost$.remove?.()}';
  return put(out, whole, replacement);
}

function sessionHandle(out) {
  const view = once(out, /([\w$]+)=\{repaint\(\)\{[^{}]*\},dropped:\(\)=>([\w$]+),unmount\(\)\{/, 'inventory per-session view handle');
  const [whole, current, dropped] = view;
  const patched = whole
    .replace('repaint(){', 'repaint(){if(' + current + '!==this)return;')
    .replace('dropped:()=>' + dropped, 'dropped:__dfoDroppedForSession$(' + dropped + ')')
    .replace('unmount(){', 'unmount(){if(' + current + '!==this)return;');
  return put(out, whole, patched) + '\n;function __dfoDroppedForSession$(items){return ()=>items}\n';
}

// inventoryDoor: pending chest save leaves 'fired' false while a replacement
// overlay B can take ownership. Retire A at dispose() ENTRY, before the save
// promise settles. The late lazy-loader must never mount A over B.
function doorOwnership(out) {
  // The bundle contains multiple overlay factories with identical alive shapes.
  // Only the overlay that created the uniquely named enhanced inventory host
  // may be modified. Fail closed if its layout is no longer recognizable.
  const markers = [...out.matchAll(/enhanced-inventory/g)];
  if (markers.length !== 1) throw new Error('inventory host marker: ' + markers.length + ' places');
  const mark = markers[0].index;
  const candidates = [...out.matchAll(/alive:\(\)=>!([\w$]+),(?:host:([\w$]+)|([\w$]+)),onDismiss:/g)]
    .filter(m => m.index > mark);
  if (!candidates.length || candidates[0].index - mark > 7000)
    throw new Error('inventory overlay alive owner not adjacent to host');
  const alive = candidates[0], fired = alive[1], host = alive[2] || alive[3];
  const owner = new RegExp('get done\\(\\)\\{return ' + esc(fired) + '\\}[\\s\\S]{0,700}?dispose\\(\\)\\{([\\w$]+)\\(\\)\\}', 'g');
  const handles = [...out.slice(mark, alive.index).matchAll(owner)];
  if (handles.length !== 1) throw new Error('inventory overlay dispose ownership: ' + handles.length + ' places');
  const original = handles[0][0], close = handles[0][1];

  // Each host claims the most recent opening before asynchronous chunk loading.
  const ids = [...out.matchAll(new RegExp('(' + esc(host) + '\\.id=(.)enhanced-inventory\\2)', 'g'))]
    .filter(m => m[2] === '"' || m[2] === "'" || m[2] === '\u0060');
  if (ids.length !== 1) throw new Error('inventory host generation assignment: ' + ids.length + ' places');
  // A failed lazy chunk must invoke the same close path as the native button:
  // unregister, save/close the loot session, then dispose its DOM.
  const dismiss = [...out.matchAll(new RegExp(
    'onDismiss:\\(\\)=>\\{' + esc(host) + '\\.remove\\(\\)[;,]' + esc(fired) + '=(?:!0|true)\\}', 'g'))]
    .filter(m => m.index >= alive.index && m.index < alive.index + 500);
  if (dismiss.length !== 1) throw new Error('inventory lazy dismiss cleanup: ' + dismiss.length + ' places');

  let t = put(out, ids[0][0], ids[0][0] + ',' + host +
    '.__dfoGeneration$=(globalThis.__dfoInventoryDoorGeneration$=(globalThis.__dfoInventoryDoorGeneration$||0)+1)');
  // Generation checks cancel stale imports but do not close the stale
  // full-screen host or unregister its overlay. Hand A to native close()
  // as soon as B claims ownership; let a pending chest save finish safely.
  const activation = 'alive:(()=>{' +
    'const previous=globalThis.__dfoInventoryDoorActive$;' +
    'if(previous&&previous.host!==' + host + '){try{previous.retire()}catch(e){console.warn("[dfo-mod inventory] old overlay cleanup failed",e)}}' +
    'globalThis.__dfoInventoryDoorActive$={host:' + host + ',retire:()=>{' +
    'const wasRetired=!!' + host + '.__dfoRetired$;' + host + '.__dfoRetired$=true;' +
    'if(' + host + '.style){' + host + '.style.visibility="hidden";' + host + '.style.pointerEvents="none"}' +
    'if(!wasRetired)' + close + '()}};' +
    'return ()=>!' + fired + '&&' + host + '.isConnected&&!' + host +
    '.__dfoRetired$&&' + host + '.__dfoGeneration$===globalThis.__dfoInventoryDoorGeneration$})()';
  t = put(t, alive[0], alive[0].replace('alive:()=>!' + fired, () => activation));
  t = put(t, original, original.replace('dispose(){' + close + '()}',
    'dispose(){' + host + '.__dfoRetired$=true;' + close + '()}'));
  t = put(t, dismiss[0][0], 'onDismiss:()=>' + close + '()');
  return t;
}

// equip-*.js: ItemCollection.AddItem (systems/inventory.js addItem). A quest item lands at the FRONT exactly when the
// player receives it - GivePc/GetItem's giveItemToPlayer and a take off a body or a chest (itemTransfer.js) - and the page
// script locks a quest letter there, once, by the native lock's own field.
function receipt(text) {
  const add = once(text, rx(`function (${ID})\\((${ID}),(${ID}),(${ID})=\`back\`\\)\\{(let (${ID})=(${ID})\\(\\2,\\3\\);return \\6\\?(${ID})\\(\\6,\\3\\):\\2\\.includes\\(\\3\\)\\?\\(console\\.warn\\(\`\\[inventory\\] AddItem\\(\\) encountered a duplicate item)`), 'addItem');
  const [whole, name, list, item, at, body] = add;
  return put(text, whole, `function ${name}(${list},${item},${at}=\`back\`){try{globalThis.__dfoPack?.received?.(${list},${item},${at})}catch{}${body}`);
}

// world-*.js: expose silver marks store & current location/building/reputation/region/villainy API to page/dfo_pack.js.
function worldContext(text) {
  const opt = (s, re) => { const all = s.match(rx(re.source, 'g')) || []; return all.length === 1 ? re.exec(s) : null; };
  const marks = once(text, rx(`marks:\\(\\)=>(${ID})\\?\\.state\\?\\.balance\\?\\?null,marksOpen:\\(\\)=>\\1\\?\\.state\\?\\.open!==!1`), 'world marks store');
  const factions = once(text, rx(`(${ID})\\.factionDict,(${ID})\\.modes\\?\\.interiorBuilding\\?\\.factionId`), 'world factionDict');
  const questWorld = once(text, rx(`return\\{questWorld:(${ID})\\}`), 'world questWorld');
  const regions = once(text, rx(`import\\{a as (${ID})(?:,[^}]*)?\\}from"\\./mapsTables-[^"]+\\.js"`), 'world mapsTables regions');
  const villain = opt(text, rx(`(${ID})=${ID}\\(${ID}\\(${ID}\\(\\(\\)=>${ID}[^\\n;]+?\\.flag(?=,)`));
  const statusShow = opt(text, rx(`showStatus:\\(\\)\\=>\\{${ID}\\(\\{mount:[^}]+?,lines:(${ID})=>([^,]+),macroContext:([^,]+?),entity:(${ID}),survival:([^}]+?\\?\\{[^}]+?\\}:null)\\}\\)\\}`));
  const clocks = opt(text, rx(`classicSeconds:\\(\\)\\=>(${ID})\\.ownMinutes\\*60,skySeconds:\\(\\)\\=>(${ID})\\(\\)\\*60,worldSeconds:\\(\\)\\=>\\1\\.classicMinutes\\*60,[^}]*?sharedClock:\\(\\)\\=>(${ID})\\(\\)`));
  // Bind marks & refreshMarks eagerly as pSn builds the object (not lazily inside marks() which only crafting calls).
  let out = put(text, marks[0], `marks:((__m)=>{try{globalThis.__dfoPackWorld=Object.assign(globalThis.__dfoPackWorld||{},{marks:()=>__m?.state?.balance??null,marksOpen:()=>__m?.state?.open!==!1,refreshMarks:()=>__m?.refresh?.()})}catch{}return()=>__m?.state?.balance??null})(${marks[1]}),marksOpen:()=>${marks[1]}?.state?.open!==!1`);
  out = put(out, questWorld[0], `return(globalThis.__dfoPackWorld=Object.assign(globalThis.__dfoPackWorld||{},{questWorld:${questWorld[1]},factions:()=>${factions[1]}?.factionDict??null,regionName:(i)=>{try{return ${regions[1]}?.[i]??''}catch{return''}}}),{questWorld:${questWorld[1]}})`);
  if (villain) out = put(out, villain[0], `${villain[1]}=((v)=>((globalThis.__dfoPackWorld=Object.assign(globalThis.__dfoPackWorld||{},{villainy:()=>v?.villainy?.()??null})),v))(${villain[0].slice(villain[1].length + 1)})`);
  if (statusShow) out = put(out, statusShow[0], `showStatus:(globalThis.__dfoPackWorld=Object.assign(globalThis.__dfoPackWorld||{},{statusContext:()=>{try{return{lines:${statusShow[1]}=>${statusShow[2]},macroContext:${statusShow[3]},entity:${statusShow[4]},survival:${statusShow[5]}}}catch{return null}}}),${statusShow[0].slice('showStatus:'.length)})`);
  if (clocks) {
    const head = `classicSeconds:()=>${clocks[1]}.ownMinutes*60`;
    out = put(out, clocks[0], `classicSeconds:((globalThis.__dfoPackWorld=Object.assign(globalThis.__dfoPackWorld||{},{clocks:()=>{try{return{own:Math.floor(${clocks[1]}.ownMinutes??0),sky:Math.floor(${clocks[2]}()),world:Math.floor(${clocks[1]}.classicMinutes??0),online:!!${clocks[3]}()}}catch{return null}}})),()=>${clocks[1]}.ownMinutes*60)${clocks[0].slice(head.length)}`);
  }
  return out;
}

// worldTick-*.js: expose afflictions (PGe), survival needs (EGe), survival text (DGe), and legal rep classifier (ANe).
function worldStatus(text) {
  const aff = once(text, rx(`var ${ID}=\`Unwell\`,${ID}=\\(\\)=>\\w+\\(\`hud\\.status\\.unwell\`,${ID}\\);function (${ID})\\((${ID})\\)\\{let ${ID}=\\[\\],${ID}=!1,${ID}=!1;for\\(let ${ID} of \\2\\?\\.activeEffects`), 'worldTick afflictions');
  const needs = once(text, rx(`function (${ID})\\(${ID},${ID},\\{vampire:${ID}=!1,endurance:${ID}=50,rules:${ID}=null,live:${ID}=null\\}=\\{\\}\\)\\{if\\(!${ID}\\?\\.survival\\)return\\[\\]`), 'worldTick survival needs');
  const needsLines = once(text, rx(`function (${ID})\\(${ID},${ID},\\{vampire:${ID}=!1,endurance:${ID}=50,rules:${ID}=null\\}=\\{\\}\\)\\{let ${ID}=${ID}\\(${ID},${ID}\\),`), 'worldTick survival lines');
  const rank = rx(`function (${ID})\\(${ID}\\)\\{return ${ID}>80\\?${ID}\\(\`revered\``).exec(text);
  return text + `\n;try{globalThis.__dfoWorldStatus={afflictions:${aff[1]},needs:${needs[1]},needsLines:${needsLines[1]}${rank ? `,legalRank:${rank[1]}` : ''}}}catch{}\n`;
}

// deepWaterRuntime-*.js: expose bz (exact 'i' Status modal line builder: ET + TT + wp).
function statusText(text) {
  const bz = once(text, rx(`function (${ID})\\(\\{lines:${ID},macroContext:${ID}=null,entity:${ID},survival:${ID}=null\\}\\)\\{let ${ID}=\\[\\.\\.\\.${ID}\\(${ID},${ID}\\),\`\`,\\.\\.\\.${ID}\\(${ID},${ID}\\)\\];return ${ID}&&${ID}\\.push\\(\`\`,\\.\\.\\.${ID}\\(${ID},${ID}\\.minutes,\\{rules:${ID}\\(\\),\\.\\.\\.${ID}\\}\\)\\),${ID}\\}`), 'status modal builder');
  return text + `\n;try{globalThis.__dfoBuildStatusLines=${bz[1]}}catch{}\n`;
}

// accountClient-*.js: track Aurum balance on every /v1/account fetch & allow passive signed-in read.
function aurumClient(text) {
  const acct = once(text, rx(`(${ID})=(${ID})=>((${ID})\\(\\2,\`/v1/account\`\\))`), 'accountClient /v1/account');
  const readAcc = once(text, rx(`function (${ID})\\((${ID})\\)\\{try\\{let (${ID})=\\2\\?\\.getItem\\?\\.\\(${ID}\\);if\\(!\\3\\)return null;let (${ID})=JSON\\.parse\\(\\3\\);return typeof \\4\\?\\.secret==\`string\`&&\\4\\.secret\\?\\4:null\\}catch\\{return null\\}\\}`), 'accountClient session reader');
  const readBase = once(text, rx(`function (${ID})\\((${ID})\\)\\{if\\(${ID}\\(\\)\\)return ${ID};try\\{let (${ID})=\\2\\?\\.getItem\\?\\.\\(${ID}\\);return typeof \\3==\`string\`&&/\\^https:[^}]+?\\$/\\.test\\(\\3\\)\\?\\3:${ID}\\}catch\\{return ${ID}\\}\\}`), 'accountClient base url reader');
  const norm = `(v)=>{if(!v||typeof v!==\`object\`)return null;const b=v.balance,bal=Number.isFinite(Number(b))?Number(b):(typeof v.open===\`boolean\`?0:null);return bal===null?null:{balance:bal,open:v.open!==!1,at:Date.now()}}`;
  const wrapped = `${acct[1]}=((f)=>async(e)=>{const r=await f(e);try{const n=(${norm})(r?.ok&&r.data?.aurum);if(n)globalThis.__dfoAurum=n}catch{}return r})(${acct[2]}=>${acct[3]})`;
  let out = put(text, acct[0], wrapped);
  // Desktop (daggerShell.storage) keeps session/service outside window.localStorage; probe both.
  out += `\n;try{globalThis.__dfoAurumReader={read:async()=>{try{let s=null,a=null;for(const x of[globalThis.daggerShell?.storage,globalThis.localStorage]){if(!x)continue;const t=${readAcc[1]}(x);if(t?.secret){s=x;a=t;break}}if(!a?.secret)return null;const base=${readBase[1]}(s);if(!base||/\\.invalid\\b/i.test(base))return null;const r=await ${acct[1]}({fetch:(u,o)=>globalThis.fetch(u,o),base,secret:a.secret});const n=(${norm})(r?.ok&&r.data?.aurum);if(n)globalThis.__dfoAurum=n;return n}catch{return null}},cached:()=>globalThis.__dfoAurum??null}}catch{}\n`;
  return out;
}

// enhancedShop-*.js: sync globalThis.__dfoAurum whenever the shop receives an aurum payload.
function shopAurumSync(text) {
  const re = rx(`(${ID})\\.aurum=(${ID})\\(([^()]+\\.aurum)\\)`, 'g');
  const matches = [...text.matchAll(re)];
  if (!matches.length) throw new Error('enhancedShop aurum assignments not found');
  const out = text.replace(re, (_, obj, fn, expr) => `${obj}.aurum=__dfoSyncAurum$(${fn}(${expr}))`);
  return out + '\n;function __dfoSyncAurum$(v){try{if(v&&Number.isFinite(v.balance))globalThis.__dfoAurum={balance:Number(v.balance),open:v.open!==!1,at:Date.now()}}catch{}return v}\n';
}

const JOBS = [
  ['inventory.pages', (rel, text) => /\/storeFilter-[^/]+\.js$/.test(rel) && text.includes('[`weapons`,`Weapons`]'), pages],
  ['inventory.view', (rel, text) => text.includes('`packPhoneDoll`') && text.includes('`packempty`'), inventory],
  ['inventory.nativeLock', (rel, text) => !/Worker-/.test(rel) && text.includes('EnableInventoryInfoPanel') && text.includes('inventory.destroy.done') && text.includes('.Dropped'), nativeLock],
  ['inventory.door', (rel, text) => text.includes('enhanced-inventory') && text.includes('onDismiss') && text.includes('alive:'), doorOwnership],
  ['inventory.receipt', (rel, text) => !/Worker-/.test(rel) && text.includes('AddItem() encountered a duplicate item'), receipt],
  ['inventory.world', (rel, text) => text.includes('legalRepNow:()=>') && text.includes('marks:()=>'), worldContext],
  ['inventory.status', (rel, text) => !/Worker-/.test(rel) && text.includes('`hud.status.unwell`') && text.includes('activeEffects'), worldStatus],
  ['inventory.statusText', (rel, text) => !/Worker-/.test(rel) && /\{lines:[\w$]+,macroContext:[\w$]+=null,entity:[\w$]+,survival:[\w$]+=null\}/.test(text), statusText],
  ['inventory.aurum', (rel, text) => text.includes('`/v1/account`') && text.includes('dfo.privateSubject'), aurumClient],
  ['inventory.shop', (rel, text) => text.includes('patreonWaiting') && text.includes('shopWaitingFrom'), shopAurumSync],
  ['inventory.icons', (rel, text) => !/Worker-/.test(rel) && text.includes('mountPictureStamp()') && text.includes('.itemIcon!='), worldItemIcons],
];

function transformInventory(rel, text, log) {
  let out = text;
  for (const [id, on, run] of JOBS) {
    if (!on(rel, out) || out.includes(`/*${id}*/`)) continue;
    try { out = run(out) + `\n/*${id}*/\n`; log.push([id, 1]); if (id === 'inventory.view') log.push(['inventory.lifecycle', 1]); } catch (e) { log.push([`${id}!error ${e.message}`, 0]); if (id === 'inventory.view' || id === 'inventory.door') throw new Error(`inventory lifecycle compatibility failure: ${e.message}`); }
  }
  return out;
}

module.exports = { transformInventory, pages, inventory, packLockGuards, gemSocketing, nativeLock, lifecycle, guardFigureAsync, cleanSameHostRemount, sessionHandle, doorOwnership, receipt, worldItemIcons, disableModelIcons };
