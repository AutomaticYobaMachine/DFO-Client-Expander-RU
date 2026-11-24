'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PAGE_DIR = path.join(__dirname, '../src/mod/page');
const { transformServices } = require('../src/mod/service-windows-transform.cjs');

function createDomSandbox({ ru = true } = {}) {
  function makeClassList(el) {
    const set = new Set();
    return {
      _set: set,
      add(...cls) { for (const c of cls) if (c) set.add(c); el._syncClass(); },
      remove(...cls) { for (const c of cls) set.delete(c); el._syncClass(); },
      toggle(c, force) {
        if (force === undefined) {
          if (set.has(c)) { set.delete(c); el._syncClass(); return false; }
          set.add(c); el._syncClass(); return true;
        }
        if (force) set.add(c); else set.delete(c);
        el._syncClass();
        return !!force;
      },
      contains(c) { return set.has(c); },
    };
  }

  function makeEl(tag, doc) {
    const el = {
      tagName: String(tag).toUpperCase(),
      nodeType: 1,
      ownerDocument: doc,
      parentElement: null,
      children: [],
      attrs: {},
      dataset: {},
      style: {
        _props: {},
        setProperty(k, v) { this._props[k] = v; this[k] = v; },
      },
      _text: '',
      value: '',
      type: '',
      disabled: false,
      open: false,
      scrollTop: 0,
      width: 0,
      height: 0,
      _listeners: {},
      _className: '',
      get isConnected() {
        let p = this;
        while (p) {
          if (p === doc.body || p === doc.head || p === doc.documentElement) return true;
          p = p.parentElement;
        }
        return false;
      },
      get childElementCount() {
        return this.children.filter((c) => typeof c === 'object' && c.nodeType === 1).length;
      },
      get textContent() {
        if (!this.children.length) return this._text;
        return this.children.map((c) => (typeof c === 'string' ? c : c.textContent)).join('');
      },
      set textContent(v) {
        this.children = [];
        this._text = v == null ? '' : String(v);
      },
      get className() { return this._className; },
      set className(v) {
        this._className = String(v || '');
        this.classList._set.clear();
        for (const c of this._className.split(/\s+/)) if (c) this.classList._set.add(c);
      },
      _syncClass() { this._className = [...this.classList._set].join(' '); },
      setAttribute(k, v) {
        this.attrs[k] = String(v);
        if (k === 'class') this.className = v;
        if (k === 'id') this.id = String(v);
        if (k === 'open') this.open = true;
      },
      getAttribute(k) { return this.attrs[k] ?? null; },
      append(...nodes) {
        for (const n of nodes) {
          if (!n) continue;
          if (typeof n === 'object' && n.parentElement) n.remove();
          this.children.push(n);
          if (typeof n === 'object') n.parentElement = this;
        }
      },
      replaceChildren(...nodes) {
        for (const c of this.children) if (typeof c === 'object') c.parentElement = null;
        this.children = [];
        this.append(...nodes);
      },
      remove() {
        if (this.parentElement) {
          const i = this.parentElement.children.indexOf(this);
          if (i >= 0) this.parentElement.children.splice(i, 1);
          this.parentElement = null;
        }
      },
      showModal() { this.open = true; this.attrs.open = ''; },
      close() { this.open = false; delete this.attrs.open; },
      focus() { doc.activeElement = this; },
      blur() { if (doc.activeElement === this) doc.activeElement = null; },
      select() {},
      scrollIntoView() {},
      getBoundingClientRect() { return { left: 100, top: 100, right: 200, bottom: 140, width: 100, height: 40 }; },
      addEventListener(type, fn, capture = false) {
        const key = capture ? `${type}:cap` : type;
        (this._listeners[key] = this._listeners[key] || []).push(fn);
      },
      dispatchEvent(ev) {
        ev.target = ev.target || this;
        for (const fn of (this._listeners[ev.type] || [])) fn(ev);
      },
      matches(sel) {
        return sel.split(',').some((part) => {
          const s = part.trim();
          if (s.startsWith('.')) return this.classList.contains(s.slice(1));
          if (s.startsWith('#')) return this.id === s.slice(1);
          if (s === '[contenteditable]') return this.attrs.contenteditable != null;
          return this.tagName === s.toUpperCase();
        });
      },
      closest(sel) {
        let cur = this;
        while (cur) {
          if (cur.matches?.(sel)) return cur;
          cur = cur.parentElement;
        }
        return null;
      },
      contains(node) {
        let cur = node;
        while (cur) {
          if (cur === this) return true;
          cur = cur.parentElement;
        }
        return false;
      },
      querySelectorAll(sel) {
        const out = [];
        const matchSel = (node, s) => {
          if (!node || typeof node !== 'object') return false;
          const clean = s.replace(/^:scope\s*>\s*/, '');
          if (clean.startsWith('[') && clean.endsWith(']')) {
            const attr = clean.slice(1, -1);
            if (attr === 'data-scroll-key') return node.dataset?.scrollKey != null;
            return node.attrs?.[attr] != null;
          }
          if (clean.includes('.')) {
            const parts = clean.split('.').filter(Boolean);
            if (!clean.startsWith('.')) {
              const tagPart = parts.shift();
              if (node.tagName !== tagPart.toUpperCase()) return false;
            }
            return parts.every((c) => node.classList?.contains(c));
          }
          if (clean.startsWith('#')) return node.id === clean.slice(1);
          return node.tagName === clean.toUpperCase();
        };
        const directOnly = sel.trim().startsWith(':scope >');
        const scan = (node) => {
          for (const ch of node.children || []) {
            if (typeof ch !== 'object') continue;
            if (matchSel(ch, sel)) out.push(ch);
            if (!directOnly) scan(ch);
          }
        };
        scan(this);
        return out;
      },
      querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
      getContext() {
        return {
          save() {}, restore() {}, clearRect() {}, fillRect() {}, strokeRect() {}, drawImage() {},
          createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
          putImageData() {},
          beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, ellipse() {}, roundRect() {},
          quadraticCurveTo() {}, bezierCurveTo() {}, fill() {}, stroke() {}, clip() {},
          translate() {}, rotate() {}, scale() {}, setTransform() {}, reset() {},
          setLineDash() {}, fillText() {}, strokeText() {}, measureText() { return { width: 10 }; },
          createLinearGradient() { return { addColorStop() {} }; },
          createRadialGradient() { return { addColorStop() {} }; },
        };
      },
    };
    el.classList = makeClassList(el);
    return el;
  }

  const doc = {
    hidden: false,
    activeElement: null,
    _listeners: {},
    createElement(tag) { return makeEl(tag, doc); },
    createElementNS(_ns, tag) { return makeEl(tag, doc); },
    createTextNode(t) { return { nodeType: 3, textContent: String(t ?? ''), remove() {} }; },
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
    removeEventListener() {},
  };
  doc.documentElement = makeEl('html', doc);
  doc.head = makeEl('head', doc);
  doc.body = makeEl('body', doc);
  doc.documentElement.append(doc.head, doc.body);
  doc.getElementById = (id) => doc.documentElement.querySelector('#' + id);
  doc.querySelector = (sel) => doc.documentElement.querySelector(sel);
  doc.querySelectorAll = (sel) => doc.documentElement.querySelectorAll(sel);
  doc.defaultView = null;

  let fakeNow = 1000;
  const sandbox = {
    document: doc,
    console,
    Math, Number, String, Array, Object, Boolean, Date, Set, Map, WeakMap, WeakSet,
    Uint8Array, Float32Array, Int32Array, JSON, RegExp, Error, TypeError, RangeError,
    parseInt, parseFloat, isFinite, isNaN,
    innerWidth: 1920,
    innerHeight: 1080,
    performance: { now: () => (fakeNow += 16) },
    setTimeout, clearTimeout, setInterval, clearInterval,
    addEventListener() {},
    removeEventListener() {},
    __DFO_MOD_CFG__: { ru: { on: ru }, fonts: { enabled: true } },
  };
  doc.defaultView = sandbox;
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  for (const file of [
    'dfo_spellmaker_icons.js',
    'dfo_spellmaker_catalog.js',
    'dfo_spellmaker_viz.js',
    'dfo_spellmaker.js',
  ]) {
    vm.runInNewContext(fs.readFileSync(path.join(PAGE_DIR, file), 'utf8'), sandbox, { filename: file });
  }
  return sandbox;
}

