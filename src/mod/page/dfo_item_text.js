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
  // Sentences combine where properties read as one thought: a weapon or armour piece with its armour type and metal
  // (a neutral metal when the game does not show it), the tier with its sigil and set, a Legendary's base with its
  // power, and pairs of crafted or enchanted properties. The shared rules (item-text/rules.json) set one universal
  // order of seven slots; the random slots draw with a seed taken from the item, so one item always reads the same.
  //
  // Every description ends with the player hint, its own paragraph after one blank line: what to do with the piece -
  // its state's advice first (a quest's item, an unidentified or cursed piece, a broken one, a Legendary, a set, a
  // made piece), else its base item's (item-text/hints.json: which craft takes an ingredient, where an ore is smelted,
  // that a plain sword is better than nothing). What a writ pays silver for gets a second sentence - in the voice of
  // the character's guild when the character is in one (facts.guild).
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
  const EQUIPPABLE = new Set(['Weapons', 'Armor', 'Jewellery', 'MensClothing', 'WomensClothing']);
  /** Ammunition (DFU's Arrow, the Dwemer bullet): spent by the stack, never worn down or mended. */
  const AMMUNITION = new Set([131, 561]);
  const wearable = item => EQUIPPABLE.has(item.group) && !(item.group === 'Weapons' && AMMUNITION.has(item.templateIndex));
  /** itemKinds.js isPotion: DFU's Glass Bottle (UselessItems1 83) is the potion. Every item carries potionRecipeKey
   *  (0 by default), so the key alone says nothing - a bed has one too. */
  const isPotion = item => item.group === 'UselessItems1' && item.templateIndex === 83;
  /** itemLaw.js: a soul is held by a Soul Trap (MiscItems 274) or by Azura's Star (artifact 9). */
  const holdsSouls = item => (item.group === 'MiscItems' && item.templateIndex === 274)
    || (item.artifact === true && isInt(item.artifactIndexBitfield) && item.artifactIndexBitfield >> 1 === 9);
  /** The share of its condition a piece still has, or null when it does not say. */
  const conditionOf = item => (Number.isFinite(item.currentCondition) && Number.isFinite(item.maxCondition) && item.maxCondition > 0
    ? Math.max(0, item.currentCondition) / item.maxCondition : null);
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

    // ── a sigil: the game shows it and its set at once, identified or not; then how far it has grown ──
    const sigil = item.sigil;
    if (sigil && typeof sigil === 'object') {
      if (isId(sigil.set)) add('sigil', `sigil.set.${sigil.set}`);
      if (Number.isFinite(sigil.power) && sigil.power > 0) add('sigil', 'sigil.power');
      const xp = Number.isFinite(facts.sigilXp) ? facts.sigilXp : sigil.xp;
      if (Number.isFinite(xp) && xp >= 0) {
        let stage = 0;
        for (let i = 0; i < SIGIL_STAGE_XP.length; i++) if (xp >= SIGIL_STAGE_XP[i]) stage = i;
        add('sigil', `sigil.stage.${stage}`);
      }
    }

    // ── what it holds: a potion only in a potion's bottle, a soul only in what holds souls, poison only on a weapon ──
    if (isPotion(item)) {
      add('content', 'content.potion');
      if (isInt(item.potent) && item.potent > 0) add('content', 'content.potent');
    }
    if (holdsSouls(item) && isInt(item.trappedSoulType) && item.trappedSoulType >= 0) add('content', 'content.soul');
    if (item.group === 'Weapons' && isInt(item.poisonType) && item.poisonType >= 0) add('content', [`content.poison.${item.poisonType}`, 'content.poison']);

    // ── food ──
    if (isInt(item.foodStage) && item.foodStage >= 0 && item.foodStage <= 4) add('food', `food.stage.${item.foodStage}`);
    if (item.noRot === true) add('food', 'food.noRot');
    else if (item.slowRot === true) add('food', 'food.slowRot');
    if (item.chef === true) add('food', 'food.chef');

    // ── a garment's dye ──
    if (CLOTHING.has(item.group) && isInt(item.dye) && item.dye >= 0) add('dye', `dye.${item.dye}`);

    // ── wear: only what a character can put on; every item carries the field, the rest ignore it ──
    const share = conditionOf(item);
    if (wearable(item) && share != null) {
      add('condition', share <= 0 ? 'condition.broken' : share < 0.4 ? 'condition.battered' : share < 0.75 ? 'condition.worn'
        : share < 1 ? 'condition.used' : 'condition.new');
    }

    // ── its standing in the world (a quest's item is said by the hint, not here) ──
    if (!known && hasHidden(item)) add('state', 'state.unidentified');
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
  function inlineName(pack, base, item) {
    // A name that says one kind of armour («Латные перчатки») is said plainly inside a sentence about a piece that may be
    // leather or chain: the locale's inlineNames give such a template its neutral word («боевые перчатки»).
    const plainName = item && pack.inlineNames && own(pack.inlineNames, String(item.templateIndex)) ? pack.inlineNames[String(item.templateIndex)] : null;
    if (plainName) return plainName;
    const name = String(base.name || '');
    if (pack.inlineName === 'lower') return name.toLowerCase();
    if (pack.inlineName === 'lowerFirst') return name.charAt(0).toLowerCase() + name.slice(1);
    return name;
  }
  /** Slot 1, checked in this order: base item + armour type + metal, base item + metal (a weapon), a garment + its
   *  colour, base item. The game dyes every garment (item.dye, CLOTHING_DYES); the colour takes the base's form. */
  function identity(pack, item, facts, base, form) {
    const garment = CLOTHING.has(item.group) && isInt(item.dye) && pack.clothing && own(pack.clothing, String(item.templateIndex))
      ? pack.clothing[String(item.templateIndex)] : null;
    const color = garment && pack.colors && own(pack.colors, `dye.${item.dye}`) ? pack.colors[`dye.${item.dye}`] : null;
    const word = color ? color[form] ?? color[pack.defaultForm] : null;
    const dressed = word ? fill(garment, form, pack, { color: word }) : null;
    if (dressed) {
      return { key: `clothing.${item.templateIndex}`, text: dressed.charAt(0).toUpperCase() + dressed.slice(1), says: key => key.startsWith('dye.') };
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
  /** Slot 2, checked in this order: tier + sigil + set, tier + sigil, tier + set, tier; a sigil or set alone only
   *  when the piece has no tier. The game shows the sigil and its set whether or not the piece is identified. */
  function tierOf(pack, item, facts, form, known) {
    const rarity = RARITIES.has(item.rarity) ? item.rarity : item.artifact === true ? 'artifact' : null;
    const tier = rarity === 'legendary' && item.exalted === true ? 'exalted'
      : rarity === 'rare' && known && facts.perfect === true ? 'perfect' : rarity;
    const sigil = item.sigil && typeof item.sigil === 'object' ? item.sigil : null;
    const power = !!sigil && Number.isFinite(sigil.power) && sigil.power > 0;
    const set = sigil && isId(sigil.set) ? sigil.set : null;
    const chain = [];
    if (tier) {
      if (power && set) chain.push(`tier.${tier}.sigil.set`);
      if (power) chain.push(`tier.${tier}.sigil`);
      if (set) chain.push(`tier.${tier}.set`);
      chain.push(`rarity.${tier}`);
    } else {
      if (set) chain.push(`sigil.set.${set}`);
      if (power) chain.push('sigil.power');
    }
    const values = set && own(pack.sets, set) ? { set: pack.sets[set] } : {};
    for (const key of chain) {
      const row = own(pack.tiers, key) ? pack.tiers[key] : own(pack.properties, key) ? pack.properties[key] : null;
      const text = fill(row, form, pack, values);
      if (text) return { key, text };
    }
    return null;
  }
  /** Does a combination's pattern take this key? "x.*" is x itself or any x.<param>. */
  const takes = (pattern, key) => (pattern.endsWith('.*') ? key === pattern.slice(0, -2) || key.startsWith(pattern.slice(0, -1)) : key === pattern);
  /** The category a key belongs to: the first whose prefix matches. */
  function categoryOf(rules, key) {
    for (const category of rules?.categories ?? []) {
      for (const prefix of category.keys) {
        if (prefix.endsWith('.') ? key.startsWith(prefix) : key === prefix || key.startsWith(prefix + '.')) return category.id;
      }
    }
    return null;
  }
  /** A stable seed for an item: its own id, else what makes it this piece. One item always reads the same. */
  function seedOf(item) {
    const parts = typeof item.uid === 'string' && item.uid ? [item.uid]
      : [item.templateIndex, item.group, item.name, item.value, item.material, item.rarity, item.legendary, item.gilded,
        JSON.stringify(item.affixes ?? null), JSON.stringify(item.enchantments ?? null), JSON.stringify(item.sigil ?? null), item.maker];
    let h = 2166136261;   // FNV-1a
    for (const ch of parts.map(v => (v == null ? '' : String(v))).join('\u0001')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  /** A sentence's first two words, as a reader hears its opening. */
  const opening = text => (typeof text === 'string' ? text.toLowerCase().split(/\s+/).slice(0, 2).join(' ').replace(/[,.:;—]+$/, '') : '');
  /** mulberry32: a small seeded generator, the same sequence for the same item. */
  function random(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Every fragment the item could say, before the queue: { identity, tier, candidates: [{category, key, text, order}] }. */
  function fragments(pack, item, facts, base, form) {
    const known = facts.known === true;
    // 1. One candidate per property, the first key of a step that has a sentence; a key is said once.
    let candidates = [];
    const said = new Set();
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
    // 2. Slot 1 says the material; slot 2 says the tier, the sigil and the set.
    const who = identity(pack, item, facts, base, form);
    const tier = tierOf(pack, item, facts, form, known);
    candidates = candidates.filter(c => !who.says(c.key) && categoryOf(pack.rules, c.key) !== 'tier');
    // 3. A Legendary's named power is its own sentence of base and power, once the piece is identified.
    if (known) {
      for (const id of [item.legendary, item.gilded]) {
        if (!isId(id) || !own(pack.legendaries, id)) continue;
        const text = fill(pack.legendaries[id], form, pack, { base: inlineName(pack, base, item) });
        if (!text) continue;
        const at = candidates.findIndex(c => c.key === `power.${id}`);
        const fragment = { kind: 'power', key: `legendary.${id}`, text, order: at >= 0 ? candidates[at].order : 0.5 };
        if (at >= 0) candidates.splice(at, 1, fragment); else candidates.unshift(fragment);
      }
    }
    // 4. Combinations: every part present and not yet combined; the parts give way to the one sentence.
    for (const combo of Array.isArray(pack.combos) ? pack.combos : []) {
      const parts = [];
      for (const pattern of combo.requires) {
        const part = candidates.find(c => !parts.includes(c) && takes(pattern, c.key));
        if (!part) break;
        parts.push(part);
      }
      if (parts.length !== combo.requires.length) continue;
      const text = fill(combo.text, form, pack, Object.assign({}, ...parts.map(p => p.values || {})));
      if (text == null) continue;
      candidates = candidates.filter(c => !parts.includes(c));
      candidates.push({ kind: combo.key.split('.')[1], key: combo.key, text, order: Math.min(...parts.map(p => p.order)) });
    }
    candidates.sort((a, b) => a.order - b.order);
    for (const c of candidates) c.category = categoryOf(pack.rules, c.key);
    return { identity: { category: 'identity', key: who.key, text: who.text }, tier: tier && { category: 'tier', ...tier }, candidates };
  }

  /** The hint's key: the piece's state first, from the most pressing; else its base item's own (hints.json). */
  function hintKey(pack, item, facts) {
    const known = facts.known === true;
    if (item.questItem === true) return 'hint.quest';
    if (!known && hasHidden(item)) return 'hint.unidentified';
    if (known && item.cursed && typeof item.cursed === 'object') {
      return item.cursed.type === DAMNED.type && item.cursed.param === DAMNED.param ? 'hint.damned' : 'hint.cursed';
    }
    const share = conditionOf(item);
    if (GEAR.has(item.group) && wearable(item) && share != null && share < 0.4) return 'hint.repair';
    if (item.artifact === true) return 'hint.artifact';
    if (item.rarity === 'aetheric' || isId(item.aetheric)) return 'hint.aetheric';
    if (item.rarity === 'legendary' || isId(item.legendary) || isId(item.gilded) || item.rarity === 'gilded') {
      return item.exalted === true ? 'hint.exalted' : 'hint.legendary';
    }
    const sigil = item.sigil && typeof item.sigil === 'object' ? item.sigil : null;
    if (sigil && isId(sigil.set)) return 'hint.set';
    if (sigil && Number.isFinite(sigil.power) && sigil.power > 0) return 'hint.sigil';
    const worn = EQUIPPABLE.has(item.group);
    if (worn && (isInt(item.quality) || plain(item.maker) || typeof item.provenance === 'string')) return 'hint.crafted';
    if (item.rarity === 'rare') return 'hint.rare';
    if (item.rarity === 'magic') return 'hint.magic';
    if (worn && (item.magic === true || (Array.isArray(item.enchantments) && item.enchantments.length > 0))) return 'hint.enchanted';
    if (isInt(item.foodStage) && item.foodStage >= 3) return 'hint.food.spoiled';
    if (holdsSouls(item) && item.artifact !== true && isInt(item.trappedSoulType) && item.trappedSoulType >= 0) return 'hint.soul.filled';
    return templateHint(pack, item) ?? 'hint.sell';
  }
  /** A value of a template-keyed map: a group-specific key first ("Deeds:0"), then the template index. */
  function byTemplate(map, item) {
    if (!map || !isInt(item.templateIndex)) return null;
    const special = typeof item.group === 'string' ? `${item.group}:${item.templateIndex}` : null;
    if (special && own(map, special)) return map[special];
    return own(map, String(item.templateIndex)) ? map[String(item.templateIndex)] : null;
  }
  const templateHint = (pack, item) => byTemplate(pack.hints?.templates, item);
  /**
   * The player hint: one sentence of what to do with the piece, and for what a writ pays silver for (said with the base
   * item's own hint, never with a state's advice), a second - the guild's own words when the character is in a guild.
   */
  function hintOf(pack, item, facts, form) {
    const key = hintKey(pack, item, facts);
    const text = sentence(pack, key, form) ?? sentence(pack, 'hint.sell', form);
    if (text == null) return [];
    const out = [{ category: 'hint', key: own(pack.properties, key) ? key : 'hint.sell', text }];
    const kind = key === templateHint(pack, item) ? byTemplate(pack.hints?.silver, item) : null;
    if (typeof kind === 'string') {
      const silver = `hint.silver.${kind}`, guild = `${silver}.guild`;
      const pick = facts.guild === true && own(pack.properties, guild) ? guild : silver;
      const said = sentence(pack, pick, form);
      if (said != null) out.push({ category: 'hint', key: pick, text: said });
    }
    return out;
  }

  /**
   * The description of one item: [{ slot, category, key, text }] in the universal queue's order (rules.json):
   *  1 base item + armour type + metal / base item + metal / base item;  2 tier + sigil + set (and its shorter forms);
   *  3, 4 one random fragment each of named power, technique, lines (2), contents (2), material, sigil growth;
   *  5 one random of technique, craft, sockets, hidden magic or curse;  6 wear, on what is worn;  7 stolen;
   *  8 the player hint (category 'hint': its own paragraph, always last; a second sentence for what writs pay silver for).
   * The stolen mark (category 'standing') stands on its own line under the description, in red; the hint in white.
   * facts: { known (identified, as the game decides), material ('steel', 'leather', 'chain' for an unknown metal,
   *          'fur', 'cloth' - only when the game shows it), armorType ('leather' | 'chain' | 'plate', the card's Type
   *          row), construction ('mail' | 'brigandine'), perfect, sigilXp, guild (the character is in a guild) }
   * options: { seed (another stable draw), max (stop the description after so many fragments; the hint is still said),
   *            all (every candidate, no queue) }
   * A template the tables do not know gets no description: its grammatical form is unknown.
   */
  function describe(pack, item, facts = {}, options = {}) {
    if (!pack || !item || typeof item !== 'object' || Array.isArray(item)) return [];
    const base = baseOf(pack, item);
    if (!base) return [];
    facts = facts && typeof facts === 'object' ? facts : {};
    const form = pack.forms.includes(base.form) ? base.form : pack.defaultForm;
    const { identity: who, tier, candidates } = fragments(pack, item, facts, base, form);
    const clean = f => ({ slot: f.slot ?? null, category: f.category, key: f.key, text: f.text });
    const hint = hintOf(pack, item, facts, form);
    if (options.all === true) return [who, ...(tier ? [tier] : []), ...candidates, ...hint].map(clean);

    /** A sentence that opens as the one before it takes its opening's synonym (the locale's `openings`). */
    const varied = (text, before) => {
      if (!before || opening(text) !== opening(before)) return text;
      for (const [from, to] of Object.entries(pack.openings ?? {})) if (text.startsWith(from + ' ') || text.startsWith(from + ',')) return to + text.slice(from.length);
      return text;
    };
    const rng = random(options.seed == null ? seedOf(item) : typeof options.seed === 'number' ? options.seed >>> 0 : seedOf({ uid: String(options.seed) }));
    const used = new Set(), taken = new Map(), texts = new Set(), out = [];
    const room = (category, max) => (taken.get(category) || 0) < max;
    const left = category => candidates.filter(c => c.category === category && !used.has(c) && !texts.has(c.text));
    const keep = (slot, fragment) => {
      used.add(fragment); texts.add(fragment.text);
      taken.set(fragment.category, (taken.get(fragment.category) || 0) + 1);
      out.push({ ...fragment, slot, text: varied(fragment.text, out.at(-1)?.text) });
    };
    for (const step of pack.rules?.queue ?? []) {
      if (step.take === 'hint') { for (const h of hint) out.push({ ...h, slot: step.slot }); continue; }
      if (Number.isInteger(options.max) && out.length >= options.max) continue;
      if (step.take === 'identity') { keep(step.slot, who); continue; }
      if (step.take === 'tier') { if (tier) keep(step.slot, tier); continue; }
      if (step.equippable && !wearable(item)) continue;
      const open = step.from.filter(f => room(f.category, f.max) && left(f.category).length);
      if (!open.length) continue;
      if (step.take === 'first') { keep(step.slot, left(open[0].category)[0]); continue; }
      // Random: a category first, then a fragment in it - a long list of lines does not crowd out the rest. Two
      // sentences in a row do not open alike («Вы чувствуете… Вы чувствуете…») while another fragment can stand there.
      const last = opening(out.at(-1)?.text);
      const fresh = category => left(category).filter(f => opening(f.text) !== last);
      const choices = open.filter(f => fresh(f.category).length);
      const category = (choices.length ? choices : open)[Math.floor(rng() * (choices.length || open.length))].category;
      const pool = fresh(category).length ? fresh(category) : left(category);
      keep(step.slot, pool[Math.floor(rng() * pool.length)]);
    }
    return out.map(clean);
  }

  /** Every property key a description could ask for, by kind - the tables' coverage checks read this. */
  function keysFor(item, facts = {}) {
    return plan(item, facts).flatMap(step => (Array.isArray(step.key) ? step.key : [step.key]));
  }

  /** The description as the card shows it: the sentences as one paragraph; the stolen mark on a line of its own right
   *  under it (the card sets it in red); then the hint after one blank line (in white). */
  function paragraphs(fragments) {
    const said = list => list.map(f => f.text).join(' ');
    const body = said(fragments.filter(f => f.category !== 'hint' && f.category !== 'standing'));
    const stolen = said(fragments.filter(f => f.category === 'standing')), hint = said(fragments.filter(f => f.category === 'hint'));
    return [[body, stolen].filter(Boolean).join('\n'), hint].filter(Boolean).join('\n\n');
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
      /** The same sentences as text: one paragraph, the stolen mark on its own line, a blank line, the hint. */
      text: (item, facts, options) => paragraphs(counted(item, facts, options)),
      has(key) { return !!pack && own(pack.properties, key); },
      stats: () => ({ ...counters, bases: pack ? Object.keys(pack.bases).length : 0, properties: pack ? Object.keys(pack.properties).length : 0 }),
    });
  }

  return { KINDS, SIGIL_STAGE_XP, baseOf, plan, describe, keysFor, sentence, variantOf, categoryOf, seedOf, hintKey, paragraphs, install };
});
