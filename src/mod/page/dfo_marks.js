// DFO Mod - the towns' taverns, shops and organizations on the Overworld (the page side of transforms.cjs's MARKS).
//
// The game hands three things through the hooks: __dfoWorld (the town pixels built round me, the world's state, the
// ground), __dfoDisc (a town's book of discovered buildings - the town map's own record of what the player has been
// to, or been shown), and each frame the Overworld's own host to __dfoMarks. A mark is `dfo <group>`: its own look,
// its own switch in the filters, drawn here by __dfoGlyph.
//
// WHAT IS MARKED: only a building the player discovered (the town map names the same ones), only in a town built
// round the player, only within markRadiusM of the feet and never more than maxMarks, the nearest first; its name
// only within nameRadiusM. Every town at once, at any distance, is never drawn.
(() => {
  'use strict';
  if (globalThis.__dfoMarks) return;
  const CFG = Object.assign({ marks: true, onlyVisited: true, markRadiusM: 1200, nameRadiusM: 300, maxMarks: 60 },
    globalThis.__DFO_MOD_CFG__?.marks ?? {});

  // The town map's quarters (ui/town/townQuarters.js, DFU ExteriorAutomap): building type -> group.
  const GROUP = { 0: 'shops', 2: 'shops', 3: 'shops', 5: 'shops', 6: 'shops', 7: 'shops', 8: 'shops', 9: 'shops', 10: 'shops', 12: 'shops', 13: 'shops',
    11: 'orgs', 14: 'orgs', 15: 'taverns' };
  // The game's own colours (CLASSIC_ARGB: tavern #307555, shop #1855be, temple #c37d45), the same hue made light enough
  // to read on the dark land: hue kept, lightness 60% (the shops' blue lighter still - 75%, it read too dark).
  const COLOR = Object.freeze({ taverns: '#61d19d', shops: '#80b0ff', orgs: '#d19361' });
  /** A building with no name of its own (the "all buildings" mode) is named by its kind. */
  const KIND = { 0: 'Алхимик', 2: 'Бронник', 3: 'Банк', 5: 'Книжная лавка', 6: 'Портной', 7: 'Мебельщик', 8: 'Ювелир', 9: 'Лавка',
    10: 'Библиотека', 12: 'Ломбард', 13: 'Оружейник', 11: 'Гильдия', 14: 'Храм', 15: 'Таверна' };
  /** The kind as the label's bracket says it: [Книжный]Название. */
  const TYPE_WORD = { 0: 'Алхимик', 2: 'Бронник', 3: 'Банк', 5: 'Книжный', 6: 'Одежда', 7: 'Мебель', 8: 'Ювелир', 9: 'Общий',
    10: 'Библиотека', 12: 'Ломбард', 13: 'Оружейник', 11: 'Гильдия', 14: 'Храм', 15: 'Таверна' };

  // ─── what a shop pays: the game's own law, through the PRICES hooks ───────────────────────────────────────────────
  /** The shops that buy anything (systems/shopStock.js SHOP_BUYS_GROUPS): the bank and the library buy nothing. */
  const BUYS = new Set([0, 2, 5, 6, 7, 8, 9, 12, 13]);
  /** A piece of this base value is priced through the game's law; its sale over it is the shop's share in percent. */
  const PROBE = 100000;
  const GOLD = '#f2c443';
  /**
   * What this shop pays for a sale, as a share of the piece's base value, in percent: { base, mine, q } or null.
   * `base` - THE SAME FOR EVERY PLAYER: the counter's index for a buyer of no guild (the world's region price, the
   *   town's Prosperity, the seat's Market Day), haggled by a seller of no skill (calculateTradePrice's own defaults,
   *   Mercantile 0, Personality 50).
   * `mine` - this player's own: the index with their guild's discount at a seat town, haggled with their live
   *   Mercantile and Personality - what the trade window offers them for a piece of their own in full condition.
   * Neither reads the piece itself (its condition, a Daedric piece's share, a counter's piece sold back).
   */
  function priceOf(shop) {
    const adjOf = globalThis.__dfoShopAdj, costOf = globalThis.__dfoCost, tradeOf = globalThis.__dfoTradePrice;
    if (!adjOf || !costOf || !tradeOf || !BUYS.has(shop.buildingType) || !Number.isFinite(shop.quality)) return null;
    try {
      const q = shop.quality;
      const at = (adj, skills) => (tradeOf(costOf(PROBE, q, adj, -1), q, skills, true) / PROBE) * 100;
      let base;
      globalThis.__dfoNoGuild = true;
      try { base = at(adjOf(shop, 'Sell'), undefined); } finally { globalThis.__dfoNoGuild = false; }
      const skills = globalThis.__dfoSkills?.();
      const mine = skills ? at(adjOf(shop, 'Sell'), skills) : null;
      return Number.isFinite(base) ? { base, mine: Number.isFinite(mine) ? mine : null, q } : null;
    } catch (err) {
      lastErr = err;
      return null;
    }
  }
  /** The base figure's colour: bright red at 0% and under, through orange and yellow, to bright green at 40% and over. */
  const PCT_GREEN = 40;
  function pctColor(p) {
    const t = Math.max(0, Math.min(1, p / PCT_GREEN));
    return `hsl(${Math.round(120 * t)},100%,${Math.round(57 - 7 * t)}%)`;
  }

  const GS = 0.025, RMB = 4096, SIDE = RMB * GS;   // MeshReader.GlobalScale, BlocksFile.RMBDimension
  const LIFT = 7;                                   // m over the ground: over most roofs
  const KEY0 = 1 << 24;                             // makeBuildingKey's stand-in for key 0
  const REREAD = 45;                                // frames between reads of a town's book and of the ground

  const _t = [0, 0, 0];
  let frame = 0;
  const towns = new WeakMap();   // a pixel entry -> { blocks, w, h, at, list, ground: Map }

  /** makeBuildingKey (talkTopics.js) undone: its block cell and its record. */
  function decodeKey(k) {
    if (k === KEY0) return { x: 0, y: 0, i: 0 };
    return { x: (k >> 16) & 0xff, y: (k >> 8) & 0xff, i: k & 0xff };
  }
  /** A building's place in its town, from its block's own subrecord (buildingSummaries.js buildingPosition). */
  function localOf(info, x, y, i) {
    const sub = info.blocks.get(`${x},${y}`)?.dfBlock?.rmbBlock?.subRecords?.[i];
    if (!sub) return null;
    return [x * SIDE + (sub.xPos ?? 0) * GS, y * SIDE + (RMB - (sub.zPos ?? 0)) * GS];
  }
  function townOf(p) {
    let info = towns.get(p);
    if (!info || info.src !== p.locBlocks) {
      const blocks = new Map();
      let w = 1, h = 1;
      for (const b of p.locBlocks) { blocks.set(`${b.x},${b.y}`, b); w = Math.max(w, (b.x ?? 0) + 1); h = Math.max(h, (b.y ?? 0) + 1); }
      info = { src: p.locBlocks, blocks, w, h, at: -Infinity, list: [], ground: new Map() };
      towns.set(p, info);
    }
    return info;
  }
  /** The game's bag of names for halls, temples and palaces (townTalk nameOpts), or null before its factions are read. */
  function nameBag() {
    try {
      const o = globalThis.__dfoNameOpts?.();
      if (!o) return null;
      const out = {};
      for (const k of ['factionName', 'templeName', 'shownFactionName', 'shownTempleName', 'palaceName']) if (typeof o[k] === 'function') out[k] = o[k];
      return Object.keys(out).length ? out : null;
    } catch { return null; }
  }
  /** The town's book: the key a town's discoveries are filed under (discovery.js townBookId) - by its map id past the Bay. */
  function recordsOf(loc, info) {
    const disc = globalThis.__dfoDisc;
    if (!disc || !loc?.name) return [];
    const id = (loc.mapTableData?.mapId ?? 0) >>> 0;
    info.book = `${loc.regionIndex}:${loc.name}#${id}`;
    const a = disc(info.book);
    if (a?.length) return a;
    info.book = `${loc.regionIndex}:${loc.name}`;
    return disc(info.book) ?? [];
  }
  /** A discovered record's shown name (discovery.js shownBuildingName: the player's own name for it first). */
  const shownName = (rec, fallback) => rec?.customUserDisplayName || rec?.displayName || fallback;
  /**
   * The marked buildings of a town: [{ key, group, type, name, lx, lz }] - THE TOWN MAP'S OWN SET where the game handed
   * its sources (__dfoWorld.summaries/locIndex/bookOf: buildingSummaries over the town's blocks, the discovered book by
   * townBookOf - ui/town/townSheet.js names exactly these), else each discovered record's key undone into its block.
   */
  function buildingsOf(p, info, host) {
    if (frame - info.at < REREAD) return info.list;
    info.at = frame;
    const W = globalThis.__dfoWorld, disc = globalThis.__dfoDisc;
    let loc = null, recs = [];
    if (W.locIndex && W.bookOf) {
      loc = W.locIndex()?.get(`${p.px},${p.py}`) ?? null;
      info.book = loc ? W.bookOf(loc) : null;
      recs = (info.book && disc?.(info.book)) || [];
    } else {
      loc = host.tvPlaceSummary?.(p.px, p.py, true)?.loc ?? null;
      recs = recordsOf(loc, info);
    }
    info.town = loc?.name ?? null;
    const found = new Map(recs.map((r) => [r.buildingKey, r]));
    const list = [];
    // the counter as the game keys it when the player walks in (scenes/world.js: the door's building record, its
    // region, its town's map id)
    const townMapId = (loc?.mapTableData?.mapId ?? 0) >>> 0;
    const price = (type, quality, key) => (loc && GROUP[type] === 'shops'
      ? priceOf({ buildingType: type, quality, buildingKey: key, regionIndex: loc.regionIndex ?? 0, townMapId }) : null);
    if (loc && W.summaries) {
      info.path = 'summaries';
      // a guild's hall, a temple and a palace named as the game names them (townTalk's bag: its factions' names) - made
      // again once that bag is there, if it was not the first time
      const bag = nameBag();
      if (!info.sums || (!info.named && bag)) {
        info.sums = W.summaries(loc.exterior?.buildings ?? [], p.locBlocks, { locationName: loc.name,
          regionName: W.maps?.()?.getRegionName?.(loc.regionIndex) ?? '', locationIndex: loc.locationIndex ?? 0, ...(bag ?? {}) }) ?? [];
        info.named = !!bag;
      }
      for (const s of info.sums) {
        const group = GROUP[s.buildingType];
        if (!group) continue;
        const rec = found.get(s.buildingKey);
        if (CFG.onlyVisited && !rec) continue;
        const pos = s.position ?? [0, 0, 0];
        list.push({ key: `dfo:${p.px},${p.py}:${s.buildingKey}`, group, type: s.buildingType, name: shownName(rec, s.name || KIND[s.buildingType]),
          lx: (s.blockX ?? 0) * SIDE + pos[0], lz: (s.blockY ?? 0) * SIDE + pos[2], price: price(s.buildingType, s.quality, s.buildingKey) });
      }
      const keys = new Set(info.sums.map((s) => s.buildingKey));
      info.unplaced = recs.filter((r) => GROUP[r.buildingType] && !keys.has(r.buildingKey)).map((r) => shownName(r, KIND[r.buildingType]));
    } else {
      info.path = 'decode';
      const add = (k, type, rec) => {
        const group = GROUP[type];
        if (!group) return;
        const { x, y, i } = decodeKey(k);
        const at = localOf(info, x, y, i);
        if (!at) { (info.unplaced ??= []).push(shownName(rec, KIND[type])); return; }
        const data = info.blocks.get(`${x},${y}`)?.dfBlock?.rmbBlock?.fldHeader?.buildingDataList?.[i];
        list.push({ key: `dfo:${p.px},${p.py}:${k}`, group, type, name: shownName(rec, KIND[type]), lx: at[0], lz: at[1],
          price: price(type, data?.quality, k) });
      };
      info.unplaced = [];
      if (CFG.onlyVisited) for (const r of recs) add(r.buildingKey, r.buildingType, r);
      else {
        for (const b of p.locBlocks) {
          const data = b.dfBlock?.rmbBlock?.fldHeader?.buildingDataList ?? [];
          for (let i = 0; i < data.length; i++) {
            const k = ((b.x ?? 0) << 16) + ((b.y ?? 0) << 8) + i || KEY0;
            add(k, data[i]?.buildingType, found.get(k) ?? null);
          }
        }
      }
    }
    info.recs = recs.length;
    info.recsOurs = recs.filter((r) => GROUP[r.buildingType]).length;
    info.list = list;
    return list;
  }

  /** The Overworld's frame asks: our marks, scene points, the nearest first. */
  // ─── the report: what the marks were made of, written by the hook to <userData>/dfo-mod-marks.txt ─────────────────
  let reportSent = '', reportAt = 0, lastErr = null;
  function report(towns, made, W) {
    const now = Date.now();
    if (now - reportAt < 3000) return;
    reportAt = now;
    const body = JSON.stringify({ v: globalThis.__dfoMod?.version, cfg: CFG, sources: { summaries: !!W?.summaries, locIndex: !!W?.locIndex, bookOf: !!W?.bookOf, disc: !!globalThis.__dfoDisc,
      shopAdj: !!globalThis.__dfoShopAdj, cost: !!globalThis.__dfoCost, trade: !!globalThis.__dfoTradePrice, skills: !!globalThis.__dfoSkills },
      made, towns, error: lastErr ? String(lastErr?.stack ?? lastErr).slice(0, 600) : null });
    if (body === reportSent) return;
    reportSent = body;
    try { fetch(new URL('/dfo-mod/report', location.href), { method: 'POST', body }).catch(() => {}); } catch { /* no report, no harm */ }
  }

  /** The Overworld's frame asks: our marks, scene points, the nearest first. */
  globalThis.__dfoMarks = (host) => {
    const W = globalThis.__dfoWorld;
    const towns = [];
    let out = [];
    try {
      if (!CFG.marks || !W?.built || !W.state?.pixelTranslation || (W.mode && W.mode() !== 'exterior')) return [];
      // the detailed town map (dfo_town.js) moves a camera instead of the player: the marks are measured from its point
      const cam = globalThis.__dfoCamFeet?.();
      const feet = cam ?? (host?.walkMode ? host.player?.pos : host?.cam?.pos);
      const nameR = cam ? Math.max(CFG.nameRadiusM, 450) : CFG.nameRadiusM;
      if (!feet) return [];
      frame++;
      const R = CFG.markRadiusM, near = [], noting = Date.now() - reportAt >= 3000;   // the report's rows: only when one is due
      for (const p of W.built.values()) {
        if (!p?.locBlocks?.length || !p.locOrigin) continue;
        const info = townOf(p);
        const t = W.state.pixelTranslation(p.px, p.py, _t);
        const ox = t[0] + p.locOrigin[0], oz = t[2] + p.locOrigin[2];
        const span = Math.hypot(info.w, info.h) * SIDE / 2;
        const far = Math.hypot(ox + info.w * SIDE / 2 - feet[0], oz + info.h * SIDE / 2 - feet[2]);
        if (far > R + span) continue;   // the whole town is out of reach
        const list = buildingsOf(p, info, host);
        const row = { town: info.town, book: info.book, path: info.path, centreM: Math.round(far), discovered: info.recs, discoveredOurs: info.recsOurs,
          candidates: list.length, marked: 0, beyond: 0, noGround: 0, names: [], unplaced: info.unplaced ?? [] };
        for (const b of list) {
          const x = ox + b.lx, z = oz + b.lz, d = Math.hypot(x - feet[0], z - feet[2]);
          if (d > R) { row.beyond++; continue; }
          let g = info.ground.get(b.key);
          if (!g || g.x !== x || g.z !== z || frame - g.f >= REREAD) { g = { x, z, f: frame, y: W.ground(x, z) }; info.ground.set(b.key, g); }
          if (!Number.isFinite(g.y)) { row.noGround++; continue; }
          row.marked++;
          const pr = b.price;
          if (noting) row.names.push({ g: b.group[0], type: b.type, name: b.name, m: Math.round(d), q: pr?.q ?? null,
            base: pr ? Math.round(pr.base * 10) / 10 : null, mine: pr?.mine != null ? Math.round(pr.mine * 10) / 10 : null });
          // The Overworld copies a mark's known fields only (scenes/travelView.js drawHud: key, at, label, sub, kind,
          // color...) - so what the glyph needs rides in them: `dfo <group> <type> [<quality> <base%> <mine%>]` and the
          // name in `sub`. The HUD draws a mark's `sub` only under its `label`, which stays empty: the name is drawn here.
          const named = d <= nameR;
          const tail = named && pr ? ` ${pr.q} ${Math.round(pr.base)} ${pr.mine != null ? Math.round(pr.mine) : '-'}` : '';
          near.push({ d, m: { key: b.key, at: [x, g.y + LIFT, z], label: '', sub: named ? b.name : '',
            kind: `dfo ${b.group} ${b.type}${tail}`, color: COLOR[b.group] } });
        }
        towns.push(row);
      }
      near.sort((a, b) => a.d - b.d);
      out = near.slice(0, CFG.maxMarks).map((n) => n.m).reverse();   // the farthest drawn first: the nearest label lies on top
    } catch (err) {
      lastErr = err;
      if (!globalThis.__dfoMarksErr) { globalThis.__dfoMarksErr = err; console.warn('[dfo-mod] marks:', err); }
      out = [];
    }
    report(towns, out.length, W);
    return out;
  };

  // ─── the glyphs ────────────────────────────────────────────────────────────────────────────────────────────────────
  const fillStroke = (g) => { g.fill(); g.stroke(); };
  const dark = (g, fn) => { const f = g.fillStyle; g.fillStyle = '#000'; fn(); g.fillStyle = f; };
  /** Each kind's picture, about (x, y), within a 13 px square: the tavern's tankard, a guild's banner, a temple's front,
   *  and a shop by its trade. */
  const PICTURE = {
    15(g, x, y) {   // tankard, its foam, its handle
      g.beginPath(); g.rect(x - 4.5, y - 3, 7, 8.5); fillStroke(g);
      const f = g.fillStyle;
      g.beginPath(); g.arc(x + 3.5, y + 1.2, 2.6, -Math.PI / 2, Math.PI / 2); g.lineWidth = 3.4; g.stroke(); g.lineWidth = 1.6; g.strokeStyle = f; g.stroke();
      g.strokeStyle = '#000'; g.lineWidth = 1;
      g.beginPath(); g.arc(x - 3, y - 3.5, 2, 0, Math.PI * 2); g.arc(x + 0.5, y - 4.3, 2.3, 0, Math.PI * 2); g.fillStyle = '#f4efe2'; fillStroke(g); g.fillStyle = f;
      dark(g, () => { g.fillRect(x - 2.6, y - 0.5, 1, 4.5); g.fillRect(x - 0.3, y - 0.5, 1, 4.5); });
    },
    11(g, x, y) {   // banner on its pole, its tail cut
      g.beginPath(); g.moveTo(x - 4.5, y - 6.5); g.lineTo(x - 4.5, y + 6.5); g.lineWidth = 3; g.stroke(); g.lineWidth = 1;
      g.beginPath(); g.moveTo(x - 4, y - 6); g.lineTo(x + 5.5, y - 6); g.lineTo(x + 5.5, y + 3); g.lineTo(x + 0.8, y + 0.6); g.lineTo(x - 4, y + 3); g.closePath(); fillStroke(g);
      dark(g, () => { g.fillRect(x - 0.5, y - 4.5, 1.2, 4.5); g.fillRect(x - 2, y - 3, 4.2, 1.2); });
    },
    14(g, x, y) {   // temple: pediment, columns, step
      g.beginPath(); g.moveTo(x - 6.5, y - 2.5); g.lineTo(x, y - 6.5); g.lineTo(x + 6.5, y - 2.5); g.closePath(); fillStroke(g);
      for (const cx of [-4.5, -0.75, 3]) { g.beginPath(); g.rect(x + cx, y - 2, 1.5, 6); fillStroke(g); }
      g.beginPath(); g.rect(x - 6.5, y + 4, 13, 2.2); fillStroke(g);
    },
    0(g, x, y) {   // alchemist: round flask
      g.beginPath(); g.arc(x, y + 2, 4.6, 0, Math.PI * 2); fillStroke(g);
      g.beginPath(); g.rect(x - 1.6, y - 6, 3.2, 4); fillStroke(g);
      dark(g, () => g.fillRect(x - 3, y + 1.5, 6, 1));
    },
    2(g, x, y) {   // armorer: helm with its slit
      g.beginPath(); g.moveTo(x - 5, y + 5.5); g.lineTo(x - 5, y - 0.5); g.arc(x, y - 0.5, 5, Math.PI, 0); g.lineTo(x + 5, y + 5.5); g.closePath(); fillStroke(g);
      dark(g, () => { g.fillRect(x - 3.6, y, 7.2, 1.3); g.fillRect(x - 0.5, y + 1.3, 1, 3.5); });
    },
    3(g, x, y) {   // bank: two coins
      for (const [dx, dy] of [[-1.6, 1.4], [1.6, -1.4]]) { g.beginPath(); g.arc(x + dx, y + dy, 4, 0, Math.PI * 2); fillStroke(g); }
      dark(g, () => g.fillRect(x + 1.1, y - 3, 1, 3.2));
    },
    5(g, x, y) {   // bookseller: a closed book
      g.beginPath(); g.rect(x - 4.5, y - 5.5, 9, 11); fillStroke(g);
      dark(g, () => { g.fillRect(x - 4.5, y - 5.5, 1.6, 11); g.fillRect(x - 1.5, y - 3, 4.5, 1); });
    },
    6(g, x, y) {   // clothing: a tunic
      g.beginPath(); g.moveTo(x - 2, y - 5.5); g.lineTo(x - 6, y - 3); g.lineTo(x - 4.5, y); g.lineTo(x - 3, y - 1); g.lineTo(x - 3, y + 5.5);
      g.lineTo(x + 3, y + 5.5); g.lineTo(x + 3, y - 1); g.lineTo(x + 4.5, y); g.lineTo(x + 6, y - 3); g.lineTo(x + 2, y - 5.5); g.quadraticCurveTo(x, y - 3.5, x - 2, y - 5.5); g.closePath(); fillStroke(g);
    },
    7(g, x, y) {   // furniture: a chair
      g.beginPath(); g.rect(x - 4, y - 6, 2, 12); fillStroke(g);
      g.beginPath(); g.rect(x - 4, y - 0.5, 8.5, 2); fillStroke(g);
      g.beginPath(); g.rect(x + 2.5, y + 1.5, 2, 4.5); fillStroke(g);
    },
    8(g, x, y) {   // gems: a cut stone
      g.beginPath(); g.moveTo(x - 5.5, y - 2); g.lineTo(x - 3, y - 5); g.lineTo(x + 3, y - 5); g.lineTo(x + 5.5, y - 2); g.lineTo(x, y + 5.5); g.closePath(); fillStroke(g);
      g.beginPath(); g.moveTo(x - 5.5, y - 2); g.lineTo(x + 5.5, y - 2); g.moveTo(x, y + 5.5); g.lineTo(x - 1.8, y - 2); g.moveTo(x, y + 5.5); g.lineTo(x + 1.8, y - 2); g.stroke();
    },
    9(g, x, y) {   // general store: a sack tied at the neck
      g.beginPath(); g.arc(x, y + 1.8, 4.6, 0, Math.PI * 2); fillStroke(g);
      g.beginPath(); g.moveTo(x - 1.5, y - 2.4); g.lineTo(x - 3.6, y - 6); g.lineTo(x + 3.6, y - 6); g.lineTo(x + 1.5, y - 2.4); g.closePath(); fillStroke(g);
      dark(g, () => g.fillRect(x - 2.2, y - 3, 4.4, 1.2));
    },
    10(g, x, y) {   // library: an open book
      g.beginPath(); g.moveTo(x, y - 3); g.quadraticCurveTo(x - 3, y - 5.5, x - 6.5, y - 4); g.lineTo(x - 6.5, y + 4.5); g.quadraticCurveTo(x - 3, y + 3, x, y + 5);
      g.quadraticCurveTo(x + 3, y + 3, x + 6.5, y + 4.5); g.lineTo(x + 6.5, y - 4); g.quadraticCurveTo(x + 3, y - 5.5, x, y - 3); g.closePath(); fillStroke(g);
      g.beginPath(); g.moveTo(x, y - 3); g.lineTo(x, y + 5); g.stroke();
    },
    12(g, x, y) {   // pawnbroker: three balls
      for (const [dx, dy] of [[-3.3, -2.3], [3.3, -2.3], [0, 3.2]]) { g.beginPath(); g.arc(x + dx, y + dy, 2.8, 0, Math.PI * 2); fillStroke(g); }
    },
    13(g, x, y) {   // weaponsmith: a sword - its blade, its guard, its grip
      g.beginPath(); g.moveTo(x + 6.5, y - 6.5); g.lineTo(x + 5.8, y - 3.4); g.lineTo(x - 1.4, y + 3.8); g.lineTo(x - 3.8, y + 1.4); g.lineTo(x + 3.4, y - 5.8); g.closePath(); fillStroke(g);
      const f = g.fillStyle;
      g.beginPath(); g.moveTo(x - 5.2, y - 0.2); g.lineTo(x + 0.2, y + 5.2); g.lineWidth = 4; g.strokeStyle = '#000'; g.stroke(); g.lineWidth = 2; g.strokeStyle = f; g.stroke();
      g.beginPath(); g.moveTo(x - 2.6, y + 2.6); g.lineTo(x - 5.6, y + 5.6); g.lineWidth = 2.4; g.strokeStyle = '#000'; g.stroke();
      g.lineWidth = 1;
    },
  };
  const LABEL_FONT = "11px 'Pixelify Sans', 'Barlow Semi Condensed', system-ui, sans-serif";
  /** A mark's label, in lines of coloured pieces:
   *    [Книжный]Название                    - the kind and the name, in the group's colour
   *    +30% Общее!!!; +35% лично мне        - a shop that buys: the base figure in its own colour (pctColor), "!!!" in
   *                                           white for a counter of the best quality (20), the player's own in gold */
  function labelOf(name, type, color, w) {
    const kind = TYPE_WORD[type];
    const lines = [[{ t: `${kind ? `[${kind}]` : ''}${name === KIND[type] ? '' : name}`, c: color }]];
    const q = Number(w[3]), base = Number(w[4]), mine = Number(w[5]);
    if (w.length >= 5 && Number.isFinite(base)) {
      const price = [{ t: `+${base}% Общее`, c: pctColor(base) }];
      if (q === 20) price.push({ t: '!!!', c: '#ffffff' });
      if (Number.isFinite(mine)) price.push({ t: '; ', c: '#d8d8d8' }, { t: `+${mine}% лично мне`, c: GOLD });
      lines.push(price);
    }
    return lines;
  }
  /** A label as a picture, made once (its lines, its colours, the canvas's scale): a frame lays pictures down instead
   *  of measuring and outlining each word again. */
  const labelPics = new Map();
  function labelPic(key, lines, scale) {
    const k = `${scale}|${key}`;
    let pic = labelPics.get(k);
    if (pic) return pic;
    if (labelPics.size > 600) labelPics.clear();
    const c = document.createElement('canvas'), g = c.getContext('2d');
    g.font = LABEL_FONT;
    for (const segs of lines) for (const s of segs) s.w = g.measureText(s.t).width;
    const w = Math.ceil(Math.max(...lines.map((segs) => segs.reduce((a, s) => a + s.w, 0)))) + 6, h = lines.length * 13 + 4;
    c.width = Math.max(1, Math.ceil(w * scale)); c.height = Math.ceil(h * scale);
    g.scale(scale, scale);
    g.font = LABEL_FONT; g.textAlign = 'left'; g.textBaseline = 'top'; g.lineJoin = 'round';
    lines.forEach((segs, n) => {
      const left = (w - segs.reduce((a, s) => a + s.w, 0)) / 2, ty = 2 + n * 13;
      g.lineWidth = 3; g.strokeStyle = 'rgba(5,6,8,0.9)';
      let at = left;
      for (const s of segs) { g.strokeText(s.t, at, ty); at += s.w; }   // every outline first, so none crosses a letter
      at = left;
      for (const s of segs) { g.fillStyle = s.c; g.fillText(s.t, at, ty); at += s.w; }
    });
    pic = { c, w, h };
    labelPics.set(k, pic);
    return pic;
  }
  /** A `dfo` mark at (x, y) on the Overworld's canvas: its picture in its group's colour, its label under it when near.
   *  Labels may lie over each other: none is left out. */
  globalThis.__dfoGlyph = (g, x, y, m) => {
    const w = String(m?.kind ?? '').split(' ');
    if (w[0] !== 'dfo') return;
    const d = { group: w[1], type: Number(w[2]), name: typeof m.sub === 'string' ? m.sub : '' };
    const color = COLOR[d.group] ?? COLOR.shops;
    g.save();
    g.fillStyle = color; g.strokeStyle = '#000'; g.lineWidth = 1; g.lineJoin = 'round'; g.lineCap = 'round';
    (PICTURE[d.type] ?? PICTURE[d.group === 'taverns' ? 15 : d.group === 'orgs' ? 11 : 9])(g, x, y);
    if (d.name) {
      let scale = 1;
      try { const t = g.getTransform(); scale = Math.round(Math.max(1, Math.min(4, Math.hypot(t.a, t.b))) * 4) / 4; } catch { /* 1:1 */ }
      const pic = labelPic(`${m.kind}|${d.name}|${color}`, labelOf(d.name, d.type, color, w), scale);
      g.drawImage(pic.c, x - pic.w / 2, y + 7, pic.w, pic.h);
    }
    g.restore();
  };

  // the three switches' dots, in their marks' colours
  const css = `.tview-fdot-taverns{background:${COLOR.taverns}}.tview-fdot-shops{background:${COLOR.shops}}.tview-fdot-orgs{background:${COLOR.orgs}}`;
  const putStyle = () => { const s = document.createElement('style'); s.id = 'dfo-mod-style'; s.textContent = css; document.head.appendChild(s); };
  if (document.head) putStyle(); else document.addEventListener('DOMContentLoaded', putStyle, { once: true });
  globalThis.__dfoMod = { version: '1.9.0', cfg: CFG, colors: COLOR, priceOf, pctColor };
})();
