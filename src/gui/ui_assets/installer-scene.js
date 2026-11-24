/* ============================================================================
 * DFO-Client-Expander-RU — Living Layered Pixel-Art Dungeon Backdrop Engine v4
 *
 * Hybrid Pure-AI Background + Decoupled Real-Time Fire Architecture:
 *   1. Background & Z-Occlusion Layers (bg_F0..F{N-1}, occ1..occ3_F0..F{N-1}):
 *      100% pure untouched AI-regenerated frames (ZERO brightness filters,
 *      ZERO synthetic color-ramp distortion, calm steady exposure!) with ONLY
 *      the wrought-iron bowl cleared so the fire animates independently.
 *      Frames cycle gently (~4 fps) so stone dither grain ("хлебное крошево")
 *      & shadow-edge micro-details dance organically with ZERO strobing.
 *   2. Decoupled Sculpted Multi-Ribbon 15fps Pixel-Art Magical Blue Fire:
 *      Renders smoothly at 15fps physically INSIDE the wrought-iron bowl
 *      behind occ3's front iron prongs (5 sinuous forked ribbons, 5 upward
 *      concave air bites, 8 detached rising flame wisps, 18 rising pixel
 *      sparks, pixel-stepped elliptical halo, generous headroom, zero clipping).
 *   3. 10 Tall, Stately, Ominous Silhouette Watcher Variants (ZERO dwarfs!)
 *      gliding slowly behind occ1, occ2, occ3 with muted steel-blue 1px rim
 *      lights and bright crimson eyes with specular glints.
 * ============================================================================ */
