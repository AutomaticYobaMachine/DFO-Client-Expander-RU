#!/usr/bin/env node
'use strict';
// THE INVENTORY on the PUBLISHED enhanced inventory (docs/inventory.md), with the production hooks and page scripts:
//   node tools/test-pack-browser.cjs "$DFO_BUILD_DIR"          (DFO_SCREENSHOT_DIR=dir writes the pictures)
// In English and in Russian: the nine pages (Magic gone, enchanted pieces on their base's page, Junk last), the window
// wide alone with two columns of rows and native beside a chest with one, the icon view filling the same field, the
// surrogate stacks, the Junk rule and its window (kept in the mod's cache), the sort on open and after an act - never
// in the background - and the quest letter's lock on receipt through the game's own addItem.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { chromium } = require(process.env.DFO_PLAYWRIGHT_MODULE || 'playwright');
const { buildDict, buildI18n } = require('../src/ru-build.cjs');
const { say } = require('./ui-text-stand.cjs');
const itemText = require('../src/mod/item-text.cjs');
const root = path.resolve(__dirname, '..'), mod = path.join(root, 'src/mod');
const build = path.resolve(process.argv[2] || process.env.DFO_BUILD_DIR || '');
const assets = path.join(build, 'assets');
const { transformAsset } = require(path.join(mod, 'transforms.cjs'));
const { createLootStore } = require(path.join(mod, 'loot-store.cjs'));

const read = (f) => fs.readFileSync(path.join(assets, f), 'utf8');
const files = fs.readdirSync(assets).filter((f) => f.endsWith('.js') && !/Worker-/.test(f));
// the game's own addItem (inventory.js), by its shape - the receipt hook stands at its first line
const addHome = files.find((f) => read(f).includes('AddItem() encountered a duplicate item'));
const addName = addHome && /function ([\w$]+)\([\w$]+,[\w$]+,[\w$]+=`back`\)\{let [\w$]+=[\w$]+\([\w$]+,[\w$]+\);return/.exec(read(addHome))?.[1];
const addAlias = addName && new RegExp(`[{,]${addName.replace(/\$/g, '\\$')} as ([\\w$]+)[,}]`).exec(read(addHome).slice(read(addHome).lastIndexOf('export{')))?.[1];
const entry = (addHome && files.find((f) => /^enhancedInventory-/.test(f) && read(f).includes(`./${addHome}`)))
  || files.find((f) => /^enhancedInventory-/.test(f) && read(f).includes('as mountEnhancedInventory'))
  || files.find((f) => /^enhancedInventory-/.test(f) && read(f).includes('globalThis.__pack='));
const mountName = entry && /pointerLockElement[\s\S]{0,120}?function ([\w$]+)\([\w$]+,[\w$]+=\{\}\)\{/.exec(read(entry))?.[1];
const mountAlias = entry && (read(entry).includes('as mountEnhancedInventory')
  ? 'mountEnhancedInventory'
  : (mountName && new RegExp(`[{,]${mountName.replace(/\$/g, '\\$')} as ([\\w$]+)[,}]`).exec(read(entry).slice(read(entry).lastIndexOf('export{')))?.[1]) || 'mountEnhancedInventory');
const sigilMod = files.find((f) => /^sigil-[\w-]+\.js$/.test(f) && read(f).includes('Works online only'.toLowerCase().replace('works', 'works')) || (/^sigil-[\w-]+\.js$/.test(f) && read(f).includes('numidium')));
const sigilSrc = sigilMod ? read(sigilMod) : '';
const sigilOnlineAlias = sigilMod && /([\w$]+) as u\b/.test(sigilSrc.slice(sigilSrc.lastIndexOf('export{'))) ? 'u' : null;
const sigilRenownAlias = sigilMod && /([\w$]+) as d\b/.test(sigilSrc.slice(sigilSrc.lastIndexOf('export{'))) ? 'd' : null;

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'dfo-pack-'));
const store = createLootStore(userData);
const ctx = { itemCards: true, inventory: true, nearbyLoot: false, dungeons: false, marks: false, fonts: false, ru: false };
const cache = new Map();
const page = (locale) => `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:#172029;height:100%;overflow:hidden}
/* Mirror competing native enhancedStyle rules that previously warped .bagbtn/.act and clipped .packbar .v */
.pack-shell .act{min-width:104px}
.pack-shell .packbar .bagbtn{align-self:center;margin:-6px 0 -6px 12px;min-height:32px;padding:0 12px;font-size:12px}
.pack-shell .packbar :is(.packcarry,.packgold)>:is(.k,.v){line-height:20px}
.pack-shell .packbar .packcarry .px-meter{width:60px;height:3px}
</style>
<script>window.__DFO_MOD_CFG__={itemCards:{enabled:true},inventory:{enabled:true},ru:{on:${locale === 'ru'}}};</script>
<script src="/dfo-mod/dfo_ui_text_data.js?${locale}"></script><script src="/dfo-mod/dfo_ui_text.js"></script>
${locale === 'ru' ? '<script src="/dfo-mod/ru_dict.js"></script><script src="/dfo-mod/ru_i18n.js"></script><script src="/dfo-mod/ru_items.js"></script>' : ''}
<script src="/dfo-mod/dfo_item_text_data.js?${locale}"></script><script src="/dfo-mod/dfo_item_text.js"></script><script src="/dfo-mod/dfo_item_cards.js"></script>
<script src="/dfo-mod/dfo_loot_rules.js"></script><script src="/dfo-mod/dfo_pack_data.js"></script><script src="/dfo-mod/dfo_pack_rules.js"></script><script src="/dfo-mod/dfo_pack.js"></script>
</head><body><div id="enhanced-inventory"></div><script type="module">
import {${mountAlias} as mountEnhancedInventory} from '/assets/${entry}';
import {${addAlias} as addItem} from '/assets/${addHome}';
${sigilMod && sigilOnlineAlias && sigilRenownAlias ? `import {${sigilOnlineAlias} as __dfoSetOnline, ${sigilRenownAlias} as __dfoSetRenown} from '/assets/${sigilMod}';` : ''}
const base={stackCount:1,currentCondition:100,maxCondition:100,flags:0,isIdentified:true};
const mk=(name,group,templateIndex,extra={})=>({...base,name,group,templateIndex,...extra});
const cases={
 sword:mk('Steel longsword','Weapons',120,{material:1,value:200}),
 rare:mk('Rare Mithril longsword','Weapons',120,{material:5,rarity:'rare',value:3425,affixes:[{id:'damage',value:19}]}),
 secret:mk('Secret sword','Weapons',120,{material:5,rarity:'magic',isIdentified:false,value:900,enchantments:[{type:0,param:0}]}),
 marked:mk('Junk dagger','Weapons',113,{material:0,value:20,junk:true}),
 stolen:mk('Stolen dagger','Weapons',113,{material:1,value:60,stolen:true}),
 cuirass:mk('Steel cuirass','Armor',102,{material:513,value:600}),
 shirt:mk('Long Shirt','WomensClothing',205,{material:0,value:12,dye:0}),
 robe:mk('Enchanted shirt','WomensClothing',205,{material:0,value:300,dye:2,enchantments:[{type:2,param:1}]}),
 potion:mk('Potion','UselessItems1',83,{value:50,potionRecipeKey:0}),
 flowers:mk('Red Flowers','PlantIngredients1',10,{value:4,stackCount:3}),
 ingot:mk('Iron Ingot','UselessItems2',620,{value:20}),
 meat:mk('Raw Meat','UselessItems2',538,{value:8}),
 mushroomA:mk('Mushroom','UselessItems2',1610,{value:20}),
 mushroomB:mk('Mushroom','UselessItems2',1610,{value:20}),
 clover:mk('Clover','PlantIngredients1',18,{value:5}),
 brass:mk('Brass','MetalIngredients',67,{value:8}),
 daggerA:mk('Holy Dagger','ReligiousItems',270,{value:30}),
 daggerB:mk('Holy Dagger','ReligiousItems',270,{value:30}),
 daggerC:mk('Holy Dagger','ReligiousItems',270,{value:30}),
 book:mk('Book','Books',277,{value:20,message:3}),
 letter:mk('Parchment','UselessItems2',279,{value:1,questItem:true,questUID:7,questSymbol:{name:'_letter_'}}),
 note:mk('Parchment','UselessItems2',279,{value:1}),
 spellbook:mk('Spellbook','MiscItems',132,{value:1}),
 ruby:mk('Ruby','Gems',0,{value:250}),
 ring:mk('Ring','Jewellery',135,{value:300,enchantments:[{type:2,param:3}]}),
 torch:mk('Torch','UselessItems2',247,{value:5}),
 bandage:mk('Bandage','UselessItems2',249,{value:4}),
};
const entity={isPlayer:true,name:'Pack check',level:12,stats:{strength:50,endurance:50,willpower:50,intelligence:50,agility:50,speed:50,personality:50,luck:50},skills:new Array(35).fill(40),items:Object.values(cases),goldPieces:14250,sGroupReputations:[18,25,12,44,-22],reactionMods:[0,0,0,0,0],biographyReactionMod:0,spells:[],activeEffects:[],health:100,maxHealth:100,magicka:20,maxMagicka:20,fatigue:200,maxFatigue:200};
const chest=[mk('Chest cuirass','Armor',102,{material:513,value:600}),mk('Chest bow','Weapons',130,{material:1,value:200})];
const host=document.getElementById('enhanced-inventory');
let view=null;
window.__dfoAurum={balance:95,open:true};
window.__dfoAurumReader={cached:()=>window.__dfoAurum,read:async()=>window.probe.aurumAsync?.()??window.__dfoAurum};
window.__dfoWorldStatus={afflictions:()=>window.probe.afflictions,needs:()=>window.probe.needs};
const mount=(withChest)=>{view?.unmount?.();view=mountEnhancedInventory(host,{entity,items:()=>entity.items,getQuest:()=>null,owner:{done:false},nowMinute:()=>window.probe.nowMinute,marks:()=>window.probe.marks,...(withChest?{loot:{items:()=>chest,title:'Chest',storage:true}}:{})});return view;};
const toggleExtras=({bag=false,wagon=false}={})=>{const list=entity.items.filter(it=>!it._probeExtra);if(bag)list.push(mk('Materials Bag','UselessItems2',600,{_probeExtra:true}));if(wagon)list.push(mk('Small Cart','Transportation',93,{_probeExtra:true}));entity.items.splice(0,entity.items.length,...list);};
window.probe={cases,entity,chest,mount,addItem,repaint:()=>view.repaint(),view:()=>view,mk,marks:380,emptyCurrentRegionName:false,refreshMarks:null,aurumAsync:null,nowMinute:735120,serverMinute:735120,regionRep:32,villainy:null,inside:{building:{buildingType:15,factionId:0}},afflictions:[],needs:[],setSigilOnline(renown=40){if(typeof __dfoSetOnline==='function'&&typeof __dfoSetRenown==='function'){if(renown==null){__dfoSetOnline(false);}else{__dfoSetOnline(true);__dfoSetRenown(renown);}view?.repaint?.();}},setEnv(patch={}){if('marks'in patch)window.probe.marks=patch.marks;if('aurum'in patch)window.__dfoAurum=patch.aurum==null?null:{balance:patch.aurum,open:true};if('emptyCurrentRegionName'in patch)window.probe.emptyCurrentRegionName=!!patch.emptyCurrentRegionName;if('nowMinute'in patch)window.probe.nowMinute=patch.nowMinute;if('serverMinute'in patch)window.probe.serverMinute=patch.serverMinute;if('regionRep'in patch)window.probe.regionRep=patch.regionRep;if('villainy'in patch)window.probe.villainy=patch.villainy;if('inside'in patch)window.probe.inside=patch.inside;if('afflictions'in patch)window.probe.afflictions=patch.afflictions;if('needs'in patch)window.probe.needs=patch.needs;if('bag'in patch||'wagon'in patch)toggleExtras({bag:!!patch.bag,wagon:!!patch.wagon});view?.repaint?.();}};
window.__dfoPackWorld={marks:()=>window.probe.marks,refreshMarks:()=>window.probe.refreshMarks?.(),clocks:()=>({own:window.probe.nowMinute,sky:window.probe.serverMinute,world:window.probe.serverMinute,online:window.probe.serverMinute!==window.probe.nowMinute}),regionName:(id)=>({17:${JSON.stringify(locale === 'ru' ? 'Даггерфолл' : 'Daggerfall')},23:${JSON.stringify(locale === 'ru' ? 'Вэйрест' : 'Wayrest')}}[id]||''),villainy:()=>window.probe.villainy,factions:()=>new Map([[11,{id:11,name:${JSON.stringify(locale === 'ru' ? 'Гильдия Магов' : 'Mages Guild')},rep:48}],[40,{id:40,name:${JSON.stringify(locale === 'ru' ? 'Храм Кинарет' : 'Temple of Kynareth')},rep:26}]]),questWorld:{currentRegionIndex:()=>17,currentRegionName:()=>window.probe.emptyCurrentRegionName?'':${JSON.stringify(locale === 'ru' ? 'Даггерфолл' : 'Daggerfall')},legalRepNow:()=>window.probe.regionRep,playerInside:()=>window.probe.inside}};
mount(false);
window.ready=true;
</script></body></html>`;

