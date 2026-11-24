#!/usr/bin/env node
// Item description sample: 500 cards by the game's own rules, and 60 of its highest tiers, described in both languages.
// Loot is rolled by the game's loot generator (tables, rarity ladder, Legendaries, curses, sockets, techniques, Ayleid
// stones, graded gems, online sigils and sets), crafted pieces are minted by the game's smithing law, profession
// materials by the Stores' mint, every other template from its row. Facts as the card derives them. Seeded: the same
// sample on every run of the same tables and the same game snapshot.
//   DFO_UPSTREAM_DIR=... node tools/item-text-sample.mjs [out-dir] [--seed N]   -> cards.json, cards-rare.json
// Another seed gives another sample by the same rules.
// Then: python3 tools/item-text-review.py [out-dir] (spelling, agreement, targeting, repetition, shape).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const origLog = console.log; console.log = (...a) => { if (!String(a[0]).startsWith('[books]')) origLog(...a); };

if (!process.env.DFO_UPSTREAM_DIR) { console.error('DFO_UPSTREAM_DIR is not set: the sample needs the game source'); process.exit(2); }
const UP = process.env.DFO_UPSTREAM_DIR + '/src/';
const REPO = new URL('..', import.meta.url).pathname;
const OUT = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.');
fs.mkdirSync(OUT, { recursive: true });
const L = await import(UP + 'systems/loot/loot.js');
const R = await import(UP + 'systems/loot/lootRarity.js');
await import(UP + 'systems/gems.js'); await import(UP + 'systems/ayleidStones.js'); await import(UP + 'systems/gilded.js');
await import(UP + 'systems/thunderlock.js').catch(() => {});
const S = await import(UP + 'systems/sigil/sigil.js');
const T = await import(UP + 'systems/item/itemTemplates.js');
const INFO = await import(UP + 'systems/item/itemInfo.js');
const RRI = await import(UP + 'systems/roleplayRealismItems/rriItems.js');
const TRADE = await import(UP + 'systems/tradeModes.js');
const SMITH = await import(UP + 'systems/smithItems.js');
const PROF = await import(UP + 'systems/professions/profItems.js');
const RECIPES = (await import(UP + 'net/recipeLaw.js')).RECIPES;
const MARKET = (await import(UP + 'net/marketLaw.js')).marketCatalogue();

const text = require(REPO + 'src/mod/item-text.cjs');
const gen = require(REPO + 'src/mod/page/dfo_item_text.js');
const packs = { ru: text.loadLocale(path.join(text.ROOT, 'ru')), en: text.loadLocale(path.join(text.ROOT, 'en')) };
const catalog = JSON.parse(fs.readFileSync(REPO + 'docs/item-field-catalog.json', 'utf8'));

// a seeded generator, so the 500 are the same 500 on every run
const seedArg = process.argv.indexOf('--seed');
let seed = seedArg > 0 ? Number(process.argv[seedArg + 1]) >>> 0 : 20261106;
const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = list => list[Math.floor(rnd() * list.length)];
Math.random = rnd;   // the game's rollers default to Math.random

const METAL = { Iron: 'iron', Steel: 'steel', Silver: 'silver', Elven: 'elven', Dwarven: 'dwarven', Mithril: 'mithril', Adamantium: 'adamantium', Ebony: 'ebony', Orcish: 'orcish', Daedric: 'daedric', Leather: 'leather', Chain: 'chain' };
/** The card's facts (dfo_item_cards.js derive + the native Type row): what the game shows, never decoded. */
function factsOf(item, guild) {
  const facts = { known: TRADE.itemIsIdentified(item), guild };
  const gear = item.group === 'Weapons' || item.group === 'Armor';
  if (gear && !T.isAmmunition(item)) {
    if (item.templateIndex === 563) facts.material = 'cloth';
    else if (Number.isInteger(item.material) && item.material >= 0 && INFO.itemSaysMaterial(item)) {
      const variant = String(RRI.rriVariantWord(item) || '').trim();
      if (variant === 'Fur') facts.material = 'fur';
      else {
        if (variant === 'Mail') facts.construction = 'mail';
        if (variant === 'Brigandine') facts.construction = 'brigandine';
        const name = INFO.lookNameParts(item).material;
        if (METAL[name]) facts.material = METAL[name];
      }
    }
    if (item.group === 'Armor' && Number.isInteger(item.material)) {
      facts.armorType = item.material === 0 ? 'leather' : item.material === 256 || item.material === 259 ? 'chain' : item.material >= 512 ? 'plate' : undefined;
      if (!facts.armorType) delete facts.armorType;
    }
  }
  if (R.isPerfect(item) && facts.known) facts.perfect = true;
  return facts;
}
const worn = it => {   // a found piece is seldom whole
  if ((it.group === 'Weapons' || it.group === 'Armor' || it.group === 'MensClothing' || it.group === 'WomensClothing' || it.group === 'Jewellery') && it.maxCondition > 0 && rnd() < 0.45) {
    it.currentCondition = Math.floor(it.maxCondition * rnd());
  }
};

