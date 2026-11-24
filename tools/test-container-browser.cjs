#!/usr/bin/env node
'use strict';
// End-to-end Chromium integration test for container windows (.loot-win) on real game bundles (EN & RU).
// Usage: node tools/test-container-browser.cjs "$DFO_BUILD_DIR"   (optional DFO_SCREENSHOT_DIR=dir)
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.DFO_PLAYWRIGHT_MODULE || 'playwright');
const { buildDict, buildI18n } = require('../src/ru-build.cjs');
const { say } = require('./ui-text-stand.cjs');
const itemText = require('../src/mod/item-text.cjs');
const { transformAsset } = require('../src/mod/transforms.cjs');
const { createLootStore } = require('../src/mod/loot-store.cjs');

const root = path.resolve(__dirname, '..');
const mod = path.join(root, 'src/mod');
const build = path.resolve(process.argv[2] || process.env.DFO_BUILD_DIR || '');
const assets = path.join(build, 'assets');

const readAsset = (f) => fs.readFileSync(path.join(assets, f), 'utf8');
const files = fs.readdirSync(assets).filter((f) => f.endsWith('.js') && !/Worker-/.test(f));
const addHome = files.find((f) => readAsset(f).includes('AddItem() encountered a duplicate item'));
const addName = addHome && /function ([\w$]+)\([\w$]+,[\w$]+,[\w$]+=`back`\)\{let [\w$]+=[\w$]+\([\w$]+,[\w$]+\);return/.exec(readAsset(addHome))?.[1];
const addAlias = addName && new RegExp(`[{,]${addName.replace(/\$/g, '\\$')} as ([\\w$]+)[,}]`).exec(readAsset(addHome).slice(readAsset(addHome).lastIndexOf('export{')))?.[1];
const entry = (addHome && files.find((f) => /^enhancedInventory-/.test(f) && readAsset(f).includes(`./${addHome}`)))
  || files.find((f) => /^enhancedInventory-/.test(f) && readAsset(f).includes('as mountEnhancedInventory'))
  || files.find((f) => /^enhancedInventory-/.test(f) && readAsset(f).includes('globalThis.__pack='));
const mountName = entry && /pointerLockElement[\s\S]{0,120}?function ([\w$]+)\([\w$]+,[\w$]+=\{\}\)\{/.exec(readAsset(entry))?.[1];
const mountAlias = entry && (readAsset(entry).match(new RegExp(`\\b${mountName}\\s+as\\s+([\\w$]+)`))?.[1] ?? 'mountEnhancedInventory');
const cssEntry = fs.readdirSync(assets).find((f) => /^index-.*\.css$/.test(f));

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'dfo-container-browser-'));
const store = createLootStore(userData);
const ctx = { itemCards: true, inventory: true, nearbyLoot: true, dungeons: false, marks: false, fonts: true, ru: false };
const cache = new Map();

