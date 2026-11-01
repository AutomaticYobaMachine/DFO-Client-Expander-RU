'use strict';
const ID = '[\\w$]+';
const rx = s => new RegExp(s);
const need = (s, re) => { const m = re.exec(s); if (!m) throw new Error('unsupported tag signature: ' + re.source.slice(0, 90)); return m; };
function storeTags(text) {
  const pages = need(text, rx(`(${ID})=Object\\.freeze\\(\\[\\[\`weapons\`,\`Weapons\`\\]`))[1];
  const page = need(text, rx(`function (${ID})\\((${ID})\\)\\{if\\(!\\2\\)return\`misc\`;if\\((${ID})\\(\\2\\)\\|\\|\\2\\.templateIndex===`));
  const materialItem = need(text, rx(`(${ID})===\`materials\`\\?(${ID})\\(${ID}\\):${page[1]}\\(`))[2];
  const rarity = need(text, rx(`(${ID})=new Set\\((${ID})\\),${ID}=\\((${ID}),(${ID})\\)=>!\\1\\.has\\(\\4\\)\\|\\|(${ID})\\(\\3\\)===\\4`));
  const materials = need(text, rx(`(${ID})=Object\\.freeze\\(\\[\`Leather\`,\`Chain\``))[1];
  const material = need(text, rx(`function (${ID})\\((${ID})\\)\\{if\\(!${ID}\\(\\2\\)\\)return\`\`;let (${ID})=${ID}\\(\\2\\);return ${ID}\\.has\\(\\3\\)\\?\\3:\`\`\\}`))[1];
  return text + `\n;globalThis.__dfoLootTools={...globalThis.__dfoLootTools,tagInfo:it=>({page:${page[1]}(it),rarity:${rarity[5]}(it),material:${material}(it),materialItem:${materialItem}(it),enchanted:${page[3]}(it),identified:globalThis.__dfoLootIdentified?.(it)??(!${page[3]}(it)||it.isIdentified===true),bound:globalThis.__dfoLootBound?.(it)??it.bound===true,kind:globalThis.__dfoLootKinds?.of(it)??"Other Items"}),tagCatalog:()=>({pages:${pages},rarities:${rarity[2]},materials:${materials},groups:Object.keys(globalThis.__dfoLootTypes?.groups??{}),affixes:globalThis.__dfoLootAffixes??{},kinds:globalThis.__dfoLootKinds?.ids??[]}),templates:()=>globalThis.__dfoLootTypes?.items()??[]};\n`;
}
function templates(text) {
  const groups = need(text, rx(`(${ID})=Object\\.freeze\\(\\{Drugs:Object\\.freeze\\(\\[`))[1];
  const rows = need(text, rx(`var (${ID})=Object\\.freeze\\((${ID})\\),(${ID})=new Map;function ${ID}\\(`));
  const lookup = need(text, rx(`(${ID})=${ID}=>${ID}\\.get\\(${ID}\\)\\?\\?${rows[1]}\\[${ID}\\]\\?\\?${rows[3]}\\.get\\(${ID}\\)\\?\\?null`))[1];
  return text + `\n;globalThis.__dfoLootTypes={groups:${groups},items:()=>{const out=new Map;for(const [group,ids]of Object.entries(${groups}))for(const id of ids){const t=${lookup}(id);if(t)out.set(group+":"+id,{group,templateIndex:id,name:t.name})}for(const t of ${rows[3]}.values()){const group=typeof t.group==="string"&&t.group?t.group:"*";out.set(group+":"+t.index,{group,templateIndex:t.index,name:t.name})}return [...out.values()]}};\n`;
}
function physical(text) {
  const ids = need(text, rx(`(${ID})=Object\\.freeze\\(\\[\`Weapons\`,\`Arrows\`,\`Armor\``))[1];
  const category = need(text, rx(`function (${ID})\\((${ID})\\)\\{return \\2\\?${ID}\\(\\2\\)\\?\`Potions\`:\\2\\.group===\`Weapons\``))[1];
  return text + `\n;globalThis.__dfoLootKinds={ids:${ids},of:${category}};\n`;
}
function identities(text) {
  const identified = need(text, rx(`(${ID})=(${ID})=>!${ID}\\(\\2\\)\\|\\|\\2\\?\\.isIdentified===!0`))[1];
  const affixes = need(text, rx(`(${ID})=Object\\.freeze\\(\\{damage:Object\\.freeze\\(\\{slot:\`prefix\``))[1];
  return text + `\n;globalThis.__dfoLootIdentified=${identified};globalThis.__dfoLootAffixes=${affixes};\n`;
}
function bound(text) {
  const m = need(text, rx(`(${ID})=(${ID})=>(${ID})\\(\\2\\)\\?${ID}\\(\\2\\)\\?${ID}\\(\`realm.locked.line\``));
  return text + `\n;globalThis.__dfoLootBound=${m[3]};\n`;
}
function bootstrap(text) {
  const m = need(text, /import\(`(\.\/enhancedInventory-[\w-]+\.js)`\)/);
  return text + `\n;globalThis.__dfoLootPrepare=()=>import(${JSON.stringify(m[1])});\n`;
}
function transformTags(rel, text, log) {
  const jobs = [];
  if (/\/storeFilter-[^/]+\.js$/.test(rel)) jobs.push(['loot.tags', storeTags]);
  if (text.includes('Drugs:Object.freeze([') && text.includes('worldTexArchive:')) jobs.push(['loot.types', templates]);
  if (text.includes('`Weapons`,`Arrows`,`Armor`') && text.includes('Other Items')) jobs.push(['loot.kinds', physical]);
  if (/\/realmTradeLaw-[^/]+\.js$/.test(rel)) jobs.push(['loot.identified', identities]);
  if (text.includes('`realm.locked.line`')) jobs.push(['loot.bound', bound]);
  if (text.includes('.loot?.opened?.()') && /import\(`\.\/enhancedInventory-/.test(text)) jobs.push(['loot.bootstrap', bootstrap]);
  let out = text;
  for (const [id, run] of jobs) {
    if (out.includes(`/*${id}*/`)) continue;
    try { out = run(out) + `\n/*${id}*/\n`; log.push([id, 1]); } catch(e) { log.push([`${id}!error ${e.message}`, 0]); }
  }
  return out;
}
module.exports = { transformTags };
