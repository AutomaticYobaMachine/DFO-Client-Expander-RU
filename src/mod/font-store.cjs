'use strict';
// Modular Font System - single source of truth for the 8 semantic font categories,
// built-in community base faces (replacing all vanilla game fonts unconditionally),
// and per-user overrides stored in <userData>/dfo-mod-fonts/.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SCHEMA = 1;
const MAX_FONT_BYTES = 32 * 1024 * 1024;

// Ordered list of all 8 semantic font categories used across the game and mod.
// Each slot owns an independent CSS @font-face family (1:1 with our 8 community base fonts),
// so changing one category (e.g. `description` for prose/chat/dialogues/journal/item descriptions)
// never mutates another (e.g. `sigil`).
const SLOTS = Object.freeze([
  Object.freeze({ id: 'body',        family: 'Gabin',     baseFile: 'item-font-text.ttf',        baseLabel: 'DFO Gabin',     format: 'truetype' }),
  Object.freeze({ id: 'title',       family: 'Greengoth', baseFile: 'item-font-title.ttf',       baseLabel: 'DFO Greengoth', format: 'truetype' }),
  Object.freeze({ id: 'description', family: 'Flow',      baseFile: 'item-font-description.otf', baseLabel: 'DFO Flow',      format: 'opentype' }),
  Object.freeze({ id: 'number',      family: 'Flexi',     baseFile: 'item-font-numbers.ttf',     baseLabel: 'DFO Flexi',     format: 'truetype' }),
  Object.freeze({ id: 'book',        family: 'Hangyaku',  baseFile: 'book-font-text.ttf',        baseLabel: 'DFO Hangyaku',  format: 'truetype' }),
  Object.freeze({ id: 'power',       family: 'Wolga',     baseFile: 'item-font-legendary.otf',   baseLabel: 'DFO Wolga',     format: 'opentype' }),
  Object.freeze({ id: 'sigil',       family: 'Ckazka',    baseFile: 'item-font-sigil.ttf',       baseLabel: 'DFO Ckazka',    format: 'truetype' }),
  Object.freeze({ id: 'set',         family: 'Ritalin',   baseFile: 'item-font-set.ttf',         baseLabel: 'DFO Ritalin',   format: 'truetype' }),
]);

const SLOT_BY_ID = Object.freeze(Object.fromEntries(SLOTS.map(s => [s.id, s])));
const PHYSICAL_FILES = Object.freeze([...new Set(SLOTS.map(s => s.baseFile))]);

const FORMAT_BY_EXT = Object.freeze({
  '.ttf': 'truetype',
  '.otf': 'opentype',
  '.woff2': 'woff2',
  '.woff': 'woff',
});

const MIME_BY_EXT = Object.freeze({
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
});

function formatOf(filename) {
  const ext = path.extname(String(filename || '')).toLowerCase();
  return FORMAT_BY_EXT[ext] || null;
}

function mimeOf(filename) {
  const ext = path.extname(String(filename || '')).toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

function safeFileName(name) {
  const raw = String(name || '');
  if (!raw || raw.includes('/') || raw.includes('\\') || raw.includes('..') || raw.includes('\0')) return null;
  if (!/^[\w .-]+\.(?:ttf|otf|woff2?)$/i.test(raw)) return null;
  return raw;
}

function sanitizeBaseName(original) {
  const ext = path.extname(String(original || '')).toLowerCase();
  const base = path.basename(String(original || ''), path.extname(String(original || '')))
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 64) || 'custom-font';
  return base + (FORMAT_BY_EXT[ext] ? ext : '.ttf');
}

