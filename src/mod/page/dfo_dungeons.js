(function (root) {
  'use strict';
  if (root.__dfoDungeons || root.__DFO_MOD_CFG__?.dungeons?.enabled === false) return;
  // The mod's own words, in the install's language (page/dfo_ui_text.js; English without the translation).
  const T = (key, params) => (root.__dfoUi ? root.__dfoUi.t(key, params) : key);
  const M = root.__dfoDungeonModel, doc = root.document, stack = [], modelCache = new WeakMap(), sprites = new Map(), distances = new Map(), markHeadings = new Map();
  let host = null, notes = {}, current = null, loadStarted = false, readError = '', cacheError = '', lastObservation = '', lastSaved = 0, retryObservationAt = 0;
  let questMarks = [];
  const tr = text => { try { return root.__translate?.(text) || text; } catch { return text; } };
  const safe = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };
  const el = (tag, cls, text) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const btn = (text, action) => { const n = el('button', '', text); n.type = 'button'; n.onclick = action; return n; };
  const pct = n => typeof n === 'number' && Number.isFinite(n) ? `${M.number(100 * n)}%` : T('dungeon.unknown'), mult = n => `×${M.number(n, 2)}`;
  const when = at => new Date(at).toLocaleString(root.__dfoUi?.tag || 'en-US', { dateStyle: 'short', timeStyle: 'short' });
  const tenths = n => (root.__dfoUi ? root.__dfoUi.number(n, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : n.toFixed(1));
  const tools = () => ({ ...root.__dfoDungeonTools, ...host?.__dfoWorld, online: () => host?.params?.has('online') === true });
  const keyOf = loc => String(loc?.mapTableData?.mapId ?? '');
  const allowed = loc => M.eligible(loc) && safe(() => tools().allowed?.(loc), false) === true;
  const viewReady = () => safe(() => { const t = tools(); return t.modes?.()?.mode === 'exterior' && t.viewOpen?.() === true; }, false);

  function records() {
    const out = new Map();
    for (const p of safe(() => host.travelViewPlaces(), [])) if (M.eligible(p.summary?.loc)) out.set(p.key, { ...p, loc: p.summary.loc, px: p.summary.pixel.x, py: p.summary.pixel.y });
    for (const p of safe(() => host.travelViewFarPlaces(), [])) if (M.eligible(p.summary?.loc)) out.set(p.key, { ...p, loc: p.summary.loc, px: p.summary.pixel.x, py: p.summary.pixel.y });
    for (const p of safe(() => host.travelViewDungeons(), [])) if (p.found && M.eligible(p.loc)) out.set(p.key, p);
    for (const [key, p] of out) if (!allowed(p.loc)) out.delete(key);
    return out;
  }
  function model(p) {
    const t = tools(), player = t.player?.(); if (!player) return null;
    const weapon = t.weapon?.(player), note = notes[keyOf(p.loc)];
    const sig = JSON.stringify([Math.floor(Date.now() / 1000), player.level, player.skills, player.stats, player._mentor, weapon?.material, t.renown?.(), note?.at, t.spawnRecord?.(p)]);
    const old = modelCache.get(p.loc); if (old?.sig === sig) return old.model;
    const value = M.forecast(p, player, t, note?.online === t.online() ? note : null); modelCache.set(p.loc, { sig, model: value }); return value;
  }
  const scoreText = m => `|${m.scores.threat ? M.SKULL.repeat(m.scores.threat) : '?'}|${m.scores.loot ? '◆'.repeat(m.scores.loot) : '?'}|${m.scores.growth ? '↑'.repeat(m.scores.growth) : '?'}| ★ - ${m.scores.renown == null ? '?' : tenths(m.scores.renown)}`;
  function decorate(marks) {
    if (!host) return marks;
    questMarks = marks.filter(m => /^quest:-?\d+,-?\d+$/.test(m.key || ''));
    const byKey = records();
    for (const key of distances.keys()) if (!byKey.has(key)) distances.delete(key);
    return marks.map(mark => {
      const p = byKey.get(mark.key); if (!p || mark.label === '?') return mark;
      const value = safe(() => model(p)); if (!value) return mark;
      const distance = /[\d.,]+\s*(?:km|m|км|м)$/.exec(mark.sub || '')?.[0];
      if (distance) distances.set(mark.key, distance);
      const metadata = value.metadata, rating = scoreText(value);
      markHeadings.set(keyOf(p.loc), { title: value.title, subtitle: metadata, rating, model: value });
      const signature = JSON.stringify([value.title, metadata, rating, value.color]);
      return {
        ...mark, label: value.title, sub: `${metadata}; ${rating}`, pick: true,
        dfoDungeon: { model: value, metadata, distance, signature },
        tip: () => ({ title: value.name, lines: [T('dungeon.tip.click'), T('dungeon.tip.personal'), T('dungeon.tip.travel')] })
      };
    });
  }

  function sprite(document, mark, dpr = 1) {
    const { model: m, metadata, signature } = mark.dfoDungeon, max = Math.max(180, Math.min(580, (document.defaultView?.innerWidth || 900) - 20));
    const key = `${signature}|${dpr}|${max}`, saved = sprites.get(key); if (saved) return saved;
    const c = document.createElement('canvas'), g = c.getContext('2d'); if (!g) return null;
    const ellipsis = (text, width) => { if (g.measureText(text).width <= width) return text; let s = text; while (s.length && g.measureText(s + '…').width > width) s = s.slice(0, -1); return s + '…'; };
    const segments = [
      { text: '|', color: '#686f78' },
      { text: m.scores.threat ? M.SKULL.repeat(m.scores.threat) : '?', color: '#ff665c' },
      { text: '|', color: '#686f78' },
      { text: m.scores.loot ? '◆'.repeat(m.scores.loot) : '?', color: '#f1cd70' },
      { text: '|', color: '#686f78' },
      { text: m.scores.growth ? '↑'.repeat(m.scores.growth) : '?', color: '#85dc91' },
      { text: '|', color: '#686f78' },
      { text: ` ★ - ${m.scores.renown == null ? '?' : tenths(m.scores.renown)}`, color: '#ffffff' },
    ];
    g.font = '600 11px system-ui, sans-serif'; const title = ellipsis(m.title, max - 18), titleW = g.measureText(title).width;
    g.font = '10px system-ui, sans-serif'; const sub = ellipsis(metadata, max - 18), subW = g.measureText(sub).width;
    const scoreFont = '12px "Segoe UI Symbol", "DejaVu Sans", sans-serif';
    g.font = scoreFont; const scoreW = segments.reduce((n, s) => n + g.measureText(s.text).width, 0);
    const w = Math.min(max, Math.ceil(Math.max(titleW, subW, scoreW) + 18)), h = 58;
    c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr); g.scale(dpr, dpr);

    const r = 3;
    g.beginPath();
    g.moveTo(0.5 + r, 0.5);
    g.lineTo(w - 0.5 - r, 0.5);
    g.quadraticCurveTo(w - 0.5, 0.5, w - 0.5, 0.5 + r);
    g.lineTo(w - 0.5, h - 0.5 - r);
    g.quadraticCurveTo(w - 0.5, h - 0.5, w - 0.5 - r, h - 0.5);
    g.lineTo(0.5 + r, h - 0.5);
    g.quadraticCurveTo(0.5, h - 0.5, 0.5, h - 0.5 - r);
    g.lineTo(0.5, 0.5 + r);
    g.quadraticCurveTo(0.5, 0.5, 0.5 + r, 0.5);
    g.closePath();
    g.fillStyle = 'rgba(14, 18, 24, 0.78)';
    g.fill();
    g.strokeStyle = 'rgba(192, 138, 62, 0.35)';
    g.lineWidth = 1;
    g.stroke();

    g.textBaseline = 'top';
    g.font = '600 11px system-ui, sans-serif';
    g.fillStyle = m.color;
    const split = title.indexOf(']') + 1;
    g.fillText(split ? title.slice(0, split) : title, 9, 5);
    if (split) {
      g.fillStyle = '#f2e4c0';
      g.fillText(title.slice(split), 9 + g.measureText(title.slice(0, split)).width, 5);
    }
    g.font = '10px system-ui, sans-serif';
    g.fillStyle = '#b8a876';
    g.fillText(sub, 9, 22);
    g.font = scoreFont;
    let x = 9;
    for (const s of segments) {
      g.fillStyle = s.color;
      g.fillText(s.text, x, 38);
      x += g.measureText(s.text).width;
    }
    const result = { c, w, h };
    sprites.set(key, result);
    if (sprites.size > 96) sprites.delete(sprites.keys().next().value);
    return result;
  }
  function box(q, vw) {
    const { w, h } = q.sp, x = vw > w + 8 ? Math.min(Math.max(4, q.x - w / 2), vw - 4 - w) : q.x - w / 2;
    const y = q.side === 3 ? q.y - 10 - h : !q.held ? q.y - 24 - h / 2 : q.y + 10;
    return { x0: x - 4, x1: x + w + 4, y0: Math.min(q.y - 10, y - 4), y1: Math.max(q.y + 8, y + h + 4) };
  }

  const FRAME_SVG = "data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20width%3D'25'%20height%3D'25'%20shape-rendering%3D'crispEdges'%3E%3Crect%20x%3D'0'%20y%3D'0'%20width%3D'25'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'0'%20y%3D'1'%20width%3D'1'%20height%3D'24'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'1'%20y%3D'1'%20width%3D'9'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'10'%20y%3D'1'%20width%3D'1'%20height%3D'5'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'11'%20y%3D'1'%20width%3D'3'%20height%3D'1'%20fill%3D'%23c2b79a'%2F%3E%3Crect%20x%3D'14'%20y%3D'1'%20width%3D'1'%20height%3D'5'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'15'%20y%3D'1'%20width%3D'9'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'24'%20y%3D'1'%20width%3D'1'%20height%3D'24'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'1'%20y%3D'2'%20width%3D'1'%20height%3D'8'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'2'%20y%3D'2'%20width%3D'7'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'9'%20y%3D'2'%20width%3D'1'%20height%3D'4'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'11'%20y%3D'2'%20width%3D'3'%20height%3D'1'%20fill%3D'%239a9079'%2F%3E%3Crect%20x%3D'15'%20y%3D'2'%20width%3D'1'%20height%3D'4'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'16'%20y%3D'2'%20width%3D'7'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'23'%20y%3D'2'%20width%3D'1'%20height%3D'8'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'11'%20y%3D'3'%20width%3D'3'%20height%3D'1'%20fill%3D'%237a7260'%2F%3E%3Crect%20x%3D'2'%20y%3D'4'%20width%3D'2'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'4'%20y%3D'4'%20width%3D'3'%20height%3D'1'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'7'%20y%3D'4'%20width%3D'2'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'11'%20y%3D'4'%20width%3D'3'%20height%3D'1'%20fill%3D'%235a5446'%2F%3E%3Crect%20x%3D'16'%20y%3D'4'%20width%3D'2'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'18'%20y%3D'4'%20width%3D'3'%20height%3D'1'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'21'%20y%3D'4'%20width%3D'2'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'4'%20y%3D'5'%20width%3D'1'%20height%3D'2'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'5'%20y%3D'5'%20width%3D'1'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'6'%20y%3D'5'%20width%3D'1'%20height%3D'2'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'11'%20y%3D'5'%20width%3D'3'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'5'%20width%3D'1'%20height%3D'2'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'19'%20y%3D'5'%20width%3D'1'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'20'%20y%3D'5'%20width%3D'1'%20height%3D'2'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'5'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'7'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'8'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'9'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'10'%20y%3D'6'%20width%3D'5'%20height%3D'1'%20fill%3D'%2316140f'%2F%3E%3Crect%20x%3D'15'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'16'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'17'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'19'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'4'%20y%3D'7'%20width%3D'3'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'7'%20y%3D'7'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'8'%20y%3D'7'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'9'%20y%3D'7'%20width%3D'7'%20height%3D'1'%20fill%3D'%230c0d10'%2F%3E%3Crect%20x%3D'16'%20y%3D'7'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'17'%20y%3D'7'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'18'%20y%3D'7'%20width%3D'3'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'4'%20y%3D'8'%20width%3D'2'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'6'%20y%3D'8'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'7'%20y%3D'8'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'17'%20y%3D'8'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'8'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'19'%20y%3D'8'%20width%3D'2'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'2'%20y%3D'9'%20width%3D'4'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'6'%20y%3D'9'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'7'%20y%3D'9'%20width%3D'1'%20height%3D'7'%20fill%3D'%230c0d10'%2F%3E%3Crect%20x%3D'17'%20y%3D'9'%20width%3D'1'%20height%3D'7'%20fill%3D'%231c1a15'%2F%3E%3Crect%20x%3D'18'%20y%3D'9'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'19'%20y%3D'9'%20width%3D'4'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'1'%20y%3D'10'%20width%3D'5'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'6'%20y%3D'10'%20width%3D'1'%20height%3D'5'%20fill%3D'%2316140f'%2F%3E%3Crect%20x%3D'18'%20y%3D'10'%20width%3D'1'%20height%3D'5'%20fill%3D'%235a5446'%2F%3E%3Crect%20x%3D'19'%20y%3D'10'%20width%3D'5'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'1'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%23c2b79a'%2F%3E%3Crect%20x%3D'2'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%239a9079'%2F%3E%3Crect%20x%3D'3'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%237a7260'%2F%3E%3Crect%20x%3D'4'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%235a5446'%2F%3E%3Crect%20x%3D'5'%20y%3D'11'%20width%3D'1'%20height%3D'4'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'19'%20y%3D'11'%20width%3D'1'%20height%3D'4'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'20'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%234f4838'%2F%3E%3Crect%20x%3D'21'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%23443e31'%2F%3E%3Crect%20x%3D'22'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%233a352a'%2F%3E%3Crect%20x%3D'23'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%2325221b'%2F%3E%3Crect%20x%3D'1'%20y%3D'14'%20width%3D'4'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'20'%20y%3D'14'%20width%3D'4'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'1'%20y%3D'15'%20width%3D'1'%20height%3D'9'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'2'%20y%3D'15'%20width%3D'4'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'6'%20y%3D'15'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'15'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'19'%20y%3D'15'%20width%3D'4'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'23'%20y%3D'15'%20width%3D'1'%20height%3D'9'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'2'%20y%3D'16'%20width%3D'4'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'6'%20y%3D'16'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'7'%20y%3D'16'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'17'%20y%3D'16'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'16'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'19'%20y%3D'16'%20width%3D'4'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'6'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'7'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'8'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'9'%20y%3D'17'%20width%3D'7'%20height%3D'1'%20fill%3D'%231c1a15'%2F%3E%3Crect%20x%3D'16'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'17'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'18'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'2'%20y%3D'18'%20width%3D'2'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'4'%20y%3D'18'%20width%3D'1'%20height%3D'3'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'5'%20y%3D'18'%20width%3D'2'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'7'%20y%3D'18'%20width%3D'1'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'8'%20y%3D'18'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'9'%20y%3D'18'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'10'%20y%3D'18'%20width%3D'5'%20height%3D'1'%20fill%3D'%235a5446'%2F%3E%3Crect%20x%3D'15'%20y%3D'18'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'16'%20y%3D'18'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'17'%20y%3D'18'%20width%3D'1'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'18'%20y%3D'18'%20width%3D'2'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'20'%20y%3D'18'%20width%3D'1'%20height%3D'3'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'21'%20y%3D'18'%20width%3D'2'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'5'%20y%3D'19'%20width%3D'1'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'6'%20y%3D'19'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'8'%20y%3D'19'%20width%3D'1'%20height%3D'4'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'9'%20y%3D'19'%20width%3D'1'%20height%3D'4'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'10'%20y%3D'19'%20width%3D'5'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'15'%20y%3D'19'%20width%3D'1'%20height%3D'4'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'16'%20y%3D'19'%20width%3D'1'%20height%3D'4'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'18'%20y%3D'19'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'19'%20y%3D'19'%20width%3D'1'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'5'%20y%3D'20'%20width%3D'2'%20height%3D'1'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'10'%20y%3D'20'%20width%3D'1'%20height%3D'5'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'11'%20y%3D'20'%20width%3D'3'%20height%3D'1'%20fill%3D'%234f4838'%2F%3E%3Crect%20x%3D'14'%20y%3D'20'%20width%3D'1'%20height%3D'5'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'20'%20width%3D'2'%20height%3D'1'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'4'%20y%3D'21'%20width%3D'3'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'11'%20y%3D'21'%20width%3D'3'%20height%3D'1'%20fill%3D'%23443e31'%2F%3E%3Crect%20x%3D'18'%20y%3D'21'%20width%3D'3'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'11'%20y%3D'22'%20width%3D'3'%20height%3D'1'%20fill%3D'%233a352a'%2F%3E%3Crect%20x%3D'2'%20y%3D'23'%20width%3D'8'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'11'%20y%3D'23'%20width%3D'3'%20height%3D'1'%20fill%3D'%2325221b'%2F%3E%3Crect%20x%3D'15'%20y%3D'23'%20width%3D'8'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'1'%20y%3D'24'%20width%3D'9'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'11'%20y%3D'24'%20width%3D'3'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'15'%20y%3D'24'%20width%3D'9'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3C%2Fsvg%3E";
  function styles() {
    if (doc.getElementById('dfo-dungeon-style')) return;
    const node = el('style'); node.id = 'dfo-dungeon-style'; node.textContent = `
.dfo-dungeon-dialog{box-sizing:border-box;position:fixed;inset:0;margin:auto;color:#e9e4d9;font-family:'DFO Gabin',var(--data,serif);background-color:var(--dfo-bg-window,rgba(12,14,18,.94));background-image:var(--dfo-bg-dither-img,repeating-conic-gradient(rgba(255,255,255,.022) 0 25%,transparent 0 50%));background-size:var(--dfo-bg-dither-size,4px 4px);border:2px solid #7d7460;border-image:url("${FRAME_SVG}") 12 / 12px / 6px stretch;border-radius:0;box-shadow:4px 4px 0 6px rgba(0,0,0,.42),0 14px 36px rgba(0,0,0,.85);width:min(880px,94vw);max-height:min(820px,90vh);overflow:hidden;padding:0;display:flex;flex-direction:column}
.dfo-dungeon-dialog::backdrop{background:var(--dfo-bg-scrim,rgba(5,7,10,.72))}
.dfo-dungeon-dialog.dfo-dungeon-guide{width:min(740px,92vw);max-height:min(720px,86vh)}
.dfo-dungeon-dialog .wh{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;background-color:rgba(14,16,21,.94);background-image:linear-gradient(180deg,rgba(62,56,44,.38) 0%,rgba(24,26,32,.55) 56%,rgba(10,12,16,.72) 100%);border-bottom:1px solid #050608;box-shadow:0 1px 0 rgba(163,152,128,.28),inset 0 1px 0 rgba(255,244,214,.08);user-select:none;flex-shrink:0}
.dfo-dungeon-dialog .wh .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:'DFO Greengoth',var(--display,Georgia,serif);font-size:17px;letter-spacing:.07em;color:#f6e7b0;text-transform:uppercase;text-shadow:0 2px 0 #000,0 0 6px rgba(0,0,0,.75)}
.dfo-dungeon-dialog .wh .t::before{content:'◆ ';font-size:10px;color:#b7a071;vertical-align:1px;margin-right:4px;text-shadow:none}
.dfo-dungeon-header-left{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}
.dfo-dungeon-title{font-family:'DFO Greengoth',var(--display,Georgia,serif);font-size:19px;color:#f6e7b0;letter-spacing:.06em;text-shadow:0 2px 0 #000,0 0 6px rgba(0,0,0,.75);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dfo-dungeon-title::before{content:'◆ ';font-size:11px;color:#b7a071;vertical-align:2px;margin-right:4px;text-shadow:none}
.dfo-dungeon-subtitle{font-size:12px;color:#b7a889;display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.dfo-dungeon-tag{font-weight:600;padding:1px 7px;background:rgba(8,10,14,.82);border:1px solid rgba(154,144,121,.42);letter-spacing:.04em}
.dfo-dungeon-header-right{display:flex;align-items:center;gap:8px;flex-shrink:0}
.dfo-btn-travel{--dfo-c:#fde68a;position:relative;cursor:pointer;padding:6px 15px;min-height:32px;font-family:'DFO Gabin',var(--data,serif);font-size:13px;font-weight:600;letter-spacing:.04em;color:#fde68a;text-shadow:0 1px 0 #000;background:linear-gradient(180deg,#4b391a 0%,#2f230e 56%,#1f1709 100%);border:1px solid #a6823f;border-top-color:#e4c175;border-bottom-color:#4f3b18;border-radius:1px;box-shadow:inset 0 1px 0 rgba(255,224,150,.18),0 1px 3px rgba(0,0,0,.6);transition:filter 120ms ease,transform 80ms ease;display:inline-flex;align-items:center;gap:6px}
.dfo-btn-travel::before{content:'';position:absolute;inset:2px;border:1px solid rgba(253,230,138,.32);pointer-events:none}
.dfo-btn-travel::after{content:'';position:absolute;inset:2px;pointer-events:none;background:linear-gradient(var(--dfo-c),var(--dfo-c)) top left/5px 1px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) top left/1px 5px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) top right/5px 1px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) top right/1px 5px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) bottom left/5px 1px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) bottom left/1px 5px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) bottom right/5px 1px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) bottom right/1px 5px no-repeat}
.dfo-btn-travel:hover:not(:disabled){filter:brightness(1.16);color:#ffffff}
.dfo-btn-travel:active:not(:disabled){transform:translateY(1px)}
.dfo-btn-travel:disabled{opacity:.5;cursor:wait}
.dfo-dungeon-dialog .wh button.dfo-win-x{background:rgba(14,16,21,.88);border:1px solid rgba(154,144,121,.48);color:#d7cbb0;cursor:pointer;font:inherit;font-size:15px;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border-radius:1px;line-height:1;box-shadow:inset 0 1px 0 rgba(255,244,214,.10),0 1px 2px rgba(0,0,0,.55);transition:color 120ms ease,background 120ms ease,border-color 120ms ease}
.dfo-dungeon-dialog .wh button.dfo-win-x:hover{color:#fff7dc;border-color:#d5b26e;background:rgba(213,178,110,.14)}

.dfo-dungeon-dialog .tabs{display:flex;flex-wrap:wrap;gap:6px;padding:7px 16px;border-bottom:1px solid rgba(154,144,121,.28);box-shadow:0 1px 0 #050608;background:rgba(8,10,14,.52);flex-shrink:0}
.dfo-dungeon-dialog .tabs button{padding:6px 14px;cursor:pointer;color:#b2a78e;background:linear-gradient(180deg,rgba(34,38,48,.88),rgba(19,22,28,.94));border:1px solid rgba(117,99,70,.5);border-radius:1px;font-family:'DFO Gabin',var(--data,serif);font-size:12px;letter-spacing:.035em;text-shadow:0 1px 0 #000;box-shadow:inset 0 1px 0 rgba(255,255,255,.05),inset 0 -1px 0 rgba(0,0,0,.6);transition:background-color 120ms ease,border-color 120ms ease,color 120ms ease}
.dfo-dungeon-dialog .tabs button:hover{color:#f6e7b0;background:linear-gradient(180deg,rgba(48,50,58,.92),rgba(26,28,34,.96));border-color:rgba(213,178,110,.68)}
.dfo-dungeon-dialog .tabs button.on,.dfo-dungeon-dialog .tabs button[aria-selected="true"]{color:#f6e7b0;background-color:var(--dfo-bg-button-hover,#262a33);background-image:linear-gradient(180deg,rgba(192,138,62,.22),rgba(138,105,43,.10));border-color:#c9a662;box-shadow:inset 0 -2px 0 #d5b26e,inset 0 1px 0 rgba(255,224,150,.18)}

.dfo-dungeon-dialog .wb{overflow-y:auto;overscroll-behavior:contain;padding:14px 16px 16px;font-size:12.5px;line-height:1.5;min-height:0;flex:1;scrollbar-width:thin;scrollbar-color:#756346 #0c0e11}
.dfo-dungeon-dialog .wb::-webkit-scrollbar,.dfo-dungeon-table::-webkit-scrollbar{width:7px;height:7px}
.dfo-dungeon-dialog .wb::-webkit-scrollbar-track,.dfo-dungeon-table::-webkit-scrollbar-track{background:#0c0e11}
.dfo-dungeon-dialog .wb::-webkit-scrollbar-thumb,.dfo-dungeon-table::-webkit-scrollbar-thumb{background:linear-gradient(180deg,#5e4f37,#3e3424);border:1px solid #14171c}
.dfo-dungeon-dialog .sec{margin:13px 0 6px;padding-bottom:4px;border-bottom:1px solid rgba(213,178,110,.26);font-family:'DFO Greengoth',var(--display,Georgia,serif);font-size:12.5px;letter-spacing:.08em;text-transform:uppercase;color:#e7d6a9;text-shadow:0 1px 0 #000}
.dfo-dungeon-dialog .sec::before{content:'◆ ';font-size:9px;color:#d5b26e;vertical-align:1px;margin-right:4px;text-shadow:none}
.dfo-dungeon-dialog .sec:first-child{margin-top:2px}
.dfo-dungeon-dialog .p{opacity:.94;font-size:12.5px;margin:4px 0 6px;color:#e9e4d9;line-height:1.5}
.dfo-dungeon-dialog .dfo-dungeon-personal{color:#a9a08a;font-size:11.5px;margin-top:12px;padding-top:8px;border-top:1px solid rgba(117,99,70,.32);font-style:normal}

/* 4-Column D-02/L-03 KPI Strip matching Spellmaker Guide */
.dfo-dungeon-banner{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:12px;padding:0;background:none;border:0;box-shadow:none;font-family:"Segoe UI Symbol","DejaVu Sans",'DFO Gabin',sans-serif}
.dfo-banner-item{--dfo-b-c:#d5b26e;--dfo-b-rgb:213,178,110;display:flex;flex-direction:column;gap:3px;padding:7px 10px;background-color:var(--dfo-bg-panel,rgba(15,17,22,.92));background-image:linear-gradient(180deg,rgba(var(--dfo-b-rgb),.15) 0,rgba(var(--dfo-b-rgb),.03) 34px,transparent 68px);border:1px solid rgba(117,99,70,.5);border-top:2px solid var(--dfo-b-c);border-left:3px solid var(--dfo-b-c);box-shadow:0 0 0 1px #050608,inset 0 0 0 1px rgba(5,6,8,.72)}
.dfo-banner-item:nth-child(1){--dfo-b-c:#e2574c;--dfo-b-rgb:226,87,76}
.dfo-banner-item:nth-child(2){--dfo-b-c:#f5d451;--dfo-b-rgb:245,212,81}
.dfo-banner-item:nth-child(3){--dfo-b-c:#52c298;--dfo-b-rgb:82,194,152}
.dfo-banner-item:nth-child(4){--dfo-b-c:#b57bee;--dfo-b-rgb:181,123,238}
.dfo-banner-label{font-family:'DFO Gabin',var(--data,serif);font-size:10.5px;font-weight:700;letter-spacing:.07em;color:#b7a071;text-transform:uppercase}
.dfo-banner-val{font-family:'DFO Flexi',"Segoe UI Symbol",monospace;font-size:15px;font-weight:600;letter-spacing:.04em;text-shadow:0 1px 0 #000}
.val-threat{color:#ff8a80}
.val-loot{color:#f5d451}
.val-growth{color:#7fe3b5}
.val-renown{color:#e9d5ff}

/* 2x2 Framed Default Paint Forecast & Guide Cards (#9a9079 stone-pewter; compact KPI banner above stays colored) */
.dfo-dg-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:4px 0 8px}
.dfo-dg-card{--dfo-panel-c:#9a9079;--dfo-panel-rgb:154,144,121;display:flex;flex-direction:column;overflow:hidden;background-color:var(--dfo-bg-panel,rgba(15,17,22,.92));background-image:linear-gradient(180deg,rgba(var(--dfo-panel-rgb),.08) 0,rgba(var(--dfo-panel-rgb),.024) 44px,transparent 128px);border:2px solid;border-color:var(--dfo-panel-c) #3a352a #25221b #7a7260;box-shadow:0 0 0 1px #050608,inset 0 0 0 1px rgba(5,6,8,.75),2px 2px 0 1px rgba(0,0,0,.38)}
.dfo-dg-card-body{padding:8px 11px 10px;display:flex;flex-direction:column;gap:5px}
.dfo-dg-card-body .p{margin:0;font-size:12px;line-height:1.45;color:#e5decf}
.dfo-dg-card .dfo-sec-title{margin:0;padding:6px 11px;color:#e7d6a9;background-color:rgba(14,17,22,.68);background-image:linear-gradient(180deg,rgba(var(--dfo-panel-rgb),.12),rgba(var(--dfo-panel-rgb),.025)),var(--dfo-bg-header,linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.015)));border-bottom:1px solid rgba(var(--dfo-panel-rgb),.32);box-shadow:0 1px 0 rgba(0,0,0,.55);font-size:12px;letter-spacing:.07em}
.dfo-dg-guide-stack{display:flex;flex-direction:column;gap:9px;margin-top:6px}
@media(max-width:680px){.dfo-dungeon-banner{grid-template-columns:repeat(2,minmax(0,1fr))}.dfo-dg-cards{grid-template-columns:1fr}}

.dfo-dungeon-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
.dfo-chip{padding:3px 9px;font-size:11px;font-weight:600;letter-spacing:.05em;border-radius:1px;text-transform:uppercase;display:inline-flex;align-items:center;gap:5px;border-width:1px;border-style:solid;box-shadow:inset 0 0 0 1px rgba(0,0,0,.65)}
.dfo-chip-ico{width:13px;height:13px;flex:0 0 13px;filter:drop-shadow(0 1px 1px rgba(0,0,0,.85))}
.chip-red{border-color:rgba(226,87,76,.72);color:#ff9f98;background:rgba(130,52,44,.42)}
.chip-teal{border-color:rgba(82,194,152,.72);color:#7fe3b5;background:rgba(24,68,55,.44)}
.chip-gold{border-color:rgba(228,195,79,.65);color:#f6e7b0;background:rgba(68,52,20,.46)}
.chip-purple{border-color:rgba(181,123,238,.65);color:#d9b5ff;background:rgba(74,42,108,.44)}
.chip-amber{border-color:rgba(224,122,46,.68);color:#ffb87a;background:rgba(96,48,18,.46)}

.dfo-sec-title{margin:14px 0 4px;font-family:'DFO Greengoth',var(--display,Georgia,serif);font-size:12.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;display:flex;align-items:center;gap:6px;text-shadow:0 1px 0 #000}

/* D-06 Canonical Dark-Fantasy Tables */
.dfo-dungeon-table{max-width:100%;overflow-x:auto;margin:4px 0 10px;background:var(--dfo-bg-well,rgba(8,10,13,.9));border:2px solid;border-color:#25221b #7a7260 #9a9079 #3a352a;box-shadow:0 0 0 1px #050608,inset 2px 2px 0 rgba(0,0,0,.45)}
.dfo-dungeon-dialog table{border-collapse:collapse;width:100%;margin:0;font-size:12px}
.dfo-dungeon-dialog th{text-align:left;font-weight:normal;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#b7a071;background:rgba(213,178,110,.08);border-bottom:1px solid rgba(192,138,62,.35);padding:6px 9px;white-space:nowrap}
.dfo-dungeon-dialog td{padding:5px 9px;border-bottom:1px solid rgba(117,99,70,.18);vertical-align:top;color:#e9e4d9}
.dfo-dungeon-dialog tbody tr:nth-child(even) td{background:rgba(255,255,255,.02)}
.dfo-dungeon-dialog tbody tr:hover td{background:var(--dfo-bg-row-hover,rgba(38,42,51,.55))}

.dfo-dungeon-dialog .acts{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:9px 14px;border-top:1px solid #050608;box-shadow:inset 0 1px 0 rgba(163,152,128,.24);background:var(--dfo-bg-footer,rgba(0,0,0,.24));flex-shrink:0}
.dfo-dungeon-footer-btns{display:flex;gap:8px;margin-left:auto}
.dfo-dungeon-dialog:not(.dfo-cartography-dialog) .acts button,.dfo-dungeon-dialog button.dfo-btn{--dfo-c:#d4b16a;position:relative;cursor:pointer;min-height:32px;padding:6px 15px;font-family:'DFO Gabin',var(--data,serif);font-size:12.5px;letter-spacing:.03em;color:#f1e6c8;text-shadow:0 1px 0 #000;background:linear-gradient(180deg,#272219 0%,#191510 55%,#120f0b 100%);border:1px solid #6e5c3e;border-top-color:#9e8355;border-bottom-color:#3b301f;border-radius:1px;box-shadow:inset 0 1px 0 rgba(255,224,150,.14),inset 0 -1px 0 rgba(0,0,0,.72),0 1px 2px rgba(0,0,0,.55);transition:filter 120ms ease,transform 80ms ease}
.dfo-dungeon-dialog:not(.dfo-cartography-dialog) .acts button::before,.dfo-dungeon-dialog button.dfo-btn::before{content:'';position:absolute;inset:2px;border:1px solid rgba(213,178,110,.22);pointer-events:none}
.dfo-dungeon-dialog:not(.dfo-cartography-dialog) .acts button::after,.dfo-dungeon-dialog button.dfo-btn::after{content:'';position:absolute;inset:2px;pointer-events:none;background:linear-gradient(var(--dfo-c),var(--dfo-c)) top left/5px 1px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) top left/1px 5px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) top right/5px 1px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) top right/1px 5px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) bottom left/5px 1px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) bottom left/1px 5px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) bottom right/5px 1px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) bottom right/1px 5px no-repeat}
.dfo-dungeon-dialog:not(.dfo-cartography-dialog) .acts button:hover:not(:disabled),.dfo-dungeon-dialog button.dfo-btn:hover:not(:disabled){filter:brightness(1.16);border-color:#9e8355;border-top-color:#d5b26e;color:#f6e7b0}
.dfo-dungeon-dialog:not(.dfo-cartography-dialog) .acts button:active:not(:disabled),.dfo-dungeon-dialog button.dfo-btn:active:not(:disabled){transform:translateY(1px)}
.dfo-dungeon-dialog:not(.dfo-cartography-dialog) .acts button:disabled{opacity:.45;cursor:default;filter:grayscale(.4)}
/* C-01 Arcane Sapphire for Guide button (matches Spellmaker Guide & Inventory Codex!) */
.dfo-dungeon-dialog:not(.dfo-cartography-dialog):not(.dfo-dungeon-live) .dfo-dungeon-footer-btns button:first-child:not(:last-child){--dfo-c:#93c5fd;border-color:#3f63a8;border-top-color:#7fb2f0;border-bottom-color:#162442;background:repeating-linear-gradient(135deg,rgba(147,197,253,.12) 0 4px,transparent 4px 10px),radial-gradient(ellipse 65% 120% at 50% 0%,rgba(125,168,234,.24),transparent 72%),linear-gradient(180deg,#243c69 0%,#162646 56%,#0d172c 100%);color:#e0f2fe}
.dfo-dungeon-dialog:not(.dfo-cartography-dialog):not(.dfo-dungeon-live) .dfo-dungeon-footer-btns button:first-child:not(:last-child)::before{border-color:rgba(147,197,253,.36)}
/* C-01 Canonical Window Close button (1:1 like Inventory .dfo-close-btn with -45deg crimson hatch) */
.dfo-dungeon-dialog:not(.dfo-cartography-dialog) .dfo-dungeon-footer-btns button:last-child{--dfo-c:#f08a80;border-color:#a1463e #4c1b18 #2d0e0c #782e28;background:repeating-linear-gradient(-45deg,rgba(176,56,48,.22) 0 4px,rgba(16,7,9,.34) 4px 8px),linear-gradient(180deg,#3d1618 0%,#250c0e 58%,#160709 100%);box-shadow:0 0 0 1px #050608,inset 0 0 0 1px rgba(240,138,128,.18),inset 0 1px 0 rgba(255,204,198,.16);color:#fce0dc}
.dfo-dungeon-dialog:not(.dfo-cartography-dialog) .dfo-dungeon-footer-btns button:last-child::before{border-color:rgba(240,138,128,.28)}
.dfo-dungeon-dialog:not(.dfo-cartography-dialog) .dfo-dungeon-footer-btns button:last-child:hover:not(:disabled){--dfo-c:#ffb0a7;border-color:#c85a46;background:repeating-linear-gradient(-45deg,rgba(212,78,66,.28) 0 4px,rgba(22,9,11,.28) 4px 8px),linear-gradient(180deg,#521d20 0%,#341114 58%,#200a0c 100%);box-shadow:0 0 0 1px #050608,0 0 10px rgba(200,90,70,.3),inset 0 0 0 1px rgba(255,176,167,.28);color:#fff0ee}
.dfo-dungeon-status{color:#ff9f98;min-height:1.4em;font-size:11.5px}
`; doc.head.append(node);
  }
  function modal(title, opts = {}) {
    styles(); const prior = doc.activeElement;
    const guide = opts.guide === true;
    const node = el('dialog', `dfo-panel dfo-win dfo-window-frame dfo-dungeon-dialog${guide ? ' dfo-dungeon-guide' : ''}`);
    const wh = el('div', 'wh');
    let heading, wx, travelBtn, subNode;
    if (guide) {
      heading = el('span', 't', title); heading.id = `dfo-dungeon-title-${stack.length}`; node.setAttribute('aria-labelledby', heading.id);
      wx = el('button', 'dfo-win-x', '✕'); wx.type = 'button'; wx.setAttribute('aria-label', T('dungeon.guide.close'));
      wh.append(heading, wx);
    } else {
      const left = el('div', 'dfo-dungeon-header-left');
      heading = el('div', 'dfo-dungeon-title', title); heading.id = `dfo-dungeon-title-${stack.length}`; node.setAttribute('aria-labelledby', heading.id);
      subNode = el('div', 'dfo-dungeon-subtitle');
      left.append(heading, subNode);
      const right = el('div', 'dfo-dungeon-header-right');
      travelBtn = el('button', 'dfo-btn-travel', T('dungeon.travel')); travelBtn.type = 'button';
      wx = el('button', 'dfo-win-x', '✕'); wx.type = 'button'; wx.setAttribute('aria-label', T('dungeon.card.close'));
      right.append(travelBtn, wx);
      wh.append(left, right);
    }
    const tabsWrap = el('div', 'tabs'); tabsWrap.setAttribute('role', 'tablist'); tabsWrap.setAttribute('aria-label', T('dungeon.card.title'));
    const body = el('div', 'wb'); body.setAttribute('role', 'tabpanel'); body.id = `dfo-dungeon-content-${stack.length}`;
    const acts = el('div', 'acts dfo-dungeon-footer');
    const status = el('span', 'dfo-dungeon-status'); status.setAttribute('role', 'status');
    const footerBtns = el('div', 'dfo-dungeon-footer-btns');
    acts.append(status, footerBtns);

    if (guide) {
      node.append(wh, body, acts);
    } else {
      node.append(wh, tabsWrap, body, acts);
    }

    const state = { node, heading, subNode, travelBtn, tabsWrap, content: body, body, status, footerBtns, acts, close: null };
    state.close = () => {
      if (!stack.includes(state)) return;
      for (const nested of [...stack.slice(stack.indexOf(state) + 1)].reverse()) nested.close();
      stack.splice(stack.indexOf(state), 1); node.close(); node.remove();
      if (current?.modal === state) current = null;
      if (prior?.isConnected) prior.focus();
    };
    wx.onclick = e => { e.preventDefault(); e.stopPropagation(); state.close(); };
    for (const type of ['click', 'mousedown', 'mouseup', 'pointerdown', 'wheel']) node.addEventListener(type, e => e.stopPropagation());
    node.addEventListener('cancel', e => { e.preventDefault(); e.stopPropagation(); state.close(); });
    doc.body.append(node); stack.push(state); node.showModal(); return state;
  }
  root.addEventListener('keydown', e => {
    if (!stack.length) return;
    e.stopImmediatePropagation();
    if (e.key === 'Escape') { e.preventDefault(); stack.at(-1).close(); }
    else if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) && e.target?.getAttribute('role') === 'tab') {
      e.preventDefault(); const buttons = [...e.target.parentNode.children], index = buttons.indexOf(e.target);
      buttons[e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length].click();
      buttons.find(b => b.getAttribute('aria-selected') === 'true')?.focus();
    }
  }, true);
  const paragraph = (body, text, cls = '') => body.append(el('div', `p ${cls || ''}`.trim(), text));
  const section = (body, title) => body.append(el('div', 'sec', title));
  function table(body, headers, rows) {
    const wrap = el('div', 'dfo-dungeon-table'), t = el('table', 'grid'), head = el('thead'), tr = el('tr');
    for (const word of headers) { const h = el('th', '', word); h.scope = 'col'; tr.append(h); } head.append(tr); t.append(head);
    const tbody = el('tbody');
    for (const values of rows) {
      const row = el('tr');
      for (const value of values) {
        const td = el('td');
        if (value && typeof value === 'object' && value.text !== undefined) {
          td.textContent = value.text;
          if (value.color) td.style.color = value.color;
        } else {
          td.textContent = value == null ? T('dungeon.unknown') : String(value);
        }
        row.append(td);
      }
      tbody.append(row);
    }
    t.append(tbody); wrap.append(t); body.append(wrap);
  }
  let dgSvgUid = 0;
  function aurumChipIcon() {
    const ns = 'http://www.w3.org/2000/svg';
    const mk = tag => (doc.createElementNS ? doc.createElementNS(ns, tag) : doc.createElement(tag));
    const p = `dfodg${++dgSvgUid}_`;
    const svg = mk('svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'dfo-chip-ico'); svg.setAttribute('aria-hidden', 'true');
    const defs = mk('defs'), g1 = mk('linearGradient'), g2 = mk('radialGradient');
    g1.setAttribute('id', `${p}r`); g1.setAttribute('x1', '0'); g1.setAttribute('y1', '0'); g1.setAttribute('x2', '1'); g1.setAttribute('y2', '1');
    for (const [o, c] of [['0%', '#fde68a'], ['45%', '#e07a2e'], ['100%', '#5c2008']]) { const s = mk('stop'); s.setAttribute('offset', o); s.setAttribute('stop-color', c); g1.append(s); }
    g2.setAttribute('id', `${p}c`); g2.setAttribute('cx', '44%'); g2.setAttribute('cy', '38%'); g2.setAttribute('r', '56%');
    for (const [o, c] of [['0%', '#fffbeb'], ['50%', '#f59e0b'], ['100%', '#9a3412']]) { const s = mk('stop'); s.setAttribute('offset', o); s.setAttribute('stop-color', c); g2.append(s); }
    defs.append(g1, g2); svg.append(defs);
    const p1 = mk('path'); p1.setAttribute('d', 'M12 1.7L15.1 4.6L19.4 4.6L19.4 8.9L22.3 12L19.4 15.1L19.4 19.4L15.1 19.4L12 22.3L8.9 19.4L4.6 19.4L4.6 15.1L1.7 12L4.6 8.9L4.6 4.6L8.9 4.6Z'); p1.setAttribute('fill', `url(#${p}r)`); p1.setAttribute('stroke', '#100704'); p1.setAttribute('stroke-width', '1.15'); p1.setAttribute('stroke-linejoin', 'round');
    const c1 = mk('circle'); c1.setAttribute('cx', '12'); c1.setAttribute('cy', '12'); c1.setAttribute('r', '5.8'); c1.setAttribute('fill', `url(#${p}c)`); c1.setAttribute('stroke', '#5c2008'); c1.setAttribute('stroke-width', '0.9');
    const p2 = mk('path'); p2.setAttribute('d', 'M12 7.8L13.2 10.8L16.2 12L13.2 13.2L12 16.2L10.8 13.2L7.8 12L10.8 10.8Z'); p2.setAttribute('fill', '#fffbeb');
    svg.append(p1, c1, p2);
    return svg;
  }
  function guideCard(parent, tone, title, lines) {
    const card = el('div', `dfo-dg-card is-${tone}`);
    const head = el('div', 'dfo-sec-title', title);
    const body = el('div', 'dfo-dg-card-body');
    for (const line of lines) paragraph(body, line);
    card.append(head, body);
    parent.append(card);
  }
  function guide() {
    const m = modal(T('dungeon.guide.title'), { guide: true }), b = m.content;
    paragraph(b, T('dungeon.guide.intro'));
    const stackWrap = el('div', 'dfo-dg-guide-stack');
    guideCard(stackWrap, 'threat', T('dungeon.guide.threat'), [T('dungeon.guide.threatText'), T('dungeon.guide.threatFormula')]);
    guideCard(stackWrap, 'loot', T('dungeon.guide.loot'), [T('dungeon.guide.lootText')]);
    guideCard(stackWrap, 'growth', T('dungeon.guide.growth'), [T('dungeon.guide.growthText')]);
    guideCard(stackWrap, 'renown', T('dungeon.guide.renown'), [T('dungeon.guide.renownText')]);
    guideCard(stackWrap, 'info', T('dungeon.guide.known'), [T('dungeon.guide.knownText'), T('dungeon.guide.unknownText')]);
    b.append(stackWrap);
    m.footerBtns.append(btn(T('dungeon.close'), m.close));
  }

  const TABS = [['overview', T('dungeon.tab.rating')], ['inhabitants', T('dungeon.tab.inhabitants')], ['loot', T('dungeon.tab.loot')], ['growth', T('dungeon.tab.growth')], ['intel', T('dungeon.tab.details')]];
  function contents(body, tab, m, p) {
    if (tab === 'overview') {
      if (!m.ready) paragraph(body, T('dungeon.partialData'));
      const banner = el('div', 'dfo-dungeon-banner');
      const bItems = [
        ['threat', T('dungeon.score.threat'), m.scores.threat ? M.SKULL.repeat(m.scores.threat) : '?', 'val-threat'],
        ['loot', T('dungeon.score.loot'), m.scores.loot ? '◆'.repeat(m.scores.loot) : '?', 'val-loot'],
        ['growth', T('dungeon.score.growth'), m.scores.growth ? '↑'.repeat(m.scores.growth) : '?', 'val-growth'],
        ['renown', T('dungeon.score.renown'), `★ ${m.scores.renown == null ? '?' : tenths(m.scores.renown)}`, 'val-renown']
      ];
      for (const [, label, val, cls] of bItems) {
        const item = el('span', 'dfo-banner-item');
        item.append(el('span', 'dfo-banner-label', label), el('span', `dfo-banner-val ${cls}`, val));
        banner.append(item);
      }
      body.append(banner);

      const chips = el('div', 'dfo-dungeon-chips');
      if (m.blocked > 0) chips.append(el('span', 'dfo-chip chip-red', T('dungeon.chip.blocked', { pct: pct(m.blocked) })));
      if (m.scores.loot >= 4) chips.append(el('span', 'dfo-chip chip-teal', m.scores.loot >= 5 ? T('dungeon.chip.lootGreat') : T('dungeon.chip.lootGood')));
      if (m.boss >= 0.33) chips.append(el('span', 'dfo-chip chip-gold', T('dungeon.chip.bosses', { pct: pct(m.boss) })));
      if (m.family) {
        const famShort = (root.__dfoUi?.has('dungeon.familyShort.' + m.family) ? T('dungeon.familyShort.' + m.family) : m.family).toUpperCase();
        chips.append(el('span', 'dfo-chip chip-purple', T('dungeon.chip.legendaries', { family: famShort })));
      }
      if (m.aurum != null) {
        const aChip = el('span', 'dfo-chip chip-gold');
        aChip.append(aurumChipIcon(), doc.createTextNode(`AURUM: ${m.aurum}`));
        chips.append(aChip);
      }
      const topVein = m.veins?.reduce((top, v) => !top || v.tier > top.tier ? v : top, null);
      if (topVein && topVein.tier >= 4) {
        const vein = String(topVein.material).replace(':', '-');
        const vName = (root.__dfoUi?.has('dungeon.veinShort.' + vein) ? T('dungeon.veinShort.' + vein) : String(topVein.material).replace(/^(ore|metal):/, '')).toUpperCase();
        chips.append(el('span', 'dfo-chip chip-teal', T('dungeon.chip.vein', { vein: vName })));
      }
      if (m.elite || (m.eliteSlots && m.eliteSlots > 0)) chips.append(el('span', 'dfo-chip chip-purple', T('dungeon.chip.elites')));
      if (m.life?.expires) {
        if (m.life.expired) {
          chips.append(el('span', 'dfo-chip chip-amber', T('dungeon.chip.expired')));
        } else {
          chips.append(el('span', 'dfo-chip chip-amber', T('dungeon.chip.vanishes', { time: m.life.remaining })));
        }
      }
      if (m.life?.cleared) chips.append(el('span', 'dfo-chip chip-amber', T('dungeon.chip.cleared')));
      if (chips.children.length) body.append(chips);

      const cardsGrid = el('div', 'dfo-dg-cards');

      const threatCard = el('div', 'dfo-dg-card is-threat'), threatBody = el('div', 'dfo-dg-card-body');
      const secThreat = el('div', 'dfo-sec-title', T('dungeon.sec.threat', { score: m.scores.threat ?? '?' }));
      const famCounts = new Map();
      for (const r of m.rows) famCounts.set(r.family, (famCounts.get(r.family) || 0) + r.probability);
      const dominant = [...famCounts].sort((a, b) => b[1] - a[1])[0];
      const domName = dominant ? (M.FAMILY[dominant[0]] || dominant[0]) : T('dungeon.mixedEnemies');
      paragraph(threatBody, T('dungeon.threat.summary', { level: m.level, mean: M.number(m.meanLevel), family: domName, share: pct(dominant?.[1]), hp: mult(m.hp), damage: mult(m.damage) }));
      if (m.weaponMetal == null) {
        paragraph(threatBody, T('dungeon.weapon.unknown'));
      } else if (!m.ready) {
        paragraph(threatBody, T('dungeon.weapon.tablePartial'));
      } else if (m.blocked > 0) {
        const pNode = el('div', 'p');
        const warning = el('span', '', T('dungeon.weapon.blocked', { pct: pct(m.blocked) })); warning.style.color = '#ff9f98';
        pNode.append(doc.createTextNode(T('dungeon.weapon.inHand', { weapon: m.weaponName || M.METALS[m.weaponMetal] || T('dungeon.metalWord') })), warning, doc.createTextNode(T('dungeon.weapon.needsBetter')));
        threatBody.append(pNode);
      } else {
        paragraph(threatBody, T('dungeon.weapon.allHurt', { weapon: m.weaponName || M.METALS[m.weaponMetal] || T('dungeon.metalWord') }));
      }
      threatCard.append(secThreat, threatBody);

      const lootCard = el('div', 'dfo-dg-card is-loot'), lootBody = el('div', 'dfo-dg-card-body');
      const secLoot = el('div', 'dfo-sec-title', T('dungeon.sec.loot', { score: m.scores.loot ?? '?' }));
      if (!m.lootOn) paragraph(lootBody, T('dungeon.loot.off'));
      else if (m.chances) paragraph(lootBody, T('dungeon.loot.chances', { rank: m.rank ?? '?', magic: pct(m.chances.magic / 1000), rare: pct(m.chances.rare / 1000), legendary: pct(m.chances.legendary / 1000) }));
      else paragraph(lootBody, T('dungeon.loot.chancesUnknown'));
      paragraph(lootBody, T('dungeon.loot.bosses', { pct: pct(m.boss) }));
      if (m.family) paragraph(lootBody, T('dungeon.loot.family', { family: M.FAMILY[m.family] || m.family }));
      lootCard.append(secLoot, lootBody);

      const growthCard = el('div', 'dfo-dg-card is-growth'), growthBody = el('div', 'dfo-dg-card-body');
      const secGrowth = el('div', 'dfo-sec-title', T('dungeon.sec.growth', { score: m.scores.growth ?? '?' }));
      if (m.scores.growth == null) {
        paragraph(growthBody, T('dungeon.growth.noData'));
      } else if (m.bestSkill <= 100) {
        paragraph(growthBody, T('dungeon.growth.below100', { size: m.size }));
      } else {
        paragraph(growthBody, T('dungeon.growth.above100', { skill: m.bestSkill, weight: m.growthWeight != null ? M.number(m.growthWeight, 2) : T('dungeon.unknown') }));
      }
      growthCard.append(secGrowth, growthBody);

      const renownCard = el('div', 'dfo-dg-card is-renown'), renownBody = el('div', 'dfo-dg-card-body');
      const secRenown = el('div', 'dfo-sec-title', T('dungeon.sec.renown', { score: m.scores.renown != null ? tenths(m.scores.renown) : '?' }));
      if (!m.online) {
        paragraph(renownBody, T('dungeon.renown.offline'));
      } else {
        paragraph(renownBody, m.xp == null ? T('dungeon.renown.unknown') : T('dungeon.renown.average', { xp: M.number(m.xp, 0) }));
      }
      renownCard.append(secRenown, renownBody);

      cardsGrid.append(threatCard, lootCard, growthCard, renownCard);
      body.append(cardsGrid);
      paragraph(body, T('dungeon.personalNote'), 'dfo-dungeon-personal');
    } else if (tab === 'inhabitants') {
      paragraph(body, T('dungeon.roster.forecast', { level: m.level, choice: m.alternate ? T('dungeon.pick.alternate') : T('dungeon.pick.classic'), tables: m.choices > 1 ? T('dungeon.roster.average', { n: m.choices }) : T('dungeon.roster.oneTable') }));
      table(body, [T('dungeon.col.enemy'), T('dungeon.col.share'), T('dungeon.col.level'), T('dungeon.col.hpDamage'), T('dungeon.col.challenge'), T('dungeon.col.metal')], m.rows.map(r => {
        const metalText = r.minMetal < 0 ? T('dungeon.anyMetal') : T('dungeon.metalOrBetter', { metal: M.METALS[r.minMetal] || r.minMetal });
        return [
          tr(r.name),
          pct(r.probability),
          r.level,
          `${mult(r.hp)} / ${mult(r.damage)}`,
          M.number(r.challenge),
          r.blocked ? { text: metalText, color: '#ff9f98' } : metalText
        ];
      }));
      paragraph(body, T('dungeon.roster.bossNote'));
      paragraph(body, T('dungeon.roster.eliteNote'));
      if (m.eliteSlots != null) paragraph(body, T('dungeon.roster.eliteSlots', { n: m.eliteSlots }));
    } else if (tab === 'loot') {
      table(body, [T('dungeon.col.parameter'), T('dungeon.col.value')], [[T('dungeon.loot.rank'), m.rank], [T('dungeon.loot.luck'), m.luck], [T('dungeon.loot.eliteQuality'), m.elite ? '×1,2' : '×1'], [T('dungeon.loot.bossShare'), pct(m.boss)], [T('dungeon.loot.raritySystem'), m.lootOn ? T('dungeon.on') : T('dungeon.off')]]);
      if (m.chances) table(body, [T('dungeon.loot.threshold'), T('dungeon.col.chance')], [[T('dungeon.loot.atLeastMagic'), `${M.number(m.chances.magic / 10, 2)}%`], [T('dungeon.loot.atLeastRare'), `${M.number(m.chances.rare / 10, 2)}%`], [T('dungeon.loot.atLeastLegendary'), `${M.number(m.chances.legendary / 10, 2)}%`]]);
      paragraph(body, T('dungeon.loot.thresholdNote'));
      section(body, T('dungeon.loot.preferred'));
      paragraph(body, m.family ? T('dungeon.loot.preferredText', { family: M.FAMILY[m.family] || m.family }) : T('dungeon.loot.noFamily'));
      if (m.signatures.length) table(body, [T('dungeon.col.item'), 'ID'], m.signatures.map(r => [tr(r.name), r.id]));
      paragraph(body, T('dungeon.loot.sourcesNote'));
    } else if (tab === 'growth') {
      section(body, T('dungeon.growth.scaling'));
      table(body, [T('dungeon.growth.forecast'), T('dungeon.col.value')], [
        [T('dungeon.growth.meanLevel'), M.number(m.meanLevel)],
        [T('dungeon.growth.meanHp'), mult(m.hp)],
        [T('dungeon.growth.meanDamage'), mult(m.damage)],
        [T('dungeon.growth.bestSkill'), m.scores.growth == null ? null : m.bestSkill],
        [T('dungeon.growth.weight'), M.number(m.growthWeight, 2)]
      ]);
      const shareVal = m.share;
      paragraph(body, T('dungeon.growth.share', { type: m.typeName, pct: pct(shareVal) }));
      section(body, T('dungeon.growth.above100Title'));
      paragraph(body, T('dungeon.growth.above100Text'));
      paragraph(body, T('dungeon.growth.yours', { skill: m.bestSkill || T('dungeon.notDetermined'), weight: m.growthWeight != null ? M.number(m.growthWeight, 2) : T('dungeon.unknown') }));
      paragraph(body, T('dungeon.growth.note'));
    } else if (tab === 'intel') {
      const regionName = p.loc.regionName || safe(() => root.__dfoWorld.maps().getRegionName(p.loc.regionIndex));
      table(body, [T('dungeon.col.place'), T('dungeon.col.data')], [
        [T('dungeon.details.type'), m.typeName],
        [T('dungeon.details.size'), m.size],
        [T('dungeon.details.blocks'), p.loc.dungeon?.blocks?.length],
        [T('dungeon.details.level'), m.elite ? T('dungeon.eliteLower') : T('dungeon.ordinaryLower')],
        [T('dungeon.details.origin'), m.life.text],
        [T('dungeon.details.region'), tr(regionName) || p.loc.regionIndex],
        [T('dungeon.details.mapId'), keyOf(p.loc)],
        [T('dungeon.details.mapCoords'), `${p.px}, ${p.py}`],
        [T('dungeon.details.respawn'), m.respawn == null ? null : T('dungeon.minutes', { n: M.number(m.respawn / 60000) })]
      ]);
      if (m.life.expires) paragraph(body, T('dungeon.life.deadline', { when: when(m.life.expires), timer: m.life.timerText || T('dungeon.expired'), log: m.life.cleared ? T('dungeon.life.clearedLog') : T('dungeon.life.firstEntry') }));
      else if (p.loc.spawned) paragraph(body, T('dungeon.life.noRecord'));

      section(body, T('dungeon.aurum.title'));
      paragraph(body, !m.online ? T('dungeon.aurum.online') : m.aurum == null ? T('dungeon.aurum.unknown') : T('dungeon.aurum.reward', { n: m.aurum }) + (m.aurumTaken === true ? T('dungeon.aurum.taken') : m.aurumTaken === false ? T('dungeon.aurum.notTaken') : ''));
      if (m.veins) table(body, [T('dungeon.col.vein'), T('dungeon.col.material'), T('dungeon.col.level')], m.veins.map((r, i) => [i + 1, M.MATERIALS[r.material] || r.material, r.tier]));
      else paragraph(body, T('dungeon.veins.none'));
      paragraph(body, T('dungeon.veins.note'));

      section(body, T('dungeon.quests.title'));
      const bounties = safe(() => host.bountyHost.mapMarks(), []).filter(b => Math.floor(b.cx) === p.px && Math.floor(b.cy) === p.py);
      if (bounties.length) paragraph(body, bounties.map(b => tr(b.label || T('dungeon.quests.bounty'))).join('; '));
      const quests = questMarks.filter(r => r.key === `quest:${p.px},${p.py}`);
      if (quests.length) paragraph(body, T('dungeon.quests.mark', { quests: quests.map(r => tr(r.label)).join('; ') }));
      if (!bounties.length && !quests.length) paragraph(body, T('dungeon.quests.none'));

      const poseOf = peer => peer.p ?? peer.pose ?? peer, roomOf = peer => peer.room ?? poseOf(peer).room;
      const peers = safe(() => host.social?.others?.(), []).filter(peer => {
        const pose = poseOf(peer);
        return new RegExp(`^dungeon:m${keyOf(p.loc)}(?:\\.[sm])?$`).test(roomOf(peer) || '')
          || (pose.in === 1 && pose.px === p.px && pose.py === p.py && pose.loc === p.loc.name);
      });
      const bar = (pose, now, max) => typeof pose[now] === 'number' ? `${pose[now]}${typeof pose[max] === 'number' ? ' / ' + pose[max] : ''}` : null;
      if (peers.length) {
        table(body, [T('dungeon.party.member'), T('dungeon.party.health'), T('dungeon.party.magicka'), T('dungeon.party.fatigue'), T('dungeon.party.room')], peers.map(r => { const q = poseOf(r); return [r.name || T('dungeon.party.member'), bar(q, 'h', 'hm'), bar(q, 'm', 'mm'), bar(q, 'f', 'fm'), roomOf(r) || q.ins || T('dungeon.party.pose')]; }));
      } else {
        paragraph(body, T('dungeon.party.none'));
      }

      section(body, T('dungeon.visits.title'));
      if (!m.note) {
        paragraph(body, T('dungeon.visits.none'));
      } else {
        paragraph(body, T('dungeon.visits.seen', { when: when(m.note.at), mode: m.note.online ? T('dungeon.online') : T('dungeon.offline') }));
        table(body, [T('dungeon.visits.last'), T('dungeon.col.count')], [[T('dungeon.visits.alive'), m.note.alive], [T('dungeon.visits.dead'), m.note.dead], [T('dungeon.visits.piles'), m.note.piles], [T('dungeon.visits.bodies'), m.note.corpses], [T('dungeon.visits.doors'), m.note.doors], [T('dungeon.visits.open'), m.note.openDoors]]);
        if (m.note.counts?.length) table(body, [T('dungeon.visits.kind'), T('dungeon.col.count')], m.note.counts.map(r => [tr(tools().enemyName?.(r.type) || T('dungeon.enemy', { id: r.type })), r.count]));
      }
    }
  }
  function render(force = false) {
    if (!current) return;
    const p = records().get(current.key), m = p && model(p), state = current;
    if (!m) { state.modal.status.textContent = T('dungeon.travel.markGone'); if (state.modal.travelBtn) state.modal.travelBtn.disabled = true; return; }
    const distance = distances.get(state.key) || p.distance;
    const signature = JSON.stringify([m, state.tab, readError, cacheError, distance]); if (!force && signature === state.signature) return;
    state.signature = signature; state.place = p;
    state.modal.heading.textContent = m.name || T('dungeon.dungeon');
    if (state.modal.subNode) {
      state.modal.subNode.replaceChildren();
      const tag = el('span', 'dfo-dungeon-tag', T('dungeon.tag', { type: m.typeName, rank: m.rank ?? '?' }));
      tag.style.color = m.color;
      const lifeInfo = m.life.kind === 'spawned' ? (m.life.timerText ? T('dungeon.spawnedShort', { timer: m.life.timerText }) : m.life.text) : T('dungeon.permanentShort');
      const subText = el('span', '', T('dungeon.subtitle', { size: m.size, kind: m.elite ? T('dungeon.elite') : T('dungeon.ordinary'), life: lifeInfo, distance: distance ? ' · ' + distance : '' }));
      state.modal.subNode.append(tag, subText);
    }
    if (state.modal.travelBtn) {
      state.modal.travelBtn.disabled = state.travelling;
      state.modal.travelBtn.onclick = async () => {
        if (state.travelling) return;
        if (!viewReady()) { closeAll(); return; }
        const live = records().get(state.key);
        if (!live) { state.modal.status.textContent = T('dungeon.markGone'); state.modal.travelBtn.disabled = true; return; }
        state.travelling = true; state.modal.travelBtn.disabled = true;
        state.message = '';
        try {
          const ok = await tools().travel?.(live);
          if (ok) closeAll();
          else state.modal.status.textContent = state.message = T('dungeon.travel.refused');
        } catch (e) {
          state.modal.status.textContent = state.message = e.message || String(e);
        } finally {
          state.travelling = false;
          if (state.modal.travelBtn?.isConnected) state.modal.travelBtn.disabled = false;
        }
      };
    }
    for (const [id, b] of state.tabs) {
      const yes = id === state.tab;
      b.setAttribute('aria-selected', String(yes));
      b.classList.toggle('on', yes);
      b.tabIndex = yes ? 0 : -1;
    }
    const scroll = state.body.scrollTop;
    state.body.replaceChildren();
    contents(state.body, state.tab, m, p);
    state.body.scrollTop = scroll;
    state.body.setAttribute('aria-labelledby', `dfo-dungeon-tab-${state.tab}`);
    state.modal.status.textContent = readError || cacheError || state.message || '';
  }
  function open(key) {
    if (!viewReady()) return false;
    const p = records().get(key); if (!p) return false;
    void loadNotes();
    if (current) { current.key = key; current.tab = 'overview'; render(true); return true; }
    const m = modal(p.loc.name || T('dungeon.dungeon'));
    const tabs = m.tabsWrap, body = m.body;
    body.id = 'dfo-dungeon-content';
    current = { modal: m, key, tab: 'overview', tabs: new Map(), body, travelling: false, signature: '' };
    for (const [id, word] of TABS) {
      const b = btn(word, () => { if (current) { current.tab = id; render(true); } });
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', body.id);
      b.id = `dfo-dungeon-tab-${id}`;
      tabs.append(b);
      current.tabs.set(id, b);
    }
    m.footerBtns.append(btn(T('dungeon.guide'), guide), btn(T('dungeon.close'), m.close));
    render(true);
    return true;
  }
  function closeAll() { for (const m of [...stack].reverse()) m.close(); }
  async function loadNotes() {
    if (loadStarted) return; loadStarted = true;
    try { const r = await root.fetch('/dfo-mod/dungeon-notes', { cache: 'no-store' }); if (!r.ok) throw new Error(T('dungeon.visits.readFailed')); const value = await r.json(); for (const v of value.notes || []) { const n = M.cleanNote(v); if (n && (!notes[n.id] || notes[n.id].at < n.at)) notes[n.id] = n; } readError = ''; }
    catch (e) { readError = e.message; loadStarted = false; }
  }
  function observe() {
    const t = tools(), modes = t.modes?.();
    if (Date.now() < retryObservationAt) return;
    if (modes?.mode !== 'dungeon') return;
    const loc = modes.dungeonLocation, ctx = modes.dungeonCtx; if (!allowed(loc) || !ctx?.foes) return;
    const counts = new Map(); let alive = 0, dead = 0;
    for (const f of ctx.foes) { const id = f.src?.mobileType ?? f.entity?.mobileType; if (!Number.isInteger(id) || f.src?.allied || f.companion != null) continue; counts.set(id, (counts.get(id) || 0) + 1); if (f.dead || f.corpse) dead++; else alive++; }
    const targets = safe(() => ctx.lootTargets(), null), objects = safe(() => [...ctx.actions.objects.values()], null);
    const doors = objects ? objects.filter(r => r.kind === 'door') : null;
    const value = M.cleanNote({
      id: keyOf(loc), at: Date.now(), online: t.online(), counts: [...counts].map(([type, count]) => ({ type, count })), alive, dead,
      piles: targets ? targets.filter(r => /^(loot|droppedLoot):/.test(r.key)).length : null, corpses: targets ? targets.filter(r => /^corpse:/.test(r.key)).length : null,
      doors: doors ? doors.length : null, openDoors: doors ? doors.filter(r => r.state === 'end').length : null
    });
    if (!value) return;
    const signature = JSON.stringify({ ...value, at: 0 });
    if (signature === lastObservation && Date.now() - lastSaved < 30000) return;
    lastObservation = signature; lastSaved = Date.now(); notes[value.id] = value;
    root.fetch('/dfo-mod/dungeon-notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }).then(r => { if (!r.ok) throw new Error(T('dungeon.visits.saveFailed')); cacheError = ''; }).catch(e => { cacheError = e.message; lastObservation = ''; retryObservationAt = Date.now() + 30000; });
  }
  function liveInfo(details = true) {
    const t = tools(), modes = t.modes?.();
    if (modes?.mode !== 'dungeon' || modes.transitioning) return null;
    const live = modes.dungeonCtx?.dfoDungeonLive; if (!live) return null;
    if (!details) return { live, world: t, tools: t, heading: null };
    const p = [...records().values()].find(p => keyOf(p.loc) === keyOf(live.location));
    const value = p ? safe(() => model(p)) : null;
    const heading = value ? { title: value.title, subtitle: value.metadata, rating: scoreText(value), model: value }
      : markHeadings.get(keyOf(live.location)) || safe(() => { const m = M.forecast({ loc: live.location }, t.player?.(), t); return { title: m.title, subtitle: m.metadata, rating: scoreText(m), model: m }; });
    return { live, world: t, tools: t, heading };
  }
  root.__dfoDungeons = {
    register(value) { if (host && host !== value) { closeAll(); distances.clear(); markHeadings.clear(); } host = value; lastObservation = ''; retryObservationAt = 0; void loadNotes(); }, decorate, sprite, box, open, closeAll, ensureStyles: styles, liveInfo,
    isOpen: () => stack.length > 0, state: () => ({ key: current?.key ?? null, tab: current?.tab ?? null })
  };
  root.setInterval(() => { if (!host) return; safe(observe); if (current) { if (!viewReady()) closeAll(); else safe(() => render()); } }, 1500);
})(globalThis);
