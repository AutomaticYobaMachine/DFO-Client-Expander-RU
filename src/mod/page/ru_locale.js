// DFO Mod - THE GAME'S OWN LANGUAGE, RUSSIAN, AND THE MOD'S PACK IN IT. Runs before the game's modules.
//
// DFO Online carries Daggerfall Unity's text core (systems/textManager.js) with locales: the port's own words in each
// language (Port_Strings - Russian drafted whole), and any DFU translation pack laid over them. The mod's pack
// (data/ru-pack: DG_RU's tables and quests, filled, its terms brought up to date, the names on the map kept as the map
// writes them) is handed to the game as one its build carries (scenes/localeData.js indexBundledPacks, through the
// transforms.cjs ru.packs hook) - so the game itself shows it, its quests by message, its plurals by its own rules; a pack
// the player installs still goes over it.
//
// The game is switched to Russian ONCE (its own setting, uiPrefs `language`) - after that the choice is the player's:
// their Language row in the game's settings stands. With the mod's Russian switched off, a language the mod chose is
// given back to English.
//
// And every building keeps the name the map gives it (__dfoNameCanon): the faction and place names the game would show
// translated are taken out of the bag a guild's hall, a temple or a shop is named from. The classic fonts keep the
// game's pixel face, the mod's Cyrillic in it (__dfoRuPixel: installLocaleFaces would give them a system font).
(() => {
  'use strict';
  const C = globalThis.__DFO_MOD_CFG__?.ru ?? {};

  // a building's name is the map's, in any language
  globalThis.__dfoNameCanon = (o) => {
    if (!o || typeof o !== 'object') return o;
    const out = { ...o };
    for (const k of ['shownFactionName', 'shownTempleName', 'shownLocationName', 'shownRegionName']) delete out[k];
    return out;
  };

  // the game's setting: Russian, once
  const KEY = 'dagger.ui.v1', MARK = 'dfoMod.ruLanguage';
  try {
    const st = globalThis.daggerShell?.storage ?? globalThis.localStorage;
    if (st) {
      let prefs = {};
      try { prefs = JSON.parse(st.getItem(KEY) || '{}') || {}; } catch { prefs = {}; }
      if (C.on && C.gameLanguage !== false) {
        if (st.getItem(MARK) !== '1') {
          if (!prefs.language || prefs.language === 'en') { prefs.language = 'ru'; prefs.languageOffered = true; st.setItem(KEY, JSON.stringify(prefs)); }
          st.setItem(MARK, '1');
        }
      } else if (st.getItem(MARK) === '1') {
        if (prefs.language === 'ru') { prefs.language = 'en'; st.setItem(KEY, JSON.stringify(prefs)); }
        st.removeItem(MARK);
      }
    }
  } catch { /* the game's own default stands */ }

  if (!C.on || !C.pack || !Array.isArray(C.pack.files)) return;
  globalThis.__dfoRuPixel = true;
  // the pack, as the build's own: its PACK.json read at once, its files fetched when the language loads
  const root = new URL('/dfo-mod/ru-pack/', location.href);
  globalThis.__dfoPacks = (g) => {
    const meta = { ...(g?.meta ?? {}) }, text = { ...(g?.text ?? {}) };
    meta['../../locales/ru/pack/PACK.json'] = C.pack.meta;
    for (const f of C.pack.files) {
      text[`../../locales/ru/pack/${f}`] = () => fetch(new URL(f, root)).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${f}: ${r.status}`))));
    }
    return { ...(g ?? {}), meta, text };
  };
})();
