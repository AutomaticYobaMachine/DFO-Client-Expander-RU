'use strict';
const ID = '[\\w$]+', rx = s => new RegExp(s);
const need = (s, re) => { const m = re.exec(s);if (!m) throw new Error('unsupported live dungeon signature: ' + re.source.slice(0, 100));return m; };

function context(text) {
  const stand = need(text, rx(`(${ID})=(${ID})\\((${ID}),(${ID}),(${ID}),\\{meshes:(${ID})\\}\\)`));
  const [, coffer, , api, location, piles] = stand;
  const foes = need(text, rx(`foes:(${ID}),corpseAt:`))[1];
  const opts = need(text, rx(`questMessages:\\(\\)=>(${ID})\\.questBridge\\.machine\\.getAllQuestLogMessages`))[1];
  const journal = need(text, rx(`_openJournal\\((${ID})\\)\\{!(${ID})&&${opts}\\.questBridge&&\\(\\2=(${ID})\\(\\1\\)\\)`));
  const overlay = journal[2], makeJournal = journal[3];
  const factory = need(text, rx(`function ${makeJournal}\\((${ID})\\)\\{return ${opts}\\.questBridge\\?`));
  let out = text.replace(factory[0], factory[0].replace(`(${factory[1]})`, `(${factory[1]},_dfoQuest=null)`));
  const call = need(out, rx(`\\.\\.\\.(${ID})\\(\\),mode:${factory[1]},entity:`));
  out = out.replace(call[0], `...${call[1]}(),focusQuest:_dfoQuest,mode:${factory[1]},entity:`);
  const now = need(text, rx(`\\._diedAt=(${ID})\\(\\)`))[1];
  const interval = need(text, rx(`(${ID})=${ID}\\(\\{elite:!!${location}\\?\\.elite,wild:${ID},superTier:${ID}\\}\\)`))[1];
  const layout = need(text, rx(`Math\\.min\\((${ID}),${foes}\\.length\\)&&`))[1];
  const loot = need(text, rx(`for\\(let (${ID}) of\\[\\.\\.\\.(${ID})\\]\\)if\\(\\1!==(${ID})&&${ID}\\((${ID})\\.get\\(\\1\\),${ID}\\)\\)\\{if\\((${ID})\\(\\1\\)\\)\\{let (${ID})=(${ID})\\(\\1\\),(${ID})=(${ID})\\.get\\(\\1\\),(${ID})=\\8\\?(${ID})\\.get\\(\\1\\):null;if\\((${ID})\\(\\1,\\6\\)\\|\\|!\\6\\?\\.pile\\|\\|!\\8\\|\\|!\\10\\|\\|!(${ID})\\(\\8,\\10\\.items\\.length\\)\\)continue`));
  const [key, seen, openKey, at, isBase, h, holder, st, states, base, bases, gone, empty] = loot.slice(1);
  const regen = `()=>{const _dfoStamps=${foes}.slice(0,${layout}).filter(_dfoF=>_dfoF?.dead&&!_dfoF._gone&&!_dfoF.abyssDestroyed&&Number.isFinite(_dfoF._diedAt)).map(_dfoF=>_dfoF._diedAt);for(const ${key} of ${seen}){if(${key}===${openKey})continue;if(${isBase}(${key})){const ${h}=${holder}(${key}),${st}=${states}.get(${key}),${base}=${st}?${bases}.get(${key}):null;if(${gone}(${key},${h})||!${h}?.pile||!${st}||!${base}||!${empty}(${st},${base}.items.length))continue}else{if(!${key}.startsWith("loot:"))continue;const _dfoPile=${piles}[Number(${key}.slice(5))];if(!_dfoPile||!Array.isArray(_dfoPile.items)||_dfoPile.items.length)continue}const _dfoStamp=${at}.get(${key});if(Number.isFinite(_dfoStamp))_dfoStamps.push(_dfoStamp)}return{now:${now}(),interval:${interval},stamps:_dfoStamps}}`;
  const getter = `get dfoDungeonLive(){const _dfoApi=this;return {ctx:_dfoApi,location:${location},foes:${foes},questBridge:${opts}.questBridge,aurum:${coffer},regen:${regen},blocked:()=>_dfoApi.uiOverlayActive,owns:_dfoWin=>${overlay}===_dfoWin,` +
    `mount:_dfoWin=>{if(${overlay}&&!${overlay}.done)return false;${overlay}=_dfoWin;return true},unmount:_dfoWin=>{if(${overlay}===_dfoWin)${overlay}=null},` +
    `journal:_dfoUid=>{if(${overlay}&&!${overlay}.done)return false;const _dfoQuest=[...(${opts}.questBridge?.machine?.quests?.values?.()??[])].find(_dfoQ=>String(_dfoQ.uid)===String(_dfoUid)&&!_dfoQ.questComplete);if(_dfoUid!=null&&!_dfoQuest)return false;${overlay}=${makeJournal}("activeQuests",_dfoUid==null?null:String(_dfoUid));return!!${overlay}}}},`;
  return out.replace('get uiOverlayActive(){', getter + 'get uiOverlayActive(){');
}

