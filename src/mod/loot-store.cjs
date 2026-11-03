'use strict';
// One file, separate namespaces. City-map replacement writes preserve loot settings and dungeon notes.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const Rules = require('./page/dfo_loot_rules.js');
const Dungeon = require('./page/dfo_dungeon_model.js');
const MAX = 16 * 1024 * 1024;
const KEY_RE = /^(?:Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Mouse[345]|Numpad(?:[0-9]|Enter|Add|Subtract|Multiply|Divide|Decimal|Comma|Equal)|Space|Tab|Enter|Backspace|Insert|Delete|Home|End|PageUp|PageDown|Arrow(?:Up|Down|Left|Right)|CapsLock|NumLock|ScrollLock|Pause|PrintScreen|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|IntlBackslash|ContextMenu)$/;
const validLootKey = key => typeof key === 'string' && KEY_RE.test(key);
const cachedLootKey = cache => [cache?.hotkeys?.loot, cache?.loot?.keyCode].find(validLootKey) ?? null;
const cachedDungeonKey = cache => [cache?.hotkeys?.dungeon].find(validLootKey) ?? null;
function createLootStore(userData) {
  const file = userData && path.join(userData, 'dfo-mod-cache.json');
  const read = () => {
    if (!file) throw new Error('Нет каталога пользовательских данных.');
    if (!fs.existsSync(file)) return {};
    const obj = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Некорректный файл кеша.');
    return obj;
  };
  const write = obj => {
    const text = JSON.stringify(obj);
    if (Buffer.byteLength(text) > MAX) throw new Error('Превышен размер кеша.');
    fs.mkdirSync(userData, { recursive: true });
    const tmp = file + '.tmp'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, file);
  };
  const fail = (message, status = 400) => Object.assign(new Error(message), { status });
  const state = () => Rules.cleanState(read().loot);
  function replaceCityCache(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw fail('Некорректный кеш.');
    const current = read();
    const merged = { ...obj };
    if (current.loot) merged.loot = current.loot; else delete merged.loot;
    if (current.dungeons) merged.dungeons = current.dungeons; else delete merged.dungeons;
    if (current.hotkeys) merged.hotkeys = current.hotkeys; else delete merged.hotkeys;
    write(merged);
  }
  const hotkeys = () => {
    const h = read().hotkeys;
    return h && typeof h === 'object' && !Array.isArray(h) ? { ...h } : {};
  };
  function saveHotkeys(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw fail('Некорректные клавиши.');
    if (Object.hasOwn(payload, 'loot') && !validLootKey(payload.loot)) throw fail('Некорректная кнопка лута.');
    if (Object.hasOwn(payload, 'dungeon') && !validLootKey(payload.dungeon)) throw fail('Некорректная кнопка сведений о данже.');
    const cache = read();
    const current = cache.hotkeys && typeof cache.hotkeys === 'object' && !Array.isArray(cache.hotkeys) ? cache.hotkeys : {};
    const next = { ...current, ...payload };
    write({ ...cache, hotkeys: next });
    return next;
  }
  function saveSettings(payload) {
    const cache = read(), old = Rules.cleanState(cache.loot);
    if (payload.revision !== old.revision) throw fail('Настройки изменились в другом окне. Откройте их заново.', 409);
    const next = { ...Rules.cleanSettings(payload), revision: old.revision + 1, presets: old.presets };
    write({ ...cache, loot: next }); return next;
  }
  function savePreset(payload) {
    const cache = read(), old = Rules.cleanState(cache.loot), name = Rules.presetName(payload.name);
    if (payload.revision !== old.revision) throw fail('Настройки изменились в другом окне. Откройте их заново.', 409);
    if (!name) throw fail('Введите имя фильтра.');
    if (old.presets.length >= Rules.MAX_PRESETS) throw fail('Сохранено слишком много фильтров.');
    if (old.presets.some(p => p.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw fail('Фильтр с таким именем уже существует.', 409);
    const p = { id: crypto.randomUUID(), name, at: Date.now(), filter: Rules.cleanFilter(payload.filter) };
    const dir = path.join(userData, 'dfo-mod-loot-presets'); fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, p.id + '.json'), tmp = dest + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ format: 'dfo-loot-filter', v: 1, ...p }, null, 2)); fs.renameSync(tmp, dest);
    try {
      const next = { ...old, revision: old.revision + 1, presets: [...old.presets, p] };
      write({ ...cache, loot: next }); return { state: next, preset: p, file: `dfo-mod-loot-presets/${p.id}.json` };
    } catch (e) { fs.unlinkSync(dest); throw e; }
  }
  const dungeonNotes = () => Object.values(read().dungeons || {}).map(Dungeon.cleanNote).filter(Boolean);
  function saveDungeonNote(payload) {
    const note = Dungeon.cleanNote(payload); if (!note) throw fail('Некорректное наблюдение данжа.');
    if (note.at > Date.now() + 300000) throw fail('Некорректное время наблюдения.');
    const cache = read(), notes = Object.fromEntries(Object.values(cache.dungeons || {}).map(Dungeon.cleanNote).filter(Boolean).map(n => [n.id, n]));
    if ((notes[note.id]?.at ?? 0) > note.at) return notes[note.id];
    notes[note.id] = note;
    const kept = Object.fromEntries(Object.values(notes).sort((a, b) => b.at - a.at).slice(0, 200).map(n => [n.id, n]));
    write({ ...cache, dungeons: kept }); return note;
  }
  return { read, state, replaceCityCache, saveSettings, savePreset, dungeonNotes, saveDungeonNote, hotkeys, saveHotkeys, lootKey: () => cachedLootKey(read()), dungeonKey: () => cachedDungeonKey(read()) };
}
module.exports = { createLootStore, validLootKey, cachedLootKey, cachedDungeonKey };
