// Display/auto-loot rules contain IDs and settings only, never inventory entities.
(function (root) {
  'use strict';
  const MAX_PRESETS = 100, MAX_TAGS = 4096, MAX_ITEMS = 1024;
  const uniq = (xs, max, size = 1024) => [...new Set((Array.isArray(xs) ? xs : []).filter(x => typeof x === 'string' && x.length > 0 && x.length <= size))].slice(0, max);
  const cleanFilter = f => ({ mode: f?.mode === 'white' ? 'white' : 'black', tags: uniq(f?.tags, MAX_TAGS) });
  const cleanAuto = a => ({ enabled: a?.enabled === true, tags: uniq(a?.tags, MAX_TAGS), items: uniq(a?.items, MAX_ITEMS) });
  const cleanSettings = s => ({ v: 1, filter: cleanFilter(s?.filter), autoLoot: cleanAuto(s?.autoLoot) });
  const presetName = n => String(n ?? '').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60);
  const cleanState = state => ({
    ...cleanSettings(state), revision: Number.isSafeInteger(state?.revision) && state.revision >= 0 ? state.revision : 0,
    presets: (Array.isArray(state?.presets) ? state.presets : []).filter(p => /^[a-f0-9-]{36}$/i.test(p?.id ?? '') && presetName(p?.name))
      .slice(0, MAX_PRESETS).map(p => ({ id: p.id, name: presetName(p.name), at: Number.isFinite(p.at) ? p.at : 0, filter: cleanFilter(p.filter) })),
  });
  const translations = {
    weapons: 'Оружие', armor: 'Броня', clothing: 'Одежда', potions: 'Зелья', ingredients: 'Ингредиенты', books: 'Книги и карты', valuables: 'Ценности', misc: 'Прочее', materials: 'Материалы для ремесла',
    Magic: 'Магические предметы', Valuables: 'Ценности', Misc: 'Прочее', Weapons: 'Оружие', Arrows: 'Стрелы', Armor: 'Броня', Clothing: 'Одежда', Ingredients: 'Ингредиенты', Gold: 'Золото', Potions: 'Зелья', Books: 'Книги', Gems: 'Драгоценные камни', Jewellery: 'Украшения', Maps: 'Карты', 'Magic Items': 'Магические предметы', 'Religious Items': 'Религиозные предметы', 'Quest Items': 'Квестовые предметы', Transportation: 'Транспорт', 'Other Items': 'Прочие предметы',
    Drugs: 'Наркотические вещества', UselessItems1: 'Прочее I', UselessItems2: 'Прочее II', MiscItems: 'Разные предметы', MensClothing: 'Мужская одежда', WomensClothing: 'Женская одежда', Furniture: 'Мебель', ReligiousItems: 'Религиозные предметы', MagicItems: 'Магические предметы', Artifacts: 'Артефакты', QuestItems: 'Квестовые предметы', Currency: 'Валюты', Paintings: 'Картины', Deeds: 'Документы на собственность',
    PlantIngredients1: 'Растительные ингредиенты I', PlantIngredients2: 'Растительные ингредиенты II', CreatureIngredients1: 'Животные ингредиенты I', CreatureIngredients2: 'Животные ингредиенты II', CreatureIngredients3: 'Животные ингредиенты III', MiscellaneousIngredients1: 'Разные ингредиенты I', MiscellaneousIngredients2: 'Разные ингредиенты II', MetalIngredients: 'Металлические ингредиенты',
    common: 'Обычные', superior: 'Превосходные', magic: 'Магические', rare: 'Редкие', legendary: 'Легендарные', artifact: 'Артефакты', aetheric: 'Эфирные', gilded: 'Позолоченные',
    Leather: 'Кожа', Chain: 'Кольчуга', Iron: 'Железо', Steel: 'Сталь', Silver: 'Серебро', Elven: 'Эльфийский', Dwarven: 'Двемерский', Mithril: 'Мифрил', Adamantium: 'Адамантий', Ebony: 'Эбонит', Orcish: 'Орочий', Daedric: 'Даэдрический',
  };
  const STATES = [
    ['quest', 'Квестовые'], ['enchanted', 'Зачарованные'], ['artifact', 'Артефакты'],
    ['identified', 'Опознанные'], ['unidentified', 'Неопознанные'], ['stolen', 'Краденые'],
    ['bound', 'Привязанные'], ['locked', 'Защищённые от удаления'], ['junk', 'Отмеченные как хлам'],
    ['broken', 'Сломанные'], ['exalted', 'Возвышенные'], ['cursed', 'Проклятые'],
    ['socket-empty', 'С пустым гнездом'], ['socket-set', 'С камнем в гнезде'], ['imprint', 'С отпечатком'],
    ['imbued', 'Усиленные'], ['honed', 'Заточенные'], ['masterwork', 'Мастерская работа'],
    ['heirloom', 'Фамильные'], ['poisoned', 'Отравленные'],
  ];
  const typeKey = it => `type:${it?.group ?? ''}:${it?.templateIndex ?? -1}`;
  // An encountered named/potion/book variant can be selected without binding a rule to a transient UID.
  const variantKey = it => 'item:' + JSON.stringify([it?.group ?? '', it?.templateIndex ?? -1,
    ...['legendary', 'aetheric', 'gilded', 'potionRecipeKey', 'message', 'typeDependentData', 'artifactIndexBitfield', 'variant', 'material', 'rarity', 'qlNamed', 'name', 'card', 'imprint', 'socket', 'quality'].map(k => it?.[k] ?? null), (it?.affixes ?? []).map(a => [a.id ?? a.kind ?? null, a.param ?? null])]);
  const label = id => translations[id] || id;

  function tagsOf(it, tools) {
    const native = tools?.tagInfo?.(it);
    if (!native) return [];
    const out = [`group:${it.group}`, typeKey(it), `type:*:${it.templateIndex}`, `page:${native.page}`, `rarity:${native.rarity}`, `kind:${native.kind}`];
    if (native.material) out.push(`material:${native.material}`);
    if (native.materialItem) out.push('page:materials');
    if (native.identified) for (const a of it.affixes ?? []) {
      if (typeof a.id !== 'string') continue;
      out.push(`affix:${a.id}`); if (a.param != null) out.push(`affix:${a.id}:${a.param}`);
    }
    const states = {
      quest: !!it.questItem, enchanted: native.enchanted, artifact: !!it.artifact,
      identified: native.identified, unidentified: !native.identified, stolen: !!it.stolen,
      bound: native.bound, locked: !!it.locked, junk: !!it.junk,
      broken: it.currentCondition != null && it.currentCondition < 1,
      exalted: !!it.exalted, cursed: !!it.cursed, 'socket-empty': it.socket === 'empty',
      'socket-set': !!it.socket && it.socket !== 'empty', imprint: !!it.imprint,
      imbued: !!it.imbued, honed: it.honed > 0, masterwork: it.quality === 4,
      heirloom: !!it.heirloom, poisoned: Number.isInteger(it.poisonType) && it.poisonType >= 0,
    };
    for (const [k, yes] of Object.entries(states)) if (yes) out.push(`state:${k}`);
    return out;
  }
  function matches(tags, selected) { const set = new Set(tags); return selected.some(t => set.has(t)); }
  function visible(it, filter, tools) {
    const f = cleanFilter(filter), hit = matches(tagsOf(it, tools), f.tags);
    return f.mode === 'white' ? hit : !hit;
  }
  function automatic(it, rule, tools) {
    const a = cleanAuto(rule);
    return a.enabled && (a.items.includes(typeKey(it)) || a.items.includes(`type:*:${it.templateIndex}`) || a.items.includes(variantKey(it)) || matches(tagsOf(it, tools), a.tags));
  }
  function compileFilter(filter, tools) {
    const f = cleanFilter(filter), selected = new Set(f.tags);
    return it => { const hit = selected.size > 0 && tagsOf(it, tools).some(t => selected.has(t)); return f.mode === 'white' ? hit : !hit; };
  }
  function compileAuto(rule, tools) {
    const a = cleanAuto(rule), tags = new Set(a.tags), items = new Set(a.items);
    return it => a.enabled && (items.has(typeKey(it)) || items.has(`type:*:${it.templateIndex}`) || items.has(variantKey(it)) || (tags.size > 0 && tagsOf(it, tools).some(t => tags.has(t))));
  }
  function catalog(tools) {
    const c = tools?.tagCatalog?.();
    if (!c) return [];
    const out = [], add = (axis, name, rows) => { for (const [id, word] of rows) out.push({ id: `${axis}:${id}`, axis, group: name, label: label(word || id) }); };
    add('page', 'Категории', [...c.pages, ['materials', 'materials']]);
    add('group', 'Игровые группы', c.groups.map(id => [id, id]));
    add('kind', 'Типы наземных предметов', c.kinds.map(id => [id, id]));
    add('rarity', 'Редкость', c.rarities.map(id => [id, id]));
    add('material', 'Материал', c.materials.map(id => [id, id]));
    add('state', 'Свойства', STATES);
    const affixLabels = { damage: 'Урон', armor: 'Защита', weight: 'Грузоподъёмность', stat: 'Характеристика', resist: 'Сопротивление', skill: 'Навык', elemental: 'Стихийный урон', leech: 'Похищение здоровья', thorns: 'Ответный урон', focus: 'Стоимость заклинаний', slayer: 'Урон по существам', standing: 'Положение', warmth: 'Тепло', dry: 'Защита от погоды', castSpeed: 'Скорость заклинаний', potency: 'Сила заклинаний', wellspring: 'Мана за убийство', technique: 'Техника' };
    for (const [id, spec] of Object.entries(c.affixes || {})) {
      const name = affixLabels[id] || id;
      out.push({ id: `affix:${id}`, axis: 'affix', group: 'Аффиксы', label: name });
      for (const param of spec.params || []) {
        const word = String(spec.label({ value: 0, param })).replace(/^[+−-]?0\s*%?\s*/, '');
        out.push({ id: `affix:${id}:${param}`, axis: 'affix', group: 'Аффиксы', label: `${name}: ${root.__translate?.(word) || word}` });
      }
    }
    for (const it of tools.templates?.() ?? []) out.push({ id: typeKey(it), axis: 'type', group: 'Виды предметов', label: (it.group === '*' ? root.__translate?.(it.name) || it.name : tools.nameOf?.(it) || it.name) || String(it.templateIndex) });
    return [...new Map(out.map(t => [t.id, t])).values()];
  }
  const api = { MAX_PRESETS, MAX_TAGS, cleanFilter, cleanAuto, cleanSettings, cleanState, presetName, typeKey, variantKey, tagsOf, visible, automatic, compileFilter, compileAuto, catalog, label };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.__dfoLootRules = api;
})(globalThis);
