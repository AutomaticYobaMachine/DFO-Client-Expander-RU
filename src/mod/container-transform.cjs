'use strict';
// CONTAINER WINDOWS (.loot-win: loot chests, storage, wagon, materials bag, ground, reward, fate).
// Strictly scoped to container UI & container filter paths — NEVER modifies player inventory (.pack-win) layout or mechanics.
// Every hook delegates cleanly to globalThis.__dfoContainer (page/dfo_container.js) and fails closed to native behavior
// whenever the page script is absent or throws.
const ID = '[\\w$]+';
const rx = (s, f) => new RegExp(s, f);
const esc = (s) => s.replace(/[$]/g, '\\$');
const put = (s, from, to) => s.replace(from, () => to);
const need = (s, re, what) => { const m = re.exec(s); if (!m) throw new Error(`unsupported ${what} signature`); return m; };
const once = (s, re, what) => {
  const all = s.match(rx(re.source, 'g')) || [];
  if (all.length !== 1) throw new Error(`${what}: ${all.length} places`);
  return need(s, re, what);
};

// storeFilter-*.js: align store categories with player inventory pages (removing the duplicate vanilla "Materials" row)
// and delegate filterStoreItems so native "Take all" respects full card-content search (excluding lower description).
function storeFilter(text) {
  const cats = once(
    text,
    rx(`(${ID})=(Object\\.freeze\\(\\[\\[\`all\`,\`All\`\\],\\[\`materials\`,\`Materials\`\\],\\.\\.\\.(${ID})\\]\\))`),
    'container store categories'
  );
  const pageMatch = once(
    text,
    rx(`(${ID})=\\((${ID}),(${ID})\\)=>!${ID}\\.has\\(\\3\\)\\|\\|\\3===\`all\`\\?!0:\\3===\`materials\`\\?${ID}\\(\\2\\):(${ID})\\(\\2\\)===\\3`),
    'container store page predicate'
  );
  const rarMatch = once(
    text,
    rx(`(${ID})=\\((${ID}),(${ID})\\)=>!${ID}\\.has\\(\\3\\)\\|\\|(${ID})\\(\\2\\)===\\3(?=[,;]\\s*${ID}=${ID}=>String\\()`),
    'container store rarity predicate'
  );
  const matMatch = once(
    text,
    rx(`(${ID})=\\((${ID}),(${ID})\\)=>!${ID}\\.has\\(\\3\\)\\|\\|(${ID})\\(\\2\\)===\\3(?=[,;]\\s*function)`),
    'container store material predicate'
  );
  const filterFn = once(
    text,
    rx(`function (${ID})\\((${ID}),\\{cat:(${ID})=\`all\`,rarity:(${ID})=\`all\`,material:(${ID})=\`all\`,query:(${ID})=\`\`\\}=\\{\\},(${ID})=${ID}=>${ID}\\?\\.name\\?\\?\`\`\\)\\{`),
    'container filterStoreItems'
  );

  const pageOf = pageMatch[4];
  const rarityOf = rarMatch[4];
  const materialOf = matMatch[4];

  let out = put(text, cats[0], `${cats[1]}=__dfoContainerStoreCats$(${cats[2]},${cats[3]})`);
  const filterGuard = `const __dfoF=__dfoContainerFilter$(${filterFn[2]},{cat:${filterFn[3]},rarity:${filterFn[4]},material:${filterFn[5]},query:${filterFn[6]}},${filterFn[7]},__dfoStoreMeta$);if(__dfoF)return __dfoF;`;
  out = put(out, filterFn[0], `${filterFn[0]}${filterGuard}`);

  return out
    + '\n;const __dfoStoreMeta$={pageOf:' + pageOf + ',rarityOf:' + rarityOf + ',materialOf:' + materialOf + '};'
    + 'function __dfoContainerStoreCats$(n,p){try{if(globalThis.__dfoContainer?.categories)return globalThis.__dfoContainer.categories(n,p);return n}catch{return n}}'
    + 'function __dfoContainerFilter$(items,filter,nameOf,meta){try{const r=globalThis.__dfoContainer?.filterItems?.(items,filter,nameOf,meta);return Array.isArray(r)?r:null}catch{return null}}'
    + ';try{globalThis.__dfoStoreFilterMeta=__dfoStoreMeta$;}catch{}\n';
}

