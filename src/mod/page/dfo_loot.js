// Nearby loot references original sources and uses the game's inventory door and transfers.
(function (root) {
  'use strict';
  const Rules = typeof module === 'object' && module.exports ? require('./dfo_loot_rules.js') : root.__dfoLootRules;
  const DEFAULT_SETTINGS = Rules.cleanSettings();
  const RADIUS = 15;
  const allowed = (key) => /^(?:loot|corpse|foeCorpse|guardCorpse|droppedLoot):/.test(key);
  const distance = (a, b) => a?.length === 3 && b?.length === 3 ? Math.hypot(...a.map((v, i) => v - b[i])) : Infinity;
  const position = (target) => target.pos ?? (target.aabb && [
    (target.aabb.min[0] + target.aabb.max[0]) / 2, target.aabb.min[1],
    (target.aabb.min[2] + target.aabb.max[2]) / 2,
  ]);
  const MAX_VERTICAL = 1.25, STEP = 0.5, BODY_RADIUS = 0.35;
  // A direct, supported walking corridor in the LIVE collision world. Sight alone would
  // admit loot through windows, across pits and in an open stairwell on another storey.
  function canReach(feet, target, collider) {
    if (!Array.isArray(feet) || feet.length !== 3 || !Array.isArray(target) || target.length !== 3
      || !feet.every(Number.isFinite) || !target.every(Number.isFinite)
      || distance(feet, target) > RADIUS || Math.abs(feet[1] - target[1]) > MAX_VERTICAL
      || typeof collider?.raycast !== 'function') return false;
    try {
      const horizontal = Math.hypot(target[0] - feet[0], target[2] - feet[2]);
      const steps = Math.max(1, Math.ceil(horizontal / 0.75)), path = [];
      const filter = { bodies: true };
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, p = feet.map((v, j) => v + (target[j] - v) * t);
        const origin = [p[0], p[1] + STEP + 0.05, p[2]];
        // surfaceHit also reads the outdoor terrain; raycast alone only sees mesh floors.
        const hit = collider.surfaceHit?.(origin, [0, -1, 0], 1.35, filter)
          ?? { dist: collider.raycast(origin, [0, -1, 0], 1.35, filter) };
        if (!Number.isFinite(hit.dist) || hit.dist < 0 || hit.dist > 1.35 || (hit.normal && hit.normal[1] < 0.6)) return false;
        p[1] = origin[1] - hit.dist;
        if (path.length && Math.abs(p[1] - path.at(-1)[1]) > STEP + 0.01) return false;
        const ceiling = collider.raycast([p[0], p[1] + 0.05, p[2]], [0, 1, 0], 1.75, filter);
        if (ceiling !== Infinity && !(Number.isFinite(ceiling) && ceiling >= 1.74)) return false;
        path.push(p);
      }
      // Merge level/linear terrain spans: flat rooms cost one corridor check per source,
      // regardless of how many item stacks they contain.
      const runs = []; let start = 0;
      for (let i = 2; i < path.length; i++) {
        const slope = (path[i][1] - path[start][1]) / (i - start);
        if (Math.abs(path[i - 1][1] - (path[start][1] + slope * (i - 1 - start))) > 0.025) {
          runs.push([path[start], path[i - 1]]); start = i - 1;
        }
      }
      runs.push([path[start], path.at(-1)]);
      const side = horizontal > 0.001 ? [-(target[2] - feet[2]) / horizontal, 0, (target[0] - feet[0]) / horizontal] : [1, 0, 0];
      for (const [a, b] of runs) for (const height of [0.51, 1.0, 1.65]) for (const width of [-BODY_RADIUS, 0, BODY_RADIUS]) {
        const origin = a.map((v, j) => v + side[j] * width + (j === 1 ? height : 0));
        const delta = b.map((v, j) => v - a[j]), length = Math.hypot(...delta);
        if (length < 0.001) continue;
        const hit = collider.raycast(origin, delta.map(v => v / length), length, filter);
        if (hit !== Infinity && !(Number.isFinite(hit) && hit >= length - 0.0001)) return false;
      }
      return true;
    } catch { return false; } // Never fall back to distance-only access after a geometry failure.
  }
  // Only drawn ground piles, never the hidden backing lists of searchables, coffers or furniture.
  const groundPile = (p) => p && !p.dead && !p.inactive && p.drawn !== false && !p.owner && !p.wild && !p.wildBody;

  function sources(host) {
    if (host.sources) return host.sources();
    const out = [];
    for (const pool of host.pools?.() ?? []) {
      if (!pool) continue;
      for (const t of pool.lootTargets()) out.push({
        ...t, items: () => pool.hoverContents(t.key),
        visit: (fn) => pool.takeLoot(t.key, host.say, (loot) => {
          loot.opened?.();
          try { return fn(loot.items()) !== false; } finally { loot.closed?.(); }
        }),
      });
    }
    const drops = host.dropped?.();
    for (const p of drops?._piles ?? []) {
      if (!groundPile(p)) continue;
      out.push({ key: `droppedLoot:${p.id}`, pos: p.pos, items: () => groundPile(p) ? p.items : null,
        visit: (fn) => {
          const hadLoot = p.container && p.items.length > 0;
          try { const moved = fn(p.items); if (moved && hadLoot) host.pileTaken?.(p); return moved; }
          finally { drops.releaseEmptied(); }
        },
      });
    }
    return out;
  }

  // A network container may recompose its records as its native door opens. Match the entire record,
  // never a filtered/sorted slot or just an item's name. Ambiguous replacements are refused.
  function actualItem(list, item) {
    if (!Array.isArray(list)) return null;
    if (list.includes(item)) return item;
    try {
      const word = JSON.stringify(item), same = list.filter((it) => JSON.stringify(it) === word);
      return same.length === 1 ? same[0] : null;
    } catch { return null; }
  }

  function createSession(host, { tools = () => root.__dfoLootTools, settings = () => DEFAULT_SETTINGS, onClose = () => {} } = {}) {
    const view = [], all = [], owners = new Map(), remembered = new WeakMap();
    let lastFilter, show = () => true;
    let closed = false, moving = false, sorted = false, lastRefusal = null;
    const accessCache = new Map();
    const inRange = (s, fresh = false) => {
      const feet = host.feet(), pos = position(s), collider = host.collider?.(), now = Date.now();
      const stamp = JSON.stringify([feet, pos]), old = accessCache.get(s.key);
      if (!fresh && old?.stamp === stamp && old.collider === collider && now - old.at < 150) return old.ok;
      const ok = canReach(feet, pos, collider);
      accessCache.set(s.key, { stamp, collider, at: now, ok }); return ok;
    };
    const refresh = () => {
      if (closed || moving) return;
      const next = new Map();
      for (const s of sources(host)) {
        if (!allowed(s.key) || !inRange(s)) continue;
        for (const it of s.items() ?? []) if (it && !next.has(it)) next.set(it, s);
      }
      const filter = settings().filter;
      if (filter !== lastFilter) { lastFilter = filter; show = Rules.compileFilter(filter, tools()); sorted = false; }
      const shown = new Set([...next.keys()].filter(show));
      all.length = 0; all.push(...next.keys());
      // Preserve the user's sort order; source indices are never used to identify a clicked item.
      for (let i = view.length - 1; i >= 0; i--) if (!shown.has(view[i])) view.splice(i, 1);
      const kept = new Set(view);
      for (const it of shown) if (!kept.has(it)) view.push(it);
      owners.clear(); for (const [it, s] of next) { owners.set(it, s); remembered.set(it, s); }
    };
    refresh();
    const loot = {
      nearby: true, title: 'Лут рядом · 15 м',
      items() {
        if (!moving) refresh();
        const t = tools();
        if (!sorted && t?.sort && t?.nameOf) { t.sort(view, { nameOf: t.nameOf }); sorted = true; }
        return view;
      },
      rawItems() { refresh(); return all; },
      takeAll(rows = this.items()) {
        const wanted = [...new Set(rows)]; let taken = 0, failed = 0, refusal = null;
        for (const it of wanted) {
          if (closed) break;
          const t = tools(), source = owners.get(it) || remembered.get(it), live = source && actualItem(source.items(), it);
          if (!live || !t?.planTake) { failed++; continue; }
          const planFor = item => t.planTake(item, { bag: host.entity.items ?? [], entity: host.entity, mode: 'remove', getQuest: host.getQuest });
          const plan = planFor(live), before = live.stackCount ?? 1;
          if (!plan.ok || plan.claimsChoice) { failed++; refusal ??= plan.refusal?.text; continue; }
          if (this.commit('take', it, plan.amount)) {
            taken++;
            if (plan.amount < before) { failed++; refusal ??= lastRefusal; }
          } else { failed++; refusal ??= lastRefusal || planFor(live).refusal?.text; }
        }
        return { taken, failed, refusal };
      },
      autoLoot(rule) {
        refresh(); const selected = Rules.compileAuto(rule, tools());
        let taken = 0, failed = 0;
        for (const it of [...all].filter(selected)) {
          if (closed) break;
          const t = tools(), source = owners.get(it) || remembered.get(it);
          const live = source && actualItem(source.items(), it);
          if (!live || !t?.planTake) { failed++; continue; }
          const plan = t.planTake(live, { bag: host.entity.items ?? [], entity: host.entity, mode: 'remove', getQuest: host.getQuest });
          if (plan.ok && this.commit('take', it, plan.amount)) taken++; else failed++;
        }
        return { taken, failed };
      },
      isClosed: () => closed,
      // This is a detector, not a storage collection. The UI's callback would transfer
      // FROM the display array; deliberately do not call it. Transfer from the LIVE source
      // with the game's own planTake/applyTransfer, then rebuild only the display references.
      commit(dir, item, amount) {
        lastRefusal = null;
        if (closed || moving || dir !== 'take') return false;
        const previous = owners.get(item) || remembered.get(item), t = tools();
        const source = previous && sources(host).find(s => s.key === previous.key);
        if (!source || !inRange(source, true) || !actualItem(source.items(), item)
          || typeof t?.planTake !== 'function' || typeof t?.applyTransfer !== 'function') { refresh(); return false; }
        let moved = false;
        moving = true;
        const wasVisiting = root.__dfoLootVisiting;
        root.__dfoLootVisiting = true;
        try {
          source.visit((actual) => {
            const live = actualItem(actual, item);
            if (closed || !live || !inRange(source, true)) return false;
            const plan = t.planTake(live, { bag: host.entity.items ?? [], entity: host.entity, mode: 'remove', getQuest: host.getQuest });
            lastRefusal = plan.refusal?.text ?? null;
            if (!plan.ok || !Number.isFinite(amount) || amount <= 0 || amount > plan.amount) return false;
            const before = live.stackCount ?? 1;
            t.applyTransfer(live, { ...plan, amount }, actual, host.entity.items ??= [], { entity: host.entity, toPlayer: true });
            moved = !actual.includes(live) || (live.stackCount ?? 1) < before;
            if (moved && actual.includes(live)) lastRefusal = t.planTake(live, { bag: host.entity.items ?? [], entity: host.entity, mode: 'remove', getQuest: host.getQuest }).refusal?.text ?? null;
            return moved;
          });
          return moved;
        } finally { root.__dfoLootVisiting = wasVisiting; moving = false; refresh(); }
      },
      closed() { if (closed) return; closed = true; view.length = 0; all.length = 0; owners.clear(); accessCache.clear(); onClose(); },
    };
    return loot;
  }

  function controller({ client = root.__dfoLootSettings, prepare = () => root.__dfoLootPrepare?.() } = {}) {
    const hosts = new Map();
    let current = null, opening = false;
    const settings = () => client?.get() ?? DEFAULT_SETTINGS;
    function hostNow() {
      const base = [...hosts.values()].reverse().find(h => h.feet());
      if (!base || base.blocked()) return null;
      const resolved = base.resolve?.();
      if (resolved === false) return null;
      const host = resolved ?? base;
      return host.feet() && !host.blocked() ? host : null;
    }
    function run(host, auto) {
      const state = { window: null, loot: null, dispose: null };
      try {
        const loot = createSession(host, { settings, onClose: () => {
          state.dispose?.(); root.__dfoLootUI?.closeAll(); if (current === state) current = null;
        } });
        state.loot = loot; current = state;
        if (auto) {
          const result = loot.autoLoot(settings().autoLoot);
          if (result.taken) host.say?.(`Автолут: подобрано стопок — ${result.taken}.`);
          if (result.taken && !loot.rawItems().length) { loot.closed(); return true; }
        }
        state.window = host.open(loot);
        if (!state.window) { loot.closed(); return false; }
        state.dispose = root.__dfoLootUI?.classic(state.window, loot);
        return true;
      } catch (e) {
        state.loot?.closed(); current = null; console.warn('[dfo-mod] nearby loot:', e); return false;
      }
    }
    const api = {
      register(id, host) { hosts.set(id, host); },
      canOpen: () => !opening && !(current && !current.window?.done) && !!hostNow(),
      open() {
        if (!api.canOpen()) return false;
        const host = hostNow(); opening = true;
        try { return run(host, false); } finally { opening = false; }
      },
      async activate() {
        if (!api.canOpen()) return false;
        const initial = hostNow(); opening = true;
        try {
          await client?.load(); await client?.flush(); await prepare();
          const host = hostNow();
          const focused = root.document?.activeElement;
          if (!host || host.kind !== initial.kind || host.entity !== initial.entity || focused?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')) return false;
          return run(host, true);
        } catch (e) {
          initial.say?.('Не удалось загрузить настройки лута. Повторите нажатие J.');
          console.warn('[dfo-mod] loot settings:', e); return false;
        } finally { opening = false; }
      },
      isOpening: () => opening,
      isOpen: () => !!current && !current.window?.done,
    };
    return api;
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { RADIUS, MAX_VERTICAL, canReach, allowed, distance, position, groundPile, sources, actualItem, createSession, controller };
    return;
  }
  if (root.__dfoLoot) return;
  const cfg = root.__DFO_MOD_CFG__?.nearbyLoot ?? {};
  if (cfg.enabled === false) return;
  root.__dfoLootGround = groundPile;
  const api = root.__dfoLoot = controller();
  root.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.code !== (cfg.keyCode || 'KeyJ') || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    if (e.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')) return;
    if (api.isOpen()) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (api.isOpening()) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (e.repeat || !api.canOpen()) return;
    e.preventDefault(); e.stopImmediatePropagation(); void api.activate();
  }, true);
})(globalThis);
