// DFO Mod - the hooks put into the game's own files as the shell serves them (hook.cjs). Pure: text in, text out.
//
// Each transform finds its place by what the minifier keeps - property names, string literals, the shape of a
// signature - and never by a minified name, so a new build of the game moves nothing here. A hook that finds no
// place does nothing and says so in the log: the game then runs as it is, without that one feature.
//
// Two families: MARKS (the town buildings on the Overworld) and RU (the Russian localization inherited from the
// abandoned DFO_RU patcher, its hooks rewritten to survive new builds).
'use strict';
const { transformNearby } = require('./nearby-loot-transform.cjs');
const { transformTags } = require('./loot-tags-transform.cjs');
const { transformDungeons } = require('./dungeon-transform.cjs');

/** Translate `v` in place when the RU runtime is loaded - a statement. */
const TR = (v) => `if(typeof globalThis.__translate=="function"&&typeof ${v}=="string"&&${v})${v}=globalThis.__translate(${v});`;
/** The same as an expression. */
const TRX = (v) => `(typeof globalThis.__translate=="function"&&typeof ${v}=="string"&&${v}&&(${v}=globalThis.__translate(${v})))`;
const ID = '[\\w$]+';

/** Replace every match of `re` (global) by `fn`, counting. */
function sub(text, re, fn, log, id) {
  let n = 0;
  const out = text.replace(re, (...a) => { n++; return fn(...a); });
  log.push([id, n]);
  return out;
}

// ─── MARKS ──────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The page runtime's filter groups and their words (TV_FILTER_TEXT); also the kind's second word (`dfo <group>`). */
const MARK_GROUPS = Object.freeze([['taverns', 'Таверны'], ['shops', 'Магазины'], ['orgs', 'Организации']]);

/** world chunk: the built town pixels, the world's state and its ground, from the yards' own wiring. */
function marksWorld(text, log) {
  const re = new RegExp(`sites:\\(\\)=>\\{if\\((${ID})\\.length=0,(${ID})\\(\\)!==\`exterior\`\\)return \\1;for\\(let (${ID}) of (${ID})\\.values\\(\\)\\)\\{if\\(!\\3\\.merchantYards\\?\\.length\\|\\|!\\3\\.locOrigin\\)continue;let (${ID})=(${ID})\\.pixelTranslation\\(`);
  const m = re.exec(text);
  if (!m) { log.push(['marks.world', 0]); return text; }
  const g = new RegExp(`\\},groundAt:\\((${ID}),(${ID})\\)=>(${ID})\\(\\1,\\2\\)`).exec(text.slice(m.index, m.index + 4000));
  if (!g) { log.push(['marks.world', 0]); return text; }
  const [, , mode, , built, , state] = m, ground = g[3];
  // THE TOWN MAP'S OWN SOURCES (the guild halls' reveal reads them the same way): the town at a pixel, its book of
  // discovered buildings (townBookOf), and every building of it with its type, name and place (buildingSummaries).
  // Arrows, so a name declared further down the host is read when asked, never here.
  let town = '';
  const rv = new RegExp(`(${ID})=(${ID})\\.get\\((${ID})\\),(${ID})=${esc(built)}\\.get\\(\\3\\);if\\(!\\1\\|\\|!\\4\\?\\.locBlocks\\)return;let ${ID}=(${ID})\\(\\1\\),${ID}=(${ID})\\(\\1\\.exterior\\?\\.buildings\\?\\?\\[\\],\\4\\.locBlocks,\\{locationName:\\1\\.name,regionName:(${ID})\\.getRegionName\\(\\1\\.regionIndex\\)`).exec(text);
  if (rv) {
    const [, , index, , , bookOf, summaries, maps] = rv;
    town = `,locIndex:()=>${index},bookOf:(l)=>${bookOf}(l),summaries:(...a)=>${summaries}(...a),maps:()=>${maps}`;
  }
  log.push(['marks.townSources', rv ? 1 : 0]);
  const expose = `__dfoWorld:(globalThis.__dfoWorld={built:${built},state:${state},ground:(a,b)=>${ground}(a,b),mode:()=>${mode}()${town}}),`;
  log.push(['marks.world', 1]);
  return text.slice(0, m.index) + expose + text.slice(m.index);
}
/** world chunk: our marks beside the yards' in the Overworld's list. */
const marksList = (text, log) => sub(text,
  new RegExp(`for\\(let (${ID}) of (${ID})\\.merchantYards\\?\\.overworldMarks\\(\\)\\?\\?\\[\\]\\)(${ID})\\.push\\(\\1\\);`, 'g'),
  (all, t, host, list) => `${all}try{for(let ${t} of globalThis.__dfoMarks?.(${host})??[])${list}.push(${t})}catch(_dfo){}`, log, 'marks.list');
/** world chunk: a `dfo` mark is its own look, never a traveller's (no crowd folding, no badge). */
const marksLook = (text, log) => sub(text,
  new RegExp(`return (${ID})===\`bounty\`\\|\\|\\1===\`gather\``, 'g'),
  (all, k) => `return ${k}===\`dfo\`||${k}===\`bounty\`||${k}===\`gather\``, log, 'marks.look');
