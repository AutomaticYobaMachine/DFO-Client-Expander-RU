// Nearby loot references original sources and uses the game's inventory door and transfers.
(function (root) {
  'use strict';
  // The mod's own words, in the install's language (page/dfo_ui_text.js; English without the translation).
  const T = (key, params) => (root.__dfoUi ? root.__dfoUi.t(key, params) : key);
  const Rules = typeof module === 'object' && module.exports ? require('./dfo_loot_rules.js') : root.__dfoLootRules;
  const DEFAULT_SETTINGS = Rules.cleanSettings();
  const RADIUS = 15;
  // srch: a searched chest's find, open while its search cools; spoil: an instance's reward lying on the floor.
  const allowed = (key) => /^(?:loot|corpse|foeCorpse|guardCorpse|droppedLoot|srch|spoil):/.test(key);
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
  // Loot within this band of the bare ground lies on open terrain, which has no storeys.
  const GROUND_BAND = 0.75;
  // The ground right under the thing aimed at is its support, not an obstacle: a pile's stored foot may sit a little
  // under the sampled terrain, and a body marker lands on the mesh the terrain sampler does not see.
  const NEAR_TARGET = 0.75, NEAR_EYE = 0.3, TERRAIN_SLACK = 0.05;
  const terrainOf = (collider) => {
    const f = collider?.surfaceAt ?? collider?.heightAt;
    return typeof f === 'function' ? f : null;
  };
  const groundAt = (terrain, collider, x, z) => {
    try { const y = terrain.call(collider, x, z); return Number.isFinite(y) ? y : null; } catch { return null; }
  };
  // Where to look: a pile's/body's/piece's base, middle and top (any one seen is enough - a terrain bump or a low step
  // may hide its foot while the thing itself is in plain view); a stuck shaft at the part standing out of what it struck.
  function aimPoints(target, shape) {
    if (vector3(shape?.dir)) {
      const d = shape.dir, lift = Number.isFinite(shape.lift) ? shape.lift : 0;
      return [0.12, 0.3].map(back => [target[0] - d[0] * back, target[1] + lift - d[1] * back, target[2] - d[2] * back]);
    }
    const h = Number.isFinite(shape?.height) && shape.height > 0.12 ? Math.min(shape.height, 2) : 0.6;
    return [...new Set([0.06, Math.min(0.3, h / 2), h - 0.05])].map(up => [target[0], target[1] + up, target[2]]);
  }
  function sees(origin, end, base, collider, terrain, shape) {
    const delta = end.map((v, j) => v - origin[j]), length = Math.hypot(...delta);
    if (length < 0.0001) return true;
    const direction = delta.map(v => v / length), filter = { bodies: true };
    if (terrain) {
      const samples = Math.max(1, Math.ceil(length / 0.5));
      for (let i = 0; i <= samples; i++) {
        const t = i / samples, x = origin[0] + delta[0] * t, z = origin[2] + delta[2] * t;
        if (t * length < NEAR_EYE || Math.hypot(x - base[0], z - base[2]) < NEAR_TARGET) continue;
        const y = groundAt(terrain, collider, x, z);
        if (y != null && y > origin[1] + delta[1] * t + TERRAIN_SLACK) return false;
      }
    }
    // A chest stands in the collider as its own mesh: a ray that meets it above its foot has reached it.
    const box = shape?.solid && shape.box;
    const own = d => !!box && [0, 1, 2].every(j => {
      const p = origin[j] + direction[j] * d;
      return p >= box.min[j] - 0.1 && p <= box.max[j] + 0.1;
    }) && origin[1] + direction[1] * d > base[1] + 0.03;
    const clear = d => d === Infinity || Number.isFinite(d) && (d >= length - 0.0001 || own(d));
    // The ground is the sampler's, walked above. The game's surfaceHit stands for it only where there is none: its ground
    // arm is the flat plane at the height under the EYE (collider.js), which any ray down a hillside meets long before
    // the loot - every pile lower than the player's own ground read as hidden.
    const hit = terrain ? null : collider.surfaceHit?.(origin, direction, length, filter);
    const mesh = collider.raycast(origin, direction, length, filter);
    return clear(mesh) && (hit == null || clear(hit.dist));
  }
  // This is an interaction ray, not a route for the player's standing capsule.
  // A table/low plinth may block walking while its loot is visible from the eye.
  // Keep a separate storey limit even in open stairwells, where sight alone is not enough - except on open ground:
  // loot lying on the terrain of a hillside or at a cliff's foot is limited by the sphere and the line of sight alone.
  function canReach(feet, target, collider, eye = null, shape = null) {
    if (!vector3(feet) || !vector3(target) || typeof collider?.raycast !== 'function') return false;
    if (eye != null && !vector3(eye)) return false;
    if (distance(vector3(eye) ? eye : feet, target) > RADIUS) return false;
    try {
      const terrain = terrainOf(collider);
      const onGround = p => { const g = terrain ? groundAt(terrain, collider, p[0], p[2]) : null; return g != null && Math.abs(p[1] - g) <= GROUND_BAND; };
      // Both ends on open ground: a hillside or a cliff's foot. A player on a bridge or a wall keeps the storey limit.
      const vertical = onGround(feet) && onGround(target) ? RADIUS : MAX_VERTICAL;
      const level = vector3(shape?.dir) && Number.isFinite(shape.lift) ? target[1] + shape.lift : target[1];
      if (Math.abs(feet[1] - level) > vertical) return false;
      const origin = vector3(eye) ? Array.from(eye) : [feet[0], feet[1] + 1.6, feet[2]];
      for (const end of aimPoints(target, shape)) if (sees(origin, end, target, collider, terrain, shape)) return true;
      return false;
    } catch { return false; } // Never fall back to distance-only access after a geometry failure.
  }
  // Ground piles the press offers: drawn ones, and the loose kinds another pass draws (a stuck shaft, Deep Waters'
  // sunken caches) or a spawner tracks (a hideout's spill). Never a player's remains (wild bodies, the house's fallen)
  // or the hidden backing lists of searchables, coffers or furniture.
  const LOOSE_OWNERS = new Set(['stuckArrow', 'deepWaters', 'lw-hideout']);
  const UNDRAWN_OWNERS = new Set(['stuckArrow', 'deepWaters']);
  const groundPile = (p) => !!p && !p.dead && !p.inactive && !p.wild && !p.wildBody
    && (p.owner == null || LOOSE_OWNERS.has(p.owner)) && (p.drawn !== false || UNDRAWN_OWNERS.has(p.owner));
  // A stuck shaft is aimed at where it stands out of what it struck (arrowFlight.js: its pile's foot is 0.3 under it).
  const pileShape = (p) => (p.owner === 'stuckArrow' && vector3(p.stuckDir) ? { dir: p.stuckDir, lift: 0.3 } : null);

  // Physical Items stands each item as its own proxy: a shift-drop's, and every body's, thrown out round it - over a
  // ledge, down a slope. The vanilla press takes an item where its proxy lies, so that is where it is reached too.
  function physicalPositions(drops) {
    const positions = new Map();
    for (const p of drops?.physical?.state?.() ?? []) if ((p.kind === 'pile' || p.kind === 'corpse') && vector3(p.pos)) positions.set(p.item, p.pos);
    return positions;
  }
  // An instance's reward on the floor (scenes/spoilsPool.js, the place's pool - the Sky-Ketch's hold, the Hour's, a
  // gate's court): each resting item a source of one, taken by the pool's own press. Its gold goes to the purse when
  // the court is left, and is no item to list.
  function spoilSources() {
    const pool = root.__dfoLootSpoils, out = [];
    if (!pool) return out;
    let targets = [];
    try { targets = [...(pool.targets() ?? [])]; } catch { return out; }
    for (const t of targets) {
      if (typeof t?.key !== 'string' || !t.key.startsWith('spoil:') || !t.aabb) continue;
      const key = t.key;
      out.push({ key, pos: position(t), shape: { height: t.aabb.max[1] - t.aabb.min[1] },
        items: () => { try { return pool.contents(key); } catch { return null; } }, press: () => !!pool.pick(key) });
    }
    return out;
  }
  // Physical-item targets are visual proxies. Use their actual position but keep
  // the numeric backing pile key and its native transaction, never pick the proxy twice.
  function dungeonSources(api, drops) {
    const out = [], seen = new Set(), positions = physicalPositions(drops), itemAt = item => positions.get(item) ?? null;
    const add = t => {
      if (!/^(loot|corpse|droppedLoot):/.test(t.key) || t.key.startsWith('droppedLoot:pi')) return;
      const pile = t.key.startsWith('droppedLoot:') ? drops.pileFor(t.key) : null;
      if (t.key.startsWith('droppedLoot:') && !groundPile(pile)) return;
      seen.add(t.key);
      out.push({ ...t, shape: pile ? pileShape(pile) : null, itemAt, items: () => api.lootContents(t.key), visit: fn => api.takeLoot(t.key, 'grab', [], fn) });
    };
    for (const t of api.lootTargets()) add(t);
    for (const p of drops._piles ?? []) {
      const key = `droppedLoot:${p.id}`;
      if (!groundPile(p) || !p.items?.length || seen.has(key)) continue;
      out.push({ key, pos: positions.get(p.items[0]) ?? p.pos, shape: pileShape(p), itemAt,
        items: () => groundPile(p) ? p.items : null, visit: fn => api.takeLoot(key, 'grab', [], fn) });
    }
    // A searched chest's find while its search cools: the press opens that very list again and rolls nothing
    // (dungeonContext.js activateSearchable). A chest not yet searched, or cooled down, is never opened from here.
    for (const f of api.finds?.() ?? []) {
      const key = `srch:${f.index}`, box = f.aabb;
      if (!box) continue;
      out.push({ key, pos: [(box.min[0] + box.max[0]) / 2, box.min[1], (box.min[2] + box.max[2]) / 2],
        shape: { height: box.max[1] - box.min[1], box, solid: true },
        items: () => api.finds?.().find(x => x.index === f.index)?.items ?? null, visit: fn => api.takeLoot(key, 'grab', [], fn) });
    }
    return out.concat(spoilSources());
  }

  function sources(host) {
    if (host.sources) return host.sources();
    const out = [];
    const drops = host.dropped?.();
    const positions = physicalPositions(drops), itemAt = item => positions.get(item) ?? null;
    for (const pool of host.pools?.() ?? []) {
      if (!pool) continue;
      for (const t of pool.lootTargets()) out.push({
        ...t, itemAt, items: () => pool.hoverContents(t.key),
        visit: (fn) => pool.takeLoot(t.key, host.say, (loot) => {
          loot.opened?.();
          try { return fn(loot.items()) !== false; } finally { loot.closed?.(); }
        }),
      });
    }
    for (const p of drops?._piles ?? []) {
      if (!groundPile(p)) continue;
      out.push({ key: `droppedLoot:${p.id}`, pos: positions.get(p.items?.[0]) ?? p.pos, shape: pileShape(p), items: () => groundPile(p) ? p.items : null,
        visit: (fn) => {
          const hadLoot = p.container && p.items.length > 0;
          try { const moved = fn(p.items); if (moved && hadLoot) host.pileTaken?.(p); return moved; }
          finally { drops.releaseEmptied(); }
        },
      });
    }
    return out.concat(spoilSources());
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
    const reachAt = (id, pos, shape, fresh) => {
      const feet = host.feet(), eye = host.eye?.(), collider = host.collider?.(), now = Date.now();
      const stamp = JSON.stringify([feet, eye, pos]), old = accessCache.get(id);
      if (!fresh && old?.stamp === stamp && old.collider === collider && now - old.at < 150) return old.ok;
      const ok = canReach(feet, pos, collider, eye, shape);
      accessCache.set(id, { stamp, collider, at: now, ok }); return ok;
    };
    const inRange = (s, fresh = false) => reachAt(s.key, position(s), s.shape ?? null, fresh);
    // An item is in reach where its source is, or where Physical Items threw its proxy - at a cliff's foot, say.
    const proxyAt = (s, item) => { const at = item && s.itemAt?.(item); return vector3(at) ? at : null; };
    const reachable = (s, item, fresh = false) => {
      if (inRange(s, fresh)) return true;
      const at = proxyAt(s, item);
      return !!at && reachAt(`${s.key}|${at[0].toFixed(2)},${at[1].toFixed(2)},${at[2].toFixed(2)}`, at, null, fresh);
    };
    // A pressed source (a reward on the floor) is taken whole by its own door, as the press takes it; every other one
    // through the game's planTake from its live list.
    const planOf = (source, live) => (source.press ? { ok: true, amount: live.stackCount ?? 1 }
      : tools().planTake(live, { bag: host.entity.items ?? [], entity: host.entity, mode: 'remove', getQuest: host.getQuest }));
    const refresh = () => {
      if (closed || moving) return;
      const next = new Map();
      for (const s of sources(host)) {
        if (!allowed(s.key)) continue;
        const whole = inRange(s);
        if (!whole && !s.itemAt) continue;
        for (const it of s.items() ?? []) if (it && !next.has(it) && (whole || reachable(s, it))) next.set(it, s);
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
          if (!live || (!source.press && !t?.planTake)) { failed++; continue; }
          const plan = planOf(source, live), before = live.stackCount ?? 1;
          if (!plan.ok || plan.claimsChoice) { failed++; refusal ??= plan.refusal?.text; continue; }
          if (this.commit('take', it, plan.amount)) {
            taken++;
            if (plan.amount < before) { failed++; refusal ??= lastRefusal; }
          } else { failed++; refusal ??= lastRefusal || (source.press ? null : planOf(source, live).refusal?.text); }
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
          if (!live || (!source.press && !t?.planTake)) { failed++; continue; }
          const plan = planOf(source, live);
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
        if (!source || !actualItem(source.items(), item) || !reachable(source, item, true)) { refresh(); return false; }
        if (source.press) {
          // The pool's own press takes the whole piece into the pack (spoilsPool.js pick) - never a copy moved by us.
          moving = true;
          try { return !!source.press(item); } catch { return false; } finally { moving = false; refresh(); }
        }
        if (typeof t?.planTake !== 'function' || typeof t?.applyTransfer !== 'function') { refresh(); return false; }
        let moved = false;
        moving = true;
        const wasVisiting = root.__dfoLootVisiting;
        root.__dfoLootVisiting = true;
        try {
          source.visit((actual) => {
            const live = actualItem(actual, item);
            if (closed || !live || !(reachable(source, item, true) || reachable(source, live, true))) return false;
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
    module.exports = { RADIUS, MAX_VERTICAL, canReach, allowed, distance, position, groundPile, pileShape, physicalPositions, spoilSources, dungeonSources, sources, actualItem, createSession, controller, bindInput };
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
