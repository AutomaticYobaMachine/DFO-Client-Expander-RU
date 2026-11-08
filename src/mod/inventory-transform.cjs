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
  const native = `function __dfoPageNative$(${arg}){if(!${arg})return\`misc\`;${magic}${rest}}`;
  const base = `function __dfoPageBase$(${arg}){if(!${arg})return\`misc\`;${rest}}`;
  let out = put(text, list[0], `${list[1]}=__dfoPackPages$(${list[2]})`);
  out = put(out, whole, `function ${name}(${arg}){return __dfoPackPage$(${arg})}${native}${base}`);
  return out + '\n;function __dfoPackPages$(p){try{return globalThis.__dfoPack?.pages?.(p)??p}catch{return p}}'
    + 'function __dfoPackPage$(e){try{const p=globalThis.__dfoPack?.page;return p?p(e,__dfoPageBase$,__dfoPageNative$):__dfoPageNative$(e)}catch{return __dfoPageNative$(e)}}\n';
}

// enhancedInventory-*.js: the dock's list (listCol), its rows' picture box (itemRow), the header's buttons (render) and
// the refresh every act and every open runs (refresh) - where the sort stands, by the native Sort's own call.
function inventory(text) {
  let out = text;
  // listCol: the page's rows -> the display list (surrogate stacks); each row built through the page script (the list
  // view's dress); the rows' heights kept per view, as the list keeps them per page.
  const list = once(out, rx(`(${ID})=(${ID})\\.tabs\\.find\\(((${ID})=>\\4\\.tab===(${ID}))\\)\\?\\.items\\?\\?\\[\\];return \\1\\.length\\|\\|(${ID})\\.append\\((${ID})\\(\`p\`,\`packempty\``), 'pack list');
  const [, rows, model, finder, , tab] = list;
  out = put(out, list[0], put(list[0], `${rows}=${model}.tabs.find(${finder})?.items??[];`, `${rows}=__dfoPackList$(${model}.tabs.find(${finder})?.items??[],${tab});`));
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
  out = put(out, close[0], `__dfoPackHead$(${close[4]},()=>{${refresh[1]}();${render}()});${close[0]}`);
  out = put(out, refresh[0], `${refresh[1]}=()=>{__dfoPackRefresh$(${deps},()=>!!${salvage}||!!${chestRefusal}(${deps}),()=>${sortInPlace}(${deps}.entity?.items,{nameOf:${nameOf}}));${refresh[2]}=${pm}(${refresh[3]}),`);
  return out + '\n;function __dfoPackList$(t,p){try{return globalThis.__dfoPack?.list?.(t,p)??t}catch{return t}}'
    + 'function __dfoPackBuild$(f,e){const p=globalThis.__dfoPack;return typeof p?.build===\'function\'?p.build(f,e):f(e)}'
    + 'function __dfoPackMode$(){try{return globalThis.__dfoPack?.mode?.()??\'\'}catch{return\'\'}}'
    + 'function __dfoPackListRow$(){try{return globalThis.__dfoPack?.listRow?.()===!0}catch{return!1}}'
    + 'function __dfoPackHead$(h,r){try{globalThis.__dfoPack?.head?.(h,r)}catch{}}'
    + 'function __dfoPackRefresh$(d,b,s){try{globalThis.__dfoPack?.refresh?.(d,{busy:b,sort:s})}catch{}}\n';
}

// equip-*.js: ItemCollection.AddItem (systems/inventory.js addItem). A quest item lands at the FRONT exactly when the
// player receives it - GivePc/GetItem's giveItemToPlayer and a take off a body or a chest (itemTransfer.js) - and the page
// script locks a quest letter there, once, by the native lock's own field.
function receipt(text) {
  const add = once(text, rx(`function (${ID})\\((${ID}),(${ID}),(${ID})=\`back\`\\)\\{(let (${ID})=(${ID})\\(\\2,\\3\\);return \\6\\?(${ID})\\(\\6,\\3\\):\\2\\.includes\\(\\3\\)\\?\\(console\\.warn\\(\`\\[inventory\\] AddItem\\(\\) encountered a duplicate item)`), 'addItem');
  const [whole, name, list, item, at, body] = add;
  return put(text, whole, `function ${name}(${list},${item},${at}=\`back\`){try{globalThis.__dfoPack?.received?.(${list},${item},${at})}catch{}${body}`);
}

const JOBS = [
  ['inventory.pages', (rel, text) => /\/storeFilter-[^/]+\.js$/.test(rel) && text.includes('[`weapons`,`Weapons`]'), pages],
  ['inventory.view', (rel, text) => text.includes('`packPhoneDoll`') && text.includes('`packempty`'), inventory],
  ['inventory.receipt', (rel, text) => !/Worker-/.test(rel) && text.includes('AddItem() encountered a duplicate item'), receipt],
];

function transformInventory(rel, text, log) {
  let out = text;
  for (const [id, on, run] of JOBS) {
    if (!on(rel, out) || out.includes(`/*${id}*/`)) continue;
    try { out = run(out) + `\n/*${id}*/\n`; log.push([id, 1]); } catch (e) { log.push([`${id}!error ${e.message}`, 0]); }
  }
  return out;
}

module.exports = { transformInventory, pages, inventory, receipt };
