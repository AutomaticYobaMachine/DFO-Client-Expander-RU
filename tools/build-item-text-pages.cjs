#!/usr/bin/env node
'use strict';
// Builds the item-description review documents from the description tables, so they never drift from the data:
//   docs/item-text-stand.html     - interactive stand: build an item, read its description in the description face
//   docs/item-text-registry.docx  - every fragment, grouped by the description's queue, with what it depends on (Word)
// node tools/build-item-text-pages.cjs [--artifact-dir <dir>]   (also writes a body-only stand for publishing)
// The stand is self-contained: the mod's generator, both locales and the fonts are inlined; nothing is fetched.
// The registry is written by tools/item-text-pages/docx.cjs with fixed timestamps: the same tables, the same file.
const fs = require('node:fs'), path = require('node:path');
const text = require('../src/mod/item-text.cjs');
const gen = require('../src/mod/page/dfo_item_text.js');
const word = require('./item-text-pages/docx.cjs');

const ROOT = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/item-field-catalog.json'), 'utf8'));
const packs = { en: text.loadLocale(path.join(text.ROOT, 'en')), ru: text.loadLocale(path.join(text.ROOT, 'ru')) };
const raw = (locale, rel) => text.readTable(path.join(text.ROOT, locale, rel)).rows;

const json = v => JSON.stringify(v).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16));
const fontFace = (family, file, format) => `@font-face{font-family:'${family}';src:url(data:font/${format === 'opentype' ? 'otf' : 'ttf'};base64,${fs.readFileSync(path.join(ROOT, file)).toString('base64')}) format('${format}');font-weight:400;font-style:normal;font-display:block;}`;
const FONTS = [
  fontFace('DFO Flow', 'docs/fonts/item-font-description.otf', 'opentype'),
  fontFace('DFO Greengoth', 'src/mod/fonts/item-font-title.ttf', 'truetype'),
  fontFace('DFO Gabin', 'src/mod/fonts/item-font-text.ttf', 'truetype'),
].join('\n');

// ── shared reference data ──
const FILE_TITLES = { weapons: 'Оружие', armor: 'Броня и щиты', clothing: 'Одежда', jewellery: 'Украшения', gems: 'Самоцветы',
  ingredients: 'Ингредиенты', materials: 'Ремесленные материалы и товары', provisions: 'Провизия', gear: 'Снаряжение и утварь',
  furniture: 'Мебель', religious: 'Религиозное', documents: 'Книги, карты, документы', transport: 'Транспорт', curios: 'Особые вещи' };
const FILE_ORDER = Object.keys(FILE_TITLES);
const fileOf = new Map();
for (const rel of JSON.parse(fs.readFileSync(path.join(text.ROOT, 'ru', 'index.json'), 'utf8')).bases) {
  const file = path.basename(rel, '.csv');
  for (const row of raw('ru', rel)) fileOf.set(row.key, file);
}
const templates = catalog.knownPublicTemplates.map(t => ({ index: t.index, name: t.name, ruName: packs.ru.bases[t.index].name,
  groups: [...new Set(t.groups.length ? t.groups : ['UselessItems2'])], file: fileOf.get(String(t.index)) }))
  .sort((a, b) => FILE_ORDER.indexOf(a.file) - FILE_ORDER.indexOf(b.file) || a.index - b.index);
const METAL_RU = { iron: 'Железо', steel: 'Сталь', silver: 'Серебро', elven: 'Эльфийский металл', dwarven: 'Двемерский металл',
  mithril: 'Мифрил', adamantium: 'Адамантит', ebony: 'Эбонит', orcish: 'Орочий металл', daedric: 'Даэдрический металл' };
const materials = [...Object.entries(METAL_RU).map(([id, label]) => ({ id, label })),
  { id: 'leather', label: 'Кожа' }, { id: 'chain', label: 'Кольчуга без указанного металла' }, { id: 'fur', label: 'Мех (RRI)' }, { id: 'cloth', label: 'Ткань (обмотки)' }];
