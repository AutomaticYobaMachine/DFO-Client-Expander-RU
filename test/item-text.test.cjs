'use strict';
// Item description locales and the sentence generator: every known template and every property the game's catalogues
// allow has a sentence in both languages; Russian has all four forms; hidden properties stay hidden; the page gets the
// Russian locale only with the translation installed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const text = require('../src/mod/item-text.cjs');
const { describe, keysFor, KINDS } = require('../src/mod/page/dfo_item_text.js');
const { injectPage } = require('../src/mod/transforms.cjs');

const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/item-field-catalog.json'), 'utf8'));
const en = text.loadLocale(path.join(text.ROOT, 'en'));
const ru = text.loadLocale(path.join(text.ROOT, 'ru'));

/** Every property key the generator can ask for, from the game's own catalogues (docs/item-field-catalog.json). */
function expectedKeys() {
  const keys = new Set();
  const add = key => keys.add(key);
  for (const m of ['iron', 'steel', 'silver', 'elven', 'dwarven', 'mithril', 'adamantium', 'ebony', 'orcish', 'daedric', 'leather', 'chain', 'fur', 'cloth']) add(`material.${m}`);
  add('construction.mail'); add('construction.brigandine');
  for (const tier of Object.keys(catalog.enums.rarities)) if (tier !== 'common') add(`rarity.${tier}`);
  for (const k of ['exalted', 'perfect', 'imbued']) add(`rarity.${k}`);
  catalog.records.qualityNames.forEach((_, i) => add(`craft.quality.${i}`));
  for (const k of ['craft.maker', 'craft.marked', 'heirloom', 'heirloom.house', 'affix.honed', 'affix.reforged']) add(k);
  for (const [id, kind] of Object.entries(catalog.enums.affixes)) {
    if (kind.technique) { for (const t of kind.params) add(`technique.${t}`); continue; }
    if (id === 'skill') { for (const s of kind.params) add(`skill.${s}`); continue; }
    if (kind.params) for (const p of kind.params) add(`affix.${id}.${p}`);
    else add(`affix.${id}`);
  }
  for (const e of catalog.records.enchants) {
    if (e.type < 0) continue;
    if (e.type === 10) { for (const p of e.params) add(`skill.${p.value}`); }
    add(`enchantment.${e.type}`);
  }
  for (const p of catalog.records.powers) add(`power.${p.id}`);
  for (const g of catalog.records.gilded) add(`power.${g.id}`);
  // Legendaries registered after the catalogue was made, seen in the published release (systems/pass/resonantMaul.js).
  for (const id of ['resonant-maul']) add(`power.${id}`);
  add('power.imprint');
  for (const s of catalog.enums.sigilSets) add(`sigil.set.${s}`);
  catalog.enums.sigilStages.forEach((_, i) => add(`sigil.stage.${i}`));
  add('sigil.power');
  for (const g of catalog.enums.gemKinds) add(`socket.gem.${g}`);
  add('socket.empty');
  for (const k of ['curse.cursed', 'curse.damned', 'content.potion', 'content.potent', 'content.soul', 'content.poison',
    'food.noRot', 'food.slowRot', 'food.chef', 'condition.new', 'condition.used', 'condition.worn', 'condition.battered',
    'condition.broken', 'state.unidentified', 'state.quest', 'state.stolen', 'state.bound', 'state.summoned',
    'state.keepsake', 'state.remains']) add(k);
  Object.values(catalog.records.foodStages ?? catalog.enums.foodStages ?? {}).forEach(i => add(`food.stage.${i}`));
  for (let i = 0; i < 10; i++) add(`dye.${i}`);   // DYE_COLORS: the ten cloth colours a garment is minted with
  return keys;
}
/** An enchantment's optional per-parameter sentences: only parameters the catalogue lists for that type. */
const enchantParams = new Map(catalog.records.enchants.map(e => [e.type, new Set(e.params.map(p => p.value))]));

