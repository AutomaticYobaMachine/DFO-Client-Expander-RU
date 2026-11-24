'use strict';
// Item description locales: one folder of CSV tables per language (item-text/<locale>/), read once by the hook and
// handed to the page as a single classic script before the game's modules (page/dfo_item_text.js reads it).
//
// <locale>/index.json   { locale, name, forms: [...], formColumn, defaultForm, bases: [csv...], properties: [csv...] }
// bases/*.csv           key,group,name,<formColumn>,text  - one row per item template (key: "102", or "Group:102")
// properties/*.csv      key,<form>,<form>,...             - one sentence per modular property, a column per form
// combos/gear.csv       key,variant,text                  - a weapon or armour piece with its type and {material}
// combos/metals.csv     key,text                          - the metal slot's phrase; "unknown" when it is not shown
// combos/clothing.csv   key,text                          - a garment with its {color} (slot 1, when the game dyed it)
// combos/colors.csv     key,<form>...                     - a dye's colour word in each form ("dye.0": синий/синяя/...)
// combos/properties.csv key,requires,<form>...            - one sentence for two properties ("a+b", "x.*")
// combos/legendaries.csv key,templates,<form>...          - a Legendary's own sentence of {base} and power
// combos/tiers.csv      key,<form>...                     - slot 2: tier + sigil + set ({set})
// combos/sets.csv       key,text                          - a set's name as the game shows it
// ../rules.json                                            - categories and the universal queue of slots
// ../hints.json                                            - each base item's player hint, and what a writ pays silver for
//
// Forms are the grammar a sentence agrees with: English singular/plural (s, p), Russian gender (m, f, n) and the
// plural of pluralia tantum (p: «перчатки», «сапоги»). A base row says its item's form; a property row has a text
// for each form. Nothing here reads game state: the tables are data, the page decides what to say.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, 'item-text');
const LOCALES = Object.freeze({ ru: 'ru', en: 'en' });

/** RFC 4180: quoted fields, doubled quotes, CR/LF line ends, a leading BOM. Answers rows of strings. */
function parseCsv(text) {
  const src = String(text).replace(/^﻿/, '');
  const rows = [];
  let row = [], field = '', quoted = false, i = 0, started = false;
  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"' && field === '') { quoted = true; started = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ''; started = true; i++; continue; }
    if (ch === '\r' || ch === '\n') {
      if (started || field !== '' || row.length) { row.push(field); rows.push(row); }
      row = []; field = ''; started = false;
      i += ch === '\r' && src[i + 1] === '\n' ? 2 : 1; continue;
    }
    field += ch; started = true; i++;
  }
  if (quoted) throw new Error('unterminated quoted field');
  if (started || field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** A CSV table with a header: answers { header, rows: [{column: value}] } and checks every row's width. */
function readTable(file) {
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  if (!rows.length) throw new Error(`${file}: empty table`);
  const header = rows[0].map(h => h.trim());
  if (new Set(header).size !== header.length) throw new Error(`${file}: repeated column`);
  return {
    header,
    rows: rows.slice(1).map((cells, n) => {
      if (cells.length !== header.length) throw new Error(`${file}:${n + 2}: ${cells.length} cells, header has ${header.length}`);
      return Object.fromEntries(header.map((h, k) => [h, cells[k]]));
    }),
  };
}

const KEY = /^(?:[A-Za-z0-9]+:)?\d+$/;
const PROPERTY = /^[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9-]+)*$/;
const COMBO = /^combo\.(?:affix|enchantment|craft)\.[a-z0-9-]+$/;
const PATTERN = /^[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9-]+)*(?:\.\*)?$/;
const PLACEHOLDER = /\{([a-z]+)\}/g;
const PLACEHOLDERS = new Set(['maker', 'house', 'gen', 'count']);
const VARIANTS = new Set(['', 'leather', 'chain', 'plate', 'mail', 'brigandine', 'fur']);
const METAL_KEYS = new Set(['iron', 'steel', 'silver', 'elven', 'dwarven', 'mithril', 'adamantium', 'ebony', 'orcish', 'daedric', 'unknown']);
/** Sigils, sets and wear are never part of a combination; nor is what the identity sentence already says. */
const NEVER_COMBINED = /^(?:sigil|condition|base|gear|legendary|material|construction|tier)(?:\.|$)|^rarity\.(?!imbued$)/;

