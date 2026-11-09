'use strict';
// Isolated diagnostic store: creates a startup marker even when the browser cannot send a single event.
// Fixed, predictable Windows location: %APPDATA%/DFO-Client-Expander-RU/
// Does not use network, player inventory data, or the game's userData naming convention.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const MAX_BATCH = 64 * 1024, MAX_FILE = 4 * 1024 * 1024, MAX_EVENTS = 128;
const NAME = 'dfo-mod-inventory-trace.ndjson';
const eventName = /^[a-z][a-z0-9.-]{0,63}$/;
function traceDirectory(userData, env = process.env) {
  const base = env.APPDATA || userData || path.join(os.homedir(), '.config');
  return path.join(base, 'DFO-Client-Expander-RU');
}
function createInventoryTraceStore(userData, io = fs, env = process.env) {
  const dir = traceDirectory(userData, env);
  const file = path.join(dir, NAME), previous = path.join(dir, 'dfo-mod-inventory-trace.previous.ndjson');
  let lastWriteStatus = null, recorded = 0;
  function append(events) {
    const lines = [];
    for (const event of events) {
      if (!event || typeof event !== 'object' || Array.isArray(event) ||
          !eventName.test(event.type) || !Number.isFinite(event.seq) ||
          !Number.isFinite(event.at) || typeof event.session !== 'string' ||
          !/^[a-zA-Z0-9_-]{1,64}$/.test(event.session) ||
          !event.data || typeof event.data !== 'object' || Array.isArray(event.data)) return 400;
      const line = JSON.stringify({ received: new Date().toISOString(), session: event.session,
        seq: event.seq, at: event.at, type: event.type, data: event.data });
      if (Buffer.byteLength(line) > 4096) return 413;
      lines.push(line);
    }
    const batch = lines.join('\n') + '\n';
    try {
      io.mkdirSync(dir, { recursive: true });
      const size = io.existsSync(file) ? io.statSync(file).size : 0;
      if (size + Buffer.byteLength(batch) > MAX_FILE) {
        if (io.existsSync(previous)) io.unlinkSync(previous);
        if (io.existsSync(file)) io.renameSync(file, previous);
      }
      io.appendFileSync(file, batch, 'utf8');
      recorded += events.length;
      lastWriteStatus = 204;
      return 204;
    } catch (e) {
      lastWriteStatus = 503;
      return 503;
    }
  }
  function write(body) {
    if (typeof body !== 'string' || Buffer.byteLength(body) > MAX_BATCH) return 413;
    let events;
    try { events = JSON.parse(body); } catch { return 400; }
    if (!Array.isArray(events) || !events.length || events.length > MAX_EVENTS) return 400;
    return append(events);
  }
  function serverEvent(type, data = {}) {
    return append([{ type, at: Date.now(), seq: recorded + 1, session: 'main',
      data: Object.fromEntries(Object.entries(data).filter(([key, v]) =>
        /^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(key) &&
        (typeof v === 'string' && v.length <= 200 || typeof v === 'number' || typeof v === 'boolean' || v === null))) }]);
  }
  function status() {
    let exists = false, bytes = 0;
    try { exists = io.existsSync(file); if (exists) bytes = io.statSync(file).size; } catch {}
    return { exists, bytes, recorded, lastWriteStatus, path: file };
  }
  return { dir, file, previous, write, serverEvent, status };
}
module.exports = { createInventoryTraceStore, traceDirectory, MAX_BATCH, MAX_FILE, MAX_EVENTS };
