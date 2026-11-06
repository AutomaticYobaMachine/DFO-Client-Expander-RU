'use strict';
// Item description locales: one folder of CSV tables per language (item-text/<locale>/), read once by the hook and
// handed to the page as a single classic script before the game's modules (page/dfo_item_text.js reads it).
//
// <locale>/index.json   { locale, name, forms: [...], formColumn, defaultForm, bases: [csv...], properties: [csv...] }
// bases/*.csv           key,group,name,<formColumn>,text  - one row per item template (key: "102", or "Group:102")
// properties/*.csv      key,<form>,<form>,...             - one sentence per modular property, a column per form
// combos/gear.csv       key,variant,text                  - a weapon or armour piece with its type and {material}
// combos/metals.csv     key,text                          - the metal slot's phrase; "unknown" when it is not shown
// combos/properties.csv key,requires,<form>...            - one sentence for two properties ("a+b", "x.*")
// combos/legendaries.csv key,templates,<form>...          - a Legendary's own sentence of {base} and power
// ../rules.json                                            - groups ranked by relevance and the fragment limit
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
const NEVER_COMBINED = /^(?:sigil|condition|base|gear|legendary|material|construction)(?:\.|$)/;

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
  const rules = loadRules(path.join(dir, '..', 'rules.json'));
  return { locale, name: index.name ?? locale, forms, defaultForm, inlineName: index.inlineName ?? null, bases, properties,
    gear, metals, combos, legendaries, rules };
}

/** The ranking every locale shares: groups from the most relevant, each with its cap, and the overall limit. */
function loadRules(file) {
  if (!fs.existsSync(file)) return { limit: null, groups: [] };
  const rules = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Number.isInteger(rules.limit) || rules.limit < 1) throw new Error(`${file}: limit must be a positive integer`);
  if (!Array.isArray(rules.groups)) throw new Error(`${file}: no groups`);
  const ids = new Set();
  const groups = rules.groups.map((g, i) => {
    if (typeof g.id !== 'string' || ids.has(g.id)) throw new Error(`${file}: group ${i} has no unique id`);
    ids.add(g.id);
    if (!Array.isArray(g.keys) || !g.keys.length || g.keys.some(k => typeof k !== 'string' || !k)) throw new Error(`${file}: group ${g.id} has no keys`);
    if (!Number.isInteger(g.max) || g.max < 1) throw new Error(`${file}: group ${g.id} needs a positive max`);
    return { id: g.id, keys: [...g.keys], max: g.max };
  });
  return { limit: rules.limit, groups };
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

/** Every file a locale needs, relative to the item-text folder: what the patcher puts into the game's archive. */
function localeFiles(locale, root = ROOT) {
  const index = JSON.parse(fs.readFileSync(path.join(root, locale, 'index.json'), 'utf8'));
  return ['index.json', ...['bases', 'properties', 'gear', 'metals', 'combos', 'legendaries'].flatMap(k => index[k] ?? [])]
    .map(rel => `${locale}/${rel}`);
}
/** What an install carries: the shared rules and the files of each locale it speaks. */
const installFiles = (locales, root = ROOT) => ['rules.json', ...locales.flatMap(locale => localeFiles(locale, root))];

module.exports = { ROOT, LOCALES, parseCsv, readTable, loadLocale, loadRules, chooseLocale, bundle, localeFiles, installFiles };