const buildHtml = (locale) => `<!doctype html><html><head><meta charset="utf-8">
${cssEntry ? `<link rel="stylesheet" href="/assets/${cssEntry}">` : ''}
<style>
html,body{margin:0;background:#11161d;height:100%;overflow:hidden}
</style>
<script>window.__DFO_MOD_CFG__={itemCards:{enabled:true},inventory:{enabled:true},nearbyLoot:{enabled:true},ru:{on:${locale === 'ru'}}};</script>
<script src="/dfo-mod/dfo_ui_text_data.js?${locale}"></script><script src="/dfo-mod/dfo_ui_text.js"></script>
${locale === 'ru' ? '<script src="/dfo-mod/ru_dict.js"></script><script src="/dfo-mod/ru_i18n.js"></script><script src="/dfo-mod/ru_items.js"></script>' : ''}
<script src="/dfo-mod/dfo_item_text_data.js?${locale}"></script><script src="/dfo-mod/dfo_item_text.js"></script><script src="/dfo-mod/dfo_item_cards.js"></script>
<script src="/dfo-mod/dfo_loot_rules.js"></script><script src="/dfo-mod/dfo_loot_ui.js"></script><script src="/dfo-mod/dfo_loot.js"></script>
<script src="/dfo-mod/dfo_pack_data.js"></script><script src="/dfo-mod/dfo_pack_rules.js"></script><script src="/dfo-mod/dfo_pack.js"></script>
<script src="/dfo-mod/dfo_container.js"></script>
</head><body><div id="enhanced-inventory"></div><script type="module">
import {${mountAlias} as mountEnhancedInventory} from '/assets/${entry}';
${addHome && addAlias ? `import {${addAlias} as addItem} from '/assets/${addHome}';` : 'const addItem = () => {};'}
let seq = 1;
const base = { stackCount: 1, currentCondition: 100, maxCondition: 100, flags: 0, isIdentified: true };
const mk = (name, group, templateIndex, extra = {}) => ({ ...base, uid: 'uid-' + (seq++), name, group, templateIndex, ...extra });

const entity = {
  isPlayer: true,
  name: 'Alder Tester',
  level: 14,
  stats: { strength: 55, endurance: 55, willpower: 50, intelligence: 50, agility: 50, speed: 50, personality: 50, luck: 50 },
  skills: new Array(35).fill(40),
  items: [
    mk('Materials Bag', 'UselessItems2', 600),
    mk('Small Cart', 'Transportation', 93),
    mk('Iron Longsword', 'Weapons', 120, { material: 0, value: 180 }),
    mk('Silver Arrows', 'Weapons', 142, { material: 2, isAmmo: true, stackCount: 25, value: 4 }),
    mk('Healing Potion', 'UselessItems1', 197, { stackCount: 6, value: 45, potionRecipeKey: 0 }),
    mk('Red Flowers', 'PlantIngredients1', 10, { stackCount: 12, value: 4 }),
  ],
  wagonItems: [mk('Wagon Halberd', 'Weapons', 127, { material: 1, value: 320 })],
  bagItems: [mk('Herbal Bundle', 'PlantIngredients1', 10, { stackCount: 10, value: 6 })],
  goldPieces: 14250,
  sGroupReputations: [10, 10, 10, 10, 10],
  reactionMods: [0, 0, 0, 0, 0],
  biographyReactionMod: 0,
  spells: [],
  activeEffects: [],
  health: 100, maxHealth: 100, magicka: 50, maxMagicka: 50, fatigue: 200, maxFatigue: 200,
};

function makeChestPool() {
  const arr = [
    mk('Mithril Katana', 'Weapons', 122, { material: 5, rarity: 'rare', value: 1800, affixes: [{ id: 'damage', value: 18 }] }),
    mk('Steel Cuirass', 'Armor', 102, { material: 513, rarity: 'magic', value: 650, enchantments: [{ type: 0, param: 0 }] }),
    mk('Healing Potion', 'UselessItems1', 197, { stackCount: 5, value: 45, potionRecipeKey: 0 }),
    mk('Elven Arrows', 'Weapons', 142, { material: 3, isAmmo: true, stackCount: 20, value: 6 }),
    mk('Gold Pieces', 'Currency', 276, { stackCount: 250, value: 1 }),
    mk('Ruby', 'Gems', 0, { value: 250 }),
    mk('Holy Dagger', 'ReligiousItems', 270, { value: 30 }),
    mk('Book of Lore', 'Books', 277, { value: 40, message: 3 }),
    mk('Red Flowers', 'PlantIngredients1', 10, { stackCount: 8, value: 4 }),
    mk('Iron Longsword', 'Weapons', 120, { material: 0, value: 180, junk: true }),
  ];
  for (let i = 0; i < 18; i++) arr.push(mk('Dagger #' + i, 'Weapons', 113, { material: 0, value: 25 }));
  return arr;
}

let chest = makeChestPool();
let ground = [mk('Ground Shield', 'Armor', 108, { material: 1, value: 200 }), mk('Ground Potion', 'UselessItems1', 197, { stackCount: 3, value: 40 })];
let view = null;
const calls = { chosenReward: null, fateChoice: null, nearbyTaken: null, closed: false };
const host = document.getElementById('enhanced-inventory');

function mountMode(mode) {
  view?.unmount?.();
  calls.closed = false;
  let deps = {
    entity,
    items: () => entity.items,
    getQuest: () => null,
    onExit: () => { calls.closed = true; },
  };
  if (mode === 'solo') {
    deps.loot = { items: () => chest, title: 'Ancient Chest', storage: false };
  } else if (mode === 'paired') {
    deps.loot = {
      items: () => chest,
      title: 'Vault Chest',
      storage: true,
      vaultPour: () => { chest.push(mk('Vault Sapphire', 'Gems', 2, { value: 400 })); return [1]; },
    };
  } else if (mode === 'nearby') {
    const nearbyObj = {
      nearby: true,
      items: () => ground,
      isClosed: () => false,
      takeAll: (rows) => { calls.nearbyTaken = rows.slice(); ground.length = 0; return { failed: 0, refusal: '' }; },
      commit: (dir, item, amt) => {
        if (dir === 'take') {
          const i = ground.indexOf(item);
          if (i >= 0) ground.splice(i, 1);
        }
        return true;
      },
    };
    deps.loot = nearbyObj;
  } else if (mode === 'ground-paired') {
    // No deps.loot: pack opens with R.kind === 'ground', count 0; dropping an item opens paired .loot-win[data-dfo-loot-kind="ground"]
  } else if (mode === 'reward') {
    const r1 = mk('Sword of Dawn', 'Weapons', 120, { material: 5, rarity: 'rare', value: 1200 });
    const r2 = mk('Aetheric Staff', 'Weapons', 129, { material: 6, rarity: 'legendary', value: 2400 });
    deps.chooseOne = {
      title: 'Quest Reward',
      items: [r1, r2],
      onChoose: (it) => { calls.chosenReward = it?.name || null; },
    };
    deps.loot = { items: () => [r1, r2], title: 'Quest Reward', storage: false };
  } else if (mode === 'fate') {
    const trophy = mk('Bandit Ring', 'Jewellery', 135, { rarity: 'magic', value: 500 });
    deps.fate = {
      name: 'Blackguard',
      sub: 'Cornered Highwayman',
      mood: 'Desperate',
      plea: { speech: 'Mercy, traveller!', body: 'He clutches a battered silver ring.' },
      trophy,
      options: [
        { id: 'kill', key: '1', verb: 'Execute', title: 'Bandit Ring', detail: 'Strike him down and claim his ring.', confirm: 'End the Blackguard?' },
        { id: 'spare', key: '2', verb: 'Spare', title: 'Let Him Go', detail: 'Grant clemency and earn renown.', confirm: 'Let him flee?' },
      ],
      choose: (id) => { calls.fateChoice = id; },
    };
  }
  view = mountEnhancedInventory(host, deps);
  return view;
}

window.testProbe = {
  mountMode,
  entity,
  getChest: () => chest,
  setChest: (arr) => { chest = Array.isArray(arr) ? arr : []; },
  setGround: (arr) => { ground = Array.isArray(arr) ? arr : []; },
  resetChest: () => { chest = makeChestPool(); },
  getCalls: () => calls,
  view: () => view,
  pack: () => window.__dfoPack,
};

mountMode('solo');
window.ready = true;
</script></body></html>`;

const send = (res, type, body) => { res.setHeader('Content-Type', type); res.end(body); };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const locale = url.searchParams.has('ru') || (req.headers.referer || '').includes('?ru') ? 'ru' : 'en';
    if (url.pathname === '/') return send(res, 'text/html;charset=utf-8', buildHtml(locale));
    if (url.pathname === '/dfo-mod/pack-settings') {
      if (req.method === 'GET') return send(res, 'application/json', JSON.stringify(store.packState()));
      let body = ''; for await (const chunk of req) body += chunk;
      return send(res, 'application/json', JSON.stringify(store.savePack(JSON.parse(body))));
    }
    if (url.pathname === '/dfo-mod/loot-settings') {
      if (req.method === 'GET') return send(res, 'application/json', JSON.stringify(store.clean({ autoLoot: false })));
      let body = ''; for await (const chunk of req) body += chunk;
      return send(res, 'application/json', body || '{}');
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
    if (!file.endsWith('.js')) {
      const ext = path.extname(file);
      const mime = ext === '.css' ? 'text/css' : 'application/octet-stream';
      return send(res, mime, fs.readFileSync(file));
    }
    if (!cache.has(file)) cache.set(file, transformAsset(url.pathname.slice(1), fs.readFileSync(file, 'utf8'), { ...ctx, ru: locale === 'ru' }));
    return send(res, 'text/javascript', cache.get(file).text);
  } catch (e) {
    res.writeHead(500);
    res.end(String(e?.stack || e));
  }
});

