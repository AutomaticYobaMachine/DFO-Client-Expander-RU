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
  out = cleanSameHostRemount(out);
  out = sessionHandle(out);
  out = lifecycle(out, render, deps, true);
  return out + '\n;function __dfoPackList$(t,p){try{return globalThis.__dfoPack?.list?.(t,p)??t}catch{return t}}'
    + 'function __dfoPackBuild$(f,e){const p=globalThis.__dfoPack;return typeof p?.build===\'function\'?p.build(f,e):f(e)}'
    + 'function __dfoPackMode$(){try{return globalThis.__dfoPack?.mode?.()??\'\'}catch{return\'\'}}'
    + 'function __dfoPackListRow$(){try{return globalThis.__dfoPack?.listRow?.()===!0}catch{return!1}}'
    + 'function __dfoPackHead$(h,r){try{globalThis.__dfoPack?.head?.(h,r)}catch{}}'
    + 'function __dfoPackRefresh$(d,b,s){try{globalThis.__dfoPack?.refresh?.(d,{busy:b,sort:s})}catch{}}\n';
}

// The original fpArm figure subscription is also notified by synchronous cold item-icon misses.
// During render() it can enter render() recursively before host.append(shell), leaving all the
// suspended local shells to append as siblings when the stack unwinds. The callback's cache
// invalidation stays synchronous; only its full repaint is coalesced after the current stack.

