// DFO Mod - the shell's dagger:// handler, wrapped (installed into app.asar's main.cjs by the patcher).
//
// The game's files are served as they are, from wherever the shell keeps them - the install's seed or a version the
// per-file channel brought (<userData>/Game/v...) - and the mod's hooks are put into them on the way out
// (transforms.cjs). Nothing on disk is changed, so the game's own updates go on and the mod rides every new version.
// Anything that fails here gives the shell's own answer: the game always runs, at worst without the mod.
//
// <userData>/dfo-mod.json - the switches: { "enabled", "ru", "marks", "marksOptions": {...} }.
// <userData>/dfo-mod.log  - what each hook found, a session at a time.
// <userData>/dfo-mod-cache.json - the town map's cache (towns' owners, players' guilds, guilds' names), the page's.
'use strict';
const fs = require('node:fs');          // Electron's: reads inside app.asar, where this payload lives
const path = require('node:path');
const { transformAsset, injectPage, EXPECTED } = require('./transforms.cjs');
const { createLootStore } = require('./loot-store.cjs');

const VERSION = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf8')).version; } catch { return '?'; } })();
const DEFAULTS = Object.freeze({
  enabled: true, ru: true, marks: true, nearbyLoot: true, dungeons: true,
  nearbyLootOptions: { keyCode: 'KeyJ' },
  marksOptions: { onlyVisited: true, markRadiusM: 1200, nameRadiusM: 300, maxMarks: 60 },
});
const OWN = Object.freeze({   // served at dagger://game/dfo-mod/<name>
  'dfo_dungeon_model.js': 'page/dfo_dungeon_model.js', 'dfo_dungeons.js': 'page/dfo_dungeons.js',
  'dfo_loot_rules.js': 'page/dfo_loot_rules.js', 'dfo_loot_ui.js': 'page/dfo_loot_ui.js', 'dfo_loot.js': 'page/dfo_loot.js', 'dfo_marks.js': 'page/dfo_marks.js', 'dfo_town.js': 'page/dfo_town.js', 'ru_dict.js': 'page/ru_dict.js', 'ru_i18n.js': 'page/ru_i18n.js',
  'ru_locale.js': 'page/ru_locale.js', 'ru_items.js': 'page/ru_items.js',
});
/** The town map's cache, as the page keeps it (dfo_town.js): <userData>/dfo-mod-cache.json - readable JSON. */
const CACHE_MAX = 16 * 1024 * 1024;

