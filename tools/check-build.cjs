// Maintenance: which of the mod's hooks find their place in a build's chunks, and whether every changed chunk still
// parses.   node tools/check-build.cjs <dir with assets/>   (tools/fetch-build.mjs gets one)
'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { execFileSync } = require('node:child_process');
const { transformAsset, expectedHooks } = require('../src/mod/transforms.cjs');
const { buildQuests } = require('../src/ru-build.cjs');
const dir = path.join(process.argv[2] ?? '.', 'assets');
const ctx = { marks: true, ru: true, nearbyLoot: true, itemCards: true, inventory: true, fonts: true, fontB64: fs.readFileSync(path.join(__dirname, '..', 'data', 'ru', 'tiny5_cyrillic.woff2')).toString('base64'), quests: buildQuests(path.join(__dirname, '..', 'data', 'ru')), ql: JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'ru', 'ql_ru.json'), 'utf8')) };
const total = new Map(); let changed = 0, bad = 0, remeasureHooks = 0;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dfo-check-'));
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  const { text, log } = transformAsset(`assets/${f}`, src, ctx);
  for (const [id, n] of log) total.set(id, (total.get(id) ?? 0) + n);
  if (log.some(([id, n]) => id === 'inventory.lifecycle' && n > 0)) {
    if (text.includes('globalThis.__dfoInventoryRemeasure$=')) remeasureHooks++;
    else {
      bad++;
      const samples = [...src.matchAll(/\.sync\(/g)].slice(0, 18)
        .map(m => src.slice(Math.max(0, m.index - 190), Math.min(src.length, m.index + 90)));
      console.log('INVENTORY SYNC DIAG ' + f + ': ' + JSON.stringify(samples));
      for (const needle of ['remeasure:', 'draw:!1', 'sync({', 'for(const', 'packFitSig']) {
        const i = src.indexOf(needle);
        if (i >= 0) console.log('INVENTORY NEAR ' + needle + ': ' + src.slice(Math.max(0, i - 190), i + 150));
      }
    }
  }
  if (log.some(([id]) => id.startsWith('inventory.view!error ') || id.startsWith('inventory.lifecycle!error '))) bad++;

  if (text === src) continue;
  changed++;
  const out = path.join(tmp, f.replace(/\.js$/, '.mjs'));
  fs.writeFileSync(out, text);
  try { execFileSync(process.execPath, ['--check', out], { stdio: 'pipe' }); } catch (e) { bad++; console.log(`SYNTAX ${f}: ${String(e.stderr).split('\n').slice(0, 3).join(' ')}`); }
}
fs.rmSync(tmp, { recursive: true, force: true });
const lost = expectedHooks(ctx).filter((id) => !(total.get(id) > 0));
for (const [id, n] of [...total].sort()) console.log(`${id.padEnd(22)} ${n}`);
console.log(`changed files: ${changed}, failed asset checks: ${bad}, native inventory remeasure hooks: ${remeasureHooks}`);
console.log(lost.length ? `NOT FOUND: ${lost.join(', ')}` : 'all expected hooks found');
process.exitCode = bad || lost.length || (ctx.inventory && remeasureHooks !== 1) ? 1 : 0;
