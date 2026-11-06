'use strict';
// Item description locales and the sentence generator: every known template and every property the game's catalogues
// allow has a sentence in both languages; Russian has all four forms; hidden properties stay hidden; the page gets the
// Russian locale only with the translation installed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const text = require('../src/mod/item-text.cjs');
const { describe, keysFor, KINDS, variantOf, groupIndex } = require('../src/mod/page/dfo_item_text.js');
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

const ALL = { max: Infinity };
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
  assert.match(say(ru, { group: 'MensClothing', templateIndex: 143, dye: 2 }, steel)[1], /^Оно окрашено/);         // кимоно
  assert.match(say(ru, { group: 'MensClothing', templateIndex: 141, dye: 2 }, steel)[1], /^Они окрашены/);         // ремни
  assert.match(say(en, { group: 'MensClothing', templateIndex: 141, dye: 2 }, steel)[1], /^They have been dyed/);
  assert.match(say(en, { group: 'MensClothing', templateIndex: 143, dye: 2 }, steel)[1], /^It has been dyed/);
  // A Legendary's own sentence takes the base's name and form.
  const rose = say(ru, { group: 'Armor', templateIndex: 103, rarity: 'legendary', legendary: 'gauntlets-of-the-rose' }, { known: true })[0];
  assert.match(rose, /^Эти латные перчатки Розы бьют/);
  assert.match(say(ru, { group: 'Weapons', templateIndex: 128, legendary: 'graveward' }, { known: true })[0], /^Эта секира упокаивает/);
  assert.match(say(en, { group: 'Weapons', templateIndex: 120, legendary: 'wyrmbane' }, { known: true })[0], /^This longsword, forged/);
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
    const rows = text.readTable(path.join(text.ROOT, pack.locale, 'combos', 'legendaries.csv')).rows;
    for (const row of rows) for (const t of row.templates.split(/\s+/)) {
      const base = pack.bases[t];
      assert.ok(base, `${row.key}: template ${t} is known`);
      const name = pack.inlineName === 'lower' ? base.name.toLowerCase() : base.name.charAt(0).toLowerCase() + base.name.slice(1);
      check(`${pack.locale} ${row.key} on ${t}`, pack.legendaries[row.key][base.form].replace('{base}', name));
    }
  }
});

test('the identity sentence: a Legendary, else base + armour type + metal, else the plain base', () => {
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
  // A Legendary's own sentence once identified; before that its frame, and its power stays hidden.
  const legendary = { group: 'Weapons', templateIndex: 123, rarity: 'legendary', legendary: 'warp-edge' };
  assert.deepEqual(keys(en, legendary, { known: true, material: 'daedric' }).slice(0, 1), ['legendary.warp-edge']);
  assert.ok(!keys(en, legendary, { known: true }).includes('power.warp-edge'), 'the power is in the Legendary sentence');
  assert.equal(first(en, legendary, { known: false }).key, 'gear.123.weapon');
  assert.ok(!keys(en, { ...legendary, imprint: 'warp-edge', legendary: undefined }, { known: true }).includes('legendary.warp-edge'), 'an imprint is not the record');
  // Ordinary items have no frame and no combination.
  assert.equal(first(ru, { group: 'UselessItems2', templateIndex: 534, foodStage: 1 }, { known: true }).key, 'base');
});

test('combined properties replace their parts; sigils, sets and wear stay on their own', () => {
  const keys = (item, facts = { known: true, material: 'steel' }) => describe(ru, item, facts, ALL).map(s => s.key);
  const sword = { group: 'Weapons', templateIndex: 120, rarity: 'rare', currentCondition: 10, maxCondition: 100,
    affixes: [{ id: 'damage', value: 10 }, { id: 'elemental', param: 'fire', value: 3 }, { id: 'leech', value: 4 }],
    sigil: { set: 'ruhn', xp: 13000 } };
  const out = keys(sword);
  assert.ok(out.includes('combo.affix.damage-fire'));
  assert.ok(!out.includes('affix.damage') && !out.includes('affix.elemental.fire'), 'the parts give way');
  assert.ok(out.includes('affix.leech'), 'a part is used by one combination only');
  for (const key of ['sigil.set.ruhn', 'sigil.stage.2', 'condition.battered']) assert.ok(out.includes(key), `${key} stays on its own`);
  // Wildcards take a parameter; a missing part leaves the single sentences.
  assert.ok(keys({ group: 'Jewellery', templateIndex: 135, affixes: [{ id: 'stat', param: 'personality', value: 3 }, { id: 'standing', param: 'nobility', value: 3 }] }).includes('combo.affix.charm'));
  assert.ok(keys({ group: 'Jewellery', templateIndex: 135, affixes: [{ id: 'focus', value: 3 }] }).includes('affix.focus'));
  // Crafted: a masterwork with its maker's name in one sentence.
  const ring = describe(ru, { group: 'Jewellery', templateIndex: 135, quality: 4, maker: 'Мастер' }, { known: true }, ALL);
  assert.equal(ring.find(s => s.key === 'combo.craft.masterwork-maker').text, 'Шедевр с клеймом мастера Мастер, достойный королевского двора.');
  assert.ok(!ring.some(s => s.key === 'craft.quality.4' || s.key === 'craft.maker'));
  // An unidentified piece combines nothing it hides.
  assert.ok(!keys(sword, { known: false }).some(k => k.startsWith('combo.')));
});