/** One locale's folder, validated. Throws on any malformed row: a broken table must not ship half a language. */
function loadLocale(dir) {
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  const { locale, forms, formColumn } = index;
  if (typeof locale !== 'string' || !/^[a-z]{2}$/.test(locale)) throw new Error(`${dir}: bad locale`);
  if (!Array.isArray(forms) || !forms.length || forms.some(f => !/^[a-z]$/.test(f))) throw new Error(`${dir}: bad forms`);
  const defaultForm = index.defaultForm ?? forms[0];
  if (!forms.includes(defaultForm)) throw new Error(`${dir}: default form is not one of the forms`);
  const required = Array.isArray(index.requiredForms) ? index.requiredForms : forms;
  const bases = {}, properties = {}, origin = {};
  const checkText = (where, text, allowed = PLACEHOLDERS) => {
    if (/[\r\n]/.test(text)) throw new Error(`${where}: line break inside a sentence`);
    if (text !== text.trim()) throw new Error(`${where}: surrounding spaces`);
    for (const [, name] of text.matchAll(PLACEHOLDER)) if (!allowed.has(name)) throw new Error(`${where}: unknown placeholder {${name}}`);
    if (text.length > 400) throw new Error(`${where}: sentence longer than 400 characters`);
  };
  /** A row of texts, one per form; the required forms must be there. */
  const formsOf = (where, row, allowed) => {
    const text = {};
    for (const form of forms) {
      const value = row[form];
      if (!value) { if (required.includes(form)) throw new Error(`${where}: empty ${form}`); continue; }
      checkText(`${where} ${form}`, value, allowed);
      text[form] = value;
    }
    return text;
  };
  const tables = (list, columns, each) => {
    for (const rel of list ?? []) {
      const file = path.join(dir, rel);
      const { header, rows } = readTable(file);
      for (const column of columns) if (!header.includes(column)) throw new Error(`${file}: no ${column} column`);
      rows.forEach((row, n) => each(row, `${rel}:${n + 2}`));
    }
  };
  for (const rel of index.bases ?? []) {
    const file = path.join(dir, rel);
    const { header, rows } = readTable(file);
    for (const column of ['key', 'name', formColumn, 'text']) if (!header.includes(column)) throw new Error(`${file}: no ${column} column`);
    rows.forEach((row, n) => {
      const where = `${rel}:${n + 2}`;
      if (!KEY.test(row.key)) throw new Error(`${where}: bad key ${JSON.stringify(row.key)}`);
      if (Object.hasOwn(bases, row.key)) throw new Error(`${where}: key ${row.key} already in ${origin['base:' + row.key]}`);
      if (!forms.includes(row[formColumn])) throw new Error(`${where}: ${formColumn} ${JSON.stringify(row[formColumn])} is not one of ${forms.join('/')}`);
      if (!row.name.trim() || !row.text) throw new Error(`${where}: empty name or text`);
      checkText(where, row.text);
      bases[row.key] = { name: row.name, form: row[formColumn], text: row.text };
      origin['base:' + row.key] = where;
    });
  }
  for (const rel of index.properties ?? []) {
    const file = path.join(dir, rel);
    const { header, rows } = readTable(file);
    if (!header.includes('key')) throw new Error(`${file}: no key column`);
    for (const form of forms) if (!header.includes(form)) throw new Error(`${file}: no ${form} column`);
    rows.forEach((row, n) => {
      const where = `${rel}:${n + 2}`;
      if (!PROPERTY.test(row.key)) throw new Error(`${where}: bad key ${JSON.stringify(row.key)}`);
      if (Object.hasOwn(properties, row.key)) throw new Error(`${where}: key ${row.key} already in ${origin['prop:' + row.key]}`);
      const text = {};
      for (const form of forms) {
        const value = row[form];
        if (!value) { if (required.includes(form)) throw new Error(`${where}: empty ${form}`); continue; }
        checkText(`${where} ${form}`, value);
        text[form] = value;
      }
      properties[row.key] = text;
      origin['prop:' + row.key] = where;
    });
  }
  // ── combined fragments ──
  const gear = {}, metals = {}, combos = [], legendaries = {};
  tables(index.gear, ['key', 'variant', 'text'], (row, where) => {
    if (!/^\d+$/.test(row.key) || !VARIANTS.has(row.variant)) throw new Error(`${where}: bad template or variant`);
    const id = `${row.key}:${row.variant}`;
    if (Object.hasOwn(gear, id)) throw new Error(`${where}: frame ${id} repeated`);
    checkText(where, row.text, new Set(['material']));
    gear[id] = row.text;
  });
  tables(index.metals, ['key', 'text'], (row, where) => {
    if (!METAL_KEYS.has(row.key) || Object.hasOwn(metals, row.key)) throw new Error(`${where}: bad or repeated metal ${row.key}`);
    checkText(where, row.text, new Set());
    metals[row.key] = row.text;
  });
  if (Object.keys(gear).length && !metals.unknown) throw new Error(`${dir}: frames need the neutral metal phrase "unknown"`);
  // A garment and its colour: one frame per clothing template, the colour said in the base's form.
  const clothing = {}, colors = {};
  tables(index.clothing, ['key', 'text'], (row, where) => {
    if (!Object.hasOwn(bases, row.key) || Object.hasOwn(clothing, row.key)) throw new Error(`${where}: frame for an unknown or repeated base ${row.key}`);
    checkText(where, row.text, new Set(['color']));
    if ((row.text.match(PLACEHOLDER) || []).length !== 1 || !row.text.includes('{color}')) throw new Error(`${where}: a garment's frame says its {color} once`);
    clothing[row.key] = row.text;
  });
  tables(index.colors, ['key', ...required], (row, where) => {
    if (!/^dye\.\d{1,2}$/.test(row.key) || Object.hasOwn(colors, row.key)) throw new Error(`${where}: bad or repeated colour ${row.key}`);
    const text = formsOf(where, row, new Set());
    if (Object.values(text).some(t => /[.!?]$/.test(t))) throw new Error(`${where}: a colour is a word, not a sentence`);
    colors[row.key] = text;
  });
  if (Object.keys(clothing).length && !Object.keys(colors).length) throw new Error(`${dir}: garment frames need the colours`);
  tables(index.combos, ['key', 'requires', ...forms], (row, where) => {
    if (!COMBO.test(row.key) || combos.some(c => c.key === row.key)) throw new Error(`${where}: bad or repeated combination ${row.key}`);
    const requires = row.requires.split('+');
    if (requires.length < 2 || requires.some(p => !PATTERN.test(p) || NEVER_COMBINED.test(p))) throw new Error(`${where}: bad requirement ${row.requires}`);
    combos.push({ key: row.key, requires, text: formsOf(where, row) });
  });
  tables(index.legendaries, ['key', ...forms], (row, where) => {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(row.key) || Object.hasOwn(legendaries, row.key)) throw new Error(`${where}: bad or repeated legendary ${row.key}`);
    const text = formsOf(where, row, new Set(['base']));
    if (Object.values(text).some(t => !t.includes('{base}'))) throw new Error(`${where}: a legendary's sentence names its base item`);
    legendaries[row.key] = text;
  });
  const tiers = {}, sets = {};
  tables(index.tiers, ['key', ...forms], (row, where) => {
    if (!/^tier\.(?:magic|rare|perfect|legendary|exalted|aetheric|artifact|gilded)\.(?:sigil|set|sigil\.set)$/.test(row.key) || Object.hasOwn(tiers, row.key)) throw new Error(`${where}: bad or repeated tier ${row.key}`);
    tiers[row.key] = formsOf(where, row, new Set(['set']));
  });
  tables(index.sets, ['key', 'text'], (row, where) => {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(row.key) || Object.hasOwn(sets, row.key)) throw new Error(`${where}: bad or repeated set ${row.key}`);
    checkText(where, row.text, new Set());
    sets[row.key] = row.text;
  });
  // Openings a sentence may trade for a synonym when the one before it opens alike.
  const openings = {};
  for (const [from, to] of Object.entries(index.openings ?? {})) {
    if (typeof to !== 'string' || !from.trim() || !to.trim() || /[{}]/.test(from + to)) throw new Error(`${dir}: bad opening ${from}`);
    openings[from] = to;
  }
  const inlineNames = {};
  for (const [key, word] of Object.entries(index.inlineNames ?? {})) {
    if (!Object.hasOwn(bases, key) || typeof word !== 'string' || !word.trim() || /[{}]/.test(word)) throw new Error(`${dir}: bad inline name ${key}`);
    inlineNames[key] = word;
  }
  const rules = loadRules(path.join(dir, '..', 'rules.json'));
  const hints = loadHints(path.join(dir, '..', 'hints.json'));
  // Every hint the map names, and the silver sentences, must be said in this locale: a hint is never left unsaid.
  const named = new Set([...Object.values(hints.templates), ...Object.values(hints.silver).flatMap(kind => [`hint.silver.${kind}`, ...(kind === 'writ' ? ['hint.silver.writ.guild'] : [])])]);
  for (const key of named) if (!Object.hasOwn(properties, key)) throw new Error(`${dir}: no text for ${key}`);
  for (const key of Object.keys(hints.templates)) if (!Object.hasOwn(bases, key)) throw new Error(`${dir}: hints.json names template ${key}, which has no base row`);
  return { locale, name: index.name ?? locale, forms, defaultForm, inlineName: index.inlineName ?? null, bases, properties,
    gear, metals, clothing, colors, combos, legendaries, tiers, sets, rules, hints, openings, inlineNames };
}