const skills = catalog.enums.skills;
const affixMeaning = Object.fromEntries(catalog.affixes.map(a => [a.id, a.meaning]));
const techniqueNames = Object.fromEntries(Object.entries(catalog.records.techniques).map(([k, v]) => [k, v.name]));
const affixOptions = [];
for (const [id, kind] of Object.entries(catalog.enums.affixes)) {
  if (kind.technique) { for (const t of kind.params) affixOptions.push({ value: `technique:${t}`, label: `Техника: ${techniqueNames[t]}` }); continue; }
  if (!kind.params) { affixOptions.push({ value: id, label: affixMeaning[id] || id }); continue; }
  for (const p of kind.params) affixOptions.push({ value: `${id}:${p}`, label: `${affixMeaning[id] || id}: ${id === 'skill' ? skills[p] : p}` });
}
const enchantOptions = [];
for (const e of catalog.records.enchants) {
  if (e.type < 0) continue;
  if (!e.params.length) { enchantOptions.push({ value: `${e.type}`, label: `${e.name}` }); continue; }
  for (const p of e.params) enchantOptions.push({ value: `${e.type}:${p.value}`, label: p.label ? `${e.name}: ${p.label}` : e.name });
}
const powerName = Object.fromEntries(catalog.records.powers.map(p => [p.id, p.power.name]));
const legendaryRows = raw('en', 'combos/legendaries.csv');
const recordName = Object.fromEntries([...catalog.records.legendaries, ...catalog.records.gilded].map(r => [r.id, r.name]));
recordName['resonant-maul'] = 'The Resonant Maul';
const gildedIds = new Set(catalog.records.gilded.map(g => g.id));
const legendaries = legendaryRows.map(r => ({ id: r.key, name: recordName[r.key] || r.key, gilded: gildedIds.has(r.key), templates: r.templates.split(/\s+/).map(Number) }));
const SLOT_TITLES = { 1: 'Вещь + тип брони + материал / вещь + материал / вещь', 2: 'Редкость + сигил + набор / редкость + сигил / редкость + набор / редкость',
  3: 'Случайно: сила, техника, аффиксы и чары, содержимое, материал, рост сигила', 4: 'Случайно: сила, техника, аффиксы и чары, содержимое, материал, рост сигила',
  5: 'Случайно: техника, ремесло, камни, скрытые чары или проклятие', 6: 'Износ (только то, что надевается)', 7: 'Краденое (отдельной строкой, красным)',
  8: 'Подсказка игроку: что делать с вещью (отдельный абзац, белым; серебро и гильдия — второе предложение)' };