test('ranking keeps the most relevant fragments up to the limit and says them in reading order', () => {
  const rules = JSON.parse(fs.readFileSync(path.join(text.ROOT, 'rules.json'), 'utf8'));
  assert.equal(rules.limit, 5);
  assert.deepEqual(ru.rules.groups.map(g => g.id), rules.groups.map(g => g.id));
  const busy = { group: 'Weapons', templateIndex: 123, rarity: 'legendary', legendary: 'warp-edge', currentCondition: 50, maxCondition: 100, stolen: true,
    affixes: [{ id: 'damage', value: 30 }, { id: 'stat', param: 'strength', value: 12 }, { id: 'skill', param: 29, value: 20 }, { id: 'technique', param: 'whirlwind', value: 20 }, { id: 'stat', param: 'luck', value: 5 }],
    enchantments: [{ type: 2, param: 20 }, { type: 3, param: 4 }], cursed: { type: 21, param: 0 }, sockets: ['ruby', 'empty'], sigil: { set: 'ruhn', xp: 40000 },
    quality: 3, maker: 'Мастер' };
  const all = describe(ru, busy, { known: true, material: 'daedric' }, ALL);
  const kept = describe(ru, busy, { known: true, material: 'daedric' });
  assert.ok(all.length > 5);
  assert.equal(kept.length, 5, 'the default limit');
  assert.equal(kept[0].group, 'identity', 'what the thing is comes first');
  assert.deepEqual(kept.map(s => s.group).sort(), ['identity', 'secret', 'set', 'technique', 'tier'], 'the five most relevant groups');
  // Reading order, not rank order: kinds follow KINDS.
  const order = kept.map(s => KINDS.indexOf(s.kind));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  // A group's cap holds in the first pass; the room left is filled in rank order.
  const lines = describe(ru, { group: 'Jewellery', templateIndex: 135, affixes: ['strength', 'intelligence', 'willpower', 'agility', 'luck'].map(param => ({ id: 'stat', param, value: 2 })) }, { known: true });
  assert.equal(lines.length, 5);
  assert.deepEqual(lines.map(s => s.group), ['identity', 'lines', 'lines', 'lines', 'lines']);
  assert.equal(describe(ru, busy, { known: true }, { max: 2 }).length, 2);
  assert.deepEqual(describe(en, { ...busy, cursed: undefined }, { known: true }, { kinds: ['state'] }).map(s => s.key), ['state.stolen']);
  // Every key a description can ask for belongs to a ranked group.
  for (const key of [...expectedKeys(), ...ru.combos.map(c => c.key), 'base', 'gear.102.plate', 'legendary.wyrmbane']) {
    assert.ok(groupIndex(ru.rules, key) < ru.rules.groups.length, `${key} has a group`);
  }
});

test('an unidentified piece says its tier and state, never its hidden lines', () => {
  const item = Object.freeze({ group: 'Weapons', templateIndex: 121, rarity: 'legendary', exalted: true, legendary: 'warp-edge',
    affixes: Object.freeze([Object.freeze({ id: 'damage', value: 30 })]), enchantments: Object.freeze([Object.freeze({ type: 2, param: 20 })]),
    cursed: Object.freeze({ type: 21, param: 0 }), sockets: Object.freeze(['ruby']), sigil: Object.freeze({ set: 'ruhn', xp: 40000 }) });
  const hidden = describe(ru, item, { known: false }, ALL).map(s => s.key);
  assert.deepEqual(hidden, ['gear.121.weapon', 'rarity.exalted', 'state.unidentified']);
  const known = describe(ru, item, { known: true }, ALL).map(s => s.key);
  for (const key of ['legendary.warp-edge', 'affix.damage', 'enchantment.2', 'sigil.set.ruhn', 'sigil.stage.4', 'socket.gem.ruby', 'curse.damned']) {
    assert.ok(known.includes(key), `${key} once identified`);
  }
  assert.ok(!known.includes('state.unidentified'));
  // A Perfect Rare and a curse are words of an identified piece only.
  const rare = { group: 'Weapons', templateIndex: 120, rarity: 'rare', affixes: [{ id: 'damage', value: 25 }], cursed: { type: 25, param: 0 } };
  assert.ok(!describe(en, rare, { known: false, perfect: true }, ALL).some(s => s.key === 'rarity.perfect' || s.key.startsWith('curse')));
  assert.deepEqual(describe(en, rare, { known: true, perfect: true }, ALL).filter(s => s.kind === 'rarity' || s.kind === 'curse').map(s => s.key), ['rarity.perfect', 'curse.cursed']);
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
    const listed = ['bases', 'properties', 'gear', 'metals', 'combos', 'legendaries'].flatMap(k => index[k] ?? []);
    assert.deepEqual(text.localeFiles(locale).filter(f => f.endsWith('.csv')), listed.map(f => `${locale}/${f}`));
    for (const file of text.localeFiles(locale)) assert.ok(fs.existsSync(path.join(text.ROOT, file)), file);
    assert.equal(win.__dfoItemTextPack.rules.limit, 5);
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
      affixes: ['strength', 'luck', 'agility', 'speed'].map(param => ({ id: 'stat', param, value: 2 })) }, { known: true }).length, 5);
    assert.equal(win.__dfoItemText.stats().bases, 483);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