const send = (res, type, body) => { res.setHeader('Content-Type', type); res.end(body); };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const locale = url.searchParams.has('ru') || (req.headers.referer || '').includes('?ru') ? 'ru' : 'en';
    if (url.pathname === '/') return send(res, 'text/html;charset=utf-8', page(locale));
    if (url.pathname === '/dfo-mod/pack-settings') {
      if (req.method === 'GET') return send(res, 'application/json', JSON.stringify(store.packState()));
      let body = ''; for await (const chunk of req) body += chunk;
      try { return send(res, 'application/json', JSON.stringify(store.savePack(JSON.parse(body)))); }
      catch (e) { res.statusCode = e.status || 500; return send(res, 'application/json', JSON.stringify({ error: e.message, code: e.message })); }
    }
    if (url.pathname === '/dfo-mod/dfo_ui_text_data.js') return send(res, 'text/javascript', itemText.uiBundle(url.search.includes('ru') ? 'ru' : 'en'));
    if (url.pathname === '/dfo-mod/dfo_item_text_data.js') return send(res, 'text/javascript', itemText.bundle(url.search.includes('ru') ? 'ru' : 'en'));
    if (url.pathname === '/dfo-mod/ru_dict.js') return send(res, 'text/javascript', buildDict(path.join(root, 'data/ru')));
    if (url.pathname === '/dfo-mod/ru_i18n.js') return send(res, 'text/javascript', buildI18n(path.join(root, 'data/ru')));
    const font = /^\/dfo-mod\/(?:fonts\/)?([\w.-]+\.(?:ttf|otf))$/.exec(url.pathname);
    if (font) return send(res, 'font/' + font[1].split('.').pop(), fs.readFileSync(path.join(mod, 'fonts', font[1])));
    const own = /^\/dfo-mod\/([\w.]+\.js)$/.exec(url.pathname);
    if (own) return send(res, 'text/javascript', fs.readFileSync(path.join(mod, 'page', own[1])));
    const file = path.resolve(build, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(build + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    if (!file.endsWith('.js')) return send(res, 'application/octet-stream', fs.readFileSync(file));
    if (!cache.has(file)) cache.set(file, transformAsset(url.pathname.slice(1), fs.readFileSync(file, 'utf8'), ctx));
    return send(res, 'text/javascript', cache.get(file).text);
  } catch (e) { if (process.env.DFO_STAND_DEBUG) console.error('stand', req.url, e); res.writeHead(500); res.end(String(e?.stack || e)); }
});