/** world chunk: a `dfo` mark is drawn by the page runtime (its glyph and its name), the rest as they were. */
function marksGlyph(text, log) {
  const re = new RegExp(`if\\((${ID})\\.fillStyle=(${ID}),\\1\\.strokeStyle=\`#000\`,\\1\\.lineWidth=1,(${ID})\\)\\1\\.save\\(\\),\\1\\.translate\\((${ID}),(${ID})\\),\\1\\.rotate\\(\\3\\.angle\\*Math\\.PI/180\\),(${ID})===\`bounty\``, 'g');
  return sub(text, re, (all, g, fill, held, x, y, look, off, src) => {
    const tail = src.slice(off, off + 2000);
    const mk = new RegExp(`else if\\(${esc(look)}===\`waypoint\`\\)${ID}\\(${esc(g)},${esc(x)},${esc(y)},\\{color:(${ID})\\.color`).exec(tail);
    if (!mk) return all;
    return `if(${g}.fillStyle=${fill},${g}.strokeStyle=\`#000\`,${g}.lineWidth=1,${look}===\`dfo\`&&!${held}&&globalThis.__dfoGlyph)try{globalThis.__dfoGlyph(${g},${x},${y},${mk[1]})}catch(_dfo){}else if(${held})${g}.save(),${g}.translate(${x},${y}),${g}.rotate(${held}.angle*Math.PI/180),${look}===\`bounty\``;
  }, log, 'marks.glyph');
}
const esc = (s) => s.replace(/[$]/g, '\\$');
/** filters chunk: three switches of our own, their words, and their group for a `dfo` mark. */
function marksFilters(text, log) {
  let t = sub(text, /Object\.freeze\(\[(`towns`,`distant`[^\]]*)\]\)/g,
    (all, list) => (list.includes('`taverns`') ? all : `Object.freeze([${list},${MARK_GROUPS.map(([g]) => `\`${g}\``).join(',')}])`), log, 'marks.groups');
  t = sub(t, /Object\.freeze\(\{title:`Show`,towns:`Towns`/g,
    () => `Object.freeze({title:\`Show\`,${MARK_GROUPS.map(([g, w]) => `${g}:\`${w}\``).join(',')},towns:\`Towns\``, log, 'marks.words');
  t = sub(t, new RegExp(`(function ${ID}\\((${ID})=\`\`\\)\\{let (${ID})=String\\(\\2\\)\\.split\\(\` \`\\),(${ID})=\\3\\[0\\];return )(\\3\\.includes\\(\`chase\`\\))`, 'g'),
    (all, head, e, words, first, chase) => `${head}${first}===\`dfo\`?${words}[1]??null:${chase}`, log, 'marks.group');
  return t;
}
/** worldTick chunk: the town books of discovered buildings - the town map's own record of what was visited. */
const marksDiscovery = (text, log) => sub(text,
  new RegExp(`function (${ID})\\((${ID})\\)\\{return\\[\\.\\.\\.(${ID})\\.get\\(\\2\\)\\?\\.values\\(\\)\\?\\?\\[\\]\\]\\.map\\((${ID})=>\\(\\{\\.\\.\\.\\4\\}\\)\\)\\}`, 'g'),
  (all, fn) => `${all}globalThis.__dfoDisc=${fn};`, log, 'marks.discovery');

// ─── PRICES ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// What a shop pays for a sale, by the game's OWN law - nothing of it copied here, so a change of the game's numbers is
// read as it ships: the counter's index (scenes/worldModes.js shopAdjustment: the world's region price x the town's
// Prosperity factor x the seat's), CalculateCost (systems/shopStock.js calculateCost) and the haggle with its online
// half and skill slope (calculateTradePrice). Each is named on globalThis where the game declares it.
/** `function NAME(` declared at `lead` ([;}] - a statement's place), named on globalThis as `as` before it. */
const declare = (as) => (all, lead, fn) => `${lead}globalThis.${as}=${fn};${all.slice(lead.length)}`;
/** worldModes (arenaGate chunk): shopAdjustment, and the player's haggling skills as the tavern window reads them. */
function pricesModes(text, log) {
  let t = sub(text, new RegExp(`([;}])function (${ID})\\((${ID}),(${ID})\\)\\{if\\(Number\\.isFinite\\(\\3\\?\\.priceIndex\\)\\)return \\3\\.priceIndex;let ${ID}=${ID}\\(${ID},\\3\\?\\.regionIndex\\?\\?0\\),${ID}=${ID}\\.townShopFactor\\?\\.\\(\\3,\\4\\)`, 'g'),
    declare('__dfoShopAdj'), log, 'prices.shopAdj');
  // skills: () => ({ mercantile: skillValue(playerEntity, SKILLS.Mercantile), personality: ... liveStat(...) }) - the
  // trade window's own, and the tavern's at the modes' top (so it is named as soon as the world stands)
  t = sub(t, new RegExp(`(${ID})=\\(\\)=>\\(\\{mercantile:${ID}\\((${ID}),${ID}\\.Mercantile\\),personality:\\2\\.stats\\?\\.personality==null\\?50:${ID}\\(\\2,\`personality\`\\)\\}\\)`, 'g'),
    (all, v) => `${v}=globalThis.__dfoSkills=${all.slice(v.length + 1)}`, log, 'prices.skills');
  return t;
}
/** shopStock (worldTick chunk): calculateCost and calculateTradePrice, each told by its signature and its body. */
function pricesLaw(text, log) {
  let t = sub(text, new RegExp(`([;}])function (${ID})\\((${ID}),(${ID}),${ID}=1e3,(${ID})=-1\\)\\{let (${ID})=${ID}\\(\\)\\?${ID}\\(\\3,\\5\\):\\3;(?=[^]{0,240}?=2\\*\\(Math\\.trunc\\(\\6\\*\\(\\4-10\\)/100\\)\\+\\6\\))`, 'g'),
    declare('__dfoCost'), log, 'prices.cost');
  t = sub(t, new RegExp(`([;}])function (${ID})\\((${ID}),(${ID}),\\{mercantile:${ID}=0,personality:${ID}=50\\}=\\{\\},${ID}=!1,\\{online:${ID}=${ID}\\(\\)\\}=\\{\\}\\)\\{(?=[^]{0,240}?=5\\*\\(\\4-10\\)\\+50)`, 'g'),
    declare('__dfoTradePrice'), log, 'prices.trade');
  return t;
}
/** seatEdicts (world chunk): the seat's factor for this player's guild - read as a buyer of no guild while the page
 *  asks for the base figure (`__dfoNoGuild`), the members' discount being the player's own. TOWN: and the seat a town
 *  answers to (charterAt - its own, or its region's Charter's), named as `__dfoCharterAt`. */
function pricesSeat(text, log) {
  let charter = 0;
  const out = sub(text,
    new RegExp(`shopFactor:\\(?(${ID})\\)?=>(${ID})\\((${ID})\\(\\1\\?\\.townMapId\\),(${ID})\\.guildId\\(\\)\\)`, 'g'),
    (all, b, f, at, host) => { charter++; return `shopFactor:(globalThis.__dfoCharterAt=${at},${b}=>${f}(${at}(${b}?.townMapId),globalThis.__dfoNoGuild?null:${host}.guildId()))`; },
    log, 'prices.noGuild');
  log.push(['town.charter', charter]);
  return out;
}

// ─── TOWN: the town map's layer (dfo_town.js) ───────────────────────────────────────────────────────────────────────
/** travelView: each frame the Overworld draws its readout, the page's layer is drawn under it through the same
 *  projection (`deps.project`) and the same feet. */
const townFrame = (text, log) => sub(text,
  new RegExp(`let (${ID})=(${ID})=>(${ID})\\.project&&\\2\\?\\3\\.project\\(\\2\\):null,(${ID})=\\3\\.route\\?\\.\\(\\)\\?\\?\\[\\]`, 'g'),
  (all, l, t, e, u) => `let ${l}=((()=>{try{globalThis.__dfoFrame?.(${e}.project,${e}.feet)}catch(_dfo){}})(),${t}=>${e}.project&&${t}?${e}.project(${t}):null),${u}=${e}.route?.()??[]`,
  log, 'town.frame');