// Validate and detect container format from magic bytes (rejects .ttc collections unsupported by Chromium @font-face).
function detectFontMagic(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return null;
  const tag = buf.subarray(0, 4);
  const ascii = tag.toString('ascii');
  if (tag[0] === 0x00 && tag[1] === 0x01 && tag[2] === 0x00 && tag[3] === 0x00) {
    return { ext: '.ttf', format: 'truetype', mime: 'font/ttf' };
  }
  if (ascii === 'true' || ascii === 'typ1') return { ext: '.ttf', format: 'truetype', mime: 'font/ttf' };
  if (ascii === 'OTTO') return { ext: '.otf', format: 'opentype', mime: 'font/otf' };
  if (ascii === 'wOFF') return { ext: '.woff', format: 'woff', mime: 'font/woff' };
  if (ascii === 'wOF2') return { ext: '.woff2', format: 'woff2', mime: 'font/woff2' };
  return null;
}

function hasValidFontMagic(buf) {
  return detectFontMagic(buf) !== null;
}

function validFontBytes(buf, extHint = '') {
  if (!Buffer.isBuffer(buf) || buf.length < 12 || buf.length > MAX_FONT_BYTES) return false;
  if (extHint && !FORMAT_BY_EXT[String(extHint).toLowerCase()]) return false;
  return detectFontMagic(buf) !== null;
}

function detectFileMagic(fullPath) {
  let fd;
  try {
    fd = fs.openSync(fullPath, 'r');
    const hdr = Buffer.alloc(4);
    const n = fs.readSync(fd, hdr, 0, 4, 0);
    return n === 4 ? detectFontMagic(hdr) : null;
  } catch { return null; }
  finally { if (fd !== undefined) { try { fs.closeSync(fd); } catch {} } }
}

function defaultPreset() {
  const slots = {};
  for (const s of SLOTS) {
    slots[s.id] = { mode: 'base' };
  }
  return { schema: SCHEMA, activePreset: 'default', slots };
}

function atomicWrite(target, data) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, target);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch {}
    throw err;
  }
}

