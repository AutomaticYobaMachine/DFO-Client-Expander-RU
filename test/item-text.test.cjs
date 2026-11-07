'use strict';
// Item description locales and the sentence generator: every known template and every property the game's catalogues
// allow has a sentence in both languages; Russian has all four forms; hidden properties stay hidden; the page gets the
// Russian locale only with the translation installed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const text = require('../src/mod/item-text.cjs');
const { describe, keysFor, variantOf, categoryOf, seedOf, paragraphs } = require('../src/mod/page/dfo_item_text.js');
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
    'condition.broken', 'state.unidentified', 'state.stolen', 'state.bound', 'state.summoned',
    'state.keepsake', 'state.remains']) add(k);
  // The player hint: the piece's state's advice, every base item's own (hints.json), and the silver sentences.
  for (const k of HINT_STATES) add(k);
  for (const k of Object.values(ru.hints.templates)) add(k);
  for (const kind of new Set(Object.values(ru.hints.silver))) add(`hint.silver.${kind}`);
  add('hint.silver.writ.guild'); add('hint.sell');
  Object.values(catalog.records.foodStages ?? catalog.enums.foodStages ?? {}).forEach(i => add(`food.stage.${i}`));
  for (let i = 0; i < 10; i++) add(`dye.${i}`);   // DYE_COLORS: the ten cloth colours a garment is minted with
  return keys;
}
/** The hints a piece's state gives before its base item's own (dfo_item_text.js hintKey). */
const HINT_STATES = ['hint.quest', 'hint.unidentified', 'hint.cursed', 'hint.damned', 'hint.repair', 'hint.artifact', 'hint.aetheric',
  'hint.legendary', 'hint.exalted', 'hint.set', 'hint.sigil', 'hint.crafted', 'hint.rare', 'hint.magic', 'hint.enchanted',
  'hint.food.spoiled', 'hint.soul.filled'];
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

const ALL = { all: true };
const METAL_IDS = ['iron', 'steel', 'silver', 'elven', 'dwarven', 'mithril', 'adamantium', 'ebony', 'orcish', 'daedric'];
/** The frames each armour template can take: classic pieces and shields are leather, chain or plate (raw material
 *  0, 256/259, 512+metal); Roleplay & Realism's chain set adds mail of a metal, its light set fur and brigandine. */