const cards = [];
const add = (source, item) => { if (item && Number.isInteger(item.templateIndex)) cards.push({ source, item }); };

// ── 1. loot, by the game's generator ──
const pool = [];
const KEYS = 'ABCDEFGHIJKLMNOPQRSTU'.split('');
S.setSigilOnline?.(true);
for (let i = 0; i < 1500; i++) {
  const level = 1 + Math.floor(rnd() * 40);
  const items = L.generateItems(pick(KEYS), { level, gender: rnd() < 0.5 ? 'male' : 'female' });
  const tier = Math.floor(rnd() * 11), boss = rnd() < 0.2;
  const source = rnd() < 0.5 ? R.pileSource(tier, boss) : { ...R.pileSource(tier, boss), kind: 'corpse' };
  R.rollLootRarity(items, source, { luck: 40 + Math.floor(rnd() * 60), level });
  if (rnd() < 0.6) R.stampWonWeapons(items, 1 + Math.floor(rnd() * 4));
  for (const it of items) pool.push(it);
}
const gearPool = pool.filter(it => ['Weapons', 'Armor', 'MensClothing', 'WomensClothing', 'Jewellery'].includes(it.group));
const rarePool = gearPool.filter(it => it.rarity && it.rarity !== 'common');
const otherPool = pool.filter(it => !gearPool.includes(it) && it.group !== 'Currency');
for (let n = 0; n < 130; n++) add('loot: magic+', rarePool.splice(Math.floor(rnd() * rarePool.length), 1)[0]);
const commonGear = gearPool.filter(it => !it.rarity || it.rarity === 'common');
for (let n = 0; n < 90; n++) add('loot: gear', commonGear.splice(Math.floor(rnd() * commonGear.length), 1)[0]);
for (let n = 0; n < 70; n++) add('loot: other', otherPool.splice(Math.floor(rnd() * otherPool.length), 1)[0]);
for (const c of cards) worn(c.item);

// ── 2. crafted pieces, by the smithing law ──
const MAKERS = ['Ada', 'Brannoc', 'Сигрун', 'AutomaticYobaMachine', 'Hlaalu Venim'];
const recipes = RECIPES.filter(r => ['weapon', 'plate', 'shield', 'chain', 'leather', 'jewel', 'garment', 'furniture', 'dish', 'kit'].includes(r.kind));
for (let n = 0; n < 60; n++) {
  const r = pick(recipes);
  const piece = SMITH.mintPiece({ recipe: r.id, quality: Math.floor(rnd() * 5), seed: Math.floor(rnd() * 1e9), maker: pick(MAKERS) }, Math.floor(rnd() * 2 ** 32).toString(16).padStart(8, '0') + Math.floor(rnd() * 2 ** 32).toString(16).padStart(8, '0'));
  add(`crafted: ${r.kind}`, piece);
}

// ── 3. profession materials, as the Stores hand them out ──
for (let n = 0, tries = 0; n < 60 && tries < 600; tries++) { const it = PROF.mintMaterialItem(pick(MARKET).key); if (it) { add('gathered', it); n++; } }

// ── 4. every other template, minted from its row ──
const templates = catalog.knownPublicTemplates;
for (let n = 0; n < 90; n++) {
  const t = pick(templates);
  let item;
  try { item = T.mintCondition(T.setItemFields({ group: t.groups[0] || 'UselessItems2', templateIndex: t.index, material: 0, flags: 0, variant: 0, message: 0, stackCount: 1 })); }
  catch { item = { group: t.groups[0] || 'UselessItems2', templateIndex: t.index }; }
  add('template', item);
}