function makeFakeGameSpellMaker(sb, { goldPieces = 5000, locValue = 15000, hasSpellbook = true, priceFactor = 1 } = {}) {
  const Data = sb.__dfoSpellmakerData;
  const items = [];
  if (hasSpellbook) items.push({ group: 'MiscItems', templateIndex: 132, name: 'Spellbook' });
  if (locValue > 0) items.push({ group: 'MiscItems', templateIndex: 275, value: locValue, stackCount: 1, name: 'Letter of Credit' });
  const entity = {
    level: 24,
    goldPieces,
    magicka: 120,
    maxMagicka: 160,
    skills: new Array(35).fill(55),
    items,
    spells: [],
  };
  const sounds = [];
  const spendable = () => entity.goldPieces + entity.items
    .filter((i) => i.templateIndex === 275)
    .reduce((s, i) => s + i.value * (i.stackCount || 1), 0);
  const spend = (cost) => {
    let rem = cost;
    const takePurse = Math.min(entity.goldPieces, rem);
    entity.goldPieces -= takePurse;
    rem -= takePurse;
    if (rem > 0) {
      for (const it of entity.items) {
        if (it.templateIndex === 275 && rem > 0) {
          const take = Math.min(it.value, rem);
          it.value -= take;
          rem -= take;
        }
      }
    }
  };
  const w = {
    entity,
    done: false,
    slots: [null, null, null],
    allowedTargets: 31,
    allowedElements: 16,
    rangeType: 0,
    element: 4,
    icon: 1,
    name: '',
    editOrDeleteSlot: -1,
    totalGoldCost: 0,
    totalSpellPointCost: 0,
    picker: null,
    editor: null,
    box: null,
    priceFactor: () => priceFactor,
    _reset() {
      this.slots = [null, null, null];
      this.allowedTargets = 31;
      this.allowedElements = 16;
      this.rangeType = 0;
      this.element = 4;
      this.icon = 1;
      this.name = '';
      this.editOrDeleteSlot = -1;
      this.totalGoldCost = 0;
      this.totalSpellPointCost = 0;
      this.picker = null;
      this.editor = null;
      this.box = null;
      this._updateAllowedButtons();
    },
    _close() { this.done = true; },
    usedSlots() { return this.slots.filter(Boolean); },
    firstFreeSlot() { return this.slots.findIndex((s) => !s); },
    _updateAllowedButtons() {
      const { targets, elements, forced } = Data.allowedButtons(this.slots);
      this.allowedTargets = targets;
      this.allowedElements = elements;
      if (forced) { this.rangeType = 0; this.element = 4; }
      else {
        this.rangeType = Data.pickAllowedBit(this.rangeType, targets);
        this.element = Data.pickAllowedBit(this.element, elements);
      }
      this._updateSpellCosts();
    },
    _updateSpellCosts() {
      const c = Data.calcSpellCost(this.slots, this.rangeType, this.entity, this.priceFactor());
      this.totalGoldCost = c.gold;
      this.totalSpellPointCost = c.sp;
    },
    effectOf(slot) { return slot ? Data.EFFECT_BY_KEY.get(slot.key) ?? null : null; },
    labels() {
      return {
        money: String(spendable()),
        goldCost: String(this.totalGoldCost),
        spellPointCost: String(this.totalSpellPointCost),
        maxSpellPoints: String(this.entity.maxMagicka),
        spellName: this.name,
      };
    },
    _box(id, opts = {}) { this.box = { id, rows: [{ text: `box:${id}`, center: true }], ...opts }; },
    _sayText(str) { this.box = { rows: [{ text: str, center: true }], buttons: null }; },
    _dismissBox(btn = null) {
      const b = this.box;
      this.box = null;
      if (b && !b.buttons) b.onDismiss?.();
      else if (b && b.buttons) (btn == null ? b.onCancel?.() : b.onButton?.(btn));
    },
    _addEffect() {},
    _addAndEditSlot(eff) {
      const i = this.firstFreeSlot();
      if (i === -1) return;
      this.slots[i] = { type: eff.type, subType: eff.subType, key: eff.key, settings: Data.defaultSettings() };
      this._updateAllowedButtons();
      this.editOrDeleteSlot = i;
      this._openEditor(i);
    },
    _openEditor(idx) {
      const slot = this.slots[idx];
      if (!slot) return;
      const eff = this.effectOf(slot);
      const FIELD_GRP = {
        durationBase: 'duration', durationMod: 'duration', durationPerLevel: 'duration',
        chanceBase: 'chance', chanceMod: 'chance', chancePerLevel: 'chance',
        magnitudeBaseLow: 'magnitude', magnitudeBaseHigh: 'magnitude',
        magnitudeLevelBase: 'magnitude', magnitudeLevelHigh: 'magnitude', magnitudePerLevel: 'magnitude',
      };
      this.editor = {
        deps: { slot, effect: eff, entity: this.entity },
        done: false,
        enabled: (f) => !!eff?.[FIELD_GRP[f]],
        cost: () => Data.calcEffectCost(slot, this.entity).sp,
        descriptionRows: () => [],
        _step: (f, d) => {
          slot.settings = Data.stepSetting(slot.settings, f, d, slot.key);
          this._updateSpellCosts();
        },
        setValue: (f, v) => {
          slot.settings = Data.setSetting(slot.settings, f, v, slot.key);
          this._updateSpellCosts();
        },
        _close: () => {
          this.editor = null;
          this.editOrDeleteSlot = -1;
          this._updateAllowedButtons();
        },
        input: (code) => { if (code === 'Escape') this.editor?._close(); },
      };
    },
    _setTarget(i) { if (this.allowedTargets & (1 << i)) { this.rangeType = i; this._updateSpellCosts(); } },
    _setElement(i) { if (this.allowedElements & (1 << i)) this.element = i; },
    _newSpell() { this._reset(); },
    _openNameBox() {},
    _openIconPicker() {},
    _buy() {
      if (!this.entity.items.some((i) => i.group === 'MiscItems' && i.templateIndex === 132)) { this._box(1703); return; }
      if (!this.usedSlots().length) { this._sayText('No effects'); return; }
      if (spendable() < this.totalGoldCost) { this._box(1702); return; }
      if (!this.name.trim()) { this._box(1704); return; }
      spend(this.totalGoldCost);
      this.entity.spells.push({
        name: this.name.trim(),
        icon: this.icon,
        rangeType: this.rangeType,
        element: this.element,
        slots: this.slots.filter(Boolean).map((s) => ({ ...s, settings: { ...s.settings } })),
      });
      this._box(1705, { onDismiss: () => this._reset() });
    },
    input(code) {
      if (this.box) { this._dismissBox(null); return; }
      if (this.editor) { this.editor.input(code); return; }
      if (code === 'Escape') this._close();
    },
  };

  const law = {
    effects: Data.EFFECTS,
    icon: (idx) => (idx === 5 ? 'data:image/png;base64,LIVE_HD_ICON_5' : null),
    effectCost: (slot, ent) => Data.calcEffectCost(slot, ent),
    defaultSettings: () => Data.defaultSettings(),
    audio: { playOneShot: (clip) => sounds.push(clip) },
    clips: { ButtonClick: 'click' },
  };
  return { w, law, sounds };
}

