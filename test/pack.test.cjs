'use strict';
// THE INVENTORY (docs/inventory.md): the pages, the Junk rule, the surrogate stacks, the settings in the mod's cache, the
// hooks on the published game and the page tables read off the original's recipes.
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { execFileSync } = require('node:child_process');
const R = require('../src/mod/page/dfo_pack_rules.js');
const Data = require('../src/mod/page/dfo_pack_data.js');
const Loot = require('../src/mod/page/dfo_loot_rules.js');
const { createLootStore } = require('../src/mod/loot-store.cjs');
const { transformInventory } = require('../src/mod/inventory-transform.cjs');
const { injectPage, expectedHooks, EXPECTED } = require('../src/mod/transforms.cjs');
const root = path.resolve(__dirname, '..');
const mk = (group, templateIndex, extra = {}) => ({ name: 'x', group, templateIndex, stackCount: 1, ...extra });
// the native pageOf less its Magic arm (storeFilter.js), in short: what basePage asks
const base = (it) => (it.group === 'Weapons' ? 'weapons' : it.group === 'Armor' ? 'armor' : /Clothing$/.test(it.group) ? 'clothing'
  : it.group === 'UselessItems1' && it.templateIndex === 83 ? 'potions' : ['Gems', 'Jewellery'].includes(it.group) ? 'valuables'
    : it.templateIndex <= 77 ? 'ingredients' : it.group === 'Books' ? 'books' : 'misc');

test('nine pages: Magic gone, Junk last, the native words kept', () => {
  const native = [['weapons', 'Weapons'], ['armor', 'Armor'], ['clothing', 'Clothing'], ['magic', 'Magic'], ['potions', 'Potions'], ['ingredients', 'Ingredients'], ['books', 'Books'], ['valuables', 'Valuables'], ['misc', 'Misc']];
  const pages = R.pages(native);
  assert.deepEqual(pages.map(([id]) => id), ['weapons', 'armor', 'clothing', 'potions', 'ingredients', 'books', 'valuables', 'misc', 'junk']);
  assert.equal(pages[0][1], 'Weapons', 'a native page keeps its native word for the translation');
  assert.equal(pages[8][1], 'pack.page.junk', 'Junk is the mod\'s own word (a key without the ui runtime)');
  assert.ok(Object.isFrozen(pages) && Object.isFrozen(pages[0]));
});

test('base pages: an enchanted piece on its base\'s page; notes and the spellbook with the books; only what recipes spend is an ingredient', () => {
  assert.equal(R.basePage(mk('Weapons', 120, { enchantments: [{ type: 0 }] }), base), 'weapons');
  assert.equal(R.basePage(mk('WomensClothing', 205, { enchantments: [{ type: 2 }] }), base), 'clothing');
  assert.equal(R.basePage(mk('Jewellery', 135, { enchantments: [{ type: 2 }] }), base), 'valuables');
  assert.equal(R.basePage(mk('MiscItems', 132), base), 'books', 'the spellbook is read');
  assert.equal(R.basePage(mk('UselessItems2', 279, { questItem: true }), base), 'books', 'a quest letter');
  assert.equal(R.basePage(mk('UselessItems2', 279), base), 'books', 'a note');
  assert.equal(R.basePage(mk('PlantIngredients1', 10), base), 'ingredients', 'Red Flowers brew');
  assert.equal(R.basePage(mk('UselessItems2', 620), base), 'ingredients', 'an Iron Ingot is smithed');
  assert.equal(R.basePage(mk('UselessItems2', 538), base), 'ingredients', 'Raw Meat is cooked');
  assert.equal(R.basePage(mk('PlantIngredients1', 18), base), 'misc', 'Clover: no recipe asks for it');
  assert.equal(R.basePage(mk('MetalIngredients', 67), base), 'misc', 'Brass: no recipe asks for it');
  assert.equal(R.basePage(mk('UselessItems2', 1603), base), 'misc', 'a tool is never an ingredient');
  assert.equal(R.basePage(mk('PlantIngredients1', 10, { questItem: true }), base), 'misc', 'a quest\'s herb is not stock');
  assert.equal(R.basePage(mk('Gems', 0), base), 'valuables', 'a gem stays a valuable');
});

test('the Junk rule: ANY ticked tag or kind; things to sell and the native mark by default; a quest\'s piece never', () => {
  const junk = R.cleanJunk(undefined);
  assert.deepEqual(junk, { tags: ['use:sale', 'state:junk'], items: [] });
  assert.equal(R.isJunk(mk('ReligiousItems', 270), junk), true, 'a Holy Dagger is a thing to sell');
  assert.equal(R.isJunk(mk('PlantIngredients1', 18), junk), true);
  assert.equal(R.isJunk(mk('Weapons', 113, { junk: true }), junk), true, 'the native junk mark');
  assert.equal(R.isJunk(mk('Weapons', 113), junk), false);
  assert.equal(R.isJunk(mk('UselessItems2', 280, { questItem: true }), junk), false, 'a quest\'s Totem is not junk');
  assert.equal(R.isJunk(mk('ReligiousItems', 270), { tags: [], items: [] }), false, 'an empty rule calls nothing junk');
  assert.equal(R.isJunk(mk('Weapons', 113), { tags: [], items: ['type:Weapons:113'] }), true, 'a kind');
  const tools = { tagInfo: (it) => ({ page: 'weapons', rarity: it.rarity || 'common', kind: it.group, material: '', enchanted: false, identified: true, bound: false }) };
  assert.equal(R.isJunk(mk('Weapons', 113, { stolen: true }), { tags: ['state:stolen'], items: [] }, tools, Loot), true, 'the loot filter\'s tags');
  assert.equal(R.isJunk(mk('Weapons', 113, { rarity: 'rare' }), { tags: ['rarity:common'], items: [] }, tools, Loot), false);
  for (const t of Data.sale) assert.ok(!Data.ingredients.includes(t), `a thing to sell is never an ingredient: ${t}`);
  assert.ok(!Data.sale.includes(279), 'the parchment is read, not sold');
});

test('surrogate stacks: the stateless pieces of one kind in one cell, in the list\'s order; never a quest\'s piece or another page', () => {
  const a = mk('UselessItems2', 1610, { uid: 'a', value: 20 }), b = mk('UselessItems2', 1610, { uid: 'b', value: 20, acquired: true });
  const rot = mk('UselessItems2', 1610, { uid: 'c', value: 20, foodStage: 2 });
  const q1 = mk('UselessItems2', 280, { questItem: true }), q2 = mk('UselessItems2', 280, { questItem: true });
  const cells = R.cells([a, rot, b, q1, q2], 'misc');
  assert.deepEqual(cells.map((c) => c.members.length), [2, 1, 1, 1], 'a and b together, the rotting one apart, the quest\'s pieces apart');
  assert.equal(cells[0].item, a, 'the cell stands at its first record');
  assert.deepEqual(R.cells([a, b], 'weapons').map((c) => c.members.length), [1, 1], 'only Misc, Ingredients and Junk stack by surrogate');
  const stacked = mk('PlantIngredients1', 10, { stackCount: 3 }), more = mk('PlantIngredients1', 10, { stackCount: 2 });
  const [cell] = R.cells([stacked, more], 'ingredients');
  assert.equal(cell.members.reduce((n, it) => n + R.count(it), 0), 5, 'two native stacks count as one');
  assert.equal(R.stackKey(mk('ReligiousItems', 270, { locked: true })) === R.stackKey(mk('ReligiousItems', 270)), false, 'the lock is a state');
});

test('the settings: words and ids only, cleaned; kept in the cache\'s own `pack` namespace with a revision', () => {
  assert.deepEqual(R.SORT_MODES, ['rarity', 'type', 'material', 'name', 'count']);
  assert.deepEqual(R.cleanSettings({ view: 'nonsense', charcol: 'bogus', autoSort: 0, sortMode: 'bogus', junk: { tags: ['a', 'a', 5, ''], items: 'x' }, extra: { item: {} } }),
    { v: 1, view: 'rows', charcol: 'v2', autoSort: true, sortMode: 'rarity', junk: { tags: ['a'], items: [] } });
  assert.equal(R.cleanSettings({ autoSort: false }).autoSort, true, 'autoSort is permanent and cannot be disabled');
  for (const m of R.SORT_MODES) assert.equal(R.cleanSettings({ sortMode: m }).sortMode, m);
  assert.equal(R.cleanSettings({ view: 'grid' }).view, 'grid');
  assert.deepEqual(R.CHARCOLS, ['v2', 'v1']);
  assert.equal(R.cleanSettings({ charcol: 'v1' }).charcol, 'v1');
  assert.equal(R.cleanSettings({ charcol: 'v2' }).charcol, 'v2');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfo-pack-test-'));
  try {
    const store = createLootStore(dir);
    assert.equal(store.packState().revision, 0);
    assert.equal(store.packState().charcol, 'v2');
    const saved = store.savePack({ ...store.packState(), view: 'grid', charcol: 'v1', junk: { tags: ['state:stolen'], items: [] } });
    assert.equal(saved.revision, 1);
    assert.equal(saved.charcol, 'v1');
    assert.throws(() => store.savePack({ ...saved, revision: 0 }), (e) => e.status === 409, 'a second window\'s write is refused');
    store.replaceCityCache({ towns: { a: 1 } });
    assert.deepEqual(store.packState().junk.tags, ['state:stolen'], 'the town map\'s write keeps the inventory');
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'dfo-mod-cache.json'), 'utf8')).towns.a, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the page scripts and the expected hooks follow the inventory switch', () => {
  const html = '<html><head></head><body><script type="module" src="x.js"></script></body></html>';
  const on = injectPage(html, './', { inventory: true, nearbyLoot: false, pageCfg: {} });
  for (const f of ['dfo_loot_rules.js', 'dfo_pack_data.js', 'dfo_pack_rules.js', 'dfo_pack.js']) assert.ok(on.includes(`dfo-mod/${f}`), f);
  assert.ok(on.indexOf('dfo_pack.js') < on.indexOf('type="module"'), 'before the game\'s modules: the page list is read as they evaluate');
  assert.equal(injectPage(html, './', { inventory: false, nearbyLoot: false, pageCfg: {} }).includes('dfo_pack'), false);
  assert.deepEqual(EXPECTED.inventory, ['inventory.pages', 'inventory.view', 'inventory.nativeLock', 'inventory.lifecycle', 'inventory.door', 'inventory.receipt', 'inventory.world', 'inventory.status', 'inventory.statusText', 'inventory.aurum', 'inventory.shop', 'inventory.icons']);
  assert.ok(expectedHooks({ inventory: true }).includes('inventory.view'));
  assert.equal(expectedHooks({ inventory: false }).includes('inventory.view'), false);
});

test('the hooks find their places on the published game and keep the native path', { skip: !process.env.DFO_BUILD_DIR }, () => {
  const assets = path.join(process.env.DFO_BUILD_DIR, 'assets');
  const acorn = require(process.env.DFO_ACORN_MODULE || 'acorn');
  const found = new Map();
  for (const f of fs.readdirSync(assets).filter((f) => f.endsWith('.js'))) {
    const text = fs.readFileSync(path.join(assets, f), 'utf8'), log = [];
    const out = transformInventory('assets/' + f, text, log);
    for (const [id, n] of log) { assert.ok(!id.includes('!error'), `${f}: ${id}`); found.set(id, (found.get(id) ?? 0) + n); }
    if (out === text) continue;
    acorn.parse(out, { ecmaVersion: 'latest', sourceType: 'module' });
    assert.equal(transformInventory('assets/' + f, out, []), out, `${f}: a second pass changes nothing`);
    if (/Worker-/.test(f)) assert.fail(`${f}: no hook in a Worker`);
  }
  assert.deepEqual([...found.entries()].sort(), [
    ['inventory.aurum', 1], ['inventory.door', 1], ['inventory.icons', 1], ['inventory.lifecycle', 1],
    ['inventory.nativeLock', 1], ['inventory.pages', 1], ['inventory.receipt', 1], ['inventory.shop', 1],
    ['inventory.status', 1], ['inventory.statusText', 1], ['inventory.view', 1], ['inventory.world', 1],
  ]);
});

test('the native pageOf answers as before without the page script; with it, as the page script says', { skip: !process.env.DFO_BUILD_DIR }, () => {
  const assets = path.join(process.env.DFO_BUILD_DIR, 'assets');
  const file = fs.readdirSync(assets).find((f) => /^storeFilter-/.test(f));
  const text = transformInventory('assets/' + file, fs.readFileSync(path.join(assets, file), 'utf8'), []);
  // pageOf's three functions and the helpers, as the hook wrote them; the module's other names stood in by plain values
  const fns = /function ([\w$]+)\(([\w$]+)\)\{return __dfoPackPage\$\(\2\)\}function __dfoPageNative\$[^]*?:`misc`\}function __dfoPageBase\$[^]*?:`misc`\}/.exec(text);
  const helpers = /function __dfoPackPages\$[^\n]*/.exec(text)[0];
  const list = /([\w$]+)=__dfoPackPages\$\((Object\.freeze\(\[\[`weapons`[^;]*?\]\]\))\)/.exec(text);
  assert.ok(fns && helpers && list, 'the hook\'s functions');
  const enchanted = /if\(([\w$]+)\([\w$]+\)\|\|[\w$]+\.templateIndex===\d+\)return`magic`/.exec(fns[0])[1];
  const potion = /templateIndex===([\w$]+)\?`potions`/.exec(fns[0])[1];
  const sets = [...fns[0].matchAll(/([\w$]+)\.has\(/g)].map((m) => m[1]);
  const calls = [...new Set([...fns[0].matchAll(/[^\w$.]([\w$]{1,3})\(/g)].map((m) => m[1]))].filter((n) => n !== enchanted && n !== fns[1] && !['if', 'for', 'new', 'let'].includes(n));
  const stubs = `const ${enchanted}=(e)=>!!e?.enchantments?.length,${potion}=83${sets.length ? ',' + [...new Set(sets)].map((n) => `${n}=new Set(['Gems','Jewellery','MensClothing','WomensClothing'])`).join(',') : ''}${calls.length ? ',' + calls.map((n) => `${n}=()=>false`).join(',') : ''};`;
  const load = new Function(`${stubs}${fns[0]}${helpers};const pages=__dfoPackPages$(${list[2]});return {page:${fns[1]},pages};`);
  delete globalThis.__dfoPack;
  const plain = load();
  const sword = { group: 'Weapons', templateIndex: 120, enchantments: [{}] };
  assert.equal(plain.page(sword), 'magic', 'without the page script the native Magic arm stands');
  assert.equal(plain.page({ group: 'Weapons', templateIndex: 120 }), 'weapons');
  assert.ok(plain.pages.some(([id]) => id === 'magic'), 'the native page list');
  globalThis.__dfoPack = { pages: (p) => R.pages(p), page: (it, b) => R.basePage(it, b) };
  try {
    const ours = load();
    assert.equal(ours.page(sword), 'weapons', 'the base\'s page');
    assert.deepEqual(ours.pages.map(([id]) => id), R.PAGES);
    globalThis.__dfoPack.page = () => { throw new Error('a page script fault'); };
    assert.equal(ours.page(sword), 'magic', 'a fault falls back to the native answer');
    globalThis.__dfoPack.pages = () => { throw new Error('a page script fault'); };
    assert.ok(load().pages.some(([id]) => id === 'magic'), 'a faulty page list falls back to the native one');
  } finally { delete globalThis.__dfoPack; }
});

test('the page tables match the original\'s recipes', { skip: !process.env.DFO_UPSTREAM_DIR }, () => {
  const out = execFileSync(process.execPath, [path.join(root, 'tools/build-pack-data.mjs'), process.env.DFO_UPSTREAM_DIR, '--check'], { encoding: 'utf8' });
  assert.match(out, /matches the original/);
});

