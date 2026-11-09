// Diagnostic runtime: passive event capture + lifecycle breadcrumbs.
// Does not change native event propagation, callbacks, DOM, game state or inventory selection.
(function (root) {
  'use strict';
  const doc = root.document;
  if (!doc || typeof root.fetch !== 'function' || root.__dfoInventoryTrace) return;
  const session = 'i' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  const endpoint = '/dfo-mod/inventory-trace';
  const MAX_QUEUE = 256, MAX_DATA_KEYS = 32;
  let seq = 0, queue = [], tail = [], scheduled = false, posting = false;
  let missingBatches = 0;
  function snapshot(host) {
    try {
      const shells = doc.querySelectorAll('.pack-shell');
      const doors = doc.querySelectorAll('#enhanced-inventory');
      const active = root.__dfoInventoryDoorActive$?.host;
      return {
        shells: shells.length, pairedShells: [...shells].filter(s => s.classList?.contains('paired')).length,
        doors: doors.length, connectedDoors: [...doors].filter(d => d.isConnected).length,
        activeConnected: active ? !!active.isConnected : null,
        activeRetired: active ? !!active.__dfoRetired$ : null,
        activeGeneration: active?.__dfoGeneration$ ?? null,
        hostConnected: host ? !!host.isConnected : null,
        hostGeneration: host?.__dfoGeneration$ ?? null,
        hostRetired: host ? !!host.__dfoRetired$ : null,
        hostShells: host?.querySelectorAll?.('.pack-shell')?.length ?? null,
      };
    } catch { return { snapshotFailed: true }; }
  }
  function cleanData(input) {
    const out = {};
    if (!input || typeof input !== 'object') return out;
    for (const [key, value] of Object.entries(input).slice(0, MAX_DATA_KEYS)) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(key)) continue;
      if (typeof value === 'string') out[key] = value.slice(0, 1600);
      else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
      else if (typeof value === 'boolean' || value === null) out[key] = value;
    }
    return out;
  }
  function record(type, info, host) {
    try {
      if (typeof type !== 'string' || !/^[a-z][a-z0-9.-]{0,63}$/.test(type)) return;
      const event = { session, seq: ++seq, at: Date.now(), type,
        data: { ...snapshot(host), ...cleanData(info) } };
      tail.push(event);
      if (tail.length > 100) tail.shift();
      queue.push(event);
      if (queue.length > MAX_QUEUE) {
        missingBatches += queue.length - MAX_QUEUE;
        queue.splice(0, queue.length - MAX_QUEUE);
      }
      schedule();
    } catch { /* diagnostics cannot break the game */ }
  }
  function schedule() {
    if (scheduled || posting || !queue.length) return;
    scheduled = true;
    root.setTimeout(() => { scheduled = false; void flush(); }, 180);
  }
  async function flush() {
    if (posting || !queue.length) return;
    posting = true;
    let batch = queue.splice(0, Math.min(queue.length, 48));
    if (missingBatches) {
      batch.unshift({ session, seq: ++seq, at: Date.now(), type: 'trace.dropped',
        data: { count: missingBatches } });
      missingBatches = 0;
    }
    try {
      const response = await root.fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch), cache: 'no-store' });
      if (!response.ok) throw new Error('trace HTTP ' + response.status);
    } catch (e) {
      // Never retry aggressively while the renderer is already in distress.
      // The newest bounded in-memory tail remains available for a manual snapshot.
      missingBatches += batch.length;
      try { root.console?.warn?.('[dfo inventory trace] persistence unavailable:', String(e)); } catch {}
    } finally {
      posting = false;
      if (queue.length) schedule();
    }
  }
  function control(el) {
    const target = el?.closest?.('button,.packtab,.itemrow,[role="button"]') || el;
    const header = target?.closest?.('.pack-id');
    const buttons = header ? [...header.querySelectorAll('button')] : [];
    const button = target?.closest?.('button');
    const buttonIndex = button && header ? buttons.indexOf(button) : -1;
    const classes = [...(target?.classList || [])].filter(x => /^[a-zA-Z0-9_-]{1,40}$/.test(x)).slice(0, 6).join('.');
    return { tag: target?.tagName?.toLowerCase?.() || '?',
      classes, headerButton: buttonIndex, headerButtons: buttons.length,
      disabled: !!target?.disabled, pressed: target?.getAttribute?.('aria-pressed') || null };
  }
  function relevant(el) {
    try { return !!el?.closest?.('.pack-shell,#enhanced-inventory,.dfo-pack-dialog'); }
    catch { return false; }
  }
  doc.addEventListener('pointerdown', e => {
    if (relevant(e.target)) record('ui.pointerdown', { ...control(e.target), button: e.button });
  }, true);
  doc.addEventListener('click', e => {
    if (!relevant(e.target)) return;
    const data = control(e.target);
    record('ui.click', { ...data, button: e.button });
    // A click may schedule a promise-driven close; look both after the immediate
    // native handler and after a later task. No observer over the whole HUD.
    root.setTimeout(() => record('ui.after', { ...data, delayMs: 0 }), 0);
    root.setTimeout(() => record('ui.after', { ...data, delayMs: 400 }), 400);
  }, true);
  doc.addEventListener('keydown', e => {
    if (e.ctrlKey && e.altKey && e.shiftKey && e.code === 'F10') {
      record('trace.manual', { key: 'Ctrl+Alt+Shift+F10' });
      void flush(); // diagnostic shortcut, never intercept or cancel the native key
    } else if (relevant(e.target) && (e.key === 'Escape' || e.code === 'KeyI')) {
      record('ui.keydown', { code: e.code || '', key: e.key || '' });
    }
  }, true);
  root.addEventListener?.('error', e => {
    if (e.error || e.message) record('runtime.error', {
      message: String(e.error?.message || e.message || '').slice(0, 600),
      stack: String(e.error?.stack || '').slice(0, 1600),
    });
  }, true);
  root.addEventListener?.('unhandledrejection', e => record('runtime.rejection', {
    message: String(e.reason?.message || e.reason || '').slice(0, 600),
    stack: String(e.reason?.stack || '').slice(0, 1600),
  }));
  root.__dfoInventoryTrace = Object.freeze({
    record, snapshot, flush,
    // For local console troubleshooting only; nothing beyond the bounded tail is held in memory.
    tail: () => tail.slice(),
  });
  record('trace.started', { diagnostic: true });
})(globalThis);
