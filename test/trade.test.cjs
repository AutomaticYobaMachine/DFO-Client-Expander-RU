"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { wrap } = require("../src/mod/hook.cjs");
const { transformServices } = require("../src/mod/service-windows-transform.cjs");

function createMiniDom() {
  class MiniElement {
    constructor(tag, ownerDocument) {
      this.tagName = String(tag).toUpperCase();
      this.ownerDocument = ownerDocument;
      this.className = "";
      this.id = "";
      this.textContent = "";
      this.dataset = {};
      this.style = { setProperty() {} };
      this.attributes = new Map();
      this.children = [];
      this.parentNode = null;
      this.onclick = null;
      this.disabled = false;
      this.isConnected = true;
      this.scrollTop = 0;
      this.value = "";
      this.placeholder = "";
      this._listeners = new Map();
      this.focus = () => {};
      this.select = () => {};
      this.click = () => {
        if (typeof this.onclick === "function")
          this.onclick({ type: "click", target: this, preventDefault() {}, stopPropagation() {} });
        this.dispatchEvent({ type: "click", target: this, preventDefault() {}, stopPropagation() {} });
      };
      const self = this;
      this.classList = {
        add(...tokens) {
          const set = new Set(self.className.split(/\s+/).filter(Boolean));
          for (const t of tokens) if (t) set.add(t);
          self.className = [...set].join(" ");
        },
        remove(...tokens) {
          const set = new Set(self.className.split(/\s+/).filter(Boolean));
          for (const t of tokens) set.delete(t);
          self.className = [...set].join(" ");
        },
        contains(token) {
          return self.className.split(/\s+/).filter(Boolean).includes(token);
        },
      };
    }
    addEventListener(type, fn) {
      if (!this._listeners.has(type)) this._listeners.set(type, []);
      this._listeners.get(type).push(fn);
    }
    removeEventListener(type, fn) {
      const l = this._listeners.get(type);
      if (l) {
        const i = l.indexOf(fn);
        if (i >= 0) l.splice(i, 1);
      }
    }
    dispatchEvent(ev) {
      const type = ev?.type || ev;
      const l = this._listeners.get(type);
      if (l) {
        for (const fn of l) fn(ev);
      }
    }
    setAttribute(k, v) {
      this.attributes.set(k, String(v));
      if (k === "class") this.className = String(v);
      if (k === "id") this.id = String(v);
    }
    getAttribute(k) {
      return this.attributes.get(k) ?? null;
    }
    removeAttribute(k) {
      this.attributes.delete(k);
    }
    append(...nodes) {
      for (const n of nodes) {
        if (n == null) continue;
        if (typeof n === "string") {
          const span = new MiniElement("#text", this.ownerDocument);
          span.textContent = n;
          span.parentNode = this;
          this.children.push(span);
        } else {
          if (n.parentNode) {
            const idx = n.parentNode.children.indexOf(n);
            if (idx >= 0) n.parentNode.children.splice(idx, 1);
          }
          n.parentNode = this;
          this.children.push(n);
        }
      }
    }
    prepend(...nodes) {
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (!n) continue;
        n.parentNode = this;
        this.children.unshift(n);
      }
    }
    insertBefore(newNode, refNode) {
      if (!newNode) return;
      if (newNode.parentNode) {
        const oldIdx = newNode.parentNode.children.indexOf(newNode);
        if (oldIdx >= 0) newNode.parentNode.children.splice(oldIdx, 1);
      }
      newNode.parentNode = this;
      const idx = this.children.indexOf(refNode);
      if (idx >= 0) this.children.splice(idx, 0, newNode);
      else this.children.push(newNode);
    }
    replaceWith(replacement) {
      if (!this.parentNode || !replacement) return;
      const idx = this.parentNode.children.indexOf(this);
      if (idx >= 0) {
        replacement.parentNode = this.parentNode;
        this.parentNode.children[idx] = replacement;
        this.parentNode = null;
      }
    }
    remove() {
      if (!this.parentNode) return;
      const idx = this.parentNode.children.indexOf(this);
      if (idx >= 0) this.parentNode.children.splice(idx, 1);
      this.parentNode = null;
    }
    replaceChildren(...nodes) {
      this.children = [];
      this.append(...nodes);
    }
    set innerHTML(val) {
      this._innerHTML = String(val);
      if (val === "") this.children = [];
    }
    get innerHTML() {
      return this._innerHTML || "";
    }
    matches(sel) {
      const s = sel.trim();
      if (s.startsWith(":scope > ")) {
        return this.matches(s.slice(9));
      }
      const parts = s.split(/(?=\.)/);
      for (const p of parts) {
        if (!p) continue;
        if (p.startsWith(".")) {
          if (!this.classList.contains(p.slice(1))) return false;
        } else if (this.tagName !== p.toUpperCase()) {
          return false;
        }
      }
      return true;
    }
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] ?? null;
    }
    querySelectorAll(sel) {
      const s = sel.trim();
      if (s.includes(" ")) {
        const parts = s.split(/\s+/).filter(Boolean);
        let current = [this];
        for (const part of parts) {
          const next = [];
          for (const node of current) {
            next.push(...node.querySelectorAll(part));
          }
          current = next;
        }
        return current;
      }
      if (s.startsWith(":scope > ")) {
        const rest = s.slice(9).trim();
        return this.children.filter((c) => c.matches && c.matches(rest));
      }
      const out = [];
      const walk = (node) => {
        for (const c of node.children || []) {
          if (c.matches && c.matches(s)) out.push(c);
          walk(c);
        }
      };
      walk(this);
      return out;
    }
  }

  const doc = {
    head: null,
    body: null,
    documentElement: null,
    currentScript: { src: "dagger://game/dfo-mod/dfo_services.js" },
    createElement(tag) {
      return new MiniElement(tag, doc);
    },
    createElementNS(_ns, tag) {
      return new MiniElement(tag, doc);
    },
    createTextNode(txt) {
      const t = new MiniElement("#text", doc);
      t.textContent = String(txt);
      return t;
    },
    getElementById(id) {
      return doc.documentElement.querySelectorAll("*").find((n) => n.id === id) ?? null;
    },
  };
  doc.documentElement = new MiniElement("html", doc);
  doc.head = new MiniElement("head", doc);
  doc.body = new MiniElement("body", doc);
  doc.documentElement.append(doc.head, doc.body);
  return doc;
}

