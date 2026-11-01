// DFO Mod - an Electron ASAR archive, read and written again with some files replaced or added (what DFO_RU's
// AsarArchive.Repack did). The format: an 8-byte size pickle, the JSON header in a pickle, then every packed file's
// bytes at `base + offset`. A file kept is copied byte for byte; `unpacked` entries and links are left as they are.
'use strict';
const crypto = require('node:crypto');
const path = require('node:path');
// Run inside Electron (ELECTRON_RUN_AS_NODE) the plain fs would open app.asar as a folder - original-fs is the file.
const fs = (() => { try { return require('original-fs'); } catch { return require('node:fs'); } })();

const BLOCK = 4 * 1024 * 1024;

function openAsar(file) {
  const fd = fs.openSync(file, 'r');
  const head = Buffer.alloc(8);
  fs.readSync(fd, head, 0, 8, 0);
  const size = head.readUInt32LE(4);
  const hbuf = Buffer.alloc(size);
  fs.readSync(fd, hbuf, 0, size, 8);
  const len = hbuf.readUInt32LE(4);
  const header = JSON.parse(hbuf.toString('utf8', 8, 8 + len));
  return { file, fd, base: 8 + size, header, close: () => fs.closeSync(fd) };
}

/** Every packed file: path -> entry (its header node). */
function listFiles(header) {
  const out = new Map();
  const walk = (node, pre) => {
    for (const [name, e] of Object.entries(node.files ?? {})) {
      const p = pre ? `${pre}/${name}` : name;
      if (e.files) walk(e, p); else out.set(p, e);
    }
  };
  walk(header, '');
  return out;
}

function readFile(a, rel) {
  const e = listFiles(a.header).get(rel.replace(/\\/g, '/'));
  if (!e || e.unpacked || e.link || e.offset == null) return null;
  const buf = Buffer.alloc(e.size);
  if (e.size) fs.readSync(a.fd, buf, 0, e.size, a.base + Number(e.offset));
  return buf;
}

function integrityOf(buf) {
  const blocks = [];
  for (let i = 0; i < buf.length; i += BLOCK) blocks.push(crypto.createHash('sha256').update(buf.subarray(i, i + BLOCK)).digest('hex'));
  if (!blocks.length) blocks.push(crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex'));
  return { algorithm: 'SHA256', hash: crypto.createHash('sha256').update(buf).digest('hex'), blockSize: BLOCK, blocks };
}

/** The header node at `rel`'s folder, made where missing. */
function nodeAt(header, rel, make) {
  const parts = rel.split('/');
  let node = header;
  for (const p of parts.slice(0, -1)) {
    node.files ??= {};
    if (!node.files[p]) { if (!make) return null; node.files[p] = { files: {} }; }
    node = node.files[p];
    if (!node.files) return null;
  }
  return { dir: node, name: parts[parts.length - 1] };
}

/**
 * Write `out`: archive `a` with `put` (Map rel -> Buffer, replaced or added) and `drop` (Set of rel, removed).
 * `progress(done, total)` is told as it goes.
 */
function writeAsar(a, out, { put = new Map(), drop = new Set() } = {}, progress = () => {}) {
  const header = JSON.parse(JSON.stringify(a.header));
  const old = listFiles(a.header);
  for (const rel of drop) { const at = nodeAt(header, rel, false); if (at) delete at.dir.files[at.name]; }
  for (const [rel, buf] of put) {
    const at = nodeAt(header, rel, true);
    at.dir.files ??= {};
    at.dir.files[at.name] = { size: buf.length, offset: '0', integrity: integrityOf(buf) };
  }
  // the packed files in their old order (their bytes stay together as they were), the new ones after them
  const items = [];
  for (const [rel, e] of listFiles(header)) {
    if (e.unpacked || e.link) continue;
    const src = put.has(rel) ? { buf: put.get(rel) } : { from: Number(old.get(rel)?.offset ?? -1), size: e.size };
    items.push({ rel, e, src, order: put.has(rel) ? Infinity : src.from });
  }
  items.sort((x, y) => x.order - y.order);
  let off = 0;
  for (const it of items) { it.e.offset = String(off); off += it.src.buf ? it.src.buf.length : it.src.size; }
  const json = Buffer.from(JSON.stringify(header), 'utf8');
  const pad = (4 - (json.length % 4)) % 4;
  const hbuf = Buffer.alloc(8 + json.length + pad);
  hbuf.writeUInt32LE(4 + json.length + pad, 0);
  hbuf.writeUInt32LE(json.length, 4);
  json.copy(hbuf, 8);
  const size = Buffer.alloc(8);
  size.writeUInt32LE(4, 0);
  size.writeUInt32LE(hbuf.length, 4);
  const fd = fs.openSync(out, 'w');
  try {
    fs.writeSync(fd, size); fs.writeSync(fd, hbuf);
    const chunk = Buffer.alloc(1024 * 1024);
    let done = 0;
    for (const it of items) {
      if (it.src.buf) fs.writeSync(fd, it.src.buf);
      else {
        if (it.src.from < 0) throw new Error(`asar: no bytes for ${it.rel}`);
        for (let p = 0; p < it.src.size; p += chunk.length) {
          const n = Math.min(chunk.length, it.src.size - p);
          fs.readSync(a.fd, chunk, 0, n, a.base + it.src.from + p);
          fs.writeSync(fd, chunk, 0, n);
        }
      }
      if (++done % 500 === 0) progress(done, items.length);
    }
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  progress(items.length, items.length);
}

/** Build a new archive from a folder (the tests' fake game, and nothing else). */
function packFolder(dir, out) {
  const put = new Map();
  const walk = (abs, pre) => {
    for (const name of fs.readdirSync(abs).sort()) {
      const p = path.join(abs, name), rel = pre ? `${pre}/${name}` : name;
      if (fs.statSync(p).isDirectory()) walk(p, rel); else put.set(rel, fs.readFileSync(p));
    }
  };
  walk(dir, '');
  const tmp = `${out}.tmp-src`;   // an empty archive to write from
  const json = Buffer.from('{"files":{}}');
  const h = Buffer.alloc(8 + json.length); h.writeUInt32LE(4 + json.length, 0); h.writeUInt32LE(json.length, 4); json.copy(h, 8);
  const s = Buffer.alloc(8); s.writeUInt32LE(4, 0); s.writeUInt32LE(h.length, 4);
  fs.writeFileSync(tmp, Buffer.concat([s, h]));
  const a = openAsar(tmp);
  try { writeAsar(a, out, { put }); } finally { a.close(); fs.unlinkSync(tmp); }
}

module.exports = { openAsar, listFiles, readFile, writeAsar, packFolder, integrityOf };