// ── the stand ──
function standBody() {
  const presets = [
    { label: 'Легендарная дай-катана', set: { template: '123', rarity: 'legendary', record: 'warp-edge', material: 'daedric', sigilPower: true, setId: 'oath', stage: '37500', stolen: true, wearOn: true, wear: 90 },
      affixes: ['damage', 'stat:strength', 'technique:whirlwind'], enchants: ['2:20'] },
    { label: 'Эфирные поножи Руна', set: { template: '104', rarity: 'aetheric', material: 'daedric', armorType: 'plate', setId: 'ruhn', stage: '12500', wearOn: true, wear: 100 }, affixes: ['armor', 'resist:fire'] },
    { label: 'Неопознанный меч с сигилом', set: { template: '120', rarity: 'magic', known: false, sigilPower: true, stage: '0' }, affixes: ['damage'] },
    { label: 'Кольчужный капюшон', set: { template: '107', armorType: 'chain', wearOn: true, wear: 55 } },
    { label: 'Проклятая секира', set: { template: '128', rarity: 'rare', material: 'ebony', curse: 'cursed', stolen: true, wearOn: true, wear: 30 }, affixes: ['damage', 'elemental:fire'] },
    { label: 'Кольцо мастера', set: { template: '135', rarity: 'magic', quality: '4', maker: 'AutomaticYobaMachine', house: 'Iokan' }, affixes: ['focus', 'potency'] },
    { label: 'Меховой колет (RRI)', set: { template: '520', material: 'fur', armorType: 'leather', wearOn: true, wear: 80 } },
    { label: 'Простой стальной меч', set: { template: '120', material: 'steel', wearOn: true, wear: 85 } },
    { label: 'Железная руда, персонаж в гильдии', set: { template: '71', guild: true } },
    { label: 'Сосновое бревно', set: { template: '635' } },
    { label: 'Квестовый тотем', set: { template: '280', quest: true } },
    { label: 'Бутылка с зельем', set: { template: '83', potion: true, potent: true } },
    { label: 'Рагу охотника', set: { template: '685', noRot: true, chef: true } },
    { label: 'Чёрствый хлеб', set: { template: '534', food: '1' } },
  ];
  const data = {
    packs, templates, files: FILE_TITLES, materials, affixes: affixOptions, enchants: enchantOptions, legendaries,
    rarities: Object.fromEntries(Object.entries(catalog.enums.rarities).map(([id, r]) => [id, { label: r.label, colour: r.colour }])),
    sets: Object.entries(packs.en.sets).map(([id, name]) => ({ id, name: `${name} / ${packs.ru.sets[id].replace(/^набора /, '')}` })),
    stages: catalog.enums.sigilStages, gems: catalog.enums.gemKinds, quality: catalog.records.qualityNames,
    food: Object.keys(catalog.records.foodStages), dyes: ['Blue', 'Grey', 'Red', 'Dark Brown', 'Purple', 'Light Brown', 'White', 'Aquamarine', 'Yellow', 'Green'],
    slotTitles: SLOT_TITLES, presets,
  };
  const generator = fs.readFileSync(path.join(ROOT, 'src/mod/page/dfo_item_text.js'), 'utf8');
  const check = (id, label) => `<label><input type="checkbox" id="${id}"> ${label}</label>`;
  const select = (id, label) => `<label class="field" for="${id}">${label}<select id="${id}"></select></label>`;
  return `<title>Стенд описаний предметов</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=PT+Sans:wght@400;700&display=swap">
<style>
${FONTS}
${fs.readFileSync(path.join(__dirname, 'item-text-pages/stand.css'), 'utf8')}
</style>
<div class="page">
 <header class="top">
  <div><h1>Стенд описаний предметов</h1>
  <p>Соберите вещь и её свойства: описание строит генератор мода по той же очереди из семи позиций, что и в игре, а подсказка игроку идёт последней, отдельным абзацем, белым. Свойства карточки здесь не показаны, только описание у цены.</p></div>
  <div class="lang" role="group" aria-label="Язык описаний"><button type="button" data-locale="ru" aria-pressed="true">Русский</button><button type="button" data-locale="en" aria-pressed="false">English</button></div>
 </header>
 <div class="layout">
  <form class="controls" onsubmit="return false">
   <fieldset><legend>Примеры</legend><div class="presets" id="presets"></div></fieldset>
   <fieldset><legend>Вещь</legend>
    <div class="row"><label class="field" for="templateSearch">Поиск по названию или номеру<input type="search" id="templateSearch" placeholder="меч, кираса, 102…"></label></div>
    <div class="row">${select('template', 'Шаблон (templateIndex)')}</div>
    <div class="row">${check('known', 'Опознана')}</div>
   </fieldset>
   <fieldset><legend>Материал и тип брони</legend>
    <div class="row">${select('material', 'Материал')}${select('armorType', 'Тип брони (строка «Тип»)')}${select('construction', 'Конструкция RRI')}</div>
   </fieldset>
   <fieldset><legend>Редкость, сигил, набор</legend>
    <div class="row">${select('rarity', 'Редкость')}${select('record', 'Легендарная или золочёная запись')}</div>
    <div class="row">${check('exalted', 'Exalted')}${check('perfect', 'Perfect (все строки на максимуме)')}${check('imbued', 'Imbue')}</div>
    <div class="row">${check('sigilPower', 'Сигил силы')}${select('setId', 'Набор')}${select('stage', 'Стадия сигила')}</div>
   </fieldset>
   <fieldset><legend>Аффиксы и зачарования</legend>
    <div class="row"><label class="field grow" for="affixPick">Аффикс<select id="affixPick"></select></label><button type="button" class="act" id="affixAdd">Добавить</button></div>
    <div class="chips" id="affixList"></div>
    <div class="row"><label class="field grow" for="enchantPick">Зачарование<select id="enchantPick"></select></label><button type="button" class="act" id="enchantAdd">Добавить</button></div>
    <div class="chips" id="enchantList"></div>
    <div class="row">${select('curse', 'Проклятие')}</div>
   </fieldset>
   <fieldset><legend>Ремесло и гнёзда</legend>
    <div class="row">${select('quality', 'Качество')}<label class="field" for="maker">Мастер<input type="text" id="maker" maxlength="40"></label><label class="field" for="house">Дом реликвии<input type="text" id="house" maxlength="40"></label></div>
    <div class="row">${check('honed', 'Заточена')}${check('reforged', 'Перекована')}</div>
    <div class="row">${select('socket1', 'Гнездо 1')}${select('socket2', 'Гнездо 2')}${select('socket3', 'Гнездо 3')}</div>
   </fieldset>
   <fieldset><legend>Содержимое, еда, окраска</legend>
    <div class="row">${check('potion', 'Ключ рецепта (зелье — только в бутылке)')}${check('potent', 'Усиленное')}${check('soul', 'Душа (только в ловушке душ)')}</div>
    <div class="row">${select('poison', 'Яд на клинке')}${select('food', 'Свежесть')}${select('dye', 'Окраска (вне очереди)')}</div>
    <div class="row">${check('noRot', 'Не портится')}${check('chef', 'Блюдо шефа')}</div>
   </fieldset>
   <fieldset><legend>Износ, состояние, персонаж</legend>
    <div class="row">${check('wearOn', 'Есть поле прочности')}<label class="field grow" for="wear">Прочность <output id="wearValue"></output><input type="range" id="wear" min="0" max="100" step="1" value="100"></label></div>
    <div class="row">${check('quest', 'Квестовое')}${check('stolen', 'Краденое')}${check('guild', 'Персонаж в гильдии')}</div>
   </fieldset>
  </form>
  <div class="preview">
   <div class="card" id="card">
    <div class="card-head"><div class="card-tier" id="cardTier"></div><h3 class="card-name" id="cardName"></h3>
     <div class="card-material" id="cardMaterial"><span>Материал</span><span id="cardMetal"></span></div></div>
    <div class="card-body">Здесь в игре свойства, сравнение, сигил и набор.</div>
    <div class="card-foot"><p class="desc" id="desc" data-empty="Нет описания: шаблона нет в таблицах."><span class="body" id="descBody"></span><span class="stolen" id="descStolen"></span><span class="tip" id="descTip"></span></p><span class="price" aria-hidden="true">~ цена</span></div>
   </div>
   <div class="row"><button type="button" class="act" id="reroll">Другой случайный выбор</button><button type="button" class="act" id="reseed">Как в игре</button><span class="hint" id="seedLabel"></span></div>
   <section class="slots" aria-label="Очередь фрагментов"><h2><span>Очередь фрагментов</span></h2><div id="slots"></div></section>
   <section class="all"><h2><span>Все подходящие фрагменты</span><span id="allCount"></span></h2>
    <div><table><thead><tr><th>Группа</th><th>Ключ</th><th>Фрагмент</th></tr></thead><tbody id="allRows"></tbody></table></div></section>
  </div>
 </div>
</div>
<script>window.STAND=${json(data)};</script>
<script>window.DfoText=(function(){var module={exports:{}};
${generator}
;return module.exports;})();</script>
<script>
${fs.readFileSync(path.join(__dirname, 'item-text-pages/stand.js'), 'utf8')}
</script>`;
}