test('__dfoPack.sortList applies all 5 sort profiles while preserving quest items, holes and pins, and __dfoPack.foot renders currencies, 2-line location rep, date and status', () => {
  const vm = require('node:vm');
  const packSrc = fs.readFileSync(path.join(root, 'src/mod/page/dfo_pack.js'), 'utf8');
  const fakeNode = (tag, cls = '', text = '') => {
    const classes = new Set(String(cls).split(/\s+/).filter(Boolean));
    const listeners = new Map();
    const n = {
      tagName: String(tag).toUpperCase(),
      className: String(cls),
      textContent: String(text),
      children: [],
      dataset: {},
      title: '',
      isConnected: true,
      parentNode: null,
      attributes: new Map(),
      style: { setProperty() { }, removeProperty() { }, getPropertyValue() { return ''; } },
      classList: {
        add: (...xs) => xs.forEach((c) => classes.add(c)),
        remove: (...xs) => xs.forEach((c) => classes.delete(c)),
        toggle: (c, f) => (f === undefined ? !classes.has(c) : f) ? classes.add(c) : classes.delete(c),
        contains: (c) => classes.has(c) || String(n.className || '').split(/\s+/).includes(c),
      },
      setAttribute: (k, v) => {
        const s = String(v);
        n.attributes.set(k, s);
        if (k === 'class') {
          n.className = s;
          classes.clear();
          for (const c of s.split(/\s+/).filter(Boolean)) classes.add(c);
        }
      },
      removeAttribute: (k) => n.attributes.delete(k),
      getAttribute: (k) => n.attributes.get(k) ?? null,
      append: (...xs) => {
        for (const x of xs) {
          if (x == null) continue;
          const node = typeof x === 'string' ? fakeNode('#text', '', x) : x;
          node.parentNode = n;
          n.children.push(node);
        }
      },
      replaceChildren: (...xs) => { n.children.length = 0; n.append(...xs); },
      remove: () => {
        if (n.parentNode) {
          const i = n.parentNode.children.indexOf(n);
          if (i >= 0) n.parentNode.children.splice(i, 1);
          n.parentNode = null;
        }
      },
      querySelector: (sel) => {
        const direct = sel.startsWith(':scope > ');
        const clsName = sel.replace(/^:scope > /, '').replace(/^\./, '');
        const has = (c) => c.classList?.contains(clsName) || String(c.className || '').split(/\s+/).includes(clsName);
        const walk = (list) => {
          for (const c of list) {
            if (has(c) || (sel === '.v' && c.classList?.contains('v'))) return c;
            if (!direct && c.children?.length) { const hit = walk(c.children); if (hit) return hit; }
          }
          return null;
        };
        return walk(n.children);
      },
      querySelectorAll: (sel) => {
        const out = [];
        const clsName = sel.replace(/^:scope > /, '').split(/\s+/).pop().replace(/^\./, '');
        const walk = (list) => {
          for (const c of list) {
            if (c.classList?.contains(clsName) || String(c.className || '').split(/\s+/).includes(clsName)) out.push(c);
            if (c.children?.length) walk(c.children);
          }
        };
        walk(n.children);
        return out;
      },
      addEventListener: (type, fn) => {
        const arr = listeners.get(type) ?? [];
        arr.push(fn);
        listeners.set(type, arr);
      },
      emit: (type, ev = {}) => {
        for (const fn of listeners.get(type) ?? []) fn(ev);
      },
      matches: () => false,
    };
    return n;
  };
  const docEl = fakeNode('html');
  const storage = new Map();
  const ctx = {
    Math, Number, String, Boolean, Array, Object, Map, Set, Date, Promise, JSON, Intl, WeakMap, console,
    addEventListener() { },
    document: {
      documentElement: docEl,
      head: fakeNode('head'),
      body: fakeNode('body'),
      getElementById: () => null,
      createElement: (tag) => fakeNode(tag),
      createElementNS: (_ns, tag) => fakeNode(tag),
      createTextNode: (t) => fakeNode('#text', '', t),
      addEventListener() { },
    },
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
    __dfoPackRules: R,
    __dfoUi: { t: (k, p) => (p && Object.keys(p).length ? `${k}:${JSON.stringify(p)}` : k) },
    __dfoItemCards: {
      slotName: (it) => it._slot || '',
      weaponSkill: (it) => it._wskill || '',
      material: (it) => it._mat || '',
      isAmmo: (it) => !!it._ammo,
    },
  };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  vm.runInNewContext(packSrc, ctx);
  const P = ctx.__dfoPack;
  assert.ok(P);

  const questDoc = mk('Books', 277, { name: 'Alpha Quest', questItem: true, rarity: 'common', value: 1 });
  const daedricAxe = mk('Weapons', 124, { name: 'Zeta Battleaxe', rarity: 'rare', nativeMaterialValue: 521, _mat: 'Daedric', _wskill: 'axe', stackCount: 1, value: 4000 });
  const ironDagger = mk('Weapons', 113, { name: 'Beta Dagger', rarity: 'common', nativeMaterialValue: 512, _mat: 'Iron', _wskill: 'shortblade', stackCount: 1, value: 30 });
  const healingHerb = mk('PlantIngredients1', 10, { name: 'Herb Stack', rarity: 'common', stackCount: 15, value: 5 });
  const rubyGem = mk('Gems', 0, { name: 'Amethyst', rarity: 'uncommon', stackCount: 2, value: 500 });
  const armorPlate = mk('Armor', 102, { name: 'Cuirass', rarity: 'epic', nativeMaterialValue: 519, _mat: 'Ebony', _slot: 'chest', stackCount: 1, value: 2500 });
  const items = [ironDagger, null, rubyGem, daedricAxe, healingHerb, questDoc, armorPlate];
  const meta = {
    pages: ['weapons', 'armor', 'clothing', 'potions', 'ingredients', 'books', 'valuables', 'misc', 'junk'],
    pageOf: (it) => base(it),
    rarityRanks: ['common', 'uncommon', 'rare', 'epic', 'mythic'],
    rarityOf: (it) => it.rarity || 'common',
    valueOf: (it) => it.value || 0,
    horseOf: () => false,
    pinOf: () => null,
    collator: new Intl.Collator('en', { sensitivity: 'base', numeric: true }),
  };
  const nativeSort = (arr) => [...arr].filter(Boolean).sort((a, b) => (a.questItem ? -1 : b.questItem ? 1 : 0));

  P.save({ sortMode: 'name' });
  const byName = P.sortList(items, { nameOf: (it) => it.name }, nativeSort, meta);
  assert.equal(byName[0], questDoc, 'quest stays first in name mode');
  assert.equal(byName.at(-1), null, 'hole stays last in name mode');
  assert.deepEqual(byName.slice(1, -1).map((x) => x.name), ['Amethyst', 'Beta Dagger', 'Cuirass', 'Herb Stack', 'Zeta Battleaxe']);

  P.save({ sortMode: 'material' });
  const byMat = P.sortList(items, { nameOf: (it) => it.name }, nativeSort, meta);
  assert.equal(byMat[1], daedricAxe, 'Daedric sorts ahead of Ebony/Iron');
  assert.equal(byMat[2], armorPlate, 'Ebony sorts second');

  P.save({ sortMode: 'count' });
  const byCount = P.sortList(items, { nameOf: (it) => it.name }, nativeSort, meta);
  assert.equal(byCount[1], healingHerb, 'stack of 15 sorts first among non-quest');
  assert.equal(byCount[2], rubyGem, 'stack of 2 sorts second');

  P.save({ sortMode: 'type' });
  const byType = P.sortList(items, { nameOf: (it) => it.name }, nativeSort, meta);
  assert.equal(byType[1], ironDagger, 'shortblade weapon precedes axe weapon in type mode');
  assert.equal(byType[2], daedricAxe);
  assert.equal(byType[3], armorPlate, 'armor follows melee weapons');

  // Locked items always stay first in every sort mode (including rarity and pin duplicates)
  const wMythic = mk('Weapons', 120, { uid: 'm1', name: 'Aegis Claymore', rarity: 'mythic', nativeMaterialValue: 521, _mat: 'Daedric', _wskill: 'longblade', value: 9000 });
  const wDupFree = mk('Weapons', 113, { uid: 'd1', name: 'Steel Dirk', rarity: 'common', nativeMaterialValue: 513, _mat: 'Steel', _wskill: 'shortblade', stackCount: 1, value: 40 });
  const wDupLock = mk('Weapons', 113, { uid: 'd2', name: 'Steel Dirk', rarity: 'common', nativeMaterialValue: 513, _mat: 'Steel', _wskill: 'shortblade', stackCount: 1, value: 40, locked: true });
  const wAxeLock = mk('Weapons', 124, { uid: 'a1', name: 'Bronze Chopper', rarity: 'rare', nativeMaterialValue: 519, _mat: 'Ebony', _wskill: 'axe', stackCount: 5, value: 1200, locked: true });
  const wQuestFree = mk('Weapons', 121, { uid: 'q1', name: 'Quest Blade', rarity: 'common', questItem: true, value: 1 });
  const mixedWeapons = [wDupFree, wMythic, null, wQuestFree, wAxeLock, wDupLock];
  const weaponMeta = { ...meta, pinOf: (it) => `${it.group}:${it.templateIndex}` };
  for (const mode of ['rarity', 'type', 'material', 'name', 'count']) {
    P.save({ sortMode: mode });
    const sorted = P.sortList(mixedWeapons, { nameOf: (it) => it.name }, nativeSort, weaponMeta);
    assert.equal(sorted[0].locked, true, `${mode}: locked item #1 is first`);
    assert.equal(sorted[1].locked, true, `${mode}: locked item #2 is second`);
    assert.ok(!sorted[2].locked, `${mode}: third item is not locked`);
    assert.equal(sorted[2], wQuestFree, `${mode}: unlocked quest item follows locked items`);
    assert.equal(sorted.at(-1), null, `${mode}: hole remains at the end`);
    assert.ok(sorted.indexOf(wDupLock) < sorted.indexOf(wDupFree), `${mode}: locked duplicate cannot be swapped behind unlocked copy by pinOf`);
    if (mode === 'rarity') {
      assert.deepEqual(sorted.slice(0, 2), [wAxeLock, wDupLock], 'rarity: locked items sort by rarity among themselves');
      assert.equal(sorted[3], wMythic, 'rarity: mythic follows locked/quest');
    } else if (mode === 'name') {
      assert.deepEqual(sorted.slice(0, 2), [wAxeLock, wDupLock], 'name: locked items sort alphabetically (Bronze < Steel)');
    } else if (mode === 'type') {
      assert.deepEqual(sorted.slice(0, 2), [wDupLock, wAxeLock], 'type: locked items sort by weapon type (shortblade < axe)');
    } else if (mode === 'material') {
      assert.deepEqual(sorted.slice(0, 2), [wAxeLock, wDupLock], 'material: locked items sort by material tier (Ebony > Steel)');
    } else if (mode === 'count') {
      assert.deepEqual(sorted.slice(0, 2), [wAxeLock, wDupLock], 'count: locked items sort by stack count (5 > 1)');
    }
  }

  // Footer: no .packitems; 4 panels in RTL visual order (DOM: z-status, z-rep, z-curr, z-carry);
  // gold drop in z-curr vs wagon stow + bag in z-carry; vertical date-over-health + "i" hover tooltip.
  const makeFooter = (goldLabel = 'Drop gold', withBag = true, carryText = '12 / 100') => {
    const ft = fakeNode('footer', 'packbar');
    const carry = fakeNode('div', 'packcarry');
    const meter = fakeNode('div', 'px-meter');
    const fill = fakeNode('div', 'px-fill');
    fill.style.width = '12%';
    meter.append(fill);
    carry.append(fakeNode('span', 'k', 'Carry Weight'), fakeNode('span', 'v', carryText), meter);
    const gold = fakeNode('div', 'packgold');
    const goldBtn = fakeNode('button', 'act goldbtn', goldLabel);
    gold.append(goldBtn);
    ft.append(fakeNode('span', 'packitems', '6'), carry, gold);
    if (withBag) ft.append(fakeNode('button', 'act bagbtn', 'Materials Bag'));
    return ft;
  };
  let inside = { building: { buildingType: 16, factionId: 0 } };
  let tipLinesCallCount = 0;
  ctx.__dfoBuildStatusLines = () => { tipLinesCallCount++; return ['You are in Daggerfall.', '', 'You are healthy.', { text: 'Well rested.', center: true }]; };
  ctx.__dfoPackWorld = {
    marks: () => 250,
    factions: () => new Map([[11, { id: 11, name: 'Mages Guild', rep: 42 }]]),
    statusContext: () => ({ lines: () => [], entity: {}, survival: null }),
    questWorld: {
      currentRegionIndex: () => 17,
      currentRegionName: () => 'Daggerfall',
      legalRepNow: () => 30,
      playerInside: () => inside,
    },
  };
  ctx.__dfoAurumReader = { cached: () => ({ balance: 75 }) };
  ctx.__dfoWorldStatus = {
    afflictions: () => [{ key: 'disease:1' }],
    needs: () => [{ key: 'hunger', tier: 2, text: 'Hungry', level: 'warn' }],
  };
  const ft = makeFooter('Drop gold', true);
  const textOf = (n) => n ? `${n.textContent}${n.children?.map(textOf).join('|') || ''}` : '';
  const footDeps = { entity: { health: 90, maxHealth: 100, goldPieces: 1200, sGroupReputations: [10, 20, 30, 55, -15], reactionMods: [0, 0, 0, 0, 0], biographyReactionMod: 0 }, gold: () => 1200, marks: () => 250, nowMinute: () => 523530 };
  P.foot(ft, fakeNode('div'), footDeps, { kind: 'ground', hasBag: true, toggleBag: () => { } });
  const rendered = textOf(ft);
  assert.equal(ft.querySelector('.packitems'), null, 'packitems removed completely');
  assert.deepEqual(ft.children.map((c) => c.className), ['dfo-bar-panel z-status', 'dfo-bar-panel z-rep', 'dfo-bar-panel z-curr', 'dfo-bar-panel z-carry'], 'panels ordered DOM LTR for RTL layout');
  assert.deepEqual(ft.children[0].children.map((c) => c.className), ['dfo-date-row', 'dfo-state-pills'], 'date above health/status pills in column');
  assert.ok(ft.children[2].querySelector('.goldbtn'), 'Drop gold placed in currencies panel');
  assert.equal(ft.children[3].querySelector('.goldbtn'), null, 'ground Drop gold not in carry panel');
  assert.ok(ft.children[3].querySelector('.bagbtn'), 'Materials Bag placed in carry panel');
  assert.ok(rendered.includes('250') && rendered.includes('75'), 'currencies shown');
  assert.ok(rendered.includes('Daggerfall') && rendered.includes('pack.rep.group.nobility'), 'palace shows region + nobility');
  assert.ok(rendered.includes('pack.date.line1') && rendered.includes('pack.date.line2') && rendered.includes('pack.date.w') && rendered.includes('pack.disease.1') && rendered.includes('pack.state.need.hunger.2'));
  assert.ok(ft.children[0].querySelector('.dfo-date-l1') && ft.children[0].querySelector('.dfo-date-l2'), 'date split into 2 aligned lines');

  // Hover tooltip Tier 1 ("i" status builder)
  ft.children[0].emit('mouseenter');
  assert.equal(tipLinesCallCount, 1, 'hover triggers native "i" status builder');
  assert.equal(ctx.document.body.children.length, 1, 'status tooltip attached to body');
  assert.ok(textOf(ctx.document.body.children[0]).includes('You are in Daggerfall.') && textOf(ctx.document.body.children[0]).includes('Well rested.'));
  ft.children[0].emit('mouseleave');
  assert.equal(ctx.document.body.children.length, 0, 'status tooltip removed on mouseleave');

  // Wagon mode: Stow gold + Materials Bag inside carry panel + Tier 2 tooltip fallback
  delete ctx.__dfoBuildStatusLines;
  let toggledBag = 0;
  inside = { dungeon: {} };
  const ft2 = makeFooter('Stow gold', false);
  P.foot(ft2, fakeNode('div'), { ...footDeps, entity: { ...footDeps.entity, goldPieces: 10, sGroupReputations: [0, 0, 0, 0, -50] } }, { kind: 'wagon', hasBag: true, toggleBag: () => { toggledBag++; } });
  assert.ok(ft2.children[3].querySelector('.goldbtn'), 'wagon Stow gold placed inside carry panel');
  assert.ok(ft2.children[3].querySelector('.bagbtn'), 'Materials Bag rendered inside carry panel during wagon view');
  assert.equal(ft2.children[2].querySelector('.goldbtn'), null, 'no gold button left in currencies panel during wagon stow');
  ft2.children[3].querySelector('.bagbtn').onclick();
  assert.equal(toggledBag, 1, 'synthesized bag button invokes toggleBag');
  assert.ok(textOf(ft2).includes('pack.rep.group.underworld'), 'dungeon switches bottom line to Underworld');
  ft2.children[0].emit('focusin');
  const tip2Text = textOf(ctx.document.body.children[0]);
  assert.ok(tip2Text.includes('pack.statusTip.title') && tip2Text.includes('pack.statusTip.where') && tip2Text.includes('pack.statusTip.health'), 'Tier 2 tooltip shows fallback "i" status sections');
  ft2.children[0].emit('focusout');

  // 3x2 Currencies grid (no .k word labels, Welkynd Shards 571 & Deadlands Embers 570, rich tooltips),
  // Villainy meter (0..5000 vs >= 5000 red state), Full Relations tooltip, and stacked Materials Bag in carry.
  let liveVillainy = 1850;
  ctx.__dfoPackWorld.villainy = () => liveVillainy;
  ctx.__dfoPackWorld.regionName = (ri) => ({ 17: 'Daggerfall', 23: 'Wayrest' }[ri] || '');
  const richEntity = {
    ...footDeps.entity,
    items: [
      { templateIndex: 571, stackCount: 30 },
      { templateIndex: 571, stackCount: 18 },
      { templateIndex: 571, stackCount: 99, equippedSlot: 0 }, // equipped ignored
      { templateIndex: 570, stackCount: 7 },
      { templateIndex: 570, stackCount: 5 },
    ],
    legalRep: { 17: 30, 23: -24 },
    regionConditions: Object.assign([], { 23: { severePunishmentFlags: 1 } }),
    _dressStanding: { groups: [5, 0, -2, 10, 0], temple: 4 },
    guildMemberships: { mortal: { mg: { guild: 'Mages Guild', factionId: 11 } }, vampire: {} },
    factionRep: { dict: new Map([[11, { id: 11, name: 'Mages Guild', rep: 48 }], [40, { id: 40, name: 'Temple of Kynareth', rep: 26 }]]) },
  };
  inside = { building: { buildingType: 16, factionId: 0 } };
  const ft3 = makeFooter('Drop gold', true);
  P.foot(ft3, fakeNode('div'), { ...footDeps, entity: richEntity }, { kind: 'ground', hasBag: true, toggleBag: () => { } });
  const chips3 = ft3.children[2].querySelectorAll('.dfo-curr-chip');
  assert.equal(chips3.length, 5, '3x2 currencies panel holds 5 currency chips (gold, shards, embers, silver, aurum)');
  assert.ok(chips3.every((c) => !c.querySelector('.k')), 'no currency word labels inside chips');
  assert.equal(ft3.children[2].querySelector('.is-shards').querySelector('.v').textContent, '48', 'sums unequipped templateIndex 571');
  assert.equal(ft3.children[2].querySelector('.is-embers').querySelector('.v').textContent, '12', 'sums unequipped templateIndex 570');

  chips3.find((c) => c.classList.contains('is-shards')).emit('mouseenter');
  const shardTipText = textOf(ctx.document.body.children[0]);
  assert.ok(shardTipText.includes('pack.bar.shards') && shardTipText.includes('pack.currTip.what') && shardTipText.includes('pack.currTip.shards.what') && shardTipText.includes('48'), 'shards currency tooltip renders explanation and count');
  chips3.find((c) => c.classList.contains('is-shards')).emit('mouseleave');
  assert.equal(ctx.document.body.children.length, 0, 'currency tooltip detached on mouseleave');

  const vilRow3 = ft3.children[1].querySelector('.dfo-villainy-row');
  assert.equal(vilRow3.classList.contains('is-villain'), false, 'villainy < 5000 is not marked red');
  const vilText3 = textOf(vilRow3);
  assert.match(vilText3, /"val":"1.?850"/, 'villainy < 5000 formats value cleanly');
  assert.match(vilText3, /"max":"5.?000"/, 'villainy < 5000 formats against 5,000 threshold');

  ft3.children[1].emit('mouseenter');
  const relTipText = textOf(ctx.document.body.children[0]);
  assert.ok(
    relTipText.includes('pack.repTip.title')
    && relTipText.includes('pack.repTip.sec.groups')
    && relTipText.includes('pack.repTip.dress')
    && relTipText.includes('Wayrest')
    && relTipText.includes('pack.repTip.law.banned')
    && relTipText.includes('Mages Guild')
    && relTipText.includes('pack.repTip.guildLine')
    && relTipText.includes('pack.repTip.factionLine'),
    'Relations tooltip includes social groups, dress modifiers, law banishments and guild membership'
  );
  ft3.children[1].emit('mouseleave');

  // Threshold >= 5000 flips Villainy row to is-villain red state and scales display against 10,000
  liveVillainy = 6200;
  const ft4 = makeFooter('Stow gold', true);
  P.foot(ft4, fakeNode('div'), { ...footDeps, entity: richEntity }, { kind: 'wagon', hasBag: true, toggleBag: () => { } });
  const vilRow4 = ft4.children[1].querySelector('.dfo-villainy-row');
  assert.equal(vilRow4.classList.contains('is-villain'), true, 'villainy >= 5000 flips meter to crimson Villain state');
  const vilText4 = textOf(vilRow4);
  assert.match(vilText4, /"val":"6.?200"/, 'villainy >= 5000 formats value cleanly');
  assert.match(vilText4, /"max":"10.?000"/, 'villainy >= 5000 scales display max to 10,000');
  assert.equal(ft4.children[2].querySelector('.is-gold').classList.contains('is-tall'), true, 'gold chip spans two rows when Stow gold moves to carry');
  assert.equal(ft4.children[3].querySelector('.dfo-bar-actions').classList.contains('is-dual'), true, 'carry panel stacks Stow gold + Materials Bag underneath scale');
  assert.equal(ft4.children[3].querySelector('.packcarry').querySelector('.k'), null, 'Weight text label removed from carry plaque');
  assert.ok(ft4.children[3].querySelector('.packcarry').querySelector('.dfo-carry-icon'), 'Weight SVG icon inserted into carry plaque');

  // Compact rounding (M for gold with 3 decimals, K tenths >= 1000 for others), purse-only gold vs LoC tooltip cards, overweight meter
  const whaleEntity = {
    ...richEntity,
    goldPieces: 1327400,
    items: [
      { templateIndex: 275, value: 450000, stackCount: 1 },
      { templateIndex: 275, value: 50000, stackCount: 2 },
      { templateIndex: 571, stackCount: 1537 },
      { templateIndex: 570, stackCount: 2450 },
    ],
  };
  const ft5 = makeFooter('Drop gold', true, '78 / 75');
  ft5.querySelector('.px-fill').style.width = '100%';
  P.foot(ft5, fakeNode('div'), { ...footDeps, entity: whaleEntity, gold: () => 1877400 }, { kind: 'ground', hasBag: true, toggleBag: () => { } });
  assert.ok(ft5.children[3].querySelector('.packcarry').classList.contains('is-overweight'), 'carry plaque marks overweight state cleanly');
  const carryHead = ft5.children[3].querySelector('.dfo-carry-head');
  assert.ok(carryHead && carryHead.querySelector('.dfo-carry-icon') && carryHead.querySelector('.v'), 'carry weight icon and numerals paired in header');
  assert.equal(ft5.children[3].querySelector('.px-fill').style.backgroundColor, 'rgb(220, 38, 38)', 'overweight carry bar uses solid crimson stop');
  assert.notEqual(ft.children[3].querySelector('.px-fill').style.backgroundColor, 'rgb(220, 38, 38)', 'light load carry bar does not use crimson stop');
  assert.equal(ft5.children[2].querySelector('.is-gold').querySelector('.v').textContent, 'pack.curr.fmt.mln:{"v":"1.327"}', 'gold chip displays purse coins only rounded to M');
  assert.equal(ft5.children[2].querySelector('.is-shards').querySelector('.v').textContent, 'pack.curr.fmt.k:{"v":"1.5"}', '1537 shards round cleanly to tenths K');
  assert.equal(ft5.children[2].querySelector('.is-embers').querySelector('.v').textContent, 'pack.curr.fmt.k:{"v":"2.5"}', '2450 embers round cleanly to tenths K');

  ft5.children[2].querySelector('.is-gold').emit('mouseenter');
  const goldCards = ctx.document.body.children[0].querySelectorAll('.dfo-st-card');
  assert.equal(goldCards.length, 2, 'Gold tooltip renders two separate exact balance cards');
  assert.ok(textOf(goldCards[0]).includes('pack.currTip.gold.coins') && /1.?327.?400/.test(textOf(goldCards[0])), 'card 1 shows exact purse gold');
  assert.ok(textOf(goldCards[1]).includes('pack.currTip.gold.loc') && /550.?000/.test(textOf(goldCards[1])), 'card 2 shows exact Letters of Credit sum (value * stackCount)');
  ft5.children[2].querySelector('.is-gold').emit('mouseleave');

  // Dual clocks: .z-status panel & tooltip status lines stay synced on player local time, with separate local/server cards + explanation
  const localMinute = 1725052;
  const serverMinute = 1770876;
  const seenHookMinutes = [];
  ctx.__dfoBuildStatusLines = (statusCtx) => {
    const skySec = statusCtx?.macroContext?.hooks?.skySeconds?.();
    const nowSec = statusCtx?.macroContext?.nowSeconds?.();
    seenHookMinutes.push({ skyMin: Math.floor(skySec / 60), nowMin: Math.floor(nowSec / 60) });
    return [
      'You are in Penwick Wood.',
      `Right now it is ${Math.floor(skySec / 60)}.`,
      'You are healthy.',
    ];
  };
  ctx.__dfoPackWorld = {
    ...ctx.__dfoPackWorld,
    clocks: () => ({ own: localMinute, sky: serverMinute, world: localMinute + 5000, online: true }),
    statusContext: () => ({
      lines: () => [],
      macroContext: {
        nowSeconds: () => localMinute * 60,
        hooks: {
          ownMinutes: () => localMinute,
          nowSeconds: () => localMinute * 60,
          skySeconds: () => serverMinute * 60,
        },
      },
      entity: {},
      survival: null,
    }),
  };

  const ft6 = makeFooter('Drop gold', true);
  // Even if host passes a different deps.nowMinute, world.clocks().own guarantees local player clock in panel
  P.foot(ft6, fakeNode('div'), { ...footDeps, entity: richEntity, nowMinute: () => serverMinute }, { kind: 'ground', hasBag: true, toggleBag: () => { } });
  const dateL1 = ft6.children[0].querySelector('.dfo-date-l1').textContent;
  const expectedLocalHHMM = `${String(Math.floor((localMinute % 1440) / 60)).padStart(2, '0')}:${String(localMinute % 60).padStart(2, '0')}`;
  const expectedServerHHMM = `${String(Math.floor((serverMinute % 1440) / 60)).padStart(2, '0')}:${String(serverMinute % 60).padStart(2, '0')}`;
  assert.notEqual(expectedLocalHHMM, expectedServerHHMM);
  assert.ok(dateL1.includes(expectedLocalHHMM), `.z-status date displays local player time (${expectedLocalHHMM}), got ${dateL1}`);

  ft6.children[0].emit('mouseenter');
  assert.equal(seenHookMinutes.length, 1);
  assert.equal(seenHookMinutes[0].skyMin, localMinute, 'native status builder receives wrapped skySeconds bound to player local time');
  assert.equal(seenHookMinutes[0].nowMin, localMinute, 'native status builder receives nowSeconds bound to player local time');

  const dualTip = ctx.document.body.children[0];
  const dualTipText = textOf(dualTip);
  assert.ok(dualTipText.includes(`Right now it is ${localMinute}.`), 'native status line inside tooltip matches player local time');
  const dualCards = dualTip.querySelectorAll('.dfo-st-card');
  assert.equal(dualCards.length, 2, 'status tooltip renders two separate clock blocks (local and server)');
  assert.equal(dualCards[0].classList.contains('is-local'), true);
  assert.equal(dualCards[1].classList.contains('is-server'), true);
  assert.ok(textOf(dualCards[0]).includes('pack.statusTip.clock.local') && textOf(dualCards[0]).includes(expectedLocalHHMM), 'local clock card shows exact player local time');
  assert.ok(textOf(dualCards[1]).includes('pack.statusTip.clock.server') && textOf(dualCards[1]).includes(expectedServerHHMM), 'server clock card shows exact world/server sky time');
  const dualInfo = dualTip.querySelector('.dfo-st-info');
  assert.ok(dualInfo && textOf(dualInfo).includes('pack.statusTip.clock.why') && textOf(dualInfo).includes('pack.statusTip.clock.note'), 'separate explanation block explains client vs server clocks');
  ft6.children[0].emit('mouseleave');
});

test('transformInventory hooks world marks eagerly without villainy/MGe names and aurum probes daggerShell.storage', async () => {
  const vm2 = require('node:vm');
  const { transformInventory: tx } = require('../src/mod/inventory-transform.cjs');

  const imp = ';import{a as mapReg,c as io,l as so}from"./mapsTables-XYZ12345.js";';
  const qw = 'function mkQW(e){let{maps:m,townTalk:tRef}=e,R={legalRepNow:()=>42,currentRegionIndex:()=>3,factionNPC:()=>e.npcSession.npcData?.npcFactionName??``,factionName:()=>{if(e.npcSession.npcData?.guildGroup===GG.HolyOrder){let x=lse(tRef.factionDict,e.modes?.interiorBuilding?.factionId??0);if(x)return x}return``},lordNameForFaction:(a,b=!1)=>bfe(tRef.factionDict,a,b),currentRegionName:()=>{let i=iFn();return m.getRegion(i)?.name??(so(i)?mapReg[i]:``)},setPlayerScenePosition:t=>{t&&e.modes?.setPlayerScenePosition?.(t)}};return{questWorld:R}}';
  const vil = 'function vGuardB(e,t,n,r,{zone:i=zF,every:a=setInterval}={}){Hh(()=>!!e?.on()&&!!i());Ma(`pvpRules`,()=>yy()?Oh:null);let o=()=>JP(e?.fightLeft?.()??0),u=()=>{};return a?.(u,250),{flag:e,tick:u,limited:yy}}var thn=1e3,nhn=600,vText={get come(){return V(`pvp.guards.come`,`You are a villain. This town is no safe zone for you, and the guards come for you.`)},get gone(){return V(`pvp.guards.gone`,`The guards stop the hunt.`)}};function vGuardA(e,t,n,r,{zone:i=zF,now:a=Date.now,every:o=setInterval}={}){let s=null,p=()=>{let u=e.flag?.villainy?.();u?r(vText.come):r(vText.gone)};return o?.(p,thn),{...e,tick:p,hunting:()=>!!s,hunters:()=>[]}}';
  const psn = 'function bootFake(e){let{BAG_DEPOSIT_KEPT_TEXT:t,maps:mp,marksBook:mb,player:pl}=e;let zz=1,qm=vGuardA(vGuardB(wFn(()=>a,pl,c_,K),G,pl,c_),()=>[YC,Ba?G.pos:W.pos,W.yaw,Z?.mode??`exterior`,iv(Oj(G.feetAt()),ni)],pl,c_).flag,nxe=0;let sc={classicSeconds:()=>Xg.ownMinutes*60,skySeconds:()=>bh()*60,worldSeconds:()=>Xg.classicMinutes*60,raisedSeconds:()=>Lde()*60,questClockStepMax:()=>1/0,sharedClock:()=>xx()};let st={toggleCharSheet:()=>K.showOverlay(),showStatus:()=>{LHe({mount:x=>K.showOverlay(x),drop:x=>K.closeOverlay(x),lines:x=>K.lines(x),macroContext:Ef?.machine?.macroContext?.()??null,entity:pl,survival:qn()?{minutes:Math.floor(Ib()),vampire:!!la(pl),endurance:Ln(pl,`endurance`)}:null})}};return{clothing:()=>`MensClothing`,marks:()=>mb?.state?.balance??null,marksOpen:()=>mb?.state?.open!==!1,sc,st,qm}}';

  const outWorld = tx('assets/world-FAKE0001.js', imp + qw + vil + psn, []);
  assert.ok(outWorld.includes('__dfoPackWorld'), 'worldContext attaches __dfoPackWorld');
  assert.ok(outWorld.includes('refreshMarks'), 'worldContext exposes refreshMarks');
  assert.ok(/__dfoPackWorld[\s\S]*villainy:/.test(outWorld.slice(outWorld.indexOf('qm='))), 'worldContext matches villain without hardcoded ihn/ehn');
  assert.ok(outWorld.includes('statusContext:'), 'worldContext exposes statusContext');
  assert.ok(outWorld.includes('clocks:'), 'worldContext exposes own/sky/world/online clocks');

  const outNoVillain = tx('assets/world-FAKE0002.js', imp + qw + psn.replace(/let zz=1,qm=[^;]+;/, '').replace(',qm', ''), []);
  assert.ok(outNoVillain.includes('__dfoPackWorld') && outNoVillain.includes('refreshMarks') && outNoVillain.includes('statusContext:'), 'opt() keeps worldContext working even when villain is absent');
  assert.ok(!outNoVillain.includes('villainy:'), 'villainy sub-hook omitted cleanly when absent');

  const runnableWorld = outWorld.replace(/^;import[^;]+;/, '');
  const marksBookState = { state: { balance: 190, open: true }, readCalls: 0, async refresh() { this.readCalls += 1; this.state = { balance: 245, open: true }; return this.state; } };
  const worldCtx = {
    globalThis: null,
    Date,
    mapReg: ['Zero', 'Alik\'r', 'Anticlere', 'Bhoriane'],
    iFn: () => 3,
    so: () => true,
    lse: () => '',
    bfe: () => '',
    V: (_k, d) => d,
    Hh: () => { },
    Ma: () => { },
    yy: () => false,
    Oh: null,
    JP: (x) => x,
    zF: () => true,
    setInterval: () => 0,
    wFn: () => ({ on: () => true, fightLeft: () => 0, villainy: () => ({ cur: 12, cap: 5000 }) }),
    LHe: () => { },
    Ef: null,
    qn: () => false,
    Ib: () => 0,
    la: () => false,
    Ln: () => 50,
    K: { showOverlay: () => { }, closeOverlay: () => { }, lines: () => [] },
    GG: { HolyOrder: 1 },
    YC: {}, Ba: false, G: { pos: [0, 0], feetAt: () => [0, 0] }, W: { pos: [0, 0], yaw: 0 }, Z: { mode: 'exterior' }, iv: () => true, Oj: (p) => p, ni: 0, c_: () => { }, a: null,
  };
  worldCtx.globalThis = worldCtx;
  vm2.runInNewContext(`${runnableWorld}\nconst _qw = mkQW({ maps: { getRegion: () => null }, townTalk: { factionDict: new Map() }, npcSession: {} });\nconst _bw = bootFake({ maps: {}, marksBook: __mb, player: {} });`, { ...worldCtx, __mb: marksBookState });
  assert.equal(worldCtx.__dfoPackWorld.marks(), 190, 'marks bound eagerly during bootWorld without invoking _bw.marks first');
  assert.equal(worldCtx.__dfoPackWorld.marksOpen(), true, 'marksOpen bound eagerly during bootWorld');
  assert.equal(typeof worldCtx.__dfoPackWorld.refreshMarks, 'function', 'refreshMarks exposed eagerly during bootWorld');
  assert.equal(worldCtx.__dfoPackWorld.regionName(3), 'Bhoriane', 'regionName uses imported mapsTables array');
  assert.equal(worldCtx.__dfoPackWorld.villainy().cur, 12, 'villainy hook reads villain flag');

  const statusFake = [
    'var uVar=`Unwell`,uFn=()=>T(`hud.status.unwell`,uVar);',
    'function xAff(e){let t=[],n=!1,r=!1;for(let i of e?.activeEffects??[])i&&!i.ended&&(i.kind===`poison`&&i.state!==`waiting`?n=!0:i.kind===`disease`&&i.incubationOver&&i.disease!=null&&dM[i.disease]?t.push({key:`disease:${i.disease}`,name:dM[i.disease],glyph:`disease`}):!r&&uF(i)&&(r=!0,t.push({key:`unwell`,name:uFn(),glyph:`disease`})));n&&t.unshift({key:`poison`,name:`Poisoned`,glyph:`poison`});let a=e?.bleed;return a&&a.left>0&&t.push({key:`bleed`,name:`Bleeding`,glyph:`bleed`,foot:String(a.left),blink:a.left<2}),t}',
    'var PM=Object.freeze({hunger:Object.freeze({peckish:`Peckish`})});function FM(e,t){return t}var IM=Object.freeze({danger:`d`,warn:`w`}),HM={hunger:[`peckish`]},TGe=(e,t)=>HM[e];',
    'function fNeed(e,t,{vampire:n=!1,endurance:r=50,rules:i=null,live:a=null}={}){if(!e?.survival)return[];let o=dt(e,t),c=[],l=(e,t,n)=>{c.push({key:e,text:t[n],level:FM(e,n)})};n||l(`hunger`,PM.hunger,`peckish`);return c}',
    'function fLines(e,t,{vampire:n=!1,endurance:r=50,rules:i=null}={}){let a=dt(e,t),o=!!zM(a,i).boons,c=[];if(n)c.push(qM.vampire);else{let e=jn(In(a,t));c.push(qM.hunger[e]),c.push(qM.thirst[ur(a.thirst)]);let n=Jt(a.sleepDebt);c.push(qM.sleep[n])}return c}',
    'function fRank(e){return e>80?j(`revered`,`revered`):e>60?j(`esteemed`,`esteemed`):e===0?j(`aCommonCitizen`,`a common citizen`):j(`aVillain`,`a villain`)}',
  ].join('');
  const outStatus = tx('assets/worldTick-FAKE0001.js', statusFake, []);
  assert.ok(outStatus.includes('__dfoWorldStatus'), 'worldStatus matches via hud.status.unwell without hardcoded MGe');

  const acFake = [
    'var Ir=`https://acct.example.com`,Lr=`https://private.invalid`,SKey=`dagger.account.session`,BKey=`dagger.account.service`,Pr=`dfo.privateSubject`;',
    'function readSes(st){try{let s=st?.getItem?.(SKey);if(!s)return null;let o=JSON.parse(s);return typeof o?.secret==`string`&&o.secret?o:null}catch{return null}}',
    'function readSvc(st){if(isP())return Lr;try{let t=st?.getItem?.(BKey);return typeof t==`string`&&/^https:\\/\\/\\S+$/.test(t)?t:Ir}catch{return Ir}}',
    'async function rq(o,p){return o.fetch(o.base+p,{headers:{authorization:`Bearer ${o.secret}`}}).then(r=>r.json()).then(d=>({ok:!0,data:d}))}',
    'var qGet=e=>rq(e,`/v1/account`);export{qGet as fi};',
  ].join('');
  const outAurum = tx('assets/accountClient-FAKE0001.js', acFake, []);
  assert.ok(outAurum.includes('__dfoAurumReader'), 'aurumClient attaches __dfoAurumReader');
  const runnableAurum = outAurum.replace(/export\{[^}]+\};?/g, '');

  const shellMap = new Map([
    ['dagger.account.session', JSON.stringify({ secret: 'sec-shell' })],
    ['dagger.account.service', 'https://custom.accounts.example'],
  ]);
  const localMap = new Map([
    ['dagger.account.session', JSON.stringify({ secret: 'sec-local' })],
    ['dagger.account.service', 'https://fallback.example'],
  ]);
  const seenCalls = [];
  let respBody = { aurum: { open: true } };
  const aCtx = {
    globalThis: null,
    Date, JSON, Number, URL,
    isP: () => false,
    daggerShell: { storage: { getItem: (k) => shellMap.get(k) ?? null } },
    localStorage: { getItem: (k) => localMap.get(k) ?? null },
    fetch: async (url, init) => {
      seenCalls.push({ url, auth: init?.headers?.authorization });
      return { ok: true, status: 200, json: async () => respBody };
    },
  };
  aCtx.globalThis = aCtx;
  vm2.runInNewContext(runnableAurum, aCtx);

  const first = await aCtx.__dfoAurumReader.read();
  assert.equal(seenCalls.length, 1);
  assert.equal(seenCalls[0].url, 'https://custom.accounts.example/v1/account');
  assert.equal(seenCalls[0].auth, 'Bearer sec-shell', 'reads daggerShell.storage before localStorage');
  assert.deepEqual({ balance: first.balance, open: first.open }, { balance: 0, open: true }, 'normalizes { open: true } with missing balance to 0');

  shellMap.set('dagger.account.service', 'https://private.invalid');
  assert.equal(await aCtx.__dfoAurumReader.read(), null, 'skips .invalid account base without fetching');
  assert.equal(seenCalls.length, 1);

  shellMap.delete('dagger.account.session');
  respBody = { aurum: { open: false, balance: 77 } };
  const second = await aCtx.__dfoAurumReader.read();
  assert.equal(seenCalls.length, 2);
  assert.equal(seenCalls[1].auth, 'Bearer sec-local', 'falls back to localStorage when daggerShell.storage has no session');
  assert.deepEqual({ balance: second.balance, open: second.open }, { balance: 77, open: false });
});

