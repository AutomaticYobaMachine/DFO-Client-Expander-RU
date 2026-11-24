'use strict';
// Read the original level and world pass. Navigation never moves an actor or plays an action.
const ID = '[\\w$]+', rx = s => new RegExp(s);
const need = (text, re) => { const m = re.exec(text);if (!m) throw new Error('unsupported navigation signature: ' + re.source.slice(0, 110));return m; };

function drawTools(text) {
  const cls = need(text, rx(`(${ID})=class\\{constructor\\((${ID})\\)\\{this\\.gl=\\2,this\\.program=${ID}\\(\\2,${ID},${ID},\`party ping\`\\)`))[1];
  const ribbon = need(text.slice(text.indexOf(`this.program=`)), rx(`(${ID})\\.pts&&\\1\\.pts\\.length>1\\?(${ID})\\(\\1\\.pts\\):\\[\\]`));
  const out = text.replace(ribbon[0], `${ribbon[1]}.pts&&${ribbon[1]}.pts.length>1?(${ribbon[1]}.dfoContinuous?globalThis.__dfoDungeonGraph.ribbon(${ribbon[1]}.pts,${ribbon[1]}.dfoWidth||.055):${ribbon[2]}(${ribbon[1]}.pts)):[]`);
  return out + `\n;globalThis.__dfoDungeonRender={Draw:${cls}};\n`;
}
function context(text) {
  const api = need(text, rx(`(${ID})=${ID}\\((${ID}),${ID},${ID},\\{meshes:${ID}\\}\\)`))[2];
  const placement = need(text, rx(`(${ID})\\.addMesh\\(\`dungeon\`,(${ID})\\.positions,\\2\\.indices,(${ID})\\)`));
  const collider = placement[1], model = placement[2];
  const surfaces = need(text, rx(`(${ID})\\.addMesh\\(${ID}\\.key,${model}\\.positions,${model}\\.indices,${placement[3]}\\)`))[1];
  const renderer = need(text, rx(`(${ID})\\.drawWater\\(`))[1];
  const late = need(text, rx(`(${ID})\\.lateWorldDraw\\?\\.\\(\\)`));
  const portals = need(text, rx(`portals:(${ID}),fires:`))[1];
  const getter = `get dfoDungeonNavigation(){return{collider:${collider},portalSurfaces:${surfaces},key:this.dfoDungeonLive?.location?.mapTableData?.mapId??'',feet:this.swimmer?.()?.feet,transitions:()=>[...${portals}().values()]}},`;
  let out = text.replace('get dfoDungeonLive(){', getter + 'get dfoDungeonLive(){');
  out = out.replace(placement[0], `(globalThis.__dfoDungeonNavModel?.notePlacement(${collider},\`dungeon\`,${model}),${placement[0]})`);
  out = out.replace(late[0], `${late[0]},(()=>{try{globalThis.__dfoDungeonNavigation?.draw(${api},${renderer})}catch(_dfoNav){}})()`);
  if (!out.includes('onCartographyCast')) {
    const cast = need(out, rx(`function (${ID})\\((${ID}),(${ID}),(${ID})=null,(${ID})=null\\)\\{let ${ID}=${ID}\\(\\);[^]{0,400}?let (${ID})=${ID}\\(\\2,\\3,(${ID}),${ID},${ID},\\4,${ID}\\);[^]{0,900}?return \\6\\.createItem&&(${ID})\\?\\.\\(\\6\\.createItem\\),`));
    const [, , spell, , caster, opts, res, player] = cast;
    const tail = `return ${res}.createItem&&${cast[8]}?.(${res}.createItem),`;
    const hook = `${tail}((!${caster}?.entity||${caster}.entity===${player})&&!${opts}?.allyCast&&!${opts}?.reflectedCount&&!(${res}?.saved||${res}?.chanceFailed||${res}?.reflected)&&(${spell}?.effects??${spell}?.settings?.effects??${spell}?.slots??[]).some(_dfoE=>Number(_dfoE?.type)===46||_dfoE?.key==="46,255")&&(()=>{try{globalThis.__dfoDungeonNavigation?.onCartographyCast?.(${player},${spell})}catch(_dfoNavCast){}})()),`;
    out = out.replace(cast[0], cast[0].slice(0, cast[0].length - tail.length) + hook);
  }
  if (!out.includes('__dfoDungeonNavigation?.lights')) {
    const tl = need(out, rx(`torchLights:\\(\\)=>(${ID})\\.lights\\(\\)`));
    out = out.replace(tl[0], `torchLights:()=>{const _dfoL=${tl[1]}.lights(),_dfoN=globalThis.__dfoDungeonNavigation?.lights?.(${api});return _dfoN?.length?[..._dfoL,..._dfoN]:_dfoL}`);
  }
  return out;
}
function quests(text) {
  const m = need(text, rx(`stands:(${ID}),foes:(${ID})\\?\\.foes\\?\\?\\[\\],boxOf:(${ID}),followedId:(${ID})\\.tracked\\(\\)\\?\\.id\\?\\?null`));
  return text.replace('get dungeonLocation(){', `get dfoDungeonQuestSources(){return{stands:${m[1]},boxOf:${m[3]},followedId:${m[4]}.tracked()?.id??null}},get dungeonLocation(){`);
}
function transformDungeonNav(rel, source, log) {
  const actions = [];
  if (source.includes('get dfoDungeonLive(){')) actions.push(['dungeon.navContext', context]);
  if (source.includes('`party ping`') && source.includes('[party-ping] draw')) actions.push(['dungeon.navDraw', drawTools]);
  if (source.includes('get dungeonLocation(){') && source.includes('questFoeBehaviour?.(')) actions.push(['dungeon.navQuests', quests]);
  let text = source;
  for (const [id, run] of actions) {
    if (text.includes(`/*${id}*/`)) continue;
    try { text = run(text) + `\n/*${id}*/\n`;log.push([id, 1]); }
    catch (e) { log.push([`${id}!error ${e.message}`, 0]); }
  }
  return text;
}
module.exports = { transformDungeonNav };
