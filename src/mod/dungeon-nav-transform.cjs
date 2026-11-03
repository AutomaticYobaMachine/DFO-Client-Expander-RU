'use strict';
// Read the original level, path solver and world pass. Navigation never moves an actor or plays an action.
const ID = '[\\w$]+', rx = s => new RegExp(s);
const need = (text, re) => { const m = re.exec(text);if (!m) throw new Error('unsupported navigation signature: ' + re.source.slice(0, 110));return m; };

function queries(text) {
  const path = need(text, rx(`function (${ID})\\((${ID}),(${ID}),(${ID}),(${ID})\\)\\{return (${ID})\\(\\2,\\3,\\4,\\5\\)\\?\\.points\\?\\?null\\}`));
  const solve = path[6], start = text.indexOf(`function ${solve}(`), body = text.slice(start, start + 5000);
  const locate = need(body, rx(`(${ID})\\(${path[2]},${path[3]}\\[0\\],${path[3]}\\[2\\],${path[3]}\\[1\\]\\)`))[1];
  const heights = need(body, rx(`${path[2]}\\.colliders\\?(${ID})\\(${path[2]}\\.colliders,${ID},${ID},${path[2]}\\.ground,${ID}>=0\\?(${ID})\\(${ID},${ID}\\):null\\):0`));
  const client = need(text, rx(`(${ID})=class\\{constructor\\(\\{store:${ID}=${ID}\\(\\),WorkerCtor:${ID}=globalThis\\.Worker\\}=`))[1];
  return text + `\n;globalThis.__dfoNavNative={...globalThis.__dfoNavNative,solve:${solve},locate:${locate},height:(c,i,x,z)=>${heights[1]}(c.colliders,x,z,c.ground,${heights[2]}(c.mesh,i)),NavClient:${client}};\n`;
}
function drawTools(text) {
  const cls = need(text, rx(`(${ID})=class\\{constructor\\((${ID})\\)\\{this\\.gl=\\2,this\\.program=${ID}\\(\\2,${ID},${ID},\`party ping\`\\)`))[1];
  const doors = need(text, rx(`function (${ID})\\((${ID})\\)\\{let (${ID})=new Set,(${ID})=\\2\\?\\.objects;if\\(!\\4\\|\\|typeof \\4\\.values!=\`function\`\\)return \\3;for\\(let (${ID}) of \\4\\.values\\(\\)\\)(${ID})\\(\\5\\)&&!\\(\\5\\.currentLockValue>0\\)&&\\3\\.add\\(\\5\\.key\\);return \\3\\}`));
  const ribbon = need(text.slice(text.indexOf(`this.program=`)), rx(`(${ID})\\.pts&&\\1\\.pts\\.length>1\\?(${ID})\\(\\1\\.pts\\):\\[\\]`));
  const out = text.replace(ribbon[0], `${ribbon[1]}.pts&&${ribbon[1]}.pts.length>1?${ribbon[2]}(${ribbon[1]}.pts,${ribbon[1]}.dfoContinuous?{dash:1e9,gap:0,lift:.045,half:${ribbon[1]}.dfoWidth||.055}:void 0):[]`);
  return out + `\n;globalThis.__dfoNavNative={...globalThis.__dfoNavNative,Draw:${cls},openDoors:${doors[1]},isDoor:${doors[6]}};\n`;
}
function context(text) {
  const api = need(text, rx(`(${ID})=${ID}\\((${ID}),${ID},${ID},\\{meshes:${ID}\\}\\)`))[2];
  const nav = need(text, rx(`navMesh:\\(\\)=>(${ID})\\.chf`))[1];
  const bake = need(text, rx(`${nav}\\.client\\.bake\\(\\{collider:(${ID}),anchor:\\[[^]{0,140}?\\],anchors:[^]{0,900}?key:(${ID})\\}\\)`));
  const renderer = need(text, rx(`(${ID})\\.drawWater\\(`))[1];
  const late = need(text, rx(`(${ID})\\.lateWorldDraw\\?\\.\\(\\)`));
  const steps = need(text, rx(`\\.aim\\((${ID})\\.trail,(${ID})\\(\\1\\),`));
  const portals = need(text, rx(`portals:(${ID}),fires:`))[1];
  const placement = need(text, rx(`${bake[1]}\\.addMesh\\(\`dungeon\`,(${ID})\\.positions,\\1\\.indices,${ID}\\)`));
  const getter = `get dfoDungeonNavigation(){return{collider:${bake[1]},key:${bake[2]},mesh:${nav}.chf,feet:this.swimmer?.()?.feet,transitions:()=>[...${portals}().values(),...${steps[2]}(${steps[1]})]}},`;
  let out = text.replace('get dfoDungeonLive(){', getter + 'get dfoDungeonLive(){');
  out = out.replace(placement[0], `(globalThis.__dfoDungeonNavModel?.notePlacement(${bake[1]},\`dungeon\`,${placement[1]}),${placement[0]})`);
  out = out.replace(late[0], `${late[0]},(()=>{try{globalThis.__dfoDungeonNavigation?.draw(${api},${renderer})}catch(_dfoNav){}})()`);
  return out;
}
function quests(text) {
  const m = need(text, rx(`stands:(${ID}),foes:(${ID})\\?\\.foes\\?\\?\\[\\],boxOf:(${ID}),followedId:(${ID})\\.tracked\\(\\)\\?\\.id\\?\\?null`));
  return text.replace('get dungeonLocation(){', `get dfoDungeonQuestSources(){return{stands:${m[1]},boxOf:${m[3]},followedId:${m[4]}.tracked()?.id??null}},get dungeonLocation(){`);
}
function transformDungeonNav(rel, source, log) {
  const actions = [];
  if (source.includes('get dfoDungeonLive(){')) actions.push(['dungeon.navContext', context]);
  if (source.includes('WorkerCtor:') && source.includes('?.points??null')) actions.push(['dungeon.navQueries', queries]);
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