/** travelView: the marks the readout draws pass the page's filter first - with the town map open, the marks outside
 *  the town are left out (`__dfoMarkFilter`: the list in, the list to draw out). */
const townMarks = (text, log) => sub(text,
  new RegExp(`for\\(let (${ID}) of (${ID})\\.marks\\?\\.\\(\\)\\?\\?\\[\\]\\)\\{let (${ID})=(${ID})\\(\\1\\.at\\);`, 'g'),
  (all, t, e, a, l) => `for(let ${t} of ((_a)=>{try{return globalThis.__dfoMarkFilter?.(_a)??_a}catch(_dfo){return _a}})(${e}.marks?.()??[])){let ${a}=${l}(${t}.at);`,
  log, 'town.markFilter');
/** travelView: the point the camera follows - the traveller's feet, or, while the detailed town map is open, the page's
 *  own focus over the town (`__dfoCamFeet`: a scene point, or nothing for the feet). The camera's height, tilt and
 *  easing stay the game's. */
const townCamera = (text, log) => {
  // and the camera itself, handed to the page before each step (`__dfoCamAdj`: the camera in, the camera to step out) -
  // the map's own turn and tilt, the view's own angle given back when it closes
  let adj = 0;
  let t = sub(text, new RegExp(`(${ID})\\((${ID}),\\{feet:(${ID})\\.feet\\(\\),dt:(${ID}),ceiling:`, 'g'), (all, step, cam, e, dt) => {
    adj++;
    return `${step}((${cam}=globalThis.__dfoCamAdj?.(${cam})??${cam}),{feet:(globalThis.__dfoCamFeet?.()??${e}.feet()),dt:${dt},ceiling:`;
  }, log, 'town.camera');
  log.push(['town.cameraTurn', adj]);
  if (!adj) t = sub(t, new RegExp(`\\{feet:(${ID})\\.feet\\(\\),dt:(${ID}),ceiling:`, 'g'),
    (all, e, dt) => `{feet:(globalThis.__dfoCamFeet?.()??${e}.feet()),dt:${dt},ceiling:`, log, 'town.camera');
  return t;
};
/** townTalk: the one bag of building-name context the game names a guild hall, a temple and a palace by (its factions'
 *  names, shown in the player's language) - `__dfoNameOpts()`, for the town map's own names. */
const townNames = (text, log) => sub(text,
  new RegExp(`nameOpts:(${ID}),get buildingDirectory\\(\\)`, 'g'),
  // and a building's name always the map's own: the bag handed through `__dfoNameCanon` (ru_locale.js), which takes the
  // translated faction and place names out of it - a guild's hall, a temple, a shop named as on the map in any language
  (all, f) => `nameOpts:(globalThis.__dfoNameOpts=(...a)=>{const o=${f}(...a);return o&&globalThis.__dfoNameCanon?globalThis.__dfoNameCanon(o):o}),get buildingDirectory()`,
  log, 'town.names');

// ─── RU: the game's own language system (Russian chosen), our pack in it ───────────────────────────────────────────
/** localeData: the packs the build carries (L10N6 indexBundledPacks) - ours (data/ru-pack, ru_locale.js __dfoPacks) laid
 *  in as if the build had it, over the game's Russian drafts; and the classic fonts keep the game's own pixel face with
 *  the mod's Cyrillic in it (installLocaleFaces would hand them a system font for Russian). */
function ruLocale(text, log) {
  let t = sub(text, new RegExp(`=(${ID})\\(\\{text:(${ID}),fonts:(${ID}),meta:(${ID})\\}\\)`, 'g'),
    (all, f, a, b, c) => `=${f}(((g)=>{try{return globalThis.__dfoPacks?.(g)??g}catch(_dfo){return g}})({text:${a},fonts:${b},meta:${c}}))`, log, 'ru.packs');
  t = sub(t, new RegExp(`(function ${ID}\\((${ID}),\\{createFace:${ID}=${ID},canDraw:(${ID})=${ID}\\}=\\{\\}\\)\\{)(if\\(!\\2\\|\\|\\2===\`en\`\\|\\|!\\3\\(\\)\\)return!1;)`, 'g'),
    (all, head, e, n, rest) => `${head}if(${e}===\`ru\`&&globalThis.__dfoRuPixel)return!1;${rest}`, log, 'ru.faces');
  return t;
}
/** worldTick / itemInfo: an item's name as shown (shownItemName) - a name the tables know by no index (a Magic or Rare
 *  piece's "Sentinel's Cuirass of the Bear", a Legendary's, a jeweller's or a kit's) read into Russian by ru_items.js, else
 *  as it stands; and the long name's three English joins - a Masterwork's mark, a Potent brew, an heirloom's house. */
/** The questlines' sheets (systems/questlines/sheets: what to do, the choices, how it ended) and the messages their
 *  patches add to the classic quests (patches/*.json `new`), as the chunk writes them - `text:\`...\`` and
 *  `new:\`...\`` - read into Russian from the mod's table (data/ru/ql_ru.json, keyed by the literal's own text). The
 *  quest machine then fills their symbols (_qgiver_, ___inn_) into the Russian, as into the English. */
function ruQuestSheets(text, log, ctx) {
  const tab = ctx.ql;
  if (!tab) { log.push(['ru.ql', 0]); return text; }
  let n = 0;
  const out = text.replace(/([,{])(text|new):`((?:[^`\\]|\\[\s\S])*)`/g, (all, lead, k, body) => {
    const ru = (k === 'new' ? tab.n : tab.t)?.[body];
    if (typeof ru !== 'string') return all;
    n++;
    return `${lead}${k}:\`${ru}\``;
  });
  log.push(['ru.ql', n]);
  return out;
}
/** The port's patches over DFU's own quests (systems/quest/questPatches.js QUEST_PATCHES) find their place by the quest's
 *  English words - and a patch that misses throws, and the whole quest then loads unpatched (the main quest's opener
 *  would say the cave's waking line to every new character). The quests are Russian here (ru.quest), so the patches'
 *  words are DFO_RU's own: the same cut, said in Russian. */
