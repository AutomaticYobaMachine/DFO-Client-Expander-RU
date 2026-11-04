(function (root) {
  'use strict';
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const names = new Intl.Collator('ru');
  const read = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };
  const values = x => x instanceof Map ? [...x.values()] : Array.isArray(x) ? x : x?.values ? [...x.values()] : [];
  const alive = f => !!f?.entity && !f.dead && !f.corpse && !f._gone && !f._absentHere && !f.removed
    && !f.src?.allied && f.companion == null && f.entity.team !== 'PlayerAlly' && f.entity.mobileTeam !== 'PlayerAlly'
    && !(f.src?.reaction === 'passive' && !f.ai?.isHostile);
  function enemyCounts(foes, visit = null) {
    if (!Array.isArray(foes)) return { count: null, elites: null, syncing: true };
    let count = 0, elites = 0, syncing = false;
    const seen = new Set();
    for (const f of foes) {
      if (f?._pupMismatch) { syncing = true; continue; }
      if (!alive(f) || seen.has(f)) continue;
      seen.add(f);count++;
      if (f.entity.eliteFoe === true) elites++;
      visit?.(f);
    }
    return { count, elites, syncing };
  }
  function enemies(foes, tools = {}) {
    const groups = new Map();
    const counts = enemyCounts(foes, f => {
      const e = f.entity, elite = e.eliteFoe === true;
      const type = f.mobileType ?? f.src?.mobileType ?? e.mobileType;
      const base = read(() => tools.enemyName?.(type), `Враг ${type ?? '?'}`);
      const name = e.revenant?.name || e.champion?.name || e.properName || base;
      const mods = [];
      if (elite) mods.push('Элитный');
      else if (e.elite || f.src?.elite) mods.push('Усиление данжа');
      if (f.src?.superTier) mods.push('Высшее усиление');
      if (e.champion) mods.push('Именованный');
      if (e.revenant) mods.push('Ревенант');
      if (f.questBehaviour || f._pupQuest) mods.push('Квестовый');
      if (f.yielded) mods.push('Сдался');
      for (const word of read(() => tools.traits?.(e), [])) if (typeof word === 'string' && !mods.includes(word)) mods.push(word);
      const key = JSON.stringify([type, name, mods]), level = finite(e.level) ? e.level : null;
      let row = groups.get(key);
      if (!row) { row = { key, type, name: String(name), count: 0, elite, mods, minLevel: level, maxLevel: level, health: 0, maxHealth: 0, healthKnown: true };groups.set(key, row); }
      row.count++;
      if (level != null) { row.minLevel = row.minLevel == null ? level : Math.min(row.minLevel, level);row.maxLevel = row.maxLevel == null ? level : Math.max(row.maxLevel, level); }
      if (finite(e.health) && finite(e.maxHealth)) { row.health += Math.max(0, e.health);row.maxHealth += Math.max(0, e.maxHealth); } else row.healthKnown = false;
    });
    return { ...counts, rows: [...groups.values()].sort((a, b) => Number(b.elite) - Number(a.elite) || names.compare(a.name, b.name) || names.compare(a.key, b.key)) };
  }
  function players(session, mapId, online) {
    if (!online) return { count: 1, complete: true, connected: false, note: 'Одиночная игра.' };
    const room = session?.room, found = /^dungeon:m(\d+)(?:[.:]|$)/.exec(room || '');
    if (session?.status !== 'open' || !found || Number(found[1]) !== Number(mapId)) return { count: null, complete: false, connected: false, note: 'Ожидание соединения с комнатой данжа.' };
    const members = session._rooms?.get?.(room), others = members?.size ?? session.peers?.size;
    if (!Number.isSafeInteger(others)) return { count: null, complete: false, connected: true, note: 'Список участников ещё не получен.' };
    const total = Number.isSafeInteger(session.roomCount) ? session.roomCount : others + (session.hidden ? 0 : 1);
    const uncertain = [...values(session.peers)].some(p => p?.unconfirmed?.[room]);
    const complete = !uncertain && (Number.isSafeInteger(session.roomCount) || others < 64);
    return { count: total, complete, connected: true, note: complete ? 'Включая вас; участники этой сетевой комнаты.' : 'Известные клиенту участники. Полнота списка не подтверждена.' };
  }
  function quests(bridge, loc, foes) {
    const machine = bridge?.machine, mapId = loc?.mapTableData?.mapId;
    if (!machine?.quests || !Number.isSafeInteger(mapId)) return [];
    const active = read(() => bridge.questLog?.({ windows: false }), null);
    const activeIds = active ? new Set([...(active.active || []), ...(active.unlogged || [])].map(q => String(q.id))) : null;
    const bound = new Set((foes || []).flatMap(f => f?.questBehaviour?.questUID == null ? [] : [String(f.questBehaviour.questUID)]));
    return values(machine.quests).filter(q => !q.questComplete && (!activeIds || activeIds.has(String(q.uid)))
      && (bound.has(String(q.uid)) || values(q.resources).some(r => r?.siteDetails?.siteType === 2 && r.siteDetails.mapId === mapId)))
      .map(q => ({ uid: String(q.uid), name: String(q.displayName || q.questName || 'Задание'), objectives: active?.active?.find(r => String(r.id) === String(q.uid))?.ql?.objectives?.filter(o => o.state === 'open').map(o => o.text) || [] }));
  }
  function regen(native) {
    if (!finite(native?.now) || !finite(native?.interval)) return { minutes: null, intervalMinutes: null, count: 0, state: 'offline' };
    const stamps = (native.stamps || []).filter(finite), next = stamps.length ? Math.min(...stamps) + native.interval : null;
    return { minutes: next == null ? null : Math.max(0, Math.ceil((next - native.now) / 60000)), intervalMinutes: Math.round(native.interval / 60000), count: stamps.length, state: next == null ? 'idle' : next <= native.now ? 'due' : 'waiting' };
  }
  function aurum(coffer, tools, loc, online) {
    if (!online) return { state: 'offline', amount: null };
    if (typeof tools.aurumKey !== 'function') return { state: 'unknown', amount: null };
    if (!read(() => tools.aurumKey?.(loc))) return { state: 'absent', amount: null };
    const amount = read(() => tools.aurumAmount?.(coffer?.id || tools.aurumKey(loc)));
    if (!coffer) return { state: 'unknown', amount: finite(amount) ? amount : null };
    return { state: coffer.open ? 'taken' : 'unconfirmed', amount: finite(amount) ? amount : null };
  }
  function snapshot(live, world, tools = {}, heading = null) {
    if (!live?.location || !Array.isArray(live.foes)) return null;
    const online = read(() => tools.online?.(), false), enemy = enemies(live.foes, tools);
    return { title: heading?.title || live.location.name || 'Подземелье', subtitle: heading?.subtitle || '', rating: heading?.rating || '', forecast: heading?.model || null,
      enemies: enemy, players: players(read(() => world.presence?.()), live.location.mapTableData?.mapId, online),
      quests: quests(live.questBridge, live.location, live.foes), regen: regen(read(() => live.regen())), aurum: aurum(live.aurum, tools, live.location, online),
      synced: !enemy.syncing, online };
  }
  // The always-visible HUD reads counts only: no quest scan, forecast, names,
  // modifiers, regeneration timers or chest state while the big window is closed.
  function counters(live, world, tools = {}) {
    if (!live?.location) return null;
    return { enemies: enemyCounts(live.foes), players: players(read(() => world.presence?.()), live.location.mapTableData?.mapId, read(() => tools.online?.(), false)) };
  }
  const api = { alive, enemies, players, quests, regen, aurum, snapshot, counters };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.__dfoDungeonLiveModel = api;
})(globalThis);