// enhancedInventory-*.js: hook ONLY container UI (.loot-win), container row stack transfers, context menu stack split,
// paired height sync, Escape handling, and unmount cleanup. NEVER touches .pack-win DOM or player inventory mechanics.
function containerView(text) {
  let out = text;

  // 1. Capture cu() (buildRemote) and its exact live symbols.
  const cuHead = once(
    out,
    rx(`function (${ID})\\(\\)\\{if\\((${ID})\\.kind===\`fate\`\\)return (${ID})\\(\\);let (${ID})=(${ID})\\(\`section\`,\`packcol packremote\`\\);\\2\\.pile&&\\4\\.append\\((${ID})\\(\\2\\.pile\\)\\);`),
    'container buildRemote head'
  );
  const [, cuFn, remoteVar, fateFn, , elFn, pileFn] = cuHead;
  const cuSlice = out.slice(cuHead.index, cuHead.index + 2400);

  const wagonM = once(
    cuSlice,
    rx(`if\\((${ID})\\((${ID})\\.items\\?\\.\\(\\)\\?\\?\\[\\]\\)\\)\\{let ${ID}=${esc(elFn)}\\(\`button\`,\`act\\$\\{(${ID})\\.usingWagon\\?\` primary\`:\`\`\\}\`,\\3\\.usingWagon\\?\`Leave wagon\`:\`Wagon\`\\);${ID}\\.onclick=(${ID}),`),
    'container wagon toggle'
  );
  const [, hasWagonFn, depsVar, stateVar, toggleWagonFn] = wagonM;

  const bagM = once(
    cuSlice,
    rx(`if\\((${ID})\\(\\)\\)\\{let ${ID}=${esc(elFn)}\\(\`button\`,\`act\\$\\{${esc(stateVar)}\\.usingBag\\?\` primary\`:\`\`\\}\`,${esc(stateVar)}\\.usingBag\\?\`Close bag\`:\`Materials Bag\`\\);${ID}\\.onclick=(${ID}),`),
    'container bag toggle'
  );
  const [, canBagFn, toggleBagFn] = bagM;

  const takeAllM = once(
    cuSlice,
    rx(`if\\((?:!${esc(depsVar)}\\.loot\\?\\.nearby&&)?(${ID})\\.has\\(${esc(remoteVar)}\\.kind\\)\\)\\{let ${ID}=${esc(elFn)}\\(\`button\`,\`act\`,${ID}\\(\`inventory\\.store\\.takeAll\`,\`Take all\`\\)\\);${ID}\\.onclick=\\(\\)=>(${ID})\\(\`take\`\\),`),
    'container takeAll'
  );
  const [, filterableSet, batchFn] = takeAllM;

  const noticeM = once(
    out,
    rx(`function ${esc(batchFn)}\\(${ID}\\)\\{(${ID})=null;let ${ID}=`),
    'container notice var'
  );
  const [, noticeVar] = noticeM;

  const vaultM = once(
    cuSlice,
    rx(`typeof ${esc(depsVar)}\\.loot\\?\\.vaultPour==\`function\`[\\s\\S]{0,220}?\\((${ID})\\(\\),(${ID})\\(\\)\\)`),
    'container vaultPour refresh/render'
  );
  const [, refreshFn, renderFn] = vaultM;

  const filterStateM = once(
    cuSlice,
    rx(`(${ID})\\.kind!==${esc(remoteVar)}\\.kind\\|\\|!${esc(remoteVar)}\\.items\\.length\\)&&\\(\\1=(${ID})\\(${esc(remoteVar)}\\.kind\\)\\)`),
    'container filter state'
  );
  const [, filterStateVar, makeFilterFn] = filterStateM;

  const pairedM = once(
    cuSlice,
    rx(`&&(${ID})&&${ID}\\.append\\(${esc(elFn)}\\(\`p\`,\`storehint\`,`),
    'container paired flag'
  );
  const [, pairedVar] = pairedM;

  // 2. Capture du() (virtual list mount for .remotelist) and its exact helpers.
  const duM = once(
    out,
    rx(`function (${ID})\\((${ID}),(${ID})=${esc(filterableSet)}\\.has\\(${esc(remoteVar)}\\.kind\\)&&${esc(remoteVar)}\\.items\\.length>0\\)\\{(${ID})\\(\\2\\);[\\s\\S]{0,420}?(${ID})\\((${ID})\\(\\2,(${ID}),${ID}=>(${ID})\\(${ID},\`remote\`\\),\\{onAim:(${ID}),sizes:(${ID})\\(\`remote\`\\)\\}\\)\\)`),
    'container refillRemoteList'
  );
  const [, duFn, , , disposeListFn, registerListFn, virtualListFn, , itemRowFn, onAimFn, sizesFn] = duM;

  // 3. Capture fu() rarityOn check (`Sr`) and packModel (`M`) + pages (`ta`) + close (`H`).
  const rarityOnM = once(
    out,
    rx(`if\\(${ID}\\.value=${esc(filterStateVar)}\\.cat,${ID}\\.onchange=\\(\\)=>\\{${esc(filterStateVar)}\\.cat=${ID}\\.value,${esc(duFn)}\\(${ID},!0\\)\\},${ID}\\.append\\(${ID}\\),(${ID})\\(\\)\\)\\{let ${ID}=${esc(elFn)}\\(\`select\`,\`storerarity\`\\)`),
    'container rarity gate'
  );
  const [, rarityOnFn] = rarityOnM;

  const packModelM = once(
    out,
    rx(`(${ID})=${ID}\\(${esc(depsVar)}\\),${esc(remoteVar)}=${ID}\\(${esc(depsVar)},${ID}\\(\\)\\)`),
    'container packModel var'
  );
  const [, packModelVar] = packModelM;

  const pagesVarM = once(
    out,
    rx(`return\\{tabs:(${ID})\\.map\\(\\(\\[${ID},${ID}\\]\\)=>\\(\\{tab:${ID},label:${ID},items:${ID}\\(${ID},${ID}\\)\\}\\)\\),wallet:`),
    'container pages var'
  );
  const [, pagesVar] = pagesVarM;

  const closeM = once(
    out,
    rx(`(${ID})=${ID}\\.onExit\\?\\?\\(\\(\\)=>\\{\\}\\)`),
    'container close fn'
  );
  const [, closeFn] = closeM;

  // 4. Capture iu() onclick handler (stack-transfer modifiers & reward selection) + V, Qc, el, vi, qc, N, B, ds, P.
  const iuClickM = once(
    out,
    rx(`(${ID})\\.onclick=(${ID})=>\\{(${ID})\\(\\)\\|\\|\\((${ID})\\?(${ID})\\((${ID})\\):(${ID})===\`local\`&&\\2\\?\\.shiftKey&&${esc(remoteVar)}&&${esc(filterableSet)}\\.has\\(${esc(remoteVar)}\\.kind\\)\\?\\((${ID})\\.item===\\6&&\\(\\8=\\{item:null,text:\`\`\\}\\),(${ID})\\(\\6\\)\\):\\7===\`local\`&&\\2\\?\\.shiftKey&&!${esc(stateVar)}\\.chooseOne&&${esc(depsVar)}\\.physicalDropOn\\?\\.\\(\\)\\?${ID}\\(\\6\\):\\7===\`local\`&&${ID}\\(${ID}\\(\\6,\\6,\\2\\)\\)\\|\\|\\(\\7===\`remote\`&&(${ID})\\(\\6,${esc(depsVar)}\\.getQuest\\?\\?null\\),\\7===\`remote\`&&${esc(remoteVar)}\\.kind!==\`reward\`\\?(${ID})\\(\\6\\):\\((${ID})=(?:${ID}|\\(\\12===\\6&&${ID}===\\7\\))\\?null:\\6,\\12&&\\((${ID})=null\\),(${ID})=\\7===\`remote\`\\?\`loot\`:\`dock\`,(${ID})=\\7,${esc(noticeVar)}=null,(?:${esc(renderFn)}|__dfoPatchSelection\\$)\\(\\)\\)\\)\\)\\}`),
    'container itemRow onclick'
  );
  const [iuClickWhole, rowVar, evVar, dragMovedFn, salvVar, salvFn, itemVar, sideVar, splitVar, stowFn, questMarkFn, takeFn, pickedFromClick, goldFieldVar, detailSrcVar, sideStateVar] = iuClickM;

  const maxQtyM = once(
    out,
    rx(`function (${ID})\\((${ID}),(${ID})\\)\\{if\\(\\3===\`store\`&&${ID}\\(\\2\\)\\)return 0;let ${ID}=\\3===\`store\`\\?${ID}\\(\\2,\\{remote:${esc(remoteVar)}\\.items,`),
    'container maxQty'
  );
  const [, maxQtyFn] = maxQtyM;

  // Capture exact float carry weight helpers (itemWeightRaw, pocketGoldFn, goldWeightConst) from Zo() and valueOf from Eo().
  const carryRawM = rx(`let (${ID})=${ID}\\.reduce\\(\\(${ID},${ID}\\)=>${ID}\\+(${ID})\\(${ID}\\),0\\)\\+(${ID})\\(${ID}\\)\\*(${ID}),`).exec(out);
  const valueOfM = rx(`function ${ID}\\((${ID}),${ID},${ID}\\)\\{if\\(!\\1\\)return\\{it:\\1,hole:!0[^}]+\\};let ${ID}=(${ID})\\(\\1\\),${ID}=${ID}\\(\\1\\);return\\{it:\\1,hole:!1,quest:!!\\1\\.questItem`).exec(out);

  // 5. Capture su() Fate helpers (Da, hs, Zl, ru, k, Ur, r, Kl, Y, Jr, Wr, Yr, fd, Ea).
  const suM = once(
    out,
    rx(`function ${esc(fateFn)}\\(\\)\\{(${ID})\\(typeof document>\`u\`\\?null:document\\);let (${ID})=${esc(depsVar)}\\.fate;return ${ID}\\(\\2,(${ID}),\\{el:${esc(elFn)},trophyTile:\\((${ID}),(${ID})\\)=>\\{(${ID})\\(\\4,\\5\\),\\4\\.append\\((${ID})\\((${ID})\\(\\5,${esc(depsVar)}\\.entity\\),\\4,(${ID})\\.loot\\)\\),\\4\\.onmouseenter=\\(\\)=>\\{(${ID})\\(\`plusItemHover\`\\)!==!1&&(${ID})\\(\\5,\`remote\`,\\4\\)\\},\\4\\.onmouseleave=(${ID})\\},portrait:\\((${ID}),(${ID})\\)=>\\{if\\(!\\14\\|\\|!Number\\.isInteger\\(\\14\\.archive\\)\\)return!1;try\\{let ${ID}=(${ID})\\(\\14\\.archive,\\14\\.record,\\{box:40,dpr:(${ID})\\(\\),cap:8,onReady:`),
    'container fate builder su'
  );
  const [, fateStyleFn, , fateChoiceVar, , , decorateNodeFn, makeTileFn, itemLineRawFn, boxSizesVar, prefFn, hoverTipFn, hideTipFn, , , portraitTexFn, dprFn] = suM;

  const imgElM = once(
    out.slice(suM.index, suM.index + 900),
    rx(`return ${ID}\\?\\.src\\?\\(${ID}\\.append\\((${ID})\\(${ID}\\)\\),!0\\):!1`),
    'container fate portrait img'
  );
  const [, imgElFn] = imgElM;

  const fatePickM = once(
    out.slice(suM.index, suM.index + 900),
    rx(`onPick:(${ID}),onChoose:`),
    'container fate onPick'
  );
  const [, fatePickFn] = fatePickM;

  // 6. Capture pure-JS item card readers for zero-DOM search (Ls, _u, Dr, Ht, ma, _r, tt, xr, hr, Ut, Yt, gr, br, Tr, sd).
  const cachedLineM = once(
    out,
    rx(`function (${ID})\\((${ID})\\)\\{if\\(!\\2\\|\\|typeof \\2!=\`object\`\\)return ${esc(itemLineRawFn)}\\(\\2,${esc(depsVar)}\\.entity\\);`),
    'container cached itemLine'
  );
  const [, cachedLineFn] = cachedLineM;

  const effectsM = once(
    out,
    rx(`function (${ID})\\((${ID}),(${ID})=${esc(depsVar)},\\{set:(${ID})=!0,lore:(${ID})=!0,technique:(${ID})=!0\\}=\\{\\}\\)\\{`),
    'container itemEffects _u'
  );
  const [, effectsFn] = effectsM;

  const zlM = once(
    out,
    rx(`function ${esc(decorateNodeFn)}\\((${ID}),(${ID})\\)\\{let ${ID}=(${ID})\\(\\2\\);return ${ID}&&\\(\\1\\.dataset\\.rarity=${ID}\\),${ID}===\`legendary\`&&\\2\\?\\.exalted===!0&&\\(\\1\\.dataset\\.exalted=\`\`\\),${ID}\\(\\2\\?\\.sigil\\)&&\\(\\1\\.dataset\\.sigil=\`\`\\),${ID}\\(\\1,\\2\\),(${ID})\\(\\2\\)&&\\(\\1\\.dataset\\.locked=\`\`\\),(${ID})\\(\\2\\)&&\\(\\1\\.dataset\\.junk=\`\`\\),`),
    'container Zl readers'
  );
  const [, , , rarityOfFn, isLockedFn, isJunkFn] = zlM;

  const sockGoM = rx(`function ${ID}\\((${ID}),(${ID})\\)\\{if\\(\\2===\`empty\`\\)return\`Empty socket\`;let (${ID})=(${ID})\\(\\1,\\2\\);return \\3\\?\`\\$\\{(${ID})\\[\\2\\]\\}: \\$\\{(${ID})\\(\\3\\)\\}\`:\`\`\\}`).exec(out);
  const sockKoM = rx(`if\\(!${esc(rarityOnFn)}\\(\\)\\)return null;let (${ID})=(${ID})\\((${ID})\\);if\\(!\\1\\.length\\)return null;`).exec(out);
  const worthM = rx(`(${ID})\\(\`Worth\`,(${ID})\\((${ID})\\)\\)`).exec(out);
  const boundM = rx(`let (${ID})=(${ID})\\((${ID})\\);\\1&&${ID}\\.append\\(${esc(elFn)}\\(\`p\`,\`boundline\`,\\1\\)\\)`).exec(out);
  const setM = rx(`let (${ID})=(${ID})\\((${ID})\\((${ID})\\)\\);return \\1&&${ID}\\.push\\(${ID}\\?(${ID})\\(\\4\\)\\[0\\]\\?\\?\\1\\.name:\`\\$\\{\\1\\.name\\} set\`\\)`).exec(out);
  const techM = rx(`function ${ID}\\((${ID}),\\{full:${ID}=!1,keyWord:${ID}=\`\`\\}=\\{\\}\\)\\{let (${ID})=(${ID})\\(\\1\\);if\\(!\\2\\|\\|typeof document>\`u\`\\)return null;`).exec(out);
  const weightM = rx(`(${ID})=\\((${ID}),(${ID})\\)=>\\3\\.weight\\+\\(${esc(packModelVar)}\\?\\.wallet&&\\2===${esc(packModelVar)}\\.wallet\\.item\\?${esc(packModelVar)}\\.wallet\\.weight:0\\)`).exec(out);
  const syncM = once(out, rx(`(${ID})=(${ID})=>\\{for\\(let (${ID}) of ${ID}\\)\\3\\.sync\\(\\2\\)\\}`), 'container list sync');
  const [, syncAllFn] = syncM;

  // 7. Capture aside.loot-win creation + mount inside render ($ / __dfoNativeRender$).
  const asideM = once(
    out,
    rx(`let (${ID})=${esc(remoteVar)}\\.kind!==\`ground\`\\|\\|${esc(remoteVar)}\\.count>0\\?${esc(elFn)}\\(\`aside\`,\`loot-win\\$\\{[\\s\\S]{1,180}?\\}\\$\\{${esc(remoteVar)}\\.kind===\`fate\`\\?\` fate\`:\`\`\\}\`\\):null;if\\(\\1\\)\\{`),
    'container aside.loot-win creation'
  );
  const [asideWhole, asideVar] = asideM;

  const pickedM = once(
    out.slice(asideM.index, asideM.index + 500),
    rx(`let ${ID}=${esc(pairedVar)}\\?${ID}:${esc(asideVar)}\\?\\?${ID};if\\((${ID})\\)\\{let (${ID})=${ID}\\(\\);\\2\\.classList\\.add\\(\`packtip\`\\)`),
    'container picked var'
  );
  const [, pickedVar] = pickedM;

  const shellMountM = once(
    out,
    rx(`(${esc(pairedVar)}&&${esc(asideVar)}&&(${ID})\\.classList\\.add\\(\`paired\`\\),${esc(pairedVar)}&&\\2\\.append\\((${ID})\\),${esc(asideVar)}&&\\2\\.append\\(${esc(asideVar)}\\),(${ID})\\.append\\(\\2\\),${ID}\\(\\2,\`\\.pack-win, \\.loot-win\`,\\(\\)=>${esc(closeFn)}\\(\\)\\),${esc(syncAllFn)}\\(\\{draw:!1\\}\\);[\\s\\S]{0,220}?\\}\\),${esc(syncAllFn)}\\(\\))`),
    'container shell mount'
  );
  const [shellMountWhole, , , , hostVar] = shellMountM;

  // 8. Capture pd(e) keydown handler (Escape priority for open dropdowns/quantity modal).
  const pdM = once(
    out,
    rx(`function (${ID})\\((${ID})\\)\\{if\\(\\2\\.metaKey\\|\\|\\2\\.ctrlKey\\|\\|\\2\\.altKey\\)return;let (${ID})=\\2\\.target;if\\(\\3&&\\(\\3\\.tagName===\`INPUT\`\\|\\|\\3\\.tagName===\`TEXTAREA\`\\|\\|\\3\\.isContentEditable\\)\\)return;`),
    'container keydown pd'
  );
  const [pdWhole, , pdEv] = pdM;

  // 9. Capture Xl(e,t,n,r) context menu hook + Bl viewport clamp helper.
  const menuM = once(
    out,
    rx(`function (${ID})\\((${ID}),(${ID}),(${ID}),(${ID})\\)\\{${esc(hideTipFn)}\\(\\),(${ID})\\(\\),\\3===\`remote\`&&${esc(questMarkFn)}\\(\\2,${esc(depsVar)}\\.getQuest\\?\\?null\\);[\\s\\S]{0,650}?document\\.body\\.append\\((${ID})\\),(${ID})\\(\\7,null,\\4,\\5\\);`),
    'container context menu Xl'
  );
  const [menuWhole, , menuItem, menuSide, menuX, menuY, closeMenuFn, menuEl, clampMenuFn] = menuM;

  // 10. Capture unmount() cleanup hook (compatible both before & after inventory-transform.cjs sessionHandle).
  const unmountM = once(
    out,
    rx(`(unmount\\(\\)\\{(?:if\\(${ID}!==this\\)return;)?)((?:${ID}\\(\\),){3,5})`),
    'container unmount'
  );
  const [unmountWhole, unmountHead, unmountCalls] = unmountM;

  // Apply surgical replacements (NONE touch .pack-win layout or inventory mechanics!).
  out = put(
    out,
    cuHead[0],
    `function ${cuFn}(){try{const __c=globalThis.__dfoContainer?.buildRemote?.(__dfoContainerCtx$());if(__c)return __c}catch(__e){console.warn('[dfo-mod container] buildRemote failed',__e)}if(${remoteVar}.kind===\`fate\`)return ${fateFn}();let ${cuHead[4]}=${elFn}(\`section\`,\`packcol packremote\`);${remoteVar}.pile&&${cuHead[4]}.append(${pileFn}(${remoteVar}.pile));`
  );

  const clickInject = `if((${sideVar}!==\`local\`||!${salvVar})&&__dfoContainerClick$(${itemVar},${sideVar},${evVar}))return;`;
  out = put(
    out,
    iuClickWhole,
    iuClickWhole.replace(`${rowVar}.onclick=${evVar}=>{${dragMovedFn}()||(`, `${rowVar}.onclick=${evVar}=>{if(${dragMovedFn}())return;${clickInject}(`)
  );

  out = put(
    out,
    asideWhole,
    `${asideWhole}__dfoContainerPrepareAside$(${asideVar},${remoteVar}.kind,!!${pairedVar});`
  );

  const shellPreSync = shellMountWhole.replace(
    new RegExp(`,${esc(syncAllFn)}\\(\\)$`),
    `,__dfoContainerBeforeSync$(${hostVar}?.querySelector?.(\`.pack-shell>.loot-win\`)),${syncAllFn}()`
  );
  out = put(
    out,
    shellMountWhole,
    `${shellPreSync},__dfoContainerMounted$(${hostVar}?.querySelector?.(\`.pack-shell\`),${hostVar}?.querySelector?.(\`.pack-shell>.loot-win\`),${hostVar}?.querySelector?.(\`.pack-shell>.pack-win\`))`
  );

  out = put(
    out,
    pdWhole,
    `${pdWhole}if(__dfoContainerKeyDown$(${pdEv}))return;`
  );

  out = put(
    out,
    menuWhole,
    `${menuWhole}__dfoContainerMenu$(${menuEl},${menuItem},${menuSide},${closeMenuFn},${menuX},${menuY});`
  );

  out = put(
    out,
    unmountWhole,
    `${unmountHead}__dfoContainerUnmount$();${unmountCalls}`
  );

  // Build narrow live bridge object for dfo_container.js.
  const carryNowExpr = carryRawM
    ? `(()=>{try{const __ent=${depsVar}.entity??{},__its=(${depsVar}.items?.()??[]).filter(Boolean);return __its.reduce((s,it)=>s+(Number(${carryRawM[2]}(it))||0),0)+(Number(${carryRawM[3]}(__ent))||0)*${carryRawM[4]} }catch{return ${packModelVar}?.encumbrance?.now??0}})()`
    : `(${packModelVar}?.encumbrance?.now??0)`;
  const valueOfExpr = valueOfM
    ? `(it)=>{try{const v=${valueOfM[2]}(it);return Number.isFinite(v)?v:(Number(it?.value)||0)}catch{return Number(it?.value)||0}}`
    : `(it)=>Number(it?.value)||0`;

  const bridge = `
;function __dfoContainerCtx$(){
  return {
    live:!0,
    el:${elFn},
    remote:${remoteVar},
    packModel:${packModelVar},
    deps:${depsVar},
    state:${stateVar},
    filter:${filterStateVar},
    resetFilter:(k)=>{${filterStateVar}=${makeFilterFn}(k);return ${filterStateVar}},
    paired:!!${pairedVar},
    pages:${pagesVar},
    pocketGold:Math.max(0,Math.floor(Number(${packModelVar}?.gold)||0)),
    carryNow:${carryNowExpr},
    carryMax:Number(${packModelVar}?.encumbrance?.max)||0,
    rarityOn:()=>!!${rarityOnFn}(),
    hasWagon:()=>!!${hasWagonFn}(${depsVar}.items?.()??[]),
    toggleWagon:()=>${toggleWagonFn}(),
    canBag:()=>!!${canBagFn}(),
    toggleBag:()=>${toggleBagFn}(),
    takeAll:()=>${batchFn}(\`take\`),
    close:()=>${closeFn}(),
    refreshAndRender:()=>{${refreshFn}();${renderFn}()},
    setNotice:(text)=>{${noticeVar}=text||null;${pickedVar}=null;${refreshFn}();${renderFn}()},
    inspectItem:(it,side)=>{${pickedFromClick}=it;${goldFieldVar}=null;${detailSrcVar}=side===\`remote\`?\`loot\`:\`dock\`;${sideStateVar}=side;${noticeVar}=null;typeof __dfoPatchSelection$===\`function\`?__dfoPatchSelection$():${renderFn}()},
    hideHoverTip:()=>{try{${hideTipFn}()}catch{}},
    showHoverTip:(it,side,anchor)=>{try{${prefFn}(\`plusItemHover\`)!==!1&&${hoverTipFn}(it,side,anchor)}catch{}},
    clampMenu:(m,x,y)=>{try{${clampMenuFn}(m,null,x,y)}catch{}},
    buildPileTabs:(p)=>${pileFn}(p),
    buildItemRow:(it,side=\`remote\`)=>${itemRowFn}(it,side),
    mountRemoteList:(listEl,items,preserveScroll,restoreScrollTop)=>{
      ${disposeListFn}(listEl);
      const saved=restoreScrollTop!=null?restoreScrollTop:(preserveScroll?listEl.scrollTop:0);
      listEl.innerHTML=\`\`;
      if(!items.length)return null;
      const v=${registerListFn}(${virtualListFn}(listEl,items,it=>${itemRowFn}(it,\`remote\`),{min:60,first:36,onAim:${onAimFn},sizes:${sizesFn}(\`remote\`)}));
      if(listEl.isConnected!==!1){
        v.sync({draw:!1});
        if(saved)listEl.scrollTop=saved;
        else listEl.scrollTop=0;
        v.sync();
      }
      return v;
    },
    remeasureRemote:()=>{try{${syncAllFn}({remeasure:!0})}catch{}},
    isStowableKind:(k)=>${filterableSet}.has(k),
    markQuestLoot:(it)=>{try{${questMarkFn}(it,${depsVar}.getQuest??null)}catch{}},
    maxQty:(it,mode)=>{try{return ${maxQtyFn}(it,mode)}catch{return 0}},
    takeItem:(it,qty)=>{
      const prev=${splitVar};
      if(qty!=null)${splitVar}={item:it,text:String(qty)};
      else if(${splitVar}.item===it)${splitVar}={item:null,text:\`\`};
      try{return ${takeFn}(it)}
      finally{if(${splitVar}.item===it)${splitVar}={item:null,text:\`\`};else ${splitVar}=prev}
    },
    stowItem:(it,qty)=>{
      const prev=${splitVar};
      if(qty!=null)${splitVar}={item:it,text:String(qty)};
      else if(${splitVar}.item===it)${splitVar}={item:null,text:\`\`};
      try{return ${stowFn}(it)}
      finally{if(${splitVar}.item===it)${splitVar}={item:null,text:\`\`};else ${splitVar}=prev}
    },
    itemLine:(it)=>typeof ${cachedLineFn}===\`function\`?${cachedLineFn}(it):${itemLineRawFn}(it,${depsVar}.entity),
    itemWeight:(it,line)=>${weightM ? `${weightM[1]}(it,line)` : 'line?.weight??0'},
    itemValue:${valueOfExpr},
    itemEffects:(it,opts)=>{try{return ${effectsFn}(it,${depsVar},opts??{set:!0,lore:!1,technique:!0})}catch{return[]}},
    ${techM ? `techInfo:(it)=>{try{const t=${techM[3]}(it);return t?{name:t.name||\`\`,what:t.what||\`\`,value:t.value,band:t.band??null}:null}catch{return null}},` : ''}
    lightSource:()=>{try{return ${depsVar}.entity?.lightSource??null}catch{return null}},
    rarityOf:(it)=>{try{return ${rarityOfFn}(it)||\`common\`}catch{return\`common\`}},
    isLocked:(it)=>{try{return!!${isLockedFn}(it)}catch{return!1}},
    isJunk:(it)=>{try{return!!${isJunkFn}(it)}catch{return!1}},
    socketsOf:(it)=>{try{return ${sockKoM ? `${sockKoM[2]}(it)??[]` : '[]'}}catch{return[]}},
    gemName:(id)=>${sockGoM ? `${sockGoM[5]}?.[id]??id` : 'id'},
    gemBonus:(it,id)=>{try{${sockGoM ? `const b=${sockGoM[4]}(it,id);return b?${sockGoM[6]}(b):\`\`` : 'return``'}}catch{return\`\`}},
    letterWorth:(it)=>{try{return ${worthM ? `${worthM[2]}(it)` : 'null'}}catch{return null}},
    boundLine:(it)=>{try{return ${boundM ? `${boundM[2]}(it)` : 'null'}}catch{return null}},
    setInfo:(it)=>{try{${setM ? `const s=${setM[2]}(${setM[3]}(it));return s?{name:s.name,tiers:${setM[5]}(it)}:null` : 'return null'}}catch{return null}},
    fateChoice:()=>${fateChoiceVar},
    fatePick:(id)=>${fatePickFn}(id),
    fateChoose:(id)=>{const f=${depsVar}.fate;${fateChoiceVar}=null;${closeFn}();try{f?.choose?.(id)}catch(e){console.warn(\`[fate]\`,e?.message??e)}},
    fateEnsureStyle:()=>{try{${fateStyleFn}(typeof document>\`u\`?null:document)}catch{}},
    fateTrophyTile:(cardEl,faceEl,trophy)=>{
      try{
        ${decorateNodeFn}(cardEl,trophy);
        faceEl.append(${makeTileFn}(${itemLineRawFn}(trophy,${depsVar}.entity),faceEl,${boxSizesVar}.loot));
        cardEl.onmouseenter=()=>{${prefFn}(\`plusItemHover\`)!==!1&&${hoverTipFn}(trophy,\`remote\`,cardEl)};
        cardEl.onmouseleave=${hideTipFn};
        return!0;
      }catch{return!1}
    },
    fatePortrait:(faceEl,p)=>{
      if(!p||!Number.isInteger(p.archive))return!1;
      try{
        const f=${depsVar}.fate;
        const r=${portraitTexFn}(p.archive,p.record,{box:40,dpr:${dprFn}(),cap:8,onReady:()=>{${depsVar}.fate===f&&${renderFn}()}});
        return r?.src?(faceEl.append(${imgElFn}(r)),!0):!1;
      }catch{return!1}
    },
  };
}
function __dfoContainerPrepareAside$(el,kind,paired){try{if(globalThis.__dfoContainer?.prepareAside){globalThis.__dfoContainer.prepareAside(el,kind,paired);return}}catch{}try{el.dataset.dfoLootKind=kind;kind===\`reward\`&&el.classList.add(\`dfo-reward-win\`);kind===\`fate\`&&el.classList.add(\`dfo-fate-win\`)}catch{}}
function __dfoContainerClick$(it,side,ev){try{return globalThis.__dfoContainer?.handleRowClick?.(it,side,ev,__dfoContainerCtx$())===!0}catch{return!1}}
function __dfoContainerBeforeSync$(lootWin){try{globalThis.__dfoContainer?.restoreScrollBeforeSync?.(lootWin)}catch{}}
function __dfoContainerMounted$(shell,lootWin,packWin){try{globalThis.__dfoContainer?.onShellMounted?.(shell,lootWin,packWin,__dfoContainerCtx$())}catch{}}
function __dfoContainerKeyDown$(ev){try{return globalThis.__dfoContainer?.onKeyDown?.(ev)===!0}catch{return!1}}
function __dfoContainerMenu$(menuEl,it,side,closeMenu,x,y){try{globalThis.__dfoContainer?.decorateContextMenu?.(menuEl,it,side,closeMenu,__dfoContainerCtx$(),x,y)}catch{}}
function __dfoContainerUnmount$(){try{globalThis.__dfoContainer?.onUnmount?.()}catch{}}
`;

  return out + bridge;
}

const JOBS = [
  ['container.filter', (rel, text) => /\/storeFilter-[^/]+\.js$/.test(rel) && text.includes('[`materials`,`Materials`]'), storeFilter],
  ['container.view', (rel, text) => !/Worker-/.test(rel) && text.includes('`packcol packremote`') && text.includes('`inventory.store.takeAll`'), containerView],
];

function transformContainer(rel, text, log) {
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

module.exports = { transformContainer, storeFilter, containerView };