test('foot() uses world.regionName fallback and preserves async Silver/Aurum hydration across repaints', async () => {
  const vm2 = require('node:vm');
  const fs2 = require('node:fs');
  const path2 = require('node:path');
  const R2 = require('../src/mod/page/dfo_pack_rules.js');
  const packSrc2 = fs2.readFileSync(path2.join(__dirname, '../src/mod/page/dfo_pack.js'), 'utf8');

  const mkNode = (tag, cls = '', txt = '') => {
    const ch = [];
    const attrs = new Map();
    const listeners = new Map();
    const clsSet = new Set(String(cls).split(/\s+/).filter(Boolean));
    const n = {
      tagName: String(tag).toUpperCase(),
      nodeType: tag === '#text' ? 3 : 1,
      style: {},
      dataset: {},
      children: ch,
      parentNode: null,
      parentElement: null,
      isConnected: true,
      _txt: String(txt),
      get className() { return [...clsSet].join(' '); },
      set className(v) { clsSet.clear(); String(v || '').split(/\s+/).filter(Boolean).forEach((c) => clsSet.add(c)); },
      classList: {
        add: (...xs) => xs.forEach((x) => clsSet.add(x)),
        remove: (...xs) => xs.forEach((x) => clsSet.delete(x)),
        toggle: (x, f) => (f === undefined ? (clsSet.has(x) ? clsSet.delete(x) : clsSet.add(x)) : (f ? clsSet.add(x) : clsSet.delete(x))),
        contains: (x) => clsSet.has(x),
      },
      get textContent() { return ch.length ? `${this._txt}${ch.map((c) => c.textContent).join('')}` : this._txt; },
      set textContent(v) { ch.length = 0; this._txt = String(v ?? ''); },
      get innerHTML() { return this._txt; },
      set innerHTML(v) { ch.length = 0; this._txt = String(v ?? ''); },
      get childElementCount() { return ch.length; },
      get firstChild() { return ch[0] ?? null; },
      appendChild(c) {
        if (!c) return c;
        if (c.parentNode?.children) {
          const i = c.parentNode.children.indexOf(c);
          if (i >= 0) c.parentNode.children.splice(i, 1);
        }
        ch.push(c); c.parentNode = n; c.parentElement = n; return c;
      },
      closest: () => null,
      append(...xs) { xs.forEach((x) => n.appendChild(typeof x === 'string' ? mkNode('#text', '', x) : x)); },
      replaceChildren(...xs) { ch.length = 0; n.append(...xs); },
      remove() {
        const p = n.parentNode;
        if (!p || !p.children) return;
        const i = p.children.indexOf(n);
        if (i >= 0) p.children.splice(i, 1);
        n.parentNode = null;
        n.parentElement = null;
      },
      setAttribute(k, v) { if (k === 'class') n.className = v; else attrs.set(k, String(v)); },
      getAttribute(k) { return k === 'class' ? n.className : (attrs.get(k) ?? null); },
      removeAttribute(k) { attrs.delete(k); },
      hasAttribute: (k) => k === 'class' || attrs.has(k),
      querySelector(sel) { return n.querySelectorAll(sel)[0] ?? null; },
      querySelectorAll(sel) {
        const want = String(sel).replace(/^\./, '');
        const out = [];
        for (const c of ch) {
          if (c.classList?.contains(want) || c.tagName.toLowerCase() === want) out.push(c);
          out.push(...c.querySelectorAll(sel));
        }
        return out;
      },
      addEventListener(t, fn) { if (!listeners.has(t)) listeners.set(t, []); listeners.get(t).push(fn); },
      removeEventListener() { },
      matches: () => false,
    };
    return n;
  };

  let resolveMarks;
  let resolveAurum;
  let silverBal = null;
  const storage = new Map();
  const ctx2 = {
    Math, Number, String, Boolean, Array, Object, Map, Set, Date, Promise, JSON, Intl, WeakMap, console,
    addEventListener() { },
    document: {
      documentElement: mkNode('html'),
      head: mkNode('head'),
      body: mkNode('body'),
      getElementById: () => null,
      createElement: (t) => mkNode(t),
      createElementNS: (_ns, t) => mkNode(t),
      createTextNode: (t) => mkNode('#text', '', t),
      addEventListener() { },
    },
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
    __dfoPackRules: R2,
    __dfoUi: { t: (k, p) => (p && Object.keys(p).length ? `${k}:${JSON.stringify(p)}` : k) },
    __dfoItemCards: { slotName: () => '', weaponSkill: () => '', material: () => '', isAmmo: () => false },
    __dfoPackWorld: {
      questWorld: {
        currentRegionName: () => '',
        currentRegionIndex: () => 17,
        legalRepNow: () => 12,
      },
      regionName: (idx) => (idx === 17 ? 'Bhoriane' : ''),
      marks: () => silverBal,
      marksOpen: () => true,
      refreshMarks: () => new Promise((res) => {
        resolveMarks = (v) => {
          silverBal = v?.balance ?? null;
          res(v);
        };
      }),
    },
    __dfoAurumReader: {
      cached: () => null,
      read: () => new Promise((res) => { resolveAurum = res; }),
    },
  };
  ctx2.globalThis = ctx2;
  ctx2.window = ctx2;
  vm2.runInNewContext(packSrc2, ctx2);
  const P2 = ctx2.__dfoPack;

  const mkFoot = () => {
    const ft = mkNode('div', 'packbar');
    const items = mkNode('span', 'packitems');
    const gold = mkNode('span', 'packgold'); gold.append(mkNode('span', 'k', 'Gold'), mkNode('span', 'v', '10'));
    const carry = mkNode('span', 'packcarry');
    const meter = mkNode('span', 'px-meter'); meter.append(mkNode('span', 'px-fill'));
    carry.append(mkNode('span', 'k', 'Carry'), mkNode('span', 'v', '10 / 75'), meter);
    const bag = mkNode('button', 'bagbtn', 'Bag');
    const drop = mkNode('button', 'goldbtn', 'Drop gold');
    ft.append(items, gold, carry, bag, drop);
    return ft;
  };

  const deps = {
    entity: { health: 90, maxHealth: 100, goldPieces: 230, sGroupReputations: [0, 0, 0, 6, 0], reactionMods: [0, 0, 0, 0, 0], biographyReactionMod: 0 },
    gold: () => 230,
    nowMinute: () => 523530,
  };
  const mode = { kind: 'ground', hasBag: true, toggleBag: () => { } };

  const ft = mkFoot();
  P2.foot(ft, mkNode('div'), deps, mode);
  assert.ok(ft.children[1].textContent.includes('Bhoriane'), 'region line uses world.regionName fallback when currentRegionName returns empty');
  assert.equal(ft.children[2].querySelector('.is-silver').querySelector('.v').textContent, 'pack.bar.unavailable', 'initial pending silver shows unavailable placeholder');
  assert.equal(ft.children[2].querySelector('.is-aurum').querySelector('.v').textContent, 'pack.bar.unavailable', 'initial pending aurum shows unavailable placeholder');

  // Synchronous repaint replaces footer children while async requests are still in flight
  P2.foot(ft, mkNode('div'), deps, mode);
  resolveMarks({ open: true, balance: 340 });
  resolveAurum({ open: true, balance: 85 });
  await new Promise((r) => setImmediate(r));

  assert.equal(ft.children[2].querySelector('.is-silver').querySelector('.v').textContent, '340', 'in-flight Silver Marks resolves into repainted footer DOM');
  assert.equal(ft.children[2].querySelector('.is-aurum').querySelector('.v').textContent, '85', 'in-flight Aurum resolves into repainted footer DOM');
});

test('head() builds RTL 1..5 (LTR 5..1) clusters with non-doubled dividers and distinct Salvage/Close classes', async () => {
  const vm2 = require('node:vm');
  const fs2 = require('node:fs');
  const path2 = require('node:path');
  const R2 = require('../src/mod/page/dfo_pack_rules.js');
  const packSrc2 = fs2.readFileSync(path2.join(__dirname, '../src/mod/page/dfo_pack.js'), 'utf8');

  const mkNode = (tag, cls = '', txt = '') => {
    const ch = [];
    const attrs = new Map();
    const clsSet = new Set(String(cls).split(/\s+/).filter(Boolean));
    const n = {
      tagName: String(tag).toUpperCase(),
      nodeType: tag === '#text' ? 3 : 1,
      style: {},
      dataset: {},
      children: ch,
      parentNode: null,
      parentElement: null,
      isConnected: true,
      _txt: String(txt),
      get className() { return [...clsSet].join(' '); },
      set className(v) { clsSet.clear(); String(v || '').split(/\s+/).filter(Boolean).forEach((c) => clsSet.add(c)); },
      classList: {
        add: (...xs) => xs.forEach((x) => clsSet.add(x)),
        remove: (...xs) => xs.forEach((x) => clsSet.delete(x)),
        contains: (x) => clsSet.has(x),
      },
      get textContent() { return ch.length ? `${this._txt}${ch.map((c) => c.textContent).join('')}` : this._txt; },
      set textContent(v) { ch.length = 0; this._txt = String(v ?? ''); },
      appendChild(c) {
        if (!c) return c;
        if (c.parentNode?.children) {
          const i = c.parentNode.children.indexOf(c);
          if (i >= 0) c.parentNode.children.splice(i, 1);
        }
        ch.push(c); c.parentNode = n; c.parentElement = n; return c;
      },
      closest: () => null,
      append(...xs) { xs.forEach((x) => n.appendChild(typeof x === 'string' ? mkNode('#text', '', x) : x)); },
      replaceChildren(...xs) { ch.length = 0; n.append(...xs); },
      remove() {
        const p = n.parentNode;
        if (!p || !p.children) return;
        const i = p.children.indexOf(n);
        if (i >= 0) p.children.splice(i, 1);
        n.parentNode = null;
        n.parentElement = null;
      },
      setAttribute(k, v) { if (k === 'class') n.className = v; else attrs.set(k, String(v)); },
      getAttribute(k) { return k === 'class' ? n.className : (attrs.get(k) ?? null); },
      removeAttribute(k) { attrs.delete(k); },
      querySelector(sel) { return n.querySelectorAll(sel)[0] ?? null; },
      querySelectorAll(sel) {
        const want = String(sel).replace(/^\./, '');
        const out = [];
        for (const c of ch) {
          if (c.classList?.contains(want) || c.tagName.toLowerCase() === want) out.push(c);
          out.push(...c.querySelectorAll(sel));
        }
        return out;
      },
      matches(sel) {
        if (sel === 'button.act') return n.tagName === 'BUTTON' && clsSet.has('act');
        return false;
      },
    };
    return n;
  };

  const ctx2 = {
    Math, Number, String, Boolean, Array, Object, Map, Set, Date, Promise, JSON, Intl, WeakMap, console,
    addEventListener() { },
    document: {
      documentElement: mkNode('html'),
      head: mkNode('head'),
      body: mkNode('body'),
      getElementById: () => null,
      createElement: (t) => mkNode(t),
      createElementNS: (_ns, t) => mkNode(t),
      createTextNode: (t) => mkNode('#text', '', t),
      addEventListener() { },
    },
    localStorage: { getItem: () => null, setItem: () => { } },
    __dfoPackRules: R2,
    __dfoUi: { t: (k) => k },
    __dfoItemCards: { slotName: () => '', weaponSkill: () => '', material: () => '', isAmmo: () => false },
  };
  ctx2.globalThis = ctx2;
  ctx2.window = ctx2;
  vm2.runInNewContext(packSrc2, ctx2);
  const P2 = ctx2.__dfoPack;

  // Case 1: Full header (Codex + View + Salvage + Tools + Dolltoggle + async Close + stale Sort)
  const h1 = mkNode('div', 'pack-id');
  const titleWrap = mkNode('div');
  const h2 = mkNode('h2');
  h2.append(mkNode('span', 'pack-who', 'Hero'));
  titleWrap.append(h2);
  const sortOld = mkNode('button', 'act sortbtn', 'Sort');
  const codexBtn = mkNode('button', 'act codexbtn', 'Codex');
  const salvageBtn = mkNode('button', 'act salvagebtn', 'Salvage');
  const dollBtn = mkNode('button', 'act dolltoggle', 'Body');
  h1.append(titleWrap, sortOld, codexBtn, salvageBtn, dollBtn);
  P2.head(h1, () => { });
  const closeBtn = mkNode('button', 'act', 'Close');
  h1.append(closeBtn);
  await Promise.resolve();

  assert.equal(h1.querySelectorAll('.sortbtn').length, 0, 'native manual sort button removed');
  assert.ok(salvageBtn.classList.contains('dfo-salvage-btn'), 'salvage button marked with dfo-salvage-btn');
  assert.ok(closeBtn.classList.contains('dfo-close-btn'), 'close button marked with dfo-close-btn');
  assert.ok(!dollBtn.classList.contains('dfo-close-btn'), 'dolltoggle stays out of close button styling');

  const flow1 = h1.children
    .filter((c) => c.classList.contains('dfo-pack-sep') || c.classList.contains('dfo-pack-cluster'))
    .map((c) => c.className);
  assert.deepEqual(flow1, [
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
  ]);
  assert.equal(h1.querySelector('.c-tools').children.length, 2);
  assert.equal(h1.querySelector('.c-tools').children[0].textContent, 'pack.sort.button');
  assert.ok(h1.querySelector('.c-tools').children[1].classList.contains('dfo-junk-split'));
  assert.deepEqual(h1.querySelector('.dfo-junk-split').children.map((b) => b.textContent), ['pack.junk.button', 'pack.find.button']);
  assert.deepEqual(h1.querySelector('.dfo-pack-view').children.map((b) => b.textContent), ['pack.view.rows', 'pack.charcol.v2']);
  assert.deepEqual(h1.querySelector('.c-close').children, [closeBtn]);

  // Case 2: Absent Codex and Salvage still produces single non-doubled dividers
  const h2Partial = mkNode('div', 'pack-id');
  const tw2 = mkNode('div'); tw2.append(mkNode('h2'));
  h2Partial.append(tw2);
  P2.head(h2Partial, () => { });
  h2Partial.append(mkNode('button', 'act', 'Close'));
  await Promise.resolve();

  const flow2 = h2Partial.children
    .filter((c) => c.classList.contains('dfo-pack-sep') || c.classList.contains('dfo-pack-cluster'))
    .map((c) => c.className);
  assert.deepEqual(flow2, [
    'dfo-pack-sep is-edge-left',
    'dfo-pack-cluster c-view',
    'dfo-pack-sep',
    'dfo-pack-cluster c-tools',
    'dfo-pack-sep gap-close',
    'dfo-pack-cluster c-close',
    'dfo-pack-sep is-edge-right',
  ]);
});

