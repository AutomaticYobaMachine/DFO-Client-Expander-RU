'use strict';
// Observes Chromium/Electron frame *presentation callbacks*. This is NOT a monitor
// of the final Windows desktop scanout. Neither this code nor its callback
// requests a repaint, opens DevTools, or changes the inventory implementation.
const crypto = require('node:crypto');
function createPresentationMonitor(trace, options = {}) {
  const now = options.now || Date.now;
  const makeInterval = options.setInterval || setInterval;
  const cancelInterval = options.clearInterval || clearInterval;
  const watched = new Map();
  let until = 0, interval = null;

  const log = (type, data) => { try { trace.serverEvent(type, data); } catch {} };
  function gameContents(contents) {
    try { return /^dagger:\/\/game(?:\/|$)/.test(contents.getURL()); }
    catch { return false; }
  }
  function stop(state, reason) {
    if (!state.subscribed) return;
    state.subscribed = false;
    try { state.contents.endFrameSubscription(); } catch {}
    log('frame.present.stop', { webContentsId: state.id, reason, frames: state.frames });
  }
  function start(state) {
    if (state.subscribed || !gameContents(state.contents)) return;
    const contents = state.contents;
    if (typeof contents.beginFrameSubscription !== 'function') {
      if (!state.unavailable) {
        state.unavailable = true;
        log('frame.present.unavailable', { webContentsId: state.id });
      }
      return;
    }
    state.lastFrameAt = 0;
    state.lastSampleAt = 0;
    state.frames = 0;
    state.intervalFrames = 0;
    state.area = 0;
    state.maxGap = 0;
    state.sampleCount = 0;
    state.digest = '';
    state.bitmapBytes = 0;
    try {
      // onlyDirty=true: receive the actual repainted area instead of copying
      // an entire full-resolution frame on every presentation callback.
      contents.beginFrameSubscription(true, (image, dirty) => {
        try {
          if (!state.subscribed) return;
          const stamp = now();
          if (state.lastFrameAt) state.maxGap = Math.max(state.maxGap, stamp - state.lastFrameAt);
          state.lastFrameAt = stamp;
          state.frames++;
          state.intervalFrames++;
          const w = Number(dirty?.width), h = Number(dirty?.height);
          if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
            state.area += Math.min(1e9, w * h);
          }
          // A bounded-rate hash proves bytes arrived in the captured dirty
          // region. Never store the screenshot or inventory item content.
          if (stamp - state.lastSampleAt >= 2000 && image?.toBitmap) {
            state.lastSampleAt = stamp;
            const pixels = image.toBitmap();
            if (Buffer.isBuffer(pixels) && pixels.length) {
              state.sampleCount++;
              state.bitmapBytes = pixels.length;
              state.digest = crypto.createHash('sha256').update(pixels).digest('hex').slice(0, 16);
            }
          }
        } catch (err) {
          if (!state.sampleError) {
            state.sampleError = true;
            log('frame.present.sample.error', { webContentsId: state.id,
              message: String(err?.message ?? err).slice(0, 120) });
          }
        }
      });
      state.subscribed = true;
      log('frame.present.start', { webContentsId: state.id, onlyDirty: true });
    } catch (error) {
      state.subscribed = false;
      log('frame.present.unavailable', { webContentsId: state.id,
        message: String(error?.message ?? error).slice(0, 120) });
    }
  }
  function visibility(contents) {
    try {
      const win = contents.getOwnerBrowserWindow?.();
      return { windowVisible: win?.isVisible?.() ?? null,
        windowMinimized: win?.isMinimized?.() ?? null };
    } catch { return { windowVisible: null, windowMinimized: null }; }
  }
  function pulse() {
    const stamp = now();
    for (const state of watched.values()) {
      if (stamp < until) start(state);
      if (!state.subscribed) continue;
      const age = state.lastFrameAt ? Math.max(0, stamp - state.lastFrameAt) : -1;
      log('frame.present.summary', {
        webContentsId: state.id,
        frames: state.frames,
        newFrames: state.intervalFrames,
        lastFrameAgeMs: age,
        maxGapMs: state.maxGap,
        dirtyPixelArea: state.area,
        sampledFrames: state.sampleCount,
        lastSampleHash: state.digest,
        lastSampleBytes: state.bitmapBytes,
        ...visibility(state.contents),
      });
      state.intervalFrames = 0;
      state.area = 0;
      state.maxGap = 0;
      if (stamp >= until) stop(state, 'watch-expired');
    }
    if (stamp >= until && interval) { cancelInterval(interval); interval = null; }
  }
  function activate() {
    for (const state of watched.values()) start(state);
    if (until > now() && !interval) {
      interval = makeInterval(pulse, 2000);
      interval.unref?.();
    }
  }
  function track(contents) {
    if (!contents || watched.has(contents)) return;
    const state = { contents, id: Number.isInteger(contents.id) ? contents.id : -1,
      subscribed: false, frames: 0, intervalFrames: 0, area: 0, maxGap: 0,
      lastFrameAt: 0, lastSampleAt: 0, sampleCount: 0, digest: '', bitmapBytes: 0,
      sampleError: false, unavailable: false };
    watched.set(contents, state);
    contents.on?.('did-finish-load', activate);
    contents.on?.('did-navigate', activate);
    contents.on?.('destroyed', () => { stop(state, 'contents-destroyed'); watched.delete(contents); });
    if (until > now()) activate();
  }
  function feed(events) {
    if (!Array.isArray(events)) return;
    let eventOfInterest = false;
    for (const event of events) {
      if (!event || typeof event !== 'object') continue;
      if (event.type === 'overlay.claim' || event.type === 'trace.manual' ||
          event.type === 'filter.dom.result' ||
          (event.type === 'renderer.heartbeat' &&
           (event.data?.doorsPresent === true ||
            (typeof event.data?.msSinceDoor === 'number' && event.data.msSinceDoor >= 0 &&
             event.data.msSinceDoor <= 60000))) ||
          (event.type === 'control.change' && Number(event.data?.doors) > 0)) {
        eventOfInterest = true;
      }
    }
    if (!eventOfInterest) return;
    const wasInactive = until <= now();
    until = now() + 65000; // preserve evidence well after the visible freeze
    if (wasInactive) log('frame.present.armed', { watchMs: 65000 });
    activate();
  }
  return { track, feed, pulse };
}
module.exports = { createPresentationMonitor };
