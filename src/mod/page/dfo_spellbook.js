/* DFO Spellbook v2 — Production Runtime & Live Game Client Integration.
 * Built from scratch to match the calibrated Spellbook v2 design (150px H / 100px V margins at 1920x1080,
 * clamping cleanly to smaller viewports while leaving the bottom HUD hotbar accessible), unified with the
 * DFO Client Expander UI system, community fonts, and all 6 +plus themes.
 *
 * High-performance virtualized spell list (handles 500–1000+ spells with ~20–30 mounted DOM cards),
 * single shared SVG <defs> paint server, single paced DFO_SPELLMAKER_VIZ canvas for the expanded card,
 * WeakMap search/effect pre-indexing, fluid Custom drag-and-drop across virtualized rows, and coalesced
 * persistence in dfo-mod-cache.json (namespace 'spellbook'). */
(function (root) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ROW_PITCH_FALLBACK = 63; // 58px collapsed row + 5px gap
  const ROW_HEIGHT_FALLBACK = 58;
  const EXPANDED_HEIGHT_FALLBACK = 398;
  const BANNER_HEIGHT_FALLBACK = 34;
  const DIVIDER_HEIGHT_FALLBACK = 38;
  const OVERSCAN_PX = 420;
  const STYLE_ID = 'dfo-spellbook-v2-style';
  const DEF_PREFIX = 'dfosb_';

  const SCHOOL_ORDER = Object.freeze([22, 23, 24, 25, 26, 27]);
  const SCHOOL_META = Object.freeze({
    22: { id: 22, key: 'destruction', color: '#f87171', rgb: '248, 113, 113' },
    23: { id: 23, key: 'restoration', color: '#fcd34d', rgb: '252, 211, 77' },
    24: { id: 24, key: 'illusion', color: '#10d998', rgb: '16, 217, 152' },
    25: { id: 25, key: 'alteration', color: '#68e422', rgb: '104, 228, 34' },
    26: { id: 26, key: 'thaumaturgy', color: '#60a5fa', rgb: '96, 165, 250' },
    27: { id: 27, key: 'mysticism', color: '#a855f7', rgb: '168, 85, 247' },
  });

  const ELEMENT_META = Object.freeze({
    0: { id: 0, key: 'fire', color: '#fb923c', rgb: '251, 146, 60', glow: 'rgba(251, 146, 60, 0.34)' },
    1: { id: 1, key: 'cold', color: '#38bdf8', rgb: '56, 189, 248', glow: 'rgba(56, 189, 248, 0.34)' },
    2: { id: 2, key: 'poison', color: '#4ade80', rgb: '74, 222, 128', glow: 'rgba(74, 222, 128, 0.34)' },
    3: { id: 3, key: 'shock', color: '#a78bfa', rgb: '167, 139, 250', glow: 'rgba(167, 139, 250, 0.34)' },
    4: { id: 4, key: 'magic', color: '#e879f9', rgb: '232, 121, 249', glow: 'rgba(232, 121, 249, 0.34)' },
  });

  const SORT_MODES = Object.freeze(['custom', 'default', 'name', 'costAsc', 'costDesc', 'school']);
  const COLLATORS = typeof Intl !== 'undefined' && typeof Intl.Collator === 'function'
    ? { ru: new Intl.Collator('ru', { sensitivity: 'base' }), en: new Intl.Collator('en', { sensitivity: 'base' }) }
    : null;
  const cmpNames = (a, b, locale) => (COLLATORS?.[locale] ? COLLATORS[locale].compare(a, b) : a.localeCompare(b, locale));
  const SORT_KEY_MAP = Object.freeze({
    custom: 'spellbook.sort.custom',
    default: 'spellbook.sort.default',
    name: 'spellbook.sort.name',
    costAsc: 'spellbook.sort.costAsc',
    costDesc: 'spellbook.sort.costDesc',
    school: 'spellbook.sort.school',
  });

  const FOLD_MOD_KEYS = Object.freeze({
    firmament: 'spellbook.mod.firmament',
    lootRarity: 'spellbook.mod.lootRarity',
    sigilSets: 'spellbook.mod.sigilSets',
    lootPowers: 'spellbook.mod.lootPowers',
    arcanePowers: 'spellbook.mod.arcanePowers',
    martialPowers: 'spellbook.mod.martialPowers',
    revenant: 'spellbook.mod.revenant',
    heirloom: 'spellbook.mod.heirloom',
  });

  // ── Unified 24x24 SVG Registry (shared paint-server gradients mounted once per window) ──
  const SVG_DEFS = Object.freeze({
    mana: {
      defs: [
        { tag: 'radialGradient', id: 'drop', cx: '38%', cy: '36%', r: '65%', stops: [['0%', '#e0f7ff'], ['30%', '#38bdf8'], ['72%', '#1d4ed8'], ['100%', '#172554']] },
        { tag: 'linearGradient', id: 'cr', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#fef3c7'], ['45%', '#d4a448'], ['100%', '#6d4814']] },
      ],
      shapes: [
        { d: 'M3.2 12.6C3.4 18.1 7.2 22.1 12 22.1C16.8 22.1 20.6 18.1 20.8 12.6C19.3 15.8 16 17.7 12 17.7C8 17.7 4.7 15.8 3.2 12.6Z', fill: '@cr', stroke: '#090b10', 'stroke-width': 1.05, 'stroke-linejoin': 'round' },
        { d: 'M12 2.1C12 2.1 17.9 8.9 17.9 13.3C17.9 16.6 15.3 19.1 12 19.1C8.7 19.1 6.1 16.6 6.1 13.3C6.1 8.9 12 2.1 12 2.1Z', fill: '@drop', stroke: '#081226', 'stroke-width': 1.15, 'stroke-linejoin': 'round' },
        { d: 'M12 4.1C13.6 6.4 16.2 10.1 16.2 13.2C16.2 15.6 14.3 17.5 12 17.5C9.7 17.5 7.8 15.6 7.8 13.2C7.8 10.1 10.4 6.4 12 4.1Z', fill: 'none', stroke: '#7dd3fc', 'stroke-width': 0.7, opacity: 0.75 },
        { d: 'M12 8.2L13.1 11.9L16.5 13L13.1 14.1L12 17.5L10.9 14.1L7.5 13L10.9 11.9Z', fill: '#e0f2fe', stroke: '#38bdf8', 'stroke-width': 0.5, 'stroke-linejoin': 'round' },
        { tag: 'circle', cx: 12, cy: 13, r: 1.35, fill: '#ffffff' },
        { d: 'M9.3 10.6C8.8 11.5 8.5 12.5 8.6 13.4', fill: 'none', stroke: '#ffffff', 'stroke-width': 1.15, 'stroke-linecap': 'round', opacity: 0.85 },
        { d: 'M12 18.7L13.2 20.1L12 21.5L10.8 20.1Z', fill: '#7dd3fc', stroke: '#0c223f', 'stroke-width': 0.6 },
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
    caret: {
      shapes: [{ d: 'M6 9L12 15L18 9', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }],
    },
    sort: {
      defs: [
        { tag: 'linearGradient', id: 'br', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#fef08a'], ['50%', '#d5b26e'], ['100%', '#6d4814']] },
        { tag: 'linearGradient', id: 'st', x1: '0', y1: '0', x2: '0', y2: '1', stops: [['0%', '#f1f5f9'], ['55%', '#94a3b8'], ['100%', '#475569']] },
      ],
      shapes: [
        { d: 'M3 5.2H14.5V7.6H3ZM3 10.8H11.5V13.2H3ZM3 16.4H8.5V18.8H3Z', fill: '@st', stroke: '#090b0f', 'stroke-width': 0.9, 'stroke-linejoin': 'round' },
        { d: 'M16.8 4.4H19.2V14.4H21.6L18 20L14.4 14.4H16.8Z', fill: '@br', stroke: '#0b0804', 'stroke-width': 0.95, 'stroke-linejoin': 'round' },
      ],
    },
    clock: {
      defs: [
        { tag: 'linearGradient', id: 'rim', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#f3e8ff'], ['45%', '#a855f7'], ['100%', '#3b0764']] },
        { tag: 'radialGradient', id: 'dial', cx: '40%', cy: '35%', r: '65%', stops: [['0%', '#3b1764'], ['70%', '#1b0d30'], ['100%', '#0d0618']] },
      ],
      shapes: [
        { d: 'M9.6 2.5H14.4M12 2.5V4.8', fill: 'none', stroke: '#f5d451', 'stroke-width': 1.8, 'stroke-linecap': 'round' },
        { tag: 'circle', cx: 12, cy: 13.2, r: 8.6, fill: '@rim', stroke: '#090512', 'stroke-width': 1.15 },
        { tag: 'circle', cx: 12, cy: 13.2, r: 6.7, fill: '@dial', stroke: '#d8b4fe', 'stroke-width': 0.65 },
        { d: 'M12 8.4V13.2L15.4 15.2', fill: 'none', stroke: '#f3e8ff', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
        { tag: 'circle', cx: 12, cy: 13.2, r: 1.15, fill: '#fde68a' },
      ],
    },
    chance: {
      defs: [
        { tag: 'linearGradient', id: 'hex', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#fef08a'], ['45%', '#c9963b'], ['100%', '#593b12']] },
        { tag: 'radialGradient', id: 'in', cx: '40%', cy: '35%', r: '65%', stops: [['0%', '#4a3312'], ['75%', '#211507'], ['100%', '#110a03']] },
      ],
      shapes: [
        { d: 'M12 2L20.3 6.8V17.2L12 22L3.7 17.2V6.8Z', fill: '@hex', stroke: '#0b0804', 'stroke-width': 1.15, 'stroke-linejoin': 'round' },
        { d: 'M12 4.1L18.4 7.8V16.2L12 19.9L5.6 16.2V7.8Z', fill: '@in', stroke: '#fde68a', 'stroke-width': 0.65, 'stroke-linejoin': 'round' },
        { tag: 'circle', cx: 9.1, cy: 9.3, r: 1.55, fill: '#fef08a' },
        { tag: 'circle', cx: 14.9, cy: 14.7, r: 1.55, fill: '#fef08a' },
        { d: 'M15.4 8.6L8.6 15.4', fill: 'none', stroke: '#f5d451', 'stroke-width': 1.7, 'stroke-linecap': 'round' },
      ],
    },
    power: {
      defs: [
        { tag: 'radialGradient', id: 'red', cx: '45%', cy: '38%', r: '62%', stops: [['0%', '#fecaca'], ['42%', '#ef4444'], ['85%', '#991b1b'], ['100%', '#450a0a']] },
      ],
      shapes: [
        { d: 'M12 1.9L15.1 8.6L22.2 9.7L17 14.7L18.3 21.8L12 18.4L5.7 21.8L7 14.7L1.8 9.7L8.9 8.6Z', fill: '@red', stroke: '#0e0505', 'stroke-width': 1.1, 'stroke-linejoin': 'round' },
        { d: 'M12 6.2L13.7 10.2L17.9 10.9L14.8 13.8L15.6 18L12 15.9L8.4 18L9.2 13.8L6.1 10.9L10.3 10.2Z', fill: '#fca5a5', stroke: '#fef2f2', 'stroke-width': 0.5, 'stroke-linejoin': 'round' },
        { tag: 'circle', cx: 12, cy: 12.6, r: 1.45, fill: '#fff7ed' },
      ],
    },
    ctaReady: {
      defs: [
        { tag: 'radialGradient', id: 'g', cx: '45%', cy: '38%', r: '60%', stops: [['0%', '#ecfdf5'], ['38%', '#34d399'], ['80%', '#0f5132'], ['100%', '#052e16']] },
      ],
      shapes: [
        { d: 'M12 1.8L15 9L22.2 12L15 15L12 22.2L9 15L1.8 12L9 9Z', fill: '@g', stroke: '#061a11', 'stroke-width': 1.1, 'stroke-linejoin': 'round' },
        { d: 'M12 4.6L13.7 10.3L19.4 12L13.7 13.7L12 19.4L10.3 13.7L4.6 12L10.3 10.3Z', fill: 'none', stroke: '#a7f3d0', 'stroke-width': 0.7, opacity: 0.9 },
        { tag: 'circle', cx: 12, cy: 12, r: 1.7, fill: '#ffffff' },
      ],
    },
    school_22: {
      defs: [
        { tag: 'linearGradient', id: 'ring', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#fecaca', '0.7'], ['55%', '#f87171', '0.45'], ['100%', '#991b1b', '0.25']] },
        { tag: 'radialGradient', id: 'fl', cx: '46%', cy: '56%', r: '64%', stops: [['0%', '#fef08a'], ['28%', '#fb923c'], ['66%', '#ef4444'], ['100%', '#7f1d1d']] },
        { tag: 'radialGradient', id: 'core', cx: '48%', cy: '62%', r: '56%', stops: [['0%', '#ffffff'], ['38%', '#fef9c3'], ['80%', '#fb923c'], ['100%', '#ea580c']] },
      ],
      shapes: [
        { tag: 'circle', cx: 12, cy: 12.6, r: 9.2, fill: 'none', stroke: '@ring', 'stroke-width': 0.9, 'stroke-dasharray': '3.8 2.2', opacity: 0.78 },
        { d: 'M12.3 1.8C14.1 4.4 17.8 7.5 18.8 11.4C19.5 14 19 17 17.4 19.1C16 21.1 14 22.1 12 22.1C9.5 22.1 7.2 20.8 5.9 18.6C4.7 16.5 4.8 13.7 5.7 11.2C6.4 9.2 7.5 7.7 8.7 6.5C8.5 8.2 9.1 9.4 10.1 9.8C9.8 6.8 11 3.8 12.3 1.8Z', fill: '@fl', stroke: '#1a0404', 'stroke-width': 1.15, 'stroke-linejoin': 'round' },
        { d: 'M12.1 6.7C14 9.1 16.3 11.8 16.3 15.1C16.3 18 14.5 20.4 12 20.4C9.5 20.4 7.7 18.1 7.7 15.3C7.7 13 8.9 10.9 10.4 9.5C10.4 10.8 11.1 11.5 11.7 11.7C11.4 9.8 11.7 8.1 12.1 6.7Z', fill: '#fb923c', 'fill-opacity': 0.48, stroke: '#fed7aa', 'stroke-width': 0.55, 'stroke-linejoin': 'round' },
        { d: 'M12 11.2C13.3 12.8 14.3 14.3 14.3 16.1C14.3 17.8 13.3 19.1 12 19.1C10.7 19.1 9.7 17.8 9.7 16.1C9.7 14.5 10.6 13 12 11.2Z', fill: '@core' },
        { d: 'M12 14.3L13.1 16.4L12 18.2L10.9 16.4Z', fill: '#ffffff' },
        { tag: 'circle', cx: 5.5, cy: 7.5, r: 0.9, fill: '#fca5a5' },
        { tag: 'circle', cx: 18.7, cy: 6.2, r: 1.05, fill: '#fde047' },
      ],
    },
    school_23: {
      defs: [
        { tag: 'linearGradient', id: 'halo', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#fef9c3'], ['50%', '#f59e0b'], ['100%', '#92400e']] },
        { tag: 'linearGradient', id: 'amber', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#fde68a'], ['55%', '#d97706'], ['100%', '#78350f']] },
        { tag: 'radialGradient', id: 'sun', cx: '40%', cy: '36%', r: '65%', stops: [['0%', '#fffbeb'], ['36%', '#fcd34d'], ['78%', '#d97706'], ['100%', '#78350f']] },
      ],
      shapes: [
        { tag: 'circle', cx: 12, cy: 12, r: 8.1, fill: 'none', stroke: '#1a0f04', 'stroke-width': 2.4 },
        { tag: 'circle', cx: 12, cy: 12, r: 8.1, fill: 'none', stroke: '@halo', 'stroke-width': 1.35 },
        { d: 'M6.1 6.1L12 9.6L17.9 6.1L14.4 12L17.9 17.9L12 14.4L6.1 17.9L9.6 12Z', fill: '@amber', stroke: '#180d02', 'stroke-width': 0.95, 'stroke-linejoin': 'round' },
        { d: 'M12 1.7L14.4 9.4L22.3 12L14.4 14.6L12 22.3L9.6 14.6L1.7 12L9.6 9.4Z', fill: '@sun', stroke: '#160c02', 'stroke-width': 1.1, 'stroke-linejoin': 'round' },
        { d: 'M12 1.7V12L9.6 9.4Z', fill: '#fffbeb', opacity: 0.6 },
        { d: 'M1.7 12H12L9.6 14.6Z', fill: '#fef3c7', opacity: 0.45 },
        { tag: 'circle', cx: 12, cy: 12, r: 3.1, fill: '@halo', stroke: '#451a03', 'stroke-width': 0.85 },
        { tag: 'circle', cx: 11.4, cy: 11.4, r: 1.35, fill: '#ffffff' },
      ],
    },
    school_24: {
      defs: [
        { tag: 'radialGradient', id: 'lid', cx: '42%', cy: '36%', r: '68%', stops: [['0%', '#ccfbf1'], ['38%', '#10d998'], ['76%', '#0f766e'], ['100%', '#022c22']] },
        { tag: 'radialGradient', id: 'iris', cx: '45%', cy: '40%', r: '62%', stops: [['0%', '#99f6e4'], ['36%', '#10d998'], ['78%', '#0d9488'], ['100%', '#042f2e']] },
      ],
      shapes: [
        { d: 'M4.2 6.8C6.9 4.5 9.4 3.5 12 3.5C14.6 3.5 17.1 4.5 19.8 6.8', fill: 'none', stroke: '#5eead4', 'stroke-width': 0.9, 'stroke-linecap': 'round', opacity: 0.65 },
        { d: 'M1.7 12C4.6 6.6 8.2 4.4 12 4.4C15.8 4.4 19.4 6.6 22.3 12C19.4 17.4 15.8 19.6 12 19.6C8.2 19.6 4.6 17.4 1.7 12Z', fill: '@lid', stroke: '#021611', 'stroke-width': 1.15, 'stroke-linejoin': 'round' },
        { d: 'M4.1 12C6.4 8.2 9.1 6.7 12 6.7C14.9 6.7 17.6 8.2 19.9 12C17.6 15.8 14.9 17.3 12 17.3C9.1 17.3 6.4 15.8 4.1 12Z', fill: '#031c16', stroke: '#5eead4', 'stroke-width': 0.7 },
        { tag: 'circle', cx: 12, cy: 12, r: 4.1, fill: '@iris', stroke: '#ccfbf1', 'stroke-width': 0.75 },
        { tag: 'circle', cx: 12, cy: 12, r: 2.75, fill: 'none', stroke: '#f0fdfa', 'stroke-width': 0.55, 'stroke-dasharray': '2 1.2', opacity: 0.75 },
        { d: 'M12 8.2L13.4 12L12 15.8L10.6 12Z', fill: '#021410', stroke: '#2dd4bf', 'stroke-width': 0.4 },
        { tag: 'circle', cx: 10.4, cy: 10.3, r: 1.05, fill: '#ffffff' },
        { tag: 'circle', cx: 13.7, cy: 13.5, r: 0.55, fill: '#ccfbf1' },
      ],
    },
    school_25: {
      defs: [
        { tag: 'linearGradient', id: 'rim', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#f6ffbc'], ['36%', '#68e422'], ['78%', '#3f8f13'], ['100%', '#1a3309']] },
        { tag: 'radialGradient', id: 'fld', cx: '45%', cy: '38%', r: '65%', stops: [['0%', '#234a0c'], ['65%', '#112406'], ['100%', '#071002']] },
        { tag: 'linearGradient', id: 'gem', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#f7fee7'], ['45%', '#a3e635'], ['100%', '#3f8f13']] },
      ],
      shapes: [
        { d: 'M12 1.9L20.7 5.5V12.6C20.7 17.6 16.9 20.8 12 22.2C7.1 20.8 3.3 17.6 3.3 12.6V5.5Z', fill: '@rim', stroke: '#091403', 'stroke-width': 1.15, 'stroke-linejoin': 'round' },
        { d: 'M12 4.1L18.5 6.9V12.4C18.5 16.2 15.5 18.6 12 19.9C8.5 18.6 5.5 16.2 5.5 12.4V6.9Z', fill: '@fld', stroke: '#bef264', 'stroke-width': 0.75 },
        { d: 'M12 4.6V19.3M6.2 12H17.8', fill: 'none', stroke: '#68e422', 'stroke-width': 0.7, opacity: 0.6 },
        { d: 'M12 6.8L16.2 12L12 17.2L7.8 12Z', fill: '@gem', stroke: '#ecfccb', 'stroke-width': 0.75, 'stroke-linejoin': 'round' },
        { d: 'M12 6.8L16.2 12H12Z', fill: '#ffffff', opacity: 0.32 },
        { tag: 'circle', cx: 6.9, cy: 7.7, r: 0.65, fill: '#ecfccb' },
        { tag: 'circle', cx: 17.1, cy: 7.7, r: 0.65, fill: '#ecfccb' },
        { tag: 'circle', cx: 12, cy: 12, r: 1.3, fill: '#ffffff' },
      ],
    },
    school_26: {
      defs: [
        { tag: 'radialGradient', id: 'sph', cx: '36%', cy: '32%', r: '68%', stops: [['0%', '#f0f9ff'], ['32%', '#60a5fa'], ['74%', '#2563eb'], ['100%', '#0f172a']] },
        { tag: 'linearGradient', id: 'orb', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#e0f2fe'], ['50%', '#60a5fa'], ['100%', '#1d4ed8']] },
      ],
      shapes: [
        { tag: 'ellipse', cx: 12, cy: 12, rx: 10, ry: 3.9, transform: 'rotate(-30 12 12)', fill: 'none', stroke: '#071024', 'stroke-width': 2.4 },
        { tag: 'ellipse', cx: 12, cy: 12, rx: 10, ry: 3.9, transform: 'rotate(-30 12 12)', fill: 'none', stroke: '@orb', 'stroke-width': 1.35 },
        { tag: 'ellipse', cx: 12, cy: 12, rx: 10, ry: 3.9, transform: 'rotate(30 12 12)', fill: 'none', stroke: '#071024', 'stroke-width': 2.2 },
        { tag: 'ellipse', cx: 12, cy: 12, rx: 10, ry: 3.9, transform: 'rotate(30 12 12)', fill: 'none', stroke: '#38bdf8', 'stroke-width': 1.15, opacity: 0.9 },
        { tag: 'circle', cx: 12, cy: 12, r: 5.8, fill: '@sph', stroke: '#07122b', 'stroke-width': 1.15 },
        { d: 'M12 6.4A2.9 5.6 0 0 1 12 17.6M6.4 12H17.6', fill: 'none', stroke: '#dbeafe', 'stroke-width': 0.65, opacity: 0.62 },
        { d: 'M9.3 9.7C10.1 8.6 11.5 8.1 12.9 8.4', fill: 'none', stroke: '#ffffff', 'stroke-width': 1.25, 'stroke-linecap': 'round', opacity: 0.92 },
        { tag: 'circle', cx: 4.1, cy: 6.9, r: 1.05, fill: '#e0f2fe', stroke: '#0f172a', 'stroke-width': 0.5 },
        { tag: 'circle', cx: 19.9, cy: 17.1, r: 1.05, fill: '#93c5fd', stroke: '#0f172a', 'stroke-width': 0.5 },
      ],
    },
    school_27: {
      defs: [
        { tag: 'linearGradient', id: 'cres', x1: '0', y1: '0', x2: '0', y2: '1', stops: [['0%', '#fae8ff'], ['50%', '#c084fc'], ['100%', '#6b21a8']] },
        { tag: 'linearGradient', id: 'gem', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#fae8ff'], ['34%', '#c084fc'], ['72%', '#7e22ce'], ['100%', '#2e1065']] },
      ],
      shapes: [
        { d: 'M6.5 4.4C2.3 7.7 2.3 16.3 6.5 19.6C4.5 16.1 4.5 7.9 6.5 4.4Z', fill: '@cres', stroke: '#140429', 'stroke-width': 0.85, 'stroke-linejoin': 'round' },
        { d: 'M17.5 4.4C21.7 7.7 21.7 16.3 17.5 19.6C19.5 16.1 19.5 7.9 17.5 4.4Z', fill: '@cres', stroke: '#140429', 'stroke-width': 0.85, 'stroke-linejoin': 'round' },
        { d: 'M12 1.9L17.4 8.4V15.6L12 22.1L6.6 15.6V8.4Z', fill: '@gem', stroke: '#120424', 'stroke-width': 1.15, 'stroke-linejoin': 'round' },
        { d: 'M12 1.9L6.6 8.4L8.9 9.2L12 5.2Z', fill: '#f5d0fe', opacity: 0.72 },
        { d: 'M12 5.2L15.1 9.2V14.8L12 18.8L8.9 14.8V9.2Z', fill: '#3b0764', stroke: '#e9d5ff', 'stroke-width': 0.65, 'stroke-linejoin': 'round' },
        { d: 'M12 8.1L13.7 12L12 15.9L10.3 12Z', fill: '#f5d0fe', stroke: '#ffffff', 'stroke-width': 0.45 },
        { tag: 'circle', cx: 3.1, cy: 12, r: 0.8, fill: '#f3e8ff' },
        { tag: 'circle', cx: 20.9, cy: 12, r: 0.8, fill: '#f3e8ff' },
      ],
    },
    target_0: {
      shapes: [
        { tag: 'circle', cx: 12, cy: 12, r: 3.8, fill: 'currentColor' },
        { tag: 'circle', cx: 12, cy: 12, r: 8.5, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-dasharray': '3.2 2.2' },
      ],
    },
    target_1: {
      shapes: [
        { d: 'M5.5 14.5V8.7a1.3 1.3 0 012.6 0v3.3h1.3V6a1.3 1.3 0 012.6 0v6h1.3V6.8a1.3 1.3 0 012.6 0v5.8l2-1.6a1.3 1.3 0 011.7 2l-4 5.5H7.9L5.5 14.5z', fill: 'currentColor' },
      ],
    },
    target_2: {
      shapes: [
        { d: 'M3.8 20.2L19.2 4.8M19.2 4.8H11.4M19.2 4.8V12.6', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
      ],
    },
    target_3: {
      shapes: [
        { tag: 'circle', cx: 12, cy: 12, r: 3.0, fill: 'currentColor' },
        { tag: 'circle', cx: 12, cy: 12, r: 6.5, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 },
        { tag: 'circle', cx: 12, cy: 12, r: 9.8, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.3, 'stroke-dasharray': '3.8 2.4' },
      ],
    },
    target_4: {
      shapes: [{ d: 'M12 2.2L14.4 9.2L21.8 12L14.4 14.8L12 21.8L9.6 14.8L2.2 12L9.6 9.2Z', fill: 'currentColor' }],
    },
    grimoire: {
      defs: [
        { tag: 'linearGradient', id: 'cov', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#93c5fd'], ['50%', '#2563eb'], ['100%', '#172554']] },
        { tag: 'linearGradient', id: 'pg', x1: '0', y1: '0', x2: '0', y2: '1', stops: [['0%', '#fef9c3'], ['60%', '#d6c08d'], ['100%', '#8a7144']] },
      ],
      shapes: [
        { d: 'M2.6 5.2C2.6 4.4 3.3 3.8 4.1 3.8H11.2V19.6H4.1C3.3 19.6 2.6 19 2.6 18.2Z', fill: '@cov', stroke: '#060b16', 'stroke-width': 1.05, 'stroke-linejoin': 'round' },
        { d: 'M21.4 5.2C21.4 4.4 20.7 3.8 19.9 3.8H12.8V19.6H19.9C20.7 19.6 21.4 19 21.4 18.2Z', fill: '@cov', stroke: '#060b16', 'stroke-width': 1.05, 'stroke-linejoin': 'round' },
        { d: 'M4.4 5.6H10.6V17.7H4.4Z', fill: '@pg', opacity: 0.92 },
        { d: 'M13.4 5.6H19.6V17.7H13.4Z', fill: '@pg', opacity: 0.85 },
        { d: 'M10.9 4.2H13.1V19.6H10.9Z', fill: '#eab308', stroke: '#451a03', 'stroke-width': 0.65 },
        { d: 'M5.8 8.3H9.3M5.8 11H9.3M5.8 13.7H8.5M14.7 8.3H18.2M14.7 11H18.2', fill: 'none', stroke: '#3b2c12', 'stroke-width': 1.05, 'stroke-linecap': 'round' },
        { d: 'M16.1 17.6V21.7L17.4 20.6L18.7 21.7V17.6Z', fill: '#dc2626', stroke: '#450a0a', 'stroke-width': 0.55 },
      ],
    },
    clearCross: {
      shapes: [{ d: 'M6.5 6.5L17.5 17.5M17.5 6.5L6.5 17.5', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linecap': 'round' }],
    },
    warn: {
      defs: [
        { tag: 'linearGradient', id: 'tri', x1: '0', y1: '0', x2: '0.4', y2: '1', stops: [['0%', '#fef08a'], ['45%', '#f59e0b'], ['100%', '#78350f']] },
      ],
      shapes: [
        { d: 'M12 2.4L21.5 19.8H2.5Z', fill: '@tri', stroke: '#0e0803', 'stroke-width': 1.15, 'stroke-linejoin': 'round' },
        { d: 'M12 5.4L18.9 18.1H5.1Z', fill: '#451a03', stroke: '#fde68a', 'stroke-width': 0.65, 'stroke-linejoin': 'round' },
        { d: 'M12 9.1V13.8', fill: 'none', stroke: '#fef08a', 'stroke-width': 2.0, 'stroke-linecap': 'round' },
        { tag: 'circle', cx: 12, cy: 16.4, r: 1.15, fill: '#fef08a' },
      ],
    },
    pencil: {
      defs: [
        { tag: 'linearGradient', id: 'pen', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#fef08a'], ['48%', '#d5b26e'], ['100%', '#7c5319']] },
        { tag: 'linearGradient', id: 'fer', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#fca5a5'], ['55%', '#dc2626'], ['100%', '#7f1d1d']] },
      ],
      shapes: [
        { d: 'M15.4 4.8L19.2 8.6L8.7 19.1L3.8 20.2L4.9 15.3Z', fill: '@pen', stroke: '#0b0804', 'stroke-width': 1.15, 'stroke-linejoin': 'round' },
        { d: 'M17.2 3L21 6.8L19.1 8.7L15.3 4.9Z', fill: '@fer', stroke: '#0b0804', 'stroke-width': 1.05, 'stroke-linejoin': 'round' },
        { d: 'M6.5 14.2L15.1 5.6', fill: 'none', stroke: '#fffbeb', 'stroke-width': 0.85, opacity: 0.75 },
        { d: 'M4.5 17.6L6.4 19.5L3.8 20.2Z', fill: '#1e293b', stroke: '#090b0f', 'stroke-width': 0.65, 'stroke-linejoin': 'round' },
      ],
    },
    check: {
      shapes: [{ d: 'M5.2 12.6L10 17.4L18.8 7.2', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }],
    },
    trash: {
      defs: [
        { tag: 'linearGradient', id: 'lid', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#fecaca'], ['45%', '#ef4444'], ['100%', '#7f1d1d']] },
        { tag: 'linearGradient', id: 'urn', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#e2e8f0'], ['45%', '#94a3b8'], ['100%', '#334155']] },
      ],
      shapes: [
        { d: 'M9 5.9V3.8C9 3.2 9.4 2.8 10 2.8H14C14.6 2.8 15 3.2 15 3.8V5.9', fill: 'none', stroke: '#090505', 'stroke-width': 2.6, 'stroke-linecap': 'round' },
        { d: 'M9 5.9V3.8C9 3.2 9.4 2.8 10 2.8H14C14.6 2.8 15 3.2 15 3.8V5.9', fill: 'none', stroke: '#fde68a', 'stroke-width': 1.25, 'stroke-linecap': 'round' },
        { d: 'M5.8 7.5H18.2L17.1 20.2C17 20.9 16.5 21.3 15.8 21.3H8.2C7.5 21.3 7 20.9 6.9 20.2Z', fill: '@urn', stroke: '#090b0f', 'stroke-width': 1.15, 'stroke-linejoin': 'round' },
        { d: 'M4.2 5.4H19.8C20.2 5.4 20.5 5.8 20.5 6.3V7.3C20.5 7.7 20.2 8 19.8 8H4.2C3.8 8 3.5 7.7 3.5 7.3V6.3C3.5 5.8 3.8 5.4 4.2 5.4Z', fill: '@lid', stroke: '#180505', 'stroke-width': 1.05, 'stroke-linejoin': 'round' },
        { d: 'M9.6 10.6V18.3M12 10.6V18.3M14.4 10.6V18.3', fill: 'none', stroke: '#1e293b', 'stroke-width': 1.35, 'stroke-linecap': 'round' },
        { d: 'M9.3 10.6V18.1', fill: 'none', stroke: '#f8fafc', 'stroke-width': 0.55, opacity: 0.55 },
      ],
    },
  });

  function T(key, params) {
    return root.__dfoUi ? root.__dfoUi.t(key, params) : key;
  }

  function isRu() {
    if (root.__dfoUi?.locale) return root.__dfoUi.locale === 'ru';
    return Boolean(root.__DFO_MOD_CFG__?.ru?.on);
  }

  function isGameHost() {
    try {
      return root.location?.host === 'game';
    } catch {
      return false;
    }
  }

  function localItemText(name) {
    const raw = typeof name === 'string' ? name.trim() : '';
    if (!raw) return '';
    try {
      if (typeof root.__translate === 'function') return root.__translate(raw) || raw;
      if (typeof root.__dfoItemName === 'function') return root.__dfoItemName(raw) || raw;
    } catch {}
    return raw;
  }

  function el(doc, tag, cls, text = null) {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }

  function buildSharedSvgDefs(doc) {
    const mk = (tag, attrs) => {
      const n = doc.createElementNS ? doc.createElementNS(SVG_NS, tag) : doc.createElement(tag);
      for (const [k, v] of Object.entries(attrs || {})) {
        if (v != null) n.setAttribute(k, String(v));
      }
      return n;
    };
    const svg = mk('svg', { width: 0, height: 0, class: 'dfo-sb-svg-defs', 'aria-hidden': 'true' });
    const defsEl = mk('defs');
    for (const [key, def] of Object.entries(SVG_DEFS)) {
      if (!Array.isArray(def.defs)) continue;
      for (const g of def.defs) {
        const attrs = { ...g };
        const tag = attrs.tag || 'linearGradient';
        const stops = attrs.stops || [];
        delete attrs.tag;
        delete attrs.stops;
        attrs.id = `${DEF_PREFIX}${key}_${attrs.id}`;
        const gr = mk(tag, attrs);
        for (const [off, col, op] of stops) {
          gr.append(mk('stop', { offset: off, 'stop-color': col, 'stop-opacity': op ?? null }));
        }
        defsEl.append(gr);
      }
    }
    for (const [key, def] of Object.entries(SVG_DEFS)) {
      const res = (v) => (typeof v === 'string' && v.startsWith('@') ? `url(#${DEF_PREFIX}${key}_${v.slice(1)})` : v);
      const sym = mk('symbol', { id: `${DEF_PREFIX}sym_${key}`, viewBox: '0 0 24 24' });
      for (const sh of def.shapes || []) {
        const attrs = {};
        const tag = sh.tag || 'path';
        for (const [k, v] of Object.entries(sh)) {
          if (k !== 'tag') attrs[k] = res(v);
        }
        sym.append(mk(tag, attrs));
      }
      defsEl.append(sym);
    }
    svg.append(defsEl);
    return svg;
  }

  function renderSvgIcon(doc, key, cls = '') {
    if (!SVG_DEFS[key]) return null;
    const mk = (tag, attrs) => {
      const n = doc.createElementNS ? doc.createElementNS(SVG_NS, tag) : doc.createElement(tag);
      for (const [k, v] of Object.entries(attrs || {})) {
        if (v != null) n.setAttribute(k, String(v));
      }
      return n;
    };
    const svg = mk('svg', {
      viewBox: '0 0 24 24',
      class: cls ? `dfo-sb-svg ${cls}` : 'dfo-sb-svg',
      'aria-hidden': 'true',
    });
    svg.append(mk('use', { href: `#${DEF_PREFIX}sym_${key}`, width: 24, height: 24 }));
    return svg;
  }

  // ── Scoped Production Stylesheet (inherits :root[data-plus-theme] + @layer dfo-community-fonts) ──
  const SPELLBOOK_CSS = `
.dfo-sb-shell {
  --dfo-bone: #e9e4d9;
  --dfo-bone-warm: #f1e6c8;
  --dfo-title-gold: #f6e7b0;
  --dfo-title-cream: #e7d6a9;
  --dfo-dim: #a89f88;
  --dfo-label-brass: #b7a071;
  --dfo-brass: #d5b26e;
  --dfo-brass-mid: #c08a3e;
  --dfo-brass-edge: #756346;
  --dfo-gold-num: #f5d451;
  --dfo-emerald-text: #7fe3b5;
  --dfo-error-text: #ff9f98;
  --dfo-sb-spell-ico-px: 44px;
  --dfo-sb-spell-box-px: 46px;
  --dfo-bg-dither-img: repeating-conic-gradient(rgba(255, 255, 255, 0.022) 0 25%, transparent 0 50%);
  --dfo-bg-dither-size: 4px 4px;
  --dfo-bg-scrim: rgba(5, 7, 10, 0.74);
  --dfo-bg-window: rgba(12, 14, 18, 0.94);
  --dfo-bg-header: linear-gradient(180deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.015));
  --dfo-bg-win-head: linear-gradient(180deg, rgba(62, 56, 44, 0.38) 0%, rgba(24, 26, 32, 0.55) 56%, rgba(10, 12, 16, 0.72) 100%);
  --dfo-bg-panel: rgba(15, 17, 22, 0.92);
  --dfo-bg-panel-elevated: rgba(23, 27, 33, 0.97);
  --dfo-bg-well: rgba(8, 10, 13, 0.9);
  --dfo-bg-input: rgba(4, 5, 7, 0.82);
  --dfo-bg-button: #1c1f26;
  --dfo-bg-button-hover: #262a33;
  --dfo-bg-row: rgba(16, 19, 24, 0.9);
  --dfo-bg-row-hover: rgba(34, 39, 49, 0.95);
  --dfo-bg-footer: rgba(10, 12, 16, 0.82);
  position: absolute;
  inset: 0;
  z-index: 1;
  background: radial-gradient(circle at 50% 48%, rgba(6, 8, 12, 0.34), rgba(4, 5, 8, 0.62));
  font-family: var(--dfo-font-ui, 'DFO Gabin', sans-serif);
  color: var(--dfo-bone);
  text-transform: none;
  pointer-events: auto;
}
:root[data-plus-theme="stone"] .dfo-sb-shell {
  --dfo-bg-window: #51514c; --dfo-bg-panel: #5a5a54; --dfo-bg-panel-elevated: #63635c;
  --dfo-bg-well: rgba(44, 44, 40, 0.92); --dfo-bg-button: #4a4a45; --dfo-bg-button-hover: #5f5f58;
  --dfo-bg-input: rgba(30, 30, 28, 0.78); --dfo-bg-row: rgba(74, 74, 69, 0.9); --dfo-bg-row-hover: rgba(95, 95, 88, 0.96);
}
:root[data-plus-theme="iron"] .dfo-sb-shell {
  --dfo-bg-window: #232a33; --dfo-bg-panel: #28303a; --dfo-bg-panel-elevated: #2f3844;
  --dfo-bg-well: rgba(16, 20, 26, 0.92); --dfo-bg-button: #2c3440; --dfo-bg-button-hover: #36404d;
  --dfo-bg-input: rgba(8, 10, 14, 0.78); --dfo-bg-row: rgba(34, 41, 50, 0.9); --dfo-bg-row-hover: rgba(54, 64, 77, 0.96);
}
:root[data-plus-theme="ember"] .dfo-sb-shell {
  --dfo-bg-window: #2a1510; --dfo-bg-panel: #301914; --dfo-bg-panel-elevated: #3a1f18;
  --dfo-bg-well: rgba(18, 9, 7, 0.92); --dfo-bg-button: #3a1d16; --dfo-bg-button-hover: #4a261c;
  --dfo-bg-input: rgba(14, 6, 4, 0.78); --dfo-bg-row: rgba(38, 19, 15, 0.9); --dfo-bg-row-hover: rgba(74, 38, 28, 0.96);
}
:root[data-plus-theme="forest"] .dfo-sb-shell {
  --dfo-bg-window: #15231a; --dfo-bg-panel: #1a2b20; --dfo-bg-panel-elevated: #203628;
  --dfo-bg-well: rgba(9, 16, 12, 0.92); --dfo-bg-button: #1f3226; --dfo-bg-button-hover: #284030;
  --dfo-bg-input: rgba(5, 10, 7, 0.78); --dfo-bg-row: rgba(20, 35, 26, 0.9); --dfo-bg-row-hover: rgba(40, 64, 48, 0.96);
}
:root[data-plus-theme="night"] .dfo-sb-shell {
  --dfo-bg-window: #131a30; --dfo-bg-panel: #182038; --dfo-bg-panel-elevated: #1e2846;
  --dfo-bg-well: rgba(8, 12, 24, 0.92); --dfo-bg-button: #1c2542; --dfo-bg-button-hover: #263052;
  --dfo-bg-input: rgba(5, 7, 14, 0.78); --dfo-bg-row: rgba(20, 27, 48, 0.9); --dfo-bg-row-hover: rgba(38, 48, 82, 0.96);
}
.dfo-sb-shell *, .dfo-sb-shell *::before, .dfo-sb-shell *::after {
  box-sizing: border-box;
  text-transform: none;
}
.dfo-sb-svg-defs { position: absolute; width: 0; height: 0; overflow: hidden; pointer-events: none; }

/* Exact 150px H / 100px V margins on 1920x1080+ while gracefully clamping on smaller screens */
.dfo-sb-win {
  position: fixed;
  left: clamp(16px, 150px, max(16px, calc((100vw - 1020px) / 2)));
  right: clamp(16px, 150px, max(16px, calc((100vw - 1020px) / 2)));
  top: clamp(24px, 100px, max(24px, calc((100vh - 600px) / 2)));
  bottom: clamp(82px, 100px, max(82px, calc((100vh - 600px) / 2)));
  display: flex;
  flex-direction: column;
  overflow: visible;
}
.dfo-sb-shell .dfo-window-frame {
  box-sizing: border-box;
  border: 2px solid #7d7460;
  border-image: url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20width%3D'25'%20height%3D'25'%20shape-rendering%3D'crispEdges'%3E%3Crect%20x%3D'0'%20y%3D'0'%20width%3D'25'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'0'%20y%3D'1'%20width%3D'1'%20height%3D'24'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'1'%20y%3D'1'%20width%3D'9'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'10'%20y%3D'1'%20width%3D'1'%20height%3D'5'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'11'%20y%3D'1'%20width%3D'3'%20height%3D'1'%20fill%3D'%23c2b79a'%2F%3E%3Crect%20x%3D'14'%20y%3D'1'%20width%3D'1'%20height%3D'5'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'15'%20y%3D'1'%20width%3D'9'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'24'%20y%3D'1'%20width%3D'1'%20height%3D'24'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'1'%20y%3D'2'%20width%3D'1'%20height%3D'8'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'2'%20y%3D'2'%20width%3D'7'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'9'%20y%3D'2'%20width%3D'1'%20height%3D'4'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'11'%20y%3D'2'%20width%3D'3'%20height%3D'1'%20fill%3D'%239a9079'%2F%3E%3Crect%20x%3D'15'%20y%3D'2'%20width%3D'1'%20height%3D'4'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'16'%20y%3D'2'%20width%3D'7'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'23'%20y%3D'2'%20width%3D'1'%20height%3D'8'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'11'%20y%3D'3'%20width%3D'3'%20height%3D'1'%20fill%3D'%237a7260'%2F%3E%3Crect%20x%3D'2'%20y%3D'4'%20width%3D'2'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'4'%20y%3D'4'%20width%3D'3'%20height%3D'1'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'7'%20y%3D'4'%20width%3D'2'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'11'%20y%3D'4'%20width%3D'3'%20height%3D'1'%20fill%3D'%235a5446'%2F%3E%3Crect%20x%3D'16'%20y%3D'4'%20width%3D'2'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'18'%20y%3D'4'%20width%3D'3'%20height%3D'1'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'21'%20y%3D'4'%20width%3D'2'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'4'%20y%3D'5'%20width%3D'1'%20height%3D'2'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'5'%20y%3D'5'%20width%3D'1'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'6'%20y%3D'5'%20width%3D'1'%20height%3D'2'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'11'%20y%3D'5'%20width%3D'3'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'5'%20width%3D'1'%20height%3D'2'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'19'%20y%3D'5'%20width%3D'1'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'20'%20y%3D'5'%20width%3D'1'%20height%3D'2'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'5'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'7'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'8'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'9'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'10'%20y%3D'6'%20width%3D'5'%20height%3D'1'%20fill%3D'%2316140f'%2F%3E%3Crect%20x%3D'15'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'16'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'17'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'19'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'4'%20y%3D'7'%20width%3D'3'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'7'%20y%3D'7'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'8'%20y%3D'7'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'9'%20y%3D'7'%20width%3D'7'%20height%3D'1'%20fill%3D'%230c0d10'%2F%3E%3Crect%20x%3D'16'%20y%3D'7'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'17'%20y%3D'7'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'18'%20y%3D'7'%20width%3D'3'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'4'%20y%3D'8'%20width%3D'2'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'6'%20y%3D'8'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'7'%20y%3D'8'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'17'%20y%3D'8'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'8'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'19'%20y%3D'8'%20width%3D'2'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'2'%20y%3D'9'%20width%3D'4'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'6'%20y%3D'9'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'7'%20y%3D'9'%20width%3D'1'%20height%3D'7'%20fill%3D'%230c0d10'%2F%3E%3Crect%20x%3D'17'%20y%3D'9'%20width%3D'1'%20height%3D'7'%20fill%3D'%231c1a15'%2F%3E%3Crect%20x%3D'18'%20y%3D'9'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'19'%20y%3D'9'%20width%3D'4'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'1'%20y%3D'10'%20width%3D'5'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'6'%20y%3D'10'%20width%3D'1'%20height%3D'5'%20fill%3D'%2316140f'%2F%3E%3Crect%20x%3D'18'%20y%3D'10'%20width%3D'1'%20height%3D'5'%20fill%3D'%235a5446'%2F%3E%3Crect%20x%3D'19'%20y%3D'10'%20width%3D'5'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'1'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%23c2b79a'%2F%3E%3Crect%20x%3D'2'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%239a9079'%2F%3E%3Crect%20x%3D'3'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%237a7260'%2F%3E%3Crect%20x%3D'4'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%235a5446'%2F%3E%3Crect%20x%3D'5'%20y%3D'11'%20width%3D'1'%20height%3D'4'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'19'%20y%3D'11'%20width%3D'1'%20height%3D'4'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'20'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%234f4838'%2F%3E%3Crect%20x%3D'21'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%23443e31'%2F%3E%3Crect%20x%3D'22'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%233a352a'%2F%3E%3Crect%20x%3D'23'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%2325221b'%2F%3E%3Crect%20x%3D'1'%20y%3D'14'%20width%3D'4'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'20'%20y%3D'14'%20width%3D'4'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'1'%20y%3D'15'%20width%3D'1'%20height%3D'9'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'2'%20y%3D'15'%20width%3D'4'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'6'%20y%3D'15'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'15'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'19'%20y%3D'15'%20width%3D'4'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'23'%20y%3D'15'%20width%3D'1'%20height%3D'9'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'2'%20y%3D'16'%20width%3D'4'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'6'%20y%3D'16'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'7'%20y%3D'16'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'17'%20y%3D'16'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'16'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'19'%20y%3D'16'%20width%3D'4'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'6'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'7'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'8'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'9'%20y%3D'17'%20width%3D'7'%20height%3D'1'%20fill%3D'%231c1a15'%2F%3E%3Crect%20x%3D'16'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'17'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'18'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'2'%20y%3D'18'%20width%3D'2'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'4'%20y%3D'18'%20width%3D'1'%20height%3D'3'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'5'%20y%3D'18'%20width%3D'2'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'7'%20y%3D'18'%20width%3D'1'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'8'%20y%3D'18'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'9'%20y%3D'18'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'10'%20y%3D'18'%20width%3D'5'%20height%3D'1'%20fill%3D'%235a5446'%2F%3E%3Crect%20x%3D'15'%20y%3D'18'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'16'%20y%3D'18'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'17'%20y%3D'18'%20width%3D'1'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'18'%20y%3D'18'%20width%3D'2'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'20'%20y%3D'18'%20width%3D'1'%20height%3D'3'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'21'%20y%3D'18'%20width%3D'2'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'5'%20y%3D'19'%20width%3D'1'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'6'%20y%3D'19'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'8'%20y%3D'19'%20width%3D'1'%20height%3D'4'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'9'%20y%3D'19'%20width%3D'1'%20height%3D'4'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'10'%20y%3D'19'%20width%3D'5'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'15'%20y%3D'19'%20width%3D'1'%20height%3D'4'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'16'%20y%3D'19'%20width%3D'1'%20height%3D'4'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'18'%20y%3D'19'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'19'%20y%3D'19'%20width%3D'1'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'5'%20y%3D'20'%20width%3D'2'%20height%3D'1'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'10'%20y%3D'20'%20width%3D'1'%20height%3D'5'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'11'%20y%3D'20'%20width%3D'3'%20height%3D'1'%20fill%3D'%234f4838'%2F%3E%3Crect%20x%3D'14'%20y%3D'20'%20width%3D'1'%20height%3D'5'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'20'%20width%3D'2'%20height%3D'1'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'4'%20y%3D'21'%20width%3D'3'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'11'%20y%3D'21'%20width%3D'3'%20height%3D'1'%20fill%3D'%23443e31'%2F%3E%3Crect%20x%3D'18'%20y%3D'21'%20width%3D'3'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'11'%20y%3D'22'%20width%3D'3'%20height%3D'1'%20fill%3D'%233a352a'%2F%3E%3Crect%20x%3D'2'%20y%3D'23'%20width%3D'8'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'11'%20y%3D'23'%20width%3D'3'%20height%3D'1'%20fill%3D'%2325221b'%2F%3E%3Crect%20x%3D'15'%20y%3D'23'%20width%3D'8'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'1'%20y%3D'24'%20width%3D'9'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'11'%20y%3D'24'%20width%3D'3'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'15'%20y%3D'24'%20width%3D'9'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3C%2Fsvg%3E")
    12 / 12px / 6px stretch;
  background-color: var(--dfo-bg-window);
  background-image: var(--dfo-bg-dither-img);
  background-size: var(--dfo-bg-dither-size);
  box-shadow: 4px 4px 0 6px rgba(0, 0, 0, 0.45), 0 18px 46px rgba(0, 0, 0, 0.82);
  border-radius: 0;
  outline: none;
}
.dfo-sb-shell .dfo-subpanel-frame {
  border: 2px solid;
  border-color: #9a9079 #3a352a #25221b #7a7260;
  background-color: var(--dfo-bg-panel);
  box-shadow: 0 0 0 1px #050608, inset 0 0 0 1px rgba(5, 6, 8, 0.75), inset 0 3px 0 -1px rgba(255, 255, 255, 0.04), 3px 3px 0 1px rgba(0, 0, 0, 0.4);
  outline: none;
}
.dfo-sb-shell .dfo-well-frame {
  border: 2px solid;
  border-color: #25221b #7a7260 #9a9079 #3a352a;
  background-color: var(--dfo-bg-well);
  box-shadow: 0 0 0 1px #050608, inset 2px 2px 0 rgba(0, 0, 0, 0.52);
  outline: none;
}
.dfo-sb-shell .dfo-accent-panel {
  --dfo-panel-c: #9a9079;
  --dfo-panel-rgb: 154, 144, 121;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background-color: var(--dfo-bg-panel);
  background-image: linear-gradient(180deg, rgba(var(--dfo-panel-rgb), 0.08) 0, rgba(var(--dfo-panel-rgb), 0.024) clamp(32px, 18%, 104px), rgba(var(--dfo-panel-rgb), 0) clamp(60px, 36%, 200px));
  border: 2px solid;
  border-color: var(--dfo-panel-c) #3a352a #25221b #7a7260;
  box-shadow: 0 0 0 1px #050608, inset 0 0 0 1px rgba(5, 6, 8, 0.75), inset 0 3px 0 -1px rgba(255, 255, 255, 0.04), 2px 2px 0 1px rgba(0, 0, 0, 0.38);
  border-radius: 0;
}
.dfo-sb-shell .dfo-scroll { overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #756346 #0c0e11; }
.dfo-sb-shell .dfo-scroll::-webkit-scrollbar { width: 7px; height: 7px; }
.dfo-sb-shell .dfo-scroll::-webkit-scrollbar-track { background: #0c0e11; border-left: 1px solid rgba(117, 99, 70, 0.2); }
.dfo-sb-shell .dfo-scroll::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #5e4f37, #3e3424); border: 1px solid #14171c; border-radius: 2px; }
.dfo-sb-shell .dfo-scroll::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, #7d6949, #544630); }

/* Ornate Buttons [C-01] */
.dfo-sb-shell .dfo-ornate-btn {
  --dfo-c: #d4b16a;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 29px;
  padding: 5px 12px;
  border: 1px solid #6e5c3e;
  border-top-color: #9e8355;
  border-bottom-color: #3b301f;
  border-radius: 1px;
  background: linear-gradient(180deg, #272219 0%, #191510 55%, #120f0b 100%);
  box-shadow: inset 0 1px 0 rgba(255, 224, 150, 0.14), inset 0 -1px 0 rgba(0, 0, 0, 0.72), 0 1px 2px rgba(0, 0, 0, 0.55);
  color: #f1e6c8;
  font-family: var(--dfo-font-ui, 'DFO Gabin', sans-serif);
  font-size: 12px;
  letter-spacing: 0.03em;
  line-height: 1.15;
  text-shadow: 0 1px 0 #000;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  transition: filter 120ms ease, transform 80ms ease, border-color 120ms ease;
}
.dfo-sb-shell .dfo-ornate-btn::before { content: ""; position: absolute; inset: 2px; border: 1px solid rgba(213, 178, 110, 0.24); pointer-events: none; }
.dfo-sb-shell .dfo-ornate-btn::after {
  content: ""; position: absolute; inset: 2px; pointer-events: none;
  background:
    linear-gradient(var(--dfo-c), var(--dfo-c)) top left / 5px 1px no-repeat, linear-gradient(var(--dfo-c), var(--dfo-c)) top left / 1px 5px no-repeat,
    linear-gradient(var(--dfo-c), var(--dfo-c)) top right / 5px 1px no-repeat, linear-gradient(var(--dfo-c), var(--dfo-c)) top right / 1px 5px no-repeat,
    linear-gradient(var(--dfo-c), var(--dfo-c)) bottom left / 5px 1px no-repeat, linear-gradient(var(--dfo-c), var(--dfo-c)) bottom left / 1px 5px no-repeat,
    linear-gradient(var(--dfo-c), var(--dfo-c)) bottom right / 5px 1px no-repeat, linear-gradient(var(--dfo-c), var(--dfo-c)) bottom right / 1px 5px no-repeat;
}
.dfo-sb-shell .dfo-ornate-btn:hover:not(:disabled) { filter: brightness(1.16); border-color: #9e8355; border-top-color: #d5b26e; }
.dfo-sb-shell .dfo-ornate-btn:active:not(:disabled) { transform: translateY(1px); filter: brightness(0.95); }
.dfo-sb-shell .dfo-ornate-btn:disabled { opacity: 0.45; cursor: default; filter: grayscale(0.4); }
.dfo-sb-shell .dfo-ornate-btn.on, .dfo-sb-shell .dfo-ornate-btn.primary {
  --dfo-c: #fde68a; border-color: #a6823f; border-top-color: #e4c175; border-bottom-color: #4f3b18;
  background: linear-gradient(180deg, #4b391a 0%, #2f230e 56%, #1f1709 100%); color: #fde68a;
}
.dfo-sb-shell .dfo-ornate-btn.on::before, .dfo-sb-shell .dfo-ornate-btn.primary::before { border-color: rgba(253, 230, 138, 0.32); }
.dfo-sb-shell .dfo-ornate-btn.close {
  --dfo-c: #f08a80; border-color: #a1463e #4c1b18 #2d0e0c #782e28; color: #fce0dc;
  background: repeating-linear-gradient(-45deg, rgba(176, 56, 48, 0.22) 0 4px, rgba(16, 7, 9, 0.34) 4px 8px), linear-gradient(180deg, #3d1618 0%, #250c0e 58%, #160709 100%);
  box-shadow: 0 0 0 1px #050608, inset 0 0 0 1px rgba(240, 138, 128, 0.18), inset 0 1px 0 rgba(255, 204, 198, 0.16);
}
.dfo-sb-shell .dfo-ornate-btn.close:hover:not(:disabled) {
  --dfo-c: #ffb0a7; border-color: #c85a46; color: #fff0ee;
  background: repeating-linear-gradient(-45deg, rgba(212, 78, 66, 0.28) 0 4px, rgba(22, 9, 11, 0.28) 4px 8px), linear-gradient(180deg, #521d20 0%, #341114 58%, #200a0c 100%);
}
.dfo-sb-shell .dfo-ornate-btn.silver {
  --dfo-c: #93c5fd; border-color: #4b719f; border-top-color: #7dd3fc; border-bottom-color: #1e3454;
  background: linear-gradient(180deg, #243b5c 0%, #16263d 56%, #0f1a2c 100%); color: #e0f2fe;
}
.dfo-sb-shell .dfo-ornate-btn.is-ready {
  --dfo-c: #7fe3b5; border-color: #2e8b6b; border-top-color: #52c298; border-bottom-color: #163d31;
  background: linear-gradient(180deg, #225c4a 0%, #163d31 100%); color: #a7f3d0;
}
.dfo-sb-shell .dfo-ornate-btn.danger {
  --dfo-c: #ff9f98; border-color: #8f3730; border-top-color: #c9564c; border-bottom-color: #3f1512;
  background: linear-gradient(180deg, #4c1b18 0%, #2d110f 56%, #1c0a09 100%); color: #fecaca;
}
.dfo-sb-shell .dfo-ornate-btn.arcane {
  --dfo-c: #93c5fd; border-color: #3f63a8; border-top-color: #7fb2f0; border-bottom-color: #162442;
  background: repeating-linear-gradient(135deg, rgba(147, 197, 253, 0.12) 0 4px, transparent 4px 10px), linear-gradient(180deg, #243c69 0%, #162646 56%, #0d172c 100%);
  color: #e0f2fe;
}

.dfo-sb-shell .dfo-chip {
  display: inline-block; padding: 2px 7px; border-radius: 2px;
  border: 1px solid rgba(192, 138, 62, 0.36); background: rgba(15, 18, 24, 0.85);
  font-size: 10.5px; letter-spacing: 0.04em; text-transform: uppercase; color: #e7d6a9; white-space: nowrap;
}
.dfo-sb-shell .dfo-chip.chip-gold   { border-color: rgba(245, 212, 81, 0.5); color: #f5d451; background: rgba(68, 52, 20, 0.44); }
.dfo-sb-shell .dfo-chip.chip-red    { border-color: rgba(224, 88, 74, 0.58); color: #ff9f98; background: rgba(88, 28, 24, 0.46); }
.dfo-sb-shell .dfo-chip.chip-purple { border-color: rgba(192, 132, 252, 0.52); color: #dfb8ff; background: rgba(62, 32, 92, 0.44); }

/* Header */
.dfo-sb-head {
  flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 8px 14px;
  background-image: var(--dfo-bg-win-head); border-bottom: 1px solid #050608;
  box-shadow: 0 1px 0 rgba(163, 152, 128, 0.26), inset 0 1px 0 rgba(255, 255, 255, 0.05);
}
.dfo-sb-head-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
.dfo-sb-head-ico { width: 22px; height: 22px; flex: 0 0 22px; filter: drop-shadow(0 1px 2px #000); }
.dfo-sb-title {
  margin: 0; font-size: 21px; font-weight: 400; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--dfo-title-gold); text-shadow: 0 2px 0 #000, 0 0 8px rgba(0, 0, 0, 0.85);
}
.dfo-sb-head-meta { display: inline-flex; align-items: center; gap: 6px; }
.dfo-sb-notice {
  flex: 1 1 auto; text-align: center; font-size: 12px; color: var(--dfo-emerald-text);
  text-shadow: 0 1px 0 #000; opacity: 0; transition: opacity 150ms ease; pointer-events: none;
}
.dfo-sb-notice.is-visible { opacity: 1; }
.dfo-sb-head-right { display: inline-flex; align-items: center; gap: 8px; flex: 0 0 auto; }

.dfo-sb-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 10px; padding: 10px 12px 12px; overflow: hidden; }

/* Top Full-Width Panel */
.dfo-sb-top-panel {
  flex: 0 0 auto; display: grid; grid-template-columns: minmax(0, 1.95fr) minmax(440px, 1fr);
  gap: 10px; align-items: stretch; position: relative; z-index: 30;
}
.dfo-sb-top-left { padding: 9px 12px; display: flex; flex-direction: column; justify-content: space-between; gap: 9px; }
.dfo-sb-top-right { padding: 8px 10px; display: flex; flex-direction: column; justify-content: center; }

.dfo-sb-mana-block { display: flex; flex-direction: column; gap: 5px; cursor: help; outline: none; }
.dfo-sb-mana-top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.dfo-sb-mana-lbl-wrap { display: inline-flex; align-items: center; gap: 7px; }
.dfo-sb-mana-ico { width: 17px; height: 17px; flex: 0 0 17px; filter: drop-shadow(0 1px 1px #000); }
.dfo-sb-mana-lbl { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--dfo-label-brass); text-shadow: 0 1px 0 #000; }
.dfo-sb-mana-readout { display: inline-flex; align-items: center; gap: 8px; font-variant-numeric: tabular-nums; text-shadow: 0 1px 0 #000; }
.dfo-sb-mana-mp { font-size: 19px; line-height: 1; color: #bae6fd; letter-spacing: 0.02em; }
.dfo-sb-mana-mp.is-low { color: #fcd34d; }
.dfo-sb-mana-dot { font-size: 20px; line-height: 1; color: #d5b26e; transform: translateY(-1px); }
.dfo-sb-mana-regen { font-size: 14.5px; line-height: 1; color: #7fe3b5; letter-spacing: 0.02em; }
.dfo-sb-mana-regen.is-zero { color: #8c826e; }

.dfo-sb-mana-bar { position: relative; width: 100%; height: 18px; overflow: hidden; }
.dfo-sb-mana-fill {
  position: relative; height: 100%; width: 50%;
  background: linear-gradient(180deg, #7dd3fc 0%, #38bdf8 26%, #1d4ed8 78%, #172554 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.42), inset 0 -1px 0 rgba(0, 0, 0, 0.55), 0 0 12px rgba(56, 189, 248, 0.35);
  transition: width 180ms ease;
}
.dfo-sb-mana-fill.is-low {
  background: linear-gradient(180deg, #fde68a 0%, #f59e0b 32%, #b45309 82%, #451a03 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 0 10px rgba(245, 158, 11, 0.35);
}
.dfo-sb-mana-ticks { position: absolute; inset: 0; pointer-events: none; }
.dfo-sb-mana-tick { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(5, 6, 8, 0.55); }

.dfo-sb-controls-row { display: grid; grid-template-columns: minmax(0, 1fr) 216px 286px; gap: 8px; align-items: center; }
.dfo-sb-search { display: flex; align-items: center; gap: 7px; height: 32px; min-width: 0; padding: 3px 9px; background: var(--dfo-bg-input); }
.dfo-sb-search:focus-within { border-color: #d5b26e; box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(213, 178, 110, 0.35); }
.dfo-sb-search-ico { width: 15px; height: 15px; flex: 0 0 15px; filter: drop-shadow(0 1px 1px #000); }
.dfo-sb-search-input { flex: 1 1 0%; min-width: 0; height: 100%; border: 0; outline: 0; background: transparent; color: #f6e7b0; font-size: 13px; }
.dfo-sb-search-input::placeholder { color: #8f8570; }
.dfo-sb-search-input::-webkit-search-cancel-button { display: none; }
.dfo-sb-search-count { flex: 0 0 auto; font-size: 11px; color: #dec37f; padding: 1px 6px; background: rgba(28, 31, 38, 0.86); border: 1px solid rgba(117, 99, 70, 0.5); border-radius: 1px; }
.dfo-sb-search-clear { flex: 0 0 20px; width: 20px; height: 20px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border: 1px solid rgba(117, 99, 70, 0.55); background: rgba(28, 31, 38, 0.9); color: #d8cfae; cursor: pointer; border-radius: 1px; }
.dfo-sb-search-clear:hover { border-color: #d5b26e; color: #f6e7b0; background: rgba(48, 38, 21, 0.9); }
.dfo-sb-search-clear[hidden] { display: none; }
.dfo-sb-clear-ico { width: 12px; height: 12px; }

/* Container-format School Dropdown */
.dfo-sb-dd { position: relative; min-width: 0; width: 100%; }
.dfo-sb-dd .dfo-sb-dd-btn { width: 100%; min-width: 0; height: 32px; min-height: 32px; padding: 4px 9px 4px 10px; justify-content: space-between; font-size: 12px; }
.dfo-sb-dd.is-open .dfo-sb-dd-btn { --dfo-c: #fde68a; border-color: #c59b4d; border-top-color: #f3cf86; border-bottom-color: #5c4318; color: #fde68a; filter: brightness(1.12); }
.dfo-sb-dd .dfo-dd-lead { display: inline-flex; align-items: center; gap: 6px; min-width: 0; flex: 1 1 auto; overflow: hidden; }
.dfo-sb-dd .dfo-dd-ico { width: 15px; height: 15px; flex: 0 0 15px; display: block; filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.9)); }
.dfo-sb-dd .dfo-dd-pip { width: 7px; height: 7px; flex: 0 0 7px; transform: rotate(45deg); background: var(--dfo-pip-c, #d5b26e); border: 1px solid #050608; }
.dfo-sb-dd .dfo-dd-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dfo-sb-dd .dfo-dd-tail { display: inline-flex; align-items: center; gap: 5px; flex: 0 0 auto; }
.dfo-sb-dd .dfo-dd-count { font-size: 10.5px; line-height: 1.15; padding: 1px 5px; color: #dec37f; background: rgba(12, 14, 18, 0.78); border: 1px solid rgba(192, 138, 62, 0.42); border-radius: 1px; }
.dfo-sb-dd.is-filtered .dfo-dd-count { color: #fde68a; background: rgba(24, 18, 8, 0.82); border-color: rgba(245, 212, 81, 0.58); }
.dfo-sb-dd .dfo-dd-caret { width: 12px; height: 12px; flex: 0 0 12px; display: block; transition: transform 140ms ease; }
.dfo-sb-dd.is-open .dfo-dd-caret { transform: rotate(180deg); }
.dfo-sb-dd .dfo-sb-dd-menu {
  display: none; position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 9600; max-height: 290px;
  padding: 5px; flex-direction: column; gap: 3px; background-color: var(--dfo-bg-panel-elevated);
  background-image: linear-gradient(180deg, rgba(213, 178, 110, 0.12) 0%, rgba(213, 178, 110, 0.02) 42px, transparent 96px);
  border: 2px solid; border-color: #a5997e #413a2d #252119 #7e7562;
  box-shadow: 0 0 0 1px #050608, inset 0 0 0 1px rgba(5, 6, 8, 0.85), 0 12px 28px rgba(0, 0, 0, 0.92);
}
.dfo-sb-dd.is-open .dfo-sb-dd-menu { display: flex; }
.dfo-sb-dd .dfo-sb-dd-opt {
  width: 100%; min-height: 28px; padding: 5px 8px; display: flex; align-items: center; justify-content: space-between; gap: 7px;
  background: var(--dfo-bg-row); border: 1px solid rgba(117, 99, 70, 0.32); border-left: 3px solid var(--dfo-opt-c, #8a7b61);
  border-radius: 1px; color: var(--dfo-bone); font-size: 11.5px; letter-spacing: 0.03em; text-transform: uppercase; text-shadow: 0 1px 0 #000; cursor: pointer;
}
.dfo-sb-dd .dfo-sb-dd-opt:hover { background: var(--dfo-bg-row-hover); border-color: rgba(213, 178, 110, 0.58); border-left-color: var(--dfo-opt-c, #d5b26e); color: #f6e7b0; }
.dfo-sb-dd .dfo-sb-dd-opt.is-selected { background: linear-gradient(90deg, rgba(213, 178, 110, 0.20), rgba(78, 127, 114, 0.22)); border-color: rgba(213, 178, 110, 0.72); border-left-color: var(--dfo-opt-c, #f5d451); color: #fde68a; }
.dfo-sb-dd .dfo-opt-lead { display: inline-flex; align-items: center; gap: 6px; min-width: 0; flex: 1 1 auto; }
.dfo-sb-dd .dfo-opt-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dfo-sb-dd .dfo-opt-tail { display: inline-flex; align-items: center; gap: 4px; flex: 0 0 auto; }
.dfo-sb-dd .dfo-opt-count { font-size: 10.5px; padding: 1px 5px; color: #c8ba9b; background: rgba(8, 10, 14, 0.76); border: 1px solid rgba(117, 99, 70, 0.42); }
.dfo-sb-dd .dfo-opt-check { font-size: 9px; color: #f5d451; }

.dfo-sb-sort-btn { width: 100%; height: 32px; min-height: 32px; justify-content: flex-start !important; padding: 4px 10px !important; }
.dfo-sb-sort-ico { width: 15px; height: 15px; flex: 0 0 15px; }
.dfo-sb-sort-lbl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 3x2 Skills Grid + 4-Color Modifier Rule */
.dfo-sb-skills-grid { flex: 1 1 auto; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); gap: 6px; }
.dfo-sb-skill-cell {
  display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 10px;
  background: var(--dfo-bg-well); border: 1px solid rgba(117, 99, 70, 0.46); border-left: 3px solid var(--dfo-sk-c, #9a9079);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.65); cursor: help; outline: none;
  transition: border-color 120ms ease, background-color 120ms ease;
}
.dfo-sb-skill-cell:hover, .dfo-sb-skill-cell:focus-visible { border-color: rgba(213, 178, 110, 0.85); border-left-color: var(--dfo-sk-c, #d5b26e); background: rgba(20, 24, 32, 0.94); }
.dfo-sb-sk-left { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.dfo-sb-sk-ico { width: 16px; height: 16px; flex: 0 0 16px; filter: drop-shadow(0 1px 1px #000); }
.dfo-sb-sk-abbr { font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--dfo-title-cream); text-shadow: 0 1px 0 #000; }
.dfo-sb-sk-val { font-size: 21px; line-height: 1; text-shadow: 0 1px 0 #000, 0 0 6px rgba(0, 0, 0, 0.75); }
.dfo-sb-sk-val.tone-base   { color: #ffffff; }
.dfo-sb-sk-val.tone-debuff { color: #f87171; }
.dfo-sb-sk-val.tone-buff   { color: #4ade80; }
.dfo-sb-sk-val.tone-mixed  { color: #facc15; }

/* Virtualized Spell List Well */
.dfo-sb-list-well { flex: 1 1 auto; min-height: 0; padding: 7px 8px; contain: strict; }
.dfo-sb-list { position: relative; display: flex; flex-direction: column; gap: 5px; }
.dfo-sb-spacer { flex: 0 0 auto; width: 100%; pointer-events: none; }
.dfo-sb-custom-banner {
  padding: 5px 10px; background: linear-gradient(90deg, rgba(213, 178, 110, 0.14), rgba(213, 178, 110, 0.04));
  border: 1px solid rgba(213, 178, 110, 0.45); color: #fde68a; font-size: 11.5px; text-align: center;
}
.dfo-sb-hotbar-div { display: flex; align-items: center; gap: 10px; margin: 4px 4px 3px; padding: 2px 0; user-select: none; }
.dfo-sb-hotbar-div-line { flex: 1 1 auto; height: 1px; background: linear-gradient(90deg, transparent 0%, rgba(192, 138, 62, 0.48) 35%, rgba(245, 212, 81, 0.78) 100%); }
.dfo-sb-hotbar-div-line.is-right { background: linear-gradient(90deg, rgba(245, 212, 81, 0.78) 0%, rgba(192, 138, 62, 0.48) 65%, transparent 100%); }
.dfo-sb-hotbar-div-label {
  flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px;
  font-size: 10.5px; letter-spacing: 0.09em; text-transform: uppercase; color: #f5d451;
  background: rgba(14, 17, 23, 0.88); border: 1px solid rgba(213, 178, 110, 0.52); border-radius: 1px;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.65); text-shadow: 0 1px 0 #000;
}
.dfo-sb-hotbar-div-gem { font-size: 9px; line-height: 1; color: #f5d451; }
.dfo-sb-empty-box { padding: 48px 20px; display: flex; flex-direction: column; align-items: center; gap: 12px; color: var(--dfo-dim); }
.dfo-sb-empty-msg { margin: 0; font-size: 14px; }

/* Fluid Drag-and-Drop */
.dfo-sb-dragging-active, .dfo-sb-dragging-active * { cursor: grabbing !important; user-select: none !important; }
.dfo-sb-card.is-drag-source { display: none !important; }
.dfo-sb-drop-gap {
  position: relative; border: 1px dashed rgba(245, 212, 81, 0.88);
  background: linear-gradient(90deg, rgba(var(--dfo-gap-rgb, 213, 178, 110), 0.16) 0%, rgba(245, 212, 81, 0.09) 45%, rgba(245, 212, 81, 0.04) 100%);
  box-shadow: inset 0 0 18px rgba(245, 212, 81, 0.2), 0 0 12px rgba(245, 212, 81, 0.22);
  pointer-events: none; transition: height 140ms ease;
}
.dfo-sb-drop-gap::after {
  content: ''; position: absolute; left: 14px; right: 14px; top: 50%; height: 2px; margin-top: -1px;
  background: linear-gradient(90deg, transparent, rgba(253, 230, 138, 0.82) 15%, rgba(253, 230, 138, 0.82) 85%, transparent);
  box-shadow: 0 0 8px rgba(253, 230, 138, 0.65);
}
.dfo-sb-drag-ghost {
  position: fixed; z-index: 9800; pointer-events: none; overflow: hidden; border: 1px solid #f5d451;
  background-color: var(--dfo-bg-panel-elevated);
  background-image: linear-gradient(90deg, rgba(var(--dfo-lead-sch-rgb, var(--dfo-panel-rgb, 213, 178, 110)), 0.22) 0%, rgba(var(--dfo-lead-sch-rgb, var(--dfo-panel-rgb, 213, 178, 110)), 0.09) 36%, rgba(16, 20, 28, 0.94) 100%);
  box-shadow: inset 3px 0 0 rgba(var(--dfo-lead-sch-rgb, var(--dfo-panel-rgb, 213, 178, 110)), 0.85), 0 14px 32px rgba(0, 0, 0, 0.82), 0 0 14px rgba(245, 212, 81, 0.28);
  opacity: 0.96; will-change: transform;
}

/* Spell Card Strips & Expandable Panels */
.dfo-sb-card {
  contain: layout style;
  border: 1px solid rgba(117, 99, 70, 0.42); border-top: 2px solid rgba(154, 144, 121, 0.62);
  background-color: var(--dfo-bg-row); background-image: none;
  box-shadow: 0 0 0 1px #050608, inset 0 0 0 1px rgba(0, 0, 0, 0.68);
  transition: border-color 180ms ease, background-color 180ms ease, box-shadow 220ms ease;
}
.dfo-sb-card:not(.is-open) {
  box-shadow: inset 3px 0 0 rgba(var(--dfo-lead-sch-rgb, var(--dfo-panel-rgb, 213, 178, 110)), 0.56), 0 0 0 1px #050608, inset 0 0 0 1px rgba(0, 0, 0, 0.68);
}
.dfo-sb-card.is-pinned-hotbar:not(.is-open) { border-color: rgba(213, 178, 110, 0.54); border-top-color: rgba(245, 212, 81, 0.72); }
.dfo-sb-card:not(.is-open) .dfo-sb-card-head {
  background-image: linear-gradient(90deg, rgba(var(--dfo-lead-sch-rgb, var(--dfo-panel-rgb, 213, 178, 110)), 0.13) 0%, rgba(var(--dfo-lead-sch-rgb, var(--dfo-panel-rgb, 213, 178, 110)), 0.055) 26%, rgba(var(--dfo-lead-sch-rgb, var(--dfo-panel-rgb, 213, 178, 110)), 0.015) 56%, rgba(10, 12, 16, 0) 100%);
}
.dfo-sb-card:hover:not(.is-open) { background-color: var(--dfo-bg-row-hover); border-color: rgba(213, 178, 110, 0.64); border-top-color: var(--dfo-lead-sch-c, var(--dfo-panel-c, #d5b26e)); }
.dfo-sb-card:hover:not(.is-open) .dfo-sb-card-head {
  background-image: linear-gradient(90deg, rgba(var(--dfo-lead-sch-rgb, var(--dfo-panel-rgb, 213, 178, 110)), 0.19) 0%, rgba(var(--dfo-lead-sch-rgb, var(--dfo-panel-rgb, 213, 178, 110)), 0.08) 32%, rgba(var(--dfo-lead-sch-rgb, var(--dfo-panel-rgb, 213, 178, 110)), 0.02) 64%, rgba(10, 12, 16, 0) 100%);
}
.dfo-sb-card.is-open {
  border: 2px solid; border-color: var(--dfo-panel-c) #3a352a #25221b #7a7260; background-color: var(--dfo-bg-panel);
  background-image: linear-gradient(180deg, rgba(var(--dfo-panel-rgb), 0.13) 0, rgba(var(--dfo-panel-rgb), 0.045) clamp(42px, 18%, 110px), rgba(var(--dfo-panel-rgb), 0) clamp(84px, 38%, 220px));
  box-shadow: 0 0 0 1px #050608, inset 0 0 0 1px rgba(5, 6, 8, 0.78), 0 8px 22px rgba(0, 0, 0, 0.55);
}

.dfo-sb-card-head {
  display: grid; grid-template-columns: 34px var(--dfo-sb-spell-box-px) minmax(160px, 1fr) 114px 36px auto 84px;
  align-items: center; gap: 10px; min-height: 54px; padding: 4px 12px; cursor: pointer; user-select: none; outline: none;
}
.dfo-sb-card-head.is-draggable { cursor: grab; }
.dfo-sb-card.is-open .dfo-sb-card-head {
  background-image: linear-gradient(90deg, rgba(var(--dfo-lead-sch-rgb, var(--dfo-panel-rgb)), 0.16) 0%, rgba(var(--dfo-lead-sch-rgb, var(--dfo-panel-rgb)), 0.05) 38%, transparent 100%), var(--dfo-bg-header);
  border-bottom: 1px solid rgba(var(--dfo-panel-rgb), 0.36);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.dfo-sb-marker { display: flex; align-items: center; justify-content: center; width: 34px; height: 26px; }
.dfo-sb-bullet { font-size: 12px; color: #c08a3e; opacity: 0.72; text-shadow: 0 1px 0 #000; }
.dfo-sb-card:hover .dfo-sb-bullet, .dfo-sb-card.is-open .dfo-sb-bullet { color: #f5d451; opacity: 1; }
.dfo-sb-keycap {
  display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 24px; padding: 0 6px;
  font-size: 13px; line-height: 1; color: #fde68a; background: linear-gradient(180deg, #3c301c 0%, #1d160b 100%);
  border: 1px solid #c08a3e; border-top-color: #f3cf86; border-bottom-color: #5c3b10; border-radius: 2px;
  box-shadow: 0 0 0 1px #050608, inset 0 1px 0 rgba(255, 240, 190, 0.22);
}

.dfo-sb-spell-ico-box {
  width: var(--dfo-sb-spell-box-px); height: var(--dfo-sb-spell-box-px); flex: 0 0 var(--dfo-sb-spell-box-px);
  display: flex; align-items: center; justify-content: center; background: rgba(8, 10, 14, 0.92);
  border: 1px solid rgba(163, 152, 128, 0.5); box-shadow: inset 0 0 0 1px #050608; overflow: hidden;
}
.dfo-sb-spell-ico { width: var(--dfo-sb-spell-ico-px); height: var(--dfo-sb-spell-ico-px); object-fit: fill; image-rendering: pixelated; display: block; }
.dfo-sb-sigil { font-size: 17px; color: #f5d451; letter-spacing: 0.04em; text-shadow: 0 1px 0 #000; }

.dfo-sb-spell-name-wrap { display: flex; align-items: center; gap: 7px; min-width: 0; }
.dfo-sb-spell-name { font-size: 16.5px; letter-spacing: 0.04em; color: var(--dfo-title-gold); text-shadow: 0 1px 0 #000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dfo-sb-rename-pen {
  width: 24px; height: 24px; padding: 0; flex: 0 0 24px; display: inline-flex; align-items: center; justify-content: center;
  background: rgba(14, 17, 23, 0.65); border: 1px solid rgba(117, 99, 70, 0.4); border-radius: 2px; color: #b7a071; opacity: 0.65; cursor: pointer;
}
.dfo-sb-card:hover .dfo-sb-rename-pen, .dfo-sb-rename-pen:hover, .dfo-sb-rename-pen:focus-visible { opacity: 1; border-color: rgba(213, 178, 110, 0.72); background: rgba(34, 28, 18, 0.9); color: #fde68a; }
.dfo-sb-pen-ico { width: 14px; height: 14px; display: block; }

.dfo-sb-head-rename-form { display: flex; align-items: center; gap: 5px; width: min(440px, 100%); min-width: 0; }
.dfo-sb-head-rename-input {
  flex: 1 1 auto; min-width: 140px; height: 30px; padding: 2px 10px; background: var(--dfo-bg-input);
  border: 1px solid #d5b26e; box-shadow: inset 1px 1px 3px rgba(0, 0, 0, 0.8), 0 0 6px rgba(213, 178, 110, 0.25);
  color: #f6e7b0; font-size: 15px; letter-spacing: 0.03em; outline: none;
}
.dfo-sb-head-rename-act { width: 28px; height: 30px; padding: 0; flex: 0 0 28px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid #63533a; cursor: pointer; }
.dfo-sb-head-rename-act.is-ok { border-color: #2e8b6b; color: #7fe3b5; background: linear-gradient(180deg, #225c4a 0%, #163d31 100%); }
.dfo-sb-head-rename-act.is-cancel { border-color: rgba(143, 55, 48, 0.72); color: #ff9f98; background: linear-gradient(180deg, #3c1714 0%, #240d0c 100%); }
.dfo-sb-head-rename-ico { width: 14px; height: 14px; display: block; }
.dfo-sb-ready-pill { flex: 0 0 auto; padding: 1px 6px; font-size: 10px; letter-spacing: 0.08em; color: #7fe3b5; background: rgba(22, 61, 49, 0.65); border: 1px solid rgba(82, 194, 152, 0.65); }

/* Right Quick Controls */
.dfo-sb-quick-acts { display: inline-flex; align-items: center; gap: 6px; }
.dfo-sb-head-btn {
  --dfo-c: #d4b16a; position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 5px;
  height: 28px; min-height: 28px; max-height: 28px; padding: 0 10px; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase;
  border-radius: 1px; border: 1px solid #6e5c3e; border-top-color: #9e8355; border-bottom-color: #3b301f;
  background: linear-gradient(180deg, #272219 0%, #191510 55%, #120f0b 100%); color: #f1e6c8; white-space: nowrap; cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255, 224, 150, 0.14), inset 0 -1px 0 rgba(0, 0, 0, 0.72), 0 1px 2px rgba(0, 0, 0, 0.55);
}
.dfo-sb-head-btn::before { content: ''; position: absolute; inset: 2px; border: 1px solid rgba(213, 178, 110, 0.22); pointer-events: none; }
.dfo-sb-head-btn::after {
  content: ''; position: absolute; inset: 2px; pointer-events: none;
  background:
    linear-gradient(var(--dfo-c), var(--dfo-c)) top left / 4px 1px no-repeat, linear-gradient(var(--dfo-c), var(--dfo-c)) top left / 1px 4px no-repeat,
    linear-gradient(var(--dfo-c), var(--dfo-c)) top right / 4px 1px no-repeat, linear-gradient(var(--dfo-c), var(--dfo-c)) top right / 1px 4px no-repeat,
    linear-gradient(var(--dfo-c), var(--dfo-c)) bottom left / 4px 1px no-repeat, linear-gradient(var(--dfo-c), var(--dfo-c)) bottom left / 1px 4px no-repeat,
    linear-gradient(var(--dfo-c), var(--dfo-c)) bottom right / 4px 1px no-repeat, linear-gradient(var(--dfo-c), var(--dfo-c)) bottom right / 1px 4px no-repeat;
}
.dfo-sb-head-btn:hover:not(:disabled) { filter: brightness(1.16); border-color: #d5b26e; color: #fde68a; }
.dfo-sb-head-btn.is-ready-btn { flex: 0 0 120px; width: 120px; min-width: 120px; max-width: 120px; padding: 0 8px; }
.dfo-sb-head-btn.is-ready-btn.is-on { --dfo-c: #7fe3b5; border-color: #2e8b6b; border-top-color: #52c298; border-bottom-color: #163d31; background: linear-gradient(180deg, #225c4a 0%, #163d31 100%); color: #a7f3d0; }
.dfo-sb-head-btn.is-unbind-btn { flex: 0 0 92px; width: 92px; min-width: 92px; max-width: 92px; padding: 0 8px; }
.dfo-sb-head-btn.is-unbind-btn:disabled, .dfo-sb-head-btn.is-unbind-btn.is-empty { opacity: 0.34; cursor: default; border-color: rgba(99, 83, 58, 0.45); color: #8c826e; }
.dfo-sb-del-div { height: 24px; }
.dfo-sb-head-btn.is-del-btn { flex: 0 0 28px; width: 28px; min-width: 28px; max-width: 28px; height: 28px; padding: 0; border-color: #7c3029; border-top-color: #a9473f; border-bottom-color: #36120f; background: linear-gradient(180deg, #431815 0%, #260e0d 100%); color: #fecaca; }
.dfo-sb-head-btn.is-del-btn::before, .dfo-sb-head-btn.is-del-btn::after { display: none; }
.dfo-sb-head-btn.is-del-btn:hover:not(:disabled) { border-color: #ef6a5f; color: #ffffff; }
.dfo-sb-head-btn.is-del-btn.is-protected { opacity: 0.42; cursor: not-allowed; }
.dfo-sb-head-btn-ico { width: 15px; height: 15px; flex: 0 0 15px; display: block; }

.dfo-sb-schools-band { display: flex; align-items: center; justify-content: space-between; gap: 8px; height: 26px; }
.dfo-sb-vdiv { width: 1px; height: 22px; flex: 0 0 1px; background: linear-gradient(180deg, transparent, rgba(213, 178, 110, 0.68), transparent); }
.dfo-sb-school-seq { flex: 1 1 auto; display: flex; align-items: center; justify-content: center; gap: 6px; }
.dfo-sb-school-slot { width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; background: rgba(8, 10, 14, 0.85); border: 1px solid color-mix(in srgb, var(--dfo-sch-c, #756346) 55%, rgba(117, 99, 70, 0.4)); border-radius: 2px; }
.dfo-sb-sch-ico { width: 18px; height: 18px; display: block; }
.dfo-sb-target-slot { display: flex; align-items: center; justify-content: center; }
.dfo-sb-target-badge { width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: #e7d6a9; background: rgba(10, 12, 16, 0.85); border: 1px solid rgba(117, 99, 70, 0.48); border-radius: 2px; }
.dfo-sb-target-ico { width: 18px; height: 18px; display: block; }

.dfo-sb-cost-slot { display: inline-flex; align-items: center; justify-content: flex-end; gap: 6px; padding: 3px 8px; background: rgba(8, 12, 20, 0.82); border: 1px solid rgba(56, 189, 248, 0.34); border-radius: 2px; }
.dfo-sb-cost-val { font-size: 16px; line-height: 1; color: #bae6fd; text-shadow: 0 1px 0 #000; }
.dfo-sb-cost-ico { width: 15px; height: 15px; flex: 0 0 15px; }
.dfo-sb-cost-slot.is-short { border-color: rgba(226, 87, 76, 0.65); background: rgba(42, 12, 12, 0.72); }
.dfo-sb-cost-slot.is-short .dfo-sb-cost-val { color: #ff9f98; }
.dfo-sb-cost-slot.is-free { border-color: rgba(82, 194, 152, 0.55); background: rgba(14, 38, 30, 0.68); }
.dfo-sb-cost-slot.is-free .dfo-sb-cost-val { color: #7fe3b5; }

/* Expanded 3-Column Body */
.dfo-sb-card-collapse { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease; }
.dfo-sb-card.is-open .dfo-sb-card-collapse { grid-template-rows: 1fr; opacity: 1; }
.dfo-sb-card-collapse-inner { min-height: 0; overflow: hidden; }
.dfo-sb-card-body { display: grid; grid-template-columns: 396px minmax(0, 1fr) 372px; gap: 10px; padding: 10px 12px 12px; align-items: stretch; }
@media (max-width: 1380px) {
  .dfo-sb-top-panel { grid-template-columns: minmax(0, 1.55fr) minmax(360px, 1fr); }
  .dfo-sb-card-body { grid-template-columns: 320px minmax(0, 1fr) 310px; }
  .dfo-sb-controls-row { grid-template-columns: minmax(150px, 1fr) 150px 214px; }
}

.dfo-sb-viz-col { display: flex; flex-direction: column; justify-content: center; }
.dfo-sb-viz-well { position: relative; width: 100%; aspect-ratio: 350 / 281; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #050608; }
.dfo-sb-viz-canvas { width: 100%; height: 100%; display: block; cursor: pointer; }
.dfo-sb-viz-tag { position: absolute; left: 7px; top: 7px; padding: 2px 7px; font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase; background: rgba(8, 10, 14, 0.82); border: 1px solid rgba(192, 138, 62, 0.55); pointer-events: none; }
.dfo-sb-viz-pause { position: absolute; right: 7px; top: 7px; width: 24px; height: 22px; padding: 0; display: inline-flex; align-items: center; justify-content: center; background: rgba(10, 12, 16, 0.82); border: 1px solid rgba(117, 99, 70, 0.65); color: #e7d6a9; font-size: 11px; cursor: pointer; }
.dfo-sb-viz-pause:hover, .dfo-sb-viz-pause.is-paused { border-color: #d5b26e; color: #fde68a; }

.dfo-sb-mid-col { display: flex; flex-direction: column; justify-content: space-between; gap: 8px; min-width: 0; }
.dfo-sb-fx-slots { display: flex; flex-direction: column; gap: 6px; flex: 1 1 auto; }
.dfo-sb-fx-row {
  flex: 1 1 0; display: flex; align-items: center; gap: 10px; padding: 8px 10px;
  background: var(--dfo-bg-well); border: 1px solid rgba(117, 99, 70, 0.38); border-left: 3px solid var(--dfo-fx-c, #756346);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.65); transition: border-color 140ms ease, background-color 140ms ease, box-shadow 140ms ease;
}
.dfo-sb-fx-row.has-fx-tip { cursor: help; }
.dfo-sb-fx-row.has-fx-tip:hover, .dfo-sb-fx-row.has-fx-tip:focus-visible {
  border-color: color-mix(in srgb, var(--dfo-fx-c, #d5b26e) 68%, rgba(213, 178, 110, 0.45));
  background: rgba(14, 18, 26, 0.94); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.72), 0 0 10px color-mix(in srgb, var(--dfo-fx-c, #d5b26e) 18%, transparent); outline: none;
}
.dfo-sb-fx-row.is-empty { align-items: center; min-height: 44px; border-style: dashed; border-left-style: dashed; border-left-color: rgba(117, 99, 70, 0.45); background: rgba(8, 10, 14, 0.52); color: #7e7562; }
.dfo-sb-fx-tip-badge { width: 17px; height: 17px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; color: #b7a071; background: rgba(14, 17, 23, 0.9); border: 1px solid rgba(117, 99, 70, 0.52); border-radius: 2px; }
.dfo-sb-fx-row.has-fx-tip:hover .dfo-sb-fx-tip-badge { color: #fde68a; border-color: #d5b26e; }
.dfo-sb-fx-num-wrap { display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 0 0 22px; }
.dfo-sb-fx-num { width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; color: #f6e7b0; background: rgba(14, 17, 23, 0.9); border: 1px solid rgba(163, 152, 128, 0.42); }
.dfo-sb-fx-sch-ico { width: 15px; height: 15px; display: block; }
.dfo-sb-fx-empty-txt { font-size: 12px; color: #7e7562; }
.dfo-sb-fx-content { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.dfo-sb-fx-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.dfo-sb-fx-title-grp { display: inline-flex; align-items: center; gap: 7px; min-width: 0; }
.dfo-sb-fx-name { font-size: 14px; color: var(--dfo-title-gold); text-shadow: 0 1px 0 #000; }
.dfo-sb-fx-sch-chip { padding: 1px 6px; font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--dfo-sch-c, #e7d6a9); border: 1px solid color-mix(in srgb, var(--dfo-sch-c, #756346) 45%, transparent); background: rgba(8, 10, 14, 0.72); }
.dfo-sb-fx-stats { display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.dfo-sb-fx-warn-ico { width: 17px; height: 17px; display: inline-flex; align-items: center; justify-content: center; cursor: help; }
.dfo-sb-fx-warn-svg { width: 16px; height: 16px; }
.dfo-sb-fx-formula { font-size: 11.5px; line-height: 1.3; color: var(--dfo-dim); }

.dfo-sb-icon-bar { display: flex; align-items: center; gap: 10px; padding: 7px 10px; }
.dfo-sb-icon-preview {
  width: var(--dfo-sb-spell-box-px); height: var(--dfo-sb-spell-box-px); flex: 0 0 var(--dfo-sb-spell-box-px);
  display: flex; align-items: center; justify-content: center; overflow: hidden;
  background: radial-gradient(circle, var(--dfo-el-glow, rgba(213, 178, 110, 0.24)) 0%, rgba(8, 10, 13, 0.96) 80%);
}
.dfo-sb-icon-preview img { width: var(--dfo-sb-spell-ico-px); height: var(--dfo-sb-spell-ico-px); object-fit: fill; image-rendering: pixelated; display: block; }
.dfo-sb-icon-preview-sigil { font-size: 17px; color: #f5d451; }
.dfo-sb-icon-meta { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dfo-sb-icon-title { font-size: 12.5px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--dfo-title-cream); }
.dfo-sb-icon-sub { font-size: 11.5px; color: var(--dfo-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dfo-sb-icon-btns { display: inline-flex; align-items: center; gap: 6px; flex: 0 0 auto; }

.dfo-sb-right-col { display: flex; flex-direction: column; justify-content: space-between; gap: 8px; }
.dfo-sb-extra-info { flex: 1 1 auto; padding: 0; display: flex; flex-direction: column; }
.dfo-sb-subhead { padding: 5px 10px; background-image: var(--dfo-bg-header); border-bottom: 1px solid rgba(117, 99, 70, 0.45); font-size: 12.5px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--dfo-title-cream); text-shadow: 0 1px 0 #000; }
.dfo-sb-subhead::before { content: '◆ '; font-size: 9px; color: #c08a3e; margin-right: 4px; vertical-align: 1px; }
.dfo-sb-info-kv { width: 100%; border-collapse: collapse; font-size: 12px; }
.dfo-sb-info-kv th, .dfo-sb-info-kv td { padding: 5px 10px; border-bottom: 1px solid rgba(117, 99, 70, 0.2); vertical-align: middle; }
.dfo-sb-info-kv tr:last-child th, .dfo-sb-info-kv tr:last-child td { border-bottom: 0; }
.dfo-sb-info-kv th { text-align: left; font-weight: 400; color: var(--dfo-dim); white-space: nowrap; }
.dfo-sb-info-kv td { text-align: right; color: var(--dfo-bone-warm); }
.dfo-sb-info-kv td .is-good { color: #7fe3b5; }
.dfo-sb-info-kv td .is-bad  { color: #ff9f98; }
.dfo-sb-info-kv td .is-bound { color: #fde68a; }
.dfo-sb-info-kv td .is-dim { color: #8c826e; }
.dfo-sb-kv-badge { display: inline-flex; align-items: center; gap: 5px; }
.dfo-sb-el-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--dfo-el-c, #e879f9); box-shadow: 0 0 5px var(--dfo-el-c, #e879f9); }
.dfo-sb-kv-ico { width: 14px; height: 14px; color: #e7d6a9; }
.dfo-sb-info-note { margin-top: auto; padding: 7px 10px; border-top: 1px solid rgba(117, 99, 70, 0.28); background: rgba(8, 10, 14, 0.52); font-size: 12.5px; line-height: 1.4; color: #d8cfb8; }
.dfo-sb-actions-bar { padding: 7px 8px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.dfo-sb-actions-bar .dfo-ornate-btn { width: 100%; height: 32px; min-height: 32px; max-height: 32px; }

/* Canonical Hover Tooltip [O-01] */
.dfo-status-tip.dfo-sb-tip {
  position: fixed; z-index: 10060; pointer-events: none; box-sizing: border-box;
  min-width: 290px; max-width: min(460px, 92vw); text-transform: none; color: #f1e6c8;
  background: linear-gradient(180deg, rgba(24, 28, 35, 0.98) 0%, rgba(12, 14, 18, 0.98) 100%);
  border: 2px solid; border-color: #a5997e #413a2d #252119 #7e7562;
  box-shadow: 0 0 0 1px #050608, inset 0 0 0 1px rgba(5, 6, 8, 0.82), 0 12px 28px rgba(0, 0, 0, 0.92);
  border-radius: 1px;
}
.dfo-status-tip.dfo-sb-tip * { text-transform: none; }
.dfo-status-tip.dfo-sb-tip .dfo-st-card-k, .dfo-status-tip.dfo-sb-tip .dfo-st-fk { text-transform: uppercase; }
.dfo-status-tip.dfo-sb-tip .dfo-st-head {
  display: flex; align-items: center; gap: 7px; padding: 7px 12px; font-size: 13px; letter-spacing: 0.04em; color: #f5d451;
  text-shadow: 0 1px 0 #000; background: linear-gradient(180deg, rgba(48, 38, 21, 0.88), rgba(20, 17, 12, 0.94));
  border-bottom: 1px solid rgba(192, 138, 62, 0.45);
}
.dfo-status-tip.dfo-sb-tip .dfo-st-head-ico { width: 15px; height: 15px; flex: 0 0 15px; }
.dfo-status-tip.dfo-sb-tip .dfo-st-body { padding: 9px 12px 11px; display: flex; flex-direction: column; gap: 5px; }
.dfo-status-tip.dfo-sb-tip .dfo-st-cards { display: flex; flex-direction: column; gap: 5px; margin-bottom: 2px; }
.dfo-status-tip.dfo-sb-tip .dfo-st-card {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 10px;
  background: linear-gradient(180deg, rgba(14, 17, 23, 0.95), rgba(8, 10, 14, 0.96)); border: 1px solid rgba(117, 99, 70, 0.52); border-left: 3px solid #d4aa4f;
}
.dfo-status-tip.dfo-sb-tip .dfo-st-card.is-gold   { border-left-color: #f5d451; }
.dfo-status-tip.dfo-sb-tip .dfo-st-card.is-shards { border-left-color: #38bdf8; }
.dfo-status-tip.dfo-sb-tip .dfo-st-card.is-loc    { border-left-color: #f59e0b; }
.dfo-status-tip.dfo-sb-tip .dfo-st-card.is-aurum  { border-left-color: #e0584a; }
.dfo-status-tip.dfo-sb-tip .dfo-st-card.is-embers { border-left-color: #2e8b6b; }
.dfo-status-tip.dfo-sb-tip .dfo-st-card-l { display: flex; align-items: center; gap: 6px; min-width: 0; }
.dfo-status-tip.dfo-sb-tip .dfo-st-card-ico { width: 14px; height: 14px; flex: 0 0 14px; }
.dfo-status-tip.dfo-sb-tip .dfo-st-card-k { font-size: 11px; letter-spacing: 0.03em; color: #d6c8a8; text-transform: uppercase; }
.dfo-status-tip.dfo-sb-tip .dfo-st-card-v { font-size: 15px; }
.dfo-status-tip.dfo-sb-tip .dfo-st-info { display: flex; flex-direction: column; gap: 4px; padding: 7px 9px; background: rgba(7, 9, 12, 0.72); border: 1px solid rgba(117, 99, 70, 0.34); }
.dfo-status-tip.dfo-sb-tip .dfo-st-fk { font-size: 10.5px; letter-spacing: 0.05em; text-transform: uppercase; color: #dec37f; }
.dfo-status-tip.dfo-sb-tip .dfo-st-fv { font-size: 12.2px; line-height: 1.38; color: #e8dfd0; text-shadow: 0 1px 0 #000; }
.dfo-status-tip.dfo-sb-tip .dfo-st-line { font-size: 12px; line-height: 1.35; color: #ece2c8; text-shadow: 0 1px 0 #000; }
.dfo-status-tip.dfo-sb-tip .dfo-st-line.is-good   { color: #7fe3b5; }
.dfo-status-tip.dfo-sb-tip .dfo-st-line.is-bad    { color: #ff9f98; }
.dfo-status-tip.dfo-sb-tip .dfo-st-line.is-center { color: #fcd34d; }
.dfo-status-tip.dfo-sb-tip .dfo-st-sep { height: 1px; margin: 3px 0; background: linear-gradient(90deg, transparent, rgba(192, 138, 62, 0.45), transparent); }

/* Modals */
.dfo-sb-modal-scrim { position: fixed; inset: 0; z-index: 9500; display: flex; align-items: center; justify-content: center; background: var(--dfo-bg-scrim); }
.dfo-sb-icon-modal { width: min(856px, 94vw); height: min(742px, 90vh); display: flex; flex-direction: column; overflow: visible; }
.dfo-sb-modal-head { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; padding: 8px 14px; background-image: var(--dfo-bg-win-head); border-bottom: 1px solid #050608; }
.dfo-sb-modal-title-wrap { display: flex; align-items: center; gap: 10px; }
.dfo-sb-modal-title-wrap h2 { margin: 0; font-size: 18px; font-weight: 400; letter-spacing: 0.06em; text-transform: uppercase; color: var(--dfo-title-gold); }
.dfo-sb-icon-tabs { flex: 0 0 auto; display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 12px 6px; border-bottom: 1px solid rgba(192, 138, 62, 0.24); }
.dfo-sb-icon-tab { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; background: var(--dfo-bg-button); border: 1px solid rgba(117, 99, 70, 0.3); color: var(--dfo-dim); font-size: 11.5px; cursor: pointer; }
.dfo-sb-icon-tab:hover { color: var(--dfo-bone-warm); border-color: rgba(192, 138, 62, 0.55); }
.dfo-sb-icon-tab.on { color: var(--dfo-title-gold); background: var(--dfo-bg-button-hover); border-color: rgba(192, 138, 62, 0.68); box-shadow: inset 0 -2px 0 #c08a3e; }
.dfo-sb-icon-tab-dot { width: 6px; height: 6px; border-radius: 50%; }
.dfo-sb-icon-tab-cnt { font-size: 11px; color: #8c826e; }
.dfo-sb-icon-grid-well { flex: 1 1 auto; min-height: 0; margin: 8px 12px 12px; padding: 8px 10px; display: flex; flex-direction: column; gap: 8px; }
.dfo-sb-shell .dfo-sm-school-sec { display: flex; flex-direction: column; gap: 4px; padding: 5px 8px 6px; background: rgba(12, 15, 21, 0.64); border: 1px solid rgba(117, 99, 70, 0.26); border-left: 2px solid var(--sm-sch-c, #756346); }
.dfo-sb-shell .dfo-sm-school-sec-head { display: flex; align-items: center; justify-content: space-between; padding-bottom: 2px; border-bottom: 1px solid rgba(117, 99, 70, 0.2); }
.dfo-sb-shell .dfo-sm-school-sec-name { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--dfo-bone-warm); }
.dfo-sb-shell .dfo-sm-school-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--sm-sch-c, #d5b26e); }
.dfo-sb-shell .dfo-sm-school-sec-meta { display: inline-flex; align-items: center; gap: 6px; }
.dfo-sb-shell .dfo-sm-school-custom-badge { font-size: 9.5px; padding: 0 5px; color: #7fe3b5; border: 1px solid rgba(46, 139, 107, 0.6); }
.dfo-sb-shell .dfo-sm-school-sec-cnt { font-size: 11px; color: #8c826e; }
.dfo-sb-shell .dfo-sm-icongrid { display: grid; grid-template-columns: repeat(auto-fill, var(--dfo-sb-spell-box-px)); gap: 5px; }
.dfo-sb-shell .dfo-sm-iconcell { position: relative; width: var(--dfo-sb-spell-box-px); height: var(--dfo-sb-spell-box-px); padding: 0; overflow: hidden; background: linear-gradient(180deg, rgba(24, 28, 36, 0.94), rgba(10, 12, 16, 0.98)); border: 1px solid #63533a; cursor: pointer; }
.dfo-sb-shell .dfo-sm-iconcell:hover { border-color: #f5d451; transform: translateY(-1px); }
.dfo-sb-shell .dfo-sm-iconcell.on { border: 1px solid #52c298; box-shadow: inset 0 0 0 1px #52c298, inset 0 0 10px rgba(127, 227, 181, 0.55), 0 0 8px rgba(46, 139, 107, 0.65); }
.dfo-sb-shell .dfo-sm-iconcell img { display: block; width: var(--dfo-sb-spell-ico-px); height: var(--dfo-sb-spell-ico-px); object-fit: fill; image-rendering: pixelated; }

.dfo-sb-del-modal { width: min(440px, 92vw); display: flex; flex-direction: column; overflow: hidden; }
.dfo-sb-del-head { padding: 9px 14px; background-image: var(--dfo-bg-header); border-bottom: 1px solid #050608; box-shadow: 0 1px 0 rgba(163, 152, 128, 0.26); }
.dfo-sb-del-title { font-size: 15px; letter-spacing: 0.05em; text-transform: uppercase; color: #ff9f98; }
.dfo-sb-del-body { padding: 14px; }
.dfo-sb-del-msg { margin: 0; font-size: 13px; line-height: 1.45; color: var(--dfo-bone-warm); }
.dfo-sb-del-acts { display: flex; justify-content: flex-end; gap: 8px; padding: 8px 14px 11px; border-top: 1px solid rgba(117, 99, 70, 0.32); background: var(--dfo-bg-footer); }

/* Override dfo_fonts.js @layer dfo-community-fonts explicitly per F-02 typography role */
@layer dfo-community-fonts {
  :root body .dfo-sb-shell :is(.dfo-sb-title, .dfo-sb-spell-name, .dfo-sb-head-rename-input, .dfo-sb-fx-name, .dfo-sb-subhead, .dfo-sb-icon-title, .dfo-sb-modal-title-wrap h2, .dfo-sb-del-title),
  :root body .dfo-status-tip.dfo-sb-tip .dfo-st-head {
    font-family: var(--dfo-font-title, 'DFO Greengoth', 'DFO Gabin', sans-serif) !important;
  }
  :root body .dfo-sb-shell :is(.dfo-sb-mana-mp, .dfo-sb-mana-regen, .dfo-sb-sk-val, .dfo-sb-cost-val, .dfo-sb-keycap, .dfo-sb-fx-num, .dfo-sb-search-count, .dfo-sb-dd .dfo-dd-count, .dfo-sb-dd-opt .dfo-opt-count, .dfo-sb-icon-tab-cnt, .dfo-sm-school-sec-cnt),
  :root body .dfo-status-tip.dfo-sb-tip .dfo-st-card-v {
    font-family: var(--dfo-font-number, 'DFO Flexi', 'DFO Gabin', sans-serif) !important;
    font-variant-numeric: tabular-nums;
  }
  :root body .dfo-sb-shell :is(.dfo-sb-fx-formula, .dfo-sb-fx-formula *, .dfo-sb-info-note, .dfo-sb-info-note *),
  :root body .dfo-status-tip.dfo-sb-tip :is(.dfo-st-fv, .dfo-st-fv *) {
    font-family: var(--dfo-font-description, 'DFO Flow', 'DFO Gabin', sans-serif) !important;
    letter-spacing: 0.01em !important;
  }
  :root body .dfo-sb-shell :is(.dfo-sb-sigil, .dfo-sb-icon-preview-sigil) {
    font-family: var(--dfo-font-sigil, 'DFO Ckazka', 'DFO Flexi', serif) !important;
  }
}
`;

  function ensureStyle(doc) {
    if (!doc?.head || doc.getElementById(STYLE_ID)) return;
    const st = doc.createElement('style');
    st.id = STYLE_ID;
    st.textContent = SPELLBOOK_CSS;
    doc.head.append(st);
  }

  // ── Pure Live Game Inspection Helpers (Skills, Modifiers, Regen, Effects) ──
  function effectKey(ef) {
    if (!ef || ef.type == null || ef.type < 0) return null;
    const sub = ef.subType == null || ef.subType < 0 ? 255 : (ef.subType & 255);
    const key = `${ef.type},${sub}`;
    const byKey = root.__dfoSpellmakerData?.EFFECT_BY_KEY;
    if (sub === 0 && byKey && !byKey.has(key) && byKey.has(`${ef.type},255`)) {
      return `${ef.type},255`;
    }
    return key;
  }

  function spellSigil(name, bridge) {
    if (bridge?.sigilNoIcon) {
      try {
        const s = bridge.sigilNoIcon(name);
        if (s) return s;
      } catch {}
    }
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function resolveEffectInfo(ef, entity, ru) {
    const key = effectKey(ef);
    const SMData = root.__dfoSpellmakerData;
    const SMCat = root.__dfoSpellmakerCatalog;
    const rawDef = key && SMData?.EFFECT_BY_KEY ? SMData.EFFECT_BY_KEY.get(key) : null;
    const spec = key && SMData?.getEffectSpec ? SMData.getEffectSpec(key) : null;
    const details = rawDef && SMCat?.getEffectDetails ? SMCat.getEffectDetails(rawDef, entity, ru ? 'ru' : 'en') : null;
    const schoolId = details?.schoolId ?? spec?.schoolId ?? 22;
    const school = SCHOOL_META[schoolId] || SCHOOL_META[22];
    const nameRu = details?.nameRu || rawDef?.nameRu || key || '';
    const nameEn = details?.nameEn || rawDef?.nameEn || key || '';
    const mechanicsList = ru ? details?.mechanicsRu : details?.mechanicsEn;
    let descText = Array.isArray(mechanicsList) && mechanicsList.length ? mechanicsList.join(' ') : '';
    if (!descText && key && SMData?.VANILLA_DESCRIPTIONS) {
      const fb = (ru ? SMData.VANILLA_DESCRIPTIONS_RU?.[key] : null) || SMData.VANILLA_DESCRIPTIONS[key];
      if (Array.isArray(fb) && fb.length) descText = fb.join(' ');
    }
    return {
      key,
      rawDef,
      spec,
      schoolId,
      school,
      name: ru ? nameRu : nameEn,
      nameRu,
      nameEn,
      descText,
      warning: details?.warning || null,
      skillBoosted: Boolean(details?.skillBoosted),
      hasDuration: Boolean(rawDef?.duration),
      hasChance: Boolean(rawDef?.chance),
      hasMagnitude: Boolean(rawDef?.magnitude),
    };
  }

  function computeEffectOutcome(ef, info, level) {
    const lvl = Math.max(1, Math.round(Number(level) || 1));
    const out = {};
    if (info.hasDuration) {
      const per = Math.max(1, ef.durationPerLevel || 1);
      const b = ef.durationBase || 0;
      const p = ef.durationMod || 0;
      out.duration = { b, p, per, rounds: b + p * Math.max(1, Math.floor(lvl / per)) };
    }
    if (info.hasChance) {
      const per = Math.max(1, ef.chancePerLevel || 1);
      const b = ef.chanceBase || 0;
      const p = ef.chanceMod || 0;
      const cap = ef.type === 20 ? 50 : 100;
      const raw = b + p * Math.floor(lvl / per);
      out.chance = { b, p, per, pct: Math.max(0, Math.min(cap, raw)) };
    }
    if (info.hasMagnitude) {
      const per = Math.max(1, ef.magnitudePerLevel || 1);
      const steps = Math.floor(lvl / per);
      const bLo = ef.magnitudeBaseLow || 0;
      const bHi = ef.magnitudeBaseHigh || 0;
      const pLo = ef.magnitudeLevelBase || 0;
      const pHi = ef.magnitudeLevelHigh || 0;
      out.magnitude = {
        bLo,
        bHi,
        pLo,
        pHi,
        per,
        lo: bLo + pLo * steps,
        hi: bHi + pHi * steps,
      };
    }
    return out;
  }

  function computeFallbackCost(spell, entity) {
    if (!spell) return 5;
    if (spell.tag === 'lycanthrope') return 0;
    if (spell.minimumCastingCost) return spell.sp ?? 5;
    const SMData = root.__dfoSpellmakerData;
    if (SMData?.calcSpellCost && Array.isArray(spell.effects) && spell.effects.length) {
      const slots = [];
      for (let i = 0; i < Math.min(3, spell.effects.length); i++) {
        const ef = spell.effects[i];
        if (!ef || ef.type == null || ef.type < 0) continue;
        slots.push({
          type: ef.type,
          subType: ef.subType == null || ef.subType < 0 ? 255 : (ef.subType & 255),
          settings: {
            durationBase: ef.durationBase ?? 1,
            durationMod: ef.durationMod ?? 1,
            durationPerLevel: ef.durationPerLevel ?? 1,
            chanceBase: ef.chanceBase ?? 1,
            chanceMod: ef.chanceMod ?? 1,
            chancePerLevel: ef.chancePerLevel ?? 1,
            magnitudeBaseLow: ef.magnitudeBaseLow ?? 1,
            magnitudeBaseHigh: ef.magnitudeBaseHigh ?? 1,
            magnitudeLevelBase: ef.magnitudeLevelBase ?? 1,
            magnitudeLevelHigh: ef.magnitudeLevelHigh ?? 1,
            magnitudePerLevel: ef.magnitudePerLevel ?? 1,
          },
        });
      }
      if (slots.length) {
        try {
          const res = SMData.calcSpellCost(slots, spell.rangeType ?? 0, entity);
          if (res && Number.isFinite(res.sp) && res.sp > 0) return Math.max(5, Math.round(res.sp));
        } catch {}
      }
    }
    return Math.max(0, Math.round(Number(spell.sp) || 5));
  }

  function uniqueWornItems(entity) {
    const out = [];
    const seenObj = new Set();
    const seenUid = new Set();
    const rawSlots = Array.isArray(entity?.equip?.slots)
      ? entity.equip.slots
      : (Array.isArray(entity?.items) ? entity.items.filter((it) => it && it.equipSlot != null) : []);
    for (let i = 0; i < rawSlots.length; i++) {
      const it = rawSlots[i];
      if (!it || typeof it !== 'object' || seenObj.has(it)) continue;
      if (it.uid != null) {
        if (seenUid.has(it.uid)) continue;
        seenUid.add(it.uid);
      }
      seenObj.add(it);
      out.push(it);
    }
    return out;
  }

  function collectSkillSnapshot(entity, sid, env, shared = null) {
    const hasEnv = Boolean(env?.skillEffective);
    const hasOverride = entity?.skillOverrides && entity.skillOverrides[sid] != null;
    const raw = env?.skillRaw
      ? Math.round(Number(env.skillRaw(entity, sid)) || 0)
      : Math.round(Number(entity?.skills?.[sid] ?? 0) || 0);
    const effective = hasEnv
      ? Math.round(Number(env.skillEffective(entity, sid)) || 0)
      : raw;

    const mods = [];
    if (!hasOverride && hasEnv) {
      const capped = env.skillCappedBase ? Math.round(Number(env.skillCappedBase(entity, sid)) || raw) : raw;
      if (capped !== raw) {
        mods.push({
          delta: capped - raw,
          label: T(raw >= 100 ? 'spellbook.mod.softcap' : 'spellbook.mod.mentor'),
        });
      }

      const worn = shared?.worn ?? uniqueWornItems(entity);
      const enhType = env.enhancesSkillType;
      let enchSum = 0;
      if (enhType != null) {
        for (const it of worn) {
          if ((it.currentCondition ?? 1) <= 0 || !Array.isArray(it.enchantments)) continue;
          for (const ch of it.enchantments) {
            if (ch && ch.type === enhType && ch.param === sid) {
              enchSum += 15;
              const nm = localItemText(it.shortName || it.name || '');
              mods.push({ delta: 15, label: T('spellbook.mod.enchant', { item: nm }) });
            }
          }
        }
      }
      const totalEnch = Math.round(Number(entity?._enchantMods?.skillMods?.[sid] ?? 0) || 0);
      if (totalEnch !== enchSum) {
        mods.push({ delta: totalEnch - enchSum, label: T('spellbook.mod.enchant', { item: T('spellbook.mod.lootRarity') }) });
      }

      if (Array.isArray(entity?.activeEffects)) {
        for (const ef of entity.activeEffects) {
          if (!ef || ef.kind !== 'racialOverride' || ef.ended) continue;
          const d = Math.round(Number(ef.skillMods?.[sid] ?? 0) || 0);
          if (!d) continue;
          const label = ef.racial === 'vampirism'
            ? T('spellbook.mod.vampire')
            : ef.racial === 'lycanthropy'
              ? T('spellbook.mod.lycanthrope')
              : T('spellbook.mod.other', { id: String(ef.racial || 'racial') });
          mods.push({ delta: d, label });
        }
      }

      const folds = shared?.folds ?? (env.inspectModFolds ? env.inspectModFolds(entity) : []);
      for (const f of folds) {
        const fd = Math.round(Number(f?.skills?.[sid] ?? 0) || 0);
        if (!fd) continue;
        if (f.id === 'lootRarity') {
          let affixSum = 0;
          for (const it of worn) {
            if (!Array.isArray(it.affixes)) continue;
            for (const af of it.affixes) {
              if (af && af.id === 'skill' && Number(af.param) === sid) {
                const v = af.value | 0;
                if (!v) continue;
                affixSum += v;
                const nm = localItemText(it.shortName || it.name || '');
                mods.push({ delta: v, label: T('spellbook.mod.affix', { item: nm }) });
              }
            }
          }
          if (affixSum !== fd) {
            mods.push({ delta: fd - affixSum, label: T('spellbook.mod.lootRarity') });
          }
        } else {
          const k = FOLD_MOD_KEYS[f.id];
          mods.push({ delta: fd, label: k ? T(k) : T('spellbook.mod.other', { id: f.id }) });
        }
      }

      const accounted = capped + mods.reduce((acc, m) => acc + (m.delta | 0), 0) - (capped - raw);
      if (accounted !== effective) {
        mods.push({ delta: effective - accounted, label: T('spellbook.mod.other', { id: 'mod' }) });
      }
    }

    const nonZeroMods = mods.filter((m) => Number(m.delta) !== 0);
    let hasPos = false;
    let hasNeg = false;
    for (const m of nonZeroMods) {
      if (m.delta > 0) hasPos = true;
      else if (m.delta < 0) hasNeg = true;
    }
    const tone = hasPos && hasNeg ? 'mixed' : hasPos ? 'buff' : hasNeg ? 'debuff' : 'base';
    return { base: raw, current: effective, tone, mods: nonZeroMods };
  }

  function collectMagickaRegen(entity, env) {
    const cur = Math.max(0, Math.round(Number(entity?.magicka) || 0));
    const max = Math.max(1, Math.round(Number(entity?.maxMagicka) || 1));
    const sources = [];
    let attuneBlocked = false;

    const fm = env?.firmamentStats ? env.firmamentStats(entity) : null;
    if (fm && fm.mpRegen > 0) {
      sources.push({ pct: fm.mpRegen / 10, label: T('spellbook.mana.srcFirmament') });
    }

    const att = env?.inspectAttune ? env.inspectAttune(entity) : null;
    if (att?.power) {
      if (att.blocked) {
        attuneBlocked = true;
      } else {
        const isLow = cur < max / 2;
        const pct = Number(isLow ? (att.power.low ?? att.power.pct) : att.power.pct) || 0;
        if (pct > 0) {
          let itemName = '';
          for (const it of uniqueWornItems(entity)) {
            if (it?.power?.kind === 'attune' || it?.legendary?.kind === 'attune') {
              itemName = localItemText(it.shortName || it.name || '');
              break;
            }
          }
          const srcName = itemName || localItemText(att.power.name || '') || T('spellbook.mod.lootPowers');
          sources.push({
            pct,
            label: isLow ? T('spellbook.mana.srcAttuneLow', { name: srcName }) : srcName,
          });
        }
      }
    }

    if (!env && Array.isArray(entity?.regenSources)) {
      for (const s of entity.regenSources) {
        if (!s || !(Number(s.pct) > 0)) continue;
        sources.push({ pct: Number(s.pct), label: String(isRu() ? (s.ru || s.label || s.en || '') : (s.en || s.label || s.ru || '')) });
      }
    }

    let totalPct = sources.reduce((acc, s) => acc + (Number(s.pct) || 0), 0);
    if (!sources.length && !env && Number(entity?.regenPctPerRound) > 0) {
      totalPct = Number(entity.regenPctPerRound);
    }

    return { cur, max, totalPct, sources, attuneBlocked };
  }

  // ── Cache Persistence Helpers (dfo-mod-cache.json, namespace 'spellbook') ──
  function safeParseObj(str) {
    if (!str || typeof str !== 'string') return {};
    try {
      const v = JSON.parse(str);
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch {
      return {};
    }
  }

  function readLocalSpellbookCache(Rules) {
    try {
      if (!root.localStorage) return Rules.cleanState(null);
      const parsed = safeParseObj(root.localStorage.getItem(Rules.STORAGE_KEY));
      return Rules.cleanState(parsed[Rules.NAMESPACE]);
    } catch {
      return Rules.cleanState(null);
    }
  }

  function writeLocalSpellbookCache(Rules, payload) {
    try {
      if (!root.localStorage) return;
      const rootObj = safeParseObj(root.localStorage.getItem(Rules.STORAGE_KEY));
      rootObj[Rules.NAMESPACE] = payload;
      root.localStorage.setItem(Rules.STORAGE_KEY, JSON.stringify(rootObj));
    } catch {}
  }

  // ── Main Production Mount Entrypoint ──
  function mount(host, deps = {}, bridge = {}) {
    if (!host || !host.ownerDocument) return null;
    const doc = host.ownerDocument;
    const Rules = root.__dfoSpellbookRules;
    const IconReg = root.__dfoSpellIconRegistry;
    const Env = () => root.__dfoSpellbookEnv || null;

    ensureStyle(doc);
    try { bridge.ensureStyles?.(); } catch {}
    if (bridge.iconUrl && IconReg?.setLiveIconProvider) {
      try { IconReg.setLiveIconProvider(bridge.iconUrl); } catch {}
    }

    let destroyed = false;
    let noticeTimer = 0;
    let iconPollTimer = 0;
    let cacheWriteTimer = 0;
    let scrollRaf = 0;
    let expandTimer = 0;
    let expandScrollTimer = 0;
    let syncMeasureRaf = 0;
    let hotbarSyncTimer = 0;
    let measureRo = null;
    let activeTip = null;
    let dragState = null;
    let cancelActiveDrag = null;
    let lastDragEndedAt = 0;
    let dropdownOpen = false;
    let cacheWriteQueue = Promise.resolve();
    let lastHotbarSig = '';

    const entity = deps.entity || {};
    const profileKey = Rules ? Rules.profileKeyOf(entity) : 'default';
    let cacheState = Rules ? Rules.cleanState(readLocalSpellbookCache(Rules)) : { v: 1, sortMode: 'custom', orders: {}, revision: 0 };
    let lastSavedSettingsJson = (cacheState.revision || 0) > 0 && Rules
      ? JSON.stringify(Rules.cleanSettings(cacheState))
      : '';

    const state = {
      query: '',
      schoolFilter: 'all',
      sortMode: cacheState.sortMode || 'custom',
      customOrder: [],
      expandedKey: null,
      activeKey: null,
      renameKey: null,
      renameDraft: '',
      iconModalKey: null,
      iconModalSchool: 'all',
      deleteKey: null,
      notice: null,
      localReadyKey: null, // fallback only if deps.readied is not provided
    };

    const metaCache = new WeakMap();
    let evalVersion = 1;
    let hotbarVersion = 1;
    let orderKeyIndex = new Map();
    let cachedOrderKeys = null;
    let cachedOrderSpellsRef = null;
    let cachedOrderSpellsLen = -1;
    let customOrderIndex = new Map();
    let customOrderDirty = true;
    const refs = {
      shell: null,
      win: null,
      head: null,
      title: null,
      lvlChip: null,
      cntBadge: null,
      noticeEl: null,
      pvpBtn: null,
      manaBlock: null,
      manaMp: null,
      manaRegen: null,
      manaFill: null,
      skillsGrid: null,
      searchInput: null,
      searchCount: null,
      searchClear: null,
      ddWrap: null,
      ddBtn: null,
      ddMenu: null,
      sortBtn: null,
      listWell: null,
      listWrap: null,
      topSpacer: null,
      bottomSpacer: null,
      modalHost: null,
    };

    // Single reusable visualization instance across the entire Spellbook
    const viz = {
      key: null,
      ctrl: null,
      canvas: null,
      rafId: 0,
      paused: false,
      lastDrawAt: 0,
      lastTickAt: 0,
      analysis: null,
      hasFx: false,
    };

    // Virtual list runtime state
    const virt = {
      vEntries: [],
      mainEntries: [],
      totalHeight: 0,
      rowH: ROW_HEIGHT_FALLBACK,
      expandedH: EXPANDED_HEIGHT_FALLBACK,
      bannerH: BANNER_HEIGHT_FALLBACK,
      dividerH: DIVIDER_HEIGHT_FALLBACK,
      gap: 5,
      mounted: new Map(), // key -> { kind, node, vEntry }
      lastTotalCount: -1,
      lastPinnedCount: 0,
      lastMainCount: 0,
      showBanner: false,
      lastStart: -1,
      lastEnd: -1,
      rowMeasured: false,
      showingEmpty: false,
    };

    const cleanups = [];
    const onGlobal = (target, type, fn, opts) => {
      if (!target?.addEventListener) return;
      target.addEventListener(type, fn, opts);
      cleanups.push(() => target.removeEventListener(type, fn, opts));
    };

    function getSpellsArray() {
      const list = deps.spells?.();
      return Array.isArray(list) ? list : [];
    }

    function computeOrderKeys(spells) {
      if (Rules) return Rules.spellOrderKeys(spells);
      return spells.map((sp, i) => (sp && Number.isFinite(sp.index) ? `i:${Math.trunc(sp.index)}` : `n:${i}`));
    }

    function invalidateOrderCache() {
      cachedOrderKeys = null;
      cachedOrderSpellsRef = null;
      cachedOrderSpellsLen = -1;
      customOrderDirty = true;
    }

    function getCustomOrderIndex() {
      if (!customOrderDirty) return customOrderIndex;
      customOrderIndex.clear();
      for (let i = 0; i < state.customOrder.length; i++) customOrderIndex.set(state.customOrder[i], i);
      customOrderDirty = false;
      return customOrderIndex;
    }

    function reconcileCustomOrder(spells, force = false) {
      if (!force && cachedOrderKeys && spells === cachedOrderSpellsRef && spells.length === cachedOrderSpellsLen) {
        return cachedOrderKeys;
      }
      const keys = computeOrderKeys(spells);
      if (!Rules) {
        const set = new Set(keys);
        const kept = state.customOrder.filter((k) => set.has(k));
        const keptSet = new Set(kept);
        for (const k of keys) if (!keptSet.has(k)) kept.push(k);
        state.customOrder = kept;
      } else {
        const saved = state.customOrder.length ? state.customOrder : (cacheState.orders?.[profileKey] || []);
        state.customOrder = Rules.reconcileOrder(saved, keys);
      }
      cachedOrderKeys = keys;
      cachedOrderSpellsRef = spells;
      cachedOrderSpellsLen = spells.length;
      orderKeyIndex.clear();
      for (let i = 0; i < keys.length; i++) orderKeyIndex.set(keys[i], i);
      customOrderDirty = true;
      return keys;
    }

    function persistSettings({ immediate = false, gc = false } = {}) {
      if (!Rules || destroyed) return;
      if (cacheWriteTimer) {
        root.clearTimeout(cacheWriteTimer);
        cacheWriteTimer = 0;
      }
      const spells = getSpellsArray();
      const nativeKeys = computeOrderKeys(spells);
      if (gc) state.customOrder = Rules.reconcileOrder(state.customOrder, nativeKeys);
      const next = Rules.withProfileOrder(
        { ...cacheState, sortMode: state.sortMode },
        profileKey,
        state.customOrder,
        nativeKeys,
      );
      const nextJson = JSON.stringify(next);
      if (nextJson === lastSavedSettingsJson) return;

      const writeNow = () => {
        if (destroyed) return;
        const payload = { ...next, revision: (cacheState.revision || 0) + 1 };
        cacheState = payload;
        lastSavedSettingsJson = nextJson;
        writeLocalSpellbookCache(Rules, payload);
        if (!isGameHost() || typeof root.fetch !== 'function') return;
        cacheWriteQueue = cacheWriteQueue.then(async () => {
          try {
            const res = await root.fetch('/dfo-mod/spellbook-settings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
            if (res.ok) {
              const saved = Rules.cleanState(await res.json());
              cacheState = saved;
              writeLocalSpellbookCache(Rules, saved);
            } else if (res.status === 409) {
              const cur = await root.fetch('/dfo-mod/spellbook-settings', { cache: 'no-store' });
              if (cur.ok) {
                const remote = Rules.cleanState(await cur.json());
                const retryPayload = { ...next, revision: remote.revision };
                const retry = await root.fetch('/dfo-mod/spellbook-settings', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(retryPayload),
                });
                if (retry.ok) {
                  const saved = Rules.cleanState(await retry.json());
                  cacheState = saved;
                  writeLocalSpellbookCache(Rules, saved);
                }
              }
            }
          } catch {}
        });
      };

      if (immediate) writeNow();
      else cacheWriteTimer = root.setTimeout(() => { cacheWriteTimer = 0; writeNow(); }, 120);
    }

    function bootRemoteCacheSync() {
      if (!Rules || !isGameHost() || typeof root.fetch !== 'function') return;
      root.fetch('/dfo-mod/spellbook-settings', { cache: 'no-store' }).then(async (res) => {
        if (destroyed || !res?.ok) return;
        const remote = Rules.cleanState(await res.json());
        if (remote.revision > (cacheState.revision || 0)) {
          cacheState = remote;
          lastSavedSettingsJson = JSON.stringify(Rules.cleanSettings(remote));
          writeLocalSpellbookCache(Rules, remote);
          state.sortMode = remote.sortMode || 'custom';
          const nativeKeys = computeOrderKeys(getSpellsArray());
          const remoteOrder = remote.orders?.[profileKey] || [];
          state.customOrder = Rules.reconcileOrder(remoteOrder, nativeKeys);
          invalidateOrderCache();
          updateSortButtonUi();
          renderSpellList({ preserveScroll: true });
        }
      }).catch(() => {});
    }

    function playSfx(kind) {
      const env = Env();
      if (!env?.audio || !env?.clips) return;
      try {
        const clip = kind === 'open' ? env.clips.OpenBook : kind === 'edit' ? env.clips.PageTurn : env.clips.ButtonClick;
        if (clip != null) env.audio.playOneShot?.(clip, 1);
      } catch {}
    }

    function setNotice(msg) {
      state.notice = msg || null;
      if (noticeTimer) {
        root.clearTimeout(noticeTimer);
        noticeTimer = 0;
      }
      if (refs.noticeEl) {
        refs.noticeEl.textContent = state.notice || '';
        refs.noticeEl.classList.toggle('is-visible', Boolean(state.notice));
      }
      if (state.notice) {
        noticeTimer = root.setTimeout(() => {
          noticeTimer = 0;
          state.notice = null;
          if (!destroyed && refs.noticeEl) {
            refs.noticeEl.textContent = '';
            refs.noticeEl.classList.remove('is-visible');
          }
        }, 3600);
      }
    }

    // ── Canonical Hover Tooltip System ──
    function hideTip() {
      if (activeTip) {
        activeTip.remove();
        activeTip = null;
      }
    }

    function attachStatusTip(anchor, getTitle, getRows) {
      if (!anchor) return;
      const show = () => {
        if (destroyed || !anchor.isConnected || !doc.body || dragState) return;
        hideTip();
        const rows = (typeof getRows === 'function' ? getRows() : getRows) || [];
        if (!rows.length) return;
        const rawTitle = typeof getTitle === 'function' ? getTitle() : getTitle;

        const tip = el(doc, 'div', 'dfo-status-tip dfo-sb-tip');
        tip.setAttribute('role', 'tooltip');

        const head = el(doc, 'div', 'dfo-st-head');
        if (rawTitle && typeof rawTitle === 'object') {
          if (rawTitle.icon) {
            const ico = renderSvgIcon(doc, rawTitle.icon, 'dfo-st-head-ico');
            if (ico) head.append(ico);
          }
          head.append(el(doc, 'span', null, String(rawTitle.text || '')));
        } else {
          head.textContent = String(rawTitle || '');
        }

        const body = el(doc, 'div', 'dfo-st-body');
        for (const r of rows) {
          if (!r) continue;
          if (r.kind === 'sep') {
            body.append(el(doc, 'div', 'dfo-st-sep'));
          } else if (r.kind === 'cards') {
            const cards = el(doc, 'div', 'dfo-st-cards');
            for (const item of r.items || []) {
              const card = el(doc, 'div', `dfo-st-card${item.tone ? ` is-${item.tone}` : ''}`);
              const left = el(doc, 'div', 'dfo-st-card-l');
              if (item.icon) {
                const ico = renderSvgIcon(doc, item.icon, 'dfo-st-card-ico');
                if (ico) left.append(ico);
              }
              left.append(el(doc, 'span', 'dfo-st-card-k', item.label));
              const valEl = el(doc, 'span', 'dfo-st-card-v', item.value);
              if (item.color) valEl.style.color = item.color;
              card.append(left, valEl);
              cards.append(card);
            }
            body.append(cards);
          } else if (r.kind === 'info') {
            const box = el(doc, 'div', 'dfo-st-info');
            for (const f of r.fields || []) {
              const fld = el(doc, 'div', 'dfo-st-field');
              if (f.label) fld.append(el(doc, 'div', 'dfo-st-fk', f.label));
              fld.append(el(doc, 'div', 'dfo-st-fv', f.value));
              box.append(fld);
            }
            body.append(box);
          } else {
            const cls = ['dfo-st-line', r.center ? 'is-center' : '', r.tone ? `is-${r.tone}` : ''].filter(Boolean).join(' ');
            const line = el(doc, 'div', cls, r.text);
            if (r.color) line.style.color = r.color;
            body.append(line);
          }
        }

        tip.append(head, body);
        tip._anchor = anchor;
        tip.style.visibility = 'hidden';
        doc.body.append(tip);
        activeTip = tip;

        const ar = anchor.getBoundingClientRect();
        const tr = tip.getBoundingClientRect();
        const vw = root.innerWidth || 1920;
        const vh = root.innerHeight || 1080;
        const left = Math.round(Math.min(Math.max(8, ar.left), Math.max(8, vw - tr.width - 8)));
        const above = ar.top - tr.height - 8;
        const top = Math.round(above >= 8 ? above : Math.min(Math.max(8, ar.bottom + 8), Math.max(8, vh - tr.height - 8)));
        tip.style.left = `${left}px`;
        tip.style.top = `${top}px`;
        tip.style.visibility = 'visible';
      };

      const hideMatch = () => { if (activeTip?._anchor === anchor) hideTip(); };
      anchor.addEventListener('mouseenter', show);
      anchor.addEventListener('focusin', show);
      anchor.addEventListener('mouseleave', hideMatch);
      anchor.addEventListener('focusout', hideMatch);
    }

    // ── Single Reusable Spellmaker Canvas Controller (~38 FPS paced, zero leaked backing stores) ──
    function stopViz() {
      if (viz.rafId) {
        root.cancelAnimationFrame?.(viz.rafId);
        viz.rafId = 0;
      }
      if (viz.canvas) {
        try {
          viz.canvas.width = 0;
          viz.canvas.height = 0;
        } catch {}
        viz.canvas = null;
      }
      viz.lastDrawAt = 0;
      viz.lastTickAt = 0;
    }

    function buildVizSlots(spell) {
      const elemId = Number.isFinite(spell?.element) ? spell.element : 4;
      const fxs = bridge.effectsOf ? bridge.effectsOf(spell) : (spell?.effects || []);
      const SMData = root.__dfoSpellmakerData;
      return [0, 1, 2].map((idx) => {
        const ef = fxs[idx];
        if (!ef || ef.type == null || ef.type < 0) return null;
        const key = effectKey(ef);
        const spec = key && SMData?.getEffectSpec ? SMData.getEffectSpec(key) : null;
        const sid = spec?.schoolId ?? 22;
        return sid === 22 ? { school: 22, element: elemId } : sid;
      });
    }

    function startVizOnCanvas(spell, orderKey, canvas) {
      const VIZ = root.DFO_SPELLMAKER_VIZ;
      if (!VIZ || !canvas || !spell || destroyed) return;
      if (viz.canvas === canvas && viz.key === orderKey && viz.rafId && canvas.isConnected && canvas.width > 0) return;
      stopViz();
      if (viz.key !== orderKey || !viz.ctrl) {
        viz.key = orderKey;
        viz.paused = false;
        viz.ctrl = VIZ.createController({ initialTime: 0.5, initialOpen: 1.0, firstBurstAt: 2.2 });
      }
      const slots = buildVizSlots(spell);
      const hasFx = slots.some((x) => x !== null);
      const analysis = VIZ.analyzeSlots(slots);
      viz.ctrl.setOpenAmount(hasFx ? 1 : 0, hasFx);
      viz.ctrl.setHasEffects(hasFx);
      viz.canvas = canvas;
      viz.analysis = analysis;
      viz.hasFx = hasFx;

      const W = VIZ.DEFAULT_WIDTH || 350;
      const H = VIZ.DEFAULT_HEIGHT || 281;
      canvas.width = W;
      canvas.height = H;

      const drawFrame = (dtSec) => {
        if (!canvas.isConnected || destroyed) return;
        if (dtSec > 0 && !viz.paused) viz.ctrl.update(dtSec, viz.hasFx);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        try {
          VIZ.renderScene(ctx, W, H, {
            tSec: viz.ctrl.getTime(),
            flipSnapshot: viz.ctrl.getFlipSnapshot(),
            analysis: viz.analysis,
            leftTemplate: 'auto',
            rightTemplate: 'auto',
            openAmount: viz.ctrl.getOpenAmount(),
          });
        } catch {}
      };

      drawFrame(0);
      let mountedSeen = canvas.isConnected;
      const tick = (now) => {
        if (destroyed || viz.canvas !== canvas) return;
        if (canvas.isConnected) mountedSeen = true;
        else if (mountedSeen) {
          stopViz();
          return;
        }
        viz.rafId = root.requestAnimationFrame(tick);
        if (doc.hidden || viz.paused || state.iconModalKey || state.deleteKey) {
          viz.lastTickAt = 0;
          return;
        }
        // Pace at ~38 FPS (26ms) to preserve smooth motion with minimal CPU/GPU cost
        if (viz.lastDrawAt && now - viz.lastDrawAt < 26) return;
        viz.lastDrawAt = now;
        const dt = viz.lastTickAt > 0 ? Math.min(0.08, Math.max(0, (now - viz.lastTickAt) / 1000)) : 0;
        viz.lastTickAt = now;
        drawFrame(dt);
      };
      if (typeof root.requestAnimationFrame === 'function') {
        viz.rafId = root.requestAnimationFrame(tick);
      }
    }

    // ── Binding & Ready State Helpers (Live Game API) ──
    function isHotbarMode() {
      return bridge.hotbarEnabled ? Boolean(bridge.hotbarEnabled()) : true;
    }

    function getBindingInfo(spell, dispName, knownSlot) {
      if (!spell) return { bound: false, keyText: null, slotIndex: -1, tip: T('spellbook.card.bulletTip'), label: T('spellbook.info.bindNone') };
      if (isHotbarMode()) {
        const slot = knownSlot !== undefined
          ? knownSlot
          : (bridge.hotbarSlot ? bridge.hotbarSlot(spell, { spell: true }) : -1);
        if (slot >= 0) {
          const k = slot === 9 ? '0' : String(slot + 1);
          return {
            bound: true,
            keyText: k,
            slotIndex: slot,
            tip: T('spellbook.card.hotbarKeyTip', { k }),
            label: T('spellbook.info.bindHotbar', { slot: k }),
          };
        }
        return { bound: false, keyText: null, slotIndex: -1, tip: T('spellbook.card.bulletTip'), label: T('spellbook.info.bindNone') };
      }
      const q = bridge.quickslotGet ? bridge.quickslotGet() : null;
      if (Number.isFinite(spell.index) && q?.index === spell.index) {
        return {
          bound: true,
          keyText: 'Q',
          slotIndex: 0,
          tip: T('spellbook.card.quickslotKeyTip'),
          label: T('spellbook.info.bindQuick'),
        };
      }
      return { bound: false, keyText: null, slotIndex: -1, tip: T('spellbook.card.bulletTip'), label: T('spellbook.info.bindNone') };
    }

    function isSpellReadied(spell, key) {
      if (deps.readied || deps.readiedIndex) {
        const rSp = deps.readied?.() ?? null;
        const rIdx = deps.readiedIndex?.() ?? null;
        if (rSp && rSp === spell) return true;
        if (rIdx != null && Number.isFinite(spell?.index) && spell.index === rIdx) {
          return !rSp || rSp.name === spell.name;
        }
        return false;
      }
      return state.localReadyKey === key;
    }

    // ── WeakMap Pre-Indexed Row Model Builder (O(1) re-filter / search on 500–2000+ spells) ──
    function getSpellModel(spell, orderKey, ru, curEvalVer = evalVersion) {
      const displayName = bridge.spellName ? (bridge.spellName(spell) ?? '') : String(spell?.name ?? '');
      const fxCount = Array.isArray(spell?.effects) ? spell.effects.length : 0;
      const sig = `${ru ? 'ru' : 'en'}|${displayName}|${spell?.name || ''}|${spell?.element ?? 4}|${spell?.rangeType ?? 0}|${spell?.icon ?? 0}|${!!spell?.noIcon}|${fxCount}`;

      let cached = metaCache.get(spell);
      if (!cached || cached.sig !== sig) {
        const schools = [];
        const headEffects = [];
        const SMData = root.__dfoSpellmakerData;
        const rawEffects = bridge.effectsOf ? bridge.effectsOf(spell) : (spell?.effects || []).filter((e) => e && e.type >= 0);
        const searchParts = [displayName, spell?.name];
        const emId = Number.isInteger(spell?.element) && ELEMENT_META[spell.element] ? spell.element : 4;
        const tgtId = Number.isInteger(spell?.rangeType) && spell.rangeType >= 0 && spell.rangeType <= 4 ? spell.rangeType : 0;

        searchParts.push(T(`spellbook.element.${emId}`));
        searchParts.push(
          T(`spellbook.target.${tgtId}.short`),
          T(`spellbook.target.${tgtId}.full`),
        );

        for (let i = 0; i < Math.min(3, rawEffects.length); i++) {
          const ef = rawEffects[i];
          if (!ef || ef.type == null || ef.type < 0) continue;
          const info = resolveEffectInfo(ef, entity, ru);
          const sid = info.schoolId;
          schools.push(sid);
          headEffects.push({ schoolId: sid, color: info.school.color, name: info.name });
          if (info.name) searchParts.push(info.name, info.nameEn);
          searchParts.push(
            T(`spellbook.school.${sid}.name`),
            T(`spellbook.school.${sid}.abbr`),
          );
        }

        const leadSchoolId = schools[0] ?? 22;
        const leadSchool = SCHOOL_META[leadSchoolId] || SCHOOL_META[22];
        const leadSchoolIdx = SCHOOL_ORDER.indexOf(leadSchoolId);
        const elementMeta = ELEMENT_META[emId] || ELEMENT_META[4];
        cached = {
          sig,
          name: displayName,
          schools,
          headEffects,
          leadSchoolId,
          leadSchoolIdx,
          leadSchool,
          elementId: emId,
          element: elementMeta,
          targetId: tgtId,
          haystack: searchParts.filter(Boolean).join(' ').toLowerCase(),
          cost: 0,
          costVer: -1,
          hbSlot: -1,
          hbVer: -1,
          hbMode: null,
        };
        metaCache.set(spell, cached);
      }

      if (cached.costVer !== curEvalVer) {
        const rawCost = bridge.calcCost ? bridge.calcCost(spell, deps.castCost) : computeFallbackCost(spell, entity);
        cached.cost = Number.isFinite(rawCost) ? Math.max(0, Math.round(rawCost)) : 5;
        cached.costVer = curEvalVer;
      }

      return {
        key: orderKey,
        spell,
        name: cached.name,
        cost: cached.cost,
        schools: cached.schools,
        headEffects: cached.headEffects,
        leadSchoolId: cached.leadSchoolId,
        leadSchoolIdx: cached.leadSchoolIdx,
        leadSchool: cached.leadSchool,
        elementId: cached.elementId,
        element: cached.element,
        targetId: cached.targetId,
        haystack: cached.haystack,
        pinnedSlot: -1,
        _cached: cached,
      };
    }

    function getFilteredAndSortedModels(forceOrder = false) {
      const ru = isRu();
      const spells = getSpellsArray();
      const orderKeys = reconcileCustomOrder(spells, forceOrder);
      const q = (state.query || '').trim().toLowerCase();

      const curEvalVer = evalVersion;
      const allModels = new Array(spells.length);
      for (let i = 0; i < spells.length; i++) {
        allModels[i] = getSpellModel(spells[i], orderKeys[i], ru, curEvalVer);
      }

      const textMatches = q ? allModels.filter((m) => m.haystack.includes(q)) : allModels;

      const schoolCounts = new Map();
      schoolCounts.set('all', textMatches.length);
      for (const sid of SCHOOL_ORDER) schoolCounts.set(sid, 0);
      for (let i = 0; i < textMatches.length; i++) {
        const sch = textMatches[i].schools;
        const s0 = sch[0];
        const s1 = sch[1];
        const s2 = sch[2];
        if (s0 != null) schoolCounts.set(s0, (schoolCounts.get(s0) || 0) + 1);
        if (s1 != null && s1 !== s0) schoolCounts.set(s1, (schoolCounts.get(s1) || 0) + 1);
        if (s2 != null && s2 !== s0 && s2 !== s1) schoolCounts.set(s2, (schoolCounts.get(s2) || 0) + 1);
      }

      let visible = textMatches;
      if (state.schoolFilter !== 'all') {
        const targetSid = Number(state.schoolFilter);
        visible = textMatches.filter((m) => m.schools.includes(targetSid));
      }

      const pinnedWrap = [];
      const mainItems = [];
      const useHotbar = isHotbarMode();
      const curHbVer = hotbarVersion;
      const quickIdx = !useHotbar ? (bridge.quickslotGet?.()?.index ?? null) : null;

      for (let i = 0; i < visible.length; i++) {
        const m = visible[i];
        let rank;
        if (useHotbar) {
          const c = m._cached;
          if (c.hbVer !== curHbVer || c.hbMode !== true) {
            c.hbSlot = bridge.hotbarSlot ? bridge.hotbarSlot(m.spell, { spell: true }) : -1;
            c.hbVer = curHbVer;
            c.hbMode = true;
          }
          rank = c.hbSlot;
        } else {
          rank = Number.isFinite(m.spell?.index) && m.spell.index === quickIdx ? 0 : -1;
        }
        m.pinnedSlot = rank;
        if (rank >= 0) pinnedWrap.push({ model: m, rank });
        else mainItems.push(m);
      }
      if (pinnedWrap.length > 1) pinnedWrap.sort((a, b) => a.rank - b.rank);
      const pinnedItems = pinnedWrap.map((e) => e.model);

      const locale = ru ? 'ru' : 'en';
      if (state.sortMode === 'custom') {
        const orderIdx = getCustomOrderIndex();
        mainItems.sort((a, b) => (orderIdx.get(a.key) ?? 999999) - (orderIdx.get(b.key) ?? 999999));
      } else if (state.sortMode === 'name') {
        mainItems.sort((a, b) => cmpNames(a.name, b.name, locale));
      } else if (state.sortMode === 'costAsc') {
        mainItems.sort((a, b) => (a.cost - b.cost) || cmpNames(a.name, b.name, locale));
      } else if (state.sortMode === 'costDesc') {
        mainItems.sort((a, b) => (b.cost - a.cost) || cmpNames(a.name, b.name, locale));
      } else if (state.sortMode === 'school') {
        mainItems.sort((a, b) => (a.leadSchoolIdx - b.leadSchoolIdx) || cmpNames(a.name, b.name, locale));
      }

      return {
        totalCount: allModels.length,
        schoolCounts,
        pinnedItems,
        mainItems,
        visibleCount: pinnedItems.length + mainItems.length,
      };
    }

    function findSpellByOrderKey(orderKey) {
      if (!orderKey) return null;
      const spells = getSpellsArray();
      if (spells === cachedOrderSpellsRef && spells.length === cachedOrderSpellsLen && orderKeyIndex.has(orderKey)) {
        const idx = orderKeyIndex.get(orderKey);
        if (idx >= 0 && idx < spells.length) {
          return { spell: spells[idx], realIdx: idx, orderKey };
        }
      }
      const keys = computeOrderKeys(spells);
      const idx = keys.indexOf(orderKey);
      return idx >= 0 ? { spell: spells[idx], realIdx: idx, orderKey } : null;
    }

    function getRealIndex(spell) {
      return getSpellsArray().indexOf(spell);
    }

    // ── Header / Mana / Skills / Controls Sync (in-place DOM updates without full rebuilds) ──
    function updateHeaderMeta(totalCount) {
      if (refs.lvlChip) refs.lvlChip.textContent = T('spellbook.levelShort', { n: entity.level || 1 });
      if (refs.cntBadge) refs.cntBadge.textContent = T('spellbook.spellsCount', { n: totalCount ?? getSpellsArray().length });
      if (refs.pvpBtn) {
        const show = Boolean(bridge.pvpAvailable?.());
        refs.pvpBtn.hidden = !show;
        if (show) refs.pvpBtn.textContent = bridge.pvpLabel?.() || T('spellbook.pvpDefault');
      }
    }

    function updateManaUi() {
      if (!refs.manaBlock) return;
      const regen = collectMagickaRegen(entity, Env());
      const pct = Math.max(0, Math.min(100, (regen.cur / regen.max) * 100));
      if (refs.manaMp) {
        refs.manaMp.textContent = `${regen.cur}/${regen.max}`;
        refs.manaMp.classList.toggle('is-low', pct < 25);
      }
      if (refs.manaRegen) {
        refs.manaRegen.textContent = `${regen.totalPct.toFixed(1)}${T('spellbook.mana.regenUnit')}`;
        refs.manaRegen.classList.toggle('is-zero', regen.totalPct <= 0);
      }
      if (refs.manaFill) {
        refs.manaFill.style.width = `${pct.toFixed(2)}%`;
        refs.manaFill.classList.toggle('is-low', pct < 25);
      }
    }

    function updateSkillsUi() {
      if (!refs.skillsGrid) return;
      const env = Env();
      const shared = env
        ? { worn: uniqueWornItems(entity), folds: env.inspectModFolds ? env.inspectModFolds(entity) : [] }
        : null;
      for (const sid of SCHOOL_ORDER) {
        const cell = refs.skillsGrid.querySelector(`[data-skill-id="${sid}"]`);
        if (!cell) continue;
        const ev = collectSkillSnapshot(entity, sid, env, shared);
        cell.className = `dfo-sb-skill-cell is-tone-${ev.tone}`;
        const valEl = cell.querySelector('.dfo-sb-sk-val');
        if (valEl) {
          valEl.className = `dfo-sb-sk-val tone-${ev.tone}`;
          valEl.textContent = String(ev.current);
        }
      }
    }

    function closeSchoolDropdown() {
      dropdownOpen = false;
      if (refs.ddWrap) {
        refs.ddWrap.classList.remove('is-open');
        refs.ddBtn?.setAttribute('aria-expanded', 'false');
      }
    }

    function ensureDropdownBuilt() {
      if (refs.ddOptMap || !refs.ddMenu) return;
      const map = new Map();
      const defs = [
        { value: 'all', label: T('spellbook.school.all'), color: '#9a9079', schoolId: null },
        ...SCHOOL_ORDER.map((sid) => ({
          value: String(sid),
          label: T(`spellbook.school.${sid}.name`),
          color: SCHOOL_META[sid].color,
          schoolId: sid,
        })),
      ];
      const frag = doc.createDocumentFragment();
      for (const opt of defs) {
        const row = el(doc, 'button', 'dfo-sb-dd-opt');
        row.type = 'button';
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', 'false');
        row.style.setProperty('--dfo-opt-c', opt.color);

        const optLead = el(doc, 'span', 'dfo-opt-lead');
        if (opt.schoolId) {
          const ico = renderSvgIcon(doc, `school_${opt.schoolId}`, 'dfo-dd-ico');
          if (ico) optLead.append(ico);
        } else {
          const pip = el(doc, 'span', 'dfo-dd-pip');
          pip.style.setProperty('--dfo-pip-c', opt.color);
          optLead.append(pip);
        }
        const optLbl = el(doc, 'span', 'dfo-opt-label', opt.label);
        if (opt.value !== 'all') optLbl.style.color = opt.color;
        optLead.append(optLbl);

        const optTail = el(doc, 'span', 'dfo-opt-tail');
        const cntEl = el(doc, 'span', 'dfo-opt-count', '0');
        const chkEl = el(doc, 'span', 'dfo-opt-check', '◆');
        chkEl.style.display = 'none';
        optTail.append(cntEl, chkEl);
        row.append(optLead, optTail);

        row.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          closeSchoolDropdown();
          const nextVal = opt.value === 'all' ? 'all' : Number(opt.value);
          if (nextVal !== state.schoolFilter) {
            playSfx('click');
            state.schoolFilter = nextVal;
            renderSpellList({ preserveScroll: false, refreshEntity: false, refreshHotbar: false });
          }
        };
        map.set(opt.value, { def: opt, row, cntEl, chkEl, lastCnt: '', lastSel: false });
        frag.append(row);
      }
      refs.ddMenu.replaceChildren(frag);
      refs.ddOptMap = map;
      refs.ddLeadBuiltFor = null;
    }

    function updateDropdownUi(schoolCounts) {
      if (!refs.ddWrap || !refs.ddBtn || !refs.ddMenu) return;
      ensureDropdownBuilt();
      const curVal = String(state.schoolFilter);
      const isFiltered = curVal !== 'all';
      refs.ddWrap.classList.toggle('is-filtered', isFiltered);
      refs.ddBtn.classList.toggle('on', isFiltered);

      const activeRec = refs.ddOptMap.get(curVal) || refs.ddOptMap.get('all');
      const activeOpt = activeRec.def;
      const activeCountText = String(schoolCounts.get(activeOpt.schoolId ?? 'all') || 0);

      if (refs.ddLeadBuiltFor !== curVal) {
        refs.ddLeadBuiltFor = curVal;
        const lead = refs.ddBtn.querySelector('.dfo-dd-lead');
        const tail = refs.ddBtn.querySelector('.dfo-dd-tail');
        if (lead) {
          lead.replaceChildren();
          if (activeOpt.schoolId) {
            const ico = renderSvgIcon(doc, `school_${activeOpt.schoolId}`, 'dfo-dd-ico');
            if (ico) lead.append(ico);
          } else {
            const pip = el(doc, 'span', 'dfo-dd-pip');
            pip.style.setProperty('--dfo-pip-c', activeOpt.color);
            lead.append(pip);
          }
          const lbl = el(doc, 'span', 'dfo-dd-label', activeOpt.label);
          if (isFiltered) lbl.style.color = activeOpt.color;
          lead.append(lbl);
        }
        if (tail) {
          tail.replaceChildren();
          const cntNode = el(doc, 'span', 'dfo-dd-count', activeCountText);
          const caret = renderSvgIcon(doc, 'caret', 'dfo-dd-caret');
          tail.append(cntNode);
          if (caret) tail.append(caret);
          refs.ddBtnCount = cntNode;
        }
      } else if (refs.ddBtnCount && refs.ddBtnCount.textContent !== activeCountText) {
        refs.ddBtnCount.textContent = activeCountText;
      }

      for (const [val, rec] of refs.ddOptMap.entries()) {
        const cntStr = String(schoolCounts.get(rec.def.schoolId ?? 'all') || 0);
        const isSel = val === curVal;
        if (rec.lastCnt !== cntStr) {
          rec.cntEl.textContent = cntStr;
          rec.lastCnt = cntStr;
        }
        if (rec.lastSel !== isSel) {
          rec.row.classList.toggle('is-selected', isSel);
          rec.row.setAttribute('aria-selected', String(isSel));
          rec.chkEl.style.display = isSel ? '' : 'none';
          rec.lastSel = isSel;
        }
      }
    }

    function updateSortButtonUi() {
      if (!refs.sortBtn) return;
      const lbl = refs.sortBtn.querySelector('.dfo-sb-sort-lbl');
      if (lbl) lbl.textContent = T(SORT_KEY_MAP[state.sortMode] || 'spellbook.sort.default');
      refs.sortBtn.classList.toggle('on', state.sortMode === 'custom');
    }

    // ── Header / Top Panel DOM Construction (mounted once per open session) ──
    function buildHeader() {
      const head = el(doc, 'header', 'wh dfo-sb-head');
      const left = el(doc, 'div', 'dfo-sb-head-left');
      const ico = renderSvgIcon(doc, 'grimoire', 'dfo-sb-head-ico');
      if (ico) left.append(ico);
      const title = el(doc, 'h1', 't dfo-sb-title', T('spellbook.title'));
      refs.title = title;
      left.append(title);

      const meta = el(doc, 'div', 'dfo-sb-head-meta');
      const lvlChip = el(doc, 'span', 'dfo-chip chip-gold dfo-sb-lvl-chip', T('spellbook.levelShort', { n: entity.level || 1 }));
      const cntBadge = el(doc, 'span', 'dfo-chip dfo-sb-cnt-chip', T('spellbook.spellsCount', { n: getSpellsArray().length }));
      refs.lvlChip = lvlChip;
      refs.cntBadge = cntBadge;
      meta.append(lvlChip, cntBadge);
      left.append(meta);

      const notice = el(doc, 'div', 'dfo-sb-notice', '');
      refs.noticeEl = notice;

      const right = el(doc, 'div', 'dfo-sb-head-right');
      if (bridge.pvpAvailable) {
        const pvpBtn = el(doc, 'button', 'dfo-ornate-btn arcane dfo-sb-pvp-btn', bridge.pvpLabel?.() || T('spellbook.pvpDefault'));
        pvpBtn.type = 'button';
        pvpBtn.hidden = !bridge.pvpAvailable();
        pvpBtn.onclick = () => {
          playSfx('click');
          deps.onExit?.();
          bridge.pvpOpen?.();
        };
        refs.pvpBtn = pvpBtn;
        right.append(pvpBtn);
      }

      const closeBtn = el(doc, 'button', 'dfo-ornate-btn close dfo-sb-close-btn', T('spellbook.close'));
      closeBtn.type = 'button';
      closeBtn.onclick = () => {
        playSfx('click');
        deps.onExit?.();
      };
      right.append(closeBtn);

      head.append(left, notice, right);
      refs.head = head;
      return head;
    }

    function buildManaBlock() {
      const block = el(doc, 'div', 'dfo-sb-mana-block');
      block.tabIndex = 0;

      const topRow = el(doc, 'div', 'dfo-sb-mana-top');
      const lblWrap = el(doc, 'div', 'dfo-sb-mana-lbl-wrap');
      const manaIco = renderSvgIcon(doc, 'mana', 'dfo-sb-mana-ico');
      if (manaIco) lblWrap.append(manaIco);
      lblWrap.append(el(doc, 'span', 'dfo-sb-mana-lbl', T('spellbook.mana.label')));

      const readout = el(doc, 'div', 'dfo-sb-mana-readout');
      const mpSpan = el(doc, 'span', 'dfo-sb-mana-mp', '');
      const dotSpan = el(doc, 'span', 'dfo-sb-mana-dot', '·');
      const regenSpan = el(doc, 'span', 'dfo-sb-mana-regen', '');
      readout.append(mpSpan, dotSpan, regenSpan);
      topRow.append(lblWrap, readout);

      const barWell = el(doc, 'div', 'dfo-well-frame dfo-sb-mana-bar');
      const fill = el(doc, 'div', 'dfo-sb-mana-fill');
      const ticks = el(doc, 'div', 'dfo-sb-mana-ticks');
      for (let i = 1; i <= 3; i++) {
        const tick = el(doc, 'span', 'dfo-sb-mana-tick');
        tick.style.left = `${i * 25}%`;
        ticks.append(tick);
      }
      barWell.append(fill, ticks);
      block.append(topRow, barWell);

      refs.manaBlock = block;
      refs.manaMp = mpSpan;
      refs.manaRegen = regenSpan;
      refs.manaFill = fill;
      updateManaUi();

      attachStatusTip(
        block,
        () => ({ icon: 'mana', text: T('spellbook.mana.tipTitle') }),
        () => {
          const r = collectMagickaRegen(entity, Env());
          const unit = T('spellbook.mana.regenUnit');
          const ptsPerRnd = ((r.max * r.totalPct) / 100).toFixed(1);
          const rows = [
            {
              kind: 'cards',
              items: [
                { icon: 'mana', tone: 'shards', label: T('spellbook.mana.tipCurrent'), value: `${r.cur} / ${r.max}` },
                { icon: 'ctaReady', tone: r.totalPct > 0 ? 'embers' : 'loc', label: T('spellbook.mana.tipRegen'), value: `${r.totalPct.toFixed(1)}${unit}` },
              ],
            },
            {
              kind: 'info',
              fields: [{
                label: T('spellbook.mana.tipSources'),
                value: r.totalPct > 0 ? T('spellbook.mana.tipPerRound', { pts: ptsPerRnd }) : T('spellbook.mana.tipNoRegen'),
              }],
            },
          ];
          if (r.attuneBlocked) {
            rows.push({ kind: 'sep' }, { tone: 'bad', text: T('spellbook.mana.tipNoRegenCareer') });
          }
          if (r.sources.length) {
            rows.push({ kind: 'sep' });
            for (const src of r.sources) {
              rows.push({ tone: 'good', text: `+${Number(src.pct).toFixed(1)}${unit} · ${src.label}` });
            }
          }
          return rows;
        },
      );
      return block;
    }

    function buildControlsRow() {
      const row = el(doc, 'div', 'dfo-sb-controls-row');

      const searchWrap = el(doc, 'div', 'dfo-well-frame dfo-sb-search');
      const searchIco = renderSvgIcon(doc, 'search', 'dfo-sb-search-ico');
      if (searchIco) searchWrap.append(searchIco);

      const inp = el(doc, 'input', 'dfo-sb-search-input');
      inp.type = 'search';
      inp.value = state.query;
      inp.placeholder = T('spellbook.search.placeholder');
      inp.setAttribute('aria-label', T('spellbook.search.placeholder'));
      inp.oninput = () => {
        state.query = inp.value;
        renderSpellList({ preserveScroll: false, refreshEntity: false, refreshHotbar: false });
      };
      inp.onkeydown = (e) => {
        if (e.key === 'Escape') {
          if (inp.value) {
            e.preventDefault();
            e.stopPropagation();
            state.query = '';
            inp.value = '';
            renderSpellList({ preserveScroll: false, refreshEntity: false, refreshHotbar: false });
          } else {
            inp.blur?.();
          }
        }
      };

      const countBadge = el(doc, 'span', 'dfo-sb-search-count', '0');
      const clearBtn = el(doc, 'button', 'dfo-sb-search-clear');
      clearBtn.type = 'button';
      clearBtn.title = T('spellbook.search.clear');
      clearBtn.setAttribute('aria-label', T('spellbook.search.clear'));
      const crossIco = renderSvgIcon(doc, 'clearCross', 'dfo-sb-clear-ico');
      if (crossIco) clearBtn.append(crossIco);
      clearBtn.hidden = !state.query;
      clearBtn.onclick = () => {
        state.query = '';
        inp.value = '';
        renderSpellList({ preserveScroll: false, refreshEntity: false, refreshHotbar: false });
        inp.focus();
      };
      searchWrap.append(inp, countBadge, clearBtn);
      refs.searchInput = inp;
      refs.searchCount = countBadge;
      refs.searchClear = clearBtn;

      const ddWrap = el(doc, 'div', 'dfo-sb-dd');
      const ddBtn = el(doc, 'button', 'dfo-ornate-btn dfo-sb-dd-btn');
      ddBtn.type = 'button';
      ddBtn.setAttribute('aria-haspopup', 'listbox');
      ddBtn.setAttribute('aria-expanded', 'false');
      ddBtn.setAttribute('aria-label', T('spellbook.school.filterAria'));
      ddBtn.append(el(doc, 'span', 'dfo-dd-lead'), el(doc, 'span', 'dfo-dd-tail'));

      const ddMenu = el(doc, 'div', 'dfo-sb-dd-menu dfo-scroll');
      ddMenu.setAttribute('role', 'listbox');
      ddMenu.setAttribute('aria-label', T('spellbook.school.filterAria'));
      ddWrap.append(ddBtn, ddMenu);

      ddBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideTip();
        dropdownOpen = !dropdownOpen;
        ddWrap.classList.toggle('is-open', dropdownOpen);
        ddBtn.setAttribute('aria-expanded', String(dropdownOpen));
        if (dropdownOpen) ddMenu.querySelector('.dfo-sb-dd-opt.is-selected')?.scrollIntoView?.({ block: 'nearest' });
      };
      ddBtn.onkeydown = (e) => {
        if (e.key === 'Escape' && dropdownOpen) {
          e.preventDefault();
          e.stopPropagation();
          closeSchoolDropdown();
          return;
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          const opts = ['all', ...SCHOOL_ORDER];
          const cur = opts.indexOf(state.schoolFilter);
          const idx = cur >= 0 ? cur : 0;
          const nextIdx = e.key === 'ArrowDown' ? Math.min(opts.length - 1, idx + 1) : Math.max(0, idx - 1);
          if (opts[nextIdx] !== state.schoolFilter) {
            state.schoolFilter = opts[nextIdx];
            renderSpellList({ preserveScroll: false, refreshEntity: false, refreshHotbar: false });
          }
        }
      };
      refs.ddWrap = ddWrap;
      refs.ddBtn = ddBtn;
      refs.ddMenu = ddMenu;

      const sortBtn = el(doc, 'button', 'dfo-ornate-btn dfo-sb-sort-btn');
      sortBtn.type = 'button';
      const sortIco = renderSvgIcon(doc, 'sort', 'dfo-sb-sort-ico');
      if (sortIco) sortBtn.append(sortIco);
      sortBtn.append(el(doc, 'span', 'dfo-sb-sort-lbl', T(SORT_KEY_MAP[state.sortMode] || 'spellbook.sort.default')));
      sortBtn.classList.toggle('on', state.sortMode === 'custom');

      const stepSort = (dir) => {
        playSfx('click');
        const cur = Math.max(0, SORT_MODES.indexOf(state.sortMode));
        state.sortMode = SORT_MODES[(cur + dir + SORT_MODES.length) % SORT_MODES.length];
        updateSortButtonUi();
        persistSettings({ immediate: false });
        renderSpellList({ preserveScroll: true, refreshEntity: false, refreshHotbar: false });
      };
      sortBtn.onclick = () => stepSort(1);
      sortBtn.oncontextmenu = (e) => { e.preventDefault(); stepSort(-1); };

      attachStatusTip(
        sortBtn,
        () => ({ icon: 'sort', text: T('spellbook.sort.tipTitle') }),
        () => {
          const rows = [
            { kind: 'info', fields: [{ label: T(SORT_KEY_MAP[state.sortMode]), value: T('spellbook.sort.tipHint') }] },
            { kind: 'sep' },
          ];
          for (const mode of SORT_MODES) {
            rows.push({
              tone: mode === state.sortMode ? 'good' : undefined,
              color: mode === state.sortMode ? '#fde68a' : '#a89f88',
              text: `${mode === state.sortMode ? '◆ ' : '· '}${T(SORT_KEY_MAP[mode])}`,
            });
          }
          return rows;
        },
      );
      refs.sortBtn = sortBtn;
      row.append(searchWrap, ddWrap, sortBtn);
      return row;
    }

    function buildSkillsPanel() {
      const rightPanel = el(doc, 'section', 'dfo-subpanel-frame dfo-accent-panel dfo-sb-top-right');
      const grid = el(doc, 'div', 'dfo-sb-skills-grid');
      refs.skillsGrid = grid;
      const env = Env();
      const shared = env
        ? { worn: uniqueWornItems(entity), folds: env.inspectModFolds ? env.inspectModFolds(entity) : [] }
        : null;

      for (const sid of SCHOOL_ORDER) {
        const sc = SCHOOL_META[sid];
        const ev = collectSkillSnapshot(entity, sid, env, shared);
        const cell = el(doc, 'div', `dfo-sb-skill-cell is-tone-${ev.tone}`);
        cell.dataset.skillId = String(sid);
        cell.tabIndex = 0;
        cell.style.setProperty('--dfo-sk-c', sc.color);

        const left = el(doc, 'div', 'dfo-sb-sk-left');
        const ico = renderSvgIcon(doc, `school_${sid}`, 'dfo-sb-sk-ico');
        if (ico) left.append(ico);
        left.append(el(doc, 'span', 'dfo-sb-sk-abbr', T(`spellbook.school.${sid}.abbr`)));

        const val = el(doc, 'span', `dfo-sb-sk-val tone-${ev.tone}`, String(ev.current));
        cell.append(left, val);

        attachStatusTip(
          cell,
          () => ({ icon: `school_${sid}`, text: `${T(`spellbook.school.${sid}.name`)} (${T(`spellbook.school.${sid}.abbr`)})` }),
          () => {
            const curEv = collectSkillSnapshot(entity, sid, Env());
            const toneColors = { base: '#ffffff', buff: '#4ade80', debuff: '#f87171', mixed: '#facc15' };
            const rows = [
              {
                kind: 'cards',
                items: [{
                  icon: `school_${sid}`,
                  tone: curEv.tone === 'buff' ? 'embers' : curEv.tone === 'debuff' ? 'aurum' : curEv.tone === 'mixed' ? 'loc' : 'gold',
                  label: T('spellbook.skill.tipCurrent'),
                  value: String(curEv.current),
                  color: toneColors[curEv.tone],
                }],
              },
              {
                kind: 'info',
                fields: [{
                  label: T(`spellbook.skill.state.${curEv.tone}`),
                  value: T(`spellbook.school.${sid}.tip`),
                }],
              },
              { kind: 'sep' },
              { tone: 'center', color: '#f1e6c8', text: `${T('spellbook.skill.tipBase')}: ${curEv.base}` },
            ];
            if (!curEv.mods.length) {
              rows.push({ color: '#a89f88', text: T('spellbook.skill.tipNoMods') });
            } else {
              for (const m of curEv.mods) {
                const d = Math.round(Number(m.delta) || 0);
                rows.push({ tone: d > 0 ? 'good' : 'bad', text: `${d > 0 ? `+${d}` : String(d)} · ${m.label}` });
              }
            }
            return rows;
          },
        );
        grid.append(cell);
      }
      rightPanel.append(grid);
      return rightPanel;
    }

    // ── Ready / Unbind / Mutate / Delete Actions ──
    function handleReadySpell(item) {
      const sp = item.spell;
      const isReady = isSpellReadied(sp, item.key);
      if (isReady) {
        if (deps.abortReady) {
          deps.abortReady();
          playSfx('click');
          setNotice(T('spellbook.notice.unreadied', { name: item.name }));
        } else {
          state.localReadyKey = null;
          setNotice(T('spellbook.notice.unreadied', { name: item.name }));
        }
        renderSpellList({ preserveScroll: true, refreshEntity: false, refreshHotbar: false });
        return;
      }

      if (deps.onReady) {
        const free = sp?.tag === (bridge.lycanTag || 'lycanthrope');
        const ok = deps.onReady(sp, { noSpellPointCost: free });
        if (ok === false) {
          playSfx('click');
          setNotice(T('spellbook.notice.notEnoughMp', { name: item.name, cost: item.cost }));
          return;
        }
        deps.onExit?.();
        return;
      }

      state.localReadyKey = item.key;
      setNotice(T('spellbook.notice.readied', { name: item.name, cost: item.cost }));
      renderSpellList({ preserveScroll: true, refreshEntity: false, refreshHotbar: false });
    }

    function handleToggleBind(item) {
      const sp = item.spell;
      if (isHotbarMode()) {
        const beforeSlot = bridge.hotbarSlot ? bridge.hotbarSlot(sp, { spell: true }) : -1;
        const rawMsg = bridge.toggleHotbar ? bridge.toggleHotbar(sp) : null;
        const afterSlot = bridge.hotbarSlot ? bridge.hotbarSlot(sp, { spell: true }) : -1;
        playSfx('edit');
        if (beforeSlot >= 0 && afterSlot < 0) {
          setNotice(T('spellbook.notice.hotbarOff', { name: item.name }));
        } else if (beforeSlot < 0 && afterSlot >= 0) {
          const k = afterSlot === 9 ? '0' : String(afterSlot + 1);
          setNotice(T('spellbook.notice.hotbarOn', { name: item.name, slot: k }));
        } else if (rawMsg) {
          setNotice(rawMsg.toLowerCase().includes('full') ? T('spellbook.notice.hotbarFull') : rawMsg);
        }
        renderSpellList({ preserveScroll: true, refreshEntity: false, refreshHotbar: true });
        return;
      }

      const cur = bridge.quickslotGet ? bridge.quickslotGet() : null;
      const isSlotted = Number.isFinite(sp?.index) && cur?.index === sp.index;
      playSfx('edit');
      if (isSlotted) {
        bridge.quickslotClear?.();
        setNotice(T('spellbook.notice.quickOff', { name: item.name }));
      } else {
        bridge.quickslotSet?.(sp);
        setNotice(T('spellbook.notice.quickOn', { name: item.name }));
      }
      renderSpellList({ preserveScroll: true, refreshEntity: false, refreshHotbar: true });
    }

    function mutateLiveSpell(spell, patch) {
      const spells = getSpellsArray();
      const idx = spells.indexOf(spell);
      if (idx < 0) return false;
      if (bridge.mutateSpell) {
        return Boolean(bridge.mutateSpell(spells, idx, patch));
      }
      Object.assign(spell, patch, { custom: true });
      return true;
    }

    function confirmDelete(yes) {
      const delKey = state.deleteKey;
      state.deleteKey = null;
      if (yes && delKey) {
        const found = findSpellByOrderKey(delKey);
        if (found) {
          const spells = getSpellsArray();
          const idx = spells.indexOf(found.spell);
          if (idx >= 0) {
            if (isSpellReadied(found.spell, delKey)) {
              deps.abortReady?.();
              state.localReadyKey = null;
            }
            if (isHotbarMode()) {
              const slot = bridge.hotbarSlot?.(found.spell, { spell: true }) ?? -1;
              if (slot >= 0) bridge.toggleHotbar?.(found.spell);
            } else {
              const q = bridge.quickslotGet?.();
              if (Number.isFinite(found.spell?.index) && q?.index === found.spell.index) bridge.quickslotClear?.();
            }
            if (state.expandedKey === delKey) { stopViz(); state.expandedKey = null; }
            if (state.activeKey === delKey) state.activeKey = null;
            if (state.renameKey === delKey) state.renameKey = null;
            if (state.iconModalKey === delKey) state.iconModalKey = null;
            spells.splice(idx, 1);
            reconcileCustomOrder(spells, true);
            playSfx('edit');
            persistSettings({ immediate: true, gc: true });
          }
        }
      }
      renderModal();
      renderSpellList({ preserveScroll: true, refreshEntity: false, refreshHotbar: true });
    }

    // ── Card Icon Resolution (Live ICON00I0.IMG + Vanilla Fallbacks + Custom Packs) ──
    function resolveIconEntry(iconVal) {
      if (IconReg?.findEntry) return IconReg.findEntry(iconVal);
      const url = bridge.iconUrl ? bridge.iconUrl(iconVal ?? 0) : null;
      const idx = ((Math.trunc(Number(iconVal)) || 0) % 69 + 69) % 69;
      return {
        order: idx + 1,
        value: idx,
        key: `num:${idx}`,
        packTitleRu: '',
        packTitleEn: '',
        src: url || '',
      };
    }

    function applySpellIconToImg(imgEl, iconVal) {
      const regSrc = IconReg?.getIconSrc ? IconReg.getIconSrc(iconVal ?? 0) : '';
      const liveSrc = bridge.iconUrl ? bridge.iconUrl(iconVal ?? 0) : '';
      const src = liveSrc || regSrc;
      if (src) {
        imgEl.src = src;
        return true;
      }
      return false;
    }

    // ── Card Strip & Expanded 3-Column Body Builders ──
    function buildCardHead(item, isPinned) {
      const sp = item.spell;
      const isCustomSort = state.sortMode === 'custom';
      const canDrag = isCustomSort && !isPinned;
      const isOpen = state.expandedKey === item.key;
      const isReady = isSpellReadied(sp, item.key);
      const isRenaming = state.renameKey === item.key;
      const curMana = Math.max(0, Math.round(Number(entity.magicka) || 0));
      const notEnough = item.cost > curMana;
      const bind = getBindingInfo(sp, item.name, item.pinnedSlot);
      const stopEv = (e) => e.stopPropagation();

      const head = el(doc, 'div', `dfo-sb-card-head${canDrag ? ' is-draggable' : ''}${isPinned ? ' is-pinned' : ''}`);
      head.setAttribute('role', 'button');
      head.tabIndex = 0;
      head.setAttribute('aria-expanded', String(isOpen));
      head.title = T('spellbook.card.dblClickHint');

      // 1. Hotkey keycap or bullet
      const marker = el(doc, 'div', `dfo-sb-marker${bind.bound ? ' is-bound' : ''}`);
      marker.append(bind.bound ? el(doc, 'span', 'dfo-sb-keycap', bind.keyText) : el(doc, 'span', 'dfo-sb-bullet', '◆'));
      attachStatusTip(
        marker,
        () => ({ icon: 'grimoire', text: item.name }),
        () => [{ kind: 'info', fields: [{ label: T('spellbook.info.binding'), value: bind.tip }] }],
      );

      // 2. HUD-sized 46x46 Spell Icon (also drags directly onto HUD hotbar when open!)
      const icoWrap = el(doc, 'div', 'dfo-sb-spell-ico-box');
      if (sp.noIcon) {
        icoWrap.classList.add('is-sigil');
        icoWrap.append(el(doc, 'span', 'dfo-sb-sigil', spellSigil(item.name, bridge)));
      } else {
        const img = el(doc, 'img', 'dfo-sb-spell-ico');
        img.alt = '';
        if (applySpellIconToImg(img, sp.icon)) {
          icoWrap.append(img);
        } else {
          icoWrap.classList.add('is-sigil');
          icoWrap.append(el(doc, 'span', 'dfo-sb-sigil', spellSigil(item.name, bridge)));
        }
      }
      icoWrap.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || state.deleteKey || !bridge.hotbarOpen?.() || !bridge.startHotbarDrag) return;
        e.stopPropagation();
        const shortSigil = sp?.noIcon
          ? (bridge.sigilNoIcon ? bridge.sigilNoIcon(item.name) : spellSigil(item.name, bridge))
          : (bridge.sigilShort ? bridge.sigilShort(item.name) : spellSigil(item.name, bridge));
        bridge.startHotbarDrag(e, { kind: 'spell', spell: sp }, {
          sigil: shortSigil,
          element: sp?.element ?? null,
          icon: sp?.noIcon ? null : bridge.iconBox?.(sp?.icon, { box: bridge.iconBoxSize || 38 }),
        });
      });

      // 3. Spell Name + inline pencil OR inline omnibox
      const nameWrap = el(doc, 'div', 'dfo-sb-spell-name-wrap');
      if (isRenaming) {
        const form = el(doc, 'form', 'dfo-sb-head-rename-form');
        const inp = el(doc, 'input', 'dfo-sb-head-rename-input');
        inp.type = 'text';
        inp.maxLength = 30;
        inp.value = state.renameDraft;
        inp.placeholder = T('spellbook.card.renamePlaceholder');
        inp.setAttribute('aria-label', T('spellbook.card.renamePlaceholder'));
        inp.oninput = () => { state.renameDraft = inp.value; };
        inp.addEventListener('pointerdown', stopEv);
        inp.addEventListener('click', stopEv);
        inp.addEventListener('dblclick', stopEv);
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            state.renameKey = null;
            refreshVisibleRow(item.key);
          }
        });

        const btnSave = el(doc, 'button', 'dfo-sb-head-rename-act is-ok');
        btnSave.type = 'submit';
        btnSave.title = T('spellbook.card.renameSaveTip');
        const okIco = renderSvgIcon(doc, 'check', 'dfo-sb-head-rename-ico');
        if (okIco) btnSave.append(okIco);
        btnSave.addEventListener('pointerdown', stopEv);
        btnSave.addEventListener('click', stopEv);

        const btnCancel = el(doc, 'button', 'dfo-sb-head-rename-act is-cancel');
        btnCancel.type = 'button';
        btnCancel.title = T('spellbook.card.renameCancelTip');
        const noIco = renderSvgIcon(doc, 'clearCross', 'dfo-sb-head-rename-ico');
        if (noIco) btnCancel.append(noIco);
        btnCancel.addEventListener('pointerdown', stopEv);
        btnCancel.addEventListener('dblclick', stopEv);
        btnCancel.onclick = (e) => {
          e.stopPropagation();
          state.renameKey = null;
          refreshVisibleRow(item.key);
        };

        form.addEventListener('pointerdown', stopEv);
        form.addEventListener('click', stopEv);
        form.addEventListener('dblclick', stopEv);
        form.onsubmit = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const trimmed = (inp.value ?? state.renameDraft ?? '').trim().slice(0, 30);
          state.renameKey = null;
          if (trimmed && trimmed !== item.name) {
            const oldKey = item.key;
            if (mutateLiveSpell(sp, { name: trimmed })) {
              const spells = getSpellsArray();
              const spIdx = spells.indexOf(sp);
              if (spIdx >= 0) {
                const newKeys = computeOrderKeys(spells);
                const newKey = newKeys[spIdx];
                if (newKey && newKey !== oldKey) {
                  const ordIdx = state.customOrder.indexOf(oldKey);
                  if (ordIdx >= 0) state.customOrder[ordIdx] = newKey;
                  if (state.expandedKey === oldKey) state.expandedKey = newKey;
                  if (state.activeKey === oldKey) state.activeKey = newKey;
                  if (state.localReadyKey === oldKey) state.localReadyKey = newKey;
                }
              }
              invalidateOrderCache();
              playSfx('edit');
              setNotice(T('spellbook.notice.renamed', { name: trimmed }));
              persistSettings({ immediate: true });
              renderSpellList({ preserveScroll: true, refreshEntity: false, refreshHotbar: false });
              return;
            }
          }
          refreshVisibleRow(item.key);
        };

        form.append(inp, btnSave, btnCancel);
        nameWrap.append(form);
      } else {
        nameWrap.append(el(doc, 'span', 'dfo-sb-spell-name', item.name));

        const penBtn = el(doc, 'button', 'dfo-sb-rename-pen');
        penBtn.type = 'button';
        penBtn.title = T('spellbook.card.renameInlineTip');
        penBtn.setAttribute('aria-label', T('spellbook.card.renameInlineTip'));
        const penIco = renderSvgIcon(doc, 'pencil', 'dfo-sb-pen-ico');
        if (penIco) penBtn.append(penIco);
        penBtn.addEventListener('pointerdown', stopEv);
        penBtn.addEventListener('dblclick', stopEv);
        penBtn.onclick = (e) => {
          e.stopPropagation();
          hideTip();
          state.renameKey = item.key;
          state.renameDraft = item.name;
          refreshVisibleRow(item.key);
          const ri = virt.mounted.get(item.key)?.node?.querySelector('.dfo-sb-head-rename-input');
          if (ri) { ri.focus(); ri.select(); }
        };
        nameWrap.append(penBtn);
        if (isReady) nameWrap.append(el(doc, 'span', 'dfo-sb-ready-pill', T('spellbook.card.readyTag')));
      }

      // 4. Divider-flanked school icons (up to 3 in effect order)
      const schoolsBand = el(doc, 'div', 'dfo-sb-schools-band');
      schoolsBand.append(el(doc, 'span', 'dfo-sb-vdiv'));
      const iconsSeq = el(doc, 'div', 'dfo-sb-school-seq');
      const headFx = item.headEffects || [];
      for (let idx = 0; idx < headFx.length; idx++) {
        const info = headFx[idx];
        const slotNode = el(doc, 'span', 'dfo-sb-school-slot');
        slotNode.style.setProperty('--dfo-sch-c', info.color);
        const scIco = renderSvgIcon(doc, `school_${info.schoolId}`, 'dfo-sb-sch-ico');
        if (scIco) slotNode.append(scIco);
        attachStatusTip(
          slotNode,
          () => ({ icon: `school_${info.schoolId}`, text: T(`spellbook.school.${info.schoolId}.name`) }),
          () => [{ kind: 'info', fields: [{ label: T('spellbook.card.effectSlotLabel', { n: idx + 1 }), value: info.name }] }],
        );
        iconsSeq.append(slotNode);
      }
      schoolsBand.append(iconsSeq, el(doc, 'span', 'dfo-sb-vdiv'));

      // 5. Target delivery icon
      const tgtWrap = el(doc, 'div', 'dfo-sb-target-slot');
      const tgtBadge = el(doc, 'span', 'dfo-sb-target-badge');
      const tgtIco = renderSvgIcon(doc, `target_${item.targetId}`, 'dfo-sb-target-ico');
      if (tgtIco) tgtBadge.append(tgtIco);
      tgtWrap.append(tgtBadge);
      attachStatusTip(
        tgtWrap,
        () => ({ icon: `target_${item.targetId}`, text: T(`spellbook.target.${item.targetId}.full`) }),
        () => [{ kind: 'info', fields: [{ label: T('spellbook.info.target'), value: T(`spellbook.target.${item.targetId}.desc`) }] }],
      );

      // 6. Quick Actions: Equal-size Ready/Readied, Unbind, Divider-flanked Icon-only Delete
      const quickActs = el(doc, 'div', 'dfo-sb-quick-acts');
      const qReady = el(
        doc,
        'button',
        `dfo-sb-head-btn is-ready-btn${isReady ? ' is-on' : ''}`,
        isReady ? T('spellbook.card.headReadied') : T('spellbook.card.headReady'),
      );
      qReady.type = 'button';
      qReady.addEventListener('pointerdown', stopEv);
      qReady.addEventListener('dblclick', stopEv);
      qReady.onclick = (e) => {
        e.stopPropagation();
        handleReadySpell(item);
      };

      const qUnbind = el(
        doc,
        'button',
        `dfo-sb-head-btn is-unbind-btn${bind.bound ? '' : ' is-empty'}`,
        bind.bound ? T('spellbook.card.headUnbind', { k: bind.keyText }) : T('spellbook.card.headUnbindNone'),
      );
      qUnbind.type = 'button';
      qUnbind.disabled = !bind.bound;
      if (!bind.bound) qUnbind.title = T('spellbook.card.headUnbindNoneTip');
      qUnbind.addEventListener('pointerdown', stopEv);
      qUnbind.addEventListener('dblclick', stopEv);
      qUnbind.onclick = (e) => {
        e.stopPropagation();
        if (bind.bound) handleToggleBind(item);
      };

      const isVamp = sp?.tag === 'vampire';
      const isLycan = sp?.tag === (bridge.lycanTag || 'lycanthrope');
      const isProtected = isVamp || isLycan;
      const qDel = el(doc, 'button', `dfo-sb-head-btn is-del-btn${isProtected ? ' is-protected' : ''}`);
      qDel.type = 'button';
      qDel.setAttribute('aria-label', T('spellbook.card.headDelete'));
      qDel.title = isVamp
        ? T('spellbook.notice.cantDelVamp')
        : isLycan
          ? T('spellbook.notice.cantDelLycan')
          : T('spellbook.card.headDelete');
      const delIco = renderSvgIcon(doc, 'trash', 'dfo-sb-head-btn-ico');
      if (delIco) qDel.append(delIco);
      qDel.addEventListener('pointerdown', stopEv);
      qDel.addEventListener('dblclick', stopEv);
      qDel.onclick = (e) => {
        e.stopPropagation();
        playSfx('click');
        if (isVamp) { setNotice(T('spellbook.notice.cantDelVamp')); return; }
        if (isLycan) { setNotice(T('spellbook.notice.cantDelLycan')); return; }
        state.deleteKey = item.key;
        renderModal();
      };

      quickActs.append(
        qReady,
        qUnbind,
        el(doc, 'span', 'dfo-sb-vdiv dfo-sb-del-div'),
        qDel,
        el(doc, 'span', 'dfo-sb-vdiv dfo-sb-del-div'),
      );

      // 7. Mana Cost Badge
      const costWrap = el(doc, 'div', `dfo-sb-cost-slot${notEnough ? ' is-short' : ''}${item.cost === 0 ? ' is-free' : ''}`);
      const costVal = el(doc, 'span', 'dfo-sb-cost-val', String(item.cost));
      const costIco = renderSvgIcon(doc, 'mana', 'dfo-sb-cost-ico');
      costWrap.append(costVal);
      if (costIco) costWrap.append(costIco);

      head.append(marker, icoWrap, nameWrap, schoolsBand, tgtWrap, quickActs, costWrap);

      head.addEventListener('pointerdown', (e) => {
        state.activeKey = item.key;
        if (e.button !== 0 || state.renameKey === item.key) return;
        if (e.target.closest('button, input, textarea, select, form, .dfo-sb-head-btn, .dfo-sb-rename-pen, .dfo-sb-head-rename-form, .dfo-sb-spell-ico-box')) return;
        if (state.sortMode === 'custom' && !isPinned) {
          setupRowDragCandidate(e, item.key);
        } else if (bridge.hotbarOpen?.() && bridge.startHotbarDrag && !state.deleteKey) {
          const shortSigil = sp?.noIcon
            ? (bridge.sigilNoIcon ? bridge.sigilNoIcon(item.name) : spellSigil(item.name, bridge))
            : (bridge.sigilShort ? bridge.sigilShort(item.name) : spellSigil(item.name, bridge));
          bridge.startHotbarDrag(e, { kind: 'spell', spell: sp }, {
            sigil: shortSigil,
            element: sp?.element ?? null,
            icon: sp?.noIcon ? null : bridge.iconBox?.(sp?.icon, { box: bridge.iconBoxSize || 38 }),
          });
        }
      });

      head.addEventListener('dblclick', (e) => {
        if (Date.now() - lastDragEndedAt < 250) return;
        if (bridge.wasHotbarDrag?.()) return;
        if (e.target.closest('button, input, textarea, select, form, .dfo-sb-head-btn, .dfo-sb-rename-pen, .dfo-sb-head-rename-form')) return;
        e.preventDefault();
        toggleCardExpansion(item.key);
      });

      head.onkeydown = (e) => {
        if (e.target !== head) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleCardExpansion(item.key);
        }
      };

      return head;
    }

    function buildEffectSlotRow(slotIdx, ef) {
      if (!ef || ef.type == null || ef.type < 0) {
        const emptyRow = el(doc, 'div', 'dfo-sb-fx-row is-empty');
        emptyRow.append(el(doc, 'span', 'dfo-sb-fx-num', String(slotIdx + 1)), el(doc, 'span', 'dfo-sb-fx-empty-txt', T('spellbook.card.emptyEffect', { n: slotIdx + 1 })));
        return emptyRow;
      }

      const ru = isRu();
      const info = resolveEffectInfo(ef, entity, ru);
      const outcome = computeEffectOutcome(ef, info, entity.level || 1);
      const row = el(doc, 'div', 'dfo-sb-fx-row has-fx-tip');
      row.tabIndex = 0;
      row.style.setProperty('--dfo-fx-c', info.school.color);

      const numBadge = el(doc, 'div', 'dfo-sb-fx-num-wrap');
      numBadge.append(el(doc, 'span', 'dfo-sb-fx-num', String(slotIdx + 1)));
      const schIco = renderSvgIcon(doc, `school_${info.schoolId}`, 'dfo-sb-fx-sch-ico');
      if (schIco) numBadge.append(schIco);

      const content = el(doc, 'div', 'dfo-sb-fx-content');
      const topLine = el(doc, 'div', 'dfo-sb-fx-top');
      const titleGroup = el(doc, 'div', 'dfo-sb-fx-title-grp');
      titleGroup.append(el(doc, 'span', 'dfo-sb-fx-name', info.name));
      const schChip = el(doc, 'span', 'dfo-sb-fx-sch-chip', T(`spellbook.school.${info.schoolId}.name`));
      schChip.style.setProperty('--dfo-sch-c', info.school.color);
      titleGroup.append(schChip);

      const statsChips = el(doc, 'div', 'dfo-sb-fx-stats');
      if (outcome.magnitude) {
        const val = outcome.magnitude.lo === outcome.magnitude.hi ? String(outcome.magnitude.lo) : `${outcome.magnitude.lo}–${outcome.magnitude.hi}`;
        statsChips.append(el(doc, 'span', 'dfo-chip chip-red', T('spellbook.fx.magChip', { val })));
      }
      if (outcome.duration) {
        statsChips.append(el(doc, 'span', 'dfo-chip chip-purple', T('spellbook.fx.durChip', { n: outcome.duration.rounds })));
      }
      if (outcome.chance) {
        statsChips.append(el(doc, 'span', 'dfo-chip chip-gold', T('spellbook.fx.chanceChip', { n: outcome.chance.pct })));
      }
      if (info.warning) {
        const warnTag = el(doc, 'span', 'dfo-sb-fx-warn-ico');
        const wSvg = renderSvgIcon(doc, 'warn', 'dfo-sb-fx-warn-svg');
        if (wSvg) warnTag.append(wSvg);
        statsChips.append(warnTag);
      }
      statsChips.append(el(doc, 'span', 'dfo-sb-fx-tip-badge', '?'));
      topLine.append(titleGroup, statsChips);

      const formulaParts = [];
      if (outcome.magnitude) formulaParts.push(T('spellbook.fx.magFmt', outcome.magnitude));
      if (outcome.duration) formulaParts.push(T('spellbook.fx.durFmt', outcome.duration));
      if (outcome.chance) formulaParts.push(T('spellbook.fx.chanceFmt', outcome.chance));
      if (!formulaParts.length) formulaParts.push(T('spellbook.fx.fixedFmt'));
      const formulaLine = formulaParts.join(' · ');

      content.append(topLine, el(doc, 'div', 'dfo-sb-fx-formula', formulaLine));
      row.append(numBadge, content);

      attachStatusTip(
        row,
        () => ({ icon: `school_${info.schoolId}`, text: `${slotIdx + 1}. ${info.name}` }),
        () => {
          const cardItems = [];
          if (outcome.magnitude) {
            const val = outcome.magnitude.lo === outcome.magnitude.hi ? String(outcome.magnitude.lo) : `${outcome.magnitude.lo}–${outcome.magnitude.hi}`;
            cardItems.push({ icon: 'power', tone: 'aurum', label: T('spellbook.fx.tipMag'), value: val });
          }
          if (outcome.duration) {
            cardItems.push({ icon: 'clock', tone: 'loc', label: T('spellbook.fx.tipDur'), value: T('spellbook.fx.durVal', { n: outcome.duration.rounds }) });
          }
          if (outcome.chance) {
            cardItems.push({ icon: 'chance', tone: 'gold', label: T('spellbook.fx.tipChance'), value: `${outcome.chance.pct}%` });
          }
          const tipRows = [];
          if (cardItems.length) tipRows.push({ kind: 'cards', items: cardItems });
          tipRows.push({
            kind: 'info',
            fields: [{ label: T(`spellbook.school.${info.schoolId}.name`), value: info.descText || formulaLine }],
          });
          tipRows.push({ kind: 'sep' }, { color: '#e7d6a9', text: formulaLine });
          if (info.skillBoosted) {
            tipRows.push({ tone: 'good', text: T('spellbook.fx.masteryBoost', { abbr: T(`spellbook.school.${info.schoolId}.abbr`) }) });
          }
          if (info.warning) {
            tipRows.push(
              { kind: 'sep' },
              { tone: 'bad', text: `${ru ? info.warning.titleRu : info.warning.titleEn}: ${ru ? info.warning.textRu : info.warning.textEn}` },
            );
          }
          return tipRows;
        },
      );

      return row;
    }

    function buildCardBody(item) {
      const sp = item.spell;
      const body = el(doc, 'div', 'dfo-sb-card-body');

      // ── Column 1: Animated Spellmaker Visualization Canvas ──
      const vizCol = el(doc, 'div', 'dfo-sb-viz-col');
      const vizWell = el(doc, 'div', 'dfo-well-frame dfo-sb-viz-well');
      const vizCanvas = el(doc, 'canvas', 'dfo-sb-viz-canvas');
      vizCanvas.width = 350;
      vizCanvas.height = 281;
      vizCanvas.title = T('spellbook.card.vizPauseTip');
      vizCanvas.onclick = (e) => {
        e.stopPropagation();
        if (viz.key === item.key && viz.ctrl && viz.ctrl.getOpenAmount() > 0.5) {
          viz.ctrl.triggerBurst(4);
        }
      };

      const vizPauseBtn = el(doc, 'button', 'dfo-sb-viz-pause', viz.key === item.key && viz.paused ? '▶' : '⏸');
      vizPauseBtn.type = 'button';
      vizPauseBtn.title = T('spellbook.card.vizPauseTip');
      vizPauseBtn.classList.toggle('is-paused', Boolean(viz.key === item.key && viz.paused));
      vizPauseBtn.onclick = (e) => {
        e.stopPropagation();
        if (viz.key !== item.key) return;
        viz.paused = !viz.paused;
        viz.ctrl?.setPaused?.(viz.paused);
        vizPauseBtn.textContent = viz.paused ? '▶' : '⏸';
        vizPauseBtn.classList.toggle('is-paused', viz.paused);
      };

      const vizTag = el(doc, 'span', 'dfo-sb-viz-tag');
      const VIZ = root.DFO_SPELLMAKER_VIZ;
      if (VIZ) {
        const an = VIZ.analyzeSlots(buildVizSlots(sp));
        const lead = an?.slot1School || an?.active?.[0]?.school;
        vizTag.style.borderColor = lead?.primary || item.leadSchool.color;
        vizTag.style.color = lead?.core || '#f6e7b0';
        vizTag.textContent = an?.distinctCount >= 2
          ? T('spellbook.card.vizSynthesis', { n: an.distinctCount })
          : T(`spellbook.school.${item.leadSchoolId}.name`);
      } else {
        vizTag.textContent = T(`spellbook.school.${item.leadSchoolId}.name`);
      }
      vizWell.append(vizCanvas, vizTag, vizPauseBtn);
      vizCol.append(vizWell);

      // ── Column 2: 3 Effect Rows + Icon Settings Bar ──
      const midCol = el(doc, 'div', 'dfo-sb-mid-col');
      const fxSlots = el(doc, 'div', 'dfo-sb-fx-slots');
      const effects = sp?.effects || [];
      for (let i = 0; i < 3; i++) fxSlots.append(buildEffectSlotRow(i, effects[i] || null));

      const iconBar = el(doc, 'div', 'dfo-subpanel-frame dfo-sb-icon-bar');
      const iconPreview = el(doc, 'div', 'dfo-well-frame dfo-sb-icon-preview');
      iconPreview.style.setProperty('--dfo-el-glow', item.element.glow);
      const sigil = spellSigil(item.name, bridge);
      const iconEntry = resolveIconEntry(sp.icon);
      const totalIcons = IconReg?.getTotalCount ? IconReg.getTotalCount() : 69;

      if (sp.noIcon) {
        iconPreview.classList.add('is-sigil');
        iconPreview.append(el(doc, 'span', 'dfo-sb-icon-preview-sigil', sigil));
      } else {
        const img = el(doc, 'img');
        img.alt = '';
        if (applySpellIconToImg(img, sp.icon)) iconPreview.append(img);
        else {
          iconPreview.classList.add('is-sigil');
          iconPreview.append(el(doc, 'span', 'dfo-sb-icon-preview-sigil', sigil));
        }
      }

      const iconMeta = el(doc, 'div', 'dfo-sb-icon-meta');
      iconMeta.append(el(doc, 'div', 'dfo-sb-icon-title', T('spellbook.icon.barTitle')));
      const packTitle = isRu() ? iconEntry.packTitleRu : iconEntry.packTitleEn;
      const subText = sp.noIcon
        ? T('spellbook.icon.modeSigil', { sigil })
        : T('spellbook.icon.metaLine', { order: iconEntry.order || 1, total: totalIcons, pack: packTitle || 'ICON00I0' });
      iconMeta.append(el(doc, 'div', 'dfo-sb-icon-sub', subText));

      const iconBtns = el(doc, 'div', 'dfo-sb-icon-btns');
      const replaceBtn = el(doc, 'button', 'dfo-ornate-btn', T('spellbook.icon.replaceBtn'));
      replaceBtn.type = 'button';
      replaceBtn.onclick = (e) => {
        e.stopPropagation();
        playSfx('click');
        state.iconModalKey = item.key;
        state.iconModalSchool = 'all';
        renderModal();
      };

      const noIconBtn = el(doc, 'button', `dfo-ornate-btn${sp.noIcon ? ' on' : ''}`, T(sp.noIcon ? 'spellbook.icon.useIconBtn' : 'spellbook.icon.noIconBtn'));
      noIconBtn.type = 'button';
      noIconBtn.onclick = (e) => {
        e.stopPropagation();
        const nextNoIcon = !sp.noIcon;
        if (mutateLiveSpell(sp, { noIcon: nextNoIcon })) {
          playSfx('edit');
          setNotice(nextNoIcon ? T('spellbook.notice.sigilOn', { sigil }) : T('spellbook.notice.iconRestored'));
          refreshVisibleRow(item.key);
        }
      };
      iconBtns.append(replaceBtn, noIconBtn);
      iconBar.append(iconPreview, iconMeta, iconBtns);
      midCol.append(fxSlots, iconBar);

      // ── Column 3: Spell Details + Actions Bar ──
      const rightCol = el(doc, 'div', 'dfo-sb-right-col');
      const extraInfo = el(doc, 'div', 'dfo-subpanel-frame dfo-sb-extra-info');
      extraInfo.append(el(doc, 'div', 'dfo-sb-subhead', T('spellbook.info.title')));

      const kv = el(doc, 'table', 'dfo-kv dfo-sb-info-kv');
      const tbody = el(doc, 'tbody');
      const addInfoRow = (label, buildVal) => {
        const tr = el(doc, 'tr');
        tr.append(el(doc, 'th', null, label));
        const td = el(doc, 'td');
        buildVal(td);
        tr.append(td);
        tbody.append(tr);
      };

      const curMana = Math.max(0, Math.round(Number(entity.magicka) || 0));
      const maxMana = Math.max(1, Math.round(Number(entity.maxMagicka) || 1));
      const bind = getBindingInfo(sp, item.name);
      const originText = sp.tag === 'vampire'
        ? T('spellbook.info.srcVampire')
        : sp.tag === (bridge.lycanTag || 'lycanthrope')
          ? T('spellbook.info.srcLycan')
          : sp.custom
            ? T('spellbook.info.srcCustom')
            : T('spellbook.info.srcStandard', { idx: sp.index ?? '?' });

      addInfoRow(T('spellbook.info.element'), (td) => {
        const wrap = el(doc, 'span', 'dfo-sb-kv-badge');
        const dot = el(doc, 'span', 'dfo-sb-el-dot');
        dot.style.setProperty('--dfo-el-c', item.element.color);
        wrap.append(dot, el(doc, 'span', null, T(`spellbook.element.${item.elementId}`)));
        td.append(wrap);
      });
      addInfoRow(T('spellbook.info.target'), (td) => {
        const wrap = el(doc, 'span', 'dfo-sb-kv-badge');
        const ico = renderSvgIcon(doc, `target_${item.targetId}`, 'dfo-sb-kv-ico');
        if (ico) wrap.append(ico);
        wrap.append(el(doc, 'span', null, T(`spellbook.target.${item.targetId}.full`)));
        td.append(wrap);
      });
      addInfoRow(T('spellbook.info.leadSchool'), (td) => {
        const spEl = el(doc, 'span', 'dfo-sb-kv-school', T(`spellbook.school.${item.leadSchoolId}.name`));
        spEl.style.color = item.leadSchool.color;
        td.append(spEl);
      });
      addInfoRow(T('spellbook.info.manaCost'), (td) => {
        if (item.cost === 0) {
          td.append(el(doc, 'span', 'is-good', T('spellbook.info.manaFree')));
        } else if (item.cost > curMana) {
          td.append(el(doc, 'span', 'is-bad', `${item.cost} · ${T('spellbook.info.manaShort', { n: item.cost - curMana })}`));
        } else {
          const casts = Math.floor(curMana / Math.max(1, item.cost));
          const pct = Math.round((item.cost / maxMana) * 100);
          td.append(el(doc, 'span', null, `${item.cost} · ${T('spellbook.info.manaCasts', { n: casts, pct })}`));
        }
      });
      addInfoRow(T('spellbook.info.source'), (td) => td.append(el(doc, 'span', null, originText)));
      addInfoRow(T('spellbook.info.binding'), (td) => td.append(el(doc, 'span', bind.bound ? 'is-bound' : 'is-dim', bind.label)));

      kv.append(tbody);
      extraInfo.append(kv, el(doc, 'div', 'dfo-sb-info-note', T(`spellbook.target.${item.targetId}.desc`)));

      const actionsBar = el(doc, 'div', 'dfo-subpanel-frame dfo-sb-actions-bar');
      const isReady = isSpellReadied(sp, item.key);
      const readyBtn = el(doc, 'button', `dfo-ornate-btn ${isReady ? 'is-ready' : 'primary'}`, T(isReady ? 'spellbook.act.readied' : 'spellbook.act.ready'));
      readyBtn.type = 'button';
      readyBtn.onclick = (e) => { e.stopPropagation(); handleReadySpell(item); };

      const bindBtn = el(
        doc,
        'button',
        `dfo-ornate-btn${bind.bound ? ' on' : ''}`,
        isHotbarMode()
          ? (bind.bound ? T('spellbook.act.offHotbar', { slot: bind.keyText }) : T('spellbook.act.addHotbar'))
          : (bind.bound ? T('spellbook.act.unslot') : T('spellbook.act.quickslot')),
      );
      bindBtn.type = 'button';
      bindBtn.onclick = (e) => { e.stopPropagation(); handleToggleBind(item); };

      actionsBar.append(readyBtn, bindBtn);
      rightCol.append(extraInfo, actionsBar);

      body.append(vizCol, midCol, rightCol);
      return { body, vizCanvas };
    }

    function ensureCardCollapse(cardNode) {
      let collapse = cardNode.querySelector('.dfo-sb-card-collapse');
      let bodyMount = collapse?.querySelector('.dfo-sb-card-body-mount');
      if (!collapse) {
        collapse = el(doc, 'div', 'dfo-sb-card-collapse');
        const collapseInner = el(doc, 'div', 'dfo-sb-card-collapse-inner');
        bodyMount = el(doc, 'div', 'dfo-sb-card-body-mount');
        collapseInner.append(bodyMount);
        collapse.append(collapseInner);
        cardNode.append(collapse);
      }
      return { collapse, bodyMount };
    }

    function getEntryCardSig(vEntry, ruFlag = isRu() ? 1 : 0, curMana = Math.max(0, Math.round(Number(entity.magicka) || 0))) {
      if (!vEntry) return '';
      if (vEntry.kind !== 'card') return `${vEntry.kind}|${ruFlag}`;
      const it = vEntry.item;
      const sp = it.spell;
      const notEnough = it.cost > curMana ? 1 : 0;
      const ready = isSpellReadied(sp, it.key) ? 1 : 0;
      const ren = state.renameKey === it.key ? 1 : 0;
      const exp = state.expandedKey === it.key ? 1 : 0;
      return `${evalVersion}|${it.key}|${it.name}|${it.cost}|${notEnough}|${vEntry.isPinned ? 1 : 0}|${it.pinnedSlot}|${ready}|${sp?.icon ?? 0}|${sp?.noIcon ? 1 : 0}|${exp}|${ren}|${ruFlag}`;
    }

    function buildCardElement(item, isPinned) {
      const isOpen = state.expandedKey === item.key;
      const card = el(doc, 'article', `dfo-sb-card dfo-accent-panel${isOpen ? ' is-open' : ''}${isPinned ? ' is-pinned-hotbar' : ''}`);
      card.dataset.key = item.key;
      card._hotbarSpell = item.spell;
      card.addEventListener('mouseenter', () => { state.activeKey = item.key; });
      card.style.setProperty('--dfo-panel-c', item.leadSchool.color);
      card.style.setProperty('--dfo-panel-rgb', item.leadSchool.rgb);
      card.style.setProperty('--dfo-lead-sch-c', item.leadSchool.color);
      card.style.setProperty('--dfo-lead-sch-rgb', item.leadSchool.rgb);

      const head = buildCardHead(item, isPinned);
      card.append(head);
      if (isOpen) {
        const { bodyMount } = ensureCardCollapse(card);
        const { body, vizCanvas } = buildCardBody(item);
        bodyMount.append(body);
        if (typeof root.requestAnimationFrame === 'function') {
          root.requestAnimationFrame(() => {
            if (!destroyed && vizCanvas.isConnected && state.expandedKey === item.key) {
              startVizOnCanvas(item.spell, item.key, vizCanvas);
            }
          });
        }
      }
      return card;
    }

    // ── Virtualized List Engine (O(visible) DOM nodes, exact scroll preservation) ──
    function recomputeVirtualLayout() {
      let y = 0;
      const entries = [];
      const mainOnly = [];
      if (virt.showBanner) {
        entries.push({ kind: 'banner', key: '__banner__', yStart: y, height: virt.bannerH, yEnd: y + virt.bannerH });
        y += virt.bannerH + virt.gap;
      }
      for (const item of virt._pinnedItems || []) {
        const isOpen = state.expandedKey === item.key;
        const h = isOpen ? virt.expandedH : virt.rowH;
        entries.push({ kind: 'card', isPinned: true, item, key: item.key, mainIdx: -1, yStart: y, height: h, yEnd: y + h });
        y += h + virt.gap;
      }
      if ((virt._pinnedItems?.length || 0) > 0 && (virt._mainItems?.length || 0) > 0) {
        entries.push({ kind: 'divider', key: '__divider__', yStart: y, height: virt.dividerH, yEnd: y + virt.dividerH });
        y += virt.dividerH + virt.gap;
      }
      let mIdx = 0;
      for (const item of virt._mainItems || []) {
        const isOpen = state.expandedKey === item.key;
        const h = isOpen ? virt.expandedH : virt.rowH;
        const entry = { kind: 'card', isPinned: false, item, key: item.key, mainIdx: mIdx, yStart: y, height: h, yEnd: y + h };
        entries.push(entry);
        mainOnly.push(entry);
        y += h + virt.gap;
        mIdx++;
      }
      if (entries.length) y -= virt.gap;
      virt.vEntries = entries;
      virt.mainEntries = mainOnly;
      virt.totalHeight = Math.max(0, y);
    }

    function createEntryNode(vEntry) {
      if (vEntry.kind === 'banner') {
        const n = el(doc, 'div', 'dfo-sb-custom-banner', T('spellbook.customBanner'));
        n.dataset.vkey = '__banner__';
        return n;
      }
      if (vEntry.kind === 'divider') {
        const sep = el(doc, 'div', 'dfo-sb-hotbar-div');
        sep.setAttribute('role', 'separator');
        sep.dataset.vkey = '__divider__';
        const lbl = el(doc, 'div', 'dfo-sb-hotbar-div-label');
        lbl.append(el(doc, 'span', 'dfo-sb-hotbar-div-gem', '◆'), el(doc, 'span', null, T('spellbook.mainDivider')), el(doc, 'span', 'dfo-sb-hotbar-div-gem', '◆'));
        sep.append(el(doc, 'span', 'dfo-sb-hotbar-div-line'), lbl, el(doc, 'span', 'dfo-sb-hotbar-div-line is-right'));
        return sep;
      }
      const card = buildCardElement(vEntry.item, vEntry.isPinned);
      if (dragState?.active && dragState.key === vEntry.key) card.classList.add('is-drag-source');
      return card;
    }

    function observeExpandedHeight(cardNode) {
      if (measureRo) {
        try { measureRo.disconnect(); } catch {}
        measureRo = null;
      }
      if (!cardNode || typeof root.ResizeObserver !== 'function') return;
      measureRo = new root.ResizeObserver(() => {
        if (destroyed || !cardNode.isConnected || !cardNode.classList.contains('is-open')) return;
        const h = Math.round(cardNode.offsetHeight || 0);
        if (h > virt.rowH + 40 && Math.abs(h - virt.expandedH) > 3) {
          virt.expandedH = h;
          recomputeVirtualLayout();
          syncSpacersOnly();
        }
      });
      measureRo.observe(cardNode);
    }

    function syncSpacersOnly() {
      const entries = virt.vEntries;
      if (!entries.length || virt.lastStart < 0 || virt.lastEnd < virt.lastStart) return;
      const topH = Math.max(0, entries[virt.lastStart].yStart - virt.gap);
      const bottomH = Math.max(0, virt.totalHeight - entries[virt.lastEnd].yEnd - virt.gap);
      if (refs.topSpacer) {
        refs.topSpacer.style.height = `${topH}px`;
        refs.topSpacer.style.display = topH > 0 ? 'block' : 'none';
      }
      if (refs.bottomSpacer) {
        refs.bottomSpacer.style.height = `${bottomH}px`;
        refs.bottomSpacer.style.display = bottomH > 0 ? 'block' : 'none';
      }
    }

    function findWindowBounds() {
      const entries = virt.vEntries;
      if (!entries.length) return [-1, -1];
      const well = refs.listWell;
      const viewH = (well?.clientHeight > 0 ? well.clientHeight : 720);
      const scrollTop = Math.max(0, well?.scrollTop || 0);
      const minY = Math.max(0, scrollTop - OVERSCAN_PX);
      const maxY = scrollTop + viewH + OVERSCAN_PX;

      // Binary search first entry with yEnd >= minY
      let lo = 0, hi = entries.length - 1, start = entries.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (entries[mid].yEnd >= minY) { start = mid; hi = mid - 1; }
        else lo = mid + 1;
      }
      let end = start;
      while (end + 1 < entries.length && entries[end + 1].yStart <= maxY) end++;
      return [start, end];
    }

    function syncViewport({ forceRebuildNodes = false, checkCardSigs = false } = {}) {
      if (destroyed || !refs.listWrap) return;
      const entries = virt.vEntries;
      if (!entries.length) {
        virt.lastStart = -1;
        virt.lastEnd = -1;
        return;
      }
      const [start, end] = findWindowBounds();
      if (start < 0) return;
      if (!forceRebuildNodes && !checkCardSigs && !dragState?.active && start === virt.lastStart && end === virt.lastEnd) {
        return;
      }

      const ruFlag = isRu() ? 1 : 0;
      const curMana = Math.max(0, Math.round(Number(entity.magicka) || 0));
      const isCustomSort = state.sortMode === 'custom';
      const wanted = new Map();
      const wantedSigs = checkCardSigs ? new Map() : null;
      for (let i = start; i <= end; i++) {
        const ve = entries[i];
        wanted.set(ve.key, ve);
        if (wantedSigs) wantedSigs.set(ve.key, getEntryCardSig(ve, ruFlag, curMana));
      }

      // Unmount entries outside viewport window or with invalidated state
      for (const [k, rec] of [...virt.mounted.entries()]) {
        const sigMismatch = checkCardSigs && wantedSigs.has(k) && rec.cardSig !== wantedSigs.get(k);
        if (forceRebuildNodes || !wanted.has(k) || sigMismatch) {
          if (state.expandedKey === k) stopViz();
          rec.node.remove();
          virt.mounted.delete(k);
        }
      }

      if (!refs.topSpacer) refs.topSpacer = el(doc, 'div', 'dfo-sb-spacer is-top');
      if (!refs.bottomSpacer) refs.bottomSpacer = el(doc, 'div', 'dfo-sb-spacer is-bottom');

      const orderedNodes = [refs.topSpacer];
      const remainMain = dragState?.active
        ? virt.mainEntries.filter((e) => e.key !== dragState.key)
        : virt.mainEntries;
      let gapInserted = false;
      const gapBeforeKey = dragState?.active && dragState.gapMainIdx >= 0 && dragState.gapMainIdx < remainMain.length
        ? remainMain[dragState.gapMainIdx]?.key
        : null;
      const gapAtEnd = dragState?.active && gapBeforeKey == null && remainMain.length > 0;
      const lastRemainKey = gapAtEnd ? remainMain[remainMain.length - 1]?.key : null;

      let measuredCard = null;
      let expandedNode = null;
      for (let i = start; i <= end; i++) {
        const vEntry = entries[i];
        if (dragState?.active && dragState.dropGap && !gapInserted && vEntry.kind === 'card' && !vEntry.isPinned) {
          if (gapBeforeKey === vEntry.key) {
            orderedNodes.push(dragState.dropGap);
            gapInserted = true;
          }
        }
        let rec = virt.mounted.get(vEntry.key);
        if (!rec) {
          const node = createEntryNode(vEntry);
          const head = vEntry.kind === 'card' ? node.querySelector('.dfo-sb-card-head') : null;
          rec = {
            kind: vEntry.kind,
            node,
            head,
            vEntry,
            cardSig: wantedSigs ? wantedSigs.get(vEntry.key) : getEntryCardSig(vEntry, ruFlag, curMana),
          };
          virt.mounted.set(vEntry.key, rec);
        } else {
          rec.vEntry = vEntry;
          if (rec.kind === 'card') {
            rec.head?.classList?.toggle('is-draggable', isCustomSort && !vEntry.isPinned);
            rec.node.classList.toggle('is-drag-source', Boolean(dragState?.active && dragState.key === vEntry.key));
          }
        }
        orderedNodes.push(rec.node);
        if (gapAtEnd && dragState.dropGap && !gapInserted && vEntry.key === lastRemainKey) {
          orderedNodes.push(dragState.dropGap);
          gapInserted = true;
        }
        if (vEntry.kind === 'card') {
          if (state.expandedKey === vEntry.key) expandedNode = rec.node;
          else if (!measuredCard) measuredCard = rec.node;
        }
      }
      orderedNodes.push(refs.bottomSpacer);

      // Reconcile DOM children minimally to preserve focus/transitions & skip redundant mutations
      const wrap = refs.listWrap;
      const curChildren = wrap.children;
      let same = curChildren.length === orderedNodes.length;
      if (same) {
        for (let i = 0; i < orderedNodes.length; i++) {
          if (curChildren[i] !== orderedNodes[i]) { same = false; break; }
        }
      }
      if (!same) wrap.replaceChildren(...orderedNodes);

      virt.lastStart = start;
      virt.lastEnd = end;
      syncSpacersOnly();

      if (expandedNode) {
        const cv = expandedNode.querySelector('.dfo-sb-viz-canvas');
        const entry = wanted.get(state.expandedKey);
        if (cv && entry?.item && viz.canvas !== cv) {
          startVizOnCanvas(entry.item.spell, entry.key, cv);
        }
        observeExpandedHeight(expandedNode);
      }
      // Measure actual rendered row height asynchronously once after paint so Search/Sort/Scroll never flush sync layout
      if (!virt.rowMeasured && measuredCard && !syncMeasureRaf && typeof root.requestAnimationFrame === 'function') {
        syncMeasureRaf = root.requestAnimationFrame(() => {
          syncMeasureRaf = 0;
          if (destroyed || !measuredCard.isConnected) return;
          const h = measuredCard.offsetHeight;
          virt.rowMeasured = true;
          if (h > 30 && Math.abs(h - virt.rowH) > 2) {
            virt.rowH = h;
            recomputeVirtualLayout();
            syncSpacersOnly();
          }
        });
      }
    }

    function refreshVisibleRow(key) {
      const rec = virt.mounted.get(key);
      if (!rec) {
        renderSpellList({ preserveScroll: true, refreshEntity: false, refreshHotbar: false });
        return;
      }
      const vEntry = virt.vEntries.find((e) => e.key === key);
      if (!vEntry) {
        renderSpellList({ preserveScroll: true, refreshEntity: false, refreshHotbar: false });
        return;
      }
      const found = findSpellByOrderKey(key);
      if (found) {
        vEntry.item = getSpellModel(found.spell, key, isRu());
      }
      const nextCard = buildCardElement(vEntry.item, vEntry.isPinned);
      rec.node.replaceWith(nextCard);
      rec.node = nextCard;
      rec.head = nextCard.querySelector('.dfo-sb-card-head');
      rec.vEntry = vEntry;
      rec.cardSig = getEntryCardSig(vEntry);
      if (state.expandedKey === key) observeExpandedHeight(nextCard);
    }

    function toggleCardExpansion(key) {
      if (destroyed || !refs.listWrap) return;
      const prevKey = state.expandedKey;
      const nextKey = prevKey === key ? null : key;
      state.expandedKey = nextKey;
      state.activeKey = nextKey || key;
      if (nextKey !== state.renameKey) state.renameKey = null;

      if (expandTimer) {
        root.clearTimeout(expandTimer);
        expandTimer = 0;
      }
      if (expandScrollTimer) {
        root.clearTimeout(expandScrollTimer);
        expandScrollTimer = 0;
      }

      if (prevKey) {
        const prevRec = virt.mounted.get(prevKey);
        if (prevRec?.node) {
          prevRec.node.classList.remove('is-open');
          prevRec.node.querySelector('.dfo-sb-card-head')?.setAttribute('aria-expanded', 'false');
          prevRec.cardSig = getEntryCardSig(prevRec.vEntry);
          const collapse = prevRec.node.querySelector('.dfo-sb-card-collapse');
          stopViz();
          if (collapse) {
            expandTimer = root.setTimeout(() => {
              expandTimer = 0;
              if (!destroyed && state.expandedKey !== prevKey && !prevRec.node.classList.contains('is-open')) {
                collapse.remove();
              }
            }, 280);
          }
        } else {
          stopViz();
        }
      }

      if (nextKey) {
        const nextRec = virt.mounted.get(nextKey);
        const found = findSpellByOrderKey(nextKey);
        if (nextRec?.node && found) {
          const item = getSpellModel(found.spell, nextKey, isRu());
          const { bodyMount } = ensureCardCollapse(nextRec.node);
          const head = nextRec.node.querySelector('.dfo-sb-card-head');
          const { body, vizCanvas } = buildCardBody(item);
          bodyMount.replaceChildren(body);
          startVizOnCanvas(found.spell, nextKey, vizCanvas);
          void nextRec.node.offsetHeight;
          nextRec.node.classList.add('is-open');
          head?.setAttribute('aria-expanded', 'true');
          nextRec.cardSig = getEntryCardSig(nextRec.vEntry);
          observeExpandedHeight(nextRec.node);
          expandScrollTimer = root.setTimeout(() => {
            expandScrollTimer = 0;
            if (!destroyed && nextRec.node.isConnected && state.expandedKey === nextKey) {
              try { nextRec.node.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch {}
              const h = nextRec.node.offsetHeight;
              if (h > virt.rowH + 40) {
                virt.expandedH = h;
                recomputeVirtualLayout();
                syncSpacersOnly();
              }
            }
          }, 270);
        }
      } else {
        observeExpandedHeight(null);
      }

      recomputeVirtualLayout();
      syncSpacersOnly();
      playSfx('click');
    }

    function renderSpellList({ preserveScroll = true, refreshEntity = true, refreshHotbar = true } = {}) {
      if (destroyed || !refs.listWell || !refs.listWrap) return;
      if (refreshEntity) evalVersion++;
      if (refreshHotbar) hotbarVersion++;
      const { totalCount, schoolCounts, pinnedItems, mainItems, visibleCount } = getFilteredAndSortedModels(refreshEntity);
      if (refreshHotbar) lastHotbarSig = getHotbarSignature(hotbarVersion);
      const prevScroll = preserveScroll ? refs.listWell.scrollTop : 0;

      if (refreshEntity || totalCount !== virt.lastTotalCount) updateHeaderMeta(totalCount);
      if (refreshEntity) {
        updateManaUi();
        updateSkillsUi();
      }
      virt.lastTotalCount = totalCount;
      updateDropdownUi(schoolCounts);
      updateSortButtonUi();

      if (refs.searchCount) {
        refs.searchCount.textContent = (state.query || state.schoolFilter !== 'all')
          ? `${visibleCount}/${totalCount}`
          : String(totalCount);
      }
      if (refs.searchClear) refs.searchClear.hidden = !state.query;

      if (totalCount === 0 || visibleCount === 0) {
        stopViz();
        for (const rec of virt.mounted.values()) rec.node.remove();
        virt.mounted.clear();
        refs.listWrap.replaceChildren();
        virt.showingEmpty = true;
        virt.lastStart = -1;
        virt.lastEnd = -1;
        virt.vEntries = [];
        virt.mainEntries = [];
        virt.totalHeight = 0;
        const emptyBox = el(doc, 'div', 'dfo-sb-empty-box');
        emptyBox.append(el(doc, 'p', 'dfo-sb-empty-msg', T(totalCount === 0 ? 'spellbook.empty.book' : 'spellbook.empty.filtered')));
        if (totalCount > 0) {
          const resetBtn = el(doc, 'button', 'dfo-ornate-btn primary', T('spellbook.empty.reset'));
          resetBtn.type = 'button';
          resetBtn.onclick = () => {
            state.query = '';
            state.schoolFilter = 'all';
            if (refs.searchInput) refs.searchInput.value = '';
            renderSpellList({ preserveScroll: false, refreshEntity: false, refreshHotbar: false });
          };
          emptyBox.append(resetBtn);
        }
        refs.listWrap.append(emptyBox);
        refs.listWell.scrollTop = 0;
        return;
      }

      if (virt.showingEmpty) {
        refs.listWrap.replaceChildren();
        virt.showingEmpty = false;
      }

      virt.showBanner = state.sortMode === 'custom' && mainItems.length > 0;
      virt._pinnedItems = pinnedItems;
      virt._mainItems = mainItems;
      recomputeVirtualLayout();

      if (!preserveScroll) refs.listWell.scrollTop = 0;
      else refs.listWell.scrollTop = Math.min(prevScroll, Math.max(0, virt.totalHeight));
      virt.lastStart = -1;
      virt.lastEnd = -1;
      syncViewport({ checkCardSigs: true });
    }

    // ── Fluid Virtualized Drag-and-Drop in Custom Sort Mode ──
    function setupRowDragCandidate(ev, key) {
      if (state.sortMode !== 'custom' || ev.button !== 0) return;
      const well = refs.listWell;
      const wrap = refs.listWrap;
      const shell = refs.shell;
      if (!well || !wrap || !shell) return;
      const allMain = virt.mainEntries;
      if (allMain.length <= 1) return;

      const sourceEntry = allMain.find((e) => e.key === key);
      if (!sourceEntry) return;
      const sourceRec = virt.mounted.get(key);
      if (!sourceRec?.node) return;
      const head = sourceRec.node.querySelector('.dfo-sb-card-head');
      if (!head) return;

      // List of main entries excluding the dragged spell
      const remainEntries = allMain.filter((e) => e.key !== key);
      const startX = ev.clientX;
      const startY = ev.clientY;
      let active = false;
      let ghost = null;
      let dropGap = null;
      let gapIdx = Math.max(0, sourceEntry.mainIdx);
      let lastX = startX;
      let lastY = startY;
      let autoRaf = 0;

      const clearSiblingTransforms = () => {
        for (const rec of virt.mounted.values()) {
          if (rec.kind === 'card' && !rec.vEntry.isPinned) {
            rec.node.style.transition = '';
            rec.node.style.transform = '';
          }
        }
      };

      const computeGapIdxForClientY = (clientY) => {
        const wr = well.getBoundingClientRect();
        const padTop = parseFloat(root.getComputedStyle?.(well)?.paddingTop || '7') || 7;
        const contentY = clientY - wr.top - padTop + well.scrollTop;
        const draggedH = sourceEntry.height + virt.gap;
        let lo = 0;
        let hi = remainEntries.length - 1;
        let idx = remainEntries.length;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          const re = remainEntries[mid];
          const adjStart = re.mainIdx > sourceEntry.mainIdx ? re.yStart - draggedH : re.yStart;
          if (contentY < adjStart + re.height * 0.5) {
            idx = mid;
            hi = mid - 1;
          } else {
            lo = mid + 1;
          }
        }
        return idx;
      };

      const moveGap = (clientY) => {
        if (!active || destroyed) return;
        const nextIdx = computeGapIdxForClientY(clientY);
        if (nextIdx === gapIdx) return;
        gapIdx = nextIdx;
        if (dragState) dragState.gapMainIdx = nextIdx;

        // Capture pre-move tops ONLY of mounted visible main siblings (O(visible) even with 3000 spells)
        const sibNodes = [];
        for (const rec of virt.mounted.values()) {
          if (rec.kind === 'card' && !rec.vEntry.isPinned && rec.vEntry.key !== key && rec.node?.isConnected) {
            sibNodes.push({ re: rec.vEntry, node: rec.node });
          }
        }
        if (sibNodes.length > 1) sibNodes.sort((a, b) => a.re.mainIdx - b.re.mainIdx);
        const firstTops = sibNodes.map((s) => s.node.getBoundingClientRect().top);
        for (const s of sibNodes) {
          s.node.style.transition = 'none';
          s.node.style.transform = '';
        }

        const beforeKey = nextIdx < remainEntries.length ? remainEntries[nextIdx].key : null;
        const beforeNode = beforeKey ? virt.mounted.get(beforeKey)?.node : null;
        if (beforeNode && beforeNode.parentNode === wrap) {
          beforeNode.before(dropGap);
        } else if (refs.bottomSpacer && refs.bottomSpacer.parentNode === wrap) {
          refs.bottomSpacer.before(dropGap);
        } else {
          wrap.append(dropGap);
        }

        // Apply inverse FLIP offsets so visible neighbors glide smoothly
        let moved = false;
        for (let i = 0; i < sibNodes.length; i++) {
          const lastTop = sibNodes[i].node.getBoundingClientRect().top;
          const dy = firstTops[i] - lastTop;
          if (Math.abs(dy) > 0.5) {
            sibNodes[i].node.style.transform = `translate3d(0, ${dy.toFixed(1)}px, 0)`;
            moved = true;
          }
        }
        if (moved) {
          void wrap.offsetHeight;
          for (const s of sibNodes) {
            if (s.node.style.transform) {
              s.node.style.transition = 'transform 180ms cubic-bezier(0.22, 1, 0.36, 1)';
              s.node.style.transform = '';
            } else {
              s.node.style.transition = '';
            }
          }
        } else {
          clearSiblingTransforms();
        }
      };

      const stepAutoScroll = () => {
        if (!active || destroyed) return;
        const wr = well.getBoundingClientRect();
        const zone = 54;
        let delta = 0;
        if (lastY < wr.top + zone) delta = -Math.max(4, Math.round(((wr.top + zone - lastY) / zone) * 18));
        else if (lastY > wr.bottom - zone) delta = Math.max(4, Math.round(((lastY - (wr.bottom - zone)) / zone) * 18));
        if (delta !== 0) {
          const before = well.scrollTop;
          well.scrollTop += delta;
          if (well.scrollTop !== before) {
            syncViewport();
            moveGap(lastY);
          }
        }
        autoRaf = root.requestAnimationFrame(stepAutoScroll);
      };

      const activate = (me) => {
        active = true;
        hideTip();
        const headRect = head.getBoundingClientRect();
        const leadRgb = sourceEntry.item.leadSchool.rgb;
        const leadCol = sourceEntry.item.leadSchool.color;

        dropGap = el(doc, 'div', 'dfo-sb-drop-gap');
        dropGap.style.height = `${Math.round(headRect.height)}px`;
        dropGap.style.setProperty('--dfo-gap-c', leadCol);
        dropGap.style.setProperty('--dfo-gap-rgb', leadRgb);

        ghost = el(doc, 'div', 'dfo-sb-drag-ghost');
        ghost.style.left = `${Math.round(headRect.left)}px`;
        ghost.style.top = `${Math.round(headRect.top)}px`;
        ghost.style.width = `${Math.round(headRect.width)}px`;
        ghost.style.height = `${Math.round(headRect.height)}px`;
        ghost.style.setProperty('--dfo-panel-c', leadCol);
        ghost.style.setProperty('--dfo-panel-rgb', leadRgb);
        ghost.style.setProperty('--dfo-lead-sch-c', leadCol);
        ghost.style.setProperty('--dfo-lead-sch-rgb', leadRgb);
        const cloneHead = head.cloneNode(true);
        cloneHead.removeAttribute('tabindex');
        ghost.append(cloneHead);
        shell.append(ghost);

        sourceRec.node.before(dropGap);
        sourceRec.node.classList.add('is-drag-source');
        doc.body.classList.add('dfo-sb-dragging-active');

        dragState = { active: true, key, dropGap, ghost, gapMainIdx: gapIdx };
        ghost.style.transform = `translate3d(${((me.clientX - startX) * 0.28).toFixed(1)}px, ${(me.clientY - startY).toFixed(1)}px, 0) scale(1.008)`;
        autoRaf = root.requestAnimationFrame(stepAutoScroll);
        moveGap(me.clientY);
      };

      const cleanupDragListeners = () => {
        root.removeEventListener('pointermove', onMove, true);
        root.removeEventListener('pointerup', onUp, true);
        root.removeEventListener('pointercancel', onCancel, true);
        root.removeEventListener('blur', onCancel);
        if (autoRaf) { root.cancelAnimationFrame?.(autoRaf); autoRaf = 0; }
        if (cancelActiveDrag === cancelOnly) cancelActiveDrag = null;
      };

      const finish = (commit) => {
        cleanupDragListeners();
        if (!active) return;

        lastDragEndedAt = Date.now();
        doc.body.classList.remove('dfo-sb-dragging-active');
        clearSiblingTransforms();
        sourceRec.node?.classList?.remove('is-drag-source');
        ghost?.remove();
        dropGap?.remove();
        dragState = null;

        if (commit && !destroyed && remainEntries.length > 0) {
          const fromIdx = state.customOrder.indexOf(key);
          if (fromIdx >= 0) {
            state.customOrder.splice(fromIdx, 1);
            if (gapIdx <= 0) {
              const firstKey = remainEntries[0].key;
              const ins = state.customOrder.indexOf(firstKey);
              state.customOrder.splice(Math.max(0, ins), 0, key);
            } else {
              const prevKey = remainEntries[Math.min(gapIdx - 1, remainEntries.length - 1)].key;
              const ins = state.customOrder.indexOf(prevKey);
              state.customOrder.splice(ins >= 0 ? ins + 1 : state.customOrder.length, 0, key);
            }
            customOrderDirty = true;
            playSfx('edit');
            persistSettings({ immediate: true });
          }
        }
        if (!destroyed) renderSpellList({ preserveScroll: true, refreshEntity: false, refreshHotbar: false });
      };

      const cancelOnly = () => finish(false);
      const onUp = () => finish(true);
      const onCancel = () => finish(false);

      const onMove = (me) => {
        if (destroyed) {
          finish(false);
          return;
        }
        lastX = me.clientX;
        lastY = me.clientY;
        if (!active) {
          if (Math.hypot(me.clientX - startX, me.clientY - startY) < 6) return;
          activate(me);
          return;
        }
        if (ghost) {
          ghost.style.transform = `translate3d(${((lastX - startX) * 0.28).toFixed(1)}px, ${(lastY - startY).toFixed(1)}px, 0) scale(1.008)`;
        }
        moveGap(lastY);
      };

      cancelActiveDrag?.();
      cancelActiveDrag = cancelOnly;
      root.addEventListener('pointermove', onMove, true);
      root.addEventListener('pointerup', onUp, true);
      root.addEventListener('pointercancel', onCancel, true);
      root.addEventListener('blur', onCancel);
    }

    // ── Modals: Icon Picker & Compact Delete Confirm ──
    function syncIconPickerImages() {
      if (destroyed || !state.iconModalKey || !refs.modalHost) return;
      if (IconReg?.syncLiveIcons) {
        const changed = IconReg.syncLiveIcons(false);
        if (changed) {
          for (const img of refs.modalHost.querySelectorAll('img[data-icon-val]')) {
            applySpellIconToImg(img, Number(img.dataset.iconVal));
          }
          renderSpellList({ preserveScroll: true, refreshEntity: false, refreshHotbar: false });
        }
      }
    }

    function renderModal() {
      if (!refs.modalHost) return;
      if (state.deleteKey || state.iconModalKey) state.renameKey = null;
      refs.modalHost.replaceChildren();
      if (iconPollTimer) {
        root.clearTimeout(iconPollTimer);
        iconPollTimer = 0;
      }

      if (state.deleteKey) {
        const found = findSpellByOrderKey(state.deleteKey);
        if (!found) { state.deleteKey = null; return; }
        const sp = found.spell;
        const dispName = bridge.spellName ? (bridge.spellName(sp) ?? sp.name ?? '') : String(sp.name ?? '');
        const scrim = el(doc, 'div', 'dfo-sb-modal-scrim');
        scrim.onclick = (e) => { if (e.target === scrim) confirmDelete(false); };

        const box = el(doc, 'div', 'dfo-subpanel-frame dfo-sb-del-modal');
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        const head = el(doc, 'div', 'dfo-sb-del-head');
        head.append(el(doc, 'span', 'dfo-sb-del-title', T('spellbook.del.title')));
        const body = el(doc, 'div', 'dfo-sb-del-body');
        body.append(el(doc, 'p', 'dfo-sb-del-msg', T('spellbook.del.ask', { name: dispName })));
        const acts = el(doc, 'div', 'dfo-sb-del-acts');
        const btnYes = el(doc, 'button', 'dfo-ornate-btn danger', T('spellbook.del.confirm'));
        btnYes.type = 'button';
        btnYes.onclick = () => confirmDelete(true);
        const btnNo = el(doc, 'button', 'dfo-ornate-btn silver', T('spellbook.del.cancel'));
        btnNo.type = 'button';
        btnNo.onclick = () => confirmDelete(false);
        acts.append(btnYes, btnNo);
        box.append(head, body, acts);
        scrim.append(box);
        refs.modalHost.append(scrim);
        return;
      }

      if (state.iconModalKey) {
        const found = findSpellByOrderKey(state.iconModalKey);
        if (!found) { state.iconModalKey = null; return; }
        const sp = found.spell;
        const ru = isRu();
        const scrim = el(doc, 'div', 'dfo-sb-modal-scrim');
        scrim.onclick = (e) => { if (e.target === scrim) { state.iconModalKey = null; renderModal(); } };

        const modal = el(doc, 'div', 'dfo-window-frame dfo-sb-icon-modal');
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');

        const head = el(doc, 'div', 'wh dfo-sb-modal-head');
        const titleWrap = el(doc, 'div', 'dfo-sb-modal-title-wrap');
        titleWrap.append(el(doc, 'h2', 't', T('spellbook.icon.modalTitle')));
        const entry = resolveIconEntry(sp.icon);
        const total = IconReg?.getTotalCount ? IconReg.getTotalCount() : 69;
        titleWrap.append(el(doc, 'span', 'dfo-chip chip-gold', T('spellbook.icon.modalCount', { order: entry.order || 1, total })));
        const closeBtn = el(doc, 'button', 'dfo-ornate-btn close', T('spellbook.close'));
        closeBtn.type = 'button';
        closeBtn.onclick = () => { state.iconModalKey = null; renderModal(); };
        head.append(titleWrap, closeBtn);

        const tabs = el(doc, 'div', 'dfo-sb-icon-tabs');
        const counts = IconReg?.getSchoolCounts ? IconReg.getSchoolCounts() : new Map();
        const metaMap = IconReg?.SCHOOL_META || SCHOOL_META;
        const order = IconReg?.SCHOOL_ORDER || SCHOOL_ORDER;
        const makeTab = (val, label, dotCol, cnt) => {
          const b = el(doc, 'button', `dfo-sb-icon-tab${String(state.iconModalSchool) === String(val) ? ' on' : ''}`);
          b.type = 'button';
          if (dotCol) {
            const dot = el(doc, 'span', 'dfo-sb-icon-tab-dot');
            dot.style.background = dotCol;
            b.append(dot);
          }
          b.append(el(doc, 'span', null, label), el(doc, 'span', 'dfo-sb-icon-tab-cnt', String(cnt)));
          b.onclick = () => { state.iconModalSchool = val; renderModal(); };
          return b;
        };
        tabs.append(makeTab('all', T('spellbook.icon.modalAll'), null, total));
        for (const sid of order) {
          const cnt = counts.get(sid) || 0;
          if (!cnt) continue;
          const m = metaMap[sid];
          if (!m) continue;
          tabs.append(makeTab(sid, ru ? m.ru : m.en, m.color, cnt));
        }

        const gridWrap = el(doc, 'div', 'dfo-well-frame dfo-sm-icongrid-wrap dfo-scroll dfo-sb-icon-grid-well');
        const sections = IconReg?.getSections
          ? IconReg.getSections(ru ? 'ru' : 'en', state.iconModalSchool)
          : [{
              schoolId: 'all',
              name: T('spellbook.icon.modalAll'),
              color: '#d5b26e',
              hasCustom: false,
              entries: Array.from({ length: 69 }, (_, idx) => ({
                key: `num:${idx}`,
                value: idx,
                vanillaIndex: idx,
                labelRu: `#${idx + 1}`,
                labelEn: `#${idx + 1}`,
                src: bridge.iconUrl ? bridge.iconUrl(idx) : '',
              })),
            }];
        const activeKey = entry.key;
        let missingLive = false;

        for (const sec of sections) {
          const secEl = el(doc, 'div', 'dfo-sm-school-sec');
          secEl.style.setProperty('--sm-sch-c', sec.color);
          const secHead = el(doc, 'div', 'dfo-sm-school-sec-head');
          const secLeft = el(doc, 'span', 'dfo-sm-school-sec-name');
          secLeft.append(el(doc, 'span', 'dfo-sm-school-dot'), el(doc, 'span', null, sec.name));
          const secRight = el(doc, 'span', 'dfo-sm-school-sec-meta');
          if (sec.hasCustom) secRight.append(el(doc, 'span', 'dfo-sm-school-custom-badge', T('spellbook.icon.modalCustom')));
          secRight.append(el(doc, 'span', 'dfo-sm-school-sec-cnt', String(sec.entries.length)));
          secHead.append(secLeft, secRight);

          const grid = el(doc, 'div', 'dfo-sm-icongrid');
          for (const ic of sec.entries) {
            const isSel = !sp.noIcon && ic.key === activeKey;
            const cell = el(doc, 'button', `dfo-sm-iconcell${isSel ? ' on' : ''}`);
            cell.type = 'button';
            cell.title = `${ru ? ic.labelRu : ic.labelEn} · ${sec.name}`;
            const im = el(doc, 'img');
            im.alt = '';
            if (ic.vanillaIndex != null) {
              im.dataset.iconVal = String(ic.vanillaIndex);
              if (!bridge.iconUrl?.(ic.vanillaIndex)) missingLive = true;
            }
            im.src = (ic.vanillaIndex != null ? bridge.iconUrl?.(ic.vanillaIndex) : '') || ic.src || '';
            cell.append(im);
            cell.onclick = () => {
              const iconIdx = IconReg?.resolveGameIconIndex
                ? IconReg.resolveGameIconIndex(ic.value)
                : (Number.isInteger(ic.vanillaIndex) ? ic.vanillaIndex : 0);
              state.iconModalKey = null;
              if (mutateLiveSpell(sp, { icon: iconIdx, noIcon: false })) {
                playSfx('edit');
                setNotice(T('spellbook.notice.iconChanged'));
              }
              renderModal();
              renderSpellList({ preserveScroll: true, refreshEntity: false, refreshHotbar: false });
            };
            grid.append(cell);
          }
          secEl.append(secHead, grid);
          gridWrap.append(secEl);
        }

        modal.append(head, tabs, gridWrap);
        scrim.append(modal);
        refs.modalHost.append(scrim);

        if (missingLive) {
          iconPollTimer = root.setTimeout(syncIconPickerImages, 400);
        }
      }
    }

    // ── Mount DOM Shell Once ──
    function buildShell() {
      host.replaceChildren();
      const shell = el(doc, 'div', 'dfo-sb-shell');
      shell.append(buildSharedSvgDefs(doc));
      const win = el(doc, 'div', 'dfo-window-frame dfo-sb-win');
      const head = buildHeader();
      const body = el(doc, 'div', 'dfo-sb-body');
      const topPanel = el(doc, 'div', 'dfo-sb-top-panel');
      const leftPanel = el(doc, 'section', 'dfo-subpanel-frame dfo-accent-panel dfo-sb-top-left');
      leftPanel.append(buildManaBlock(), buildControlsRow());
      topPanel.append(leftPanel, buildSkillsPanel());

      const listWell = el(doc, 'div', 'dfo-well-frame dfo-sb-list-well dfo-scroll');
      const listWrap = el(doc, 'div', 'dfo-sb-list');
      listWell.append(listWrap);
      listWell.addEventListener('scroll', () => {
        hideTip();
        if (scrollRaf || destroyed) return;
        scrollRaf = root.requestAnimationFrame(() => {
          scrollRaf = 0;
          syncViewport();
        });
      }, { passive: true });

      body.append(topPanel, listWell);
      win.append(head, body);
      const modalHost = el(doc, 'div', 'dfo-sb-modal-host');
      shell.append(win, modalHost);
      host.append(shell);

      refs.shell = shell;
      refs.win = win;
      refs.listWell = listWell;
      refs.listWrap = listWrap;
      refs.modalHost = modalHost;

      if (bridge.overlayDismiss) {
        try {
          const rmOverlay = bridge.overlayDismiss(shell, '.dfo-sb-win', () => {
            if (!state.deleteKey && !state.iconModalKey && !dragState) deps.onExit?.();
          });
          if (typeof rmOverlay === 'function') cleanups.push(rmOverlay);
        } catch {}
      }
    }

    function getHotbarSignature(cacheVer = -1) {
      const spells = getSpellsArray();
      if (isHotbarMode()) {
        if (!bridge.hotbarSlot) return '';
        const parts = [];
        for (let i = 0; i < spells.length; i++) {
          const sp = spells[i];
          const c = cacheVer >= 0 && sp ? metaCache.get(sp) : null;
          let slot;
          if (c && c.hbVer === cacheVer && c.hbMode === true) {
            slot = c.hbSlot;
          } else {
            slot = bridge.hotbarSlot(sp, { spell: true });
            if (c) {
              c.hbSlot = slot;
              c.hbVer = cacheVer;
              c.hbMode = true;
            }
          }
          if (slot >= 0) parts.push(`${i}:${slot}`);
        }
        return `hb:${parts.join(',')}`;
      }
      const q = bridge.quickslotGet ? bridge.quickslotGet() : null;
      return `qs:${q && Number.isFinite(q.index) ? q.index : -1}`;
    }

    // ── windowStack Key Handler ──
    function onKeyDown(e) {
      if (destroyed || e.metaKey || e.ctrlKey || e.altKey) return;
      const tgt = e.target;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;

      if (dragState?.active && (bridge.keyAction?.(e) === 'back' || e.key === 'Escape')) {
        e.preventDefault();
        e.stopPropagation();
        cancelActiveDrag?.();
        return;
      }

      if (state.deleteKey) {
        const yes = e.code === 'KeyY' || e.key === 'y' || e.key === 'Y';
        const no = e.code === 'KeyN' || e.key === 'n' || e.key === 'N' || bridge.keyAction?.(e) === 'back' || e.key === 'Escape';
        if (!yes && !no) return;
        e.preventDefault();
        e.stopPropagation();
        confirmDelete(yes);
        return;
      }

      if (state.iconModalKey && (bridge.keyAction?.(e) === 'back' || e.key === 'Escape')) {
        e.preventDefault();
        e.stopPropagation();
        state.iconModalKey = null;
        renderModal();
        return;
      }

      if (dropdownOpen && (bridge.keyAction?.(e) === 'back' || e.key === 'Escape')) {
        e.preventDefault();
        e.stopPropagation();
        closeSchoolDropdown();
        return;
      }

      if (bridge.keyAction?.(e) === 'back' || bridge.isAction?.(e, 'CastSpell') || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) deps.onExit?.();
      }
    }

    // Bind global/document lifecycle listeners cleanly
    onGlobal(doc, 'pointerdown', hideTip, true);
    onGlobal(doc, 'visibilitychange', () => { if (doc.hidden) hideTip(); });
    onGlobal(root, 'pointerup', (e) => {
      if (destroyed || !bridge.hotbarOpen?.() || dragState?.active) return;
      if (e?.target && refs.win?.contains?.(e.target) && !bridge.wasHotbarDrag?.()) return;
      if (hotbarSyncTimer) root.clearTimeout(hotbarSyncTimer);
      hotbarSyncTimer = root.setTimeout(() => {
        hotbarSyncTimer = 0;
        if (destroyed) return;
        const sig = getHotbarSignature();
        if (sig !== lastHotbarSig) {
          lastHotbarSig = sig;
          renderSpellList({ preserveScroll: true, refreshEntity: false, refreshHotbar: true });
        }
      }, 0);
    }, false);
    onGlobal(doc, 'click', (e) => {
      if (dropdownOpen && refs.ddWrap && !refs.ddWrap.contains(e.target)) closeSchoolDropdown();
    });
    onGlobal(root, 'blur', hideTip);
    onGlobal(root, 'resize', () => { if (!destroyed) { virt.rowMeasured = false; syncViewport(); } });

    const unsubKeys = bridge.registerKeys ? bridge.registerKeys(deps.owner, onKeyDown) : null;
    if (typeof unsubKeys === 'function') cleanups.push(unsubKeys);

    if (bridge.setHotbarWindow) {
      try { bridge.setHotbarWindow('book', true, entity); } catch {}
    }
    if (bridge.registerHotbarPicker) {
      try {
        bridge.registerHotbarPicker('book', {
          selected: () => {
            if (destroyed || state.deleteKey || state.iconModalKey) return null;
            const pickedKey = state.expandedKey || state.activeKey;
            const found = pickedKey ? findSpellByOrderKey(pickedKey) : null;
            const sp = found?.spell || getSpellsArray()[0] || null;
            return sp ? { kind: 'spell', spell: sp } : null;
          },
          changed: () => {
            if (!destroyed) renderSpellList({ preserveScroll: true, refreshEntity: false, refreshHotbar: true });
          },
        });
      } catch {}
    }

    buildShell();
    renderSpellList({ preserveScroll: false, refreshEntity: false, refreshHotbar: true });
    bootRemoteCacheSync();
    playSfx('open');

    return {
      render() {
        if (destroyed) return;
        renderSpellList({ preserveScroll: true });
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        cancelActiveDrag?.();
        persistSettings({ immediate: true, gc: true });
        if (noticeTimer) { root.clearTimeout(noticeTimer); noticeTimer = 0; }
        if (iconPollTimer) { root.clearTimeout(iconPollTimer); iconPollTimer = 0; }
        if (cacheWriteTimer) { root.clearTimeout(cacheWriteTimer); cacheWriteTimer = 0; }
        if (expandTimer) { root.clearTimeout(expandTimer); expandTimer = 0; }
        if (expandScrollTimer) { root.clearTimeout(expandScrollTimer); expandScrollTimer = 0; }
        if (hotbarSyncTimer) { root.clearTimeout(hotbarSyncTimer); hotbarSyncTimer = 0; }
        if (syncMeasureRaf) { root.cancelAnimationFrame?.(syncMeasureRaf); syncMeasureRaf = 0; }
        if (scrollRaf) { root.cancelAnimationFrame?.(scrollRaf); scrollRaf = 0; }
        if (measureRo) { try { measureRo.disconnect(); } catch {} measureRo = null; }
        if (dragState) {
          doc.body?.classList?.remove('dfo-sb-dragging-active');
          dragState.ghost?.remove();
          dragState.dropGap?.remove();
          dragState = null;
        }
        stopViz();
        viz.ctrl = null;
        hideTip();
        for (let i = cleanups.length - 1; i >= 0; i--) {
          try { cleanups[i](); } catch {}
        }
        cleanups.length = 0;
        if (bridge.setHotbarWindow) {
          try { bridge.setHotbarWindow('book', false); } catch {}
        }
        virt.mounted.clear();
        virt.vEntries = [];
        virt.mainEntries = [];
        try { host.replaceChildren(); } catch {}
      },
    };
  }

  root.__dfoSpellbook = Object.freeze({ mount });
})(typeof window !== 'undefined' ? window : globalThis);
