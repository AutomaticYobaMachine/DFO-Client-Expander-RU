'use strict';
// Diagnostic-only, bounded NDJSON recorder. Never writes inventory contents or credentials.
// A failed disk write must not affect the game's dagger:// handler.
const fs = require('node:fs');
const path = require('node:path');
const MAX_BATCH = 64 * 1024, MAX_FILE = 4 * 1024 * 1024, MAX_EVENTS = 128;
const NAME = 'dfo-mod-inventory-trace.ndjson';
const eventName = /^[a-z][a-z0-9.-]{0,63}$/;
function createInventoryTraceStore(userData, io = fs) {
  const file = userData ? path.join(userData, NAME) : null;
  const previous = file && file.replace(/\.ndjson$/, '.previous.ndjson');
  function write(body) {
    if (!file) return 503;
    if (typeof body !== 'string' || Buffer.byteLength(body) > MAX_BATCH) return 413;
    let events;
    try { events = JSON.parse(body); } catch { return 400; }
    if (!Array.isArray(events) || !events.length || events.length > MAX_EVENTS) return 400;
    const lines = [];
    for (const event of events) {
      if (!event || typeof event !== 'object' || Array.isArray(event) ||
          !eventName.test(event.type) || !Number.isFinite(event.seq) ||
          !Number.isFinite(event.at) || typeof event.session !== 'string' ||
          !/^[a-zA-Z0-9_-]{1,64}$/.test(event.session)) return 400;
      // The client already supplies scalar diagnostics; enforce a hard bound
      // independently so unexpected objects can never fill the user's disk.
      if (!event.data || typeof event.data !== 'object' || Array.isArray(event.data)) return 400;
      const line = JSON.stringify({
        received: new Date().toISOString(), session: event.session,
        seq: event.seq, at: event.at, type: event.type, data: event.data,
      });
      if (Buffer.byteLength(line) > 4096) return 413;
      lines.push(line);
    }
    const batch = lines.join('\n') + '\n';
    try {
      const size = io.existsSync(file) ? io.statSync(file).size : 0;
      if (size + Buffer.byteLength(batch) > MAX_FILE) {
        if (io.existsSync(previous)) io.unlinkSync(previous);
        if (io.existsSync(file)) io.renameSync(file, previous);
      }
      io.appendFileSync(file, batch, 'utf8');
      return 204;
    } catch { return 503; }
  }
  return { file, previous, write };
}
module.exports = { createInventoryTraceStore, MAX_BATCH, MAX_FILE, MAX_EVENTS };
