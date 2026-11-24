// CONTAINER WINDOWS (.loot-win: container, storage, wagon, materials bag, ground, reward, fate).
// Strictly scoped to container windows & container stack-transfer hooks — NEVER styles or alters .pack-win / .pack-dock.
(function (root) {
  'use strict';

  const isNode = typeof module === 'object' && module.exports;
  const Rules = isNode ? require('./dfo_pack_rules.js') : root.__dfoPackRules;
  const doc = root.document;

  const STYLE_ID = 'dfo-container-style';
  const ROOT_ATTR = 'dfoContainer';
  const STANDARD_KINDS = Object.freeze(new Set(['container', 'storage', 'wagon', 'bag', 'ground']));
  const SORT_MODES = Object.freeze(['default', 'rarity', 'name', 'weight', 'value']);
  const RARITY_RANKS = Object.freeze(['common', 'magic', 'rare', 'legendary', 'aetheric', 'artifact', 'gilded']);
  const RARITY_RANK_INDEX = new Map(RARITY_RANKS.map((r, i) => [r, i]));
  const MATERIALS_FILTER = Object.freeze([
    'Leather', 'Chain', 'Iron', 'Steel', 'Silver', 'Elven',
    'Dwarven', 'Mithril', 'Adamantium', 'Orcish', 'Ebony', 'Daedric',
  ]);
  const MATERIALS_SET = new Set(MATERIALS_FILTER);
  const INVENTORY_PAGES = (Rules && Array.isArray(Rules.PAGES) && Rules.PAGES.length)
    ? Rules.PAGES
    : Object.freeze(['weapons', 'armor', 'clothing', 'potions', 'ingredients', 'books', 'valuables', 'misc', 'junk']);
  const STORE_CATEGORIES = Object.freeze(['all', ...INVENTORY_PAGES]);
  const STORE_CATEGORIES_SET = new Set(STORE_CATEGORIES);

  const T = (key, params) => (root.__dfoUi ? root.__dfoUi.t(key, params) : key);
  const currentLocale = () => (root.__dfoUi ? (root.__dfoUi.locale === 'ru' ? 'ru' : 'en') : ((root.__DFO_MOD_CFG__?.ru?.on === true || doc?.documentElement?.lang === 'ru') ? 'ru' : 'en'));
  const COLLATORS = {
    ru: typeof Intl !== 'undefined' && Intl.Collator ? new Intl.Collator('ru', { sensitivity: 'base', numeric: true }) : null,
    en: typeof Intl !== 'undefined' && Intl.Collator ? new Intl.Collator('en', { sensitivity: 'base', numeric: true }) : null,
  };

  /**
   * Maps each string in `values` to its monotonic collator rank using O(U log U)
   * unique comparisons instead of O(N log N) ICU calls inside `.sort()`.
   */
  function buildCollatorRanks(values, col) {
    const uniq = [];
    const seen = new Set();
    for (let i = 0; i < values.length; i++) {
      const s = values[i];
      if (!seen.has(s)) { seen.add(s); uniq.push(s); }
    }
    const cmp = col ? (a, b) => col.compare(a, b) : (a, b) => a.localeCompare(b);
    uniq.sort(cmp);
    const rankMap = new Map();
    if (uniq.length) {
      let r = 0;
      rankMap.set(uniq[0], 0);
      for (let i = 1; i < uniq.length; i++) {
        if (cmp(uniq[i - 1], uniq[i]) !== 0) r++;
        rankMap.set(uniq[i], r);
      }
    }
    const out = new Int32Array(values.length);
    for (let i = 0; i < values.length; i++) out[i] = rankMap.get(values[i]) ?? 0;
    return out;
  }

  // Translation cache for live game strings (card effects/materials/slots) in pure-JS search indexer
  const MAX_TR_CACHE = 16384;
  const trCache = new Map();
  function trGame(str) {
    if (str == null) return '';
    const s = String(str);
    if (!s || currentLocale() !== 'ru') return s;
    const fn = root.__translate;
    if (typeof fn !== 'function') return s;
    const hit = trCache.get(s);
    if (hit !== undefined) return hit;
    let out = s;
    try { out = fn(s) || s; } catch { out = s; }
    if (trCache.size >= MAX_TR_CACHE) trCache.clear();
    trCache.set(s, out);
    return out;
  }

  function normSearchText(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/\u0451/g, String.fromCharCode(0x435))
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseQueryTokens(q) {
    const n = normSearchText(q);
    return n ? n.split(' ').filter(Boolean) : [];
  }

  const CARRY_COLOR_STOPS = [
    [0, 0x9c, 0xf0, 0xa6],
    [26, 0xc8, 0xe6, 0x6e],
    [54, 0xf5, 0xd4, 0x51],
    [78, 0xf5, 0x8a, 0x2e],
    [100, 0xdc, 0x26, 0x26],
  ];
  function carryFillColor(pct) {
    const p = Math.min(100, Math.max(0, Number.isFinite(pct) ? pct : 0));
    for (let i = 1; i < CARRY_COLOR_STOPS.length; i++) {
      const [p0, r0, g0, b0] = CARRY_COLOR_STOPS[i - 1];
      const [p1, r1, g1, b1] = CARRY_COLOR_STOPS[i];
      if (p <= p1 || i === CARRY_COLOR_STOPS.length - 1) {
        const t = p1 > p0 ? (p - p0) / (p1 - p0) : 0;
        return `rgb(${Math.round(r0 + (r1 - r0) * t)}, ${Math.round(g0 + (g1 - g0) * t)}, ${Math.round(b0 + (b1 - b0) * t)})`;
      }
    }
    return 'rgb(156, 240, 166)';
  }

  // Canonical 25x25 brass pixel border-image from dfo_pack.js ([L-01])
  const FRAME_SVG = "data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20width%3D'25'%20height%3D'25'%20shape-rendering%3D'crispEdges'%3E%3Crect%20x%3D'0'%20y%3D'0'%20width%3D'25'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'0'%20y%3D'1'%20width%3D'1'%20height%3D'24'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'1'%20y%3D'1'%20width%3D'9'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'10'%20y%3D'1'%20width%3D'1'%20height%3D'5'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'11'%20y%3D'1'%20width%3D'3'%20height%3D'1'%20fill%3D'%23c2b79a'%2F%3E%3Crect%20x%3D'14'%20y%3D'1'%20width%3D'1'%20height%3D'5'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'15'%20y%3D'1'%20width%3D'9'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'24'%20y%3D'1'%20width%3D'1'%20height%3D'24'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'1'%20y%3D'2'%20width%3D'1'%20height%3D'8'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'2'%20y%3D'2'%20width%3D'7'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'9'%20y%3D'2'%20width%3D'1'%20height%3D'4'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'11'%20y%3D'2'%20width%3D'3'%20height%3D'1'%20fill%3D'%239a9079'%2F%3E%3Crect%20x%3D'15'%20y%3D'2'%20width%3D'1'%20height%3D'4'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'16'%20y%3D'2'%20width%3D'7'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'23'%20y%3D'2'%20width%3D'1'%20height%3D'8'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'11'%20y%3D'3'%20width%3D'3'%20height%3D'1'%20fill%3D'%237a7260'%2F%3E%3Crect%20x%3D'2'%20y%3D'4'%20width%3D'2'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'4'%20y%3D'4'%20width%3D'3'%20height%3D'1'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'7'%20y%3D'4'%20width%3D'2'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'11'%20y%3D'4'%20width%3D'3'%20height%3D'1'%20fill%3D'%235a5446'%2F%3E%3Crect%20x%3D'16'%20y%3D'4'%20width%3D'2'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'18'%20y%3D'4'%20width%3D'3'%20height%3D'1'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'21'%20y%3D'4'%20width%3D'2'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'4'%20y%3D'5'%20width%3D'1'%20height%3D'2'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'5'%20y%3D'5'%20width%3D'1'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'6'%20y%3D'5'%20width%3D'1'%20height%3D'2'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'11'%20y%3D'5'%20width%3D'3'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'5'%20width%3D'1'%20height%3D'2'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'19'%20y%3D'5'%20width%3D'1'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'20'%20y%3D'5'%20width%3D'1'%20height%3D'2'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'5'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'7'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'8'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'9'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'10'%20y%3D'6'%20width%3D'5'%20height%3D'1'%20fill%3D'%2316140f'%2F%3E%3Crect%20x%3D'15'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'16'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'17'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'19'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'4'%20y%3D'7'%20width%3D'3'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'7'%20y%3D'7'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'8'%20y%3D'7'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'9'%20y%3D'7'%20width%3D'7'%20height%3D'1'%20fill%3D'%230c0d10'%2F%3E%3Crect%20x%3D'16'%20y%3D'7'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'17'%20y%3D'7'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'18'%20y%3D'7'%20width%3D'3'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'4'%20y%3D'8'%20width%3D'2'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'6'%20y%3D'8'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'7'%20y%3D'8'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'17'%20y%3D'8'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'8'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'19'%20y%3D'8'%20width%3D'2'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'2'%20y%3D'9'%20width%3D'4'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'6'%20y%3D'9'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'7'%20y%3D'9'%20width%3D'1'%20height%3D'7'%20fill%3D'%230c0d10'%2F%3E%3Crect%20x%3D'17'%20y%3D'9'%20width%3D'1'%20height%3D'7'%20fill%3D'%230c0d10'%2F%3E%3Crect%20x%3D'18'%20y%3D'9'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'19'%20y%3D'9'%20width%3D'4'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'1'%20y%3D'10'%20width%3D'5'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'6'%20y%3D'10'%20width%3D'1'%20height%3D'5'%20fill%3D'%2316140f'%2F%3E%3Crect%20x%3D'18'%20y%3D'10'%20width%3D'1'%20height%3D'5'%20fill%3D'%2316140f'%2F%3E%3Crect%20x%3D'19'%20y%3D'10'%20width%3D'5'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'1'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%23c2b79a'%2F%3E%3Crect%20x%3D'2'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%239a9079'%2F%3E%3Crect%20x%3D'3'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%237a7260'%2F%3E%3Crect%20x%3D'4'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%235a5446'%2F%3E%3Crect%20x%3D'5'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'19'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'20'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%235a5446'%2F%3E%3Crect%20x%3D'21'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%23443e31'%2F%3E%3Crect%20x%3D'22'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%233a352a'%2F%3E%3Crect%20x%3D'23'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%2325221b'%2F%3E%3Crect%20x%3D'1'%20y%3D'14'%20width%3D'5'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'19'%20y%3D'14'%20width%3D'5'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'1'%20y%3D'15'%20width%3D'1'%20height%3D'8'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'2'%20y%3D'15'%20width%3D'4'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'6'%20y%3D'15'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'15'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'19'%20y%3D'15'%20width%3D'4'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'23'%20y%3D'15'%20width%3D'1'%20height%3D'8'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'2'%20y%3D'16'%20width%3D'4'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'6'%20y%3D'16'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'7'%20y%3D'16'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'17'%20y%3D'16'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'16'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'19'%20y%3D'16'%20width%3D'4'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'2'%20y%3D'17'%20width%3D'5'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'7'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'8'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'9'%20y%3D'17'%20width%3D'7'%20height%3D'1'%20fill%3D'%231c1a15'%2F%3E%3Crect%20x%3D'16'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'17'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'18'%20y%3D'17'%20width%3D'5'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'2'%20y%3D'18'%20width%3D'2'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'4'%20y%3D'18'%20width%3D'1'%20height%3D'3'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'5'%20y%3D'18'%20width%3D'2'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'7'%20y%3D'18'%20width%3D'2'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'9'%20y%3D'18'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'10'%20y%3D'18'%20width%3D'5'%20height%3D'1'%20fill%3D'%235a5446'%2F%3E%3Crect%20x%3D'15'%20y%3D'18'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'16'%20y%3D'18'%20width%3D'2'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'18'%20y%3D'18'%20width%3D'2'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'20'%20y%3D'18'%20width%3D'1'%20height%3D'3'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'21'%20y%3D'18'%20width%3D'2'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'5'%20y%3D'19'%20width%3D'1'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'6'%20y%3D'19'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'9'%20y%3D'19'%20width%3D'1'%20height%3D'4'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'10'%20y%3D'19'%20width%3D'5'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'15'%20y%3D'19'%20width%3D'1'%20height%3D'4'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'18'%20y%3D'19'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'19'%20y%3D'19'%20width%3D'1'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'5'%20y%3D'20'%20width%3D'2'%20height%3D'1'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'7'%20y%3D'20'%20width%3D'2'%20height%3D'3'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'10'%20y%3D'20'%20width%3D'1'%20height%3D'5'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'11'%20y%3D'20'%20width%3D'3'%20height%3D'1'%20fill%3D'%234f4838'%2F%3E%3Crect%20x%3D'14'%20y%3D'20'%20width%3D'1'%20height%3D'5'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'16'%20y%3D'20'%20width%3D'2'%20height%3D'3'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'18'%20y%3D'20'%20width%3D'2'%20height%3D'1'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'4'%20y%3D'21'%20width%3D'3'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'11'%20y%3D'21'%20width%3D'3'%20height%3D'1'%20fill%3D'%23443e31'%2F%3E%3Crect%20x%3D'18'%20y%3D'21'%20width%3D'3'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'11'%20y%3D'22'%20width%3D'3'%20height%3D'1'%20fill%3D'%233a352a'%2F%3E%3Crect%20x%3D'2'%20y%3D'23'%20width%3D'8'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'11'%20y%3D'23'%20width%3D'3'%20height%3D'1'%20fill%3D'%2325221b'%2F%3E%3Crect%20x%3D'15'%20y%3D'23'%20width%3D'8'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'1'%20y%3D'24'%20width%3D'9'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'11'%20y%3D'24'%20width%3D'3'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'15'%20y%3D'24'%20width%3D'9'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3C%2Fsvg%3E";

  let svgUidSeq = 0;
  const UI_ICONS = {
    gold: {
      defs: [
        { tag: 'linearGradient', id: 'rim', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#fff6bd'], ['38%', '#eab308'], ['78%', '#a16207'], ['100%', '#5c3605']] },
        { tag: 'radialGradient', id: 'face', cx: '34%', cy: '30%', r: '68%', stops: [['0%', '#fef9c3'], ['42%', '#f5c438'], ['85%', '#b87914'], ['100%', '#7c4b08']] },
      ],
      shapes: [
        { tag: 'circle', cx: 12, cy: 12, r: 9.8, fill: '@rim', stroke: '#0a0704', 'stroke-width': 1.15 },
        { tag: 'circle', cx: 12, cy: 12, r: 7.7, fill: '@face', stroke: '#78490a', 'stroke-width': 0.75 },
        { tag: 'circle', cx: 12, cy: 12, r: 6.2, fill: 'none', stroke: '#fef08a', 'stroke-width': 0.65, 'stroke-dasharray': '1.6 1.2', opacity: 0.85 },
        { d: 'M7.8 14.3L8.4 9.8L10.3 11.4L12 8.4L13.7 11.4L15.6 9.8L16.2 14.3Z', fill: '#6b3e06', stroke: '#fef08a', 'stroke-width': 0.55, 'stroke-linejoin': 'round' },
        { d: 'M8.1 15.2H15.9', fill: 'none', stroke: '#6b3e06', 'stroke-width': 1.15, 'stroke-linecap': 'round' },
        { tag: 'ellipse', cx: 8.6, cy: 7.2, rx: 2.1, ry: 0.9, transform: 'rotate(-35 8.6 7.2)', fill: '#ffffff', opacity: 0.62 },
      ],
    },
    weight: {
      defs: [
        { tag: 'linearGradient', id: 'body', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#b48a46'], ['45%', '#6d5024'], ['100%', '#2b1f0d']] },
        { tag: 'linearGradient', id: 'ring', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#fef08a'], ['55%', '#c9963b'], ['100%', '#664615']] },
      ],
      shapes: [
        { d: 'M8.8 7.5V5.6C8.8 3.7 10.2 2.4 12 2.4C13.8 2.4 15.2 3.7 15.2 5.6V7.5', fill: 'none', stroke: '#090806', 'stroke-width': 3.4, 'stroke-linecap': 'round' },
        { d: 'M8.8 7.5V5.6C8.8 3.7 10.2 2.4 12 2.4C13.8 2.4 15.2 3.7 15.2 5.6V7.5', fill: 'none', stroke: '@ring', 'stroke-width': 1.85, 'stroke-linecap': 'round' },
        { d: 'M6.9 7.8H17.1L19.6 19.6C19.8 20.6 19 21.5 18 21.5H6C5 21.5 4.2 20.6 4.4 19.6Z', fill: '@body', stroke: '#090806', 'stroke-width': 1.15, 'stroke-linejoin': 'round' },
        { d: 'M8.4 9.5H15.6L17.2 19.6H6.8Z', fill: '#8c6730', 'fill-opacity': 0.45, stroke: '#e4c175', 'stroke-width': 0.75, 'stroke-linejoin': 'round' },
        { d: 'M8.8 11.4L8.1 17.8', fill: 'none', stroke: '#fef3c7', 'stroke-width': 1.1, 'stroke-linecap': 'round', opacity: 0.78 },
        { d: 'M10.4 14.5H13.6', fill: 'none', stroke: '#fde68a', 'stroke-width': 1.2, 'stroke-linecap': 'round' },
      ],
    },
    search: {
      defs: [
        { tag: 'linearGradient', id: 'br', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#fef08a'], ['50%', '#c08a3e'], ['100%', '#5c3b10']] },
        { tag: 'radialGradient', id: 'gl', cx: '35%', cy: '30%', r: '65%', stops: [['0%', '#e0f2fe', '0.75'], ['65%', '#38bdf8', '0.25'], ['100%', '#0f172a', '0.85']] },
      ],
      shapes: [
        { d: 'M15.4 15.4L20.8 20.8', fill: 'none', stroke: '#0b0805', 'stroke-width': 4.0, 'stroke-linecap': 'round' },
        { d: 'M15.4 15.4L20.8 20.8', fill: 'none', stroke: '@br', 'stroke-width': 2.4, 'stroke-linecap': 'round' },
        { tag: 'circle', cx: 10.4, cy: 10.4, r: 7.4, fill: '@br', stroke: '#0b0805', 'stroke-width': 1.1 },
        { tag: 'circle', cx: 10.4, cy: 10.4, r: 5.4, fill: '@gl', stroke: '#5c3b10', 'stroke-width': 0.7 },
        { d: 'M7.5 8.1C8.3 6.9 9.7 6.3 11 6.5', fill: 'none', stroke: '#ffffff', 'stroke-width': 1.1, 'stroke-linecap': 'round', opacity: 0.85 },
      ],
    },
    bag: {
      defs: [
        { tag: 'linearGradient', id: 'sack', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#b98448'], ['48%', '#7c5024'], ['100%', '#3b220c']] },
        { tag: 'linearGradient', id: 'cord', x1: '0', y1: '0', x2: '1', y2: '0', stops: [['0%', '#fef08a'], ['50%', '#d49b35'], ['100%', '#8a5a14']] },
      ],
      shapes: [
        { d: 'M8.1 3.1L10.3 4.4L12 3L13.7 4.4L15.9 3.1L14.4 7.8L18.4 10.9C19.6 11.9 20.1 13.4 19.9 15.1L19.4 18.6C19.1 20.3 17.7 21.5 16 21.5H8C6.3 21.5 4.9 20.3 4.6 18.6L4.1 15.1C3.9 13.4 4.4 11.9 5.6 10.9L9.6 7.8Z', fill: '@sack', stroke: '#0b0704', 'stroke-width': 1.15, 'stroke-linejoin': 'round' },
        { d: 'M7.6 12.6C6.9 14.4 7.1 16.9 7.8 18.8', fill: 'none', stroke: '#e4bc82', 'stroke-width': 0.95, 'stroke-linecap': 'round', opacity: 0.55 },
        { d: 'M15.8 13C16.4 14.8 16.3 17 15.7 18.8', fill: 'none', stroke: '#3b220c', 'stroke-width': 1.0, 'stroke-linecap': 'round', opacity: 0.7 },
        { d: 'M8.4 7.9H15.6', fill: 'none', stroke: '@cord', 'stroke-width': 2.0, 'stroke-linecap': 'round' },
        { d: 'M14.3 8.2L16.8 10.6', fill: 'none', stroke: '#fde68a', 'stroke-width': 1.0, 'stroke-linecap': 'round' },
        { tag: 'circle', cx: 12, cy: 14.8, r: 1.5, fill: '#d49b35', stroke: '#472808', 'stroke-width': 0.65 },
      ],
    },
    wagon: {
      defs: [
        { tag: 'linearGradient', id: 'canopy', x1: '0', y1: '0', x2: '0.3', y2: '1', stops: [['0%', '#f6e7c1'], ['52%', '#c8a870'], ['100%', '#785a2c']] },
        { tag: 'linearGradient', id: 'wood', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#b87b3e'], ['52%', '#78481d'], ['100%', '#3d210a']] },
        { tag: 'linearGradient', id: 'rim', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#fef08a'], ['50%', '#c9963b'], ['100%', '#5c3b10']] },
      ],
      shapes: [
        { d: 'M3.4 10.6V6.8C3.4 4.3 5.5 2.6 8.4 2.6H14.6C17.5 2.6 19.6 4.3 19.6 6.8V10.6Z', fill: '@canopy', stroke: '#0b0704', 'stroke-width': 1.1, 'stroke-linejoin': 'round' },
        { d: 'M7.4 3.1C6.6 5.3 6.5 8 6.8 10.4M11.5 2.7V10.4M15.6 3.1C16.4 5.3 16.5 8 16.2 10.4', fill: 'none', stroke: '#6e5023', 'stroke-width': 0.85, opacity: 0.75 },
        { d: 'M2.2 10.4H20.4L19.1 15.6H3.5Z', fill: '@wood', stroke: '#0b0704', 'stroke-width': 1.15, 'stroke-linejoin': 'round' },
        { d: 'M3.2 12.8H19.4', fill: 'none', stroke: '#e4c175', 'stroke-width': 0.85, opacity: 0.8 },
        { d: 'M19.2 14.2H22.2L21.4 12.4', fill: 'none', stroke: '#d49b35', 'stroke-width': 1.35, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
        { tag: 'circle', cx: 7.2, cy: 17.6, r: 3.7, fill: '#26170b', stroke: '#0b0704', 'stroke-width': 1.15 },
        { tag: 'circle', cx: 7.2, cy: 17.6, r: 2.7, fill: 'none', stroke: '@rim', 'stroke-width': 1.2 },
        { d: 'M7.2 14.9V20.3M4.5 17.6H9.9M5.3 15.7L9.1 19.5M9.1 15.7L5.3 19.5', fill: 'none', stroke: '#c9963b', 'stroke-width': 0.75 },
        { tag: 'circle', cx: 7.2, cy: 17.6, r: 1.05, fill: '#fef08a', stroke: '#3b220c', 'stroke-width': 0.5 },
        { tag: 'circle', cx: 15.8, cy: 17.6, r: 3.7, fill: '#26170b', stroke: '#0b0704', 'stroke-width': 1.15 },
        { tag: 'circle', cx: 15.8, cy: 17.6, r: 2.7, fill: 'none', stroke: '@rim', 'stroke-width': 1.2 },
        { d: 'M15.8 14.9V20.3M13.1 17.6H18.5M13.9 15.7L17.7 19.5M17.7 15.7L13.9 19.5', fill: 'none', stroke: '#c9963b', 'stroke-width': 0.75 },
        { tag: 'circle', cx: 15.8, cy: 17.6, r: 1.05, fill: '#fef08a', stroke: '#3b220c', 'stroke-width': 0.5 },
      ],
    },
    caret: {
      defs: [
        { tag: 'linearGradient', id: 'c', x1: '0', y1: '0', x2: '0', y2: '1', stops: [['0%', '#fef08a'], ['55%', '#d49b35'], ['100%', '#78490a']] },
      ],
      shapes: [
        { d: 'M5.5 8.5L12 15.2L18.5 8.5', fill: 'none', stroke: '#080604', 'stroke-width': 3.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
        { d: 'M5.5 8.5L12 15.2L18.5 8.5', fill: 'none', stroke: '@c', 'stroke-width': 2.0, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
      ],
    },
    mercy: {
      defs: [
        { tag: 'radialGradient', id: 'aura', cx: '50%', cy: '45%', r: '58%', stops: [['0%', '#ecfdf5'], ['42%', '#6ee7b7'], ['80%', '#10b981'], ['100%', '#064e3b']] },
        { tag: 'linearGradient', id: 'wing', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#f0fdf4'], ['52%', '#6ee7b7'], ['100%', '#047857']] },
      ],
      shapes: [
        { tag: 'circle', cx: 12, cy: 12, r: 9.2, fill: '#071a14', stroke: '#34d399', 'stroke-width': 1.2 },
        { d: 'M12 3.2L14.2 9.4L20.6 12L14.2 14.6L12 20.8L9.8 14.6L3.4 12L9.8 9.4Z', fill: '@aura', stroke: '#042f2e', 'stroke-width': 0.95, 'stroke-linejoin': 'round' },
        { d: 'M6.4 15.8C8.2 13.6 10.1 12.6 12 12.6C13.9 12.6 15.8 13.6 17.6 15.8', fill: 'none', stroke: '@wing', 'stroke-width': 1.35, 'stroke-linecap': 'round' },
        { tag: 'circle', cx: 12, cy: 12, r: 2.1, fill: '#ffffff', stroke: '#059669', 'stroke-width': 0.7 },
      ],
    },
    trophy: {
      defs: [
        { tag: 'linearGradient', id: 'cup', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#fff7cc'], ['45%', '#eab308'], ['100%', '#78350f']] },
      ],
      shapes: [
        { d: 'M7 3.5H17V8.5C17 11.6 14.8 13.8 12 13.8C9.2 13.8 7 11.6 7 8.5Z', fill: '@cup', stroke: '#0b0804', 'stroke-width': 1.15, 'stroke-linejoin': 'round' },
        { d: 'M7 5.2H4.2C4.2 8.2 5.4 10 7.3 10.4M17 5.2H19.8C19.8 8.2 18.6 10 16.7 10.4', fill: 'none', stroke: '@cup', 'stroke-width': 1.35, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
        { d: 'M12 13.8V17.8M8.2 20.2H15.8L14.6 17.8H9.4Z', fill: '@cup', stroke: '#0b0804', 'stroke-width': 1.1, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
      ],
    },
  };

  // [M-03] Canonical 24x24 Rarity Emblem Icons & Palette
  const RARITY_ICONS = {
    common: {
      defs: [{ tag: 'linearGradient', id: 'r', x1: 0, y1: 0, x2: 1, y2: 1, stops: [['0%', '#c8c1b0'], ['50%', '#827a68'], ['100%', '#3b372e']] }],
      shapes: [{ d: 'M12 2.4L20.4 12L12 21.6L3.6 12Z', fill: '@r', stroke: '#09090b', 'stroke-width': 1.15, 'stroke-linejoin': 'round' }, { d: 'M12 6.8L16.4 12L12 17.2L7.6 12Z', fill: '#635c4e', stroke: '#c8c1b0', 'stroke-width': 0.7 }],
    },
    magic: {
      defs: [{ tag: 'radialGradient', id: 'g', cx: '38%', cy: '34%', r: '66%', stops: [['0%', '#eff6ff'], ['40%', '#60a5fa'], ['80%', '#2563eb'], ['100%', '#172554']] }],
      shapes: [{ d: 'M12 1.8L18.8 7.5V16.5L12 22.2L5.2 16.5V7.5Z', fill: '@g', stroke: '#070b14', 'stroke-width': 1.15, 'stroke-linejoin': 'round' }, { d: 'M12 7.5L14.8 12L12 16.5L9.2 12Z', fill: '#eff6ff', stroke: '#60a5fa', 'stroke-width': 0.6 }],
    },
    rare: {
      defs: [{ tag: 'linearGradient', id: 'g', x1: 0, y1: 0, x2: 1, y2: 1, stops: [['0%', '#fef9c3'], ['45%', '#e4c34f'], ['100%', '#4d2f06']] }],
      shapes: [{ d: 'M12 1.7L20.5 6.8V17.2L12 22.3L3.5 17.2V6.8Z', fill: '@g', stroke: '#0c0804', 'stroke-width': 1.15, 'stroke-linejoin': 'round' }, { d: 'M12 5.4L13.5 9.4L17.7 8.7L15 12L17.7 15.3L13.5 14.6L12 18.6L10.5 14.6L6.3 15.3L9 12L6.3 8.7L10.5 9.4Z', fill: '#fef3c7', stroke: '#78350f', 'stroke-width': 0.6 }],
    },
    legendary: {
      defs: [{ tag: 'linearGradient', id: 'f', x1: 0, y1: 0, x2: 0.3, y2: 1, stops: [['0%', '#fef08a'], ['40%', '#fb923c'], ['100%', '#5c1708']] }],
      shapes: [{ d: 'M12 1.7L15.1 8.5L21 5.6L18.9 15.8L12 22.1L5.1 15.8L3 5.6L8.9 8.5Z', fill: '@f', stroke: '#0e0603', 'stroke-width': 1.15, 'stroke-linejoin': 'round' }, { d: 'M12 9.4L15.1 13.6L12 17.8L8.9 13.6Z', fill: '#fffbeb', stroke: '#f97316', 'stroke-width': 0.7 }],
    },
    aetheric: {
      defs: [{ tag: 'radialGradient', id: 's', cx: '50%', cy: '50%', r: '54%', stops: [['0%', '#ffffff'], ['45%', '#e0f2fe'], ['82%', '#7dd3fc'], ['100%', '#0284c7']] }],
      shapes: [{ tag: 'circle', cx: 12, cy: 12, r: 8.6, fill: '#0a1c2e', stroke: '#bae6fd', 'stroke-width': 1.25 }, { d: 'M12 1.8L14.2 9.8L22.2 12L14.2 14.2L12 22.2L9.8 14.2L1.8 12L9.8 9.8Z', fill: '@s', stroke: '#0c3556', 'stroke-width': 0.9 }],
    },
    artifact: {
      defs: [{ tag: 'linearGradient', id: 'a', x1: 0, y1: 0, x2: 1, y2: 1, stops: [['0%', '#f3e8ff'], ['42%', '#b57bee'], ['100%', '#2e1065']] }],
      shapes: [{ d: 'M12 2L15.6 8.4L22 12L15.6 15.6L12 22L8.4 15.6L2 12L8.4 8.4Z', fill: '@a', stroke: '#0b0612', 'stroke-width': 1.1, 'stroke-linejoin': 'round' }, { d: 'M12 8.4L15.1 12L12 15.6L8.9 12Z', fill: '#2e1065', stroke: '#f3e8ff', 'stroke-width': 0.75 }],
    },
    gilded: {
      defs: [{ tag: 'linearGradient', id: 'g', x1: 0, y1: 0, x2: 1, y2: 1, stops: [['0%', '#fff7cc'], ['45%', '#f5d451'], ['100%', '#5c3406']] }, { tag: 'radialGradient', id: 'c', cx: '45%', cy: '38%', r: '62%', stops: [['0%', '#ff8590'], ['45%', '#ff3b4a'], ['100%', '#45060d']] }],
      shapes: [{ d: 'M4.8 11.4H19.2L17.4 17.8L12 22.1L6.6 17.8Z', fill: '@c', stroke: '#0d0606', 'stroke-width': 1.1 }, { d: 'M3 6.2L7.2 9.4L12 3.2L16.8 9.4L21 6.2L19.2 12.6H4.8Z', fill: '@g', stroke: '#0d0606', 'stroke-width': 1.1, 'stroke-linejoin': 'round' }],
    },
  };
  const RARITY_ACCENT_COLORS = {
    common: '#827a68',
    magic: '#6f9ee8',
    rare: '#e4c34f',
    legendary: '#e07a2e',
    aetheric: '#bfe8ff',
    artifact: '#b57bee',
    gilded: '#ff3b4a',
  };
  const MATERIAL_ACCENT_COLORS = {
    Leather: '#b5804c',
    Chain: '#9aa4b2',
    Iron: '#858e99',
    Steel: '#cbd5e1',
    Silver: '#e2e8f0',
    Elven: '#f5d451',
    Dwarven: '#d99a44',
    Mithril: '#60a5fa',
    Adamantium: '#a78bfa',
    Orcish: '#65a36e',
    Ebony: '#64748b',
    Daedric: '#ef4444',
  };

  function elFn(tag, cls, text) {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  function svgIcon(spec, cls, size = 16) {
    const ns = 'http://www.w3.org/2000/svg';
    const mk = (tag) => (doc.createElementNS ? doc.createElementNS(ns, tag) : doc.createElement(tag));
    const svg = mk('svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('aria-hidden', 'true');
    if (cls) svg.setAttribute('class', cls);
    const prefix = `dfo-cl-${++svgUidSeq}-`;
    const resolve = (v) => (typeof v === 'string' && v.startsWith('@') ? `url(#${prefix}${v.slice(1)})` : String(v));
    if (spec?.defs?.length) {
      const defsEl = mk('defs');
      for (const g of spec.defs) {
        const grad = mk(g.tag || 'linearGradient');
        for (const [k, v] of Object.entries(g)) {
          if (k === 'tag' || k === 'stops') continue;
          grad.setAttribute(k, k === 'id' ? prefix + v : String(v));
        }
        for (const [offset, color, opacity] of g.stops || []) {
          const st = mk('stop');
          st.setAttribute('offset', offset);
          st.setAttribute('stop-color', color);
          if (opacity != null) st.setAttribute('stop-opacity', String(opacity));
          grad.append(st);
        }
        defsEl.append(grad);
      }
      svg.append(defsEl);
    }
    for (const p of spec?.shapes || []) {
      const node = mk(p.tag || 'path');
      for (const [k, v] of Object.entries(p)) if (k !== 'tag') node.setAttribute(k, resolve(v));
      svg.append(node);
    }
    return svg;
  }

  // Strictly scoped CSS for .loot-win and .dfo-loot-modal-* — NEVER touches .pack-win / .pack-dock
  const CSS = `
/* [F-03] Theme-Synced Depth Tokens (Slate default + 5 Plus themes — self-contained for standalone containers) */
:root {
  --dfo-bg-scrim: rgba(5, 7, 10, 0.72);
  --dfo-bg-window: rgba(12, 14, 18, 0.93);
  --dfo-bg-header: linear-gradient(180deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.015));
  --dfo-bg-win-head: linear-gradient(180deg, rgba(62, 56, 44, 0.38) 0%, rgba(24, 26, 32, 0.55) 56%, rgba(10, 12, 16, 0.72) 100%);
  --dfo-bg-footer: rgba(0, 0, 0, 0.22);
  --dfo-bg-panel: rgba(15, 17, 22, 0.92);
  --dfo-bg-panel-elevated: rgba(23, 27, 33, 0.96);
  --dfo-bg-well: rgba(8, 10, 13, 0.9);
  --dfo-bg-input: rgba(4, 5, 7, 0.78);
  --dfo-bg-button: #1c1f26;
  --dfo-bg-button-hover: #262a33;
  --dfo-bg-chip: rgba(12, 14, 18, 0.84);
  --dfo-bg-row: rgba(16, 19, 24, 0.88);
  --dfo-bg-row-hover: rgba(38, 42, 51, 0.92);
  --dfo-bg-row-selected: rgba(78, 127, 114, 0.24);
  --dfo-bg-dither-img: repeating-conic-gradient(rgba(255, 255, 255, 0.022) 0 25%, transparent 0 50%);
  --dfo-bg-dither-size: 4px 4px;
}
:root[data-plus-theme="stone"]  { --dfo-bg-window:#51514c; --dfo-bg-panel:#5a5a54; --dfo-bg-panel-elevated:#63635c; --dfo-bg-well:rgba(44,44,40,0.92); --dfo-bg-button:#4a4a45; --dfo-bg-button-hover:#5f5f58; --dfo-bg-chip:rgba(60,60,56,0.9); --dfo-bg-input:rgba(30,30,28,0.78); --dfo-bg-row:rgba(74,74,69,0.88); --dfo-bg-row-hover:rgba(95,95,88,0.94); }
:root[data-plus-theme="iron"]   { --dfo-bg-window:#232a33; --dfo-bg-panel:#28303a; --dfo-bg-panel-elevated:#2f3844; --dfo-bg-well:rgba(16,20,26,0.92); --dfo-bg-button:#2c3440; --dfo-bg-button-hover:#36404d; --dfo-bg-chip:rgba(28,34,42,0.9); --dfo-bg-input:rgba(8,10,14,0.78); --dfo-bg-row:rgba(34,41,50,0.88); --dfo-bg-row-hover:rgba(54,64,77,0.94); }
:root[data-plus-theme="ember"]  { --dfo-bg-window:#2a1510; --dfo-bg-panel:#301914; --dfo-bg-panel-elevated:#3a1f18; --dfo-bg-well:rgba(18,9,7,0.92); --dfo-bg-button:#3a1d16; --dfo-bg-button-hover:#4a261c; --dfo-bg-chip:rgba(40,20,15,0.9); --dfo-bg-input:rgba(14,6,4,0.78); --dfo-bg-row:rgba(38,19,15,0.88); --dfo-bg-row-hover:rgba(74,38,28,0.94); }
:root[data-plus-theme="forest"] { --dfo-bg-window:#15231a; --dfo-bg-panel:#1a2b20; --dfo-bg-panel-elevated:#203628; --dfo-bg-well:rgba(9,16,12,0.92); --dfo-bg-button:#1f3226; --dfo-bg-button-hover:#284030; --dfo-bg-chip:rgba(20,34,25,0.9); --dfo-bg-input:rgba(5,10,7,0.78); --dfo-bg-row:rgba(20,35,26,0.88); --dfo-bg-row-hover:rgba(40,64,48,0.94); }
:root[data-plus-theme="night"]  { --dfo-bg-window:#131a30; --dfo-bg-panel:#182038; --dfo-bg-panel-elevated:#1e2846; --dfo-bg-well:rgba(8,12,24,0.92); --dfo-bg-button:#1c2542; --dfo-bg-button-hover:#263052; --dfo-bg-chip:rgba(20,26,48,0.9); --dfo-bg-input:rgba(5,7,14,0.78); --dfo-bg-row:rgba(20,27,48,0.88); --dfo-bg-row-hover:rgba(38,48,82,0.94); }

/* 1. [L-01] Outer Window Frame + Non-Jumping 2-Column Container Geometry (overflow visible keeps solo .packtip unclipped) */
html[data-dfo-container] .pack-shell .loot-win {
  box-sizing: border-box;
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: visible;
  border: 2px solid #7d7460;
  border-image: url("${FRAME_SVG}") 12 / 12px / 6px stretch;
  background-color: var(--dfo-bg-window, rgba(12, 14, 18, 0.93));
  background-image: var(--dfo-bg-dither-img);
  background-size: var(--dfo-bg-dither-size, 4px 4px);
  box-shadow: 4px 4px 0 6px rgba(0, 0, 0, 0.42), 0 14px 36px rgba(0, 0, 0, 0.78);
  border-radius: 0;
  color: #e9e4d9;
  font-family: 'DFO Gabin', serif;
}
html[data-dfo-container] .pack-shell .loot-win > .px-corner {
  display: none !important;
}
html[data-dfo-container] .pack-shell .loot-win > .packtip {
  z-index: 25;
}
html[data-dfo-container] .pack-shell .loot-win > .packremote {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  flex: 1 1 0%;
  min-height: 0;
  padding: 0;
  gap: 0;
  background: transparent;
  border: 0;
  overflow: visible;
}
@media (min-width: 641px) {
  html[data-dfo-container] .pack-shell .loot-win:not(.fate):not([data-dfo-loot-kind="reward"]):not([data-dfo-loot-kind="fate"]) {
    box-sizing: border-box;
    width: min(680px, 94vw);
    height: min(700px, 86dvh);
    max-height: min(700px, 86dvh);
  }
  html[data-dfo-container] .pack-shell .loot-win:not(.fate):not([data-dfo-loot-kind="reward"]):not([data-dfo-loot-kind="fate"]) .remotelist {
    box-sizing: border-box;
    flex: 1 1 0%;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-auto-rows: max-content;
    align-content: start;
  }
  html[data-dfo-container] .pack-shell .loot-win:not(.fate):not([data-dfo-loot-kind="reward"]):not([data-dfo-loot-kind="fate"]) .remotelist > .packempty {
    grid-column: 1 / -1;
    padding: 34px 16px;
    text-align: center;
  }

  /* Paired with player inventory (.pack-shell.paired): keep vertical alignment & track live .pack-win height */
  html[data-dfo-container] .pack-shell.paired {
    align-items: center;
  }
  html[data-dfo-container] .pack-shell.paired .loot-win:not(.fate):not([data-dfo-loot-kind="reward"]):not([data-dfo-loot-kind="fate"]) {
    height: var(--dfo-paired-loot-h, min(700px, calc(100vh - 24px)));
    max-height: calc(100vh - 24px);
    align-self: center;
  }
}
@media (min-width: 641px) and (max-width: 1769px) {
  html[data-dfo-container] .pack-shell.paired .loot-win:not(.fate):not([data-dfo-loot-kind="reward"]):not([data-dfo-loot-kind="fate"]) {
    width: 340px;
  }
  html[data-dfo-container] .pack-shell.paired .loot-win:not(.fate):not([data-dfo-loot-kind="reward"]):not([data-dfo-loot-kind="fate"]) .remotelist {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-auto-rows: max-content;
    align-content: start;
  }
  html[data-dfo-container] .pack-shell.paired .loot-win:not(.fate):not([data-dfo-loot-kind="reward"]):not([data-dfo-loot-kind="fate"]) .dfo-loot-utilbar {
    flex-wrap: wrap;
  }
  html[data-dfo-container] .pack-shell.paired .loot-win:not(.fate):not([data-dfo-loot-kind="reward"]):not([data-dfo-loot-kind="fate"]) .dfo-loot-util-left {
    flex: 1 1 100%;
    flex-wrap: wrap;
  }
  html[data-dfo-container] .pack-shell.paired .loot-win:not(.fate):not([data-dfo-loot-kind="reward"]):not([data-dfo-loot-kind="fate"]) .dfo-loot-gold {
    flex: 0 0 auto;
  }
  html[data-dfo-container] .pack-shell.paired .loot-win:not(.fate):not([data-dfo-loot-kind="reward"]):not([data-dfo-loot-kind="fate"]) .dfo-loot-carry {
    flex: 1 1 0%;
    min-width: 150px;
    max-width: none;
  }
  html[data-dfo-container] .pack-shell.paired .loot-win:not(.fate):not([data-dfo-loot-kind="reward"]):not([data-dfo-loot-kind="fate"]) .storemenus {
    grid-auto-flow: row;
    grid-template-columns: 1fr;
  }
  html[data-dfo-container] .pack-shell.paired .loot-win:not(.fate):not([data-dfo-loot-kind="reward"]):not([data-dfo-loot-kind="fate"]) .dfo-loot-foot-row {
    grid-template-columns: 1fr 1fr;
    gap: 5px 6px;
  }
  html[data-dfo-container] .pack-shell.paired .loot-win:not(.fate):not([data-dfo-loot-kind="reward"]):not([data-dfo-loot-kind="fate"]) .dfo-loot-foot-meta {
    grid-column: 1 / -1;
    grid-row: 1;
  }
}
@media (max-width: 640px) {
  html[data-dfo-container] .pack-shell .loot-win:not(.fate):not([data-dfo-loot-kind="reward"]):not([data-dfo-loot-kind="fate"]) {
    height: min(560px, 78dvh);
    max-height: min(560px, 78dvh);
  }
  html[data-dfo-container] .pack-shell.paired .loot-win:not(.fate):not([data-dfo-loot-kind="reward"]):not([data-dfo-loot-kind="fate"]) {
    height: min(440px, 46dvh);
    max-height: 48dvh;
  }
  html[data-dfo-container] .loot-win:not(.fate):not([data-dfo-loot-kind="reward"]):not([data-dfo-loot-kind="fate"]) .remotelist {
    box-sizing: border-box;
    flex: 1 1 0%;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-auto-rows: max-content;
    align-content: start;
  }
  html[data-dfo-container] .pack-shell .loot-win:not(.fate):not([data-dfo-loot-kind="reward"]):not([data-dfo-loot-kind="fate"]) .remotelist > .packempty {
    grid-column: 1 / -1;
    padding: 28px 14px;
    text-align: center;
  }
  html[data-dfo-container] .loot-win:not(.fate):not([data-dfo-loot-kind="reward"]):not([data-dfo-loot-kind="fate"]) .dfo-loot-utilbar {
    flex-wrap: wrap;
  }
  html[data-dfo-container] .loot-win:not(.fate):not([data-dfo-loot-kind="reward"]):not([data-dfo-loot-kind="fate"]) .dfo-loot-util-left {
    flex: 1 1 100%;
    flex-wrap: wrap;
  }
  html[data-dfo-container] .loot-win:not(.fate):not([data-dfo-loot-kind="reward"]):not([data-dfo-loot-kind="fate"]) .dfo-loot-gold {
    flex: 0 0 auto;
  }
  html[data-dfo-container] .loot-win:not(.fate):not([data-dfo-loot-kind="reward"]):not([data-dfo-loot-kind="fate"]) .dfo-loot-carry {
    flex: 1 1 0%;
    min-width: 150px;
    max-width: none;
  }
  html[data-dfo-container] .loot-win:not(.fate):not([data-dfo-loot-kind="reward"]):not([data-dfo-loot-kind="fate"]) .storemenus {
    grid-auto-flow: row;
    grid-template-columns: 1fr;
  }
  html[data-dfo-container] .loot-win:not(.fate):not([data-dfo-loot-kind="reward"]):not([data-dfo-loot-kind="fate"]) .dfo-loot-foot-row {
    grid-template-columns: 1fr 1fr;
    gap: 5px 6px;
  }
  html[data-dfo-container] .loot-win:not(.fate):not([data-dfo-loot-kind="reward"]):not([data-dfo-loot-kind="fate"]) .dfo-loot-foot-meta {
    grid-column: 1 / -1;
    grid-row: 1;
  }
}
@media (min-width: 1770px) {
  html[data-dfo-container] .pack-shell.paired .loot-win:not(.fate):not([data-dfo-loot-kind="reward"]):not([data-dfo-loot-kind="fate"]) {
    width: 680px;
  }
  html[data-dfo-container] .pack-shell.paired .loot-win:not(.fate):not([data-dfo-loot-kind="reward"]):not([data-dfo-loot-kind="fate"]) .remotelist {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-auto-rows: max-content;
    align-content: start;
  }
}

/* 2. [C-01] Ornate Double-Framed Corner-Bracket Buttons (scoped strictly to .loot-win and quantity modal) */
html[data-dfo-container] :is(.pack-shell .loot-win, .dfo-loot-modal-box) .dfo-ornate-btn {
  --dfo-c: #d4b16a;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 28px;
  min-width: 0;
  margin: 0;
  padding: 5px 12px;
  box-sizing: border-box;
  border: 1px solid #6e5c3e !important;
  border-top-color: #9e8355 !important;
  border-bottom-color: #3b301f !important;
  border-radius: 1px !important;
  background: linear-gradient(180deg, #272219 0%, #191510 55%, #120f0b 100%) !important;
  box-shadow:
    inset 0 1px 0 rgba(255, 224, 150, 0.14),
    inset 0 -1px 0 rgba(0, 0, 0, 0.72),
    0 1px 2px rgba(0, 0, 0, 0.55) !important;
  color: #f1e6c8 !important;
  font-family: 'DFO Gabin', serif !important;
  font-size: calc(12px) !important;
  font-weight: normal;
  letter-spacing: 0.03em;
  line-height: 1.15;
  text-transform: none;
  text-shadow: 0 1px 0 #000 !important;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  transition: filter 120ms ease, transform 80ms ease, border-color 120ms ease, color 120ms ease;
}
html[data-dfo-container] :is(.pack-shell .loot-win, .dfo-loot-modal-box) .dfo-ornate-btn::before {
  content: "";
  position: absolute;
  inset: 2px;
  border: 1px solid rgba(213, 178, 110, 0.24);
  pointer-events: none;
}
html[data-dfo-container] :is(.pack-shell .loot-win, .dfo-loot-modal-box) .dfo-ornate-btn::after {
  content: "";
  position: absolute;
  inset: 2px;
  pointer-events: none;
  background:
    linear-gradient(var(--dfo-c), var(--dfo-c)) top left / 5px 1px no-repeat,
    linear-gradient(var(--dfo-c), var(--dfo-c)) top left / 1px 5px no-repeat,
    linear-gradient(var(--dfo-c), var(--dfo-c)) top right / 5px 1px no-repeat,
    linear-gradient(var(--dfo-c), var(--dfo-c)) top right / 1px 5px no-repeat,
    linear-gradient(var(--dfo-c), var(--dfo-c)) bottom left / 5px 1px no-repeat,
    linear-gradient(var(--dfo-c), var(--dfo-c)) bottom left / 1px 5px no-repeat,
    linear-gradient(var(--dfo-c), var(--dfo-c)) bottom right / 5px 1px no-repeat,
    linear-gradient(var(--dfo-c), var(--dfo-c)) bottom right / 1px 5px no-repeat;
}
html[data-dfo-container] :is(.pack-shell .loot-win, .dfo-loot-modal-box) .dfo-ornate-btn:hover:not(:disabled) {
  filter: brightness(1.16) !important;
  border-color: #9e8355 !important;
  border-top-color: #d5b26e !important;
  color: #f6e7b0 !important;
}
html[data-dfo-container] :is(.pack-shell .loot-win, .dfo-loot-modal-box) .dfo-ornate-btn:active:not(:disabled) {
  transform: translateY(1px);
  filter: brightness(0.95);
}
html[data-dfo-container] :is(.pack-shell .loot-win, .dfo-loot-modal-box) .dfo-ornate-btn:disabled {
  opacity: 0.45;
  cursor: default;
  filter: grayscale(0.4);
}
html[data-dfo-container] :is(.pack-shell .loot-win, .dfo-loot-modal-box) .dfo-ornate-btn:is(.primary, .on) {
  --dfo-c: #fde68a !important;
  border-color: #a6823f !important;
  border-top-color: #e4c175 !important;
  border-bottom-color: #4f3b18 !important;
  background: linear-gradient(180deg, #4b391a 0%, #2f230e 56%, #1f1709 100%) !important;
  color: #fde68a !important;
}
html[data-dfo-container] :is(.pack-shell .loot-win, .dfo-loot-modal-box) .dfo-ornate-btn:is(.primary, .on)::before {
  border-color: rgba(253, 230, 138, 0.32);
}
html[data-dfo-container] :is(.pack-shell .loot-win, .dfo-loot-modal-box) .dfo-ornate-btn.silver {
  --dfo-c: #cbd5e1 !important;
  border-color: #64748b !important;
  border-top-color: #94a3b8 !important;
  border-bottom-color: #334155 !important;
  background: linear-gradient(180deg, #2a3340 0%, #1b222c 56%, #12171e 100%) !important;
  color: #e2e8f0 !important;
}
html[data-dfo-container] :is(.pack-shell .loot-win, .dfo-loot-modal-box) .dfo-ornate-btn.silver::before {
  border-color: rgba(203, 213, 225, 0.28);
}
html[data-dfo-container] :is(.pack-shell .loot-win, .dfo-loot-modal-box) .dfo-ornate-btn.danger {
  --dfo-c: #ff9f98 !important;
  border-color: #8f3730 !important;
  border-top-color: #c9564c !important;
  border-bottom-color: #3f1512 !important;
  background: linear-gradient(180deg, #4c1b18 0%, #2d110f 56%, #1c0a09 100%) !important;
  color: #fecaca !important;
}
html[data-dfo-container] :is(.pack-shell .loot-win, .dfo-loot-modal-box) .dfo-ornate-btn.danger::before {
  border-color: rgba(255, 159, 152, 0.26);
}
html[data-dfo-container] :is(.pack-shell .loot-win, .dfo-loot-modal-box) .dfo-ornate-btn.dfo-close-btn {
  --dfo-c: #f08a80 !important;
  border-color: #a1463e #4c1b18 #2d0e0c #782e28 !important;
  color: #fce0dc !important;
  background:
    repeating-linear-gradient(-45deg, rgba(176, 56, 48, 0.22) 0 4px, rgba(16, 7, 9, 0.34) 4px 8px),
    linear-gradient(180deg, #3d1618 0%, #250c0e 58%, #160709 100%) !important;
  box-shadow: 0 0 0 1px #050608, inset 0 0 0 1px rgba(240, 138, 128, 0.18), inset 0 1px 0 rgba(255, 204, 198, 0.16) !important;
}
html[data-dfo-container] :is(.pack-shell .loot-win, .dfo-loot-modal-box) .dfo-ornate-btn.dfo-close-btn::before {
  border-color: rgba(240, 138, 128, 0.22);
}
html[data-dfo-container] :is(.pack-shell .loot-win, .dfo-loot-modal-box) .dfo-ornate-btn.dfo-close-btn:hover:not(:disabled) {
  --dfo-c: #ffb0a7 !important;
  border-color: #c85a46 !important;
  color: #fff0ee !important;
  background:
    repeating-linear-gradient(-45deg, rgba(212, 78, 66, 0.28) 0 4px, rgba(22, 9, 11, 0.28) 4px 8px),
    linear-gradient(180deg, #521d20 0%, #341114 58%, #200a0c 100%) !important;
  box-shadow: 0 0 0 1px #050608, 0 0 10px rgba(200, 90, 70, 0.3), inset 0 0 0 1px rgba(255, 176, 167, 0.28) !important;
}

/* 3. Main Window Title Header (Rule #9) + Nearby Loot Integration */
html[data-dfo-container] .pack-shell .loot-win .remotehead {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 0;
  padding: 8px 14px;
  text-align: left;
  letter-spacing: normal;
  text-indent: 0;
  background-color: transparent;
  background-image: var(--dfo-bg-win-head, linear-gradient(180deg, rgba(62, 56, 44, 0.38) 0%, rgba(24, 26, 32, 0.55) 56%, rgba(10, 12, 16, 0.72) 100%));
  border: 0;
  border-bottom: 1px solid #050608;
  box-shadow: 0 1px 0 rgba(163, 152, 128, 0.26), inset 0 1px 0 rgba(255, 255, 255, 0.05);
}
html[data-dfo-container] .pack-shell .loot-win .remotehead.has-nearby {
  flex-wrap: wrap;
  row-gap: 6px;
}
html[data-dfo-container] .pack-shell .loot-win .remotehead .dfo-loot-actions {
  margin-top: 0;
  justify-content: flex-end;
}
html[data-dfo-container] .pack-shell .loot-win .remotewho {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
  text-align: left;
  letter-spacing: normal;
  text-indent: 0;
}
html[data-dfo-container] .pack-shell .loot-win.fate .remotehead,
html[data-dfo-container] .pack-shell .loot-win.fate .remotewho {
  text-align: center;
}
html[data-dfo-container] .pack-shell .loot-win .remotehead h3 {
  margin: 0;
  font-family: 'DFO Greengoth', Georgia, serif !important;
  font-size: calc(16.5px) !important;
  font-weight: normal;
  line-height: 1.22;
  letter-spacing: 0.065em;
  text-transform: uppercase;
  text-indent: 0;
  color: #f6e7b0 !important;
  text-shadow: 0 2px 0 #000, 0 0 10px rgba(245, 212, 81, 0.18) !important;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
html[data-dfo-container] .pack-shell .loot-win:not(.fate) .remotehead h3::before {
  content: '◆ ';
  font-size: calc(10px);
  color: #d5b26e;
  vertical-align: 1px;
  margin-right: 4px;
  text-shadow: none;
}

/* 4. Corpse Pile Tabs (.piletabs — [C-04] beveled stone tabs) */
html[data-dfo-container] .pack-shell .loot-win .piletabs {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0;
  padding: 6px 8px 5px;
  background: rgba(6, 8, 12, 0.52);
  border: 0;
  border-bottom: 1px solid rgba(154, 144, 121, 0.34);
  box-shadow: 0 1px 0 #050608;
}
html[data-dfo-container] .pack-shell .loot-win .piletab {
  flex: 1 1 auto;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 25px;
  padding: 2px 9px;
  border-radius: 1px;
  border: 1px solid rgba(117, 99, 70, 0.48);
  background: linear-gradient(180deg, rgba(34, 38, 48, 0.88), rgba(19, 22, 28, 0.94));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), inset 0 -1px 0 rgba(0, 0, 0, 0.6);
  color: #b2a78e;
  font-family: 'DFO Gabin', serif !important;
  font-size: calc(11.5px) !important;
  line-height: 1.2;
  text-shadow: 0 1px 0 #000;
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
}
html[data-dfo-container] .pack-shell .loot-win .piletab:hover {
  background: linear-gradient(180deg, rgba(48, 50, 58, 0.92), rgba(26, 28, 34, 0.96));
  border-color: rgba(213, 178, 110, 0.68);
  color: #f6e7b0;
}
html[data-dfo-container] .pack-shell .loot-win .piletab.on {
  background-color: var(--dfo-bg-button-hover, #262a33);
  background-image: linear-gradient(180deg, rgba(224, 136, 74, 0.26), rgba(192, 138, 62, 0.12));
  border-color: #e4c175;
  color: #fde68a;
  box-shadow: inset 0 -2px 0 #f5d451, inset 0 1px 0 rgba(255, 224, 150, 0.22);
}
html[data-dfo-container] .pack-shell .loot-win .piletab .piletabname {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
html[data-dfo-container] .pack-shell .loot-win .piletab .piletabn {
  flex: 0 0 auto;
  font-family: 'DFO Flexi', monospace;
  font-variant-numeric: tabular-nums;
  font-size: calc(11px) !important;
  color: #a89b7e;
}

/* 5. Top Utility Bar (Rule #8 Default Paint #9a9079 — Left buttons | Middle Pocket Gold | Right Carry Weight) */
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-utilbar {
  flex: 0 0 auto;
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 6px;
  margin: 6px 8px 0;
  padding: 5px 6px;
  background-color: var(--dfo-bg-panel, rgba(15, 17, 22, 0.92));
  background-image: linear-gradient(180deg, rgba(154, 144, 121, 0.08) 0, rgba(154, 144, 121, 0.024) 24px, transparent 54px);
  border: 1px solid;
  border-top: 2px solid #9a9079;
  border-right-color: #3a352a;
  border-bottom-color: #25221b;
  border-left-color: #7a7260;
  box-shadow: 0 0 0 1px #050608, inset 0 1px 0 rgba(255, 255, 255, 0.04), inset 0 -1px 0 rgba(0, 0, 0, 0.65);
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-util-left {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 5px;
  min-width: 0;
  flex: 1 1 auto;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-util-left .dfo-ornate-btn {
  min-height: 31px;
  padding: 4px 10px;
  font-size: calc(11.5px) !important;
  letter-spacing: 0.02em;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-util-left .dfo-loot-icon-btn {
  width: 34px;
  min-width: 34px;
  height: 31px;
  min-height: 31px;
  padding: 0;
  flex: 0 0 34px;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-util-left .dfo-loot-icon-btn .dfo-util-ico {
  width: 20px;
  height: 20px;
  flex: 0 0 20px;
  display: block;
  filter: drop-shadow(0 1px 1px #000);
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-util-left .dfo-loot-sort {
  min-height: 31px;
  padding: 4px 10px;
  font-size: calc(11.5px) !important;
  line-height: 1.15;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-gold {
  box-sizing: border-box;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 68px;
  padding: 4px 8px;
  margin: 0;
  background: linear-gradient(180deg, rgba(18, 21, 27, 0.96), rgba(9, 11, 15, 0.98));
  background-image: linear-gradient(180deg, rgba(245, 212, 81, 0.10), transparent 72%);
  border: 1px solid #75603e;
  border-left: 3px solid #f5d451;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 232, 160, 0.12);
  cursor: help;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-gold .dfo-gold-icon {
  width: 15px;
  height: 15px;
  flex: 0 0 15px;
  display: block;
  filter: drop-shadow(0 1px 1px #000);
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-gold .v {
  font-family: 'DFO Flexi', monospace !important;
  font-variant-numeric: tabular-nums;
  font-size: calc(14px) !important;
  line-height: 1.25;
  padding-top: 1px;
  letter-spacing: 0.02em;
  color: #f5d451 !important;
  text-shadow: 0 1px 0 #000;
  white-space: nowrap;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-carry {
  box-sizing: border-box;
  flex: 0 0 auto;
  min-width: 176px;
  max-width: 224px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  gap: 4px;
  padding: 4px 7px 5px;
  margin: 0;
  background: linear-gradient(180deg, rgba(16, 20, 26, 0.96), rgba(8, 10, 13, 0.98));
  border: 1px solid #75603e;
  border-left: 3px solid #d8ab4e;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 224, 150, 0.1);
  cursor: help;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-carry.is-overweight {
  border-color: rgba(200, 62, 54, 0.72);
  border-left-color: #e2574c;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-carry .dfo-carry-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 5px;
  width: 100%;
  min-width: 0;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-carry .dfo-carry-icon {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  display: block;
  filter: drop-shadow(0 1px 1px #000);
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-carry .v {
  flex: 1 1 auto;
  min-width: 0;
  font-family: 'DFO Flexi', monospace !important;
  font-variant-numeric: tabular-nums;
  font-size: calc(13px) !important;
  line-height: 1.28;
  padding-top: 1px;
  letter-spacing: 0.015em;
  color: #fff2cc !important;
  text-shadow: 0 1px 0 #000;
  white-space: nowrap;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-carry.is-overweight .v {
  color: #ffa89e !important;
  text-shadow: 0 0 6px rgba(220, 38, 38, 0.45), 0 1px 0 #000;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-carry .dfo-carry-free {
  flex: 0 0 auto;
  font-family: 'DFO Flexi', monospace !important;
  font-variant-numeric: tabular-nums;
  font-size: calc(11px) !important;
  line-height: 1.25;
  padding: 1px 5px;
  color: #8ee3b0 !important;
  background: rgba(20, 48, 36, 0.65);
  border: 1px solid rgba(82, 194, 152, 0.38);
  text-shadow: 0 1px 0 #000;
  white-space: nowrap;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-carry .dfo-carry-free.is-over {
  color: #ffa89e !important;
  background: rgba(84, 20, 18, 0.72);
  border-color: rgba(226, 87, 76, 0.58);
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-carry .px-meter {
  position: relative;
  flex: 0 0 auto;
  width: 100%;
  min-width: 0;
  height: 10px;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(4, 5, 7, 0.96), rgba(11, 13, 18, 0.92));
  border: 1px solid #6b583a;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.92), inset 0 0 0 1px rgba(0, 0, 0, 0.65);
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-carry .px-meter::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(90deg, transparent 0, transparent calc(25% - 1px), rgba(5, 6, 8, 0.5) calc(25% - 1px), rgba(5, 6, 8, 0.5) 25%);
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-carry.is-overweight .px-meter {
  border-color: #c83e36;
  box-shadow: 0 0 6px rgba(220, 38, 38, 0.35), inset 0 1px 3px rgba(0, 0, 0, 0.9);
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-carry .px-fill {
  height: 100%;
  background-color: #9cf0a6;
  box-shadow: inset 0 1px 0 rgba(255, 252, 225, 0.38);
  transition: width 140ms ease, background-color 140ms ease;
}

/* 6. Filters & Card-Content Search Sub-Panel (Rule #8 Default Paint + L-02 Search Well + Custom Dropdowns) */
html[data-dfo-container] .pack-shell .loot-win .storefilter {
  position: relative;
  z-index: 2;
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 6px 8px 0;
  padding: 7px 8px;
  background-color: var(--dfo-bg-panel, rgba(15, 17, 22, 0.92));
  background-image: linear-gradient(180deg, rgba(154, 144, 121, 0.08) 0, rgba(154, 144, 121, 0.024) 28px, transparent 64px);
  border: 1px solid;
  border-top: 2px solid #9a9079;
  border-right-color: #3a352a;
  border-bottom-color: #25221b;
  border-left-color: #7a7260;
  box-shadow: 0 0 0 1px #050608, inset 0 1px 0 rgba(255, 255, 255, 0.04), inset 0 -1px 0 rgba(0, 0, 0, 0.65);
}
html[data-dfo-container] .pack-shell .loot-win .storefilter:has(.dfo-loot-dd.is-open) {
  z-index: 30;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-search {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  min-width: 0;
  height: 32px;
  min-height: 32px;
  padding: 3px 9px;
  background: var(--dfo-bg-input, rgba(4, 5, 7, 0.86));
  border: 1px solid rgba(192, 138, 62, 0.58);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.85), 0 0 0 1px #050608;
  border-radius: 1px;
  overflow: hidden;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-search:focus-within {
  border-color: #d5b26e;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(213, 178, 110, 0.35);
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-search .dfo-find-ico {
  width: 15px;
  height: 15px;
  flex: 0 0 15px;
  display: block;
  opacity: 0.92;
  filter: drop-shadow(0 1px 1px #000);
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-search .storesearch {
  flex: 1 1 0%;
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  border: 0 !important;
  outline: 0;
  background: transparent !important;
  box-shadow: none !important;
  color: #f6e7b0 !important;
  font-family: 'DFO Gabin', serif !important;
  font-size: calc(13px) !important;
  line-height: 1.25;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-search .storesearch::placeholder {
  color: #8f8570 !important;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-search .storesearch::-webkit-search-cancel-button {
  display: none;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-search .dfo-find-count {
  flex: 0 0 auto;
  font-family: 'DFO Flexi', monospace;
  font-variant-numeric: tabular-nums;
  font-size: calc(11px) !important;
  color: #dec37f;
  padding: 1px 6px;
  background: rgba(28, 31, 38, 0.86);
  border: 1px solid rgba(117, 99, 70, 0.5);
  border-radius: 1px;
  white-space: nowrap;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-search .dfo-find-clear {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid rgba(117, 99, 70, 0.55);
  background: rgba(28, 31, 38, 0.9);
  color: #d8cfae;
  font-size: calc(11px) !important;
  line-height: 1;
  cursor: pointer;
  border-radius: 1px;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-search .dfo-find-clear:hover {
  border-color: #d5b26e;
  color: #f6e7b0;
  background: rgba(48, 38, 21, 0.9);
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-search .dfo-find-clear[hidden] {
  display: none;
}
html[data-dfo-container] .pack-shell .loot-win .storemenus {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  gap: 6px;
  width: 100%;
  margin: 0;
  padding: 0;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-dd {
  position: relative;
  min-width: 0;
  width: 100%;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-dd .dfo-loot-dd-btn {
  width: 100%;
  min-width: 0;
  height: 31px;
  min-height: 31px;
  padding: 4px 9px 4px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  font-size: calc(11.5px) !important;
  letter-spacing: 0.03em;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-dd.is-open .dfo-loot-dd-btn {
  --dfo-c: #fde68a;
  border-color: #c59b4d;
  border-top-color: #f3cf86;
  border-bottom-color: #5c4318;
  color: #fde68a;
  filter: brightness(1.12);
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-dd .dfo-dd-lead {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-dd .dfo-dd-ico {
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
  display: block;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.9));
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-dd .dfo-dd-pip {
  width: 7px;
  height: 7px;
  flex: 0 0 7px;
  transform: rotate(45deg);
  background: var(--dfo-pip-c, #d5b26e);
  border: 1px solid #050608;
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.75);
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-dd .dfo-dd-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-dd .dfo-dd-tail {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-dd .dfo-dd-count {
  font-family: 'DFO Flexi', monospace;
  font-variant-numeric: tabular-nums;
  font-size: calc(10.5px) !important;
  line-height: 1.15;
  padding: 1px 5px;
  color: #dec37f;
  background: rgba(12, 14, 18, 0.78);
  border: 1px solid rgba(192, 138, 62, 0.42);
  border-radius: 1px;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-dd.is-filtered .dfo-dd-count {
  color: #fde68a;
  background: rgba(24, 18, 8, 0.82);
  border-color: rgba(245, 212, 81, 0.58);
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-dd .dfo-dd-caret {
  width: 12px;
  height: 12px;
  flex: 0 0 12px;
  display: block;
  transition: transform 140ms ease;
  filter: drop-shadow(0 1px 1px #000);
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-dd.is-open .dfo-dd-caret {
  transform: rotate(180deg);
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-dd .dfo-loot-dd-menu {
  display: none;
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 9600;
  box-sizing: border-box;
  max-height: 272px;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  padding: 5px;
  flex-direction: column;
  gap: 3px;
  background-color: var(--dfo-bg-panel-elevated, rgba(20, 23, 30, 0.98));
  background-image: linear-gradient(180deg, rgba(213, 178, 110, 0.12) 0%, rgba(213, 178, 110, 0.02) 42px, transparent 96px);
  border: 2px solid;
  border-color: #a5997e #413a2d #252119 #7e7562;
  box-shadow: 0 0 0 1px #050608, inset 0 0 0 1px rgba(5, 6, 8, 0.85), 0 12px 28px rgba(0, 0, 0, 0.92);
  scrollbar-width: thin;
  scrollbar-color: #756346 #0c0e11;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-dd.is-open .dfo-loot-dd-menu {
  display: flex;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-dd .dfo-loot-dd-menu::-webkit-scrollbar {
  width: 7px;
  height: 7px;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-dd .dfo-loot-dd-menu::-webkit-scrollbar-track {
  background: #0c0e11;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-dd .dfo-loot-dd-menu::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #5e4f37, #3e3424);
  border: 1px solid #14171c;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-dd .dfo-loot-dd-opt {
  box-sizing: border-box;
  width: 100%;
  min-height: 28px;
  margin: 0;
  padding: 5px 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 7px;
  background: var(--dfo-bg-row, rgba(16, 19, 24, 0.92)) !important;
  border: 1px solid rgba(117, 99, 70, 0.32);
  border-left: 3px solid var(--dfo-opt-c, #8a7b61);
  border-radius: 1px;
  color: #e9e4d9 !important;
  font-family: 'DFO Gabin', serif !important;
  font-size: calc(11.5px) !important;
  letter-spacing: 0.03em;
  line-height: 1.2;
  text-transform: uppercase;
  text-shadow: 0 1px 0 #000;
  cursor: pointer;
  user-select: none;
  transition: background-color 110ms ease, border-color 110ms ease, color 110ms ease;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-dd .dfo-loot-dd-opt:hover {
  background: var(--dfo-bg-row-hover, rgba(38, 42, 51, 0.96)) !important;
  border-color: rgba(213, 178, 110, 0.58);
  border-left-color: var(--dfo-opt-c, #d5b26e);
  color: #f6e7b0 !important;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-dd .dfo-loot-dd-opt.is-selected {
  background: linear-gradient(90deg, rgba(213, 178, 110, 0.20), rgba(78, 127, 114, 0.22)) !important;
  border-color: rgba(213, 178, 110, 0.72);
  border-left-color: var(--dfo-opt-c, #f5d451);
  color: #fde68a !important;
  box-shadow: inset 0 0 0 1px rgba(213, 178, 110, 0.24);
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-dd .dfo-opt-lead {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-dd .dfo-opt-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-dd .dfo-opt-tail {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-dd .dfo-opt-count {
  font-family: 'DFO Flexi', monospace;
  font-variant-numeric: tabular-nums;
  font-size: calc(10.5px) !important;
  line-height: 1.15;
  padding: 1px 5px;
  color: #c8ba9b;
  background: rgba(8, 10, 14, 0.76);
  border: 1px solid rgba(117, 99, 70, 0.42);
  border-radius: 1px;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-dd .dfo-loot-dd-opt.is-selected .dfo-opt-count {
  color: #fde68a;
  border-color: rgba(245, 212, 81, 0.55);
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-dd .dfo-opt-check {
  font-size: calc(9px) !important;
  color: #f5d451;
}

/* 7. [L-02] Recessed Item List Well (.remotelist) & 1:1 Inventory-Parity Item Rows */
html[data-dfo-container] .pack-shell .loot-win .remotelist {
  margin: 6px 8px;
  padding: 6px 8px;
  gap: 4px 8px;
  background-color: var(--dfo-bg-well, rgba(8, 10, 13, 0.9));
  border: 2px solid;
  border-color: #25221b #7a7260 #9a9079 #3a352a;
  box-shadow: 0 0 0 1px #050608, inset 2px 2px 0 rgba(0, 0, 0, 0.5);
  scrollbar-width: thin;
  scrollbar-color: #756346 #0c0e11;
  overflow-anchor: none;
}
html[data-dfo-container] .pack-shell .loot-win .remotelist > :is(.vlist-top, .vlist-bot, .vrows-gap) {
  grid-column: 1 / -1;
  flex: 0 0 auto !important;
  min-height: 0;
}
html[data-dfo-container] .pack-shell .loot-win .remotelist::-webkit-scrollbar {
  display: block;
  width: 7px;
  height: 7px;
}
html[data-dfo-container] .pack-shell .loot-win .remotelist::-webkit-scrollbar-track {
  background: #0c0e11;
}
html[data-dfo-container] .pack-shell .loot-win .remotelist::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #5e4f37, #3e3424);
  border: 1px solid #14171c;
}
html[data-dfo-container] .pack-shell .loot-win .remotelist > .packempty {
  color: #9c937d;
  font-family: 'DFO Gabin', serif;
  font-size: calc(13px);
  margin: 0;
}
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow {
  --dfo-row-rar: #827a68;
  position: relative;
  width: 100%;
  height: auto;
  min-height: 52px;
  box-sizing: border-box;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  text-align: left;
  outline: 0;
  background: var(--dfo-bg-row, rgba(16, 19, 24, 0.88));
  border: 1px solid rgba(117, 99, 70, 0.24);
  border-left: 3px solid var(--dfo-row-rar, #827a68);
  box-shadow: 0 0 0 1px #050608;
  transition: background-color 110ms ease, border-color 110ms ease;
}
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow:not(.dfo-item-row) {
  padding: 8px 12px;
}
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow.dfo-item-row {
  padding: 7px 12px 7px 9px;
}
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow[data-rarity="magic"] { --dfo-row-rar: #6f9ee8; }
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow[data-rarity="rare"] { --dfo-row-rar: #e4c34f; }
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow[data-rarity="legendary"] { --dfo-row-rar: #e07a2e; }
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow[data-rarity="aetheric"] { --dfo-row-rar: #bfe8ff; }
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow[data-rarity="artifact"] { --dfo-row-rar: #b57bee; }
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow[data-rarity="gilded"] { --dfo-row-rar: #ff3b4a; }
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow[data-rarity] {
  box-shadow: 0 0 0 1px #050608, inset 0 0 0 1px rgba(var(--rar-rgb), 0.3), inset 0 0 12px rgba(var(--rar-rgb), 0.2);
}
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow[data-rarity]::before {
  content: var(--rar-pips);
  position: absolute;
  left: 3px;
  bottom: 1px;
  font-size: calc(8px) !important;
  line-height: 1;
  letter-spacing: 1px;
  color: var(--rar);
  pointer-events: none;
  text-shadow: 1px 1px 0 #050608, 0 0 4px rgba(var(--rar-rgb), 0.7);
}
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow.hasbar[data-rarity]::before {
  bottom: 6px;
}
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow:hover,
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow:focus-visible {
  background: var(--dfo-bg-row-hover, rgba(38, 42, 51, 0.92));
  border-color: rgba(192, 138, 62, 0.45);
  border-left-color: var(--dfo-row-rar, #827a68);
}
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow[data-rarity]:hover,
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow[data-rarity]:focus-visible {
  box-shadow: 0 0 0 1px #050608, 0 0 9px rgba(var(--rar-rgb), 0.6), inset 0 0 0 1px rgba(var(--rar-rgb), 0.45), inset 0 0 16px rgba(var(--rar-rgb), 0.32);
}
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow.on {
  background: var(--dfo-bg-row-selected, rgba(78, 127, 114, 0.24));
  outline: 0;
  text-shadow: none;
  box-shadow: inset 0 0 0 1px rgba(213, 178, 110, 0.55);
  border-left-color: var(--brass, #c08a3e);
}
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow[data-rarity].on {
  box-shadow: 0 0 0 1px #050608, 0 0 12px rgba(var(--rar-rgb), 0.55), inset 0 0 16px rgba(var(--rar-rgb), 0.32);
}
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow[data-rarity="gilded"] {
  animation: gilded-glow 2.6s steps(8, end) infinite alternate;
}
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow .tile,
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow[data-rarity] .tile,
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow[data-rarity]:hover .tile {
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  position: relative;
  border: 0;
  background: var(--dfo-bg-well, rgba(8, 10, 13, 0.9));
  box-shadow: inset 0 0 0 1px #3a3428, 0 0 0 1px #050608;
}
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow[data-sigil] .tile::after,
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow[data-set] .tile::after {
  content: none;
  display: none;
}
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow[data-sigil]::after {
  content: '';
  position: absolute;
  right: 3px;
  top: 3px;
  width: 11px;
  height: 11px;
  pointer-events: none;
  z-index: 2;
  background: url("data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%22-1%20-1%2018%2018%22%20shape-rendering%3D%22crispEdges%22%3E%3Cg%20fill%3D%22%2372f0d8%22%20stroke%3D%22%23050608%22%20stroke-width%3D%222%22%20paint-order%3D%22stroke%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M6%201H10V2H12V3H13V5H14V11H13V13H12V14H10V15H6V14H4V13H3V11H2V5H3V3H4V2H6ZM6%203V4H5V5H4V11H5V12H6V13H10V12H11V11H12V5H11V4H10V3Z%22%2F%3E%3Crect%20x%3D%227%22%20y%3D%224%22%20width%3D%222%22%20height%3D%228%22%2F%3E%3Crect%20x%3D%224%22%20y%3D%227%22%20width%3D%228%22%20height%3D%222%22%2F%3E%3Crect%20x%3D%226%22%20y%3D%226%22%20width%3D%224%22%20height%3D%224%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E") center / contain no-repeat;
  animation: sigil-breathe 2.4s steps(6, end) infinite alternate;
}
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow[data-set]::after {
  background-image: var(--set-rune);
}
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow[data-locked] .tile::before {
  left: auto;
  top: auto;
  right: 2px;
  bottom: 2px;
}
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow.hasbar[data-locked] .tile::before {
  bottom: 6px;
}
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow .itemname {
  position: static;
  width: auto;
  height: auto;
  clip-path: none;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 0%;
  font-size: calc(14px);
  color: #d8cfae;
}
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow .itemname > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow:not(.dfo-item-row) .itemname small {
  font-size: calc(11px);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #9c937d;
}
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow .itemwt {
  display: block;
  flex: 0 0 auto;
  font-family: 'DFO Flexi', monospace;
  font-variant-numeric: tabular-nums;
  font-size: calc(12px);
  color: #9c937d;
}
html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow.dfo-item-row .itemwt.dfo-row-price {
  display: flex;
  color: #f5d451;
  font-size: inherit;
}

/* 8. Bottom Horizontal Footer Bar */
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-foot {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 7px 10px 6px;
  background-color: var(--dfo-bg-footer, rgba(0, 0, 0, 0.24));
  border-top: 1px solid #050608;
  box-shadow: inset 0 1px 0 rgba(163, 152, 128, 0.26);
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-foot-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-foot-row .dfo-ornate-btn {
  min-width: 120px;
  min-height: 31px;
  padding: 5px 14px;
  font-size: calc(12.5px) !important;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-foot-meta {
  min-width: 0;
  text-align: center;
  font-family: 'DFO Gabin', serif;
  font-variant-numeric: tabular-nums;
  font-size: calc(12px) !important;
  line-height: 1.25;
  letter-spacing: 0.02em;
  color: #8e8676;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: none;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-loot-foot-hint {
  text-align: center;
  font-family: 'DFO Gabin', serif;
  font-size: calc(11px) !important;
  line-height: 1.25;
  letter-spacing: 0.02em;
  color: #827a6b;
  padding-top: 4px;
  border-top: 1px solid rgba(117, 99, 70, 0.22);
  user-select: none;
}

/* 9. Redesigned Reward (.dfo-reward-win) & Fate (.loot-win.fate.dfo-fate-win) Windows */
html[data-dfo-container] .pack-shell .loot-win.dfo-reward-win,
html[data-dfo-container] .pack-shell.paired .loot-win.dfo-reward-win,
html[data-dfo-container] .pack-shell .loot-win.fate.dfo-fate-win,
html[data-dfo-container] .pack-shell.paired .loot-win.fate.dfo-fate-win {
  width: min(520px, 94vw) !important;
  min-width: min(520px, 94vw);
  max-width: min(520px, 94vw);
  height: auto !important;
  min-height: 0;
  max-height: min(740px, 92dvh);
  display: flex;
  flex-direction: column;
}
html[data-dfo-container] .pack-shell .loot-win :is(.dfo-reward-head, .dfo-fate-head) {
  display: flex;
  flex-direction: row !important;
  align-items: center !important;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  text-align: left !important;
}
html[data-dfo-container] .pack-shell .loot-win :is(.dfo-reward-head, .dfo-fate-head) .remotewho {
  align-items: flex-start !important;
  text-align: left !important;
  gap: 2px;
}
html[data-dfo-container] .pack-shell .loot-win :is(.dfo-reward-head, .dfo-fate-head) .remotewho h3 {
  text-align: left !important;
  font-size: calc(16.5px) !important;
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-head .remotewho h3::before {
  content: '◆ ';
  font-size: calc(10px);
  color: #d5b26e;
  vertical-align: 1px;
  margin-right: 4px;
  text-shadow: none;
}
html[data-dfo-container] .pack-shell .loot-win :is(.dfo-reward-head, .dfo-fate-head) .remotewho .meta {
  margin: 0;
  font-family: 'DFO Gabin', serif;
  font-size: calc(11.5px) !important;
  letter-spacing: 0.03em;
  color: #b7a889 !important;
  text-align: left !important;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-chip {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 1px;
  border: 1px solid rgba(192, 138, 62, 0.45);
  background: var(--dfo-bg-chip, rgba(12, 14, 18, 0.88));
  color: #e9e4d9 !important;
  font-family: 'DFO Gabin', serif;
  font-size: calc(10.5px) !important;
  letter-spacing: 0.06em;
  line-height: 1.25;
  text-transform: uppercase;
  text-shadow: 0 1px 0 #000;
  white-space: nowrap;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-chip.chip-gold {
  border-color: rgba(228, 195, 79, 0.65);
  color: #f6e7b0 !important;
  background: rgba(68, 52, 20, 0.55);
}
html[data-dfo-container] .pack-shell .loot-win .dfo-chip.chip-teal {
  border-color: rgba(46, 139, 107, 0.75);
  color: #7fe3b5 !important;
  background: rgba(24, 68, 55, 0.52);
}
html[data-dfo-container] .pack-shell .loot-win .dfo-chip.chip-amber {
  border-color: rgba(224, 122, 46, 0.72);
  color: #ffb87a !important;
  background: rgba(96, 48, 18, 0.52);
}
html[data-dfo-container] .pack-shell .loot-win .dfo-chip.chip-red {
  border-color: rgba(200, 90, 70, 0.75);
  color: #ff9f98 !important;
  background: rgba(130, 52, 44, 0.52);
}

/* 9A. Reward Window */
html[data-dfo-container] .pack-shell .loot-win .dfo-reward-banner {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 6px 8px 0;
  padding: 8px 10px;
  background-color: var(--dfo-bg-panel, rgba(15, 17, 22, 0.92));
  background-image: linear-gradient(180deg, rgba(154, 144, 121, 0.08) 0, rgba(154, 144, 121, 0.024) 26px, transparent 58px);
  border: 1px solid;
  border-top: 2px solid #9a9079;
  border-right-color: #3a352a;
  border-bottom-color: #25221b;
  border-left-color: #7a7260;
  box-shadow: 0 0 0 1px #050608, inset 0 1px 0 rgba(255, 255, 255, 0.04);
}
html[data-dfo-container] .pack-shell .loot-win .dfo-reward-banner-ico {
  width: 20px;
  height: 20px;
  flex: 0 0 20px;
  display: block;
  filter: drop-shadow(0 1px 2px #000);
}
html[data-dfo-container] .pack-shell .loot-win .dfo-reward-banner-txt {
  margin: 0;
  font-family: 'DFO Gabin', serif;
  font-size: calc(12px) !important;
  line-height: 1.35;
  color: #d8cfae !important;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-reward-list {
  display: flex !important;
  flex-direction: column !important;
  gap: 6px;
  padding: 8px;
  max-height: 360px;
  overflow-y: auto;
  overflow-x: hidden;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-reward-row {
  min-height: 62px;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-reward-row .dfo-reward-bonuses {
  display: block;
  margin-top: 2px;
  font-family: 'DFO Gabin', serif;
  font-size: calc(11.5px) !important;
  line-height: 1.28;
  letter-spacing: 0.01em;
  text-transform: none;
  color: #edd5a4 !important;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-reward-radio {
  flex: 0 0 20px;
  width: 20px;
  height: 20px;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #7a7260;
  background: var(--dfo-bg-input, rgba(4, 5, 7, 0.85));
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.85);
  color: transparent;
  font-size: calc(10px) !important;
  line-height: 1;
  transition: border-color 120ms ease, background-color 120ms ease, color 120ms ease;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-reward-radio.on {
  border-color: #f5d451;
  background: linear-gradient(180deg, #523e1a, #2f220c);
  color: #fde68a;
  box-shadow: 0 0 6px rgba(245, 212, 81, 0.35), inset 0 1px 0 rgba(255, 240, 180, 0.3);
}
html[data-dfo-container] .pack-shell .loot-win .dfo-reward-preview {
  --dfo-prev-rar: #9a9079;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 0 8px 6px;
  padding: 7px 10px;
  background-color: var(--dfo-bg-panel, rgba(15, 17, 22, 0.94));
  background-image: linear-gradient(90deg, rgba(213, 178, 110, 0.10), transparent 65%);
  border: 1px solid rgba(117, 99, 70, 0.48);
  border-left: 3px solid var(--dfo-prev-rar);
  box-shadow: 0 0 0 1px #050608, inset 0 1px 0 rgba(255, 255, 255, 0.04);
}
html[data-dfo-container] .pack-shell .loot-win .dfo-reward-prev-lead {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1 1 auto;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-reward-prev-k {
  font-size: calc(11px) !important;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #a89f88;
  flex: 0 0 auto;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-reward-prev-name {
  font-family: 'DFO Greengoth', Georgia, serif;
  font-size: calc(14.5px) !important;
  color: #f6e7b0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-reward-prev-tier {
  flex: 0 0 auto;
  font-size: calc(11px) !important;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #c8ba9b;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-reward-prev-none {
  font-size: calc(12px) !important;
  color: #9c937d;
}
html[data-dfo-container] .pack-shell .loot-win .dfo-reward-empty {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 8px 4px;
}

/* 9B. Fate Window */
html[data-dfo-container] .pack-shell .loot-win.fate .fatecol {
  padding: 0;
  display: flex;
  flex-direction: column;
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-lore {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 6px 8px 0;
  padding: 9px 11px;
  background-color: var(--dfo-bg-panel, rgba(15, 17, 22, 0.92));
  background-image: linear-gradient(180deg, rgba(154, 144, 121, 0.08) 0, rgba(154, 144, 121, 0.024) 32px, transparent 72px);
  border: 1px solid;
  border-top: 2px solid #9a9079;
  border-right-color: #3a352a;
  border-bottom-color: #25221b;
  border-left-color: #7a7260;
  box-shadow: 0 0 0 1px #050608, inset 0 1px 0 rgba(255, 255, 255, 0.04);
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-plea {
  margin: 0;
  padding: 8px 11px;
  background: var(--dfo-bg-well, rgba(8, 10, 13, 0.9));
  border: 1px solid rgba(192, 138, 62, 0.34);
  border-left: 3px solid #d5b26e;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.8);
  color: #f6e7b0 !important;
  font: calc(14px)/1.42 'DFO Flow', 'DFO Gabin', Georgia, serif !important;
  letter-spacing: normal !important;
  text-transform: none !important;
  text-align: left;
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-foot .dfo-loot-foot-row {
  grid-template-columns: minmax(0, 1fr) auto;
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-foot-meta {
  text-align: left;
  font-size: calc(11px) !important;
  white-space: normal;
  line-height: 1.3;
}
@layer dfo-community-fonts {
  :root body .pack-shell .loot-win.fate .dfo-fate-plea {
    font-family: 'DFO Flow', 'DFO Gabin', sans-serif !important;
  }
  :root body .pack-shell .loot-win .dfo-reward-prev-name {
    font-family: 'DFO Greengoth', 'DFO Gabin', sans-serif !important;
  }
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-body {
  margin: 0;
  font-family: 'DFO Gabin', serif;
  font-size: calc(12.5px) !important;
  line-height: 1.38;
  color: #c8bfa8 !important;
  text-align: left;
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-list {
  margin: 6px 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  background-color: var(--dfo-bg-well, rgba(8, 10, 13, 0.9));
  border: 2px solid;
  border-color: #25221b #7a7260 #9a9079 #3a352a;
  box-shadow: 0 0 0 1px #050608, inset 2px 2px 0 rgba(0, 0, 0, 0.5);
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-card {
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  padding: 9px 11px;
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  text-align: left;
  background: var(--dfo-bg-row, rgba(16, 19, 24, 0.92));
  border: 1px solid rgba(117, 99, 70, 0.36);
  border-left: 3px solid #9a9079;
  box-shadow: 0 0 0 1px #050608;
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-card.is-kill {
  border-left-color: #e2574c;
  background-image: linear-gradient(90deg, rgba(226, 87, 76, 0.10), transparent 55%);
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-card.is-spare {
  border-left-color: #52c298;
  background-image: linear-gradient(90deg, rgba(82, 194, 152, 0.10), transparent 55%);
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-card:hover:not(:disabled) {
  background-color: var(--dfo-bg-row-hover, rgba(38, 42, 51, 0.96));
  border-color: rgba(213, 178, 110, 0.65);
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-card.is-kill:hover:not(:disabled) {
  border-left-color: #ff7a70;
  box-shadow: 0 0 0 1px #050608, 0 0 10px rgba(226, 87, 76, 0.35), inset 0 0 12px rgba(226, 87, 76, 0.18);
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-card.is-spare:hover:not(:disabled) {
  border-left-color: #7fe3b5;
  box-shadow: 0 0 0 1px #050608, 0 0 10px rgba(82, 194, 152, 0.35), inset 0 0 12px rgba(82, 194, 152, 0.18);
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-card.on {
  border-color: #d5b26e;
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-card.is-kill.on {
  border-color: #e2574c;
  border-left-color: #ff8a80;
  background-image: linear-gradient(90deg, rgba(226, 87, 76, 0.24), rgba(213, 178, 110, 0.08));
  box-shadow: 0 0 0 1px #050608, inset 0 0 0 1px rgba(240, 138, 128, 0.45), 0 0 12px rgba(226, 87, 76, 0.38);
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-card.is-spare.on {
  border-color: #52c298;
  border-left-color: #7fe3b5;
  background-image: linear-gradient(90deg, rgba(82, 194, 152, 0.24), rgba(213, 178, 110, 0.08));
  box-shadow: 0 0 0 1px #050608, inset 0 0 0 1px rgba(127, 227, 181, 0.45), 0 0 12px rgba(82, 194, 152, 0.38);
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-face {
  width: 48px;
  height: 48px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--dfo-bg-well, rgba(8, 10, 13, 0.94));
  border: 1px solid #5a4b32;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.85), 0 0 0 1px #050608;
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-face img,
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-face .tile {
  max-width: 100%;
  max-height: 100%;
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-card.is-kill .dfo-fate-face {
  border-color: rgba(224, 122, 46, 0.72);
  box-shadow: inset 0 0 10px rgba(224, 122, 46, 0.25), 0 0 0 1px #050608;
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-card.is-spare .dfo-fate-face {
  border-color: rgba(82, 194, 152, 0.65);
  box-shadow: inset 0 0 10px rgba(82, 194, 152, 0.22), 0 0 0 1px #050608;
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-mercy-ico {
  width: 28px;
  height: 28px;
  display: block;
  filter: drop-shadow(0 1px 2px #000);
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-toprow {
  display: flex;
  align-items: center;
  gap: 7px;
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-verb {
  font-family: 'DFO Gabin', serif;
  font-size: calc(11px) !important;
  font-weight: bold;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-verb.is-kill { color: #ff8a80 !important; }
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-verb.is-spare { color: #7fe3b5 !important; }
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-tag {
  padding: 1px 6px;
  font-size: calc(9.5px) !important;
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-titlerow {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-card .fate-trophy,
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-spare-title {
  font-family: 'DFO Greengoth', Georgia, serif;
  font-size: calc(15px) !important;
  font-weight: normal;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-spare-title {
  color: #e6fbf6 !important;
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-desc {
  display: block;
  font-family: 'DFO Gabin', serif;
  font-size: calc(11.5px) !important;
  line-height: 1.32;
  letter-spacing: 0.01em;
  text-transform: none !important;
  color: #b8b0a0 !important;
  white-space: normal;
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-key {
  flex: 0 0 auto;
  min-width: 24px;
  height: 24px;
  padding: 0 6px;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: 'DFO Flexi', monospace;
  font-size: calc(12px) !important;
  color: #dec37f !important;
  background: rgba(10, 12, 16, 0.88);
  border: 1px solid rgba(192, 138, 62, 0.48);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-card.on .dfo-fate-key {
  color: #fde68a !important;
  border-color: #f5d451;
  background: rgba(58, 42, 16, 0.88);
}
html[data-dfo-container] body .pack-shell .loot-win.fate .dfo-fate-confirm.fate-confirm {
  flex: 0 0 auto;
  margin: 0 8px 6px;
  padding: 9px 12px;
  color: #f1e6c8 !important;
  background-color: var(--dfo-bg-panel, rgba(15, 17, 22, 0.94)) !important;
  background-image: linear-gradient(180deg, rgba(154, 144, 121, 0.08) 0, transparent 48px) !important;
  border: 1px solid !important;
  border-top: 2px solid #9a9079 !important;
  border-right-color: #3a352a !important;
  border-bottom-color: #25221b !important;
  border-left-color: #7a7260 !important;
  border-image: none !important;
  box-shadow: 0 0 0 1px #050608, inset 0 0 0 1px rgba(0, 0, 0, 0.65) !important;
  text-align: center;
}
html[data-dfo-container] body .pack-shell .loot-win.fate .dfo-fate-confirm.fate-confirm.is-kill {
  border-top-color: #e2574c !important;
  background-image: linear-gradient(180deg, rgba(226, 87, 76, 0.14) 0, transparent 56px) !important;
}
html[data-dfo-container] body .pack-shell .loot-win.fate .dfo-fate-confirm.fate-confirm.is-spare {
  border-top-color: #52c298 !important;
  background-image: linear-gradient(180deg, rgba(82, 194, 152, 0.14) 0, transparent 56px) !important;
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-confirm-txt {
  margin: 0 0 9px;
  font-family: 'DFO Gabin', serif;
  font-size: calc(12.5px) !important;
  line-height: 1.38;
  color: #f1e6c8 !important;
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-confirm-idle {
  margin: 0;
  font-family: 'DFO Gabin', serif;
  font-size: calc(12px) !important;
  line-height: 1.35;
  color: #9c937d !important;
}
html[data-dfo-container] .pack-shell .loot-win.fate .dfo-fate-confirm .acts {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin: 0;
}
html[data-dfo-container] body .pack-shell .loot-win > .sheet-notice.sheet-notice {
  margin: 0 8px 7px;
  padding: 5px 10px;
  font-family: 'DFO Gabin', serif !important;
  font-size: calc(12px) !important;
  color: #ffd0c6 !important;
  text-shadow: 0 1px 0 #000 !important;
  background: rgba(76, 27, 24, 0.78) !important;
  border: 1px solid rgba(201, 86, 76, 0.65) !important;
  border-left: 3px solid #e2574c !important;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.65) !important;
}

/* 10. [O-02] Chiseled Quantity Prompt Modal */
:root .dfo-loot-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: var(--dfo-bg-scrim, rgba(5, 7, 10, 0.76));
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
:root .dfo-loot-modal-box {
  width: min(390px, 94vw);
  background-color: var(--dfo-bg-panel-elevated, rgba(23, 27, 33, 0.96));
  background-image: linear-gradient(180deg, rgba(154, 144, 121, 0.10) 0, rgba(154, 144, 121, 0.025) 42px, transparent 92px);
  border: 2px solid;
  border-color: #9a9079 #3a352a #25221b #7a7260;
  box-shadow:
    0 0 0 1px #050608,
    inset 0 0 0 1px rgba(5, 6, 8, 0.75),
    0 14px 36px rgba(0, 0, 0, 0.85);
  border-radius: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  color: #e9e4d9;
  font-family: 'DFO Gabin', serif;
}
:root .dfo-loot-modal-head {
  padding: 9px 14px;
  background-image: var(--dfo-bg-win-head, linear-gradient(180deg, rgba(62, 56, 44, 0.38) 0%, rgba(24, 26, 32, 0.55) 56%, rgba(10, 12, 16, 0.72) 100%));
  border-bottom: 1px solid #050608;
  box-shadow: 0 1px 0 rgba(163, 152, 128, 0.26);
}
:root .dfo-loot-modal-head h3 {
  margin: 0;
  font-family: 'DFO Greengoth', Georgia, serif !important;
  font-size: calc(14.5px) !important;
  font-weight: normal;
  color: #f6e7b0 !important;
  text-transform: uppercase;
  letter-spacing: 0.055em;
  text-align: center;
  text-shadow: 0 2px 0 #000 !important;
}
:root .dfo-loot-modal-head h3::before {
  content: '◆ ';
  font-size: calc(9px);
  color: #d5b26e;
  vertical-align: 1px;
  margin-right: 3px;
  text-shadow: none;
}
:root .dfo-loot-modal-sub {
  margin: 4px 0 0;
  font-size: calc(12px) !important;
  color: #b7a889 !important;
  text-align: center;
  line-height: 1.35;
}
:root .dfo-loot-modal-body {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
:root .dfo-loot-modal-inputrow {
  display: flex;
  gap: 8px;
  align-items: stretch;
}
:root .dfo-loot-modal-input {
  flex: 1 1 auto;
  min-width: 0;
  height: 36px;
  padding: 0 11px;
  background: var(--dfo-bg-input, rgba(4, 5, 7, 0.74)) !important;
  border: 1px solid #6b5839 !important;
  border-radius: 0;
  color: #f5d451 !important;
  font-family: 'DFO Flexi', monospace !important;
  font-variant-numeric: tabular-nums;
  font-size: calc(16px) !important;
  letter-spacing: 0.04em;
  outline: none;
  box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.7);
}
:root .dfo-loot-modal-input:focus {
  border-color: #d5b26e !important;
  box-shadow: inset 0 0 0 1px rgba(213, 178, 110, 0.35), inset 0 2px 5px rgba(0, 0, 0, 0.7);
}
html[data-dfo-container] .dfo-loot-modal-box .dfo-ornate-btn.dfo-loot-modal-all {
  height: 36px;
  padding: 0 14px;
}
:root .dfo-loot-modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px 14px 11px;
  border-top: 1px solid rgba(117, 99, 70, 0.32);
  background: var(--dfo-bg-footer, rgba(0, 0, 0, 0.22));
}
html[data-dfo-container] .dfo-loot-modal-box .dfo-ornate-btn.dfo-loot-modal-btn {
  min-width: 96px;
  height: 32px;
  padding: 0 16px;
  font-size: calc(12.5px) !important;
}
`;

  function ensureStyle() {
    if (!doc?.head) return;
    if (doc.documentElement) doc.documentElement.dataset[ROOT_ATTR] = '1';
    let s = doc.getElementById(STYLE_ID);
    if (!s) {
      s = doc.createElement('style');
      s.id = STYLE_ID;
      s.textContent = CSS;
      doc.head.append(s);
    } else if (doc.head.lastElementChild !== s) {
      // Keep container cascade priority above late-injected enhancedStyle/pack styles without editing pack CSS
      doc.head.append(s);
    }
  }

  // ── Session State ──
  let activeCtx = null;
  let activeKind = null;
  let activeSessionKey = '';
  let sortMode = 'default';
  let lastFiltered = [];
  let savedRemoteScrollTop = 0;
  let rewardPick = null;
  let activeMount = null; // { kind, listBox, vHandle, sortBtn, lastListWidth, unmountMenuListener, disconnectResize, restoreScrollBeforeSync, restoreScrollAfterMount }
  let activeQtyModal = null;
  let lastPairedLootH = '';

  const cardSearchCache = new WeakMap();
  const classifyCache = new WeakMap();
  let clsEnvSeq = 1;
  let clsLastJunkRef = null;
  let clsLastTagsRef = null;
  let clsLastItemsRef = null;
  let clsLastJunkStr = '';
  let clsEnvState = null;

  let activeSearchWorkId = 0;
  let activeSearchTimer = 0;
  let activeSearchIsRaf = false;

  const basePack = () => root.__dfoPack;

  function cancelProgressiveSearch() {
    activeSearchWorkId++;
    if (activeSearchTimer) {
      if (activeSearchIsRaf && typeof root.cancelAnimationFrame === 'function') root.cancelAnimationFrame(activeSearchTimer);
      else clearTimeout(activeSearchTimer);
      activeSearchTimer = 0;
      activeSearchIsRaf = false;
    }
  }

  function resolveEnvState(ctx = activeCtx, meta = null) {
    const loc = currentLocale();
    const rarOn = ctx?.rarityOn ? !!ctx.rarityOn() : true;
    const Pack = basePack();
    const junkObj = Pack?.settings?.()?.junk ?? null;
    const tagsRef = junkObj?.tags ?? null;
    const itemsRef = junkObj?.items ?? null;
    if (junkObj !== clsLastJunkRef || tagsRef !== clsLastTagsRef || itemsRef !== clsLastItemsRef) {
      clsLastJunkRef = junkObj;
      clsLastTagsRef = tagsRef;
      clsLastItemsRef = itemsRef;
      try { clsLastJunkStr = junkObj ? JSON.stringify(junkObj) : ''; } catch { clsLastJunkStr = ''; }
    }
    const packPageFn = Pack?.page || null;
    const sf = meta || root.__dfoStoreFilterMeta || null;
    const sfPage = sf?.pageOf || null;
    const sfMat = sf?.materialOf || null;
    const sfRar = sf?.rarityOf || null;
    const lightSrc = ctx?.lightSource ? ctx.lightSource() : null;
    if (
      !clsEnvState
      || clsEnvState.loc !== loc
      || clsEnvState.rarOn !== rarOn
      || clsEnvState.junkStr !== clsLastJunkStr
      || clsEnvState.packPageFn !== packPageFn
      || clsEnvState.sfPage !== sfPage
      || clsEnvState.sfMat !== sfMat
      || clsEnvState.sfRar !== sfRar
      || clsEnvState.lightSrc !== lightSrc
    ) {
      clsEnvSeq++;
      clsEnvState = { seq: clsEnvSeq, loc, rarOn, junkStr: clsLastJunkStr, packPageFn, sfPage, sfMat, sfRar, lightSrc };
    }
    return clsEnvState;
  }

  function fallbackBasePage(it) {
    if (!it) return 'misc';
    const g = String(it.group || '');
    if (g === 'Weapons') return 'weapons';
    if (g === 'Armor') return 'armor';
    if (g === 'MensClothing' || g === 'WomensClothing') return 'clothing';
    if (g === 'UselessItems1' && it.templateIndex === 197) return 'potions';
    if (g === 'Books' || g === 'Maps') return 'books';
    if (g === 'Gems' || g === 'Jewellery' || g === 'Currency' || g === 'Paintings' || g === 'Deeds' || g === 'Artifacts') return 'valuables';
    return 'misc';
  }

  function computePageOf(it, ctx, env) {
    if (!it || typeof it !== 'object') return 'misc';
    if (!it.questItem && (ctx?.isJunk?.(it) || it.userJunk || it.junk === true)) return 'junk';
    const baseFn = env.sfPage || fallbackBasePage;
    try {
      if (env.packPageFn) return env.packPageFn(it, baseFn, baseFn);
      if (Rules?.basePage) return Rules.basePage(it, baseFn);
    } catch { /* fall through to baseFn */ }
    const p = baseFn(it);
    return STORE_CATEGORIES_SET.has(p) ? p : 'misc';
  }

  function computeMaterialOf(it, ctx, env) {
    if (!it || typeof it !== 'object') return '';
    const sfMat = env.sfMat ? env.sfMat(it) : '';
    if (sfMat && MATERIALS_SET.has(sfMat)) return sfMat;
    if (it.armorType === 'Chain') return 'Chain';
    if (it.armorType === 'Leather' || it.materialName === 'Leather') return 'Leather';
    if (typeof it.materialName === 'string' && MATERIALS_SET.has(it.materialName)) return it.materialName;
    if (env.sfMat && it.group !== 'Weapons' && it.group !== 'Armor') return '';
    const line = ctx?.itemLine?.(it);
    if (line?.armorType === 'Chain') return 'Chain';
    if (line?.armorType === 'Leather') return 'Leather';
    const lm = typeof line?.material === 'string' ? line.material.trim() : '';
    if (lm) {
      if (MATERIALS_SET.has(lm)) return lm;
      const lower = lm.toLowerCase();
      for (const m of MATERIALS_FILTER) {
        if (m.toLowerCase() === lower) return m;
      }
    }
    return '';
  }

  function computeRarityOf(it, ctx, env) {
    const r = ctx?.rarityOf?.(it) ?? env.sfRar?.(it) ?? it?.rarity ?? 'common';
    return r || 'common';
  }

  function classifyItem(it, ctx = activeCtx, meta = null, env = null) {
    if (!it || typeof it !== 'object') return { pg: 'misc', rar: 'common', mat: '' };
    const e = env || resolveEnvState(ctx, meta);
    const live = !!ctx?.live;
    const hit = classifyCache.get(it);
    if (
      hit
      && hit.seq === e.seq
      && (live ? hit.live : hit.ctx === ctx)
      && hit.j === !!it.junk
      && hit.uj === !!it.userJunk
      && hit.l === !!it.locked
      && hit.q === !!it.questItem
      && hit.id === (it.isIdentified !== false)
      && hit.r === it.rarity
      && hit.ex === it.exalted
      && hit.m === it.material
      && hit.mn === it.materialName
      && hit.at === it.armorType
      && hit.st === !!it.stolen
      && hit.cu === !!it.cursed
      && hit.cc === it.currentCondition
      && hit.grp === it.group
      && hit.tpl === it.templateIndex
      && hit.val === it.value
      && hit.fl === it.flags
    ) {
      return hit;
    }
    const entry = {
      seq: e.seq,
      live,
      ctx: live ? null : ctx,
      j: !!it.junk,
      uj: !!it.userJunk,
      l: !!it.locked,
      q: !!it.questItem,
      id: it.isIdentified !== false,
      r: it.rarity,
      ex: it.exalted,
      m: it.material,
      mn: it.materialName,
      at: it.armorType,
      st: !!it.stolen,
      cu: !!it.cursed,
      cc: it.currentCondition,
      grp: it.group,
      tpl: it.templateIndex,
      val: it.value,
      fl: it.flags,
      pg: computePageOf(it, ctx, e),
      rar: computeRarityOf(it, ctx, e),
      mat: computeMaterialOf(it, ctx, e),
    };
    classifyCache.set(it, entry);
    return entry;
  }

  function pageOf(it, ctx = activeCtx, meta = null) {
    if (!it || typeof it !== 'object') return 'misc';
    return classifyItem(it, ctx, meta).pg;
  }

  function materialOf(it, ctx = activeCtx, meta = null) {
    if (!it || typeof it !== 'object') return '';
    return classifyItem(it, ctx, meta).mat;
  }

  function rarityOf(it, ctx = activeCtx, meta = null) {
    if (!it || typeof it !== 'object') return it?.rarity || 'common';
    return classifyItem(it, ctx, meta).rar;
  }

  function itemNameOf(it, ctx = activeCtx) {
    if (!it) return '';
    const line = ctx?.itemLine?.(it);
    const raw = line?.name ?? it.name ?? '';
    return raw ? trGame(raw) : '';
  }

  // Pure-JS card content indexer (excludes lore/description & container name, respects RU localization & multi-word search)
  function buildPureCardSearchText(it, ctx = activeCtx, meta = null, env = null, cls = null) {
    if (!it || typeof it !== 'object') return '';
    const e = env || resolveEnvState(ctx, meta);
    const c = cls || classifyItem(it, ctx, meta, e);
    const line = ctx?.itemLine?.(it) || {};
    const rawName = line.name ?? it.name ?? '';
    const parts = rawName ? [trGame(rawName)] : [];

    const rar = c.rar;
    if (rar !== 'common') {
      const rLbl = T(`container.rarity.${rar}`);
      parts.push(it.exalted === true ? `${T('container.rarity.exalted')} ${rLbl}` : rLbl);
    }

    const mat = c.mat;
    if (mat) parts.push(`${T('container.search.word.material')} ${T(`container.mat.${mat}`)}`);
    else if (line.material) parts.push(trGame(line.material));

    if (line.armorType === 'Leather') parts.push(T('container.search.word.armorLeather'));
    else if (line.armorType === 'Chain') parts.push(T('container.search.word.armorChain'));
    else if (line.armorType === 'Plate') parts.push(T('container.search.word.armorPlate'));

    if (line.word) parts.push(trGame(line.word));
    if (line.hands) parts.push(trGame(line.hands));
    if (line.damage) parts.push(`${T('container.search.word.damage')} ${line.damage}`);
    if (line.armour) parts.push(`${T('container.search.word.armor')} ${line.armour}`);
    if (line.condition != null && line.condition !== '') {
      const condRaw = String(line.condition).trim();
      const condStr = /^\d+(?:\.\d+)?$/.test(condRaw) ? `${condRaw}%` : condRaw;
      parts.push(T('container.search.word.condition'), trGame('Condition'), trGame(condStr));
    }
    if (line.survival) {
      if (Array.isArray(line.survival)) {
        for (let i = 0; i < line.survival.length; i++) if (line.survival[i]) parts.push(trGame(line.survival[i]));
      } else {
        parts.push(trGame(line.survival));
      }
    }
    if (line.recipe) {
      if (typeof line.recipe === 'string') {
        parts.push(trGame(line.recipe));
      } else {
        if (line.recipe.potion) parts.push(trGame('Recipe for'), trGame(line.recipe.potion));
        if (Array.isArray(line.recipe.ingredients) && line.recipe.ingredients.length) {
          parts.push(trGame('Ingredients'));
          for (let i = 0; i < line.recipe.ingredients.length; i++) {
            if (line.recipe.ingredients[i]) parts.push(trGame(line.recipe.ingredients[i]));
          }
        }
      }
    }

    const stack = line.stack ?? (Number.isInteger(it.stackCount) && it.stackCount > 1 ? it.stackCount : 1);
    if (stack > 1) parts.push(`x${stack} \u00d7${stack}`);

    const val = ctx?.itemValue ? ctx.itemValue(it) : ((Number(it.value) || 0) * stack);
    if (val > 0) parts.push(`${val} ${T('container.unit.gold')}`);

    const effects = ctx?.itemEffects?.(it, { set: false, lore: false, technique: true });
    if (Array.isArray(effects)) {
      for (let i = 0; i < effects.length; i++) {
        const ef = effects[i];
        if (ef) parts.push(trGame(ef));
      }
    }
    const tech = ctx?.techInfo?.(it);
    if (tech) {
      parts.push(trGame('Technique'));
      if (tech.name) parts.push(trGame(tech.name));
      if (tech.what) parts.push(trGame(tech.what));
    }

    if (it.sockets != null || it.socket != null || !ctx?.live) {
      const sockets = ctx?.socketsOf?.(it);
      if (Array.isArray(sockets) && sockets.length) {
        parts.push(T('container.search.word.socket'));
        for (let i = 0; i < sockets.length; i++) {
          const s = sockets[i];
          if (!s || s === 'empty') {
            parts.push(T('container.search.word.emptySocket'));
          } else {
            const gName = ctx?.gemName ? ctx.gemName(s) : s;
            const gBonus = ctx?.gemBonus ? ctx.gemBonus(it, s) : '';
            if (gName) parts.push(trGame(gName));
            if (gBonus) parts.push(trGame(gBonus));
          }
        }
      }
    }

    const setInfo = ctx?.setInfo?.(it);
    if (setInfo) {
      if (setInfo.name) parts.push(trGame(setInfo.name), T('container.search.word.set'));
      if (Array.isArray(setInfo.tiers)) {
        for (let i = 0; i < setInfo.tiers.length; i++) {
          if (setInfo.tiers[i]) parts.push(trGame(setInfo.tiers[i]));
        }
      }
    }

    const worth = ctx?.letterWorth?.(it);
    if (worth) parts.push(trGame('Worth'), trGame(worth));
    const bound = ctx?.boundLine?.(it);
    if (bound) parts.push(trGame(bound));
    if (line.quest) parts.push(trGame(line.quest));

    if (it.isIdentified === false) parts.push(T('container.search.word.unidentified'));
    if (ctx?.isLocked?.(it) || it.locked) parts.push(T('container.search.word.locked'));
    if (it.questItem || line.quest) parts.push(T('container.search.word.quest'));
    if (it.stolen) parts.push(T('container.search.word.stolen'));
    if (it.cursed) parts.push(T('container.search.word.cursed'));
    if (!it.questItem && (c.pg === 'junk' || ctx?.isJunk?.(it) || it.userJunk || it.junk)) parts.push(T('container.search.word.junk'));
    if (it.isLit || line.lit || (e.lightSrc && e.lightSrc === it)) parts.push(T('container.search.word.lit'));
    if (it.isLetter) parts.push(T('container.search.word.letter'));

    return normSearchText(parts.join(' '));
  }

  function readSocketSig(it, ctx, hit) {
    if (it.sockets == null && it.socket == null) {
      if (ctx?.live && (!hit || !hit.sockSig)) return '';
    }
    const socks = ctx?.socketsOf?.(it);
    return Array.isArray(socks) && socks.length ? socks.join(',') : '';
  }

  function containerCardTextOf(it, ctx = activeCtx, meta = null, env = null, cls = null) {
    if (!it || typeof it !== 'object') return '';
    const e = env || resolveEnvState(ctx, meta);
    const live = !!ctx?.live;
    const hit = cardSearchCache.get(it);

    if (live) {
      const sockSig = readSocketSig(it, ctx, hit);
      const stack = it.stackCount ?? 1;
      const lk = !!it.locked;
      const jn = !!(it.junk || it.userJunk);
      const id = it.isIdentified !== false;
      const q = !!it.questItem;
      const st = !!it.stolen;
      const cu = !!it.cursed;
      const lit = !!(it.isLit || (e.lightSrc && e.lightSrc === it));
      const rar = it.rarity;
      const ex = !!it.exalted;
      const val = it.value;
      const nm = it.name;
      const cc = it.currentCondition;
      const mc = it.maxCondition;
      const fl = it.flags;
      const eq = it.equipSlot;
      const poison = it.poisonType;
      const honed = it.honed;
      const ref = it.reforges;
      const sx = it.sigil?.xp ?? null;
      if (
        hit
        && hit.live
        && hit.seq === e.seq
        && hit.uid === it.uid
        && hit.stack === stack
        && hit.lk === lk
        && hit.jn === jn
        && hit.id === id
        && hit.q === q
        && hit.st === st
        && hit.cu === cu
        && hit.lit === lit
        && hit.rar === rar
        && hit.ex === ex
        && hit.val === val
        && hit.nm === nm
        && hit.cc === cc
        && hit.mc === mc
        && hit.fl === fl
        && hit.eq === eq
        && hit.poison === poison
        && hit.honed === honed
        && hit.ref === ref
        && hit.sx === sx
        && hit.sockSig === sockSig
      ) {
        return hit.text;
      }
      const c = cls || classifyItem(it, ctx, meta, e);
      const text = buildPureCardSearchText(it, ctx, meta, e, c);
      cardSearchCache.set(it, {
        live: true,
        seq: e.seq,
        uid: it.uid,
        stack,
        lk,
        jn,
        id,
        q,
        st,
        cu,
        lit,
        rar,
        ex,
        val,
        nm,
        cc,
        mc,
        fl,
        eq,
        poison,
        honed,
        ref,
        sx,
        sockSig,
        text,
      });
      return text;
    }

    const socks = ctx?.socketsOf?.(it);
    const sockSig = Array.isArray(socks) && socks.length ? socks.join(',') : '';
    const line = ctx?.itemLine?.(it);
    const sig = `${e.seq}|${e.loc}|${it.uid ?? ''}|${it.stackCount ?? 1}|${ctx?.isLocked?.(it) ? 1 : 0}|${ctx?.isJunk?.(it) ? 1 : 0}|${it.isIdentified === false ? 0 : 1}|${line?.condition ?? ''}|${sockSig}`;
    if (hit && hit.ctx === ctx && hit.key === sig) return hit.text;
    const text = buildPureCardSearchText(it, ctx, meta, e, cls);
    cardSearchCache.set(it, { live: false, ctx, key: sig, text });
    return text;
  }

  function computeFilterSnapshot(items, filter, ctx = activeCtx, meta = null) {
    const f = filter || { cat: 'all', rarity: 'all', material: 'all', query: '' };
    const env = resolveEnvState(ctx, meta);
    const tokens = f.query ? parseQueryTokens(f.query) : null;
    const tokLen = tokens ? tokens.length : 0;
    const tok0 = tokLen === 1 ? tokens[0] : '';
    const fCat = f.cat || 'all';
    const rarEnabled = env.rarOn;
    const fRar = rarEnabled ? (f.rarity || 'all') : 'all';
    const fMat = f.material || 'all';

    const filtered = [];
    const catCounts = new Map();
    const rarCounts = new Map();
    const matCounts = new Map();
    let catAll = 0;

    for (let i = 0; i < (items?.length || 0); i++) {
      const it = items[i];
      if (!it) continue;
      const cls = classifyItem(it, ctx, meta, env);
      if (tokLen) {
        const txt = containerCardTextOf(it, ctx, meta, env, cls);
        if (!txt) continue;
        if (tokLen === 1) {
          if (!txt.includes(tok0)) continue;
        } else {
          let qOk = true;
          for (let t = 0; t < tokLen; t++) {
            if (!txt.includes(tokens[t])) { qOk = false; break; }
          }
          if (!qOk) continue;
        }
      }

      const pg = cls.pg;
      const rar = cls.rar;
      const mat = cls.mat;

      const okCat = fCat === 'all' || pg === fCat;
      const okRar = fRar === 'all' || rar === fRar;
      const okMat = fMat === 'all' || mat === fMat;

      if (okRar && okMat) {
        catAll++;
        catCounts.set(pg, (catCounts.get(pg) || 0) + 1);
      }
      if (okCat && okMat) rarCounts.set(rar, (rarCounts.get(rar) || 0) + 1);
      if (okCat && okRar && mat) matCounts.set(mat, (matCounts.get(mat) || 0) + 1);
      if (okCat && okRar && okMat) filtered.push(it);
    }
    catCounts.set('all', catAll);
    return { filtered, catCounts, rarCounts, matCounts };
  }

  function sortItems(list, mode = sortMode, ctx = activeCtx) {
    if (mode === 'default' || !Array.isArray(list) || list.length < 2) return list || [];
    const n = list.length;
    const idx = new Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;

    if (mode === 'weight') {
      const w = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const it = list[i];
        w[i] = ctx?.itemWeight ? ctx.itemWeight(it, ctx.itemLine?.(it)) : ((Number(it?.weight) || 0) * (Number(it?.stackCount) || 1));
      }
      idx.sort((a, b) => (w[b] - w[a]) || (a - b));
    } else if (mode === 'value') {
      const v = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const it = list[i];
        v[i] = ctx?.itemValue ? ctx.itemValue(it) : ((Number(it?.value) || 0) * (Number(it?.stackCount) || 1));
      }
      idx.sort((a, b) => (v[b] - v[a]) || (a - b));
    } else if (mode === 'name') {
      const names = new Array(n);
      for (let i = 0; i < n; i++) names[i] = itemNameOf(list[i], ctx);
      const col = COLLATORS[currentLocale()] || COLLATORS.en;
      if (n >= 32) {
        const nRanks = buildCollatorRanks(names, col);
        idx.sort((a, b) => (nRanks[a] - nRanks[b]) || (a - b));
      } else {
        idx.sort((a, b) => {
          const na = names[a], nb = names[b];
          if (na === nb) return a - b;
          return (col ? col.compare(na, nb) : na.localeCompare(nb)) || (a - b);
        });
      }
    } else if (mode === 'rarity') {
      const env = resolveEnvState(ctx, null);
      const ranks = new Int8Array(n);
      for (let i = 0; i < n; i++) {
        ranks[i] = RARITY_RANK_INDEX.get(classifyItem(list[i], ctx, null, env).rar) ?? 0;
      }
      const names = new Array(n);
      const col = COLLATORS[currentLocale()] || COLLATORS.en;
      idx.sort((a, b) => {
        const d = ranks[b] - ranks[a];
        if (d !== 0) return d;
        const na = names[a] !== undefined ? names[a] : (names[a] = itemNameOf(list[a], ctx));
        const nb = names[b] !== undefined ? names[b] : (names[b] = itemNameOf(list[b], ctx));
        if (na === nb) return a - b;
        return (col ? col.compare(na, nb) : na.localeCompare(nb)) || (a - b);
      });
    } else {
      return list;
    }

    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = list[idx[i]];
    return out;
  }

  // ── Store Filter Engine Hooks ──
  function categories(native, pages) {
    const word = new Map();
    if (Array.isArray(native)) {
      for (const entry of native) if (Array.isArray(entry)) word.set(entry[0], entry[1]);
    }
    const pagePairs = Rules?.pages
      ? Rules.pages(pages)
      : INVENTORY_PAGES.map(id => [id, word.get(id) ?? id]);
    const list = [['all', word.get('all') ?? 'All'], ...pagePairs.map(([id, lbl]) => [id, lbl])];
    return Object.freeze(list.map(pair => Object.freeze(pair)));
  }

  function filterItems(items, filter, nameOf, meta, ctx = activeCtx) {
    if (!Array.isArray(items)) return [];
    const f = {
      cat: filter?.cat || 'all',
      rarity: filter?.rarity || 'all',
      material: filter?.material || 'all',
      query: filter?.query || '',
    };
    const env = resolveEnvState(ctx, meta);
    const rarEnabled = env.rarOn;
    const tokens = f.query ? parseQueryTokens(f.query) : null;
    const tokLen = tokens ? tokens.length : 0;
    const tok0 = tokLen === 1 ? tokens[0] : '';
    const out = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it) continue;
      const cls = classifyItem(it, ctx, meta, env);
      if (f.cat !== 'all' && cls.pg !== f.cat) continue;
      if (rarEnabled && f.rarity !== 'all' && cls.rar !== f.rarity) continue;
      if (f.material !== 'all' && cls.mat !== f.material) continue;
      if (tokLen) {
        let cardTxt = containerCardTextOf(it, ctx, meta, env, cls);
        if (!ctx && typeof nameOf === 'function') {
          const fn = normSearchText(nameOf(it));
          if (fn && (!cardTxt || !cardTxt.includes(fn))) cardTxt = cardTxt ? `${cardTxt} ${fn}` : fn;
        }
        if (!cardTxt) continue;
        if (tokLen === 1) {
          if (!cardTxt.includes(tok0)) continue;
        } else {
          let ok = true;
          for (let t = 0; t < tokLen; t++) {
            if (!cardTxt.includes(tokens[t])) { ok = false; break; }
          }
          if (!ok) continue;
        }
      }
      out.push(it);
    }
    return out;
  }

  // ── [O-02] Stack Quantity Modal ──
  function closeQuantityModal() {
    if (!activeQtyModal) return;
    const m = activeQtyModal;
    activeQtyModal = null;
    m.teardown();
  }

  function showQuantityModal({ item, mode = 'take', maxAmount, ctx = activeCtx }) {
    if (!doc?.body || !item || !ctx) return null;
    ctx.hideHoverTip?.();
    try { root.__dfoCharcolV2?.cleanupCharcolTooltips?.(); } catch { /* ignore */ }
    try { root.__dfoPack?.closeSort?.(); } catch { /* ignore */ }
    try { root.__dfoPack?.closeJunk?.(); } catch { /* ignore */ }
    closeOpenDropdowns(activeMount?.col || doc);
    closeQuantityModal();
    ensureStyle();

    const max = Math.max(1, Math.floor(Number(maxAmount) || 1));
    const backdrop = elFn('div', 'dfo-loot-modal-backdrop');
    const box = elFn('div', 'dfo-loot-modal-box');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');

    const head = elFn('div', 'dfo-loot-modal-head');
    head.append(
      elFn('h3', null, itemNameOf(item, ctx)),
      elFn('p', 'dfo-loot-modal-sub', T('container.modal.sub', { max })),
    );

    const body = elFn('div', 'dfo-loot-modal-body');
    const inputRow = elFn('div', 'dfo-loot-modal-inputrow');
    const input = elFn('input', 'dfo-loot-modal-input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.value = '1';
    input.placeholder = '1';
    input.autocomplete = 'off';
    input.spellcheck = false;

    input.addEventListener('input', (e) => {
      e.stopPropagation();
      const clean = input.value.replace(/\D/g, '');
      if (clean !== input.value) input.value = clean;
    });
    input.addEventListener('paste', (e) => {
      e.stopPropagation();
      const text = e.clipboardData?.getData('text') || '';
      const clean = text.replace(/\D/g, '');
      if (clean) {
        e.preventDefault();
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        input.value = input.value.slice(0, start) + clean + input.value.slice(end);
        input.selectionStart = input.selectionEnd = start + clean.length;
      }
    });

    const btnAll = elFn('button', 'dfo-ornate-btn dfo-loot-modal-all', T('container.action.all'));
    btnAll.type = 'button';
    btnAll.onclick = (e) => {
      e.stopPropagation();
      input.value = String(max);
      input.focus?.();
    };
    inputRow.append(input, btnAll);
    body.append(inputRow);

    const foot = elFn('div', 'dfo-loot-modal-foot');
    const btnCancel = elFn('button', 'dfo-ornate-btn silver dfo-loot-modal-btn dfo-loot-modal-cancel', T('container.action.cancel'));
    btnCancel.type = 'button';
    const btnConfirm = elFn(
      'button',
      'dfo-ornate-btn primary dfo-loot-modal-btn',
      mode === 'store' ? T('container.modal.stow') : T('container.modal.take'),
    );
    btnConfirm.type = 'button';
    foot.append(btnCancel, btnConfirm);

    box.append(head, body, foot);
    backdrop.append(box);

    const keyTarget = root?.addEventListener ? root : doc;
    const onKey = (e) => {
      if (!activeQtyModal || activeQtyModal.box !== box) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeQuantityModal();
      } else if (
        e.key === 'Enter'
        && (
          doc.activeElement === input
          || (e.target?.tagName !== 'BUTTON' && doc.activeElement?.tagName !== 'BUTTON' && !e.target?.closest?.('button') && !doc.activeElement?.closest?.('button'))
        )
      ) {
        e.preventDefault();
        e.stopPropagation();
        confirm();
      } else if (e.key !== 'Tab' && !e.target?.closest?.('input, textarea') && !e.target?.closest?.('button')) {
        e.stopPropagation();
      }
    };
    const teardown = () => {
      keyTarget.removeEventListener('keydown', onKey, true);
      backdrop.remove();
    };
    const confirm = () => {
      const parsed = parseInt(input.value, 10);
      const qty = Number.isFinite(parsed) ? Math.max(1, Math.min(max, parsed)) : 1;
      closeQuantityModal();
      if (mode === 'store') ctx.stowItem(item, qty);
      else ctx.takeItem(item, qty);
    };

    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); confirm(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeQuantityModal(); }
    });
    input.addEventListener('keyup', (e) => e.stopPropagation());
    input.addEventListener('keypress', (e) => e.stopPropagation());
    btnCancel.onclick = (e) => { e.stopPropagation(); closeQuantityModal(); };
    btnConfirm.onclick = (e) => { e.stopPropagation(); confirm(); };
    backdrop.onclick = (e) => { if (e.target === backdrop) closeQuantityModal(); };

    keyTarget.addEventListener('keydown', onKey, true);
    doc.body.append(backdrop);
    activeQtyModal = { mode, backdrop, box, input, btnConfirm, btnCancel, btnAll, confirm, teardown };

    setTimeout(() => {
      if (!input.isConnected) return;
      input.focus?.();
      input.select?.();
    }, 0);
    return activeQtyModal;
  }

  // ── Widgets & Helpers ──
  function buildPlayerGoldWidget(ctx) {
    const box = elFn('div', 'dfo-loot-gold');
    const pocketGold = Math.max(0, Math.floor(Number(ctx.pocketGold) || 0));
    const formatted = pocketGold.toLocaleString(currentLocale() === 'ru' ? 'ru-RU' : 'en-US');
    const tipStr = T('container.gold.tip', { g: formatted });
    box.title = tipStr;
    box.setAttribute('aria-label', tipStr);
    box.append(svgIcon(UI_ICONS.gold, 'dfo-gold-icon', 15), elFn('span', 'v', formatted));
    return box;
  }

  function buildPlayerCarryWidget(ctx) {
    const box = elFn('div', 'dfo-loot-carry packcarry');
    const head = elFn('div', 'dfo-carry-head');
    head.append(svgIcon(UI_ICONS.weight, 'dfo-carry-icon', 16));

    const fmtKg = (v) => Number(Math.abs(v).toFixed(1)).toString();
    const curWt = Math.round((Number(ctx.carryNow) || 0) * 10) / 10;
    const rawMax = Number(ctx.carryMax) || 0;
    const maxWt = Math.max(1, Math.round((rawMax || 1) * 10) / 10);
    const diff = Math.round((maxWt - curWt) * 10) / 10;
    const isOver = rawMax > 0 ? curWt > maxWt : false;
    const pct = rawMax <= 0 ? 0 : (isOver ? 100 : Math.min(100, Math.max(0, (curWt / maxWt) * 100)));
    const unit = T('container.unit.kg');

    box.classList.toggle('is-overweight', isOver);
    const tipStr = isOver
      ? T('container.carry.tipOver', { cur: fmtKg(curWt), max: fmtKg(maxWt), over: fmtKg(diff), u: unit })
      : T('container.carry.tipFree', { cur: fmtKg(curWt), max: fmtKg(maxWt), free: fmtKg(diff), u: unit });
    box.title = tipStr;
    box.setAttribute('aria-label', tipStr);

    const valEl = elFn('span', 'v', rawMax > 0 ? `${fmtKg(curWt)} / ${fmtKg(maxWt)} ${unit}` : `${fmtKg(curWt)} ${unit}`);
    const freeEl = elFn('span', `dfo-carry-free${isOver ? ' is-over' : ''}`, isOver ? `\u2212${fmtKg(diff)} ${unit}` : `+${fmtKg(diff)} ${unit}`);
    if (rawMax > 0) head.append(valEl, freeEl);
    else head.append(valEl);

    const meter = elFn('div', 'px-meter');
    const fill = elFn('div', 'px-fill');
    fill.style.backgroundImage = 'linear-gradient(180deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0.03) 50%, rgba(0,0,0,0.26) 100%)';
    fill.style.width = `${Math.round(pct)}%`;
    fill.style.backgroundColor = carryFillColor(pct);
    meter.append(fill);
    box.append(head, meter);
    return box;
  }

  function itemSummaryLine(it, ctx) {
    if (!it) return '';
    const line = ctx?.itemLine?.(it) || {};
    const parts = [];
    if (line.damage) parts.push(`${T('container.search.word.damage')}: ${line.damage}`);
    if (line.armour) parts.push(`${T('container.search.word.armor')}: ${line.armour}`);
    const effects = ctx?.itemEffects?.(it, { set: false, lore: false, technique: true });
    if (Array.isArray(effects) && effects.length) {
      for (const ef of effects) {
        if (!ef) continue;
        const clean = String(ef)
          .replace(/^(?:Cast When (?:Strikes|Held|Used)):\s*/i, '')
          .trim();
        if (clean && !parts.includes(clean)) parts.push(trGame(clean));
        if (parts.length >= 4) break;
      }
    }
    return parts.join(' \u00b7 ');
  }

  function closeOpenDropdowns(rootEl, exceptWrap = null) {
    if (!rootEl) return;
    for (const node of rootEl.querySelectorAll('.dfo-loot-dd.is-open')) {
      if (node === exceptWrap) continue;
      node.classList.remove('is-open');
      node.querySelector('.dfo-loot-dd-btn')?.setAttribute('aria-expanded', 'false');
    }
  }

  function cleanupActiveMount() {
    if (!activeMount) return;
    activeMount.unmountMenuListener?.();
    activeMount.disconnectResize?.();
    activeMount = null;
  }

  // ── Reward Window (R.kind === 'reward') ──
  function buildRewardWindow(ctx) {
    cleanupActiveMount();
    const R = ctx.remote;
    const items = Array.isArray(R.items) ? R.items : [];
    if (!items.includes(rewardPick)) rewardPick = items[0] || null;

    const col = elFn('section', 'packcol packremote dfo-reward-col');

    const head = elFn('div', 'remotehead dfo-reward-head');
    const who = elFn('div', 'remotewho');
    who.append(
      elFn('h3', null, R.title || T('container.title.reward')),
      elFn('p', 'meta', T('container.reward.sub')),
    );
    const badge = elFn('span', 'dfo-chip chip-gold dfo-reward-badge', T('container.reward.badge'));
    head.append(who, badge);
    col.append(head);

    const banner = elFn('div', 'dfo-reward-banner');
    banner.append(
      svgIcon(UI_ICONS.trophy, 'dfo-reward-banner-ico', 20),
      elFn('p', 'dfo-reward-banner-txt', T('container.reward.banner')),
    );
    col.append(banner);

    const listBox = elFn('div', 'remotelist dfo-reward-list');
    const prev = elFn('div', 'dfo-reward-preview');
    const foot = elFn('footer', 'dfo-loot-foot');
    const footRow = elFn('div', 'dfo-loot-foot-row');
    let claimBtn = null;

    const rowsByItem = new Map();

    function syncRewardSelectionUI() {
      const picked = items.includes(rewardPick) ? rewardPick : null;
      for (const [it, entry] of rowsByItem.entries()) {
        const isSel = it === picked;
        entry.row.classList.toggle('on', isSel);
        entry.row.setAttribute('aria-selected', String(isSel));
        entry.check.classList.toggle('on', isSel);
        entry.check.textContent = isSel ? '\u25c6' : '';
      }
      prev.replaceChildren();
      prev.classList.toggle('has-pick', !!picked);
      if (picked) {
        const rar = rarityOf(picked, ctx);
        const colHex = RARITY_ACCENT_COLORS[rar] || '#c08a3e';
        prev.style.setProperty('--dfo-prev-rar', colHex);
        const lead = elFn('div', 'dfo-reward-prev-lead');
        lead.append(elFn('span', 'dfo-reward-prev-k', T('container.reward.selected')));
        if (RARITY_ICONS[rar]) lead.append(svgIcon(RARITY_ICONS[rar], 'dfo-dd-ico', 14));
        const pName = elFn('span', 'dfo-reward-prev-name', itemNameOf(picked, ctx));
        pName.style.color = colHex === RARITY_ACCENT_COLORS.common ? '#f6e7b0' : colHex;
        lead.append(pName);
        const tail = elFn('span', 'dfo-reward-prev-tier', T(`container.rarity.${rar}`));
        prev.append(lead, tail);
      } else {
        prev.append(elFn('span', 'dfo-reward-prev-none', T('container.reward.none')));
      }
      if (claimBtn) claimBtn.disabled = !picked;
    }

    if (!items.length) {
      const emptyBox = elFn('div', 'dfo-reward-empty');
      emptyBox.append(elFn('p', 'packempty', T('container.empty.default')));
      listBox.append(emptyBox);
    } else {
      for (const it of items) {
        const row = ctx.buildItemRow(it, 'remote');
        row.classList.add('dfo-reward-row');
        const summary = itemSummaryLine(it, ctx);
        const nameBox = row.querySelector('.itemname');
        if (nameBox && summary) nameBox.append(elFn('small', 'dfo-reward-bonuses', summary));
        const check = elFn('span', 'dfo-reward-radio', '');
        check.setAttribute('aria-hidden', 'true');
        row.append(check);
        row.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          ctx.takeItem(it, null);
        });
        rowsByItem.set(it, { row, check });
        listBox.append(row);
      }
    }
    col.append(listBox);

    if (items.length) {
      col.append(prev);
      claimBtn = elFn('button', 'act dfo-ornate-btn primary dfo-reward-claim', T('container.reward.claim'));
      claimBtn.type = 'button';
      claimBtn.onclick = (e) => {
        e.stopPropagation();
        if (rewardPick && items.includes(rewardPick)) ctx.takeItem(rewardPick, null);
      };
      footRow.append(claimBtn);
      syncRewardSelectionUI();
    } else {
      footRow.append(elFn('span', 'dfo-loot-foot-spacer'));
    }

    footRow.append(elFn('div', 'dfo-loot-foot-meta', T('container.reward.count', { n: items.length })));
    const closeBtn = elFn('button', 'act dfo-ornate-btn dfo-close-btn dfo-loot-close', T('container.action.close'));
    closeBtn.type = 'button';
    closeBtn.onclick = (e) => { e.stopPropagation(); ctx.close(); };
    footRow.append(closeBtn);
    foot.append(footRow, elFn('div', 'dfo-loot-foot-hint', T('container.reward.hint')));
    col.append(foot);

    activeMount = {
      kind: 'reward',
      syncRewardSelection(it) {
        rewardPick = it;
        syncRewardSelectionUI();
      },
    };
    return col;
  }

  // ── Fate Window (R.kind === 'fate') ──
  function buildFateWindow(ctx) {
    cleanupActiveMount();
    const f = ctx.deps?.fate;
    if (!f) return null;
    ctx.fateEnsureStyle?.();

    const choice = ctx.fateChoice?.() ?? null;
    const col = elFn('section', 'packcol packremote fatecol dfo-fate-col');

    const head = elFn('div', 'remotehead dfo-fate-head');
    const who = elFn('div', 'remotewho');
    who.append(elFn('h3', null, f.name || T('container.title.fate')));
    if (f.sub) who.append(elFn('p', 'meta', f.sub));
    head.append(who);
    if (f.mood) head.append(elFn('span', 'dfo-chip chip-amber dfo-fate-mood-chip', f.mood));
    col.append(head);

    if (f.plea?.speech || f.plea?.body) {
      const lorePanel = elFn('div', 'dfo-fate-lore');
      if (f.plea.speech) {
        lorePanel.append(elFn('blockquote', 'dfo-fate-plea', `\u00ab${f.plea.speech}\u00bb`));
      }
      if (f.plea.body) lorePanel.append(elFn('p', 'dfo-fate-body', f.plea.body));
      col.append(lorePanel);
    }

    const list = elFn('div', 'fatelist dfo-fate-list');
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', f.name || T('container.title.fate'));

    const options = Array.isArray(f.options) ? f.options : [];
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      if (!opt) continue;
      const isKill = opt.id === 'kill';
      const isSel = choice === opt.id;
      const card = elFn('button', `itemrow fate-opt dfo-fate-card is-${opt.id}${isSel ? ' on' : ''}`);
      card.type = 'button';
      card.setAttribute('role', 'option');
      card.setAttribute('aria-selected', String(isSel));
      if (opt.disabled) card.disabled = true;

      const face = elFn('span', `fate-face dfo-fate-face${isKill ? '' : ' is-spare'}`);
      const copy = elFn('span', 'itemname dfo-fate-copy');
      const topRow = elFn('span', 'dfo-fate-toprow');
      topRow.append(
        elFn('span', `fate-verb dfo-fate-verb is-${opt.id}`, opt.verb || opt.label || ''),
        elFn('span', `dfo-chip ${isKill ? 'chip-red' : 'chip-teal'} dfo-fate-tag`, isKill ? T('container.fate.trophyTag') : T('container.fate.mercyTag')),
      );

      const titleRow = elFn('span', 'dfo-fate-titlerow');
      if (isKill && f.trophy) {
        const tRar = rarityOf(f.trophy, ctx);
        ctx.fateTrophyTile?.(card, face, f.trophy);
        if (RARITY_ICONS[tRar]) titleRow.append(svgIcon(RARITY_ICONS[tRar], 'dfo-dd-ico', 14));
        titleRow.append(elFn('span', 'fate-trophy', opt.title || itemNameOf(f.trophy, ctx)));
      } else {
        const hasPortrait = ctx.fatePortrait?.(face, f.portrait);
        if (!hasPortrait) face.append(svgIcon(UI_ICONS.mercy, 'dfo-fate-mercy-ico', 28));
        titleRow.append(elFn('span', 'dfo-fate-spare-title', opt.title || opt.label || ''));
      }

      copy.append(topRow, titleRow);
      if (opt.detail) copy.append(elFn('small', 'dfo-fate-desc', opt.detail));

      const keyCap = elFn('span', 'fate-key dfo-fate-key', opt.key || String(i + 1));
      card.append(face, copy, keyCap);
      card.onclick = (e) => {
        e.stopPropagation();
        if (opt.disabled) return;
        if (ctx.fateChoice?.() === opt.id) ctx.fateChoose?.(opt.id);
        else ctx.fatePick?.(opt.id);
      };
      list.append(card);
    }
    col.append(list);

    const chosenOpt = choice ? options.find(o => o.id === choice && !o.disabled) : null;
    const conf = elFn('div', `fate-confirm dfo-fate-confirm${chosenOpt ? ` is-${chosenOpt.id}` : ''}`);
    if (chosenOpt) {
      const isKill = chosenOpt.id === 'kill';
      conf.append(elFn('p', 'dfo-fate-confirm-txt', chosenOpt.confirm || chosenOpt.detail || chosenOpt.title || ''));
      const acts = elFn('div', 'acts');
      const ok = elFn('button', `act dfo-ornate-btn ${isKill ? 'danger' : 'primary'}`, chosenOpt.verb || chosenOpt.label || chosenOpt.title || '');
      ok.type = 'button';
      ok.onclick = (e) => { e.stopPropagation(); ctx.fateChoose?.(chosenOpt.id); };
      const no = elFn('button', 'act dfo-ornate-btn silver', T('container.action.cancel'));
      no.type = 'button';
      no.onclick = (e) => { e.stopPropagation(); ctx.fatePick?.(null); };
      acts.append(ok, no);
      conf.append(acts);
    } else {
      conf.append(elFn('p', 'dfo-fate-confirm-idle', T('container.fate.promptIdle')));
    }
    col.append(conf);

    const foot = elFn('footer', 'dfo-loot-foot dfo-fate-foot');
    const footRow = elFn('div', 'dfo-loot-foot-row');
    footRow.append(elFn('div', 'dfo-loot-foot-meta dfo-fate-foot-meta', T('container.fate.hint', { leave: f.leaveKey || T('container.fate.leaveKey') })));
    const closeBtn = elFn('button', 'act dfo-ornate-btn dfo-close-btn dfo-loot-close', T('container.action.close'));
    closeBtn.type = 'button';
    closeBtn.onclick = (e) => { e.stopPropagation(); ctx.close(); };
    footRow.append(closeBtn);
    foot.append(footRow);
    col.append(foot);

    activeMount = { kind: 'fate' };
    return col;
  }

  // ── Standard Containers (container, storage, wagon, bag, ground) ──
  function buildStandardWindow(ctx) {
    cleanupActiveMount();
    const R = ctx.remote;
    const isNearby = !!ctx.deps?.loot?.nearby;
    const sessionKey = `${R.kind}|${R.pile?.current ?? ''}|${isNearby ? 1 : 0}`;
    if (sessionKey !== activeSessionKey) {
      savedRemoteScrollTop = 0;
      activeSessionKey = sessionKey;
    }

    if (ctx.filter?.kind !== R.kind) ctx.resetFilter?.(R.kind);

    const items = Array.isArray(R.items) ? R.items : [];
    const col = elFn('section', 'packcol packremote');

    if (R.pile && typeof ctx.buildPileTabs === 'function') {
      const pileEl = ctx.buildPileTabs(R.pile);
      if (pileEl) col.append(pileEl);
    }

    // 1. Header + Optional Nearby Loot Toolbar
    const head = elFn('div', `remotehead${isNearby ? ' has-nearby' : ''}`);
    const who = elFn('div', 'remotewho');
    who.append(elFn('h3', null, R.title || T(`container.title.${R.kind}`)));
    head.append(who);
    if (isNearby && root.__dfoLootUI?.toolbar) {
      root.__dfoLootUI.toolbar(head, ctx.deps.loot, () => ctx.refreshAndRender(), {
        shown: () => lastFiltered,
        close: () => ctx.close(),
        notice: (txt) => ctx.setNotice(txt),
      });
    }
    col.append(head);

    // 2. Top Utility Bar (Wagon, Bag, Vault, Sort | Pocket Gold | Carry Weight)
    const utilBar = elFn('div', 'dfo-loot-utilbar');
    const utilLeft = elFn('div', 'dfo-loot-util-left');

    if (ctx.hasWagon?.()) {
      const isWagon = R.kind === 'wagon';
      const wLabel = isWagon ? T('container.action.leaveWagon') : T('container.action.wagon');
      const wBtn = elFn('button', `act dfo-ornate-btn dfo-loot-icon-btn dfo-loot-wagon${isWagon ? ' on' : ''}`);
      wBtn.type = 'button';
      wBtn.title = wLabel;
      wBtn.setAttribute('aria-label', wLabel);
      wBtn.setAttribute('aria-pressed', String(isWagon));
      wBtn.append(svgIcon(UI_ICONS.wagon, 'dfo-util-ico', 20));
      wBtn.onclick = (e) => { e.stopPropagation(); ctx.toggleWagon(); };
      utilLeft.append(wBtn);
    }
    if (ctx.canBag?.()) {
      const isBag = R.kind === 'bag';
      const bLabel = isBag ? T('container.action.closeBag') : T('container.action.bag');
      const bBtn = elFn('button', `act dfo-ornate-btn dfo-loot-icon-btn dfo-loot-bag${isBag ? ' on' : ''}`);
      bBtn.type = 'button';
      bBtn.title = bLabel;
      bBtn.setAttribute('aria-label', bLabel);
      bBtn.setAttribute('aria-pressed', String(isBag));
      bBtn.append(svgIcon(UI_ICONS.bag, 'dfo-util-ico', 20));
      bBtn.onclick = (e) => { e.stopPropagation(); ctx.toggleBag(); };
      utilLeft.append(bBtn);
    }
    if (R.kind === 'storage' && typeof ctx.deps?.loot?.vaultPour === 'function') {
      const vBtn = elFn('button', 'act dfo-ornate-btn dfo-loot-vault', T('container.action.fromVault'));
      vBtn.type = 'button';
      vBtn.onclick = (e) => {
        e.stopPropagation();
        vBtn.disabled = true;
        Promise.resolve(ctx.deps.loot.vaultPour()).then((res) => {
          vBtn.disabled = false;
          if (res?.length) ctx.refreshAndRender();
        }, () => { vBtn.disabled = false; });
      };
      utilLeft.append(vBtn);
    }

    const sortLbl = T(`container.sort.${sortMode}`);
    const sortBtn = elFn('button', `act dfo-ornate-btn dfo-loot-sort${sortMode !== 'default' ? ' on' : ''}`, sortLbl);
    sortBtn.type = 'button';
    sortBtn.title = sortLbl;
    sortBtn.setAttribute('aria-label', sortLbl);
    utilLeft.append(sortBtn);

    utilBar.append(utilLeft, buildPlayerGoldWidget(ctx), buildPlayerCarryWidget(ctx));
    col.append(utilBar);

    // 3. Filter Panel (.storefilter — always present to keep geometry stable)
    const filterPanel = elFn('div', 'storefilter');
    const searchBar = elFn('div', 'dfo-find-bar dfo-loot-search');
    searchBar.append(svgIcon(UI_ICONS.search, 'dfo-find-ico', 15));

    const search = elFn('input', 'dfo-find-input storesearch');
    search.type = 'search';
    search.maxLength = 120;
    search.dataset.focus = 'store-filter';
    search.placeholder = T('container.search.placeholder');
    search.setAttribute('aria-label', T('container.search.aria'));
    search.value = ctx.filter.query || '';

    const findCountEl = elFn('span', 'dfo-find-count', `${items.length}/${items.length}`);
    const findClearBtn = elFn('button', 'dfo-find-clear', '\u2715');
    findClearBtn.type = 'button';
    findClearBtn.title = T('container.search.clear');
    findClearBtn.setAttribute('aria-label', T('container.search.clear'));
    findClearBtn.hidden = !search.value.length;
    searchBar.append(search, findCountEl, findClearBtn);

    function createCustomDropdown(cls, ariaLabel, onPick) {
      const wrap = elFn('div', `dfo-loot-dd ${cls}`);
      const btn = elFn('button', 'act dfo-ornate-btn dfo-loot-dd-btn');
      btn.type = 'button';
      btn.setAttribute('aria-haspopup', 'listbox');
      btn.setAttribute('aria-expanded', 'false');
      if (ariaLabel) btn.setAttribute('aria-label', ariaLabel);

      const lead = elFn('span', 'dfo-dd-lead');
      const tail = elFn('span', 'dfo-dd-tail');
      btn.append(lead, tail);

      const menu = elFn('div', 'dfo-loot-dd-menu');
      menu.setAttribute('role', 'listbox');
      if (ariaLabel) menu.setAttribute('aria-label', ariaLabel);
      wrap.append(btn, menu);

      let currentOptions = [];
      let currentValue = 'all';
      let menuDirty = true;

      function populateMenu() {
        if (!menuDirty) return;
        menuDirty = false;
        const frag = doc.createDocumentFragment();
        for (const opt of currentOptions) {
          const isSel = opt.value === currentValue;
          const row = elFn('button', `dfo-loot-dd-opt${isSel ? ' is-selected' : ''}`);
          row.type = 'button';
          row.setAttribute('role', 'option');
          row.setAttribute('aria-selected', String(isSel));
          row.dataset.value = opt.value;
          if (opt.accentColor) row.style.setProperty('--dfo-opt-c', opt.accentColor);

          const optLead = elFn('span', 'dfo-opt-lead');
          if (opt.rarity && RARITY_ICONS[opt.rarity]) {
            optLead.append(svgIcon(RARITY_ICONS[opt.rarity], 'dfo-dd-ico', 14));
          } else if (opt.dotColor) {
            const pip = elFn('span', 'dfo-dd-pip');
            pip.style.setProperty('--dfo-pip-c', opt.dotColor);
            optLead.append(pip);
          }
          const optLbl = elFn('span', 'dfo-opt-label', opt.label);
          if (opt.accentColor && opt.value !== 'all') optLbl.style.color = opt.accentColor;
          optLead.append(optLbl);

          const optTail = elFn('span', 'dfo-opt-tail');
          if (opt.count != null) optTail.append(elFn('span', 'dfo-opt-count', String(opt.count)));
          else if (isSel) optTail.append(elFn('span', 'dfo-opt-check', '\u25c6'));

          row.append(optLead, optTail);
          row.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            wrap.classList.remove('is-open');
            btn.setAttribute('aria-expanded', 'false');
            if (opt.value !== currentValue) onPick(opt.value);
          };
          frag.append(row);
        }
        menu.replaceChildren(frag);
      }

      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const willOpen = !wrap.classList.contains('is-open');
        closeOpenDropdowns(col, wrap);
        if (willOpen) populateMenu();
        wrap.classList.toggle('is-open', willOpen);
        btn.setAttribute('aria-expanded', String(willOpen));
        if (willOpen) menu.querySelector('.dfo-loot-dd-opt.is-selected')?.scrollIntoView?.({ block: 'nearest' });
      };

      btn.onkeydown = (e) => {
        if (e.key === 'Escape' && wrap.classList.contains('is-open')) {
          e.preventDefault();
          e.stopPropagation();
          wrap.classList.remove('is-open');
          btn.setAttribute('aria-expanded', 'false');
          return;
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          if (!currentOptions.length) return;
          const idx = Math.max(0, currentOptions.findIndex(o => o.value === currentValue));
          const nextIdx = e.key === 'ArrowDown' ? Math.min(currentOptions.length - 1, idx + 1) : Math.max(0, idx - 1);
          const nextOpt = currentOptions[nextIdx];
          if (nextOpt && nextOpt.value !== currentValue) onPick(nextOpt.value);
        }
      };

      wrap.addEventListener?.('focusout', (e) => {
        if (!wrap.classList.contains('is-open')) return;
        const next = e?.relatedTarget;
        if (!next || wrap.contains?.(next)) return;
        wrap.classList.remove('is-open');
        btn.setAttribute('aria-expanded', 'false');
      });

      function setOptions(options, activeVal) {
        currentOptions = options;
        currentValue = activeVal;
        menuDirty = true;
        wrap.dataset.value = activeVal;
        const activeOpt = options.find(o => o.value === activeVal) || options[0] || { value: 'all', label: '', count: null };
        const isFiltered = activeVal !== 'all';
        wrap.classList.toggle('is-filtered', isFiltered);
        btn.classList.toggle('on', isFiltered);

        lead.replaceChildren();
        if (activeOpt.rarity && RARITY_ICONS[activeOpt.rarity]) {
          lead.append(svgIcon(RARITY_ICONS[activeOpt.rarity], 'dfo-dd-ico', 14));
        } else if (activeOpt.dotColor) {
          const pip = elFn('span', 'dfo-dd-pip');
          pip.style.setProperty('--dfo-pip-c', activeOpt.dotColor);
          lead.append(pip);
        }
        const lbl = elFn('span', 'dfo-dd-label', activeOpt.label);
        if (activeOpt.accentColor && isFiltered) lbl.style.color = activeOpt.accentColor;
        lead.append(lbl);

        tail.replaceChildren();
        if (activeOpt.count != null) tail.append(elFn('span', 'dfo-dd-count', String(activeOpt.count)));
        tail.append(svgIcon(UI_ICONS.caret, 'dfo-dd-caret', 12));

        if (wrap.classList.contains('is-open')) populateMenu();
      }

      return { wrap, setOptions };
    }

    const menus = elFn('div', 'storemenus');
    const showRarity = ctx.rarityOn ? !!ctx.rarityOn() : true;
    const ddCat = createCustomDropdown('storecat', T('container.cat.all'), (val) => {
      cancelProgressiveSearch();
      ctx.filter.cat = val;
      updateRemote({ preserveScroll: false });
    });
    const ddRar = showRarity
      ? createCustomDropdown('storerarity', T('container.rarity.all'), (val) => {
        cancelProgressiveSearch();
        ctx.filter.rarity = val;
        updateRemote({ preserveScroll: false });
      })
      : null;
    const ddMat = createCustomDropdown('storemat', T('container.mat.all'), (val) => {
      cancelProgressiveSearch();
      ctx.filter.material = val;
      updateRemote({ preserveScroll: false });
    });
    menus.append(ddCat.wrap);
    if (ddRar) menus.append(ddRar.wrap);
    menus.append(ddMat.wrap);

    filterPanel.append(searchBar, menus);
    col.append(filterPanel);

    // 4. Item List Well (.remotelist)
    const listBox = elFn('div', 'remotelist');
    listBox.addEventListener('scroll', () => {
      savedRemoteScrollTop = listBox.scrollTop;
    }, { passive: true });
    col.append(listBox);

    // 5. Footer
    const foot = elFn('footer', 'dfo-loot-foot');
    const footRow = elFn('div', 'dfo-loot-foot-row');
    let takeAllBtn = null;
    if (!isNearby && ctx.isStowableKind?.(R.kind)) {
      takeAllBtn = elFn('button', 'act dfo-ornate-btn primary dfo-loot-takeall', T('container.action.takeAll'));
      takeAllBtn.type = 'button';
      takeAllBtn.disabled = items.length === 0;
      takeAllBtn.onclick = (e) => { e.stopPropagation(); ctx.takeAll(); };
      footRow.append(takeAllBtn);
    } else {
      footRow.append(elFn('span', 'dfo-loot-foot-spacer'));
    }

    const countStr = T('container.meta.count', { n: R.count });
    const unit = T('container.unit.kg');
    const wtNum = Number(R.weight) || 0;
    const wtStr = R.capacity != null ? `${wtNum.toFixed(2)} / ${R.capacity} ${unit}` : `${wtNum.toFixed(2)} ${unit}`;
    footRow.append(elFn('div', 'dfo-loot-foot-meta', T('container.meta.line', { count: countStr, wt: wtStr })));

    const closeBtn = elFn('button', 'act dfo-ornate-btn dfo-close-btn dfo-loot-close', T('container.action.close'));
    closeBtn.type = 'button';
    closeBtn.onclick = (e) => { e.stopPropagation(); ctx.close(); };
    footRow.append(closeBtn);
    foot.append(footRow, elFn('div', 'dfo-loot-foot-hint', T('container.hint.transfer')));
    col.append(foot);

    function applyFilterControls(snap) {
      const catOpts = STORE_CATEGORIES.map(c => ({
        value: c,
        label: T(`container.cat.${c}`),
        count: snap.catCounts.get(c) || 0,
        accentColor: c === 'all' ? '#9a9079' : '#c08a3e',
      }));
      ddCat.setOptions(catOpts, ctx.filter.cat || 'all');

      if (ddRar) {
        const rarOpts = [{ value: 'all', label: T('container.rarity.all'), count: null, accentColor: '#9a9079' }];
        for (const r of RARITY_RANKS) {
          const n = snap.rarCounts.get(r) || 0;
          if (n === 0 && ctx.filter.rarity !== r) continue;
          rarOpts.push({
            value: r,
            label: T(`container.rarity.${r}`),
            count: n,
            rarity: r,
            accentColor: RARITY_ACCENT_COLORS[r] || '#c08a3e',
          });
        }
        ddRar.setOptions(rarOpts, ctx.filter.rarity || 'all');
      }

      const matOpts = [{ value: 'all', label: T('container.mat.all'), count: null, accentColor: '#9a9079' }];
      for (const m of MATERIALS_FILTER) {
        const n = snap.matCounts.get(m) || 0;
        if (n === 0 && ctx.filter.material !== m) continue;
        matOpts.push({
          value: m,
          label: T(`container.mat.${m}`),
          count: n,
          dotColor: MATERIAL_ACCENT_COLORS[m] || '#c08a3e',
          accentColor: MATERIAL_ACCENT_COLORS[m] || '#c08a3e',
        });
      }
      ddMat.setOptions(matOpts, ctx.filter.material || 'all');
    }

    let currentVHandle = null;
    let lastSnap = null;
    let lastSnapKey = '';
    function updateRemote({ preserveScroll = false, restoreScrollTop = null } = {}) {
      if (!preserveScroll && restoreScrollTop == null) savedRemoteScrollTop = 0;
      const env = resolveEnvState(ctx, null);
      const snapKey = `${env.seq}|${items.length}|${ctx.filter.cat || 'all'}|${ctx.filter.rarity || 'all'}|${ctx.filter.material || 'all'}|${ctx.filter.query || ''}`;
      let snap;
      if (lastSnap && lastSnapKey === snapKey) {
        snap = lastSnap;
      } else {
        snap = computeFilterSnapshot(items, ctx.filter, ctx);
        lastSnap = snap;
        lastSnapKey = snapKey;
        applyFilterControls(snap);
      }
      const sorted = sortItems(snap.filtered, sortMode, ctx);
      lastFiltered = sorted;

      currentVHandle = ctx.mountRemoteList(listBox, sorted, preserveScroll, restoreScrollTop);
      if (!sorted.length) {
        const emptyMsg = !items.length
          ? (R.kind === 'ground' ? T('container.empty.ground') : T('container.empty.default'))
          : T('container.empty.filtered');
        listBox.replaceChildren(elFn('p', 'packempty', emptyMsg));
      }
      findCountEl.textContent = `${sorted.length}/${items.length}`;
      findClearBtn.hidden = !(ctx.filter.query || '').length;
      if (takeAllBtn) takeAllBtn.disabled = sorted.length === 0;
      if (activeMount) activeMount.vHandle = currentVHandle;
    }

    let searchTimer = 0;
    const commitQuery = () => {
      if (searchTimer) { clearTimeout(searchTimer); searchTimer = 0; }
      cancelProgressiveSearch();
      if (!col.isConnected) return;
      ctx.filter.query = search.value;
      const q = ctx.filter.query || '';
      if (q && items.length > 1500) {
        const workId = ++activeSearchWorkId;
        const env = resolveEnvState(ctx, null);
        const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
        let idx = 0;
        const n = items.length;
        while (idx < n) {
          const it = items[idx];
          if (it) containerCardTextOf(it, ctx, null, env);
          idx++;
          if ((idx & 63) === 0 && (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start > 16) break;
        }
        if (idx < n) {
          findCountEl.textContent = `.../${n}`;
          findClearBtn.hidden = false;
          const step = () => {
            activeSearchTimer = 0;
            activeSearchIsRaf = false;
            if (workId !== activeSearchWorkId || !col.isConnected) return;
            const s = typeof performance !== 'undefined' ? performance.now() : Date.now();
            while (idx < n) {
              const it = items[idx];
              if (it) containerCardTextOf(it, ctx, null, env);
              idx++;
              if ((idx & 63) === 0 && (typeof performance !== 'undefined' ? performance.now() : Date.now()) - s > 14) break;
            }
            if (idx < n) {
              if (typeof root.requestAnimationFrame === 'function') {
                activeSearchIsRaf = true;
                activeSearchTimer = root.requestAnimationFrame(step);
              } else {
                activeSearchIsRaf = false;
                activeSearchTimer = setTimeout(step, 0);
              }
            } else {
              updateRemote({ preserveScroll: false });
            }
          };
          if (typeof root.requestAnimationFrame === 'function') {
            activeSearchIsRaf = true;
            activeSearchTimer = root.requestAnimationFrame(step);
          } else {
            activeSearchIsRaf = false;
            activeSearchTimer = setTimeout(step, 0);
          }
          return;
        }
      }
      updateRemote({ preserveScroll: false });
    };
    search.oninput = () => {
      ctx.filter.query = search.value;
      findClearBtn.hidden = !search.value.length;
      const delay = !search.value ? 0 : (items.length > 1500 ? 110 : items.length > 200 ? 60 : 0);
      if (delay > 0) {
        cancelProgressiveSearch();
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(commitQuery, delay);
      } else {
        commitQuery();
      }
    };
    search.onkeydown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (search.value) {
          search.value = '';
          commitQuery();
        } else {
          search.blur?.();
        }
      }
    };
    findClearBtn.onclick = (e) => {
      e.stopPropagation();
      search.value = '';
      commitQuery();
      search.focus?.({ preventScroll: true });
    };

    sortBtn.onclick = (e) => {
      e.stopPropagation();
      cancelProgressiveSearch();
      sortMode = SORT_MODES[(SORT_MODES.indexOf(sortMode) + 1) % SORT_MODES.length];
      const nextLbl = T(`container.sort.${sortMode}`);
      sortBtn.textContent = nextLbl;
      sortBtn.title = nextLbl;
      sortBtn.setAttribute('aria-label', nextLbl);
      sortBtn.classList.toggle('on', sortMode !== 'default');
      updateRemote({ preserveScroll: false });
    };

    const onDocDown = (e) => {
      if (!e.target?.closest?.('.dfo-loot-dd')) closeOpenDropdowns(col);
    };
    doc?.addEventListener?.('pointerdown', onDocDown, true);

    updateRemote({ restoreScrollTop: savedRemoteScrollTop });

    activeMount = {
      kind: R.kind,
      col,
      listBox,
      vHandle: currentVHandle,
      lastListWidth: 0,
      unmountMenuListener() {
        cancelProgressiveSearch();
        if (searchTimer) { clearTimeout(searchTimer); searchTimer = 0; }
        doc?.removeEventListener?.('pointerdown', onDocDown, true);
      },
      restoreScrollBeforeSync() {
        if (savedRemoteScrollTop > 0 && listBox.isConnected) {
          listBox.scrollTop = savedRemoteScrollTop;
        }
      },
      restoreScrollAfterMount() {
        if (savedRemoteScrollTop > 0 && listBox.isConnected) {
          if (Math.abs(listBox.scrollTop - savedRemoteScrollTop) > 1) {
            listBox.scrollTop = savedRemoteScrollTop;
          }
          currentVHandle?.sync?.();
        }
        if (activeMount && !activeMount.lastListWidth) activeMount.lastListWidth = listBox.clientWidth || 0;
      },
      disconnectResize: null,
    };
    return col;
  }

  // ── Public Lifecycle & Interaction Hooks ──
  function prepareAside(asideEl, kind, paired) {
    if (!asideEl) return;
    asideEl.dataset.dfoLootKind = kind || 'container';
    asideEl.classList.toggle('dfo-reward-win', kind === 'reward');
    asideEl.classList.toggle('dfo-fate-win', kind === 'fate');
    if (paired && STANDARD_KINDS.has(kind) && lastPairedLootH) {
      asideEl.style.setProperty('--dfo-paired-loot-h', lastPairedLootH);
    }
  }

  function restoreScrollBeforeSync() {
    activeMount?.restoreScrollBeforeSync?.();
  }
  function buildRemote(ctx) {
    if (!ctx?.remote || !doc) return null;
    ensureStyle();
    activeCtx = ctx;
    activeKind = ctx.remote.kind;
    if (activeKind === 'fate') return buildFateWindow(ctx);
    if (activeKind === 'reward') return buildRewardWindow(ctx);
    return buildStandardWindow(ctx);
  }

  function openQuantityOrRefuse(ctx, it, mode, stackCount) {
    if (mode === 'store' && ctx.isLocked?.(it)) {
      ctx.stowItem?.(it, null);
      return;
    }
    const rawMax = typeof ctx.maxQty === 'function' ? ctx.maxQty(it, mode) : null;
    if (typeof rawMax === 'number' && Number.isFinite(rawMax) && rawMax <= 0) {
      if (mode === 'take') ctx.takeItem?.(it, null);
      else ctx.stowItem?.(it, null);
      return;
    }
    const maxAllowed = (typeof rawMax === 'number' && Number.isFinite(rawMax) && rawMax > 0) ? rawMax : stackCount;
    showQuantityModal({ item: it, mode, maxAmount: Math.min(stackCount, Math.max(1, maxAllowed)), ctx });
  }

  function handleRowClick(it, side, ev, ctx) {
    if (!it || !ctx?.remote) return false;
    activeCtx = ctx;
    if (activeMount?.listBox) savedRemoteScrollTop = activeMount.listBox.scrollTop;

    const kind = ctx.remote.kind;
    if (side === 'remote' && kind === 'reward') {
      ev?.stopPropagation?.();
      rewardPick = it;
      activeMount?.syncRewardSelection?.(it);
      return true;
    }

    const stackCount = Math.max(1, Math.floor(Number(it.stackCount) || 1));
    const isCtrlShift = !!(ev && (ev.ctrlKey || ev.metaKey) && ev.shiftKey);
    const isCtrlOnly = !!(ev && (ev.ctrlKey || ev.metaKey) && !ev.shiftKey);
    const isShiftOnly = !!(ev && ev.shiftKey && !ev.ctrlKey && !ev.metaKey);

    if (side === 'remote') {
      ctx.markQuestLoot?.(it);
      if (isCtrlShift || (isCtrlOnly && stackCount > 1)) {
        ev?.stopPropagation?.();
        openQuantityOrRefuse(ctx, it, 'take', stackCount);
        return true;
      }
      if (isShiftOnly) {
        ev?.stopPropagation?.();
        ctx.takeItem(it, null);
        return true;
      }
      ev?.stopPropagation?.();
      const rowWt = ctx.itemWeight ? ctx.itemWeight(it, ctx.itemLine?.(it)) : (Number(it.weight) || 0);
      const isCoinPile = it.group === 'Currency' && (Number(it.templateIndex) === 276 || rowWt <= 0);
      ctx.takeItem(it, (!isCoinPile && stackCount > 1) ? 1 : null);
      return true;
    }

    // Local inventory row clicks: ONLY intercept Ctrl+Shift+LMB or Ctrl+LMB on stack>1 when stowing into a stowable container.
    // All regular local inventory clicks fall through untouched to native inventory handlers!
    if (side === 'local' && ctx.paired && ctx.isStowableKind?.(kind) && (isCtrlShift || (isCtrlOnly && stackCount > 1))) {
      ev?.stopPropagation?.();
      openQuantityOrRefuse(ctx, it, 'store', stackCount);
      return true;
    }

    return false;
  }

  function decorateContextMenu(menuEl, it, side, closeMenu, ctx, x, y) {
    if (!menuEl || !it || !ctx?.remote) return;
    activeCtx = ctx;
    if (side !== 'remote') return;
    if (activeMount?.listBox) savedRemoteScrollTop = activeMount.listBox.scrollTop;

    const kind = ctx.remote.kind;
    if (kind === 'reward') return;

    const stackCount = Math.max(1, Math.floor(Number(it.stackCount) || 1));
    const nativeButtons = [...menuEl.querySelectorAll('button.inv-menu-item, button.act')];
    const firstBtn = nativeButtons[0] || null;
    const mkItem = (label, fn) => {
      const b = elFn('button', 'inv-menu-item', label);
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.onclick = (e) => {
        e.stopPropagation();
        closeMenu();
        fn();
      };
      return b;
    };

    if (stackCount > 1) {
      const frag = doc.createDocumentFragment();
      frag.append(
        mkItem(T('container.action.takeOne'), () => ctx.takeItem(it, 1)),
        mkItem(T('container.action.takeStack', { n: stackCount }), () => ctx.takeItem(it, null)),
        mkItem(T('container.action.takeCustom'), () => openQuantityOrRefuse(ctx, it, 'take', stackCount)),
        mkItem(T('container.action.inspect'), () => ctx.inspectItem(it, 'remote')),
      );
      if (firstBtn) firstBtn.replaceWith(frag);
      else menuEl.append(frag);
    } else {
      const btnInspect = mkItem(T('container.action.inspect'), () => ctx.inspectItem(it, 'remote'));
      if (firstBtn && firstBtn.nextSibling) menuEl.insertBefore(btnInspect, firstBtn.nextSibling);
      else menuEl.append(btnInspect);
    }

    ctx.clampMenu?.(menuEl, x, y);
  }

  function syncPairedHeight(shell, lootWin, packWin, ctx) {
    if (!shell?.isConnected || !lootWin?.isConnected) return;
    const kind = lootWin.dataset.dfoLootKind || activeKind;
    if (!shell.classList.contains('paired') || !STANDARD_KINDS.has(kind) || !packWin) {
      lootWin.style.removeProperty('--dfo-paired-loot-h');
      lastPairedLootH = '';
      return;
    }
    const rectH = packWin.getBoundingClientRect().height;
    const inlineH = parseFloat(packWin.style.height);
    const targetH = rectH > 0 ? rectH : (Number.isFinite(inlineH) && inlineH > 0 ? inlineH : 0);
    if (targetH > 0) {
      const px = `${Math.round(targetH)}px`;
      lastPairedLootH = px;
      const widthNow = activeMount?.listBox?.clientWidth || 0;
      const widthChanged = !!(activeMount && activeMount.lastListWidth > 0 && widthNow > 0 && Math.abs(widthNow - activeMount.lastListWidth) > 1);
      if (activeMount && widthNow > 0) activeMount.lastListWidth = widthNow;
      if (lootWin.style.getPropertyValue('--dfo-paired-loot-h') !== px) {
        lootWin.style.setProperty('--dfo-paired-loot-h', px);
        if (widthChanged) {
          if (activeMount?.vHandle?.sync) activeMount.vHandle.sync({ remeasure: true });
          else ctx?.remeasureRemote?.();
        } else if (!activeMount?.vHandle) {
          ctx?.remeasureRemote?.();
        } else {
          activeMount.vHandle.sync?.();
        }
      } else if (widthChanged) {
        if (activeMount?.vHandle?.sync) activeMount.vHandle.sync({ remeasure: true });
        else ctx?.remeasureRemote?.();
      }
    }
  }

  function onShellMounted(shell, lootWin, packWin, ctx) {
    ensureStyle();
    activeCtx = ctx || activeCtx;
    if (!lootWin) {
      cancelProgressiveSearch();
      cleanupActiveMount();
      lastFiltered = [];
      savedRemoteScrollTop = 0;
      lastPairedLootH = '';
      if (activeQtyModal) closeQuantityModal();
      return;
    }
    const kind = ctx?.remote?.kind || activeKind || 'container';
    lootWin.dataset.dfoLootKind = kind;
    lootWin.classList.toggle('dfo-reward-win', kind === 'reward');
    lootWin.classList.toggle('dfo-fate-win', kind === 'fate');

    const isPairedStandard = Boolean(shell?.classList?.contains('paired') && packWin && STANDARD_KINDS.has(kind));
    if (isPairedStandard) {
      syncPairedHeight(shell, lootWin, packWin, ctx);
    } else {
      lootWin.style.removeProperty('--dfo-paired-loot-h');
      lastPairedLootH = '';
    }

    activeMount?.restoreScrollAfterMount?.();

    if (isPairedStandard && typeof root.ResizeObserver === 'function' && activeMount) {
      activeMount.disconnectResize?.();
      let roRaf = 0;
      const runSync = () => {
        roRaf = 0;
        syncPairedHeight(shell, lootWin, packWin, ctx);
      };
      const ro = new root.ResizeObserver(() => {
        if (typeof root.requestAnimationFrame === 'function') {
          if (!roRaf) roRaf = root.requestAnimationFrame(runSync);
        } else {
          runSync();
        }
      });
      ro.observe(packWin);
      ro.observe(lootWin);
      activeMount.disconnectResize = () => {
        if (roRaf && typeof root.cancelAnimationFrame === 'function') root.cancelAnimationFrame(roRaf);
        roRaf = 0;
        ro.disconnect();
      };
    } else if (activeMount?.disconnectResize) {
      activeMount.disconnectResize();
      activeMount.disconnectResize = null;
    }
  }

  function onKeyDown(ev) {
    if (!ev) return false;
    if (activeQtyModal) {
      if (ev.key === 'Escape') {
        ev.preventDefault?.();
        ev.stopPropagation?.();
        closeQuantityModal();
      } else if (ev.key !== 'Tab' && (!ev.target?.closest?.('.dfo-loot-modal-box') || (ev.key !== 'Enter' && ev.key !== ' '))) {
        ev.stopPropagation?.();
      }
      return true;
    }
    if (ev.key !== 'Escape') return false;
    const openDd = activeMount?.col?.querySelector?.('.dfo-loot-dd.is-open');
    if (openDd) {
      ev.preventDefault?.();
      ev.stopPropagation?.();
      closeOpenDropdowns(activeMount.col);
      return true;
    }
    return false;
  }

  function onUnmount() {
    cancelProgressiveSearch();
    closeQuantityModal();
    cleanupActiveMount();
    if (activeCtx?.resetFilter) activeCtx.resetFilter(null);
    activeCtx = null;
    activeKind = null;
    activeSessionKey = '';
    sortMode = 'default';
    lastFiltered = [];
    savedRemoteScrollTop = 0;
    lastPairedLootH = '';
    rewardPick = null;
  }

  const api = {
    categories,
    filterItems,
    prepareAside,
    restoreScrollBeforeSync,
    buildRemote,
    handleRowClick,
    decorateContextMenu,
    onShellMounted,
    onKeyDown,
    onUnmount,
    ensureStyle,
    classifyItem,
    pageOf,
    materialOf,
    rarityOf,
    buildPureCardSearchText,
    containerCardTextOf,
    computeFilterSnapshot,
    sortItems,
    showQuantityModal,
    closeQuantityModal,
    STANDARD_KINDS,
    SORT_MODES,
    RARITY_RANKS,
    MATERIALS: MATERIALS_FILTER,
    CSS,
  };

  try { root.__dfoContainerDetachKey$?.(); } catch { /* ignore */ }
  if (typeof root?.addEventListener === 'function') {
    const onRootKeyDown = (ev) => {
      if (!ev || ev.key !== 'Escape') return;
      if (activeQtyModal) {
        ev.preventDefault?.();
        ev.stopImmediatePropagation?.();
        closeQuantityModal();
        return;
      }
      const openDd = activeMount?.col?.querySelector?.('.dfo-loot-dd.is-open');
      if (openDd && !doc?.querySelector?.('.inv-info, .inv-menu, .dfo-pack-dialog[open], dialog.dfo-seal-modal[open]')) {
        ev.preventDefault?.();
        ev.stopImmediatePropagation?.();
        closeOpenDropdowns(activeMount.col);
      }
    };
    root.addEventListener('keydown', onRootKeyDown, true);
    root.__dfoContainerDetachKey$ = () => {
      try { root.removeEventListener?.('keydown', onRootKeyDown, true); } catch { /* ignore */ }
    };
  }

  root.__dfoContainer = api;
  if (isNode) module.exports = api;
})(globalThis);
