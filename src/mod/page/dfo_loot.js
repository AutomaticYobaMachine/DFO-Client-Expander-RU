// Nearby loot uses the game's inventory door and transfers, never a second UI or an auto-pickup loop.
(function (root) {
  'use strict';
  const RADIUS = 15;
  const allowed = (key) => /^(?:loot|corpse|foeCorpse|guardCorpse|droppedLoot):/.test(key);
  const distance = (a, b) => a?.length === 3 && b?.length === 3 ? Math.hypot(...a.map((v, i) => v - b[i])) : Infinity;
  const position = (target) => target.pos ?? (target.aabb && [
    (target.aabb.min[0] + target.aabb.max[0]) / 2, target.aabb.min[1],
    (target.aabb.min[2] + target.aabb.max[2]) / 2,
  ]);
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

  function createSession(host, { tools = () => root.__dfoLootTools, onClose = () => {} } = {}) {
    const view = [], owners = new Map();
    let closed = false, moving = false, sorted = false;
    const inRange = (s) => distance(host.feet(), position(s)) <= RADIUS;
    const refresh = () => {
      if (closed || moving) return;
      const next = new Map();
      for (const s of sources(host)) {
        if (!allowed(s.key) || !inRange(s)) continue;
        for (const it of s.items() ?? []) if (it && !next.has(it)) next.set(it, s);
      }
      // Preserve the user's sort order; source indices are never used to identify a clicked item.
      for (let i = view.length - 1; i >= 0; i--) if (!next.has(view[i])) view.splice(i, 1);
      const kept = new Set(view);
      for (const it of next.keys()) if (!kept.has(it)) view.push(it);
      owners.clear(); for (const [it, s] of next) owners.set(it, s);
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
      // This is a detector, not a storage collection. The UI's callback would transfer
      // FROM the display array; deliberately do not call it. Transfer from the LIVE source
      // with the game's own planTake/applyTransfer, then rebuild only the display references.
      commit(dir, item, amount) {
        if (closed || moving || dir !== 'take') return false;
        const previous = owners.get(item), t = tools();
        const source = previous && sources(host).find(s => s.key === previous.key);
        if (!source || !inRange(source) || !actualItem(source.items(), item)
          || typeof t?.planTake !== 'function' || typeof t?.applyTransfer !== 'function') { refresh(); return false; }
        let moved = false;
        moving = true;
        const wasVisiting = root.__dfoLootVisiting;
        root.__dfoLootVisiting = true;
        try {
          source.visit((actual) => {
            const live = actualItem(actual, item);
            if (closed || !live || !inRange(source)) return false;
            const plan = t.planTake(live, { bag: host.entity.items ?? [], entity: host.entity, mode: 'remove', getQuest: host.getQuest });
            if (!plan.ok || !Number.isFinite(amount) || amount <= 0 || amount > plan.amount) return false;
            const before = live.stackCount ?? 1;
            t.applyTransfer(live, { ...plan, amount }, actual, host.entity.items ??= [], { entity: host.entity, toPlayer: true });
            moved = !actual.includes(live) || (live.stackCount ?? 1) < before;
            return moved;
          });
          return moved;
        } finally { root.__dfoLootVisiting = wasVisiting; moving = false; refresh(); }
      },
      closed() { if (closed) return; closed = true; view.length = 0; owners.clear(); onClose(); },
    };
    return loot;
  }

  function controller() {
    const hosts = new Map();
    let current = null, opening = false;
    const api = {
      register(id, host) { hosts.set(id, host); },
      open() {
        if (opening || (current && !current.window?.done)) return false;
        current = null;
        const base = [...hosts.values()].reverse().find((h) => h.feet());
        if (!base) return false;
        if (base.blocked()) return false;
        const resolved = base.resolve?.();
        if (resolved === false) return false;
        const host = resolved ?? base;
        if (!host.feet() || host.blocked()) return false;
        opening = true;
        const state = { window: null, loot: null };
        try {
          const loot = createSession(host, { onClose: () => { if (current === state) current = null; } });
          state.loot = loot; current = state;
          state.window = host.open(loot);
          if (!state.window) { loot.closed(); return false; }
          return true;
        } catch (e) {
          state.loot?.closed(); current = null;
          console.warn('[dfo-mod] nearby loot:', e);
          return false;
        } finally { opening = false; }
      },
      isOpen: () => !!current && !current.window?.done,
    };
    return api;
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { RADIUS, allowed, distance, position, groundPile, sources, actualItem, createSession, controller };
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
    if (e.repeat || !api.open()) return;
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
})(globalThis);
