'use strict';
// Item description locales: one folder of CSV tables per language (item-text/<locale>/), read once by the hook and
// handed to the page as a single classic script before the game's modules (page/dfo_item_text.js reads it).
//
// <locale>/index.json   { locale, name, forms: [...], formColumn, defaultForm, bases: [csv...], properties: [csv...] }
// bases/*.csv           key,group,name,<formColumn>,text  - one row per item template (key: "102", or "Group:102")
// properties/*.csv      key,<form>,<form>,...             - one sentence per modular property, a column per form
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
const PLACEHOLDER = /\{([a-z]+)\}/g;
const PLACEHOLDERS = new Set(['maker', 'house', 'gen', 'count']);

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
  const checkText = (where, text) => {
    if (/[\r\n]/.test(text)) throw new Error(`${where}: line break inside a sentence`);
    if (text !== text.trim()) throw new Error(`${where}: surrounding spaces`);
    for (const [, name] of text.matchAll(PLACEHOLDER)) if (!PLACEHOLDERS.has(name)) throw new Error(`${where}: unknown placeholder {${name}}`);
    if (text.length > 400) throw new Error(`${where}: sentence longer than 400 characters`);
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
  return { locale, name: index.name ?? locale, forms, defaultForm, bases, properties };
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
  return ['index.json', ...(index.bases ?? []), ...(index.properties ?? [])].map(rel => `${locale}/${rel}`);
}

module.exports = { ROOT, LOCALES, parseCsv, readTable, loadLocale, chooseLocale, bundle, localeFiles };