function journalDoor(text) {
  const m = need(text, rx(`questMessages:(${ID})\\.questMessages\\?\\?\\(\\(\\)=>\\[\\]\\),notebook:`));
  return text.replace(m[0], `focusQuest:${m[1]}.focusQuest,` + m[0]);
}
function classicJournal(text) {
  let out = text.replace('constructor({questMessages:', 'constructor({focusQuest:_dfoQuest=null,questMessages:');
  const m = need(out, rx(`this\\.questMessages=(${ID})\\(\\)\\?\\?\\[\\]`));
  return out.replace(m[0], m[0] + ',this.currentMessageIndex=_dfoQuest==null?0:Math.max(0,this.questMessages.findIndex(m=>String(m?.parentQuest?.uid)===String(_dfoQuest)))');
}
function enhancedJournal(text) {
  const row = need(text, rx(`for\\(let\\{e:(${ID}),i:(${ID})\\}of (${ID})\\)\\{let (${ID})=(${ID})\\(\`div\`,\`cr-entry\\$\\{`));
  // The same entry owns its quest UID, so duplicate titles never select a different quest.
  let out = text;
  const card = need(out.slice(row.index), rx(`(${ID})=(${row[5]})\\(\`div\`,\`cr-entry\\$\\{[^]{0,130}?\\}\`\\)`));
  const marked = `${card[1]}=(_dfoNode=>{if(${row[1]}.uid!=null)_dfoNode.dataset.dfoQuest=String(${row[1]}.uid);return _dfoNode})(${card[0].slice(card[0].indexOf('=') + 1)})`;
  out = out.slice(0, row.index) + out.slice(row.index).replace(card[0], marked);
  const mount = need(out, rx(`(${ID})\\.clear\\(\\),(${ID})\\(\\),(${ID})\\?\\.\\(\\),\\3=(${ID})\\((${ID})\\.owner,`));
  out = out.replace(mount[0], `${mount[1]}.clear(),${mount[2]}(),globalThis.__dfoDungeonLive?.focusJournal(${mount[5]}.focusQuest),${mount[3]}?.(),${mount[3]}=${mount[4]}(${mount[5]}.owner,`);
  return out;
}

function transformDungeonLive(rel, source, log) {
  const actions = [];
  if (source.includes('get uiOverlayActive(){') && source.includes('lootContents(') && source.includes('getAllQuestLogMessages')) actions.push(['dungeon.live', context]);
  if (source.includes('questMessages:') && source.includes('.questMessages??(()=>[])') && source.includes('label:`chronicle`')) actions.push(['dungeon.journalDoor', journalDoor]);
  if (source.includes('constructor({questMessages:') && source.includes('this.currentMessageIndex')) actions.push(['dungeon.journalClassic', classicJournal]);
  if (source.includes('as mountEnhancedChronicle')) actions.push(['dungeon.journalFocus', enhancedJournal]);
  if (source.includes('`bossTraits.say.met`')) actions.push(['dungeon.traits', text => {
    const m = need(text, rx(`(${ID})=(${ID})=>${ID}\\(\\2\\)\\.map\\((${ID})=>${ID}\\[\\3\\]\\?\\.\\(\\)\\?\\?\\3\\)`));
    return text + `\n;globalThis.__dfoDungeonTools={...globalThis.__dfoDungeonTools,traits:${m[1]}};\n`;
  }]);
  let out = source;
  for (const [id, run] of actions) {
    if (out.includes(`/*${id}*/`)) continue;
    try { out = run(out) + `\n/*${id}*/\n`;log.push([id, 1]); }
    catch (e) { log.push([`${id}!error ${e.message}`, 0]); }
  }
  return out;
}
module.exports = { transformDungeonLive };