(function (root) {
  'use strict';

  const doc = root.document;
  const ASSETS = (root.__INSTALLER_BOOT__ && root.__INSTALLER_BOOT__.dungeonAssets) || (() => {
    const out = {};
    for (let i = 0; i < 12; i++) {
      for (const kind of ['bg', 'occ1', 'occ2', 'occ3']) {
        out[`${kind}_F${i}`] = `/assets/dungeon/${kind}_F${i}.png`;
      }
    }
    return out;
  })();

  const W = 688;
  const H = 384;

  // Dynamically discover how many pure AI background frames (F0..F{N-1}) are embedded
  let NUM_FRAMES = 0;
  while (ASSETS[`bg_F${NUM_FRAMES}`]) NUM_FRAMES++;

  const cfg = {
    enabled: true,
    fireIntensity: 1.0,       // decoupled 15fps sculpted blue fire intensity (0.4 .. 1.6)
    lightDance: 1.3,          // calm AI-frame background grain tempo (0.0 = pause, 1.3 = 130%)
    lightOverride: 'auto',    // 'auto' | '0'..'N-1'
    silhouetteMode: 'auto',   // 'auto' | 'parade' | 'none'
    framing: 'cover',         // 'cover' | 'fit'
    debugLayers: false,
    busyBoost: false,
  };

  /* ── Load Untouched Pure AI Frames across all 4 Z-Layers ── */
  const layers = { bg: [], occ1: [], occ2: [], occ3: [] };
  let allReady = false;

  function loadAssets(onReady) {
    let total = 0;
    let done = 0;
    for (let i = 0; i < NUM_FRAMES; i++) {
      for (const kind of ['bg', 'occ1', 'occ2', 'occ3']) {
        const key = `${kind}_F${i}`;
        if (!ASSETS[key]) continue;
        total++;
        const im = new Image();
        im.onload = () => {
          layers[kind][i] = im;
          done++;
          if (done === total) {
            allReady = true;
            onReady();
          }
        };
        im.src = ASSETS[key];
      }
    }
  }

  /* ── Offscreen 688x384 Compositor ── */
  const buf = doc.createElement('canvas');
  buf.width = W;
  buf.height = H;
  const bctx = buf.getContext('2d', { alpha: false });
  bctx.imageSmoothingEnabled = false;

  /* ==========================================================================
   * DECOUPLED SCULPTED PIXEL-ART MAGICAL BLUE FIRE ENGINE (15 fps)
   * Native logical grid (72 x 116 logical px -> blitted 2x = 144 x 232 in 688x384)
   * Generous headroom: ZERO top clipping, sinuous S-curved forked tongues,
   * concave dark-air bites, detached rising wisps & bubbling bowl core.
   * ========================================================================== */
  const FW = 72;
  const FH = 116;
  const BOWL_Y = 104;
  const fireCanvas = doc.createElement('canvas');
  fireCanvas.width = FW;
  fireCanvas.height = FH;
  const fctx = fireCanvas.getContext('2d');
  const fireImg = fctx.createImageData(FW, FH);
  const fField = new Float32Array(FW * FH);

  const FIRE_PAL = [
    [0, 0, 0, 0],           // 0: air
    [12, 64, 152, 210],     // 1: deep cobalt wisp tip
    [24, 134, 232, 255],    // 2: electric arcane azure
    [66, 206, 255, 255],    // 3: vivid glacial cyan
    [156, 240, 255, 255],   // 4: frosty pale ice-cyan
    [226, 251, 255, 255],   // 5: near-white inner flame
    [255, 255, 255, 255],   // 6: blazing pure-white core
  ];

  const wisps = [];
  for (let i = 0; i < 8; i++) {
    wisps.push({
      x: FW * 0.5,
      y: BOWL_Y - 30 - i * 8,
      vy: 18 + Math.random() * 14,
      r: 2.2,
      life: Math.random(),
      maxLife: 0.65 + Math.random() * 0.65,
      phase: Math.random() * Math.PI * 2,
    });
  }

  const sparks = [];
  for (let i = 0; i < 18; i++) {
    sparks.push({
      x: 126 + Math.random() * 34,
      y: 55 + Math.random() * 135,
      vy: 15 + Math.random() * 22,
      phase: Math.random() * Math.PI * 2,
      sway: 5 + Math.random() * 9,
      life: Math.random(),
      maxLife: 1.4 + Math.random() * 2.2,
      size: 2,
    });
  }

  let simTime = 0;
  let fireAccum = 0;
  let frameAccum = 0;
  let nextHold = 0.24;
  let activeFrameIdx = 0;
  let fireSwayX = 0;
  let fireHeightNorm = 0;
  let userPulse = 0;

  function stepSculptedFire(dt) {
    const t = simTime;
    const inten = (cfg.busyBoost ? 1.22 : 1.0) * cfg.fireIntensity;

    const wind = Math.sin(t * 2.13) * 0.52 + Math.sin(t * 4.87 + 1.1) * 0.30 + Math.sin(t * 9.41 + 2.4) * 0.18;
    const surge = Math.sin(t * 1.63) * 0.14 + Math.sin(t * 3.79 + 0.7) * 0.10 + Math.pow(Math.max(0, Math.sin(t * 1.17 + Math.sin(t * 0.53) * 2.4)), 6) * 0.34;
    const dip = Math.pow(Math.max(0, Math.sin(t * 0.91 + 2.2)), 5) * 0.24;
    const scaleH = Math.max(0.62, Math.min(1.42, (0.94 + surge - dip + userPulse * 0.14) * inten));

    fireSwayX = Math.max(-1, Math.min(1, wind));
    fireHeightNorm = Math.max(-1, Math.min(1, (scaleH - 0.95) * 2.4));

    fField.fill(0);

    const cx0 = FW * 0.5;
    const maxFlameH = 44 * scaleH;

    const addBlob = (bx, by, rx, ry, power) => {
      const x0 = Math.max(1, Math.floor(bx - rx - 1));
      const x1 = Math.min(FW - 2, Math.ceil(bx + rx + 1));
      const y0 = Math.max(2, Math.floor(by - ry - 1));
      const y1 = Math.min(FH - 2, Math.ceil(by + ry + 1));
      for (let y = y0; y <= y1; y++) {
        const ny = (y - by) / ry;
        const ny2 = ny * ny;
        if (ny2 >= 1) continue;
        for (let x = x0; x <= x1; x++) {
          const nx = (x - bx) / rx;
          const d2 = nx * nx + ny2;
          if (d2 >= 1) continue;
          const val = (1 - d2) * (1 - d2) * power;
          fField[y * FW + x] += val;
        }
      }
    };

    const carveAir = (bx, by, rx, ry, strength) => {
      const x0 = Math.max(1, Math.floor(bx - rx));
      const x1 = Math.min(FW - 2, Math.ceil(bx + rx));
      const y0 = Math.max(2, Math.floor(by - ry));
      const y1 = Math.min(FH - 2, Math.ceil(by + ry));
      for (let y = y0; y <= y1; y++) {
        const ny = (y - by) / ry;
        for (let x = x0; x <= x1; x++) {
          const nx = (x - bx) / rx;
          const d2 = nx * nx + ny * ny;
          if (d2 < 1) {
            fField[y * FW + x] -= (1 - d2) * strength;
          }
        }
      }
    };

    // 1. Glowing bubbling arcane coal bed inside the wrought-iron bowl
    for (let i = -3; i <= 3; i++) {
      const bx = cx0 + i * 4.2 + Math.sin(t * 7.2 + i * 1.9) * 0.7;
      const by = BOWL_Y + Math.abs(i) * 0.55 + Math.cos(t * 6.4 + i) * 0.5;
      const w = 5.2 - Math.abs(i) * 0.45;
      addBlob(bx, by, w, 4.4, 0.92 * inten);
    }

    // 2. Five sinuous S-curved flame ribbons (main spire + 2 forked curling tongues + 2 darting side licks)
    const ribbons = [
      { baseOff: 0.0,   hMul: 1.12, wBase: 8.6, wTip: 0.7, amp: 6.2, freq: 5.8, spd: 7.2, phase: 0.0, pwr: 1.16 },
      { baseOff: -10.2, hMul: 0.78, wBase: 5.6, wTip: 0.6, amp: 5.8, freq: 6.4, spd: 8.6, phase: 1.5, pwr: 0.94 },
      { baseOff: +10.0, hMul: 0.74, wBase: 5.4, wTip: 0.6, amp: 5.6, freq: 6.0, spd: 8.1, phase: 3.1, pwr: 0.92 },
      { baseOff: -2.8,  hMul: 0.92, wBase: 5.8, wTip: 0.7, amp: 4.8, freq: 7.4, spd: 9.8, phase: 4.5, pwr: 1.06 },
      { baseOff: +5.2,  hMul: 0.64, wBase: 4.6, wTip: 0.5, amp: 6.6, freq: 6.9, spd: 9.2, phase: 2.3, pwr: 0.84 },
    ];

    for (const rb of ribbons) {
      const rh = maxFlameH * rb.hMul * (0.86 + 0.18 * Math.sin(t * (rb.spd * 0.52) + rb.phase));
      const steps = Math.max(12, Math.round(rh * 0.80));
      for (let s = 0; s <= steps; s++) {
        const u = s / steps;
        const sway = Math.sin(u * rb.freq - t * rb.spd + rb.phase) * rb.amp * Math.pow(u, 1.18)
          + wind * 6.8 * Math.pow(u, 1.40);
        const pinch = rb.baseOff * (1 - u * 0.44);
        const px = cx0 + pinch + sway;
        const py = BOWL_Y - 1 - u * rh;
        const taper = u < 0.60 ? (1 - u * 0.62) : Math.pow((1 - u) / 0.40, 0.82) * 0.38;
        const radX = Math.max(0.85, rb.wBase * taper + rb.wTip);
        const radY = Math.max(1.2, radX * 1.28);
        const pwr = rb.pwr * (1 - u * 0.54) * inten;
        addBlob(px, py, radX, radY, pwr * 0.48);
      }
    }

    // 3. Upward-travelling concave dark-air bites (crisp forked flame silhouette)
    for (let k = 0; k < 5; k++) {
      const u = ((t * (1.22 + k * 0.24) + k * 0.31) % 1.0);
      const side = (k % 2 === 0) ? -1 : 1;
      const bx = cx0 + side * (11.2 - u * 6.0) + wind * 4.2 * u;
      const by = BOWL_Y - 7 - u * (maxFlameH * 0.96);
      carveAir(bx, by, 4.6 + u * 2.4, 4.4 + u * 2.2, 0.92);
    }

    // 4. Detached curling flame wisps pinching off upper flame tips
    for (const wp of wisps) {
      wp.life += dt;
      wp.y -= wp.vy * dt * (0.85 + 0.3 * inten);
      wp.x += (Math.sin(t * 6.0 + wp.phase) * 14 + wind * 16) * dt;
      if (wp.life >= wp.maxLife || wp.y < 8) {
        wp.life = 0;
        wp.maxLife = 0.48 + Math.random() * 0.55;
        wp.x = cx0 + (Math.random() - 0.5) * 11 + wind * 4;
        wp.y = BOWL_Y - maxFlameH * (0.62 + Math.random() * 0.28);
        wp.vy = 18 + Math.random() * 18;
        wp.r = 2.0 + Math.random() * 1.4;
        wp.phase = Math.random() * Math.PI * 2;
      }
      const f = wp.life / wp.maxLife;
      const rad = wp.r * (1 - f * 0.72);
      const pwr = (1 - f) * 0.85 * inten;
      if (rad > 0.6) {
        addBlob(wp.x, wp.y, rad, rad * 1.45, pwr);
      }
    }

    // 5. Quantize strictly to crisp 6-step arcane blue pixel palette
    const data = fireImg.data;
    for (let i = 0; i < FW * FH; i++) {
      const v = fField[i];
      let idx = 0;
      if (v > 1.72) idx = 6;
      else if (v > 1.24) idx = 5;
      else if (v > 0.84) idx = 4;
      else if (v > 0.52) idx = 3;
      else if (v > 0.30) idx = 2;
      else if (v > 0.18) idx = 1;
      const p = FIRE_PAL[idx];
      const o = i * 4;
      data[o] = p[0];
      data[o + 1] = p[1];
      data[o + 2] = p[2];
      data[o + 3] = p[3];
    }
    fctx.putImageData(fireImg, 0, 0);
  }

  function stepSparks(dt) {
    const speedMul = cfg.busyBoost ? 1.4 : 1.0;
    for (const s of sparks) {
      s.life += dt * speedMul;
      s.y -= s.vy * dt * speedMul;
      s.x += (Math.sin(simTime * 2.5 + s.phase) * s.sway + fireSwayX * 10) * dt;
      if (s.life >= s.maxLife || s.y < 24) {
        s.x = 128 + Math.random() * 30;
        s.y = 140 + Math.random() * 38;
        s.vy = 14 + Math.random() * 24;
        s.life = 0;
        s.maxLife = 1.2 + Math.random() * 2.2;
        s.phase = Math.random() * Math.PI * 2;
      }
    }
  }

  /* ── Calm, Organic Switching Across 12 Unique Jagged-Teeth Boundary Frames ──
   * Every frame F0..F11 has identical steady global brightness (ZERO strobe) and
   * its own randomized horizontal jagged-strip teeth along all light-tier borders! */
  function stepAIFrame(dt) {
    if (NUM_FRAMES <= 1) {
      activeFrameIdx = 0;
      return;
    }
    if (cfg.lightOverride !== 'auto') {
      const n = Number(cfg.lightOverride);
      activeFrameIdx = (n >= 0 && n < NUM_FRAMES) ? n : 0;
      return;
    }
    if (cfg.lightDance < 0.05) return;

    const tempo = Math.max(0.25, cfg.lightDance) * (cfg.busyBoost ? 1.25 : 1.0);
    frameAccum += dt * tempo;
    if (frameAccum < nextHold) return;
    frameAccum = 0;

    // Natural firelight-tremor cadence (~6-8 fps, 115-175ms organic hold, ZERO strobe!)
    nextHold = 0.115 + Math.random() * 0.060;

    // Pick a fresh random variant (never repeating the same frame twice in a row)
    let next = Math.floor(Math.random() * NUM_FRAMES);
    if (next === activeFrameIdx) next = (activeFrameIdx + 1) % NUM_FRAMES;
    activeFrameIdx = next;
  }

  /* ==========================================================================
   * 10 TALL, STATELY, OMINOUS PURE-FIGURE SILHOUETTE WATCHER VARIANTS
   * (ZERO dwarfs, ZERO weapons/staves/spears — strictly pure cloaked figures!)
   * Sculpted Gothic hoods, draped mantles, capes, collars & brighter crimson
   * eyes with larger glowing specular glints tuned for deep bluish-black shadows.
   * ========================================================================== */
  const SW = 40;
  const SH = 74;

  const VARIANT_SPECS = [
    { id: 'tall-monk',       name: '01 Высокий монах',         headX: 20, headY: 13, hoodW: 4.8, hoodH: 6.4, peak: 4.5, shoulderY: 22, shoulderW: 8.6,  hemW: 10.6, lean: 0.0,  tilt: 0.0,  stoop: 0, collar: false, capelet: false, sweep: 0.0,  tatter: false, sleeves: false, dagger: '',           eyeDx: 2.2 },
    { id: 'broad-mantle',    name: '02 Широкий плащ',          headX: 20, headY: 13, hoodW: 5.2, hoodH: 6.4, peak: 3.5, shoulderY: 21, shoulderW: 12.6, hemW: 12.0, lean: 0.0,  tilt: 0.0,  stoop: 0, collar: true,  capelet: true,  sweep: 0.0,  tatter: false, sleeves: false, dagger: '',           eyeDx: 2.3 },
    { id: 'hunched-watcher', name: '03 Сутулый наблюдатель',   headX: 15, headY: 16, hoodW: 4.9, hoodH: 6.1, peak: 4.0, shoulderY: 23, shoulderW: 9.2,  hemW: 11.2, lean: -4.4, tilt: 0.0,  stoop: 5, collar: false, capelet: false, sweep: 1.5,  tatter: false, sleeves: false, dagger: '',           eyeDx: 2.1 },
    { id: 'tilted-head',     name: '04 Склонённая (кинжал)',   headX: 19, headY: 13, hoodW: 4.8, hoodH: 6.4, peak: 5.0, shoulderY: 22, shoulderW: 8.8,  hemW: 10.4, lean: -0.6, tilt: 2.4,  stoop: 0, collar: false, capelet: false, sweep: -1.0, tatter: false, sleeves: false, dagger: 'reverse',    eyeDx: 2.2 },
    { id: 'half-turn-peeker',name: '05 Вполоборота',           headX: 16, headY: 13, hoodW: 4.1, hoodH: 6.5, peak: 3.5, shoulderY: 22, shoulderW: 6.2,  hemW: 7.8,  lean: -3.6, tilt: 0.0,  stoop: 0, collar: false, capelet: false, sweep: 1.6,  tatter: false, sleeves: false, dagger: '',           eyeDx: 1.4 },
    { id: 'sweeping-cloak',  name: '06 Шлейф (клинок)',        headX: 17, headY: 12, hoodW: 4.7, hoodH: 6.4, peak: 5.0, shoulderY: 21, shoulderW: 8.8,  hemW: 11.8, lean: -1.4, tilt: -0.6, stoop: 0, collar: true,  capelet: false, sweep: 5.4,  tatter: false, sleeves: false, dagger: 'shortblade', eyeDx: 2.1 },
    { id: 'tall-inquisitor', name: '07 Высокий клобук',        headX: 20, headY: 11, hoodW: 4.1, hoodH: 6.6, peak: 8.5, shoulderY: 20, shoulderW: 7.2,  hemW: 8.6,  lean: 0.0,  tilt: 0.0,  stoop: 0, collar: false, capelet: false, sweep: 0.0,  tatter: false, sleeves: false, dagger: '',           eyeDx: 2.0 },
    { id: 'tattered-shroud', name: '08 Изношенный балахон',    headX: 20, headY: 13, hoodW: 5.1, hoodH: 6.4, peak: 4.2, shoulderY: 22, shoulderW: 10.2, hemW: 12.8, lean: 0.2,  tilt: -1.3, stoop: 0, collar: false, capelet: true,  sweep: 1.8,  tatter: true,  sleeves: false, dagger: '',           eyeDx: 2.2 },
    { id: 'clasped-sleeves', name: '09 Рукава (два кинжала)',  headX: 20, headY: 13, hoodW: 4.8, hoodH: 6.4, peak: 4.2, shoulderY: 22, shoulderW: 8.8,  hemW: 9.4,  lean: 0.0,  tilt: 0.0,  stoop: 0, collar: false, capelet: false, sweep: 0.0,  tatter: false, sleeves: true,  dagger: 'twin-sleeve',eyeDx: 2.2 },
    { id: 'layered-hood',    name: '10 Глубокая накидка',      headX: 20, headY: 12, hoodW: 5.4, hoodH: 6.7, peak: 4.8, shoulderY: 21, shoulderW: 11.4, hemW: 12.2, lean: -0.3, tilt: 0.7,  stoop: 0, collar: true,  capelet: true,  sweep: -2.2, tatter: false, sleeves: false, dagger: '',           eyeDx: 2.3 },
  ];

  function buildWatcherSprite(spec) {
    const grid = new Uint8Array(SW * SH);
    const set = (x, y, v) => {
      x = Math.round(x); y = Math.round(y);
      if (x >= 0 && x < SW && y >= 0 && y < SH) grid[y * SW + x] = v;
    };
    const get = (x, y) => (x >= 0 && x < SW && y >= 0 && y < SH) ? grid[y * SW + x] : 0;

    const footY = SH - 2;
    const hcx = spec.headX;
    const hcy = spec.headY;

    // 1. Organic curved Gothic hood / cowl with natural tapered crown & recessed neck
    for (let y = Math.max(1, Math.floor(hcy - spec.hoodH - spec.peak)); y <= Math.floor(hcy + spec.hoodH); y++) {
      let half;
      if (y < hcy - spec.hoodH * 0.12) {
        const frac = (y - (hcy - spec.hoodH - spec.peak)) / Math.max(1, spec.hoodH * 0.88 + spec.peak);
        half = Math.max(0.7, spec.hoodW * Math.pow(Math.max(0, frac), 0.72));
      } else {
        const dy = (y - hcy) / spec.hoodH;
        // Soft natural jaw/cowl drape narrowing smoothly into collar
        half = spec.hoodW * (1.0 - Math.max(0, dy) * 0.24);
      }
      const cx = hcx + (spec.tilt ? (hcy - y) * 0.17 * spec.tilt : 0);
      for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) set(x, y, 1);
    }

    // Optional sinister upper-back hunched curve (full tall adult height preserved!)
    if (spec.stoop > 0) {
      for (let y = hcy - 1; y <= spec.shoulderY + 10; y++) {
        const t = (y - (hcy - 1)) / Math.max(1, spec.shoulderY + 11 - hcy);
        const bulge = Math.sin(t * Math.PI) * (spec.stoop * 1.25);
        for (let x = Math.floor(hcx + 2); x <= Math.ceil(hcx + 7.5 + bulge); x++) set(x, y, 1);
      }
    }

    // Optional solid sculpted high Gothic mantle collar (filled cleanly into hood/shoulders — NO thin sticks!)
    if (spec.collar) {
      for (let y = Math.floor(spec.shoulderY - 5); y <= Math.floor(spec.shoulderY + 3); y++) {
        const u = (spec.shoulderY + 3 - y) / 8.0; // 0 at shoulders, 1 at upper collar tips
        const outer = spec.hoodW + 1.8 + u * 2.4;
        const inner = spec.hoodW * 0.7;
        for (let x = Math.floor(hcx - outer); x <= Math.ceil(hcx - inner); x++) set(x, y, 1);
        for (let x = Math.floor(hcx + inner); x <= Math.ceil(hcx + outer); x++) set(x, y, 1);
      }
    }

    // 2. Sculpted full-length monolithic dark-fantasy robe, mantle & drapery
    for (let y = Math.floor(spec.shoulderY - 2); y <= footY; y++) {
      const t = (y - (spec.shoulderY - 2)) / Math.max(1, footY - (spec.shoulderY - 2));
      let halfL, halfR;
      if (t < 0.13) {
        const st = t / 0.13;
        const base = spec.hoodW * 0.74 + (spec.shoulderW - spec.hoodW * 0.74) * Math.sin(st * Math.PI * 0.5);
        halfL = base;
        halfR = base;
      } else {
        const bt = (t - 0.13) / 0.87;
        const waist = Math.sin(bt * Math.PI) * -1.15;
        const base = spec.shoulderW + (spec.hemW - spec.shoulderW) * bt + waist;
        halfL = base;
        halfR = base;

        // Draped heavy shoulder capelet / mantle over upper chest & arms
        if (spec.capelet && bt < 0.36) {
          const ct = bt / 0.36;
          const drape = Math.sin(ct * Math.PI) * 2.4 + (ct < 0.7 ? 0.9 : (1 - ct) * 3.0);
          halfL += drape;
          halfR += drape;
        }
        // Solemn heavy bell-sleeves clasped quietly across mid-torso
        if (spec.sleeves && bt > 0.08 && bt < 0.52) {
          const st = (bt - 0.08) / 0.44;
          const sleeveBulge = Math.pow(Math.sin(st * Math.PI), 0.85) * 4.2;
          halfL += sleeveBulge;
          halfR += sleeveBulge;
        }
        // Asymmetrical sweeping heavy cloak / train
        if (spec.sweep > 0) {
          halfR += Math.pow(bt, 1.15) * spec.sweep;
        } else if (spec.sweep < 0) {
          halfL += Math.pow(bt, 1.15) * (-spec.sweep);
        }
      }

      const cx = hcx - spec.lean * t;
      const x0 = Math.floor(cx - halfL);
      const x1 = Math.ceil(cx + halfR);
      for (let x = x0; x <= x1; x++) {
        // Subtle vertical tattered cloth strips strictly at bottom hem for tattered-shroud variant
        if (spec.tatter && y > footY - 8) {
          const stripH = ((x * 13 + 5) % 7);
          if (y > footY - stripH) continue;
        }
        // Clean monolithic internal drapery fold strictly on fire-facing left side (zero crumbly noise!)
        const f1 = (t > 0.07 && t < 0.86 && Math.abs(x - (cx - halfL * 0.44)) < 0.85);
        const f2 = (t > 0.16 && t < 0.72 && Math.abs(x - (cx - halfL * 0.10)) < 0.75);
        set(x, y, f1 ? 2 : (f2 ? 3 : 1));
      }
    }

    // Render solid unbroken obsidian body with clean subtle dark-indigo drapery folds
    const bodyCan = doc.createElement('canvas');
    bodyCan.width = SW; bodyCan.height = SH;
    const bx = bodyCan.getContext('2d');
    for (let y = 0; y < SH; y++) {
      for (let x = 0; x < SW; x++) {
        const v = get(x, y);
        if (!v) continue;
        bx.fillStyle = v === 2 ? '#0a162c' : (v === 3 ? '#060d1c' : '#02040a');
        bx.fillRect(x, y, 1, 1);
      }
    }

    // Crisp muted steel-blue 1px fire-facing rim light along left silhouette edge
    const rimCan = doc.createElement('canvas');
    rimCan.width = SW; rimCan.height = SH;
    const rx = rimCan.getContext('2d');
    for (let y = 1; y < SH - 1; y++) {
      for (let x = 1; x < SW - 1; x++) {
        if (get(x, y) === 0 || get(x - 1, y) !== 0) continue;
        const upper = y >= hcy - spec.hoodH - spec.peak && y <= spec.shoulderY + 16;
        const lowerFade = 1.0 - Math.max(0, (y - (spec.shoulderY + 16)) / Math.max(1, SH - (spec.shoulderY + 16)));
        if (upper) {
          rx.fillStyle = (y <= spec.shoulderY + 5) ? 'rgba(116, 174, 232, 0.90)' : 'rgba(72, 126, 184, 0.78)';
          rx.fillRect(x, y, 1, 1);
        } else if (lowerFade > 0.18 && (y % 2 === 0 || lowerFade > 0.58)) {
          rx.fillStyle = `rgba(46, 86, 138, ${(0.22 + lowerFade * 0.42).toFixed(2)})`;
          rx.fillRect(x, y, 1, 1);
        }
      }
    }

    // Concealed steel daggers / short blades peeking strictly INSIDE the dark cloak silhouette
    // (guaranteed 100% inside get(x, y) !== 0 — never protrudes outside the silhouette!)
    const bladeEdgePts = [];
    const bladeCan = spec.dagger ? doc.createElement('canvas') : null;
    if (bladeCan) {
      bladeCan.width = SW; bladeCan.height = SH;
      const gx = bladeCan.getContext('2d');
      const plotBlade = (x, y, col, isEdge) => {
        x = Math.round(x); y = Math.round(y);
        // Hard silhouette containment guard: strictly inside body!
        if (get(x, y) === 0 || get(x - 1, y) === 0 || get(x + 1, y) === 0) return;
        gx.fillStyle = col;
        gx.fillRect(x, y, 1, 1);
        if (isEdge) bladeEdgePts.push([x, y]);
      };

      if (spec.dagger === 'reverse') {
        // Variant 04: Reverse-grip concealed stiletto angling down-left along inner robe fold
        for (let i = 0; i <= 11; i++) {
          const bx = 17 - i * 0.32;
          const by = 41 + i;
          // Dark steel fuller on shadow side + blazing cold steel edge facing the brazier!
          plotBlade(bx + 1, by, '#274d7a', false);
          if (i < 10) plotBlade(bx + 2, by, '#152e4f', false);
          plotBlade(bx, by, i < 2 ? '#9cd8ff' : (i > 9 ? '#ffffff' : '#d6f4ff'), true);
        }
      } else if (spec.dagger === 'shortblade') {
        // Variant 06: Curved concealed short blade peeking from parted cloak across lower waist
        for (let i = 0; i <= 12; i++) {
          const u = i / 12;
          const bx = 18 - i * 0.42 - Math.sin(u * Math.PI) * 0.8;
          const by = 38 + i;
          // Broader cold steel flat + razor-bright icy cutting edge facing left toward the fire
          plotBlade(bx + 2, by, '#1a385c', false);
          plotBlade(bx + 1, by, '#4d8ec4', false);
          plotBlade(bx, by, (i >= 3 && i <= 10) ? '#e8f9ff' : '#8ed0ff', true);
        }
      } else if (spec.dagger === 'twin-sleeve') {
        // Variant 09: Twin short daggers peeking subtly out from beneath the crossed ritual sleeves
        // Left sleeve dagger (angled down-right slightly)
        for (let i = 0; i <= 7; i++) {
          const bx = 13 + i * 0.35;
          const by = 38 + i;
          plotBlade(bx + 1, by, '#2e5d8f', false);
          plotBlade(bx, by, (i >= 2 && i <= 6) ? '#e4f8ff' : '#8ecfff', true);
        }
        // Right sleeve dagger (angled down-left slightly, catching cold firelight on its upper edge)
        for (let i = 0; i <= 7; i++) {
          const bx = 25 - i * 0.40;
          const by = 39 + i;
          plotBlade(bx + 1, by, '#264d78', false);
          plotBlade(bx, by, (i >= 2 && i <= 6) ? '#dff6ff' : '#7ec2f4', true);
        }
      }
    }

    const ey = Math.round(hcy + 1);
    const tiltDy = spec.tilt > 1.2 ? 1 : (spec.tilt < -1.0 ? -1 : 0);
    const edx = spec.eyeDx || 2.1;
    return {
      spec,
      bodyCan,
      rimCan,
      bladeCan,
      bladeEdgePts,
      eyes: { lx: Math.round(hcx - edx), ly: ey, rx: Math.round(hcx + edx), ry: ey + tiltDy },
    };
  }

  const WATCHER_SPRITES = VARIANT_SPECS.map(buildWatcherSprite);

  /* ── 5 Depth-Layered Hiding Pockets behind Z-Occlusion Masks ── */
  const POCKETS = [
    { id: 'far-arch-left',    zLayer: 0, hiddenX: 408, watchX: 460, footY: 258, scale: 0.76, rimMax: 0.46, allowed: [0, 1, 3, 5, 6, 7, 8, 9] },
    { id: 'far-arch-right',   zLayer: 0, hiddenX: 538, watchX: 492, footY: 258, scale: 0.76, rimMax: 0.42, allowed: [0, 2, 3, 6, 7, 8, 9] },
    { id: 'mid-left-pillar3', zLayer: 1, hiddenX: 318, watchX: 368, footY: 274, scale: 0.94, rimMax: 0.76, allowed: [0, 2, 3, 4, 5, 7, 8, 9] },
    { id: 'mid-right-pillar4',zLayer: 1, hiddenX: 590, watchX: 544, footY: 272, scale: 0.88, rimMax: 0.54, allowed: [0, 1, 2, 4, 6, 7, 8, 9] },
    { id: 'fg-right-pillar5', zLayer: 2, hiddenX: 678, watchX: 614, footY: 318, scale: 1.18, rimMax: 0.94, allowed: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
  ];

  const pocketStates = POCKETS.map((p, idx) => {
    const startActive = idx === 2 || idx === 4 || idx === 0;
    const initVar = idx === 4 ? 5 : (idx === 2 ? 3 : (idx === 0 ? 0 : idx));
    return {
      pocket: p,
      phase: startActive ? (idx === 4 ? 'watching' : 'emerging') : 'hidden',
      timer: startActive ? (idx === 4 ? 4.2 : 1.5) : (2.5 + idx * 2.4),
      dur: startActive ? 4.5 : (4.0 + Math.random() * 5.0),
      progress: idx === 4 ? 0.92 : (idx === 2 ? 0.45 : (idx === 0 ? 0.25 : 0)),
      variantIdx: initVar % WATCHER_SPRITES.length,
      blinkT: 1.8 + Math.random() * 3.5,
      glintFlare: 0,
      bobPhase: Math.random() * Math.PI * 2,
      peekDepth: 0.78 + Math.random() * 0.24,
    };
  });

  function pickFreshVariant(pocket) {
    const used = new Set(pocketStates.filter((s) => s.phase !== 'hidden').map((s) => s.variantIdx));
    const pool = pocket.allowed.filter((v) => !used.has(v));
    const list = pool.length ? pool : pocket.allowed;
    return list[Math.floor(Math.random() * list.length)];
  }

  function easeInOutSine(x) {
    return -(Math.cos(Math.PI * Math.max(0, Math.min(1, x))) - 1) / 2;
  }

  function stepWatchers(dt) {
    if (cfg.silhouetteMode !== 'auto') return;
    const maxActive = cfg.busyBoost ? 4 : 3;
    let activeCount = pocketStates.filter((s) => s.phase !== 'hidden').length;

    for (const st of pocketStates) {
      st.blinkT -= dt;
      if (st.blinkT < -0.28) st.blinkT = 2.6 + Math.random() * 4.8;
      if (st.glintFlare > 0) st.glintFlare = Math.max(0, st.glintFlare - dt * 1.4);

      if (st.phase === 'hidden') {
        st.timer -= dt;
        if (st.timer <= 0) {
          if (activeCount < maxActive) {
            st.phase = 'emerging';
            st.timer = 0;
            st.dur = 3.8 + Math.random() * 2.8;
            st.peekDepth = 0.70 + Math.random() * 0.30;
            st.variantIdx = pickFreshVariant(st.pocket);
            activeCount++;
          } else {
            st.timer = 1.8 + Math.random() * 2.5;
          }
        }
      } else if (st.phase === 'emerging') {
        st.timer += dt;
        st.progress = easeInOutSine(st.timer / st.dur) * st.peekDepth;
        if (st.timer >= st.dur) {
          st.phase = 'watching';
          st.timer = 0;
          st.dur = 4.4 + Math.random() * 5.8;
        }
      } else if (st.phase === 'watching') {
        st.timer += dt;
        st.progress = st.peekDepth + Math.sin(simTime * 0.75 + st.bobPhase) * 0.022;
        if (st.timer >= st.dur) {
          st.phase = 'retreating';
          st.timer = 0;
          st.dur = 3.5 + Math.random() * 2.6;
        }
      } else if (st.phase === 'retreating') {
        st.timer += dt;
        st.progress = (1 - easeInOutSine(st.timer / st.dur)) * st.peekDepth;
        if (st.timer >= st.dur) {
          st.phase = 'hidden';
          st.progress = 0;
          st.timer = 3.5 + Math.random() * 7.5;
          activeCount = Math.max(0, activeCount - 1);
        }
      }
    }
  }

  /* ── 1px Pale-Crimson Near-White Eye Core + Smooth Non-Pixel Sparkling Crimson Bloom & Synchronized Vertical Blink ── */
  const eyeDraws = [];

  function blinkOpenRatio(blinkT) {
    if (blinkT >= 0) return 1;
    const u = Math.min(1, -blinkT / 0.28);
    if (u < 0.43) return Math.max(0, Math.cos((u / 0.43) * Math.PI * 0.5));
    if (u < 0.55) return 0;
    return Math.min(1, Math.sin(((u - 0.55) / 0.45) * Math.PI * 0.5));
  }

  function queueEyePair(zLayer, ox, oy, scale, lx, ly, rx, ry, alpha, blinkT, flare, seedBase) {
    const openRatio = blinkOpenRatio(blinkT);
    if (alpha <= 0.03 || openRatio <= 0.01) return;
    eyeDraws.push(
      { zLayer, bx: ox + lx * 2 * scale + scale, by: oy + ly * 2 * scale + scale, wScale: scale, alpha, openRatio, flare, seed: seedBase + lx * 0.7 },
      { zLayer, bx: ox + rx * 2 * scale + scale, by: oy + ry * 2 * scale + scale, wScale: scale, alpha, openRatio, flare, seed: seedBase + rx * 0.7 + 2.3 }
    );
  }

  function drawSingleWatcher(ctx, sprite, cx, footY, scale, bodyAlpha, rimAlpha, eyeAlpha, blink1, flare, zLayer = -1) {
    if (bodyAlpha <= 0.02 && eyeAlpha <= 0.02) return;
    const dw = Math.round(SW * 2 * scale);
    const dh = Math.round(SH * 2 * scale);
    const ox = Math.round(cx - dw * 0.5);
    const oy = Math.round(footY - dh);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (bodyAlpha > 0.02) {
      ctx.globalAlpha = Math.min(1, bodyAlpha);
      ctx.drawImage(sprite.bodyCan, 0, 0, SW, SH, ox, oy, dw, dh);
    }
    if (rimAlpha > 0.02) {
      ctx.globalAlpha = Math.min(1, rimAlpha);
      ctx.drawImage(sprite.rimCan, 0, 0, SW, SH, ox, oy, dw, dh);
    }
    // Concealed gleaming steel dagger/blade strictly inside silhouette (bright cold metallic flash!)
    if (sprite.bladeCan && bodyAlpha > 0.15) {
      const bladeA = Math.min(1, bodyAlpha * (0.72 + rimAlpha * 0.35));
      ctx.globalAlpha = bladeA;
      ctx.drawImage(sprite.bladeCan, 0, 0, SW, SH, ox, oy, dw, dh);
      // Travelling crisp white metallic glint sliding along the steel edge!
      const pts = sprite.bladeEdgePts;
      if (pts && pts.length > 0) {
        const px = Math.max(2, Math.round(2 * scale));
        const sweepT = (simTime * 0.65 + (sprite.spec.headX * 0.17)) % 2.4;
        const activeIdx = sweepT < 1.0 ? Math.floor(sweepT * pts.length) : Math.floor(pts.length * 0.55);
        const [bx, by] = pts[Math.min(pts.length - 1, Math.max(0, activeIdx))];
        const gx = Math.round(ox + bx * 2 * scale);
        const gy = Math.round(oy + by * 2 * scale);
        const glintStr = (sweepT < 1.0 ? 0.98 : 0.62) + flare * 0.35;
        ctx.globalAlpha = Math.min(1, bladeA * glintStr);
        ctx.fillStyle = 'rgba(130, 224, 255, 0.72)';
        ctx.fillRect(gx - px, gy, px * 3, px);
        ctx.fillRect(gx, gy - px, px, px * 3);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(gx, gy, px, px);
      }
    }
    ctx.globalAlpha = 1;
    const e = sprite.eyes;
    queueEyePair(zLayer, ox, oy, scale, e.lx, e.ly, e.rx, e.ry, eyeAlpha, blink1, flare, sprite.spec.headX * 1.13);
    ctx.restore();
  }

  function renderWatchersForLayer(ctx, zLayer) {
    if (cfg.silhouetteMode !== 'auto') return;
    const subtleBreath = 0.90 + Math.sin(simTime * 2.4) * 0.08;
    for (const st of pocketStates) {
      if (st.pocket.zLayer !== zLayer || st.phase === 'hidden' || st.progress <= 0.005) continue;
      const p = st.pocket;
      const sprite = WATCHER_SPRITES[st.variantIdx];
      const cx = p.hiddenX + (p.watchX - p.hiddenX) * st.progress;
      const breatheY = Math.round(Math.sin(simTime * 1.15 + st.bobPhase) * 1.0);
      const bodyAlpha = Math.min(1, st.progress * 1.75);
      const eyeAlpha = Math.min(1, Math.max(0, (st.progress - 0.08) * 1.65));
      const rimAlpha = Math.min(1, Math.max(0, (st.progress - 0.20) * 1.35)) * p.rimMax * subtleBreath;
      drawSingleWatcher(ctx, sprite, cx, p.footY + breatheY, p.scale, bodyAlpha, rimAlpha, eyeAlpha, st.blinkT, st.glintFlare, p.zLayer);
    }
  }

  function renderParadeShowcase(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(3, 6, 14, 0.86)';
    ctx.fillRect(14, 14, W - 28, H - 28);
    ctx.strokeStyle = '#756346';
    ctx.lineWidth = 2;
    ctx.strokeRect(14, 14, W - 28, H - 28);

    ctx.fillStyle = '#f6e7b0';
    ctx.font = 'bold 11px Consolas, monospace';
    ctx.fillText('10 ФИГУР-НАБЛЮДАТЕЛЕЙ (БЕЗ КОПИЙ/ПОСОХОВ · 3 СКРЫТЫХ КЛИНКА ВНУТРИ СИЛУЭТА)', 26, 31);

    const cols = 5;
    const cellW = (W - 52) / cols;
    const rowH = 162;
    for (let i = 0; i < WATCHER_SPRITES.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x0 = 26 + col * cellW;
      const y0 = 40 + row * rowH;

      ctx.fillStyle = 'rgba(7, 13, 26, 0.94)';
      ctx.fillRect(x0 + 4, y0 + 2, cellW - 8, rowH - 8);
      ctx.strokeStyle = 'rgba(110, 152, 204, 0.28)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 4, y0 + 2, cellW - 8, rowH - 8);

      const blinkCycle = (simTime + i * 0.73) % 4.8;
      const blink = blinkCycle < 0.28 ? -blinkCycle : 1.0;
      drawSingleWatcher(
        ctx, WATCHER_SPRITES[i],
        x0 + cellW * 0.5, y0 + rowH - 22, 0.84,
        1.0, 0.92, 1.0, blink, 0.22 + userPulse * 0.5, -1
      );

      ctx.fillStyle = '#a8c6e8';
      ctx.font = '9.5px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(WATCHER_SPRITES[i].spec.name, x0 + cellW * 0.5, y0 + rowH - 10);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  /* ==========================================================================
   * MAIN 688x384 COMPOSITOR:
   *   Pure AI stone/grain background frames + Z-layers + Decoupled 15fps Fire!
   * ========================================================================== */
  function composeFrame() {
    if (!allReady || NUM_FRAMES === 0) return;
    eyeDraws.length = 0;
    const fi = Math.min(activeFrameIdx, NUM_FRAMES - 1);
    bctx.imageSmoothingEnabled = false;
    bctx.globalCompositeOperation = 'source-over';
    bctx.globalAlpha = 1;

    // [Z0] Pure AI-Regenerated Stone Background Frame (empty bowl, zero filters!)
    bctx.drawImage(layers.bg[fi], 0, 0);

    // [S1] Far Central Doorway Silhouettes (behind Layer 1 Arch!)
    renderWatchersForLayer(bctx, 0);

    // [Z1] Inner Gothic Archway Occlusion Mask (from exact same AI frame!)
    bctx.drawImage(layers.occ1[fi], 0, 0);

    // [S2] Mid-Left Pillar 3 & Mid-Right Pillar 4 Silhouettes
    renderWatchersForLayer(bctx, 1);

    // [Z2] Mid Pillars Occlusion Mask (from exact same AI frame!)
    bctx.drawImage(layers.occ2[fi], 0, 0);

    // [S3] Foreground Right Alcove Silhouettes (behind Massive Right Pillar 5!)
    renderWatchersForLayer(bctx, 2);

    // [F1] Soft Pixel-Stepped Elliptical Arcane Bloom centered on the bowl (no box edges!)
    const bloomMul = 0.92 * cfg.fireIntensity;
    bctx.save();
    bctx.globalCompositeOperation = 'lighter';
    const bx = Math.round((143 + fireSwayX * 2.5) / 2) * 2;
    const by = Math.round((186 - fireHeightNorm * 4) / 2) * 2;
    const haloSteps = [
      [64, 80, `rgba(16, 84, 186, ${(0.07 * bloomMul).toFixed(3)})`],
      [44, 58, `rgba(34, 146, 238, ${(0.10 * bloomMul).toFixed(3)})`],
      [28, 40, `rgba(88, 212, 255, ${(0.13 * bloomMul).toFixed(3)})`],
      [15, 22, `rgba(204, 246, 255, ${(0.15 * bloomMul).toFixed(3)})`],
    ];
    for (const [rx, ry, col] of haloSteps) {
      bctx.fillStyle = col;
      const yMin = Math.floor(-ry / 2) * 2;
      const yMax = Math.ceil(ry / 2) * 2;
      for (let dy = yMin; dy <= yMax; dy += 2) {
        const ny = dy / ry;
        if (ny * ny >= 1) continue;
        const hw = Math.round((rx * Math.sqrt(1 - ny * ny)) / 2) * 2;
        if (hw > 0) bctx.fillRect(bx - hw, by + dy, hw * 2, 2);
      }
    }
    bctx.restore();

    // [F2] Decoupled Sculpted Multi-Ribbon Pixel-Art Magical Blue Fire (15 fps, ZERO clipping!)
    const fireDrawX = 143 - FW;
    const fireDrawY = 224 - BOWL_Y * 2;
    bctx.drawImage(fireCanvas, 0, 0, FW, FH, fireDrawX, fireDrawY, FW * 2, FH * 2);

    // [F3] Rising Square Pixel Sparks
    for (const s of sparks) {
      const f = s.life / s.maxLife;
      const sx = Math.round(s.x / 2) * 2;
      const sy = Math.round(s.y / 2) * 2;
      if (f < 0.28) bctx.fillStyle = '#ffffff';
      else if (f < 0.60) bctx.fillStyle = '#84efff';
      else if (f < 0.85) bctx.fillStyle = '#299eff';
      else bctx.fillStyle = 'rgba(20, 92, 196, 0.65)';
      bctx.fillRect(sx, sy, s.size, s.size);
    }

    // [Z3] Massive FG Pillars 1 & 5 + Wrought-Iron Brazier Front Cage Prongs!
    bctx.drawImage(layers.occ3[fi], 0, 0);

    // Optional Z-Layer & Frame Debug HUD
    if (cfg.debugLayers) {
      bctx.save();
      const tint = (im, col) => {
        const tc = doc.createElement('canvas');
        tc.width = W; tc.height = H;
        const tx = tc.getContext('2d');
        tx.drawImage(im, 0, 0);
        tx.globalCompositeOperation = 'source-in';
        tx.fillStyle = col;
        tx.fillRect(0, 0, W, H);
        bctx.globalAlpha = 0.28;
        bctx.drawImage(tc, 0, 0);
      };
      tint(layers.occ1[fi], '#38bdf8');
      tint(layers.occ2[fi], '#4ade80');
      tint(layers.occ3[fi], '#facc15');
      bctx.globalAlpha = 0.96;
      bctx.fillStyle = 'rgba(5, 10, 20, 0.82)';
      bctx.fillRect(8, 8, 285, 22);
      bctx.font = 'bold 11px Consolas, monospace';
      bctx.fillStyle = '#fde68a';
      bctx.fillText(`AI BG: F${fi}/${NUM_FRAMES} (${cfg.lightOverride === 'auto' ? 'AUTO' : 'LOCK'}) · FIRE: 15FPS`, 14, 23);
      bctx.strokeStyle = '#ff5a6e';
      bctx.lineWidth = 2;
      for (const p of POCKETS) {
        bctx.beginPath();
        bctx.moveTo(p.hiddenX, p.footY - 34);
        bctx.lineTo(p.watchX, p.footY - 34);
        bctx.stroke();
      }
      bctx.restore();
    }

    if (cfg.silhouetteMode === 'parade') {
      renderParadeShowcase(bctx);
    }
  }

  /* ── Display Loop ── */
  let canvas = null;
  let dctx = null;
  let rafId = 0;
  let lastTs = 0;

  function resizeDisplay() {
    if (!canvas || !canvas.parentElement) return;
    const cw = Math.max(1, Math.round(canvas.parentElement.clientWidth));
    const ch = Math.max(1, Math.round(canvas.parentElement.clientHeight));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
  }

  /* Scratch pad for full-res non-pixel crimson eye bloom + exact synchronous vertical blink clip + Z-occlusion */
  const GLOW_PAD = 128;
  const GLOW_HALF = GLOW_PAD * 0.5;
  const glowPad = doc.createElement('canvas');
  glowPad.width = GLOW_PAD;
  glowPad.height = GLOW_PAD;
  const gpCtx = glowPad.getContext('2d');

  function renderEyeBlooms(ctx, fi, dx, dy, dispScale) {
    if (!eyeDraws.length) return;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    for (const ed of eyeDraws) {
      const a = Math.min(1, ed.alpha);
      const sx = dx + ed.bx * dispScale;
      const sy = dy + ed.by * dispScale;
      if (sx < -GLOW_HALF || sy < -GLOW_HALF || sx > ctx.canvas.width + GLOW_HALF || sy > ctx.canvas.height + GLOW_HALF) continue;

      const sMul = ed.wScale * (dispScale / 2.0);
      const twinkle = Math.pow(0.5 + 0.5 * Math.sin(simTime * 3.5 + ed.seed + Math.sin(simTime * 1.15 + ed.seed * 0.5)), 4);
      const pulse = 0.72 + Math.sin(simTime * 2.4 + ed.seed) * 0.14 + twinkle * 0.36 + ed.flare * 0.65;

      const rOuter = Math.min(GLOW_HALF - 4, (14 + 7.5 * pulse) * sMul);
      const rInner = Math.max(3, (5.2 + 2.4 * pulse) * sMul);
      const glintLen = Math.min(GLOW_HALF - 4, (11 + 8.5 * pulse) * sMul);
      const vertClipHalf = Math.max(0.3, rOuter * ed.openRatio);

      gpCtx.clearRect(0, 0, GLOW_PAD, GLOW_PAD);
      gpCtx.save();
      gpCtx.beginPath();
      gpCtx.rect(0, GLOW_HALF - vertClipHalf, GLOW_PAD, vertClipHalf * 2);
      gpCtx.clip();

      // 1. Crisp 1-pixel light-red almost-white pinpoint core (crops vertically synchronously with blink!)
      gpCtx.globalCompositeOperation = 'source-over';
      gpCtx.imageSmoothingEnabled = false;
      const corePx = Math.max(2, Math.round(dispScale * (ed.wScale >= 1.05 ? 1.25 : 1.0)));
      const coreH = Math.max(0.3, corePx * ed.openRatio);
      const coreX = Math.round(GLOW_HALF - corePx * 0.5);
      const coreY = GLOW_HALF - coreH * 0.5;
      gpCtx.fillStyle = `rgba(255, 224, 232, ${(a * 0.99).toFixed(3)})`;
      gpCtx.fillRect(coreX, coreY, corePx, coreH);

      // 2. Smooth NON-pixel crimson outer & inner bloom + sparkling flare over the 1px core
      gpCtx.globalCompositeOperation = 'lighter';
      gpCtx.imageSmoothingEnabled = true;

      const gOuter = gpCtx.createRadialGradient(GLOW_HALF, GLOW_HALF, 0, GLOW_HALF, GLOW_HALF, rOuter);
      gOuter.addColorStop(0, `rgba(245, 16, 40, ${(0.72 * a).toFixed(3)})`);
      gOuter.addColorStop(0.28, `rgba(218, 8, 30, ${(0.44 * a).toFixed(3)})`);
      gOuter.addColorStop(0.65, `rgba(165, 4, 20, ${(0.14 * a).toFixed(3)})`);
      gOuter.addColorStop(1, 'rgba(130, 0, 16, 0)');
      gpCtx.fillStyle = gOuter;
      gpCtx.beginPath();
      gpCtx.arc(GLOW_HALF, GLOW_HALF, rOuter, 0, Math.PI * 2);
      gpCtx.fill();

      const gInner = gpCtx.createRadialGradient(GLOW_HALF, GLOW_HALF, 0, GLOW_HALF, GLOW_HALF, rInner);
      gInner.addColorStop(0, `rgba(255, 48, 72, ${(0.76 * a).toFixed(3)})`);
      gInner.addColorStop(0.45, `rgba(242, 14, 38, ${(0.44 * a).toFixed(3)})`);
      gInner.addColorStop(1, 'rgba(200, 0, 24, 0)');
      gpCtx.fillStyle = gInner;
      gpCtx.beginPath();
      gpCtx.arc(GLOW_HALF, GLOW_HALF, rInner, 0, Math.PI * 2);
      gpCtx.fill();

      // 3. Sparkling non-pixel horizontal & delicate vertical lens flare glint
      gpCtx.save();
      gpCtx.translate(GLOW_HALF, GLOW_HALF);
      gpCtx.scale(1, 0.16);
      const gH = gpCtx.createRadialGradient(0, 0, 0, 0, 0, glintLen);
      gH.addColorStop(0, `rgba(255, 196, 208, ${((0.55 + 0.34 * twinkle) * a).toFixed(3)})`);
      gH.addColorStop(0.32, `rgba(255, 28, 56, ${((0.40 + 0.24 * twinkle) * a).toFixed(3)})`);
      gH.addColorStop(1, 'rgba(220, 0, 30, 0)');
      gpCtx.fillStyle = gH;
      gpCtx.beginPath();
      gpCtx.arc(0, 0, glintLen, 0, Math.PI * 2);
      gpCtx.fill();
      gpCtx.restore();

      gpCtx.save();
      gpCtx.translate(GLOW_HALF, GLOW_HALF);
      gpCtx.scale(0.14, 1);
      const gV = gpCtx.createRadialGradient(0, 0, 0, 0, 0, glintLen * 0.64);
      gV.addColorStop(0, `rgba(255, 174, 188, ${((0.36 + 0.36 * twinkle) * a).toFixed(3)})`);
      gV.addColorStop(0.42, `rgba(255, 22, 48, ${(0.24 * a).toFixed(3)})`);
      gV.addColorStop(1, 'rgba(200, 0, 26, 0)');
      gpCtx.fillStyle = gV;
      gpCtx.beginPath();
      gpCtx.arc(0, 0, glintLen * 0.64, 0, Math.PI * 2);
      gpCtx.fill();
      gpCtx.restore();

      gpCtx.restore(); // end synchronous vertical blink clip

      // 4. Exact Z-occlusion cutout behind pillars/arches above this watcher's depth layer
      if (ed.zLayer >= 0 && cfg.silhouetteMode === 'auto') {
        const bx0 = ed.bx - GLOW_HALF / dispScale;
        const by0 = ed.by - GLOW_HALF / dispScale;
        const bw = GLOW_PAD / dispScale;
        const bh = GLOW_PAD / dispScale;
        const x0 = Math.max(0, bx0);
        const y0 = Math.max(0, by0);
        const x1 = Math.min(W, bx0 + bw);
        const y1 = Math.min(H, by0 + bh);
        if (x1 > x0 && y1 > y0) {
          const dx0 = ((x0 - bx0) / bw) * GLOW_PAD;
          const dy0 = ((y0 - by0) / bh) * GLOW_PAD;
          const dw0 = ((x1 - x0) / bw) * GLOW_PAD;
          const dh0 = ((y1 - y0) / bh) * GLOW_PAD;
          gpCtx.globalCompositeOperation = 'destination-out';
          gpCtx.imageSmoothingEnabled = false;
          for (let k = ed.zLayer; k <= 2; k++) {
            const occ = layers['occ' + (k + 1)]?.[fi];
            if (occ) gpCtx.drawImage(occ, x0, y0, x1 - x0, y1 - y0, dx0, dy0, dw0, dh0);
          }
        }
      }

      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(glowPad, Math.round(sx - GLOW_HALF), Math.round(sy - GLOW_HALF));
    }
    ctx.restore();
  }

  function blitToDisplay() {
    if (!canvas || !dctx || !allReady) return;
    resizeDisplay();
    const cw = canvas.width;
    const ch = canvas.height;
    dctx.imageSmoothingEnabled = false;
    dctx.fillStyle = '#040710';
    dctx.fillRect(0, 0, cw, ch);

    const useFit = cfg.framing === 'fit' || cfg.silhouetteMode === 'parade';
    const scale = useFit ? Math.min(cw / W, ch / H) : Math.max(cw / W, ch / H);
    const dw = Math.round(W * scale);
    const dh = Math.round(H * scale);
    const dx = Math.round((cw - dw) * (useFit ? 0.5 : 0.44));
    const dy = Math.round((ch - dh) * 0.50);
    dctx.drawImage(buf, 0, 0, W, H, dx, dy, dw, dh);
    renderEyeBlooms(dctx, Math.min(activeFrameIdx, Math.max(0, NUM_FRAMES - 1)), dx, dy, scale);
  }

  function tick(ts) {
    if (!canvas || !canvas.isConnected) {
      rafId = 0;
      return;
    }
    rafId = root.requestAnimationFrame(tick);
    if (doc.hidden || !cfg.enabled || !allReady) return;

    const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
    lastTs = ts;
    simTime += dt;
    if (userPulse > 0) userPulse = Math.max(0, userPulse - dt * 1.8);

    // Decoupled 15fps sculpted blue fire!
    fireAccum += dt;
    if (fireAccum >= 1 / 15) {
      stepSculptedFire(fireAccum);
      fireAccum = 0;
    }
    // Independent calm AI-frame grain cadence!
    stepAIFrame(dt);
    stepSparks(dt);
    stepWatchers(dt);
    composeFrame();
    blitToDisplay();
  }

  function startLoop() {
    if (!rafId && canvas && canvas.isConnected) {
      lastTs = 0;
      rafId = root.requestAnimationFrame(tick);
    }
  }

  function onUserAction(kind) {
    userPulse = Math.min(1.0, userPulse + 0.72);
    for (const st of pocketStates) {
      if (st.phase === 'watching' || st.phase === 'emerging') {
        st.glintFlare = Math.min(1.0, st.glintFlare + 0.85);
      }
    }
    if (cfg.silhouetteMode === 'auto' && Math.random() < 0.45) {
      const hidden = pocketStates.filter((s) => s.phase === 'hidden');
      const active = pocketStates.filter((s) => s.phase !== 'hidden').length;
      if (hidden.length && active < 3) {
        const pick = hidden[Math.floor(Math.random() * hidden.length)];
        pick.timer = Math.min(pick.timer, 0.35);
      }
    }
    if (kind === 'busy-start') cfg.busyBoost = true;
    else if (kind === 'busy-end') cfg.busyBoost = false;
  }

  function init() {
    canvas = doc.getElementById('dungeon-bg-canvas');
    if (!canvas) return;
    dctx = canvas.getContext('2d', { alpha: false });
    loadAssets(() => {
      for (let i = 0; i < 16; i++) {
        simTime += 0.066;
        stepSculptedFire(0.066);
      }
      composeFrame();
      blitToDisplay();
      startLoop();
    });
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();

  root.__dfoDungeonScene = {
    cfg,
    onUserAction,
    _pockets: pocketStates,
    _step(dt) {
      const d = Number(dt) || 0;
      simTime += d;
      stepWatchers(d);
      composeFrame();
      blitToDisplay();
    },
    setConfig(patch) {
      Object.assign(cfg, patch || {});
      if (canvas) canvas.style.display = cfg.enabled ? 'block' : 'none';
      if (allReady && cfg.enabled) {
        if (cfg.lightOverride !== 'auto') {
          const n = Number(cfg.lightOverride);
          if (!Number.isNaN(n) && n >= 0 && n < NUM_FRAMES) activeFrameIdx = n;
        }
        composeFrame();
        blitToDisplay();
      }
    },
    variants: VARIANT_SPECS,
  };
})(window);
