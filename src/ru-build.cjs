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
  // Hand-made additions over the machine dictionary: service windows, and the legendary powers' names, lines and imprints
  // (whole lines, so the runtime never words them piece by piece).
  for (const name of ['ui_service_windows.json', 'ui_item_powers.json']) {
    const file = path.join(dataDir, name);
    if (fs.existsSync(file)) Object.assign(dict, JSON.parse(fs.readFileSync(file, 'utf8')));
  }
  for (const k of Object.keys(dict)) if (jointOnly(k)) delete dict[k];
  return `window.__RU_DICT__ = ${JSON.stringify(dict)};\n`;
}

/**
 * Extracts a guaranteed lowercased ASCII literal substring from a JS RegExp source
 * string (compiled with `'i'`). Any string matching the regex is guaranteed to
 * contain this substring in `.toLowerCase()`. Returns '' if none can be proven.
 */
function extractRegexAnchor(src) {
  if (typeof src !== 'string' || !src) return '';
  let pos = 0;
  const n = src.length;
  const isAsciiLit = (c) => {
    const code = c.charCodeAt(0);
    return code >= 0x20 && code <= 0x7e;
  };
  function readQuantifier() {
    if (pos >= n) return { min: 1, max: 1 };
    const ch = src[pos];
    if (ch === '?') { pos++; if (pos < n && src[pos] === '?') pos++; return { min: 0, max: 1 }; }
    if (ch === '*') { pos++; if (pos < n && src[pos] === '?') pos++; return { min: 0, max: Infinity }; }
    if (ch === '+') { pos++; if (pos < n && src[pos] === '?') pos++; return { min: 1, max: Infinity }; }
    if (ch === '{') {
      const m = /^\{(\d+)(?:,(\d*))?\}\??/.exec(src.slice(pos));
      if (m) {
        pos += m[0].length;
        const min = parseInt(m[1], 10);
        const max = m[2] === undefined ? min : (m[2] === '' ? Infinity : parseInt(m[2], 10));
        return { min, max };
      }
    }
    return { min: 1, max: 1 };
  }
  function parseCharClass() {
    pos++;
    let neg = false;
    if (pos < n && src[pos] === '^') { neg = true; pos++; }
    const chars = [];
    let simple = !neg;
    while (pos < n && src[pos] !== ']') {
      if (src[pos] === '\\') {
        pos++;
        if (pos >= n) break;
        const c = src[pos++];
        if ('dDwWsSpPnrtfv0xu'.includes(c)) simple = false;
        else if (c === 'c') { simple = false; if (pos < n) pos++; }
        else chars.push(c);
      } else {
        const c = src[pos++];
        if (pos < n && src[pos] === '-' && pos + 1 < n && src[pos + 1] !== ']') {
          simple = false;
          pos++;
          if (src[pos] === '\\') { pos++; if (pos < n) pos++; }
          else pos++;
        } else {
          chars.push(c);
        }
      }
    }
    if (pos < n && src[pos] === ']') pos++;
    if (simple && chars.length > 0 && isAsciiLit(chars[0]) && chars.every((c) => c.toLowerCase() === chars[0].toLowerCase())) {
      const lc = chars[0].toLowerCase();
      return { literals: [lc], flat: lc };
    }
    return { literals: [], flat: null };
  }
  function parseGroup() {
    pos++;
    let lookaround = false;
    if (src[pos] === '?') {
      if (src.startsWith('?:', pos)) pos += 2;
      else if (src.startsWith('?=', pos) || src.startsWith('?!', pos)) { lookaround = true; pos += 2; }
      else if (src.startsWith('?<=', pos) || src.startsWith('?<!', pos)) { lookaround = true; pos += 3; }
      else if (src.startsWith('?<', pos)) {
        const end = src.indexOf('>', pos + 2);
        if (end !== -1) pos = end + 1;
      }
    }
    if (lookaround) {
      let depth = 1;
      while (pos < n && depth > 0) {
        if (src[pos] === '\\') { pos += 2; continue; }
        if (src[pos] === '[') { parseCharClass(); continue; }
        if (src[pos] === '(') depth++;
        else if (src[pos] === ')') depth--;
        pos++;
      }
      return { literals: [], flat: null };
    }
    const inner = parseAlt();
    if (pos < n && src[pos] === ')') pos++;
    return inner;
  }
  function parseSeq() {
    const items = [];
    while (pos < n && src[pos] !== '|' && src[pos] !== ')') {
      const ch = src[pos];
      let atom = { literals: [], flat: null };
      let zw = false;
      if (ch === '^' || ch === '$') {
        pos++;
        zw = true;
      } else if (ch === '.') {
        pos++;
      } else if (ch === '(') {
        atom = parseGroup();
      } else if (ch === '[') {
        atom = parseCharClass();
      } else if (ch === '\\') {
        pos++;
        if (pos < n) {
          const esc = src[pos++];
          if (esc === 'b' || esc === 'B') zw = true;
          else if ('dDwWsSpP0123456789'.includes(esc)) { }
          else if (esc === 'k') {
            if (src[pos] === '<') {
              const e = src.indexOf('>', pos);
              if (e !== -1) pos = e + 1;
            }
          } else if (esc === 'c') {
            if (pos < n) pos++;
          } else if ('nrtfv'.includes(esc)) { }
          else if (esc === 'x') {
            if (/^[0-9a-fA-F]{2}/.test(src.slice(pos))) {
              const c = String.fromCharCode(parseInt(src.slice(pos, pos + 2), 16)).toLowerCase();
              pos += 2;
              if (isAsciiLit(c)) atom = { literals: [c], flat: c };
            }
          } else if (esc === 'u') {
            if (/^[0-9a-fA-F]{4}/.test(src.slice(pos))) {
              const c = String.fromCharCode(parseInt(src.slice(pos, pos + 4), 16)).toLowerCase();
              pos += 4;
              if (isAsciiLit(c)) atom = { literals: [c], flat: c };
            }
          } else {
            const c = esc.toLowerCase();
            if (isAsciiLit(c)) atom = { literals: [c], flat: c };
          }
        }
      } else if ('*+?{'.includes(ch)) {
        pos++;
      } else {
        pos++;
        const c = ch.toLowerCase();
        if (isAsciiLit(c)) atom = { literals: [c], flat: c };
      }
      const q = readQuantifier();
      if (zw) continue;
      if (q.min === 0) items.push({ literals: [], flat: null });
      else if (q.min === 1 && q.max === 1) items.push(atom);
      else items.push({ literals: atom.literals, flat: null });
    }
    const out = [];
    let cur = '';
    for (const it of items) {
      if (it.flat !== null) {
        cur += it.flat;
      } else {
        if (cur) { out.push(cur); cur = ''; }
        for (const l of it.literals) out.push(l);
      }
    }
    if (cur) out.push(cur);
    return { literals: out, flat: items.every((it) => it.flat !== null) ? out.join('') : null };
  }
  function parseAlt() {
    const branches = [parseSeq()];
    while (pos < n && src[pos] === '|') {
      pos++;
      branches.push(parseSeq());
    }
    if (branches.length === 1) return branches[0];
    const b0 = branches[0].literals;
    if (!b0.length) return { literals: [], flat: null };
    let best = '';
    for (const s0 of b0) {
      for (let len = s0.length; len >= 1; len--) {
        if (len <= best.length) break;
        for (let i = 0; i <= s0.length - len; i++) {
          const sub = s0.slice(i, i + len);
          if (/\S/.test(sub) && branches.every((br) => br.literals.some((l) => l.includes(sub)))) {
            best = sub;
            break;
          }
        }
        if (best.length >= len) break;
      }
    }
    return { literals: best ? [best] : [], flat: null };
  }
  const res = parseAlt();
  let best = '';
  for (const l of res.literals) {
    if (l.length > best.length && /\S/.test(l)) best = l;
  }
  return best;
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
    const anchor = extractRegexAnchor(r.regexStr);
    lines.push(`  { re: new RegExp(${JSON.stringify(r.regexStr)}, 'i'), rep: ${JSON.stringify(r.repStr)}, anchor: ${JSON.stringify(anchor)} },`);
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