// An old paperdoll compose may resolve after A has been replaced by B.
// Only the session that scheduled the promise may repaint on its completion.
function guardFigureAsync(out, owner, deps, render, required) {
  if (!deps) return out;
  const pattern = 'function ('+ID+')\\(\\)\\{Promise\\.resolve\\(('+ID+')\\('+esc(deps)+'\\.entity\\)\\)\\.then\\(\\(\\)=>\\{'+esc(owner)+'&&'+esc(render)+'\\(\\)\\}\\)';
  const found = [...out.matchAll(new RegExp(pattern, 'g'))];
  if (found.length !== 1) {
    if (required) throw new Error('inventory paperdoll async owner: '+found.length+' places');
    return out;
  }
  const whole = found[0][0];
  const patched = whole
    .replace('(){Promise.resolve(', '(){const __dfoFigureHost$='+owner+',__dfoFigureSession$='+deps+',__dfoFigureGeneration$=__dfoFigureGen$;Promise.resolve(')
    .replace(owner+'&&'+render+'()', () => owner+'===__dfoFigureHost$&&'+deps+'===__dfoFigureSession$&&__dfoFigureGen$===__dfoFigureGeneration$&&'+render+'()');
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
  // Each mount receives a fresh generation even if enhancedChunk retries on the same host.
  const subscription = whole.replace(body, nextBody).replace('.subscribe(', '.subscribe(__dfoOwnFigure$(').replace(/\)$/, '))');
  out = put(out, whole, subscription);
  out = put(out, decl, 'function __dfoNativeRender$(){');
  // Separate function declarations preserve all native render call sites, including
  // user actions that must repaint synchronously. A stale microtask cannot paint another host.
  // This hook is optional until its minified form is validated against the live bundle.
  const syncs = [...out.matchAll(/(?:\b(?:const|let|var)\s+|,)([\w$]+)=\(?([\w$]+)\)?=>\{for\((?:const|let|var) ([\w$]+) of ([\w$]+)\)\3\.sync\(\2\)\}/g)];
  const syncName = syncs.length === 1 ? syncs[0][1] : null;
  const runtime = "\n;let __dfoRenderBusy$=false,__dfoRenderActive$=null,__dfoRenderDirty$=false,__dfoRenderPending$=null;\nlet __dfoFigureGen$=0,__dfoNoticeSeq$=0,__dfoRenderedNoticeSeq$=0;\nfunction __dfoOwnFigure$(callback){\n  const generation=++__dfoFigureGen$,ownedHost=@@OWNER@@,ownedSession=@@SESSION@@;\n  return (...args)=>{\n    if(generation===__dfoFigureGen$&&ownedHost===@@OWNER@@&&ownedSession===@@SESSION@@)callback(...args);\n  };\n}\nfunction __dfoFigureNotice$(owner){\n  ++__dfoNoticeSeq$;\n  __dfoRequestRender$(owner,@@SESSION@@);\n}\nfunction __dfoRequestRender$(owner,session,force=false){\n  if(!owner||@@OWNER@@!==owner||@@SESSION@@!==session)return;\n  const generation=__dfoFigureGen$,seq=__dfoNoticeSeq$;\n  const previous=__dfoRenderPending$;\n  if(previous&&previous.owner===owner&&previous.session===session&&previous.generation===generation){\n    previous.seq=Math.max(previous.seq,seq);\n    previous.force=previous.force||force;\n    return;\n  }\n  const pending={owner,session,generation,seq,force};\n  __dfoRenderPending$=pending;\n  Promise.resolve().then(()=>{\n    if(__dfoRenderPending$!==pending)return;\n    __dfoRenderPending$=null;\n    if(@@OWNER@@!==owner||@@SESSION@@!==session||__dfoFigureGen$!==generation)return;\n    // A synchronous render after the event already consumed its data. Events\n    // issued DURING a render stay pending until another complete render.\n    if(!pending.force&&pending.seq<=__dfoRenderedNoticeSeq$)return;\n    try{@@RENDER@@()}catch(e){console.warn('[dfo-mod inventory] deferred repaint failed',e)}\n  });\n}\nfunction @@RENDER@@(){\n  if(!@@OWNER@@)return;\n  const live={owner:@@OWNER@@,session:@@SESSION@@,generation:__dfoFigureGen$};\n  if(__dfoRenderBusy$){\n    const active=__dfoRenderActive$;\n    if(active&&active.owner===live.owner&&active.session===live.session&&active.generation===live.generation)\n      __dfoRenderDirty$=true;\n    else __dfoRequestRender$(live.owner,live.session,true);\n    return;\n  }\n  const noticeAtStart=__dfoNoticeSeq$;\n  let completed=false;\n  __dfoRenderBusy$=true;__dfoRenderActive$=live;\n  try{__dfoNativeRender$();completed=true}\n  finally{\n    __dfoRenderBusy$=false;__dfoRenderActive$=null;\n    const dirty=__dfoRenderDirty$;__dfoRenderDirty$=false;\n    const stillOwns=@@OWNER@@===live.owner&&@@SESSION@@===live.session&&__dfoFigureGen$===live.generation;\n    if(completed){\n      if(stillOwns){\n        __dfoRenderedNoticeSeq$=Math.max(__dfoRenderedNoticeSeq$,noticeAtStart);\n        if(dirty)__dfoRequestRender$(live.owner,live.session,true);\n      }\n    }else if(__dfoRenderPending$&&__dfoRenderPending$.owner===live.owner&&__dfoRenderPending$.session===live.session){\n      // An exception does not start an automatic retry loop.\n      __dfoRenderPending$=null;\n    }\n  }\n}\n";
  // Trace only at lifecycle boundaries; never wrap native DOM handlers or alter their return values.
  const tracedRuntime = runtime
    .replace('  ++__dfoNoticeSeq$;\n  __dfoRequestRender$(owner,@@SESSION@@);',
      '  ++__dfoNoticeSeq$;\n  if(__dfoNoticeSeq$===1||__dfoNoticeSeq$%32===0)__dfoTraceRender$("view.figure.notice",{seq:__dfoNoticeSeq$,busy:__dfoRenderBusy$});\n  __dfoRequestRender$(owner,@@SESSION@@);')
    .replace('  if(!owner||@@OWNER@@!==owner||@@SESSION@@!==session)return;',
      '  if(!owner||@@OWNER@@!==owner||@@SESSION@@!==session){__dfoTraceRender$("view.request.stale",{reason:"owner-change"});return;}')
    .replace('  __dfoRenderPending$=pending;\n  Promise.resolve().then(()=>{',
      '  __dfoRenderPending$=pending;\n  __dfoTraceRender$("view.render.queued",{generation,seq,force});\n  Promise.resolve().then(()=>{')
    .replace('    if(@@OWNER@@!==owner||@@SESSION@@!==session||__dfoFigureGen$!==generation)return;',
      '    if(@@OWNER@@!==owner||@@SESSION@@!==session||__dfoFigureGen$!==generation){__dfoTraceRender$("view.render.stale",{generation});return;}')
    .replace('    if(!pending.force&&pending.seq<=__dfoRenderedNoticeSeq$)return;',
      '    if(!pending.force&&pending.seq<=__dfoRenderedNoticeSeq$){__dfoTraceRender$("view.render.skip",{seq:pending.seq});return;}')
    .replace('  if(!@@OWNER@@)return;\n  const live=',
      '  if(!@@OWNER@@){__dfoTraceRender$("view.render.no-owner",{});return;}\n  const live=')
    .replace('  if(__dfoRenderBusy$){\n    const active=',
      '  if(__dfoRenderBusy$){__dfoTraceRender$("view.render.reentrant",{generation:live.generation});\n    const active=')
    .replace('  const noticeAtStart=__dfoNoticeSeq$;\n  let completed=false;',
      '  const noticeAtStart=__dfoNoticeSeq$,startedAt=Date.now();\n  __dfoTraceRender$("view.render.start",{generation:live.generation,noticeAtStart});\n  let completed=false;')
    .replace('  try{__dfoNativeRender$();completed=true}\n  finally{',
      '  try{__dfoNativeRender$();completed=true}\n  catch(e){__dfoTraceRender$("view.render.error",{message:String(e?.message||e),stack:String(e?.stack||"").slice(0,1600)});throw e}\n  finally{')
    .replace('    if(completed){\n      if(stillOwns){',
      '    __dfoTraceRender$("view.render.end",{completed,elapsedMs:Date.now()-startedAt,dirty,stillOwns,noticeAtStart});\n    if(completed){\n      if(stillOwns){');
  const traceCode = "\n;function __dfoTraceRender$(type,info){try{globalThis.__dfoInventoryTrace?.record?.(type,info,@@OWNER@@)}catch{}}\n";
  const syncCode = "\n;globalThis.__dfoInventoryRemeasure$=(shell)=>{\n  if(!shell?.isConnected||!@@OWNER@@?.contains?.(shell))return false;\n  try{@@SYNC@@({remeasure:true});return true}\n  catch(e){console.warn('[dfo-mod inventory] list remeasure failed',e);return false}\n};\n";
  return out + tracedRuntime.replaceAll('@@OWNER@@',owner).replaceAll('@@SESSION@@',session).replaceAll('@@RENDER@@',render) +
    traceCode.replaceAll('@@OWNER@@',owner) +
    (syncName ? syncCode.replaceAll('@@OWNER@@',owner).replaceAll('@@SYNC@@',syncName) : '');
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
    ';try{globalThis.__dfoInventoryTrace?.record?.("view.remount",{sameHost:__dfoPreviousHost$===' + incomingHost + '},__dfoPreviousHost$)}catch{};' + view + '?.unmount();if(__dfoPreviousHost$!==' + incomingHost + ')__dfoPreviousHost$.remove?.()}';
  return put(out, whole, replacement);
}