async function main() {
  assert.ok(entry, 'enhancedInventory bundle required in DFO_BUILD_DIR');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ ...(process.env.CHROMIUM_BIN ? { executablePath: process.env.CHROMIUM_BIN } : {}) });
  const shots = process.env.DFO_SCREENSHOT_DIR;
  if (shots) fs.mkdirSync(shots, { recursive: true });
  const errors = [];

  try {
    for (const locale of ['en', 'ru']) {
      const T = (key, params) => say(key, params, locale);
      const tab = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      tab.on('pageerror', (e) => errors.push(`${locale}: ${e.stack || e}`));
      await tab.goto(`http://127.0.0.1:${server.address().port}/${locale === 'ru' ? '?ru' : ''}`, { waitUntil: 'domcontentloaded' });
      await tab.waitForFunction(() => window.ready && window.__dfoPack && window.__dfoContainer);
      await tab.evaluate(async () => {
        await window.__dfoPack.load();
        window.testProbe.mountMode('solo');
        try { await Promise.all(['DFO Greengoth', 'DFO Flexi', 'DFO Gabin'].map((f) => document.fonts.load('16px "' + f + '"'))); } catch {}
      });

      // 1. Solo container geometry, controls, cascade, search & dropdowns
      const soloMetrics = await tab.evaluate(() => {
        const w = document.querySelector('.loot-win');
        const wr = w.getBoundingClientRect();
        const rl = w.querySelector('.remotelist');
        const head = w.querySelector('.remotehead');
        const cats = [...w.querySelectorAll('.storecat .dfo-loot-dd-opt')];
        return {
          attr: document.documentElement.dataset.dfoContainer,
          lastHeadId: document.head.lastElementChild?.id,
          width: Math.round(wr.width),
          height: Math.round(wr.height),
          cols: getComputedStyle(rl).gridTemplateColumns.split(' ').length,
          gold: w.querySelector('.dfo-loot-gold .v')?.textContent?.trim(),
          overflow: getComputedStyle(w).overflow,
          hasUtil: !!w.querySelector('.dfo-loot-utilbar'),
          hasFilter: !!w.querySelector('.storefilter'),
          hasFoot: !!w.querySelector('.dfo-loot-foot'),
          rowsCount: w.querySelectorAll('.remotelist .itemrow').length,
          headText: head?.querySelector('h3')?.textContent,
        };
      });
      assert.equal(soloMetrics.attr, '1', `${locale}: root attribute`);
      assert.equal(soloMetrics.lastHeadId, 'dfo-container-style', `${locale}: container stylesheet last in head`);
      assert.equal(soloMetrics.width, 680, `${locale}: solo width 680`);
      assert.equal(soloMetrics.height, 700, `${locale}: solo height 700`);
      assert.equal(soloMetrics.cols, 2, `${locale}: 2-column grid in solo`);
      assert.equal(soloMetrics.overflow, 'visible', `${locale}: overflow visible so solo .packtip is never clipped`);
      assert.ok(soloMetrics.hasUtil && soloMetrics.hasFilter && soloMetrics.hasFoot, `${locale}: all 3 container bars present`);

      // Category dropdown: opens cleanly, 10 items (All + 9 Pages, no Magic/Materials)
      await tab.click('.loot-win .storecat .dfo-loot-dd-btn');
      const catOpts = await tab.$$eval('.loot-win .storecat .dfo-loot-dd-opt', (els) => els.map((e) => e.dataset.value));
      assert.deepEqual(catOpts, ['all', 'weapons', 'armor', 'clothing', 'potions', 'ingredients', 'books', 'valuables', 'misc', 'junk'], `${locale}: category options match inventory 9 pages`);
      await tab.click('.loot-win .storecat .dfo-loot-dd-opt[data-value="weapons"]');
      const afterCatCount = await tab.locator('.loot-win .dfo-find-count').textContent();
      assert.ok(/^\d+\/28$/.test(afterCatCount), `${locale}: filtered count ratio shown (${afterCatCount})`);
      await tab.click('.loot-win .storecat .dfo-loot-dd-btn');
      await tab.click('.loot-win .storecat .dfo-loot-dd-opt[data-value="all"]');

      // Search & zero-jump empty check
      await tab.fill('.loot-win .storesearch', 'no-such-item-xyzzy');
      const zeroMetrics = await tab.evaluate(() => {
        const w = document.querySelector('.loot-win');
        const r = w.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), empty: !!w.querySelector('.remotelist .packempty'), hasFilter: !!w.querySelector('.storefilter') };
      });
      assert.equal(zeroMetrics.w, 680, `${locale}: width stays 680 when filtered empty`);
      assert.equal(zeroMetrics.h, 700, `${locale}: height stays 700 when filtered empty`);
      assert.ok(zeroMetrics.empty && zeroMetrics.hasFilter, `${locale}: empty state + filter stay visible`);
      await tab.click('.loot-win .dfo-find-clear');

      // Pure-JS card search: matches card effect/stats, excludes lower .dfo-item-text lore/hint prose
      const inspectItemAndReadTip = async (target) => {
        const row = typeof target === 'number'
          ? tab.locator('.loot-win .remotelist .itemrow').nth(target)
          : tab.locator('.loot-win .remotelist .itemrow', { hasText: target }).first();
        await row.click({ button: 'right' });
        await tab.waitForSelector('.inv-menu');
        await tab.getByRole('menuitem', { name: T('container.action.inspect') }).click();
        await tab.waitForSelector('.packdetail.packtip .dfo-item-card');
        return tab.evaluate(() => {
          const walkWords = (el, skip) => {
            if (!el) return '';
            const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
              acceptNode: (n) => (skip && skip.contains(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
            });
            const parts = [];
            for (let n; (n = w.nextNode()); ) {
              const s = n.nodeValue?.trim();
              if (s) parts.push(s);
            }
            return parts.join(' ');
          };
          const card = document.querySelector('.packdetail.packtip .dfo-item-card');
          const loreEl = card?.querySelector('.dfo-item-text');
          const lore = walkWords(loreEl);
          const nonLore = walkWords(card, loreEl);
          const effectText = [...(card?.querySelectorAll('.dfo-item-group [aria-label]') || [])].map((r) => r.getAttribute('aria-label') || '').join(' ');
          const metal = card?.querySelector('.dfo-item-metal')?.textContent?.trim() || '';
          const rowsText = [...document.querySelectorAll('.loot-win .remotelist .itemrow')].map((r) => walkWords(r)).join(' ');
          return { lore, nonLore, effectText, metal, rowsText };
        });
      };
      const cuirassTip = await inspectItemAndReadTip(/Steel Cuirass|Стальн.*кирас|Кирас/i);
      const effectWords = (cuirassTip.effectText.match(/[a-zа-яё]{4,}/gi) || []);
      assert.ok(effectWords.length > 0, `${locale}: inspected Steel Cuirass has rendered enchantment effect text (${JSON.stringify(cuirassTip.effectText)})`);
      const matWord = (cuirassTip.metal.match(/[a-zа-яё]{4,}/gi) || [])[0] || '';
      const qMulti = [effectWords[0], matWord].filter(Boolean).join(' ');
      await tab.fill('.loot-win .storesearch', qMulti);
      const cardMatchCount = await tab.locator('.loot-win .dfo-find-count').textContent();
      assert.ok(/^[1-9]\d*\/28$/.test(cardMatchCount), `${locale}: card search "${qMulti}" matches enchantment + material (${cardMatchCount})`);
      await tab.click('.loot-win .dfo-find-clear');

      const findLoreOnlyWord = (info) => {
        const norm = (s) => s.toLowerCase().replace(/ё/g, 'е');
        const haystack = norm(info.rowsText + ' ' + info.nonLore);
        return (info.lore.match(/[a-zа-яё]{5,}/gi) || []).find((w) => !haystack.includes(norm(w)));
      };
      let loreOnlyWord = findLoreOnlyWord(cuirassTip);
      for (const idx of [0, 2, 4, 6]) {
        if (loreOnlyWord) break;
        await tab.evaluate(() => window.testProbe.mountMode('solo'));
        await tab.waitForSelector('.loot-win .remotelist .itemrow');
        loreOnlyWord = findLoreOnlyWord(await inspectItemAndReadTip(idx));
      }
      assert.ok(loreOnlyWord, `${locale}: located lore-only hint word outside card header/effects`);
      await tab.fill('.loot-win .storesearch', loreOnlyWord);
      const loreMatchCount = await tab.locator('.loot-win .dfo-find-count').textContent();
      assert.equal(loreMatchCount, '0/28', `${locale}: lore word "${loreOnlyWord}" excluded from card search index (${loreMatchCount})`);
      await tab.evaluate(() => window.testProbe.mountMode('solo'));
      await tab.waitForSelector('.loot-win .dfo-loot-sort');

      // Sort cycle
      const sortBtn = tab.locator('.loot-win .dfo-loot-sort');
      const s0 = await sortBtn.textContent();
      await sortBtn.click();
      const s1 = await sortBtn.textContent();
      assert.notEqual(s0, s1, `${locale}: sort button cycles label`);

      // 2. Stack transfers (LMB=1, Currency coin pile=all, Ctrl+Shift+LMB=modal, RMB Inspect unclipped .packtip, scroll preserved)
      // Reset back to default order for predictable row targeting
      while ((await sortBtn.textContent()) !== s0) await sortBtn.click();

      const arrowRow = tab.locator('.loot-win .remotelist .itemrow', { hasText: /Elven Arrows|Эльфийские стрелы/i }).first();
      // Ctrl+Shift+LMB opens [O-02] quantity modal
      await arrowRow.click({ modifiers: ['Control', 'Shift'] });
      await tab.waitForSelector('.dfo-loot-modal-input');
      await tab.fill('.dfo-loot-modal-input', '7');
      await tab.click('.dfo-loot-modal-foot .primary');
      await tab.waitForSelector('.dfo-loot-modal-backdrop', { state: 'detached' });

      const afterArrowQty = await tab.evaluate(() => window.testProbe.getChest().find((x) => x.isAmmo)?.stackCount);
      assert.equal(afterArrowQty, 13, `${locale}: Ctrl+Shift modal took 7 from 20 -> 13 left`);

      // Scroll list down and click a visible lower row ('Dagger #12') -> assert scrollTop stays preserved after repaint
      await tab.evaluate(() => { document.querySelector('.loot-win .remotelist').scrollTop = 120; });
      await tab.locator('.loot-win .remotelist .itemrow', { hasText: /Dagger #12/i }).first().click();
      const afterScroll = await tab.evaluate(() => document.querySelector('.loot-win .remotelist').scrollTop);
      assert.ok(afterScroll >= 80, `${locale}: scrollTop preserved across transfer repaint (${afterScroll})`);

      // LMB on Healing Potion stack (5) takes 1
      const potionRow = tab.locator('.loot-win .remotelist .itemrow', { hasText: /Зелье|Potion/i }).first();
      await potionRow.click();
      const potionLeft = await tab.evaluate(() => window.testProbe.getChest().find((x) => x.templateIndex === 197)?.stackCount);
      assert.equal(potionLeft, 4, `${locale}: plain LMB took 1 from 5 -> 4 left`);

      // Shift+LMB takes remaining 4
      await tab.locator('.loot-win .remotelist .itemrow', { hasText: /Зелье|Potion/i }).first().click({ modifiers: ['Shift'] });
      const potionGone = await tab.evaluate(() => window.testProbe.getChest().some((x) => x.templateIndex === 197));
      assert.equal(potionGone, false, `${locale}: Shift+LMB took entire remaining stack`);

      // Gold pieces LMB takes all 250 coins into pocketGold
      const goldRow = tab.locator('.loot-win .remotelist .itemrow', { hasText: /Золот|Gold/i }).first();
      await goldRow.click();
      assert.equal(await tab.evaluate(() => window.testProbe.entity.goldPieces), 14500, `${locale}: Currency coin pile looted full amount`);

      // RMB context menu on stacked Elven Arrows -> Take 1 / Take stack / Take amount… / Inspect -> solo .packtip visible & unclipped
      await tab.locator('.loot-win .remotelist .itemrow', { hasText: /Elven Arrows|Эльфийские стрелы/i }).first().click({ button: 'right' });
      await tab.waitForSelector('.inv-menu');
      const menuCheck = await tab.evaluate(() => ({
        hasQtyInput: !!document.querySelector('.inv-menu label.qtyfield'),
        actsCount: document.querySelectorAll('.inv-menu .inv-menu-item').length,
      }));
      assert.equal(menuCheck.hasQtyInput, false, `${locale}: native inline qtyfield removed from container stack menu`);
      assert.ok(menuCheck.actsCount >= 4, `${locale}: Take 1 / stack / amount / Inspect actions present (${menuCheck.actsCount})`);
      await tab.getByRole('menuitem', { name: T('container.action.inspect') }).click();
      const tipBox = await tab.evaluate(() => {
        const tip = document.querySelector('.packdetail.packtip');
        if (!tip) return null;
        const r = tip.getBoundingClientRect();
        return { w: r.width, h: r.height, left: r.left, right: r.right, top: r.top };
      });
      assert.ok(tipBox && tipBox.w > 180 && tipBox.h > 80, `${locale}: solo .packtip is visible and not clipped (${JSON.stringify(tipBox)})`);
      if (shots) await tab.screenshot({ path: path.join(shots, `container-solo-${locale}.png`) });

      // 3. Paired Storage (.pack-win untouched + height sync V2 <-> V1 + Wagon & Bag toggles + Local Ctrl+Shift stow)
      await tab.evaluate(() => {
        window.testProbe.resetChest();
        window.testProbe.mountMode('paired');
      });
      await tab.waitForSelector('.pack-shell.paired .loot-win');
      await tab.waitForSelector('.pack-shell.paired .pack-win');
      const pairedHeights = await tab.evaluate(() => {
        const lw = document.querySelector('.loot-win').getBoundingClientRect();
        const pw = document.querySelector('.pack-win').getBoundingClientRect();
        return { lw: Math.round(lw.width), lh: Math.round(lw.height), pw: Math.round(pw.width), ph: Math.round(pw.height), packTabs: document.querySelectorAll('.pack-win .packtab').length };
      });
      assert.equal(pairedHeights.lw, 680, `${locale}: paired container width 680 on 1920x1080`);
      assert.ok(Math.abs(pairedHeights.lh - pairedHeights.ph) <= 2, `${locale}: paired container height (${pairedHeights.lh}) matches .pack-win (${pairedHeights.ph})`);
      assert.equal(pairedHeights.packTabs, 9, `${locale}: player .pack-win preserves 9 tabs untouched`);
      if (shots) await tab.screenshot({ path: path.join(shots, `container-paired-${locale}.png`) });

      // Local .pack-win: plain LMB stays native (no stow modal / count unchanged), Ctrl+Shift+LMB opens [O-02] stow modal
      await tab.locator('.pack-win .packtab', { hasText: /Ingredients|Ингредиент/i }).first().click();
      const packFlowers = tab.locator('.pack-win .itemrow', { hasText: /Red Flowers|Красн.*цвет/i }).first();
      await packFlowers.click();
      assert.equal(await tab.locator('.dfo-loot-modal-input').count(), 0, `${locale}: plain LMB on .pack-win stays native without stow modal`);
      assert.equal(await tab.evaluate(() => window.testProbe.entity.items.find((x) => x.templateIndex === 10)?.stackCount), 12, `${locale}: plain LMB on .pack-win did not alter stack`);

      await packFlowers.click({ modifiers: ['Control', 'Shift'] });
      await tab.waitForSelector('.dfo-loot-modal-input');
      await tab.fill('.dfo-loot-modal-input', '4');
      await tab.click('.dfo-loot-modal-foot .primary');
      await tab.waitForSelector('.dfo-loot-modal-backdrop', { state: 'detached' });
      const afterStow = await tab.evaluate(() => ({
        packQty: window.testProbe.entity.items.find((x) => x.templateIndex === 10)?.stackCount,
        chestTotalFlowers: window.testProbe.getChest().filter((x) => x.templateIndex === 10).reduce((s, x) => s + (x.stackCount || 1), 0),
      }));
      assert.equal(afterStow.packQty, 8, `${locale}: Ctrl+Shift+LMB stowed 4 from .pack-win (12 -> 8)`);
      assert.equal(afterStow.chestTotalFlowers, 12, `${locale}: Ctrl+Shift+LMB added 4 into chest (8 -> 12)`);
      await tab.locator('.pack-win .packtab').first().click();

      // Charcol v2 <-> v1 height tracking
      const charcolToggleBtn = tab.locator('.pack-win .dfo-pack-view > button').nth(1);
      await charcolToggleBtn.click();
      await tab.waitForFunction(() => document.documentElement.dataset.dfoCharcol === 'v1');
      await tab.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const v1Heights = await tab.evaluate(() => ({
        lh: Math.round(document.querySelector('.loot-win').getBoundingClientRect().height),
        ph: Math.round(document.querySelector('.pack-win').getBoundingClientRect().height),
      }));
      assert.ok(Math.abs(v1Heights.lh - v1Heights.ph) <= 2, `${locale}: V1 paired height (${v1Heights.lh}) tracks .pack-win (${v1Heights.ph})`);
      await charcolToggleBtn.click();
      await tab.waitForFunction(() => document.documentElement.dataset.dfoCharcol === 'v2');
      await tab.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const v2Heights = await tab.evaluate(() => ({
        lh: Math.round(document.querySelector('.loot-win').getBoundingClientRect().height),
        ph: Math.round(document.querySelector('.pack-win').getBoundingClientRect().height),
      }));
      assert.ok(Math.abs(v2Heights.lh - v2Heights.ph) <= 2, `${locale}: V2 restored paired height (${v2Heights.lh}) tracks .pack-win (${v2Heights.ph})`);

      // Narrow paired desktop (1440x900 -> 340px width, 1 column, wrapped buttons, zero horizontal overflow)
      await tab.setViewportSize({ width: 1440, height: 900 });
      await tab.evaluate(() => {
        window.dispatchEvent(new Event('resize'));
        return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      });
      const narrowMetrics = await tab.evaluate(() => {
        const w = document.querySelector('.loot-win');
        const rl = w.querySelector('.remotelist');
        const util = w.querySelector('.dfo-loot-utilbar');
        const left = w.querySelector('.dfo-loot-util-left');
        const menus = w.querySelector('.storemenus');
        const foot = w.querySelector('.dfo-loot-foot-row');
        const wr = util.getBoundingClientRect();
        const btnOverflow = [...left.querySelectorAll('button')].filter((b) => getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().right > wr.right + 1).length;
        return {
          width: Math.round(w.getBoundingClientRect().width),
          rlDisplay: getComputedStyle(rl).display,
          wOverflow: w.scrollWidth - w.clientWidth,
          utilOverflow: util.scrollWidth - util.clientWidth,
          leftOverflow: left.scrollWidth - left.clientWidth,
          menusOverflow: menus.scrollWidth - menus.clientWidth,
          footOverflow: foot.scrollWidth - foot.clientWidth,
          btnOverflow,
        };
      });
      assert.equal(narrowMetrics.width, 340, `${locale}: narrow paired width 340 on 1440x900`);
      assert.equal(narrowMetrics.rlDisplay, 'flex', `${locale}: narrow paired uses single-column flex list`);
      assert.ok(narrowMetrics.utilOverflow <= 1 && narrowMetrics.leftOverflow <= 1 && narrowMetrics.menusOverflow <= 1 && narrowMetrics.footOverflow <= 1 && narrowMetrics.btnOverflow === 0, `${locale}: zero horizontal overflow on 1440x900 (${JSON.stringify(narrowMetrics)})`);
      await tab.setViewportSize({ width: 1920, height: 1080 });
      await tab.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

      // Wagon toggle
      await tab.click('.loot-win .dfo-loot-wagon');
      assert.equal(await tab.evaluate(() => document.querySelector('.loot-win')?.dataset.dfoLootKind), 'wagon', `${locale}: switched to wagon view`);
      await tab.click('.loot-win .dfo-loot-wagon');

      // Materials Bag toggle
      await tab.click('.loot-win .dfo-loot-bag');
      assert.equal(await tab.evaluate(() => document.querySelector('.loot-win')?.dataset.dfoLootKind), 'bag', `${locale}: switched to bag view`);
      await tab.click('.loot-win .dfo-loot-bag');

      // Coupled Stack: Salvage active in .pack-win + remote stack take / Ctrl+Shift modal + Cancel Enter + hotkey shield + Escape search blur + unmount cleanup
      await tab.evaluate(() => {
        if (!window.testProbe.entity.items.some((x) => x.uid === 'salv-probe')) {
          window.testProbe.entity.items.push({
            uid: 'salv-probe', name: 'Magic Longsword', group: 'Weapons', templateIndex: 120,
            material: 1, rarity: 'magic', value: 450, affixes: [{ id: 'damage', value: 10 }],
            stackCount: 1, currentCondition: 100, maxCondition: 100, flags: 0, isIdentified: true,
          });
        }
        window.testProbe.resetChest();
        window.testProbe.mountMode('paired');
      });
      await tab.waitForSelector('.pack-shell.paired .loot-win .remotelist .itemrow');
      await tab.waitForSelector('.pack-win .dfo-salvage-btn');
      await tab.click('.pack-win .dfo-salvage-btn');
      await tab.waitForSelector('.pack-win .dfo-salvage-btn.primary');
      await tab.locator('.loot-win .remotelist .itemrow', { hasText: /Elven Arrows|Эльфийские стрелы/i }).first().click();
      assert.equal(
        await tab.evaluate(() => window.testProbe.getChest().find((x) => x.isAmmo)?.stackCount),
        19,
        `${locale}: batch salvage in .pack-win does NOT break single-unit take (20 -> 19) in .loot-win`,
      );
      await tab.locator('.loot-win .remotelist .itemrow', { hasText: /Elven Arrows|Эльфийские стрелы/i }).first().click({ modifiers: ['Control', 'Shift'] });
      await tab.waitForSelector('.dfo-loot-modal-box');
      await tab.focus('.dfo-loot-modal-foot .silver');
      await tab.keyboard.press('KeyI');
      assert.equal(await tab.evaluate(() => window.testProbe.getCalls().closed), false, `${locale}: Inventory key while modal open does NOT close paired overlay`);
      await tab.keyboard.press('Enter');
      await tab.waitForSelector('.dfo-loot-modal-backdrop', { state: 'detached' });
      assert.equal(
        await tab.evaluate(() => window.testProbe.getChest().find((x) => x.isAmmo)?.stackCount),
        19,
        `${locale}: Enter on focused Cancel button closes modal WITHOUT confirming transfer`,
      );
      await tab.locator('.loot-win .remotelist .itemrow', { hasText: /Elven Arrows|Эльфийские стрелы/i }).first().click({ modifiers: ['Control', 'Shift'] });
      await tab.waitForSelector('.dfo-loot-modal-box');
      await tab.focus('.dfo-loot-modal-foot .silver');
      await tab.keyboard.press('Escape');
      await tab.waitForSelector('.dfo-loot-modal-backdrop', { state: 'detached' });
      assert.equal(await tab.evaluate(() => window.testProbe.getCalls().closed), false, `${locale}: Escape closes modal ONLY, keeping paired overlay open`);
      await tab.click('.pack-win .dfo-salvage-btn');

      // Paired Find in .pack-win stays alive & keeps query when taking item from .loot-win; Escape x2 exits empty .storesearch cleanly
      await tab.click('.pack-win .dfo-find-btn');
      await tab.waitForSelector('.pack-win .dfo-find-input');
      await tab.fill('.pack-win .dfo-find-input', locale === 'ru' ? 'зел' : 'potion');
      await tab.locator('.loot-win .remotelist .itemrow', { hasText: /Зелье|Potion/i }).first().click();
      assert.equal(await tab.locator('.pack-win .dfo-find-input').inputValue(), locale === 'ru' ? 'зел' : 'potion', `${locale}: paired remote take keeps Find open with active query`);
      await tab.click('.pack-win .dfo-find-btn');

      await tab.fill('.loot-win .storesearch', 'dagger');
      await tab.keyboard.press('Escape');
      assert.equal(await tab.locator('.loot-win .storesearch').inputValue(), '', `${locale}: first Escape in .storesearch clears query`);
      await tab.keyboard.press('Escape');
      assert.equal(await tab.evaluate(() => document.activeElement?.classList?.contains('storesearch')), false, `${locale}: second Escape blurs empty .storesearch`);
      assert.equal(await tab.evaluate(() => window.testProbe.getCalls().closed), false, `${locale}: blur Escape does not yet close overlay`);
      await tab.keyboard.press('Escape');
      assert.equal(await tab.evaluate(() => window.testProbe.getCalls().closed), true, `${locale}: third Escape closes overlay cleanly`);

      // Paired Ground becoming empty tears down .loot-win cleanly + unmount clears floating footer tooltip
      await tab.evaluate(() => {
        window.testProbe.mountMode('ground-paired');
      });
      await tab.waitForSelector('.pack-win .packcol .itemrow');
      await tab.locator('.pack-win .itemrow', { hasText: /Iron Longsword|Железный длинный меч/i }).first().click({ button: 'right' });
      await tab.waitForSelector('.inv-menu .inv-menu-item');
      await tab.locator('.inv-menu .inv-menu-item').nth(1).click();
      await tab.waitForSelector('.pack-shell.paired .loot-win[data-dfo-loot-kind="ground"] .remotelist .itemrow');
      await tab.locator('.loot-win .remotelist .itemrow').first().click();
      await tab.waitForFunction(() => !document.querySelector('.loot-win') && !document.querySelector('.pack-shell')?.classList?.contains('paired'));
      await tab.locator('.z-curr .dfo-curr-chip.is-gold').hover();
      await tab.waitForSelector('.dfo-status-tip');
      await tab.evaluate(() => window.testProbe.view().unmount());
      assert.equal(await tab.locator('.dfo-status-tip').count(), 0, `${locale}: unmount cleans up active footer status tooltip`);
      await tab.evaluate(() => {
        window.testProbe.resetChest();
        window.testProbe.mountMode('paired');
      });
      await tab.waitForSelector('.pack-shell.paired .loot-win');

      // 4. Nearby Loot single Take All integration
      await tab.evaluate(() => window.testProbe.mountMode('nearby'));
      await tab.waitForSelector('.loot-win .dfo-loot-actions');
      const nearbyCounts = await tab.evaluate(() => ({
        takeAllButtons: [...document.querySelectorAll('.loot-win button')].filter((b) => /Take all|Забрать вс/i.test(b.textContent)).length,
        hasFootTakeAll: !!document.querySelector('.loot-win .dfo-loot-takeall'),
      }));
      assert.equal(nearbyCounts.takeAllButtons, 1, `${locale}: only 1 unambiguous Take all button in Nearby Loot mode`);
      assert.equal(nearbyCounts.hasFootTakeAll, false, `${locale}: footer Take all omitted when Nearby Loot toolbar owns it`);

      // 5. Reward & Fate windows
      await tab.evaluate(() => window.testProbe.mountMode('reward'));
      await tab.waitForSelector('.loot-win.dfo-reward-win');
      const rRows = tab.locator('.loot-win .dfo-reward-row');
      assert.equal(await rRows.count(), 2, `${locale}: reward shows 2 items`);
      await rRows.nth(1).click();
      assert.equal(await tab.evaluate(() => !!document.querySelector('.packdetail.packtip')), false, `${locale}: clicking reward row does not pop .packtip`);
      if (shots) await tab.screenshot({ path: path.join(shots, `container-reward-${locale}.png`) });
      await tab.click('.loot-win .dfo-reward-claim');
      assert.equal(await tab.evaluate(() => window.testProbe.getCalls().chosenReward), 'Aetheric Staff', `${locale}: Claim button grants selected reward`);

      await tab.evaluate(() => window.testProbe.mountMode('fate'));
      await tab.waitForSelector('.loot-win.fate.dfo-fate-win');
      const fCards = tab.locator('.loot-win .dfo-fate-card');
      assert.equal(await fCards.count(), 2, `${locale}: fate shows 2 option cards`);
      await fCards.first().click();
      await tab.waitForSelector('.loot-win .dfo-fate-confirm .danger');
      if (shots) await tab.screenshot({ path: path.join(shots, `container-fate-${locale}.png`) });
      await tab.click('.loot-win .dfo-fate-confirm .danger');
      assert.equal(await tab.evaluate(() => window.testProbe.getCalls().fateChoice), 'kill', `${locale}: fate confirm executes choice`);

      // 6. 5,000-item stress regression check (virtualization, filter/sort/search accuracy, scroll preservation, zero errors) & <=640px mobile wrap
      await tab.evaluate(() => {
        const pool = new Array(5000);
        for (let i = 0; i < 5000; i++) {
          const k = i % 5;
          if (k === 0) {
            pool[i] = { uid: 's5-' + i, name: 'Blade #' + i, group: 'Weapons', templateIndex: 122, material: i % 10 === 0 ? 5 : 1, rarity: i % 4 === 0 ? 'rare' : undefined, value: 250 + (i % 500), stackCount: 1, currentCondition: 100, maxCondition: 100, flags: 0, isIdentified: true };
          } else if (k === 1) {
            pool[i] = { uid: 's5-' + i, name: 'Cuirass #' + i, group: 'Armor', templateIndex: 102, material: 513, rarity: 'magic', value: 400, stackCount: 1, currentCondition: 100, maxCondition: 100, flags: 0, isIdentified: true, enchantments: [{ type: 0, param: 0 }] };
          } else if (k === 2) {
            pool[i] = { uid: 's5-' + i, name: 'Elixir #' + i, group: 'UselessItems1', templateIndex: 83, value: 45, stackCount: 1 + (i % 10), potionRecipeKey: 0, currentCondition: 100, maxCondition: 100, flags: 0, isIdentified: true };
          } else if (k === 3) {
            pool[i] = { uid: 's5-' + i, name: 'Ruby #' + i, group: 'Gems', templateIndex: i % 4, value: 300, stackCount: 1, currentCondition: 100, maxCondition: 100, flags: 0, isIdentified: true };
          } else {
            pool[i] = { uid: 's5-' + i, name: 'Longsword #' + i, group: 'Armor', templateIndex: 108, material: 512, value: 120, stackCount: 1, currentCondition: 100, maxCondition: 100, flags: 0, isIdentified: true };
          }
        }
        window.testProbe.setChest(pool);
        window.testProbe.mountMode('paired');
      });
      await tab.waitForSelector('.pack-shell.paired .loot-win .remotelist .itemrow');
      const stressOpen = await tab.evaluate(() => ({
        domRows: document.querySelectorAll('.loot-win .remotelist .itemrow').length,
        countTxt: document.querySelector('.loot-win .dfo-find-count')?.textContent,
      }));
      assert.ok(stressOpen.domRows > 0 && stressOpen.domRows <= 60, `${locale}: 5k chest virtualizes DOM rows (${stressOpen.domRows})`);
      assert.equal(stressOpen.countTxt, '5000/5000', `${locale}: 5k chest shows 5000/5000 count`);

      await tab.click('.loot-win .storecat .dfo-loot-dd-btn');
      await tab.click('.loot-win .storecat .dfo-loot-dd-opt[data-value="weapons"]');
      assert.equal(await tab.locator('.loot-win .dfo-find-count').textContent(), '1000/5000', `${locale}: 5k category weapons shows 1000/5000`);
      await tab.click('.loot-win .storecat .dfo-loot-dd-btn');
      await tab.click('.loot-win .storecat .dfo-loot-dd-opt[data-value="all"]');

      await tab.click('.loot-win .dfo-loot-sort');
      await tab.fill('.loot-win .storesearch', locale === 'ru' ? 'мифрил' : 'mithril');
      await tab.waitForFunction(() => {
        const txt = document.querySelector('.loot-win .dfo-find-count')?.textContent || '';
        return /^\d+\/5000$/.test(txt) && txt !== '5000/5000';
      });
      assert.equal(await tab.locator('.loot-win .dfo-find-count').textContent(), '500/5000', `${locale}: 5k pure-JS search finds exact 500 mithril weapons`);
      await tab.click('.loot-win .dfo-find-clear');

      await tab.evaluate(() => {
        const rl = document.querySelector('.loot-win .remotelist');
        rl.scrollTop = 25000;
        rl.dispatchEvent(new Event('scroll'));
      });
      await tab.locator('.loot-win .remotelist .itemrow').first().click();
      const stressAfterClick = await tab.evaluate(() => ({
        scrollTop: document.querySelector('.loot-win .remotelist').scrollTop,
        lh: Math.round(document.querySelector('.loot-win').getBoundingClientRect().height),
        ph: Math.round(document.querySelector('.pack-win').getBoundingClientRect().height),
      }));
      assert.ok(stressAfterClick.scrollTop >= 24000, `${locale}: 5k scrollTop preserved on transfer (${stressAfterClick.scrollTop})`);
      assert.ok(Math.abs(stressAfterClick.lh - stressAfterClick.ph) <= 2, `${locale}: 5k paired height stays synced`);

      // Mobile <= 640px responsive solo wrap check
      await tab.setViewportSize({ width: 640, height: 800 });
      await tab.evaluate(() => {
        window.testProbe.resetChest();
        window.testProbe.mountMode('solo');
      });
      await tab.waitForSelector('.loot-win .dfo-loot-utilbar');
      const mobileOverflow = await tab.evaluate(() => {
        const w = document.querySelector('.loot-win');
        const util = w.querySelector('.dfo-loot-utilbar');
        const left = w.querySelector('.dfo-loot-util-left');
        const menus = w.querySelector('.storemenus');
        const foot = w.querySelector('.dfo-loot-foot-row');
        return {
          menusCols: getComputedStyle(menus).gridTemplateColumns.split(' ').length,
          utilOverflow: util.scrollWidth - util.clientWidth,
          leftOverflow: left.scrollWidth - left.clientWidth,
          menusOverflow: menus.scrollWidth - menus.clientWidth,
          footOverflow: foot.scrollWidth - foot.clientWidth,
        };
      });
      assert.equal(mobileOverflow.menusCols, 1, `${locale}: <=640px stacks filter dropdowns in 1 column`);
      assert.ok(mobileOverflow.utilOverflow <= 1 && mobileOverflow.leftOverflow <= 1 && mobileOverflow.menusOverflow <= 1 && mobileOverflow.footOverflow <= 1, `${locale}: zero bar overflow at <=640px (${JSON.stringify(mobileOverflow)})`);

      await tab.close();
    }
    assert.deepEqual(errors, [], `page errors: ${errors.join('\n')}`);
    console.log('container browser E2E checks OK (en + ru)');
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(userData, { recursive: true, force: true });
  }
}

main().catch((err) => { console.error(err?.stack || err); process.exit(1); });