test('Charcol V2 bundle: activeSets, structured computeEquippedGearBonuses, capped gold rows, and 3D slot shadows', () => {
  const vm2 = require('node:vm');
  const win = {
    document: {
      documentElement: { dataset: {}, style: { setProperty: () => { } } },
      head: { append: () => { } },
      getElementById: () => null,
      querySelectorAll: () => [],
      createElement: (tag) => ({ tagName: tag.toUpperCase(), className: '', style: { setProperty: () => { } }, dataset: {}, children: [], append(...n) { this.children.push(...n); }, setAttribute() { }, addEventListener() { }, removeAttribute() { } }),
      createElementNS: (_ns, tag) => ({ tagName: tag.toUpperCase(), attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = String(v); }, append(...n) { this.children.push(...n); } }),
      addEventListener: () => { },
    },
    addEventListener: () => { },
  };
  win.globalThis = win;
  win.window = win;
  for (const f of ['dfo_pack_data.js', 'dfo_pack_rules.js', 'dfo_pack.js']) {
    vm2.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/mod/page', f), 'utf8'), win);
  }

  assert.ok(win.__dfoCharcolV2, '__dfoCharcolV2 initialized inside dfo_pack.js');
  assert.ok(win.SetRelicsData?.SET_RELICS?.length >= 15, 'all 15 set relics registered including defender');
  assert.ok(win.SetRelicsEngine?.createSetTooltipElement, 'SetRelicsEngine attached');

  // Verify 3D slot shadows and wax seal SVG builders
  for (const fam of ['head', 'cloaks', 'rarm', 'larm', 'shirt', 'rhand', 'lhand', 'chestarmor', 'amulet0', 'bracer0', 'bracelet0', 'ring0', 'lantern', 'hands', 'legarmor', 'pants', 'feet', 'mark0', 'crystal0', 'mount', 'cart']) {
    const svg = win.__dfoCharcolV2.buildV2SlotShadowSvg(fam);
    assert.ok(svg && svg.children.length > 0, `3D slot shadow SVG built for ${fam}`);
  }
  const sealSvg = win.__dfoCharcolV2.makeWaxSealSvg(54, 'test');
  assert.ok(sealSvg && (sealSvg.children.length > 0 || (sealSvg.innerHTML && sealSvg.innerHTML.includes('<path'))), 'Red Wax Seal SVG built');

  // Verify real-game structured item affixes, sockets, sigils, classic enchantments, heirlooms, powers, and set tiers
  const entity = {
    level: 20,
    stats: { strength: 90, agility: 80 }, // base stats must NOT leak into equipment bonus totals
    items: [
      {
        name: 'numidium Cuirass',
        group: 'Armor',
        equipSlot: 18,
        isIdentified: true,
        sigil: { set: 'numidium', xp: 37500 }, // Ascendant (stage 4) -> +10 magic resist, +10 shock resist
        affixes: [
          { id: 'stat', param: 'strength', value: 15 },
          { id: 'resist', param: 'fire', value: 30 },
          { id: 'resist', param: 'shock', value: 35 }, // + 10 setOwn = 45% -> capped at 45% rolled headroom!
          { id: 'thorns', value: 6 },
          { id: 'dry', value: 50 },
          { id: 'skill', param: 29, value: 30 }, // Long Blade +30 (NOT capped at fake 15!)
        ],
        enchantments: [{ type: 3, param: 0 }, { type: 7, param: 0 }, { type: 12, param: -1 }],
      },
      {
        name: 'numidium Helm',
        group: 'Armor',
        equipSlot: 12,
        isIdentified: true,
        heirloom: { gen: 3, line: 'H', house: 'H', of: 1, from: 'A' }, // +6 armor
        sigil: { set: 'numidium', xp: 37500 },
        affixes: [
          { id: 'stat', param: 'strength', value: 15 },
          { id: 'resist', param: 'fire', value: 25 }, // 30 + 25 = 55% rolled -> capped at 45%!
          { id: 'thorns', value: 6 }, // 6 + 6 = 12 -> capped at 10!
          { id: 'dry', value: 35 }, // 50 + 35 = 85% -> capped at 75%!
          { id: 'castSpeed', value: 15 },
          { id: 'potency', value: 20 },
          { id: 'weight', value: 20 },
          { id: 'technique', param: 'whirlwind', value: 12 },
        ],
        enchantments: [{ type: 7, param: 1 }, { type: 12, param: -1 }], // classic weight takes max(25,50)=50; armor hit mod max 5
      },
      {
        name: 'Ring of Storms',
        group: 'Jewellery',
        equipSlot: 4,
        rarity: 'rare',
        isIdentified: true,
        affixes: [
          { id: 'castSpeed', value: 20 }, // 15 + 20 = 35% -> capped at 30%!
          { id: 'potency', value: 15 }, // 20 + 15 = 35% -> capped at 30%!
          { id: 'focus', value: 20 },
          { id: 'wellspring', value: 7 },
          { id: 'standing', param: 'commoners', value: 6 },
          { id: 'technique', param: 'whirlwind', value: 8 }, // 12 + 8 = 20%
        ],
      },
      {
        name: 'Barenziah Amulet',
        group: 'Jewellery',
        equipSlot: 0,
        rarity: 'legendary',
        legendary: 'barenziah-silks', // +5 standing all groups -> commoners 6+5=11 (cap 10)
        isIdentified: true,
        affixes: [
          { id: 'focus', value: 15 }, // 20 + 15 = 35% affix -> capped at 30%!
          { id: 'wellspring', value: 7 }, // 7 + 7 = 14% -> capped at 10%!
        ],
      },
      {
        name: 'Dai-Katana of Dawn',
        group: 'Weapons',
        equipSlot: 19,
        rarity: 'rare',
        isIdentified: true,
        sigil: { set: 'mora', xp: 37500, power: 12 }, // Ascendant 100% -> 12% sigil damage (cap 12%)
        affixes: [
          { id: 'damage', value: 20 },
          { id: 'leech', value: 6 },
        ],
        sockets: ['perfect-diamond', 'perfect-emerald'], // diamond=+12% weapon damage, emerald=+7% leech -> leech 6+7=13->cap 10%
        enchantments: [{ type: 4, param: 0 }, { type: 1, param: 41 }], // PotentVs undead +5 flat, Held: Water Walking
      },
      {
        name: 'Mora Gloves',
        group: 'Armor',
        equipSlot: 20,
        isIdentified: true,
        sigil: { set: 'mora', xp: 37500 }, // 2pc mora awake -> +6 Int, +6 every magic school (22..27)
        affixes: [{ id: 'skill', param: 22, value: 10 }], // Destruction 10 + Mora 6 = 16
      },
      {
        name: 'Coilscale Greaves',
        group: 'Armor',
        equipSlot: 23,
        isIdentified: true,
        sigil: { set: 'coilscale', xp: 12500 }, // Bright (stage 2), 1pc dormant
        affixes: [{ id: 'warmth', value: 10 }],
      },
      {
        name: 'Unequipped Pack Ring',
        group: 'Jewellery',
        equipSlot: -1,
        isIdentified: true,
        affixes: [{ id: 'stat', param: 'luck', value: 15 }],
      },
    ],
  };

  const sets = win.__dfoPack.activeSets(entity);
  assert.equal(sets.length, 3, '3 worn sets detected (numidium 2/9, mora 2/9, coilscale 1/9 dormant)');
  const numSet = sets.find((s) => s.id === 'numidium');
  const moraSet = sets.find((s) => s.id === 'mora');
  const coilSet = sets.find((s) => s.id === 'coilscale');
  assert.equal(numSet?.stage, 4, 'numidium stage 4 (Ascendant)');
  assert.ok(numSet?.activeTier, 'numidium 2pc tier awake');
  assert.ok(moraSet?.activeTier, 'mora 2pc tier awake');
  assert.equal(coilSet?.activeTier, null, 'coilscale 1pc dormant');

  const bonusSummary = win.__dfoPack.computeEquippedGearBonuses(entity);
  const byKey = new Map(bonusSummary.entries.map((e) => [e.key, e]));
  assert.equal(byKey.get('attr.strength')?.effective, 30, 'Strength sums 15+15=30 without fake +15 gear cap');
  assert.equal(byKey.get('attr.strength')?.capped, false, 'Strength gear sum 30 is NOT marked capped');
  assert.equal(byKey.get('attr.luck'), undefined, 'Unequipped pack items excluded');
  assert.equal(byKey.get('skill.29')?.effective, 30, 'Long Blade +30 not falsely capped at 15');
  assert.equal(byKey.get('skill.29')?.capped, false, 'Skill gear sum is not falsely capped');
  assert.equal(byKey.get('skill.22')?.effective, 16, 'Destruction merges +10 affix with Mora [2] +6 all schools = 16');
  assert.equal(byKey.get('skill.23')?.effective, 6, 'Mora [2] populates magic school Restoration (+6)');
  assert.equal(byKey.get('res.fire')?.effective, 45, 'Fire resist 30+25=55% caps at real 45% affix limit');
  assert.equal(byKey.get('res.fire')?.capped, true, 'Fire resist >= 45% marked capped (gold)');
  assert.equal(byKey.get('res.shock')?.effective, 45, 'Shock resist combines Numidium [2] 10% + rolled 35% = 45%');
  assert.equal(byKey.get('res.shock')?.capped, true, 'Shock resist at 45% affix headroom marked capped');
  assert.equal(byKey.get('res.magic')?.effective, 10, 'Numidium [2] stage 4 grants +10 magic resist');
  assert.equal(byKey.get('res.magic')?.capped, false, 'Set-only 10% magic resist is not capped');
  assert.equal(byKey.get('mag.castSpeed')?.effective, 30, 'castSpeed 15+20=35% caps at real 30% limit');
  assert.equal(byKey.get('mag.castSpeed')?.ru, 'Скорость заклинаний', 'castSpeed named Скорость заклинаний (not Attack Speed)');
  assert.equal(byKey.get('mag.castSpeed')?.capped, true);
  assert.equal(byKey.get('mag.spellCostReduction')?.effective, 30, 'focus 20+15=35% caps at 30% affix limit without legendaries');
  assert.equal(byKey.get('mag.spellCostReduction')?.capped, true);
  assert.equal(byKey.get('mag.potency')?.effective, 30, 'potency 20+15=35% caps at 30% affix limit');
  assert.equal(byKey.get('mag.wellspring')?.effective, 10, 'wellspring 7+7=14% caps at 10% limit');
  assert.equal(byKey.get('off.leech')?.effective, 10, 'leech 6% affix + 7% emerald = 13% caps at 10% limit');
  assert.equal(byKey.get('def.thorns')?.effective, 10, 'thorns 6+6=12 caps at 10 limit');
  assert.equal(byKey.get('util.dry')?.effective, 75, 'weatherproof/dry 50+35=85% caps at 75% real engine limit');
  assert.equal(byKey.get('stand.commoners')?.effective, 10, 'standing commoners 6 + Royal Bearing 5 = 11 caps at 10');
  assert.equal(byKey.get('off.damage')?.effective, 32, 'weapon damage 20% affix + 12% perfect diamond = 32%');
  assert.equal(byKey.get('off.sigilDamage')?.effective, 12, 'sigil weapon damage 12% hits 12% real sigil cap');
  assert.equal(byKey.get('off.sigilDamage')?.capped, true);
  assert.equal(byKey.get('util.weight')?.effective, 70, 'carrying capacity takes max classic (50%) + structured affix (20%) = 70%');
  assert.equal(byKey.get('def.armor')?.effective, 6, 'heirloom gen=3 armor grants +6 armor');
  assert.equal(byKey.get('def.enemyHitMod')?.effective, 5, 'StrengthensArmor x2 stays capped at -5');
  assert.equal(byKey.get('off.potentFlat.undead')?.effective, 5, 'Classic PotentVs Undead adds +5 flat damage (not +15%)');
  assert.equal(byKey.get('tech.whirlwind')?.effective, 20, 'technique whirlwind sums 12+8=20%');
  assert.equal(byKey.get('tech.whirlwind')?.ru, 'Вихрь', 'technique whirlwind named Вихрь in RU');
  assert.equal(byKey.get('pool.magickaCond.0')?.effective, 75, 'Classic ExtraSpellPts winter adds +75 seasonal Magicka');
  assert.ok(bonusSummary.passives.some((p) => p.key === 'held.41' && p.ru.includes('Хождение по воде')), 'Classic CastWhenHeld 41 localized in passives');

  // Verify uncapped weapon/heirloom damage, dual-wield per-hand isolation, and offline/dormant sigil gating
  const dualAndUncappedSummary = win.__dfoPack.computeEquippedGearBonuses({
    items: [
      {
        name: 'High-Roll Claymore',
        group: 'Weapons',
        equipSlot: 19,
        isIdentified: true,
        heirloom: { gen: 5, line: 'H', house: 'H', of: 1, from: 'A' },
        affixes: [{ id: 'damage', value: 260 }],
      },
    ],
  });
  const uncappedMap = new Map(dualAndUncappedSummary.entries.map((e) => [e.key, e]));
  assert.equal(uncappedMap.get('off.damage')?.effective, 260, 'Weapon damage >240% is uncapped');
  assert.equal(uncappedMap.get('off.damage')?.capped, false, 'Weapon damage has no fake 240% cap');
  assert.equal(uncappedMap.get('off.heirloomDmg')?.effective, 25, 'Heirloom weapon damage at gen 5 is +25%');
  assert.equal(uncappedMap.get('off.heirloomDmg')?.capped, false, 'Heirloom weapon damage gen 5 (+25%) has no fake stat cap (not gold)');

  const dualSummary = win.__dfoPack.computeEquippedGearBonuses({
    items: [
      {
        name: 'Main Hand Blade',
        group: 'Weapons',
        equipSlot: 19,
        isIdentified: true,
        sigil: { power: 8, set: 'numidium', xp: 100000 },
        affixes: [
          { id: 'damage', value: 20 },
          { id: 'leech', value: 6 },
          { id: 'castSpeed', value: 15 },
        ],
      },
      {
        name: 'Off Hand Blade',
        group: 'Weapons',
        equipSlot: 21,
        isIdentified: true,
        sigil: { power: 8, set: 'numidium', xp: 100000 },
        affixes: [
          { id: 'damage', value: 25 },
          { id: 'leech', value: 6 },
          { id: 'castSpeed', value: 20 },
        ],
      },
    ],
  });
  const dualMap = new Map(dualSummary.entries.map((e) => [e.key, e]));
  assert.equal(dualMap.get('off.damage'), undefined, 'Dual-wield splits weapon damage into right/left hands');
  assert.equal(dualMap.get('off.damage.r')?.effective, 20, 'Dual-wield right-hand weapon damage isolated');
  assert.equal(dualMap.get('off.damage.l')?.effective, 25, 'Dual-wield left-hand weapon damage isolated');
  assert.equal(dualMap.get('off.leech.r')?.effective, 6, 'Dual-wield right-hand life leech isolated (not cross-hand summed)');
  assert.equal(dualMap.get('off.leech.r')?.capped, false, 'Right-hand 6% leech not falsely capped');
  assert.equal(dualMap.get('off.leech.l')?.effective, 6, 'Dual-wield left-hand life leech isolated');
  assert.equal(dualMap.get('off.sigilDamage.r')?.effective, 8, 'Dual-wield right-hand sigil weapon damage isolated');
  assert.equal(dualMap.get('off.sigilDamage.l')?.effective, 8, 'Dual-wield left-hand sigil weapon damage isolated');
  assert.equal(dualMap.get('mag.castSpeed')?.effective, 30, 'Global affix castSpeed still merges and caps across dual-wield weapons');
  assert.equal(dualMap.get('mag.castSpeed')?.capped, true);

  const offlineSigilSummary = win.__dfoPack.computeEquippedGearBonuses({
    __dfoSigilOnline: false,
    items: [
      {
        name: 'Offline Sigil Sword',
        group: 'Weapons',
        equipSlot: 19,
        isIdentified: true,
        sigil: { power: 10, set: 'numidium', xp: 100000 },
      },
    ],
  });
  const offlineMap = new Map(offlineSigilSummary.entries.map((e) => [e.key, e]));
  assert.equal(offlineMap.get('off.sigilDamage'), undefined, 'Offline sigil weapon contributes 0 sigil damage');

  // Verify gilded Retribution's Call (+8 fire), live variant=1 hood on Shade's Cowl, canonical RU skill names, and Ruhn [2] dual-wield merging
  const gildedAndHoodSummary = win.__dfoPack.computeEquippedGearBonuses({
    items: [
      {
        name: "Retribution's Call",
        group: 'Weapons',
        equipSlot: 19,
        rarity: 'gilded',
        gilded: 'retributions-call',
        isIdentified: true,
        affixes: [{ id: 'damage', value: 40 }, { id: 'skill', param: 4, value: 5 }],
      },
      {
        name: "The Shade's Cowl",
        group: 'MensClothing',
        equipSlot: 14,
        rarity: 'legendary',
        legendary: 'shades-cowl',
        variant: 1,
        isIdentified: true,
        affixes: [{ id: 'skill', param: 16, value: 25 }],
      },
    ],
  });
  const ghMap = new Map(gildedAndHoodSummary.entries.map((e) => [e.key, e]));
  assert.equal(ghMap.get('proc.fire')?.effective, 8, "Gilded Retribution's Call merges +8 fire damage into proc.fire");
  assert.equal(ghMap.get('skill.4')?.ru, 'Язык орков', 'Orcish skill uses canonical RU name Язык орков');
  assert.equal(ghMap.get('skill.16')?.effective, 50, "Shade's Cowl variant=1 adds +25 Stealth cleanly onto +25 affix = 50");
  assert.equal(gildedAndHoodSummary.passives.some((p) => /power\.(retributions-call|shades-cowl)/.test(p.key)), false, 'No duplicate passive rows when numeric bonus already merged');

  const dualRuhnSummary = win.__dfoPack.computeEquippedGearBonuses({
    items: [
      {
        name: 'Ruhn Blade R',
        group: 'Weapons',
        equipSlot: 19,
        isIdentified: true,
        sigil: { set: 'ruhn', xp: 37500 },
        affixes: [{ id: 'elemental', param: 'fire', value: 4 }],
      },
      {
        name: 'Off-hand Dagger L',
        group: 'Weapons',
        equipSlot: 21,
        isIdentified: true,
        affixes: [{ id: 'elemental', param: 'fire', value: 2 }],
      },
      {
        name: 'Ruhn Crown',
        group: 'Armor',
        equipSlot: 12,
        isIdentified: true,
        sigil: { set: 'ruhn', xp: 37500 },
      },
    ],
  });
  const dualRuhnMap = new Map(dualRuhnSummary.entries.map((e) => [e.key, e]));
  assert.equal(dualRuhnMap.get('proc.fire'), undefined, 'Ruhn [2] does not spawn a parallel proc.fire row when dual-wielding');
  assert.equal(dualRuhnMap.get('proc.fire.r')?.effective, 10, 'Ruhn [2] (+6) merges cleanly into right-hand proc.fire.r (4+6=10)');
  assert.equal(dualRuhnMap.get('proc.fire.l')?.effective, 8, 'Ruhn [2] (+6) merges cleanly into left-hand proc.fire.l (2+6=8)');

  // Verify classic named enchantments decode exact level-scaled formulas AND aggregate cleanly into top stats
  const classicLv1Summary = win.__dfoPack.computeEquippedGearBonuses({
    level: 1,
    stats: { personality: 65 },
    items: [
      {
        name: 'Amulet of Ward',
        group: 'Jewellery',
        equipSlot: 0,
        isIdentified: true,
        affixes: [{ id: 'resist', param: 'magic', value: 5 }, { id: 'stat', param: 'strength', value: 10 }],
        enchantments: [{ type: 1, param: 39 }, { type: 1, param: 82 }],
      },
      {
        name: 'Mirror Ring',
        group: 'Jewellery',
        equipSlot: 4,
        isIdentified: true,
        enchantments: [{ type: 1, param: 39 }], // duplicate Spell Resistance takes max (27%), does not double-stack
      },
      {
        name: 'Wizard Sabre',
        group: 'Weapons',
        equipSlot: 19,
        isIdentified: true,
        enchantments: [{ type: 2, param: 7 }], // On Strike: Wizard's Fire
      },
      {
        name: 'Clavicus Masque',
        group: 'Armor',
        equipSlot: 12,
        isIdentified: true,
        enchantments: [{ type: 26, param: 0 }], // Masque of Clavicus Vile -> floor(65/5) = +13
      },
    ],
  });
  const clv1Map = new Map(classicLv1Summary.entries.map((e) => [e.key, e]));
  const clv1Pass = new Map(classicLv1Summary.passives.map((p) => [p.key, p]));
  assert.equal(clv1Map.get('res.magic')?.effective, 32, 'Magic resist +5% affix + Held #39 (27% at Lv1) = +32% (non-stacking #39 repeats)');
  assert.equal(clv1Pass.get('held.39')?.badgeRu, '+27% (макс.)', 'Held #39 passive shows exact Lv1 +27% chance');
  assert.ok(clv1Pass.get('held.39')?.descRu.includes('уже учтено'), 'Held #39 explains it is already included above');
  assert.equal(clv1Map.get('attr.strength')?.minEffective, 13, 'Orc Strength Lv1 min (+3) + 10 affix = 13');
  assert.equal(clv1Map.get('attr.strength')?.maxEffective, 22, 'Orc Strength Lv1 max (+12) + 10 affix = 22');
  assert.equal(clv1Pass.get('held.82')?.badgeRu, '+3–12', 'Orc Strength Lv1 card explains exact +3–12 range');
  assert.equal(clv1Pass.get('strike.7')?.badgeRu, '2–19 огня', "On Strike Wizard's Fire Lv1 decodes 2–19 fire dmg");
  assert.equal(clv1Pass.get('art.0')?.badgeRu, '+13 к реакциям', 'Masque of Clavicus computes floor(65/5)=+13 live');

  const classicLv4Live = win.__dfoPack.computeEquippedGearBonuses({
    level: 4,
    activeEffects: [{ kind: 'fortifyAttribute', stat: 'strength', magnitude: 9, bundleType: 'HeldMagicItem', ended: false }],
    items: [
      {
        name: 'Pyro Plate',
        group: 'Armor',
        equipSlot: 18,
        isIdentified: true,
        affixes: [{ id: 'resist', param: 'fire', value: 30 }],
        enchantments: [{ type: 1, param: 12 }, { type: 1, param: 46 }, { type: 1, param: 47 }, { type: 1, param: 82 }],
      },
      {
        name: 'Troll & Absorb Ring',
        group: 'Jewellery',
        equipSlot: 4,
        isIdentified: true,
        enchantments: [{ type: 1, param: 24 }, { type: 5, param: 0 }, { type: 9, param: 0 }],
      },
      {
        name: "Reachman's Torc",
        group: 'Jewellery',
        equipSlot: 0,
        rarity: 'legendary',
        legendary: 'reachmans-torc',
        isIdentified: true,
      },
    ],
  });
  const clv4Map = new Map(classicLv4Live.entries.map((e) => [e.key, e]));
  const clv4Pass = new Map(classicLv4Live.passives.map((p) => [p.key, p]));
  assert.equal(clv4Map.get('res.fire')?.effective, 80, 'Resist Fire Lv4 (50%) + 30% affix = 80%');
  assert.equal(clv4Map.get('def.spellReflection')?.effective, 30, 'Spell Reflection Lv4 (10+20=30%) populates def.spellReflection');
  assert.equal(clv4Map.get('def.spellAbsorption')?.effective, 70.3, 'Spell Absorption combines Held #47 (30%) × type:9 (50%) × Torc (15%) = 70.3%');
  assert.equal(clv4Map.get('regen.round')?.effective, 5.25, "Troll's Blood Lv4 (5/min) + RegensHealth always (0.25/min) = 5.25/min");
  assert.equal(clv4Map.get('attr.strength')?.minEffective, 9, 'Live activeEffect magnitude (9) resolves exact Orc Strength roll');
  assert.equal(clv4Map.get('attr.strength')?.maxEffective, 9);
  assert.equal(clv4Pass.get('held.82')?.badgeRu, '+9 (выпало)', 'Orc Strength passive shows rolled +9 when active effect present');
  assert.equal(clv4Pass.get('power.reachmans-torc')?.badgeRu, '15% погл.', "Reachman's Torc keeps explanatory card noting aggregation");

  // Verify internal passive aggregation across duplicate worn enchants & thematic ordering
  const stackedPassivesEntity = {
    level: 4,
    items: [
      {
        name: 'Troll Ring I',
        group: 'Jewellery',
        equipSlot: 4,
        isIdentified: true,
        enchantments: [{ type: 1, param: 24 }, { type: 1, param: 82 }, { type: 1, param: 12 }, { type: 1, param: 39 }],
      },
      {
        name: 'Troll Ring II',
        group: 'Jewellery',
        equipSlot: 5,
        isIdentified: true,
        enchantments: [{ type: 1, param: 24 }, { type: 1, param: 82 }, { type: 1, param: 12 }, { type: 1, param: 39 }],
      },
      {
        name: 'Vampiric Fang',
        group: 'Weapons',
        equipSlot: 19,
        isIdentified: true,
        enchantments: [{ type: 2, param: 7 }, { type: 6, param: 1 }],
      },
    ],
  };
  const stackedPassivesSummary = win.__dfoPack.computeEquippedGearBonuses(stackedPassivesEntity);
  const stPassMap = new Map(stackedPassivesSummary.passives.map((p) => [p.key, p]));
  assert.equal(stPassMap.get('held.24')?.sources, 2, 'Duplicate Held Troll Blood collapses into 1 row');
  assert.equal(stPassMap.get('held.24')?.badgeRu, '+10 ОЗ/мин', 'Troll Blood badge aggregates internally (5 + 5 = +10 ОЗ/мин)');
  assert.equal(stPassMap.get('held.82')?.sources, 2, 'Duplicate Orc Strength collapses into 1 row');
  assert.equal(stPassMap.get('held.82')?.badgeRu, '+18–36', 'Orc Strength badge aggregates range internally (9–18 × 2 = +18–36)');
  assert.equal(stPassMap.get('held.12')?.badgeRu, '+100%', 'Resist Fire Lv4 × 2 aggregates internally to +100%');
  assert.equal(stPassMap.get('held.39')?.nonStack, true, 'Spell Resistance marks non-stacking repeats');
  assert.equal(stPassMap.get('classic.vamp.1')?.tone, 'strike', 'Vampiric on strike classifies under strike thematic group alongside Wizard Fire');
  const toneOrder = stackedPassivesSummary.passives.map((p) => p.tone);
  assert.ok(toneOrder.indexOf('held') < toneOrder.indexOf('strike'), 'Thematic order groups held effects before strike effects');

  // Verify applyCharcol guard and V1 preservation + live renown Asleep gating
  const syntheticWin = { querySelector: (sel) => (sel === '.charcol > .equipped' ? null : null) };
  win.__dfoCharcolV2.applyCharcol(syntheticWin, { entity }, null, { mode: 'v2', isRu: true });
  assert.equal(win.document.documentElement.dataset.dfoCharcol, undefined, 'applyCharcol is a no-op without .charcol > .equipped');

  const mkEl = (tag, cls = '', text = '') => {
    const clsSet = new Set(cls ? cls.split(/\s+/).filter(Boolean) : []);
    const attrs = new Map();
    const listeners = new Map();
    const node = {
      tagName: tag.toUpperCase(),
      children: [],
      dataset: {},
      style: { setProperty: () => { }, gridArea: '' },
      classList: {
        add: (...xs) => xs.forEach((x) => { if (x) clsSet.add(x); }),
        remove: (...xs) => xs.forEach((x) => { clsSet.delete(x); }),
        toggle: (x, f) => { const on = f === undefined ? !clsSet.has(x) : !!f; if (on) clsSet.add(x); else clsSet.delete(x); },
        contains: (x) => clsSet.has(x),
      },
      get className() { return [...clsSet].join(' '); },
      set className(v) {
        clsSet.clear();
        for (const c of String(v || '').split(/\s+/).filter(Boolean)) clsSet.add(c);
      },
      textContent: text,
      set innerHTML(_v) { node.children = []; },
      get innerHTML() { return ''; },
      append(...xs) { node.children.push(...xs.filter(Boolean)); },
      prepend(...xs) { node.children.unshift(...xs.filter(Boolean)); },
      replaceChildren(...xs) { node.children = [...xs.filter(Boolean)]; },
      remove() { },
      setAttribute(k, v) { attrs.set(k, String(v)); },
      getAttribute(k) { return attrs.get(k) ?? null; },
      removeAttribute(k) { attrs.delete(k); node[k] = ''; },
      addEventListener(k, fn) { if (!listeners.has(k)) listeners.set(k, []); listeners.get(k).push(fn); },
      querySelector(sel) { return node.querySelectorAll(sel)[0] || null; },
      querySelectorAll(sel) {
        const clean = sel.replace(/^:scope\s*>\s*/, '').split(',')[0].trim();
        const directOnly = /^:scope\s*>/.test(sel);
        const m = clean.match(/(?:button|div)?(?:\.([\w-]+))?(?:\[data-set\])?/);
        const wantCls = m?.[1] || '';
        const wantSet = clean.includes('[data-set]');
        const out = [];
        const walk = (list, recurse) => {
          for (const c of list) {
            if (!c || typeof c === 'string') continue;
            if ((!wantCls || (c.className || '').split(/\s+/).includes(wantCls) || c.classList?.contains(wantCls)) && (!wantSet || c.dataset?.set)) out.push(c);
            if (recurse && Array.isArray(c.children)) walk(c.children, true);
          }
        };
        walk(node.children, !directOnly);
        return out;
      },
    };
    return node;
  };

  const charV1 = mkEl('div', 'charcol');
  const eqV1 = mkEl('section', 'equipped');
  const sfV1 = mkEl('div', 'statflip');
  const sfInV1 = mkEl('div', 'statflip-inner');
  const sfFrV1 = mkEl('div', 'statflip-front');
  const sfBkV1 = mkEl('div', 'statflip-back');
  const sfScV1 = mkEl('div', 'statflip-scroll');
  const wmV1 = mkEl('div', 'wornmap plus5');
  const plV1 = mkEl('div', 'wornplaques');
  const acV1 = mkEl('div', 'wornac-total');
  acV1.append(mkEl('span', 'v', '12.5'));
  const tpV1 = mkEl('div', 'worntemp-total');
  tpV1.dataset.side = 'cold'; tpV1.dataset.level = 'warn';
  tpV1.title = 'Felt temperature -14°\nShelter +3°\nWet through -8°';
  tpV1.append(mkEl('span', 'v', '-14°'));
  plV1.append(acV1, tpV1);
  wmV1.append(plV1);
  sfFrV1.append(wmV1);
  sfBkV1.append(sfScV1);
  sfInV1.append(sfFrV1, sfBkV1);
  const fBtnV1 = mkEl('button', 'statflip-btn', 'Stats');
  sfV1.append(sfInV1, fBtnV1);
  eqV1.append(sfV1);
  const shelfV1 = mkEl('section', 'wornshelf');
  const stripV1 = mkEl('div', 'setstrip');
  const numLine = mkEl('button', 'setline');
  numLine.dataset.set = 'numidium';
  numLine.title = 'native browser tooltip to strip';
  const numName = mkEl('span', 'setline-name', 'Numidium');
  const numStage = mkEl('span', 'setline-stage', 'Asleep');
  numLine.append(numName, mkEl('span', 'setline-pips'), numStage);
  stripV1.append(numLine);
  charV1.append(eqV1, shelfV1, stripV1);
  const packWinV1 = mkEl('section', 'pack-win');
  packWinV1.append(charV1);

  win.__dfoCharcolV2.applyCharcol(packWinV1, { entity }, null, { mode: 'v1', isRu: true });
  assert.equal(win.document.documentElement.dataset.dfoCharcol, 'v1', 'applyCharcol mode=v1 activates data-dfo-charcol="v1"');
  assert.ok(charV1.classList.contains('is-v1') && !charV1.classList.contains('is-v2'), 'V1 class set without is-v2');
  assert.ok(charV1.children.includes(shelfV1), 'V1 preserves .wornshelf');
  assert.ok(charV1.children.includes(stripV1), 'V1 preserves .setstrip');
  assert.equal(numLine.getAttribute('title'), null, 'V1 strips native browser title from .setline to prevent double tooltip');
  assert.equal(numStage.textContent, 'Спит', 'V1 localizes renown-asleep state to RU Спит');
  const dormantSets = win.__dfoCharcolV2.activeSets(entity);
  assert.equal(dormantSets[0].stage, -1, 'live renown Asleep gate reflected in activeSets');
  assert.equal(dormantSets[0].activeTier, null, 'renown-asleep set marks activeTier null (dormant)');
  assert.equal(plV1.querySelectorAll('button.wornac-total').length, 1, 'V1 rebuilds interactive Armor Shield plaque button');
  assert.equal(plV1.querySelectorAll('button.worntemp-total').length, 1, 'V1 rebuilds interactive Temperature plaque button');

  // Verify Wax Seal hover tooltip vs click modal split + 100% numeric calculation parity
  win.document.body = mkEl('body');
  win.document.createElement = (tag) => {
    const node = mkEl(tag);
    node.remove = () => {
      const idx = win.document.body.children.indexOf(node);
      if (idx >= 0) win.document.body.children.splice(idx, 1);
    };
    return node;
  };
  const tipSpec = win.__dfoCharcolV2.buildGearSummaryTooltipSpec(stackedPassivesEntity);
  const tipBonusRow = tipSpec.rows.find((r) => r.kind === 'bonusSections');
  const tipClickRow = tipSpec.rows.find((r) => r.kind === 'clickHint');
  assert.ok(tipBonusRow, 'Hover tooltip keeps numeric bonus sections');
  assert.equal(tipBonusRow.sections.some((s) => s.passiveGroups || s.passiveItems), false, 'Hover tooltip omits passive/set groups block');
  assert.equal(tipClickRow?.title, 'Нажмите, чтобы получить полную информацию.', 'Hover tooltip displays prominent click CTA');
  const tipKeys = new Set(tipBonusRow.sections.flatMap((s) => (s.items || []).map((it) => it.key)));
  for (const e of stackedPassivesSummary.entries) {
    assert.ok(tipKeys.has(e.key), `Hover tooltip retains passive-contributed numeric entry ${e.key}`);
  }

  const passiveOnlySpec = win.__dfoCharcolV2.buildGearSummaryTooltipSpec({
    level: 4,
    items: [{ name: 'Strike Rod', group: 'Weapons', equipSlot: 19, isIdentified: true, enchantments: [{ type: 2, param: 7 }] }],
  });
  assert.ok(passiveOnlySpec.rows.some((r) => r.kind === 'clickHint'), 'Passive-only loadout still shows click CTA on hover');

  win.__dfoCharcolV2.openGearSummaryModal(stackedPassivesEntity);
  const modalEl = win.document.body.querySelector('.dfo-seal-modal');
  assert.ok(modalEl && modalEl.tagName === 'DIALOG', 'openGearSummaryModal appends <dialog class="... dfo-seal-modal">');
  assert.ok(modalEl.classList.contains('dfo-window-frame'), 'Seal modal uses UI-reference .dfo-window-frame');
  assert.notEqual(modalEl.getAttribute('open'), null, 'Seal modal opens cleanly via showModal/open attribute fallback');
  const modalRowVals = new Map(
    modalEl.querySelectorAll('.dfo-st-bonus-row').map((r) => [r.dataset.bonusKey, r.querySelector('.dfo-st-bonus-v')?.textContent])
  );
  const tipRowVals = new Map(
    tipBonusRow.sections.flatMap((s) => s.items || []).map((it) => [it.key, it.valueText])
  );
  assert.equal(modalRowVals.size, tipRowVals.size, 'Modal and tooltip render identical count of numeric stat rows');
  for (const [k, v] of tipRowVals) {
    assert.equal(modalRowVals.get(k), v, `Exact parity between tooltip and modal for ${k} (${v})`);
  }
  const modalGroups = modalEl.querySelectorAll('.dfo-st-passive-group').map((g) => g.dataset.passiveGroup);
  assert.deepEqual(modalGroups, ['held', 'strike'], 'Modal renders grouped thematic passive sections');
  const modalCloseBtn = modalEl.querySelector('.dfo-ornate-btn');
  assert.ok(modalCloseBtn && modalCloseBtn.classList.contains('primary'), 'Modal footer renders primary .dfo-ornate-btn Close button');
  modalCloseBtn.onclick({ stopPropagation() { } });
  assert.equal(win.document.body.querySelectorAll('.dfo-seal-modal').length, 0, 'Clicking primary Close button closes and removes Seal modal');

  // Verify cleanupCharcolTooltips closes an active Seal modal
  win.__dfoCharcolV2.openGearSummaryModal(entity);
  assert.equal(win.document.body.querySelectorAll('.dfo-seal-modal').length, 1);
  win.__dfoCharcolV2.cleanupCharcolTooltips();
  assert.equal(win.document.body.querySelectorAll('.dfo-seal-modal').length, 0, 'cleanupCharcolTooltips closes open Seal modal');

  // Verify computeEquippedGearBonuses memoization and in-place mutation invalidation
  const memoHit1 = win.__dfoCharcolV2.computeEquippedGearBonuses(stackedPassivesEntity);
  const memoHit2 = win.__dfoCharcolV2.computeEquippedGearBonuses(stackedPassivesEntity);
  assert.equal(memoHit1, memoHit2, 'computeEquippedGearBonuses returns memoized summary when entity gear is unchanged');
  stackedPassivesEntity.items[0].affixes = ['+10% Fire Resistance'];
  const memoAfterMut = win.__dfoCharcolV2.computeEquippedGearBonuses(stackedPassivesEntity);
  assert.notEqual(memoAfterMut, memoHit1, 'computeEquippedGearBonuses invalidates cache when item affixes mutate in place');
  const fireAfterMut = memoAfterMut.entries.find((e) => e.key === 'res.fire');
  assert.equal(fireAfterMut?.raw, 110, 'Invalidated gear summary reflects newly added +10% Fire Resistance');

  // Verify embedded SetRelicsEngine RAF loop is demand-driven (idle when no set relics are mounted)
  const testRelicRt = win.SetRelicsEngine.createEmbeddedRuntime();
  assert.equal(testRelicRt.getRecordCount(), 0);
  assert.equal(testRelicRt.isLoopRunning(), false, 'SetRelicsEngine embedded runtime does not spin RAF loop when 0 relics are mounted');

  // Verify Rules.isJunk fast-path skips lootRules.tagsOf when only default junk tags are configured
  let tagsOfCalls = 0;
  const defaultJunkCfg = { enabled: true, items: ['broken_twig'], tags: ['use:sale', 'state:junk'] };
  const fakeLootRules = {
    variantKey(it) {
      return it.id;
    },
    tagsOf() {
      tagsOfCalls += 1;
      return ['custom:tag'];
    },
  };
  assert.equal(win.__dfoPackRules.isJunk({ id: 'gem_1', junk: true }, defaultJunkCfg, {}, fakeLootRules), true);
  assert.equal(win.__dfoPackRules.isJunk({ id: 'sword_1', group: 'Weapons' }, defaultJunkCfg, {}, fakeLootRules), false);
  assert.equal(tagsOfCalls, 0, 'Rules.isJunk fast-path avoids calling lootRules.tagsOf when no custom tags are present');
});

