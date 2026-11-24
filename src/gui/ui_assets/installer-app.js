/* Production Interactive Frontend for DFO-Client-Expander-RU Windows Installer.
 * Connects 1:1 approved RPG UI visuals, animations, gauntlet cursor & trail,
 * launcher theme audio (1x playback), tooltips, and dialogs to the real Go backend. */
(function (root) {
  'use strict';

  const doc = root.document;
  const URL_PARAMS = new URLSearchParams(root.location.search || '');
  const API_TOKEN = URL_PARAMS.get('token') || '';
  const THEME_AUDIO_URL = '/assets/launcher-theme.mp3';
  const TBANK_QR_URL = '/assets/tbank-qr.jpg';
  const GAUNTLET_CURSOR_URL = '/assets/gauntlet-cursor-2x.png';
  const BOOSTY_URL = 'https://boosty.to/auto_yoba';

  /* 6 Feature Bars (5 toggleable + 1 non-uncheckable green core UI pack) */
  const FEATURES = [
    { key: 'ru', icon: 'ru' },
    { key: 'marks', icon: 'marks', hasVisited: true },
    { key: 'nearbyLoot', icon: 'loot', hotkey: 'loot' },
    { key: 'dungeons', icon: 'dungeons', hotkey: 'dungeon' },
    { key: 'dungeonNav', icon: 'nav', spellBadge: true },
    { key: 'enhancedUi', icon: 'cards', locked: true },
  ];

  /* Audited Up-to-Date Copy Shown Inside Canonical [O-01] Hover Tooltips */
  const FEATURE_COPY = {
    ru: {
      title: { ru: 'Русификация', en: 'Russian translation' },
      summary: {
        ru: 'Полный перевод клиента, предметов, умений, квестов, сюжетных линий, книг и диалогов.',
        en: 'Complete Russian localization of the client, items, skills, quests, books, and dialogues.',
      },
      details: {
        ru: 'Переводит как штатные экраны игры (включая создание персонажа, обучение и книги), так и модули расширения (торговлю, банк, заказы, зачарование, брокер сигилов, создание и книгу заклинаний, инвентарь). Оригинальные названия городов и зданий на карте сохраняются для точного поиска.',
        en: 'Translates both vanilla screens (chargen, tutorials, books) and mod windows (trade, bank, contracts, enchanting, sigil broker, spellmaker & spellbook, inventory) while preserving map search names.',
      },
      hint: {
        ru: 'При снятой галочке все добавленные модом окна и карточки переключаются на английский.',
        en: 'When unchecked, all mod-added windows and cards switch cleanly to English.',
      },
    },
    marks: {
      title: { ru: 'Метки и карта города', en: 'Marks & town map' },
      summary: {
        ru: 'Метки таверн, лавок, гильдий и храмов на карте мира (до 1200 м) и подробная интерактивная карта города.',
        en: 'Overworld markers (up to 1200 m) for taverns, shops & guilds plus a detailed interactive town map.',
      },
      details: {
        ru: 'Подписи заведений видны с 300 м (до 60 меток), отображается процент скупки с учётом налогов и навыков. В городе переключаются слои «Влияние гильдий», «Входы и владельцы», «Метки заведений» и «Инфо о городе» с карточками экономики и домов.',
        en: 'Shows venue names within 300 m (up to 60 marks) with tax & skill-adjusted buy rates. Interactive town map includes Guild Influence, Doors & Owners, Venue Marks, and Town Info.',
      },
      hint: {
        ru: 'Переключатель «Посещённые» скрывает здания, в которые ваш персонаж ещё ни разу не заходил.',
        en: 'Toggle “Visited” on the right to filter out buildings your character has not entered yet.',
      },
    },
    nearbyLoot: {
      title: { ru: 'Лут рядом', en: 'Loot nearby' },
      summary: {
        ru: 'Единое окно всей добычи в радиусе 10 м (сужается до 3 м, если в пределах 50 м есть другой игрок).',
        en: 'Unified window collecting drops and bodies within 10 m (3 m when another player is within 50 m).',
      },
      details: {
        ru: 'Видит тела, напольные кучи, склоны, застрявшие стрелы, уже обысканные сундуки и награды Шхуны/Разлома, проверяя стены, двери и этажи (2,25 м; на грунте без лимита). Встроены лутфильтр по тегам, пресеты, автолут и «Забрать все».',
        en: 'Covers corpses, piles, cliffs, stuck arrows, opened chests, and Rift/Skiff spoils while checking walls, doors, and floors (2.25 m; open terrain uncapped). Includes tag Loot Filter, presets, Autoloot & “Take all”.',
      },
      hint: {
        ru: 'Клавиатуру, NumPad или кнопку мыши 3/4/5 можно назначить в кейкапе справа.',
        en: 'Bind any keyboard, NumPad, or mouse 3/4/5 button inside the keycap slot on the right.',
      },
    },
    dungeons: {
      title: { ru: 'Сведения о данжах', en: 'Dungeon intel' },
      summary: {
        ru: 'Карточки оценки данжей на карте мира, живой HUD счётчиков и окно сводки внутри подземелья.',
        en: 'Overworld dungeon forecast cards plus a live counter HUD and 4-tab intel window inside dungeons.',
      },
      details: {
        ru: 'На Overworld строит 3-строчную метку с рейтингом (Угроза, Добыча, Рост, Слава) и открывает карточку «Оценка/Обитатели/Добыча/Сила/Сведения». Внутри сверху показаны живые враги, элиты и игроки; по клавише — «Сводка» (реген, аурум, квесты в журнал), «Враги», «Добыча» и «Подготовка».',
        en: 'Adds rated Overworld dungeon cards (Threat, Loot, Growth, Renown + full tabbed breakdown). Inside dungeons shows live enemy/elite/player counters and the hotkey 4-tab modal (Summary with regen/aurum/quests, Enemies, Loot, Preparation).',
      },
      hint: {
        ru: 'Горячую клавишу окна сведений (клавиатуру или мышь 3/4/5) задайте в кейкапе справа.',
        en: 'Assign the intel window hotkey (keyboard or mouse 3/4/5) directly in the right keycap.',
      },
    },
    dungeonNav: {
      title: { ru: 'Навигация в данжах', en: 'Dungeon navigation' },
      summary: {
        ru: 'Волшебная 3D-линия маршрута в подземелье, привязанная к заклинанию «Общая картография».',
        en: 'Spell-driven 3D dungeon pathfinder bound to the “Shared Cartography” spell effect.',
      },
      details: {
        ru: 'При применении заклинания «Общая картография» (Школа Мистицизма) на себя открывает выбор цели: «К выходу» или «К цели задания» (носитель, тело или предмет). Строит путь по живому 3D-коллайдеру (лестницы, подъёмы, шахты, порталы; двери открываются вручную) светящимися розовыми облачками со звёздочками.',
        en: 'Self-casting “Shared Cartography” (Mysticism) opens target choice: “To Exit” or “To Quest Target” (carrier, corpse, or item). Computes a real 3D Collider route (stairs, climbs, shafts, portals; doors manual) rendered as glowing pink clouds with sparks.',
      },
      hint: {
        ru: 'Работает только пока активен эффект заклинания; повторный каст позволяет сменить цель или выбрать «Убрать маршрут».',
        en: 'Active only while the spell effect lasts; recast anytime to switch target or select “Clear route”.',
      },
    },
    enhancedUi: {
      title: { ru: 'Улучшенные интерфейсы', en: 'Enhanced interfaces' },
      summary: {
        ru: 'Обязательный базовый пакет: переработанный инвентарь, карточки предметов, книга заклинаний v2 и сервисные окна.',
        en: 'Core non-disableable module: overhauled inventory, item cards, Spellbook v2, and readable service windows.',
      },
      details: {
        ru: 'Рюкзак списком в 2 колонки (или 1 рядом с контейнером) с куклой +20%, режимом «Значки», вкладкой «Хлам…», автостаком в Разном/Хламе, поиском по картам и автосортировкой. Карточки и быстрый лут без скролла (~40% цены, Слот, Навык). Перевёрстаны торговля, банк, заказы, зачарование, брокер сигилов, создание и книга заклинаний.',
        en: '2-col/1-col List or Icons inventory (+20% equip col, custom Junk tab, auto-stack, quality sort, card search); zero-scroll comparison item cards & quick-loot; plus redesigned trade, bank, contracts, enchanting, sigil broker, spellmaker & Spellbook v2.',
      },
      hint: {
        ru: 'Неотключаемый базовый модуль интерфейсов — всегда активен (зелёный замок) и ставится вместе с модом.',
        en: 'Core module — always enabled in emerald green and included automatically with any setup.',
      },
    },
  };

  /* Synced 1:1 with backend SLOTS in src/gui/fonts_preset.go & src/mod/font-store.cjs (8 categories) */
  const FONT_SLOTS = [
    { id: 'body', baseLabel: 'DFO Gabin', family: "'DFO Gabin', sans-serif", sampleRu: 'ИНТЕРФЕЙС · ИНВЕНТАРЬ · ТОРГОВЛЯ · 123', sampleEn: 'INTERFACE · INVENTORY · TRADE · 123' },
    { id: 'title', baseLabel: 'DFO Greengoth', family: "'DFO Greengoth', serif", sampleRu: 'Даэдрический клинок · Книга заклинаний', sampleEn: 'Daedric Longsword · Spellbook' },
    { id: 'description', baseLabel: 'DFO Flow', family: "'DFO Flow', serif", sampleRu: 'Вы вошли в древнее святилище; воздух пахнет озоном и гарью.', sampleEn: 'Ancient steel that still radiates lingering arcane heat.' },
    { id: 'number', baseLabel: 'DFO Flexi', family: "'DFO Flexi', monospace", sampleRu: '270 489 GP · 160 / 160 MP · +18%', sampleEn: '270 489 GP · 160 / 160 MP · +18%' },
    { id: 'book', baseLabel: 'DFO Hangyaku', family: "'DFO Hangyaku', serif", sampleRu: 'Хроники залива Илиак — Том IV, Глава I', sampleEn: 'Chronicles of Iliac Bay — Vol. IV, Ch. I' },
    { id: 'power', baseLabel: 'DFO Wolga', family: "'DFO Wolga', serif", sampleRu: 'Печать Вечной Зимы · Артефакт', sampleEn: 'Seal of Eternal Winter · Artifact' },
    { id: 'sigil', baseLabel: 'DFO Ckazka', family: "'DFO Ckazka', serif", sampleRu: 'СИГИЛ ПЛАМЕНИ · СТУПЕНЬ III', sampleEn: 'SIGIL OF FLAME · TIER III' },
    { id: 'set', baseLabel: 'DFO Ritalin', family: "'DFO Ritalin', serif", sampleRu: 'Комплект Рыцаря Дракона (3/5)', sampleEn: 'Dragon Knight Regalia (3/5)' },
  ];

  /* Exact key code whitelist matching src/gui/hotkey.go validLootKey() */
  const SIMPLE_KEY_RE = /^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-9]|2[0-4])|Numpad[0-9]|Mouse[345])$/;
  const NAMED_KEYS = new Set([
    'Space', 'ContextMenu', 'Tab', 'Enter', 'Backspace',
    'Insert', 'Delete', 'Home', 'End', 'PageUp', 'PageDown',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'CapsLock', 'NumLock', 'ScrollLock', 'Pause', 'PrintScreen',
    'Backquote', 'Minus', 'Equal', 'BracketLeft', 'BracketRight',
    'Backslash', 'Semicolon', 'Quote', 'Comma', 'Period', 'Slash', 'IntlBackslash',
    'NumpadEnter', 'NumpadAdd', 'NumpadSubtract', 'NumpadMultiply',
    'NumpadDivide', 'NumpadDecimal', 'NumpadComma', 'NumpadEqual',
  ]);
  function isValidHotkeyCode(code) {
    return typeof code === 'string' && (NAMED_KEYS.has(code) || SIMPLE_KEY_RE.test(code));
  }

  let icoSeq = 0;
  function svgIcon(kind, size = 20) {
    const u = 'ic' + (++icoSeq);
    const wrap = (inner, vb = '0 0 24 24') =>
      `<svg viewBox="${vb}" width="${size}" height="${size}" aria-hidden="true" style="display:block;flex:none">${inner}</svg>`;
    switch (kind) {
      case 'crest':
        return wrap(`
          <defs>
            <linearGradient id="${u}g" x1="0" y1="0" x2="0.4" y2="1">
              <stop offset="0%" stop-color="#fef08a"/><stop offset="48%" stop-color="#c9953c"/><stop offset="100%" stop-color="#5e3d12"/>
            </linearGradient>
            <linearGradient id="${u}s" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#e2e8f0"/><stop offset="55%" stop-color="#94a3b8"/><stop offset="100%" stop-color="#475569"/>
            </linearGradient>
          </defs>
          <path d="M12 2L20.5 5.6V12.2C20.5 17.3 16.9 20.6 12 22.3C7.1 20.6 3.5 17.3 3.5 12.2V5.6Z" fill="#171b24" stroke="url(#${u}g)" stroke-width="1.6" stroke-linejoin="round"/>
          <path d="M12 4.1L18.5 6.9V12C18.5 16 15.7 18.7 12 20.1C8.3 18.7 5.5 16 5.5 12V6.9Z" fill="none" stroke="rgba(253,230,138,0.35)" stroke-width="0.7"/>
          <path d="M12 5.4L13.5 10.6L12 18.2L10.5 10.6Z" fill="url(#${u}s)" stroke="#090b0f" stroke-width="0.8"/>
          <path d="M8.4 10.2H15.6L14.8 11.7H9.2Z" fill="url(#${u}g)" stroke="#140c04" stroke-width="0.7"/>
          <circle cx="12" cy="10.9" r="1.4" fill="#f5d451" stroke="#3b2308" stroke-width="0.6"/>
        `);
      case 'ru':
        return wrap(`
          <defs><linearGradient id="${u}p" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0%" stop-color="#fef3c7"/><stop offset="60%" stop-color="#d6ba84"/><stop offset="100%" stop-color="#7c6338"/></linearGradient></defs>
          <path d="M5 3.2H17.5C18.8 3.2 19.6 4.1 19.6 5.3V19C19.6 20.1 18.7 21 17.5 21H6.5C5.2 21 4.4 20.1 4.4 18.9V4.8C4.4 3.9 4.7 3.2 5 3.2Z" fill="url(#${u}p)" stroke="#0b0804" stroke-width="1.2"/>
          <path d="M7.5 8H16.5M7.5 11.5H15.2M7.5 15H13.6" stroke="#382811" stroke-width="1.6" stroke-linecap="round"/>
          <circle cx="16.4" cy="16.6" r="3.4" fill="#c83e36" stroke="#290b09" stroke-width="0.9"/>
          <circle cx="16.4" cy="16.6" r="1.3" fill="#fde68a"/>
        `);
      case 'marks':
        return wrap(`
          <defs><radialGradient id="${u}c" cx="40%" cy="35%" r="65%"><stop offset="0%" stop-color="#fef08a"/><stop offset="55%" stop-color="#c08a3e"/><stop offset="100%" stop-color="#4d310d"/></radialGradient></defs>
          <circle cx="12" cy="12" r="9.2" fill="url(#${u}c)" stroke="#0b0804" stroke-width="1.2"/>
          <circle cx="12" cy="12" r="7.1" fill="#141923" stroke="#fde68a" stroke-width="0.65"/>
          <path d="M12 5.4L14.2 12L12 18.6L9.8 12Z" fill="#e2574c" stroke="#090b0f" stroke-width="0.7"/>
          <path d="M12 12L14.2 12L12 18.6L9.8 12Z" fill="#cbd5e1"/>
          <circle cx="12" cy="12" r="1.4" fill="#fef08a"/>
        `);
      case 'loot':
        return wrap(`
          <defs><linearGradient id="${u}b" x1="0" y1="0" x2="0.5" y2="1"><stop offset="0%" stop-color="#f5d451"/><stop offset="50%" stop-color="#b88435"/><stop offset="100%" stop-color="#523510"/></linearGradient></defs>
          <path d="M8.5 4.2H15.5L14.2 7.2H9.8Z" fill="#d5b26e" stroke="#0b0804" stroke-width="1.05" stroke-linejoin="round"/>
          <path d="M9.3 7.2H14.7C18.2 9.4 19.6 13.4 18.9 17.6C18.5 19.8 16.5 21 12 21C7.5 21 5.5 19.8 5.1 17.6C4.4 13.4 5.8 9.4 9.3 7.2Z" fill="url(#${u}b)" stroke="#0b0804" stroke-width="1.15"/>
          <path d="M8.7 7.6H15.3" stroke="#3b2208" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M12 10.6L13.5 13.6L16.5 14.1L14.2 16.2L14.8 19L12 17.6L9.2 19L9.8 16.2L7.5 14.1L10.5 13.6Z" fill="#fef08a" stroke="#472a08" stroke-width="0.6"/>
        `);
      case 'dungeons':
        return wrap(`
          <defs><linearGradient id="${u}d" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#cbd5e1"/><stop offset="55%" stop-color="#64748b"/><stop offset="100%" stop-color="#1e293b"/></linearGradient></defs>
          <path d="M4.2 20.5V10.8C4.2 6.2 7.7 3 12 3C16.3 3 19.8 6.2 19.8 10.8V20.5H16.4V11.2C16.4 8.4 14.5 6.4 12 6.4C9.5 6.4 7.6 8.4 7.6 11.2V20.5Z" fill="url(#${u}d)" stroke="#090b0f" stroke-width="1.15" stroke-linejoin="round"/>
          <path d="M8.5 20.5V11.4C8.5 9.2 10 7.6 12 7.6C14 7.6 15.5 9.2 15.5 11.4V20.5Z" fill="#0d0f15"/>
          <path d="M12 10.2L13.6 13.4L12 16.6L10.4 13.4Z" fill="#52e2ff" stroke="#082438" stroke-width="0.6"/>
        `);
      case 'nav':
        return wrap(`
          <defs>
            <linearGradient id="${u}nr" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fef08a"/><stop offset="55%" stop-color="#c08a3e"/><stop offset="100%" stop-color="#5c3b10"/></linearGradient>
            <radialGradient id="${u}nm" cx="45%" cy="40%" r="60%"><stop offset="0%" stop-color="#fce7f3"/><stop offset="55%" stop-color="#f472b6"/><stop offset="100%" stop-color="#831843"/></radialGradient>
          </defs>
          <path d="M5.2 18.6C7.6 15.8 9.2 14.8 11.4 13.4C13.6 12 14.8 9.6 16.2 7.2" fill="none" stroke="#f472b6" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="2.4 2.4"/>
          <circle cx="5.2" cy="18.6" r="2.1" fill="#fde68a" stroke="#1e1204" stroke-width="0.9"/>
          <path d="M16.5 3.6L18.1 7.3L21.8 8.9L18.1 10.5L16.5 14.2L14.9 10.5L11.2 8.9L14.9 7.3Z" fill="url(#${u}nm)" stroke="#1b0716" stroke-width="1"/>
          <circle cx="16.5" cy="8.9" r="1.4" fill="#ffffff"/>
          <path d="M9.6 6.2L10.4 8L12.2 8.8L10.4 9.6L9.6 11.4L8.8 9.6L7 8.8L8.8 8Z" fill="url(#${u}nr)" stroke="#140c04" stroke-width="0.65"/>
        `);
      case 'cards':
        return wrap(`
          <defs><linearGradient id="${u}k" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#93c5fd"/><stop offset="55%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#1e3a8a"/></linearGradient></defs>
          <rect x="3.5" y="3.2" width="17" height="17.6" rx="1.5" fill="#181f2c" stroke="#d5b26e" stroke-width="1.3"/>
          <rect x="5.8" y="5.6" width="5.2" height="6.2" fill="url(#${u}k)" stroke="#090b0f" stroke-width="0.8"/>
          <path d="M12.8 6.8H18.2M12.8 9.6H17.4M6 14.8H18M6 17.6H14.5" stroke="#e9e4d9" stroke-width="1.3" stroke-linecap="round"/>
        `);
      case 'fonts':
        return wrap(`
          <defs><linearGradient id="${u}f" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fef08a"/><stop offset="55%" stop-color="#d5b26e"/><stop offset="100%" stop-color="#6b4814"/></linearGradient></defs>
          <path d="M4.2 19L9.8 4.8H12.2L17.8 19H15L13.7 15.4H8.3L7 19ZM9.1 13.2H12.9L11 7.8Z" fill="url(#${u}f)" stroke="#0b0804" stroke-width="0.9" stroke-linejoin="round"/>
          <circle cx="18.6" cy="17.2" r="2.6" fill="#52e2ff" stroke="#081a24" stroke-width="0.9"/>
        `);
      case 'folder':
        return wrap(`
          <defs><linearGradient id="${u}fl" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fde68a"/><stop offset="55%" stop-color="#c08a3e"/><stop offset="100%" stop-color="#5c3b10"/></linearGradient></defs>
          <path d="M2.8 6.4C2.8 5.5 3.5 4.8 4.4 4.8H9.5L11.4 7H19.6C20.5 7 21.2 7.7 21.2 8.6V18.2C21.2 19.1 20.5 19.8 19.6 19.8H4.4C3.5 19.8 2.8 19.1 2.8 18.2Z" fill="url(#${u}fl)" stroke="#0b0804" stroke-width="1.15" stroke-linejoin="round"/>
        `);
      case 'refresh':
        return wrap(`
          <path d="M4.8 10A7.4 7.4 0 0 1 17.6 6.4L19.5 4.4V9.8H14.1L16.1 7.8A5.1 5.1 0 0 0 7.1 10.4" fill="none" stroke="#f1e6c8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M19.2 14A7.4 7.4 0 0 1 6.4 17.6L4.5 19.6V14.2H9.9L7.9 16.2A5.1 5.1 0 0 0 16.9 13.6" fill="none" stroke="#f1e6c8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        `);
      case 'update':
        return wrap(`
          <path d="M12 3.4V15.2M12 15.2L7.5 10.7M12 15.2L16.5 10.7M4.5 19.4H19.5" fill="none" stroke="#7de8ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        `);
      case 'spark':
        return wrap(`
          <defs><radialGradient id="${u}sp" cx="45%" cy="38%" r="60%"><stop offset="0%" stop-color="#ecfdf5"/><stop offset="45%" stop-color="#34d399"/><stop offset="100%" stop-color="#064e3b"/></radialGradient></defs>
          <path d="M12 2L14.9 9.1L22 12L14.9 14.9L12 22L9.1 14.9L2 12L9.1 9.1Z" fill="url(#${u}sp)" stroke="#051a11" stroke-width="1.1" stroke-linejoin="round"/>
          <circle cx="12" cy="12" r="1.6" fill="#fff"/>
        `);
      case 'trash':
        return wrap(`
          <path d="M5.6 7.4H18.4L17.3 20.2C17.2 20.8 16.7 21.2 16 21.2H8C7.3 21.2 6.8 20.8 6.7 20.2Z" fill="#94a3b8" stroke="#090b0f" stroke-width="1.15"/>
          <rect x="3.8" y="5.2" width="16.4" height="2.4" rx="0.8" fill="#ef4444" stroke="#180505" stroke-width="1"/>
          <path d="M9.6 10.6V18M12 10.6V18M14.4 10.6V18" stroke="#1e293b" stroke-width="1.3" stroke-linecap="round"/>
        `);
      case 'log':
        return wrap(`
          <rect x="4" y="3" width="16" height="18" rx="1.4" fill="#171e2b" stroke="#d5b26e" stroke-width="1.2"/>
          <path d="M7.5 8H16.5M7.5 12H16.5M7.5 16H13" stroke="#e9e4d9" stroke-width="1.4" stroke-linecap="round"/>
        `);
      case 'globe':
        return wrap(`
          <circle cx="12" cy="12" r="8.8" fill="none" stroke="#6ee7b7" stroke-width="1.65"/>
          <path d="M12 3.2V20.8M3.4 12H20.6M12 3.2A4.6 8.8 0 0 1 12 20.8M12 3.2A4.6 8.8 0 0 0 12 20.8" fill="none" stroke="#6ee7b7" stroke-width="1.25"/>
        `);
      case 'heart':
        return wrap(`
          <defs>
            <linearGradient id="${u}ht" x1="0" y1="0" x2="0.4" y2="1">
              <stop offset="0%" stop-color="#fff4b8"/><stop offset="45%" stop-color="#ffb84d"/><stop offset="100%" stop-color="#ea580c"/>
            </linearGradient>
          </defs>
          <path d="M12 20.4C12 20.4 4.2 15.1 3.3 9.7C2.7 6.3 5.2 3.8 8.2 4C10.1 4.1 11.4 5.2 12 6.5C12.6 5.2 13.9 4.1 15.8 4C18.8 3.8 21.3 6.3 20.7 9.7C19.8 15.1 12 20.4 12 20.4Z" fill="url(#${u}ht)" stroke="#1f0902" stroke-width="1.25" stroke-linejoin="round"/>
          <path d="M7.6 7.4C8.4 6.6 9.6 6.6 10.3 7.3" fill="none" stroke="#fff9d9" stroke-width="1.4" stroke-linecap="round"/>
        `);
      case 'boosty':
        return wrap(`
          <defs>
            <linearGradient id="${u}bo" x1="0" y1="0" x2="0.4" y2="1">
              <stop offset="0%" stop-color="#ff8c42"/><stop offset="55%" stop-color="#f15f2c"/><stop offset="100%" stop-color="#c43812"/>
            </linearGradient>
          </defs>
          <path fill="url(#${u}bo)" d="M2.661 14.337L6.801 0h6.362L11.88 4.444l-.038.077l-3.378 11.733h3.15q-1.982 4.934-3.086 7.733c-5.816-.063-7.442-4.228-6.02-9.155M8.554 24l7.67-11.035h-3.25l2.83-7.073c4.852.508 7.137 4.33 5.791 8.952C20.16 19.81 14.344 24 8.68 24h-.127z"/>
        `);
      case 'key':
        return wrap(`
          <rect x="2.8" y="5.4" width="18.4" height="13.2" rx="2" fill="#121a2a" stroke="#52e2ff" stroke-width="1.25"/>
          <path d="M6.4 9.5H8.6M10.8 9.5H13.2M15.4 9.5H17.6M7.6 14.2H16.4" stroke="#fde68a" stroke-width="1.5" stroke-linecap="round"/>
        `);
      case 'sound-on':
        return wrap(`
          <defs><linearGradient id="${u}so" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fde68a"/><stop offset="60%" stop-color="#c9953c"/><stop offset="100%" stop-color="#6b4814"/></linearGradient></defs>
          <path d="M3.5 9.2H7.6L12.8 4.8V19.2L7.6 14.8H3.5Z" fill="url(#${u}so)" stroke="#090b0f" stroke-width="1.15" stroke-linejoin="round"/>
          <path d="M15.8 8.4A4.6 4.6 0 0 1 15.8 15.6M18.3 5.8A8.2 8.2 0 0 1 18.3 18.2" fill="none" stroke="#fde68a" stroke-width="1.65" stroke-linecap="round"/>
        `);
      case 'sound-off':
        return wrap(`
          <path d="M3.5 9.2H7.6L12.8 4.8V19.2L7.6 14.8H3.5Z" fill="#64748b" stroke="#090b0f" stroke-width="1.15" stroke-linejoin="round"/>
          <path d="M15.6 9.2L20.4 14.8M20.4 9.2L15.6 14.8" fill="none" stroke="#e2574c" stroke-width="1.9" stroke-linecap="round"/>
        `);
      case 'sound-ended':
        return wrap(`
          <path d="M3.5 9.2H7.6L12.8 4.8V19.2L7.6 14.8H3.5Z" fill="#6b7280" stroke="#090b0f" stroke-width="1.15" stroke-linejoin="round"/>
          <path d="M15.8 9.2A3.8 3.8 0 0 1 15.8 14.8" fill="none" stroke="#64748b" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="2 2"/>
        `);
      case 'tri-up':
        return `<svg viewBox="0 0 16 14" width="12" height="10" aria-hidden="true" style="display:block;flex:none"><polygon points="8,2 14.5,12.5 1.5,12.5" fill="#f5d451" stroke="#090b0f" stroke-width="1.1" stroke-linejoin="round"/></svg>`;
      case 'tri-down':
        return `<svg viewBox="0 0 16 14" width="12" height="10" aria-hidden="true" style="display:block;flex:none"><polygon points="1.5,2 14.5,2 8,12.5" fill="#d5b26e" stroke="#090b0f" stroke-width="1.1" stroke-linejoin="round"/></svg>`;
      default:
        return '';
    }
  }

  const state = {
    meta: { name: 'DFO-Client-Expander-RU', version: '1.30.0', author: 'AutomaticYobaMachine' },
    locales: { ru: {}, en: {} },
    lang: 'ru',

    audioMuted: false,
    audioVolume: 0.60,
    audioStatus: 'idle',
    audioPlayedOnce: false,

    fontsDialogOpen: false,
    journalDialogOpen: false,
    thanksDialogOpen: false,
    thanksPeekExpanded: false,
    installedInSession: false,
    installedChoicesSig: '',
    awaitingPostInstallStatus: false,
    optionsCollapsePhase: 'open',
    hoveredFeature: null,

    exePath: '',
    pathHintText: '',
    searching: true,
    querying: false,
    hasStatus: false,
    installed: false,
    modVersion: '',
    running: false,
    busy: false,
    operation: '',
    progress: 0,
    stage: '',
    noteText: '',
    noteTone: 'dim',
    hasJournalError: false,

    updateChecking: false,
    updateDownloading: false,
    updateHandoff: false,
    updateProgress: 0,
    updateAvailableVer: '',
    updateText: '',
    updatesDisabled: false,
    resumePending: false,
    githubAlertVisible: false,

    toggles: {
      ru: true,
      marks: true,
      nearbyLoot: true,
      dungeons: true,
      dungeonNav: true,
      enhancedUi: true,
      onlyVisited: true,
    },
    lootKey: 'KeyJ',
    dungeonKey: 'KeyK',
    lootKeyLabel: 'J',
    dungeonKeyLabel: 'K',
    capturingTarget: null,

    fontSlots: {},      // id -> { custom, label, file, sha256, family }
    logText: '',
  };

  let activeDropAnim = null;
  let activeLineAnim = null;
  let activeThanksAnim = null;
  let lastThanksPeeking = null;
  let mountedOnce = false;
  let prevBusy = false;
  let prevBusyOp = '';
  let pendingSessionOp = '';
  let prevExePath = '';
  let sawPostInstallQuery = false;
  let prevInstalled = false;
  let prevJournalError = false;
  let prevUpdateVer = '';
  let lastCompSig = '';
  let lastLogText = null;
  let lastThanksSig = '';
  let headerDragging = false;
  const loadedUserFonts = new Map(); // cacheKey -> familyName

  function T(key, params) {
    const dict = state.locales[state.lang] || state.locales.ru || {};
    let str = dict[key] ?? (state.locales.ru && state.locales.ru[key]) ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.split('{' + k + '}').join(String(v));
      }
    }
    return str;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function sendAction(payload) {
    try {
      await root.fetch('/api/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-DFO-Token': API_TOKEN,
        },
        body: JSON.stringify(payload),
      });
    } catch { }
  }

  async function ensureUserFontFace(slot) {
    if (!slot || !slot.custom || !slot.file) return;
    const cacheKey = `${slot.id}:${slot.file}:${slot.sha256 || ''}`;
    if (loadedUserFonts.has(cacheKey)) {
      if (state.fontSlots[slot.id]) state.fontSlots[slot.id].family = `'${loadedUserFonts.get(cacheKey)}', sans-serif`;
      return;
    }
    const fam = 'DFOUser_' + slot.id + '_' + String(slot.sha256 || Date.now()).slice(0, 8);
    try {
      const url = `/api/user-font/${encodeURIComponent(slot.file)}?token=${encodeURIComponent(API_TOKEN)}`;
      const face = new FontFace(fam, `url("${url}")`);
      await face.load();
      doc.fonts.add(face);
      loadedUserFonts.set(cacheKey, fam);
      if (state.fontSlots[slot.id]) {
        state.fontSlots[slot.id].family = `'${fam}', sans-serif`;
      }
      if (state.fontsDialogOpen) render();
    } catch { }
  }

  function applyServerState(s) {
    if (!s || typeof s !== 'object') return;
    if (s.locales) state.locales = s.locales;
    if (s.name) state.meta.name = s.name;
    if (s.version) state.meta.version = s.version;
    if (s.author) state.meta.author = s.author;
    if (s.lang) state.lang = s.lang;

    state.exePath = s.exePath || '';
    if (prevExePath && state.exePath && prevExePath.toLowerCase() !== state.exePath.toLowerCase()) {
      state.installedInSession = false;
      state.installedChoicesSig = '';
      state.awaitingPostInstallStatus = false;
      sawPostInstallQuery = false;
    }
    if (state.exePath) prevExePath = state.exePath;
    state.pathHintText = s.pathHintText || '';
    state.searching = Boolean(s.searching);
    state.querying = Boolean(s.querying);
    state.hasStatus = Boolean(s.hasStatus);
    state.installed = Boolean(s.installed);
    state.modVersion = s.modVersion || '';
    state.running = Boolean(s.running);

    const anyBusy = Boolean(s.busy || s.updateDownloading || s.updateHandoff);
    if (anyBusy && !prevBusy) root.__dfoDungeonScene?.onUserAction('busy-start');
    else if (!anyBusy && prevBusy) root.__dfoDungeonScene?.onUserAction('busy-end');
    prevBusy = anyBusy;

    const nextBusy = Boolean(s.busy);
    const nextOp = s.operation || '';
    const nextProgress = Number(s.progress) || 0;
    const nextNoteTone = s.noteTone || 'dim';
    const installJustFinished =
      (prevBusyOp === 'install' || (pendingSessionOp === 'install' && nextOp === 'install'))
      && !nextBusy && nextProgress === 100 && nextNoteTone === 'green';
    const uninstallJustFinished =
      (prevBusyOp === 'uninstall' || (pendingSessionOp === 'uninstall' && nextOp === 'uninstall'))
      && !nextBusy && nextProgress === 100 && nextNoteTone === 'green';

    if (installJustFinished || uninstallJustFinished || (prevBusyOp && !nextBusy)) {
      pendingSessionOp = '';
    }
    prevBusyOp = nextBusy ? nextOp : '';

    // When uninstalled cleanly, reset session/peek state so Say Thanks smoothly glides back
    const becameUninstalled = prevInstalled && !state.installed && !state.querying && state.hasStatus;
    if (uninstallJustFinished || becameUninstalled) {
      state.installedInSession = false;
      state.installedChoicesSig = '';
      state.awaitingPostInstallStatus = false;
      sawPostInstallQuery = false;
      state.thanksDialogOpen = false;
      state.thanksPeekExpanded = false;
    }
    prevInstalled = state.installed;

    state.busy = nextBusy;
    state.operation = nextOp;
    state.progress = nextProgress;
    state.stage = s.stage || '';
    state.noteText = s.noteText || '';
    state.noteTone = nextNoteTone;

    state.updateChecking = Boolean(s.updateChecking);
    state.updateDownloading = Boolean(s.updateDownloading);
    state.updateHandoff = Boolean(s.updateHandoff);
    state.updateProgress = Number(s.updateProgress) || 0;
    state.updateAvailableVer = s.updateAvailableVer || '';
    state.updateText = s.updateText || '';
    state.updatesDisabled = Boolean(s.updatesDisabled);
    state.resumePending = Boolean(s.resumePending);

    // Show large GitHub Release Alert banner whenever backend announces a new version
    if (state.updateAvailableVer && state.updateAvailableVer !== prevUpdateVer) {
      state.githubAlertVisible = true;
    }
    if (!state.updateAvailableVer) {
      state.githubAlertVisible = false;
    }
    prevUpdateVer = state.updateAvailableVer;

    state.hasJournalError = Boolean(s.hasJournalError);
    if (state.hasJournalError && !prevJournalError) {
      state.journalDialogOpen = true;
    }
    prevJournalError = state.hasJournalError;

    if (s.toggles && typeof s.toggles === 'object') {
      state.toggles = {
        ru: Boolean(s.toggles.ru),
        marks: Boolean(s.toggles.marks),
        nearbyLoot: Boolean(s.toggles.nearbyLoot),
        dungeons: Boolean(s.toggles.dungeons),
        dungeonNav: Boolean(s.toggles.dungeonNav),
        enhancedUi: true,
        onlyVisited: Boolean(s.toggles.onlyVisited),
      };
    }

    if (s.lootKey) state.lootKey = s.lootKey;
    if (s.dungeonKey) state.dungeonKey = s.dungeonKey;
    if (s.lootKeyLabel) state.lootKeyLabel = s.lootKeyLabel;
    if (s.dungeonKeyLabel) state.dungeonKeyLabel = s.dungeonKeyLabel;

    if (Array.isArray(s.fontSlots)) {
      const nextFonts = {};
      for (const slot of s.fontSlots) {
        const cacheKey = `${slot.id}:${slot.file || ''}:${slot.sha256 || ''}`;
        const existingFam = loadedUserFonts.get(cacheKey);
        nextFonts[slot.id] = {
          custom: Boolean(slot.custom),
          label: slot.label || '',
          file: slot.file || '',
          sha256: slot.sha256 || '',
          family: existingFam ? `'${existingFam}', sans-serif` : '',
        };
        if (slot.custom && slot.file) ensureUserFontFace(slot);
      }
      state.fontSlots = nextFonts;
    }

    if (typeof s.logText === 'string') {
      state.logText = s.logText;
    }

    if (anyBusy || !state.exePath) {
      state.capturingTarget = null;
    } else if (state.capturingTarget === 'loot' && !state.toggles.nearbyLoot) {
      state.capturingTarget = null;
    } else if (state.capturingTarget === 'dungeon' && !state.toggles.dungeons) {
      state.capturingTarget = null;
    }

    if (installJustFinished) {
      state.installedInSession = true;
      state.installedChoicesSig = currentChoicesSignature();
      state.awaitingPostInstallStatus = true;
      sawPostInstallQuery = false;
    } else if (state.awaitingPostInstallStatus) {
      if (state.querying) {
        sawPostInstallQuery = true;
      } else if (sawPostInstallQuery || (state.installed && state.modVersion === state.meta.version)) {
        state.awaitingPostInstallStatus = false;
        sawPostInstallQuery = false;
      }
    }

    if (
      state.installedInSession
      && !state.awaitingPostInstallStatus
      && !state.busy
      && !state.querying
      && state.hasStatus
      && (!state.installed || (state.modVersion && state.modVersion !== state.meta.version))
    ) {
      state.installedInSession = false;
      state.installedChoicesSig = '';
    }

    render();
  }

  function connectBackend() {
    root.fetch(`/api/state?token=${encodeURIComponent(API_TOKEN)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) applyServerState(data); })
      .catch(() => { });

    const openStream = () => {
      try {
        const es = new EventSource(`/api/events?token=${encodeURIComponent(API_TOKEN)}`);
        es.onmessage = (ev) => {
          try {
            const parsed = JSON.parse(ev.data);
            applyServerState(parsed);
          } catch { }
        };
        es.onerror = () => {
          try { es.close(); } catch { }
          setTimeout(openStream, 800);
        };
      } catch {
        setTimeout(openStream, 1000);
      }
    };
    openStream();
  }

  function isWorking() {
    return Boolean(state.busy || state.updateDownloading || state.updateHandoff);
  }

  function selectedCount() {
    let n = 0;
    for (const f of FEATURES) {
      if (f.locked || state.toggles[f.key]) n++;
    }
    return n;
  }

  function customFontCount() {
    let n = 0;
    for (const s of FONT_SLOTS) {
      if (state.fontSlots[s.id]?.custom) n++;
    }
    return n;
  }

  function currentChoicesSignature() {
    const fonts = FONT_SLOTS.map((s) => {
      const f = state.fontSlots[s.id];
      return f && f.custom ? `${s.id}:${f.file}:${f.sha256}` : s.id;
    });
    return JSON.stringify([
      state.toggles.ru,
      state.toggles.marks,
      state.toggles.nearbyLoot,
      state.toggles.dungeons,
      state.toggles.dungeonNav,
      state.toggles.onlyVisited,
      state.lootKey,
      state.dungeonKey,
      fonts,
    ]);
  }

  function isChoicesDirtySinceInstall() {
    return Boolean(state.installedChoicesSig) && currentChoicesSignature() !== state.installedChoicesSig;
  }

  function hasKeyConflict() {
    return Boolean(state.toggles.nearbyLoot && state.toggles.dungeons && state.lootKey === state.dungeonKey);
  }

  function displayKeyLabel(hotkey) {
    return hotkey === 'loot' ? (state.lootKeyLabel || 'J') : (state.dungeonKeyLabel || 'K');
  }

  /* ============================================================================
   * CANONICAL [O-01] HOVER TOOLTIPS
   * ============================================================================ */
  function hideTooltip() {
    const layer = doc.getElementById('inst-tooltip-layer');
    if (layer) layer.replaceChildren();
  }

  function renderFeatureTooltip(featureKey, anchorEl) {
    const layer = doc.getElementById('inst-tooltip-layer');
    if (!layer || !featureKey || !anchorEl || !anchorEl.isConnected) {
      hideTooltip();
      return;
    }
    const feat = FEATURES.find((x) => x.key === featureKey);
    const copy = FEATURE_COPY[featureKey];
    if (!feat || !copy) { hideTooltip(); return; }

    const locked = Boolean(feat.locked);
    const checked = locked ? true : Boolean(state.toggles[featureKey]);
    const conflict = hasKeyConflict() && (featureKey === 'nearbyLoot' || featureKey === 'dungeons');
    const lang = state.lang;

    const tip = doc.createElement('div');
    tip.className = 'dfo-status-tip';
    tip.setAttribute('role', 'tooltip');

    const head = doc.createElement('div');
    head.className = 'dfo-st-head';
    head.innerHTML = `<span class="dfo-st-head-ico">${svgIcon(feat.icon, 16)}</span><span>${escapeHtml(copy.title[lang] || copy.title.ru)}</span>`;
    tip.append(head);

    const body = doc.createElement('div');
    body.className = 'dfo-st-body';

    const cards = doc.createElement('div');
    cards.className = 'dfo-st-cards';

    const statusCard = doc.createElement('div');
    if (locked) {
      statusCard.className = 'dfo-st-card is-embers';
      statusCard.innerHTML = `
        <div class="dfo-st-card-l"><span class="dfo-st-card-k">${escapeHtml(lang === 'ru' ? 'Режим' : 'Pack')}</span></div>
        <span class="dfo-st-card-v">${escapeHtml(lang === 'ru' ? 'БАЗОВЫЙ МОДУЛЬ' : 'CORE MODULE')}</span>`;
    } else {
      statusCard.className = `dfo-st-card ${checked ? 'is-shards' : 'is-aurum'}`;
      statusCard.innerHTML = `
        <div class="dfo-st-card-l"><span class="dfo-st-card-k">${escapeHtml(lang === 'ru' ? 'Состояние' : 'Status')}</span></div>
        <span class="dfo-st-card-v">${escapeHtml(checked ? (lang === 'ru' ? 'ВКЛЮЧЕНО' : 'ENABLED') : (lang === 'ru' ? 'ВЫКЛЮЧЕНО' : 'DISABLED'))}</span>`;
    }
    cards.append(statusCard);

    if (feat.hotkey) {
      const keyCard = doc.createElement('div');
      keyCard.className = `dfo-st-card ${conflict ? 'is-aurum' : 'is-gold'}`;
      keyCard.innerHTML = `
        <div class="dfo-st-card-l"><span class="dfo-st-card-k">${escapeHtml(lang === 'ru' ? 'Горячая клавиша' : 'Hotkey')}</span></div>
        <span class="dfo-st-card-v">${escapeHtml(displayKeyLabel(feat.hotkey))}</span>`;
      cards.append(keyCard);
    } else if (feat.hasVisited) {
      const subOn = Boolean(state.toggles.onlyVisited);
      const subCard = doc.createElement('div');
      subCard.className = `dfo-st-card ${subOn ? 'is-embers' : 'is-loc'}`;
      subCard.innerHTML = `
        <div class="dfo-st-card-l"><span class="dfo-st-card-k">${escapeHtml(T('installer.visited'))}</span></div>
        <span class="dfo-st-card-v">${escapeHtml(subOn ? (lang === 'ru' ? 'ДА' : 'ON') : (lang === 'ru' ? 'НЕТ' : 'OFF'))}</span>`;
      cards.append(subCard);
    } else if (feat.spellBadge) {
      const spellCard = doc.createElement('div');
      spellCard.className = 'dfo-st-card is-gold';
      spellCard.innerHTML = `
        <div class="dfo-st-card-l"><span class="dfo-st-card-k">${escapeHtml(lang === 'ru' ? 'Заклинание' : 'Spell')}</span></div>
        <span class="dfo-st-card-v">${escapeHtml(lang === 'ru' ? 'ОБЩАЯ КАРТОГРАФИЯ' : 'SHARED CARTOGRAPHY')}</span>`;
      cards.append(spellCard);
    } else if (locked) {
      const scopeCard = doc.createElement('div');
      scopeCard.className = 'dfo-st-card is-shards';
      scopeCard.innerHTML = `
        <div class="dfo-st-card-l"><span class="dfo-st-card-k">${escapeHtml(lang === 'ru' ? 'Охват' : 'Includes')}</span></div>
        <span class="dfo-st-card-v">${escapeHtml(lang === 'ru' ? 'ИНВЕНТАРЬ · КАРТОЧКИ' : 'PACK · CARDS · UI')}</span>`;
      cards.append(scopeCard);
    }
    body.append(cards);

    const infoBox = doc.createElement('div');
    infoBox.className = 'dfo-st-info';

    const f1 = doc.createElement('div');
    f1.className = 'dfo-st-field';
    f1.innerHTML = `<div class="dfo-st-fk">${escapeHtml(lang === 'ru' ? 'Назначение' : 'Overview')}</div><div class="dfo-st-fv">${escapeHtml(copy.summary[lang] || copy.summary.ru)}</div>`;

    const f2 = doc.createElement('div');
    f2.className = 'dfo-st-field';
    f2.innerHTML = `<div class="dfo-st-fk">${escapeHtml(lang === 'ru' ? 'Актуальные возможности' : 'Key features')}</div><div class="dfo-st-fv">${escapeHtml(copy.details[lang] || copy.details.ru)}</div>`;

    infoBox.append(f1, f2);
    body.append(infoBox);

    const sep = doc.createElement('div');
    sep.className = 'dfo-st-sep';
    body.append(sep);

    const line = doc.createElement('div');
    if (conflict) {
      line.className = 'dfo-st-line is-bad';
      line.textContent = lang === 'ru'
        ? 'Конфликт клавиш: с «Лут рядом» и «Сведения о данжах» назначена одна кнопка.'
        : 'Hotkey conflict: loot nearby and dungeon intel share the same key.';
    } else {
      line.className = 'dfo-st-line is-center';
      line.textContent = copy.hint[lang] || copy.hint.ru;
    }
    body.append(line);

    tip.append(body);
    layer.replaceChildren(tip);
    tip.style.visibility = 'hidden';

    const ar = anchorEl.getBoundingClientRect();
    const tr = tip.getBoundingClientRect();
    const vw = root.innerWidth || 1416;
    const vh = root.innerHeight || 888;

    let left = Math.round(ar.left - tr.width - 14);
    let top = Math.round(ar.top + (ar.height - tr.height) * 0.5);
    if (left < 16) {
      left = Math.round(Math.min(Math.max(12, ar.left), Math.max(12, vw - tr.width - 12)));
      const above = ar.top - tr.height - 8;
      top = Math.round(above >= 12 ? above : Math.min(vh - tr.height - 12, ar.bottom + 8));
    }
    top = Math.max(12, Math.min(vh - tr.height - 12, top));
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    tip.style.visibility = 'visible';
  }

  function syncTooltipDisplay() {
    const targetKey = state.hoveredFeature;
    if (!targetKey || state.fontsDialogOpen || state.journalDialogOpen || state.thanksDialogOpen || state.optionsCollapsePhase !== 'open') {
      hideTooltip();
      return;
    }
    const anchor = doc.querySelector(`.dfo-chip-opt[data-feature="${targetKey}"]`);
    if (anchor) renderFeatureTooltip(targetKey, anchor);
    else hideTooltip();
  }

  /* ============================================================================
   * STATUS / PROGRESS / CTA HELPERS
   * ============================================================================ */
  function clientStatusMeta() {
    if (state.searching) {
      return { dot: 'is-search', plaqueTone: 'is-tone-blue', chip: state.lang === 'ru' ? 'ПОИСК…' : 'SEARCHING…' };
    }
    if (state.querying) {
      return { dot: 'is-search', plaqueTone: 'is-tone-blue', chip: state.lang === 'ru' ? 'ПРОВЕРКА…' : 'CHECKING…' };
    }
    if (!state.exePath) {
      return { dot: 'is-warn', plaqueTone: 'is-tone-amber', chip: state.lang === 'ru' ? 'НЕТ КЛИЕНТА' : 'NO CLIENT' };
    }
    if (!state.hasStatus) {
      return { dot: 'is-error', plaqueTone: 'is-tone-red', chip: state.lang === 'ru' ? 'ОШИБКА' : 'CHECK ERROR' };
    }
    if (state.running) {
      return { dot: 'is-error', plaqueTone: 'is-tone-red', chip: state.lang === 'ru' ? 'ИГРА ЗАПУЩЕНА' : 'GAME RUNNING' };
    }
    if (state.installed) {
      const outdated = state.modVersion && state.modVersion !== state.meta.version;
      return {
        dot: outdated ? 'is-warn' : 'is-ready',
        plaqueTone: outdated ? 'is-tone-gold' : 'is-tone-teal',
        chip: outdated
          ? (state.lang === 'ru' ? 'ОБНОВИТЬ МОД' : 'UPDATE MOD')
          : (state.lang === 'ru' ? 'УСТАНОВЛЕНО' : 'INSTALLED'),
      };
    }
    return { dot: 'is-ready', plaqueTone: 'is-tone-teal', chip: state.lang === 'ru' ? 'КЛИЕНТ ГОТОВ' : 'CLIENT READY' };
  }

  function resolveProgressText() {
    if (state.capturingTarget) {
      return { text: T('installer.note.capture'), tone: 'brass' };
    }
    if (state.updateDownloading || state.updateHandoff) {
      return { text: state.updateText || T('installer.busy.selfUpdate'), tone: 'brass' };
    }
    if (state.busy && state.stage) {
      return { text: state.stage, tone: 'brass' };
    }
    if (state.busy) {
      const k = state.operation === 'uninstall' ? 'installer.busy.uninstall' : 'installer.busy.install';
      return { text: T(k), tone: 'brass' };
    }
    if (state.running) {
      return {
        text: (state.lang === 'ru' ? 'Игра запущена — ' : 'Game is running — ') + T('installer.game.running'),
        tone: 'red',
      };
    }
    if (hasKeyConflict()) {
      return {
        text: state.lang === 'ru'
          ? 'Конфликт клавиш лута и сведений о данжах — назначьте разные'
          : 'Loot & dungeon intel hotkeys collide — assign different keys',
        tone: 'red',
      };
    }
    if (state.updateChecking) {
      return { text: state.updateText || T('installer.update.checking'), tone: 'brass' };
    }
    if (state.noteText) {
      return { text: state.noteText, tone: state.noteTone || 'dim' };
    }
    if (state.updateText && !state.updateAvailableVer) {
      return { text: state.updateText, tone: 'dim' };
    }
    if (state.searching) {
      return { text: T('installer.game.searching'), tone: 'dim' };
    }
    if (state.querying) {
      return { text: T('installer.game.querying'), tone: 'dim' };
    }
    if (selectedCount() === 0) {
      return { text: T('installer.note.chooseNone'), tone: 'dim' };
    }
    if (!state.exePath) {
      return { text: T('installer.game.pick'), tone: 'brass' };
    }
    return {
      text: state.lang === 'ru'
        ? 'Наведите на опцию для подробностей · Резервная копия клиента создаётся автоматически'
        : 'Hover any feature chip for details · Client backup is created automatically',
      tone: 'dim',
    };
  }

  function resolveInstallCta() {
    if (state.updateDownloading || state.updateHandoff) {
      return {
        title: state.lang === 'ru' ? 'Обновление…' : 'Updating…',
        sub: state.updateProgress > 0 ? `${state.updateProgress}%` : '...',
      };
    }
    if (state.busy) {
      return {
        title: state.operation === 'uninstall'
          ? (state.lang === 'ru' ? 'Удаление…' : 'Removing…')
          : (state.lang === 'ru' ? 'Установка…' : 'Installing…'),
        sub: state.progress > 0 ? `${state.progress}%` : '...',
      };
    }
    const selN = selectedCount();
    const selLabel = state.lang === 'ru' ? `Выбрано: ${selN} из ${FEATURES.length}` : `${selN} of ${FEATURES.length} selected`;
    if (state.installedInSession && !isChoicesDirtySinceInstall()) {
      return { title: state.lang === 'ru' ? 'Установлено' : 'Installed', sub: selLabel };
    }
    if (state.installed && state.modVersion && state.modVersion !== state.meta.version) {
      return { title: state.lang === 'ru' ? 'Установить' : 'Install', sub: `${state.modVersion} → ${state.meta.version}` };
    }
    if (state.installed) {
      return { title: state.lang === 'ru' ? 'Применить' : 'Apply', sub: selLabel };
    }
    return { title: state.lang === 'ru' ? 'Установить' : 'Install', sub: selLabel };
  }

  /* ============================================================================
   * COLLAPSE BAR & SAY-THANKS SMOOTH WAAPI ANIMATIONS
   * ============================================================================ */
  function cancelCollapseAnims() {
    if (activeDropAnim) { try { activeDropAnim.cancel(); } catch { } activeDropAnim = null; }
    if (activeLineAnim) { try { activeLineAnim.cancel(); } catch { } activeLineAnim = null; }
    doc.getElementById('components-list')?.getAnimations?.().forEach((a) => { try { a.cancel(); } catch { } });
    doc.getElementById('inst-collapse-line')?.getAnimations?.().forEach((a) => { try { a.cancel(); } catch { } });
  }

  function renderCollapseVisuals() {
    const optsDrawer = doc.getElementById('inst-options-drawer');
    if (optsDrawer) {
      const ph = state.optionsCollapsePhase;
      optsDrawer.classList.toggle('is-dropping', ph === 'dropping' || ph === 'extending');
      optsDrawer.classList.toggle('is-line-collapsed', ph === 'extending');
      optsDrawer.classList.toggle('is-collapsed-done', ph === 'collapsed');
    }
    const collapseBtn = doc.getElementById('btn-collapse-opts');
    const collapseTri = doc.getElementById('inst-collapse-tri');
    if (collapseBtn && collapseTri) {
      const isCollapsed = state.optionsCollapsePhase === 'collapsed';
      collapseTri.innerHTML = svgIcon(isCollapsed ? 'tri-down' : 'tri-up');
      collapseBtn.setAttribute('aria-expanded', String(!isCollapsed));
      collapseBtn.title = isCollapsed
        ? (state.lang === 'ru' ? 'Показать пункты установки' : 'Show setup options')
        : (state.lang === 'ru' ? 'Скрыть пункты и показать сцену' : 'Collapse options to view scene');
    }
  }

  function toggleOptionsCollapse() {
    if (state.optionsCollapsePhase === 'dropping' || state.optionsCollapsePhase === 'extending') return;
    const compList = doc.getElementById('components-list');
    const collapseLine = doc.getElementById('inst-collapse-line');
    if (!compList || !compList.animate) {
      cancelCollapseAnims();
      state.optionsCollapsePhase = state.optionsCollapsePhase === 'open' ? 'collapsed' : 'open';
      renderCollapseVisuals();
      return;
    }

    cancelCollapseAnims();
    const dropY = Math.max(240, (compList.offsetHeight || 276) + 20);

    if (state.optionsCollapsePhase === 'open') {
      state.hoveredFeature = null;
      hideTooltip();
      state.optionsCollapsePhase = 'dropping';
      renderCollapseVisuals();

      activeDropAnim = compList.animate(
        [
          { transform: 'translate3d(0, 0, 0)', opacity: 1 },
          { transform: `translate3d(0, ${dropY}px, 0)`, opacity: 0 },
        ],
        { duration: 360, easing: 'cubic-bezier(0.36, 0, 0.88, 0.42)', fill: 'forwards' }
      );
      activeDropAnim.onfinish = () => {
        activeDropAnim = null;
        if (state.optionsCollapsePhase !== 'dropping') return;
        const finishCollapse = () => {
          if (state.optionsCollapsePhase !== 'dropping') return;
          state.optionsCollapsePhase = 'collapsed';
          renderCollapseVisuals();
          compList.getAnimations?.().forEach((a) => { try { a.cancel(); } catch { } });
          collapseLine?.getAnimations?.().forEach((a) => { try { a.cancel(); } catch { } });
        };
        if (collapseLine && collapseLine.animate) {
          activeLineAnim = collapseLine.animate(
            [
              { transform: 'scaleX(1)', opacity: 1 },
              { transform: 'scaleX(0)', opacity: 0.15 },
            ],
            { duration: 260, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' }
          );
          activeLineAnim.onfinish = () => { activeLineAnim = null; finishCollapse(); };
        } else {
          finishCollapse();
        }
      };
    } else {
      state.optionsCollapsePhase = 'extending';
      renderCollapseVisuals();

      const runRiseUp = () => {
        if (state.optionsCollapsePhase !== 'extending') return;
        activeDropAnim = compList.animate(
          [
            { transform: `translate3d(0, ${dropY}px, 0)`, opacity: 0 },
            { transform: 'translate3d(0, 0, 0)', opacity: 1 },
          ],
          { duration: 360, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' }
        );
        activeDropAnim.onfinish = () => {
          activeDropAnim = null;
          if (state.optionsCollapsePhase !== 'extending') return;
          state.optionsCollapsePhase = 'open';
          renderCollapseVisuals();
          compList.getAnimations?.().forEach((a) => { try { a.cancel(); } catch { } });
          collapseLine?.getAnimations?.().forEach((a) => { try { a.cancel(); } catch { } });
        };
      };

      if (collapseLine && collapseLine.animate) {
        activeLineAnim = collapseLine.animate(
          [
            { transform: 'scaleX(0)', opacity: 0.15 },
            { transform: 'scaleX(1)', opacity: 1 },
          ],
          { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' }
        );
        activeLineAnim.onfinish = () => { activeLineAnim = null; runRiseUp(); };
      } else {
        runRiseUp();
      }
    }
  }

  function readTranslateX(el, fallback) {
    const cs = root.getComputedStyle(el).transform;
    if (cs && cs !== 'none') {
      try {
        return new DOMMatrixReadOnly(cs).m41;
      } catch {
        const m = cs.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*([-\d.]+)/);
        if (m) return parseFloat(m[1]) || 0;
      }
    }
    return fallback;
  }

  function syncThanksDock(dock, nextPeeking) {
    if (!dock) return;
    const prevPeeking = lastThanksPeeking;
    lastThanksPeeking = nextPeeking;

    if (!mountedOnce || prevPeeking === null || prevPeeking === nextPeeking || dock.offsetWidth <= 0 || !dock.animate) {
      dock.classList.toggle('is-peeking', nextPeeking);
      return;
    }

    const peekOffset = Math.max(0, dock.offsetWidth - 38);
    const btn = dock.querySelector('.inst-thanks-btn');
    const btnOffset = (prevPeeking && btn) ? readTranslateX(btn, 0) : 0;
    const startX = readTranslateX(dock, prevPeeking ? peekOffset : 0) + btnOffset;
    if (activeThanksAnim) {
      try { activeThanksAnim.cancel(); } catch { }
      activeThanksAnim = null;
    }

    dock.classList.toggle('is-peeking', nextPeeking);
    const endX = nextPeeking ? peekOffset : 0;
    if (Math.abs(startX - endX) <= 1) return;

    activeThanksAnim = dock.animate(
      [
        { transform: `translate3d(${startX.toFixed(1)}px, 0, 0)` },
        { transform: `translate3d(${endX.toFixed(1)}px, 0, 0)` },
      ],
      {
        duration: 520,
        easing: nextPeeking
          ? 'cubic-bezier(0.4, 0, 0.2, 1)'
          : 'cubic-bezier(0.22, 1, 0.36, 1)',
      }
    );
    activeThanksAnim.onfinish = () => { activeThanksAnim = null; };
    activeThanksAnim.oncancel = () => { activeThanksAnim = null; };
  }

  /* ============================================================================
   * LAUNCHER BACKGROUND THEME AUDIO (Plays ONCE on open, switches to ended state,
   * clicking while ended replays from start)
   * ============================================================================ */
  const themeAudio = new Audio(THEME_AUDIO_URL);
  themeAudio.loop = false;
  themeAudio.preload = 'auto';
  themeAudio.volume = state.audioVolume;

  function renderAudioUi() {
    const btn = doc.getElementById('btn-sound');
    if (!btn) return;
    const isMuted = state.audioMuted || state.audioVolume <= 0.001;
    const isEnded = state.audioStatus === 'ended' || state.audioStatus === 'stopped';
    const isWaiting = state.audioStatus === 'waiting-gesture';
    const isPlaying = state.audioStatus === 'playing' && !isMuted;
    btn.className = 'dfo-ornate-btn is-sm inst-sound-btn'
      + (isPlaying ? ' is-playing' : '')
      + (isWaiting ? ' is-waiting' : '')
      + (isMuted && !isEnded ? ' is-muted' : '')
      + (isEnded ? ' is-ended' : '');
    const icoKind = isEnded ? 'sound-ended' : (isMuted ? 'sound-off' : 'sound-on');
    btn.innerHTML = `<span class="dfo-btn-ico">${svgIcon(icoKind, 15)}</span>`;
    if (state.lang === 'en') {
      btn.title = isWaiting
        ? 'Click to start launcher theme (plays once, no repeat)'
        : isEnded
          ? 'Track finished — click to play theme again'
          : isMuted ? 'Unmute launcher music' : 'Mute launcher music';
    } else {
      btn.title = isWaiting
        ? 'Нажмите, чтобы запустить музыку лаунчера (1 раз без повтора)'
        : isEnded
          ? 'Трек закончился — нажмите, чтобы включить снова'
          : isMuted ? 'Включить звук музыки лаунчера' : 'Выключить звук музыки лаунчера';
    }
  }

  function tryStartThemeAudio() {
    if (state.audioPlayedOnce || state.audioStatus === 'playing' || state.audioStatus === 'stopped') return;
    themeAudio.loop = false;
    themeAudio.volume = state.audioVolume;
    themeAudio.muted = state.audioMuted;
    const pr = themeAudio.play();
    if (pr && typeof pr.then === 'function') {
      pr.then(() => {
        state.audioStatus = 'playing';
        renderAudioUi();
      }).catch(() => {
        if (!state.audioPlayedOnce && state.audioStatus !== 'stopped') {
          state.audioStatus = 'waiting-gesture';
          renderAudioUi();
        }
      });
    }
  }

  function replayThemeAudio() {
    state.audioPlayedOnce = false;
    state.audioMuted = false;
    state.audioStatus = 'idle';
    try { themeAudio.pause(); themeAudio.currentTime = 0; } catch { }
    tryStartThemeAudio();
  }

  themeAudio.addEventListener('playing', () => { state.audioStatus = 'playing'; renderAudioUi(); });
  themeAudio.addEventListener('ended', () => { state.audioPlayedOnce = true; state.audioStatus = 'ended'; renderAudioUi(); });
  const onFirstGesture = () => { if (state.audioStatus === 'waiting-gesture') tryStartThemeAudio(); };
  doc.addEventListener('pointerdown', onFirstGesture, { capture: true });
  doc.addEventListener('keydown', onFirstGesture, { capture: true });
  root.addEventListener('pagehide', () => { try { themeAudio.pause(); } catch { } });

  /* ============================================================================
   * MAIN RENDER
   * ============================================================================ */
  function classifyLogLine(line) {
    const low = line.toLowerCase();
    if (low.includes('ошибк') || low.includes('error') || low.includes('failed')) return 'is-err';
    if (low.includes('успешно') || low.includes('finished successfully') || low.includes('проверены') || low.includes('verified') || low.includes('готово')) return 'is-ok';
    if (line.startsWith(state.meta.name) || line.includes(' · ')) return 'is-head';
    return '';
  }

  function render() {
    const win = doc.getElementById('inst-window');
    if (win) {
      win.classList.toggle('is-narrow', (root.innerWidth || 1416) < 1180);
    }

    const working = isWorking();
    const cs = clientStatusMeta();
    const pNote = resolveProgressText();
    const ready = !working && !state.resumePending && !state.querying && !state.searching && state.hasStatus && Boolean(state.exePath) && !state.running && !state.capturingTarget;
    const selN = selectedCount();
    const customN = customFontCount();
    const conflict = hasKeyConflict();

    // 1. Top Header
    doc.getElementById('inst-title').textContent = state.meta.name;
    doc.getElementById('inst-author').textContent = T('installer.author', { name: state.meta.author });
    doc.getElementById('inst-community').textContent = T('installer.community');

    const btnFonts = doc.getElementById('btn-fonts');
    btnFonts.disabled = working;
    const fontsLabel = state.lang === 'ru' ? 'Замена шрифтов' : 'Replace fonts';
    btnFonts.innerHTML = `<span class="dfo-btn-ico">${svgIcon('fonts', 14)}</span><span>${escapeHtml(fontsLabel)}</span>${customN > 0 ? `<span class="inst-tab-count">${customN}/${FONT_SLOTS.length}</span>` : ''}`;

    const btnJournal = doc.getElementById('btn-journal');
    btnJournal.innerHTML = `<span class="dfo-btn-ico">${svgIcon('log', 14)}</span><span>${escapeHtml(T('installer.button.journal'))}</span>${state.hasJournalError ? '<span class="inst-tab-dot-err"></span>' : ''}`;

    const btnUpdates = doc.getElementById('btn-updates');
    btnUpdates.disabled = working || state.updateChecking || state.resumePending || state.updatesDisabled;
    btnUpdates.innerHTML = `<span class="dfo-btn-ico">${svgIcon('update', 14)}</span><span>${escapeHtml(state.lang === 'ru' ? 'Обновления' : 'Updates')}</span>${state.updateAvailableVer ? '<span class="inst-update-badge"></span>' : ''}`;

    renderAudioUi();

    const btnLang = doc.getElementById('btn-lang');
    btnLang.innerHTML = `<span class="dfo-btn-ico">${svgIcon('globe', 14)}</span><span>${escapeHtml(T('installer.button.lang'))}</span>`;

    const btnMin = doc.getElementById('btn-rpg-min');
    const btnClose = doc.getElementById('btn-rpg-close');
    if (btnMin) btnMin.title = state.lang === 'ru' ? 'Свернуть' : 'Minimize';
    if (btnClose) btnClose.title = state.lang === 'ru' ? 'Закрыть' : 'Close';

    // 2. Left Open Stage -> GitHub New Release Alert
    const ghaBox = doc.getElementById('inst-github-alert');
    ghaBox.classList.toggle('is-visible', Boolean(state.githubAlertVisible && state.updateAvailableVer && !working));
    doc.getElementById('inst-gha-kicker').textContent = state.lang === 'ru' ? 'GITHUB · ОБНАРУЖЕН НОВЫЙ РЕЛИЗ' : 'GITHUB · NEW RELEASE DETECTED';
    doc.getElementById('inst-gha-headline').textContent = state.lang === 'ru' ? 'ДОСТУПНА НОВАЯ ВЕРСИЯ' : 'NEW VERSION AVAILABLE';
    doc.getElementById('inst-gha-cur').textContent = 'v' + state.meta.version;
    doc.getElementById('inst-gha-new').textContent = 'v' + state.updateAvailableVer;
    doc.getElementById('inst-gha-msg').textContent = state.lang === 'ru'
      ? 'На GitHub опубликована новая сборка установщика. Скачать и обновить сейчас? Ваши компоненты, клавиши и шрифты сохранятся.'
      : 'A newer installer build was detected on GitHub. Download and restart now? Your feature selections, keys, and fonts will stay intact.';
    doc.getElementById('btn-gha-update').innerHTML = `<span class="dfo-btn-ico">${svgIcon('update', 14)}</span><span>${escapeHtml(state.lang === 'ru' ? 'Обновить сейчас' : 'Update now')}</span>`;
    doc.getElementById('btn-gha-dismiss').textContent = state.lang === 'ru' ? 'Позже' : 'Later';

    // 3. Top-Right "Say Thanks" Glowing Button + Bottom-Right Option Chips
    const thanksDock = doc.getElementById('inst-thanks-dock');
    const btnThanks = doc.getElementById('btn-thanks');
    if (btnThanks) {
      const peeking = !state.installedInSession && !state.thanksPeekExpanded;
      syncThanksDock(thanksDock, peeking);
      btnThanks.disabled = working;
      const thanksText = state.lang === 'ru' ? 'Сказать спасибо' : 'Say Thanks';
      if (btnThanks.dataset.renderedLang !== state.lang) {
        btnThanks.dataset.renderedLang = state.lang;
        btnThanks.innerHTML = `<span class="dfo-btn-ico">${svgIcon('heart', 25)}</span><span class="inst-thanks-lbl">${escapeHtml(thanksText)}</span>`;
      }
      btnThanks.title = peeking
        ? (state.lang === 'ru' ? 'Нажмите, чтобы выдвинуть кнопку благодарности' : 'Click to slide out the Say Thanks button')
        : (state.lang === 'ru' ? 'Сказать спасибо автору' : 'Say thanks to the author');
      btnThanks.setAttribute('aria-expanded', String(!peeking));
    }

    const compList = doc.getElementById('components-list');
    const compSig = JSON.stringify([
      state.lang, working, state.hasStatus, state.toggles,
      state.lootKeyLabel, state.dungeonKeyLabel, state.capturingTarget, conflict,
    ]);
    if (compSig !== lastCompSig) {
      lastCompSig = compSig;
      compList.innerHTML = FEATURES.map((f) => {
        const locked = Boolean(f.locked);
        const checked = locked ? true : Boolean(state.toggles[f.key]);
        const isConflictCard = conflict && (f.key === 'nearbyLoot' || f.key === 'dungeons');
        const copy = FEATURE_COPY[f.key];
        const titleText = copy.title[state.lang] || copy.title.ru;

        let ctrlHtml = '';
        if (f.hotkey) {
          const cap = state.capturingTarget === f.hotkey;
          const kText = cap ? (state.lang === 'ru' ? 'ЖМИ…' : 'KEY…') : displayKeyLabel(f.hotkey);
          const dis = working || !state.hasStatus || !checked;
          ctrlHtml = `
            <div class="feat-key-omnibox ${cap ? 'is-capturing' : ''} ${isConflictCard ? 'is-conflict' : ''} ${dis ? 'is-disabled' : ''}"
              data-action="capture-key" data-target="${f.hotkey}">
              <span class="feat-key-bay">
                <span class="feat-key-ico">${svgIcon('key', 14)}</span>
              </span>
              <span class="feat-key-cap">
                <input class="feat-key-input" type="text" readonly value="${escapeHtml(kText)}" aria-label="${escapeHtml(titleText)}">
              </span>
            </div>`;
        } else if (f.hasVisited) {
          const subOn = Boolean(state.toggles.onlyVisited);
          const subDis = working || !checked;
          ctrlHtml = `
            <div class="feat-visited-pill ${subOn ? 'is-on' : ''} ${subDis ? 'is-disabled' : ''}" data-action="toggle-visited" role="checkbox" aria-checked="${subOn}">
              <span class="feat-pill-gem"></span>
              <span>${escapeHtml(state.lang === 'ru' ? 'Посещённые' : 'Visited')}</span>
            </div>`;
        }

        const chipCls = [
          'dfo-chip-opt',
          locked ? 'is-on is-locked' : (checked ? 'is-on' : 'is-off'),
          isConflictCard ? 'has-conflict' : '',
        ].filter(Boolean).join(' ');
        const chkCls = ['dfo-bar-chk', locked ? 'is-on is-locked' : (checked ? 'is-on' : 'is-off')].join(' ');
        const actAttr = locked ? 'aria-disabled="true"' : 'data-action="toggle-feature"';

        return `
          <div class="${chipCls}" data-feature="${f.key}" ${actAttr} role="checkbox" aria-checked="${checked}" tabindex="0">
            <div class="dfo-chip-left">
              <span class="${chkCls}">${checked ? '<span class="dfo-chk-diamond"></span>' : ''}</span>
              <span class="dfo-chip-ico">${svgIcon(f.icon, 26)}</span>
              <span class="dfo-chip-title">${escapeHtml(titleText)}</span>
            </div>
            ${ctrlHtml ? `<div class="dfo-chip-right">${ctrlHtml}</div>` : ''}
          </div>`;
      }).join('');
    }

    renderCollapseVisuals();

    // 4. Separate Bottom Footer Panel
    const outdated = state.installed && state.modVersion && state.modVersion !== state.meta.version;
    const verBox = doc.getElementById('inst-info-ver-box');
    if (verBox) verBox.className = 'dfo-res-chip inst-info-ver-box ' + (outdated ? 'is-update' : 'is-gold');
    const verLabel = doc.getElementById('inst-ver-label');
    if (verLabel) verLabel.textContent = state.lang === 'ru' ? 'ВЕР' : 'VER';
    const verPlaque = doc.getElementById('inst-ver-plaque');
    if (verPlaque) verPlaque.textContent = outdated ? `${state.modVersion}→${state.meta.version}` : ('v' + state.meta.version);
    const verIco = doc.getElementById('inst-ver-ico');
    if (verIco && !verIco.firstChild) verIco.innerHTML = svgIcon('crest', 15);
    const statusPlaque = doc.getElementById('inst-info-status-plaque');
    if (statusPlaque) statusPlaque.className = 'inst-info-status-plaque ' + cs.plaqueTone;
    const infoDot = doc.getElementById('inst-info-dot');
    if (infoDot) infoDot.className = 'inst-status-dot ' + cs.dot;
    const chipEl = doc.getElementById('inst-client-chip');
    if (chipEl) chipEl.textContent = cs.chip;

    const pathInp = doc.getElementById('inst-path-input');
    pathInp.value = state.exePath || state.pathHintText || T('installer.path.pick');
    pathInp.classList.toggle('is-hint', !state.exePath);

    doc.getElementById('inst-status-dot').className = 'inst-status-dot ' + cs.dot;

    const btnBrowse = doc.getElementById('btn-browse');
    btnBrowse.disabled = working;
    btnBrowse.innerHTML = `<span class="dfo-btn-ico">${svgIcon('folder', 14)}</span><span>${escapeHtml(T('installer.button.browse'))}</span>`;

    const btnRefresh = doc.getElementById('btn-refresh');
    btnRefresh.disabled = working || state.querying || state.searching;
    btnRefresh.innerHTML = `<span class="dfo-btn-ico">${svgIcon('refresh', 14)}</span><span>${escapeHtml(T('installer.button.refresh'))}</span>`;

    const btnUninstall = doc.getElementById('btn-uninstall');
    btnUninstall.classList.toggle('is-hidden', !state.installed);
    btnUninstall.disabled = !(ready && state.installed);
    btnUninstall.innerHTML = `<span class="dfo-btn-ico">${svgIcon('trash', 14)}</span><span>${escapeHtml(T('installer.button.uninstall'))}</span>`;

    const cta = resolveInstallCta();
    const btnInstall = doc.getElementById('btn-install');
    const showInstalled = state.installedInSession && !isChoicesDirtySinceInstall();
    btnInstall.disabled = !(ready && selN > 0);
    btnInstall.className = 'dfo-ornate-btn is-cta inst-big-install ' + (
      working ? 'is-busy-active'
        : (ready && selN > 0 ? (outdated && !showInstalled ? 'primary' : 'is-ready') : 'primary')
    );
    btnInstall.innerHTML = `
      <span class="inst-big-cta-top"><span class="dfo-btn-ico">${svgIcon('spark', 18)}</span><span>${escapeHtml(cta.title)}</span></span>
      <span class="inst-big-cta-sub">${escapeHtml(cta.sub)}</span>`;

    const noteEl = doc.getElementById('inst-note-main');
    noteEl.className = 'inst-note-main tone-' + pNote.tone;
    noteEl.textContent = pNote.text;

    const activeProgress = (state.updateDownloading || state.updateHandoff) ? state.updateProgress : state.progress;
    const pctEl = doc.getElementById('inst-pct-readout');
    pctEl.textContent = activeProgress > 0 ? activeProgress + '%' : '';

    const progWrap = doc.getElementById('inst-progress-wrap');
    const fillEl = doc.getElementById('inst-progress-fill');
    const indeterminate = (working && activeProgress === 0) || state.searching || state.querying || state.updateChecking;
    const isDone = !working && activeProgress === 100;
    const hasFill = indeterminate || activeProgress > 0;
    if (progWrap) {
      progWrap.classList.toggle('has-fill', hasFill);
      progWrap.classList.toggle('is-done', isDone);
    }
    fillEl.classList.toggle('is-indeterminate', indeterminate);
    fillEl.classList.toggle('is-done', isDone);
    fillEl.style.width = indeterminate ? '' : activeProgress + '%';

    // 5. Fonts Dialog
    const fontsWrap = doc.getElementById('inst-fonts-backdrop');
    fontsWrap.classList.toggle('is-open', state.fontsDialogOpen);
    if (state.fontsDialogOpen) {
      doc.getElementById('inst-fonts-title').textContent = state.lang === 'ru' ? 'ЗАМЕНА И НАСТРОЙКА ШРИФТОВ' : 'FONT REPLACEMENT & SLOTS';
      doc.getElementById('inst-fonts-summary').textContent = customN === 0
        ? T('installer.fonts.summaryBase', { all: FONT_SLOTS.length })
        : T('installer.fonts.summaryCustom', { n: customN, all: FONT_SLOTS.length });

      const fontsList = doc.getElementById('fonts-list');
      const prevScrollFonts = fontsList.scrollTop;
      fontsList.innerHTML = FONT_SLOTS.map((s) => {
        const ov = state.fontSlots[s.id];
        const isCustom = Boolean(ov && ov.custom);
        const badge = isCustom
          ? T('installer.fonts.badgeCustom', { name: ov.label })
          : T('installer.fonts.badgeBase', { name: s.baseLabel });
        const sample = state.lang === 'ru' ? s.sampleRu : s.sampleEn;
        const previewFamily = (isCustom && ov.family) ? ov.family : s.family;
        return `
          <article class="font-slot-card ${isCustom ? 'is-custom' : ''}" data-slot="${s.id}">
            <div class="font-slot-meta">
              <div class="font-slot-title">${escapeHtml(T(`installer.fonts.slot.${s.id}.title`))}</div>
              <span class="dfo-chip ${isCustom ? 'chip-blue' : 'chip-muted'}">${escapeHtml(badge)}</span>
            </div>
            <div class="font-slot-center dfo-well-frame">
              <div class="font-slot-desc">${escapeHtml(T(`installer.fonts.slot.${s.id}.description`))}</div>
              <div class="font-slot-preview" style="font-family:${previewFamily}">${escapeHtml(sample)}</div>
            </div>
            <div class="font-slot-actions">
              <button type="button" class="dfo-ornate-btn is-sm" data-action="font-pick" data-slot="${s.id}" ${working ? 'disabled' : ''}>${escapeHtml(T('installer.fonts.btn.pick'))}</button>
              <button type="button" class="dfo-ornate-btn is-sm ${isCustom ? 'danger' : ''}" data-action="font-reset" data-slot="${s.id}" ${working || !isCustom ? 'disabled' : ''}>${escapeHtml(T('installer.fonts.btn.reset'))}</button>
            </div>
          </article>`;
      }).join('');
      fontsList.scrollTop = prevScrollFonts;

      doc.getElementById('btn-fonts-all').textContent = T('installer.button.fontsApplyAll');
      doc.getElementById('btn-fonts-all').disabled = working;
      doc.getElementById('btn-fonts-reset').textContent = T('installer.button.fontsResetAll');
      doc.getElementById('btn-fonts-reset').disabled = working || customN === 0;
      doc.getElementById('btn-fonts-import').textContent = T('installer.button.fontsImport');
      doc.getElementById('btn-fonts-import').disabled = working;
      doc.getElementById('btn-fonts-export').textContent = T('installer.button.fontsExport');
      doc.getElementById('btn-fonts-export').disabled = working;
      doc.getElementById('btn-fonts-dir').textContent = T('installer.button.fontsOpenDir');
      doc.getElementById('btn-fonts-dir').disabled = working;
      doc.getElementById('btn-fonts-close').textContent = state.lang === 'ru' ? 'Закрыть' : 'Close';
    }

    // 6. Journal Dialog
    const journalWrap = doc.getElementById('inst-journal-backdrop');
    const wasJournalOpen = journalWrap.classList.contains('is-open');
    journalWrap.classList.toggle('is-open', state.journalDialogOpen);
    if (state.journalDialogOpen) {
      doc.getElementById('inst-journal-title').textContent = state.lang === 'ru' ? 'ЖУРНАЛ ОПЕРАЦИЙ УСТАНОВЩИКА' : 'INSTALLER OPERATIONS JOURNAL';
      const logWell = doc.getElementById('inst-log-well');
      const curLog = state.logText || '';
      if (curLog !== lastLogText) {
        const atBottom = !wasJournalOpen || (logWell.scrollHeight - logWell.scrollTop - logWell.clientHeight) < 36;
        lastLogText = curLog;
        const lines = curLog.split(/\r?\n/);
        logWell.innerHTML = lines.map((line) => {
          const cls = classifyLogLine(line);
          return `<span class="log-line ${cls}">${escapeHtml(line || ' ')}</span>`;
        }).join('');
        if (atBottom) logWell.scrollTop = logWell.scrollHeight;
      } else if (!wasJournalOpen) {
        logWell.scrollTop = logWell.scrollHeight;
      }

      doc.getElementById('btn-save-log').textContent = T('installer.button.saveLog');
      doc.getElementById('btn-open-log').textContent = T('installer.button.openLog');
      doc.getElementById('btn-open-report').textContent = T('installer.button.openReport');
      doc.getElementById('btn-installer-log').textContent = T('installer.button.installerLog');
      doc.getElementById('btn-journal-close').textContent = state.lang === 'ru' ? 'Закрыть' : 'Close';
    }

    // 7. Say Thanks Dialog (RU: T-Bank QR + text Boosty link; EN: large clickable Boosty card + link)
    const thanksWrap = doc.getElementById('inst-thanks-backdrop');
    if (thanksWrap) {
      thanksWrap.classList.toggle('is-open', state.thanksDialogOpen);
      const tSig = state.lang + '|' + state.meta.name;
      if (state.thanksDialogOpen && tSig !== lastThanksSig) {
        lastThanksSig = tSig;
        const isRu = state.lang === 'ru';
        doc.getElementById('inst-thanks-title').textContent = isRu ? 'СКАЗАТЬ СПАСИБО АВТОРУ' : 'SAY THANKS';
        doc.getElementById('inst-thanks-badge').textContent = isRu ? 'Т-БАНК · BOOSTY' : 'BOOSTY';
        const tBody = doc.getElementById('inst-thanks-body');
        if (isRu) {
          tBody.innerHTML = `
            <p class="inst-thanks-intro">Спасибо за установку <strong>${escapeHtml(state.meta.name)}</strong>! Если расширение делает игру удобнее, можно поддержать автора.</p>
            <div class="thanks-qr-frame">
              <img class="thanks-qr-img" src="${TBANK_QR_URL}" alt="QR-код для перевода в Т-Банк">
            </div>
            <div class="thanks-tbank-caption">Перевод в Т-Банк</div>
            <div class="thanks-boosty-row">
              <span class="thanks-boosty-prefix">Бусти:</span>
              <a class="thanks-boosty-link" href="${BOOSTY_URL}" data-open-url="${BOOSTY_URL}">${BOOSTY_URL}</a>
            </div>`;
          doc.getElementById('inst-thanks-foot-note').textContent = 'Наведите камеру или приложение Т-Банка на QR-код';
          doc.getElementById('btn-thanks-close').textContent = 'Закрыть';
        } else {
          tBody.innerHTML = `
            <p class="inst-thanks-intro">Thank you for installing <strong>${escapeHtml(state.meta.name)}</strong>! If you enjoy the expander, you can support the author on Boosty.</p>
            <a class="thanks-boosty-hero" href="${BOOSTY_URL}" data-open-url="${BOOSTY_URL}" title="Support on Boosty">
              ${svgIcon('boosty', 108)}
              <span class="thanks-boosty-hero-lbl">Boosty</span>
            </a>
            <div class="thanks-boosty-row">
              <a class="thanks-boosty-link" href="${BOOSTY_URL}" data-open-url="${BOOSTY_URL}">${BOOSTY_URL}</a>
            </div>`;
          doc.getElementById('inst-thanks-foot-note').textContent = 'Click the Boosty card or link to open in your browser';
          doc.getElementById('btn-thanks-close').textContent = 'Close';
        }
      }
    }

    syncTooltipDisplay();
  }

  /* ============================================================================
   * HOTKEY CAPTURE (Keyboard / NumPad / Mouse 3-4-5)
   * ============================================================================ */
  function startKeyCapture(target) {
    const enabled = target === 'dungeon' ? state.toggles.dungeons : state.toggles.nearbyLoot;
    if (isWorking() || !state.hasStatus || !enabled) return;
    state.capturingTarget = (state.capturingTarget === target) ? null : target;
    render();
  }

  function finishKeyCapture(code) {
    if (!state.capturingTarget) return;
    const target = state.capturingTarget;
    state.capturingTarget = null;
    if (code && isValidHotkeyCode(code)) {
      sendAction({ cmd: 'setKey', target, code });
    }
    render();
  }

  doc.addEventListener('keydown', (e) => {
    if (state.capturingTarget) {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') { finishKeyCapture(''); return; }
      if (e.repeat) return;
      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
      if (isValidHotkeyCode(e.code)) finishKeyCapture(e.code);
      return;
    }
    // Block browser-only shortcuts so the window behaves strictly as a native desktop app
    if (e.key === 'F5' || (e.ctrlKey && ['r', 'R', 'p', 'P', 's', 'S', 'u', 'U', 'f', 'F'].includes(e.key)) || (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight'))) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') {
      state.hoveredFeature = null;
      if (state.thanksDialogOpen) { state.thanksDialogOpen = false; render(); return; }
      if (state.fontsDialogOpen) { state.fontsDialogOpen = false; render(); return; }
      if (state.journalDialogOpen) { state.journalDialogOpen = false; render(); return; }
      hideTooltip();
    }
  }, true);

  doc.addEventListener('mousedown', (e) => {
    if (e.button === 3 || e.button === 4) {
      // Never trigger Edge WebView2 Back/Forward navigation on side mouse buttons
      e.preventDefault();
    }
    if (!state.capturingTarget) return;
    if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    if (e.button === 1) { e.preventDefault(); finishKeyCapture('Mouse3'); return; }
    if (e.button === 3) { e.preventDefault(); finishKeyCapture('Mouse4'); return; }
    if (e.button === 4) { e.preventDefault(); finishKeyCapture('Mouse5'); return; }
    const box = e.target.closest('.feat-key-omnibox');
    if (!box) finishKeyCapture('');
  }, true);

  doc.addEventListener('mouseup', (e) => {
    if (e.button === 3 || e.button === 4) e.preventDefault();
  }, true);
  doc.addEventListener('auxclick', (e) => {
    if (e.button === 1 || e.button === 3 || e.button === 4) e.preventDefault();
  }, true);
  doc.addEventListener('contextmenu', (e) => e.preventDefault());
  doc.addEventListener('dragstart', (e) => e.preventDefault());

  /* ============================================================================
   * UI EVENTS -> REAL GO BACKEND
   * ============================================================================ */
  function wireEvents() {
    // Native Win32 drag on header empty space
    doc.getElementById('inst-header')?.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('button, a, input, select')) return;
      e.preventDefault();
      headerDragging = true;
      sendAction({ cmd: 'drag' });
    });
    const endHeaderDrag = () => {
      if (!headerDragging) return;
      headerDragging = false;
      sendAction({ cmd: 'dragEnd' });
    };
    root.addEventListener('mouseup', endHeaderDrag, true);
    root.addEventListener('blur', endHeaderDrag);

    doc.getElementById('btn-rpg-min')?.addEventListener('click', () => sendAction({ cmd: 'minimize' }));
    doc.getElementById('btn-rpg-close')?.addEventListener('click', () => sendAction({ cmd: 'close' }));

    doc.getElementById('btn-sound')?.addEventListener('click', () => {
      if (state.audioStatus === 'waiting-gesture') { state.audioMuted = false; tryStartThemeAudio(); return; }
      if (state.audioStatus === 'ended' || state.audioStatus === 'stopped') { replayThemeAudio(); return; }
      state.audioMuted = !state.audioMuted;
      themeAudio.muted = state.audioMuted;
      renderAudioUi();
    });

    doc.getElementById('btn-collapse-opts')?.addEventListener('click', toggleOptionsCollapse);
    doc.getElementById('btn-lang')?.addEventListener('click', () => sendAction({ cmd: 'toggleLang' }));

    doc.getElementById('btn-fonts')?.addEventListener('click', () => {
      state.capturingTarget = null;
      state.hoveredFeature = null;
      state.fontsDialogOpen = true;
      sendAction({ cmd: 'reloadFonts' });
      render();
    });
    doc.getElementById('btn-fonts-close')?.addEventListener('click', () => { state.fontsDialogOpen = false; render(); });
    doc.getElementById('inst-fonts-backdrop')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) { state.fontsDialogOpen = false; render(); }
    });

    doc.getElementById('btn-journal')?.addEventListener('click', () => {
      state.capturingTarget = null;
      state.hoveredFeature = null;
      state.journalDialogOpen = true;
      render();
    });
    doc.getElementById('btn-journal-close')?.addEventListener('click', () => { state.journalDialogOpen = false; render(); });
    doc.getElementById('inst-journal-backdrop')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) { state.journalDialogOpen = false; render(); }
    });

    doc.getElementById('btn-thanks')?.addEventListener('click', () => {
      if (isWorking()) return;
      if (!state.installedInSession && !state.thanksPeekExpanded) {
        state.thanksPeekExpanded = true;
        render();
        return;
      }
      state.capturingTarget = null;
      state.hoveredFeature = null;
      state.thanksDialogOpen = true;
      render();
    });
    doc.getElementById('btn-thanks-close')?.addEventListener('click', () => { state.thanksDialogOpen = false; render(); });
    doc.getElementById('inst-thanks-backdrop')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) { state.thanksDialogOpen = false; render(); }
    });
    doc.getElementById('inst-thanks-body')?.addEventListener('click', (e) => {
      const link = e.target.closest('[data-open-url]');
      if (!link) return;
      e.preventDefault();
      sendAction({ cmd: 'openUrl', url: link.dataset.openUrl });
    });

    doc.getElementById('btn-updates')?.addEventListener('click', () => {
      if (isWorking() || state.updateChecking || state.updatesDisabled) return;
      if (state.updateAvailableVer) {
        state.githubAlertVisible = !state.githubAlertVisible;
        render();
        return;
      }
      sendAction({ cmd: 'checkUpdates' });
    });
    doc.getElementById('btn-gha-update')?.addEventListener('click', () => {
      state.githubAlertVisible = false;
      render();
      sendAction({ cmd: 'acceptUpdate' });
    });
    doc.getElementById('btn-gha-dismiss')?.addEventListener('click', () => {
      state.githubAlertVisible = false;
      render();
      sendAction({ cmd: 'dismissUpdate' });
    });

    doc.getElementById('btn-browse')?.addEventListener('click', () => sendAction({ cmd: 'browse' }));
    doc.getElementById('btn-refresh')?.addEventListener('click', () => sendAction({ cmd: 'refresh' }));
    doc.getElementById('btn-install')?.addEventListener('click', () => {
      pendingSessionOp = 'install';
      sendAction({ cmd: 'install' });
    });
    doc.getElementById('btn-uninstall')?.addEventListener('click', () => {
      pendingSessionOp = 'uninstall';
      sendAction({ cmd: 'uninstall' });
    });

    const compList = doc.getElementById('components-list');
    compList.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      root.__dfoDungeonScene?.onUserAction('click');
      if (action === 'capture-key') {
        e.stopPropagation();
        startKeyCapture(target.dataset.target);
        return;
      }
      if (action === 'toggle-visited') {
        e.stopPropagation();
        if (isWorking() || !state.toggles.marks) return;
        sendAction({ cmd: 'toggleVisited' });
        return;
      }
      if (action === 'toggle-feature') {
        if (isWorking()) return;
        const key = target.dataset.feature;
        const feat = FEATURES.find((x) => x.key === key);
        if (!feat || feat.locked) return;
        sendAction({ cmd: 'toggleFeature', key });
      }
    });
    compList.addEventListener('keydown', (e) => {
      if (state.capturingTarget || isWorking()) return;
      if (e.key !== ' ' && e.key !== 'Enter') return;
      const chip = e.target.closest('.dfo-chip-opt[data-action="toggle-feature"]');
      if (!chip || e.target.closest('.feat-key-omnibox, .feat-visited-pill')) return;
      e.preventDefault();
      const key = chip.dataset.feature;
      const feat = FEATURES.find((x) => x.key === key);
      if (!feat || feat.locked) return;
      sendAction({ cmd: 'toggleFeature', key });
    });

    compList.addEventListener('mouseover', (e) => {
      const chip = e.target.closest('.dfo-chip-opt');
      if (!chip) return;
      const k = chip.dataset.feature;
      if (state.hoveredFeature !== k) {
        state.hoveredFeature = k;
        syncTooltipDisplay();
      }
    });
    compList.addEventListener('mouseleave', () => {
      if (state.hoveredFeature !== null) {
        state.hoveredFeature = null;
        syncTooltipDisplay();
      }
    });
    compList.addEventListener('focusin', (e) => {
      const chip = e.target.closest('.dfo-chip-opt');
      if (chip) {
        state.hoveredFeature = chip.dataset.feature;
        syncTooltipDisplay();
      }
    });
    compList.addEventListener('focusout', (e) => {
      if (!compList.contains(e.relatedTarget)) {
        state.hoveredFeature = null;
        syncTooltipDisplay();
      }
    });
    doc.addEventListener('visibilitychange', () => { if (doc.hidden) hideTooltip(); });
    root.addEventListener('blur', hideTooltip);
    root.addEventListener('resize', () => { render(); });

    doc.getElementById('fonts-list')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn || isWorking()) return;
      if (btn.dataset.action === 'font-pick') sendAction({ cmd: 'fontPick', slot: btn.dataset.slot });
      else if (btn.dataset.action === 'font-reset') sendAction({ cmd: 'fontReset', slot: btn.dataset.slot });
    });

    doc.getElementById('btn-fonts-all')?.addEventListener('click', () => sendAction({ cmd: 'fontApplyAll' }));
    doc.getElementById('btn-fonts-reset')?.addEventListener('click', () => sendAction({ cmd: 'fontResetAll' }));
    doc.getElementById('btn-fonts-import')?.addEventListener('click', () => sendAction({ cmd: 'fontImport' }));
    doc.getElementById('btn-fonts-export')?.addEventListener('click', () => sendAction({ cmd: 'fontExport' }));
    doc.getElementById('btn-fonts-dir')?.addEventListener('click', () => sendAction({ cmd: 'fontOpenDir' }));

    doc.getElementById('btn-save-log')?.addEventListener('click', () => sendAction({ cmd: 'saveLog' }));
    doc.getElementById('btn-open-log')?.addEventListener('click', () => sendAction({ cmd: 'openGameLog' }));
    doc.getElementById('btn-open-report')?.addEventListener('click', () => sendAction({ cmd: 'openMarksReport' }));
    doc.getElementById('btn-installer-log')?.addEventListener('click', () => sendAction({ cmd: 'openInstallerLog' }));
  }

  /* ============================================================================
   * CUSTOM IN-GAME GAUNTLET CURSOR + GLOWING NEON TRAIL & HALVED TIP BLOOM
   * ============================================================================ */
  const cursorState = {
    inside: false,
    x: -100,
    y: -100,
    pointer: false,
    pressed: false,
    pts: [],
    rafId: 0,
  };

  function startCursorLoop() {
    if (cursorState.rafId) return;
    const fxCanvas = doc.getElementById('inst-cursor-fx');
    const instRoot = doc.getElementById('inst-root');
    if (!fxCanvas || !instRoot) return;
    const ctx = fxCanvas.getContext('2d');
    if (!ctx) return;

    const frame = () => {
      cursorState.rafId = 0;
      const dpr = Math.max(1, root.devicePixelRatio || 1);
      const cw = Math.max(1, instRoot.clientWidth);
      const ch = Math.max(1, instRoot.clientHeight);
      if (fxCanvas.width !== Math.round(cw * dpr) || fxCanvas.height !== Math.round(ch * dpr)) {
        fxCanvas.width = Math.round(cw * dpr);
        fxCanvas.height = Math.round(ch * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);

      const now = performance.now();
      const maxAge = 390;
      while (cursorState.pts.length && (now - cursorState.pts[0].t) > maxAge) {
        cursorState.pts.shift();
      }

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const pts = cursorState.pts;
      if (pts.length >= 2) {
        for (let i = 1; i < pts.length; i++) {
          const p0 = pts[i - 1];
          const p1 = pts[i];
          const age = (now - p1.t) / maxAge;
          const life = Math.max(0, 1 - age);
          if (life <= 0.01) continue;
          const u = i / (pts.length - 1);
          const power = life * (0.25 + 0.75 * u);

          const mx0 = i > 1 ? (pts[i - 2].x + p0.x) * 0.5 : p0.x;
          const my0 = i > 1 ? (pts[i - 2].y + p0.y) * 0.5 : p0.y;
          const mx1 = (p0.x + p1.x) * 0.5;
          const my1 = (p0.y + p1.y) * 0.5;

          const drawSeg = (w, col) => {
            ctx.beginPath();
            ctx.moveTo(mx0, my0);
            ctx.quadraticCurveTo(p0.x, p0.y, mx1, my1);
            ctx.lineWidth = w;
            ctx.strokeStyle = col;
            ctx.stroke();
          };
          drawSeg(2.5 + 17 * power, `rgba(14, 165, 233, ${(0.12 * power).toFixed(3)})`);
          drawSeg(1.6 + 8.5 * power, `rgba(56, 189, 248, ${(0.28 * power).toFixed(3)})`);
          drawSeg(0.9 + 3.4 * power, `rgba(125, 238, 255, ${(0.72 * power).toFixed(3)})`);
          drawSeg(0.4 + 1.4 * power, `rgba(240, 253, 255, ${(0.92 * power).toFixed(3)})`);
        }
      }

      if (cursorState.inside && cursorState.x >= 0 && cursorState.y >= 0) {
        const gOuter = ctx.createRadialGradient(cursorState.x, cursorState.y, 0, cursorState.x, cursorState.y, 48);
        gOuter.addColorStop(0, 'rgba(130, 238, 255, 0.20)');
        gOuter.addColorStop(0.28, 'rgba(56, 189, 248, 0.12)');
        gOuter.addColorStop(0.65, 'rgba(14, 165, 233, 0.04)');
        gOuter.addColorStop(1, 'rgba(14, 165, 233, 0)');
        ctx.fillStyle = gOuter;
        ctx.beginPath();
        ctx.arc(cursorState.x, cursorState.y, 48, 0, Math.PI * 2);
        ctx.fill();

        const gCore = ctx.createRadialGradient(cursorState.x, cursorState.y, 0, cursorState.x, cursorState.y, 10);
        gCore.addColorStop(0, 'rgba(255, 255, 255, 0.42)');
        gCore.addColorStop(0.45, 'rgba(125, 238, 255, 0.24)');
        gCore.addColorStop(1, 'rgba(56, 189, 248, 0)');
        ctx.fillStyle = gCore;
        ctx.beginPath();
        ctx.arc(cursorState.x, cursorState.y, 10, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      if (cursorState.pts.length > 0) {
        cursorState.rafId = root.requestAnimationFrame(frame);
      }
    };
    cursorState.rafId = root.requestAnimationFrame(frame);
  }

  function mountCursorFx() {
    const instRoot = doc.getElementById('inst-root');
    const cursorEl = doc.getElementById('inst-game-cursor');
    if (!instRoot || !cursorEl) return;
    cursorEl.innerHTML = `<img src="${GAUNTLET_CURSOR_URL}" width="31" height="32" alt="">`;

    const updateCursor = (e) => {
      const r = instRoot.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (x < 0 || y < 0 || x > r.width || y > r.height) return;

      const now = performance.now();
      const prev = cursorState.pts[cursorState.pts.length - 1];
      if (prev) {
        const dx = x - prev.x;
        const dy = y - prev.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 14) {
          const segs = Math.min(8, Math.ceil(dist / 8));
          for (let s = 1; s < segs; s++) {
            const k = s / segs;
            cursorState.pts.push({ x: prev.x + dx * k, y: prev.y + dy * k, t: prev.t + (now - prev.t) * k });
          }
        }
      }
      cursorState.pts.push({ x, y, t: now });
      if (cursorState.pts.length > 90) cursorState.pts.splice(0, cursorState.pts.length - 90);

      cursorState.x = x;
      cursorState.y = y;
      cursorState.inside = true;
      cursorState.pointer = Boolean(e.target && e.target.closest('button, a, [data-action], [role="checkbox"], input, select'));

      cursorEl.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      cursorEl.classList.add('is-visible');
      cursorEl.classList.toggle('is-pointer', cursorState.pointer);
      startCursorLoop();
    };

    instRoot.addEventListener('pointermove', updateCursor, { passive: true });
    instRoot.addEventListener('pointerdown', (e) => {
      cursorState.pressed = true;
      cursorEl.classList.add('is-pressed');
      updateCursor(e);
    }, { passive: true });
    root.addEventListener('pointerup', () => {
      cursorState.pressed = false;
      cursorEl.classList.remove('is-pressed');
    }, { passive: true });
    instRoot.addEventListener('pointerleave', () => {
      cursorState.inside = false;
      cursorEl.classList.remove('is-visible', 'is-pointer', 'is-pressed');
      startCursorLoop();
    });
  }

  function mount() {
    doc.getElementById('inst-crest').innerHTML = svgIcon('crest', 29);
    doc.getElementById('inst-path-ico').innerHTML = svgIcon('folder', 15);
    mountCursorFx();
    wireEvents();
    render();
    mountedOnce = true;
    tryStartThemeAudio();
    connectBackend();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', mount);
  else mount();
})(window);