test("trade_deal.wav exists in sfx and is served by hook.cjs as audio/wav", async () => {
  const wavPath = path.join(__dirname, "../src/mod/sfx/trade_deal.wav");
  assert.ok(fs.existsSync(wavPath), "src/mod/sfx/trade_deal.wav must exist");
  const stat = fs.statSync(wavPath);
  assert.ok(stat.size > 1000, "trade_deal.wav must be non-empty");

  const handler = wrap(async () => new Response("not found", { status: 404 }));
  const res = await handler({ url: "dagger://game/dfo-mod/trade_deal.wav" });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "audio/wav");
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.length, stat.size);
});

test("dfo_services trade overhaul: 9 categories in both columns, scales divider panel, item card rows, and per-unit Buy/Sell/Junk loops", () => {
  const doc = createMiniDom();
  const prevDoc = globalThis.document;
  const prevServices = globalThis.__dfoServices;
  const prevCfg = globalThis.__DFO_MOD_CFG__;
  const prevAudio = globalThis.Audio;

  let playedUrls = [];
  globalThis.document = doc;
  globalThis.__DFO_MOD_CFG__ = { ru: { on: true } };
  delete globalThis.__dfoServices;
  globalThis.Audio = class FakeAudio {
    constructor(url) {
      this.url = url;
      this.volume = 1;
    }
    play() {
      playedUrls.push(this.url);
      return Promise.resolve();
    }
  };

  try {
    // Load pack data & rules so 9-category classification & junk detection are active
    delete require.cache[require.resolve("../src/mod/page/dfo_pack_data.js")];
    delete require.cache[require.resolve("../src/mod/page/dfo_pack_rules.js")];
    delete require.cache[require.resolve("../src/mod/page/dfo_services.js")];
    require("../src/mod/page/dfo_pack_data.js");
    require("../src/mod/page/dfo_pack_rules.js");
    require("../src/mod/page/dfo_services.js");

    const svc = globalThis.__dfoServices;
    assert.ok(svc, "__dfoServices must be initialized");

    // Verify 9-category classification
    assert.equal(svc.tradePageOf({ group: "Weapons", templateIndex: 120 }), "weapons");
    assert.equal(svc.tradePageOf({ group: "Armor", templateIndex: 102 }), "armor");
    assert.equal(svc.tradePageOf({ group: "Clothing", templateIndex: 165 }), "clothing");
    assert.equal(svc.tradePageOf({ group: "MiscItems", templateIndex: 264, potionRecipeKey: 1 }), "potions");
    assert.equal(svc.tradePageOf({ group: "PlantIngredients1", templateIndex: 1 }), "ingredients");
    assert.equal(svc.tradePageOf({ group: "Books", templateIndex: 1 }), "books");
    assert.equal(svc.tradePageOf({ group: "Gems", templateIndex: 1 }), "valuables");

    // Set up a mock trade bridge simulating enhancedTrade-CXhrZbuG.js
    const pack = [
      { name: "Стальной меч", group: "Weapons", templateIndex: 120, value: 100, stackCount: 1, rarity: "magic" },
      { name: "Железные стрелы", group: "Weapons", templateIndex: 131, value: 10, stackCount: 4 },
      { name: "Сломанный хлам", group: "MiscItems", templateIndex: 999, value: 15, stackCount: 3, isJunk: true },
    ];
    const shelf = [
      { name: "Зелье лечения", group: "MiscItems", templateIndex: 264, potionRecipeKey: 1, value: 50, stackCount: 3 },
      { name: "Эбонитовый кинжал", group: "Weapons", templateIndex: 118, value: 400, stackCount: 2, rarity: "rare" },
    ];
    const staged = [];
    const basket = [];
    const entity = { name: "Hero", goldPieces: 5000, items: [...pack] };
    let mercantileXp = 0;
    const commits = [];
    let forceLetterOfCredit = false;
    let nativeSounds = 0;

    const host = doc.createElement("div");
    doc.body.append(host);

    const bridge = {
      host,
      mode: "Sell",
      tab: "weapons",
      view: "list",
      basket,
      staged,
      dialog: null,
      picked: null,
      qty: { item: null, text: "" },
      hooks: {
        entity,
        packItems: () => pack,
        shelfItems: () => shelf,
        gold: () => entity.goldPieces,
        weight: () => ({ carriedWeightKg: forceLetterOfCredit ? 999 : 10, maxEncumbranceKg: 100 }),
        priceCtx: () => ({ quality: 10, skills: { mercantile: 50, personality: 50 } }),
        accepts: () => true,
        enchanted: () => true,
        isEquipped: () => false,
        commit(mode, items, price, payment) {
          assert.equal(items.length, 1, "Each commit in the loop must process exactly 1 unit item");
          assert.equal(items[0].stackCount, 1, "Each committed unit must have stackCount === 1");
          commits.push({ mode, item: items[0], price, payment });
          mercantileXp += 1;
          if (mode === "Sell" || mode === "SellMagic") {
            if (payment?.kind === "letterOfCredit") {
              entity.items.unshift({
                name: "Letter of credit",
                group: "MiscItems",
                templateIndex: 275,
                value: payment.amount,
                stackCount: 1,
              });
            } else {
              entity.goldPieces += price;
            }
          } else if (mode === "Buy") {
            entity.goldPieces -= price;
            entity.items.push(items[0]);
          }
          return true;
        },
      },
      itemLine: (it) => ({
        item: it,
        name: it.name,
        stack: it.stackCount > 1 ? it.stackCount : 0,
        material: "Steel",
        weight: 2.5,
      }),
      itemRow(it, side) {
        const btn = doc.createElement("button");
        btn.className = "itemrow";
        const tile = doc.createElement("span");
        tile.className = "tile";
        const nm = doc.createElement("span");
        nm.className = "itemname";
        const title = doc.createElement("span");
        title.textContent = it.name;
        nm.append(title);
        const wt = doc.createElement("span");
        wt.className = "itemwt";
        wt.textContent = "2.50 kg";
        const pr = doc.createElement("span");
        pr.className = "itemprice";
        pr.textContent = "100 gold";
        btn.append(tile, nm, wt, pr);
        return svc.tradeRow(btn, it, side, bridge);
      },
      repaint() {
        svc.tradeBeforeRepaint?.(bridge);
        host.innerHTML = "";
        const win = doc.createElement("div");
        win.className = "px-win trade-win";
        const body = doc.createElement("div");
        body.className = "px-body trade-body";
        const lists = doc.createElement("div");
        lists.className = "packlists";
        lists.append(
          svc.tradeLeftCol(bridge, () => doc.createElement("section")),
          svc.tradeRightCol(bridge, () => doc.createElement("section")),
        );
        body.append(lists);
        win.append(body, svc.tradeFooter(bridge, () => doc.createElement("div")));
        host.append(win);
        svc.tradeAfterPaint(bridge);
      },
      close() {},
      clear() {
        while (staged.length) pack.push(staged.pop());
        while (basket.length) shelf.push(basket.pop());
      },
      moveLocal(it) {
        const qty =
          bridge.qty?.item === it && bridge.qty.text
            ? parseInt(bridge.qty.text, 10)
            : (it.stackCount ?? 1);
        const idx = pack.indexOf(it);
        if (idx >= 0) {
          const total = it.stackCount ?? 1;
          const transferQty = Math.min(total, qty);
          if (transferQty < total) {
            it.stackCount = total - transferQty;
            const moved = { ...it, stackCount: transferQty };
            staged.push(moved);
          } else {
            pack.splice(idx, 1);
            staged.push(it);
          }
        }
      },
      moveRemote(it) {
        const qty =
          bridge.qty?.item === it && bridge.qty.text
            ? parseInt(bridge.qty.text, 10)
            : (it.stackCount ?? 1);
        if (bridge.mode === "Buy") {
          const idx = shelf.indexOf(it);
          if (idx >= 0) {
            const total = it.stackCount ?? 1;
            const transferQty = Math.min(total, qty);
            if (transferQty < total) {
              it.stackCount = total - transferQty;
              const moved = { ...it, stackCount: transferQty };
              basket.push(moved);
            } else {
              shelf.splice(idx, 1);
              basket.push(it);
            }
          }
        } else {
          const idx = staged.indexOf(it);
          if (idx >= 0) {
            const total = it.stackCount ?? 1;
            const transferQty = Math.min(total, qty);
            if (transferQty < total) {
              it.stackCount = total - transferQty;
              const moved = { ...it, stackCount: transferQty };
              pack.push(moved);
            } else {
              staged.splice(idx, 1);
              pack.push(it);
            }
          }
        }
      },
      canMovePicked: () => !!bridge.picked,
      movePicked() {
        if (!bridge.picked) return;
        const { item, side } = bridge.picked;
        bridge.picked = null;
        if (side === "local") bridge.moveLocal(item);
        else bridge.moveRemote(item);
      },
      calcLot() {
        const list = bridge.activeItems();
        return bridge.calcCost(bridge.mode, list);
      },
      calcCost(m, items) {
        let cost = 0,
          pieces = 0;
        for (const it of items) {
          const n = it.stackCount ?? 1;
          cost += (it.value ?? 10) * n;
          pieces += n;
        }
        return { cost, modeActionEnabled: items.length > 0, pieces };
      },
      activeItems: () => (bridge.mode === "Buy" ? basket : staged),
      calcLotTradePrice: (lot) => lot.cost,
      calcTradePrice: (_m, cost) => cost,
      quote: (it) => ({ label: "Trade for", price: (it.value ?? 10) * (it.stackCount ?? 1) }),
      isNativeJunk: (it) => !!it.isJunk,
      isUnsellable: () => false,
      merchantAccepts: () => true,
      canStage: () => true,
      selectPaymentForm: (amt) =>
        forceLetterOfCredit
          ? { kind: "letterOfCredit", amount: amt }
          : { kind: "gold", amount: amt },
      stealCost: () => 0,
      promptSteal() {},
      maxTransferable: (it) => it?.stackCount ?? 1,
      createQtyField: () => doc.createElement("div"),
      mountVirtual(col, items, renderRow) {
        for (const it of items) col.append(renderRow(it));
      },
      syncVirtual() {},
      baseFilter: () => true,
      prepareLocalForStage() {},
      moveBetweenArrays(it, fromArr, toArr) {
        const idx = fromArr.indexOf(it);
        if (idx >= 0) fromArr.splice(idx, 1);
        toArr.push(it);
      },
      addItem: (arr, it) => arr.push(it),
      splitTransfer() {},
      goldText: (n) => `${n} gold`,
      countText: (n) => `${n} items`,
      audio: {
        playOneShot() {
          nativeSounds++;
        },
      },
      clips: {},
      native: {
        junkItems: () => [],
        sellJunk: () => 0,
        commit: () => {},
        primary: () => {},
      },
    };

    // 1. Mount in Sell mode and verify layout:
    // Left column (Player) has 9 category tabs; Right column (Merchant) has 0 category tabs (mixed staged window)
    svc.tradeBeforeMount(bridge, [host, { mode: "Sell", packItems: () => pack, shelfItems: () => shelf }]);
    bridge.repaint();

    const leftCol = host.querySelector(".dfo-trade-col-player");
    const rightCol = host.querySelector(".dfo-trade-col-merchant");
    const centerPanel = host.querySelector(".dfo-trade-center");
    assert.ok(leftCol, "Left player column must render");
    assert.ok(rightCol, "Right merchant column must render");
    assert.ok(centerPanel, "Center divider panel must render between columns");
    assert.ok(centerPanel.querySelector(".dfo-trade-scales"), "Center panel must contain scales of trade SVG");
    assert.equal(leftCol.querySelectorAll(".packtab").length, 9, "Left column header in Sell mode must have 9 category buttons");
    assert.equal(rightCol.querySelectorAll(".packtab").length, 0, "Right column in Sell mode must have no category buttons (mixed list)");
    assert.equal(centerPanel.querySelectorAll(".dfo-trade-detail-box").length, 0, "Hint plaque must be removed from center panel");
    assert.ok(centerPanel.querySelector(".dfo-trade-junk-btn"), "Sell all junk button must be placed in center panel");
    const scalesPill = centerPanel.querySelector(".dfo-trade-lot-pill");
    assert.ok(scalesPill, "Scales item counter pill must exist");
    assert.equal(scalesPill.querySelector(".dfo-item-coin"), null, "Scales pill must only show item count, not total price");

    const rows = leftCol.querySelectorAll(".itemrow.dfo-item-row");
    assert.equal(rows.length, 2, "Weapons category in left column must show 2 weapon rows in card-row format");
    assert.ok(rows[0].querySelector(".dfo-row-price")?.querySelector(".dfo-item-coin"), "Item row must display price with coin SVG");

    // 2. Stage 1 sword (stack 1, value 100) + 4 arrows (stack 4, value 10 each = 40) and click Sell
    bridge.moveLocal(pack[0]); // Стальной меч (1)
    bridge.moveLocal(pack[0]); // Железные стрелы (4)
    assert.equal(staged.length, 2);

    svc.tradePrimary(bridge, bridge.native.primary);

    assert.equal(commits.length, 5, "Selling 1 sword + stack of 4 arrows must execute 5 separate unit transactions");
    assert.equal(mercantileXp, 5, "Mercantile XP must increment 5 times (once per unit sold)");
    assert.equal(bridge.dialog, null, "No confirmation dialog must be shown");
    assert.equal(staged.length, 0, "Staged list must be emptied after commit");
    assert.equal(entity.goldPieces, 5000 + 100 + 40, "Player gold must increase by exact total of all units");
    assert.equal(nativeSounds, 0, "Native per-item sound spam must be muted during loop");
    assert.equal(playedUrls.length, 1, "Cluster completion sound trade_deal.wav must play once");
    assert.match(playedUrls[0], /trade_deal\.wav$/);

    // 3. Test "Продать весь хлам" (Sell All Junk) with automatic Letter of Credit acceptance & consolidation
    forceLetterOfCredit = true;
    commits.length = 0;
    playedUrls.length = 0;

    const junkSold = svc.tradeSellJunk(bridge, bridge.native.sellJunk);
    assert.equal(junkSold, 3, "Sell all junk must sell all 3 units of the junk stack one by one");
    assert.equal(commits.length, 3, "3 separate unit commits must occur for 3 junk units");
    assert.equal(bridge.dialog, null, "Letter of Credit must be accepted automatically without any popup dialog");
    const letters = entity.items.filter((it) => it.templateIndex === 275);
    assert.equal(letters.length, 1, "Multiple Letters of Credit from one cluster must consolidate into 1 item");
    assert.equal(letters[0].value, 45, "Consolidated Letter of Credit must hold the total cluster value (3 * 15)");
    assert.equal(playedUrls.length, 1, "Cluster completion sound must play once after Sell All Junk");

    // 4. Test Buy mode mirrored layout (0 category tabs on left, 9 category tabs on right) & per-unit transaction loop
    forceLetterOfCredit = false;
    commits.length = 0;
    playedUrls.length = 0;
    bridge.mode = "Buy";
    svc.tradeBeforeMount(bridge, [host, { mode: "Buy", packItems: () => pack, shelfItems: () => shelf }]);
    bridge.repaint();

    const buyLeftCol = host.querySelector(".dfo-trade-col-player");
    const buyRightCol = host.querySelector(".dfo-trade-col-merchant");
    assert.equal(buyLeftCol.querySelectorAll(".packtab").length, 0, "Left column in Buy mode must have no category buttons (1-to-1 mirror of Sell right column)");
    assert.equal(buyRightCol.querySelectorAll(".packtab").length, 9, "Right column in Buy mode must have 9 category buttons");

    // Move stack of 3 potions (value 50 each = 150) and stack of 2 daggers (value 400 each = 800) to Buy basket
    bridge.moveRemote(shelf[0]); // 3 potions
    bridge.moveRemote(shelf[0]); // 2 daggers
    assert.equal(basket.length, 2);

    const goldBeforeBuy = entity.goldPieces;
    svc.tradePrimary(bridge, bridge.native.primary);

    assert.equal(commits.length, 5, "Buying stack of 3 potions + stack of 2 daggers must execute 5 separate unit transactions");
    assert.ok(commits.every((c) => c.mode === "Buy" && c.item.stackCount === 1));
    assert.equal(bridge.dialog, null, "Buying must execute in one click with zero dialogs");
    assert.equal(basket.length, 0, "Buy basket must be cleared after purchase");
    assert.equal(entity.goldPieces, goldBeforeBuy - (150 + 800), "Exact gold must be deducted");
    assert.equal(playedUrls.length, 1, "Cluster completion sound trade_deal.wav must play once after Buy cluster");
  } finally {
    globalThis.document = prevDoc;
    globalThis.__dfoServices = prevServices;
    globalThis.__DFO_MOD_CFG__ = prevCfg;
    globalThis.Audio = prevAudio;
  }
});

