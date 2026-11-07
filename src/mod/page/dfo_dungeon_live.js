(function (root) {
  'use strict';
  // The mod's own words, in the install's language (page/dfo_ui_text.js; English without the translation).
  const T = (key, params) => (root.__dfoUi ? root.__dfoUi.t(key, params) : key);
  if (root.__dfoDungeonLive || root.__DFO_MOD_CFG__?.dungeons?.enabled === false) return;
  const doc = root.document, M = root.__dfoDungeonLiveModel, cfg = root.__DFO_MOD_CFG__?.dungeons || {};
  const code = cfg.keyCode || 'KeyK', mouse = ({ Mouse3: 1, Mouse4: 3, Mouse5: 4 })[code];
  const tabs = [['summary', T('live.tab.summary')], ['enemies', T('live.tab.enemies')], ['loot', T('live.tab.loot')], ['prepare', T('live.tab.prep')]];
  let current = null, held = false, mouseOwned = false, mouseHeld = false;
  const tr = s => { try { return root.__translate?.(s) || s; } catch { return s; } };
  const el = (tag, cls, text) => { const n = doc.createElement(tag);if (cls) n.className = cls;if (text != null) n.textContent = text;return n; };
  const button = (text, fn) => { const n = el('button', '', text);n.type = 'button';n.onclick = fn;return n; };
  const paragraph = (body, text, cls = 'p') => body.append(el('div', cls, text));
  const number = n => n == null ? '—' : String(n);
  const info = (details = true) => { try { return root.__dfoDungeons?.liveInfo?.(details) ?? null; } catch { return null; } };
  function styles() {
    root.__dfoDungeons?.ensureStyles?.();
    if (doc.getElementById('dfo-dungeon-live-style')) return;
    const s = el('style');s.id = 'dfo-dungeon-live-style';s.textContent = `
.dfo-dungeon-live{width:min(980px,94vw);height:min(760px,90dvh);max-height:90dvh}
.dfo-dungeon-live .dfo-dungeon-title{white-space:normal;overflow-wrap:anywhere;font-size:17px}
.dfo-dungeon-live .dfo-live-rating{color:#f1cd70;font-size:12px;white-space:normal}
.dfo-live-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:14px}
.dfo-live-stat{padding:12px;background:rgba(23,31,36,.65);border:1px solid rgba(192,138,62,.3)}
.dfo-live-stat strong{display:block;font-size:28px;color:#f1cd70;line-height:1.2}
.dfo-live-stat span{font-size:12px;color:var(--dim,#a9a08a)}
.dfo-live-quest{display:block;text-align:left;background:transparent;border:0;padding:5px 0;color:#f1cd70;text-decoration:underline;cursor:pointer;font:inherit}
.dfo-dungeon-live td{overflow-wrap:anywhere}.dfo-dungeon-live .acts{gap:4px}
.dfo-dungeon-live .dfo-dungeon-footer-btns{flex-wrap:wrap;justify-content:flex-end}
.dfo-dungeon-hud{position:fixed;right:16px;top:16px;z-index:8;width:min(210px,calc(100vw - 32px));display:grid;gap:6px;pointer-events:none;font:12px var(--data,'Pixelify Sans',system-ui,sans-serif);color:var(--bone,#f1e6c8);line-height:1.4}
.dfo-dungeon-counters{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px 14px;margin:0;padding:10px 12px;background:rgba(16,20,25,.88);border:1px solid rgba(192,138,62,.5);box-shadow:0 3px 12px rgba(0,0,0,.3)}
.dfo-dungeon-counters dt,.dfo-dungeon-counters dd{margin:0}
.dfo-dungeon-counters dd{color:#f1cd70;font-weight:bold;font-variant-numeric:tabular-nums;text-align:right}
.dfo-dungeon-launch{pointer-events:auto;cursor:pointer;font:inherit;line-height:inherit;color:inherit;background:rgba(16,20,25,.88);border:1px solid rgba(192,138,62,.5);padding:8px 10px;width:100%}
.dfo-dungeon-hud[hidden]{display:none}
.dfo-dungeon-launch[hidden]{display:none}
.dfo-nav-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:8px 0}
.dfo-nav-actions button,.dfo-nav-stop{cursor:pointer;padding:8px 10px;font:inherit;color:var(--bone,#f1e6c8);background:rgba(31,47,59,.8);border:1px solid rgba(95,158,189,.45);text-align:left}
.dfo-nav-actions button:hover,.dfo-nav-stop:hover{background:rgba(46,72,91,.8)}
.dfo-nav-actions button[aria-pressed="true"]{color:#b4e8ff;border-color:#63c4ff}
.dfo-nav-actions button:disabled,.dfo-nav-stop:disabled{opacity:.45;cursor:default}
.dfo-nav-select{font:inherit;background:#151e27;color:var(--bone,#f1e6c8);border:1px solid rgba(192,138,62,.4);padding:5px;max-width:100%;margin:4px 0}
@media(max-width:600px){.dfo-live-stats{gap:5px}.dfo-live-stat{padding:7px}.dfo-live-stat strong{font-size:23px}.dfo-dungeon-live .acts button{padding:5px 8px}}
`;doc.head.append(s);
  }
  function table(body, headers, rows) {
    const wrap = el('div', 'dfo-dungeon-table'), t = el('table'), head = el('tr');
    for (const title of headers) { const h = el('th', '', title);h.scope = 'col';head.append(h); }
    const thead = el('thead');thead.append(head);t.append(thead);
    const tbody = el('tbody');for (const values of rows) { const row = el('tr');for (const v of values) row.append(el('td', '', v));tbody.append(row); }t.append(tbody);wrap.append(t);body.append(wrap);
  }
  function quest(uid) {
    const state = current, now = info();if (!state || now?.live.ctx !== state.ctx) { close();return; }
    if (uid != null && !M.quests(now.live.questBridge, now.live.location, now.live.foes,now.live.ctx,now.world.modes?.()?.dfoDungeonQuestSources?.stands).some(q => q.uid === uid)) { state.status.textContent = T('live.quest.gone');return; }
    close();
    if (!now.live.journal(uid)) { open();if (current) current.status.textContent = T('live.journal.failed'); }
  }
  function navigation(body, data) {
    const nav = root.__dfoDungeonNavigation, available = nav?.availability() || {}, state = nav?.state();
    paragraph(body, T('live.nav.title'), 'sec');
    paragraph(body, T('live.nav.help'), 'dfo-dungeon-note');
    if (data.quests.length) {
      const label = el('label', '', T('live.nav.questLabel')), select = el('select', 'dfo-nav-select');select.dataset.navControl = 'quest';select.setAttribute('aria-label', T('live.nav.questSelect'));
      const option = (uid, name) => { const o = el('option', '', name);o.value = uid;select.append(o); };
      option('', T('live.nav.questDefault'));
      for (const [i, q] of data.quests.entries()) option(q.uid, tr(q.name) + (data.quests.filter(x => x.name === q.name).length > 1 ? ' (' + (i + 1) + ')' : ''));
      if (current.navQuest && !data.quests.some(q => q.uid === current.navQuest)) current.navQuest = '';
      select.value = current.navQuest || '';select.onchange = e => { if (current) current.navQuest = e.currentTarget.value; };label.append(select);body.append(label);
    }
    const buttons = el('div', 'dfo-nav-actions');
    for (const [kind, text, reason] of [['exit',T('live.nav.toExit'),T('live.nav.noExit')],['aurum',T('live.nav.toAurum'),T('live.nav.noAurum')],['elite',T('live.nav.toElite'),T('live.nav.noElite')],['quest',T('live.nav.toQuest'),T('live.nav.noQuest')]]) {
      const b = button(text, () => { const uid = kind === 'quest' ? current?.navQuest || null : null;if (nav?.start(kind, uid)) close();else render(true); });
      b.dataset.navControl = kind;b.disabled = !available.ready || !available[kind];b.title = !available.ready ? T('live.nav.preparing') : available[kind] ? '' : reason;b.setAttribute('aria-pressed', String(state?.kind === kind && state.phase !== 'idle'));buttons.append(b);
    }
    body.append(buttons);
    if (state?.phase !== 'idle' && state?.kind) paragraph(body, [tr(state.name), state.distance == null ? '' : T('live.metres', { n: state.distance }), state.message ? T(state.message) : ''].filter(Boolean).join(' · '), 'dfo-dungeon-note');
    const stop = button(T('live.nav.clear'), () => { nav?.stop();render(true); });stop.className = 'dfo-nav-stop';stop.dataset.navControl = 'stop';stop.disabled = !state || state.phase === 'idle';body.append(stop);
  }
  function contents(body, tab, data) {
    const forecast = data.forecast;
    if (tab === 'summary') {
      const stats = el('div', 'dfo-live-stats');
      for (const [label, n] of [[T('live.summary.enemiesLeft'), data.enemies.count], [T('live.summary.elitesLeft'), data.enemies.elites], [T('live.summary.players'), data.players.count]]) {
        const tile = el('div', 'dfo-live-stat');tile.append(el('strong', '', number(n)), el('span', '', label));stats.append(tile);
      }
      body.append(stats);paragraph(body, data.players.note, 'dfo-dungeon-note');
      if (data.enemies.syncing) paragraph(body, T('live.summary.syncing'), 'dfo-dungeon-note');
      const r = data.regen;
      paragraph(body, r.state === 'offline' ? data.online ? T('live.regen.noClock') : T('live.regen.solo')
        : r.state === 'idle' ? T('live.regen.none',{n:r.intervalMinutes})
        : T('live.regen.next',{n:r.minutes,due:r.state === 'due' ? T('live.regen.due') : ''}));
      paragraph(body, T('live.regen.note'), 'dfo-dungeon-note');
      const a = data.aurum;
      paragraph(body, a.state === 'taken' ? T('live.aurum.taken')
        : a.state === 'offline' ? T('live.aurum.online')
        : a.state === 'absent' ? T('live.aurum.none')
        : T('live.aurum.state',{amount:a.amount == null ? T('live.aurum.amountUnknown') : a.amount + ' Aurum',state:a.state === 'unknown' ? T('live.aurum.statePending') : T('live.aurum.stateNoMark')}));
      paragraph(body, T('live.quests.title'), 'sec');
      if (!data.quests.length) paragraph(body, T('live.quests.none'));
      for (const q of data.quests) {
        const link = button(tr(q.name), () => quest(q.uid));link.className = 'dfo-live-quest';link.dataset.quest = q.uid;body.append(link);
        for (const objective of q.objectives) paragraph(body, tr(objective), 'dfo-dungeon-note');
      }
      navigation(body, data);
    } else if (tab === 'enemies') {
      paragraph(body, T('live.enemies.note'), 'dfo-dungeon-note');
      if (!data.enemies.rows.length) paragraph(body, data.enemies.count == null ? T('live.enemies.pending') : T('live.enemies.none'));
      else table(body, [T('live.col.enemy'), T('live.col.left'), T('live.col.level'), T('live.col.traits'), T('live.col.health')], data.enemies.rows.map(r => [tr(r.name), r.count,
        r.minLevel == null ? '—' : r.minLevel === r.maxLevel ? r.minLevel : `${r.minLevel}–${r.maxLevel}`,
        r.mods.map(tr).join(', ') || T('live.trait.ordinary'), r.healthKnown ? `${Math.ceil(r.health)} / ${Math.ceil(r.maxHealth)}` : '—']));
    } else if (tab === 'loot') {
      paragraph(body, T('live.loot.title'), 'sec');
      if (!forecast) { paragraph(body, T('live.loot.special'));return; }
      paragraph(body, T('live.loot.rank',{rank:forecast.rank ?? T('live.unknownM'),luck:forecast.luck ?? T('live.unknownF')}));
      if (forecast.chances) table(body, [T('live.loot.minRarity'), T('live.loot.chance')], [['magic',T('live.loot.atLeastMagic')],['rare',T('live.loot.atLeastRare')],['legendary',T('live.loot.atLeastLegendary')]].map(([k, label]) => [label, `${(forecast.chances[k] / 10).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`]));
      else paragraph(body, T('live.loot.unknown'));
      if (forecast.signatures?.length) { paragraph(body, T('live.loot.preferred'), 'sec');for (const item of forecast.signatures) paragraph(body, tr(item.name)); }
      paragraph(body, T('live.loot.note'), 'dfo-dungeon-note');
    } else {
      paragraph(body, T('live.prep.title'), 'sec');
      if (!forecast) { paragraph(body, T('live.prep.note'));return; }
      paragraph(body, forecast.weaponName ? T('live.prep.weapon',{weapon:tr(forecast.weaponName)}) : T('live.prep.noWeapon'));
      paragraph(body, !forecast.ready ? T('live.prep.noData') : forecast.blocked > 0
        ? T('live.prep.blocked',{pct:Math.round(forecast.blocked * 100)}) : T('live.prep.ok'));
      paragraph(body, forecast.life?.text || '', 'dfo-dungeon-note');
      paragraph(body, T('live.prep.priorities'), 'sec');
      paragraph(body, data.enemies.elites ? T('live.prep.elites',{n:data.enemies.elites}) : T('live.prep.noElites'));
      paragraph(body, T('live.prep.note2'), 'dfo-dungeon-note');
    }
  }
  function patchChildren(parent, source) {
    const key = n => n.nodeType === 1 ? n.dataset.quest || n.dataset.navControl || '' : '';
    const fresh = [...source.childNodes];
    for (let i = 0; i < fresh.length; i++) {
      const next = fresh[i], old = parent.childNodes[i];
      if (!old) { parent.append(next);continue; }
      if (old.nodeType !== next.nodeType || old.nodeName !== next.nodeName || key(old) !== key(next)) { parent.replaceChild(next, old);continue; }
      if (old.nodeType === 3) { if (old.nodeValue !== next.nodeValue) old.nodeValue = next.nodeValue;continue; }
      const selectValue = next.tagName === 'SELECT' ? next.value : null;
      for (const a of [...old.attributes]) if (!next.hasAttribute(a.name)) old.removeAttribute(a.name);
      for (const a of next.attributes) if (old.getAttribute(a.name) !== a.value) old.setAttribute(a.name, a.value);
      old.onclick = next.onclick;old.onchange = next.onchange;
      patchChildren(old, next);
      if (old.tagName === 'SELECT' && doc.activeElement !== old && old.value !== selectValue) old.value = selectValue;
    }
    while (parent.childNodes.length > fresh.length) parent.lastChild.remove();
  }
  function render(force = false) {
    const state = current, now = info();if (!state) return;
    if (!now || now.live.ctx !== state.ctx || state.owner.done || now.live.owns?.(state.owner) === false) { close();return; }
    if (state.pressing) return;
    const data = M.snapshot(now.live, now.world, now.tools, now.heading);if (!data) return;
    const signature = JSON.stringify([state.tab, data, root.__dfoDungeonNavigation?.state(), root.__dfoDungeonNavigation?.availability()]);if (!force && state.signature === signature) return;
    state.signature = signature;state.heading.textContent = data.title;state.subtitle.textContent = data.subtitle;state.rating.textContent = data.rating;
    const scroll = state.body.scrollTop, focused = doc.activeElement?.dataset?.quest, navFocus = doc.activeElement?.dataset?.navControl;
    const next = doc.createDocumentFragment();contents(next, state.tab, data);patchChildren(state.body, next);state.body.scrollTop = scroll;
    state.body.setAttribute('aria-labelledby', 'dfo-live-tab-' + state.tab);
    if (focused) [...state.body.querySelectorAll('[data-quest]')].find(n => n.dataset.quest === focused)?.focus({ preventScroll: true });
    if (navFocus) [...state.body.querySelectorAll('[data-nav-control]')].find(n => n.dataset.navControl === navFocus)?.focus({ preventScroll: true });
    for (const [id, b] of state.tabs) { b.setAttribute('aria-selected', String(id === state.tab));b.classList.toggle('on', id === state.tab);b.tabIndex = id === state.tab ? 0 : -1; }
  }
  function close() {
    const state = current;if (!state) return;current = null;state.owner.done = true;state.live.unmount(state.owner);state.node.close();state.node.remove();
    if (state.prior?.isConnected) state.prior.focus({ preventScroll: true });
  }
  function open() {
    if (current) return false;const now = info();if (!now || now.live.blocked() || root.__dfoDungeons?.isOpen() || root.__dfoLootUI?.isDialogOpen?.()) return false;
    styles();const node = el('dialog', 'dfo-panel dfo-win dfo-dungeon-dialog dfo-dungeon-live'), prior = doc.activeElement;
    const wh = el('div', 'wh'), left = el('div', 'dfo-dungeon-header-left'), heading = el('div', 'dfo-dungeon-title'), subtitle = el('div', 'dfo-dungeon-subtitle'), rating = el('div', 'dfo-live-rating');
    heading.id = 'dfo-dungeon-live-title';node.setAttribute('aria-labelledby', heading.id);left.append(heading, subtitle, rating);wh.append(left);
    const nav = el('div', 'tabs');nav.setAttribute('role', 'tablist');nav.setAttribute('aria-label', T('live.tabs'));
    const body = el('div', 'wb');body.setAttribute('role', 'tabpanel');body.id = 'dfo-dungeon-live-content';
    const foot = el('div', 'acts'), status = el('span', 'dfo-dungeon-status'), actions = el('div', 'dfo-dungeon-footer-btns');status.setAttribute('role', 'status');foot.append(status, actions);
    const owner = { done: false, holdsScreen: true, isChoiceWindow: true, input() {}, click() {}, wheel() {}, hover() {}, tick() {}, draw() {}, close() { if (current?.owner === owner) close(); }, dispose() { this.close(); }, destroy() { this.close(); } };
    if (!now.live.mount(owner)) return false;
    current = { node, ctx: now.live.ctx, live: now.live, owner, prior, heading, subtitle, rating, body, status, tabs: new Map(), tab: 'summary', pressing: false };
    for (const [id, label] of tabs) { const b = button(label, () => { if (current) { current.tab = id;render(true); } });b.setAttribute('role', 'tab');b.setAttribute('aria-controls', body.id);b.id = 'dfo-live-tab-' + id;nav.append(b);current.tabs.set(id, b); }
    const map = button(T('live.automap'), () => { const n = info();if (n?.live.ctx !== current?.ctx) { close();return; }close();n.world.modes?.()?.toggleAutomap?.(); });map.disabled = typeof now.world.modes?.()?.toggleAutomap !== 'function';actions.append(map);
    const journal = button(T('live.journal'), () => quest(null));journal.disabled = !now.live.questBridge;
    actions.append(journal, button(T('live.close'), close));
    node.append(wh, nav, body, foot);node.addEventListener('cancel', e => { e.preventDefault();close(); });
    for (const type of ['click', 'pointerdown', 'mousedown', 'mouseup', 'wheel']) node.addEventListener(type, e => e.stopPropagation());
    node.addEventListener('pointerdown', () => { if (current) current.pressing = true; });
    node.addEventListener('pointerup', () => { if (current) current.pressing = false; });
    doc.body.append(node);launcher.hidden = true;root.dispatchEvent(new Event('blur'));render(true);node.showModal();actions.lastElementChild.focus();return true;
  }
  styles();
  const label = ({ Space: T('live.key.space'), NumpadEnter: 'NumPad Enter' })[code] || code.replace(/^Key|^Digit/, '').replace(/^Numpad/, 'NumPad ').replace(/^Mouse/, T('live.key.mouse'));
  const launcher = button(T('live.launcher') + label, open);launcher.className = 'dfo-dungeon-launch';launcher.hidden = true;
  const hud = el('aside', 'dfo-dungeon-hud'), counterList = el('dl', 'dfo-dungeon-counters'), counterValues = new Map();
  hud.hidden = true;hud.setAttribute('aria-label', T('live.hud'));
  for (const [id, text] of [['enemies', T('live.hud.enemies')], ['elites', T('live.hud.elites')], ['players', T('live.hud.players')]]) {
    const value = el('dd', '', '—');value.dataset.counter = id;counterValues.set(id, value);counterList.append(el('dt', '', text), value);
  }
  hud.append(counterList, launcher);
  if (doc.body) doc.body.append(hud);else doc.addEventListener('DOMContentLoaded', () => doc.body.append(hud), { once: true });
  let pageActive = true;
  function refresh() {
    if (!pageActive) return;
    const n = info(false), data = n && M.counters(n.live, n.world, n.tools);
    hud.hidden = !data;
    if (data) for (const [id, value, partial] of [['enemies', data.enemies.count, data.enemies.syncing], ['elites', data.enemies.elites, data.enemies.syncing], ['players', data.players.count, !data.players.complete]]) {
      const node = counterValues.get(id), text = value == null ? '—' : String(value) + (partial ? '+' : '');
      if (node.textContent !== text) node.textContent = text;
      const description = value == null ? T('live.hud.unknown') : partial ? T('live.hud.partial',{value:value}) : String(value);
      if (node.getAttribute('aria-label') !== description) node.setAttribute('aria-label', description);
    }
    launcher.hidden = !n || !!current || n.live.blocked();
    if (current) render();
  }
  const editing = e => { const selector = 'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]';return !!(e.target?.closest?.(selector) || doc.activeElement?.closest?.(selector)); };
  const consume = e => { e.preventDefault();e.stopImmediatePropagation(); };
  const conflict = root.__DFO_MOD_CFG__?.nearbyLoot?.enabled !== false && (root.__DFO_MOD_CFG__?.nearbyLoot?.keyCode || 'KeyJ') === code;
  if (conflict) launcher.title = T('live.keyClash');
  root.addEventListener('keydown', e => {
    if (current && (current.owner.done || current.live.owns?.(current.owner) === false)) close();
    if (current) {
      e.stopImmediatePropagation();
      if (e.code === 'Escape') { e.preventDefault();if (!e.repeat) close(); }
      else if (e.target?.getAttribute('role') === 'tab' && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
        e.preventDefault();const buttons = [...current.tabs.values()], index = buttons.indexOf(e.target), n = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;buttons[n].click();buttons[n].focus();
      }
      return;
    }
    if (mouse != null || conflict || e.code !== code || e.repeat || held || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || editing(e)) return;
    if (open()) { held = true;consume(e); }
  }, true);
  root.addEventListener('keyup', e => { if (e.code === code && held) { held = false;consume(e); }else if (current) e.stopImmediatePropagation(); }, true);
  const mouseDown = e => {
    if (mouse == null || conflict || e.button !== mouse) return;
    if (mouseOwned && mouseHeld) { consume(e);return; }
    mouseOwned = false;
    if (current) { mouseOwned = mouseHeld = true;consume(e);return; }
    if (editing(e) || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    if (open()) { mouseOwned = mouseHeld = true;consume(e); }
  };
  for (const t of ['pointerdown', 'mousedown']) root.addEventListener(t, mouseDown, true);
  for (const t of ['pointerup', 'mouseup']) root.addEventListener(t, e => { if (mouseOwned && e.button === mouse) { mouseHeld = false;if (current) current.pressing = false;consume(e); } }, true);
  root.addEventListener('auxclick', e => { if (mouseOwned && e.button === mouse) { consume(e);mouseOwned = false; } }, true);
  root.addEventListener('blur', () => { held = mouseOwned = mouseHeld = false;if (current) current.pressing = false; });
  root.addEventListener('pointerup', () => { if (current) current.pressing = false; }, true);
  root.addEventListener('pointercancel', () => { mouseOwned = mouseHeld = false;if (current) current.pressing = false; }, true);
  root.setInterval(refresh, 500);
  root.addEventListener('pagehide', () => { pageActive = false;hud.hidden = true; });
  root.addEventListener('pageshow', () => { pageActive = true;refresh(); });
  root.addEventListener('dfo-navigation-change', () => { if (current) render(); });
  root.__dfoDungeonLive = { open, close, isOpen: () => !!current,
    focusJournal(uid) {
      if (uid == null) return;
      root.requestAnimationFrame(() => {
        const node = [...doc.querySelectorAll('#enhanced-chronicle [data-dfo-quest]')].find(n => n.dataset.dfoQuest === String(uid));
        if (!node) return;node.scrollIntoView({ block: 'start' });node.tabIndex = -1;node.focus({ preventScroll: true });node.setAttribute('aria-label', T('live.quest.chosen'));
      });
    } };
})(globalThis);
