(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) api.install(root);
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  // DFO Mod - ITEM DESCRIPTIONS, BUILT A SENTENCE AT A TIME.
  //
  // A description is a list of short sentences, each taken from the locale's tables (item-text/<locale>/, handed to
  // the page as __dfoItemTextPack by the hook): first what the base item is, then one sentence per property the piece
  // carries - its material, tier, maker, affixes, enchantments, power, sigil, sockets, curse and state. Every
  // sentence agrees with the base item's grammatical form: English number (s/p), Russian gender (m/f/n) or the plural
  // of a word that has no singular (p). Only the locale chosen at install is loaded: Russian with the translation
  // installed, English otherwise.
  //
  // Sentences combine where properties read as one thought: a weapon or armour piece is described together with its
  // armour type and metal (a neutral metal when the game does not show it), a Legendary by its own sentence of base
  // and power, and pairs of crafted or enchanted properties by one sentence (never sigils, sets or wear). The shared
  // rules (item-text/rules.json) rank the groups of fragments and keep at most `limit` of them.
  //
  // Pure reading: an item is never changed. What the game keeps hidden stays hidden: an unidentified piece is
  // described by its base, its visible material, its tier and its state only - never its affixes, enchantments,
  // curse, power, sigil or sockets. The caller supplies what only the game knows (identification, the visible
  // material) as facts; without facts nothing is guessed.

  /** The order sentences are said in; within a kind, the order the item lists them. */
  const KINDS = Object.freeze(['base', 'material', 'rarity', 'craft', 'affix', 'technique', 'enchantment', 'power',
    'sigil', 'socket', 'curse', 'content', 'food', 'dye', 'condition', 'state']);
  const RARITIES = new Set(['magic', 'rare', 'legendary', 'aetheric', 'artifact', 'gilded']);
  const MATERIALS = new Set(['iron', 'steel', 'silver', 'elven', 'dwarven', 'mithril', 'adamantium', 'ebony', 'orcish',
    'daedric', 'leather', 'chain', 'fur', 'cloth']);
  const CONSTRUCTIONS = new Set(['mail', 'brigandine']);
  const PARAM_AFFIXES = new Set(['stat', 'resist', 'elemental', 'slayer', 'standing']);
  const GEMS = new Set(['ruby', 'emerald', 'sapphire', 'diamond', 'jade', 'turquoise', 'malachite', 'amber']);
  const GEAR = new Set(['Weapons', 'Armor']);
  const CLOTHING = new Set(['MensClothing', 'WomensClothing']);
  /** sigil.js SIGIL_STAGES: Faint, Kindled, Bright, Radiant, Ascendant - the experience each begins at. */
  const SIGIL_STAGE_XP = Object.freeze([0, 5000, 12500, 22500, 37500]);
  /** lootRarity.js DAMNED_DRAWBACK: Health Leech, whenever used. */
  const DAMNED = Object.freeze({ type: 21, param: 0 });
  const ID = /^[a-z][a-z0-9-]{0,63}$/i;

  const own = (object, key) => object != null && Object.prototype.hasOwnProperty.call(object, key);
  const isInt = value => Number.isInteger(value);
  const isId = value => typeof value === 'string' && ID.test(value);
  /** A name from the item (a maker, a house) placed into a sentence as plain text: no controls, bounded. */
  const plain = value => {
    if (typeof value !== 'string') return null;
    // eslint-disable-next-line no-control-regex
    const text = value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, '').trim();
    return text && text.length <= 128 ? text : null;
  };

  /** Does the piece carry anything an identification would reveal? */
  function hasHidden(item) {
    return RARITIES.has(item.rarity) || item.artifact === true || !!item.legendary || !!item.gilded || !!item.aetheric
      || (Array.isArray(item.affixes) && item.affixes.length > 0)
      || (Array.isArray(item.enchantments) && item.enchantments.length > 0) || !!item.cursed;
  }

  /** The base row for an item: a group-specific key first ("Deeds:0"), then the template index. */
  function baseOf(pack, item) {
    if (!pack?.bases || !isInt(item?.templateIndex)) return null;
    const bases = pack.bases;
    const special = typeof item.group === 'string' ? `${item.group}:${item.templateIndex}` : null;
    if (special && own(bases, special)) return bases[special];
    return own(bases, String(item.templateIndex)) ? bases[String(item.templateIndex)] : null;
  }

  /** The keys a piece's properties call for, in order, before any text is looked up. */
  function plan(item, facts) {
    const known = facts.known === true;
    const out = [];
    const add = (kind, key, values) => out.push({ kind, key, values });

    // ── what it is made of: the caller's visible material, never a decoded raw code ──
    const material = typeof facts.material === 'string' ? facts.material.toLowerCase() : null;
    if (material && MATERIALS.has(material)) add('material', `material.${material}`);
    const construction = typeof facts.construction === 'string' ? facts.construction.toLowerCase() : null;
    if (construction && CONSTRUCTIONS.has(construction)) add('material', `construction.${construction}`);

    // ── the tier: seen even before identification, as the game's own tile and title show it ──
    const tier = RARITIES.has(item.rarity) ? item.rarity : item.artifact === true ? 'artifact' : null;
    if (tier === 'legendary' && item.exalted === true) add('rarity', 'rarity.exalted');
    else if (tier === 'rare' && known && facts.perfect === true) add('rarity', 'rarity.perfect');
    else if (tier) add('rarity', `rarity.${tier}`);
    if (known && item.imbued === true) add('rarity', 'rarity.imbued');

    // ── who made it, and whose it was ──
    if (isInt(item.quality) && item.quality >= 0 && item.quality <= 4) add('craft', `craft.quality.${item.quality}`);
    const maker = plain(item.maker);
    if (maker) add('craft', 'craft.maker', { maker });
    if (item.marked === true) add('craft', 'craft.marked');
    if (item.heirloom && typeof item.heirloom === 'object') {
      const house = plain(item.heirloom.house);
      add('craft', house ? 'heirloom.house' : 'heirloom', house ? { house } : undefined);
    }

    if (known) {
      // ── the lines: one sentence per kind and parameter; a socketed gem's line is the socket's ──
      for (const affix of Array.isArray(item.affixes) ? item.affixes : []) {
        if (!affix || typeof affix !== 'object' || typeof affix.id !== 'string' || affix.gem != null) continue;
        if (affix.id === 'technique') { if (isId(affix.param)) add('technique', `technique.${affix.param}`); continue; }
        if (affix.id === 'skill') { if (isInt(affix.param)) add('affix', `skill.${affix.param}`); continue; }
        if (PARAM_AFFIXES.has(affix.id)) { if (isId(affix.param)) add('affix', `affix.${affix.id}.${affix.param}`); continue; }
        if (isId(affix.id)) add('affix', `affix.${affix.id}`);
      }
      if (isInt(item.honed) && item.honed > 0) add('affix', 'affix.honed');
      if (isInt(item.reforges) && item.reforges > 0) add('affix', 'affix.reforged');

      // ── enchantments: a parameter's own sentence first, else its type's; a skill is the skill's sentence ──
      for (const e of Array.isArray(item.enchantments) ? item.enchantments : []) {
        if (!e || typeof e !== 'object' || !isInt(e.type) || e.type < 0) continue;
        if (e.type === 10 && isInt(e.param)) { add('enchantment', `skill.${e.param}`); continue; }
        add('enchantment', isInt(e.param) && e.param >= 0 ? [`enchantment.${e.type}.${e.param}`, `enchantment.${e.type}`] : `enchantment.${e.type}`);
      }

      // ── a named power: a Legendary's or a Gilded's record, or one imprinted on the piece ──
      for (const id of [item.legendary, item.gilded]) if (isId(id)) add('power', `power.${id}`);
      if (isId(item.imprint)) { add('power', 'power.imprint'); add('power', `power.${item.imprint}`); }

      // ── a sigil: its set, then how far it has grown ──
      const sigil = item.sigil;
      if (sigil && typeof sigil === 'object') {
        if (isId(sigil.set)) add('sigil', `sigil.set.${sigil.set}`);
        else if (Number.isFinite(sigil.power)) add('sigil', 'sigil.power');
        const xp = Number.isFinite(facts.sigilXp) ? facts.sigilXp : sigil.xp;
        if (Number.isFinite(xp) && xp >= 0) {
          let stage = 0;
          for (let i = 0; i < SIGIL_STAGE_XP.length; i++) if (xp >= SIGIL_STAGE_XP[i]) stage = i;
          add('sigil', `sigil.stage.${stage}`);
        }
      }

      // ── sockets: each gem's kind once, then whether any socket is still empty ──
      const sockets = Array.isArray(item.sockets) ? item.sockets : typeof item.socket === 'string' ? [item.socket] : [];
      let empty = false;
      for (const socket of sockets) {
        if (socket === 'empty') { empty = true; continue; }
        const kind = typeof socket === 'string' ? socket.split('-').pop() : null;
        if (GEMS.has(kind)) add('socket', `socket.gem.${kind}`);
      }
      if (empty) add('socket', 'socket.empty');

      // ── a curse, said once the piece is known (as the game says it) ──
      const cursed = item.cursed;
      if (cursed && typeof cursed === 'object') {
        add('curse', cursed.type === DAMNED.type && cursed.param === DAMNED.param ? 'curse.damned' : 'curse.cursed');
      }
    }

    // ── what it holds ──
    if (isInt(item.potionRecipeKey) && item.potionRecipeKey >= 0) add('content', 'content.potion');
    if (isInt(item.potent) && item.potent > 0) add('content', 'content.potent');
    if (isInt(item.trappedSoulType) && item.trappedSoulType >= 0) add('content', 'content.soul');
    if (GEAR.has(item.group) && isInt(item.poisonType) && item.poisonType >= 0) add('content', [`content.poison.${item.poisonType}`, 'content.poison']);

    // ── food ──
    if (isInt(item.foodStage) && item.foodStage >= 0 && item.foodStage <= 4) add('food', `food.stage.${item.foodStage}`);
    if (item.noRot === true) add('food', 'food.noRot');
    else if (item.slowRot === true) add('food', 'food.slowRot');
    if (item.chef === true) add('food', 'food.chef');

    // ── a garment's dye ──
    if (CLOTHING.has(item.group) && isInt(item.dye) && item.dye >= 0) add('dye', `dye.${item.dye}`);

    // ── a weapon's or armour's wear ──
    if (GEAR.has(item.group) && Number.isFinite(item.currentCondition) && Number.isFinite(item.maxCondition) && item.maxCondition > 0) {
      const share = Math.max(0, item.currentCondition) / item.maxCondition;
      add('condition', share <= 0 ? 'condition.broken' : share < 0.4 ? 'condition.battered' : share < 0.75 ? 'condition.worn'
        : share < 1 ? 'condition.used' : 'condition.new');
    }

    // ── its standing in the world ──
    if (!known && hasHidden(item)) add('state', 'state.unidentified');
    if (item.questItem === true) add('state', 'state.quest');
    if (item.stolen === true) add('state', 'state.stolen');
    if (item.bound === true) add('state', 'state.bound');
    if (isInt(item.timeForItemToDisappear) && item.timeForItemToDisappear > 0) add('state', 'state.summoned');
    if (item.livingKeepsake && typeof item.livingKeepsake === 'object') add('state', 'state.keepsake');
    if (item.legacyRemains && typeof item.legacyRemains === 'object') add('state', 'state.remains');
    return out;
  }

  /** Text in the base's form from a row of forms, its placeholders filled; null when a value is missing. */
  function fill(row, form, pack, values) {
    if (!row) return null;
    const text = typeof row === 'string' ? row : row[form] ?? row[pack.defaultForm];
    if (typeof text !== 'string') return null;
    let missing = false;
    const filled = text.replace(/\{([a-z]+)\}/g, (all, name) => {
      const value = values && own(values, name) ? values[name] : null;
      if (value == null) { missing = true; return all; }
      return String(value);
    });
    return missing ? null : filled;
  }
  /** A property's sentence in the base's form: the form's own text, else the locale's default form's. */
  function sentence(pack, key, form, values) {
    return fill(own(pack.properties, key) ? pack.properties[key] : null, form, pack, values);
  }

  const METALS = new Set(['iron', 'steel', 'silver', 'elven', 'dwarven', 'mithril', 'adamantium', 'ebony', 'orcish', 'daedric']);
  const ARMOR_TYPES = new Set(['leather', 'chain', 'plate']);
  const lower = value => (typeof value === 'string' ? value.toLowerCase() : null);
  /** Which frame a weapon or a piece of armour takes: '' for a weapon; for armour its type as the game shows it
   *  (leather, chain, plate) or a Roleplay & Realism variant (mail, brigandine, fur). Null when it cannot be told. */
  function variantOf(item, facts) {
    if (item.group === 'Weapons') return '';
    if (item.group !== 'Armor') return null;
    const construction = lower(facts.construction), material = lower(facts.material), type = lower(facts.armorType);
    if (construction === 'mail' || construction === 'brigandine') return construction;
    if (material === 'fur') return 'fur';
    if (ARMOR_TYPES.has(type)) return type;
    if (material === 'leather' || material === 'chain') return material;
    return METALS.has(material) ? 'plate' : null;
  }
  /** The base's name as it stands inside a sentence ("longsword", «длинный меч»). */
  function inlineName(pack, base) {
    const name = String(base.name || '');
    if (pack.inlineName === 'lower') return name.toLowerCase();
    if (pack.inlineName === 'lowerFirst') return name.charAt(0).toLowerCase() + name.slice(1);
    return name;
  }
  /** The identity sentence: a Legendary's own (its base and its power together), else the base item with its armour
   *  type and metal, else the plain base. Answers it with the property keys it already says. */
  function identity(pack, item, facts, base, form, known) {
    if (known) {
      for (const id of [item.legendary, item.gilded]) {
        if (!isId(id) || !own(pack.legendaries, id)) continue;
        const text = fill(pack.legendaries[id], form, pack, { base: inlineName(pack, base) });
        if (text) return { key: `legendary.${id}`, text, says: key => key === `power.${id}` };
      }
    }
    const variant = variantOf(item, facts);
    const frame = variant == null || !pack.gear ? null : pack.gear[`${item.templateIndex}:${variant}`];
    if (typeof frame === 'string') {
      const metal = METALS.has(lower(facts.material)) ? lower(facts.material) : 'unknown';
      const text = fill(frame, form, pack, { material: pack.metals?.[metal] ?? pack.metals?.unknown });
      if (text) return { key: `gear.${item.templateIndex}.${variant || 'weapon'}`, text, says: key => key.startsWith('material.') || key.startsWith('construction.') };
    }
    return { key: 'base', text: base.text, says: () => false };
  }
  /** Does a combination's pattern take this key? "x.*" is x itself or any x.<param>. */
  const takes = (pattern, key) => (pattern.endsWith('.*') ? key === pattern.slice(0, -2) || key.startsWith(pattern.slice(0, -1)) : key === pattern);
  /** Which ranking group a key belongs to: the first whose prefix matches. */
  function groupIndex(rules, key) {
    const groups = rules?.groups ?? [];
    for (let i = 0; i < groups.length; i++) {
      for (const prefix of groups[i].keys) {
        if (prefix.endsWith('.') ? key.startsWith(prefix) : key === prefix || key.startsWith(prefix + '.')) return i;
      }
    }
    return groups.length;
  }

  /**
   * The description of one item: [{ kind, key, group, text }] in reading order.
   * facts: { known (identified, as the game decides), material ('steel', 'leather', 'chain' for an unknown metal,
   *          'fur', 'cloth' - only when the game shows it), armorType ('leather' | 'chain' | 'plate', the card's Type
   *          row), construction ('mail' | 'brigandine'), perfect, sigilXp }
   * options: { max (fragments; the rules' limit by default, Infinity for all), kinds (only these), skip (not these) }
   * A template the tables do not know gets no description: its grammatical form is unknown.
   *
   * Steps: the identity sentence (Legendary, base + armour type + metal, or base); one candidate per property;
   * combinations of crafted and enchanted properties replace their parts; the rules rank the groups and keep at most
   * the limit; what is kept is said in reading order.
   */
  function describe(pack, item, facts = {}, options = {}) {
    if (!pack || !item || typeof item !== 'object' || Array.isArray(item)) return [];
    const base = baseOf(pack, item);
    if (!base) return [];
    facts = facts && typeof facts === 'object' ? facts : {};
    const form = pack.forms.includes(base.form) ? base.form : pack.defaultForm;
    const only = Array.isArray(options.kinds) ? new Set(options.kinds) : null;
    const skip = new Set(Array.isArray(options.skip) ? options.skip : []);
    const wanted = kind => (!only || only.has(kind)) && !skip.has(kind);
    const limit = options.max === Infinity ? Infinity : Number.isInteger(options.max) && options.max >= 0 ? options.max
      : Number.isInteger(pack.rules?.limit) ? pack.rules.limit : Infinity;
    const known = facts.known === true;

    // 1. One candidate per property, the first key of a step that has a sentence; a key is said once.
    const candidates = [], said = new Set();
    plan(item, facts).forEach((step, order) => {
      for (const key of Array.isArray(step.key) ? step.key : [step.key]) {
        if (said.has(key)) break;
        const text = sentence(pack, key, form, step.values);
        if (text == null) continue;
        said.add(key);
        candidates.push({ kind: step.kind, key, text, values: step.values, order: order + 1 });
        break;
      }
    });
    // 2. The identity sentence, and the separate sentences it already says (the material, the power).
    const who = identity(pack, item, facts, base, form, known);
    let live = candidates.filter(c => !who.says(c.key));
    live.unshift({ kind: 'base', key: who.key, text: who.text, order: 0 });
    // 3. Combinations: every part present and not yet combined; the parts give way to the one sentence.
    for (const combo of Array.isArray(pack.combos) ? pack.combos : []) {
      const parts = [];
      for (const pattern of combo.requires) {
        const part = live.find(c => c.order > 0 && !parts.includes(c) && takes(pattern, c.key));
        if (!part) break;
        parts.push(part);
      }
      if (parts.length !== combo.requires.length) continue;
      const values = Object.assign({}, ...parts.map(p => p.values || {}));
      const text = fill(combo.text, form, pack, values);
      if (text == null) continue;
      live = live.filter(c => !parts.includes(c));
      live.push({ kind: combo.key.split('.')[1], key: combo.key, text, order: Math.min(...parts.map(p => p.order)) });
    }
    // 4. Rank: up to each group's max in group order, then any room left in the same order.
    live = live.filter(c => wanted(c.kind));
    const rules = pack.rules ?? { groups: [] };
    for (const c of live) c.group = groupIndex(rules, c.key);
    const ranked = [...live].sort((a, b) => a.group - b.group || a.order - b.order);
    const kept = [], texts = new Set(), taken = new Map();
    const keep = c => {
      if (kept.length >= limit || kept.includes(c) || texts.has(c.text)) return;
      kept.push(c); texts.add(c.text); taken.set(c.group, (taken.get(c.group) || 0) + 1);
    };
    for (const c of ranked) {
      const cap = rules.groups?.[c.group]?.max;
      if (!Number.isInteger(cap) || (taken.get(c.group) || 0) < cap) keep(c);
    }
    for (const c of ranked) keep(c);
    // 5. Read in order: what the thing is, then its make, magic and state.
    return kept.sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.order - b.order)
      .map(c => ({ kind: c.kind, key: c.key, group: rules.groups?.[c.group]?.id ?? null, text: c.text }));
  }

  /** Every property key a description could ask for, by kind - the tables' coverage checks read this. */
  function keysFor(item, facts = {}) {
    return plan(item, facts).flatMap(step => (Array.isArray(step.key) ? step.key : [step.key]));
  }

  function install(win) {
    if (win.__dfoItemText) return;
    const pack = win.__dfoItemTextPack && typeof win.__dfoItemTextPack === 'object' ? win.__dfoItemTextPack : null;
    const counters = { described: 0, empty: 0 };
    const counted = (item, facts, options) => {
      const out = describe(pack, item, facts, options);
      counters[out.length ? 'described' : 'empty']++;
      return out;
    };
    win.__dfoItemText = Object.freeze({
      locale: pack?.locale ?? null,
      name: pack?.name ?? null,
      error: pack ? null : String(win.__dfoItemTextError || 'no item text pack'),
      /** [{kind, key, text}] for an item; [] without a pack or for a template the tables do not know. */
      describe: counted,
      /** The same sentences as one paragraph. */
      text: (item, facts, options) => counted(item, facts, options).map(s => s.text).join(' '),
      has(key) { return !!pack && own(pack.properties, key); },
      stats: () => ({ ...counters, bases: pack ? Object.keys(pack.bases).length : 0, properties: pack ? Object.keys(pack.properties).length : 0 }),
    });
  }

  return { KINDS, SIGIL_STAGE_XP, baseOf, plan, describe, keysFor, sentence, variantOf, groupIndex, install };
});
