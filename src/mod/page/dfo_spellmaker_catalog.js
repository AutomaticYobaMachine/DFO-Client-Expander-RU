/* DFO Spellmaker — Game Data Laws, 94-Effect Bilingual Encyclopedia & Modular Name Generator. */
/* Spellmaker Calibration Stand — Data Catalog, Game Laws & Cost Formulas.
 * All effect keys, bounds, masks and SP/gold formulas mirror DFU/DFO upstream client runtime. */
(function (root) {
  'use strict';

  const ATTRIBUTES = Object.freeze([
    'Strength', 'Intelligence', 'Willpower', 'Agility',
    'Endurance', 'Personality', 'Speed', 'Luck',
  ]);

  const SCHOOL_IDS = Object.freeze({
    Destruction: 22,
    Restoration: 23,
    Illusion: 24,
    Alteration: 25,
    Thaumaturgy: 26,
    Mysticism: 27,
  });

  const GROUP_RU = Object.freeze({
    Paralyze: 'Паралич',
    'Continuous Damage': 'Длительный урон',
    'Create Item': 'Создание предмета',
    Cure: 'Излечение',
    Damage: 'Урон',
    Disintegrate: 'Распыление',
    Dispel: 'Рассеивание',
    Drain: 'Истощение',
    'Elemental Resistance': 'Сопротивление стихиям',
    'Fortify Attribute': 'Укрепление характеристики',
    Heal: 'Исцеление',
    Transfer: 'Передача',
    'Soul Trap': 'Ловушка душ',
    Invisibility: 'Невидимость',
    Levitate: 'Левитация',
    Light: 'Свет',
    Lock: 'Запереть',
    Open: 'Открыть',
    Regenerate: 'Регенерация',
    Silence: 'Безмолвие',
    'Spell Absorption': 'Поглощение заклинаний',
    'Spell Reflection': 'Отражение заклинаний',
    'Spell Resistance': 'Сопротивление заклинаниям',
    Chameleon: 'Хамелеон',
    Shadow: 'Тень',
    Slowfall: 'Медленное падение',
    'Free Action': 'Свобода движения',
    Jumping: 'Прыжок',
    Climbing: 'Лазание',
    'Morph Self': 'Превращение себя',
    'Water Breathing': 'Водное дыхание',
    'Water Walking': 'Хождение по воде',
    Pacify: 'Усмирение',
    Charm: 'Очарование',
    Shield: 'Щит',
    Detect: 'Обнаружение',
    Identify: 'Определить',
    Teleport: 'Телепорт',
    'Comprehend Languages': 'Понимание языков',
    Resurrect: 'Воскрешение',
    'Shared Cartography': 'Общая картография',
  });

  // Note: Normal/True intentionally stay 'Normal'/'True' in law.subgroups so dfo_services.js's
  // variantName() converts them cleanly to 'Обычный' / 'Истинный' when ru() is active.
  const SUBGROUP_RU = Object.freeze({
    Health: 'Здоровье',
    Fatigue: 'Запас сил',
    'Spell Points': 'Мана',
    Disease: 'Болезнь',
    Poison: 'Яд',
    Paralyzation: 'Паралич',
    Magic: 'Магия',
    Undead: 'Нежить',
    Daedra: 'Даэдра',
    Enemy: 'Враг',
    Treasure: 'Сокровище',
    Normal: 'Normal',
    True: 'True',
    Strength: 'Сила',
    Intelligence: 'Интеллект',
    Willpower: 'Сила воли',
    Agility: 'Ловкость',
    Endurance: 'Выносливость',
    Personality: 'Обаяние',
    Speed: 'Скорость',
    Luck: 'Удача',
    Fire: 'Огонь',
    Frost: 'Холод',
    Shock: 'Молния',
    Magicka: 'Магия',
    Animal: 'Животное',
    Humanoid: 'Гуманоид',
  });

  const FULL_NAME_RU = Object.freeze({
    '1,0': 'Длительный урон здоровью',
    '1,1': 'Длительный урон запасу сил',
    '1,2': 'Длительный урон мане',
    '3,0': 'Излечение болезни',
    '3,1': 'Излечение яда',
    '3,2': 'Излечение паралича',
    '4,0': 'Урон здоровью',
    '4,1': 'Урон запасу сил',
    '4,2': 'Урон мане',
    '6,0': 'Рассеивание магии',
    '6,1': 'Изгнание нежити',
    '6,2': 'Изгнание даэдра',
    '8,0': 'Сопротивление огню',
    '8,1': 'Сопротивление холоду',
    '8,2': 'Сопротивление яду',
    '8,3': 'Сопротивление молнии',
    '8,4': 'Сопротивление магии',
    '10,8': 'Исцеление здоровья',
    '10,9': 'Исцеление запаса сил',
    '11,8': 'Передача здоровья',
    '11,9': 'Передача запаса сил',
    '13,0': 'Невидимость (Обычный)',
    '13,1': 'Невидимость (Истинный)',
    '23,0': 'Хамелеон (Обычный)',
    '23,1': 'Хамелеон (Истинный)',
    '24,0': 'Тень (Обычный)',
    '24,1': 'Тень (Истинный)',
    '33,0': 'Усмирение животных',
    '33,1': 'Усмирение нежити',
    '33,2': 'Усмирение гуманоидов',
    '33,3': 'Усмирение даэдра',
    '39,0': 'Обнаружение магии',
    '39,1': 'Обнаружение врагов',
    '39,2': 'Обнаружение сокровищ',
  });

  const RAW_SINGLE_EFFECTS = [
    [0, 255, 'Paralyze', '', ['duration', 'chance']],
    [1, 0, 'Continuous Damage', 'Health', ['duration', 'magnitude']],
    [1, 1, 'Continuous Damage', 'Fatigue', ['duration', 'magnitude']],
    [1, 2, 'Continuous Damage', 'Spell Points', ['duration', 'magnitude']],
    [2, 255, 'Create Item', '', ['duration']],
    [3, 0, 'Cure', 'Disease', ['chance']],
    [3, 1, 'Cure', 'Poison', ['chance']],
    [3, 2, 'Cure', 'Paralyzation', ['chance']],
    [4, 0, 'Damage', 'Health', ['magnitude']],
    [4, 1, 'Damage', 'Fatigue', ['magnitude']],
    [4, 2, 'Damage', 'Spell Points', ['magnitude']],
    [5, 255, 'Disintegrate', '', ['chance']],
    [6, 0, 'Dispel', 'Magic', ['chance']],
    [6, 1, 'Dispel', 'Undead', ['chance']],
    [6, 2, 'Dispel', 'Daedra', ['chance']],
    [8, 0, 'Elemental Resistance', 'Fire', ['duration', 'chance']],
    [8, 1, 'Elemental Resistance', 'Frost', ['duration', 'chance']],
    [8, 2, 'Elemental Resistance', 'Poison', ['duration', 'chance']],
    [8, 3, 'Elemental Resistance', 'Shock', ['duration', 'chance']],
    [8, 4, 'Elemental Resistance', 'Magicka', ['duration', 'chance']],
    [12, 255, 'Soul Trap', '', ['duration', 'chance']],
    [13, 0, 'Invisibility', 'Normal', ['duration']],
    [13, 1, 'Invisibility', 'True', ['duration']],
    [14, 255, 'Levitate', '', ['duration']],
    [15, 255, 'Light', '', ['duration']],
    [16, 255, 'Lock', '', ['chance']],
    [17, 255, 'Open', '', ['chance']],
    [18, 255, 'Regenerate', '', ['duration', 'magnitude']],
    [19, 255, 'Silence', '', ['duration', 'chance']],
    [20, 255, 'Spell Absorption', '', ['duration', 'chance']],
    [21, 255, 'Spell Reflection', '', ['duration', 'chance']],
    [22, 255, 'Spell Resistance', '', ['duration', 'chance']],
    [23, 0, 'Chameleon', 'Normal', ['duration']],
    [23, 1, 'Chameleon', 'True', ['duration']],
    [24, 0, 'Shadow', 'Normal', ['duration']],
    [24, 1, 'Shadow', 'True', ['duration']],
    [25, 255, 'Slowfall', '', ['duration']],
    [26, 255, 'Free Action', '', ['duration']],
    [27, 255, 'Jumping', '', ['duration']],
    [28, 255, 'Climbing', '', ['duration']],
    [29, 255, 'Morph Self', '', [], false],
    [45, 255, 'Resurrect', '', [], false],
    [46, 255, 'Shared Cartography', '', ['duration']],
    [30, 255, 'Water Breathing', '', ['duration']],
    [31, 255, 'Water Walking', '', ['duration']],
    [33, 0, 'Pacify', 'Animal', ['chance']],
    [33, 1, 'Pacify', 'Undead', ['chance']],
    [33, 2, 'Pacify', 'Humanoid', ['chance']],
    [33, 3, 'Pacify', 'Daedra', ['chance']],
    [34, 255, 'Charm', '', ['chance']],
    [35, 255, 'Shield', '', ['duration', 'magnitude']],
    [39, 0, 'Detect', 'Magic', ['duration']],
    [39, 1, 'Detect', 'Enemy', ['duration']],
    [39, 2, 'Detect', 'Treasure', ['duration']],
    [40, 255, 'Identify', '', ['chance']],
    [43, 255, 'Teleport', '', []],
    [44, 255, 'Comprehend Languages', '', ['duration', 'chance']],
  ];

  const RAW_MULTI_EFFECTS = [
    [7, 'Drain', ATTRIBUTES, ['magnitude']],
    [9, 'Fortify Attribute', ATTRIBUTES, ['duration', 'magnitude']],
    [10, 'Heal', [...ATTRIBUTES, 'Health', 'Fatigue'], ['magnitude']],
    [11, 'Transfer', [...ATTRIBUTES, 'Health', 'Fatigue'], ['magnitude']],
  ];

  const PAREN_SUB = new Set(['13,0', '13,1', '23,0', '23,1', '24,0', '24,1']);
  let activeLang = 'ru';

  function buildEffects() {
    const out = [];
    const push = (type, subType, groupEn, subgroupEn, flags, craftable = true) => {
      const key = `${type},${subType}`;
      const groupRu = GROUP_RU[groupEn] || groupEn;
      const subgroupRu = subgroupEn ? (SUBGROUP_RU[subgroupEn] || subgroupEn) : '';
      const nameEn = subgroupEn
        ? (PAREN_SUB.has(key) ? `${groupEn} (${subgroupEn})` : `${groupEn} ${subgroupEn}`)
        : groupEn;
      const nameRu = FULL_NAME_RU[key]
        || (subgroupEn
          ? `${groupRu}: ${subgroupRu === 'Normal' ? 'Обычный' : subgroupRu === 'True' ? 'Истинный' : subgroupRu}`
          : groupRu);
      out.push({
        key,
        type,
        subType,
        groupEn,
        subgroupEn,
        nameEn,
        groupRu,
        subgroupRu,
        nameRu,
        get group() { return activeLang === 'ru' ? groupRu : groupEn; },
        get subgroup() { return activeLang === 'ru' ? subgroupRu : subgroupEn; },
        get name() { return activeLang === 'ru' ? nameRu : nameEn; },
        duration: flags.includes('duration'),
        chance: flags.includes('chance'),
        magnitude: flags.includes('magnitude'),
        craftable,
      });
    };

    for (const [t, s, g, sub, fl, cr] of RAW_SINGLE_EFFECTS) push(t, s, g, sub, fl, cr !== false);
    for (const [t, g, subs, fl] of RAW_MULTI_EFFECTS) subs.forEach((sub, idx) => push(t, idx, g, sub, fl, true));

    out.sort((a, b) => (a.groupEn === b.groupEn ? a.subType - b.subType : a.groupEn.localeCompare(b.groupEn)));
    return Object.freeze(out);
  }

  const EFFECTS = buildEffects();
  const EFFECT_BY_KEY = new Map(EFFECTS.map(e => [e.key, e]));

  // Exact upstream HEe cost table (`tamrielRoadsWorker`)
  const tg = (A, B, offset = 0) => ({ A, B, offset });
  const ng = (skill, obj) => Object.freeze({ skill, ...obj });
  const rg = (type, subs, obj) => Object.fromEntries(subs.map(s => [`${type},${s}`, obj]));
  const A0_7 = [0, 1, 2, 3, 4, 5, 6, 7];
  const L = SCHOOL_IDS;

  const COST_TABLE = Object.freeze({
    '0,255': ng(L.Alteration, { duration: tg(28, 100), chance: tg(28, 100) }),
    ...rg(8, [0, 1, 2, 3, 4], ng(L.Alteration, { duration: tg(100, 100), chance: tg(8, 100) })),
    '25,255': ng(L.Alteration, { duration: tg(20, 100) }),
    '27,255': ng(L.Alteration, { duration: tg(20, 8) }),
    '28,255': ng(L.Alteration, { duration: tg(20, 20) }),
    '30,255': ng(L.Alteration, { duration: tg(20, 8) }),
    '35,255': ng(L.Alteration, { duration: tg(28, 8), magnitude: tg(80, 60) }),

    '1,0': ng(L.Destruction, { duration: tg(28, 8), magnitude: tg(40, 28) }),
    '1,1': ng(L.Destruction, { duration: tg(20, 8), magnitude: tg(40, 28) }),
    '1,2': ng(L.Destruction, { duration: tg(40, 8), magnitude: tg(40, 28) }),
    '4,0': ng(L.Destruction, { magnitude: tg(20, 28) }),
    '4,1': ng(L.Destruction, { magnitude: tg(20, 28) }),
    '4,2': ng(L.Destruction, { magnitude: tg(20, 28) }),
    '5,255': ng(L.Destruction, { chance: tg(80, 140) }),
    ...rg(7, A0_7, ng(L.Destruction, { magnitude: tg(8, 100, 116) })),
    ...rg(11, [...A0_7, 8, 9], ng(L.Destruction, { magnitude: tg(60, 100, 40) })),

    '13,0': ng(L.Illusion, { duration: tg(40, 120) }),
    '13,1': ng(L.Illusion, { duration: tg(60, 140) }),
    '15,255': ng(L.Illusion, { duration: tg(8, 40) }),
    '23,0': ng(L.Illusion, { duration: tg(20, 80) }),
    '23,1': ng(L.Illusion, { duration: tg(40, 120) }),
    '24,0': ng(L.Illusion, { duration: tg(20, 80) }),
    '24,1': ng(L.Illusion, { duration: tg(40, 120) }),
    '29,255': ng(L.Illusion, {}),
    '45,255': ng(L.Restoration, {}),

    '2,255': ng(L.Mysticism, { duration: tg(60, 120) }),
    '6,0': ng(L.Mysticism, { chance: tg(120, 180) }),
    '6,1': ng(L.Mysticism, { chance: tg(80, 140) }),
    '6,2': ng(L.Mysticism, { chance: tg(120, 180) }),
    '12,255': ng(L.Mysticism, { duration: tg(60, 68), chance: tg(40, 68) }),
    '16,255': ng(L.Mysticism, { chance: tg(28, 120, 120) }),
    '17,255': ng(L.Mysticism, { chance: tg(20, 100) }),
    '19,255': ng(L.Mysticism, { duration: tg(20, 100), chance: tg(20, 100) }),
    '43,255': ng(L.Mysticism, {}),
    '46,255': ng(L.Mysticism, { duration: tg(8, 8) }),
    '44,255': ng(L.Mysticism, { duration: tg(60, 68), chance: tg(40, 68) }),

    '3,0': ng(L.Restoration, { chance: tg(8, 100) }),
    '3,1': ng(L.Restoration, { chance: tg(8, 100) }),
    '3,2': ng(L.Restoration, { chance: tg(20, 140) }),
    ...rg(9, A0_7, ng(L.Restoration, { duration: tg(28, 100), magnitude: tg(40, 120) })),
    ...rg(10, A0_7, ng(L.Restoration, { magnitude: tg(40, 28) })),
    '10,8': ng(L.Restoration, { magnitude: tg(20, 28) }),
    '10,9': ng(L.Restoration, { magnitude: tg(8, 28) }),
    '18,255': ng(L.Restoration, { duration: tg(100, 20), magnitude: tg(8, 8) }),
    '20,255': ng(L.Restoration, { duration: tg(28, 140), chance: tg(28, 140) }),
    '26,255': ng(L.Restoration, { duration: tg(20, 8) }),

    '14,255': ng(L.Thaumaturgy, { duration: tg(60, 100) }),
    '21,255': ng(L.Thaumaturgy, { duration: tg(28, 140), chance: tg(28, 140) }),
    '22,255': ng(L.Thaumaturgy, { duration: tg(20, 100), chance: tg(20, 100) }),
    '31,255': ng(L.Thaumaturgy, { duration: tg(20, 8) }),
    '33,0': ng(L.Thaumaturgy, { chance: tg(60, 100, 160) }),
    '33,1': ng(L.Thaumaturgy, { chance: tg(80, 140, 60) }),
    '33,2': ng(L.Thaumaturgy, { chance: tg(80, 140, 60) }),
    '33,3': ng(L.Thaumaturgy, { chance: tg(60, 120, 36) }),
    '34,255': ng(L.Thaumaturgy, { chance: tg(40, 60) }),
    '39,0': ng(L.Thaumaturgy, { duration: tg(20, 8, 200) }),
    '39,1': ng(L.Thaumaturgy, { duration: tg(20, 8, 200) }),
    '39,2': ng(L.Thaumaturgy, { duration: tg(20, 8, 160) }),
    '40,255': ng(L.Thaumaturgy, { chance: tg(40, 100, 28) }),
  });

  const DEFAULT_PAIR_COST = { A: 60, B: 100, offset: 160 };
  const TARGET_MULT = Object.freeze({ 0: 1, 1: 1, 2: 1.5, 3: 2, 4: 2.5 });

  function agTerm(term, baseVal, plusVal, perVal) {
    return Math.trunc(term.offset + term.A * baseVal + term.B * Math.trunc(plusVal / Math.max(1, perVal)));
  }

  function spFromGold(gold, skillVal, denom = 400, online = true) {
    return Math.trunc(online && skillVal > 100 ? (gold * 10 * 100) / (skillVal * denom) : (gold * (110 - skillVal)) / denom);
  }

  function calcEffectCost(slot, entity) {
    if (!slot || slot.type == null || slot.type < 0) return { gold: 0, sp: 0 };
    const s = { ...defaultSettings(), ...(slot.settings || {}) };
    const key = `${slot.type},${(slot.subType ?? 255) & 255}`;
    const entry = COST_TABLE[key];
    if (!entry) return { gold: 0, sp: 0 };
    const skillVal = Number(entity?.skills?.[entry.skill] ?? 55);
    let gold = 0;
    let hasTerm = false;
    if (entry.duration) {
      hasTerm = true;
      gold += agTerm(entry.duration, s.durationBase, s.durationMod, s.durationPerLevel);
    }
    if (entry.chance) {
      hasTerm = true;
      gold += agTerm(entry.chance, s.chanceBase, s.chanceMod, s.chancePerLevel);
    }
    if (entry.magnitude) {
      hasTerm = true;
      const loAvg = Math.trunc((s.magnitudeBaseLow + s.magnitudeBaseHigh) / 2);
      const plusAvg = Math.trunc((s.magnitudeLevelBase + s.magnitudeLevelHigh) / 2);
      gold += agTerm(entry.magnitude, loAvg, plusAvg, s.magnitudePerLevel);
    }
    if (!hasTerm) gold += agTerm(DEFAULT_PAIR_COST, 1, 1, 1);
    return { gold, sp: spFromGold(gold, skillVal, 400, true) };
  }

  function calcSpellCost(slots, rangeType, entity, priceFactor = 1) {
    const used = (slots || []).filter(Boolean);
    if (!used.length) return { gold: 0, sp: 0 };
    let gold = 0;
    let sp = 0;
    for (const slot of used) {
      const c = calcEffectCost(slot, entity);
      gold += c.gold;
      sp += c.sp;
    }
    const mult = TARGET_MULT[rangeType] ?? 1;
    gold = Math.trunc(gold * mult);
    sp = Math.max(5, Math.trunc(sp * mult));
    const finalGold = priceFactor === 1 || !(gold > 0) ? gold : Math.max(1, Math.round(gold * priceFactor));
    return { gold: finalGold, sp };
  }

  // Spinner Bounds (Gx / qx / Jx / Yx)
  const BOUNDS = Object.freeze({
    durationBase: [1, 60],
    durationMod: [1, 60],
    durationPerLevel: [1, 20],
    chanceBase: [1, 100],
    chanceMod: [1, 100],
    chancePerLevel: [1, 20],
    magnitudeBaseLow: [1, 100],
    magnitudeBaseHigh: [1, 100],
    magnitudeLevelBase: [1, 100],
    magnitudeLevelHigh: [1, 100],
    magnitudePerLevel: [1, 20],
  });

  function defaultSettings() {
    const out = {};
    for (const k of Object.keys(BOUNDS)) out[k] = 1;
    return out;
  }

  function boundsFor(field, effectKey = null) {
    const b = BOUNDS[field];
    if (!b) return null;
    if (field === 'chanceBase' && effectKey === '20,255') return [b[0], 50];
    return b;
  }

  function clampField(field, value, effectKey = null) {
    const b = boundsFor(field, effectKey);
    const n = Math.trunc(Number(value));
    if (!Number.isFinite(n)) return b ? b[0] : 1;
    return b ? Math.max(b[0], Math.min(b[1], n)) : n;
  }

  function syncMinMax(settings, changedField) {
    if (changedField === 'magnitudeBaseLow' && settings.magnitudeBaseLow > settings.magnitudeBaseHigh) {
      settings.magnitudeBaseHigh = settings.magnitudeBaseLow;
    } else if (changedField === 'magnitudeBaseHigh' && settings.magnitudeBaseHigh < settings.magnitudeBaseLow) {
      settings.magnitudeBaseLow = settings.magnitudeBaseHigh;
    } else if (changedField === 'magnitudeLevelBase' && settings.magnitudeLevelBase > settings.magnitudeLevelHigh) {
      settings.magnitudeLevelHigh = settings.magnitudeLevelBase;
    } else if (changedField === 'magnitudeLevelHigh' && settings.magnitudeLevelHigh < settings.magnitudeLevelBase) {
      settings.magnitudeLevelBase = settings.magnitudeLevelHigh;
    }
    return settings;
  }

  function stepSetting(settings, field, delta, effectKey = null) {
    const next = { ...settings };
    next[field] = clampField(field, (next[field] ?? 1) + delta, effectKey);
    return syncMinMax(next, field);
  }

  function setSetting(settings, field, value, effectKey = null) {
    const next = { ...settings };
    next[field] = clampField(field, value, effectKey);
    return syncMinMax(next, field);
  }

  // Target & Element Allowed Bitmasks (SOe / bOe / xOe / wOe / Dle)
  const CASTER_ONLY_KEYS = new Set([
    '2,255', '6,0', '6,1', '6,2', '14,255', '15,255', '16,255', '17,255',
    '25,255', '29,255', '39,0', '39,1', '39,2', '40,255', '43,255', '44,255', '46,255',
  ]);
  const NON_CASTER_KEYS = new Set(
    '0,255.1,0.1,1.1,2.4,0.4,1.4,2.5,255.7,0.7,1.7,2.7,3.7,4.7,5.7,6.7,7.11,0.11,1.11,2.11,3.11,4.11,5.11,6.11,7.11,8.11,9.12,255.33,0.33,1.33,2.33,3.34,255'.split('.')
  );
  const MAGIC_ONLY_KEYS = new Set(
    '2,255.3,0.3,1.3,2.6,0.6,1.6,2.8,0.8,1.8,2.8,3.8,4.9,0.9,1.9,2.9,3.9,4.9,5.9,6.9,7.10,0.10,1.10,2.10,3.10,4.10,5.10,6.10,7.10,8.10,9.11,0.11,1.11,2.11,3.11,4.11,5.11,6.11,7.11,8.11,9.13,0.13,1.14,255.15,255.16,255.17,255.18,255.20,255.21,255.22,255.23,0.23,1.24,0.24,1.25,255.26,255.27,255.28,255.29,255.30,255.31,255.33,0.33,1.33,2.33,3.35,255.39,0.39,1.39,2.40,255.43,255.44,255.46,255'.split('.')
  );

  function allowedButtons(slots) {
    const used = (slots || []).filter(e => e && e.type != null);
    if (!used.length) return { targets: 31, elements: 16, forced: true };
    let targets = 31;
    let elements = 16;
    for (const s of used) {
      const k = `${s.type},${s.subType}`;
      targets &= CASTER_ONLY_KEYS.has(k) ? 1 : NON_CASTER_KEYS.has(k) ? 30 : 31;
      elements |= MAGIC_ONLY_KEYS.has(k) ? 16 : 31;
    }
    return { targets, elements, forced: false };
  }

  function pickAllowedBit(current, mask) {
    if (mask & (1 << current)) return current;
    for (let i = 0; i < 5; i++) if (mask & (1 << i)) return i;
    return current;
  }

  const TARGET_KEYS = Object.freeze(['casterOnly', 'byTouch', 'singleTargetAtRange', 'areaAroundCaster', 'areaAtRange']);
  const ELEMENT_KEYS = Object.freeze(['fireBased', 'coldBased', 'poisonBased', 'shockBased', 'magicBased']);

  const UI_STRINGS_RU = Object.freeze({
    Spellmaker: 'Создание заклинаний',
    'An unnamed spell': 'Безымянное заклинание',
    'Empty slot': 'Пустой слот',
    'Edit or remove': 'Изменить или удалить',
    'Add effect': 'Добавить эффект',
    Unnamed: 'Безымянное',
    'Name spell': 'Назвать',
    'Caster only': 'На себя',
    'By touch': 'Касание',
    'Single target at range': 'Одиночная цель на расстоянии',
    'Area around caster': 'Область вокруг заклинателя',
    'Area at range': 'Область на расстоянии',
    'Select icon': 'Выбрать иконку',
    'Choose an icon': 'Выберите иконку',
    'Next icon': 'Следующая иконка',
    'Previous icon': 'Предыдущая иконка',
    '‹': '‹',
    '›': '›',
    Edit: 'Изменить',
    Delete: 'Удалить',
  });

  const BOX_TEXT = Object.freeze({
    ru: {
      1702: ['У вас недостаточно золота,', 'чтобы купить это заклинание.'],
      1703: ['У вас нет книги заклинаний,', 'чтобы вписать это заклинание.'],
      1704: ['Выберите название для этого', 'заклинания в своём гримуаре.'],
      1705: ['Заклинание вписано', 'в ваш гримуар.'],
      1707: ['Для одного заклинания можно', 'выбрать не более трёх эффектов.'],
      1708: ['Как бы вы хотели изменить заклинание?'],
      noEffects: ['Вы должны добавить хотя бы один эффект к этому заклинанию.'],
      incompatibleTargets: ['Выбранные эффекты несовместимы по формату цели', '(например, «На себя» и «Не на себя»). Удалите конфликтующий слот.'],
      namePromptTitle: 'Назвать заклинание',
      namePromptSub: 'Введите название для гримуара (до 24 символов):',
    },
    en: {
      1702: ['You do not have enough gold', 'to purchase this spell.'],
      1703: ['You do not have a spellbook', 'with which to inscribe this spell.'],
      1704: ['You must choose a name to call', 'this spell in your grimoire.'],
      1705: ['The spell has been inscribed', 'in your grimoire.'],
      1707: ['You can choose no more than three', 'effects for any spell.'],
      1708: ['How would you like to alter the spell?'],
      noEffects: ['You must add at least one effect to this spell.'],
      incompatibleTargets: ['Selected effects have incompatible target formats', '(e.g. Caster-only mixed with Non-self). Remove a conflicting slot.'],
      namePromptTitle: 'Name spell',
      namePromptSub: 'Enter a name for this spell (up to 24 characters):',
    },
  });

  const VANILLA_DESCRIPTIONS = Object.freeze({
    '0,255': ['Causes target to be paralyzed. Duration: How many rounds paralysis lasts. Chance of paralyzing target.'],
    '4,0': ['Inflicts health damage on the target. Magnitude: Random damage points inflicted.'],
    '1,0': ['Inflicts health damage every magic round for its duration.'],
    '19,255': ['Prevents the target from casting spells while active.'],
    '20,255': ['Absorbs incoming Destruction spell and restores casting cost to magicka pool.'],
    '35,255': ['Creates a magical barrier absorbing the configured amount of damage points.'],
  });

  const VANILLA_DESCRIPTIONS_RU = Object.freeze({
    '0,255': ['Парализует цель на указанное число раундов при срабатывании шанса.'],
    '4,0': ['Наносит мгновенный урон здоровью цели. Величина: случайный урон в заданных пределах.'],
    '1,0': ['Наносит урон здоровью каждый магический раунд на протяжении длительности.'],
    '19,255': ['Лишает цель возможности творить заклинания, пока действует эффект.'],
    '20,255': ['Поглощает входящее заклинание Разрушения (если хватает места в запасе маны) и восстанавливает 50% его цены.'],
    '35,255': ['Создаёт временный барьер поверх здоровья, поглощающий заданное число ед. урона.'],
  });

  function createHero() {
    return {
      isPlayer: true,
      name: 'Vanal Dran',
      level: 24,
      career: { name: 'Spellsword' },
      goldPieces: 245489,
      maxMagicka: 160,
      magicka: 160,
      skills: new Array(35).fill(55),
      items: [{ group: 'MiscItems', templateIndex: 132, name: 'Spellbook' }],
      spells: [],
    };
  }

  const PRESET_SPELLS = Object.freeze({
    firebane: {
      nameRu: 'Ледяная погибель',
      nameEn: 'Frostbane',
      rangeType: 2,
      element: 0,
      icon: 5,
      goldPieces: 245489,
      maxMagicka: 160,
      slots: [
        {
          key: '4,0',
          settings: {
            durationBase: 3, durationMod: 2, durationPerLevel: 4,
            chanceBase: 30, chanceMod: 5, chancePerLevel: 3,
            magnitudeBaseLow: 5, magnitudeBaseHigh: 10, magnitudeLevelBase: 2, magnitudeLevelHigh: 4, magnitudePerLevel: 3,
          },
        },
      ],
    },
    empty: {
      nameRu: '',
      nameEn: '',
      rangeType: 0,
      element: 4,
      icon: 1,
      goldPieces: 245489,
      maxMagicka: 160,
      slots: [],
    },
    full3: {
      nameRu: 'Шторм Арканума',
      nameEn: 'Arcanum Storm',
      rangeType: 2,
      element: 3,
      icon: 19,
      goldPieces: 245489,
      magicka: 520,
      maxMagicka: 520,
      slots: [
        {
          key: '1,0',
          settings: {
            durationBase: 2, durationMod: 1, durationPerLevel: 5,
            chanceBase: 1, chanceMod: 1, chancePerLevel: 1,
            magnitudeBaseLow: 4, magnitudeBaseHigh: 8, magnitudeLevelBase: 2, magnitudeLevelHigh: 3, magnitudePerLevel: 4,
          },
        },
        {
          key: '19,255',
          settings: {
            durationBase: 2, durationMod: 1, durationPerLevel: 6,
            chanceBase: 45, chanceMod: 5, chancePerLevel: 4,
            magnitudeBaseLow: 1, magnitudeBaseHigh: 1, magnitudeLevelBase: 1, magnitudeLevelHigh: 1, magnitudePerLevel: 1,
          },
        },
        {
          key: '0,255',
          settings: {
            durationBase: 1, durationMod: 1, durationPerLevel: 8,
            chanceBase: 35, chanceMod: 4, chancePerLevel: 4,
            magnitudeBaseLow: 1, magnitudeBaseHigh: 1, magnitudeLevelBase: 1, magnitudeLevelHigh: 1, magnitudePerLevel: 1,
          },
        },
      ],
    },
    absorb: {
      nameRu: 'Зеркало Шалидора',
      nameEn: "Shalidor's Mirror",
      rangeType: 0,
      element: 4,
      icon: 30,
      goldPieces: 245489,
      maxMagicka: 160,
      slots: [
        {
          key: '20,255',
          settings: {
            durationBase: 5, durationMod: 2, durationPerLevel: 3,
            chanceBase: 40, chanceMod: 3, chancePerLevel: 4,
            magnitudeBaseLow: 1, magnitudeBaseHigh: 1, magnitudeLevelBase: 1, magnitudeLevelHigh: 1, magnitudePerLevel: 1,
          },
        },
      ],
    },
    selfbuff: {
      nameRu: 'Благословение мага',
      nameEn: "Mage's Blessing",
      rangeType: 0,
      element: 4,
      icon: 40,
      goldPieces: 245489,
      maxMagicka: 180,
      slots: [
        {
          key: '9,1',
          settings: {
            durationBase: 6, durationMod: 3, durationPerLevel: 4,
            chanceBase: 1, chanceMod: 1, chancePerLevel: 1,
            magnitudeBaseLow: 8, magnitudeBaseHigh: 14, magnitudeLevelBase: 2, magnitudeLevelHigh: 4, magnitudePerLevel: 3,
          },
        },
        {
          key: '35,255',
          settings: {
            durationBase: 4, durationMod: 2, durationPerLevel: 4,
            chanceBase: 1, chanceMod: 1, chancePerLevel: 1,
            magnitudeBaseLow: 20, magnitudeBaseHigh: 30, magnitudeLevelBase: 5, magnitudeLevelHigh: 8, magnitudePerLevel: 2,
          },
        },
        {
          key: '15,255',
          settings: {
            durationBase: 10, durationMod: 4, durationPerLevel: 3,
            chanceBase: 1, chanceMod: 1, chancePerLevel: 1,
            magnitudeBaseLow: 1, magnitudeBaseHigh: 1, magnitudeLevelBase: 1, magnitudeLevelHigh: 1, magnitudePerLevel: 1,
          },
        },
      ],
    },
    nomana: {
      nameRu: 'Кара Пределов',
      nameEn: 'Wrath Beyond',
      rangeType: 4,
      element: 0,
      icon: 65,
      goldPieces: 1200,
      magicka: 120,
      maxMagicka: 120,
      slots: [
        {
          key: '4,0',
          settings: {
            durationBase: 1, durationMod: 1, durationPerLevel: 1,
            chanceBase: 1, chanceMod: 1, chancePerLevel: 1,
            magnitudeBaseLow: 30, magnitudeBaseHigh: 50, magnitudeLevelBase: 15, magnitudeLevelHigh: 25, magnitudePerLevel: 2,
          },
        },
        {
          key: '1,2',
          settings: {
            durationBase: 5, durationMod: 3, durationPerLevel: 2,
            chanceBase: 1, chanceMod: 1, chancePerLevel: 1,
            magnitudeBaseLow: 15, magnitudeBaseHigh: 25, magnitudeLevelBase: 10, magnitudeLevelHigh: 15, magnitudePerLevel: 2,
          },
        },
      ],
    },
    lowmana: {
      nameRu: 'Ледяная погибель',
      nameEn: 'Frostbane',
      rangeType: 2,
      element: 1,
      icon: 15,
      goldPieces: 245489,
      magicka: 20,
      maxMagicka: 160,
      slots: [
        {
          key: '4,0',
          settings: {
            durationBase: 3, durationMod: 2, durationPerLevel: 4,
            chanceBase: 30, chanceMod: 5, chancePerLevel: 3,
            magnitudeBaseLow: 5, magnitudeBaseHigh: 10, magnitudeLevelBase: 2, magnitudeLevelHigh: 4, magnitudePerLevel: 3,
          },
        },
      ],
    },
    triad_fire: {
      nameRu: 'Огненный смерч',
      nameEn: 'Inferno Tempest',
      rangeType: 4,
      element: 0,
      icon: 54,
      goldPieces: 245489,
      magicka: 420,
      maxMagicka: 420,
      slots: [
        { key: '4,0', settings: { durationBase: 1, durationMod: 1, durationPerLevel: 1, chanceBase: 1, chanceMod: 1, chancePerLevel: 1, magnitudeBaseLow: 8, magnitudeBaseHigh: 16, magnitudeLevelBase: 3, magnitudeLevelHigh: 6, magnitudePerLevel: 2 } },
        { key: '1,0', settings: { durationBase: 3, durationMod: 1, durationPerLevel: 4, chanceBase: 1, chanceMod: 1, chancePerLevel: 1, magnitudeBaseLow: 4, magnitudeBaseHigh: 8, magnitudeLevelBase: 2, magnitudeLevelHigh: 3, magnitudePerLevel: 4 } },
        { key: '1,1', settings: { durationBase: 2, durationMod: 1, durationPerLevel: 5, chanceBase: 1, chanceMod: 1, chancePerLevel: 1, magnitudeBaseLow: 3, magnitudeBaseHigh: 6, magnitudeLevelBase: 1, magnitudeLevelHigh: 2, magnitudePerLevel: 5 } },
      ],
    },
    triad_cold: {
      nameRu: 'Ледяная вьюга',
      nameEn: 'Glacial Blizzard',
      rangeType: 4,
      element: 1,
      icon: 15,
      goldPieces: 245489,
      magicka: 420,
      maxMagicka: 420,
      slots: [
        { key: '4,0', settings: { durationBase: 1, durationMod: 1, durationPerLevel: 1, chanceBase: 1, chanceMod: 1, chancePerLevel: 1, magnitudeBaseLow: 8, magnitudeBaseHigh: 14, magnitudeLevelBase: 2, magnitudeLevelHigh: 5, magnitudePerLevel: 2 } },
        { key: '1,0', settings: { durationBase: 3, durationMod: 1, durationPerLevel: 4, chanceBase: 1, chanceMod: 1, chancePerLevel: 1, magnitudeBaseLow: 4, magnitudeBaseHigh: 7, magnitudeLevelBase: 1, magnitudeLevelHigh: 3, magnitudePerLevel: 4 } },
        { key: '1,2', settings: { durationBase: 2, durationMod: 1, durationPerLevel: 5, chanceBase: 1, chanceMod: 1, chancePerLevel: 1, magnitudeBaseLow: 3, magnitudeBaseHigh: 6, magnitudeLevelBase: 1, magnitudeLevelHigh: 2, magnitudePerLevel: 5 } },
      ],
    },
    triad_poison: {
      nameRu: 'Токсичный рой',
      nameEn: 'Venom Swarm',
      rangeType: 2,
      element: 2,
      icon: 22,
      goldPieces: 245489,
      magicka: 380,
      maxMagicka: 380,
      slots: [
        { key: '4,0', settings: { durationBase: 1, durationMod: 1, durationPerLevel: 1, chanceBase: 1, chanceMod: 1, chancePerLevel: 1, magnitudeBaseLow: 6, magnitudeBaseHigh: 12, magnitudeLevelBase: 2, magnitudeLevelHigh: 4, magnitudePerLevel: 3 } },
        { key: '1,0', settings: { durationBase: 4, durationMod: 2, durationPerLevel: 4, chanceBase: 1, chanceMod: 1, chancePerLevel: 1, magnitudeBaseLow: 3, magnitudeBaseHigh: 7, magnitudeLevelBase: 1, magnitudeLevelHigh: 3, magnitudePerLevel: 4 } },
        { key: '4,1', settings: { durationBase: 1, durationMod: 1, durationPerLevel: 1, chanceBase: 1, chanceMod: 1, chancePerLevel: 1, magnitudeBaseLow: 4, magnitudeBaseHigh: 8, magnitudeLevelBase: 2, magnitudeLevelHigh: 3, magnitudePerLevel: 4 } },
      ],
    },
    triad_shock: {
      nameRu: 'Каскад молний',
      nameEn: 'Shock Cascade',
      rangeType: 2,
      element: 3,
      icon: 56,
      goldPieces: 245489,
      magicka: 400,
      maxMagicka: 400,
      slots: [
        { key: '4,0', settings: { durationBase: 1, durationMod: 1, durationPerLevel: 1, chanceBase: 1, chanceMod: 1, chancePerLevel: 1, magnitudeBaseLow: 10, magnitudeBaseHigh: 18, magnitudeLevelBase: 3, magnitudeLevelHigh: 6, magnitudePerLevel: 3 } },
        { key: '1,0', settings: { durationBase: 2, durationMod: 1, durationPerLevel: 4, chanceBase: 1, chanceMod: 1, chancePerLevel: 1, magnitudeBaseLow: 4, magnitudeBaseHigh: 8, magnitudeLevelBase: 2, magnitudeLevelHigh: 3, magnitudePerLevel: 4 } },
        { key: '4,2', settings: { durationBase: 1, durationMod: 1, durationPerLevel: 1, chanceBase: 1, chanceMod: 1, chancePerLevel: 1, magnitudeBaseLow: 5, magnitudeBaseHigh: 10, magnitudeLevelBase: 2, magnitudeLevelHigh: 4, magnitudePerLevel: 4 } },
      ],
    },
    triad_resto: {
      nameRu: 'Сияние Этериуса',
      nameEn: 'Aetherius Radiance',
      rangeType: 0,
      element: 4,
      icon: 40,
      goldPieces: 245489,
      magicka: 340,
      maxMagicka: 340,
      slots: [
        { key: '10,8', settings: { durationBase: 1, durationMod: 1, durationPerLevel: 1, chanceBase: 1, chanceMod: 1, chancePerLevel: 1, magnitudeBaseLow: 12, magnitudeBaseHigh: 22, magnitudeLevelBase: 4, magnitudeLevelHigh: 7, magnitudePerLevel: 2 } },
        { key: '18,255', settings: { durationBase: 5, durationMod: 2, durationPerLevel: 4, chanceBase: 1, chanceMod: 1, chancePerLevel: 1, magnitudeBaseLow: 4, magnitudeBaseHigh: 8, magnitudeLevelBase: 1, magnitudeLevelHigh: 2, magnitudePerLevel: 4 } },
        { key: '20,255', settings: { durationBase: 5, durationMod: 2, durationPerLevel: 4, chanceBase: 40, chanceMod: 3, chancePerLevel: 4, magnitudeBaseLow: 1, magnitudeBaseHigh: 1, magnitudeLevelBase: 1, magnitudeLevelHigh: 1, magnitudePerLevel: 1 } },
      ],
    },
    triad_illusion: {
      nameRu: 'Призма иллюзий',
      nameEn: 'Prism of Illusion',
      rangeType: 0,
      element: 4,
      icon: 35,
      goldPieces: 245489,
      magicka: 320,
      maxMagicka: 320,
      slots: [
        { key: '15,255', settings: { durationBase: 8, durationMod: 3, durationPerLevel: 3, chanceBase: 1, chanceMod: 1, chancePerLevel: 1, magnitudeBaseLow: 1, magnitudeBaseHigh: 1, magnitudeLevelBase: 1, magnitudeLevelHigh: 1, magnitudePerLevel: 1 } },
        { key: '13,1', settings: { durationBase: 4, durationMod: 2, durationPerLevel: 4, chanceBase: 1, chanceMod: 1, chancePerLevel: 1, magnitudeBaseLow: 1, magnitudeBaseHigh: 1, magnitudeLevelBase: 1, magnitudeLevelHigh: 1, magnitudePerLevel: 1 } },
        { key: '23,1', settings: { durationBase: 4, durationMod: 2, durationPerLevel: 4, chanceBase: 1, chanceMod: 1, chancePerLevel: 1, magnitudeBaseLow: 1, magnitudeBaseHigh: 1, magnitudeLevelBase: 1, magnitudeLevelHigh: 1, magnitudePerLevel: 1 } },
      ],
    },
    triad_alteration: {
      nameRu: 'Кристальный панцирь',
      nameEn: 'Crystal Carapace',
      rangeType: 0,
      element: 4,
      icon: 27,
      goldPieces: 245489,
      magicka: 360,
      maxMagicka: 360,
      slots: [
        { key: '35,255', settings: { durationBase: 6, durationMod: 2, durationPerLevel: 4, chanceBase: 1, chanceMod: 1, chancePerLevel: 1, magnitudeBaseLow: 20, magnitudeBaseHigh: 35, magnitudeLevelBase: 5, magnitudeLevelHigh: 8, magnitudePerLevel: 3 } },
        { key: '27,255', settings: { durationBase: 6, durationMod: 2, durationPerLevel: 4, chanceBase: 1, chanceMod: 1, chancePerLevel: 1, magnitudeBaseLow: 1, magnitudeBaseHigh: 1, magnitudeLevelBase: 1, magnitudeLevelHigh: 1, magnitudePerLevel: 1 } },
        { key: '8,0', settings: { durationBase: 5, durationMod: 2, durationPerLevel: 4, chanceBase: 45, chanceMod: 5, chancePerLevel: 4, magnitudeBaseLow: 1, magnitudeBaseHigh: 1, magnitudeLevelBase: 1, magnitudeLevelHigh: 1, magnitudePerLevel: 1 } },
      ],
    },
    triad_thaumaturgy: {
      nameRu: 'Астролябия Арканы',
      nameEn: 'Arcane Astrolabe',
      rangeType: 0,
      element: 4,
      icon: 47,
      goldPieces: 245489,
      magicka: 340,
      maxMagicka: 340,
      slots: [
        { key: '14,255', settings: { durationBase: 6, durationMod: 2, durationPerLevel: 4, chanceBase: 1, chanceMod: 1, chancePerLevel: 1, magnitudeBaseLow: 1, magnitudeBaseHigh: 1, magnitudeLevelBase: 1, magnitudeLevelHigh: 1, magnitudePerLevel: 1 } },
        { key: '21,255', settings: { durationBase: 5, durationMod: 2, durationPerLevel: 4, chanceBase: 45, chanceMod: 5, chancePerLevel: 4, magnitudeBaseLow: 1, magnitudeBaseHigh: 1, magnitudeLevelBase: 1, magnitudeLevelHigh: 1, magnitudePerLevel: 1 } },
        { key: '39,0', settings: { durationBase: 8, durationMod: 3, durationPerLevel: 4, chanceBase: 1, chanceMod: 1, chancePerLevel: 1, magnitudeBaseLow: 1, magnitudeBaseHigh: 1, magnitudeLevelBase: 1, magnitudeLevelHigh: 1, magnitudePerLevel: 1 } },
      ],
    },
    triad_mysticism: {
      nameRu: 'Зов Обливиона',
      nameEn: 'Call of Oblivion',
      rangeType: 0,
      element: 4,
      icon: 26,
      goldPieces: 245489,
      magicka: 380,
      maxMagicka: 380,
      slots: [
        { key: '19,255', settings: { durationBase: 4, durationMod: 2, durationPerLevel: 4, chanceBase: 50, chanceMod: 5, chancePerLevel: 4, magnitudeBaseLow: 1, magnitudeBaseHigh: 1, magnitudeLevelBase: 1, magnitudeLevelHigh: 1, magnitudePerLevel: 1 } },
        { key: '6,0', settings: { durationBase: 1, durationMod: 1, durationPerLevel: 1, chanceBase: 45, chanceMod: 5, chancePerLevel: 4, magnitudeBaseLow: 1, magnitudeBaseHigh: 1, magnitudeLevelBase: 1, magnitudeLevelHigh: 1, magnitudePerLevel: 1 } },
        { key: '17,255', settings: { durationBase: 1, durationMod: 1, durationPerLevel: 1, chanceBase: 60, chanceMod: 5, chancePerLevel: 3, magnitudeBaseLow: 1, magnitudeBaseHigh: 1, magnitudeLevelBase: 1, magnitudeLevelHigh: 1, magnitudePerLevel: 1 } },
      ],
    },
    synth3_schools: {
      nameRu: 'Триада синтеза',
      nameEn: 'Triad of Synthesis',
      rangeType: 2,
      element: 0,
      icon: 65,
      goldPieces: 245489,
      magicka: 420,
      maxMagicka: 420,
      slots: [
        { key: '4,0', settings: { durationBase: 1, durationMod: 1, durationPerLevel: 1, chanceBase: 1, chanceMod: 1, chancePerLevel: 1, magnitudeBaseLow: 8, magnitudeBaseHigh: 14, magnitudeLevelBase: 2, magnitudeLevelHigh: 4, magnitudePerLevel: 3 } },
        { key: '35,255', settings: { durationBase: 4, durationMod: 2, durationPerLevel: 4, chanceBase: 1, chanceMod: 1, chancePerLevel: 1, magnitudeBaseLow: 15, magnitudeBaseHigh: 25, magnitudeLevelBase: 4, magnitudeLevelHigh: 6, magnitudePerLevel: 3 } },
        { key: '19,255', settings: { durationBase: 3, durationMod: 1, durationPerLevel: 5, chanceBase: 40, chanceMod: 5, chancePerLevel: 4, magnitudeBaseLow: 1, magnitudeBaseHigh: 1, magnitudeLevelBase: 1, magnitudeLevelHigh: 1, magnitudePerLevel: 1 } },
      ],
    },
  });

  const ELEMENT_META = Object.freeze([
    { id: 0, key: 'fire', nameRu: 'Огонь', nameEn: 'Fire', primary: '#fb923c', core: '#fef08a', glow: 'rgba(249, 115, 22, 0.45)', ring: '#ea580c' },
    { id: 1, key: 'cold', nameRu: 'Холод', nameEn: 'Cold', primary: '#38bdf8', core: '#e0f2fe', glow: 'rgba(56, 189, 248, 0.45)', ring: '#0284c7' },
    { id: 2, key: 'poison', nameRu: 'Яд', nameEn: 'Poison', primary: '#4ade80', core: '#ecfccb', glow: 'rgba(74, 222, 128, 0.42)', ring: '#16a34a' },
    { id: 3, key: 'shock', nameRu: 'Молния', nameEn: 'Shock', primary: '#a78bfa', core: '#fef9c3', glow: 'rgba(167, 139, 250, 0.45)', ring: '#7c3aed' },
    { id: 4, key: 'magic', nameRu: 'Магия', nameEn: 'Magic', primary: '#e879f9', core: '#cffafe', glow: 'rgba(217, 70, 239, 0.42)', ring: '#9333ea' },
  ]);

  const SCHOOL_NAMES = Object.freeze({
    22: { ru: 'Разрушение', en: 'Destruction', color: '#f87171' },
    23: { ru: 'Восстановление', en: 'Restoration', color: '#fcd34d' },
    24: { ru: 'Иллюзия', en: 'Illusion', color: '#10d998' },
    25: { ru: 'Изменение', en: 'Alteration', color: '#68e422' },
    26: { ru: 'Тауматургия', en: 'Thaumaturgy', color: '#60a5fa' },
    27: { ru: 'Мистицизм', en: 'Mysticism', color: '#a855f7' },
  });

  function effectSchool(key) {
    const id = COST_TABLE[key]?.skill ?? 22;
    return SCHOOL_NAMES[id] || SCHOOL_NAMES[22];
  }

  function getEffectSpec(key) {
    const k = String(key ?? '');
    const costSpec = COST_TABLE[k] || null;
    const schoolId = costSpec?.skill ?? 22;
    const casterOnly = CASTER_ONLY_KEYS.has(k);
    const nonCaster = NON_CASTER_KEYS.has(k);
    const magicOnly = MAGIC_ONLY_KEYS.has(k);
    return {
      key: k,
      schoolId,
      school: SCHOOL_NAMES[schoolId] || SCHOOL_NAMES[22],
      costSpec,
      targets: casterOnly ? 1 : nonCaster ? 30 : 31,
      elements: magicOnly ? 16 : 31,
      casterOnly,
      nonCaster,
      magicOnly,
    };
  }

  function summarizeSlot(slot, fx, level = 24, lang = 'ru') {
    if (!slot || !fx) return [];
    const s = slot.settings || defaultSettings();
    const L = Math.max(1, Math.trunc(Number(level) || 1));
    const chips = [];
    if (fx.magnitude) {
      const k = Math.floor(L / Math.max(1, Number(s.magnitudePerLevel) || 1));
      const lo = (s.magnitudeBaseLow || 0) + (s.magnitudeLevelBase || 0) * k;
      const hi = (s.magnitudeBaseHigh || 0) + (s.magnitudeLevelHigh || 0) * k;
      const val = lo === hi ? String(lo) : `${lo}–${hi}`;
      chips.push(lang === 'ru' ? `Величина: ${val}` : `Mag: ${val}`);
    }
    if (fx.duration) {
      const k = Math.max(1, Math.floor(L / Math.max(1, Number(s.durationPerLevel) || 1)));
      const d = (s.durationBase || 0) + (s.durationMod || 0) * k;
      chips.push(lang === 'ru' ? `Длит.: ${d} раунд.` : `Dur: ${d} r`);
    }
    if (fx.chance) {
      const k = Math.floor(L / Math.max(1, Number(s.chancePerLevel) || 1));
      const c = Math.max(0, Math.min(fx.type === 20 ? 50 : 100, (s.chanceBase || 0) + (s.chanceMod || 0) * k));
      chips.push(lang === 'ru' ? `Шанс: ${c}%` : `Chance: ${c}%`);
    }
    if (!chips.length) chips.push(lang === 'ru' ? 'Особое действие' : 'Special effect');
    return chips;
  }

  function setLocale(lang) {
    activeLang = lang === 'en' ? 'en' : 'ru';
  }

  function makeLaw() {
    return {
      effects: EFFECTS,
      groups() {
        const seen = [];
        const set = new Set();
        for (const e of EFFECTS) {
          if (!e.craftable) continue;
          const g = e.group;
          if (!set.has(g)) {
            set.add(g);
            seen.push(g);
          }
        }
        return seen.sort((a, b) => a.localeCompare(b, activeLang));
      },
      subgroups(groupName) {
        return EFFECTS
          .filter(e => e.craftable && (e.group === groupName || e.groupEn === groupName || e.groupRu === groupName))
          .sort((a, b) => a.subgroup.localeCompare(b.subgroup, activeLang));
      },
    };
  }

  root.__dfoSpellmakerData = Object.freeze({
    EFFECTS,
    EFFECT_BY_KEY,
    TARGET_KEYS,
    ELEMENT_KEYS,
    ELEMENT_META,
    SCHOOL_NAMES,
    UI_STRINGS_RU,
    BOX_TEXT,
    VANILLA_DESCRIPTIONS,
    VANILLA_DESCRIPTIONS_RU,
    PRESET_SPELLS,
    createHero,
    defaultSettings,
    boundsFor,
    stepSetting,
    setSetting,
    allowedButtons,
    pickAllowedBit,
    calcEffectCost,
    calcSpellCost,
    effectSchool,
    getEffectSpec,
    DEFAULT_PAIR_COST,
    TARGET_MULT,
    spFromGold,
    summarizeSlot,
    setLocale,
    getLocale: () => activeLang,
    makeLaw,
    getIconSrc(val) {
      if (root.__dfoSpellIconRegistry) return root.__dfoSpellIconRegistry.getIconSrc(val);
      const icons = root.__dfoSpellIcons || [];
      if (!icons.length) return '';
      const i = ((Math.trunc(val) || 0) % 69 + 69) % 69;
      return icons[i] || '';
    },
    getIconMeta(val) {
      return root.__dfoSpellIconRegistry?.findEntry?.(val) || null;
    },
    getIconSections(lang, filterSchool = 'all') {
      return root.__dfoSpellIconRegistry?.getSections?.(lang, filterSchool) || [];
    },
    getIconSchoolCounts() {
      return root.__dfoSpellIconRegistry?.getSchoolCounts?.() || new Map();
    },
    getIconSchoolOrder() {
      return root.__dfoSpellIconRegistry?.SCHOOL_ORDER || [];
    },
    getIconSchoolMeta() {
      return root.__dfoSpellIconRegistry?.SCHOOL_META || {};
    },
    getIconTotalCount() {
      return root.__dfoSpellIconRegistry?.getTotalCount?.() || (root.__dfoSpellIcons || []).length;
    },
    pickRandomIconBySchool(schoolId, excludeValue = null) {
      return root.__dfoSpellIconRegistry?.pickRandomBySchool?.(schoolId, excludeValue) || null;
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);

/* Detailed Spellmaker Effect Encyclopedia Catalog (RU & EN).
 * Provides beginner-friendly explanations, warning/quirk plaques for buggy, limited,
 * or deceptive effects, and exact COST_TABLE + flatAnimation runtime formulas for spoilers. */
(function (root) {
  'use strict';

  const SCHOOL_ORDER = Object.freeze([22, 23, 24, 25, 26, 27]);

  const SCHOOL_INFO = Object.freeze({
    22: {
      id: 22,
      ru: 'Разрушение',
      en: 'Destruction',
      color: '#f87171',
      tagRu: 'Урон · Слив · Проклятия',
      tagEn: 'Damage · Drain · Curses',
      descRu: 'Прямой и длительный урон здоровью/мане/стамине, высасывание ресурсов и бессрочные проклятия характеристик. Поглощается вражеским «Поглощением заклинаний».',
      descEn: 'Instant and over-time damage, resource transfers, and lasting attribute curses. Incoming Destruction effects can be eaten by Spell Absorption.',
    },
    23: {
      id: 23,
      ru: 'Восстановление',
      en: 'Restoration',
      color: '#fcd34d',
      tagRu: 'Лечение · Усиления · Поглощение',
      tagEn: 'Healing · Fortify · Absorption',
      descRu: 'Исцеление здоровья, стамины и снятых характеристик, снятие болезней/ядов/паралича, временный прирост статов, регенерация и «Поглощение заклинаний».',
      descEn: 'Healing health, fatigue, and drained attributes, curing ailments, temporary attribute boosts, regeneration, and Spell Absorption.',
    },
    24: {
      id: 24,
      ru: 'Иллюзия',
      en: 'Illusion',
      color: '#10d998',
      tagRu: 'Маскировка · Свет',
      tagEn: 'Concealment · Light',
      descRu: 'Обычная и Истинная версии Невидимости, Хамелеона и Тени, плюс факел света. Время скрытности продлевается при навыке Иллюзии выше 100.',
      descEn: 'Normal and True forms of Invisibility, Chameleon, and Shadow, plus Light. Concealment duration scales past Illusion 100.',
    },
    25: {
      id: 25,
      ru: 'Изменение',
      en: 'Alteration',
      color: '#68e422',
      tagRu: 'Щит · Защита · Стихии · Движение',
      tagEn: 'Shield · Resists · Paralyze · Mobility',
      descRu: 'Защитный Щит поверх здоровья, сопротивления стихиям, Паралич, Прыжок, Лазание, Медленное падение и Водное дыхание.',
      descEn: 'Absorb Shield barrier, Elemental Resistances, Paralyze, Jumping, Climbing, Slowfall, and Water Breathing.',
    },
    26: {
      id: 26,
      ru: 'Тауматургия',
      en: 'Thaumaturgy',
      color: '#60a5fa',
      tagRu: 'Отражение · Очарование · Полёт',
      tagEn: 'Reflection · Pacify · Detection',
      descRu: 'Отражение и Сопротивление магии, Усмирение/Очарование существ, Левитация, Хождение по воде, Детекторы и Определение предметов.',
      descEn: 'Spell Reflection and Spell Resistance, creature Pacify/Charm, Levitate, Water Walking, Detect spells, and Identify.',
    },
    27: {
      id: 27,
      ru: 'Мистицизм',
      en: 'Mysticism',
      color: '#a855f7',
      tagRu: 'Души · Безмолвие · Взлом · Телепорт',
      tagEn: 'Souls · Silence · Utility · Teleport',
      descRu: 'Ловушка душ, Безмолвие, Рассеивание магии и Изгнание, Открытие/Запирание дверей, Телепорт, Создание предметов и Общая картография.',
      descEn: 'Soul Trap, Silence, Dispel Magic & Banish, Open/Lock doors, Teleport, Create Item, Comprehend Languages, and Shared Cartography.',
    },
  });

  const TARGET_TEXT = Object.freeze({
    1: {
      ru: 'Только на себя',
      en: 'Self-Cast Only',
    },
    30: {
      ru: 'Только на других (не на себя)',
      en: 'Others Only (No Self-Cast)',
    },
    31: {
      ru: 'На себя или на других',
      en: 'Self or Any Target',
    },
  });

  // Parameterized per-effect handbook builders keyed by effect.type (+ optional exact key override).
  function describeCostPair(label, term, ru) {
    if (!term) return null;
    const basePart = `${term.A} × ${ru ? 'База' : 'Base'}`;
    const plusPart = `${term.B} × ⌊${ru ? 'Прибавка' : 'Plus'} / ${ru ? 'Каждые_N' : 'PerLvl'}⌋`;
    const offPart = term.offset ? `${term.offset} + ` : '';
    return `${label}: ${offPart}${basePart} + ${plusPart}`;
  }

  function formatCostTerms(effect, spec, ru) {
    const cs = spec?.costSpec;
    if (!cs) return ru ? 'Нет данных таблицы' : 'No table data';
    const parts = [];
    if (cs.duration) parts.push(describeCostPair(ru ? 'Длительность' : 'Duration', cs.duration, ru));
    if (cs.chance) parts.push(describeCostPair(ru ? 'Шанс' : 'Chance', cs.chance, ru));
    if (cs.magnitude) {
      const m = cs.magnitude;
      const offPart = m.offset ? `${m.offset} + ` : '';
      const avgBase = ru ? '⌊(БазМин+БазМакс)/2⌋' : '⌊(BaseLo+BaseHi)/2⌋';
      const avgPlus = ru ? '⌊(ПрибМин+ПрибМакс)/2⌋' : '⌊(PlusLo+PlusHi)/2⌋';
      parts.push(`${ru ? 'Величина' : 'Magnitude'}: ${offPart}${m.A} × ${avgBase} + ${m.B} × ⌊${avgPlus} / ${ru ? 'Каждые_N' : 'PerLvl'}⌋`);
    }
    if (!parts.length) {
      const dp = root.__dfoSpellmakerData?.DEFAULT_PAIR_COST || { offset: 160, A: 60, B: 100 };
      const tot = dp.offset + dp.A + dp.B;
      return ru
        ? `Фикс. формула (без ползунков): ${dp.offset} + ${dp.A}×1 + ${dp.B}×1 = ${tot} баз. золота`
        : `Fixed pair formula (no sliders): ${dp.offset} + ${dp.A}×1 + ${dp.B}×1 = ${tot} base gold`;
    }
    return parts.join(' + ');
  }

  function buildMeta(effect, spec, entity) {
    const k = effect.key;
    const t = effect.type;
    const sub = effect.subType;
    const nameRu = effect.nameRu;
    const nameEn = effect.nameEn;

    // Helper for standard attribute names inside dynamic prose
    const subRu = effect.subgroupRu || '';
    const subEn = effect.subgroupEn || '';

    // -------------------------------------------------------------------------
    // WARNING PLAQUES (for broken, non-working, half-working, misleading, or heavily limited effects)
    // -------------------------------------------------------------------------
    let warning = null;
    let mechanicsRu = [];
    let mechanicsEn = [];
    let tipsRu = [];
    let tipsEn = [];
    let skillOvercapRu = 'Не усиливается выше навыка 100 (только снижает расход маны).';
    let skillOvercapEn = 'Power/chance is NOT boosted past skill 100 (only reduces MP cost).';
    let mergeRu = 'Повторное наложение лишь продлевает оставшееся время до нового (если оно длиннее).';
    let mergeEn = 'Re-casting only extends remaining duration if longer.';
    let keywords = [];

    switch (t) {
      case 0: // Paralyze
        warning = {
          tone: 'warn',
          badgeRu: 'ОСОБЕННОСТЬ · НЕ БЛОКИРУЕТ МАГИЮ',
          badgeEn: 'QUIRK · DOES NOT SILENCE CASTERS',
          titleRu: 'Паралич обездвиживает, но НЕ запрещает врагу колдовать',
          titleEn: 'Paralysis stops movement & melee, NOT enemy spellcasting',
          textRu: 'Парализованный монстр или игрок не может ходить и бить оружием, но всё ещё способен бросать заклинания! Против магов нужен эффект «Безмолвие». Полностью блокируется «Свободой движения» и врождённым иммунитетом к параличу.',
          textEn: 'A paralyzed target cannot walk or swing weapons, yet can STILL cast spells! Against mages you also need Silence. Skipped completely by Free Action or innate paralysis immunity.',
        };
          mechanicsRu = [
            'При попадании сначала проверяет, нет ли на цели «Свободы движения» или врождённого иммунитета к параличу — если есть, слот моментально пропускается.',
            'Если иммунитета нет, проверяет Отражение, Сопротивление магии, настроенный шанс и спасбросок цели сразу против стихии заклинания и флага Паралича (Поглощение на школу Изменения не действует). При успехе цель замирает на месте на заданное время действия.',
          ];
          mechanicsEn = [
            'First checks if the target has Free Action or innate paralysis immunity — if so, the slot is skipped immediately.',
            'Otherwise rolls Spell Reflection, Spell Resistance, your trigger chance, and a combined Saving Throw testing both your spell element and Paralysis immunity/resistance. Locks movement and weapon swings for your configured duration.',
          ];
        mergeRu = 'Повторный каст по уже парализованной цели просто продлевает оставшийся таймер, если новый срок дольше.';
        mergeEn = 'Re-casting on an already paralyzed target simply extends remaining rounds if longer.';
        keywords = ['паралич', 'обездвиживание', 'свобода', 'контроль', 'paralyze', 'stun', 'freeze'];
        break;

      case 1: // Continuous Damage (0: Health, 1: Fatigue, 2: Magicka)
        if (sub === 0) {
          skillOvercapRu = 'Урон здоровью каждого тика усиливается при Разрушении > 100 (до ×1.40 на эфф. 140)!';
          skillOvercapEn = 'Each tick scales with Destruction > 100 (up to ×1.40 at eff. skill 140)!';
          mechanicsRu = [
            'Наносит случайный урон здоровью в заданных пределах каждый магический раунд (1 игровую минуту). Первый тик срабатывает МГНОВЕННО в момент попадания — ждать минуту не нужно.',
            'И сила, и спасбросок цели бросаются заново на каждом минутном тике! Коэффициент сложности цели также влияет на итоговый урон каждого тика.',
            'Так как это школа Разрушения, каждый слот может быть съеден вражеским «Поглощением заклинаний».',
          ];
          mechanicsEn = [
            'Inflicts rolled Health damage inside your configured range every magic round (1 game minute). The very first tick strikes INSTANTLY upon hit — no 1-minute wait.',
            'Both the strength roll and the target Saving Throw re-roll fresh on every tick, scaled by enemy difficulty!',
            'Belongs to Destruction, so incoming slots can be eaten by target Spell Absorption.',
          ];
          keywords = ['дот', 'яд', 'огонь', 'горение', 'урон', 'dot', 'burn', 'poison', 'tick'];
        } else if (sub === 1) {
          warning = {
            tone: 'danger',
            badgeRu: 'МНОЖИТЕЛЬ × 64 · ПО МОНСТРАМ СЛАБО',
            badgeEn: 'SCALE × 64 · WEAK ON AI MOBS',
            titleRu: 'Множитель × 64 и разница между игроками и монстрами',
            titleEn: 'Internal × 64 multiplier & mobs do NOT collapse at 0 Fatigue',
            textRu: 'Внутри движка цифра из редактора умножается на 64 («5» = 320 стамины в раунд). Это именно «Запас сил» (бодрость), а НЕ характеристика «Выносливость». На игроков (в дуэлях) падение стамины до 0 вызывает обморок, но у обычных ИИ-монстров обнуление стамины НЕ роняет их без сознания.',
            textEn: 'Editor values multiply by 64 internally (5 = 320 Fatigue per tick). Note Fatigue is Stamina, NOT Endurance. Dropping a player to 0 Fatigue triggers collapse, whereas AI mobs do NOT fall unconscious at 0 Fatigue.',
          };
          mechanicsRu = [
            'Каждый раунд (начиная сразу с момента попадания) отнимает у цели в 64 раза больше единиц запаса сил, чем указано в числовой настройке. Нельзя наложить на себя.',
            'Эффекты разных ресурсов складываются: на враге могут одновременно тикать урон здоровью, мане и запасу сил.',
          ];
          mechanicsEn = [
            'Drains 64× your rolled strength value in Fatigue every magic round starting immediately on hit. Cannot target yourself.',
            'Stacks freely with Continuous Damage to Health and Spell Points at the same time.',
          ];
          keywords = ['усталость', 'стамина', 'выносливость', 'запас сил', '64', 'fatigue', 'stamina'];
        } else {
          warning = {
            tone: 'warn',
            badgeRu: 'ТОЛЬКО ПРОТИВ МАГОВ',
            badgeEn: 'CASTERS & PVP ONLY',
            titleRu: 'Бесполезно против немагических врагов',
            titleEn: 'Wasted against non-casting monsters',
            textRu: 'Обычные воины, звери и нежить без заклинаний ману не используют. Зато против вражеских магов эффект реально лишает их запаса маны (когда МП доходит до 0, они не могут колдовать). Повторный каст лишь продлевает время, не удваивая выжигание.',
            textEn: 'Melee beasts and non-caster enemies ignore magicka. Against spellcasters or in PvP, draining magicka to 0 genuinely stops their casts. Re-casting only refreshes duration.',
          };
          mechanicsRu = [
            'Каждый магический раунд отнимает у цели заданное количество маны (переброс случайного значения идёт на каждом тике, первый удар — сразу при попадании).',
            'Складывается параллельно с длительным уроном здоровью и запасу сил.',
          ];
          mechanicsEn = [
            'Burns your rolled amount of magicka per round starting immediately on hit, with strength re-rolled every tick.',
            'Runs side by side with Continuous Health and Fatigue DoTs.',
          ];
          keywords = ['мана', 'сжигание', 'антимаг', 'magicka', 'mana', 'drain'];
        }
        mergeRu = 'Повтор того же вида (например, два Длит. урона здоровью) не суммирует тики — лишь продлевает таймер до нового значения, сохраняя старые настройки!';
        mergeEn = 'Repeating the exact same DoT type only extends remaining duration — it does NOT stack double ticks!';
        break;

      case 2: // Create Item
        warning = {
          tone: 'danger',
          badgeRu: 'СЪЕДАЕТ 1 РАУНД СРАЗУ',
          badgeEn: 'LOSES 1 ROUND ON CAST',
          titleRu: 'При длительности 1 минута предмет пропадает мгновенно!',
          titleEn: 'At 1-minute duration the conjured item vanishes immediately!',
          textRu: 'В коде движка срок жизни созданного предмета считается на 1 игровую минуту меньше, потому что первый раунд уходит на вызов окна выбора. Если итоговая длительность равна 1, предмет исчезнет тут же на 0-й минуте! Оставьте базу на 1 и добавьте хотя бы +1 минуту за уровень — тогда даже на 1-м уровне выйдет 2+ минуты. Вещи временные и не остаются навсегда.',
          textEn: 'The engine sets lifetime 1 game minute shorter because the initial tick opens the picker. If total duration is only 1 minute, the conjured item vanishes right away! Keeping Base at 1 plus +1 per level already gives 2+ minutes even at Level 1.',
        };
        mechanicsRu = [
          'При касте «На себя» (другие цели заблокированы) открывает список временного оружия или снаряжения для призыва.',
          'Созданный предмет служит вам (Раунды − 1) минут, после чего исчезает.',
        ];
        mechanicsEn = [
          'Caster-only spell that opens a conjuration menu for temporary gear.',
          'Lasts (Rounds − 1) in-game minutes before vanishing.',
        ];
        keywords = ['призыв', 'оружие', 'броня', 'предмет', 'создание', 'conjure', 'summon', 'create'];
        break;

      case 3: // Cure (0: Disease, 1: Poison, 2: Paralyzation)
        if (sub === 0) {
          warning = {
            tone: 'warn',
            badgeRu: 'ПОРЯДОК СНЯТИЯ ВАМПИРИЗМА',
            badgeEn: 'DISEASE vs CURSE ORDER',
            titleRu: 'Скрытую инфекцию лечит в последнюю очередь!',
            titleEn: 'Clears normal diseases BEFORE vampirism / lycanthropy!',
            textRu: 'Если вы заражены и обычной болезнью, и ранней инфекцией вампира/оборотня, первый каст снимет ТОЛЬКО обычную болезнь! Чтобы вылечить заразу вампиризма/ликантропии до превращения, кастуйте заклинание ещё раз НА СЕБЯ, когда обычных болезней не осталось. Лечение от другого игрока/лекаря инфекцию не снимет!',
            textEn: 'If you carry an ordinary disease alongside early vampirism or lycanthropy, the first cast removes ONLY ordinary diseases! Cast it on YOURSELF again once ordinary diseases are gone to purge the curse (stranger/healer casts preserve infections).',
          };
          keywords = ['болезнь', 'вампир', 'ликантропия', 'оборотень', 'чума', 'disease', 'vampire', 'werewolf'];
        } else if (sub === 1) {
          warning = {
            tone: 'warn',
            badgeRu: 'ЗАВИСИТ ОТ ШАНСА',
            badgeEn: 'ROLLS CHANCE ON SELF',
            titleRu: 'Перед снятием яда проверяет настроенный шанс (даже на себе)',
            titleEn: 'Rolls your configured Chance even when cast on yourself',
            textRu: 'В отличие от «Свободы движения», перед снятием яда игра всё равно бросает ваш настроенный шанс срабатывания — при низком проценте спелл может промахнуться. Но НЕ накручивайте базовый шанс на 100%: оставьте базу на 1 и поставьте прибавку ~7% за каждый 1 уровень — заклинание выйдет дешевле, а к 10–14 уровню надёжно закроет шанс до 100%.',
            textEn: 'Unlike Free Action, Cure Poison always rolls your configured Chance slider even when cast on yourself, so low chance can fizzle. Do NOT crank Base to 100% — keep Base at 1 and set scaling to ~7% per 1 level instead: it costs less and reaches full reliability by levels 10–14.',
          };
          keywords = ['яд', 'противоядие', 'отравление', 'poison', 'cure'];
        } else {
          warning = {
            tone: 'warn',
            badgeRu: 'ХУЖЕ «СВОБОДЫ ДВИЖЕНИЯ»',
            badgeEn: 'WEAKER THAN FREE ACTION',
            titleRu: 'Удобнее использовать «Свободу движения»',
            titleEn: 'Compare with Free Action before buying',
            textRu: '«Излечение паралича» зависит от броска шанса и срабатывает один раз, а уже через секунду враг может парализовать вас снова. Заклинание «Свобода движения» той же школы при наложении тоже мгновенно снимает паралич — и вдобавок даёт полный иммунитет на всё время действия!',
            textEn: 'Cure Paralyzation rolls Chance once and leaves you vulnerable immediately after. Restoration’s Free Action ALSO clears existing paralysis instantly on cast AND grants full immunity for its whole duration!',
          };
          keywords = ['паралич', 'снятие', 'свобода', 'paralyze', 'free action'];
        }
        mechanicsRu = [
          `При успешном броске шанса мгновенно удаляет активный эффект (${sub === 0 ? 'болезнь' : sub === 1 ? 'яд' : 'паралич'}) с цели.`,
          'Как и все целебные заклинания, работает на себя без спасбросков; при броске на союзника проверяется спасбросок каналом «Магия».',
        ];
        mechanicsEn = [
          `When your Chance roll succeeds, immediately removes active ${sub === 0 ? 'diseases' : sub === 1 ? 'poisons' : 'paralysis'} from the target.`,
          'Self-casts never roll Saving Throws; touch/ranged casts test Magic defense unless bypassed.',
        ];
        mergeRu = 'Мгновенное действие (не оставляет активного таймера).';
        mergeEn = 'Instant effect (leaves no active timer).';
        break;

      case 4: // Instant Damage (0: Health, 1: Fatigue, 2: Magicka)
        if (sub === 0) {
          skillOvercapRu = 'Урон здоровью усиливается при навыке Разрушения > 100 (до ×1.40 на эфф. 140)!';
          skillOvercapEn = 'Damage scales upward past Destruction 100 (up to ×1.40 at eff. skill 140)!';
          mechanicsRu = [
            'Классический мгновенный удар по здоровью выбранной стихией (Огонь, Холод, Яд, Молния или Магия). Нельзя применить «На себя».',
            'Слоты мгновенного урона честно складываются! Можно собрать 2–3 слота «Урона здоровью» в одном заклинании — они ударят по очереди с раздельными проверками.',
            'На урон влияют Поглощение (только против Разрушения), Отражение, Сопротивление магии, стихийная защита цели и множитель сложности цели.',
          ];
          mechanicsEn = [
            'Classic instant HP blast in your chosen element (Fire, Cold, Poison, Shock, or Magic). Cannot target yourself.',
            'Instant damage slots stack cleanly! Putting 2–3 Damage Health slots in one spell strikes 2–3 times with independent defense rolls.',
            'Tested by Spell Absorption (Destruction), Reflection, Spell Resistance, Elemental Saving Throw, and enemy difficulty damage scaling.',
          ];
          keywords = ['урон', 'взрыв', 'шар', 'молния', 'огонь', 'холод', 'damage', 'fireball', 'nuke'];
        } else if (sub === 1) {
          warning = {
            tone: 'danger',
            badgeRu: 'МНОЖИТЕЛЬ × 64 · НЕ РОНЯЕТ МОБОВ',
            badgeEn: 'SCALE × 64 · NO MOB KNOCKOUT',
            titleRu: 'Множитель × 64 и бесполезность по обычным монстрам',
            titleEn: 'Multiplies by 64, yet AI mobs do NOT pass out at 0 Fatigue',
            textRu: 'Внутренний урон умножается на 64 («5» = 320 стамины). Это урон по шкале «Запас сил» (усталость), а не «Выносливости». По игрокам в дуэлях обнуление стамины свалит противника с ног, но обычные монстры при 0 стамины НЕ падают без сознания и продолжают драться!',
            textEn: 'Internal damage equals 64× your rolled value (slider 5 = 320 Fatigue). Only players collapse at 0 Fatigue in duels — AI monsters stay standing and keep fighting even at 0 Fatigue!',
          };
          mechanicsRu = [
            'Мгновенно отнимает у цели в 64 раза больше единиц запаса сил, чем задано в настройках.',
            'Не усиливается бонусом Разрушения свыше 100, но всё ещё может поглощаться «Поглощением заклинаний».',
          ];
          mechanicsEn = [
            'Instantly drains 64× your configured strength value in Fatigue from the target.',
            'Does not gain Destruction > 100 damage scaling, though it still triggers Spell Absorption.',
          ];
          keywords = ['усталость', 'запас сил', 'стамина', '64', 'fatigue', 'stamina'];
        } else {
          warning = {
            tone: 'warn',
            badgeRu: 'ТОЛЬКО ПРОТИВ МАГОВ И В PVP',
            badgeEn: 'ONLY HURTS SPELLCASTERS',
            titleRu: 'Против немагических врагов эффекта не видно',
            titleEn: 'No visible effect on non-casting beasts/warriors',
            textRu: 'Звери, разбойники и обычные скелеты не тратят ману — сжигать её имеет смысл только вражеским магам (при 0 МП они теряют возможность колдовать) или другим игрокам.',
            textEn: 'Pure melee monsters never check MP; reserve Spell Point damage for enemy spellcasters or PvP opponents (0 MP blocks enemy casts).',
          };
          mechanicsRu = [
            'Мгновенно сжигает у цели заданное в настройках количество маны (Spell Points).',
            'Несколько слотов в одном заклинании суммируются. Проходит все стандартные проверки защиты.',
          ];
          mechanicsEn = [
            'Instantly drains your configured amount of Magicka from the target.',
            'Multiple slots stack. Goes through standard absorption, reflection, resistance, and saves.',
          ];
          keywords = ['мана', 'сжигание', 'magicka', 'mana', 'sp'];
        }
        mergeRu = 'Мгновенное срабатывание: все слоты в заклинании и повторные броски полностью суммируются.';
        mergeEn = 'Instant effect: every slot and every repeat cast stacks in full.';
        break;

      case 5: // Disintegrate
        warning = {
          tone: 'danger',
          badgeRu: 'НЕ ЛОМАЕТ БРОНЮ!',
          badgeEn: 'DOES NOT BREAK ARMOR!',
          titleRu: 'Вопреки названию, НЕ уничтожает экипировку — это ваншот-лотерея',
          titleEn: 'Misleading name: deals current-HP damage, never breaks gear',
          textRu: 'Эффект НЕ распыляет броню и оружие врага! Вместо этого он проверяет ваш настроенный шанс срабатывания, затем Поглощение, Отражение, Сопротивление магии и Спасбросок цели. Если цель провалила всё — заклинание пытается нанести урон, равный ВСЕМУ её текущему здоровью!',
          textEn: 'Disintegrate NEVER breaks weapons or armor! Instead it rolls your configured trigger chance alongside target Absorption, Reflection, Resistance, and Saving Throw — on a failed save it deals damage equal to 100% of the target’s current HP!',
        };
        mechanicsRu = [
          'Высокорисковое заклинание мгновенного убийства: если бросок шанса прошёл, а спасбросок врага не защитил его полностью, цель получает урон, равный всему её текущему запасу здоровья.',
          'Урон наносится напрямую при провале защиты; если у врага 100% сопротивление стихии или полный спасбросок, заклинание промахивается впустую.',
        ];
        mechanicsEn = [
          'High-variance one-shot effect: if your Chance roll succeeds and the target does not fully save, deals damage equal to their full remaining HP.',
          'Blocked by Spell Absorption, Reflection, Spell Resistance, Elemental immunity, or a clean Saving Throw.',
        ];
        mergeRu = 'Мгновенное срабатывание.';
        mergeEn = 'Instant execution.';
        keywords = ['распыление', 'ваншот', 'броня', 'смерть', 'disintegrate', 'armor', 'oneshot'];
        break;

      case 6: // Dispel (0: Magic, 1: Undead, 2: Daedra)
        if (sub === 0) {
          warning = {
            tone: 'danger',
            badgeRu: 'НЕ РАБОТАЕТ НА МОНСТРОВ!',
            badgeEn: 'IGNORED ON MONSTERS!',
            titleRu: 'Полностью пропускается на ИИ-врагах — работает только на игрока',
            titleEn: 'Player-only: enemy buffs cannot be dispelled with this!',
            textRu: 'Движок жёстко пропускает всех существ и монстров — снять баффы или щиты с врагов этим заклинанием НЕВОЗМОЖНО! У игрока открывает список ваших активных наборов эффектов и снимает один выбранный набор целиком (отмена окна не возвращает ману за бросок).',
            textEn: 'Hard-skipped on all monsters and NPCs — you CANNOT strip buffs off enemies with this! On a player it opens a picker to clear ONE active spell bundle (your own buffs clear at 100%, hostile ones roll Chance; canceling does NOT refund casting SP).',
          };
          mechanicsRu = [
            'Доступно только «На себя». При касте открывает список активных заклинаний и чар на вашем персонаже и снимает выбранный набор.',
            'Ваши собственные и союзные заклинания снимаются гарантированно (100%), а наложенные врагами проклятия и активные эффекты надетых вещей проверяют ваш настроенный шанс снятия.',
          ];
          mechanicsEn = [
            'Caster-only utility. Opens a menu of active spell/enchantment bundles currently on your character and purges the chosen bundle.',
            'Your own and ally spell bundles always remove cleanly (100%); hostile debuffs and equipped item held-effects roll your configured Chance.',
          ];
        } else {
          skillOvercapRu = 'Шанс изгнания усиливается при Мистицизме > 100 (до ×1.40)!';
          skillOvercapEn = 'Banish chance scales up past Mysticism 100 (up to ×1.40)!';
          warning = {
            tone: 'danger',
            badgeRu: 'БЕЗ ТРУПА, ЛУТА И КВЕСТА',
            badgeEn: 'NO CORPSE · NO LOOT · NO KILL CREDIT',
            titleRu: 'Опасная ловушка: стирает врагов без добычи и зачёта заданий!',
            titleEn: 'Trap alert: erased enemies drop NO loot and give NO quest credit!',
            textRu: `Изгнанная ${sub === 1 ? 'нежить' : 'даэдра'} просто мгновенно удаляется из подземелья без смерти. С такого врага НЕ упадёт труп с трофеями, и он НЕ пойдёт в счётчик квестов на убийство! Противников на арене изгонять запрещено.`,
            textEn: `Banished ${sub === 1 ? 'Undead' : 'Daedra'} are deleted outright without dying! They leave NO corpse, drop NO loot, and NEVER advance kill-target quests! Disabled during arena bouts.`,
          };
          mechanicsRu = [
            `Сканирует ближайших врагов вокруг заклинателя и для каждого подходящего (${sub === 1 ? 'нежить' : 'даэдра'}) проверяет ваш настроенный шанс изгнания.`,
            'Удаляет всех прошедших проверку существ сразу (с учётом бонуса Мистицизма > 100 к шансу).',
          ];
          mechanicsEn = [
            `Scans nearby creatures around the caster and rolls your configured Chance individually against each matching ${sub === 1 ? 'Undead' : 'Daedra'}.`,
            'Deletes all targets that fail the check (Mysticism > 100 increases effective Chance).',
          ];
        }
        mergeRu = 'Мгновенное действие.';
        mergeEn = 'Instant action.';
        keywords = ['рассеивание', 'изгнание', 'нежить', 'даэдра', 'баффы', 'лут', 'квест', 'dispel', 'banish', 'undead', 'daedra'];
        break;

      case 7: // Drain Attribute
        warning = {
          tone: 'warn',
          badgeRu: 'ПРОКЛЯТИЕ БЕЗ ТАЙМЕРА',
          badgeEn: 'PERMANENT DEBUFF UNTIL CURED',
          titleRu: 'Суммируется бессрочно, но НЕ лечит вас (в отличие от «Передачи»)',
          titleEn: 'Stacks permanently until cured — does NOT heal your stat',
          textRu: `Бессрочно снижает вражескую характеристику «${subRu}» до тех пор, пока её не снимут «Исцелением характеристики». В отличие от «Передачи характеристики» (id=11), НИЧЕГО не лечит у вас самих. При повторных кастах штраф на одной характеристике складывается в один дебафф (в дуэлях стат не опустить ниже 1).`,
          textEn: `Indefinitely lowers the target’s ${subEn} until restored by Heal Attribute. Unlike Transfer Attribute, it gives ZERO healing back to you. Repeated hits add to the same penalty (clamped at minimum 1 stat in duels).`,
        };
        mechanicsRu = [
          `Снижает целевую характеристику «${subRu}» на заданное числовое значение (с учётом спасбросков по выбранной стихии заклинания).`,
          'Можно выбрать любую стихию! Снижение Силы воли (Willpower) полезно перед другими заклинаниями контроля, т.к. Сила воли влияет на спасброски цели.',
        ];
        mechanicsEn = [
          `Reduces target’s ${subEn} by your rolled amount (after Spell Resistance and Saving Throw in your chosen element).`,
          'Allows any element! Lowering Willpower weakens the target’s subsequent Saving Throws.',
        ];
        mergeRu = 'Сливается с активным «Истощением» той же характеристики, суммируя общий штраф навсегда (до лечения).';
        mergeEn = 'Merges into a single permanent Drain debuff on that stat, summing total magnitude until healed.';
        keywords = ['истощение', 'проклятие', 'характеристика', 'drain', 'debuff', subRu.toLowerCase(), subEn.toLowerCase()];
        break;

      case 8: // Elemental Resistance (0..4)
        warning = {
          tone: 'warn',
          badgeRu: 'ПОЛНЫЙ БЛОК ШАНСОМ, НЕ «−% УРОНА»',
          badgeEn: 'ALL-OR-NOTHING BLOCK CHANCE',
          titleRu: 'Даёт шанс ПОЛНОСТЬЮ избежать урона, а не процентное снижение',
          titleEn: 'Rolls full-negate chance before Saves — NOT flat % damage cut',
          textRu: `Настройка «Шанс 60%» против стихии «${subRu}» означает 60% вероятность вообще не получить урон от этого слота (0%), а при неудаче (40%) удар пойдёт на обычный спасбросок. Повторное заклинание той же стихии продлевает ТОЛЬКО время, оставляя старый шанс — но разные источники (вещь + заклинание) суммируются!`,
          textEn: `A 60% ${subEn} Resistance buff is a 60% chance to take ZERO damage from matching spells (otherwise regular Saving Throw runs). Recasting the same spell only refreshes duration without upgrading %, yet separate sources (gear + spell) add together!`,
        };
        mechanicsRu = [
          `Вешает на настроенное время действия щит от стихии «${subRu}» с заданным шансом блока. При входящей атаке соответствующей стихии суммарный шанс проверяется ДО спасброска.`,
          'По умолчанию спасброски самой защиты (при наложении на союзника) всегда идут по каналу «Магия».',
        ];
        mechanicsEn = [
          `Grants your configured % ${subEn} Resistance for the configured duration. Total resistance from spells & gear rolls BEFORE standard Saving Throws.`,
          'Forces Magic defense channel for Saving Throws when cast on others.',
        ];
        mergeRu = 'Повтор того же элемента (у заклинания) обновляет ТОЛЬКО оставшееся время. Разные источники (предмет + бафф) суммируются в проверке.';
        mergeEn = 'Recasting the same element refreshes remaining duration ONLY; separate sources (item + active spell) add together.';
        keywords = ['сопротивление', 'стихия', 'огонь', 'холод', 'яд', 'молния', 'магия', 'resist', subRu.toLowerCase(), subEn.toLowerCase()];
        break;

      case 9: // Fortify Attribute (0..7)
        warning = {
          tone: 'warn',
          badgeRu: 'СТАКАЕТСЯ ПО КЛЮЧУ 11 ПОЛЗУНКОВ',
          badgeEn: 'STACKS IF ANY SLIDER DIFFERS BY 1',
          titleRu: 'Секрет стакания: измените любой ползунок на 1 единицу',
          titleEn: 'Exact slider-match merge rule',
          textRu: `При повторном касте абсолютно того же заклинания бафф НЕ удваивается, а лишь сдвигает таймер. Но игра проверяет все 11 ползунков параметров сразу: сделайте 2-е заклинание с длительностью на 1 раунд больше (или силой на 1 иной), и оба укрепления «${subRu}» повесятся рядом и сложатся!`,
          textEn: `Re-casting an identical Fortify ${subEn} spell only extends duration. However, the engine compares all 11 parameter sliders together: tweak any slider by just 1 in a second spell and both buffs stack simultaneously!`,
        };
        mechanicsRu = [
          `Временно повышает характеристику «${subRu}» на случайное число из заданного диапазона (бросок кидается при наложении) на выбранное время в игровых минутах.`,
          'Снимается автоматически по истечении времени. Не тратит спасбросок при касте «На себя».',
        ];
        mechanicsEn = [
          `Temporarily boosts ${subEn} by a rolled amount inside your configured range (rolled on application) for your set duration in game minutes.`,
          'Expires cleanly when duration ends. Bypasses Saving Throws when cast on self.',
        ];
        mergeRu = 'Совпадают все 11 ползунков → обновляет время старого баффа. Отличается хотя бы 1 ползунок → создаётся второй параллельный бафф!';
        mergeEn = 'All 11 settings identical → extends timer. Even 1 slider differs → stacks as a separate active buff!';
        keywords = ['укрепление', 'бафф', 'стат', 'характеристика', 'fortify', 'buff', subRu.toLowerCase(), subEn.toLowerCase()];
        break;

      case 10: // Heal (0..7 Attr, 8: Health, 9: Fatigue)
        if (sub <= 7) {
          mechanicsRu = [
            `Мгновенно восстанавливает характеристику «${subRu}», сниженную проклятиями «Истощение», «Передача», болезнями или ядом.`,
            'Работает строго до возврата к нормальному максимуму — поднять стат выше базового значения нельзя (для временного разгона используйте «Укрепление характеристики»).',
          ];
          mechanicsEn = [
            `Instantly restores ${subEn} lost to Drain, Transfer, Disease, or Poison.`,
            'Repairs damaged attribute points back up to your base value only — never buffs above normal max.',
          ];
          mergeRu = 'Мгновенное действие (лишнее исцеление не накапливается).';
          mergeEn = 'Instant repair up to base value.';
          keywords = ['лечение', 'исцеление', 'характеристика', 'снять дебафф', 'heal', 'restore', subRu.toLowerCase(), subEn.toLowerCase()];
        } else if (sub === 8) {
          skillOvercapRu = 'Самолечение усиливается при навыке Восстановления > 100 (до ×1.40 на эфф. 140)!';
          skillOvercapEn = 'Self-healing scales up past Restoration 100 (up to ×1.40 at eff. skill 140)!';
          mechanicsRu = [
            'Мгновенно восстанавливает заданное число очков здоровья (при касте «На себя» спасброски не бросаются, при лечении союзника в касании/вдаль используется канал «Магия»).',
            'Усиление навыка Восстановления выше 100 поднимает итоговое самолечение вплоть до +40% (на эфф. 140).',
          ];
          mechanicsEn = [
            'Instantly heals your configured Health roll (bypasses Saving Throws on self; uses Magic channel on range/touch).',
            'Restoration skill past 100 amplifies self-healing up to +40% (at effective skill 140).',
          ];
          mergeRu = 'Мгновенное действие: несколько слотов или бросков честно складываются до максимума HP.';
          mergeEn = 'Instant heal: multiple slots/casts add up to max HP.';
          keywords = ['лечение', 'здоровье', 'хил', 'восстановление', 'heal', 'health', 'hp'];
        } else {
          warning = {
            tone: 'warn',
            badgeRu: 'МНОЖИТЕЛЬ × 64 (НЕ ВЫНОСЛИВОСТЬ)',
            badgeEn: 'SCALE × 64 (NOT ENDURANCE)',
            titleRu: 'Цифра из редактора умножается на 64 внутри игры',
            titleEn: 'Slider value multiplies by 64 internally',
            textRu: 'Для «Исцеления запаса сил» заданная цифра в игре умножается на 64: даже значение «5» восстанавливает сразу 320 единиц стамины! Это полоска выносливости/бодрости (Fatigue), а не характеристика «Выносливость» (Endurance).',
            textEn: 'Restores 64× your configured value in Fatigue points! Even a modest slider of 5 restores 320 internal Fatigue. Affects your Fatigue bar, NOT the Endurance attribute.',
          };
          mechanicsRu = [
            'Мгновенно восстанавливает в 64 раза больше единиц запаса сил, чем указано в настройке, не давая персонажу рухнуть без сил в долгом бою или при быстром лазании.',
          ];
          mechanicsEn = [
            'Instantly restores 64× your rolled Fatigue points up to your max stamina pool.',
          ];
          mergeRu = 'Мгновенное действие до максимума Запаса сил.';
          mergeEn = 'Instant stamina restore up to max pool.';
          keywords = ['запас сил', 'стамина', 'бодрость', '64', 'fatigue', 'stamina', 'restore'];
        }
        break;

      case 11: // Transfer (0..7 Attr, 8: Health, 9: Fatigue)
        if (sub <= 7) {
          warning = {
            tone: 'warn',
            badgeRu: 'ТОЛЬКО ЛЕЧИТ ВАС (НЕ БАФФАЕТ)',
            badgeEn: 'REPAIRS DAMAGE · NO OVER-CAP BUFF',
            titleRu: 'Восстанавливает ваш потерянный стат, но НЕ поднимает выше базы',
            titleEn: 'Heals your drained attribute — does NOT buff past base stat',
            textRu: `Снижает «${subRu}» цели на заданное значение навсегда (как проклятие «Истощение») и ровно на столько же лечит ВАШУ ранее повреждённую характеристику «${subRu}» (от болезней, яда или вражеских проклятий). Если она у вас не повреждена — прибавки не будет! В отличие от «Истощения», здесь всегда канал «Магия».`,
            textEn: `Permanently lowers target’s ${subEn} by your rolled amount and repairs YOUR own drained ${subEn} (from curses, disease, or poison). If your ${subEn} is already full, you gain zero buff! Unlike Drain, Transfer forces Magic saves.`,
          };
          mechanicsRu = [
            `Крадёт у цели заданное число единиц характеристики «${subRu}» (нельзя применить «На себя»). Штраф на враге суммируется при повторе в постоянный дебафф.`,
          ];
          mechanicsEn = [
            `Drains your rolled amount from target’s ${subEn} and feeds that into your own damaged attribute repair pool. Cannot self-cast.`,
          ];
          mergeRu = 'На цели суммирует бессрочный дебафф (может подцепляться к уже висящему «Истощению» той же характеристики).';
          mergeEn = 'Stacks permanent penalty on the target until Heal Attribute.';
          keywords = ['передача', 'вампиризм стата', 'характеристика', 'transfer', subRu.toLowerCase(), subEn.toLowerCase()];
        } else if (sub === 8) {
          warning = {
            tone: 'warn',
            badgeRu: 'ЛЕЧИТ ПОЛНЫЙ БРОСОК ДАЖЕ ПО 1 HP',
            badgeEn: 'FULL HEAL EVEN ON 1-HP TARGET',
            titleRu: 'Исцеляет на весь урон заклинания, даже если у крысы был 1 HP!',
            titleEn: 'Heals for full rolled damage regardless of enemy remaining HP',
            textRu: 'В коде движка лечение кастера получает ровно выпавший бросок урона (после спасброска цели), НЕ обрезаясь под реальный остаток HP жертвы! Но учтите: бонус навыка Разрушения/Восстановления > 100 на «Передачу здоровья» НЕ действует.',
            textEn: 'Heals the caster for the full rolled value even if the target only had 1 HP left (capped at your max Health). Note: Skill > 100 scaling does NOT boost Transfer Health.',
          };
          mechanicsRu = [
            'Наносит цели настроенный урон здоровью (с проверкой Поглощения, Отражения, Сопротивления и Спасброска каналом «Магия») и на столько же исцеляет заклинателя.',
          ];
          mechanicsEn = [
            'Deals your configured HP damage (saving vs Magic) and heals the caster for that amount (not usable on self).',
          ];
          mergeRu = 'Мгновенное действие: полностью суммируется при каждом ударе/слоте.';
          mergeEn = 'Instant strike: stacks across slots and casts.';
          keywords = ['передача здоровья', 'вампиризм', 'высасывание', 'transfer', 'lifesteal', 'drain health'];
        } else {
          warning = {
            tone: 'danger',
            badgeRu: 'МНОЖИТЕЛЬ × 64 · НЕ РОНЯЕТ МОБОВ',
            badgeEn: 'SCALE × 64 · DOES NOT KO MOBS',
            titleRu: 'Работает как батарейка стамины об врага (каждая 1 ед. × 64)',
            titleEn: 'Enemy 0 Fatigue does not knock mobs out, though refills YOUR bar × 64',
            textRu: 'Высасывает в 64 раза больше единиц запаса сил, чем указано в настройках (на ИИ-монстров обнуление стамины обморок не вызывает). Зато вас самих это прекрасно заправляет бодростью даже при минимальных цифрах в редакторе (5 = 320 ед.).',
            textEn: 'Steals 64× your configured Fatigue amount from the target into your own Fatigue bar. Doesn’t knock out AI mobs at 0 Fatigue, yet 5 in the editor restores 320 Fatigue for you!',
          };
          mechanicsRu = [
            'Вытягивает 64× от заданного значения запаса сил у врага (проходя спасбросок каналом «Магия») и передаёт заклинателю. Нельзя наложить «На себя».',
          ];
          mechanicsEn = [
            'Drains 64× your configured Fatigue amount from the target (Magic channel) and refills caster’s Fatigue. Cannot self-cast.',
          ];
          mergeRu = 'Мгновенное действие.';
          mergeEn = 'Instant transfer.';
          keywords = ['передача запаса сил', 'стамина', '64', 'transfer', 'fatigue'];
        }
        break;

      case 12: // Soul Trap
        skillOvercapRu = 'Шанс захвата души растёт при навыке Мистицизма > 100 (до ×1.40, макс 100%)!';
        skillOvercapEn = 'Trap chance scales up past Mysticism 100 (up to ×1.40, max 100%)!';
        warning = {
          tone: 'danger',
          badgeRu: 'ПОРЯДОК СЛОТОВ · НЕ НА ГУМАНОИДОВ!',
          badgeEn: 'SLOT ORDER · NO HUMANOIDS!',
          titleRu: 'Ставьте в 1-й слот ВЫШЕ урона! Не работает на людей',
          titleEn: 'Place ABOVE Damage slots! Fails on humanoids & without empty gem',
          textRu: '1) Всегда ставьте «Ловушку душ» ВЫШЕ слотов урона — если враг умрёт от 1-го слота, 2-й слот промажет в труп! 2) На людей и гуманоидов не ложится. 3) Для захвата при смерти цели в сумке должен быть пустой камень душ (или Звезда Азуры), иначе поимка сорвётся и даже смерть монстра может заблокироваться!',
          textEn: '1) Always place Soul Trap ABOVE Damage slots — if Slot 1 kills the foe, Slot 2 arrives on a corpse! 2) Does NOT work on humanoids. 3) Needs an empty Soul Gem (or Azura’s Star) on kill, or capture fails (alerting no empty soul trap).',
        };
        mechanicsRu = [
          'Вешает на монстра метку на заданное количество минут. При его смерти в течение этого срока проверяется настроенный шанс захвата (с учётом бонуса Мистицизма > 100).',
          'Повторное наложение лишь продлевает время действующей метки (шанс при этом остаётся от первого сработавшего каста!).',
        ];
        mechanicsEn = [
          'Marks a non-humanoid monster for your set duration in minutes. When it dies while marked, rolls your configured Chance (boosted by Mysticism > 100) to trap its soul into an empty gem.',
          'Re-casting extends timer only (preserving original Chance).',
        ];
        mergeRu = 'Повтор только продлевает оставшиеся раунды метки.';
        mergeEn = 'Re-casting refreshes remaining duration only.';
        keywords = ['ловушка душ', 'камень душ', 'азура', 'soul trap', 'soul gem'];
        break;

      case 13: // Invisibility (0: Normal, 1: True)
        skillOvercapRu = 'Длительность невидимости продлевается при навыке Иллюзии > 100 (до ×1.40)!';
        skillOvercapEn = 'Duration scales up past Illusion 100 (up to ×1.40)!';
        if (sub === 0) {
          warning = {
            tone: 'warn',
            badgeRu: 'СЛЕТАЕТ ПРИ АТАКЕ',
            badgeEn: 'BREAKS ON ATTACK',
            titleRu: 'Пропадает мгновенно при ударе или враждебном касте',
            titleEn: 'Vanishes the instant you swing or cast offensively',
            textRu: '«Обычная» (Normal) невидимость на 100% прячет вас от обычного зрения врагов, но спадает в ту же секунду, как вы ударите врага или примените боевое заклинание. Чтобы драться оставаясь невидимым, выбирайте «Невидимость (Истинный)»!',
            textEn: 'Gives 100% visual concealment against normal enemy sight checks, yet breaks immediately when you attack or cast hostilely! Pick Invisibility (True) if you want combat stealth.',
          };
        }
        mechanicsRu = [
          sub === 0
            ? 'Делает заклинателя полностью невидимым в проверках зрения врагов на заданное время (плюс бонус длительности при Иллюзии > 100), пока вы не начнёте бой.'
            : 'Полностью скрывает вас от зрения врагов на заданное время (плюс бонус при Иллюзии > 100) и НЕ сбрасывается при атаке оружием или заклинаниях!',
          'Учтите: шум шагов/слух монстров и ближний радиус всё ещё работают по стандартным правилам ИИ.',
        ];
        mechanicsEn = [
          sub === 0
            ? 'Grants 100% concealment from normal enemy sight checks for your set duration (longer past Illusion 100), breaking as soon as you attack.'
            : 'Full concealment from normal sight checks for your set duration (scaled past Illusion 100) that stays active EVEN while attacking or casting!',
          'Note enemies can still detect noise/hearing or special proximity checks.',
        ];
        mergeRu = 'Повторный каст продлевает время действия, если оно дольше текущего.';
        mergeEn = 'Re-casting extends timer if longer.';
        keywords = ['невидимость', 'скрытность', 'стелс', 'invisibility', 'stealth', sub === 0 ? 'обычный' : 'истинный'];
        break;

      case 14: // Levitate
        warning = {
          tone: 'warn',
          badgeRu: 'ТОЛЬКО НА СЕБЯ · БАН НА АРЕНЕ',
          badgeEn: 'SELF-ONLY · BANNED IN SOME ZONES',
          titleRu: 'В отдельных испытаниях и зонах полёт принудительно отключён',
          titleEn: 'Disabled by zone rules on arenas / special trials (levitate: banned)',
          textRu: 'В особых местах с жёстким запретом полёта (например, арены или испытания паркура) левитация принудительно игнорируется движком. Скорость полёта фиксирована и от ползунков не зависит.',
          textEn: 'Forced off in special restricted zones such as arena bouts or certain parkour courses where levitation is banned. Flight speed is fixed with no magnitude slider.',
        };
        mechanicsRu = [
          'Позволяет свободно подниматься, опускаться и парить в воздухе (кнопки всплытия/погружения) на протяжении заданного времени в минутах.',
          'Нельзя кинуть на врага («Только на себя»). Повтор обновляет таймер.',
        ];
        mechanicsEn = [
          'Allows free 3D flight in mid-air (ascend/descend controls) for your configured duration in minutes.',
          'Caster-only. Re-casting refreshes timer.',
        ];
        keywords = ['левитация', 'полёт', 'воздух', 'levitate', 'fly'];
        break;

      case 15: // Light
        mechanicsRu = [
          'Создаёт переносимый источник света вокруг персонажа на выбранное время действия, освещая тёмные подземелья.',
          'Работает только «На себя» (выбор стихии не меняет цвет, канал Магия). Повторное наложение продлевает длительность.',
        ];
        mechanicsEn = [
          'Surrounds the caster with mobile illumination for your set duration inside dark dungeons.',
          'Caster-only. Re-casting refreshes remaining duration.',
        ];
        keywords = ['свет', 'факел', 'тьма', 'подземелье', 'light', 'torch'];
        break;

      case 16: // Lock
        warning = {
          tone: 'danger',
          badgeRu: 'ТОЛЬКО ДВЕРИ · ПОЧТИ БЕСПОЛЕЗНО',
          badgeEn: 'DOORS ONLY · LOW PRACTICAL USE',
          titleRu: 'Работает только с незапертыми дверями, шанс бросается при касте!',
          titleEn: 'Only locks unlocked doors; Chance rolls on cast, not on door click',
          textRu: '1) При самом касте проверяется настроенный шанс срабатывания, чтобы повесить на руки заряд запирания. 2) При последующем клике по НЕЗАПЕРТОЙ двери вешает на неё замок силой вашего уровня. На уже запертую дверь и на сундуки не действует!',
          textEn: '1) Rolls your Chance AT CAST TIME to arm a lock charge on your hands. 2) Clicking an UNLOCKED door locks it at your character Level. Refuses already-locked doors and does nothing to chests.',
        };
        mechanicsRu = [
          'После успешного каста «На себя» висит как бессрочный заряд до первого касания любой двери.',
        ];
        mechanicsEn = [
          'Caster-only: arms a permanent charge until you interact with a door.',
        ];
        keywords = ['запереть', 'замок', 'дверь', 'lock', 'door'];
        break;

      case 17: // Open
        warning = {
          tone: 'danger',
          badgeRu: 'ТОЛЬКО ДВЕРИ · ПРОВЕРКА УРОВНЯ НА КЛИКЕ',
          badgeEn: 'DOORS ONLY · CHECKS LEVEL ON CLICK',
          titleRu: 'Не взламывает на расстоянии и упирается в ваш уровень персонажа!',
          titleEn: 'Not ranged! Rolls Chance on cast, then checks Level vs Lock on door click',
          textRu: '1) Заклинание работает только «На себя»: сначала на самом касте бросается ваш настроенный шанс — при успехе на руках появляется заряд открывания. 2) Когда вы подойдёте и нажмёте на ЗАПЕРТУЮ дверь, замок откроется ТОЛЬКО если (уровень замка ≤ ваш уровень персонажа)! На запечатанные квестовые двери не действует.',
          textEn: '1) Caster-only: your Chance is rolled ON CAST to arm an unlock charge on your hands. 2) Clicking a locked door succeeds ONLY if (door lock level <= your Level), otherwise "Lock is too powerful"! Does not open sealed doors or remote chests.',
        };
        mechanicsRu = [
          'Удобно накладывать перед запертой дверью: на касте сработал шанс → клик по двери автоматически проверяет уровень замка против уровня героя (или отмычки Скелетного ключа).',
        ];
        mechanicsEn = [
          'Arms an unlock charge on a passed cast Chance roll, then tests your character Level against the door’s lock rating on click.',
        ];
        keywords = ['открыть', 'взлом', 'дверь', 'сундук', 'замок', 'open', 'unlock', 'door'];
        break;

      case 18: // Regenerate
        skillOvercapRu = 'Каждый тик лечения усиливается при Восстановлении > 100 (до ×1.40)!';
        skillOvercapEn = 'Each regen tick scales up past Restoration 100 (up to ×1.40)!';
        warning = {
          tone: 'warn',
          badgeRu: 'СТАКАЕТСЯ ПО КЛЮЧУ 11 ПОЛЗУНКОВ',
          badgeEn: 'STACKS IF ANY SLIDER DIFFERS BY 1',
          titleRu: 'Сдвоенная регенерация через разницу в 1 шаг настроек',
          titleEn: 'Merges only if all 11 slider numbers match identically',
          textRu: 'Первый тик лечит МГНОВЕННО при касте, а далее — раз в игровую минуту (сила перебрасывается заново каждый тик!). Одинаковые заклинания регенерации сливаются (только продлевая время), но если сдвинуть любой ползунок во 2-м заклинании хотя бы на 1, можно повесить две регенерации разом!',
          textEn: 'Heals immediately on cast and then once per in-game minute (strength re-rolls each tick). Identical spells only extend duration, yet shifting ANY single slider by 1 lets multiple Regenerate buffs stack!',
        };
        mechanicsRu = [
          'Восстанавливает заданное количество здоровья каждый магический раунд на протяжении выбранного времени в минутах.',
          'Собственный навык Восстановления > 100 (для не-артефактных кастов) усиливает каждый тик до +40%.',
        ];
        mechanicsEn = [
          'Heals your rolled amount of HP every magic round for your configured duration in game minutes, starting immediately.',
          'Amplified by Restoration skill > 100 (up to +40%, except held magic items).',
        ];
        mergeRu = 'Полное совпадение всех 11 настроек → продлевает таймер. Отличие хоть на 1 → вешается рядом и лечит параллельно!';
        mergeEn = 'Exact 11-slider match → refreshes timer. Any difference → runs side-by-side!';
        keywords = ['регенерация', 'лечение', 'отхил', 'тик', 'regenerate', 'regen', 'hot'];
        break;

      case 19: // Silence
        skillOvercapRu = 'Шанс наложения тишины растёт при Мистицизме > 100 (до ×1.40, макс 100%)!';
        skillOvercapEn = 'Silence chance scales up past Mysticism 100 (up to ×1.40, cap 100%)!';
        mechanicsRu = [
          'Запрещает цели произносить любые заклинания на заданное время в игровых минутах — в отличие от Паралича, полностью отключает вражеских магов и личей!',
          'Можно выбирать любую стихию (полезно против врагов с иммунитетом к Магии или слабых к Яду/Холоду). Проверяет Сопротивление магии, ваш настроенный шанс (с бонусом > 100), защиту от стихии и Спасбросок.',
        ];
        mechanicsEn = [
          'Prevents the target from casting spells for your set duration in game minutes — unlike Paralyze, completely shuts down enemy spellcasters!',
          'Allows any element! Rolls Spell Resistance, your Chance (boosted past Mysticism 100), Elemental protection, and Saving Throw.',
        ];
        mergeRu = 'Повторный каст по уже немой цели обновляет время действия (но всё равно проверяет шанс!).';
        mergeEn = 'Re-casting refreshes timer if longer (still tests Chance roll!).';
        keywords = ['безмолвие', 'молчание', 'антимаг', 'silence', 'mute', 'caster'];
        break;

      case 20: // Spell Absorption
        warning = {
          tone: 'danger',
          badgeRu: 'КАП 50% · НУЖНО 100% МЕСТА · ВЕРНЁТ 50%',
          badgeEn: '50% CAP · NEEDS 100% SPACE · REFUNDS 50%',
          titleRu: '3 главных подвоха Поглощения (о которых игра не предупреждает!)',
          titleEn: '3 hidden rules: Destruction-only, 100% free space, 50% MP return',
          textRu: '1) В редакторе шанс с заклинания жёстко ограничен потолком 50%. 2) Глотает ТОЛЬКО атакующую школу Разрушения (Безмолвие, Паралич или Изгнание оно НЕ поглотит!). 3) Самое важное: чтобы поглотить удар, свободного места в вашей полоске маны должно хватать на ПОЛНЫЕ 100% цены эффекта (от вашего уровня!), а восстановится ровно ПОЛОВИНА (50%) этой цены! При полной мане удар пройдёт в лицо.',
          textEn: '1) Spell-granted Absorption caps at 50% in the editor. 2) ONLY blocks Destruction effects (Silence, Paralyze, and Dispel pass right through!). 3) Your MP bar MUST have empty space for 100% of the incoming effect cost (at recipient level), while only 50% of that cost is restored! If full on MP, you take full damage.',
        };
        mechanicsRu = [
          'На выбранное время действия даёт настроенный шанс (до 50% в редакторе) проглотить вражеский эффект Разрушения до проверки Отражения и Спасбросков.',
          'Среди активных заклинаний «Поглощения» берётся один максимальный шанс (не складывается), но к нему дополнительно могут работать зачарования (50%) и особенность карьеры (до 100%).',
        ];
        mechanicsEn = [
          'Grants your configured % chance (max 50%) for the set duration to swallow incoming Destruction slots before Reflection or Saving Throws.',
          'Multiple active Absorption spells take highest chance only (does not stack with other spells; gear/career roll separately).',
        ];
        mergeRu = 'Берётся наибольший активный шанс среди заклинаний; повтор лишь продлевает время.';
        mergeEn = 'Takes highest active chance; re-casting extends timer only.';
        keywords = ['поглощение', 'мана', 'щит', 'разрушение', 'absorption', 'absorb', '50%'];
        break;

      case 21: // Spell Reflection
        skillOvercapRu = 'Шанс отражения при наложении на себя усиливается при Тауматургии > 100 (до ×1.40, макс 100%)!';
        skillOvercapEn = 'Self-cast reflection chance scales up past Thaumaturgy 100 (up to ×1.40, cap 100%)!';
        warning = {
          tone: 'warn',
          badgeRu: 'ОТРАЖАЕТ ВЕСЬ КАСТ · НЕ СТАКАЕТСЯ',
          badgeEn: 'BOUNCES FULL SPELL ONCE · NO STACK',
          titleRu: 'Отражает заклинание целиком один раз, но проценты с разных кастов не складываются',
          titleEn: 'Bounces whole cast once back at caster; multiple spells do NOT sum',
          textRu: 'Если при проверке слота сработало Отражение, защитник не получает его действие, а ВСЁ входящее заклинание целиком рикошетит обратно в заклинателя (не более 1 отскока — бесконечного «пинг-понга» не бывает, самокаст от себя не отражается). Пока бафф активен, повторный обычный каст продлевает время без пересчёта процента.',
          textEn: 'When triggered, the defender ignores that slot AND the ENTIRE incoming spell rebounds onto its caster (capped at 1 bounce total; self-casts never reflect). Regular re-casts while active only extend remaining duration without overwriting the active %.',
        };
        mechanicsRu = [
          'На настроенное время даёт заданный шанс в % отразить вражеский слот обратно (проверяется сразу после Поглощения и до Сопротивления магии). При Тауматургии > 100 шанс на себя дополнительно растёт.',
          'Полезно тем, что работает даже против НЕ-Разрушения (например, Паралича и Безмолвия), в отличие от Поглощения.',
        ];
        mechanicsEn = [
          'Grants your configured % chance over its duration to reflect incoming enemy effects (checked right after Absorption, before Spell Resistance). Self-casts scale further past Thaumaturgy 100.',
          'Unlike Absorption, Reflection can bounce non-Destruction controls such as Paralyze and Silence!',
        ];
        mergeRu = 'Повторный обычный каст лишь продлевает оставшееся время (текущий % отражения сохраняется до окончания баффа).';
        mergeEn = 'Regular re-casting extends remaining duration only (active % stays until it expires).';
        keywords = ['отражение', 'зеркало', 'рикошет', 'reflection', 'reflect', 'mirror'];
        break;

      case 22: // Spell Resistance
        skillOvercapRu = 'Шанс сопротивления при наложении на себя усиливается при Тауматургии > 100 (до ×1.40, макс 100%)!';
        skillOvercapEn = 'Self-cast resistance chance scales up past Thaumaturgy 100 (up to ×1.40, cap 100%)!';
        warning = {
          tone: 'warn',
          badgeRu: 'НЕ «−30% УРОНА», А ШАНС БЛОКА «ВСЁ ИЛИ НИЧЕГО»',
          badgeEn: 'ALL-OR-NOTHING NEGATE CHANCE',
          titleRu: 'Даёт вероятность полностью отменить слот (0%), а не урезать урон',
          titleEn: 'Rolls full-negate chance per slot (0% vs 100%) — NOT % damage reduction',
          textRu: '«Сопротивление заклинаниям 40%» означает 40% шанс вообще НЕ получить действие вражеского слота (0 эффекта) — но в оставшихся 60% случаев он пройдёт по вам на все 100% (дальше работает только спасбросок стихии). Пока бафф активен, повторный обычный каст продлевает время, не меняя старый процент.',
          textEn: '40% Spell Resistance means a 40% chance to shrug off an enemy slot completely (0 effect), and a 60% chance to take full 100% effect (into normal saves). Regular re-casts extend duration without changing the active %.',
        };
        mechanicsRu = [
          'На настроенное время даёт общий шанс (в %) полностью игнорировать любой вражеский слот заклинания (кроме ваших собственных кастов «На себя»). Навык Тауматургии > 100 усиливает шанс при касте на себя.',
        ];
        mechanicsEn = [
          'Grants your configured % chance over its duration to completely negate any non-self spell slot before Chance & Saving Throw checks. Self-casts scale past Thaumaturgy 100.',
        ];
        mergeRu = 'Повторный обычный каст лишь продлевает оставшуюся длительность (текущий % сохраняется).';
        mergeEn = 'Regular re-casting refreshes remaining duration only.';
        keywords = ['сопротивление магии', 'резист', 'блок', 'resistance', 'magic resist'];
        break;

      case 23: // Chameleon (0: Normal, 1: True)
        skillOvercapRu = 'Длительность хамелеона продлевается при Иллюзии > 100 (до ×1.40)!';
        skillOvercapEn = 'Duration scales past Illusion 100 (up to ×1.40)!';
        warning = {
          tone: 'warn',
          badgeRu: sub === 0 ? '92% СКРЫТА · ХУЖЕ ТЕНИ · СЛЕТАЕТ В БОЮ' : '92% СКРЫТА · ХУЖЕ ТЕНИ ПО СТАТАМ',
          badgeEn: sub === 0 ? '92% CONCEAL · WEAKER THAN SHADOW · BREAKS' : '92% CONCEAL · WEAKER THAN SHADOW',
          titleRu: 'В коде стоит столько же, сколько «Тень», но прячет хуже (92% против 96%)!',
          titleEn: 'Costs the exact same SP/Gold as Shadow, yet hides worse (92% vs 96%)!',
          textRu: `Внутри движка у «Хамелеона» шанс, что враг не заметит вас при проверке зрения — 92% (8% шанс провала), тогда как эффект «Тень» стоит РОВНО столько же золота и маны, но даёт 96% (4% провала)!${sub === 0 ? ' А «Обычный» вариант ещё и сбрасывается при первой вашей атаке!' : ''}`,
          textEn: `In the sight formula, Chameleon leaves an 8% chance per check to spot you (~92% stealth), whereas Shadow costs the EXACT same MP/Gold and leaves only a 4% spot chance (~96% stealth)!${sub === 0 ? ' Also, Normal breaks immediately when you attack!' : ''}`,
        };
        mechanicsRu = [
          `Скрывает заклинателя от врагов с 92% шансом провала их проверки зрения на заданное время (длительность растёт при Иллюзии > 100).${sub === 1 ? ' Истинный вариант НЕ спадает при ударах и касте!' : ''}`,
        ];
        mechanicsEn = [
          `Conceals you with a 92% miss rate on enemy sight checks for your set duration (longer past Illusion 100).${sub === 1 ? ' True Chameleon never breaks in combat!' : ''}`,
        ];
        mergeRu = 'Повтор обновляет оставшееся время действия.';
        mergeEn = 'Re-casting extends remaining timer only.';
        keywords = ['хамелеон', 'маскировка', 'стелс', 'тень', 'chameleon', 'stealth'];
        break;

      case 24: // Shadow (0: Normal, 1: True)
        skillOvercapRu = 'Длительность тени продлевается при Иллюзии > 100 (до ×1.40)!';
        skillOvercapEn = 'Duration scales past Illusion 100 (up to ×1.40)!';
        if (sub === 0) {
          warning = {
            tone: 'warn',
            badgeRu: '96% СКРЫТА · СЛЕТАЕТ ПРИ АТАКЕ',
            badgeEn: '96% CONCEAL · BREAKS ON ATTACK',
            titleRu: 'Скрывает лучше «Хамелеона» (96%), но спадает при атаке!',
            titleEn: 'Harder to spot than Chameleon (4% vs 8%), yet breaks on attack!',
            textRu: 'В отличие от «Хамелеона», за точно ту же цену даёт врагам всего 4% шанс вас заметить (вдвое реже!) вместо 8%. Но «Обычный» вариант мгновенно слетает при ударе или враждебном касте — для боя берите «Тень (Истинный)».',
            textEn: 'Costs the exact same as Chameleon while halving enemy spot odds (4% vs 8%)! Beware that Normal drops the instant you strike — pick Shadow (True) for combat.',
          };
        }
        mechanicsRu = [
          `Окутывает персонажа тенью на настроенное время (длительность усиливается Иллюзией > 100). Внутри движка «Тень» скрывает лучше «Хамелеона» за ту же цену: враги замечают вас лишь с шансом 4% за проверку (против 8% у Хамелеона).${sub === 1 ? ' «Истинный» вариант НЕ пропадает при атаках и заклинаниях!' : ''}`,
        ];
        mechanicsEn = [
          `Shrouds you for your set duration (scaled past Illusion 100). Costs the exact same as Chameleon while offering strictly stronger stealth: enemies have only a 4% spot chance per sight check (vs 8% for Chameleon).${sub === 1 ? ' True Shadow stays active right through combat!' : ''}`,
        ];
        mergeRu = 'Повтор продлевает оставшуюся длительность эффекта.';
        mergeEn = 'Re-casting refreshes remaining timer only.';
        keywords = ['тень', 'хамелеон', 'маскировка', 'стелс', 'shadow', 'shade', 'stealth'];
        break;

      case 25: // Slowfall
        warning = {
          tone: 'warn',
          badgeRu: 'ЗАПРЕТ В ОСОБЫХ ЗОНАХ',
          badgeEn: 'RESTRICTED IN SOME ZONES',
          titleRu: 'Отключает урон от падения, кроме зон с принудительным запретом',
          titleEn: 'Cancels fall damage unless banned by zone rules',
          textRu: 'Замедляет падение и убирает урон от удара о землю. На отдельных испытаниях/аренах, где стоит запрет замедления падения, эффект игнорируется движком.',
          textEn: 'Prevents fall damage and cushions descent. Ignored on specialized challenge courses/arenas that explicitly ban Slowfall.',
        };
        mechanicsRu = [
          'Плавно замедляет падение персонажа с высоты на выбранное время («Только на себя»).',
        ];
        mechanicsEn = [
          'Caster-only buff that slows vertical falling and prevents fall damage for your configured duration.',
        ];
        keywords = ['падение', 'высота', 'перо', 'slowfall', 'fall'];
        break;

      case 26: // Free Action
        mechanicsRu = [
          'МГНОВЕННО снимает уже висящий на вас паралич в секунду каста (без всяких бросков шанса!) и даёт полный 100% иммунитет к новому параличу на всё настроенное время действия.',
          'Намного надёжнее и выгоднее «Излечения паралича» (3,2), потому что не может провалиться по шансу и держит защиту дальше.',
        ];
        mechanicsEn = [
          'Immediately removes active paralysis upon cast (with NO Chance roll!) and grants 100% paralysis immunity for your configured duration.',
          'Strictly superior in combat to Cure Paralyzation since it never fizzles and keeps protecting afterwards.',
        ];
        keywords = ['свобода движения', 'антипаралич', 'иммунитет', 'free action', 'paralysis'];
        break;

      case 27: // Jumping
        warning = {
          tone: 'warn',
          badgeRu: 'СИЛА НЕ РЕГУЛИРУЕТСЯ (+0.6) · РУЛЕНИЕ В ВОЗДУХЕ',
          badgeEn: 'FLAT +0.6 JUMP · MID-AIR STEERING',
          titleRu: 'Фиксированный толчок +0.6 + управление полётом в прыжке',
          titleEn: 'Fixed +0.6 jump multiplier boost + unlocked mid-air movement',
          textRu: 'В редакторе нельзя настроить силу прыжка: заклинание всегда добавляет жёсткую прибавку +0.6 к множителю прыжка И самое крутое — разблокирует свободное управление движением (WASD / стрейф) прямо в воздухе во время прыжка!',
          textEn: 'Has no magnitude slider: always adds a flat +0.6 to your jump multiplier AND unlocks full mid-air steering while airborne (normally air momentum is locked on jump)!',
        };
        mechanicsRu = [
          'На выбранное время в минутах усиливает прыжок (+0.6) и позволяет поворачивать/подруливать в полёте.',
        ];
        mechanicsEn = [
          'Boosts jump factor by +0.6 and enables mid-air WASD/strafe steering for your configured duration.',
        ];
        keywords = ['прыжок', 'воздух', 'паркур', 'jumping', 'jump', 'air'];
        break;

      case 28: // Climbing
        mechanicsRu = [
          'На заданное количество игровых минут активирует магическое улучшение лазания, повышая надёжность подъёма по стенам и уступам и снижая риск сорваться.',
          'Дёшево по мане и удобно в многоуровневых подземельях и городах с высокими стенами.',
        ];
        mechanicsEn = [
          'Activates magical climbing enhancement for your set duration, improving wall-climb grip and traversal.',
          'Low SP cost; handy in vertical dungeons and walled cities.',
        ];
        keywords = ['лазание', 'стены', 'подъём', 'climbing', 'climb'];
        break;

      case 30: // Water Breathing
        mechanicsRu = [
          'На заданное время в минутах полностью отключает расход воздуха под водой (персонаж вообще не захлёбывается и не теряет воздух в затопленных залах и морях).',
          'Незаменимо для всех рас (особенно в глубоких затопленных подземельях).',
        ];
        mechanicsEn = [
          'Stops underwater breath loss completely for your set duration so you never drown in flooded dungeons or deep water.',
        ];
        keywords = ['вода', 'дыхание', 'под водой', 'утопление', 'water breathing', 'swim'];
        break;

      case 31: // Water Walking
        mechanicsRu = [
          'На настроенное время действия позволяет свободно бегать и стоять прямо на поверхности воды, как по твёрдой земле, не переходя в плавание.',
        ];
        mechanicsEn = [
          'Lets you stand and run directly on water surfaces as solid ground without swimming for your set duration.',
        ];
        keywords = ['хождение по воде', 'вода', 'поверхность', 'water walking', 'walk'];
        break;

      case 33: // Pacify (0: Animal, 1: Undead, 2: Humanoid, 3: Daedra)
        warning = {
          tone: 'warn',
          badgeRu: sub === 2 ? 'В 2 РАЗА ДОРОЖЕ «ОЧАРОВАНИЯ»!' : 'БОССЫ ИМУННЫ · СОРВЁТСЯ ОТ АТАКИ',
          badgeEn: sub === 2 ? '2× COST OF CHARM!' : 'BOSSES IMMUNE · BREAKS ON ATTACK',
          titleRu: sub === 2
            ? 'За полцены то же самое делает «Очарование» (34,255)!'
            : 'Боссы и цели с защитой игнорируют; любая атака возвращает вражду',
          titleEn: sub === 2
            ? 'Charm (34,255) does this exact effect for HALF the price!'
            : 'Bosses ignore it; attacking again makes target hostile',
          textRu: sub === 2
            ? '«Усмирение гуманоидов» по эффекту ПОЛНОСТЬЮ идентично «Очарованию» (34,255) той же школы, но в таблице цен стоит в 2+ раза дороже и не разрешает менять стихию! Боссы имунны, а первый же ваш удар снимет перемирие.'
            : `Успокаивает ТОЛЬКО группу «${subRu}». Боссы и особые квестовые враги с защитой от усмирения эффект не принимают. Усмирённое существо становится мирным, пока вы не атакуете его снова.`,
          textEn: sub === 2
            ? 'Pacify Humanoid works identically to Charm (34,255) in the same school, yet costs roughly TWICE as much and locks Magic element! Bosses are immune and attacking breaks peace.'
            : `Calms ONLY ${subEn} targets. Bosses/immune mobs ignore it; calmed creatures remain peaceful only until you attack them again.`,
        };
        mechanicsRu = [
          `При успешном броске настроенного шанса и провале вражеского спасброска делает существо типа «${subRu}» неагрессивным. Без таймера длительности — действует до вашей новой атаки.`,
        ];
        mechanicsEn = [
          `On a failed save and passed Chance check, turns ${subEn} targets non-hostile indefinitely until attacked by you again.`,
        ];
        mergeRu = 'Мгновенное переключение агрессии (до первой атаки игрока).';
        mergeEn = 'Instant aggro reset (until player attacks again).';
        keywords = ['усмирение', 'мир', 'босс', 'pacify', 'calm', subRu.toLowerCase(), subEn.toLowerCase()];
        break;

      case 34: // Charm
        warning = {
          tone: 'danger',
          badgeRu: 'НЕ ВЕРБУЕТ СОЮЗНИКОВ · ДУБЛИКАТ УСМИРЕНИЯ',
          badgeEn: 'HUMANOIDS ONLY · NO FOLLOWER / SHOP BUFF',
          titleRu: 'Не превращает в союзника и не даёт скидок — работает как дешёвое «Усмирение гуманоидов»!',
          titleEn: 'Does NOT recruit allies or charm merchants — acts like cheap Pacify Humanoid!',
          textRu: 'Вопреки названию, «Очарование» НЕ подчиняет врага себе и не меняет отношение торговцев/диалогов. В коде оно проверяет строго гуманоидов и переводит их в мирное состояние (до первой вашей атаки), ТОЧНО как «Усмирение гуманоидов», но при этом стоит примерно ВДВОЕ ДЕШЕВЛЕ и позволяет выбрать любую стихию! Боссы имунны.',
          textEn: 'Misleading name: Charm does NOT make enemies fight for you or boost merchant disposition. In the engine it strictly calms hostile Humanoids until attacked again — identical to Pacify Humanoid, except it costs roughly HALF as much and allows ANY element! Bosses are immune.',
        };
        mechanicsRu = [
          'При успешном срабатывании настроенного шанса и провале спасброска гуманоид прекращает атаку и становится мирным, пока вы не ударите его вновь.',
        ];
        mechanicsEn = [
          'Calms hostile Humanoids when your Chance passes and their Saving Throw fails, lasting until you strike them again.',
        ];
        mergeRu = 'Мгновенное переключение агрессии (только гуманоиды, до первой атаки).';
        mergeEn = 'Instant aggro reset on humanoids (until attacked again).';
        keywords = ['очарование', 'гуманоид', 'торговец', 'усмирение', 'charm', 'pacify', 'humanoid'];
        break;

      case 35: // Shield
        skillOvercapRu = 'Объём поглощения Щита растёт при Изменении > 100 (до ×1.40)!';
        skillOvercapEn = 'Shield absorb HP scales up past Alteration 100 (up to ×1.40)!';
        warning = {
          tone: 'warn',
          badgeRu: 'НЕ БРОНЯ (AR), А ВРЕМЕННОЕ ХП',
          badgeEn: 'ABSORB HP POOL, NOT ARMOR RATING',
          titleRu: 'Это временная подушка здоровья поверх HP, а не класс брони',
          titleEn: 'Creates an extra temporary HP cushion — NOT Armor Rating',
          textRu: 'Числовое значение щита не добавляет класс брони (AR) и не снижает процент урона. Это временный магический щит на заданное число единиц прочности поверх вашей полоски HP: пока он не сбит до 0 и не вышло время действия, весь входящий урон сжигает щит вместо здоровья. Навык Изменения > 100 усиливает прочность щита!',
          textEn: 'Its power value adds a temporary HP pool sitting above your health bar rather than Armor Rating. Incoming damage drains this barrier first until depleted or expired. Boosted past Alteration 100 (up to +40%)!',
        };
        mechanicsRu = [
          'Даёт барьер на заданное количество прочности (с ростом от навыка Изменения > 100) на выбранное время в игровых минутах.',
          'При повторном касте «Щит» не просто обновляет время, а ДОЗАРЯЖАЕТ оставшуюся броню вверх (в пределах потолка щита)!',
        ];
        mechanicsEn = [
          'Creates a barrier for your rolled HP strength (scaled past Alteration 100) over your set duration.',
          'Re-casting tops up remaining barrier HP toward its ceiling and extends duration!',
        ];
        mergeRu = 'Повтор доливает прочность (до максимума щита) и продлевает таймер.';
        mergeEn = 'Re-casting recharges remaining shield (min(ceiling, cur + roll)) and extends duration.';
        keywords = ['щит', 'броня', 'здоровье', 'подушка', 'shield', 'barrier', 'hp'];
        break;

      case 39: // Detect (0: Magic, 1: Enemy, 2: Treasure)
        warning = {
          tone: 'warn',
          badgeRu: 'РАДИУС НЕ НАСТРАИВАЕТСЯ',
          badgeEn: 'FIXED DETECTOR RADIUS',
          titleRu: 'Дальность задана игрой и не зависит от ползунков или навыка',
          titleEn: 'Only duration scales — detection range is fixed by engine',
          textRu: `Показывает метки («${subRu}») на компасе и детекторе на заданное время в минутах. В редакторе нельзя увеличить радиус поиска — дистанцию всегда определяет системный детектор.`,
          textEn: `Marks nearby ${subEn.toLowerCase()} on your compass/detector for your chosen duration. Range cannot be increased via sliders or skill.`,
        };
        mechanicsRu = [
          `На настроенное время («Только на себя») подсвечивает на компасе ближайшие объекты категории «${subRu}».`,
        ];
        mechanicsEn = [
          `Caster-only buff highlighting nearby ${subEn.toLowerCase()} targets on your compass for your set duration.`,
        ];
        keywords = ['обнаружение', 'компас', 'враги', 'магия', 'сокровища', 'detect', 'radar', 'compass'];
        break;

      case 40: // Identify
        warning = {
          tone: 'warn',
          badgeRu: 'ТОЛЬКО ИГРОК · ВОЗВРАТ МАНЫ ПРИ ОТМЕНЕ',
          badgeEn: 'PLAYER-ONLY · REFUNDS ON CANCEL',
          titleRu: 'Ману временно возвращают, пока вы не нажмёте «Опознать» предмет',
          titleEn: 'Temporarily refunds slot SP — spends only on item confirmation',
          textRu: '1) Действует только на игрока (на монстрах пропускается). 2) При касте мана за этот слот временно возвращается обратно в пул и окончательно списывается только в момент самой попытки опознания предмета (если передумаете и закроете окно отменой — ману вы не потеряете!).',
          textEn: '1) Skipped on all monsters and NPCs. 2) Temporarily refunds its slot SP when opening the item identification window and only spends SP when you actually confirm identifying an item — canceling loses zero SP for this slot!',
        };
        mechanicsRu = [
          'Открывает окно опознания неизвестных магических вещей в вашем инвентаре с проверкой настроенного шанса распознать предмет.',
        ];
        mechanicsEn = [
          'Caster-only utility that opens the item identification dialog using your configured Chance roll.',
        ];
        mergeRu = 'Мгновенное открытие интерфейса.';
        mergeEn = 'Instant UI trigger.';
        keywords = ['определить', 'опознание', 'вещи', 'предметы', 'identify', 'appraise'];
        break;

      case 43: // Teleport
        warning = {
          tone: 'warn',
          badgeRu: 'БЕЗ ПОЛЗУНКОВ · ТОЛЬКО «НА СЕБЯ»',
          badgeEn: 'NO SLIDERS · CASTER-ONLY',
          titleRu: 'Фиксированная цена, работает только «На себя» и уважает запреты зон',
          titleEn: 'Fixed cost, forced Caster Only, blocked in recall-refused zones',
          textRu: 'Не имеет ползунков силы, шанса или длительности — всегда использует базовую пару стоимости (320 баз. золота). При срабатывании открывает постановку Якоря или Возврат к нему. Блокируется на аренах и в зонах с запретом телепорта.',
          textEn: 'Has no duration/chance/magnitude sliders (fixed 320 base gold cost). Lets you set an Anchor or Recall to it. Ignored in zones/bouts where Recall is refused.',
        };
        mechanicsRu = [
          'Вызывает меню Якорь/Возврат (Anchor/Recall) для мгновенной телепортации к ранее отмеченной точке в мире.',
        ];
        mechanicsEn = [
          'Opens Anchor/Recall teleport menu when cast on yourself.',
        ];
        mergeRu = 'Мгновенное действие.';
        mergeEn = 'Instant action.';
        keywords = ['телепорт', 'якорь', 'возврат', 'teleport', 'anchor', 'recall'];
        break;

      case 44: // Comprehend Languages
        warning = {
          tone: 'warn',
          badgeRu: 'НЕ ПЕРЕВОДИТ ДИАЛОГИ NPC!',
          badgeEn: 'PASSIVE COMBAT PACIFY ONLY',
          titleRu: 'Не переводит тексты — усиливает только шанс мирной встречи с монстрами',
          titleEn: 'Does NOT translate NPC text — only aids language pacification rolls',
          textRu: 'Эффект не переводит чужую речь в книгах или окнах диалога! В движке он передаётся как бонус в формулу мирной встречи с существами (Языки/Этикет/Улица при первом появлении врага). Активные заклинания «Понимания языков» не складываются — берётся максимум.',
          textEn: 'Does NOT translate dialogues or books! Instead it adds a bonus to passive enemy language pacification rolls when first encountering language-speaking creatures. Multiple active casts take max chance only.',
        };
        mechanicsRu = [
          'На заданное время в минутах («Только на себя») даёт настроенный % шанс мирно разойтись с говорящими существами при первой встрече.',
        ];
        mechanicsEn = [
          'Caster-only buff granting your configured % bonus into first-encounter language pacification checks for your set duration.',
        ];
        mergeRu = 'Не складывается с другими копиями: берётся наибольший шанс, повтор обновляет таймер.';
        mergeEn = 'Takes highest Chance only; re-casting extends duration.';
        keywords = ['языки', 'понимание', 'этикет', 'перевод', 'умиротворение', 'languages', 'comprehend'];
        break;

      case 46: // Shared Cartography
        warning = {
          tone: 'warn',
          badgeRu: 'ТОЛЬКО В ОДНОМ ДАНЖЕ С ГРУППОЙ',
          badgeEn: 'PARTY IN SAME DUNGEON ONLY',
          titleRu: 'В одиночной игре бесполезно — работает только внутри одного подземелья',
          titleEn: 'Useless solo: shares automap only with party inside the SAME dungeon',
          textRu: 'Передаёт открытые вами участки карты подземелья только участникам вашей группы, которые прямо сейчас находятся в том же подземелье (и пока висит эффект!). Между разными данжами и в открытом мире не работает.',
          textEn: 'Draws your newly explored dungeon map tiles onto party members’ maps ONLY while they are inside the exact same dungeon and the buff is active.',
        };
        mechanicsRu = [
          'На выбранное время в минутах («Только на себя») синхронизирует ваш прогресс разведки карты подземелья с сопартийцами рядом.',
        ];
        mechanicsEn = [
          'Caster-only buff syncing explored dungeon automap segments with nearby party members for your configured duration.',
        ];
        keywords = ['карта', 'картография', 'группа', 'пати', 'подземелье', 'cartography', 'map', 'party'];
        break;

      default:
        mechanicsRu = ['Служебный эффект заклинания.'];
        mechanicsEn = ['Spell effect handler.'];
        break;
    }

    // Build exact formula table rows under spoiler cleanly using COST_TABLE & entity
    const skillVal = Number(entity?.skills?.[spec.schoolId] ?? 55);
    const sampleCost = root.__dfoSpellmakerData?.calcEffectCost?.(
      { type: effect.type, subType: effect.subType, key: effect.key, settings: root.__dfoSpellmakerData.defaultSettings() },
      entity,
    ) || { gold: 0, sp: 0 };

    const channelRu = spec.magicOnly
      ? 'Принудительно Магия (id=4), любой значок стихии'
      : 'По выбранной вами стихии заклинания (Огонь/Холод/Яд/Молния/Магия)';
    const channelEn = spec.magicOnly
      ? 'Forced Magic (id=4) regardless of chosen element'
      : 'Uses your chosen Spell Element (Fire/Cold/Poison/Shock/Magic)';

    const targetRule = TARGET_TEXT[spec.targets] || TARGET_TEXT[31];

    const spoilerRu = [
      ['Формула базовой цены', formatCostTerms(effect, spec, true)],
      [`Мин. цена (навык ${skillVal})`, `${sampleCost.gold} баз. зм → ~${sampleCost.sp} МП за слот (до множителя цели, общий минимум заклинания 5 МП)`],
    ];
    if (effect.duration) {
      spoilerRu.push(['Длительность (D)', 'D = База + Плюс × max(1, ⌊Уровень / Каждые_N⌋) раундов (1 раунд = 1 мин; 1-й сразу)']);
    }
    if (effect.chance) {
      const capStr = t === 20 ? '0–50%' : '0–100%';
      spoilerRu.push(['Шанс срабатывания (C)', `C = База + Плюс × ⌊Уровень / Каждые_N⌋ (зажато в ${capStr})`]);
    }
    if (effect.magnitude) {
      const isFatigueScale = ((t === 1 || t === 4) && sub === 1) || ((t === 10 || t === 11) && sub === 9);
      const scaleNote = isFatigueScale ? ' × 64 внутренне!' : '';
      spoilerRu.push(['Сила эффекта (M)', `M = (Случ[БазМин; БазМакс] + Случ[ПрибМин; ПрибМакс] × ⌊Уровень / Каждые_N⌋)${scaleNote}`]);
    }
    spoilerRu.push(
      ['Бонус навыка > 100', skillOvercapRu],
      ['Допустимые цели и канал', `${targetRule.ru} · Спасбросок: ${channelRu}`],
      ['Слияние и стаки', mergeRu],
    );

    const spoilerEn = [
      ['Base price formula', formatCostTerms(effect, spec, false)],
      [`Min slot cost (skill ${skillVal})`, `${sampleCost.gold} base gp → ~${sampleCost.sp} SP (before target mult; spell min 5 SP)`],
    ];
    if (effect.duration) {
      spoilerEn.push(['Duration (D)', 'D = Base + Plus × max(1, ⌊Level / PerLvl⌋) rounds (1 round = 1 min; 1st fires immediately)']);
    }
    if (effect.chance) {
      const capStr = t === 20 ? '0–50%' : '0–100%';
      spoilerEn.push(['Success Chance (C)', `C = Base + Plus × ⌊Level / PerLvl⌋ (clamped ${capStr})`]);
    }
    if (effect.magnitude) {
      const isFatigueScale = ((t === 1 || t === 4) && sub === 1) || ((t === 10 || t === 11) && sub === 9);
      const scaleNote = isFatigueScale ? ' × 64 internal Fatigue!' : '';
      spoilerEn.push(['Magnitude (M)', `M = (Rand[BaseLo; BaseHi] + Rand[PlusLo; PlusHi] × ⌊Level / PerLvl⌋)${scaleNote}`]);
    }
    spoilerEn.push(
      ['Skill > 100 overcap', skillOvercapEn],
      ['Targets & Save channel', `${targetRule.en} · Save: ${channelEn}`],
      ['Stacking & merging', mergeEn],
    );

    return {
      key: k,
      nameRu,
      nameEn,
      groupEn: effect.groupEn || nameEn,
      groupRu: effect.groupRu || nameRu,
      schoolId: spec.schoolId,
      school: SCHOOL_INFO[spec.schoolId] || SCHOOL_INFO[22],
      spec,
      warning,
      hasWarning: Boolean(warning),
      warningSeverity: warning?.tone || null,
      targetLabelRu: targetRule.ru,
      targetLabelEn: targetRule.en,
      channelLabelRu: spec.magicOnly ? 'Защита врага: всегда Магия' : 'Зависит от выбранной стихии',
      channelLabelEn: spec.magicOnly ? 'Blocked Only by Magic' : 'Uses Chosen Element',
      skillBoosted: Boolean(
        ((t === 1 || t === 4) && sub === 0)
        || (t === 10 && sub === 8)
        || t === 12 || t === 13 || t === 18 || t === 19 || t === 21 || t === 22 || t === 23 || t === 24 || t === 35
        || (t === 6 && (sub === 1 || sub === 2)),
      ),
      mechanicsRu,
      mechanicsEn,
      tipsRu,
      tipsEn,
      spoilerRu,
      spoilerEn,
      searchHaystack: [
        nameRu, nameEn,
        SCHOOL_INFO[spec.schoolId]?.ru, SCHOOL_INFO[spec.schoolId]?.en,
        warning?.titleRu, warning?.titleEn,
        warning?.badgeRu, warning?.badgeEn,
        ...mechanicsRu, ...mechanicsEn,
        ...keywords,
      ].filter(Boolean).join(' ').toLowerCase(),
    };
  }

  const catalogListCache = new Map();
  const effectDetailsCache = new Map();

  function entitySkillSig(entity) {
    const sk = entity?.skills;
    if (!sk) return 'def';
    return `${sk[22] ?? 55},${sk[23] ?? 55},${sk[24] ?? 55},${sk[25] ?? 55},${sk[26] ?? 55},${sk[27] ?? 55}`;
  }

  function buildCatalogList(entity, lang = 'ru') {
    const Data = root.__dfoSpellmakerData;
    if (!Data) return [];
    const sig = entitySkillSig(entity);
    const cached = catalogListCache.get(sig);
    if (cached) return cached;
    const craftable = Data.EFFECTS.filter((e) => e.craftable);
    const list = craftable.map((ef) => {
      const spec = Data.getEffectSpec(ef.key);
      const details = buildMeta(ef, spec, entity);
      effectDetailsCache.set(`${sig}|${ef.key}`, details);
      return {
        effect: ef,
        details,
      };
    });
    if (catalogListCache.size > 16) catalogListCache.clear();
    catalogListCache.set(sig, list);
    return list;
  }

  function getEffectDetails(effect, entity, lang = 'ru') {
    const Data = root.__dfoSpellmakerData;
    if (!effect || !Data) return null;
    const sig = entitySkillSig(entity);
    const ck = `${sig}|${effect.key}`;
    const hit = effectDetailsCache.get(ck);
    if (hit) return hit;
    const spec = Data.getEffectSpec(effect.key);
    const details = buildMeta(effect, spec, entity);
    if (effectDetailsCache.size > 256) effectDetailsCache.clear();
    effectDetailsCache.set(ck, details);
    return details;
  }

  root.__dfoSpellmakerCatalog = Object.freeze({
    SCHOOL_ORDER,
    SCHOOL_INFO,
    buildCatalogList,
    getEffectDetails,
  });
})(typeof window !== 'undefined' ? window : globalThis);

/* Modular Bilingual (RU / EN) Spell Name Generator for DFO Spellmaker.
 *
 * Construction formula (with automatic active-slot compaction when Slot 1 is empty):
 *   1st active effect -> Base   (База)
 *   2nd active effect -> Prefix (Префикс)
 *   3rd active effect -> Suffix (Суффикс)
 *
 * Special unique 1–2 word combinations:
 *   - 2 identical active effects -> dedicated DOUBLE pool
 *   - 3 identical active effects -> dedicated TRIPLE pool
 *   - 2 identical + 1 distinct   -> combines DOUBLE base with the distinct effect's Prefix/Suffix
 *
 * All Russian prefixes agree strictly with the Base noun's grammatical gender (m/f/n/p),
 * and every generated name fits cleanly within Daggerfall's 24-character limit without truncation. */
(function (root) {
  'use strict';

  const MAX_LEN = 24;

  // Compact helper for Russian adjective gender endings
  function adj(m, f, n, p) {
    return { m, f, n, p };
  }
  function noun(t, g) {
    return { t, g };
  }

  // Modular pools keyed by semantic effect family
  const POOLS = Object.freeze({
    // ==================== DESTRUCTION: DAMAGE (4,0) BY ELEMENT ====================
    dmg_fire: {
      ru: {
        base: [noun('Ожог', 'm'), noun('Сполох', 'm'), noun('Пламя', 'n'), noun('Жар', 'm'), noun('Искра', 'f')],
        prefix: [adj('Огненный', 'Огненная', 'Огненное', 'Огненные'), adj('Пылающий', 'Пылающая', 'Пылающее', 'Пылающие'), adj('Жгучий', 'Жгучая', 'Жгучее', 'Жгучие'), adj('Алый', 'Алая', 'Алое', 'Алые')],
        suffix: ['Огня', 'Жара', 'Пламени', 'Пепла'],
        double: [noun('Пекло', 'n'), noun('Испепеление', 'n'), noun('Огнешквал', 'm'), noun('Солнцежор', 'm')],
        triple: ['Апокалипсис', 'Пироклазм', 'Солнцепад', 'Инферно'],
      },
      en: {
        base: ['Flare', 'Ember', 'Blaze', 'Spark', 'Sear'],
        prefix: ['Blazing', 'Searing', 'Fiery', 'Ashen'],
        suffix: ['of Flame', 'of Fire', 'of Ash', 'of Embers'],
        double: ['Wildfire', 'Firestorm', 'Incinerate', 'Solar Burst'],
        triple: ['Cataclysm', 'Inferno', 'Sunfall', 'Pyroclasm'],
      },
    },
    dmg_cold: {
      ru: {
        base: [noun('Иней', 'm'), noun('Мороз', 'm'), noun('Стужа', 'f'), noun('Осколок', 'm'), noun('Лёд', 'm')],
        prefix: [adj('Ледяной', 'Ледяная', 'Ледяное', 'Ледяные'), adj('Мёрзлый', 'Мёрзлая', 'Мёрзлое', 'Мёрзлые'), adj('Хладный', 'Хладная', 'Хладное', 'Хладные'), adj('Зимний', 'Зимняя', 'Зимнее', 'Зимние')],
        suffix: ['Льда', 'Стужи', 'Хлада', 'Мороза'],
        double: [noun('Оледенение', 'n'), noun('Буран', 'm'), noun('Хладобой', 'm'), noun('Лютая Стужа', 'f')],
        triple: ['Абсолют', 'Вечный Лёд', 'Ледниковый Мор', 'Белый Предел'],
      },
      en: {
        base: ['Frost', 'Shard', 'Chill', 'Rime', 'Glacier'],
        prefix: ['Glacial', 'Frozen', 'Biting', 'Wintry'],
        suffix: ['of Frost', 'of Ice', 'of Chill', 'of Rime'],
        double: ['Deep Freeze', 'Blizzard', 'Frostbite', 'Coldsnap'],
        triple: ['Permafrost', 'Absolute Zero', 'Whiteout', 'Ice Age'],
      },
    },
    dmg_poison: {
      ru: {
        base: [noun('Яд', 'm'), noun('Укус', 'm'), noun('Гниль', 'f'), noun('Слизь', 'f'), noun('Отрава', 'f')],
        prefix: [adj('Ядовитый', 'Ядовитая', 'Ядовитое', 'Ядовитые'), adj('Едкий', 'Едкая', 'Едкое', 'Едкие'), adj('Чумной', 'Чумная', 'Чумное', 'Чумные'), adj('Тлетворный', 'Тлетворная', 'Тлетворное', 'Тлетворные')],
        suffix: ['Яда', 'Желчи', 'Тлена', 'Отравы'],
        double: [noun('Токсин', 'm'), noun('Ядопад', 'm'), noun('Разложение', 'n'), noun('Гнилобой', 'm')],
        triple: ['Чёрный Мор', 'Пандемия', 'Чумной Рой', 'Великий Тлен'],
      },
      en: {
        base: ['Venom', 'Bite', 'Blight', 'Toxin', 'Rot'],
        prefix: ['Venomous', 'Caustic', 'Noxious', 'Toxic'],
        suffix: ['of Venom', 'of Rot', 'of Blight', 'of Bile'],
        double: ['Putrefaction', 'Plagueburst', 'Acid Rain', 'Viper Strike'],
        triple: ['Black Plague', 'Pestilence', 'World Blight', 'Miasma'],
      },
    },
    dmg_shock: {
      ru: {
        base: [noun('Искра', 'f'), noun('Молния', 'f'), noun('Разряд', 'm'), noun('Гром', 'm'), noun('Дуга', 'f')],
        prefix: [adj('Грозовой', 'Грозовая', 'Грозовое', 'Грозовые'), adj('Искрящий', 'Искрящая', 'Искрящее', 'Искрящие'), adj('Штормовой', 'Штормовая', 'Штормовое', 'Штормовые'), adj('Ярый', 'Ярая', 'Ярое', 'Ярые')],
        suffix: ['Грома', 'Молний', 'Шторма', 'Искры'],
        double: [noun('Грозобой', 'm'), noun('Электрошок', 'm'), noun('Гроза', 'f'), noun('Вспышка Дуги', 'f')],
        triple: ['Судный Гром', 'Гнев Небес', 'Шторм Веков', 'Сверхмолния'],
      },
      en: {
        base: ['Bolt', 'Spark', 'Arc', 'Jolt', 'Shock'],
        prefix: ['Voltaic', 'Stormy', 'Crackling', 'Static'],
        suffix: ['of Storm', 'of Thunder', 'of Arcs', 'of Shock'],
        double: ['Thunderclap', 'Arc Surge', 'Tempest', 'Overload'],
        triple: ['Stormwrath', 'Fulmination', 'Skybreaker', 'Cataclysm Arc'],
      },
    },
    dmg_magic: {
      ru: {
        base: [noun('Удар', 'm'), noun('Импульс', 'm'), noun('Луч', 'm'), noun('Стрела', 'f'), noun('Всплеск', 'm')],
        prefix: [adj('Арканный', 'Арканная', 'Арканное', 'Арканные'), adj('Тайный', 'Тайная', 'Тайное', 'Тайные'), adj('Эфирный', 'Эфирная', 'Эфирное', 'Эфирные'), adj('Чистый', 'Чистая', 'Чистое', 'Чистые')],
        suffix: ['Арканы', 'Эфира', 'Силы', 'Магии'],
        double: [noun('Разрыв', 'm'), noun('Катаклизм', 'm'), noun('Эфиробой', 'm'), noun('Взрыв Маны', 'm')],
        triple: ['Аннигиляция', 'Крах Арканы', 'Разлом Эфира', 'Сингулярность'],
      },
      en: {
        base: ['Pulse', 'Lance', 'Blast', 'Beam', 'Surge'],
        prefix: ['Arcane', 'Aetheric', 'Mystic', 'Pure'],
        suffix: ['of Arcana', 'of Aether', 'of Force', 'of Power'],
        double: ['Arcane Burst', 'Rupture', 'Starblast', 'Force Wave'],
        triple: ['Annihilation', 'Arcane Ruin', 'Aether Rift', 'Singularity'],
      },
    },

    // ==================== DESTRUCTION: CONTINUOUS DAMAGE (1,0) BY ELEMENT ====================
    dot_fire: {
      ru: {
        base: [noun('Тление', 'n'), noun('Горение', 'n'), noun('Пожар', 'm'), noun('Зной', 'm')],
        prefix: [adj('Тлеющий', 'Тлеющая', 'Тлеющее', 'Тлеющие'), adj('Палящий', 'Палящая', 'Палящее', 'Палящие'), adj('Горящий', 'Горящая', 'Горящее', 'Горящие')],
        suffix: ['Тления', 'Пожара', 'Углей', 'Зноя'],
        double: [noun('Полыхание', 'n'), noun('Огнежор', 'm'), noun('Костёр', 'm')],
        triple: ['Вечный Пожар', 'Всесожжение', 'Пепелище'],
      },
      en: {
        base: ['Burn', 'Cinder', 'Pyre', 'Scorch'],
        prefix: ['Smoldering', 'Burning', 'Charred'],
        suffix: ['of Cinder', 'of Pyre', 'of Burning'],
        double: ['Conflagration', 'Slow Burn', 'Emberstorm'],
        triple: ['Eternal Pyre', 'Worldfire', 'Cinderfall'],
      },
    },
    dot_cold: {
      ru: {
        base: [noun('Озноб', 'm'), noun('Обморок', 'm'), noun('Изморозь', 'f'), noun('Холод', 'm')],
        prefix: [adj('Стылый', 'Стылая', 'Стылое', 'Стылые'), adj('Вьюжный', 'Вьюжная', 'Вьюжное', 'Вьюжные'), adj('Морозный', 'Морозная', 'Морозное', 'Морозные')],
        suffix: ['Вьюги', 'Озноба', 'Зимы', 'Инея'],
        double: [noun('Замерзание', 'n'), noun('Снежный Плен', 'm'), noun('Метель', 'f')],
        triple: ['Вечная Зима', 'Хлад Смерти', 'Ледяной Сон'],
      },
      en: {
        base: ['Freeze', 'Rime', 'Sleet', 'Chill'],
        prefix: ['Freezing', 'Numbing', 'Frosty'],
        suffix: ['of Sleet', 'of Winter', 'of Chill'],
        double: ['Frostlock', 'Cold Drift', 'Winterbite'],
        triple: ['Eternal Frost', 'Endless Winter', 'Frozen Tomb'],
      },
    },
    dot_poison: {
      ru: {
        base: [noun('Порча', 'f'), noun('Чума', 'f'), noun('Язва', 'f'), noun('Тлен', 'm')],
        prefix: [adj('Гнилой', 'Гнилая', 'Гнилое', 'Гнилые'), adj('Смрадный', 'Смрадная', 'Смрадное', 'Смрадные'), adj('Тленный', 'Тленная', 'Тленное', 'Тленные')],
        suffix: ['Чумы', 'Порчи', 'Гнили', 'Смрада'],
        double: [noun('Отравление', 'n'), noun('Гниение', 'n'), noun('Лихорадка', 'f')],
        triple: ['Смертный Мор', 'Гниль Миров', 'Недуг Бездны'],
      },
      en: {
        base: ['Plague', 'Decay', 'Scourge', 'Canker'],
        prefix: ['Rotting', 'Festering', 'Blighted'],
        suffix: ['of Plague', 'of Decay', 'of Scourge'],
        double: ['Wasting', 'Deep Rot', 'Toxic Decay'],
        triple: ['Deathblight', 'Grand Scourge', 'Final Decay'],
      },
    },
    dot_shock: {
      ru: {
        base: [noun('Шквал', 'm'), noun('Треск', 'm'), noun('Вихрь', 'm'), noun('Ток', 'm')],
        prefix: [adj('Бурный', 'Бурная', 'Бурное', 'Бурные'), adj('Трескучий', 'Трескучая', 'Трескучее', 'Трескучие'), adj('Вихревой', 'Вихревая', 'Вихревое', 'Вихревые')],
        suffix: ['Вихря', 'Бури', 'Тока', 'Разряда'],
        double: [noun('Штормоход', 'm'), noun('Грозовой Вал', 'm'), noun('Буря', 'f')],
        triple: ['Вечная Буря', 'Громовержец', 'Каскад Бурь'],
      },
      en: {
        base: ['Current', 'Squall', 'Storm', 'Static'],
        prefix: ['Surging', 'Storming', 'Arcing'],
        suffix: ['of Static', 'of Squall', 'of Surges'],
        double: ['Lightning Web', 'Shockwave', 'Stormfront'],
        triple: ['Endless Storm', 'Thunderlord', 'Maelstrom'],
      },
    },
    dot_magic: {
      ru: {
        base: [noun('Эрозия', 'f'), noun('Распад', 'm'), noun('Вихрь', 'm'), noun('Гнёт', 'm')],
        prefix: [adj('Гложущий', 'Гложущая', 'Гложущее', 'Гложущие'), adj('Зыбкий', 'Зыбкая', 'Зыбкое', 'Зыбкие'), adj('Тяжкий', 'Тяжкая', 'Тяжкое', 'Тяжкие')],
        suffix: ['Распада', 'Эрозии', 'Гнёта', 'Пустоты'],
        double: [noun('Разложение', 'n'), noun('Угасание', 'n'), noun('Вихрь Эфира', 'm')],
        triple: ['Полный Распад', 'Энтропия', 'Небытие'],
      },
      en: {
        base: ['Erosion', 'Flux', 'Decay', 'Shear'],
        prefix: ['Gnawing', 'Draining', 'Unstable'],
        suffix: ['of Flux', 'of Erosion', 'of Ruin'],
        double: ['Arcane Rot', 'Entropy', 'Dissolution'],
        triple: ['Total Entropy', 'Unmaking', 'Void Decay'],
      },
    },

    // ==================== DESTRUCTION: FATIGUE / MAGICKA / DRAIN / TRANSFER / DISINTEGRATE ====================
    dmg_fatigue: {
      ru: {
        base: [noun('Усталость', 'f'), noun('Измор', 'm'), noun('Истома', 'f'), noun('Упадок', 'm')],
        prefix: [adj('Тяжкий', 'Тяжкая', 'Тяжкое', 'Тяжкие'), adj('Томный', 'Томная', 'Томное', 'Томные'), adj('Вялый', 'Вялая', 'Вялое', 'Вялые')],
        suffix: ['Устали', 'Измора', 'Упадка', 'Тяжести'],
        double: [noun('Изнеможение', 'n'), noun('Обессилие', 'n'), noun('Упадок Сил', 'm')],
        triple: ['Коллапс', 'Мёртвый Сон', 'Полный Измор'],
      },
      en: {
        base: ['Fatigue', 'Slump', 'Lethargy', 'Weariness'],
        prefix: ['Draining', 'Heavy', 'Sapping'],
        suffix: ['of Sloth', 'of Fatigue', 'of Torpor'],
        double: ['Exhaustion', 'Collapse', 'Enfeeble'],
        triple: ['Total Collapse', 'Torpor', 'Dead Weight'],
      },
    },
    dmg_magicka: {
      ru: {
        base: [noun('Манолом', 'm'), noun('Осушка', 'f'), noun('Срыв', 'm'), noun('Пробой', 'm')],
        prefix: [adj('Пустой', 'Пустая', 'Пустое', 'Пустые'), adj('Сушащий', 'Сушащая', 'Сушащее', 'Сушащие'), adj('Сухой', 'Сухая', 'Сухое', 'Сухие')],
        suffix: ['Пустоты', 'Манолома', 'Засухи', 'Срыва'],
        double: [noun('Выжигание', 'n'), noun('Маносушка', 'f'), noun('Глухой Срыв', 'm')],
        triple: ['Магический Ноль', 'Мёртвая Мана', 'Иссушение'],
      },
      en: {
        base: ['Manaburn', 'Siphon', 'Null', 'Drain'],
        prefix: ['Siphoning', 'Null', 'Parched'],
        suffix: ['of Void', 'of Drain', 'of Null'],
        double: ['Mana Sever', 'Drywell', 'Aether Burn'],
        triple: ['Mana Void', 'Arcane Drought', 'Nullification'],
      },
    },
    disintegrate: {
      ru: {
        base: [noun('Прах', 'm'), noun('Пепел', 'm'), noun('Распыл', 'm'), noun('Тлен', 'm')],
        prefix: [adj('Праховой', 'Праховая', 'Праховое', 'Праховые'), adj('Стирающий', 'Стирающая', 'Стирающее', 'Стирающие'), adj('Смертный', 'Смертная', 'Смертное', 'Смертные')],
        suffix: ['Праха', 'Распыла', 'Забвения', 'Смерти'],
        double: [noun('Аннигилятор', 'm'), noun('Распыление', 'n'), noun('Истребление', 'n')],
        triple: ['Стирание', 'Перст Смерти', 'Конец Времён'],
      },
      en: {
        base: ['Dust', 'Ash', 'Oblivion', 'Ruin'],
        prefix: ['Rending', 'Erasing', 'Mortal'],
        suffix: ['of Dust', 'of Ruin', 'of Erasure'],
        double: ['Disintegrate', 'Ashmaker', 'Obliterate'],
        triple: ['Deathfinger', 'Total Erasure', 'Unmake'],
      },
    },
    drain_attr: {
      ru: {
        base: [noun('Порча', 'f'), noun('Ущерб', 'm'), noun('Сглаз', 'm'), noun('Проклятие', 'n')],
        prefix: [adj('Хворый', 'Хворая', 'Хворое', 'Хворые'), adj('Проклятый', 'Проклятая', 'Проклятое', 'Проклятые'), adj('Хилый', 'Хилая', 'Хилое', 'Хилые')],
        suffix: ['Порчи', 'Сглаза', 'Ущерба', 'Немощи'],
        double: [noun('Истощение', 'n'), noun('Тяжкий Сглаз', 'm'), noun('Проклятье', 'n')],
        triple: ['Великая Порча', 'Рок Немощи', 'Вечный Сглаз'],
      },
      en: {
        base: ['Curse', 'Hex', 'Bane', 'Wither'],
        prefix: ['Cursed', 'Withering', 'Blighted'],
        suffix: ['of Bane', 'of Wither', 'of Hex'],
        double: ['Deep Curse', 'Enfeeble', 'Dire Hex'],
        triple: ['Grand Curse', 'Soul Wither', 'Doomhex'],
      },
    },
    transfer: {
      ru: {
        base: [noun('Вытяжка', 'f'), noun('Жатва', 'f'), noun('Пир', 'm'), noun('Отбор', 'm')],
        prefix: [adj('Жадный', 'Жадная', 'Жадное', 'Жадные'), adj('Вампирский', 'Вампирская', 'Вампирское', 'Вампирские'), adj('Хищный', 'Хищная', 'Хищное', 'Хищные')],
        suffix: ['Жатвы', 'Крови', 'Отбора', 'Голода'],
        double: [noun('Кровосос', 'm'), noun('Вампиризм', 'm'), noun('Пир Крови', 'm')],
        triple: ['Алый Голод', 'Великая Жатва', 'Жор Жизни'],
      },
      en: {
        base: ['Leech', 'Siphon', 'Harvest', 'Tribute'],
        prefix: ['Vampiric', 'Hungry', 'Draining'],
        suffix: ['of Blood', 'of Leech', 'of Hunger'],
        double: ['Blood Feast', 'Life Siphon', 'Soul Drink'],
        triple: ['Crimson Feast', 'Grand Leech', 'Blood Harvest'],
      },
    },

    // ==================== RESTORATION ====================
    heal_health: {
      ru: {
        base: [noun('Здравие', 'n'), noun('Бальзам', 'm'), noun('Милость', 'f'), noun('Свет', 'm'), noun('Дар', 'm')],
        prefix: [adj('Целебный', 'Целебная', 'Целебное', 'Целебные'), adj('Светлый', 'Светлая', 'Светлое', 'Светлые'), adj('Живой', 'Живая', 'Живое', 'Живые'), adj('Благой', 'Благая', 'Благое', 'Благие')],
        suffix: ['Жизни', 'Милости', 'Света', 'Добра'],
        double: [noun('Благодать', 'f'), noun('Панацея', 'f'), noun('Живой Свет', 'm')],
        triple: ['Воскресение', 'Чудо Жизни', 'Свет Этериуса'],
      },
      en: {
        base: ['Mend', 'Balm', 'Grace', 'Heal', 'Salve'],
        prefix: ['Mending', 'Radiant', 'Blessed', 'Vital'],
        suffix: ['of Life', 'of Grace', 'of Light', 'of Dawn'],
        double: ['Panacea', 'Renewal', 'Sunlit Grace'],
        triple: ['Miracle', 'Resurrection', 'Aetherius Gift'],
      },
    },
    heal_fatigue: {
      ru: {
        base: [noun('Бодрость', 'f'), noun('Прилив', 'm'), noun('Вздох', 'm'), noun('Тонус', 'm')],
        prefix: [adj('Бодрый', 'Бодрая', 'Бодрое', 'Бодрые'), adj('Свежий', 'Свежая', 'Свежее', 'Свежие'), adj('Резвый', 'Резвая', 'Резвое', 'Резвые')],
        suffix: ['Бодрости', 'Прилива', 'Дыхания', 'Сил'],
        double: [noun('Обновление', 'n'), noun('Свежесть', 'f'), noun('Второе Дыхание', 'n'), noun('Прилив Сил', 'm')],
        triple: ['Неутомимость', 'Вечный Запал', 'Титан Сил'],
      },
      en: {
        base: ['Vigor', 'Breath', 'Surge', 'Pep'],
        prefix: ['Vigorous', 'Fresh', 'Brisk'],
        suffix: ['of Vigor', 'of Stamina', 'of Breath'],
        double: ['Revitalize', 'Second Wind', 'Pure Vigor'],
        triple: ['Tireless', 'Endless Vigor', 'Titan Breath'],
      },
    },
    heal_attr: {
      ru: {
        base: [noun('Возврат', 'm'), noun('Опора', 'f'), noun('Лад', 'm'), noun('Поправка', 'f')],
        prefix: [adj('Верный', 'Верная', 'Верное', 'Верные'), adj('Ясный', 'Ясная', 'Ясное', 'Ясные'), adj('Стройный', 'Стройная', 'Стройное', 'Стройные')],
        suffix: ['Опоры', 'Лада', 'Возврата', 'Стойкости'],
        double: [noun('Восстановление', 'n'), noun('Исправление', 'n'), noun('Чистый Лад', 'm')],
        triple: ['Первозданность', 'Совершенство', 'Чистый Исток'],
      },
      en: {
        base: ['Restore', 'Mend', 'Balance', 'Remedy'],
        prefix: ['Restoring', 'Steady', 'Pure'],
        suffix: ['of Balance', 'of Order', 'of Remedy'],
        double: ['Full Restore', 'Purify Self', 'True Form'],
        triple: ['Perfection', 'Rebirth', 'Pristine Self'],
      },
    },
    cure: {
      ru: {
        base: [noun('Очистка', 'f'), noun('Отвар', 'm'), noun('Снятие', 'n'), noun('Изгон', 'm')],
        prefix: [adj('Чистый', 'Чистая', 'Чистое', 'Чистые'), adj('Святой', 'Святая', 'Святое', 'Святые'), adj('Здравый', 'Здравая', 'Здравое', 'Здравые')],
        suffix: ['Чистоты', 'Здоровья', 'Очистки', 'Снятия'],
        double: [noun('Очищение', 'n'), noun('Противоядие', 'n'), noun('Святой Отвар', 'm')],
        triple: ['Абсолют Чистоты', 'Святая Купель', 'Неприкосновенность'],
      },
      en: {
        base: ['Cleanse', 'Purge', 'Cure', 'Elixir'],
        prefix: ['Pure', 'Sacred', 'Cleansing'],
        suffix: ['of Purity', 'of Cleansing', 'of Cure'],
        double: ['Purify', 'Antidote', 'Sacred Wash'],
        triple: ['Total Purity', 'Sanctuary', 'Immunity'],
      },
    },
    fortify: {
      ru: {
        base: [noun('Мощь', 'f'), noun('Подъём', 'm'), noun('Закалка', 'f'), noun('Напор', 'm')],
        prefix: [adj('Могучий', 'Могучая', 'Могучее', 'Могучие'), adj('Крепкий', 'Крепкая', 'Крепкое', 'Крепкие'), adj('Доблестный', 'Доблестная', 'Доблестное', 'Доблестные')],
        suffix: ['Мощи', 'Силы', 'Доблести', 'Закалки'],
        double: [noun('Величие', 'n'), noun('Триумф', 'm'), noun('Мощь Титана', 'f')],
        triple: ['Апофеоз', 'Божество', 'Титан Духа'],
      },
      en: {
        base: ['Might', 'Valor', 'Boon', 'Prowess'],
        prefix: ['Mighty', 'Stalwart', 'Heroic'],
        suffix: ['of Might', 'of Valor', 'of Titans'],
        double: ['Empower', 'Champion', 'Titan Boon'],
        triple: ['Apotheosis', 'Ascendant', 'Godlike'],
      },
    },
    regenerate: {
      ru: {
        base: [noun('Росток', 'm'), noun('Пульс', 'm'), noun('Родник', 'm'), noun('Исток', 'm')],
        prefix: [adj('Живучий', 'Живучая', 'Живучее', 'Живучие'), adj('Вечный', 'Вечная', 'Вечное', 'Вечные'), adj('Тёплый', 'Тёплая', 'Тёплое', 'Тёплые')],
        suffix: ['Родника', 'Истока', 'Живучести', 'Роста'],
        double: [noun('Регенерация', 'f'), noun('Живой Родник', 'm'), noun('Феникс', 'm')],
        triple: ['Бессмертие', 'Вечный Источник', 'Кровь Феникса'],
      },
      en: {
        base: ['Spring', 'Pulse', 'Bloom', 'Well'],
        prefix: ['Living', 'Undying', 'Flowing'],
        suffix: ['of Springs', 'of Renewal', 'of Bloom'],
        double: ['Regrowth', 'Phoenix Blood', 'Lifewell'],
        triple: ['Immortality', 'Eternal Spring', 'Undying'],
      },
    },
    absorb: {
      ru: {
        base: [noun('Губка', 'f'), noun('Чаша', 'f'), noun('Воронка', 'f'), noun('Глоток', 'm')],
        prefix: [adj('Жадный', 'Жадная', 'Жадное', 'Жадные'), adj('Алчущий', 'Алчущая', 'Алчущее', 'Алчущие'), adj('Глубокий', 'Глубокая', 'Глубокое', 'Глубокие')],
        suffix: ['Глотка', 'Чаши', 'Воронки', 'Маны'],
        double: [noun('Пожиратель', 'm'), noun('Античары', 'p'), noun('Чаша Маны', 'f')],
        triple: ['Поглотитель', 'Зеркало Маны', 'Бездонная Чаша'],
      },
      en: {
        base: ['Vessel', 'Chalice', 'Vortex', 'Siphon'],
        prefix: ['Absorbing', 'Drinking', 'Hollow'],
        suffix: ['of Siphon', 'of Chalice', 'of Absorption'],
        double: ['Spelleater', 'Mana Well', 'Arcane Sponge'],
        triple: ['Null Chalice', 'Spell Devourer', 'Bottomless'],
      },
    },
    free_action: {
      ru: {
        base: [noun('Воля', 'f'), noun('Прорыв', 'm'), noun('Свобода', 'f'), noun('Шаг', 'm')],
        prefix: [adj('Вольный', 'Вольная', 'Вольное', 'Вольные'), adj('Гибкий', 'Гибкая', 'Гибкое', 'Гибкие'), adj('Юркий', 'Юркая', 'Юркое', 'Юркие')],
        suffix: ['Воли', 'Свободы', 'Прорыва', 'Ветра'],
        double: [noun('Освобождение', 'n'), noun('Вольница', 'f'), noun('Разрыв Оков', 'm'), noun('Вольный Шаг', 'm')],
        triple: ['Абсолют Воли', 'Свобода Ветра', 'Вне Оков'],
      },
      en: {
        base: ['Freedom', 'Stride', 'Escape', 'Will'],
        prefix: ['Unbound', 'Free', 'Nimble'],
        suffix: ['of Freedom', 'of Will', 'of Wind'],
        double: ['Unchained', 'Breakout', 'Free Stride'],
        triple: ['Unstoppable', 'Sovereign Will', 'Chainbreaker'],
      },
    },

    // ==================== ILLUSION ====================
    invisibility: {
      ru: {
        base: [noun('Покров', 'm'), noun('Призрак', 'm'), noun('Вуаль', 'f'), noun('Туман', 'm')],
        prefix: [adj('Незримый', 'Незримая', 'Незримое', 'Незримые'), adj('Призрачный', 'Призрачная', 'Призрачное', 'Призрачные'), adj('Скрытый', 'Скрытая', 'Скрытое', 'Скрытые')],
        suffix: ['Призрака', 'Тумана', 'Вуали', 'Тайны'],
        double: [noun('Фантом', 'm'), noun('Призрачность', 'f'), noun('Чистый Покров', 'm')],
        triple: ['Небытие', 'Пустой Силуэт', 'Истинный Призрак'],
      },
      en: {
        base: ['Veil', 'Phantom', 'Fade', 'Shroud'],
        prefix: ['Unseen', 'Ghostly', 'Phantom'],
        suffix: ['of Ghosts', 'of Veil', 'of Vanishing'],
        double: ['Wraithform', 'Vanish', 'Ghost Shroud'],
        triple: ['Nonexistence', 'True Phantom', 'Blank Slate'],
      },
    },
    chameleon: {
      ru: {
        base: [noun('Мираж', 'm'), noun('Блик', 'm'), noun('Хамелеон', 'm'), noun('Маска', 'f')],
        prefix: [adj('Зыбкий', 'Зыбкая', 'Зыбкое', 'Зыбкие'), adj('Мерцающий', 'Мерцающая', 'Мерцающее', 'Мерцающие'), adj('Дымный', 'Дымная', 'Дымное', 'Дымные')],
        suffix: ['Миража', 'Бликов', 'Марева', 'Обмана'],
        double: [noun('Слияние', 'n'), noun('Марево', 'n'), noun('Иллюзия', 'f')],
        triple: ['Призма Обмана', 'Полный Мираж', 'Зеркальный Сон'],
      },
      en: {
        base: ['Mirage', 'Shimmer', 'Blur', 'Mask'],
        prefix: ['Shifting', 'Blurred', 'Hazy'],
        suffix: ['of Mirage', 'of Blur', 'of Glamour'],
        double: ['Blend In', 'Prism Veil', 'True Mirage'],
        triple: ['Master Mirage', 'Chameleon King', 'Glass Skin'],
      },
    },
    shadow: {
      ru: {
        base: [noun('Тень', 'f'), noun('Сумрак', 'm'), noun('Мгла', 'f'), noun('Полночь', 'f')],
        prefix: [adj('Теневой', 'Теневая', 'Теневое', 'Теневые'), adj('Сумрачный', 'Сумрачная', 'Сумрачное', 'Сумрачные'), adj('Ночной', 'Ночная', 'Ночное', 'Ночные')],
        suffix: ['Теней', 'Сумрака', 'Мглы', 'Ночи'],
        double: [noun('Полумрак', 'm'), noun('Мрак', 'm'), noun('Ночной Покров', 'm'), noun('Глубокая Тень', 'f')],
        triple: ['Повелитель Теней', 'Вечная Ночь', 'Царство Мглы'],
      },
      en: {
        base: ['Shadow', 'Dusk', 'Shade', 'Umbra'],
        prefix: ['Shadowy', 'Dusky', 'Umbral'],
        suffix: ['of Shadow', 'of Dusk', 'of Night'],
        double: ['Nightcloak', 'Shadowstep', 'Deep Shade'],
        triple: ['Shadowlord', 'Eternal Dusk', 'Pure Umbra'],
      },
    },
    light: {
      ru: {
        base: [noun('Факел', 'm'), noun('Светоч', 'm'), noun('Луч', 'm'), noun('Сияние', 'n')],
        prefix: [adj('Лучистый', 'Лучистая', 'Лучистое', 'Лучистые'), adj('Яркий', 'Яркая', 'Яркое', 'Яркие'), adj('Зоркий', 'Зоркая', 'Зоркое', 'Зоркие')],
        suffix: ['Луча', 'Светоча', 'Зари', 'Сияния'],
        double: [noun('Звезда', 'f'), noun('Рассвет', 'm'), noun('Яркий Светоч', 'm')],
        triple: ['Сверхновая', 'Вечный Рассвет', 'Солнце Тьмы'],
      },
      en: {
        base: ['Torch', 'Beacon', 'Gleam', 'Lantern'],
        prefix: ['Bright', 'Glowing', 'Luminous'],
        suffix: ['of Dawn', 'of Gleam', 'of Stars'],
        double: ['Starlight', 'Daybreak', 'Mage Lantern'],
        triple: ['Supernova', 'Eternal Dawn', 'Sun Orb'],
      },
    },

    // ==================== ALTERATION ====================
    shield: {
      ru: {
        base: [noun('Щит', 'm'), noun('Барьер', 'm'), noun('Панцирь', 'm'), noun('Оплот', 'm'), noun('Броня', 'f')],
        prefix: [adj('Бронный', 'Бронная', 'Бронное', 'Бронные'), adj('Щитовой', 'Щитовая', 'Щитовое', 'Щитовые'), adj('Охранный', 'Охранная', 'Охранное', 'Охранные'), adj('Каменный', 'Каменная', 'Каменное', 'Каменные')],
        suffix: ['Щита', 'Брони', 'Оплота', 'Панциря'],
        double: [noun('Твердыня', 'f'), noun('Эгида', 'f'), noun('Цитадель', 'f')],
        triple: ['Незыблемость', 'Великий Оплот', 'Алмазная Броня'],
      },
      en: {
        base: ['Shield', 'Ward', 'Shell', 'Carapace', 'Guard'],
        prefix: ['Warding', 'Ironclad', 'Guarded', 'Armored'],
        suffix: ['of Aegis', 'of Ward', 'of Iron', 'of Stone'],
        double: ['Bulwark', 'Aegis', 'Citadel'],
        triple: ['Bastion', 'Unbreakable', 'Diamond Ward'],
      },
    },
    paralyze: {
      ru: {
        base: [noun('Ступор', 'm'), noun('Оковы', 'p'), noun('Зажим', 'm'), noun('Камень', 'm')],
        prefix: [adj('Скованный', 'Скованная', 'Скованное', 'Скованные'), adj('Немой', 'Немая', 'Немое', 'Немые'), adj('Мёрзлый', 'Мёрзлая', 'Мёрзлое', 'Мёрзлые'), adj('Хваткий', 'Хваткая', 'Хваткое', 'Хваткие')],
        suffix: ['Оков', 'Ступора', 'Камня', 'Плена'],
        double: [noun('Оцепенение', 'n'), noun('Стазис', 'm'), noun('Каменный Плен', 'm')],
        triple: ['Вечный Стазис', 'Каменный Век', 'Мёртвая Хватка'],
      },
      en: {
        base: ['Bind', 'Stasis', 'Hold', 'Shackle'],
        prefix: ['Binding', 'Rigid', 'Paralyzing', 'Frozen'],
        suffix: ['of Chains', 'of Stasis', 'of Stone'],
        double: ['Petrify', 'Lockdown', 'Iron Bind'],
        triple: ['Eternal Stasis', 'Living Statue', 'Deadlock'],
      },
    },
    elem_resist: {
      ru: {
        base: [noun('Заслон', 'm'), noun('Отпор', 'm'), noun('Покров', 'm'), noun('Защита', 'f')],
        prefix: [adj('Стойкий', 'Стойкая', 'Стойкое', 'Стойкие'), adj('Упорный', 'Упорная', 'Упорное', 'Упорные'), adj('Закалённый', 'Закалённая', 'Закалённое', 'Закалённые')],
        suffix: ['Отпора', 'Заслона', 'Стойкости', 'Стихий'],
        double: [noun('Иммунитет', 'm'), noun('Стихийный Щит', 'm'), noun('Крепость', 'f')],
        triple: ['Вне Стихий', 'Абсолют Защиты', 'Алмазная Кожа'],
      },
      en: {
        base: ['Resist', 'Barrier', 'Mantle', 'Buffer'],
        prefix: ['Stout', 'Tempered', 'Warded'],
        suffix: ['of Resist', 'of Shelter', 'of Elements'],
        double: ['Element Guard', 'Immunity', 'Iron Skin'],
        triple: ['Unscathed', 'Elemental Wall', 'Pure Immunity'],
      },
    },
    jumping: {
      ru: {
        base: [noun('Прыжок', 'm'), noun('Рывок', 'm'), noun('Взлёт', 'm'), noun('Скачок', 'm')],
        prefix: [adj('Прыткий', 'Прыткая', 'Прыткое', 'Прыткие'), adj('Лёгкий', 'Лёгкая', 'Лёгкое', 'Лёгкие'), adj('Стремительный', 'Стремительная', 'Стремительное', 'Стремительные')],
        suffix: ['Прыжка', 'Рывка', 'Взлёта', 'Высоты'],
        double: [noun('Сверхпрыжок', 'm'), noun('Небесный Скачок', 'm'), noun('Прыжок Барса', 'm'), noun('Взрывной Рывок', 'm')],
        triple: ['Шаг Великана', 'Небесный Прыжок', 'Сверхрывок'],
      },
      en: {
        base: ['Leap', 'Vault', 'Bound', 'Spring'],
        prefix: ['Leaping', 'Springy', 'Agile'],
        suffix: ['of Leaping', 'of Bounds', 'of Springs'],
        double: ['Windbound', 'Skyvault', 'Giant Leap'],
        triple: ['Titan Leap', 'Heavenbound', 'Cloudjump'],
      },
    },
    climbing: {
      ru: {
        base: [noun('Хват', 'm'), noun('Коготь', 'm'), noun('Подъём', 'm'), noun('Уступ', 'm')],
        prefix: [adj('Цепкий', 'Цепкая', 'Цепкое', 'Цепкие'), adj('Ловкий', 'Ловкая', 'Ловкое', 'Ловкие'), adj('Паучий', 'Паучья', 'Паучье', 'Паучьи')],
        suffix: ['Хвата', 'Когтей', 'Скал', 'Подъёма'],
        double: [noun('Восхождение', 'n'), noun('Скалолаз', 'm'), noun('Паучий Шаг', 'm'), noun('Цепкие Когти', 'p')],
        triple: ['Покоритель Стен', 'Паук Теней', 'Вертикальный Путь'],
      },
      en: {
        base: ['Grip', 'Claw', 'Climb', 'Grasp'],
        prefix: ['Clinging', 'Spider', 'Gripping'],
        suffix: ['of Grip', 'of Claws', 'of Peaks'],
        double: ['Wallwalk', 'Spider Climb', 'Iron Grip'],
        triple: ['Peakmaster', 'Webwalker', 'Sheer Ascent'],
      },
    },
    slowfall: {
      ru: {
        base: [noun('Перо', 'n'), noun('Пух', 'm'), noun('Спуск', 'm'), noun('Планер', 'm')],
        prefix: [adj('Плавный', 'Плавная', 'Плавное', 'Плавные'), adj('Воздушный', 'Воздушная', 'Воздушное', 'Воздушные'), adj('Пуховый', 'Пуховая', 'Пуховое', 'Пуховые')],
        suffix: ['Пера', 'Спуска', 'Ветра', 'Плавности'],
        double: [noun('Невесомость', 'f'), noun('Планирование', 'n'), noun('Мягкий Спуск', 'm'), noun('Лёгкое Перо', 'n')],
        triple: ['Дуновение Неба', 'Крыло Зефира', 'Чистое Перо'],
      },
      en: {
        base: ['Feather', 'Drift', 'Glide', 'Float'],
        prefix: ['Feather', 'Gentle', 'Floating'],
        suffix: ['of Feather', 'of Drift', 'of Air'],
        double: ['Featherfall', 'Soft Glide', 'Air Cushion'],
        triple: ['Zephyr Wing', 'Weightless', 'Cloud Drift'],
      },
    },
    water_breathing: {
      ru: {
        base: [noun('Жабры', 'p'), noun('Вдох', 'm'), noun('Глубина', 'f'), noun('Пузырь', 'm')],
        prefix: [adj('Морской', 'Морская', 'Морское', 'Морские'), adj('Водный', 'Водная', 'Водное', 'Водные'), adj('Глубинный', 'Глубинная', 'Глубинное', 'Глубинные')],
        suffix: ['Глубин', 'Моря', 'Воды', 'Прилива'],
        double: [noun('Вододыхание', 'n'), noun('Дыхание Моря', 'n'), noun('Водные Жабры', 'p'), noun('Глубокий Вдох', 'm')],
        triple: ['Дитя Океана', 'Власть Глубин', 'Вечный Вдох'],
      },
      en: {
        base: ['Gills', 'Breath', 'Tide', 'Depth'],
        prefix: ['Marine', 'Tidal', 'Deep'],
        suffix: ['of Depths', 'of Tides', 'of Sea'],
        double: ['Waterlung', 'Sea Breath', 'Deep Gills'],
        triple: ['Oceanborn', 'Deep Sovereign', 'Endless Air'],
      },
    },

    // ==================== THAUMATURGY ====================
    levitate: {
      ru: {
        base: [noun('Полёт', 'm'), noun('Взлёт', 'm'), noun('Парение', 'n'), noun('Крыло', 'n')],
        prefix: [adj('Парящий', 'Парящая', 'Парящее', 'Парящие'), adj('Небесный', 'Небесная', 'Небесное', 'Небесные'), adj('Крылатый', 'Крылатая', 'Крылатое', 'Крылатые')],
        suffix: ['Полёта', 'Неба', 'Крыльев', 'Высоты'],
        double: [noun('Парение', 'n'), noun('Небесный Шаг', 'm'), noun('Крылья Ветра', 'p')],
        triple: ['Вознесение', 'Власть Небес', 'Свободный Полёт'],
      },
      en: {
        base: ['Flight', 'Wing', 'Ascent', 'Soar'],
        prefix: ['Soaring', 'Winged', 'Skyborn'],
        suffix: ['of Flight', 'of Skies', 'of Wings'],
        double: ['Skywalk', 'Windflight', 'Levitation'],
        triple: ['Ascension', 'Sky Sovereign', 'True Flight'],
      },
    },
    reflect: {
      ru: {
        base: [noun('Зеркало', 'n'), noun('Отскок', 'm'), noun('Отсвет', 'm'), noun('Грань', 'f')],
        prefix: [adj('Зеркальный', 'Зеркальная', 'Зеркальное', 'Зеркальные'), adj('Обратный', 'Обратная', 'Обратное', 'Обратные'), adj('Стеклянный', 'Стеклянная', 'Стеклянное', 'Стеклянные')],
        suffix: ['Зеркала', 'Отскока', 'Граней', 'Эха'],
        double: [noun('Отражение', 'n'), noun('Двойное Зеркало', 'n'), noun('Рикошет', 'm')],
        triple: ['Призма Возврата', 'Зеркало Судьбы', 'Полный Отскок'],
      },
      en: {
        base: ['Mirror', 'Prism', 'Echo', 'Glass'],
        prefix: ['Mirrored', 'Reflecting', 'Prismatic'],
        suffix: ['of Mirrors', 'of Echoes', 'of Prism'],
        double: ['Ricochet', 'Twin Mirror', 'Spellbounce'],
        triple: ['Fate Mirror', 'Grand Prism', 'Perfect Echo'],
      },
    },
    spell_resist: {
      ru: {
        base: [noun('Защита', 'f'), noun('Оберег', 'm'), noun('Предел', 'm'), noun('Стена', 'f')],
        prefix: [adj('Стойкий', 'Стойкая', 'Стойкое', 'Стойкие'), adj('Закрытый', 'Закрытая', 'Закрытое', 'Закрытые'), adj('Рунный', 'Рунная', 'Рунное', 'Рунные')],
        suffix: ['Оберега', 'Предела', 'Защиты', 'Рун'],
        double: [noun('Рунный Барьер', 'm'), noun('Магостойкость', 'f'), noun('Оберег Мага', 'm')],
        triple: ['Глухая Стена', 'Антимагия', 'Неприступность'],
      },
      en: {
        base: ['Ward', 'Aegis', 'Charm', 'Seal'],
        prefix: ['Runic', 'Shielded', 'Arcane'],
        suffix: ['of Wards', 'of Runes', 'of Seals'],
        double: ['Spellward', 'Runic Wall', 'Magic Proof'],
        triple: ['Null Ward', 'Antimagic', 'Untouchable'],
      },
    },
    water_walking: {
      ru: {
        base: [noun('Поступь', 'f'), noun('Гладь', 'f'), noun('Тропа', 'f'), noun('Мост', 'm')],
        prefix: [adj('Речной', 'Речная', 'Речное', 'Речные'), adj('Озёрный', 'Озёрная', 'Озёрное', 'Озёрные'), adj('Лёгкий', 'Лёгкая', 'Лёгкое', 'Лёгкие')],
        suffix: ['Глади', 'Волн', 'Рек', 'Тропы'],
        double: [noun('Водоход', 'm'), noun('Водная Тропа', 'f'), noun('Шаг Волны', 'm')],
        triple: ['Властитель Волн', 'Дорога Морей', 'Небесная Гладь'],
      },
      en: {
        base: ['Step', 'Path', 'Stride', 'Tread'],
        prefix: ['Surface', 'Wave', 'Skimming'],
        suffix: ['of Waves', 'of Rivers', 'of Water'],
        double: ['Wavewalk', 'Waterstep', 'Tide Stride'],
        triple: ['Sea Walker', 'Wave Master', 'Ocean Path'],
      },
    },
    pacify: {
      ru: {
        base: [noun('Покой', 'm'), noun('Мир', 'm'), noun('Узда', 'f'), noun('Тишь', 'f')],
        prefix: [adj('Мирный', 'Мирная', 'Мирное', 'Мирные'), adj('Тихий', 'Тихая', 'Тихое', 'Тихие'), adj('Кроткий', 'Кроткая', 'Кроткое', 'Кроткие')],
        suffix: ['Покоя', 'Мира', 'Узды', 'Кротости'],
        double: [noun('Усмирение', 'n'), noun('Глубокий Мир', 'm'), noun('Тихая Узда', 'f')],
        triple: ['Великий Покой', 'Абсолют Мира', 'Вечная Тишь'],
      },
      en: {
        base: ['Calm', 'Peace', 'Truce', 'Hush'],
        prefix: ['Calming', 'Gentle', 'Peaceful'],
        suffix: ['of Peace', 'of Calm', 'of Truce'],
        double: ['Pacify', 'Deep Calm', 'True Truce'],
        triple: ['Grand Peace', 'Serenity', 'Total Calm'],
      },
    },
    charm: {
      ru: {
        base: [noun('Чары', 'p'), noun('Обаяние', 'n'), noun('Шёпот', 'm'), noun('Взор', 'm')],
        prefix: [adj('Сладкий', 'Сладкая', 'Сладкое', 'Сладкие'), adj('Манящий', 'Манящая', 'Манящее', 'Манящие'), adj('Дивный', 'Дивная', 'Дивное', 'Дивные')],
        suffix: ['Чар', 'Шёпота', 'Грёз', 'Плена'],
        double: [noun('Очарование', 'n'), noun('Сладкий Плен', 'm'), noun('Зов Сердца', 'm')],
        triple: ['Пленение Воли', 'Венец Чар', 'Абсолют Обаяния'],
      },
      en: {
        base: ['Charm', 'Whisper', 'Allure', 'Glamour'],
        prefix: ['Beguiling', 'Sweet', 'Winning'],
        suffix: ['of Charm', 'of Allure', 'of Grace'],
        double: ['Enthrall', 'Captivate', 'Honeyed Word'],
        triple: ['True Devotion', 'Heartbind', 'Grand Allure'],
      },
    },
    detect: {
      ru: {
        base: [noun('Взор', 'm'), noun('Око', 'n'), noun('Чутьё', 'n'), noun('Компас', 'm')],
        prefix: [adj('Зоркий', 'Зоркая', 'Зоркое', 'Зоркие'), adj('Вещий', 'Вещая', 'Вещее', 'Вещие'), adj('Чуткий', 'Чуткая', 'Чуткое', 'Чуткие')],
        suffix: ['Взора', 'Чутья', 'Поиска', 'Истины'],
        double: [noun('Ясновидение', 'n'), noun('Вещее Око', 'n'), noun('Зоркий След', 'm')],
        triple: ['Всевидение', 'Око Истины', 'Полный Обзор'],
      },
      en: {
        base: ['Sight', 'Eye', 'Sense', 'Pulse'],
        prefix: ['Keen', 'Seeing', 'Astral'],
        suffix: ['of Sight', 'of Truth', 'of Finding'],
        double: ['Clairvoyance', 'True Eye', 'Far Sight'],
        triple: ['Omniscience', 'All-Seeing', 'Truthseer'],
      },
    },
    identify: {
      ru: {
        base: [noun('Знание', 'n'), noun('Разбор', 'm'), noun('Ключ', 'm'), noun('Чтение', 'n')],
        prefix: [adj('Мудрый', 'Мудрая', 'Мудрое', 'Мудрые'), adj('Ясный', 'Ясная', 'Ясное', 'Ясные'), adj('Точный', 'Точная', 'Точное', 'Точные')],
        suffix: ['Знаний', 'Истины', 'Тайны', 'Сути'],
        double: [noun('Познание', 'n'), noun('Ясная Суть', 'f'), noun('Раскрытие', 'n')],
        triple: ['Откровение', 'Книга Сути', 'Полное Знание'],
      },
      en: {
        base: ['Lore', 'Insight', 'Cipher', 'Key'],
        prefix: ['Wise', 'Lucid', 'Knowing'],
        suffix: ['of Lore', 'of Secrets', 'of Clarity'],
        double: ['Analyze', 'True Name', 'Deep Lore'],
        triple: ['Revelation', 'Grand Lore', 'Total Insight'],
      },
    },

    // ==================== MYSTICISM ====================
    soul_trap: {
      ru: {
        base: [noun('Силок', 'm'), noun('Узел', 'm'), noun('Клетка', 'f'), noun('Плен', 'm')],
        prefix: [adj('Тёмный', 'Тёмная', 'Тёмное', 'Тёмные'), adj('Ловчий', 'Ловчая', 'Ловчее', 'Ловчие'), adj('Мрачный', 'Мрачная', 'Мрачное', 'Мрачные')],
        suffix: ['Душ', 'Плена', 'Силков', 'Бездны'],
        double: [noun('Узилище', 'n'), noun('Жнец Душ', 'm'), noun('Камень Душ', 'm')],
        triple: ['Жатва Душ', 'Каирн Душ', 'Вечный Плен'],
      },
      en: {
        base: ['Snare', 'Cage', 'Trap', 'Noose'],
        prefix: ['Soulbound', 'Reaping', 'Spectral'],
        suffix: ['of Souls', 'of Capture', 'of Cairn'],
        double: ['Soulbind', 'Soul Reaper', 'Spirit Cage'],
        triple: ['Soul Harvest', 'Soul Cairn', 'Eternal Trap'],
      },
    },
    silence: {
      ru: {
        base: [noun('Тишь', 'f'), noun('Немота', 'f'), noun('Запрет', 'm'), noun('Обет', 'm')],
        prefix: [adj('Немой', 'Немая', 'Немое', 'Немые'), adj('Тихий', 'Тихая', 'Тихое', 'Тихие'), adj('Глухой', 'Глухая', 'Глухое', 'Глухие')],
        suffix: ['Немоты', 'Тишины', 'Запрета', 'Обета'],
        double: [noun('Безмолвие', 'n'), noun('Глухая Тишь', 'f'), noun('Замок Уст', 'm')],
        triple: ['Великий Обет', 'Мёртвая Тишь', 'Вечная Немота'],
      },
      en: {
        base: ['Hush', 'Mute', 'Silence', 'Vow'],
        prefix: ['Silent', 'Muted', 'Still'],
        suffix: ['of Silence', 'of Hush', 'of Vows'],
        double: ['Tonguetie', 'Dead Silence', 'Grand Hush'],
        triple: ['Absolute Mute', 'Void Silence', 'Final Vow'],
      },
    },
    dispel: {
      ru: {
        base: [noun('Снятие', 'n'), noun('Сброс', 'm'), noun('Изгон', 'm'), noun('Разрыв', 'm')],
        prefix: [adj('Чистящий', 'Чистящая', 'Чистящее', 'Чистящие'), adj('Разрывной', 'Разрывная', 'Разрывное', 'Разрывные'), adj('Пустой', 'Пустая', 'Пустое', 'Пустые')],
        suffix: ['Снятия', 'Изгона', 'Очистки', 'Сброса'],
        double: [noun('Рассеивание', 'n'), noun('Изгнание', 'n'), noun('Чистый Сброс', 'm')],
        triple: ['Великий Сброс', 'Крах Чар', 'Полный Сброс'],
      },
      en: {
        base: ['Dispel', 'Banish', 'Unbind', 'Purge'],
        prefix: ['Purging', 'Banishing', 'Null'],
        suffix: ['of Dispel', 'of Exile', 'of Null'],
        double: ['Exorcism', 'Severance', 'Grand Purge'],
        triple: ['Total Exile', 'Void Banish', 'Unravel'],
      },
    },
    open: {
      ru: {
        base: [noun('Ключ', 'm'), noun('Отмычка', 'f'), noun('Щелчок', 'm'), noun('Проход', 'm')],
        prefix: [adj('Открытый', 'Открытая', 'Открытое', 'Открытые'), adj('Ключевой', 'Ключевая', 'Ключевое', 'Ключевые'), adj('Вольный', 'Вольная', 'Вольное', 'Вольные')],
        suffix: ['Ключа', 'Взлома', 'Врат', 'Отмычки'],
        double: [noun('Взлом', 'm'), noun('Скелет-Ключ', 'm'), noun('Открытие Врат', 'n')],
        triple: ['Взлом Миров', 'Ключ Миров', 'Мастер-Ключ'],
      },
      en: {
        base: ['Key', 'Unlatch', 'Breach', 'Opener'],
        prefix: ['Unlocking', 'Master', 'Open'],
        suffix: ['of Keys', 'of Gates', 'of Entry'],
        double: ['Lockbreaker', 'Gateburst', 'Skeleton Key'],
        triple: ['Master Key', 'World Opener', 'No Barriers'],
      },
    },
    lock: {
      ru: {
        base: [noun('Замок', 'm'), noun('Засов', 'm'), noun('Печать', 'f'), noun('Запор', 'm')],
        prefix: [adj('Запорный', 'Запорная', 'Запорное', 'Запорные'), adj('Глухой', 'Глухая', 'Глухое', 'Глухие'), adj('Тайный', 'Тайная', 'Тайное', 'Тайные')],
        suffix: ['Замка', 'Засова', 'Печати', 'Запора'],
        double: [noun('Запечатка', 'f'), noun('Тайная Печать', 'f'), noun('Глухой Засов', 'm')],
        triple: ['Вечная Печать', 'Замок Веков', 'Мёртвый Засов'],
      },
      en: {
        base: ['Lock', 'Bolt', 'Seal', 'Latch'],
        prefix: ['Sealed', 'Locked', 'Bolted'],
        suffix: ['of Locks', 'of Seals', 'of Vaults'],
        double: ['Vaultlock', 'Arcane Seal', 'Iron Latch'],
        triple: ['Eternal Seal', 'Unopenable', 'Grand Vault'],
      },
    },
    teleport: {
      ru: {
        base: [noun('Якорь', 'm'), noun('Портал', 'm'), noun('Скачок', 'm'), noun('Врата', 'p')],
        prefix: [adj('Дальний', 'Дальняя', 'Дальнее', 'Дальние'), adj('Путевой', 'Путевая', 'Путевое', 'Путевые'), adj('Сквозной', 'Сквозная', 'Сквозное', 'Сквозные')],
        suffix: ['Якоря', 'Врат', 'Пути', 'Возврата'],
        double: [noun('Перенос', 'm'), noun('Возврат', 'm'), noun('Врата Пути', 'p'), noun('Быстрый Якорь', 'm')],
        triple: ['Прорыв Миров', 'Врата Обливиона', 'Вне Пространства'],
      },
      en: {
        base: ['Anchor', 'Portal', 'Recall', 'Gate'],
        prefix: ['Warping', 'Distant', 'Phasing'],
        suffix: ['of Gates', 'of Recall', 'of Paths'],
        double: ['Riftstep', 'Blink Gate', 'Recall Mark'],
        triple: ['Worldgate', 'Planar Rift', 'Instant Path'],
      },
    },
    create_item: {
      ru: {
        base: [noun('Призыв', 'm'), noun('Дар', 'm'), noun('Свиток', 'm'), noun('Облик', 'm')],
        prefix: [adj('Призывной', 'Призывная', 'Призывное', 'Призывные'), adj('Тканый', 'Тканая', 'Тканое', 'Тканые'), adj('Эфирный', 'Эфирная', 'Эфирное', 'Эфирные')],
        suffix: ['Призыва', 'Даров', 'Творения', 'Эфира'],
        double: [noun('Сотворение', 'n'), noun('Дар Бездны', 'm'), noun('Кузня Эфира', 'f')],
        triple: ['Демиург', 'Творец Эфира', 'Великий Дар'],
      },
      en: {
        base: ['Conjure', 'Gift', 'Relic', 'Forge'],
        prefix: ['Conjured', 'Woven', 'Summoned'],
        suffix: ['of Conjure', 'of Gifts', 'of Craft'],
        double: ['Manifest', 'Aether Forge', 'Void Gift'],
        triple: ['Demiurge', 'Pure Creation', 'Grand Relic'],
      },
    },
    languages: {
      ru: {
        base: [noun('Язык', 'm'), noun('Слово', 'n'), noun('Наречие', 'n'), noun('Голос', 'm')],
        prefix: [adj('Вещий', 'Вещая', 'Вещее', 'Вещие'), adj('Древний', 'Древняя', 'Древнее', 'Древние'), adj('Внятный', 'Внятная', 'Внятное', 'Внятные')],
        suffix: ['Слова', 'Языков', 'Речи', 'Наречий'],
        double: [noun('Толмач', 'm'), noun('Всеязычие', 'n'), noun('Древнее Слово', 'n')],
        triple: ['Голос Миров', 'Язык Богов', 'Глас Этериуса'],
      },
      en: {
        base: ['Tongue', 'Word', 'Voice', 'Speech'],
        prefix: ['Ancient', 'Spoken', 'Fluent'],
        suffix: ['of Tongues', 'of Speech', 'of Words'],
        double: ['Polyglot', 'All-Tongue', 'True Speech'],
        triple: ['Godtongue', 'Worldtongue', 'Elder Tongue'],
      },
    },
    cartography: {
      ru: {
        base: [noun('Карта', 'f'), noun('Атлас', 'm'), noun('След', 'm'), noun('Чертёж', 'm')],
        prefix: [adj('Путевой', 'Путевая', 'Путевое', 'Путевые'), adj('Звёздный', 'Звёздная', 'Звёздное', 'Звёздные'), adj('Верный', 'Верная', 'Верное', 'Верные')],
        suffix: ['Карты', 'Путей', 'Атласа', 'Троп'],
        double: [noun('Картография', 'f'), noun('Общий Атлас', 'm'), noun('Нить Путей', 'f')],
        triple: ['Атлас Миров', 'Всеобщая Карта', 'Карта Миров'],
      },
      en: {
        base: ['Atlas', 'Chart', 'Map', 'Trail'],
        prefix: ['Charted', 'Guided', 'Shared'],
        suffix: ['of Charts', 'of Trails', 'of Maps'],
        double: ['Wayfinder', 'Shared Atlas', 'True Map'],
        triple: ['World Atlas', 'Grand Chart', 'All Roads'],
      },
    },

    // ==================== SCHOOL FALLBACKS ====================
    school_22: {
      ru: { base: [noun('Кара', 'f'), noun('Гнев', 'm')], prefix: [adj('Яростный', 'Яростная', 'Яростное', 'Яростные')], suffix: ['Кары', 'Гнева'], double: [noun('Разрушение', 'n')], triple: ['Армагеддон'] },
      en: { base: ['Wrath', 'Bane'], prefix: ['Fierce'], suffix: ['of Wrath'], double: ['Destruction'], triple: ['Armageddon'] },
    },
    school_23: {
      ru: { base: [noun('Свет', 'm'), noun('Дар', 'm')], prefix: [adj('Благой', 'Благая', 'Благое', 'Благие')], suffix: ['Света', 'Благодати'], double: [noun('Милость', 'f')], triple: ['Возрождение'] },
      en: { base: ['Grace', 'Light'], prefix: ['Blessed'], suffix: ['of Grace'], double: ['Restoration'], triple: ['Rebirth'] },
    },
    school_24: {
      ru: { base: [noun('Мираж', 'm'), noun('Грёза', 'f')], prefix: [adj('Призрачный', 'Призрачная', 'Призрачное', 'Призрачные')], suffix: ['Иллюзий', 'Грёз'], double: [noun('Наваждение', 'n')], triple: ['Фантасмагория'] },
      en: { base: ['Glamour', 'Dream'], prefix: ['Illusory'], suffix: ['of Dreams'], double: ['Phantasm'], triple: ['Phantasmagoria'] },
    },
    school_25: {
      ru: { base: [noun('Сдвиг', 'm'), noun('Предел', 'm')], prefix: [adj('Меняющий', 'Меняющая', 'Меняющее', 'Меняющие')], suffix: ['Перемен', 'Формы'], double: [noun('Трансмутация', 'f')], triple: ['Метаморфоза'] },
      en: { base: ['Shift', 'Form'], prefix: ['Altered'], suffix: ['of Change'], double: ['Transmute'], triple: ['Metamorphosis'] },
    },
    school_26: {
      ru: { base: [noun('Схема', 'f'), noun('Знак', 'm')], prefix: [adj('Чертёжный', 'Чертёжная', 'Чертёжное', 'Чертёжные')], suffix: ['Схем', 'Чудес'], double: [noun('Тауматургия', 'f')], triple: ['Архитектор'] },
      en: { base: ['Sigil', 'Law'], prefix: ['Arcane'], suffix: ['of Laws'], double: ['Thaumaturgy'], triple: ['Grand Design'] },
    },
    school_27: {
      ru: { base: [noun('Тайна', 'f'), noun('Зов', 'm')], prefix: [adj('Тайный', 'Тайная', 'Тайное', 'Тайные')], suffix: ['Тайн', 'Обливиона'], double: [noun('Мистерия', 'f')], triple: ['Зов Обливиона'] },
      en: { base: ['Mystery', 'Rite'], prefix: ['Occult'], suffix: ['of Oblivion'], double: ['Mysticism'], triple: ['Oblivion Call'] },
    },
  });

  const ELEM_KEY_BY_ID = Object.freeze(['fire', 'cold', 'poison', 'shock', 'magic']);

  function resolvePoolKey(slot, elementId = 4, Data = null) {
    if (!slot || slot.type == null) return 'school_22';
    const t = Number(slot.type);
    const sub = Number(slot.subType ?? 255);
    const elKey = ELEM_KEY_BY_ID[elementId] || 'magic';

    if (t === 4) {
      if (sub === 1) return 'dmg_fatigue';
      if (sub === 2) return 'dmg_magicka';
      return 'dmg_' + elKey;
    }
    if (t === 1) {
      if (sub === 1) return 'dmg_fatigue';
      if (sub === 2) return 'dmg_magicka';
      return 'dot_' + elKey;
    }
    if (t === 0) return 'paralyze';
    if (t === 2) return 'create_item';
    if (t === 3) return 'cure';
    if (t === 5) return 'disintegrate';
    if (t === 6) return 'dispel';
    if (t === 7) return 'drain_attr';
    if (t === 8) return 'elem_resist';
    if (t === 9) return 'fortify';
    if (t === 10) return sub === 9 ? 'heal_fatigue' : (sub === 8 ? 'heal_health' : 'heal_attr');
    if (t === 11) return 'transfer';
    if (t === 12) return 'soul_trap';
    if (t === 13) return 'invisibility';
    if (t === 14) return 'levitate';
    if (t === 15) return 'light';
    if (t === 16) return 'lock';
    if (t === 17) return 'open';
    if (t === 18) return 'regenerate';
    if (t === 19) return 'silence';
    if (t === 20) return 'absorb';
    if (t === 21) return 'reflect';
    if (t === 22) return 'spell_resist';
    if (t === 23) return 'chameleon';
    if (t === 24) return 'shadow';
    if (t === 25) return 'slowfall';
    if (t === 26) return 'free_action';
    if (t === 27) return 'jumping';
    if (t === 28) return 'climbing';
    if (t === 30) return 'water_breathing';
    if (t === 31) return 'water_walking';
    if (t === 33) return 'pacify';
    if (t === 34) return 'charm';
    if (t === 35) return 'shield';
    if (t === 39) return 'detect';
    if (t === 40) return 'identify';
    if (t === 43) return 'teleport';
    if (t === 44) return 'languages';
    if (t === 46) return 'cartography';

    const sid = Data?.getEffectSpec?.(slot.key)?.schoolId ?? 22;
    return 'school_' + sid;
  }

  function hashInt(n) {
    let x = (n | 0) ^ 0x45d9f3b;
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function rotatedList(arr, seed) {
    if (!Array.isArray(arr) || !arr.length) return [];
    const start = hashInt(seed) % arr.length;
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      out.push(arr[(start + i) % arr.length]);
    }
    return out;
  }

  function sameEffect(a, b) {
    if (!a || !b) return false;
    return String(a.key) === String(b.key);
  }

  function cleanTitle(str) {
    const s = String(str || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function fit24(candidates, fallback) {
    for (let i = 0; i < candidates.length; i++) {
      const c = cleanTitle(candidates[i]);
      if (c && c.length <= MAX_LEN) return c;
    }
    const fb = cleanTitle(fallback || candidates[0] || '');
    if (fb.length <= MAX_LEN) return fb;
    // Word-safe trim if even fallback exceeded MAX_LEN
    const words = fb.split(' ');
    while (words.length > 1 && words.join(' ').length > MAX_LEN) words.pop();
    return words.join(' ').slice(0, MAX_LEN).trim();
  }

  function normStem(word) {
    return String(word || '')
      .toLowerCase()
      .replace(/^of\s+/i, '')
      .replace(/ё/g, 'е')
      .replace(/[^a-zа-я0-9]/g, '')
      .slice(0, 4);
  }

  function stemsClash(a, b) {
    const sa = normStem(a);
    const sb = normStem(b);
    return sa.length >= 3 && sb.length >= 3 && sa === sb;
  }

  function preferSingleWord(list, isRuLang) {
    const ones = [];
    const rest = [];
    for (const item of list) {
      const text = isRuLang ? item.t : item;
      if (!String(text || '').includes(' ')) ones.push(item);
      else rest.push(item);
    }
    return ones.concat(rest);
  }

  function composeRu(baseList, prefList, sufList) {
    const cands = [];
    const softCands = [];
    if (prefList && sufList) {
      // Try exact seeded combinations first, preferring non-clashing stems within <= 24 chars!
      for (const b of baseList) {
        const g = b.g || 'm';
        for (const p of prefList) {
          const pw = p[g] || p.m;
          for (const s of sufList) {
            const full = `${pw} ${b.t} ${s}`;
            if (stemsClash(pw, b.t) || stemsClash(pw, s) || stemsClash(b.t, s)) {
              softCands.push(full);
            } else {
              cands.push(full);
            }
          }
        }
      }
      for (const sc of softCands) cands.push(sc);
      // Fallback: 2-module combos if every 3-module combo exceeded 24 chars
      for (const b of baseList) {
        const g = b.g || 'm';
        for (const p of prefList) {
          const pw = p[g] || p.m;
          if (!stemsClash(pw, b.t)) cands.push(`${pw} ${b.t}`);
        }
      }
      for (const b of baseList) {
        for (const s of sufList) {
          if (!stemsClash(b.t, s)) cands.push(`${b.t} ${s}`);
        }
      }
    } else if (prefList) {
      for (const b of baseList) {
        const g = b.g || 'm';
        for (const p of prefList) {
          const pw = p[g] || p.m;
          const full = `${pw} ${b.t}`;
          if (stemsClash(pw, b.t)) softCands.push(full);
          else cands.push(full);
        }
      }
      for (const sc of softCands) cands.push(sc);
    } else if (sufList) {
      for (const b of baseList) {
        for (const s of sufList) {
          const full = `${b.t} ${s}`;
          if (stemsClash(b.t, s)) softCands.push(full);
          else cands.push(full);
        }
      }
      for (const sc of softCands) cands.push(sc);
    } else {
      for (const b of baseList) cands.push(b.t);
    }
    return fit24(cands, baseList[0]?.t || '');
  }

  function composeEn(baseList, prefList, sufList) {
    const cands = [];
    const softCands = [];
    if (prefList && sufList) {
      for (const b of baseList) {
        for (const p of prefList) {
          for (const s of sufList) {
            const full = `${p} ${b} ${s}`;
            if (stemsClash(p, b) || stemsClash(p, s) || stemsClash(b, s)) {
              softCands.push(full);
            } else {
              cands.push(full);
            }
          }
        }
      }
      for (const sc of softCands) cands.push(sc);
      for (const b of baseList) {
        for (const p of prefList) {
          if (!stemsClash(p, b)) cands.push(`${p} ${b}`);
        }
      }
      for (const b of baseList) {
        for (const s of sufList) {
          if (!stemsClash(b, s)) cands.push(`${b} ${s}`);
        }
      }
    } else if (prefList) {
      for (const b of baseList) {
        for (const p of prefList) {
          const full = `${p} ${b}`;
          if (stemsClash(p, b)) softCands.push(full);
          else cands.push(full);
        }
      }
      for (const sc of softCands) cands.push(sc);
    } else if (sufList) {
      for (const b of baseList) {
        for (const s of sufList) {
          const full = `${b} ${s}`;
          if (stemsClash(b, s)) softCands.push(full);
          else cands.push(full);
        }
      }
      for (const sc of softCands) cands.push(sc);
    } else {
      for (const b of baseList) cands.push(b);
    }
    return fit24(cands, baseList[0] || '');
  }

  function explain({ slots, element = 4, lang = 'ru', seed = 1, Data = null } = {}) {
    const raw = Array.isArray(slots) ? slots : [];
    const ordered = [];
    for (let i = 0; i < 3; i++) {
      if (raw[i] && raw[i].type != null) ordered.push({ slotIndex: i, slot: raw[i] });
    }
    if (!ordered.length) {
      return { name: '', mode: 'empty', roles: [], poolKeys: [], lang };
    }

    const L = lang === 'en' ? 'en' : 'ru';
    const isRuLang = L === 'ru';
    const keys = ordered.map((o) => resolvePoolKey(o.slot, element, Data));
    const pools = keys.map((k) => (POOLS[k] || POOLS.school_22)[L]);
    const s0 = hashInt((seed | 0) + 17);
    const s1 = hashInt((seed | 0) + 73);
    const s2 = hashInt((seed | 0) + 197);

    // 1 active effect -> Base (slot compaction: if Slot 1 is empty, Slot 2 or 3 becomes Base!)
    if (ordered.length === 1) {
      const bases = rotatedList(pools[0].base, s0);
      const name = isRuLang ? composeRu(bases, null, null) : composeEn(bases, null, null);
      return {
        name,
        mode: 'single',
        roles: [{ role: 'base', slotIndex: ordered[0].slotIndex, key: ordered[0].slot.key }],
        poolKeys: keys,
        lang: L,
      };
    }

    // 2 active effects -> Double unique (1-2 words) if identical, else Prefix(2nd) + Base(1st)
    if (ordered.length === 2) {
      if (sameEffect(ordered[0].slot, ordered[1].slot)) {
        const doubles = rotatedList(pools[0].double, s0);
        const name = isRuLang
          ? fit24(doubles.map((d) => d.t), doubles[0]?.t)
          : fit24(doubles, doubles[0]);
        return {
          name,
          mode: 'double',
          roles: [
            { role: 'double', slotIndex: ordered[0].slotIndex, key: ordered[0].slot.key },
            { role: 'double', slotIndex: ordered[1].slotIndex, key: ordered[1].slot.key },
          ],
          poolKeys: keys,
          lang: L,
        };
      }
      const bases = rotatedList(pools[0].base, s0);
      const prefs = rotatedList(pools[1].prefix, s1);
      const name = isRuLang ? composeRu(bases, prefs, null) : composeEn(bases, prefs, null);
      return {
        name,
        mode: 'pair',
        roles: [
          { role: 'base', slotIndex: ordered[0].slotIndex, key: ordered[0].slot.key },
          { role: 'prefix', slotIndex: ordered[1].slotIndex, key: ordered[1].slot.key },
        ],
        poolKeys: keys,
        lang: L,
      };
    }

    // 3 active effects:
    const eq01 = sameEffect(ordered[0].slot, ordered[1].slot);
    const eq12 = sameEffect(ordered[1].slot, ordered[2].slot);
    const eq02 = sameEffect(ordered[0].slot, ordered[2].slot);

    // 3 identical effects -> unique 1-2 word Triple name!
    if (eq01 && eq12) {
      const triples = rotatedList(pools[0].triple, s0);
      const name = fit24(triples, triples[0]);
      return {
        name,
        mode: 'triple',
        roles: ordered.map((o) => ({ role: 'triple', slotIndex: o.slotIndex, key: o.slot.key })),
        poolKeys: keys,
        lang: L,
      };
    }

    // 2 identical + 1 distinct -> elevate the duplicated effect via its Double base + distinct effect's Suffix or Prefix!
    if (eq01) {
      // [A, A, B] -> Double(A) + Suffix(B)
      const dBases = preferSingleWord(rotatedList(pools[0].double, s0), isRuLang);
      const sufs = rotatedList(pools[2].suffix, s2);
      const name = isRuLang ? composeRu(dBases, null, sufs) : composeEn(dBases, null, sufs);
      return {
        name,
        mode: 'double_plus_suffix',
        roles: [
          { role: 'double_base', slotIndex: ordered[0].slotIndex, key: ordered[0].slot.key },
          { role: 'double_base', slotIndex: ordered[1].slotIndex, key: ordered[1].slot.key },
          { role: 'suffix', slotIndex: ordered[2].slotIndex, key: ordered[2].slot.key },
        ],
        poolKeys: keys,
        lang: L,
      };
    }
    if (eq02) {
      // [A, B, A] -> Prefix(B) + Double(A)
      const dBases = preferSingleWord(rotatedList(pools[0].double, s0), isRuLang);
      const prefs = rotatedList(pools[1].prefix, s1);
      const name = isRuLang ? composeRu(dBases, prefs, null) : composeEn(dBases, prefs, null);
      return {
        name,
        mode: 'prefix_plus_double',
        roles: [
          { role: 'double_base', slotIndex: ordered[0].slotIndex, key: ordered[0].slot.key },
          { role: 'prefix', slotIndex: ordered[1].slotIndex, key: ordered[1].slot.key },
          { role: 'double_base', slotIndex: ordered[2].slotIndex, key: ordered[2].slot.key },
        ],
        poolKeys: keys,
        lang: L,
      };
    }
    if (eq12) {
      // [B, A, A] -> Prefix(A) + Base(B) + Suffix(A) (or Base(B) + Suffix(A) if tight)
      const bases = rotatedList(pools[0].base, s0);
      const prefs = rotatedList(pools[1].prefix, s1);
      const sufs = rotatedList(pools[2].suffix, s2);
      const name = isRuLang ? composeRu(bases, prefs, sufs) : composeEn(bases, prefs, sufs);
      return {
        name,
        mode: 'base_plus_double',
        roles: [
          { role: 'base', slotIndex: ordered[0].slotIndex, key: ordered[0].slot.key },
          { role: 'prefix', slotIndex: ordered[1].slotIndex, key: ordered[1].slot.key },
          { role: 'suffix', slotIndex: ordered[2].slotIndex, key: ordered[2].slot.key },
        ],
        poolKeys: keys,
        lang: L,
      };
    }

    // All 3 distinct -> Prefix(2nd) + Base(1st) + Suffix(3rd)
    const bases = rotatedList(pools[0].base, s0);
    const prefs = rotatedList(pools[1].prefix, s1);
    const sufs = rotatedList(pools[2].suffix, s2);
    const name = isRuLang ? composeRu(bases, prefs, sufs) : composeEn(bases, prefs, sufs);
    return {
      name,
      mode: 'full3',
      roles: [
        { role: 'base', slotIndex: ordered[0].slotIndex, key: ordered[0].slot.key },
        { role: 'prefix', slotIndex: ordered[1].slotIndex, key: ordered[1].slot.key },
        { role: 'suffix', slotIndex: ordered[2].slotIndex, key: ordered[2].slot.key },
      ],
      poolKeys: keys,
      lang: L,
    };
  }

  function generate(opts) {
    return explain(opts).name;
  }

  root.__dfoSpellmakerNameGen = Object.freeze({
    MAX_LEN,
    POOLS,
    resolvePoolKey,
    explain,
    generate,
  });
})(typeof window !== 'undefined' ? window : globalThis);