function createFontStore(userData, { version = null } = {}) {
  const dir = userData ? path.join(userData, 'dfo-mod-fonts') : null;
  const filesDir = dir ? path.join(dir, 'files') : null;
  const presetPath = dir ? path.join(dir, 'preset.json') : null;
  const MAX_BUFFER_CACHE_BYTES = 64 * 1024 * 1024;
  // Stat-validated in-memory caches: zero staleness on external edits (EXE or manual),
  // while avoiding dozens of redundant sync syscalls and multi-MB reads per worker/request.
  const fileInfoCache = new Map(); // safeName -> { stamp, info }
  const bufferCache = new Map();   // safeName -> { stamp, buf, mime }
  let bufferCacheBytes = 0;
  let stateCache = null;           // { presetStamp, fileStamps, state, clientCfg, bundleJs }

  function invalidateCaches() {
    fileInfoCache.clear();
    bufferCache.clear();
    bufferCacheBytes = 0;
    stateCache = null;
  }

  function statStamp(st) {
    return `${st.size}:${st.mtimeMs}:${st.ctimeMs}`;
  }

  function evictBufferIfNeeded(incomingSize) {
    while (bufferCache.size && bufferCacheBytes + incomingSize > MAX_BUFFER_CACHE_BYTES) {
      const oldestKey = bufferCache.keys().next().value;
      const oldest = bufferCache.get(oldestKey);
      bufferCache.delete(oldestKey);
      if (oldest) bufferCacheBytes -= oldest.buf.length;
    }
  }

  function resolveFile(name) {
    if (!filesDir) return null;
    const safe = safeFileName(name);
    if (!safe) return null;
    const full = path.join(filesDir, safe);
    const resolvedDir = path.resolve(filesDir) + path.sep;
    const resolvedFull = path.resolve(full);
    if (!resolvedFull.startsWith(resolvedDir)) return null;
    try {
      const st = fs.statSync(resolvedFull);
      if (!st.isFile() || st.size < 12 || st.size > MAX_FONT_BYTES) {
        fileInfoCache.delete(safe);
        return null;
      }
      const stamp = statStamp(st);
      const cached = fileInfoCache.get(safe);
      if (cached && cached.stamp === stamp) return cached.info;
      const magic = detectFileMagic(resolvedFull);
      if (!magic) {
        fileInfoCache.set(safe, { stamp, info: null });
        return null;
      }
      const info = { path: resolvedFull, name: safe, mime: magic.mime, format: magic.format, mtimeMs: st.mtimeMs, size: st.size, stamp };
      fileInfoCache.set(safe, { stamp, info });
      return info;
    } catch {
      fileInfoCache.delete(safe);
      return null;
    }
  }

  function readFileBuffer(name) {
    const resolved = resolveFile(name);
    if (!resolved) return null;
    const cached = bufferCache.get(resolved.name);
    if (cached && cached.stamp === resolved.stamp) {
      // Refresh LRU position
      bufferCache.delete(resolved.name);
      bufferCache.set(resolved.name, cached);
      return { buf: cached.buf, mime: cached.mime, name: resolved.name, stamp: resolved.stamp };
    }
    try {
      const buf = fs.readFileSync(resolved.path);
      if (!validFontBytes(buf, path.extname(resolved.name))) return null;
      if (buf.length <= MAX_BUFFER_CACHE_BYTES) {
        if (cached) {
          bufferCache.delete(resolved.name);
          bufferCacheBytes -= cached.buf.length;
        }
        evictBufferIfNeeded(buf.length);
        bufferCache.set(resolved.name, { stamp: resolved.stamp, buf, mime: resolved.mime });
        bufferCacheBytes += buf.length;
      }
      return { buf, mime: resolved.mime, name: resolved.name, stamp: resolved.stamp };
    } catch {
      return null;
    }
  }

  function normalizeWithInfo(raw) {
    const out = defaultPreset();
    const resolvedBySlot = new Map();
    const resolvedByFile = new Map();
    const getResolved = (file) => {
      if (resolvedByFile.has(file)) return resolvedByFile.get(file);
      const r = resolveFile(file);
      resolvedByFile.set(file, r);
      return r;
    };
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      if (typeof raw.activePreset === 'string' && raw.activePreset.trim()) {
        out.activePreset = raw.activePreset.trim().slice(0, 64);
      }
      const inSlots = raw.slots && typeof raw.slots === 'object' && !Array.isArray(raw.slots) ? raw.slots : {};
      for (const s of SLOTS) {
        let entry = inSlots[s.id];
        // Legacy preset migration: carry over former `narrative` override into merged `description` slot.
        if (s.id === 'description' && (!entry || typeof entry !== 'object' || entry.mode !== 'custom') && inSlots.narrative?.mode === 'custom') {
          entry = inSlots.narrative;
        }
        if (!entry || typeof entry !== 'object' || entry.mode !== 'custom') {
          out.slots[s.id] = { mode: 'base' };
          continue;
        }
        const resolved = getResolved(entry.file);
        if (!resolved || !resolved.format) {
          out.slots[s.id] = { mode: 'base' };
          continue;
        }
        resolvedBySlot.set(s.id, resolved);
        out.slots[s.id] = {
          mode: 'custom',
          file: resolved.name,
          label: typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim().slice(0, 128) : resolved.name,
          format: resolved.format,
          ...(typeof entry.sha256 === 'string' && /^[0-9a-f]{64}$/i.test(entry.sha256) ? { sha256: entry.sha256.toLowerCase() } : {}),
        };
      }
    }
    return { preset: out, resolvedBySlot, resolvedByFile };
  }

  function computeRevision(preset, resolvedBySlot) {
    const hash = crypto.createHash('sha256');
    hash.update(String(SCHEMA));
    for (const s of SLOTS) {
      const e = preset.slots[s.id];
      if (e?.mode === 'custom') {
        const info = resolvedBySlot?.get(s.id) ?? resolveFile(e.file);
        hash.update(`|${s.id}:custom:${e.file}:${info?.size ?? 0}:${Math.floor(info?.mtimeMs ?? 0)}`);
      } else {
        hash.update(`|${s.id}:base:${s.baseFile}`);
      }
    }
    return hash.digest('hex').slice(0, 12);
  }

  function snapshot() {
    let presetStamp = 'none';
    if (presetPath) {
      try {
        const st = fs.statSync(presetPath);
        if (st.isFile()) presetStamp = statStamp(st);
      } catch { presetStamp = 'none'; }
    }
    if (stateCache && stateCache.presetStamp === presetStamp) {
      let valid = true;
      for (const [fname, expectedStamp] of stateCache.fileStamps) {
        if (expectedStamp === 'missing') {
          try {
            const st = fs.statSync(path.join(filesDir, fname));
            if (st.isFile() && st.size >= 12) { valid = false; break; }
          } catch {}
          continue;
        }
        try {
          const st = fs.statSync(path.join(filesDir, fname));
          if (!st.isFile() || statStamp(st) !== expectedStamp) { valid = false; break; }
        } catch { valid = false; break; }
      }
      if (valid) return stateCache;
    }
    let raw = null;
    if (presetPath && presetStamp !== 'none') {
      try { raw = JSON.parse(fs.readFileSync(presetPath, 'utf8')); } catch { raw = null; }
    }
    const { preset, resolvedBySlot, resolvedByFile } = normalizeWithInfo(raw);
    const customCount = SLOTS.reduce((n, s) => n + (preset.slots[s.id].mode === 'custom' ? 1 : 0), 0);
    const revision = computeRevision(preset, resolvedBySlot);
    const state = { ...preset, customCount, revision };
    const clientSlots = {};
    for (const s of SLOTS) {
      const entry = state.slots[s.id];
      clientSlots[s.id] = entry?.mode === 'custom'
        ? { mode: 'custom', file: entry.file, label: entry.label, format: entry.format }
        : { mode: 'base', file: s.baseFile, label: s.baseLabel, format: s.format };
    }
    const clientCfg = { schema: SCHEMA, ...(version ? { version } : {}), activePreset: state.activePreset, customCount: state.customCount, revision: state.revision, slots: clientSlots };
    const bundleJs = `globalThis.__dfoFontPreset=${JSON.stringify(clientCfg)};\n`;
    const fileStamps = [];
    for (const [fname, info] of resolvedByFile) {
      if (info) fileStamps.push([fname, info.stamp]);
      else {
        const safe = safeFileName(fname);
        if (safe) fileStamps.push([safe, 'missing']);
      }
    }
    stateCache = { presetStamp, fileStamps, state, clientCfg, bundleJs, resolvedBySlot };
    return stateCache;
  }

  function read() {
    const s = snapshot().state;
    const slots = {};
    for (const def of SLOTS) slots[def.id] = { ...s.slots[def.id] };
    return { ...s, slots };
  }

  function revision() {
    return snapshot().state.revision;
  }

  function pruneOrphans(preset) {
    if (!filesDir || !fs.existsSync(filesDir)) return;
    const used = new Set();
    for (const s of SLOTS) {
      const e = preset.slots[s.id];
      if (e?.mode === 'custom' && e.file) used.add(e.file);
    }
    try {
      for (const name of fs.readdirSync(filesDir)) {
        if (!used.has(name)) {
          try { fs.unlinkSync(path.join(filesDir, name)); } catch {}
        }
      }
    } catch {}
  }

  function save(next) {
    if (!presetPath) throw new Error('Font store has no userData directory');
    invalidateCaches();
    const { preset: clean } = normalizeWithInfo(next);
    clean.activePreset = SLOTS.some(s => clean.slots[s.id].mode === 'custom') ? 'custom' : 'default';
    atomicWrite(presetPath, `${JSON.stringify(clean, null, 2)}\n`);
    pruneOrphans(clean);
    invalidateCaches();
    return read();
  }

  function ensureDefault() {
    if (!presetPath) return read();
    if (!fs.existsSync(presetPath)) {
      fs.mkdirSync(filesDir, { recursive: true });
      atomicWrite(presetPath, `${JSON.stringify(defaultPreset(), null, 2)}\n`);
      invalidateCaches();
    }
    return read();
  }

  function importFile(srcPath) {
    if (!filesDir) throw new Error('Font store has no userData directory');
    const ext = path.extname(String(srcPath || '')).toLowerCase();
    if (!FORMAT_BY_EXT[ext]) throw new Error('Unsupported font extension');
    const buf = fs.readFileSync(srcPath);
    if (!validFontBytes(buf, ext)) throw new Error('Invalid font file');
    const magic = detectFontMagic(buf);
    const format = magic.format;
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    // Match stored extension to true magic container so Chromium never rejects misnamed .woff2/.woff/.ttf files.
    let baseSanitized = sanitizeBaseName(path.basename(srcPath));
    const curExt = path.extname(baseSanitized).toLowerCase();
    if (curExt !== magic.ext) {
      baseSanitized = baseSanitized.slice(0, -curExt.length) + magic.ext;
    }
    const storedName = `${sha256.slice(0, 8)}-${baseSanitized}`;
    fs.mkdirSync(filesDir, { recursive: true });
    const dest = path.join(filesDir, storedName);
    let alreadyGood = false;
    try {
      const st = fs.statSync(dest);
      alreadyGood = st.isFile() && st.size === buf.length && fs.readFileSync(dest).equals(buf);
    } catch { alreadyGood = false; }
    if (!alreadyGood) {
      atomicWrite(dest, buf);
      invalidateCaches();
    }
    return { file: storedName, label: path.basename(srcPath), format, sha256 };
  }

  function setSlot(slotId, srcPath) {
    if (!SLOT_BY_ID[slotId]) throw new Error(`Unknown font slot: ${slotId}`);
    const imported = importFile(srcPath);
    const cur = read();
    cur.slots[slotId] = { mode: 'custom', ...imported };
    return save(cur);
  }

  function setAllSlots(srcPath) {
    const imported = importFile(srcPath);
    const cur = read();
    for (const s of SLOTS) cur.slots[s.id] = { mode: 'custom', ...imported };
    return save(cur);
  }

  function resetSlot(slotId) {
    if (!SLOT_BY_ID[slotId]) throw new Error(`Unknown font slot: ${slotId}`);
    const cur = read();
    cur.slots[slotId] = { mode: 'base' };
    return save(cur);
  }

  function resetAll() {
    return save(defaultPreset());
  }

  function slotFile(slotId) {
    const meta = SLOT_BY_ID[slotId] || SLOT_BY_ID.body;
    const snap = snapshot();
    const resolved = snap.resolvedBySlot.get(meta.id);
    if (resolved) {
      return { custom: true, path: resolved.path, name: resolved.name, mime: resolved.mime, format: resolved.format };
    }
    return { custom: false, file: meta.baseFile, mime: mimeOf(meta.baseFile), format: meta.format };
  }

  function clientConfig() {
    return snapshot().clientCfg;
  }

  function bundle() {
    return snapshot().bundleJs;
  }

  return Object.freeze({
    dir, filesDir, presetPath,
    read, save, ensureDefault, resolveFile, readFileBuffer, slotFile, revision,
    setSlot, setAllSlots, resetSlot, resetAll,
    clientConfig, bundle,
  });
}

module.exports = {
  SCHEMA, SLOTS, SLOT_BY_ID, PHYSICAL_FILES, FORMAT_BY_EXT, MIME_BY_EXT,
  formatOf, mimeOf, safeFileName, sanitizeBaseName, validFontBytes, defaultPreset, createFontStore,
};