async function main() {
  assert.ok(entry, 'the published enhanced inventory');
  assert.ok(addAlias, 'the game\'s own addItem, exported');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ ...(process.env.CHROMIUM_BIN ? { executablePath: process.env.CHROMIUM_BIN } : {}) });
  const shots = process.env.DFO_SCREENSHOT_DIR, errors = [];
  try {
    for (const locale of ['en', 'ru']) {
      const T = (key, params) => say(key, params, locale);
      const tab = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      tab.on('pageerror', (e) => errors.push(`${locale}: ${e.stack || e}`));
      await tab.goto(`http://127.0.0.1:${server.address().port}/${locale === 'ru' ? '?ru' : ''}`, { waitUntil: 'domcontentloaded' });
      await tab.waitForFunction(() => window.ready && window.__dfoPack);
      await tab.evaluate(() => window.__dfoPack.load());
      await tab.evaluate(async () => { await Promise.all(['DFO Greengoth', 'DFO Flexi', 'DFO Gabin'].map((f) => document.fonts.load('16px "' + f + '"'))); });
      // every hook found its place in this build
      const hooks = [...cache.values()].flatMap((r) => r.log).filter(([id]) => id.startsWith('inventory.') && id !== 'inventory.icons');
      assert.deepEqual([...new Set(hooks.filter(([, n]) => n > 0).map(([id]) => id))].sort(), ['inventory.aurum', 'inventory.lifecycle', 'inventory.nativeLock', 'inventory.pages', 'inventory.receipt', 'inventory.shop', 'inventory.status', 'inventory.view'], locale + ': the expected chunk hooks');
      assert.equal(hooks.filter(([id]) => id.includes('!error')).length, 0, locale + ': no hook errors');

      const pages = async () => tab.evaluate(() => {
        const out = {};
        const tabs = [...document.querySelectorAll('.pack-dock .packtab')];
        for (const b of tabs) {
          b.click();
          const id = [...document.querySelectorAll('.pack-dock .packtab')].indexOf(document.querySelector('.pack-dock .packtab.on'));
          const rows = [...document.querySelectorAll('.pack-dock .packcol .itemrow')];
          const name = Object.entries(window.probe.cases);
          out[id] = rows.map((r) => ({ id: name.find(([, it]) => it === r._padItem)?.[0] ?? '?', stack: r.dataset.dfoStack ?? null, text: r.querySelector('.itemname > span')?.textContent ?? '', x: Math.round(r.getBoundingClientRect().x), w: Math.round(r.getBoundingClientRect().width), h: Math.round(r.getBoundingClientRect().height), dressed: r.classList.contains('dfo-item-row') }));
        }
        return { out, labels: [...document.querySelectorAll('.pack-dock .packtab')].map((b) => b.firstChild.textContent) };
      });
      const PAGE = ['weapons', 'armor', 'clothing', 'potions', 'ingredients', 'books', 'valuables', 'misc', 'junk'];
      let seen = await pages();
      assert.equal(seen.labels.length, 9, locale + ': nine pages');
      assert.equal(seen.labels[8], T('pack.page.junk'), locale + ': Junk last');
      assert.ok(!seen.labels.some((w) => /^(Magic|Магия)$/.test(w)), locale + ': no Magic page');
      const on = (p) => seen.out[PAGE.indexOf(p)].map((r) => r.id);
      assert.deepEqual(on('weapons').sort(), ['rare', 'secret', 'stolen', 'sword'].sort(), locale + ': weapons, the enchanted one too');
      assert.equal(on('weapons')[0], 'rare', locale + ': sorted by quality on open');
      assert.deepEqual(on('armor'), ['cuirass']);
      assert.deepEqual(on('clothing').sort(), ['robe', 'shirt'], locale + ': an enchanted shirt is clothing');
      assert.deepEqual(on('potions'), ['potion']);
      assert.deepEqual(on('ingredients').sort(), ['flowers', 'ingot', 'meat', 'mushroomA'].sort(), locale + ': only what recipes spend');
      assert.deepEqual(on('books').sort(), ['book', 'letter', 'note', 'spellbook'].sort(), locale + ': notes, letters and the spellbook with the books');
      assert.deepEqual(on('valuables').sort(), ['ring', 'ruby'], locale + ': the enchanted ring is a valuable');
      assert.deepEqual(on('misc').sort(), ['bandage', 'torch']);
      assert.deepEqual(on('junk').sort(), ['brass', 'clover', 'daggerA', 'marked'].sort(), locale + ': Junk by default - the things to sell and the marked junk');
      const mush = seen.out[PAGE.indexOf('ingredients')].find((r) => r.id === 'mushroomA');
      assert.equal(mush.stack, '2', locale + ': the two Mushrooms in one cell');
      assert.match(mush.text, /×2$/, locale + ': the cell says its count');
      assert.equal(seen.out[PAGE.indexOf('junk')].find((r) => r.id === 'daggerA').stack, '3', locale + ': three Holy Daggers in one cell');
      assert.equal(seen.out[PAGE.indexOf('weapons')].length, 4, locale + ': weapons are never stacked by surrogate');

      // ALONE: the window wide, two columns of dressed rows, header clusters, one height for the virtual list
      const geo = async () => tab.evaluate(() => {
        const box = (s) => { const n = document.querySelector(s); if (!n) return null; const b = n.getBoundingClientRect(); return { x: Math.round(b.x), w: Math.round(b.width), h: Math.round(b.height) }; };
        const boxes = (s) => [...document.querySelectorAll(s)].map((n) => {
          const b = n.getBoundingClientRect();
          return { text: n.textContent, x: Math.round(b.x), w: Math.round(b.width), h: Math.round(b.height), clip: n.scrollWidth > n.clientWidth + 1 };
        });
        const head = document.querySelector('.pack-id');
        const flow = [...(head?.children ?? [])]
          .filter((n) => n.classList.contains('dfo-pack-sep') || n.classList.contains('dfo-pack-cluster'))
          .map((n) => {
            const b = n.getBoundingClientRect();
            return { isSep: n.classList.contains('dfo-pack-sep'), cls: n.className, x: Math.round(b.x), w: Math.round(b.width) };
          });
        let closeNatW = 0;
        const closeEl = document.querySelector('.pack-id .dfo-close-btn');
        if (closeEl && head) {
          const clone = closeEl.cloneNode(true);
          clone.classList.remove('dfo-close-btn');
          clone.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;';
          head.appendChild(clone);
          closeNatW = Math.round(clone.getBoundingClientRect().width);
          clone.remove();
        }
        const cssOf = (s) => {
          const n = document.querySelector(s);
          if (!n) return null;
          const st = getComputedStyle(n);
          return { bg: st.backgroundImage, color: st.color, display: st.display };
        };
        return {
          win: box('.pack-win'), dock: box('.pack-dock'), paired: !!document.querySelector('.pack-shell.paired'), view: document.documentElement.dataset.dfoPackView,
          buttons: [...document.querySelectorAll('.pack-id .act')].map((b) => b.textContent),
          clusters: document.querySelectorAll('.pack-id .dfo-pack-cluster').length,
          codex: box('.c-codex'), viewC: box('.c-view'), salvage: box('.c-salvage'), tools: box('.c-tools'), closeC: box('.c-close'),
          viewBtns: boxes('.c-view .act'), toolsBtns: boxes('.c-tools .act'),
          toolsSortBox: box('.c-tools .dfo-sort-btn'), toolsSplitBox: box('.c-tools .dfo-junk-split'),
          closeBtn: box('.pack-id .dfo-close-btn'), closeNatW,
          flow,
          salvageStyle: cssOf('.pack-id .dfo-salvage-btn'),
          closeStyle: cssOf('.pack-id .dfo-close-btn'),
          sortStyle: cssOf('.pack-id .dfo-sort-btn'),
          dollStyle: cssOf('.pack-id .dolltoggle'),
          nativeSortCount: document.querySelectorAll('.pack-id .sortbtn').length,
          headH: box('.pack-id').h
        };
      });
      await tab.evaluate(() => document.querySelectorAll('.pack-dock .packtab')[0].click());
      let g = await geo();
      assert.equal(g.paired, false); assert.equal(g.view, 'rows');
      assert.ok(g.win.w >= 1300, `${locale}: the window widens alone (${g.win.w})`);
      assert.ok(g.dock.w >= 660, `${locale}: the dock holds two columns (${g.dock.w})`);
      for (const k of ['pack.view.rows', 'pack.charcol.v2', 'pack.sort.button', 'pack.junk.button']) assert.ok(g.buttons.includes(T(k)), `${locale}: header button ${T(k)}`);
      assert.ok(!g.buttons.some((b) => /auto.?sort|автосорт|manual.?sort|^sort$|^сортиров/i.test(b)), `${locale}: no Auto-sort or Sort button in header`);
      assert.equal(g.nativeSortCount, 0, `${locale}: native manual Sort button removed`);
      assert.equal(g.clusters, 5, `${locale}: five header clusters rendered`);
      assert.ok(g.codex.x < g.viewC.x && g.viewC.x < g.salvage.x && g.salvage.x < g.tools.x && g.tools.x < g.closeC.x, `${locale}: clusters ordered RTL 1..5`);
      assert.deepEqual(g.flow.map((f) => f.cls), [
        'dfo-pack-sep is-edge-left',
        'dfo-pack-cluster c-codex',
        'dfo-pack-sep is-codex-right',
        'dfo-pack-sep is-view-left',
        'dfo-pack-cluster c-view',
        'dfo-pack-sep',
        'dfo-pack-cluster c-salvage',
        'dfo-pack-sep',
        'dfo-pack-cluster c-tools',
        'dfo-pack-sep gap-close',
        'dfo-pack-cluster c-close',
        'dfo-pack-sep is-edge-right',
      ], `${locale}: Codex framed on both sides, View has own left divider, single dividers elsewhere`);
      const codexSepR = g.flow[2], viewSepL = g.flow[3];
      const codexToSep = codexSepR.x - (g.codex.x + g.codex.w);
      const sepToView = g.viewC.x - (viewSepL.x + viewSepL.w);
      const betweenSeps = viewSepL.x - (codexSepR.x + codexSepR.w);
      const closeGap = g.closeC.x - (g.tools.x + g.tools.w);
      assert.ok(codexToSep >= 7 && codexToSep <= 11, `${locale}: Codex right divider at standard distance (${codexToSep}px)`);
      assert.ok(sepToView >= 7 && sepToView <= 11, `${locale}: View left divider at standard distance (${sepToView}px)`);
      assert.ok(betweenSeps >= 96 && betweenSeps <= 104, `${locale}: 100px empty gap between Codex and View dividers (${betweenSeps}px)`);
      assert.ok(closeGap >= 26 && closeGap <= 36, `${locale}: ~30px gap before Close (${closeGap}px)`);
      assert.equal(g.viewBtns.length, 2);
      assert.ok(Math.abs(g.viewBtns[0].h - g.viewBtns[1].h) <= 1, `${locale}: view/charcol toggle buttons equal height`);
      assert.equal(g.toolsBtns.length, 3);
      assert.ok(Math.abs(g.toolsSortBox.w - g.toolsSplitBox.w) <= 1 && Math.abs(g.toolsSortBox.h - g.toolsSplitBox.h) <= 1, `${locale}: Sort Settings and Junk/Find split columns equal size`);
      assert.ok(g.toolsBtns.every((b) => Math.abs(b.h - g.toolsBtns[0].h) <= 1), `${locale}: Sort Settings, Junk and Find buttons equal height`);
      assert.ok([...g.viewBtns, ...g.toolsBtns].every((b) => !b.clip), `${locale}: header cluster buttons do not clip text`);
      const closeRatio = g.closeBtn.w / g.closeNatW;
      assert.ok(closeRatio >= 1.16 && closeRatio <= 1.32, `${locale}: Close button ~20% wider (${g.closeBtn.w} vs ${g.closeNatW}, x${closeRatio.toFixed(2)})`);
      assert.notEqual(g.salvageStyle.bg, g.sortStyle.bg, `${locale}: Salvage uses distinct background pattern`);
      assert.notEqual(g.closeStyle.bg, g.sortStyle.bg, `${locale}: Close uses distinct background pattern`);
      assert.notEqual(g.salvageStyle.bg, g.closeStyle.bg, `${locale}: Salvage and Close patterns differ`);
      if (g.dollStyle) assert.equal(g.dollStyle.display, 'none', `${locale}: dolltoggle hidden on desktop`);
      assert.ok(g.viewBtns[0].h <= 48 && g.toolsBtns[0].h <= 48, `${locale}: header buttons stay single-line height (${g.viewBtns[0].h}px / ${g.toolsBtns[0].h}px)`);
      assert.ok(g.headH <= 64, `${locale}: header bar stays single-line (${g.headH}px)`);
      seen = await pages();
      const weapons = seen.out[0];
      assert.equal(new Set(weapons.map((r) => r.x)).size, 2, locale + ': two columns of rows alone');
      assert.ok(weapons.every((r) => r.dressed), locale + ': the rows in the card\'s dress');
      const heights = new Set(Object.values(seen.out).flat().map((r) => r.h));
      assert.equal(heights.size, 1, `${locale}: every row the one height (${[...heights]})`);
      if (shots) { fs.mkdirSync(shots, { recursive: true }); await tab.evaluate(() => document.querySelectorAll('.pack-dock .packtab')[0].click()); await tab.screenshot({ path: path.join(shots, `pack-alone-rows-${locale}.png`) }); }

      // THE ICON VIEW: the same window, the native plates filling the field
      await tab.locator('.c-view .dfo-view-btn').click();
      const g2 = await geo();
      assert.equal(g2.view, 'grid');
      assert.equal(g2.win.w, g.win.w, locale + ': the icon view keeps the window');
      const plates = await tab.evaluate(() => [...document.querySelectorAll('.pack-dock .packcol .itemrow')].map((r) => { const b = r.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), y: Math.round(b.y) }; }));
      assert.ok(plates.every((p) => p.w === 64 && p.h === 64), locale + ': the native plates');
      assert.equal(new Set(plates.map((p) => p.y)).size, 1, locale + ': four plates on one line of the wide dock');
      await tab.evaluate(() => [...document.querySelectorAll('.pack-dock .packtab')][8].click());
      assert.equal(await tab.evaluate(() => document.querySelector('.pack-dock .itemrow[data-dfo-stack="3"] > .count')?.textContent), '3', locale + ': the icon says the surrogate count');
      if (shots) await tab.screenshot({ path: path.join(shots, `pack-alone-grid-${locale}.png`) });
      await tab.locator('.c-view .dfo-view-btn').click();
      await tab.waitForFunction(() => document.documentElement.dataset.dfoPackView === 'rows');
      assert.equal(store.packState().view, 'rows', locale + ': the view kept in the mod\'s cache');

      // THE SORT SETTINGS & PERMANENT AUTO-SORT: never in the background; always active on an act; 5 profiles
      const order = () => tab.evaluate(() => window.probe.entity.items.filter((it) => it.group === 'Weapons').map((it) => Object.entries(window.probe.cases).find(([, c]) => c === it)[0]));
      await tab.evaluate(() => { const items = window.probe.entity.items; const i = items.indexOf(window.probe.cases.rare); items.push(items.splice(i, 1)[0]); window.probe.repaint(); });
      assert.equal((await order()).at(-1), 'rare', locale + ': a background repaint does not sort');
      await tab.evaluate(() => { document.querySelector('.pack-win').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); window.probe.repaint(); });
      assert.equal((await order())[0], 'rare', locale + ': an act in the pack sorts');

      await tab.getByRole('button', { name: T('pack.sort.button'), exact: true }).click();
      const sortDialog = tab.locator('dialog.dfo-pack-sort-dialog');
      await sortDialog.waitFor();
      const sortModes = await sortDialog.locator('[data-sort-mode]').evaluateAll((els) => els.map((e) => ({ mode: e.dataset.sortMode, checked: e.getAttribute('aria-checked') })));
      assert.deepEqual(sortModes.map((m) => m.mode), ['rarity', 'type', 'material', 'name', 'count'], locale + ': all 5 sort profiles shown');
      assert.equal(sortModes[0].checked, 'true', locale + ': rarity active by default');
      if (shots) await tab.screenshot({ path: path.join(shots, `pack-sort-${locale}.png`) });
      for (const mode of ['name', 'type', 'material', 'count']) {
        await sortDialog.locator(`[data-sort-mode="${mode}"]`).click();
        await tab.waitForFunction((m) => window.__dfoPack.settings().sortMode === m, mode);
        assert.equal(store.packState().sortMode, mode, `${locale}: sortMode ${mode} persisted`);
        assert.equal(store.packState().autoSort, true, `${locale}: autoSort always remains active`);
      }
      await sortDialog.locator('[data-sort-mode="rarity"]').click();
      await tab.waitForFunction(() => window.__dfoPack.settings().sortMode === 'rarity');
      await sortDialog.getByRole('button', { name: T('pack.sort.done'), exact: true }).click();
      await tab.evaluate(() => { const items = window.probe.entity.items; const i = items.indexOf(window.probe.cases.rare); items.push(items.splice(i, 1)[0]); document.querySelector('.pack-win').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); window.probe.repaint(); });
      assert.equal((await order())[0], 'rare', locale + ': permanent auto-sort sorts immediately after act');

      // HORIZONTAL BOTTOM STATUS BAR: 4 panels RTL, no .packitems, vertical date/health + hover "i" tooltip, wagon/bag actions
      const barInfo = () => tab.evaluate(() => {
        const box = (s) => { const n = document.querySelector(s); if (!n) return null; const r = n.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), overflowX: n.scrollWidth > n.clientWidth + 1 }; };
        const panels = [...document.querySelectorAll('.dfo-pack-foot > .dfo-bar-panel')].map((p) => p.className);
        return {
          itemsBadgeCount: document.querySelectorAll('.packitems').length,
          panels,
          boxes: { status: box('.z-status'), rep: box('.z-rep'), curr: box('.z-curr'), carry: box('.z-carry'), date: box('.z-status .dfo-date-row'), pills: box('.z-status .dfo-state-pills'), carryCard: box('.z-carry .packcarry'), meter: box('.z-carry .px-meter'), regTxt: box('.z-rep .is-region .dfo-rep-txt'), locTxt: box('.z-rep .is-local .dfo-rep-txt') },
          gold: document.querySelector('.dfo-curr-chip.is-gold .v')?.textContent ?? '',
          silver: document.querySelector('.dfo-curr-chip.is-silver .v')?.textContent ?? '',
          aurum: document.querySelector('.dfo-curr-chip.is-aurum .v')?.textContent ?? '',
          regRep: document.querySelector('.dfo-rep-line.is-region')?.textContent ?? '',
          locRep: document.querySelector('.dfo-rep-line.is-local')?.textContent ?? '',
          date: document.querySelector('.dfo-date-txt')?.textContent ?? '',
          dateL1: document.querySelector('.dfo-date-l1')?.textContent ?? '',
          dateL2: document.querySelector('.dfo-date-l2')?.textContent ?? '',
          pills: [...document.querySelectorAll('.dfo-state-pills .dfo-chip')].map((p) => p.textContent),
          goldBtnInCurr: document.querySelector('.z-curr .goldbtn')?.textContent ?? null,
          goldBtnInCarry: document.querySelector('.z-carry .goldbtn')?.textContent ?? null,
          bagBtnInCarry: document.querySelector('.z-carry .bagbtn')?.textContent ?? null,
          carryMetrics: (() => {
            const p = document.querySelector('.z-carry');
            const bag = p?.querySelector('.bagbtn');
            const ico = p?.querySelector('.dfo-carry-icon');
            const val = p?.querySelector('.packcarry .v');
            const fill = p?.querySelector('.px-fill');
            if (!p) return null;
            const pr = p.getBoundingClientRect();
            const br = bag?.getBoundingClientRect();
            const ir = ico?.getBoundingClientRect();
            const vr = val?.getBoundingClientRect();
            const cs = fill ? getComputedStyle(fill) : null;
            return {
              bagInsidePanel: br ? (br.left >= pr.left + 1 && br.right <= pr.right - 1 && br.top >= pr.top + 1 && br.bottom <= pr.bottom - 1) : true,
              iconToValGap: ir && vr ? Math.round(vr.left - ir.right) : 999,
              fillColor: cs?.backgroundColor ?? '',
              fillImage: cs?.backgroundImage ?? '',
            };
          })(),
          verticalClipBugs: [...document.querySelectorAll('.dfo-pack-foot :is(.dfo-curr-chip .v, .dfo-date-l1, .dfo-date-l2, .dfo-rep-txt, .dfo-vil-v, .packcarry .v)')].map((n) => {
            const r = n.getBoundingClientRect();
            const cs = getComputedStyle(n);
            const fs = parseFloat(cs.fontSize) || 12;
            const clipped = cs.overflowY === 'hidden' && n.scrollHeight > n.clientHeight + 2;
            const tooShort = r.height > 0 && r.height < fs * 1.15;
            return clipped || tooShort ? { cls: n.className, h: r.height, sh: n.scrollHeight, ch: n.clientHeight, fs, ovY: cs.overflowY } : null;
          }).filter(Boolean),
        };
      });
      await tab.evaluate(() => window.probe.setEnv({ bag: true, wagon: false }));
      let bar = await barInfo();
      assert.equal(bar.itemsBadgeCount, 0, `${locale}: no .packitems badge in footer`);
      assert.deepEqual(bar.panels, ['dfo-bar-panel z-status', 'dfo-bar-panel z-rep', 'dfo-bar-panel z-curr', 'dfo-bar-panel z-carry'], `${locale}: 4 panels in LTR DOM (= RTL layout order)`);
      assert.ok(bar.boxes.status.x < bar.boxes.rep.x && bar.boxes.rep.x < bar.boxes.curr.x && bar.boxes.curr.x < bar.boxes.carry.x, `${locale}: panels strictly ordered visually left-to-right (RTL specification)`);
      assert.ok(bar.boxes.date.y < bar.boxes.pills.y, `${locale}: date stacked vertically above health pills`);
      assert.ok(bar.boxes.rep.w >= 245 && !bar.boxes.regTxt.overflowX && !bar.boxes.locTxt.overflowX, `${locale}: reputation box wide enough with zero text ellipsis (${JSON.stringify(bar.boxes.rep)})`);
      assert.ok(bar.boxes.carryCard.w >= 170 && bar.boxes.meter.w >= 140, `${locale}: carry weight plaque is wide and prominent`);
      assert.ok(bar.boxes.meter.h >= 10 && bar.boxes.meter.h <= 18, `${locale}: carry weight meter keeps crisp bar height (${bar.boxes.meter.h}px, no column-flex stretch)`);
      assert.equal(bar.carryMetrics?.bagInsidePanel, true, `${locale}: Materials Bag button stays strictly inside .z-carry borders (no native margin protrusion)`);
      assert.ok((bar.carryMetrics?.iconToValGap ?? 999) <= 14, `${locale}: weight icon sits right beside weight digits (gap=${bar.carryMetrics?.iconToValGap}px)`);
      assert.ok(!/90deg/.test(bar.carryMetrics?.fillImage || ''), `${locale}: carry weight bar uses solid monotone fill rather than 90deg multi-stop gradient`);
      assert.deepEqual(bar.verticalClipBugs, [], `${locale}: zero vertical ascender clipping bugs in footer (${JSON.stringify(bar.verticalClipBugs)})`);
      assert.equal(bar.goldBtnInCurr, T('pack.bar.dropGold'), `${locale}: Drop gold in currencies panel`);
      assert.equal(bar.goldBtnInCarry, null, `${locale}: no Drop gold in carry panel on ground`);
      assert.equal(bar.bagBtnInCarry, T('pack.bar.bag.open'), `${locale}: Materials Bag button in rightmost carry panel`);
      assert.ok(bar.gold.includes('14') && bar.silver.includes('380') && bar.aurum.includes('95'), `${locale}: currencies rendered (${JSON.stringify(bar)})`);
      assert.ok(bar.regRep.includes(locale === 'ru' ? 'Даггерфолл' : 'Daggerfall'), `${locale}: region rep always shown`);
      // Even when upstream currentRegionName() is empty, world.regionName(idx) fills the real region name on line 1
      await tab.evaluate(() => window.probe.setEnv({ emptyCurrentRegionName: true }));
      bar = await barInfo();
      assert.ok(bar.regRep.includes(locale === 'ru' ? 'Даггерфолл' : 'Daggerfall'), `${locale}: fallback world.regionName fills line 1 when currentRegionName is empty (${bar.regRep})`);
      await tab.evaluate(() => window.probe.setEnv({ emptyCurrentRegionName: false }));
      bar = await barInfo();
      assert.ok(bar.locRep.includes(T('pack.rep.group.commoners')), `${locale}: tavern shows commoners`);
      assert.ok(bar.dateL1.includes('12:00') && (locale === 'ru' ? /Сандас|Морндас|Тирдас|Миддас|Турдас|Фредас|Лоредас/.test(bar.dateL1) : /Sundas|Morndas|Tirdas|Middas|Turdas|Fredas|Loredas/.test(bar.dateL1)), `${locale}: date line 1 shows day, weekday and HH:MM (${bar.dateL1})`);
      assert.ok(bar.dateL2.includes(locale === 'ru' ? '3Э 405' : '3E 405') && bar.dateL2.length > 8, `${locale}: date line 2 shows month name, era and year (${bar.dateL2})`);
      assert.ok(bar.pills.includes(T('pack.state.healthy')), `${locale}: healthy state pill`);

      await tab.evaluate(() => window.probe.setEnv({ inside: { building: { buildingType: 16, factionId: 0 } } }));
      bar = await barInfo();
      assert.ok(bar.locRep.includes(T('pack.rep.group.nobility')), `${locale}: palace switches to nobility`);

      await tab.evaluate(() => window.probe.setEnv({ inside: { building: { buildingType: 11, factionId: 11 } } }));
      bar = await barInfo();
      assert.ok(bar.locRep.includes(locale === 'ru' ? 'Гильдия Магов' : 'Mages Guild'), `${locale}: guild hall shows guild reputation`);

      await tab.evaluate(() => window.probe.setEnv({
        serverMinute: 780480 + 18 * 60 + 45, // shifted world/sky server clock (+32d, exact 18:45 since 542*1440 = 780480)
        inside: { dungeon: {} },
        afflictions: [{ key: 'disease:1' }],
        needs: [{ key: 'hunger', tier: 2, text: 'Hungry', level: 'warn' }],
      }));
      bar = await barInfo();
      assert.ok(bar.locRep.includes(T('pack.rep.group.underworld')), `${locale}: dungeon shows underworld reputation`);
      assert.ok(bar.pills.some((t) => t.includes(T('pack.disease.1'))), `${locale}: diseased plague chip shown`);
      assert.ok(bar.pills.includes(T('pack.state.need.hunger.2')), `${locale}: hunger need chip shown`);
      assert.ok(bar.dateL1.includes('12:00'), `${locale}: bottom status date strictly follows local player clock (12:00), not shifted server clock (${bar.dateL1})`);
      if (shots) await tab.screenshot({ path: path.join(shots, `pack-status-bar-${locale}.png`) });

      // HOVER TOOLTIP: hovering z-status keeps primary status aligned to player local time + shows separate Local, Server, and Explanation blocks
      await tab.locator('.z-status').hover();
      const statusTip = tab.locator('.dfo-status-tip');
      await statusTip.waitFor({ state: 'visible' });
      const statusMeta = await tab.evaluate(() => {
        const tip = document.querySelector('.dfo-status-tip');
        if (!tip) return null;
        const cards = [...tip.querySelectorAll('.dfo-st-card')];
        const info = tip.querySelector('.dfo-st-info');
        const lines = [...tip.querySelectorAll('.dfo-st-line')].map((n) => n.textContent);
        const overflowCard = cards.some((c) => c.scrollWidth > c.clientWidth + 2);
        return { text: tip.textContent, cards: cards.map((c) => ({ cls: c.className, text: c.textContent })), info: info?.textContent ?? '', lines, overflowCard };
      });
      assert.ok(statusMeta && statusMeta.text.includes(T('pack.statusTip.title')) && statusMeta.text.includes(locale === 'ru' ? 'Даггерфолл' : 'Daggerfall') && statusMeta.text.includes(T('pack.disease.1')), `${locale}: hover status tooltip duplicates character status`);
      assert.ok(statusMeta.lines.some((l) => l.includes('12:00')) && !statusMeta.lines.some((l) => l.includes('18:45')), `${locale}: status tooltip date/time line matches player local clock (12:00), not server clock (18:45)`);
      assert.equal(statusMeta.cards.length, 2, `${locale}: status tooltip renders separate Local & Server clock blocks`);
      assert.ok(statusMeta.cards[0].cls.includes('is-local') && statusMeta.cards[0].text.includes(T('pack.statusTip.clock.local')) && statusMeta.cards[0].text.includes('12:00'), `${locale}: Local clock card matches player clock`);
      assert.ok(statusMeta.cards[1].cls.includes('is-server') && statusMeta.cards[1].text.includes(T('pack.statusTip.clock.server')) && statusMeta.cards[1].text.includes('18:45'), `${locale}: Server clock card displays world server clock`);
      assert.ok(statusMeta.info.includes(T('pack.statusTip.clock.why')) && statusMeta.info.includes(T('pack.statusTip.clock.note')), `${locale}: Explanation panel explains why local & server time differ`);
      assert.equal(statusMeta.overflowCard, false, `${locale}: clock cards fit without horizontal overflow`);
      if (shots) await tab.screenshot({ path: path.join(shots, `pack-status-tooltip-${locale}.png`) });
      await tab.mouse.move(10, 10);
      await statusTip.waitFor({ state: 'detached' });
      await tab.evaluate(() => window.probe.setEnv({ serverMinute: 735120 }));

      // WAGON CONTAINER VIEW: Materials Bag + Stow Gold inside carry panel
      await tab.evaluate(() => { window.probe.setEnv({ bag: true, wagon: true, inside: { building: { buildingType: 15, factionId: 0 } }, afflictions: [], needs: [] }); window.probe.mount(true); });
      const wagonBtn = tab.locator('.loot-win .remoteacts button', { hasText: /Wagon|Телега/i });
      assert.equal(await wagonBtn.count(), 1, `${locale}: Wagon button present in remote actions`);
      await wagonBtn.click();
      bar = await barInfo();
      assert.equal(bar.goldBtnInCarry, T('pack.bar.stowGold'), `${locale}: wagon Stow gold moves into carry panel next to bag`);
      assert.equal(bar.goldBtnInCurr, null, `${locale}: no gold button in currencies panel while stowing in wagon`);
      assert.equal(bar.bagBtnInCarry, T('pack.bar.bag.open'), `${locale}: Materials Bag stays inside carry panel during wagon view`);
      if (shots) await tab.screenshot({ path: path.join(shots, `pack-wagon-bar-${locale}.png`) });
      await tab.evaluate(() => { window.probe.mount(false); window.probe.setEnv({ bag: false, wagon: false, inside: { building: { buildingType: 15, factionId: 0 } }, afflictions: [], needs: [] }); });

      // THE JUNK WINDOW: ANY ticked tag; kept in the mod's cache; Defaults restores the rule
      await tab.getByRole('button', { name: T('pack.junk.button'), exact: true }).click();
      const dialog = tab.locator('dialog.dfo-pack-dialog');
      await dialog.waitFor();
      assert.equal(await dialog.locator('input[data-tag="use:sale"]').isChecked(), true, locale + ': for sale ticked by default');
      if (shots) await tab.screenshot({ path: path.join(shots, `pack-junk-${locale}.png`) });
      await dialog.locator('input[data-tag="use:sale"]').uncheck();
      await dialog.locator('input[type="search"]').fill(say('lootRules.state.stolen', null, locale));
      await dialog.locator('input[data-tag="state:stolen"]').check();
      await tab.waitForFunction(() => window.__dfoPack.settings().junk.tags.includes('state:stolen'));
      await tab.evaluate(() => new Promise((r) => setTimeout(r, 100)));
      assert.deepEqual(store.packState().junk.tags.sort(), ['state:junk', 'state:stolen'], locale + ': the rule kept in the mod\'s cache');
      await dialog.getByRole('button', { name: T('pack.junk.done'), exact: true }).click();
      seen = await pages();
      assert.deepEqual(on('junk').sort(), ['marked', 'stolen'], locale + ': the stolen dagger is junk now, the things to sell are not');
      assert.deepEqual(on('misc').sort(), ['bandage', 'brass', 'clover', 'daggerA', 'torch'].sort(), locale + ': not junk and no recipe: Misc');
      await tab.getByRole('button', { name: T('pack.junk.button'), exact: true }).click();
      await dialog.getByRole('button', { name: T('pack.junk.defaults'), exact: true }).click();
      await dialog.getByRole('button', { name: T('pack.junk.done'), exact: true }).click();
      await tab.evaluate(() => new Promise((r) => setTimeout(r, 100)));
      assert.deepEqual(store.packState().junk.tags.sort(), ['state:junk', 'use:sale']);

      // Capture baseline footer panel geometry in .alone mode (with Materials Bag unlocked)
      await tab.evaluate(() => window.probe.setEnv({ bag: true, wagon: false }));
      const aloneFoot = await tab.evaluate(() => {
        const footer = document.querySelector('footer.packbar');
        const st = footer.querySelector('.z-status')?.getBoundingClientRect();
        const rp = footer.querySelector('.z-rep')?.getBoundingClientRect();
        const cr = footer.querySelector('.z-curr')?.getBoundingClientRect();
        const cy = footer.querySelector('.z-carry')?.getBoundingClientRect();
        const fr = footer.getBoundingClientRect();
        const chips = [...footer.querySelectorAll('.z-curr .dfo-curr-chip')];
        const carryBox = footer.querySelector('.z-carry .packcarry')?.getBoundingClientRect();
        const bagAction = footer.querySelector('.z-carry .dfo-bar-actions .bagbtn')?.getBoundingClientRect();
        return {
          footer: { w: fr.width },
          st: { w: st.width, h: st.height, y: st.y },
          rp: { w: rp.width, h: rp.height, y: rp.y },
          cr: { w: cr.width, h: cr.height, y: cr.y },
          cy: { w: cy.width, h: cy.height, y: cy.y },
          chipCount: chips.length,
          chipHasK: chips.some((c) => c.querySelector('.k') != null),
          hasDropBtnInCurr: !!footer.querySelector('.z-curr .goldbtn'),
          bagBelowCarry: Boolean(carryBox && bagAction && bagAction.top >= carryBox.bottom - 2),
          hasVillainyRow: !!footer.querySelector('.z-rep .dfo-villainy-row'),
          hasWeightTextLabel: !!footer.querySelector('.z-carry .packcarry .k'),
          hasWeightIcon: !!footer.querySelector('.z-carry .packcarry .dfo-carry-icon'),
          dateOverflowX: (() => { const n = footer.querySelector('.z-status .dfo-date-txt'); return n ? n.scrollWidth > n.clientWidth + 1 : true; })(),
        };
      });
      assert.equal(aloneFoot.chipCount, 5, locale + ': 5 currencies in 3x2 grid (gold, shards, embers, silver, aurum)');
      assert.equal(aloneFoot.chipHasK, false, locale + ': no currency word labels inside chips');
      assert.equal(aloneFoot.hasDropBtnInCurr, true, locale + ': Drop gold button sits in Col 1 Row 2 of currency panel');
      assert.equal(aloneFoot.bagBelowCarry, true, locale + ': Materials Bag button sits underneath carry weight scale');
      assert.equal(aloneFoot.hasVillainyRow, true, locale + ': Villainy row rendered in reputation panel');
      assert.equal(aloneFoot.hasWeightTextLabel, false, locale + ': Weight word label removed from carry plaque');
      assert.equal(aloneFoot.hasWeightIcon, true, locale + ': Weight SVG icon rendered beside carry numbers');
      assert.equal(aloneFoot.dateOverflowX, false, locale + ': enlarged date text fits completely inside .z-status');
      for (const h of [aloneFoot.st.h, aloneFoot.rp.h, aloneFoot.cr.h, aloneFoot.cy.h]) {
        assert.ok(Math.abs(h - aloneFoot.st.h) <= 1.5, `${locale}: uniform height across all 4 panels (${h} vs ${aloneFoot.st.h})`);
      }
      for (const y of [aloneFoot.st.y, aloneFoot.rp.y, aloneFoot.cr.y, aloneFoot.cy.y]) {
        assert.ok(Math.abs(y - aloneFoot.st.y) <= 1.5, `${locale}: single-row alignment in .alone (${y} vs ${aloneFoot.st.y})`);
      }

      // BESIDE A CHEST: 1.2x paperdoll expansion while keeping native dock width, one column
      await tab.evaluate(() => window.probe.mount(true));
      g = await geo();
      assert.equal(g.paired, true);
      assert.ok(g.win.w <= 1174 && g.dock.w <= 384, `${locale}: paired window (${g.win.w}) keeps native dock (${g.dock.w}) beside a container`);
      seen = await pages();
      assert.equal(new Set(seen.out[0].map((r) => r.x)).size, 1, locale + ': one column beside a container');
      assert.ok(seen.out[0].every((r) => r.dressed), locale + ': dressed rows beside a container');
      const pairedFoot = await tab.evaluate(() => {
        const footer = document.querySelector('footer.packbar');
        const st = footer.querySelector('.z-status')?.getBoundingClientRect();
        const rp = footer.querySelector('.z-rep')?.getBoundingClientRect();
        const cr = footer.querySelector('.z-curr')?.getBoundingClientRect();
        const cy = footer.querySelector('.z-carry')?.getBoundingClientRect();
        return {
          st: { w: st.width, h: st.height, y: st.y },
          rp: { w: rp.width, h: rp.height, y: rp.y },
          cr: { w: cr.width, h: cr.height, y: cr.y },
          cy: { w: cy.width, h: cy.height, y: cy.y },
        };
      });
      assert.ok(Math.abs(pairedFoot.st.w - aloneFoot.st.w) <= 1.5, locale + ': .z-status width stays constant between alone and paired');
      assert.ok(Math.abs(pairedFoot.cr.w - aloneFoot.cr.w) <= 1.5, locale + ': .z-curr width stays constant between alone and paired');
      assert.ok(Math.abs(pairedFoot.cy.w - aloneFoot.cy.w) <= 1.5, locale + ': .z-carry width stays constant between alone and paired');
      assert.ok(pairedFoot.rp.w < aloneFoot.rp.w - 80, `${locale}: ONLY .z-rep shrinks dynamically (${aloneFoot.rp.w} -> ${pairedFoot.rp.w})`);
      for (const h of [pairedFoot.st.h, pairedFoot.rp.h, pairedFoot.cr.h, pairedFoot.cy.h]) {
        assert.ok(Math.abs(h - pairedFoot.st.h) <= 1.5, `${locale}: uniform height across all 4 panels in .paired`);
      }
      const pairedHead = await geo();
      const pairedTitle = await tab.evaluate(() => {
        const h = document.querySelector('.pack-id');
        const t = h?.querySelector('.pack-who');
        return { headOverflow: h ? h.scrollWidth > h.clientWidth + 1 : true, titleW: t ? Math.round(t.getBoundingClientRect().width) : 0, titleClip: t ? t.scrollWidth > t.clientWidth + 1 : false };
      });
      assert.equal(pairedTitle.headOverflow, false, `${locale}: .paired header has zero horizontal overflow`);
      assert.ok(pairedTitle.titleW >= 80 && !pairedTitle.titleClip, `${locale}: .paired header title readable without clipping (${pairedTitle.titleW}px)`);
      assert.ok(pairedHead.codex.x < pairedHead.viewC.x && pairedHead.viewC.x < pairedHead.salvage.x && pairedHead.salvage.x < pairedHead.tools.x && pairedHead.tools.x < pairedHead.closeC.x, `${locale}: .paired clusters ordered RTL 1..5`);
      assert.ok(Math.abs(pairedHead.viewBtns[0].h - pairedHead.viewBtns[1].h) <= 1, `${locale}: .paired view/charcol buttons equal height`);
      assert.ok(Math.abs(pairedHead.toolsSortBox.w - pairedHead.toolsSplitBox.w) <= 1, `${locale}: .paired tools split columns equal width`);
      assert.ok(pairedHead.toolsBtns.every((b) => Math.abs(b.h - pairedHead.toolsBtns[0].h) <= 1), `${locale}: .paired Sort, Junk and Find buttons equal height`);
      assert.ok([...pairedHead.viewBtns, ...pairedHead.toolsBtns].every((b) => !b.clip), `${locale}: .paired cluster buttons do not clip text`);
      assert.ok(pairedHead.headH <= 62, `${locale}: .paired header stays single-line (${pairedHead.headH}px)`);
      if (shots) { await tab.evaluate(() => document.querySelectorAll('.pack-dock .packtab')[0].click()); await tab.screenshot({ path: path.join(shots, `pack-paired-rows-${locale}.png`) }); }
      await tab.evaluate(() => window.probe.mount(false));

      // REAL SHARDS / EMBERS + COMPACT GOLD (M) / K ROUNDING + PURSE-ONLY GOLD + LOC TOOLTIP + VILLAINY
      await tab.evaluate((isRu) => {
        const { mk, repaint, entity } = window.probe;
        if (entity && Array.isArray(entity.items)) {
          entity.goldPieces = 1327400;
          window.probe.marks = 1820;
          entity.items.push(
            mk('Letter of credit', 'MiscItems', 275, { value: 450000, stackCount: 1 }),
            mk('Welkynd Shard', 'Gems', 571, { stackCount: 1537 }),
            mk('Deadlands Ember', 'UselessItems2', 570, { stackCount: 2450 })
          );
          window.probe.villainy = 1850;
          entity.legalRep = { ...(entity.legalRep || {}), 17: 32, 23: -24 };
          entity.regionConditions = entity.regionConditions || [];
          entity.regionConditions[23] = { severePunishmentFlags: 1 };
          entity._dressStanding = { groups: [5, 0, -2, 10, 0], temple: 4 };
          entity.guildMemberships = { mortal: { mg: { guild: isRu ? 'Гильдия Магов' : 'Mages Guild', factionId: 11 } }, vampire: {} };
          entity.factionRep = {
            dict: new Map([
              [11, { id: 11, name: isRu ? 'Гильдия Магов' : 'Mages Guild', rep: 48 }],
              [40, { id: 40, name: isRu ? 'Храм Кинарет' : 'Temple of Kynareth', rep: 26 }],
            ]),
          };
        }
        repaint();
      }, locale === 'ru');
      const richVals = await tab.evaluate(() => ({
        gold: document.querySelector('.z-curr .dfo-curr-chip.is-gold .v')?.textContent,
        shards: document.querySelector('.z-curr .dfo-curr-chip.is-shards .v')?.textContent,
        embers: document.querySelector('.z-curr .dfo-curr-chip.is-embers .v')?.textContent,
        silver: document.querySelector('.z-curr .dfo-curr-chip.is-silver .v')?.textContent,
        villainy: document.querySelector('.z-rep .dfo-vil-v')?.textContent,
      }));
      assert.equal(richVals.gold, locale === 'ru' ? '1.327 МЛН' : '1.327M', locale + ': Gold shows purse coins only, rounded to M with 3 decimals');
      assert.equal(richVals.shards, locale === 'ru' ? '1.5К' : '1.5K', locale + ': Shards 1537 rounds cleanly to 1.5K');
      assert.equal(richVals.embers, locale === 'ru' ? '2.5К' : '2.5K', locale + ': Embers 2450 rounds to tenths 2.5K');
      assert.equal(richVals.silver, locale === 'ru' ? '1.8К' : '1.8K', locale + ': Silver 1820 rounds cleanly to 1.8K');
      assert.match(richVals.villainy || '', /1.?850\s*\/\s*5.?000/, locale + ': Villainy displays value / 5,000 scale');

      await tab.locator('.z-curr .dfo-curr-chip.is-gold').hover();
      await tab.waitForSelector('.dfo-status-tip');
      const goldTip = await tab.locator('.dfo-status-tip').evaluate((tip) => ({
        text: tip.textContent || '',
        cards: [...tip.querySelectorAll('.dfo-st-card')].map((c) => c.textContent),
      }));
      assert.equal(goldTip.cards.length, 2, locale + ': Gold tooltip renders 2 separate exact balance panels (Purse + Letters)');
      assert.match(goldTip.cards[0] || '', /1.?327.?400/, locale + ': Gold panel 1 shows exact purse coin count');
      assert.match(goldTip.cards[1] || '', /450.?000/, locale + ': Gold panel 2 shows exact Letters of Credit value');
      if (shots) await tab.screenshot({ path: path.join(shots, `pack-gold-tooltip-${locale}.png`) });
      await tab.mouse.move(4, 4);
      await tab.locator('.dfo-status-tip').waitFor({ state: 'detached' });

      await tab.locator('.z-curr .dfo-curr-chip.is-shards').hover();
      await tab.waitForSelector('.dfo-status-tip');
      const shardTip = await tab.locator('.dfo-status-tip').textContent();
      assert.ok(/1.?537/.test(shardTip) && shardTip.includes(T('pack.currTip.exact')) && shardTip.includes(T('pack.currTip.what')), locale + ': shards tooltip shows exact 1,537 panel and description');
      if (shots) await tab.screenshot({ path: path.join(shots, `pack-curr-tooltip-${locale}.png`) });
      await tab.mouse.move(4, 4);
      await tab.locator('.dfo-status-tip').waitFor({ state: 'detached' });

      await tab.locator('.z-rep').hover();
      await tab.waitForSelector('.dfo-status-tip');
      const repTip = await tab.locator('.dfo-status-tip').textContent();
      const expectedGuild = locale === 'ru' ? 'Гильдия Магов' : 'Mages Guild';
      const expectedBanRegion = locale === 'ru' ? 'Вэйрест' : 'Wayrest';
      assert.ok(repTip.includes(T('pack.repTip.title')) && repTip.includes(expectedGuild) && repTip.includes(expectedBanRegion) && repTip.includes(T('pack.rep.group.nobility')), locale + ': relations tooltip renders full summary');
      if (shots) await tab.screenshot({ path: path.join(shots, `pack-rep-tooltip-${locale}.png`) });
      await tab.mouse.move(4, 4);
      await tab.locator('.dfo-status-tip').waitFor({ state: 'detached' });

      // SOLID WEIGHT COLOR INTERPOLATION & ASYNC SERVER CURRENCY RACE:
      // 1) Set light carry load (~0.25 / 75 kg), sample fill color, then add heavy plates for overweight -> crimson red
      await tab.evaluate(() => {
        const { cases, entity, repaint } = window.probe;
        entity.goldPieces = 0;
        entity.items.splice(0, entity.items.length, cases.clover);
        repaint();
      });
      const lowInfo = await tab.evaluate(() => ({ color: getComputedStyle(document.querySelector('.z-carry .px-fill')).backgroundColor, text: document.querySelector('.z-carry .packcarry .v')?.textContent }));
      assert.notEqual(lowInfo.color, 'rgb(220, 38, 38)', `${locale}: light carry load starts green instead of crimson (${JSON.stringify(lowInfo)})`);
      await tab.evaluate(() => {
        const { mk, entity, repaint } = window.probe;
        for (let i = 0; i < 60; i++) entity.items.push(mk('Heavy Plate', 'Armor', 102, { material: 513, _probeExtra: true }));
        repaint();
      });
      const highColor = await tab.evaluate(() => getComputedStyle(document.querySelector('.z-carry .px-fill')).backgroundColor);
      assert.notEqual(highColor, lowInfo.color, `${locale}: solid carry bar color shifts dynamically with fill ratio (${lowInfo.color} -> ${highColor})`);
      assert.equal(highColor, 'rgb(220, 38, 38)', `${locale}: overweight shifts solid carry fill to crimson red (${highColor})`);

      // 2) Async Silver Marks + Aurum hydrate even if a synchronous repaint replaces the footer while requests are in-flight
      await tab.evaluate(() => {
        window.probe.marks = null;
        window.__dfoAurum = null;
        window.probe.refreshMarks = () => new Promise((resolve) => setTimeout(() => { window.probe.marks = 610; resolve({ ok: true, data: { balance: 610 } }); }, 60));
        window.probe.aurumAsync = () => new Promise((resolve) => setTimeout(() => { window.__dfoAurum = { balance: 140, open: true }; resolve(window.__dfoAurum); }, 60));
        // Mount fresh footer & force a second immediate repaint while async calls are in-flight
        window.probe.mount(false);
        window.probe.repaint();
      });
      await tab.waitForFunction(() => document.querySelector('.z-curr .is-silver .v')?.textContent === '610' && document.querySelector('.z-curr .is-aurum .v')?.textContent === '140');
      // Clean up heavy temporary armor pieces
      await tab.evaluate(() => { window.probe.setEnv({ bag: false, wagon: false, marks: 380, aurum: 95 }); });

      // THE QUEST LETTER'S LOCK: at the front, as the game hands it over; never otherwise
      const lock = await tab.evaluate(() => {
        const { mk, addItem } = window.probe, list = [];
        const letter = mk('Parchment', 'UselessItems2', 279, { questItem: true, questUID: 9, questSymbol: { name: '_l_' } });
        const later = mk('Parchment', 'UselessItems2', 279, { questItem: true, questUID: 9, questSymbol: { name: '_m_' } });
        const plain = mk('Parchment', 'UselessItems2', 279, {});
        const totem = mk('Totem', 'UselessItems2', 280, { questItem: true, questUID: 9, questSymbol: { name: '_t_' } });
        addItem(list, letter, 'front'); addItem(list, later, 'back'); addItem(list, plain, 'front'); addItem(list, totem, 'front');
        return { letter: letter.locked === true, later: later.locked === true, plain: plain.locked === true, totem: totem.locked === true, n: list.length };
      });
      assert.deepEqual(lock, { letter: true, later: false, plain: false, totem: false, n: 4 }, locale + ': only a quest letter received is locked');

      // CHARCOL V2, 3D SLOT SHADOWS, SET RELICS & DOSSIER TOOLTIPS, WAX SEAL BONUS SUMMARY & FLIP VIEW
      const v2EmptyState = await tab.evaluate(() => ({
        isV2: document.querySelector('.charcol')?.classList.contains('is-v2'),
        pureSlots: document.querySelectorAll('.charcol .is-v2-pure').length,
        shadowSvgs: document.querySelectorAll('.charcol .worntile.is-v2-glyph svg.v2-shadow-svg').length,
        setRailPresentWhenNone: !!document.querySelector('.charcol .v2-setrail'),
        hasWaxSeal: !!document.querySelector('.charcol .v2-wax-seal-btn'),
        hasAcPlaque: !!document.querySelector('.charcol .v2-headbar button.wornac-total'),
        hasTempPlaque: !!document.querySelector('.charcol .v2-headbar button.worntemp-total'),
        strayAcBadges: document.querySelectorAll('.charcol .is-v2-pure .wornac').length,
      }));
      assert.equal(v2EmptyState.isV2, true, locale + ': charcol upgraded to V2');
      assert.equal(v2EmptyState.pureSlots, 27, locale + ': all 27 equipment/utility slots present in V2');
      assert.equal(v2EmptyState.shadowSvgs, 27, locale + ': all 27 empty slots render 3D bas-relief SVG silhouettes');
      assert.equal(v2EmptyState.setRailPresentWhenNone, false, locale + ': no set rail rendered when 0 set pieces worn');
      assert.equal(v2EmptyState.hasWaxSeal, true, locale + ': Red Wax Seal button rendered in top-right utility column');
      assert.equal(v2EmptyState.hasAcPlaque, true, locale + ': Armour plaque button rendered in V2 headbar');
      assert.equal(v2EmptyState.hasTempPlaque, true, locale + ': Temperature plaque button rendered in V2 headbar');
      assert.equal(v2EmptyState.strayAcBadges, 0, locale + ': no stray .wornac badges inside V2 pure slots');

      // Equip set items + capped affixes on entity and verify Set Rail, Set Tooltip, Wax Seal Tooltip (caps + % merging + multi-column viewport fit), and Flip View
      await tab.evaluate(() => {
        const { mk, entity, repaint } = window.probe;
        const eq = [
          mk('Numidium Helm', 'Armor', 107, { equipSlot: 12, material: 516, rarity: 'rare', sigil: { set: 'numidium', xp: 37500, party: 1 }, affixes: [{ id: 'stat', param: 'strength', value: 15 }, { id: 'resist', param: 'fire', value: 30 }, { id: 'thorns', value: 6 }, { id: 'dry', value: 45 }, { id: 'castSpeed', value: 15 }] }),
          mk('Numidium Cuirass', 'Armor', 102, { equipSlot: 18, material: 516, rarity: 'rare', sigil: { set: 'numidium', xp: 37500, party: 1 }, affixes: [{ id: 'stat', param: 'strength', value: 12 }, { id: 'resist', param: 'fire', value: 25 }, { id: 'resist', param: 'shock', value: 35 }, { id: 'thorns', value: 6 }, { id: 'dry', value: 35 }], enchantments: [{ type: 3, param: 0 }] }),
          mk('Numidium Greaves', 'Armor', 105, { equipSlot: 23, material: 516, rarity: 'rare', sigil: { set: 'numidium', xp: 37500, party: 1 }, affixes: [{ id: 'skill', param: 29, value: 25 }, { id: 'weight', value: 15 }, { id: 'technique', param: 'whirlwind', value: 12 }] }),
          mk('Numidium Boots', 'Armor', 108, { equipSlot: 26, material: 516, rarity: 'rare', sigil: { set: 'numidium', xp: 37500, party: 1 }, affixes: [{ id: 'warmth', value: 15 }, { id: 'weight', value: 25 }, { id: 'skill', param: 18, value: 8 }] }),
          mk('Wyrd Pauldrons', 'Armor', 104, { equipSlot: 13, material: 0, rarity: 'aetheric', sigil: { set: 'wyrd', xp: 22500, party: 1 }, affixes: [{ id: 'stat', param: 'willpower', value: 12 }, { id: 'skill', param: 22, value: 8 }, { id: 'skill', param: 23, value: 7 }] }),
          mk('Wyrd Gauntlets', 'Armor', 103, { equipSlot: 20, material: 0, rarity: 'aetheric', sigil: { set: 'wyrd', xp: 22500, party: 1 }, affixes: [{ id: 'stat', param: 'willpower', value: 10 }, { id: 'potency', value: 12 }, { id: 'skill', param: 20, value: 9 }] }),
          mk('Coilscale Left Arm', 'Armor', 104, { equipSlot: 15, material: 520, rarity: 'aetheric', sigil: { set: 'coilscale', xp: 5000, party: 1 }, affixes: [{ id: 'resist', param: 'frost', value: 35 }, { id: 'skill', param: 34, value: 11 }] }),
          mk('Arcane Signet I', 'Jewellery', 142, { equipSlot: 4, rarity: 'rare', affixes: [{ id: 'castSpeed', value: 20 }, { id: 'potency', value: 10 }, { id: 'wellspring', value: 6 }, { id: 'skill', param: 28, value: 9 }, { id: 'resist', param: 'magic', value: 5 }] }),
          mk('Arcane Signet II', 'Jewellery', 142, { equipSlot: 5, rarity: 'rare', affixes: [{ id: 'wellspring', value: 5 }, { id: 'standing', param: 'commoners', value: 6 }, { id: 'skill', param: 16, value: 14 }], enchantments: [{ type: 1, param: 41 }] }),
          mk('Barenziah Cloak', 'WomensClothing', 199, { equipSlot: 14, rarity: 'legendary', legendary: 'barenziah-silks', affixes: [{ id: 'stat', param: 'personality', value: 10 }] }),
          mk('Daedric Blade', 'Weapons', 117, { equipSlot: 19, material: 9, rarity: 'rare', affixes: [{ id: 'damage', value: 22 }, { id: 'leech', value: 7 }, { id: 'elemental', param: 'fire', value: 8 }, { id: 'slayer', param: 'undead', value: 18 }], enchantments: [{ type: 1, param: 39 }, { type: 2, param: 7 }, { type: 6, param: 1 }] }),
        ];
        entity.equip = { slots: new Array(27).fill(null) };
        for (const it of eq) entity.equip.slots[it.equipSlot] = it;
        entity.items.push(...eq);
        window.probe.setSigilOnline(40);
        repaint();
      });

      const v2EquippedState = await tab.evaluate(() => ({
        relicButtons: [...document.querySelectorAll('.charcol .v2-setrail .v2-relic-btn')].map((b) => ({
          set: b.dataset.set,
          dormant: b.classList.contains('is-dormant'),
          hasCanvas: !!b.querySelector('canvas.relic-fx-canvas'),
          hasSvg: !!b.querySelector('svg.relic-svg'),
        })),
        sealCapped: Number(document.querySelector('.charcol .v2-wax-seal-btn')?.dataset.cappedCount || 0),
        sealTotal: Number(document.querySelector('.charcol .v2-wax-seal-btn')?.dataset.bonusCount || 0),
      }));
      assert.equal(v2EquippedState.relicButtons.length, 3, locale + ': 3 worn sets rendered in .v2-setrail');
      assert.equal(v2EquippedState.relicButtons[0].set, 'numidium');
      assert.equal(v2EquippedState.relicButtons[0].dormant, false, locale + ': numidium 4/9 is awake');
      assert.equal(v2EquippedState.relicButtons[2].set, 'coilscale');
      assert.equal(v2EquippedState.relicButtons[2].dormant, true, locale + ': coilscale 1/9 is dormant');
      assert.ok(v2EquippedState.relicButtons.every((b) => b.hasCanvas && b.hasSvg), locale + ': every set relic renders SVG + 60fps canvas');
      // 7 real caps: res.fire (45), res.shock (45), def.thorns (10), util.dry (75), mag.castSpeed (30), mag.wellspring (10), stand.commoners (10)
      assert.ok(v2EquippedState.sealCapped >= 7 && v2EquippedState.sealTotal >= 18, `${locale}: Wax Seal tracks active (${v2EquippedState.sealTotal}) and real-capped (${v2EquippedState.sealCapped}) gear bonuses`);

      // Test live offline renown gating on Numidium
      await tab.evaluate(() => { window.probe.setSigilOnline(null); });
      const offlineNumidiumDormant = await tab.evaluate(() => document.querySelector('.charcol .v2-setrail .v2-relic-btn[data-set="numidium"]')?.classList.contains('is-dormant'));
      assert.equal(offlineNumidiumDormant, true, locale + ': live renown gate keeps numidium 4/9 dormant when offline');
      await tab.evaluate(() => { window.probe.setSigilOnline(40); });

      // Hover Numidium set relic icon -> verify .dfo-set-tip
      await tab.locator('.charcol .v2-setrail .v2-relic-btn[data-set="numidium"]').hover();
      await tab.waitForSelector('.dfo-set-tip');
      const setTipInfo = await tab.locator('.dfo-set-tip').evaluate((tip) => ({
        name: tip.querySelector('.set-name')?.textContent || '',
        count: tip.querySelector('.set-count')?.textContent || '',
        awakeTiers: tip.querySelectorAll('.set-tier.awake').length,
        loreHead: tip.querySelector('.set-card-lore .set-section-eyebrow')?.textContent || '',
        loreText: tip.querySelector('.set-lore-text')?.textContent || '',
      }));
      assert.ok(setTipInfo.name.length > 0 && setTipInfo.count.includes('4/9'), locale + ': Set tooltip shows name and 4/9 count');
      assert.equal(setTipInfo.awakeTiers, 2, locale + ': Numidium 4/9 has 2 awake tiers ([2] and [4])');
      assert.equal(setTipInfo.loreHead, locale === 'ru' ? 'Описание' : 'Description', locale + ': Set lore header is Описание / Description');
      assert.ok(setTipInfo.loreText.includes(locale === 'ru' ? 'Деформация Запада' : 'Warp in the West'), locale + ': Set lore uses canonical TES localization');
      if (shots) await tab.screenshot({ path: path.join(shots, `pack-v2-set-tip-${locale}.png`) });
      await tab.mouse.move(4, 4);
      await tab.locator('.dfo-set-tip').waitFor({ state: 'detached' });

      // Hover Red Wax Seal -> compact summary WITHOUT passive block + CTA + identical merged numeric math
      await tab.locator('.charcol .v2-wax-seal-btn').hover();
      await tab.waitForSelector('.dfo-status-tip.is-seal-summary');
      const sealTipInfo = await tab.locator('.dfo-status-tip.is-seal-summary').evaluate((tip) => {
        const rows = [...tip.querySelectorAll('.dfo-st-bonus-row')].map((r) => ({
          key: r.dataset.bonusKey,
          label: r.querySelector('.dfo-st-bonus-lbl')?.textContent || '',
          val: r.querySelector('.dfo-st-bonus-v')?.textContent || '',
          capped: r.classList.contains('is-capped'),
        }));
        const passiveGroups = [...tip.querySelectorAll('.dfo-st-passive-group')];
        const passiveCards = [...tip.querySelectorAll('.dfo-st-pg-item')];
        const clickTitle = tip.querySelector('.dfo-st-click-title')?.textContent?.trim() || '';
        const clickSub = tip.querySelector('.dfo-st-click-sub')?.textContent?.trim() || '';
        const rect = tip.getBoundingClientRect();
        return {
          hasIntro: !!tip.querySelector('.dfo-st-intro'),
          cols: Number(tip.dataset.sealCols || 0),
          cappedRows: rows.filter((r) => r.capped).length,
          totalRows: rows.length,
          rows,
          passiveGroupCount: passiveGroups.length,
          passiveCardCount: passiveCards.length,
          clickTitle,
          clickSub,
          rect: { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right, height: rect.height },
          vw: window.innerWidth,
          vh: window.innerHeight,
        };
      });
      assert.equal(sealTipInfo.hasIntro, true, locale + ': Wax Seal tooltip includes intro explanation block');
      assert.equal(sealTipInfo.passiveGroupCount, 0, locale + ': Hover Wax Seal tooltip omits passive/set groups block');
      assert.equal(sealTipInfo.passiveCardCount, 0, locale + ': Hover Wax Seal tooltip omits individual passive cards');
      assert.equal(
        sealTipInfo.clickTitle,
        locale === 'ru' ? 'Нажмите, чтобы получить полную информацию.' : 'Click for full details.',
        locale + ': Hover Wax Seal tooltip shows prominent full-info click CTA'
      );
      assert.ok(sealTipInfo.cappedRows >= 7 && sealTipInfo.totalRows >= 18, `${locale}: Wax Seal tooltip highlights real-capped rows in gold (${sealTipInfo.cappedRows}/${sealTipInfo.totalRows})`);
      const findTipRow = (k) => sealTipInfo.rows.find((r) => r.key === k);
      assert.equal(findTipRow('util.weight')?.val, '+40%', locale + ': Percentage weight bonus merged across multiple items (+15% + +25% = +40%)');
      assert.equal(findTipRow('mag.potency')?.val, '+22%', locale + ': Percentage spell potency merged across items (+12% + +10% = +22%)');
      assert.equal(findTipRow('res.magic')?.val, '+77%', locale + ': Magic resist STILL merges Numidium (10%) + Wyrd (13%) + affix (5%) + Held #39 Lv12 (49%) = +77% in tooltip');
      assert.equal(findTipRow('mag.castSpeed')?.label, locale === 'ru' ? 'Скорость заклинаний' : 'Casting Speed', locale + ': castSpeed labeled Casting Speed / Скорость заклинаний');
      assert.equal(findTipRow('attr.strength')?.capped, false, locale + ': Strength (+27) is NOT falsely capped');
      assert.equal(findTipRow('skill.29')?.capped, false, locale + ': Long Blade (+25) is NOT falsely capped');
      assert.ok(sealTipInfo.rect.bottom <= sealTipInfo.vh - 4 && sealTipInfo.rect.top >= 4, locale + ': Wax Seal tooltip fits vertically inside viewport');
      if (shots) await tab.screenshot({ path: path.join(shots, `pack-v2-wax-seal-tip-${locale}.png`) });
      await tab.mouse.move(4, 4);
      await tab.locator('.dfo-status-tip.is-seal-summary').waitFor({ state: 'detached' });

      // Compact 1280x720 viewport test -> dynamically expands horizontally so tooltip NEVER overflows downward
      await tab.setViewportSize({ width: 1280, height: 720 });
      await tab.locator('.charcol .v2-wax-seal-btn').hover();
      await tab.waitForSelector('.dfo-status-tip.is-seal-summary');
      const compactTip = await tab.locator('.dfo-status-tip.is-seal-summary').evaluate((tip) => {
        const rect = tip.getBoundingClientRect();
        return {
          cols: Number(tip.dataset.sealCols || 0),
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          vw: window.innerWidth,
          vh: window.innerHeight,
        };
      });
      assert.ok(compactTip.cols >= 2, `${locale}: 1280x720 expands Wax Seal across >=2 horizontal columns (got ${compactTip.cols})`);
      assert.ok(compactTip.bottom <= compactTip.vh - 4 && compactTip.top >= 4, `${locale}: 1280x720 Wax Seal never clips vertically (${compactTip.top}..${compactTip.bottom} vs ${compactTip.vh})`);
      assert.ok(compactTip.left >= 4 && compactTip.right <= compactTip.vw - 4, `${locale}: 1280x720 Wax Seal fits horizontally (${compactTip.left}..${compactTip.right} vs ${compactTip.vw})`);
      if (shots) await tab.screenshot({ path: path.join(shots, `pack-v2-wax-seal-compact-${locale}.png`) });
      await tab.mouse.move(4, 4);
      await tab.locator('.dfo-status-tip.is-seal-summary').waitFor({ state: 'detached' });
      await tab.setViewportSize({ width: 1920, height: 1080 });

      // Click Red Wax Seal -> opens full styled <dialog class="... dfo-seal-modal"> with 100% numeric parity AND thematic passives
      await tab.locator('.charcol .v2-wax-seal-btn').click();
      await tab.waitForSelector('dialog.dfo-seal-modal[open]');
      await tab.locator('.dfo-status-tip.is-seal-summary').waitFor({ state: 'detached' });
      const sealModalInfo = await tab.locator('dialog.dfo-seal-modal').evaluate((dlg) => {
        const rows = [...dlg.querySelectorAll('.dfo-st-bonus-row')].map((r) => ({
          key: r.dataset.bonusKey,
          label: r.querySelector('.dfo-st-bonus-lbl')?.textContent || '',
          val: r.querySelector('.dfo-st-bonus-v')?.textContent || '',
          capped: r.classList.contains('is-capped'),
        }));
        const passiveGroups = [...dlg.querySelectorAll('.dfo-st-passive-group')].map((g) => ({
          tone: g.dataset.passiveGroup || '',
          title: g.querySelector('.dfo-st-pg-title')?.textContent || '',
          count: g.querySelector('.dfo-st-pg-count')?.textContent || '',
          items: [...g.querySelectorAll('.dfo-st-pg-item')].map((c) => c.dataset.passiveKey || ''),
        }));
        const passiveCards = [...dlg.querySelectorAll('.dfo-st-pg-item')].map((c) => ({
          key: c.dataset.passiveKey || '',
          title: c.querySelector('.dfo-st-p-title')?.textContent || '',
          val: c.querySelector('.dfo-st-p-val')?.textContent || '',
          desc: c.querySelector('.dfo-st-p-desc')?.textContent || '',
        }));
        const rect = dlg.getBoundingClientRect();
        return {
          hasWindowFrame: dlg.classList.contains('dfo-window-frame'),
          hasSubpanels: dlg.querySelectorAll('.dfo-subpanel-frame').length >= 2,
          hasScrollBody: !!dlg.querySelector('.wb.dfo-scroll'),
          hasPrimaryClose: !!dlg.querySelector('.wf .dfo-ornate-btn.primary'),
          rows,
          passiveGroups,
          passiveCards,
          rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height },
          vw: window.innerWidth,
          vh: window.innerHeight,
        };
      });
      assert.equal(sealModalInfo.hasWindowFrame, true, locale + ': Seal modal uses canonical .dfo-window-frame');
      assert.equal(sealModalInfo.hasSubpanels, true, locale + ': Seal modal renders .dfo-subpanel-frame panes');
      assert.equal(sealModalInfo.hasScrollBody, true, locale + ': Seal modal renders .wb.dfo-scroll container');
      assert.equal(sealModalInfo.hasPrimaryClose, true, locale + ': Seal modal renders primary .dfo-ornate-btn close button');
      assert.equal(sealModalInfo.rows.length, sealTipInfo.totalRows, locale + ': Modal and hover tooltip have identical numeric row count');
      for (const tipRow of sealTipInfo.rows) {
        const mRow = sealModalInfo.rows.find((r) => r.key === tipRow.key);
        assert.equal(mRow?.val, tipRow.val, `${locale}: Tooltip vs Modal numeric parity for ${tipRow.key}`);
      }
      const findModalPassive = (k) => sealModalInfo.passiveCards.find((p) => p.key === k);
      const strikeGrp = sealModalInfo.passiveGroups.find((g) => g.tone === 'strike');
      const heldGrp = sealModalInfo.passiveGroups.find((g) => g.tone === 'held');
      const setGrp = sealModalInfo.passiveGroups.find((g) => g.tone === 'set');
      assert.ok(heldGrp && heldGrp.items.includes('held.39') && heldGrp.items.includes('held.41'), locale + ': Modal groups Held effects under one При ношении / While Held header');
      assert.ok(strikeGrp && strikeGrp.items.includes('strike.7') && strikeGrp.items.includes('classic.vamp.1'), locale + ': Modal groups Strike effects under one При ударе / On Strike header');
      assert.equal(sealModalInfo.passiveGroups.filter((g) => g.tone === 'strike').length, 1, locale + ': Modal On Strike header appears once for grouped strike effects');
      assert.ok(setGrp && setGrp.items.length >= 1, locale + ': Modal includes Set & Relic passive group');
      assert.ok(findModalPassive('held.39')?.val.includes('+49%') && findModalPassive('held.39')?.desc.length > 20, locale + ': Modal Held #39 Lv12 item shows decoded +49% & explanation');
      assert.ok(findModalPassive('strike.7')?.val.includes('13–63') && findModalPassive('strike.7')?.desc.length > 20, locale + ": Modal Strike #7 Wizard's Fire Lv12 item shows decoded 13–63 dmg");
      assert.ok(sealModalInfo.rect.width >= 760 && sealModalInfo.rect.bottom <= sealModalInfo.vh - 8, locale + ': Seal modal renders as a large viewport-fitted dialog');
      if (shots) await tab.screenshot({ path: path.join(shots, `pack-v2-wax-seal-modal-${locale}.png`) });
      if (locale === 'ru') {
        await tab.keyboard.press('Escape');
      } else {
        await tab.locator('dialog.dfo-seal-modal .wf .dfo-ornate-btn.primary').click();
      }
      await tab.locator('dialog.dfo-seal-modal').waitFor({ state: 'detached' });

      // Click .statflip-btn -> verify .sf-v2-split (doll left + stats right)
      await tab.locator('.charcol .statflip-btn').click();
      const flipInfo = await tab.evaluate(() => ({
        isFlipped: document.querySelector('.charcol .statflip')?.classList.contains('is-back'),
        hasSplit: !!document.querySelector('.charcol .sf-v2-split'),
        hasDoll: !!document.querySelector('.charcol .sf-v2-split .sf-v2-doll'),
        hasStatsPage: !!document.querySelector('.charcol .sf-v2-split .sf-page'),
      }));
      assert.deepEqual(flipInfo, { isFlipped: true, hasSplit: true, hasDoll: true, hasStatsPage: true }, locale + ': Flip back shows split Character Doll + Combat Stats');
      if (shots) await tab.screenshot({ path: path.join(shots, `pack-v2-flipped-${locale}.png`) });
      await tab.waitForTimeout(400);
      await tab.locator('.charcol .statflip-btn').click();

      // HEADER CHARCOL SWITCHER: Switch live game to V1 (Ванильный Инвентарь / Vanilla Inventory), verify V1 layout, plaques, setstrip tooltip, flip, and switch back to V2
      await tab.locator('.c-view .dfo-charcol-btn').click();
      await tab.waitForFunction(() => document.documentElement.dataset.dfoCharcol === 'v1');
      await tab.waitForTimeout(200);
      assert.equal(store.packState().charcol, 'v1', locale + ': charcol v1 persisted to store');
      const v1Info = await tab.evaluate(() => ({
        btnText: document.querySelector('.c-view .dfo-charcol-btn')?.textContent?.trim(),
        btnPressed: document.querySelector('.c-view .dfo-charcol-btn')?.getAttribute('aria-pressed'),
        isV1: document.querySelector('.charcol')?.classList.contains('is-v1'),
        isV2: document.querySelector('.charcol')?.classList.contains('is-v2'),
        hasWornshelf: !!document.querySelector('.charcol > .wornshelf'),
        hasPoeStage: !!document.querySelector('.charcol .v2-poe-stage'),
        setCount: document.querySelectorAll('.charcol > .setstrip .setline').length,
        hasAcBtn: !!document.querySelector('.charcol button.wornac-total'),
        hasTempBtn: !!document.querySelector('.charcol button.worntemp-total'),
        numTitle: document.querySelector('.charcol > .setstrip .setline[data-set="numidium"]')?.getAttribute('title'),
      }));
      assert.equal(v1Info.btnText, T('pack.charcol.v1'), locale + ': header switcher updates to V1 label');
      assert.equal(v1Info.btnPressed, 'false', locale + ': header switcher aria-pressed is false in V1');
      assert.equal(v1Info.isV1, true, locale + ': charcol has is-v1 class');
      assert.equal(v1Info.isV2, false, locale + ': charcol does not have is-v2 class in V1');
      assert.equal(v1Info.hasWornshelf, true, locale + ': V1 preserves .wornshelf');
      assert.equal(v1Info.hasPoeStage, false, locale + ': V1 does not render V2 PoE stage');
      assert.equal(v1Info.setCount, 3, locale + ': V1 renders 3 sets in .setstrip');
      assert.equal(v1Info.hasAcBtn, true, locale + ': V1 upgrades Armor Shield plaque to interactive button');
      assert.equal(v1Info.hasTempBtn, true, locale + ': V1 upgrades Temperature plaque to interactive button');
      assert.equal(v1Info.numTitle, null, locale + ': V1 strips native browser title from .setline');
      if (shots) await tab.screenshot({ path: path.join(shots, `pack-v1-${locale}.png`) });

      // Hover Numidium .setline in V1 -> verify Set Relic tooltip opens cleanly
      await tab.locator('.charcol > .setstrip .setline[data-set="numidium"]').hover();
      await tab.waitForSelector('.dfo-set-tip');
      const v1SetCount = await tab.locator('.dfo-set-tip .set-count').textContent();
      assert.ok(v1SetCount && v1SetCount.includes('4/9'), locale + ': V1 .setline hover shows Set Relic tooltip with 4/9');
      if (shots) await tab.screenshot({ path: path.join(shots, `pack-v1-set-tip-${locale}.png`) });
      await tab.mouse.move(4, 4);
      await tab.locator('.dfo-set-tip').waitFor({ state: 'detached' });

      // Flip V1 stats card -> verify clean non-blurred flip
      await tab.locator('.charcol .statflip-btn').click();
      const v1Flip = await tab.evaluate(() => ({
        isFlipped: document.querySelector('.charcol .statflip')?.classList.contains('is-back'),
        hasSplit: !!document.querySelector('.charcol .sf-v2-split'),
        hasStatsPage: !!document.querySelector('.charcol .statflip-back .sf-page'),
      }));
      assert.deepEqual(v1Flip, { isFlipped: true, hasSplit: false, hasStatsPage: true }, locale + ': V1 flip shows native Stats page without V2 split');
      if (shots) await tab.screenshot({ path: path.join(shots, `pack-v1-flipped-${locale}.png`) });
      await tab.waitForTimeout(400);
      await tab.locator('.charcol .statflip-btn').click();

      // Switch back to default V2 (Action-RPG Стиль / Action-RPG Style)
      await tab.locator('.c-view .dfo-charcol-btn').click();
      await tab.waitForFunction(() => document.documentElement.dataset.dfoCharcol === 'v2');
      await tab.waitForTimeout(200);
      assert.equal(store.packState().charcol, 'v2', locale + ': charcol restored to default v2');

      // Restore full case catalog before Find-mode & 5,000-item stress verification
      await tab.evaluate(() => {
        const { cases, entity, repaint } = window.probe;
        delete entity.equip;
        entity.items.splice(0, entity.items.length, ...Object.values(cases));
        repaint();
        document.querySelectorAll('.pack-dock .packtab')[0]?.click();
      });
      // Click first Weapons item to inspect its real .dfo-item-text lore word in .packdetail, then verify live Find mode excludes lore
      const firstRow = tab.locator('.pack-dock .itemrow').first();
      await firstRow.click();
      await tab.waitForSelector('.packdetail.open .dfo-item-text');
      const loreProbe = await tab.evaluate(() => {
        const card = document.querySelector('.packdetail.open .card');
        const headText = String(card?.querySelector('h3')?.textContent || '').toLowerCase();
        const lore = String(card?.querySelector('.dfo-item-text')?.textContent || '');
        const words = lore.toLowerCase().replace(/[^a-z\u0430-\u044f\u0451\s]/gi, ' ').split(/\s+/).filter((w) => w.length >= 6 && !headText.includes(w));
        return words[words.length - 1] || words[0] || '';
      });
      assert.ok(loreProbe.length >= 6, `${locale}: captured real .dfo-item-text lore probe word (${loreProbe})`);

      // Find mode in live enhancedInventory: pure-JS card search (zero DOM card build), matches card fields, excludes .dfo-item-text lore, handles 5,000 items cleanly
      await tab.locator('.dfo-pack-head .dfo-find-btn').click();
      await tab.waitForSelector('.dfo-find-input');
      const findMatQuery = locale === 'ru' ? 'материал мифрил' : 'material mithril';
      await tab.locator('.dfo-find-input').fill(findMatQuery);
      await tab.waitForFunction(() => document.querySelectorAll('.pack-dock .itemrow').length === 1);
      const foundRarity = await tab.evaluate(() => document.querySelector('.pack-dock .itemrow')?.dataset?.rarity);
      assert.equal(foundRarity, 'rare', `${locale}: live Find mode locates Mithril rare sword across all tabs`);
      // Localized base item name search across all tabs (must translate Torch -> Факел and The Wild Elves -> Дикие эльфы in RU)
      const findTorchQuery = locale === 'ru' ? 'факел' : 'torch';
      await tab.locator('.dfo-find-input').fill(findTorchQuery);
      await tab.waitForFunction(() => document.querySelectorAll('.pack-dock .itemrow').length === 1);
      const findBookQuery = locale === 'ru' ? 'дикие эльфы' : 'wild elves';
      await tab.locator('.dfo-find-input').fill(findBookQuery);
      await tab.waitForFunction(() => document.querySelectorAll('.pack-dock .itemrow').length === 1);
      await tab.locator('.dfo-find-input').fill(loreProbe);
      await tab.waitForTimeout(100);
      const loreHits = await tab.evaluate(() => document.querySelectorAll('.pack-dock .itemrow').length);
      assert.equal(loreHits, 0, `${locale}: live Find mode excludes lower item description / lore text (${loreProbe})`);
      await tab.locator('.dfo-find-clear').click();
      await tab.locator('.dfo-pack-head .dfo-find-btn').click();
      await tab.waitForFunction(() => !document.querySelector('.dfo-find-input'));

      // 5,000-item player inventory scalability sanity check
      const perf5k = await tab.evaluate(() => {
        const orig = window.probe.entity.items.slice();
        const extra = [];
        for (let i = 0; i < 5000; i++) {
          const baseCase = i % 3 === 0 ? window.probe.cases.rare : i % 3 === 1 ? window.probe.cases.cuirass : window.probe.cases.flowers;
          extra.push({ ...baseCase, uid: 'stress-' + i, name: baseCase.name + ' #' + i });
        }
        window.probe.entity.items.splice(0, window.probe.entity.items.length, ...extra);
        try {
          const t0 = performance.now();
          document.querySelector('.pack-win').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
          window.probe.repaint();
          const repaintMs = +(performance.now() - t0).toFixed(2);
          window.__dfoPack.openFind(() => window.probe.repaint());
          const t1 = performance.now();
          window.__dfoPack.setFindQuery(window.__DFO_MOD_CFG__?.ru?.on ? 'редкий мифрил' : 'rare mithril');
          const findMs = +(performance.now() - t1).toFixed(2);
          const countText = document.querySelector('.dfo-find-count')?.textContent || '';
          window.__dfoPack.closeFind(() => window.probe.repaint());
          return { repaintMs, findMs, countText };
        } finally {
          window.probe.entity.items.splice(0, window.probe.entity.items.length, ...orig);
          window.probe.repaint();
        }
      });
      assert.ok(perf5k.countText.startsWith('1667 / '), `${locale}: 5k Find finds all 1667 rare Mithril items (${perf5k.countText})`);
      assert.ok(perf5k.findMs < 1500, `${locale}: 5k live pure-JS Find stays fast (${perf5k.findMs}ms)`);

      await tab.close();
    }
    assert.deepEqual(errors, [], 'no page errors');
    console.log('pack stand: pages, views, stacks, junk, sort and the letter lock checked in en and ru');
  } finally { await browser.close(); await new Promise((r) => server.close(r)); fs.rmSync(userData, { recursive: true, force: true }); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