test("trade overhaul: scroll preservation on click, 1-unit double-click, shift-double-click stack, and ctrl-shift-double-click modal", () => {
  const doc = createMiniDom();
  const prevDoc = globalThis.document;
  const prevServices = globalThis.__dfoServices;
  const prevCfg = globalThis.__DFO_MOD_CFG__;

  globalThis.document = doc;
  globalThis.__DFO_MOD_CFG__ = { ru: { on: true } };
  delete globalThis.__dfoServices;

  try {
    delete require.cache[require.resolve("../src/mod/page/dfo_pack_data.js")];
    delete require.cache[require.resolve("../src/mod/page/dfo_pack_rules.js")];
    delete require.cache[require.resolve("../src/mod/page/dfo_services.js")];
    require("../src/mod/page/dfo_pack_data.js");
    require("../src/mod/page/dfo_pack_rules.js");
    require("../src/mod/page/dfo_services.js");

    const svc = globalThis.__dfoServices;
    assert.ok(svc, "__dfoServices must be initialized");

    const arrows = {
      name: "Железные стрелы",
      group: "Weapons",
      templateIndex: 131,
      value: 10,
      stackCount: 10,
    };
    const sword = {
      name: "Стальной меч",
      group: "Weapons",
      templateIndex: 120,
      value: 100,
      stackCount: 1,
    };
    const pack = [arrows, sword];
    const shelf = [];
    const staged = [];
    const basket = [];
    const entity = { name: "Hero", goldPieces: 1000, items: [...pack] };

    const host = doc.createElement("div");
    doc.body.append(host);

    const bridge = {
      host,
      mode: "Sell",
      tab: "weapons",
      view: "list",
      basket,
      staged,
      dialog: null,
      picked: null,
      qty: { item: null, text: "" },
      resetClick() {},
      hooks: {
        entity,
        packItems: () => pack,
        shelfItems: () => shelf,
        gold: () => entity.goldPieces,
        weight: () => ({ carriedWeightKg: 10, maxEncumbranceKg: 100 }),
        priceCtx: () => ({ quality: 10, skills: { mercantile: 50, personality: 50 } }),
        accepts: () => true,
        enchanted: () => true,
        isEquipped: () => false,
      },
      itemLine: (it) => ({ name: it.name, quest: false }),
      itemRow(it, side) {
        const btn = doc.createElement("button");
        btn.className = "itemrow dfo-item-row";
        btn.textContent = it.name;
        btn.onclick = () => {
          bridge.picked = { item: it, side };
          bridge.repaint();
        };
        return svc.tradeRow(btn, it, side, bridge);
      },
      repaint() {
        svc.tradeBeforeRepaint?.(bridge);
        host.innerHTML = "";
        const win = doc.createElement("div");
        win.className = "px-win trade-win";
        const body = doc.createElement("div");
        body.className = "px-body trade-body";
        const lists = doc.createElement("div");
        lists.className = "packlists";
        lists.append(
          svc.tradeLeftCol(bridge, () => doc.createElement("section")),
          svc.tradeRightCol(bridge, () => doc.createElement("section")),
        );
        body.append(lists);
        win.append(body, svc.tradeFooter(bridge, () => doc.createElement("div")));
        host.append(win);
        svc.tradeAfterPaint(bridge);
      },
      close() {},
      clear() {},
      moveLocal(it) {
        const qty =
          bridge.qty?.item === it && bridge.qty.text
            ? parseInt(bridge.qty.text, 10)
            : (it.stackCount ?? 1);
        const idx = pack.indexOf(it);
        if (idx >= 0) {
          const total = it.stackCount ?? 1;
          const transferQty = Math.min(total, qty);
          if (transferQty < total) {
            it.stackCount = total - transferQty;
            const moved = { ...it, stackCount: transferQty };
            staged.push(moved);
          } else {
            pack.splice(idx, 1);
            staged.push(it);
          }
        }
      },
      moveRemote(it) {
        const qty =
          bridge.qty?.item === it && bridge.qty.text
            ? parseInt(bridge.qty.text, 10)
            : (it.stackCount ?? 1);
        const idx = staged.indexOf(it);
        if (idx >= 0) {
          const total = it.stackCount ?? 1;
          const transferQty = Math.min(total, qty);
          if (transferQty < total) {
            it.stackCount = total - transferQty;
            const moved = { ...it, stackCount: transferQty };
            pack.push(moved);
          } else {
            staged.splice(idx, 1);
            pack.push(it);
          }
        }
      },
      canMovePicked: () => !!bridge.picked,
      movePicked() {},
      calcLot: () => ({ cost: 10, pieces: 1 }),
      calcCost: () => ({ cost: 10, pieces: 1 }),
      activeItems: () => staged,
      calcLotTradePrice: (lot) => lot.cost,
      calcTradePrice: (_m, cost) => cost,
      quote: () => ({ label: "Trade", price: 10 }),
      isNativeJunk: () => false,
      isUnsellable: () => false,
      merchantAccepts: () => true,
      canStage: () => true,
      selectPaymentForm: () => ({ kind: "gold", amount: 10 }),
      stealCost: () => 0,
      promptSteal() {},
      maxTransferable: (it) => it?.stackCount ?? 1,
      createQtyField: () => doc.createElement("div"),
      mountVirtual(col, items, renderRow) {
        for (const it of items) col.append(renderRow(it));
      },
      syncVirtual() {},
      countText: (n) => `${n} items`,
      audio: null,
      clips: {},
      native: { junkItems: () => [], sellJunk: () => 0, commit: () => {}, primary: () => {} },
    };

    svc.tradeBeforeMount(bridge, [host, { mode: "Sell", packItems: () => pack, shelfItems: () => shelf }]);
    bridge.repaint();

    // 1. Verify scroll preservation on single click
    let leftList = host.querySelector(".dfo-trade-col-player .remotelist");
    assert.ok(leftList, "Left list must exist");
    leftList.scrollTop = 350; // Simulate player scrolling down 350px

    const arrowRow = leftList.querySelector(".itemrow");
    assert.ok(arrowRow, "Item row must be rendered in left list");

    // Click on item (single click)
    arrowRow.onclick({
      type: "click",
      detail: 1,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      preventDefault() {},
      stopPropagation() {},
    });

    // After repaint from single click, scroll must be preserved at 350px!
    leftList = host.querySelector(".dfo-trade-col-player .remotelist");
    assert.equal(leftList.scrollTop, 350, "Scroll position must not be reset on single click/selection");
    assert.equal(bridge.picked?.item, arrows, "Arrow stack should be picked");

    // 2. Verify double-click transfers exactly 1 unit
    // Second click on the same item within double-click interval
    arrowRow.onclick({
      type: "click",
      detail: 2,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      preventDefault() {},
      stopPropagation() {},
    });

    assert.equal(arrows.stackCount, 9, "Double click must take exactly 1 unit from stack (10 -> 9)");
    assert.equal(staged.length, 1, "1 unit must be placed in staged");
    assert.equal(staged[0].stackCount, 1, "Staged item unit count must be 1");
    leftList = host.querySelector(".dfo-trade-col-player .remotelist");
    assert.equal(leftList.scrollTop, 350, "Scroll position must remain 350 after double-click transfer");

    // Double-click again: transfers another 1 unit
    const repaintedArrowRow = leftList.querySelector(".itemrow");
    // Click 1 of second double-click:
    repaintedArrowRow.onclick({
      type: "click",
      detail: 1,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      preventDefault() {},
      stopPropagation() {},
    });
    // Click 2 of second double-click:
    repaintedArrowRow.onclick({
      type: "click",
      detail: 2,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      preventDefault() {},
      stopPropagation() {},
    });

    assert.equal(arrows.stackCount, 8, "Second double-click must take another 1 unit (9 -> 8)");
    assert.equal(staged.length, 2, "Staged must now have 2 units");

    // 3. Verify Shift + Double-Click transfers entire remaining stack at once
    repaintedArrowRow.onclick({
      type: "click",
      detail: 1,
      shiftKey: true,
      ctrlKey: false,
      metaKey: false,
      preventDefault() {},
      stopPropagation() {},
    });
    repaintedArrowRow.onclick({
      type: "click",
      detail: 2,
      shiftKey: true,
      ctrlKey: false,
      metaKey: false,
      preventDefault() {},
      stopPropagation() {},
    });

    assert.equal(pack.includes(arrows), false, "Shift+double click must transfer all remaining 8 units at once");
    assert.equal(staged.length, 3, "Staged must now have 3 entries (1 + 1 + 8)");
    assert.equal(staged[2].stackCount, 8, "Last staged stack must have 8 units");

    // 4. Verify Ctrl + Shift + Double-Click opens modal dialog and allows exact quantity transfer
    const stagedStack = staged[2]; // stack of 8 arrows in staged
    const rightList = host.querySelector(".dfo-trade-col-merchant .remotelist");
    assert.ok(rightList, "Right staged list must exist");
    const stagedRows = rightList.querySelectorAll(".itemrow");
    const lastStagedRow = stagedRows[stagedRows.length - 1];

    // Click 1 with Ctrl+Shift:
    lastStagedRow.onclick({
      type: "click",
      detail: 1,
      shiftKey: true,
      ctrlKey: true,
      metaKey: false,
      preventDefault() {},
      stopPropagation() {},
    });
    // Click 2 with Ctrl+Shift:
    lastStagedRow.onclick({
      type: "click",
      detail: 2,
      shiftKey: true,
      ctrlKey: true,
      metaKey: false,
      preventDefault() {},
      stopPropagation() {},
    });

    const modalBackdrop = host.querySelector(".dfo-trade-modal-backdrop");
    assert.ok(modalBackdrop, "Ctrl+Shift+Double Click must open the modal dialog");

    const modalInput = modalBackdrop.querySelector(".dfo-trade-modal-input");
    assert.ok(modalInput, "Modal must contain a numeric input field");
    const btnAll = modalBackdrop.querySelector(".dfo-trade-modal-btn-all");
    assert.ok(btnAll, "Modal must contain a 'Все' button");

    // Click 'Все': sets value to 8
    btnAll.click();
    assert.equal(modalInput.value, "8", "'Все' button must fill max stack quantity");

    // Paste custom value '5'
    modalInput.value = "5";

    // Press Enter to confirm:
    modalInput.dispatchEvent({
      type: "keydown",
      key: "Enter",
      preventDefault() {},
      stopPropagation() {},
    });

    assert.equal(host.querySelector(".dfo-trade-modal-backdrop"), null, "Modal must close on confirm");
    assert.equal(stagedStack.stackCount, 3, "5 units transferred back, leaving 8 - 5 = 3 in staged");
    assert.equal(pack[pack.length - 1].stackCount, 5, "5 units returned to pack");

    // 5. Verify category tab click explicitly resets scroll to 0
    leftList = host.querySelector(".dfo-trade-col-player .remotelist");
    leftList.scrollTop = 200;
    svc.stats().scrollLeft = 200;

    const armorTab = host
      .querySelectorAll(".dfo-trade-col-player .packtab")
      .find((b) => b.dataset?.page === "armor");
    assert.ok(armorTab, "Armor tab must exist in player column");
    armorTab.onclick();

    assert.equal(svc.stats().scrollLeft, 0, "Changing category tab must reset scroll position to 0");
  } finally {
    globalThis.document = prevDoc;
    globalThis.__dfoServices = prevServices;
    globalThis.__DFO_MOD_CFG__ = prevCfg;
  }
});

