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
const { transformAsset, injectPage, expectedHooks } = require('./transforms.cjs');
const { createLootStore } = require('./loot-store.cjs');
const {replacement,stripFaces}=require('./font-assets.cjs');
const itemText = require('./item-text.cjs');

const VERSION = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf8')).version; } catch { return '?'; } })();
const DEFAULTS = Object.freeze({
  enabled: true, ru: true, marks: true, nearbyLoot: true, dungeons: true, itemCards: true, fonts: true,
  nearbyLootOptions: { keyCode: 'KeyJ' },
  dungeonOptions: { keyCode: 'KeyK' },
  marksOptions: { onlyVisited: true, markRadiusM: 1200, nameRadiusM: 300, maxMarks: 60 },
});
const OWN = Object.freeze({   // served at dagger://game/dfo-mod/<name>
  'dfo_fonts.js': 'page/dfo_fonts.js',
  'dfo_font_data.js':'page/dfo_font_data.js',
  'dfo_item_cards.js': 'page/dfo_item_cards.js',
  'dfo_item_text.js': 'page/dfo_item_text.js',
  'dfo_ui_text.js': 'page/dfo_ui_text.js',
  'dfo_service_details.js': 'page/dfo_service_details.js',
  'dfo_services.js': 'page/dfo_services.js',
  'item-font-title.ttf': 'fonts/item-font-title.ttf', 'item-font-text.ttf': 'fonts/item-font-text.ttf',
  'item-font-numbers.ttf': 'fonts/item-font-numbers.ttf', 'book-font-text.ttf': 'fonts/book-font-text.ttf',
  'item-font-sigil.ttf': 'fonts/item-font-sigil.ttf', 'item-font-set.ttf': 'fonts/item-font-set.ttf',
  'item-font-legendary.otf': 'fonts/item-font-legendary.otf', 'item-font-description.otf': 'fonts/item-font-description.otf',
  'dfo_dungeon_model.js': 'page/dfo_dungeon_model.js', 'dfo_dungeons.js': 'page/dfo_dungeons.js',
  'dfo_dungeon_live_model.js': 'page/dfo_dungeon_live_model.js',
  'dfo_dungeon_graph.js': 'page/dfo_dungeon_graph.js',
  'dfo_dungeon_nav_model.js': 'page/dfo_dungeon_nav_model.js', 'dfo_dungeon_nav.js': 'page/dfo_dungeon_nav.js', 'dfo_dungeon_live.js': 'page/dfo_dungeon_live.js',
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
  const lootStore = createLootStore(userData);
  let cfg = { ...DEFAULTS };
  try { if (cfgFile && fs.existsSync(cfgFile)) cfg = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(cfgFile, 'utf8')) }; } catch (e) { cfg = { ...DEFAULTS }; }
  cfg.marksOptions = { ...DEFAULTS.marksOptions, ...(cfg.marksOptions ?? {}) };
  try {
    const keyCode = lootStore.lootKey();
    if (keyCode) cfg.nearbyLootOptions = { ...DEFAULTS.nearbyLootOptions, ...cfg.nearbyLootOptions, keyCode };
    const dungeonKey = lootStore.dungeonKey();
    if (dungeonKey) cfg.dungeonOptions = { ...DEFAULTS.dungeonOptions, ...cfg.dungeonOptions, keyCode: dungeonKey };
  } catch { /* An unreadable optional cache must not prevent the game starting. */ }
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
      if(cfg.fonts===false)try { fontB64 = fs.readFileSync(path.join(__dirname, 'ru', 'tiny5_cyrillic.woff2')).toString('base64'); } catch { fontB64 = null; }
      try { quests = JSON.parse(fs.readFileSync(path.join(__dirname, 'ru', 'quests.json'), 'utf8')); } catch { quests = null; }
      try { ql = JSON.parse(fs.readFileSync(path.join(__dirname, 'ru', 'ql.json'), 'utf8')); } catch { ql = null; }
    }
    // the pack the game's language system reads, as the page lists it (ru_locale.js): its credits and its files
    let pack = null;
    if (ru) { try { pack = JSON.parse(fs.readFileSync(path.join(__dirname, 'ru-pack', 'index.json'), 'utf8')); } catch { pack = null; } }
    ctx = { ru, marks: !!cfg.marks, nearbyLoot: cfg.nearbyLoot !== false, dungeons: cfg.dungeons !== false, itemCards: cfg.itemCards !== false, fonts: cfg.fonts !== false, fontB64, quests, ql,
      itemTextLocale: itemText.chooseLocale(ru), uiLocale: itemText.chooseLocale(ru),
      pageCfg: { fonts: {enabled:cfg.fonts!==false,revision:VERSION}, itemCards: { enabled: cfg.itemCards !== false }, itemText: { locale: itemText.chooseLocale(ru) }, ui: { locale: itemText.chooseLocale(ru) }, dungeons: { ...cfg.dungeonOptions, enabled: cfg.dungeons !== false }, nearbyLoot: { ...cfg.nearbyLootOptions, enabled: cfg.nearbyLoot !== false }, marks: { marks: !!cfg.marks, ...cfg.marksOptions }, ru: { on: ru, pack, gameLanguage: cfg.gameLanguage !== false } } };
    return ctx;
  };
  const cache = new Map();   // rel -> { key, text }
  const own = new Map();     // name -> Buffer
  let itemTextData = null;   // the page's item description locale, built once
  let uiTextData = null;     // the page's interface strings, built once
  const seenHooks = new Map();   // hook id -> places found, this session
  let summaryTimer = null;
  /** Once the game's files have come (no new one for a few seconds): which expected hooks found no place at all. */
  const summary = () => {
    const want = expectedHooks(ctx||{});
    const lost = want.filter((id) => !(seenHooks.get(id) > 0));
    log(lost.length ? `NOT FOUND in this game version (these features are off): ${lost.join(', ')}` : `all ${want.length} expected hooks found`);
  };

  /** The page's account of its marks, as a player can read and send it: <userData>/dfo-mod-marks.txt. */
  const reportFile = userData && path.join(userData, 'dfo-mod-marks.txt');
  // The report and the store's answers speak the install's language (the item-text packs' ui tables), English by default.
  let uiStrings = null;
  const T = (key, params) => { if (!uiStrings) uiStrings = itemText.uiText(context().uiLocale); return uiStrings.t(key, params); };
  const GROUP_WORD = new Proxy({}, { get: (_, g) => (['t', 's', 'o'].includes(g) ? T('report.group.' + g) : undefined) });
  function writeReport(body) {
    if (!reportFile) return;
    try {
      const r = JSON.parse(String(body).slice(0, 400000));
      const L = [T('report.title',{version:VERSION,when:new Date().toLocaleString(context().uiLocale === 'ru' ? 'ru-RU' : 'en-US')})];
      const src = r.sources ?? {};
      L.push(T('report.sources',{a:src.summaries ? T('report.yes') : T('report.NO'),b:src.locIndex ? T('report.yes') : T('report.NO'),c:src.bookOf ? T('report.yes') : T('report.NO'),d:src.disc ? T('report.yes') : T('report.NO')}));
      const yn = (v) => (v ? T('report.yes') : T('report.NO'));
      L.push(T('report.formula',{a:yn(src.shopAdj),b:yn(src.cost),c:yn(src.trade),d:yn(src.skills)}));
      L.push(T('report.percent'));
      const c = r.cfg ?? {};
      L.push(T('report.settings',{visited:c.onlyVisited ? T('report.yes') : T('report.no'),radius:c.markRadiusM,labels:c.nameRadiusM,max:c.maxMarks}));
      L.push(T('report.made',{n:r.made}));
      if (r.error) L.push(T('report.error',{error:r.error}));
      if (!r.towns?.length) L.push(T('report.noTowns'));
      for (const t of r.towns ?? []) {
        L.push('', T('report.town',{town:t.town ?? '?',book:t.book ?? '-',path:t.path,m:t.centreM}));
        L.push(T('report.discovered',{n:t.discovered,ours:t.discoveredOurs}));
        L.push(T('report.candidates',{n:t.candidates,marked:t.marked,beyond:t.beyond,noGround:t.noGround}));
        for (const n of t.names ?? []) {
          if (n && typeof n === 'object') {
            const price = n.base != null ? T('report.price',{q:n.q,base:n.base,mine:n.mine != null ? T('report.priceMine',{pct:n.mine}) : ''}) : '';
            L.push(T('report.mark',{group:GROUP_WORD[n.g] ?? n.g,type:n.type,name:n.name,m:n.m,price:price}));
            continue;
          }
          const m = /^([tso])(\d+):(.*)@(\d+)m$/.exec(n);
          L.push(m ? T('report.markShort',{group:GROUP_WORD[m[1]],type:m[2],name:m[3],m:m[4]}) : `    ${n}`);
        }
        if (t.unplaced?.length) L.push(T('report.unplaced',{list:t.unplaced.join('; ')}));
      }
      fs.writeFileSync(reportFile, `${L.join('\n')}\n`);
    } catch (e) { log(`report: ${e?.message ?? e}`); }
  }

  /** THE TOWN MAP'S CACHE: towns' owners, players' guilds, guilds' names - read once at the page's start, written as the
   *  page says (a new file beside, then put in place: a crash mid-write never leaves half a cache). */
  const cacheFile = userData && path.join(userData, 'dfo-mod-cache.json');
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

  const serveOwn = (name,cacheFont=false) => {
    const rel = OWN[name];
    if (!rel) return new Response('not found', { status: 404 });
    let buf = own.get(name);
    if (!buf) { buf = fs.readFileSync(path.join(__dirname, rel)); own.set(name, buf); }
    const mime = name.endsWith('.ttf') ? 'font/ttf' : name.endsWith('.otf') ? 'font/otf' : 'text/javascript; charset=utf-8';
    return new Response(buf, { headers: { 'Content-Type': mime, 'Cache-Control':cacheFont&&mime.startsWith('font/')?'public,max-age=31536000,immutable':'no-store' } });
  };

  return async function dfoHandleDagger(req) {
    let url;
    try { url = new URL(req.url); } catch { return handleDagger(req); }
    // The launcher's static stylesheet also uses these same local files.
    // Its host is different from the game's host, not an ASAR directory.
    if(url.host==='launcher'){
      let rel;try{rel=decodeURIComponent(url.pathname).replace(/^\/+/, '')}catch{return new Response('bad request',{status:400})}const ownFont=/^dfo-mod\/(?:fonts\/)?([\w.-]+)$/.exec(rel);
      if(ownFont&&OWN[ownFont[1]])return serveOwn(ownFont[1],url.searchParams.get('dfo')===VERSION);
      if(cfg.fonts!==false){
        const asset=replacement(rel);if(asset)return asset.file?serveOwn(asset.file):new Response(asset.body,{headers:{'Content-Type':asset.type,'Cache-Control':'no-store'}});
        if(/\.html$/i.test(rel)||!rel){
          const res=await handleDagger(req);if(!res?.ok)return res;
          const {preparePage}=require('./fonts-transform.cjs');
          const scripts='<script src="/dfo-mod/dfo_font_data.js?dfo=1.27.0"></script><script src="/dfo-mod/dfo_fonts.js?dfo=1.27.0"></script>';
          const html=await res.text();return new Response(preparePage(html.replace('</head>',scripts+'</head>')),{headers:res.headers,status:res.status});
        }
      }
      return handleDagger(req);
    }
    if (!cfg.enabled) return handleDagger(req);
    if (url.host !== 'game') return handleDagger(req);
    let rel;try{rel=decodeURIComponent(url.pathname).replace(/^\/+/, '')}catch{return new Response('bad request',{status:400})}
    if (rel === 'dfo-mod/report' && req.method === 'POST') { writeReport(await req.text()); return new Response(null, { status: 204 }); }
    if (rel === 'dfo-mod/cache') {
      if (req.method === 'POST') return new Response(null, { status: writeCache(await req.text()) });
      return new Response(readCache(), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
    if (rel === 'dfo-mod/loot-settings' || rel === 'dfo-mod/loot-presets' || rel === 'dfo-mod/dungeon-notes') {
      const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
      // An error carries its words in the install's language and its key, so the page says it in its own pack's words.
      const fail = (key, status) => json({ error: T(key), ...(/^[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9-]+)+$/.test(key) ? { code: key } : {}) }, status);
      try {
        if (req.method === 'GET') return json(rel.endsWith('dungeon-notes') ? { notes: lootStore.dungeonNotes() } : lootStore.state());
        if (req.method !== 'POST') return fail('store.method', 405);
        const body = await req.text();
        if (Buffer.byteLength(body) > 2 * 1024 * 1024) return fail('store.tooLarge', 413);
        let data; try { data = JSON.parse(body); } catch { return fail('store.badJson', 400); }
        if (!data || typeof data !== 'object' || Array.isArray(data)) return fail('store.badSettings', 400);
        return json(rel.endsWith('dungeon-notes') ? lootStore.saveDungeonNote(data) : rel.endsWith('loot-presets') ? lootStore.savePreset(data) : lootStore.saveSettings(data));
      } catch (e) { log(`${rel}: ${e?.message ?? e}`); return fail(e.message || 'loot.saveFailed', e.status || 500); }
    }
    const packFile = /^(?:play\/)?dfo-mod\/ru-pack\/((?:Text\/(?:(?:Quests|Books)\/)?)?[\w$.-]+\.(?:csv|txt|json))$/.exec(rel);
    if (packFile) {
      try {
        const body = fs.readFileSync(path.join(__dirname, 'ru-pack', ...packFile[1].split('/')));
        return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' } });
      } catch { return new Response('not found', { status: 404 }); }
    }
    // The mod's interface strings: the same locale as the descriptions, English under it.
    if (/^(?:play\/)?dfo-mod\/dfo_ui_text_data\.js$/.test(rel)) {
      if (!uiTextData) { try { uiTextData = Buffer.from(itemText.uiBundle(context().uiLocale)); } catch (e) { log(`ui text: ${e?.message ?? e}`); uiTextData = Buffer.from('globalThis.__dfoUiPack=null;\n'); } }
      return new Response(uiTextData, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
    // Item descriptions: the one locale this install speaks (Russian with the translation installed and on), as data.
    if (/^(?:play\/)?dfo-mod\/dfo_item_text_data\.js$/.test(rel)) {
      if (!itemTextData) { try { itemTextData = Buffer.from(itemText.bundle(context().itemTextLocale)); } catch (e) { log(`item text: ${e?.message ?? e}`); itemTextData = Buffer.from('globalThis.__dfoItemTextPack=null;\n'); } }
      return new Response(itemTextData, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
    const own1 = /^(?:play\/)?dfo-mod\/(?:fonts\/)?([\w.-]+)$/.exec(rel);
    if (own1) { try { return serveOwn(own1[1],url.searchParams.get('dfo')===VERSION); } catch (e) { log(`own ${rel}: ${e?.message}`); return new Response('not found', { status: 404 }); } }
    if(cfg.fonts!==false){
      const asset=replacement(rel);if(asset)return asset.file?serveOwn(asset.file):new Response(asset.body,{headers:{'Content-Type':asset.type,'Cache-Control':'no-store'}});
      if(/\.css$/i.test(rel)){
        const response=await handleDagger(req);if(!response?.ok)return response;
        return new Response(stripFaces(await response.text()).text,{status:response.status,headers:response.headers});
      }
    }
    const page = /\.html$/i.test(rel) || rel === '';
    const asset = /^assets\/[^/]+\.js$/.test(rel);
    if (!page && !asset) return handleDagger(req);
    const res = await handleDagger(req);
    if (!res || !res.ok) return res;
    try {
      const text = await res.text();
      let out;
      if (page) out = injectPage(text, '../'.repeat(Math.max(0,rel.split('/').length-1))||'./', context());
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
