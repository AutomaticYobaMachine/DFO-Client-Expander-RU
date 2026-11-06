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

  /** A property's sentence in the base's form: the form's own text, else the locale's default form's. */
  function sentence(pack, key, form, values) {
    const row = own(pack.properties, key) ? pack.properties[key] : null;
    if (!row) return null;
    const text = row[form] ?? row[pack.defaultForm];
    if (typeof text !== 'string') return null;
    let missing = false;
    const filled = text.replace(/\{([a-z]+)\}/g, (all, name) => {
      const value = values && own(values, name) ? values[name] : null;
      if (value == null) { missing = true; return all; }
      return String(value);
    });
    return missing ? null : filled;
  }

  /**
   * The description of one item: [{ kind, key, text }] in saying order, at most one sentence per key.
   * facts: { known (identified, as the game decides), material ('steel', 'leather', 'chain' for an unknown metal,
   *          'fur', 'cloth' - only when the game shows it), construction ('mail' | 'brigandine'), perfect, sigilXp }
   * options: { max (sentences), kinds (only these), skip (not these) }
   * A template the tables do not know gets no description: its grammatical form is unknown.
   */
  function describe(pack, item, facts = {}, options = {}) {
    if (!pack || !item || typeof item !== 'object' || Array.isArray(item)) return [];
    const base = baseOf(pack, item);
    if (!base) return [];
    const form = pack.forms.includes(base.form) ? base.form : pack.defaultForm;
    const only = Array.isArray(options.kinds) ? new Set(options.kinds) : null;
    const skip = new Set(Array.isArray(options.skip) ? options.skip : []);
    const max = Number.isInteger(options.max) && options.max >= 0 ? options.max : Infinity;
    const wanted = kind => (!only || only.has(kind)) && !skip.has(kind);
    const out = [], said = new Set(), texts = new Set();
    if (wanted('base')) { out.push({ kind: 'base', key: 'base', text: base.text }); texts.add(base.text); }
    const steps = plan(item, facts && typeof facts === 'object' ? facts : {});
    for (const kind of KINDS) {
      if (kind === 'base' || !wanted(kind)) continue;
      for (const step of steps) {
        if (step.kind !== kind || out.length >= max) continue;
        for (const key of Array.isArray(step.key) ? step.key : [step.key]) {
          if (said.has(key)) break;
          const text = sentence(pack, key, form, step.values);
          if (text == null) continue;
          said.add(key);
          // Two keys may share one sentence (a skill line and a skill enchantment): say it once.
          if (!texts.has(text)) { texts.add(text); out.push({ kind, key, text }); }
          break;
        }
      }
    }
    return out.slice(0, max);
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

  return { KINDS, SIGIL_STAGE_XP, baseOf, plan, describe, keysFor, sentence, install };
});