const QUEST_PATCH_WORDS = [
  [' most appreciative.\n    Before landing in Daggerfall, a sudden storm\n capsized the ship. I barely made it into this cave.\n`,new:` most appreciative.\n`',
    ' будет весьма признателен.\n    Перед самой высадкой в Daggerfall внезапный шторм\n потопил корабль. Я едва сумел выбраться в эту пещеру.\n`,new:` будет весьма признателен.\n`'],
  ["     I heard about your accident at sea, and feared the\n worst. Now that I've heard you're alive and well, I\n would like the opportunity to meet with you and discuss\n our beloved Emperor's mission in the Iliac Bay.\n`,new:`     Word has reached me that you are in the Iliac Bay\n at last, and alive and well. I would like the\n opportunity to meet with you and discuss our beloved\n Emperor's mission here.\n`",
    '     Я слышала о вашем кораблекрушении и опасалась\n худшего. Теперь же, узнав, что вы живы и здоровы, я\n хотела бы встретиться с вами и обсудить поручение\n нашего возлюбленного Императора в заливе Илиак.\n`,new:`     До меня дошли вести, что вы наконец в заливе\n Илиак, живы и здоровы. Я хотела бы встретиться\n с вами и обсудить поручение нашего возлюбленного\n Императора здесь.\n`'],
  ['{old:` _qgiver_ will want the _item_ back.\n\n\n-- Symbols used in the QRC file:`,new:` _qgiver_ will want the _item_ back.\\n\\n${',
    '{old:` _qgiver_ захотят получить _item_ обратно.\n\n\n-- Symbols used in the QRC file:`,new:` _qgiver_ захотят получить _item_ обратно.\\n\\n${'],
];
function ruQuestPatches(text, log) {
  let t = text, n = 0;
  for (const [en, ru] of QUEST_PATCH_WORDS) if (t.includes(en)) { t = t.split(en).join(ru); n++; }
  log.push(['ru.questPatches', n]);
  return t;
}
/** The port's own books (systems/portBooks.js: the Rourken guns, the Sky-Ketch, the breaches) open from their bytes and
 *  never look for a translation's -LOC file, as the classic books do (ui/bookDoor.js). Here they look first: the pack's
 *  Text/Books/BOK00161-LOC.txt is book 417's (a book file is named by its id's low byte), and the bytes stay the
 *  fallback. */
function ruPortBooks(text, log) {
  return sub(text, new RegExp(`let (${ID})=(${ID})\\((${ID})\\?\\.message\\?\\?-1\\),(${ID})=\\1\\?null:(${ID})\\(\\3\\?\\.message\\?\\?-1\\);if\\(!\\1&&!\\4\\)\\{(${ID})\\?\\.\\(\\);return\\}let (${ID})=\\4\\?(${ID})\\(\\4\\):null;`, 'g'),
    (all, port, open, item, name, file, fail, loc, read) =>
      `let ${port}=${open}(${item}?.message??-1),${name}=${port}?null:${file}(${item}?.message??-1);if(!${port}&&!${name}){${fail}?.();return}let ${loc}=${read}(${name}??${file}(${item}?.message??-1));`,
    log, 'ru.portBooks');
}
function ruItemNames(text, log) {
  let t = sub(text, new RegExp(`(\\.find\\((${ID})=>\\2\\?\\.name===(${ID})&&\\2\\.type!==0===${ID}\\);return (${ID})\\?${ID}\\(\\4\\.index,\\3\\):)\\3\\}`, 'g'),
    (all, head, e, n) => `${head}(globalThis.__dfoItemName?.(${n})??${n})}`, log, 'ru.itemName');
  t = sub(t, new RegExp(`name:\`\\$\\{(${ID})\\.maker\\}'s \\$\\{(${ID})\\?\`\\$\\{\\2\\} \`:\`\`\\}\\$\\{(${ID})\\}\``, 'g'),
    (all, e, i, r) => `name:(globalThis.__dfoMakerName?.(${e}.maker,${i},${r})??(${all.slice(5)}))`, log, 'ru.itemMaker');
  t = sub(t, new RegExp(`name:\`\\$\\{(Number\\.isInteger\\((${ID})\\.potent\\)&&\\2\\.potent>0)\\?\`Potent \`:\`\`\\}\\$\\{([^\`]{1,40}?)\\}\``, 'g'),
    (all, cond, e, nm) => `name:((${cond})&&globalThis.__dfoPotent?globalThis.__dfoPotent(${nm}):${all.slice(5)})`, log, 'ru.itemPotent');
  t = sub(t, new RegExp(`name:(${ID})\\.startsWith\\(\`of \`\\)\\?\`\\$\\{(${ID})\\} of the house \\$\\{\\1\\}\`:\`\\$\\{\\1\\}'s \\$\\{\\2\\}\``, 'g'),
    (all, r, a) => `name:(globalThis.__dfoHouseName?.(${a},${r})??(${all.slice(5)}))`, log, 'ru.itemHouse');
  return t;
}
/** world / exterior: a guild's hall revealed on the town map (revealGuildHallsOnMap) named by its faction's own name - the
 *  translated one stayed in the save's record and on the map. */
const ruHallNames = (text, log) => sub(text,
  new RegExp(`(factionName:(${ID})=>\\{let (${ID})=${ID}\\.factionDict\\?\\.get\\(\\2\\)\\?\\.name;return \\3==null\\?\`\`:)(${ID}\\(\\2,\\3\\))\\}`, 'g'),
  (all, head, e, n, call) => `${head}(globalThis.__dfoNameCanon?${n}:${call})}`, log, 'ru.hallNames');
/** world: the modes' host - the game's own registry of online homes (onlineHomes.js: ensure / homeAt, its minute's
 *  belief and its back-off) and the playing character's guild book (its guild, tag and roster). */
function townHost(text, log) {
  const g = new RegExp(`guildId:\\(\\)=>\\{let ${ID}=(${ID});return ${ID}\\?\\.stale\\?\\.\\(\\)`);
  // and the town's economy (systems/town/townEcon.js: prosperityOf, bandOf, exchangeOf, tipAt), as the counters read it
  const econRe = new RegExp(`townShopFactor:\\((${ID}),(${ID})\\)=>(${ID})\\.shopFactor\\(\\1,\\2,(${ID})\\.shopFactor\\(\\1\\)\\)`);
  let econ = 0;
  const out = sub(text, new RegExp(`onlineHomes:(${ID}),homesApi:(${ID}),`, 'g'), (all, homes, api, off, src) => {
    const near = src.slice(off, off + 1500);
    const book = g.exec(near);
    if (!book) return all;
    const e = econRe.exec(near);
    if (e) econ++;
    return `__dfoHost:(globalThis.__dfoHost={homes:()=>${homes},guildBook:()=>${book[1]}${e ? `,econ:()=>${e[3]}` : ''}}),${all}`;
  }, log, 'town.host');
  log.push(['town.econ', econ]);
  return out;
}
/** world: every built pixel's building doors (buildingDoors: { door: { matrix, doorType }, pixelKey, dfBlock,
 *  recordIndex }), as the soundscape's host is handed them - one array, kept up to date in place. */
