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
.dfo-dungeon-live .dfo-dungeon-title{white-space:normal;overflow-wrap:anywhere;font-size:17.5px}
.dfo-dungeon-live .dfo-live-rating{color:#f5d451;font-size:12px;white-space:normal;font-family:'DFO Flexi',"Segoe UI Symbol",monospace;letter-spacing:.04em}
.dfo-live-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:12px}
:where(.dfo-live-stat){--dfo-panel-c:#d5b26e;--dfo-panel-rgb:213,178,110}
.dfo-live-stat{padding:11px 14px;background-color:var(--dfo-bg-panel,rgba(15,17,22,.92));background-image:linear-gradient(180deg,rgba(var(--dfo-panel-rgb),.15) 0,rgba(var(--dfo-panel-rgb),.04) 40px,transparent 92px);border:2px solid;border-color:var(--dfo-panel-c) #3a352a #25221b #7a7260;box-shadow:0 0 0 1px #050608,inset 0 0 0 1px rgba(5,6,8,.75),3px 3px 0 1px rgba(0,0,0,.4)}
.dfo-live-stat:nth-child(1){--dfo-panel-c:#e2574c;--dfo-panel-rgb:226,87,76}
.dfo-live-stat:nth-child(2){--dfo-panel-c:#b57bee;--dfo-panel-rgb:181,123,238}
.dfo-live-stat:nth-child(3){--dfo-panel-c:#52c298;--dfo-panel-rgb:82,194,152}
.dfo-live-stat strong{display:block;font-family:'DFO Flexi',var(--data,monospace);font-variant-numeric:tabular-nums;font-size:28px;color:#f5d451;line-height:1.18;text-shadow:0 2px 0 #000}
.dfo-live-stat span{display:block;margin-top:2px;font-family:'DFO Gabin',var(--data,serif);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#c9b485}
.dfo-live-stat span::before{content:'◆ ';font-size:8px;color:var(--dfo-panel-c);vertical-align:1px;margin-right:3px}
/* Framed Default Paint Summary & Quests Sub-Panels (#9a9079 stone-pewter; top 3 count tiles stay colored) */
:where(.dfo-live-panel){--dfo-panel-c:#9a9079;--dfo-panel-rgb:154,144,121}
.dfo-live-panel{margin-bottom:10px;overflow:hidden;background-color:var(--dfo-bg-panel,rgba(15,17,22,.92));background-image:linear-gradient(180deg,rgba(var(--dfo-panel-rgb),.08) 0,rgba(var(--dfo-panel-rgb),.024) 40px,transparent 112px);border:2px solid;border-color:var(--dfo-panel-c) #3a352a #25221b #7a7260;box-shadow:0 0 0 1px #050608,inset 0 0 0 1px rgba(5,6,8,.75),2px 2px 0 1px rgba(0,0,0,.38)}
.dfo-live-panel-head{padding:6px 12px;font-family:'DFO Greengoth',var(--display,Georgia,serif);font-size:12px;letter-spacing:.07em;text-transform:uppercase;color:#e7d6a9;background-color:rgba(14,17,22,.68);background-image:linear-gradient(180deg,rgba(var(--dfo-panel-rgb),.12),rgba(var(--dfo-panel-rgb),.025)),var(--dfo-bg-header,linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.015)));border-bottom:1px solid rgba(var(--dfo-panel-rgb),.32);box-shadow:0 1px 0 rgba(0,0,0,.55);text-shadow:0 1px 0 #000}
.dfo-live-panel-head::before{content:'◆ ';font-size:9px;color:#b7a071;vertical-align:1px;margin-right:4px;text-shadow:none}
.dfo-live-panel-body{padding:9px 12px 10px;display:flex;flex-direction:column;gap:5px}
.dfo-live-panel-body .p,.dfo-live-panel-body .dfo-dungeon-note{margin:0;font-size:12.5px;line-height:1.45}
.dfo-live-panel-body .dfo-dungeon-note{color:#c9bfa9;font-size:12px}
.dfo-live-quest{display:block;text-align:left;background:rgba(154,144,121,.07);border:1px solid rgba(154,144,121,.36);border-left:3px solid #d4aa4f;padding:6px 10px;color:#f6e7b0;cursor:pointer;font-family:'DFO Gabin',var(--data,serif);font-size:13px;transition:background-color 110ms ease,border-color 110ms ease}
.dfo-live-quest:hover{background:rgba(213,178,110,.14);border-color:#d5b26e;color:#fff3c4}
.dfo-dungeon-live td{overflow-wrap:anywhere}.dfo-dungeon-live .acts{gap:6px}
.dfo-dungeon-live .dfo-dungeon-footer-btns{flex-wrap:wrap;justify-content:flex-end}
.dfo-dungeon-live .dfo-dungeon-footer-btns button:nth-child(2):not(:disabled){--dfo-c:#93c5fd;border-color:#3f63a8;border-top-color:#7fb2f0;border-bottom-color:#162442;background:repeating-linear-gradient(135deg,rgba(147,197,253,.12) 0 4px,transparent 4px 10px),linear-gradient(180deg,#243c69 0%,#162646 56%,#0d172c 100%);color:#e0f2fe}
.dfo-dungeon-live .dfo-dungeon-footer-btns button:nth-child(2):not(:disabled)::before{border-color:rgba(147,197,253,.36)}
.dfo-dungeon-hud{position:fixed;right:16px;top:16px;z-index:8;width:min(224px,calc(100vw - 32px));display:grid;gap:6px;pointer-events:none;font:12px/1.4 'DFO Gabin',var(--data,serif);color:#e9e4d9}
.dfo-dungeon-counters{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px 14px;margin:0;padding:9px 12px;background-color:var(--dfo-bg-panel,rgba(15,17,22,.92));background-image:linear-gradient(180deg,rgba(154,144,121,.08) 0%,rgba(154,144,121,.02) 34px,transparent 68px);border:2px solid;border-color:#9a9079 #3a352a #25221b #7a7260;box-shadow:0 0 0 1px #050608,inset 0 0 0 1px rgba(5,6,8,.75),0 4px 14px rgba(0,0,0,.55)}
.dfo-dungeon-counters dt,.dfo-dungeon-counters dd{margin:0}
.dfo-dungeon-counters dt{color:#c4b89c}
.dfo-dungeon-counters dd{font-family:'DFO Flexi',var(--data,monospace);color:#f5d451;font-weight:bold;font-variant-numeric:tabular-nums;text-align:right;text-shadow:0 1px 0 #000}
.dfo-dungeon-launch{--dfo-c:#d4b16a;position:relative;pointer-events:auto;cursor:pointer;font-family:'DFO Gabin',var(--data,serif);font-size:12px;letter-spacing:.03em;line-height:1.3;color:#f1e6c8;text-shadow:0 1px 0 #000;background:linear-gradient(180deg,#272219 0%,#191510 55%,#120f0b 100%);border:1px solid #6e5c3e;border-top-color:#9e8355;border-bottom-color:#3b301f;box-shadow:inset 0 1px 0 rgba(255,224,150,.14),0 2px 8px rgba(0,0,0,.55);padding:7px 10px;width:100%;transition:filter 120ms ease}
.dfo-dungeon-launch::before{content:'';position:absolute;inset:2px;border:1px solid rgba(213,178,110,.22);pointer-events:none}
.dfo-dungeon-launch::after{content:'';position:absolute;inset:2px;pointer-events:none;background:linear-gradient(var(--dfo-c),var(--dfo-c)) top left/5px 1px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) top left/1px 5px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) top right/5px 1px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) top right/1px 5px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) bottom left/5px 1px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) bottom left/1px 5px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) bottom right/5px 1px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) bottom right/1px 5px no-repeat}
.dfo-dungeon-launch:hover{filter:brightness(1.16);color:#f6e7b0}
.dfo-dungeon-hud[hidden]{display:none}
.dfo-dungeon-launch[hidden]{display:none}
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
  function contents(body, tab, data) {
    const forecast = data.forecast;
    if (tab === 'summary') {
      const stats = el('div', 'dfo-live-stats');
      for (const [label, n] of [[T('live.summary.enemiesLeft'), data.enemies.count], [T('live.summary.elitesLeft'), data.enemies.elites], [T('live.summary.players'), data.players.count]]) {
        const tile = el('div', 'dfo-live-stat');tile.append(el('strong', '', number(n)), el('span', '', label));stats.append(tile);
      }
      body.append(stats);
      const infoPanel = el('div', 'dfo-live-panel is-info'), infoBody = el('div', 'dfo-live-panel-body');
      paragraph(infoBody, data.players.note, 'dfo-dungeon-note');
      if (data.enemies.syncing) paragraph(infoBody, T('live.summary.syncing'), 'dfo-dungeon-note');
      const r = data.regen;
      paragraph(infoBody, r.state === 'offline' ? data.online ? T('live.regen.noClock') : T('live.regen.solo')
        : r.state === 'idle' ? T('live.regen.none',{n:r.intervalMinutes})
        : T('live.regen.next',{n:r.minutes,due:r.state === 'due' ? T('live.regen.due') : ''}));
      paragraph(infoBody, T('live.regen.note'), 'dfo-dungeon-note');
      const a = data.aurum;
      paragraph(infoBody, a.state === 'taken' ? T('live.aurum.taken')
        : a.state === 'offline' ? T('live.aurum.online')
        : a.state === 'absent' ? T('live.aurum.none')
        : T('live.aurum.state',{amount:a.amount == null ? T('live.aurum.amountUnknown') : a.amount + ' Aurum',state:a.state === 'unknown' ? T('live.aurum.statePending') : T('live.aurum.stateNoMark')}));
      infoPanel.append(infoBody);
      body.append(infoPanel);

      const qPanel = el('div', 'dfo-live-panel is-quests'), qHead = el('div', 'dfo-live-panel-head', T('live.quests.title')), qBody = el('div', 'dfo-live-panel-body');
      if (!data.quests.length) paragraph(qBody, T('live.quests.none'));
      for (const q of data.quests) {
        const link = button(tr(q.name), () => quest(q.uid));link.className = 'dfo-live-quest';link.dataset.quest = q.uid;qBody.append(link);
        for (const objective of q.objectives) paragraph(qBody, tr(objective), 'dfo-dungeon-note');
      }
      qPanel.append(qHead, qBody);
      body.append(qPanel);
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
    const key = n => n.nodeType === 1 ? n.dataset.quest || '' : '';
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
    const signature = JSON.stringify([state.tab, data]);if (!force && state.signature === signature) return;
    state.signature = signature;state.heading.textContent = data.title;state.subtitle.textContent = data.subtitle;state.rating.textContent = data.rating;
    const scroll = state.body.scrollTop, focused = doc.activeElement?.dataset?.quest;
    const next = doc.createDocumentFragment();contents(next, state.tab, data);patchChildren(state.body, next);state.body.scrollTop = scroll;
    state.body.setAttribute('aria-labelledby', 'dfo-live-tab-' + state.tab);
    if (focused) [...state.body.querySelectorAll('[data-quest]')].find(n => n.dataset.quest === focused)?.focus({ preventScroll: true });
    for (const [id, b] of state.tabs) { b.setAttribute('aria-selected', String(id === state.tab));b.classList.toggle('on', id === state.tab);b.tabIndex = id === state.tab ? 0 : -1; }
  }
  function close() {
    const state = current;if (!state) return;current = null;state.owner.done = true;state.live.unmount(state.owner);state.node.close();state.node.remove();
    if (state.prior?.isConnected) state.prior.focus({ preventScroll: true });
  }
  function open() {
    if (current) return false;const now = info();if (!now || now.live.blocked() || root.__dfoDungeons?.isOpen() || root.__dfoLootUI?.isDialogOpen?.()) return false;
    styles();const node = el('dialog', 'dfo-panel dfo-win dfo-window-frame dfo-dungeon-dialog dfo-dungeon-live'), prior = doc.activeElement;
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
  root.__dfoDungeonLive = { open, close, isOpen: () => !!current,
    focusJournal(uid) {
      if (uid == null) return;
      root.requestAnimationFrame(() => {
        const node = [...doc.querySelectorAll('#enhanced-chronicle [data-dfo-quest]')].find(n => n.dataset.dfoQuest === String(uid));
        if (!node) return;node.scrollIntoView({ block: 'start' });node.tabIndex = -1;node.focus({ preventScroll: true });node.setAttribute('aria-label', T('live.quest.chosen'));
      });
    } };
})(globalThis);
