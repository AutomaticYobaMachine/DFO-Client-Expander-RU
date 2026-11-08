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
    Iron:{color:'#747980'},Steel:{color:'#c6cbd1'},Silver:{color:'#ffffff'},Elven:{color:'#95cfff'},
    Dwarven:{color:'#dfb84f'},Mithril:{color:'#40bfff'},Adamantium:{color:'#cbb3e8'},Orcish:{color:'#61c87e'},
    Ebony:{color:'#101116',stroke:'.4px #f4f1e8',shadow:'0 0 2px #f4f1e8'},
    Daedric:{color:'#130e10',stroke:'.4px #f05a55',shadow:'0 0 3px #dc312b'},
  });
  function effectParts(text,group='properties',labels=[]) {
    const range=/(?:\s*\[[^\]]*\])+\s*$/.exec(text),main=range?text.slice(0,range.index):text,parts=[];
    const colon=group==='properties'||group==='power'?main.indexOf(':'):-1;
    const prefix=colon<0&&(group==='properties'||group==='power')?labels.find(label=>main.startsWith(label)&&/^\s/.test(main.slice(label.length))):null;
    const at=colon>=0?colon+1:prefix?prefix.length:0;
    if(at){const split=at+(main.slice(at).match(/^\s*/)?.[0].length||0);parts.push({kind:'label',text:main.slice(0,split)},{kind:'value',text:main.slice(split)});}
    else parts.push({kind:'value',text:main});
    if(range)parts.push({kind:'range',text:range[0]});return parts;
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
    if (hand && typeof native.handsName === 'function') { try { word = HAND_WORD[native.handsName(item)] || word; } catch {} }
    if (has(`cards.slot.${word}`)) out.slot = T(`cards.slot.${word}`);
    if (hand && item.group === 'Weapons' && typeof native.weaponSkill === 'function') {
      let skill = null;
      try { skill = native.weaponSkill(item.templateIndex); } catch {}
      if (typeof skill === 'string' && skill) out.skill = has(`cards.skill.${skill}`) ? T(`cards.skill.${skill}`) : spaced(skill);
    }
    return out;
  }

  /** Pure presentation data. Never mint, identify, repair or write to the item. */
  function derive(item, line, native, context = {}) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
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
          if(Object.hasOwn(materialPalette,name))materialKey=name;
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
    const power = known && typeof native.power === 'function' ? native.power(item) : null;
    const { slot, skill } = wornIn(item, ammo, native);
    return { known, facts, count, material, materialKey, construction, slot, skill, unitValue, total, source, power, price, approximate,
      perKg: finite(perKg) && perKg <= Number.MAX_SAFE_INTEGER ? perKg : null };
  }

  const CSS = `
body .card.dfo-item-card { --dfo-ornament:var(--rar,#827a68); --dfo-corner:polygon(0 0,100% 0,100% 15%,15% 15%,15% 100%,0 100%); padding:0!important; margin:0; position:relative; display:block!important; overflow:visible!important; max-height:none!important; box-sizing:border-box; background:var(--ink,#0e1013)!important; color:var(--bone,#e9e4d9); border:3px solid var(--dfo-ornament)!important; box-shadow:inset 0 0 0 1px #000,0 5px 18px #0008; font:14px/1.28 'DFO Gabin',var(--data,Georgia,serif); font-synthesis:none; }
body .card.dfo-item-card>.card-body { display:block; flex:none; min-height:0; padding:0; overflow:visible!important; max-height:none!important; }
body .inv-tip.dfo-item-host { width:max-content!important; max-width:none!important; max-height:none!important; overflow:visible!important; pointer-events:none; }
body .pack-shell .packdetail.dfo-item-host { width:max-content!important; height:auto!important; max-width:none!important; max-height:none!important; overflow:visible!important; bottom:auto!important; right:auto!important; transition:none!important; }
.dfo-item-main { display:grid; grid-template-columns:260px minmax(0,1fr); gap:14px; padding:12px; box-sizing:border-box; }
.dfo-item-left { min-width:0; border-right:1px solid #756346; box-shadow:1px 0 #000; padding-right:12px; }
.dfo-item-head { display:grid; grid-template-columns:64px minmax(0,1fr); gap:10px; align-items:center; margin-bottom:12px; }
.dfo-item-head>.dfo-item-material { grid-column:1/-1; display:flex; flex-wrap:wrap; justify-content:space-between; gap:3px 8px; font-size:12px; line-height:1.3; padding-top:3px; color:#b7a071; }
.dfo-item-material .dfo-item-metal { font:inherit; font-weight:400; color:var(--dfo-metal-color,#e9e4d9)!important; -webkit-text-stroke:var(--dfo-metal-stroke,0 transparent); text-shadow:var(--dfo-metal-shadow,none); }
.dfo-item-card .dfo-item-head>.bigicon { width:64px; height:82px; margin:0!important; display:flex; align-items:center; justify-content:center; }
.dfo-item-card .dfo-item-head>.bigicon img,.dfo-item-card .dfo-item-head>.bigicon canvas { width:auto!important; height:auto!important; max-width:60px!important; max-height:78px!important; object-fit:contain; }
body .card.dfo-item-card .dfo-item-title h3 { font-family:'DFO Greengoth',var(--display,Georgia,serif)!important; font-weight:400; font-size:22px!important; line-height:1.15; text-align:left; text-transform:none; letter-spacing:normal; margin:0!important; overflow-wrap:anywhere; color:var(--rar,var(--bone,#e9e4d9)); }
.dfo-item-tier { font-size:11px; margin:0 0 4px; color:var(--rar,var(--brass,#d5b26e)); }
.dfo-item-tier::before { content:var(--rar-pips,''); margin-right:4px; font-size:9px; }
.dfo-item-card .dfo-item-stats { display:block!important; margin:0; padding:0; }
.dfo-item-card .dfo-item-stats>.pair { display:flex!important; justify-content:space-between; gap:8px; margin:0 0 6px; font-size:13px!important; line-height:1.25!important; }
.dfo-item-card .dfo-item-stats>.pair>dt { font:inherit!important; letter-spacing:normal!important; text-transform:none!important; text-align:left!important; color:var(--dim,#a89f88); }
.dfo-item-card .dfo-item-stats>.pair>dd { font:inherit!important; margin:0; text-align:right; min-width:0; overflow-wrap:anywhere; }
.dfo-item-primary { display:flex; align-items:baseline; justify-content:space-between; gap:8px; border-bottom:1px solid #454534; padding:0 0 9px; margin:0 0 10px; }
.dfo-item-primary>span { font-size:11px; color:var(--dim,#a89f88); }
.dfo-item-primary>strong { font-family:'DFO Flexi',var(--data,monospace); font-size:23px; line-height:1.1; font-weight:400; min-width:0; overflow-wrap:anywhere; }
.dfo-item-card .dfo-item-statuses>p { text-align:left!important; font-size:11px!important; line-height:1.35!important; margin:7px 0 0; overflow-wrap:anywhere; }
:is(.dfo-item-effects,.dfo-item-overflow) { display:flex; flex-direction:column; gap:5px; min-width:0; }
.dfo-item-overflow:empty { display:none; }
.dfo-item-overflow:not(:empty) { border-top:1px solid #454534; margin-top:10px; padding-top:8px; }
.dfo-item-card .dfo-item-lines { display:block; padding:0; margin:0; list-style:none; font-size:14px!important; line-height:1.25!important; color:#edd5a4!important; text-align:left; }
.dfo-item-card .dfo-item-lines>li { display:block; font:inherit!important; color:inherit!important; letter-spacing:normal!important; text-transform:none!important; margin:0 0 3px; white-space:normal; overflow-wrap:anywhere; }
.dfo-item-card .dfo-item-lines>li:first-child { font-size:12px; letter-spacing:normal; text-transform:none; color:inherit; }
.dfo-item-card .dfo-item-lines>li:first-child::before { content:none!important; }
.dfo-item-card .dfo-effect-label { color:#edd5a4!important; }
.dfo-item-card .dfo-effect-value { color:#f3f2ed!important; }
.dfo-item-card .dfo-effect-range { color:#696b72!important; font-size:.86em; }
.dfo-item-card .dfo-item-meta { list-style:none; padding:8px 0 0; margin:8px 0 0; border-top:1px solid #454534; font-size:11px!important; line-height:1.4!important; overflow-wrap:anywhere; }
.dfo-item-card .dfo-item-meta>li { margin:0 0 4px; }
.dfo-item-socket-lines { font-size:11px; line-height:1.35; margin:0; }
.dfo-item-socket-lines>div { margin-bottom:4px; overflow-wrap:anywhere; }
:is(.dfo-item-effects,.dfo-item-overflow)>.cmp { margin:0; }
.dfo-item-footer { display:flex; justify-content:flex-end; align-items:flex-end; gap:16px; border-top:1px solid #756346; padding:9px 12px 11px; text-align:right; background:var(--ink,#0e1013); }
.dfo-item-card .dfo-item-text { flex:1 1 auto; min-width:0; margin:0; text-align:left; font:12px/1.38 'DFO Flow','DFO Gabin',var(--data,Georgia,serif)!important; color:#c4c6ca!important; letter-spacing:normal!important; text-transform:none!important; }
.dfo-item-card .dfo-item-text>p { margin:0; padding:0; font:inherit!important; color:inherit!important; white-space:normal; overflow-wrap:break-word; text-align:left!important; }
.dfo-item-card .dfo-item-text>.dfo-item-text-stolen { color:#e2574c!important; }
.dfo-item-card .dfo-item-text>.dfo-item-text-hint { color:#ffffff!important; margin-top:1.38em; }
.dfo-item-card .dfo-item-footer:has(.dfo-item-text) { justify-content:space-between; }
.dfo-item-price { display:flex; align-items:center; gap:8px; color:#f5d451; }
.dfo-item-price-value { font-family:'DFO Flexi',var(--data,monospace); font-size:21px; font-weight:400; line-height:1.15; color:#f5d451; white-space:nowrap; }
.dfo-item-coin { width:20px; height:20px; flex:none; color:#f5d451; }
.dfo-item-card::before { content:''; position:absolute; inset:3px; border:1px solid color-mix(in srgb,var(--dfo-ornament) 32%,transparent); pointer-events:none; }
.dfo-item-corners { position:absolute; inset:2px; pointer-events:none; }
.dfo-item-corners>i { width:18px; height:18px; position:absolute; background:var(--dfo-ornament); clip-path:var(--dfo-corner); opacity:.95; }
.dfo-item-corners>i:nth-child(1) { left:0; top:0; }
.dfo-item-corners>i:nth-child(2) { right:0; top:0; transform:rotate(90deg); }
.dfo-item-corners>i:nth-child(3) { right:0; bottom:0; transform:rotate(180deg); }
.dfo-item-corners>i:nth-child(4) { left:0; bottom:0; transform:rotate(270deg); }
body .card.dfo-item-card:not([data-rarity]),body .card.dfo-item-card[data-rarity=common] { border-width:2px!important; }
.dfo-item-card[data-rarity=magic] { --dfo-corner:polygon(0 0,100% 0,65% 20%,35% 20%,35% 35%,20% 35%,20% 65%,0 100%); }
body .card.dfo-item-card[data-rarity=rare] { border-style:double!important; --dfo-corner:polygon(0 0,100% 0,100% 18%,46% 18%,46% 46%,18% 46%,18% 100%,0 100%); }
.dfo-item-card[data-rarity=legendary] { --dfo-corner:polygon(0 0,100% 0,78% 16%,45% 16%,60% 33%,33% 60%,16% 45%,16% 78%,0 100%); }
body .card.dfo-item-card[data-rarity=aetheric] { border-style:groove!important; --dfo-corner:polygon(0 0,100% 0,72% 16%,40% 16%,40% 40%,16% 40%,16% 72%,0 100%,0 60%,10% 50%,0 40%); }
body .card.dfo-item-card[data-rarity=gilded] { border-width:4px!important; border-style:double!important; --dfo-corner:polygon(0 0,100% 0,82% 18%,48% 18%,60% 30%,30% 60%,18% 48%,18% 82%,0 100%,0 65%,12% 50%,0 35%); }
.dfo-item-group { min-width:0; margin:0; }
.dfo-item-group+.dfo-item-group { border-top:1px solid #393b35; padding-top:7px; margin-top:2px; }
.dfo-item-group>h4,.dfo-item-stat-heading { margin:0 0 6px; font:12px/1.2 'DFO Gabin',var(--data,serif); letter-spacing:.07em; text-transform:uppercase; color:#b7a071; }
.dfo-item-group[data-group=strike] .dfo-item-lines>li::before,.dfo-item-group[data-group=held] .dfo-item-lines>li::before,.dfo-item-group[data-group=use] .dfo-item-lines>li::before { content:'◆'!important; display:inline; margin-right:6px; color:var(--dfo-ornament); font-size:8px; }
.dfo-item-power-name { display:block; font:20px/1.12 'DFO Wolga',var(--display,Georgia,serif); color:#f3f2ed; margin:2px 0 5px; }
.dfo-item-power-detail { display:block; color:#d7c9ad; }
.dfo-item-group[data-group=power] { border:1px solid #715336; padding:7px 8px; background:linear-gradient(115deg,#382a1738,transparent); }
.dfo-item-card .dfo-item-stats>.pair[data-divider] { border-top:1px solid #393b35; padding-top:8px; margin-top:8px; }
:is(.dfo-item-effects,.dfo-item-overflow)>.cmp { border-left:2px solid #637b65; background:#18201966; padding:6px 8px; }
.dfo-item-card :is(.sigilbox,.setbox,.techbox,.cmp) { font-family:'DFO Gabin',var(--data,serif); }
.dfo-item-card :is(.dfo-item-stats,.dfo-item-lines,.cmp-head,.cmp-line,.sigil-effect,.sigil-progress,.set-tier-effect) { font-family:'DFO Gabin',var(--data,serif)!important; }
.dfo-item-card .sigilbox .sigil-stage { font-family:'DFO Ckazka',var(--display,serif)!important; font-size:17px!important; letter-spacing:.02em; }
.dfo-item-card .setbox .set-name { font-family:'DFO Ritalin',var(--display,serif)!important; font-size:18px!important; letter-spacing:.02em; }
/* QUICK LOOT: the plaque's loot list in the card's dress (only an itemised plaque - never a name or a verb menu) */
.wplaque.dfo-quick.has-list:not(.has-actions) { background:var(--ink,#0e1013); border:2px solid #756346; box-shadow:inset 0 0 0 1px #000,0 5px 18px #0008; text-shadow:none; }
.wplaque.dfo-quick.has-list:not(.has-actions) .wplaque-title { font-family:'DFO Greengoth',var(--display,Georgia,serif); font-size:17px; line-height:1.25; color:var(--bone,#e9e4d9); }
.wplaque.dfo-quick.has-list:not(.has-actions) .wplaque-sub { font-family:'DFO Gabin',var(--data,serif); color:#b7a071; }
.wplaque.dfo-quick.has-list:not(.has-actions) .wplaque-list { border-top:1px solid #756346; }
.wplaque.dfo-quick.has-list:not(.has-actions) .wplaque-row { font-family:'DFO Gabin',var(--data,serif); }
.wplaque.dfo-quick.has-list:not(.has-actions) .wplaque-row.sel { background:rgba(183,160,113,.16); box-shadow:inset 2px 0 0 #d5b26e; }
.wplaque.dfo-quick.has-list:not(.has-actions) .wplaque-count { font-family:'DFO Flexi',var(--data,monospace); color:#d5b26e; }
.wplaque.dfo-quick.has-list:not(.has-actions) :is(.wplaque-empty,.wplaque-more) { color:#a89f88; }
/* ...and the lit row's card beside it: the left column, compact, and the price */
.dfo-quick-card { --dfo-quick-rar:#827a68; }
.wplaque .wplaque-stats.dfo-quick-card { width:236px; padding:9px 11px 8px; background:var(--ink,#0e1013); border:2px solid var(--dfo-quick-rar); box-shadow:inset 0 0 0 1px #000,0 5px 18px #0008; color:var(--bone,#e9e4d9); font:12px/1.3 'DFO Gabin',var(--data,serif); text-shadow:none; -webkit-font-smoothing:auto; }
.wplaque .wplaque-stats.dfo-quick-card[data-side="below"] { width:auto; border:0; border-top:1px solid #756346; box-shadow:none; background:none; padding:7px 0 0; }
.dfo-quick-card[data-rarity="magic"] { --dfo-quick-rar:#6f9ee8; }
.dfo-quick-card[data-rarity="rare"] { --dfo-quick-rar:#e4c34f; }
.dfo-quick-card[data-rarity="legendary"] { --dfo-quick-rar:#e07a2e; }
.dfo-quick-card[data-rarity="aetheric"] { --dfo-quick-rar:#bfe8ff; }
.dfo-quick-card[data-rarity="artifact"] { --dfo-quick-rar:#b57bee; }
.dfo-quick-card[data-rarity="gilded"] { --dfo-quick-rar:#ff3b4a; }
.dfo-quick-name { margin:0 0 5px; font:400 16px/1.15 'DFO Greengoth',var(--display,Georgia,serif); color:var(--bone,#e9e4d9); overflow-wrap:anywhere; }
.dfo-quick-card[data-rarity]:not([data-rarity="common"]) .dfo-quick-name { color:var(--dfo-quick-rar); }
.dfo-quick-card>.dfo-item-material { display:flex; flex-wrap:wrap; justify-content:space-between; gap:2px 8px; margin:0 0 6px; font-size:11px; line-height:1.3; color:#b7a071; }
.dfo-quick-primary { display:flex; align-items:baseline; justify-content:space-between; gap:8px; margin:0 0 6px; padding:0 0 5px; border-bottom:1px solid #454534; }
.dfo-quick-primary>span { font-size:11px; color:var(--dim,#a89f88); }
.dfo-quick-primary>strong { font:400 18px/1.1 'DFO Flexi',var(--data,monospace); color:var(--bone,#e9e4d9); white-space:nowrap; }
.dfo-quick-stats { display:block; margin:0; padding:0; }
.dfo-quick-stats>.pair { display:flex; justify-content:space-between; gap:8px; margin:0 0 3px; }
.dfo-quick-stats>.pair>dt { margin:0; font:inherit; color:var(--dim,#a89f88); }
.dfo-quick-stats>.pair>dd { margin:0; min-width:0; text-align:right; overflow-wrap:anywhere; }
.dfo-quick-note { margin:0 0 3px; color:#a49a80; }
.dfo-quick-price { display:flex; justify-content:flex-end; align-items:center; gap:6px; margin:6px 0 0; padding:6px 0 0; border-top:1px solid #756346; color:#f5d451; }
.dfo-quick-price>.dfo-item-price-value { font-size:17px; }
.dfo-quick-price>.dfo-item-coin { width:16px; height:16px; }
`;

  function install(win) {
    if (win.__DFO_MOD_CFG__?.itemCards?.enabled === false || win.__dfoItemCards) return;
    const doc = win.document, native = {}, states = new WeakMap(), pending = new Set(), active = new Map();
    const fontRoot = new URL('.', doc.currentScript?.src || new URL('dfo-mod/dfo_item_cards.js', doc.baseURI || win.location.href)).href;
    const fontFaces = [['DFO Greengoth','title','ttf'],['DFO Flexi','numbers','ttf'],['DFO Gabin','text','ttf'],['DFO Ckazka','sigil','ttf'],['DFO Ritalin','set','ttf'],['DFO Wolga','legendary','otf'],['DFO Flow','description','otf']]
      .map(([family,file,ext])=>`@font-face{font-family:'${family}';src:url(${JSON.stringify(new URL('item-font-'+file+'.'+ext,fontRoot).href)}) format('${ext==='otf'?'opentype':'truetype'}');font-style:normal;font-weight:400;font-display:swap;}`).join('\n');
    const counters = { dressed: 0, quick: 0, failures: 0, lastError: '', layouts: 0, balances: 0, balanceTrials: 0, placements: 0, observerCallbacks: 0 };
    let scheduled = false, effectLabelKey='',effectLabelNames=[];
    const node = (tag, cls, text) => {
      const value = doc.createElement(tag);
      if (cls) value.className = cls;
      if (text != null) value.textContent = String(text);
      return value;
    };
    // The RU runtime translates textContent synchronously, before the shared native builder returns.
    const said = text => node('span', null, text).textContent;
    // The locale's own digits: «1 370» in Russian, "1,370" in English.
    const format = number => (win.__dfoUi ? win.__dfoUi.number(number, { maximumFractionDigits: 2 }) : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(number));
    const ready = () => DATA_KEYS.every(key => typeof native[key] === 'function');
    const addPair = (list, label, value) => {
      if (value == null || value === '') return;
      const pair = node('div', 'pair'); pair.append(node('dt', null, label), node('dd', null, value)); list.append(pair);
    };
    const ensureStyle = () => {
      if (doc.getElementById('dfo-item-cards-style')) return;
      const style = node('style'); style.id = 'dfo-item-cards-style'; style.textContent = (win.__dfoFonts?'':fontFaces) + CSS; (doc.head || doc.documentElement).append(style);
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
      const labels=native.effectLabels?.()||[],key=JSON.stringify([labels,win.__DFO_MOD_CFG__?.ru?.on]);
      if(key!==effectLabelKey){effectLabelKey=key;effectLabelNames=labels.map(label=>said(label).trim().replace(/:$/,'')).filter(Boolean).sort((a,b)=>b.length-a.length);}
      const colored=(into,text,group)=>{for(const part of effectParts(text,group,effectLabelNames)){const span=node('span','dfo-effect-'+part.kind);span.append(doc.createTextNode(part.text));into.append(span);}};
      for (const row of [...list.children]) {
        const original = row.textContent, found = powerName(original);
        const kind = found ? { key:'power',label:T('cards.group.power'),text:original } : effectGroup(original);
        let group = groups.get(kind.key);
        if (!group) {
          const section = node('section','dfo-item-group');section.dataset.group=kind.key;section.append(node('h4',null,kind.label));
          const rows = list.cloneNode(false);section.append(rows);group={section,rows};groups.set(kind.key,group);
        }
        // The accessible line is the complete native sentence; its repeated
        // trigger is written once visually as the group's heading.
        row.setAttribute('aria-label',original);
        if (kind.key==='power') {
          const rest=(original.slice(0,found.at)+original.slice(found.at+found.name.length).replace(/^:\s*/,'')).replace(/\s{2,}/g,' ').trim();
          const detail=node('span','dfo-item-power-detail');colored(detail,rest,'power');
          row.replaceChildren(node('strong','dfo-item-power-name',found.name),detail);
        } else {row.replaceChildren();colored(row,kind.text,kind.key);}
        group.rows.append(row);
      }
      return [...groups.values()].map(g=>g.section);
    }

    // The material under the name - its label sand, its value in the metal's colour - the card's and the quick panel's.
    function materialRow(data) {
      const row=node('div','dfo-item-material'),value=node('span','dfo-item-metal',data.material),palette=materialPalette[data.materialKey];
      row.append(node('span','dfo-item-material-label',T('cards.material')),value);
      value.dataset.metal=data.materialKey||'other';
      if(palette)for(const key of ['color','stroke','shadow'])if(palette[key])value.style.setProperty('--dfo-metal-'+key,palette[key]);
      return row;
    }
    function coinMark() {
      const coin=doc.createElementNS('http://www.w3.org/2000/svg','svg');
      coin.setAttribute('viewBox','0 0 20 20');coin.setAttribute('class','dfo-item-coin');coin.setAttribute('aria-hidden','true');
      for(const [tag,attributes]of [['circle',{cx:10,cy:10,r:8,fill:'#8e6118',stroke:'currentColor','stroke-width':1.5}],['circle',{cx:10,cy:10,r:5.5,fill:'#c99a2d',stroke:'#f8df80','stroke-width':.8}],['path',{d:'M8 6.5h2.2c4 0 4 7 0 7H8zm1-1.5v10',fill:'none',stroke:'#805313','stroke-width':1.4}]]){
        const part=doc.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value]of Object.entries(attributes))part.setAttribute(key,String(value));coin.append(part);
      }
      return coin;
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
            if (list.children.length) rightNative.push(...groupedPowers(list,data));
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
        if(data.material)head.append(title,materialRow(data));else head.append(title);
        left.append(head);
        if (primary) {
          const badge = node('div', 'dfo-item-primary');
          badge.append(node('span', null, primary.querySelector('dt')?.textContent), node('strong', null, primary.querySelector('dd')?.textContent));
          left.append(badge);
        }
        const materialRows=node('dl');
        addPair(materialRows, T('cards.slot'), data.slot);
        addPair(materialRows, T('cards.skill'), data.skill);
        if (data.construction && data.construction !== data.material) addPair(materialRows, T('cards.construction'), data.construction);
        if(materialRows.children.length)stats.prepend(...materialRows.children);
        if (data.count > 1) addPair(stats, T('cards.quantity'), format(data.count));
        const pricePerKg = nearestTen(data.perKg);
        if (pricePerKg != null) addPair(stats, T('cards.perKg'), T('cards.perKgValue', { value: format(pricePerKg), n: pricePerKg }));
        for(const pair of stats.children)if([said('Condition'),said('Worn'),T('cards.perKg')].includes(pair.querySelector('dt')?.textContent))pair.dataset.divider='';
        if(stats.children.length)left.append(node('h4','dfo-item-stat-heading',T('cards.general')));
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
        priceBox.append(priceValue,coinMark());
        const text = description(line.item, data, card.dataset.rarity === 'rare' && !!tier && isPerfect(tier));
        if (text) footer.append(text);
        footer.append(priceBox);
        // A native render is a snapshot: sizing must not repeatedly read game rules or mix a fresh price with old stats.
        const state = { main, left, effects, overflow, blocks: [...effects.children], footer, priceBox, priceValue, dirty: true, host: null };
        price(state, data);
        into.replaceChildren(main, footer);
        const corners=node('div','dfo-item-corners');corners.setAttribute('aria-hidden','true');for(let i=0;i<4;i++)corners.append(node('i'));into.append(corners);
        card.classList.add('dfo-item-card');
        states.set(card, state); counters.dressed++;
        ensureStyle();
        // Initial construction can be detached. The native fit call performs the connected measurement.
        card.style.width = Math.min(600, Math.max(1, (win.innerWidth || 1920) - 16)) + 'px';
      } catch (error) {
        into.replaceChildren(...original); card.classList.remove('dfo-item-card'); states.delete(card);
        counters.failures++; counters.lastError = String(error?.message || error);
      }
    }

    function hostOf(card) { return card.closest('.inv-tip,.packdetail'); }
    function viewport() {
      const v = win.visualViewport;
      const width = Math.max(0, Math.min(win.innerWidth, v?.width ?? win.innerWidth));
      const height = Math.max(0, Math.min(win.innerHeight, v?.height ?? win.innerHeight));
      const pad = Math.min(8, width / 4, height / 4);
      return { left: (v?.offsetLeft || 0) + pad, top: (v?.offsetTop || 0) + pad,
        width: Math.max(0, width - pad * 2), height: Math.max(0, height - pad * 2) };
    }
    function extent(host) {
      const box = host.getBoundingClientRect();
      const sx = host.offsetWidth ? box.width / host.offsetWidth : 1;
      const sy = host.offsetHeight ? box.height / host.offsetHeight : 1;
      // Include native chrome, actions, wallet/binder sheets and any unbroken overflowing labels.
      return { box, width: Math.max(box.width, host.scrollWidth * sx), height: Math.max(box.height, host.scrollHeight * sy) };
    }
    const shape = host => {
      const e = extent(host);
      return [e.width.toFixed(2), e.height.toFixed(2), host.offsetWidth, host.offsetHeight].join(':');
    };
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
        if (moved) fit(card, shape(host) !== state.shape);
      });
      for (let parent = host; parent; parent = parent.parentElement) {
        position.observe(parent, { attributes: true, attributeFilter: ['style', 'class'], childList: true });
      }
      state.observers.push(position);
      if (win.ResizeObserver) {
        const resized = new win.ResizeObserver(() => {
          counters.observerCallbacks++;
          if (!card.isConnected) return release(card, state);
          if (shape(host) !== state.shape) fit(card, true);
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
        const height = () => Math.max(left.getBoundingClientRect().height, effects.getBoundingClientRect().height);
        let bestHeight = height(), split = blocks.length;
        if (effects.getBoundingClientRect().height <= left.getBoundingClientRect().height + 1) return;
        // Only whole, contiguous suffixes may move. Measure at the actual narrower
        // left-column width; estimating by the right-column height misses wrapping.
        for (let at = blocks.length - 1; at > 0; at--) {
          overflow.prepend(blocks[at]); counters.balanceTrials++;
          const candidate = height();
          if (candidate < bestHeight - .5 && overflow.scrollWidth <= overflow.clientWidth + 1) { bestHeight = candidate; split = at; }
        }
        for (let at = 0; at < split; at++) if (blocks[at].parentElement !== effects) effects.append(blocks[at]);
      } finally { left.style.alignSelf = oldLeft; effects.style.alignSelf = oldRight; }
    }
    function measure(card, state, host, view) {
      counters.layouts++;
      // Reset emergency zoom before measuring; ordinary Full HD cards keep their original text size.
      host.style.zoom = '1';
      const initial = host.getBoundingClientRect();
      const parentScale = host.offsetWidth ? initial.width / host.offsetWidth : 1;
      const limit = Math.max(320, view.width / (parentScale || 1));
      const widths = [...new Set([600, 640, 700, 740].map(width => Math.min(width, limit)))];
      for (const width of widths) {
        card.style.width = width + 'px';
        state.main.style.gridTemplateColumns = Math.min(260, Math.round(width * 0.44)) + 'px minmax(0,1fr)';
        balance(state);
        if (extent(host).height <= Math.min(960, view.height)) break;
      }
      const size = extent(host);
      const zoom = Math.min(1, view.width / Math.max(1, size.width), view.height / Math.max(1, size.height));
      // Last resort for physically oversized cards: keep every line, with no cropping or inner scrolling.
      host.style.zoom = String(Math.max(0.00001, zoom < 1 ? zoom * 0.998 : 1));
      state.dirty = false;
    }
    function place(host, view) {
      counters.placements++;
      for (let attempt = 0; attempt < 2; attempt++) {
        const e = extent(host), box = e.box;
        const x = Math.max(view.left, Math.min(box.left, view.left + view.width - e.width));
        const y = Math.max(view.top, Math.min(box.top, view.top + view.height - e.height));
        const dx = x - box.left, dy = y - box.top;
        if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) break;
        const left = Number.parseFloat(host.style.left) || host.offsetLeft || 0;
        const top = Number.parseFloat(host.style.top) || host.offsetTop || 0;
        // Measure the coordinate conversion, including CSS zoom and scaled containing blocks.
        // The probe and correction run synchronously before paint; the probe is never visible.
        host.style.left = left + 16 + 'px'; host.style.top = top + 16 + 'px';
        const moved = host.getBoundingClientRect();
        const sx = (moved.left - box.left) / 16 || 1, sy = (moved.top - box.top) / 16 || 1;
        host.style.left = left + dx / sx + 'px'; host.style.top = top + dy / sy + 'px';
      }
    }
    function fit(card, dirty = false) {
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
        if (state.dirty || dirty || contentChanged || state.view !== key) measure(card, state, host, view);
        place(host, view);
        // Account for fractional layout rounding and unusual overflowing native rows after zoom.
        const e = extent(host);
        if (e.width > view.width + 0.05 || e.height > view.height + 0.05) {
          host.style.zoom = String((Number(host.style.zoom) || 1) * Math.min(view.width / e.width, view.height / e.height) * 0.998);
          place(host, view);
        }
        if (host.style.visibility !== 'visible') host.style.visibility = 'visible';
        state.view = key; state.shape = shape(host); state.styleStamp = host.style.cssText; state.classStamp = host.className;
        // Moving our own blocks is synchronous layout work, not fresh game content.
        state.contentObserver?.takeRecords();
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
      for (const [card, state] of active) {
        if (card.isConnected) fit(card, shape(state.host) !== state.shape); else release(card, state);
      }
    };
    const reposition = () => { for (const [card, state] of active) { if (card.isConnected) fit(card); else release(card, state); } };
    win.addEventListener('resize', refresh);
    win.addEventListener('scroll', reposition, { capture: true, passive: true });
    win.visualViewport?.addEventListener('resize', refresh);
    win.visualViewport?.addEventListener('scroll', reposition);
    doc.fonts?.addEventListener?.('loadingdone', () => { for (const [card] of active) if(card.isConnected)fit(card,true); });
    win.__dfoItemCards = Object.freeze({
      register(parts) { for (const key of [...DATA_KEYS,'power','effectLabels','slotName','handsName','weaponSkill','letterWorth']) if (typeof parts?.[key] === 'function') native[key] = parts[key]; },
      dress,
      quick,
      // The native second argument is room in pixels, not our internal dirty/invalidation flag.
      fitCard(card) {
        const state = states.get(card);
        if (!state) return false;
        const host = hostOf(card);
        return fit(card, !!(state?.shape && host && shape(host) !== state.shape));
      },
      fitTip(host) { const card = host?.querySelector('.dfo-item-card'); return card ? fit(card) : false; },
      stats: () => ({ ...counters, ready: ready(), active: active.size, pending: pending.size }),
    });
  }
  return { derive, effectGroup, effectParts, materialPalette, install, CSS };
});