// ── the world's marks on some of them ──
const FOOD = new Set([531, 532, 533, 534, 535, 536, 537, 538, 685, 686, 687, 688, 1605, 1608, 1609, 1610, 1611, 9001, 9002, 9003, 9004, 9005, 9006, 9007]);
for (const c of cards) {
  const it = c.item;
  if (FOOD.has(it.templateIndex) && it.noRot !== true) it.foodStage = Math.floor(rnd() * 5);
  if (it.group === 'QuestItems' && rnd() < 0.6) it.questItem = true;
  else if (rnd() < 0.03) it.questItem = true;
  if (rnd() < 0.08) it.stolen = true;
  if (it.sigil && typeof it.sigil === 'object') it.sigil = { ...it.sigil, xp: Math.floor(rnd() * 45000) };
  if (it.templateIndex === 274 && rnd() < 0.5) it.trappedSoulType = Math.floor(rnd() * 40);
  if (TRADE.itemIsIdentified(it) === false && rnd() < 0.6) it.isIdentified = true;
}

// ── describe ──
const out = cards.slice(0, 500).map((c, i) => {
  const facts = factsOf(c.item, rnd() < 0.3);
  const ru = gen.describe(packs.ru, c.item, facts), en = gen.describe(packs.en, c.item, facts);
  const keep = ['templateIndex', 'group', 'name', 'material', 'dye', 'rarity', 'legendary', 'gilded', 'aetheric', 'exalted', 'artifact', 'affixes', 'enchantments', 'cursed', 'sockets', 'socket', 'sigil', 'quality', 'maker', 'provenance', 'foodStage', 'noRot', 'slowRot', 'chef', 'potent', 'trappedSoulType', 'poisonType', 'currentCondition', 'maxCondition', 'questItem', 'stolen', 'imbued', 'honed', 'reforges', 'imprint', 'isIdentified', 'magic', 'stackCount', 'variant', 'rriVariant'];
  const item = Object.fromEntries(keep.filter(k => c.item[k] !== undefined).map(k => [k, c.item[k]]));
  return { n: i + 1, source: c.source, ruName: packs.ru.bases[c.item.templateIndex]?.name ?? null, gender: packs.ru.bases[c.item.templateIndex]?.form ?? null,
    longName: (() => { try { return INFO.itemLongName(c.item); } catch { return null; } })(), item, facts,
    ru, en, ruText: gen.paragraphs(ru), enText: gen.paragraphs(en) };
});
fs.writeFileSync(path.join(OUT, 'cards.json'), JSON.stringify(out, null, 1));
const by = {};
for (const c of out) by[c.source.split(':')[0]] = (by[c.source.split(':')[0]] || 0) + 1;
origLog(out.length, 'cards', JSON.stringify(by), 'no description:', out.filter(c => !c.ru.length).length);

// ── a second, separate set: 60 pieces of the highest tiers, rolled at the deepest sources, to read those texts ──
const high = [];
for (let i = 0; i < 6000 && high.length < 60; i++) {
  const level = 20 + Math.floor(rnd() * 21);
  const items = L.generateItems(pick(KEYS), { level, gender: rnd() < 0.5 ? 'male' : 'female' });
  R.rollLootRarity(items, R.pileSource(10, true), { luck: 100, level });
  if (rnd() < 0.6) R.stampWonWeapons(items, 4);
  for (const it of items) if (['legendary', 'aetheric', 'gilded', 'artifact'].includes(it.rarity) || it.artifact) { worn(it); high.push(it); }
}
const rare = high.slice(0, 60).map((it, i) => {
  if (rnd() < 0.08) it.stolen = true;
  if (it.sigil) it.sigil = { ...it.sigil, xp: Math.floor(rnd() * 45000) };
  if (TRADE.itemIsIdentified(it) === false && rnd() < 0.6) it.isIdentified = true;
  const facts = factsOf(it, rnd() < 0.3);
  const ru = gen.describe(packs.ru, it, facts), en = gen.describe(packs.en, it, facts);
  return { n: i + 1, ruName: packs.ru.bases[it.templateIndex]?.name, gender: packs.ru.bases[it.templateIndex]?.form, item: { templateIndex: it.templateIndex, group: it.group, rarity: it.rarity, legendary: it.legendary, gilded: it.gilded, exalted: it.exalted, sigil: it.sigil, cursed: it.cursed },
    facts, ru, en, ruText: gen.paragraphs(ru), enText: gen.paragraphs(en) };
});
fs.writeFileSync(path.join(OUT, 'cards-rare.json'), JSON.stringify(rare, null, 1));
origLog('rare set', rare.length, JSON.stringify(rare.reduce((a, c) => (a[c.item.rarity] = (a[c.item.rarity] || 0) + 1, a), {})));
