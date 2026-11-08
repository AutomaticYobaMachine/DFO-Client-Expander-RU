/* DFO inventory lifecycle probe. Manual DevTools diagnostic, NOT part of game bundle.
 * Paste this script in the game's DevTools Console, reproduce, then:
 * __dfoInventoryProbe.report()
 * copy(__dfoInventoryProbe.export())
 * __dfoInventoryProbe.stop()
 * This script changes no game state. It temporarily instruments DOM methods
 * to obtain synchronous stack traces and restores them on stop(). */
(function installDFOInventoryProbe() {
  'use strict';
  var old = globalThis.__dfoInventoryProbe;
  if (old && typeof old.stop === 'function') old.stop();
  var doc = globalThis.document;
  if (!doc || !doc.documentElement || !globalThis.Element || !globalThis.Node) {
    console.warn('[DFO Probe] DOM is unavailable');
    return;
  }
  var MAX = 2500;
  var events = [];
  var id = 0;
  var ids = new WeakMap();
  var started = performance.now();
  var E = Element.prototype;
  var N = Node.prototype;
  var original = {
    append: E.append,
    appendChild: N.appendChild,
    remove: E.remove,
    removeChild: N.removeChild
  };
  var observer, longObserver;
  var stopped = false;
  function nodeId(n) {
    if (!n || (typeof n !== 'object' && typeof n !== 'function')) return null;
    if (!ids.has(n)) ids.set(n, ++id);
    return ids.get(n);
  }
  function uiNodes(n) {
    if (!n || n.nodeType !== 1) return [];
    var result = [];
    function addIf(el) {
      if (el.id === 'enhanced-inventory' || el.classList.contains('pack-shell')) result.push(el);
    }
    addIf(n);
    if (typeof n.querySelectorAll === 'function') {
      for (var el of n.querySelectorAll('#enhanced-inventory, .pack-shell')) addIf(el);
    }
    return result;
  }
  function info(n) {
    var v = n && n.nodeType === 1 ? n : null;
    if (!v) return { id: nodeId(n), type: n && n.nodeName };
    var r = v.getBoundingClientRect();
    return {
      id: nodeId(v),
      tag: v.tagName,
      cssId: v.id || '',
      className: typeof v.className === 'string' ? v.className.slice(0, 120) : '',
      connected: v.isConnected,
      parentId: nodeId(v.parentElement),
      packShells: v.querySelectorAll('.pack-shell').length,
      x: Math.round(r.x), y: Math.round(r.y),
      w: Math.round(r.width), h: Math.round(r.height)
    };
  }
  function push(type, payload, stack) {
    if (stopped) return;
    var row = { n: events.length + 1, ms: Math.round((performance.now() - started) * 10) / 10, type: type, data: payload };
    if (stack) row.stack = stack;
    events.push(row);
    if (events.length > MAX) events.shift();
  }
  function stackNow() {
    try { throw new Error('DFO inventory DOM origin'); }
    catch (e) { return String(e.stack || '').split('\n').slice(2, 13).join('\n'); }
  }
  function snapshot() {
    var hosts = Array.from(doc.querySelectorAll('#enhanced-inventory'));
    var shells = Array.from(doc.querySelectorAll('.pack-shell'));
    return {
      mod: {
        stylesheetPresent: !!doc.getElementById('dfo-pack-style'),
        enabledAttribute: doc.documentElement.getAttribute('data-dfo-pack'),
        viewAttribute: doc.documentElement.getAttribute('data-dfo-pack-view')
      },
      hosts: hosts.map(function(h) {
        return {
          id: nodeId(h), connected: h.isConnected, shells: h.querySelectorAll('.pack-shell').length,
          shellIds: Array.from(h.querySelectorAll('.pack-shell')).map(nodeId)
        };
      }),
      shells: shells.map(function(s) {
        var h = s.closest('#enhanced-inventory');
        var w = s.querySelector(':scope > .pack-win');
        var r = w && w.getBoundingClientRect();
        return {
          id: nodeId(s), hostId: nodeId(h), paired: s.classList.contains('paired'),
          on: s.classList.contains('on'), winW: r ? Math.round(r.width) : null,
          winH: r ? Math.round(r.height) : null,
          hasHead: !!s.querySelector('.pack-id'),
          rows: s.querySelectorAll('.itemrow').length,
          icons: s.querySelectorAll('.has-icon').length,
          emptyTiles: s.querySelectorAll('.tile:not(.has-icon)').length,
          virtualGaps: s.querySelectorAll('.vrows-gap').length
        };
      })
    };
  }
  function domCall(op, target, args) {
    var touched = [];
    for (var a of args) for (var n of uiNodes(a)) touched.push(info(n));
    if (op === 'remove' || op === 'removeChild') {
      for (var node of uiNodes(op === 'remove' ? target : args[0])) touched.push(info(node));
    }
    if (touched.length) push('DOM:' + op, { targetId: nodeId(target), nodes: touched }, stackNow());
  }
  var appendWrapper = function() {
    domCall('append', this, arguments);
    return original.append.apply(this, arguments);
  };
  var appendChildWrapper = function() {
    domCall('appendChild', this, arguments);
    return original.appendChild.apply(this, arguments);
  };
  var removeWrapper = function() {
    domCall('remove', this, []);
    return original.remove.apply(this, arguments);
  };
  var removeChildWrapper = function() {
    domCall('removeChild', this, arguments);
    return original.removeChild.apply(this, arguments);
  };
  function recordChanges(records) {
    var changes = [];
    for (var record of records) {
      if (record.type !== 'childList') continue;
      for (var n of record.addedNodes) {
        var added = uiNodes(n);
        if (added.length) changes.push({ kind: 'added', nodes: added.map(info) });
      }
      for (var n of record.removedNodes) {
        var removed = uiNodes(n);
        if (removed.length) changes.push({ kind: 'removed', nodes: removed.map(info) });
      }
    }
    if (changes.length) push('MUTATION', { changes: changes, now: snapshot() });
  }
  function onKey(e) {
    if (['F5', 'F6', 'Tab', 'Escape'].includes(e.key)) {
      push('KEY', { key: e.key, code: e.code, repeat: !!e.repeat, target: e.target && e.target.tagName, now: snapshot() });
    }
  }
  function onPointer(e) {
    var target = e.target && e.target.closest && e.target.closest('#enhanced-inventory');
    if (target) push('POINTER', { button: e.button, target: String(e.target && e.target.className || '').slice(0, 100), host: nodeId(target) });
  }
  try {
    E.append = appendWrapper;
    N.appendChild = appendChildWrapper;
    E.remove = removeWrapper;
    N.removeChild = removeChildWrapper;
    observer = new MutationObserver(recordChanges);
    observer.observe(doc.documentElement, { subtree: true, childList: true });
    doc.addEventListener('keydown', onKey, true);
    doc.addEventListener('pointerdown', onPointer, true);
    if (typeof PerformanceObserver !== 'undefined' &&
        PerformanceObserver.supportedEntryTypes.includes('longtask')) {
      longObserver = new PerformanceObserver(function(list) {
        for (var t of list.getEntries()) {
          push('LONGTASK', { durationMs: Math.round(t.duration), startMs: Math.round(t.startTime - started) });
        }
      });
      longObserver.observe({ entryTypes: ['longtask'] });
    }
  } catch (err) {
    if (observer) observer.disconnect();
    if (longObserver) longObserver.disconnect();
    if (E.append === appendWrapper) E.append = original.append;
    if (N.appendChild === appendChildWrapper) N.appendChild = original.appendChild;
    if (E.remove === removeWrapper) E.remove = original.remove;
    if (N.removeChild === removeChildWrapper) N.removeChild = original.removeChild;
    throw err;
  }
  var api = {
    version: 1,
    snapshot: snapshot,
    mark: function(label) {
      var s = snapshot();
      push('USER-MARK', { label: String(label || 'observation').slice(0, 180), state: s });
      console.info('[DFO Probe] marked:', label || 'observation', s);
      return s;
    },
    report: function() {
      var s = snapshot();
      var byType = {};
      for (var x of events) byType[x.type] = (byType[x.type] || 0) + 1;
      console.info('[DFO Probe] DOM state', s, 'event types', byType, 'events', events.length);
      console.table(events.slice(-30).map(function(e) { return { ms: e.ms, type: e.type, detail: JSON.stringify(e.data).slice(0, 150) }; }));
      return { state: s, byType: byType, events: events.length };
    },
    export: function() {
      return JSON.stringify({
        probe: 'DFO Inventory Lifecycle', version: 1,
        collectedAt: new Date().toISOString(), userAgent: navigator.userAgent,
        elapsedMs: Math.round(performance.now() - started),
        state: snapshot(), events: events
      }, null, 2);
    },
    stop: function() {
      if (stopped) return;
      if (observer) observer.disconnect();
      if (longObserver) longObserver.disconnect();
      doc.removeEventListener('keydown', onKey, true);
      doc.removeEventListener('pointerdown', onPointer, true);
      if (E.append === appendWrapper) E.append = original.append;
      if (N.appendChild === appendChildWrapper) N.appendChild = original.appendChild;
      if (E.remove === removeWrapper) E.remove = original.remove;
      if (N.removeChild === removeChildWrapper) N.removeChild = original.removeChild;
      stopped = true;
      if (globalThis.__dfoInventoryProbe === api) delete globalThis.__dfoInventoryProbe;
      console.info('[DFO Probe] stopped; game DOM methods restored');
    }
  };
  globalThis.__dfoInventoryProbe = api;
  push('START', { state: snapshot() });
  console.info('[DFO Probe] active. Use __dfoInventoryProbe.report(), __dfoInventoryProbe.export(), __dfoInventoryProbe.stop()');
})();