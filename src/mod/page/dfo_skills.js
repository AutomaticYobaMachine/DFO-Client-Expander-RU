// DFO-Client-Expander — instant skill readiness HUD indicator & loud notification sound.
//
// In vanilla DFO:
//   1. readySkillAdvancementCount (LKe) returns 0 whenever skillAdvancementMinutesRemaining > 0,
//      hiding the bottom-left yellow HUD icon (.hud-adv-skill) for up to 6 in-game hours.
//   2. checkSkillAdvancement (FKe) resets lastSkillCheckTime = now even when 0 skills are ready,
//      so resting 1 hour or fast traveling resets the 6-hour timer right before a skill hits 100%.
//   3. checkSkillAdvancement checks (now - lastSkillCheckTime <= 360), so resting/loitering for
//      exactly 6 hours (360 minutes) fails to advance skills by 1 minute.
//
// This module pairs with the skills.* bundle transforms in transforms.cjs to:
//   - Show the yellow HUD icon (.hud-adv-skill) the exact instant a skill reaches readiness
//     and keep it visible continuously until the player sleeps/loiters/travels 6 hours and
//     the skill actually advances.
//   - Play the custom boosted skill-up sound immediately when a skill reaches readiness
//     and when skills advance.
(() => {
  'use strict';

  if (globalThis.__dfoSkillsInstalled) return;
  globalThis.__dfoSkillsInstalled = true;

  const SFX_URL = '/dfo-mod/skill_up.wav';
  const SOUND_COOLDOWN_MS = 350;

  let audioCtx = null;
  let audioBuffer = null;
  let audioBufferLoading = false;
  let lastSoundAt = 0;

  function getAudioContext() {
    if (!audioCtx) {
      const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (Ctx) {
        try {
          audioCtx = new Ctx();
        } catch (_e) {
          audioCtx = null;
        }
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      try {
        audioCtx.resume().catch(() => {});
      } catch (_e) {}
    }
    return audioCtx;
  }

  function preloadSound() {
    if (audioBuffer || audioBufferLoading) return;
    audioBufferLoading = true;
    try {
      fetch(SFX_URL)
        .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error('HTTP ' + res.status))))
        .then((raw) => {
          const ctx = getAudioContext();
          if (!ctx) {
            audioBufferLoading = false;
            return;
          }
          return ctx.decodeAudioData(raw).then((decoded) => {
            audioBuffer = decoded;
            audioBufferLoading = false;
          });
        })
        .catch(() => {
          audioBufferLoading = false;
        });
    } catch (_e) {
      audioBufferLoading = false;
    }
  }

  function playFallbackHtmlAudio() {
    try {
      const el = new Audio(SFX_URL);
      el.volume = 1.0;
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_e) {}
  }

  function playSkillSound() {
    const now = Date.now();
    if (now - lastSoundAt < SOUND_COOLDOWN_MS) return;
    lastSoundAt = now;

    const ctx = getAudioContext();
    if (ctx && audioBuffer) {
      try {
        const src = ctx.createBufferSource();
        src.buffer = audioBuffer;

        const gain = ctx.createGain();
        gain.gain.value = 1.5;

        src.connect(gain);
        gain.connect(ctx.destination);

        src.start(0);
        return;
      } catch (_e) {}
    }

    // If buffer isn't decoded yet, trigger preload and play via HTMLAudioElement + WebAudio boost if possible.
    preloadSound();
    playFallbackHtmlAudio();
  }

  // Unlock AudioContext on first user interaction so skill sounds never get blocked by autoplay policy.
  function unlockAudioOnce() {
    getAudioContext();
    preloadSound();
  }
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('pointerdown', unlockAudioOnce, { once: true, capture: true, passive: true });
    window.addEventListener('keydown', unlockAudioOnce, { once: true, capture: true, passive: true });
    setTimeout(preloadSound, 200);
  }

  // Force the bottom-left yellow HUD indicator (.hud-adv-skill) to appear immediately
  // without waiting for the next periodic HUD refresh tick.
  function forceShowHudSkillIcon(readyCount) {
    if (typeof document === 'undefined' || !(readyCount > 0)) return;
    try {
      const existing = document.querySelector('.hud-adv-skill');
      if (existing) {
        existing.style.display = '';
        return;
      }
      const stack = document.querySelector('.hud-adv-stack');
      if (!stack) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hud-adv-btn hud-adv-skill';
      btn.setAttribute('aria-label', 'Skills ready');
      btn.innerHTML = '<span class="hud-adv-arrow" aria-hidden="true"></span>';
      btn.addEventListener('click', () => {
        try {
          const charBtn = document.querySelector('[data-hud-action="charsheet"], .hud-char-btn');
          if (charBtn) charBtn.click();
        } catch (_e) {}
      });
      stack.appendChild(btn);
    } catch (_e) {}
  }

  // State tracking per character so loading a save with already-ready skills
  // shows the icon immediately without firing a false-positive sound on load,
  // while any newly ready skill during gameplay immediately plays the sound.
  let trackedEntityKey = null;
  let initializedForEntity = false;
  const readySkillSet = new Set();

  function getEntityKey(entity) {
    if (!entity || typeof entity !== 'object') return null;
    return String(entity.characterId || entity.id || entity.name || 'player');
  }

  function resetTrackingIfEntityChanged(entity) {
    const key = getEntityKey(entity);
    if (key !== trackedEntityKey) {
      trackedEntityKey = key;
      initializedForEntity = false;
      readySkillSet.clear();
    }
  }

  // Called from LKe (readySkillAdvancementCount) whenever the game evaluates how many skills are ready.
  globalThis.__dfoSkillReadySync = function __dfoSkillReadySync(entity, count, progressFn) {
    if (!entity || !entity.chargenDone || !Array.isArray(entity.skillUses)) return;
    if (typeof progressFn === 'function') {
      globalThis.__dfoSkillProgress = progressFn;
    }
    resetTrackingIfEntityChanged(entity);

    const fn = progressFn || globalThis.__dfoSkillProgress;
    if (typeof fn !== 'function') return;

    let newlyReady = false;
    const currentReady = new Set();
    for (let i = 0; i < entity.skillUses.length; i++) {
      let info = null;
      try {
        info = fn(entity, i);
      } catch (_e) {}
      if (info && info.ready) {
        currentReady.add(i);
        if (initializedForEntity && !readySkillSet.has(i)) {
          newlyReady = true;
        }
      }
    }

    readySkillSet.clear();
    for (const idx of currentReady) readySkillSet.add(idx);

    if (!initializedForEntity) {
      initializedForEntity = true;
      if (currentReady.size > 0) {
        forceShowHudSkillIcon(currentReady.size);
      }
      return;
    }

    if (newlyReady) {
      forceShowHudSkillIcon(currentReady.size);
      playSkillSound();
    }
  };

  // Called from Ct (tallySkill) the exact moment a skill's use counter increases.
  globalThis.__dfoSkillTallied = function __dfoSkillTallied(entity, skillIdx) {
    if (!entity || !entity.chargenDone || !Array.isArray(entity.skillUses)) return;
    if (!Number.isInteger(skillIdx) || skillIdx < 0) return;

    resetTrackingIfEntityChanged(entity);
    const fn = globalThis.__dfoSkillProgress;
    if (typeof fn !== 'function') return;

    // Seed baseline set on first tally if LKe hasn't run yet for this character.
    if (!initializedForEntity) {
      for (let i = 0; i < entity.skillUses.length; i++) {
        if (i === skillIdx) continue;
        try {
          if (fn(entity, i)?.ready) readySkillSet.add(i);
        } catch (_e) {}
      }
      initializedForEntity = true;
    }

    let info = null;
    try {
      info = fn(entity, skillIdx);
    } catch (_e) {}

    if (info && info.ready && !readySkillSet.has(skillIdx)) {
      readySkillSet.add(skillIdx);
      forceShowHudSkillIcon(readySkillSet.size);
      playSkillSound();
    }
  };

  // Called from FKe (checkSkillAdvancement) when 1 or more skills actually level up after resting/traveling.
  globalThis.__dfoSkillRaised = function __dfoSkillRaised(entity, raisedList) {
    if (!Array.isArray(raisedList) || raisedList.length === 0) return;
    resetTrackingIfEntityChanged(entity);
    for (const item of raisedList) {
      const idx = Number.isInteger(item) ? item : item?.skillIdx;
      if (Number.isInteger(idx)) {
        readySkillSet.delete(idx);
      }
    }
    playSkillSound();
  };

  // Expose manual test/trigger helper.
  globalThis.__dfoPlaySkillSound = playSkillSound;
})();