// ── the registry (Word) ──
const RU_FORM = { m: 'м', f: 'ж', n: 'ср', p: 'мн' }, EN_FORM = { s: 'ед', p: 'мн' };
const enchantName = Object.fromEntries(catalog.records.enchants.map(e => [e.type, e]));
/** Field names and values are set in a monospace run: \u0001…\u0002 inside a dependency's text. */
const code = s => `\u0001${s}\u0002`;
const esc = s => String(s);
const runsOf = (s, base = {}) => String(s).split(/\u0001|\u0002/).map((t, i) => ({ ...base, text: t, ...(i % 2 ? { mono: true, size: 15 } : {}) })).filter(r => r.text);
const hints = JSON.parse(fs.readFileSync(path.join(text.ROOT, 'hints.json'), 'utf8'));
const hintTemplates = new Map();
for (const [key, hint] of Object.entries(hints.templates)) { if (!hintTemplates.has(hint)) hintTemplates.set(hint, []); hintTemplates.get(hint).push(+key); }
const SILVER_DEPS = {
  writ: 'материал рынка: Предписание Двора (или гильдии) платит серебром — net/marketLaw.js marketCatalogue',
  potion: 'зелье: ремесленное предписание гильдий и храмов', 'dish.fighters': 'рагу охотника, ужин рыбака: предписание Гильдии бойцов',
  'dish.mara': 'фруктовый пирог, пир у очага: предписание храма Мары', kit: 'ремкомплект: предписание Гильдии бойцов',
};
/** The hints the piece's state gives, in the order the generator checks them (dfo_item_text.js hintKey). */
const HINT_STATES = [
  ['hint.quest', `${code('item.questItem')} — прежде всего`],
  ['hint.unidentified', 'не опознана, и у вещи есть скрытая магия'],
  ['hint.damned', `опознана; ${code('item.cursed = Health Leech 0')}`],
  ['hint.cursed', `опознана; ${code('item.cursed')}, другое проклятие`],
  ['hint.repair', 'оружие или броня; прочность ниже 40%'],
  ['hint.artifact', code('item.artifact')],
  ['hint.aetheric', `${code('rarity = aetheric')} или ${code('item.aetheric')}`],
  ['hint.exalted', `${code('rarity = legendary')} и ${code('item.exalted')}`],
  ['hint.legendary', `${code('rarity = legendary')}, ${code('item.legendary')} или ${code('item.gilded')}`],
  ['hint.set', code('sigil.set')],
  ['hint.sigil', `${code('sigil.power')} без набора`],
  ['hint.crafted', `надеваемое; ${code('item.quality')}, ${code('item.maker')} или ${code('item.provenance')}`],
  ['hint.rare', code('rarity = rare')],
  ['hint.magic', code('rarity = magic')],
  ['hint.enchanted', `надеваемое без редкости; ${code('item.magic')} или зачарования DFU`],
  ['hint.food.spoiled', `${code('item.foodStage ≥ 3')} (гнилая или тухлая)`],
  ['hint.soul.filled', `ловушка душ (${code('MiscItems 274')}); ${code('item.trappedSoulType ≥ 0')}`],
];
const HINT_STATE_KEYS = new Set(HINT_STATES.map(([k]) => k));
function depsOf(key) {
  let m;
  if (HINT_STATE_KEYS.has(key)) return HINT_STATES.find(([k]) => k === key)[1];
  if (key === 'hint.sell') return 'запасная: шаблон, которого нет в hints.json';
  if ((m = /^hint\.silver\.(.+?)(\.guild)?$/.exec(key)) && SILVER_DEPS[m[1]]) {
    return `второе предложение после подсказки основы; ${SILVER_DEPS[m[1]]}`
      + (m[1] === 'writ' ? (m[2] ? `; персонаж в гильдии (${code('facts.guild')})` : `; персонаж не в гильдии`) : '');
  }
  if (key.startsWith('hint.')) {
    const list = (hintTemplates.get(key) || []).map(i => templates.find(t => t.index === i)?.ruName || i);
    const shown = [...new Set(list)];
    return `основа (${list.length}): ${esc(shown.slice(0, 10).join(', '))}${shown.length > 10 ? ` и ещё ${shown.length - 10}` : ''}; если состояние вещи не требует другой подсказки`;
  }
  if ((m = /^gear\.(\d+)\.(.+)$/.exec(key))) {
    const name = templates.find(t => t.index === +m[1]);
    const variant = m[2];
    const what = variant === 'weapon' ? 'оружие' : { leather: 'тип брони Leather', chain: 'тип брони Chain', plate: 'тип брони Plate', mail: 'конструкция RRI Mail', brigandine: 'конструкция RRI Brigandine', fur: 'материал Fur (RRI)' }[variant];
    return `${code('templateIndex = ' + m[1])} ${esc(name.ruName)}; ${what}; металл из ${code('facts.material')}, иначе нейтральный`;
  }
  if ((m = /^metal\.(.+)$/.exec(key))) return m[1] === 'unknown' ? 'металл не показан игрой (скрыт, классическая настройка шлема/щита, кольчуга без металла)' : `${code('facts.material = ' + m[1])}`;
  if ((m = /^base\.(\d+)$/.exec(key))) { const t = templates.find(x => x.index === +m[1]); return `${code('templateIndex = ' + m[1])} ${esc(t.groups.join(', '))}; без рамки «вещь + материал»`; }
  if ((m = /^tier\.(\w+)\.(.+)$/.exec(key))) {
    const tier = { perfect: 'rare + Perfect (опознана)', exalted: 'legendary + exalted' }[m[1]] || m[1];
    const parts = m[2].split('.').map(p => (p === 'sigil' ? code('sigil.power') : code('sigil.set') + ' → {set}'));
    return `редкость ${esc(tier)} + ${parts.join(' + ')}; сигил и набор видны и без опознания`;
  }
  if ((m = /^set\.(.+)$/.exec(key))) return `${code('sigil.set = ' + m[1])}; подставляется в {set}`;
  if ((m = /^legendary\.(.+)$/.exec(key))) {
    const l = legendaries.find(x => x.id === m[1]);
    return `опознана; ${code((l.gilded ? 'item.gilded' : 'item.legendary') + ' = ' + m[1])}; сила «${esc(powerName[m[1]] || 'Resonance')}»; {base} — название базы: ${esc(l.templates.map(t => templates.find(x => x.index === t)?.ruName || t).join(', '))}`;
  }
  if ((m = /^combo\./.exec(key))) {
    const combo = packs.ru.combos.find(c => c.key === key);
    return `опознана; одновременно: ${combo.requires.map(r => code(r)).join(' + ')}; заменяет обе отдельные фразы`;
  }
  if ((m = /^rarity\.(.+)$/.exec(key))) {
    const r = m[1];
    if (r === 'imbued') return `опознана; ${code('item.imbued')}`;
    if (r === 'exalted') return `${code('rarity = legendary')} и ${code('item.exalted')}; без сигила и набора`;
    if (r === 'perfect') return `опознана; Perfect Rare; без сигила и набора`;
    return `${code('rarity = ' + r)}; без сигила и набора`;
  }
  if ((m = /^sigil\.set\.(.+)$/.exec(key))) return `${code('sigil.set = ' + m[1])} у вещи без редкости`;
  if (key === 'sigil.power') return `${code('sigil.power')} у вещи без редкости`;
  if ((m = /^sigil\.stage\.(\d)$/.exec(key))) { const st = catalog.enums.sigilStages[+m[1]]; return `${code('sigil.xp ≥ ' + st.xp)} (${esc(st.name)})`; }
  if ((m = /^power\.(.+)$/.exec(key))) return m[1] === 'imprint' ? `опознана; ${code('item.imprint')}` : `опознана; отпечаток ${code('item.imprint = ' + m[1])} (у самой легендарки — её уникальная фраза)`;
  if ((m = /^technique\.(.+)$/.exec(key))) return `опознана; аффикс ${code('technique')} с параметром ${code(m[1])} (${esc(techniqueNames[m[1]])})`;
  if ((m = /^skill\.(\d+)$/.exec(key))) return `опознана; аффикс ${code('skill ' + m[1])} или зачарование ${code('EnhancesSkill ' + m[1])} — ${esc(skills[+m[1]])}`;
  if (key === 'affix.honed') return `опознана; ${code('item.honed ≥ 1')}`;
  if (key === 'affix.reforged') return `опознана; ${code('item.reforges ≥ 1')}`;
  if ((m = /^affix\.(\w+)(?:\.(.+))?$/.exec(key))) return `опознана; аффикс ${code(m[1] + (m[2] ? ' ' + m[2] : ''))} — ${esc(affixMeaning[m[1]] || '')}`;
  if ((m = /^enchantment\.(\d+)(?:\.(\d+))?$/.exec(key))) {
    const e = enchantName[+m[1]], p = m[2] == null ? null : e.params.find(x => x.value === +m[2]);
    return `опознана; зачарование ${code(e.name + ' (' + e.type + ')')}${p ? ' с параметром ' + code(p.label || p.value) : ', любой параметр без своей фразы'}`;
  }
  if ((m = /^craft\.quality\.(\d)$/.exec(key))) return `${code('item.quality = ' + m[1])} (${esc(catalog.records.qualityNames[+m[1]])})`;
  if (key === 'craft.maker') return `${code('item.maker')} → {maker}`;
  if (key === 'craft.marked') return `${code('item.marked')}`;
  if (key === 'heirloom') return `${code('item.heirloom')} без названия дома`;
  if (key === 'heirloom.house') return `${code('item.heirloom.house')} → {house}`;
  if ((m = /^socket\.gem\.(.+)$/.exec(key))) return `опознана; в гнезде камень ${code(m[1])} любой огранки`;
  if (key === 'socket.empty') return 'опознана; хотя бы одно пустое гнездо';
  if (key === 'curse.cursed') return `опознана; ${code('item.cursed')}`;
  if (key === 'curse.damned') return `опознана; ${code('item.cursed = Health Leech 0')}`;
  if (key === 'state.unidentified') return 'не опознана, и у вещи есть скрытая магия';
  if (key === 'content.potion') return `только бутылка зелья ${code('UselessItems1 83')} (поле ${code('potionRecipeKey')} есть у всех вещей и само ничего не значит)`;
  if (key === 'content.potent') return `бутылка зелья; ${code('item.potent')}`;
  if (key === 'content.soul') return `ловушка душ ${code('MiscItems 274')} или Звезда Азуры; ${code('item.trappedSoulType ≥ 0')}`;
  if (key === 'content.poison') return `только оружие; ${code('item.poisonType')}`;
  if ((m = /^food\.stage\.(\d)$/.exec(key))) return `${code('item.foodStage = ' + m[1])} (${esc(Object.keys(catalog.records.foodStages)[+m[1]])})`;
  if ((m = /^food\.(\w+)$/.exec(key))) return `${code('item.' + m[1])}`;
  if ((m = /^condition\.(\w+)$/.exec(key))) return `надеваемое (оружие, броня, украшения, одежда); прочность ${esc({ new: '100%', used: '75–99%', worn: '40–74%', battered: '1–39%', broken: '0%' }[m[1]])}`;
  if (key === 'state.stolen') return `${code('item.stolen')}`;
  if ((m = /^state\.(\w+)$/.exec(key))) return `${code({ bound: 'item.bound', summoned: 'item.timeForItemToDisappear', keepsake: 'item.livingKeepsake', remains: 'item.legacyRemains' }[m[1]] || m[1])}; в очередь не входит`;
  if ((m = /^dye\.(\d)$/.exec(key))) return `одежда; ${code('item.dye = ' + m[1])}; в очередь не входит`;
  if ((m = /^material\.(.+)$/.exec(key))) return `${code('facts.material = ' + m[1])}, только если у вещи нет рамки «вещь + материал»`;
  if ((m = /^construction\.(.+)$/.exec(key))) return `${code('facts.construction = ' + m[1])}, только без рамки`;
  return '';
}

