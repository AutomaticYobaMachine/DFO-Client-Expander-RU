(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) api.install(root);
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  // The mod's own interface strings, in the one language this install speaks: the same locale packs as the item
  // descriptions (src/mod/item-text/<en|ru>/ui/*.csv) and the same choice - Russian with the translation installed and
  // on, English otherwise. The hook serves the chosen locale as data (dfo_ui_text_data.js: __dfoUiPack), English
  // already under it, so a key the locale lacks still reads in English.
  //
  //   t('loot.title')                         the string
  //   t('loot.count', { n: 3 })               {n} - a value
  //   t('loot.items', { n: 3 })               {n:item|items} - a word for the number (en: one|other; ru: one|few|many)
  //   number(1234.5, { maximumFractionDigits: 1 })   the locale's own digits and separators
  const PLURAL = Object.freeze({
    en: n => (n === 1 ? 0 : 1),
    ru: n => {
      if (!Number.isInteger(n)) return 1;   // «1,5 метра»
      const a = Math.abs(n) % 100, b = a % 10;
      return a > 10 && a < 20 ? 2 : b === 1 ? 0 : b >= 2 && b <= 4 ? 1 : 2;
    },
  });
  const FORMS = Object.freeze({ en: 2, ru: 3 });
  const PLACE = /\{([A-Za-z][A-Za-z0-9]*)(?::([^{}]*))?\}/g;
  const TAGS = Object.freeze({ en: 'en-US', ru: 'ru-RU' });

  /** Fill a string's places: values as they are, number words by the locale's plural rule. A missing value keeps its
   *  place visible rather than silently dropping words. */
  function format(text, params, locale) {
    return String(text).replace(PLACE, (all, name, forms) => {
      const value = params && Object.prototype.hasOwnProperty.call(params, name) ? params[name] : undefined;
      if (forms == null) return value == null ? all : String(value);
      const list = forms.split('|'), n = Number(value);
      if (!Number.isFinite(n)) return list[list.length - 1];
      const rule = PLURAL[locale] || PLURAL.en;
      return list[Math.min(rule(n), list.length - 1)];
    });
  }
  /** The places a string names, for the tables' checks: { name: number of word forms, or 0 for a value }. */
  function places(text) {
    const out = {};
    for (const m of String(text).matchAll(PLACE)) out[m[1] + (m[2] == null ? '' : ':')] = m[2] == null ? 0 : m[2].split('|').length;
    return out;
  }
  function make(pack) {
    const strings = pack && typeof pack.strings === 'object' && pack.strings ? pack.strings : {};
    const locale = pack && typeof pack.locale === 'string' ? pack.locale : 'en';
    const numbers = new Map();
    const t = (key, params) => (Object.prototype.hasOwnProperty.call(strings, key) ? format(strings[key], params, locale) : key);
    return Object.freeze({
      locale,
      tag: TAGS[locale] || TAGS.en,
      t,
      has: key => Object.prototype.hasOwnProperty.call(strings, key),
      /** The locale's own digits: «1 234,5» in Russian, "1,234.5" in English. */
      number(value, options) {
        const id = JSON.stringify(options || {});
        if (!numbers.has(id)) numbers.set(id, new Intl.NumberFormat(TAGS[locale] || TAGS.en, options));
        return numbers.get(id).format(value);
      },
      plural: n => (PLURAL[locale] || PLURAL.en)(n),
    });
  }
  function install(win) {
    if (win.__dfoUi) return;
    win.__dfoUi = make(win.__dfoUiPack);
  }
  /** A page script's accessor: the installed strings, or the key itself before they load (never a throw). */
  function bind(root) {
    return (key, params) => (root.__dfoUi ? root.__dfoUi.t(key, params) : key);
  }
  return { PLURAL, FORMS, TAGS, format, places, make, install, bind };
});