const townDoors = (text, log) => sub(text,
  new RegExp(`inTown:(${ID}),townAt:(${ID}),doors:(${ID}),doorAt:`, 'g'),
  (all, a, b, doors) => `inTown:${a},townAt:${b},doors:(globalThis.__dfoDoors=${doors}),doorAt:`, log, 'town.doors');
/** online session: the hub's lists of who is online (`found`: the World tab's everyone, the Guild tab's, a search) come
 *  with each player's guild tag, which the session's own reader leaves out - the page reads the rows first. And each
 *  session is known to the page, so the town map's opening can ask the hub's list (sendHubWho, its own pace). */
function townOnline(text, log) {
  let t = sub(text,
    new RegExp(`else if\\((${ID})\\.t===\`found\`\\)\\{if\\(([^{}]{0,160}?)\\)return;(?=let ${ID}=${ID}=>\\1\\.l\\.slice\\(0,)`, 'g'),
    (all, m) => `${all}try{globalThis.__dfoSeen?.(${m}.l,${m})}catch(_dfo){}`, log, 'town.found');
  t = sub(t, /this\._rfOn=new WeakMap,this\.onFound=null,/g,
    (all) => `this._rfOn=new WeakMap,(globalThis.__dfoSessions??=[]).push(new WeakRef(this)),this.onFound=null,`, log, 'town.sessions');
  return t;
}
/** wire: readGuildTag - every row the client reads a guild tag off (a peer's, a traveller's, a chat line's) is seen by
 *  the page first, with its name. */
const townTag = (text, log) => sub(text,
  new RegExp(`(${ID})=(${ID})=>typeof \\2\\?\\.gt==\`string\`&&(${ID})\\.test\\(\\2\\.gt\\)\\?\\2\\.gt:null`, 'g'),
  (all, f, e, re) => `${f}=${e}=>(globalThis.__dfoTag?.(${e}),typeof ${e}?.gt==\`string\`&&${re}.test(${e}.gt)?${e}.gt:null)`, log, 'town.tag');
/** guildArmsBook: a guild's arms told (its name with them, from an arms ask, a hall, the reader's own guild) are seen
 *  by the page; and guildArmsOf - an unknown tag asked of the service in the book's own batches - named for it. */
function townArms(text, log) {
  let t = sub(text,
    new RegExp(`function (${ID})\\((${ID}),(${ID}),(${ID})=null,(${ID})=null\\)\\{if\\(typeof \\2!=\`string\`\\|\\|!${ID}\\.test\\(\\2\\)\\)return;(?=[^]{0,240}?name:typeof \\5==\`string\`\\?\\5:)`, 'g'),
    (all, f, tag, her, logo, name) => `${all}try{globalThis.__dfoArms?.(${tag},${name},${her})}catch(_dfo){}`, log, 'town.armsSeen');
  t = sub(t,
    new RegExp(`([;}])function (${ID})\\((${ID})\\)\\{if\\(typeof \\3!=\`string\`\\|\\|!${ID}\\.test\\(\\3\\)\\)return null;let (${ID})=${ID}\\.get\\(\\3\\);return\\(!\\4\\|\\|`, 'g'),
    declare('__dfoArmsOf'), log, 'town.armsOf');
  return t;
}

// ─── RU ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The SDF face's codes: the Latin-1 rows, and the Cyrillic the RU font carries (DFO_RU's PatchNotify). */
const CHARSET_OLD = 'Object.freeze([...Array.from({length:95},(e,t)=>32+t),...Array.from({length:96},(e,t)=>160+t)])';
const CHARSET_NEW = 'Object.freeze([...Array.from({length:95},(e,t)=>32+t),...Array.from({length:96},(e,t)=>160+t),...Array.from({length:64},(e,t)=>1040+t),1025,1105,8211,8212,8230,8470,8594,215])';
const FONT_TAIL = "format('woff2'); }`";
const fontFace = (b64) => `format('woff2'); } @font-face { font-family: 'Pixelify Sans'; font-style: normal; font-weight: 400 700; font-display: swap; src: url(data:font/woff2;base64,${b64}) format('woff2'); unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }\``;

