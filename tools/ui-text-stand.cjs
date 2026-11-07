'use strict';
// The mod's interface strings for the browser stands: the same pack the hook serves (dfo_ui_text_data.js) and the
// runtime (dfo_ui_text.js), inlined before the page's own scripts. The stands that check Russian words load the
// Russian pack by default; DFO_UI_LOCALE=en runs them with the English one.
const fs = require('node:fs'), path = require('node:path');
const itemText = require('../src/mod/item-text.cjs');
const RUNTIME = path.join(__dirname, '../src/mod/page/dfo_ui_text.js');

const standLocale = (fallback = 'ru') => (process.env.DFO_UI_LOCALE === 'en' || process.env.DFO_UI_LOCALE === 'ru' ? process.env.DFO_UI_LOCALE : fallback);
/** The two scripts' sources: the locale's pack, then the runtime that installs __dfoUi from it. */
const uiData = (locale) => itemText.uiBundle(locale);
const uiRuntime = () => fs.readFileSync(RUNTIME, 'utf8');
/** Both as inline <script> tags, for a stand's own HTML. */
const uiScripts = (locale = standLocale()) =>
  `<script>${uiData(locale).replace(/<\/script/gi, '<\\/script')}</script><script>${uiRuntime()}</script>`;

/** The stand's words on the Node side, in the same pack the page gets: say('loot.takeAll'), say('town.count.shops', { n: 3 }). */
const packs = new Map();
const say = (key, params, locale = standLocale()) => {
  if (!packs.has(locale)) packs.set(locale, itemText.uiText(locale));
  const pack = packs.get(locale);
  if (!pack.has(key)) throw new Error(`ui-text-stand: no ${locale} words for ${key}`);
  return pack.t(key, params);
};
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A pattern for a key's words: the fixed words as they are, a value place any text, a number's place its word forms. */
const raw = new Map();
const sayRe = (key, flags = '', locale = standLocale()) => {
  if (!raw.has(locale)) raw.set(locale, itemText.uiPack(locale).strings);
  const text = raw.get(locale)[key];
  if (text == null) throw new Error(`ui-text-stand: no ${locale} words for ${key}`);
  let out = '', at = 0;
  for (const m of text.matchAll(/\{([A-Za-z][A-Za-z0-9]*)(?::([^{}]*))?\}/g)) {
    out += escape(text.slice(at, m.index)) + (m[2] == null ? '[^]*?' : `(?:${m[2].split('|').map(escape).join('|')})`);
    at = m.index + m[0].length;
  }
  return new RegExp(out + escape(text.slice(at)), flags);
};

/** The longest fixed piece of a key's words (no places): for a page-side includes() check. */
const sayPart = (key, locale = standLocale()) => {
  if (!raw.has(locale)) raw.set(locale, itemText.uiPack(locale).strings);
  const text = raw.get(locale)[key];
  if (text == null) throw new Error(`ui-text-stand: no ${locale} words for ${key}`);
  return text.split(/\{[A-Za-z][A-Za-z0-9]*(?::[^{}]*)?\}/).reduce((a, b) => (b.trim().length > a.trim().length ? b : a), '').trim();
};
/** A number in the stand language's digits, as __dfoUi.number writes it: 0,55 in Russian, 0.55 in English. */
const sayNum = (value, options, locale = standLocale()) => new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US', options).format(value);

module.exports = { standLocale, uiData, uiRuntime, uiScripts, say, sayRe, sayPart, sayNum, escape };
