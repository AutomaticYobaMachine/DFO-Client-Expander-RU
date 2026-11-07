/* Targeted service-window calibration. Native actions and their ordering stay
 * native. Weak maps live only as long as the parent/picker; no document observer,
 * timer or world/inventory scan is installed. */
(function (root) {
  "use strict";
  if (!root.document || root.__dfoServices) return;
  const doc = root.document,
    details = () => root.__dfoServiceDetails,
    ru = () => root.__DFO_MOD_CFG__?.ru?.on === true,
    // The mod's own words (src/mod/item-text/<en|ru>/ui/svc.csv); the native labels below are translated only with ru.
    T = (key, params) => (root.__dfoUi ? root.__dfoUi.t(key, params) : key);
  const parents = new WeakMap(),
    children = new WeakMap(),
    pickViews = new WeakMap(),
    registered = new WeakSet(),
    reported = new Set();
  let spells = null,
    enchants = null,
    spellRecord = null;
  const words = {
    Gold: "Золото",
    "Your gold": "Ваше золото",
    "Gold cost": "Стоимость",
    "Your max spell points": "Максимум маны",
    "Spell point cost": "Расход маны",
    "Enchantment points": "Очки зачарования",
    "Effect settings": "Параметры эффекта",
    Duration: "Длительность",
    Chance: "Вероятность",
    Magnitude: "Величина",
    Base: "База",
    Plus: "Прибавка",
    "Per level": "Шаг, ур.",
    "Base min": "База: мин.",
    "Base max": "База: макс.",
    "Plus min": "Прибавка: мин.",
    "Plus max": "Прибавка: макс.",
    Done: "Готово",
    "Buy spell": "Купить заклинание",
    "New spell": "Новое заклинание",
    "Name spell": "Назвать",
    Name: "Название",
    Enchant: "Зачаровать",
    Exit: "Закрыть",
    Powers: "Полезные свойства",
    "Side effects": "Недостатки",
    "Add power": "Добавить свойство",
    "Add side effect": "Добавить недостаток",
    "Account balance": "На счёте",
    "Gold carried": "При себе",
    "Loan owed": "Долг",
    "Loan due": "Срок погашения",
    "Loan due by": "Погасить до",
    "Empire account": "Счёт Империи",
    "Silver held": "Серебро при себе",
    "Sold today": "Продано сегодня",
    "The Bank pays": "Курс банка",
    Silver: "Серебро",
    "Loans & property": "Кредиты и имущество",
    "Deposit gold": "Внести золото",
    "Withdraw gold": "Снять золото",
    "Deposit letters": "Внести аккредитивы",
    "Letter of credit": "Выдать аккредитив",
    "Repay loan": "Погасить кредит",
    Borrow: "Взять кредит",
    "Buy house": "Купить дом",
    "Sell house": "Продать дом",
    "Buy ship": "Купить корабль",
    "Sell ship": "Продать корабль",
    "Sell silver": "Продать серебро",
    Confirm: "Подтвердить",
    Cancel: "Отмена",
    Amount: "Сумма",
    "Weapons & armor": "Оружие и броня",
    "Magic items": "Магические предметы",
    "Clothing & misc": "Одежда и прочее",
    Ingredients: "Ингредиенты",
    "On the shelf": "Предложения",
    "Casting cost": "Расход маны",
    "Spells on offer": "Доступно заклинаний",
    Price: "Цена",
    Effects: "Эффекты",
    Target: "Цель",
    Element: "Стихия",
    Choose: "Выбрать",
    Icon: "Значок",
    Cold: "Холод",
    Frost: "Холод",
    Shock: "Молния",
    Fire: "Огонь",
    Poison: "Яд",
    Magic: "Магия",
  };
  function local(s) {
    if (typeof s !== "string") return s;
    if (Object.hasOwn(words, s)) return words[s];
    let m;
    if (/^(?:Bank of|Банк:) (?:The Empire|the Empire)$/.test(s))
      return "Банк Империи";
    if ((m = /^Bank of (.+)$/.exec(s))) return "Банк: " + m[1];
    if ((m = /^Account in (.+)$/.exec(s))) return "Счёт: " + m[1];
    if ((m = /^Buy for (\d+) gp$/.exec(s)))
      return "Купить за " + m[1] + " зол.";
    if ((m = /^(\d+) of (\d+)$/.exec(s))) return m[1] + " из " + m[2];
    if ((m = /^(\d+) gold for each silver$/.exec(s)))
      return m[1] + " зол. за 1 серебро";
    return s;
  }
  function localView(v) {
    const walk = (b) => {
      if (!b || typeof b !== "object") return;
      for (const k of [
        "title",
        "label",
        "sub",
        "hint",
        "empty",
        "placeholder",
        "text",
      ])
        if (typeof b[k] === "string") b[k] = local(b[k]);
      if (b.type === "stats")
        b.items = b.items.map((row) =>
          row.map((x, i) => (i < 2 ? local(x) : x)),
        );
      else if (b.type === "text")
        b.rows = b.rows.map((r) => (typeof r === "string" ? local(r) : r));
      if (b.blocks) b.blocks.forEach(walk);
      if (b.cols) b.cols.forEach((c) => c.forEach(walk));
      if (b.items && b.type !== "stats") b.items.forEach(walk);
    };
    for (const k of ["title", "sub"]) v[k] = local(v[k]);
    v.blocks?.forEach(walk);
    v.foot?.forEach(walk);
    return v;
  }
  function blocks(info) {
    return [
      { type: "text", rows: [info.summary] },
      ...(info.stats?.length ? [{ type: "stats", items: info.stats }] : []),
      ...(info.formula?.length
        ? [
            {
              type: "group",
              title: T('svc.formulas'),
              cls: "dfo-service-formulas",
              blocks: [{ type: "text", rows: info.formula }],
            },
          ]
        : []),
      ...(info.notes?.length ? [{ type: "text", rows: info.notes }] : []),
    ];
  }
  function track(w, kind) {
    let state = parents.get(w);
    if (state) return state;
    state = { kind, group: null, editorKey: "", editorInfo: null };
    parents.set(w, state);
    if (kind === "spellMaker" && typeof w._pickGroup === "function") {
      const native = w._pickGroup;
      w._pickGroup = function (group, ...args) {
        state.group = group;
        return native.call(this, group, ...args);
      };
    }
    return state;
  }
  function bind(w, kind, state) {
    const p = w.picker;
    if (!p || p === w.iconPicker || children.has(p)) return;
    if (kind === "itemMaker" && enchants) {
      const list = w._lists(),
        opts = {
          item: w.selected,
          powers: list.powers,
          sideEffects: list.sideEffects,
          selectingPowers: w.selectingPowers,
          souls: w._souls,
        };
      const type = w._pickerType ?? null,
        rows =
          type == null
            ? enchants.primary(w.selectingPowers, opts).map((type) => {
                const p = enchants.pick(type, opts),
                  costs =
                    p?.kind === "add"
                      ? [p.settings?.enchantCost]
                      : (p?.options ?? []).map((o) => o.settings?.enchantCost);
                return {
                  type,
                  param: null,
                  name: enchants.name(type),
                  cost:
                    costs.length && costs.every((c) => c === costs[0])
                      ? costs[0]
                      : null,
                  costRange: costs.length
                    ? [Math.min(...costs), Math.max(...costs)]
                    : null,
                };
              })
            : (enchants.pick(type, opts)?.options ?? []).map((o) => ({
                type,
                param: o.param,
                name: o.label,
                cost: o.settings?.enchantCost,
              }));
      if (rows.length === p.items.length)
        children.set(p, { kind, rows, owner: w });
    } else if (kind === "spellMaker" && spells) {
      let rows;
      if (state.group) {
        const subs = spells.subgroups(state.group);
        if (
          subs.length === p.items.length &&
          subs.every((e, i) => e.subgroup === p.items[i])
        )
          rows = subs.map((effect) => ({ effect }));
      }
      if (!rows) {
        const groups = spells.groups();
        if (
          groups.length === p.items.length &&
          groups.every((g, i) => g === p.items[i])
        )
          rows = groups.map((g) => ({
            group: g,
            effects: spells.subgroups(g),
          }));
      }
      if (rows) children.set(p, { kind, rows, owner: w });
    }
  }
  function view(kind, w, v) {
    const state = track(w, kind);
    bind(w, kind, state);
    // A transaction's field must be reachable without scrolling through disabled
    // service buttons. Keep the native callbacks, value and key handling.
    if (kind === "bank") {
      const i = v.blocks.findIndex((b) => b?.type === "field" && b.active);
      if (i > 1) v.blocks.splice(1, 0, ...v.blocks.splice(i, 1));
    }
    if (kind === "spellMaker" && w.editor) {
      const ed = w.editor,
        e = ed.deps.effect,
        s = ed.deps.slot?.settings ?? {},
        level = ed.deps.entity?.level ?? 1,
        key = [e?.key, level, ...Object.values(s)].join("|");
      if (key !== state.editorKey) {
        state.editorKey = key;
        state.editorInfo = details()?.spell(e, s, level);
      }
      if (state.editorInfo) {
        const supported = v.blocks.filter(
          (b) =>
            !(b.type === "text") &&
            !(
              b.type === "group" &&
              b.cls === "port-spins" &&
              b.blocks.every((x) => x.disabled)
            ),
        );
        v.blocks = [
          {
            type: "group",
            cls: "dfo-service-description",
            title: T("svc.editorTitle", { level }),
            blocks: blocks(state.editorInfo),
          },
          ...supported,
        ];
        v.size = "wide dfo-effect-editor";
      }
    }
    return ru() ? localView(v) : v;
  }
  function picker(p, active) {
    if (!active?.shell || !details()) return;
    const ctx = children.get(p);
    if (!ctx) return;
    let state = pickViews.get(p);
    if (!state || state.shell !== active.shell) {
      const win = active.shell.querySelector(".pick-win");
      if (!win) return;
      win.classList.add("dfo-service-picker");
      win.setAttribute("role", "dialog");
      win.setAttribute(
        "aria-label",
        ctx.kind === "itemMaker"
          ? T('svc.pick.enchant')
          : T('svc.pick.spellEffect'),
      );
      active.list.setAttribute("role", "listbox");
      const title = doc.createElement("h2");
      title.className = "dfo-service-picker-title";
      title.textContent =
        ctx.kind === "itemMaker" ? T('svc.pick.enchant') : T('svc.pick.effect');
      const panel = doc.createElement("aside");
      panel.className = "dfo-service-help";
      panel.setAttribute("aria-live", "polite");
      panel.id = "dfo-service-help";
      win.prepend(title);
      win.insertBefore(panel, win.lastElementChild);
      state = { shell: active.shell, panel, sel: -2, preview: -1, shown: -1 };
      pickViews.set(p, state);
      active.rows.forEach((r, i) => {
        r.setAttribute("role", "option");
        const effect = ctx.rows[i]?.effect;
        if (ru() && effect && /^(Normal|True)$/.test(effect.subgroup))
          r.querySelector(".pick-label").textContent = variantName(effect);
        if (ru() && ctx.rows[i]?.type === "EnhancesSkill") {
          const label = r.querySelector(".pick-label"),
            map = {
              Harpy: "Язык гарпий",
              Nymph: "Язык нимф",
              Spriggan: "Язык спригганов",
            };
          if (label && map[p.items[i]]) label.textContent = map[p.items[i]];
        }
        r.addEventListener("pointerenter", () => {
          state.preview = i;
          paintHelp(p, ctx, state, i);
        });
        r.addEventListener("pointerleave", () => {
          state.preview = -1;
          paintHelp(p, ctx, state, p.selectedIndex);
        });
      });
    }
    if (state.sel !== p.selectedIndex) {
      active.rows[state.sel]?.setAttribute("aria-selected", "false");
      active.rows[p.selectedIndex]?.setAttribute("aria-selected", "true");
      state.sel = p.selectedIndex;
      state.preview = -1;
    }
    paintHelp(
      p,
      ctx,
      state,
      state.preview >= 0 ? state.preview : p.selectedIndex,
    );
  }
  function variantName(e) {
    // The game's own words for the two variants; Russian only where the translation is on.
    if (!ru()) return e.subgroup || e.name;
    return e.subgroup === "True"
      ? "Истинный"
      : e.subgroup === "Normal"
        ? "Обычный"
        : e.subgroup || e.name;
  }
  function paintHelp(p, ctx, state, index) {
    const level =
      ctx.owner.entity?.level ?? ctx.owner.hooks?.entity?.level ?? 1;
    const stamp = index + "|" + level;
    if (stamp === state.shown) return;
    state.shown = stamp;
    const row = ctx.rows[index];
    if (!row) return;
    const panel = state.panel;
    panel.replaceChildren();
    let info;
    if (ctx.kind === "itemMaker")
      info = details().enchant(row.type, row.param, row);
    else if (row.effect)
      info = details().spell(
        row.effect,
        {
          durationBase: 1,
          durationMod: 1,
          durationPerLevel: 1,
          chanceBase: 1,
          chanceMod: 1,
          chancePerLevel: 1,
          magnitudeBaseLow: 1,
          magnitudeBaseHigh: 1,
          magnitudeLevelBase: 1,
          magnitudeLevelHigh: 1,
          magnitudePerLevel: 1,
        },
        ctx.owner.entity?.level ?? 1,
      );
    else if (row.effects?.length) {
      const first = row.effects[0];
      info = {
        summary: details().mechanic(
          first.type,
          row.effects.length > 1 ? -1 : first.subType,
        ),
        stats: [[T('svc.variants'), row.effects.map(variantName).join(" · ")]],
        formula: [],
        notes: [
          T('svc.pick.note'),
        ],
      };
    }
    if (!info) return;
    const add = (tag, cls, text) => {
      const n = doc.createElement(tag);
      n.className = cls;
      n.textContent = text;
      panel.append(n);
      return n;
    };
    add(
      "h3",
      "dfo-service-help-title",
      row.name ?? row.effect?.name ?? row.group ?? T('svc.pick.describe'),
    );
    add("p", "dfo-service-help-summary", info.summary);
    for (const [k, v] of info.stats ?? []) {
      const line = add("p", "dfo-service-help-stat", ""),
        label = doc.createElement("span"),
        value = doc.createElement("strong");
      label.textContent = k + ": ";
      value.textContent =
        ru() && row.type === "EnhancesSkill"
          ? ({
              Harpy: "Язык гарпий",
              Nymph: "Язык нимф",
              Spriggan: "Язык спригганов",
            }[v] ?? v)
          : v;
      line.append(label, value);
    }
    for (const s of info.formula ?? []) add("p", "dfo-service-help-formula", s);
    for (const s of info.notes ?? []) add("p", "dfo-service-help-note", s);
    if (row.costRange && row.cost == null)
      add(
        "p",
        "dfo-service-help-stat",
        T("svc.costRange", { range: row.costRange.join(" … ") }),
      );
    if (ctx.kind === "spellMaker" && row.effect)
      add(
        "p",
        "dfo-service-help-note",
        T('svc.pick.startSettings'),
      );
    if (
      ctx.kind === "itemMaker" &&
      row.param != null &&
      /^CastWhen/.test(row.type)
    ) {
      const record = spellRecord?.(row.param);
      if (record) {
        add("h3", "dfo-service-help-title", record.name);
        const level = ctx.owner.hooks?.entity?.level ?? 1;
        for (const e of record.effects ?? []) {
          const meta = spells?.effects.find(
            (m) => m.type === e.type && m.subType === (e.subType & 255),
          );
          if (!meta) continue;
          const d = details().spell(meta, e, level);
          if (!d) continue;
          add("h4", "dfo-service-help-title", meta.name);
          add("p", "dfo-service-help-summary", d.summary);
          for (const [k, v] of d.stats)
            add("p", "dfo-service-help-stat", k + ": " + v);
          for (const line of d.formula)
            add("p", "dfo-service-help-formula", line);
        }
      } else
        add(
          "p",
          "dfo-service-help-note",
          T('svc.pick.spellLoading'),
        );
    }
  }
  function report(kind, e) {
    if (reported.has(kind)) return;
    reported.add(kind);
    root.console?.warn?.("[DFO services] " + kind, e);
  }
  const metals = {
    iron: "железо",
    steel: "сталь",
    silver: "серебро",
    elven: "эльфийский металл",
    dwarven: "двемерский металл",
    mithril: "мифрил",
    adamantium: "адамантит",
    orcish: "орочий металл",
    ebony: "эбонит",
    daedric: "даэдрический металл",
    "язык орков": "орочий металл",
    "язык даэдра": "даэдрический металл",
  };
  function tradeLine(line) {
    if (!ru() || !line?.material) return line;
    const material = metals[String(line.material).trim().toLowerCase()];
    return material ? { ...line, material } : line;
  }
  function ports(specs, law) {
    spells = law;
    for (const kind of [
      "bank",
      "bankPurchase",
      "itemMaker",
      "spellMaker",
      "spellShop",
    ]) {
      const spec = specs[kind];
      if (!spec || registered.has(spec)) continue;
      const native = spec.view;
      spec.view = function (w) {
        const v = native.call(this, w);
        try {
          return v ? view(kind, w, v) : v;
        } catch (e) {
          report(kind, e);
          return v;
        }
      };
      registered.add(spec);
    }
  }
  const CSS = `
/* Keep native stone, brass and backgrounds. Only these seven service families. */
:is(.port-bank,.port-bankpurchase,.port-spellmaker,.port-spellshop,.port-itemmaker) .port-win.px-win {max-height:calc(100dvh - 40px);}
:is(.port-bank,.port-bankpurchase,.port-spellmaker,.port-spellshop,.port-itemmaker) :is(.port-head,.port-foot){flex-shrink:0;}
:is(.port-bank,.port-bankpurchase,.port-spellmaker,.port-spellshop,.port-itemmaker) .port-body{font-size:15px;line-height:1.45;gap:16px;}
:is(.port-bank,.port-bankpurchase,.port-spellmaker,.port-spellshop,.port-itemmaker) .port-title{font-size:calc(22px + var(--dfo-title-step,0px));letter-spacing:.055em;line-height:1.2;}
:is(.port-bank,.port-bankpurchase,.port-spellmaker,.port-spellshop,.port-itemmaker) :is(.port-sub,.port-stat dt,.port-fieldlabel,.port-chiplabel,.port-spinlabel){font-size:14px;letter-spacing:.025em;text-transform:none;line-height:1.35;color:#c0b797;}
:is(.port-bank,.port-bankpurchase,.port-spellmaker,.port-spellshop,.port-itemmaker) :is(.port-stat dd,.port-spinvalue){font-size:16px;letter-spacing:0;color:#f0eadd;}
:is(.port-bank,.port-bankpurchase,.port-spellmaker,.port-spellshop,.port-itemmaker) .port-stat{min-width:0;align-items:flex-start;}
:is(.port-bank,.port-bankpurchase,.port-spellmaker,.port-spellshop,.port-itemmaker) .port-stat dt{min-width:0;overflow-wrap:break-word;}
:is(.port-bank,.port-bankpurchase,.port-spellmaker,.port-spellshop,.port-itemmaker) .port-stat dd{flex:0 0 auto;max-width:55%;text-align:right;overflow-wrap:break-word;}
:is(.port-bank,.port-bankpurchase,.port-spellmaker,.port-spellshop,.port-itemmaker) :is(.port-btn,.port-row,.port-tilename){font-size:15px;letter-spacing:.025em;text-transform:none;line-height:1.35;white-space:normal;}
:is(.port-bank,.port-bankpurchase,.port-spellmaker,.port-spellshop,.port-itemmaker) .port-rowwords{min-width:0;overflow-wrap:break-word;}
:is(.port-bank,.port-bankpurchase,.port-spellmaker,.port-spellshop,.port-itemmaker) .port-heading{font-size:calc(15px + var(--dfo-title-step,0px));letter-spacing:.045em;line-height:1.3;}
:is(.port-bank,.port-bankpurchase,.port-spellmaker,.port-spellshop,.port-itemmaker) .port-text{font-size:15px;line-height:1.45;color:#e3dfd2;}
:is(.port-bank,.port-bankpurchase,.port-spellmaker,.port-spellshop,.port-itemmaker) .port-text p{margin:0 0 7px;}
.port-bank .port-win.px-win{width:min(960px,96vw);}.port-bank .port-stats{grid-template-columns:repeat(2,minmax(0,1fr));}
.port-spellmaker .port-win.dfo-effect-editor{width:min(1020px,96vw);}.dfo-service-description{padding:12px 16px;border:1px solid #6e6244;background:rgba(12,14,16,.62);}
.dfo-service-description .port-text,.dfo-service-description .port-text p{font-size:14px;line-height:1.4;}.dfo-service-description .port-stats{grid-template-columns:repeat(auto-fit,minmax(220px,1fr));}
.dfo-service-formulas{gap:2px;padding-top:6px;border-top:1px solid #484432;}.dfo-service-formulas .port-heading{font-size:14px;}
.port-spellmaker .port-group.port-spins{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 18px;}.port-spellmaker .port-spins>.port-heading{grid-column:1/-1;}.port-spellmaker .port-spin{grid-template-columns:minmax(100px,1fr) 32px 54px 32px;gap:5px;}.port-spellmaker .port-spin.off{display:none;}
.port-itemmaker .port-win.px-win{width:min(1120px,96vw);}.port-itemmaker .port-tiles:not(.list){grid-template-columns:repeat(auto-fill,64px);}.port-itemmaker .port-tile:not(.list .port-tile){width:64px;height:64px;}
.pick-shell .pick-win.px-win.dfo-service-picker{width:min(1100px,96vw);max-width:none;max-height:calc(100dvh - 40px);display:grid;grid-template-columns:minmax(240px,.85fr) minmax(360px,1.15fr);grid-template-rows:auto minmax(0,1fr) auto;gap:0;}
.dfo-service-picker-title{grid-column:1/-1;margin:0;padding:16px 22px;font-size:calc(21px + var(--dfo-title-step,0px));letter-spacing:.06em;border-bottom:1px solid #665b42;}
.dfo-service-picker .pick-list{max-height:700px;min-height:250px;overflow-y:auto;min-width:0;}.dfo-service-picker .pick-row{font-size:15px;line-height:1.35;letter-spacing:.015em;padding:10px 12px;white-space:normal;}.dfo-service-picker .pick-label{min-width:0;overflow-wrap:break-word;}
.dfo-service-picker .dlg-acts{grid-column:1/-1;}.dfo-service-help{padding:16px 20px;min-width:0;overflow-y:auto;border-left:1px solid #665b42;color:#e7e1d3;font-size:15px;line-height:1.5;}
.dfo-service-help-title{font-size:calc(19px + var(--dfo-title-step,0px));letter-spacing:.025em;line-height:1.3;margin:0 0 14px;color:#e9d994;}.dfo-service-help p{white-space:normal;overflow-wrap:break-word;margin:0 0 12px;}.dfo-service-help-stat{color:#c0b797;}.dfo-service-help-stat strong{color:#f1e7c7;font-weight:400;}.dfo-service-help-formula{padding:8px 0;border-block:1px solid #413e31;}.dfo-service-help-note{font-size:13px;line-height:1.4;color:#bcb5a4;}
.trade-shell .trade-win.px-win{width:min(1200px,96vw);max-height:calc(100dvh - 40px);}.trade-shell :is(.sb-top,.packfoot){flex-shrink:0;}.trade-shell .sb-top{gap:12px;}.trade-shell .sb-who{min-width:0;}.trade-shell .sb-who h2{font-size:calc(19px + var(--dfo-title-step,0px));letter-spacing:.035em;line-height:1.3;white-space:normal;}
.trade-shell :is(.act,.packtab){font-size:14px;letter-spacing:.025em;line-height:1.3;white-space:normal;}.trade-shell .itemname>span{font-size:calc(14px + var(--dfo-title-step,0px));letter-spacing:0;}.trade-shell .itemname small{font-size:13px;line-height:1.2;}.trade-shell :is(.itemwt,.itemprice){font-size:14px;white-space:nowrap;}.trade-shell .itemprice{min-width:116px;}.trade-shell .itemname{min-width:0;}.trade-shell :is(.meta,.hint){font-size:14px;line-height:1.4;}
body .sb-shell>.px-win{width:min(1100px,96vw);max-height:calc(100dvh - 40px);}.sb-shell .px-journal{grid-template-columns:minmax(260px,.85fr) minmax(0,1.15fr);}.sb-shell .sb-row{font-size:15px;line-height:1.4;letter-spacing:.025em;text-transform:none;}.sb-shell .sb-cost{font-size:16px;flex-shrink:0;}.sb-shell .px-qdetail{font-size:15px;line-height:1.45;min-width:0;}.sb-shell :is(.px-qmeta,.px-note,.meta){font-size:14px;letter-spacing:.02em;}.sb-shell :is(.act,.sb-fx){font-size:15px;line-height:1.4;letter-spacing:.025em;white-space:normal;}
.broker-shell .broker-win{width:min(1240px,96vw);max-height:calc(100dvh - 40px);}.broker-shell .broker-head{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:16px;align-items:center;}.broker-shell .broker-title{min-width:0;}.broker-shell .broker-title h2{font-size:calc(21px + var(--dfo-title-step,0px));letter-spacing:.045em;}.broker-shell .broker-sub{font-size:14px;letter-spacing:.015em;}.broker-shell .broker-purse{font-size:16px;max-width:300px;white-space:normal;text-align:right;line-height:1.4;}.broker-shell .broker-body{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,.85fr);min-height:0;}
.broker-shell .broker-offer{grid-template-columns:44px minmax(0,1fr) 112px;gap:6px 10px;}.broker-shell .broker-offer-body{grid-column:2;grid-row:1;}.broker-shell .broker-price{grid-column:2;grid-row:2;white-space:normal;overflow-wrap:break-word;}.broker-shell .broker-buy{grid-column:3;grid-row:1/span 2;}.broker-shell .broker-frame{grid-row:1/span 2;}.broker-shell :is(.broker-name,.broker-set){white-space:normal;overflow-wrap:break-word;}.broker-shell :is(.broker-offer,.broker-card){min-width:0;}.broker-shell :is(.broker-offer h3,.broker-card h3){font-size:calc(17px + var(--dfo-title-step,0px));letter-spacing:.02em;line-height:1.3;}.broker-shell :is(.broker-offer p,.broker-price,.insignia-what,.insignia-kept,.boundline){font-size:14px;line-height:1.4;letter-spacing:.015em;}.broker-shell .act{font-size:15px;letter-spacing:.025em;white-space:normal;}
.notice-shell .notice-win{width:min(1200px,96vw);max-height:calc(100dvh - 40px);}.notice-shell :is(.notice-head,.notice-foot,.notice-tabs){flex-shrink:0;}.notice-shell :is(.notice-body,.notice-read){min-height:0;overflow-y:auto;}.notice-shell :is(.notice-sub,.notice-meta,.notice-by,.notice-worktoday,.notice-time){font-size:14px;line-height:1.4;letter-spacing:.02em;}.notice-shell :is(.act,button,input,select,textarea){font-size:15px;line-height:1.35;letter-spacing:.015em;}.notice-shell :is(.notice-title h2,.notice-card h3){font-size:calc(18px + var(--dfo-title-step,0px));letter-spacing:.04em;line-height:1.3;}.notice-shell :is(.notice-card,.notice-grid>li){min-width:0;}.notice-shell :is(.notice-text,.notice-snippet,.notice-excerpt){font-size:15px;line-height:1.5;overflow-wrap:break-word;}
@media(max-width:800px){.pick-shell .pick-win.px-win.dfo-service-picker{grid-template-columns:minmax(180px,.8fr) minmax(0,1.2fr)}.dfo-service-help{padding:12px;}.broker-shell .broker-head{grid-template-columns:minmax(0,1fr) auto;}.broker-shell .broker-purse{grid-row:2;grid-column:1/-1;text-align:left;max-width:none;}.broker-shell .broker-body{display:grid;grid-template-columns:1fr;}.trade-shell .itemprice{min-width:92px;}.port-bank .port-stats{grid-template-columns:1fr;}}
@media(max-width:580px){.pick-shell .pick-win.px-win.dfo-service-picker{grid-template-columns:1fr;grid-template-rows:auto minmax(120px,.8fr) minmax(150px,1fr) auto;}.dfo-service-picker-title,.dfo-service-picker .dlg-acts{grid-column:1;}.dfo-service-picker .pick-list{min-height:0;}.dfo-service-help{border-left:0;border-top:1px solid #665b42;}.sb-shell .px-journal{grid-template-columns:1fr;}}
`;
  const style = doc.createElement("style");
  style.id = "dfo-service-windows";
  style.textContent = CSS;
  (doc.head ?? doc.documentElement).append(style);
  root.__dfoServices = Object.freeze({
    ports,
    tradeLine,
    enchantCatalog: (law) => {
      enchants = law;
    },
    spellRegistry: (get) => {
      spellRecord = get;
    },
    picker: (p, active) => {
      try {
        picker(p, active);
      } catch (e) {
        report("picker", e);
      }
    },
    view,
    stats: () => ({ styleRules: style.sheet?.cssRules?.length ?? 0 }),
  });
})(globalThis);
