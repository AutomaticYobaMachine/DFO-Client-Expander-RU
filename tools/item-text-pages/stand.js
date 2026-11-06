/* Interactive stand for item descriptions: builds an item and its facts from the controls and asks the mod's own
   generator (dfo_item_text.js) for the description, exactly as the card will. Data: window.STAND, API: window.DfoText. */
(() => {
  'use strict';
  const D = window.STAND, T = window.DfoText;
  const $ = id => document.getElementById(id);
  const el = (tag, attrs = {}, ...kids) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v; else if (k === 'text') node.textContent = v; else node.setAttribute(k, v);
    }
    for (const kid of kids) if (kid != null) node.append(kid);
    return node;
  };
  const option = (value, label) => el('option', { value, text: label });
  const fill = (select, items, empty) => {
    select.replaceChildren(...(empty ? [option('', empty)] : []), ...items.map(([v, l]) => option(v, l)));
  };

  // ── static options ──
  const byFile = new Map();
  for (const t of D.templates) { if (!byFile.has(t.file)) byFile.set(t.file, []); byFile.get(t.file).push(t); }
  function fillTemplates(filter = '') {
    const q = filter.trim().toLowerCase(), select = $('template'), keep = select.value;
    select.replaceChildren();
    for (const [file, list] of byFile) {
      const rows = list.filter(t => !q || `${t.index} ${t.name} ${t.ruName}`.toLowerCase().includes(q));
      if (!rows.length) continue;
      const group = el('optgroup', { label: D.files[file] || file });
      for (const t of rows) group.append(option(String(t.index), `${t.ruName} · ${t.name} · ${t.index}`));
      select.append(group);
    }
    if ([...select.options].some(o => o.value === keep)) select.value = keep;
  }
  fill($('material'), D.materials.map(m => [m.id, m.label]), 'не показан игрой');
  fill($('armorType'), [['leather', 'Кожа (Leather)'], ['chain', 'Кольчуга (Chain)'], ['plate', 'Латы (Plate)']], 'не показан');
  fill($('construction'), [['mail', 'Mail (RRI, кольчуга по металлу)'], ['brigandine', 'Brigandine (RRI)']], 'нет');
  fill($('rarity'), Object.entries(D.rarities).map(([id, r]) => [id, r.label]));
  fill($('record'), D.legendaries.map(l => [l.id, `${l.name}${l.gilded ? ' (золочёная)' : ''}`]), 'нет');
  fill($('setId'), D.sets.map(s => [s.id, s.name]), 'нет');
  fill($('stage'), D.stages.map((s, i) => [String(s.xp), `${i}: ${s.name} (${s.xp} xp)`]));
  fill($('affixPick'), D.affixes.map(a => [a.value, a.label]));
  fill($('enchantPick'), D.enchants.map(e => [e.value, e.label]));
  for (const id of ['socket1', 'socket2', 'socket3']) fill($(id), [['empty', 'пустое гнездо'], ...D.gems.map(g => [g, g])], 'нет');
  fill($('quality'), D.quality.map((q, i) => [String(i), `${i}: ${q}`]), 'не ремесленная');
  fill($('food'), D.food.map((f, i) => [String(i), `${i}: ${f}`]), 'не еда');
  fill($('dye'), D.dyes.map((d, i) => [String(i), `${i}: ${d}`]), 'нет');
  fill($('curse'), [['cursed', 'проклятие (Bad Rep With: Commoners)'], ['damned', 'неснимаемое (Health Leech)']], 'нет');
  fill($('poison'), [['128', 'яд 128 (Nux Vomica)'], ['129', 'яд 129 (Arsenic)']], 'нет');
  fillTemplates();

  // ── lines (affixes, enchantments) as removable chips ──
  let affixes = [], enchants = [];
  function chips(holder, list, labels, remove) {
    holder.replaceChildren(...list.map((v, i) => {
      const x = el('button', { type: 'button', 'aria-label': 'Убрать', text: '×' });
      x.addEventListener('click', () => { remove(i); render(); });
      return el('span', { class: 'chip' }, labels.get(v) || v, x);
    }));
    if (!list.length) holder.append(el('span', { class: 'hint', text: 'нет' }));
  }
  const affixLabels = new Map(D.affixes.map(a => [a.value, a.label])), enchantLabels = new Map(D.enchants.map(e => [e.value, e.label]));
  $('affixAdd').addEventListener('click', () => { const v = $('affixPick').value; if (v && !affixes.includes(v)) affixes.push(v); render(); });
  $('enchantAdd').addEventListener('click', () => { const v = $('enchantPick').value; if (v && !enchants.includes(v)) enchants.push(v); render(); });

  // ── state -> item and facts, the way the card will hand them over ──
  let seed = null, locale = 'ru';
  function current() {
    const t = D.templates.find(x => String(x.index) === $('template').value) || D.templates[0];
    const item = { templateIndex: t.index, group: t.groups[0], uid: `stand-${t.index}` };
    const rarity = $('rarity').value;
    if (rarity !== 'common') item.rarity = rarity;
    if ($('exalted').checked) item.exalted = true;
    if ($('imbued').checked) item.imbued = true;
    const record = D.legendaries.find(l => l.id === $('record').value);
    if (record) item[record.gilded ? 'gilded' : 'legendary'] = record.id;
    const sigilPower = $('sigilPower').checked, setId = $('setId').value;
    if (sigilPower || setId) item.sigil = { xp: Number($('stage').value), party: 1, ...(sigilPower ? { power: 6 } : {}), ...(setId ? { set: setId } : {}) };
    item.affixes = affixes.map(v => { const [id, param] = v.split(':'); return param == null ? { id, value: 5 } : { id, param: /^\d+$/.test(param) ? Number(param) : param, value: 5 }; });
    item.enchantments = enchants.map(v => { const [type, param] = v.split(':').map(Number); return { type, param: Number.isFinite(param) ? param : -1 }; });
    if ($('curse').value === 'cursed') { item.cursed = { type: 25, param: 0 }; item.enchantments.push({ type: 25, param: 0 }); }
    if ($('curse').value === 'damned') { item.cursed = { type: 21, param: 0 }; item.enchantments.push({ type: 21, param: 0 }); }
    const sockets = ['socket1', 'socket2', 'socket3'].map(id => $(id).value).filter(Boolean);
    if (sockets.length) item.sockets = sockets;
    if ($('quality').value) item.quality = Number($('quality').value);
    if ($('maker').value.trim()) item.maker = $('maker').value.trim();
    if ($('house').value.trim()) item.heirloom = { house: $('house').value.trim(), gen: 1 };
    if ($('honed').checked) item.honed = 2;
    if ($('reforged').checked) item.reforges = 1;
    if ($('potion').checked) item.potionRecipeKey = 7;
    if ($('potent').checked) item.potent = 25;
    if ($('soul').checked) item.trappedSoulType = 16;
    if ($('poison').value) item.poisonType = Number($('poison').value);
    if ($('food').value) item.foodStage = Number($('food').value);
    if ($('noRot').checked) item.noRot = true;
    if ($('chef').checked) item.chef = true;
    if ($('dye').value) item.dye = Number($('dye').value);
    if ($('wearOn').checked) { item.maxCondition = 1000; item.currentCondition = Math.round(Number($('wear').value) * 10); }
    if ($('quest').checked) item.questItem = true;
    if ($('stolen').checked) item.stolen = true;
    const facts = { known: $('known').checked, perfect: $('perfect').checked };
    if ($('guild').checked) facts.guild = true;
    if ($('material').value) facts.material = $('material').value;
    if ($('armorType').value) facts.armorType = $('armorType').value;
    if ($('construction').value) facts.construction = $('construction').value;
    return { t, item, facts };
  }

  function render() {
    chips($('affixList'), affixes, affixLabels, i => affixes.splice(i, 1));
    chips($('enchantList'), enchants, enchantLabels, i => enchants.splice(i, 1));
    $('wearValue').textContent = $('wearOn').checked ? `${$('wear').value}%` : 'нет поля';
    const { t, item, facts } = current(), pack = D.packs[locale];
    const out = T.describe(pack, item, facts, seed == null ? {} : { seed });
    const all = T.describe(pack, item, facts, { all: true });
    // card head
    const rarity = D.rarities[item.rarity || 'common'];
    $('card').style.setProperty('--rar', rarity.colour);
    $('cardTier').textContent = item.rarity ? (item.exalted && item.rarity === 'legendary' ? 'Exalted Legendary' : facts.perfect && item.rarity === 'rare' && facts.known ? 'Perfect Rare' : rarity.label) : '';
    const record = D.legendaries.find(l => l.id === (item.legendary || item.gilded));
    $('cardName').textContent = record && facts.known ? record.name : (locale === 'ru' ? t.ruName : t.name);
    $('cardMaterial').hidden = !facts.material;
    $('cardMetal').textContent = facts.material ? (D.materials.find(m => m.id === facts.material)?.label || facts.material) : '';
    // The description is one paragraph; the hint comes after one blank line, in white.
    const said = list => list.map(f => f.text).join(' ');
    $('descBody').textContent = said(out.filter(f => f.category !== 'hint'));
    $('descTip').textContent = said(out.filter(f => f.category === 'hint'));
    $('desc').classList.toggle('none', !out.length);
    // slots
    const slots = $('slots');
    slots.replaceChildren();
    for (const step of pack.rules.queue) {
      const here = out.filter(x => x.slot === step.slot);
      const title = D.slotTitles[step.slot];
      const what = el('div', { class: 'what' }, el('span', { text: title }));
      for (const f of here) what.append(el('code', { text: f.key }));
      slots.append(el('div', { class: `slot${here.length ? '' : ' empty'}${step.take === 'hint' ? ' tip' : ''}` }, el('b', { text: String(step.slot) }), what,
        el('div', { class: 'text', text: here.length ? here.map(f => f.text).join(' ') : 'пусто: у предмета нет подходящего фрагмента' })));
    }
    $('seedLabel').textContent = seed == null ? 'случайный выбор: по предмету' : `случайный выбор: вариант ${seed}`;
    // every candidate
    const picked = new Set(out.map(f => f.key));
    const titles = new Map(pack.rules.categories.map(c => [c.id, c.title]));
    $('allRows').replaceChildren(...all.map(f => el('tr', { class: `${picked.has(f.key) ? 'picked' : ''}${f.category === 'hint' ? ' tip' : ''}` },
      el('td', { text: (picked.has(f.key) ? '● ' : '') + (titles.get(f.category) || f.category || '—') }), el('td', {}, el('code', { text: f.key })), el('td', { text: f.text }))));
    $('allCount').textContent = `${all.length} фрагментов, в описании ${out.filter(f => f.category !== 'hint').length}, в подсказке ${out.filter(f => f.category === 'hint').length}`;
  }

  // ── presets: real item shapes from the game's tables, marked as examples ──
  function applyPreset(p) {
    $('templateSearch').value = ''; fillTemplates();
    const set = (id, v) => { const node = $(id); if (node.type === 'checkbox') node.checked = !!v; else node.value = v ?? ''; };
    for (const id of ['material', 'armorType', 'construction', 'record', 'setId', 'curse', 'socket1', 'socket2', 'socket3', 'quality', 'maker', 'house', 'poison', 'food', 'dye']) set(id, '');
    for (const id of ['exalted', 'imbued', 'perfect', 'sigilPower', 'honed', 'reforged', 'potion', 'potent', 'soul', 'noRot', 'chef', 'quest', 'stolen', 'guild', 'wearOn']) set(id, false);
    set('known', true); set('rarity', 'common'); set('stage', '0'); set('wear', 100);
    for (const [k, v] of Object.entries(p.set)) set(k, v);
    affixes = [...(p.affixes || [])]; enchants = [...(p.enchants || [])]; seed = null;
    render();
  }
  $('presets').replaceChildren(...D.presets.map(p => {
    const b = el('button', { type: 'button', class: 'act', text: p.label });
    b.addEventListener('click', () => applyPreset(p));
    return b;
  }));

  // ── wiring ──
  $('templateSearch').addEventListener('input', e => { fillTemplates(e.target.value); render(); });
  document.querySelector('.controls').addEventListener('input', e => { if (e.target.id !== 'templateSearch') render(); });
  document.querySelector('.controls').addEventListener('change', () => render());
  $('reroll').addEventListener('click', () => { seed = seed == null ? 1 : seed + 1; render(); });
  $('reseed').addEventListener('click', () => { seed = null; render(); });
  for (const b of document.querySelectorAll('.lang button')) b.addEventListener('click', () => {
    locale = b.dataset.locale;
    for (const x of document.querySelectorAll('.lang button')) x.setAttribute('aria-pressed', String(x === b));
    render();
  });
  applyPreset(D.presets[0]);
})();
