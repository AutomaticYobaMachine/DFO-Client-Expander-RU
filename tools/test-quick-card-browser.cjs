'use strict';
// The quick-loot plaque with the mod's compact card (item-cards-transform.cjs hook itemCards.quick, docs/item-cards.md):
//   node tools/test-quick-card-browser.cjs "$DFO_BUILD_DIR"            (DFO_SCREENSHOT_DIR=dir writes the pictures)
// The plaque's painter is the PUBLISHED one (ui/worldPlaque.js paint), cut out of the game's chunk with the hook
// applied, run on the item-card stand's page - the real enhanced inventory loaded, the mod's scripts, fonts and words,
// the Russian translation with ?ru - over the game's own stat rows (itemInfo.js itemStatRows, from worldTick). The
// unhooked painter beside it draws the native panel, for the before/after pictures.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const acorn = require(process.env.DFO_ACORN_MODULE || 'acorn');
const { chromium } = require(process.env.DFO_PLAYWRIGHT_MODULE || 'playwright');
const { transformItemCards } = require('../src/mod/item-cards-transform.cjs');
const { server } = require('./test-item-cards-browser.cjs');
const { say, sayNum } = require('./ui-text-stand.cjs');

const build = path.resolve(process.argv[2] || process.env.DFO_BUILD_DIR || '');
const assets = path.join(build, 'assets');
const chunk = prefix => {
  const file = fs.readdirSync(assets).find(f => f.startsWith(prefix) && f.endsWith('.js'));
  assert.ok(file, prefix);
  return file;
};

/** The plaque painter's source, as published and as hooked, and the three names it reads from its module. */
function painters() {
  const file = chunk('deepWaterRuntime-'), raw = fs.readFileSync(path.join(assets, file), 'utf8');
  const log = [], hooked = transformItemCards('assets/' + file, raw, log);
  assert.ok(log.some(([id, ok]) => id === 'itemCards.quick' && ok === 1), 'itemCards.quick applied to the published plaque');
  const cut = text => {
    const ast = acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'module' });
    let found = null;
    (function walk(n) {
      if (!n || typeof n.type !== 'string' || found) return;
      if (n.type === 'FunctionDeclaration' && text.slice(n.start, n.end).includes('className=`wplaque-stats`')) { found = n; return; }
      for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); }
    })(ast);
    assert.ok(found, 'the plaque painter');
    return { name: found.id.name, source: text.slice(found.start, found.end) };
  };
  const native = cut(raw), mod = cut(hooked);
  const side = /dataset\.side=([\w$]+)\(([\w$]+),globalThis\.innerWidth\?\?0\)/.exec(native.source);
  const mine = /className=`wplaque-mine`,[\w$]+\.textContent=([\w$]+)/.exec(native.source);
  assert.ok(side && mine, 'the painter\'s module names');
  return { native, mod, side: side[1], anchor: side[2], mine: mine[1] };
}