/** The universal order every locale shares: categories that sort fragment keys, and the queue of slots. */
const TAKES = new Set(['identity', 'tier', 'random', 'first', 'hint']);
function loadRules(file) {
  if (!fs.existsSync(file)) return { categories: [], queue: [] };
  const rules = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(rules.categories) || !Array.isArray(rules.queue)) throw new Error(`${file}: categories and queue are required`);
  const ids = new Set();
  const categories = rules.categories.map((c, i) => {
    if (typeof c.id !== 'string' || ids.has(c.id)) throw new Error(`${file}: category ${i} has no unique id`);
    ids.add(c.id);
    if (!Array.isArray(c.keys) || !c.keys.length || c.keys.some(k => typeof k !== 'string' || !k)) throw new Error(`${file}: category ${c.id} has no keys`);
    return { id: c.id, title: String(c.title ?? c.id), keys: [...c.keys] };
  });
  const slots = new Set();
  const queue = rules.queue.map((q, i) => {
    if (!Number.isInteger(q.slot) || slots.has(q.slot)) throw new Error(`${file}: queue entry ${i} needs a unique slot number`);
    slots.add(q.slot);
    if (!TAKES.has(q.take)) throw new Error(`${file}: slot ${q.slot} takes ${q.take}`);
    const from = (q.from ?? []).map(f => {
      if (!ids.has(f.category) || !Number.isInteger(f.max) || f.max < 1) throw new Error(`${file}: slot ${q.slot} draws from a bad category`);
      return { category: f.category, max: f.max };
    });
    if ((q.take === 'random' || q.take === 'first') && !from.length) throw new Error(`${file}: slot ${q.slot} draws from nothing`);
    return { slot: q.slot, take: q.take, from, equippable: q.equippable === true };
  });
  return { categories, queue };
}

