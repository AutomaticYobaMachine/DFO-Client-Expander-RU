/* Targeted service-window calibration and overhauled NPC Trade (Buy / Sell) UI.
 * Weak maps live only as long as the parent/picker; no document observer,
 * timer or world/inventory scan is installed. */
(function (root) {
  "use strict";
  if (!root.document || root.__dfoServices) return;
  const doc = root.document,
    details = () => root.__dfoServiceDetails,
    ru = () => root.__DFO_MOD_CFG__?.ru?.on === true,
    // The mod's own words (src/mod/item-text/<en|ru>/ui/svc.csv); the native labels below are translated only with ru.
    T = (key, params) => (root.__dfoUi ? root.__dfoUi.t(key, params) : key);
  const scriptBase = (() => {
    try {
      const src = doc.currentScript?.src || "";
      if (src) return src.replace(/[^/\\]+(?:\?.*)?$/, "");
    } catch { }
    return "/dfo-mod/";
  })();
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
    if (s === "The Bank counts your silver...")
      return ru() && root.__dfoUi ? T("svc.bank.silverCounting") : s;
    if (s === "You cannot carry that much gold.")
      return ru() && root.__dfoUi ? T("svc.bank.cannotCarryGold") : s;
    if (s === "Transaction complete.")
      return ru() && root.__dfoUi ? T("svc.bank.txComplete") : s;
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
            title: T("svc.formulas"),
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
  /* =========================================================================
   * OVERHAULED BANK UI
   * ========================================================================= */
  function formatBankNum(n) {
    const sep =
      (root.__dfoUi?.locale || (ru() ? "ru" : "en")) === "ru" ? " " : ",";
    return String(Math.floor(Math.max(0, Number(n) || 0))).replace(
      /\B(?=(\d{3})+(?!\d))/g,
      sep,
    );
  }

  let serviceCoinUid = 0;

  function buildServiceCoinSvg(cls, defsSpec, shapesSpec, fallbackKey) {
    try {
      const ns = "http://www.w3.org/2000/svg";
      const mk = (tag) =>
        doc.createElementNS ? doc.createElementNS(ns, tag) : doc.createElement(tag);
      const p = `dfosc${++serviceCoinUid}_`;
      const resolve = (v) =>
        typeof v === "string" && v.startsWith("@") ? `url(#${p}${v.slice(1)})` : String(v);
      const svg = mk("svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("class", cls);
      svg.setAttribute("aria-hidden", "true");
      const defsEl = mk("defs");
      for (const [tag, attrs, stops] of defsSpec) {
        const g = mk(tag);
        for (const [k, v] of Object.entries(attrs)) {
          g.setAttribute(k, k === "id" ? p + v : String(v));
        }
        for (const [offset, color] of stops) {
          const st = mk("stop");
          st.setAttribute("offset", offset);
          st.setAttribute("stop-color", color);
          g.append(st);
        }
        defsEl.append(g);
      }
      svg.append(defsEl);
      for (const [tag, attrs] of shapesSpec) {
        const part = mk(tag);
        for (const [k, v] of Object.entries(attrs)) {
          part.setAttribute(k, resolve(v));
        }
        svg.append(part);
      }
      return svg;
    } catch {
      const span = doc.createElement("span");
      span.setAttribute("class", cls);
      span.textContent = T(fallbackKey);
      return span;
    }
  }

  function coinSvg(cls = "dfo-item-coin") {
    return buildServiceCoinSvg(
      cls,
      [
        [
          "linearGradient",
          { id: "rim", x1: 0, y1: 0, x2: 1, y2: 1 },
          [["0%", "#fff6bd"], ["38%", "#eab308"], ["78%", "#a16207"], ["100%", "#5c3605"]],
        ],
        [
          "radialGradient",
          { id: "face", cx: "34%", cy: "30%", r: "68%" },
          [["0%", "#fef9c3"], ["42%", "#f5c438"], ["85%", "#b87914"], ["100%", "#7c4b08"]],
        ],
      ],
      [
        ["circle", { cx: 12, cy: 12, r: 9.8, fill: "@rim", stroke: "#0a0704", "stroke-width": 1.15 }],
        ["circle", { cx: 12, cy: 12, r: 7.7, fill: "@face", stroke: "#78490a", "stroke-width": 0.75 }],
        ["circle", { cx: 12, cy: 12, r: 6.2, fill: "none", stroke: "#fef08a", "stroke-width": 0.65, "stroke-dasharray": "1.6 1.2", opacity: 0.85 }],
        ["path", { d: "M7.8 14.3L8.4 9.8L10.3 11.4L12 8.4L13.7 11.4L15.6 9.8L16.2 14.3Z", fill: "#6b3e06", stroke: "#fef08a", "stroke-width": 0.55, "stroke-linejoin": "round" }],
        ["path", { d: "M8.1 15.2H15.9", fill: "none", stroke: "#6b3e06", "stroke-width": 1.15, "stroke-linecap": "round" }],
        ["ellipse", { cx: 8.6, cy: 7.2, rx: 2.1, ry: 0.9, transform: "rotate(-35 8.6 7.2)", fill: "#ffffff", opacity: 0.62 }],
      ],
      "svc.bank.coinGold",
    );
  }

  function silverCoinSvg(cls = "dfo-item-coin dfo-silver-coin") {
    return buildServiceCoinSvg(
      cls,
      [
        [
          "linearGradient",
          { id: "rim", x1: 0, y1: 0, x2: 1, y2: 1 },
          [["0%", "#ffffff"], ["35%", "#cbd5e1"], ["75%", "#64748b"], ["100%", "#1e293b"]],
        ],
        [
          "radialGradient",
          { id: "plate", cx: "34%", cy: "30%", r: "68%" },
          [["0%", "#f8fafc"], ["45%", "#94a3b8"], ["88%", "#475569"], ["100%", "#1e293b"]],
        ],
      ],
      [
        ["path", { d: "M8.1 2.4H15.9L21.6 8.1V15.9L15.9 21.6H8.1L2.4 15.9V8.1Z", fill: "@rim", stroke: "#070a10", "stroke-width": 1.15, "stroke-linejoin": "round" }],
        ["path", { d: "M8.9 4.3H15.1L19.7 8.9V15.1L15.1 19.7H8.9L4.3 15.1V8.9Z", fill: "@plate", stroke: "#334155", "stroke-width": 0.75, "stroke-linejoin": "round" }],
        ["path", { d: "M12 6.8L14.2 10.2L17.4 12L14.2 13.8L12 17.2L9.8 13.8L6.6 12L9.8 10.2Z", fill: "#1e293b", stroke: "#f8fafc", "stroke-width": 0.7, "stroke-linejoin": "round" }],
        ["circle", { cx: 12, cy: 12, r: 1.55, fill: "#f8fafc" }],
        ["path", { d: "M6.5 7.4L9.2 5.4", fill: "none", stroke: "#ffffff", "stroke-width": 1.0, "stroke-linecap": "round", opacity: 0.85 }],
      ],
      "svc.bank.coinSilver",
    );
  }

  function decorateBankWindow(cv) {
    try {
      const win =
        cv?.closest?.(".port-win") || doc.querySelector?.(".port-bank .port-win");
      if (!win) return;
      const stats = win.querySelectorAll
        ? win.querySelectorAll(".port-stat")
        : [];
      const rateLabel = T("svc.bank.rate");
      const silverHeldLabel = T("svc.bank.silverHeld");
      for (const stat of stats) {
        const dt = stat.querySelector?.("dt");
        const dd = stat.querySelector?.("dd");
        if (!dd || dd.dataset?.dfoCoinDecorated === "1") continue;
        const label = (dt?.textContent || "").trim();
        const raw = (dd.textContent || "").trim();

        if (
          label === rateLabel &&
          /(?:золота\s+за\s+1\s+серебро|gold\s+for\s+1\s+silver)/i.test(raw)
        ) {
          try {
            const m = raw.match(/^\s*(\d+)/);
            const rate = m ? m[1] : "5";
            const gSpan = doc.createElement("span");
            gSpan.textContent = rate;
            const gSvg = coinSvg("dfo-item-coin dfo-bank-coin");
            const midSpan = doc.createElement("span");
            midSpan.className = "dfo-bank-coin-sep";
            midSpan.textContent = T("svc.bank.rateForOne");
            const sSvg = silverCoinSvg("dfo-item-coin dfo-bank-coin dfo-silver-coin");
            dd.textContent = "";
            if (dd.dataset) dd.dataset.dfoCoinDecorated = "1";
            dd.classList?.add?.("dfo-bank-coin-val");
            dd.append(gSpan, gSvg, midSpan, sSvg);
          } catch (e) {
            report("decorateBankWindow.rate", e);
          }
          continue;
        }

        if (label === silverHeldLabel) {
          try {
            const valSpan = doc.createElement("span");
            valSpan.textContent = raw.replace(/\s*(?:серебра|silver)$/i, "");
            const sSvg = silverCoinSvg("dfo-item-coin dfo-bank-coin dfo-silver-coin");
            dd.textContent = "";
            if (dd.dataset) dd.dataset.dfoCoinDecorated = "1";
            dd.classList?.add?.("dfo-bank-coin-val", "dfo-bank-silver-val");
            dd.append(valSpan, sSvg);
          } catch (e) {
            report("decorateBankWindow.silver", e);
          }
          continue;
        }

        if (/\bgp\b/i.test(raw)) {
          const match = raw.match(/^(.*?)\s*\bgp\b\s*(.*)$/i);
          if (match) {
            try {
              const numPart = match[1];
              const tailPart = match[2];
              const numSpan = doc.createElement("span");
              numSpan.textContent = numPart;
              const cSvg = coinSvg("dfo-item-coin dfo-bank-coin");
              let tailSpan = null;
              if (tailPart) {
                tailSpan = doc.createElement("span");
                tailSpan.className = "dfo-bank-coin-tail";
                tailSpan.textContent = tailPart;
              }
              dd.textContent = "";
              if (dd.dataset) dd.dataset.dfoCoinDecorated = "1";
              dd.classList?.add?.("dfo-bank-coin-val");
              dd.append(numSpan, cSvg);
              if (tailSpan) dd.append(tailSpan);
            } catch (e) {
              report("decorateBankWindow.gp", e);
            }
          }
        }
      }
    } catch (e) {
      report("decorateBankWindow", e);
    }
  }

  const bankVisualsCache = new WeakMap();
  const bankOnlineHomesApiCache = new WeakMap();
  const bankOnlineHomesWindowFetch = new WeakMap();

  /** Checks whether a vanilla or online home record represents an owned property. */
  function isOwnedHomeEntry(h) {
    if (!h || typeof h !== "object") return false;
    if ((Number(h.buildingKey) || 0) > 0) return true;
    if (h.mine === true) return true;
    return !("buildingKey" in h) && (Number(h.mapId) || 0) > 0;
  }

  /** Fetches/caches account properties from DFO Online `/v1/homes/mine` and returns any known list synchronously. */
  function resolveBankOnlineHomes(w, homesApi, onlineHomes) {
    if (!homesApi || typeof homesApi.mine !== "function") return null;
    let state = bankOnlineHomesApiCache.get(homesApi);
    if (!state) {
      state = { homes: null, inflight: false };
      bankOnlineHomesApiCache.set(homesApi, state);
    }
    const ver =
      typeof onlineHomes?.version === "function"
        ? Number(onlineHomes.version())
        : null;
    const hasVer = ver !== null && Number.isFinite(ver);
    const winState = w ? bankOnlineHomesWindowFetch.get(w) : null;
    const needsFetch =
      !winState ||
      winState.api !== homesApi ||
      (hasVer && winState.version !== ver);
    if (needsFetch && !state.inflight) {
      if (w) {
        bankOnlineHomesWindowFetch.set(w, {
          api: homesApi,
          version: hasVer ? ver : null,
        });
      }
      state.inflight = true;
      try {
        Promise.resolve(homesApi.mine()).then(
          (res) => {
            state.inflight = false;
            if (res?.ok && Array.isArray(res.data?.homes)) {
              state.homes = res.data.homes.filter(isOwnedHomeEntry);
            } else if (res && res.ok === false && res.error === "no-session") {
              state.homes = [];
            }
          },
          () => {
            state.inflight = false;
          },
        );
      } catch {
        state.inflight = false;
      }
    }
    return state.homes;
  }

  /** Counts unique owned properties across vanilla `X.houses` (with `.more`) and online account homes. */
  function countUniqueOwnedHouses(rawHouses, accountLists) {
    const keys = new Set();
    let seq = 0;
    const addEntry = (entry, fallbackKey) => {
      if (!isOwnedHomeEntry(entry)) return;
      const mapId = Number(entry.mapId) >>> 0;
      const bk = Number(entry.buildingKey) | 0;
      if (mapId > 0 && bk > 0) {
        keys.add(`${mapId}:${bk}`);
      } else if (bk > 0) {
        keys.add(`bk:${Number(entry.regionIndex ?? entry.region ?? 0) | 0}:${bk}`);
      } else {
        keys.add(fallbackKey);
      }
    };

    if (Array.isArray(rawHouses)) {
      const hasHouseSchema = rawHouses.some(
        (h) =>
          h &&
          typeof h === "object" &&
          ("buildingKey" in h || "mapId" in h || "mine" in h),
      );
      if (hasHouseSchema) {
        for (let i = 0; i < rawHouses.length; i++) {
          const h = rawHouses[i];
          if (!h || typeof h !== "object") continue;
          addEntry(h, `local:${i}`);
          if (Array.isArray(h.more)) {
            for (let j = 0; j < h.more.length; j++) {
              addEntry(h.more[j], `local:${i}:${j}`);
            }
          }
        }
      } else {
        for (let i = 0; i < rawHouses.length; i++) {
          const h = rawHouses[i];
          if (!h) continue;
          const id = typeof h === "object" && h.id != null ? String(h.id) : null;
          keys.add(id !== null ? `id:${id}` : `idx:${i}`);
        }
      }
    } else if (rawHouses && typeof rawHouses === "object") {
      for (const k of Object.keys(rawHouses)) {
        keys.add(`obj:${k}`);
      }
    }

    for (const list of accountLists) {
      if (!Array.isArray(list)) continue;
      for (const h of list) {
        addEntry(h, `acc:${seq++}`);
      }
    }
    return keys.size;
  }

  function getBankData(w) {
    const labels = typeof w.labels === "function" ? w.labels() : {};
    let accountGold = 0;
    if (labels.account) {
      accountGold =
        parseInt(String(labels.account).replace(/[^\d-]/g, ""), 10) || 0;
    }
    const player = w.hooks?.player;
    const accs =
      (typeof w.accounts === "function" ? w.accounts() : null) ??
      (Array.isArray(w.accounts) ? w.accounts : null) ??
      (typeof w.hooks?.accounts === "function" ? w.hooks.accounts() : null) ??
      (typeof player?.bankAccounts === "function" ? player.bankAccounts() : null) ??
      (Array.isArray(player?.bankAccounts) ? player.bankAccounts : null) ??
      (typeof player?.raw === "function" ? player.raw()?.bankAccounts : null) ??
      (typeof w.hooks?.rawPlayer === "function" ? w.hooks.rawPlayer()?.bankAccounts : null) ??
      [];
    const accountsArr = Array.isArray(accs) ? accs : [];
    const r =
      (typeof w.region === "function" ? w.region() : null) ??
      (typeof w.region === "number" ? w.region : null) ??
      (typeof w.hooks?.regionIndex === "function" ? w.hooks.regionIndex() : 0);
    if (accountGold === 0 && accountsArr[r]) {
      accountGold =
        Number(accountsArr[r].accountGold ?? accountsArr[r].gold ?? 0) || 0;
    }
    let totalBankGold = accountsArr.reduce(
      (sum, a) => sum + (Number(a?.accountGold ?? a?.gold ?? 0) || 0),
      0,
    );
    if (accountGold === 0) {
      if (
        accountsArr[17] &&
        Number(accountsArr[17].accountGold ?? accountsArr[17].gold ?? 0) > 0
      ) {
        accountGold = Number(
          accountsArr[17].accountGold ?? accountsArr[17].gold ?? 0,
        );
      } else if (totalBankGold > 0) {
        accountGold = totalBankGold;
      }
    }
    if (totalBankGold === 0 && accountGold > 0) {
      totalBankGold = accountGold;
    }

    const rawItems =
      (typeof player?.items === "function" ? player.items() : null) ??
      (Array.isArray(player?.items) ? player.items : null) ??
      (typeof player?.raw === "function" ? player.raw()?.items : null) ??
      (typeof w.hooks?.rawPlayer === "function" ? w.hooks.rawPlayer()?.items : null) ??
      (Array.isArray(w.hooks?.items) ? w.hooks.items : null) ??
      [];
    const items = Array.isArray(rawItems) ? rawItems : [];
    const locItems = items.filter((it) => isLetterOfCreditItem(it));
    let locCount = locItems.length;
    let locGold = locItems.reduce(
      (sum, it) =>
        sum + (Number(it.value) || 0) * Math.max(1, Math.floor(Number(it.stackCount) || 1)),
      0,
    );
    if (
      locGold === 0 &&
      typeof player?.totalGold === "function" &&
      typeof player?.gold === "function"
    ) {
      const totalG = Number(player.totalGold()) || 0;
      const purseG = Number(player.gold()) || 0;
      const diff = Math.max(0, totalG - purseG);
      if (diff > 0) {
        locGold = diff;
        if (locCount === 0) locCount = 1;
      }
    }
    if (locGold > 0 && locCount === 0) {
      locCount = 1;
    }

    const rawPurseGold = player
      ? typeof player.gold === "function"
        ? player.gold()
        : Number.isFinite(Number(player.gold))
          ? Number(player.gold)
          : null
      : null;
    const rawGoldPieces =
      rawPurseGold != null &&
        rawPurseGold !== "" &&
        Number.isFinite(Number(rawPurseGold))
        ? Math.max(0, Math.floor(Number(rawPurseGold)))
        : typeof player?.raw === "function" &&
          Number.isFinite(Number(player.raw()?.goldPieces))
          ? Math.max(0, Math.floor(Number(player.raw().goldPieces)))
          : typeof w.hooks?.rawPlayer === "function" &&
            Number.isFinite(Number(w.hooks.rawPlayer()?.goldPieces))
            ? Math.max(0, Math.floor(Number(w.hooks.rawPlayer().goldPieces)))
            : null;
    let purseGold = rawGoldPieces ?? 0;
    if (rawGoldPieces === null && labels.inventory) {
      const m = String(labels.inventory).match(/^(\d[\d\s,]*)/);
      if (m) {
        const invTotal = parseInt(m[1].replace(/[^\d]/g, ""), 10) || 0;
        purseGold = Math.max(0, invTotal - locGold);
      }
    }
    const wagonGold =
      (typeof w.hooks?.wagonGold === "function" ? w.hooks.wagonGold() : null) ??
      (typeof player?.wagonGold === "function" ? player.wagonGold() : null) ??
      0;
    const totalCarriedGold = purseGold + (Number(wagonGold) || 0);

    const rawHouses =
      (typeof w.houses === "function" ? w.houses() : null) ??
      (Array.isArray(w.houses) ? w.houses : null) ??
      (typeof w.hooks?.houses === "function" ? w.hooks.houses() : null) ??
      (Array.isArray(w.hooks?.houses) ? w.hooks.houses : null) ??
      (typeof player?.houses === "function" ? player.houses() : null) ??
      (Array.isArray(player?.houses) ? player.houses : null) ??
      (typeof player?.raw === "function" ? player.raw()?.houses : null) ??
      (typeof w.hooks?.rawPlayer === "function" ? w.hooks.rawPlayer()?.houses : null);
    const explicitAccountHomes =
      (typeof w.hooks?.accountHomes === "function"
        ? w.hooks.accountHomes()
        : null) ??
      (Array.isArray(w.hooks?.accountHomes) ? w.hooks.accountHomes : null);
    const homesApi =
      (typeof w.hooks?.homesApi === "function"
        ? w.hooks.homesApi()
        : w.hooks?.homesApi) ??
      (typeof root.__dfoHost?.homesApi === "function"
        ? root.__dfoHost.homesApi()
        : null);
    const onlineHomes =
      (typeof w.hooks?.onlineHomes === "function"
        ? w.hooks.onlineHomes()
        : w.hooks?.onlineHomes) ??
      (typeof root.__dfoHost?.homes === "function"
        ? root.__dfoHost.homes()
        : null);
    const resolvedOnlineHomes = resolveBankOnlineHomes(w, homesApi, onlineHomes);

    let housesCount = countUniqueOwnedHouses(rawHouses, [
      explicitAccountHomes,
      resolvedOnlineHomes,
    ]);
    if (housesCount === 0) {
      const offers =
        typeof w.hooks?.houseOffers === "function" ? w.hooks.houseOffers() : null;
      if (Array.isArray(offers) && offers.length > 0) {
        housesCount = offers.length;
      } else if (
        (typeof w.hooks?.ownsHouse === "function" && w.hooks.ownsHouse()) ||
        (typeof w.ownsHouse === "function" && w.ownsHouse()) ||
        (typeof player?.ownsHouse === "function" && player.ownsHouse())
      ) {
        housesCount = 1;
      }
    }

    let shipsCount = 0;
    const ownedShipVal =
      (typeof w.ownedShip === "function" ? w.ownedShip() : null) ??
      (typeof w.ownedShip === "number" ? w.ownedShip : null) ??
      (typeof w.hooks?.ownedShip === "function" ? w.hooks.ownedShip() : null) ??
      (typeof w.hooks?.ownedShip === "number" ? w.hooks.ownedShip : null) ??
      (typeof player?.ownedShip === "function" ? player.ownedShip() : null) ??
      (typeof player?.raw === "function" ? player.raw()?.ownedShip : null) ??
      (typeof w.hooks?.rawPlayer === "function" ? w.hooks.rawPlayer()?.ownedShip : null) ??
      (typeof player?.ownedShip === "number" ? player.ownedShip : null) ??
      (typeof player?.ship === "number" ? player.ship : null) ??
      (typeof player?.raw === "function" ? player.raw()?.ship : null);
    if (ownedShipVal !== null && ownedShipVal !== undefined && Number(ownedShipVal) >= 0) {
      shipsCount = 1;
    } else if (
      (typeof w.hooks?.ownsShip === "function" && w.hooks.ownsShip()) ||
      (typeof w.ownsShip === "function" && w.ownsShip()) ||
      (typeof player?.ownsShip === "function" && player.ownsShip()) ||
      w.ownsShip === true ||
      w.hooks?.ownsShip === true
    ) {
      shipsCount = 1;
    }

    const loanDue =
      parseInt(String(labels.loanDue ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
    const loanBy = labels.loanByFull || labels.loanBy || "";

    const marks = w.hooks?.marks;
    const marksOpen = marks && marks.open?.() === true;
    const silverBalance = marks ? (marks.balance?.() ?? 0) : 0;
    const today = marks ? (marks.today?.() ?? {}) : {};
    const silverSoldToday = today.exchanged ?? 0;
    const silverSoldMax = today.exchangedMax ?? 1500;
    const combatToday = today.combat ?? 0;
    const combatMax = today.combatMax ?? 1500;
    const foundToday = today.found ?? 0;
    const findMax = today.findMax ?? 400;
    const gatherToday = today.gathered ?? 0;
    const gatherMax = today.gatherMax ?? 400;
    const goldPerMark = 5;

    const effectiveAccountGold = accountGold > 0 ? accountGold : totalBankGold;

    return {
      accountGold: effectiveAccountGold,
      totalBankGold: totalBankGold > 0 ? totalBankGold : effectiveAccountGold,
      bankGold: totalBankGold > 0 ? totalBankGold : effectiveAccountGold,
      purseGold,
      wagonGold,
      totalCarriedGold,
      locGold,
      locCount,
      housesCount,
      shipsCount,
      loanDue,
      loanBy,
      marksOpen,
      silverBalance,
      silverSoldToday,
      silverSoldMax,
      combatToday,
      combatMax,
      foundToday,
      findMax,
      gatherToday,
      gatherMax,
      goldPerMark,
    };
  }

  const NOTES_CW = 210;
  const NOTES_CH = 170;
  const BANK_SCENE_SCALE = 1.5;
  const BANK_SCENE_W = Math.round(NOTES_CW * BANK_SCENE_SCALE);
  const BANK_SCENE_H = Math.round(NOTES_CH * BANK_SCENE_SCALE);
  const NOTES_POINT_COST_GP = 50000;
  const NOTES_MAX_BOOK_ORNAMENTS = 15; // 0..6 = 7 unique edge tabs, 7..14 = 8 unique bookmarks
  const NOTES_SLOTS = [
    { id: "L1", group: "L", x: 44, y: 88, jy: 0.2, scale: 1.02, mode: "threeQuarter", yaw: 1.16, lettersPerBook: 5, maxBooks: 10, bookStep: 3.05, paperStep: 0.90 },
    { id: "L2", group: "L", x: 72, y: 75, jy: -0.2, scale: 1.02, mode: "spineCam", yaw: -0.12, lettersPerBook: 5, maxBooks: 14, bookStep: 3.00, paperStep: 0.90 },
    { id: "L3", group: "L", x: 106, y: 74, jy: 0.2, scale: 1.00, mode: "front", yaw: 0.02, lettersPerBook: 5, maxBooks: 7, bookStep: 3.10, paperStep: 0.90 },
    { id: "R1", group: "R", x: 142, y: 78, jy: -0.2, scale: 1.03, mode: "spineCam", yaw: 0.43, lettersPerBook: 15, maxBooks: 7, bookStep: 3.10, paperStep: 0.80 },
    { id: "R2", group: "R", x: 165, y: 105, jy: 0.3, scale: 1.08, mode: "front", yaw: -0.28, lettersPerBook: 15, maxBooks: 5, bookStep: 3.20, paperStep: 0.82 },
  ];
  const NOTES_SLOT_MAX_POINTS = NOTES_SLOTS.map(
    (s) => s.maxBooks * s.lettersPerBook + (s.lettersPerBook - 1),
  );
  const NOTES_TOTAL_MAX_POINTS = NOTES_SLOT_MAX_POINTS.reduce((a, b) => a + b, 0);

  const notesWindowSessions = new WeakMap();
  const notesAnimStates = new WeakMap();

  function notesShuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function notesSeededRand(seed, index, salt = 0) {
    let x = (seed ^ Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0;
    x = Math.imul(x ^ (x >>> 15), 0x85ebca6b) >>> 0;
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
    x = (x ^ (x >>> 16)) >>> 0;
    return x / 4294967296;
  }

  function buildNotesSessionProfile(deterministic = false) {
    if (deterministic) {
      return {
        weights: [0.133, 0.134, 0.133, 0.30, 0.30],
        pointSeed: 1337,
        bookmarkOrder: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
        animStartTime: 0,
      };
    }
    // Left group shares sum to 0.40, right group shares sum to 0.60
    const rL = [0.45 + Math.random() * 0.90, 0.45 + Math.random() * 0.90, 0.45 + Math.random() * 0.90];
    const sumL = rL[0] + rL[1] + rL[2];
    const wL = rL.map((v) => (v / sumL) * 0.40);

    const rR = [0.50 + Math.random() * 0.85, 0.50 + Math.random() * 0.85];
    const sumR = rR[0] + rR[1];
    const wR = rR.map((v) => (v / sumR) * 0.60);

    return {
      weights: [wL[0], wL[1], wL[2], wR[0], wR[1]],
      pointSeed: (Math.floor(Math.random() * 0x7fffffff) + 1) >>> 0,
      bookmarkOrder: notesShuffleArray([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]),
      animStartTime: typeof Date === "function" ? Date.now() : 0,
    };
  }

  const NOTES_FALLBACK_SESSION = buildNotesSessionProfile(true);

  function getNotesWindowSession(w) {
    if (!w || typeof w !== "object") return NOTES_FALLBACK_SESSION;
    let prof = notesWindowSessions.get(w);
    if (!prof) {
      prof = buildNotesSessionProfile(false);
      notesWindowSessions.set(w, prof);
    }
    return prof;
  }

  function computeNotesLedgerBookState(gold) {
    const safeGold = Math.max(0, Number(gold) || 0);
    const leftUnits = Math.floor(safeGold / 10000);
    const rightUnits = Math.floor(safeGold / 120000);
    const fullTables = Math.floor(safeGold / 1440000);
    return {
      leftLines: leftUnits > 0 ? ((leftUnits - 1) % 12) + 1 : 0,
      rightRows: rightUnits > 0 ? ((rightUnits - 1) % 12) + 1 : 0,
      bookmarks: Math.min(NOTES_MAX_BOOK_ORNAMENTS, fullTables),
    };
  }

  function computeNotesPlaceBooksAndPapers(slotIdx, pts) {
    const slot = NOTES_SLOTS[slotIdx];
    const clampedPts = Math.max(0, Math.min(NOTES_SLOT_MAX_POINTS[slotIdx], Math.floor(pts)));
    const fullBookPoints = slot.maxBooks * slot.lettersPerBook;
    if (clampedPts < fullBookPoints) {
      return {
        points: clampedPts,
        books: Math.floor(clampedPts / slot.lettersPerBook),
        papers: clampedPts % slot.lettersPerBook,
      };
    }
    return {
      points: clampedPts,
      books: slot.maxBooks,
      papers: Math.min(slot.lettersPerBook - 1, clampedPts - fullBookPoints),
    };
  }

  function computeNotesVisualDistribution(gold, notesSession = NOTES_FALLBACK_SESSION) {
    const safeGold = Math.max(0, Number(gold) || 0);
    const totalPoints = Math.floor(safeGold / NOTES_POINT_COST_GP);
    const pointPiles = [0, 0, 0, 0, 0];
    const weights = notesSession?.weights || NOTES_FALLBACK_SESSION.weights;
    const seed = notesSession?.pointSeed || NOTES_FALLBACK_SESSION.pointSeed;

    const effectiveSteps = Math.min(totalPoints, NOTES_TOTAL_MAX_POINTS);
    let blockSeq = null;
    for (let step = 0; step < effectiveSteps; step++) {
      let wL = 0;
      let wR = 0;
      for (let s = 0; s < 3; s++) if (pointPiles[s] < NOTES_SLOT_MAX_POINTS[s]) wL += weights[s];
      for (let s = 3; s < 5; s++) if (pointPiles[s] < NOTES_SLOT_MAX_POINTS[s]) wR += weights[s];
      if (wL <= 0 && wR <= 0) break;

      // Stratified 10-point blocks (4 Left / 6 Right shuffled per block) preserve 40%/60% group split
      const posInBlock = step % 10;
      if (posInBlock === 0) {
        const bIdx = Math.floor(step / 10);
        blockSeq = [true, true, true, true, false, false, false, false, false, false];
        for (let k = 9; k > 0; k--) {
          const j = Math.floor(notesSeededRand(seed, bIdx * 16 + k, 3) * (k + 1));
          const tmp = blockSeq[k];
          blockSeq[k] = blockSeq[j];
          blockSeq[j] = tmp;
        }
      }

      let pickLeft;
      if (wL > 0 && wR > 0) {
        pickLeft = blockSeq[posInBlock];
      } else {
        pickLeft = wL > 0;
      }

      const startIdx = pickLeft ? 0 : 3;
      const endIdx = pickLeft ? 3 : 5;
      const groupW = pickLeft ? wL : wR;
      const rSlot = notesSeededRand(seed, step, 2) * groupW;

      let acc = 0;
      let chosen = -1;
      for (let s = startIdx; s < endIdx; s++) {
        if (pointPiles[s] < NOTES_SLOT_MAX_POINTS[s]) {
          acc += weights[s];
          if (rSlot <= acc) {
            chosen = s;
            break;
          }
        }
      }
      if (chosen === -1) {
        for (let s = endIdx - 1; s >= startIdx; s--) {
          if (pointPiles[s] < NOTES_SLOT_MAX_POINTS[s]) {
            chosen = s;
            break;
          }
        }
      }
      pointPiles[chosen]++;
    }

    const conv = pointPiles.map((pts, idx) => computeNotesPlaceBooksAndPapers(idx, pts));
    return {
      totalPoints,
      pointPiles,
      paperPiles: conv.map((c) => c.papers),
      bookPiles: conv.map((c) => c.books),
      totalPapers: conv.reduce((a, c) => a + c.papers, 0),
    };
  }

  const SILVER_CW = 210;
  const SILVER_CH = 170;
  const SILVER_SCALES_POS = { x: 105, y: 112 };
  const SILVER_CANDLE_POS = { x: 75, y: 139 };
  const SILVER_PAPER_POS = { x: 105, y: 141 };
  const SILVER_INKWELL_POS = { x: 132, y: 141 };
  const SILVER_WARM_MIX = 0.75;
  const SILVER_PARCHMENT_LINES_PER_SHEET = 8;
  const SILVER_MAX_COINS = 930;
  const SILVER_MAX_INGOTS = 240;
  const SILVER_COIN_UNIT = 100;
  const SILVER_INGOT_UNIT = 1000;
  const SILVER_LINE_GOLD_UNIT = 500;
  const SILVER_SCALE_STEP = 10;
  const SILVER_COIN_UNLOCK_THRESHOLD = 0.30;
  const SILVER_INGOT_UNLOCK_THRESHOLD = 0.40;

  // 31 Dense Left Coin Places across 7 packed rows (Row6 -> Row0); 30% cascading activation far -> near
  const SILVER_LEFT_COIN_SLOTS = [
    { id: "c_r0_1", row: 0, category: "near", label: "R1-1", x: 16.5, y: 143, scaleMul: 1.00 },
    { id: "c_r0_2", row: 0, category: "near", label: "R1-2", x: 31.5, y: 143, scaleMul: 1.00 },
    { id: "c_r0_3", row: 0, category: "near", label: "R1-3", x: 47.5, y: 143, scaleMul: 1.00 },
    { id: "c_r1_1", row: 1, category: "near", label: "R2-1", x: 18, y: 132, scaleMul: 0.93 },
    { id: "c_r1_2", row: 1, category: "near", label: "R2-2", x: 31.5, y: 132, scaleMul: 0.93 },
    { id: "c_r1_3", row: 1, category: "near", label: "R2-3", x: 45, y: 132, scaleMul: 0.93 },
    { id: "c_r1_4", row: 1, category: "near", label: "R2-4", x: 58, y: 132, scaleMul: 0.93 },
    { id: "c_r2_1", row: 2, category: "mid", label: "R3-1", x: 20, y: 120, scaleMul: 0.85 },
    { id: "c_r2_2", row: 2, category: "mid", label: "R3-2", x: 34, y: 120, scaleMul: 0.85 },
    { id: "c_r2_3", row: 2, category: "mid", label: "R3-3", x: 48, y: 120, scaleMul: 0.85 },
    { id: "c_r2_4", row: 2, category: "mid", label: "R3-4", x: 61.5, y: 120, scaleMul: 0.85 },
    { id: "c_r3_1", row: 3, category: "mid", label: "R4-1", x: 21.5, y: 108, scaleMul: 0.77 },
    { id: "c_r3_2", row: 3, category: "mid", label: "R4-2", x: 35, y: 108, scaleMul: 0.77 },
    { id: "c_r3_3", row: 3, category: "mid", label: "R4-3", x: 48.5, y: 108, scaleMul: 0.77 },
    { id: "c_r3_4", row: 3, category: "mid", label: "R4-4", x: 62.5, y: 108, scaleMul: 0.77 },
    { id: "c_r4_1", row: 4, category: "mid", label: "R5-1", x: 23, y: 97, scaleMul: 0.70 },
    { id: "c_r4_2", row: 4, category: "mid", label: "R5-2", x: 35.5, y: 97, scaleMul: 0.70 },
    { id: "c_r4_3", row: 4, category: "mid", label: "R5-3", x: 48, y: 97, scaleMul: 0.70 },
    { id: "c_r4_4", row: 4, category: "mid", label: "R5-4", x: 60.5, y: 97, scaleMul: 0.70 },
    { id: "c_r4_5", row: 4, category: "mid", label: "R5-5", x: 73, y: 97, scaleMul: 0.70 },
    { id: "c_r5_1", row: 5, category: "far", label: "R6-1", x: 24.5, y: 86, scaleMul: 0.64 },
    { id: "c_r5_2", row: 5, category: "far", label: "R6-2", x: 37.5, y: 86, scaleMul: 0.64 },
    { id: "c_r5_3", row: 5, category: "far", label: "R6-3", x: 51, y: 86, scaleMul: 0.64 },
    { id: "c_r5_4", row: 5, category: "far", label: "R6-4", x: 64.5, y: 86, scaleMul: 0.64 },
    { id: "c_r5_5", row: 5, category: "far", label: "R6-5", x: 77.5, y: 86, scaleMul: 0.64 },
    { id: "c_r6_1", row: 6, category: "far", label: "R7-1", x: 26, y: 76, scaleMul: 0.58 },
    { id: "c_r6_2", row: 6, category: "far", label: "R7-2", x: 39, y: 76, scaleMul: 0.58 },
    { id: "c_r6_3", row: 6, category: "far", label: "R7-3", x: 52, y: 76, scaleMul: 0.58 },
    { id: "c_r6_4", row: 6, category: "far", label: "R7-4", x: 65, y: 76, scaleMul: 0.58 },
    { id: "c_r6_5", row: 6, category: "far", label: "R7-5", x: 78, y: 76, scaleMul: 0.58 },
    { id: "c_r6_6", row: 6, category: "far", label: "R7-6", x: 92, y: 76, scaleMul: 0.58 },
  ];

  // 7 Right Perspective Bullion Stacks in 3 rows (Far: 3, Mid: 2, Front: 2)
  const SILVER_RIGHT_INGOT_SLOTS = [
    { id: "i_far_l", row: 2, zone: "far", label: "Far-L", x: 134, y: 81, yaw: 0.08, scale: 0.60, maxIngots: 40 },
    { id: "i_far_c", row: 2, zone: "far", label: "Far-C", x: 158, y: 79, yaw: 0.12, scale: 0.59, maxIngots: 40 },
    { id: "i_far_r", row: 2, zone: "far", label: "Far-R", x: 181, y: 81, yaw: 0.10, scale: 0.57, maxIngots: 40 },
    { id: "i_mid_l", row: 1, zone: "mid", label: "Mid-L", x: 152, y: 107, yaw: 0.07, scale: 0.78, maxIngots: 40 },
    { id: "i_mid_r", row: 1, zone: "mid", label: "Mid-R", x: 179, y: 109, yaw: 0.14, scale: 0.78, maxIngots: 40 },
    { id: "i_front_l", row: 0, zone: "front", label: "Front-L", x: 158, y: 133, yaw: 0.06, scale: 0.88, maxIngots: 40 },
    { id: "i_front_r", row: 0, zone: "front", label: "Front-R", x: 185, y: 135, yaw: 0.14, scale: 0.89, maxIngots: 40 },
  ];

  const SILVER_COIN_PLACE_INVARIANTS = {
    "3": {
      stackCount: 3,
      allowMirror: false,
      offsets: [
        { dx: 0.4, dy: -2.2 },
        { dx: -4.1, dy: 0.88 },
        { dx: 3.69, dy: 1.76 },
      ],
    },
    "4": {
      stackCount: 4,
      allowMirror: true,
      offsets: [
        { dx: -4.8, dy: -2.2 },
        { dx: 2.8, dy: -1.9 },
        { dx: -1.8, dy: 1.2 },
        { dx: 5.6, dy: 1.7 },
      ],
    },
    "2": {
      stackCount: 2,
      allowMirror: true,
      offsets: [
        { dx: -1.8, dy: -1.6 },
        { dx: 1.9, dy: 1.4 },
      ],
    },
    "6": {
      stackCount: 6,
      allowMirror: true,
      offsets: [
        { dx: -6.3, dy: -2.3 },
        { dx: -1.0, dy: -2.8 },
        { dx: 4.3, dy: -2.1 },
        { dx: -3.9, dy: 0.9 },
        { dx: 1.5, dy: 1.4 },
        { dx: 6.5, dy: 1.0 },
      ],
    },
  };
  const SILVER_COIN_LAYOUT_KEYS = ["3", "4", "2", "6"];
  const SILVER_COIN_FAR_LAYOUT_KEYS = ["4", "6"];

  const SILVER_COIN_ROW_CFG = [
    { row: 6, baseCap: 17, maxCap: 55, weight: 30.89, name: "R7" },
    { row: 5, baseCap: 15, maxCap: 50, weight: 22.33, name: "R6" },
    { row: 4, baseCap: 11, maxCap: 42, weight: 16.15, name: "R5" },
    { row: 3, baseCap: 9, maxCap: 36, weight: 11.67, name: "R4" },
    { row: 2, baseCap: 7, maxCap: 32, weight: 8.44, name: "R3" },
    { row: 1, baseCap: 5, maxCap: 28, weight: 6.10, name: "R2" },
    { row: 0, baseCap: 5, maxCap: 25, weight: 4.41, name: "R1" },
  ];

  const SILVER_INGOT_ROW_CFG = [
    { row: 2, baseCap: 8, maxCap: 40, weight: 7.20, name: "Far" },
    { row: 1, baseCap: 8, maxCap: 40, weight: 2.90, name: "Mid" },
    { row: 0, baseCap: 8, maxCap: 40, weight: 1.80, name: "Front" },
  ];

  const silverWindowSessions = new WeakMap();
  const silverAnimStates = new WeakMap();

  function silverCreateRng(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return function () {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  function silverShuffle(arr, rng) {
    const res = [...arr];
    for (let i = res.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = res[i];
      res[i] = res[j];
      res[j] = tmp;
    }
    return res;
  }

  function silverBuildInvariantShares(invKey, rng) {
    if (invKey === "3") {
      const dominantIndex = Math.floor(rng() * 3);
      const domShare = 0.56 + (rng() - 0.5) * 0.08;
      const remShare = 1.0 - domShare;
      const secRatio = 0.58 + (rng() - 0.5) * 0.15;
      const shares = [0, 0, 0];
      shares[dominantIndex] = domShare;
      const other = [0, 1, 2].filter((i) => i !== dominantIndex);
      shares[other[0]] = remShare * secRatio;
      shares[other[1]] = remShare * (1 - secRatio);
      return { shares, dominantIndex, perStackCap: 30 };
    }
    if (invKey === "2") {
      const backShare = 0.58 + rng() * 0.12;
      return { shares: [backShare, 1.0 - backShare], dominantIndex: 0, perStackCap: 45 };
    }
    const tierWeights =
      invKey === "4"
        ? [1.45, 1.38, 0.86, 0.72]
        : [1.48, 1.40, 1.12, 1.04, 0.80, 0.68];
    const n = tierWeights.length;
    const dominantIndex = Math.floor(rng() * Math.max(2, n - 2));
    const raw = tierWeights.map(
      (w, idx) => w * (0.85 + rng() * 0.30) + (idx === dominantIndex ? 0.34 : 0),
    );
    const sum = raw.reduce((a, b) => a + b, 0);
    return { shares: raw.map((v) => v / sum), dominantIndex, perStackCap: 30 };
  }

  function silverBuildPlaceCoinSequence(stackCount, dominantIndex, shares, perStackCap = 30) {
    const seq = [];
    const cur = new Array(stackCount).fill(0);
    const indices = Array.from({ length: stackCount }, (_, i) => i);

    for (let k = 0; k < 90; k++) {
      let pick = -1;
      if (k === 0 && cur[dominantIndex] < perStackCap) {
        pick = dominantIndex;
      } else {
        const eligible = indices.filter((i) => cur[i] < perStackCap);
        let bestDeficit = -999999;
        for (const i of eligible) {
          let target = (k + 1) * shares[i];
          if (i === dominantIndex) target += 0.35;
          const deficit = target - cur[i];
          if (deficit > bestDeficit) {
            bestDeficit = deficit;
            pick = i;
          }
        }
        if (pick === -1) pick = indices.find((i) => cur[i] < perStackCap);
      }
      if (pick == null || pick < 0) pick = 0;
      cur[pick]++;
      seq.push(pick);
    }
    return seq;
  }

  function silverBuildRowGatedStream(
    rowsFarToNear,
    totalMaxItems,
    baseCapById,
    maxCapById,
    rowWeights,
    slotWeightById,
    unlockThreshold,
    rng,
  ) {
    const counts = {};
    const rowBaselineTotal = rowsFarToNear.map((rowSlots) =>
      rowSlots.reduce((sum, s) => sum + (baseCapById[s.id] || 0), 0),
    );
    rowsFarToNear.forEach((rowSlots) =>
      rowSlots.forEach((s) => {
        counts[s.id] = 0;
      }),
    );

    const pickWeightedIdx = (weightsArr) => {
      let totalWeight = 0;
      for (let i = 0; i < weightsArr.length; i++) totalWeight += weightsArr[i];
      let rVal = rng() * totalWeight;
      for (let i = 0; i < weightsArr.length; i++) {
        rVal -= weightsArr[i];
        if (rVal <= 0) return i;
      }
      return weightsArr.length - 1;
    };

    const advanceUnlocked = (curUnlocked) => {
      let unlocked = curUnlocked;
      while (unlocked < rowsFarToNear.length) {
        const newestIdx = unlocked - 1;
        const newestFill = rowsFarToNear[newestIdx].reduce((sum, s) => sum + counts[s.id], 0);
        const threshold = Math.ceil(rowBaselineTotal[newestIdx] * unlockThreshold);
        if (newestFill >= threshold) {
          unlocked++;
        } else {
          break;
        }
      }
      return unlocked;
    };

    const stream = [];
    let unlockedRows = 1;
    const unlockedRowsAtStep = [1];

    for (let step = 0; step < totalMaxItems; step++) {
      unlockedRows = advanceUnlocked(unlockedRows);

      const buildCandidateRows = (predicate) => {
        const out = [];
        for (let r = 0; r < unlockedRows; r++) {
          const slots = rowsFarToNear[r].filter(predicate);
          if (slots.length > 0) {
            out.push({ rowIdx: r, slots });
          }
        }
        return out;
      };

      let candidateRows = buildCandidateRows((s) => counts[s.id] < (baseCapById[s.id] || 1));
      if (candidateRows.length === 0) {
        candidateRows = buildCandidateRows((s) => counts[s.id] < (maxCapById[s.id] || 90));
      }
      if (candidateRows.length === 0) {
        candidateRows = buildCandidateRows(() => true);
      }

      const pickedRowIdx = pickWeightedIdx(
        candidateRows.map((cr) => Math.max(0.0001, rowWeights[cr.rowIdx] || 1.0)),
      );
      const pool = candidateRows[pickedRowIdx].slots;
      const pickedSlotIdx = pickWeightedIdx(
        pool.map((s) => {
          const emptyBoost = counts[s.id] === 0 ? 1.85 : 1.0;
          return (slotWeightById[s.id] || 1.0) * emptyBoost;
        }),
      );
      const pickedId = pool[pickedSlotIdx].id;

      counts[pickedId]++;
      stream.push(pickedId);

      unlockedRows = advanceUnlocked(unlockedRows);
      unlockedRowsAtStep.push(unlockedRows);
    }

    return { stream, unlockedRowsAtStep, rowBaselineTotal };
  }

  function buildSilverSessionProfile(seedOverride) {
    const isDeterministic =
      typeof seedOverride === "number" && Number.isFinite(seedOverride) && seedOverride > 0;
    const seed = isDeterministic
      ? Math.floor(seedOverride) >>> 0
      : (Math.floor(Math.random() * 0x7fffffff) + 1) >>> 0 || 4819;
    const rng = silverCreateRng(seed);

    const coinRowsFarToNear = SILVER_COIN_ROW_CFG.map((cfg) =>
      SILVER_LEFT_COIN_SLOTS.filter((s) => s.row === cfg.row),
    );
    const queue = coinRowsFarToNear.flat();

    const slotProfiles = {};
    const coinBaseCaps = {};
    const coinMaxCaps = {};
    const coinWeights = {};

    const farBag = [];
    const nearBag = [];
    const farCount = SILVER_LEFT_COIN_SLOTS.filter((s) => s.row >= 4).length;
    const nearCount = SILVER_LEFT_COIN_SLOTS.length - farCount;
    while (farBag.length < farCount) {
      silverShuffle(SILVER_COIN_FAR_LAYOUT_KEYS, rng).forEach((k) => farBag.push(k));
    }
    while (nearBag.length < nearCount) {
      silverShuffle(SILVER_COIN_LAYOUT_KEYS, rng).forEach((k) => nearBag.push(k));
    }
    let farCursor = 0;
    let nearCursor = 0;

    SILVER_COIN_ROW_CFG.forEach((cfg) => {
      const rowSlots = SILVER_LEFT_COIN_SLOTS.filter((s) => s.row === cfg.row);
      rowSlots.forEach((slot) => {
        const layoutKey =
          cfg.row >= 4
            ? farBag[farCursor++ % farBag.length]
            : nearBag[nearCursor++ % nearBag.length];
        const layoutDef = SILVER_COIN_PLACE_INVARIANTS[layoutKey];
        const mirrorX = layoutDef.allowMirror && rng() > 0.5 ? -1 : 1;
        const stacks = layoutDef.offsets.map((o) => ({ dx: o.dx * mirrorX, dy: o.dy }));
        const { shares, dominantIndex, perStackCap } = silverBuildInvariantShares(layoutKey, rng);

        const baseWeight = (0.88 + rng() * 0.28) * cfg.weight;
        const jx = (rng() - 0.5) * 0.85 * slot.scaleMul;
        const jy = (rng() - 0.5) * 4.6 * slot.scaleMul;
        const coinSequence = silverBuildPlaceCoinSequence(
          layoutDef.stackCount,
          dominantIndex,
          shares,
          perStackCap,
        );

        const piles = [];
        for (let p = 0; p < 10; p++) {
          piles.push({
            inv: Math.floor(rng() * 5),
            dx: (rng() - 0.5) * 6.4 * slot.scaleMul,
            dy: (1.3 + rng() * 2.2) * slot.scaleMul,
          });
        }
        const dieSeq = Array.from({ length: 90 }, () => Math.floor(rng() * 3));

        slotProfiles[slot.id] = {
          layoutKey,
          stackCount: layoutDef.stackCount,
          stacks,
          baseWeight,
          dominantIndex,
          shares,
          jx,
          jy,
          coinSequence,
          dieSeq,
          cap: cfg.maxCap,
          piles,
        };
        coinBaseCaps[slot.id] = cfg.baseCap;
        coinMaxCaps[slot.id] = cfg.maxCap;
        coinWeights[slot.id] = baseWeight;
      });
    });

    const coinRng = silverCreateRng(seed + 777);
    const coinGated = silverBuildRowGatedStream(
      coinRowsFarToNear,
      SILVER_MAX_COINS,
      coinBaseCaps,
      coinMaxCaps,
      SILVER_COIN_ROW_CFG.map((c) => c.weight),
      coinWeights,
      SILVER_COIN_UNLOCK_THRESHOLD,
      coinRng,
    );

    const ingRng = silverCreateRng(seed + 911);
    const ingotRowsFarToNear = SILVER_INGOT_ROW_CFG.map((cfg) =>
      SILVER_RIGHT_INGOT_SLOTS.filter((s) => s.row === cfg.row),
    );
    const maxBanBag = silverShuffle([0, 1, 2, 4, 5, 7, 9], ingRng);
    const baseBanBag = silverShuffle([0, 0, 1, 2, 2, 3, 4], ingRng);
    const ingBaseCaps = {};
    const ingMaxCaps = {};
    const ingWeights = {};
    let ingIdx = 0;
    SILVER_INGOT_ROW_CFG.forEach((cfg) => {
      SILVER_RIGHT_INGOT_SLOTS.filter((s) => s.row === cfg.row).forEach((s) => {
        const idxBan = ingIdx++;
        const maxBan = maxBanBag[idxBan] + (ingRng() > 0.65 && maxBanBag[idxBan] < 10 ? 1 : 0);
        ingMaxCaps[s.id] = Math.max(29, cfg.maxCap - maxBan);
        ingBaseCaps[s.id] = Math.max(6, 10 - baseBanBag[idxBan]);
        ingWeights[s.id] = (0.88 + ingRng() * 0.28) * cfg.weight;
      });
    });
    const ingotGated = silverBuildRowGatedStream(
      ingotRowsFarToNear,
      SILVER_MAX_INGOTS,
      ingBaseCaps,
      ingMaxCaps,
      SILVER_INGOT_ROW_CFG.map((c) => c.weight),
      ingWeights,
      SILVER_INGOT_UNLOCK_THRESHOLD,
      ingRng,
    );

    const sheetRng = silverCreateRng(seed + 31337);
    const sheetCopies = Array.from({ length: 16 }, (_, idx) => {
      const sign = idx % 2 === 0 ? 1 : -1;
      return {
        dx: sign * (1.8 + sheetRng() * 2.4),
        dy: (sheetRng() - 0.5) * 2.0,
        dYaw: sign * (0.04 + sheetRng() * 0.11),
        lineSeed: Math.floor(sheetRng() * 1000),
        tone: sheetRng(),
        ribbonSide: sheetRng() > 0.5 ? 1 : -1,
      };
    });

    const topSheetSeed = Math.floor(sheetRng() * 1000);
    const stoneSpecks = Array.from({ length: 36 }, () => ({
      x: Math.floor(rng() * SILVER_CW),
      y: Math.floor(rng() * 70),
      a: 0.04 + rng() * 0.07,
      w: rng() > 0.7 ? 2 : 1,
    }));

    return {
      seed,
      animStartTime: isDeterministic ? 0 : typeof Date === "function" ? Date.now() : 0,
      queue,
      coinRowsFarToNear,
      coinRowBaselines: coinGated.rowBaselineTotal,
      coinUnlockedRowsAtStep: coinGated.unlockedRowsAtStep,
      globalCoinStream: coinGated.stream,
      slotProfiles,
      ingotRowsFarToNear,
      ingotRowBaselines: ingotGated.rowBaselineTotal,
      ingotUnlockedRowsAtStep: ingotGated.unlockedRowsAtStep,
      ingotPlaceCaps: ingMaxCaps,
      globalIngotStream: ingotGated.stream,
      sheetCopies,
      topSheetSeed,
      stoneSpecks,
    };
  }

  const SILVER_FALLBACK_SESSION = buildSilverSessionProfile(4819);

  function getSilverWindowSession(w) {
    if (!w || typeof w !== "object") return SILVER_FALLBACK_SESSION;
    let prof = silverWindowSessions.get(w);
    if (!prof) {
      prof = buildSilverSessionProfile();
      silverWindowSessions.set(w, prof);
    }
    return prof;
  }

  function computeSilverSceneVisuals(
    silverBalance,
    session = SILVER_FALLBACK_SESSION,
    goldPerMark = 5,
  ) {
    const prof = session || SILVER_FALLBACK_SESSION;
    const silver = Math.max(0, Math.round(Number(silverBalance) || 0));
    const safeGoldPerMark = Math.max(1, Number(goldPerMark) || 5);
    const goldEq = silver * safeGoldPerMark;

    const scaleCycleSilver = Math.max(10, SILVER_COIN_UNIT);
    const scaleCoinsPerStep = Math.max(1, SILVER_SCALE_STEP);
    const scaleMaxSlot = Math.max(1, Math.min(9, Math.floor(scaleCycleSilver / scaleCoinsPerStep) - 1));
    const remainderSilver = silver % scaleCycleSilver;
    const scaleCoins = Math.min(9, Math.floor(remainderSilver / scaleCoinsPerStep));

    const leftPlacesCoins = Math.min(SILVER_MAX_COINS, Math.floor(silver / SILVER_COIN_UNIT));
    const coinBudgets = {};
    prof.queue.forEach((s) => {
      coinBudgets[s.id] = 0;
    });
    for (let i = 0; i < leftPlacesCoins; i++) {
      const id = prof.globalCoinStream[i];
      if (id) coinBudgets[id]++;
    }

    const unlockedCoinRows =
      leftPlacesCoins > 0
        ? prof.coinUnlockedRowsAtStep[leftPlacesCoins] || prof.coinRowsFarToNear.length
        : 0;
    const nearScatterPiles = Math.floor(leftPlacesCoins / 45);
    const farScatterPiles =
      leftPlacesCoins >= 140 ? Math.floor((leftPlacesCoins - 100) / 45) : 0;

    const rightIngotsTotal = Math.min(SILVER_MAX_INGOTS, Math.floor(silver / SILVER_INGOT_UNIT));
    const ingotBudgets = {};
    SILVER_RIGHT_INGOT_SLOTS.forEach((s) => {
      ingotBudgets[s.id] = 0;
    });
    for (let k = 0; k < rightIngotsTotal; k++) {
      const id = prof.globalIngotStream[k];
      if (id) ingotBudgets[id]++;
    }

    const unlockedIngotRows =
      rightIngotsTotal > 0
        ? prof.ingotUnlockedRowsAtStep[rightIngotsTotal] || prof.ingotRowsFarToNear.length
        : 0;

    const totalLines = Math.floor(goldEq / Math.max(50, SILVER_LINE_GOLD_UNIT));
    const completedSheets =
      totalLines > SILVER_PARCHMENT_LINES_PER_SHEET
        ? Math.floor((totalLines - 1) / SILVER_PARCHMENT_LINES_PER_SHEET)
        : 0;
    const activeSheetLines =
      totalLines > 0 ? ((totalLines - 1) % SILVER_PARCHMENT_LINES_PER_SHEET) + 1 : 0;

    const scaleNorm = Math.min(1, scaleCoins / Math.max(1, scaleMaxSlot));
    const targetTilt = scaleCoins <= 0 ? 0 : -(0.04 + scaleNorm * 0.19);

    return {
      silver,
      goldEq,
      scaleCycleSilver,
      scaleMaxSlot,
      scaleCoins,
      leftPlacesCoins,
      unlockedCoinRows,
      coinBudgets,
      nearScatterPiles,
      farScatterPiles,
      rightIngotsTotal,
      unlockedIngotRows,
      ingotBudgets,
      totalLines,
      completedSheets,
      activeSheetLines,
      targetTilt,
    };
  }

  function getCachedBankVisuals(w, data) {
    const goldKey = data.accountGold > 0 ? data.accountGold : (data.bankGold || 0);
    const sig =
      String(goldKey) +
      ":" +
      String(data.totalBankGold || 0) +
      ":" +
      String(data.locGold) +
      ":" +
      String(data.locCount) +
      ":" +
      String(data.silverBalance) +
      ":" +
      String(data.goldPerMark || 5);
    const cached = bankVisualsCache.get(w);
    if (cached && cached.sig === sig) return cached.visuals;
    const visuals = computeBankVisuals(
      data,
      getNotesWindowSession(w),
      getSilverWindowSession(w),
    );
    visuals.sig = sig;
    bankVisualsCache.set(w, { sig, visuals });
    return visuals;
  }

  function computeBankVisuals(
    data,
    notesSession = NOTES_FALLBACK_SESSION,
    silverSession = SILVER_FALLBACK_SESSION,
  ) {
    const notesDist = computeNotesVisualDistribution(data?.locGold, notesSession);
    const notesLedger = computeNotesLedgerBookState(data?.locGold);
    const totalPapers = notesDist.totalPapers;
    const paperPiles = notesDist.paperPiles;

    const goldBalance = data.accountGold > 0 ? data.accountGold : (data.bankGold || 0);

    const barsCount =
      goldBalance > 3000000
        ? Math.min(11, Math.floor((goldBalance - 3000000) / 700000) + 1)
        : 0;

    const remainderGold = Math.min(goldBalance, 3000000);
    let totalGoldCoins = Math.floor(remainderGold / 100000);
    if (remainderGold > 0 && totalGoldCoins === 0) totalGoldCoins = 1;
    const visualGoldCoins = Math.min(totalGoldCoins, 30);

    const placeBudgets = [0, 0, 0, 0, 0, 0];
    let remCoins = visualGoldCoins;
    if (remCoins > 0) {
      placeBudgets[1] += 1; // 1st coin ALWAYS goes to Place 1!
      remCoins -= 1;
    }
    const fillOrder = [1, 2, 3, 4, 5];
    let pass = 0;
    while (remCoins > 0 && pass < 5) {
      for (const pid of fillOrder) {
        if (remCoins <= 0) break;
        placeBudgets[pid] += 1;
        remCoins -= 1;
      }
      pass++;
    }
    let fi = 0;
    while (remCoins > 0) {
      placeBudgets[fillOrder[fi % fillOrder.length]] += 1;
      remCoins -= 1;
      fi++;
    }

    const safeBudget =
      goldBalance > 0
        ? Math.min(35, Math.max(2, Math.ceil(goldBalance / 40000)))
        : 0;

    const silverScene = computeSilverSceneVisuals(
      data?.silverBalance,
      silverSession,
      data?.goldPerMark,
    );

    return {
      paperPiles,
      bookPiles: notesDist.bookPiles,
      notesPointPiles: notesDist.pointPiles,
      notesTotalPoints: notesDist.totalPoints,
      notesLedger,
      barsCount,
      safeBudget,
      placeBudgets,
      goldCoinStacks: placeBudgets,
      silverScene,
      silverScaleCoins: silverScene.scaleCoins,
      silverLeftCoins: silverScene.leftPlacesCoins,
      silverIngotsTotal: silverScene.rightIngotsTotal,
      silverCompletedSheets: silverScene.completedSheets,
      silverActiveSheetLines: silverScene.activeSheetLines,
      totalPapers,
      totalGoldCoins: visualGoldCoins,
      totalSilverCoins: silverScene.leftPlacesCoins,
    };
  }

  const bankWindowSessions = new WeakMap();
  const safeAnimStates = new WeakMap();

  function getWindowSessionProfiles(w) {
    if (!w) return buildSessionProfile(12345);
    let prof = bankWindowSessions.get(w);
    if (!prof) {
      const seed = Math.floor(Math.random() * 1000000) + 1;
      prof = buildSessionProfile(seed);
      bankWindowSessions.set(w, prof);
    }
    return prof;
  }

  const CW = 210;
  const CH = 170;
  const SX = 76, SY = 74, SW = 90, SH = 70;
  const IN_X = SX + 4, IN_Y = SY + 4, IN_W = SW - 8, IN_H = SH - 6;

  const PREDEFINED_SLOTS = [
    // CATEGORY 1: РЯДОМ С СЕЙФОМ (5 шт., передний план пола)
    { id: 'near_1', category: 'near', label: 'Рядом слева от дверцы (спереди)', x: 56, y: 152, isSmall: false },
    { id: 'near_2', category: 'near', label: 'Рядом слева от дверцы (позади)', x: 39, y: 148, isSmall: false },
    { id: 'near_3', category: 'near', label: 'Рядом у правого пилона (спереди)', x: 166, y: 154, isSmall: false },
    { id: 'near_4', category: 'near', label: 'Рядом у правого фланга (позади)', x: 180, y: 147, isSmall: false },
    { id: 'near_5', category: 'near', label: 'Рядом внешний правый край (спереди)', x: 188, y: 151, isSmall: false },

    // CATEGORY 2A: ОРИГИНАЛЬНЫЕ 4 ПЛЕЙСА СВЕРХУ НА СЕЙФЕ (Крыша: вид снизу вверх!)
    { id: 'top_1', category: 'top', label: 'Сверху слева (крыша, вид снизу)', x: 92, y: 74, isSmall: false, isRoofUnder: true },
    { id: 'top_2', category: 'top', label: 'Сверху по центру-слева (крыша, вид снизу)', x: 110, y: 73, isSmall: false, isRoofUnder: true },
    { id: 'top_3', category: 'top', label: 'Сверху по центру-справа (крыша, вид снизу)', x: 130, y: 73, isSmall: false, isRoofUnder: true },
    { id: 'top_4', category: 'top', label: 'Сверху справа (крыша, вид снизу)', x: 148, y: 74, isSmall: false, isRoofUnder: true },

    // CATEGORY 2B: 5 НОВЫХ ПЛЕЙСОВ ЗАКРЫВАЮЩИХ ДЫРУ У ДВЕРИ И ПЛЕЧАМ СЕЙФА (Опущены по Y, вес +10%)
    { id: 'top_5', category: 'top', label: 'Щель в створе двери (за дверным полотном)', x: 64, y: 108, isSmall: true },
    { id: 'top_6', category: 'top', label: 'Щель между дверью и левыми стопками', x: 58, y: 116, isSmall: true },
    { id: 'top_7', category: 'top', label: 'Бэкграунд над петлями двери', x: 60, y: 96, isSmall: true },
    { id: 'top_8', category: 'top', label: 'Бэкграунд правого плеча сейфа', x: 164, y: 96, isSmall: true },
    { id: 'top_9', category: 'top', label: 'Щель у правого пилона сейфа', x: 170, y: 110, isSmall: true },

    // CATEGORY 3A: ОРИГИНАЛЬНЫЕ 3 ПЛЕЙСА ПООДАЛЬ (На полу)
    { id: 'far_1', category: 'far', label: 'Поодаль далеко слева (пол)', x: 18, y: 149, isSmall: false },
    { id: 'far_2', category: 'far', label: 'Поодаль аванпост слева (пол)', x: 25, y: 154, isSmall: false },
    { id: 'far_3', category: 'far', label: 'Поодаль далеко справа (пол)', x: 196, y: 152, isSmall: false },

    // CATEGORY 3B: 5 НОВЫХ ПЛЕЙСОВ ЗАКРЫВАЮЩИХ БЭКГРАУНД ПО БОКАМ (Опущены по Y, вес +10%)
    { id: 'far_4', category: 'far', label: 'Глубокий бэкграунд за левыми стопками', x: 22, y: 122, isSmall: true },
    { id: 'far_5', category: 'far', label: 'Бэкграунд левого верхнего крыла', x: 36, y: 108, isSmall: true },
    { id: 'far_6', category: 'far', label: 'Коридор между левыми стопками и дверью', x: 48, y: 126, isSmall: true },
    { id: 'far_7', category: 'far', label: 'Бэкграунд правого верхнего крыла', x: 182, y: 108, isSmall: true },
    { id: 'far_8', category: 'far', label: 'Глубокий бэкграунд за правыми стопками', x: 196, y: 124, isSmall: true },
  ];

  // =========================================================================
  // 2. STATE & PSEUDO-RANDOM GENERATOR
  // =========================================================================
  let currentGold = 500000;
  let currentZoom = 2;
  let currentSessionSeed = 4819;
  let showSlotMarkers = false;


  function createRng(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return function () {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  function shuffle(arr, rng) {
    const res = [...arr];
    for (let i = res.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [res[i], res[j]] = [res[j], res[i]];
    }
    return res;
  }

  // Monotonic Coin Sequence Builder for 1 Place (Up to 90 coins across 3 stacks)
  function buildPlaceCoinSequence(dominantIndex, shares) {
    const seq = [];
    const cur = [0, 0, 0];
    const other = [0, 1, 2].filter(i => i !== dominantIndex)
      .sort((a, b) => shares[b] - shares[a]);
    const domIdx = dominantIndex;
    const secIdx = other[0];
    const tertIdx = other[1];

    for (let k = 0; k < 90; k++) {
      let pick = -1;
      if (k < 2 && cur[domIdx] < 30) {
        pick = domIdx;
      } else {
        const eligible = [domIdx, secIdx, tertIdx].filter(i => cur[i] < 30);
        let bestDeficit = -999999;
        for (const i of eligible) {
          let target = (k + 1) * shares[i];
          if (i === domIdx) target += 0.45;
          const deficit = target - cur[i];
          if (deficit > bestDeficit) {
            bestDeficit = deficit;
            pick = i;
          }
        }
        if (pick !== domIdx && cur[domIdx] <= cur[pick] && cur[domIdx] < 30) {
          pick = domIdx;
        }
      }
      if (pick === -1) {
        pick = [0, 1, 2].find(i => cur[i] < 30);
      }
      cur[pick]++;
      seq.push(pick);
    }
    return seq;
  }

  // =========================================================================
  // 3. MASTER QUEUE, COIN STREAM & POISSON-DISTRIBUTED TREASURES
  // =========================================================================
  let sessionProfile = null;

  function buildSessionProfile(seed) {
    const rng = createRng(seed);

    // Random jitter for this session: -1, 0, or +1 per 1M GP
    const jitter = Math.floor(rng() * 3) - 1;

    // Group pools
    const nearPool = shuffle(PREDEFINED_SLOTS.filter(s => s.category === 'near'), rng);
    const topRoofPool = shuffle(PREDEFINED_SLOTS.filter(s => s.category === 'top' && s.isRoofUnder), rng);
    const topGapPool = shuffle(PREDEFINED_SLOTS.filter(s => s.category === 'top' && !s.isRoofUnder), rng);
    const farFloorPool = shuffle(PREDEFINED_SLOTS.filter(s => s.category === 'far' && !s.isSmall), rng);
    const farGapPool = shuffle(PREDEFINED_SLOTS.filter(s => s.category === 'far' && s.isSmall), rng);

    const queue = [];

    // 1. First 3 'near'
    for (let i = 0; i < 3 && nearPool.length > 0; i++) queue.push(nearPool.shift());

    // 2. Next MUST be 'top' — strictly from safe roof pool!
    if (topRoofPool.length > 0) queue.push(topRoofPool.shift());

    // 3. 4th 'near'
    if (nearPool.length > 0) queue.push(nearPool.shift());

    // 4. Next MUST be 'far' — from floor pool
    if (farFloorPool.length > 0) queue.push(farFloorPool.shift());

    // 5. 5th 'near'
    if (nearPool.length > 0) queue.push(nearPool.shift());

    // 6. Remaining roof & original floor far slots
    while (topRoofPool.length > 0 || farFloorPool.length > 0) {
      if (topRoofPool.length > 0) queue.push(topRoofPool.shift());
      if (farFloorPool.length > 0) queue.push(farFloorPool.shift());
    }

    // 7. Interleave the 10 gap-filling background slots
    while (topGapPool.length > 0 || farGapPool.length > 0) {
      if (topGapPool.length > 0) queue.push(topGapPool.shift());
      if (farGapPool.length > 0) queue.push(farGapPool.shift());
    }

    // Micro-profiles with monotonic coin sequences, caps and scatter pile presets
    const slotProfiles = {};
    const placeCaps = {};

    queue.forEach(slot => {
      const dominantIndex = Math.floor(rng() * 3);
      const domShare = 0.56 + (rng() - 0.5) * 0.08;
      const remShare = 1.0 - domShare;
      const secRatio = 0.58 + (rng() - 0.5) * 0.15;
      const secShare = remShare * secRatio;
      const tertShare = remShare * (1 - secRatio);

      const shares = [0, 0, 0];
      shares[dominantIndex] = domShare;
      const other = [0, 1, 2].filter(i => i !== dominantIndex);
      shares[other[0]] = secShare;
      shares[other[1]] = tertShare;

      let baseWeight = 0.85 + rng() * 0.45;
      if (slot.isSmall) {
        baseWeight *= 1.10; // Boost weight by +10% for the 10 new gap-filling background slots
      }
      const jx = (rng() - 0.5) * 1.5;
      const jy = (rng() - 0.5) * 0.8;

      const coinSequence = buildPlaceCoinSequence(dominantIndex, shares);
      const cap = Math.min(90, Math.round(40 + (baseWeight - 0.85) / 0.45 * 45));

      // Pre-generate up to 10 scatter pile invariants for this slot
      const piles = [];
      for (let p = 0; p < 10; p++) {
        piles.push({
          inv: Math.floor(rng() * 5),
          dx: (rng() - 0.5) * 13,
          dy: 3.0 + rng() * 5.5
        });
      }

      slotProfiles[slot.id] = {
        baseWeight,
        dominantIndex,
        shares,
        jx,
        jy,
        coinSequence,
        cap,
        piles
      };
      placeCaps[slot.id] = cap;
    });

    // GLOBAL MONOTONIC COIN STREAM
    const streamRng = createRng(seed + 777);
    const globalCoinStream = [];
    const placeCoinsCount = {};
    queue.forEach(s => placeCoinsCount[s.id] = 0);

    let prevActiveCount = 2;
    let newPlaceBurstSlot = null;
    let newPlaceBurstLeft = 0;

    for (let c = 0; c < 900; c++) {
      const rem = Math.ceil((c + 1) * (950 / 900));
      const tvc = 50 + rem;
      const g = tvc * 5000;
      const millionCount = Math.floor(g / 1000000);
      const curActiveCount = Math.max(2, Math.min(22, Math.floor(g / 200000) + millionCount * jitter));

      if (curActiveCount > prevActiveCount) {
        newPlaceBurstSlot = queue[curActiveCount - 1].id;
        newPlaceBurstLeft = 7;
        prevActiveCount = curActiveCount;
      }

      let pickSlotId = null;

      if (newPlaceBurstLeft > 0 && newPlaceBurstSlot && placeCoinsCount[newPlaceBurstSlot] < placeCaps[newPlaceBurstSlot]) {
        pickSlotId = newPlaceBurstSlot;
        newPlaceBurstLeft--;
      } else {
        newPlaceBurstSlot = null;
        newPlaceBurstLeft = 0;

        const activeSlots = queue.slice(0, curActiveCount);
        const eligible = activeSlots.filter(s => placeCoinsCount[s.id] < placeCaps[s.id]);

        if (eligible.length > 0) {
          // Weighted selection according to each slot's baseWeight (+10% for new gap slots)
          let totalWeight = 0;
          for (let i = 0; i < eligible.length; i++) {
            totalWeight += slotProfiles[eligible[i].id].baseWeight;
          }
          let r = streamRng() * totalWeight;
          for (let i = 0; i < eligible.length; i++) {
            r -= slotProfiles[eligible[i].id].baseWeight;
            if (r <= 0) {
              pickSlotId = eligible[i].id;
              break;
            }
          }
          if (!pickSlotId) {
            pickSlotId = eligible[eligible.length - 1].id;
          }
        } else {
          const fallback = activeSlots.filter(s => placeCoinsCount[s.id] < 90);
          if (fallback.length > 0) {
            let totalWeight = 0;
            for (let i = 0; i < fallback.length; i++) {
              totalWeight += slotProfiles[fallback[i].id].baseWeight;
            }
            let r = streamRng() * totalWeight;
            for (let i = 0; i < fallback.length; i++) {
              r -= slotProfiles[fallback[i].id].baseWeight;
              if (r <= 0) {
                pickSlotId = fallback[i].id;
                break;
              }
            }
            if (!pickSlotId) {
              pickSlotId = fallback[fallback.length - 1].id;
            }
          } else {
            pickSlotId = activeSlots[0].id;
          }
        }
      }

      placeCoinsCount[pickSlotId]++;
      globalCoinStream.push(pickSlotId);
    }

    // POISSON-DISTRIBUTED TREASURES:
    // - At flanks (tx < 68 or tx > 158): strictly lower foreground Y in 162..166 (below coin stacks)
    // - In center (68..158): open stone floor in front of safe (148..166, excluding safe chassis Y < 146)
    // - Disallow on any floor stack base or scatter pile area
    // - Minimum distance >= 22px between any two treasures to prevent clustering
    // - 4 distinct rotation/angle invariants per item type
    const treasureRng = createRng(seed + 4321);
    const sessionTreasures = [];
    let attempts = 0;

    while (sessionTreasures.length < 10 && attempts < 2500) {
      attempts++;
      const tx = Math.round(14 + treasureRng() * 182);
      const isFlank = (tx < 68 || tx > 158);
      const ty = isFlank
        ? Math.round(162 + treasureRng() * 4.5)
        : Math.round(148 + treasureRng() * 18);

      // Disallow on safe body
      if (tx >= 73 && tx <= 165 && ty < 146) continue;

      // Disallow overlapping floor stack bases or scatter piles
      let hitsStack = false;
      for (const slot of PREDEFINED_SLOTS) {
        if (slot.y >= 144) {
          const dx = Math.abs(tx - slot.x);
          const dy = ty - slot.y;
          if (dx < 12 && dy < 9 && dy > -8) {
            hitsStack = true;
            break;
          }
        }
      }
      if (hitsStack) continue;

      // Enforce minimum distance >= 22px
      let tooClose = false;
      for (const prev of sessionTreasures) {
        const distSq = (tx - prev.tx) ** 2 + (ty - prev.ty) ** 2;
        if (distSq < 22 * 22) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      const type = Math.floor(treasureRng() * 4); // 0: Sapphire, 1: Ruby, 2: Diamond, 3: Gold Ring
      const inv = Math.floor(treasureRng() * 4);  // 4 rotation angles (0..3)
      sessionTreasures.push({ tx, ty, type, inv });
    }

    return {
      seed,
      jitter,
      queue,
      slotProfiles,
      globalCoinStream,
      sessionTreasures,
      animStartTime: seed === 12345 ? 0 : (typeof Date === "function" ? Date.now() : 0)
    };
  }

  // =========================================================================
  // 4. STANDARDIZED BANK SCENE LIGHTING, SPARKLES & CANVAS SETUP
  // =========================================================================

  const BANK_LIGHT_WARM_MIX = 0.85;

  function computeBankFlameFlicker(tSec = 0, phase = 0) {
    const t = Number.isFinite(tSec) ? tSec : 0;
    return {
      alphaJitter: Math.sin(t * 7.4 + phase) * 0.038 + Math.cos(t * 12.1 + phase * 1.3) * 0.026,
      radiusPulse: Math.sin(t * 5.2 + phase) * 1.4 + Math.cos(t * 9.8 + phase) * 0.7,
      sway: Math.sin(t * 9.5 + phase) * 0.52,
      stretch: Math.cos(t * 13.1 + phase) * 0.58,
    };
  }

  function drawBankStandardLightGlow(
    ctx,
    coreX,
    coreY,
    spreadX,
    spreadY,
    radius,
    tSec = 0,
    intensity = BANK_LIGHT_WARM_MIX,
    phase = 0,
  ) {
    if (intensity <= 0.02) return;
    const fl = computeBankFlameFlicker(tSec, phase);
    const peakAlpha = Math.max(0.05, (0.28 + fl.alphaJitter) * intensity);
    const effR = Math.max(8, radius + fl.radiusPulse);
    const minX = Math.floor(Math.min(coreX, spreadX) - effR - 2);
    const minY = Math.floor(Math.min(coreY, spreadY) - effR - 2);
    const maxX = Math.ceil(Math.max(coreX, spreadX) + effR + 2);
    const maxY = Math.ceil(Math.max(coreY, spreadY) + effR + 2);
    const grad = ctx.createRadialGradient(coreX, coreY, 2, spreadX, spreadY, effR);
    grad.addColorStop(0, `rgba(255, 204, 102, ${peakAlpha})`);
    grad.addColorStop(0.42, `rgba(217, 119, 6, ${peakAlpha * 0.44})`);
    grad.addColorStop(0.76, `rgba(180, 83, 9, ${peakAlpha * 0.14})`);
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
  }

  function drawBankStandardFlameHalo(
    ctx,
    x,
    y,
    radius,
    tSec = 0,
    intensity = BANK_LIGHT_WARM_MIX,
    phase = 0,
  ) {
    if (intensity <= 0.02) return;
    const fl = computeBankFlameFlicker(tSec, phase);
    const haloAlpha = Math.max(0.12, (0.40 + fl.alphaJitter * 1.6) * intensity);
    const effR = Math.max(2, radius + fl.radiusPulse * 0.35);
    const haloGrad = ctx.createRadialGradient(x, y, 0.5, x, y, effR);
    haloGrad.addColorStop(0, `rgba(255, 224, 130, ${haloAlpha})`);
    haloGrad.addColorStop(0.48, `rgba(255, 165, 35, ${haloAlpha * 0.52})`);
    haloGrad.addColorStop(1, "rgba(255, 140, 0, 0)");
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(x, y, effR, 0, Math.PI * 2);
    ctx.fill();
  }

  function computeBankSparklePulses(tSec = 0) {
    const t = Number.isFinite(tSec) ? tSec : 0;
    return {
      p1: Math.max(0, Math.sin(t * 2.2) - 0.58) / 0.42,
      p2: Math.max(0, Math.sin(t * 1.7 + 2.1) - 0.60) / 0.40,
    };
  }

  function drawBankSparkle(ctx, cx, cy, size = 2, alpha = 1) {
    if (alpha <= 0.04) return;
    ctx.save();
    ctx.fillStyle = `rgba(248, 250, 252, ${alpha})`;
    ctx.fillRect(Math.round(cx - size), Math.round(cy), size * 2 + 1, 1);
    ctx.fillRect(Math.round(cx), Math.round(cy - size), 1, size * 2 + 1);
    ctx.restore();
  }

  // Standard Coin (Seen from above / looking down: top ellipse face with hallmark)

  function setupCanvas(cv, viewW, viewH, logicalW = viewW, logicalH = viewH) {
    const dpr = root.devicePixelRatio || 1;
    const tw = Math.round(viewW * dpr);
    const th = Math.round(viewH * dpr);
    if (cv.width !== tw || cv.height !== th) {
      cv.width = tw;
      cv.height = th;
      cv.style.width = viewW + "px";
      cv.style.height = viewH + "px";
    }
    const sx = (dpr * viewW) / (logicalW || viewW);
    const sy = (dpr * viewH) / (logicalH || viewH);
    const ctx = cv.getContext("2d");
    if (typeof ctx.setTransform === "function") {
      ctx.setTransform(sx, 0, 0, sy, 0, 0);
    } else if (typeof ctx.scale === "function") {
      ctx.scale(sx, sy);
    }
    if (typeof ctx.clearRect === "function") {
      ctx.clearRect(0, 0, logicalW, logicalH);
    }
    return ctx;
  }

  function drawSingleCoin(ctx, x, y, rx = 6.2, ry = 2.4, tilt = 0, depthShade = 1.0, isRoofUnder = false, isSilver = false) {
    if (typeof depthShade === 'boolean') {
      isSilver = depthShade;
      depthShade = 1.0;
    }
    if (isSilver) {
      ctx.save();
      ctx.translate(x, y);
      if (tilt) ctx.rotate(tilt);

      ctx.fillStyle = "rgba(0, 0, 0, 0.36)";
      ctx.beginPath();
      if (typeof ctx.ellipse === 'function') ctx.ellipse(0, 0.9, rx * 0.96, ry * 0.92, 0, 0, Math.PI * 2);
      ctx.fill();

      const edgeGrad = ctx.createLinearGradient(-rx, 0, rx, 0);
      edgeGrad.addColorStop(0, "#1e293b");
      edgeGrad.addColorStop(0.35, "#475569");
      edgeGrad.addColorStop(0.7, "#94a3b8");
      edgeGrad.addColorStop(1, "#0f172a");
      ctx.fillStyle = edgeGrad;
      ctx.beginPath();
      if (typeof ctx.ellipse === 'function') ctx.ellipse(0, 0.45, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();

      const rimGrad = ctx.createLinearGradient(-rx, -ry, rx, ry);
      rimGrad.addColorStop(0, "#f1f5f9");
      rimGrad.addColorStop(0.4, "#cbd5e1");
      rimGrad.addColorStop(0.75, "#64748b");
      rimGrad.addColorStop(1, "#334155");
      ctx.fillStyle = rimGrad;
      ctx.beginPath();
      if (typeof ctx.ellipse === 'function') ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();

      const faceGrad = ctx.createRadialGradient(-rx * 0.22, -ry * 0.3, 0.4, 0, 0, rx * 0.85);
      faceGrad.addColorStop(0, "#ffffff");
      faceGrad.addColorStop(0.45, "#cbd5e1");
      faceGrad.addColorStop(0.85, "#64748b");
      faceGrad.addColorStop(1, "#334155");
      ctx.fillStyle = faceGrad;
      ctx.beginPath();
      if (typeof ctx.ellipse === 'function') ctx.ellipse(0, -0.35, rx * 0.78, ry * 0.76, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
      ctx.beginPath();
      if (typeof ctx.ellipse === 'function') ctx.ellipse(-rx * 0.44, -ry * 0.4, rx * 0.22, ry * 0.19, -0.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(x, y);
    if (tilt) ctx.rotate(tilt);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    ctx.beginPath();
    if (typeof ctx.ellipse === 'function') ctx.ellipse(0, 0.9, rx * 0.95, ry * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();

    const edgeGrad = ctx.createLinearGradient(-rx, 0, rx, 0);
    edgeGrad.addColorStop(0, '#502a0a');
    edgeGrad.addColorStop(0.35, '#854d0e');
    edgeGrad.addColorStop(0.7, '#d97706');
    edgeGrad.addColorStop(1, '#451a03');
    ctx.fillStyle = edgeGrad;
    ctx.beginPath();
    if (typeof ctx.ellipse === 'function') ctx.ellipse(0, 0.45, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    const rimGrad = ctx.createLinearGradient(-rx, -ry, rx, ry);
    rimGrad.addColorStop(0, '#fef08a');
    rimGrad.addColorStop(0.35, '#f59e0b');
    rimGrad.addColorStop(0.7, '#d97706');
    rimGrad.addColorStop(1, '#78350f');
    ctx.fillStyle = rimGrad;
    ctx.beginPath();
    if (typeof ctx.ellipse === 'function') ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    const faceGrad = ctx.createRadialGradient(-rx * 0.25, -ry * 0.35, 0.4, 0, 0, rx * 0.88);
    faceGrad.addColorStop(0, '#fde68a');
    faceGrad.addColorStop(0.5, '#fbbf24');
    faceGrad.addColorStop(0.85, '#b45309');
    faceGrad.addColorStop(1, '#78350f');
    ctx.fillStyle = faceGrad;
    ctx.beginPath();
    if (typeof ctx.ellipse === 'function') ctx.ellipse(0, -0.3, rx * 0.76, ry * 0.74, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
    ctx.beginPath();
    if (typeof ctx.ellipse === 'function') ctx.ellipse(-rx * 0.45, -ry * 0.42, rx * 0.22, ry * 0.20, -0.2, 0, Math.PI * 2);
    ctx.fill();

    if (depthShade < 1.0) {
      ctx.fillStyle = 'rgba(0, 0, 0, ' + ((1.0 - depthShade) * 0.65) + ')';
      ctx.beginPath();
      if (typeof ctx.ellipse === 'function') ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawSingleCoinLookingUp(ctx, x, y, rx = 6.2, ry = 2.4, tilt = 0, depthShade = 1.0) {
    ctx.save();
    ctx.translate(x, y);
    if (tilt) ctx.rotate(tilt);

    // Shadow under coin edge
    ctx.fillStyle = `rgba(0,0,0,${0.35 * depthShade})`;
    ctx.beginPath();
    ctx.ellipse(0, 1.1, rx * 1.04, ry * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Milled rim underside shadow
    ctx.fillStyle = depthShade < 0.92 ? '#542b0c' : '#78350f';
    ctx.beginPath();
    ctx.ellipse(0, 0.7, rx, ry * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Front cylindrical edge (metallic reflective cylinder gradient — NO TOP FACE!)
    const rimGrad = ctx.createLinearGradient(-rx, 0, rx, 0);
    rimGrad.addColorStop(0, '#854d0e');
    rimGrad.addColorStop(0.25, '#ca8a04');
    rimGrad.addColorStop(0.5, '#fef08a'); // central reflection catch
    rimGrad.addColorStop(0.75, '#eab308');
    rimGrad.addColorStop(1, '#713f12');
    ctx.fillStyle = rimGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Lower rim bevel highlight (light catches lower curve seen from below)
    ctx.strokeStyle = '#fef9c3';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.ellipse(0, 0.2, rx * 0.96, ry * 0.65, 0, Math.PI * 0.1, Math.PI * 0.9);
    ctx.stroke();

    // Fine vertical milled notches along the cylinder edge
    ctx.fillStyle = 'rgba(113, 63, 18, 0.55)';
    for (let nx = -rx * 0.65; nx <= rx * 0.65; nx += 2.0) {
      ctx.fillRect(nx, -0.6, 0.6, 1.3);
    }

    ctx.restore();
  }


  function drawCoinStack(ctx, sx, sy, count, rx = 6.2, ry = 2.4, stepY = 2.2, depthShade = 1.0, isRoofUnder = false, isSilver = false) {
    if (typeof stepY === 'boolean') {
      isSilver = stepY;
      stepY = 2.2;
      depthShade = 1.0;
    }
    if (count <= 0) return;
    if (isSilver) {
      for (let c = 0; c < count; c++) {
        const tilt = (c % 2 === 0 ? 0.05 : -0.05);
        drawSingleCoin(ctx, sx, sy - c * 2.0, rx, ry, tilt, 1.0, false, true);
      }
      return;
    }
    const clamped = Math.min(30, count);
    for (let c = 0; c < clamped; c++) {
      const tilt = (c % 2 === 0 ? 0.04 : -0.04);
      if (isRoofUnder) {
        drawSingleCoinLookingUp(ctx, sx, sy - c * stepY, rx, ry, tilt, depthShade);
      } else {
        drawSingleCoin(ctx, sx, sy - c * stepY, rx, ry, tilt, depthShade);
      }
    }
  }

  function distributeCoinsInPlace(coinsCount, profile) {
    const clamped = Math.min(90, Math.max(0, coinsCount));
    const res = [0, 0, 0];
    for (let i = 0; i < clamped; i++) {
      res[profile.coinSequence[i]]++;
    }
    return res;
  }

  function drawCoinScatterPile(ctx, bx, by, inv, isSmall = false) {
    const rx = isSmall ? 4.7 : 6.2;
    const ry = isSmall ? 1.8 : 2.4;

    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath();
    ctx.ellipse(bx, by + ry * 0.4, rx * 1.5, ry * 1.3, 0, 0, Math.PI * 2);
    ctx.fill();

    let coins = [];
    switch (inv) {
      case 0:
        coins = [
          { dx: -rx * 0.45, dy: 0, tilt: 0.08 },
          { dx: rx * 0.45, dy: ry * 0.3, tilt: -0.06 }
        ];
        break;
      case 1:
        coins = [
          { dx: -rx * 0.5, dy: ry * 0.25, tilt: -0.10 },
          { dx: rx * 0.5, dy: ry * 0.35, tilt: 0.08 },
          { dx: 0, dy: -ry * 0.25, tilt: 0.04 }
        ];
        break;
      case 2:
        coins = [
          { dx: -rx * 0.65, dy: 0, tilt: 0.12 },
          { dx: 0, dy: ry * 0.4, tilt: -0.05 },
          { dx: rx * 0.65, dy: ry * 0.1, tilt: 0.09 }
        ];
        break;
      case 3:
        coins = [
          { dx: -rx * 0.5, dy: ry * 0.3, tilt: -0.08 },
          { dx: rx * 0.5, dy: ry * 0.4, tilt: 0.10 },
          { dx: 0, dy: ry * 0.6, tilt: -0.02 },
          { dx: -rx * 0.1, dy: -ry * 0.2, tilt: 0.05 }
        ];
        break;
      case 4:
        coins = [
          { dx: -rx * 0.7, dy: ry * 0.2, tilt: -0.12 },
          { dx: rx * 0.65, dy: ry * 0.3, tilt: 0.08 },
          { dx: 0, dy: ry * 0.6, tilt: -0.05 },
          { dx: -rx * 0.35, dy: -ry * 0.15, tilt: 0.06 },
          { dx: rx * 0.35, dy: 0, tilt: -0.08 }
        ];
        break;
    }

    coins.forEach(c => {
      drawSingleCoin(ctx, bx + c.dx, by + c.dy, rx * 0.96, ry * 0.96, c.tilt, 0.96);
    });
  }

  function drawPlaceCluster(ctx, cx, cy, coinsCount, profile, isSmall = false, isRoofUnder = false, scatterPileCount = 0) {
    if (coinsCount <= 0) return [0, 0, 0];

    const rx = isSmall ? 4.7 : 6.2;
    const ry = isSmall ? 1.8 : 2.4;
    const stepY = isSmall ? 1.7 : 2.2;
    const spX = isSmall ? 3.8 : 5.0;
    const spY = isSmall ? 2.1 : 2.8;

    const counts = distributeCoinsInPlace(coinsCount, profile);
    const c0 = counts[0], c1 = counts[1], c2 = counts[2];
    const h0 = c0 * stepY;
    const h1 = c1 * stepY;
    const h2 = c2 * stepY;
    const maxH = Math.max(h0, h1, h2);

    const px = cx + profile.jx;
    const py = cy + profile.jy;

    const s0x = px + 0.5;
    const s0y = py - spY;

    const s1x = px - spX;
    const s1y = py + spY * 0.4;

    const s2x = px + spX * 0.9;
    const s2y = py + spY * 0.8;

    const sceneDepthShade = Math.min(1.0, 0.88 + (py / CH) * 0.12);

    if (maxH > 0) {
      ctx.save();
      const hRatio = maxH / (30 * stepY);
      const reachY = 2 + hRatio * 6;
      const sceneAlpha = 0.05 + hRatio * 0.16;
      const backGrad = ctx.createRadialGradient(px, py - 1, 2, px, py - reachY, 12 + reachY);
      backGrad.addColorStop(0, `rgba(0, 0, 0, ${sceneAlpha})`);
      backGrad.addColorStop(0.5, `rgba(0, 0, 0, ${sceneAlpha * 0.4})`);
      backGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = backGrad;
      ctx.beginPath();
      ctx.ellipse(px, py - reachY * 0.5, rx * 2.1, ry * 1.8 + reachY * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(px, py + spY * 0.5 + 1.5, spX * 1.6 + 4, spY * 1.3 + 2, 0, 0, Math.PI * 2);
    ctx.fill();

    const backShade = sceneDepthShade * 0.92;
    drawCoinStack(ctx, s0x, s0y, c0, rx, ry, stepY, backShade, isRoofUnder);

    if (c0 > 0 && c1 > 0) {
      ctx.save();
      const shH1 = Math.min(h0, h1);
      const alpha1 = 0.06 + (c1 / 30) * 0.18;
      const shGrad1 = ctx.createLinearGradient(s1x, 0, s0x + rx, 0);
      shGrad1.addColorStop(0, `rgba(0, 0, 0, ${alpha1})`);
      shGrad1.addColorStop(0.6, `rgba(0, 0, 0, ${alpha1 * 0.35})`);
      shGrad1.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = shGrad1;
      ctx.beginPath();
      ctx.rect(s0x - rx * 0.8, s0y - shH1 - ry, rx * 1.4, shH1 + ry * 1.5);
      ctx.fill();
      ctx.restore();
    }
    drawCoinStack(ctx, s1x, s1y, c1, rx, ry, stepY, sceneDepthShade * 0.97, isRoofUnder);

    if ((c0 > 0 || c1 > 0) && c2 > 0) {
      ctx.save();
      const shH2 = Math.min(Math.max(h0, h1), h2);
      const alpha2 = 0.06 + (c2 / 30) * 0.20;
      const shGrad2 = ctx.createLinearGradient(s2x, 0, s2x - rx * 1.8, 0);
      shGrad2.addColorStop(0, `rgba(0, 0, 0, ${alpha2})`);
      shGrad2.addColorStop(0.6, `rgba(0, 0, 0, ${alpha2 * 0.35})`);
      shGrad2.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = shGrad2;
      ctx.beginPath();
      ctx.rect(s2x - rx * 1.9, py - shH2 - ry, rx * 1.9, shH2 + ry * 2);
      ctx.fill();
      ctx.restore();
    }
    drawCoinStack(ctx, s2x, s2y, c2, rx, ry, stepY, sceneDepthShade, isRoofUnder);

    if (scatterPileCount > 0 && profile.piles) {
      for (let p = 0; p < scatterPileCount; p++) {
        const pileDef = profile.piles[p % profile.piles.length];
        drawCoinScatterPile(ctx, px + pileDef.dx, py + pileDef.dy, pileDef.inv, isSmall);
      }
    }

    return counts;
  }

  // -------------------------------------------------------------------------
  // TREASURE RENDERERS WITH 4 ROTATION INVARIANTS EACH
  // -------------------------------------------------------------------------

  // 1. Blue Gem (Sapphire) with 4 angle invariants
  function drawBlueGem(ctx, x, y, inv = 0) {
    ctx.save();
    ctx.translate(x, y);

    // Rotation angle based on invariant
    const angles = [0, -0.6, 0.6, 1.57];
    ctx.rotate(angles[inv % 4]);

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(0, 2, 3.5, 1.8, 0, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#1e3a8a';
    ctx.beginPath();
    ctx.moveTo(0, -3.5); ctx.lineTo(3.2, 0); ctx.lineTo(0, 2.5); ctx.lineTo(-3.2, 0);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#3b82f6';
    ctx.beginPath(); ctx.moveTo(0, -3.5); ctx.lineTo(0, 0); ctx.lineTo(-3.2, 0); ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#60a5fa';
    ctx.beginPath(); ctx.moveTo(0, -3.5); ctx.lineTo(3.2, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#1d4ed8';
    ctx.beginPath(); ctx.moveTo(-3.2, 0); ctx.lineTo(0, 0); ctx.lineTo(0, 2.5); ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-0.8, -2.2, 1.2, 1.2);

    ctx.restore();
  }

  // 2. Red Gem (Ruby) with 4 angle invariants
  function drawRedGem(ctx, x, y, inv = 0) {
    ctx.save();
    ctx.translate(x, y);

    const angles = [0, -0.52, 0.7, 1.3];
    ctx.rotate(angles[inv % 4]);

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(0, 2, 3.5, 1.8, 0, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#7f1d1d';
    ctx.beginPath();
    ctx.moveTo(0, -3.5); ctx.lineTo(3.2, 0); ctx.lineTo(0, 2.5); ctx.lineTo(-3.2, 0);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.moveTo(0, -3.5); ctx.lineTo(0, 0); ctx.lineTo(-3.2, 0); ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#f87171';
    ctx.beginPath(); ctx.moveTo(0, -3.5); ctx.lineTo(3.2, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#b91c1c';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(3.2, 0); ctx.lineTo(0, 2.5); ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#fef2f2';
    ctx.fillRect(-0.8, -2.2, 1.2, 1.2);

    ctx.restore();
  }

  // 3. Diamond with 4 angle invariants
  function drawDiamond(ctx, x, y, inv = 0) {
    ctx.save();
    ctx.translate(x, y);

    const angles = [0, -0.44, 0.52, 1.0];
    ctx.rotate(angles[inv % 4]);

    const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, 6);
    glow.addColorStop(0, 'rgba(186, 230, 253, 0.45)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-6, -6, 12, 12);

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(0, 2.2, 3.5, 1.8, 0, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.moveTo(0, -4); ctx.lineTo(3.5, -0.5); ctx.lineTo(0, 3); ctx.lineTo(-3.5, -0.5);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#e0f2fe';
    ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(3.5, -0.5); ctx.lineTo(0, -0.5); ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, -0.5); ctx.lineTo(-3.5, -0.5); ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#38bdf8';
    ctx.beginPath(); ctx.moveTo(-3.5, -0.5); ctx.lineTo(0, -0.5); ctx.lineTo(0, 3); ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-0.6, -2.5, 1.2, 1.2);

    ctx.restore();
  }

  // 4. Gold Ring with Red Gem with 4 angle invariants
  function drawGoldRing(ctx, x, y, inv = 0) {
    ctx.save();
    ctx.translate(x, y);

    const angles = [-0.44, 0.44, 0, 1.4];
    ctx.rotate(angles[inv % 4]);

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(0, 2, 4.2, 2.2, 0, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(0, 0.5, 3.8, 2.2, -0.2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(0, 0.3, 3.8, 2.2, -0.2, Math.PI * 0.8, Math.PI * 1.8);
    ctx.stroke();

    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(-1.5, -2.5, 3, 2.2);

    ctx.fillStyle = '#dc2626';
    ctx.beginPath(); ctx.arc(0, -1.5, 1.3, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-0.5, -2.0, 0.8, 0.8);

    ctx.restore();
  }

  // =========================================================================
  // 5. INNER SAFE HEAP DRAWING (7-Layer Gentle Mound, Max 100 Coins)
  // =========================================================================
  // Lower horizontal density, broad gentle slope (полого, не пирамидально),
  // 2 complete full-width foundation layers (spanning the entire safe floor),
  // followed by gradual gentle terraces up to Layer 6 summit cap.

  const SAFE_HEAP_PATTERN = (function () {
    const pattern = [];

    // --- LAYER 0: Bottom Foundation Bed (16 coins, layer 0) ---
    // Spans full width from dx -35.0 to +35.5 (total width ~81.5px across 82px chamber)
    const layer0 = [
      // Sub-row 0A (back row on floor, dy ~ 0.5 to 0.9)
      { dx: -35.0, dy: 0.6, tilt: -0.06 },
      { dx: -25.5, dy: 0.9, tilt: 0.05 },
      { dx: -16.0, dy: 0.5, tilt: -0.04 },
      { dx: -6.5, dy: 0.8, tilt: 0.06 },
      { dx: 3.0, dy: 0.6, tilt: -0.05 },
      { dx: 12.5, dy: 0.9, tilt: 0.04 },
      { dx: 22.0, dy: 0.5, tilt: -0.06 },
      { dx: 31.5, dy: 0.8, tilt: 0.05 },
      // Sub-row 0B (front row on floor, dy ~ 2.3 to 2.8)
      { dx: -30.5, dy: 2.3, tilt: 0.07 },
      { dx: -21.0, dy: 2.6, tilt: -0.05 },
      { dx: -11.5, dy: 2.4, tilt: 0.04 },
      { dx: -2.0, dy: 2.7, tilt: -0.06 },
      { dx: 7.5, dy: 2.5, tilt: 0.05 },
      { dx: 17.0, dy: 2.8, tilt: -0.04 },
      { dx: 26.5, dy: 2.4, tilt: 0.06 },
      { dx: 35.5, dy: 2.6, tilt: -0.05 }
    ].map(c => ({ ...c, layer: 0, rx: 5.6, ry: 2.1, depthShade: 0.88 }));

    // --- LAYER 1: Second Full-Width Bed (15 coins, layer 1) ---
    // Also spans virtually the full floor width from dx -33.0 to +33.0 (~77px total width)
    const layer1 = [
      // Sub-row 1A (dy ~ -0.9 to -0.6)
      { dx: -33.0, dy: -0.8, tilt: 0.05 },
      { dx: -23.5, dy: -0.6, tilt: -0.04 },
      { dx: -14.0, dy: -0.9, tilt: 0.06 },
      { dx: -5.0, dy: -0.7, tilt: -0.05 },
      { dx: 4.5, dy: -0.8, tilt: 0.04 },
      { dx: 14.0, dy: -0.6, tilt: -0.06 },
      { dx: 23.5, dy: -0.9, tilt: 0.05 },
      { dx: 33.0, dy: -0.7, tilt: -0.04 },
      // Sub-row 1B (dy ~ 0.7 to 1.2)
      { dx: -28.0, dy: 0.8, tilt: -0.06 },
      { dx: -18.5, dy: 1.1, tilt: 0.05 },
      { dx: -9.0, dy: 0.7, tilt: -0.04 },
      { dx: 0.0, dy: 1.0, tilt: 0.06 },
      { dx: 9.5, dy: 0.8, tilt: -0.05 },
      { dx: 19.0, dy: 1.2, tilt: 0.04 },
      { dx: 28.5, dy: 0.9, tilt: -0.06 }
    ].map(c => ({ ...c, layer: 1, rx: 5.6, ry: 2.1, depthShade: 0.91 }));

    // --- LAYER 2: Broad Gentle Terrace (18 coins, layer 2) ---
    // Spans dx -26.0 to +26.0 (total width ~63px)
    // 11 center coins in Phase 1, 7 flank coins in Phase 2
    const layer2Center = [
      { dx: -13.5, dy: -2.6, tilt: 0.05 },
      { dx: -5.0, dy: -2.9, tilt: -0.04 },
      { dx: 4.0, dy: -2.8, tilt: 0.06 },
      { dx: 12.5, dy: -2.5, tilt: -0.05 },
      { dx: -17.0, dy: -1.2, tilt: -0.04 },
      { dx: -9.0, dy: -1.4, tilt: 0.05 },
      { dx: 0.0, dy: -1.5, tilt: -0.03 },
      { dx: 8.5, dy: -1.3, tilt: 0.04 },
      { dx: 16.5, dy: -1.1, tilt: -0.06 },
      { dx: -4.5, dy: -0.1, tilt: 0.04 },
      { dx: 4.5, dy: 0.0, tilt: -0.05 }
    ].map(c => ({ ...c, layer: 2, rx: 5.5, ry: 2.05, depthShade: 0.94 }));

    const layer2Flanks = [
      { dx: -26.0, dy: -2.1, tilt: -0.05 },
      { dx: -21.5, dy: -1.8, tilt: 0.06 },
      { dx: -24.0, dy: -0.5, tilt: -0.04 },
      { dx: 21.5, dy: -1.8, tilt: -0.05 },
      { dx: 26.0, dy: -2.1, tilt: 0.04 },
      { dx: 24.0, dy: -0.5, tilt: 0.06 },
      { dx: 0.0, dy: -2.8, tilt: 0.02 }
    ].map(c => ({ ...c, layer: 2, rx: 5.5, ry: 2.05, depthShade: 0.94 }));

    // --- LAYER 3: Wide Upper Swelling (17 coins, layer 3) ---
    // Spans dx -18.5 to +18.5 (total width ~48px)
    // 8 center coins in Phase 1, 9 coins in Phase 2
    const layer3Phase1 = [
      { dx: -9.0, dy: -4.8, tilt: 0.05 },
      { dx: 0.0, dy: -5.2, tilt: -0.04 },
      { dx: 9.0, dy: -4.7, tilt: 0.06 },
      { dx: -12.5, dy: -3.5, tilt: -0.06 },
      { dx: -4.5, dy: -3.7, tilt: 0.04 },
      { dx: 4.5, dy: -3.6, tilt: -0.05 },
      { dx: 12.5, dy: -3.4, tilt: 0.05 },
      { dx: 0.0, dy: -2.4, tilt: 0.03 }
    ].map(c => ({ ...c, layer: 3, rx: 5.5, ry: 2.05, depthShade: 0.96 }));

    const layer3Phase2 = [
      { dx: -18.5, dy: -3.8, tilt: 0.04 },
      { dx: 18.5, dy: -3.8, tilt: -0.05 },
      { dx: -15.5, dy: -4.9, tilt: -0.04 },
      { dx: 15.5, dy: -4.9, tilt: 0.05 },
      { dx: -6.0, dy: -5.5, tilt: 0.06 },
      { dx: 5.5, dy: -5.4, tilt: -0.04 },
      { dx: -8.0, dy: -3.2, tilt: -0.05 },
      { dx: 7.5, dy: -3.1, tilt: 0.04 },
      { dx: -1.0, dy: -4.2, tilt: -0.03 }
    ].map(c => ({ ...c, layer: 3, rx: 5.5, ry: 2.05, depthShade: 0.96 }));

    // --- LAYER 4: Gentle Mid-High Terrace (16 coins, layer 4) ---
    // Spans dx -13.0 to +12.5 (total width ~36.5px)
    const layer4 = [
      { dx: -10.5, dy: -7.5, tilt: -0.05 },
      { dx: -4.0, dy: -7.9, tilt: 0.06 },
      { dx: 3.5, dy: -8.0, tilt: -0.04 },
      { dx: 10.0, dy: -7.4, tilt: 0.05 },
      { dx: -13.0, dy: -6.2, tilt: 0.04 },
      { dx: -7.0, dy: -6.5, tilt: -0.06 },
      { dx: 0.0, dy: -6.7, tilt: 0.05 },
      { dx: 6.5, dy: -6.4, tilt: -0.04 },
      { dx: 12.5, dy: -6.1, tilt: 0.06 },
      { dx: -9.5, dy: -5.2, tilt: 0.03 },
      { dx: -3.0, dy: -5.4, tilt: -0.05 },
      { dx: 3.0, dy: -5.3, tilt: 0.04 },
      { dx: 9.0, dy: -5.1, tilt: -0.06 },
      { dx: -5.5, dy: -7.0, tilt: -0.03 },
      { dx: 1.5, dy: -7.2, tilt: 0.05 },
      { dx: 6.0, dy: -6.9, tilt: -0.04 }
    ].map(c => ({ ...c, layer: 4, rx: 5.4, ry: 2.0, depthShade: 0.98 }));

    // --- LAYER 5: Broad Rounded Crest (11 coins, layer 5) ---
    // Spans dx -8.0 to +8.0 (total width ~27px)
    const layer5 = [
      { dx: -6.5, dy: -10.2, tilt: 0.05 },
      { dx: 0.0, dy: -10.6, tilt: -0.04 },
      { dx: 6.5, dy: -10.1, tilt: 0.06 },
      { dx: -8.0, dy: -9.0, tilt: -0.05 },
      { dx: -3.0, dy: -9.3, tilt: 0.04 },
      { dx: 3.0, dy: -9.2, tilt: -0.03 },
      { dx: 8.0, dy: -8.9, tilt: 0.05 },
      { dx: -5.0, dy: -8.2, tilt: -0.04 },
      { dx: 0.0, dy: -8.4, tilt: 0.06 },
      { dx: 5.0, dy: -8.1, tilt: -0.05 },
      { dx: -1.5, dy: -9.8, tilt: 0.03 }
    ].map(c => ({ ...c, layer: 5, rx: 5.4, ry: 2.0, depthShade: 1.0 }));

    // --- LAYER 6: Summit Cap (7 coins, layer 6) ---
    // Spans dx -4.5 to +4.5 (broad flat rounded summit cap, total width ~20px)
    const layer6 = [
      { dx: -3.5, dy: -12.4, tilt: -0.04 },
      { dx: 0.0, dy: -12.8, tilt: 0.05 },
      { dx: 3.5, dy: -12.3, tilt: -0.05 },
      { dx: -4.5, dy: -11.4, tilt: 0.06 },
      { dx: -1.0, dy: -11.6, tilt: -0.03 },
      { dx: 2.0, dy: -11.5, tilt: 0.04 },
      { dx: 4.5, dy: -11.2, tilt: -0.05 }
    ].map(c => ({ ...c, layer: 6, rx: 5.3, ry: 1.95, depthShade: 1.0 }));

    // PHASE 1 (first 50 coins):
    // 16 coins of Layer 0 + 15 coins of Layer 1 + 11 coins of Layer 2 + 8 coins of Layer 3
    // Provides 2 complete full-width foundation carpets + gentle central swelling
    let p1_0 = 0, p1_1 = 0, p1_2 = 0, p1_3 = 0;
    for (let step = 0; step < 50; step++) {
      if (p1_0 < layer0.length && (step % 3 === 0 || p1_1 >= layer1.length)) {
        pattern.push(layer0[p1_0++]);
      } else if (p1_1 < layer1.length && (step % 3 === 1 || p1_0 >= layer0.length)) {
        pattern.push(layer1[p1_1++]);
      } else if (p1_2 < layer2Center.length) {
        pattern.push(layer2Center[p1_2++]);
      } else if (p1_3 < layer3Phase1.length) {
        pattern.push(layer3Phase1[p1_3++]);
      } else if (p1_0 < layer0.length) {
        pattern.push(layer0[p1_0++]);
      } else if (p1_1 < layer1.length) {
        pattern.push(layer1[p1_1++]);
      }
    }

    // PHASE 2 (remaining 50 coins, index 50..99):
    // Layer 2 flanks (7) + Layer 3 extensions (9) + Layer 4 (16) + Layer 5 (11) + Layer 6 (7) = 50 coins
    layer2Flanks.forEach(c => pattern.push(c));
    layer3Phase2.forEach(c => pattern.push(c));
    layer4.forEach(c => pattern.push(c));
    layer5.forEach(c => pattern.push(c));
    layer6.forEach(c => pattern.push(c));

    return pattern;
  })();

  function drawSafeInnerHeap(ctx, cx, cy, coinsCount) {
    if (coinsCount <= 0) return;
    const count = Math.min(100, coinsCount);

    // 1. ETHEREAL AMBIENT GOLDEN RADIANCE (Screen composite mode, full chamber illumination)
    // Smoothly illuminates the chamber without hard box cuts or shelf occlusion
    ctx.save();
    ctx.beginPath();
    ctx.rect(IN_X, IN_Y, IN_W, IN_H);
    ctx.clip();

    ctx.globalCompositeOperation = 'screen';

    const glowAlpha = 0.16 + (count / 100) * 0.28;
    const glowRx = 44;
    const glowRy = 34;
    const glowY = cy - 7;

    ctx.save();
    ctx.translate(cx, glowY);
    ctx.scale(1.0, glowRy / glowRx);

    const glowGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, glowRx);
    glowGrad.addColorStop(0, `rgba(252, 211, 77, ${glowAlpha})`);          // warm amber-gold core
    glowGrad.addColorStop(0.35, `rgba(245, 158, 11, ${glowAlpha * 0.55})`); // luminous gold
    glowGrad.addColorStop(0.70, `rgba(217, 119, 6, ${glowAlpha * 0.20})`);  // soft diffusion
    glowGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');                          // 100% transparent zero-alpha falloff

    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(0, 0, glowRx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore(); // restores blend mode to 'source-over' and unclips

    // 2. FLOOR CONTACT SHADOW (Soft shadow on floor beneath coins, matching full bed width)
    const shadowW = count <= 50 ? (24 + (count / 50) * 14) : (38 + ((count - 50) / 50) * 3);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 3.2, shadowW, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // 3. COINS (Sorted by layer, then dy for natural painter's isometric stacking)
    const activeCoins = SAFE_HEAP_PATTERN.slice(0, count);
    activeCoins.sort((a, b) => (a.layer - b.layer) || (a.dy - b.dy));

    activeCoins.forEach(c => {
      drawSingleCoin(ctx, cx + c.dx, cy + c.dy, c.rx, c.ry, c.tilt, c.depthShade);
    });
  }

  function drawBar(ctx, bx, by, bw = 12.5, bh = 5.5) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.moveTo(bx + 1, by + bh + 1);
    ctx.lineTo(bx + bw + 2, by + bh + 1);
    ctx.lineTo(bx + bw + 1, by + bh + 2.5);
    ctx.lineTo(bx, by + bh + 2.5);
    ctx.closePath();
    ctx.fill();

    const gF = ctx.createLinearGradient(bx, by, bx, by + bh);
    gF.addColorStop(0, '#fef08a');
    gF.addColorStop(0.3, '#f59e0b');
    gF.addColorStop(0.8, '#b45309');
    gF.addColorStop(1, '#78350f');
    ctx.fillStyle = gF;
    ctx.beginPath();
    ctx.moveTo(bx + 1.2, by);
    ctx.lineTo(bx + bw - 1.2, by);
    ctx.lineTo(bx + bw, by + bh);
    ctx.lineTo(bx, by + bh);
    ctx.closePath();
    ctx.fill();

    const gT = ctx.createLinearGradient(bx, by - 2, bx, by);
    gT.addColorStop(0, '#fef9c3');
    gT.addColorStop(1, '#fde047');
    ctx.fillStyle = gT;
    ctx.beginPath();
    ctx.moveTo(bx + 2.2, by - 2.2);
    ctx.lineTo(bx + bw - 2.2, by - 2.2);
    ctx.lineTo(bx + bw - 1.2, by);
    ctx.lineTo(bx + 1.2, by);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.fillStyle = '#78350f';
    ctx.font = '3.5px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('999', bx + bw * 0.5, by + bh * 0.7);

    ctx.restore();
  }

  // =========================================================================
  // 6. SAFE ARCHITECTURAL DETAILS, HANGING LANTERN & MASTER SCENE RENDERER
  // =========================================================================

  function drawSafeVaultChassisAndDoor(ctx, gold, fl) {
    const shelfY = IN_Y + 23;
    const dx = SX - 13, dy = SY + 3, dw = 13, dh = SH - 6;

    // 1. Floor contact shadow & stepped forged iron plinth pedestal
    ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
    ctx.beginPath();
    if (typeof ctx.ellipse === "function") {
      ctx.ellipse(SX + SW * 0.44, SY + SH + 4.2, SW * 0.64, 5.2, 0, 0, Math.PI * 2);
    } else {
      ctx.arc(SX + SW * 0.44, SY + SH + 4.2, SW * 0.5, 0, Math.PI * 2);
    }
    ctx.fill();

    const plinthGrad = ctx.createLinearGradient(SX - 5, SY + SH + 1, SX + SW + 5, SY + SH + 5);
    plinthGrad.addColorStop(0, "#334155");
    plinthGrad.addColorStop(0.5, "#1e293b");
    plinthGrad.addColorStop(1, "#090d14");
    ctx.fillStyle = plinthGrad;
    ctx.fillRect(SX - 5, SY + SH + 1, SW + 10, 3.8);
    ctx.fillStyle = "rgba(253, 230, 138, 0.28)";
    ctx.fillRect(SX - 5, SY + SH + 1, SW + 10, 0.7);
    ctx.strokeStyle = "#090d14";
    ctx.lineWidth = 0.7;
    ctx.strokeRect(SX - 5, SY + SH + 1, SW + 10, 3.8);

    // Cast-bronze heavy vault feet / corner claw blocks
    [SX - 4.5, SX + SW - 3.5].forEach((fx) => {
      const fGrad = ctx.createLinearGradient(fx, SY + SH - 1, fx + 8, SY + SH + 5);
      fGrad.addColorStop(0, "#d97706");
      fGrad.addColorStop(0.45, "#92400e");
      fGrad.addColorStop(1, "#451a03");
      ctx.fillStyle = fGrad;
      ctx.fillRect(fx, SY + SH - 0.5, 8, 5.2);
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 0.55;
      ctx.strokeRect(fx, SY + SH - 0.5, 8, 5.2);
      ctx.fillStyle = "#fef08a";
      ctx.fillRect(fx + 3.2, SY + SH + 1.4, 1.4, 1.4);
    });

    // 2. Monolithic outer safe portal chassis (preserves w=96, h=74 geometry contract)
    ctx.fillStyle = "#222936";
    ctx.fillRect(SX - 3, SY - 2, SW + 6, SH + 4);

    const chassisGrad = ctx.createLinearGradient(SX - 3, SY - 2, SX + SW + 3, SY + SH + 2);
    chassisGrad.addColorStop(0, "#364257");
    chassisGrad.addColorStop(0.38, "#222936");
    chassisGrad.addColorStop(0.78, "#161c26");
    chassisGrad.addColorStop(1, "#0d1118");
    ctx.fillStyle = chassisGrad;
    ctx.fillRect(SX - 2.5, SY - 1.5, SW + 5, SH + 3);

    // Outer stepped gold/brass molding & top-left lantern rim highlight
    ctx.strokeStyle = "#c5a059";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(SX - 3, SY - 2, SW + 6, SH + 4);

    ctx.strokeStyle = "rgba(254, 240, 138, 0.48)";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(SX - 2.5, SY + SH + 1);
    ctx.lineTo(SX - 2.5, SY - 1.5);
    ctx.lineTo(SX + SW + 2.5, SY - 1.5);
    ctx.stroke();

    ctx.strokeStyle = "#080b10";
    ctx.lineWidth = 0.9;
    ctx.strokeRect(IN_X - 1.1, IN_Y - 1.1, IN_W + 2.2, IN_H + 2.2);

    // Engraved bronze corner gusset brackets on portal frame
    const drawCornerGusset = (cx, cy, sxDir, syDir) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(sxDir, syDir);
      ctx.fillStyle = "#92400e";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(8, 0);
      ctx.lineTo(8, 2.6);
      ctx.lineTo(2.6, 2.6);
      ctx.lineTo(2.6, 8);
      ctx.lineTo(0, 8);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#e2b857";
      ctx.lineWidth = 0.55;
      ctx.stroke();
      ctx.restore();
    };
    drawCornerGusset(SX - 3, SY - 2, 1, 1);
    drawCornerGusset(SX + SW + 3, SY - 2, -1, 1);
    drawCornerGusset(SX - 3, SY + SH + 2, 1, -1);
    drawCornerGusset(SX + SW + 3, SY + SH + 2, -1, -1);

    // Brass dome rivets along safe pilasters & lintel
    const drawBrassRivet = (rx, ry) => {
      ctx.fillStyle = "#92400e";
      ctx.beginPath();
      ctx.arc(rx, ry, 0.95, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fef08a";
      ctx.fillRect(rx - 0.5, ry - 0.5, 0.6, 0.6);
    };
    [SX + 12, SX + 25, SX + SW - 25, SX + SW - 12].forEach((rx) => {
      drawBrassRivet(rx, SY + 0.6);
      drawBrassRivet(rx, SY + SH - 0.6);
    });
    [SY + 12, SY + 25, SY + 41, SY + 56].forEach((ry) => {
      drawBrassRivet(SX + 0.6, ry);
      drawBrassRivet(SX + SW - 0.6, ry);
    });

    // Centered Imperial Vault Crest / Nameplate on Top Lintel (y = SY-2.4 .. SY+2.4)
    const crestCx = SX + SW * 0.5;
    const crestCy = SY + 0.2;
    ctx.fillStyle = "#0b0f17";
    ctx.fillRect(crestCx - 11, crestCy - 2.3, 22, 4.6);
    ctx.strokeStyle = "#d99b38";
    ctx.lineWidth = 0.85;
    ctx.strokeRect(crestCx - 11, crestCy - 2.3, 22, 4.6);
    ctx.fillStyle = "#fef08a";
    ctx.fillRect(crestCx - 10, crestCy - 1.9, 20, 0.6);
    drawBrassRivet(crestCx - 7.8, crestCy);
    drawBrassRivet(crestCx + 7.8, crestCy);
    // Central ruby-enamel bank emblem
    ctx.fillStyle = "#991b1b";
    ctx.beginPath();
    ctx.arc(crestCx, crestCy, 1.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.fillStyle = "#fca5a5";
    ctx.fillRect(crestCx - 0.6, crestCy - 0.7, 0.7, 0.7);

    // 3. Recessed multi-plate vault interior chamber
    const inGrad = ctx.createLinearGradient(IN_X, IN_Y, IN_X, IN_Y + IN_H);
    inGrad.addColorStop(0, "#04060a");
    inGrad.addColorStop(0.45, "#0a0e16");
    inGrad.addColorStop(1, "#121824");
    ctx.fillStyle = inGrad;
    ctx.fillRect(IN_X, IN_Y, IN_W, IN_H);

    // Back wall armored plate seams & rivets
    ctx.strokeStyle = "rgba(30, 41, 59, 0.55)";
    ctx.lineWidth = 0.75;
    [IN_X + 27, IN_X + 55].forEach((sxLine) => {
      ctx.beginPath();
      ctx.moveTo(sxLine, IN_Y + 1);
      ctx.lineTo(sxLine, IN_Y + IN_H - 4);
      ctx.stroke();
    });
    ctx.strokeStyle = "rgba(4, 6, 10, 0.85)";
    ctx.beginPath();
    ctx.moveTo(IN_X + 1, IN_Y + IN_H - 18);
    ctx.lineTo(IN_X + IN_W - 1, IN_Y + IN_H - 18);
    ctx.stroke();

    // Inner vault ceiling & side jamb shadow depth
    ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
    ctx.fillRect(IN_X, IN_Y, IN_W, 4);
    ctx.fillRect(IN_X, IN_Y, 3.2, IN_H);

    // Brass bolt striker mortise plates along inner left door jamb
    [dy + 12, dy + dh * 0.5 - 2, dy + dh - 16].forEach((by) => {
      ctx.fillStyle = "#78350f";
      ctx.fillRect(IN_X, by - 0.5, 2.2, 5.5);
      ctx.fillStyle = "#040508";
      ctx.fillRect(IN_X + 0.5, by + 0.5, 1.3, 3.5);
    });

    // Royal crimson vault floor velvet trim along bottom edge
    ctx.fillStyle = "#3a0d14";
    ctx.fillRect(IN_X + 1, IN_Y + IN_H - 3.8, IN_W - 2, 3.8);
    ctx.fillStyle = "rgba(217, 155, 56, 0.65)";
    ctx.fillRect(IN_X + 1, IN_Y + IN_H - 3.8, IN_W - 2, 0.7);

    // 4. Reinforced Interior Shelf (preserves w=82, h=3.5 geometry contract)
    ctx.fillStyle = "#222b38";
    ctx.fillRect(IN_X, shelfY, IN_W, 3.5);

    const shelfGrad = ctx.createLinearGradient(IN_X, shelfY, IN_X, shelfY + 3.5);
    shelfGrad.addColorStop(0, "#475569");
    shelfGrad.addColorStop(0.55, "#263142");
    shelfGrad.addColorStop(1, "#0f172a");
    ctx.fillStyle = shelfGrad;
    ctx.fillRect(IN_X, shelfY, IN_W, 3.5);

    ctx.fillStyle = "rgba(253, 224, 71, 0.55)";
    ctx.fillRect(IN_X, shelfY, IN_W, 0.7);
    ctx.strokeStyle = "#c5a059";
    ctx.lineWidth = 0.85;
    ctx.strokeRect(IN_X, shelfY, IN_W, 3.5);
    ctx.fillStyle = "rgba(0, 0, 0, 0.48)";
    ctx.fillRect(IN_X, shelfY + 3.5, IN_W, 2.0);
    [IN_X + 9, IN_X + 25, IN_X + 41, IN_X + 57, IN_X + 73].forEach((rx) => {
      drawBrassRivet(rx, shelfY + 1.9);
    });

    // Ornate scrolled cast-bronze corbel brackets
    [
      { x: IN_X, dir: 1 },
      { x: IN_X + IN_W, dir: -1 },
    ].forEach(({ x: bx, dir }) => {
      ctx.fillStyle = "#92400e";
      ctx.beginPath();
      ctx.moveTo(bx, shelfY + 3.5);
      ctx.lineTo(bx + dir * 6.5, shelfY + 3.5);
      ctx.quadraticCurveTo(bx + dir * 2.5, shelfY + 6.2, bx, shelfY + 10.2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#e2b857";
      ctx.lineWidth = 0.55;
      ctx.stroke();
      ctx.fillStyle = "#fef08a";
      ctx.fillRect(bx + dir * 1.6 - 0.4, shelfY + 5.0, 0.8, 0.8);
    });

    // Bullion bars on upper shelf
    if (gold > 3000000) {
      const totalBars = Math.min(11, Math.floor((gold - 3000000) / 700000) + 1);
      for (let b = 0; b < totalBars; b++) {
        const isSecondRow = b >= 6;
        const col = isSecondRow ? b - 6 : b;
        const bx = IN_X + (isSecondRow ? 9 : 4) + col * 12;
        const by = isSecondRow ? shelfY - 11.5 : shelfY - 6;
        drawBar(ctx, bx, by, 12.5, 5.5);
      }
    }

    // 5. Projecting Combination Dial & Spoked Brass Vault Handwheel on left door front
    const handHubX = dx - 6.5;
    const handHubY = dy + dh * 0.52;

    // Upper brass key escutcheon plate & knurled combination dial turret protruding left of door slab
    ctx.fillStyle = "#b45309";
    ctx.fillRect(dx - 2.0, dy + 8.5, 2.1, 4.2);
    ctx.fillStyle = "#fef08a";
    ctx.fillRect(dx - 1.5, dy + 9.2, 0.8, 1.2);

    const dialGrad = ctx.createLinearGradient(dx - 3.6, dy + 17, dx - 3.6, dy + 24);
    dialGrad.addColorStop(0, "#fef08a");
    dialGrad.addColorStop(0.35, "#d97706");
    dialGrad.addColorStop(0.85, "#78350f");
    dialGrad.addColorStop(1, "#451a03");
    ctx.fillStyle = dialGrad;
    ctx.fillRect(dx - 3.5, dy + 17.5, 3.6, 6.5);
    ctx.strokeStyle = "#451a03";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(dx - 3.5, dy + 17.5, 3.6, 6.5);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(dx - 3.8, dy + 18.2, 1.1, 5.1);

    // Central wheel mounting rose & horizontal spindle axle
    ctx.fillStyle = "#78350f";
    ctx.fillRect(dx - 1.8, handHubY - 4.2, 2.0, 8.4);
    const axleG = ctx.createLinearGradient(handHubX, handHubY - 1.6, handHubX, handHubY + 1.6);
    axleG.addColorStop(0, "#fef08a");
    axleG.addColorStop(0.45, "#d97706");
    axleG.addColorStop(1, "#451a03");
    ctx.fillStyle = axleG;
    ctx.fillRect(handHubX, handHubY - 1.5, 6.5, 3.0);

    // Foreshortened spoked brass captain's wheel (3/4 edge perspective)
    ctx.save();
    ctx.translate(handHubX, handHubY);
    // Wheel shadow ring
    ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    if (typeof ctx.ellipse === "function") {
      ctx.ellipse(0.6, 0.7, 2.7, 8.6, 0, 0, Math.PI * 2);
    } else {
      ctx.arc(0.6, 0.7, 5.0, 0, Math.PI * 2);
    }
    ctx.stroke();

    // Spokes radiating from hub to wheel rim
    ctx.strokeStyle = "#b45309";
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(0, -8.3);
    ctx.lineTo(0, 8.3);
    ctx.moveTo(-2.5, -2.5);
    ctx.lineTo(2.5, 2.5);
    ctx.moveTo(-2.5, 2.5);
    ctx.lineTo(2.5, -2.5);
    ctx.stroke();

    // Cast-brass wheel ring + top-left lantern specular glint
    ctx.strokeStyle = "#d97706";
    ctx.lineWidth = 1.85;
    ctx.beginPath();
    if (typeof ctx.ellipse === "function") {
      ctx.ellipse(0, 0, 2.6, 8.4, 0, 0, Math.PI * 2);
    } else {
      ctx.arc(0, 0, 5.0, 0, Math.PI * 2);
    }
    ctx.stroke();

    ctx.strokeStyle = "#fef08a";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    if (typeof ctx.ellipse === "function") {
      ctx.ellipse(-0.3, -0.4, 2.3, 7.9, 0, Math.PI * 0.8, Math.PI * 1.75);
    } else {
      ctx.arc(-0.3, -0.4, 4.6, Math.PI * 0.8, Math.PI * 1.75);
    }
    ctx.stroke();

    // Protruding brass handle knobs + turned center hub cap
    [
      [0, -9.8],
      [0, 9.8],
      [-3.3, 0],
    ].forEach(([kx, ky]) => {
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.arc(kx, ky, 1.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fef9c3";
      ctx.fillRect(kx - 0.4, ky - 0.5, 0.5, 0.5);
    });
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.arc(0, 0, 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fef08a";
    ctx.fillRect(-0.7, -0.8, 0.8, 0.8);
    ctx.restore();

    // 6. 90-degree Door Profile on Left (preserves x=63, w=4, h=64 geometry contract)
    ctx.fillStyle = "#334155";
    ctx.fillRect(dx, dy, 4, dh);
    ctx.fillStyle = "#b45309";
    ctx.fillRect(dx + 4, dy, 4, dh);
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(dx + 8, dy, 5, dh);

    // Layered metallic armor gradients over the door slices
    const outerSlabG = ctx.createLinearGradient(dx, dy, dx + 4, dy);
    outerSlabG.addColorStop(0, "#64748b");
    outerSlabG.addColorStop(0.45, "#334155");
    outerSlabG.addColorStop(1, "#1e293b");
    ctx.fillStyle = outerSlabG;
    ctx.fillRect(dx, dy, 4, dh);

    const midCoreG = ctx.createLinearGradient(dx + 4, dy, dx + 8, dy);
    midCoreG.addColorStop(0, "#f59e0b");
    midCoreG.addColorStop(0.5, "#b45309");
    midCoreG.addColorStop(1, "#78350f");
    ctx.fillStyle = midCoreG;
    ctx.fillRect(dx + 4, dy, 4, dh);

    const innerStepG = ctx.createLinearGradient(dx + 8, dy, dx + 13, dy);
    innerStepG.addColorStop(0, "#334155");
    innerStepG.addColorStop(0.65, "#1e293b");
    innerStepG.addColorStop(1, "#090d14");
    ctx.fillStyle = innerStepG;
    ctx.fillRect(dx + 8, dy, 5, dh);

    // Warm lantern rim catchlight & chamfered top/bottom door endcaps
    ctx.fillStyle = "rgba(254, 240, 138, 0.52)";
    ctx.fillRect(dx, dy, 1.0, dh);
    ctx.fillStyle = "#475569";
    ctx.fillRect(dx, dy, dw, 2.2);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(dx, dy + dh - 2.2, dw, 2.2);
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 0.95;
    ctx.strokeRect(dx, dy, dw, dh);

    // Outer door armor rivet seam
    for (let y = dy + 5; y < dy + dh - 4; y += 9) {
      ctx.fillStyle = "#475569";
      ctx.fillRect(dx + 1.2, y, 1.8, 1.8);
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(dx + 1.3, y, 0.8, 0.8);
    }

    // 3 Machined Chrome-Steel Locking Deadbolts & Brass Collar Sleeves
    [dy + 12, dy + dh * 0.5 - 2, dy + dh - 16].forEach((by) => {
      ctx.fillStyle = "#92400e";
      ctx.fillRect(dx + dw - 1.2, by - 0.5, 2.0, 5.5);

      const boltG = ctx.createLinearGradient(dx + dw, by, dx + dw, by + 4.5);
      boltG.addColorStop(0, "#64748b");
      boltG.addColorStop(0.35, "#f8fafc");
      boltG.addColorStop(0.7, "#94a3b8");
      boltG.addColorStop(1, "#334155");
      ctx.fillStyle = boltG;
      ctx.fillRect(dx + dw, by, 5.4, 4.5);
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(dx + dw, by, 5.4, 4.5);
    });

    // 2 Turned Multi-Knuckle Cast-Bronze Barrel Hinges + Strap Plates
    [SY + 8, SY + SH - 16].forEach((hy) => {
      ctx.fillStyle = "#5c2b0a";
      ctx.fillRect(SX - 4.2, hy + 1.5, 7.6, 4.2);

      const hingeG = ctx.createLinearGradient(SX - 3, hy, SX + 2.5, hy);
      hingeG.addColorStop(0, "#78350f");
      hingeG.addColorStop(0.42, "#f59e0b");
      hingeG.addColorStop(0.65, "#fef08a");
      hingeG.addColorStop(1, "#451a03");
      ctx.fillStyle = hingeG;
      ctx.fillRect(SX - 3, hy, 5.4, 7.2);
      ctx.strokeStyle = "#451a03";
      ctx.lineWidth = 0.45;
      ctx.strokeRect(SX - 3, hy, 5.4, 7.2);
      // Knuckle division & brass ball finials
      ctx.fillStyle = "#451a03";
      ctx.fillRect(SX - 2.8, hy + 2.3, 5.0, 0.7);
      ctx.fillRect(SX - 2.8, hy + 4.4, 5.0, 0.7);
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.arc(SX - 0.3, hy - 0.6, 1.35, 0, Math.PI * 2);
      ctx.arc(SX - 0.3, hy + 7.8, 1.35, 0, Math.PI * 2);
      ctx.fill();
    });

    // Warm bounce tint on safe upper-left rim synced with lantern flicker
    if (fl) {
      const warmEdgeAlpha = Math.max(0.08, 0.16 + fl.alphaJitter * 0.9);
      ctx.fillStyle = `rgba(255, 198, 92, ${warmEdgeAlpha})`;
      ctx.fillRect(SX - 3, SY - 2, 26, 1.5);
    }
  }

  function drawSafeHangingLantern(ctx, x, y, warmMix = BANK_LIGHT_WARM_MIX, tSec = 0) {
    ctx.save();
    ctx.translate(x, y);

    const fl = computeBankFlameFlicker(tSec, 1.4);

    // 1. Standardized warm lantern radial glow aura around lantern core (y=+29)
    drawBankStandardLightGlow(ctx, 0, 29, 14, 35, 70, tSec, warmMix, 1.4);

    // 2. Wrought-iron top-left stone wall mounting plate, ceiling lug & diagonal bracket arm
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(-26, 8.8, 2.8, 8.6);
    ctx.fillStyle = "#d97706";
    ctx.fillRect(-25.2, 10.2, 1.1, 1.1);
    ctx.fillRect(-25.2, 14.8, 1.1, 1.1);

    ctx.strokeStyle = "#090d14";
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(-25.2, 13);
    ctx.lineTo(0, 4.5);
    ctx.stroke();

    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-25.2, 13);
    ctx.lineTo(0, 4.5);
    ctx.stroke();

    // Decorative S-scroll brace & wall plate rivet
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1.05;
    ctx.beginPath();
    ctx.moveTo(-18, 10.5);
    ctx.quadraticCurveTo(-13, 2.5, -5, 6.2);
    ctx.stroke();
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(-2.5, 0, 5, 4.5);
    ctx.fillStyle = "#d97706";
    ctx.fillRect(-20, 10.5, 1.8, 1.8);

    // 3 Forged iron chain links & bail suspension ring (y = 4..15)
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 1.1;
    for (let cy = 5.5; cy <= 11.5; cy += 3.0) {
      ctx.beginPath();
      if (typeof ctx.ellipse === "function") {
        ctx.ellipse(0, cy, 1.35, 1.8, 0, 0, Math.PI * 2);
      } else {
        ctx.arc(0, cy, 1.4, 0, Math.PI * 2);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(0, 14.5, 2.0, 0, Math.PI * 2);
    ctx.stroke();

    // 3. Stepped ventilated iron cupola hood & brass crown finial (y = 16..22)
    ctx.fillStyle = "#d97706";
    ctx.beginPath();
    ctx.arc(0, 16.5, 1.6, 0, Math.PI * 2);
    ctx.fill();

    const hoodG = ctx.createLinearGradient(-7, 17, 7, 22);
    hoodG.addColorStop(0, "#475569");
    hoodG.addColorStop(0.55, "#1e293b");
    hoodG.addColorStop(1, "#090d14");
    ctx.fillStyle = hoodG;
    ctx.beginPath();
    ctx.moveTo(-2.5, 16.5);
    ctx.lineTo(2.5, 16.5);
    ctx.lineTo(7.2, 21.8);
    ctx.lineTo(-7.2, 21.8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#090d14";
    ctx.lineWidth = 0.7;
    ctx.stroke();

    // Warm inner vent slits glowing softly in cupola hood
    ctx.fillStyle = "rgba(251, 191, 36, 0.78)";
    ctx.fillRect(-3.6, 19.2, 1.4, 1.1);
    ctx.fillRect(-0.7, 19.2, 1.4, 1.1);
    ctx.fillRect(2.2, 19.2, 1.4, 1.1);
    ctx.fillStyle = "rgba(253, 224, 71, 0.55)";
    ctx.fillRect(-6.8, 21.2, 13.6, 0.65);

    // 4. Illuminated warm amber glass core inside lantern (y = 22..38)
    const glassG = ctx.createRadialGradient(0, 30, 1.0, 0, 30, 8.6);
    glassG.addColorStop(0, "#fde047");
    glassG.addColorStop(0.36, "#d97706");
    glassG.addColorStop(0.75, "#92400e");
    glassG.addColorStop(1, "#451a03");
    ctx.fillStyle = glassG;
    ctx.fillRect(-5.8, 22.0, 11.6, 16.0);

    // Beveled glass reflection sheen & brass oil burner wick nozzle
    ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
    ctx.fillRect(-4.8, 23.0, 1.1, 13.5);
    ctx.fillStyle = "#92400e";
    ctx.fillRect(-2.4, 34.8, 4.8, 3.2);
    ctx.fillStyle = "#fbbf24";
    ctx.fillRect(-1.5, 34.8, 3.0, 1.2);
    ctx.fillStyle = "#1c1917";
    ctx.fillRect(-0.4, 33.4, 0.8, 1.5);

    // 5. Animated flame inside glass using standardized flame halo
    const flameY = 33.4;
    const flameH = 6.4 + fl.stretch;
    drawBankStandardFlameHalo(ctx, fl.sway * 0.4, 29.8, 6.0, tSec, warmMix, 1.4);

    ctx.fillStyle = "#f97316";
    ctx.beginPath();
    ctx.moveTo(-2.0, flameY);
    ctx.quadraticCurveTo(-2.5, flameY - flameH * 0.48, fl.sway * 0.6, flameY - flameH);
    ctx.quadraticCurveTo(2.5, flameY - flameH * 0.48, 2.0, flameY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#fffbeb";
    ctx.beginPath();
    ctx.moveTo(-0.95, flameY - 0.3);
    ctx.quadraticCurveTo(-1.2, flameY - flameH * 0.4, fl.sway * 0.35, flameY - flameH * 0.74);
    ctx.quadraticCurveTo(1.2, flameY - flameH * 0.4, 0.95, flameY - 0.3);
    ctx.closePath();
    ctx.fill();

    // 6. Protective forged metal grille / cage (drawn OVER glowing glass & flame)
    // Top & bottom guard collars
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(-7.4, 21.5, 14.8, 1.8);
    ctx.fillRect(-7.2, 37.5, 14.4, 1.8);
    ctx.strokeStyle = "#090d14";
    ctx.lineWidth = 0.6;
    ctx.strokeRect(-7.4, 21.5, 14.8, 1.8);
    ctx.strokeRect(-7.2, 37.5, 14.4, 1.8);

    // Middle horizontal iron guard hoop across glass front
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(-6.2, 30.2);
    ctx.lineTo(6.2, 30.2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(253, 224, 71, 0.42)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-5.8, 29.7);
    ctx.lineTo(5.8, 29.7);
    ctx.stroke();

    // 4 Vertical wrought-iron grille bars (2 outer corner posts + 2 front bowed ribs)
    ctx.strokeStyle = "#090d14";
    ctx.lineWidth = 1.45;
    [
      [-6.1, -6.5, -6.0],
      [-3.1, -3.4, -3.0],
      [3.1, 3.4, 3.0],
      [6.1, 6.5, 6.0],
    ].forEach(([tx, cxMid, bx]) => {
      ctx.beginPath();
      ctx.moveTo(tx, 22.8);
      ctx.quadraticCurveTo(cxMid, 30.0, bx, 38.0);
      ctx.stroke();
    });
    // Warm inner metallic catchlights along inner edges of grille ribs facing flame
    ctx.strokeStyle = "rgba(253, 224, 71, 0.52)";
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.moveTo(-2.5, 23.4);
    ctx.quadraticCurveTo(-2.8, 30.0, -2.5, 37.4);
    ctx.moveTo(2.5, 23.4);
    ctx.quadraticCurveTo(2.8, 30.0, 2.5, 37.4);
    ctx.stroke();

    // Tiny brass collar rivets on cage corners
    ctx.fillStyle = "#f59e0b";
    [
      [-6.0, 22.4],
      [6.0, 22.4],
      [-5.8, 38.4],
      [5.8, 38.4],
    ].forEach(([rx, ry]) => {
      ctx.fillRect(rx - 0.5, ry - 0.5, 1.0, 1.0);
    });

    // 7. Cast-iron oil reservoir sump & drop finial (y = 39..44.5)
    ctx.fillStyle = "#1e293b";
    ctx.beginPath();
    ctx.moveTo(-5.6, 39.2);
    ctx.lineTo(5.6, 39.2);
    ctx.lineTo(2.6, 42.2);
    ctx.lineTo(-2.6, 42.2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.fillStyle = "#b45309";
    ctx.beginPath();
    ctx.moveTo(-1.3, 42.2);
    ctx.lineTo(1.3, 42.2);
    ctx.lineTo(0, 44.8);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function renderFullScene(ctx, gold, sessionProfile, animTimeMs = 0) {
    if (!sessionProfile) sessionProfile = buildSessionProfile(12345);
    const tSec = (animTimeMs || 0) * 0.001;
    const fl = computeBankFlameFlicker(tSec, 1.4);

    if (typeof ctx.clearRect === "function") {
      ctx.clearRect(0, 0, CW, CH);
    }

    // -----------------------------------------------------------------------
    // LAYER 1: Stone Ashlar Wall Backdrop & Floor Plinth
    // -----------------------------------------------------------------------
    const bg = ctx.createLinearGradient(0, 0, 0, CH);
    bg.addColorStop(0, '#0c0f14');
    bg.addColorStop(0.65, '#06080b');
    bg.addColorStop(1, '#020305');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CW, CH);

    ctx.fillStyle = '#181b22';
    ctx.strokeStyle = '#0f1217';
    ctx.lineWidth = 1;
    for (let y = 0; y < 144; y += 12) {
      const isOffset = (Math.floor(y / 12) % 2 === 1);
      const shift = isOffset ? 16 : 0;
      ctx.beginPath();
      ctx.moveTo(0, y); ctx.lineTo(CW, y); ctx.stroke();
      for (let x = shift; x < CW; x += 32) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 12); ctx.stroke();
      }
    }

    ctx.fillStyle = '#0f141d';
    ctx.fillRect(0, 144, CW, CH - 144);
    ctx.strokeStyle = '#1b2230';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, 144); ctx.lineTo(CW, 144);
    ctx.moveTo(0, 156); ctx.lineTo(CW, 156);
    ctx.stroke();

    // Warm wall & floor light pool radiating from the top-left hanging lantern
    const wallAlpha = Math.max(0.08, (0.24 + fl.alphaJitter * 0.6) * BANK_LIGHT_WARM_MIX);
    const rad = ctx.createRadialGradient(26, 29, 6, 48, 56, 146 + fl.radiusPulse);
    rad.addColorStop(0, `rgba(255, 204, 102, ${wallAlpha})`);
    rad.addColorStop(0.45, `rgba(217, 119, 6, ${wallAlpha * 0.44})`);
    rad.addColorStop(0.8, `rgba(180, 83, 9, ${wallAlpha * 0.14})`);
    rad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, CW, CH);

    // -----------------------------------------------------------------------
    // BUDGET & PLACES ACTIVATION COMPUTATION
    // -----------------------------------------------------------------------
    const totalVisualCoins = gold > 0 ? Math.max(1, Math.min(1000, Math.floor(gold / 5000))) : 0;

    let safeHeapCoins = 0;
    let placesCoins = 0;

    if (totalVisualCoins <= 50) {
      safeHeapCoins = totalVisualCoins;
      placesCoins = 0;
    } else {
      const rem = totalVisualCoins - 50;
      const extraSafe = Math.min(50, Math.floor(rem * (50 / 950)));
      safeHeapCoins = 50 + extraSafe;
      placesCoins = totalVisualCoins - safeHeapCoins;
    }

    let activeCount = 0;
    if (placesCoins > 0) {
      const millionCount = Math.floor(gold / 1000000);
      const totalJitter = millionCount * sessionProfile.jitter;
      const basePlaces = Math.floor(gold / 200000);
      activeCount = Math.max(2, Math.min(22, basePlaces + totalJitter));
    }

    const activeSlots = sessionProfile.queue.slice(0, activeCount);

    const slotBudgets = {};
    sessionProfile.queue.forEach(s => slotBudgets[s.id] = 0);
    for (let i = 0; i < placesCoins; i++) {
      const targetSlotId = sessionProfile.globalCoinStream[i];
      if (targetSlotId) {
        slotBudgets[targetSlotId]++;
      }
    }

    const nearScatterPiles = Math.floor(totalVisualCoins / 100);
    const farScatterPiles = totalVisualCoins >= 400 ? Math.floor((totalVisualCoins - 300) / 100) : 0;

    // -----------------------------------------------------------------------
    // LAYER 2: BACKGROUND PLACES (Rendered BEHIND Safe Chassis)
    // -----------------------------------------------------------------------
    const bgSlots = activeSlots.filter(s => {
      return s.category === 'top' || ['far_4', 'far_5', 'far_6', 'far_7', 'far_8'].includes(s.id);
    });
    const sortedBgSlots = [...bgSlots].sort((a, b) => a.y - b.y);

    sortedBgSlots.forEach(slot => {
      const b = slotBudgets[slot.id] || 0;
      if (b > 0) {
        const prof = sessionProfile.slotProfiles[slot.id];
        const pilesCount = slot.category === 'far' ? farScatterPiles : 0;
        drawPlaceCluster(ctx, slot.x, slot.y, b, prof, slot.isSmall, slot.isRoofUnder, pilesCount);
      }
    });

    // -----------------------------------------------------------------------
    // LAYER 3: DETAILED MONOLITHIC PORTAL, VAULT INTERIOR & DOOR
    // -----------------------------------------------------------------------
    drawSafeVaultChassisAndDoor(ctx, gold, fl);

    // -----------------------------------------------------------------------
    // LAYER 4: INNER SAFE HEAP
    // -----------------------------------------------------------------------
    drawSafeInnerHeap(ctx, IN_X + IN_W * 0.5, IN_Y + IN_H - 4.5, safeHeapCoins);

    // -----------------------------------------------------------------------
    // LAYER 5: FOREGROUND FLOOR PLACES ("Near" & Floor "Far")
    // -----------------------------------------------------------------------
    const floorSlots = activeSlots.filter(s => {
      return s.category === 'near' || ['far_1', 'far_2', 'far_3'].includes(s.id);
    });
    const sortedFloorSlots = [...floorSlots].sort((a, b) => a.y - b.y);

    sortedFloorSlots.forEach(slot => {
      const b = slotBudgets[slot.id] || 0;
      if (b > 0) {
        const prof = sessionProfile.slotProfiles[slot.id];
        const pilesCount = slot.category === 'near' ? nearScatterPiles : farScatterPiles;
        drawPlaceCluster(ctx, slot.x, slot.y, b, prof, slot.isSmall, slot.isRoofUnder, pilesCount);
      }
    });

    // -----------------------------------------------------------------------
    // LAYER 5B: TOP-LEFT HANGING CAGED LANTERN (STANDARDIZED LIGHT SOURCE)
    // -----------------------------------------------------------------------
    drawSafeHangingLantern(ctx, 26, 0, BANK_LIGHT_WARM_MIX, tSec);

    // -----------------------------------------------------------------------
    // LAYER 5C: TREASURES (POISSON-SPACED ON OPEN STONE FLOOR ONLY)
    // -----------------------------------------------------------------------
    const treasureCount = Math.floor(totalVisualCoins / 100);
    if (treasureCount > 0 && sessionProfile.sessionTreasures) {
      const activeTreasures = sessionProfile.sessionTreasures.slice(0, treasureCount);
      const sortedTreasures = [...activeTreasures].sort((a, b) => a.ty - b.ty);

      sortedTreasures.forEach(item => {
        switch (item.type) {
          case 0: drawBlueGem(ctx, item.tx, item.ty, item.inv); break;
          case 1: drawRedGem(ctx, item.tx, item.ty, item.inv); break;
          case 2: drawDiamond(ctx, item.tx, item.ty, item.inv); break;
          case 3: drawGoldRing(ctx, item.tx, item.ty, item.inv); break;
        }
      });
    }

    // -----------------------------------------------------------------------
    // LAYER 5D: STANDARDIZED COIN & BULLION SPARKLES
    // -----------------------------------------------------------------------
    if (totalVisualCoins > 0) {
      const { p1, p2 } = computeBankSparklePulses(tSec);

      // Sparkle 1 (p1): prominent active gold coin stack peak (or safe heap crest below 255k)
      if (placesCoins > 0 && activeSlots.length > 0) {
        const spSlot =
          activeSlots.find((s) => s.category === 'near' && (slotBudgets[s.id] || 0) > 0) ||
          activeSlots.find((s) => !s.isRoofUnder && (slotBudgets[s.id] || 0) > 0) ||
          activeSlots[0];
        const spCount = slotBudgets[spSlot.id] || 0;
        const spProf = sessionProfile.slotProfiles[spSlot.id];
        if (spCount > 0 && spProf) {
          const counts = distributeCoinsInPlace(spCount, spProf);
          const stepY = spSlot.isSmall ? 1.7 : 2.2;
          const spX = spSlot.isSmall ? 3.8 : 5.0;
          const spY = spSlot.isSmall ? 2.1 : 2.8;
          const px = spSlot.x + spProf.jx;
          const py = spSlot.y + spProf.jy;
          const pts = [
            { x: px + 0.5, y: py - spY, h: counts[0] * stepY },
            { x: px - spX, y: py + spY * 0.4, h: counts[1] * stepY },
            { x: px + spX * 0.9, y: py + spY * 0.8, h: counts[2] * stepY },
          ];
          let peak = pts[0];
          for (let i = 1; i < pts.length; i++) {
            if (pts[i].h > peak.h) peak = pts[i];
          }
          drawBankSparkle(ctx, peak.x, peak.y - peak.h - 1.5, 2, p1 * 0.85);
        }
      } else if (safeHeapCoins > 0) {
        const heapActive = SAFE_HEAP_PATTERN.slice(0, Math.min(100, safeHeapCoins));
        let topCoin = heapActive[0];
        for (let i = 1; i < heapActive.length; i++) {
          if (heapActive[i].dy < topCoin.dy) topCoin = heapActive[i];
        }
        if (topCoin) {
          drawBankSparkle(
            ctx,
            IN_X + IN_W * 0.5 + topCoin.dx - 1,
            IN_Y + IN_H - 4.5 + topCoin.dy - 1.5,
            2,
            p1 * 0.85,
          );
        }
      }

      // Sparkle 2 (p2): shelf bullion bar top above 3M, else roof/secondary coin crest
      if (gold > 3000000) {
        const totalBars = Math.min(11, Math.floor((gold - 3000000) / 700000) + 1);
        const leadBar = totalBars > 6 ? 6 : 0;
        const isSecondRow = leadBar >= 6;
        const col = isSecondRow ? leadBar - 6 : leadBar;
        const shelfY = IN_Y + 23;
        const bx = IN_X + (isSecondRow ? 9 : 4) + col * 12;
        const by = isSecondRow ? shelfY - 11.5 : shelfY - 6;
        drawBankSparkle(ctx, bx + 5, by - 1.5, 2, p2 * 0.82);
      } else if (placesCoins > 0 && activeSlots.length > 1) {
        const secSlot =
          activeSlots.find((s) => s.category === 'top' && (slotBudgets[s.id] || 0) > 0) ||
          activeSlots[1];
        const secCount = slotBudgets[secSlot.id] || 0;
        const secProf = sessionProfile.slotProfiles[secSlot.id];
        if (secCount > 0 && secProf) {
          const counts = distributeCoinsInPlace(secCount, secProf);
          const stepY = secSlot.isSmall ? 1.7 : 2.2;
          drawBankSparkle(
            ctx,
            secSlot.x + secProf.jx,
            secSlot.y + secProf.jy - Math.max(...counts) * stepY - 1.5,
            2,
            p2 * 0.82,
          );
        }
      } else if (safeHeapCoins >= 2) {
        const secCoin = SAFE_HEAP_PATTERN[Math.min(safeHeapCoins - 1, 1)];
        if (secCoin) {
          drawBankSparkle(
            ctx,
            IN_X + IN_W * 0.5 + secCoin.dx + 1,
            IN_Y + IN_H - 4.5 + secCoin.dy - 1.5,
            2,
            p2 * 0.82,
          );
        }
      }
    }

    // -----------------------------------------------------------------------
    // LAYER 6: OPTIONAL WIREFRAME MARKERS
    // -----------------------------------------------------------------------
    if (showSlotMarkers) {
      ctx.save();
      sessionProfile.queue.forEach((slot, qIdx) => {
        const isActive = qIdx < activeCount;
        const isNext = qIdx === activeCount;

        ctx.strokeStyle = isActive ? '#10b981' : (isNext ? '#f59e0b' : '#64748b');
        ctx.lineWidth = isActive ? 1.2 : 0.8;
        if (typeof ctx.setLineDash === 'function') {
          ctx.setLineDash(isActive ? [] : [2, 2]);
        }

        ctx.beginPath();
        ctx.ellipse(slot.x, slot.y, slot.isSmall ? 8 : 11, slot.isSmall ? 4.5 : 6, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = isActive ? '#10b981' : (isNext ? '#f59e0b' : '#94a3b8');
        ctx.font = '7.5px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`Q${qIdx + 1}`, slot.x, slot.y - (slot.isSmall ? 6 : 7));
      });
      ctx.restore();
    }

    return {
      totalVisualCoins,
      safeHeapCoins,
      placesCoins,
      activeCount,
      activeSlots,
      slotBudgets,
      treasureCount,
      nearScatterPiles,
      farScatterPiles
    };
  }

  // =========================================================================
  // 7. UI CONTROLLER & INSPECTOR LIST SYNC
  // =========================================================================


  // =========================================================================
  // LETTERS OF CREDIT DESK SCENE (PORTED FROM CALIBRATION STAND V16)
  // =========================================================================
  function getNotesDeskBounds(y) {
    const t = Math.max(0, Math.min(1, (y - 68) / (152 - 68)));
    return {
      left: 36 + (4 - 36) * t,
      right: 174 + (206 - 174) * t,
    };
  }

  function getNotesBlotterBounds(y) {
    const d = getNotesDeskBounds(y);
    return {
      left: d.left + 16,
      right: d.right - 16,
    };
  }

  function getNotesGoldBorderBounds(y) {
    const b = getNotesBlotterBounds(y);
    return {
      left: b.left + 3.5,
      right: b.right - 3.5,
    };
  }

  function projectNotesDeskQuad(cx, cy, halfW, halfD, yaw, scale, extraPersp = 0.0055) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const yComp = 0.46;
    const vanishBias = (105 - cx) * 0.0042;
    const mapPt = (lx, lz) => {
      const rx = lx * c - lz * s;
      const rz = lx * s + lz * c;
      const p = 1 + rz * extraPersp;
      return {
        x: cx + (rx * p + -rz * vanishBias) * scale,
        y: cy + rz * yComp * p * scale,
      };
    };
    return {
      tl: mapPt(-halfW, -halfD),
      tr: mapPt(halfW, -halfD),
      br: mapPt(halfW, halfD),
      bl: mapPt(-halfW, halfD),
    };
  }

  function evalNotesQuadSurf(q, u, v) {
    const tu = (u + 1) * 0.5;
    const tv = (v + 1) * 0.5;
    const topX = q.tl.x + (q.tr.x - q.tl.x) * tu;
    const topY = q.tl.y + (q.tr.y - q.tl.y) * tu;
    const botX = q.bl.x + (q.br.x - q.bl.x) * tu;
    const botY = q.bl.y + (q.br.y - q.bl.y) * tu;
    return {
      x: topX + (botX - topX) * tv,
      y: topY + (botY - topY) * tv,
    };
  }

  function fillNotesQuadSubRect(ctx, q, u1, u2, v1, v2) {
    const a = evalNotesQuadSurf(q, u1, v1);
    const b = evalNotesQuadSurf(q, u2, v1);
    const c = evalNotesQuadSurf(q, u2, v2);
    const d = evalNotesQuadSurf(q, u1, v2);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
  }

  const NOTES_PLACE_BOOK_INVARIANTS = [
    // PLACE 0 (L1): 3/4 perspective, bottom fore-edge right, max 10 books
    [
      { halfW: 13.8, halfD: 11.2, thick: 3.15, dYaw: -0.02, coverTop: "#4a1515", coverBot: "#240808", spineTop: "#330c0c", spineBot: "#160404", border: "rgba(178,132,54,0.48)", ribColor: "#9c7730", ribs: 4, pagesEdge: "#d6c6a1", striations: "#6c512c", corners: false, emblem: "#b89140", decor: { kind: "slip", color: "#cfc09b", dx: 4.2, dy: 2.2 } },
      { halfW: 13.0, halfD: 11.8, thick: 3.10, dYaw: 0.03, coverTop: "#152e1e", coverBot: "#09170f", spineTop: "#0d1f14", spineBot: "#050d08", border: "rgba(148,116,44,0.42)", ribColor: "#7f6229", ribs: 3, pagesEdge: "#cfc09a", striations: "#5e4926", corners: "#9e7c36", emblem: false, decor: { kind: "ribbon", color: "#244f35", hi: "#3a7551", dx: 5.0, dy: 3.2 } },
      { halfW: 14.4, halfD: 10.6, thick: 3.20, dYaw: -0.04, coverTop: "#452813", coverBot: "#231307", spineTop: "#331b0b", spineBot: "#160b03", border: "rgba(145,104,40,0.42)", ribColor: "#7c511d", ribs: 4, pagesEdge: "#cbb992", striations: "#634725", corners: false, emblem: false, decor: { kind: "cord_ring", color: "#2b1608", accent: "#997134", dx: 4.0, dy: 3.8 } },
      { halfW: 13.4, halfD: 11.4, thick: 3.10, dYaw: 0.02, coverTop: "#192434", coverBot: "#0b111b", spineTop: "#101824", spineBot: "#060a10", border: "rgba(148,163,184,0.38)", ribColor: "#7b8fa6", ribs: 5, pagesEdge: "#d4c9af", striations: "#5a523e", corners: "#8c9fb5", emblem: false, decor: { kind: "tassel", color: "#3b5878", tip: "#c49a3c", dx: 4.8, dy: 2.8 } },
    ],
    // PLACE 1 (L2): spine facing camera, bottom fore-edge right, max 14 books
    [
      { halfW: 14.8, halfD: 12.2, thick: 3.05, dYaw: -0.02, coverTop: "#4c1317", coverBot: "#24070a", spineTop: "#380c10", spineBot: "#170406", border: "rgba(176,129,48,0.45)", ribColor: "#a88132", ribs: 4, pagesEdge: "#d5c5a0", striations: "#684e2b", corners: false, emblem: "#b38c3b", band: true, decor: { kind: "tassel", color: "#781d1d", tip: "#c49635", dx: 4.6, dy: 2.8 } },
      { halfW: 14.2, halfD: 12.6, thick: 3.10, dYaw: 0.03, coverTop: "#142b22", coverBot: "#081510", spineTop: "#0d1f18", spineBot: "#050c09", border: "rgba(140,108,38,0.42)", ribColor: "#856527", ribs: 5, pagesEdge: "#cfc09c", striations: "#5c4727", corners: "#9e7834", emblem: false, band: false, decor: { kind: "slip", color: "#cbb88e", dx: 4.0, dy: 2.0 } },
      { halfW: 15.2, halfD: 11.6, thick: 3.15, dYaw: -0.03, coverTop: "#3a2111", coverBot: "#1d0f07", spineTop: "#2b170a", spineBot: "#120903", border: "rgba(130,92,38,0.40)", ribColor: "#754e20", ribs: 3, pagesEdge: "#cbb78f", striations: "#5e4222", corners: false, emblem: false, band: true, decor: { kind: "ribbon", color: "#5c411f", hi: "#856235", dx: 5.0, dy: 3.4 } },
      { halfW: 14.5, halfD: 12.0, thick: 3.05, dYaw: 0.02, coverTop: "#212229", coverBot: "#0f1014", spineTop: "#16171c", spineBot: "#08080a", border: "rgba(161,126,56,0.42)", ribColor: "#947435", ribs: 4, pagesEdge: "#cfc3a6", striations: "#574a34", corners: "#8a7242", emblem: "#9e7d3d", band: false, decor: { kind: "cord_ring", color: "#1f364d", accent: "#8ca1b8", dx: 4.2, dy: 3.5 } },
    ],
    // PLACE 2 (L3): frontal projection, max 7 books
    [
      { halfW: 14.6, halfD: 13.6, thick: 3.20, dYaw: -0.02, coverTop: "#40180e", coverBot: "#1e0a05", spineTop: "#2c0f08", spineBot: "#120502", border: "rgba(160,110,42,0.44)", ribColor: "#916328", ribs: 4, pagesEdge: "#d4c39d", striations: "#664927", clasps: "#9c7832", emblem: false, decor: { kind: "cord_ring", color: "#7a5c24", accent: "#c4963b", dx: -4, dy: 5.2 } },
      { halfW: 14.0, halfD: 14.0, thick: 3.15, dYaw: 0.02, coverTop: "#172236", coverBot: "#0b111c", spineTop: "#101828", spineBot: "#060a12", border: "rgba(148,163,184,0.36)", ribColor: "#697c94", ribs: 4, pagesEdge: "#d2c6aa", striations: "#5a503c", clasps: false, emblem: "#8fa0b5", decor: { kind: "ribbon", color: "#45203f", hi: "#66345e", dx: 5, dy: 4.8 } },
      { halfW: 15.0, halfD: 13.2, thick: 3.25, dYaw: -0.01, coverTop: "#242c19", coverBot: "#11160b", spineTop: "#192011", spineBot: "#0b0e07", border: "rgba(155,126,52,0.42)", ribColor: "#8a7232", ribs: 3, pagesEdge: "#cbb994", striations: "#594827", clasps: "#8f722e", emblem: "#a6873b", decor: { kind: "tassel", color: "#4a1a1a", tip: "#b88c35", dx: 3, dy: 5.5 } },
    ],
    // PLACE 3 (R1): spine facing camera, bottom fore-edge right, 15 letters = 1 book, max 7 books
    [
      { halfW: 15.0, halfD: 12.6, thick: 3.20, dYaw: -0.02, coverTop: "#471319", coverBot: "#21070a", spineTop: "#330c10", spineBot: "#150305", border: "rgba(182,138,52,0.48)", ribColor: "#ab8434", ribs: 5, pagesEdge: "#d8c8a4", striations: "#6b522c", corners: "#b08938", emblem: "#bf9842", band: false, decor: { kind: "tassel", color: "#6b4d1a", tip: "#d4a644", dx: 4.8, dy: 3.0 } },
      { halfW: 14.5, halfD: 13.0, thick: 3.25, dYaw: 0.03, coverTop: "#132b23", coverBot: "#081511", spineTop: "#0d1f19", spineBot: "#050c0a", border: "rgba(148,118,44,0.42)", ribColor: "#87682a", ribs: 4, pagesEdge: "#d1c29d", striations: "#5c4727", corners: false, emblem: false, band: true, decor: { kind: "ribbon", color: "#7a5c1d", hi: "#a6802f", dx: 5.2, dy: 3.4 } },
      { halfW: 15.4, halfD: 12.2, thick: 3.15, dYaw: -0.03, coverTop: "#3b1511", coverBot: "#1c0806", spineTop: "#290d0a", spineBot: "#110403", border: "rgba(160,115,44,0.44)", ribColor: "#91682a", ribs: 4, pagesEdge: "#ceba93", striations: "#634926", corners: "#967032", emblem: "#a88236", band: false, decor: { kind: "slip", color: "#d4c39c", dx: 4.2, dy: 2.2 } },
      { halfW: 14.8, halfD: 12.6, thick: 3.20, dYaw: 0.02, coverTop: "#151f33", coverBot: "#0a0f1a", spineTop: "#0e1624", spineBot: "#05080f", border: "rgba(155,168,186,0.38)", ribColor: "#7d8fa8", ribs: 5, pagesEdge: "#d4c8ae", striations: "#5a503c", corners: "#8c9db5", emblem: false, band: false, decor: { kind: "cord_ring", color: "#5c1818", accent: "#a83434", dx: 4.4, dy: 3.6 } },
    ],
    // PLACE 4 (R2): frontal projection, 15 letters = 1 book, max 5 books
    [
      { halfW: 16.0, halfD: 14.8, thick: 3.30, dYaw: -0.02, coverTop: "#472812", coverBot: "#241207", spineTop: "#341c0b", spineBot: "#170a03", border: "rgba(164,120,46,0.46)", ribColor: "#9c712d", ribs: 4, pagesEdge: "#d4c39d", striations: "#694d27", clasps: "#a68032", emblem: "#b38d3b", decor: { kind: "cord_ring", color: "#3b210e", accent: "#997132", dx: -4.5, dy: 5.6 } },
      { halfW: 15.5, halfD: 14.4, thick: 3.35, dYaw: 0.02, coverTop: "#2c1629", coverBot: "#140913", spineTop: "#1f0e1c", spineBot: "#0d040b", border: "rgba(166,132,56,0.44)", ribColor: "#94702e", ribs: 4, pagesEdge: "#d1c29f", striations: "#5c4829", clasps: false, emblem: "#ab873a", decor: { kind: "slip", color: "#d2c19a", dx: 4.0, dy: 5.0 } },
      { halfW: 16.4, halfD: 15.0, thick: 3.25, dYaw: -0.01, coverTop: "#13241a", coverBot: "#08110c", spineTop: "#0d1912", spineBot: "#040906", border: "rgba(156,122,48,0.44)", ribColor: "#8c6b29", ribs: 5, pagesEdge: "#cfc09b", striations: "#594726", clasps: "#9c7932", emblem: false, decor: { kind: "tassel", color: "#5c1818", tip: "#c99b3b", dx: 5.5, dy: 5.5 } },
    ],
  ];

  const NOTES_PLACE_PAPER_INVARIANTS = [
    [
      { halfW: 10.6, halfD: 8.8, dYaw: -0.02, top: "#f0e5d0", mid: "#e2d0b0", bot: "#c8b087", border: "#6b4e2e", cornerType: "ribbon-tl", ribbon: ["#5c1a1a", "#7c2b2b"], layout: "rows", sealU: 0.45, sealV: 0.35, seal: ["#7a2222", "#521414", "#2a0808"], stamp: "#a88439" },
      { halfW: 11.2, halfD: 8.2, dYaw: 0.03, top: "#ece1c9", mid: "#dac7a2", bot: "#bfa577", border: "#594224", cornerType: "frame", ribbon: ["#1e3828", "#2e543c"], layout: "cols", sealU: 0.48, sealV: -0.25, seal: ["#173624", "#0e2417", "#05120a"], stamp: "#8596a6" },
      { halfW: 10.2, halfD: 9.2, dYaw: -0.04, top: "#ede4d2", mid: "#dcd0b9", bot: "#c2b194", border: "#5c4d3a", cornerType: "cap-mark", ribbon: ["#633018", "#8c4927"], layout: "charter", sealU: 0.42, sealV: 0.42, seal: ["#4a2515", "#30170c", "#180a04"], stamp: "#99722c" },
    ],
    [
      { halfW: 11.8, halfD: 8.8, dYaw: -0.02, top: "#f2e8d4", mid: "#e4d3b5", bot: "#cab28a", border: "#6b4f2e", cornerType: "band-r", ribbon: ["#1e2e42", "#314966"], layout: "rows", sealU: 0.50, sealV: 0.25, seal: ["#1e2e42", "#131d2b", "#090e16"], stamp: "#9aaec2" },
      { halfW: 11.2, halfD: 9.4, dYaw: 0.03, top: "#eee2cb", mid: "#ddcaaa", bot: "#c3aa80", border: "#5c4526", cornerType: "grid-red", ribbon: ["#6e1f1b", "#912e29"], layout: "cols", sealU: 0.46, sealV: 0.40, seal: ["#781f1f", "#521212", "#290707"], stamp: "#b08b3c" },
      { halfW: 11.6, halfD: 8.6, dYaw: -0.03, top: "#e7e1d4", mid: "#d6cebe", bot: "#bab09c", border: "#544a3a", cornerType: "ribbon-tl", ribbon: ["#3c223b", "#573355"], layout: "charter", sealU: 0.48, sealV: -0.15, seal: ["#3c1d3a", "#261124", "#120711"], stamp: "#94783e" },
    ],
    [
      { halfW: 10.6, halfD: 6.8, dYaw: -0.02, top: "#f2e7d3", mid: "#e3d2b3", bot: "#c9b18a", border: "#694d2c", cornerType: "ribbon-tl", ribbon: ["#631b1b", "#872929"], layout: "charter", sealU: 0.42, sealV: 0.36, seal: ["#782020", "#501313", "#290808"], stamp: "#a68239" },
      { halfW: 10.2, halfD: 7.0, dYaw: 0.02, top: "#ebe0c6", mid: "#dac6a0", bot: "#c0a679", border: "#574023", cornerType: "ribbon-tr", ribbon: ["#193324", "#295239"], layout: "cols", sealU: -0.40, sealV: 0.38, seal: ["#163322", "#0d2115", "#051009"], stamp: "#8294a3" },
      { halfW: 10.8, halfD: 6.6, dYaw: -0.01, top: "#eae4d6", mid: "#d8cfbd", bot: "#beb098", border: "#594e3d", cornerType: "frame", ribbon: ["#3d1d38", "#592e52"], layout: "rows", sealU: 0.0, sealV: 0.42, seal: ["#422119", "#2e150f", "#170905"], stamp: "#8c6827" },
    ],
    [
      { halfW: 11.4, halfD: 9.0, dYaw: -0.02, top: "#f3ead6", mid: "#e6d6b8", bot: "#ccb68d", border: "#6e5230", cornerType: "gold-bar", ribbon: ["#7a1d1d", "#9e2b2b"], layout: "rows", sealU: 0.50, sealV: 0.30, seal: ["#802020", "#571313", "#2c0808"], stamp: "#b8923e" },
      { halfW: 11.0, halfD: 9.2, dYaw: 0.03, top: "#ede2ca", mid: "#dcc9a3", bot: "#c2aa7c", border: "#5c4424", cornerType: "cols-split", ribbon: ["#1b2c3d", "#2d455e"], layout: "cols", sealU: 0.46, sealV: -0.25, seal: ["#173626", "#0e2418", "#05120b"], stamp: "#7d92a6" },
      { halfW: 11.8, halfD: 8.6, dYaw: -0.03, top: "#ece6d9", mid: "#dad1be", bot: "#c0b39a", border: "#594e3c", cornerType: "ribbon-tl", ribbon: ["#472138", "#663251"], layout: "charter", sealU: 0.48, sealV: 0.38, seal: ["#4a2319", "#32160f", "#1a0a06"], stamp: "#9c7730" },
    ],
    [
      { halfW: 11.8, halfD: 7.4, dYaw: -0.02, top: "#f3e9d6", mid: "#e5d4b7", bot: "#ccb58e", border: "#6d502e", cornerType: "ribbon-tl", ribbon: ["#631b1b", "#872929"], layout: "rows", sealU: 0.45, sealV: 0.36, seal: ["#7d2121", "#541414", "#2b0909"], stamp: "#ad893c" },
      { halfW: 11.4, halfD: 7.2, dYaw: 0.02, top: "#ece1c6", mid: "#dbc7a1", bot: "#c2a77a", border: "#594223", cornerType: "ribbon-tr", ribbon: ["#1e2c3d", "#2e4157"], layout: "cols", sealU: -0.42, sealV: 0.36, seal: ["#1c2e42", "#111e2b", "#080e16"], stamp: "#8ca0b5" },
      { halfW: 12.0, halfD: 7.5, dYaw: -0.01, top: "#ebe5d8", mid: "#d9d0be", bot: "#bfb199", border: "#5c5040", cornerType: "gold-bar", ribbon: ["#3d2713", "#5c3c1e"], layout: "charter", sealU: 0.44, sealV: -0.15, seal: ["#472419", "#30170f", "#170a05"], stamp: "#96702b" },
    ],
  ];

  function drawNotesPerspectiveBook(ctx, x, y, slotIdx = 0, bookIdx = 0, scale = 1.0, yawOffset = 0, showDecor = true) {
    const slot = NOTES_SLOTS[slotIdx];
    const invArr = NOTES_PLACE_BOOK_INVARIANTS[slotIdx];
    const inv = invArr[bookIdx % invArr.length];
    const mode = slot.mode;
    const totalYaw = slot.yaw + inv.dYaw + yawOffset;
    const thick = (inv.thick || 3.2) * scale;
    const q = projectNotesDeskQuad(x, y, inv.halfW, inv.halfD, totalYaw, scale);

    ctx.save();

    if (bookIdx === 0) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.36)";
      ctx.beginPath();
      ctx.moveTo(q.tl.x, q.tl.y + thick + 1.2);
      ctx.lineTo(q.tr.x + 1.0, q.tr.y + thick + 1.2);
      ctx.lineTo(q.br.x + 0.8, q.br.y + thick + 1.6);
      ctx.lineTo(q.bl.x - 0.8, q.bl.y + thick + 1.4);
      ctx.closePath();
      ctx.fill();
    }

    function drawSpineFace(A, B) {
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.lineTo(B.x, B.y + thick);
      ctx.lineTo(A.x, A.y + thick);
      ctx.closePath();
      const sg = ctx.createLinearGradient(A.x, A.y, A.x, A.y + thick);
      sg.addColorStop(0, inv.spineTop);
      sg.addColorStop(0.5, inv.spineBot);
      sg.addColorStop(1, "#090403");
      ctx.fillStyle = sg;
      ctx.fill();
      ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
      ctx.lineWidth = 0.45;
      ctx.stroke();

      const ribs = inv.ribs || 4;
      ctx.strokeStyle = inv.ribColor;
      ctx.lineWidth = 0.75 * scale;
      for (let r = 1; r <= ribs; r++) {
        const t = r / (ribs + 1);
        const rx = A.x + (B.x - A.x) * t;
        const ry = A.y + (B.y - A.y) * t;
        ctx.beginPath();
        ctx.moveTo(rx, ry + 0.25);
        ctx.lineTo(rx, ry + thick - 0.25);
        ctx.stroke();
      }
    }

    function drawForeEdgeFace(A, B) {
      const covT = Math.max(0.55, thick * 0.19);
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.lineTo(B.x, B.y + thick);
      ctx.lineTo(A.x, A.y + thick);
      ctx.closePath();
      ctx.fillStyle = inv.coverBot;
      ctx.fill();

      const padX = (B.x - A.x) * 0.03;
      const padY = (B.y - A.y) * 0.03;
      ctx.beginPath();
      ctx.moveTo(A.x + padX, A.y + padY + covT);
      ctx.lineTo(B.x - padX, B.y - padY + covT);
      ctx.lineTo(B.x - padX, B.y - padY + thick - covT);
      ctx.lineTo(A.x + padX, A.y + padY + thick - covT);
      ctx.closePath();
      const eg = ctx.createLinearGradient(A.x, A.y, B.x, B.y + thick);
      eg.addColorStop(0, inv.pagesEdge);
      eg.addColorStop(0.5, "#eae0c8");
      eg.addColorStop(1, inv.pagesEdge);
      ctx.fillStyle = eg;
      ctx.fill();

      ctx.strokeStyle = inv.striations;
      ctx.lineWidth = 0.42;
      const innerH = thick - covT * 2;
      if (innerH > 1.0) {
        for (const frac of [0.35, 0.68]) {
          const dy = covT + innerH * frac;
          ctx.beginPath();
          ctx.moveTo(A.x + padX, A.y + padY + dy);
          ctx.lineTo(B.x - padX, B.y - padY + dy);
          ctx.stroke();
        }
      }

      if (inv.clasps && mode === "front") {
        ctx.fillStyle = inv.clasps;
        [0.24, 0.76].forEach((tf) => {
          const cx = B.x + (A.x - B.x) * tf;
          const cy = B.y + (A.y - B.y) * tf;
          ctx.fillRect(cx - 1.0 * scale, cy + 0.15, 2.0 * scale, thick - 0.15);
        });
      }
    }

    if (mode === "front") {
      drawForeEdgeFace(q.bl, q.br);
      if (q.tr.x > q.br.x + 0.35) {
        drawSpineFace(q.br, q.tr);
      } else if (q.bl.x > q.tl.x + 0.35) {
        drawSpineFace(q.tl, q.bl);
      }
      ctx.strokeStyle = "rgba(8, 4, 2, 0.72)";
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      if (q.bl.x > q.tl.x + 0.35) {
        ctx.moveTo(q.tl.x, q.tl.y + thick);
        ctx.lineTo(q.bl.x, q.bl.y + thick);
      } else {
        ctx.moveTo(q.bl.x, q.bl.y + thick);
      }
      ctx.lineTo(q.br.x, q.br.y + thick);
      if (q.tr.x > q.br.x + 0.35) {
        ctx.lineTo(q.tr.x, q.tr.y + thick);
      }
      ctx.stroke();
    } else {
      if (q.br.x > q.bl.x + 0.2) drawSpineFace(q.bl, q.br);
      if (q.tr.x > q.br.x + 0.45) {
        drawForeEdgeFace(q.br, q.tr);
      } else if (q.bl.x > q.tl.x + 0.45) {
        drawForeEdgeFace(q.tl, q.bl);
      }
      ctx.strokeStyle = "rgba(8, 4, 2, 0.75)";
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      if (q.tr.x <= q.br.x + 0.45 && q.bl.x > q.tl.x + 0.45) {
        ctx.moveTo(q.tl.x, q.tl.y + thick);
        ctx.lineTo(q.bl.x, q.bl.y + thick);
      } else {
        ctx.moveTo(q.bl.x, q.bl.y + thick);
      }
      ctx.lineTo(q.br.x, q.br.y + thick);
      if (q.tr.x > q.br.x + 0.45) {
        ctx.lineTo(q.tr.x, q.tr.y + thick);
      }
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(q.tl.x, q.tl.y);
    ctx.lineTo(q.tr.x, q.tr.y);
    ctx.lineTo(q.br.x, q.br.y);
    ctx.lineTo(q.bl.x, q.bl.y);
    ctx.closePath();
    const cg = ctx.createLinearGradient(q.tl.x, q.tl.y, q.br.x, q.br.y);
    cg.addColorStop(0, inv.coverTop);
    cg.addColorStop(0.65, inv.coverBot);
    cg.addColorStop(1, inv.coverTop);
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.strokeStyle = "rgba(10, 5, 2, 0.55)";
    ctx.lineWidth = 0.45;
    ctx.stroke();

    ctx.strokeStyle = inv.border;
    ctx.lineWidth = 0.52;
    const f1 = evalNotesQuadSurf(q, -0.82, -0.80);
    const f2 = evalNotesQuadSurf(q, 0.82, -0.80);
    const f3 = evalNotesQuadSurf(q, 0.82, 0.80);
    const f4 = evalNotesQuadSurf(q, -0.82, 0.80);
    ctx.beginPath();
    ctx.moveTo(f1.x, f1.y);
    ctx.lineTo(f2.x, f2.y);
    ctx.lineTo(f3.x, f3.y);
    ctx.lineTo(f4.x, f4.y);
    ctx.closePath();
    ctx.stroke();

    if (inv.band) {
      ctx.fillStyle = "rgba(20, 10, 4, 0.55)";
      fillNotesQuadSubRect(ctx, q, -0.14, 0.14, -1.0, 1.0);
    }

    if (inv.corners) {
      ctx.fillStyle = inv.corners;
      [[-0.96, -0.72, -0.96, -0.72], [0.72, 0.96, -0.96, -0.72], [0.72, 0.96, 0.72, 0.96], [-0.96, -0.72, 0.72, 0.96]].forEach(([u1, u2, v1, v2]) => {
        fillNotesQuadSubRect(ctx, q, u1, u2, v1, v2);
      });
    }

    if (inv.emblem) {
      const ec = evalNotesQuadSurf(q, 0, 0);
      ctx.fillStyle = inv.emblem;
      ctx.beginPath();
      ctx.ellipse(ec.x, ec.y, 2.0 * scale, 1.15 * scale, totalYaw * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    if (showDecor && inv.decor) {
      const d = inv.decor;
      const anchor = (mode === "front")
        ? evalNotesQuadSurf(q, d.dx > 0 ? 0.28 : -0.28, 1.0)
        : evalNotesQuadSurf(q, 1.0, 0.14);
      const reachScale = scale * 0.66;
      const rx = anchor.x;
      const ry = anchor.y + thick * 0.55;
      const tipX = rx + d.dx * reachScale;
      const tipY = ry + d.dy * reachScale;
      const ctrlX = mode === "front" ? rx + d.dx * 0.3 * reachScale : rx + d.dx * 0.65 * reachScale;
      const ctrlY = mode === "front" ? ry + d.dy * 0.65 * reachScale : ry + d.dy * 0.35 * reachScale;

      if (d.kind === "ribbon") {
        ctx.strokeStyle = d.color;
        ctx.lineWidth = 1.1 * scale;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
        ctx.stroke();
        ctx.strokeStyle = d.hi;
        ctx.lineWidth = 0.4 * scale;
        ctx.stroke();
      } else if (d.kind === "tassel") {
        ctx.strokeStyle = d.color;
        ctx.lineWidth = 0.95 * scale;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
        ctx.stroke();
        ctx.fillStyle = d.tip;
        ctx.beginPath();
        ctx.arc(tipX, tipY, 0.9 * scale, 0, Math.PI * 2);
        ctx.fill();
      } else if (d.kind === "cord_ring") {
        ctx.strokeStyle = d.color;
        ctx.lineWidth = 1.05 * scale;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
        ctx.stroke();
        ctx.strokeStyle = d.accent;
        ctx.lineWidth = 0.55 * scale;
        ctx.beginPath();
        ctx.arc(tipX, tipY, 0.85 * scale, 0, Math.PI * 2);
        ctx.stroke();
      } else if (d.kind === "slip") {
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.moveTo(rx - 0.5, ry - 0.5);
        ctx.lineTo(tipX, tipY - 0.4);
        ctx.lineTo(tipX - 0.25, tipY + 0.7);
        ctx.lineTo(rx - 0.5, ry + 0.5);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function drawNotesPerspectivePaper(ctx, x, y, slotIdx = 0, sheetIdx = 0, scale = 1.0, isTop = false, yawOffset = 0) {
    const slot = NOTES_SLOTS[slotIdx];
    const pArr = NOTES_PLACE_PAPER_INVARIANTS[slotIdx];
    const pInv = pArr[sheetIdx % pArr.length];
    const mode = slot.mode;
    const totalYaw = slot.yaw + pInv.dYaw + yawOffset;
    const q = projectNotesDeskQuad(x, y, pInv.halfW, pInv.halfD, totalYaw, scale);

    ctx.save();

    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.beginPath();
    ctx.moveTo(q.tl.x, q.tl.y + 0.8);
    ctx.lineTo(q.tr.x, q.tr.y + 0.8);
    ctx.lineTo(q.br.x, q.br.y + 0.8);
    ctx.lineTo(q.bl.x, q.bl.y + 0.8);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(q.tl.x, q.tl.y);
    ctx.lineTo(q.tr.x, q.tr.y);
    ctx.lineTo(q.br.x, q.br.y);
    ctx.lineTo(q.bl.x, q.bl.y);
    ctx.closePath();
    const pg = ctx.createLinearGradient(q.tl.x, q.tl.y, q.br.x, q.br.y);
    pg.addColorStop(0, pInv.top);
    pg.addColorStop(0.5, pInv.mid);
    pg.addColorStop(1, pInv.bot);
    ctx.fillStyle = pg;
    ctx.fill();
    ctx.strokeStyle = pInv.border;
    ctx.lineWidth = 0.45;
    ctx.stroke();

    ctx.fillStyle = "rgba(54, 38, 20, 0.48)";
    if (mode === "front") {
      if (pInv.layout === "rows") {
        fillNotesQuadSubRect(ctx, q, -0.72, 0.55, -0.46, -0.34);
        fillNotesQuadSubRect(ctx, q, -0.72, 0.40, -0.10, 0.02);
        fillNotesQuadSubRect(ctx, q, -0.72, 0.48, 0.28, 0.40);
      } else if (pInv.layout === "cols") {
        fillNotesQuadSubRect(ctx, q, -0.74, 0.74, -0.50, -0.34);
        fillNotesQuadSubRect(ctx, q, -0.74, -0.10, -0.06, 0.08);
        fillNotesQuadSubRect(ctx, q, 0.08, 0.74, -0.06, 0.08);
        fillNotesQuadSubRect(ctx, q, -0.74, -0.18, 0.30, 0.44);
        fillNotesQuadSubRect(ctx, q, 0.08, 0.62, 0.30, 0.44);
      } else {
        ctx.fillStyle = "#6e2b14";
        fillNotesQuadSubRect(ctx, q, -0.74, -0.44, -0.52, -0.22);
        ctx.fillStyle = "rgba(54, 38, 20, 0.48)";
        fillNotesQuadSubRect(ctx, q, -0.30, 0.62, -0.46, -0.34);
        fillNotesQuadSubRect(ctx, q, -0.74, 0.58, -0.04, 0.10);
        fillNotesQuadSubRect(ctx, q, -0.68, 0.45, 0.32, 0.44);
      }
    } else {
      if (pInv.layout === "rows") {
        fillNotesQuadSubRect(ctx, q, -0.62, -0.46, -0.66, 0.58);
        fillNotesQuadSubRect(ctx, q, -0.22, -0.06, -0.66, 0.42);
        fillNotesQuadSubRect(ctx, q, 0.16, 0.32, -0.66, 0.25);
      } else if (pInv.layout === "cols") {
        fillNotesQuadSubRect(ctx, q, -0.64, -0.48, -0.70, 0.70);
        fillNotesQuadSubRect(ctx, q, -0.22, -0.06, -0.70, -0.08);
        fillNotesQuadSubRect(ctx, q, -0.22, -0.06, 0.10, 0.68);
        fillNotesQuadSubRect(ctx, q, 0.16, 0.32, -0.70, -0.15);
        fillNotesQuadSubRect(ctx, q, 0.16, 0.32, 0.10, 0.55);
      } else {
        ctx.fillStyle = "#6e2b14";
        fillNotesQuadSubRect(ctx, q, -0.66, -0.38, -0.68, -0.34);
        ctx.fillStyle = "rgba(54, 38, 20, 0.48)";
        fillNotesQuadSubRect(ctx, q, -0.62, -0.46, -0.18, 0.64);
        fillNotesQuadSubRect(ctx, q, -0.16, 0.00, -0.68, 0.58);
        fillNotesQuadSubRect(ctx, q, 0.20, 0.34, -0.62, 0.32);
      }
    }

    if (isTop) {
      if (pInv.cornerType === "ribbon-tl") {
        const pA = evalNotesQuadSurf(q, -1.0, -0.25);
        const pB = evalNotesQuadSurf(q, -0.32, -1.0);
        ctx.strokeStyle = pInv.ribbon[0];
        ctx.lineWidth = 1.45 * scale;
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pB.x, pB.y);
        ctx.stroke();
        ctx.strokeStyle = pInv.ribbon[1];
        ctx.lineWidth = 0.45 * scale;
        ctx.stroke();
      } else if (pInv.cornerType === "ribbon-tr") {
        const pA = evalNotesQuadSurf(q, 1.0, -0.25);
        const pB = evalNotesQuadSurf(q, 0.32, -1.0);
        ctx.strokeStyle = pInv.ribbon[0];
        ctx.lineWidth = 1.45 * scale;
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pB.x, pB.y);
        ctx.stroke();
        ctx.strokeStyle = pInv.ribbon[1];
        ctx.lineWidth = 0.45 * scale;
        ctx.stroke();
      } else if (pInv.cornerType === "band-r" || pInv.cornerType === "gold-bar") {
        const pA = evalNotesQuadSurf(q, 0.72, -0.92);
        const pB = evalNotesQuadSurf(q, 0.72, 0.92);
        ctx.strokeStyle = pInv.ribbon[0];
        ctx.lineWidth = 1.15 * scale;
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pB.x, pB.y);
        ctx.stroke();
      } else if (pInv.cornerType === "frame") {
        ctx.strokeStyle = pInv.ribbon[0];
        ctx.lineWidth = 0.45;
        const a = evalNotesQuadSurf(q, -0.84, -0.82);
        const b = evalNotesQuadSurf(q, 0.84, -0.82);
        const c = evalNotesQuadSurf(q, 0.84, 0.82);
        const d = evalNotesQuadSurf(q, -0.84, 0.82);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.lineTo(d.x, d.y);
        ctx.closePath();
        ctx.stroke();
      } else if (pInv.cornerType === "grid-red" || pInv.cornerType === "cols-split" || pInv.cornerType === "cap-mark") {
        const pA = evalNotesQuadSurf(q, -0.82, 0.0);
        const pB = evalNotesQuadSurf(q, 0.35, 0.0);
        ctx.strokeStyle = pInv.ribbon[0];
        ctx.lineWidth = 0.6 * scale;
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pB.x, pB.y);
        ctx.stroke();
      }

      const sc = evalNotesQuadSurf(q, pInv.sealU, pInv.sealV);
      const rx = 3.2 * scale;
      const ry = 1.95 * scale;

      ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
      ctx.beginPath();
      ctx.ellipse(sc.x, sc.y + 0.7, rx * 1.05, ry * 1.05, totalYaw * 0.4, 0, Math.PI * 2);
      ctx.fill();

      const sg = ctx.createRadialGradient(sc.x - 0.4, sc.y - 0.4, 0.4, sc.x, sc.y, rx * 1.1);
      sg.addColorStop(0, pInv.seal[0]);
      sg.addColorStop(0.6, pInv.seal[1]);
      sg.addColorStop(1, pInv.seal[2]);
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.ellipse(sc.x, sc.y, rx, ry, totalYaw * 0.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
      ctx.lineWidth = 0.45;
      ctx.beginPath();
      ctx.ellipse(sc.x, sc.y, rx * 0.80, ry * 0.80, totalYaw * 0.4, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = pInv.stamp;
      ctx.beginPath();
      ctx.ellipse(sc.x, sc.y, rx * 0.32, ry * 0.32, totalYaw * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawNotesPerspectiveInkstand(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.beginPath();
    ctx.ellipse(0, 3, 14, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    const baseGrad = ctx.createLinearGradient(-13, 0, 13, 0);
    baseGrad.addColorStop(0, "#261608");
    baseGrad.addColorStop(0.3, "#6e4418");
    baseGrad.addColorStop(0.6, "#b37d34");
    baseGrad.addColorStop(0.85, "#54320f");
    baseGrad.addColorStop(1, "#241306");
    ctx.fillStyle = baseGrad;
    ctx.beginPath();
    ctx.ellipse(0, 2, 13, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#42270f";
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 4.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#c28e3e";
    ctx.lineWidth = 0.5;
    ctx.stroke();

    const urnGrad = ctx.createLinearGradient(-8, -12, 8, 0);
    urnGrad.addColorStop(0, "#2e1909");
    urnGrad.addColorStop(0.25, "#7d4f1d");
    urnGrad.addColorStop(0.55, "#c99645");
    urnGrad.addColorStop(0.8, "#59340e");
    urnGrad.addColorStop(1, "#241306");
    ctx.fillStyle = urnGrad;

    ctx.beginPath();
    ctx.moveTo(-7, 0);
    ctx.quadraticCurveTo(-9, -6, -7, -13);
    ctx.lineTo(7, -13);
    ctx.quadraticCurveTo(9, -6, 7, 0);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(254, 240, 138, 0.35)";
    ctx.lineWidth = 0.7;
    [-4.5, -1.5, 1.5, 4.5].forEach((fx) => {
      ctx.beginPath();
      ctx.moveTo(fx * 0.9, 0);
      ctx.quadraticCurveTo(fx * 1.1, -6, fx * 0.85, -13);
      ctx.stroke();
    });

    ctx.strokeStyle = "#fef08a";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(0, -6, 7.8, 2.5, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#613b14";
    ctx.beginPath();
    ctx.ellipse(0, -13, 7.2, 2.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#c99645";
    ctx.lineWidth = 0.6;
    ctx.stroke();

    ctx.fillStyle = "#060608";
    ctx.beginPath();
    ctx.ellipse(0, -13, 5.2, 2.0, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
    ctx.beginPath();
    ctx.arc(1.5, -13.6, 0.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(1, -12);
    ctx.quadraticCurveTo(-8, -4, -20, 2);
    ctx.stroke();

    ctx.save();
    ctx.translate(0, -12);
    ctx.rotate(-0.32);

    ctx.strokeStyle = "#18181b";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.lineTo(0, 0);
    ctx.stroke();

    ctx.strokeStyle = "#e2d7c0";
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -36);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.quadraticCurveTo(-4.5, -24, -1, -38);
    ctx.lineTo(0, -36);
    ctx.quadraticCurveTo(4.5, -24, 0, -10);
    ctx.closePath();

    const fGrad = ctx.createLinearGradient(-3.5, -24, 3.5, -24);
    fGrad.addColorStop(0, "#f8fafc");
    fGrad.addColorStop(0.45, "#ede8df");
    fGrad.addColorStop(1, "#94a3b8");
    ctx.fillStyle = fGrad;
    ctx.fill();

    ctx.strokeStyle = "rgba(100, 116, 139, 0.45)";
    ctx.lineWidth = 0.5;
    for (let fy = -14; fy > -34; fy -= 2.8) {
      ctx.beginPath();
      ctx.moveTo(0, fy);
      ctx.lineTo(-3.2, fy + 1.6);
      ctx.moveTo(0, fy);
      ctx.lineTo(3.2, fy + 1.6);
      ctx.stroke();
    }

    ctx.restore();
    ctx.restore();
  }

  function drawNotesTableCandelabra(ctx, x, y, animTime = 0) {
    ctx.save();
    ctx.translate(x, y);

    const tSec = (animTime || 0) * 0.5;
    drawBankStandardLightGlow(ctx, 0, -26, 8, -20, 66, tSec, BANK_LIGHT_WARM_MIX, 0.7);

    ctx.fillStyle = "rgba(0, 0, 0, 0.48)";
    ctx.beginPath();
    ctx.ellipse(0, 3, 10, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();

    const baseGrad = ctx.createLinearGradient(-7, 0, 7, 0);
    baseGrad.addColorStop(0, "#26190d");
    baseGrad.addColorStop(0.3, "#6e471d");
    baseGrad.addColorStop(0.6, "#b07b38");
    baseGrad.addColorStop(1, "#3d240f");
    ctx.fillStyle = baseGrad;
    ctx.beginPath();
    ctx.ellipse(0, 1, 8.0, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-1.8, 1);
    ctx.lineTo(-1.3, -16);
    ctx.lineTo(1.3, -16);
    ctx.lineTo(1.8, 1);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(0, -8, 3.0, 2.0, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#5a3816";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.quadraticCurveTo(-6, -9, -11, -18);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.quadraticCurveTo(6, -8, 11, -16);
    ctx.stroke();

    ctx.lineWidth = 0.7;
    ctx.strokeStyle = "#8c5d26";
    ctx.beginPath();
    ctx.arc(-5.5, -8, 1.8, 0, Math.PI * 1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(5.5, -7, 1.8, Math.PI * 0.5, Math.PI * 2);
    ctx.stroke();

    const sconces = [
      { x: -11, y: -18, candleH: 14, type: "med", flamePhase: 0 },
      { x: 0, y: -22, candleH: 18, type: "tall", flamePhase: 1.2 },
      { x: 11, y: -16, candleH: 9, type: "short", flamePhase: 2.5 },
    ];

    sconces.forEach((sc) => {
      ctx.fillStyle = "#784c1e";
      ctx.beginPath();
      ctx.ellipse(sc.x, sc.y, 4.2, 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#b07e3d";
      ctx.lineWidth = 0.5;
      ctx.stroke();

      const cTopY = sc.y - sc.candleH;
      const cWidth = 3.0;
      const cGrad = ctx.createLinearGradient(sc.x - cWidth, cTopY, sc.x + cWidth, sc.y);
      cGrad.addColorStop(0, "#fefbf3");
      cGrad.addColorStop(0.5, "#ede1c7");
      cGrad.addColorStop(1, "#c9b897");
      ctx.fillStyle = cGrad;

      ctx.beginPath();
      ctx.moveTo(sc.x - cWidth * 0.5, sc.y);
      ctx.lineTo(sc.x - cWidth * 0.5, cTopY + 0.5);
      ctx.lineTo(sc.x + cWidth * 0.5, cTopY);
      ctx.lineTo(sc.x + cWidth * 0.5, sc.y);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#fffbeb";
      ctx.beginPath();
      ctx.ellipse(sc.x, cTopY, cWidth * 0.55, 0.7, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#f8f1de";
      if (sc.type === "short") {
        ctx.beginPath();
        ctx.moveTo(sc.x - 1.6, cTopY + 2);
        ctx.lineTo(sc.x - 2.0, sc.y - 1);
        ctx.arc(sc.x - 1.6, sc.y - 1, 0.7, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(sc.x + 1.0, cTopY + 1);
        ctx.lineTo(sc.x + 1.6, sc.y - 2.5);
        ctx.arc(sc.x + 1.3, sc.y - 2.5, 0.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(sc.x + 2.8, sc.y + 0.5, 0.8, 0, Math.PI * 2);
        ctx.fill();
      } else if (sc.type === "med") {
        ctx.beginPath();
        ctx.moveTo(sc.x - 1.5, cTopY + 2);
        ctx.lineTo(sc.x - 1.7, cTopY + 6);
        ctx.arc(sc.x - 1.5, cTopY + 6, 0.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = "#18181b";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(sc.x, cTopY);
      ctx.lineTo(sc.x + 0.3, cTopY - 2.3);
      ctx.stroke();

      const fl = computeBankFlameFlicker(tSec, sc.flamePhase);
      const sway = fl.sway;
      const flameY = cTopY - 2.3;
      const flameH = 5.5 + fl.stretch;

      drawBankStandardFlameHalo(
        ctx,
        sc.x + sway * 0.45,
        flameY - flameH * 0.48,
        5.2,
        tSec,
        BANK_LIGHT_WARM_MIX,
        sc.flamePhase,
      );

      ctx.fillStyle = "rgba(245, 158, 11, 0.88)";
      ctx.beginPath();
      ctx.moveTo(sc.x - 1.3, flameY);
      ctx.quadraticCurveTo(sc.x - 1.8, flameY - flameH * 0.5, sc.x + sway, flameY - flameH);
      ctx.quadraticCurveTo(sc.x + 1.8, flameY - flameH * 0.5, sc.x + 1.3, flameY);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#fffbeb";
      ctx.beginPath();
      ctx.moveTo(sc.x - 0.6, flameY);
      ctx.quadraticCurveTo(sc.x - 0.8, flameY - flameH * 0.4, sc.x + sway * 0.7, flameY - flameH * 0.7);
      ctx.quadraticCurveTo(sc.x + 0.8, flameY - flameH * 0.4, sc.x + 0.6, flameY);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "rgba(99, 102, 241, 0.6)";
      ctx.beginPath();
      ctx.arc(sc.x, flameY, 0.7, 0, Math.PI);
      ctx.fill();
    });

    ctx.restore();
  }

  function drawNotesOpenAccountingBook(ctx, gold = 0, notesSession = NOTES_FALLBACK_SESSION) {
    const safeGold = Math.max(0, Number(gold) || 0);
    const midX = 104;
    const creaseTopY = 98.2;
    const creaseBotY = 134.0;
    const coverBotY = 143.0;

    const lpFarL = 68.0;
    const lpTopY = 95.0;
    const lpNearL = 56.5;
    const lpBotY = 128.5;
    const lpDepth = lpBotY - lpTopY;

    const rpFarR = 140.0;
    const rpTopY = 94.5;
    const rpNearR = 151.5;
    const rpBotY = 127.5;
    const rpDepth = rpBotY - rpTopY;

    ctx.save();

    ctx.fillStyle = "rgba(0, 0, 0, 0.50)";
    ctx.beginPath();
    ctx.moveTo(62.0, 100.5);
    ctx.lineTo(146.0, 100.5);
    ctx.lineTo(161.0, coverBotY + 2.2);
    ctx.lineTo(47.0, coverBotY + 2.2);
    ctx.closePath();
    ctx.fill();

    const coverRed = "#7c1919";
    const coverEdge = "#520d0d";
    const coverDark = "#2d0606";

    ctx.fillStyle = coverRed;
    ctx.beginPath();
    ctx.moveTo(64.0, 101.5);
    ctx.lineTo(144.0, 101.5);
    ctx.lineTo(158.8, coverBotY);
    ctx.lineTo(midX + 4.8, coverBotY + 0.3);
    ctx.quadraticCurveTo(midX, coverBotY + 1.8, midX - 4.8, coverBotY + 0.3);
    ctx.lineTo(49.2, coverBotY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = coverDark;
    ctx.lineWidth = 0.6;
    ctx.stroke();

    ctx.fillStyle = coverEdge;
    ctx.beginPath();
    ctx.moveTo(49.5, coverBotY - 1.4);
    ctx.lineTo(midX - 4.8, coverBotY - 1.2);
    ctx.lineTo(midX - 4.8, coverBotY + 0.3);
    ctx.lineTo(49.2, coverBotY);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(midX + 4.8, coverBotY - 1.2);
    ctx.lineTo(158.5, coverBotY - 1.4);
    ctx.lineTo(158.8, coverBotY);
    ctx.lineTo(midX + 4.8, coverBotY + 0.3);
    ctx.closePath();
    ctx.fill();

    const lpFarR = midX - 0.5;
    const lpNearR = midX - 0.5;
    const rpFarL = midX + 0.5;
    const rpNearL = midX + 0.5;

    function quadVal(p0, p1, p2, t) {
      const mt = 1 - t;
      return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2;
    }

    function leftSurf(u, v) {
      const topX = lpFarL + (lpFarR - lpFarL) * u;
      const botX = lpNearL + (lpNearR - lpNearL) * u;
      const topY = quadVal(lpTopY, 91.5, creaseTopY, u);
      const botY = quadVal(lpBotY, 128.8, creaseBotY, u);
      return { x: topX + (botX - topX) * v, y: topY + (botY - topY) * v };
    }

    function rightSurf(u, v) {
      const topX = rpFarL + (rpFarR - rpFarL) * u;
      const botX = rpNearL + (rpNearR - rpNearL) * u;
      const topY = quadVal(creaseTopY, 90.8, rpTopY, u);
      const botY = quadVal(creaseBotY, 126.2, rpBotY, u);
      return { x: topX + (botX - topX) * v, y: topY + (botY - topY) * v };
    }

    function strokeSurfH(surf, u1, u2, v, steps = 6) {
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const p = surf(u1 + (u2 - u1) * (i / steps), v);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    function fillSurfQuad(surf, u1, u2, v1, v2, steps = 4) {
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const p = surf(u1 + (u2 - u1) * (i / steps), v1);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      for (let i = steps; i >= 0; i--) {
        const p = surf(u1 + (u2 - u1) * (i / steps), v2);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fill();
    }

    const ledgerState = computeNotesLedgerBookState(safeGold);
    const order = Array.isArray(notesSession?.bookmarkOrder)
      ? notesSession.bookmarkOrder
      : NOTES_FALLBACK_SESSION.bookmarkOrder;
    const activeOrnaments = new Set(order.slice(0, Math.min(NOTES_MAX_BOOK_ORNAMENTS, ledgerState.bookmarks)));

    function drawUniqueEdgeTab(id) {
      if (!activeOrnaments.has(id)) return;
      const specs = [
        { side: "L", v: 0.14, h: 3.1, reach: 4.5, layer: 0.0, shape: "notch", base: "#d6c297", accent: "#7d2018", border: "#543c1d" },
        { side: "L", v: 0.37, h: 4.1, reach: 5.1, layer: 0.8, shape: "rivet", base: "#7d4b24", accent: "#e8ad41", border: "#2e1809" },
        { side: "L", v: 0.61, h: 3.3, reach: 5.5, layer: 1.5, shape: "arrow", base: "#3b6147", accent: "#dfd0ad", border: "#14241a" },
        { side: "L", v: 0.85, h: 4.4, reach: 5.4, layer: 1.0, shape: "stepped", base: "#dcc9a0", accent: "#27486b", border: "#4a361a" },
        { side: "R", v: 0.18, h: 3.5, reach: 4.7, layer: 0.0, shape: "round", base: "#315175", accent: "#dfb252", border: "#101d2b" },
        { side: "R", v: 0.50, h: 3.7, reach: 4.9, layer: 1.3, shape: "bevel_seal", base: "#dbc79e", accent: "#961f1a", border: "#543e1f" },
        { side: "R", v: 0.82, h: 3.8, reach: 4.8, layer: 0.65, shape: "clasp", base: "#363a42", accent: "#dfb046", border: "#15171c", rootShift: 0.2 },
      ];
      const sp = specs[id];
      const surf = sp.side === "L" ? leftSurf : rightSurf;
      const uEdge = sp.side === "L" ? 0 : 1;
      const sgn = sp.side === "L" ? -1 : 1;
      const depth = sp.side === "L" ? lpDepth : rpDepth;
      const dv = (sp.h * 0.5) / depth;

      const pT = surf(uEdge, sp.v - dv);
      const pB = surf(uEdge, sp.v + dv);
      const pC = surf(uEdge, sp.v);

      const lx = sgn * sp.layer * 0.85;
      const ly = sp.layer * 1.9;
      const rootPush = sp.rootShift !== undefined ? -sgn * sp.rootShift : -sgn * 1.1;
      const outX = sgn * sp.reach;
      const outY = 0.75 + sp.v * 0.45;

      const ax = pT.x + lx + rootPush;
      const ay = pT.y + ly;
      const dx = pB.x + lx + rootPush;
      const dy = pB.y + ly;
      const bx = pT.x + lx + outX;
      const by = pT.y + ly + outY;
      const cx = pB.x + lx + outX;
      const cy = pB.y + ly + outY;

      ctx.fillStyle = "rgba(10, 4, 2, 0.60)";
      ctx.beginPath();
      ctx.moveTo(ax, ay + 1.1);
      ctx.lineTo(bx + sgn * 0.4, by + 1.2);
      ctx.lineTo(cx + sgn * 0.4, cy + 1.2);
      ctx.lineTo(dx, dy + 1.1);
      ctx.closePath();
      ctx.fill();

      if (sp.shape === "notch") {
        const mx = (bx + cx) * 0.5 - sgn * 1.6;
        const my = (by + cy) * 0.5;
        ctx.fillStyle = sp.border;
        ctx.beginPath();
        ctx.moveTo(dx, dy);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx, cy + 0.55);
        ctx.lineTo(dx, dy + 0.55);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = sp.base;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.lineTo(mx, my);
        ctx.lineTo(cx, cy);
        ctx.lineTo(dx, dy);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = sp.border;
        ctx.lineWidth = 0.45;
        ctx.stroke();

        ctx.strokeStyle = sp.accent;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo((ax + dx) * 0.5 + sgn * 0.5, (ay + dy) * 0.5);
        ctx.lineTo(mx - sgn * 0.4, my);
        ctx.stroke();
      } else if (sp.shape === "rivet") {
        ctx.fillStyle = sp.border;
        ctx.beginPath();
        ctx.moveTo(dx, dy);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx, cy + 0.8);
        ctx.lineTo(dx, dy + 0.8);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = sp.base;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.lineTo(cx, cy);
        ctx.lineTo(dx, dy);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = sp.border;
        ctx.lineWidth = 0.5;
        ctx.stroke();

        const rx = pC.x + lx + outX * 0.65;
        const ry = pC.y + ly + outY * 0.65;
        ctx.fillStyle = sp.accent;
        ctx.beginPath();
        ctx.arc(rx, ry, 0.95, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fef08a";
        ctx.beginPath();
        ctx.arc(rx - 0.2, ry - 0.25, 0.35, 0, Math.PI * 2);
        ctx.fill();
      } else if (sp.shape === "arrow") {
        const tipX = (bx + cx) * 0.5 + sgn * 0.9;
        const tipY = (by + cy) * 0.5 + 0.15;
        ctx.fillStyle = sp.border;
        ctx.beginPath();
        ctx.moveTo(dx, dy);
        ctx.lineTo(tipX, tipY);
        ctx.lineTo(tipX, tipY + 0.55);
        ctx.lineTo(dx, dy + 0.55);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = sp.base;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(tipX, tipY);
        ctx.lineTo(dx, dy);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = sp.border;
        ctx.lineWidth = 0.45;
        ctx.stroke();

        ctx.strokeStyle = sp.accent;
        ctx.lineWidth = 0.55;
        ctx.beginPath();
        ctx.moveTo((ax + dx) * 0.5 + sgn * 0.8, (ay + dy) * 0.5);
        ctx.lineTo(tipX - sgn * 1.4, tipY);
        ctx.stroke();
      } else if (sp.shape === "stepped") {
        const baseOutX = outX * 0.52;
        const baseOutY = outY * 0.52;
        const mbx = pT.x + lx + baseOutX;
        const mby = pT.y + ly + baseOutY;
        const mcx = pB.x + lx + baseOutX;
        const mcy = pB.y + ly + baseOutY;
        const midAx = (ax + dx) * 0.5;
        const midAy = (ay + dy) * 0.5;

        ctx.fillStyle = sp.base;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(mbx, mby);
        ctx.lineTo(mcx, mcy);
        ctx.lineTo(dx, dy);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = sp.border;
        ctx.lineWidth = 0.45;
        ctx.stroke();

        ctx.fillStyle = sp.accent;
        ctx.beginPath();
        ctx.moveTo(midAx, midAy);
        ctx.lineTo(bx, by + (cy - by) * 0.45);
        ctx.lineTo(cx, cy + 0.2);
        ctx.lineTo(dx, dy);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#0e1c2b";
        ctx.lineWidth = 0.4;
        ctx.stroke();
      } else if (sp.shape === "round") {
        const midY = (by + cy) * 0.5;
        const tipCtrlX = (bx + cx) * 0.5 + sgn * 1.8;
        ctx.fillStyle = sp.base;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx - sgn * 1.2, by - 0.1);
        ctx.quadraticCurveTo(tipCtrlX, midY, cx - sgn * 1.2, cy + 0.1);
        ctx.lineTo(dx, dy);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = sp.border;
        ctx.lineWidth = 0.45;
        ctx.stroke();

        ctx.strokeStyle = sp.accent;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(ax + sgn * 2.2, ay + 0.5);
        ctx.lineTo(dx + sgn * 2.2, dy - 0.4);
        ctx.stroke();
      } else if (sp.shape === "bevel_seal") {
        ctx.fillStyle = sp.border;
        ctx.beginPath();
        ctx.moveTo(dx, dy);
        ctx.lineTo(cx - sgn * 0.8, cy + 0.8);
        ctx.lineTo(cx - sgn * 0.8, cy + 1.4);
        ctx.lineTo(dx, dy + 0.6);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = sp.base;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.lineTo(cx - sgn * 1.1, cy + 0.9);
        ctx.lineTo(dx, dy);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = sp.border;
        ctx.lineWidth = 0.45;
        ctx.stroke();

        ctx.fillStyle = sp.accent;
        ctx.beginPath();
        ctx.arc(pC.x + lx + outX * 0.65, pC.y + ly + outY * 0.65 + 0.2, 0.85, 0, Math.PI * 2);
        ctx.fill();
      } else if (sp.shape === "clasp") {
        ctx.fillStyle = sp.border;
        ctx.beginPath();
        ctx.moveTo(dx, dy);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx, cy + 0.7);
        ctx.lineTo(dx, dy + 0.7);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = sp.base;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.lineTo(cx, cy);
        ctx.lineTo(dx, dy);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = sp.border;
        ctx.lineWidth = 0.45;
        ctx.stroke();

        const tCap = 0.68;
        ctx.fillStyle = sp.accent;
        ctx.beginPath();
        ctx.moveTo(ax + (bx - ax) * tCap, ay + (by - ay) * tCap - 0.15);
        ctx.lineTo(bx + sgn * 0.25, by - 0.15);
        ctx.lineTo(cx + sgn * 0.25, cy + 0.25);
        ctx.lineTo(dx + (cx - dx) * tCap, dy + (cy - dy) * tCap + 0.25);
        ctx.closePath();
        ctx.fill();
      }
    }

    function drawUniqueBookmark(id) {
      if (!activeOrnaments.has(id)) return;

      if (id === 7) {
        const sx = midX - 0.8;
        const sy = creaseBotY - 1.8;
        const rimX = midX - 2.6;
        const rimY = coverBotY - 0.3;
        const endX = 94.5;
        const endY = 150.2;

        ctx.strokeStyle = "rgba(10, 4, 2, 0.65)";
        ctx.lineWidth = 2.1;
        ctx.beginPath();
        ctx.moveTo(rimX, rimY + 0.8);
        ctx.quadraticCurveTo(98.5, 147.8, endX, endY + 0.7);
        ctx.stroke();

        ctx.strokeStyle = "#4a1010";
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(midX - 1.6, 138.0, rimX, rimY);
        ctx.stroke();

        ctx.fillStyle = "#8f2424";
        ctx.beginPath();
        ctx.moveTo(rimX + 0.7, rimY);
        ctx.quadraticCurveTo(98.8, 147.0, endX + 0.95, endY - 0.1);
        ctx.lineTo(endX + 0.15, endY - 0.95);
        ctx.lineTo(endX - 0.9, endY + 0.1);
        ctx.quadraticCurveTo(97.5, 147.4, rimX - 0.7, rimY);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#380909";
        ctx.lineWidth = 0.4;
        ctx.stroke();

        ctx.strokeStyle = "#d4a342";
        ctx.lineWidth = 0.45;
        ctx.beginPath();
        ctx.moveTo(rimX, rimY - 0.2);
        ctx.quadraticCurveTo(98.2, 147.2, endX + 0.05, endY - 1.2);
        ctx.stroke();
      } else if (id === 8) {
        const sx = midX + 0.2;
        const sy = 141.4;
        const rimX = midX + 2.3;
        const rimY = coverBotY + 0.1;
        const endX = 114.5;
        const endY = 149.2;

        ctx.strokeStyle = "rgba(10, 4, 2, 0.72)";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(sx, sy + 0.3);
        ctx.quadraticCurveTo(midX + 1.8, 143.1, rimX, rimY + 0.5);
        ctx.quadraticCurveTo(109.5, 147.1, endX, endY + 0.6);
        ctx.stroke();

        ctx.strokeStyle = "#cfa04a";
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(midX + 1.8, 142.8, rimX, rimY);
        ctx.quadraticCurveTo(109.5, 146.5, endX, endY);
        ctx.stroke();

        ctx.strokeStyle = "#fae096";
        ctx.lineWidth = 0.4;
        ctx.beginPath();
        ctx.moveTo(sx + 0.4, sy + 0.4);
        ctx.quadraticCurveTo(midX + 1.8, 142.8, rimX + 0.5, rimY + 0.3);
        ctx.stroke();

        ctx.fillStyle = "#7d1616";
        ctx.beginPath();
        ctx.arc(endX, endY, 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#380909";
        ctx.lineWidth = 0.35;
        ctx.stroke();
        ctx.fillStyle = "#e6b84c";
        ctx.beginPath();
        ctx.arc(endX - 0.2, endY - 0.2, 0.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (id === 9) {
        const rx = 73.5;
        const ry = 129.2;
        const rimX = 72.5;
        const rimY = 142.2;
        const endX = 71.5;
        const endY = 147.2;

        ctx.fillStyle = "rgba(12, 5, 2, 0.55)";
        ctx.beginPath();
        ctx.moveTo(rx - 1.2, ry + 1.0);
        ctx.lineTo(rimX - 1.4, rimY + 0.9);
        ctx.lineTo(endX - 1.5, endY + 0.7);
        ctx.lineTo(endX + 1.7, endY + 0.7);
        ctx.lineTo(rimX + 1.6, rimY + 0.9);
        ctx.lineTo(rx + 1.6, ry + 1.0);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#e4cfa5";
        ctx.beginPath();
        ctx.moveTo(rx - 1.4, ry);
        ctx.lineTo(rimX - 1.5, rimY);
        ctx.lineTo(endX - 1.6, endY - 0.3);
        ctx.lineTo(endX + 1.6, endY + 0.4);
        ctx.lineTo(rimX + 1.5, rimY);
        ctx.lineTo(rx + 1.4, ry);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#6b4d2a";
        ctx.lineWidth = 0.45;
        ctx.stroke();

        ctx.fillStyle = "#4f3318";
        ctx.fillRect(endX - 1.0, rimY + 1.2, 1.9, 0.55);
        ctx.fillRect(endX - 1.0, rimY + 2.4, 1.4, 0.55);
      } else if (id === 10) {
        const rx = 61.5;
        const ry = 136.0;
        const rimX = 60.4;
        const rimY = 142.3;
        const endX = 54.5;
        const endY = 149.2;

        ctx.strokeStyle = "rgba(10, 4, 2, 0.58)";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(rimX, rimY + 0.7);
        ctx.quadraticCurveTo(57.2, 146.5, endX, endY + 0.6);
        ctx.stroke();

        ctx.strokeStyle = "#2c6648";
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rimX, rimY);
        ctx.quadraticCurveTo(57.2, 146.0, endX, endY);
        ctx.stroke();

        ctx.strokeStyle = "rgba(20, 8, 3, 0.90)";
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(rx - 1.4, ry - 0.2);
        ctx.lineTo(rx + 1.4, ry - 0.2);
        ctx.stroke();

        ctx.strokeStyle = "#d4a342";
        ctx.lineWidth = 0.55;
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - 1.6, endY + 1.4);
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - 0.5, endY + 1.7);
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX + 0.8, endY + 1.5);
        ctx.stroke();
      } else if (id === 11) {
        const rx = 85.5;
        const ry = 140.4;
        const rimX = 84.5;
        const rimY = 142.4;
        const endX = 82.6;
        const endY = 148.6;

        ctx.fillStyle = "rgba(10, 4, 2, 0.62)";
        ctx.beginPath();
        ctx.moveTo(rimX - 1.0, rimY + 0.7);
        ctx.lineTo(endX - 1.0, endY + 0.8);
        ctx.lineTo(endX + 1.0, endY + 0.8);
        ctx.lineTo(rimX + 1.0, rimY + 0.7);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#6e3f20";
        ctx.beginPath();
        ctx.moveTo(rx - 1.0, ry);
        ctx.lineTo(rimX - 1.0, rimY);
        ctx.lineTo(endX - 1.0, endY - 1.4);
        ctx.lineTo(endX + 1.0, endY - 1.4);
        ctx.lineTo(rimX + 1.0, rimY);
        ctx.lineTo(rx + 1.0, ry);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#2e1708";
        ctx.lineWidth = 0.4;
        ctx.stroke();

        ctx.strokeStyle = "rgba(20, 8, 3, 0.90)";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(rx - 1.3, ry - 0.1);
        ctx.lineTo(rx + 1.3, ry - 0.1);
        ctx.stroke();

        ctx.fillStyle = "#d49d3b";
        ctx.beginPath();
        ctx.moveTo(endX - 1.0, endY - 1.2);
        ctx.lineTo(endX + 1.0, endY - 1.2);
        ctx.lineTo(endX - 0.1, endY + 0.7);
        ctx.closePath();
        ctx.fill();
      } else if (id === 12) {
        const rx = 142.0;
        const ry = 130.0;
        const rimX = 143.5;
        const rimY = 142.2;
        const endX = 147.5;
        const endY = 148.0;

        ctx.strokeStyle = "rgba(10, 4, 2, 0.48)";
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(rimX, rimY + 0.6);
        ctx.quadraticCurveTo(145.8, 145.6, endX, endY + 0.5);
        ctx.stroke();

        ctx.strokeStyle = "#5d84a6";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.quadraticCurveTo(143.0, 136.5, rimX, rimY);
        ctx.quadraticCurveTo(145.8, 145.2, endX, endY);
        ctx.stroke();

        ctx.fillStyle = "#cbd5e1";
        ctx.beginPath();
        ctx.arc(endX, endY, 1.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(endX - 0.25, endY - 0.25, 0.35, 0, Math.PI * 2);
        ctx.fill();
      } else if (id === 13) {
        const rx = 124.5;
        const ry = 136.5;
        const rimX = 126.0;
        const rimY = 142.4;
        const endX = 131.5;
        const endY = 149.2;

        ctx.strokeStyle = "rgba(10, 4, 2, 0.58)";
        ctx.lineWidth = 1.9;
        ctx.beginPath();
        ctx.moveTo(rimX, rimY + 0.7);
        ctx.quadraticCurveTo(128.8, 146.4, endX, endY + 0.6);
        ctx.stroke();

        ctx.fillStyle = "#542648";
        ctx.beginPath();
        ctx.moveTo(rx - 0.7, ry);
        ctx.lineTo(rimX - 0.75, rimY);
        ctx.quadraticCurveTo(128.0, 146.0, endX - 0.85, endY - 1.1);
        ctx.lineTo(endX + 0.35, endY + 0.5);
        ctx.lineTo(endX + 0.9, endY - 1.1);
        ctx.quadraticCurveTo(129.6, 145.6, rimX + 0.75, rimY);
        ctx.lineTo(rx + 0.7, ry);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = "#c99b3b";
        ctx.lineWidth = 0.45;
        ctx.beginPath();
        ctx.moveTo(rimX + 0.45, rimY + 0.2);
        ctx.quadraticCurveTo(129.3, 145.8, endX + 0.6, endY - 1.0);
        ctx.stroke();
      } else if (id === 14) {
        const p = rightSurf(0.42, 0);
        const bx = p.x;
        const by = p.y + 1.6;

        ctx.fillStyle = "#cfa756";
        ctx.beginPath();
        ctx.moveTo(bx - 2.3, by);
        ctx.lineTo(bx - 2.8, by - 6.1);
        ctx.lineTo(bx - 1.2, by - 5.1);
        ctx.lineTo(bx + 0.3, by - 6.2);
        ctx.lineTo(bx + 0.6, by);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#3b290c";
        ctx.lineWidth = 0.45;
        ctx.stroke();

        ctx.fillStyle = "#3a6b65";
        ctx.beginPath();
        ctx.moveTo(bx + 0.7, by);
        ctx.lineTo(bx + 1.2, by - 4.7);
        ctx.lineTo(bx + 3.4, by - 3.9);
        ctx.lineTo(bx + 2.8, by);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#142624";
        ctx.lineWidth = 0.45;
        ctx.stroke();

        ctx.strokeStyle = "#e6d6b3";
        ctx.lineWidth = 0.45;
        ctx.beginPath();
        ctx.moveTo(bx + 1.4, by - 3.2);
        ctx.lineTo(bx + 2.8, by - 2.8);
        ctx.stroke();
      }
    }

    ctx.fillStyle = "#c5ae84";
    ctx.beginPath();
    ctx.moveTo(65.0, 101.2);
    ctx.lineTo(lpFarL + 0.5, lpTopY + 1.0);
    ctx.lineTo(lpNearL + 0.5, lpBotY + 2.5);
    ctx.lineTo(52.0, 141.0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#755834";
    ctx.lineWidth = 0.4;
    for (let i = 1; i <= 2; i++) {
      const k = i * 1.1;
      ctx.beginPath();
      ctx.moveTo(65.5 + k * 0.6, 100.5 - k * 1.2);
      ctx.lineTo(52.8 + k * 1.0, 139.8 - k * 2.5);
      ctx.stroke();
    }

    ctx.fillStyle = "#c5ae84";
    ctx.beginPath();
    ctx.moveTo(rpFarR - 0.5, rpTopY + 1.0);
    ctx.lineTo(143.0, 101.2);
    ctx.lineTo(156.0, 141.0);
    ctx.lineTo(rpNearR - 0.5, rpBotY + 2.5);
    ctx.closePath();
    ctx.fill();
    for (let i = 1; i <= 2; i++) {
      const k = i * 1.1;
      ctx.beginPath();
      ctx.moveTo(142.5 - k * 0.6, 100.5 - k * 1.2);
      ctx.lineTo(155.2 - k * 1.0, 139.8 - k * 2.5);
      ctx.stroke();
    }

    for (let tabId = 0; tabId <= 6; tabId++) drawUniqueEdgeTab(tabId);
    drawUniqueBookmark(14);

    const lbGrad = ctx.createLinearGradient(52, 130, 103, 141);
    lbGrad.addColorStop(0, "#c8b083");
    lbGrad.addColorStop(0.45, "#dfca9f");
    lbGrad.addColorStop(0.85, "#b89b6e");
    lbGrad.addColorStop(1, "#6f5130");
    ctx.fillStyle = lbGrad;

    ctx.beginPath();
    ctx.moveTo(lpNearL, lpBotY);
    ctx.quadraticCurveTo(80.0, 128.8, midX - 0.5, creaseBotY);
    ctx.lineTo(midX - 3.6, 141.0);
    ctx.lineTo(52.0, 141.0);
    ctx.lineTo(56.2, 130.5);
    ctx.closePath();
    ctx.fill();

    const leftLiftShadow = ctx.createLinearGradient(56, 128.5, 56, 134.5);
    leftLiftShadow.addColorStop(0, "rgba(30, 14, 5, 0.88)");
    leftLiftShadow.addColorStop(1, "rgba(30, 14, 5, 0)");
    ctx.fillStyle = leftLiftShadow;
    ctx.beginPath();
    ctx.moveTo(56.0, lpBotY);
    ctx.quadraticCurveTo(79.0, 128.8, 96.0, 132.8);
    ctx.quadraticCurveTo(76.0, 131.6, 54.8, 134.5);
    ctx.closePath();
    ctx.fill();

    drawUniqueBookmark(11);
    ctx.strokeStyle = "rgba(72, 46, 22, 0.58)";
    ctx.lineWidth = 0.45;
    for (let i = 2; i < 4; i++) {
      const yEnd = 135.4 + i * 1.45;
      const yStart = 133.2 + i * 1.85;
      ctx.beginPath();
      ctx.moveTo(54.8 - i * 0.65, yStart);
      ctx.quadraticCurveTo(78.0, yEnd - 2.3 + i * 0.25, midX - 1.2 - i * 0.55, yEnd + 0.6);
      ctx.stroke();
    }

    drawUniqueBookmark(10);
    ctx.strokeStyle = "rgba(72, 46, 22, 0.58)";
    ctx.lineWidth = 0.45;
    for (let i = 0; i < 2; i++) {
      const yEnd = 135.4 + i * 1.45;
      const yStart = 133.2 + i * 1.85;
      ctx.beginPath();
      ctx.moveTo(54.8 - i * 0.65, yStart);
      ctx.quadraticCurveTo(78.0, yEnd - 2.3 + i * 0.25, midX - 1.2 - i * 0.55, yEnd + 0.6);
      ctx.stroke();
    }

    drawUniqueBookmark(9);

    const rbGrad = ctx.createLinearGradient(midX, 134, 156, 141);
    rbGrad.addColorStop(0, "#6e502f");
    rbGrad.addColorStop(0.25, "#bea376");
    rbGrad.addColorStop(0.7, "#dfca9f");
    rbGrad.addColorStop(1, "#c3aa7d");
    ctx.fillStyle = rbGrad;

    ctx.beginPath();
    ctx.moveTo(midX + 0.5, creaseBotY);
    ctx.quadraticCurveTo(128.0, 126.2, rpNearR, rpBotY);
    ctx.lineTo(156.0, 141.0);
    ctx.lineTo(midX + 3.6, 141.0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#331a0b";
    ctx.beginPath();
    ctx.moveTo(midX + 1.0, creaseBotY + 0.8);
    ctx.quadraticCurveTo(128.0, 127.0, rpNearR + 1.5, rpBotY + 1.5);
    ctx.lineTo(154.6, 138.8);
    ctx.quadraticCurveTo(126.0, 135.5, midX + 3.0, 139.2);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(72, 46, 22, 0.55)";
    ctx.lineWidth = 0.4;
    for (let s = 0; s < 2; s++) {
      ctx.beginPath();
      ctx.moveTo(midX + 3.8, 139.6 + s * 0.9);
      ctx.quadraticCurveTo(130.0, 138.6 + s * 0.9, 155.4, 139.5 + s * 0.9);
      ctx.stroke();
    }

    const rightFannedWaves = [
      { sY: 138.2, ctrlX: 129.0, ctrlY: 134.8, eX: 154.2, eY: 136.6, thick: 1.5, col: "#cfb68b" },
      { sY: 136.7, ctrlX: 130.5, ctrlY: 132.4, eX: 154.5, eY: 133.7, thick: 1.4, col: "#dec89f" },
      { sY: 135.2, ctrlX: 130.0, ctrlY: 129.9, eX: 152.6, eY: 130.3, thick: 1.35, col: "#ebd7b1" },
    ];
    function drawWaveLayer(wave) {
      ctx.strokeStyle = "rgba(32, 14, 5, 0.88)";
      ctx.lineWidth = wave.thick + 0.7;
      ctx.beginPath();
      ctx.moveTo(midX + 1.2, wave.sY + 0.6);
      ctx.quadraticCurveTo(wave.ctrlX, wave.ctrlY + 0.6, wave.eX, wave.eY + 0.6);
      ctx.stroke();

      ctx.strokeStyle = wave.col;
      ctx.lineWidth = wave.thick;
      ctx.beginPath();
      ctx.moveTo(midX + 1.0, wave.sY);
      ctx.quadraticCurveTo(wave.ctrlX, wave.ctrlY, wave.eX, wave.eY);
      ctx.stroke();
    }

    drawWaveLayer(rightFannedWaves[0]);
    drawUniqueBookmark(13);
    drawWaveLayer(rightFannedWaves[1]);
    drawWaveLayer(rightFannedWaves[2]);

    drawUniqueBookmark(12);

    ctx.fillStyle = "#180505";
    ctx.beginPath();
    ctx.ellipse(midX, coverBotY + 0.3, 3.8, 2.3, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    drawUniqueBookmark(8);

    ctx.strokeStyle = "#99342c";
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.ellipse(midX, coverBotY + 0.3, 4.1, 2.6, 0, Math.PI, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "#e4cfa5";
    if (typeof ctx.setLineDash === "function") {
      ctx.setLineDash([0.9, 0.9]);
    }
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.ellipse(midX, coverBotY + 0.2, 4.0, 2.5, 0, Math.PI + 0.15, Math.PI * 2 - 0.15);
    ctx.stroke();
    if (typeof ctx.setLineDash === "function") {
      ctx.setLineDash([]);
    }

    ctx.beginPath();
    ctx.moveTo(lpFarL, lpTopY);
    ctx.quadraticCurveTo(85.5, 91.5, lpFarR, creaseTopY);
    ctx.lineTo(lpNearR, creaseBotY);
    ctx.quadraticCurveTo(80.0, 128.8, lpNearL, lpBotY);
    ctx.closePath();

    const lGrad = ctx.createLinearGradient(lpNearL, lpBotY, lpFarR, lpTopY);
    lGrad.addColorStop(0, "#e3ca9e");
    lGrad.addColorStop(0.22, "#faf0da");
    lGrad.addColorStop(0.84, "#f3e2c0");
    lGrad.addColorStop(1, "#bfa378");
    ctx.fillStyle = lGrad;
    ctx.fill();
    ctx.strokeStyle = "#755832";
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(rpFarL, creaseTopY);
    ctx.quadraticCurveTo(122.5, 90.8, rpFarR, rpTopY);
    ctx.lineTo(rpNearR, rpBotY);
    ctx.quadraticCurveTo(128.0, 126.2, rpNearL, creaseBotY);
    ctx.closePath();

    const rGrad = ctx.createLinearGradient(rpFarL, lpTopY, rpNearR, rpBotY);
    rGrad.addColorStop(0, "#bfa378");
    rGrad.addColorStop(0.16, "#f3e2c0");
    rGrad.addColorStop(0.76, "#fbf2de");
    rGrad.addColorStop(1, "#e5cc9f");
    ctx.fillStyle = rGrad;
    ctx.fill();
    ctx.strokeStyle = "#755832";
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.strokeStyle = "rgba(35, 16, 5, 0.78)";
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(midX, creaseTopY);
    ctx.lineTo(midX, creaseBotY);
    ctx.stroke();

    const gutGrad = ctx.createLinearGradient(midX - 4, 0, midX + 4, 0);
    gutGrad.addColorStop(0, "rgba(0,0,0,0)");
    gutGrad.addColorStop(0.5, "rgba(50, 25, 8, 0.28)");
    gutGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gutGrad;
    ctx.fillRect(midX - 4, creaseTopY, 8, creaseBotY - creaseTopY);

    const lpMarginU = 0.135;
    ctx.fillStyle = "#6e1d16";
    fillSurfQuad(leftSurf, lpMarginU, 0.265, 0.105, 0.232, 3);
    ctx.strokeStyle = "#b88a3b";
    ctx.lineWidth = 0.55;
    ctx.stroke();

    ctx.fillStyle = "#fef08a";
    fillSurfQuad(leftSurf, 0.172, 0.228, 0.138, 0.198, 2);

    ctx.fillStyle = "rgba(42, 25, 12, 0.90)";
    fillSurfQuad(leftSurf, 0.305, 0.495, 0.145, 0.195, 3);
    fillSurfQuad(leftSurf, 0.535, 0.755, 0.145, 0.195, 3);

    const linesCount = ledgerState.leftLines;
    let curV = 0.285;
    for (let l = 1; l <= linesCount; l++) {
      if (curV > 0.895) break;
      const tPersp = (curV - 0.285) / 0.60;
      const dvLine = 0.023 + tPersp * 0.017;

      const scaleU = 0.88 + tPersp * 0.20;
      const wu1 = (0.115 + ((l * 7) % 3) * 0.022) * scaleU;
      const wu2 = (0.155 + ((l * 5) % 4) * 0.024) * scaleU;
      const wu3 = (0.130 + ((l * 11) % 4) * 0.022) * scaleU;
      const wu4 = (0.095 + ((l * 3) % 3) * 0.020) * scaleU;
      const gapU = 0.036;

      ctx.fillStyle = "rgba(50, 32, 16, 0.78)";
      let cursorU = lpMarginU;
      fillSurfQuad(leftSurf, cursorU, cursorU + wu1, curV, curV + dvLine, 2);
      cursorU += wu1 + gapU;
      fillSurfQuad(leftSurf, cursorU, cursorU + wu2, curV, curV + dvLine, 3);
      cursorU += wu2 + gapU;
      fillSurfQuad(leftSurf, cursorU, cursorU + wu3, curV, curV + dvLine, 3);
      cursorU += wu3 + gapU;
      if (cursorU + wu4 <= 0.855) {
        fillSurfQuad(leftSurf, cursorU, cursorU + wu4, curV, curV + dvLine, 2);
      }

      curV += 0.043 + tPersp * 0.017;
    }

    const totalRows = ledgerState.rightRows;
    if (totalRows > 0) {
      const tblU0 = 0.115;
      const tblU4 = 0.905;
      const fractions = [0, 0.25, 0.60, 0.74, 1.0];
      const colU = (c) => tblU0 + (tblU4 - tblU0) * fractions[c];

      const tblVTop = 0.110;
      const hdrV = 0.068;

      const rowVs = [];
      let runV = tblVTop + hdrV;
      for (let r = 1; r <= totalRows; r++) {
        const tRow = r / 13;
        const rV = 0.049 + tRow * 0.020;
        rowVs.push(rV);
        runV += rV;
      }
      const tblVBot = runV;

      ctx.strokeStyle = "rgba(74, 48, 24, 0.72)";
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (let i = 0; i <= 8; i++) {
        const p = rightSurf(colU(0) + (colU(4) - colU(0)) * (i / 8), tblVTop);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      const pBR = rightSurf(colU(4), tblVBot);
      ctx.lineTo(pBR.x, pBR.y);
      for (let i = 7; i >= 0; i--) {
        const p = rightSurf(colU(0) + (colU(4) - colU(0)) * (i / 8), tblVBot);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.stroke();

      strokeSurfH(rightSurf, colU(0), colU(4), tblVTop + hdrV, 8);

      for (let c = 1; c < 4; c++) {
        const pt = rightSurf(colU(c), tblVTop);
        const pb = rightSurf(colU(c), tblVBot);
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(45, 26, 10, 0.90)";
      for (let c = 0; c < 4; c++) {
        fillSurfQuad(rightSurf, colU(c) + 0.016, colU(c + 1) - 0.016, tblVTop + 0.015, tblVTop + hdrV - 0.016, 3);
      }

      let curRowV = tblVTop + hdrV;
      for (let r = 1; r <= totalRows; r++) {
        const rV = rowVs[r - 1];
        const vTop = curRowV;
        curRowV += rV;

        const dvInk = 0.021 + vTop * 0.014;
        const vInk1 = vTop + 0.014;
        const vInk2 = vInk1 + dvInk;

        ctx.strokeStyle = "rgba(74, 48, 24, 0.35)";
        strokeSurfH(rightSurf, colU(0), colU(4), vTop + rV, 8);

        ctx.fillStyle = "rgba(50, 32, 16, 0.72)";
        fillSurfQuad(rightSurf, colU(0) + 0.016, colU(1) - 0.016, vInk1, vInk2, 2);
        fillSurfQuad(rightSurf, colU(1) + 0.016, colU(2) - 0.016, vInk1, vInk2, 3);

        ctx.fillStyle = "#7a2218";
        fillSurfQuad(rightSurf, colU(2) + 0.013, colU(3) - 0.013, vInk1 - 0.002, vInk2 + 0.008, 2);

        ctx.fillStyle = "rgba(50, 32, 16, 0.72)";
        fillSurfQuad(rightSurf, colU(3) + 0.018, colU(4) - 0.018, vInk1, vInk2, 2);
      }
    }

    drawUniqueBookmark(7);

    ctx.restore();
  }

  function renderNotesDeskScene(ctx, totalGold, notesSession = NOTES_FALLBACK_SESSION, animTime = 0, precomputedDist = null) {
    if (typeof ctx.clearRect === "function") {
      ctx.clearRect(0, 0, NOTES_CW, NOTES_CH);
    }

    const wallGrad = ctx.createLinearGradient(0, 0, 0, 68);
    wallGrad.addColorStop(0, "#040406");
    wallGrad.addColorStop(0.6, "#0c0b11");
    wallGrad.addColorStop(1, "#17151e");
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, 0, NOTES_CW, 68);

    ctx.strokeStyle = "#09080c";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, 16); ctx.lineTo(NOTES_CW, 16);
    ctx.moveTo(0, 34); ctx.lineTo(NOTES_CW, 34);
    ctx.moveTo(0, 52); ctx.lineTo(NOTES_CW, 52);
    ctx.moveTo(0, 68); ctx.lineTo(NOTES_CW, 68);

    ctx.moveTo(42, 0); ctx.lineTo(42, 16);
    ctx.moveTo(105, 0); ctx.lineTo(105, 16);
    ctx.moveTo(168, 0); ctx.lineTo(168, 16);

    ctx.moveTo(21, 16); ctx.lineTo(21, 34);
    ctx.moveTo(74, 16); ctx.lineTo(74, 34);
    ctx.moveTo(137, 16); ctx.lineTo(137, 34);
    ctx.moveTo(189, 16); ctx.lineTo(189, 34);

    ctx.moveTo(48, 34); ctx.lineTo(48, 52);
    ctx.moveTo(112, 34); ctx.lineTo(112, 52);
    ctx.moveTo(176, 34); ctx.lineTo(176, 52);
    ctx.stroke();

    const vigGrad = ctx.createRadialGradient(105, 60, 40, 105, 60, 120);
    vigGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
    vigGrad.addColorStop(1, "rgba(0, 0, 0, 0.45)");
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, NOTES_CW, 68);

    const dTop = getNotesDeskBounds(68);
    const dBot = getNotesDeskBounds(152);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(dTop.left, 68);
    ctx.lineTo(dTop.right, 68);
    ctx.lineTo(dBot.right, 152);
    ctx.lineTo(dBot.left, 152);
    ctx.closePath();

    const deskGrad = ctx.createLinearGradient(0, 68, 0, 152);
    deskGrad.addColorStop(0, "#150c08");
    deskGrad.addColorStop(0.35, "#22130c");
    deskGrad.addColorStop(0.8, "#1b0e09");
    deskGrad.addColorStop(1, "#110805");
    ctx.fillStyle = deskGrad;
    ctx.fill();

    ctx.strokeStyle = "rgba(68, 34, 18, 0.28)";
    ctx.lineWidth = 0.8;
    for (let gx = 18; gx <= 192; gx += 18) {
      const bx = 105 + (gx - 105) * (170 / 254);
      ctx.beginPath();
      ctx.moveTo(bx, 68);
      ctx.lineTo(gx, 152);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(180, 130, 40, 0.22)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(dTop.left + 2, 70);
    ctx.lineTo(dTop.right - 2, 70);
    ctx.lineTo(dBot.right - 3, 150);
    ctx.lineTo(dBot.left + 3, 150);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    const apronGrad = ctx.createLinearGradient(0, 152, 0, 168);
    apronGrad.addColorStop(0, "#361c12");
    apronGrad.addColorStop(0.15, "#22110a");
    apronGrad.addColorStop(0.85, "#130905");
    apronGrad.addColorStop(1, "#050201");
    ctx.fillStyle = apronGrad;
    ctx.beginPath();
    ctx.moveTo(dBot.left, 152);
    ctx.lineTo(dBot.right, 152);
    ctx.lineTo(dBot.right, 168);
    ctx.lineTo(dBot.left, 168);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 235, 175, 0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(dBot.left, 152);
    ctx.lineTo(dBot.right, 152);
    ctx.stroke();

    ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
    ctx.fillRect(0, 168, NOTES_CW, 2);

    const bTop = getNotesBlotterBounds(78);
    const bBot = getNotesBlotterBounds(144);

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.beginPath();
    ctx.moveTo(bTop.left - 2, 80);
    ctx.lineTo(bTop.right + 2, 80);
    ctx.lineTo(bBot.right + 2, 146);
    ctx.lineTo(bBot.left - 2, 146);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(bTop.left, 78);
    ctx.lineTo(bTop.right, 78);
    ctx.lineTo(bBot.right, 144);
    ctx.lineTo(bBot.left, 144);
    ctx.closePath();

    const blotterGrad = ctx.createLinearGradient(0, 78, 0, 144);
    blotterGrad.addColorStop(0, "#260e0e");
    blotterGrad.addColorStop(0.5, "#1a0808");
    blotterGrad.addColorStop(1, "#0f0404");
    ctx.fillStyle = blotterGrad;
    ctx.fill();

    const gTop = getNotesGoldBorderBounds(81);
    const gBot = getNotesGoldBorderBounds(141);

    ctx.strokeStyle = "rgba(180, 140, 45, 0.35)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(gTop.left, 81);
    ctx.lineTo(gTop.right, 81);
    ctx.lineTo(gBot.right, 141);
    ctx.lineTo(gBot.left, 141);
    ctx.closePath();
    ctx.stroke();

    [[gTop.left, 81], [gTop.right, 81], [gBot.right, 141], [gBot.left, 141]].forEach(([cx, cy]) => {
      ctx.fillStyle = "#a68239";
      ctx.beginPath();
      ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    const vis = precomputedDist || computeNotesVisualDistribution(totalGold, notesSession);
    const paperCounts = vis.paperPiles;
    const bookCounts = vis.bookPiles;
    const pointSeed = notesSession?.pointSeed ?? NOTES_FALLBACK_SESSION.pointSeed;

    const itemsToDraw = [];
    NOTES_SLOTS.forEach((slot, idx) => {
      itemsToDraw.push({
        type: "stack",
        slot,
        idx,
        count: paperCounts[idx] || 0,
        books: bookCounts[idx] || 0,
        baseY: slot.y + slot.jy,
      });
    });

    itemsToDraw.push({ type: "candelabra", x: 31, y: 112, baseY: 112 });
    itemsToDraw.push({ type: "open_book", baseY: 124 });
    itemsToDraw.push({ type: "inkstand", x: 180, y: 132, baseY: 132 });
    itemsToDraw.sort((a, b) => a.baseY - b.baseY);

    itemsToDraw.forEach((item) => {
      if (item.type === "candelabra") {
        drawNotesTableCandelabra(ctx, item.x, item.y, animTime);
      } else if (item.type === "stack") {
        const { slot, idx, count, books } = item;
        if (count <= 0 && books <= 0) return;

        const sx = slot.x;
        const sy = slot.y + slot.jy;
        const scale = slot.scale;
        const bookStepY = slot.bookStep * scale;
        const paperStepY = slot.paperStep * scale;

        ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
        ctx.beginPath();
        ctx.ellipse(sx, sy + 3.5, 19 * scale, 7.5 * scale, slot.yaw * 0.35, 0, Math.PI * 2);
        ctx.fill();

        let curY = sy;
        for (let b = 0; b < books; b++) {
          const jx = (notesSeededRand(pointSeed, idx * 41 + b, 11) - 0.5) * 1.15 * scale;
          const jy = (notesSeededRand(pointSeed, idx * 41 + b, 12) - 0.5) * 0.32 * scale;
          const jYaw = (notesSeededRand(pointSeed, idx * 41 + b, 13) - 0.5) * 0.07;
          const invIdx = Math.floor(notesSeededRand(pointSeed, idx * 41 + b, 14) * 12) + b;
          const showDecor = b === books - 1 || notesSeededRand(pointSeed, idx * 41 + b, 15) < 0.34;
          drawNotesPerspectiveBook(ctx, sx + jx, curY + jy, idx, invIdx, scale, jYaw, showDecor);
          curY -= bookStepY;
        }

        const paperBaseY = books > 0 ? curY - 0.6 * scale : sy;
        for (let p = 0; p < count; p++) {
          const py = paperBaseY - p * paperStepY;
          const pJx = (notesSeededRand(pointSeed, idx * 59 + p, 21) - 0.5) * 1.2 * scale;
          const pJyaw = (notesSeededRand(pointSeed, idx * 59 + p, 22) - 0.5) * 0.08;
          const isTop = p === count - 1;
          drawNotesPerspectivePaper(ctx, sx + pJx, py, idx, p, scale, isTop, pJyaw);
        }
      } else if (item.type === "open_book") {
        drawNotesOpenAccountingBook(ctx, totalGold, notesSession);
      } else if (item.type === "inkstand") {
        drawNotesPerspectiveInkstand(ctx, item.x, item.y);
      }
    });
  }

  function startNotesCanvasLoop(cv) {
    if (typeof root.requestAnimationFrame !== "function") return;
    const state = notesAnimStates.get(cv);
    if (!state || state.rafId) return;

    const loopToken = state.token;
    let lastPaintMs = typeof Date === "function" ? Date.now() : 0;
    const tick = () => {
      const cur = notesAnimStates.get(cv);
      if (!cur || cur !== state || cur.token !== loopToken) return;
      if (cv.isConnected) {
        cur.hasBeenConnected = true;
      } else if (cur.hasBeenConnected || cur.mountGrace <= 0) {
        cur.rafId = 0;
        notesAnimStates.delete(cv);
        return;
      } else {
        cur.mountGrace -= 1;
      }

      const now = typeof Date === "function" ? Date.now() : 0;
      if (now - lastPaintMs >= 30 && cv.width > 0 && cv.height > 0) {
        lastPaintMs = now;
        const ctx = typeof cv.getContext === "function" ? cv.getContext("2d") : null;
        if (ctx) {
          const dpr = root.devicePixelRatio || 1;
          if (typeof ctx.setTransform === "function") {
            ctx.setTransform((dpr * BANK_SCENE_W) / NOTES_CW, 0, 0, (dpr * BANK_SCENE_H) / NOTES_CH, 0, 0);
          }
          const animTime = Math.max(0, (now - cur.session.animStartTime) * 0.002);
          renderNotesDeskScene(ctx, cur.locGold, cur.session, animTime, cur.dist);
        }
      }
      cur.rafId = root.requestAnimationFrame(tick);
    };
    state.rafId = root.requestAnimationFrame(tick);
  }

  function drawNotesScene(cv, data, visuals, w) {
    const locGold = Math.max(0, Number(data?.locGold) || 0);
    const session = getNotesWindowSession(w);
    const dist =
      visuals &&
        Array.isArray(visuals.paperPiles) &&
        Array.isArray(visuals.bookPiles)
        ? { paperPiles: visuals.paperPiles, bookPiles: visuals.bookPiles }
        : computeNotesVisualDistribution(locGold, session);

    const prev = notesAnimStates.get(cv);
    const state = prev || {
      token: 1,
      rafId: 0,
      hasBeenConnected: Boolean(cv.isConnected),
      mountGrace: 12,
    };
    state.locGold = locGold;
    state.session = session;
    state.dist = dist;
    if (cv.isConnected) state.hasBeenConnected = true;
    notesAnimStates.set(cv, state);

    if (
      cv.dataset?.paintedSig === visuals.sig &&
      cv.dataset?.paintedW === String(BANK_SCENE_W) &&
      cv.dataset?.paintedH === String(BANK_SCENE_H)
    ) {
      decorateBankWindow(cv);
      startNotesCanvasLoop(cv);
      return;
    }

    const ctx = setupCanvas(cv, BANK_SCENE_W, BANK_SCENE_H, NOTES_CW, NOTES_CH);
    const now = typeof Date === "function" ? Date.now() : 0;
    const animTime = Math.max(0, (now - session.animStartTime) * 0.002);
    renderNotesDeskScene(ctx, locGold, session, animTime, dist);

    if (cv.dataset) {
      cv.dataset.paintedSig = visuals.sig;
      cv.dataset.paintedW = String(BANK_SCENE_W);
      cv.dataset.paintedH = String(BANK_SCENE_H);
    }
    decorateBankWindow(cv);
    startNotesCanvasLoop(cv);
  }

  function startSafeCanvasLoop(cv) {
    if (typeof root.requestAnimationFrame !== "function") return;
    const state = safeAnimStates.get(cv);
    if (!state || state.rafId) return;

    const loopToken = state.token;
    let lastPaintMs = typeof Date === "function" ? Date.now() : 0;
    const tick = () => {
      const cur = safeAnimStates.get(cv);
      if (!cur || cur !== state || cur.token !== loopToken) return;
      if (cv.isConnected) {
        cur.hasBeenConnected = true;
      } else if (cur.hasBeenConnected || cur.mountGrace <= 0) {
        cur.rafId = 0;
        safeAnimStates.delete(cv);
        return;
      } else {
        cur.mountGrace -= 1;
      }

      const now = typeof Date === "function" ? Date.now() : 0;
      if (now - lastPaintMs >= 30 && cv.width > 0 && cv.height > 0) {
        lastPaintMs = now;
        const ctx = typeof cv.getContext === "function" ? cv.getContext("2d") : null;
        if (ctx) {
          const dpr = root.devicePixelRatio || 1;
          if (typeof ctx.setTransform === "function") {
            ctx.setTransform((dpr * BANK_SCENE_W) / CW, 0, 0, (dpr * BANK_SCENE_H) / CH, 0, 0);
          }
          const animTimeMs = Math.max(0, now - (cur.sessionProfile?.animStartTime || 0));
          renderFullScene(ctx, cur.gold, cur.sessionProfile, animTimeMs);
        }
      }
      cur.rafId = root.requestAnimationFrame(tick);
    };
    state.rafId = root.requestAnimationFrame(tick);
  }

  function drawSafeScene(cv, data, visuals, w) {
    const gold =
      data.accountGold > 0
        ? data.accountGold
        : data.totalBankGold || data.bankGold || 0;
    const sessionProfile = getWindowSessionProfiles(w);

    const prev = safeAnimStates.get(cv);
    const state = prev || {
      token: 1,
      rafId: 0,
      hasBeenConnected: Boolean(cv.isConnected),
      mountGrace: 12,
    };
    state.gold = gold;
    state.sessionProfile = sessionProfile;
    if (cv.isConnected) state.hasBeenConnected = true;
    safeAnimStates.set(cv, state);

    if (
      cv.dataset?.paintedSig === visuals.sig &&
      cv.dataset?.paintedW === String(BANK_SCENE_W) &&
      cv.dataset?.paintedH === String(BANK_SCENE_H)
    ) {
      decorateBankWindow(cv);
      startSafeCanvasLoop(cv);
      return;
    }

    const ctx = setupCanvas(cv, BANK_SCENE_W, BANK_SCENE_H, CW, CH);
    const now = typeof Date === "function" ? Date.now() : 0;
    const animTimeMs = Math.max(0, now - (sessionProfile.animStartTime || 0));
    renderFullScene(ctx, gold, sessionProfile, animTimeMs);

    if (cv.dataset) {
      cv.dataset.paintedSig = visuals.sig;
      cv.dataset.paintedW = String(BANK_SCENE_W);
      cv.dataset.paintedH = String(BANK_SCENE_H);
    }
    decorateBankWindow(cv);
    startSafeCanvasLoop(cv);
  }

  const SILVER_INGOT_HALF_W = 7.35;
  const SILVER_INGOT_HALF_LEN = 15.0;
  const SILVER_INGOT_OFFSET = 8.2;

  const SILVER_SCALE_PAN_SLOTS_9 = [
    [-3.1, -0.5, 0.04],
    [3.1, -0.5, -0.05],
    [0.0, 0.1, 0.02],
    [-3.5, -1.8, -0.04],
    [3.2, -1.8, 0.05],
    [-0.2, -1.5, -0.02],
    [-1.7, -3.1, 0.04],
    [1.7, -3.1, -0.04],
    [0.0, -4.4, 0.02],
  ];

  function silverGetDeskBounds(y) {
    const t = Math.max(0, Math.min(1, (y - 70) / (158 - 70)));
    return {
      left: 20 + (2 - 20) * t,
      right: 190 + (208 - 190) * t,
    };
  }

  function silverProjectDeskQuad(cx, cy, halfW, halfD, offsetLat, yaw, scale, extraPersp = 0.0052) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const yComp = 0.45;
    const vanishBias = (105 - cx) * 0.0040;
    const mapPt = (lx, lz) => {
      const px = lx + offsetLat;
      const rx = px * c - lz * s;
      const rz = px * s + lz * c;
      const p = 1 + rz * extraPersp;
      return {
        x: cx + (rx * p + (-rz * vanishBias)) * scale,
        y: cy + rz * yComp * p * scale,
      };
    };
    return {
      tl: mapPt(-halfW, -halfD),
      tr: mapPt(halfW, -halfD),
      br: mapPt(halfW, halfD),
      bl: mapPt(-halfW, halfD),
    };
  }

  function silverEvalQuadSurf(q, u, v) {
    const tu = (u + 1) * 0.5;
    const tv = (v + 1) * 0.5;
    const topX = q.tl.x + (q.tr.x - q.tl.x) * tu;
    const topY = q.tl.y + (q.tr.y - q.tl.y) * tu;
    const botX = q.bl.x + (q.br.x - q.bl.x) * tu;
    const botY = q.bl.y + (q.br.y - q.bl.y) * tu;
    return {
      x: topX + (botX - topX) * tv,
      y: topY + (botY - topY) * tv,
    };
  }

  function silverFillQuadSubRect(ctx, q, u1, u2, v1, v2) {
    const a = silverEvalQuadSurf(q, u1, v1);
    const b = silverEvalQuadSurf(q, u2, v1);
    const c = silverEvalQuadSurf(q, u2, v2);
    const d = silverEvalQuadSurf(q, u1, v2);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
  }

  function silverEvalQuadCenter(q) {
    return {
      x: (q.tl.x + q.tr.x + q.br.x + q.bl.x) * 0.25,
      y: (q.tl.y + q.tr.y + q.br.y + q.bl.y) * 0.25,
    };
  }

  function drawSingleSilverCoin(
    ctx,
    x,
    y,
    baseRx,
    inv = 0,
    deskTilt = 0,
    depthShade = 1.0,
    perspYFactor = 0.39,
  ) {
    const rx = baseRx;
    const ry = baseRx * perspYFactor;
    const rimDepth = Math.max(0.65, rx * 0.21);

    ctx.save();
    ctx.translate(x, y);
    if (deskTilt) ctx.rotate(deskTilt);

    // 1. Soft floor/stack drop shadow
    ctx.fillStyle = `rgba(0, 0, 0, ${0.38 * depthShade})`;
    ctx.beginPath();
    ctx.ellipse(0, rimDepth + 0.45, rx * 1.06, ry * 1.05, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Milled Silver Cylindrical Edge (extruded downward)
    const rimGrad = ctx.createLinearGradient(-rx, 0, rx, 0);
    if (inv === 2) {
      rimGrad.addColorStop(0, "#0f172a");
      rimGrad.addColorStop(0.28, "#475569");
      rimGrad.addColorStop(0.55, "#cbd5e1");
      rimGrad.addColorStop(1, "#1e293b");
    } else {
      rimGrad.addColorStop(0, "#1e293b");
      rimGrad.addColorStop(0.25, "#64748b");
      rimGrad.addColorStop(0.55, "#f1f5f9");
      rimGrad.addColorStop(0.85, "#475569");
      rimGrad.addColorStop(1, "#0f172a");
    }
    ctx.fillStyle = rimGrad;
    ctx.beginPath();
    ctx.ellipse(0, rimDepth, rx, ry, 0, 0, Math.PI);
    ctx.lineTo(-rx, 0);
    ctx.ellipse(0, 0, rx, ry, 0, Math.PI, Math.PI * 2, true);
    ctx.closePath();
    ctx.fill();

    // Fine vertical milled edge teeth along front curve
    ctx.fillStyle = "rgba(15, 23, 42, 0.48)";
    for (let mx = -rx * 0.7; mx <= rx * 0.7; mx += Math.max(1.2, rx * 0.34)) {
      ctx.fillRect(mx, ry * 0.35, 0.45, rimDepth * 0.75);
    }

    // 3. Top Coin Face (oriented along desk perspective ellipse)
    const topGrad = ctx.createLinearGradient(-rx, -ry, rx, ry);
    if (inv === 0) {
      topGrad.addColorStop(0, depthShade < 0.92 ? "#f1f5f9" : "#ffffff");
      topGrad.addColorStop(0.35, "#cbd5e1");
      topGrad.addColorStop(0.75, "#94a3b8");
      topGrad.addColorStop(1, "#475569");
    } else if (inv === 1) {
      topGrad.addColorStop(0, "#e2e8f0");
      topGrad.addColorStop(0.42, "#94a3b8");
      topGrad.addColorStop(0.78, "#64748b");
      topGrad.addColorStop(1, "#334155");
    } else {
      topGrad.addColorStop(0, "#f8fafc");
      topGrad.addColorStop(0.30, "#cbd5e1");
      topGrad.addColorStop(0.68, "#475569");
      topGrad.addColorStop(1, "#1e293b");
    }
    ctx.fillStyle = topGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // Crisp specular outer rim bevel
    ctx.strokeStyle = inv === 2 ? "#e2e8f0" : "#ffffff";
    ctx.lineWidth = 0.48;
    ctx.stroke();

    // 4. Die Stamp Relief Projected Flat Into Perspective Ellipse
    ctx.save();
    ctx.scale(1, ry / rx);
    if (inv === 0) {
      ctx.strokeStyle = "rgba(51, 65, 85, 0.58)";
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      ctx.arc(0, 0, rx * 0.66, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#334155";
      ctx.beginPath();
      ctx.moveTo(0, -rx * 0.34);
      ctx.lineTo(rx * 0.32, 0);
      ctx.lineTo(0, rx * 0.34);
      ctx.lineTo(-rx * 0.32, 0);
      ctx.closePath();
      ctx.fill();
    } else if (inv === 1) {
      ctx.strokeStyle = "rgba(30, 41, 59, 0.52)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, rx * 0.62, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#1e293b";
      ctx.beginPath();
      ctx.arc(0, 0, rx * 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e2e8f0";
      ctx.beginPath();
      ctx.arc(-rx * 0.08, -rx * 0.08, rx * 0.14, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = "rgba(241, 245, 249, 0.55)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, rx * 0.68, Math.PI * 0.9, Math.PI * 1.9);
      ctx.stroke();

      ctx.fillStyle = "#1e293b";
      const bar = rx * 0.38;
      ctx.fillRect(-bar, -rx * 0.10, bar * 2, rx * 0.20);
      ctx.fillRect(-rx * 0.10, -bar, rx * 0.20, bar * 2);
    }
    ctx.restore();

    ctx.restore();
  }

  function silverGetCoinPerspective(x, y, scaleMul = 1.0) {
    const t = Math.max(0, Math.min(1, (y - 70) / (158 - 70)));
    const perspScale = (0.88 + t * 0.14) * scaleMul;
    const baseNominal = 4.95;
    const rx = baseNominal * perspScale;
    const perspYFactor = 0.36 + t * 0.05;
    const stepY = 1.78 * perspScale;
    const deskSlopeTilt = (105 - x) * 0.0014;
    return { rx, perspYFactor, stepY, deskSlopeTilt };
  }

  function drawSilverCoinStack(ctx, sx, sy, count, prof, seedOff, scaleMul, depthShade) {
    if (count <= 0) return;
    const clamped = Math.min(45, count);
    const p = silverGetCoinPerspective(sx, sy, scaleMul);
    for (let c = 0; c < clamped; c++) {
      const tilt = p.deskSlopeTilt + (c % 2 === 0 ? 0.032 : -0.032);
      const inv = prof.dieSeq ? prof.dieSeq[(seedOff + c) % prof.dieSeq.length] : c % 3;
      drawSingleSilverCoin(
        ctx,
        sx,
        sy - c * p.stepY,
        p.rx,
        inv,
        tilt,
        depthShade,
        p.perspYFactor,
      );
    }
  }

  function silverDistributeCoinsInPlace(coinsCount, profile) {
    const n = profile.stackCount || 3;
    const clamped = Math.min(90, Math.max(0, coinsCount));
    const res = new Array(n).fill(0);
    for (let i = 0; i < clamped; i++) {
      res[profile.coinSequence[i]]++;
    }
    return res;
  }

  function drawSilverScatterPile(ctx, bx, by, invPile, prof, scaleMul = 1.0) {
    const p = silverGetCoinPerspective(bx, by, scaleMul);
    const rx = p.rx * 0.94;
    const ry = rx * p.perspYFactor;

    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath();
    ctx.ellipse(bx, by + ry * 0.4, rx * 1.45, ry * 1.3, 0, 0, Math.PI * 2);
    ctx.fill();

    let coins = [];
    switch (invPile) {
      case 0:
        coins = [
          { dx: -rx * 0.45, dy: 0, dt: 0.07, di: 0 },
          { dx: rx * 0.45, dy: ry * 0.3, dt: -0.05, di: 1 },
        ];
        break;
      case 1:
        coins = [
          { dx: -rx * 0.5, dy: ry * 0.25, dt: -0.08, di: 1 },
          { dx: rx * 0.5, dy: ry * 0.35, dt: 0.07, di: 2 },
          { dx: 0, dy: -ry * 0.25, dt: 0.03, di: 0 },
        ];
        break;
      case 2:
        coins = [
          { dx: -rx * 0.65, dy: 0, dt: 0.10, di: 2 },
          { dx: 0, dy: ry * 0.4, dt: -0.04, di: 0 },
          { dx: rx * 0.65, dy: ry * 0.1, dt: 0.08, di: 1 },
        ];
        break;
      case 3:
        coins = [
          { dx: -rx * 0.5, dy: ry * 0.3, dt: -0.07, di: 0 },
          { dx: rx * 0.5, dy: ry * 0.4, dt: 0.09, di: 2 },
          { dx: 0, dy: ry * 0.6, dt: -0.02, di: 1 },
          { dx: -rx * 0.1, dy: -ry * 0.2, dt: 0.05, di: 0 },
        ];
        break;
      case 4:
        coins = [
          { dx: -rx * 0.7, dy: ry * 0.2, dt: -0.10, di: 1 },
          { dx: rx * 0.65, dy: ry * 0.3, dt: 0.07, di: 0 },
          { dx: 0, dy: ry * 0.6, dt: -0.05, di: 2 },
          { dx: -rx * 0.35, dy: -ry * 0.15, dt: 0.05, di: 1 },
          { dx: rx * 0.35, dy: 0, dt: -0.07, di: 2 },
        ];
        break;
    }

    coins.forEach((c) => {
      const cyClamped = Math.max(73.0, Math.min(154.5, by + c.dy));
      const b = silverGetDeskBounds(cyClamped);
      const cxClamped = Math.max(
        b.left + rx + 1.5,
        Math.min(b.right - rx - 1.5, bx + c.dx),
      );
      drawSingleSilverCoin(
        ctx,
        cxClamped,
        cyClamped,
        rx,
        c.di,
        p.deskSlopeTilt + c.dt,
        0.96,
        p.perspYFactor,
      );
    });
  }

  function drawSilverPlaceCluster(
    ctx,
    cx,
    cy,
    coinsCount,
    profile,
    scaleMul = 1.0,
    scatterPileCount = 0,
  ) {
    const counts = silverDistributeCoinsInPlace(coinsCount, profile);
    const n = counts.length;
    if (coinsCount <= 0) return counts;

    const p = silverGetCoinPerspective(cx, cy, scaleMul);
    const rx = p.rx;
    const ry = rx * p.perspYFactor;
    const stepY = p.stepY;

    const layoutOffsets =
      profile.stacks && profile.stacks.length === n
        ? profile.stacks
        : SILVER_COIN_PLACE_INVARIANTS["3"].offsets;

    const relOffsets = layoutOffsets.map((o) => ({
      dx: o.dx * scaleMul,
      dy: o.dy * scaleMul,
    }));
    const minRelX = Math.min(...relOffsets.map((o) => o.dx));
    const maxRelX = Math.max(...relOffsets.map((o) => o.dx));
    const minRelY = Math.min(...relOffsets.map((o) => o.dy));
    const maxRelY = Math.max(...relOffsets.map((o) => o.dy));

    const heights = counts.map((c) => c * stepY);
    const maxH = Math.max(...heights);

    const py = Math.max(74.2, Math.min(151.0, cy + profile.jy));
    const bEdge = silverGetDeskBounds(py + maxRelY);
    const safeLeft = bEdge.left + Math.max(0, -minRelX) + rx + 1.2;
    const px = Math.max(safeLeft, cx + profile.jx);

    const stacks = relOffsets.map((o, idx) => ({
      x: px + o.dx,
      y: py + o.dy,
      cnt: counts[idx],
      h: heights[idx],
    }));

    const sceneDepthShade = Math.min(1.0, 0.88 + (py / SILVER_CH) * 0.12);

    if (maxH > 0) {
      ctx.save();
      const hRatio = maxH / (30 * stepY);
      const reachY = 2 + hRatio * 5;
      const sceneAlpha = 0.05 + hRatio * 0.15;
      const backGrad = ctx.createRadialGradient(px, py - 1, 2, px, py - reachY, 10 + reachY);
      backGrad.addColorStop(0, `rgba(0, 0, 0, ${sceneAlpha})`);
      backGrad.addColorStop(0.55, `rgba(0, 0, 0, ${sceneAlpha * 0.4})`);
      backGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = backGrad;
      ctx.beginPath();
      ctx.ellipse(px, py - reachY * 0.5, rx * 2.1, ry * 1.8 + reachY * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const midX = px + (minRelX + maxRelX) * 0.5;
    const midY = py + (minRelY + maxRelY) * 0.5 + 1.0;
    const shRadX = (maxRelX - minRelX) * 0.5 + rx * 1.15;
    const shRadY = (maxRelY - minRelY) * 0.5 + ry * 1.25;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.ellipse(midX, midY, shRadX, shRadY, 0, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < stacks.length; i++) {
      const cur = stacks[i];
      if (cur.cnt > 0) {
        for (let j = 0; j < i; j++) {
          const behind = stacks[j];
          if (behind.cnt <= 0) continue;
          const dx = cur.x - behind.x;
          const dy = cur.y - behind.y;
          if (dy > 0.35 * scaleMul && Math.abs(dx) < rx * 2.05) {
            ctx.save();
            const shH = Math.min(behind.h, cur.h);
            const alpha = 0.06 + (cur.cnt / 30) * 0.16;
            const gx0 = dx >= 0 ? behind.x + rx : behind.x - rx;
            const gx1 = dx >= 0 ? behind.x - rx * 0.6 : behind.x + rx * 0.6;
            const shGrad = ctx.createLinearGradient(gx0, 0, gx1, 0);
            shGrad.addColorStop(0, `rgba(0, 0, 0, ${alpha})`);
            shGrad.addColorStop(0.6, `rgba(0, 0, 0, ${alpha * 0.35})`);
            shGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
            ctx.fillStyle = shGrad;
            ctx.fillRect(behind.x - rx * 0.9, behind.y - shH - ry, rx * 1.8, shH + ry * 1.5);
            ctx.restore();
          }
        }
        const tFront = stacks.length > 1 ? i / (stacks.length - 1) : 1;
        const stackShade = sceneDepthShade * (0.91 + tFront * 0.09);
        drawSilverCoinStack(ctx, cur.x, cur.y, cur.cnt, profile, i * 19, scaleMul, stackShade);
      }
    }

    if (scatterPileCount > 0 && profile.piles) {
      for (let pIdx = 0; pIdx < scatterPileCount; pIdx++) {
        const pileDef = profile.piles[pIdx % profile.piles.length];
        drawSilverScatterPile(
          ctx,
          px + pileDef.dx,
          py + pileDef.dy,
          pileDef.inv,
          profile,
          scaleMul,
        );
      }
    }

    return counts;
  }

  function drawPerspectiveSilverIngot(
    ctx,
    baseX,
    baseY,
    zPx,
    slotIdxInLayer,
    layerYaw,
    scale,
    warmMix = 0,
    isBottomLayer = false,
  ) {
    const offsetLat = slotIdxInLayer === 0 ? -SILVER_INGOT_OFFSET : SILVER_INGOT_OFFSET;
    const ingotH = 5.6 * scale;

    const botY = baseY - zPx;
    const topY = botY - ingotH;

    const qB = silverProjectDeskQuad(
      baseX,
      botY,
      SILVER_INGOT_HALF_W,
      SILVER_INGOT_HALF_LEN,
      offsetLat,
      layerYaw,
      scale,
    );
    const qT = silverProjectDeskQuad(
      baseX,
      topY,
      SILVER_INGOT_HALF_W * 0.77,
      SILVER_INGOT_HALF_LEN * 0.87,
      offsetLat,
      layerYaw,
      scale,
    );

    ctx.save();

    if (isBottomLayer) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.48)";
      ctx.beginPath();
      ctx.moveTo(qB.tl.x - 0.6, qB.tl.y + 1.3);
      ctx.lineTo(qB.tr.x + 1.4, qB.tr.y + 1.3);
      ctx.lineTo(qB.br.x + 1.6, qB.br.y + 2.2);
      ctx.lineTo(qB.bl.x - 1.0, qB.bl.y + 2.2);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = "rgba(0, 0, 0, 0.36)";
      ctx.beginPath();
      ctx.moveTo(qB.tl.x, qB.tl.y + 0.9);
      ctx.lineTo(qB.tr.x, qB.tr.y + 0.9);
      ctx.lineTo(qB.br.x, qB.br.y + 1.3);
      ctx.lineTo(qB.bl.x, qB.bl.y + 1.3);
      ctx.closePath();
      ctx.fill();
    }

    const bPts = [qB.tl, qB.tr, qB.br, qB.bl];
    const tPts = [qT.tl, qT.tr, qT.br, qT.bl];
    const sideFaces = [0, 1, 2, 3]
      .map((i) => {
        const j = (i + 1) % 4;
        const a = bPts[i];
        const b = bPts[j];
        const c = tPts[j];
        const d = tPts[i];
        return { a, b, c, d, midX: (a.x + b.x) * 0.5, midY: (a.y + b.y) * 0.5 };
      })
      .sort((f1, f2) => f1.midY - f2.midY);

    const centerB = silverEvalQuadCenter(qB);
    sideFaces.forEach((f) => {
      const isFrontLeft = f.midX < centerB.x && f.midY >= centerB.y - 0.5;
      const isFrontRight = f.midX >= centerB.x && f.midY >= centerB.y - 0.5;
      const sg = ctx.createLinearGradient(f.d.x, f.d.y, f.a.x, f.a.y);
      if (isFrontLeft) {
        sg.addColorStop(0, warmMix > 0.2 ? "#e6decb" : "#cbd5e1");
        sg.addColorStop(0.55, "#64748b");
        sg.addColorStop(1, "#334155");
      } else if (isFrontRight) {
        sg.addColorStop(0, "#94a3b8");
        sg.addColorStop(0.6, "#475569");
        sg.addColorStop(1, "#1e293b");
      } else {
        sg.addColorStop(0, "#64748b");
        sg.addColorStop(1, "#1e293b");
      }
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.moveTo(f.a.x, f.a.y);
      ctx.lineTo(f.b.x, f.b.y);
      ctx.lineTo(f.c.x, f.c.y);
      ctx.lineTo(f.d.x, f.d.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(15, 23, 42, 0.78)";
      ctx.lineWidth = 0.55;
      ctx.stroke();
    });

    const tg = ctx.createLinearGradient(qT.tl.x, qT.tl.y, qT.br.x, qT.br.y);
    tg.addColorStop(0, "#ffffff");
    tg.addColorStop(0.40, "#e2e8f0");
    tg.addColorStop(0.78, warmMix > 0.25 ? "#cbd5e1" : "#94a3b8");
    tg.addColorStop(1, warmMix > 0.35 ? "#d8ceb9" : "#64748b");

    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(qT.tl.x, qT.tl.y);
    ctx.lineTo(qT.tr.x, qT.tr.y);
    ctx.lineTo(qT.br.x, qT.br.y);
    ctx.lineTo(qT.bl.x, qT.bl.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#f8fafc";
    ctx.lineWidth = 0.6;
    ctx.stroke();

    ctx.strokeStyle = "rgba(71, 85, 105, 0.45)";
    ctx.lineWidth = 0.55;
    const c1 = silverEvalQuadSurf(qT, -0.58, -0.58);
    const c2 = silverEvalQuadSurf(qT, 0.58, -0.58);
    const c3 = silverEvalQuadSurf(qT, 0.58, 0.58);
    const c4 = silverEvalQuadSurf(qT, -0.58, 0.58);
    ctx.beginPath();
    ctx.moveTo(c1.x, c1.y);
    ctx.lineTo(c2.x, c2.y);
    ctx.lineTo(c3.x, c3.y);
    ctx.lineTo(c4.x, c4.y);
    ctx.closePath();
    ctx.stroke();

    const tc = silverEvalQuadCenter(qT);
    ctx.fillStyle = "#475569";
    ctx.beginPath();
    ctx.moveTo(tc.x, tc.y - 1.3);
    ctx.lineTo(tc.x + 1.5, tc.y);
    ctx.lineTo(tc.x, tc.y + 1.3);
    ctx.lineTo(tc.x - 1.5, tc.y);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawSilverIngotPlaceStack(ctx, slot, count, warmMix = 0) {
    if (count <= 0) return;
    const clamped = Math.min(slot.maxIngots, count);
    const layerStepPx = 5.0 * slot.scale;
    const layersCount = Math.ceil(clamped / 2);

    for (let layer = 0; layer < layersCount; layer++) {
      const layerYaw = slot.yaw + (layer % 2 === 1 ? Math.PI * 0.5 : 0);
      const zPx = layer * layerStepPx;
      const barsInThisLayer = Math.min(2, clamped - layer * 2);

      if (barsInThisLayer === 1) {
        drawPerspectiveSilverIngot(
          ctx,
          slot.x,
          slot.y,
          zPx,
          0,
          layerYaw,
          slot.scale,
          warmMix,
          layer === 0,
        );
      } else {
        const q0 = silverProjectDeskQuad(
          slot.x,
          slot.y - zPx,
          SILVER_INGOT_HALF_W,
          SILVER_INGOT_HALF_LEN,
          -SILVER_INGOT_OFFSET,
          layerYaw,
          slot.scale,
        );
        const q1 = silverProjectDeskQuad(
          slot.x,
          slot.y - zPx,
          SILVER_INGOT_HALF_W,
          SILVER_INGOT_HALF_LEN,
          SILVER_INGOT_OFFSET,
          layerYaw,
          slot.scale,
        );
        const y0 = silverEvalQuadCenter(q0).y;
        const y1 = silverEvalQuadCenter(q1).y;
        const order = y0 <= y1 ? [0, 1] : [1, 0];
        order.forEach((sIdx) => {
          drawPerspectiveSilverIngot(
            ctx,
            slot.x,
            slot.y,
            zPx,
            sIdx,
            layerYaw,
            slot.scale,
            warmMix,
            layer === 0,
          );
        });
      }
    }
  }

  function drawAssayerScalesCenter(ctx, bx, by, scaleCoins, beamTilt) {
    ctx.save();
    ctx.translate(bx, by);

    ctx.fillStyle = "rgba(0, 0, 0, 0.56)";
    ctx.beginPath();
    ctx.ellipse(0, 2.5, 17, 5.2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#92400e";
    ctx.fillRect(-14.5, -0.8, 3.5, 2.5);
    ctx.fillRect(11.0, -0.8, 3.5, 2.5);
    ctx.fillStyle = "#fbbf24";
    ctx.fillRect(-13.8, -0.8, 1.5, 1.4);
    ctx.fillRect(11.7, -0.8, 1.5, 1.4);

    const woodGrad = ctx.createLinearGradient(-13, -5, 13, 2);
    woodGrad.addColorStop(0, "#361306");
    woodGrad.addColorStop(0.35, "#783014");
    woodGrad.addColorStop(0.65, "#4d1c0a");
    woodGrad.addColorStop(1, "#240b03");
    ctx.fillStyle = woodGrad;
    ctx.beginPath();
    ctx.moveTo(-13.5, 1.2);
    ctx.lineTo(-11.0, -4.5);
    ctx.lineTo(11.0, -4.5);
    ctx.lineTo(13.5, 1.2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#d97706";
    ctx.lineWidth = 0.7;
    ctx.stroke();

    const brassGrad = ctx.createLinearGradient(-8, -9, 8, -4);
    brassGrad.addColorStop(0, "#78350f");
    brassGrad.addColorStop(0.35, "#f59e0b");
    brassGrad.addColorStop(0.55, "#fde047");
    brassGrad.addColorStop(0.85, "#b45309");
    brassGrad.addColorStop(1, "#451a03");
    ctx.fillStyle = brassGrad;
    ctx.beginPath();
    ctx.moveTo(-8.5, -4.5);
    ctx.lineTo(-5.2, -9.5);
    ctx.lineTo(5.2, -9.5);
    ctx.lineTo(8.5, -4.5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#7f1d1d";
    ctx.fillRect(-4.5, -3.2, 9.0, 2.6);
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 0.45;
    ctx.strokeRect(-4.5, -3.2, 9.0, 2.6);

    const colG = ctx.createLinearGradient(-2.8, 0, 2.8, 0);
    colG.addColorStop(0, "#451a03");
    colG.addColorStop(0.30, "#d97706");
    colG.addColorStop(0.50, "#fef08a");
    colG.addColorStop(0.80, "#92400e");
    colG.addColorStop(1, "#290f02");
    ctx.fillStyle = colG;
    ctx.beginPath();
    ctx.moveTo(-3.2, -9.5);
    ctx.lineTo(-1.8, -48.5);
    ctx.lineTo(1.8, -48.5);
    ctx.lineTo(3.2, -9.5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#b45309";
    ctx.beginPath();
    ctx.ellipse(0, -24, 4.6, 2.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fde047";
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.ellipse(0, -34, 3.2, 1.4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#d97706";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-8.0, -5.5);
    ctx.quadraticCurveTo(-8.5, -13.5, -2.5, -15.5);
    ctx.moveTo(8.0, -5.5);
    ctx.quadraticCurveTo(8.5, -13.5, 2.5, -15.5);
    ctx.stroke();

    ctx.fillStyle = "#240f03";
    ctx.beginPath();
    ctx.moveTo(-6.2, -41.5);
    ctx.lineTo(6.2, -41.5);
    ctx.quadraticCurveTo(0, -36.5, -6.2, -41.5);
    ctx.fill();
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.arc(0, -48.0, 9.0, Math.PI * 0.25, Math.PI * 0.75);
    ctx.stroke();
    ctx.fillStyle = "#fef08a";
    ctx.fillRect(-0.4, -39.5, 0.8, 1.5);
    ctx.fillRect(-3.6, -40.2, 0.7, 1.2);
    ctx.fillRect(2.9, -40.2, 0.7, 1.2);

    const needleTipX = -Math.sin(beamTilt) * 14.0;
    const needleTipY = -47.5 + Math.cos(beamTilt) * 8.2;
    ctx.strokeStyle = "#fef08a";
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(0, -47.5);
    ctx.lineTo(needleTipX, needleTipY);
    ctx.stroke();
    ctx.fillStyle = "#dc2626";
    ctx.beginPath();
    ctx.arc(needleTipX, needleTipY, 1.0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.moveTo(-2.8, -48.5);
    ctx.lineTo(2.8, -48.5);
    ctx.lineTo(1.2, -53.5);
    ctx.lineTo(0, -56.8);
    ctx.lineTo(-1.2, -53.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#fef08a";
    ctx.lineWidth = 0.55;
    ctx.stroke();
    ctx.fillStyle = "#fef08a";
    ctx.beginPath();
    ctx.arc(0, -56.8, 1.2, 0, Math.PI * 2);
    ctx.fill();

    const armLen = 22.5;
    const cosT = Math.cos(beamTilt);
    const sinT = Math.sin(beamTilt);
    const lx = -armLen * cosT;
    const ly = -47.5 - armLen * sinT;
    const rxPan = armLen * cosT;
    const ryPan = -47.5 + armLen * sinT;

    ctx.strokeStyle = "#451a03";
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.quadraticCurveTo(0, -50.2, rxPan, ryPan);
    ctx.stroke();

    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.quadraticCurveTo(0, -50.2, rxPan, ryPan);
    ctx.stroke();

    ctx.strokeStyle = "#fef08a";
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(lx * 0.9, ly - 0.5);
    ctx.quadraticCurveTo(0, -50.8, rxPan * 0.9, ryPan - 0.5);
    ctx.stroke();

    ctx.fillStyle = "#d97706";
    ctx.beginPath();
    ctx.arc(0, -47.8, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#dc2626";
    ctx.beginPath();
    ctx.arc(0, -47.8, 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fca5a5";
    ctx.fillRect(-0.5, -48.5, 0.7, 0.7);

    [
      { x: lx, y: ly },
      { x: rxPan, y: ryPan },
    ].forEach((pt) => {
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#78350f";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    });

    const panRx = 8.4;
    const panRy = 2.9;
    [
      { px: lx, py: ly, isSilverPan: true },
      { px: rxPan, py: ryPan, isSilverPan: false },
    ].forEach(({ px, py, isSilverPan }) => {
      const dropY = py + 24.5;

      ctx.strokeStyle = "rgba(245, 158, 11, 0.85)";
      ctx.lineWidth = 0.65;
      ctx.beginPath();
      ctx.moveTo(px, py + 0.5);
      ctx.lineTo(px - panRx + 1.0, dropY);
      ctx.moveTo(px, py + 0.5);
      ctx.lineTo(px + panRx - 1.0, dropY);
      ctx.moveTo(px, py + 0.5);
      ctx.lineTo(px, dropY - 1.0);
      ctx.stroke();

      const dishG = ctx.createLinearGradient(px - panRx, dropY, px + panRx, dropY + 4);
      dishG.addColorStop(0, "#78350f");
      dishG.addColorStop(0.35, "#f59e0b");
      dishG.addColorStop(0.55, "#fde047");
      dishG.addColorStop(0.85, "#b45309");
      dishG.addColorStop(1, "#451a03");
      ctx.fillStyle = dishG;
      ctx.beginPath();
      ctx.ellipse(px, dropY + 0.9, panRx, panRy * 1.15, 0, 0, Math.PI);
      ctx.fill();

      ctx.fillStyle = "#0f3d2e";
      ctx.beginPath();
      ctx.ellipse(px, dropY, panRx - 0.6, panRy * 0.88, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 0.75;
      ctx.stroke();

      if (isSilverPan && scaleCoins > 0) {
        const count = Math.min(9, scaleCoins);
        for (let i = 0; i < count; i++) {
          const [dx, dy, t] = SILVER_SCALE_PAN_SLOTS_9[i];
          drawSingleSilverCoin(ctx, px + dx, dropY + dy, 2.75, i % 3, t, 1.0, 0.38);
        }
      } else if (!isSilverPan) {
        [
          { wx: -2.0, wy: 0.2, r: 2.3, h: 4.4 },
          { wx: 2.4, wy: 0.5, r: 1.6, h: 3.1 },
        ].forEach((wt) => {
          const wg = ctx.createLinearGradient(px + wt.wx - wt.r, 0, px + wt.wx + wt.r, 0);
          wg.addColorStop(0, "#451a03");
          wg.addColorStop(0.32, "#f59e0b");
          wg.addColorStop(0.55, "#fef08a");
          wg.addColorStop(1, "#78350f");
          ctx.fillStyle = wg;
          ctx.beginPath();
          ctx.ellipse(px + wt.wx, dropY + wt.wy, wt.r, wt.r * 0.42, 0, 0, Math.PI);
          ctx.lineTo(px + wt.wx - wt.r, dropY + wt.wy - wt.h);
          ctx.ellipse(
            px + wt.wx,
            dropY + wt.wy - wt.h,
            wt.r * 0.85,
            wt.r * 0.36,
            0,
            Math.PI,
            Math.PI * 2,
            true,
          );
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "#fde047";
          ctx.beginPath();
          ctx.ellipse(px + wt.wx, dropY + wt.wy - wt.h, wt.r * 0.85, wt.r * 0.36, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#fef08a";
          ctx.beginPath();
          ctx.ellipse(
            px + wt.wx,
            dropY + wt.wy - wt.h - 1.0,
            wt.r * 0.35,
            wt.r * 0.20,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        });
      }
    });

    ctx.restore();
  }

  function drawSilverForegroundCandle(ctx, x, y, warmMix, tSec) {
    ctx.save();
    ctx.translate(x, y);

    if (warmMix > 0.04) {
      drawBankStandardLightGlow(ctx, 0, -18, 14, -12, 62, tSec, warmMix, 0);
    }

    ctx.fillStyle = "rgba(0,0,0,0.48)";
    ctx.beginPath();
    ctx.ellipse(0, 2.0, 8.2, 3.0, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#b45309";
    ctx.lineWidth = 1.05;
    ctx.beginPath();
    ctx.arc(-5.8, -0.3, 1.7, 0, Math.PI * 2);
    ctx.stroke();

    const sg = ctx.createLinearGradient(-7, 0, 7, 0);
    sg.addColorStop(0, "#451a03");
    sg.addColorStop(0.35, "#f59e0b");
    sg.addColorStop(0.6, "#fde047");
    sg.addColorStop(1, "#451a03");
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(0, 0.4, 7.2, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#92400e";
    ctx.fillRect(-3.0, -2.2, 6.0, 2.5);
    ctx.fillStyle = "#fbbf24";
    ctx.fillRect(-2.6, -2.2, 2.2, 1.5);

    const waxG = ctx.createLinearGradient(-2.4, -17, 2.4, -2);
    waxG.addColorStop(0, "#fffbeb");
    waxG.addColorStop(0.55, "#e7dec3");
    waxG.addColorStop(1, "#9c8f70");
    ctx.fillStyle = waxG;
    ctx.fillRect(-2.3, -17, 4.6, 15);
    ctx.fillStyle = "#fef9c3";
    ctx.fillRect(-1.4, -17, 1.4, 4.5);
    ctx.fillRect(1.1, -16, 1.0, 3.0);

    ctx.fillStyle = "#1c1917";
    ctx.fillRect(-0.5, -19, 1, 2);

    if (warmMix > 0.02) {
      const fl = computeBankFlameFlicker(tSec, 0);
      const sway = fl.sway;
      const hF = 5.2 + fl.stretch;
      drawBankStandardFlameHalo(ctx, sway * 0.5, -21.5, 5.4, tSec, warmMix, 0);
      ctx.fillStyle = "#fb923c";
      ctx.beginPath();
      ctx.ellipse(sway * 0.6, -21.5, 1.9, hF * 0.54, sway * 0.14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fef08a";
      ctx.beginPath();
      ctx.ellipse(sway * 0.3, -20.8, 0.9, hF * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawSilverParchmentRows(ctx, q, lineCount, seedNum, inkAlpha = 0.88) {
    ctx.fillStyle = "#6e1d16";
    silverFillQuadSubRect(ctx, q, -0.78, -0.48, -0.82, -0.44);
    ctx.strokeStyle = "#d4a24c";
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.fillStyle = "#fef08a";
    silverFillQuadSubRect(ctx, q, -0.70, -0.56, -0.73, -0.53);

    ctx.fillStyle = `rgba(42, 24, 12, ${inkAlpha})`;
    silverFillQuadSubRect(ctx, q, -0.38, 0.16, -0.73, -0.54);
    silverFillQuadSubRect(ctx, q, 0.24, 0.76, -0.73, -0.54);

    const ruleL = silverEvalQuadSurf(q, -0.78, -0.36);
    const ruleR = silverEvalQuadSurf(q, 0.76, -0.36);
    ctx.strokeStyle = "rgba(110, 29, 22, 0.52)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(ruleL.x, ruleL.y);
    ctx.lineTo(ruleR.x, ruleR.y);
    ctx.stroke();

    const count = Math.min(SILVER_PARCHMENT_LINES_PER_SHEET, Math.max(0, lineCount));
    for (let r = 0; r < count; r++) {
      const vTop = -0.25 + r * 0.145;
      const vBot = vTop + 0.072;
      const maxU = r >= 5 ? 0.44 : 0.74;
      const w1 = 0.22 + ((seedNum + r * 7) % 3) * 0.05;
      const w2 = 0.26 + ((seedNum + r * 5) % 4) * 0.06;
      const w3 = 0.20 + ((seedNum + r * 11) % 3) * 0.05;
      const gap = 0.07;

      ctx.fillStyle = `rgba(48, 30, 14, ${inkAlpha * 0.90})`;
      let uCur = -0.76;
      silverFillQuadSubRect(ctx, q, uCur, Math.min(maxU, uCur + w1), vTop, vBot);
      uCur += w1 + gap;
      if (uCur + 0.08 < maxU) {
        silverFillQuadSubRect(ctx, q, uCur, Math.min(maxU, uCur + w2), vTop, vBot);
        uCur += w2 + gap;
        if (uCur + 0.08 < maxU) {
          silverFillQuadSubRect(ctx, q, uCur, Math.min(maxU, uCur + w3), vTop, vBot);
        }
      }
    }
  }

  function drawSilverSingleParchmentSheet(
    ctx,
    cx,
    cy,
    yaw,
    lineCount,
    seedNum,
    toneMix,
    showRibbonAndSeal,
    isActive,
  ) {
    const q = silverProjectDeskQuad(cx, cy, 17.5, 15.0, 0, yaw, 1.0);

    ctx.save();

    ctx.fillStyle = isActive ? "rgba(0, 0, 0, 0.42)" : "rgba(0, 0, 0, 0.30)";
    ctx.beginPath();
    ctx.moveTo(q.tl.x, q.tl.y + 0.9);
    ctx.lineTo(q.tr.x, q.tr.y + 0.9);
    ctx.lineTo(q.br.x + 0.6, q.br.y + 1.4);
    ctx.lineTo(q.bl.x - 0.6, q.bl.y + 1.4);
    ctx.closePath();
    ctx.fill();

    const pg = ctx.createLinearGradient(q.tl.x, q.tl.y, q.br.x, q.br.y);
    if (isActive) {
      pg.addColorStop(0, "#fcf3df");
      pg.addColorStop(0.55, "#ebd8b5");
      pg.addColorStop(1, "#c9ae80");
    } else {
      const warmShift = toneMix > 0.5 ? "#dec798" : "#e6d2a9";
      pg.addColorStop(0, "#ebdcb9");
      pg.addColorStop(0.6, warmShift);
      pg.addColorStop(1, "#b19668");
    }
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.moveTo(q.tl.x, q.tl.y);
    ctx.lineTo(q.tr.x, q.tr.y);
    ctx.lineTo(q.br.x, q.br.y);
    ctx.lineTo(q.bl.x, q.bl.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = isActive ? "#6e4e2a" : "#4a3319";
    ctx.lineWidth = isActive ? 0.55 : 0.45;
    ctx.stroke();

    ctx.fillStyle = "#9c8056";
    ctx.beginPath();
    ctx.moveTo(q.bl.x, q.bl.y);
    ctx.lineTo(q.br.x, q.br.y);
    ctx.lineTo(q.br.x, q.br.y + 0.85);
    ctx.lineTo(q.bl.x, q.bl.y + 0.85);
    ctx.closePath();
    ctx.fill();

    drawSilverParchmentRows(ctx, q, lineCount, seedNum, isActive ? 0.90 : 0.78);

    if (showRibbonAndSeal) {
      const rStart = silverEvalQuadSurf(q, 0.36, 1.0);
      const rEnd = silverEvalQuadSurf(q, 1.0, 0.28);
      const rSeal = silverEvalQuadSurf(q, 0.68, 0.66);
      const rTail1 = { x: rSeal.x + 2.4, y: rSeal.y + 5.8 };
      const rTail2 = { x: rSeal.x + 5.6, y: rSeal.y + 4.4 };

      ctx.strokeStyle = "rgba(0, 0, 0, 0.42)";
      ctx.lineWidth = 1.9;
      ctx.beginPath();
      ctx.moveTo(rSeal.x, rSeal.y + 0.8);
      ctx.lineTo(rTail1.x, rTail1.y + 0.8);
      ctx.moveTo(rSeal.x, rSeal.y + 0.8);
      ctx.lineTo(rTail2.x, rTail2.y + 0.8);
      ctx.stroke();

      ctx.strokeStyle = "#7f1d1d";
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(rStart.x, rStart.y);
      ctx.lineTo(rEnd.x, rEnd.y);
      ctx.moveTo(rSeal.x, rSeal.y);
      ctx.quadraticCurveTo(rSeal.x + 0.9, rSeal.y + 3.2, rTail1.x, rTail1.y);
      ctx.moveTo(rSeal.x, rSeal.y);
      ctx.quadraticCurveTo(rSeal.x + 2.9, rSeal.y + 2.1, rTail2.x, rTail2.y);
      ctx.stroke();

      ctx.strokeStyle = "#dc2626";
      ctx.lineWidth = 0.65;
      ctx.stroke();

      const sx = rSeal.x;
      const sy = rSeal.y;
      const srx = 3.25;
      const sry = 1.7;
      ctx.fillStyle = "rgba(0,0,0,0.40)";
      ctx.beginPath();
      ctx.ellipse(sx, sy + 0.7, srx * 1.05, sry * 1.05, yaw * 0.4, 0, Math.PI * 2);
      ctx.fill();

      const waxG = ctx.createRadialGradient(sx - 0.5, sy - 0.4, 0.4, sx, sy, srx);
      waxG.addColorStop(0, "#ef4444");
      waxG.addColorStop(0.55, "#991b1b");
      waxG.addColorStop(1, "#3b0707");
      ctx.fillStyle = waxG;
      ctx.beginPath();
      ctx.ellipse(sx, sy, srx, sry, yaw * 0.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.lineWidth = 0.45;
      ctx.beginPath();
      ctx.ellipse(sx, sy, srx * 0.72, sry * 0.72, yaw * 0.4, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#fde047";
      ctx.beginPath();
      ctx.ellipse(sx, sy, srx * 0.30, sry * 0.30, yaw * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawSilverParchmentLedgerStack(
    ctx,
    cx,
    cy,
    completedSheets,
    activeSheetLines,
    session,
  ) {
    const visibleUnder = Math.min(8, completedSheets);
    if (visibleUnder > 0) {
      for (let i = 0; i < visibleUnder; i++) {
        const cp = session.sheetCopies[i % session.sheetCopies.length];
        drawSilverSingleParchmentSheet(
          ctx,
          cx + cp.dx,
          cy + cp.dy,
          -0.04 + cp.dYaw,
          SILVER_PARCHMENT_LINES_PER_SHEET,
          cp.lineSeed,
          cp.tone,
          false,
          false,
        );
      }
    }

    const topLift = visibleUnder > 0 ? 2.0 : 0;
    drawSilverSingleParchmentSheet(
      ctx,
      cx,
      cy - topLift,
      -0.04,
      activeSheetLines,
      session.topSheetSeed,
      0,
      true,
      true,
    );
  }

  function drawSilverInkwellAndQuill(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = "rgba(0,0,0,0.48)";
    ctx.beginPath();
    ctx.ellipse(0, 1.8, 7.5, 3.0, 0, 0, Math.PI * 2);
    ctx.fill();

    const bGrad = ctx.createLinearGradient(-6, 0, 6, 0);
    bGrad.addColorStop(0, "#361a08");
    bGrad.addColorStop(0.35, "#9a6423");
    bGrad.addColorStop(0.6, "#d99e46");
    bGrad.addColorStop(1, "#261205");
    ctx.fillStyle = bGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0.8, 6.2, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-4.2, 0.5);
    ctx.quadraticCurveTo(-5.2, -3.5, -3.8, -7.2);
    ctx.lineTo(3.8, -7.2);
    ctx.quadraticCurveTo(5.2, -3.5, 4.2, 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#c28e3e";
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.fillStyle = "#5c3712";
    ctx.beginPath();
    ctx.ellipse(0, -7.2, 4.0, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#050608";
    ctx.beginPath();
    ctx.ellipse(0, -7.2, 2.8, 1.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillRect(0.8, -7.6, 0.8, 0.7);

    ctx.save();
    ctx.translate(0.4, -7.0);
    ctx.rotate(0.22);

    ctx.strokeStyle = "#18181b";
    ctx.lineWidth = 0.95;
    ctx.beginPath();
    ctx.moveTo(0, 2.5);
    ctx.lineTo(0, 0);
    ctx.stroke();

    ctx.strokeStyle = "#e7dec9";
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -23);
    ctx.stroke();

    const fG = ctx.createLinearGradient(-2.6, -15, 2.6, -15);
    fG.addColorStop(0, "#f8fafc");
    fG.addColorStop(0.5, "#ede7db");
    fG.addColorStop(1, "#94a3b8");
    ctx.fillStyle = fG;
    ctx.beginPath();
    ctx.moveTo(0, -6.5);
    ctx.quadraticCurveTo(-3.2, -16, -0.6, -24.5);
    ctx.lineTo(0, -23);
    ctx.quadraticCurveTo(3.2, -16, 0, -6.5);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(100,116,139,0.45)";
    ctx.lineWidth = 0.45;
    for (let fy = -9; fy >= -21; fy -= 2.4) {
      ctx.beginPath();
      ctx.moveTo(0, fy);
      ctx.lineTo(-2.2, fy + 1.1);
      ctx.moveTo(0, fy);
      ctx.lineTo(2.2, fy + 1.1);
      ctx.stroke();
    }
    ctx.restore();

    ctx.restore();
  }

  function drawSilverSparkle(ctx, cx, cy, size, alpha) {
    drawBankSparkle(ctx, cx, cy, size, alpha);
  }

  function renderSilverMarksScene(
    ctx,
    silverBalance,
    session = SILVER_FALLBACK_SESSION,
    animTimeMs = 0,
    beamTiltOverride,
    visualsOverride,
    goldPerMark = 5,
  ) {
    const prof = session || SILVER_FALLBACK_SESSION;
    const v =
      visualsOverride ||
      computeSilverSceneVisuals(silverBalance, prof, goldPerMark);
    const warmMix = SILVER_WARM_MIX;
    const tSec = (animTimeMs || 0) * 0.001;
    const beamTilt =
      typeof beamTiltOverride === "number" ? beamTiltOverride : v.targetTilt;

    if (typeof ctx.clearRect === "function") {
      ctx.clearRect(0, 0, SILVER_CW, SILVER_CH);
    }

    // 1. Stone Vaulted Wall (Y: 0..70)
    const wallGrad = ctx.createLinearGradient(0, 0, 0, 70);
    wallGrad.addColorStop(0, "#070a10");
    wallGrad.addColorStop(0.55, "#0d1420");
    wallGrad.addColorStop(1, "#141e2e");
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, 0, SILVER_CW, 70);

    ctx.strokeStyle = "#05070b";
    ctx.lineWidth = 0.85;
    for (let y = 0; y < 70; y += 11) {
      const shift = Math.floor(y / 11) % 2 === 1 ? 16 : 0;
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(SILVER_CW, y + 0.5);
      ctx.stroke();
      ctx.strokeStyle = "rgba(148, 163, 184, 0.05)";
      ctx.beginPath();
      ctx.moveTo(0, y + 1.4);
      ctx.lineTo(SILVER_CW, y + 1.4);
      ctx.stroke();
      ctx.strokeStyle = "#05070b";
      for (let x = shift; x < SILVER_CW; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, y);
        ctx.lineTo(x + 0.5, Math.min(70, y + 11));
        ctx.stroke();
      }
    }

    prof.stoneSpecks.forEach((sp) => {
      ctx.fillStyle = `rgba(186, 206, 232, ${sp.a})`;
      ctx.fillRect(sp.x, sp.y, sp.w, 1);
    });

    // Central Gothic Arch Frame behind the Bronze Scales
    const archGrad = ctx.createRadialGradient(105, 34, 4, 105, 40, 66);
    archGrad.addColorStop(0, "#101b2d");
    archGrad.addColorStop(0.7, "#09101c");
    archGrad.addColorStop(1, "#04060b");
    ctx.fillStyle = archGrad;
    ctx.beginPath();
    ctx.moveTo(56, 70);
    ctx.lineTo(56, 34);
    ctx.quadraticCurveTo(56, 6, 105, 6);
    ctx.quadraticCurveTo(154, 6, 154, 34);
    ctx.lineTo(154, 70);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#243248";
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Subtle cool moonlight over left silver coins & right bullion
    const coolGlow = ctx.createRadialGradient(60, 18, 4, 78, 48, 102);
    coolGlow.addColorStop(0, "rgba(147, 197, 253, 0.14)");
    coolGlow.addColorStop(0.6, "rgba(56, 189, 248, 0.04)");
    coolGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = coolGlow;
    ctx.fillRect(0, 0, SILVER_CW, 120);

    // 2. Perspective Smoked Oak Desk (Y: 70..158) & Apron (158..170)
    const topB = silverGetDeskBounds(70);
    const botB = silverGetDeskBounds(158);
    const deskGrad = ctx.createLinearGradient(0, 70, 0, 158);
    deskGrad.addColorStop(0, "#151210");
    deskGrad.addColorStop(0.35, "#221b17");
    deskGrad.addColorStop(0.82, "#181310");
    deskGrad.addColorStop(1, "#0f0c0a");
    ctx.fillStyle = deskGrad;
    ctx.beginPath();
    ctx.moveTo(topB.left, 70);
    ctx.lineTo(topB.right, 70);
    ctx.lineTo(botB.right, 158);
    ctx.lineTo(botB.left, 158);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
    ctx.lineWidth = 0.8;
    for (let i = 1; i <= 5; i++) {
      const frac = i / 6;
      const x1 = topB.left + (topB.right - topB.left) * frac;
      const x2 = botB.left + (botB.right - botB.left) * frac;
      ctx.beginPath();
      ctx.moveTo(x1, 70);
      ctx.lineTo(x2, 158);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(12, 18, 30, 0.36)";
    ctx.beginPath();
    ctx.moveTo(136, 80);
    ctx.lineTo(192, 80);
    ctx.lineTo(202, 146);
    ctx.lineTo(138, 146);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(148, 163, 184, 0.08)";
    ctx.lineWidth = 0.65;
    ctx.stroke();

    ctx.strokeStyle = "rgba(148, 163, 184, 0.24)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(topB.left, 70.5);
    ctx.lineTo(topB.right, 70.5);
    ctx.stroke();

    const apronGrad = ctx.createLinearGradient(0, 158, 0, 170);
    apronGrad.addColorStop(0, "#332921");
    apronGrad.addColorStop(0.24, "#201914");
    apronGrad.addColorStop(1, "#080605");
    ctx.fillStyle = apronGrad;
    ctx.fillRect(0, 158, SILVER_CW, 12);
    ctx.fillStyle = "#475569";
    ctx.fillRect(0, 158, SILVER_CW, 1.5);
    ctx.fillStyle = "rgba(226, 232, 240, 0.30)";
    ctx.fillRect(0, 158, SILVER_CW, 0.7);

    // 3. Layer Back-to-Mid: 31 Left Coin Places (7 rows) + Center Bronze Scales + 7 Right Ingots (3 rows)
    const coinEffY = (s) => {
      const slotProf = prof.slotProfiles[s.id];
      return Math.max(74.2, Math.min(151.0, s.y + (slotProf ? slotProf.jy : 0)));
    };
    const activeCoinSlots = prof.queue.filter((s) => (v.coinBudgets[s.id] || 0) > 0);
    const backCoins = activeCoinSlots
      .filter((s) => coinEffY(s) < SILVER_SCALES_POS.y)
      .sort((a, b) => coinEffY(a) - coinEffY(b));
    const frontCoins = activeCoinSlots
      .filter((s) => coinEffY(s) >= SILVER_SCALES_POS.y)
      .sort((a, b) => coinEffY(a) - coinEffY(b));

    const backIngots = SILVER_RIGHT_INGOT_SLOTS.filter((s) => s.y < SILVER_SCALES_POS.y).sort(
      (a, b) => a.y - b.y,
    );
    const frontIngots = SILVER_RIGHT_INGOT_SLOTS.filter((s) => s.y >= SILVER_SCALES_POS.y).sort(
      (a, b) => a.y - b.y,
    );

    backCoins.forEach((slot) => {
      const b = v.coinBudgets[slot.id] || 0;
      if (b > 0) {
        const slotProf = prof.slotProfiles[slot.id];
        const piles =
          slot.category === "far"
            ? v.farScatterPiles
            : Math.floor(v.nearScatterPiles * 0.6);
        drawSilverPlaceCluster(ctx, slot.x, slot.y, b, slotProf, slot.scaleMul, piles);
      }
    });
    backIngots.forEach((slot) => {
      const cnt = v.ingotBudgets[slot.id] || 0;
      if (cnt > 0) drawSilverIngotPlaceStack(ctx, slot, cnt, warmMix);
    });

    drawAssayerScalesCenter(ctx, SILVER_SCALES_POS.x, SILVER_SCALES_POS.y, v.scaleCoins, beamTilt);

    frontCoins.forEach((slot) => {
      const b = v.coinBudgets[slot.id] || 0;
      if (b > 0) {
        const slotProf = prof.slotProfiles[slot.id];
        drawSilverPlaceCluster(ctx, slot.x, slot.y, b, slotProf, slot.scaleMul, v.nearScatterPiles);
      }
    });
    frontIngots.forEach((slot) => {
      const cnt = v.ingotBudgets[slot.id] || 0;
      if (cnt > 0) drawSilverIngotPlaceStack(ctx, slot, cnt, warmMix);
    });

    // 4. Center Foreground Trio (Candle + Parchment Stack + Inkwell & Quill)
    drawSilverForegroundCandle(ctx, SILVER_CANDLE_POS.x, SILVER_CANDLE_POS.y, warmMix, tSec);
    drawSilverParchmentLedgerStack(
      ctx,
      SILVER_PAPER_POS.x,
      SILVER_PAPER_POS.y,
      v.completedSheets,
      v.activeSheetLines,
      prof,
    );
    drawSilverInkwellAndQuill(ctx, SILVER_INKWELL_POS.x, SILVER_INKWELL_POS.y);

    // Subtle animated sparkles on metallic facets
    if (v.leftPlacesCoins > 0 || v.rightIngotsTotal > 0) {
      const { p1, p2 } = computeBankSparklePulses(tSec);
      if (v.rightIngotsTotal > 0) {
        const fSlot =
          SILVER_RIGHT_INGOT_SLOTS.find((s) => (v.ingotBudgets[s.id] || 0) > 0) ||
          SILVER_RIGHT_INGOT_SLOTS[0];
        const ingCnt = v.ingotBudgets[fSlot.id] || 1;
        const peakZ = Math.max(0, Math.ceil(ingCnt / 2) - 1) * 5.0 * fSlot.scale;
        drawSilverSparkle(ctx, fSlot.x, fSlot.y - peakZ - 4, 2, p1 * 0.85);
      }
      if (v.leftPlacesCoins > 0 && activeCoinSlots.length > 0) {
        const s0 = activeCoinSlots[0];
        const cnt0 = v.coinBudgets[s0.id] || 0;
        if (cnt0 > 0) {
          const slotProf = prof.slotProfiles[s0.id];
          const dist = silverDistributeCoinsInPlace(cnt0, slotProf);
          const y0 = coinEffY(s0);
          const ps = silverGetCoinPerspective(s0.x, y0, s0.scaleMul);
          drawSilverSparkle(ctx, s0.x, y0 - Math.max(...dist) * ps.stepY - 2, 2, p2 * 0.82);
        }
      }
    }
  }

  function startSilverCanvasLoop(cv) {
    if (typeof root.requestAnimationFrame !== "function") return;
    const state = silverAnimStates.get(cv);
    if (!state || state.rafId) return;

    const loopToken = state.token;
    let lastPaintMs = typeof Date === "function" ? Date.now() : 0;
    const tick = () => {
      const cur = silverAnimStates.get(cv);
      if (!cur || cur !== state || cur.token !== loopToken) return;
      if (cv.isConnected) {
        cur.hasBeenConnected = true;
      } else if (cur.hasBeenConnected || cur.mountGrace <= 0) {
        cur.rafId = 0;
        silverAnimStates.delete(cv);
        return;
      } else {
        cur.mountGrace -= 1;
      }

      const now = typeof Date === "function" ? Date.now() : 0;
      const targetTilt = cur.visuals?.targetTilt || 0;
      cur.beamTilt += (targetTilt - cur.beamTilt) * 0.22;
      if (Math.abs(targetTilt - cur.beamTilt) < 0.002) {
        cur.beamTilt = targetTilt;
      }

      if (now - lastPaintMs >= 30 && cv.width > 0 && cv.height > 0) {
        lastPaintMs = now;
        const ctx = typeof cv.getContext === "function" ? cv.getContext("2d") : null;
        if (ctx) {
          const dpr = root.devicePixelRatio || 1;
          if (typeof ctx.setTransform === "function") {
            ctx.setTransform(
              (dpr * BANK_SCENE_W) / SILVER_CW,
              0,
              0,
              (dpr * BANK_SCENE_H) / SILVER_CH,
              0,
              0,
            );
          }
          const animTimeMs = Math.max(0, now - cur.session.animStartTime);
          renderSilverMarksScene(
            ctx,
            cur.silverBalance,
            cur.session,
            animTimeMs,
            cur.beamTilt,
            cur.visuals,
            cur.goldPerMark,
          );
        }
      }
      cur.rafId = root.requestAnimationFrame(tick);
    };
    state.rafId = root.requestAnimationFrame(tick);
  }

  function drawSilverCoinsScene(cv, data, visuals, w) {
    const silverBalance = Math.max(0, Math.round(Number(data?.silverBalance) || 0));
    const goldPerMark = Math.max(1, Number(data?.goldPerMark) || 5);
    const session = getSilverWindowSession(w);
    const silverVisuals =
      visuals && visuals.silverScene
        ? visuals.silverScene
        : computeSilverSceneVisuals(silverBalance, session, goldPerMark);

    const prev = silverAnimStates.get(cv);
    const state = prev || {
      token: 1,
      rafId: 0,
      hasBeenConnected: Boolean(cv.isConnected),
      mountGrace: 12,
      beamTilt: silverVisuals.targetTilt,
      beamTiltInitialized: true,
    };
    state.silverBalance = silverBalance;
    state.goldPerMark = goldPerMark;
    state.session = session;
    state.visuals = silverVisuals;
    if (!prev || !state.beamTiltInitialized) {
      state.beamTilt = silverVisuals.targetTilt;
      state.beamTiltInitialized = true;
    }
    if (cv.isConnected) state.hasBeenConnected = true;
    silverAnimStates.set(cv, state);

    if (
      cv.dataset?.paintedSig === visuals.sig &&
      cv.dataset?.paintedW === String(BANK_SCENE_W) &&
      cv.dataset?.paintedH === String(BANK_SCENE_H)
    ) {
      decorateBankWindow(cv);
      startSilverCanvasLoop(cv);
      return;
    }

    const ctx = setupCanvas(cv, BANK_SCENE_W, BANK_SCENE_H, SILVER_CW, SILVER_CH);
    const now = typeof Date === "function" ? Date.now() : 0;
    const animTimeMs = Math.max(0, now - session.animStartTime);
    renderSilverMarksScene(
      ctx,
      silverBalance,
      session,
      animTimeMs,
      state.beamTilt,
      silverVisuals,
      goldPerMark,
    );

    if (cv.dataset) {
      cv.dataset.paintedSig = visuals.sig;
      cv.dataset.paintedW = String(BANK_SCENE_W);
      cv.dataset.paintedH = String(BANK_SCENE_H);
    }
    decorateBankWindow(cv);
    startSilverCanvasLoop(cv);
  }

  function showBankAmountModal({
    title,
    subtitle,
    maxAmount,
    showAllButton,
    allLabel,
    confirmLabel,
    onConfirm,
  }) {
    const shellEl =
      doc.querySelector(".port-bank .port-shell") ||
      doc.querySelector(".port-bank") ||
      doc.body;

    shellEl
      .querySelectorAll(".dfo-bank-modal-backdrop")
      .forEach((el) => el.remove());

    const backdrop = doc.createElement("div");
    backdrop.className = "dfo-bank-modal-backdrop";

    const box = doc.createElement("div");
    box.className = "dfo-bank-modal-box";

    const head = doc.createElement("div");
    head.className = "dfo-bank-modal-head";
    const h3 = doc.createElement("h3");
    h3.textContent = title;
    head.append(h3);
    if (subtitle) {
      const sub = doc.createElement("p");
      sub.className = "dfo-bank-modal-sub";
      sub.textContent = subtitle;
      head.append(sub);
    }

    const body = doc.createElement("div");
    body.className = "dfo-bank-modal-body";

    const inputRow = doc.createElement("div");
    inputRow.className = "dfo-bank-modal-inputrow";

    const input = doc.createElement("input");
    input.type = "text";
    input.className = "dfo-bank-modal-input";
    input.inputMode = "numeric";
    input.placeholder = T("svc.bank.modal.placeholder");
    input.autocomplete = "off";
    input.spellcheck = false;

    input.addEventListener("input", (e) => {
      e.stopPropagation();
      const clean = input.value.replace(/\D/g, "");
      if (clean !== input.value) input.value = clean;
    });
    input.addEventListener("paste", (e) => {
      e.stopPropagation();
      const text = e.clipboardData?.getData("text") || "";
      const clean = text.replace(/\D/g, "");
      if (clean) {
        e.preventDefault();
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        input.value =
          input.value.slice(0, start) + clean + input.value.slice(end);
        input.selectionStart = input.selectionEnd = start + clean.length;
      }
    });
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        confirm();
      } else if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    });
    input.addEventListener("keyup", (e) => e.stopPropagation());
    input.addEventListener("keypress", (e) => e.stopPropagation());

    inputRow.append(input);

    if (showAllButton && maxAmount > 0) {
      const btnAll = doc.createElement("button");
      btnAll.type = "button";
      btnAll.className = "dfo-bank-btn-all";
      btnAll.textContent = allLabel || T("svc.bank.modal.all");
      btnAll.addEventListener("click", (e) => {
        e.stopPropagation();
        input.value = String(maxAmount);
        confirm();
      });
      inputRow.append(btnAll);
    }

    body.append(inputRow);

    const foot = doc.createElement("div");
    foot.className = "dfo-bank-modal-foot";

    const btnConfirm = doc.createElement("button");
    btnConfirm.type = "button";
    btnConfirm.className = "dfo-bank-btn dfo-bank-btn-primary";
    btnConfirm.textContent = confirmLabel || T("svc.bank.modal.confirm");
    btnConfirm.addEventListener("click", (e) => {
      e.stopPropagation();
      confirm();
    });

    const btnCancel = doc.createElement("button");
    btnCancel.type = "button";
    btnCancel.className = "dfo-bank-btn dfo-bank-btn-cancel";
    btnCancel.textContent = T("svc.bank.modal.cancel");
    btnCancel.addEventListener("click", (e) => {
      e.stopPropagation();
      close();
    });

    foot.append(btnConfirm, btnCancel);
    box.append(head, body, foot);
    backdrop.append(box);

    function close() {
      backdrop.remove();
    }

    function confirm() {
      const val = parseInt(input.value.replace(/\D/g, ""), 10);
      if (!Number.isFinite(val) || val <= 0) {
        input.focus();
        return;
      }
      close();
      onConfirm(val);
    }

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
    });

    shellEl.append(backdrop);
    setTimeout(() => {
      try {
        input.focus();
      } catch { }
    }, 25);
  }

  function cashInLetters(w) {
    w.box = null;
    try {
      const rawItems =
        typeof w.hooks?.player?.items === "function"
          ? w.hooks.player.items()
          : Array.isArray(w.hooks?.player?.items)
            ? w.hooks.player.items
            : Array.isArray(w.hooks?.player?.raw?.()?.items)
              ? w.hooks.player.raw().items
              : [];
      if (Array.isArray(rawItems)) {
        for (const it of rawItems) {
          if (isLetterOfCreditItem(it) && (Number(it.stackCount) || 1) > 1) {
            it.value =
              (Number(it.value) || 0) * (Number(it.stackCount) || 1);
            it.stackCount = 1;
          }
        }
      }
    } catch { }
    w._button?.("depositLetters");
    if (w.box?.onYes) {
      const act = w.box.onYes;
      w.box = null;
      act();
    }
  }

  function withdrawLoc(w, amt) {
    if (w.box && !w.box.waiting) w.box = null;
    w.transactionType = "Withdrawing_Letter";
    w.value = String(amt);
    w._commit?.();
  }

  function withdrawGold(w, amt) {
    if (w.box && !w.box.waiting) w.box = null;
    w.transactionType = "Withdrawing_gold";
    w.value = String(amt);
    w._commit?.();
  }

  function openDepositGoldModal(w, data) {
    if (w.box && !w.box.waiting) w.box = null;
    const carried = T("svc.bank.deposit.carried", {
      amount: formatBankNum(data.totalCarriedGold),
    });
    showBankAmountModal({
      title: T("svc.bank.deposit.title"),
      subtitle:
        data.wagonGold > 0
          ? T("svc.bank.deposit.carriedSplit", {
            carried,
            purse: formatBankNum(data.purseGold),
            wagon: formatBankNum(data.wagonGold),
          })
          : carried,
      maxAmount: data.totalCarriedGold,
      showAllButton: true,
      allLabel: T("svc.bank.modal.depositAll"),
      confirmLabel: T("svc.bank.deposit.confirm"),
      onConfirm: (amt) => {
        w.transactionType = "Depositing_gold";
        w.value = String(amt);
        w._commit?.();
      },
    });
  }

  function openWithdrawLocModal(w, data) {
    if (w.box && !w.box.waiting) w.box = null;
    showBankAmountModal({
      title: T("svc.bank.withdrawLoc.title"),
      subtitle: T("svc.bank.withdrawLoc.sub", {
        amount: formatBankNum(data.accountGold),
      }),
      maxAmount: data.accountGold,
      showAllButton: false,
      confirmLabel: T("svc.bank.withdrawLoc.confirm"),
      onConfirm: (amt) => withdrawLoc(w, amt),
    });
  }

  function openWithdrawGoldModal(w, data) {
    if (w.box && !w.box.waiting) w.box = null;
    showBankAmountModal({
      title: T("svc.bank.withdrawGold.title"),
      subtitle: T("svc.bank.withdrawGold.sub", {
        amount: formatBankNum(data.accountGold),
      }),
      maxAmount: data.accountGold,
      showAllButton: false,
      confirmLabel: T("svc.bank.withdrawGold.confirm"),
      onConfirm: (amt) => withdrawGold(w, amt),
    });
  }

  function openSellSilverModal(w, data) {
    if (w.box && !w.box.waiting) w.box = null;
    showBankAmountModal({
      title: T("svc.bank.sellSilver.title"),
      subtitle: T("svc.bank.sellSilver.sub", {
        amount: formatBankNum(data.silverBalance),
        rate: data.goldPerMark,
      }),
      maxAmount: data.silverBalance,
      showAllButton: true,
      allLabel: T("svc.bank.modal.sellAll"),
      confirmLabel: T("svc.bank.sellSilver.confirm"),
      onConfirm: (amt) => {
        w.transactionType = "marks";
        w.value = String(amt);
        w._commit?.();
      },
    });
  }

  let activeBankNoticeFallback = null;
  let activeBankYesNoModal = null;
  const wrappedBankCloseTargets = new WeakSet();

  function getEnhancedNoticeStack(createIfMissing) {
    let stack = doc.getElementById?.("enhanced-notice") || null;
    if (!stack && doc.body?.children) {
      stack =
        [...doc.body.children].find(
          (c) =>
            c &&
            (c.id === "enhanced-notice" ||
              c.attrs?.id === "enhanced-notice" ||
              c.attributes?.get?.("id") === "enhanced-notice"),
        ) || null;
    }
    if (!stack && createIfMissing && doc.body) {
      stack = doc.createElement("div");
      stack.id = "enhanced-notice";
      stack.className = "notice-stack";
      stack.setAttribute?.("id", "enhanced-notice");
      stack.setAttribute?.("aria-live", "polite");
      doc.body.append?.(stack);
    }
    return stack;
  }

  function removeBankNoticeFallback() {
    if (!activeBankNoticeFallback) return;
    const { notice, stack, onKeyDown, onClick } = activeBankNoticeFallback;
    activeBankNoticeFallback = null;
    if (onKeyDown) doc.removeEventListener?.("keydown", onKeyDown, true);
    if (onClick) doc.removeEventListener?.("click", onClick, true);
    try {
      notice?.remove?.();
    } catch { }
    if (stack && (!stack.children || stack.children.length === 0)) {
      try {
        stack.remove?.();
      } catch { }
    }
  }

  function dismissBankNoticeFallback(w) {
    if (w?.box?.waiting) return;
    if (w) {
      if (typeof w._dismissBox === "function") w._dismissBox();
      else w.box = null;
    }
    removeBankNoticeFallback();
  }

  function removeBankYesNoModal() {
    if (!activeBankYesNoModal) return;
    const { backdrop, onKeyDown } = activeBankYesNoModal;
    activeBankYesNoModal = null;
    if (onKeyDown) doc.removeEventListener?.("keydown", onKeyDown, true);
    try {
      backdrop?.remove?.();
    } catch { }
  }

  function teardownBankOverlays(w) {
    removeBankNoticeFallback();
    removeBankYesNoModal();
    const stack = getEnhancedNoticeStack(false);
    if (stack?.children?.length) {
      for (const child of [...stack.children]) {
        if (child?.classList?.contains?.("dfo-bank-right-notice")) {
          try {
            child.remove?.();
          } catch { }
        }
      }
      if (!stack.children.length) {
        try {
          stack.remove?.();
        } catch { }
      }
    }
    if (w?.box && w.box.buttons !== "YesNo" && !w.box.waiting) {
      w.box = null;
    }
  }

  function wrapBankClose(w) {
    if (!w || typeof w !== "object" || wrappedBankCloseTargets.has(w)) return;
    wrappedBankCloseTargets.add(w);
    if (typeof w._close === "function") {
      const nativeClose = w._close;
      w._close = function (...args) {
        teardownBankOverlays(this);
        return nativeClose.apply(this, args);
      };
    }
  }

  function syncBankRightNotice(w) {
    const boxRows = w?.box?.rows?.length ? w.box.rows : null;
    const isYesNo = w?.box?.buttons === "YesNo";
    if (!boxRows || isYesNo || w?.done) {
      removeBankNoticeFallback();
      return;
    }

    const waiting = Boolean(w.box?.waiting);
    const hintText = waiting
      ? ""
      : root.__dfoUi
        ? T("svc.bank.noticeHint")
        : "Click or press a key";

    const existingStack = getEnhancedNoticeStack(false);
    const nativeNotice = existingStack?.children
      ? [...existingStack.children].find(
        (el) =>
          el?.classList?.contains?.("notice") &&
          !el.classList.contains("dfo-bank-right-notice") &&
          el.style?.display !== "none",
      )
      : null;

    if (nativeNotice) {
      removeBankNoticeFallback();
      if (ru()) {
        const bodyEl =
          nativeNotice.querySelector?.(".notice-body") ||
          [...(nativeNotice.children || [])].find((c) =>
            c.classList?.contains?.("notice-body"),
          );
        if (bodyEl?.children) {
          for (const rowEl of [...bodyEl.children]) {
            if (!rowEl) continue;
            if (rowEl.children?.length) {
              for (const cell of [...rowEl.children]) {
                if (typeof cell.textContent === "string") {
                  const tr = local(cell.textContent);
                  if (cell.textContent !== tr) cell.textContent = tr;
                }
              }
            } else if (typeof rowEl.textContent === "string") {
              const tr = local(rowEl.textContent);
              if (rowEl.textContent !== tr) rowEl.textContent = tr;
            }
          }
        }
      }
      const hintEl =
        nativeNotice.querySelector?.(".notice-hint") ||
        [...(nativeNotice.children || [])].find((c) =>
          c.classList?.contains?.("notice-hint"),
        );
      if (hintEl) {
        if (waiting) {
          hintEl.style.display = "none";
        } else {
          if (hintEl.style?.display === "none") hintEl.style.display = "";
          if (ru() && hintEl.textContent !== hintText) {
            hintEl.textContent = hintText;
          }
        }
      }
      return;
    }

    const formattedRows = boxRows.map((r) => {
      const raw = typeof r === "string" ? r : r?.text ?? "";
      const text = ru() ? local(raw) : raw;
      const center = typeof r === "object" && r ? Boolean(r.center) : true;
      return { text, center };
    });

    const stack = getEnhancedNoticeStack(true);
    if (!stack) return;

    const reusing =
      activeBankNoticeFallback &&
      activeBankNoticeFallback.w === w &&
      activeBankNoticeFallback.stack === stack &&
      activeBankNoticeFallback.notice &&
      [...(stack.children || [])].includes(activeBankNoticeFallback.notice);

    let notice;
    let bodyEl;
    let hintEl;

    if (reusing) {
      notice = activeBankNoticeFallback.notice;
      bodyEl = activeBankNoticeFallback.bodyEl;
      hintEl = activeBankNoticeFallback.hintEl;
      while (bodyEl?.children?.length) {
        const prevLen = bodyEl.children.length;
        bodyEl.children[0].remove?.();
        if (bodyEl.children.length >= prevLen) break;
      }
    } else {
      removeBankNoticeFallback();
      notice = doc.createElement("div");
      notice.className = "notice notice-in dfo-bank-right-notice";
      bodyEl = doc.createElement("div");
      bodyEl.className = "notice-body";
      notice.append(bodyEl);
      hintEl = doc.createElement("div");
      hintEl.className = "notice-hint";
      notice.append(hintEl);
      stack.append(notice);

      let skipInitialClick = true;
      const disarmClick = () => {
        skipInitialClick = false;
      };
      if (typeof Promise === "function") Promise.resolve().then(disarmClick);
      else skipInitialClick = false;

      const onKeyDown = (e) => {
        if (w.done || !w.box || w.box.buttons === "YesNo" || w.box.waiting) {
          if (!w.box || w.box.buttons === "YesNo" || w.done) {
            removeBankNoticeFallback();
          }
          return;
        }
        const key = e?.key || e?.code || "";
        if (
          key === "Shift" ||
          key === "Control" ||
          key === "Alt" ||
          key === "Meta"
        ) {
          return;
        }
        if (doc.querySelector?.(".dfo-bank-modal-backdrop")) return;
        e?.preventDefault?.();
        e?.stopPropagation?.();
        dismissBankNoticeFallback(w);
      };

      const onClick = (e) => {
        if (skipInitialClick) return;
        if (w.done || !w.box || w.box.buttons === "YesNo" || w.box.waiting) {
          if (!w.box || w.box.buttons === "YesNo" || w.done) {
            removeBankNoticeFallback();
          }
          return;
        }
        if (doc.querySelector?.(".dfo-bank-modal-backdrop")) return;
        e?.stopPropagation?.();
        dismissBankNoticeFallback(w);
      };

      notice.onclick = () => {
        if (!w.box?.waiting) dismissBankNoticeFallback(w);
      };
      doc.addEventListener?.("keydown", onKeyDown, true);
      doc.addEventListener?.("click", onClick, true);

      activeBankNoticeFallback = {
        w,
        stack,
        notice,
        bodyEl,
        hintEl,
        onKeyDown,
        onClick,
      };
    }

    for (const r of formattedRows) {
      const rowEl = doc.createElement("div");
      rowEl.className = r.center ? "notice-row center" : "notice-row";
      rowEl.textContent = r.text;
      bodyEl.append(rowEl);
    }

    if (hintEl) {
      if (waiting) {
        hintEl.style.display = "none";
      } else {
        hintEl.style.display = "";
        hintEl.textContent = hintText;
      }
    }
  }

  function syncBankYesNoModal(w) {
    const isYesNo = Boolean(
      !w?.done && w?.box?.rows?.length && w?.box?.buttons === "YesNo",
    );
    if (!isYesNo) {
      removeBankYesNoModal();
      return;
    }

    if (activeBankYesNoModal && activeBankYesNoModal.boxRef === w.box) {
      return;
    }
    removeBankYesNoModal();

    const shellEl =
      doc.querySelector?.(".port-bank .port-shell") ||
      doc.querySelector?.(".port-bank") ||
      doc.body;
    if (!shellEl) return;

    const backdrop = doc.createElement("div");
    backdrop.className = "dfo-bank-modal-backdrop dfo-bank-yesno-backdrop";

    const modalBox = doc.createElement("div");
    modalBox.className = "dfo-bank-modal-box";

    const head = doc.createElement("div");
    head.className = "dfo-bank-modal-head";
    const h3 = doc.createElement("h3");
    h3.textContent = root.__dfoUi ? T("svc.bank.confirmTitle") : "Confirmation";
    head.append(h3);

    const body = doc.createElement("div");
    body.className = "dfo-bank-modal-body dfo-bank-yesno-rows";
    for (const r of w.box.rows) {
      const raw = typeof r === "string" ? r : r?.text ?? "";
      const p = doc.createElement("p");
      p.textContent = ru() ? local(raw) : raw;
      body.append(p);
    }

    const foot = doc.createElement("div");
    foot.className = "dfo-bank-modal-foot";

    const choose = (yes) => {
      const box = w.box;
      const fn = yes ? box?.onYes : box?.onNo;
      if (w.box === box) w.box = null;
      removeBankYesNoModal();
      fn?.();
      syncBankRightNotice(w);
      syncBankYesNoModal(w);
    };

    const btnYes = doc.createElement("button");
    btnYes.type = "button";
    btnYes.className = "dfo-bank-btn dfo-bank-btn-primary";
    btnYes.textContent = root.__dfoUi ? T("svc.bank.yes") : "Yes";
    btnYes.addEventListener?.("click", (e) => {
      e?.stopPropagation?.();
      choose(true);
    });

    const btnNo = doc.createElement("button");
    btnNo.type = "button";
    btnNo.className = "dfo-bank-btn dfo-bank-btn-cancel";
    btnNo.textContent = root.__dfoUi ? T("svc.bank.no") : "No";
    btnNo.addEventListener?.("click", (e) => {
      e?.stopPropagation?.();
      choose(false);
    });

    const onKeyDown = (e) => {
      if (!activeBankYesNoModal || w.done) {
        removeBankYesNoModal();
        return;
      }
      const code = e?.code || "";
      const key = e?.key || "";
      if (code === "KeyY" || key === "y" || key === "Y" || key === "Enter") {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        choose(true);
      } else if (
        code === "KeyN" ||
        key === "n" ||
        key === "N" ||
        key === "Escape"
      ) {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        choose(false);
      }
    };

    foot.append(btnYes, btnNo);
    modalBox.append(head, body, foot);
    backdrop.append(modalBox);
    backdrop.addEventListener?.("click", (e) => {
      if (e?.target === backdrop) {
        e?.stopPropagation?.();
        choose(false);
      }
    });
    doc.addEventListener?.("keydown", onKeyDown, true);
    shellEl.append(backdrop);

    activeBankYesNoModal = {
      boxRef: w.box,
      backdrop,
      onKeyDown,
    };
  }

  function renderEnhancedBankView(w, nativeView) {
    wrapBankClose(w);
    syncBankRightNotice(w);
    syncBankYesNoModal(w);

    const data = getBankData(w);
    const visuals = getCachedBankVisuals(w, data);

    const blocks = [];

    blocks.push({
      type: "group",
      cls: "dfo-bank-assets",
      blocks: [
        {
          type: "stats",
          items: [
            [
              T("svc.bank.inBank"),
              `${formatBankNum(data.totalBankGold > 0 ? data.totalBankGold : data.accountGold)} gp`,
            ],
            [
              T("svc.bank.inLoc"),
              T("svc.bank.locSummary", {
                gold: formatBankNum(data.locGold),
                n: data.locCount,
              }),
            ],
            [
              T("svc.bank.property"),
              T("svc.bank.propertyCount", { n: data.housesCount }),
            ],
            [
              T("svc.bank.fleet"),
              T("svc.bank.fleetCount", { n: data.shipsCount }),
            ],
            ...(data.loanDue > 0
              ? [[T("svc.bank.loanDue"), `${formatBankNum(data.loanDue)} gp`, "warn"]]
              : []),
          ],
        },
        {
          type: "cols",
          cls: "dfo-bank-scene-split",
          template: "1fr 1fr",
          cols: [
            [
              {
                type: "group",
                title: T("svc.bank.locSceneTitle"),
                cls: "dfo-bank-scene-half",
                blocks: [
                  {
                    type: "canvas",
                    paint: (cv) => drawNotesScene(cv, data, visuals, w),
                  },
                  {
                    type: "stats",
                    items: [
                      [T("svc.bank.inNotes"), `${formatBankNum(data.locGold)} gp`],
                      [T("svc.bank.noteQty"), T("svc.bank.noteCount", { n: data.locCount })],
                    ],
                  },
                  {
                    type: "actions",
                    layout: "column",
                    items: [
                      {
                        label: T("svc.bank.cashInLetters"),
                        primary: data.locGold > 0,
                        disabled: data.locGold <= 0,
                        act: () => cashInLetters(w),
                      },
                    ],
                  },
                ],
              },
            ],
            [
              {
                type: "group",
                title: T("svc.bank.safeSceneTitle"),
                cls: "dfo-bank-scene-half",
                blocks: [
                  {
                    type: "canvas",
                    paint: (cv) => drawSafeScene(cv, data, visuals, w),
                  },
                  {
                    type: "stats",
                    items: [
                      [T("svc.bank.onAccount"), `${formatBankNum(data.accountGold)} gp`],
                      [T("svc.bank.carried"), `${formatBankNum(data.totalCarriedGold)} gp`],
                    ],
                  },
                  {
                    type: "actions",
                    layout: "column",
                    items: [
                      {
                        label: T("svc.bank.depositGold"),
                        primary: data.totalCarriedGold > 0,
                        disabled: data.totalCarriedGold <= 0,
                        act: () => openDepositGoldModal(w, data),
                      },
                    ],
                  },
                ],
              },
            ],
          ],
        },
      ],
    });

    const amtPresets = [
      [10000, T("svc.bank.amt10k")],
      [50000, T("svc.bank.amt50k")],
      [100000, T("svc.bank.amt100k")],
      [250000, T("svc.bank.amt250k")],
      [500000, T("svc.bank.amt500k")],
      [1000000, T("svc.bank.amt1m")],
    ];
    const withdrawCol = (title, minCostFn, actFn, customFn) => ({
      type: "group",
      title,
      blocks: [
        {
          type: "actions",
          layout: "dfo-bank-btn-grid",
          items: amtPresets.map(([amt, label]) => ({
            label,
            act: () => actFn(amt),
            disabled: data.accountGold < minCostFn(amt),
          })),
        },
        {
          type: "actions",
          layout: "dfo-bank-wide-btn",
          items: [
            {
              label: T("svc.bank.customAmount"),
              act: customFn,
            },
          ],
        },
      ],
    });

    blocks.push({
      type: "cols",
      cls: "dfo-bank-main-cols",
      template: "minmax(0, 1fr) minmax(0, 1fr)",
      cols: [
        [
          {
            type: "group",
            title: T("svc.bank.withdrawPanel"),
            cls: "dfo-bank-withdraw-panel",
            blocks: [
              {
                type: "cols",
                cls: "dfo-bank-withdraw-subcols",
                template: "1fr 1fr",
                cols: [
                  [
                    withdrawCol(
                      T("svc.bank.takeLocTitle"),
                      (amt) => amt + Math.floor(amt / 100),
                      (amt) => withdrawLoc(w, amt),
                      () => openWithdrawLocModal(w, data),
                    ),
                  ],
                  [
                    withdrawCol(
                      T("svc.bank.takeGoldTitle"),
                      (amt) => amt,
                      (amt) => withdrawGold(w, amt),
                      () => openWithdrawGoldModal(w, data),
                    ),
                  ],
                ],
              },
            ],
          },
        ],
        [
          {
            type: "group",
            title: T("svc.bank.silverTitle"),
            cls: "dfo-bank-silver-panel",
            blocks: [
              {
                type: "canvas",
                paint: (cv) => drawSilverCoinsScene(cv, data, visuals, w),
              },
              {
                type: "stats",
                items: [
                  [T("svc.bank.silverHeld"), `${formatBankNum(data.silverBalance)}`],
                  [T("svc.bank.rate"), T("svc.bank.rateValue", { n: data.goldPerMark })],
                  [
                    T("svc.bank.soldToday"),
                    T("svc.bank.ofMax", { n: data.silverSoldToday, max: data.silverSoldMax }),
                  ],
                  [
                    T("svc.bank.combat"),
                    T("svc.bank.ofMax", { n: data.combatToday, max: data.combatMax }),
                  ],
                  [T("svc.bank.found"), T("svc.bank.ofMax", { n: data.foundToday, max: data.findMax })],
                  [
                    T("svc.bank.gathered"),
                    T("svc.bank.ofMax", { n: data.gatherToday, max: data.gatherMax }),
                  ],
                ],
              },
              {
                type: "actions",
                layout: "column",
                items: [
                  {
                    label: T("svc.bank.sellSilver"),
                    act: () => openSellSilverModal(w, data),
                    disabled: data.silverBalance <= 0,
                  },
                ],
              },
            ],
          },
        ],
      ],
    });

    blocks.push({
      type: "group",
      title: T("svc.bank.fleet"),
      cls: "dfo-bank-ships-panel",
      blocks: [
        {
          type: "stats",
          items: [
            [T("svc.bank.fleet"), T("svc.bank.fleetCount", { n: data.shipsCount })],
          ],
        },
        {
          type: "actions",
          layout: "dfo-bank-ships-actions",
          items: [
            {
              label: T("svc.bank.buyShip"),
              act: () => {
                if (w.box && !w.box.waiting) w.box = null;
                w._button?.("buyShip");
              },
              disabled: !w.enabled?.("buyShip"),
            },
            {
              label: T("svc.bank.sellShip"),
              act: () => {
                if (w.box && !w.box.waiting) w.box = null;
                w._button?.("sellShip");
              },
              disabled: !w.enabled?.("sellShip"),
            },
          ],
        },
      ],
    });

    const cityName = w.hooks?.cityName?.() ?? "";
    const regName = w.hooks?.regionName?.() ?? "";
    const title = cityName ? T("svc.bank.titleCity", { city: cityName }) : T("svc.bank.title");

    return {
      title,
      sub: regName,
      size: "wide dfo-bank-win",
      blocks,
      foot: [
        {
          label: T("svc.bank.exit"),
          act: () => {
            teardownBankOverlays(w);
            w.done = true;
            w._close?.();
          },
        },
      ],
    };
  }

  function view(kind, w, v) {
    const state = track(w, kind);
    bind(w, kind, state);
    if (kind === "bank") {
      return renderEnhancedBankView(w, v);
    }
    if (kind === "spellMaker" && root.__dfoSpellmaker?.renderPortView) {
      return root.__dfoSpellmaker.renderPortView(w, v, spells);
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
          ? T("svc.pick.enchant")
          : T("svc.pick.spellEffect"),
      );
      active.list.setAttribute("role", "listbox");
      const title = doc.createElement("h2");
      title.className = "dfo-service-picker-title";
      title.textContent =
        ctx.kind === "itemMaker" ? T("svc.pick.enchant") : T("svc.pick.effect");
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
        stats: [[T("svc.variants"), row.effects.map(variantName).join(" · ")]],
        formula: [],
        notes: [T("svc.pick.note")],
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
      row.name ?? row.effect?.name ?? row.group ?? T("svc.pick.describe"),
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
      add("p", "dfo-service-help-note", T("svc.pick.startSettings"));
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
      } else add("p", "dfo-service-help-note", T("svc.pick.spellLoading"));
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
        if (kind === "spellMaker" && root.__dfoSpellmaker?.renderPortView) {
          try {
            if (w?.picker) {
              const state = track(w, kind);
              bind(w, kind, state);
            }
            const custom = root.__dfoSpellmaker.renderPortView(w, null, spells);
            if (custom) return custom;
          } catch (e) {
            report(kind, e);
          }
        }
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

  /* =========================================================================
   * NPC MERCHANT TRADE OVERHAUL (Buy, Sell, SellMagic)
   * ========================================================================= */
  const TRADE_PAGES = Object.freeze([
    ["weapons", "Оружие", "Weapons"],
    ["armor", "Броня", "Armor"],
    ["clothing", "Одежда", "Clothing"],
    ["potions", "Зелья", "Potions"],
    ["ingredients", "Ингредиенты", "Ingredients"],
    ["books", "Книги", "Books"],
    ["valuables", "Ценности", "Valuables"],
    ["misc", "Разное", "Misc"],
    ["junk", "Хлам", "Junk"],
  ]);
  const VALID_PAGE_IDS = new Set(TRADE_PAGES.map(([id]) => id));
  const tradeState = {
    localTab: "weapons",
    remoteTab: "weapons",
    scrollLeft: 0,
    scrollRight: 0,
    lastClick: null,
    soundCount: 0,
    lastClusterUnits: 0,
    lastClusterTotal: 0,
  };

  function saveTradeScrolls(bridge) {
    try {
      const host = bridge?.host;
      if (!host) return;
      const left = host.querySelector(".dfo-trade-col-player .remotelist");
      if (left && typeof left.scrollTop === "number") {
        tradeState.scrollLeft = left.scrollTop;
      }
      const right = host.querySelector(".dfo-trade-col-merchant .remotelist");
      if (right && typeof right.scrollTop === "number") {
        tradeState.scrollRight = right.scrollTop;
      }
    } catch (e) {
      report("saveTradeScrolls", e);
    }
  }

  function tradeBeforeRepaint(bridge) {
    saveTradeScrolls(bridge);
  }

  let audioCtx = null,
    decodedTradeBuf = null,
    fetchTradePromise = null;
  function playTradeDealSound() {
    tradeState.soundCount++;
    const url = scriptBase + "trade_deal.wav";
    try {
      const Ctx = root.AudioContext || root.webkitAudioContext;
      if (Ctx) {
        if (!audioCtx) audioCtx = new Ctx();
        if (audioCtx.state === "suspended") audioCtx.resume().catch(() => { });
        const playBuf = (buf) => {
          try {
            const src = audioCtx.createBufferSource();
            const gain = audioCtx.createGain();
            gain.gain.value = 1.6;
            src.buffer = buf;
            src.connect(gain);
            gain.connect(audioCtx.destination);
            src.start(0);
          } catch { }
        };
        if (decodedTradeBuf) {
          playBuf(decodedTradeBuf);
          return;
        }
        if (!fetchTradePromise && typeof root.fetch === "function") {
          fetchTradePromise = root
            .fetch(url)
            .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
            .then((ab) => audioCtx.decodeAudioData(ab))
            .then((buf) => {
              decodedTradeBuf = buf;
              return buf;
            })
            .catch(() => null);
        }
        if (fetchTradePromise) {
          fetchTradePromise.then((buf) => {
            if (buf) playBuf(buf);
          });
          return;
        }
      }
    } catch { }
    try {
      if (typeof root.Audio === "function") {
        const a = new root.Audio(url);
        a.volume = 1.0;
        const p = a.play();
        if (p && typeof p.catch === "function") p.catch(() => { });
      }
    } catch { }
  }

  function basePageOf(item) {
    if (!item || typeof item !== "object") return "misc";
    const g = item.group;
    if (g === "Weapons") return "weapons";
    if (g === "Armor") return "armor";
    if (
      g === "Clothing" ||
      g === "MensClothing" ||
      g === "WomensClothing" ||
      g === "ReligiousItems"
    )
      return "clothing";
    if (
      g === "Potions" ||
      (g === "MiscItems" && item.templateIndex === 264) ||
      item.potionRecipeKey != null
    )
      return "potions";
    if (typeof g === "string" && g.includes("Ingredients") && g !== "MetalIngredients")
      return "ingredients";
    if (
      g === "Books" ||
      g === "Maps" ||
      g === "TownMap" ||
      (g === "MiscItems" &&
        (item.templateIndex === 277 ||
          item.templateIndex === 285 ||
          item.templateIndex === 541))
    )
      return "books";
    if (
      g === "Gems" ||
      g === "Jewelry" ||
      g === "Currency" ||
      g === "Paintings" ||
      g === "SoulGems" ||
      g === "MetalIngredients" ||
      (g === "MiscItems" &&
        (item.templateIndex === 275 || item.templateIndex === 539))
    )
      return "valuables";
    return "misc";
  }

  function nativePageOf(item) {
    if (!item || typeof item !== "object") return "misc";
    if (
      (Array.isArray(item.enchantments) && item.enchantments.length > 0) ||
      (Array.isArray(item.customMagic) && item.customMagic.length > 0) ||
      item.rarity === "magic" ||
      item.rarity === "rare" ||
      item.rarity === "legendary" ||
      item.rarity === "aetheric" ||
      item.rarity === "artifact" ||
      item.rarity === "gilded" ||
      item.templateIndex === 285
    )
      return "magic";
    return basePageOf(item);
  }

  function tradePageOf(item, bridge) {
    if (!item || typeof item !== "object") return "misc";
    try {
      if (typeof root.__dfoStorePageOf === "function") {
        const p = root.__dfoStorePageOf(item);
        if (VALID_PAGE_IDS.has(p)) return p;
      }
    } catch { }
    try {
      if (typeof root.__dfoPack?.page === "function") {
        const p = root.__dfoPack.page(item, basePageOf, nativePageOf);
        if (VALID_PAGE_IDS.has(p)) return p;
      }
    } catch { }
    try {
      if (typeof root.__dfoPackRules?.page === "function") {
        const p = root.__dfoPackRules.page(
          item,
          basePageOf,
          nativePageOf,
          root.__dfoPackData || {},
        );
        if (VALID_PAGE_IDS.has(p)) return p;
      }
    } catch { }
    try {
      if (bridge?.isNativeJunk?.(item)) return "junk";
    } catch { }
    return basePageOf(item);
  }

  function isTradeJunk(item, bridge) {
    if (!item || typeof item !== "object") return false;
    if (tradePageOf(item, bridge) === "junk") return true;
    try {
      if (bridge?.isNativeJunk?.(item)) return true;
    } catch { }
    return false;
  }

  function isTradeMode(mode) {
    return mode === "Buy" || mode === "Sell" || mode === "SellMagic";
  }

  function node(tag, cls, text) {
    const el = doc.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = String(text);
    return el;
  }

  function formatNumber(n) {
    const val = Math.max(0, Math.round(Number(n) || 0));
    try {
      if (root.__dfoUi?.number)
        return root.__dfoUi.number(val, { maximumFractionDigits: 0 });
    } catch { }
    return val.toLocaleString(ru() ? "ru-RU" : "en-US");
  }

  function coinSvg(cls = "dfo-item-coin") {
    const svg = doc.createElementNS
      ? doc.createElementNS("http://www.w3.org/2000/svg", "svg")
      : doc.createElement("svg");
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.setAttribute("class", cls);
    svg.setAttribute("aria-hidden", "true");
    for (const [tag, attrs] of [
      [
        "circle",
        {
          cx: 10,
          cy: 10,
          r: 8,
          fill: "#8e6118",
          stroke: "currentColor",
          "stroke-width": 1.5,
        },
      ],
      [
        "circle",
        {
          cx: 10,
          cy: 10,
          r: 5.5,
          fill: "#c99a2d",
          stroke: "#f8df80",
          "stroke-width": 0.8,
        },
      ],
      [
        "path",
        {
          d: "M8 6.5h2.2c4 0 4 7 0 7H8zm1-1.5v10",
          fill: "none",
          stroke: "#805313",
          "stroke-width": 1.4,
        },
      ],
    ]) {
      const part = doc.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const [k, v] of Object.entries(attrs))
        part.setAttribute(k, String(v));
      svg.append(part);
    }
    return svg;
  }

  function scalesSvg(tiltDeg = 0) {
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 140 108");
    svg.setAttribute("class", "dfo-trade-scales");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = `
      <defs>
        <linearGradient id="dfoScaleGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#f6df92"/>
          <stop offset="52%" stop-color="#c89d42"/>
          <stop offset="100%" stop-color="#78581e"/>
        </linearGradient>
        <radialGradient id="dfoScaleGlow" cx="50%" cy="48%" r="50%">
          <stop offset="0%" stop-color="rgba(232,193,90,0.22)"/>
          <stop offset="100%" stop-color="rgba(232,193,90,0)"/>
        </radialGradient>
      </defs>
      <circle cx="70" cy="52" r="48" fill="url(#dfoScaleGlow)"/>
      <!-- Pedestal base -->
      <path d="M42 98 H98 L93 91 H47 Z" fill="url(#dfoScaleGold)" stroke="#3b2c10" stroke-width="1.2"/>
      <path d="M51 91 H89 L85 85 H55 Z" fill="url(#dfoScaleGold)" stroke="#3b2c10" stroke-width="1.1"/>
      <!-- Center pillar -->
      <rect x="67" y="22" width="6" height="64" rx="2.5" fill="url(#dfoScaleGold)" stroke="#3b2c10" stroke-width="1.2"/>
      <circle cx="70" cy="18" r="6" fill="url(#dfoScaleGold)" stroke="#3b2c10" stroke-width="1.2"/>
      <path d="M70 8 L73 14 L67 14 Z" fill="#f6df92"/>
      <!-- Tilting balance beam & pans -->
      <g class="dfo-scales-beam" transform="rotate(${tiltDeg} 70 26)">
        <path d="M20 26 Q45 20 70 26 Q95 20 120 26" fill="none" stroke="url(#dfoScaleGold)" stroke-width="3.6" stroke-linecap="round"/>
        <circle cx="20" cy="26" r="3.2" fill="#f6df92" stroke="#3b2c10" stroke-width="1"/>
        <circle cx="70" cy="26" r="4.8" fill="#f6df92" stroke="#3b2c10" stroke-width="1.2"/>
        <circle cx="120" cy="26" r="3.2" fill="#f6df92" stroke="#3b2c10" stroke-width="1"/>
        <!-- Left pan chains -->
        <line x1="20" y1="28" x2="10" y2="62" stroke="#bfa263" stroke-width="1.3" stroke-dasharray="2.5,1.5"/>
        <line x1="20" y1="28" x2="20" y2="62" stroke="#d5b878" stroke-width="1.1"/>
        <line x1="20" y1="28" x2="30" y2="62" stroke="#bfa263" stroke-width="1.3" stroke-dasharray="2.5,1.5"/>
        <path d="M6 62 Q20 73 34 62 Z" fill="url(#dfoScaleGold)" stroke="#3b2c10" stroke-width="1.2"/>
        <!-- Right pan chains -->
        <line x1="120" y1="28" x2="110" y2="62" stroke="#bfa263" stroke-width="1.3" stroke-dasharray="2.5,1.5"/>
        <line x1="120" y1="28" x2="120" y2="62" stroke="#d5b878" stroke-width="1.1"/>
        <line x1="120" y1="28" x2="130" y2="62" stroke="#bfa263" stroke-width="1.3" stroke-dasharray="2.5,1.5"/>
        <path d="M106 62 Q120 73 134 62 Z" fill="url(#dfoScaleGold)" stroke="#3b2c10" stroke-width="1.2"/>
      </g>
    `;
    return svg;
  }

  function calcItemTradePrice(bridge, mode, item) {
    if (!item || !bridge) return null;
    try {
      const m =
        mode === "Buy"
          ? "Buy"
          : bridge.mode === "SellMagic"
            ? "SellMagic"
            : "Sell";
      const priceCtx = bridge.hooks?.priceCtx?.() ?? {};
      const lot = bridge.calcCost(m, [item], priceCtx);
      const val = bridge.calcTradePrice(
        m,
        lot.cost,
        priceCtx.quality ?? 0,
        priceCtx.skills ?? {},
        lot.pieces,
        lot.resale,
      );
      return Number.isFinite(val) ? val : null;
    } catch {
      return null;
    }
  }

  function dressTradeRowFallback(el, item, line, tradePrice) {
    if (!el || el.classList.contains("dfo-item-row")) return;
    const nameBox = el.querySelector(".itemname");
    const wtBox = el.querySelector(".itemwt");
    if (!nameBox || !wtBox) return;
    for (const oldPrice of el.querySelectorAll(":scope > .itemprice"))
      oldPrice.remove();
    const sub = node("small", "dfo-row-sub");
    if (line?.material) {
      const mat = node("span", "dfo-row-mat");
      const metal = node("span", "dfo-item-metal", line.material);
      mat.append(metal);
      sub.append(mat);
    }
    const kgNum = Number(line?.weight);
    if (Number.isFinite(kgNum) && kgNum >= 0) {
      const kgTxt = `${kgNum > 0 && kgNum < 0.05 ? "<0.1" : kgNum.toFixed(1)} ${ru() ? "кг" : "kg"}`;
      sub.append(node("span", "dfo-row-kg", kgTxt));
    }
    if (line?.quest != null) {
      sub.append(node("span", "dfo-row-extra", ru() ? "квест" : "quest"));
    }
    for (const oldSub of nameBox.querySelectorAll(":scope > small"))
      oldSub.remove();
    nameBox.append(sub);
    const priceBox = node("span", "itemwt dfo-row-price");
    const priceVal = node(
      "strong",
      "dfo-item-price-value",
      tradePrice != null ? formatNumber(tradePrice) : "—",
    );
    priceBox.append(priceVal, coinSvg());
    wtBox.replaceWith(priceBox);
    if (typeof item?.rarity === "string" && item.rarity)
      el.dataset.rarity = item.rarity;
    el.classList.add("dfo-item-row");
  }

  function canMoveTradeItem(bridge, item, side) {
    if (!item) return false;
    const mode = bridge.mode;
    if ((mode === "Sell" || mode === "SellMagic") && side === "local") {
      if (bridge.isUnsellable?.(item)) return false;
      if (bridge.canStage && !bridge.canStage(item)) return false;
      const hooks = bridge.hooks ?? {};
      if (
        bridge.merchantAccepts &&
        !bridge.merchantAccepts(mode, item, {
          accepts: hooks.accepts,
          enchanted: hooks.enchanted,
        })
      ) {
        return false;
      }
    }
    return true;
  }

  function moveTradeItemUnits(bridge, item, side, quantity) {
    if (!item) return;
    const max = Math.max(1, Math.floor(Number(item.stackCount) || 1));
    const qty = Math.max(1, Math.min(max, Math.floor(Number(quantity) || 1)));
    bridge.qty = { item, text: String(qty) };
    if (side === "local") {
      bridge.moveLocal(item);
    } else {
      bridge.moveRemote(item);
    }
    bridge.qty = { item: null, text: "" };
  }

  function showTradeQuantityModal({ item, side, bridge, maxAmount }) {
    const host = bridge.host || doc.body;
    host
      .querySelectorAll(".dfo-trade-modal-backdrop")
      .forEach((el) => el.remove());

    const backdrop = doc.createElement("div");
    backdrop.className = "dfo-trade-modal-backdrop";

    const box = doc.createElement("div");
    box.className = "dfo-trade-modal-box";

    const head = doc.createElement("div");
    head.className = "dfo-trade-modal-head";
    const h3 = doc.createElement("h3");
    const line = bridge.itemLine?.(item, bridge.hooks?.entity);
    h3.textContent =
      line?.name || item.name || (ru() ? "Перемещение товара" : "Move item");
    head.append(h3);

    const sub = doc.createElement("p");
    sub.className = "dfo-trade-modal-sub";
    sub.textContent = ru()
      ? `В наличии: ${maxAmount} ед. Введите количество:`
      : `Available: ${maxAmount}. Enter amount:`;
    head.append(sub);

    const body = doc.createElement("div");
    body.className = "dfo-trade-modal-body";

    const inputRow = doc.createElement("div");
    inputRow.className = "dfo-trade-modal-inputrow";

    const input = doc.createElement("input");
    input.type = "text";
    input.className = "dfo-trade-modal-input";
    input.inputMode = "numeric";
    input.value = "1";
    input.placeholder = "1";
    input.autocomplete = "off";
    input.spellcheck = false;

    input.addEventListener("input", (e) => {
      e.stopPropagation();
      const clean = input.value.replace(/\D/g, "");
      if (clean !== input.value) input.value = clean;
    });
    input.addEventListener("paste", (e) => {
      e.stopPropagation();
      const text = e.clipboardData?.getData("text") || "";
      const clean = text.replace(/\D/g, "");
      if (clean) {
        e.preventDefault();
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        input.value =
          input.value.slice(0, start) + clean + input.value.slice(end);
        input.selectionStart = input.selectionEnd = start + clean.length;
      }
    });

    const close = () => {
      backdrop.remove();
    };

    const confirm = () => {
      const val = parseInt(input.value, 10);
      const qty = isNaN(val) ? 1 : Math.max(1, Math.min(maxAmount, val));
      close();
      saveTradeScrolls(bridge);
      moveTradeItemUnits(bridge, item, side, qty);
      const cat = tradePageOf(item, bridge);
      const mode = bridge.mode;
      if (side === "remote" && (mode === "Sell" || mode === "SellMagic")) {
        if (tradeState.localTab !== cat) tradeState.localTab = cat;
      } else if (side === "local" && mode === "Buy") {
        if (tradeState.remoteTab !== cat) tradeState.remoteTab = cat;
      }
      bridge.picked = null;
      bridge.repaint();
    };

    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        confirm();
      } else if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    });
    input.addEventListener("keyup", (e) => e.stopPropagation());
    input.addEventListener("keypress", (e) => e.stopPropagation());

    inputRow.append(input);

    const btnAll = doc.createElement("button");
    btnAll.type = "button";
    btnAll.className = "dfo-trade-modal-btn-all";
    btnAll.textContent = ru() ? "Все" : "All";
    btnAll.addEventListener("click", (e) => {
      e.stopPropagation();
      input.value = String(maxAmount);
      input.focus();
    });
    inputRow.append(btnAll);
    body.append(inputRow);

    const foot = doc.createElement("div");
    foot.className = "dfo-trade-modal-foot";

    const btnConfirm = doc.createElement("button");
    btnConfirm.type = "button";
    btnConfirm.className = "act primary dfo-trade-modal-btn";
    btnConfirm.textContent = ru() ? "Переместить" : "Move";
    btnConfirm.addEventListener("click", (e) => {
      e.stopPropagation();
      confirm();
    });

    const btnCancel = doc.createElement("button");
    btnCancel.type = "button";
    btnCancel.className = "act dfo-trade-modal-btn";
    btnCancel.textContent = ru() ? "Отмена" : "Cancel";
    btnCancel.addEventListener("click", (e) => {
      e.stopPropagation();
      close();
    });

    foot.append(btnCancel, btnConfirm);

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
    });

    box.append(head, body, foot);
    backdrop.append(box);
    host.append(backdrop);

    if (typeof input.focus === "function") {
      setTimeout(() => {
        input.focus();
        if (typeof input.select === "function") input.select();
      }, 0);
    }
  }

  function tradeRow(el, item, side, bridge) {
    try {
      if (!el || !item) return el;
      const mode = bridge.mode;
      const line = bridge.itemLine(item, bridge.hooks?.entity);
      let tradePrice = null;
      if (mode === "Buy") {
        tradePrice = calcItemTradePrice(bridge, "Buy", item);
        if (side === "local" || bridge.basket.includes(item)) {
          el.classList.add("dfo-staged-item");
        }
      } else if (mode === "Sell" || mode === "SellMagic") {
        tradePrice =
          bridge.quote(item, "local")?.price ??
          calcItemTradePrice(bridge, mode, item);
        if (side === "remote") el.classList.add("dfo-staged-item");
      } else {
        tradePrice = bridge.quote(item, side)?.price ?? null;
      }

      const cardsApi = root.__dfoItemCards;
      let dressed = false;
      if (cardsApi && typeof cardsApi.row === "function") {
        dressed = cardsApi.row(
          el,
          line,
          "trade",
          {
            known: () => item?.isIdentified !== false,
            credit: () =>
              item?.group === "MiscItems" && item?.templateIndex === 275
                ? item.value
                : null,
            tradePrice,
          },
          line?.quest ? (ru() ? "квест" : "quest") : null,
        );
      }
      if (!dressed) {
        dressTradeRowFallback(el, item, line, tradePrice);
      }

      const origClick = el.onclick;
      if (typeof origClick === "function") {
        el.onclick = (ev) => {
          saveTradeScrolls(bridge);
          const now = Date.now();
          const last = tradeState.lastClick;
          const isSameItem = last && last.item === item && last.side === side;
          const isDbl =
            (isSameItem && now - last.time <= 450) || (ev.detail >= 2);

          const isCtrlShift = (ev.ctrlKey || ev.metaKey) && ev.shiftKey;
          const isShift = ev.shiftKey && !ev.ctrlKey && !ev.metaKey;

          if (isDbl) {
            ev.preventDefault();
            ev.stopPropagation();
            tradeState.lastClick = null;
            bridge.resetClick?.();

            if (!canMoveTradeItem(bridge, item, side)) return;

            const stackCount = Math.max(
              1,
              Math.floor(Number(item.stackCount) || 1),
            );

            if (isCtrlShift) {
              showTradeQuantityModal({
                item,
                side,
                bridge,
                maxAmount: stackCount,
              });
              return;
            }

            const moveQty = isShift ? stackCount : 1;
            moveTradeItemUnits(bridge, item, side, moveQty);

            const cat = tradePageOf(item, bridge);
            if (side === "remote" && (mode === "Sell" || mode === "SellMagic")) {
              if (tradeState.localTab !== cat) tradeState.localTab = cat;
            } else if (side === "local" && mode === "Buy") {
              if (tradeState.remoteTab !== cat) tradeState.remoteTab = cat;
            }

            bridge.picked = null;
            bridge.repaint();
            return;
          }

          // Single click:
          tradeState.lastClick = { item, side, time: now };
          const prevPicked = bridge.picked?.item;
          const cat = tradePageOf(item, bridge);
          origClick.call(el, ev);
          if (prevPicked === item && bridge.picked === null) {
            if (side === "remote" && (mode === "Sell" || mode === "SellMagic")) {
              if (tradeState.localTab !== cat) {
                tradeState.localTab = cat;
                bridge.tab = cat;
                bridge.repaint();
              }
            } else if (side === "local" && mode === "Buy") {
              if (tradeState.remoteTab !== cat) {
                tradeState.remoteTab = cat;
                bridge.repaint();
              }
            }
          }
        };
      }
    } catch (e) {
      report("tradeRow", e);
    }
    return el;
  }

  function getSellablePackItems(bridge) {
    const hooks = bridge.hooks ?? {};
    const isEquipped = hooks.isEquipped ?? (() => false);
    const stagedSet = new Set(bridge.staged ?? []);
    return (hooks.packItems?.() ?? []).filter(
      (it) =>
        it &&
        !isEquipped(it) &&
        bridge.merchantAccepts(bridge.mode, it, {
          accepts: hooks.accepts,
          enchanted: hooks.enchanted,
        }) &&
        !stagedSet.has(it),
    );
  }

  function getMerchantShelfItems(bridge) {
    const hooks = bridge.hooks ?? {};
    return (hooks.shelfItems?.() ?? []).filter(Boolean);
  }

  function countByCategory(items, bridge) {
    const counts = new Map(TRADE_PAGES.map(([id]) => [id, 0]));
    for (const it of items) {
      const cat = tradePageOf(it, bridge);
      counts.set(cat, (counts.get(cat) || 0) + 1);
    }
    return counts;
  }

  function pickInitialTab(items, bridge, fallback = "weapons") {
    const counts = countByCategory(items, bridge);
    if ((counts.get(fallback) || 0) > 0) return fallback;
    for (const [id] of TRADE_PAGES) {
      if ((counts.get(id) || 0) > 0) return id;
    }
    return fallback;
  }

  function renderCategoryHeader(activeTab, counts, onSelect) {
    const cats = node("div", "packcats dfo-trade-cats");
    const tabs = node("div", "packtabs");
    for (const [id, ruLabel, enLabel] of TRADE_PAGES) {
      const count = counts.get(id) || 0;
      const isOn = activeTab === id;
      const btn = node(
        "button",
        `packtab${isOn ? " on" : ""}${count === 0 ? " empty" : ""}`,
      );
      btn.type = "button";
      btn.dataset.page = id;
      btn.setAttribute("aria-pressed", isOn ? "true" : "false");
      btn.append(
        node("span", "dfo-tab-label", ru() ? ruLabel : enLabel),
        node("span", "count", String(count)),
      );
      btn.onclick = () => onSelect(id);
      tabs.append(btn);
    }
    cats.append(tabs);
    return cats;
  }

  function tradeBeforeMount(bridge, args) {
    try {
      tradeState.scrollLeft = 0;
      tradeState.scrollRight = 0;
      tradeState.lastClick = null;
      const opts = args?.[1] ?? {};
      const mode = opts.mode ?? "Buy";
      const isEquipped = opts.isEquipped ?? (() => false);
      const pack = (opts.packItems?.() ?? []).filter(
        (it) =>
          it &&
          !isEquipped(it) &&
          bridge.merchantAccepts(mode, it, {
            accepts: opts.accepts,
            enchanted: opts.enchanted,
          }),
      );
      tradeState.localTab = pickInitialTab(pack, bridge, "weapons");
      if (mode === "Buy") {
        const shelf = (opts.shelfItems?.() ?? []).filter(Boolean);
        tradeState.remoteTab = pickInitialTab(shelf, bridge, "weapons");
      } else {
        tradeState.remoteTab = "weapons";
      }
    } catch (e) {
      report("tradeBeforeMount", e);
    }
  }

  // Left Column = ALWAYS Player's Column:
  // - In Sell / SellMagic: Player's inventory with 3x3 9-category filter tabs.
  // - In Buy (1-to-1 mirror of merchant's Sell column): Mixed window of items staged to buy (no category filter).
  function tradeLeftCol(bridge, nativeLeftCol) {
    if (!isTradeMode(bridge.mode)) return nativeLeftCol();
    try {
      const isBuy = bridge.mode === "Buy";
      const sec = node("section", "packcol dfo-trade-col dfo-trade-col-player");
      const head = node("div", "remotehead trade-ownhead");
      const who = node("div", "remotewho");

      if (isBuy) {
        // Mirror of Merchant's Sell column: uncategorized mixed list of items player wants to buy
        const basketItems = (bridge.basket ?? []).filter(Boolean);
        const totalUnits = countUnits(basketItems);
        who.append(
          node("h3", null, ru() ? "К покупке" : "To buy"),
          node(
            "p",
            "meta",
            totalUnits > 0
              ? ru()
                ? `Выбрано: ${totalUnits} ед.`
                : `Selected: ${totalUnits}`
              : bridge.countText(0),
          ),
        );
        head.append(who);
        sec.append(head);

        const list = node("div", "remotelist");
        list.addEventListener?.(
          "scroll",
          () => {
            tradeState.scrollLeft = list.scrollTop;
          },
          { passive: true },
        );
        sec.append(list);
        if (basketItems.length) {
          bridge.mountVirtual(
            list,
            basketItems,
            (it) => bridge.itemRow(it, "local"),
            `local:${bridge.view}:buy-basket`,
          );
        } else {
          list.append(
            node(
              "p",
              "packempty",
              ru()
                ? "Выберите товары справа у торговца для покупки."
                : "Nothing selected to buy yet.",
            ),
          );
        }
        return sec;
      }

      // Sell / SellMagic: Player's inventory with 3x3 9-category tabs
      if (!VALID_PAGE_IDS.has(tradeState.localTab)) {
        tradeState.localTab = VALID_PAGE_IDS.has(bridge.tab)
          ? bridge.tab
          : "weapons";
      }
      bridge.tab = tradeState.localTab;

      const allLocal = getSellablePackItems(bridge);
      const counts = countByCategory(allLocal, bridge);
      if (
        (counts.get(tradeState.localTab) || 0) === 0 &&
        allLocal.length > 0 &&
        !bridge.picked
      ) {
        // Keep user's clicked tab if they explicitly selected an empty tab; otherwise use current localTab
      }
      const filtered = allLocal.filter(
        (it) => tradePageOf(it, bridge) === tradeState.localTab,
      );

      who.append(
        node("h3", null, ru() ? "Ваш инвентарь" : "Your pack"),
        node("p", "meta", bridge.countText(filtered.length)),
      );
      head.append(who);
      sec.append(head);

      sec.append(
        renderCategoryHeader(tradeState.localTab, counts, (id) => {
          tradeState.scrollLeft = 0;
          const oldList = bridge.host?.querySelector(
            ".dfo-trade-col-player .remotelist",
          );
          if (oldList) oldList.scrollTop = 0;
          tradeState.localTab = id;
          bridge.tab = id;
          bridge.repaint();
        }),
      );

      const list = node("div", "remotelist");
      list.addEventListener?.(
        "scroll",
        () => {
          tradeState.scrollLeft = list.scrollTop;
        },
        { passive: true },
      );
      sec.append(list);
      if (filtered.length) {
        bridge.mountVirtual(
          list,
          filtered,
          (it) => bridge.itemRow(it, "local"),
          `local:${bridge.view}:${tradeState.localTab}`,
        );
      } else {
        list.append(
          node(
            "p",
            "packempty",
            ru()
              ? "В этой категории нет предметов."
              : "Nothing here fits this page.",
          ),
        );
      }
      return sec;
    } catch (e) {
      report("tradeLeftCol", e);
      return nativeLeftCol();
    }
  }

  // Right Column = ALWAYS Merchant's Column:
  // - In Sell / SellMagic: Mixed window of all items the player wants to sell (no category filter).
  // - In Buy (1-to-1 mirror of player's Sell column): Merchant's shelf items with 3x3 9-category filter tabs.
  function tradeRightCol(bridge, nativeRightCol) {
    if (!isTradeMode(bridge.mode)) return nativeRightCol();
    try {
      const isBuy = bridge.mode === "Buy";
      const sec = node(
        "section",
        "packcol packremote dfo-trade-col dfo-trade-col-merchant",
      );
      const head = node("div", "remotehead");
      const who = node("div", "remotewho");

      if (!isBuy) {
        // Sell / SellMagic: Uncategorized mixed list of everything staged to sell to merchant
        const stagedItems = (bridge.staged ?? []).filter(Boolean);
        const totalUnits = countUnits(stagedItems);
        who.append(
          node("h3", null, ru() ? "К продаже торговцу" : "Staged to sell"),
          node(
            "p",
            "meta",
            totalUnits > 0
              ? ru()
                ? `Выбрано: ${totalUnits} ед.`
                : `Staged: ${totalUnits}`
              : bridge.countText(0),
          ),
        );
        head.append(who);
        sec.append(head);

        const list = node("div", "remotelist");
        list.addEventListener?.(
          "scroll",
          () => {
            tradeState.scrollRight = list.scrollTop;
          },
          { passive: true },
        );
        sec.append(list);
        if (stagedItems.length) {
          bridge.mountVirtual(
            list,
            stagedItems,
            (it) => bridge.itemRow(it, "remote"),
            `remote:${bridge.view}:sell-staged`,
          );
        } else {
          list.append(
            node(
              "p",
              "packempty",
              ru()
                ? "Переместите сюда предметы слева для продажи."
                : "Nothing staged yet.",
            ),
          );
        }
        return sec;
      }

      // Buy mode: Merchant's shelf with 3x3 9-category filter tabs
      const allShelf = getMerchantShelfItems(bridge);
      const counts = countByCategory(allShelf, bridge);
      if (!VALID_PAGE_IDS.has(tradeState.remoteTab)) {
        tradeState.remoteTab = pickInitialTab(allShelf, bridge, "weapons");
      }
      const filtered = allShelf.filter(
        (it) => tradePageOf(it, bridge) === tradeState.remoteTab,
      );

      who.append(
        node("h3", null, ru() ? "Товары торговца" : "Merchant's goods"),
        node("p", "meta", bridge.countText(filtered.length)),
      );
      head.append(who);
      sec.append(head);

      sec.append(
        renderCategoryHeader(tradeState.remoteTab, counts, (id) => {
          tradeState.scrollRight = 0;
          const oldList = bridge.host?.querySelector(
            ".dfo-trade-col-merchant .remotelist",
          );
          if (oldList) oldList.scrollTop = 0;
          tradeState.remoteTab = id;
          bridge.repaint();
        }),
      );

      const list = node("div", "remotelist");
      list.addEventListener?.(
        "scroll",
        () => {
          tradeState.scrollRight = list.scrollTop;
        },
        { passive: true },
      );
      sec.append(list);
      if (filtered.length) {
        bridge.mountVirtual(
          list,
          filtered,
          (it) => bridge.itemRow(it, "remote"),
          `remote:${bridge.view}:${tradeState.remoteTab}`,
        );
      } else {
        list.append(
          node(
            "p",
            "packempty",
            ru()
              ? "У торговца нет товаров в этой категории."
              : "Nothing on the shelf in this category.",
          ),
        );
      }
      return sec;
    } catch (e) {
      report("tradeRightCol", e);
      return nativeRightCol();
    }
  }

  function countUnits(items) {
    if (!Array.isArray(items)) return 0;
    let total = 0;
    for (const it of items) {
      const n = Number(it?.stackCount) || 1;
      total += Math.max(1, Math.floor(n));
    }
    return total;
  }

  function tradeJunkItems(bridge, nativeJunkItems) {
    try {
      const mode = bridge.mode;
      if (mode !== "Sell" && mode !== "SellMagic") return [];
      const hooks = bridge.hooks ?? {};
      const isEquipped = hooks.isEquipped ?? (() => false);
      const staged = bridge.staged ?? [];
      return (hooks.packItems?.() ?? []).filter(
        (it) =>
          it &&
          isTradeJunk(it, bridge) &&
          !isEquipped(it) &&
          !staged.includes(it) &&
          !bridge.isUnsellable(it) &&
          bridge.merchantAccepts(mode, it, {
            accepts: hooks.accepts,
            enchanted: hooks.enchanted,
          }) &&
          bridge.canStage(it),
      );
    } catch (e) {
      report("tradeJunkItems", e);
      return nativeJunkItems();
    }
  }

  function isLetterOfCreditItem(it) {
    if (!it || typeof it !== "object") return false;
    if (it.templateIndex === 275) return true;
    const name = String(it.shortName || it.name || it.fullName || "");
    if (/letter of credit|аккредитив/i.test(name)) return true;
    return false;
  }

  function consolidateNewLettersOfCredit(entityItems, existingBefore) {
    if (!Array.isArray(entityItems)) return;
    const newLetters = entityItems.filter(
      (it) => isLetterOfCreditItem(it) && !existingBefore.has(it),
    );
    if (newLetters.length <= 1) return;
    const primary = newLetters[0];
    let sum = 0;
    for (const loc of newLetters) {
      sum += Math.max(0, Math.round(Number(loc.value) || 0));
    }
    primary.value = sum;
    for (let i = 1; i < newLetters.length; i++) {
      const idx = entityItems.indexOf(newLetters[i]);
      if (idx >= 0) entityItems.splice(idx, 1);
    }
  }

  function runWithMutedNativeAudio(bridge, fn) {
    const audio = bridge.audio;
    const origPlay = audio?.playOneShot;
    if (audio && typeof origPlay === "function") {
      audio.playOneShot = () => { };
    }
    try {
      return fn();
    } finally {
      if (audio && typeof origPlay === "function") {
        audio.playOneShot = origPlay;
      }
    }
  }

  function executePerUnitSell(bridge, itemsList) {
    const mode = bridge.mode === "SellMagic" ? "SellMagic" : "Sell";
    const hooks = bridge.hooks ?? {};
    const list = Array.isArray(itemsList)
      ? [...itemsList]
      : [...(bridge.staged ?? [])];
    if (!list.length) return 0;

    const entityItems = hooks.entity?.items;
    const existingBefore = new Set(
      Array.isArray(entityItems) ? entityItems : [],
    );
    let unitsSold = 0;
    let totalGold = 0;

    runWithMutedNativeAudio(bridge, () => {
      for (const item of list) {
        if (!item) continue;
        const count = Math.max(1, Math.floor(Number(item.stackCount) || 1));
        const stackTotal = calcItemTradePrice(bridge, mode, item) ?? 0;
        for (let i = 0; i < count; i++) {
          const unitPrice =
            Math.floor((stackTotal * (i + 1)) / count) -
            Math.floor((stackTotal * i) / count);
          const unitItem =
            i === count - 1
              ? Object.assign(item, { stackCount: 1 })
              : { ...item, stackCount: 1 };
          // Automatically accept Letter of Credit if merchant offers it (no dialog popup)
          const payment = bridge.selectPaymentForm(
            unitPrice,
            hooks.weight?.() ?? {},
          );
          const res = hooks.commit?.(mode, [unitItem], unitPrice, payment);
          if (res === false) break;
          unitsSold++;
          totalGold += unitPrice;
        }
      }
    });

    consolidateNewLettersOfCredit(entityItems, existingBefore);
    bridge.staged.length = 0;
    bridge.picked = null;
    bridge.dialog = null;
    tradeState.lastClusterUnits = unitsSold;
    tradeState.lastClusterTotal = totalGold;
    if (unitsSold > 0) {
      playTradeDealSound();
    }
    bridge.repaint();
    return unitsSold;
  }

  function executePerUnitBuy(bridge) {
    const hooks = bridge.hooks ?? {};
    let list = [...(bridge.basket ?? [])];
    const fromShelfPick =
      !list.length && bridge.picked?.side === "remote" && bridge.picked.item
        ? bridge.picked.item
        : null;
    if (fromShelfPick) {
      list = [fromShelfPick];
    }
    if (!list.length) return 0;

    // Total cost check before starting the cluster
    let totalRequired = 0;
    for (const item of list) {
      totalRequired += calcItemTradePrice(bridge, "Buy", item) ?? 0;
    }
    const availableGold = Number(
      hooks.gold?.() ?? hooks.entity?.goldPieces ?? 0,
    );
    if (availableGold < totalRequired) {
      return bridge.native.commit();
    }

    let unitsBought = 0;
    let totalSpent = 0;

    runWithMutedNativeAudio(bridge, () => {
      for (const item of list) {
        if (!item) continue;
        const count = Math.max(1, Math.floor(Number(item.stackCount) || 1));
        const stackTotal = calcItemTradePrice(bridge, "Buy", item) ?? 0;
        for (let i = 0; i < count; i++) {
          const unitPrice =
            Math.floor((stackTotal * (i + 1)) / count) -
            Math.floor((stackTotal * i) / count);
          const currentGold = Number(
            hooks.gold?.() ?? hooks.entity?.goldPieces ?? 0,
          );
          if (currentGold < unitPrice) break;
          const unitItem =
            i === count - 1 && !fromShelfPick
              ? Object.assign(item, { stackCount: 1 })
              : { ...item, stackCount: 1 };
          if (fromShelfPick && i === count - 1) {
            const shelf = hooks.shelfItems?.() ?? [];
            const idx = shelf.indexOf(item);
            if (idx >= 0) shelf.splice(idx, 1);
          }
          const res = hooks.commit?.("Buy", [unitItem], unitPrice, null);
          if (res === false) break;
          unitsBought++;
          totalSpent += unitPrice;
        }
      }
    });

    bridge.basket.length = 0;
    bridge.picked = null;
    bridge.dialog = null;
    tradeState.lastClusterUnits = unitsBought;
    tradeState.lastClusterTotal = totalSpent;
    if (unitsBought > 0) {
      playTradeDealSound();
    }
    bridge.repaint();
    return unitsBought;
  }

  function tradeSellJunk(bridge, nativeSellJunk) {
    try {
      const mode = bridge.mode;
      if (mode !== "Sell" && mode !== "SellMagic") return nativeSellJunk();
      const junkFromPack = tradeJunkItems(bridge, bridge.native.junkItems);
      for (const it of junkFromPack) {
        bridge.prepareLocalForStage(it);
        bridge.moveBetweenArrays(it, bridge.hooks.packItems(), bridge.staged);
      }
      if (!bridge.staged.length) {
        bridge.repaint();
        return 0;
      }
      return executePerUnitSell(bridge, bridge.staged);
    } catch (e) {
      report("tradeSellJunk", e);
      return nativeSellJunk();
    }
  }

  function tradeCommit(bridge, nativeCommit) {
    try {
      if (bridge.mode === "Sell" || bridge.mode === "SellMagic") {
        if (
          !bridge.staged.length &&
          bridge.picked?.side === "local" &&
          bridge.picked.item
        ) {
          bridge.moveLocal(bridge.picked.item);
        }
        if (!bridge.staged.length) return;
        executePerUnitSell(bridge, bridge.staged);
        return;
      }
      if (bridge.mode === "Buy") {
        executePerUnitBuy(bridge);
        return;
      }
      return nativeCommit();
    } catch (e) {
      report("tradeCommit", e);
      return nativeCommit();
    }
  }

  function tradePrimary(bridge, nativePrimary) {
    try {
      if (isTradeMode(bridge.mode)) {
        return tradeCommit(bridge, bridge.native.commit);
      }
      return nativePrimary();
    } catch (e) {
      report("tradePrimary", e);
      return nativePrimary();
    }
  }

  function buildCenterDividerPanel(bridge) {
    const mode = bridge.mode;
    const isBuy = mode === "Buy";
    const activeItems = bridge.activeItems() ?? [];
    const activeUnits = countUnits(activeItems);
    const tilt = activeUnits === 0 ? 0 : isBuy ? -5 : 5;

    const center = node("aside", "dfo-trade-center");

    // 1. Scales of trade emblem + item count ONLY (no total price here, since total price is in the bottom center)
    const emblem = node("div", "dfo-trade-emblem");
    emblem.append(scalesSvg(tilt));
    const badge = node("div", "dfo-trade-scales-caption");
    badge.append(
      node(
        "span",
        "dfo-trade-mode-tag",
        isBuy
          ? ru()
            ? "Покупка у торговца"
            : "Buying goods"
          : ru()
            ? "Продажа торговцу"
            : "Selling goods",
      ),
    );
    const lotLine = node(
      "div",
      "dfo-trade-lot-pill",
      ru()
        ? `Предметов в сделке: ${activeUnits}`
        : `Items in deal: ${activeUnits}`,
    );
    badge.append(lotLine);
    emblem.append(badge);
    center.append(emblem);

    // 2. Panel control buttons right below the scales (and "Sell all junk" in place of the removed hint plaque)
    const controls = node("div", "dfo-trade-controls");
    const picked = bridge.picked;
    const canMove = picked ? bridge.canMovePicked() : false;

    let moveLabel = isBuy
      ? ru()
        ? "← К покупке"
        : "← To buy"
      : ru()
        ? "В продажу →"
        : "To sale →";
    if (picked) {
      if (isBuy) {
        moveLabel =
          picked.side === "remote"
            ? ru()
              ? "← Взять к покупке"
              : "← Add to buy"
            : ru()
              ? "Вернуть на полку →"
              : "Return to shelf →";
      } else {
        moveLabel =
          picked.side === "local"
            ? ru()
              ? "В продажу →"
              : "Stage to sell →"
            : ru()
              ? "← Вернуть в сумку"
              : "← Return to pack";
      }
    }
    const moveBtn = node("button", "act dfo-trade-move", moveLabel);
    moveBtn.type = "button";
    moveBtn.disabled = !canMove;
    moveBtn.onclick = () => {
      if (!bridge.picked) return;
      saveTradeScrolls(bridge);
      const movedItem = bridge.picked.item;
      const movedSide = bridge.picked.side;
      const cat = tradePageOf(movedItem, bridge);
      bridge.movePicked();
      if (movedSide === "remote" && !isBuy) {
        if (tradeState.localTab !== cat) {
          tradeState.localTab = cat;
          bridge.tab = cat;
        }
      } else if (movedSide === "local" && isBuy) {
        if (tradeState.remoteTab !== cat) {
          tradeState.remoteTab = cat;
        }
      }
      bridge.repaint();
    };
    controls.append(moveBtn);

    // Stack quantity field when a stack is selected
    if (picked?.item) {
      const stackCount = Number(picked.item.stackCount) || 1;
      const maxMove =
        stackCount > 1 ? bridge.maxTransferable(picked.item, picked.side) : 0;
      if (maxMove > 1) {
        if (bridge.qty?.item !== picked.item) {
          bridge.qty = { item: picked.item, text: String(maxMove) };
        }
        const qtyWrap = node("div", "dfo-trade-qty");
        qtyWrap.append(
          bridge.createQtyField({
            max: maxMove,
            text: bridge.qty.text,
            onInput: (val) => {
              bridge.qty.text = val;
            },
          }),
        );
        controls.append(qtyWrap);
      }
    }

    // "Украсть" button in Buy mode when allowed
    if (isBuy && !bridge.hooks?.stealRefusal?.()) {
      const stealBtn = node(
        "button",
        "act trade-steal",
        ru() ? "Украсть" : "Steal",
      );
      stealBtn.type = "button";
      stealBtn.disabled = !(bridge.stealCost() > 0);
      stealBtn.onclick = () => bridge.promptSteal();
      controls.append(stealBtn);
    }

    // "Сбросить" / Clear button
    const clearBtn = node(
      "button",
      "act dfo-trade-clear",
      ru() ? "Сбросить выбор" : "Clear",
    );
    clearBtn.type = "button";
    clearBtn.disabled = activeItems.length === 0 && !picked;
    clearBtn.onclick = () => {
      bridge.clear();
      bridge.repaint();
    };
    controls.append(clearBtn);

    // Dedicated "Продать весь хлам" button placed in the center panel where the hint plaque used to be
    if (!isBuy) {
      const junkList = tradeJunkItems(bridge, bridge.native.junkItems);
      const junkUnits = countUnits(junkList);
      const junkBtn = node(
        "button",
        "act sell-junk dfo-trade-junk-btn",
        junkUnits > 0
          ? ru()
            ? `Продать весь хлам (${junkUnits})`
            : `Sell all junk (${junkUnits})`
          : ru()
            ? "Продать весь хлам"
            : "Sell all junk",
      );
      junkBtn.type = "button";
      junkBtn.disabled = junkList.length === 0;
      junkBtn.onclick = () => tradeSellJunk(bridge, bridge.native.sellJunk);
      controls.append(junkBtn);
    }

    center.append(controls);

    // Hidden marker for automated selector compatibility (.trade-win .trade-detail-info) with zero visual box
    const hiddenDetail = node("div", "trade-detail-info");
    hiddenDetail.setAttribute("hidden", "");
    hiddenDetail.style.display = "none";
    center.append(hiddenDetail);

    return center;
  }

  function tradeFooter(bridge, nativeFooter) {
    if (!isTradeMode(bridge.mode)) return nativeFooter();
    try {
      const mode = bridge.mode;
      const isBuy = mode === "Buy";
      const lot = bridge.calcLot();
      const totalPrice = bridge.calcLotTradePrice(lot);
      const playerGold = Number(bridge.hooks?.gold?.() ?? 0);
      const activeUnits = countUnits(bridge.activeItems() ?? []);
      const canSubmit = isBuy
        ? activeUnits > 0 ||
        (bridge.picked?.side === "remote" && !!bridge.picked?.item)
        : (bridge.staged?.length ?? 0) > 0 ||
        (bridge.picked?.side === "local" &&
          !!bridge.picked?.item &&
          !bridge.isUnsellable(bridge.picked.item) &&
          bridge.canStage(bridge.picked.item));

      const foot = node("div", "remoteacts trade-footer dfo-trade-bottom");

      // Left column footer (Under Player's Column)
      const leftFoot = node("div", "dfo-trade-foot-col dfo-trade-foot-player");
      const goldBox = node("div", "trade-fig dfo-trade-gold-box");
      goldBox.append(
        node("small", null, ru() ? "Ваше золото" : "Your gold"),
        (() => {
          const b = node("b", "dfo-trade-gold-val", formatNumber(playerGold));
          b.append(coinSvg());
          return b;
        })(),
      );
      leftFoot.append(goldBox);

      const buyBtn = node(
        "button",
        `act${isBuy ? " primary" : ""} dfo-trade-act-buy`,
        isBuy && activeUnits > 0
          ? ru()
            ? `Купить (${activeUnits})`
            : `Buy (${activeUnits})`
          : ru()
            ? "Купить"
            : "Buy",
      );
      buyBtn.type = "button";
      buyBtn.disabled = !isBuy || !canSubmit;
      buyBtn.onclick = () => {
        if (isBuy) tradeCommit(bridge, bridge.native.commit);
      };
      leftFoot.append(buyBtn);

      // Center footer summary (Under Center Scales Panel)
      const midFoot = node("div", "dfo-trade-foot-center");
      const dealFig = node("div", "trade-fig dfo-trade-deal-box");
      dealFig.append(
        node(
          "small",
          null,
          isBuy
            ? ru()
              ? "К оплате"
              : "To pay"
            : ru()
              ? "Вы получите"
              : "You get",
        ),
        (() => {
          const b = node("b", "dfo-trade-deal-val", formatNumber(totalPrice));
          b.append(coinSvg());
          return b;
        })(),
      );
      midFoot.append(dealFig);

      // Right column footer (Under Merchant's Column)
      const rightFoot = node(
        "div",
        "dfo-trade-foot-col dfo-trade-foot-merchant",
      );
      const merchantInfo = node("div", "trade-fig dfo-trade-merchant-note");
      merchantInfo.append(
        node(
          "small",
          null,
          isBuy
            ? ru()
              ? "Торговая лавка"
              : "Merchant counter"
            : ru()
              ? "К продаже"
              : "Staged to sell",
        ),
        node(
          "b",
          null,
          isBuy
            ? ru()
              ? `Позиций: ${(bridge.hooks?.shelfItems?.() ?? []).length}`
              : `Items: ${(bridge.hooks?.shelfItems?.() ?? []).length}`
            : ru()
              ? `Предметов: ${activeUnits}`
              : `Items: ${activeUnits}`,
        ),
      );
      rightFoot.append(merchantInfo);

      const sellBtn = node(
        "button",
        `act${!isBuy ? " primary" : ""} dfo-trade-act-sell`,
        !isBuy && activeUnits > 0
          ? ru()
            ? `Продать (${activeUnits})`
            : `Sell (${activeUnits})`
          : ru()
            ? "Продать"
            : "Sell",
      );
      sellBtn.type = "button";
      sellBtn.disabled = isBuy || !canSubmit;
      sellBtn.onclick = () => {
        if (!isBuy) tradeCommit(bridge, bridge.native.commit);
      };
      rightFoot.append(sellBtn);

      const hintText = root.__dfoUi
        ? T("svc.trade.stackHint")
        : "Double-click — 1 · Shift+2×click — full stack · Ctrl+Shift+2×click — custom amount";
      const hintBar = node("div", "dfo-trade-stack-hint", hintText);

      foot.append(leftFoot, midFoot, rightFoot, hintBar);
      return foot;
    } catch (e) {
      report("tradeFooter", e);
      return nativeFooter();
    }
  }

  function tradeAfterPaint(bridge) {
    try {
      const host = bridge.host;
      if (!host || !isTradeMode(bridge.mode)) return;
      const win = host.querySelector(".trade-win");
      if (!win) return;
      win.classList.add("dfo-trade-overhaul", "dfo-window-frame");
      win.dataset.tradeMode = bridge.mode;

      // Remove the native bottom .trade-detail strip
      const body = win.querySelector(".trade-body");
      if (body) {
        for (const child of [...body.children]) {
          if (child.classList.contains("trade-detail")) {
            child.remove();
          }
        }
      }

      const packlists = win.querySelector(".packlists");
      if (packlists && !packlists.querySelector(".dfo-trade-center")) {
        const cols = packlists.querySelectorAll(":scope > .packcol");
        const centerPanel = buildCenterDividerPanel(bridge);
        if (cols.length >= 2) {
          packlists.insertBefore(centerPanel, cols[1]);
        } else {
          packlists.append(centerPanel);
        }
      }

      const leftList = win.querySelector(".dfo-trade-col-player .remotelist");
      const rightList = win.querySelector(
        ".dfo-trade-col-merchant .remotelist",
      );
      const restoreScroll = () => {
        if (leftList && tradeState.scrollLeft != null) {
          leftList.scrollTop = tradeState.scrollLeft;
        }
        if (rightList && tradeState.scrollRight != null) {
          rightList.scrollTop = tradeState.scrollRight;
        }
      };
      restoreScroll();
      bridge.syncVirtual?.({ remeasure: true });
      restoreScroll();
      if (typeof root.requestAnimationFrame === "function") {
        root.requestAnimationFrame(restoreScroll);
      }
    } catch (e) {
      report("tradeAfterPaint", e);
    }
  }

  const CSS = `
/* Canonical surface depth regulator synced with [data-plus-theme] (ui-references/backgrounds.css) */
:root{--dfo-bg-scrim:rgba(5,7,10,0.72);--dfo-bg-window:rgba(12,14,18,0.93);--dfo-bg-header:linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.015));--dfo-bg-footer:rgba(0,0,0,0.22);--dfo-bg-panel:rgba(15,17,22,0.92);--dfo-bg-panel-elevated:rgba(23,27,33,0.96);--dfo-bg-well:rgba(8,10,13,0.9);--dfo-bg-input:rgba(4,5,7,0.74);--dfo-bg-button:#1c1f26;--dfo-bg-button-hover:#262a33;--dfo-bg-chip:rgba(12,14,18,0.84);--dfo-bg-row:rgba(16,19,24,0.88);--dfo-bg-row-hover:rgba(38,42,51,0.92);--dfo-bg-row-selected:rgba(78,127,114,0.24);--dfo-bg-dither-img:repeating-conic-gradient(rgba(255,255,255,0.022) 0 25%,transparent 0 50%);--dfo-bg-dither-size:4px 4px;}
:root[data-plus-theme="stone"]{--dfo-bg-window:#51514c;--dfo-bg-panel:#5a5a54;--dfo-bg-panel-elevated:#63635c;--dfo-bg-well:rgba(44,44,40,0.92);--dfo-bg-button:#4a4a45;--dfo-bg-button-hover:#5f5f58;--dfo-bg-chip:rgba(60,60,56,0.9);--dfo-bg-input:rgba(30,30,28,0.75);--dfo-bg-row:rgba(74,74,69,0.88);--dfo-bg-row-hover:rgba(95,95,88,0.94);}
:root[data-plus-theme="iron"]{--dfo-bg-window:#232a33;--dfo-bg-panel:#28303a;--dfo-bg-panel-elevated:#2f3844;--dfo-bg-well:rgba(16,20,26,0.92);--dfo-bg-button:#2c3440;--dfo-bg-button-hover:#36404d;--dfo-bg-chip:rgba(28,34,42,0.9);--dfo-bg-input:rgba(8,10,14,0.75);--dfo-bg-row:rgba(34,41,50,0.88);--dfo-bg-row-hover:rgba(54,64,77,0.94);}
:root[data-plus-theme="ember"]{--dfo-bg-window:#2a1510;--dfo-bg-panel:#301914;--dfo-bg-panel-elevated:#3a1f18;--dfo-bg-well:rgba(18,9,7,0.92);--dfo-bg-button:#3a1d16;--dfo-bg-button-hover:#4a261c;--dfo-bg-chip:rgba(40,20,15,0.9);--dfo-bg-input:rgba(14,6,4,0.75);--dfo-bg-row:rgba(38,19,15,0.88);--dfo-bg-row-hover:rgba(74,38,28,0.94);}
:root[data-plus-theme="forest"]{--dfo-bg-window:#15231a;--dfo-bg-panel:#1a2b20;--dfo-bg-panel-elevated:#203628;--dfo-bg-well:rgba(9,16,12,0.92);--dfo-bg-button:#1f3226;--dfo-bg-button-hover:#284030;--dfo-bg-chip:rgba(20,34,25,0.9);--dfo-bg-input:rgba(5,10,7,0.75);--dfo-bg-row:rgba(20,35,26,0.88);--dfo-bg-row-hover:rgba(40,64,48,0.94);}
:root[data-plus-theme="night"]{--dfo-bg-window:#131a30;--dfo-bg-panel:#182038;--dfo-bg-panel-elevated:#1e2846;--dfo-bg-well:rgba(8,12,24,0.92);--dfo-bg-button:#1c2542;--dfo-bg-button-hover:#263052;--dfo-bg-chip:rgba(20,26,48,0.9);--dfo-bg-input:rgba(5,7,14,0.75);--dfo-bg-row:rgba(20,27,48,0.88);--dfo-bg-row-hover:rgba(38,48,82,0.94);}
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
/* Global FRAME1 applied ONCE on outermost top-level window roots (ui-references/window-frame.css) */
.port-shell.port-bank,.port-shell:has(.port-bank),.port-bank .port-shell{padding:8px 16px !important;}
:is(.port-bank .port-win.px-win,.trade-shell .trade-win.dfo-trade-overhaul){box-sizing:border-box !important;border:2px solid #7d7460 !important;border-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20width%3D'25'%20height%3D'25'%20shape-rendering%3D'crispEdges'%3E%3Crect%20x%3D'0'%20y%3D'0'%20width%3D'25'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'0'%20y%3D'1'%20width%3D'1'%20height%3D'24'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'1'%20y%3D'1'%20width%3D'9'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'10'%20y%3D'1'%20width%3D'1'%20height%3D'5'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'11'%20y%3D'1'%20width%3D'3'%20height%3D'1'%20fill%3D'%23c2b79a'%2F%3E%3Crect%20x%3D'14'%20y%3D'1'%20width%3D'1'%20height%3D'5'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'15'%20y%3D'1'%20width%3D'9'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'24'%20y%3D'1'%20width%3D'1'%20height%3D'24'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'1'%20y%3D'2'%20width%3D'1'%20height%3D'8'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'2'%20y%3D'2'%20width%3D'7'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'9'%20y%3D'2'%20width%3D'1'%20height%3D'4'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'11'%20y%3D'2'%20width%3D'3'%20height%3D'1'%20fill%3D'%239a9079'%2F%3E%3Crect%20x%3D'15'%20y%3D'2'%20width%3D'1'%20height%3D'4'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'16'%20y%3D'2'%20width%3D'7'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'23'%20y%3D'2'%20width%3D'1'%20height%3D'8'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'11'%20y%3D'3'%20width%3D'3'%20height%3D'1'%20fill%3D'%237a7260'%2F%3E%3Crect%20x%3D'2'%20y%3D'4'%20width%3D'2'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'4'%20y%3D'4'%20width%3D'3'%20height%3D'1'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'7'%20y%3D'4'%20width%3D'2'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'11'%20y%3D'4'%20width%3D'3'%20height%3D'1'%20fill%3D'%235a5446'%2F%3E%3Crect%20x%3D'16'%20y%3D'4'%20width%3D'2'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'18'%20y%3D'4'%20width%3D'3'%20height%3D'1'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'21'%20y%3D'4'%20width%3D'2'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'4'%20y%3D'5'%20width%3D'1'%20height%3D'2'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'5'%20y%3D'5'%20width%3D'1'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'6'%20y%3D'5'%20width%3D'1'%20height%3D'2'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'11'%20y%3D'5'%20width%3D'3'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'5'%20width%3D'1'%20height%3D'2'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'19'%20y%3D'5'%20width%3D'1'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'20'%20y%3D'5'%20width%3D'1'%20height%3D'2'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'5'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'7'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'8'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'9'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'10'%20y%3D'6'%20width%3D'5'%20height%3D'1'%20fill%3D'%2316140f'%2F%3E%3Crect%20x%3D'15'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'16'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'17'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'19'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'4'%20y%3D'7'%20width%3D'3'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'7'%20y%3D'7'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'8'%20y%3D'7'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'9'%20y%3D'7'%20width%3D'7'%20height%3D'1'%20fill%3D'%230c0d10'%2F%3E%3Crect%20x%3D'16'%20y%3D'7'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'17'%20y%3D'7'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'18'%20y%3D'7'%20width%3D'3'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'4'%20y%3D'8'%20width%3D'2'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'6'%20y%3D'8'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'7'%20y%3D'8'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'17'%20y%3D'8'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'8'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'19'%20y%3D'8'%20width%3D'2'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'2'%20y%3D'9'%20width%3D'4'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'6'%20y%3D'9'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'7'%20y%3D'9'%20width%3D'1'%20height%3D'7'%20fill%3D'%230c0d10'%2F%3E%3Crect%20x%3D'17'%20y%3D'9'%20width%3D'1'%20height%3D'7'%20fill%3D'%231c1a15'%2F%3E%3Crect%20x%3D'18'%20y%3D'9'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'19'%20y%3D'9'%20width%3D'4'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'1'%20y%3D'10'%20width%3D'5'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'6'%20y%3D'10'%20width%3D'1'%20height%3D'5'%20fill%3D'%2316140f'%2F%3E%3Crect%20x%3D'18'%20y%3D'10'%20width%3D'1'%20height%3D'5'%20fill%3D'%235a5446'%2F%3E%3Crect%20x%3D'19'%20y%3D'10'%20width%3D'5'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'1'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%23c2b79a'%2F%3E%3Crect%20x%3D'2'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%239a9079'%2F%3E%3Crect%20x%3D'3'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%237a7260'%2F%3E%3Crect%20x%3D'4'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%235a5446'%2F%3E%3Crect%20x%3D'5'%20y%3D'11'%20width%3D'1'%20height%3D'4'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'19'%20y%3D'11'%20width%3D'1'%20height%3D'4'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'20'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%234f4838'%2F%3E%3Crect%20x%3D'21'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%23443e31'%2F%3E%3Crect%20x%3D'22'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%233a352a'%2F%3E%3Crect%20x%3D'23'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%2325221b'%2F%3E%3Crect%20x%3D'1'%20y%3D'14'%20width%3D'4'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'20'%20y%3D'14'%20width%3D'4'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'1'%20y%3D'15'%20width%3D'1'%20height%3D'9'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'2'%20y%3D'15'%20width%3D'4'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'6'%20y%3D'15'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'15'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'19'%20y%3D'15'%20width%3D'4'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'23'%20y%3D'15'%20width%3D'1'%20height%3D'9'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'2'%20y%3D'16'%20width%3D'4'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'6'%20y%3D'16'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'7'%20y%3D'16'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'17'%20y%3D'16'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'16'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'19'%20y%3D'16'%20width%3D'4'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'6'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'7'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'8'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'9'%20y%3D'17'%20width%3D'7'%20height%3D'1'%20fill%3D'%231c1a15'%2F%3E%3Crect%20x%3D'16'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'17'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'18'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'2'%20y%3D'18'%20width%3D'2'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'4'%20y%3D'18'%20width%3D'1'%20height%3D'3'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'5'%20y%3D'18'%20width%3D'2'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'7'%20y%3D'18'%20width%3D'1'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'8'%20y%3D'18'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'9'%20y%3D'18'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'10'%20y%3D'18'%20width%3D'5'%20height%3D'1'%20fill%3D'%235a5446'%2F%3E%3Crect%20x%3D'15'%20y%3D'18'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'16'%20y%3D'18'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'17'%20y%3D'18'%20width%3D'1'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'18'%20y%3D'18'%20width%3D'2'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'20'%20y%3D'18'%20width%3D'1'%20height%3D'3'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'21'%20y%3D'18'%20width%3D'2'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'5'%20y%3D'19'%20width%3D'1'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'6'%20y%3D'19'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'8'%20y%3D'19'%20width%3D'1'%20height%3D'4'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'9'%20y%3D'19'%20width%3D'1'%20height%3D'4'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'10'%20y%3D'19'%20width%3D'5'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'15'%20y%3D'19'%20width%3D'1'%20height%3D'4'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'16'%20y%3D'19'%20width%3D'1'%20height%3D'4'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'18'%20y%3D'19'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'19'%20y%3D'19'%20width%3D'1'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'5'%20y%3D'20'%20width%3D'2'%20height%3D'1'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'10'%20y%3D'20'%20width%3D'1'%20height%3D'5'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'11'%20y%3D'20'%20width%3D'3'%20height%3D'1'%20fill%3D'%234f4838'%2F%3E%3Crect%20x%3D'14'%20y%3D'20'%20width%3D'1'%20height%3D'5'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'20'%20width%3D'2'%20height%3D'1'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'4'%20y%3D'21'%20width%3D'3'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'11'%20y%3D'21'%20width%3D'3'%20height%3D'1'%20fill%3D'%23443e31'%2F%3E%3Crect%20x%3D'18'%20y%3D'21'%20width%3D'3'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'11'%20y%3D'22'%20width%3D'3'%20height%3D'1'%20fill%3D'%233a352a'%2F%3E%3Crect%20x%3D'2'%20y%3D'23'%20width%3D'8'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'11'%20y%3D'23'%20width%3D'3'%20height%3D'1'%20fill%3D'%2325221b'%2F%3E%3Crect%20x%3D'15'%20y%3D'23'%20width%3D'8'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'1'%20y%3D'24'%20width%3D'9'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'11'%20y%3D'24'%20width%3D'3'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'15'%20y%3D'24'%20width%3D'9'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3C%2Fsvg%3E") 12 / 12px / 6px stretch !important;background-color:var(--dfo-bg-window,rgba(12,14,18,0.93)) !important;background-image:var(--dfo-bg-dither-img,repeating-conic-gradient(rgba(255,255,255,0.022) 0 25%,transparent 0 50%)) !important;background-size:var(--dfo-bg-dither-size,4px 4px) !important;box-shadow:4px 4px 0 6px rgba(0,0,0,0.42),0 12px 34px rgba(0,0,0,0.78) !important;border-radius:0 !important;outline:none !important;}
:is(.port-bank .port-win.px-win,.trade-shell .trade-win.dfo-trade-overhaul)>.px-corner{display:none !important;}
.port-bank .port-win.px-win{width:min(1080px,96vw) !important;height:auto !important;max-height:calc(100dvh - 16px) !important;display:flex !important;flex-direction:column !important;overflow:visible !important;}
.port-bank .port-inner{display:flex !important;flex-direction:column !important;min-height:0 !important;flex:1 1 auto !important;overflow:hidden !important;background:transparent !important;}
.port-bank .port-head{flex-shrink:0 !important;background-color:rgba(14,16,21,0.94) !important;background-image:linear-gradient(180deg,rgba(62,56,44,0.38) 0%,rgba(24,26,32,0.55) 56%,rgba(10,12,16,0.72) 100%) !important;border-bottom:1px solid #050608 !important;box-shadow:0 1px 0 rgba(163,152,128,0.28),inset 0 1px 0 rgba(255,244,214,0.08) !important;padding:6px 14px 5px !important;text-align:center !important;}
.port-bank .port-title{font-family:'DFO Greengoth',var(--display,Georgia,serif) !important;font-size:19px !important;line-height:1.15 !important;color:#f6e7b0 !important;letter-spacing:0.09em !important;text-indent:0.09em !important;text-transform:uppercase !important;text-shadow:0 2px 0 #000,0 0 6px rgba(0,0,0,0.75) !important;}
.port-bank .port-sub{font-family:'DFO Gabin',var(--data,serif) !important;color:#c9b485 !important;letter-spacing:0.12em !important;text-transform:uppercase !important;font-size:11px !important;line-height:1.15 !important;margin-top:2px !important;}
.port-bank .port-sub::before,.port-bank .port-sub::after{content:' — ';color:rgba(213,178,110,0.55);}
:is(.port-bank .port-body,.trade-win.dfo-trade-overhaul .remotelist){scrollbar-width:thin !important;scrollbar-color:#756346 #0c0e11 !important;}
:is(.port-bank .port-body,.trade-win.dfo-trade-overhaul .remotelist)::-webkit-scrollbar{width:7px;height:7px;}
:is(.port-bank .port-body,.trade-win.dfo-trade-overhaul .remotelist)::-webkit-scrollbar-track{background:#0c0e11;border-left:1px solid rgba(117,99,70,0.2);}
:is(.port-bank .port-body,.trade-win.dfo-trade-overhaul .remotelist)::-webkit-scrollbar-thumb{background:linear-gradient(180deg,#5e4f37,#3e3424);border:1px solid #14171c;border-radius:2px;}
:is(.port-bank .port-body,.trade-win.dfo-trade-overhaul .remotelist)::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg,#7d6949,#544630);}
.port-bank .port-body{flex:1 1 auto !important;min-height:0 !important;overflow-y:auto !important;overscroll-behavior:contain !important;padding:6px 10px !important;gap:6px !important;font-family:'DFO Gabin',var(--data,serif) !important;}
.port-bank .port-foot{flex-shrink:0 !important;display:flex !important;justify-content:center !important;padding:5px 14px 6px !important;border-top:1px solid #050608 !important;box-shadow:inset 0 1px 0 rgba(163,152,128,0.26) !important;background-color:var(--dfo-bg-footer,rgba(0,0,0,0.24)) !important;background-image:none !important;}
.port-bank .port-stats{grid-template-columns:repeat(2,minmax(0,1fr));}
/* Ornate Double-Framed Corner-Bracket Buttons (ui-references/03-controls/C-01-ornate-buttons.js) */
:is(.port-bank .port-btn,.dfo-bank-btn,.dfo-bank-btn-all,.dfo-trade-modal-btn,.dfo-trade-modal-btn-all,.trade-shell .trade-win.dfo-trade-overhaul :is(.sb-top,.dfo-trade-controls,.dfo-trade-bottom,.sb-ask) .act){--dfo-c:#d4b16a;position:relative !important;box-sizing:border-box !important;min-width:0 !important;border-radius:1px !important;border:1px solid #6e5c3e !important;border-top-color:#9e8355 !important;border-bottom-color:#3b301f !important;background:linear-gradient(180deg,#272219 0%,#191510 55%,#120f0b 100%) !important;box-shadow:inset 0 1px 0 rgba(255,224,150,0.14),inset 0 -1px 0 rgba(0,0,0,0.72),0 1px 2px rgba(0,0,0,0.55) !important;color:#f1e6c8 !important;font-family:'DFO Gabin',var(--data,serif) !important;letter-spacing:0.03em !important;text-indent:0 !important;text-transform:none !important;text-shadow:0 1px 0 #000 !important;cursor:pointer !important;transition:filter 120ms ease,transform 80ms ease,border-color 120ms ease !important;}
:is(.port-bank .port-btn,.dfo-bank-btn,.dfo-bank-btn-all,.dfo-trade-modal-btn,.dfo-trade-modal-btn-all,.trade-shell .trade-win.dfo-trade-overhaul :is(.sb-top,.dfo-trade-controls,.dfo-trade-bottom,.sb-ask) .act)::before{content:'' !important;position:absolute !important;inset:2px !important;border:1px solid rgba(213,178,110,0.24) !important;pointer-events:none !important;z-index:1 !important;}
:is(.port-bank .port-btn,.dfo-bank-btn,.dfo-bank-btn-all,.dfo-trade-modal-btn,.dfo-trade-modal-btn-all,.trade-shell .trade-win.dfo-trade-overhaul :is(.sb-top,.dfo-trade-controls,.dfo-trade-bottom,.sb-ask) .act)::after{content:'' !important;position:absolute !important;inset:2px !important;pointer-events:none !important;z-index:1 !important;background:linear-gradient(var(--dfo-c),var(--dfo-c)) top left/5px 1px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) top left/1px 5px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) top right/5px 1px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) top right/1px 5px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) bottom left/5px 1px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) bottom left/1px 5px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) bottom right/5px 1px no-repeat,linear-gradient(var(--dfo-c),var(--dfo-c)) bottom right/1px 5px no-repeat !important;}
:is(.port-bank .port-btn,.dfo-bank-btn,.dfo-bank-btn-all,.dfo-trade-modal-btn,.dfo-trade-modal-btn-all,.trade-shell .trade-win.dfo-trade-overhaul :is(.sb-top,.dfo-trade-controls,.dfo-trade-bottom,.sb-ask) .act):hover:not(:disabled){filter:brightness(1.16) !important;border-color:#9e8355 !important;border-top-color:#d5b26e !important;color:#f6e7b0 !important;text-shadow:0 1px 0 #000 !important;}
:is(.port-bank .port-btn,.dfo-bank-btn,.dfo-bank-btn-all,.dfo-trade-modal-btn,.dfo-trade-modal-btn-all,.trade-shell .trade-win.dfo-trade-overhaul :is(.sb-top,.dfo-trade-controls,.dfo-trade-bottom,.sb-ask) .act):active:not(:disabled){transform:translateY(1px) !important;filter:brightness(0.95) !important;}
:is(.port-bank .port-btn,.dfo-bank-btn,.dfo-bank-btn-all,.dfo-trade-modal-btn,.dfo-trade-modal-btn-all,.trade-shell .trade-win.dfo-trade-overhaul :is(.sb-top,.dfo-trade-controls,.dfo-trade-bottom,.sb-ask) .act):disabled{opacity:0.45 !important;cursor:default !important;filter:grayscale(0.4) !important;color:#b7a889 !important;text-shadow:none !important;}
/* C-01 Primary Gold (Cash LoC, Deposit Gold, Buy Ship, Trade Deal, Confirm) */
:is(.port-bank .port-btn.primary,.port-bank .dfo-bank-scene-split>*:last-child .dfo-bank-scene-half .port-actions .port-btn:not(:disabled),.port-bank .dfo-bank-ships-actions .port-btn:first-child:not(:disabled),.dfo-bank-btn-primary,.dfo-trade-modal-btn.primary,.trade-shell .trade-win.dfo-trade-overhaul :is(.dfo-trade-controls .dfo-trade-move,.dfo-trade-controls .dfo-trade-junk-btn,.dfo-trade-bottom .act.primary,.sb-ask .act.primary):not(:disabled)){--dfo-c:#fde68a;border-color:#a6823f !important;border-top-color:#e4c175 !important;border-bottom-color:#4f3b18 !important;background:linear-gradient(180deg,#4b391a 0%,#2f230e 56%,#1f1709 100%) !important;color:#fde68a !important;}
:is(.port-bank .port-btn.primary,.port-bank .dfo-bank-scene-split>*:last-child .dfo-bank-scene-half .port-actions .port-btn:not(:disabled),.port-bank .dfo-bank-ships-actions .port-btn:first-child:not(:disabled),.dfo-bank-btn-primary,.dfo-trade-modal-btn.primary,.trade-shell .trade-win.dfo-trade-overhaul :is(.dfo-trade-controls .dfo-trade-move,.dfo-trade-controls .dfo-trade-junk-btn,.dfo-trade-bottom .act.primary,.sb-ask .act.primary):not(:disabled))::before{border-color:rgba(253,230,138,0.32) !important;}
:is(.port-bank .port-btn.primary,.port-bank .dfo-bank-scene-split>*:last-child .dfo-bank-scene-half .port-actions .port-btn:not(:disabled),.port-bank .dfo-bank-ships-actions .port-btn:first-child:not(:disabled),.dfo-bank-btn-primary,.dfo-trade-modal-btn.primary,.trade-shell .trade-win.dfo-trade-overhaul :is(.dfo-trade-controls .dfo-trade-move,.dfo-trade-controls .dfo-trade-junk-btn,.dfo-trade-bottom .act.primary,.sb-ask .act.primary):not(:disabled)):hover:not(:disabled){color:#ffffff !important;}
/* C-01 Canonical Window Close Button (1:1 like Inventory .dfo-close-btn with -45deg crimson hatch pattern) */
:is(.port-bank .port-foot .port-btn,.trade-shell .trade-win.dfo-trade-overhaul .sb-top>.act){--dfo-c:#f08a80;border:1px solid !important;border-color:#a1463e #4c1b18 #2d0e0c #782e28 !important;background:repeating-linear-gradient(-45deg,rgba(176,56,48,0.22) 0 4px,rgba(16,7,9,0.34) 4px 8px),linear-gradient(180deg,#3d1618 0%,#250c0e 58%,#160709 100%) !important;box-shadow:0 0 0 1px #050608,inset 0 0 0 1px rgba(240,138,128,0.18),inset 0 1px 0 rgba(255,204,198,0.16) !important;color:#fce0dc !important;}
:is(.port-bank .port-foot .port-btn,.trade-shell .trade-win.dfo-trade-overhaul .sb-top>.act)::before{border-color:rgba(240,138,128,0.28) !important;}
:is(.port-bank .port-foot .port-btn,.trade-shell .trade-win.dfo-trade-overhaul .sb-top>.act):hover:not(:disabled){--dfo-c:#ffb0a7;border-color:#c85a46 !important;background:repeating-linear-gradient(-45deg,rgba(212,78,66,0.28) 0 4px,rgba(22,9,11,0.28) 4px 8px),linear-gradient(180deg,#521d20 0%,#341114 58%,#200a0c 100%) !important;box-shadow:0 0 0 1px #050608,0 0 10px rgba(200,90,70,0.3),inset 0 0 0 1px rgba(255,176,167,0.28) !important;color:#fff0ee !important;}
.port-bank .port-foot .port-btn{min-width:142px !important;height:30px !important;min-height:30px !important;padding:0 22px !important;font-size:13px !important;font-weight:bold !important;letter-spacing:0.06em !important;}
.port-bank .port-foot .port-btn :is(kbd,.port-key,.px-key){display:none !important;}
/* Default Paint L-03 Sub-Panels (Stone-Pewter #9a9079 by default; Silver panel keeps ice-sapphire accent) */
:where(.port-bank :is(.dfo-bank-assets,.dfo-bank-scene-half,.dfo-bank-withdraw-panel,.dfo-bank-silver-panel,.dfo-bank-ships-panel),.trade-shell .trade-win.dfo-trade-overhaul :is(.packcol,.dfo-trade-center)){--dfo-panel-c:#9a9079;--dfo-panel-rgb:154,144,121;--dfo-panel-a1:0.08;--dfo-panel-a2:0.024;--dfo-panel-ha1:0.12;--dfo-panel-ha2:0.025;}
:is(.port-bank :is(.dfo-bank-assets,.dfo-bank-scene-half,.dfo-bank-withdraw-panel,.dfo-bank-silver-panel,.dfo-bank-ships-panel),.trade-shell .trade-win.dfo-trade-overhaul :is(.packcol,.dfo-trade-center)){background-color:var(--dfo-bg-panel,rgba(15,17,22,0.92)) !important;background-image:linear-gradient(180deg,rgba(var(--dfo-panel-rgb),var(--dfo-panel-a1,0.08)) 0,rgba(var(--dfo-panel-rgb),var(--dfo-panel-a2,0.024)) clamp(32px,18%,104px),rgba(var(--dfo-panel-rgb),0) clamp(60px,36%,200px)) !important;border:2px solid !important;border-color:var(--dfo-panel-c) #3a352a #25221b #7a7260 !important;box-shadow:0 0 0 1px #050608,inset 0 0 0 1px rgba(5,6,8,0.75),inset 0 3px 0 -1px rgba(255,255,255,0.04),3px 3px 0 1px rgba(0,0,0,0.4) !important;border-radius:0 !important;}
.port-bank .dfo-bank-silver-panel{--dfo-panel-c:#7dd3fc;--dfo-panel-rgb:125,211,252;--dfo-panel-a1:0.13;--dfo-panel-a2:0.045;--dfo-panel-ha1:0.20;--dfo-panel-ha2:0.04;}
/* F-04 Canonical Thin Brass-on-Obsidian Scrollbars */
:is(.port-bank .port-body,.trade-win.dfo-trade-overhaul .remotelist,.dfo-service-picker .pick-list,.dfo-service-help){scrollbar-width:thin;scrollbar-color:#756346 #0c0e11;}
:is(.port-bank .port-body,.trade-win.dfo-trade-overhaul .remotelist,.dfo-service-picker .pick-list,.dfo-service-help)::-webkit-scrollbar{width:7px;height:7px;}
:is(.port-bank .port-body,.trade-win.dfo-trade-overhaul .remotelist,.dfo-service-picker .pick-list,.dfo-service-help)::-webkit-scrollbar-track{background:#0c0e11;}
:is(.port-bank .port-body,.trade-win.dfo-trade-overhaul .remotelist,.dfo-service-picker .pick-list,.dfo-service-help)::-webkit-scrollbar-thumb{background:linear-gradient(180deg,#5e4f37,#3e3424);border:1px solid #14171c;}
/* Overhauled Bank Layout Styles */
.dfo-bank-yesno-rows{gap:6px !important;}
.dfo-bank-yesno-rows p{margin:0 !important;text-align:center !important;font-size:13.5px !important;line-height:1.4 !important;color:#f6e7b0 !important;}
.dfo-bank-assets{padding:5px 8px 6px !important;gap:6px !important;margin-bottom:0 !important;}
.dfo-bank-assets>.port-stats{grid-template-columns:repeat(4,minmax(0,1fr)) !important;gap:5px 7px !important;margin-bottom:0 !important;padding-bottom:6px !important;border-bottom:1px solid rgba(154,144,121,0.28) !important;}
.dfo-bank-assets>.port-stats:has(>.port-stat:nth-child(5)){grid-template-columns:repeat(5,minmax(0,1fr)) !important;}
.dfo-bank-assets>.port-stats .port-stat{background-color:var(--dfo-bg-chip,rgba(10,12,16,0.9)) !important;background-image:linear-gradient(180deg,rgba(154,144,121,0.06),transparent 65%) !important;border:1px solid rgba(117,99,70,0.52) !important;border-left:3px solid #9a9079 !important;box-shadow:inset 0 0 0 1px rgba(0,0,0,0.75),inset 0 1px 0 rgba(255,255,255,0.04) !important;border-radius:0 !important;padding:3px 8px !important;display:flex !important;flex-direction:column !important;gap:1px !important;}
.dfo-bank-assets>.port-stats .port-stat:nth-child(1),.dfo-bank-assets>.port-stats .port-stat:nth-child(2){border-left-color:#d4aa4f !important;}
.dfo-bank-assets>.port-stats .port-stat dt{font-family:'DFO Gabin',var(--data,serif) !important;font-size:10px !important;text-transform:uppercase !important;letter-spacing:0.07em !important;color:#b7a071 !important;line-height:1.15 !important;}
.dfo-bank-assets>.port-stats .port-stat dd{font-family:'DFO Flexi',var(--data,monospace) !important;font-variant-numeric:tabular-nums !important;max-width:100% !important;text-align:left !important;font-size:13.5px !important;font-weight:bold !important;color:#f5d451 !important;text-shadow:0 1px 0 #000 !important;letter-spacing:0.02em !important;line-height:1.18 !important;}
.dfo-bank-assets>.port-stats .port-stat.warn{border-left-color:#e2574c !important;border-color:rgba(226,87,76,0.52) !important;background-image:linear-gradient(180deg,rgba(226,87,76,0.12),transparent 70%) !important;}
.dfo-bank-assets>.port-stats .port-stat.warn dd{color:#ff9f98 !important;}
.dfo-bank-coin-val{display:inline-flex !important;align-items:center !important;gap:4px !important;font-family:'DFO Flexi',var(--data,monospace) !important;}
.dfo-bank-coin{width:14px !important;height:14px !important;flex:0 0 auto !important;}
.dfo-silver-coin{filter:drop-shadow(0 1px 2px rgba(0,0,0,0.6)) !important;}
.dfo-bank-silver-val{color:#e2e8f0 !important;}
.dfo-bank-coin-sep{font-size:11px !important;color:#b7a889 !important;margin:0 1px !important;font-weight:normal !important;}
.dfo-bank-coin-tail{font-size:12px !important;color:#b7a889 !important;font-weight:normal !important;margin-left:2px !important;}
.dfo-bank-scene-split{display:grid !important;grid-template-columns:1fr 1fr !important;gap:8px !important;align-items:stretch !important;}
.dfo-bank-scene-split>*{min-width:0 !important;display:flex !important;flex-direction:column !important;}
.dfo-bank-scene-split>*>.dfo-bank-scene-half{flex:1 1 auto !important;}
.port-bank .port-group.dfo-bank-scene-half{padding:5px 9px 7px !important;display:grid !important;grid-template-columns:319px minmax(0,1fr) !important;grid-template-rows:auto minmax(0,1fr) auto !important;gap:0 8px !important;align-items:stretch !important;}
.port-bank .dfo-bank-scene-half>.port-heading{grid-column:1/-1 !important;grid-row:1 !important;}
.port-bank .dfo-bank-scene-half>.port-screen,.dfo-bank-silver-panel>.port-screen{box-sizing:content-box !important;width:315px !important;height:255px !important;min-width:315px !important;min-height:255px !important;max-width:315px !important;max-height:255px !important;background-color:var(--dfo-bg-well,rgba(8,10,13,0.9)) !important;border:2px solid !important;border-color:#25221b #7a7260 #9a9079 #3a352a !important;box-shadow:0 0 0 1px #050608,inset 2px 2px 0 rgba(0,0,0,0.5) !important;border-radius:0 !important;overflow:hidden !important;display:flex !important;margin:0 !important;outline:none !important;}
.port-bank .dfo-bank-scene-half>.port-screen{grid-column:1 !important;grid-row:2/span 2 !important;align-self:start !important;justify-self:start !important;}
.port-bank .dfo-bank-scene-half>.port-screen canvas,.port-bank .dfo-bank-scene-half>.port-screen .port-canvas,.dfo-bank-silver-panel>.port-screen canvas,.dfo-bank-silver-panel>.port-screen .port-canvas{width:315px !important;height:255px !important;min-width:315px !important;min-height:255px !important;max-width:315px !important;max-height:255px !important;aspect-ratio:auto !important;border:none !important;display:block !important;}
.port-bank .dfo-bank-scene-half>.port-stats{grid-column:2 !important;grid-row:2 !important;display:flex !important;flex-direction:column !important;gap:5px !important;margin:0 !important;min-width:0 !important;align-content:start !important;}
.port-bank .dfo-bank-scene-half>.port-stats .port-stat{display:flex !important;flex-direction:column !important;align-items:flex-start !important;gap:2px !important;padding:5px 8px !important;background-color:var(--dfo-bg-chip,rgba(10,12,16,0.9)) !important;background-image:linear-gradient(180deg,rgba(154,144,121,0.05),transparent 65%) !important;border:1px solid rgba(117,99,70,0.5) !important;border-left:3px solid #d4aa4f !important;box-shadow:inset 0 0 0 1px rgba(0,0,0,0.75) !important;}
.port-bank .dfo-bank-scene-half>.port-stats dt{color:#b7a071 !important;font-size:10px !important;line-height:1.2 !important;text-transform:uppercase !important;letter-spacing:0.07em !important;font-family:'DFO Gabin',var(--data,serif) !important;}
.port-bank .dfo-bank-scene-half>.port-stats dd{color:#f5d451 !important;font-size:14px !important;line-height:1.2 !important;max-width:100% !important;font-weight:bold !important;font-family:'DFO Flexi',var(--data,monospace) !important;font-variant-numeric:tabular-nums !important;text-shadow:0 1px 0 #000 !important;text-align:left !important;}
.port-bank .dfo-bank-scene-half>.port-actions{grid-column:2 !important;grid-row:3 !important;margin:6px 0 0 0 !important;align-self:end !important;}
.port-bank .dfo-bank-scene-half .port-actions .port-btn{width:100% !important;height:36px !important;min-height:36px !important;padding:0 8px !important;font-size:12.5px !important;line-height:1.2 !important;font-weight:bold !important;letter-spacing:0.04em !important;}
.dfo-bank-main-cols{display:grid !important;grid-template-columns:minmax(0,1fr) minmax(0,1fr) !important;gap:8px !important;align-items:stretch !important;}
.dfo-bank-main-cols>*{min-width:0 !important;display:flex !important;flex-direction:column !important;}
.dfo-bank-main-cols>*>.dfo-bank-withdraw-panel,.dfo-bank-main-cols>*>.dfo-bank-silver-panel{flex:1 1 auto !important;}
.dfo-bank-withdraw-panel{padding:5px 9px 7px !important;display:flex !important;flex-direction:column !important;gap:0 !important;}
.port-bank :is(.dfo-bank-scene-half,.dfo-bank-withdraw-panel,.dfo-bank-silver-panel)>.port-heading{font-family:'DFO Greengoth',var(--display,Georgia,serif) !important;font-size:12.5px !important;text-transform:uppercase !important;letter-spacing:0.07em !important;color:#e7d6a9 !important;margin:-5px -9px 6px -9px !important;padding:5px 11px !important;background-color:rgba(14,17,22,0.65) !important;background-image:linear-gradient(180deg,rgba(var(--dfo-panel-rgb),var(--dfo-panel-ha1,0.12)),rgba(var(--dfo-panel-rgb),var(--dfo-panel-ha2,0.025))),var(--dfo-bg-header,linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.015))) !important;border-bottom:1px solid rgba(var(--dfo-panel-rgb),0.34) !important;box-shadow:0 1px 0 rgba(0,0,0,0.58),inset 0 1px 0 rgba(255,255,255,0.05) !important;text-shadow:0 1px 0 #000 !important;border-radius:0 !important;}
.port-bank :is(.dfo-bank-scene-half,.dfo-bank-withdraw-panel,.dfo-bank-silver-panel)>.port-heading::before{content:'◆ ';font-size:9px !important;vertical-align:1px !important;margin-right:4px !important;color:var(--dfo-panel-c) !important;text-shadow:none !important;}
.dfo-bank-withdraw-subcols{position:relative !important;flex:1 1 auto !important;display:grid !important;grid-template-columns:1fr 1fr !important;gap:18px !important;align-items:stretch !important;}
.dfo-bank-withdraw-subcols::before{content:'' !important;position:absolute !important;left:50% !important;top:4px !important;bottom:4px !important;width:2px !important;transform:translateX(-50%) !important;background:linear-gradient(180deg,transparent 0%,rgba(213,178,110,0.52) 18%,#e6c67e 50%,rgba(213,178,110,0.52) 82%,transparent 100%) !important;box-shadow:-1px 0 0 rgba(5,6,8,0.92),1px 0 0 rgba(5,6,8,0.75) !important;pointer-events:none !important;}
.dfo-bank-withdraw-subcols::after{content:'' !important;position:absolute !important;left:50% !important;top:50% !important;width:6px !important;height:6px !important;transform:translate(-50%,-50%) rotate(45deg) !important;background:#c08a3e !important;border:1px solid #050608 !important;box-shadow:0 0 4px rgba(192,138,62,0.45) !important;pointer-events:none !important;}
.dfo-bank-withdraw-subcols>*{min-width:0 !important;display:flex !important;flex-direction:column !important;height:100% !important;}
.dfo-bank-withdraw-subcols .port-group{box-sizing:border-box !important;min-width:0 !important;display:flex !important;flex-direction:column !important;height:100% !important;gap:6px !important;padding:5px 8px 7px !important;background-color:rgba(11,13,18,0.88) !important;background-image:linear-gradient(180deg,rgba(154,144,121,0.08) 0,rgba(154,144,121,0.022) 44px,transparent 108px) !important;border:2px solid !important;border-color:#9a9079 #3a352a #25221b #7a7260 !important;box-shadow:0 0 0 1px #050608,inset 0 0 0 1px rgba(5,6,8,0.75) !important;border-radius:0 !important;}
.dfo-bank-withdraw-subcols .port-group>.port-heading{font-family:'DFO Greengoth',var(--display,Georgia,serif) !important;font-size:11.5px !important;text-transform:uppercase !important;letter-spacing:0.06em !important;color:#e7d6a9 !important;margin:-5px -8px 2px -8px !important;padding:5px 9px !important;background-color:rgba(14,17,22,0.72) !important;background-image:linear-gradient(180deg,rgba(154,144,121,0.14),rgba(154,144,121,0.03)) !important;border-bottom:1px solid rgba(154,144,121,0.34) !important;box-shadow:0 1px 0 rgba(0,0,0,0.55) !important;text-shadow:0 1px 0 #000 !important;}
.dfo-bank-withdraw-subcols .port-group>.port-heading::before{content:'◆ ';font-size:8px !important;color:#9a9079 !important;vertical-align:1px !important;margin-right:3px !important;text-shadow:none !important;}
.port-actions.dfo-bank-btn-grid{display:grid !important;grid-template-columns:1fr 1fr !important;grid-template-rows:repeat(3,44px) !important;gap:6px !important;}
.port-actions.dfo-bank-btn-grid .port-btn{height:44px !important;min-height:44px !important;padding:0 4px !important;display:flex !important;align-items:center !important;justify-content:center !important;font-size:13.5px !important;font-weight:bold !important;font-family:'DFO Flexi',var(--data,monospace) !important;font-variant-numeric:tabular-nums !important;letter-spacing:0.03em !important;color:#f4e4b8 !important;}
.port-actions.dfo-bank-wide-btn{margin-top:auto !important;padding-top:6px !important;}
.port-bank .port-body .dfo-bank-withdraw-panel .port-actions.dfo-bank-wide-btn .port-btn:not(:disabled){--dfo-c:#fde68a;width:100% !important;height:36px !important;min-height:36px !important;font-size:12.5px !important;font-weight:bold !important;border-color:#9e7d3d !important;border-top-color:#d8b566 !important;background:linear-gradient(180deg,#3d2f17 0%,#261d0e 58%,#191309 100%) !important;color:#f6e7b0 !important;}
.port-actions.dfo-bank-wide-btn .port-btn{width:100% !important;height:36px !important;min-height:36px !important;font-size:12.5px !important;font-weight:bold !important;}
.dfo-bank-silver-panel .port-actions .port-btn{width:100% !important;height:36px !important;min-height:36px !important;font-size:12.5px !important;font-weight:bold !important;}
.dfo-bank-silver-panel{padding:5px 9px 7px !important;display:grid !important;grid-template-columns:319px minmax(0,1fr) !important;grid-template-rows:auto minmax(0,1fr) auto !important;gap:0 8px !important;align-items:stretch !important;}
.dfo-bank-silver-panel>.port-heading{grid-column:1/-1 !important;grid-row:1 !important;}
.dfo-bank-silver-panel>.port-screen{grid-column:1 !important;grid-row:2/span 2 !important;align-self:start !important;justify-self:start !important;}
.dfo-bank-silver-panel>.port-stats{grid-column:2 !important;grid-row:2 !important;display:grid !important;grid-template-columns:1fr !important;gap:4px !important;margin:0 !important;min-width:0 !important;align-content:start !important;}
.dfo-bank-silver-panel>.port-stats .port-stat{display:flex !important;justify-content:space-between !important;align-items:center !important;gap:6px !important;padding:4px 8px !important;min-height:26px !important;background-color:var(--dfo-bg-chip,rgba(10,12,16,0.9)) !important;background-image:linear-gradient(180deg,rgba(125,211,252,0.06),transparent 70%) !important;border:1px solid rgba(117,99,70,0.45) !important;border-left:3px solid #7dd3fc !important;box-shadow:inset 0 0 0 1px rgba(0,0,0,0.75) !important;}
.dfo-bank-silver-panel>.port-stats dt{color:#b7a071 !important;font-size:10px !important;line-height:1.15 !important;text-transform:uppercase !important;letter-spacing:0.05em !important;font-family:'DFO Gabin',var(--data,serif) !important;}
.dfo-bank-silver-panel>.port-stats dd{color:#e2e8f0 !important;font-size:12.5px !important;line-height:1.15 !important;max-width:none !important;white-space:nowrap !important;flex-shrink:0 !important;font-weight:bold !important;font-family:'DFO Flexi',var(--data,monospace) !important;font-variant-numeric:tabular-nums !important;text-shadow:0 1px 0 #000 !important;text-align:right !important;}
.dfo-bank-silver-panel>.port-actions{grid-column:2 !important;grid-row:3 !important;margin:6px 0 0 0 !important;align-self:end !important;}
.port-bank .port-body .dfo-bank-silver-panel .port-actions .port-btn:not(:disabled){--dfo-c:#93c5fd;width:100% !important;height:36px !important;min-height:36px !important;font-size:12.5px !important;font-weight:bold !important;border-color:#4b719f !important;border-top-color:#7dd3fc !important;border-bottom-color:#1e3454 !important;background:linear-gradient(180deg,#243b5c 0%,#16263d 56%,#0f1a2c 100%) !important;color:#e0f2fe !important;}
.port-bank .port-body .dfo-bank-silver-panel .port-actions .port-btn:not(:disabled)::before{border-color:rgba(147,197,253,0.34) !important;}
.port-bank .port-body .dfo-bank-silver-panel .port-actions .port-btn:hover:not(:disabled){border-color:#7dd3fc !important;border-top-color:#bae6fd !important;color:#ffffff !important;}
/* Separate Fleet / Ships Dock Panel below main columns */
.port-bank .dfo-bank-ships-panel{padding:6px 11px !important;display:grid !important;grid-template-columns:auto minmax(150px,1fr) auto !important;align-items:center !important;gap:12px !important;}
.port-bank .dfo-bank-ships-panel>.port-heading{position:relative !important;margin:0 !important;padding:2px 4px 2px 26px !important;background:none !important;border:none !important;box-shadow:none !important;font-family:'DFO Greengoth',var(--display,Georgia,serif) !important;font-size:13px !important;letter-spacing:0.07em !important;color:#e7d6a9 !important;text-transform:uppercase !important;white-space:nowrap !important;text-shadow:0 1px 0 #000 !important;}
.port-bank .dfo-bank-ships-panel>.port-heading::before{content:'' !important;position:absolute !important;left:0 !important;top:50% !important;transform:translateY(-50%) !important;width:20px !important;height:20px !important;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,0.85)) !important;background:no-repeat center/contain url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cdefs%3E%3ClinearGradient id='h' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%23d4a448'/%3E%3Cstop offset='55%25' stop-color='%238c5a20'/%3E%3Cstop offset='100%25' stop-color='%233d240b'/%3E%3C/linearGradient%3E%3ClinearGradient id='s' x1='0' y1='0' x2='0.4' y2='1'%3E%3Cstop offset='0%25' stop-color='%23fef9c3'/%3E%3Cstop offset='55%25' stop-color='%23e7d6a9'/%3E%3Cstop offset='100%25' stop-color='%23a68b5b'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M12 2.4V15.5' stroke='%23f5d451' stroke-width='1.7' stroke-linecap='round'/%3E%3Cpath d='M12.6 3.5L20 12.6H12.6Z' fill='url(%23s)' stroke='%23120c06' stroke-width='0.95' stroke-linejoin='round'/%3E%3Cpath d='M11.4 5.5L5.2 12.6H11.4Z' fill='url(%23s)' stroke='%23120c06' stroke-width='0.95' stroke-linejoin='round' opacity='0.88'/%3E%3Cpath d='M12 2.4L15.6 3.6L12 4.8Z' fill='%23dc2626'/%3E%3Cpath d='M2.4 15.2H21.6L18.8 20.6H5.2Z' fill='url(%23h)' stroke='%230b0704' stroke-width='1.15' stroke-linejoin='round'/%3E%3Cpath d='M4.5 17.5H19.5' stroke='%23fef08a' stroke-width='0.8' opacity='0.65'/%3E%3C/svg%3E") !important;}
.port-bank .dfo-bank-ships-panel>.port-stats{display:flex !important;align-items:center !important;margin:0 !important;min-width:0 !important;}
.port-bank .dfo-bank-ships-panel>.port-stats .port-stat{display:inline-flex !important;align-items:center !important;justify-content:center !important;min-width:136px !important;padding:4px 12px !important;background-color:var(--dfo-bg-chip,rgba(10,12,16,0.9)) !important;background-image:linear-gradient(180deg,rgba(154,144,121,0.06),transparent 70%) !important;border:1px solid rgba(117,99,70,0.52) !important;border-left:3px solid #9a9079 !important;box-shadow:inset 0 0 0 1px rgba(0,0,0,0.75) !important;border-radius:0 !important;}
.port-bank .dfo-bank-ships-panel>.port-stats dt{display:none !important;}
.port-bank .dfo-bank-ships-panel>.port-stats dd{max-width:none !important;text-align:left !important;font-family:'DFO Flexi',var(--data,monospace) !important;font-variant-numeric:tabular-nums !important;font-size:13.5px !important;font-weight:bold !important;color:#f5d451 !important;text-shadow:0 1px 0 #000 !important;white-space:nowrap !important;}
.port-bank .dfo-bank-ships-actions{display:grid !important;grid-template-columns:repeat(2,minmax(160px,auto)) !important;gap:8px !important;margin:0 !important;padding:0 !important;border:none !important;}
.port-bank .dfo-bank-ships-actions .port-btn{min-width:160px !important;height:34px !important;min-height:34px !important;padding:0 16px !important;font-size:12.5px !important;font-weight:bold !important;}
/* Modal Dialog (ui-references/05-overlays-and-feedback/O-02-amount-prompt-modal.js — Default Paint chiseled modal, NO .dfo-window-frame) */
:is(.dfo-bank-modal-backdrop,.dfo-trade-modal-backdrop){position:fixed !important;inset:0 !important;z-index:10000 !important;background:var(--dfo-bg-scrim,rgba(5,7,10,0.78)) !important;display:flex !important;align-items:center !important;justify-content:center !important;padding:16px !important;animation:dfo-bank-fade-in 0.15s ease-out !important;}
@keyframes dfo-bank-fade-in{from{opacity:0;}to{opacity:1;}}
:is(.dfo-bank-modal-box,.dfo-trade-modal-box){width:min(410px,94vw) !important;background-color:var(--dfo-bg-panel-elevated,rgba(23,27,33,0.96)) !important;background-image:none !important;border:2px solid !important;border-color:#9a9079 #3a352a #25221b #7a7260 !important;box-shadow:0 0 0 1px #050608,inset 0 0 0 1px rgba(5,6,8,0.75),0 14px 36px rgba(0,0,0,0.85) !important;border-radius:0 !important;padding:0 !important;overflow:hidden !important;display:flex !important;flex-direction:column !important;gap:0 !important;color:#e9e4d9 !important;font-family:'DFO Gabin',var(--data,serif) !important;animation:dfo-bank-pop-in 0.15s ease-out !important;}
@keyframes dfo-bank-pop-in{from{transform:scale(0.96);opacity:0;}to{transform:scale(1);opacity:1;}}
:is(.dfo-bank-modal-head,.dfo-trade-modal-head){padding:9px 14px !important;background-color:rgba(14,16,21,0.94) !important;background-image:linear-gradient(180deg,rgba(62,56,44,0.38) 0%,rgba(24,26,32,0.55) 56%,rgba(10,12,16,0.72) 100%) !important;border-bottom:1px solid #050608 !important;box-shadow:0 1px 0 rgba(163,152,128,0.28),inset 0 1px 0 rgba(255,244,214,0.08) !important;}
:is(.dfo-bank-modal-head,.dfo-trade-modal-head) h3{margin:0 !important;font-family:'DFO Greengoth',var(--display,Georgia,serif) !important;font-size:15px !important;color:#f6e7b0 !important;text-transform:uppercase !important;letter-spacing:0.06em !important;text-indent:0 !important;text-align:center !important;text-shadow:0 2px 0 #000 !important;}
:is(.dfo-bank-modal-head,.dfo-trade-modal-head) h3::before{content:'◆ ';font-size:10px !important;color:#b7a071 !important;vertical-align:1px !important;margin-right:3px !important;text-shadow:none !important;}
:is(.dfo-bank-modal-sub,.dfo-trade-modal-sub){margin:4px 0 0 !important;font-family:'DFO Gabin',var(--data,serif) !important;font-size:12.5px !important;color:#b7a889 !important;text-align:center !important;line-height:1.35 !important;}
:is(.dfo-bank-modal-body,.dfo-trade-modal-body){padding:12px 14px !important;display:flex !important;flex-direction:column !important;gap:10px !important;}
:is(.dfo-bank-modal-inputrow,.dfo-trade-modal-inputrow){display:flex !important;gap:8px !important;align-items:stretch !important;}
:is(.dfo-bank-modal-input,.dfo-trade-modal-input){flex:1 !important;min-width:0 !important;height:38px !important;background:var(--dfo-bg-input,rgba(4,5,7,0.74)) !important;border:1px solid #6b5839 !important;border-radius:0 !important;color:#f5d451 !important;font-size:16px !important;font-weight:bold !important;font-family:'DFO Flexi',var(--data,monospace) !important;font-variant-numeric:tabular-nums !important;padding:0 12px !important;outline:none !important;letter-spacing:0.04em !important;box-shadow:inset 0 2px 5px rgba(0,0,0,0.7) !important;}
:is(.dfo-bank-modal-input,.dfo-trade-modal-input):focus{border-color:#d5b26e !important;box-shadow:inset 0 0 0 1px rgba(213,178,110,0.35),inset 0 2px 5px rgba(0,0,0,0.7) !important;}
:is(.dfo-bank-btn-all,.dfo-trade-modal-btn-all){flex:0 0 auto !important;height:38px !important;padding:0 14px !important;font-size:13px !important;font-weight:bold !important;white-space:nowrap !important;}
:is(.dfo-bank-modal-foot,.dfo-trade-modal-foot){display:flex !important;gap:8px !important;justify-content:flex-end !important;padding:8px 14px 11px !important;margin:0 !important;border-top:1px solid rgba(117,99,70,0.32) !important;background:var(--dfo-bg-footer,rgba(0,0,0,0.22)) !important;}
:is(.dfo-bank-btn,.dfo-trade-modal-btn){height:34px !important;min-height:34px !important;padding:0 18px !important;font-size:13px !important;font-weight:bold !important;}
.port-spellmaker .port-win.dfo-effect-editor{width:min(1020px,96vw);}.dfo-service-description{padding:12px 16px;border:1px solid #5c5444;border-top:2px solid #9a9079;background-color:var(--dfo-bg-panel,rgba(15,17,22,0.92));background-image:linear-gradient(180deg,rgba(154,144,121,0.07),transparent 64px);}
.dfo-service-description .port-text,.dfo-service-description .port-text p{font-size:14px;line-height:1.4;}.dfo-service-description .port-stats{grid-template-columns:repeat(auto-fit,minmax(220px,1fr));}
.dfo-service-formulas{gap:2px;padding-top:6px;border-top:1px solid #484432;}.dfo-service-formulas .port-heading{font-size:14px;}
.port-spellmaker .port-group.port-spins{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 18px;}.port-spellmaker .port-spins>.port-heading{grid-column:1/-1;}.port-spellmaker .port-spin{grid-template-columns:minmax(100px,1fr) 32px 54px 32px;gap:5px;}.port-spellmaker .port-spin.off{display:none;}
.port-itemmaker .port-win.px-win{width:min(1120px,96vw);}.port-itemmaker .port-tiles:not(.list){grid-template-columns:repeat(auto-fill,64px);}.port-itemmaker .port-tile:not(.list .port-tile){width:64px;height:64px;}
.pick-shell .pick-win.px-win.dfo-service-picker{width:min(1100px,96vw);max-width:none;max-height:calc(100dvh - 40px);display:grid;grid-template-columns:minmax(240px,.85fr) minmax(360px,1.15fr);grid-template-rows:auto minmax(0,1fr) auto;gap:0;}
.dfo-service-picker-title{grid-column:1/-1;margin:0;padding:14px 22px;font-size:calc(20px + var(--dfo-title-step,0px));letter-spacing:.06em;border-bottom:1px solid #050608;box-shadow:0 1px 0 rgba(163,152,128,0.28),inset 0 1px 0 rgba(255,244,214,0.08);background-color:rgba(14,16,21,0.94);background-image:linear-gradient(180deg,rgba(62,56,44,0.38) 0%,rgba(24,26,32,0.55) 56%,rgba(10,12,16,0.72) 100%);text-shadow:0 2px 0 #000;}
.dfo-service-picker-title::before{content:'◆ ';font-size:12px;color:#b7a071;vertical-align:2px;margin-right:4px;}
.dfo-service-picker .pick-list{max-height:700px;min-height:250px;overflow-y:auto;min-width:0;}.dfo-service-picker .pick-row{font-size:15px;line-height:1.35;letter-spacing:.015em;padding:10px 12px;white-space:normal;}.dfo-service-picker .pick-label{min-width:0;overflow-wrap:break-word;}
.dfo-service-picker .dlg-acts{grid-column:1/-1;}.dfo-service-help{padding:16px 20px;min-width:0;overflow-y:auto;border-left:1px solid rgba(154,144,121,0.34);background-image:linear-gradient(180deg,rgba(154,144,121,0.06) 0%,transparent 120px);color:#e7e1d3;font-size:15px;line-height:1.5;}
.dfo-service-help-title{font-size:calc(19px + var(--dfo-title-step,0px));letter-spacing:.03em;line-height:1.3;margin:0 0 12px;padding-bottom:8px;border-bottom:1px solid rgba(154,144,121,0.30);color:#f6e7b0;text-shadow:0 1px 0 #000;}.dfo-service-help-title::before{content:'◆ ';font-size:10px;color:#9a9079;vertical-align:2px;margin-right:4px;}.dfo-service-help p{white-space:normal;overflow-wrap:break-word;margin:0 0 11px;}.dfo-service-help-stat{color:#c0b797;}.dfo-service-help-stat strong{color:#f1e7c7;font-weight:400;}.dfo-service-help-formula{padding:8px 11px;background:rgba(8,10,14,0.72);border:1px solid rgba(154,144,121,0.34);border-left:3px solid #9a9079;color:#e9e4d9;font-family:'DFO Flexi',monospace;font-size:13.5px;}.dfo-service-help-note{font-size:13px;line-height:1.4;color:#bcb5a4;}
/* NPC Trade Window Overhaul (Buy / Sell / SellMagic) — aligned with ui-references/ */
.trade-shell{background:var(--dfo-bg-scrim,rgba(5,7,10,0.72)) !important;}
.trade-shell .trade-win.px-win{width:min(1320px,96vw) !important;height:min(860px,calc(100dvh - 32px)) !important;max-height:calc(100dvh - 32px) !important;display:flex !important;flex-direction:column !important;overflow:hidden !important;font-family:'DFO Gabin',var(--data,serif) !important;color:#e9e4d9 !important;}
.trade-shell :is(.sb-top,.packfoot,.trade-footer){flex-shrink:0 !important;}
.trade-shell .trade-win.dfo-trade-overhaul>.sb-top{display:grid !important;grid-template-columns:1fr auto 1fr !important;align-items:center !important;gap:12px !important;padding:9px 14px !important;background-color:rgba(14,16,21,0.94) !important;background-image:linear-gradient(180deg,rgba(62,56,44,0.38) 0%,rgba(24,26,32,0.55) 56%,rgba(10,12,16,0.72) 100%) !important;border-bottom:1px solid #050608 !important;box-shadow:0 1px 0 rgba(163,152,128,0.28),inset 0 1px 0 rgba(255,244,214,0.08) !important;}
.trade-shell .trade-win.dfo-trade-overhaul .sb-top .trade-view{display:inline-flex !important;align-items:center !important;gap:6px !important;justify-self:start !important;}
.trade-shell .trade-win.dfo-trade-overhaul .sb-top .trade-view .act{justify-self:auto !important;min-height:28px !important;height:28px !important;padding:0 12px !important;font-size:12px !important;line-height:1.2 !important;}
.trade-shell .trade-win.dfo-trade-overhaul .sb-top .trade-view .act.on{--dfo-c:#fde68a;border-color:#c08a3e !important;border-top-color:#e4c175 !important;border-bottom-color:#5a4220 !important;background:linear-gradient(180deg,#4b391a 0%,#2f230e 56%,#1f1709 100%) !important;color:#fde68a !important;}
.trade-shell .trade-win.dfo-trade-overhaul .sb-top .trade-view .act.on::before{border-color:rgba(253,230,138,0.32) !important;}
.trade-shell .trade-win.dfo-trade-overhaul .sb-top>.act{justify-self:end !important;min-width:98px !important;min-height:28px !important;height:28px !important;padding:0 14px !important;font-size:12px !important;font-weight:bold !important;}
.trade-shell .sb-who{min-width:0;text-align:center !important;}
.trade-shell .sb-who h2{margin:0 !important;font-family:'DFO Greengoth',var(--display,Georgia,serif) !important;font-size:calc(19px + var(--dfo-title-step,0px)) !important;letter-spacing:0.07em !important;text-indent:0 !important;text-transform:uppercase !important;line-height:1.2 !important;white-space:normal !important;color:#f6e7b0 !important;text-shadow:0 2px 0 #000,0 0 6px rgba(0,0,0,0.75) !important;}
.trade-shell .trade-body{flex:1 1 auto !important;min-height:0 !important;display:flex !important;flex-direction:column !important;overflow:hidden !important;padding:9px 11px !important;background:transparent !important;}
.trade-win.dfo-trade-overhaul .packlists{flex:1 1 auto !important;min-height:0 !important;display:grid !important;grid-template-columns:minmax(0,1fr) 236px minmax(0,1fr) !important;gap:10px !important;align-items:stretch !important;background:none !important;}
.trade-win.dfo-trade-overhaul .packcol{min-height:0 !important;display:flex !important;flex-direction:column !important;padding:0 !important;gap:0 !important;overflow:hidden !important;}
.trade-win.dfo-trade-overhaul .packcol>.remotehead{flex:0 0 auto !important;display:flex !important;flex-direction:row !important;align-items:center !important;justify-content:space-between !important;margin:0 !important;padding:6px 11px !important;background-color:rgba(14,17,22,0.68) !important;background-image:linear-gradient(180deg,rgba(var(--dfo-panel-rgb),0.12),rgba(var(--dfo-panel-rgb),0.025)),var(--dfo-bg-header,linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.015))) !important;border-top:0 !important;border-bottom:1px solid rgba(var(--dfo-panel-rgb),0.32) !important;box-shadow:0 1px 0 rgba(0,0,0,0.58),inset 0 1px 0 rgba(255,255,255,0.05) !important;text-align:left !important;}
.trade-win.dfo-trade-overhaul .packcol>.remotehead .remotewho{display:flex !important;flex-direction:row !important;justify-content:space-between !important;align-items:center !important;width:100% !important;gap:8px !important;text-align:left !important;}
.trade-win.dfo-trade-overhaul .packcol>.remotehead h3{margin:0 !important;font-family:'DFO Greengoth',var(--display,Georgia,serif) !important;font-size:13px !important;letter-spacing:0.07em !important;text-indent:0 !important;text-transform:uppercase !important;color:#e7d6a9 !important;text-shadow:0 1px 0 #000 !important;}
.trade-win.dfo-trade-overhaul .packcol>.remotehead h3::before{content:'◆ ';font-size:9px !important;color:#b7a071 !important;vertical-align:1px !important;margin-right:4px !important;text-shadow:none !important;}
.trade-win.dfo-trade-overhaul .packcol>.remotehead .meta{margin:0 !important;padding:1px 8px !important;background:rgba(8,10,14,0.82) !important;border:1px solid rgba(154,144,121,0.45) !important;font-family:'DFO Gabin',var(--data,serif) !important;font-size:10.5px !important;letter-spacing:0.05em !important;text-indent:0 !important;text-transform:uppercase !important;color:#e7d6a9 !important;white-space:nowrap !important;}
/* Uniform 3x3 Category Tabs (.dfo-tabs aligned — strictly identical width and 38px height in all states) */
.trade-win.dfo-trade-overhaul .dfo-trade-cats{flex:0 0 auto !important;padding:6px 7px !important;background:rgba(8,10,14,0.42) !important;border-bottom:1px solid rgba(var(--dfo-panel-rgb),0.24) !important;box-shadow:0 1px 0 rgba(0,0,0,0.6) !important;}
.trade-win.dfo-trade-overhaul .dfo-trade-cats>.packtabs{display:grid !important;grid-template-columns:repeat(3,minmax(0,1fr)) !important;grid-template-rows:repeat(3,38px) !important;grid-auto-rows:38px !important;gap:5px !important;padding:0 !important;margin:0 !important;border:0 !important;align-items:stretch !important;}
.trade-win.dfo-trade-overhaul .dfo-trade-cats .packtab{box-sizing:border-box !important;width:100% !important;height:38px !important;min-height:38px !important;max-height:38px !important;margin:0 !important;padding:4px 9px !important;display:flex !important;flex-direction:row !important;justify-content:space-between !important;align-items:center !important;gap:4px !important;min-width:0 !important;font-family:'DFO Gabin',var(--data,serif) !important;font-size:12px !important;line-height:1.35 !important;letter-spacing:0.025em !important;text-indent:0 !important;text-transform:none !important;text-shadow:0 1px 0 #000 !important;white-space:nowrap !important;overflow:hidden !important;border-radius:1px !important;background:linear-gradient(180deg,rgba(34,38,48,0.88),rgba(19,22,28,0.94)) !important;border:1px solid rgba(117,99,70,0.48) !important;color:#b2a78e !important;box-shadow:inset 0 1px 0 rgba(255,255,255,0.05),inset 0 -1px 0 rgba(0,0,0,0.6) !important;translate:none !important;transform:none !important;cursor:pointer !important;transition:background-color 120ms ease,border-color 120ms ease,color 120ms ease !important;}
.trade-win.dfo-trade-overhaul .dfo-trade-cats .packtab::before,.trade-win.dfo-trade-overhaul .dfo-trade-cats .packtab::after{display:none !important;content:none !important;}
.trade-win.dfo-trade-overhaul .dfo-trade-cats .packtab:hover{background:linear-gradient(180deg,rgba(48,50,58,0.92),rgba(26,28,34,0.96)) !important;border-color:rgba(213,178,110,0.68) !important;color:#f6e7b0 !important;}
.trade-win.dfo-trade-overhaul .dfo-trade-cats .packtab.on{background-color:var(--dfo-bg-button-hover,#262a33) !important;background-image:linear-gradient(180deg,rgba(192,138,62,0.22),rgba(138,105,43,0.10)) !important;border-color:#c9a662 !important;color:#f6e7b0 !important;box-shadow:inset 0 -2px 0 #d5b26e,inset 0 1px 0 rgba(255,224,150,0.18) !important;}
.trade-win.dfo-trade-overhaul .dfo-trade-cats .packtab.empty:not(.on){opacity:0.55 !important;}
.trade-win.dfo-trade-overhaul .dfo-trade-cats .packtab .dfo-tab-label{flex:1 1 auto;min-width:0;padding-block:2px;overflow-x:hidden;overflow-y:visible;text-overflow:ellipsis;white-space:nowrap;text-align:left;line-height:1.35;}
.trade-win.dfo-trade-overhaul .dfo-trade-cats .packtab .count{flex:0 0 auto;margin-left:4px;padding-block:2px;font-family:'DFO Flexi',var(--data,monospace) !important;font-variant-numeric:tabular-nums !important;font-size:11.5px;line-height:1.35;color:#a89b7e;}
.trade-win.dfo-trade-overhaul .dfo-trade-cats .packtab.on .count{color:#f5d451 !important;}
/* Recessed Well Frame for Lists & Scales Chamber (ui-references/window-frame.css .dfo-well-frame) */
.trade-win.dfo-trade-overhaul .remotelist,.dfo-trade-emblem{background-color:var(--dfo-bg-well,rgba(8,10,13,0.9)) !important;border:2px solid !important;border-color:#25221b #7a7260 #9a9079 #3a352a !important;box-shadow:0 0 0 1px #050608,inset 2px 2px 0 rgba(0,0,0,0.5) !important;border-radius:0 !important;}
.trade-win.dfo-trade-overhaul .remotelist{flex:1 1 auto !important;min-height:0 !important;margin:6px !important;padding:0 !important;overflow-y:auto !important;overscroll-behavior:contain !important;}
.trade-win.dfo-trade-overhaul .remotelist>.packempty{margin:0 !important;padding:24px 16px !important;text-align:center !important;font-family:'DFO Gabin',var(--data,serif) !important;font-size:13px !important;color:#a89f88 !important;line-height:1.45 !important;}
/* Center Divider Panel with Scales of Trade & Controls */
.dfo-trade-center{display:flex !important;flex-direction:column !important;gap:9px !important;min-height:0 !important;padding:8px !important;}
.dfo-trade-emblem{display:flex !important;flex-direction:column !important;align-items:center !important;gap:7px !important;padding:11px 8px 11px !important;background-image:radial-gradient(circle at 50% 38%,rgba(154,144,121,0.12),rgba(154,144,121,0.03) 48%,transparent 76%) !important;}
.dfo-trade-scales{width:132px;height:100px;overflow:visible;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.8));}
.dfo-trade-scales .dfo-scales-beam{transition:transform 0.25s ease-out;}
.dfo-trade-scales-caption{display:flex;flex-direction:column;align-items:center;gap:5px;width:100%;text-align:center;}
.dfo-trade-mode-tag{font-family:'DFO Greengoth',var(--display,Georgia,serif) !important;font-size:11px !important;letter-spacing:0.08em !important;text-transform:uppercase !important;color:#e7d6a9 !important;text-shadow:0 1px 0 #000 !important;}
.dfo-trade-mode-tag::before{content:'◆ ';font-size:8px !important;color:#b7a071 !important;vertical-align:1px !important;}
.dfo-trade-lot-pill{display:inline-flex !important;align-items:center !important;justify-content:center !important;padding:3px 11px !important;border:1px solid rgba(154,144,121,0.46) !important;background:rgba(8,10,14,0.86) !important;box-shadow:inset 0 0 0 1px rgba(0,0,0,0.75) !important;border-radius:1px !important;font-family:'DFO Gabin',var(--data,serif) !important;font-size:11.5px !important;letter-spacing:0.04em !important;color:#e7d6a9 !important;}
.dfo-trade-controls{display:flex !important;flex-direction:column !important;gap:7px !important;flex:1 1 auto !important;}
.dfo-trade-controls .act{width:100% !important;min-height:34px !important;padding:6px 10px !important;font-size:12.5px !important;font-weight:bold !important;display:inline-flex !important;align-items:center !important;justify-content:center !important;text-align:center !important;white-space:normal !important;line-height:1.25 !important;}
.trade-shell .trade-win.dfo-trade-overhaul .dfo-trade-controls .act.trade-steal:not(:disabled){--dfo-c:#ff9f98;border-color:#8f3730 !important;border-top-color:#c9564c !important;border-bottom-color:#3f1512 !important;background:linear-gradient(180deg,#4c1b18 0%,#2d110f 56%,#1c0a09 100%) !important;color:#fecaca !important;}
.trade-shell .trade-win.dfo-trade-overhaul .dfo-trade-controls .act.trade-steal:not(:disabled)::before{border-color:rgba(255,159,152,0.3) !important;}
.trade-shell .trade-win.dfo-trade-overhaul .dfo-trade-controls .act.trade-steal:hover:not(:disabled){border-color:#c9564c !important;border-top-color:#ff8a76 !important;color:#fff3ee !important;}
.dfo-trade-controls .dfo-trade-junk-btn{margin-top:auto !important;min-height:38px !important;padding:7px 10px !important;font-size:12.5px !important;letter-spacing:0.04em !important;}
.dfo-trade-qty{display:flex !important;justify-content:center !important;padding:2px 0 !important;}
.trade-shell .dfo-trade-qty .qtyfield{display:inline-flex !important;align-items:center !important;gap:6px !important;font-family:'DFO Gabin',var(--data,serif) !important;font-size:12px !important;color:#b7a071 !important;}
.trade-shell .dfo-trade-qty .qtyfield input{width:68px !important;min-height:32px !important;height:32px !important;padding:0 8px !important;background:var(--dfo-bg-input,rgba(4,5,7,0.74)) !important;border:1px solid #6b5839 !important;border-radius:0 !important;color:#f5d451 !important;font-family:'DFO Flexi',var(--data,monospace) !important;font-variant-numeric:tabular-nums !important;font-size:14px !important;font-weight:bold !important;text-align:center !important;box-shadow:inset 0 2px 5px rgba(0,0,0,0.7) !important;}
.trade-shell .dfo-trade-qty .qtyfield input:focus,.trade-shell .dfo-trade-qty .qtyfield input:focus-visible{border-color:#d5b26e !important;box-shadow:inset 0 0 0 1px rgba(213,178,110,0.35),inset 0 2px 5px rgba(0,0,0,0.7) !important;outline:none !important;}
/* Bottom Action Bar under Columns (D-03 Resource Chips + C-01 Ornate CTAs) */
.trade-footer.dfo-trade-bottom{display:grid !important;grid-template-columns:minmax(0,1fr) 236px minmax(0,1fr) !important;gap:6px 10px !important;align-items:center !important;padding:8px 11px 6px !important;border-top:1px solid rgba(213,178,110,0.28) !important;box-shadow:inset 0 1px 0 rgba(255,255,255,0.04) !important;background-color:var(--dfo-bg-footer,rgba(0,0,0,0.26)) !important;background-image:none !important;}
.dfo-trade-foot-col{display:flex !important;align-items:center !important;justify-content:space-between !important;gap:10px !important;min-width:0 !important;}
.dfo-trade-foot-center{display:flex !important;align-items:stretch !important;justify-content:center !important;min-width:0 !important;}
.dfo-trade-bottom .trade-fig{display:flex !important;flex-direction:column !important;gap:2px !important;padding:5px 11px !important;background-color:var(--dfo-bg-chip,rgba(10,12,16,0.9)) !important;background-image:linear-gradient(180deg,rgba(154,144,121,0.06),transparent 65%) !important;border:1px solid rgba(117,99,70,0.52) !important;border-left:3px solid #d4aa4f !important;box-shadow:inset 0 0 0 1px rgba(0,0,0,0.75) !important;border-radius:0 !important;}
.dfo-trade-foot-center .dfo-trade-deal-box{width:100% !important;align-items:center !important;text-align:center !important;border-left-color:#d4aa4f !important;}
.dfo-trade-bottom .dfo-trade-merchant-note{border-left-color:#9a9079 !important;}
.dfo-trade-bottom .trade-fig small{font-family:'DFO Gabin',var(--data,serif) !important;font-size:10px !important;letter-spacing:0.07em !important;text-transform:uppercase !important;color:#b7a071 !important;line-height:1.15 !important;}
.dfo-trade-bottom .trade-fig b{display:inline-flex !important;align-items:center !important;gap:5px !important;font-family:'DFO Flexi',var(--data,monospace) !important;font-variant-numeric:tabular-nums !important;font-size:15px !important;font-weight:bold !important;color:#f5d451 !important;text-shadow:0 1px 0 #000 !important;line-height:1.2 !important;}
.dfo-trade-bottom .dfo-trade-merchant-note b{color:#e9e4d9 !important;}
.dfo-trade-bottom .trade-fig b .dfo-item-coin{width:15px !important;height:15px !important;filter:drop-shadow(0 1px 1px rgba(0,0,0,0.75)) !important;}
.dfo-trade-bottom .act{min-width:170px !important;min-height:38px !important;height:38px !important;padding:0 18px !important;font-size:13.5px !important;font-weight:bold !important;letter-spacing:0.05em !important;}
.dfo-trade-stack-hint{grid-column:1/-1 !important;text-align:center !important;font-family:'DFO Gabin',var(--data,serif) !important;font-size:11.5px !important;line-height:1.25 !important;letter-spacing:0.025em !important;color:#8e8676 !important;padding-top:4px !important;border-top:1px solid rgba(117,99,70,0.22) !important;user-select:none !important;}
.trade-shell .trade-win.dfo-trade-overhaul .sb-ask{background:var(--dfo-bg-scrim,rgba(5,7,10,0.78)) !important;}
.trade-shell .trade-win.dfo-trade-overhaul .sb-ask .card{background:var(--dfo-bg-panel-elevated,rgba(23,27,33,0.96)) !important;border:2px solid !important;border-color:#9a9079 #3a352a #25221b #7a7260 !important;box-shadow:0 0 0 1px #050608,inset 0 0 0 1px rgba(5,6,8,0.75),0 14px 36px rgba(0,0,0,0.85) !important;border-radius:0 !important;}
.trade-shell .trade-win.dfo-trade-overhaul .sb-ask .act{min-width:96px !important;min-height:34px !important;padding:0 16px !important;font-size:13px !important;font-weight:bold !important;}
/* Item card-row dress inside .trade-win (List view & Grid/Pictures view, backgrounds.css synced) */
.trade-win .itemrow.dfo-item-row{--dfo-row-rar:#827a68;gap:10px !important;padding:7px 12px 7px 9px !important;background:var(--dfo-bg-row,rgba(16,19,24,0.88)) !important;border:0 !important;border-left:3px solid var(--dfo-row-rar) !important;border-bottom:1px solid #2c2820 !important;box-shadow:inset 0 -1px 0 #000 !important;font-family:'DFO Gabin',var(--data,serif) !important;text-shadow:none !important;transition:background-color 110ms ease !important;}
.trade-win .itemrow.dfo-item-row[data-rarity="magic"]{--dfo-row-rar:#6f9ee8;}
.trade-win .itemrow.dfo-item-row[data-rarity="rare"]{--dfo-row-rar:#e4c34f;}
.trade-win .itemrow.dfo-item-row[data-rarity="legendary"]{--dfo-row-rar:#e07a2e;}
.trade-win .itemrow.dfo-item-row[data-rarity="aetheric"]{--dfo-row-rar:#bfe8ff;}
.trade-win .itemrow.dfo-item-row[data-rarity="artifact"]{--dfo-row-rar:#b57bee;}
.trade-win .itemrow.dfo-item-row[data-rarity="gilded"]{--dfo-row-rar:#ff3b4a;}
.trade-win .itemrow.dfo-item-row:hover,.trade-win .itemrow.dfo-item-row:focus-visible{background:var(--dfo-bg-row-hover,rgba(38,42,51,0.92)) !important;}
.trade-win .itemrow.dfo-item-row.on,.trade-win .itemrow.dfo-item-row.picked{background:var(--dfo-bg-row-selected,rgba(78,127,114,0.24)) !important;box-shadow:inset 0 -1px 0 #000,inset 0 0 0 1px rgba(213,178,110,0.62) !important;}
.trade-win .itemrow.dfo-item-row.dfo-staged-item{background:rgba(199,161,84,0.11) !important;box-shadow:inset 0 -1px 0 #000,inset -2px 0 0 rgba(213,178,110,0.45) !important;}
.trade-win .itemrow.dfo-item-row .tile{box-shadow:inset 0 0 0 1px #3a3428,0 0 0 1px #050608 !important;background:var(--dfo-bg-well,rgba(8,10,13,0.9)) !important;}
.trade-win .itemrow.dfo-item-row .itemname{gap:3px;min-width:0;}
.trade-win .itemrow.dfo-item-row .itemname>span:first-child{font-family:'DFO Greengoth',var(--display,Georgia,serif);font-size:15px;line-height:1.2;}
.trade-win .itemrow.dfo-item-row .itemname>small.dfo-row-sub{display:flex;align-items:baseline;gap:0 7px;min-width:0;overflow:hidden;white-space:nowrap;font:11px/1.25 'DFO Gabin',var(--data,serif);letter-spacing:.06em;text-transform:uppercase;color:#b7a071;}
.trade-win .itemrow.dfo-item-row .itemwt.dfo-row-price{display:flex;align-items:center;gap:5px;flex:0 0 auto;color:#f5d451;font-size:inherit;min-width:auto;font-family:'DFO Flexi',var(--data,monospace);font-variant-numeric:tabular-nums;}
.trade-win .itemrow.dfo-item-row .dfo-row-price>.dfo-item-price-value{font-size:15px;}
.trade-win .itemrow.dfo-item-row .dfo-row-price>.dfo-item-coin{width:14px;height:14px;filter:drop-shadow(0 1px 1px rgba(0,0,0,0.75));}
/* Grid / Pictures view (.trade-shell[data-view="grid"]) card tiles */
.trade-shell[data-view="grid"] .trade-win .remotelist{padding:8px !important;gap:8px !important;align-content:start !important;}
.trade-shell[data-view="grid"] .trade-win .itemrow.dfo-item-row{box-sizing:border-box !important;display:flex !important;flex-direction:column !important;align-items:center !important;justify-content:flex-start !important;padding:10px 8px 8px !important;gap:6px !important;min-height:126px !important;background:var(--dfo-bg-panel,rgba(15,17,22,0.92)) !important;border:1px solid #493f2e !important;border-top:3px solid var(--dfo-row-rar,#827a68) !important;box-shadow:inset 0 0 0 1px rgba(0,0,0,0.65) !important;}
.trade-shell[data-view="grid"] .trade-win .itemrow.dfo-item-row:hover,.trade-shell[data-view="grid"] .trade-win .itemrow.dfo-item-row:focus-visible{background:var(--dfo-bg-row-hover,rgba(38,42,51,0.92)) !important;}
.trade-shell[data-view="grid"] .trade-win .itemrow.dfo-item-row.on,.trade-shell[data-view="grid"] .trade-win .itemrow.dfo-item-row.picked{background:var(--dfo-bg-row-selected,rgba(78,127,114,0.24)) !important;box-shadow:inset 0 0 0 1px rgba(213,178,110,0.7) !important;}
.trade-shell[data-view="grid"] .trade-win .itemrow.dfo-item-row .tile{width:56px;height:56px;flex:0 0 56px;margin:0 auto;}
.trade-shell[data-view="grid"] .trade-win .itemrow.dfo-item-row .itemname{width:100%;min-width:0;align-items:center;text-align:center;gap:2px;}
.trade-shell[data-view="grid"] .trade-win .itemrow.dfo-item-row .itemname>span:first-child{width:100%;font-size:13.5px;line-height:1.2;text-align:center;white-space:normal;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere;}
.trade-shell[data-view="grid"] .trade-win .itemrow.dfo-item-row .itemname>small.dfo-row-sub{display:none !important;}
.trade-shell[data-view="grid"] .trade-win .itemrow.dfo-item-row .itemwt.dfo-row-price{display:inline-flex !important;justify-content:center;margin-top:auto;}
body .sb-shell>.px-win{width:min(1100px,96vw);max-height:calc(100dvh - 40px);}.sb-shell .px-journal{grid-template-columns:minmax(260px,.85fr) minmax(0,1.15fr);}.sb-shell .sb-row{font-size:15px;line-height:1.4;letter-spacing:.025em;text-transform:none;}.sb-shell .sb-cost{font-size:16px;flex-shrink:0;}.sb-shell .px-qdetail{font-size:15px;line-height:1.45;min-width:0;}.sb-shell :is(.px-qmeta,.px-note,.meta){font-size:14px;letter-spacing:.02em;}.sb-shell :is(.act,.sb-fx){font-size:15px;line-height:1.4;letter-spacing:.025em;white-space:normal;}
.broker-shell .broker-win{width:min(1240px,96vw);max-height:calc(100dvh - 40px);}.broker-shell .broker-head{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:16px;align-items:center;}.broker-shell .broker-title{min-width:0;}.broker-shell .broker-title h2{font-size:calc(21px + var(--dfo-title-step,0px));letter-spacing:.045em;}.broker-shell .broker-sub{font-size:14px;letter-spacing:.015em;}.broker-shell .broker-purse{font-size:16px;max-width:300px;white-space:normal;text-align:right;line-height:1.4;}.broker-shell .broker-body{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,.85fr);min-height:0;}
.broker-shell .broker-offer{grid-template-columns:44px minmax(0,1fr) 112px;gap:6px 10px;}.broker-shell .broker-offer-body{grid-column:2;grid-row:1;}.broker-shell .broker-price{grid-column:2;grid-row:2;white-space:normal;overflow-wrap:break-word;}.broker-shell .broker-buy{grid-column:3;grid-row:1/span 2;}.broker-shell .broker-frame{grid-row:1/span 2;}.broker-shell :is(.broker-name,.broker-set){white-space:normal;overflow-wrap:break-word;}.broker-shell :is(.broker-offer,.broker-card){min-width:0;}.broker-shell :is(.broker-offer h3,.broker-card h3){font-size:calc(17px + var(--dfo-title-step,0px));letter-spacing:.02em;line-height:1.3;}.broker-shell :is(.broker-offer p,.broker-price,.insignia-what,.insignia-kept,.boundline){font-size:14px;line-height:1.4;letter-spacing:.015em;}.broker-shell .act{font-size:15px;letter-spacing:.025em;white-space:normal;}
.notice-shell .notice-win{width:min(1200px,96vw);max-height:calc(100dvh - 40px);}.notice-shell :is(.notice-head,.notice-foot,.notice-tabs){flex-shrink:0;}.notice-shell :is(.notice-body,.notice-read){min-height:0;overflow-y:auto;}.notice-shell :is(.notice-sub,.notice-meta,.notice-by,.notice-worktoday,.notice-time){font-size:14px;line-height:1.4;letter-spacing:.02em;}.notice-shell :is(.act,button,input,select,textarea){font-size:15px;line-height:1.35;letter-spacing:.015em;}.notice-shell :is(.notice-title h2,.notice-card h3){font-size:calc(18px + var(--dfo-title-step,0px));letter-spacing:.04em;line-height:1.3;}.notice-shell :is(.notice-card,.notice-grid>li){min-width:0;}.notice-shell :is(.notice-text,.notice-snippet,.notice-excerpt){font-size:15px;line-height:1.5;overflow-wrap:break-word;}
@media(max-width:960px){.trade-win.dfo-trade-overhaul .packlists{grid-template-columns:minmax(0,1fr) 196px minmax(0,1fr) !important;}.trade-footer.dfo-trade-bottom{grid-template-columns:minmax(0,1fr) 196px minmax(0,1fr) !important;}}
@media(max-width:800px){.pick-shell .pick-win.px-win.dfo-service-picker{grid-template-columns:minmax(180px,.8fr) minmax(0,1.2fr)}.dfo-service-help{padding:12px;}.broker-shell .broker-head{grid-template-columns:minmax(0,1fr) auto;}.broker-shell .broker-purse{grid-row:2;grid-column:1/-1;text-align:left;max-width:none;}.broker-shell .broker-body{display:grid;grid-template-columns:1fr;}.trade-shell .itemprice{min-width:92px;}.port-bank .port-stats{grid-template-columns:1fr;}.port-bank .dfo-bank-scene-split,.port-bank .dfo-bank-main-cols,.port-bank .dfo-bank-ships-panel{grid-template-columns:1fr !important;}.port-bank .dfo-bank-ships-actions{grid-template-columns:1fr 1fr !important;}}
@media(max-width:580px){.pick-shell .pick-win.px-win.dfo-service-picker{grid-template-columns:1fr;grid-template-rows:auto minmax(120px,.8fr) minmax(150px,1fr) auto;}.dfo-service-picker-title,.dfo-service-picker .dlg-acts{grid-column:1;}.dfo-service-picker .pick-list{min-height:0;}.dfo-service-help{border-left:0;border-top:1px solid #665b42;}.sb-shell .px-journal{grid-template-columns:1fr;}}
`;
  const style = doc.createElement("style");
  style.id = "dfo-service-windows";
  style.textContent = CSS;
  (doc.head ?? doc.documentElement).append(style);
  root.__dfoServices = Object.freeze({
    ports,
    tradeLine,
    tradeBeforeMount,
    tradeRow,
    tradeLeftCol,
    tradeRightCol,
    tradeFooter,
    tradeJunkItems,
    tradeSellJunk,
    tradePrimary,
    tradeCommit,
    tradeAfterPaint,
    tradeBeforeRepaint,
    showTradeQuantityModal,
    moveTradeItemUnits,
    tradePageOf,
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
    stats: () => ({
      styleRules: style.sheet?.cssRules?.length ?? 0,
      tradeSounds: tradeState.soundCount,
      lastClusterUnits: tradeState.lastClusterUnits,
      lastClusterTotal: tradeState.lastClusterTotal,
      scrollLeft: tradeState.scrollLeft,
      scrollRight: tradeState.scrollRight,
    }),
  });
})(globalThis);