test('both locales are valid tables with the same keys and the forms each language needs', () => {
  assert.deepEqual(en.forms, ['s', 'p']);
  assert.deepEqual(ru.forms, ['m', 'f', 'n', 'p']);
  assert.deepEqual(Object.keys(ru.bases).sort(), Object.keys(en.bases).sort());
  assert.deepEqual(Object.keys(ru.properties).sort(), Object.keys(en.properties).sort());
  for (const [key, row] of Object.entries(ru.properties)) {
    for (const form of ru.forms) assert.ok(row[form], `${key}: Russian ${form} form is required`);
    assert.ok(new Set(Object.values(row)).size >= 1);
  }
  for (const [key, row] of Object.entries(en.properties)) assert.ok(row.s, `${key}: English singular is required`);
  for (const [key, base] of Object.entries(ru.bases)) assert.ok(['m', 'f', 'n', 'p'].includes(base.form), `${key} gender`);
  for (const [key, base] of Object.entries(en.bases)) assert.ok(['s', 'p'].includes(base.form), `${key} number`);
});

test('every known item template has a base sentence and a Russian gender', () => {
  const known = catalog.knownPublicTemplates.map(t => String(t.index)).sort();
  assert.equal(known.length, 483);
  for (const pack of [en, ru]) {
    const keys = Object.keys(pack.bases).filter(k => /^\d+$/.test(k)).sort();
    assert.deepEqual(keys, known, `${pack.locale} covers exactly the known templates`);
  }
  // A template shown under one English name has one Russian gender everywhere (duplicated clothing rows).
  const byName = new Map();
  for (const [key, base] of Object.entries(ru.bases)) {
    const name = base.name;
    if (byName.has(name)) assert.equal(byName.get(name), base.form, `${name} (${key}) has one gender`);
    byName.set(name, base.form);
  }
});

test('Russian genders agree with the item-name grammar the RU runtime already uses', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/mod/page/ru_items.js'), 'utf8');
  const start = src.indexOf('const BASE = {');
  const body = src.slice(src.indexOf('{', start), src.indexOf('};', start) + 1);
  const BASE = new Function('M', 'F', 'N', 'P', `return (${body});`)('m', 'f', 'n', 'p');
  const genders = new Map(Object.values(ru.bases).map(b => [b.name, b.form]));
  let checked = 0;
  for (const [english, [name, gender]] of Object.entries(BASE)) {
    if (!genders.has(name)) continue;
    checked++;
    assert.equal(genders.get(name), gender, `${english} / ${name}`);
  }
  assert.ok(checked >= 90, `checked ${checked} shared names`);
});

test('every property the game catalogues allow has a sentence, and no sentence is unreachable', () => {
  const expected = expectedKeys();
  for (const pack of [en, ru]) {
    for (const key of expected) assert.ok(Object.hasOwn(pack.properties, key), `${pack.locale}: missing ${key}`);
    for (const key of Object.keys(pack.properties)) {
      if (expected.has(key)) continue;
      const m = /^enchantment\.(\d+)\.(\d+)$/.exec(key);
      assert.ok(m && enchantParams.get(+m[1])?.has(+m[2]), `${pack.locale}: ${key} is not reachable from any catalogued property`);
    }
  }
});

test('sentences agree with the base item: Russian gender and plural, English number', () => {
  const steel = { known: true, material: 'steel' };
  const say = (pack, item, facts = steel) => describe(pack, item, facts).map(s => s.text);
  assert.match(say(ru, { group: 'Armor', templateIndex: 102 })[1], /^Она выкована/);       // кираса
  assert.match(say(ru, { group: 'Armor', templateIndex: 107 })[1], /^Он выкован/);         // шлем
  assert.match(say(ru, { group: 'Armor', templateIndex: 105 })[1], /^Оно выковано/);       // наплечье
  assert.match(say(ru, { group: 'Armor', templateIndex: 103 })[1], /^Они выкованы/);       // латные перчатки
  assert.match(say(en, { group: 'Armor', templateIndex: 103 })[1], /^They are forged/);
  assert.match(say(en, { group: 'Armor', templateIndex: 102 })[1], /^It is forged/);
  // A group-specific row wins over the template's own (keys like "Deeds:0" are allowed by the loader).
  const pack = { ...ru, bases: { ...ru.bases, 'Deeds:0': { name: 'Грамота', form: 'f', text: 'Грамота.' } } };
  assert.equal(describe(pack, { group: 'Deeds', templateIndex: 0 }, {})[0].text, 'Грамота.');
  assert.equal(describe(pack, { group: 'Gems', templateIndex: 0 }, {})[0].text, ru.bases['0'].text);
});

