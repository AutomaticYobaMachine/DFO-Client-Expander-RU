// THE INVENTORY'S RULES (docs/inventory.md): its pages, the Junk page's rule and the surrogate stacks. Pure - no DOM, no
// game state; the settings hold words and ids only, never an item. Shared by the page (page/dfo_pack.js) and the
// mod's cache (loot-store.cjs, the `pack` namespace of dfo-mod-cache.json).
(function (root) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const Data = node ? require('./dfo_pack_data.js') : root.__dfoPackData;
  const T = (key, params) => (root.__dfoUi ? root.__dfoUi.t(key, params) : key);
  const INGREDIENTS = new Set(Data?.ingredients ?? []), SALE = new Set(Data?.sale ?? []), NOTES = new Set(Data?.notes ?? []);
  const SPELLBOOK = Data?.spellbook ?? 132;
  // Nine pages, the native spine's three by three: Magic leaves (an enchanted piece lives on its base's page), Junk comes.
  const PAGES = Object.freeze(['weapons', 'armor', 'clothing', 'potions', 'ingredients', 'books', 'valuables', 'misc', 'junk']);
  const PAGES_SET = new Set(PAGES);
  const STACKED = Object.freeze(new Set(['misc', 'ingredients', 'junk']));
  const VIEWS = Object.freeze(['rows', 'grid']);
  const CHARCOLS = Object.freeze(['v2', 'v1']);
  const cleanCharcol = v => (CHARCOLS.includes(v) ? v : 'v2');
  const SORT_MODES = Object.freeze(['rarity', 'type', 'material', 'name', 'count']);
  const cleanSortMode = v => (SORT_MODES.includes(v) ? v : 'rarity');
  // The Junk page's own tags, beside the loot filter's catalogue (page/dfo_loot_rules.js tagsOf).
  const SALE_TAG = 'use:sale';
  const DEFAULT_JUNK = Object.freeze([SALE_TAG, 'state:junk']);
  const MAX_TAGS = 4096, MAX_ITEMS = 1024;
  const uniq = (xs, max) => [...new Set((Array.isArray(xs) ? xs : []).filter(x => typeof x === 'string' && x.length > 0 && x.length <= 1024))].slice(0, max);
  const cleanJunk = j => (j && typeof j === 'object' && !Array.isArray(j)
    ? { tags: uniq(j.tags, MAX_TAGS), items: uniq(j.items, MAX_ITEMS) }
    : { tags: [...DEFAULT_JUNK], items: [] });
  const cleanSettings = s => ({
    v: 1,
    view: VIEWS.includes(s?.view) ? s.view : 'rows',
    charcol: cleanCharcol(s?.charcol),
    // Auto-sorting stays active permanently; only the active sort profile is configurable.
    autoSort: true,
    sortMode: cleanSortMode(s?.sortMode),
    junk: cleanJunk(s?.junk),
  });
  const cleanState = s => ({ ...cleanSettings(s), revision: Number.isSafeInteger(s?.revision) && s.revision >= 0 ? s.revision : 0 });

  /** The page list the spine shows: the native one less Magic, Junk last - each native page keeps its native word, so the
   *  translation words it as it words the game. */
  function pages(native) {
    const word = new Map((Array.isArray(native) ? native : []).map(([id, label]) => [id, label]));
    return Object.freeze(PAGES.map(id => Object.freeze([id, id === 'junk' ? T('pack.page.junk') : word.get(id) ?? id])));
  }
  const isNote = it => it?.group === 'UselessItems2' && NOTES.has(it.templateIndex);
  /** An ingredient: a template a recipe of the game spends (tools/build-pack-data.mjs) - never a quest's piece. */
  const isIngredient = it => !!it && !it.questItem && INGREDIENTS.has(it.templateIndex);
  /** A thing to sell: a base the description tables send to a counter - never a quest's piece. */
  const forSale = it => !!it && !it.questItem && SALE.has(it.templateIndex);
  /** The page without Junk. `base` is the native pageOf less its Magic arm, so an enchanted sword is a weapon there. */
  function basePage(it, base) {
    if (!it) return 'misc';
    if (it.templateIndex === SPELLBOOK && it.group === 'MiscItems') return 'books';   // the spellbook is read
    if (isNote(it)) return 'books';                                                       // notes and quest letters
    const page = base(it);
    if (page === 'ingredients' || page === 'misc') return isIngredient(it) ? 'ingredients' : 'misc';
    return PAGES_SET.has(page) ? page : 'misc';
  }
  /** The tags the Junk rule reads: the loot filter's (when its tools stand) and the Junk page's own. */
  function junkTags(it, tools, lootRules) {
    const out = lootRules && tools ? lootRules.tagsOf(it, tools) : [];
    if (forSale(it)) out.push(SALE_TAG);
    if (it.junk === true && !out.includes('state:junk')) out.push('state:junk');
    return out;
  }
  const typeKey = it => `type:${it?.group ?? ''}:${it?.templateIndex ?? -1}`;
  const compiledJunkCache = new WeakMap();
  function compileJunk(j) {
    let c = compiledJunkCache.get(j);
    if (c) return c;
    const items = Array.isArray(j.items) ? j.items : [];
    const tags = Array.isArray(j.tags) ? j.tags : [];
    const itemSet = items.length ? new Set(items) : null;
    const tagSet = tags.length ? new Set(tags) : null;
    const hasSale = tagSet ? tagSet.has(SALE_TAG) : false;
    const hasStateJunk = tagSet ? tagSet.has('state:junk') : false;
    let hasOtherTags = false;
    if (tagSet) {
      for (const t of tagSet) {
        if (t !== SALE_TAG && t !== 'state:junk') { hasOtherTags = true; break; }
      }
    }
    c = { itemSet, tagSet, hasSale, hasStateJunk, hasOtherTags };
    compiledJunkCache.set(j, c);
    return c;
  }
  const DEFAULT_JUNK_OBJ = Object.freeze({ tags: DEFAULT_JUNK, items: Object.freeze([]) });
  /** Whether the player's rule calls the piece junk: ANY ticked tag, or the piece's kind. A quest's piece never is. */
  function isJunk(it, junk, tools, lootRules) {
    if (!it || it.questItem) return false;
    const c = compileJunk(junk && typeof junk === 'object' ? junk : DEFAULT_JUNK_OBJ);
    if (c.itemSet && (c.itemSet.has(typeKey(it)) || c.itemSet.has(`type:*:${it.templateIndex}`) || (lootRules && c.itemSet.has(lootRules.variantKey(it))))) return true;
    if (!c.tagSet) return false;
    if (c.hasStateJunk && it.junk === true) return true;
    if (c.hasSale && forSale(it)) return true;
    if (!c.hasOtherTags) return false;
    const extra = lootRules && tools ? lootRules.tagsOf(it, tools) : null;
    if (extra) {
      for (let i = 0; i < extra.length; i++) {
        if (c.tagSet.has(extra[i])) return true;
      }
    }
    return false;
  }

  // THE SURROGATE STACK: the pieces of one kind that differ in nothing a player could tell - the Mushrooms, the Holy
  // Daggers - drawn as one cell with their count. The records stay apart: every act takes the one the cell shows.
  // What is no state: the record's id, its count, the receiver's marks and its clocks.
  const NO_STATE = new Set(['uid', 'stackCount', 'acquired', 'untaken', 'timeForItemToDisappear', 'stockedDate',
    'timeHealthLeechLastUsed', 'timeEffectsLastRerolled', 'equipSlot']);
  function stackKey(it) {
    if (!it || typeof it !== 'object' || it.questItem) return null;
    const rawKeys = Object.keys(it);
    const keys = [];
    for (let i = 0; i < rawKeys.length; i++) {
      const k = rawKeys[i];
      if (k.charCodeAt(0) !== 95 && !NO_STATE.has(k)) keys.push(k);
    }
    keys.sort();
    let out = '';
    try {
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const v = it[k];
        const t = typeof v;
        let enc;
        if (v == null) enc = 'u';
        else if (t === 'string') enc = `s${v.length}:${v}`;
        else if (t === 'number') enc = Number.isFinite(v) ? `n${v === 0 ? 0 : v};` : 'u';
        else if (t === 'boolean') enc = v ? 'T' : 'F';
        else if (t === 'object' || t === 'function') {
          const js = JSON.stringify(v);
          if (js === undefined) enc = 'u';
          else enc = `o${js.length}:${js}`;
        } else {
          return null;
        }
        out += `${k.length}:${k}=${enc}`;
      }
      return out;
    } catch {
      return null;
    }
  }
  /** The page's rows as cells: [{ item, members }] in the list's order, each cell at its first record. */
  function cells(items, page) {
    const list = Array.isArray(items) ? items : [];
    if (!STACKED.has(page)) return list.map(item => ({ item, members: [item] }));
    const out = [], byKey = new Map();
    for (const item of list) {
      const key = stackKey(item);
      const cell = key == null ? null : byKey.get(key);
      if (cell) { cell.members.push(item); continue; }
      const made = { item, members: [item] };
      out.push(made);
      if (key != null) byKey.set(key, made);
    }
    return out;
  }
  const count = it => (Number.isInteger(it?.stackCount) && it.stackCount > 1 ? it.stackCount : 1);

  const api = {
    PAGES, STACKED, VIEWS, CHARCOLS, cleanCharcol, SORT_MODES, cleanSortMode, SALE_TAG, DEFAULT_JUNK, MAX_TAGS, MAX_ITEMS, cleanSettings, cleanState, cleanJunk, pages, basePage,
    isNote, isIngredient, forSale, junkTags, isJunk, typeKey, stackKey, cells, count
  };
  if (node) module.exports = api;
  else root.__dfoPackRules = api;
})(globalThis);
