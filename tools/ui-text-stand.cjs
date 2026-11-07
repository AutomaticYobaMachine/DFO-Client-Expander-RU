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

module.exports = { standLocale, uiData, uiRuntime, uiScripts };