test('locked items never move into any container (drag, manual single move, or Stash all) in enhanced and classic inventory', () => {
  const vm2 = require('node:vm');
  const { packLockGuards, nativeLock, transformInventory: tx } = require('../src/mod/inventory-transform.cjs');

  // 1. Enhanced inventory runtime behavior across wagon, storage, container, bag, reward, and ground
  const fakeEnhanced = `
    let F = null, R = { kind: 'wagon', items: [] }, L = { usingWagon: true, chooseOne: null }, M = { tabs: [] }, fs = 'weapons';
    let wt = (e, a) => e?.locked === true && a === 'drop', Xs = () => null, jt = () => false, Zs = () => false;
    let Pt = () => false, Nt = () => 'packOnly', qt = () => 'bound', zt = () => 'loc', tr = (n) => n + ' locked', w = (e) => e.name;
    let Ke = () => R.items, Pe = () => null, fi = () => true, ut = () => 750, ve = () => null, je = () => null, Je = () => null;
    let bo = () => false, vo = () => 'full', _o = 50, Be = () => false, Bc = () => {}, $ = () => {}, G = () => {}, N = null, j = { items: () => localList, loot: null, entity: {} };
    let yt = { playOneShot() {} }, gt = { GoldPieces: 1, ButtonClick: 2 };
    let moved = [];
    let xi = (e) => ({ ok: true, amount: e.stackCount ?? 1, sound: 'click' });
    let bi = () => ({ ok: false, refusal: {} });
    let Jc = (_e, a) => a, Zc = (_op, _e, _r, cb) => cb(), yi = (e, _p, src, dst) => { moved.push(e); src.splice(src.indexOf(e), 1); dst.push(e); return e; };
    let xo = (_e, t) => (t.ok ? 'move' : 'skip');
    let So = (arr, pred, act) => { let c = 0, firstRef = null; for (const it of arr) { const r = pred(it); if (r.verdict === 'skip') { firstRef ??= r.refusal?.text ?? null; continue; } act(it, r); c++; } return { moved: c, notice: c ? null : firstRef }; };
    let ia = (x) => x, tl = () => ({}), uu = (x) => x.name;
    const es = { wagon: 'Stow in wagon', reward: 'Stow', container: 'Put back', storage: 'Store', ground: 'Drop', bag: 'Put in bag' };
    function Qs(e){if(R?.kind===\`ground\`&&wt(e,\`drop\`)||Xs(e)||R&&jt(e,R.kind)||R&&Zs(e))return{kind:\`stow\`,label:null,speaks:!0};let t=xi(e,{});return t.ok?{kind:\`stow\`,label:es[R.kind]}:{kind:\`nope\`,label:null}}
    function Qc(e){if(F=null,R?.kind===\`ground\`&&wt(e,\`drop\`))return F=tr(w(e,{getQuest:j.getQuest??null})),$();if(R&&Pt(e))return F=Nt(w(e,{getQuest:j.getQuest??null})),$();let t=Ke(j,null),n=xi(e,{});Zc(\`put\`,e,n.amount,()=>yi(e,n,j.items(),t,{}))}
    function nl(t){F=null;let n=t===\`take\`,r=n?ia(R.items,tl(),uu):M.tabs.find(e=>e.tab===fs)?.items??[],i=n?Ke(j,null):j.items?.()??[],a=n?j.items?.()??[]:Ke(j,null),o=null,s=null,c=null,l=[],{moved:u,notice:d}=So([...r],e=>{if(!i.includes(e))return{verdict:\`skip\`};if(!n){if(Pt(e))return{verdict:\`skip\`,refusal:{text:Nt(w(e,{getQuest:j.getQuest??null}))}};if(R.kind===\`ground\`&&wt(e,\`drop\`))return{verdict:\`skip\`,refusal:{text:tr(w(e,{getQuest:j.getQuest??null}))}}}let p=n?bi(e):xi(e);return{verdict:xo(e,p),refusal:p.refusal,plan:p}},(e,t)=>yi(e,t.plan,i,a,{}));if(d)F=d;}
  `;
  const guardedEnhanced = packLockGuards(fakeEnhanced);
  const lockedSword = { name: 'Locked Sword', locked: true, stackCount: 1 };
  const freeSword = { name: 'Free Sword', locked: false, stackCount: 1 };
  const eCtx = { localList: [lockedSword, freeSword] };
  vm2.runInNewContext(`${guardedEnhanced}; this.__api = { Qs, Qc, nl, setRemote: (k) => { R = { kind: k, items: [] }; }, setTab: (arr) => { M = { tabs: [{ tab: 'weapons', items: arr }] }; }, state: () => ({ F, moved, remote: R.items }), resetMoved: () => { moved.length = 0; } };`, eCtx);

  for (const kind of ['wagon', 'storage', 'container', 'bag', 'reward', 'ground']) {
    eCtx.__api.setRemote(kind);
    eCtx.localList = [lockedSword, freeSword];
    eCtx.__api.setTab(eCtx.localList);
    eCtx.__api.resetMoved();

    assert.deepEqual({ ...eCtx.__api.Qs(lockedSword) }, { kind: 'stow', label: null, speaks: true }, `${kind}: drag refuses locked item`);
    assert.equal(eCtx.__api.Qs(freeSword).kind, 'stow');
    assert.ok(eCtx.__api.Qs(freeSword).label, `${kind}: drag allows unlocked item`);

    eCtx.__api.Qc(lockedSword);
    assert.equal(eCtx.__api.state().F, 'Locked Sword locked', `${kind}: single transfer refuses locked item`);
    assert.equal(eCtx.__api.state().moved.length, 0, `${kind}: locked item stays out of remote`);
    assert.ok(eCtx.localList.includes(lockedSword));

    if (['wagon', 'storage', 'container', 'bag'].includes(kind)) {
      eCtx.__api.nl('stash');
      assert.deepEqual([...eCtx.__api.state().moved], [freeSword], `${kind}: Stash all moves only unlocked items`);
      assert.deepEqual([...eCtx.localList], [lockedSword], `${kind}: locked item stays in inventory after Stash all`);

      // When only locked items remain, Stash all leaves them and shows the refusal notice
      eCtx.__api.setTab(eCtx.localList);
      eCtx.__api.resetMoved();
      eCtx.__api.nl('stash');
      assert.equal(eCtx.__api.state().moved.length, 0);
      assert.equal(eCtx.__api.state().F, 'Locked Sword locked', `${kind}: Stash all explains why locked item was skipped`);
    }
  }

  // 2. Classic nativeInventory runtime behavior across Wagon, Loot, Bag, Dropped
  const fakeNative = `
    const x = { Dropped: 0, Wagon: 1, Loot: 2, Merchant: 3, Bag: 4 };
    let S = (h) => h.kind, ke = (r, a) => r?.locked === true && a === 'drop', Ze = (n) => n + ' locked', k = (r) => r.name;
    let moved = [];
    const cls = {
      hooks: { kind: x.Wagon, items: () => localList, getQuest: null },
      usingWagon: true, chooseOne: null, scroll: 0, mode: 'remove', refused: null,
      _filtered() { return this.hooks.items(); },
      _remote() { return remoteList; },
      _refuse(e) { this.refused = e.text; },
      _pick(i){let r=this._filtered()[i];if(r){let e=this._remote();if(ke(r,\`drop\`)&&S(this.hooks,{usingWagon:this.usingWagon,chooseOne:this.chooseOne})===x.Dropped){this._refuse({text:Ze(k(r,{getQuest:this.hooks.getQuest??null}))});return}moved.push(r)}}
    };
  `;
  const guardedNative = nativeLock(fakeNative);
  const nCtx = { localList: [lockedSword, freeSword], remoteList: [] };
  vm2.runInNewContext(`${guardedNative}; this.__api = { cls, x, moved };`, nCtx);
  for (const k of [nCtx.__api.x.Dropped, nCtx.__api.x.Wagon, nCtx.__api.x.Loot, nCtx.__api.x.Bag]) {
    nCtx.__api.cls.hooks.kind = k;
    nCtx.__api.cls.refused = null;
    nCtx.__api.cls._pick(0);
    assert.equal(nCtx.__api.cls.refused, 'Locked Sword locked', `native kind=${k}: refuses locked item`);
    assert.equal(nCtx.__api.moved.length, 0, `native kind=${k}: locked item never moved`);
  }
  nCtx.__api.cls.hooks.kind = nCtx.__api.x.Wagon;
  nCtx.__api.cls.refused = null;
  nCtx.__api.cls._pick(1);
  assert.equal(nCtx.__api.cls.refused, null);
  assert.deepEqual([...nCtx.__api.moved], [freeSword], 'native: unlocked item transfers normally');

  // 3. Published build bundles check when DFO_BUILD_DIR is present
  if (process.env.DFO_BUILD_DIR) {
    const assets = path.join(process.env.DFO_BUILD_DIR, 'assets');
    const eiFile = fs.readdirSync(assets).find((f) => /^enhancedInventory-/.test(f) && fs.readFileSync(path.join(assets, f), 'utf8').includes('`packPhoneDoll`'));
    const niFile = fs.readdirSync(assets).find((f) => /^nativeInventory-/.test(f));
    const eiOut = tx('assets/' + eiFile, fs.readFileSync(path.join(assets, eiFile), 'utf8'), []);
    const niOut = tx('assets/' + niFile, fs.readFileSync(path.join(assets, niFile), 'utf8'), []);
    assert.doesNotMatch(eiOut, /kind===`ground`&&[\w$]+\([\w$]+,`drop`\)/, 'enhancedInventory has no remaining ground-only lock guard');
    assert.doesNotMatch(niOut, /ke\([^)]+,`drop`\)[&\w$.{},:=()]*?\.Dropped/, 'nativeInventory has no remaining Dropped-only lock guard');
    assert.doesNotMatch(niOut, /&&[\w$]+\(this\.hooks,\{usingWagon:this\.usingWagon,chooseOne:this\.chooseOne\}\)===[\w$]+\.Dropped/, 'nativeInventory removed Dropped gate on lock check');
  }
});

test('Find mode splits Junk button, replaces category tabs with omnibox, shows unified pack and searches rendered tooltip cards (EN & RU)', () => {
  const vm2 = require('node:vm');
  const dfoPackSrc = fs.readFileSync(path.join(__dirname, '../src/mod/page/dfo_pack.js'), 'utf8');

  const mkEl = (tag) => {
    const ch = [];
    const attrs = new Map();
    const clsSet = new Set();
    const el = {
      tagName: tag.toUpperCase(),
      nodeType: tag === '#text' ? 3 : 1,
      dataset: {},
      style: { setProperty() { }, removeProperty() { } },
      children: ch,
      get childNodes() { return ch; },
      get firstElementChild() { return ch.find((c) => c.nodeType === 1) ?? null; },
      parentNode: null,
      parentElement: null,
      _text: '',
      value: '',
      hidden: false,
      isConnected: true,
      get className() { return [...clsSet].join(' '); },
      set className(v) { clsSet.clear(); String(v || '').split(/\s+/).filter(Boolean).forEach((c) => clsSet.add(c)); },
      get textContent() { return ch.length ? `${this._text}${ch.map((c) => c.textContent ?? c.nodeValue ?? '').join('')}` : this._text; },
      set textContent(v) { ch.length = 0; this._text = String(v ?? ''); },
      classList: {
        add: (...xs) => xs.forEach((x) => clsSet.add(x)),
        remove: (...xs) => xs.forEach((x) => clsSet.delete(x)),
        contains: (x) => clsSet.has(x),
        toggle: (x, f) => { const on = f === undefined ? !clsSet.has(x) : !!f; on ? clsSet.add(x) : clsSet.delete(x); return on; },
      },
      setAttribute(k, v) { if (k === 'class') el.className = v; else attrs.set(k, String(v)); },
      getAttribute(k) { return k === 'class' ? el.className : (attrs.get(k) ?? null); },
      removeAttribute(k) { attrs.delete(k); },
      appendChild(c) {
        if (!c) return c;
        if (c.parentNode?.children) {
          const i = c.parentNode.children.indexOf(c);
          if (i >= 0) c.parentNode.children.splice(i, 1);
        }
        ch.push(c); c.parentNode = el; c.parentElement = el; return c;
      },
      append(...ns) {
        for (const n of ns) {
          if (n == null) continue;
          el.appendChild(typeof n === 'string' ? { nodeType: 3, nodeValue: n, textContent: n } : n);
        }
      },
      replaceChildren(...ns) { ch.length = 0; el.append(...ns); },
      remove() {
        const p = el.parentNode;
        if (!p || !p.children) return;
        const i = p.children.indexOf(el);
        if (i >= 0) p.children.splice(i, 1);
        el.parentNode = null; el.parentElement = null;
      },
      closest: () => null,
      focus() { },
      querySelector(sel) { return el.querySelectorAll(sel)[0] ?? null; },
      querySelectorAll(sel) {
        const clean = String(sel).replace(/^:scope\s*>\s*/, '');
        const want = clean.replace(/^\./, '');
        const out = [];
        for (const c of ch) {
          if (c.nodeType !== 1) continue;
          if (clean.startsWith('.') ? c.classList?.contains(want) : c.tagName.toLowerCase() === want) out.push(c);
          out.push(...c.querySelectorAll(sel));
        }
        return out;
      },
      matches(sel) {
        if (sel === 'button.act') return el.tagName === 'BUTTON' && clsSet.has('act');
        if (String(sel).startsWith('.')) return clsSet.has(String(sel).slice(1));
        return false;
      },
      addEventListener() { },
    };
    return el;
  };
  const mkNode = (tag, cls, text) => {
    const el = mkEl(tag);
    if (cls) cls.split(/\s+/).filter(Boolean).forEach((c) => el.classList.add(c));
    if (text != null) el.textContent = text;
    return el;
  };

  let lang = 'en';
  const win = {
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
    __DFO_MOD_CFG__: { ru: { on: false } },
    __dfoUi: { t: (k, p) => (p ? `${k}:${JSON.stringify(p)}` : k), has: () => true },
    __dfoStorePageOf: (it) => (it.group === 'PlantIngredients' ? 'ingredients' : 'weapons'),
    __dfoPackRules: R,
    addEventListener() { },
    localStorage: { getItem: () => null, setItem: () => { } },
    Map, Set, WeakMap, WeakSet, Array, Object, Number, String, Boolean, Math, JSON, Intl, Promise, Error, RegExp, Date, console,
    document: {
      documentElement: { dataset: {}, lang: 'en', clientWidth: 1920, clientHeight: 1080 },
      head: { append() { } },
      body: { append() { } },
      getElementById: () => null,
      createElement: (tag) => mkEl(tag),
      createElementNS: (_ns, tag) => mkEl(tag),
      createTextNode: (t) => ({ nodeType: 3, nodeValue: String(t), textContent: String(t) }),
      addEventListener() { },
    },
  };
  win.globalThis = win;
  win.window = win;
  vm2.runInNewContext(dfoPackSrc, win);
  const P = win.__dfoPack;

  // Secret hidden raw property (`affixes: ['secretFire']`, `shortName: 'HiddenRawOnly'`) must NOT match on an unidentified card
  const sword = { uid: 'w1', group: 'Weapons', templateIndex: 118, shortName: 'HiddenRawOnly', affixes: ['secretFire'], isIdentified: false, rarity: 'rare', locked: true };
  const bow = { uid: 'w2', group: 'Weapons', templateIndex: 129, shortName: 'Elven Longbow', rarity: 'magic', locked: false };
  const flower1 = { uid: 'i1', group: 'PlantIngredients', templateIndex: 10, shortName: 'Red Flowers', stackCount: 1, locked: false };
  const flower2 = { uid: 'i2', group: 'PlantIngredients', templateIndex: 10, shortName: 'Red Flowers', stackCount: 1, locked: false };

  function buildFakeCard(it) {
    const card = mkNode('div', 'card dfo-item-card');
    if (it === sword) {
      if (lang === 'en') {
        card.append(mkNode('div', 'dfo-item-tier', 'Unidentified'), mkNode('h3', null, 'Iron Broadsword'));
        const mat = mkNode('div', 'dfo-item-material');
        mat.append(mkNode('span', 'dfo-item-material-label', 'Material'), mkNode('span', 'dfo-item-metal', 'Iron'));
        const dl = mkNode('dl', 'stats dfo-item-stats');
        const p1 = mkNode('div', 'pair'); p1.append(mkNode('dt', null, 'Slot'), mkNode('dd', null, 'Either hand'));
        const p2 = mkNode('div', 'pair'); p2.append(mkNode('dt', null, 'Skill'), mkNode('dd', null, 'Long Blade'));
        dl.append(p1, p2);
        const tech = mkNode('section', 'techbox');
        const roll = mkNode('span', 'tech-roll', '+18%');
        roll.append(mkNode('span', 'tech-band', ' [12-24]'));
        roll.setAttribute('title', 'Rolled in 12-24');
        tech.append(roll, mkNode('span', 'tech-name', 'Lunge'));
        const row = mkNode('li', null, '+5 Endurance');
        row.setAttribute('aria-label', 'When Held: +5 Endurance');
        const wells = mkNode('div', 'sock-wells');
        const well = mkNode('span', 'sock-well');
        well.setAttribute('title', 'Ruby socket: +4% Fire');
        wells.append(well);
        card.append(mat, dl, mkNode('p', 'lockline', 'Locked'), tech, row, wells);
      } else {
        card.append(mkNode('div', 'dfo-item-tier', 'Не опознано'), mkNode('h3', null, 'Железный палаш'));
        const mat = mkNode('div', 'dfo-item-material');
        mat.append(mkNode('span', 'dfo-item-material-label', 'Материал'), mkNode('span', 'dfo-item-metal', 'Железо'));
        const dl = mkNode('dl', 'stats dfo-item-stats');
        const p1 = mkNode('div', 'pair'); p1.append(mkNode('dt', null, 'Слот'), mkNode('dd', null, 'Любая рука'));
        dl.append(p1);
        const row = mkNode('li', null, '+5 к Выносливости');
        row.setAttribute('aria-label', 'При ношении: +5 к Выносливости');
        const tech = mkNode('section', 'techbox');
        tech.append(mkNode('span', 'tech-band', '[12-24]'));
        card.append(mat, dl, mkNode('p', 'lockline', 'Тёмный замок · Заперто'), row, tech);
      }
      return card;
    }
    if (it === bow) {
      card.append(
        mkNode('div', 'dfo-item-tier', lang === 'en' ? 'Magic' : 'Магический'),
        mkNode('h3', null, lang === 'en' ? 'Elven Longbow' : 'Эльфийский длинный лук')
      );
      return card;
    }
    card.append(mkNode('h3', null, lang === 'en' ? 'Red Flowers' : 'Красные цветы'));
    return card;
  }

  const hdr = mkNode('div', 'pack-id');
  const tw = mkNode('div'); tw.append(mkNode('h2')); hdr.append(tw);
  const deps = { items: () => [bow, flower1, flower2, sword] };
  let repaintCalls = 0;
  const repaint = () => { repaintCalls++; };
  const findCtx = {
    cardOf: (it) => buildFakeCard(it),
    sortFlat: (arr) => arr.slice().sort((a, b) => (b.locked === true) - (a.locked === true)),
  };

  P.head(hdr, repaint, deps, findCtx);
  const split = hdr.querySelector('.c-tools').children[1];
  const findBtn = split.children[1];
  assert.equal(findBtn.textContent, 'pack.find.button');
  assert.equal(P.isFindOpen(), false);

  // Category tabs stand untouched while Find is off
  const model = {
    tabs: [
      { tab: 'weapons', label: 'Weapons', items: [bow, sword] },
      { tab: 'ingredients', label: 'Ingredients', items: [flower1, flower2] },
    ],
  };
  const shelfNormal = mkNode('section', 'packcol packcats');
  shelfNormal.append(mkNode('div', 'packtabs'));
  P.shelf(shelfNormal, null, () => { });
  assert.ok(shelfNormal.querySelector('.packtabs'), 'category tabs remain when Find is off');

  // Toggle Find ON
  findBtn.onclick({ stopPropagation() { } });
  assert.equal(P.isFindOpen(), true);
  assert.equal(repaintCalls, 1);
  assert.equal(win.document.documentElement.dataset.dfoPackFind, '1');

  const shelfFind = mkNode('section', 'packcol packcats');
  shelfFind.append(mkNode('div', 'packtabs'));
  let redraws = 0;
  P.shelf(shelfFind, null, () => { redraws++; });
  assert.equal(shelfFind.querySelector('.packtabs'), null, 'category tabs disappear in Find mode');
  const bar = shelfFind.children.find((c) => c.classList?.contains('dfo-find-bar'));
  assert.ok(bar, 'omnibox renders inside .packcats');

  // All items across categories appear in one container, with locked item sorted first
  const uids = (xs) => Array.from(xs, (x) => x.uid);
  const allShown = P.list([bow], 'weapons', model, deps);
  assert.deepEqual(uids(allShown), ['w1', 'w2', 'i1'], 'all categories merged (with stackable cell collapsed) and locked sword first');

  // EN card search tests: case-insensitive, technical markup (labels, brackets, aria-label, title), and NO leaking raw hidden item JSON
  P.setFindQuery('hiddenrawonly');
  assert.deepEqual(uids(P.list([bow], 'weapons', model, deps)), [], 'raw hidden item.shortName must never match');
  P.setFindQuery('secretfire');
  assert.deepEqual(uids(P.list([bow], 'weapons', model, deps)), [], 'unidentified raw affixes must never leak when hidden on card');

  P.setFindQuery('UNIDENTIFIED');
  assert.deepEqual(uids(P.list([bow], 'weapons', model, deps)), ['w1']);
  P.setFindQuery('material: iron');
  assert.deepEqual(uids(P.list([bow], 'weapons', model, deps)), ['w1']);
  P.setFindQuery('[12-24]');
  assert.deepEqual(uids(P.list([bow], 'weapons', model, deps)), ['w1']);
  P.setFindQuery('when held');
  assert.deepEqual(uids(P.list([bow], 'weapons', model, deps)), ['w1']);
  P.setFindQuery('ruby socket');
  assert.deepEqual(uids(P.list([bow], 'weapons', model, deps)), ['w1']);
  P.setFindQuery('elven');
  assert.deepEqual(uids(P.list([bow], 'weapons', model, deps)), ['w2']);
  assert.deepEqual(uids(P.stashList([bow], 'weapons', model, deps)), ['w2'], 'stashList uses Find query across unified container');

  // RU card search tests: parses Russian card DOM & technical markup accurately (including ё/е normalization)
  lang = 'ru';
  win.__DFO_MOD_CFG__.ru.on = true;
  win.document.documentElement.lang = 'ru';
  P.setFindQuery('материал: железо');
  assert.deepEqual(uids(P.list([bow], 'weapons', model, deps)), ['w1']);
  P.setFindQuery('ПРИ НОШЕНИИ');
  assert.deepEqual(uids(P.list([bow], 'weapons', model, deps)), ['w1']);
  P.setFindQuery('темный');
  assert.deepEqual(uids(P.list([bow], 'weapons', model, deps)), ['w1'], 'normalizes Russian ё/е cleanly');
  P.setFindQuery('rare');
  assert.deepEqual(uids(P.list([bow], 'weapons', model, deps)), [], 'English technical key does not falsely match Russian card');

  // Toggle Find OFF restores normal per-tab view
  P.closeFind(repaint);
  assert.equal(P.isFindOpen(), false);
  assert.equal(P.list([bow], 'weapons', model, deps).map((x) => x.uid).join(','), 'w2');

  // Fallback extractCardText must also skip lower .dfo-item-text lore prose nodes
  const loreCard = mkNode('div', 'card dfo-item-card');
  loreCard.append(mkNode('h3', null, 'Iron Blade'), mkNode('p', 'dfo-item-text', 'Forged by ancient smiths of Yokuda'));
  assert.equal(P.extractCardText(loreCard), 'iron blade', 'extractCardText excludes .dfo-item-text lore prose');
});

