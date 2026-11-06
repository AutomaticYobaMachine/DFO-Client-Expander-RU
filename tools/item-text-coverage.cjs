#!/usr/bin/env node
'use strict';
// Do the description tables cover every item template the published game actually registers?
// DFO_PLAYWRIGHT_MODULE=... DFO_CHROMIUM_PATH=... node tools/item-text-coverage.cjs <game-build>
// Exit 1 when a template has no base sentence in a locale. Renamed templates are reported for review: their
// sentence and Russian gender may need to follow the new name.
const path = require('node:path');
const text = require('../src/mod/item-text.cjs');
const { listTemplates } = require('./list-item-templates.cjs');

(async () => {
  const build = path.resolve(process.argv[2] || process.env.DFO_BUILD_DIR || '');
  const { rows, errors, build: version } = await listTemplates(build);
  const packs = ['en', 'ru'].map(locale => text.loadLocale(path.join(text.ROOT, locale)));
  const live = new Map(rows.map(row => [String(row.index), row]));
  let missing = 0;
  for (const pack of packs) {
    const absent = [...live.keys()].filter(key => !Object.hasOwn(pack.bases, key));
    const stale = Object.keys(pack.bases).filter(key => /^\d+$/.test(key) && !live.has(key));
    missing += absent.length;
    console.log(`${pack.locale}: ${live.size - absent.length}/${live.size} templates of ${version} described`);
    for (const key of absent) console.log(`  no sentence: ${key} ${live.get(key).name}`);
    for (const key of stale) console.log(`  not in this build (kept): ${key} ${pack.bases[key].name}`);
  }
  const english = packs[0];
  for (const [key, row] of live) {
    if (Object.hasOwn(english.bases, key) && english.bases[key].name !== row.name) {
      console.log(`  renamed: ${key} "${english.bases[key].name}" -> "${row.name}" (review the sentence and the Russian gender)`);
    }
  }
  for (const error of errors) console.log(`  import error: ${error}`);
  process.exitCode = missing ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 2; });