function wrap(handleDagger, { app = null } = {}) {
  let userData = null;
  try { userData = app?.getPath?.('userData') ?? null; } catch { userData = null; }
  const cfgFile = userData && path.join(userData, 'dfo-mod.json');
  const logFile = userData && path.join(userData, 'dfo-mod.log');
  let cfg = { ...DEFAULTS };
  try { if (cfgFile && fs.existsSync(cfgFile)) cfg = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(cfgFile, 'utf8')) }; } catch (e) { cfg = { ...DEFAULTS }; }
  cfg.marksOptions = { ...DEFAULTS.marksOptions, ...(cfg.marksOptions ?? {}) };
  const hasRu = fs.existsSync(path.join(__dirname, 'page', 'ru_dict.js'));
  const ru = !!cfg.ru && hasRu;

  const lines = [];
  const log = (s) => {
    if (!logFile) return;
    lines.push(`${new Date().toISOString()} ${s}`);
    try { fs.writeFileSync(logFile, `${lines.join('\n')}\n`); } catch { /* a log we cannot write is no reason to stop */ }
  };
  log(`DFO Mod ${VERSION}: ${cfg.enabled ? 'on' : 'off'} - ru ${ru ? 'on' : 'off'}, marks ${cfg.marks ? 'on' : 'off'}`);

  let ctx = null;
  const context = () => {
    if (ctx) return ctx;
    let fontB64 = null, quests = null, ql = null;
    if (ru) {
      try { fontB64 = fs.readFileSync(path.join(__dirname, 'ru', 'tiny5_cyrillic.woff2')).toString('base64'); } catch { fontB64 = null; }
      try { quests = JSON.parse(fs.readFileSync(path.join(__dirname, 'ru', 'quests.json'), 'utf8')); } catch { quests = null; }
      try { ql = JSON.parse(fs.readFileSync(path.join(__dirname, 'ru', 'ql.json'), 'utf8')); } catch { ql = null; }
    }
    // the pack the game's language system reads, as the page lists it (ru_locale.js): its credits and its files
    let pack = null;
    if (ru) { try { pack = JSON.parse(fs.readFileSync(path.join(__dirname, 'ru-pack', 'index.json'), 'utf8')); } catch { pack = null; } }
    ctx = { ru, marks: !!cfg.marks, nearbyLoot: cfg.nearbyLoot !== false, dungeons: cfg.dungeons !== false, fontB64, quests, ql,
      pageCfg: { dungeons: { enabled: cfg.dungeons !== false }, nearbyLoot: { ...cfg.nearbyLootOptions, enabled: cfg.nearbyLoot !== false }, marks: { marks: !!cfg.marks, ...cfg.marksOptions }, ru: { on: ru, pack, gameLanguage: cfg.gameLanguage !== false } } };
    return ctx;
  };
  const cache = new Map();   // rel -> { key, text }
  const own = new Map();     // name -> Buffer
  const seenHooks = new Map();   // hook id -> places found, this session
  let summaryTimer = null;
  /** Once the game's files have come (no new one for a few seconds): which expected hooks found no place at all. */
  const summary = () => {
    const want = [...(ctx?.dungeons ? EXPECTED.dungeons : []), ...(ctx?.nearbyLoot ? EXPECTED.nearbyLoot : []), ...(ctx?.marks ? EXPECTED.marks : []), ...(ctx?.ru ? EXPECTED.ru : [])];
    const lost = want.filter((id) => !(seenHooks.get(id) > 0));
    log(lost.length ? `NOT FOUND in this game version (these features are off): ${lost.join(', ')}` : `all ${want.length} expected hooks found`);
  };

  /** The page's account of its marks, as a player can read and send it: <userData>/dfo-mod-marks.txt. */
  const reportFile = userData && path.join(userData, 'dfo-mod-marks.txt');
  const GROUP_WORD = { t: 'таверна', s: 'магазин', o: 'организация' };
  function writeReport(body) {
    if (!reportFile) return;
    try {
      const r = JSON.parse(String(body).slice(0, 400000));
      const L = [`DFO Mod ${VERSION} - метки на Overworld, ${new Date().toLocaleString('ru-RU')}`];
      const src = r.sources ?? {};
      L.push(`источники игры: здания города ${src.summaries ? 'да' : 'НЕТ'}, города по пикселям ${src.locIndex ? 'да' : 'НЕТ'}, книга города ${src.bookOf ? 'да' : 'НЕТ'}, открытые здания ${src.disc ? 'да' : 'НЕТ'}`);
      const yn = (v) => (v ? 'да' : 'НЕТ');
      L.push(`формула скупки игры: индекс лавки ${yn(src.shopAdj)}, CalculateCost ${yn(src.cost)}, торг ${yn(src.trade)}, навыки игрока ${yn(src.skills)}`);
      L.push('проценты: доля базовой стоимости предмета, которую лавка платит; "базово" - для всех одинаково (без гильдии, Mercantile 0, Personality 50), "мне" - с вашими навыками и гильдией');
      const c = r.cfg ?? {};
      L.push(`настройки: только посещённые ${c.onlyVisited ? 'да' : 'нет'}, радиус ${c.markRadiusM} м, подписи ${c.nameRadiusM} м, не больше ${c.maxMarks}`);
      L.push(`меток отдано на экран: ${r.made}`);
      if (r.error) L.push(`ОШИБКА: ${r.error}`);
      if (!r.towns?.length) L.push('городов в радиусе нет.');
      for (const t of r.towns ?? []) {
        L.push('', `Город: ${t.town ?? '?'}   книга: ${t.book ?? '-'}   способ: ${t.path}   до центра: ${t.centreM} м`);
        L.push(`  открытых зданий в книге: ${t.discovered} (из них таверн/магазинов/организаций: ${t.discoveredOurs})`);
        L.push(`  кандидатов: ${t.candidates}, с меткой: ${t.marked}, дальше радиуса: ${t.beyond}, без земли под ними: ${t.noGround}`);
        for (const n of t.names ?? []) {
          if (n && typeof n === 'object') {
            const price = n.base != null ? `   качество ${n.q}, скупка базово ${n.base}%${n.mine != null ? `, мне ${n.mine}%` : ''}` : '';
            L.push(`    ${GROUP_WORD[n.g] ?? n.g} (тип ${n.type}): ${n.name} - ${n.m} м${price}`);
            continue;
          }
          const m = /^([tso])(\d+):(.*)@(\d+)m$/.exec(n);
          L.push(m ? `    ${GROUP_WORD[m[1]]} (тип ${m[2]}): ${m[3]} - ${m[4]} м` : `    ${n}`);
        }
        if (t.unplaced?.length) L.push(`  открыты, но не найдены в планировке города: ${t.unplaced.join('; ')}`);
      }
      fs.writeFileSync(reportFile, `${L.join('\n')}\n`);
    } catch (e) { log(`report: ${e?.message ?? e}`); }
  }

  /** THE TOWN MAP'S CACHE: towns' owners, players' guilds, guilds' names - read once at the page's start, written as the
   *  page says (a new file beside, then put in place: a crash mid-write never leaves half a cache). */
  const cacheFile = userData && path.join(userData, 'dfo-mod-cache.json');
  const lootStore = createLootStore(userData);
  const readCache = () => {
    try { return cacheFile && fs.existsSync(cacheFile) ? fs.readFileSync(cacheFile) : Buffer.from('{}'); } catch (e) { log(`cache read: ${e?.message ?? e}`); return Buffer.from('{}'); }
  };
  function writeCache(body) {
    if (!cacheFile) return 500;
    const text = String(body);
    if (text.length > CACHE_MAX) return 413;
    let data;
    try { data = JSON.parse(text); } catch { return 400; }
    try { lootStore.replaceCityCache(data); return 204; }
    catch (e) { log(`cache write: ${e?.message ?? e}`); return e.status || 500; }
  }

  const serveOwn = (name) => {
    const rel = OWN[name];
    if (!rel) return new Response('not found', { status: 404 });
    let buf = own.get(name);
    if (!buf) { buf = fs.readFileSync(path.join(__dirname, rel)); own.set(name, buf); }
    return new Response(buf, { headers: { 'Content-Type': 'text/javascript; charset=utf-8' } });
  };

  return async function dfoHandleDagger(req) {
    if (!cfg.enabled) return handleDagger(req);
    let url;
    try { url = new URL(req.url); } catch { return handleDagger(req); }
    if (url.host !== 'game') return handleDagger(req);
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (rel === 'dfo-mod/report' && req.method === 'POST') { writeReport(await req.text()); return new Response(null, { status: 204 }); }
    if (rel === 'dfo-mod/cache') {
      if (req.method === 'POST') return new Response(null, { status: writeCache(await req.text()) });
      return new Response(readCache(), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
    if (rel === 'dfo-mod/loot-settings' || rel === 'dfo-mod/loot-presets' || rel === 'dfo-mod/dungeon-notes') {
      const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
      try {
        if (req.method === 'GET') return json(rel.endsWith('dungeon-notes') ? { notes: lootStore.dungeonNotes() } : lootStore.state());
        if (req.method !== 'POST') return json({ error: 'Метод не поддерживается.' }, 405);
        const body = await req.text();
        if (Buffer.byteLength(body) > 2 * 1024 * 1024) return json({ error: 'Слишком большой пресет.' }, 413);
        let data; try { data = JSON.parse(body); } catch { return json({ error: 'Некорректный JSON.' }, 400); }
        if (!data || typeof data !== 'object' || Array.isArray(data)) return json({ error: 'Некорректные настройки.' }, 400);
        return json(rel.endsWith('dungeon-notes') ? lootStore.saveDungeonNote(data) : rel.endsWith('loot-presets') ? lootStore.savePreset(data) : lootStore.saveSettings(data));
      } catch (e) { log(`${rel}: ${e?.message ?? e}`); return json({ error: e.message || 'Не удалось сохранить настройки.' }, e.status || 500); }
    }
    const packFile = /^(?:play\/)?dfo-mod\/ru-pack\/((?:Text\/(?:(?:Quests|Books)\/)?)?[\w$.-]+\.(?:csv|txt|json))$/.exec(rel);
    if (packFile) {
      try {
        const body = fs.readFileSync(path.join(__dirname, 'ru-pack', ...packFile[1].split('/')));
        return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' } });
      } catch { return new Response('not found', { status: 404 }); }
    }
    const own1 = /^(?:play\/)?dfo-mod\/([\w.-]+)$/.exec(rel);
    if (own1) { try { return serveOwn(own1[1]); } catch (e) { log(`own ${rel}: ${e?.message}`); return new Response('not found', { status: 404 }); } }
    const page = rel === 'play/index.html' || rel === 'index.html' || rel === '';
    const asset = /^assets\/[^/]+\.js$/.test(rel);
    if (!page && !asset) return handleDagger(req);
    const res = await handleDagger(req);
    if (!res || !res.ok) return res;
    try {
      const text = await res.text();
      let out;
      if (page) out = injectPage(text, rel === 'play/index.html' ? '../' : './', context());
      else {
        const key = `${text.length}:${text.slice(0, 64)}:${text.slice(-64)}`;
        const hit = cache.get(rel);
        if (hit?.key === key) out = hit.text;
        else {
          const r = transformAsset(rel, text, context());
          out = r.text;
          cache.set(rel, { key, text: out });
          for (const [id, n] of r.log) seenHooks.set(id, (seenHooks.get(id) ?? 0) + n);
          const told = r.log.filter(([id, n]) => n > 0 || id.includes('!error'));
          if (told.length) log(`${rel}: ${told.map(([id, n]) => `${id}${n > 1 ? `x${n}` : ''}`).join(', ')}`);
          clearTimeout(summaryTimer);
          summaryTimer = setTimeout(summary, 4000);
        }
      }
      return new Response(out, { status: res.status, headers: res.headers });
    } catch (e) {
      log(`${rel}: ${e?.stack ?? e}`);
      return handleDagger(req);
    }
  };
}

module.exports = { wrap, DEFAULTS, VERSION };
