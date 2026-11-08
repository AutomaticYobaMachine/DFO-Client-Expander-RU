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
  assert.deepEqual(R.cleanSettings({ view: 'nonsense', autoSort: 0, junk: { tags: ['a', 'a', 5, ''], items: 'x' }, extra: { item: {} } }),
    { v: 1, view: 'rows', autoSort: true, junk: { tags: ['a'], items: [] } });
  assert.equal(R.cleanSettings({ autoSort: false }).autoSort, false);
  assert.equal(R.cleanSettings({ view: 'grid' }).view, 'grid');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfo-pack-test-'));
  try {
    const store = createLootStore(dir);
    assert.equal(store.packState().revision, 0);
    const saved = store.savePack({ ...store.packState(), view: 'grid', junk: { tags: ['state:stolen'], items: [] } });
    assert.equal(saved.revision, 1);
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
  assert.deepEqual(EXPECTED.inventory, ['inventory.pages', 'inventory.view', 'inventory.receipt']);
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
  assert.deepEqual([...found.entries()].sort(), [['inventory.pages', 1], ['inventory.receipt', 1], ['inventory.view', 1]]);
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