function mountInPortHost(sb, w, law) {
  const doc = sb.document;
  const portHost = doc.createElement('div');
  portHost.className = 'port-host port-spellmaker';
  const portShell = doc.createElement('div');
  portShell.className = 'port-shell';
  const portWin = doc.createElement('section');
  portWin.className = 'px-win port-win size-dfo-sm-host';
  const portInner = doc.createElement('div');
  portInner.className = 'port-inner';
  const driverCv = doc.createElement('canvas');
  driverCv.className = 'port-canvas';
  portInner.append(driverCv);
  portWin.append(portInner);
  portShell.append(portWin);
  portHost.append(portShell);
  doc.body.append(portHost);

  // Wrap in a Proxy identical to real WB(e, spec)
  const proxy = new Proxy(w, {
    get(target, prop, recv) {
      if (prop === '__port') return 'spellmaker';
      return Reflect.get(target, prop, recv);
    },
  });
  const view = sb.__dfoSpellmaker.renderPortView(proxy, {}, law);
  const paint = () => view.blocks[0].paint(driverCv);
  paint();
  return { portHost, portWin, portInner, driverCv, proxy, view, paint };
}

test('spellmaker integration: spendable gold includes Letters of Credit, live Kc icons upgrade fallbacks, and real buy/inscribe/reset cycle works', () => {
  const sb = createDomSandbox({ ru: true });
  const { w, law } = makeFakeGameSpellMaker(sb, { goldPieces: 500, locValue: 20000, priceFactor: 1.25 });
  const { portHost, paint } = mountInPortHost(sb, w, law);

  // 1. Spendable gold uses w.labels().money (purse 500 + LoC 20000 = 20500)
  const cs0 = sb.__dfoSpellmaker.evalCreationState(w);
  assert.equal(cs0.goldHeld, 20500);
  assert.equal(cs0.goldPurse, 500);
  assert.equal(cs0.goldLoc, 20000);

  // 2. Live Kc icon provider upgraded icon #5 while keeping bundled fallbacks for all 69 icons
  assert.equal(sb.__dfoSpellIconRegistry.getIconSrc(5), 'data:image/png;base64,LIVE_HD_ICON_5');
  assert.ok(sb.__dfoSpellIconRegistry.getIconSrc(0).startsWith('data:image/png;base64,'));
  assert.equal(sb.__dfoSpellIconRegistry.getTotalCount(), 69);

  // 3. Add first effect (Destruction: Damage Health 4,0) on Slot 2 (skipping Slot 1) -> auto-picks a Destruction icon & generates modular RU name
  const dmgHealth = sb.__dfoSpellmakerData.EFFECT_BY_KEY.get('4,0');
  sb.__dfoSpellmaker.addEffectToSlot(w, dmgHealth, 1);
  paint();
  assert.equal(w.slots[0], null);
  assert.equal(w.slots[1].key, '4,0');
  assert.ok(w.editor, 'Adding effect must open real vH EffectEditor');
  assert.ok(w.name.length > 0 && w.name.length <= 24, 'Auto-name must be generated on first effect');
  const pickedSchool = sb.__dfoSpellIconRegistry.findEntry(w.icon).schoolId;
  assert.equal(pickedSchool, 22, 'Auto-picked icon must belong to Destruction (school 22)');
  const iconAfterFirst = w.icon;

  // 4. Close editor and add a second distinct effect (Restoration: Heal Health 10,8) -> auto-icon must NOT re-roll within same spell cycle, name MUST update!
  w.editor._close();
  paint();
  const nameAfterOne = w.name;
  const healHealth = sb.__dfoSpellmakerData.EFFECT_BY_KEY.get('10,8');
  sb.__dfoSpellmaker.addEffectToSlot(w, healHealth, 2);
  paint();
  assert.equal(w.icon, iconAfterFirst, 'Auto-icon must fire only once per spell creation cycle');
  assert.notEqual(w.name, nameAfterOne, 'Adding second effect must update modular spell name');
  w.editor._close();
  paint();

  // 5. Real _buy() succeeds using Purse + Letter of Credit (goldCost > 500 purse!), inscribes spell, opens 1705, and dismiss resets cycle!
  assert.ok(w.totalGoldCost > 0);
  w._buy();
  paint();
  assert.equal(w.entity.spells.length, 1, 'Spell must be inscribed into entity.spells');
  assert.equal(w.entity.spells[0].icon, iconAfterFirst);
  assert.ok(w.box, 'Purchase must open 1705 confirmation box');
  w._dismissBox(null);
  paint();
  assert.equal(w.usedSlots().length, 0, 'Dismissing 1705 must reset spellmaker slots');
  assert.equal(w.name, '', 'Dismissing 1705 must clear spell name');
  assert.equal(sb.__dfoSpellmaker.getState(w).autoIconApplied, false, 'New cycle after craft must allow auto-icon again');

  // Cleanup check: closing removes overlays
  w._close();
  paint();
  assert.equal(portHost.querySelectorAll('dialog').length, 0);
});