/** Every fragment, in sections that follow the description's queue: [{ id, slot, title, about, rows }]. */
function registrySections() {
  const rules = packs.ru.rules, cat = key => gen.categoryOf(rules, key);
  const sections = [];
  const add = (id, slot, title, about, rows) => sections.push({ id, slot, title, about, rows });
  const propRow = key => ({ key, deps: depsOf(key), ru: packs.ru.properties[key], en: packs.en.properties[key] });
  // slot 1
  const gearRows = Object.keys(packs.ru.gear).map(k => { const [t, v] = k.split(':'); return { key: `gear.${t}.${v || 'weapon'}`, deps: depsOf(`gear.${t}.${v || 'weapon'}`), ru: packs.ru.gear[k], en: packs.en.gear[k], sort: [+t, v] }; })
    .sort((a, b) => a.sort[0] - b.sort[0] || String(a.sort[1]).localeCompare(String(b.sort[1])));
  add('gear', '1', 'Вещь + тип брони + материал / вещь + материал', 'Проверяется первой. У оружия рамка «вещь + материал», у брони — по типу (кожа, кольчуга, латы; RRI: mail, мех, бригантина). Вместо {material} подставляется фраза металла.', gearRows);
  add('metals', '1', 'Металл для подстановки {material}', 'Если игра не показывает металл — нейтральная фраза unknown.',
    Object.keys(packs.ru.metals).map(k => ({ key: `metal.${k}`, deps: depsOf(`metal.${k}`), ru: packs.ru.metals[k], en: packs.en.metals[k] })));
  const baseRows = [];
  for (const file of FILE_ORDER) {
    const list = templates.filter(t => t.file === file);
    baseRows.push({ sub: `${FILE_TITLES[file]} · ${list.length}` });
    for (const t of list) baseRows.push({ key: `base.${t.index}`, deps: depsOf(`base.${t.index}`), ru: packs.ru.bases[t.index].text, en: packs.en.bases[t.index].text,
      ruNote: `${packs.ru.bases[t.index].name} · род ${RU_FORM[packs.ru.bases[t.index].form]}`, enNote: `${t.name} · ${EN_FORM[packs.en.bases[t.index].form]}` });
  }
  add('bases', '1', 'Вещь (основа)', 'Когда рамки нет: всё, что не оружие и не броня, и броня с неизвестным типом. Род основы задаёт форму всех остальных фрагментов.', baseRows);
  // slot 2
  add('tiers', '2', 'Редкость + сигил + набор', 'Порядок проверки: редкость + сигил + набор, редкость + сигил, редкость + набор, редкость. Название набора подставляется в {set}.',
    Object.keys(packs.ru.tiers).map(k => ({ key: k, deps: depsOf(k), ru: packs.ru.tiers[k], en: packs.en.tiers[k] })));
  add('setnames', '2', 'Названия наборов для {set}', 'Русские названия — как их показывает русификация.',
    Object.keys(packs.ru.sets).map(k => ({ key: `set.${k}`, deps: depsOf(`set.${k}`), ru: packs.ru.sets[k], en: packs.en.sets[k] })));
  const props = Object.keys(packs.ru.properties);
  add('rarity', '2', 'Редкость без сигила и набора', '', props.filter(k => cat(k) === 'tier' && k.startsWith('rarity.')).map(propRow));
  add('sigilalone', '2', 'Набор или сигил у вещи без редкости', '', props.filter(k => cat(k) === 'tier' && !k.startsWith('rarity.')).map(propRow));
  // slots 3-5
  add('power', '3–4', 'Именная сила', 'Легендарки и золочёные вещи — уникальная фраза «база + сила» с названием базы в {base}. Отдельная фраза силы — для отпечатка на другой вещи.',
    [...Object.keys(packs.ru.legendaries).map(id => ({ key: `legendary.${id}`, deps: depsOf(`legendary.${id}`), ru: packs.ru.legendaries[id], en: packs.en.legendaries[id] })), ...props.filter(k => cat(k) === 'power').map(propRow)]);
  add('technique', '3–5', 'Техника', 'Может попасть в позиции 3, 4 или 5, но только один раз.', props.filter(k => cat(k) === 'technique').map(propRow));
  const comboRows = c => packs.ru.combos.filter(x => cat(x.key) === c).map(x => ({ key: x.key, deps: depsOf(x.key), ru: x.text, en: packs.en.combos.find(e => e.key === x.key).text }));
  add('lines', '3–4', 'Аффиксы и чары', 'До двух фрагментов на описание. Сочетания заменяют свои части. Около двух пятых фраз эффектов написаны от лица игрока: «Вы чувствуете, как…», «Вы видите…».',
    [{ sub: 'Сочетания' }, ...comboRows('lines'), { sub: 'Аффиксы' }, ...props.filter(k => cat(k) === 'lines' && k.startsWith('affix.')).map(propRow),
      { sub: 'Навыки (аффикс skill и Enhances Skill)' }, ...props.filter(k => k.startsWith('skill.')).map(propRow),
      { sub: 'Зачарования' }, ...props.filter(k => k.startsWith('enchantment.')).map(propRow)]);
  add('contents', '3–4', 'Содержимое и еда', 'До двух фрагментов на описание. Зелье — только в бутылке зелья, душа — только в ловушке душ, яд — только на оружии.', props.filter(k => cat(k) === 'contents').map(propRow));
  add('material', '3–4', 'Отдельная фраза о материале', 'Только у вещи без рамки «вещь + материал»; у оружия и брони материал уже в позиции 1.', props.filter(k => cat(k) === 'material').map(propRow));
  add('growth', '3–4', 'Рост сигила', '', props.filter(k => cat(k) === 'growth').map(propRow));
  add('craft', '5', 'Ремесло, клеймо, наследие, перековка', 'Сочетания заменяют свои части.', [{ sub: 'Сочетания' }, ...comboRows('craft'), { sub: 'Отдельные фрагменты' }, ...props.filter(k => cat(k) === 'craft').map(propRow)]);
  add('sockets', '5', 'Камни в гнёздах', '', props.filter(k => cat(k) === 'sockets').map(propRow));
  add('secret', '5', 'Скрытые чары или проклятие', '', props.filter(k => cat(k) === 'secret').map(propRow));
  // slots 6-8 and the rest
  add('wear', '6', 'Износ', 'Только у того, что надевается; у остальных поле прочности не читается.', props.filter(k => cat(k) === 'wear').map(propRow));
  add('standing', '7', 'Краденое', 'Отдельной строкой сразу под описанием, красным. Квестовое не здесь: о нём говорит подсказка.', props.filter(k => cat(k) === 'standing').map(propRow));
  const hintKeys = props.filter(k => cat(k) === 'hint');
  add('hint', '8', 'Подсказка игроку', 'Всегда последняя, отдельным абзацем после одной пустой строки, белым цветом. Сначала проверяется состояние вещи сверху вниз; если оно ничего не требует — подсказка основы. Для того, за что платят серебром, добавляется второе предложение; у персонажа в гильдии — от лица гильдии.',
    [{ sub: 'Состояние вещи — в порядке проверки' }, ...HINT_STATES.map(([k]) => propRow(k)),
      { sub: 'По основе (hints.json)' }, ...hintKeys.filter(k => !HINT_STATE_KEYS.has(k) && !k.startsWith('hint.silver.')).map(propRow),
      { sub: 'Серебро: второе предложение' }, ...hintKeys.filter(k => k.startsWith('hint.silver.')).map(propRow)]);
  add('unused', '—', 'Вне очереди', 'Фразы есть в таблицах, но в описание сейчас не попадают.', props.filter(k => cat(k) === 'unused').map(propRow));
  return sections;
}