test("trade overhaul conforms to ui-references single-frame, surface theme, and ornate button standards", () => {
  const doc = createMiniDom();
  const prevDoc = globalThis.document;
  const prevServices = globalThis.__dfoServices;
  const prevCfg = globalThis.__DFO_MOD_CFG__;

  globalThis.document = doc;
  globalThis.__DFO_MOD_CFG__ = { ru: { on: true } };
  delete globalThis.__dfoServices;

  try {
    delete require.cache[require.resolve("../src/mod/page/dfo_pack_data.js")];
    delete require.cache[require.resolve("../src/mod/page/dfo_pack_rules.js")];
    delete require.cache[require.resolve("../src/mod/page/dfo_services.js")];
    require("../src/mod/page/dfo_pack_data.js");
    require("../src/mod/page/dfo_pack_rules.js");
    require("../src/mod/page/dfo_services.js");

    const svc = globalThis.__dfoServices;
    assert.ok(svc, "__dfoServices must be initialized");

    const styleEl = doc.head.querySelector("#dfo-service-windows") || doc.head.children.find((n) => n.id === "dfo-service-windows");
    assert.ok(styleEl, "#dfo-service-windows style element must be mounted");
    const css = styleEl.textContent || "";

    for (const theme of ["stone", "iron", "ember", "forest", "night"]) {
      assert.ok(css.includes(`[data-plus-theme="${theme}"]`), `CSS must include palette overrides for ${theme}`);
    }
    for (const token of ["--dfo-bg-window:", "--dfo-bg-panel:", "--dfo-bg-well:", "--dfo-bg-button:", "--dfo-bg-row:", "--dfo-bg-row-selected:"]) {
      assert.ok(css.includes(token), `CSS must define surface depth token ${token}`);
    }
    assert.ok(css.includes(".trade-shell .trade-win.dfo-trade-overhaul)") && css.includes("border-image:"), "Outer trade window must receive global FRAME1 border-image");
    assert.ok(css.includes(".trade-shell .trade-win.dfo-trade-overhaul)>.px-corner{display:none !important;}"), "Outer trade window must hide legacy .px-corner gems");
    assert.ok(css.includes(".dfo-trade-controls,.dfo-trade-bottom,.sb-ask) .act)::before") && css.includes(".dfo-trade-modal-btn") && css.includes("::after"), "Trade buttons and modal buttons must use ornate ::before/::after double-frame corner styling");
    assert.ok(css.includes(".dfo-trade-controls .act.trade-steal:not(:disabled)"), "Trade Steal button must have crimson warn styling");
    assert.ok(css.includes(".trade-shell .trade-win.dfo-trade-overhaul :is(.packcol,.dfo-trade-center)") && css.includes(".dfo-trade-modal-box"), "Nested trade panels and modal box must use carved subpanel bevels");
    assert.ok(css.includes(".dfo-trade-bottom .trade-fig"), "Footer stat plaques must be styled");

    const stackItem = {
      name: "Боевое зелье",
      group: "Potions",
      templateIndex: 0,
      value: 50,
      stackCount: 5,
    };
    const pack = [stackItem];
    const staged = [];
    const entity = { name: "Hero", goldPieces: 500, items: [...pack] };
    const host = doc.createElement("div");
    doc.body.append(host);

    const bridge = {
      mode: "Sell",
      host,
      hooks: {
        entity,
        packItems: () => pack,
        shelfItems: () => [],
        accepts: () => true,
        enchanted: () => false,
        isEquipped: () => false,
        gold: () => 500,
        priceCtx: () => ({ quality: 10, skills: { mercantile: 50, personality: 50 } }),
      },
      basket: [],
      staged,
      picked: { item: stackItem, side: "local" },
      view: "list",
      tab: "weapons",
      itemLine: (it) => ({ name: it.name, stack: it.stackCount }),
      itemRow: (it) => {
        const r = doc.createElement("div");
        r.className = "itemrow";
        return r;
      },
      mountVirtual: (el, items, fn) => {
        for (const it of items) el.append(fn(it));
        return { dispose() {}, sync() {} };
      },
      syncVirtual: () => {},
      merchantAccepts: () => true,
      calcLot: () => ({ cost: 0, pieces: 0, resale: 0 }),
      calcLotTradePrice: (l) => l.cost || 0,
      activeItems: () => staged,
      quote: () => ({ price: 50 }),
      canStage: () => true,
      canMovePicked: () => true,
      movePicked: () => {},
      maxTransferable: (it) => it.stackCount,
      createQtyField: () => doc.createElement("label"),
      qty: { item: stackItem, text: "5" },
      clear: () => {},
      stealCost: () => 0,
      promptSteal: () => {},
      isUnsellable: () => false,
      countText: (n) => `${n} шт.`,
      repaint: () => {},
      resetClick: () => {},
      native: { junkItems: () => [], sellJunk: () => 0, commit: () => {}, primary: () => {} },
    };

    svc.tradeBeforeMount(bridge, [host, { mode: "Sell", packItems: () => pack, shelfItems: () => [] }]);

    const shell = doc.createElement("div");
    shell.className = "trade-shell";
    const win = doc.createElement("div");
    win.className = "px-win trade-win";
    const body = doc.createElement("div");
    body.className = "trade-body";
    const packlists = doc.createElement("div");
    packlists.className = "packlists";
    packlists.append(
      svc.tradeLeftCol(bridge, () => doc.createElement("section")),
      svc.tradeRightCol(bridge, () => doc.createElement("section")),
    );
    body.append(packlists);
    win.append(body, svc.tradeFooter(bridge, () => doc.createElement("div")));
    shell.append(win);
    host.append(shell);
    svc.tradeAfterPaint(bridge);

    assert.equal(win.classList.contains("dfo-window-frame"), true, "Global window root must carry .dfo-window-frame");
    const playerCol = win.querySelector(".dfo-trade-col-player");
    const merchantCol = win.querySelector(".dfo-trade-col-merchant");
    const centerPanel = win.querySelector(".dfo-trade-center");
    assert.ok(playerCol && merchantCol && centerPanel, "Player column, merchant column, and center scales panel must mount");
    for (const nested of [playerCol, merchantCol, centerPanel]) {
      assert.equal(nested.classList.contains("dfo-window-frame"), false, "Nested subpanels must NOT carry .dfo-window-frame");
    }

    svc.showTradeQuantityModal({ item: stackItem, side: "local", bridge, maxAmount: 5 });
    const modalBox = host.querySelector(".dfo-trade-modal-box");
    assert.ok(modalBox, "Trade quantity modal box must mount");
    assert.equal(modalBox.classList.contains("dfo-window-frame"), false, "Modal dialog box must use carved subpanel styling, not .dfo-window-frame");
    assert.equal(css.includes("backdrop-filter"), false, "Trade modal backdrops must not use backdrop-filter (prevents WebGL canvas Y-flip)");
    assert.ok(css.includes(".dfo-trade-stack-hint") && css.includes("color:#8e8676"), "Footer stack shortcut hint must use muted gray styling");

    const stackHintEl = win.querySelector(".dfo-trade-bottom .dfo-trade-stack-hint");
    assert.ok(stackHintEl, "Trade footer bottom strip must include .dfo-trade-stack-hint");
    assert.match(stackHintEl.textContent, /Shift.*Ctrl\+Shift/i, "Footer hint must mention Shift and Ctrl+Shift stack controls");

    const cancelBtn = host.querySelectorAll(".dfo-trade-modal-foot .dfo-trade-modal-btn").find((b) => !b.classList.contains("primary"));
    assert.ok(cancelBtn, "Modal cancel button must exist");
    cancelBtn.click();
    assert.equal(host.querySelector(".dfo-trade-modal-backdrop"), null, "Modal must close cleanly on Cancel");

    // Verify localized RU & EN svc.trade.stackHint from UI text tables
    const itemText = require("../src/mod/item-text.cjs");
    const uiRuntime = require("../src/mod/page/dfo_ui_text.js");
    for (const [loc, pat] of [["ru", /Shift.*Ctrl\+Shift/], ["en", /Shift.*Ctrl\+Shift/]]) {
      const pack = itemText.uiPack(loc);
      const ui = uiRuntime.make(pack);
      const txt = ui.t("svc.trade.stackHint");
      assert.match(txt, pat, `${loc}: svc.trade.stackHint must describe Shift and Ctrl+Shift shortcuts`);
      if (loc === "ru") assert.match(txt, /[А-Яа-яЁё]/, "RU trade hint must be localized in Russian");
    }
  } finally {
    globalThis.document = prevDoc;
    globalThis.__dfoServices = prevServices;
    globalThis.__DFO_MOD_CFG__ = prevCfg;
  }
});