/** worldTick's export name of itemStatRows - the rows the plaque hands its painter. */
function statRowsExport() {
  const file = chunk('worldTick-'), text = fs.readFileSync(path.join(assets, file), 'utf8');
  const local = /function ([\w$]+)\(([\w$]+)\)\{if\(!\2\)return\[\];let [\w$]+=\[\],[\w$]+=\([\w$]+,[\w$]+\)=>\{[^;]*\};if\([\w$]+\(`Damage`/.exec(text);
  assert.ok(local, 'itemStatRows');
  const alias = new RegExp(`(?<![\\w$])${local[1].replace(/\$/g, '\\$')} as ([\\w$]+)`).exec(text.slice(text.lastIndexOf('export{')));
  assert.ok(alias, 'itemStatRows exported');
  return { file, name: alias[1] };
}

// The native statsSide (worldPlaque.js), its widths from enhancedStyle.js: the native panel's own side.
const NATIVE_SIDE = '(x,w)=>{const need=150+8+190+12;if(!Number.isFinite(x)||!Number.isFinite(w)||w<=0)return"below";if(x+need<=w)return"right";if(x-need>=0)return"left";return"below"}';

async function main() {
  const paint = painters(), rows = statRowsExport();
  const install = ({ native, mod, side, anchor, mine }) => `(()=>{let ${anchor}=960;const ${mine}='(yours)',${side}=${NATIVE_SIDE};
    ${native.source.replace(`function ${native.name}(`, 'function __nativePaint(')}
    ${mod.source.replace(`function ${mod.name}(`, 'function __modPaint(')}
    window.__plaque={native:(n,f,s,r,x)=>{${anchor}=x;return __nativePaint(n,f,s,r)},mod:(n,f,s,r,x)=>{${anchor}=x;return __modPaint(n,f,s,r)}};})();`;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const browser = await chromium.launch();
  const shots = process.env.DFO_SCREENSHOT_DIR, errors = [], report = {};
  try {
    for (const locale of ['en', 'ru']) {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      page.on('pageerror', e => errors.push(`${locale}: ${e.stack || e}`));
      await page.goto(`http://127.0.0.1:${server.address().port}/${locale === 'ru' ? '?ru' : ''}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.ready);
      await page.addScriptTag({ type: 'module', content: `import {${rows.name} as rows} from '/assets/${rows.file}';window.__statRows=rows;` });
      await page.waitForFunction(() => typeof window.__statRows === 'function');
      await page.addScriptTag({ content: install(paint) });
      await page.evaluate(async () => { await Promise.all(['DFO Greengoth', 'DFO Flexi', 'DFO Gabin'].map(f => document.fonts.load('16px "' + f + '"'))); });
      // One body's loot, as the plaque lists it: the stand's own items (docs/item-card-stand.md), each row its item.
      const result = await page.evaluate(({ ids, x }) => {
        const c = window.probe.cases;
        const items = ids.map(id => c[id]);
        const frame = { kind: 'items', key: 'stand', title: 'Bandit (dead)', subs: [], above: 0, rest: 0, empty: false,
          rows: items.map(it => ({ name: it.name, stack: (it.stackCount ?? 1) > 1 ? it.stackCount : null, rarity: it.rarity ?? null, item: it })) };
        const out = {};
        for (const [kind, top] of [['native', 120], ['mod', 560]]) {
          const host = document.createElement('div');
          host.className = 'wplaque on has-list'; host.id = 'plaque-' + kind;
          host.style.setProperty('--wp-x', x + 'px'); host.style.setProperty('--wp-top', top + 'px');
          document.body.append(host);
        }
        ids.forEach((id, sel) => {
          const stat = window.__statRows(items[sel]);
          for (const kind of ['native', 'mod']) window.__plaque[kind](document.getElementById('plaque-' + kind), frame, sel, stat, x);
          const host = document.getElementById('plaque-mod'), panel = host.querySelector('.wplaque-stats');
          const box = panel?.getBoundingClientRect(), frameBox = host.getBoundingClientRect();
          out[id] = {
            ours: !!panel?.classList.contains('dfo-quick-card'), side: panel?.dataset.side, rarity: panel?.dataset.rarity ?? null,
            text: panel?.innerText ?? '', name: panel?.querySelector('.dfo-quick-name')?.textContent ?? null,
            pairs: [...(panel?.querySelectorAll('.dfo-quick-stats>.pair') ?? [])].map(p => [p.querySelector('dt').textContent, p.querySelector('dd').textContent]),
            primary: panel?.querySelector('.dfo-quick-primary')?.innerText ?? null, material: panel?.querySelector('.dfo-item-material')?.innerText ?? null,
            price: panel?.querySelector('.dfo-item-price-value')?.textContent ?? null, coin: !!panel?.querySelector('svg.dfo-item-coin'),
            pictures: panel?.querySelectorAll('img,canvas,.bigicon').length ?? -1,
            box: box && { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width }, plaque: { left: frameBox.left, right: frameBox.right },
            listDressed: getComputedStyle(host).backgroundColor, nativeOnly: document.getElementById('plaque-native').querySelector('.wplaque-stats')?.className ?? null,
            nameFont: panel ? getComputedStyle(panel.querySelector('.dfo-quick-name')).fontFamily : null,
            nameColor: panel ? getComputedStyle(panel.querySelector('.dfo-quick-name')).color : null, border: panel ? getComputedStyle(panel).borderTopColor : null,
          };
        });
        return { out, failures: window.__dfoItemCards.stats().failures, quick: window.__dfoItemCards.stats().quick };
      }, { ids: ['rare', 'ruhn', 'steel', 'bow', 'stack', 'credit', 'shirt', 'unknown', 'mail', 'invalid'], x: 860 });
      report[locale] = result;
      const r = result.out, T = (key, params) => say(key, params, locale), num = (v, o) => sayNum(v, o, locale);
      assert.equal(result.failures, 0, locale + ': no card failures');
      for (const [id, p] of Object.entries(r)) {
        assert.equal(p.ours, true, `${locale} ${id}: the mod's panel`);
        assert.equal(p.side, 'right', `${locale} ${id}: beside the list on Full HD`);
        assert.ok(p.box.left >= p.plaque.right && p.box.right <= 1920 - 8, `${locale} ${id}: right of the list and on the screen ${JSON.stringify(p.box)}`);
        assert.equal(p.pictures, 0, `${locale} ${id}: no picture`);
        assert.equal(p.coin, true, `${locale} ${id}: the coin`);
        assert.equal(p.nativeOnly, 'wplaque-stats', `${locale} ${id}: the unhooked painter still draws the native panel`);
        assert.equal(p.listDressed, 'rgb(14, 16, 19)', `${locale} ${id}: the list in the card's ink`);
        assert.match(p.nameFont, /DFO Greengoth/);
      }
      const pair = (id, key) => r[id].pairs.find(([k]) => k === key)?.[1];
      assert.equal(pair('rare', T('cards.slot')), T('cards.slot.EitherHand'));
      assert.equal(pair('rare', T('cards.skill')), T('cards.skill.LongBlade'));
      assert.equal(pair('bow', T('cards.slot')), T('cards.slot.BothHands'));
      assert.equal(pair('bow', T('cards.skill')), T('cards.skill.Archery'));
      assert.equal(pair('steel', T('cards.slot')), T('cards.slot.ChestArmor'));
      assert.equal(pair('steel', T('cards.skill')), undefined, 'armour trains no weapon skill');
      assert.ok(pair('steel', T('cards.armorType')), 'the armour type under its card label');
      assert.equal(r.rare.price, '~' + num(1370), 'the card\'s own price');
      assert.equal(r.credit.price, num(20000), 'a letter of credit at its exact worth');
      assert.equal(pair('stack', T('cards.quantity')), num(40));
      assert.ok(pair('stack', T('cards.perKg')), 'price per kilogram');
      assert.match(r.steel.material, new RegExp(T('cards.material')));
      assert.match(r.steel.material, new RegExp(T('cards.metal.Steel')));
      assert.ok(r.rare.primary && r.steel.primary, 'damage and armour as the primary figure');
      assert.equal(r.rare.rarity, 'rare');assert.equal(r.ruhn.rarity, 'aetheric');
      // The rarity's colour on the frame and the name, as the plaque's own row wears it (enhancedStyle.js).
      assert.equal(r.rare.border, 'rgb(228, 195, 79)');assert.equal(r.rare.nameColor, 'rgb(228, 195, 79)');
      assert.equal(r.ruhn.border, 'rgb(191, 232, 255)');assert.equal(r.ruhn.nameColor, 'rgb(191, 232, 255)');
      assert.equal(r.steel.border, 'rgb(130, 122, 104)', 'a common piece in the ornament\'s brass');
      assert.match(r.unknown.material, new RegExp(T('cards.material.unspecified')), 'an unidentified piece keeps its metal hidden, as the card does');
      assert.doesNotMatch(r.unknown.text, new RegExp(T('cards.metal.Mithril')));
      assert.ok(r.unknown.price.startsWith('~'), 'an unidentified piece is still priced, as a merchant prices it');
      assert.equal(r.invalid.price, '—', 'an unknown template is not priced');
      // A plaque at the screen's right edge puts the card on the left; on a phone, under the list.
      const sides = await page.evaluate(() => {
        const host = document.getElementById('plaque-mod'), c = window.probe.cases;
        const frame = { kind: 'items', key: 'stand2', title: 'Chest', subs: [], above: 0, rest: 0, rows: [{ name: c.rare.name, item: c.rare, rarity: 'rare' }] };
        const stat = window.__statRows(c.rare), out = [];
        for (const x of [1700, 300]) { window.__plaque.mod(host, frame, 0, stat, x); out.push(host.querySelector('.wplaque-stats').dataset.side); }
        return out;
      });
      assert.deepEqual(sides, ['left', 'right']);
      if (shots) {
        fs.mkdirSync(shots, { recursive: true });
        for (const [id, file] of [['rare', 'quick-card'], ['ruhn', 'quick-card-aetheric'], ['steel', 'quick-card-armour']]) {
          await page.evaluate(({ id, ids }) => {
            const c = window.probe.cases, items = ids.map(k => c[k]);
            const frame = { kind: 'items', key: 'shot', title: 'Bandit (dead)', subs: [], above: 0, rest: 0,
              rows: items.map(it => ({ name: it.name, stack: (it.stackCount ?? 1) > 1 ? it.stackCount : null, rarity: it.rarity ?? null, item: it })) };
            const sel = ids.indexOf(id);
            for (const kind of ['native', 'mod']) window.__plaque[kind](document.getElementById('plaque-' + kind), frame, sel, window.__statRows(items[sel]), 860);
          }, { id, ids: ['rare', 'ruhn', 'steel', 'bow', 'stack', 'credit', 'shirt'] });
          await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
          for (const kind of ['native', 'mod']) {
            const clip = await page.evaluate(k => {
              const a = document.getElementById('plaque-' + k).getBoundingClientRect(), b = document.querySelector('#plaque-' + k + ' .wplaque-stats').getBoundingClientRect();
              const left = Math.min(a.left, b.left) - 12, top = Math.min(a.top, b.top) - 12;
              return { x: left, y: top, width: Math.max(a.right, b.right) + 12 - left, height: Math.max(a.bottom, b.bottom) + 12 - top };
            }, kind);
            await page.screenshot({ path: path.join(shots, `${file}-${kind === 'mod' ? 'mod' : 'native'}-${locale}.png`), clip });
          }
        }
      }
      await page.close();
    }
    assert.deepEqual(errors, [], 'no page errors');
    console.log(JSON.stringify({ en: Object.fromEntries(Object.entries(report.en.out).map(([k, v]) => [k, v.text.split('\n').filter(Boolean)])),
      ru: Object.fromEntries(Object.entries(report.ru.out).map(([k, v]) => [k, v.text.split('\n').filter(Boolean)])) }, null, 1));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