test('an unidentified piece says its tier and state, never its hidden lines', () => {
  const item = Object.freeze({ group: 'Weapons', templateIndex: 121, rarity: 'legendary', exalted: true, legendary: 'warp-edge',
    affixes: Object.freeze([Object.freeze({ id: 'damage', value: 30 })]), enchantments: Object.freeze([Object.freeze({ type: 2, param: 20 })]),
    cursed: Object.freeze({ type: 21, param: 0 }), sockets: Object.freeze(['ruby']), sigil: Object.freeze({ set: 'ruhn', xp: 40000 }) });
  const hidden = describe(ru, item, { known: false }).map(s => s.key);
  assert.deepEqual(hidden, ['base', 'rarity.exalted', 'state.unidentified']);
  const known = describe(ru, item, { known: true }).map(s => s.key);
  for (const key of ['affix.damage', 'enchantment.2', 'power.warp-edge', 'sigil.set.ruhn', 'sigil.stage.4', 'socket.gem.ruby', 'curse.damned']) {
    assert.ok(known.includes(key), `${key} once identified`);
  }
  assert.ok(!known.includes('state.unidentified'));
  // A Perfect Rare and a curse are words of an identified piece only.
  const rare = { group: 'Weapons', templateIndex: 120, rarity: 'rare', affixes: [{ id: 'damage', value: 25 }], cursed: { type: 25, param: 0 } };
  assert.ok(!describe(en, rare, { known: false, perfect: true }).some(s => s.key === 'rarity.perfect' || s.key.startsWith('curse')));
  assert.deepEqual(describe(en, rare, { known: true, perfect: true }).filter(s => s.kind === 'rarity' || s.kind === 'curse').map(s => s.key), ['rarity.perfect', 'curse.cursed']);
  // Without facts nothing is guessed: no material from the raw code, nothing magical without identification.
  assert.ok(!describe(en, { group: 'Weapons', templateIndex: 120, material: 9 }).some(s => s.kind === 'material'));
});

test('the generator orders, limits and deduplicates sentences, and never writes to the item', () => {
  const item = { group: 'Weapons', templateIndex: 120, rarity: 'rare', currentCondition: 0, maxCondition: 100, stolen: true,
    affixes: [{ id: 'skill', param: 29, value: 10 }, { id: 'stat', param: 'luck', value: 4 }, { id: 'resist', param: 'fire', value: 1, gem: 'ruby' }],
    enchantments: [{ type: 10, param: 29 }, { type: 3, param: 4 }, { type: 0, param: 7 }, { type: 0, param: 8 }, { type: 99, param: 1 }],
    quality: 4, maker: 'Mak\u0000er\u2028', sockets: ['empty', 'flawless-ruby', 'chipped-ruby'] };
  const before = JSON.stringify(item);
  const out = describe(en, item, { known: true, material: 'Steel' });
  assert.equal(JSON.stringify(item), before);
  const keys = out.map(s => s.key);
  assert.equal(keys.filter(k => k === 'skill.29').length, 1, 'skill line and skill enchantment share one sentence');
  assert.equal(keys.filter(k => k === 'enchantment.0').length, 1, 'two spells of one trigger: one sentence');
  assert.ok(keys.includes('enchantment.3.4'), 'a parameter sentence before its type');
  assert.ok(!keys.some(k => k.startsWith('affix.resist')), "a socketed gem's line is the socket's");
  assert.deepEqual(keys.filter(k => k.startsWith('socket')), ['socket.gem.ruby', 'socket.empty']);
  assert.ok(out.find(s => s.key === 'craft.maker').text.endsWith('Maker.'), 'controls are dropped from a stored name');
  const order = out.map(s => KINDS.indexOf(s.kind));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'sentences in kind order');
  assert.equal(keys[0], 'base');
  assert.equal(describe(en, item, { known: true }, { max: 2 }).length, 2);
  assert.deepEqual(describe(en, item, { known: true }, { kinds: ['state'] }).map(s => s.key), ['state.stolen']);
  assert.ok(!describe(en, item, { known: true }, { skip: ['base', 'condition'] }).some(s => s.kind === 'base' || s.kind === 'condition'));
  // A template the tables do not know has no grammatical form: no description at all.
  assert.deepEqual(describe(ru, { group: 'UselessItems2', templateIndex: 65000, stolen: true }, { known: true }), []);
  // A sentence whose value is missing is skipped rather than said with a hole.
  assert.ok(!describe(en, { group: 'Jewellery', templateIndex: 135, heirloom: { house: '' } }, { known: true }).some(s => /\{/.test(s.text)));
  assert.ok(keysFor(item, { known: true }).includes('skill.29'));
});

