'use strict';
// One file, separate namespaces. City-map replacement writes may never discard loot settings.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const Rules = require('./page/dfo_loot_rules.js');
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
  return { read, state, replaceCityCache, saveSettings, savePreset };
}
module.exports = { createLootStore };
