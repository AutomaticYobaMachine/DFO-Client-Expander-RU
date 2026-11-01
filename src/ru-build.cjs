// DFO Mod - the Russian localization's payload, built from DFO_RU's own data folder (its tables kept as they are).
// What DFO_RU's BuildRuDict, BuildRuI18n and QuestPatcher.LoadQuestData did at install, done once here.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const QUEST_PREFIX = /^(.+)-[A-Za-z0-9_-]{8}\.js$/;

// A template whose only words are joints ("{a} and {b}", "{n} of {max}", "by {author}") matches the middle of any English
// sentence and leaves it half Russian ("the middle из the bestiary") - such keys are left out of the page's dictionary.
const JOINTS = new Set(['and', 'of', 'by', 'from', 'the', 'a', 'an', 'in', 'on', 'to', 'with', 'vs', 'or', 'for', 'at']);
function jointOnly(key) {
  if (!key.includes('{')) return false;
  const words = key.replace(/\{[^}]*\}/g, ' ').toLowerCase().match(/[a-z]+/g) ?? [];
  return words.length > 0 && words.every((w) => JOINTS.has(w));
}
/** ru_dict.js: the master dictionary as the page global the runtime reads (the joint-only templates left out). */
function buildDict(dataDir) {
  const dict = JSON.parse(fs.readFileSync(path.join(dataDir, 'ru_master.json'), 'utf8'));
  for (const k of Object.keys(dict)) if (jointOnly(k)) delete dict[k];
  return `window.__RU_DICT__ = ${JSON.stringify(dict)};\n`;
}

/** ru_i18n.js with its dynamic rules regenerated from dynamic_rx.json (the runtime ships an older copy of them). */
function buildI18n(dataDir) {
  let js = fs.readFileSync(path.join(dataDir, 'ru_i18n.js'), 'utf8');
  const rxFile = path.join(dataDir, 'dynamic_rx.json');
  if (!fs.existsSync(rxFile)) return js;
  const rules = JSON.parse(fs.readFileSync(rxFile, 'utf8'));
  const lines = ['// === AUTO_DYNAMIC_RX_START ===', 'window.__DYNAMIC_RX__ = ['];
  for (const r of rules) {
    if (typeof r?.regexStr !== 'string' || typeof r?.repStr !== 'string') continue;
    let groups;
    try { groups = new RegExp(`${r.regexStr}|`, 'i').exec('').length - 1; } catch { continue; }   // a rule the engine cannot compile would stop the whole runtime
    if (Math.max(0, ...[...r.repStr.matchAll(/\$(\d+)/g)].map((x) => +x[1])) > groups) continue;   // "$2" with one hole would print itself
    lines.push(`  { re: new RegExp(${JSON.stringify(r.regexStr)}, 'i'), rep: ${JSON.stringify(r.repStr)} },`);
  }
  // the interface's own templates, translated by hand (data/ru-fixes/ui) - read first, by ru_items.js's __dfoRuFirst
  const uiFile = path.join(dataDir, 'ui_templates.json');
  const ui = fs.existsSync(uiFile) ? JSON.parse(fs.readFileSync(uiFile, 'utf8')) : [];
  lines.push('];', `window.__DFO_UI_RX__ = ${JSON.stringify(ui.filter((r) => { try { new RegExp(r.re); return true; } catch { return false; } }))};`,
    '// === AUTO_DYNAMIC_RX_END ===');
  const block = lines.join('\n');
  const re = /\/\/ === AUTO_DYNAMIC_RX_START ===[\s\S]*?\/\/ === AUTO_DYNAMIC_RX_END ===/;
  return re.test(js) ? js.replace(re, () => block) : `${block}\n${js}`;
}

/** The quests, by their name (the source file's stem): { NAME: { name, messages: { 'QuestorOffer: [1000]': text } } }. */
function buildQuests(dataDir) {
  const out = {};
  const names = path.join(dataDir, 'quest_display_names_ru.json');
  if (fs.existsSync(names)) for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(names, 'utf8')))) (out[k.toUpperCase()] ??= {}).name = String(v);
  const dir = path.join(dataDir, 'quest_batches_ru');
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('_ru.json'))) {
      for (const [file, msgs] of Object.entries(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))) {
        const m = QUEST_PREFIX.exec(file);
        const key = (m ? m[1] : file.replace(/\.js$/, '')).toUpperCase();
        const q = (out[key] ??= {});
        q.messages = { ...(q.messages ?? {}) };
        for (const [h, text] of Object.entries(msgs ?? {})) q.messages[h.replace(/\s+/g, ' ').trim()] = String(text);
      }
    }
  }
  return out;
}

module.exports = { buildDict, buildI18n, buildQuests };
