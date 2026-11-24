// Read-only dungeon forecasts. Native game tables/formulas are supplied by the runtime bridge.
(function (root) {
  'use strict';
  // The mod's own words, in the install's language (page/dfo_ui_text.js; English without the translation). The tables
  // below keep their shape (arrays and maps other scripts index); each word is read in that language when asked for.
  const T = (key, params) => (root.__dfoUi ? root.__dfoUi.t(key, params) : key);
  const words = (prefix, ids, list) => {
    const out = list ? new Array(ids.length) : {};
    ids.forEach((id, i) => Object.defineProperty(out, list ? i : id, { enumerable: true, get: () => T(prefix + id.replace(':', '-')) }));
    return Object.freeze(out);
  };
  const TYPES = words('dungeon.type.', ["crypt", "orcStronghold", "humanStronghold", "prison", "desecratedTemple", "mine", "naturalCave", "coven", "vampireHaunt", "laboratory", "harpyNest", "ruinedCastle", "spiderNest", "giantStronghold", "dragonsDen", "barbarianFortress", "volcanicCaves", "scorpionNest", "cemetery"], true);
  const SHARE = [0.88, 0.88, 0.22, 0.44, 1.0, 0.11, 0.11, 1.0, 1.0, 1.0, 0.44, 0.22, 0.22, 0.88, 1.0, 1.0, 1.0, 0.44, 0.22];
  const FAMILY = words('dungeon.family.', ["undead", "daedra", "dragon", "beast", "brute", "caster", "rogue", "warrior"]);
  const METALS = words('dungeon.metal.', ["iron", "steel", "silver", "elven", "dwarven", "mithril", "adamantium", "ebony", "orcish", "daedric"], true);
  const MATERIALS = words('dungeon.material.', ["metal:silver", "metal:gold", "ore:dwarven", "metal:platinum", "ore:adamantium", "ore:moonstone"]);
  const COLORS = { threat: '#ff8880', loot: '#f1cd70', growth: '#95e79f', renown: '#ffffff', undead: '#c0e5ff', beast: '#69c9e5', daedra: '#ff8880', brute: '#b3dbab', other: '#e5d6b5' };
  const SKULL = '☠\uFE0E'; // Text presentation: emoji glyphs ignore the threat's red fill.
  const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
  const rating = x => Math.round(clamp(x, 1, 5));
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  const weighted = (rows, fn) => rows.length ? rows.reduce((s, r) => s + r.probability * fn(r), 0) : null;
  const call = (fn, ...args) => { try { return typeof fn === 'function' ? fn(...args) : null; } catch { return null; } };
  const number = (n, digits = 1) => finite(n) ? (root.__dfoUi ? root.__dfoUi.number(n, { maximumFractionDigits: digits }) : n.toLocaleString('en-US', { maximumFractionDigits: digits })) : T('dungeon.unknown');

  // Integrate every branch of the native selection law analytically. Never advance the
  // game's shared RNG, generate a dungeon or ask a mutable encounter selector to pick a table.
  function distribution(table, level, alternate = false) {
    const out = new Map();
    if (!Array.isArray(table) || !table.length || !finite(level)) return [];
    const add = (lo, hi, mass) => {
      for (let i = lo; i <= hi; i++) if (Number.isInteger(table[i])) out.set(table[i], (out.get(table[i]) || 0) + mass / (hi - lo + 1));
    };
    if (alternate) {
      const base = Math.trunc(table.length * clamp(level / 20)); add(Math.max(0, base - 4), Math.min(table.length - 1, base + 4), 1);
    } else for (let roll = 1; roll <= 100; roll++) {
      let lo = 0, hi = table.length;
      if (roll > 95 && level <= 5) hi = level + 2;
      else if (roll > 80) hi = level + 1;
      else { lo = level - 3; hi = level + 3; }
      if (lo < 0) { lo = 0; hi = 5; } else if (hi > 19) { lo = 14; hi = 19; }
      add(lo, hi, 0.01);
    }
    return [...out].map(([type, probability]) => ({ type, probability }));
  }

  function eligible(loc) {
    return !!loc?.hasDungeon && Number.isInteger(loc.mapTableData?.dungeonType) && TYPES[loc.mapTableData.dungeonType] !== undefined
      && !loc.superTier && !loc.wildHall && !loc.madeLevel && !loc.arenaFloor && !loc.arenaUndercroft;
  }
  function formatRemaining(ms) {
    if (!finite(ms) || ms <= 0) return T('dungeon.expired');
    const totalMinutes = Math.max(1, Math.floor(ms / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const mm = minutes < 10 ? '0' + minutes : String(minutes);
    return T('dungeon.remaining',{h:hours,m:mm});
  }

  function lifetime(place, tools) {
    const loc = place.loc;
    if (!loc.spawned) return { kind: 'permanent', text: T('dungeon.permanent') };
    const rec = call(tools.spawnRecord, place), at = rec && call(tools.spawnDeath, rec), wall = finite(at) ? call(tools.wallTime, at) : null;
    if (!finite(wall)) return { kind: 'spawned', text: T('dungeon.spawnedUnknown'), cleared: finite(rec?.cleared) };
    const now = call(tools.now) ?? Date.now();
    const expired = wall <= now;
    const remaining = expired ? T('dungeon.expired') : formatRemaining(wall - now);
    const timerText = expired ? T('dungeon.expired') : T('dungeon.vanishesIn',{time:remaining});
    return { kind: 'spawned', text: T('dungeon.spawnedTimer',{timer:timerText}), timerText, remaining, expires: wall, cleared: finite(rec?.cleared), expired };
  }

  function forecast(place, player, tools = {}, note = null) {
    const loc = place?.loc;
    if (!eligible(loc)) return null;
    const type = loc.mapTableData.dungeonType, elite = loc.elite === true, online = tools.online?.() === true;
    const level = call(tools.effectiveLevel, player) ?? player?.level, rank = call(tools.rank, type);
    const choices = call(tools.tables, type) ?? [], tableList = Array.isArray(choices[0]) ? choices : [];
    const mix = new Map(), alternate = call(tools.alternate) === true;
    for (const table of tableList) for (const row of distribution(table, level, alternate)) mix.set(row.type, (mix.get(row.type) || 0) + row.probability / tableList.length);
    const lootOn = call(tools.lootOn) !== false, standing = call(tools.standing, player), share = call(tools.share, type) ?? SHARE[type] ?? 0, placeThreat = call(tools.placeVeteran, rank), hero = call(tools.hero, player);
    const skillIds = tools.skillIds ?? [], bestSkill = Math.max(0, ...skillIds.map(id => player?.skills?.[id] || 0));
    const weapon = call(tools.weapon, player), weaponMetal = finite(weapon?.material) ? weapon.material : null;
    const rows = [...mix].map(([id, probability]) => {
      const basic = tools.basics?.[id], baseLevel = call(tools.enemyLevel, id, level) ?? basic?.level;
      const scale = lootOn ? call(tools.scaling, standing, share, call(tools.foeShare, baseLevel, (id & 128) !== 0), placeThreat, hero) : null;
      const minMetal = basic?.minMetalToHit ?? -1;
      return { type: id, probability, name: call(tools.enemyName, id) || T('dungeon.enemy',{id:id}), level: baseLevel,
        family: call(tools.foeFamily, id), minMetal, boss: basic?.affinity === 'Daedra' || baseLevel >= 18,
        hp: (scale?.healthMult ?? 1) * (elite ? 2 : 1), damage: (scale?.damageMult ?? 1) * (elite ? 2 : 1),
        challenge: baseLevel + (scale?.challengeLevels ?? 0), armor: basic?.armorValue,
        blocked: weaponMetal != null && minMetal >= 0 && weaponMetal < minMetal };
    }).sort((a, b) => b.probability - a.probability || a.type - b.type);
    const ready = rows.length > 0 && Math.abs(weighted(rows, () => 1) - 1) < 1e-6 && rows.every(r => finite(r.level)) && finite(rank) && typeof tools.scaling === 'function' && typeof tools.hero === 'function';
    const families = new Map(); for (const r of rows) families.set(r.family, (families.get(r.family) || 0) + r.probability);
    const dominant = [...families].sort((a, b) => b[1] - a[1])[0];
    const boss = weighted(rows, r => Number(r.boss)), blocked = weaponMetal == null ? null : weighted(rows, r => Number(r.blocked));
    const hp = weighted(rows, r => r.hp), damage = weighted(rows, r => r.damage), meanLevel = weighted(rows, r => r.level);
    const growthReady = Array.isArray(player?.skills) && skillIds.length > 0 && skillIds.every(id => finite(player.skills[id]));
    const growthWeight = !growthReady ? null : bestSkill > 100 ? weighted(rows, r => call(tools.challenge, r.challenge * 5 + 30, bestSkill) ?? 0) : 1.5;
    const luck = call(tools.luck, player), chances = lootOn && finite(rank) ? call(tools.chances, { kind: 'pile', tier: rank, luck: luck ?? 50, qualityMult: elite ? 1.2 : 1, rollerLevel: level, find: call(tools.legendaryFind) ?? 1 }) : null;
    const renown = call(tools.renown), xp = online && finite(renown) ? weighted(rows, r => call(tools.killXp, r.level, renown) ?? 0) : null;
    const xpMax = online && finite(renown) ? call(tools.killXp, 30, renown) : null;
    // These four indices belong to this mod, not to the game's combat/loot rules.
    const threatRaw = 1 + 1.1 * meanLevel / Math.max(5, level) + boss + 0.55 * Math.log2(Math.max(1, hp * damage)) + (blocked ?? 0);
    const lootRaw = 1 + 2.5 * (rank ?? 0) / 18 + boss + (elite ? 0.5 : 0);
    const scores = { threat: ready ? rating(threatRaw) : null, loot: ready ? rating(lootOn ? lootRaw : 1) : null,
      growth: ready && growthReady ? rating(1 + 4 * clamp(growthWeight / 1.5)) : null,
      renown: !online ? 0 : ready && xpMax > 0 && finite(xp) ? Math.round(50 * xp / xpMax) / 10 : null };
    const sizeLabel = call(tools.size, loc, online), size = ({ Small: 'S', Medium: 'M', Large: 'L', small: 'S', medium: 'M', large: 'L' })[sizeLabel] || '?';
    const life = lifetime(place, tools), identity = call(tools.identity, loc), now = call(tools.now) ?? Date.now();
    const day = Math.floor((call(tools.serverNow) ?? now) / 86400000), veins = finite(identity?.id) ? call(tools.veins, { dungeon: identity.id, day, climate: identity.climate, confirmed: identity.climate != null }) : null;
    const aurumId = online ? call(tools.aurumKey, loc) : null, aurum = aurumId ? call(tools.aurumAmount, aurumId) : null;
    const family = call(tools.family, type), signatures = family ? call(tools.signatures, family) ?? [] : [];
    const eliteSlots = online || lootOn ? call(tools.eliteSlots, loc.dungeon?.recordElement?.header?.locationId ?? loc.name ?? '', elite) : 0;
    const rawName = loc.name || T('dungeon.untitled');
    const cleanName = rawName.replace(/\s*\(-?\d+,\s*-?\d+\)$/, '').replace(/^Elite\s+/i, '');
    const title = T('dungeon.title',{type:TYPES[type],rank:rank ?? '?',size:size,name:cleanName});
    return { title, name: cleanName, rawName, type, typeName: TYPES[type], rank, size, elite, online, level, bestSkill, luck, lootOn, alternate,
      life, rows, scores, boss, blocked, hp, damage, meanLevel, growthWeight, weaponMetal, weaponName: weapon?.name,
      ready, choices: tableList.length, family, signatures, chances, xp, renown, identity, veins, aurum, aurumId, share,
      aurumTaken: aurumId ? call(tools.aurumTaken, aurumId) : null, respawn: call(tools.respawn, { elite }), eliteSlots,
      color: dominant?.[1] >= 0.5 ? COLORS[dominant[0]] || COLORS.other : COLORS.other, note,
      metadata: T('dungeon.metadata',{kind:T(elite ? 'dungeon.elite' : 'dungeon.ordinary'),life:life.text}) };
  }

  function cleanNote(value) {
    if (!value || !/^\d{1,10}$/.test(String(value.id)) || !finite(value.at) || value.at < 1) return null;
    const counts = (Array.isArray(value.counts) ? value.counts : []).slice(0, 128).filter(r => r && Number.isInteger(r.type) && r.type >= 0 && r.type <= 65535 && Number.isInteger(r.count) && r.count > 0 && r.count <= 10000).map(r => ({ type: r.type, count: r.count }));
    const count = n => Number.isInteger(n) && n >= 0 && n <= 10000 ? n : null;
    return { id: String(value.id), at: value.at, online: value.online === true, counts, alive: count(value.alive), dead: count(value.dead),
      piles: count(value.piles), corpses: count(value.corpses), doors: count(value.doors), openDoors: count(value.openDoors) };
  }
  const api = { TYPES, SHARE, FAMILY, METALS, MATERIALS, COLORS, SKULL, distribution, eligible, lifetime, formatRemaining, forecast, cleanNote, number };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.__dfoDungeonModel = api;
})(globalThis);