test('Find pure-JS live mode indexes card properties without DOM cards, excludes lore, and scales cleanly to 5,000 items', async () => {
  const vm2 = require('node:vm');
  const dfoPackSrc = fs.readFileSync(path.join(__dirname, '../src/mod/page/dfo_pack.js'), 'utf8');
  const mkSimpleEl = (tag) => ({
    tagName: tag.toUpperCase(),
    className: '',
    children: [],
    dataset: {},
    style: { setProperty() { }, removeProperty() { } },
    classList: { add() { }, remove() { }, toggle() { }, contains: () => false },
    setAttribute() { },
    getAttribute: () => null,
    removeAttribute() { },
    append() { },
    replaceChildren() { },
    remove() { },
    closest: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() { },
  });
  let ruOn = false;
  let cardDomCalls = 0;
  const win = {
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
    __DFO_MOD_CFG__: { ru: { on: false } },
    __dfoUi: {
      get locale() { return ruOn ? 'ru' : 'en'; },
      t: (k) => k,
      has: () => true,
    },
    __dfoPackRules: R,
    __dfoStoreFilterMeta: { materialOf: (it) => it._sfMat || '' },
    __dfoStorePageOf: (it) => (it.group === 'PlantIngredients1' ? 'ingredients' : it.group === 'Weapons' ? 'weapons' : 'misc'),
    __translate: (s) => (s === 'Long Blade' ? 'Длинные клинки' : s === 'When Held: +5 Strength' ? 'При ношении: +5 к Силе' : s),
    addEventListener() { },
    localStorage: { getItem: () => null, setItem: () => { } },
    Map, Set, WeakMap, WeakSet, Array, Object, Number, String, Boolean, Math, JSON, Intl, Promise, Error, RegExp, Date, console,
    document: {
      documentElement: { dataset: {}, get lang() { return ruOn ? 'ru' : 'en'; }, clientWidth: 1920, clientHeight: 1080 },
      head: { append() { } },
      body: { append() { } },
      getElementById: () => null,
      createElement: (tag) => mkSimpleEl(tag),
      createElementNS: (_ns, tag) => mkSimpleEl(tag),
      createTextNode: (t) => ({ nodeType: 3, nodeValue: String(t), textContent: String(t) }),
      addEventListener() { },
    },
  };
  win.globalThis = win;
  win.window = win;
  vm2.runInNewContext(dfoPackSrc, win);
  const P = win.__dfoPack;

  const liveSword = { uid: 's1', group: 'Weapons', templateIndex: 120, rarity: 'rare', exalted: true, _sfMat: 'Mithril', damage: '8-24', stackCount: 1, locked: true, sockets: ['ruby'], isIdentified: true };
  const hiddenLoreSword = { uid: 's2', group: 'Weapons', templateIndex: 118, rarity: 'common', shortName: 'SecretRawName', isIdentified: false, _loreText: 'Ancient Yokudan poem', stackCount: 1 };
  const flowers = [];
  for (let i = 0; i < 4998; i++) {
    flowers.push({ uid: `f${i}`, group: i % 2 === 0 ? 'PlantIngredients1' : 'UselessItems2', templateIndex: i % 2 === 0 ? 10 : 249, name: `Herb ${i}`, stackCount: 1, rarity: 'common', value: (i % 100) + 1 });
  }
  const allItems = [hiddenLoreSword, ...flowers, liveSword];
  const deps = { items: () => allItems };
  const liveFindCtx = {
    live: true,
    cardOf() { cardDomCalls++; throw new Error('DOM cardOf must not be called in live pure-JS mode'); },
    itemLine: (it) => {
      if (it === liveSword) return { name: 'Starfall Blade', word: 'Long Blade', hands: 'One hand', damage: '8-24', condition: 95, quest: null };
      if (it === hiddenLoreSword) return { name: 'Unidentified Broadsword', damage: null, condition: null };
      return { name: it.name, condition: null };
    },
    rarityOf: (it) => it.rarity || 'common',
    isLocked: (it) => !!it.locked,
    isJunk: (it) => !!it.junk,
    itemValue: (it) => it.value || 100,
    itemEffects: (it) => (it === liveSword ? ['When Held: +5 Strength', '+12% Fire [8-15] Lunge'] : []),
    socketsOf: (it) => it.sockets || [],
    gemName: () => 'Ruby',
    gemBonus: () => '+4% Fire',
    setInfo: (it) => (it === liveSword ? { name: 'Numidium Regalia', tiers: ['2/2: +10% Armor'] } : null),
    insuredLine: (it) => (it === liveSword ? 'Insured' : null),
    letterWorth: () => null,
    boundLine: () => null,
    sortFlat: (arr) => arr.slice().sort((a, b) => (b.locked === true) - (a.locked === true)),
  };

  const hdr = mkSimpleEl('div');
  P.head(hdr, () => { }, deps, liveFindCtx);
  P.openFind(() => { });
  const model = {
    tabs: [
      { tab: 'weapons', label: 'Weapons', items: [hiddenLoreSword, liveSword] },
      { tab: 'ingredients', label: 'Ingredients', items: flowers.filter((_, i) => i % 2 === 0) },
      { tab: 'misc', label: 'Misc', items: flowers.filter((_, i) => i % 2 === 1) },
    ],
  };

  // Initial query across 5,000 items using pure-JS card indexer (zero DOM cardOf calls)
  P.setFindQuery('container.mat.Mithril [8-15] numidium');
  let res = P.list([], 'weapons', model, deps);
  assert.deepEqual(Array.from(res, (x) => x.uid), ['s1'], 'pure-JS search matches Mithril, technique range bracket, and set name across 5,000 items');
  assert.equal(cardDomCalls, 0, 'cardOf DOM builder was never called in live mode');

  // Lower lore prose & masked unidentified names must NOT match
  P.setFindQuery('SecretRawName');
  assert.equal(P.list([], 'weapons', model, deps).length, 0, 'masked shortName never leaks on unidentified item');
  P.setFindQuery('yokudan poem');
  assert.equal(P.list([], 'weapons', model, deps).length, 0, 'lore/description fields never indexed');

  // Switch to RU and normalize yo -> e + translated game effects
  ruOn = true;
  win.__DFO_MOD_CFG__.ru.on = true;
  P.setFindQuery('при ношении клинки');
  res = P.list([], 'weapons', model, deps);
  assert.deepEqual(Array.from(res, (x) => x.uid), ['s1'], 'RU live search reindexes cleanly on locale change');

  // Verify live pure-JS RU item-name translation, techInfo translation, recipe ingredients, Worth label, lightSource/isLit invalidation, and Junk page() socket/cursed invalidation
  const potionRecipe = { uid: 'r1', group: 'MiscItems', templateIndex: 275, name: 'Letter of Credit', value: 500, isLetter: true, stackCount: 1 };
  const ruBook = { uid: 'b1', group: 'Books', templateIndex: 277, name: 'The Wild Elves', stackCount: 1 };
  const ruTorch = { uid: 't1', group: 'UselessItems2', templateIndex: 247, name: 'Torch', stackCount: 1, isLit: false };
  const recipeBook = { uid: 'rec1', group: 'Books', templateIndex: 278, name: 'Potion Recipe', stackCount: 1 };
  let activeLight = null;
  const origLight = liveFindCtx.lightSource;
  const origLine = liveFindCtx.itemLine;
  const origTech = liveFindCtx.techInfo;
  const origWorth = liveFindCtx.letterWorth;
  win.__translate = (s) => ({
    'Long Blade': 'Длинные клинки',
    'When Held: +5 Strength': 'При ношении: +5 к Силе',
    'The Wild Elves': 'Дикие эльфы',
    'Torch': 'Факел',
    'Technique': 'Боевой прием',
    'Lunge': 'Выпад',
    'Dash forward 5 m': 'Рывок вперед 5 м',
    'Recipe for': 'Рецепт для',
    'Ingredients': 'Ингредиенты',
    'Healing Potion': 'Зелье лечения',
    'Red Flowers': 'Красные цветы',
    'Worth': 'Ценность',
    '500 gold': '500 золота',
  }[s] ?? s);
  liveFindCtx.lightSource = () => activeLight;
  liveFindCtx.techInfo = (it) => (it === liveSword ? { name: 'Lunge', what: 'Dash forward 5 m', value: 18, band: [12, 24] } : null);
  liveFindCtx.letterWorth = (it) => (it === potionRecipe ? '500 gold' : null);
  liveFindCtx.itemLine = (it) => {
    if (it === recipeBook) return { name: 'Potion Recipe', recipe: { potion: 'Healing Potion', ingredients: ['Red Flowers'] } };
    return origLine(it);
  };
  const extraList = [...allItems, potionRecipe, ruBook, ruTorch, recipeBook];
  const extraDeps = { items: () => extraList };
  const extraModel = { tabs: [...model.tabs, { tab: 'books', label: 'Books', items: [ruBook, recipeBook] }, { tab: 'valuables', label: 'Valuables', items: [potionRecipe] }, { tab: 'misc', label: 'Misc', items: [ruTorch] }] };
  P.head(hdr, () => { }, extraDeps, liveFindCtx);
  P.openFind(() => { });
  P.setFindQuery('дикие эльфы');
  assert.deepEqual(Array.from(P.list([], 'weapons', extraModel, extraDeps), (x) => x.uid), ['b1'], 'RU live pure-JS Find translates item names');
  P.setFindQuery('боевой прием выпад');
  assert.deepEqual(Array.from(P.list([], 'weapons', extraModel, extraDeps), (x) => x.uid), ['s1'], 'RU live pure-JS Find translates Technique header & name');
  P.setFindQuery('ингредиенты красные цветы');
  assert.deepEqual(Array.from(P.list([], 'weapons', extraModel, extraDeps), (x) => x.uid), ['rec1'], 'RU live pure-JS Find indexes recipe ingredients & labels');
  P.setFindQuery('ценность 500 золота');
  assert.deepEqual(Array.from(P.list([], 'weapons', extraModel, extraDeps), (x) => x.uid), ['r1'], 'RU live pure-JS Find indexes Worth label + amount');
  P.setFindQuery('факел container.search.word.lit');
  assert.equal(P.list([], 'weapons', extraModel, extraDeps).length, 0, 'unlit torch does not match Lit keyword');
  activeLight = ruTorch;
  assert.deepEqual(Array.from(P.list([], 'weapons', extraModel, extraDeps), (x) => x.uid), ['t1'], 'cardTextOf invalidates immediately when lightSource changes');
  liveFindCtx.lightSource = origLight;
  liveFindCtx.itemLine = origLine;
  liveFindCtx.techInfo = origTech;
  liveFindCtx.letterWorth = origWorth;

  // Verify page() scalar cache invalidates immediately when socket / cursed changes on an item
  const mutArmor = { uid: 'ma1', group: 'Armor', templateIndex: 102, socket: 'empty', cursed: false };
  win.__dfoLootTools = {
    tagInfo: (it) => ({ page: 'armor', rarity: 'common', kind: 'armor', enchanted: false, identified: true, bound: false }),
  };
  win.__dfoLootRules = {
    variantKey: (it) => `v:${it.group}:${it.templateIndex}`,
    tagsOf: (it) => {
      const tags = [];
      if (it.socket === 'empty') tags.push('state:socket-empty');
      else if (it.socket) tags.push('state:socket-set');
      if (it.cursed) tags.push('state:cursed');
      return tags;
    },
  };
  P.save({ junk: { tags: ['state:socket-set', 'state:cursed'], items: [] } });
  const basePageFn = () => 'armor';
  assert.equal(P.page(mutArmor, basePageFn, basePageFn), 'armor', 'empty socket non-cursed stays on armor page');
  mutArmor.socket = 'ruby';
  assert.equal(P.page(mutArmor, basePageFn, basePageFn), 'junk', 'socketing gem invalidates page() cache without epoch change');
  mutArmor.socket = 'empty';
  assert.equal(P.page(mutArmor, basePageFn, basePageFn), 'armor', 'clearing socket restores armor page immediately');
  mutArmor.cursed = true;
  assert.equal(P.page(mutArmor, basePageFn, basePageFn), 'junk', 'cursing item invalidates page() cache immediately');

  P.closeFind(() => { });

  // All 5 sort modes + Rules.cells over 5,000 items
  const sortMeta = {
    pages: R.PAGES,
    pageOf: (it) => win.__dfoStorePageOf(it),
    rarityRanks: ['common', 'rare'],
    rarityOf: (it) => it.rarity || 'common',
    valueOf: (it) => it.value || 10,
    horseOf: () => false,
    pinOf: (it) => `${it.group}:${it.templateIndex}`,
    collator: new Intl.Collator('en', { sensitivity: 'base', numeric: true }),
  };
  for (const mode of R.SORT_MODES) {
    P.save({ sortMode: mode });
    const sorted = P.sortList(allItems, { nameOf: (it) => it.name || '' }, (x) => x, sortMeta);
    assert.equal(sorted.length, 5000);
    assert.equal(sorted[0], liveSword, `5k sort (${mode}) keeps locked sword first`);
  }
  // Verify material sort resolves __dfoStoreFilterMeta / armorType / materialName when __dfoItemCards.material is absent
  const leatherArmor = { uid: 'ml1', group: 'Armor', templateIndex: 102, name: 'Leather Cuirass', armorType: 'Leather', value: 50 };
  const chainArmor = { uid: 'mc1', group: 'Armor', templateIndex: 103, name: 'Chain Mail', armorType: 'Chain', value: 80 };
  const daedricSword = { uid: 'md1', group: 'Weapons', templateIndex: 120, name: 'Daedric Katana', _sfMat: 'Daedric', value: 900 };
  const leatherBoots = { uid: 'ml2', group: 'Armor', templateIndex: 106, name: 'Leather Boots', armorType: 'Leather', value: 40 };
  P.save({ sortMode: 'material' });
  const matSorted = P.sortList([leatherBoots, chainArmor, daedricSword, leatherArmor], { nameOf: (it) => it.name }, (x) => x, sortMeta);
  assert.deepEqual(Array.from(matSorted, (x) => x.uid), ['md1', 'mc1', 'ml2', 'ml1'], 'material sort ranks Daedric > Chain > Leather (then name tiebreak) without __dfoItemCards.material');

  const miscCells = R.cells(flowers, 'misc');
  assert.equal(miscCells.length, 4998, 'distinct names do not merge across surrogate stackKey');
  const dupFlowers = [];
  for (let i = 0; i < 5000; i++) dupFlowers.push({ uid: `d${i}`, group: 'PlantIngredients1', templateIndex: 10, stackCount: 2, value: 4 });
  const collapsed = R.cells(dupFlowers, 'ingredients');
  assert.equal(collapsed.length, 1);
  assert.equal(collapsed[0].members.length, 5000);

  // Paired READONLY_UI_SEL: container filter/sort controls & read-only footer elements never mark pending = true;
  // actual item transfers (.itemrow, .dfo-loot-takeall) still set pending = true, and onUnmount() clears state cleanly.
  const docHandlers = {};
  const roWin = {
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
    __DFO_MOD_CFG__: { ru: { on: false } },
    __dfoUi: { locale: 'en', t: (k) => k, has: () => true },
    __dfoPackRules: R,
    addEventListener() { },
    localStorage: { getItem: () => null, setItem() { } },
    Map, Set, WeakMap, WeakSet, Array, Object, Number, String, Boolean, Math, JSON, Intl, Promise, Error, RegExp, Date, console,
    document: {
      documentElement: { dataset: {}, lang: 'en', clientWidth: 1920, clientHeight: 1080 },
      head: { append() { } },
      body: { append() { } },
      getElementById: () => null,
      createElement: (tag) => mkSimpleEl(tag),
      createElementNS: (_ns, tag) => mkSimpleEl(tag),
      createTextNode: (t) => ({ nodeType: 3, nodeValue: String(t), textContent: String(t) }),
      addEventListener(type, fn) { (docHandlers[type] ??= []).push(fn); },
    },
  };
  roWin.globalThis = roWin;
  roWin.window = roWin;
  vm2.runInNewContext(dfoPackSrc, roWin);
  const RP = roWin.__dfoPack;
  const roDeps = { items: () => [] };
  let sortCalls = 0;
  RP.refresh(roDeps, { busy: () => false, sort: () => { sortCalls++; } });
  assert.equal(sortCalls, 1, 'initial deps mount sorts once');
  const mkTarget = (matches) => ({
    closest(sel) {
      const tokens = sel.split(',').map((s) => s.trim());
      return tokens.some((tok) => matches.includes(tok)) ? this : null;
    },
  });
  for (const sel of ['.storefilter', '.dfo-loot-sort', '.dfo-loot-close', '.goldfield', '.goldbtn', '.z-status', '.piletabs', '.dfo-loot-dd', '.remotehead .remotewho', '.dfo-loot-foot-hint']) {
    for (const fn of docHandlers.click || []) fn({ type: 'click', target: mkTarget(['.pack-shell', sel]) });
  }
  RP.refresh(roDeps, { busy: () => false, sort: () => { sortCalls++; } });
  assert.equal(sortCalls, 1, 'read-only container/footer UI interactions never queue a 5k re-sort');
  for (const fn of docHandlers.keydown || []) fn({ type: 'keydown', key: 'Escape', target: mkTarget(['.inv-info']) });
  RP.refresh(roDeps, { busy: () => false, sort: () => { sortCalls++; } });
  assert.equal(sortCalls, 1, 'Escape inside .inv-info does not queue re-sort');
  for (const fn of docHandlers.click || []) fn({ type: 'click', target: mkTarget(['.inv-menu', '.inv-menu-item']) });
  RP.refresh(roDeps, { busy: () => false, sort: () => { sortCalls++; } });
  assert.equal(sortCalls, 2, 'mutating context menu action inside .inv-menu queues re-sort');
  for (const fn of docHandlers.keydown || []) fn({ type: 'keydown', key: 'y', target: mkTarget(['.inv-info']) });
  RP.refresh(roDeps, { busy: () => false, sort: () => { sortCalls++; } });
  assert.equal(sortCalls, 3, 'keyboard confirmation inside .inv-info queues re-sort');
  for (const fn of docHandlers.click || []) fn({ type: 'click', target: mkTarget(['.pack-shell', '.itemrow']) });
  RP.refresh(roDeps, { busy: () => false, sort: () => { sortCalls++; } });
  assert.equal(sortCalls, 4, 'item transfer click still queues re-sort cleanly');

  // Container quantity modal on document.body: Cancel/All/Escape stay read-only, Confirm/Enter queue re-sort
  for (const sel of ['.dfo-loot-modal-cancel', '.dfo-loot-modal-all']) {
    for (const fn of docHandlers.click || []) fn({ type: 'click', target: mkTarget(['.dfo-loot-modal-box', sel]) });
  }
  for (const fn of docHandlers.keydown || []) fn({ type: 'keydown', key: 'Escape', target: mkTarget(['.dfo-loot-modal-box']) });
  RP.refresh(roDeps, { busy: () => false, sort: () => { sortCalls++; } });
  assert.equal(sortCalls, 4, 'modal Cancel, All toggle, and Escape do not queue bogus re-sort');
  for (const fn of docHandlers.click || []) fn({ type: 'click', target: mkTarget(['.dfo-loot-modal-box', '.dfo-loot-modal-btn']) });
  RP.refresh(roDeps, { busy: () => false, sort: () => { sortCalls++; } });
  assert.equal(sortCalls, 5, 'modal confirm button click inside .dfo-loot-modal-box queues re-sort');
  for (const fn of docHandlers.keydown || []) fn({ type: 'keydown', key: 'Enter', target: mkTarget(['.dfo-loot-modal-box']) });
  RP.refresh(roDeps, { busy: () => false, sort: () => { sortCalls++; } });
  assert.equal(sortCalls, 6, 'modal Enter keydown inside .dfo-loot-modal-box queues re-sort');

  // Open Find mode, then onUnmount() must clear Find dataset attribute & reset session state
  RP.openFind(() => { });
  RP.setFindQuery('potion');
  assert.equal(RP.isFindOpen(), true);
  assert.equal(roWin.document.documentElement.dataset.dfoPackFind, '1');
  assert.equal(typeof RP.onUnmount, 'function', 'dfo_pack exposes onUnmount cleanup hook');
  RP.onUnmount();
  assert.equal(RP.isFindOpen(), false, 'onUnmount clears findActive');
  assert.equal(RP.isFindRendered(), false, 'onUnmount clears findRendered');
  assert.equal(roWin.document.documentElement.dataset.dfoPackFind, undefined, 'onUnmount removes data-dfo-pack-find from html element');
  RP.refresh(roDeps, { busy: () => false, sort: () => { sortCalls++; } });
  assert.equal(sortCalls, 7, 'onUnmount clears lastDeps so next mount sorts cleanly');

  // Nearby Loot toolbar buttons inside paired .pack-shell stay read-only, while [data-take-all] queues re-sort
  for (const fn of docHandlers.click || []) fn({ type: 'click', target: mkTarget(['.pack-shell', '.dfo-loot-actions', '.dfo-loot-button']) });
  for (const fn of docHandlers.click || []) fn({ type: 'click', target: mkTarget(['.pack-shell', '.dfo-loot-actions', '.dfo-loot-status']) });
  RP.refresh(roDeps, { busy: () => false, sort: () => { sortCalls++; } });
  assert.equal(sortCalls, 7, 'Nearby Loot filter/auto-loot/status controls inside .dfo-loot-actions never trigger 5k re-sort');
  for (const fn of docHandlers.click || []) fn({ type: 'click', target: mkTarget(['.pack-shell', '.dfo-loot-actions', '.dfo-loot-button', '[data-take-all]']) });
  RP.refresh(roDeps, { busy: () => false, sort: () => { sortCalls++; } });
  assert.equal(sortCalls, 8, 'Nearby Loot [data-take-all] still queues re-sort');

  // Find scroll state isolation & microtask soft remeasure
  const remeasureCalls = [];
  const savedCreateEl = roWin.document.createElement;
  const mkTreeEl = (tag) => {
    const node = mkSimpleEl(tag);
    node.children = [];
    node.append = (...xs) => { node.children.push(...xs); };
    node.replaceChildren = (...xs) => { node.children = [...xs]; };
    return node;
  };
  roWin.document.createElement = mkTreeEl;
  roWin.__dfoInventoryRemeasure$ = (_sh, opts) => { remeasureCalls.push(opts ? { ...opts } : null); return true; };
  try {
    RP.openFind(() => { });
    assert.equal(RP.isFindRendered(), false, 'isFindRendered stays false until shelf() mounts Find');
    const catsHost = mkTreeEl('div');
    const listsHost = mkTreeEl('div');
    listsHost.isConnected = true;
    listsHost.closest = (s) => (s === '.pack-shell' ? mkTreeEl('div') : null);
    RP.list([{ name: 'Sword', uid: 'sw1' }, { name: 'Potion', uid: 'po1' }], 'all', null, { items: () => [{ name: 'Sword', uid: 'sw1' }, { name: 'Potion', uid: 'po1' }] });
    RP.shelf(catsHost, listsHost, () => { });
    assert.equal(RP.isFindRendered(), true, 'shelf() marks Find as rendered');
    RP.syncFindScroll(380);
    assert.equal(RP.findScrollTop(), 380, 'syncFindScroll tracks scrolled offset while Find is active & rendered');
    const findInput = catsHost.children[0].children.find((ch) => ch.tagName === 'INPUT');
    assert.ok(findInput, 'Find bar input is rendered');
    findInput.value = 'pot';
    findInput.oninput();
    assert.equal(RP.findScrollTop(), 0, 'typing new query resets findScrollTop immediately even before debounce commit');
    RP.syncFindScroll(500);
    assert.equal(RP.findScrollTop(), 500);
    listsHost.scrollTop = 0;
    RP.shelf(catsHost, listsHost, () => { });
    await Promise.resolve();
    assert.equal(listsHost.scrollTop, 500, 'Find microtask restores scrolled offset');
    assert.deepEqual(remeasureCalls, [{ soft: true }], 'Find microtask uses { soft: true } draw without wiping 5k height cache');
    RP.closeFind(() => { });
    RP.syncFindScroll(999);
    assert.equal(RP.findScrollTop(), 0, 'syncFindScroll refuses to pollute findScrollTop once Find is closed');
    RP.shelf(catsHost, listsHost, () => { });
    assert.equal(RP.isFindRendered(), false, 'shelf() clears findRendered when closing Find');
  } finally {
    roWin.document.createElement = savedCreateEl;
  }
});