function sessionHandle(out) {
  const view = once(out, /([\w$]+)=\{repaint\(\)\{[^{}]*\},dropped:\(\)=>([\w$]+),unmount\(\)\{/, 'inventory per-session view handle');
  const [whole, current, dropped] = view;
  const patched = whole
    .replace('repaint(){', 'repaint(){try{globalThis.__dfoInventoryTrace?.record?.("view.handle.repaint",{stale:' + current + '!==this})}catch{};if(' + current + '!==this)return;')
    .replace('dropped:()=>'+dropped, 'dropped:__dfoDroppedForSession$('+dropped+')')
    .replace('unmount(){', 'unmount(){try{globalThis.__dfoInventoryTrace?.record?.("view.handle.unmount",{stale:' + current + '!==this})}catch{};if(' + current + '!==this)return;');
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
  if(markers.length!==1)throw new Error('inventory host marker: '+markers.length+' places');
  const mark = markers[0].index;
  const candidates = [...out.matchAll(/alive:\(\)=>!([\w$]+),(?:host:([\w$]+)|([\w$]+)),onDismiss:/g)]
    .filter(m=>m.index>mark);
  if(!candidates.length||candidates[0].index-mark>7000)
    throw new Error('inventory overlay alive owner not adjacent to host');
  const alive=candidates[0],fired=alive[1],host=alive[2]||alive[3];
  const owner = new RegExp('get done\\(\\)\\{return '+esc(fired)+'\\}[\\s\\S]{0,700}?dispose\\(\\)\\{([\\w$]+)\\(\\)\\}', 'g');
  const handles=[...out.slice(mark,alive.index).matchAll(owner)];
  if(handles.length!==1)throw new Error('inventory overlay dispose ownership: '+handles.length+' places');
  const original=handles[0][0],close=handles[0][1];

  // Each host claims the most recent opening before asynchronous chunk loading.
  const ids=[...out.matchAll(new RegExp('('+esc(host)+'\\.id=(.)enhanced-inventory\\2)','g'))]
    .filter(m=>m[2]==='"'||m[2]==="'"||m[2]==='\u0060');
  if(ids.length!==1)throw new Error('inventory host generation assignment: '+ids.length+' places');
  // A failed lazy chunk must invoke the same close path as the native button:
  // unregister, save/close the loot session, then dispose its DOM.
  const dismiss=[...out.matchAll(new RegExp(
    'onDismiss:\\(\\)=>\\{'+esc(host)+'\\.remove\\(\\)[;,]'+esc(fired)+'=(?:!0|true)\\}','g'))]
    .filter(m=>m.index>=alive.index&&m.index<alive.index+500);
  if(dismiss.length!==1)throw new Error('inventory lazy dismiss cleanup: '+dismiss.length+' places');

  let t=put(out,ids[0][0],ids[0][0]+','+host+
    '.__dfoGeneration$=(globalThis.__dfoInventoryDoorGeneration$=(globalThis.__dfoInventoryDoorGeneration$||0)+1)');
  // Generation checks cancel stale imports but do not close the stale
  // full-screen host or unregister its overlay. Hand A to native close()
  // as soon as B claims ownership; let a pending chest save finish safely.
  const activation='alive:(()=>{'+
    'const previous=globalThis.__dfoInventoryDoorActive$;'+
    '__dfoTraceDoor$("overlay.claim",'+host+',{previousGeneration:previous?.host?.__dfoGeneration$??null});'+
    'if(previous&&previous.host!=='+host+'){try{__dfoTraceDoor$("overlay.handoff",previous.host,{nextGeneration:'+host+'.__dfoGeneration$});previous.retire()}catch(e){__dfoTraceDoor$("overlay.handoff.error",previous.host,{message:String(e?.message||e)});console.warn("[dfo-mod inventory] old overlay cleanup failed",e)}}'+
    'globalThis.__dfoInventoryDoorActive$={host:'+host+',state:()=>({done:!!'+fired+',connected:!!'+host+'.isConnected,retired:!!'+host+'.__dfoRetired$}),retire:()=>{'+
    'const wasRetired=!!'+host+'.__dfoRetired$;__dfoTraceDoor$("overlay.retire",'+host+',{alreadyRetired:wasRetired});'+host+'.__dfoRetired$=true;'+
    'if('+host+'.style){'+host+'.style.visibility="hidden";'+host+'.style.pointerEvents="none"}'+
    'if(!wasRetired){__dfoTraceDoor$("overlay.close.call",'+host+',{source:"retire"});'+close+'();__dfoTraceDoor$("overlay.close.return",'+host+',{source:"retire"})}}};'+
    'return ()=>!'+fired+'&&'+host+'.isConnected&&!'+host+
    '.__dfoRetired$&&'+host+'.__dfoGeneration$===globalThis.__dfoInventoryDoorGeneration$})()';
  t=put(t,alive[0],alive[0].replace('alive:()=>!'+fired,()=>activation));
  t=put(t,original,original.replace('dispose(){'+close+'()}',
    'dispose(){__dfoTraceDoor$("overlay.dispose",'+host+',{});'+host+'.__dfoRetired$=true;'+close+'();__dfoTraceDoor$("overlay.dispose.return",'+host+',{})}'));
  t=put(t,dismiss[0][0],'onDismiss:()=>{__dfoTraceDoor$("overlay.dismiss",'+host+',{});const result='+close+'();__dfoTraceDoor$("overlay.dismiss.return",'+host+',{});return result}');
  return t + '\n;function __dfoTraceDoor$(type,host,info){try{globalThis.__dfoInventoryTrace?.record?.(type,info,host)}catch{}}\n';
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
  ['inventory.door', (rel, text) => text.includes('enhanced-inventory') && text.includes('onDismiss') && text.includes('alive:'), doorOwnership],
  ['inventory.receipt', (rel, text) => !/Worker-/.test(rel) && text.includes('AddItem() encountered a duplicate item'), receipt],
];

function transformInventory(rel, text, log) {
  let out = text;
  for (const [id, on, run] of JOBS) {
    if (!on(rel, out) || out.includes(`/*${id}*/`)) continue;
    try { out = run(out) + `\n/*${id}*/\n`; log.push([id, 1]); if (id === 'inventory.view') log.push(['inventory.lifecycle', 1]); } catch (e) { log.push([`${id}!error ${e.message}`, 0]); if (id === 'inventory.view' || id === 'inventory.door') throw new Error(`inventory lifecycle compatibility failure: ${e.message}`); }
  }
  return out;
}

module.exports = { transformInventory, pages, inventory, lifecycle, guardFigureAsync, cleanSameHostRemount, sessionHandle, doorOwnership, receipt };
