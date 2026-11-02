(function (root) {
  'use strict';
  const Rules = typeof module === 'object' && module.exports ? require('./dfo_loot_rules.js') : root.__dfoLootRules;
  const STATE_KEY = 'dfoMod.nearbyLoot';
  function createClient({ request = (...a) => root.fetch(...a), storage = null } = {}) {
    let state = Rules.cleanState(), confirmed = state, remoteRevision = 0, generation = 0, version = 0, sequence = 0, queue = Promise.resolve(), loaded;
    const listeners = new Set();
    const notify = (reason, error) => { version++; for (const fn of listeners) fn(state, reason, error); };
    const local = () => { try { storage?.setItem(STATE_KEY, JSON.stringify(state)); } catch { /* disk cache remains authoritative */ } };
    try { state = Rules.cleanState(JSON.parse(storage?.getItem(STATE_KEY) || 'null')); } catch { /* defaults */ }
    async function json(url, body) {
      const res = await request(url, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { const e = new Error(data.error || 'Не удалось сохранить настройки.'); e.status = res.status; throw e; }
      return data;
    }
    async function read() {
      const next = Rules.cleanState(await json('/dfo-mod/loot-settings'));
      remoteRevision = next.revision; confirmed = state = next; local(); notify('read'); return state;
    }
    async function recover(error, seq = sequence) {
      if (error.status === 409) generation++;
      if (error.status === 409 || seq === sequence) {
        try { await read(); } catch { state = confirmed; local(); }
      }
      notify('rollback', error);
    }
    async function persist(settings, seq) {
      const saved = Rules.cleanState(await json('/dfo-mod/loot-settings', { ...settings, revision: remoteRevision }));
      confirmed = saved; remoteRevision = saved.revision;
      state = seq === sequence ? saved : { ...state, revision: saved.revision, presets: saved.presets }; local(); notify('saved'); return saved;
    }
    const serial = work => {
      const gen = generation;
      const result = queue.then(() => { if (gen !== generation) throw new Error('Настройки изменились. Откройте окно заново.'); return work(); });
      queue = result.catch(() => {}); return result;
    };
    const api = {
      get: () => state, get version() { return version; },
      subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      load() { return loaded ??= read().catch(e => { loaded = null; throw e; }); },
      async refresh() { await queue; return read(); },
      flush: () => queue,
      update(patch) {
        const seq = ++sequence;
        const next = Rules.cleanSettings({ ...state, ...patch }); state = { ...state, ...next }; local(); notify('update');
        return serial(async () => {
          if (seq !== sequence) return state; // coalesce rapid checkbox edits before disk writes
          try {
            return await persist(next, seq);
          } catch (e) {
            await recover(e, seq);
            throw e;
          }
        });
      },
      savePreset(name) {
        const snapshot = Rules.cleanSettings(state), seq = sequence;
        return serial(async () => {
          try {
            // A transient failed checkbox write must not produce a preset whose active
            // filter differs from the disk cache after restart. Retry the explicit Save.
            if (JSON.stringify(Rules.cleanSettings(confirmed)) !== JSON.stringify(snapshot)) await persist(snapshot, seq);
            const result = await json('/dfo-mod/loot-presets', { name, filter: snapshot.filter, revision: remoteRevision });
            const saved = Rules.cleanState(result.state); confirmed = saved; remoteRevision = saved.revision;
            state = { ...state, revision: saved.revision, presets: saved.presets }; local(); notify('preset'); return result;
          } catch (e) { await recover(e, seq); throw e; }
        });
      },
    };
    return api;
  }

  function createUI({ client, tools = () => root.__dfoLootTools } = {}) {
    const doc = root.document, stack = [];
    let activeLoot = null, repaint = null;
    let lastError = '';
    client.subscribe((state, reason, error) => {
      if (reason === 'rollback') lastError = errorOf(error);
      else if (['update', 'read', 'preset'].includes(reason)) lastError = '';
      for (const m of stack) {
        m.sync?.();
        if (reason === 'rollback') m.message(lastError, true);
        else if (['update', 'read', 'preset'].includes(reason)) m.message('');
      }
      for (const bar of doc.querySelectorAll('.dfo-loot-actions')) {
        bar.querySelector('[data-auto-button]')?.setAttribute('aria-pressed', String(state.autoLoot.enabled));
        const status = bar.querySelector('[role="status"]'); if (status) status.textContent = lastError;
      }
      if ((reason === 'rollback' || reason === 'read') && !stack.length && !activeLoot?.isClosed?.()) repaint?.();
    });
    const el = (tag, cls, text) => {
      const n = doc.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n;
    };
    const button = (text, fn, cls = '') => { const b = el('button', `dfo-loot-button ${cls}`, text); b.type = 'button'; b.onclick = fn; return b; };
    const errorOf = e => e?.message || String(e);
    function styles() {
      if (doc.getElementById('dfo-loot-styles')) return;
      const style = el('style'); style.id = 'dfo-loot-styles'; style.textContent = `
.dfo-loot-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.dfo-loot-button{font:inherit;cursor:pointer;padding:7px 12px;border:1px solid #6a6a70;border-radius:4px;background:#34343a;color:#e5e5e8}.dfo-loot-button:hover{border-color:#d3ad4b}.dfo-loot-button:focus-visible,.dfo-loot-dialog input:focus-visible,.dfo-loot-dialog select:focus-visible{outline:2px solid #f0ca69;outline-offset:2px}.dfo-loot-button[aria-pressed="true"]{color:#211b10;background:#d8b34f;border-color:#ffe3a0}.dfo-loot-button[aria-pressed="false"]{background:#414149;color:#d1d1d5}.dfo-loot-button:disabled{opacity:.55;cursor:wait}
.dfo-loot-dialog{box-sizing:border-box;width:min(1000px,94vw);max-height:90vh;overflow:auto;color:#f3ead5;background:#191b23;border:2px solid #b08c42;border-radius:8px;padding:20px;font:15px/1.4 system-ui,sans-serif;box-shadow:0 8px 50px #000b}.dfo-loot-dialog::backdrop{background:#0009}.dfo-loot-dialog h2{font-size:21px;margin:0 0 14px;color:#f1d88e}.dfo-loot-dialog p{margin:8px 0}.dfo-loot-dialog fieldset{min-width:0;max-width:100%;border:0;padding:0;margin:12px 0}.dfo-loot-dialog legend{font-weight:bold}.dfo-loot-dialog input,.dfo-loot-dialog select{box-sizing:border-box;font:inherit;color:#eee;background:#292c37;border:1px solid #777;border-radius:4px;padding:8px}.dfo-loot-dialog input[type="checkbox"]{accent-color:#d8b34f;width:18px;height:18px;flex-shrink:0}.dfo-loot-dialog label{display:flex;align-items:center;gap:8px}.dfo-loot-modes,.dfo-loot-footer{display:flex;gap:10px;flex-wrap:wrap}.dfo-loot-footer{margin-top:18px;justify-content:flex-end}.dfo-loot-tag-controls{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.dfo-loot-tag-controls input{flex:1;min-width:140px}.dfo-loot-tags{min-width:0;max-width:100%;display:grid;grid-template-rows:repeat(2,minmax(44px,auto));grid-auto-flow:column;grid-auto-columns:max-content;overflow-x:auto;gap:8px;padding:6px 2px 14px;scrollbar-color:#b08c42 #292c37}.dfo-loot-tag{box-sizing:border-box;border:1px solid #676775;border-radius:4px;background:#292c37;padding:8px;cursor:pointer;max-width:360px}.dfo-loot-tag:has(input:checked){border-color:#d8b34f;background:#393322}.dfo-loot-small{width:min(520px,94vw)}.dfo-loot-form input[type="text"]{width:100%}.dfo-loot-list{display:flex;flex-direction:column;gap:7px;max-height:40vh;overflow:auto;margin:12px 0}.dfo-loot-list button{text-align:left}.dfo-loot-status{min-height:1.4em;color:#e7c584}.dfo-loot-status[data-error="true"]{color:#ff9f98}.dfo-loot-note{color:#b9bdc8;font-size:13px}.dfo-loot-item-picker{max-height:280px;overflow:auto;display:flex;flex-direction:column;gap:5px}.dfo-loot-classicbar{position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:15;display:flex;gap:10px;padding:8px;background:#191b23;border:1px solid #b08c42}
`; doc.head.append(style);
    }
    function modal(title, { small = false, onClose = () => {} } = {}) {
      styles();
      const focused = doc.activeElement, node = el('dialog', `dfo-loot-dialog${small ? ' dfo-loot-small' : ''}`);
      const heading = el('h2', null, title); heading.id = `dfo-loot-heading-${Date.now()}-${stack.length}`;
      node.setAttribute('aria-labelledby', heading.id); node.append(heading);
      const status = el('p', 'dfo-loot-status'); status.setAttribute('role', 'status');
      const state = { node, title, close: null, message(text, error = false) { status.textContent = text; status.dataset.error = String(error); } };
      state.close = () => {
        if (!stack.includes(state)) return;
        for (const nested of [...stack.slice(stack.indexOf(state) + 1)].reverse()) nested.close();
        stack.splice(stack.indexOf(state), 1); node.close(); node.remove(); onClose();
        if (focused?.isConnected) focused.focus();
      };
      node.addEventListener('cancel', e => { e.preventDefault(); e.stopPropagation(); state.close(); });
      node.addEventListener('click', e => e.stopPropagation());
      node.addEventListener('pointerdown', e => e.stopPropagation());
      node.addEventListener('mousedown', e => e.stopPropagation());
      node.addEventListener('mouseup', e => e.stopPropagation());
      node.append(status); (doc.getElementById('enhanced-inventory') || doc.body).append(node);
      stack.push(state); node.showModal();
      state.content = n => node.insertBefore(n, status);
      if (lastError) state.message(lastError, true);
      return state;
    }
    // Our page scripts run before the game's capture handlers. Dialog keys must never reach the inventory or J.
    root.addEventListener('keydown', e => {
      const top = stack.at(-1); if (!top) return;
      e.stopImmediatePropagation();
      // Keep the browser's default action: Escape first dismisses an open native
      // select menu, then the top dialog via its cancel event. Do not close both.
    }, true);
    const footer = (...buttons) => { const n = el('div', 'dfo-loot-footer'); n.append(...buttons); return n; };
    const checkbox = (text, checked, change, key) => {
      const n = el('label', 'dfo-loot-tag'), input = el('input'); input.type = 'checkbox'; input.checked = checked;
      if (key) input.dataset.tag = key;
      input.onchange = () => change(input.checked); n.append(input, el('span', null, text)); return n;
    };
    function tagPicker(selected, changed) {
      const all = Rules.catalog(tools()), picked = new Set(selected), host = el('fieldset'), controls = el('div', 'dfo-loot-tag-controls');
      const known = new Set(all.map(t => t.id));
      for (const id of selected) if (!known.has(id)) { known.add(id); all.push({ id, axis: 'saved', group: 'Сохранённые', label: `Недоступный тег: ${id}` }); }
      host.append(el('legend', null, 'Теги предметов'));
      const axis = el('select'); axis.setAttribute('aria-label', 'Группа тегов');
      for (const [id, name] of [['all', 'Все теги'], ...new Map(all.map(t => [t.axis, t.group])).entries()]) {
        const o = el('option', null, name); o.value = id; axis.append(o);
      }
      const search = el('input'); search.type = 'search'; search.placeholder = 'Найти тег'; search.setAttribute('aria-label', 'Поиск тегов');
      controls.append(axis, search); host.append(controls);
      const grid = el('div', 'dfo-loot-tags'); grid.setAttribute('aria-label', 'Теги в два ряда'); host.append(grid);
      const count = el('p', 'dfo-loot-note'); host.append(count);
      const render = () => {
        grid.replaceChildren(); const query = search.value.trim().toLocaleLowerCase();
        for (const t of all) {
          if (axis.value !== 'all' && t.axis !== axis.value) continue;
          if (query && !`${t.label} ${t.group}`.toLocaleLowerCase().includes(query)) continue;
          grid.append(checkbox(`${t.group}: ${t.label}`, picked.has(t.id), yes => {
            if (yes) picked.add(t.id); else picked.delete(t.id); changed([...picked]); updateCount();
          }, t.id));
        }
      };
      const updateCount = () => { count.textContent = `Выбрано: ${picked.size}. Совпадение хотя бы одного тега. Ряды можно прокручивать колесом.`; };
      grid.addEventListener('wheel', e => { if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; const was = grid.scrollLeft; grid.scrollLeft += e.deltaY; if (grid.scrollLeft !== was) { e.preventDefault(); e.stopPropagation(); } }, { passive: false });
      host.sync = tags => {
        picked.clear(); for (const tag of tags) picked.add(tag);
        let added = false;
        for (const id of tags) if (!known.has(id)) { known.add(id); all.push({ id, axis: 'saved', group: 'Сохранённые', label: `Недоступный тег: ${id}` }); added = true; }
        if (added) {
          if (![...axis.options].some(o => o.value === 'saved')) { const o = el('option', null, 'Сохранённые'); o.value = 'saved'; axis.append(o); }
          render();
        }
        for (const input of grid.querySelectorAll('input[data-tag]')) input.checked = picked.has(input.dataset.tag);
        updateCount();
      };
      axis.onchange = render; search.oninput = render; render(); updateCount(); return host;
    }
    function download(result) {
      const data = { format: 'dfo-loot-filter', v: 1, name: result.preset.name, filter: result.preset.filter };
      const url = root.URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = el('a'); a.href = url; a.download = Rules.presetName(data.name).replace(/[<>:"/\\|?*]/g, '_') + '.json';
      doc.body.append(a); a.click(); a.remove(); root.setTimeout(() => root.URL.revokeObjectURL(url), 1000);
    }
    function saveDialog(parent) {
      const m = modal('Имя сохранённого фильтра', { small: true }), form = el('form', 'dfo-loot-form');
      const label = el('label', null, 'Название'), input = el('input'); input.type = 'text'; input.maxLength = 60; input.required = true; input.name = 'presetName'; label.append(input); form.append(label);
      const save = button('Сохранить', null); save.type = 'submit';
      form.append(footer(save, button('Отмена', m.close)));
      form.onsubmit = async e => {
        e.preventDefault(); if (save.disabled) return; save.disabled = true;
        try {
          const result = await client.savePreset(input.value);
          try { download(result); parent.message(`Пресет «${result.preset.name}» сохранён в файл и кеш.`); }
          catch { parent.message(`Пресет «${result.preset.name}» сохранён в кеш и файл клиента; браузерный экспорт не удался.`, true); }
          m.close();
        }
        catch (err) { m.message(errorOf(err), true); } finally { save.disabled = false; }
      };
      m.content(form); input.focus();
    }
    async function loadDialog(parent) {
      const m = modal('Загрузить фильтр', { small: true });
      let chosen = null;
      const list = el('div', 'dfo-loot-list'); list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', 'Сохранённые фильтры');
      const load = button('Загрузить', async () => {
        if (!chosen || load.disabled) return; load.disabled = true;
        try { await client.update({ filter: chosen.filter }); parent.sync?.(); parent.message(`Загружен фильтр «${chosen.name}».`); m.close(); }
        catch (e) { m.message(errorOf(e), true); } finally { load.disabled = false; }
      }); load.disabled = true;
      m.content(list); m.content(footer(load, button('Отмена', m.close)));
      try { await client.refresh(); } catch (e) { m.message(errorOf(e), true); }
      if (!m.node.isConnected) return;
      for (const p of client.get().presets) {
        const b = button(`${p.name} · ${p.filter.mode === 'white' ? 'белый' : 'чёрный'} · тегов: ${p.filter.tags.length}`, () => {
          chosen = p; load.disabled = false;
          for (const row of list.children) { row.setAttribute('aria-selected', String(row === b)); row.setAttribute('aria-pressed', String(row === b)); }
        }); b.setAttribute('role', 'option'); b.setAttribute('aria-selected', 'false'); list.append(b);
      }
      if (!list.children.length) list.append(el('p', null, 'Сохранённых фильтров пока нет.'));
    }
    function lootFilter() {
      if (stack.length) return;
      const m = modal('Лутфильтр', { onClose: () => { if (!activeLoot?.isClosed?.()) repaint?.(); } }), body = el('div'); m.content(body);
      const update = patch => { client.update(patch).catch(e => m.message(errorOf(e), true)); };
      const modes = el('div', 'dfo-loot-modes'), buttons = new Map();
      for (const [id, word] of [['white', 'Белый список'], ['black', 'Чёрный список']]) {
        const b = button(word, () => { if (client.get().filter.mode !== id) update({ filter: { ...client.get().filter, mode: id } }); });
        buttons.set(id, b); modes.append(b);
      }
      const picker = tagPicker(client.get().filter.tags, tags => update({ filter: { ...client.get().filter, tags } }));
      body.append(modes, el('p', 'dfo-loot-note', 'Белый список показывает совпавшее. Чёрный список скрывает совпавшее. Без отмеченных тегов белый список пуст, чёрный показывает всё.'), picker);
      m.sync = () => {
        const f = client.get().filter;
        for (const [id, b] of buttons) b.setAttribute('aria-pressed', String(f.mode === id));
        picker.sync(f.tags);
      };
      m.sync(); m.content(footer(button('Сохранить', () => saveDialog(m)), button('Загрузить', () => loadDialog(m)), button('Закрыть', m.close)));
    }
    function autoDialog() {
      if (stack.length) return;
      const m = modal('Автолут по кнопке лута', { onClose: () => { if (!activeLoot?.isClosed?.()) repaint?.(); } });
      const note = el('p', 'dfo-loot-note', 'Подбирает выбранное до открытия списка. Лутфильтр и поиск окна на автолут не влияют. Без правил ничего не подбирается.'); m.content(note);
      const update = auto => client.update({ autoLoot: auto }).catch(e => m.message(errorOf(e), true));
      const enabled = checkbox('Автолут включён', client.get().autoLoot.enabled, yes => update({ ...client.get().autoLoot, enabled: yes })); enabled.querySelector('input').dataset.autolootEnabled = 'true'; m.content(enabled);
      const picker = tagPicker(client.get().autoLoot.tags, tags => update({ ...client.get().autoLoot, tags })); m.content(picker);
      const host = el('fieldset'); host.append(el('legend', null, 'Конкретные предметы'));
      const search = el('input'); search.type = 'search'; search.placeholder = 'Найти предмет'; search.setAttribute('aria-label', 'Поиск конкретного предмета'); host.append(search);
      const list = el('div', 'dfo-loot-item-picker'); host.append(list); const info = el('p', 'dfo-loot-note'); host.append(info);
      const items = new Map();
      for (const it of activeLoot?.rawItems?.() ?? []) items.set(Rules.variantKey(it), { key: Rules.variantKey(it), name: `Рядом: ${it.group === '*' ? root.__translate?.(it.name) || it.name : tools()?.nameOf?.(it) || it.name}` });
      for (const it of tools()?.templates?.() ?? []) items.set(Rules.typeKey(it), { key: Rules.typeKey(it), name: `Любая разновидность: ${it.group === '*' ? root.__translate?.(it.name) || it.name : tools()?.nameOf?.(it) || it.name}` });
      for (const key of client.get().autoLoot.items) if (!items.has(key)) items.set(key, { key, name: `Сохранённое правило: ${key.startsWith('type:') ? key.slice(5) : 'предмет временно отсутствует'}` });
      let limit = 40;
      const updateInfo = () => { info.textContent = `Правил: ${client.get().autoLoot.items.length}. Выбранные теги ИЛИ любой выбранный предмет. Каталог: ${items.size}.`; };
      const render = () => {
        list.replaceChildren(); const picked = new Set(client.get().autoLoot.items), query = search.value.toLocaleLowerCase().trim();
        const found = [...items.values()].filter(it => !query || it.name.toLocaleLowerCase().includes(query));
        found.sort((a, b) => Number(picked.has(b.key)) - Number(picked.has(a.key)));
        for (const it of found.slice(0, limit)) {
          const row = checkbox(it.name, picked.has(it.key), yes => {
            const next = new Set(client.get().autoLoot.items); if (yes) next.add(it.key); else next.delete(it.key);
            update({ ...client.get().autoLoot, items: [...next] }); updateInfo();
          }); row.querySelector('input').dataset.itemKey = it.key; list.append(row);
        }
        if (found.length > limit) list.append(button('Показать ещё', () => { limit += 40; render(); }));
        updateInfo();
      };
      m.sync = () => {
        const a = client.get().autoLoot;
        enabled.querySelector('input').checked = a.enabled; picker.sync(a.tags);
        for (const input of list.querySelectorAll('input[data-item-key]')) input.checked = a.items.includes(input.dataset.itemKey);
        updateInfo();
      };
      search.oninput = () => { limit = 40; render(); }; render(); m.content(host); m.content(footer(button('Закрыть', m.close)));
    }
    function toolbar(parent, loot, refresh, options = {}) {
      if (!loot?.nearby) return;
      styles(); activeLoot = loot; repaint = refresh;
      const bar = el('div', 'dfo-loot-actions');
      for (const type of ['click', 'pointerdown', 'mousedown', 'mouseup']) bar.addEventListener(type, e => e.stopPropagation());
      const auto = button('Автолут', autoDialog); auto.dataset.autoButton = 'true'; auto.setAttribute('aria-pressed', String(client.get().autoLoot.enabled));
      const status = el('span', 'dfo-loot-status', lastError); status.setAttribute('role', 'status');
      const take = button('Забрать все', () => {
        if (take.disabled || stack.length || loot.isClosed()) return;
        take.disabled = true;
        try {
          const shown = () => options.shown?.() ?? loot.items(), result = loot.takeAll(shown());
          if (!result.failed && !shown().length && options.close) { options.close(); return; }
          const text = result.refusal || (result.failed ? 'Часть лута не удалось подобрать: предмет недоступен или не помещается в инвентарь.' : '');
          if (options.notice) options.notice(text); else { status.textContent = text; refresh?.(); }
        } catch (e) { if (options.notice) options.notice(errorOf(e)); else status.textContent = errorOf(e); }
        finally { take.disabled = false; }
      }); take.dataset.takeAll = 'true';
      bar.append(take, button('Лутфильтр', lootFilter), auto, status); parent.append(bar); return bar;
    }
    function classic(win, loot) {
      if (!win?.hooks || !loot.nearby) return () => {};
      styles(); const bar = el('div', 'dfo-loot-classicbar'); toolbar(bar, loot, () => { win._clampScroll?.(); win._clearInfo?.(); }, {
        close: () => win._close(), notice: text => { if (text) win.boxes.push({ rows: [{ text, center: true }] }); win._clampScroll?.(); win._clearInfo?.(); },
      }); doc.body.append(bar);
      return () => { closeAll(); bar.remove(); };
    }
    const closeAll = () => { for (const m of [...stack].reverse()) m.close(); };
    return { toolbar, classic, closeAll, isDialogOpen: () => stack.length > 0 };
  }
  if (typeof module === 'object' && module.exports) { module.exports = { createClient }; return; }
  if (root.__dfoLootUI && root.__dfoLootSettings) return;
  let storage; try { storage = root.localStorage; } catch { storage = null; }
  const client = root.__dfoLootSettings = createClient({ storage });
  root.__dfoLootUI = createUI({ client });
})(globalThis);
