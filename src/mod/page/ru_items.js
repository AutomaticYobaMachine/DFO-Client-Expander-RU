// DFO Mod - THE NAMES OF THINGS, IN RUSSIAN: an item's name as the game builds it in English and keeps it on the piece.
//
// DFO Online names a Magic, Rare or Legendary piece once, at the mint, and stores the English on the item: "Sentinel's
// Mail Hauberk of the Bear", "Wyrmbane", "Silver Flawless Ruby Ring", "Steel Repair Kit". The game's own language system
// translates a template's name by its index (the pack's Internal_Items), never such a name. This reads one back into
// Russian - the prefix an adjective agreeing with the piece's gender, the suffix after it: "Дозорный кольчужный хауберк
// медведя" - and is called from three places:
//   - the game's shownItemName, where a name the tables do not know is read (transforms.cjs ru.itemName);
//   - its maker's mark, a Potent potion and an heirloom's house (ru.itemParts);
//   - the RU runtime's first look at any text (ru_i18n.js __dfoRuFirst): a name in a chat line or a notice, and the
//     tooltip's affix lines ("+12% carrying capacity" -> "+12% к грузоподъёмности").
// A name it cannot read whole is left as it is: no half-Russian names.
(() => {
  'use strict';
  const C = globalThis.__DFO_MOD_CFG__?.ru ?? {};
  if (!C.on) return;
  const M = 0, F = 1, N = 2, P = 3;   // the four forms of an adjective: masculine, feminine, neuter, plural

  // ─── the pieces a name is built around (template names as the game stores them) ───
  const BASE = {
    // armour (DFU) and Roleplay & Realism: Items' own
    Cuirass: ['Кираса', F], Gauntlets: ['Латные перчатки', P], Greaves: ['Поножи', P], 'Left Pauldron': ['Левое наплечье', N],
    'Right Pauldron': ['Правое наплечье', N], Helm: ['Шлем', M], Boots: ['Сапоги', P], Buckler: ['Баклер', M],
    'Round Shield': ['Круглый щит', M], 'Kite Shield': ['Каплевидный щит', M], 'Tower Shield': ['Ростовой щит', M],
    Hauberk: ['Хауберк', M], Chausses: ['Шоссы', P], 'Left Spaulder': ['Левый наплечник', M], 'Right Spaulder': ['Правый наплечник', M],
    Sollerets: ['Сабатоны', P], Jerkin: ['Колет', M], Cuisse: ['Набедренник', M], Helmet: ['Шлем', M], Gloves: ['Перчатки', P],
    'Left Vambrace': ['Левый наруч', M], 'Right Vambrace': ['Правый наруч', M],
    // weapons
    Dagger: ['Кинжал', M], Tanto: ['Танто', N], Staff: ['Посох', M], Shortsword: ['Короткий меч', M], Wakizashi: ['Вакидзаси', N],
    Broadsword: ['Широкий меч', M], Saber: ['Сабля', F], Longsword: ['Длинный меч', M], Katana: ['Катана', F], Claymore: ['Клеймор', M],
    'Dai-katana': ['Дай-катана', F], Mace: ['Булава', F], Flail: ['Цеп', M], Warhammer: ['Боевой молот', M], 'Battle Axe': ['Боевой топор', M],
    'War Axe': ['Секира', F], 'Short Bow': ['Короткий лук', M], 'Long Bow': ['Длинный лук', M], Arrow: ['Стрела', F],
    "Archer's Axe": ['Топор лучника', M], 'Light Flail': ['Лёгкий цеп', M], 'Dwarven Thunderlock': ['Двемерский громострел', M],
    'Dwarven Pistolet': ['Двемерский пистолет', M], 'Hand Wraps': ['Обмотки для рук', P], 'Dwemer Pellet': ['Двемерская пуля', F],
    // jewellery
    Amulet: ['Амулет', M], Bracer: ['Наруч', M], Ring: ['Кольцо', N], Bracelet: ['Браслет', M], Mark: ['Метка', F], Torc: ['Гривна', F],
    'Cloth Amulet': ['Тканевый амулет', M], Wand: ['Палочка', F],
    // clothing
    Straps: ['Ремни', P], Armbands: ['Наручные повязки', P], Kimono: ['Кимоно', N], 'Fancy Armbands': ['Нарядные наручные повязки', P],
    Sash: ['Пояс', M], Eodoric: ['Эдорик', M], Shoes: ['Туфли', P], 'Tall Boots': ['Высокие сапоги', P], Sandals: ['Сандалии', P],
    'Casual Pants': ['Простые штаны', P], Breeches: ['Бричи', P], 'Short Skirt': ['Короткая юбка', F], 'Casual Cloak': ['Простой плащ', M],
    'Formal Cloak': ['Парадный плащ', M], 'Khajiit Suit': ['Костюм каджита', M], 'Dwynnen Surcoat': ['Сюркоут Dwynnen', M],
    'Short Tunic': ['Короткая туника', F], 'Formal Tunic': ['Парадная туника', F], Toga: ['Тога', F], 'Reversible Tunic': ['Двусторонняя туника', F],
    Loincloth: ['Набедренная повязка', F], 'Plain Robes': ['Простые мантии', P], 'Priest Robes': ['Мантии жреца', P],
    'Short Shirt': ['Короткая рубаха', F], 'Long Shirt': ['Длинная рубаха', F], 'Open Tunic': ['Расстёгнутая туника', F], Wrap: ['Намотка', F],
    'Long Skirt': ['Длинная юбка', F], 'Anticlere Surcoat': ['Сюркоут Anticlere', M], 'Challenger Straps': ['Ремни претендента', P],
    Vest: ['Жилет', M], 'Champion Straps': ['Ремни чемпиона', P], Brassiere: ['Бюстгальтер', M], 'Formal Brassiere': ['Парадный бюстгальтер', M],
    'Peasant Blouse': ['Крестьянская блуза', F], 'Formal Eodoric': ['Парадный эдорик', M], 'Evening Gown': ['Вечернее платье', N],
    'Day Gown': ['Дневное платье', N], 'Casual Dress': ['Простое платье', N], 'Strapless Dress': ['Платье без бретелей', N],
    'Priestess Robes': ['Мантии жрицы', P], Tights: ['Трико', N],
    // crafted pieces' other bases
    'Repair Kit': ['Ремонтный набор', M], 'Field Repair Kit': ['Походный ремонтный набор', M],
  };

  // ─── the ladder's words (systems/loot/lootRarity.js): prefixes agree with the piece, suffixes stand after it ───
  const a4 = (stem, hard = true) => (hard ? [`${stem}ый`, `${stem}ая`, `${stem}ое`, `${stem}ые`] : [`${stem}ий`, `${stem}ая`, `${stem}ое`, `${stem}ие`]);
  const ADJ = {
    // damage, armour, carrying
    "Soldier's": a4('Солдатск', false), "Warrior's": a4('Воинск', false), "Slayer's": a4('Губительн'),
    "Sentinel's": a4('Дозорн'), "Guardian's": a4('Оберегающ', false), Bulwark: a4('Несокрушим'),
    "Porter's": a4('Вьючн'), "Mule's": a4('Тяглов'), "Giant's": a4('Исполинск', false),
    // a garment's warmth and its weatherproofing
    Lined: a4('Подбит'), Quilted: ['Стёганый', 'Стёганая', 'Стёганое', 'Стёганые'], 'Fur-lined': ['Подбитый мехом', 'Подбитая мехом', 'Подбитое мехом', 'Подбитые мехом'],
    Waxed: ['Вощёный', 'Вощёная', 'Вощёное', 'Вощёные'], Oiled: a4('Промасленн'), Stormproof: a4('Непромокаем'),
    // the lines that do something (they never name a piece, but a name an older build made may carry one)
    Smouldering: a4('Тлеющ', false), Burning: a4('Пылающ', false), Infernal: a4('Адск', false),
    Chilling: a4('Студён'), Freezing: a4('Леденящ', false), Glacial: a4('Ледников'),
    Sparking: a4('Искрящ', false), Crackling: a4('Трескуч', false), Thundering: ['Громовой', 'Громовая', 'Громовое', 'Громовые'],
    Barbed: a4('Зазубренн'), Spiked: a4('Шипаст'), Thorned: a4('Тернов'),
    "Adept's": a4('Искусн'), "Magister's": a4('Магистерск', false), "Sorcerer's": a4('Чародейск', false),
    "Evoker's": a4('Заклинательск', false), "Battlemage's": a4('Боемагическ', false), "Warlock's": ['Колдовской', 'Колдовская', 'Колдовское', 'Колдовские'],
  };
  const SUF = {
    // attributes
    'of the Ox': 'быка', 'of the Bear': 'медведя', 'of the Titan': 'титана', 'of the Owl': 'совы', 'of the Sage': 'мудреца',
    'of the Archmage': 'архимага', 'of the Oak': 'дуба', 'of Iron Will': 'железной воли', 'of the Unbroken': 'несломленного',
    'of the Cat': 'кошки', 'of the Falcon': 'сокола', 'of the Wind': 'ветра', 'of the Boar': 'вепря', 'of the Mountain': 'горы',
    'of the Ageless': 'нестареющего', 'of the Peacock': 'павлина', 'of the Silver Tongue': 'красноречия', 'of Kings': 'королей',
    'of the Hare': 'зайца', 'of the Stag': 'оленя', 'of Lightning': 'молнии', 'of the Fox': 'лиса', 'of Fortune': 'фортуны', 'of the Gods': 'богов',
    // resistances
    'of Embers': 'углей', 'of Flame': 'пламени', 'of the Inferno': 'преисподней', 'of Rime': 'инея', 'of Winter': 'зимы',
    'of the Glacier': 'ледника', 'of Sparks': 'искр', 'of Storms': 'бурь', 'of the Tempest': 'урагана', 'of Venom': 'яда',
    'of the Serpent': 'змея', 'of the Antidote': 'противоядия', 'of Warding': 'оберега', 'of the Ward': 'заслона', 'of Negation': 'отрицания',
    // skills
    'of Practice': 'упражнения', 'of Skill': 'умения', 'of Mastery': 'мастерства',
    // a garment's standing
    'of the Village': 'деревни', 'of the Commons': 'простолюдинов', 'of the People': 'народа', 'of Trade': 'торговли',
    'of the Market': 'рынка', 'of the Guildhall': 'гильдейского зала', 'of Letters': 'словесности', 'of the Library': 'библиотеки',
    'of the College': 'коллегии', 'of the Court': 'двора', 'of the Peerage': 'пэров', 'of the Crown': 'короны',
    'of the Alley': 'переулка', 'of the Shadows': 'теней', 'of the Underworld': 'преступного мира',
    // the lines that do something
    'of Leeching': 'кровопийства', 'of the Leech': 'пиявки', 'of the Vampire': 'вампира', 'of Rest': 'упокоения',
    'of the Gravewatch': 'кладбищенского дозора', 'of Exorcism': 'экзорцизма', 'of Banishing': 'изгнания', 'of the Exile': 'изгнанника',
    "of Oblivion's Bane": 'погибели Обливиона', 'of the Duelist': 'дуэлянта', 'of the Headsman': 'палача', 'of the Warlord': 'военачальника',
    'of the Hunt': 'охоты', 'of the Huntsman': 'ловчего', 'of the Wild Hunt': 'Дикой Охоты', 'of Quickening': 'ускорения',
    'of Alacrity': 'проворства', 'of the Swift Hand': 'быстрой руки', 'of the Spring': 'родника', 'of the Wellspring': 'истока',
    'of the Font': 'источника',
  };
  // Roleplay & Realism: Items' make, before the template ("Mail Hauberk", "Brigandine Helmet", "Fur Boots")
  const VARIANT = { Mail: a4('Кольчужн'), Fur: ['Меховой', 'Меховая', 'Меховое', 'Меховые'], Brigandine: a4('Бригантинн') };

  // ─── a record's own name: the Legendaries, the wardrobe's and the arcane ones, and their powers ───
  const RECORD = {
    Wyrmbane: 'Гибель змиев', Nightwhisper: 'Ночной шёпот', Graveward: 'Страж могил', "Stormcaller's Bow": 'Лук Зовущего бурю',
    'The Warden': 'Хранитель', Titanheart: 'Сердце титана', 'Aegis of Dawn': 'Эгида рассвета', Foxglove: 'Наперстянка',
    "King's Mark": 'Королевская метка', "Archmage's Loop": 'Кольцо архимага', "Ansei's Edge": 'Клинок ансэя', 'Tsaesci Fang': 'Клык цаэски',
    "Orsinium's Anvil": 'Наковальня Orsinium', 'The Glenmoril Bow': 'Лук Гленморил', 'The Direnni Staff': 'Посох Диренни',
    "Gortwog's Cleaver": 'Тесак Гортвога', "Worm's Tooth": 'Зуб Червя', 'Warp-Edge': 'Клинок Искажения',
    'The Visor of King Lysandus': 'Забрало короля Лисандуса', "The Wayrest Courier's Treads": 'Сапоги гонца из Wayrest',
    'Gauntlets of the Rose': 'Перчатки Розы', "The Mountain's Root": 'Корень горы', "The Raven's Wings": 'Крылья ворона',
    "The Night Mother's Embrace": 'Объятия Матери Ночи', 'The Wall of Daggerfall': 'Стена Daggerfall', 'The Amulet of the Nine': 'Амулет Девяти',
    "The Witch-Sisters' Ring": 'Кольцо сестёр-ведьм', "The Duelist's Vambrace": 'Наруч дуэлянта', 'The Mark of the Hist': 'Метка Хиста',
    "The Reachman's Torc": 'Гривна жителя Предела', "The Alik'r Wayfarer's Robes": "Одеяния странника Alik'r", 'Desert-Born': 'Дитя пустыни',
    'The Wrothgar Pass Mantle': 'Мантия перевала Wrothgar', 'Mountain-Born': 'Дитя гор', 'The Vestments of Stendarr': 'Облачение Стендарра',
    "Stendarr's Mercy": 'Милость Стендарра', "The Pilgrim's Sandals": 'Сандалии паломника', 'The Long Road': 'Долгий путь',
    'The Silks of Queen Barenziah': 'Шелка королевы Барензии', 'Royal Bearing': 'Царственная осанка', "The Shade's Cowl": 'Капюшон тени',
    Unseen: 'Незримый', 'The Eye of Magnus': 'Око Магнуса', "Magnus's Gaze": 'Взор Магнуса', 'The Ring of Artaeum': 'Кольцо Артейума',
    'Wellspring of Artaeum': 'Исток Артейума', "Shalidor's Brand": 'Клеймо Шалидора', 'Arcane Surge': 'Тайный прилив',
    Dragonsbane: 'Драконья погибель', 'Silent Death': 'Безмолвная смерть', Sanctified: 'Освящённый', 'Chain Lightning': 'Цепная молния',
    'Way of the Sword': 'Путь меча', "Serpent's Kiss": 'Поцелуй змея', Earthshaker: 'Сотрясатель земли', "Hunter's Moon": 'Луна охотника',
    'Arcane Conduit': 'Тайный проводник', 'Orc Rage': 'Ярость орка', 'Soul Siphon': 'Сифон душ', 'Many Endings': 'Множество концов',
    // an artifact whose name reads like a prefix and a piece ("Warlock's" + "Ring") keeps the pack's own name
    "Warlock's Ring": 'Кольцо Чернокнижника', "Necromancer's Amulet": 'Амулет Некроманта', Chrysamere: 'Хризамер',
    // the gilded guns and the Ketch's pieces (systems/gilded.js), and their powers
    'The Hourlock': 'Часовой замок', 'The Dragonfire Oath': 'Клятва драконьего огня', 'The Sunken Sovereign': 'Затонувший государь',
    "Volendrung's Echo": 'Эхо Волендранга', "The Ketchmaster's Word": 'Слово шкипера шхуны', 'The Resonant Maul': 'Резонирующий молот',
    'The Hour Tolls': 'Час бьёт', Dragonfire: 'Драконий огонь', Undertow: 'Подводное течение', Hammerfall: 'Удар молота', Broadside: 'Бортовой залп',
    // the questlines' named rewards (systems/questlines/sheets/questlines.json outcomes' `named`)
    "Ysolde's Ember-Rod": 'Жезл углей Исольды', 'Seal of the Hour': 'Печать Часа', "Broker's Dusk-Wing Mantle": 'Сумеречная мантия Торговца',
    "Hourkeeper's Linen Signet": 'Льняная печатка хранителя Часа', "Lysandus's Remembrance": 'Память о Лисандусе', 'Sunfall Scimitar': 'Скимитар Заката',
    "Eadwyre's Ward": 'Оберег Эдвира', 'Tusk of the Sixth Stone': 'Клык Шестого Камня', 'Numidian Heartplate': 'Нумидийский нагрудник',
    'Akaviri Oath': 'Акавирская клятва', "The Crowd's Favor": 'Благосклонность толпы', "The Astrologer's Star": 'Звезда астролога',
    "The Armorer's Temper": 'Закалка бронника', "The Crafter's Thanks": 'Благодарность мастера', "The Carter's Gauntlets": 'Рукавицы возчика',
    "Storm-Captain's Coat": 'Камзол капитана бурь', "The Regular's Lucky Charm": 'Счастливый талисман завсегдатая', "The Watch's Thanks": 'Благодарность стражи',
    'Walkabout Charm': 'Амулет странника', "Sethrakul's Scale": 'Чешуя Сетракула', 'Heart-Star Ring': 'Кольцо Звезды-Сердца',
    "Morwen's Hunt-Charm": 'Охотничий амулет Морвен', 'Starglass Rod': 'Жезл звёздного стекла', 'Thread-Cutter': 'Перерезающий нить',
    "Oathkeeper's Dragon Helm": 'Драконий шлем Хранителя клятвы', "Corvane's Spire-Blade": 'Клинок Шпиля Корвейна',
    "Bel-Tavir's Tuning-Charm": 'Тональный амулет Бел-Тавир', "The Steersman's Hammer": 'Молот рулевого',
  };

  // ─── a jeweller's piece: "Silver Flawless Ruby Ring", "Ironwood Diamond Wand", "Ruby Cloth Amulet" ───
  const METAL_ADJ = { Silver: a4('Серебрян'), Gold: ['Золотой', 'Золотая', 'Золотое', 'Золотые'], Platinum: a4('Платинов') };
  const WOOD = { Ironwood: 'из железного дерева', Ghostwood: 'из призрачного дерева' };
  const GEM = { Ruby: ['рубином', M], Emerald: ['изумрудом', M], Sapphire: ['сапфиром', M], Diamond: ['алмазом', M], Jade: ['нефритом', M],
    Turquoise: ['бирюзой', F], Malachite: ['малахитом', M], Amber: ['янтарём', M], Pearl: ['жемчужиной', F] };
  const GRADE = { Chipped: ['надколотым', 'надколотой'], Flawed: ['мутным', 'мутной'], Flawless: ['безупречным', 'безупречной'], Perfect: ['идеальным', 'идеальной'] };
  // the smith's metals, as a kit names its own ("Steel Repair Kit")
  const METAL = { Iron: 'железо', Steel: 'сталь', Silver: 'серебро', Elven: 'эльфийский металл', Dwarven: 'двемерский металл', Mithril: 'мифрил',
    Adamantium: 'адамантий', Ebony: 'эбонит', Orcish: 'орочий металл', Daedric: 'даэдрический металл', Moonstone: 'лунный камень',
    Orichalcum: 'орихалк', Gold: 'золото', Platinum: 'платина' };

  const low1 = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);
  const up1 = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const byLen = (o) => Object.keys(o).sort((a, b) => b.length - a.length);
  const PRE_KEYS = byLen(ADJ), SUF_KEYS = byLen(SUF);

  /** A base: a template (with its make), a jeweller's piece or a kit - { ru, g } or null. */
  function base(s) {
    const b = BASE[s];
    if (b) return { ru: b[0], g: b[1], bare: true };
    for (const v of Object.keys(VARIANT)) {
      if (s.startsWith(`${v} `)) {
        const t = BASE[s.slice(v.length + 1)];
        if (t) return { ru: `${VARIANT[v][t[1]]} ${low1(t[0])}`, g: t[1] };
      }
    }
    const kit = /^(\w+) Repair Kit$/.exec(s);
    if (kit && METAL[kit[1]]) return { ru: `Ремонтный набор (${METAL[kit[1]]})`, g: M };
    const j = /^(?:(Silver|Gold|Platinum|Ironwood|Ghostwood) )?(?:(Chipped|Flawed|Flawless|Perfect) )?(?:(Ruby|Emerald|Sapphire|Diamond|Jade|Turquoise|Malachite|Amber|Pearl) )?(Ring|Mark|Bracelet|Bracer|Amulet|Torc|Cloth Amulet|Wand)$/.exec(s);
    if (j && (j[1] || j[3])) {
      const [, mat, grade, gem, piece] = j;
      const p = BASE[piece];
      let ru = mat && METAL_ADJ[mat] ? `${METAL_ADJ[mat][p[1]]} ${low1(p[0])}` : p[0];
      if (mat && WOOD[mat]) ru += ` ${WOOD[mat]}`;
      if (gem) ru += ` с ${grade ? `${GRADE[grade][GEM[gem][1] === F ? 1 : 0]} ` : ''}${GEM[gem][0]}`;
      return { ru, g: p[1] };
    }
    return null;
  }

  const CYR = /[А-Яа-яЁё]/;
  const cache = new Map();
  /** An item's stored English name in Russian, or null when it is not one the tables read whole. A bare template's name
   *  ("Ring", "Staff") only when `bare` - the game itself names those by their index, and as a word in the interface
   *  ("Mark", "Wrap") it is often something else. */
  function itemName(name, bare = false) {
    if (typeof name !== 'string' || !name || CYR.test(name) || name.length > 90) return null;
    const key = `${bare ? 1 : 0}${name}`;
    if (cache.has(key)) return cache.get(key);
    let out = RECORD[name] ?? null;
    if (!out) {
      let rest = name, pre = null, suf = null;
      for (const w of PRE_KEYS) if (rest.startsWith(`${w} `)) { pre = w; rest = rest.slice(w.length + 1); break; }
      for (const w of SUF_KEYS) if (rest.endsWith(` ${w}`)) { suf = w; rest = rest.slice(0, -w.length - 1); break; }
      const b = base(rest);
      if (b && (pre || suf || !b.bare || bare)) out = up1(`${pre ? `${ADJ[pre][b.g]} ${low1(b.ru)}` : b.ru}${suf ? ` ${SUF[suf]}` : ''}`);
    }
    if (cache.size > 4000) cache.clear();
    cache.set(key, out);
    return out;
  }
  globalThis.__dfoItemName = (name) => itemName(name, true);
  /** A Masterwork's mark: "Silverthorn's Mithril Longsword" -> "Длинный меч (мифрил), работа Silverthorn". */
  globalThis.__dfoMakerName = (maker, material, name) => `${itemName(name, true) ?? name}${material ? ` (${low1(material)})` : ''}, работа ${maker}`;
  /** A Potent brew: the name, then (усиленное). */
  globalThis.__dfoPotent = (name) => `${name} (усиленное)`;
  /** An heirloom's house: "Hlaalu's Dwarven Longsword" / "... of the house of Daggerfall". */
  globalThis.__dfoHouseName = (whole, house) => (house.startsWith('of ') ? `${whole} из дома ${house.slice(3)}` : `${whole} дома ${house}`);

  // ─── the tooltip's affix lines (lootRarity.js AFFIX_KINDS label) ───
  // the attributes and skills a line raises, as "+8 к Длинным Клинкам": the number, then к, then the name in the dative
  const ATTR = { Strength: 'Силе', Intelligence: 'Интеллекту', Willpower: 'Силе воли', Agility: 'Ловкости', Endurance: 'Выносливости',
    Personality: 'Обаянию', Speed: 'Скорости', Luck: 'Удаче' };
  const ELEM_RES = { Fire: 'огню', Frost: 'холоду', Shock: 'электричеству', Poison: 'яду', Magic: 'магии' };
  const ELEM_DMG = { Fire: 'огнём', Frost: 'холодом', Shock: 'электричеством' };
  const FOES = { 'the undead': 'нежити', daedra: 'даэдра', humanoids: 'гуманоидов', animals: 'животных' };
  const GROUPS = { Commoners: 'простолюдинов', Merchants: 'торговцев', Scholars: 'учёных', 'the Nobility': 'знати', 'the Underworld': 'преступного мира' };
  const SKILL = { Medical: 'Медицине', Etiquette: 'Этикету', Streetwise: 'Знанию улиц', Jumping: 'Прыжкам', Orcish: 'Орочьему языку',
    Harpy: 'Языку гарпий', Giantish: 'Языку великанов', Dragonish: 'Драконьему языку', Nymph: 'Языку нимф', Daedric: 'Даэдрическому языку',
    Spriggan: 'Языку сприггана', Centaurian: 'Языку кентавров', Impish: 'Языку бесов', Lockpicking: 'Взлому замков', Mercantile: 'Торговле',
    Pickpocket: 'Карманным кражам', Stealth: 'Скрытности', Swimming: 'Плаванию', Climbing: 'Лазанию', Backstabbing: 'Удару в спину',
    Dodging: 'Уклонению', Running: 'Бегу', Destruction: 'Разрушению', Restoration: 'Восстановлению', Illusion: 'Иллюзии',
    Alteration: 'Изменению', Thaumaturgy: 'Тауматургии', Mysticism: 'Мистицизму', 'Short Blade': 'Коротким Клинкам',
    'Long Blade': 'Длинным Клинкам', 'Hand-to-Hand': 'Рукопашному бою', Axe: 'Топорам', 'Blunt Weapon': 'Дробящему оружию',
    Archery: 'Стрельбе из лука', 'Critical Strike': 'Критическому удару', Skill: 'навыку' };
  const LINES = [
    [/^([+-]?\d+)% damage$/, (m) => `${m[1]}% к урону`],
    [/^\+(\d+) armor$/, (m) => `+${m[1]} к броне`],
    [/^\+(\d+)% carrying capacity$/, (m) => `+${m[1]}% к грузоподъёмности`],
    [/^\+(\d+) (Strength|Intelligence|Willpower|Agility|Endurance|Personality|Speed|Luck)$/, (m) => `+${m[1]} к ${ATTR[m[2]]}`],
    [/^\+(\d+)% (Fire|Frost|Shock|Poison|Magic) resistance$/, (m) => `+${m[1]}% к сопротивлению ${ELEM_RES[m[2]]}`],
    [/^\+(\d+) (Fire|Frost|Shock) damage$/, (m) => `+${m[1]} урона ${ELEM_DMG[m[2]]}`],
    [/^(\d+)% life leech on this weapon's own blows$/, (m) => `${m[1]}% вампиризма при ударах этим оружием`],
    [/^(\d+) thorns$/, (m) => `${m[1]} урона шипами`],
    [/^-(\d+)% spell cost$/, (m) => `-${m[1]}% к стоимости заклинаний`],
    [/^\+(\d+)% damage vs (the undead|daedra|humanoids|animals)$/, (m) => `+${m[1]}% урона против ${FOES[m[2]]}`],
    [/^\+(\d+) standing with (Commoners|Merchants|Scholars|the Nobility|the Underworld)$/, (m) => `+${m[1]} к репутации у ${GROUPS[m[2]]}`],
    [/^\+(\d+) warmth$/, (m) => `+${m[1]} к теплу`],
    [/^(\d+)% weatherproof$/, (m) => `${m[1]}% защиты от непогоды`],
    [/^\+(\d+)% casting speed$/, (m) => `+${m[1]}% к скорости заклинаний`],
    [/^\+(\d+)% spell damage$/, (m) => `+${m[1]}% к урону заклинаний`],
    [/^(\d+)% magicka on a kill$/, (m) => `${m[1]}% восп. Маны за убийство`],
    [/^\+(\d+) ([A-Z][A-Za-z-]+(?: [A-Z][a-z]+)?)$/, (m) => (SKILL[m[2]] ? `+${m[1]} к ${SKILL[m[2]]}` : null)],
  ];
  /** An affix line, its roll ("[5–12%]") kept after it, or null. */
  function affixLine(s) {
    const roll = /^(.*?)(\s*\[[\d–\-%. ]+\])$/.exec(s);
    const body = roll ? roll[1] : s;
    for (const [re, f] of LINES) {
      const m = re.exec(body);
      if (m) { const r = f(m); if (r) return roll ? r + roll[2] : r; }
    }
    return null;
  }
  // ─── the interface's own templates, by hand (data/ru-fixes/ui, ru_i18n.js __DFO_UI_RX__): "{} holds a gem." ───
  let UI = null;
  function uiRules() {
    if (UI) return UI;
    UI = [];
    for (const r of globalThis.__DFO_UI_RX__ ?? []) {
      try {
        // the rule's first words before its first hole - a cheap look before the regex
        const head = /^(?:\\.|[^\\(])*/.exec(r.re.slice(1))[0].replace(/\\(.)/g, '$1');
        UI.push({ re: new RegExp(r.re), rep: r.rep, head });
      } catch { /* a rule the engine cannot read is left out */ }
    }
    return UI;
  }
  function uiTemplate(t) {
    for (const r of uiRules()) {
      if (r.head && !t.startsWith(r.head)) continue;
      const m = r.re.exec(t);
      if (!m) continue;
      const tr = globalThis.__translate;
      return r.rep.replace(/\$(\d+)/g, (all, g) => {
        const v = m[+g] ?? '';
        return typeof tr === 'function' && v ? tr(v) : v;
      });
    }
    return null;
  }
  /** The RU runtime's first look (ru_i18n.js): an item's name, an affix line or an interface template, the string's own
   *  spacing kept. */
  globalThis.__dfoRuFirst = (str) => {
    const t = str.trim();
    if (!t || CYR.test(t)) return null;
    // a line the dictionary holds whole is the dictionary's: a template only reads what nobody wrote out
    const dict = globalThis.__RU_DICT__;
    const r = (t.length <= 90 ? affixLine(t) ?? itemName(t) : null) ?? (dict && (dict[str] || dict[t]) ? null : uiTemplate(t));
    if (!r) return null;
    return str.slice(0, str.indexOf(t)) + r + str.slice(str.indexOf(t) + t.length);
  };
})();