/** The player hints every locale shares: a hint key for each base item, and what a writ pays silver for. */
const SILVER_KINDS = new Set(['writ', 'potion', 'dish.fighters', 'dish.mara', 'kit']);
function loadHints(file) {
  if (!fs.existsSync(file)) return { templates: {}, silver: {} };
  const hints = JSON.parse(fs.readFileSync(file, 'utf8'));
  const templates = {}, silver = {};
  for (const [key, hint] of Object.entries(hints.templates ?? {})) {
    if (!KEY.test(key) || typeof hint !== 'string' || !/^hint\.[a-z0-9.-]+$/.test(hint)) throw new Error(`${file}: bad hint ${key}: ${hint}`);
    templates[key] = hint;
  }
  for (const [key, kind] of Object.entries(hints.silver ?? {})) {
    if (!KEY.test(key) || !SILVER_KINDS.has(kind)) throw new Error(`${file}: bad silver ${key}: ${kind}`);
    silver[key] = kind;
  }
  return { templates, silver };
}

/** Which locale the page gets: Russian when the Russian translation is installed and on, English otherwise. */
function chooseLocale(ru, root = ROOT) {
  if (ru && fs.existsSync(path.join(root, LOCALES.ru, 'index.json'))) return LOCALES.ru;
  return LOCALES.en;
}

/** The page's script: one validated locale as data. A locale that fails to load gives an empty pack, never a throw. */
function bundle(locale, root = ROOT) {
  let pack;
  try { pack = loadLocale(path.join(root, locale)); }
  catch (error) { return `globalThis.__dfoItemTextPack=null;globalThis.__dfoItemTextError=${JSON.stringify(String(error?.message || error))};\n`; }
  // U+2028/2029 are valid in JSON and in modern JS strings, but escape them for older script parsers.
  const json = JSON.stringify(pack).replace(/[\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16));
  return `globalThis.__dfoItemTextPack=${json};\n`;
}