function ruFont(text, log, ctx) {
  if (!ctx.fontB64 || !text.includes(FONT_TAIL) || text.includes('U+0400-045F')) { log.push(['ru.font', 0]); return text; }
  log.push(['ru.font', 1]);
  return text.replace(FONT_TAIL, fontFace(ctx.fontB64));
}
function ruText(text, log) {
  let t = text;
  if (t.includes(CHARSET_OLD)) { t = t.split(CHARSET_OLD).join(CHARSET_NEW); log.push(['ru.charset', 1]); }
  // drawText(renderer, font, text, x, y, scale = 1, color = [1, 1, 1, 1]) - ui/text.js
  t = sub(t, new RegExp(`(function ${ID}\\(${ID},${ID},(${ID}),${ID},${ID},${ID}=1,${ID}=\\[1,1,1,1\\]\\)\\{)(let ${ID}=${ID},\\{fnt:)`, 'g'),
    (all, head, v, rest) => `${head}${TR(v)}${rest}`, log, 'ru.drawText');
  // measureText(fnt, text) - its width, so a translated line is laid out at its own width
  t = sub(t, new RegExp(`(function ${ID}\\((${ID}),(${ID})\\)\\{)(let (${ID})=0;if\\(${ID}\\(\\2\\)\\)\\{for\\((?:let|const) ${ID} of \\3\\))`, 'g'),
    (all, head, f, v, rest) => `${head}${TR(v)}${rest}`, log, 'ru.measureText');
  // the option-bag draw (a label's colour, alignment, shadow)
  t = sub(t, new RegExp(`(function ${ID}\\(${ID},${ID},(${ID}),${ID},${ID},${ID},\\{color:[^{}]*\\}=\\{\\}\\)\\{)`, 'g'),
    (all, head, v) => `${head}${TR(v)}`, log, 'ru.drawLabel');
  // a message's lines as they are justified - whole lines translated before they are wrapped
  t = sub(t, new RegExp(`\\?\\((${ID})\\.push\\(\\{text:(${ID}),center:(${ID})===(${ID})\\.JustifyCenter\\}\\)`, 'g'),
    (all, list, v, e, d) => `?(${TRX(v)},${list}.push({text:${v},center:${e}===${d}.JustifyCenter})`, log, 'ru.justify');
  t = sub(t, new RegExp(`(\\.JustifyCenter\\)\\{)(${ID})(\\.push\\(\\{text:)(${ID})(,center:${ID}===${ID}\\.JustifyCenter\\}\\))`, 'g'),
    (all, a, list, b, v, c) => `${a}${TR(v)}${list}${b}${v}${c}`, log, 'ru.justifyBlock');
  t = sub(t, new RegExp(`return (${ID})&&(${ID})\\.push\\(\\{text:\\1,center:!1\\}\\)`, 'g'),
    (all, v, list) => `return ${v}&&(${TRX(v)},${list}.push({text:${v},center:!1}))`, log, 'ru.justifyTail');
  t = sub(t, new RegExp(`for\\((${ID})&&(${ID})\\.push\\(\\{text:\\1,center:!1\\}\\);`, 'g'),
    (all, v, list) => `for(${v}&&(${TRX(v)},${list}.push({text:${v},center:!1}));`, log, 'ru.justifyLoop');
  return t;
}
const Q = '["\'`]';
function ruChargen(text, log) {
  let t = sub(text, new RegExp(`(${ID})=\\((${ID}),(${ID})\\)=>(${ID})\\.slice\\(\\2,\\3\\)\\.join\\((${Q}) \\5\\)\\.trim\\(\\)`, 'g'),
    (all, f, a, b, list) => `${f}=(${a},${b})=>${list}.slice(${a},${b}).map(x=>globalThis.__translate?globalThis.__translate(x.trim()):x.trim()).join(" ").trim()`, log, 'ru.chargenRows');
  t = sub(t, new RegExp(`\\(Array\\.isArray\\((${ID})\\.text\\)\\?\\1\\.text:\\[\\1\\.text\\]\\)\\.filter\\((${ID})=>\\2&&\\2\\.trim\\(\\)\\)\\.join\\((${Q}) \\3\\)`, 'g'),
    (all, q, e) => `(Array.isArray(${q}.text)?${q}.text:[${q}.text]).filter(${e}=>${e}&&${e}.trim()).map(x=>globalThis.__translate?globalThis.__translate(x.trim()):x.trim()).join(" ")`, log, 'ru.chargenQuestion');
  t = sub(t, new RegExp(`(${ID})\\.trim\\(\\)\\?(${ID})\\.push\\(\\1\\.trim\\(\\)\\):(${ID})\\(\\)`, 'g'),
    (all, v, list, f) => `${v}.trim()?${list}.push(globalThis.__translate?globalThis.__translate(${v}.trim()):${v}.trim()):${f}()`, log, 'ru.chargenAnswers');
  return t;
}
/** The quest machine re-reads a loaded quest's messages from its (translated) source - a save keeps the English. */
function ruQuestMachine(text, log) {
  if (!text.includes('removeStaleSiteLinks(){') || text.includes('_refreshLocalizedQRC')) { log.push(['ru.questRefresh', 0]); return text; }
  const m = new RegExp(`if\\((${ID})\\(${ID},${Q}displayname:${Q}\\)\\)${ID}\\.displayName=(${ID})\\(${ID}\\)`).exec(text);
  if (!m) { log.push(['ru.questRefresh', 0]); return text; }
  const [, starts, after] = m;
  const method = `_refreshLocalizedQRC(e){try{const o=this.deps.getQuestSourceLines?.(e.questName);if(!o)return;let s=!1;const i=[];for(const a of o){const r=a.trim();if(${starts}(r,"displayname:"))e.displayName=${after}(r);else if(${starts}(r,"qrc:")){s=!0;continue}else if(${starts}(r,"qbn:"))break;s&&i.push(a)}if(i.length){const a=new Map(e.messages);e.messages.clear(),this.parser._parseQRC(e,i);for(const[r,c]of a)e.messages.has(r)||e.messages.set(r,c)}}catch(o){}}removeStaleSiteLinks(){`;
  let t = text.replace('removeStaleSiteLinks(){', method);
  log.push(['ru.questRefresh', 1]);
  t = sub(t, new RegExp(`(${ID})\\.restoreSaveData\\(([\\w$.:\\s,]+),this\\._saveResolvers\\(\\)\\)`, 'g'),
    (all, q, a) => `${q}.restoreSaveData(${a},this._saveResolvers()),this._refreshLocalizedQRC(${q})`, log, 'ru.questRestore');
  return t;
}
function ruTutorials(text, log) {
  let t = sub(text, new RegExp(`(${ID})=(${ID})=>Object\\.freeze\\(\\{\\.\\.\\.\\2,body:Object\\.freeze\\(\\[\\.\\.\\.\\2\\.body\\]\\),points:Object\\.freeze\\(\\[\\.\\.\\.\\2\\.points\\?\\?\\[\\]\\]\\)\\}\\)`, 'g'),
    (all, f, e) => `${f}=${e}=>{const tr=typeof globalThis.__translate=="function"?globalThis.__translate:x=>x;return Object.freeze({...${e},title:tr(${e}.title),trigger:tr(${e}.trigger),body:Object.freeze(${e}.body.map(tr)),points:Object.freeze((${e}.points??[]).map(tr))})}`, log, 'ru.tutorialCards');
  t = sub(t, new RegExp(`(${ID})=(${ID})=>\\{let (${ID})=Object\\.getOwnPropertyDescriptors\\(\\2\\),(${ID})=\\4=>\\3\\[\\4\\]\\?\\.get\\?\\{get:\\(\\)=>Object\\.freeze\\(\\[\\.\\.\\.\\3\\[\\4\\]\\.get\\.call\\(\\2\\)\\?\\?\\[\\]\\]\\),enumerable:!0\\}:\\{value:Object\\.freeze\\(\\[\\.\\.\\.\\2\\[\\4\\]\\?\\?\\[\\]\\]\\),enumerable:!0\\};return Object\\.freeze\\(Object\\.defineProperties\\(\\{\\},\\{\\.\\.\\.\\3,body:\\4\\(\`body\`\\),points:\\4\\(\`points\`\\)\\}\\)\\)\\}`, 'g'),
    (all, f, e, d, k) => `${f}=${e}=>{const tr=typeof globalThis.__translate=="function"?globalThis.__translate:x=>x;let ${d}=Object.getOwnPropertyDescriptors(${e}),trWrap=k=>{if(!${d}[k])return;const orig=${d}[k].get?${d}[k].get.bind(${e}):()=>${e}[k];${d}[k]={get:()=>{const val=orig();return Array.isArray(val)?val.map(tr):tr(val)},enumerable:!0,configurable:!0}};trWrap("title");trWrap("trigger");let ${k}=${k}=>${d}[${k}]?.get?{get:()=>Object.freeze([...(${d}[${k}].get.call(${e})??[]).map(tr)]),enumerable:!0}:{value:Object.freeze([...(${e}[${k}]??[]).map(tr)]),enumerable:!0};return Object.freeze(Object.defineProperties({},{...${d},body:${k}(\`body\`),points:${k}(\`points\`)}))}`, log, 'ru.tutorialPages');
  let n = 0;
  for (const [a, b] of [['"[unbound]"', '"[не назначено]"'], ['`[unbound]`', '`[не назначено]`']]) if (t.includes(a)) { t = t.split(a).join(b); n++; }
  log.push(['ru.unbound', n]);
  return t;
}

