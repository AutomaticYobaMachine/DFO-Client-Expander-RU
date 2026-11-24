(function (root) {
  'use strict';
  // The mod's own words, in the install's language (page/dfo_ui_text.js; English without the translation).
  const T = (key, params) => (root.__dfoUi ? root.__dfoUi.t(key, params) : key);
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
      if (!res.ok) { const e = new Error(data.code && root.__dfoUi?.has(data.code) ? T(data.code) : data.error || T('loot.saveFailed')); e.status = res.status; throw e; }
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
      const result = queue.then(() => { if (gen !== generation) throw new Error(T('loot.settingsChanged')); return work(); });
      queue = result.catch(() => { }); return result;
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
    const button = (text, fn, cls = '') => { const b = el('button', `dfo-loot-button ${cls}`.trim(), text); b.type = 'button'; b.onclick = fn; return b; };
    const errorOf = e => e?.message || String(e);
    const FRAME_SVG = "data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20width%3D'25'%20height%3D'25'%20shape-rendering%3D'crispEdges'%3E%3Crect%20x%3D'0'%20y%3D'0'%20width%3D'25'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'0'%20y%3D'1'%20width%3D'1'%20height%3D'24'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'1'%20y%3D'1'%20width%3D'9'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'10'%20y%3D'1'%20width%3D'1'%20height%3D'5'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'11'%20y%3D'1'%20width%3D'3'%20height%3D'1'%20fill%3D'%23c2b79a'%2F%3E%3Crect%20x%3D'14'%20y%3D'1'%20width%3D'1'%20height%3D'5'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'15'%20y%3D'1'%20width%3D'9'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'24'%20y%3D'1'%20width%3D'1'%20height%3D'24'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'1'%20y%3D'2'%20width%3D'1'%20height%3D'8'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'2'%20y%3D'2'%20width%3D'7'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'9'%20y%3D'2'%20width%3D'1'%20height%3D'4'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'11'%20y%3D'2'%20width%3D'3'%20height%3D'1'%20fill%3D'%239a9079'%2F%3E%3Crect%20x%3D'15'%20y%3D'2'%20width%3D'1'%20height%3D'4'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'16'%20y%3D'2'%20width%3D'7'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'23'%20y%3D'2'%20width%3D'1'%20height%3D'8'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'11'%20y%3D'3'%20width%3D'3'%20height%3D'1'%20fill%3D'%237a7260'%2F%3E%3Crect%20x%3D'2'%20y%3D'4'%20width%3D'2'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'4'%20y%3D'4'%20width%3D'3'%20height%3D'1'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'7'%20y%3D'4'%20width%3D'2'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'11'%20y%3D'4'%20width%3D'3'%20height%3D'1'%20fill%3D'%235a5446'%2F%3E%3Crect%20x%3D'16'%20y%3D'4'%20width%3D'2'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'18'%20y%3D'4'%20width%3D'3'%20height%3D'1'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'21'%20y%3D'4'%20width%3D'2'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'4'%20y%3D'5'%20width%3D'1'%20height%3D'2'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'5'%20y%3D'5'%20width%3D'1'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'6'%20y%3D'5'%20width%3D'1'%20height%3D'2'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'11'%20y%3D'5'%20width%3D'3'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'5'%20width%3D'1'%20height%3D'2'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'19'%20y%3D'5'%20width%3D'1'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'20'%20y%3D'5'%20width%3D'1'%20height%3D'2'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'5'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'7'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'8'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'9'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'10'%20y%3D'6'%20width%3D'5'%20height%3D'1'%20fill%3D'%2316140f'%2F%3E%3Crect%20x%3D'15'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'16'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'17'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'19'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'4'%20y%3D'7'%20width%3D'3'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'7'%20y%3D'7'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'8'%20y%3D'7'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'9'%20y%3D'7'%20width%3D'7'%20height%3D'1'%20fill%3D'%230c0d10'%2F%3E%3Crect%20x%3D'16'%20y%3D'7'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'17'%20y%3D'7'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'18'%20y%3D'7'%20width%3D'3'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'4'%20y%3D'8'%20width%3D'2'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'6'%20y%3D'8'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'7'%20y%3D'8'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'17'%20y%3D'8'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'8'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'19'%20y%3D'8'%20width%3D'2'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'2'%20y%3D'9'%20width%3D'4'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'6'%20y%3D'9'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'7'%20y%3D'9'%20width%3D'1'%20height%3D'7'%20fill%3D'%230c0d10'%2F%3E%3Crect%20x%3D'17'%20y%3D'9'%20width%3D'1'%20height%3D'7'%20fill%3D'%231c1a15'%2F%3E%3Crect%20x%3D'18'%20y%3D'9'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'19'%20y%3D'9'%20width%3D'4'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'1'%20y%3D'10'%20width%3D'5'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'6'%20y%3D'10'%20width%3D'1'%20height%3D'5'%20fill%3D'%2316140f'%2F%3E%3Crect%20x%3D'18'%20y%3D'10'%20width%3D'1'%20height%3D'5'%20fill%3D'%235a5446'%2F%3E%3Crect%20x%3D'19'%20y%3D'10'%20width%3D'5'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'1'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%23c2b79a'%2F%3E%3Crect%20x%3D'2'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%239a9079'%2F%3E%3Crect%20x%3D'3'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%237a7260'%2F%3E%3Crect%20x%3D'4'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%235a5446'%2F%3E%3Crect%20x%3D'5'%20y%3D'11'%20width%3D'1'%20height%3D'4'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'19'%20y%3D'11'%20width%3D'1'%20height%3D'4'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'20'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%234f4838'%2F%3E%3Crect%20x%3D'21'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%23443e31'%2F%3E%3Crect%20x%3D'22'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%233a352a'%2F%3E%3Crect%20x%3D'23'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%2325221b'%2F%3E%3Crect%20x%3D'1'%20y%3D'14'%20width%3D'4'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'20'%20y%3D'14'%20width%3D'4'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'1'%20y%3D'15'%20width%3D'1'%20height%3D'9'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'2'%20y%3D'15'%20width%3D'4'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'6'%20y%3D'15'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'15'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'19'%20y%3D'15'%20width%3D'4'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'23'%20y%3D'15'%20width%3D'1'%20height%3D'9'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'2'%20y%3D'16'%20width%3D'4'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'6'%20y%3D'16'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'7'%20y%3D'16'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'17'%20y%3D'16'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'16'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'19'%20y%3D'16'%20width%3D'4'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'6'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'7'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'8'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'9'%20y%3D'17'%20width%3D'7'%20height%3D'1'%20fill%3D'%231c1a15'%2F%3E%3Crect%20x%3D'16'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'17'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'18'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'2'%20y%3D'18'%20width%3D'2'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'4'%20y%3D'18'%20width%3D'1'%20height%3D'3'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'5'%20y%3D'18'%20width%3D'2'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'7'%20y%3D'18'%20width%3D'1'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'8'%20y%3D'18'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'9'%20y%3D'18'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'10'%20y%3D'18'%20width%3D'5'%20height%3D'1'%20fill%3D'%235a5446'%2F%3E%3Crect%20x%3D'15'%20y%3D'18'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'16'%20y%3D'18'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'17'%20y%3D'18'%20width%3D'1'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'18'%20y%3D'18'%20width%3D'2'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'20'%20y%3D'18'%20width%3D'1'%20height%3D'3'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'21'%20y%3D'18'%20width%3D'2'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'5'%20y%3D'19'%20width%3D'1'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'6'%20y%3D'19'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'8'%20y%3D'19'%20width%3D'1'%20height%3D'4'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'9'%20y%3D'19'%20width%3D'1'%20height%3D'4'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'10'%20y%3D'19'%20width%3D'5'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'15'%20y%3D'19'%20width%3D'1'%20height%3D'4'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'16'%20y%3D'19'%20width%3D'1'%20height%3D'4'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'18'%20y%3D'19'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'19'%20y%3D'19'%20width%3D'1'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'5'%20y%3D'20'%20width%3D'2'%20height%3D'1'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'10'%20y%3D'20'%20width%3D'1'%20height%3D'5'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'11'%20y%3D'20'%20width%3D'3'%20height%3D'1'%20fill%3D'%234f4838'%2F%3E%3Crect%20x%3D'14'%20y%3D'20'%20width%3D'1'%20height%3D'5'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'20'%20width%3D'2'%20height%3D'1'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'4'%20y%3D'21'%20width%3D'3'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'11'%20y%3D'21'%20width%3D'3'%20height%3D'1'%20fill%3D'%23443e31'%2F%3E%3Crect%20x%3D'18'%20y%3D'21'%20width%3D'3'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'11'%20y%3D'22'%20width%3D'3'%20height%3D'1'%20fill%3D'%233a352a'%2F%3E%3Crect%20x%3D'2'%20y%3D'23'%20width%3D'8'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'11'%20y%3D'23'%20width%3D'3'%20height%3D'1'%20fill%3D'%2325221b'%2F%3E%3Crect%20x%3D'15'%20y%3D'23'%20width%3D'8'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'1'%20y%3D'24'%20width%3D'9'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'11'%20y%3D'24'%20width%3D'3'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'15'%20y%3D'24'%20width%3D'9'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3C%2Fsvg%3E";
    let lootSvgUid = 0;
    const RARITY_ICONS = {
      common: {
        defs: [{ tag: 'linearGradient', id: 'r', x1: 0, y1: 0, x2: 1, y2: 1, stops: [['0%', '#c8c1b0'], ['50%', '#827a68'], ['100%', '#3b372e']] }],
        shapes: [{ d: 'M12 2.4L20.4 12L12 21.6L3.6 12Z', fill: '@r', stroke: '#09090b', 'stroke-width': 1.15, 'stroke-linejoin': 'round' }, { d: 'M12 6.8L16.4 12L12 17.2L7.6 12Z', fill: '#635c4e', stroke: '#c8c1b0', 'stroke-width': 0.7 }],
      },
      magic: {
        defs: [{ tag: 'radialGradient', id: 'g', cx: '38%', cy: '34%', r: '66%', stops: [['0%', '#eff6ff'], ['40%', '#60a5fa'], ['80%', '#2563eb'], ['100%', '#172554']] }],
        shapes: [{ d: 'M12 1.8L18.8 7.5V16.5L12 22.2L5.2 16.5V7.5Z', fill: '@g', stroke: '#070b14', 'stroke-width': 1.15, 'stroke-linejoin': 'round' }, { d: 'M12 7.5L14.8 12L12 16.5L9.2 12Z', fill: '#eff6ff', stroke: '#60a5fa', 'stroke-width': 0.6 }],
      },
      rare: {
        defs: [{ tag: 'linearGradient', id: 'g', x1: 0, y1: 0, x2: 1, y2: 1, stops: [['0%', '#fef9c3'], ['45%', '#e4c34f'], ['100%', '#4d2f06']] }],
        shapes: [{ d: 'M12 1.7L20.5 6.8V17.2L12 22.3L3.5 17.2V6.8Z', fill: '@g', stroke: '#0c0804', 'stroke-width': 1.15, 'stroke-linejoin': 'round' }, { d: 'M12 5.4L13.5 9.4L17.7 8.7L15 12L17.7 15.3L13.5 14.6L12 18.6L10.5 14.6L6.3 15.3L9 12L6.3 8.7L10.5 9.4Z', fill: '#fef3c7', stroke: '#78350f', 'stroke-width': 0.6 }],
      },
      legendary: {
        defs: [{ tag: 'linearGradient', id: 'f', x1: 0, y1: 0, x2: 0.3, y2: 1, stops: [['0%', '#fef08a'], ['40%', '#fb923c'], ['100%', '#5c1708']] }],
        shapes: [{ d: 'M12 1.7L15.1 8.5L21 5.6L18.9 15.8L12 22.1L5.1 15.8L3 5.6L8.9 8.5Z', fill: '@f', stroke: '#0e0603', 'stroke-width': 1.15, 'stroke-linejoin': 'round' }, { d: 'M12 9.4L15.1 13.6L12 17.8L8.9 13.6Z', fill: '#fffbeb', stroke: '#f97316', 'stroke-width': 0.7 }],
      },
      aetheric: {
        defs: [{ tag: 'radialGradient', id: 's', cx: '50%', cy: '50%', r: '54%', stops: [['0%', '#ffffff'], ['45%', '#e0f2fe'], ['82%', '#7dd3fc'], ['100%', '#0284c7']] }],
        shapes: [{ tag: 'circle', cx: 12, cy: 12, r: 8.6, fill: '#0a1c2e', stroke: '#bae6fd', 'stroke-width': 1.25 }, { d: 'M12 1.8L14.2 9.8L22.2 12L14.2 14.2L12 22.2L9.8 14.2L1.8 12L9.8 9.8Z', fill: '@s', stroke: '#0c3556', 'stroke-width': 0.9 }],
      },
      artifact: {
        defs: [{ tag: 'linearGradient', id: 'a', x1: 0, y1: 0, x2: 1, y2: 1, stops: [['0%', '#f3e8ff'], ['42%', '#b57bee'], ['100%', '#2e1065']] }],
        shapes: [{ d: 'M12 2L15.6 8.4L22 12L15.6 15.6L12 22L8.4 15.6L2 12L8.4 8.4Z', fill: '@a', stroke: '#0b0612', 'stroke-width': 1.1, 'stroke-linejoin': 'round' }, { d: 'M12 8.4L15.1 12L12 15.6L8.9 12Z', fill: '#2e1065', stroke: '#f3e8ff', 'stroke-width': 0.75 }],
      },
      gilded: {
        defs: [{ tag: 'linearGradient', id: 'g', x1: 0, y1: 0, x2: 1, y2: 1, stops: [['0%', '#fff7cc'], ['45%', '#f5d451'], ['100%', '#5c3406']] }, { tag: 'radialGradient', id: 'c', cx: '45%', cy: '38%', r: '62%', stops: [['0%', '#ff8590'], ['45%', '#ff3b4a'], ['100%', '#45060d']] }],
        shapes: [{ d: 'M4.8 11.4H19.2L17.4 17.8L12 22.1L6.6 17.8Z', fill: '@c', stroke: '#0d0606', 'stroke-width': 1.1 }, { d: 'M3 6.2L7.2 9.4L12 3.2L16.8 9.4L21 6.2L19.2 12.6H4.8Z', fill: '@g', stroke: '#0d0606', 'stroke-width': 1.1, 'stroke-linejoin': 'round' }],
      },
    };
    function raritySvg(key) {
      const spec = RARITY_ICONS[key];
      if (!spec) return null;
      const ns = 'http://www.w3.org/2000/svg';
      const mk = tag => (doc.createElementNS ? doc.createElementNS(ns, tag) : doc.createElement(tag));
      const p = `dfolt${++lootSvgUid}_`;
      const resolve = v => (typeof v === 'string' && v.startsWith('@') ? `url(#${p}${v.slice(1)})` : String(v));
      const svg = mk('svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('class', 'dfo-loot-rar-ico');
      svg.setAttribute('aria-hidden', 'true');
      const defs = mk('defs');
      for (const g of spec.defs || []) {
        const grad = mk(g.tag || 'linearGradient');
        for (const [k, v] of Object.entries(g)) { if (k !== 'tag' && k !== 'stops') grad.setAttribute(k, k === 'id' ? p + v : String(v)); }
        for (const [o, c] of g.stops || []) { const st = mk('stop'); st.setAttribute('offset', o); st.setAttribute('stop-color', c); grad.append(st); }
        defs.append(grad);
      }
      svg.append(defs);
      for (const s of spec.shapes || []) {
        const n = mk(s.tag || 'path');
        for (const [k, v] of Object.entries(s)) { if (k !== 'tag') n.setAttribute(k, resolve(v)); }
        svg.append(n);
      }
      return svg;
    }
    function styles() {
      if (doc.getElementById('dfo-loot-styles')) return;
      const style = el('style'); style.id = 'dfo-loot-styles'; style.textContent = `
.loot-win.dfo-nearby-loot{height:min(700px,86dvh)}
.dfo-loot-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px;align-items:center}
/* C-01 Canonical Ornate Corner-Bracket Buttons */
.dfo-loot-button{--dfo-c:#d4b16a;position:relative;display:inline-flex;align-items:center;justify-content:center;gap:6px;box-sizing:border-box;min-height:30px;padding:5px 13px;font-family:'DFO Gabin',var(--data,serif);font-size:12px;letter-spacing:.03em;line-height:1.2;text-shadow:0 1px 0 #000;cursor:pointer;border-radius:1px;border:1px solid #6e5c3e;border-top-color:#9e8355;border-bottom-color:#3b301f;background:linear-gradient(180deg,#272219 0%,#191510 55%,#120f0b 100%);box-shadow:inset 0 1px 0 rgba(255,224,150,.14),inset 0 -1px 0 rgba(0,0,0,.72),0 1px 2px rgba(0,0,0,.55);color:#f1e6c8;transition:filter 120ms ease,transform 80ms ease,border-color 120ms ease}
.dfo-loot-button::before{content:'';position:absolute;inset:2px;border:1px solid rgba(213,178,110,.22);pointer-events:none}
.dfo-loot-button::after{content:'';position:absolute;inset:2px;pointer-events:none;background:linear-gradient(var(--dfo-c),var(--dfo-c)) top left/5px 1px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) top left/1px 5px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) top right/5px 1px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) top right/1px 5px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) bottom left/5px 1px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) bottom left/1px 5px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) bottom right/5px 1px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) bottom right/1px 5px no-repeat}
.dfo-loot-button:hover:not(:disabled){filter:brightness(1.16);border-color:#9e8355;border-top-color:#d5b26e;color:#f6e7b0}
.dfo-loot-button:active:not(:disabled){transform:translateY(1px);filter:brightness(.95)}
.dfo-loot-button:focus-visible,.dfo-loot-dialog input:focus-visible,.dfo-loot-dialog select:focus-visible{outline:2px solid #f2c443;outline-offset:1px}
.dfo-loot-button[aria-pressed="true"],.dfo-loot-button.dfo-btn-prim,.dfo-loot-footer-btns>.dfo-loot-button:first-child:not(.dfo-btn-sec){--dfo-c:#fde68a;border-color:#a6823f;border-top-color:#e4c175;border-bottom-color:#4f3b18;background:linear-gradient(180deg,#4b391a 0%,#2f230e 56%,#1f1709 100%);color:#fde68a}
.dfo-loot-button[aria-pressed="true"]::before,.dfo-loot-button.dfo-btn-prim::before,.dfo-loot-footer-btns>.dfo-loot-button:first-child:not(.dfo-btn-sec)::before{border-color:rgba(253,230,138,.32)}
.dfo-loot-dialog:not(.dfo-loot-small) .dfo-loot-button.dfo-btn-sec{--dfo-c:#f08a80;border-color:#a1463e #4c1b18 #2d0e0c #782e28;background:repeating-linear-gradient(-45deg,rgba(176,56,48,.22) 0 4px,rgba(16,7,9,.34) 4px 8px),linear-gradient(180deg,#3d1618 0%,#250c0e 58%,#160709 100%);box-shadow:0 0 0 1px #050608,inset 0 0 0 1px rgba(240,138,128,.18),inset 0 1px 0 rgba(255,204,198,.16);color:#fce0dc}
.dfo-loot-dialog:not(.dfo-loot-small) .dfo-loot-button.dfo-btn-sec::before{border-color:rgba(240,138,128,.28)}
.dfo-loot-dialog:not(.dfo-loot-small) .dfo-loot-button.dfo-btn-sec:hover:not(:disabled){--dfo-c:#ffb0a7;border-color:#c85a46;background:repeating-linear-gradient(-45deg,rgba(212,78,66,.28) 0 4px,rgba(22,9,11,.28) 4px 8px),linear-gradient(180deg,#521d20 0%,#341114 58%,#200a0c 100%);box-shadow:0 0 0 1px #050608,0 0 10px rgba(200,90,70,.3),inset 0 0 0 1px rgba(255,176,167,.28);color:#fff0ee}
.dfo-loot-button:disabled{opacity:.45;cursor:default;filter:grayscale(.4)}

/* L-01 Outer Global Frame (large dialogs) + Default Paint Chiseled Frame (small dialogs), Muted High-Contrast Window Header */
.dfo-loot-dialog{box-sizing:border-box;position:fixed;inset:0;margin:auto;padding:0;width:min(980px,94vw);max-height:min(840px,90vh);display:flex;flex-direction:column;overflow:hidden;font-family:'DFO Gabin',var(--data,serif);color:#e9e4d9;background-color:var(--dfo-bg-window,rgba(12,14,18,.94));background-image:var(--dfo-bg-dither-img,repeating-conic-gradient(rgba(255,255,255,.022) 0 25%,transparent 0 50%));background-size:var(--dfo-bg-dither-size,4px 4px);border:2px solid #7d7460;border-image:url("${FRAME_SVG}") 12 / 12px / 6px stretch;box-shadow:4px 4px 0 6px rgba(0,0,0,.42),0 14px 36px rgba(0,0,0,.85);border-radius:0}
.dfo-loot-dialog::backdrop{background:var(--dfo-bg-scrim,rgba(5,7,10,.72))}
.dfo-loot-dialog.dfo-loot-small{width:min(520px,92vw);max-height:min(440px,80vh);border-image:none;background-color:var(--dfo-bg-panel-elevated,rgba(23,27,33,.96));background-image:linear-gradient(180deg,rgba(154,144,121,.07) 0,rgba(154,144,121,.02) 48px,transparent 110px);border:2px solid;border-color:#9a9079 #3a352a #25221b #7a7260;box-shadow:0 0 0 1px #050608,inset 0 0 0 1px rgba(5,6,8,.75),0 14px 36px rgba(0,0,0,.85)}
.dfo-loot-dialog .wh{display:flex;align-items:center;gap:8px;padding:10px 12px 10px 16px;color:#f6e7b0;background-color:rgba(14,16,21,.94);background-image:linear-gradient(180deg,rgba(62,56,44,.38) 0%,rgba(24,26,32,.55) 56%,rgba(10,12,16,.72) 100%);border-bottom:1px solid #050608;box-shadow:0 1px 0 rgba(163,152,128,.28),inset 0 1px 0 rgba(255,244,214,.08);user-select:none;flex-shrink:0}
.dfo-loot-dialog .wh .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:'DFO Greengoth',var(--display,Georgia,serif);font-size:16px;letter-spacing:.07em;text-transform:uppercase;text-shadow:0 2px 0 #000,0 0 6px rgba(0,0,0,.75)}
.dfo-loot-dialog .wh .t::before{content:'◆ ';font-size:10px;color:#b7a071;vertical-align:1px;margin-right:4px;text-shadow:none}
.dfo-loot-dialog .wh button{background:rgba(14,16,21,.88);border:1px solid rgba(154,144,121,.48);color:#d7cbb0;cursor:pointer;font:inherit;font-size:14px;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;border-radius:1px;box-shadow:inset 0 1px 0 rgba(255,244,214,.10);transition:color 120ms ease,background 120ms ease,border-color 120ms ease}
.dfo-loot-dialog .wh button:hover{color:#fff7dc;border-color:#d5b26e;background:rgba(213,178,110,.14)}
.dfo-loot-dialog .wb{overflow-y:auto;overscroll-behavior:contain;padding:12px 16px 14px;font-size:12.5px;line-height:1.45;min-height:0;flex:1;scrollbar-width:thin;scrollbar-color:#756346 #0c0e11}
.dfo-loot-dialog .acts{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:9px 14px;border-top:1px solid #050608;box-shadow:inset 0 1px 0 rgba(163,152,128,.24);background:var(--dfo-bg-footer,rgba(0,0,0,.24));flex-shrink:0}
.dfo-loot-footer-btns{display:flex;gap:8px;margin-left:auto}

.dfo-loot-dialog p{margin:6px 0}
/* Default Paint L-03 Fieldsets (#9a9079 stone-pewter) */
:where(.dfo-loot-dialog fieldset){--dfo-panel-c:#9a9079;--dfo-panel-rgb:154,144,121}
.dfo-loot-dialog fieldset{min-width:0;max-width:100%;padding:0 11px 11px;margin:10px 0 6px;overflow:hidden;background-color:var(--dfo-bg-panel,rgba(15,17,22,.92));background-image:linear-gradient(180deg,rgba(var(--dfo-panel-rgb),.08) 0,rgba(var(--dfo-panel-rgb),.024) 50px,transparent 148px);border:2px solid;border-color:var(--dfo-panel-c) #3a352a #25221b #7a7260;box-shadow:0 0 0 1px #050608,inset 0 0 0 1px rgba(5,6,8,.75),3px 3px 0 1px rgba(0,0,0,.4);border-radius:0}
.dfo-loot-dialog legend{float:left;box-sizing:border-box;width:calc(100% + 22px);margin:0 -11px 9px;padding:6px 12px;font-family:'DFO Greengoth',var(--display,Georgia,serif);font-size:12.5px;letter-spacing:.07em;text-transform:uppercase;color:#e7d6a9;background-color:rgba(14,17,22,.68);background-image:linear-gradient(180deg,rgba(var(--dfo-panel-rgb),.12),rgba(var(--dfo-panel-rgb),.025)),var(--dfo-bg-header,linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.015)));border:0;border-bottom:1px solid rgba(var(--dfo-panel-rgb),.32);box-shadow:0 1px 0 rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.05);text-shadow:0 1px 0 #000}
.dfo-loot-dialog legend::before{content:'◆ ';font-size:9px;color:#b7a071;vertical-align:1px;margin-right:4px;text-shadow:none}
.dfo-loot-dialog fieldset>:not(legend){clear:both}
.dfo-loot-dialog input,.dfo-loot-dialog select{box-sizing:border-box;font-family:'DFO Gabin',var(--data,serif);font-size:12px;color:#f1e6c8;background:var(--dfo-bg-input,rgba(4,5,7,.78));border:1px solid #6b5839;border-radius:0;padding:5px 9px;box-shadow:inset 0 1px 4px rgba(0,0,0,.75)}
.dfo-loot-dialog input[type="checkbox"]{appearance:none;-webkit-appearance:none;width:15px;height:15px;margin:0;padding:0;flex:none;cursor:pointer;background:linear-gradient(180deg,#090b0f,#141820);border:1px solid #7c6745;border-radius:1px;box-shadow:inset 0 1px 2px rgba(0,0,0,.85);position:relative;transition:border-color 110ms ease,background-color 110ms ease}
.dfo-loot-dialog input[type="checkbox"]:hover{border-color:#d5b26e}
.dfo-loot-dialog input[type="checkbox"]:checked{background:linear-gradient(180deg,#523e1a,#2f220c);border-color:#f5d451;box-shadow:0 0 6px rgba(245,212,81,.32),inset 0 1px 0 rgba(255,240,180,.28)}
.dfo-loot-dialog input[type="checkbox"]:checked::after{content:'';position:absolute;left:4px;top:1px;width:4px;height:8px;border:solid #fde68a;border-width:0 2px 2px 0;transform:rotate(42deg)}
.dfo-loot-dialog label{display:flex;align-items:center;gap:7px}
.dfo-loot-modes{display:flex;gap:8px;margin-bottom:8px;padding-bottom:9px;border-bottom:1px solid rgba(192,138,62,.28)}
.dfo-loot-tag-controls{display:flex;gap:8px;flex-wrap:wrap;margin:2px 0 8px}
.dfo-loot-tag-controls input{flex:1;min-width:140px}

/* L-02 Recessed Well + F-04 Scrollbars */
.dfo-loot-tags,.dfo-loot-item-picker,.dfo-loot-list{background:var(--dfo-bg-well,rgba(8,10,13,.9));border:2px solid;border-color:#25221b #7a7260 #9a9079 #3a352a;box-shadow:0 0 0 1px #050608,inset 2px 2px 0 rgba(0,0,0,.5);scrollbar-width:thin;scrollbar-color:#756346 #0c0e11}
.dfo-loot-dialog :is(.wb,.dfo-loot-tags,.dfo-loot-item-picker,.dfo-loot-list)::-webkit-scrollbar{width:7px;height:7px}
.dfo-loot-dialog :is(.wb,.dfo-loot-tags,.dfo-loot-item-picker,.dfo-loot-list)::-webkit-scrollbar-track{background:#0c0e11}
.dfo-loot-dialog :is(.wb,.dfo-loot-tags,.dfo-loot-item-picker,.dfo-loot-list)::-webkit-scrollbar-thumb{background:linear-gradient(180deg,#5e4f37,#3e3424);border:1px solid #14171c}
.dfo-loot-tags{min-width:0;width:100%;box-sizing:border-box;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px 8px;max-height:48vh;overflow-y:auto;overflow-x:hidden;padding:8px}
.dfo-loot-tag{--dfo-tag-c:rgba(192,138,62,.38);box-sizing:border-box;display:flex;align-items:center;gap:7px;padding:5px 8px;font-size:11.5px;background:var(--dfo-bg-row,rgba(16,19,24,.88));border:1px solid rgba(117,99,70,.36);border-left:3px solid var(--dfo-tag-c);border-radius:1px;cursor:pointer;user-select:none;min-height:30px;min-width:0;transition:background-color 110ms ease,border-color 110ms ease}
.dfo-loot-tag:has(input[data-tag="rarity:common"]){--dfo-tag-c:#9a9079}
.dfo-loot-tag:has(input[data-tag="rarity:magic"]){--dfo-tag-c:#60a5fa}
.dfo-loot-tag:has(input[data-tag="rarity:rare"]){--dfo-tag-c:#e4c34f}
.dfo-loot-tag:has(input[data-tag="rarity:legendary"]){--dfo-tag-c:#e07a2e}
.dfo-loot-tag:has(input[data-tag="rarity:aetheric"]){--dfo-tag-c:#bfe8ff}
.dfo-loot-tag:has(input[data-tag="rarity:artifact"]){--dfo-tag-c:#b57bee}
.dfo-loot-tag:has(input[data-tag="rarity:gilded"]){--dfo-tag-c:#ff3b4a}
.dfo-loot-tag:hover{background:var(--dfo-bg-row-hover,rgba(38,42,51,.92));border-color:rgba(213,178,110,.62)}
.dfo-loot-tag:has(input:checked){background:linear-gradient(90deg,rgba(213,178,110,.16),rgba(154,144,121,.06));border-color:rgba(213,178,110,.68);border-left-color:#d5b26e;color:#f6e7b0}
.dfo-loot-tag .dfo-loot-rar-ico{width:15px;height:15px;flex:0 0 15px;filter:drop-shadow(0 1px 1px rgba(0,0,0,.85))}
.dfo-loot-tag .t-grp{color:#a9a08a;font-size:10.5px;flex-shrink:0}
.dfo-loot-tag .t-lbl{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.dfo-loot-form{margin:4px 0}
.dfo-loot-form input[type="text"]{width:100%;margin-top:4px}
.dfo-loot-list{display:flex;flex-direction:column;gap:5px;max-height:38vh;overflow-y:auto;margin:8px 0;padding:8px}
.dfo-loot-list button{justify-content:flex-start;text-align:left;padding:6px 10px;width:100%}
.dfo-loot-list button[aria-selected="true"]{--dfo-c:#fde68a;border-color:#c08a3e;background:var(--dfo-bg-row-selected,rgba(78,127,114,.32));color:#f6e7b0}
.dfo-loot-status{min-height:1.4em;font-size:11.5px;color:#7fe3b5}
.dfo-loot-status[data-error="true"]{color:#ff9f98}
.dfo-loot-note{color:#b7a889;font-size:11.5px;margin:6px 0 4px;line-height:1.4}
.dfo-loot-item-picker{max-height:220px;overflow-y:auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px 8px;margin-top:6px;padding:8px}
.dfo-loot-classicbar{position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:15;display:flex;gap:10px;padding:8px 12px;background-color:var(--dfo-bg-panel-elevated,rgba(20,23,30,.96));background-image:linear-gradient(180deg,rgba(154,144,121,.08) 0%,transparent 48px);border:2px solid;border-color:#9a9079 #3a352a #25221b #7a7260;box-shadow:0 0 0 1px #050608,0 6px 20px rgba(0,0,0,.78);border-radius:0}
`; doc.head.append(style);
    }
    function modal(title, { small = false, onClose = () => { } } = {}) {
      styles();
      const focused = doc.activeElement;
      const node = el('dialog', `dfo-panel dfo-win dfo-loot-dialog${small ? ' dfo-loot-small' : ' dfo-window-frame'}`);
      const wh = el('div', 'wh');
      const heading = el('span', 't', title); heading.id = `dfo-loot-heading-${Date.now()}-${stack.length}`;
      node.setAttribute('aria-labelledby', heading.id);
      const wx = el('button', 'dfo-win-x', '✕'); wx.type = 'button'; wx.setAttribute('aria-label', T('loot.closeWindow', { title: title }));
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
      if (typeof key === 'string' && key.startsWith('rarity:')) {
        const ico = raritySvg(key.slice(7));
        if (ico) n.append(ico);
      }
      if (group) { const g = el('span', 't-grp', `${group}:`); n.append(g); }
      n.append(el('span', 't-lbl', text));
      return n;
    };
    function tagPicker(selected, changed) {
      const all = Rules.catalog(tools()), picked = new Set(selected), host = el('fieldset'), controls = el('div', 'dfo-loot-tag-controls');
      const known = new Set(all.map(t => t.id));
      for (const id of selected) if (!known.has(id)) { known.add(id); all.push({ id, axis: 'saved', group: T('loot.tags.saved'), label: T('loot.tags.unavailable', { id: id }) }); }
      host.append(el('legend', null, T('loot.tags.legend')));
      const axis = el('select'); axis.setAttribute('aria-label', T('loot.tags.group'));
      for (const [id, name] of [['all', T('loot.tags.all')], ...new Map(all.map(t => [t.axis, t.group])).entries()]) {
        const o = el('option', null, name); o.value = id; axis.append(o);
      }
      const search = el('input'); search.type = 'search'; search.placeholder = T('loot.tags.find'); search.setAttribute('aria-label', T('loot.tags.search'));
      controls.append(axis, search); host.append(controls);
      const grid = el('div', 'dfo-loot-tags'); grid.setAttribute('aria-label', T('loot.tags.grid')); host.append(grid);
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
      const updateCount = () => { count.textContent = T('loot.tags.count', { n: picked.size }); };
      host.sync = tags => {
        picked.clear(); for (const tag of tags) picked.add(tag);
        let added = false;
        for (const id of tags) if (!known.has(id)) { known.add(id); all.push({ id, axis: 'saved', group: T('loot.tags.saved'), label: T('loot.tags.unavailable', { id: id }) }); added = true; }
        if (added) {
          if (![...axis.options].some(o => o.value === 'saved')) { const o = el('option', null, T('loot.tags.saved')); o.value = 'saved'; axis.append(o); }
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
      const m = modal(T('loot.preset.nameTitle'), { small: true }), form = el('form', 'dfo-loot-form');
      form.id = 'dfo-loot-save-form';
      const label = el('label', null, T('loot.preset.nameLabel')), input = el('input'); input.type = 'text'; input.maxLength = 60; input.required = true; input.name = 'presetName'; label.append(input); form.append(label);
      const save = button(T('loot.save'), () => form.requestSubmit(), 'dfo-btn-prim'); save.type = 'button';
      const cancel = button(T('loot.cancel'), m.close, 'dfo-btn-sec');
      form.onsubmit = async e => {
        e.preventDefault(); if (save.disabled) return; save.disabled = true;
        try {
          const result = await client.savePreset(input.value);
          try { download(result); parent.message(T('loot.preset.saved', { name: result.preset.name })); }
          catch { parent.message(T('loot.preset.savedNoExport', { name: result.preset.name }), true); }
          m.close();
        }
        catch (err) { m.message(errorOf(err), true); } finally { save.disabled = false; }
      };
      m.content(form);
      m.content(footer(save, cancel));
      input.focus();
    }
    async function loadDialog(parent) {
      const m = modal(T('loot.preset.loadTitle'), { small: true });
      let chosen = null;
      const list = el('div', 'dfo-loot-list'); list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', T('loot.preset.list'));
      const load = button(T('loot.load'), async () => {
        if (!chosen || load.disabled) return; load.disabled = true;
        try { await client.update({ filter: chosen.filter }); parent.sync?.(); parent.message(T('loot.preset.loaded', { name: chosen.name })); m.close(); }
        catch (e) { m.message(errorOf(e), true); } finally { load.disabled = false; }
      }, 'dfo-btn-prim'); load.disabled = true;
      m.content(list); m.content(footer(load, button(T('loot.cancel'), m.close, 'dfo-btn-sec')));
      try { await client.refresh(); } catch (e) { m.message(errorOf(e), true); }
      if (!m.node.isConnected) return;
      for (const p of client.get().presets) {
        const b = button(T('loot.preset.row', { name: p.name, mode: T(p.filter.mode === 'white' ? 'loot.mode.white' : 'loot.mode.black'), n: p.filter.tags.length }), () => {
          chosen = p; load.disabled = false;
          for (const row of list.children) { row.setAttribute('aria-selected', String(row === b)); row.setAttribute('aria-pressed', String(row === b)); }
        }); b.setAttribute('role', 'option'); b.setAttribute('aria-selected', 'false'); list.append(b);
      }
      if (!list.children.length) list.append(el('p', null, T('loot.preset.none')));
    }
    function lootFilter() {
      if (stack.length) return;
      const m = modal(T('loot.filter'), { onClose: () => { if (!activeLoot?.isClosed?.()) repaint?.(); } }), body = el('div'); m.content(body);
      const update = patch => { client.update(patch).catch(e => m.message(errorOf(e), true)); };
      const modes = el('div', 'dfo-loot-modes'), buttons = new Map();
      for (const [id, word] of [['white', T('loot.mode.whiteList')], ['black', T('loot.mode.blackList')]]) {
        const b = button(word, () => { if (client.get().filter.mode !== id) update({ filter: { ...client.get().filter, mode: id } }); });
        buttons.set(id, b); modes.append(b);
      }
      const picker = tagPicker(client.get().filter.tags, tags => update({ filter: { ...client.get().filter, tags } }));
      body.append(modes, el('p', 'dfo-loot-note', T('loot.mode.note')), picker);
      m.sync = () => {
        const f = client.get().filter;
        for (const [id, b] of buttons) b.setAttribute('aria-pressed', String(f.mode === id));
        picker.sync(f.tags);
      };
      m.sync(); m.content(footer(button(T('loot.save'), () => saveDialog(m)), button(T('loot.load'), () => loadDialog(m)), button(T('loot.close'), m.close, 'dfo-btn-sec')));
    }
    function autoDialog() {
      if (stack.length) return;
      const m = modal(T('loot.auto.title'), { onClose: () => { if (!activeLoot?.isClosed?.()) repaint?.(); } });
      const note = el('p', 'dfo-loot-note', T('loot.auto.note')); m.content(note);
      const update = auto => client.update({ autoLoot: auto }).catch(e => m.message(errorOf(e), true));
      const enabled = checkbox(T('loot.auto.enabled'), client.get().autoLoot.enabled, yes => update({ ...client.get().autoLoot, enabled: yes })); enabled.querySelector('input').dataset.autolootEnabled = 'true'; m.content(enabled);
      const picker = tagPicker(client.get().autoLoot.tags, tags => update({ ...client.get().autoLoot, tags })); m.content(picker);
      const host = el('fieldset'); host.append(el('legend', null, T('loot.auto.items')));
      const search = el('input'); search.type = 'search'; search.placeholder = T('loot.auto.find'); search.setAttribute('aria-label', T('loot.auto.search')); host.append(search);
      const list = el('div', 'dfo-loot-item-picker'); host.append(list); const info = el('p', 'dfo-loot-note'); host.append(info);
      const items = new Map();
      for (const it of activeLoot?.rawItems?.() ?? []) items.set(Rules.variantKey(it), { key: Rules.variantKey(it), name: T('loot.auto.nearby', { name: it.group === '*' ? root.__translate?.(it.name) || it.name : tools()?.nameOf?.(it) || it.name }) });
      for (const it of tools()?.templates?.() ?? []) items.set(Rules.typeKey(it), { key: Rules.typeKey(it), name: T('loot.auto.anyKind', { name: it.group === '*' ? root.__translate?.(it.name) || it.name : tools()?.nameOf?.(it) || it.name }) });
      for (const key of client.get().autoLoot.items) if (!items.has(key)) items.set(key, { key, name: T('loot.auto.savedRule', { name: key.startsWith('type:') ? key.slice(5) : T('loot.auto.missing') }) });
      let limit = 40;
      const updateInfo = () => { info.textContent = T('loot.auto.info', { n: client.get().autoLoot.items.length, catalog: items.size }); };
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
        if (found.length > limit) list.append(button(T('loot.more'), () => { limit += 40; render(); }));
        updateInfo();
      };
      m.sync = () => {
        const a = client.get().autoLoot;
        enabled.querySelector('input').checked = a.enabled; picker.sync(a.tags);
        for (const input of list.querySelectorAll('input[data-item-key]')) input.checked = a.items.includes(input.dataset.itemKey);
        updateInfo();
      };
      search.oninput = () => { limit = 40; render(); }; render(); m.content(host); m.content(footer(button(T('loot.close'), m.close, 'dfo-btn-sec')));
    }
    function toolbar(parent, loot, refresh, options = {}) {
      if (!loot?.nearby) return;
      styles(); activeLoot = loot; repaint = refresh;
      const bar = el('div', 'dfo-loot-actions');
      for (const type of ['click', 'pointerdown', 'mousedown', 'mouseup', 'wheel']) bar.addEventListener(type, e => e.stopPropagation());
      const auto = button(T('loot.auto'), autoDialog); auto.dataset.autoButton = 'true'; auto.setAttribute('aria-pressed', String(client.get().autoLoot.enabled));
      const status = el('span', 'dfo-loot-status', lastError); status.setAttribute('role', 'status');
      const take = button(T('loot.takeAll'), () => {
        if (take.disabled || stack.length || loot.isClosed()) return;
        take.disabled = true;
        try {
          const shown = () => options.shown?.() ?? loot.items(), result = loot.takeAll(shown());
          if (!result.failed && !shown().length && options.close) { options.close(); return; }
          const text = result.refusal || (result.failed ? T('loot.takeFailed') : '');
          if (options.notice) options.notice(text); else { status.textContent = text; refresh?.(); }
        } catch (e) { if (options.notice) options.notice(errorOf(e)); else status.textContent = errorOf(e); }
        finally { take.disabled = false; }
      }, 'dfo-btn-prim'); take.dataset.takeAll = 'true';
      bar.append(take, button(T('loot.filter'), lootFilter), auto, status); parent.append(bar); return bar;
    }
    function classic(win, loot) {
      if (!win?.hooks || !loot.nearby) return () => { };
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