test('spellmaker integration: incompatible target mask (allowedTargets === 0) blocks native _buy() safely', () => {
  const sb = createDomSandbox({ ru: true });
  const { w, law } = makeFakeGameSpellMaker(sb, { goldPieces: 50000, locValue: 0 });
  const { paint } = mountInPortHost(sb, w, law);

  // Mix Self-only (Teleport 43,255) + Non-self (Damage Health 4,0) -> allowedTargets === 0
  sb.__dfoSpellmaker.addEffectToSlot(w, sb.__dfoSpellmakerData.EFFECT_BY_KEY.get('43,255'), 0);
  w.editor._close();
  sb.__dfoSpellmaker.addEffectToSlot(w, sb.__dfoSpellmakerData.EFFECT_BY_KEY.get('4,0'), 1);
  w.editor._close();
  paint();

  assert.equal(w.allowedTargets, 0);
  const cs = sb.__dfoSpellmaker.evalCreationState(w);
  assert.equal(cs.canBuy, false);
  assert.equal(cs.hasValidTarget, false);

  w._buy();
  paint();
  assert.equal(w.entity.spells.length, 0, 'Incompatible target spell must NEVER be purchased');
  assert.equal(w.entity.goldPieces, 50000, 'Gold must not be spent when blocked');
  assert.ok(w.box, 'Must show incompatible targets warning');
  assert.match(w.box.rows[0].text, /несовместимы/i);
});

