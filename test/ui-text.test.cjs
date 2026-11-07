'use strict';
// The mod's own words in two languages (docs/ui-text.md): every table has its English and Russian twin with the same
// keys and places, the English one speaks no Russian, every key the code names exists, and no new Russian literal
// slips into a script past the packs.
const { test } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const text = require('../src/mod/item-text.cjs'), runtime = require('../src/mod/page/dfo_ui_text.js');

const ROOT = path.join(__dirname, '..');
const PACKS = { mod: path.join(ROOT, 'src/mod/item-text'), installer: path.join(ROOT, 'src/gui/locale') };
const CYR = /[А-Яа-яЁё]/;
const placeNames = t => [...new Set(Object.keys(runtime.places(t)).map(k => k.replace(/:$/, '')))].sort();
const load = (root, locale) => text.loadUi(path.join(root, locale)).strings;
// English words that are Russian on purpose: the switch names the language it turns to; a Windows file's name.
const RUSSIAN_IN_ENGLISH = new Set(['installer.button.lang', 'patcher.err.noAsar']);

test('every table has an English and a Russian twin: the same files, keys and places', () => {
  for (const [what, root] of Object.entries(PACKS)) {
    assert.deepEqual(fs.readdirSync(path.join(root, 'ru', 'ui')).sort(), fs.readdirSync(path.join(root, 'en', 'ui')).sort(), `${what}: the same tables`);
    const en = load(root, 'en'), ru = load(root, 'ru');
    assert.ok(Object.keys(en).length > 100, what);
    assert.deepEqual(Object.keys(ru).sort(), Object.keys(en).sort(), `${what}: the same keys`);
    for (const key of Object.keys(en)) assert.deepEqual(placeNames(ru[key]), placeNames(en[key]), `${what} ${key}: the same places`);
  }
});

test('the English tables speak no Russian; the Russian ones have their words', () => {
  for (const [what, root] of Object.entries(PACKS)) {
    for (const [key, value] of Object.entries(load(root, 'en'))) if (!RUSSIAN_IN_ENGLISH.has(key)) assert.doesNotMatch(value, CYR, `${what} en ${key}`);
    const ru = load(root, 'ru');
    const russian = Object.values(ru).filter(v => CYR.test(v)).length;
    assert.ok(russian / Object.keys(ru).length > 0.85, `${what}: ${russian} of ${Object.keys(ru).length} Russian rows`);
  }
});

test('the runtime fills places and plurals in both languages', () => {
  const en = runtime.make({ locale: 'en', strings: { k: '{n} {n:item|items} in {where}' } }), ru = runtime.make({ locale: 'ru', strings: { k: '{n} {n:вещь|вещи|вещей} в {where}' } });
  assert.equal(en.t('k', { n: 1, where: 'town' }), '1 item in town');
  assert.equal(en.t('k', { n: 3, where: 'town' }), '3 items in town');
  assert.deepEqual([1, 3, 5, 11, 21, 1.5].map(n => ru.t('k', { n, where: 'городе' }).split(' ')[1]), ['вещь', 'вещи', 'вещей', 'вещей', 'вещь', 'вещи']);
  assert.equal(en.t('missing'), 'missing', 'a key without a word is shown as it is');
  assert.equal(en.t('k', { n: 2 }), '2 items in {where}', 'a missing value keeps its place visible');
  // English under Russian: a key the Russian table lacks still reads in English.
  const pack = text.uiPack('ru');
  assert.equal(pack.locale, 'ru');
  assert.ok(Object.keys(pack.strings).length >= Object.keys(text.uiPack('en').strings).length);
});

