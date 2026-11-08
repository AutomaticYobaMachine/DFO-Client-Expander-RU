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
  const STACKED = Object.freeze(new Set(['misc', 'ingredients', 'junk']));
  const VIEWS = Object.freeze(['rows', 'grid']);
  // The Junk page's own tags, beside the loot filter's catalogue (page/dfo_loot_rules.js tagsOf).
  const SALE_TAG = 'use:sale';
  const DEFAULT_JUNK = Object.freeze([SALE_TAG, 'state:junk']);
  const MAX_TAGS = 4096, MAX_ITEMS = 1024;
  const uniq = (xs, max) => [...new Set((Array.isArray(xs) ? xs : []).filter(x => typeof x === 'string' && x.length > 0 && x.length <= 1024))].slice(0, max);
  const cleanJunk = j => (j && typeof j === 'object' && !Array.isArray(j)
    ? { tags: uniq(j.tags, MAX_TAGS), items: uniq(j.items, MAX_ITEMS) }
    : { tags: [...DEFAULT_JUNK], items: [] });
  const cleanSettings = s => ({
    v: 1, view: VIEWS.includes(s?.view) ? s.view : 'rows', autoSort: s?.autoSort !== false, junk: cleanJunk(s?.junk),
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
    return PAGES.includes(page) ? page : 'misc';
  }
  /** The tags the Junk rule reads: the loot filter's (when its tools stand) and the Junk page's own. */
  function junkTags(it, tools, lootRules) {
    const out = lootRules && tools ? lootRules.tagsOf(it, tools) : [];
    if (forSale(it)) out.push(SALE_TAG);
    if (it.junk === true && !out.includes('state:junk')) out.push('state:junk');
    return out;
  }
  const typeKey = it => `type:${it?.group ?? ''}:${it?.templateIndex ?? -1}`;
  /** Whether the player's rule calls the piece junk: ANY ticked tag, or the piece's kind. A quest's piece never is. */
  function isJunk(it, junk, tools, lootRules) {
    if (!it || it.questItem) return false;
    const j = junk ?? { tags: DEFAULT_JUNK, items: [] };
    if (j.items.length && (j.items.includes(typeKey(it)) || j.items.includes(`type:*:${it.templateIndex}`) || (lootRules && j.items.includes(lootRules.variantKey(it))))) return true;
    if (!j.tags.length) return false;
    const tags = new Set(junkTags(it, tools, lootRules));
    return j.tags.some(t => tags.has(t));
  }

  // THE SURROGATE STACK: the pieces of one kind that differ in nothing a player could tell - the Mushrooms, the Holy
  // Daggers - drawn as one cell with their count. The records stay apart: every act takes the one the cell shows.
  // What is no state: the record's id, its count, the receiver's marks and its clocks.
  const NO_STATE = new Set(['uid', 'stackCount', 'acquired', 'untaken', 'timeForItemToDisappear', 'stockedDate',
    'timeHealthLeechLastUsed', 'timeEffectsLastRerolled', 'equipSlot']);
  function stackKey(it) {
    if (!it || typeof it !== 'object' || it.questItem) return null;
    const keys = Object.keys(it).filter(k => !NO_STATE.has(k) && k[0] !== '_').sort();
    try { return JSON.stringify(keys.map(k => [k, it[k]])); } catch { return null; }
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

  const api = { PAGES, STACKED, VIEWS, SALE_TAG, DEFAULT_JUNK, MAX_TAGS, MAX_ITEMS, cleanSettings, cleanState, cleanJunk, pages, basePage,
    isNote, isIngredient, forSale, junkTags, isJunk, typeKey, stackKey, cells, count };
  if (node) module.exports = api;
  else root.__dfoPackRules = api;
})(globalThis);