test('spellmaker integration: effect editor Reset-to-1, Absorption 50 cap, Remove slot & keyboard modal guard', () => {
  const sb = createDomSandbox({ ru: false });
  const { w, law } = makeFakeGameSpellMaker(sb, { goldPieces: 50000, locValue: 0 });
  const { portHost, paint } = mountInPortHost(sb, w, law);

  // Open Absorption (20,255) in editor
  sb.__dfoSpellmaker.addEffectToSlot(w, sb.__dfoSpellmakerData.EFFECT_BY_KEY.get('20,255'), 0);
  paint();
  w.editor.setValue('chanceBase', 999);
  w.editor.setValue('durationBase', 15);
  paint();
  assert.equal(w.slots[0].settings.chanceBase, 50, 'Absorption chanceBase must stay capped at 50');
  assert.equal(w.slots[0].settings.durationBase, 15);

  // Click Reset-to-1 button in editor DOM
  const resetBtn = portHost.querySelector('.dfo-fxed-reset-btn');
  assert.ok(resetBtn, 'Reset-to-1 button must exist');
  resetBtn.onclick();
  assert.equal(w.slots[0].settings.chanceBase, 1);
  assert.equal(w.slots[0].settings.durationBase, 1);

  // Click Remove effect button in editor DOM
  const delBtn = portHost.querySelector('.dfo-fxed-del-btn');
  assert.ok(delBtn, 'Remove effect button must exist');
  delBtn.onclick();
  paint();
  assert.equal(w.editor, null);
  assert.equal(w.usedSlots().length, 0);

  // Open Guide modal -> pressing Escape in w.input() must NOT close Spellmaker behind the modal!
  sb.__dfoSpellmaker.openGuide(w);
  assert.equal(sb.__dfoSpellmakerGuide.isOpen(), true);
  w.input('Escape');
  assert.equal(w.done, false, 'w.input(Escape) must be ignored while Guide modal is open');
  sb.__dfoSpellmakerGuide.close();
  w.input('Escape');
  assert.equal(w.done, true, 'w.input(Escape) closes Spellmaker once modal is closed');
});