/** The registry as a Word document: landscape tables, a header row repeated on every page. */
function registryDocx() {
  const sections = registrySections();
  const total = sections.reduce((n, s) => n + s.rows.filter(r => !r.sub).length, 0);
  const { para, table } = word;
  const cellText = (runs, extra) => para(runs, { style: 'Cell', ...extra });
  const formsCell = (row, labels) => {
    if (typeof row === 'string') return [cellText(row)];
    const entries = Object.entries(row).filter(([, t]) => t);
    if (entries.length === 1 || entries.every(([, t]) => t === entries[0][1])) return [cellText(entries[0][1])];
    return entries.map(([f, t]) => cellText([{ text: `${labels[f]}  `, bold: true, color: '7D6125' }, t]));
  };
  const WIDTHS = [2700, 3900, 4600, 4198];
  const head = { header: true, cells: ['Ключ', 'Зависит от', 'Русский', 'English'].map(h => [cellText({ text: h, bold: true, color: '5D6470' })]) };
  const rowOf = r => (r.sub ? { band: r.sub } : {
    cells: [
      [cellText({ text: r.key, mono: true, size: 15 }), ...(r.ruNote ? [cellText({ text: r.ruNote, color: '5D6470', size: 15 })] : []), ...(r.enNote ? [cellText({ text: r.enNote, color: '5D6470', size: 15 })] : [])],
      [cellText(runsOf(r.deps, { color: '3A4049' }))],
      formsCell(r.ru, RU_FORM), formsCell(r.en, EN_FORM),
    ],
  });
  const body = [
    para('Реестр фрагментов описаний предметов', { style: 'Title' }),
    para(`Все ${total} фрагментов описаний на двух языках, сгруппированные по очереди описания. Для каждого указано, от каких полей предмета он зависит. Русские фразы даны во всех формах рода основы: м, ж, ср и мн (для слов без единственного числа); английские — ед и мн. Документ собран из таблиц src/mod/item-text командой node tools/build-item-text-pages.cjs; править нужно таблицы, а не этот файл.`),
    para('Очередь описания', { style: 'Heading2' }),
    table([1000, 14398], [{ header: true, cells: [[cellText({ text: '№', bold: true, color: '5D6470' })], [cellText({ text: 'Что попадает в позицию', bold: true, color: '5D6470' })]] },
      ...[1, 2, 3, 4, 5, 6, 7, 8].map(n => ({ cells: [[cellText({ text: String(n), bold: true, color: '2F5F8A' })], [cellText(SLOT_TITLES[n])]] }))]),
    para('Описание — один абзац из позиций 1–6; краденое (позиция 7) — отдельной строкой под ним, красным; подсказка (позиция 8) — после пустой строки, белым. Шрифт описаний в игре — Flow Ext Bold, 12 px.', { spacingAfter: 120 }),
    para('Разделы', { style: 'Heading2' }),
    ...sections.map(s => para([{ text: `Позиция ${s.slot} · `, color: '2F5F8A' }, `${s.title} — ${s.rows.filter(r => !r.sub).length}`], { spacingAfter: 20 })),
  ];
  for (const s of sections) {
    body.push(para([{ text: `Позиция ${s.slot} · `, color: '5D6470' }, `${s.title} `, { text: `(${s.rows.filter(r => !r.sub).length})`, color: '5D6470' }], { style: 'Heading1' }));
    if (s.about) body.push(para({ text: s.about, color: '3A4049' }, { keepNext: true }));
    body.push(table(WIDTHS, [head, ...s.rows.map(rowOf)]));
  }
  return { total, sections, ...word.docx(body.join(''), { title: 'Реестр фрагментов описаний предметов', subject: 'DFO-Client-Expander-RU' }) };
}

const wrap = (body, lang = 'ru') => `<!doctype html>\n<html lang="${lang}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${body}\n</html>\n`;
const pages = { 'item-text-stand.html': standBody() };
const registry = registryDocx();
module.exports = { pages, wrap, registry };
if (require.main === module) {
  for (const [name, body] of Object.entries(pages)) fs.writeFileSync(path.join(ROOT, 'docs', name), wrap(body));
  fs.writeFileSync(path.join(ROOT, 'docs', 'item-text-registry.docx'), registry.buffer);
  const old = path.join(ROOT, 'docs', 'item-text-registry.html');
  if (fs.existsSync(old)) fs.rmSync(old);
  const at = process.argv.indexOf('--artifact-dir');
  if (at > 0) { fs.mkdirSync(process.argv[at + 1], { recursive: true }); for (const [name, body] of Object.entries(pages)) fs.writeFileSync(path.join(process.argv[at + 1], name), body + '\n'); }
  console.log(`${Object.entries(pages).map(([n, b]) => `${n}: ${(b.length / 1024).toFixed(0)} KiB`).join(', ')}, item-text-registry.docx: ${(registry.buffer.length / 1024).toFixed(0)} KiB, ${registry.total} fragments`);
}
