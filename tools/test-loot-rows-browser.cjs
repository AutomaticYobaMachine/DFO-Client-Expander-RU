'use strict';
// The loot window's rows in the card's dress (item-cards-transform.cjs hook itemCards.rows, docs/item-cards.md):
//   node tools/test-loot-rows-browser.cjs "$DFO_BUILD_DIR"            (DFO_SCREENSHOT_DIR=dir writes the pictures)
// The PUBLISHED enhanced inventory, mounted on the item-card stand's page with a chest beside the pack (deps.loot), in
// English and - with the translation, ?ru - in Russian: each row's sub-line says the armour type and the metal and the
// stack's weight, its right column the card's price; the condition word is gone, the pack's own grid is untouched.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.DFO_PLAYWRIGHT_MODULE || 'playwright');
const { server } = require('./test-item-cards-browser.cjs');
const { say, sayNum } = require('./ui-text-stand.cjs');

const build = path.resolve(process.argv[2] || process.env.DFO_BUILD_DIR || '');
const entry = fs.readdirSync(path.join(build, 'assets')).find(f => /^enhancedInventory-.*\.js$/.test(f)
  && fs.readFileSync(path.join(build, 'assets', f), 'utf8').includes('mountEnhancedInventory'));

async function main() {
  assert.ok(entry, 'the enhanced inventory module');
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const browser = await chromium.launch();
  const shots = process.env.DFO_SCREENSHOT_DIR, errors = [], report = {};
  try {
    for (const locale of ['en', 'ru']) {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      page.on('pageerror', e => errors.push(`${locale}: ${e.stack || e}`));
      await page.goto(`http://127.0.0.1:${server.address().port}/${locale === 'ru' ? '?ru' : ''}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.ready);
      await page.addScriptTag({ type: 'module', content: `import {mountEnhancedInventory} from '/assets/${entry}';window.__mount=mountEnhancedInventory;` });
      await page.waitForFunction(() => typeof window.__mount === 'function');
      await page.evaluate(async () => { await Promise.all(['DFO Greengoth', 'DFO Flexi', 'DFO Gabin'].map(f => document.fonts.load('16px "' + f + '"'))); });
      const result = await page.evaluate(() => {
        const { cases, entity, view } = window.probe;
        view?.unmount?.();
        const ids = ['rare', 'ruhn', 'steel', 'chain', 'mail', 'fur', 'bow', 'shield', 'stack', 'credit', 'shirt', 'unknown', 'missing', 'stolen'];
        const chest = ids.map(id => cases[id]);
        const host = document.getElementById('enhanced-inventory');
        window.__view = window.__mount(host, { entity, items: () => entity.items, getQuest: () => null, owner: { done: false },
          loot: { items: () => chest, title: 'Chest', storage: true } });
        const rows = [...document.querySelectorAll('.loot-win .itemrow')];
        const byItem = new Map(rows.map(r => [r._padItem, r]));   // the row's own item (itemRow: row._padItem)
        const out = {};
        for (const id of ids) {
          const row = byItem.get(cases[id]);
          if (!row) { out[id] = null; continue; }
          const style = getComputedStyle(row);
          out[id] = {
            dressed: row.classList.contains('dfo-item-row'), rarity: row.dataset.rarity ?? null,
            sub: row.querySelector('.itemname > small')?.innerText ?? null, subCount: row.querySelectorAll('.itemname > small').length,
            material: row.querySelector('.dfo-row-mat')?.textContent ?? null, metal: row.querySelector('.dfo-row-mat .dfo-item-metal')?.dataset.metal ?? null,
            kg: row.querySelector('.dfo-row-kg')?.textContent ?? null, price: row.querySelector('.dfo-row-price .dfo-item-price-value')?.textContent ?? null,
            coin: !!row.querySelector('.dfo-row-price svg.dfo-item-coin'), weightColumns: row.querySelectorAll('.itemwt').length,
            edge: style.borderLeftColor, ground: style.backgroundColor, nameFont: getComputedStyle(row.querySelector('.itemname > span')).fontFamily,
            height: row.getBoundingClientRect().height,
          };
        }
        const pack = document.querySelector('.pack-shell .pack-dock .itemrow');
        return { out, failures: window.__dfoItemCards.stats().failures, rows: window.__dfoItemCards.stats().rows,
          packDressed: !!pack?.classList.contains('dfo-item-row'), lootRows: rows.length };
      });
      report[locale] = result;
      const r = result.out, T = (key, params) => say(key, params, locale), num = (v, o) => sayNum(v, o, locale);
      assert.equal(result.failures, 0, locale + ': no card failures');
      assert.equal(result.packDressed, false, locale + ': the pack\'s own grid keeps its plates');
      const condition = /\b(New|Almost New|Slightly Used|Used|Worn|Battered|Broken)\b|Нов|Изнош/;
      for (const [id, p] of Object.entries(r)) {
        assert.ok(p, `${locale} ${id}: a row in the chest`);
        assert.equal(p.dressed, true, `${locale} ${id}: the card's dress`);
        assert.equal(p.subCount, 1, `${locale} ${id}: one sub-line`);
        assert.equal(p.weightColumns, 1, `${locale} ${id}: the right column is the price, not a second weight`);
        assert.equal(p.coin, true, `${locale} ${id}: the coin`);
        assert.doesNotMatch(p.sub, condition, `${locale} ${id}: no condition word - ${p.sub}`);
        assert.match(p.kg, new RegExp(`^(?:<0\\.1|\\d+\\.\\d) ${T('cards.kg')}$`), `${locale} ${id}: the weight as "2.0 ${T('cards.kg')}"`);
        assert.equal(p.ground, 'rgb(14, 16, 19)', `${locale} ${id}: the card's ink`);
        assert.match(p.nameFont, /DFO Greengoth/);
      }
      const heights = new Set(Object.values(r).map(p => Math.round(p.height)));
      assert.equal(heights.size, 1, `${locale}: every row the one height for the virtual list (${[...heights]})`);
      // "Chain Ebony": the armour type, then the metal as the card shows it; nothing when neither is known.
      assert.equal(r.steel.material, `${T('cards.armor.Plate')}${T('cards.metal.Steel')}`);assert.equal(r.steel.metal, 'Steel');
      assert.equal(r.ruhn.material, `${T('cards.armor.Plate')}${T('cards.metal.Daedric')}`);
      assert.equal(r.chain.material, T('cards.armor.Chain'), 'a classic chain\'s metal is not recorded: the type alone');
      assert.equal(r.mail.material, `${T('cards.armor.Chain')}${T('cards.metal.Steel')}`);
      assert.equal(r.fur.material, T('cards.material.fur'), 'a fur jerkin is its fur');
      assert.equal(r.rare.material, T('cards.metal.Mithril'), 'a weapon: the metal alone');
      assert.equal(r.shirt.material, null, 'clothing: a gap');assert.equal(r.missing.material, T('cards.armor.Leather'), 'no material: the type alone, as the game reads it (the card\'s Armor type row)');
      assert.doesNotMatch(r.unknown.sub, new RegExp(T('cards.metal.Mithril')), 'an unidentified piece keeps its metal hidden');
      assert.equal(r.rare.price, '~' + num(1370));assert.equal(r.credit.price, num(20000));assert.equal(r.steel.price, '~' + num(240));
      assert.equal(r.stack.kg, '0.0 ' + T('cards.kg'), 'arrows weigh nothing in the game: the stack says so');
      assert.equal(r.steel.kg, '15.5 ' + T('cards.kg'), 'the stack\'s weight to one decimal');
      assert.equal(r.rare.edge, 'rgb(228, 195, 79)', 'the tier on the row\'s edge');assert.equal(r.steel.edge, 'rgb(130, 122, 104)');
      if (shots) {
        fs.mkdirSync(shots, { recursive: true });
        await page.evaluate(() => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res))));
        const box = await page.evaluate(() => { const b = document.querySelector('.loot-win').getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; });
        await page.screenshot({ path: path.join(shots, `loot-rows-${locale}.png`), clip: box });
      }
      await page.close();
    }
    assert.deepEqual(errors, [], 'no page errors');
    console.log(JSON.stringify(Object.fromEntries(['en', 'ru'].map(l => [l, Object.fromEntries(Object.entries(report[l].out).map(([k, v]) => [k, `${v.sub} | ${v.price}`]))])), null, 1));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
