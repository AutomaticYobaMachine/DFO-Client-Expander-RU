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
  // Diagnostic build only. An on-screen acknowledgement prevents a silent "tracer works" claim.
  let indicator = null, indicatorState = 'loading', indicatorDetail = '';
  const beacons = new Set();
  function renderIndicator() {
    try {
      if (!indicator && doc.body && typeof doc.createElement === 'function') {
        indicator = doc.createElement('div');
        indicator.id = 'dfo-inventory-trace-indicator';
        indicator.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:2147483000;pointer-events:none;padding:5px 8px;background:#121d21ee;border:1px solid #8ba6ae;color:#f8e7c2;font:12px/1.3 monospace;opacity:.94;white-space:nowrap;';
        doc.body.append(indicator);
      }
      if (indicator) {
        indicator.textContent = 'DFO TRACE 1.29.8 | ' + indicatorState;
        indicator.title = indicatorDetail;
      }
    } catch { /* status must not affect the game */ }
  }
  function status(state, detail) {
    indicatorState = state;
    indicatorDetail = String(detail || '').slice(0, 300);
    renderIndicator();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', renderIndicator, { once: true });
  else renderIndicator();

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
  async function backupBatch(batch) {
    // Standard protocol fetch POST may be unavailable in some Electron deployments.
    // GET (and finally image loading) uses the same established custom-scheme handler.
    let written = 0;
    for (const event of batch) {
      const reduced = { session: event.session, seq: event.seq, at: event.at, type: event.type,
        data: { ...event.data } };
      if (typeof reduced.data.stack === 'string') reduced.data.stack = reduced.data.stack.slice(0, 600);
      if (typeof reduced.data.message === 'string') reduced.data.message = reduced.data.message.slice(0, 300);
      const encoded = JSON.stringify(reduced);
      if (encoded.length > 2000) {
        reduced.data = { fallback: true, originalType: event.type };
      }
      const url = endpoint + '-fallback?event=' + encodeURIComponent(JSON.stringify(reduced));
      try {
        const answer = await root.fetch(url, { cache: 'no-store' });
        if (!answer.ok) throw new Error('HTTP ' + answer.status);
        written++;
      } catch {
        if (typeof root.Image === 'function') {
          try {
            const img = new root.Image();
            beacons.add(img);
            img.onload = () => { beacons.delete(img); status('GET image OK'); };
            img.onerror = () => { beacons.delete(img); status('NO TRANSPORT', url.split('?')[0]); };
            img.src = url;
            root.setTimeout(() => beacons.delete(img), 5000);
          } catch { /* endpoint inaccessible */ }
        }
      }
    }
    return written;
  }
  async function flush() {
    if (posting || !queue.length) return;
    posting = true;
    const batch = queue.splice(0, Math.min(queue.length, 12));
    if (missingBatches) {
      batch.unshift({ session, seq: ++seq, at: Date.now(), type: 'trace.dropped',
        data: { count: missingBatches } });
      missingBatches = 0;
    }
    try {
      const response = await root.fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch), cache: 'no-store' });
      if (!response.ok) throw new Error('trace HTTP ' + response.status);
      status('POST OK', 'Events saved to local diagnostics');
    } catch (e) {
      status('POST FAILED; trying GET', String(e));
      const viaGet = await backupBatch(batch);
      if (viaGet === batch.length) status('GET OK', 'Events saved to local diagnostics');
      else if (viaGet === 0 && typeof root.Image !== 'function') status('NO TRANSPORT', String(e));
      if (viaGet < batch.length) {
        missingBatches += batch.length - viaGet;
        try { root.console?.warn?.('[dfo inventory trace] delivery failed', String(e)); } catch {}
      }
    } finally {
      posting = false;
      if (queue.length) schedule();
    }
  }
  function control(el) {
    const target = el?.closest?.('button,.packtab,.itemrow,[role="button"]') || el;
    const header = target?.closest?.('.pack-id');
    const buttons = header?.querySelectorAll ? [...header.querySelectorAll('button')] : [];
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
    const inside = relevant(e.target);
    if (inside || snapshot().doors) record('ui.pointerdown', { ...control(e.target), button: e.button, inside });
  }, true);
  doc.addEventListener('click', e => {
    const inside = relevant(e.target);
    if (!inside && !snapshot().doors) return;
    const data = { ...control(e.target), inside };
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
    } else if ((relevant(e.target) || snapshot().doors) && (e.key === 'Escape' || e.code === 'KeyI')) {
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
  record('trace.started', { diagnostic: true, build: '1.29.8' });
  void flush(); // a startup acknowledgement must not depend on the player clicking inventory
})(globalThis);