/** A quest's source chunk (`<QUEST>-<hash8>.js`): its DisplayName and its QRC message bodies, from DFO_RU's tables. */
const QUEST_FILE = /^assets\/(.+)-[A-Za-z0-9_-]{8}\.js$/;
const QRC_HEAD = /^([A-Za-z]+:\s*\[?\d+\]?)\s*(.*)$/;
const tplEsc = (s) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
function ruQuest(text, log, ctx, rel) {
  const m = QUEST_FILE.exec(rel);
  const q = m && ctx.quests?.[m[1].toUpperCase()];
  if (!q || !text.includes('\nQRC:') || !text.includes('\nQBN:')) return text;
  let t = text;
  if (q.name) t = t.replace(/^(\s*DisplayName:[ \t]*)[^\r\n\\]*/m, (all, head) => head + tplEsc(q.name));
  const lines = t.split('\n');
  // a source written with CRLF keeps its \r as an escape inside the template (`\r` at each line's end)
  const bare = (l) => l.replace(/(?:\\r|\r)$/, '');
  const qrc = lines.findIndex((l) => bare(l).trim() === 'QRC:');
  const qbn = lines.findIndex((l, i) => i > qrc && bare(l).trim() === 'QBN:');
  if (qrc < 0 || qbn < 0) return t;
  const eol = lines[qrc].endsWith('\\r') ? '\\r' : lines[qrc].endsWith('\r') ? '\r' : '';
  const out = lines.slice(0, qrc + 1);
  let i = qrc + 1, n = 0;
  while (i < qbn) {
    const h = QRC_HEAD.exec(bare(lines[i]));
    if (!h) { out.push(lines[i++]); continue; }
    out.push(lines[i++]);
    const body = [];
    while (i < qbn && !QRC_HEAD.exec(bare(lines[i]))) body.push(lines[i++]);
    let keep = body.length;   // the block's own tail - blank lines and comments - stays as it was
    while (keep > 0 && (bare(body[keep - 1]).trim() === '' || bare(body[keep - 1]).trim().startsWith('--'))) keep--;
    const ru = q.messages?.[h[1].replace(/\s+/g, ' ')];
    if (typeof ru === 'string' && !h[2].trim()) {
      const rl = ru.replace(/\r/g, '').split('\n');
      while (rl.length && rl[rl.length - 1].trim() === '') rl.pop();
      out.push(...rl.map((l) => tplEsc(l) + eol), ...body.slice(keep));
      n++;
    } else out.push(...body);
  }
  out.push(...lines.slice(qbn));
  log.push(['ru.quest', n]);
  return out.join('\n');
}

// ─── the table ──────────────────────────────────────────────────────────────────────────────────────────────────────
/** Which transforms a served file takes: by its path, by a word only it holds. Each `on` is a cheap first look. */
const TRANSFORMS = [
  { id: 'marks', on: (t) => t.includes('merchantYards?.overworldMarks()'), run: (t, log, ctx) => (ctx.marks ? marksGlyph(marksLook(marksList(marksWorld(t, log), log), log), log) : t) },
  { id: 'marks.filters', on: (t) => t.includes('`dfjs.overworld.filters`'), run: (t, log, ctx) => (ctx.marks ? marksFilters(t, log) : t) },
  { id: 'marks.discovery', on: (t) => t.includes('customUserDisplayName'), run: (t, log, ctx) => (ctx.marks ? marksDiscovery(t, log) : t) },
  { id: 'prices.modes', on: (t) => t.includes('priceIndex))return'), run: (t, log, ctx) => (ctx.marks ? pricesModes(t, log) : t) },
  { id: 'prices.law', on: (t) => t.includes('personality:') && t.includes('=1e3,'), run: (t, log, ctx) => (ctx.marks ? pricesLaw(t, log) : t) },
  { id: 'prices.seat', on: (t) => t.includes('.guildId())'), run: (t, log, ctx) => (ctx.marks ? pricesSeat(t, log) : t) },
  { id: 'town.frame', on: (t) => t.includes('.project&&') && t.includes('.route?.()??[]'), run: (t, log, ctx) => (ctx.marks ? townCamera(townMarks(townFrame(t, log), log), log) : t) },
  { id: 'town.host', on: (t) => t.includes('onlineHomes:') && t.includes(',homesApi:'), run: (t, log, ctx) => (ctx.marks ? townHost(t, log) : t) },
  { id: 'town.doors', on: (t) => t.includes(',doorAt:'), run: (t, log, ctx) => (ctx.marks ? townDoors(t, log) : t) },
  { id: 'town.online', on: (t) => t.includes('t===`found`') && t.includes('hubOnline'), run: (t, log, ctx) => (ctx.marks ? townOnline(t, log) : t) },
  { id: 'town.tag', on: (t) => t.includes('?.gt==`string`'), run: (t, log, ctx) => (ctx.marks ? townTag(t, log) : t) },
  { id: 'ru.locale', on: (t) => t.includes('\\/pack\\/(.+)$') && t.includes('createFace:'), run: (t, log, ctx) => (ctx.ru ? ruLocale(t, log) : t) },
  { id: 'ru.hallNames', on: (t) => t.includes('.factionDict?.get('), run: (t, log, ctx) => ruHallNames(t, log) },
  { id: 'ru.items', on: (t) => t.includes('.type!==0===') || t.includes(".maker}'s "), run: (t, log, ctx) => (ctx.ru ? ruItemNames(t, log) : t) },
  { id: 'ru.questPatches', on: (t) => t.includes('`QUEST-PATCH`'), run: (t, log, ctx) => (ctx.ru ? ruQuestPatches(t, log) : t) },
  { id: 'ru.portBooks', on: (t) => t.includes('failed to open:`'), run: (t, log, ctx) => (ctx.ru ? ruPortBooks(t, log) : t) },
  { id: 'ru.ql', on: (t) => t.includes(',outcomes:[{id:`') || t.includes(',patches:{'), run: (t, log, ctx) => (ctx.ru ? ruQuestSheets(t, log, ctx) : t) },
  { id: 'town.names', on: (t) => t.includes('get buildingDirectory()'), run: (t, log, ctx) => (ctx.marks ? townNames(t, log) : t) },
  { id: 'town.arms', on: (t) => t.includes('?.name??null,at:') && t.includes('heraldry:'), run: (t, log, ctx) => (ctx.marks ? townArms(t, log) : t) },
  { id: 'ru.font', on: (t, rel) => rel.includes('/pixelifyFive-'), run: (t, log, ctx) => (ctx.ru ? ruFont(t, log, ctx) : t) },
  { id: 'ru.text', on: (t) => t.includes(CHARSET_OLD) || t.includes('.JustifyCenter'), run: (t, log, ctx) => (ctx.ru ? ruText(t, log) : t) },
  { id: 'ru.chargen', on: (t, rel) => rel.includes('/enhancedChargen-'), run: (t, log, ctx) => (ctx.ru ? ruChargen(t, log) : t) },
  { id: 'ru.questMachine', on: (t) => t.includes('removeStaleSiteLinks(){'), run: (t, log, ctx) => (ctx.ru ? ruQuestMachine(t, log) : t) },
  { id: 'ru.tutorials', on: (t) => t.includes('[unbound]') || (t.includes('points:') && t.includes('trigger')), run: (t, log, ctx) => (ctx.ru ? ruTutorials(t, log) : t) },
  { id: 'ru.quest', on: (t, rel) => QUEST_FILE.test(rel) && t.includes('\nQRC:'), run: (t, log, ctx, rel) => (ctx.ru ? ruQuest(t, log, ctx, rel) : t) },
];

