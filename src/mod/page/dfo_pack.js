// THE INVENTORY (docs/inventory.md, hooks inventory-transform.cjs): the pack's nine pages - Magic gone, Junk come -, the
// list view and the icon view, the automatic sort by quality on the pack's own triggers, the surrogate stacks of the
// stateless pieces, the Junk rule and the quest letter's lock on receipt. Every native act stays the game's: this script
// only answers which page a piece is on, how the list draws and when the native Sort runs.
(function (root) {
  'use strict';
  const doc = root.document;
  const cfg = root.__DFO_MOD_CFG__?.inventory;
  const Rules = root.__dfoPackRules;
  if (!doc || !Rules || cfg?.enabled === false || root.__dfoPack) return;
  const T = (key, params) => (root.__dfoUi ? root.__dfoUi.t(key, params) : key);
  const STATE_KEY = 'dfoMod.pack';

  // ── THE SETTINGS: the mod's cache (`pack` in dfo-mod-cache.json, /dfo-mod/pack-settings), a local mirror for the
  // first paint, a revision against a second window's write. A failed write goes back to what the disk holds.
  let state = Rules.cleanState(null), remote = 0, epoch = 0, loaded = null, queue = Promise.resolve(), lastError = '';
  try { state = Rules.cleanState(JSON.parse(root.localStorage?.getItem(STATE_KEY) || 'null')); } catch { /* defaults */ }
  const mirror = () => { try { root.localStorage?.setItem(STATE_KEY, JSON.stringify(state)); } catch { /* the disk cache stays authoritative */ } };
  const listeners = new Set();
  let shown = null;   // the open pack's header and its repaint (render's own), for a cache answer that changes the look
  const changed = (why) => {
    epoch++; showView();
    for (const fn of listeners) { try { fn(why); } catch { /* a listener's fault is its own */ } }
    if ((why === 'read' || why === 'rollback') && shown?.header?.isConnected) { try { shown.repaint(); } catch { /* the pack repaints on its next act */ } }
  };
  async function json(body) {
    const res = await root.fetch('/dfo-mod/pack-settings', body === undefined ? { cache: 'no-store' }
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { const e = new Error(data.code && root.__dfoUi?.has(data.code) ? T(data.code) : data.error || T('pack.saveFailed')); e.status = res.status; throw e; }
    return data;
  }
  async function read() {
    const next = Rules.cleanState(await json());
    remote = next.revision; state = next; mirror(); lastError = ''; changed('read'); return state;
  }
  const load = () => (loaded ??= read().catch((e) => { loaded = null; lastError = e?.message || String(e); throw e; }));
  function save(patch) {
    state = { ...state, ...Rules.cleanSettings({ ...state, ...patch }) }; mirror(); changed('update');
    const want = Rules.cleanSettings(state);
    queue = queue.then(async () => {
      try {
        if (JSON.stringify(Rules.cleanSettings(state)) !== JSON.stringify(want)) return;   // a later edit writes its own
        const saved = Rules.cleanState(await json({ ...want, revision: remote }));
        remote = saved.revision; lastError = '';
        if (JSON.stringify(Rules.cleanSettings(state)) === JSON.stringify(want)) { state = saved; mirror(); }
      } catch (e) {
        lastError = e?.message || String(e);
        loaded = null;
        try { await read(); } catch { /* keep the local mirror */ }
        changed('rollback');
      }
    });
    return queue;
  }

  // ── THE PAGES (storeFilter.js PACK_PAGES / pageOf) ─────────────────────────────────────────────────────────────────
  // A piece's page is asked by every page's filter, the sort and the side window's filter - kept by the piece while
  // nothing the answer reads has changed. The Junk rule reads the loot filter's tags, and those ask the page again: that
  // inner ask is answered without Junk.
  const memo = new WeakMap();
  let judging = false;
  const sig = (it) => `${epoch}|${it.junk === true ? 1 : 0}${it.locked === true ? 1 : 0}${it.isIdentified === true ? 1 : 0}${it.questItem ? 1 : 0}${it.stolen ? 1 : 0}|${it.rarity ?? ''}|${it.currentCondition ?? ''}|${it.group}|${it.templateIndex}|${it.foodStage ?? ''}`;
  function page(it, base, native) {
    if (!it || typeof it !== 'object') return native(it);
    if (judging) return Rules.basePage(it, base);
    const key = sig(it), hit = memo.get(it);
    if (hit && hit.key === key) return hit.page;
    let answer;
    judging = true;
    try { answer = Rules.isJunk(it, state.junk, root.__dfoLootTools, root.__dfoLootRules) ? 'junk' : Rules.basePage(it, base); }
    catch { answer = Rules.basePage(it, base); }
    finally { judging = false; }
    memo.set(it, { key, page: answer });
    return answer;
  }

  // ── THE LIST (enhancedInventory.js listCol / itemRow) ─────────────────────────────────────────────────────────────
  const stacks = new WeakMap();   // a cell's first record -> every record the cell stands for (this repaint)
  function list(items, tab) {
    const cells = Rules.cells(items, tab);
    for (const c of cells) { if (c.members.length > 1) stacks.set(c.item, c.members); else stacks.delete(c.item); }
    return cells.map((c) => c.item);
  }
  const members = (item) => stacks.get(item) ?? null;
  const total = (records) => records.reduce((n, it) => n + Rules.count(it), 0);
  let building = false;
  /** One row of the dock's page: built by the native itemRow, told it is a list row while it builds. */
  function build(itemRow, item) {
    building = true;
    let row;
    try { row = itemRow(item); } finally { building = false; }
    try { decorate(row, item); } catch { /* the native row stands */ }
    return row;
  }
  const listRow = () => building && state.view === 'rows';
  // A surrogate stack says its count: the icon view's corner, the list view's name (the card's dress sums its weight
  // and price itself - page/dfo_item_cards.js row).
  function decorate(row, item) {
    const all = members(item);
    if (!row || !all) return;
    const n = total(all);
    row.dataset.dfoStack = String(n);
    if (state.view === 'grid') {
      let corner = row.querySelector(':scope > .count');
      if (!corner) { corner = doc.createElement('span'); corner.className = 'count'; row.append(corner); }
      corner.textContent = String(n);
    } else if (!row.classList.contains('dfo-item-row')) {
      const name = row.querySelector('.itemname > span');
      if (name) name.replaceChildren(doc.createTextNode(`${name.textContent.replace(/ ×\d+$/, '')} ×${n}`));
    }
  }

  // ── THE SORT (enhancedInventory.js refresh / sortPack) ───────────────────────────────────────────────────────────
  // Not in the background: the native Sort runs when the pack opens and after the player's own act in it - a press in
  // the pack's window marks the next refresh, which every act runs. Never while the pack chooses what to break, nor over
  // a chest's copy (the native Sort's own guards).
  let pending = false, lastDeps = null, listening = false;
  function listen() {
    if (listening) return;
    listening = true;
    const mark = (e) => { if (e.target?.closest?.('.pack-shell')) pending = true; };
    doc.addEventListener('pointerdown', mark, true);
    doc.addEventListener('keydown', mark, true);
    doc.addEventListener('drop', mark, true);
  }
  function refresh(deps, { busy, sort }) {
    listen();
    if (deps !== lastDeps) { lastDeps = deps; pending = true; }   // a fresh mount: the pack opened
    if (!pending) return;
    if (!state.autoSort) { pending = false; return; }
    if (busy()) return;
    pending = false;
    sort();
  }

  // ── THE QUEST LETTER'S LOCK (inventory.js addItem) ───────────────────────────────────────────────────────────────
  // A quest item comes in at the front when the player receives it (giveItemToPlayer, a take off a body or a chest).
  // The letter is locked there, once - itemLock.js setLocked's own field; unlocking it afterwards stays the player's.
  function received(list, item, at) {
    if (at !== 'front' || !item || typeof item !== 'object' || item.questItem !== true || item.locked === true || !Rules.isNote(item)) return;
    item.locked = true;
  }

  // ── THE HEADER (enhancedInventory.js render): the view, the automatic sort, the Junk rule - before Close ──────────────
  const el = (tag, cls, text) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  function toggle(text, on, onclick, title) {
    const b = el('button', `act dfo-pack-act${on ? ' on' : ''}`, text);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(!!on));
    if (title) b.title = title;
    b.onclick = (e) => { e.stopPropagation(); onclick(); };
    return b;
  }
  function head(header, repaint) {
    styles();
    showView();
    const view = el('span', 'dfo-pack-view');
    view.setAttribute('role', 'group');
    view.setAttribute('aria-label', T('pack.view.label'));
    for (const [v, key] of [['rows', 'pack.view.rows'], ['grid', 'pack.view.grid']]) {
      view.append(toggle(T(key), state.view === v, () => { if (state.view === v) return; save({ view: v }); repaint(); }, T(key + '.how')));
    }
    const auto = toggle(T('pack.sort.auto'), state.autoSort, () => { const on = !state.autoSort; save({ autoSort: on }); if (on) pending = true; repaint(); }, T('pack.sort.how'));
    const junk = toggle(T('pack.junk.button'), false, () => junkDialog(repaint), T('pack.junk.how'));
    junk.removeAttribute('aria-pressed');
    junk.setAttribute('aria-haspopup', 'dialog');
    header.classList.add('dfo-pack-head');
    header.append(view, auto, junk);
    shown = { header, repaint };
  }
  function showView() {
    const html = doc.documentElement;
    if (!html) return;
    if (html.dataset.dfoPack !== '1') html.dataset.dfoPack = '1';
    if (html.dataset.dfoPackView !== state.view) html.dataset.dfoPackView = state.view;
  }

  // ── THE JUNK RULE'S WINDOW: the loot filter's tags in two columns, ANY ticked tag is junk ──────────────────────────
  let open = null;
  function catalog() {
    const own = [
      { id: Rules.SALE_TAG, axis: 'use', group: T('pack.junk.axis'), label: T('pack.junk.sale') },
      { id: 'state:junk', axis: 'state', group: T('lootRules.axis.state'), label: T('lootRules.state.junk') },
    ];
    let rest = [];
    try { rest = root.__dfoLootRules && root.__dfoLootTools ? root.__dfoLootRules.catalog(root.__dfoLootTools) : []; } catch { rest = []; }
    // the Junk page itself is no mark of junk: the rule reads the pages without it
    return [...new Map([...own, ...rest].filter((t) => t.id !== 'page:junk').map((t) => [t.id, t])).values()];
  }
  function junkDialog(repaint) {
    if (open) return;
    styles();
    const all = catalog(), known = new Set(all.map((t) => t.id));
    for (const id of state.junk.tags) if (!known.has(id)) { known.add(id); all.push({ id, axis: 'saved', group: T('loot.tags.saved'), label: T('loot.tags.unavailable', { id }) }); }
    const picked = new Set(state.junk.tags);
    const dialog = el('dialog', 'dfo-pack-dialog');
    const top = el('div', 'dfo-pack-dhead'), title = el('span', 'dfo-pack-dtitle', T('pack.junk.title'));
    title.id = 'dfo-pack-junk-title';
    dialog.setAttribute('aria-labelledby', title.id);
    const x = el('button', 'dfo-pack-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', T('pack.junk.close'));
    top.append(title, x);
    const body = el('div', 'dfo-pack-dbody');
    body.append(el('p', 'dfo-pack-note', T('pack.junk.intro')));
    const controls = el('div', 'dfo-pack-controls');
    const axis = el('select'); axis.setAttribute('aria-label', T('loot.tags.group'));
    for (const [id, name] of [['all', T('loot.tags.all')], ...new Map(all.map((t) => [t.axis, t.group])).entries()]) { const o = el('option', null, name); o.value = id; axis.append(o); }
    const search = el('input'); search.type = 'search'; search.placeholder = T('loot.tags.find'); search.setAttribute('aria-label', T('loot.tags.search'));
    controls.append(axis, search);
    const grid = el('div', 'dfo-pack-tags'); grid.setAttribute('aria-label', T('loot.tags.grid'));
    const count = el('p', 'dfo-pack-note dfo-pack-count');
    const status = el('span', 'dfo-pack-status'); status.setAttribute('role', 'status');
    body.append(controls, grid, count);
    const foot = el('div', 'dfo-pack-dfoot');
    const reset = el('button', 'dfo-pack-btn', T('pack.junk.defaults')); reset.type = 'button';
    const done = el('button', 'dfo-pack-btn dfo-pack-primary', T('pack.junk.done')); done.type = 'button';
    foot.append(status, reset, done);
    dialog.append(top, body, foot);
    const apply = () => { save({ junk: { tags: [...picked], items: state.junk.items } }); repaint(); count.textContent = T('loot.tags.count', { n: picked.size }); };
    const draw = () => {
      grid.replaceChildren();
      const q = search.value.trim().toLocaleLowerCase();
      for (const t of all) {
        if (axis.value !== 'all' && t.axis !== axis.value) continue;
        if (q && !`${t.label} ${t.group}`.toLocaleLowerCase().includes(q)) continue;
        const label = el('label', 'dfo-pack-tag'), box = el('input');
        box.type = 'checkbox'; box.checked = picked.has(t.id); box.dataset.tag = t.id;
        box.onchange = () => { if (box.checked) picked.add(t.id); else picked.delete(t.id); apply(); };
        label.title = `${t.group}: ${t.label}`;
        // the words are already the player's: text nodes, never a second translation
        const g = el('span', 't-grp'); g.append(doc.createTextNode(`${t.group}:`));
        const w = el('span', 't-lbl'); w.append(doc.createTextNode(t.label));
        label.append(box, g, w);
        grid.append(label);
      }
    };
    const close = () => {
      if (!open) return;
      open = null; listeners.delete(onChange);
      try { dialog.close(); } catch { /* already shut */ }
      dialog.remove();
    };
    const onChange = (why) => {
      if (why === 'rollback') status.textContent = lastError;
      if (why === 'read' || why === 'rollback') {
        picked.clear(); for (const tag of state.junk.tags) picked.add(tag);
        for (const box of grid.querySelectorAll('input[data-tag]')) box.checked = picked.has(box.dataset.tag);
        count.textContent = T('loot.tags.count', { n: picked.size });
      }
    };
    reset.onclick = () => { picked.clear(); for (const t of Rules.DEFAULT_JUNK) picked.add(t); draw(); apply(); };
    done.onclick = close;
    x.onclick = close;
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    // the pack's own keys and clicks never see the window's
    for (const type of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'wheel', 'keydown', 'keyup']) dialog.addEventListener(type, (e) => e.stopPropagation());
    axis.onchange = draw; search.oninput = draw;
    draw(); count.textContent = T('loot.tags.count', { n: picked.size }); status.textContent = lastError;
    listeners.add(onChange);
    open = { dialog, close };
    doc.body.append(dialog);
    try { dialog.showModal(); } catch { dialog.setAttribute('open', ''); }
    search.focus();
  }
  // Keys meant for the window never reach the pack's listeners (they stand on the window, in capture).
  root.addEventListener('keydown', (e) => { if (open && e.key !== 'Escape') e.stopImmediatePropagation(); }, true);

  // ── THE LOOK: the window wide alone (two columns of rows), its native width beside a container (one column); the icon
  // view fills the same field with the native plates. Borders, never margins: the list measures each row's box.
  const CSS = `
html[data-dfo-pack] .pack-shell:not(.paired) .pack-win { width:min(1380px,96vw); }
@media (min-width:1000px) { html[data-dfo-pack] .pack-shell:not(.paired) .pack { grid-template-columns:minmax(560px,1fr) minmax(300px,700px); } }
html[data-dfo-pack] .pack-shell .pack-id.dfo-pack-head { flex-wrap:wrap; justify-content:flex-end; gap:6px; }
html[data-dfo-pack] .pack-shell .pack-id.dfo-pack-head .act { min-width:0; padding-left:10px; padding-right:10px; letter-spacing:.06em; }
html[data-dfo-pack] .pack-shell .pack-id.dfo-pack-head > :first-child { margin-right:auto; }
html[data-dfo-pack] .pack-shell .pack-id .dfo-pack-view { display:inline-flex; gap:0; }
html[data-dfo-pack] .pack-shell .pack-id .dfo-pack-view > .act + .act { margin-left:-2px; }
html[data-dfo-pack] .pack-shell .pack-id .dfo-pack-act.on { color:#211b10; background:#d8b34f; border-color:#ffe3a0; text-shadow:none; }
html[data-dfo-pack-view="rows"] .pack-shell .pack-dock .packcol { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 8px; align-content:start; padding:6px 8px; }
html[data-dfo-pack-view="rows"] .pack-shell.paired .pack-dock .packcol { grid-template-columns:minmax(0,1fr); }
html[data-dfo-pack-view="rows"] .pack-shell .pack-dock .packcol > .packempty { grid-column:1 / -1; }
html[data-dfo-pack-view="rows"] .pack-shell .pack-dock .itemrow { width:100%; height:auto; min-height:52px; display:flex; align-items:center; justify-content:flex-start; gap:12px; text-align:left; outline:0; }
html[data-dfo-pack-view="rows"] .pack-shell .pack-dock .itemrow:not(.dfo-item-row) { padding:8px 14px; border:0; border-bottom:2px solid rgba(125,116,96,.16); background:transparent; }
html[data-dfo-pack-view="rows"] .pack-shell .pack-dock .itemrow:not(.dfo-item-row):hover { background:rgba(125,116,96,.12); }
html[data-dfo-pack-view="rows"] .pack-shell .pack-dock .itemrow:not(.dfo-item-row).on { background:rgba(192,138,62,.14); box-shadow:inset 3px 0 0 var(--brass,#c08a3e); }
html[data-dfo-pack-view="rows"] .pack-shell .pack-dock .itemrow.on { outline:0; text-shadow:none; }
html[data-dfo-pack-view="rows"] .pack-shell .pack-dock .itemrow .tile { width:38px; height:38px; flex:0 0 auto; position:relative; }
html[data-dfo-pack-view="rows"] .pack-shell .pack-dock .itemrow .itemname { position:static; width:auto; height:auto; clip-path:none; overflow:hidden; display:flex; flex-direction:column; gap:2px; min-width:0; flex:1 1 0%; font-size:14px; color:#d8cfae; }
html[data-dfo-pack-view="rows"] .pack-shell .pack-dock .itemrow .itemname > span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
html[data-dfo-pack-view="rows"] .pack-shell .pack-dock .itemrow:not(.dfo-item-row) .itemname small { font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:#9c937d; }
html[data-dfo-pack-view="rows"] .pack-shell .pack-dock .itemrow .itemwt { display:block; flex:0 0 auto; font-size:12px; color:#9c937d; }
html[data-dfo-pack-view="rows"] .pack-shell .pack-dock .itemrow.dfo-item-row .itemwt.dfo-row-price { display:flex; color:#f5d451; font-size:inherit; }
html[data-dfo-pack-view="rows"] .pack-shell .pack-dock .itemrow > .count { display:none; }
html[data-dfo-pack-view="rows"] .pack-shell .pack-dock .itemrow .qs-mark { left:3px; top:2px; z-index:2; }
html[data-dfo-pack-view="rows"] .pack-shell .pack-dock .itemrow .salv-mark { margin-left:4px; }
.dfo-pack-dialog { box-sizing:border-box; position:fixed; inset:0; margin:auto; padding:0; width:min(900px,94vw); max-height:min(800px,90vh); display:flex; flex-direction:column; overflow:hidden; font-family:var(--data,'Pixelify Sans',system-ui,sans-serif); color:var(--bone,#f1e6c8); background:linear-gradient(180deg,rgba(23,27,33,.985),rgba(14,16,19,.985)); border:1px solid rgba(192,138,62,.45); border-radius:3px; box-shadow:0 10px 40px rgba(0,0,0,.75); z-index:10050; }
.dfo-pack-dialog:not([open]) { display:none; }
.dfo-pack-dialog::backdrop { background:rgba(0,0,0,.6); }
.dfo-pack-dhead { display:flex; align-items:center; gap:8px; padding:8px 12px 8px 14px; border-bottom:1px solid rgba(192,138,62,.25); flex-shrink:0; }
.dfo-pack-dtitle { flex:1; font-size:14px; letter-spacing:.08em; text-transform:uppercase; color:#f6e7b0; font-weight:600; }
.dfo-pack-x { background:none; border:0; color:var(--dim,#a9a08a); cursor:pointer; font:inherit; font-size:15px; padding:2px 6px; }
.dfo-pack-x:hover { color:#fff; background:rgba(255,255,255,.08); }
.dfo-pack-dbody { overflow-y:auto; overscroll-behavior:contain; padding:10px 16px 12px; font-size:12.5px; line-height:1.45; min-height:0; flex:1; }
.dfo-pack-note { color:var(--dim,#a9a08a); font-size:12px; margin:4px 0 8px; }
.dfo-pack-controls { display:flex; gap:8px; flex-wrap:wrap; margin:6px 0; }
.dfo-pack-controls input { flex:1; min-width:140px; }
.dfo-pack-dialog input, .dfo-pack-dialog select { box-sizing:border-box; font:inherit; font-size:12px; color:var(--bone,#f1e6c8); background:rgba(22,26,33,.85); border:1px solid rgba(192,138,62,.35); border-radius:2px; padding:5px 8px; }
.dfo-pack-dialog input[type="checkbox"] { accent-color:#d8b34f; width:14px; height:14px; margin:0; cursor:pointer; flex:none; }
.dfo-pack-tags { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:4px 8px; max-height:52vh; overflow-y:auto; overflow-x:hidden; padding:4px 4px 8px 0; scrollbar-width:thin; scrollbar-color:rgba(192,138,62,.5) rgba(22,26,33,.8); }
.dfo-pack-tag { box-sizing:border-box; display:flex; align-items:center; gap:6px; padding:4px 7px; font-size:11.5px; background:rgba(35,42,50,.45); border:1px solid rgba(192,138,62,.22); border-radius:2px; cursor:pointer; user-select:none; min-height:28px; min-width:0; }
.dfo-pack-tag:hover { background:rgba(48,58,70,.6); border-color:rgba(192,138,62,.5); }
.dfo-pack-tag:has(input:checked) { background:rgba(78,127,114,.28); border-color:rgba(192,138,62,.75); color:#f6e7b0; }
.dfo-pack-tag .t-grp { color:var(--dim,#a9a08a); font-size:10.5px; flex-shrink:0; }
.dfo-pack-tag .t-lbl { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dfo-pack-dfoot { display:flex; align-items:center; gap:8px; padding:8px 14px; border-top:1px solid rgba(192,138,62,.2); background:rgba(18,21,26,.6); flex-shrink:0; }
.dfo-pack-status { flex:1; min-height:1.4em; font-size:11.5px; color:#ff9f98; }
.dfo-pack-btn { font:inherit; font-size:12px; letter-spacing:.03em; cursor:pointer; padding:5px 12px; border:1px solid rgba(192,138,62,.45); border-radius:2px; background:rgba(43,50,59,.65); color:var(--bone,#f1e6c8); }
.dfo-pack-btn:hover { background:rgba(78,127,114,.35); border-color:rgba(192,138,62,.85); color:#fff; }
.dfo-pack-btn.dfo-pack-primary { color:#211b10; background:#d8b34f; border-color:#ffe3a0; }
.dfo-pack-btn:focus-visible, .dfo-pack-dialog input:focus-visible, .dfo-pack-dialog select:focus-visible { outline:2px solid #f2c443; outline-offset:1px; }
`;
  function styles() {
    if (doc.getElementById('dfo-pack-style')) return;
    const style = el('style'); style.id = 'dfo-pack-style'; style.textContent = CSS;
    (doc.head || doc.documentElement).append(style);
  }

  root.__dfoPack = {
    pages: (native) => Rules.pages(native), page, list, members, build, listRow, mode: () => state.view, head, refresh, received,
    settings: () => state, load, save, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    openJunk: (repaint = () => {}) => junkDialog(repaint), closeJunk: () => open?.close(),
  };
  showView();
  if (typeof root.fetch === 'function') load().catch(() => { /* the mirror stands until the cache answers */ });
})(globalThis);
