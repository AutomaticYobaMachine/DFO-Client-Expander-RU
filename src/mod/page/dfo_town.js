// DFO Mod - THE DETAILED TOWN MAP: a mode of the Overworld (the fast-travel view from above) over the town the player
// stands in - opened by "Подробная карта города" (under the filters' head, while the player is inside a town).
//
// In the mode the game's whole interface is put away (the Overworld's panels, the chat, every window over the world) and
// so is every mark that is not the town's; the player is not moved - the keys and the mouse move a camera instead, over
// the town and no further (the world is built round the player: past the town there is nothing to look at). At the top
// a bar of switches, under it the town's name in large letters, at the side the key - each row a switch of its own.
//
//   - "Влияние гильдий" ON: each building's plot in the colour of the guild that holds it - a home by its owner's guild,
//     a guild's hall by its guild, the palace by the guild that holds the seat ("Город под контролем ..."); the player's
//     own and their guild's always white, a home nobody owns light grey, an owner of no guild dark grey hatched, an owner
//     whose guild this client has never learned a pattern of golden question marks; a tavern's, a shop's, an order's
//     plot striped in the colour of the guild with the most plots round it (light grey for none, or a tie).
//     OFF: the taverns, shops and orders in the town map's own colours, a home a player bought striped on red - or, an
//     account holding more than one in the town, its own colour - the player's own white, a free one light grey.
//   - "Входы и владельцы": a point at each home's door, its owner's account named over it, and in gold how many of the
//     town's homes that account holds.
//   - "Метки заведений": the taverns', shops' and orders' marks (dfo_marks.js) and the yards' (stables, wagons).
//   - "Инфо о городе": a window of the town's card in tabs - its overview, guilds, residents (and the players in it now),
//     its homes (taken, free, rooms to rent, sales, the neighbours' votes), its venues (each shop's quality and what it
//     pays), its economy (the game's own Prosperity, the counters' indices, the port's exchange) and its seat.
//   - "Данные города": when the town's data was last brought in, "Обновить базу" (ask now) and "Перегенерировать город"
//     (its snapshot thrown away and made again).
// A click on a door's point, a venue's mark or a plot opens that building's card. The camera turns and tilts (the right
// or middle button's drag, Q/E, R/F) and is given its travel-view angle back when the map closes.
// The town is its plots - a grid of rectangles, one a building, none reaching further than its building's reach; the
// land outside them is dimmed and the town's edge drawn thick along them.
//
// WHERE IT COMES FROM - read-only hooks (transforms.cjs TOWN): the game's own registry of online homes (who owns each
// building: the account's name, a guild's hall), the playing character's guild book (its tag and roster), the seats'
// book (who holds a town), every built door, and the guild tag each player wears as the client meets them (the hub's
// list of who is online, chat, the players about). The service never says an owner's guild: it is the tag their
// account was last seen wearing here, kept in <userData>/dfo-mod-cache.json with everything else the map learned.
//
// WHEN IT ASKS THE SERVICE - only when the mode is opened: the owners of the built towns within a map pixel round the
// town, the hub's list of who is online, the names of guilds known by tag alone - each at most once in ASK_GAP_MS, and
// a town's owners through the game's own registry (its minute's answer reused).
(() => {
  'use strict';
  if (globalThis.__dfoTown) return;
  const CFG = Object.assign({ marks: true }, globalThis.__DFO_MOD_CFG__?.marks ?? {});
  if (CFG.marks === false) return;

  const GS = 0.025, RMB = 4096, SIDE = RMB * GS;   // MeshReader.GlobalScale, BlocksFile.RMBDimension: a block, m
  const PIX = 32768 * GS;                          // a map pixel, m
  const NEAR_M = 300;                              // a town this near counts when the player stands in none
  const ASK_GAP_MS = 3 * 60 * 1000;                // the service asked no oftener than this, each thing
  const KEY0 = 1 << 24;                            // makeBuildingKey's stand-in for key 0
  const TAG_RE = /^[A-Z0-9]{2,4}$/;
  const DOOR_BUILDING = 1;                         // meshReader DOOR_TYPE.BUILDING

  // building types (world/buildingNames.js BUILDING_TYPES)
  const TAVERN = 15, PALACE = 16;
  const ORGS = new Set([11, 14]);
  const SHOPS = new Set([0, 2, 3, 5, 6, 7, 8, 9, 10, 12, 13]);
  /** onlineHomes.js homeCandidate: a house for sale and every house type, never a faction's House2. */
  const isHomeType = (t, faction) => t === 1 || (t >= 17 && t <= 22 && !(t === 18 && (faction ?? 0) !== 0));
  const groupOf = (t) => (t === TAVERN ? 'taverns' : ORGS.has(t) ? 'orgs' : SHOPS.has(t) ? 'shops' : null);
  const GROUP_COLOR = Object.freeze({ taverns: '#61d19d', shops: '#80b0ff', orgs: '#d19361' });   // dfo_marks.js's
  const WHITE = '#ffffff', FREE = '#cfcfcf', GOLD = '#f2c443';

  // ─── the switches (this player's, this browser's) ───────────────────────────────────────────────────────────────
  const STATE_KEY = 'dfoMod.cityMap';
  const state = { influence: true, doors: true, marks: true, hidden: [] };
  try { Object.assign(state, JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}')); } catch { /* defaults */ }
  if (!Array.isArray(state.hidden)) state.hidden = [];
  const saveState = () => { try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch { /* kept for this session */ } };
  const hidden = new Set(state.hidden);
  const toggleHidden = (k) => { if (hidden.has(k)) hidden.delete(k); else hidden.add(k); state.hidden = [...hidden]; saveState(); };

  // ─── the cache ──────────────────────────────────────────────────────────────────────────────────────────────────
  // { v, towns: { mapId: { name, at, homes: { key: { o owner, m mine, gm guildmate, hall: { n, t }|null } } } },
  //   players: { lower-case name: { n name, g tag|null, at, s source } }, guilds: { tag: { n name, at } },
  //   meta: { mapId: the town's snapshot (geoOf) }, asked: { who, arms } }
  const cache = { v: 1, towns: {}, players: {}, guilds: {}, meta: {}, asked: { who: 0, arms: 0 } };
  const CACHE_URL = () => new URL('/dfo-mod/cache', location.href);
  let saveTimer = null, loaded = false;
  const dirty = () => {
    if (saveTimer || !loaded) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try { fetch(CACHE_URL(), { method: 'POST', body: JSON.stringify(cache) }).catch(() => {}); } catch { /* the next change tries again */ }
    }, 5000);
  };
  /** The file's records under what this page learned since it started (the newer of each wins). */
  function mergeLoaded(f) {
    if (!f || typeof f !== 'object') return;
    const newer = (into, from) => {
      for (const [k, v] of Object.entries(from ?? {})) if (v && typeof v === 'object' && !(into[k]?.at >= v.at)) into[k] = v;
    };
    newer(cache.towns, f.towns);
    newer(cache.players, f.players);
    newer(cache.guilds, f.guilds);
    newer(cache.meta, f.meta);
    cache.asked.who = Math.max(cache.asked.who, f.asked?.who ?? 0);
    cache.asked.arms = Math.max(cache.asked.arms, f.asked?.arms ?? 0);
  }
  try {
    fetch(CACHE_URL(), { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then(mergeLoaded).catch(() => {})
      .finally(() => { loaded = true; dirty(); });
  } catch { loaded = true; }

  const norm = (s) => String(s ?? '').trim().toLowerCase();
  const tagOk = (t) => (typeof t === 'string' && TAG_RE.test(t) ? t : null);
  /** A player seen wearing `tag` (null: seen wearing none - only where the row is the relay's whole badge). */
  function see(name, tag, source) {
    if (typeof name !== 'string' || !name.trim()) return;
    const k = norm(name), now = Date.now(), was = cache.players[k];
    if (was && was.g === tag && now - was.at < 10 * 60 * 1000) return;
    cache.players[k] = { n: name.trim(), g: tag, at: now, s: source };
    dirty();
  }
  const noteGuild = (tag, name) => {
    if (!tagOk(tag) || typeof name !== 'string' || !name) return;
    const was = cache.guilds[tag];
    if (was?.n === name && Date.now() - was.at < 10 * 60 * 1000) return;
    cache.guilds[tag] = { n: name, at: Date.now() };
    dirty();
  };
  // the game's rows, as the hooks hand them
  globalThis.__dfoTag = (row) => { const g = tagOk(row?.gt); if (g && typeof row?.name === 'string') see(row.name, g, 'tag'); };
  globalThis.__dfoSeen = (list) => {   // the hub's own rows: the relay's badge whole - no tag is no guild
    if (!Array.isArray(list)) return;
    for (const p of list) if (p && typeof p.id === 'string' && typeof p.name === 'string') see(p.name, tagOk(p.gt), 'hub');
  };
  globalThis.__dfoArms = (tag, name) => noteGuild(tag, name);

  // ─── the game's own sources ─────────────────────────────────────────────────────────────────────────────────────
  const W = () => globalThis.__dfoWorld;
  const homesReg = () => { try { return globalThis.__dfoHost?.homes?.() ?? null; } catch { return null; } };
  const guildBook = () => { try { return globalThis.__dfoHost?.guildBook?.() ?? null; } catch { return null; } };
  /** The player's own guild: { tag, name, members: Set of lower-case account names } or null. */
  let ownCache = { src: null, val: null };
  function ownGuild() {
    const g = guildBook()?.guild ?? null;
    if (ownCache.src === g) return ownCache.val;
    let val = null;
    if (g && typeof g === 'object') {
      val = { tag: tagOk(g.tag), name: typeof g.name === 'string' ? g.name : '', members: new Set((g.members ?? []).map((m) => norm(m?.name)).filter(Boolean)) };
      if (val.tag) noteGuild(val.tag, val.name);
      for (const m of g.members ?? []) if (typeof m?.name === 'string' && val.tag) see(m.name, val.tag, 'roster');
    }
    ownCache = { src: g, val };
    return val;
  }
  /** The guild that holds the town's seat (its own, or its region's Charter's): { tag, name } or null. */
  function seatHolder(mapId) {
    try {
      const s = globalThis.__dfoCharterAt?.(mapId);
      const g = s?.holder?.guild;
      if (!g) return null;
      const tag = tagOk(g.tag);
      if (tag && g.name) noteGuild(tag, g.name);
      return { tag, name: typeof g.name === 'string' ? g.name : tag ?? '?', id: g.id ?? null };
    } catch { return null; }
  }

  // ─── the towns built round the player ───────────────────────────────────────────────────────────────────────────
  // Three steps, each made only when needed and kept: a town's blocks (every built town, every frame: is the player in
  // it), its buildings (the town's SNAPSHOT - cache.meta, the owners' read and the map's), its plots (the map's own town).
  const bases = new WeakMap(), geos = new WeakMap();
  const _t = [0, 0, 0];
  /** A built town's blocks: { src, p, loc, cells, bw, bh, mapId, name } - cheap. */
  function baseOf(p) {
    let b = bases.get(p);
    if (b && b.src === p.locBlocks) return b;
    const loc = W()?.locIndex?.()?.get(`${p.px},${p.py}`) ?? null;
    if (!loc) return null;
    const cells = new Set(p.locBlocks.map((q) => `${q.x ?? 0},${q.y ?? 0}`));
    let bw = 1, bh = 1;
    for (const q of p.locBlocks) { bw = Math.max(bw, (q.x ?? 0) + 1); bh = Math.max(bh, (q.y ?? 0) + 1); }
    const sig = p.locBlocks.map((q) => `${q.x ?? 0},${q.y ?? 0}:${q.dfBlock?.name ?? q.dfBlock?.id ?? ''}`).sort().join('|');
    b = { src: p.locBlocks, p, loc, cells, bw, bh, sig, mapId: (loc.mapTableData?.mapId ?? 0) >>> 0, name: loc.name ?? '?' };
    bases.set(p, b);
    return b;
  }
  /** The game's own bag of names for a guild's hall, a temple, a palace (townTalk nameOpts: its factions, shown in the
   *  player's language) - empty until the factions are read. */
  function nameBag() {
    try {
      const o = globalThis.__dfoNameOpts?.();
      if (!o) return null;
      const out = {};
      for (const k of ['factionName', 'templeName', 'shownFactionName', 'shownTempleName', 'palaceName']) if (typeof o[k] === 'function') out[k] = o[k];
      return Object.keys(out).length ? out : null;
    } catch { return null; }
  }
  /** The names the player's own town map gives (the discovered book: the player's own name for it first). */
  function bookNames(loc) {
    const w = W(), out = new Map();
    try {
      const book = w?.bookOf?.(loc);
      for (const r of (book && globalThis.__dfoDisc?.(book)) || []) {
        const n = r?.customUserDisplayName || r?.displayName;
        if (r && n && n !== 'unknown-guild') out.set(r.buildingKey, n);
      }
    } catch { /* no book, no names */ }
    return out;
  }
  /** The town's buildings as the game lays them out now: [{ key, type, faction, quality, name, x, z }], and whether the
   *  game could name its halls and temples yet. */
  function readSites(base) {
    const w = W(), loc = base.loc, bag = nameBag();
    const sums = w.summaries(loc.exterior?.buildings ?? [], base.p.locBlocks, { locationName: loc.name,
      regionName: w.maps?.()?.getRegionName?.(loc.regionIndex) ?? '', locationIndex: loc.locationIndex ?? 0, ...(bag ?? {}) }) ?? [];
    const factions = new Map((loc.exterior?.buildings ?? []).map((q, i) => [i, q?.factionId ?? 0]));
    const book = bookNames(loc);
    const sites = sums.map((s) => {
      const pos = s.position ?? [0, 0, 0];
      return { key: s.buildingKey, type: s.buildingType, faction: s.factionId ?? factions.get(s.recordIndex) ?? 0, quality: s.quality,
        name: book.get(s.buildingKey) || s.name || '', x: Math.round(((s.blockX ?? 0) * SIDE + pos[0]) * 100) / 100,
        z: Math.round(((s.blockY ?? 0) * SIDE + pos[2]) * 100) / 100 };
    });
    return { sites, named: !!bag };
  }
  /** THE TOWN'S SNAPSHOT, as the cache keeps it: { v, at, sig, name, named, sites: [[key, type, faction, quality, name,
   *  x, z]], doors: { key: [x, z] } } - its buildings, their names and every door the client has seen. */
  const META_V = 1;
  const metaOf = (base) => { const m = cache.meta[base.mapId]; return m && m.v === META_V && m.sig === base.sig ? m : null; };
  function writeMeta(base, sites, named, doors) {
    cache.meta[base.mapId] = { v: META_V, at: Date.now(), sig: base.sig, name: base.name, named,
      sites: sites.map((s) => [s.key, s.type, s.faction, s.quality ?? null, s.name, s.x, s.z]), doors };
    dirty();
    return cache.meta[base.mapId];
  }
  /** A town's buildings, in its own metres (x east along its blocks, z along its rows), from its snapshot - made from the
   *  game's layout when there is none yet. The plots are plotsOf's. */
  function geoOf(p) {
    let g = geos.get(p);
    if (g && g.src === p.locBlocks) return g;
    const base = baseOf(p);
    if (!base || !W()?.summaries) return null;
    let meta = metaOf(base);
    if (!meta) { const r = readSites(base); meta = writeMeta(base, r.sites, r.named, {}); }
    const sites = meta.sites.map(([key, type, faction, quality, name, x, z]) => ({ key, type, faction, quality, name, x, z, near: new Set(), door: meta.doors?.[key] ?? null }));
    g = { ...base, meta, sites, byKey: new Map(sites.map((s, i) => [s.key, i])), doorsAt: -1, rev: 0 };
    geos.set(p, g);
    return g;
  }
  /** The snapshot read again from the game (its names, its layout), the doors it knew kept - at the map's opening, at most
   *  once in ASK_GAP_MS (`force`: now). Answers whether anything changed. */
  function refreshMeta(g, force = false) {
    if (!g?.meta || (!force && Date.now() - g.meta.at < ASK_GAP_MS)) return false;
    const r = readSites(g);
    const was = JSON.stringify(g.meta.sites);
    const meta = writeMeta(g, r.sites, r.named, g.meta.doors ?? {});
    if (JSON.stringify(meta.sites) === was) { g.meta = meta; return false; }
    rebuild(g.p);
    return true;
  }
  /** The town's snapshot and its map thrown away whole, made again from what the game holds now. */
  function regenerate(p) {
    const base = baseOf(p);
    if (!base) return;
    delete cache.meta[base.mapId];
    dirty();
    rebuild(p);
  }
  /** A town's buildings and plots made again on the next read (the map's picture and its mesh with them). */
  function rebuild(p) {
    geos.delete(p);
    drawSig = ''; lastLegend = ''; winSig = '';
    if (lastView?.g?.p === p) lastView = null;
  }
  /** How long the map's heavy steps took last (ms) - for the report and a slow machine's question. */
  const perf = {};
  const timed = (k, fn) => { const a = performance.now(); try { return fn(); } finally { perf[k] = Math.round((performance.now() - a) * 10) / 10; } };
  const plotsOf = (g) => { if (g && !g.owner) timed('plots', () => plots(g)); return g; };

  /** How far a building's plot may reach from it (m, each way along each axis): a palace the furthest, an order's hall
   *  or a temple next, a tavern or a shop a little more than a home. */
  const reachOf = (t) => (t === PALACE ? 36 : ORGS.has(t) ? 24 : t === TAVERN || SHOPS.has(t) ? 18 : 16);
  /**
   * THE PLOTS: a grid of rectangles. The town is cut in two along the widest street between its buildings that leaves
   * both sides most even (a cut through the middle of the gap - nearer the smaller building), each side again, until
   * each piece holds one building: every border is a straight line along the town's axes, and the plots line up as the
   * buildings do. A piece reaches no further from its building than the building's reach - past the last houses there is
   * no town, the town is its plots, not its blocks' rectangle - but a gap that leaves inside the town (a square, a
   * crossing) goes back to the piece it was cut from.
   *
   * Laid on a grid of `res` m (a whole number to a block), then drawn as straight lines. Kept on `g`: res, nx, nz, owner
   * (a plot per grid point, -1 none), paths (each plot's area, m), borders (all of them), loops (the town's edge: closed
   * rings), area (each plot's grid points), box (the plots' bounds).
   */
  function plots(g) {
    const S = g.sites;
    const W_ = g.bw * SIDE, H_ = g.bh * SIDE;
    const per = Math.max(64, Math.min(228, Math.round(SIDE / Math.max(0.45, Math.max(W_, H_) / 950))));   // grid points a block's side
    const res = SIDE / per, nx = g.bw * per, nz = g.bh * per, N = nx * nz;
    const inBlock = new Uint8Array(g.bw * g.bh);
    for (const c of g.cells) { const [x, y] = c.split(',').map(Number); if (x >= 0 && y >= 0 && x < g.bw && y < g.bh) inBlock[y * g.bw + x] = 1; }
    const inside = (ix, iz) => inBlock[Math.floor(iz / per) * g.bw + Math.floor(ix / per)] === 1;
    // the cuts
    const rect = S.map(() => null);
    const co = (i, ax) => (ax ? S[i].z : S[i].x);
    const cut = (ids, x0, z0, x1, z1, depth) => {
      if (ids.length === 1 || depth > 64) { for (const i of ids) rect[i] = [x0, z0, x1, z1]; return; }
      let best = null;
      for (const ax of [0, 1]) {
        const sorted = ids.slice().sort((a, b) => co(a, ax) - co(b, ax));
        for (let k = 1; k < sorted.length; k++) {
          const a = sorted[k - 1], b = sorted[k], gap = co(b, ax) - co(a, ax);
          if (gap < 0.5) continue;
          const score = gap * (0.35 + Math.min(k, sorted.length - k) / sorted.length);   // a wide street, then an even cut
          if (!best || score > best.score) {
            const ra = reachOf(S[a].type), rb = reachOf(S[b].type);
            best = { score, ax, k, sorted, at: co(a, ax) + (gap * ra) / (ra + rb) };
          }
        }
      }
      if (!best) { for (const i of ids) rect[i] = [x0, z0, x1, z1]; return; }   // all on one spot: the first holds it
      const lo = best.sorted.slice(0, best.k), hi = best.sorted.slice(best.k);
      if (best.ax === 0) { cut(lo, x0, z0, best.at, z1, depth + 1); cut(hi, best.at, z0, x1, z1, depth + 1); }
      else { cut(lo, x0, z0, x1, best.at, depth + 1); cut(hi, x0, best.at, x1, z1, depth + 1); }
    };
    if (S.length) cut(S.map((_, i) => i), 0, 0, W_, H_, 0);
    // each piece on the grid: whole (`whole`), and as far as its building reaches (`owner`)
    const owner = new Int32Array(N).fill(-1), whole = new Int32Array(N).fill(-1);
    const toI = (v, n) => Math.max(0, Math.min(n, Math.round(v / res)));
    for (let i = S.length - 1; i >= 0; i--) {
      const r = rect[i];
      if (!r) continue;
      const R = reachOf(S[i].type);
      const ax0 = toI(r[0], nx), ax1 = toI(r[2], nx), az0 = toI(r[1], nz), az1 = toI(r[3], nz);
      const cx0 = toI(Math.max(r[0], S[i].x - R), nx), cx1 = toI(Math.min(r[2], S[i].x + R), nx);
      const cz0 = toI(Math.max(r[1], S[i].z - R), nz), cz1 = toI(Math.min(r[3], S[i].z + R), nz);
      for (let iz = az0; iz < az1; iz++) {
        const reach = iz >= cz0 && iz < cz1;
        for (let ix = ax0; ix < ax1; ix++) {
          if (!inside(ix, iz)) continue;
          const k = iz * nx + ix;
          whole[k] = i;
          if (reach && ix >= cx0 && ix < cx1) owner[k] = i;
        }
      }
    }
    // the gaps inside: ground no piece reached that the outside cannot reach either - back to its own piece
    const out = new Uint8Array(N), q = [];
    const seed = (k) => { if (!out[k] && owner[k] < 0) { out[k] = 1; q.push(k); } };
    for (let ix = 0; ix < nx; ix++) { seed(ix); seed((nz - 1) * nx + ix); }
    for (let iz = 0; iz < nz; iz++) { seed(iz * nx); seed(iz * nx + nx - 1); }
    for (let k = 0; k < N; k++) if (whole[k] < 0) seed(k);
    for (let h = 0; h < q.length; h++) {
      const k = q[h], ix = k % nx, iz = (k - ix) / nx;
      if (ix > 0) seed(k - 1); if (ix < nx - 1) seed(k + 1); if (iz > 0) seed(k - nx); if (iz < nz - 1) seed(k + nx);
    }
    for (let k = 0; k < N; k++) if (owner[k] < 0 && !out[k]) owner[k] = whole[k];
    // STRAIGHT LINES THROUGH THE GRID. Each square of four grid points whose corners are not all one plot's is split
    // through its middle, a quarter to each corner's plot. Each piece of border is an edge directed with its plot on one
    // side (the outside is a plot of its own: OUT), the edges of each plot chained into rings, and a ring's straight runs
    // made single lines - a plot is a polygon of a few corners.
    // Coordinates in half grid steps (whole numbers: every corner, midpoint and middle lies on them).
    const OUT = S.length, half = res / 2;
    const lab = (ix, iz) => { if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) return OUT; const o = owner[iz * nx + ix]; return o < 0 ? OUT : o; };
    const row0 = new Int32Array(nx + 2), row1 = new Int32Array(nx + 2);   // two rows of plots, the grid's edge OUT on each side
    const ex0 = [], ez0 = [], ex1 = [], ez1 = [], el = [];
    const near = S.map(() => new Set());
    const edge = (ax, az, bx, bz, la, cx, cz, lb) => {   // the border a-b, plot `la` on the side of the point c, `lb` on the other
      const fwd = (bx - ax) * (cz - az) - (bz - az) * (cx - ax) > 0;
      ex0.push(fwd ? ax : bx, fwd ? bx : ax); ez0.push(fwd ? az : bz, fwd ? bz : az);
      ex1.push(fwd ? bx : ax, fwd ? ax : bx); ez1.push(fwd ? bz : az, fwd ? az : bz);
      el.push(la, lb);
      if (la !== OUT && lb !== OUT) { near[la].add(lb); near[lb].add(la); }
    };
    const L = [0, 0, 0, 0], CX = [0, 0, 0, 0], CZ = [0, 0, 0, 0], MX = [0, 0, 0, 0], MZ = [0, 0, 0, 0];
    for (let x = -1; x <= nx; x++) row1[x + 1] = lab(x, -1);
    for (let iz = -1; iz < nz; iz++) {
      row0.set(row1);
      for (let x = -1; x <= nx; x++) row1[x + 1] = lab(x, iz + 1);
      for (let ix = -1; ix < nx; ix++) {
        const a = row0[ix + 1], b = row0[ix + 2], c = row1[ix + 2], d = row1[ix + 1];
        if (a === b && b === c && c === d) continue;
        L[0] = a; L[1] = b; L[2] = c; L[3] = d;
        const x0 = 2 * ix + 1, x1 = x0 + 2, xm = x0 + 1, z0 = 2 * iz + 1, z1 = z0 + 2, zm = z0 + 1;
        CX[0] = x0; CZ[0] = z0; CX[1] = x1; CZ[1] = z0; CX[2] = x1; CZ[2] = z1; CX[3] = x0; CZ[3] = z1;   // corners clockwise: TL TR BR BL
        MX[0] = xm; MZ[0] = z0; MX[1] = x1; MZ[1] = zm; MX[2] = xm; MZ[2] = z1; MX[3] = x0; MZ[3] = zm;   // M[j] between corners j and j+1
        for (let j = 0; j < 4; j++) if (L[j] !== L[(j + 1) & 3]) edge(MX[j], MZ[j], xm, zm, L[j], CX[j], CZ[j], L[(j + 1) & 3]);
      }
    }
    // each plot's edges into rings: from an edge's end, the next edge of the same plot that starts there
    // (the edges leaving each point: a list through `nextE` from `head`, the point's place in a table of the half steps)
    const E = el.length, used = new Uint8Array(E), VW = 2 * nx + 8, head = new Int32Array(VW * (2 * nz + 8)).fill(-1), nextE = new Int32Array(E);
    const vOf = (x, z) => (z + 2) * VW + (x + 2);
    for (let e = 0; e < E; e++) { const v = vOf(ex0[e], ez0[e]); nextE[e] = head[v]; head[v] = e; }
    const rings = S.map(() => []), loops = [];
    for (let e0 = 0; e0 < E; e0++) {
      if (used[e0]) continue;
      const l = el[e0], pts = [ex0[e0], ez0[e0]];
      let cur = e0;
      for (let guard = 0; guard < E; guard++) {
        used[cur] = 1;
        const x = ex1[cur], z = ez1[cur];
        if (x === pts[0] && z === pts[1]) break;
        pts.push(x, z);
        let nxt = -1;
        for (let c2 = head[vOf(x, z)]; c2 >= 0; c2 = nextE[c2]) if (el[c2] === l && !used[c2]) { nxt = c2; break; }
        if (nxt < 0) break;
        cur = nxt;
      }
      const ring = [];   // a point on a straight run is no corner
      const n2 = pts.length / 2;
      for (let q = 0; q < n2; q++) {
        const pq = (q + n2 - 1) % n2, nq = (q + 1) % n2;
        const ux = pts[q * 2] - pts[pq * 2], uz = pts[q * 2 + 1] - pts[pq * 2 + 1], vx = pts[nq * 2] - pts[q * 2], vz = pts[nq * 2 + 1] - pts[q * 2 + 1];
        if (ux * vz - uz * vx !== 0) ring.push(pts[q * 2] * half, pts[q * 2 + 1] * half);
      }
      if (ring.length < 6) continue;
      if (l === OUT) { const lp = []; for (let q = 0; q < ring.length; q += 2) lp.push([ring[q], ring[q + 1]]); loops.push(lp); } else rings[l].push(ring);
    }
    const paths = S.map(() => new Path2D()), borders = new Path2D();
    for (let i = 0; i < S.length; i++) {
      for (const r of rings[i]) {
        paths[i].moveTo(r[0], r[1]);
        for (let q = 2; q < r.length; q += 2) paths[i].lineTo(r[q], r[q + 1]);
        paths[i].closePath();
      }
      if (rings[i].length) borders.addPath(paths[i]);
    }
    const area = new Uint32Array(S.length);
    for (let k = 0; k < N; k++) if (owner[k] >= 0) area[owner[k]]++;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const l of loops) for (const [x, z] of l) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    if (!Number.isFinite(x0)) { x0 = 0; z0 = 0; x1 = W_; z1 = H_; }
    S.forEach((s, i) => { s.near = near[i]; });
    Object.assign(g, { res, nx, nz, owner, paths, borders, loops, area, box: { x0, z0, x1, z1 } });
  }
  /** Each home's door (the first building door the game built for it), in the town's metres - kept in the snapshot, so a
   *  door seen once is known while its block is not built. */
  function doorsOf(g) {
    const all = globalThis.__dfoDoors;
    if (!Array.isArray(all)) return;
    const pk = `${g.p.px},${g.p.py}`, lo = g.p.locOrigin ?? [0, 0, 0];
    if (all === g.doorsSrc && all.length === g.doorsLen) return;   // the world's doors as they were: nothing to read again
    g.doorsSrc = all; g.doorsLen = all.length;
    const mine = all.filter((d) => d?.pixelKey === pk);
    if (mine.length === g.doorsAt) return;
    g.doorsAt = mine.length;
    const seen = new Set();
    let changed = false;
    for (const d of mine) {
      const m = d.door?.matrix;
      if (!m || (d.door.doorType ?? DOOR_BUILDING) !== DOOR_BUILDING) continue;
      const x = m[12] - lo[0], z = m[14] - lo[2];
      const bx = Math.floor(x / SIDE), by = Math.floor(z / SIDE);
      const inst = g.p.locBlocks.find((b) => (b.x ?? 0) === bx && (b.y ?? 0) === by && (!d.dfBlock || b.dfBlock === d.dfBlock));
      if (!inst) continue;
      const key = ((inst.x ?? 0) << 16) + ((inst.y ?? 0) << 8) + (d.recordIndex ?? 0) || KEY0;
      const i = g.byKey.get(key);
      if (i == null || seen.has(key)) continue;
      seen.add(key);
      const at = [Math.round(x * 100) / 100, Math.round(z * 100) / 100], s = g.sites[i];
      if (!s.door || s.door[0] !== at[0] || s.door[1] !== at[1]) { s.door = at; changed = true; }
    }
    if (changed && g.meta) {
      g.meta.doors = Object.fromEntries(g.sites.filter((s) => s.door).map((s) => [s.key, s.door]));
      dirty();
    }
  }
  /** The towns built round the player: { p, b, ox, oy, oz, dist, g } - `dist` from the feet to the town's blocks, m;
   *  `g` its buildings, made when first read. */
  function townsAround(feet) {
    const w = W(), out = [];
    if (!w?.built || !w.state?.pixelTranslation) return out;
    for (const p of w.built.values()) {
      if (!p?.locBlocks?.length || !p.locOrigin) continue;
      const b = baseOf(p);
      if (!b) continue;
      const t = w.state.pixelTranslation(p.px, p.py, _t);
      const ox = t[0] + p.locOrigin[0], oy = t[1] + p.locOrigin[1], oz = t[2] + p.locOrigin[2];
      const lx = feet[0] - ox, lz = feet[2] - oz;
      const inside = b.cells.has(`${Math.floor(lx / SIDE)},${Math.floor(lz / SIDE)}`);
      const dx = Math.max(0, -lx, lx - b.bw * SIDE), dz = Math.max(0, -lz, lz - b.bh * SIDE);
      out.push({ p, b, ox, oy, oz, dist: inside ? 0 : Math.hypot(dx, dz), get g() { return geoOf(p); } });
    }
    return out;
  }

  // ─── asking the service: at the layer's opening, each thing at most once in ASK_GAP_MS ───────────────────────────
  const inflight = new Set();
  let status = '';
  /** A town's owners read off the game's registry (its own answer of the minute, or a new one). */
  function readTown(g) {
    const H = homesReg();
    if (!H?.homeAt) return false;
    const homes = {};
    for (const s of g.sites) {
      let h = null;
      try { h = H.homeAt(g.mapId, s.key); } catch { h = null; }
      if (!h || typeof h.owner !== 'string') continue;
      const hall = h.hall ? { n: String(h.hall.name ?? h.owner), t: tagOk(h.hall.tag) } : null;
      if (hall?.t) noteGuild(hall.t, hall.n);
      // what its door says of it to anyone: who may walk in, rooms to rent, the town's votes, its own paint, a sale its
      // owner offers, a deed the realm gave
      homes[s.key] = { o: h.owner, ...(h.mine === true || h.own === true ? { m: 1 } : {}), ...(h.guildmate === true ? { gm: 1 } : {}),
        ...(hall ? { hall } : {}), ...(h.member === true ? { mem: 1 } : {}),
        ...(typeof h.entry === 'string' ? { e: h.entry } : {}),
        ...(h.rent && Number.isFinite(h.rent.vacant) ? { r: { v: h.rent.vacant, f: h.rent.from ?? null } } : {}),
        ...(typeof h.score === 'number' && Number.isFinite(h.score) && h.score !== 0 ? { sc: h.score } : {}),
        ...(h.look ? { lk: 1 } : {}), ...(h.deed === true ? { d: 1 } : {}),
        ...(Number.isSafeInteger(h.offer?.price) ? { op: h.offer.price } : {}) };
    }
    cache.towns[g.mapId] = { name: g.name, at: Date.now(), homes };
    dirty();
    return true;
  }
  /** `force`: a town read before is read again once ASK_GAP_MS is past; `now`: whatever its age ("Обновить базу"). */
  function askTowns(towns, { force, now = false }) {
    const H = homesReg();
    if (!H?.ensure) { status = 'реестр домов игры недоступен'; return; }
    for (const T of towns) {
      const g = T.g;
      if (!g) continue;
      const id = g.mapId, c = cache.towns[id];
      if (!id || inflight.has(id)) continue;
      if (c && !now && (!force || Date.now() - c.at < ASK_GAP_MS)) continue;
      inflight.add(id);
      Promise.resolve().then(() => H.ensure(id)).then((ok) => { if (ok) readTown(g); })
        .catch(() => {}).finally(() => inflight.delete(id));
    }
  }
  /** The hub's list of who is online (each with the tag they wear), through the session's own ask and its own pace. */
  function askWho(now = false) {
    if (!now && Date.now() - cache.asked.who < ASK_GAP_MS) return;
    let asked = false;
    const list = globalThis.__dfoSessions ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]?.deref?.();
      if (!s) { list.splice(i, 1); continue; }
      try { if (s.sendHubWho?.()) asked = true; } catch { /* that session cannot ask */ }
    }
    if (asked) { cache.asked.who = Date.now(); dirty(); }
  }
  /** The names of guilds known by tag alone - the arms book's own batched ask. */
  function askArms(tags, now = false) {
    if ((!now && Date.now() - cache.asked.arms < ASK_GAP_MS) || typeof globalThis.__dfoArmsOf !== 'function') return;
    const want = [...tags].filter((t) => !cache.guilds[t]).slice(0, 32);
    if (!want.length) return;
    for (const t of want) { try { globalThis.__dfoArmsOf(t); } catch { /* the book asks what it can */ } }
    cache.asked.arms = Date.now();
    dirty();
  }
  /** THE MAP OPENED over town `T`: the built towns within a map pixel of it, who is online, guilds' names. */
  function opened(T, around, now = false) {
    refreshMeta(T.g, now);
    askTowns(around.filter((o) => Math.abs(o.p.px - T.p.px) <= 1 && Math.abs(o.p.py - T.p.py) <= 1), { force: true, now });
    askWho(now);
    const tags = new Set();
    for (const r of Object.values(cache.players)) if (r.g) tags.add(r.g);
    askArms(tags, now);
    lastAsk = Date.now();
  }
  let lastAsk = 0;
  /** "Обновить базу": the town's owners, who is online, the guilds' names and the snapshot - now, whatever their age. */
  function refreshNow() {
    if (!mode || !modeT) return;
    try { opened(modeT, lastAround, true); } catch (e) { console.warn('[dfo-mod] town map:', e); }
  }
  /** "Перегенерировать город": its snapshot and map thrown away and made again; its owners asked again with them. */
  function regenerateNow() {
    if (!mode || !modeT) return;
    const p = modeT.p;
    regenerate(p);
    const T = lastAround.find((o) => o.p === p);
    if (T) { try { opened(T, lastAround, true); } catch (e) { console.warn('[dfo-mod] town map:', e); } }
  }
  let lastAround = [];
  /** The town the player stands in (its blocks), or null. */
  const townIn = (around) => around.find((T) => T.dist === 0) ?? null;

  // ─── who holds a plot ───────────────────────────────────────────────────────────────────────────────────────────
  /** An owned building's holder: { k: 'own'|'guild'|'none'|'unknown', tag } */
  function holderOf(h, own) {
    if (h.m) return { k: 'own' };
    if (h.hall) {
      if (h.mem || (own?.tag && h.hall.t === own.tag)) return { k: 'own' };
      return h.hall.t ? { k: 'guild', tag: h.hall.t } : { k: 'unknown' };
    }
    if (h.gm) return { k: 'own' };
    const n = norm(h.o);
    if (own?.members.has(n)) return { k: 'own' };
    const rec = cache.players[n];
    if (!rec) return { k: 'unknown' };
    if (!rec.g) return { k: 'none' };
    if (own?.tag && rec.g === own.tag) return { k: 'own' };
    return { k: 'guild', tag: rec.g };
  }

  // ─── colours and patterns ───────────────────────────────────────────────────────────────────────────────────────
  const hashOf = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
  /** Bright pastel colours, one per key, the same key the same colour wherever it can be: a key's own hue, moved on
   *  only where a heavier key of this town already stands near it (or a hue `avoid` keeps for itself). */
  function huesOf(keys, avoid = []) {
    const used = [], out = new Map();
    // how far a hue stands from what is taken: a kept hue (`avoid`) counts as nearer by its margin
    const room = (h) => Math.min(360, ...avoid.map((a) => hueDist(a, h) - 12), ...used.map((u) => hueDist(u, h)));
    for (const k of keys) {
      let h = hashOf(k) % 360;
      if (room(h) < 24) {   // its own hue is taken: the freest one there is
        let best = h, bestRoom = -Infinity;
        for (let c = 0; c < 360; c += 3) { const r = room(c); if (r > bestRoom) { bestRoom = r; best = c; } }
        h = best;
      }
      const crowded = room(h) < 16;   // a crowded town tells its colours apart by their light too
      used.push(h);
      out.set(k, `hsl(${h},80%,${crowded ? 60 : 74}%)`);
    }
    return out;
  }
  const huesSeen = new Map();
  /** huesOf, kept: the same keys give the same colours without reckoning them again each frame. */
  const huesMemo = (keys, avoid) => {
    const k = `${keys.join('\u0001')}|${avoid.join(',')}`;
    let out = huesSeen.get(k);
    if (!out) { if (huesSeen.size > 64) huesSeen.clear(); out = huesOf(keys, avoid); huesSeen.set(k, out); }
    return out;
  };
  const tile = (w, h, draw) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d', { willReadFrequently: true }), w, h);   // kept off the GPU: its picture is read for the key's swatches
    return c;
  };
  const tiles = new Map();
  /** 45° stripes of `color` over `back` (null: clear) - a tile drawn once, a pattern made per context. */
  function stripeTile(color, back = null, width = 4) {
    const k = `s|${color}|${back}|${width}`;
    if (!tiles.has(k)) tiles.set(k, tile(14, 14, (g, w) => {
      if (back) { g.fillStyle = back; g.fillRect(0, 0, w, w); }
      g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'square';
      for (const c of [-w, 0, w]) { g.beginPath(); g.moveTo(c, w); g.lineTo(c + w, 0); g.stroke(); }
    }));
    return tiles.get(k);
  }
  /** No guild: dark grey, hatched both ways. */
  const hatchTile = () => {
    if (!tiles.has('hatch')) tiles.set('hatch', tile(10, 10, (g, w) => {
      g.fillStyle = 'rgba(52,52,52,0.78)'; g.fillRect(0, 0, w, w);
      g.strokeStyle = 'rgba(165,165,165,0.85)'; g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(w, w); g.moveTo(0, w); g.lineTo(w, 0); g.stroke();
    }));
    return tiles.get('hatch');
  };
  /** Unknown: large question marks, gold in black, on nothing. */
  const askTile = () => {
    if (!tiles.has('ask')) tiles.set('ask', tile(40, 40, (g, w) => {
      g.font = "bold 30px 'Pixelify Sans', Georgia, serif"; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round'; g.lineWidth = 4; g.strokeStyle = '#000'; g.fillStyle = GOLD;
      g.strokeText('?', w / 2, w / 2 + 1); g.fillText('?', w / 2, w / 2 + 1);
    }));
    return tiles.get('ask');
  };
  const alpha = (css, a) => {   // a solid colour, see-through
    if (css.startsWith('hsl(')) return css.replace('hsl(', 'hsla(').replace(')', `,${a})`);
    const n = parseInt(css.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  // ─── the mode ───────────────────────────────────────────────────────────────────────────────────────────────────
  /** While the detailed map is open: { mapId, p, fx, fz } - the town and the camera's focus in its own metres. */
  let mode = null;
  /** What the last frame drew (dfo_town.js draw): the windows and a click read it. */
  let lastView = null;
  /** The players in the town now (the marks' filter's count, a frame behind the drawing). */
  let onlineNow = [];
  /** This frame's town while the map is open: { g, ox, oy, oz } (the marks' filter reads it). */
  let modeT = null;
  let lastFrame = 0, lastTick = 0;
  const keys = new Set();
  let drag = null;
  /** The screen's pixels to the town's metres at the focus (the inverse of the projection's slope there). */
  let inv = null;

  function enterMode(T, around) {
    const lx = (T.feet?.[0] ?? 0) - T.ox, lz = (T.feet?.[2] ?? 0) - T.oz;
    try { timed('ask', () => opened(T, around)); } catch (e) { console.warn('[dfo-mod] town map:', e); }   // the snapshot first: the plots are made of it
    const g = plotsOf(T.g);
    if (!g) return;
    mode = { mapId: T.b.mapId, p: T.p, fx: clampX(g, lx), fz: clampZ(g, lz) };
    keys.clear(); drag = null; turn.yaw = 0; turn.tilt = 0;
    document.body.classList.add('dfo-citymap');
    paintUi();
  }
  function exitMode() {
    if (!mode) return;
    mode = null; modeT = null; onlineNow = [];
    keys.clear(); drag = null;
    if (camSaved) { camRestore = { ...camSaved, at: performance.now() }; camSaved = null; }   // the travel view's own angle, given back
    closeWin();
    document.body.classList.remove('dfo-citymap');
    showCanvases(false);
    lastView = null;
    paintUi();
  }
  // the camera's point never leaves the plots' bounds (the town's blocks before they are made)
  const clampX = (g, x) => (g.box ? Math.max(g.box.x0, Math.min(g.box.x1, x)) : Math.max(0, Math.min(g.bw * SIDE, x)));
  const clampZ = (g, z) => (g.box ? Math.max(g.box.z0, Math.min(g.box.z1, z)) : Math.max(0, Math.min(g.bh * SIDE, z)));

  // THE CAMERA'S OWN TURN. The travel view's camera (player/travelCamera.js: its heading `yaw`, its `tilt` between 15 and
  // 75 degrees) is handed here before each of its steps (transforms.cjs townCamera): while the map is open it is turned by
  // the map's own keys and drag, and the angle it had is given back when the map closes - the travel view's never moves.
  const TILT_MIN = (15 * Math.PI) / 180, TILT_MAX = (75 * Math.PI) / 180;
  const turn = { yaw: 0, tilt: 0 };
  let camSaved = null, camRestore = null;
  globalThis.__dfoCamAdj = (c) => {
    if (!c || typeof c.yaw !== 'number' || typeof c.tilt !== 'number') return c;
    if (mode) {
      camSaved ??= { yaw: c.yaw, tilt: c.tilt };
      camRestore = null;
      if (!turn.yaw && !turn.tilt) return c;
      const out = { ...c, yaw: c.yaw + turn.yaw, tilt: Math.max(TILT_MIN, Math.min(TILT_MAX, c.tilt + turn.tilt)) };
      turn.yaw = 0; turn.tilt = 0;
      return out;
    }
    if (camRestore) {   // on the view's next step - not on a new view's, long after
      const r = camRestore;
      camRestore = null;
      if (performance.now() - r.at < 2000) return { ...c, yaw: r.yaw, tilt: r.tilt };
    }
    return c;
  };
  // the Overworld went down under the map (a foe near, a door, the view closed): the interface comes back. Its window
  // gone or hidden says so at once; its frames stopped, after 3 s - a long frame (the world loading round the camera)
  // is not a way out.
  setInterval(() => {
    if (!mode) return;
    const root = cv?.parentNode;
    const gone = !root?.isConnected || !root.getClientRects().length;
    if (gone || performance.now() - lastFrame > 3000) exitMode();
  }, 300);

  /** THE CAMERA'S POINT while the map is open: the focus over the town, on its ground. */
  globalThis.__dfoCamFeet = () => {
    if (!mode) return undefined;
    const w = W(), p = mode.p;
    if (!w?.state?.pixelTranslation || !p?.locOrigin) return undefined;
    const t = w.state.pixelTranslation(p.px, p.py, [0, 0, 0]);
    const x = t[0] + p.locOrigin[0] + mode.fx, z = t[2] + p.locOrigin[2] + mode.fz;
    let y = t[1] + p.locOrigin[1];
    try { const gy = w.ground?.(x, z); if (Number.isFinite(gy)) y = gy; } catch { /* the town's own height */ }
    return [x, y, z];
  };
  /** The marks while the map is open: the town's own alone - its taverns', shops' and orders' (dfo) and its yards' -
   *  inside its blocks, and none with "Метки заведений" off. */
  globalThis.__dfoMarkFilter = (marks) => {
    if (!mode || !Array.isArray(marks)) return marks;
    // never an empty list: the readout keeps the last picture it drew when handed none (travelViewHud drawMarks) - a mark
    // nowhere (no point: never drawn) makes it draw again, and the marks switched off go
    const none = { key: 'dfo-town-none', kind: 'dfo-none', label: '', at: [NaN, NaN, NaN] };
    if (!modeT) return state.marks ? [...marks, none] : [none];
    const { g, ox, oz } = modeT;
    const inside = (a) => {   // on a plot of the town
      if (!a) return false;
      const lx = a[0] - ox, lz = a[2] - oz;
      if (!g.owner) return g.cells.has(`${Math.floor(lx / SIDE)},${Math.floor(lz / SIDE)}`);
      const ix = Math.floor(lx / g.res), iz = Math.floor(lz / g.res);
      return ix >= 0 && iz >= 0 && ix < g.nx && iz < g.nz && g.owner[iz * g.nx + ix] >= 0;
    };
    // the players in the town now (the Overworld's travellers, my party, strangers) - for the town's card, never drawn
    const online = [];
    for (const m of marks) {
      const kind = String(m?.kind ?? '').split(' ')[0];
      if ((kind === 'traveller' || kind === 'party' || kind === 'stranger') && inside(m.at) && typeof m.label === 'string' && m.label) {
        const gt = tagOk(m.badge?.gt);
        online.push({ name: m.label, gt, kind });
        if (gt) see(m.label, gt, 'ow');
      }
    }
    onlineNow = online;
    if (!state.marks) return [none];
    const out = marks.filter((m) => {
      const kind = String(m?.kind ?? '').split(' ')[0];
      return (kind === 'dfo' || kind === 'yard') && inside(m.at);
    });
    out.push(none);
    return out;
  };
  /** Move the focus by a screen vector (px), or by its world image: `sign` 1 the way the screen points, -1 the ground's
   *  drag (the land follows the cursor). */
  function panScreen(dx, dy, sign) {
    if (!mode || !inv || !modeT) return;
    const wx = inv[0] * dx + inv[1] * dy, wz = inv[2] * dx + inv[3] * dy;
    mode.fx = clampX(modeT.g, mode.fx + sign * wx);
    mode.fz = clampZ(modeT.g, mode.fz + sign * wz);
  }

  // ─── the player's controls, taken while the map is open ─────────────────────────────────────────────────────────
  // Registered before the game's own (this script runs ahead of its modules), on the window, in the capture phase: the
  // map's presses never reach the game. A key let go still does (the game lets go what it held); F-keys stay the
  // browser's. The wheel stays the game's (the camera's height).
  const ours = (t) => !!ui && t instanceof Node && ui.contains(t);
  const swallow = (e) => { e.stopImmediatePropagation(); if (e.cancelable) e.preventDefault(); };
  addEventListener('keydown', (e) => {
    if (!mode) return;
    if (e.key === 'Escape') { swallow(e); if (win) closeWin(); else exitMode(); return; }
    if (/^F\d{1,2}$/.test(e.key)) return;
    keys.add(e.code);
    swallow(e);
  }, true);
  addEventListener('keyup', (e) => { if (mode) keys.delete(e.code); }, true);
  addEventListener('blur', () => keys.clear());
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'mousedown', 'mouseup', 'click', 'dblclick',
    'auxclick', 'contextmenu', 'touchstart', 'touchmove', 'touchend']) {
    addEventListener(type, (e) => {
      if (!mode || ours(e.target)) return;
      // the left button (a finger) drags the land, the right or the middle turns the camera round its point
      if (type === 'pointerdown' && !drag && (e.button === 0 || e.button === 1 || e.button === 2 || e.pointerType === 'touch')) {
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false, orbit: e.button === 1 || e.button === 2 };
      } else if (type === 'pointermove' && drag?.id === e.pointerId) {
        if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 5) drag.moved = true;
        if (drag.moved && drag.orbit) { turn.yaw += (e.clientX - drag.x) * 0.005; turn.tilt += (e.clientY - drag.y) * 0.004; }
        else if (drag.moved) panScreen(e.clientX - drag.x, e.clientY - drag.y, -1);
        drag.x = e.clientX; drag.y = e.clientY;
      } else if ((type === 'pointerup' || type === 'pointercancel') && drag?.id === e.pointerId) {
        const click = type === 'pointerup' && !drag.moved && !drag.orbit;
        drag = null;
        if (click) { try { clickAt(e.clientX, e.clientY); } catch (err) { console.warn('[dfo-mod] town map:', err); } }
      }
      swallow(e);
    }, { capture: true, passive: false });
  }

  // ─── the canvas, the button, the map's own interface ────────────────────────────────────────────────────────────
  let rootSize = null, sizer = null;
  let cv = null, ctx = null, btn = null, ui = null, barEl = null, titleEl = null, subEl = null, keyEl = null, rowsEl = null, allBtn = null;
  let keyRows = [];
  let winEl = null, winTitle = null, winTabs = null, winBody = null;
  const css = `body.dfo-citymap>*:not(#c):not(.tview):not(script):not(style):not(link){visibility:hidden!important}
body.dfo-citymap .tview>*:not(#dfo-town-layer):not(#dfo-town-gl):not(.tview-canvas):not(#dfo-city-ui){display:none!important}
body:not(.dfo-citymap) #dfo-town-layer,body:not(.dfo-citymap) #dfo-town-gl{display:none!important}
#dfo-city-btn{margin:6px 10px 2px;width:auto;grid-template-columns:8px 1fr}
#dfo-city-btn:disabled{opacity:.42;cursor:default}
#dfo-city-ui{position:absolute;inset:0;pointer-events:none;display:none;font-family:var(--data,'Pixelify Sans',system-ui,sans-serif);color:var(--bone,#e8dcc0)}
body.dfo-citymap #dfo-city-ui{display:block}
#dfo-city-ui .dfo-panel{pointer-events:auto;box-sizing:border-box;background:linear-gradient(180deg,rgba(23,27,33,.92),rgba(14,16,19,.94));
border:1px solid rgba(192,138,62,.45);border-radius:3px;box-shadow:0 2px 14px rgba(0,0,0,.55)}
#dfo-city-ui .dfo-top{position:absolute;top:12px;left:12px;right:12px;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none}
#dfo-city-ui .dfo-bar{display:flex;gap:6px;padding:6px;max-width:100%;flex-wrap:wrap;justify-content:center}
#dfo-city-ui .dfo-bar button{display:flex;align-items:center;gap:7px;padding:5px 11px;cursor:pointer;color:var(--dim,#a9a08a);background:rgba(43,50,59,.45);
border:1px solid transparent;border-radius:2px;font:inherit;font-size:12px;letter-spacing:.04em}
#dfo-city-ui .dfo-bar button.on{color:var(--bone,#f1e6c8);background:rgba(78,127,114,.32);border-color:rgba(192,138,62,.5)}
#dfo-city-ui .dfo-bar button .d{width:8px;height:8px;border-radius:50%}
#dfo-city-ui .dfo-bar button.dfo-exit{color:#f1d9d0;background:rgba(140,58,50,.45);border-color:rgba(200,90,70,.6)}
#dfo-city-ui .dfo-title{text-align:center;pointer-events:none}
#dfo-city-ui .dfo-title .n{font-size:36px;letter-spacing:.1em;text-transform:uppercase;color:#f6e7b0;text-shadow:0 2px 0 #000,0 0 10px rgba(0,0,0,.9),0 0 2px #000}
#dfo-city-ui .dfo-title .s{font-size:15px;margin-top:2px;color:${GOLD};text-shadow:0 1px 0 #000,0 0 6px rgba(0,0,0,.9)}
#dfo-city-ui .dfo-key{position:absolute;right:12px;top:60px;width:280px;max-height:calc(100vh - 80px);display:flex;flex-direction:column}
#dfo-city-ui .dfo-key .h{padding:7px 12px;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--dim,#a9a08a);border-bottom:1px solid rgba(192,138,62,.2)}
#dfo-city-ui .dfo-key .rows{overflow-y:auto;overscroll-behavior:contain;padding:6px;min-height:0}
#dfo-city-ui .dfo-key .r{display:flex;align-items:center;gap:8px;padding:4px 6px;cursor:pointer;border-radius:2px;font-size:12px;user-select:none}
#dfo-city-ui .dfo-key .r:hover{background:rgba(255,255,255,.06)}
#dfo-city-ui .dfo-key .r .sw{flex:0 0 20px;height:12px;border:1px solid rgba(0,0,0,.85)}
#dfo-city-ui .dfo-key .r .tx{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#dfo-city-ui .dfo-key .r .ck{flex:0 0 auto;font-size:13px;opacity:.85}
#dfo-city-ui .dfo-key .r.off{opacity:.4}
#dfo-city-ui .dfo-key .r.off .sw{filter:grayscale(1)}
#dfo-city-ui .dfo-key .sec{padding:8px 6px 2px;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim,#a9a08a)}
#dfo-city-ui .dfo-bar button.dfo-info{color:#f6e7b0;border-color:rgba(192,138,62,.5)}
#dfo-city-ui .dfo-win{background:linear-gradient(180deg,rgba(23,27,33,.985),rgba(14,16,19,.985))!important;position:absolute;left:50%;top:132px;transform:translateX(-50%);width:min(660px,calc(100vw - 330px));min-width:360px;max-height:calc(100vh - 150px);display:flex;flex-direction:column}
#dfo-city-ui .dfo-win .wh{display:flex;align-items:center;gap:8px;padding:8px 10px 8px 14px;font-size:14px;letter-spacing:.05em;color:#f6e7b0;border-bottom:1px solid rgba(192,138,62,.25)}
#dfo-city-ui .dfo-win .wh .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#dfo-city-ui .dfo-win .wh button{background:none;border:0;color:var(--dim,#a9a08a);cursor:pointer;font:inherit;font-size:14px}
#dfo-city-ui .dfo-win .tabs{display:flex;flex-wrap:wrap;gap:4px;padding:6px 10px;border-bottom:1px solid rgba(192,138,62,.2)}
#dfo-city-ui .dfo-win .tabs:empty{display:none}
#dfo-city-ui .dfo-win .tabs button{padding:4px 10px;cursor:pointer;color:var(--dim,#a9a08a);background:rgba(43,50,59,.45);border:1px solid transparent;border-radius:2px;font:inherit;font-size:12px}
#dfo-city-ui .dfo-win .tabs button.on{color:var(--bone,#f1e6c8);background:rgba(78,127,114,.32);border-color:rgba(192,138,62,.5)}
#dfo-city-ui .dfo-win .wb{overflow-y:auto;overscroll-behavior:contain;padding:8px 14px 14px;font-size:12.5px;line-height:1.45;min-height:0}
#dfo-city-ui .dfo-win table{border-collapse:collapse;width:100%;margin:2px 0 8px}
#dfo-city-ui .dfo-win table.kv th{text-align:left;font-weight:normal;color:var(--dim,#a9a08a);padding:2px 12px 2px 0;width:44%;vertical-align:top}
#dfo-city-ui .dfo-win table.kv td{padding:2px 0;vertical-align:top}
#dfo-city-ui .dfo-win table.grid th{text-align:left;font-weight:normal;color:var(--dim,#a9a08a);border-bottom:1px solid rgba(192,138,62,.25);padding:3px 6px;white-space:nowrap}
#dfo-city-ui .dfo-win table.grid td{padding:3px 6px;border-bottom:1px solid rgba(255,255,255,.05);vertical-align:top}
#dfo-city-ui .dfo-win .sw{display:inline-block;width:13px;height:9px;border:1px solid #000;margin-right:6px;vertical-align:middle}
#dfo-city-ui .dfo-win .sec{margin:12px 0 3px;font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim,#a9a08a)}
#dfo-city-ui .dfo-win .sec:first-child{margin-top:2px}
#dfo-city-ui .dfo-win .p{opacity:.75;font-size:11.5px;margin:3px 0}
#dfo-city-ui .dfo-key .h{display:flex;align-items:center;gap:8px}
#dfo-city-ui .dfo-key .h span{flex:1}
#dfo-city-ui .dfo-key .h button{pointer-events:auto;cursor:pointer;padding:3px 8px;font:inherit;font-size:10.5px;letter-spacing:.06em;text-transform:none;color:var(--bone,#f1e6c8);background:rgba(43,50,59,.6);border:1px solid rgba(192,138,62,.45);border-radius:2px}
#dfo-city-ui .dfo-win .acts{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 4px}
#dfo-city-ui .dfo-win .acts button{cursor:pointer;padding:6px 14px;font:inherit;font-size:12.5px;color:var(--bone,#f1e6c8);background:rgba(78,127,114,.32);border:1px solid rgba(192,138,62,.5);border-radius:2px}
#dfo-city-ui .dfo-win .acts button.warn{background:rgba(140,58,50,.45);border-color:rgba(200,90,70,.6);color:#f1d9d0}
#dfo-city-ui .dfo-win .acts button:disabled{opacity:.45;cursor:default}
#dfo-city-ui .dfo-win .sys{margin:2px 0 8px;font-size:12px;color:#9fd3c7}`;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const BAR = [
    ['influence', 'Влияние гильдий', 'hsl(280,80%,74%)'],
    ['doors', 'Входы и владельцы', GOLD],
    ['marks', 'Метки заведений', GROUP_COLOR.shops],
  ];
  function ensureDom() {
    const root = document.querySelector('.tview');
    if (!root) return null;
    if (!document.getElementById('dfo-town-style')) { const s = el('style'); s.id = 'dfo-town-style'; s.textContent = css; document.head.appendChild(s); }
    if (!cv) {
      cv = el('canvas');
      cv.id = 'dfo-town-layer';
      cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:none';
      ctx = cv.getContext('2d');
      glcv = el('canvas');
      glcv.id = 'dfo-town-gl';
      glcv.style.cssText = cv.style.cssText;
    }
    if (cv.parentNode !== root) {
      root.insertBefore(cv, root.firstChild);
      // the window's size, told when it changes - never asked of the layout each frame
      rootSize = null;
      try {
        sizer?.disconnect();
        sizer = new ResizeObserver((es) => { const r = es[es.length - 1]?.contentRect; if (r) rootSize = { w: r.width, h: r.height }; });
        sizer.observe(root);
      } catch { sizer = null; }
    }
    if (glcv.parentNode !== root || glcv.nextSibling !== cv) root.insertBefore(glcv, cv);   // the plots under the edge and the labels
    // the way in: under the filters' head, so a folded block still shows it
    const side = root.querySelector('.tview-side'), head = side?.querySelector('.tview-side-head');
    if (side && (!btn || btn.parentNode !== side)) {
      btn ??= buildButton();
      side.insertBefore(btn, head ? head.nextSibling : side.firstChild);
    }
    if (!ui) ui = buildUi();
    if (ui.parentNode !== root) root.appendChild(ui);
    return root;
  }
  let enterWanted = false;
  function buildButton() {
    const b = el('button', 'tview-filter on');
    b.id = 'dfo-city-btn';
    b.type = 'button';
    const d = el('span', 'tview-fdot'); d.style.background = '#f6e7b0';
    b.append(d, el('span', 'tview-fword', 'Подробная карта города'));
    b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); if (!b.disabled) enterWanted = true; };
    return b;
  }
  function buildUi() {
    const u = el('div');
    u.id = 'dfo-city-ui';
    barEl = el('div', 'dfo-panel dfo-bar');
    for (const [k, word, dot] of BAR) {
      const b = el('button');
      b.type = 'button';
      b.dataset.dfo = k;
      const d = el('span', 'd'); d.style.background = dot;
      b.append(d, el('span', null, word));
      b.onclick = (e) => { e.preventDefault(); state[k] = !state[k]; saveState(); paintUi(); };
      barEl.append(b);
    }
    const info = el('button', 'dfo-info', 'ℹ Инфо о городе');
    info.type = 'button';
    info.onclick = (e) => { e.preventDefault(); if (win?.kind === 'town') closeWin(); else openWin({ kind: 'town', tab: lastTab }); };
    barEl.append(info);
    const data = el('button', 'dfo-info', '⟳ Данные города');
    data.type = 'button';
    data.dataset.win = 'data';
    data.onclick = (e) => { e.preventDefault(); if (win?.kind === 'data') closeWin(); else openWin({ kind: 'data' }); };
    barEl.append(data);
    const x = el('button', 'dfo-exit', '✕ Выйти (Esc)');
    x.type = 'button';
    x.onclick = (e) => { e.preventDefault(); exitMode(); };
    barEl.append(x);
    const title = el('div', 'dfo-title');
    titleEl = el('div', 'n', '');
    subEl = el('div', 's', '');
    title.append(titleEl, subEl);
    keyEl = el('div', 'dfo-panel dfo-key');
    rowsEl = el('div', 'rows');
    const head = el('div', 'h');
    allBtn = el('button', null, 'Скрыть окраску');
    allBtn.type = 'button';
    allBtn.onclick = (e) => {   // every row's switch at once: all off, or (all off already) all on
      e.preventDefault();
      const keys2 = keyRows.map((r) => r.key);
      const off = keys2.length && keys2.every((k) => hidden.has(k));
      for (const k of keys2) { if (off) hidden.delete(k); else hidden.add(k); }
      state.hidden = [...hidden]; saveState(); keySig = '';
    };
    head.append(el('span', null, 'Легенда'), allBtn);
    keyEl.append(head, rowsEl);
    winEl = el('div', 'dfo-panel dfo-win');
    const wh = el('div', 'wh');
    winTitle = el('span', 't', '');
    const wx = el('button', null, '✕'); wx.type = 'button';
    wx.onclick = (e) => { e.preventDefault(); closeWin(); };
    wh.append(winTitle, wx);
    winTabs = el('div', 'tabs');
    winBody = el('div', 'wb');
    winEl.append(wh, winTabs, winBody);
    winEl.style.display = 'none';
    const top = el('div', 'dfo-top');
    top.append(barEl, title);
    u.append(top, keyEl, winEl);
    return u;
  }
  function paintUi() {
    if (barEl) for (const b of barEl.querySelectorAll('button[data-dfo]')) {
      const on = !!state[b.dataset.dfo];
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }
  const setText = (n, t) => { if (n && n.textContent !== t) n.textContent = t; };
  let keySig = '';
  /** The key: each row a switch - its swatch, its words, how many, and whether it is shown. */
  function paintKey(sections) {
    keyRows = sections.flatMap((sec) => sec.rows);
    if (allBtn) setText(allBtn, keyRows.length && keyRows.every((r) => hidden.has(r.key)) ? 'Показать окраску' : 'Скрыть окраску');
    const sig = JSON.stringify(sections) + [...hidden].join('|');
    if (sig === keySig || !rowsEl) return;
    keySig = sig;
    rowsEl.textContent = '';
    for (const sec of sections) {
      if (sec.title) rowsEl.append(el('div', 'sec', sec.title));
      for (const r of sec.rows) {
        const off = hidden.has(r.key);
        const row = el('div', `r${off ? ' off' : ''}`);
        const sw = el('span', 'sw');
        if (r.tile) { sw.style.backgroundImage = `url(${r.tile})`; sw.style.backgroundSize = r.size ?? 'auto'; sw.style.backgroundPosition = 'center'; } else sw.style.background = r.color;
        row.append(sw, el('span', 'tx', r.text), el('span', 'ck', off ? '☐' : '☑'));
        row.onclick = (e) => { e.preventDefault(); toggleHidden(r.key); keySig = ''; };
        rowsEl.append(row);
      }
    }
  }
  const urls = new WeakMap();
  const tileUrl = (c) => { if (!urls.has(c)) { let u = ''; try { u = c.toDataURL(); } catch { u = ''; } urls.set(c, u); } return urls.get(c); };

  // ─── the windows: the town's card (its tabs) and a building's ───────────────────────────────────────────────────
  /** The open window: { kind: 'town', tab } or { kind: 'building', key } - or null. */
  let win = null, winSig = '', lastTab = 'overview';
  const TOWN_TABS = [['overview', 'Обзор'], ['guilds', 'Гильдии'], ['people', 'Жители'], ['estate', 'Недвижимость'],
    ['venues', 'Заведения'], ['economy', 'Экономика'], ['seat', 'Престол']];
  const TYPE_NAME = { 0: 'Алхимик', 1: 'Дом на продажу', 2: 'Бронник', 3: 'Банк', 4: 'Городское здание', 5: 'Книжная лавка', 6: 'Портной',
    7: 'Мебельщик', 8: 'Ювелир', 9: 'Общий магазин', 10: 'Библиотека', 11: 'Гильдия / орден', 12: 'Ломбард', 13: 'Оружейник', 14: 'Храм',
    15: 'Таверна', 16: 'Дворец', 17: 'Дом', 18: 'Дом', 19: 'Дом', 20: 'Дом', 21: 'Дом', 22: 'Дом', 23: 'Городское здание', 24: 'Корабль' };
  /** What each shop buys (systems/shopStock.js SHOP_BUYS_GROUPS), in words. */
  const BUYS_RU = { 0: 'самоцветы, ингредиенты (растения, части тварей, металлы, прочие)', 2: 'доспехи, оружие', 5: 'книги',
    6: 'мужская и женская одежда', 7: 'мебель', 8: 'самоцветы, украшения', 9: 'книги, одежда, украшения, оружие, безделушки',
    12: 'доспехи, книги, одежда, самоцветы, украшения, религиозные предметы, оружие, безделушки, картины', 13: 'доспехи, оружие' };
  const ENTRY_RU = { private: 'только владелец', party: 'группа владельца', public: 'все', guild: 'гильдия владельца' };
  const BAND_RU = { Booming: 'процветает', Thriving: 'богатеет', Steady: 'держится', Struggling: 'бедствует', Destitute: 'разорена' };
  const EDICT_RU = { 'market-day': 'рыночный день', festival: 'праздник', levy: 'поборы', curfew: 'комендантский час', 'open-gates': 'открытые ворота',
    conscription: 'набор в войско', tithe: 'десятина' };
  const TIER_RU = { palace: 'дворец', crown: 'корона' };
  const SOURCE_RU = { hub: 'список онлайна', tag: 'видели в игре', ow: 'видели на карте', roster: 'состав вашей гильдии' };
  /** The vanilla greeting's band of a shop's quality (DaggerfallTradeWindow: 266-270). */
  const qualityWord = (q) => (q > 17 ? 'роскошная' : q > 13 ? 'богатая' : q > 7 ? 'обычная' : q > 3 ? 'скромная' : 'захудалая');
  const tr = (t) => { try { return typeof globalThis.__translate === 'function' && t ? globalThis.__translate(t) ?? t : t; } catch { return t; } };
  const pct = (x) => `${Math.round(x)}%`;
  const ago = (at) => { if (!at) return '—'; const m = Math.round((Date.now() - at) / 60000); return m < 1 ? 'только что' : m < 60 ? `${m} мин назад` : m < 2880 ? `${Math.round(m / 60)} ч назад` : `${Math.round(m / 1440)} дн назад`; };
  const guildName = (tag) => (tag ? `[${tag}]${cache.guilds[tag]?.n ? ` ${cache.guilds[tag].n}` : ''}` : '—');
  /** A shop's figures through the game's own law (dfo_marks.js priceOf), or null. */
  const priceAt = (v, s) => { try { return globalThis.__dfoMod?.priceOf?.({ buildingType: s.type, quality: s.quality, buildingKey: s.key, regionIndex: v.g.loc.regionIndex ?? 0, townMapId: v.g.mapId }) ?? null; } catch { return null; } };
  /** The counters' index here (region x town x seat), per mode, for a buyer of no guild (`everyone`) or this player. */
  function indexAt(v, mode, { everyone = true, town = true } = {}) {
    const adj = globalThis.__dfoShopAdj;
    if (typeof adj !== 'function') return null;
    const b = { regionIndex: v.g.loc.regionIndex ?? 0, ...(town ? { townMapId: v.g.mapId } : {}) };
    if (everyone) globalThis.__dfoNoGuild = true;
    try { const n = adj(b, mode); return Number.isFinite(n) ? n / 1000 : null; } catch { return null; } finally { globalThis.__dfoNoGuild = false; }
  }
  const holderWords = (H) => (!H ? '—' : H.k === 'own' ? 'вы / ваша гильдия' : H.k === 'guild' ? guildName(H.tag) : H.k === 'none' ? 'без гильдии' : 'неизвестна');
  /** The town's figures once: its homes, accounts, guilds, venues. */
  function townFacts(v) {
    const S = v.g.sites, I = v.info;
    const homes = [], owned = [], halls = [], accounts = new Map(), guilds = new Map();
    const guildOf = (k) => guilds.get(k) ?? guilds.set(k, { homes: 0, halls: 0, accounts: new Set(), seat: false }).get(k);
    for (let i = 0; i < S.length; i++) {
      if (!I[i].home) continue;
      homes.push(i);
      const h = I[i].h;
      if (!h) continue;
      owned.push(i);
      const H = I[i].holder, gk = H?.k === 'own' ? 'own' : H?.k === 'guild' ? `g:${H.tag}` : H?.k ?? 'unknown';
      if (h.hall) { halls.push(i); guildOf(gk).halls++; continue; }
      const a = norm(h.o);
      const acc = accounts.get(a) ?? accounts.set(a, { name: h.o, keys: [], mine: !!h.m, holder: H }).get(a);
      acc.keys.push(i);
      const G = guildOf(gk);
      G.homes++;
      G.accounts.add(a);
    }
    if (v.seatK) guildOf(v.seatK).seat = true;
    const venues = { shops: [], taverns: [], orgs: [], other: [] };
    for (let i = 0; i < S.length; i++) {
      const gr = I[i].group;
      if (gr === 'shops' && (S[i].type === 3 || S[i].type === 10)) venues.other.push(i);
      else if (gr) venues[gr].push(i);
    }
    return { S, I, homes, owned, halls, accounts, guilds, venues };
  }
  /** THE TOWN'S CARD, tab by tab: a list of blocks - { kv }, { grid, head }, { sec }, { p }. */
  function townModel(v, tab) {
    const F = townFacts(v), { S, I } = F, g = v.g, B = [];
    const regionName = (() => { try { return W()?.maps?.()?.getRegionName?.(g.loc.regionIndex) ?? ''; } catch { return ''; } })();
    const econ = (() => { try { return globalThis.__dfoHost?.econ?.() ?? null; } catch { return null; } })();
    const p = (() => { try { return econ?.prosperityOf?.(g.mapId) ?? null; } catch { return null; } })();
    const band = (() => { try { return econ?.bandOf?.(g.mapId) ?? null; } catch { return null; } })();
    const seatRaw = (() => { try { return globalThis.__dfoCharterAt?.(g.mapId) ?? null; } catch { return null; } })();
    const t = cache.towns[g.mapId];
    const ownedPct = F.homes.length ? (F.owned.length / F.homes.length) * 100 : 0;
    const guildRows = [...F.guilds].filter(([k]) => k !== 'unknown' && k !== 'none');
    if (tab === 'overview') {
      B.push({ kv: [
        ['Город', g.name], ['Регион', tr(regionName) || '—'], ['Клетка карты', `${g.p.px}, ${g.p.py}`],
        ['Размер', `${g.bw}×${g.bh} кварталов (${g.cells.size}), ~${Math.round(g.cells.size * SIDE * SIDE / 1e4) / 100} км²`],
        ['Зданий всего', S.length],
        ['Жилой фонд', `${F.homes.length} домов: занято ${F.owned.length} (${pct(ownedPct)}), свободно ${F.homes.length - F.owned.length}`],
        ['Залы гильдий игроков', F.halls.length],
        ['Жители (аккаунты)', `${F.accounts.size}`],
        ['Гильдии игроков с владениями', guildRows.filter(([k]) => k !== 'own').length + (F.guilds.has('own') && v.own?.tag ? 1 : 0)],
        ['Магазины / таверны / организации', `${F.venues.shops.length} / ${F.venues.taverns.length} / ${F.venues.orgs.length}` + (F.venues.other.length ? ` (+ банков и библиотек: ${F.venues.other.length})` : '')],
        ['Престол', v.seat ? `${v.seat.name}${v.seat.tag ? ` [${v.seat.tag}]` : ''}` : 'нет / не занят'],
        ['Экономика', p != null ? `${BAND_RU[band] ?? band ?? ''} (${p} из 100)` : '—'],
        ['Игроков в городе сейчас', onlineNow.length],
        ['Данные о владельцах', t ? ago(t.at) : 'нет'] ] });
    } else if (tab === 'guilds') {
      const rows = [];
      const order = [...F.guilds].sort((a, b) => (a[0] === 'own' ? -1 : b[0] === 'own' ? 1 : (b[1].homes + b[1].halls) - (a[1].homes + a[1].halls)));
      for (const [k, G] of order) {
        const name = k === 'own' ? `Вы и ваша гильдия${v.own?.tag ? ` [${v.own.tag}]` : ''}` : k === 'unknown' ? 'Гильдия неизвестна' : k === 'none' ? 'Без гильдии' : guildName(k.slice(2));
        const sw = k === 'unknown' ? GOLD : k === 'none' ? '#444' : v.colorOfKey(k);
        const n = G.homes + G.halls;
        rows.push([{ t: name, sw }, n, F.owned.length ? pct((n / F.owned.length) * 100) : '—', G.accounts.size, G.halls ? `да (${G.halls})` : '—', G.seat ? 'да' : '—']);
      }
      B.push({ grid: rows, head: ['Гильдия', 'Владений', 'Доля', 'Аккаунтов', 'Зал', 'Престол'] });
    } else if (tab === 'people') {
      const rows = [...F.accounts.values()].sort((a, b) => b.keys.length - a.keys.length || (a.name < b.name ? -1 : 1)).map((a) => {
        const rec = cache.players[norm(a.name)];
        const how = a.mine ? 'ваш аккаунт' : rec ? `${SOURCE_RU[rec.s] ?? rec.s}, ${ago(rec.at)}` : 'не встречали онлайн';
        return [{ t: a.name, c: a.mine ? WHITE : undefined }, a.keys.length, holderWords(a.holder), how];
      });
      B.push({ grid: rows, head: ['Аккаунт', 'Домов', 'Гильдия', 'Откуда известно'] });
      const on = onlineNow;
      B.push({ sec: `Сейчас в городе онлайн: ${on.length}` });
      if (on.length) B.push({ grid: on.map((o) => [o.name, o.gt ? guildName(o.gt) : '—', o.kind === 'party' ? 'ваша группа' : o.kind === 'stranger' ? 'враждебный' : '']), head: ['Игрок', 'Гильдия', ''] });
      else B.push({ p: 'Никого из других игроков в черте города не видно.' });
    } else if (tab === 'estate') {
      const byType = new Map();
      for (const i of F.homes) { const w = S[i].type === 1 ? 'Дома на продажу (вывеска)' : 'Жилые дома'; byType.set(w, (byType.get(w) ?? 0) + 1); }
      const entry = new Map(), rent = [], sale = [], votes = [];
      let painted = 0, deeds = 0;
      for (const i of F.owned) {
        const h = I[i].h;
        if (h.e) entry.set(h.e, (entry.get(h.e) ?? 0) + 1);
        if (h.r?.v > 0) rent.push([h.o, h.r.v, h.r.f]);
        if (h.op) sale.push([h.o, h.op]);
        if (h.sc) votes.push([h.o, h.sc]);
        if (h.lk) painted++;
        if (h.d) deeds++;
      }
      B.push({ kv: [
        ['Всего жилого фонда', F.homes.length],
        ...[...byType].map(([w, n]) => [`  ${w}`, n]),
        ['Занято', `${F.owned.length} (${pct(ownedPct)})`], ['Свободно', F.homes.length - F.owned.length],
        ['Залы гильдий игроков', F.halls.length ? F.halls.map((i) => `${I[i].h.hall.n}${I[i].h.hall.t ? ` [${I[i].h.hall.t}]` : ''}`).join(', ') : '—'],
        ['Перекрашены владельцами', painted], ['Дары короны (дома рыцарей)', deeds] ] });
      B.push({ sec: 'Кто может войти' });
      B.push({ kv: [...entry].map(([e, n]) => [ENTRY_RU[e] ?? e, n]) });
      B.push({ sec: `Комнаты в аренду: ${rent.reduce((a, r) => a + r[1], 0)}` });
      if (rent.length) B.push({ grid: rent.map(([o, n, f]) => [o, n, f != null ? `от ${f} зол./день` : '—']), head: ['Владелец', 'Свободно комнат', 'Цена'] });
      B.push({ sec: `Продаются владельцами: ${sale.length}` });
      if (sale.length) B.push({ grid: sale.sort((a, b) => a[1] - b[1]).map(([o, n]) => [o, `${n.toLocaleString('ru-RU')} зол.`]), head: ['Владелец', 'Цена'] });
      if (votes.length) {
        B.push({ sec: 'Оценки соседей (голоса за дом)' });
        B.push({ grid: votes.sort((a, b) => b[1] - a[1]).slice(0, 12).map(([o, n]) => [o, { t: n > 0 ? `+${n}` : String(n), c: n > 0 ? '#9be89b' : '#ff8a7a' }]), head: ['Владелец', 'Оценка'] });
      }
    } else if (tab === 'venues') {
      const shopRows = F.venues.shops.map((i) => {
        const s = S[i], pr = BUYS_RU[s.type] ? priceAt(v, s) : null;
        return [TYPE_NAME[s.type], tr(s.name) ?? '', `${s.quality ?? '?'} — ${qualityWord(s.quality ?? 0)}`,
          pr ? { t: `+${Math.round(pr.base)}%${pr.q === 20 ? '!!!' : ''}`, c: globalThis.__dfoMod?.pctColor?.(pr.base) } : '—',
          pr?.mine != null ? { t: `+${Math.round(pr.mine)}%`, c: GOLD } : '—'];
      }).sort((a, b) => (a[0] < b[0] ? -1 : 1));
      B.push({ sec: `Магазины: ${F.venues.shops.length}` });
      B.push({ grid: shopRows, head: ['Тип', 'Название', 'Качество', 'Скупка общая', 'Лично мне'] });
      B.push({ sec: `Таверны: ${F.venues.taverns.length}` });
      B.push({ grid: F.venues.taverns.map((i) => [tr(S[i].name) ?? 'Таверна', `${S[i].quality ?? '?'} — ${qualityWord(S[i].quality ?? 0)}`]), head: ['Название', 'Качество'] });
      B.push({ sec: `Организации: ${F.venues.orgs.length}` });
      B.push({ grid: F.venues.orgs.map((i) => [TYPE_NAME[S[i].type], tr(S[i].name) ?? '']), head: ['Тип', 'Название'] });
      if (F.venues.other.length) {
        B.push({ sec: `Банки и библиотеки: ${F.venues.other.length}` });
        B.push({ grid: F.venues.other.map((i) => [TYPE_NAME[S[i].type], tr(S[i].name) ?? '']), head: ['Тип', 'Название'] });
      }
    } else if (tab === 'economy') {
      const askAll = indexAt(v, 'Buy'), payAll = indexAt(v, 'Sell'), region = indexAt(v, 'Buy', { town: false });
      const askMe = indexAt(v, 'Buy', { everyone: false }), payMe = indexAt(v, 'Sell', { everyone: false });
      const x = (n) => (n == null ? '—' : `×${n.toFixed(2)} (${pct(n * 100)} нормы)`);
      const ex = (() => { try { return econ?.exchangeOf?.(g.mapId) ?? null; } catch { return null; } })();
      B.push({ kv: [
        ['Процветание', p != null ? `${p} из 100 — ${BAND_RU[band] ?? band ?? ''}` : '—'],
        ['Индекс цен региона', x(region)],
        ['Лавки просят (для всех)', x(askAll)], ['Лавки платят (для всех)', x(payAll)],
        ['Лавки просят (с вашей гильдией)', x(askMe)], ['Лавки платят (с вашей гильдией)', x(payMe)],
        ['Портовая биржа', ex ? `продаёт ×${ex.ask.toFixed(2)}, покупает ×${ex.pay.toFixed(2)}` : 'нет (не порт)'] ] });
      const best = F.venues.shops.map((i) => ({ s: S[i], pr: BUYS_RU[S[i].type] ? priceAt(v, S[i]) : null })).filter((o) => o.pr).sort((a, b) => b.pr.base - a.pr.base).slice(0, 5);
      if (best.length) {
        B.push({ sec: 'Где выгоднее всего продавать' });
        B.push({ grid: best.map(({ s, pr }) => [TYPE_NAME[s.type], tr(s.name) ?? '', { t: `+${Math.round(pr.base)}%`, c: globalThis.__dfoMod?.pctColor?.(pr.base) }, pr.mine != null ? { t: `+${Math.round(pr.mine)}%`, c: GOLD } : '—']), head: ['Тип', 'Название', 'Общая', 'Лично мне'] });
      }
      const tip = (() => { try { return econ?.tipAt?.(g.mapId) ?? null; } catch { return null; } })();
      if (tip?.lines?.length) { B.push({ sec: 'Как видит город игра' }); for (const l of tip.lines) B.push({ p: tr(l) }); }
    } else if (tab === 'seat') {
      if (!seatRaw?.holder) {
        B.push({ p: seatRaw ? `Престол «${seatRaw.name ?? g.name}» никем не занят.` : 'У города нет престола, и он не входит во владения хартии — гильдии им не правят.' });
      } else {
        const h = seatRaw.holder, b = seatRaw.battle;
        B.push({ kv: [
          ['Престол', `${seatRaw.name ?? '—'}${seatRaw.tier ? ` (${TIER_RU[seatRaw.tier] ?? seatRaw.tier})` : ''}`],
          ['Держит', `${h.guild?.name ?? '—'}${h.guild?.tag ? ` [${h.guild.tag}]` : ''}${v.seatK === 'own' ? ' — ваша гильдия' : ''}`],
          ['С недели', h.since ?? '—'], ['Настроение города (Standing)', h.standing != null ? `${h.standing} из 100` : '—'],
          ['Указ', h.edict ? EDICT_RU[h.edict] ?? h.edict : 'нет'], ['Десятина', h.tithe != null ? `${h.tithe}%` : '—'],
          ['Битва на этой неделе', b ? `${b.kind === 'revolt' ? 'восстание' : b.kind === 'tourney' ? 'турнир' : 'осада'}${b.guild?.name ? `: ${b.guild.name}` : ''}${b.against?.name ? ` против ${b.against.name}` : ''}` : 'нет'] ] });
      }
    }
    return { title: `${g.name} — сведения о городе`, tabs: TOWN_TABS, tab, blocks: B };
  }
  /** A BUILDING'S CARD: a home's owner and its door's words, a venue's trade, the palace's seat. */
  function buildingModel(v, key) {
    const g = v.g, i = g.byKey.get(key);
    if (i == null) return null;
    const s = g.sites[i], I = v.info[i], h = I.h, B = [];
    const area = g.area ? Math.round(g.area[i] * g.res * g.res) : 0;
    const nearCount = new Map();
    for (const j of s.near) { const H = v.info[j].holder; const k = H?.k === 'own' ? 'own' : H?.k === 'guild' ? `g:${H.tag}` : null; if (k) nearCount.set(k, (nearCount.get(k) ?? 0) + 1); }
    const nearWords = [...nearCount].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k === 'own' ? 'вы / ваша гильдия' : guildName(k.slice(2))}: ${n}`).join('; ') || 'нет';
    const plot = ['Участок', `≈${area} м², соседних участков: ${s.near.size}`];
    let title = `${TYPE_NAME[s.type] ?? 'Здание'}${s.name && !I.home ? `: ${tr(s.name)}` : ''}`;
    if (I.home) {
      if (!h) {
        B.push({ kv: [['Владелец', 'никто — дом свободен'], ['Тип', TYPE_NAME[s.type]], plot, ['Соседи-гильдии', nearWords]] });
      } else if (h.hall) {
        title = `Зал гильдии: ${h.hall.n}`;
        B.push({ kv: [['Гильдия', `${h.hall.n}${h.hall.t ? ` [${h.hall.t}]` : ''}`], ['Ваша', h.mem ? 'да' : 'нет'], ['Кто может войти', h.e ? ENTRY_RU[h.e] ?? h.e : '—'], plot, ['Соседи-гильдии', nearWords]] });
      } else {
        const rec = cache.players[norm(h.o)], all = v.perAccount.get(norm(h.o)) ?? 1;
        title = `Дом: ${h.o}`;
        B.push({ kv: [
          ['Аккаунт владельца', `${h.o}${h.m ? ' (ваш)' : ''}`],
          ['Владений в городе на аккаунте', all],
          ['Гильдия владельца', holderWords(I.holder)],
          ['Откуда известно', h.m ? 'ваш аккаунт' : I.holder?.k === 'own' && !rec ? 'ваша гильдия' : rec ? `${SOURCE_RU[rec.s] ?? rec.s}, ${ago(rec.at)}` : 'аккаунт не встречали онлайн'],
          ['Кто может войти', h.e ? ENTRY_RU[h.e] ?? h.e : '—'],
          ['Комнаты в аренду', h.r?.v > 0 ? `${h.r.v}${h.r.f != null ? `, от ${h.r.f} зол./день` : ''}` : 'нет'],
          ['Продаётся владельцем', h.op ? `за ${h.op.toLocaleString('ru-RU')} зол.` : 'нет'],
          ['Оценка соседей', h.sc ? (h.sc > 0 ? `+${h.sc}` : String(h.sc)) : '0'],
          ['Перекрашен владельцем', h.lk ? 'да' : 'нет'], ['Дар короны', h.d ? 'да' : 'нет'],
          ['Тип здания', TYPE_NAME[s.type]], plot, ['Соседи-гильдии', nearWords] ] });
      }
    } else if (I.group) {
      const rows = [['Тип', TYPE_NAME[s.type]], ['Название', tr(s.name) ?? '—']];
      if (I.group !== 'orgs') rows.push(['Качество', `${s.quality ?? '?'} из 20 — ${qualityWord(s.quality ?? 0)}`]);
      if (BUYS_RU[s.type]) {
        const pr = priceAt(v, s);
        rows.push(['Скупка общая', pr ? { t: `+${Math.round(pr.base)}%${pr.q === 20 ? '!!!' : ''}`, c: globalThis.__dfoMod?.pctColor?.(pr.base) } : '—']);
        rows.push(['Скупка лично мне', pr?.mine != null ? { t: `+${Math.round(pr.mine)}%`, c: GOLD } : '—']);
        rows.push(['Что скупает', BUYS_RU[s.type]]);
      } else if (I.group === 'shops') rows.push(['Скупка', 'ничего не скупает']);
      rows.push(['Влияние вокруг', nearWords], plot);
      B.push({ kv: rows });
    } else if (i === v.palace) {
      B.push({ kv: [['Название', tr(s.name) || '—'], ['Престол', v.seat ? `${v.seat.name}${v.seat.tag ? ` [${v.seat.tag}]` : ''}` : 'не занят'], plot] });
    } else B.push({ kv: [['Тип', TYPE_NAME[s.type] ?? `тип ${s.type}`], ['Название', tr(s.name) ?? '—'], plot] });
    return { title, tabs: [], blocks: B };
  }
  const clock = (at) => {
    const d = new Date(at), today = new Date().toDateString() === d.toDateString();
    const hm = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return today ? hm : `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} ${hm}`;
  };
  const when = (at) => (at ? `${clock(at)} (${ago(at)})` : 'ещё не было');
  /** THE TOWN'S DATA: when each part of it was last brought in, and the two ways to bring it in now. */
  function dataModel(v) {
    const g = v.g, t = cache.towns[g.mapId], m = g.meta;
    const last = Math.max(t?.at ?? 0, m?.at ?? 0, lastAsk);
    const B = [];
    B.push({ sys: last ? `Последнее обновление: ${when(last)}` : 'Данные ещё не обновлялись' });
    B.push({ kv: [
      ['Владельцы недвижимости', when(t?.at)],
      ['Список игроков онлайн', when(cache.asked.who)],
      ['Названия гильдий', when(cache.asked.arms)],
      ['Слепок города (здания, двери)', when(m?.at)],
      ['Дверей известно', `${g.sites.filter((s) => s.door).length} из ${g.sites.length}`] ] });
    if (inflight.has(g.mapId)) B.push({ sys: 'Идёт запрос к серверу…' });
    B.push({ acts: [{ id: 'refresh', t: 'Обновить базу' }, { id: 'regen', t: 'Перегенерировать город', warn: true }] });
    return { title: `${g.name} — данные`, tabs: [], blocks: B };
  }
  const ACTS = { refresh: () => refreshNow(), regen: () => regenerateNow() };
  function openWin(w) {
    win = w;
    if (w.kind === 'town') lastTab = w.tab ?? 'overview';
    winSig = '';
    renderWin(true);
  }
  function closeWin() {
    win = null;
    winSig = '';
    if (winEl) winEl.style.display = 'none';
  }
  /** The open window from the last frame's view - rebuilt only when what it says changed. */
  function renderWin(force) {
    if (!win || !winEl || !lastView) return;
    const m = win.kind === 'town' ? townModel(lastView, win.tab) : win.kind === 'data' ? dataModel(lastView) : buildingModel(lastView, win.key);
    if (!m) { closeWin(); return; }
    const sig = JSON.stringify(m);
    if (!force && sig === winSig) return;
    winSig = sig;
    winEl.style.display = '';
    setText(winTitle, m.title);
    winTabs.textContent = '';
    for (const [id, word] of m.tabs) {
      const b = el('button', id === m.tab ? 'on' : null, word);
      b.type = 'button';
      b.onclick = (e) => { e.preventDefault(); openWin({ kind: 'town', tab: id }); };
      winTabs.append(b);
    }
    const scroll = winBody.scrollTop;
    winBody.textContent = '';
    const cell = (td, c) => {
      if (c && typeof c === 'object') {
        if (c.sw) { const sw = el('span', 'sw'); sw.style.background = c.sw; td.append(sw); }
        td.append(document.createTextNode(c.t ?? ''));
        if (c.c) td.style.color = c.c;
      } else td.textContent = c == null ? '' : String(c);
    };
    for (const b of m.blocks) {
      if (b.sec) winBody.append(el('div', 'sec', b.sec));
      else if (b.p) winBody.append(el('div', 'p', b.p));
      else if (b.sys) winBody.append(el('div', 'sys', b.sys));
      else if (b.acts) {
        const row = el('div', 'acts');
        for (const a of b.acts) {
          const bt = el('button', a.warn ? 'warn' : null, a.t);
          bt.type = 'button';
          bt.onclick = (e) => { e.preventDefault(); bt.disabled = true; try { ACTS[a.id]?.(); } finally { setTimeout(() => renderWin(true), 300); } };
          row.append(bt);
        }
        winBody.append(row);
      }
      else if (b.kv) {
        const t = el('table', 'kv');
        for (const [k, val] of b.kv) { const r = el('tr'); r.append(el('th', null, k)); const td = el('td'); cell(td, val); r.append(td); t.append(r); }
        winBody.append(t);
      } else if (b.grid) {
        const t = el('table', 'grid');
        const hr = el('tr'); for (const hd of b.head) hr.append(el('th', null, hd)); t.append(hr);
        for (const row of b.grid) { const r = el('tr'); for (const c of row) { const td = el('td'); cell(td, c); r.append(td); } t.append(r); }
        winBody.append(t);
      }
    }
    winBody.scrollTop = scroll;
  }
  /** A click on the map: a door's point, a venue's mark, or the plot under it - that building's card. */
  function clickAt(x, y) {
    const v = lastView;
    if (!v) return;
    let best = null, bd = Infinity;
    for (const d of v.dots) { const dd = Math.hypot(d.x - x, d.y - y); if (dd < 10 && dd < bd) { bd = dd; best = d.i; } }
    if (best == null) for (const d of v.venues) { const dd = Math.hypot(d.x - x, d.y - y); if (dd < 14 && dd < bd) { bd = dd; best = d.i; } }
    if (best == null && v.mesh) best = tileAt(v, x, y);
    if (best != null && best >= 0) openWin({ kind: 'building', key: v.g.sites[best].key });
  }
  /** The plot under a screen point: the mesh's triangle it lies in (the last drawn frame's points, none behind the eye),
   *  the point's place in the town's metres (its weights corrected for the perspective), that grid point's plot - or -1. */
  function tileAt(v, x, y) {
    const m = v.mesh, g = v.g;
    if (!m || !g.owner) return -1;
    const W1 = m.mx + 1;
    const hit = (p, q, r, up, vp, uq, vq, ur, vr) => {
      if (!(m.sw[p] > 0 && m.sw[q] > 0 && m.sw[r] > 0)) return null;
      const x0 = m.sx[p], y0 = m.sy[p], x1 = m.sx[q], y1 = m.sy[q], x2 = m.sx[r], y2 = m.sy[r];
      const den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
      if (Math.abs(den) < 1e-9) return null;
      let l0 = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) / den, l1 = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) / den, l2 = 1 - l0 - l1;
      if (l0 < -1e-6 || l1 < -1e-6 || l2 < -1e-6) return null;
      l0 /= m.sw[p]; l1 /= m.sw[q]; l2 /= m.sw[r];
      const sum = l0 + l1 + l2;
      l0 /= sum; l1 /= sum; l2 /= sum;
      return [(l0 * up + l1 * uq + l2 * ur) / m.mx * m.W, (l0 * vp + l1 * vq + l2 * vr) / m.mz * m.H];
    };
    for (let iz = 0; iz < m.mz; iz++) for (let ix = 0; ix < m.mx; ix++) {
      const a = iz * W1 + ix, b = a + 1, c = a + W1 + 1, d = a + W1;
      const at = hit(a, b, c, ix, iz, ix + 1, iz, ix + 1, iz + 1) ?? hit(a, c, d, ix, iz, ix + 1, iz + 1, ix, iz + 1);
      if (!at) continue;
      const tx = Math.floor(at[0] / g.res), tz = Math.floor(at[1] / g.res);
      return tx >= 0 && tz >= 0 && tx < g.nx && tz < g.nz ? g.owner[tz * g.nx + tx] : -1;
    }
    return -1;
  }

  // ─── each Overworld frame ───────────────────────────────────────────────────────────────────────────────────────
  // WHAT A FRAME COSTS. Outside the map: the built towns' blocks (is the player in one), nothing drawn - the map's two
  // canvases are hidden, so nothing it ever drew can stay on the screen. In the map: the plots are painted ONCE into a
  // picture of the town (mapCv, the town's metres to its pixels) whenever what they show changes, and laid on the ground
  // through a coarse mesh of points the game's own projection places (WebGL - or, without it, the mesh's triangles drawn
  // as images); the labels are pictures made once each; and a frame whose camera, town and switches are the last
  // frame's draws nothing at all.
  let frameNo = 0, drawSig = '', lastLegend = '', shown = false;
  const showCanvases = (on) => {
    if (shown === on) return;
    shown = on;
    for (const c of [cv, glcv]) if (c) c.style.display = on ? '' : 'none';
    if (!on) {
      try { ctx?.setTransform(1, 0, 0, 1, 0, 0); ctx?.clearRect(0, 0, cv.width, cv.height); } catch { /* hidden anyway */ }
      try { if (gl) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); } } catch { /* hidden anyway */ }
      drawSig = ''; lastLegend = '';
    }
  };
  globalThis.__dfoFrame = (project, feetOf) => {
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - (lastTick || now)) / 1000));
    lastTick = now;
    lastFrame = now;
    frameNo++;
    modeT = null;
    if (!mode) showCanvases(false);   // first of all: outside the map nothing of it is on the screen
    if (!ensureDom() || typeof project !== 'function') return;
    if (!mode) showCanvases(false);
    const feet = typeof feetOf === 'function' ? feetOf() : null;
    const around = feet ? townsAround(feet) : [];
    for (const T of around) T.feet = feet;
    // the way in: only inside a town
    const inTown = townIn(around);
    if (btn && btn.disabled !== !inTown) btn.disabled = !inTown;
    lastAround = around;
    if (enterWanted) { enterWanted = false; if (inTown && !mode) enterMode(inTown, around); }
    if (!mode) return;
    if (!document.body.classList.contains('dfo-citymap')) document.body.classList.add('dfo-citymap');   // kept, whatever else sets the page's classes
    const T = around.find((o) => o.b.mapId === mode.mapId && o.p === mode.p) ?? null;
    if (!T || !plotsOf(T.g)) { exitMode(); return; }   // the town is no longer built round the player
    modeT = T;
    // halls and temples unnamed in the snapshot (the game's factions not read yet when it was made): named once they are
    if (frameNo % 60 === 0 && T.g.meta && !T.g.meta.named && nameBag()) refreshMeta(T.g, true);
    showCanvases(true);
    // the camera: the projection's slope at the focus, and the keys' move
    const fx = T.ox + mode.fx, fz = T.oz + mode.fz, fy = globalThis.__dfoCamFeet?.()?.[1] ?? T.oy;
    const a = project([fx, fy, fz]), bx = project([fx + 1, fy, fz]), bz = project([fx, fy, fz + 1]);
    if (a?.front && bx?.front && bz?.front) {
      const j00 = bx.x - a.x, j01 = bz.x - a.x, j10 = bx.y - a.y, j11 = bz.y - a.y, det = j00 * j11 - j01 * j10;
      if (Math.abs(det) > 1e-9) inv = [j11 / det, -j01 / det, -j10 / det, j00 / det];
    }
    let kx = 0, ky = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) ky -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) ky += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) kx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) kx += 1;
    if (kx || ky) { const sp = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1600 : 700) * dt / Math.hypot(kx, ky); panScreen(kx * sp, ky * sp, 1); }
    // Q / E turn the camera round its point, R / F tilt it
    const ty = (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0), tt = (keys.has('KeyF') ? 1 : 0) - (keys.has('KeyR') ? 1 : 0);
    if (ty) turn.yaw += ty * 1.6 * dt;
    if (tt) turn.tilt += tt * 0.9 * dt;
    const dpr = Math.max(1, Math.min(3, globalThis.devicePixelRatio || 1));
    const cw = rootSize?.w || innerWidth, ch = rootSize?.h || innerHeight;
    try { timed('frame', () => draw(project, T, cw, ch, dpr)); } catch (e) {
      if (!globalThis.__dfoTownErr) { globalThis.__dfoTownErr = e; console.warn('[dfo-mod] town map:', e); }
    }
    if (win && frameNo % 20 === 0) renderWin(false);
  };

  // the mesh the map's picture is laid on: (mx + 1) x (mz + 1) points over the town's rectangle, heights kept
  function meshOf(g) {
    if (g.mesh) return g.mesh;
    const W_ = g.bw * SIDE, H_ = g.bh * SIDE;
    const mx = Math.max(6, Math.min(36, g.bw * 4)), mz = Math.max(6, Math.min(36, g.bh * 4));
    const n = (mx + 1) * (mz + 1);
    g.mesh = { mx, mz, W: W_, H: H_, hgt: new Float32Array(n).fill(NaN), miss: new Uint8Array(n), sx: new Float32Array(n), sy: new Float32Array(n), sw: new Float32Array(n), ok: false, gen: 0 };
    return g.mesh;
  }
  /** Each paint's key: a fill's colour, a pattern's own number. */
  const tileIds = new WeakMap();
  let tileNo = 0;
  const fillKey = (p) => (!p ? '' : p.fill ?? (p.tile ? (tileIds.get(p.tile) ?? tileIds.set(p.tile, `t${++tileNo}`).get(p.tile)) : '?'));
  /** THE PICTURE OF THE PLOTS: each plot's area painted in the town's own metres, `k` pixels a metre, the patterns turned
   *  and sized so that on the screen they stand upright at their own size (`turn`: the screen's pixel right and down, in
   *  the town's metres). */
  let mapCv = null, mapCtx = null, mapK = 1, mapGen = 0;
  const kOf = (g) => Math.min(4, 3072 / (Math.max(g.bw, g.bh) * SIDE));   // the picture's pixels a metre
  function paintMap(g, paint, turn) {
    const W_ = g.bw * SIDE, H_ = g.bh * SIDE;
    mapK = kOf(g);
    const w = Math.max(1, Math.round(W_ * mapK)), h = Math.max(1, Math.round(H_ * mapK));
    if (!mapCv) { mapCv = document.createElement('canvas'); mapCtx = mapCv.getContext('2d', { willReadFrequently: true }); }   // in memory: handed to WebGL as it is, no GPU read back
    if (mapCv.width !== w || mapCv.height !== h) { mapCv.width = w; mapCv.height = h; }
    const c = mapCtx, k = mapK;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, w, h);
    c.setTransform(k, 0, 0, k, 0, 0);   // from here on, metres
    const pats = new Map();
    const fillOf = (p) => {
      if (p.fill) return p.fill;
      let pat = pats.get(p.tile);
      if (!pat) {
        pat = c.createPattern(p.tile, 'repeat');
        if (pat?.setTransform && typeof DOMMatrix === 'function' && turn) pat.setTransform(new DOMMatrix([turn[0], turn[1], turn[2], turn[3], 0, 0]));
        pats.set(p.tile, pat);
      }
      return pat;
    };
    const byPaint = new Map();
    for (let i = 0; i < g.sites.length; i++) {
      const p = paint[i];
      if (!p) continue;
      const key = fillKey(p);
      (byPaint.get(key) ?? byPaint.set(key, { p, list: [] }).get(key)).list.push(i);
    }
    for (const { p, list } of byPaint.values()) {
      c.fillStyle = fillOf(p);
      for (const i of list) c.fill(g.paths[i], 'evenodd');
    }
    // the plots' borders, where two meet (drawn whole: a hidden plot's neighbour still has its edge)
    c.strokeStyle = 'rgba(0,0,0,0.55)';
    c.lineWidth = Math.max(0.3, 1.1 / k);
    c.lineJoin = 'miter';
    c.stroke(g.borders);
    c.setTransform(1, 0, 0, 1, 0, 0);
    mapGen++;
  }
  // ─── WebGL: the picture on the mesh (one draw) ──────────────────────────────────────────────────────────────────
  let glcv = null, gl = null, glProg = null, glBuf = null, glUv = null, glIdx = null, glTex = null, glTexGen = -1, glMesh = null, glFailed = false;
  function glInit() {
    if (gl || glFailed) return !!gl;
    try {
      if (globalThis.__dfoTownNoGL) throw new Error('WebGL off');
      gl = glcv.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: true });
      if (!gl) throw new Error('no webgl');
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      glProg = gl.createProgram();
      gl.attachShader(glProg, sh(gl.VERTEX_SHADER, 'attribute vec3 p;attribute vec2 uv;uniform vec2 sz;varying vec2 v;void main(){v=uv;gl_Position=vec4((p.x/sz.x*2.0-1.0)*p.z,(1.0-p.y/sz.y*2.0)*p.z,0.0,p.z);}'));
      gl.attachShader(glProg, sh(gl.FRAGMENT_SHADER, 'precision mediump float;varying vec2 v;uniform sampler2D t;void main(){gl_FragColor=texture2D(t,v);}'));
      gl.linkProgram(glProg);
      if (!gl.getProgramParameter(glProg, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(glProg));
      glBuf = gl.createBuffer(); glUv = gl.createBuffer(); glIdx = gl.createBuffer(); glTex = gl.createTexture();
      glTexGen = -1; glMesh = null;
      if (!glcv.dataset.dfoWatch) {   // a context the driver took back: made again on the next frame drawn
        glcv.dataset.dfoWatch = '1';
        glcv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); gl = null; drawSig = ''; });
        glcv.addEventListener('webglcontextrestored', () => { gl = null; drawSig = ''; });
      }
      return true;
    } catch (e) {
      console.warn('[dfo-mod] town map: no WebGL, drawing the map in 2D', e);
      gl = null; glFailed = true;
      return false;
    }
  }
  function glDraw(m, cw, ch, dpr) {
    const W2 = Math.round(cw * dpr), H2 = Math.round(ch * dpr);
    if (glcv.width !== W2 || glcv.height !== H2) { glcv.width = W2; glcv.height = H2; }
    gl.viewport(0, 0, W2, H2);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(glProg);
    if (glTexGen !== mapGen) {
      gl.bindTexture(gl.TEXTURE_2D, glTex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mapCv);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      glTexGen = mapGen;
    }
    if (glMesh !== m) {   // the mesh's texture places and its triangles, once a mesh
      const uv = new Float32Array((m.mx + 1) * (m.mz + 1) * 2), idx = new Uint16Array(m.mx * m.mz * 6);
      for (let iz = 0; iz <= m.mz; iz++) for (let ix = 0; ix <= m.mx; ix++) { const k = iz * (m.mx + 1) + ix; uv[k * 2] = ix / m.mx; uv[k * 2 + 1] = iz / m.mz; }
      let q = 0;
      for (let iz = 0; iz < m.mz; iz++) for (let ix = 0; ix < m.mx; ix++) {
        const a = iz * (m.mx + 1) + ix, b = a + 1, c = a + m.mx + 2, d = a + m.mx + 1;
        idx.set([a, b, c, a, c, d], q); q += 6;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, glUv); gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glIdx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      glMesh = m;
    }
    // each point where the screen has it and the depth it was divided by: the card clips what lies behind the eye itself,
    // and the picture is laid on in perspective
    const pos = new Float32Array(m.sx.length * 3);
    for (let k = 0; k < m.sx.length; k++) { pos[k * 3] = m.sx[k] * dpr; pos[k * 3 + 1] = m.sy[k] * dpr; pos[k * 3 + 2] = m.sw[k]; }
    gl.bindBuffer(gl.ARRAY_BUFFER, glBuf); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
    const ap = gl.getAttribLocation(glProg, 'p'), au = gl.getAttribLocation(glProg, 'uv');
    gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, glUv);
    gl.enableVertexAttribArray(au); gl.vertexAttribPointer(au, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(gl.getUniformLocation(glProg, 'sz'), W2, H2);
    gl.uniform1i(gl.getUniformLocation(glProg, 't'), 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, glTex);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glIdx);
    gl.drawElements(gl.TRIANGLES, m.mx * m.mz * 6, gl.UNSIGNED_SHORT, 0);
  }
  /** Without WebGL: each mesh triangle drawn as the picture under an affine map (a little wider, so no seam shows). */
  function draw2dMap(m) {
    const iw = mapCv.width, ih = mapCv.height;
    const tri = (a, b, c) => {
      if (!(a[4] > 0 && b[4] > 0 && c[4] > 0)) return;   // behind the eye: left out
      const [ax, ay, au, av] = a, [bx, by, bu, bv] = b, [cx2, cy2, cu, cv2] = c;
      const den = (bu - au) * (cv2 - av) - (cu - au) * (bv - av);
      if (Math.abs(den) < 1e-9) return;
      const m11 = ((bx - ax) * (cv2 - av) - (cx2 - ax) * (bv - av)) / den, m12 = ((by - ay) * (cv2 - av) - (cy2 - ay) * (bv - av)) / den;
      const m21 = ((cx2 - ax) * (bu - au) - (bx - ax) * (cu - au)) / den, m22 = ((cy2 - ay) * (bu - au) - (by - ay) * (cu - au)) / den;
      const ex = ax - m11 * au - m21 * av, ey = ay - m12 * au - m22 * av;
      const mxc = (ax + bx + cx2) / 3, myc = (ay + by + cy2) / 3, grow = (x, y) => { const d = Math.hypot(x - mxc, y - myc) || 1; return [x + (x - mxc) / d * 0.6, y + (y - myc) / d * 0.6]; };
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(...grow(ax, ay)); ctx.lineTo(...grow(bx, by)); ctx.lineTo(...grow(cx2, cy2)); ctx.closePath();
      ctx.clip();
      ctx.transform(m11, m12, m21, m22, ex, ey);
      ctx.drawImage(mapCv, 0, 0);
      ctx.restore();
    };
    // no more than 12 x 12 cells of the mesh: each triangle is a clip and an image
    const st = Math.max(1, Math.ceil(Math.max(m.mx, m.mz) / 12));
    const k = (x, z) => { x = Math.min(x, m.mx); z = Math.min(z, m.mz); const q = z * (m.mx + 1) + x; return [m.sx[q], m.sy[q], (x / m.mx) * iw, (z / m.mz) * ih, m.sw[q]]; };
    for (let iz = 0; iz < m.mz; iz += st) for (let ix = 0; ix < m.mx; ix += st) {
      const A = k(ix, iz), B = k(ix + st, iz), C = k(ix + st, iz + st), D = k(ix, iz + st);
      tri(A, B, C); tri(A, C, D);
    }
  }
  // ─── labels as pictures, made once each ─────────────────────────────────────────────────────────────────────────
  const sprites = new Map();
  function spriteOf(lines, size, dpr) {
    const key = `${size}|${dpr}|${lines.map((l) => `${l.c}\u0001${l.t}`).join('\u0002')}`;
    let s = sprites.get(key);
    if (s) return s;
    if (sprites.size > 1500) sprites.clear();
    const font = `${size}px 'Pixelify Sans', 'Barlow Semi Condensed', system-ui, sans-serif`;
    const c = document.createElement('canvas'), g = c.getContext('2d');
    g.font = font;
    const lh = size + 3, w = Math.ceil(Math.max(...lines.map((l) => g.measureText(l.t).width)) + 8), h = lh * lines.length + 5;
    c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr);
    g.scale(dpr, dpr);
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.lineJoin = 'round';
    lines.forEach((l, k) => {
      const y = h - 2 - (lines.length - 1 - k) * lh;
      g.lineWidth = size > 13 ? 4 : 3; g.strokeStyle = 'rgba(5,6,8,0.92)'; g.strokeText(l.t, w / 2, y);
      g.fillStyle = l.c; g.fillText(l.t, w / 2, y);
    });
    s = { c, w, h };
    sprites.set(key, s);
    return s;
  }

  /** The map of town `T` this frame: who holds each plot, in which colour and pattern; the key's sections. */
  function draw(project, T, cw, ch, dpr) {
    const g = T.g;
    doorsOf(g);
    const town = cache.towns[g.mapId] ?? null;
    const own = ownGuild();
    const seat = seatHolder(g.mapId);
    const ground = W()?.ground;
    const heightAt = (x, z) => { try { const gy = ground?.(x, z); return Number.isFinite(gy) ? gy : NaN; } catch { return NaN; } };

    // who holds each site
    const S = g.sites, info = new Array(S.length);
    const perAccount = new Map();
    for (let i = 0; i < S.length; i++) {
      const s = S[i], h = town?.homes?.[s.key] ?? null;
      const home = isHomeType(s.type, s.faction) || !!h;
      info[i] = { home, h, holder: h ? holderOf(h, own) : null, group: groupOf(s.type) };
      if (h && !h.hall) perAccount.set(norm(h.o), (perAccount.get(norm(h.o)) ?? 0) + 1);
    }
    const palace = S.findIndex((s) => s.type === PALACE);
    const seatK = seat ? (own?.tag && seat.tag === own.tag ? 'own' : seat.tag ? `g:${seat.tag}` : null) : null;
    const keyOf = (i) => {   // the influence each plot counts for: 'own', 'g:TAG' or null
      const I = info[i];
      if (i === palace && seatK) return seatK;
      if (!I.holder) return null;
      return I.holder.k === 'own' ? 'own' : I.holder.k === 'guild' ? `g:${I.holder.tag}` : null;
    };
    const weight = new Map();
    for (let i = 0; i < S.length; i++) { const k = keyOf(i); if (k && k !== 'own') weight.set(k, (weight.get(k) ?? 0) + 1); }
    const guildHue = huesMemo([...weight.keys()].sort((a, b) => weight.get(b) - weight.get(a) || (a < b ? -1 : 1)), []);
    const colorOfKey = (k) => (k === 'own' ? WHITE : guildHue.get(k) ?? FREE);
    const mineAccounts = new Set(Object.values(town?.homes ?? {}).filter((h) => h.m).map((h) => norm(h.o)));
    const many = [...perAccount].filter(([k, n]) => n > 1 && !mineAccounts.has(k)).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([k]) => k);
    const accountHue = huesMemo(many, [0, 150, 218, 28]);   // never the single home's red, nor the town map's own three
    const RED = stripeTile('rgba(95,12,12,0.9)', 'rgba(200,45,45,0.55)', 4);

    // each plot's paint and the key's row it answers to
    const paint = new Array(S.length), cat = new Array(S.length);
    const count = new Map();
    const tally = (k) => count.set(k, (count.get(k) ?? 0) + 1);
    for (let i = 0; i < S.length; i++) {
      const I = info[i];
      let p = null, c = null;
      if (state.influence) {
        if (i === palace && seatK) { p = { fill: alpha(colorOfKey(seatK), 0.55) }; c = 'seat'; }
        else if (I.group) {
          const t = new Map();
          for (const j of S[i].near) { const k = keyOf(j); if (k) t.set(k, (t.get(k) ?? 0) + 1); }
          let best = null, bestN = 0, tie = false;
          for (const [k, n] of t) { if (n > bestN) { best = k; bestN = n; tie = false; } else if (n === bestN) tie = true; }
          p = { tile: stripeTile(best && !tie ? colorOfKey(best) : FREE, null, 4.5) }; c = 'venues';
        } else if (I.home && town) {
          const H = I.holder;
          if (!I.h) { p = { fill: alpha(FREE, 0.45) }; c = 'free'; }
          else if (H.k === 'own') { p = { fill: alpha(WHITE, 0.6) }; c = 'own'; }
          else if (H.k === 'guild') { p = { fill: alpha(colorOfKey(`g:${H.tag}`), 0.6) }; c = `g:${H.tag}`; }
          else if (H.k === 'none') { p = { tile: hatchTile() }; c = 'none'; }
          else { p = { tile: askTile() }; c = 'unknown'; }
        }
      } else if (I.group) { p = { fill: alpha(GROUP_COLOR[I.group], 0.5) }; c = I.group; }
      else if (I.home && town) {
        if (!I.h) { p = { fill: alpha(FREE, 0.45) }; c = 'free'; }
        else if (I.holder?.k === 'own' && I.h.m) { p = { fill: alpha(WHITE, 0.6) }; c = 'own'; }
        else if (!I.h.hall && accountHue.has(norm(I.h.o))) { p = { fill: alpha(accountHue.get(norm(I.h.o)), 0.6) }; c = `a:${norm(I.h.o)}`; }
        else { p = { tile: RED }; c = 'single'; }
      }
      if (c) tally(c);
      paint[i] = c && hidden.has(c) ? null : p;
      cat[i] = c;
    }

    // the mesh on the screen: its points' heights sampled once and kept
    const m = meshOf(g);
    if (frameNo % 90 === 0) for (let k = 0; k < m.miss.length; k++) if (m.miss[k]) { m.miss[k] = 0; m.hgt[k] = NaN; }   // the ground not there yet: asked again
    let ok = true, sampled = 0;
    for (let iz = 0; iz <= m.mz && ok; iz++) for (let ix = 0; ix <= m.mx; ix++) {
      const k = iz * (m.mx + 1) + ix, lx = (ix / m.mx) * m.W, lz = (iz / m.mz) * m.H;
      if (Number.isNaN(m.hgt[k]) && sampled < 400) {
        sampled++;
        const y = heightAt(T.ox + lx, T.oz + lz);
        m.hgt[k] = Number.isFinite(y) ? y - T.oy : 0;
        m.miss[k] = Number.isFinite(y) ? 0 : 1;
        if (!m.miss[k]) m.gen++;
      }
      // the projection's own depth (the clip w it divided by: behind the eye, negative and the point mirrored) - so the
      // ground under and behind the camera is cut where the eye's plane cuts it, never the whole map dropped
      const q = project([T.ox + lx, T.oy + (Number.isNaN(m.hgt[k]) ? 0 : m.hgt[k]), T.oz + lz]);
      const w = Number.isFinite(q?.depth) ? q.depth : q?.front ? 1 : NaN;
      if (!q || !Number.isFinite(w) || !Number.isFinite(q.x) || !Number.isFinite(q.y)) { ok = false; break; }
      m.sx[k] = q.x; m.sy[k] = q.y; m.sw[k] = w;
    }
    m.ok = ok;
    // the screen's pixel right and down in the town's metres - the patterns stand upright on the screen at their own size
    // (kept in steps of 3 degrees and a quarter of an octave, so a pan does not paint the picture again)
    let turn = null;
    if (inv) {
      const step = (x, z) => {
        const ang = Math.round(Math.atan2(z, x) / (Math.PI / 60)) * (Math.PI / 60);
        const len = 2 ** (Math.round(Math.log2(Math.max(1e-4, Math.hypot(x, z))) * 4) / 4);
        return [Math.cos(ang) * len, Math.sin(ang) * len];
      };
      turn = [...step(inv[0], inv[2]), ...step(inv[1], inv[3])].map((x) => Math.round(x * 1000) / 1000);
    }
    const mapSig = `${g.mapId}|${turn}|${paint.map(fillKey).join(',')}`;
    if (mapSig !== g.mapSig) { timed('paint', () => paintMap(g, paint, turn)); g.mapSig = mapSig; }

    // the doors and their owners' words (the nearest the focus drawn last, on top)
    const dots = [];
    const doorList = [];
    if (state.doors && town) {
      for (let i = 0; i < S.length; i++) if (info[i].home && !(cat[i] && hidden.has(cat[i]))) doorList.push(i);
      doorList.sort((a2, b2) => Math.hypot(S[b2].x - mode.fx, S[b2].z - mode.fz) - Math.hypot(S[a2].x - mode.fx, S[a2].z - mode.fz));
      if (doorList.length > 400) doorList.splice(0, doorList.length - 400);
    }
    const labelFrom = Math.max(0, doorList.length - 250);   // words over the 250 nearest the focus
    // a frame like the last draws nothing: the same camera (four corners of the town on the screen), the same switches,
    // the same picture
    const corner = (lx, lz) => { const q = project([T.ox + lx, T.oy, T.oz + lz]); return q ? `${Math.round(q.x * 4)},${Math.round(q.y * 4)},${Math.round((q.depth ?? 0) * 8)}` : 'x'; };
    const dataSig = `${g.mapSig}|${state.doors}|${state.influence}|${[...hidden].join(',')}|${town?.at}|${g.doorsAt}|${seat?.name}|${seat?.tag}`;
    const sig = `${corner(0, 0)}|${corner(m.W, 0)}|${corner(0, m.H)}|${corner(m.W, m.H)}|${cw}x${ch}@${dpr}|${m.gen}|${dataSig}`;
    const same = sig === drawSig && lastView?.g === g;
    drawSig = sig;

    // what this frame shows, for a click and the windows: the marks' points (a venue's glyph stands 7 m over its ground)
    let venues = same ? lastView.venues : null;
    if (!venues) {
      venues = [];
      for (let i = 0; i < S.length; i++) {
        if (!info[i].group && i !== palace) continue;
        const s = S[i], x = T.ox + s.x, z = T.oz + s.z;
        if (!Number.isFinite(s.gy)) { const y = heightAt(x, z); if (Number.isFinite(y)) s.gy = y; }
        const q = project([x, (Number.isFinite(s.gy) ? s.gy : T.oy) + 7, z]);
        if (q?.front) venues.push({ x: q.x, y: q.y, i });
      }
    }
    lastView = { T, g, town, own, seat, seatK, palace, info, cat, count, perAccount, weight, colorOfKey, accountHue, many,
      mesh: m.ok ? m : null, dots: same ? lastView.dots : dots, venues, at: Date.now() };

    if (!same) {
      // the plots on the ground
      const W2 = Math.round(cw * dpr), H2 = Math.round(ch * dpr);
      if (cv.width !== W2 || cv.height !== H2) { cv.width = W2; cv.height = H2; }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (m.ok && timed('glInit', glInit)) timed('gl', () => glDraw(m, cw, ch, dpr));
      else { if (gl) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); } if (m.ok) draw2dMap(m); }
      // the land outside the plots, dimmed; the town's edge along them (its points every few metres, their heights kept)
      g.edge ??= g.loops.map((loop) => {
        const pts = [];
        for (let k = 0; k < loop.length; k++) {
          const a2 = loop[k], b2 = loop[(k + 1) % loop.length];
          const n = Math.max(1, Math.ceil(Math.hypot(b2[0] - a2[0], b2[1] - a2[1]) / 6));
          for (let s2 = 0; s2 < n; s2++) pts.push([a2[0] + ((b2[0] - a2[0]) * s2) / n, a2[1] + ((b2[1] - a2[1]) * s2) / n, NaN]);
        }
        return pts;
      });
      // each ring in the projection's own terms (x w, y w, w) and cut at the eye's plane - what lies behind the camera
      // is left out, not the ring
      const E = 2;
      const rings = [], lines = [];
      for (const loop of g.edge) {
        const H = [];
        for (const v of loop) {
          if (Number.isNaN(v[2])) { const y = heightAt(T.ox + v[0], T.oz + v[1]); v[2] = Number.isFinite(y) ? y - T.oy : 0; }
          const q = project([T.ox + v[0], T.oy + v[2], T.oz + v[1]]);
          const w = Number.isFinite(q?.depth) ? q.depth : q?.front ? 1 : NaN;
          if (!q || !Number.isFinite(w)) { H.length = 0; break; }
          H.push([q.x * w, q.y * w, w]);
        }
        if (H.length < 3) continue;
        const cut = (a2, b2) => { const t = (E - a2[2]) / (b2[2] - a2[2]); return [(a2[0] + (b2[0] - a2[0]) * t) / E, (a2[1] + (b2[1] - a2[1]) * t) / E]; };
        const dv = (a2) => [a2[0] / a2[2], a2[1] / a2[2]];
        const ring = [];
        let run = null;
        for (let k = 0; k < H.length; k++) {
          const a2 = H[k], b2 = H[(k + 1) % H.length], ain = a2[2] >= E, bin = b2[2] >= E;
          if (ain) { ring.push(dv(a2)); (run ??= [dv(a2)]); }
          if (ain && bin) run.push(dv(b2));
          else if (ain !== bin) {
            const c2 = cut(a2, b2);
            ring.push(c2);
            if (ain) { run.push(c2); lines.push(run); run = null; } else run = [c2];
          }
        }
        if (run && run.length > 1) lines.push(run);
        if (ring.length > 2) rings.push(ring);
      }
      ctx.beginPath();
      ctx.rect(0, 0, cw, ch);
      for (const r of rings) { ctx.moveTo(r[0][0], r[0][1]); for (const q of r) ctx.lineTo(q[0], q[1]); ctx.closePath(); }
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fill('evenodd');
      ctx.beginPath();
      for (const l of lines) { ctx.moveTo(l[0][0], l[0][1]); for (const q of l) ctx.lineTo(q[0], q[1]); }
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineWidth = 8; ctx.stroke();
      ctx.strokeStyle = '#f6e7b0'; ctx.lineWidth = 3.5; ctx.stroke();
      // the doors: points batched by colour, then the labels, as pictures
      const byColor = new Map(), labels = [];
      for (let di = 0; di < doorList.length; di++) {
        const i = doorList[di], s = S[i], I = info[i];
        const lx = s.door?.[0] ?? s.x, lz = s.door?.[1] ?? s.z;
        if (s.dyAt !== s.door) { const y = heightAt(T.ox + lx, T.oz + lz); if (Number.isFinite(y)) { s.dy = y; s.dyAt = s.door; } }
        const at = project([T.ox + lx, Number.isFinite(s.dy) ? s.dy : T.oy, T.oz + lz]);
        if (!at?.front) continue;
        const dot = !I.h ? FREE : I.holder?.k === 'own' ? WHITE : state.influence
          ? (I.holder?.k === 'guild' ? colorOfKey(`g:${I.holder.tag}`) : I.holder?.k === 'none' ? '#5a5a5a' : GOLD)
          : (accountHue.get(norm(I.h.o)) ?? '#d83a3a');
        (byColor.get(dot) ?? byColor.set(dot, []).get(dot)).push(at.x, at.y, I.h ? 4.5 : 3);
        dots.push({ x: at.x, y: at.y, i });
        if (!I.h || di < labelFrom) continue;
        const n = perAccount.get(norm(I.h.o)) ?? 1;
        labels.push([at.x, at.y - 7, I.h.hall
          ? [{ t: `Зал гильдии: ${I.h.hall.n}${I.h.hall.t ? ` [${I.h.hall.t}]` : ''}`, c: '#f4f1e8' }]
          : [{ t: `Аккаунт: ${I.h.o}`, c: '#f4f1e8' }, { t: `(${n} ${plural(n)} в городе на аккаунте)`, c: GOLD }]]);
      }
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#000';
      for (const [color, pts] of byColor) {
        ctx.beginPath();
        for (let k = 0; k < pts.length; k += 3) { ctx.moveTo(pts[k] + pts[k + 2], pts[k + 1]); ctx.arc(pts[k], pts[k + 1], pts[k + 2], 0, Math.PI * 2); }
        ctx.fillStyle = color; ctx.fill(); ctx.stroke();
      }
      timed('labels', () => { for (const [x, y, lines] of labels) { const sp = spriteOf(lines, 11, dpr); ctx.drawImage(sp.c, x - sp.w / 2, y - sp.h, sp.w, sp.h); } });
      if (state.influence && seat && palace >= 0 && !hidden.has('seat')) {
        const s = S[palace], lx = s.door?.[0] ?? s.x, lz = s.door?.[1] ?? s.z, y = heightAt(T.ox + lx, T.oz + lz);
        const at = project([T.ox + lx, Number.isFinite(y) ? y : T.oy, T.oz + lz]);
        if (at?.front) { const sp = spriteOf([{ t: `Город под контролем ${seat.name}`, c: seatK === 'own' ? WHITE : GOLD }], 16, dpr); ctx.drawImage(sp.c, at.x - sp.w / 2, at.y - 14 - sp.h, sp.w, sp.h); }
      }
    }

    // the title and the key
    setText(titleEl, g.name);
    setText(subEl, seat ? `Город под контролем ${seat.name}${seat.tag ? ` [${seat.tag}]` : ''}` : '');
    // the key: again when what it counts changed, and now and then (the owners' age)
    const legendSig = `${dataSig}|${inflight.has(g.mapId)}`;
    if (legendSig === lastLegend && frameNo % 30 !== 0) return;
    lastLegend = legendSig;
    const n = (k) => count.get(k) ?? 0;
    const sections = [];
    if (state.influence) {
      const rows = [];
      if (seat) rows.push({ key: 'seat', color: colorOfKey(seatK ?? 'none'), text: `Престол: ${seat.name}${seat.tag ? ` [${seat.tag}]` : ''}` });
      rows.push({ key: 'own', color: WHITE, text: `Вы${own?.tag ? ` и ваша гильдия [${own.tag}]` : ''}: ${n('own')}` });
      for (const [k] of [...weight].sort((a2, b2) => b2[1] - a2[1])) {
        const tag = k.slice(2), name = cache.guilds[tag]?.n;
        rows.push({ key: k, color: colorOfKey(k), text: `[${tag}]${name ? ` ${name}` : ''}: ${n(k)}` });
      }
      rows.push({ key: 'unknown', tile: tileUrl(askTile()), size: '14px 14px', color: 'transparent', text: `Гильдия неизвестна: ${n('unknown')}` });
      rows.push({ key: 'none', tile: tileUrl(hatchTile()), color: '#444', text: `Без гильдии: ${n('none')}` });
      rows.push({ key: 'free', color: FREE, text: `Свободно: ${n('free')}` });
      sections.push({ title: 'Влияние гильдий', rows });
      sections.push({ title: 'Заведения', rows: [{ key: 'venues', tile: tileUrl(stripeTile(FREE, null, 4.5)), color: '#777', text: `Таверны, магазины, организации: ${n('venues')}` }] });
    } else {
      const rows = [{ key: 'own', color: WHITE, text: `Ваше: ${n('own')}` }];
      for (const k of many) {
        const name = Object.values(town?.homes ?? {}).find((h) => norm(h.o) === k)?.o ?? k;
        rows.push({ key: `a:${k}`, color: accountHue.get(k), text: `${name}: ${perAccount.get(k)} ${plural(perAccount.get(k))}` });
      }
      rows.push({ key: 'single', tile: tileUrl(RED), color: '#c83030', text: `Один дом на аккаунте: ${n('single')}` });
      rows.push({ key: 'free', color: FREE, text: `Свободно: ${n('free')}` });
      sections.push({ title: 'Недвижимость', rows });
      sections.push({ title: 'Заведения', rows: [
        { key: 'taverns', color: GROUP_COLOR.taverns, text: `Таверны: ${n('taverns')}` },
        { key: 'shops', color: GROUP_COLOR.shops, text: `Магазины: ${n('shops')}` },
        { key: 'orgs', color: GROUP_COLOR.orgs, text: `Организации: ${n('orgs')}` }] });
    }
    paintKey(sections);
  }
  const plural = (n) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? 'владение' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'владения' : 'владений'; };

  globalThis.__dfoTown = { version: '1.9.0', state, cache, get mode() { return mode; }, enter: () => { enterWanted = true; }, exit: exitMode, geoOf, holderOf,
    openTown: (tab) => openWin({ kind: 'town', tab: tab ?? 'overview' }), openBuilding: (key) => openWin({ kind: 'building', key }), clickAt, get win() { return win; }, get gl() { return !!gl; }, perf, get view() { return lastView; }, refreshNow, regenerateNow };
})();
