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
      return { ...mark, label: value.title, sub: `${metadata}; ${rating}`, pick: true,
        dfoDungeon: { model: value, metadata, distance, signature },
        tip: () => ({ title: value.name, lines: [T('dungeon.tip.click'), T('dungeon.tip.personal'), T('dungeon.tip.travel')] }) };
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

  function styles() {
    if (doc.getElementById('dfo-dungeon-style')) return;
    const node = el('style'); node.id = 'dfo-dungeon-style'; node.textContent = `
.dfo-dungeon-dialog{box-sizing:border-box;position:fixed;inset:0;margin:auto;color:var(--bone,#f1e6c8);font-family:var(--data,'Pixelify Sans',system-ui,sans-serif);background:linear-gradient(180deg,rgba(20,26,31,.985),rgba(13,17,21,.985));border:1px solid rgba(192,138,62,.35);border-radius:3px;box-shadow:0 8px 32px rgba(0,0,0,.85);width:min(880px,94vw);max-height:min(820px,90vh);overflow:hidden;padding:0;display:flex;flex-direction:column}
.dfo-dungeon-dialog::backdrop{background:rgba(0,0,0,.7)}
.dfo-dungeon-dialog.dfo-dungeon-guide{width:min(740px,92vw);max-height:min(720px,86vh)}
.dfo-dungeon-dialog .wh{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;border-bottom:1px solid rgba(192,138,62,.2);background:rgba(18,21,26,.6);user-select:none;flex-shrink:0}
.dfo-dungeon-dialog .wh .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;text-transform:uppercase}
.dfo-dungeon-header-left{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
.dfo-dungeon-title{font-size:19px;font-weight:700;color:#f2e4c0;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dfo-dungeon-subtitle{font-size:12px;color:#9aa0a6;display:flex;align-items:baseline;gap:6px;flex-wrap:wrap}
.dfo-dungeon-tag{font-weight:600}
.dfo-dungeon-header-right{display:flex;align-items:center;gap:8px;flex-shrink:0}
.dfo-btn-travel{cursor:pointer;padding:6px 14px;font:inherit;font-size:13px;font-weight:600;color:#7fe3b5;background:#1b4d3e;border:1px solid #2e8b6b;border-radius:2px;transition:all .15s;display:inline-flex;align-items:center;gap:6px}
.dfo-btn-travel:hover{background:#256653;border-color:#38b289;color:#a3f7cc}
.dfo-btn-travel:disabled{opacity:.5;cursor:wait}
.dfo-dungeon-dialog .wh button.dfo-win-x{background:none;border:0;color:#8e9297;cursor:pointer;font:inherit;font-size:18px;padding:4px 8px;border-radius:2px;line-height:1;transition:color .15s,background .15s}
.dfo-dungeon-dialog .wh button.dfo-win-x:hover{color:#fff;background:rgba(255,255,255,.08)}

.dfo-dungeon-dialog .tabs{display:flex;flex-wrap:wrap;gap:4px;padding:6px 14px;border-bottom:1px solid rgba(192,138,62,.2);background:rgba(16,20,25,.5);flex-shrink:0}
.dfo-dungeon-dialog .tabs button{padding:6px 14px;cursor:pointer;color:var(--dim,#a9a08a);background:rgba(35,42,50,.5);border:1px solid transparent;border-radius:2px;font:inherit;font-size:12px;letter-spacing:.03em;transition:all .15s}
.dfo-dungeon-dialog .tabs button:hover{color:var(--bone,#f1e6c8);background:rgba(48,57,68,.6)}
.dfo-dungeon-dialog .tabs button.on,.dfo-dungeon-dialog .tabs button[aria-selected="true"]{color:var(--bone,#f1e6c8);background:rgba(46,112,91,.35);border-color:rgba(46,112,91,.8);box-shadow:inset 0 0 6px rgba(46,112,91,.25)}

.dfo-dungeon-dialog .wb{overflow-y:auto;overscroll-behavior:contain;padding:14px 18px 16px;font-size:12.5px;line-height:1.5;min-height:0;flex:1}
.dfo-dungeon-dialog .sec{margin:12px 0 4px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim,#a9a08a)}
.dfo-dungeon-dialog .sec:first-child{margin-top:2px}
.dfo-dungeon-dialog .p{opacity:.9;font-size:12px;margin:4px 0 6px;color:var(--bone,#e8dcc0);line-height:1.5}
.dfo-dungeon-dialog .dfo-dungeon-personal{color:#8e9297;font-size:11.5px;margin-top:14px;padding-top:8px;border-top:1px solid rgba(255,255,255,.06);font-style:normal}

.dfo-dungeon-banner{display:flex;flex-wrap:wrap;gap:20px;align-items:baseline;padding:4px 0 10px;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:10px;font-family:"Segoe UI Symbol","DejaVu Sans",system-ui,sans-serif}
.dfo-banner-item{display:inline-flex;align-items:baseline;gap:6px}
.dfo-banner-label{font-size:11px;font-weight:700;letter-spacing:.08em;color:#9aa0a6;text-transform:uppercase}
.dfo-banner-val{font-size:13px;font-weight:600;letter-spacing:.03em}
.val-threat{color:#ff7066}
.val-loot{color:#f1cd70}
.val-growth{color:#82d98e}
.val-renown{color:#ffffff}

.dfo-dungeon-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
.dfo-chip{padding:3px 8px;font-size:11px;font-weight:600;letter-spacing:.05em;border-radius:2px;text-transform:uppercase;display:inline-flex;align-items:center;border-width:1px;border-style:solid}
.chip-red{border-color:#c53030;color:#ff8888;background:rgba(197,48,48,.12)}
.chip-teal{border-color:#319795;color:#4fd1c5;background:rgba(49,151,149,.12)}
.chip-gold{border-color:#b7791f;color:#ecc94b;background:rgba(183,121,31,.12)}
.chip-purple{border-color:#6b46c1;color:#b794f4;background:rgba(107,70,193,.12)}
.chip-amber{border-color:#dd6b20;color:#f6ad55;background:rgba(221,107,32,.12)}

.dfo-sec-title{margin:14px 0 4px;font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;display:flex;align-items:center;gap:6px}

.dfo-dungeon-dialog table{border-collapse:collapse;width:100%;margin:4px 0 10px;font-size:12px}
.dfo-dungeon-dialog th{text-align:left;font-weight:normal;color:var(--dim,#a9a08a);border-bottom:1px solid rgba(192,138,62,.25);padding:4px 8px;white-space:nowrap}
.dfo-dungeon-dialog td{padding:4px 8px;border-bottom:1px solid rgba(255,255,255,.05);vertical-align:top}
.dfo-dungeon-table{max-width:100%;overflow-x:auto}

.dfo-dungeon-dialog .acts{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:8px 14px;border-top:1px solid rgba(192,138,62,.2);background:rgba(16,20,25,.7);flex-shrink:0}
.dfo-dungeon-footer-btns{display:flex;gap:8px;margin-left:auto}
.dfo-dungeon-dialog .acts button,.dfo-dungeon-dialog button.dfo-btn{cursor:pointer;padding:6px 14px;font:inherit;font-size:12px;color:var(--bone,#f1e6c8);background:rgba(43,50,59,.5);border:1px solid rgba(192,138,62,.4);border-radius:2px;transition:all .15s}
.dfo-dungeon-dialog .acts button:hover,.dfo-dungeon-dialog button.dfo-btn:hover{background:rgba(78,127,114,.45);border-color:rgba(192,138,62,.8);color:#fff}
.dfo-dungeon-status{color:#ffaea4;min-height:1.4em;font-size:11.5px}
`; doc.head.append(node);
  }
  function modal(title, opts = {}) {
    styles(); const prior = doc.activeElement;
    const guide = opts.guide === true;
    const node = el('dialog', `dfo-panel dfo-win dfo-dungeon-dialog${guide ? ' dfo-dungeon-guide' : ''}`);
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
  function guide() {
    const m = modal(T('dungeon.guide.title'), { guide: true }), b = m.content;
    paragraph(b, T('dungeon.guide.intro'));
    section(b, T('dungeon.guide.threat'));
    paragraph(b, T('dungeon.guide.threatText'));
    paragraph(b, T('dungeon.guide.threatFormula'));
    section(b, T('dungeon.guide.loot'));
    paragraph(b, T('dungeon.guide.lootText'));
    section(b, T('dungeon.guide.growth'));
    paragraph(b, T('dungeon.guide.growthText'));
    section(b, T('dungeon.guide.renown'));
    paragraph(b, T('dungeon.guide.renownText'));
    section(b, T('dungeon.guide.known'));
    paragraph(b, T('dungeon.guide.knownText'));
    paragraph(b, T('dungeon.guide.unknownText'));
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
      if (m.blocked > 0) chips.append(el('span', 'dfo-chip chip-red', T('dungeon.chip.blocked',{pct:pct(m.blocked)})));
      if (m.scores.loot >= 4) chips.append(el('span', 'dfo-chip chip-teal', m.scores.loot >= 5 ? T('dungeon.chip.lootGreat') : T('dungeon.chip.lootGood')));
      if (m.boss >= 0.33) chips.append(el('span', 'dfo-chip chip-gold', T('dungeon.chip.bosses',{pct:pct(m.boss)})));
      if (m.family) {
        const famShort = (root.__dfoUi?.has('dungeon.familyShort.' + m.family) ? T('dungeon.familyShort.' + m.family) : m.family).toUpperCase();
        chips.append(el('span', 'dfo-chip chip-purple', T('dungeon.chip.legendaries',{family:famShort})));
      }
      if (m.aurum != null) chips.append(el('span', 'dfo-chip chip-gold', `AURUM: ${m.aurum}`));
      const topVein = m.veins?.reduce((top, v) => !top || v.tier > top.tier ? v : top, null);
      if (topVein && topVein.tier >= 4) {
        const vein = String(topVein.material).replace(':', '-');
        const vName = (root.__dfoUi?.has('dungeon.veinShort.' + vein) ? T('dungeon.veinShort.' + vein) : String(topVein.material).replace(/^(ore|metal):/, '')).toUpperCase();
        chips.append(el('span', 'dfo-chip chip-teal', T('dungeon.chip.vein',{vein:vName})));
      }
      if (m.elite || (m.eliteSlots && m.eliteSlots > 0)) chips.append(el('span', 'dfo-chip chip-purple', T('dungeon.chip.elites')));
      if (m.life?.expires) {
        if (m.life.expired) {
          chips.append(el('span', 'dfo-chip chip-amber', T('dungeon.chip.expired')));
        } else {
          chips.append(el('span', 'dfo-chip chip-amber', T('dungeon.chip.vanishes',{time:m.life.remaining})));
        }
      }
      if (m.life?.cleared) chips.append(el('span', 'dfo-chip chip-amber', T('dungeon.chip.cleared')));
      if (chips.children.length) body.append(chips);

      const secThreat = el('div', 'dfo-sec-title', T('dungeon.sec.threat',{score:m.scores.threat ?? '?'}));
      secThreat.style.color = '#ff8880';
      body.append(secThreat);
      const famCounts = new Map();
      for (const r of m.rows) famCounts.set(r.family, (famCounts.get(r.family) || 0) + r.probability);
      const dominant = [...famCounts].sort((a, b) => b[1] - a[1])[0];
      const domName = dominant ? (M.FAMILY[dominant[0]] || dominant[0]) : T('dungeon.mixedEnemies');
      paragraph(body, T('dungeon.threat.summary',{level:m.level,mean:M.number(m.meanLevel),family:domName,share:pct(dominant?.[1]),hp:mult(m.hp),damage:mult(m.damage)}));
      if (m.weaponMetal == null) {
        paragraph(body, T('dungeon.weapon.unknown'));
      } else if (!m.ready) {
        paragraph(body, T('dungeon.weapon.tablePartial'));
      } else if (m.blocked > 0) {
        const pNode = el('div', 'p');
        const warning = el('span', '', T('dungeon.weapon.blocked',{pct:pct(m.blocked)})); warning.style.color = '#ff9f98';
        pNode.append(doc.createTextNode(T('dungeon.weapon.inHand',{weapon:m.weaponName || M.METALS[m.weaponMetal] || T('dungeon.metalWord')})), warning, doc.createTextNode(T('dungeon.weapon.needsBetter')));
        body.append(pNode);
      } else {
        paragraph(body, T('dungeon.weapon.allHurt',{weapon:m.weaponName || M.METALS[m.weaponMetal] || T('dungeon.metalWord')}));
      }

      const secLoot = el('div', 'dfo-sec-title', T('dungeon.sec.loot',{score:m.scores.loot ?? '?'}));
      secLoot.style.color = '#f1cd70';
      body.append(secLoot);
      if (!m.lootOn) paragraph(body, T('dungeon.loot.off'));
      else if (m.chances) paragraph(body, T('dungeon.loot.chances',{rank:m.rank ?? '?',magic:pct(m.chances.magic / 1000),rare:pct(m.chances.rare / 1000),legendary:pct(m.chances.legendary / 1000)}));
      else paragraph(body, T('dungeon.loot.chancesUnknown'));
      paragraph(body, T('dungeon.loot.bosses',{pct:pct(m.boss)}));
      if (m.family) {
        paragraph(body, T('dungeon.loot.family',{family:M.FAMILY[m.family] || m.family}));
      }

      const secGrowth = el('div', 'dfo-sec-title', T('dungeon.sec.growth',{score:m.scores.growth ?? '?'}));
      secGrowth.style.color = '#95e79f';
      body.append(secGrowth);
      if (m.scores.growth == null) {
        paragraph(body, T('dungeon.growth.noData'));
      } else if (m.bestSkill <= 100) {
        paragraph(body, T('dungeon.growth.below100',{size:m.size}));
      } else {
        paragraph(body, T('dungeon.growth.above100',{skill:m.bestSkill,weight:m.growthWeight != null ? M.number(m.growthWeight, 2) : T('dungeon.unknown')}));
      }

      const secRenown = el('div', 'dfo-sec-title', T('dungeon.sec.renown',{score:m.scores.renown != null ? tenths(m.scores.renown) : '?'}));
      secRenown.style.color = '#ffffff';
      body.append(secRenown);
      if (!m.online) {
        paragraph(body, T('dungeon.renown.offline'));
      } else {
        paragraph(body, m.xp == null ? T('dungeon.renown.unknown') : T('dungeon.renown.average',{xp:M.number(m.xp, 0)}));
      }

      paragraph(body, T('dungeon.personalNote'), 'dfo-dungeon-personal');
    } else if (tab === 'inhabitants') {
      paragraph(body, T('dungeon.roster.forecast',{level:m.level,choice:m.alternate ? T('dungeon.pick.alternate') : T('dungeon.pick.classic'),tables:m.choices > 1 ? T('dungeon.roster.average',{n:m.choices}) : T('dungeon.roster.oneTable')}));
      table(body, [T('dungeon.col.enemy'), T('dungeon.col.share'), T('dungeon.col.level'), T('dungeon.col.hpDamage'), T('dungeon.col.challenge'), T('dungeon.col.metal')], m.rows.map(r => {
        const metalText = r.minMetal < 0 ? T('dungeon.anyMetal') : T('dungeon.metalOrBetter',{metal:M.METALS[r.minMetal] || r.minMetal});
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
      if (m.eliteSlots != null) paragraph(body, T('dungeon.roster.eliteSlots',{n:m.eliteSlots}));
    } else if (tab === 'loot') {
      table(body, [T('dungeon.col.parameter'), T('dungeon.col.value')], [[T('dungeon.loot.rank'), m.rank], [T('dungeon.loot.luck'), m.luck], [T('dungeon.loot.eliteQuality'), m.elite ? '×1,2' : '×1'], [T('dungeon.loot.bossShare'), pct(m.boss)], [T('dungeon.loot.raritySystem'), m.lootOn ? T('dungeon.on') : T('dungeon.off')]]);
      if (m.chances) table(body, [T('dungeon.loot.threshold'), T('dungeon.col.chance')], [[T('dungeon.loot.atLeastMagic'), `${M.number(m.chances.magic / 10, 2)}%`], [T('dungeon.loot.atLeastRare'), `${M.number(m.chances.rare / 10, 2)}%`], [T('dungeon.loot.atLeastLegendary'), `${M.number(m.chances.legendary / 10, 2)}%`]]);
      paragraph(body, T('dungeon.loot.thresholdNote'));
      section(body, T('dungeon.loot.preferred'));
      paragraph(body, m.family ? T('dungeon.loot.preferredText',{family:M.FAMILY[m.family] || m.family}) : T('dungeon.loot.noFamily'));
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
      paragraph(body, T('dungeon.growth.share',{type:m.typeName,pct:pct(shareVal)}));
      section(body, T('dungeon.growth.above100Title'));
      paragraph(body, T('dungeon.growth.above100Text'));
      paragraph(body, T('dungeon.growth.yours',{skill:m.bestSkill || T('dungeon.notDetermined'),weight:m.growthWeight != null ? M.number(m.growthWeight, 2) : T('dungeon.unknown')}));
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
        [T('dungeon.details.respawn'), m.respawn == null ? null : T('dungeon.minutes',{n:M.number(m.respawn / 60000)})]
      ]);
      if (m.life.expires) paragraph(body, T('dungeon.life.deadline',{when:when(m.life.expires),timer:m.life.timerText || T('dungeon.expired'),log:m.life.cleared ? T('dungeon.life.clearedLog') : T('dungeon.life.firstEntry')}));
      else if (p.loc.spawned) paragraph(body, T('dungeon.life.noRecord'));

      section(body, T('dungeon.aurum.title'));
      paragraph(body, !m.online ? T('dungeon.aurum.online') : m.aurum == null ? T('dungeon.aurum.unknown') : T('dungeon.aurum.reward',{n:m.aurum}) + (m.aurumTaken === true ? T('dungeon.aurum.taken') : m.aurumTaken === false ? T('dungeon.aurum.notTaken') : ''));
      if (m.veins) table(body, [T('dungeon.col.vein'), T('dungeon.col.material'), T('dungeon.col.level')], m.veins.map((r, i) => [i + 1, M.MATERIALS[r.material] || r.material, r.tier]));
      else paragraph(body, T('dungeon.veins.none'));
      paragraph(body, T('dungeon.veins.note'));

      section(body, T('dungeon.quests.title'));
      const bounties = safe(() => host.bountyHost.mapMarks(), []).filter(b => Math.floor(b.cx) === p.px && Math.floor(b.cy) === p.py);
      if (bounties.length) paragraph(body, bounties.map(b => tr(b.label || T('dungeon.quests.bounty'))).join('; '));
      const quests = questMarks.filter(r => r.key === `quest:${p.px},${p.py}`);
      if (quests.length) paragraph(body, T('dungeon.quests.mark',{quests:quests.map(r => tr(r.label)).join('; ')}));
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
        paragraph(body, T('dungeon.visits.seen',{when:when(m.note.at),mode:m.note.online ? T('dungeon.online') : T('dungeon.offline')}));
        table(body, [T('dungeon.visits.last'), T('dungeon.col.count')], [[T('dungeon.visits.alive'), m.note.alive], [T('dungeon.visits.dead'), m.note.dead], [T('dungeon.visits.piles'), m.note.piles], [T('dungeon.visits.bodies'), m.note.corpses], [T('dungeon.visits.doors'), m.note.doors], [T('dungeon.visits.open'), m.note.openDoors]]);
        if (m.note.counts?.length) table(body, [T('dungeon.visits.kind'), T('dungeon.col.count')], m.note.counts.map(r => [tr(tools().enemyName?.(r.type) || T('dungeon.enemy',{id:r.type})), r.count]));
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
      const tag = el('span', 'dfo-dungeon-tag', T('dungeon.tag',{type:m.typeName,rank:m.rank ?? '?'}));
      tag.style.color = m.color;
      const lifeInfo = m.life.kind === 'spawned' ? (m.life.timerText ? T('dungeon.spawnedShort',{timer:m.life.timerText}) : m.life.text) : T('dungeon.permanentShort');
      const subText = el('span', '', T('dungeon.subtitle',{size:m.size,kind:m.elite ? T('dungeon.elite') : T('dungeon.ordinary'),life:lifeInfo,distance:distance ? ' · ' + distance : ''}));
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
    const value = M.cleanNote({ id: keyOf(loc), at: Date.now(), online: t.online(), counts: [...counts].map(([type, count]) => ({ type, count })), alive, dead,
      piles: targets ? targets.filter(r => /^(loot|droppedLoot):/.test(r.key)).length : null, corpses: targets ? targets.filter(r => /^corpse:/.test(r.key)).length : null,
      doors: doors ? doors.length : null, openDoors: doors ? doors.filter(r => r.state === 'end').length : null });
    if (!value) return;
    const signature = JSON.stringify({ ...value, at: 0 });
    if (signature === lastObservation && Date.now() - lastSaved < 30000) return;
    lastObservation = signature; lastSaved = Date.now(); notes[value.id] = value;
    root.fetch('/dfo-mod/dungeon-notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }).then(r => { if (!r.ok) throw new Error(T('dungeon.visits.saveFailed')); cacheError = ''; }).catch(e => { cacheError = e.message; lastObservation = ''; retryObservationAt = Date.now() + 30000; });
  }
  function liveInfo(details = true) {
    const t = tools(), modes = t.modes?.();
    if (modes?.mode !== 'dungeon' || modes.transitioning) return null;
    const live = modes.dungeonCtx?.dfoDungeonLive;if (!live) return null;
    if (!details) return { live, world: t, tools: t, heading: null };
    const p = [...records().values()].find(p => keyOf(p.loc) === keyOf(live.location));
    const value = p ? safe(() => model(p)) : null;
    const heading = value ? { title: value.title, subtitle: value.metadata, rating: scoreText(value), model: value }
      : markHeadings.get(keyOf(live.location)) || safe(() => { const m = M.forecast({loc:live.location}, t.player?.(), t);return {title:m.title,subtitle:m.metadata,rating:scoreText(m),model:m}; });
    return { live, world: t, tools: t, heading };
  }
  root.__dfoDungeons = { register(value) { if (host && host !== value) { closeAll(); distances.clear(); markHeadings.clear(); } host = value; lastObservation = ''; retryObservationAt = 0; void loadNotes(); }, decorate, sprite, box, open, closeAll, ensureStyles: styles, liveInfo,
    isOpen: () => stack.length > 0, state: () => ({ key: current?.key ?? null, tab: current?.tab ?? null }) };
  root.setInterval(() => { if (!host) return; safe(observe); if (current) { if (!viewReady()) closeAll(); else safe(() => render()); } }, 1500);
})(globalThis);
