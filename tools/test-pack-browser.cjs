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
const entry = files.find((f) => /^enhancedInventory-/.test(f) && read(f).includes('as mountEnhancedInventory'));
// the game's own addItem (inventory.js), by its shape - the receipt hook stands at its first line
const addHome = files.find((f) => read(f).includes('AddItem() encountered a duplicate item'));
const addName = addHome && /function ([\w$]+)\([\w$]+,[\w$]+,[\w$]+=`back`\)\{let [\w$]+=[\w$]+\([\w$]+,[\w$]+\);return/.exec(read(addHome))?.[1];
const addAlias = addName && new RegExp(`[{,]${addName.replace(/\$/g, '\\$')} as ([\\w$]+)[,}]`).exec(read(addHome).slice(read(addHome).lastIndexOf('export{')))?.[1];

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'dfo-pack-'));
const store = createLootStore(userData);
const ctx = { itemCards: true, inventory: true, nearbyLoot: false, dungeons: false, marks: false, fonts: false, ru: false };
const cache = new Map();
const page = (locale) => `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#172029;height:100%;overflow:hidden}</style>
<script>window.__DFO_MOD_CFG__={itemCards:{enabled:true},inventory:{enabled:true},ru:{on:${locale === 'ru'}}};</script>
<script src="/dfo-mod/dfo_ui_text_data.js?${locale}"></script><script src="/dfo-mod/dfo_ui_text.js"></script>
${locale === 'ru' ? '<script src="/dfo-mod/ru_dict.js"></script><script src="/dfo-mod/ru_i18n.js"></script><script src="/dfo-mod/ru_items.js"></script>' : ''}
<script src="/dfo-mod/dfo_item_text_data.js?${locale}"></script><script src="/dfo-mod/dfo_item_text.js"></script><script src="/dfo-mod/dfo_item_cards.js"></script>
<script src="/dfo-mod/dfo_loot_rules.js"></script><script src="/dfo-mod/dfo_pack_data.js"></script><script src="/dfo-mod/dfo_pack_rules.js"></script><script src="/dfo-mod/dfo_pack.js"></script>
</head><body><div id="enhanced-inventory"></div><script type="module">
import {mountEnhancedInventory} from '/assets/${entry}';
import {${addAlias} as addItem} from '/assets/${addHome}';
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
const entity={isPlayer:true,name:'Pack check',level:12,stats:{strength:50,endurance:50,willpower:50,intelligence:50,agility:50,speed:50,personality:50,luck:50},skills:new Array(35).fill(40),items:Object.values(cases),goldPieces:0,spells:[],activeEffects:[],health:100,maxHealth:100,magicka:20,maxMagicka:20,fatigue:200,maxFatigue:200};
const chest=[mk('Chest cuirass','Armor',102,{material:513,value:600}),mk('Chest bow','Weapons',130,{material:1,value:200})];
const host=document.getElementById('enhanced-inventory');
let view=null;
const mount=(withChest)=>{view?.unmount?.();view=mountEnhancedInventory(host,{entity,items:()=>entity.items,getQuest:()=>null,owner:{done:false},...(withChest?{loot:{items:()=>chest,title:'Chest',storage:true}}:{})});return view;};
window.probe={cases,entity,chest,mount,addItem,repaint:()=>view.repaint(),view:()=>view,mk};
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
  const browser = await chromium.launch();
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
      const hooks = [...cache.values()].flatMap((r) => r.log).filter(([id]) => id.startsWith('inventory.'));
      assert.deepEqual([...new Set(hooks.filter(([, n]) => n > 0).map(([id]) => id))].sort(), ['inventory.pages', 'inventory.receipt', 'inventory.view'], locale + ': the three hooks');
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

      // ALONE: the window wide, two columns of dressed rows, one height for the virtual list
      const geo = async () => tab.evaluate(() => {
        const box = (s) => { const n = document.querySelector(s); if (!n) return null; const b = n.getBoundingClientRect(); return { x: Math.round(b.x), w: Math.round(b.width), h: Math.round(b.height) }; };
        return { win: box('.pack-win'), dock: box('.pack-dock'), paired: !!document.querySelector('.pack-shell.paired'), view: document.documentElement.dataset.dfoPackView,
          buttons: [...document.querySelectorAll('.pack-id .act')].map((b) => b.textContent), headH: box('.pack-id').h };
      });
      await tab.evaluate(() => document.querySelectorAll('.pack-dock .packtab')[0].click());
      let g = await geo();
      assert.equal(g.paired, false); assert.equal(g.view, 'rows');
      assert.ok(g.win.w >= 1300, `${locale}: the window widens alone (${g.win.w})`);
      assert.ok(g.dock.w >= 660, `${locale}: the dock holds two columns (${g.dock.w})`);
      for (const k of ['pack.view.rows', 'pack.view.grid', 'pack.sort.auto', 'pack.junk.button']) assert.ok(g.buttons.includes(T(k)), `${locale}: header button ${T(k)}`);
      seen = await pages();
      const weapons = seen.out[0];
      assert.equal(new Set(weapons.map((r) => r.x)).size, 2, locale + ': two columns of rows alone');
      assert.ok(weapons.every((r) => r.dressed), locale + ': the rows in the card\'s dress');
      const heights = new Set(Object.values(seen.out).flat().map((r) => r.h));
      assert.equal(heights.size, 1, `${locale}: every row the one height (${[...heights]})`);
      if (shots) { fs.mkdirSync(shots, { recursive: true }); await tab.evaluate(() => document.querySelectorAll('.pack-dock .packtab')[0].click()); await tab.screenshot({ path: path.join(shots, `pack-alone-rows-${locale}.png`) }); }

      // THE ICON VIEW: the same window, the native plates filling the field
      await tab.getByRole('button', { name: T('pack.view.grid'), exact: true }).click();
      const g2 = await geo();
      assert.equal(g2.view, 'grid');
      assert.equal(g2.win.w, g.win.w, locale + ': the icon view keeps the window');
      const plates = await tab.evaluate(() => [...document.querySelectorAll('.pack-dock .packcol .itemrow')].map((r) => { const b = r.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), y: Math.round(b.y) }; }));
      assert.ok(plates.every((p) => p.w === 64 && p.h === 64), locale + ': the native plates');
      assert.equal(new Set(plates.map((p) => p.y)).size, 1, locale + ': four plates on one line of the wide dock');
      await tab.evaluate(() => [...document.querySelectorAll('.pack-dock .packtab')][8].click());
      assert.equal(await tab.evaluate(() => document.querySelector('.pack-dock .itemrow[data-dfo-stack="3"] > .count')?.textContent), '3', locale + ': the icon says the surrogate count');
      if (shots) await tab.screenshot({ path: path.join(shots, `pack-alone-grid-${locale}.png`) });
      await tab.getByRole('button', { name: T('pack.view.rows'), exact: true }).click();
      assert.equal(store.packState().view, 'rows', locale + ': the view kept in the mod\'s cache');

      // THE SORT: never in the background; on an act in the pack; off when the player says so
      const order = () => tab.evaluate(() => window.probe.entity.items.filter((it) => it.group === 'Weapons').map((it) => Object.entries(window.probe.cases).find(([, c]) => c === it)[0]));
      await tab.evaluate(() => { const items = window.probe.entity.items; const i = items.indexOf(window.probe.cases.rare); items.push(items.splice(i, 1)[0]); window.probe.repaint(); });
      assert.equal((await order()).at(-1), 'rare', locale + ': a background repaint does not sort');
      await tab.evaluate(() => { document.querySelector('.pack-win').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); window.probe.repaint(); });
      assert.equal((await order())[0], 'rare', locale + ': an act in the pack sorts');
      await tab.getByRole('button', { name: T('pack.sort.auto'), exact: true }).click();
      assert.equal(store.packState().autoSort, false);
      await tab.evaluate(() => { const items = window.probe.entity.items; const i = items.indexOf(window.probe.cases.rare); items.push(items.splice(i, 1)[0]); document.querySelector('.pack-win').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); window.probe.repaint(); });
      assert.equal((await order()).at(-1), 'rare', locale + ': no sort while it is off');
      await tab.getByRole('button', { name: T('pack.sort.auto'), exact: true }).click();
      assert.equal((await order())[0], 'rare', locale + ': turning it on sorts at once');

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

      // BESIDE A CHEST: the native width, one column
      await tab.evaluate(() => window.probe.mount(true));
      g = await geo();
      assert.equal(g.paired, true);
      assert.ok(g.win.w <= 1040, `${locale}: the native width beside a container (${g.win.w})`);
      seen = await pages();
      assert.equal(new Set(seen.out[0].map((r) => r.x)).size, 1, locale + ': one column beside a container');
      assert.ok(seen.out[0].every((r) => r.dressed), locale + ': dressed rows beside a container');
      if (shots) { await tab.evaluate(() => document.querySelectorAll('.pack-dock .packtab')[0].click()); await tab.screenshot({ path: path.join(shots, `pack-paired-rows-${locale}.png`) }); }
      await tab.evaluate(() => window.probe.mount(false));

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
      await tab.close();
    }
    assert.deepEqual(errors, [], 'no page errors');
    console.log('pack stand: pages, views, stacks, junk, sort and the letter lock checked in en and ru');
  } finally { await browser.close(); await new Promise((r) => server.close(r)); fs.rmSync(userData, { recursive: true, force: true }); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
