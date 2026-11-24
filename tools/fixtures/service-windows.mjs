const modules = globalThis.__serviceModules;

await __dfoFonts.ready;
await import("/assets/" + modules.ports + "");
await import("/assets/" + modules.enchant + "");
await import("/assets/" + modules.picker + "");
await import("/assets/" + modules.nativeBook);
const standard = await import("/assets/" + modules.standard + "");
const standardMap = standard.n(
  new Uint8Array(
    await fetch("/arena2/SPELLS.STD").then((r) => r.arrayBuffer()),
  ),
);
__dfoServices?.spellRegistry((id) => standardMap.get(id));
const native = serviceNative,
  trade = await import("/assets/" + modules.trade + ""),
  book = await import("/assets/" + modules.book + ""),
  broker = await import("/assets/" + modules.broker + ""),
  board = await import("/assets/" + modules.board + "");
const host = document.getElementById("service-host"),
  canvas = document.getElementById("scene");
let current = null,
  cleanup = null,
  frame = null;
const settings = {
  durationBase: 3,
  durationMod: 2,
  durationPerLevel: 4,
  chanceBase: 30,
  chanceMod: 5,
  chancePerLevel: 3,
  magnitudeBaseLow: 5,
  magnitudeBaseHigh: 10,
  magnitudeLevelBase: 2,
  magnitudeLevelHigh: 4,
  magnitudePerLevel: 3,
};
const item = (name, group, templateIndex, material = 1, extra = {}) => ({
  name,
  group,
  templateIndex,
  material,
  stackCount: 1,
  currentCondition: 100,
  maxCondition: 100,
  isIdentified: true,
  value: 500,
  ...extra,
});
const sword = item("Длинный меч ледяного пламени", "Weapons", 120, 8, {
  rarity: "rare",
  affixes: [{ id: "damage", value: 18 }],
});
const armor = item("Наголенники Руна", "Armor", 104, 521, {
  rarity: "aetheric",
  aetheric: "ruhn-greaves",
  sigil: { set: "ruhn", power: 8, xp: 37500 },
  affixes: [
    { id: "armor", value: 20 },
    { id: "resist", param: "fire", value: 10 },
    { id: "weight", value: 50 },
  ],
});
const bag = [
  sword,
  armor,
  item("Стальная кираса", "Armor", 102, 513),
  item("Боевой топор", "Weapons", 102, 2),
  item("Стрелы", "Weapons", 131, 1, { stackCount: 1506 }),
  item("Плащ путешественника", "Clothing", 165, 0),
  item("Угольки Мёртвых земель", "MiscItems", 570, 0, { stackCount: 125 }),
  item("Аккредитив", "MiscItems", 275, 0, { value: 25000 }),
];
const entity = {
  isPlayer: true,
  name: "Vanal Dran",
  level: 24,
  career: { name: "Spellsword" },
  stats: {
    strength: 70,
    endurance: 60,
    willpower: 65,
    intelligence: 80,
    agility: 50,
    speed: 50,
    personality: 55,
    luck: 50,
  },
  skills: new Array(35).fill(55),
  items: bag,
  goldPieces: 245489,
  spells: [],
  activeEffects: [],
  health: 130,
  maxHealth: 130,
  magicka: 160,
  maxMagicka: 160,
  fatigue: 300,
  maxFatigue: 300,
};
const spell = (name, type, subType, extra = {}) => ({
  name,
  rangeType: 2,
  element: 0,
  icon: 5,
  cost: 23,
  effects: [{ type, subType, ...settings }],
  ...extra,
});
const spells = [
  spell("Ледяная буря", 1, 0, { element: 1, cost: 41 }),
  spell("Огненная стрела", 4, 0),
  spell("Исцеление", 10, 8, { rangeType: 0 }),
  spell("Поглощение заклинаний", 20, 255, { rangeType: 0 }),
  spell("Истинная невидимость", 13, 1),
  spell("Общая картография", 46, 255),
];
entity.spells = spells;
function stop() {
  cancelAnimationFrame(frame);
  frame = null;
  if (current) {
    current.done = true;
    current.dispose?.();
  }
  current = null;
  cleanup?.();
  cleanup = null;
  host.replaceChildren();
  for (const n of document.querySelectorAll(
    ".port-host,.pick-shell,.dlg-shell",
  ))
    n.remove();
}
function port(w, kind) {
  w.draw = () => {};
  current = native.port(w, native.specs[kind]);
  const loop = () => {
    if (!current || current.done) return;
    current.draw({ canvas }, canvas, null);
    if (w.picker) {
      const p = w.picker;
      native.drawPicker(p, { canvas }, canvas, native.pickerGeo);
    }
    frame = requestAnimationFrame(loop);
  };
  loop();
  return w;
}
canvas.addEventListener("pointerdown", (e) => {
  const r = canvas.getBoundingClientRect();
  // Same letterboxed classic coordinates as nativeMetrics/replayClick.
  const scale = Math.max(
    1,
    Math.floor(Math.min(canvas.width / 320, canvas.height / 200)),
  );
  current?.click?.(
    (((e.clientX - r.left) * canvas.width) / r.width -
      Math.floor((canvas.width - 320 * scale) / 2)) /
      scale,
    (((e.clientY - r.top) * canvas.height) / r.height -
      Math.floor((canvas.height - 200 * scale) / 2)) /
      scale,
  );
});
document.addEventListener("keydown", (e) => {
  if (e.target.matches("input,textarea")) return;
  current?.input?.(e.code, e);
});
async function show(kind) {
  stop();
  globalThis.auditWindow = null;
  globalThis.activeCase = kind;
  if (kind.startsWith("bank")) {
    const accounts = new Array(70)
      .fill(null)
      .map(() => ({ accountGold: 0, loanTotal: 0 }));
    accounts[17] = { accountGold: 125000, loanTotal: 2500, loanDueDate: 1234 };
    const w = new native.Bank({
      accounts: () => accounts,
      regionIndex: () => 17,
      regionName: () => "Даггерфолл",
      locationName: () => "Даггерфолл",
      player: { gold: () => 245489, totalGold: () => 270489, items: bag },
      dueDateText: () => "Через 3 дня 12 часов",
      marks: {
        open: () => true,
        balance: () => 145,
        today: () => ({
          exchanged: 80,
          combat: 150,
          combatMax: 300,
          found: 42,
          findMax: 100,
          gathered: 18,
          gatherMax: 100,
        }),
        pending: () => false,
      },
    });
    port(w, "bank");
    globalThis.auditWindow = w;
    if (kind === "bank-deposit") w._button("depositGold");
  } else if (kind.startsWith("spellmaker")) {
    const w = new native.SpellMaker({
      entity,
      rows: () => [],
      priceFactor: () => 1,
    });
    w.name = "Ледяная погибель";
    w.slots[0] = { type: 4, subType: 0, key: "4,0", settings: { ...settings } };
    if (kind === "spellmaker-editor-continuous")
      Object.assign(w.slots[0], { type: 1, subType: 0, key: "1,0" });
    if (kind === "spellmaker-editor-absorb")
      Object.assign(w.slots[0], { type: 20, subType: 255, key: "20,255" });
    w._updateAllowedButtons();
    w._updateSpellCosts();
    port(w, "spellMaker");
    if (kind.startsWith("spellmaker-editor")) w._openEditor(0);
    if (kind === "spellmaker-picker") w._addEffectNoSound();
    if (kind === "spellmaker-variant") w._pickGroup("Damage");
    globalThis.auditWindow = w;
  } else if (kind.startsWith("enchant")) {
    const w = new native.ItemMaker({
      entity,
      packItems: () => bag,
      gold: () => 245489,
      icons: () => null,
    });
    w._selectItem(sword);
    port(w, "itemMaker");
    if (kind === "enchant-picker") w._openPicker(true);
    if (kind === "enchant-parameter") w._pickPrimary("EnhancesSkill");
    if (kind === "enchant-spell") w._pickPrimary("CastWhenStrikes");
    globalThis.auditWindow = w;
  } else if (kind === "spellshop") {
    const w = new native.SpellShop(
      {
        entity,
        spells: () => spells,
        offered: () => spells,
        castCost: (sp) => sp.cost,
        buildingQuality: () => 10,
        skills: () => ({}),
        shopName: () => "Гильдия магов Даггерфолла",
        rows: () => [],
      },
      { buyMode: true },
    );
    w.refreshSpellsList();
    w.setDefaults();
    port(w, "spellShop");
    globalThis.auditWindow = w;
  } else if (kind === "spells") {
    cleanup = book.mountEnhancedSpellbook(host, {
      entity,
      spells: () => spells,
      castCost: (sp) => sp.cost,
      gold: () => 245489,
      onExit: stop,
    }).destroy;
  } else if (kind === "trade-buy" || kind === "trade-sell") {
    cleanup = trade.mountEnhancedTrade(host, {
      entity,
      mode: kind === "trade-buy" ? "Buy" : "Sell",
      packItems: () => bag,
      otherItems: () => bag,
      shelfItems: () => bag,
      gold: () => 245489,
      shopName: "The Superior Arms",
      cityName: "Daggerfall",
      priceCtx: () => ({
        quality: 10,
        priceAdjustment: 1250,
        skills: entity.skills,
        entity,
      }),
      weight: () => ({ weight: 110, max: 240 }),
      onExit: stop,
    }).unmount;
  } else if (kind.startsWith("broker")) {
    cleanup = broker.mountBrokerWindow(host, {
      stock: () =>
        [armor, sword].map((it, i) => ({
          slot: i,
          item: it,
          price: 10 + i * 5,
          day: 1,
          id: "audit-" + i,
        })),
      day: () => 1,
      now: () => Date.now(),
      items: () => bag,
      bought: () => [],
      wearer: entity,
      buy: () => ({ ok: false, text: "Недостаточно угольков" }),
      ...(kind === "broker-panoply"
        ? {
            panoply: {
              rows: () => broker.panoplyRows(null),
              buy: async () => ({
                ok: false,
                text: "Проверочный стенд: покупка не выполняется",
              }),
            },
          }
        : {}),
      onExit: stop,
    }).unmount;
    if (kind === "broker-panoply")
      document.querySelector(".broker-panoply[data-panoply]")?.click();
  } else if (kind.startsWith("board")) {
    const data = {
      notes: [
        {
          id: "1",
          subject: "Поставка оружия для стражи Даггерфолла",
          body: "Городской страже нужны опытные кузнецы и зачарованные клинки. Вознаграждение за каждую выполненную поставку.",
          author: "Городской совет",
          expiresAt: Date.now() / 1000 + 86400,
          createdAt: Date.now() / 1000,
          mine: false,
        },
      ],
      notices: [],
      me: { canPin: true, live: 1, max: 3 },
    };
    const state = { open: true, writs: { today: 1, max: 3 } };
    cleanup = board.mountNoticeBoard(host, {
      town: { name: "Даггерфолл", mapId: 0, regionIndex: 17 },
      book: {
        state: { open: true },
        seenAt: () => 0,
        markSeen: () => {},
        cached: () => data,
        read: async () => ({ ok: true, board: data }),
        board: () => data,
      },
      work: {
        region: 17,
        regionName: "Даггерфолл",
        countName: (_material, n) =>
          n === 1 ? "железный слиток" : "железных слитков",
        book: {
          state,
          held: () => 150,
          walled: () => 0,
          carrying: () => true,
          writs: async () => ({
            ok: true,
            data: {
              writs: [
                {
                  id: "writ-1",
                  material: "iron",
                  qty: 100,
                  pay: 25,
                  renown: 5,
                  state: "open",
                  expiresAt: Date.now() / 1000 + 86400,
                },
              ],
              today: { filled: 1, max: 3 },
            },
          }),
        },
      },
      onExit: stop,
    }).unmount;
    if (kind === "board-orders") {
      const b = [...document.querySelectorAll(".notice-tabs button")].find(
        (n) => /Работа|Work/.test(n.textContent),
      );
      b?.click();
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  await document.fonts.ready;
  await new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(r)),
  );
  return document.body.innerText;
}
globalThis.servicesAudit = { show, stop, entity, bag, spells, native };
globalThis.ready = true;
