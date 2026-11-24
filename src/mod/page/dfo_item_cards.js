(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) api.install(root);
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const DATA_KEYS = ['template', 'value', 'variantWord', 'material', 'materialLabel', 'saysMaterial', 'isAmmo', 'isHandWraps', 'sale', 'isGold'];
  const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const money = value => finite(value) && value <= Number.MAX_SAFE_INTEGER;
  const nearestTen = value => money(value) && money(Math.round(value / 10) * 10) ? Math.round(value / 10) * 10 : null;
  // The mod's own words, in the install's language (page/dfo_ui_text.js; English without the translation).
  const T = (key, params) => (globalThis.__dfoUi ? globalThis.__dfoUi.t(key, params) : key);
  const VARIANTS = new Set(['Fur', 'Mail', 'Brigandine']);
  const variantTerm = word => (VARIANTS.has(word) ? T('cards.variant.' + word) : word);
  // Use canonical metal names: standalone words may be untranslated or confused with language skills by RU.
  const METALS = new Set(['Iron', 'Steel', 'Silver', 'Elven', 'Dwarven', 'Mithril', 'Adamantium', 'Orcish', 'Ebony', 'Daedric']);
  const materialTerm = name => (METALS.has(name) ? T('cards.metal.' + name) : null);
  const materialPalette = Object.freeze({
    Iron: { color: '#747980' }, Steel: { color: '#c6cbd1' }, Silver: { color: '#ffffff' }, Elven: { color: '#95cfff' },
    Dwarven: { color: '#dfb84f' }, Mithril: { color: '#40bfff' }, Adamantium: { color: '#cbb3e8' }, Orcish: { color: '#61c87e' },
    Ebony: { color: '#101116', stroke: '.4px #f4f1e8', shadow: '0 0 2px #f4f1e8' },
    Daedric: { color: '#130e10', stroke: '.4px #f05a55', shadow: '0 0 3px #dc312b' },
  });
  function effectParts(text, group = 'properties', labels = []) {
    const range = /(?:\s*\[[^\]]*\])+\s*$/.exec(text), main = range ? text.slice(0, range.index) : text, parts = [];
    const colon = group === 'properties' || group === 'power' ? main.indexOf(':') : -1;
    const prefix = colon < 0 && (group === 'properties' || group === 'power') ? labels.find(label => main.startsWith(label) && /^\s/.test(main.slice(label.length))) : null;
    const at = colon >= 0 ? colon + 1 : prefix ? prefix.length : 0;
    if (at) { const split = at + (main.slice(at).match(/^\s*/)?.[0].length || 0); parts.push({ kind: 'label', text: main.slice(0, split) }, { kind: 'value', text: main.slice(split) }); }
    else parts.push({ kind: 'value', text: main });
    if (range) parts.push({ kind: 'range', text: range[0] }); return parts;
  }
  function effectGroup(text) {
    const words = [
      ['strike', 'cards.group.strike', /^(?:(?:Cast )?When Strikes|При ударе|При попадании)\s*:\s*(.+)$/i],
      ['use', 'cards.group.use', /^(?:(?:Cast )?When Used|При использовании)\s*:\s*(.+)$/i],
      ['held', 'cards.group.held', /^(?:(?:Cast )?When Held|При ношении|При экипировке)\s*:\s*(.+)$/i],
    ];
    for (const [key, label, pattern] of words) { const m = pattern.exec(text); if (m) return { key, label: T(label), text: m[1] }; }
    return /^[+\-−]\d/.test(text) ? { key: 'bonuses', label: T('cards.group.bonuses'), text }
      : { key: 'properties', label: T('cards.group.properties'), text };
  }

  // Where a piece is worn, and the skill a weapon's blows train - the game's own answers (item-cards-transform.cjs:
  // the empty equip table the inventory's Wear test asks, the hand law, weaponSkillUsed), told in the pack's words.
  // A slot the inventory would not offer Wear for (ammunition, food, a wand) gets no row.
  const HAND_WORD = { Either: 'EitherHand', Both: 'BothHands', RightOnly: 'RightHand', LeftOnly: 'LeftHand' };
  const has = key => typeof globalThis.__dfoUi?.has === 'function' && globalThis.__dfoUi.has(key);
  const spaced = name => name.replace(/([a-z])([A-Z])/g, '$1 $2');
  function wornIn(item, ammo, native) {
    const out = { slot: null, skill: null };
    if (ammo || typeof native.slotName !== 'function') return out;
    let name = null;
    try { name = native.slotName(item); } catch { return out; }
    if (typeof name !== 'string' || name === 'None') return out;
    let word = name.replace(/\d+$/, '');
    const hand = word === 'RightHand' || word === 'LeftHand';
    if (hand && typeof native.handsName === 'function') { try { word = HAND_WORD[native.handsName(item)] || word; } catch { } }
    if (has(`cards.slot.${word}`)) out.slot = T(`cards.slot.${word}`);
    if (hand && item.group === 'Weapons' && typeof native.weaponSkill === 'function') {
      let skill = null;
      try { skill = native.weaponSkill(item.templateIndex); } catch { }
      if (typeof skill === 'string' && skill) out.skill = has(`cards.skill.${skill}`) ? T(`cards.skill.${skill}`) : spaced(skill);
    }
    return out;
  }

  /** Pure presentation data. Never mint, identify, repair or write to the item. */
  function derive(item, line, native, context = {}, opts = null) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const light = opts?.light === true;
    const known = typeof context.known === 'function' ? context.known() === true : context.known === true;
    const rawCount = item.stackCount == null ? 1 : item.stackCount;
    const count = Number.isSafeInteger(rawCount) && rawCount > 0 ? rawCount : null;
    const gear = item.group === 'Armor' || item.group === 'Weapons';
    const ammo = gear && native.isAmmo(item);
    let material = null, materialKey = null, construction = null;
    // What the description may say (dfo_item_text.js facts): the same visibility the card's own rows obey.
    const facts = { known };
    if (gear && !ammo) {
      if (native.isHandWraps(item)) { material = T('cards.material.cloth'); facts.material = 'cloth'; }
      else if (!Number.isInteger(item.material) || item.material < 0) material = T('cards.material.noData');
      else if (native.saysMaterial(item)) {
        const variant = String(native.variantWord(item) || '').trim();
        if (variant) construction = variantTerm(variant);
        if (variant === 'Mail' || variant === 'Brigandine') facts.construction = variant.toLowerCase();
        if (variant === 'Fur') { material = T('cards.material.fur'); facts.material = 'fur'; }
        else {
          const name = native.material(item);
          if (typeof name === 'string' && /^(?:Iron|Steel|Silver|Elven|Dwarven|Mithril|Adamantium|Ebony|Orcish|Daedric|Leather|Chain)$/.test(name)) facts.material = name.toLowerCase();
          material = name === 'Chain' ? T('cards.material.unknownMetal') : name ? materialTerm(name) || native.materialLabel(name) : T('cards.material.noData');
          if (Object.hasOwn(materialPalette, name)) materialKey = name;
        }
      } else material = line.material || T('cards.material.unspecified');
      // The native Type row (itemInfo.js itemArmorTypeLine): Leather, Chain or Plate, shown whatever the metal.
      const type = typeof line.armorType === 'string' ? line.armorType.trim().toLowerCase() : '';
      if (item.group === 'Armor' && (type === 'leather' || type === 'chain' || type === 'plate')) facts.armorType = type;
    }
    let unitValue = null, source = null;
    if (count != null) {
      const credit = typeof context.credit === 'function' ? context.credit() : null;
      // letterWorthGold is a native display string, not a number: its non-null result identifies credit.
      if (credit != null) { unitValue = money(item.value) ? Math.trunc(item.value) : null; source = 'credit'; }
      else if (native.isGold(item)) { unitValue = 1; source = 'currency'; }
      else if (money(item.value)) { unitValue = item.value; source = 'stored'; }
      else if (native.template(item.templateIndex)) {
        const value = native.value(item);
        if (money(value)) { unitValue = value; source = 'base'; }
      }
    }
    const product = unitValue == null || count == null ? null : unitValue * count;
    const total = finite(product) && product <= Number.MAX_SAFE_INTEGER ? product : null;
    let estimate = null;
    if (total != null) {
      if (source === 'credit' || source === 'currency') estimate = total;
      else {
        // At quality 10 and regional index 1000, native calculateCost is exactly
        // twice the item's sale basis. Keep its item-specific corrections and
        // counter-purchase caps; replace only shop/player haggling with 40%.
        const sale = native.sale(item);
        if (money(sale?.cost)) {
          estimate = sale.cost * .2;
          if (sale.resale) {
            if (!money(sale.resale.cost) || !money(sale.resale.paid)) estimate = null;
            else estimate = Math.min(estimate, Math.max(0, sale.cost - sale.resale.cost) * .2 + sale.resale.paid);
          }
        }
      }
    }
    const approximate = source !== 'credit' && source !== 'currency';
    const price = approximate ? nearestTen(estimate) : estimate;
    // Wallets/containers have a native contents weight; do not price their contents as the empty object.
    const ordinaryWeight = ['Weapons', 'Armor', 'MensClothing', 'WomensClothing', 'Jewellery'].includes(item.group);
    const perKg = ordinaryWeight && money(estimate) && finite(line.weight) && line.weight > 0
      ? estimate / line.weight : null;
    const power = !light && known && typeof native.power === 'function' ? native.power(item) : null;
    const { slot, skill } = light ? { slot: null, skill: null } : wornIn(item, ammo, native);
    return {
      known, facts, count, material, materialKey, construction, slot, skill, unitValue, total, source, power, price, approximate, estimate,
      perKg: finite(perKg) && perKg <= Number.MAX_SAFE_INTEGER ? perKg : null
    };
  }

  const CSS = `
:root body .card.dfo-item-card, :root body .card.dfo-item-card.dfo-item-card, :root body .pack-shell .packtip > .card.dfo-item-card.dfo-item-card, :root body .inv-tip > .card.dfo-item-card.dfo-item-card, :root body .inv-info > .card.dfo-item-card.dfo-item-card, :root body .pbind > .card.dfo-item-card.dfo-item-card { --dfo-ornament:var(--rar,#827a68); --dfo-corner:polygon(0 0,100% 0,100% 15%,15% 15%,15% 100%,0 100%); padding:0!important; margin:0; position:relative; display:block!important; overflow:visible!important; max-height:none!important; box-sizing:border-box; border-radius:0!important; border-image:none!important; outline:none!important; filter:none!important; background:var(--ink,#0e1013)!important; color:var(--bone,#e9e4d9)!important; border:3px solid var(--dfo-ornament)!important; box-shadow:inset 0 0 0 1px #000,0 5px 18px #0008!important; font:calc(14px)/1.28 'DFO Gabin',Georgia,serif; font-synthesis:none; }
:root body .card.dfo-item-card>.card-body { display:block; flex:none; min-height:0; padding:0; overflow:visible!important; max-height:none!important; }
:root body .inv-tip.dfo-item-host { width:max-content!important; max-width:none!important; max-height:none!important; overflow:visible!important; pointer-events:none; contain:layout style; }
:root body .pack-shell .packdetail.dfo-item-host { width:max-content!important; height:auto!important; max-width:none!important; max-height:none!important; overflow:visible!important; bottom:auto!important; right:auto!important; transition:none!important; contain:layout style; }
:root .dfo-item-main { display:grid; grid-template-columns:260px minmax(0,1fr); gap:14px; padding:12px; box-sizing:border-box; }
:root .dfo-item-left { min-width:0; border-right:1px solid #756346; box-shadow:1px 0 #000; padding-right:12px; }
:root .dfo-item-head { display:grid; grid-template-columns:64px minmax(0,1fr); gap:10px; align-items:center; margin-bottom:12px; }
:root .dfo-item-head>.dfo-item-material { grid-column:1/-1; display:flex; flex-wrap:wrap; justify-content:space-between; gap:3px 8px; font-size:calc(12px); line-height:1.3; padding-top:3px; color:#b7a071; }
:root .dfo-item-material .dfo-item-metal { font:inherit; font-weight:400; color:var(--dfo-metal-color,#e9e4d9)!important; -webkit-text-stroke:var(--dfo-metal-stroke,0 transparent); text-shadow:var(--dfo-metal-shadow,none); }
:root .dfo-item-card .dfo-item-head>.bigicon { width:64px; height:82px; margin:0!important; display:flex; align-items:center; justify-content:center; }
:root .dfo-item-card .dfo-item-head>.bigicon img,:root .dfo-item-card .dfo-item-head>.bigicon canvas { width:auto!important; height:auto!important; max-width:60px!important; max-height:78px!important; object-fit:contain; }
:root body .card.dfo-item-card .dfo-item-title h3, :root body .card.dfo-item-card.dfo-item-card .dfo-item-title h3, :root body .pack-shell .packtip > .card.dfo-item-card.dfo-item-card .dfo-item-title h3, :root body .inv-tip > .card.dfo-item-card.dfo-item-card .dfo-item-title h3, :root body .inv-info > .card.dfo-item-card.dfo-item-card .dfo-item-title h3 { font-family:'DFO Greengoth',Georgia,serif!important; font-weight:400; font-size:calc(22px)!important; line-height:1.15; text-align:left; text-transform:none; letter-spacing:normal; text-shadow:none!important; margin:0!important; overflow-wrap:anywhere; color:var(--rar,var(--bone,#e9e4d9))!important; }
:root .dfo-item-tier { display:flex; align-items:center; gap:5px; font-size:calc(11px); line-height:1.25; margin:0 0 4px; color:var(--rar,var(--brass,#d5b26e)); }
:root .dfo-item-tier::before { content:var(--rar-pips,''); margin-right:0; font-size:calc(11px); line-height:1; letter-spacing:1.5px; flex:none; }
:root .dfo-item-card[data-rarity=artifact] .dfo-item-tier::before { font-size:calc(12px); letter-spacing:2px; }
:root .dfo-item-card .dfo-item-stats { display:block!important; margin:0; padding:0; }
:root .dfo-item-card .dfo-item-stats>.pair { display:flex!important; justify-content:space-between; gap:8px; margin:0 0 6px; font-size:calc(13px)!important; line-height:1.25!important; }
:root .dfo-item-card .dfo-item-stats>.pair>dt { font:inherit!important; letter-spacing:normal!important; text-transform:none!important; text-align:left!important; color:var(--dim,#a89f88)!important; }
:root .dfo-item-card .dfo-item-stats>.pair>dd { font:inherit!important; margin:0; text-align:right; min-width:0; overflow-wrap:anywhere; color:var(--bone,#e9e4d9)!important; }
:root .dfo-item-primary { display:flex; align-items:baseline; justify-content:space-between; gap:8px; border-bottom:1px solid #454534; padding:0 0 9px; margin:0 0 10px; }
:root .dfo-item-primary>span { font-size:calc(11px); color:var(--dim,#a89f88); }
:root .dfo-item-primary>strong { font-family:'DFO Flexi',monospace; font-size:calc(23px); line-height:1.1; font-weight:400; min-width:0; overflow-wrap:anywhere; color:var(--bone,#e9e4d9); }
:root .dfo-item-card .dfo-item-statuses>p { text-align:left!important; font-size:calc(11px)!important; line-height:1.35!important; margin:7px 0 0; overflow-wrap:anywhere; }
:root :is(.dfo-item-effects,.dfo-item-overflow) { display:flex; flex-direction:column; gap:5px; min-width:0; }
:root .dfo-item-overflow:empty { display:none; }
:root .dfo-item-overflow:not(:empty) { border-top:1px solid #454534; margin-top:10px; padding-top:8px; }
:root .dfo-item-card .dfo-item-lines { display:block; padding:0; margin:0; list-style:none; font-size:calc(14px)!important; line-height:1.25!important; color:#edd5a4!important; text-align:left; }
:root .dfo-item-card .dfo-item-lines>li { display:block; font:inherit!important; color:inherit!important; letter-spacing:normal!important; text-transform:none!important; margin:0 0 3px; white-space:normal; overflow-wrap:anywhere; }
:root .dfo-item-card .dfo-item-lines>li:first-child { font-size:calc(12px); letter-spacing:normal; text-transform:none; color:inherit; }
:root .dfo-item-card .dfo-item-lines>li:first-child::before { content:none!important; }
:root .dfo-item-card .dfo-effect-label { color:#edd5a4!important; }
:root .dfo-item-card .dfo-effect-value { color:#f3f2ed!important; }
:root .dfo-item-card .dfo-effect-range { color:#696b72!important; font-size:.86em; }
:root .dfo-item-card .dfo-item-meta { list-style:none; padding:8px 0 0; margin:8px 0 0; border-top:1px solid #454534; font-size:calc(11px)!important; line-height:1.4!important; overflow-wrap:anywhere; }
:root .dfo-item-card .dfo-item-meta>li { margin:0 0 4px; }
:root .dfo-item-socket-lines { font-size:calc(11px); line-height:1.35; margin:0; }
:root .dfo-item-socket-lines>div { margin-bottom:4px; overflow-wrap:anywhere; }
:root :is(.dfo-item-effects,.dfo-item-overflow)>.cmp { margin:0; }
:root .dfo-item-footer { display:flex; justify-content:flex-end; align-items:flex-end; gap:16px; border-top:1px solid #756346; padding:9px 12px 11px; text-align:right; background:var(--ink,#0e1013); }
:root .dfo-item-card .dfo-item-text { flex:1 1 auto; min-width:0; margin:0; text-align:left; font:calc(12px)/1.38 'DFO Flow','DFO Gabin',Georgia,serif!important; color:#c4c6ca!important; letter-spacing:normal!important; text-transform:none!important; }
:root .dfo-item-card .dfo-item-text>p { margin:0; padding:0; font:inherit!important; color:inherit!important; white-space:normal; overflow-wrap:break-word; text-align:left!important; }
:root .dfo-item-card .dfo-item-text>.dfo-item-text-stolen { color:#e2574c!important; }
:root .dfo-item-card .dfo-item-text>.dfo-item-text-hint { color:#ffffff!important; margin-top:1.38em; }
:root .dfo-item-card .dfo-item-footer.has-text { justify-content:space-between; }
:root .dfo-item-price { display:flex; align-items:center; gap:8px; color:#f5d451!important; }
:root .dfo-item-price-value { font-family:'DFO Flexi',monospace; font-size:calc(21px); font-weight:400; line-height:1.15; color:#f5d451!important; white-space:nowrap; }
:root .dfo-item-coin { width:20px; height:20px; flex:none; color:#f5d451; }
:root .dfo-item-card::before { content:''; position:absolute; inset:3px; border:1px solid color-mix(in srgb,var(--dfo-ornament) 32%,transparent); pointer-events:none; }
:root .dfo-item-corners { position:absolute; inset:2px; pointer-events:none; }
:root .dfo-item-corners>i { width:18px; height:18px; position:absolute; background:var(--dfo-ornament); clip-path:var(--dfo-corner); opacity:.95; }
:root .dfo-item-corners>i:nth-child(1) { left:0; top:0; }
:root .dfo-item-corners>i:nth-child(2) { right:0; top:0; transform:rotate(90deg); }
:root .dfo-item-corners>i:nth-child(3) { right:0; bottom:0; transform:rotate(180deg); }
:root .dfo-item-corners>i:nth-child(4) { left:0; bottom:0; transform:rotate(270deg); }
:root body .card.dfo-item-card:not([data-rarity]),:root body .card.dfo-item-card[data-rarity=common],:root body .card.dfo-item-card.dfo-item-card:not([data-rarity]),:root body .card.dfo-item-card.dfo-item-card[data-rarity=common] { border-width:2px!important; }
:root .dfo-item-card[data-rarity=magic] { --dfo-corner:polygon(0 0,100% 0,65% 20%,35% 20%,35% 35%,20% 35%,20% 65%,0 100%); }
:root body .card.dfo-item-card[data-rarity=rare],:root body .card.dfo-item-card.dfo-item-card[data-rarity=rare] { border-style:double!important; --dfo-corner:polygon(0 0,100% 0,100% 18%,46% 18%,46% 46%,18% 46%,18% 100%,0 100%); }
:root .dfo-item-card[data-rarity=legendary] { --dfo-corner:polygon(0 0,100% 0,78% 16%,45% 16%,60% 33%,33% 60%,16% 45%,16% 78%,0 100%); }
:root body .card.dfo-item-card[data-rarity=aetheric],:root body .card.dfo-item-card.dfo-item-card[data-rarity=aetheric] { border-style:groove!important; --dfo-corner:polygon(0 0,100% 0,72% 16%,40% 16%,40% 40%,16% 40%,16% 72%,0 100%,0 60%,10% 50%,0 40%); }
:root body .card.dfo-item-card[data-rarity=gilded],:root body .card.dfo-item-card.dfo-item-card[data-rarity=gilded] { border-width:4px!important; border-style:double!important; --dfo-corner:polygon(0 0,100% 0,82% 18%,48% 18%,60% 30%,30% 60%,18% 48%,18% 82%,0 100%,0 65%,12% 50%,0 35%); }
:root .dfo-item-group { min-width:0; margin:0; }
:root .dfo-item-group+.dfo-item-group { border-top:1px solid #393b35; padding-top:7px; margin-top:2px; }
:root .dfo-item-group>h4,:root .dfo-item-stat-heading { margin:0 0 6px; font:calc(12px)/1.2 'DFO Gabin',serif; letter-spacing:.07em; text-transform:uppercase; color:#b7a071; }
:root .dfo-item-group[data-group=strike] .dfo-item-lines>li::before,:root .dfo-item-group[data-group=held] .dfo-item-lines>li::before,:root .dfo-item-group[data-group=use] .dfo-item-lines>li::before { content:'◆'!important; display:inline; margin-right:6px; color:var(--dfo-ornament); font-size:calc(8px); }
:root .dfo-item-power-name { display:block; font:calc(20px)/1.12 'DFO Wolga',Georgia,serif; color:#f3f2ed; margin:2px 0 5px; }
:root .dfo-item-power-detail { display:block; color:#d7c9ad; }
:root .dfo-item-group[data-group=power] { border:1px solid #715336; padding:7px 8px; background:linear-gradient(115deg,#382a1738,transparent); }
:root .dfo-item-card .dfo-item-stats>.pair[data-divider] { border-top:1px solid #393b35; padding-top:8px; margin-top:8px; }
:root :is(.dfo-item-effects,.dfo-item-overflow)>.cmp { border-left:2px solid #637b65; background:#18201966; padding:6px 8px; }
:root .dfo-item-card :is(.sigilbox,.setbox,.techbox,.cmp) { font-family:'DFO Gabin',serif; }
:root .dfo-item-card :is(.dfo-item-stats,.dfo-item-lines,.cmp-head,.cmp-line,.sigil-effect,.sigil-progress,.set-tier-effect) { font-family:'DFO Gabin',serif!important; }
:root .dfo-item-card .sigilbox .sigil-stage { font-family:'DFO Ckazka',serif!important; font-size:calc(17px)!important; letter-spacing:.02em; }
:root .dfo-item-card .setbox .set-name { font-family:'DFO Ritalin',serif!important; font-size:calc(18px)!important; letter-spacing:.02em; }
/* QUICK LOOT: the plaque's loot list in the card's dress (only an itemised plaque - never a name or a verb menu) */
:root body .wplaque.dfo-quick.has-list:not(.has-actions) { background-color:var(--ink,#0e1013)!important; background-image:linear-gradient(180deg,rgba(154,144,121,.08) 0%,transparent 64px)!important; color:var(--bone,#e9e4d9)!important; border:2px solid!important; border-color:#9a9079 #3a352a #25221b #7a7260!important; border-image:none!important; box-shadow:inset 0 0 0 1px #000,0 5px 18px #0008!important; text-shadow:none!important; }
:root body .wplaque.dfo-quick.has-list:not(.has-actions) .wplaque-title { font-family:'DFO Greengoth',Georgia,serif!important; font-size:calc(17px)!important; line-height:1.25; color:#f6e7b0!important; text-shadow:none!important; }
:root body .wplaque.dfo-quick.has-list:not(.has-actions) .wplaque-sub { font-family:'DFO Gabin',serif!important; color:#b7a071!important; }
:root body .wplaque.dfo-quick.has-list:not(.has-actions) .wplaque-list { border-top:1px solid #756346!important; }
:root body .wplaque.dfo-quick.has-list:not(.has-actions) .wplaque-row { font-family:'DFO Gabin',serif!important; color:var(--bone,#e9e4d9)!important; }
:root body .wplaque.dfo-quick.has-list:not(.has-actions) .wplaque-row.sel { background:rgba(183,160,113,.16)!important; box-shadow:inset 2px 0 0 #d5b26e!important; }
:root body .wplaque.dfo-quick.has-list:not(.has-actions) .wplaque-count { font-family:'DFO Flexi',monospace!important; color:#d5b26e!important; }
:root body .wplaque.dfo-quick.has-list:not(.has-actions) :is(.wplaque-empty,.wplaque-more) { color:#a89f88!important; }
/* ...and the lit row's card beside it: the left column, compact, and the price */
:root .dfo-quick-card { --dfo-quick-rar:#827a68; }
:root body .wplaque .wplaque-stats.dfo-quick-card { width:236px; padding:9px 11px 8px; background:var(--ink,#0e1013)!important; border:2px solid var(--dfo-quick-rar)!important; border-image:none!important; box-shadow:inset 0 0 0 1px #000,0 5px 18px #0008!important; color:var(--bone,#e9e4d9)!important; font:calc(12px)/1.3 'DFO Gabin',serif!important; text-shadow:none!important; -webkit-font-smoothing:auto; }
:root body .wplaque .wplaque-stats.dfo-quick-card[data-side="below"] { width:auto; border:0!important; border-top:1px solid #756346!important; box-shadow:none!important; background:none!important; padding:7px 0 0; }
:root .dfo-quick-card[data-rarity="magic"] { --dfo-quick-rar:#6f9ee8; }
:root .dfo-quick-card[data-rarity="rare"] { --dfo-quick-rar:#e4c34f; }
:root .dfo-quick-card[data-rarity="legendary"] { --dfo-quick-rar:#e07a2e; }
:root .dfo-quick-card[data-rarity="aetheric"] { --dfo-quick-rar:#bfe8ff; }
:root .dfo-quick-card[data-rarity="artifact"] { --dfo-quick-rar:#b57bee; }
:root .dfo-quick-card[data-rarity="gilded"] { --dfo-quick-rar:#ff3b4a; }
:root body .dfo-quick-card .dfo-quick-name { margin:0 0 5px; font:400 calc(16px)/1.15 'DFO Greengoth',Georgia,serif!important; color:var(--bone,#e9e4d9)!important; overflow-wrap:anywhere; }
:root body .dfo-quick-card[data-rarity]:not([data-rarity="common"]) .dfo-quick-name { color:var(--dfo-quick-rar)!important; }
:root body .dfo-quick-card>.dfo-item-material { display:flex; flex-wrap:wrap; justify-content:space-between; gap:2px 8px; margin:0 0 6px; font-size:calc(11px); line-height:1.3; color:#b7a071!important; }
:root body .dfo-quick-primary { display:flex; align-items:baseline; justify-content:space-between; gap:8px; margin:0 0 6px; padding:0 0 5px; border-bottom:1px solid #454534; }
:root body .dfo-quick-primary>span { font-size:calc(11px); color:var(--dim,#a89f88)!important; }
:root body .dfo-quick-primary>strong { font:400 calc(18px)/1.1 'DFO Flexi',monospace!important; color:var(--bone,#e9e4d9)!important; white-space:nowrap; }
:root body .dfo-quick-stats { display:block; margin:0; padding:0; }
:root body .dfo-quick-stats>.pair { display:flex; justify-content:space-between; gap:8px; margin:0 0 3px; }
:root body .dfo-quick-stats>.pair>dt { margin:0; font:inherit; color:var(--dim,#a89f88)!important; }
:root body .dfo-quick-stats>.pair>dd { margin:0; min-width:0; text-align:right; overflow-wrap:anywhere; color:var(--bone,#e9e4d9)!important; }
:root body .dfo-quick-note { margin:0 0 3px; color:#a49a80!important; }
:root body .dfo-quick-price { display:flex; justify-content:flex-end; align-items:center; gap:6px; margin:6px 0 0; padding:6px 0 0; border-top:1px solid #756346; color:#f5d451!important; }
:root body .dfo-quick-price>.dfo-item-price-value { font-size:calc(17px); color:#f5d451!important; }
:root body .dfo-quick-price>.dfo-item-coin { width:16px; height:16px; }
/* THE LOOT WINDOW'S ROWS (a chest's, a wagon's, the bag's, a body's): the card's ink and brass, the tier on the left edge,
   the name as the card's title, the sub-line's metal in its colour, the price with its coin. Borders, never margins:
   the list measures each row's own box (ui/virtualRows.js). */
:root :is(.loot-win,.pack-dock,.trade-win) .itemrow.dfo-item-row { --dfo-row-rar:#827a68; gap:10px; padding:7px 12px 7px 9px; background:var(--ink,#0e1013); border:0; border-left:3px solid var(--dfo-row-rar); border-bottom:1px solid #2c2820; box-shadow:inset 0 -1px 0 #000; font-family:'DFO Gabin',serif; text-shadow:none; }
:root :is(.loot-win,.pack-dock,.trade-win) .itemrow.dfo-item-row[data-rarity="magic"] { --dfo-row-rar:#6f9ee8; }
:root :is(.loot-win,.pack-dock,.trade-win) .itemrow.dfo-item-row[data-rarity="rare"] { --dfo-row-rar:#e4c34f; }
:root :is(.loot-win,.pack-dock,.trade-win) .itemrow.dfo-item-row[data-rarity="legendary"] { --dfo-row-rar:#e07a2e; }
:root :is(.loot-win,.pack-dock,.trade-win) .itemrow.dfo-item-row[data-rarity="aetheric"] { --dfo-row-rar:#bfe8ff; }
:root :is(.loot-win,.pack-dock,.trade-win) .itemrow.dfo-item-row[data-rarity="artifact"] { --dfo-row-rar:#b57bee; }
:root :is(.loot-win,.pack-dock,.trade-win) .itemrow.dfo-item-row[data-rarity="gilded"] { --dfo-row-rar:#ff3b4a; }
:root :is(.loot-win,.pack-dock,.trade-win) .itemrow.dfo-item-row:hover, :root :is(.loot-win,.pack-dock,.trade-win) .itemrow.dfo-item-row:focus-visible { background:#141920; }
:root :is(.loot-win,.pack-dock,.trade-win) .itemrow.dfo-item-row.on, :root :is(.loot-win,.pack-dock,.trade-win) .itemrow.dfo-item-row.picked { background:rgba(183,160,113,.15); box-shadow:inset 0 -1px 0 #000,inset 0 0 0 1px rgba(213,178,110,.55); }
:root :is(.loot-win,.pack-dock,.trade-win) .itemrow.dfo-item-row .tile { box-shadow:inset 0 0 0 1px #3a3428; background:#0a0c10; }
:root :is(.loot-win,.pack-dock,.trade-win) .itemrow.dfo-item-row .itemname { gap:3px; }
:root :is(.loot-win,.pack-dock,.trade-win) .itemrow.dfo-item-row .itemname > span:first-child { font-family:'DFO Greengoth',Georgia,serif; font-size:calc(15px); line-height:1.2; }
:root :is(.loot-win,.pack-dock,.trade-win) .itemrow.dfo-item-row .itemname > small.dfo-row-sub { display:flex; align-items:baseline; gap:0 7px; min-width:0; overflow:hidden; white-space:nowrap; font:calc(11px)/1.25 'DFO Gabin',serif; letter-spacing:.06em; text-transform:uppercase; color:#b7a071; }
:root .dfo-row-sub>*+*::before { content:'·'; margin-right:7px; color:#5f5643; }
:root .dfo-row-mat { display:inline-flex; gap:0 5px; flex:0 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; }
:root .dfo-row-mat>.dfo-item-metal { font:inherit; color:var(--dfo-metal-color,#e9e4d9); -webkit-text-stroke:var(--dfo-metal-stroke,0 transparent); text-shadow:var(--dfo-metal-shadow,none); }
:root .dfo-row-kg { flex:none; font-family:'DFO Flexi',monospace; letter-spacing:0; text-transform:none; color:#d8cfae; }
:root .dfo-row-extra { flex:none; color:#a89f88; }
:root :is(.loot-win,.pack-dock,.trade-win) .itemrow.dfo-item-row .itemwt.dfo-row-price { display:flex; align-items:center; gap:5px; flex:0 0 auto; color:#f5d451; font-size:inherit; }
:root .trade-shell[data-view="grid"] .trade-win .itemrow.dfo-item-row { padding:10px 8px 8px; gap:6px; border:1px solid #3a3428; border-top:3px solid var(--dfo-row-rar,#827a68); box-shadow:inset 0 0 0 1px rgba(0,0,0,.6); }
:root .trade-shell[data-view="grid"] .trade-win .itemrow.dfo-item-row .itemname { width:100%; align-items:center; text-align:center; }
:root .trade-shell[data-view="grid"] .trade-win .itemrow.dfo-item-row .itemname > span:first-child { width:100%; font-size:calc(13.5px); line-height:1.2; text-align:center; white-space:normal; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow-wrap:anywhere; }
:root .trade-shell[data-view="grid"] .trade-win .itemrow.dfo-item-row .itemname > small.dfo-row-sub { display:none !important; }
:root .trade-shell[data-view="grid"] .trade-win .itemrow.dfo-item-row .itemwt.dfo-row-price { display:inline-flex !important; justify-content:center; margin-top:auto; }
:root .dfo-row-price>.dfo-item-price-value { font-size:calc(15px); }
:root .dfo-row-price>.dfo-item-coin { width:14px; height:14px; }
`;

  function install(win) {
    if (win.__DFO_MOD_CFG__?.itemCards?.enabled === false || win.__dfoItemCards) return;
    const doc = win.document, native = {}, states = new WeakMap(), pending = new Set(), active = new Map();
    const fontRoot = new URL('.', doc.currentScript?.src || new URL('dfo-mod/dfo_item_cards.js', doc.baseURI || win.location.href)).href;
    const fontFaces = [['DFO Greengoth', 'title', 'ttf'], ['DFO Flexi', 'numbers', 'ttf'], ['DFO Gabin', 'text', 'ttf'], ['DFO Ckazka', 'sigil', 'ttf'], ['DFO Ritalin', 'set', 'ttf'], ['DFO Wolga', 'legendary', 'otf'], ['DFO Flow', 'description', 'otf']]
      .map(([family, file, ext]) => `@font-face{font-family:'${family}';src:url(${JSON.stringify(new URL('item-font-' + file + '.' + ext, fontRoot).href)}) format('${ext === 'otf' ? 'opentype' : 'truetype'}');font-style:normal;font-weight:400;font-display:swap;}`).join('\n');
    const counters = { dressed: 0, quick: 0, rows: 0, failures: 0, lastError: '', layouts: 0, balances: 0, balanceTrials: 0, placements: 0, observerCallbacks: 0 };
    let scheduled = false, effectLabelRef = null, effectLabelRu = null, effectLabelLen = -1, effectLabelHead = '', effectLabelTail = '', effectLabelNames = [];
    const node = (tag, cls, text) => {
      const value = doc.createElement(tag);
      if (cls) value.className = cls;
      if (text != null) value.textContent = String(text);
      return value;
    };
    // The RU runtime translates textContent synchronously, before the shared native builder returns.
    let saidProbe = null, saidRu = null;
    const saidCache = new Map();
    const said = text => {
      const s = String(text);
      const ruOn = win.__DFO_MOD_CFG__?.ru?.on === true || typeof win.__translate === 'function';
      if (ruOn !== saidRu) { saidRu = ruOn; saidCache.clear(); }
      const hit = saidCache.get(s);
      if (hit !== undefined) return hit;
      if (!saidProbe) saidProbe = doc.createElement('span');
      saidProbe.textContent = s;
      const out = saidProbe.textContent;
      if (saidCache.size > 512) saidCache.clear();
      saidCache.set(s, out);
      return out;
    };
    // The locale's own digits: «1 370» in Russian, "1,370" in English.
    const format = number => (win.__dfoUi ? win.__dfoUi.number(number, { maximumFractionDigits: 2 }) : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(number));
    const ready = () => DATA_KEYS.every(key => typeof native[key] === 'function');
    const addPair = (list, label, value) => {
      if (value == null || value === '') return;
      const pair = node('div', 'pair'); pair.append(node('dt', null, label), node('dd', null, value)); list.append(pair);
    };
    const ensureStyle = () => {
      if (doc.getElementById('dfo-item-cards-style')) return;
      const style = node('style'); style.id = 'dfo-item-cards-style'; style.textContent = (win.__dfoFonts ? '' : fontFaces) + CSS; (doc.head || doc.documentElement).append(style);
    };
    function price(state, data) {
      if (!data) return;
      const value = data.price == null ? '—' : (data.approximate ? '~' : '') + format(data.price);
      if (state.priceValue.textContent !== value) state.priceValue.textContent = value;
      state.priceBox.setAttribute('aria-label', data.price == null ? T('cards.price.unknown') : T(data.approximate ? 'cards.price.approximate' : 'cards.price.exact', { value: format(data.price), n: data.price }));
    }

    // The tier line's own words name a Perfect rare ("Perfect Rare", lootRarity.js tierLabel), in any locale.
    const isPerfect = tier => /\bPerfect Rare\b/.test(tier) || tier.includes(said('Perfect Rare'));
    /** The item's description (dfo_item_text.js) under the card, beside the price: its sentences, the stolen mark on
     *  a line of its own in red, then the player hint in white after a blank line. Null without the text runtime. */
    function description(item, data, perfect) {
      const api = win.__dfoItemText;
      if (!api || typeof api.describe !== 'function') return null;
      const facts = perfect && data.known ? { ...data.facts, perfect: true } : data.facts;
      const fragments = api.describe(item, facts);
      if (!Array.isArray(fragments) || !fragments.length) return null;
      const said = list => list.map(f => f.text).filter(t => typeof t === 'string' && t).join(' ');
      const parts = [['body', said(fragments.filter(f => f.category !== 'hint' && f.category !== 'standing'))],
      ['stolen', said(fragments.filter(f => f.category === 'standing'))], ['hint', said(fragments.filter(f => f.category === 'hint'))]];
      const box = node('div', 'dfo-item-text');
      for (const [kind, words] of parts) {
        if (!words) continue;
        // Already in the player's language: a text node, so the RU runtime does not translate it a second time.
        const paragraph = node('p', 'dfo-item-text-' + kind); paragraph.append(doc.createTextNode(words)); box.append(paragraph);
      }
      return box.children.length ? box : null;
    }

    function groupedPowers(list, data) {
      const groups = new Map(), raw = typeof data.power?.name === 'string' && data.power.name ? data.power.name : null;
      // The power's own line, whatever the translation made of it: its name - as the runtime words it, or as the game wrote
      // it when the line stayed untranslated - heads the line ("Name: brief") or follows the imprint's label ("…: Name (…").
      const names = raw ? [...new Set([said(raw), raw])].filter(Boolean).sort((a, b) => b.length - a.length) : [];
      const powerName = text => {
        for (const n of names) {
          if (text.startsWith(n + ':')) return { name: n, at: 0 };
          const at = text.indexOf(': ' + n + ' (');
          if (at >= 0) return { name: n, at: at + 2 };
        }
        return null;
      };
      const labels = native.effectLabels?.() || [], ruOn = win.__DFO_MOD_CFG__?.ru?.on === true;
      const len = labels.length, head = len ? labels[0] : '', tail = len ? labels[len - 1] : '';
      if (labels !== effectLabelRef || ruOn !== effectLabelRu || len !== effectLabelLen || head !== effectLabelHead || tail !== effectLabelTail) {
        effectLabelRef = labels; effectLabelRu = ruOn; effectLabelLen = len; effectLabelHead = head; effectLabelTail = tail;
        effectLabelNames = labels.map(label => said(label).trim().replace(/:$/, '')).filter(Boolean).sort((a, b) => b.length - a.length);
      }
      const colored = (into, text, group) => { for (const part of effectParts(text, group, effectLabelNames)) { const span = node('span', 'dfo-effect-' + part.kind); span.append(doc.createTextNode(part.text)); into.append(span); } };
      for (const row of [...list.children]) {
        const original = row.textContent, found = powerName(original);
        const kind = found ? { key: 'power', label: T('cards.group.power'), text: original } : effectGroup(original);
        let group = groups.get(kind.key);
        if (!group) {
          const section = node('section', 'dfo-item-group'); section.dataset.group = kind.key; section.append(node('h4', null, kind.label));
          const rows = list.cloneNode(false); section.append(rows); group = { section, rows }; groups.set(kind.key, group);
        }
        // The accessible line is the complete native sentence; its repeated
        // trigger is written once visually as the group's heading.
        row.setAttribute('aria-label', original);
        if (kind.key === 'power') {
          const rest = (original.slice(0, found.at) + original.slice(found.at + found.name.length).replace(/^:\s*/, '')).replace(/\s{2,}/g, ' ').trim();
          const detail = node('span', 'dfo-item-power-detail'); colored(detail, rest, 'power');
          row.replaceChildren(node('strong', 'dfo-item-power-name', found.name), detail);
        } else { row.replaceChildren(); colored(row, kind.text, kind.key); }
        group.rows.append(row);
      }
      return [...groups.values()].map(g => g.section);
    }

    // The material under the name - its label sand, its value in the metal's colour - the card's and the quick panel's.
    function materialRow(data) {
      const row = node('div', 'dfo-item-material'), value = node('span', 'dfo-item-metal', data.material), palette = materialPalette[data.materialKey];
      row.append(node('span', 'dfo-item-material-label', T('cards.material')), value);
      value.dataset.metal = data.materialKey || 'other';
      if (palette) for (const key of ['color', 'stroke', 'shadow']) if (palette[key]) value.style.setProperty('--dfo-metal-' + key, palette[key]);
      return row;
    }
    const COIN_DATA_URI = 'data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
      '<defs>' +
      '<linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fff6bd"/><stop offset="38%" stop-color="#eab308"/><stop offset="78%" stop-color="#a16207"/><stop offset="100%" stop-color="#5c3605"/></linearGradient>' +
      '<radialGradient id="face" cx="34%" cy="30%" r="68%"><stop offset="0%" stop-color="#fef9c3"/><stop offset="42%" stop-color="#f5c438"/><stop offset="85%" stop-color="#b87914"/><stop offset="100%" stop-color="#7c4b08"/></radialGradient>' +
      '</defs>' +
      '<circle cx="12" cy="12" r="9.8" fill="url(#rim)" stroke="#0a0704" stroke-width="1.15"/>' +
      '<circle cx="12" cy="12" r="7.7" fill="url(#face)" stroke="#78490a" stroke-width=".75"/>' +
      '<circle cx="12" cy="12" r="6.2" fill="none" stroke="#fef08a" stroke-width=".65" stroke-dasharray="1.6 1.2" opacity=".85"/>' +
      '<path d="M7.8 14.3L8.4 9.8L10.3 11.4L12 8.4L13.7 11.4L15.6 9.8L16.2 14.3Z" fill="#6b3e06" stroke="#fef08a" stroke-width=".55" stroke-linejoin="round"/>' +
      '<path d="M8.1 15.2H15.9" fill="none" stroke="#6b3e06" stroke-width="1.15" stroke-linecap="round"/>' +
      '<ellipse cx="8.6" cy="7.2" rx="2.1" ry=".9" transform="rotate(-35 8.6 7.2)" fill="#ffffff" opacity=".62"/>' +
      '</svg>'
    );
    let coinTemplate = null;
    function coinMark() {
      if (!coinTemplate) {
        const ns = 'http://www.w3.org/2000/svg', mk = t => doc.createElementNS ? doc.createElementNS(ns, t) : doc.createElement(t);
        const coin = mk('svg');
        coin.setAttribute('viewBox', '0 0 24 24'); coin.setAttribute('class', 'dfo-item-coin'); coin.setAttribute('aria-hidden', 'true');
        const img = mk('image');
        img.setAttribute('href', COIN_DATA_URI);
        img.setAttribute('width', '24');
        img.setAttribute('height', '24');
        coin.append(img);
        coinTemplate = coin;
      }
      return coinTemplate.cloneNode(true);
    }

    // THE QUICK-LOOT PANEL (ui/worldPlaque.js paint, hook itemCards.quick): beside the plaque's list, the lit row's
    // card - its left column, compact, and its price; no picture. It reads only what the plaque itself would draw (the
    // native stat rows, itemInfo.js itemStatRows) and the card's own pure readers, so it says no more than the native
    // panel knew: the material as the card shows it, the slot, the skill, the price. Anything wrong leaves the native one.
    const QUICK_W = 236, QUICK_ROOM = 150 + 8 + QUICK_W + 12;   // half the plaque's widest, the native gap, ours, a margin
    const quickSide = anchorX => {
      const width = win.innerWidth || 0;
      if (!Number.isFinite(anchorX) || width <= 0) return 'below';
      return anchorX + QUICK_ROOM <= width ? 'right' : anchorX - QUICK_ROOM >= 0 ? 'left' : 'below';
    };
    const QUICK_SKIP = new Set(['Damage', 'Armour', 'Material', 'Weight']);
    function quick(host, row, rows, anchorX) {
      try {
        host?.classList?.add('dfo-quick');   // the plaque's loot list in the mod's dress (the sheet scopes it to lists)
        const item = row?.item;
        if (!ready() || !host || !item || typeof item !== 'object' || Array.isArray(item)) return false;
        const told = new Map(), list = Array.isArray(rows) ? rows.filter(r => r && typeof r.text === 'string') : [];
        for (const r of list) if (r.label) told.set(r.label, r.text);
        // Native English before any translation: the stack's weight as itemInfo.js weightString writes it.
        const kg = Number.parseFloat(told.get('Weight') ?? '');
        const line = { weight: Number.isFinite(kg) ? kg : null, armorType: told.get('Type') ?? null, material: told.get('Material') ?? null };
        const data = derive(item, line, native, { known: () => false, credit: () => native.letterWorth?.(item) ?? null });
        if (!data) return false;
        ensureStyle();
        const panel = node('div', 'wplaque-stats dfo-quick-card');
        panel.dataset.side = quickSide(anchorX);
        if (typeof row.rarity === 'string' && row.rarity) panel.dataset.rarity = row.rarity;
        panel.append(node('div', 'dfo-quick-name', row.name ?? item.name ?? ''));
        if (data.material) panel.append(materialRow(data));
        const primary = told.has('Damage') ? 'Damage' : told.has('Armour') ? 'Armour' : null;
        if (primary) {
          const badge = node('div', 'dfo-quick-primary');
          badge.append(node('span', null, primary), node('strong', null, told.get(primary)));
          panel.append(badge);
        }
        const stats = node('dl', 'dfo-quick-stats');
        addPair(stats, T('cards.slot'), data.slot);
        addPair(stats, T('cards.skill'), data.skill);
        if (data.construction && data.construction !== data.material) addPair(stats, T('cards.construction'), data.construction);
        for (const r of list) {
          if (QUICK_SKIP.has(r.label)) continue;
          if (!r.label) { stats.append(node('div', 'dfo-quick-note', r.text)); continue; }
          addPair(stats, r.label === 'Type' ? T('cards.armorType') : r.label, r.text);
        }
        if (told.has('Weight')) addPair(stats, 'Weight', told.get('Weight'));
        if (data.count > 1) addPair(stats, T('cards.quantity'), format(data.count));
        const perKg = nearestTen(data.perKg);
        if (perKg != null) addPair(stats, T('cards.perKg'), T('cards.perKgValue', { value: format(perKg), n: perKg }));
        if (stats.children.length) panel.append(stats);
        const priceBox = node('div', 'dfo-quick-price'), priceValue = node('strong', 'dfo-item-price-value');
        priceBox.append(priceValue, coinMark());
        price({ priceBox, priceValue }, data);
        panel.append(priceBox);
        host.append(panel);
        counters.quick++;
        return true;
      } catch (error) {
        counters.failures++; counters.lastError = String(error?.message || error);
        return false;
      }
    }

    // THE LOOT WINDOW'S ROWS (enhancedInventory.js itemRow, hook itemCards.rows): a chest's, a wagon's, the bag's, a
    // body's - the rows beside the pack's grid - in the card's dress. The sub-line says the armour type and the metal
    // ("Chain Ebony"), then the stack's weight ("2.0 kg") where the condition word was; nothing where neither is known.
    // The right column, the weight's, carries the card's price. Nothing hidden is told: the metal only as the card shows it.
    const ARMOR_TYPES = new Set(['Leather', 'Chain', 'Plate']);
    const weightText = kg => (Number.isFinite(kg) && kg >= 0 ? `${kg > 0 && kg < 0.05 ? '<0.1' : kg.toFixed(1)} ${T('cards.kg')}` : null);
    let unknownLoc = null, unknownSet = null;
    function rowMaterial(line, data) {
      const loc = win.__dfoUi?.locale || '';
      if (!unknownSet || unknownLoc !== loc) {
        unknownLoc = loc;
        unknownSet = new Set([T('cards.material.noData'), T('cards.material.unknownMetal'), T('cards.material.unspecified')]);
      }
      const unknown = unknownSet;
      const type = typeof line.armorType === 'string' ? line.armorType.trim() : '';
      let armor = line.item.group === 'Armor' && ARMOR_TYPES.has(type) ? T('cards.armor.' + type) : null;
      let metal = typeof data.material === 'string' && data.material && !unknown.has(data.material) ? data.material : null;
      if (metal && data.facts?.material === 'leather' && armor) metal = null;   // "Leather", never "Leather Leather"
      if (metal && data.facts?.material === 'fur') armor = null;               // a fur jerkin is its fur
      if (!armor && !metal) return null;
      const box = node('span', 'dfo-row-mat');
      // Already in the player's language: text nodes, so the RU runtime does not word the phrase a second time.
      if (armor) { const a = node('span', 'dfo-row-armor'); a.append(doc.createTextNode(armor)); box.append(a); }
      if (metal) {
        const value = node('span', 'dfo-item-metal'), palette = materialPalette[data.materialKey];
        value.append(doc.createTextNode(metal));
        value.dataset.metal = data.materialKey || 'other';
        if (palette) for (const key of ['color', 'stroke', 'shadow']) if (palette[key]) value.style.setProperty('--dfo-metal-' + key, palette[key]);
        box.append(value);
      }
      return box;
    }
    // The inventory's list view (page/dfo_pack.js) dresses the pack's own rows too; its surrogate stack - records of one
    // kind that differ in nothing - says the whole count, weight and price, read off the cell's first record.
    const listRow = () => { try { return win.__dfoPack?.listRow?.() === true; } catch { return false; } };
    function stackOf(item, data) {
      let all = null;
      try { all = win.__dfoPack?.members?.(item); } catch { all = null; }
      if (!Array.isArray(all) || all.length < 2 || !data.count) return null;
      const n = all.reduce((sum, it) => sum + (Number.isSafeInteger(it?.stackCount) && it.stackCount > 1 ? it.stackCount : 1), 0);
      return { n, scale: n / data.count };
    }
    function row(button, line, from, context, quest) {
      try {
        if (!(from === 'remote' || from === 'trade' || (from === 'local' && listRow())) || !button || !line?.item || typeof line.item !== 'object' || !ready()) return false;
        const name = button.querySelector('.itemname'), weight = button.querySelector('.itemwt');
        if (!name || !weight) return false;
        let data = derive(line.item, line, native, context && typeof context.known === 'function' ? context : { known: () => false }, { light: true });
        if (!data) return false;
        ensureStyle();
        const stack = from === 'local' ? stackOf(line.item, data) : null;
        let kgValue = Number(line.weight);
        if (stack) {
          kgValue *= stack.scale;
          const sum = data.estimate == null ? null : data.estimate * stack.scale;
          data = { ...data, price: sum == null ? null : data.approximate ? nearestTen(sum) : sum };
          const title = name.querySelector(':scope > span');
          // the name as the row printed it, its own count off: already in the player's language, so a text node
          if (title) title.replaceChildren(doc.createTextNode(`${title.textContent.replace(/ ×\d+$/, '')} ×${stack.n}`));
        }
        if (from === 'trade') {
          for (const oldPrice of button.querySelectorAll(':scope > .itemprice')) oldPrice.remove();
          if (Number.isFinite(context?.tradePrice)) data = { ...data, price: context.tradePrice, approximate: false };
        }
        const sub = node('small', 'dfo-row-sub'), what = rowMaterial(line, data), kg = weightText(kgValue);
        if (what) sub.append(what);
        if (kg) sub.append(node('span', 'dfo-row-kg', kg));
        if (line.lit) sub.append(node('span', 'dfo-row-extra', 'lit'));   // the native word, worded as the native row words it
        if (typeof quest === 'string' && quest) { const q = node('span', 'dfo-row-extra'); q.append(doc.createTextNode(quest)); sub.append(q); }
        const priceBox = node('span', 'itemwt dfo-row-price'), priceValue = node('strong', 'dfo-item-price-value');
        priceBox.append(priceValue, coinMark());
        price({ priceBox, priceValue }, data);
        for (const old of name.querySelectorAll(':scope > small')) old.remove();
        name.append(sub);
        weight.replaceWith(priceBox);
        button.classList.add('dfo-item-row');
        counters.rows++;
        return true;
      } catch (error) {
        counters.failures++; counters.lastError = String(error?.message || error);
        return false;
      }
    }

    function dress(card, line, context) {
      if (!ready() || !card || !line?.item || states.has(card) || typeof context?.known !== 'function') return;
      const into = [...card.children].find(child => child.classList.contains('card-body')) || card;
      const original = [...into.childNodes];
      try {
        const data = derive(line.item, line, native, context);
        if (!data) return;
        const main = node('div', 'dfo-item-main'), left = node('div', 'dfo-item-left'), effects = node('div', 'dfo-item-effects');
        const overflow = node('div', 'dfo-item-overflow');
        const head = node('div', 'dfo-item-head'), title = node('div', 'dfo-item-title');
        const stats = node('dl', 'stats dfo-item-stats'), statuses = node('div', 'dfo-item-statuses');
        const meta = node('ul', 'dfo-item-meta'), socketLines = node('div', 'dfo-item-socket-lines');
        const wantedMeta = new Map();
        for (const text of context.meta || []) { const key = said(text); wantedMeta.set(key, (wantedMeta.get(key) || 0) + 1); }
        // The native non-common rarity attribute guarantees a tier line after crafting/heirloom metadata.
        // Keep its original wording, including Perfect / Exalted / Cursed / Damned and any locale.
        const hasTier = !!card.dataset.rarity && card.dataset.rarity !== 'common';
        const labels = { damage: said('Damage'), armour: said('Armour'), worth: said('Worth'), type: said('Type') };
        let icon = null, name = null, primary = null, tier = null;
        const leftNative = [], rightNative = [];
        for (const child of [...into.children]) {
          if (child.classList.contains('bigicon')) { icon = child; continue; }
          if (child.tagName === 'H3') { name = child; continue; }
          if (child.classList.contains('meta')) continue; // Its material and stack now have explicit, separate rows.
          if (child.tagName === 'DL' && child.classList.contains('stats')) {
            for (const pair of [...child.children]) {
              const label = pair.querySelector('dt')?.textContent || '';
              if (label === labels.damage || label === labels.armour) { primary = pair.cloneNode(true); continue; }
              if (label === labels.worth && data.source === 'credit') continue;
              const copy = pair.cloneNode(true);
              if (label === labels.type) copy.querySelector('dt').textContent = T('cards.armorType');
              stats.append(copy);
            }
            continue;
          }
          if (child.tagName === 'UL' && child.classList.contains('rarity')) {
            const list = child.cloneNode(false); list.classList.add('dfo-item-lines');
            for (const originalLine of [...child.children]) {
              const text = originalLine.textContent;
              if ((wantedMeta.get(text) || 0) > 0) { wantedMeta.set(text, wantedMeta.get(text) - 1); meta.append(originalLine.cloneNode(true)); }
              else if (!tier && hasTier) tier = text;
              else list.append(originalLine.cloneNode(true));
            }
            if (list.children.length) rightNative.push(...groupedPowers(list, data));
            continue;
          }
          if (child.matches('.lockline,.boundline')) { statuses.append(child.cloneNode(true)); continue; }
          if (child.classList.contains('sock-wells') || child.classList.contains('sock-choose') || child.classList.contains('sock-none')) {
            leftNative.push(child);
            if (data.known) for (const well of child.querySelectorAll('.sock-well')) {
              const text = well.getAttribute('title') || well.getAttribute('aria-label');
              if (text) socketLines.append(node('div', null, text));
            }
            continue;
          }
          rightNative.push(child); // Preserve current and future native integrations as actual nodes.
        }
        if (tier) title.append(node('div', 'dfo-item-tier', tier));
        if (name) title.append(name);
        if (icon) head.append(icon); else head.style.gridTemplateColumns = 'minmax(0,1fr)';
        if (data.material) head.append(title, materialRow(data)); else head.append(title);
        left.append(head);
        if (primary) {
          const badge = node('div', 'dfo-item-primary');
          badge.append(node('span', null, primary.querySelector('dt')?.textContent), node('strong', null, primary.querySelector('dd')?.textContent));
          left.append(badge);
        }
        const materialRows = node('dl');
        addPair(materialRows, T('cards.slot'), data.slot);
        addPair(materialRows, T('cards.skill'), data.skill);
        if (data.construction && data.construction !== data.material) addPair(materialRows, T('cards.construction'), data.construction);
        if (materialRows.children.length) stats.prepend(...materialRows.children);
        if (data.count > 1) addPair(stats, T('cards.quantity'), format(data.count));
        const pricePerKg = nearestTen(data.perKg);
        if (pricePerKg != null) addPair(stats, T('cards.perKg'), T('cards.perKgValue', { value: format(pricePerKg), n: pricePerKg }));
        for (const pair of stats.children) if ([said('Condition'), said('Worn'), T('cards.perKg')].includes(pair.querySelector('dt')?.textContent)) pair.dataset.divider = '';
        if (stats.children.length) left.append(node('h4', 'dfo-item-stat-heading', T('cards.general')));
        left.append(stats);
        if (statuses.children.length) left.append(statuses);
        if (meta.children.length) left.append(meta);
        left.append(...leftNative);
        left.append(overflow);
        effects.append(...rightNative);
        if (socketLines.children.length) effects.append(socketLines);
        main.append(left, effects);
        const footer = node('div', 'dfo-item-footer'), priceBox = node('div', 'dfo-item-price');
        const priceValue = node('strong', 'dfo-item-price-value');
        priceBox.append(priceValue, coinMark());
        const text = description(line.item, data, card.dataset.rarity === 'rare' && !!tier && isPerfect(tier));
        if (text) { footer.classList.add('has-text'); footer.append(text); }
        footer.append(priceBox);
        // A native render is a snapshot: sizing must not repeatedly read game rules or mix a fresh price with old stats.
        const state = { main, left, effects, overflow, blocks: [...effects.children], footer, priceBox, priceValue, dirty: true, host: null };
        price(state, data);
        into.replaceChildren(main, footer);
        const corners = node('div', 'dfo-item-corners'); corners.setAttribute('aria-hidden', 'true'); for (let i = 0; i < 4; i++)corners.append(node('i')); into.append(corners);
        card.classList.add('dfo-item-card');
        states.set(card, state); counters.dressed++;
        ensureStyle();
        // Initial construction can be detached. The native fit call performs the connected measurement.
        const initialWidth = Math.min(600, Math.max(1, (cachedViewport?.width ? cachedViewport.width + 16 : (win.innerWidth || 1920)) - 16));
        card.style.width = initialWidth + 'px';
        main.style.gridTemplateColumns = Math.min(260, Math.round(initialWidth * 0.44)) + 'px minmax(0,1fr)';
      } catch (error) {
        into.replaceChildren(...original); card.classList.remove('dfo-item-card'); states.delete(card);
        counters.failures++; counters.lastError = String(error?.message || error);
      }
    }

    function hostOf(card) { return card.closest('.inv-tip,.packdetail'); }
    let cachedViewport = null;
    const clearViewportCache = () => { cachedViewport = null; };
    function viewport() {
      if (cachedViewport) return cachedViewport;
      const v = win.visualViewport;
      const width = Math.max(0, Math.min(win.innerWidth, v?.width ?? win.innerWidth));
      const height = Math.max(0, Math.min(win.innerHeight, v?.height ?? win.innerHeight));
      const pad = Math.min(8, width / 4, height / 4);
      const out = {
        left: (v?.offsetLeft || 0) + pad, top: (v?.offsetTop || 0) + pad,
        width: Math.max(0, width - pad * 2), height: Math.max(0, height - pad * 2)
      };
      if (typeof win.addEventListener === 'function') cachedViewport = out;
      return out;
    }
    function extent(host) {
      const box = host.getBoundingClientRect();
      const ow = host.offsetWidth, oh = host.offsetHeight;
      const sx = ow ? box.width / ow : 1;
      const sy = oh ? box.height / oh : 1;
      // Include native chrome, actions, wallet/binder sheets and any unbroken overflowing labels.
      return { box, width: Math.max(box.width, host.scrollWidth * sx), height: Math.max(box.height, host.scrollHeight * sy), ow, oh };
    }
    const shapeOf = e => [e.width.toFixed(2), e.height.toFixed(2), e.ow, e.oh].join(':');
    const shape = host => shapeOf(extent(host));
    function release(card, state) {
      for (const observer of state.observers || []) observer.disconnect();
      active.delete(card); pending.delete(card); state.host = null; state.observers = null; state.contentObserver = null;
    }
    function track(card, state, host) {
      if (state.host === host) return;
      for (const [other, old] of active) if (!other.isConnected) release(other, old);
      if (state.host) release(card, state);
      state.host = host; state.observers = []; active.set(card, state);
      // Observe only the card and its ancestor chain, never the game's entire HUD subtree.
      const content = new win.MutationObserver(() => {
        counters.observerCallbacks++;
        if (!card.isConnected) return release(card, state);
        // A shorter column may change without changing the host's outer height.
        queue(card, true);
      });
      state.contentObserver = content;
      content.observe(host, { childList: true, characterData: true, subtree: true }); state.observers.push(content);
      const position = new win.MutationObserver(records => {
        counters.observerCallbacks++;
        if (!card.isConnected) return release(card, state);
        const moved = records.some(r => r.type === 'attributes' && (r.target !== host || host.style.cssText !== state.styleStamp || host.className !== state.classStamp));
        if (moved) fit(card, false, true);
      });
      for (let parent = host; parent; parent = parent.parentElement) {
        position.observe(parent, { attributes: true, attributeFilter: ['style', 'class'] });
      }
      state.positionObserver = position;
      state.observers.push(position);
      if (win.ResizeObserver) {
        const resized = new win.ResizeObserver(() => {
          counters.observerCallbacks++;
          if (!card.isConnected) return release(card, state);
          const cur = extent(host);
          if (shapeOf(cur) !== state.shape) fit(card, true);
        });
        resized.observe(host); state.observers.push(resized);
      }
    }
    function balance(state) {
      counters.balances++;
      const { left, effects, overflow } = state;
      const live = [...effects.children, ...overflow.children], present = new Set(live);
      const blocks = state.blocks.filter(block => present.has(block)), known = new Set(blocks);
      // Remember the original sequence across reflows. Newly appended native blocks
      // belong after that sequence, even while its old tail is in the left column.
      for (const parent of [effects, overflow]) {
        const children = [...parent.children];
        for (let i = 0; i < children.length; i++) if (!known.has(children[i])) {
          const next = children.slice(i + 1).find(child => known.has(child));
          blocks.splice(next ? blocks.indexOf(next) : blocks.length, 0, children[i]); known.add(children[i]);
        }
      }
      state.blocks = blocks;
      let next = effects.firstElementChild;
      for (const block of blocks) {
        if (block === next) next = next.nextElementSibling;
        else effects.insertBefore(block, next);
      }
      if (blocks.length < 2) return;
      const oldLeft = left.style.alignSelf, oldRight = effects.style.alignSelf;
      try {
        // Grid cells stretch to the tallest column; measure their natural heights.
        left.style.alignSelf = effects.style.alignSelf = 'start';
        let lh = left.getBoundingClientRect().height, eh = effects.getBoundingClientRect().height;
        if (eh <= lh + 1) return;
        let bestHeight = Math.max(lh, eh), split = blocks.length;
        // Only whole, contiguous suffixes may move. Measure at the actual narrower
        // left-column width; estimating by the right-column height misses wrapping.
        for (let at = blocks.length - 1; at > 0; at--) {
          overflow.prepend(blocks[at]); counters.balanceTrials++;
          lh = left.getBoundingClientRect().height;
          eh = effects.getBoundingClientRect().height;
          const candidate = Math.max(lh, eh);
          if (candidate < bestHeight - .5 && overflow.scrollWidth <= overflow.clientWidth + 1) { bestHeight = candidate; split = at; }
          if (lh >= bestHeight - .5) break;
        }
        for (let at = 0; at < split; at++) if (blocks[at].parentElement !== effects) effects.append(blocks[at]);
      } finally { left.style.alignSelf = oldLeft; effects.style.alignSelf = oldRight; }
    }
    function measure(card, state, host, view) {
      counters.layouts++;
      // Reset emergency zoom before measuring; ordinary Full HD cards keep their original text size.
      if (host.style.zoom && host.style.zoom !== '1') host.style.zoom = '1';
      const initial = host.getBoundingClientRect();
      const parentScale = host.offsetWidth ? initial.width / host.offsetWidth : 1;
      const limit = Math.max(320, view.width / (parentScale || 1));
      const widths = [...new Set([600, 640, 700, 740].map(width => Math.min(width, limit)))];
      let size = null;
      for (const width of widths) {
        const wStr = width + 'px';
        if (card.style.width !== wStr) card.style.width = wStr;
        const colStr = Math.min(260, Math.round(width * 0.44)) + 'px minmax(0,1fr)';
        if (state.main.style.gridTemplateColumns !== colStr) state.main.style.gridTemplateColumns = colStr;
        balance(state);
        size = extent(host);
        if (size.height <= Math.min(960, view.height)) break;
      }
      if (!size) size = extent(host);
      const zoom = Math.min(1, view.width / Math.max(1, size.width), view.height / Math.max(1, size.height));
      let zoomChanged = false;
      // Last resort for physically oversized cards: keep every line, with no cropping or inner scrolling.
      if (zoom < 1) {
        const nextZoom = String(Math.max(0.00001, zoom * 0.998));
        if (host.style.zoom !== nextZoom) { host.style.zoom = nextZoom; zoomChanged = true; }
      } else if (host.style.zoom && host.style.zoom !== '1') {
        host.style.zoom = '1'; zoomChanged = true;
      }
      state.dirty = false;
      return zoomChanged ? null : size;
    }
    function place(host, view, preExtent = null) {
      counters.placements++;
      for (let attempt = 0; attempt < 2; attempt++) {
        const e = (attempt === 0 && preExtent) ? preExtent : extent(host), box = e.box;
        const x = Math.max(view.left, Math.min(box.left, view.left + view.width - e.width));
        const y = Math.max(view.top, Math.min(box.top, view.top + view.height - e.height));
        const dx = x - box.left, dy = y - box.top;
        if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) return e;
        const rawLeft = host.style.left, rawTop = host.style.top;
        const left = Number.parseFloat(rawLeft) || host.offsetLeft || 0;
        const top = Number.parseFloat(rawTop) || host.offsetTop || 0;
        const sxEst = e.ow ? box.width / e.ow : 1;
        const syEst = e.oh ? box.height / e.oh : 1;
        if (attempt === 0 && Math.abs(sxEst - 1) < 0.002 && Math.abs(syEst - 1) < 0.002) {
          host.style.left = left + dx + 'px'; host.style.top = top + dy + 'px';
          if (rawLeft.endsWith('px') && rawTop.endsWith('px') && (!host.style.zoom || host.style.zoom === '1')) {
            return { box: { left: x, top: y, width: box.width, height: box.height }, width: e.width, height: e.height, ow: e.ow, oh: e.oh };
          }
          continue;
        }
        // Measure the coordinate conversion, including CSS zoom and scaled containing blocks.
        // The probe and correction run synchronously before paint; the probe is never visible.
        host.style.left = left + 16 + 'px'; host.style.top = top + 16 + 'px';
        const moved = host.getBoundingClientRect();
        const sx = (moved.left - box.left) / 16 || 1, sy = (moved.top - box.top) / 16 || 1;
        host.style.left = left + dx / sx + 'px'; host.style.top = top + dy / sy + 'px';
      }
      return null;
    }
    function fit(card, dirty = false, checkShape = false, positionFn = null) {
      const state = states.get(card);
      if (!state) return false;
      const host = hostOf(card);
      if (!host || !host.isConnected) { state.dirty = true; return true; }
      try {
        if (!host.classList.contains('dfo-item-host')) host.classList.add('dfo-item-host');
        for (const cls of ['tip-compact', 'tip-tight']) if (host.classList.contains(cls)) host.classList.remove(cls);
        for (const cls of ['card-compact', 'card-tight']) if (card.classList.contains(cls)) card.classList.remove(cls);
        if (card.style.maxHeight !== 'none') card.style.maxHeight = 'none';
        track(card, state, host);
        const view = viewport(), key = [view.width, view.height].join(':');
        if (!view.width || !view.height) {
          host.style.visibility = 'hidden'; state.styleStamp = host.style.cssText; state.classStamp = host.className; return true;
        }
        const contentChanged = state.contentObserver.takeRecords().length > 0;
        let pre = null;
        let needMeasure = state.dirty || dirty || contentChanged || state.view !== key;
        if (!needMeasure && checkShape && state.shape) {
          pre = extent(host);
          if (shapeOf(pre) !== state.shape) needMeasure = true;
        }
        if (needMeasure) pre = measure(card, state, host, view);
        if (typeof positionFn === 'function') {
          const cur = pre || extent(host);
          positionFn(cur.ow, cur.oh);
          pre = null;
        }
        let e = place(host, view, pre) || extent(host);
        // Account for fractional layout rounding and unusual overflowing native rows after zoom.
        if (e.width > view.width + 0.05 || e.height > view.height + 0.05) {
          host.style.zoom = String((Number(host.style.zoom) || 1) * Math.min(view.width / e.width, view.height / e.height) * 0.998);
          e = place(host, view) || extent(host);
        }
        if (host.style.visibility !== 'visible') host.style.visibility = 'visible';
        state.view = key; state.shape = shapeOf(e); state.styleStamp = host.style.cssText; state.classStamp = host.className;
        // Moving our own blocks and clamping host coordinates are synchronous layout work, not external mutations.
        state.contentObserver?.takeRecords();
        state.positionObserver?.takeRecords();
      } catch (error) { counters.failures++; counters.lastError = String(error?.message || error); }
      return true;
    }
    function queue(card, dirty = false) {
      const state = states.get(card);
      if (!state) return;
      state.dirty ||= dirty;
      pending.add(card);
      if (scheduled) return;
      scheduled = true;
      win.requestAnimationFrame(() => {
        scheduled = false;
        const batch = [...pending]; pending.clear();
        for (const card of batch) {
          const state = states.get(card);
          if (!card.isConnected) { if (state?.host) release(card, state); }
          else fit(card);
        }
      });
    }
    const refresh = () => {
      clearViewportCache();
      for (const [card, state] of active) {
        if (card.isConnected) fit(card, false, true); else release(card, state);
      }
    };
    const reposition = (ev) => {
      const target = ev?.target;
      const viewportScroll = !target || target === win || target === doc || target === win.visualViewport || target === doc.documentElement || target === doc.body;
      if (viewportScroll) clearViewportCache();
      for (const [card, state] of active) {
        if (!card.isConnected) { release(card, state); continue; }
        if (!viewportScroll && state.host && typeof target.contains === 'function' && !target.contains(state.host)) continue;
        fit(card);
      }
    };
    win.addEventListener('resize', refresh);
    win.addEventListener('scroll', reposition, { capture: true, passive: true });
    win.visualViewport?.addEventListener('resize', refresh);
    win.visualViewport?.addEventListener('scroll', reposition);
    doc.fonts?.addEventListener?.('loadingdone', () => { for (const [card] of active) if (card.isConnected) fit(card, true); });
    if (doc.head || doc.documentElement) ensureStyle();
    else doc.addEventListener?.('DOMContentLoaded', ensureStyle, { once: true });
    win.__dfoItemCards = Object.freeze({
      register(parts) { for (const key of [...DATA_KEYS, 'power', 'effectLabels', 'slotName', 'handsName', 'weaponSkill', 'letterWorth']) if (typeof parts?.[key] === 'function') native[key] = parts[key]; },
      dress,
      quick,
      row,
      // The native second argument is room in pixels, not our internal dirty/invalidation flag.
      fitCard(card) {
        const state = states.get(card);
        if (!state) return false;
        if (state.dirty) return fit(card, true);
        return fit(card, false, true);
      },
      fitAnchored(card, positionFn) {
        const state = states.get(card);
        if (!state) return false;
        return fit(card, state.dirty, !state.dirty, positionFn);
      },
      fitTip(host) { const card = host?.querySelector('.dfo-item-card'); return card ? fit(card) : false; },
      stats: () => ({ ...counters, ready: ready(), active: active.size, pending: pending.size }),
    });
  }
  return { derive, effectGroup, effectParts, materialPalette, install, CSS };
});