test('spellmaker integration: modular namegen 2x/3x unique names & slot-skipping shift in RU and EN', () => {
  const sb = createDomSandbox({ ru: true });
  const ng = sb.__dfoSpellmakerNameGen;
  const Data = sb.__dfoSpellmakerData;

  const mkSlot = (key) => {
    const [t, s] = key.split(',').map(Number);
    return { type: t, subType: s, key };
  };
  for (const lang of ['ru', 'en']) {
    const e1 = ng.explain({ slots: [null, mkSlot('4,0'), mkSlot('0,255')], element: 0, lang, seed: 42, Data });
    assert.equal(e1.mode, 'pair');
    assert.equal(e1.roles[0].role, 'base');
    assert.equal(e1.roles[0].slotIndex, 1);
    assert.equal(e1.roles[1].role, 'prefix');
    assert.equal(e1.roles[1].slotIndex, 2);
    assert.ok(e1.name.length > 0 && e1.name.length <= 24);

    const e2 = ng.explain({ slots: [mkSlot('4,0'), mkSlot('4,0'), null], element: 1, lang, seed: 7, Data });
    assert.equal(e2.mode, 'double');
    assert.ok(e2.name.split(/\s+/).length <= 2);

    const e3 = ng.explain({ slots: [mkSlot('19,255'), mkSlot('19,255'), mkSlot('19,255')], element: 4, lang, seed: 7, Data });
    assert.equal(e3.mode, 'triple');
    assert.ok(e3.name.split(/\s+/).length <= 2);
  }
});

test('service-windows-transform captures optional spellmaker law helpers cleanly', () => {
  const fakeChunk = [
    'var HH=Object.freeze({guild:a,coven:b,bank:c,bankPurchase:d,transport:e,daedra:f,potionMaker:g,itemMaker:h,spellMaker:i,spellShop:j});',
    'const s="Effect settings";',
    'class vH{cost(){return qu(this.deps.slot,this.deps.entity).sp}}',
    'class yH{effectOf(x){return x?eD.find(t=>t.key===x.key)??null:null}',
    '_addEffectNoSound(){let a=gFn();this.picker=new cT}',
    '_pickGroup(x){let y=sFn(x);}',
    '_addAndEditSlot(e){this.slots[0]={settings:Sg()},this._updateAllowedButtons()}}',
    'function FH(e){return{items:Array.from({length:69},(t,r)=>({icon:Kc(r)}))}}',
    'Ka.playOneShot(ba.ButtonClick,1);',
  ].join('');
  const log = [];
  const out = transformServices('assets/arenaGate-test.js', fakeChunk, log);
  assert.deepEqual(log, [['services.ports', 1]]);
  assert.match(out, /icon:Kc/);
  assert.match(out, /effectCost:qu/);
  assert.match(out, /defaultSettings:Sg/);
  assert.match(out, /audio:Ka,clips:ba/);
});

