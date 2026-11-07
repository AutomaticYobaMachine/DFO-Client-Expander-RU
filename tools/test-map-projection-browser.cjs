#!/usr/bin/env node
'use strict';
// The Overworld readout's own projection step, as the published game runs it: the travelView factory with the mod's
// transforms builds the records its HUD draws, frame after frame. Each record must carry the dungeon's data
// (dungeon.travelView), the calibration's small/quiet flags re-measured as the player moves - also on a record the
// readout keeps between frames (fonts.mapProject, 0.1.14574+) - and the list must pass the town map's filter
// (town.markFilter). The HUD's own drawing is covered by the dungeon and calibration stands; this one runs the step
// between the world's marks and the HUD, which a release can rewrite (0.1.14574 cached the records per mark key).
//   node tools/test-map-projection-browser.cjs <game-build>      (DFO_BUILD_DIR by default)
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require(process.env.DFO_PLAYWRIGHT_MODULE || 'playwright');
const { transformAsset } = require('../src/mod/transforms.cjs');
const root = path.resolve(__dirname, '..'), build = path.resolve(process.argv[2] || process.env.DFO_BUILD_DIR || '');
const view = fs.readdirSync(path.join(build, 'assets')).find(f => /^travelView-[^.]+\.js$/.test(f));
assert.ok(view, 'Need the published travelView chunk');
const ctx = { fonts: true, ru: false, marks: true, dungeons: true, nearbyLoot: false, itemCards: false };
const html = `<!doctype html><html><head><meta charset="utf-8">
<script>window.__DFO_MOD_CFG__={fonts:{enabled:true}};</script>
<script src="/dfo-mod/dfo_font_data.js"></script><script src="/dfo-mod/dfo_fonts.js"></script></head><body>
<script type="module">
const mod = await import('/assets/${view}');
const factory = Object.values(mod).find(f => typeof f === 'function' && String(f).includes('.hud.update(') && String(f).includes('travel-view'));
const pos = [0, 0, 0], frames = [];
window.__dfoFonts.calibration.host({ player: { pos } });
const marks = [
  { key: 'dungeon:1', at: [100, 0, 0], label: 'Hold', sub: 'Crypt', kind: 'dungeon', pick: true, dfoDungeon: { signature: 'hold' } },
  { key: 'gather:far', at: [2000, 0, 0], label: 'Iron vein', kind: 'gather mining' },
  { key: 'gather:near', at: [500, 0, 0], label: 'Copper vein', kind: 'gather mining' },
  { key: 'place:town', at: [3000, 0, 0], label: 'Daggerfall', kind: 'place town', pick: true },
];
const deps = { win: window, canvas: document.createElement('canvas'), schedule: () => null, cancel: () => {}, alive: () => true,
  allowed: () => ({ ok: true }), danger: () => false, windowUp: () => false, feet: () => [pos[0], pos[1], pos[2]], yaw: () => 0,
  headView: () => ({ eye: [0, 1.6, 0], fwd: [0, 0, -1] }), project: p => ({ x: p[0], y: p[2], front: true }), marks: () => marks,
  route: () => [], say() {}, holdBody() {}, freeCursor() {}, hintKeys: () => null,
  hud: { show() {}, hide() {}, update: u => frames.push(u.marks) } };
const travel = factory(deps);
window.run = step => {
  if (step.player) pos.splice(0, 3, ...step.player);
  window.__dfoMarkFilter = step.filter ? list => list.filter(m => m.kind !== 'place town') : undefined;
  if (!travel.active) travel.enter();
  travel.drawHud();
  const list = frames.at(-1);
  return { keys: list.map(r => r.key), records: list.map(r => ({ key: r.key, dungeon: r.dfoDungeon?.signature ?? null, small: !!r.dfoSmall, quiet: !!r.dfoQuiet })),
    reused: frames.length > 1 && list.some(r => frames.at(-2).includes(r)) };
};
window.ready = !!factory;
</script></body></html>`;
const cache = new Map();
const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html;charset=utf-8'); return res.end(html); }
    if (url.pathname === '/dfo-mod/dfo_font_data.js' || url.pathname === '/dfo-mod/dfo_fonts.js') {
      res.setHeader('Content-Type', 'text/javascript'); return res.end(fs.readFileSync(path.join(root, 'src/mod/page', path.basename(url.pathname))));
    }
    const file = path.resolve(build, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(build + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    if (file.endsWith('.js')) {
      res.setHeader('Content-Type', 'text/javascript');
      if (!cache.has(file)) cache.set(file, transformAsset(url.pathname.slice(1), fs.readFileSync(file, 'utf8'), ctx).text);
      return res.end(cache.get(file));
    }
    return res.end(fs.readFileSync(file));
  } catch (error) { res.writeHead(500); res.end(String(error?.stack || error)); }
});

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.DFO_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.stack));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.ready === true || window.ready === false);
    assert.equal(await page.evaluate(() => window.ready), true, 'the published travelView factory');
    const at = (frame, key) => frame.records.find(r => r.key === key);
    // Frame 1, the player at the origin: the dungeon keeps its data, the far resource is quiet, the town is untouched.
    const first = await page.evaluate(() => window.run({ player: [0, 0, 0] }));
    assert.deepEqual(first.keys, ['dungeon:1', 'gather:far', 'gather:near', 'place:town']);
    assert.equal(at(first, 'dungeon:1').dungeon, 'hold', 'the dungeon record keeps dfoDungeon');
    assert.deepEqual([at(first, 'gather:far').small, at(first, 'gather:far').quiet], [true, true], 'over 1000 m: quiet');
    assert.deepEqual([at(first, 'gather:near').small, at(first, 'gather:near').quiet], [true, false], 'within 1000 m: shown');
    assert.deepEqual([at(first, 'place:town').small, at(first, 'place:town').quiet], [false, false], 'towns keep their labels');
    // Frame 2, the player has walked 1900 m: the same records (kept by the readout where it caches them) are re-measured.
    const second = await page.evaluate(() => window.run({ player: [1900, 0, 0] }));
    assert.equal(at(second, 'gather:far').quiet, false, 'now 100 m away: shown');
    assert.equal(at(second, 'gather:near').quiet, true, 'now 1400 m away: quiet');
    assert.equal(at(second, 'dungeon:1').dungeon, 'hold', 'a reused record keeps dfoDungeon');
    // Frame 3, the town map open: its filter decides which marks the readout projects.
    const third = await page.evaluate(() => window.run({ filter: true }));
    assert.deepEqual(third.keys, ['dungeon:1', 'gather:far', 'gather:near'], 'the town map filter applies');
    assert.deepEqual(errors, [], 'no page errors');
    console.log(`PASS: ${view} projection - dungeon data, quiet labels re-measured${second.reused ? ' on reused records' : ''}, town map filter`);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
