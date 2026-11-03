(function (root) {
  'use strict';
  if (root.__dfoDungeonLive || root.__DFO_MOD_CFG__?.dungeons?.enabled === false) return;
  const doc = root.document, M = root.__dfoDungeonLiveModel, cfg = root.__DFO_MOD_CFG__?.dungeons || {};
  const code = cfg.keyCode || 'KeyK', mouse = ({ Mouse3: 1, Mouse4: 3, Mouse5: 4 })[code];
  const tabs = [['summary', 'Сводка'], ['enemies', 'Враги'], ['loot', 'Добыча'], ['prepare', 'Подготовка']];
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
.dfo-dungeon-launch{position:fixed;right:16px;top:16px;z-index:8;cursor:pointer;font:12px var(--data,'Pixelify Sans',system-ui,sans-serif);color:var(--bone,#f1e6c8);background:rgba(16,20,25,.88);border:1px solid rgba(192,138,62,.5);padding:8px 12px}
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
    if (uid != null && !M.quests(now.live.questBridge, now.live.location, now.live.foes).some(q => q.uid === uid)) { state.status.textContent = 'Задание больше не активно в этом данже.';return; }
    close();
    if (!now.live.journal(uid)) { open();if (current) current.status.textContent = 'Не удалось открыть журнал. Завершите другое действие и повторите.'; }
  }
  function navigation(body, data) {
    const nav = root.__dfoDungeonNavigation, available = nav?.availability() || {}, state = nav?.state();
    paragraph(body, 'Навигация по данжу', 'sec');
    paragraph(body, 'Выберите цель — окно закроется, а светящаяся линия на полу покажет проход. Двери открываются вручную.', 'dfo-dungeon-note');
    if (data.quests.length) {
      const label = el('label', '', 'Задание: '), select = el('select', 'dfo-nav-select');select.dataset.navControl = 'quest';select.setAttribute('aria-label', 'Задание для навигации');
      const option = (uid, name) => { const o = el('option', '', name);o.value = uid;select.append(o); };
      option('', 'Отслеживаемое или ближайшая активная цель');
      for (const [i, q] of data.quests.entries()) option(q.uid, tr(q.name) + (data.quests.filter(x => x.name === q.name).length > 1 ? ' (' + (i + 1) + ')' : ''));
      if (current.navQuest && !data.quests.some(q => q.uid === current.navQuest)) current.navQuest = '';
      select.value = current.navQuest || '';select.onchange = e => { if (current) current.navQuest = e.currentTarget.value; };label.append(select);body.append(label);
    }
    const buttons = el('div', 'dfo-nav-actions');
    for (const [kind, text, reason] of [['exit','К выходу','В этой локации не найден выход.'],['aurum','К сундуку с аурумом','Сундук недоступен или уже открыт.'],['elite','К ближайшему элитнику','Живых элитных противников нет.'],['quest','К цели задания','Доступных целей задания нет.']]) {
      const b = button(text, () => { const uid = kind === 'quest' ? current?.navQuest || null : null;if (nav?.start(kind, uid)) close();else render(true); });
      b.dataset.navControl = kind;b.disabled = !available.ready || !available[kind];b.title = !available.ready ? 'Навигация ещё подготавливается.' : available[kind] ? '' : reason;b.setAttribute('aria-pressed', String(state?.kind === kind && state.phase !== 'idle'));buttons.append(b);
    }
    body.append(buttons);
    if (state?.phase !== 'idle' && state?.kind) paragraph(body, [tr(state.name), state.distance == null ? '' : state.distance + ' м', state.message].filter(Boolean).join(' · '), 'dfo-dungeon-note');
    const stop = button('Убрать маршрут', () => { nav?.stop();render(true); });stop.className = 'dfo-nav-stop';stop.dataset.navControl = 'stop';stop.disabled = !state || state.phase === 'idle';body.append(stop);
  }
  function contents(body, tab, data) {
    const forecast = data.forecast;
    if (tab === 'summary') {
      const stats = el('div', 'dfo-live-stats');
      for (const [label, n] of [['Осталось врагов', data.enemies.count], ['Из них элитных', data.enemies.elites], ['Игроков в данже', data.players.count]]) {
        const tile = el('div', 'dfo-live-stat');tile.append(el('strong', '', number(n)), el('span', '', label));stats.append(tile);
      }
      body.append(stats);paragraph(body, data.players.note, 'dfo-dungeon-note');
      if (data.enemies.syncing) paragraph(body, 'Часть противников ещё синхронизируется. Это известный клиенту состав.', 'dfo-dungeon-note');
      const r = data.regen;
      paragraph(body, r.state === 'offline' ? data.online ? 'Реген: время сервера пока неизвестно.' : 'Реген: в одиночной игре автоматическое восстановление не идёт.'
        : r.state === 'idle' ? `Реген: нет известного запущенного отсчёта. Обычный интервал — ${r.intervalMinutes} мин.`
        : `До ближайшего регена: ${r.minutes} мин.${r.state === 'due' ? ' Ожидание обновления комнаты.' : ''}`);
      paragraph(body, 'Враги и опустошённые источники восстанавливаются каждый по своему времени; это ближайший известный срок, а не сброс всего данжа.', 'dfo-dungeon-note');
      const a = data.aurum;
      paragraph(body, a.state === 'taken' ? 'Аурум: получение отмечено для вашего аккаунта на этой неделе.'
        : a.state === 'offline' ? 'Аурум: сундук доступен в онлайне.'
        : a.state === 'absent' ? 'Аурум: в этом типе локации сундук не предусмотрен.'
        : `Аурум: ${a.amount == null ? 'сумма неизвестна' : a.amount + ' Aurum'}. ${a.state === 'unknown' ? 'Состояние сундука ещё не получено.' : 'Нет местной отметки о получении; сервер подтвердит при открытии.'}`);
      paragraph(body, 'Задания в этом данже', 'sec');
      if (!data.quests.length) paragraph(body, 'Известных активных заданий здесь нет.');
      for (const q of data.quests) {
        const link = button(tr(q.name), () => quest(q.uid));link.className = 'dfo-live-quest';link.dataset.quest = q.uid;body.append(link);
        for (const objective of q.objectives) paragraph(body, tr(objective), 'dfo-dungeon-note');
      }
      navigation(body, data);
    } else if (tab === 'enemies') {
      paragraph(body, 'Живые противники текущей сцены. Индивидуальные элитники и усиление всего данжа указаны отдельно.', 'dfo-dungeon-note');
      if (!data.enemies.rows.length) paragraph(body, data.enemies.count == null ? 'Состав ещё не получен.' : 'Живых противников не осталось.');
      else table(body, ['Противник', 'Осталось', 'Уровень', 'Свойства', 'Здоровье'], data.enemies.rows.map(r => [tr(r.name), r.count,
        r.minLevel == null ? '—' : r.minLevel === r.maxLevel ? r.minLevel : `${r.minLevel}–${r.maxLevel}`,
        r.mods.map(tr).join(', ') || 'Обычный', r.healthKnown ? `${Math.ceil(r.health)} / ${Math.ceil(r.maxHealth)}` : '—']));
    } else if (tab === 'loot') {
      paragraph(body, 'На что идти за добычей', 'sec');
      if (!forecast) { paragraph(body, 'Для этой особой локации стандартный прогноз недоступен. Сводка и список врагов работают по текущей сцене.');return; }
      paragraph(body, `Ранг добычи: ${forecast.rank ?? 'неизвестен'}. Удача персонажа: ${forecast.luck ?? 'неизвестна'}.`);
      if (forecast.chances) table(body, ['Минимальная редкость', 'Шанс подходящей вещи'], [['magic','Не ниже магической'],['rare','Не ниже редкой'],['legendary','Не ниже легендарной']].map(([k, label]) => [label, `${(forecast.chances[k] / 10).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`]));
      else paragraph(body, 'Шансы редкости клиенту пока неизвестны.');
      if (forecast.signatures?.length) { paragraph(body, 'Предпочтительные легендарные вещи', 'sec');for (const item of forecast.signatures) paragraph(body, tr(item.name)); }
      paragraph(body, 'Это прогноз по таблицам, а не содержимое неоткрытых сундуков. Фактически доступные предметы показывает «Лут рядом».', 'dfo-dungeon-note');
    } else {
      paragraph(body, 'Подготовка к оставшимся противникам', 'sec');
      if (!forecast) { paragraph(body, 'Ориентируйтесь на живой список и свойства противников во вкладке «Враги».');return; }
      paragraph(body, forecast.weaponName ? `Оружие в руках: ${tr(forecast.weaponName)}.` : 'Оружие в руках не определено.');
      paragraph(body, !forecast.ready ? 'Недостаточно данных для оценки пригодности оружия.' : forecast.blocked > 0
        ? `Часть ожидаемых противников требует другого материала оружия: примерно ${Math.round(forecast.blocked * 100)}% по таблице данжа.` : 'Материал оружия подходит ожидаемым видам противников.');
      paragraph(body, forecast.life?.text || '', 'dfo-dungeon-note');
      paragraph(body, 'Приоритеты', 'sec');
      paragraph(body, data.enemies.elites ? `Осталось элитных противников: ${data.enemies.elites}. Проверьте их свойства во вкладке «Враги» перед боем.` : 'Индивидуальные элитные противники в текущем списке не обнаружены.');
      paragraph(body, 'Здоровье в таблице суммируется по группе одинаковых противников. Прогноз материалов относится к таблицам появления и может отличаться от оставшегося состава.', 'dfo-dungeon-note');
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
    const nav = el('div', 'tabs');nav.setAttribute('role', 'tablist');nav.setAttribute('aria-label', 'Разделы текущего данжа');
    const body = el('div', 'wb');body.setAttribute('role', 'tabpanel');body.id = 'dfo-dungeon-live-content';
    const foot = el('div', 'acts'), status = el('span', 'dfo-dungeon-status'), actions = el('div', 'dfo-dungeon-footer-btns');status.setAttribute('role', 'status');foot.append(status, actions);
    const owner = { done: false, holdsScreen: true, isChoiceWindow: true, input() {}, click() {}, wheel() {}, hover() {}, tick() {}, draw() {}, close() { if (current?.owner === owner) close(); }, dispose() { this.close(); }, destroy() { this.close(); } };
    if (!now.live.mount(owner)) return false;
    current = { node, ctx: now.live.ctx, live: now.live, owner, prior, heading, subtitle, rating, body, status, tabs: new Map(), tab: 'summary', pressing: false };
    for (const [id, label] of tabs) { const b = button(label, () => { if (current) { current.tab = id;render(true); } });b.setAttribute('role', 'tab');b.setAttribute('aria-controls', body.id);b.id = 'dfo-live-tab-' + id;nav.append(b);current.tabs.set(id, b); }
    const map = button('Автокарта', () => { const n = info();if (n?.live.ctx !== current?.ctx) { close();return; }close();n.world.modes?.()?.toggleAutomap?.(); });map.disabled = typeof now.world.modes?.()?.toggleAutomap !== 'function';actions.append(map);
    const journal = button('Журнал заданий', () => quest(null));journal.disabled = !now.live.questBridge;
    actions.append(journal, button('Закрыть', close));
    node.append(wh, nav, body, foot);node.addEventListener('cancel', e => { e.preventDefault();close(); });
    for (const type of ['click', 'pointerdown', 'mousedown', 'mouseup', 'wheel']) node.addEventListener(type, e => e.stopPropagation());
    node.addEventListener('pointerdown', () => { if (current) current.pressing = true; });
    node.addEventListener('pointerup', () => { if (current) current.pressing = false; });
    doc.body.append(node);launcher.hidden = true;root.dispatchEvent(new Event('blur'));render(true);node.showModal();actions.lastElementChild.focus();return true;
  }
  styles();
  const label = ({ Space: 'Пробел', NumpadEnter: 'NumPad Enter' })[code] || code.replace(/^Key|^Digit/, '').replace(/^Numpad/, 'NumPad ').replace(/^Mouse/, 'Мышь ');
  const launcher = button('Сведения о данже · ' + label, open);launcher.className = 'dfo-dungeon-launch';launcher.hidden = true;
  if (doc.body) doc.body.append(launcher);else doc.addEventListener('DOMContentLoaded', () => doc.body.append(launcher), { once: true });
  const editing = e => { const selector = 'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]';return !!(e.target?.closest?.(selector) || doc.activeElement?.closest?.(selector)); };
  const consume = e => { e.preventDefault();e.stopImmediatePropagation(); };
  const conflict = root.__DFO_MOD_CFG__?.nearbyLoot?.enabled !== false && (root.__DFO_MOD_CFG__?.nearbyLoot?.keyCode || 'KeyJ') === code;
  if (conflict) launcher.title = 'Клавиша совпадает с «Лут рядом». Назначьте разные кнопки в установщике.';
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
  root.setInterval(() => { const n = info(!!current);launcher.hidden = !n || !!current || n.live.blocked();if (current) render(); }, 500);
  root.addEventListener('dfo-navigation-change', () => { if (current) render(); });
  root.__dfoDungeonLive = { open, close, isOpen: () => !!current,
    focusJournal(uid) {
      if (uid == null) return;
      root.requestAnimationFrame(() => {
        const node = [...doc.querySelectorAll('#enhanced-chronicle [data-dfo-quest]')].find(n => n.dataset.dfoQuest === String(uid));
        if (!node) return;node.scrollIntoView({ block: 'start' });node.tabIndex = -1;node.focus({ preventScroll: true });node.setAttribute('aria-label', 'Выбранное задание');
      });
    } };
})(globalThis);
