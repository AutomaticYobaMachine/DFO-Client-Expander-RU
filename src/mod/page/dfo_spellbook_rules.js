(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.__dfoSpellbookRules = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  // Persistent Spellbook settings & custom ordering rules (dfo-mod-cache.json, namespace 'spellbook').
  // Stores ONLY normalized sort mode & per-character spell order keys — never raw game spell entities.
  const SCHEMA_VERSION = 1;
  const NAMESPACE = 'spellbook';
  const STORAGE_KEY = 'dfoMod.cache';
  const SORT_MODES = Object.freeze(['custom', 'default', 'name', 'costAsc', 'costDesc', 'school']);
  const SORT_SET = new Set(SORT_MODES);
  const MAX_PROFILES = 24;
  const MAX_ORDER_KEYS = 4096;
  const MAX_KEY_LEN = 96;
  const MAX_PROFILE_LEN = 64;

  function cleanProfileKey(raw) {
    if (typeof raw !== 'string') return '';
    const s = raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u0400-\u04ff_.:-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, MAX_PROFILE_LEN);
    return s;
  }

  function profileKeyOf(entity) {
    if (!entity || typeof entity !== 'object') return 'default';
    const parts = [
      typeof entity.name === 'string' ? entity.name.trim() : '',
      typeof entity.race === 'string' ? entity.race.trim() : '',
      typeof entity.career?.name === 'string' ? entity.career.name.trim() : '',
    ].filter(Boolean);
    const key = cleanProfileKey(parts.join(':'));
    return key || 'default';
  }

  function spellEffectSig(spell) {
    const fxs = Array.isArray(spell?.effects) ? spell.effects : [];
    const parts = [];
    for (let i = 0; i < Math.min(3, fxs.length); i++) {
      const ef = fxs[i];
      if (!ef || ef.type == null || ef.type < 0) continue;
      const sub = ef.subType == null || ef.subType < 0 ? 255 : (ef.subType & 255);
      parts.push(`${ef.type}.${sub}`);
    }
    return parts.join(',');
  }

  // Deterministic unique order key for each live spell object without mutating the spell itself.
  // Primary identity is `i:<spell.index>` (stable across renames, icon edits, and game save/load).
  function spellOrderKeys(spells) {
    const list = Array.isArray(spells) ? spells : [];
    const seen = new Map();
    const out = new Array(list.length);
    for (let idx = 0; idx < list.length; idx++) {
      const sp = list[idx];
      let base;
      if (sp && Number.isFinite(sp.index)) {
        base = `i:${Math.trunc(sp.index)}`;
      } else {
        const rawName = String(sp?.name ?? '').trim().toLowerCase().slice(0, 32);
        base = `n:${rawName}|${spellEffectSig(sp)}`;
      }
      const count = seen.get(base) || 0;
      seen.set(base, count + 1);
      const key = count === 0 ? base : `${base}#${count}`;
      out[idx] = key.slice(0, MAX_KEY_LEN);
    }
    return out;
  }

  function cleanOrderList(raw, validSet = null) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    const out = [];
    for (let i = 0; i < raw.length; i++) {
      const item = raw[i];
      if (typeof item !== 'string') continue;
      const key = item.trim();
      if (!key || key.length > MAX_KEY_LEN || seen.has(key)) continue;
      if (validSet && !validSet.has(key)) continue;
      seen.add(key);
      out.push(key);
      if (out.length >= MAX_ORDER_KEYS) break;
    }
    return out;
  }

  // Merge saved order with currently known spells:
  // - preserves saved order for spells still in the book,
  // - appends newly learned spells at the end in native order,
  // - drops deleted/missing spell keys cleanly (zero stale-key bloat!).
  function reconcileOrder(savedKeys, currentKeys) {
    const cur = cleanOrderList(currentKeys);
    if (!cur.length) return [];
    const curSet = new Set(cur);
    const kept = cleanOrderList(savedKeys, curSet);
    const keptSet = new Set(kept);
    for (let i = 0; i < cur.length; i++) {
      if (!keptSet.has(cur[i])) {
        kept.push(cur[i]);
        keptSet.add(cur[i]);
      }
    }
    return kept;
  }

  function isDefaultOrder(orderKeys, nativeKeys) {
    if (!Array.isArray(orderKeys) || !Array.isArray(nativeKeys)) return true;
    if (orderKeys.length !== nativeKeys.length) return false;
    for (let i = 0; i < orderKeys.length; i++) {
      if (orderKeys[i] !== nativeKeys[i]) return false;
    }
    return true;
  }

  function cleanOrdersMap(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    let count = 0;
    for (const [rawPid, rawList] of Object.entries(raw)) {
      const pid = cleanProfileKey(rawPid);
      if (!pid || Object.prototype.hasOwnProperty.call(out, pid)) continue;
      const list = cleanOrderList(rawList);
      if (!list.length) continue;
      out[pid] = list;
      count++;
      if (count >= MAX_PROFILES) break;
    }
    return out;
  }

  function cleanSettings(raw) {
    const sortMode = typeof raw?.sortMode === 'string' && SORT_SET.has(raw.sortMode) ? raw.sortMode : 'custom';
    const orders = cleanOrdersMap(raw?.orders);
    return {
      v: SCHEMA_VERSION,
      sortMode,
      orders,
    };
  }

  function cleanState(raw) {
    const base = cleanSettings(raw);
    const rev = Number.isInteger(raw?.revision) && raw.revision >= 0 ? raw.revision : 0;
    return { ...base, revision: rev };
  }

  function withProfileOrder(settings, profileKey, nextOrderKeys, nativeKeys = null) {
    const cleaned = cleanSettings(settings);
    const pid = cleanProfileKey(profileKey) || 'default';
    const nextOrders = { ...cleaned.orders };
    const pruned = cleanOrderList(nextOrderKeys);
    if (!pruned.length || (Array.isArray(nativeKeys) && isDefaultOrder(pruned, nativeKeys))) {
      delete nextOrders[pid];
    } else {
      // Keep profile count bounded: preserve existing order of keys, move touched profile to end (LRU-friendly)
      delete nextOrders[pid];
      const keys = Object.keys(nextOrders);
      while (keys.length >= MAX_PROFILES) {
        const drop = keys.shift();
        delete nextOrders[drop];
      }
      nextOrders[pid] = pruned;
    }
    return cleanSettings({
      v: SCHEMA_VERSION,
      sortMode: cleaned.sortMode,
      orders: nextOrders,
    });
  }

  return Object.freeze({
    SCHEMA_VERSION,
    NAMESPACE,
    STORAGE_KEY,
    SORT_MODES,
    MAX_PROFILES,
    MAX_ORDER_KEYS,
    cleanProfileKey,
    profileKeyOf,
    spellOrderKeys,
    cleanOrderList,
    reconcileOrder,
    isDefaultOrder,
    cleanSettings,
    cleanState,
    withProfileOrder,
  });
});