test('gemSocketing fixes context-menu "Set in...", lock checks, stale detail clear, and works in both transform orders', () => {
  const vm2 = require('node:vm');
  const { gemSocketing } = require('../src/mod/inventory-transform.cjs');
  const { transformContainer } = require('../src/mod/container-transform.cjs');

  // Mini DOM harness supporting nested clicks, focus, roles, dataset, and document listeners
  const docListeners = [];
  const mkEl = (tag, cls = '', text = null) => {
    const attrs = new Map();
    const dataset = {};
    const node = {
      tagName: tag.toUpperCase(),
      className: cls,
      textContent: text ?? '',
      dataset,
      style: {},
      children: [],
      parentNode: null,
      setAttribute: (k, v) => attrs.set(k, String(v)),
      getAttribute: (k) => attrs.get(k) ?? null,
      append: (...xs) => {
        for (const c of xs) {
          if (typeof c === 'string') { node.textContent += c; continue; }
          c.parentNode = node;
          node.children.push(c);
        }
      },
      remove: () => {
        if (!node.parentNode) return;
        const idx = node.parentNode.children.indexOf(node);
        if (idx >= 0) node.parentNode.children.splice(idx, 1);
        node.parentNode = null;
      },
      contains: (t) => t === node || node.children.some((c) => c.contains(t)),
      querySelectorAll: (sel) => {
        const res = [];
        const walk = (cur) => {
          for (const ch of cur.children) {
            if ((sel === 'button' && ch.tagName === 'BUTTON')
              || (sel.startsWith('.') && String(ch.className || '').split(/\s+/).includes(sel.slice(1)))) {
              res.push(ch);
            }
            walk(ch);
          }
        };
        walk(node);
        return res;
      },
      focus: () => { doc.activeElement = node; },
    };
    return node;
  };
  const body = mkEl('body');
  const doc = {
    body,
    activeElement: null,
    addEventListener: (t, fn, c) => docListeners.push({ t, fn, c }),
    removeEventListener: (t, fn) => {
      const idx = docListeners.findIndex((x) => x.t === t && x.fn === fn);
      if (idx >= 0) docListeners.splice(idx, 1);
    },
  };

  // Fixture mirroring minified enhancedInventory shapes (iu, td, nd, Du gem block, Xl)
  const fakeSrc = `
    let N=null,P='local',vs=null,F=null,Il=null,$u=null,ed=null,rfr=0,rnd=0;
    const j={entity:{items:[]},items:()=>j.entity.items,getQuest:null};
    const U=(t,c='',x=null)=>mkEl(t,c,x);
    const G=()=>{rfr++},$=()=>{rnd++},Y=()=>{},X=()=>{Il?.remove(),Il=null},ju=()=>{},Q=()=>{},Bl=()=>{};
    const Ht=e=>e?.locked===true,Sr=()=>true,vr=e=>e?.gemKind??null,bu=()=>j.entity;
    const k=e=>({name:e?.name??''}),w=e=>e?.name??'';
    const Ls=e=>({name:e?.name??''}),Mc=x=>x;
    const ba={nogem:'That will not set.'},Sa=(nm,g)=>'Set: '+g+' in '+nm;
    const setCalls=[];
    const In=(t,g,ctx,at,{from}={})=>{
      setCalls.push({t,g,from});
      if(Ht(from))return{ok:!1,reason:'nogem'};
      if((from.stackCount??1)>1)from.stackCount--;else{let idx=j.entity.items.indexOf(from);if(idx>=0)j.entity.items.splice(idx,1)}
      return{ok:!0};
    };
    const wu=()=>j.entity.items.filter(x=>x.sockets>0);
    function iu(e,t='local'){let n=Ls(e),o=U('button',\`itemrow\${N===e&&P===t?' on':''}\`);return o}
    function td(){$u?.remove(),$u=null,ed?.(),ed=null}function nd(e,t){Y(),X(),ju(),Q(),td(),$u=U('div','inv-info inv-target');return $u}
    function Du(e,t,{qty:n=!0}={}){
      let i=U('div','acts');
      if(t==='local'&&Sr()&&vr(e)&&!e.questItem&&wu().length){let t=vs===e,n=U('button',\`act\${t?' on':''}\`,'Set in...');if(n.onclick=()=>{vs=t?null:e,$()},i.append(n),t)for(let t of wu()){let n=U('button','act gem-home',\`Set in \${w(t,{getQuest:j.getQuest??null})}\`);n.onclick=()=>{let n=vr(e),r=In(t,n,bu(),null,{from:e});vs=null,F=r.ok?Sa(w(t,{getQuest:j.getQuest??null}),n):ba[r.reason??'']??'That will not set.',r.ok&&!(j.items?.()??[]).includes(e)&&(e=null),G(),$()},i.append(n)}}
      if(t==='local'){let btn=U('button','act',Ht(e)?'Unlock':'Lock');i.append(btn)}
      return i;
    }
    function Xl(e,t,n,r){Y(),X();let i=[...Du(e,t,{qty:!1}).querySelectorAll('button')];if(!i.length)return;Il=U('div','inv-menu'),Il.setAttribute('role','menu'),Il.append(U('p','inv-menu-head',k(e,j.entity).name));for(let e of i){e.className='inv-menu-item',e.setAttribute('role','menuitem');let t=e.onclick;e.onclick=e=>{e.stopPropagation(),X(),t?.(e)},Il.append(e)}document.body.append(Il),Bl(Il,null,n,r);}
  `.replace(/'/g, '`');

  const patched = gemSocketing(fakeSrc, { elFn: 'U', refreshFn: 'G', renderFn: '$' });
  assert.equal(gemSocketing(patched, { elFn: 'U', refreshFn: 'G', renderFn: '$' }), patched, 'gemSocketing is idempotent');

  const ctx = {
    mkEl,
    document: doc,
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => { },
  };
  vm2.runInNewContext(`${patched}\n;this.__api={j,Du,Xl,td,setCalls,getState:()=>({N,vs,F,Il,$u,rfr,rnd}),setPicked:(x)=>{N=x;}};`, ctx);

  const bagSword = { name: 'Iron Sword', sockets: 1 };
  const wornRing = { name: 'Silver Ring', sockets: 1, equipped: true };
  const gemStack = { name: 'Ruby', gemKind: 'ruby', stackCount: 2, locked: false };
  const lockedGem = { name: 'Sapphire', gemKind: 'sapphire', stackCount: 1, locked: true };
  ctx.__api.j.entity.items = [bagSword, wornRing, gemStack, lockedGem];

  // 1. Locked gem via right-click context menu refuses cleanly without calling In()
  ctx.__api.Xl(lockedGem, 'local', 10, 10);
  const lockedMenuBtn = ctx.__api.getState().Il.querySelectorAll('button').find((b) => b.textContent === 'Set in...');
  assert.ok(lockedMenuBtn, 'context menu includes Set in...');
  lockedMenuBtn.onclick({ stopPropagation() { } });
  assert.equal(ctx.__api.getState().F, 'Locked. Unlock it first');
  assert.equal(ctx.__api.setCalls.length, 0, 'locked gem never invokes In()');
  assert.equal(ctx.__api.getState().$u, null, 'locked gem does not open target chooser');

  // 2. Right-click unlocked gem even with unrelated N selected -> opens .inv-info.inv-target chooser!
  ctx.__api.setPicked(bagSword);
  ctx.__api.Xl(gemStack, 'local', 20, 20);
  const menuBtn = ctx.__api.getState().Il.querySelectorAll('button').find((b) => b.textContent === 'Set in...');
  menuBtn.onclick({ stopPropagation() { } });
  const modal = ctx.__api.getState().$u;
  assert.ok(modal && modal.className.includes('inv-target'), 'clicking Set in... in context menu opens .inv-target modal');
  const opts = modal.querySelectorAll('.inv-menu-item');
  assert.deepEqual(opts.map((o) => o.textContent), ['Set in Iron Sword', 'Set in Silver Ring']);
  assert.equal(doc.activeElement, opts[0], 'first target focused on open');

  // ArrowDown / ArrowUp / Escape / Cancel navigation
  docListeners.find((l) => l.t === 'keydown').fn({ key: 'ArrowDown', preventDefault() { }, stopPropagation() { } });
  assert.equal(doc.activeElement, opts[1]);
  docListeners.find((l) => l.t === 'keydown').fn({ key: 'Escape', preventDefault() { }, stopPropagation() { } });
  assert.equal(ctx.__api.getState().$u, null, 'Escape dismisses target modal');
  assert.equal(docListeners.length, 0, 'Escape cleans up document listeners');

  // Reopen & socket first gem from stack of 2 into worn ring (keeps N=gemStack & stack=1)
  ctx.__api.setPicked(gemStack);
  ctx.__api.Xl(gemStack, 'local', 20, 20);
  ctx.__api.getState().Il.querySelectorAll('button').find((b) => b.textContent === 'Set in...').onclick({ stopPropagation() { } });
  ctx.__api.getState().$u.querySelectorAll('.inv-menu-item')[1].onclick({ stopPropagation() { } });
  assert.equal(gemStack.stackCount, 1);
  assert.equal(ctx.__api.getState().N, gemStack, 'keeps picked gem while stack still in pack');
  assert.equal(ctx.__api.setCalls.length, 1);

  // Socket last gem via card .acts -> .gem-home and verify N is cleared (not dead local e=null)
  const acts1 = ctx.__api.Du(gemStack, 'local');
  acts1.querySelectorAll('button').find((b) => b.textContent === 'Set in...').onclick();
  const acts2 = ctx.__api.Du(gemStack, 'local');
  const homeBtn = acts2.querySelectorAll('.gem-home')[0];
  assert.ok(homeBtn, '.gem-home button renders in card .acts');
  homeBtn.onclick();
  assert.equal(ctx.__api.getState().N, null, 'consuming last gem clears stale N detail selection');
  assert.equal(ctx.__api.setCalls.length, 2);

  // Verify live bundle works in BOTH transform orders if DFO_BUILD_DIR is present
  if (process.env.DFO_BUILD_DIR) {
    const assets = path.join(process.env.DFO_BUILD_DIR, 'assets');
    const eiName = fs.readdirSync(assets).find((f) => /^enhancedInventory-/.test(f) && !f.includes('Worker-') && fs.readFileSync(path.join(assets, f), 'utf8').includes('`packPhoneDoll`'));
    assert.ok(eiName, 'enhancedInventory asset present');
    const eiRaw = fs.readFileSync(path.join(assets, eiName), 'utf8');
    const order1 = transformContainer('assets/' + eiName, transformInventory('assets/' + eiName, eiRaw, []), []);
    const order2 = transformInventory('assets/' + eiName, transformContainer('assets/' + eiName, eiRaw, []), []);
    assert.ok(order1.includes('__dfoGemMenuPick$') && order1.includes('__dfoContainerMenu$('));
    assert.ok(order2.includes('__dfoGemMenuPick$') && order2.includes('__dfoContainerMenu$('));
  }
});

test('inventory overlays, menus, batch footers, gold drop and pinned .card .acts match ui-references and defeat Grimoire overrides', () => {
  const { execFileSync } = require('node:child_process');
  const packSrc = fs.readFileSync(path.resolve(__dirname, '../src/mod/page/dfo_pack.js'), 'utf8');
  const cardsSrc = fs.readFileSync(path.resolve(__dirname, '../src/mod/page/dfo_item_cards.js'), 'utf8');
  const packCss = packSrc.split('  const CSS = `')[1]?.split('`;')[0];
  const cardsCss = cardsSrc.split('  const CSS = `')[1]?.split('`;')[0];
  assert.ok(packCss && cardsCss, 'CSS constants extracted');
  assert.doesNotMatch(packCss, /[А-Яа-яЁё]/, 'dfo_pack CSS must contain zero Cyrillic literals');
  assert.doesNotMatch(cardsCss, /[А-Яа-яЁё]/, 'dfo_item_cards CSS must contain zero Cyrillic literals');

  for (const needle of [
    '.stashfoot.stashfoot .act',
    '.salvagefoot.salvagefoot .act.primary',
    '.itemrow.salvpick',
    '.itemrow .salv-mark',
    'form.goldfield.goldfield',
    '.inv-menu.inv-menu',
    '.inv-menu-head',
    'button.inv-menu-item',
    '.packtip.packdetail > .sheet-close',
    '.packtip.packtip > .card .acts',
    '.packtip.packtip > .card .acts label.qtyfield',
    '.inv-info.inv-info > .card',
    '.inv-info.inv-destroy > .card > .acts .act.primary',
    '.walletsheet.walletsheet',
    '.pack-win > .sheet-notice.sheet-notice',
  ]) {
    assert.ok(packCss.includes(needle), `dfo_pack CSS covers ${needle}`);
  }
  const invTfSrc = fs.readFileSync(path.resolve(__dirname, '../src/mod/inventory-transform.cjs'), 'utf8');
  assert.equal((invTfSrc.match(/function gemSocketing\(/g) || []).length, 1, 'inventory-transform.cjs must define gemSocketing exactly once');
  assert.ok(cardsCss.includes(':root body .pack-shell .packtip > .card.dfo-item-card.dfo-item-card'), 'dfo_item_cards CSS has Grimoire specificity shield');
  assert.ok(cardsCss.includes('border-image:none!important'), 'dfo_item_cards CSS strips Grimoire sideScroll border-image');
  assert.ok(cardsCss.includes(':root .dfo-item-card .dfo-effect-value'), 'dfo_item_cards CSS uses :root prefix so Grimoire Fi() ink rewriter skips item cards');

  const chrome = [
    process.env.CHROMIUM_BIN,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].find((p) => p && fs.existsSync(p));
  if (!chrome) return;

  // Simulate worst-case DOM order: dfo_pack + dfo_item_cards injected in <head> BEFORE enhancedStyle Grimoire!
  const grimoireStressCss = `
    .pack-shell .packtip.packdetail { position: relative; width: 320px; background: transparent; padding: 0; border: 0; }
    .pack-shell .packtip.packdetail .card { display: flex; flex-direction: column; overflow: hidden; }
    .packdetail .sheet-close { display: none; }
    @media (max-width: 640px) { .packdetail .sheet-close { display: block; width: 100%; padding: 14px; } }
    :root[data-plus-dress="grimoire"] .pack-shell .packtip > .card,
    :root[data-plus-dress="grimoire"] .inv-tip > .card,
    :root[data-plus-dress="grimoire"] .inv-menu,
    :root[data-plus-dress="grimoire"] .inv-info > .card {
      background: none !important;
      border: 2px solid transparent !important;
      border-image: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'><rect width='10' height='10' fill='tan'/></svg>") 15 fill / 15px / 0 round !important;
      padding: 6px 16px !important;
    }
    :root[data-plus-dress="grimoire"] .pack-shell .packtip > .card .acts .act,
    :root[data-plus-dress="grimoire"] .inv-menu button,
    :root[data-plus-dress="grimoire"] .inv-menu .act,
    :root[data-plus-dress="grimoire"] .inv-info > .card .acts .act,
    :root[data-plus-dress="grimoire"] .goldfield .goldacts .act {
      background: none !important; border: 0 !important; box-shadow: none !important;
      color: rgb(43, 26, 12) !important; font-size: 16px !important; line-height: 24px !important; padding: 0 6px !important;
    }
    :root[data-plus-dress="grimoire"] .pack-shell .packtip > .card h3,
    :root[data-plus-dress="grimoire"] .inv-tip > .card h3 {
      font-size: 32px !important; color: rgb(138, 28, 22) !important;
    }
    :root[data-plus-dress="grimoire"] .inv-menu { align-items: center !important; }
  `;

  const runProbe = (w, h) => {
    const html = `<!doctype html><html data-dfo-pack="1" data-plus-dress="grimoire" data-plus-theme="iron"><head><meta charset="utf-8">
    <style>${cardsCss}</style>
    <style>${packCss}</style>
    <style>${grimoireStressCss}</style>
    </head><body style="margin:0;background:#111;">
    <div class="pack-shell"><div class="pack-win">
      <p class="sheet-notice">Notice text</p>
      <div class="pack">
        <div class="pack-main"></div>
        <div class="pack-dock">
          <div class="packlists"><div class="packcol">
            <div class="itemrow salvpick"><span class="salv-mark">S</span></div>
          </div></div>
          <div class="stashfoot"><button class="act" id="stash-all">Stash all</button></div>
          <div class="salvagefoot"><span class="salvagecount">Selected: 1</span><button class="act">Clear</button><button class="act primary" id="salv-go">Salvage (1)</button></div>
        </div>
        <section class="packcol packdetail open packtip" id="pinned-dressed">
          <span class="px-gem px-corner px-tl" id="pinned-corner"></span>
          <button class="sheet-close" id="pinned-close">Close</button>
          <div class="card dfo-item-card" id="dressed-card" data-rarity="rare">
            <div class="card-body">
              <div class="dfo-item-title"><h3 id="dressed-h3">Iron Blade</h3></div>
              <div class="walletsheet" id="wallet-sheet"><h4 class="wallet-head">Coins</h4></div>
            </div>
            <div class="acts" id="dressed-acts">
              <button class="act primary" id="act-primary">Wear</button>
              <button class="act" id="act-info">Info</button>
              <button class="act gem-home" id="act-gem">Set in Silver Ring</button>
              <label class="qtyfield" id="qty-wrap"><span>Qty</span><input type="text" value="1" id="qty-input"><span class="meta">of 5</span></label>
            </div>
          </div>
          <p class="iconnote" id="pinned-iconnote">No picture yet</p>
        </section>
        <section class="packcol packdetail open packtip" id="pinned-fallback">
          <div class="card" id="fallback-card">
            <div class="card-body"><h3 id="fallback-h3">Potion</h3></div>
            <div class="acts"><button class="act primary" id="fallback-use">Use</button></div>
          </div>
        </section>
      </div>
      <footer class="packbar dfo-pack-foot" style="min-height:48px;">
        <form class="goldfield" id="gold-form">
          <input type="text" value="100" id="gold-input">
          <div class="goldacts"><button class="act primary goldgo" id="gold-go">Drop</button><button class="act goldall" id="gold-all">Drop all</button></div>
        </form>
      </footer>
    </div></div>
    <div class="inv-menu" role="menu" id="ctx-menu" style="left:10px;top:10px;">
      <p class="inv-menu-head" id="ctx-head">Ruby</p>
      <button class="inv-menu-item primary" id="ctx-primary">Set in...</button>
      <button class="inv-menu-item" id="ctx-item">Lock</button>
    </div>
    <div class="inv-tip" id="hover-tip" style="left:400px;top:20px;"><div class="card dfo-item-card" id="hover-card" data-rarity="legendary"><div class="dfo-item-title"><h3 id="hover-h3">Flame Gem</h3></div></div></div>
    <div class="inv-info inv-destroy" id="destroy-modal"><div class="card" id="destroy-card"><div class="inv-info-box"><p>Destroy?</p><p class="center salvagenames" id="salv-names">Iron Sword</p></div><div class="acts"><button class="act primary" id="destroy-yes">Destroy</button><button class="act" id="destroy-no">Cancel</button></div></div></div>
    <pre id="out"></pre>
    <script>
      const cs = (id) => getComputedStyle(document.getElementById(id));
      const rc = (id) => document.getElementById(id).getBoundingClientRect().toJSON();
      document.getElementById('out').textContent = JSON.stringify({
        dressedCard: { bi: cs('dressed-card').borderImageSource, rect: rc('dressed-card') },
        dressedH3: { fs: cs('dressed-h3').fontSize, c: cs('dressed-h3').color },
        fallbackCard: { bi: cs('fallback-card').borderImageSource },
        fallbackH3: { fs: cs('fallback-h3').fontSize, c: cs('fallback-h3').color },
        fallbackUse: { bg: cs('fallback-use').backgroundImage, c: cs('fallback-use').color },
        walletPadL: cs('wallet-sheet').paddingLeft,
        iconNoteBg: cs('pinned-iconnote').backgroundColor,
        salvNamesColor: cs('salv-names').color,
        salvNamesSize: cs('salv-names').fontSize,
        hoverCard: { bi: cs('hover-card').borderImageSource },
        hoverH3: { fs: cs('hover-h3').fontSize, c: cs('hover-h3').color },
        pinnedCornerDisplay: cs('pinned-corner').display,
        pinnedCloseDisplay: cs('pinned-close').display,
        pinnedCloseBg: cs('pinned-close').backgroundImage,
        actPrimary: { bg: cs('act-primary').backgroundImage, c: cs('act-primary').color, fs: cs('act-primary').fontSize, bs: cs('act-primary').borderTopStyle, rect: rc('act-primary') },
        actInfo: { bg: cs('act-info').backgroundImage, c: cs('act-info').color, fs: cs('act-info').fontSize, rect: rc('act-info') },
        actGem: { whiteSpace: cs('act-gem').whiteSpace, rect: rc('act-gem') },
        qtyInput: { c: cs('qty-input').color, fs: cs('qty-input').fontSize, rect: rc('qty-input') },
        stashAll: { bg: cs('stash-all').backgroundImage, c: cs('stash-all').color, rect: rc('stash-all') },
        salvGo: { bg: cs('salv-go').backgroundImage, c: cs('salv-go').color, rect: rc('salv-go') },
        goldForm: { bi: cs('gold-form').borderImageSource, pos: cs('gold-form').position, rect: rc('gold-form') },
        goldGo: { bg: cs('gold-go').backgroundImage, c: cs('gold-go').color, fs: cs('gold-go').fontSize, rect: rc('gold-go') },
        ctxMenu: { bi: cs('ctx-menu').borderImageSource, ai: cs('ctx-menu').alignItems, pad: cs('ctx-menu').paddingTop },
        ctxItem: { bg: cs('ctx-item').backgroundColor, c: cs('ctx-item').color, jc: cs('ctx-item').justifyContent, fs: cs('ctx-item').fontSize, rect: rc('ctx-item') },
        destroyCard: { bi: cs('destroy-card').borderImageSource },
        destroyYes: { bg: cs('destroy-yes').backgroundImage, c: cs('destroy-yes').color, rect: rc('destroy-yes') },
      });
    </script></body></html>`;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dfo-pack-ui-ref-'));
    const f = path.join(tmp, 'probe.html');
    try {
      fs.writeFileSync(f, html);
      const out = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', `--window-size=${w},${h}`, '--dump-dom', 'file:///' + f.replace(/\\/g, '/')], { encoding: 'utf8', timeout: 20000 });
      const m = /<pre id="out">([\s\S]*?)<\/pre>/.exec(out);
      assert.ok(m, 'Chrome probe produced output');
      return JSON.parse(m[1]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  };

  const desk = runProbe(1280, 800);
  assert.equal(desk.dressedCard.bi, 'none', 'pinned .dfo-item-card defeats Grimoire border-image');
  assert.equal(desk.fallbackCard.bi, 'none', 'fallback non-dressed pinned card defeats Grimoire border-image');
  assert.equal(desk.fallbackH3.fs, '18px', 'fallback card title defeats Grimoire 32px h3');
  assert.notEqual(desk.fallbackH3.c, 'rgb(138, 28, 22)', 'fallback card title not overridden by Grimoire red');
  assert.ok(desk.fallbackUse.bg.includes('linear-gradient') && desk.fallbackUse.c === 'rgb(253, 230, 138)');
  assert.equal(desk.walletPadL, '12px', '.walletsheet inside .dfo-item-card gets inner horizontal padding');
  assert.notEqual(desk.iconNoteBg, 'rgba(0, 0, 0, 0)', '.packdetail > .iconnote renders dark plate below card');
  assert.equal(desk.salvNamesColor, 'rgb(183, 168, 137)', 'p.salvagenames beats .inv-info-box p');
  assert.equal(desk.salvNamesSize, '12.5px');
  assert.ok(packCss.includes('@media (pointer:coarse){'), 'preserves coarse-pointer touch target rules');
  assert.equal(desk.hoverCard.bi, 'none', 'hover .dfo-item-card defeats Grimoire border-image');
  assert.equal(desk.dressedH3.fs, '22px', 'card title keeps 22px under Grimoire');
  assert.equal(desk.hoverH3.fs, '22px', 'hover card title keeps 22px under Grimoire');
  assert.notEqual(desk.hoverH3.c, 'rgb(138, 28, 22)', 'card title not overridden by Grimoire red');
  assert.equal(desk.pinnedCornerDisplay, 'none', 'duplicate .packtip > .px-corner hidden');
  assert.equal(desk.pinnedCloseDisplay, 'none', 'mobile .sheet-close hidden on desktop');
  assert.ok(desk.actPrimary.bg.includes('linear-gradient'), 'pinned .acts .act.primary has C-01 gradient over Grimoire');
  assert.equal(desk.actPrimary.fs, '12px');
  assert.equal(desk.actPrimary.c, 'rgb(253, 230, 138)');
  assert.equal(desk.actInfo.c, 'rgb(241, 230, 200)');
  assert.ok(desk.actInfo.rect.width >= 72 && desk.actInfo.rect.height >= 28);
  assert.equal(desk.actGem.whiteSpace, 'normal', '.gem-home allows wrapping long target names');
  assert.equal(desk.qtyInput.c, 'rgb(245, 212, 81)');
  assert.ok(desk.stashAll.bg.includes('linear-gradient') && desk.stashAll.rect.width >= 156);
  assert.ok(desk.salvGo.bg.includes('repeating-linear-gradient') && desk.salvGo.c === 'rgb(243, 255, 251)');
  assert.equal(desk.goldForm.bi, 'none');
  assert.equal(desk.goldForm.pos, 'absolute');
  assert.equal(desk.goldGo.fs, '11px', 'goldfield .act beats Grimoire 16px');
  assert.ok(desk.goldGo.bg.includes('linear-gradient'));
  assert.equal(desk.ctxMenu.bi, 'none', 'context menu defeats Grimoire border-image');
  assert.equal(desk.ctxMenu.ai, 'stretch', 'context menu items stretch full width under Grimoire');
  assert.equal(desk.ctxItem.jc, 'flex-start');
  assert.equal(desk.ctxItem.c, 'rgb(236, 226, 200)');
  assert.equal(desk.destroyCard.bi, 'none');
  assert.ok(desk.destroyYes.bg.includes('repeating-linear-gradient') && desk.destroyYes.c === 'rgb(252, 224, 220)');

  const mob = runProbe(390, 844);
  assert.equal(mob.pinnedCloseDisplay, 'flex', 'mobile .sheet-close shown at <= 640px');
  assert.ok(mob.pinnedCloseBg.includes('repeating-linear-gradient'), 'mobile .sheet-close uses C-01 crimson hatch');
});

test('real enhancedStyle Grimoire + Plus dress in Chrome preserves item cards, inventory headers/footers, overlays and container UI', { skip: !process.env.DFO_BUILD_DIR || !process.env.CHROMIUM_BIN }, async () => {
  const http = require('node:http');
  const { execFile } = require('node:child_process');
  const distDir = process.env.DFO_BUILD_DIR;
  const assetsDir = path.join(distDir, 'assets');
  const stFile = fs.readdirSync(assetsDir).find((f) => f.startsWith('enhancedStyle'));
  assert.ok(stFile, 'enhancedStyle asset present');
  const packSrc = fs.readFileSync(path.resolve(__dirname, '../src/mod/page/dfo_pack.js'), 'utf8');
  const packCss = packSrc.split('  const CSS = `')[1].split('`;')[0];
  const extraLine = packSrc.split('\n').find((l) => l.includes('EXTRA_CSS:'));
  const extraCss = extraLine ? JSON.parse(extraLine.replace(/^\s*EXTRA_CSS:\s*/, '').replace(/,\s*$/, '')) : '';
  const cardsCss = fs.readFileSync(path.resolve(__dirname, '../src/mod/page/dfo_item_cards.js'), 'utf8').split('  const CSS = `')[1].split('`;')[0];
  const contCss = fs.readFileSync(path.resolve(__dirname, '../src/mod/page/dfo_container.js'), 'utf8').split('const CSS = `')[1].split('`;')[0];

  const html = `<!doctype html><html data-dfo-pack="1" data-dfo-charcol="v2" data-dfo-container="1" data-dfo-pack-view="rows"><head><meta charset="utf-8">
  <style id="dfo-item-cards-style">${cardsCss}</style>
  <style id="dfo-pack-style">${packCss}\n${extraCss}</style>
  <style id="dfo-container-style">${contCss}</style>
  </head><body>
  <div class="pack-shell paired"><div class="pack-win">
    <header class="pack-id dfo-pack-head"><div><h2 id="hdr-h2"><span class="pack-who">Hero</span></h2></div>
      <div class="dfo-pack-cluster c-tools"><button class="act" id="hdr-sort">Sort</button></div>
      <div class="dfo-pack-cluster c-close"><button class="act dfo-close-btn" id="hdr-close">Close</button></div></header>
    <p class="sheet-notice" id="notice">Notice</p>
    <div class="pack"><div class="pack-main"><div class="charcol"><div class="equipped">
      <div class="statflip"><button class="statflip-btn" id="cc-flip">Stats</button></div>
      <div class="wornmap plus5 v2-grid"><div class="v2-headbar"><div class="wornplaques"><button class="wornac-total"><span class="v" id="cc-ac">18</span></button></div></div>
        <div class="v2-poe-stage"><div class="v2-wep-tabs"><button class="v2-wep-tab on" id="cc-wtab">I</button></div><button class="wornrow is-v2-pure" data-rarity="rare" id="cc-worn"><span class="wornname" id="cc-wname">Cuirass</span></button></div></div>
      <div class="wornshelf"><span class="shelflabel" id="cc-shelf">RINGS</span></div>
      <div class="setstrip"><div class="setline" id="cc-set"><span class="setline-name">Knight</span><span class="setline-count" id="cc-setcnt">2/4</span><span class="setline-stage" id="cc-setstg">ACTIVE</span></div></div>
    </div></div></div>
      <div class="pack-dock">
        <section class="packcol packcats"><div class="packtabs"><button class="packtab" id="tab-off">Weapons <span class="count" id="tab-cnt">4</span></button><button class="packtab on" id="tab-on">Armor <span class="count" id="tab-cnt-on">2</span></button></div></section>
        <section class="packcol packcats is-find"><div class="dfo-find-bar"><input class="dfo-find-input" id="find-in" value="sword"><span class="dfo-find-count" id="find-cnt">3/10</span></div></section>
        <div class="packlists"><div class="packcol">
          <button class="itemrow dfo-item-row salvpick" id="row-salv"><span class="itemname"><span id="row-name">Steel Sword</span></span><span class="salv-mark" id="salv-mark">S</span></button>
        </div></div>
        <div class="stashfoot"><button class="act" id="stash-all">Stash all</button></div>
        <div class="salvagefoot"><span class="salvagecount" id="salv-cnt">Selected: 1</span><button class="act primary" id="salv-go">Salvage (1)</button></div>
      </div>
      <section class="packcol packdetail open packtip dfo-item-host">
        <div class="card dfo-item-card" id="dressed-card" data-rarity="rare" style="--rar:#e4c34f;">
          <div class="card-body">
            <div class="dfo-item-main"><div class="dfo-item-left"><div class="dfo-item-head"><div class="dfo-item-title"><h3 id="dressed-h3">Iron Blade</h3></div></div></div>
              <div class="dfo-item-effects"><ul class="dfo-item-lines"><li><span class="dfo-effect-label" id="eff-lbl">Fire Damage</span> <span class="dfo-effect-value" id="eff-val">+12</span></li></ul></div>
            </div>
            <div class="dfo-item-footer"><div class="dfo-item-text"><p id="item-desc">Forged steel.</p></div><div class="dfo-item-price"><strong class="dfo-item-price-value" id="item-price">250</strong></div></div>
            <div class="walletsheet" id="wallet-sheet"><h4 class="wallet-head" id="wallet-h">Coins</h4><div class="wallet-row"><span class="wallet-k" id="wallet-k">Gold</span><span class="wallet-v" id="wallet-v">500</span></div></div>
          </div>
          <div class="acts"><button class="act primary" id="act-primary">Wear</button><button class="act" id="act-info">Info</button></div>
        </div>
        <p class="iconnote" id="pinned-iconnote">No picture</p>
      </section>
    </div>
    <footer class="packbar dfo-pack-foot" style="min-height:96px;">
      <div class="dfo-bar-panel z-status"><div class="dfo-date-txt"><span class="dfo-date-l1" id="ft-d1">12 Morning Star</span><span class="dfo-date-l2">08:00</span></div><div class="dfo-state-pills"><span class="dfo-chip chip-teal" id="ft-chip">Healthy</span></div></div>
      <div class="dfo-bar-panel z-rep"><div class="dfo-rep-line is-good" id="ft-rep">Daggerfall</div></div>
      <div class="dfo-bar-panel z-curr"><div class="dfo-curr-grid"><div class="dfo-curr-chip is-gold"><span class="v" id="ft-gold">1,250</span></div><button class="act goldbtn" id="ft-goldbtn">Drop gold</button></div></div>
      <div class="dfo-bar-panel z-carry"><div class="packcarry"><span class="v" id="ft-carry">12 / 75</span></div></div>
      <form class="goldfield" id="gold-form"><input type="text" value="100" id="gold-input"><div class="goldacts"><button class="act primary goldgo" id="gold-go">Drop</button></div></form>
    </footer>
  </div>
  <aside class="loot-win" data-dfo-loot-kind="container"><p class="sheet-notice" id="c-notice">Cannot take</p><section class="packcol packremote">
    <div class="remotehead"><span class="remotewho"><h3 id="c-h3">Chest</h3></span><div class="piletabs"><button class="piletab" id="pile-off">Body 1</button></div><div class="dfo-loot-actions"><button class="act dfo-ornate-btn primary" id="c-takeall">Take all</button><button class="act dfo-ornate-btn dfo-close-btn" id="c-close">Close</button></div></div>
    <div class="dfo-loot-utilbar"><div class="dfo-loot-util-left"><div class="dfo-loot-dd is-open"><button class="dfo-loot-dd-btn" id="c-dd-btn">All</button><div class="dfo-loot-dd-menu"><button class="dfo-loot-dd-opt" id="c-dd-opt">Weapons</button></div></div><button class="dfo-loot-sort" id="c-sort">Sort</button></div><div class="dfo-loot-search"><input class="storesearch" id="c-search" value="sword"></div></div>
    <div class="remotelist"><button class="itemrow dfo-item-row" data-rarity="rare" id="c-row"><span class="itemname"><span>Axe</span></span></button></div>
  </section></aside>
  <aside class="loot-win fate dfo-fate-win" data-dfo-loot-kind="fate"><section class="packcol packremote fatecol"><div class="fate-confirm dfo-fate-confirm is-kill" id="ft-conf"><p class="dfo-fate-confirm-txt" id="ft-ctxt">Confirm?</p></div></section></aside></div>
  <div class="wplaque dfo-quick has-list" id="wp-box"><div class="wplaque-title" id="wp-title">Chest</div><div class="wplaque-list"></div><div class="wplaque-stats dfo-quick-card" data-rarity="rare" id="wp-card"><div class="dfo-quick-name" id="wp-name">Blade</div></div></div>
  <div class="dfo-status-tip is-seal-summary" id="st-tip"><div class="dfo-st-head" id="st-head">Currencies</div><div class="dfo-st-intro" id="st-intro">Summary</div></div>
  <dialog class="dfo-pack-dialog" open id="pack-dlg"><div class="dfo-pack-dhead"><span class="dfo-pack-dtitle" id="dlg-title">Sort Settings</span></div><div class="dfo-pack-dfoot"><button class="dfo-pack-btn dfo-pack-primary" id="dlg-btn">Apply</button></div></dialog>
  <div class="dfo-loot-modal-backdrop"><div class="dfo-loot-modal-box"><div class="dfo-loot-modal-head"><h3 id="c-mod-h3">Quantity</h3></div><div class="dfo-loot-modal-foot"><button class="dfo-ornate-btn dfo-loot-modal-btn" id="c-mod-btn">Take</button></div></div></div>
  <div class="inv-menu" role="menu" id="ctx-menu" style="left:10px;top:10px;"><p class="inv-menu-head" id="ctx-head">Ruby</p><button class="inv-menu-item primary" id="ctx-primary">Set in...</button></div>
  <div class="inv-info inv-target" id="tgt-modal"><div class="card"><div class="inv-info-box"><p class="center" id="tgt-p1">Ruby</p><p class="center" id="tgt-p2">Set in...</p></div><div class="inv-info-body"><button class="inv-menu-item" id="tgt-opt">Set in Sword</button></div><div class="acts"><button class="act" id="tgt-cancel">Cancel</button></div></div></div>
  <div class="inv-info inv-destroy" id="destroy-modal"><div class="card" id="destroy-card"><div class="inv-info-box"><p id="destroy-p1">Destroy?</p><p class="center salvagenames" id="salv-names">Iron Sword</p></div><div class="acts"><button class="act primary" id="destroy-yes">Destroy</button></div></div></div>
  <pre id="out"></pre>
  <script type="module">
    const st = await import('/assets/${stFile}');
    st.n(document);
    await new Promise(r => setTimeout(r, 150));
    const ids = ['hdr-h2','hdr-sort','hdr-close','cc-flip','cc-ac','cc-wtab','cc-worn','cc-shelf','cc-set','cc-setstg','notice','tab-off','tab-on','tab-cnt','tab-cnt-on','find-in','find-cnt','row-name','salv-mark','stash-all','salv-go','dressed-card','dressed-h3','eff-lbl','eff-val','item-desc','item-price','wallet-h','wallet-v','act-primary','pinned-iconnote','ft-d1','ft-chip','ft-rep','ft-gold','ft-goldbtn','ft-carry','st-head','st-intro','dlg-title','dlg-btn','gold-go','ctx-head','ctx-primary','tgt-p1','tgt-p2','destroy-p1','salv-names','destroy-yes','c-h3','c-notice','pile-off','c-dd-btn','c-dd-opt','c-sort','c-takeall','c-close','c-search','c-mod-h3','c-mod-btn','ft-conf','ft-ctxt','wp-title','wp-card','wp-name'];
    const out = {};
    for (const id of ids) {
      const cs = getComputedStyle(document.getElementById(id));
      out[id] = { fs: cs.fontSize, c: cs.color, bg: cs.backgroundColor, bgi: cs.backgroundImage, bi: cs.borderImageSource, padT: cs.paddingTop };
    }
    const pip = getComputedStyle(document.getElementById('c-row'), '::before');
    out['c-row-pip'] = { fs: pip.fontSize };
    document.getElementById('out').textContent = JSON.stringify(out);
  </script></body></html>`;

  const server = http.createServer((req, res) => {
    const urlPath = req.url.split('?')[0];
    if (urlPath === '/probe.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(html); }
    const fp = path.join(distDir, urlPath.replace(/^\//, ''));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.writeHead(200, { 'Content-Type': path.extname(fp) === '.js' ? 'application/javascript' : 'application/octet-stream' });
      return fs.createReadStream(fp).pipe(res);
    }
    res.writeHead(404); res.end();
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const runUrl = (url) => new Promise((resolve, reject) => {
    execFile(process.env.CHROMIUM_BIN, ['--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1366,768', '--virtual-time-budget=2500', '--dump-dom', url], { encoding: 'utf8', timeout: 25000, maxBuffer: 20 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err); else resolve(stdout);
    });
  });

  try {
    for (const q of ['?dress=grimoire', '?dress=plus']) {
      const dom = await runUrl(`http://127.0.0.1:${port}/probe.html${q}`);
      const m = /<pre id="out">([\s\S]*?)<\/pre>/.exec(dom);
      assert.ok(m, `Chrome rendered real enhancedStyle (${q})`);
      const s = JSON.parse(m[1]);
      assert.ok(s['hdr-h2'].fs === '18px' && s['hdr-h2'].c === 'rgb(246, 231, 176)', `header title keeps 18px gold (${q})`);
      assert.ok(s['hdr-sort'].bgi.includes('linear-gradient') && s['hdr-sort'].fs === '11px', `header Sort button intact (${q})`);
      assert.ok(s['hdr-close'].bgi.includes('repeating-linear-gradient') && s['hdr-close'].fs === '11px', `header Close hatch intact (${q})`);
      assert.equal(s['ft-d1'].fs, '14.5px', `footer date line 1 keeps 14.5px (${q})`);
      assert.equal(s['ft-chip'].fs, '10.5px', `footer status chip keeps 10.5px (${q})`);
      assert.equal(s['ft-rep'].fs, '13.5px', `footer rep line keeps 13.5px (${q})`);
      assert.ok(s['ft-gold'].fs === '14.5px' && s['ft-gold'].c === 'rgb(245, 212, 81)', `footer gold counter keeps 14.5px gold (${q})`);
      assert.equal(s['ft-goldbtn'].fs, '9.5px', `footer z-curr goldbtn keeps 9.5px (${q})`);
      assert.equal(s['ft-carry'].fs, '16.5px', `footer carry weight keeps 16.5px (${q})`);
      assert.ok(s['st-head'].fs === '13px' && s['st-head'].c === 'rgb(245, 212, 81)', `status tooltip header keeps 13px gold (${q})`);
      assert.ok(s['dlg-title'].fs === '15.5px' && s['dlg-title'].c === 'rgb(246, 231, 176)', `pack dialog title keeps 15.5px gold (${q})`);
      assert.equal(s['dlg-btn'].fs, '12.5px', `pack dialog button keeps 12.5px (${q})`);
      assert.ok(s['c-h3'].fs === '16.5px' && s['c-h3'].c === 'rgb(246, 231, 176)', `container header title keeps 16.5px gold (${q})`);
      assert.ok(s['c-dd-opt'].fs === '11.5px' && s['c-dd-opt'].c === 'rgb(233, 228, 217)', `container dropdown option keeps 11.5px readable (${q})`);
      assert.ok(s['c-mod-h3'].fs === '14.5px' && s['c-mod-h3'].c === 'rgb(246, 231, 176)', `container qty modal title keeps 14.5px gold (${q})`);
      assert.equal(s['c-mod-btn'].fs, '12.5px', `container qty modal button keeps 12.5px (${q})`);
      assert.equal(s['c-row-pip'].fs, '8px', `container rarity pips stay 8px instead of 16px (${q})`);
      assert.ok(s['cc-flip'].fs === '10px' && s['cc-flip'].c === 'rgb(232, 220, 192)' && s['cc-flip'].bgi.includes('linear-gradient'), `charcol statflip button defeats Grimoire parchment (${q})`);
      assert.ok(s['cc-ac'].fs === '14px' && s['cc-ac'].c === 'rgb(245, 212, 81)', `charcol AC badge stays 14px gold (${q})`);
      assert.equal(s['cc-wtab'].fs, '9.5px', `charcol weapon preset tab keeps 9.5px (${q})`);
      assert.equal(s['cc-worn'].padT, '0px', `charcol V2 pure icon slot keeps 0px padding (${q})`);
      assert.ok(s['cc-shelf'].fs === '9.5px' && s['cc-shelf'].c === 'rgb(183, 160, 113)', `charcol shelf label keeps 9.5px sand (${q})`);
      assert.ok(s['cc-set'].fs === '11px' && s['cc-set'].c === 'rgb(232, 220, 198)', `charcol setline keeps 11px light ink (${q})`);
      assert.ok(s['cc-setstg'].fs === '9.5px' && s['cc-setstg'].c === 'rgb(199, 185, 158)', `charcol setline stage keeps 9.5px (${q})`);
      assert.equal(s['st-intro'].fs, '11px', `gear summary tooltip intro keeps 11px (${q})`);
      assert.ok(s['ft-conf'].c === 'rgb(241, 230, 200)' && s['ft-ctxt'].fs === '12.5px', `fate confirm box stays readable (${q})`);
      assert.ok(s['wp-title'].c === 'rgb(246, 231, 176)' && s['wp-card'].c === 'rgb(233, 228, 217)' && s['wp-name'].c === 'rgb(228, 195, 79)', `quick-loot plaque & card stay readable (${q})`);
      assert.equal(s['notice'].c, 'rgb(255, 208, 200)', `sheet-notice readable (${q})`);
      assert.ok(s['tab-off'].bgi.includes('linear-gradient') && s['tab-off'].fs === '11px' && s['tab-off'].c === 'rgb(178, 167, 142)', `category tab defeats Grimoire tan tab & 16px snap (${q})`);
      assert.ok(s['tab-on'].bgi.includes('linear-gradient') && s['tab-on'].c === 'rgb(246, 231, 176)', `active category tab stays dark brass (${q})`);
      assert.equal(s['tab-cnt'].fs, '10px', `tab count stays 10px (${q})`);
      assert.equal(s['tab-cnt-on'].c, 'rgb(245, 212, 81)', `active tab count stays gold (${q})`);
      assert.equal(s['find-in'].fs, '13px', `Find input stays 13px (${q})`);
      assert.equal(s['find-cnt'].fs, '11.5px', `Find counter stays 11.5px (${q})`);
      assert.equal(s['tgt-p1'].c, 'rgb(246, 231, 176)', `inv-target title stays gold (${q})`);
      assert.ok(s['tgt-p2'].fs === '12px' && s['tgt-p2'].c === 'rgb(183, 168, 137)', `inv-target subtitle stays muted 12px (${q})`);
      assert.ok(s['c-notice'].c === 'rgb(255, 208, 198)' && s['c-notice'].fs === '12px', `container sheet-notice readable (${q})`);
      assert.equal(s['pile-off'].fs, '11.5px', `container piletab stays 11.5px (${q})`);
      assert.equal(s['c-dd-btn'].fs, '11.5px', `container dropdown button stays 11.5px (${q})`);
      assert.equal(s['c-sort'].fs, '11.5px', `container sort button stays 11.5px (${q})`);
      assert.equal(s['row-name'].fs, '15px', `itemrow title not snapped to 16px (${q})`);
      assert.ok(s['stash-all'].bgi.includes('linear-gradient') && s['stash-all'].fs === '12px', `Stash all ornate button intact (${q})`);
      assert.ok(s['salv-go'].bgi.includes('repeating-linear-gradient') && s['salv-go'].fs === '12px', `Salvage CTA intact (${q})`);
      assert.equal(s['dressed-card'].bi, 'none', `item card strips Grimoire border-image (${q})`);
      assert.equal(s['dressed-h3'].fs, '22px', `item card h3 stays 22px (${q})`);
      assert.equal(s['eff-lbl'].c, 'rgb(237, 213, 164)', `effect label stays bright gold (${q})`);
      assert.equal(s['eff-val'].c, 'rgb(243, 242, 237)', `effect value stays bright white (${q})`);
      assert.equal(s['item-desc'].c, 'rgb(196, 198, 202)', `description stays readable light gray (${q})`);
      assert.equal(s['item-price'].fs, '21px', `price stays 21px (${q})`);
      assert.equal(s['item-price'].c, 'rgb(245, 212, 81)', `price stays bright gold (${q})`);
      assert.equal(s['wallet-h'].c, 'rgb(246, 231, 176)', `wallet heading readable (${q})`);
      assert.equal(s['wallet-v'].c, 'rgb(245, 212, 81)', `wallet figure stays gold (${q})`);
      assert.equal(s['act-primary'].fs, '12px', `pinned card primary button stays 12px (${q})`);
      assert.equal(s['pinned-iconnote'].c, 'rgb(183, 168, 137)', `iconnote stays readable (${q})`);
      assert.equal(s['gold-go'].fs, '11px', `gold Drop button stays 11px (${q})`);
      assert.equal(s['ctx-head'].fs, '13.5px', `context menu head stays 13.5px (${q})`);
      assert.equal(s['ctx-primary'].c, 'rgb(253, 230, 138)', `context menu primary stays gold (${q})`);
      assert.equal(s['destroy-p1'].c, 'rgb(246, 231, 176)', `inv-info modal title readable (${q})`);
      assert.equal(s['salv-names'].c, 'rgb(183, 168, 137)', `salvagenames readable (${q})`);
      assert.ok(s['destroy-yes'].bgi.includes('repeating-linear-gradient'), `destroy confirm crimson hatch intact (${q})`);
      assert.ok(s['c-takeall'].bgi.includes('linear-gradient') && s['c-takeall'].fs === '12px', `container Take all intact (${q})`);
      assert.ok(s['c-close'].bgi.includes('repeating-linear-gradient') && s['c-close'].fs === '12px', `container Close hatch intact (${q})`);
      assert.equal(s['c-search'].c, 'rgb(246, 231, 176)', `container search input readable (${q})`);
    }
  } finally {
    server.close();
  }
});