// ─── the mod's own interface strings ─────────────────────────────────────────────────────────────────────────────
// <locale>/ui/*.csv   key,text,note - every string the mod itself shows (cards, loot, dungeons, marks, town map,
// service windows, the patcher's and the hook's messages). Found by listing the folder, so the description tables'
// generated index.json stays theirs. English carries every key; another locale must say the same keys with the same
// places ({name}, {n:one|other} - see page/dfo_ui_text.js) and its own number of word forms.
const UI_KEY = /^[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9-]+)+$/;
const uiRuntime = () => require('./page/dfo_ui_text.js');
const uiFiles = dir => { try { return fs.readdirSync(path.join(dir, 'ui')).filter(f => f.endsWith('.csv')).sort().map(f => `ui/${f}`); } catch { return []; } };
/** One locale's interface strings, validated: { locale, strings: { key: text } }. Throws on a malformed row. */
function loadUi(dir) {
  const locale = path.basename(dir), forms = uiRuntime().FORMS[locale] ?? 2, strings = {};
  for (const rel of uiFiles(dir)) {
    const { header, rows } = readTable(path.join(dir, rel));
    for (const column of ['key', 'text']) if (!header.includes(column)) throw new Error(`${dir}/${rel}: no ${column} column`);
    rows.forEach((row, n) => {
      const where = `${locale}/${rel}:${n + 2}`;
      if (!UI_KEY.test(row.key)) throw new Error(`${where}: bad key ${JSON.stringify(row.key)}`);
      if (Object.hasOwn(strings, row.key)) throw new Error(`${where}: key ${row.key} repeated`);
      if (!row.text) throw new Error(`${where}: empty text`);
      if (/[\r\n]/.test(row.text)) throw new Error(`${where}: a line break goes in as \\n`);
      for (const [name, count] of Object.entries(uiRuntime().places(row.text))) {
        if (count && count !== forms) throw new Error(`${where}: {${name.slice(0, -1)}:...} needs ${forms} word forms`);
      }
      strings[row.key] = row.text.replace(/\\n/g, '\n');
    });
  }
  return { locale, strings };
}
/** The strings a page or the patcher speaks: English under the locale's own, so nothing is ever left keyless. */
function uiPack(locale, root = ROOT) {
  const en = loadUi(path.join(root, LOCALES.en));
  if (locale === LOCALES.en) return en;
  const own = loadUi(path.join(root, locale));
  return { locale: own.locale, strings: { ...en.strings, ...own.strings } };
}
/** The page's script: the chosen locale's interface strings as data. A broken table gives English, never a throw. */
function uiBundle(locale, root = ROOT) {
  let pack;
  try { pack = uiPack(locale, root); }
  catch (error) {
    try { pack = uiPack(LOCALES.en, root); } catch { pack = { locale: LOCALES.en, strings: {} }; }
    pack.error = String(error?.message || error);
  }
  const json = JSON.stringify(pack).replace(/[\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16));
  return `globalThis.__dfoUiPack=${json};\n`;
}
/** Node's accessor (the hook's report, the patcher's messages): t(key, params) in the chosen locale. */
function uiText(locale, root = ROOT) {
  let pack;
  try { pack = uiPack(locale, root); } catch { try { pack = uiPack(LOCALES.en, root); } catch { pack = { locale: LOCALES.en, strings: {} }; } }
  return uiRuntime().make(pack);
}

/** Every file a locale needs, relative to the item-text folder: what the patcher puts into the game's archive. */
function localeFiles(locale, root = ROOT) {
  const index = JSON.parse(fs.readFileSync(path.join(root, locale, 'index.json'), 'utf8'));
  return ['index.json', ...['bases', 'properties', 'gear', 'metals', 'clothing', 'colors', 'combos', 'legendaries', 'tiers', 'sets'].flatMap(k => index[k] ?? []),
    ...uiFiles(path.join(root, locale))].map(rel => `${locale}/${rel}`);
}
/** What an install carries: the shared rules and hints and the files of each locale it speaks. */
const installFiles = (locales, root = ROOT) => ['rules.json', 'hints.json', ...locales.flatMap(locale => localeFiles(locale, root))];

module.exports = { ROOT, LOCALES, parseCsv, readTable, loadLocale, loadRules, loadHints, chooseLocale, bundle, localeFiles, installFiles,
  loadUi, uiPack, uiBundle, uiText, uiFiles };
