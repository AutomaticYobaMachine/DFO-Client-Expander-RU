// Nearby loot references original sources and uses the game's inventory door and transfers.
(function (root) {
  'use strict';
  // The mod's own words, in the install's language (page/dfo_ui_text.js; English without the translation).
  const T = (key, params) => (root.__dfoUi ? root.__dfoUi.t(key, params) : key);
  const Rules = typeof module === 'object' && module.exports ? require('./dfo_loot_rules.js') : root.__dfoLootRules;
  const DEFAULT_SETTINGS = Rules.cleanSettings();
  const RADIUS = 15;
  const allowed = (key) => /^(?:loot|corpse|foeCorpse|guardCorpse|droppedLoot):/.test(key);
  // PlayerMotor.pos is Float32Array in the world, town and interior hosts.
  // Dungeon feet may be a plain array; both are coordinates, never game entities.
  const vector3 = v => (Array.isArray(v) || ArrayBuffer.isView(v)) && v.length === 3
    && Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2]);
  const distance = (a, b) => vector3(a) && vector3(b) ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : Infinity;
  const position = (target) => target.pos ?? (target.aabb && [
    (target.aabb.min[0] + target.aabb.max[0]) / 2, target.aabb.min[1],
    (target.aabb.min[2] + target.aabb.max[2]) / 2,
  ]);
  const MAX_VERTICAL = 2.25;
  // This is an interaction ray, not a route for the player's standing capsule.
  // A table/low plinth may block walking while its loot is visible from the eye.
  // Keep a separate storey limit even in open stairwells, where sight alone is not enough.
  function canReach(feet, target, collider, eye = null) {
    if (!vector3(feet) || !vector3(target)
      || distance(vector3(eye) ? eye : feet, target) > RADIUS || Math.abs(feet[1] - target[1]) > MAX_VERTICAL
      || typeof collider?.raycast !== 'function') return false;
    if (eye != null && !vector3(eye)) return false;
    try {
      const origin = vector3(eye) ? Array.from(eye) : [feet[0], feet[1] + 1.6, feet[2]];
      // Native target positions are at the base of the flat/body. Aim just above
      // that support, never at the centre of a big AABB that may be inside a wall.
      const end = [target[0], target[1] + 0.06, target[2]], delta = end.map((v, j) => v - origin[j]), length = Math.hypot(...delta);
      if (length < 0.0001) return true;
      const direction = delta.map(v => v / length), filter = { bodies: true };
      const terrain = collider.surfaceAt ?? collider.heightAt;
      if (typeof terrain === 'function') {
        const samples = Math.max(1, Math.ceil(length / 0.5));
        for (let i = 0; i <= samples; i++) {
          const t = i / samples, x = origin[0] + delta[0] * t, z = origin[2] + delta[2] * t;
          const y = terrain.call(collider, x, z);
          if (Number.isFinite(y) && y > origin[1] + delta[1] * t + 0.015) return false;
        }
      }
      // surfaceHit includes outdoor terrain, which raycast alone does not.
      const hit = collider.surfaceHit?.(origin, direction, length, filter);
      const mesh = collider.raycast(origin, direction, length, filter);
      const clear = d => d === Infinity || Number.isFinite(d) && d >= length - 0.0001;
      return clear(mesh) && (hit == null || clear(hit.dist));
    } catch { return false; } // Never fall back to distance-only access after a geometry failure.
  }
  // Only drawn ground piles, never the hidden backing lists of searchables, coffers or furniture.
  const groundPile = (p) => p && !p.dead && !p.inactive && p.drawn !== false && !p.owner && !p.wild && !p.wildBody;

  function physicalPositions(drops) {
    const positions = new Map();
    if (drops?._piles?.some(p => p.physical && groundPile(p)))
      for (const p of drops.physical?.state?.() ?? []) if (p.kind === 'pile' && vector3(p.pos)) positions.set(p.item, p.pos);
    return positions;
  }
  // Physical-item targets are visual proxies. Use their actual position but keep
  // the numeric backing pile key and its native transaction, never pick the proxy twice.
  function dungeonSources(api, drops) {
    const out = [], seen = new Set(), positions = physicalPositions(drops);
    const add = t => {
      if (!/^(loot|corpse|droppedLoot):/.test(t.key) || t.key.startsWith('droppedLoot:pi')) return;
      if (t.key.startsWith('droppedLoot:') && !groundPile(drops.pileFor(t.key))) return;
      seen.add(t.key);
      out.push({ ...t, items: () => api.lootContents(t.key), visit: fn => api.takeLoot(t.key, 'grab', [], fn) });
    };
    for (const t of api.lootTargets()) add(t);
    for (const p of drops._piles ?? []) {
      const key = `droppedLoot:${p.id}`;
      if (!p.physical || !groundPile(p) || !p.items?.length || seen.has(key)) continue;
      out.push({ key, pos: positions.get(p.items[0]) ?? p.pos,
        items: () => groundPile(p) ? p.items : null, visit: fn => api.takeLoot(key, 'grab', [], fn) });
    }
    return out;
  }

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
    const positions = physicalPositions(drops);
    for (const p of drops?._piles ?? []) {
      if (!groundPile(p)) continue;
      out.push({ key: `droppedLoot:${p.id}`, pos: positions.get(p.items?.[0]) ?? p.pos, items: () => groundPile(p) ? p.items : null,
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
      const feet = host.feet(), eye = host.eye?.(), pos = position(s), collider = host.collider?.(), now = Date.now();
      const stamp = JSON.stringify([feet, eye, pos]), old = accessCache.get(s.key);
      if (!fresh && old?.stamp === stamp && old.collider === collider && now - old.at < 150) return old.ok;
      const ok = canReach(feet, pos, collider, eye);
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
      nearby: true, title: T('loot.nearbyTitle'),
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
          if (result.taken) host.say?.(T('loot.auto.taken',{n:result.taken}));
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
          initial.say?.(T('loot.settingsLoadFailed'));
          console.warn('[dfo-mod] loot settings:', e); return false;
        } finally { opening = false; }
      },
      isOpening: () => opening,
      isOpen: () => !!current && !current.window?.done,
    };
    return api;
  }

  function bindInput(api, cfg, target = root) {
    const code = cfg.keyCode || 'KeyJ';
    // Labels use the physical mouse numbering players see: middle = 3, back = 4,
    // forward = 5. DOM button numbers are 1, 3 and 4 respectively.
    const button = ({ Mouse3: 1, Mouse4: 3, Mouse5: 4 })[code];
    let keyHeld = false, mouseOwned = false, mouseDown = false;
    const consume = e => { e.preventDefault(); e.stopImmediatePropagation(); };
    const editable = node => node?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]');
    function activate(e) {
      if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey
        || editable(e.target) || editable(target.document?.activeElement)) return false;
      if (api.isOpen() || api.isOpening()) { consume(e); return true; }
      if (e.repeat || !api.canOpen()) return false;
      consume(e); void api.activate(); return true;
    }
    const listeners = {
      keydown(e) {
        if (button !== undefined || e.code !== code) return;
        if (keyHeld) { consume(e); return; }
        // Once our window is open, its keyboard controls keep their normal
        // meaning even when Tab/Enter/Space is also the world loot binding.
        if (api.isOpen() && (e.code === 'Tab' || (['Enter', 'NumpadEnter', 'Space'].includes(e.code)
          && e.target?.closest?.('button,[role="button"]')))) return;
        if (activate(e)) keyHeld = true;
      },
      keyup(e) {
        if (keyHeld && e.code === code) { consume(e); keyHeld = false; }
      },
      pointerdown(e) {
        if (button === undefined || e.button !== button || (e.pointerType && e.pointerType !== 'mouse')) return;
        mouseOwned = mouseDown = activate(e);
      },
      mousedown(e) {
        if (button === undefined || e.button !== button) return;
        // A pointer press can also produce a compatibility mousedown, even if
        // autoloot already finished and no window remains. Never activate twice.
        if (mouseOwned && mouseDown) { consume(e); return; }
        mouseOwned = mouseDown = activate(e);
      },
      pointerup(e) {
        if (mouseOwned && e.button === button) { consume(e); mouseDown = false; }
      },
      mouseup(e) {
        if (mouseOwned && e.button === button) { consume(e); mouseDown = false; }
      },
      auxclick(e) {
        if (mouseOwned && e.button === button) { consume(e); mouseOwned = false; }
      },
      pointercancel() { mouseOwned = mouseDown = false; },
      blur() { keyHeld = mouseOwned = mouseDown = false; },
    };
    for (const [name, fn] of Object.entries(listeners)) target.addEventListener(name, fn, true);
    return () => { for (const [name, fn] of Object.entries(listeners)) target.removeEventListener?.(name, fn, true); };
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { RADIUS, MAX_VERTICAL, canReach, allowed, distance, position, groundPile, dungeonSources, sources, actualItem, createSession, controller, bindInput };
    return;
  }
  if (root.__dfoLoot) return;
  const cfg = root.__DFO_MOD_CFG__?.nearbyLoot ?? {};
  if (cfg.enabled === false) return;
  root.__dfoLootGround = groundPile;
  const api = root.__dfoLoot = controller();
  api.dungeonSources = dungeonSources;
  bindInput(api, cfg);
})(globalThis);