test('the page gets Russian only with the translation installed, and the scripts load before the card', () => {
  assert.equal(text.chooseLocale(true), 'ru');
  assert.equal(text.chooseLocale(false), 'en');
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'dfo-item-text-'));
  try {
    fs.mkdirSync(path.join(empty, 'en'));
    assert.equal(text.chooseLocale(true, empty), 'en', 'an install without the Russian files speaks English');
    const broken = text.bundle('en', empty);
    assert.match(broken, /__dfoItemTextPack=null/);
  } finally { fs.rmSync(empty, { recursive: true, force: true }); }
  for (const locale of ['en', 'ru']) {
    const script = text.bundle(locale);
    const win = {};
    new Function('globalThis', script)(win);
    assert.equal(win.__dfoItemTextPack.locale, locale);
    assert.equal(Object.keys(win.__dfoItemTextPack.bases).length, 483);
    assert.deepEqual(text.localeFiles(locale).filter(f => f.endsWith('.csv')).length,
      JSON.parse(fs.readFileSync(path.join(text.ROOT, locale, 'index.json'))).bases.length + JSON.parse(fs.readFileSync(path.join(text.ROOT, locale, 'index.json'))).properties.length);
  }
  const html = '<html><head></head><body><script type="module" src="x.js"></script></body></html>';
  const on = injectPage(html, './', { itemCards: true });
  assert.ok(on.indexOf('dfo_item_text_data.js') < on.indexOf('dfo_item_text.js'));
  assert.ok(on.indexOf('dfo_item_text.js') < on.indexOf('dfo_item_cards.js'));
  assert.doesNotMatch(injectPage(html, './', { itemCards: false }), /dfo_item_text/);
});

test('the hook serves the chosen locale as data and the runtime exposes it to the page', async () => {
  const { wrap } = require('../src/mod/hook.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfo-item-text-hook-'));
  try {
    fs.writeFileSync(path.join(dir, 'dfo-mod.json'), JSON.stringify({ ru: true, marks: false, nearbyLoot: false, dungeons: false, itemCards: true }));
    const handle = wrap(async () => new Response('<html><head></head><body></body></html>', { headers: { 'Content-Type': 'text/html' } }), { app: { getPath: () => dir } });
    const page = await (await handle(new Request('dagger://game/play/index.html'))).text();
    assert.match(page, /dfo_item_text_data\.js/);
    // The source tree has no built Russian dictionary, so the hook treats the translation as not installed.
    assert.match(page, /"itemText":\{"locale":"en"\}/);
    const data = await handle(new Request('dagger://game/dfo-mod/dfo_item_text_data.js'));
    assert.equal(data.status, 200);
    const runtime = await (await handle(new Request('dagger://game/dfo-mod/dfo_item_text.js'))).text();
    const win = { document: {} };
    new Function('globalThis', await data.text())(win);
    new Function('globalThis', 'module', runtime)(win, undefined);
    assert.equal(win.__dfoItemText.locale, 'en');
    assert.match(win.__dfoItemText.text({ group: 'Armor', templateIndex: 103 }, { known: true, material: 'steel' }), /^Armoured gloves.* They are forged/);
    assert.equal(win.__dfoItemText.stats().bases, 483);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
