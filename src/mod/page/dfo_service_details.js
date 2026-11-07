/* Read-only explanations of the published client's laws. No cast, roll, purchase
 * or item mutation is performed here. See docs/service-windows.md for sources. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.__dfoServiceDetails = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  /** The install's words (dfo_ui_text.js: src/mod/item-text/<en|ru>/ui/svc.csv), the key itself before they load. */
  const T = (key, params) =>
    globalThis.__dfoUi ? globalThis.__dfoUi.t(key, params) : key;
  const n = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0),
    per = (x) => Math.max(1, n(x)),
    fmt = (x) =>
      Number(x).toLocaleString(globalThis.__dfoUi?.tag ?? "en-US", {
        maximumFractionDigits: 2,
      }),
    range = (a, b) => (a === b ? fmt(a) : fmt(a) + "–" + fmt(b));
  /** A word picked by a sub-type: svc.<area>.<sub>, or svc.<area>.other past the list's end. */
  const word = (area, sub, count) =>
    T(
      `svc.${area}.${Number.isInteger(sub) && sub >= 0 && sub < count ? sub : "other"}`,
    );
  const mechanics = {
    0: "svc.mechanic.0",
    1: "svc.mechanic.1",
    2: "svc.mechanic.2",
    3: "svc.mechanic.3",
    4: "svc.mechanic.4",
    5: "svc.mechanic.5",
    6: "svc.mechanic.6",
    7: "svc.mechanic.7",
    8: "svc.mechanic.8",
    9: "svc.mechanic.9",
    10: "svc.mechanic.10",
    11: "svc.mechanic.11",
    12: "svc.mechanic.12",
    13: "svc.mechanic.13",
    14: "svc.mechanic.14",
    15: "svc.mechanic.15",
    16: "svc.mechanic.16",
    17: "svc.mechanic.17",
    18: "svc.mechanic.18",
    19: "svc.mechanic.19",
    20: "svc.mechanic.20",
    21: "svc.mechanic.21",
    22: "svc.mechanic.22",
    23: "svc.mechanic.23",
    24: "svc.mechanic.24",
    25: "svc.mechanic.25",
    26: "svc.mechanic.26",
    27: "svc.mechanic.27",
    28: "svc.mechanic.28",
    29: "svc.mechanic.29",
    30: "svc.mechanic.30",
    31: "svc.mechanic.31",
    33: "svc.mechanic.33",
    34: "svc.mechanic.34",
    35: "svc.mechanic.35",
    39: "svc.mechanic.39",
    40: "svc.mechanic.40",
    43: "svc.mechanic.43",
    44: "svc.mechanic.44",
    45: "svc.mechanic.45",
    46: "svc.mechanic.46",
  };
  function mechanic(type, sub) {
    const text = mechanics[type];
    if (!text) return null;
    const one = Number.isInteger(sub) && sub >= 0 && sub < 8;
    const replace = {
      vital: word("vital", sub, 3),
      attr: word("attr", sub, 8),
      cure: word("cure", sub, 3),
      heal:
        sub < 8
          ? one
            ? T("svc.heal.attr", { attr: word("attr", sub, 8) })
            : T("svc.heal.attrAny")
          : sub === 8
            ? T("svc.heal.health")
            : T("svc.heal.stamina"),
      transfer:
        sub < 8
          ? one
            ? T("svc.transfer.attr", { attr: word("attr", sub, 8) })
            : T("svc.transfer.attrAny")
          : sub === 8
            ? T("svc.heal.health")
            : T("svc.heal.stamina"),
      dispel: word("dispel", sub, 3),
      detect: word("detect", sub, 3),
      conceal: T(
        `svc.conceal.${sub < 0 ? "both" : sub === 0 ? "normal" : "true"}`,
      ),
    };
    return T(text, replace);
  }
  function spell(effect, settings, level) {
    if (!effect || typeof effect !== "object") return null;
    const type = Number(effect.type ?? String(effect.key ?? "").split(",")[0]),
      sub = Number(effect.subType ?? String(effect.key ?? "").split(",")[1]);
    if (!Number.isInteger(type) || !Number.isInteger(sub)) return null;
    let text = mechanic(type, sub);
    if (!text) return null;
    if (type === 11)
      text =
        sub < 8
          ? T("svc.drain.attr", {
              attr:
                Number.isInteger(sub) && sub >= 0
                  ? word("attr", sub, 8)
                  : T("svc.attr.any"),
            })
          : sub === 8
            ? T('svc.drain.health')
            : T('svc.drain.stamina');
    const s = settings ?? {},
      L = Math.max(1, Math.trunc(n(level) || 1)),
      stats = [],
      formula = [],
      notes = [];
    const required = [
      ...(effect.duration
        ? ["durationBase", "durationMod", "durationPerLevel"]
        : []),
      ...(effect.chance ? ["chanceBase", "chanceMod", "chancePerLevel"] : []),
      ...(effect.magnitude
        ? [
            "magnitudeBaseLow",
            "magnitudeBaseHigh",
            "magnitudeLevelBase",
            "magnitudeLevelHigh",
            "magnitudePerLevel",
          ]
        : []),
    ];
    if (required.some((k) => s[k] == null || !Number.isFinite(Number(s[k]))))
      return null;
    if (effect.duration) {
      const k = Math.max(1, Math.floor(L / per(s.durationPerLevel))),
        D = n(s.durationBase) + n(s.durationMod) * k;
      stats.push([T("svc.stat.duration"), T("svc.value.rounds", { n: fmt(D) })]);
      formula.push(
        "D = " +
          n(s.durationBase) +
          " + " +
          n(s.durationMod) +
          " × max(1, ⌊" +
          L +
          "/" +
          per(s.durationPerLevel) +
          "⌋) = " +
          fmt(D) +
          ".",
      );
      notes.push(
        T('svc.note.round'),
      );
      if (type === 2) {
        stats.push([
          T('svc.stat.itemLife'),
          T("svc.value.gameMinutes", { n: fmt(Math.max(0, D - 1)) }),
        ]);
        formula.push(
          T('svc.formula.itemLife'),
        );
      }
    } else
      stats.push([
        T('svc.stat.durationNone'),
        [16, 17].includes(type)
          ? T('svc.duration.door')
          : type === 7 || (type === 11 && sub < 8)
            ? T('svc.duration.attr')
            : T('svc.duration.instant'),
      ]);
    if (effect.magnitude) {
      const k = Math.floor(L / per(s.magnitudePerLevel)),
        lo = n(s.magnitudeBaseLow) + n(s.magnitudeLevelBase) * k,
        hi = n(s.magnitudeBaseHigh) + n(s.magnitudeLevelHigh) * k;
      stats.push([
        type === 35
          ? T('svc.stat.shield')
          : type === 18 || type === 10
            ? T('svc.stat.restore')
            : T('svc.stat.magnitude'),
        range(lo, hi),
      ]);
      formula.push(
        "M = " +
          T("svc.rand") +
          "[" +
          n(s.magnitudeBaseLow) +
          "; " +
          n(s.magnitudeBaseHigh) +
          "] + " +
          T("svc.rand") +
          "[" +
          n(s.magnitudeLevelBase) +
          "; " +
          n(s.magnitudeLevelHigh) +
          "] × ⌊" +
          L +
          "/" +
          per(s.magnitudePerLevel) +
          "⌋ = " +
          range(lo, hi) +
          ".",
      );
    }
    if (effect.chance) {
      const C =
          n(s.chanceBase) +
          n(s.chanceMod) * Math.floor(L / per(s.chancePerLevel)),
        c = Math.max(0, Math.min(type === 20 ? 50 : 100, C));
      stats.push([
        type === 20
          ? T("svc.stat.absorbAt", { level: L })
          : T("svc.stat.chanceAt", { level: L }),
        fmt(c) + "%",
      ]);
      formula.push(
        "C = " +
          n(s.chanceBase) +
          " + " +
          n(s.chanceMod) +
          " × ⌊" +
          L +
          "/" +
          per(s.chancePerLevel) +
          "⌋ = " +
          fmt(C) +
          "%; " +
          (type === 20
            ? T('svc.formula.absorbCap')
            : T('svc.formula.chanceCap')),
      );
    }
    if (effect.magnitude || effect.chance)
      notes.push(
        T('svc.note.notation'),
      );
    if (((type === 1 || type === 4) && sub === 1) || (type === 10 && sub === 9))
      notes.push(
        T('svc.note.stamina64'),
      );
    if (type === 20)
      notes.push(
        T('svc.note.absorbLevel'),
      );
    if (type === 12)
      notes.push(
        T('svc.note.soulTrap'),
      );
    if (type === 6)
      notes.push(
        sub === 0
          ? T('svc.note.dispelMagic')
          : T('svc.note.banish'),
      );
    if (type === 8)
      notes.push(
        T('svc.note.resist'),
      );
    if (type === 33 || type === 34)
      notes.push(
        T('svc.note.calm'),
      );
    if (type === 3 && sub === 0)
      notes.push(
        T('svc.note.cureOrder'),
      );
    if (effect.magnitude)
      notes.push(
        T('svc.note.base'),
      );
    return {
      key: type + "," + sub,
      summary: text,
      stats,
      formula,
      notes,
      level: L,
    };
  }
  const enchantNames = {
    AbsorbsSpells: "svc.enchant.AbsorbsSpells",
    BadReactionsFrom: "svc.enchant.BadReactionsFrom",
    BadRepWith: "svc.enchant.BadRepWith",
    CastWhenHeld: "svc.enchant.CastWhenHeld",
    CastWhenStrikes: "svc.enchant.CastWhenStrikes",
    CastWhenUsed: "svc.enchant.CastWhenUsed",
    ExtraSpellPts: "svc.enchant.ExtraSpellPts",
    ExtraWeight: "svc.enchant.ExtraWeight",
    FeatherWeight: "svc.enchant.FeatherWeight",
    GoodRepWith: "svc.enchant.GoodRepWith",
    HealthLeech: "svc.enchant.HealthLeech",
    ImprovesTalents: "svc.enchant.ImprovesTalents",
    IncreasedWeightAllowance: "svc.enchant.IncreasedWeightAllowance",
    ItemDeteriorates: "svc.enchant.ItemDeteriorates",
    LowDamageVs: "svc.enchant.LowDamageVs",
    PotentVs: "svc.enchant.PotentVs",
    RegensHealth: "svc.enchant.RegensHealth",
    RepairsObjects: "svc.enchant.RepairsObjects",
    SoulBound: "svc.enchant.SoulBound",
    StrengthensArmor: "svc.enchant.StrengthensArmor",
    UserTakesDamage: "svc.enchant.UserTakesDamage",
    VampiricEffect: "svc.enchant.VampiricEffect",
    WeakensArmor: "svc.enchant.WeakensArmor",
    EnhancesSkill: "svc.enchant.EnhancesSkill",
  };
  function enchant(type, param, { name = "", cost = null } = {}) {
    if (!Object.hasOwn(enchantNames, type)) return null;
    const p = param == null ? null : n(param),
      stats = [],
      formula = [],
      notes = [];
    let summary = "";

    switch (type) {
      case "AbsorbsSpells":
        summary =
          T('svc.ench.AbsorbsSpells.summary');
        formula.push(
          T('svc.ench.AbsorbsSpells.formula'),
        );
        break;
      case "EnhancesSkill":
        summary =
          T('svc.ench.EnhancesSkill.summary');
        formula.push(
          T('svc.ench.EnhancesSkill.formula'),
        );
        break;
      case "ExtraSpellPts":
        summary =
          T('svc.ench.ExtraSpellPts.summary');
        formula.push(
          T('svc.ench.ExtraSpellPts.formula'),
        );
        notes.push(
          T('svc.ench.ExtraSpellPts.note'),
        );
        break;
      case "FeatherWeight":
        summary =
          T('svc.ench.FeatherWeight.summary');
        stats.push([T('svc.stat.itemWeight'), T('svc.value.featherWeight')]);
        break;
      case "ExtraWeight":
        summary = T('svc.ench.ExtraWeight.summary');
        formula.push(T('svc.ench.ExtraWeight.formula'));
        break;
      case "IncreasedWeightAllowance":
        summary =
          p == null
            ? T('svc.ench.IncreasedWeightAllowance.summary')
            : T('svc.ench.IncreasedWeightAllowance.one',{pct:p === 1 ? 50 : 25});
        formula.push(
          T('svc.ench.IncreasedWeightAllowance.formula'),
        );
        notes.push(
          T('svc.ench.IncreasedWeightAllowance.note'),
        );
        break;
      case "StrengthensArmor":
        summary =
          T('svc.ench.StrengthensArmor.summary');
        stats.push([T('svc.stat.armorBonus'), "+5"]);
        break;
      case "WeakensArmor":
        summary =
          T('svc.ench.WeakensArmor.summary');
        formula.push(T('svc.ench.WeakensArmor.formula'));
        break;
      case "GoodRepWith":
      case "BadRepWith":
        summary = T('svc.ench.rep.summary',{v:type === "GoodRepWith" ? "+10" : "−10"});
        break;
      case "PotentVs":
      case "LowDamageVs":
        summary = T('svc.ench.damageVs.summary',{v:type === "PotentVs" ? "+5" : "−5"});
        break;
      case "BadReactionsFrom":
        summary =
          T('svc.ench.BadReactionsFrom.summary');
        notes.push(
          T('svc.ench.BadReactionsFrom.note'),
        );
        break;
      case "RegensHealth":
        summary =
          T('svc.ench.RegensHealth.summary');
        formula.push(T('svc.ench.RegensHealth.formula'));
        notes.push(
          T('svc.ench.RegensHealth.note'),
        );
        break;
      case "RepairsObjects":
        summary =
          T('svc.ench.RepairsObjects.summary');
        formula.push(
          T('svc.ench.RepairsObjects.formula'),
        );
        notes.push(
          T('svc.ench.RepairsObjects.note'),
        );
        break;
      case "ItemDeteriorates":
        summary =
          T('svc.ench.ItemDeteriorates.summary');
        stats.push([T('svc.stat.wear'), T('svc.value.wear')]);
        break;
      case "UserTakesDamage":
        summary =
          T('svc.ench.UserTakesDamage.summary');
        break;
      case "VampiricEffect":
        summary =
          p === 1
            ? T('svc.ench.VampiricEffect.hit')
            : p === 0
              ? T('svc.ench.VampiricEffect.drain')
              : T('svc.ench.VampiricEffect.both');
        break;
      case "HealthLeech":
        summary =
          p === 0
            ? T('svc.ench.HealthLeech.use')
            : p === 1 || p === 2
              ? T('svc.ench.HealthLeech.idle',{span:T(p === 1 ? "svc.span.day" : "svc.span.week")})
              : T('svc.ench.HealthLeech.both');
        break;
      case "SoulBound":
        summary =
          T('svc.ench.SoulBound.summary');
        notes.push(
          T('svc.ench.SoulBound.note'),
        );
        break;
      case "CastWhenUsed":
        summary =
          T('svc.ench.CastWhenUsed.summary');
        notes.push(
          T('svc.ench.CastWhenUsed.note'),
        );
        break;
      case "CastWhenStrikes":
        summary =
          T('svc.ench.CastWhenStrikes.summary');
        break;
      case "CastWhenHeld":
        summary =
          T('svc.ench.CastWhenHeld.summary');
        formula.push(
          T('svc.ench.CastWhenHeld.formula'),
        );
        notes.push(
          T('svc.ench.CastWhenHeld.note'),
        );
        break;
      case "ImprovesTalents":
        summary =
          p === 0
            ? T('svc.ench.ImprovesTalents.hearing')
            : p === 1
              ? T('svc.ench.ImprovesTalents.athleticism')
              : p === 2
                ? T('svc.ench.ImprovesTalents.adrenaline')
                : T('svc.ench.ImprovesTalents.any');
        break;
    }
    if (!summary) return null;
    if (cost != null && Number.isFinite(Number(cost))) {
      const C = Number(cost);
      stats.push([
        C < 0 ? T('svc.stat.freesBudget') : T('svc.stat.enchantCost'),
        T("svc.value.points", { n: fmt(Math.abs(C)) }),
      ]);
      notes.push(
        C < 0
          ? T('svc.note.negativeCost')
          : T('svc.note.positiveCost'),
      );
    }
    if (p != null && name) stats.unshift([T('svc.stat.variant'), name]);
    return { type, title: T(enchantNames[type]), summary, stats, formula, notes };
  }
  return Object.freeze({ spell, enchant, mechanic, enchantNames, mechanics });
});