// Keys the code names literally - T('a.b'), L("a.b"), __dfoUi?.t(`a.b`) - and the prefixes of the ones it builds.
test('every key the code names exists in the English table', () => {
  const page = path.join(ROOT, 'src/mod/page'), mod = path.join(ROOT, 'src/mod');
  const en = load(PACKS.mod, 'en'), keys = Object.keys(en);
  const js = { literal: /(?:\b[TL]|__dfoUi\??\.t)\((['"`])([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9-]+)+)\1/g, template: /(?:\b[TL]|__dfoUi\??\.t)\(`([a-z][A-Za-z0-9]*\.[A-Za-z0-9.-]*)\$\{/g };
  const sources = [
    [page, fs.readdirSync(page).filter(f => /^dfo_.*\.js$/.test(f))],
    [mod, fs.readdirSync(mod).filter(f => f.endsWith('.cjs'))],
    [path.join(ROOT, 'src'), ['patcher.cjs']],
  ];
  let count = 0;
  for (const [dir, files] of sources) {
    for (const file of files) {
      const src = fs.readFileSync(path.join(dir, file), 'utf8');
      for (const m of src.matchAll(js.literal)) { count++; assert.ok(Object.hasOwn(en, m[2]), `${file}: ${m[2]} has no English row`); }
      for (const m of src.matchAll(js.template)) assert.ok(keys.some(k => k.startsWith(m[1])), `${file}: nothing under ${m[1]}`);
    }
  }
  assert.ok(count > 800, `${count} keys named`);
  // The installer: T("installer.…") and sayKey("installer.…"), and the key strings it keeps for later.
  const gui = path.join(ROOT, 'src/gui'), installer = load(PACKS.installer, 'en');
  let go = 0;
  for (const file of fs.readdirSync(gui).filter(f => f.endsWith('.go') && !f.endsWith('_test.go'))) {
    const src = fs.readFileSync(path.join(gui, file), 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    for (const m of src.matchAll(/"(installer\.[A-Za-z0-9.-]*[A-Za-z0-9])"/g)) {
      go++;
      if (m[1].endsWith('.')) continue;
      assert.ok(Object.hasOwn(installer, m[1]) || Object.keys(installer).some(k => k.startsWith(m[1] + '.')), `${file}: ${m[1]}`);
    }
  }
  assert.ok(go > 150, `${go} installer keys named`);
  for (const id of ['browse', 'refresh', 'components', 'journal', 'saveLog', 'openLog', 'openReport', 'installerLog', 'updates', 'readme', 'uninstall', 'install', 'lang']) assert.ok(installer[`installer.button.${id}`], id);
  for (const key of ['ru', 'marks', 'nearbyLoot', 'dungeons', 'itemCards', 'fonts']) for (const part of ['title', 'badge', 'description']) assert.ok(installer[`installer.feature.${key}.${part}`], `${key} ${part}`);
});

// Russian literals that stay in code on purpose, by file: the translation's own runtime, glyph probes, the game's
// labels translated only with ru (service windows), and the translation's quest-text patches. A new one goes into
// the packs instead - or here, with a reason.
const RUSSIAN_CODE = { 'page/dfo_fonts.js': 4, 'page/dfo_services.js': 101, 'transforms.cjs': 5 };
const RUSSIAN_FILES = new Set(['page/ru_items.js', 'page/ru_locale.js']);
test('no Russian literal in the mod\'s scripts past the packs', { skip: !(() => { try { require.resolve(process.env.DFO_ACORN_MODULE || 'acorn'); return true; } catch { return false; } })() && 'acorn is not installed' }, () => {
  const acorn = require(process.env.DFO_ACORN_MODULE || 'acorn');
  const mod = path.join(ROOT, 'src/mod');
  const files = [...fs.readdirSync(mod).filter(f => f.endsWith('.cjs')), ...fs.readdirSync(path.join(mod, 'page')).filter(f => f.endsWith('.js')).map(f => `page/${f}`), '../patcher.cjs'];
  for (const rel of files) {
    if (RUSSIAN_FILES.has(rel) || rel === 'page/dfo_font_data.js') continue;
    const src = fs.readFileSync(path.join(mod, rel), 'utf8');
    let russian = 0;
    for (const token of acorn.tokenizer(src, { ecmaVersion: 'latest', allowHashBang: true, allowReturnOutsideFunction: true })) {
      if ((token.type.label === 'string' || token.type.label === 'template') && CYR.test(String(token.value))) russian++;
    }
    assert.ok(russian <= (RUSSIAN_CODE[rel] ?? 0), `${rel}: ${russian} Russian literals, ${RUSSIAN_CODE[rel] ?? 0} allowed - put the words into src/mod/item-text/<en|ru>/ui/`);
  }
});

test('no Russian string in the installer\'s Go code', () => {
  const gui = path.join(ROOT, 'src/gui');
  for (const file of fs.readdirSync(gui).filter(f => f.endsWith('.go') && !f.endsWith('_test.go'))) {
    const code = fs.readFileSync(path.join(gui, file), 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    for (const m of code.matchAll(/"(?:[^"\\\n]|\\.)*"|`[^`]*`/g)) assert.doesNotMatch(m[0], CYR, `${file}: ${m[0].slice(0, 60)} - put it into src/gui/locale/<en|ru>/ui/installer.csv`);
  }
});