/**
 * A served game file through every transform that takes it. `rel` its path under the game ('assets/x-abc.js');
 * `ctx` { marks, ru, fontB64, quests }. Answers { text, log } - log: [[hook id, places found]].
 */
function transformAsset(rel, text, ctx) {
  const log = [];
  let t = text;
  for (const tr of TRANSFORMS) {
    if (!tr.on(t, rel)) continue;
    try { t = tr.run(t, log, ctx, rel); } catch (err) { log.push([`${tr.id}!error ${err?.message ?? err}`, 0]); }
  }
  if (ctx.nearbyLoot !== false) t = transformTags(rel, transformNearby(rel, t, log), log);
  if (ctx.dungeons !== false) t = transformDungeons(rel, t, log);
  return { text: t, log };
}

/** The game's page: our scripts before its first module - the RU runtime first, then the mod's own. */
function injectPage(html, prefix, ctx) {
  if (html.includes('dfo-mod/dfo_marks.js')) return html;
  const tags = [];
  tags.push(`<script>window.__DFO_MOD_CFG__=${JSON.stringify(ctx.pageCfg ?? {})};</script>`);
  if (ctx.ru && !html.includes('ru_dict.js')) tags.push(`<script src="${prefix}dfo-mod/ru_dict.js"></script>`, `<script src="${prefix}dfo-mod/ru_i18n.js"></script>`);
  tags.push(`<script src="${prefix}dfo-mod/ru_locale.js"></script>`, `<script src="${prefix}dfo-mod/ru_items.js"></script>`);
  tags.push(`<script src="${prefix}dfo-mod/dfo_marks.js"></script>`, `<script src="${prefix}dfo-mod/dfo_town.js"></script>`);
  if (ctx.dungeons !== false) tags.push(...['dfo_dungeon_model.js', 'dfo_dungeons.js'].map(f => `<script src="${prefix}dfo-mod/${f}"></script>`));
  if (ctx.nearbyLoot !== false) tags.push(...['dfo_loot_rules.js', 'dfo_loot_ui.js', 'dfo_loot.js'].map(f => `<script src="${prefix}dfo-mod/${f}"></script>`));
  const at = html.indexOf('<script type="module"');
  if (at < 0) return html.replace('</head>', `${tags.join('\n  ')}\n</head>`);
  return `${html.slice(0, at)}${tags.join('\n  ')}\n  ${html.slice(at)}`;
}

/** The hooks a working install finds somewhere in the game's files - one missing from every file means that feature is
 *  off in this version of the game (the log says which). The other ids are older shapes of the same places. */
const EXPECTED = Object.freeze({
  dungeons: ['dungeon.world', 'dungeon.hud', 'dungeon.travelView', 'dungeon.bestiary', 'dungeon.tables', 'dungeon.scaling', 'dungeon.rewards', 'dungeon.runtime', 'dungeon.lifetime', 'dungeon.aurum', 'dungeon.ore', 'dungeon.renown', 'dungeon.respawn', 'dungeon.layout', 'dungeon.sizes', 'dungeon.elites'],
  nearbyLoot: ['loot.tags', 'loot.types', 'loot.kinds', 'loot.identified', 'loot.bound', 'loot.bootstrap', 'loot.world', 'loot.exterior', 'loot.modes', 'loot.dungeon', 'loot.inventory', 'loot.transfer', 'loot.arrows'],
  marks: ['marks.world', 'marks.townSources', 'marks.list', 'marks.look', 'marks.glyph', 'marks.groups', 'marks.words', 'marks.group', 'marks.discovery',
    'prices.shopAdj', 'prices.skills', 'prices.cost', 'prices.trade', 'prices.noGuild',
    'town.charter', 'town.frame', 'town.markFilter', 'town.camera', 'town.cameraTurn', 'town.names', 'town.host', 'town.econ', 'town.doors', 'town.found', 'town.sessions', 'town.tag', 'town.armsSeen', 'town.armsOf'],
  ru: ['ru.packs', 'ru.faces', 'ru.hallNames', 'ru.itemName', 'ru.itemMaker', 'ru.itemPotent', 'ru.itemHouse', 'ru.font', 'ru.charset', 'ru.drawText', 'ru.measureText', 'ru.drawLabel', 'ru.justify', 'ru.chargenRows', 'ru.questRefresh', 'ru.questRestore', 'ru.quest', 'ru.ql', 'ru.questPatches', 'ru.portBooks'],
});

module.exports = { EXPECTED, transformAsset, injectPage, TRANSFORMS, MARK_GROUPS, CHARSET_OLD, CHARSET_NEW, QUEST_FILE, ruQuest };
