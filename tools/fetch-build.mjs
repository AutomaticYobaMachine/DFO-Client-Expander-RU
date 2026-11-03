// Maintenance: the game's chunks the mod hooks into, for one release, out of its per-file pack (HTTP ranges - a few MB,
// not the whole game).   node tools/fetch-build.mjs <version e.g. 0.1.14375> <out dir>
// Behind a proxy: NODE_USE_ENV_PROXY=1.
import fs from 'node:fs'; import zlib from 'node:zlib'; import path from 'node:path';
const [version, out] = process.argv.slice(2);
if (!version || !out) { console.log('usage: node tools/fetch-build.mjs <version> <out dir>'); process.exit(1); }
const REL = `https://github.com/Lattymoy/daggerfall-js-source/releases/download/app-v${version}`;
const man = JSON.parse(zlib.gunzipSync(Buffer.from(await (await fetch(`${REL}/DFO-Online-game.json.gz`)).arrayBuffer())));
const byPath = new Map(man.files.map((f) => [f.path, f]));
const quests = new Set(Object.keys(JSON.parse(fs.readFileSync(new URL('../data/ru/quest_display_names_ru.json', import.meta.url), 'utf8'))).map((k) => k.toUpperCase()));
const downloaded = new Map();
async function get(f) {
  if (downloaded.has(f.path)) return downloaded.get(f.path);
  const r = await fetch(`${REL}/${man.pack.file}`, { headers: { Range: `bytes=${f.offset}-${f.offset + f.length - 1}` } });
  if (r.status !== 206) throw new Error(`${f.path}: HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const body = f.encoding === 'br' ? zlib.brotliDecompressSync(buf) : buf;
  const dst = path.join(out, f.path); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, body);
  const text = body.toString('utf8');
  downloaded.set(f.path, text);
  return text;
}
const want = new Set(['play/index.html']);
for (const f of man.files) {
  const m = /^assets\/(.+)-[A-Za-z0-9_-]{8}\.js$/.exec(f.path);
  if (!m) continue;
  if (/^(world|exterior|enhancedInventory|itemTransfer|pixelifyFive|notify|enhancedChargen|tutorials|deepWaterRuntime|localeData)$/.test(m[1]) || quests.has(m[1].toUpperCase())) want.add(f.path);
}
// Follow the chosen chunks' own imports too: the inventory is lazy-loaded, and its
// dependencies are not necessarily direct imports of the world chunk.
let n = 0;
for (const p of want) {
  if (!byPath.has(p)) continue;
  const body = await get(byPath.get(p)); n++;
  if (!p.endsWith('.js')) continue;
  for (const m of body.matchAll(/(?:from\s*|import\s*(?:\(\s*)?)["'`]((?:\.\.?\/)[\w./$-]+\.js)["'`]/g)) {
    const dep = path.posix.normalize(path.posix.join(path.posix.dirname(p), m[1]));
    if (byPath.has(dep)) want.add(dep);
  }
  // Module workers are addressed by Vite through new URL(), not an import.
  for (const m of body.matchAll(/new URL\(["'`]([\w./$-]+\.js)["'`],\s*import\.meta\.url\)/g)) {
    const dep = path.posix.normalize(path.posix.join(path.posix.dirname(p), m[1]));
    if (byPath.has(dep)) want.add(dep);
  }
}
console.log(`${version}: ${n} files in ${out}`);
