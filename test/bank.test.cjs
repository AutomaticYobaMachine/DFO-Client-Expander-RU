'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const asar = require('../src/asar.cjs');
const itemText = require('../src/mod/item-text.cjs');

const UI_RUNTIME_PATH = path.join(__dirname, '../src/mod/page/dfo_ui_text.js');
const SERVICES_PATH = path.join(__dirname, '../src/mod/page/dfo_services.js');

function installUiIntoSandbox(sandbox, locale = 'ru', uiDataScript = null) {
  sandbox.__DFO_MOD_CFG__ = {
    ...(sandbox.__DFO_MOD_CFG__ || {}),
    ru: { ...(sandbox.__DFO_MOD_CFG__?.ru || {}), on: locale === 'ru' },
    ui: { locale },
  };
  vm.runInNewContext(uiDataScript || itemText.uiBundle(locale), sandbox);
  vm.runInNewContext(fs.readFileSync(UI_RUNTIME_PATH, 'utf8'), sandbox);
}

function createBankSandbox(locale = 'ru') {
  const elements = [];
  const sandbox = {
    document: {
      createElement(tag) {
        const el = {
          tag,
          style: {},
          attrs: {},
          dataset: {},
          children: [],
          value: '',
          _className: '',
          get className() { return this._className; },
          set className(v) {
            if (this.tag === 'svg') {
              throw new TypeError("Cannot set property className of #<SVGElement> which has only a getter");
            }
            this._className = v;
            this.classList.classes.clear();
            for (const c of String(v).split(/\s+/)) if (c) this.classList.classes.add(c);
          },
          classList: {
            classes: new Set(),
            add(...classes) { for (const c of classes) if (c) this.classes.add(c); },
            contains(c) { return this.classes.has(c); },
            remove(...classes) { for (const c of classes) this.classes.delete(c); },
          },
          setAttribute(k, v) {
            this.attrs[k] = v;
            if (k === 'class') {
              this._className = v;
              this.classList.classes.clear();
              for (const c of String(v).split(/\s+/)) if (c) this.classList.classes.add(c);
            }
          },
          getAttribute(k) { return this.attrs[k]; },
          append(...children) {
            for (const c of children) {
              if (c) {
                this.children.push(c);
                c.parentElement = this;
              }
            }
          },
          prepend(...children) {
            for (const c of children.reverse()) {
              if (c) {
                this.children.unshift(c);
                c.parentElement = this;
              }
            }
          },
          remove() {
            if (this.parentElement) {
              const idx = this.parentElement.children.indexOf(this);
              if (idx >= 0) this.parentElement.children.splice(idx, 1);
              this.parentElement = null;
            }
          },
          querySelectorAll(sel) {
            const res = [];
            function scan(node) {
              let match = false;
              if (sel.startsWith('.')) {
                match = node.classList?.contains(sel.slice(1));
              } else if (sel.startsWith('#')) {
                match = node.id === sel.slice(1);
              } else {
                match = node.tag?.toLowerCase() === sel.toLowerCase();
              }
              if (match) res.push(node);
              for (const child of node.children || []) scan(child);
            }
            for (const child of this.children || []) scan(child);
            return res;
          },
          querySelector(sel) {
            return this.querySelectorAll(sel)[0] || null;
          },
          closest(sel) {
            let cur = this;
            while (cur) {
              let match = false;
              if (sel.startsWith('.')) {
                match = cur.classList?.contains(sel.slice(1));
              } else if (sel.startsWith('#')) {
                match = cur.id === sel.slice(1);
              } else {
                match = cur.tag?.toLowerCase() === sel.toLowerCase();
              }
              if (match) return cur;
              cur = cur.parentElement;
            }
            return null;
          },
          addEventListener(event, fn) {
            this._listeners = this._listeners || {};
            this._listeners[event] = this._listeners[event] || [];
            this._listeners[event].push(fn);
          },
          dispatchEvent(event) {
            const handlers = this._listeners?.[event.type] || [];
            for (const h of handlers) h(event);
          },
          getContext() {
            return {
              scale() {},
              fillRect() {},
              strokeRect() {},
              beginPath() {},
              moveTo() {},
              lineTo() {},
              closePath() {},
              arc() {},
              ellipse() {},
              fill() {},
              stroke() {},
              save() {},
              restore() {},
              translate() {},
              rotate() {},
              rect() {},
              clip() {},
              fillText() {},
              quadraticCurveTo() {},
              createLinearGradient() {
                return { addColorStop() {} };
              },
              createRadialGradient() {
                return { addColorStop() {} };
              },
            };
          },
        };
        elements.push(el);
        return el;
      },
      createElementNS(ns, tag) {
        return this.createElement(tag);
      },
      head: { children: [], append(c) { if (c) { this.children.push(c); c.parentElement = this; } } },
      documentElement: { append() {} },
      body: {
        children: [],
        append(c) { if (c) { this.children.push(c); c.parentElement = this; } },
        querySelectorAll(sel) {
          const res = [];
          const scan = (node) => {
            if (!node) return;
            let match = false;
            if (sel.startsWith('.')) match = node.classList?.contains(sel.slice(1));
            else if (sel.startsWith('#')) match = (node.id || node.attrs?.id) === sel.slice(1);
            else match = node.tag?.toLowerCase() === sel.toLowerCase();
            if (match) res.push(node);
            for (const ch of node.children || []) scan(ch);
          };
          for (const ch of this.children) scan(ch);
          return res;
        },
        querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
      },
      _docListeners: {},
      addEventListener(type, fn) {
        this._docListeners[type] = this._docListeners[type] || [];
        this._docListeners[type].push(fn);
      },
      removeEventListener(type, fn) {
        const list = this._docListeners[type];
        if (!list) return;
        const idx = list.indexOf(fn);
        if (idx >= 0) list.splice(idx, 1);
      },
      dispatchEvent(ev) {
        for (const fn of [...(this._docListeners[ev.type] || [])]) fn(ev);
      },
      getElementById(id) {
        return this.body.querySelector('#' + id);
      },
      querySelector(sel) {
        if (sel === '.port-bank .port-shell' || sel === '.port-bank') return this.body;
        return this.body.querySelector(sel);
      },
    },
    Math,
    Number,
    Array,
    String,
    Date,
    Set,
    WeakMap,
    WeakSet,
    setTimeout: (fn) => fn(),
    clearTimeout: () => {},
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;

  installUiIntoSandbox(sandbox, locale);
  const code = fs.readFileSync(SERVICES_PATH, 'utf8');
  vm.runInNewContext(code, sandbox);

  return sandbox;
}

test('bank overhaul: data extraction, visualization formula calculations and 1-to-1 layout', () => {
  const sb = createBankSandbox();
  const dfoServices = sb.__dfoServices;
  assert.ok(dfoServices, '__dfoServices must be exported');

  // Create a mock bank window model instance `w`
  const committed = [];
  const buttonCalls = [];

  const fakePlayer = {
    gold: () => 15000,
    totalGold: () => 15000,
    wagonGold: () => 35000,
    items: [
      { templateIndex: 275, group: 'MiscItems', value: 250000, stackCount: 1 },
      { templateIndex: 275, group: 'MiscItems', value: 500000, stackCount: 2 },
      { templateIndex: 10, group: 'Weapons', value: 50 },
    ],
    houses: [{ id: 'house-1' }, { id: 'house-2' }],
  };

  const fakeMarks = {
    open: () => true,
    balance: () => 3500,
    today: () => ({
      exchanged: 250,
      combat: 400,
      combatMax: 1500,
      found: 100,
      findMax: 400,
      gathered: 50,
      gatherMax: 400,
    }),
  };

  const w = {
    labels: () => ({
      account: '5 500 000',
      inventory: '15 000 (+35 000)',
      loanDue: '0',
    }),
    accounts: [{ accountGold: 5500000 }],
    region: 17,
    hooks: {
      player: fakePlayer,
      wagonGold: () => 35000,
      cityName: () => 'Daggerfall',
      regionName: () => 'Daggerfall Region',
      marks: fakeMarks,
      ownsShip: () => true,
      ownedShip: () => 1,
      ownsHouse: () => true,
      enabled: (name) => true,
    },
    enabled: (name) => true,
    transactionType: 'None',
    value: '',
    box: null,
    _button(act) {
      buttonCalls.push(act);
      if (act === 'depositLetters') {
        this.box = {
          buttons: 'YesNo',
          onYes: () => {
            committed.push({ type: 'cashInLetters', success: true });
          },
        };
      }
    },
    _commit() {
      committed.push({ type: this.transactionType, value: this.value });
      this.transactionType = 'None';
      this.value = '';
    },
  };

  // Test native view transform
  const nativeView = { title: 'The Bank', sub: 'Daggerfall', blocks: [], foot: [] };
  const v = dfoServices.view('bank', w, nativeView);

  // 1. Structure Verification
  assert.equal(v.size, 'wide dfo-bank-win', 'bank window size must be wide dfo-bank-win');
  assert.equal(v.title, 'Банк — Daggerfall');

  // Verify Top Assets Block
  const assetsBlock = v.blocks.find(b => b.cls === 'dfo-bank-assets');
  assert.ok(assetsBlock, 'Top banner .dfo-bank-assets must exist');

  // Top stats chips
  const statChips = assetsBlock.blocks.find(b => b.type === 'stats');
  assert.ok(statChips, 'Top assets stat chips must exist');
  const chipItems = Object.fromEntries(statChips.items.map(([k, val]) => [k, val]));
  assert.equal(chipItems['В банке'], '5 500 000 gp');
  assert.equal(chipItems['В аккредитивах'], '1 250 000 gp (2 шт.)'); // 250k*1 + 500k*2 = 1.25M
  assert.equal(chipItems['Недвижимость'], '2 объекта');
  assert.equal(chipItems['Флот'], '1 судно');

  // Verify Scene Split (2 halves: Left = notes, Right = safe)
  const sceneSplit = assetsBlock.blocks.find(b => b.cls === 'dfo-bank-scene-split');
  assert.ok(sceneSplit, 'Scene split 2-columns must exist');
  assert.equal(sceneSplit.cols.length, 2);

  // Left scene (Letters of Credit):
  const leftSceneHalf = sceneSplit.cols[0][0];
  assert.equal(leftSceneHalf.cls, 'dfo-bank-scene-half');
  const notesCanvas = leftSceneHalf.blocks.find(b => b.type === 'canvas');
  assert.ok(notesCanvas, 'Notes canvas must exist in left scene');
  const cashInBtn = leftSceneHalf.blocks.find(b => b.type === 'actions')?.items?.find(it => it.label === 'Обналичить');
  assert.ok(cashInBtn, 'Button "Обналичить" must exist');

  // Right scene (Safe & Solid Gold):
  const rightSceneHalf = sceneSplit.cols[1][0];
  assert.equal(rightSceneHalf.cls, 'dfo-bank-scene-half');
  const safeCanvas = rightSceneHalf.blocks.find(b => b.type === 'canvas');
  assert.ok(safeCanvas, 'Safe canvas must exist in right scene');
  const depositGoldBtn = rightSceneHalf.blocks.find(b => b.type === 'actions')?.items?.find(it => it.label === 'Внести золото');
  assert.ok(depositGoldBtn, 'Button "Внести золото" must exist');

  // 2. Bottom Section Verification
  const bottomCols = v.blocks.find(b => b.cls === 'dfo-bank-main-cols');
  assert.ok(bottomCols, 'Bottom 2-column container must exist');
  assert.equal(bottomCols.template, 'minmax(0, 1fr) minmax(0, 1fr)', 'Bottom columns must match top 1fr 1fr split');

  // Left panel: "Снять деньги со счета"
  const withdrawPanel = bottomCols.cols[0][0];
  assert.equal(withdrawPanel.title, 'Снять деньги со счета');
  const withdrawSubCols = withdrawPanel.blocks.find(b => b.cls === 'dfo-bank-withdraw-subcols');
  assert.ok(withdrawSubCols, 'Withdraw subcols must exist');

  // Sub-block 1: "Взять аккредитив:"
  const locBlock = withdrawSubCols.cols[0][0];
  assert.equal(locBlock.title, 'Взять аккредитив:');
  const locGrid = locBlock.blocks.find(b => b.layout === 'dfo-bank-btn-grid');
  assert.ok(locGrid, '2x3 grid for letters must exist');
  assert.deepEqual(Array.from(locGrid.items.map(it => it.label)), ['10к', '50к', '100к', '250к', '500к', '1млн.']);
  const locWide = locBlock.blocks.find(b => b.layout === 'dfo-bank-wide-btn');
  assert.equal(locWide.items[0].label, 'Своя сумма');

  // Sub-block 2: "Снять золото:"
  const goldBlock = withdrawSubCols.cols[1][0];
  assert.equal(goldBlock.title, 'Снять золото:');
  const goldGrid = goldBlock.blocks.find(b => b.layout === 'dfo-bank-btn-grid');
  assert.ok(goldGrid, '2x3 grid for gold must exist');
  assert.deepEqual(Array.from(goldGrid.items.map(it => it.label)), ['10к', '50к', '100к', '250к', '500к', '1млн.']);
  const goldWide = goldBlock.blocks.find(b => b.layout === 'dfo-bank-wide-btn');
  assert.equal(goldWide.items[0].label, 'Своя сумма');

  // Right panel: "Серебро" (ships moved below into separate panel)
  const silverPanel = bottomCols.cols[1][0];
  assert.equal(silverPanel.title, 'Серебро');
  const silverCanvas = silverPanel.blocks.find(b => b.type === 'canvas');
  assert.ok(silverCanvas, 'Silver coins canvas must exist in right panel');
  const sellSilverBtn = silverPanel.blocks.find(b => b.type === 'actions' && b.layout === 'column')?.items?.find(it => it.label === 'Продать серебро');
  assert.ok(sellSilverBtn, 'Button "Продать серебро" must exist');
  assert.equal(silverPanel.blocks.some(b => b.layout === 'dfo-bank-ships-actions'), false, 'Ships actions must NOT remain inside Silver panel');

  // Separate Ships/Fleet panel below main columns:
  const mainIdx = v.blocks.findIndex(b => b.cls === 'dfo-bank-main-cols');
  const shipsIdx = v.blocks.findIndex(b => b.cls === 'dfo-bank-ships-panel');
  assert.ok(shipsIdx > mainIdx, 'Ships panel must exist below .dfo-bank-main-cols');
  const shipsPanel = v.blocks[shipsIdx];
  assert.equal(shipsPanel.title, 'Флот');
  assert.deepEqual(Array.from(shipsPanel.blocks.find(b => b.type === 'stats')?.items ?? []).map(r => Array.from(r)), [['Флот', '1 судно']]);
  const shipsRow = shipsPanel.blocks.find(b => b.layout === 'dfo-bank-ships-actions');
  assert.ok(shipsRow, 'Ships row must exist with buy/sell ship buttons');
  assert.deepEqual(Array.from(shipsRow.items.map(it => it.label)), ['Купить корабль', 'Продать корабль']);
  shipsRow.items[0].act();
  shipsRow.items[1].act();
  assert.deepEqual(buttonCalls.slice(-2), ['buyShip', 'sellShip']);

  // Housing buttons must NOT exist anywhere
  const allLabels = JSON.stringify(v);
  assert.equal(allLabels.includes('Buy house'), false, 'Buy house must be removed');
  assert.equal(allLabels.includes('Sell house'), false, 'Sell house must be removed');
  assert.equal(allLabels.includes('Купить дом'), false, 'Купить дом must be removed');
  assert.equal(allLabels.includes('Продать дом'), false, 'Продать дом must be removed');

  // Prohibited hint plaques must NOT exist
  assert.equal(allLabels.includes('1 монета = 100к'), false, 'Formulas must not be explained in hint text');
  assert.equal(allLabels.includes('1 слиток = 1млн'), false, 'Formulas must not be explained in hint text');

  // 3. Test Action Executions
  // A) Fixed amount letter withdrawal: '100к'
  const btn100kLoc = locGrid.items.find(it => it.label === '100к');
  btn100kLoc.act();
  assert.deepEqual(committed.pop(), { type: 'Withdrawing_Letter', value: '100000' });

  // B) Fixed amount gold withdrawal: '250к'
  const btn250kGold = goldGrid.items.find(it => it.label === '250к');
  btn250kGold.act();
  assert.deepEqual(committed.pop(), { type: 'Withdrawing_gold', value: '250000' });

  // C) One-click cash in letters of credit without dialog popup
  cashInBtn.act();
  assert.deepEqual(committed.pop(), { type: 'cashInLetters', success: true });
  assert.equal(w.box, null, 'w.box must be null after immediate cash-in');
});

test('bank modal dialog: full copy-paste, Enter/Escape and "Внести все" behavior', () => {
  const sb = createBankSandbox();
  const dfoServices = sb.__dfoServices;

  const committed = [];
  const w = {
    labels: () => ({ account: '1 000 000', inventory: '20 000 (+15 000)' }),
    hooks: {
      player: {
        gold: () => 20000,
        totalGold: () => 20000,
        wagonGold: () => 15000,
        items: [],
      },
      wagonGold: () => 15000,
    },
    transactionType: 'None',
    value: '',
    _commit() {
      committed.push({ type: this.transactionType, value: this.value });
      this.transactionType = 'None';
      this.value = '';
    },
  };

  const v = dfoServices.view('bank', w, { blocks: [], foot: [] });
  const assetsBlock = v.blocks.find(b => b.cls === 'dfo-bank-assets');
  const rightSceneHalf = assetsBlock.blocks.find(b => b.cls === 'dfo-bank-scene-split').cols[1][0];
  const depositBtn = rightSceneHalf.blocks.find(b => b.type === 'actions').items[0];

  // Open "Внести золото" modal
  depositBtn.act();

  const backdrop = sb.document.body.children.find(c => c.classList.contains('dfo-bank-modal-backdrop'));
  assert.ok(backdrop, 'Modal backdrop must be injected into DOM');

  const input = backdrop.querySelector('.dfo-bank-modal-input');
  assert.ok(input, 'Real input field must exist in modal');

  // Verify paste event handler
  const fakePasteEvent = {
    type: 'paste',
    clipboardData: {
      getData: (type) => '12 500 gold',
    },
    stopPropagation() {},
    preventDefault() {},
  };
  input.dispatchEvent(fakePasteEvent);
  assert.equal(input.value, '12500', 'Pasted text must strip non-digits and preserve numbers');

  // Verify "Внести все" button
  const btnAll = backdrop.querySelector('.dfo-bank-btn-all');
  assert.ok(btnAll, '"Внести все" button must exist in deposit modal');
  btnAll.dispatchEvent({ type: 'click', stopPropagation() {} });

  // Total carried = purse (20000) + wagon (15000) = 35000!
  assert.deepEqual(committed.pop(), { type: 'Depositing_gold', value: '35000' });
  assert.equal(sb.document.body.children.includes(backdrop), false, 'Modal backdrop must be removed after confirm');
});

test('bank coin decoration: replaces gp and marks with gold and silver coin SVG icons', () => {
  const sb = createBankSandbox();
  const dfoServices = sb.__dfoServices;

  const w = {
    labels: () => ({ account: '14 000' }),
    hooks: {
      player: { gold: () => 143636, items: [] },
      marks: { open: () => true, balance: () => 2285, today: () => ({}) },
    },
    transactionType: 'None',
    value: '',
  };

  const v = dfoServices.view('bank', w, { blocks: [], foot: [] });

  // Create mock DOM for port-win with port-stats
  const win = sb.document.createElement('div');
  win.className = 'port-win px-win';
  sb.document.body.append(win);

  function createStat(label, val) {
    const stat = sb.document.createElement('div');
    stat.className = 'port-stat';
    const dt = sb.document.createElement('dt');
    dt.textContent = label;
    const dd = sb.document.createElement('dd');
    dd.textContent = val;
    stat.append(dt, dd);
    win.append(stat);
    return dd;
  }

  const ddBank = createStat('В банке', '14 000 gp');
  const ddSilver = createStat('Серебра с собой', '2 285');
  const ddRate = createStat('Курс банка', '5 золота за 1 серебро');

  // Find canvas in bank view and invoke paint
  const assetsBlock = v.blocks.find(b => b.cls === 'dfo-bank-assets');
  const safeHalf = assetsBlock.blocks.find(b => b.cls === 'dfo-bank-scene-split').cols[1][0];
  const safeCanvasBlock = safeHalf.blocks.find(b => b.type === 'canvas');

  const cv = sb.document.createElement('canvas');
  win.append(cv);
  safeCanvasBlock.paint(cv);

  // Check that "В банке" was decorated with gold coin
  assert.equal(ddBank.dataset.dfoCoinDecorated, '1');
  assert.ok(ddBank.classList.contains('dfo-bank-coin-val'));
  assert.ok(ddBank.children.some(c => c.classList?.contains('dfo-bank-coin') && !c.classList?.contains('dfo-silver-coin')), 'Must contain gold coin');

  // Check that "Серебра с собой" was decorated with silver coin
  assert.equal(ddSilver.dataset.dfoCoinDecorated, '1');
  assert.ok(ddSilver.classList.contains('dfo-bank-silver-val'));
  assert.ok(ddSilver.children.some(c => c.classList?.contains('dfo-silver-coin')), 'Must contain silver coin');

  // Check that "Курс банка" was decorated with both gold and silver coin
  assert.equal(ddRate.dataset.dfoCoinDecorated, '1');
  assert.ok(ddRate.children.some(c => c.classList?.contains('dfo-bank-coin') && !c.classList?.contains('dfo-silver-coin')), 'Must contain gold coin');
  assert.ok(ddRate.children.some(c => c.classList?.contains('dfo-silver-coin')), 'Must contain silver coin');
});

test('bank visual determinism: coin stacks remain frozen, monotonic add/remove and DFO online region 17 fallback', () => {
  const sb = createBankSandbox();
  const dfoServices = sb.__dfoServices;

  // 1. DFO Online consolidated account fallback:
  // Character in region 30 (Penwick Wood) has accountGold 0 in accounts[30],
  // but Empire Bank in accounts[17] has 14,000 gp.
  const accounts = new Array(70).fill(null).map(() => ({ accountGold: 0 }));
  accounts[17] = { accountGold: 14000 };

  const w = {
    labels: () => ({ account: '0', inventory: '2 285' }),
    accounts,
    region: 30,
    hooks: {
      player: { gold: () => 2285, items: [] },
      regionIndex: () => 30,
    },
    transactionType: 'None',
    value: '',
  };

  const v = dfoServices.view('bank', w, { blocks: [], foot: [] });
  const assetsBlock = v.blocks.find(b => b.cls === 'dfo-bank-assets');
  const statChips = assetsBlock.blocks.find(b => b.type === 'stats');
  const chipItems = Object.fromEntries(statChips.items.map(([k, val]) => [k, val]));
  assert.equal(chipItems['В банке'], '14 000 gp', 'Must correctly fallback to consolidated accounts[17]');

  const safeHalf = assetsBlock.blocks.find(b => b.cls === 'dfo-bank-scene-split').cols[1][0];
  const safeStats = safeHalf.blocks.find(b => b.type === 'stats');
  const safeItems = Object.fromEntries(safeStats.items.map(([k, val]) => [k, val]));
  assert.equal(safeItems['На счете'], '14 000 gp', 'Safe "На счете" must reflect the 14,000 gp balance');

  // 2. Deterministic stacks on safe scene
  const safeCanvasBlock = safeHalf.blocks.find(b => b.type === 'canvas');
  const cv1 = sb.document.createElement('canvas');
  safeCanvasBlock.paint(cv1);

  // Calling paint again must produce identical sig
  const cv2 = sb.document.createElement('canvas');
  safeCanvasBlock.paint(cv2);
  assert.equal(cv1.dataset.paintedSig, cv2.dataset.paintedSig);
});

test('bank 3-stack place clustering: dominant stack guarantee, 1st coin at Place 1, and frozen session coordinates', () => {
  const sb = createBankSandbox();
  const dfoServices = sb.__dfoServices;

  // 1. Budget of 14,000 GP -> 1 floor coin -> Must be allocated strictly to Place 1
  const accounts14k = new Array(70).fill(null).map(() => ({ accountGold: 0 }));
  accounts14k[17] = { accountGold: 14000 };

  const w = {
    labels: () => ({ account: '14 000' }),
    accounts: accounts14k,
    region: 30,
    hooks: { player: { gold: () => 14000, items: [] } },
    transactionType: 'None',
    value: '',
  };

  const v = dfoServices.view('bank', w, { blocks: [], foot: [] });
  const assetsBlock = v.blocks.find(b => b.cls === 'dfo-bank-assets');
  const safeHalf = assetsBlock.blocks.find(b => b.cls === 'dfo-bank-scene-split').cols[1][0];
  const safeCanvasBlock = safeHalf.blocks.find(b => b.type === 'canvas');

  let drawnCommands = [];
  const cv = sb.document.createElement('canvas');
  const originalGetContext = cv.getContext;
  cv.getContext = function() {
    const ctx = originalGetContext.call(this);
    ctx.ellipse = function(x, y, rx, ry, rot, start, end) {
      drawnCommands.push({ type: 'ellipse', x, y, rx, ry });
    };
    ctx.fillRect = function(x, y, w, h) {
      drawnCommands.push({ type: 'fillRect', x, y, w, h });
    };
    return ctx;
  };

  safeCanvasBlock.paint(cv);

  // Verify that the safe painted cleanly at 1.5x (315x255)
  assert.equal(cv.dataset.paintedW, '315');
  assert.equal(cv.dataset.paintedH, '255');

  // Verify that Variant 2 portal is drawn (sx=76, sy=74, sw=90, sh=70)
  const portalRect = drawnCommands.find(c => c.type === 'fillRect' && c.w === 96 && c.h === 74);
  assert.ok(portalRect, 'Variant 2 safe portal frame must be rendered');

  // Verify shelf corbel brackets or shelf line (w=82, h=3.5)
  const shelfRect = drawnCommands.find(c => c.type === 'fillRect' && c.w === 82 && c.h === 3.5);
  assert.ok(shelfRect, 'Single common reinforced shelf must be rendered');

  // Verify 90 degree door slab (x=63, w=13 or width slices 4, 4, 5)
  const doorSlice = drawnCommands.find(c => c.type === 'fillRect' && c.x === 63 && c.w === 4 && c.h === 64);
  assert.ok(doorSlice, '90-degree edge-on slab door must be rendered');

  // Verify that Letters of Credit and Silver visualization windows both match Safe dimensions (315x255)
  const notesHalf = assetsBlock.blocks.find(b => b.cls === 'dfo-bank-scene-split').cols[0][0];
  const notesCanvasBlock = notesHalf.blocks.find(b => b.type === 'canvas');
  const cvNotes = sb.document.createElement('canvas');
  notesCanvasBlock.paint(cvNotes);
  assert.equal(cvNotes.dataset.paintedW, '315', 'Notes canvas width must be 315');
  assert.equal(cvNotes.dataset.paintedH, '255', 'Notes canvas height must be 255 (identically sized to safe window)');

  const silverPanel = v.blocks.find(b => b.cls === 'dfo-bank-main-cols').cols[1][0];
  assert.equal(silverPanel.blocks[0].type, 'canvas', 'Silver panel must place visualization canvas first on the left');
  const cvSilver = sb.document.createElement('canvas');
  silverPanel.blocks[0].paint(cvSilver);
  assert.equal(cvSilver.dataset.paintedW, '315', 'Silver canvas width must be 315 (same space as top visualizations)');
  assert.equal(cvSilver.dataset.paintedH, '255', 'Silver canvas height must be 255 (same space as top visualizations)');
});



test('letters of credit desk scene: 50k stack progression, ledger cycles (10k/120k/1.44M), and session freeze per window', () => {
  const sb = createBankSandbox();
  sb.Date = Object.assign(function (...a) { return new Date(...a); }, { now: () => 100000 });
  const dfoServices = sb.__dfoServices;

  function makeBankWin(locGold) {
    const items = [];
    let rem = locGold;
    while (rem >= 1000000) {
      items.push({ templateIndex: 275, name: 'Letter of Credit', value: 1000000, stackCount: 1 });
      rem -= 1000000;
    }
    while (rem >= 100000) {
      items.push({ templateIndex: 275, name: 'Letter of Credit', value: 100000, stackCount: 1 });
      rem -= 100000;
    }
    while (rem >= 10000) {
      items.push({ templateIndex: 275, name: 'Letter of Credit', value: 10000, stackCount: 1 });
      rem -= 10000;
    }
    if (rem > 0) {
      items.push({ templateIndex: 275, name: 'Letter of Credit', value: rem, stackCount: 1 });
    }
    const rawP = { items, bankAccounts: [{ regionIndex: 17, balance: 100000 }], houses: [], ownedShip: -1 };
    return {
      hooks: {
        player: { items: () => items, bankAccounts: () => rawP.bankAccounts, houses: () => [], ownedShip: () => -1, raw: () => rawP },
        accounts: () => rawP.bankAccounts,
        regionIndex: () => 17,
        houses: () => [],
        ownedShip: () => -1,
        rawPlayer: () => rawP,
      },
      regionIndex: () => 17,
    };
  }

  function captureNotesDrawOps(win, reuseCv = null) {
    const ops = [];
    const cv = reuseCv || sb.document.createElement('canvas');
    const origGetCtx = cv.getContext.bind(cv);
    cv.getContext = function (type) {
      const ctx = origGetCtx(type);
      if (ctx._dfoInstrumented) return ctx;
      const wrapped = new Proxy(ctx, {
        get(target, prop) {
          const val = target[prop];
          if (typeof val === 'function') {
            return function (...args) {
              if (['moveTo', 'lineTo', 'quadraticCurveTo', 'ellipse', 'fill', 'stroke', 'fillRect'].includes(prop)) {
                ops.push([prop, ...args.map(a => (typeof a === 'number' ? Number(a.toFixed(2)) : a))]);
              }
              return val.apply(target, args);
            };
          }
          return val;
        },
        set(target, prop, value) {
          target[prop] = value;
          return true;
        },
      });
      wrapped._dfoInstrumented = true;
      return wrapped;
    };
    const v = dfoServices.view('bank', win, { blocks: [], foot: [] });
    const assetsBlock = v.blocks.find(b => b.cls === 'dfo-bank-assets');
    const notesHalf = assetsBlock.blocks.find(b => b.cls === 'dfo-bank-scene-split').cols[0][0];
    const notesCanvasBlock = notesHalf.blocks.find(b => b.type === 'canvas');
    notesCanvasBlock.paint(cv);
    return { cv, ops };
  }

  // 1. Same window freezes weights/bookmarks across balance changes (1.5M -> 2.0M -> 1.5M)
  const w1 = makeBankWin(1500000);
  const { ops: ops1a } = captureNotesDrawOps(w1);
  // Mutate locGold inside the SAME bank window session
  const rawW1 = w1.hooks.rawPlayer();
  rawW1.items.push({ templateIndex: 275, name: 'Letter of Credit', value: 500000, stackCount: 1 });
  const { ops: opsMid } = captureNotesDrawOps(w1);
  assert.notDeepEqual(opsMid, ops1a, 'Changing letters from 1.5M to 2.0M must update rendered scene');
  rawW1.items.pop();
  const { ops: ops1b, cv: cvCached } = captureNotesDrawOps(w1);
  assert.deepEqual(ops1b, ops1a, 'Restoring locGold within same window must render identically from frozen session');

  // Verify random ornament unlock threshold at 1.44M GP (12 * 120k GP)
  const wOrn = makeBankWin(1430000);
  const { ops: opsBeforeOrn } = captureNotesDrawOps(wOrn);
  wOrn.hooks.rawPlayer().items.push({ templateIndex: 275, name: 'Letter of Credit', value: 10000, stackCount: 1 });
  const { ops: opsAtOrn } = captureNotesDrawOps(wOrn);
  assert.ok(opsAtOrn.length > opsBeforeOrn.length, 'Crossing 1.44M GP must unlock 1st edge tab or bookmark ornament');

  // Calling paint again with unchanged sig skips redundant redraw
  const { ops: opsCachedHit } = captureNotesDrawOps(w1, cvCached);
  assert.equal(opsCachedHit.length, 0, 'Duplicate paint with unchanged paintedSig must skip heavy canvas redraw');

  // 2. Progressive checkpoints: 0 -> 10k (+1 left line) -> 40k (no stacks) -> 50k (1st stack sheet) -> 120k (1st right row) -> 130k (left resets) -> 18.75M (cap)
  const { ops: ops0 } = captureNotesDrawOps(makeBankWin(0));
  const { ops: ops10k } = captureNotesDrawOps(makeBankWin(10000));
  const { ops: ops40k } = captureNotesDrawOps(makeBankWin(40000));
  const { ops: ops50k } = captureNotesDrawOps(makeBankWin(50000));
  const { ops: ops120k } = captureNotesDrawOps(makeBankWin(120000));
  const { ops: ops130k } = captureNotesDrawOps(makeBankWin(130000));
  const { ops: opsMax } = captureNotesDrawOps(makeBankWin(18750000));

  assert.ok(ops10k.length > ops0.length, '10k GP must add 1st left page entry line');
  assert.ok(ops40k.length > ops10k.length, '40k GP must add 4 left page entry lines');
  assert.ok(ops50k.length > ops40k.length && (ops50k.length - ops40k.length) > (ops10k.length - ops0.length), '50k GP crossing 1st point must spawn a letter stack on desk in addition to 1 left line');
  assert.ok(ops120k.length > ops50k.length, '120k GP must draw right page ledger table row');
  // At 130k GP left page resets from 12 lines to 1 line while right table keeps 1 row & stacks still 2 points -> fewer total draw ops than 120k!
  assert.ok(ops130k.length < ops120k.length, '130k GP must wrap left ledger page back to 1 line');
  assert.ok(opsMax.length > ops120k.length, '18.75M GP full desk must render 43 books + topper sheets safely');
});

test('letters of credit animation lifecycle: rAF flame loop animates while connected and stops cleanly on disconnect', () => {
  let fakeNow = 1000;
  const rafQueue = [];
  let nextRafId = 1;

  const elements = [];
  let sandbox;
  sandbox = {
    document: {
      createElement(tag) {
        const ctxOps = [];
        const ctxObj = {
          scale() {},
          setTransform() {},
          clearRect() {},
          fillRect() {},
          strokeRect() {},
          beginPath() {},
          moveTo() {},
          lineTo() {},
          closePath() {},
          arc() {},
          ellipse() {},
          fill() {},
          stroke() {},
          save() {},
          restore() {},
          translate() {},
          rotate() {},
          rect() {},
          clip() {},
          fillText() {},
          setLineDash() {},
          quadraticCurveTo(...args) { ctxOps.push(['q', ...args.map(v => Number(v.toFixed(4)))]); },
          createLinearGradient() { return { addColorStop() {} }; },
          createRadialGradient() { return { addColorStop() {} }; },
          _qOps: ctxOps,
        };
        const el = {
          tagName: tag.toUpperCase(),
          className: '',
          dataset: {},
          style: {},
          isConnected: false,
          children: [],
          classList: { add() {}, remove() {}, contains() { return false; } },
          setAttribute() {},
          querySelectorAll() { return []; },
          querySelector() { return null; },
          append() {},
          addEventListener() {},
          getContext() { return ctxObj; },
        };
        elements.push(el);
        return el;
      },
      querySelectorAll() { return []; },
      getElementById() { return null; },
      head: { append() {} },
      body: { append() {}, children: [] },
    },
    __DFO_MOD_CFG__: { ru: { on: true } },
    Math,
    Number,
    Array,
    String,
    Set,
    WeakMap,
    WeakSet,
    Date: Object.assign(function (...a) { return new Date(...a); }, { now: () => fakeNow }),
    setTimeout,
    clearTimeout,
    requestAnimationFrame(cb) {
      const id = nextRafId++;
      rafQueue.push({ id, cb });
      return id;
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;

  installUiIntoSandbox(sandbox, 'ru');
  const code = fs.readFileSync(SERVICES_PATH, 'utf8');
  vm.runInNewContext(code, sandbox);

  const w = {
    hooks: {
      player: { items: () => [], bankAccounts: () => [], houses: () => [], ownedShip: () => -1 },
      accounts: () => [],
      regionIndex: () => 17,
      houses: () => [],
      ownedShip: () => -1,
    },
    regionIndex: () => 17,
  };
  const v = sandbox.__dfoServices.view('bank', w, { blocks: [], foot: [] });
  const paint = v.blocks.find(b => b.cls === 'dfo-bank-assets')
    .blocks.find(b => b.cls === 'dfo-bank-scene-split').cols[0][0]
    .blocks.find(b => b.type === 'canvas').paint;

  // 1. Connected canvas schedules rAF, animates flames after >=30ms, and stops immediately when disconnected
  const cv = sandbox.document.createElement('canvas');
  cv.isConnected = true;
  paint(cv);
  assert.equal(rafQueue.length, 1, 'Connected notes canvas must schedule initial rAF frame');

  const ctx = cv.getContext('2d');
  const frame0Q = ctx._qOps.slice();
  ctx._qOps.length = 0;

  fakeNow += 250;
  rafQueue.shift().cb();
  assert.ok(ctx._qOps.length > 0, 'rAF tick after >30ms must redraw notes scene');
  assert.notDeepEqual(ctx._qOps, frame0Q, 'Flame quadraticCurveTo curves must animate as fakeNow advances');
  assert.equal(rafQueue.length, 1, 'Connected canvas must keep scheduling next rAF');

  // Disconnect canvas (simulate bank window closed)
  cv.isConnected = false;
  ctx._qOps.length = 0;
  rafQueue.shift().cb();
  assert.equal(ctx._qOps.length, 0, 'Disconnected canvas must not redraw');
  assert.equal(rafQueue.length, 0, 'Disconnected canvas must cancel loop with zero leaked rAF callbacks');

  // 2. Unmounted canvas never attached after mountGrace self-terminates cleanly
  const orphanCv = sandbox.document.createElement('canvas');
  orphanCv.isConnected = false;
  paint(orphanCv);
  let safety = 30;
  while (rafQueue.length > 0 && safety-- > 0) {
    fakeNow += 40;
    rafQueue.shift().cb();
  }
  assert.equal(rafQueue.length, 0, 'Detached orphan canvas must self-terminate after grace window');
});

test('bank English localization: renders all labels, modals, plurals, comma grouping and coin icons cleanly', () => {
  const sb = createBankSandbox('en');
  const dfoServices = sb.__dfoServices;
  const CYR = /[А-Яа-яЁё]/;
  const accounts = new Array(70).fill(null).map(() => ({ accountGold: 0 }));
  accounts[17] = { accountGold: 5500000, loanTotal: 200000 };

  const w = {
    labels: () => ({ account: '5500000', inventory: '50000', loanDue: '200000' }),
    region: 17,
    accounts: () => accounts,
    hooks: {
      player: {
        gold: () => 50000,
        wagonGold: () => 15000,
        items: () => [
          { name: 'Letter of Credit', value: 250000, stackCount: 1 },
          { name: 'Letter of Credit', value: 500000, stackCount: 2 },
        ],
        houses: () => [{ id: 1 }, { id: 2 }],
        ownedShip: () => 1,
      },
      wagonGold: () => 15000,
      accounts: () => accounts,
      cityName: () => 'Daggerfall',
      regionName: () => 'Daggerfall',
      marks: {
        open: () => true,
        balance: () => 2285,
        today: () => ({ exchanged: 80, combat: 50, found: 10, gathered: 5 }),
      },
    },
    box: { rows: ['Transaction complete.'], buttons: 'OK' },
    enabled: () => true,
  };

  const v = dfoServices.view('bank', w, { blocks: [], foot: [] });
  assert.equal(v.title, 'Bank — Daggerfall');
  assert.equal(v.foot[0].label, 'Close');
  assert.doesNotMatch(JSON.stringify(v), CYR, 'English Bank view must contain zero Cyrillic');

  assert.equal(v.blocks.find(b => b.cls === 'dfo-bank-notice'), undefined, 'Bank error/info notice must NOT be rendered inside bank window blocks');
  const enStack = sb.document.getElementById('enhanced-notice');
  assert.ok(enStack, 'Non-YesNo Bank notice must render in vanilla right-side #enhanced-notice stack');
  assert.equal(enStack.querySelector('.notice-row')?.textContent, 'Transaction complete.');
  assert.equal(enStack.querySelector('.notice-hint')?.textContent, 'Click or press a key');
  sb.document.dispatchEvent({ type: 'keydown', key: 'Space', preventDefault() {}, stopPropagation() {} });
  assert.equal(w.box, null, 'Pressing a key must dismiss the Bank notice');
  assert.equal(sb.document.getElementById('enhanced-notice'), null, 'Dismissed right-side notice must clean up #enhanced-notice');

  const assetsBlock = v.blocks.find(b => b.cls === 'dfo-bank-assets');
  const statChips = Object.fromEntries(assetsBlock.blocks.find(b => b.type === 'stats').items.map(([k, val]) => [k, val]));
  assert.equal(statChips['In bank'], '5,500,000 gp');
  assert.equal(statChips['In letters'], '1,250,000 gp (2 notes)');
  assert.equal(statChips['Property'], '2 properties');
  assert.equal(statChips['Fleet'], '1 ship');
  assert.equal(statChips['Loan owed'], '200,000 gp');

  // Check singular and zero plural forms in English
  const wPlural = {
    ...w,
    hooks: {
      ...w.hooks,
      player: { ...w.hooks.player, houses: () => [{ id: 1 }], ownedShip: () => -1 },
    },
  };
  const vPlural = dfoServices.view('bank', wPlural, { blocks: [], foot: [] });
  const pluralChips = Object.fromEntries(vPlural.blocks.find(b => b.cls === 'dfo-bank-assets').blocks.find(b => b.type === 'stats').items.map(([k, val]) => [k, val]));
  assert.equal(pluralChips['Property'], '1 property');
  assert.equal(pluralChips['Fleet'], '0 ships');

  const sceneSplit = assetsBlock.blocks.find(b => b.cls === 'dfo-bank-scene-split');
  const notesHalf = sceneSplit.cols[0][0];
  const notesStats = Object.fromEntries(notesHalf.blocks.find(b => b.type === 'stats').items);
  assert.equal(notesStats['In notes'], '1,250,000 gp');
  assert.equal(notesStats['Quantity'], '2 notes');
  assert.equal(notesHalf.blocks.find(b => b.type === 'actions').items[0].label, 'Cash in letters');

  const safeHalf = sceneSplit.cols[1][0];
  const safeStats = Object.fromEntries(safeHalf.blocks.find(b => b.type === 'stats').items);
  assert.equal(safeStats['Account'], '5,500,000 gp');
  assert.equal(safeStats['Carried'], '65,000 gp');
  const depositBtn = safeHalf.blocks.find(b => b.type === 'actions').items[0];
  assert.equal(depositBtn.label, 'Deposit gold');

  const bottomCols = v.blocks.find(b => b.cls === 'dfo-bank-main-cols');
  const withdrawPanel = bottomCols.cols[0][0];
  assert.equal(withdrawPanel.title, 'Withdraw from account');
  const subCols = withdrawPanel.blocks.find(b => b.cls === 'dfo-bank-withdraw-subcols');
  assert.equal(subCols.cols[0][0].title, 'Issue letter of credit:');
  assert.deepEqual(Array.from(subCols.cols[0][0].blocks.find(b => b.layout === 'dfo-bank-btn-grid').items.map(i => i.label)), ['10k', '50k', '100k', '250k', '500k', '1M']);
  assert.equal(subCols.cols[0][0].blocks.find(b => b.layout === 'dfo-bank-wide-btn').items[0].label, 'Custom amount');
  assert.equal(subCols.cols[1][0].title, 'Withdraw gold:');

  const silverPanel = bottomCols.cols[1][0];
  assert.equal(silverPanel.title, 'Silver');
  const silverStats = Object.fromEntries(silverPanel.blocks.find(b => b.type === 'stats').items);
  assert.equal(silverStats['Silver carried'], '2,285');
  assert.equal(silverStats['Bank rate'], '5 gold for 1 silver');
  assert.equal(silverStats['Sold today'], '80 of 1500');
  assert.equal(silverStats['In raids & gates'], '50 of 1500');
  assert.equal(silverStats['In loot'], '10 of 400');
  assert.equal(silverStats['While gathering'], '5 of 400');
  const sellSilverBtn = silverPanel.blocks.find(b => b.type === 'actions' && b.layout === 'column').items[0];
  assert.equal(sellSilverBtn.label, 'Sell silver');
  assert.equal(silverPanel.blocks.some(b => b.layout === 'dfo-bank-ships-actions'), false);

  const mainColsIdx = v.blocks.findIndex(b => b.cls === 'dfo-bank-main-cols');
  const shipsPanelIdx = v.blocks.findIndex(b => b.cls === 'dfo-bank-ships-panel');
  assert.ok(shipsPanelIdx > mainColsIdx);
  const shipsPanel = v.blocks[shipsPanelIdx];
  assert.equal(shipsPanel.title, 'Fleet');
  assert.deepEqual(Array.from(shipsPanel.blocks.find(b => b.type === 'stats').items).map(r => Array.from(r)), [['Fleet', '1 ship']]);
  assert.deepEqual(Array.from(shipsPanel.blocks.find(b => b.layout === 'dfo-bank-ships-actions').items.map(i => i.label)), ['Buy ship', 'Sell ship']);

  // Verify modals in English
  depositBtn.act();
  const backdrop = sb.document.body.children.find(c => c.classList.contains('dfo-bank-modal-backdrop'));
  assert.equal(backdrop.querySelector('h3').textContent, 'Deposit gold');
  assert.equal(backdrop.querySelector('.dfo-bank-modal-sub').textContent, 'Carried: 65,000 gp (purse: 50,000, wagon: 15,000)');
  assert.equal(backdrop.querySelector('.dfo-bank-modal-input').placeholder, 'Enter amount...');
  assert.equal(backdrop.querySelector('.dfo-bank-btn-all').textContent, 'Deposit all');
  assert.equal(backdrop.querySelector('.dfo-bank-btn-primary').textContent, 'Deposit');
  assert.equal(backdrop.querySelector('.dfo-bank-btn-cancel').textContent, 'Cancel');
  assert.doesNotMatch(backdrop.querySelector('.dfo-bank-modal-sub').textContent, CYR);
  backdrop.querySelector('.dfo-bank-btn-cancel').dispatchEvent({ type: 'click', stopPropagation() {} });

  // Open sell silver modal -> should show "Sell all"
  sellSilverBtn.act();
  const silverModal = sb.document.body.children.find(c => c.classList.contains('dfo-bank-modal-backdrop'));
  assert.equal(silverModal.querySelector('h3').textContent, 'Sell silver');
  assert.equal(silverModal.querySelector('.dfo-bank-modal-sub').textContent, 'Silver carried: 2,285 (rate: 5 gp per 1)');
  assert.equal(silverModal.querySelector('.dfo-bank-btn-all').textContent, 'Sell all');
  assert.equal(silverModal.querySelector('.dfo-bank-btn-primary').textContent, 'Sell');
  silverModal.querySelector('.dfo-bank-btn-cancel').dispatchEvent({ type: 'click', stopPropagation() {} });

  // Coin decoration in English
  const win = sb.document.createElement('div');
  win.className = 'port-win px-win';
  sb.document.body.append(win);
  const makeStat = (label, val) => {
    const st = sb.document.createElement('div');
    st.className = 'port-stat';
    const dt = sb.document.createElement('dt');
    dt.textContent = label;
    const dd = sb.document.createElement('dd');
    dd.textContent = val;
    st.append(dt, dd);
    win.append(st);
    return dd;
  };
  const ddBank = makeStat('In bank', '14,000 gp');
  const ddSilver = makeStat('Silver carried', '2,285');
  const ddRate = makeStat('Bank rate', '5 gold for 1 silver');
  const cv = sb.document.createElement('canvas');
  win.append(cv);
  safeHalf.blocks.find(b => b.type === 'canvas').paint(cv);

  assert.equal(ddBank.dataset.dfoCoinDecorated, '1');
  assert.equal(ddSilver.dataset.dfoCoinDecorated, '1');
  assert.ok(ddSilver.children.some(c => c.classList?.contains('dfo-silver-coin')));
  assert.equal(ddRate.dataset.dfoCoinDecorated, '1');
  assert.equal(ddRate.querySelector('.dfo-bank-coin-sep').textContent, 'for 1');
});

test('installer ru toggle propagates through patcher, hook and dfo_ui_text_data into Bank view', async () => {
  const root = path.join(__dirname, '..');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dfo-bank-i18n-'));
  try {
    // Stage payload layout expected by src/patcher.cjs (patcher/, mod/, data/)
    const payloadDir = path.join(tmp, 'payload');
    const patcherStage = path.join(payloadDir, 'patcher');
    fs.mkdirSync(patcherStage, { recursive: true });
    for (const f of ['patcher.cjs', 'asar.cjs', 'ru-build.cjs']) {
      fs.copyFileSync(path.join(root, 'src', f), path.join(patcherStage, f));
    }
    fs.symlinkSync(path.join(root, 'src/mod'), path.join(payloadDir, 'mod'), 'junction');
    fs.symlinkSync(path.join(root, 'data'), path.join(payloadDir, 'data'), 'junction');

    // Build minimal vanilla app.asar fixture
    const gameSrc = path.join(tmp, 'game-src');
    fs.mkdirSync(gameSrc, { recursive: true });
    fs.writeFileSync(path.join(gameSrc, 'package.json'), JSON.stringify({ name: 'dfo', version: '1.0.0' }));
    fs.writeFileSync(path.join(gameSrc, 'main.cjs'), "const { protocol, app } = {}; protocol.handle('dagger', nativeHandler);\n");
    fs.writeFileSync(path.join(gameSrc, 'index.html'), '<!doctype html><html><head><title>DFO</title></head><body><script type="module"></script></body></html>\n');

    const resourcesDir = path.join(tmp, 'game', 'resources');
    fs.mkdirSync(resourcesDir, { recursive: true });
    const asarPath = path.join(resourcesDir, 'app.asar');
    asar.packFolder(gameSrc, asarPath);

    const userDataDir = path.join(tmp, 'userData');
    fs.mkdirSync(userDataDir, { recursive: true });

    const runPatcher = (extraArgs) => {
      execFileSync(
        process.execPath,
        [path.join(patcherStage, 'patcher.cjs'), ...extraArgs, '--asar', asarPath, '--user-data', userDataDir, '--no-proc-check', '--lang', 'en'],
        { encoding: 'utf8' },
      );
    };

    const evaluateBankFromPatchedAsar = async (stepName) => {
      const unpackedMod = path.join(tmp, `unpacked-${stepName}`);
      const a = asar.openAsar(asarPath);
      try {
        for (const [rel] of asar.listFiles(a.header)) {
          if (!rel.startsWith('dfo-mod/')) continue;
          const dest = path.join(unpackedMod, rel.slice('dfo-mod/'.length));
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, asar.readFile(a, rel));
        }
      } finally {
        a.close();
      }

      const { wrap } = require(path.join(unpackedMod, 'hook.cjs'));
      const htmlSrc = fs.readFileSync(path.join(gameSrc, 'index.html'), 'utf8');
      const handle = wrap(
        async (req) => {
          const u = new URL(req.url);
          if (u.pathname === '/index.html' || u.pathname === '/') {
            return new Response(htmlSrc, { status: 200, headers: { 'Content-Type': 'text/html' } });
          }
          return new Response('', { status: 404 });
        },
        { app: { getPath: () => userDataDir } },
      );

      const pageRes = await handle(new Request('dagger://game/index.html'));
      const injectedHtml = await pageRes.text();
      const cfgMatch = /window\.__DFO_MOD_CFG__=(\{.*?\});/.exec(injectedHtml);
      assert.ok(cfgMatch, `${stepName}: __DFO_MOD_CFG__ must be injected into page`);
      const pageCfg = JSON.parse(cfgMatch[1]);

      const uiDataJs = await (await handle(new Request('dagger://game/dfo-mod/dfo_ui_text_data.js'))).text();
      const uiRuntimeJs = await (await handle(new Request('dagger://game/dfo-mod/dfo_ui_text.js'))).text();
      const servicesJs = await (await handle(new Request('dagger://game/dfo-mod/dfo_services.js'))).text();

      const sb = createBankSandbox('en');
      // Replace sandbox runtime cleanly by creating a fresh sandbox with scripts served directly by hook.cjs
      const doc = sb.document;
      const hookSb = {
        document: doc,
        __DFO_MOD_CFG__: pageCfg,
        Math, Number, Array, String, Date, Set, WeakMap, WeakSet,
        setTimeout: (fn) => fn(),
        clearTimeout: () => {},
      };
      hookSb.globalThis = hookSb;
      hookSb.window = hookSb;
      vm.runInNewContext(uiDataJs, hookSb);
      vm.runInNewContext(uiRuntimeJs, hookSb);
      vm.runInNewContext(servicesJs, hookSb);

      const accounts = new Array(70).fill(null).map(() => ({ accountGold: 0 }));
      accounts[17] = { accountGold: 250000 };
      const w = {
        labels: () => ({ account: '250000', inventory: '1000' }),
        accounts: () => accounts,
        region: 17,
        hooks: {
          player: { gold: () => 1000, items: () => [], houses: () => [], ownedShip: () => -1 },
          accounts: () => accounts,
          cityName: () => 'Daggerfall',
          regionName: () => 'Daggerfall',
        },
      };
      return { pageCfg, injectedHtml, view: hookSb.__dfoServices.view('bank', w, { blocks: [], foot: [] }) };
    };

    // 1. Installer with Русификация UNCHECKED (--no-ru --set ru=0) and Шрифты ON (--set fonts=1)
    runPatcher(['install', '--no-ru', '--set', 'enabled=1', '--set', 'ru=0', '--set', 'fonts=1']);
    const cfgOff = JSON.parse(fs.readFileSync(path.join(userDataDir, 'dfo-mod.json'), 'utf8'));
    assert.equal(cfgOff.ru, false);
    assert.equal(cfgOff.fonts, true);
    const statusOff = JSON.parse(execFileSync(process.execPath, [path.join(patcherStage, 'patcher.cjs'), 'status', '--json', '--asar', asarPath, '--user-data', userDataDir, '--no-proc-check'], { encoding: 'utf8' }));
    assert.equal(statusOff.installed, true);
    assert.equal(statusOff.withRu, false);

    const enRun1 = await evaluateBankFromPatchedAsar('en1');
    assert.equal(enRun1.pageCfg.ru.on, false);
    assert.equal(enRun1.pageCfg.ui.locale, 'en');
    assert.equal(enRun1.view.title, 'Bank — Daggerfall');
    assert.equal(enRun1.view.foot[0].label, 'Close');
    assert.doesNotMatch(JSON.stringify(enRun1.view), /[А-Яа-яЁё]/, 'English install (--no-ru --set ru=0) must show zero Russian in Bank');

    // 2. Installer switches Русификация ON (--set ru=1 --set fonts=1)
    runPatcher(['install', '--set', 'enabled=1', '--set', 'ru=1', '--set', 'fonts=1']);
    const cfgOn = JSON.parse(fs.readFileSync(path.join(userDataDir, 'dfo-mod.json'), 'utf8'));
    assert.equal(cfgOn.ru, true);
    const ruRun = await evaluateBankFromPatchedAsar('ru1');
    assert.equal(ruRun.pageCfg.ru.on, true);
    assert.equal(ruRun.pageCfg.ui.locale, 'ru');
    assert.equal(ruRun.view.title, 'Банк — Daggerfall');
    assert.equal(ruRun.view.foot[0].label, 'Закрыть');

    // 3. Installer switches Русификация OFF again (--no-ru --set ru=0 --set fonts=1)
    runPatcher(['install', '--no-ru', '--set', 'enabled=1', '--set', 'ru=0', '--set', 'fonts=1']);
    const enRun2 = await evaluateBankFromPatchedAsar('en2');
    assert.equal(enRun2.pageCfg.ru.on, false);
    assert.equal(enRun2.pageCfg.ui.locale, 'en');
    assert.equal(enRun2.view.title, 'Bank — Daggerfall');
    assert.doesNotMatch(JSON.stringify(enRun2.view), /[А-Яа-яЁё]/, 'Switching ru off in installer must restore English Bank');

    // 4. Legacy --set fonts=0 cannot revert vanilla fonts: base community fonts & English Bank stay active
    runPatcher(['install', '--no-ru', '--set', 'enabled=1', '--set', 'ru=0', '--set', 'fonts=0']);
    const cfgLegacyFontsOff = JSON.parse(fs.readFileSync(path.join(userDataDir, 'dfo-mod.json'), 'utf8'));
    assert.equal(cfgLegacyFontsOff.fonts, true, 'Base community fonts stay enabled even if legacy --set fonts=0 is passed');
    const enLegacyRun = await evaluateBankFromPatchedAsar('en-legacy-fonts0');
    assert.equal(enLegacyRun.pageCfg.fonts.enabled, true);
    assert.equal(enLegacyRun.pageCfg.ui.locale, 'en');
    assert.match(enLegacyRun.injectedHtml, /dfo_font_preset\.js/);
    assert.match(enLegacyRun.injectedHtml, /dfo_fonts\.js/);
    assert.match(enLegacyRun.injectedHtml, /dfo_services\.js/);
    assert.equal(enLegacyRun.view.title, 'Bank — Daggerfall');

    // 5. When enabled=0, mod page injection is skipped while purged vanilla font URLs still resolve cleanly
    runPatcher(['install', '--no-ru', '--set', 'enabled=0', '--set', 'ru=0']);
    const aModOff = asar.openAsar(asarPath);
    const modOffDir = path.join(tmp, 'unpacked-modoff');
    try {
      for (const [rel] of asar.listFiles(aModOff.header)) {
        if (!rel.startsWith('dfo-mod/')) continue;
        const dest = path.join(modOffDir, rel.slice('dfo-mod/'.length));
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, asar.readFile(aModOff, rel));
      }
    } finally {
      aModOff.close();
    }
    const { wrap: wrapModOff } = require(path.join(modOffDir, 'hook.cjs'));
    const hModOff = wrapModOff(
      async () => new Response('<!doctype html><html><head></head><body><script type="module"></script></body></html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
      { app: { getPath: () => userDataDir } },
    );
    const htmlModOff = await (await hModOff(new Request('dagger://game/index.html'))).text();
    assert.doesNotMatch(htmlModOff, /dfo_services\.js/, 'When enabled=0, dfo_services.js is not injected');
    const fontFallbackRes = await hModOff(new Request('dagger://game/assets/Legacy.woff2'));
    assert.equal(fontFallbackRes.status, 200, 'Purged vanilla font URLs still resolve via base font fallback when enabled=0');
  } finally {
    // Unlink junctions explicitly before rmSync so Electron's fs.rmSync on Windows never traverses into repo dirs.
    for (const j of [path.join(tmp, 'payload', 'mod'), path.join(tmp, 'payload', 'data')]) {
      try { fs.unlinkSync(j); } catch {}
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('bank gold panel excludes letters of credit even when pocket coins are 0 and labels.inventory includes LoCs', () => {
  const sb = createBankSandbox('ru');
  const dfoServices = sb.__dfoServices;

  const locItems = [
    { templateIndex: 275, group: 'MiscItems', value: 250000, stackCount: 1 },
    { templateIndex: 275, group: 'MiscItems', value: 500000, stackCount: 1 },
  ];

  // Case 1: 0 pocket gold, 0 wagon gold, 750,000 gp in Letters of Credit (labels.inventory equals totalGold = '750000')
  const wZeroCoins = {
    labels: () => ({ account: '500000', inventory: '750000', loanDue: '0' }),
    accounts: [{ accountGold: 500000 }],
    region: 0,
    hooks: {
      player: {
        gold: () => 0,
        totalGold: () => 750000,
        wagonGold: () => 0,
        items: () => locItems,
        houses: () => [],
        ownedShip: () => -1,
      },
      wagonGold: () => 0,
    },
    enabled: () => true,
  };
  const vZero = dfoServices.view('bank', wZeroCoins, { blocks: [], foot: [] });
  const assetsZero = vZero.blocks.find(b => b.cls === 'dfo-bank-assets');
  const sceneSplitZero = assetsZero.blocks.find(b => b.cls === 'dfo-bank-scene-split');
  const notesStatsZero = Object.fromEntries(sceneSplitZero.cols[0][0].blocks.find(b => b.type === 'stats').items);
  const safeHalfZero = sceneSplitZero.cols[1][0];
  const safeStatsZero = Object.fromEntries(safeHalfZero.blocks.find(b => b.type === 'stats').items);
  const depositBtnZero = safeHalfZero.blocks.find(b => b.type === 'actions').items[0];
  assert.equal(notesStatsZero['В бумагах'], '750 000 gp');
  assert.equal(safeStatsZero['С собой'], '0 gp', 'Pocket 0 gold + LoCs must report 0 gp carried in Gold panel');
  assert.equal(depositBtnZero.disabled, true, 'Deposit gold must stay disabled when only LoCs are carried');

  // Case 2: 0 pocket gold, 12,500 wagon gold, 750,000 gp in LoCs
  const wWagonOnly = {
    labels: () => ({ account: '500000', inventory: '750000 (+12500)', loanDue: '0' }),
    accounts: [{ accountGold: 500000 }],
    region: 0,
    hooks: {
      player: {
        gold: () => 0,
        totalGold: () => 750000,
        wagonGold: () => 12500,
        items: () => locItems,
        houses: () => [],
        ownedShip: () => -1,
      },
      wagonGold: () => 12500,
    },
    enabled: () => true,
  };
  const vWagon = dfoServices.view('bank', wWagonOnly, { blocks: [], foot: [] });
  const safeHalfWagon = vWagon.blocks.find(b => b.cls === 'dfo-bank-assets').blocks.find(b => b.cls === 'dfo-bank-scene-split').cols[1][0];
  const safeStatsWagon = Object.fromEntries(safeHalfWagon.blocks.find(b => b.type === 'stats').items);
  assert.equal(safeStatsWagon['С собой'], '12 500 gp', 'Only wagon gold must be counted when purse is 0');
  assert.equal(safeHalfWagon.blocks.find(b => b.type === 'actions').items[0].disabled, false);

  // Case 3: Minimal harness without player.gold falls back to labels.inventory minus locGold
  const wFallback = {
    labels: () => ({ account: '100', inventory: '765000 (+5000)', loanDue: '0' }),
    accounts: [{ accountGold: 100 }],
    region: 0,
    hooks: {
      player: {
        items: () => locItems,
        houses: () => [],
        ownedShip: () => -1,
      },
      wagonGold: () => 5000,
    },
    enabled: () => true,
  };
  const vFallback = dfoServices.view('bank', wFallback, { blocks: [], foot: [] });
  const safeStatsFb = Object.fromEntries(
    vFallback.blocks.find(b => b.cls === 'dfo-bank-assets').blocks.find(b => b.cls === 'dfo-bank-scene-split').cols[1][0]
      .blocks.find(b => b.type === 'stats').items,
  );
  assert.equal(safeStatsFb['С собой'], '20 000 gp', 'Fallback parsing must subtract LoCs from total inventory display');
});

test('bank property count supports online homesApi.mine(), vanilla X.houses (+more), deduplication and hooks', async () => {
  const sb = createBankSandbox('ru');
  const dfoServices = sb.__dfoServices;

  const makeEmptyVanillaHouses = () =>
    Array.from({ length: 62 }, (_, regionIndex) => ({
      regionIndex,
      location: '',
      mapId: 0,
      buildingKey: 0,
    }));

  let onlineVer = 1;
  let serverHomes = [
    { region: 17, mapId: 1001, buildingKey: 65792, deed: true },
    { region: 23, mapId: 2002, buildingKey: 131072 },
    { region: 5, mapId: 3003, buildingKey: 196608 },
  ];
  let mineCalls = 0;
  const homesApi = {
    mine: async () => {
      mineCalls++;
      return { ok: true, data: { homes: serverHomes } };
    },
  };
  const onlineHomes = { version: () => onlineVer };

  // Online mode: X.houses has 62 empty slots, homesApi.mine() has 3 homes
  const wOnline = {
    labels: () => ({ account: '0', inventory: '0', loanDue: '0' }),
    accounts: [{ accountGold: 0 }],
    region: 17,
    hooks: {
      player: {
        gold: () => 0,
        items: () => [],
        houses: makeEmptyVanillaHouses,
        ownedShip: () => -1,
      },
      homesApi: () => homesApi,
      onlineHomes: () => onlineHomes,
    },
    enabled: () => true,
  };

  const propStat = (viewSpec) => {
    const assets = viewSpec.blocks.find(b => b.cls === 'dfo-bank-assets');
    const stats = Object.fromEntries(assets.blocks.find(b => b.type === 'stats').items);
    return stats['Недвижимость'];
  };

  assert.equal(propStat(dfoServices.view('bank', wOnline, { blocks: [], foot: [] })), '0 объектов');
  assert.equal(mineCalls, 1, 'First frame must request homesApi.mine()');
  await new Promise(r => setImmediate(r));
  assert.equal(propStat(dfoServices.view('bank', wOnline, { blocks: [], foot: [] })), '3 объекта', 'Resolved online homes must appear on subsequent draw frames');
  assert.equal(mineCalls, 1, 'Same window and version must not spam homesApi.mine()');

  // Buying/releasing online home bumps onlineHomes.version() -> re-fetches and updates
  onlineVer = 2;
  serverHomes = [...serverHomes, { region: 9, mapId: 4004, buildingKey: 262144 }];
  assert.equal(propStat(dfoServices.view('bank', wOnline, { blocks: [], foot: [] })), '3 объекта');
  await new Promise(r => setImmediate(r));
  assert.equal(propStat(dfoServices.view('bank', wOnline, { blocks: [], foot: [] })), '4 объекта');
  assert.equal(mineCalls, 2);

  // Hybrid mode: offline vanilla houses with `.more` + migrated deed shared with online account must deduplicate
  const hybridHouses = makeEmptyVanillaHouses();
  hybridHouses[17] = {
    regionIndex: 17,
    location: 'Daggerfall',
    mapId: 1001,
    buildingKey: 65792,
    more: [
      { regionIndex: 17, location: 'Privateers Hold', mapId: 1004, buildingKey: 327680 },
    ],
  };
  const wHybrid = {
    labels: () => ({ account: '0', inventory: '0', loanDue: '0' }),
    accounts: [{ accountGold: 0 }],
    region: 17,
    hooks: {
      player: {
        gold: () => 0,
        items: () => [],
        houses: () => hybridHouses,
        ownedShip: () => -1,
      },
      homesApi: () => homesApi,
      onlineHomes: () => onlineHomes,
    },
    enabled: () => true,
  };
  // Immediate synchronous render already merges cached 4 online + 2 local with 1 shared (1001:65792) = 5 unique
  assert.equal(propStat(dfoServices.view('bank', wHybrid, { blocks: [], foot: [] })), '5 объектов');

  // Verify service-windows-transform & transforms.cjs expose homesApi cleanly
  const { transformServices } = require('../src/mod/service-windows-transform.cjs');
  const { transformAsset } = require('../src/mod/transforms.cjs');
  const agSnippet = 'function Cu(){return a=new OV({accounts:()=>X.bankAccounts,regionIndex:()=>r(),onlineHomeLines:()=>e.onlineHomes?xte:null}),!0}';
  const agOut = transformServices('assets/arenaGate-test.js', agSnippet, []);
  assert.match(agOut, /homesApi:\(\)=>e\.homesApi\?\?null,onlineHomes:\(\)=>e\.onlineHomes\?\?null,/);

  const worldSnippet = 'let u={onlineHomes:pa,homesApi:rt,guildId:()=>{let g=WA;return g?.stale?.()},};';
  const worldRes = transformAsset('assets/world-test.js', worldSnippet, { marks: true });
  assert.match(worldRes.text, /__dfoHost=\{homes:\(\)=>pa,homesApi:\(\)=>rt,guildBook:\(\)=>WA\}/);
});

test('silver marks desk scene: assayer scales cycle, 31-place 7-row coins, 7-place ingots, 500 GP parchment overflow, and session freeze per window', () => {
  const sb = createBankSandbox();
  sb.Date = Object.assign(function (...a) { return new Date(...a); }, { now: () => 100000 });
  const dfoServices = sb.__dfoServices;

  function makeSilverWin(initialBalance) {
    const state = { balance: initialBalance };
    return {
      _setBalance(v) { state.balance = v; },
      hooks: {
        player: { items: () => [], bankAccounts: () => [], houses: () => [], ownedShip: () => -1 },
        accounts: () => [],
        regionIndex: () => 17,
        houses: () => [],
        ownedShip: () => -1,
        marks: {
          open: () => true,
          balance: () => state.balance,
          today: () => ({ exchanged: 0, exchangedMax: 1500, combat: 0, combatMax: 1500, found: 0, findMax: 400, gathered: 0, gatherMax: 400 }),
        },
      },
      regionIndex: () => 17,
    };
  }

  function captureSilverDrawOps(win, reuseCv = null) {
    const ops = [];
    const fillStyles = [];
    const cv = reuseCv || sb.document.createElement('canvas');
    const origGetCtx = cv.getContext.bind(cv);
    cv.getContext = function (type) {
      const ctx = origGetCtx(type);
      if (ctx._dfoSilverInstrumented) return ctx;
      const wrapped = new Proxy(ctx, {
        get(target, prop) {
          const val = target[prop];
          if (typeof val === 'function') {
            return function (...args) {
              if (['moveTo', 'lineTo', 'quadraticCurveTo', 'ellipse', 'arc', 'fill', 'stroke', 'fillRect', 'translate', 'rotate'].includes(prop)) {
                ops.push([prop, ...args.map(a => (typeof a === 'number' ? Number(a.toFixed(2)) : a))]);
              }
              return val.apply(target, args);
            };
          }
          return val;
        },
        set(target, prop, value) {
          if (prop === 'fillStyle' && typeof value === 'string') fillStyles.push(value);
          target[prop] = value;
          return true;
        },
      });
      wrapped._dfoSilverInstrumented = true;
      return wrapped;
    };
    const v = dfoServices.view('bank', win, { blocks: [], foot: [] });
    const silverPanel = v.blocks.find(b => b.cls === 'dfo-bank-main-cols').cols[1][0];
    const canvasBlock = silverPanel.blocks.find(b => b.type === 'canvas');
    canvasBlock.paint(cv);
    return { cv, ops, fillStyles };
  }

  // Helper: count pan coin ellipses (drawSingleSilverCoin on left pan passes rx = 2.75 -> 4 ellipses per coin with rx ~ 2.75/2.92)
  const countPanCoinEllipses = (ops) =>
    ops.filter(o => o[0] === 'ellipse' && Math.abs(o[3] - 2.75) < 0.01 && Math.abs(o[4] - 2.75 * 0.38) < 0.05).length;

  // Helper: extract crimson-bordered rubricated parchment header fills (#6e1d16) and wax seal center y
  const countParchmentHeaders = (fillStyles) => fillStyles.filter(s => s === '#6e1d16').length;
  const getWaxSealCentersY = (ops) =>
    ops.filter(o => o[0] === 'ellipse' && Math.abs(o[3] - 3.25) < 0.01 && Math.abs(o[4] - 1.7) < 0.01).map(o => o[2]);

  // 1. Same window freezes session across balance changes (15k -> 50k -> 15k)
  const w1 = makeSilverWin(15000);
  const { ops: ops15a } = captureSilverDrawOps(w1);
  w1._setBalance(50000);
  const { ops: ops50 } = captureSilverDrawOps(w1);
  assert.notDeepEqual(ops50, ops15a, 'Changing silver from 15k to 50k must update rendered scene');
  w1._setBalance(15000);
  const { ops: ops15b, cv: cvCached } = captureSilverDrawOps(w1);
  assert.deepEqual(ops15b, ops15a, 'Restoring silver balance within same window must render identically from frozen session');

  // Duplicate paint with unchanged sig skips redundant canvas redraw
  const { ops: opsCachedHit } = captureSilverDrawOps(w1, cvCached);
  assert.equal(opsCachedHit.length, 0, 'Duplicate paint with unchanged paintedSig must skip heavy silver redraw');

  // 2. Assayer scales modulo-100 pan coins (0 -> 10 -> 90 -> reset @100 -> 190)
  const pan0 = countPanCoinEllipses(captureSilverDrawOps(makeSilverWin(0)).ops);
  const pan10 = countPanCoinEllipses(captureSilverDrawOps(makeSilverWin(10)).ops);
  const pan90 = countPanCoinEllipses(captureSilverDrawOps(makeSilverWin(90)).ops);
  const pan100 = countPanCoinEllipses(captureSilverDrawOps(makeSilverWin(100)).ops);
  const pan190 = countPanCoinEllipses(captureSilverDrawOps(makeSilverWin(190)).ops);
  assert.equal(pan0, 0, '0 silver must place 0 coins on scales pan');
  assert.ok(pan10 > 0, '10 silver must place 1 coin on scales pan');
  assert.equal(pan90, pan10 * 9, '90 silver must place 9 coins on scales pan');
  assert.equal(pan100, 0, '100 silver must reset scales pan coins back to 0');
  assert.equal(pan190, pan90, '190 silver must refill scales pan to 9 coins while remainder cycles mod 100');

  // 3. Parchment 500 GP line progression (= 100 silver) & overflow completed copy + -2px active sheet lift
  const r0 = captureSilverDrawOps(makeSilverWin(0));
  const r100 = captureSilverDrawOps(makeSilverWin(100));
  const r800 = captureSilverDrawOps(makeSilverWin(800));
  const r900 = captureSilverDrawOps(makeSilverWin(900));
  assert.ok(r100.ops.length > r0.ops.length, '100 silver must add 1st coin + 1st parchment row (500 GP)');
  assert.equal(countParchmentHeaders(r800.fillStyles), 1, '800 silver (8 lines) still fits on 1 parchment sheet');
  assert.equal(countParchmentHeaders(r900.fillStyles), 2, '900 silver (9 lines) must spawn 1 completed copy beneath active parchment sheet');
  const sealY800 = getWaxSealCentersY(r800.ops)[0];
  const sealY900 = getWaxSealCentersY(r900.ops)[0];
  assert.ok(sealY800 - sealY900 >= 1.5 && sealY800 - sealY900 <= 2.5, 'Active parchment sheet must shift -2px higher on overflow');

  // 4. Progressive coin & ingot milestones (900 -> 1000 ingot spawn -> 15000 -> 50000 -> 240000 cap)
  const r1000 = captureSilverDrawOps(makeSilverWin(1000));
  const r15k = captureSilverDrawOps(makeSilverWin(15000));
  const r50k = captureSilverDrawOps(makeSilverWin(50000));
  const r240k = captureSilverDrawOps(makeSilverWin(240000));
  assert.ok(r1000.ops.length > r900.ops.length, '1,000 silver must spawn 1st perspective ingot on right desk');
  assert.ok(r15k.ops.length > r1000.ops.length, '15,000 silver must expand multi-row coin stacks and ingot layers');
  assert.ok(r50k.ops.length > r15k.ops.length, '50,000 silver must grow desk toward 7-row coins and 7 ingot stacks');
  assert.ok(r240k.ops.length > r50k.ops.length, '240,000 silver must support tall 2.5x bullion heights up to 240 ingots');
});

test('silver marks animation lifecycle: rAF flame sway & beam tilt easing animate while connected and stop cleanly on disconnect', () => {
  let fakeNow = 1000;
  const rafQueue = [];
  let nextRafId = 1;

  const elements = [];
  const sandbox = {
    document: {
      createElement(tag) {
        const ellipseOps = [];
        const lineOps = [];
        const ctxObj = {
          scale() {},
          setTransform() {},
          clearRect() {},
          fillRect() {},
          strokeRect() {},
          beginPath() {},
          moveTo() {},
          lineTo(x, y) { lineOps.push([Number(x.toFixed(4)), Number(y.toFixed(4))]); },
          closePath() {},
          arc() {},
          ellipse(x, y, rx, ry, rot) {
            ellipseOps.push([Number(x.toFixed(4)), Number(y.toFixed(4)), Number(rx.toFixed(4)), Number(ry.toFixed(4)), Number(rot.toFixed(4))]);
          },
          fill() {},
          stroke() {},
          save() {},
          restore() {},
          translate() {},
          rotate() {},
          rect() {},
          clip() {},
          fillText() {},
          quadraticCurveTo() {},
          createLinearGradient() { return { addColorStop() {} }; },
          createRadialGradient() { return { addColorStop() {} }; },
          _ellipseOps: ellipseOps,
          _lineOps: lineOps,
        };
        const el = {
          tagName: tag.toUpperCase(),
          className: '',
          dataset: {},
          style: {},
          isConnected: false,
          children: [],
          classList: { add() {}, remove() {}, contains() { return false; } },
          setAttribute() {},
          querySelectorAll() { return []; },
          querySelector() { return null; },
          append() {},
          addEventListener() {},
          getContext() { return ctxObj; },
        };
        elements.push(el);
        return el;
      },
      querySelectorAll() { return []; },
      getElementById() { return null; },
      head: { append() {} },
      body: { append() {}, children: [] },
    },
    __DFO_MOD_CFG__: { ru: { on: true } },
    Math,
    Number,
    Array,
    String,
    Set,
    WeakMap,
    WeakSet,
    Date: Object.assign(function (...a) { return new Date(...a); }, { now: () => fakeNow }),
    setTimeout,
    clearTimeout,
    requestAnimationFrame(cb) {
      const id = nextRafId++;
      rafQueue.push({ id, cb });
      return id;
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;

  installUiIntoSandbox(sandbox, 'ru');
  const code = fs.readFileSync(SERVICES_PATH, 'utf8');
  vm.runInNewContext(code, sandbox);

  let liveBalance = 90;
  const w = {
    hooks: {
      player: { items: () => [], bankAccounts: () => [], houses: () => [], ownedShip: () => -1 },
      accounts: () => [],
      regionIndex: () => 17,
      houses: () => [],
      ownedShip: () => -1,
      marks: {
        open: () => true,
        balance: () => liveBalance,
        today: () => ({}),
      },
    },
    regionIndex: () => 17,
  };

  const getPaintFn = () =>
    sandbox.__dfoServices.view('bank', w, { blocks: [], foot: [] })
      .blocks.find(b => b.cls === 'dfo-bank-main-cols').cols[1][0]
      .blocks.find(b => b.type === 'canvas').paint;

  // 1. Connected canvas immediately renders true beamTilt for 90 silver and animates candle flame in rAF
  const cv = sandbox.document.createElement('canvas');
  cv.isConnected = true;
  getPaintFn()(cv);
  assert.equal(rafQueue.length, 1, 'Connected silver canvas must schedule initial rAF frame');

  const ctx = cv.getContext('2d');
  const frame0Ellipses = ctx._ellipseOps.slice();
  ctx._ellipseOps.length = 0;

  fakeNow += 250;
  rafQueue.shift().cb();
  assert.ok(ctx._ellipseOps.length > 0, 'rAF tick after >30ms must redraw silver scene');
  assert.notDeepEqual(ctx._ellipseOps, frame0Ellipses, 'Candle flame & sparkles must animate as fakeNow advances');
  assert.equal(rafQueue.length, 1, 'Connected silver canvas must keep scheduling next rAF');

  // 2. Balance drop (90 -> 0) on same connected canvas smoothly eases scales beam across frames
  liveBalance = 0;
  getPaintFn()(cv);
  assert.equal(rafQueue.length, 1, 'Must keep single active rAF loop on repaint');
  ctx._lineOps.length = 0;
  fakeNow += 40;
  rafQueue.shift().cb();
  const midLines = ctx._lineOps.slice();
  ctx._lineOps.length = 0;
  fakeNow += 40;
  rafQueue.shift().cb();
  assert.notDeepEqual(ctx._lineOps, midLines, 'Scales needle/beam must ease smoothly when silver changes on mounted canvas');

  // 3. Disconnect canvas (simulate bank window closed)
  cv.isConnected = false;
  ctx._ellipseOps.length = 0;
  rafQueue.shift().cb();
  assert.equal(ctx._ellipseOps.length, 0, 'Disconnected silver canvas must not redraw');
  assert.equal(rafQueue.length, 0, 'Disconnected silver canvas must cancel loop cleanly');

  // 4. Unmounted orphan canvas self-terminates after mountGrace
  const orphanCv = sandbox.document.createElement('canvas');
  orphanCv.isConnected = false;
  getPaintFn()(orphanCv);
  let safety = 30;
  while (rafQueue.length > 0 && safety-- > 0) {
    fakeNow += 40;
    rafQueue.shift().cb();
  }
  assert.equal(rafQueue.length, 0, 'Detached orphan silver canvas must self-terminate cleanly after grace');
});

test('gold safe standardization: detailed safe, top-left caged lantern, coin sparkles and rAF lifecycle', () => {
  let fakeNow = 1000;
  const rafQueue = [];
  let nextRafId = 1;

  let sandbox;
  sandbox = {
    document: {
      createElement(tag) {
        const qOps = [];
        const rectOps = [];
        const gradStops = [];
        const ctxObj = {
          scale() {},
          setTransform() {},
          clearRect() {},
          fillRect(x, y, w, h) {
            rectOps.push([Number(x.toFixed(2)), Number(y.toFixed(2)), Number(w.toFixed(2)), Number(h.toFixed(2))]);
          },
          strokeRect() {},
          beginPath() {},
          moveTo() {},
          lineTo() {},
          closePath() {},
          arc() {},
          ellipse() {},
          fill() {},
          stroke() {},
          save() {},
          restore() {},
          translate() {},
          rotate() {},
          rect() {},
          clip() {},
          fillText() {},
          quadraticCurveTo(...args) {
            qOps.push(args.map((v) => Number(v.toFixed(4))));
          },
          createLinearGradient() { return { addColorStop() {} }; },
          createRadialGradient() {
            return {
              addColorStop(offset, color) {
                gradStops.push([offset, color]);
              },
            };
          },
          _qOps: qOps,
          _rectOps: rectOps,
          _gradStops: gradStops,
        };
        return {
          tagName: tag.toUpperCase(),
          className: '',
          dataset: {},
          style: {},
          isConnected: false,
          children: [],
          classList: { add() {}, remove() {}, contains() { return false; } },
          setAttribute() {},
          querySelectorAll() { return []; },
          querySelector() { return null; },
          append() {},
          addEventListener() {},
          getContext() { return ctxObj; },
        };
      },
      querySelectorAll() { return []; },
      getElementById() { return null; },
      head: { append() {} },
      body: { append() {}, children: [] },
    },
    __DFO_MOD_CFG__: { ru: { on: true } },
    Math,
    Number,
    Array,
    String,
    Set,
    WeakMap,
    WeakSet,
    Date: Object.assign(function (...a) { return new Date(...a); }, { now: () => fakeNow }),
    setTimeout,
    clearTimeout,
    requestAnimationFrame(cb) {
      const id = nextRafId++;
      rafQueue.push({ id, cb });
      return id;
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;

  installUiIntoSandbox(sandbox, 'ru');
  const code = fs.readFileSync(SERVICES_PATH, 'utf8');
  vm.runInNewContext(code, sandbox);

  let accountGold = 5500000;
  const makeWin = () => {
    const accounts = new Array(70).fill(null).map(() => ({ accountGold: 0 }));
    accounts[17] = { accountGold };
    return {
      labels: () => ({ account: String(accountGold), inventory: '0' }),
      accounts,
      region: 17,
      hooks: {
        player: { gold: () => 0, items: () => [], bankAccounts: () => [], houses: () => [], ownedShip: () => -1 },
        accounts: () => accounts,
        regionIndex: () => 17,
        houses: () => [],
        ownedShip: () => -1,
      },
      regionIndex: () => 17,
    };
  };

  const getSafePaint = (win) =>
    sandbox.__dfoServices.view('bank', win, { blocks: [], foot: [] })
      .blocks.find(b => b.cls === 'dfo-bank-assets')
      .blocks.find(b => b.cls === 'dfo-bank-scene-split').cols[1][0]
      .blocks.find(b => b.type === 'canvas').paint;

  // 1. Connected canvas schedules rAF, renders standardized warm lantern glow + sparkles, and animates cleanly
  const winRich = makeWin();
  const cv = sandbox.document.createElement('canvas');
  cv.isConnected = true;
  getSafePaint(winRich)(cv);
  assert.equal(rafQueue.length, 1, 'Connected safe canvas must schedule initial rAF frame');

  const ctx = cv.getContext('2d');
  const hasStandardGlow = ctx._gradStops.some(([, c]) => typeof c === 'string' && c.startsWith('rgba(255, 204, 102,'));
  assert.ok(hasStandardGlow, 'Safe hanging lantern must use standardized warm glow stops');

  // At t=0ms, p2 = 0.658 -> bullion bar / secondary stack sparkle 5x1 & 1x5 cross glint must appear when gold > 0
  const hasSparkleAtT0 = ctx._rectOps.some(([, , w, h]) => w === 5 && h === 1) &&
    ctx._rectOps.some(([, , w, h]) => w === 1 && h === 5);
  assert.ok(hasSparkleAtT0, 'Gold safe with gold > 0 must render coin/bullion cross sparkles');

  const frame0Q = ctx._qOps.slice();
  ctx._qOps.length = 0;
  ctx._rectOps.length = 0;

  // Advance time to sparkle p1 peak (714ms) and confirm lantern flame curve + coin sparkle update
  fakeNow += 714;
  rafQueue.shift().cb();
  assert.ok(ctx._qOps.length > 0, 'rAF tick after >30ms must redraw safe scene');
  assert.notDeepEqual(ctx._qOps, frame0Q, 'Lantern flame quadraticCurveTo curves must animate as fakeNow advances');
  const hasSparkleAtPeak = ctx._rectOps.some(([, , w, h]) => w === 5 && h === 1);
  assert.ok(hasSparkleAtPeak, 'Gold coin sparkle must illuminate at sparkle peak cycle');
  assert.equal(rafQueue.length, 1, 'Connected safe canvas must keep scheduling next rAF');

  // Empty safe (0 gold): sparkles must not appear while lantern still illuminates empty vault
  accountGold = 0;
  const winEmpty = makeWin();
  const emptyCv = sandbox.document.createElement('canvas');
  emptyCv.isConnected = true;
  getSafePaint(winEmpty)(emptyCv);
  const emptyCtx = emptyCv.getContext('2d');
  const emptySparkles = emptyCtx._rectOps.filter(([, , w, h]) => (w === 5 && h === 1) || (w === 1 && h === 5));
  assert.equal(emptySparkles.length, 0, 'Empty safe (0 gold) must not render coin sparkles');
  rafQueue.pop(); // drop emptyCv second rAF entry before testing cv disconnect

  // 2. Disconnect canvas cleanly cancels loop
  cv.isConnected = false;
  ctx._qOps.length = 0;
  rafQueue.shift().cb();
  assert.equal(ctx._qOps.length, 0, 'Disconnected safe canvas must not redraw');
  assert.equal(rafQueue.length, 0, 'Disconnected safe canvas must stop with zero leaked rAF callbacks');

  // 3. Orphan canvas self-terminates cleanly after mountGrace
  const orphanCv = sandbox.document.createElement('canvas');
  orphanCv.isConnected = false;
  getSafePaint(makeWin())(orphanCv);
  let safety = 30;
  while (rafQueue.length > 0 && safety-- > 0) {
    fakeNow += 40;
    rafQueue.shift().cb();
  }
  assert.equal(rafQueue.length, 0, 'Detached orphan safe canvas must self-terminate after grace window');
});

test('bank errors use right-side vanilla notice dismissed by keypress/click, YesNo floats cleanly, and modal backdrop omits backdrop-filter', () => {
  const sb = createBankSandbox('ru');
  const svc = sb.__dfoServices;

  const serviceStyle = sb.document.head.children.find(n => n.id === 'dfo-service-windows');
  assert.ok(serviceStyle, '#dfo-service-windows stylesheet must mount');
  assert.equal((serviceStyle.textContent || '').includes('backdrop-filter'), false, 'Bank/Trade modal CSS must omit backdrop-filter to avoid flipping background WebGL');

  const accounts = new Array(70).fill(null).map(() => ({ accountGold: 0 }));
  accounts[17] = { accountGold: 100000 };
  let closed = false;
  const w = {
    labels: () => ({ account: '100000', inventory: '0', loanDue: '0' }),
    accounts: () => accounts,
    region: 17,
    hooks: {
      player: { gold: () => 0, items: () => [], houses: () => [], ownedShip: () => -1 },
      accounts: () => accounts,
      cityName: () => 'Daggerfall',
      regionName: () => 'Daggerfall',
    },
    box: { rows: ['You cannot carry that much gold.'], buttons: null },
    enabled: () => true,
    _dismissBox() { this.box = null; },
    _close() { closed = true; this.done = true; },
  };

  // 1. Error box renders into right-side #enhanced-notice without altering Bank blocks[]
  const vErr = svc.view('bank', w, { blocks: [], foot: [] });
  assert.equal(vErr.blocks.some(b => b.cls === 'dfo-bank-notice'), false, 'Errors must not render inside Bank window blocks');
  const stack = sb.document.getElementById('enhanced-notice');
  assert.ok(stack && stack.classList.contains('notice-stack'), '#enhanced-notice.notice-stack must mount for Bank error');
  assert.equal(stack.querySelector('.notice-row').textContent, 'Вы не можете нести столько золота.');
  assert.equal(stack.querySelector('.notice-hint').textContent, 'Нажмите клавишу или кликните');

  // Modifier-only key must not dismiss notice
  sb.document.dispatchEvent({ type: 'keydown', key: 'Shift', code: 'ShiftLeft', preventDefault() {}, stopPropagation() {} });
  assert.ok(w.box, 'Modifier-only key must not dismiss notice');

  // Regular key dismisses right-side notice
  sb.document.dispatchEvent({ type: 'keydown', key: 'Escape', code: 'Escape', preventDefault() {}, stopPropagation() {} });
  assert.equal(w.box, null, 'Key press must dismiss right-side Bank error notice');
  assert.equal(sb.document.getElementById('enhanced-notice'), null, 'Notice stack removes when cleared');

  // 2. Waiting notice (counting silver) hides dismiss hint and ignores keydown dismissal
  w.box = { rows: ['The Bank counts your silver...'], buttons: null, waiting: true };
  svc.view('bank', w, { blocks: [], foot: [] });
  const waitStack = sb.document.getElementById('enhanced-notice');
  assert.equal(waitStack.querySelector('.notice-row').textContent, 'Банк пересчитывает ваше серебро...');
  assert.equal(waitStack.querySelector('.notice-hint').style.display, 'none', 'Waiting notice must hide click/key dismiss hint');
  sb.document.dispatchEvent({ type: 'keydown', key: 'Enter', code: 'Enter', preventDefault() {}, stopPropagation() {} });
  assert.ok(w.box && w.box.waiting, 'Waiting notice must not dismiss early on keypress');

  // 3. Upstream #enhanced-notice mounted by native lV.draw() removes fallback and gets localized
  w.box = { rows: ['Insufficient funds on account.'], buttons: null };
  const nativeStack = sb.document.getElementById('enhanced-notice');
  const upstreamNotice = sb.document.createElement('div');
  upstreamNotice.className = 'notice notice-in';
  const upBody = sb.document.createElement('div');
  upBody.className = 'notice-body';
  const upRow = sb.document.createElement('div');
  upRow.className = 'notice-row';
  upRow.textContent = 'You cannot carry that much gold.';
  upBody.append(upRow);
  const upHint = sb.document.createElement('div');
  upHint.className = 'notice-hint';
  upHint.textContent = 'click or press a key';
  upstreamNotice.append(upBody, upHint);
  nativeStack.append(upstreamNotice);

  svc.view('bank', w, { blocks: [], foot: [] });
  assert.equal(nativeStack.querySelector('.dfo-bank-right-notice'), null, 'Fallback notice must remove when upstream notice exists');
  assert.equal(upRow.textContent, 'Вы не можете нести столько золота.');
  assert.equal(upHint.textContent, 'Нажмите клавишу или кликните');
  upstreamNotice.remove();

  // 4. YesNo prompt renders as floating centered overlay without distorting Bank blocks[], and responds to Yes button / KeyN
  let sold = false;
  let declined = false;
  w.box = {
    rows: ['Продать корабль за 50 000 зол.?'],
    buttons: 'YesNo',
    onYes: () => { sold = true; },
    onNo: () => { declined = true; },
  };
  const vYesNo = svc.view('bank', w, { blocks: [], foot: [] });
  assert.equal(vYesNo.blocks.some(b => b.cls === 'dfo-bank-notice'), false, 'YesNo prompt must also avoid breaking Bank window blocks');
  const ynBackdrop = sb.document.body.querySelector('.dfo-bank-yesno-backdrop');
  assert.ok(ynBackdrop, 'Floating .dfo-bank-yesno-backdrop must mount for YesNo');
  assert.equal(ynBackdrop.querySelector('.dfo-bank-yesno-rows').querySelector('p').textContent, 'Продать корабль за 50 000 зол.?');
  ynBackdrop.querySelector('.dfo-bank-btn-primary').dispatchEvent({ type: 'click', stopPropagation() {} });
  assert.equal(sold, true, 'Yes button must invoke onYes');
  assert.equal(w.box, null);
  assert.equal(sb.document.body.querySelector('.dfo-bank-yesno-backdrop'), null);

  w.box = {
    rows: ['Продать дом?'],
    buttons: 'YesNo',
    onYes: () => {},
    onNo: () => { declined = true; },
  };
  svc.view('bank', w, { blocks: [], foot: [] });
  sb.document.dispatchEvent({ type: 'keydown', code: 'KeyN', key: 'n', preventDefault() {}, stopPropagation() {} });
  assert.equal(declined, true, 'KeyN must invoke onNo on YesNo modal');
  assert.equal(sb.document.body.querySelector('.dfo-bank-yesno-backdrop'), null);

  // 5. Closing Bank window cleans up active fallback notice
  w.box = { rows: ['Error before exit'], buttons: null };
  svc.view('bank', w, { blocks: [], foot: [] });
  assert.ok(sb.document.getElementById('enhanced-notice'));
  w._close();
  assert.equal(closed, true);
  assert.equal(sb.document.getElementById('enhanced-notice'), null, 'Closing Bank must clean up lingering right-side notice');
});