const ARMOR_VARIANTS = new Map([
  ...[102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112].map(t => [t, ['leather', 'chain', 'plate']]),
  ...[515, 516, 517, 518, 519].map(t => [t, ['leather', 'chain', 'mail']]),
  ...[520, 521, 522, 523, 524, 525, 526].map(t => [t, ['leather', 'fur', 'brigandine']]),
]);
const LEGENDARY_IDS = [...catalog.records.legendaries.map(r => r.id), ...catalog.records.gilded.map(r => r.id), 'resonant-maul'];
/** Words as a reader counts them: anything with a letter or digit; a placeholder is one word. */
const words = text => text.split(/\s+/).filter(w => /[\p{L}\p{N}{]/u.test(w)).length;

test('sentences agree with the base item: Russian gender and plural, English number', () => {
  const say = (pack, item, facts) => describe(pack, item, facts, ALL).map(s => s.text);
  const steel = { known: true };
  // Jewellery and clothing have no frame: the property sentences carry the base's form.
  assert.match(say(ru, { group: 'Jewellery', templateIndex: 135, rarity: 'magic' }, steel)[1], /^На нём/);        // кольцо
  assert.match(say(ru, { group: 'Jewellery', templateIndex: 138, rarity: 'magic' }, steel)[1], /^На ней/);        // гривна
  assert.match(say(ru, { group: 'Jewellery', templateIndex: 133, rarity: 'magic' }, steel)[1], /^На нём/);        // амулет
  // A garment's colour agrees with it in its first sentence (slot 1), the base and the dye said together.
  assert.match(say(ru, { group: 'MensClothing', templateIndex: 143, dye: 2 }, steel)[0], /^Красное акавирское кимоно/);  // кимоно
  assert.match(say(ru, { group: 'MensClothing', templateIndex: 141, dye: 2 }, steel)[0], /^Красные кожаные ремни/);      // ремни
  assert.match(say(ru, { group: 'WomensClothing', templateIndex: 184, dye: 6 }, steel)[0], /^Свободная белая деревенская блуза/);
  assert.match(say(ru, { group: 'MensClothing', templateIndex: 145, dye: 8 }, steel)[0], /^Широкий жёлтый пояс/);
  assert.match(say(en, { group: 'MensClothing', templateIndex: 141, dye: 2 }, steel)[0], /^Red leather straps/);
  assert.match(say(en, { group: 'MensClothing', templateIndex: 143, dye: 2 }, steel)[0], /^A red Akaviri robe/);
  // A Legendary's own sentence takes the base's name and form.
  const legend = (pack, item) => describe(pack, item, { known: true }, ALL).find(f => f.category === 'power').text;
  assert.match(legend(ru, { group: 'Armor', templateIndex: 103, rarity: 'legendary', legendary: 'gauntlets-of-the-rose' }), /^Эти боевые перчатки Розы бьют/);
  assert.match(legend(ru, { group: 'Weapons', templateIndex: 128, legendary: 'graveward' }), /^Эта секира упокаивает/);
  assert.match(legend(en, { group: 'Weapons', templateIndex: 120, legendary: 'wyrmbane' }), /^This longsword, made/);
  // A group-specific row wins over the template's own (keys like "Deeds:0" are allowed by the loader).
  const pack = { ...ru, bases: { ...ru.bases, 'Deeds:0': { name: 'Грамота', form: 'f', text: 'Грамота.' } } };
  assert.equal(describe(pack, { group: 'Deeds', templateIndex: 0 }, {})[0].text, 'Грамота.');
  assert.equal(describe(pack, { group: 'Gems', templateIndex: 0 }, {})[0].text, ru.bases['0'].text);
});

test('every weapon and armour piece has a frame for each type it can be, and every metal a phrase', () => {
  const weapons = catalog.knownPublicTemplates.filter(t => t.groups.includes('Weapons')).map(t => t.index);
  const armour = catalog.knownPublicTemplates.filter(t => t.groups.includes('Armor')).map(t => t.index);
  assert.deepEqual([...ARMOR_VARIANTS.keys()].sort((a, b) => a - b), armour.sort((a, b) => a - b));
  for (const pack of [en, ru]) {
    for (const t of weapons) assert.ok(typeof pack.gear[`${t}:`] === 'string', `${pack.locale}: weapon frame ${t}`);
    for (const [t, variants] of ARMOR_VARIANTS) for (const v of variants) assert.ok(typeof pack.gear[`${t}:${v}`] === 'string', `${pack.locale}: frame ${t}/${v}`);
    assert.equal(Object.keys(pack.gear).length, weapons.length + [...ARMOR_VARIANTS.values()].flat().length, 'no frame for a type the piece cannot be');
    assert.deepEqual(Object.keys(pack.metals).sort(), [...METAL_IDS, 'unknown'].sort());
    // A frame with no metal slot must be one that has no metal to name: leather, fur, cloth, the brass pellet.
    for (const [id, frame] of Object.entries(pack.gear)) {
      const [, variant] = id.split(':');
      if (!frame.includes('{material}')) assert.ok(['leather', 'fur'].includes(variant) || ['561:', '563:'].includes(id), `${pack.locale}: ${id} names its metal`);
      else assert.ok(!['leather', 'fur'].includes(variant), `${pack.locale}: ${id} has no metal to name`);
    }
  }
});

test('every Legendary and Gilded record has its own sentence, naming its base item', () => {
  for (const pack of [en, ru]) {
    assert.deepEqual(Object.keys(pack.legendaries).sort(), [...LEGENDARY_IDS].sort(), `${pack.locale}: one sentence per record`);
    for (const [id, row] of Object.entries(pack.legendaries)) for (const form of pack.forms) {
      if (pack === ru || form === 's') assert.ok(row[form]?.includes('{base}'), `${pack.locale} ${id} ${form}`);
    }
  }
});

test('combinations join crafted or enchanted properties only, never sigils, sets or wear', () => {
  const expected = expectedKeys();
  const reachable = pattern => pattern.endsWith('.*')
    ? [...expected].some(k => k === pattern.slice(0, -2) || k.startsWith(pattern.slice(0, -1)))
    : expected.has(pattern) || /^enchantment\.\d+\.\d+$/.test(pattern);
  assert.deepEqual(en.combos.map(c => [c.key, c.requires]), ru.combos.map(c => [c.key, c.requires]), 'both languages combine the same properties');
  for (const combo of ru.combos) {
    for (const pattern of combo.requires) {
      assert.ok(reachable(pattern), `${combo.key}: ${pattern} is a property an item can have`);
      assert.doesNotMatch(pattern, /^(?:sigil|condition|material|construction)\b/, `${combo.key}: ${pattern} is never combined`);
    }
    assert.ok(['affix', 'enchantment', 'craft'].includes(combo.key.split('.')[1]));
  }
  // The loader refuses a sigil or wear in a combination.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfo-item-text-combo-'));
  try {
    fs.cpSync(text.ROOT, dir, { recursive: true });
    const file = path.join(dir, 'en', 'combos', 'properties.csv');
    fs.appendFileSync(file, 'combo.affix.bad,sigil.set.ruhn+affix.damage,Bad sentence for a test only.,,note\n');
    assert.throws(() => text.loadLocale(path.join(dir, 'en')), /bad requirement/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('every fragment is one sentence of 5 to 15 words, in every form and with every value it can take', () => {
  const check = (where, sentence) => {
    const n = words(sentence);
    assert.ok(n >= 5 && n <= 15, `${where}: ${n} words — ${sentence}`);
  };
  for (const pack of [en, ru]) {
    for (const [key, base] of Object.entries(pack.bases)) check(`${pack.locale} base ${key}`, base.text);
    for (const [key, row] of Object.entries(pack.properties)) for (const [form, t] of Object.entries(row)) check(`${pack.locale} ${key} ${form}`, t);
    for (const combo of pack.combos) for (const [form, t] of Object.entries(combo.text)) check(`${pack.locale} ${combo.key} ${form}`, t);
    for (const [id, frame] of Object.entries(pack.gear)) for (const metal of Object.values(pack.metals)) check(`${pack.locale} frame ${id}`, frame.replace('{material}', metal));
    for (const [id, frame] of Object.entries(pack.clothing)) for (const color of Object.values(pack.colors)) {
      check(`${pack.locale} garment ${id}`, frame.replace('{color}', color[pack.bases[id].form] ?? color[pack.defaultForm]));
    }
    for (const [key, row] of Object.entries(pack.tiers)) for (const [form, t] of Object.entries(row)) for (const set of Object.values(pack.sets)) check(`${pack.locale} ${key} ${form}`, t.replace('{set}', set));
    const rows = text.readTable(path.join(text.ROOT, pack.locale, 'combos', 'legendaries.csv')).rows;
    for (const row of rows) for (const t of row.templates.split(/\s+/)) {
      const base = pack.bases[t];
      assert.ok(base, `${row.key}: template ${t} is known`);
      const name = pack.inlineName === 'lower' ? base.name.toLowerCase() : base.name.charAt(0).toLowerCase() + base.name.slice(1);
      check(`${pack.locale} ${row.key} on ${t}`, pack.legendaries[row.key][base.form].replace('{base}', name));
    }
  }
});

test('slot 1 of a garment: the base with its colour, in the gender of the base; no colour, the plain base', () => {
  // The user's review of 6 November: a garment's dye is its colour, said in the first sentence with the base.
  const first = (pack, item) => describe(pack, item, { known: true }, ALL)[0];
  const clothingTemplates = catalog.knownPublicTemplates.filter(t => (t.groups || []).some(g => /Clothing$/.test(g))).map(t => String(t.index));
  for (const pack of [en, ru]) {
    assert.deepEqual(Object.keys(pack.clothing).sort(), [...new Set(clothingTemplates)].sort(), `${pack.locale}: a colour frame for every garment`);
    assert.deepEqual(Object.keys(pack.colors).sort(), Array.from({ length: 10 }, (_, d) => `dye.${d}`).sort(), `${pack.locale}: the ten clothing dyes`);
  }
  const shirt = first(ru, { group: 'WomensClothing', templateIndex: 205, dye: 0 });
  assert.equal(shirt.key, 'clothing.205');
  assert.equal(shirt.text, 'Синяя рубаха с длинными рукавами из простой ткани.');
  assert.equal(first(ru, { group: 'MensClothing', templateIndex: 148, dye: 3 }).text, 'Высокие, до колена, тёмно-коричневые сапоги для верховой езды из мягкой кожи.');
  assert.match(first(ru, { group: 'MensClothing', templateIndex: 143, dye: 6 }).text, /^Белое акавирское кимоно/);
  assert.match(first(ru, { group: 'MensClothing', templateIndex: 154, dye: 9 }).text, /^Простой зелёный плащ/);
  assert.equal(first(en, { group: 'WomensClothing', templateIndex: 205, dye: 2 }).text, 'A red long-sleeved shirt of plain cloth.');
  assert.match(first(en, { group: 'MensClothing', templateIndex: 141, dye: 1 }).text, /^Grey leather straps/);
  // No dye, or the game's Unchanged (18): the plain base. The colour's own sentence stays out of the queue.
  assert.equal(first(ru, { group: 'MensClothing', templateIndex: 165 }).key, 'base');
  assert.equal(first(ru, { group: 'MensClothing', templateIndex: 165, dye: 18 }).key, 'base');
  assert.ok(!describe(ru, { group: 'MensClothing', templateIndex: 165, dye: 2 }, { known: true }).some(f => f.key.startsWith('dye.')));
  // Armour is never dyed into a colour sentence: its metal is its colour.
  assert.notEqual(first(ru, { group: 'Armor', templateIndex: 102, dye: 2 }).key.startsWith('clothing.'), true);
});

test('slot 1: base + armour type + metal, else base + metal, else the plain base', () => {
  const keys = (pack, item, facts) => describe(pack, item, facts, ALL).map(s => s.key);
  const first = (pack, item, facts) => describe(pack, item, facts, ALL)[0];
  // The frame says the metal: the separate material sentence gives way to it.
  const plate = first(ru, { group: 'Armor', templateIndex: 102 }, { known: true, material: 'ebony', armorType: 'plate' });
  assert.equal(plate.key, 'gear.102.plate');
  assert.match(plate.text, /^Латная кираса из чёрного эбонита/);
  assert.ok(!keys(ru, { group: 'Armor', templateIndex: 102 }, { known: true, material: 'ebony', armorType: 'plate' }).some(k => k.startsWith('material.')));
  // A metal the game does not show is a neutral one; a type the game does not show leaves the plain base.
  assert.match(first(ru, { group: 'Armor', templateIndex: 107 }, { known: true, armorType: 'plate' }).text, /из блестящего металла/);
  assert.match(first(en, { group: 'Weapons', templateIndex: 120 }, { known: false }).text, /of bright metal/);
  assert.equal(first(ru, { group: 'Armor', templateIndex: 102 }, { known: true }).key, 'base');
  // Leather, chain and the Roleplay & Realism variants.
  assert.equal(first(en, { group: 'Armor', templateIndex: 102 }, { known: true, material: 'leather' }).key, 'gear.102.leather');
  assert.match(first(ru, { group: 'Armor', templateIndex: 102 }, { known: true, material: 'chain', armorType: 'chain' }).text, /^Кольчужная рубаха из блестящего металла/);
  assert.equal(first(ru, { group: 'Armor', templateIndex: 515 }, { known: true, material: 'mithril', construction: 'mail', armorType: 'chain' }).key, 'gear.515.mail');
  assert.equal(first(ru, { group: 'Armor', templateIndex: 520 }, { known: true, material: 'fur', armorType: 'leather' }).key, 'gear.520.fur');
  assert.equal(first(ru, { group: 'Armor', templateIndex: 524 }, { known: true, material: 'steel', construction: 'brigandine', armorType: 'leather' }).key, 'gear.524.brigandine');
  assert.equal(variantOf({ group: 'Jewellery' }, { material: 'steel' }), null);
  // A Legendary keeps its frame as slot 1; its named power is its own sentence of base and power, once identified.
  const legendary = { group: 'Weapons', templateIndex: 123, rarity: 'legendary', legendary: 'warp-edge' };
  assert.equal(first(en, legendary, { known: true, material: 'daedric' }).key, 'gear.123.weapon');
  assert.ok(keys(en, legendary, { known: true }).includes('legendary.warp-edge'));
  assert.ok(!keys(en, legendary, { known: true }).includes('power.warp-edge'), 'the power is in the Legendary sentence');
  assert.ok(!keys(en, legendary, { known: false }).some(k => k.startsWith('legendary.') || k.startsWith('power.')));
  assert.ok(!keys(en, { ...legendary, imprint: 'warp-edge', legendary: undefined }, { known: true }).includes('legendary.warp-edge'), 'an imprint is not the record');
  // Ordinary items have no frame and no combination.
  assert.equal(first(ru, { group: 'UselessItems2', templateIndex: 534, foodStage: 1 }, { known: true }).key, 'base');
});

test('combined properties replace their parts; sigils, sets and wear are never among them', () => {
  const keys = (item, facts = { known: true, material: 'steel' }) => describe(ru, item, facts, ALL).map(s => s.key);
  const sword = { group: 'Weapons', templateIndex: 120, rarity: 'rare', currentCondition: 10, maxCondition: 100,
    affixes: [{ id: 'damage', value: 10 }, { id: 'elemental', param: 'fire', value: 3 }, { id: 'leech', value: 4 }],
    sigil: { set: 'ruhn', xp: 13000 } };
  const out = keys(sword);
  assert.ok(out.includes('combo.affix.damage-fire'));
  assert.ok(!out.includes('affix.damage') && !out.includes('affix.elemental.fire'), 'the parts give way');
  assert.ok(out.includes('affix.leech'), 'a part is used by one combination only');
  for (const key of ['tier.rare.set', 'sigil.stage.2', 'condition.battered']) assert.ok(out.includes(key), `${key} stays out of the property combinations`);
  // Wildcards take a parameter; a missing part leaves the single sentences.
  assert.ok(keys({ group: 'Jewellery', templateIndex: 135, affixes: [{ id: 'stat', param: 'personality', value: 3 }, { id: 'standing', param: 'nobility', value: 3 }] }).includes('combo.affix.charm'));
  assert.ok(keys({ group: 'Jewellery', templateIndex: 135, affixes: [{ id: 'focus', value: 3 }] }).includes('affix.focus'));
  // Crafted: a masterwork with its maker's name in one sentence.
  const ring = describe(ru, { group: 'Jewellery', templateIndex: 135, quality: 4, maker: 'Мастер' }, { known: true }, ALL);
  assert.equal(ring.find(s => s.key === 'combo.craft.masterwork-maker').text, 'Шедевр с клеймом Мастер, достойный королевского двора.');
  assert.ok(!ring.some(s => s.key === 'craft.quality.4' || s.key === 'craft.maker'));
  // An unidentified piece combines nothing it hides.
  assert.ok(!keys(sword, { known: false }).some(k => k.startsWith('combo.')));
});

test('slot 2: tier + sigil + set, tier + sigil, tier + set, tier - in that order', () => {
  const second = (item, facts = { known: true }) => describe(ru, item, facts).find(f => f.slot === 2);
  const sword = { group: 'Weapons', templateIndex: 120, rarity: 'rare' };
  assert.equal(second({ ...sword, sigil: { power: 6, set: 'ruhn', xp: 0 } }).key, 'tier.rare.sigil.set');
  assert.match(second({ ...sword, sigil: { power: 6, set: 'ruhn', xp: 0 } }).text, /^Сильно зачарованный, он несёт растущий сигил набора «Регалии Руна»\.$/);
  assert.equal(second({ ...sword, sigil: { power: 6, xp: 0 } }).key, 'tier.rare.sigil');
  assert.equal(second({ ...sword, sigil: { set: 'ruhn', xp: 0 } }).key, 'tier.rare.set');
  assert.equal(second(sword).key, 'rarity.rare');
  assert.equal(second({ ...sword, rarity: 'legendary', exalted: true, sigil: { set: 'oath', xp: 0 } }).key, 'tier.exalted.set');
  assert.equal(second({ ...sword, sigil: { power: 6 } }, { known: true, perfect: true }).key, 'tier.perfect.sigil');
  // The game shows a sigil and its set before identification; Perfect waits for it.
  assert.equal(second({ ...sword, sigil: { power: 6 } }, { known: false, perfect: true }).key, 'tier.rare.sigil');
  // Without a tier a set or a sigil speaks alone; without either, slot 2 stays empty.
  assert.equal(second({ group: 'Armor', templateIndex: 102, sigil: { set: 'ruhn' } }).key, 'sigil.set.ruhn');
  assert.equal(second({ group: 'Armor', templateIndex: 102 }), undefined);
  // Every tier with a sigil, a set, or both has its combined sentence in both languages; every set has its name.
  for (const pack of [en, ru]) {
    for (const tier of ['magic', 'rare', 'perfect', 'legendary', 'exalted', 'aetheric']) for (const rest of ['sigil', 'set', 'sigil.set']) {
      assert.ok(pack.tiers[`tier.${tier}.${rest}`], `${pack.locale}: tier.${tier}.${rest}`);
    }
    assert.deepEqual(Object.keys(pack.sets).sort(), [...catalog.enums.sigilSets].sort());
  }
});

test('the universal queue: seven slots and the hint in order, random slots stable per item, no fragment twice', () => {
  const rules = JSON.parse(fs.readFileSync(path.join(text.ROOT, 'rules.json'), 'utf8'));
  assert.deepEqual(rules.queue.map(q => q.slot), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(rules.queue.map(q => q.take), ['identity', 'tier', 'random', 'random', 'random', 'first', 'first', 'hint']);
  const busy = { group: 'Weapons', templateIndex: 123, rarity: 'legendary', legendary: 'warp-edge', currentCondition: 50, maxCondition: 100, stolen: true, questItem: true,
    affixes: [{ id: 'damage', value: 30 }, { id: 'stat', param: 'strength', value: 12 }, { id: 'skill', param: 29, value: 20 }, { id: 'technique', param: 'whirlwind', value: 20 }, { id: 'stat', param: 'luck', value: 5 }],
    enchantments: [{ type: 2, param: 20 }, { type: 3, param: 4 }], cursed: { type: 21, param: 0 }, sockets: ['ruby', 'empty'], sigil: { power: 9, set: 'ruhn', xp: 40000 },
    quality: 3, maker: 'Мастер' };
  const facts = { known: true, material: 'daedric' };
  const out = describe(ru, busy, facts);
  assert.deepEqual(out.map(f => f.slot), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(out[0].category, 'identity');
  assert.equal(out[1].key, 'tier.legendary.sigil.set');
  const poolA = ['power', 'technique', 'lines', 'contents', 'material', 'growth'], poolB = ['technique', 'craft', 'sockets', 'secret'];
  assert.ok(poolA.includes(out[2].category) && poolA.includes(out[3].category));
  assert.ok(poolB.includes(out[4].category));
  assert.equal(out[5].category, 'wear');
  assert.equal(out[6].key, 'state.stolen', 'slot 7 is stolen alone');
  assert.equal(out[7].key, 'hint.quest', "a quest's item is said by the hint, last");
  // The same item reads the same every time; another seed may read otherwise; nothing is said twice.
  assert.deepEqual(describe(ru, busy, facts), out);
  assert.deepEqual(describe(ru, { ...busy }, facts), out, 'the seed is the item, not the object');
  const draws = new Set();
  for (let seed = 0; seed < 40; seed++) {
    const d = describe(ru, busy, facts, { seed });
    draws.add(d.slice(2, 5).map(f => f.key).join());
    assert.equal(new Set(d.map(f => f.key)).size, d.length);
    assert.ok(d.filter(f => f.category === 'technique').length <= 1, 'technique once across slots 3-5');
    assert.ok(d.filter(f => f.category === 'lines').length <= 2);
  }
  assert.ok(draws.size > 3, `random slots vary with the seed (${draws.size} draws)`);
  assert.ok(seedOf({ uid: 'a1' }) !== seedOf({ uid: 'a2' }));
  // Wear only on what is worn; a loaf of bread has the field and says nothing of it.
  assert.ok(!describe(ru, { group: 'UselessItems2', templateIndex: 534, currentCondition: 1, maxCondition: 100 }, { known: true }).some(f => f.category === 'wear'));
  assert.ok(describe(ru, { group: 'MensClothing', templateIndex: 143, currentCondition: 1, maxCondition: 100 }, { known: true }).some(f => f.category === 'wear'));
  // Slots with nothing to say are skipped; the hint is always said, after the description's limit too.
  assert.deepEqual(describe(ru, { group: 'UselessItems2', templateIndex: 534, stolen: true }, { known: true }).map(f => [f.slot, f.key]), [[1, 'base'], [7, 'state.stolen'], [8, 'hint.food']]);
  const short = describe(ru, busy, facts, { max: 2 });
  assert.deepEqual(short.map(f => f.slot), [1, 2, 8]);
  // Every key a description can ask for has a category; the unused ones never enter the queue.
  for (const key of [...expectedKeys(), ...ru.combos.map(c => c.key), ...Object.keys(ru.tiers), 'base', 'gear.102.plate', 'legendary.wyrmbane']) {
    assert.ok(categoryOf(ru.rules, key), `${key} has a category`);
  }
  assert.equal(categoryOf(ru.rules, 'dye.3'), 'unused');
  assert.ok(!describe(ru, { group: 'MensClothing', templateIndex: 143, dye: 3 }, { known: true }).some(f => f.key.startsWith('dye.')));
  assert.equal(categoryOf(ru.rules, 'rarity.imbued'), 'craft');
  assert.equal(categoryOf(ru.rules, 'affix.honed'), 'craft');
});

test('every item ends with the player hint: its own paragraph, the state first, the guild for silver', () => {
  const hints = JSON.parse(fs.readFileSync(path.join(text.ROOT, 'hints.json'), 'utf8'));
  for (const pack of [en, ru]) {
    // Every base item has its hint, and it is the last fragment, in its own paragraph.
    assert.deepEqual(Object.keys(hints.templates).sort(), Object.keys(pack.bases).sort(), `${pack.locale}: a hint for every template`);
    for (const [key, base] of Object.entries(pack.bases)) {
      const group = String(catalog.knownPublicTemplates.find(t => String(t.index) === key)?.groups?.[0] ?? '');
      const out = describe(pack, { templateIndex: Number(key), group });
      const last = out.at(-1);
      assert.equal(last.category, 'hint', `${pack.locale} ${key}: the hint is last`);
      assert.ok(out.filter(f => f.category === 'hint').every(f => f.slot === 8));
      assert.ok(Object.hasOwn(pack.properties, out.find(f => f.category === 'hint').key), `${pack.locale} ${key}`);
      const text = paragraphs(out);
      assert.equal(text.split('\n\n').length, 2, `${pack.locale} ${key}: one blank line between the description and the hint`);
      assert.ok(text.startsWith(out[0].text) && base.text);
    }
  }
  // The state's advice comes before the base item's: a quest, an unidentified piece, a broken one, a plain one.
  const keyOf = (item, facts = {}) => describe(ru, item, facts).find(f => f.category === 'hint').key;
  assert.equal(keyOf({ group: 'MetalIngredients', templateIndex: 71, questItem: true }), 'hint.quest');
  assert.equal(keyOf({ group: 'Weapons', templateIndex: 120, rarity: 'rare' }), 'hint.unidentified');
  assert.equal(keyOf({ group: 'Weapons', templateIndex: 120, rarity: 'rare' }, { known: true }), 'hint.rare');
  assert.equal(keyOf({ group: 'Weapons', templateIndex: 120, currentCondition: 10, maxCondition: 100 }, { known: true }), 'hint.repair');
  assert.equal(keyOf({ group: 'Weapons', templateIndex: 120 }, { known: true }), 'hint.weapon.common');
  assert.match(describe(ru, { group: 'Armor', templateIndex: 102 }, { known: true }).at(-1).text, /^В крайнем случае лучше, чем ничего/);
  assert.equal(keyOf({ group: 'Weapons', templateIndex: 120, quality: 3, maker: 'Ада' }, { known: true }), 'hint.crafted');
  assert.equal(keyOf({ group: 'Armor', templateIndex: 102, sigil: { set: 'ruhn', power: 4 } }, { known: true }), 'hint.set');
  // Silver: a writ's material says so after its hint, in the guild's words when the character is in one.
  const iron = { group: 'MetalIngredients', templateIndex: 71 };
  assert.deepEqual(describe(ru, iron).filter(f => f.category === 'hint').map(f => f.key), ['hint.metal.iron', 'hint.silver.writ']);
  const guild = describe(ru, iron, { guild: true }).filter(f => f.category === 'hint');
  assert.deepEqual(guild.map(f => f.key), ['hint.metal.iron', 'hint.silver.writ.guild']);
  assert.match(guild[1].text, /^Возможно, моя гильдия будет заинтересована в этом предмете/);
  assert.equal(describe(ru, { ...iron, questItem: true }, { guild: true }).filter(f => f.category === 'hint').length, 1, 'a quest item is no writ good');
  assert.deepEqual(describe(en, { group: 'UselessItems2', templateIndex: 685 }).filter(f => f.category === 'hint').map(f => f.key), ['hint.dish', 'hint.silver.dish.fighters']);
  assert.equal(describe(en, { group: 'Furniture', templateIndex: 217 }, { guild: true }).filter(f => f.category === 'hint').length, 1, 'furniture is no writ good');
  // A crafting hint says plainly what the thing is good for: no station names and no counts of what a recipe takes
  // (the user's review of 6 November: "Из пары таких кусков может выйти добротное железо.").
  const crafting = /^hint\.(ore|metal|ingot|daedra-heart|charcoal|log|plank|resin|pelt|hide|chitin|silk|cloth|stone|masonry|gem|siege-gem|herb|feathers|leather|pearl|reagent)/;
  const station = { en: /\b(anvil|loom|furnace|smelter|kiln|crucible|workbench|forge)\b/i,
    ru: /(горн|наковальн|станок|станк|верстак|плавильн|тигел|тигл)/i };
  const count = { en: /\b(two|three|four|five|six|ten|dozen)\b/i, ru: /(^|[\s«(])(дв[ае]|три|четыре|пять|шесть|десять|дюжин\S*)(?=[\s,.;:—]|$)/i };
  let checked = 0;
  for (const pack of [en, ru]) {
    for (const [key, sentence] of Object.entries(pack.properties)) {
      if (!crafting.test(key)) continue;
      for (const form of Object.values(sentence)) {
        assert.doesNotMatch(form, /\d/, `${pack.locale} ${key}: no figures`);
        assert.doesNotMatch(form, station[pack.locale], `${pack.locale} ${key}: no station`);
        assert.doesNotMatch(form, count[pack.locale], `${pack.locale} ${key}: no counts`);
        checked++;
      }
    }
  }
  assert.ok(checked > 40, `crafting hints checked: ${checked}`);
});

test('the stolen mark stands on its own line; ammunition is never worn down; two sentences never open alike', () => {
  // Description, then the stolen mark on the next line (the card sets it in red), then a blank line and the hint.
  const stolen = { group: 'Weapons', templateIndex: 120, stolen: true, currentCondition: 90, maxCondition: 100 };
  for (const pack of [en, ru]) {
    const out = describe(pack, stolen, { known: true, material: 'steel' });
    const [description, hint] = paragraphs(out).split('\n\n');
    const lines = description.split('\n');
    assert.equal(lines.length, 2, `${pack.locale}: the stolen mark is its own line`);
    assert.equal(lines[1], out.find(f => f.category === 'standing').text);
    assert.equal(hint, out.filter(f => f.category === 'hint').map(f => f.text).join(' '));
    assert.equal(paragraphs(describe(pack, { ...stolen, stolen: false }, { known: true, material: 'steel' })).split('\n').length, 3, 'no stolen line, no extra line');
  }
  // An arrow or a bullet is spent, never worn down or mended.
  for (const templateIndex of [131, 561]) {
    const keys = describe(ru, { group: 'Weapons', templateIndex, currentCondition: 0, maxCondition: 1 }, { known: true }).map(f => f.key);
    assert.ok(!keys.some(k => k.startsWith('condition.')) && !keys.includes('hint.repair'), `${templateIndex}: ${keys}`);
  }
  // Two sensory lines and nothing else to say: the second trades its opening for the locale's synonym.
  const opening = t => t.split(/\s+/).slice(0, 2).join(' ').toLowerCase();
  const cloak = { group: 'MensClothing', templateIndex: 154, rarity: 'magic', affixes: [{ id: 'skill', param: 13, value: 5 }, { id: 'skill', param: 17, value: 5 }] };
  for (let seed = 0; seed < 20; seed++) {
    const body = describe(ru, cloak, { known: true }, { seed }).filter(f => f.category !== 'hint');
    for (let i = 1; i < body.length; i++) assert.notEqual(opening(body[i].text), opening(body[i - 1].text), `seed ${seed}: ${body[i].text}`);
  }
  assert.deepEqual(ru.openings, { 'Вы чувствуете': 'Вы ощущаете', 'Вы ощущаете': 'Вы чувствуете', 'Вы видите': 'Вы замечаете' });
  // A Legendary is kept: worn, saved for an imprint, or sold - never broken into shards.
  const legend = describe(ru, { group: 'Weapons', templateIndex: 120, rarity: 'legendary', legendary: 'warp-edge' }, { known: true }).at(-1);
  assert.equal(legend.key, 'hint.legendary');
  assert.match(legend.text, /^Не разбирайте его: носите сами, берегите для отпечатка силы или продайте на рынке\.$/);
});

test('a potion only in a potion bottle, a soul only in what holds souls, poison only on a weapon', () => {
  // Every item carries potionRecipeKey (0 by default), trappedSoulType and poisonType: a bed says none of them.
  const bed = { group: 'Furniture', templateIndex: 217, potionRecipeKey: 0, potent: 25, trappedSoulType: 3, poisonType: 2 };
  for (const pack of [en, ru]) assert.ok(!describe(pack, bed, { known: true }, ALL).some(f => f.key.startsWith('content.')), pack.locale);
  assert.deepEqual(keysFor(bed, { known: true }).filter(k => k.startsWith('content.')), []);
  assert.deepEqual(keysFor({ group: 'UselessItems1', templateIndex: 83, potionRecipeKey: 0, potent: 25 }).filter(k => k.startsWith('content.')), ['content.potion', 'content.potent']);
  assert.deepEqual(keysFor({ group: 'MiscItems', templateIndex: 274, trappedSoulType: 3 }), ['content.soul']);
  assert.deepEqual(keysFor({ group: 'MiscItems', templateIndex: 274, trappedSoulType: -1 }), []);
  assert.equal(describe(ru, { group: 'MiscItems', templateIndex: 274, trappedSoulType: 3 }).at(-1).key, 'hint.soul.filled');
  assert.ok(keysFor({ group: 'Weapons', templateIndex: 113, poisonType: 2 }, { known: true }).includes('content.poison.2'));
  assert.ok(!keysFor({ group: 'Armor', templateIndex: 102, poisonType: 2 }, { known: true }).some(k => k.startsWith('content.')));
});

test('an unidentified piece says its tier and state, never its hidden lines', () => {
  const item = Object.freeze({ group: 'Weapons', templateIndex: 121, rarity: 'legendary', exalted: true, legendary: 'warp-edge',
    affixes: Object.freeze([Object.freeze({ id: 'damage', value: 30 })]), enchantments: Object.freeze([Object.freeze({ type: 2, param: 20 })]),
    cursed: Object.freeze({ type: 21, param: 0 }), sockets: Object.freeze(['ruby']), sigil: Object.freeze({ set: 'ruhn', xp: 40000 }) });
  const hidden = describe(ru, item, { known: false }, ALL).map(s => s.key);
  assert.deepEqual(hidden, ['gear.121.weapon', 'tier.exalted.set', 'sigil.stage.4', 'state.unidentified', 'hint.unidentified'], 'the sigil and its set are seen at once');
  const known = describe(ru, item, { known: true }, ALL).map(s => s.key);
  for (const key of ['legendary.warp-edge', 'affix.damage', 'enchantment.2', 'tier.exalted.set', 'sigil.stage.4', 'socket.gem.ruby', 'curse.damned', 'hint.damned']) {
    assert.ok(known.includes(key), `${key} once identified`);
  }
  assert.ok(!known.includes('state.unidentified'));
  // A Perfect Rare and a curse are words of an identified piece only.
  const rare = { group: 'Weapons', templateIndex: 120, rarity: 'rare', affixes: [{ id: 'damage', value: 25 }], cursed: { type: 25, param: 0 } };
  assert.ok(!describe(en, rare, { known: false, perfect: true }, ALL).some(s => s.key === 'rarity.perfect' || s.key.startsWith('curse')));
  assert.deepEqual(describe(en, rare, { known: true, perfect: true }, ALL).filter(s => s.category === 'tier' || s.category === 'secret').map(s => s.key), ['rarity.perfect', 'curse.cursed']);
  // Without facts nothing is guessed: no metal from the raw code, nothing magical without identification.
  assert.match(describe(en, { group: 'Weapons', templateIndex: 120, material: 9 }, {}, ALL)[0].text, /of bright metal/);
});

test('the generator deduplicates sentences and never writes to the item', () => {
  const item = { group: 'Weapons', templateIndex: 120, rarity: 'rare', currentCondition: 0, maxCondition: 100, stolen: true,
    affixes: [{ id: 'skill', param: 29, value: 10 }, { id: 'stat', param: 'luck', value: 4 }, { id: 'resist', param: 'fire', value: 1, gem: 'ruby' }],
    enchantments: [{ type: 10, param: 29 }, { type: 3, param: 4 }, { type: 0, param: 7 }, { type: 0, param: 8 }, { type: 99, param: 1 }],
    quality: 2, maker: 'Mak\u0000er ', sockets: ['empty', 'flawless-ruby', 'chipped-ruby'] };
  const before = JSON.stringify(item);
  const out = describe(en, item, { known: true, material: 'Steel' }, ALL);
  assert.equal(JSON.stringify(item), before);
  const keys = out.map(s => s.key);
  assert.equal(keys.filter(k => k === 'skill.29').length, 1, 'skill line and skill enchantment share one sentence');
  assert.equal(keys.filter(k => k === 'enchantment.0').length, 1, 'two spells of one trigger: one sentence');
  assert.ok(keys.includes('enchantment.3.4'), 'a parameter sentence before its type');
  assert.ok(!keys.some(k => k.startsWith('affix.resist')), "a socketed gem's line is the socket's");
  assert.deepEqual(keys.filter(k => k.startsWith('socket')), ['socket.gem.ruby', 'socket.empty']);
  assert.ok(out.find(s => s.key === 'combo.craft.fine-maker').text.includes('Maker.'), 'controls are dropped from a stored name');
  assert.equal(new Set(out.map(s => s.text)).size, out.length, 'no sentence twice');
  // A template the tables do not know has no grammatical form: no description at all.
  assert.deepEqual(describe(ru, { group: 'UselessItems2', templateIndex: 65000, stolen: true }, { known: true }), []);
  // A sentence whose value is missing is skipped rather than said with a hole.
  assert.ok(!describe(en, { group: 'Jewellery', templateIndex: 135, heirloom: { house: '' } }, { known: true }, ALL).some(s => /\{/.test(s.text)));
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
    const index = JSON.parse(fs.readFileSync(path.join(text.ROOT, locale, 'index.json')));
    const listed = [...['bases', 'properties', 'gear', 'metals', 'clothing', 'colors', 'combos', 'legendaries', 'tiers', 'sets'].flatMap(k => index[k] ?? []), ...text.uiFiles(path.join(text.ROOT, locale))];
    assert.deepEqual(text.localeFiles(locale).filter(f => f.endsWith('.csv')), listed.map(f => `${locale}/${f}`));
    for (const file of text.localeFiles(locale)) assert.ok(fs.existsSync(path.join(text.ROOT, file)), file);
    assert.deepEqual(win.__dfoItemTextPack.rules.queue.map(q => q.slot), [1, 2, 3, 4, 5, 6, 7, 8]);
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
    assert.match(win.__dfoItemText.text({ group: 'Armor', templateIndex: 103 }, { known: true, material: 'steel', armorType: 'plate' }), /^Plate gauntlets of tempered steel/);
    assert.equal(win.__dfoItemText.describe({ group: 'Weapons', templateIndex: 120, rarity: 'rare', currentCondition: 1, maxCondition: 9, stolen: true,
      affixes: ['strength', 'luck', 'agility', 'speed'].map(param => ({ id: 'stat', param, value: 2 })) }, { known: true }).map(f => f.slot).join(), '1,2,3,4,6,7,8');
    // The text is one paragraph, a blank line, the hint.
    assert.match(win.__dfoItemText.text({ group: 'MetalIngredients', templateIndex: 71 }, { guild: true }), /^[^\n]+\n\n[^\n]+guild[^\n]+$/);
    assert.equal(win.__dfoItemText.stats().bases, 483);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the stand and the registry in docs are built from the current tables', () => {
  const { pages, wrap, registry } = require('../tools/build-item-text-pages.cjs');
  const { readZip } = require('../tools/item-text-pages/docx.cjs');
  for (const [name, body] of Object.entries(pages)) {
    assert.equal(fs.readFileSync(path.join(__dirname, '..', 'docs', name), 'utf8'), wrap(body), `${name}: run node tools/build-item-text-pages.cjs`);
  }
  // The registry is a Word document: the committed file holds exactly the parts a fresh build writes.
  const committed = readZip(fs.readFileSync(path.join(__dirname, '..', 'docs', 'item-text-registry.docx')));
  assert.deepEqual([...committed.keys()], registry.entries.map(([name]) => name), 'item-text-registry.docx: run node tools/build-item-text-pages.cjs');
  for (const [name, data] of registry.entries) assert.equal(committed.get(name).toString('utf8'), data, `item-text-registry.docx ${name}: run node tools/build-item-text-pages.cjs`);
  assert.deepEqual(readZip(registry.buffer), committed, 'the writer reads back what it wrote');
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'docs', 'item-text-registry.html')), 'the HTML registry gave way to the document');
  // It lists every fragment of the tables once, each key in its own first cell.
  const count = Object.keys(ru.bases).length + Object.keys(ru.properties).length + Object.keys(ru.gear).length + Object.keys(ru.metals).length
    + Object.keys(ru.clothing).length + Object.keys(ru.colors).length
    + ru.combos.length + Object.keys(ru.legendaries).length + Object.keys(ru.tiers).length + Object.keys(ru.sets).length;
  assert.equal(registry.total, count);
  const xml = committed.get('word/document.xml').toString('utf8');
  for (const key of [...Object.keys(ru.properties), 'base.534', 'gear.102.plate', 'metal.unknown', 'legendary.warp-edge', 'tier.rare.set', 'set.ruhn']) {
    assert.ok(xml.includes(`<w:t xml:space="preserve">${key}</w:t>`), `the registry lists ${key}`);
  }
});
