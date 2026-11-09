// Diagnostic runtime: passive event capture + lifecycle breadcrumbs.
// Does not change native event propagation, callbacks, DOM, game state or inventory selection.
(function (root) {
  'use strict';
  const doc = root.document;
  if (!doc || typeof root.fetch !== 'function' || root.__dfoInventoryTrace) return;
  const session = 'i' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  const endpoint = '/dfo-mod/inventory-trace';
  const MAX_QUEUE = 256, MAX_DATA_KEYS = 48;
  let seq = 0, queue = [], tail = [], scheduled = false, posting = false;
  let missingBatches = 0;
  // These measurements distinguish a living renderer from an inert interface
  // and a stalled renderer from an Electron process that is still alive.
  let frameCount = 0, lastFrameAt = 0, maxFrameGap = 0, beatCount = 0;
  let lastBeatAt = Date.now(), lastInputAt = 0, lastInputKind = '', lastPointer = null;
  let lastTarget = null, lastEventId = 0, lastDoorSeenAt = 0;
  const AFTER_CLOSE_MS = 60000; // Keep watching for ghost pixels after DOM teardown.
  const eventIds = new WeakMap();
  const clock = () => Date.now();

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
        indicator.textContent = 'DFO TRACE 1.29.9 | ' + indicatorState
          + (snapshot().doors || (lastDoorSeenAt && clock() - lastDoorSeenAt <= AFTER_CLOSE_MS)
            ? ' | LIVE ' + new Date().toLocaleTimeString() + ' F' + frameCount : '');
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
        ownerDone: typeof root.__dfoInventoryDoorActive$?.state === 'function'
          ? !!root.__dfoInventoryDoorActive$.state().done : null,
        focus: typeof doc.hasFocus === 'function' ? !!doc.hasFocus() : null,
        visibility: doc.visibilityState ?? null,
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
      // The incident is a frozen but partly interactive window, not high render
      // frequency. Do not bury dispatch/owner failures under normal repaint noise.
      if (type === 'view.render.start' || type === 'view.render.queued' ||
          type === 'view.render.skip' || type === 'view.figure.notice' ||
          type === 'pack.head' || type === 'pack.geometry.begin' ||
          type === 'pack.geometry.end') return;
      if (type === 'view.render.end' && info?.completed !== false && info?.stillOwns !== false) return;
      const state = snapshot(host);
      if (state.doors > 0) lastDoorSeenAt = clock();
      const event = { session, seq: ++seq, at: Date.now(), type,
        data: { ...state, ...cleanData(info) } };
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
  function probeElement(el) {
    if (!el) return { tag: null, cls: null };
    try {
      const classes = [...(el.classList || [])].filter(x => /^[a-zA-Z0-9_-]{1,40}$/.test(x)).slice(0, 5).join('.');
      return { tag: el.tagName?.toLowerCase?.() || '?', cls: classes,
        connected: el.isConnected !== false, disabled: !!el.disabled,
        onclick: typeof el.onclick === 'function',
        onchange: typeof el.onchange === 'function',
        oninput: typeof el.oninput === 'function',
        ariaSelected: el.getAttribute?.('aria-selected') ?? null,
        ariaPressed: el.getAttribute?.('aria-pressed') ?? null,
        index: typeof el.selectedIndex === 'number' ? el.selectedIndex : null,
        inputLength: typeof el.value === 'string' && el.tagName === 'INPUT' ? el.value.length : null };
    } catch { return { tag: '?' }; }
  }
  // Compact fingerprint of meaningful UI state. Compare after actual input
  // instead of pretending that every repaint is a separate window.
  function uiState() {
    try {
      const door = doc.querySelector('#enhanced-inventory');
      const tabs = door?.querySelectorAll?.('.packtab') ?? [];
      const selected = [...tabs].findIndex(el => el.classList?.contains('active')
        || el.classList?.contains('on') || el.getAttribute?.('aria-selected') === 'true');
      const category = door?.querySelector?.('.storecat');
      const search = door?.querySelector?.('.storesearch');
      return { selectedTab: selected, tabCount: tabs.length,
        category: typeof category?.selectedIndex === 'number' ? category.selectedIndex : null,
        searchLength: typeof search?.value === 'string' ? search.value.length : null,
        rootNodes: door?.childElementCount ?? null,
        activeTag: doc.activeElement?.tagName?.toLowerCase?.() ?? null };
    } catch { return { stateFailed: true }; }
  }
  function hitTest(e) {
    try {
      if (typeof e.clientX !== 'number' || typeof e.clientY !== 'number') return {};
      const top = doc.elementFromPoint?.(e.clientX, e.clientY);
      return { hitTag: top?.tagName?.toLowerCase?.() ?? null,
        hitClass: [...(top?.classList || [])].slice(0, 4).join('.'),
        targetIsTop: !top || top === e.target || top.contains?.(e.target) === true };
    } catch { return { hitFailed: true }; }
  }
  function eventData(e, stage) {
    const el = e.target;
    return { eventId: eventIds.get(e) || null, stage, kind: e.type,
      ...probeElement(el), ...hitTest(e), ...uiState(),
      defaultPrevented: !!e.defaultPrevented,
      cancelBubble: !!e.cancelBubble,
      button: typeof e.button === 'number' ? e.button : null,
      repeat: !!e.repeat, code: e.type === 'keydown' ? (e.code || '') : null };
  }
  function pertinent(e) {
    return relevant(e.target) || snapshot().doors > 0;
  }
  // Monitor the whole event dispatch path. Capture cannot prove that a native
  // handler ran; target callback presence and final bubble/after-state narrow that down.
  for (const kind of ['pointerdown','click','keydown','change','input']) {
    root.addEventListener?.(kind, e => {
      if (!pertinent(e) && !(kind === 'keydown' && e.ctrlKey && e.altKey && e.shiftKey && e.code === 'F10')) return;
      eventIds.set(e, ++lastEventId);
      lastInputAt = clock(); lastInputKind = kind; lastTarget = probeElement(e.target);
      if (typeof e.clientX === 'number') lastPointer = { x: e.clientX, y: e.clientY };
      record('dispatch.capture', eventData(e, 'window-capture'));
    }, true);
    root.addEventListener?.(kind, e => {
      if (!pertinent(e)) return;
      record('dispatch.bubble', eventData(e, 'window-bubble'));
    }, false);
  }
  for (const kind of ['change','input','focusin','focusout']) {
    doc.addEventListener(kind, e => {
      if (!pertinent(e)) return;
      record('control.' + kind, eventData(e, 'document-capture'));
      root.setTimeout(() => record('control.after', {
        ...eventData(e, 'next-task'), ...uiState(), eventType: kind
      }), 0);
    }, true);
  }
  // Read-only renderer heartbeat. Its on-screen clock tells the player whether
  // the *visual* surface is advancing; its journal proves only JS/rAF activity.
  if (typeof root.requestAnimationFrame === 'function') {
    const frame = time => {
      try {
        const now = clock();
        if (lastFrameAt) maxFrameGap = Math.max(maxFrameGap, now - lastFrameAt);
        lastFrameAt = now;
        frameCount++;
      } catch {}
      root.requestAnimationFrame(frame);
    };
    root.requestAnimationFrame(frame);
  }
  if (typeof root.setInterval === 'function') root.setInterval(() => {
    try {
      const now = clock(), gapMs = now - lastBeatAt;
      lastBeatAt = now; beatCount++;
      const doors = snapshot().doors;
      if (doors) lastDoorSeenAt = now;
      if (!doors && (!lastDoorSeenAt || now - lastDoorSeenAt > AFTER_CLOSE_MS)) return;
      renderIndicator();
      record('renderer.heartbeat', {
        doorsPresent: doors > 0, msSinceDoor: doors ? 0 : now - lastDoorSeenAt,
        beatCount, frameCount, maxFrameGapMs: maxFrameGap,
        intervalGapMs: gapMs, lastInputAgeMs: lastInputAt ? now - lastInputAt : null,
        lastInputKind, ...uiState(),
        lastPointerX: lastPointer?.x ?? null, lastPointerY: lastPointer?.y ?? null,
      });
      maxFrameGap = 0;
    } catch {}
  }, 2000);
  if (typeof root.PerformanceObserver === 'function') {
    try {
      let lastSlowAt = 0;
      const observer = new root.PerformanceObserver(list => {
        for (const item of list.getEntries()) {
          const now = clock();
          if (item.duration >= 250 && now - lastSlowAt >= 1500 && snapshot().doors) {
            lastSlowAt = now;
            record('renderer.longtask', { durationMs: Math.round(item.duration) });
          }
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch { /* unsupported browser; heartbeat still works */ }
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
      disabled: !!target?.disabled, pressed: target?.getAttribute?.('aria-pressed') || null,
      callback: typeof target?.onclick === 'function' ? 'onclick' :
        typeof target?.onchange === 'function' ? 'onchange' :
        typeof target?.oninput === 'function' ? 'oninput' : 'none',
      targetConnected: target?.isConnected !== false, ...uiState() };
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
    record('ui.click', { ...data, ...eventData(e, 'document-capture') });
    // A click may schedule a promise-driven close; look both after the immediate
    // native handler and after a later task. No observer over the whole HUD.
    root.setTimeout(() => record('ui.after', { ...data, delayMs: 0, ...uiState(),
      clickedConnected: e.target?.isConnected !== false }), 0);
    root.setTimeout(() => record('ui.after', { ...data, delayMs: 400, ...uiState(),
      clickedConnected: e.target?.isConnected !== false }), 400);
  }, true);
  doc.addEventListener('keydown', e => {
    if (e.ctrlKey && e.altKey && e.shiftKey && e.code === 'F10') {
      status('MANUAL MARK', 'Current window health and input-path snapshot captured');
      record('trace.manual', { key: 'Ctrl+Alt+Shift+F10',
        ...uiState(), ...snapshot(), ...lastTarget,
        frameCount, maxFrameGapMs: maxFrameGap, beatCount,
        lastInputKind, lastInputAgeMs: lastInputAt ? clock() - lastInputAt : null,
        lastPointerX: lastPointer?.x ?? null, lastPointerY: lastPointer?.y ?? null });
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
  record('trace.started', { diagnostic: true, build: '1.29.9', probes: 'input-failure-and-renderer-liveness' });
  void flush(); // a startup acknowledgement must not depend on the player clicking inventory
})(globalThis);