test('spellmaker audit: throttled live-icon polling, dormant viz skip, focused input reset/done race & dispose teardown', () => {
  const sb = createDomSandbox({ ru: true });
  const { w, law } = makeFakeGameSpellMaker(sb, { goldPieces: 50000, locValue: 0 });
  // 1. Live icon provider returning null must be throttled after initial 69-icon kickoff (no 60fps spam!)
  let iconCalls = 0;
  law.icon = () => { iconCalls++; return null; };
  const { portHost, paint } = mountInPortHost(sb, w, law);

  // 2. Dormant viz skip: 25 consecutive idle frames with 0 effects & closed cover render the scene only ONCE!
  let vizCalls = 0;
  const origRender = sb.DFO_SPELLMAKER_VIZ.renderScene;
  sb.DFO_SPELLMAKER_VIZ.renderScene = (...args) => { vizCalls++; return origRender(...args); };
  const st = sb.__dfoSpellmaker.getState(w);
  st.vizDormantRendered = false;
  for (let i = 0; i < 25; i++) paint();
  assert.equal(vizCalls, 1, 'Dormant closed grimoire must skip redundant 60fps scene redraws');
  // In fake clock (32ms per frame -> ~800ms across 25 frames), 250ms throttle allows at most 4 probes (<=280) vs 26*69=1794 unthrottled!
  assert.ok(iconCalls >= 69 && iconCalls <= 280, `Unresolved live icons must be throttled (got ${iconCalls}, unthrottled would be ${26 * 69})`);

  // 3. Focused editor input + Reset-to-1 must NOT revert to stale typed value on later blur
  sb.__dfoSpellmaker.addEffectToSlot(w, sb.__dfoSpellmakerData.EFFECT_BY_KEY.get('19,255'), 0);
  paint();
  const durInput = portHost.querySelectorAll('.dfo-fxed-input')[0];
  assert.ok(durInput, 'durationBase input must exist');
  durInput.focus();
  durInput.dispatchEvent({ type: 'focus', target: durInput });
  durInput.value = '14';
  durInput.dispatchEvent({ type: 'input', target: durInput });
  assert.equal(w.slots[0].settings.durationBase, 14);
  // Click Reset-to-1 while durInput is still focused & editing='1'
  portHost.querySelector('.dfo-fxed-reset-btn').onclick();
  assert.equal(w.slots[0].settings.durationBase, 1, 'Reset-to-1 must reset underlying setting to 1');
  assert.equal(durInput.value, '1', 'Reset-to-1 must update even a focused input immediately');
  // Simulate late blur after reset -> must NOT overwrite 1 back to 14!
  durInput.dispatchEvent({ type: 'blur', target: durInput });
  assert.equal(w.slots[0].settings.durationBase, 1, 'Late blur after Reset-to-1 must never restore stale value');

  // 4. Typing a value and immediately clicking Done (without pressing Enter) must commit clamped value cleanly
  durInput.focus();
  durInput.dispatchEvent({ type: 'focus', target: durInput });
  durInput.value = '99'; // > max 60 -> must clamp to 60 on Done!
  portHost.querySelector('.dfo-fxed-done-btn').onclick();
  paint();
  assert.equal(w.editor, null);
  assert.equal(w.slots[0].settings.durationBase, 60, 'Done button must commit & clamp pending focused input value');

  // 5. Dispose hook must cleanly tear down overlays & clear retained DOM refs
  sb.__dfoSpellmaker.openGuide(w);
  assert.equal(sb.__dfoSpellmakerGuide.isOpen(), true);
  w.dispose();
  assert.equal(sb.__dfoSpellmakerGuide.isOpen(), false, 'w.dispose() must close open modals');
  assert.equal(st.portHost, null, 'w.dispose() must release DOM references');
});

test('spellmaker audit: focused nameInput reset/box race, _stepIcon/_setElement hotkeys & editor slot index by ref', () => {
  const sb = createDomSandbox({ ru: true });
  const { w, law } = makeFakeGameSpellMaker(sb, { goldPieces: 50000, locValue: 0 });
  w._stepIcon = function (delta) { this.icon = ((this.icon + delta) % 69 + 69) % 69; };
  const { portHost, paint } = mountInPortHost(sb, w, law);

  // 1. Focused nameInput with 0 slots + _reset() must blur and clear visible input
  const nameInput = portHost.querySelector('.dfo-sm-name-input');
  assert.ok(nameInput);
  nameInput.focus();
  nameInput.value = 'Тест';
  nameInput.dispatchEvent({ type: 'input', target: nameInput });
  assert.equal(w.name, 'Тест');
  w._reset();
  paint();
  assert.equal(w.name, '');
  assert.equal(nameInput.value, '', 'Focused nameInput must clear visibly on _reset()');
  assert.notEqual(sb.document.activeElement, nameInput, '_reset() must blur focused nameInput');

  // 2. Keyboard _stepIcon locks autoIconApplied before first effect
  w._stepIcon(1);
  const manualIcon = w.icon;
  sb.__dfoSpellmaker.addEffectToSlot(w, sb.__dfoSpellmakerData.EFFECT_BY_KEY.get('4,0'), 2);
  paint();
  assert.equal(w.icon, manualIcon, 'Manual _stepIcon hotkey before 1st effect must prevent auto-icon overwrite');

  // 3. Opening editor directly without setting editOrDeleteSlot still displays exact Slot 3 in header pill
  w.editOrDeleteSlot = -1;
  w.editor._close();
  paint();
  w._openEditor(2);
  paint();
  const pill = portHost.querySelector('.dfo-fxed-slot-pill');
  assert.ok(pill && pill.textContent.includes('3'), `Expected Slot 3 pill, got: ${pill?.textContent}`);
  w.editor._close();
  paint();

  // 4. Keyboard _setElement updates Destruction modular auto-name automatically
  const nameBeforeEl = w.name;
  w._setElement(0); // Fire
  paint();
  assert.equal(w.element, 0);
  const nameFire = w.name;
  w._setElement(1); // Cold
  paint();
  assert.equal(w.element, 1);
  assert.ok(nameFire !== w.name || nameBeforeEl !== nameFire, 'Switching Destruction element via hotkey must refresh modular name');
});

