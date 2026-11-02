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
.dfo-loot-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px;align-items:center}
.dfo-loot-button{font-family:var(--data,'Pixelify Sans',system-ui,sans-serif);font-size:12px;letter-spacing:.03em;cursor:pointer;padding:5px 12px;border:1px solid rgba(192,138,62,.45);border-radius:2px;background:rgba(43,50,59,.65);color:var(--bone,#f1e6c8);transition:background .15s,border-color .15s}
.dfo-loot-button:hover{background:rgba(78,127,114,.35);border-color:rgba(192,138,62,.85);color:#fff}
.dfo-loot-button:focus-visible,.dfo-loot-dialog input:focus-visible,.dfo-loot-dialog select:focus-visible{outline:2px solid #f2c443;outline-offset:1px}
.dfo-loot-button[aria-pressed="true"]{color:#211b10;background:#d8b34f;border-color:#ffe3a0;box-shadow:inset 0 0 6px rgba(192,138,62,.25)}
.dfo-loot-button[aria-pressed="false"]{background:rgba(43,50,59,.45);border-color:rgba(192,138,62,.25);color:var(--dim,#a9a08a)}
.dfo-loot-button.dfo-btn-sec{background:rgba(43,50,59,.45);border-color:rgba(192,138,62,.3);color:var(--dim,#a9a08a)}
.dfo-loot-button.dfo-btn-sec:hover{background:rgba(55,64,76,.6);border-color:rgba(192,138,62,.6);color:var(--bone,#f1e6c8)}
.dfo-loot-button:disabled{opacity:.45;cursor:wait}

.dfo-loot-dialog{box-sizing:border-box;position:fixed;inset:0;margin:auto;padding:0;width:min(980px,94vw);max-height:min(840px,90vh);display:flex;flex-direction:column;overflow:hidden;font-family:var(--data,'Pixelify Sans',system-ui,sans-serif);color:var(--bone,#f1e6c8);background:linear-gradient(180deg,rgba(23,27,33,.985),rgba(14,16,19,.985));border:1px solid rgba(192,138,62,.45);border-radius:3px;box-shadow:0 4px 28px rgba(0,0,0,.85)}
.dfo-loot-dialog::backdrop{background:rgba(0,0,0,.68)}
.dfo-loot-dialog.dfo-loot-small{width:min(520px,92vw);max-height:min(440px,80vh)}
.dfo-loot-dialog .wh{display:flex;align-items:center;gap:8px;padding:8px 12px 8px 14px;font-size:14px;letter-spacing:.05em;color:#f6e7b0;border-bottom:1px solid rgba(192,138,62,.25);user-select:none;flex-shrink:0}
.dfo-loot-dialog .wh .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;text-transform:uppercase}
.dfo-loot-dialog .wh button{background:none;border:0;color:var(--dim,#a9a08a);cursor:pointer;font:inherit;font-size:15px;padding:2px 6px;border-radius:2px;transition:color .15s,background .15s}
.dfo-loot-dialog .wh button:hover{color:#fff;background:rgba(255,255,255,.08)}
.dfo-loot-dialog .wb{overflow-y:auto;overscroll-behavior:contain;padding:12px 16px 14px;font-size:12.5px;line-height:1.45;min-height:0;flex:1}
.dfo-loot-dialog .acts{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:8px 14px;border-top:1px solid rgba(192,138,62,.2);background:rgba(18,21,26,.6);flex-shrink:0}
.dfo-loot-footer-btns{display:flex;gap:8px;margin-left:auto}

.dfo-loot-dialog p{margin:6px 0}
.dfo-loot-dialog fieldset{min-width:0;max-width:100%;border:1px solid rgba(192,138,62,.25);border-radius:2px;padding:8px 10px 10px;margin:8px 0;background:rgba(16,19,24,.4)}
.dfo-loot-dialog legend{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim,#a9a08a);padding:0 4px}
.dfo-loot-dialog input,.dfo-loot-dialog select{box-sizing:border-box;font:inherit;font-size:12px;color:var(--bone,#f1e6c8);background:rgba(22,26,33,.85);border:1px solid rgba(192,138,62,.35);border-radius:2px;padding:5px 8px}
.dfo-loot-dialog input[type="checkbox"]{accent-color:#d8b34f;width:14px;height:14px;margin:0;cursor:pointer}
.dfo-loot-dialog label{display:flex;align-items:center;gap:6px}
.dfo-loot-modes{display:flex;gap:6px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid rgba(192,138,62,.2)}
.dfo-loot-tag-controls{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 6px}
.dfo-loot-tag-controls input{flex:1;min-width:140px}

.dfo-loot-tags{min-width:0;width:100%;box-sizing:border-box;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 8px;max-height:48vh;overflow-y:auto;overflow-x:hidden;padding:4px 4px 8px 0;scrollbar-width:thin;scrollbar-color:rgba(192,138,62,.5) rgba(22,26,33,.8)}
.dfo-loot-tag{box-sizing:border-box;display:flex;align-items:center;gap:6px;padding:4px 7px;font-size:11.5px;background:rgba(35,42,50,.45);border:1px solid rgba(192,138,62,.22);border-radius:2px;cursor:pointer;user-select:none;min-height:28px;min-width:0;transition:background .12s,border-color .12s}
.dfo-loot-tag:hover{background:rgba(48,58,70,.6);border-color:rgba(192,138,62,.5)}
.dfo-loot-tag:has(input:checked){background:rgba(78,127,114,.28);border-color:rgba(192,138,62,.75);color:#f6e7b0}
.dfo-loot-tag .t-grp{color:var(--dim,#a9a08a);font-size:10.5px;flex-shrink:0}
.dfo-loot-tag .t-lbl{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.dfo-loot-form{margin:4px 0}
.dfo-loot-form input[type="text"]{width:100%;margin-top:4px}
.dfo-loot-list{display:flex;flex-direction:column;gap:4px;max-height:38vh;overflow-y:auto;margin:8px 0}
.dfo-loot-list button{text-align:left;padding:6px 10px;background:rgba(35,42,50,.45);border:1px solid rgba(192,138,62,.25);border-radius:2px;color:var(--bone,#f1e6c8);font-size:12px}
.dfo-loot-list button:hover{background:rgba(48,58,70,.6);border-color:rgba(192,138,62,.5)}
.dfo-loot-list button[aria-selected="true"]{background:rgba(78,127,114,.35);border-color:#f2c443;color:#f6e7b0}
.dfo-loot-status{min-height:1.4em;font-size:11.5px;color:#9fd3c7}
.dfo-loot-status[data-error="true"]{color:#ff9f98}
.dfo-loot-note{color:var(--dim,#a9a08a);font-size:11.5px;margin:4px 0 8px;line-height:1.4}
.dfo-loot-item-picker{max-height:220px;overflow-y:auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 8px;margin-top:6px}
.dfo-loot-classicbar{position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:15;display:flex;gap:10px;padding:8px 12px;background:linear-gradient(180deg,rgba(23,27,33,.96),rgba(14,16,19,.98));border:1px solid rgba(192,138,62,.45);border-radius:3px;box-shadow:0 4px 16px rgba(0,0,0,.7)}
`; doc.head.append(style);
    }
    function modal(title, { small = false, onClose = () => {} } = {}) {
      styles();
      const focused = doc.activeElement;
      const node = el('dialog', `dfo-panel dfo-win dfo-loot-dialog${small ? ' dfo-loot-small' : ''}`);
      const wh = el('div', 'wh');
      const heading = el('span', 't', title); heading.id = `dfo-loot-heading-${Date.now()}-${stack.length}`;
      node.setAttribute('aria-labelledby', heading.id);
      const wx = el('button', 'dfo-win-x', '✕'); wx.type = 'button'; wx.setAttribute('aria-label', `Закрыть окно «${title}»`);
      wh.append(heading, wx);

      const wb = el('div', 'wb');
      const acts = el('div', 'acts');
      const status = el('span', 'dfo-loot-status'); status.setAttribute('role', 'status');
      const footerWrap = el('div', 'dfo-loot-footer-btns');
      acts.append(status, footerWrap);

      node.append(wh, wb, acts);

      const state = { node, title, close: null, message(text, error = false) { status.textContent = text; status.dataset.error = String(error); } };
      state.close = () => {
        if (!stack.includes(state)) return;
        for (const nested of [...stack.slice(stack.indexOf(state) + 1)].reverse()) nested.close();
        stack.splice(stack.indexOf(state), 1); node.close(); node.remove(); onClose();
        if (focused?.isConnected) focused.focus();
      };
      wx.onclick = e => { e.preventDefault(); e.stopPropagation(); state.close(); };
      node.addEventListener('cancel', e => { e.preventDefault(); e.stopPropagation(); state.close(); });
      for (const type of ['click', 'mousedown', 'mouseup', 'pointerdown', 'wheel']) node.addEventListener(type, e => e.stopPropagation());
      doc.body.append(node);
      stack.push(state); node.showModal();
      state.content = n => {
        if (n.classList?.contains('dfo-loot-footer')) {
          footerWrap.replaceChildren(...n.childNodes);
        } else {
          wb.append(n);
        }
      };
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
    const checkbox = (text, checked, change, key, group = null) => {
      const n = el('label', 'dfo-loot-tag'), input = el('input'); input.type = 'checkbox'; input.checked = checked;
      if (key) input.dataset.tag = key;
      input.onchange = () => change(input.checked);
      n.title = group ? `${group}: ${text}` : text;
      n.append(input);
      if (group) { const g = el('span', 't-grp', `${group}:`); n.append(g); }
      n.append(el('span', 't-lbl', text));
      return n;
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
      const grid = el('div', 'dfo-loot-tags'); grid.setAttribute('aria-label', 'Теги в две колонки'); host.append(grid);
      const count = el('p', 'dfo-loot-note'); host.append(count);
      const render = () => {
        grid.replaceChildren(); const query = search.value.trim().toLocaleLowerCase();
        for (const t of all) {
          if (axis.value !== 'all' && t.axis !== axis.value) continue;
          if (query && !`${t.label} ${t.group}`.toLocaleLowerCase().includes(query)) continue;
          grid.append(checkbox(t.label, picked.has(t.id), yes => {
            if (yes) picked.add(t.id); else picked.delete(t.id); changed([...picked]); updateCount();
          }, t.id, t.group));
        }
      };
      const updateCount = () => { count.textContent = `Выбрано: ${picked.size}. Совпадение хотя бы одного тега. Выберите нужные теги в колонках.`; };
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
      form.id = 'dfo-loot-save-form';
      const label = el('label', null, 'Название: '), input = el('input'); input.type = 'text'; input.maxLength = 60; input.required = true; input.name = 'presetName'; label.append(input); form.append(label);
      const save = button('Сохранить', () => form.requestSubmit()); save.type = 'button';
      const cancel = button('Отмена', m.close, 'dfo-btn-sec');
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
      m.content(form);
      m.content(footer(save, cancel));
      input.focus();
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
      m.content(list); m.content(footer(load, button('Отмена', m.close, 'dfo-btn-sec')));
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
      m.sync(); m.content(footer(button('Сохранить', () => saveDialog(m)), button('Загрузить', () => loadDialog(m)), button('Закрыть', m.close, 'dfo-btn-sec')));
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
      search.oninput = () => { limit = 40; render(); }; render(); m.content(host); m.content(footer(button('Закрыть', m.close, 'dfo-btn-sec')));
    }
    function toolbar(parent, loot, refresh, options = {}) {
      if (!loot?.nearby) return;
      styles(); activeLoot = loot; repaint = refresh;
      const bar = el('div', 'dfo-loot-actions');
      for (const type of ['click', 'pointerdown', 'mousedown', 'mouseup', 'wheel']) bar.addEventListener(type, e => e.stopPropagation());
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
