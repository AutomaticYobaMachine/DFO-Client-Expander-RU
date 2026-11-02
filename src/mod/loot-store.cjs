'use strict';
// One file, separate namespaces. City-map replacement writes preserve loot settings and dungeon notes.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const Rules = require('./page/dfo_loot_rules.js');
const Dungeon = require('./page/dfo_dungeon_model.js');
const MAX = 16 * 1024 * 1024;
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
    write(merged);
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
  return { read, state, replaceCityCache, saveSettings, savePreset, dungeonNotes, saveDungeonNote };
}
module.exports = { createLootStore };