test('spellmaker live-game fixes: minimize/restore WB watchdog recovery, zero ctx.filter blur & cached portView', () => {
  const sb = createDomSandbox({ ru: true });
  const { w, law } = makeFakeGameSpellMaker(sb, { goldPieces: 50000, locValue: 0 });
  const { portHost: host1, paint: paint1 } = mountInPortHost(sb, w, law);

  // Add a Destruction Poison effect so main workspace + viz canvas are active
  sb.__dfoSpellmaker.addEffectToSlot(w, sb.__dfoSpellmakerData.EFFECT_BY_KEY.get('4,0'), 0);
  w.editor._close();
  w._setElement(2); // Poison
  paint1();
  assert.ok(host1.querySelector('.dfo-sm-win'), 'Initial main window must have dfo-sm-win class');
  assert.ok(host1.querySelector('.dfo-sm-viz-canvas'), 'Initial viz canvas must exist');

  // 1. Cached portView descriptor: repeated renderPortView calls return the same object (zero per-frame allocs!)
  const v1 = sb.__dfoSpellmaker.renderPortView(w, null, law);
  const v2 = sb.__dfoSpellmaker.renderPortView(w, null, law);
  assert.equal(v1, v2, 'renderPortView must cache view descriptor per SpellMaker instance');

  // 2. Simulate Electron minimize -> WB 250ms watchdog tears down portHost while SpellMaker stays open (w.done === false)!
  host1.remove();
  // Simulate game restore -> WB creates a brand-new portHost / portWin (size-dfo-sm-host) / portInner / driver canvas!
  const { portHost: host2, portWin: win2, paint: paint2 } = mountInPortHost(sb, w, law);
  assert.equal(win2.classList.contains('dfo-sm-win'), true, 'Restored portWin must regain dfo-sm-win class (no empty border strip!)');
  assert.ok(host2.querySelector('.dfo-sm-layout'), 'Restored main workspace layout must rebuild cleanly');
  assert.ok(host2.querySelector('.dfo-sm-viz-canvas'), 'Restored viz canvas must remount cleanly');
  assert.equal(host2.querySelectorAll('.dfo-sm-fx-row.is-filled').length, 1, 'Restored UI must preserve active spell slots');

  // 3. Also test minimize/restore while Effect Editor is open!
  w._openEditor(0);
  paint2();
  assert.equal(win2.classList.contains('dfo-fxed-win'), true);
  host2.remove();
  const { portHost: host3, portWin: win3 } = mountInPortHost(sb, w, law);
  assert.equal(win3.classList.contains('dfo-fxed-win'), true, 'Restored editor portWin must regain dfo-fxed-win class');
  assert.ok(host3.querySelector('.dfo-fxed-done-btn'), 'Restored editor controls must rebuild cleanly');

  // 4. Verify production dfo_spellmaker_viz.js has ZERO ctx.filter = 'blur(...)' calls (prevents Electron Skia Graphite tracer/clip/stall bugs)
  const vizSrc = fs.readFileSync(path.join(PAGE_DIR, 'dfo_spellmaker_viz.js'), 'utf8');
  const blurCalls = vizSrc.split(/\r?\n/).filter((l) => !l.trim().startsWith('//') && /\.filter\s*=\s*['"]blur/.test(l));
  assert.deepEqual(blurCalls, [], 'Production viz must contain zero ctx.filter blur calls');

  // 5. Verify dfo_services.js short-circuits native(w) when __dfoSpellmaker.renderPortView handles spellMaker
  vm.runInNewContext(fs.readFileSync(path.join(PAGE_DIR, 'dfo_services.js'), 'utf8'), sb, { filename: 'dfo_services.js' });
  let nativeCalls = 0;
  const fakeSpecs = { spellMaker: { kind: 'spellmaker', view() { nativeCalls++; return { title: 'Vanilla' }; } } };
  sb.__dfoServices.ports(fakeSpecs, law);
  const resView = fakeSpecs.spellMaker.view(w);
  assert.equal(resView.size, 'dfo-sm-host', 'dfo_services spellMaker port must return custom Spellmaker view');
  assert.equal(nativeCalls, 0, 'dfo_services must skip wasteful per-frame native IH.view(w) calls when Spellmaker mod is active');
});
