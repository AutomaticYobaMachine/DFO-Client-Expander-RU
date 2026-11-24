'use strict';
// Container overhaul unit & transform tests: verifies container-transform hooks on real game bundles,
// CSS strict isolation from .pack-win / .pack-dock, RU/EN localization parity, search/filter/sort logic,
// stack-transfer handlers, Reward & Fate views, and Nearby Loot compatibility.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const { transformContainer } = require('../src/mod/container-transform.cjs');
const { transformNearby } = require('../src/mod/nearby-loot-transform.cjs');
const { transformInventory } = require('../src/mod/inventory-transform.cjs');
const { loadUi } = require('../src/mod/item-text.cjs');
const uiRuntime = require('../src/mod/page/dfo_ui_text.js');
const PackRules = require('../src/mod/page/dfo_pack_rules.js');
const Container = require('../src/mod/page/dfo_container.js');

const ROOT = path.resolve(__dirname, '..');
const GAME_DIR = process.env.DFO_BUILD_DIR || '';
const CYR = /[А-Яа-яЁё]/;

function findAsset(dir, prefix) {
  if (!dir || !fs.existsSync(dir)) return null;
  const assets = path.join(dir, 'assets');
  if (!fs.existsSync(assets)) return null;
  const files = fs.readdirSync(assets)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.js') && !f.includes('Worker-'))
    .sort((a, b) => fs.statSync(path.join(assets, b)).size - fs.statSync(path.join(assets, a)).size);
  return files[0] ? fs.readFileSync(path.join(assets, files[0]), 'utf8') : null;
}

function makeFakeDoc() {
  const listeners = new Map();
  const makeNode = (tag) => {
    const clsSet = new Set();
    const attrs = new Map();
    const styleProps = new Map();
    const styleObj = {
      setProperty: (k, v) => styleProps.set(k, String(v)),
      getPropertyValue: (k) => styleProps.get(k) || '',
      removeProperty: (k) => styleProps.delete(k),
    };
    const classList = {
      add: (...c) => c.flatMap((x) => String(x || '').split(/\s+/)).filter(Boolean).forEach((x) => clsSet.add(x)),
      remove: (...c) => c.forEach((x) => clsSet.delete(x)),
      toggle: (c, force) => {
        const on = force === undefined ? !clsSet.has(c) : !!force;
        if (on) clsSet.add(c); else clsSet.delete(c);
        return on;
      },
      contains: (c) => clsSet.has(c),
    };
    const node = {
      tagName: String(tag).toUpperCase(),
      nodeType: 1,
      children: [],
      dataset: {},
      style: styleObj,
      classList,
      get className() { return [...clsSet].join(' '); },
      set className(v) { clsSet.clear(); classList.add(v); },
      textContent: '',
      value: '',
      type: '',
      disabled: false,
      hidden: false,
      scrollTop: 0,
      isConnected: true,
      parentNode: null,
      get firstChild() { return this.children[0] || null; },
      get lastElementChild() { return this.children[this.children.length - 1] || null; },
      get nextSibling() {
        if (!this.parentNode) return null;
        const sibs = this.parentNode.children;
        const i = sibs.indexOf(this);
        return i >= 0 && i + 1 < sibs.length ? sibs[i + 1] : null;
      },
      append(...nodes) {
        for (const n of nodes.flat()) {
          if (n == null) continue;
          if (typeof n === 'string') continue;
          if (n._isFrag) {
            this.append(...n.children);
            continue;
          }
          if (n.parentNode) n.parentNode.children = n.parentNode.children.filter((x) => x !== n);
          n.parentNode = this;
          this.children.push(n);
        }
      },
      prepend(...nodes) {
        const flat = [];
        for (const n of nodes.flat()) {
          if (!n || typeof n === 'string') continue;
          if (n._isFrag) flat.push(...n.children);
          else flat.push(n);
        }
        for (let i = flat.length - 1; i >= 0; i--) {
          const n = flat[i];
          if (n.parentNode) n.parentNode.children = n.parentNode.children.filter((x) => x !== n);
          n.parentNode = this;
          this.children.unshift(n);
        }
      },
      insertBefore(n, ref) {
        if (n?._isFrag) {
          for (const ch of [...n.children]) this.insertBefore(ch, ref);
          return n;
        }
        const i = this.children.indexOf(ref);
        if (i < 0) { this.append(n); return n; }
        n.parentNode = this;
        this.children.splice(i, 0, n);
        return n;
      },
      replaceWith(...nodes) {
        const p = this.parentNode;
        if (!p) return;
        const idx = p.children.indexOf(this);
        if (idx < 0) return;
        const flat = [];
        for (const n of nodes.flat()) {
          if (!n || typeof n === 'string') continue;
          if (n._isFrag) flat.push(...n.children);
          else flat.push(n);
        }
        for (const n of flat) n.parentNode = p;
        p.children.splice(idx, 1, ...flat);
        this.parentNode = null;
      },
      replaceChildren(...nodes) {
        this.children.forEach((c) => { c.parentNode = null; });
        this.children.length = 0;
        this.append(...nodes);
      },
      remove() {
        if (!this.parentNode) return;
        this.parentNode.children = this.parentNode.children.filter((x) => x !== this);
        this.parentNode = null;
      },
      setAttribute(k, v) {
        attrs.set(k, String(v));
        if (k === 'id') this.id = String(v);
      },
      getAttribute(k) { return attrs.get(k) ?? null; },
      addEventListener(ev, fn) {
        if (!listeners.has(this)) listeners.set(this, new Map());
        const m = listeners.get(this);
        if (!m.has(ev)) m.set(ev, new Set());
        m.get(ev).add(fn);
      },
      removeEventListener(ev, fn) { listeners.get(this)?.get(ev)?.delete(fn); },
      dispatchEvent(ev) {
        const set = listeners.get(this)?.get(ev.type);
        if (set) for (const fn of [...set]) fn(ev);
      },
      getBoundingClientRect: () => ({ width: 520, height: 760, top: 0, left: 0, right: 520, bottom: 760 }),
      querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
      querySelectorAll(sel) {
        const res = [];
        const parts = sel.split(',').map((s) => s.trim());
        const matchesOne = (n, s) => {
          if (s.startsWith('#')) return n.id === s.slice(1);
          const segs = s.split(/(?=[.#[])/).filter(Boolean);
          return segs.every((seg) => {
            if (seg.startsWith('.')) return n.classList.contains(seg.slice(1));
            if (seg.startsWith('#')) return n.id === seg.slice(1);
            if (seg.startsWith('[')) {
              const inner = seg.slice(1, -1);
              return n.getAttribute(inner) != null;
            }
            return n.tagName === seg.toUpperCase();
          });
        };
        const walk = (rootNode) => {
          for (const ch of rootNode.children) {
            if (parts.some((p) => {
              const tokens = p.split(/\s+/);
              return matchesOne(ch, tokens[tokens.length - 1]);
            })) res.push(ch);
            walk(ch);
          }
        };
        walk(this);
        return res;
      },
      closest(sel) {
        let cur = this;
        const cls = sel.startsWith('.') ? sel.slice(1) : null;
        while (cur) {
          if (cls && cur.classList?.contains(cls)) return cur;
          cur = cur.parentNode;
        }
        return null;
      },
    };
    return node;
  };
  const docEl = makeNode('html');
  const head = makeNode('head');
  const body = makeNode('body');
  docEl.append(head, body);
  return {
    documentElement: docEl,
    head,
    body,
    activeElement: null,
    createElement: (tag) => makeNode(tag),
    createElementNS: (_ns, tag) => makeNode(tag),
    createDocumentFragment: () => ({ _isFrag: true, children: [], append(...n) { this.children.push(...n.flat()); } }),
    getElementById(id) {
      const search = (root) => {
        for (const ch of root.children) {
          if (ch.id === id) return ch;
          const sub = search(ch);
          if (sub) return sub;
        }
        return null;
      };
      return search(docEl);
    },
    addEventListener(ev, fn) { body.addEventListener(ev, fn); },
    removeEventListener(ev, fn) { body.removeEventListener(ev, fn); },
    dispatchDocKey(ev) { body.dispatchEvent(ev); },
    querySelector(sel) { return docEl.querySelector(sel); },
    querySelectorAll(sel) { return docEl.querySelectorAll(sel); },
  };
}

function withFakeEnv(locale, fn) {
  const prevDoc = globalThis.document;
  const prevUi = globalThis.__dfoUi;
  const prevTr = globalThis.__translate;
  const doc = makeFakeDoc();
  const strings = loadUi(path.join(ROOT, 'src/mod/item-text', locale)).strings;
  globalThis.document = doc;
  globalThis.__dfoUi = uiRuntime.make({ locale, strings });
  // Reload module instance bound to active globalThis.document
  delete require.cache[require.resolve('../src/mod/page/dfo_container.js')];
  const inst = require('../src/mod/page/dfo_container.js');
  try {
    return fn(inst, doc);
  } finally {
    try { inst.onUnmount?.(); } catch { }
    globalThis.document = prevDoc;
    globalThis.__dfoUi = prevUi;
    globalThis.__translate = prevTr;
  }
}

test('CSS and JS keep strict container scope: never alter .pack-win / .pack-dock and contain zero Cyrillic literals', () => {
  const cssCode = Container.CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(cssCode, /\.pack-win\b/);
  assert.doesNotMatch(cssCode, /\.pack-dock\b/);
  assert.doesNotMatch(cssCode, /\.packlists\b/);
  assert.doesNotMatch(cssCode, /\.dfo-stand-/);
  assert.doesNotMatch(cssCode, /\.dfo-dummy-/);
  assert.match(cssCode, /html\[data-dfo-container\] \.pack-shell \.loot-win/);
  assert.match(cssCode, /\.loot-win \{[\s\S]*overflow:\s*visible;/);
  assert.match(cssCode, /\.dfo-loot-modal-backdrop/);

  const containerJs = fs.readFileSync(path.join(ROOT, 'src/mod/page/dfo_container.js'), 'utf8');
  const transformCjs = fs.readFileSync(path.join(ROOT, 'src/mod/container-transform.cjs'), 'utf8');
  assert.doesNotMatch(containerJs, CYR);
  assert.doesNotMatch(transformCjs, CYR);
});

test('categories() matches player inventory 9 pages without magic or duplicate materials', () => {
  const native = [
    ['all', 'All'], ['materials', 'Materials'], ['weapons', 'Weapons'], ['armor', 'Armor'],
    ['clothing', 'Clothing'], ['magic', 'Magic'], ['potions', 'Potions'],
    ['ingredients', 'Ingredients'], ['books', 'Books'], ['valuables', 'Valuables'], ['misc', 'Misc'],
  ];
  const pages = native.slice(2);
  const out = withFakeEnv('en', (C) => C.categories(native, pages));
  assert.deepEqual(
    out.map(([id]) => id),
    ['all', ...PackRules.PAGES],
  );
  assert.ok(!out.some(([id]) => id === 'magic' || id === 'materials'));
});

test('pure card search indexes card fields in RU and EN, normalizes yo, supports multi-word AND, and excludes lore/description', () => {
  const enItem = {
    uid: 'sword-1',
    name: 'Shadowfang Blade',
    group: 'Weapons',
    templateIndex: 101,
    rarity: 'legendary',
    exalted: true,
    materialName: 'Mithril',
    sockets: ['ruby'],
    setId: 'dread',
  };
  const fakeCtx = (loc) => ({
    itemLine: () => ({
      name: loc === 'ru' ? 'Клинок Тенеклыка' : 'Shadowfang Blade',
      material: loc === 'ru' ? 'Мифрил' : 'Mithril',
      damage: '14-26',
      armour: '',
      condition: 'Fine',
      hands: 'One-handed',
      word: 'Broad',
    }),
    itemValue: () => 450,
    itemEffects: (_it, opts) => {
      // Simulate native behavior respecting lore: false vs lore: true
      const out = ['+12 Fire Damage', 'Technique: Cleave'];
      if (opts?.lore) out.push('Forged under the pale moon of Aldersgate');
      return out;
    },
    rarityOf: () => 'legendary',
    isLocked: () => true,
    isJunk: () => false,
    socketsOf: () => ['ruby', 'empty'],
    gemName: () => 'Flawless Ruby',
    gemBonus: () => '+8 Strength',
    setInfo: () => ({ name: 'Dread Set', tiers: ['2: +5 Crit'] }),
    letterWorth: () => null,
    boundLine: () => 'Bound to character',
  });

  withFakeEnv('ru', (C) => {
    globalThis.__translate = (s) => ({
      '+12 Fire Damage': '+12 Урон огнём',
      'Flawless Ruby': 'Безупречный рубин',
      '+8 Strength': '+8 Сила',
      'Dread Set': 'Комплект Ужаса',
      'Forged under the pale moon of Aldersgate': 'Выкован под бледной луной Олдерсгейта',
    }[s] || s);

    const text = C.buildPureCardSearchText(enItem, fakeCtx('ru'));
    // yo -> e normalization: "огнём" becomes "огнем", matching query without "ё"
    assert.ok(text.includes('урон огнем'));
    assert.ok(text.includes('возвышенный легендарный'));
    assert.ok(text.includes('мифрил'));
    assert.ok(text.includes('безупречный рубин'));
    assert.ok(text.includes('+8 сила'));
    assert.ok(text.includes('пустое гнездо'));
    assert.ok(text.includes('комплект ужаса'));
    assert.ok(text.includes('заблокировано'));
    assert.ok(!text.includes('бледной луной'), 'lore/description must be excluded when lore: false');

    const res = C.filterItems([enItem], { cat: 'all', rarity: 'all', material: 'Mithril', query: 'рубин огнем' }, () => enItem.name, null, fakeCtx('ru'));
    assert.equal(res.length, 1);
  });

  withFakeEnv('en', (C) => {
    const enCtx = fakeCtx('en');
    const res = C.filterItems([enItem], { cat: 'weapons', rarity: 'legendary', material: 'Mithril', query: 'flawless strength' }, () => enItem.name, null, enCtx);
    assert.equal(res.length, 1);
    const miss = C.filterItems([enItem], { cat: 'weapons', rarity: 'legendary', material: 'Mithril', query: 'aldersgate' }, () => enItem.name, null, enCtx);
    assert.equal(miss.length, 0);
  });
});

test('computeFilterSnapshot and sortItems produce accurate facet counts and non-mutating sorts', () => {
  const sword = { uid: 1, name: 'Iron Sword', group: 'Weapons', templateIndex: 10, rarity: 'rare', materialName: 'Iron', weight: 4, value: 120, stackCount: 1 };
  const potion = { uid: 2, name: 'Healing Potion', group: 'UselessItems1', templateIndex: 197, rarity: 'common', weight: 0.2, value: 35, stackCount: 5 };
  const junkBow = { uid: 3, name: 'Broken Bow', group: 'Weapons', templateIndex: 12, rarity: 'common', weight: 2, value: 10, stackCount: 1, junk: true };
  const items = [potion, junkBow, sword];

  withFakeEnv('en', (C) => {
    const ctx = {
      rarityOn: () => true,
      rarityOf: (it) => it.rarity || 'common',
      isJunk: (it) => !!it.junk,
      itemLine: (it) => ({ name: it.name, material: it.materialName || '' }),
      itemWeight: (it) => (it.weight || 0) * (it.stackCount || 1),
      itemValue: (it) => (it.value || 0) * (it.stackCount || 1),
    };
    const snap = C.computeFilterSnapshot(items, { cat: 'all', rarity: 'all', material: 'all', query: '' }, ctx);
    assert.equal(snap.filtered.length, 3);
    assert.equal(snap.catCounts.get('weapons'), 1);
    assert.equal(snap.catCounts.get('potions'), 1);
    assert.equal(snap.catCounts.get('junk'), 1);
    assert.equal(snap.rarCounts.get('rare'), 1);
    assert.equal(snap.matCounts.get('Iron'), 1);

    const byRarity = C.sortItems(items, 'rarity', ctx);
    assert.equal(byRarity[0], sword);
    const byValue = C.sortItems(items, 'value', ctx);
    assert.equal(byValue[0], potion); // 35 * 5 = 175 > 120
    assert.deepEqual(items, [potion, junkBow, sword], 'sortItems must not mutate source array');
  });
});

test('handleRowClick, quantity modal, reward selection, and local click pass-through work accurately', () => {
  withFakeEnv('en', (C, doc) => {
    const taken = [];
    const stowed = [];
    const stackItem = { uid: 'a1', name: 'Arrows', group: 'Weapons', templateIndex: 1, stackCount: 20 };
    const goldItem = { uid: 'g1', name: 'Gold Pieces', group: 'Currency', templateIndex: 1, weight: 0, stackCount: 500 };

    const ctx = {
      remote: { kind: 'container', title: 'Chest', items: [stackItem, goldItem], count: 2, weight: 2, capacity: 100 },
      filter: { kind: 'container', cat: 'all', rarity: 'all', material: 'all', query: '' },
      resetFilter: () => { },
      paired: true,
      pocketGold: 1200,
      carryNow: 32.4,
      carryMax: 150,
      rarityOn: () => true,
      hasWagon: () => false,
      canBag: () => false,
      isStowableKind: (k) => k === 'container',
      itemLine: (it) => ({ name: it.name, weight: it.weight ?? 0.1 }),
      itemWeight: (it) => (it.weight ?? 0.1) * (it.stackCount || 1),
      rarityOf: () => 'common',
      isJunk: () => false,
      maxQty: () => 20,
      takeItem: (it, qty) => taken.push([it, qty]),
      stowItem: (it, qty) => stowed.push([it, qty]),
      markQuestLoot: () => { },
      mountRemoteList: () => null,
      close: () => { },
      takeAll: () => { },
      hideHoverTip: () => { },
    };

    // Mount standard container
    C.buildRemote(ctx);

    // 1. Plain LMB on non-currency stack -> takes 1
    assert.equal(C.handleRowClick(stackItem, 'remote', { shiftKey: false, ctrlKey: false, stopPropagation() { } }, ctx), true);
    assert.deepEqual(taken.pop(), [stackItem, 1]);

    // 2. Plain LMB on Currency Gold coin pile -> takes full stack (null)
    assert.equal(C.handleRowClick(goldItem, 'remote', { shiftKey: false, ctrlKey: false, stopPropagation() { } }, ctx), true);
    assert.deepEqual(taken.pop(), [goldItem, null]);

    // 3. Shift+LMB -> takes full stack (null)
    assert.equal(C.handleRowClick(stackItem, 'remote', { shiftKey: true, ctrlKey: false, stopPropagation() { } }, ctx), true);
    assert.deepEqual(taken.pop(), [stackItem, null]);

    // 4. Ctrl+Shift+LMB -> opens [O-02] quantity modal, confirms entered value
    assert.equal(C.handleRowClick(stackItem, 'remote', { shiftKey: true, ctrlKey: true, stopPropagation() { } }, ctx), true);
    const modalInput = doc.querySelector('.dfo-loot-modal-input');
    assert.ok(modalInput);
    modalInput.value = '7';
    doc.querySelector('.dfo-loot-modal-foot .primary').onclick({ stopPropagation() { } });
    assert.deepEqual(taken.pop(), [stackItem, 7]);
    assert.equal(doc.querySelector('.dfo-loot-modal-backdrop'), null);

    // 5. Local inventory plain LMB -> returns false (unmodified native inventory handling!)
    assert.equal(C.handleRowClick(stackItem, 'local', { shiftKey: false, ctrlKey: false, stopPropagation() { } }, ctx), false);

    // 6. Local inventory Ctrl+Shift+LMB -> opens stow modal
    assert.equal(C.handleRowClick(stackItem, 'local', { shiftKey: true, ctrlKey: true, stopPropagation() { } }, ctx), true);
    doc.querySelector('.dfo-loot-modal-input').value = '5';
    doc.querySelector('.dfo-loot-modal-foot .primary').onclick({ stopPropagation() { } });
    assert.deepEqual(stowed.pop(), [stackItem, 5]);

    // 7. Local inventory Ctrl+LMB on a LOCKED stack -> refuses immediately without opening a dead-end quantity modal
    const lockedStack = { uid: 'l1', name: 'Locked Arrows', stackCount: 50, weight: 0.1, locked: true };
    const lockedCtx = { ...ctx, isLocked: (it) => !!it?.locked };
    assert.equal(C.handleRowClick(lockedStack, 'local', { shiftKey: false, ctrlKey: true, stopPropagation() { } }, lockedCtx), true);
    assert.equal(doc.querySelector('.dfo-loot-modal-backdrop'), null, 'locked stack must not open quantity modal');
    assert.deepEqual(stowed.pop(), [lockedStack, null]);
  });
});

test('Reward and Fate builders wire cleanly to live context actions', () => {
  withFakeEnv('en', (C) => {
    const claimed = [];
    const picked = [];
    const chosen = [];
    const r1 = { uid: 'r1', name: 'Sword', rarity: 'rare' };
    const r2 = { uid: 'r2', name: 'Staff', rarity: 'legendary' };

    const rewardCtx = {
      remote: { kind: 'reward', title: 'Choose Reward', items: [r1, r2], count: 2, weight: 3 },
      filter: { kind: 'reward', cat: 'all', rarity: 'all', material: 'all', query: '' },
      resetFilter: () => { },
      rarityOf: (it) => it.rarity || 'common',
      itemLine: (it) => ({ name: it.name }),
      itemEffects: () => ['+5 Attack'],
      buildItemRow: (it) => {
        const b = globalThis.document.createElement('button');
        b.className = 'itemrow';
        const nm = globalThis.document.createElement('span');
        nm.className = 'itemname';
        b.append(nm);
        return b;
      },
      takeItem: (it, qty) => claimed.push([it, qty]),
      close: () => { },
    };
    const rEl = C.buildRemote(rewardCtx);
    assert.equal(rEl.querySelectorAll('.dfo-reward-row').length, 2);
    assert.equal(C.handleRowClick(r2, 'remote', { stopPropagation() { } }, rewardCtx), true);
    rEl.querySelector('.dfo-reward-claim').onclick({ stopPropagation() { } });
    assert.deepEqual(claimed, [[r2, null]]);

    const fateCtx = {
      remote: { kind: 'fate', items: [] },
      deps: {
        fate: {
          name: 'Prisoner',
          sub: 'Captured Bandit',
          mood: 'Fearful',
          plea: { speech: 'Spare me!', body: 'He trembles.' },
          trophy: { uid: 't1', name: 'Bandit Ring', rarity: 'magic' },
          options: [
            { id: 'kill', key: '1', verb: 'Execute', title: 'Bandit Ring', detail: 'Take ring', confirm: 'End him?' },
            { id: 'spare', key: '2', verb: 'Spare', title: 'Let go', detail: 'Mercy', confirm: 'Free him?' },
          ],
        },
      },
      fateEnsureStyle: () => { },
      fateChoice: () => 'kill',
      fatePick: (id) => picked.push(id),
      fateChoose: (id) => chosen.push(id),
      fateTrophyTile: () => true,
      fatePortrait: () => false,
      rarityOf: () => 'magic',
      itemLine: (it) => ({ name: it.name }),
      close: () => { },
    };
    const fEl = C.buildRemote(fateCtx);
    assert.equal(fEl.querySelectorAll('.dfo-fate-card').length, 2);
    fEl.querySelector('.dfo-fate-confirm .danger').onclick({ stopPropagation() { } });
    assert.deepEqual(chosen, ['kill']);
  });
});

test('5,000-item container stress: classification cache, Schwartzian sort, facet counts, and pure-JS search stay accurate', () => {
  const N = 5000;
  const rars = ['common', 'magic', 'rare', 'legendary'];
  const mats = ['Iron', 'Steel', 'Mithril', 'Daedric'];
  const pool = new Array(N);
  for (let i = 0; i < N; i++) {
    const kind = i % 5;
    if (kind === 0) {
      pool[i] = { uid: 'w' + i, name: `Blade #${i}`, group: 'Weapons', templateIndex: 120, rarity: rars[i % 4], materialName: mats[i % 4], weight: 4 + (i % 7), value: 100 + (i % 1000), stackCount: 1 };
    } else if (kind === 1) {
      pool[i] = { uid: 'a' + i, name: `Cuirass #${i}`, group: 'Armor', templateIndex: 102, rarity: rars[i % 4], materialName: mats[(i + 1) % 4], weight: 10 + (i % 8), value: 200 + (i % 800), stackCount: 1 };
    } else if (kind === 2) {
      pool[i] = { uid: 'p' + i, name: `Elixir #${i}`, group: 'UselessItems1', templateIndex: 197, rarity: 'common', weight: 0.3, value: 40, stackCount: 1 + (i % 10) };
    } else if (kind === 3) {
      pool[i] = { uid: 'j' + i, name: `Scrap #${i}`, group: 'Weapons', templateIndex: 113, rarity: 'common', weight: 2, value: 15, stackCount: 1, junk: true };
    } else {
      pool[i] = { uid: 'v' + i, name: `Ruby #${i}`, group: 'Gems', templateIndex: 0, rarity: rars[i % 4], weight: 0.1, value: 500 + (i % 500), stackCount: 1 };
    }
  }

  withFakeEnv('ru', (C) => {
    let lineCalls = 0;
    const ctx = {
      live: true,
      rarityOn: () => true,
      rarityOf: (it) => it.rarity || 'common',
      isJunk: (it) => !!it.junk,
      isLocked: () => false,
      itemLine: (it) => {
        lineCalls++;
        return { name: it.name, material: it.materialName || '', weight: it.weight || 0 };
      },
      itemWeight: (it) => (it.weight || 0) * (it.stackCount || 1),
      itemValue: (it) => (it.value || 0) * (it.stackCount || 1),
      itemEffects: (it, opts) => (it.group === 'Weapons' ? (opts?.lore ? ['+15 Fire', 'Ancient tomb lore'] : ['+15 Fire']) : []),
    };

    const snap1 = C.computeFilterSnapshot(pool, { cat: 'all', rarity: 'all', material: 'all', query: '' }, ctx);
    assert.equal(snap1.filtered.length, N);
    assert.equal(snap1.catCounts.get('weapons'), 1000);
    assert.equal(snap1.catCounts.get('armor'), 1000);
    assert.equal(snap1.catCounts.get('potions'), 1000);
    assert.equal(snap1.catCounts.get('junk'), 1000);
    assert.equal(snap1.catCounts.get('valuables'), 1000);

    // Warm snapshot should make zero additional itemLine calls
    const callsBeforeWarm = lineCalls;
    const snap2 = C.computeFilterSnapshot(pool, { cat: 'weapons', rarity: 'all', material: 'all', query: '' }, ctx);
    assert.equal(snap2.filtered.length, 1000);
    assert.equal(lineCalls, callsBeforeWarm, 'warm classification cache skips redundant itemLine calls across 5,000 items');

    // Schwartzian sort accuracy + non-mutation
    const byRar = C.sortItems(pool, 'rarity', ctx);
    assert.equal(byRar.length, N);
    assert.equal(byRar[0].rarity, 'legendary');
    assert.equal(byRar[N - 1].rarity, 'common');
    const byVal = C.sortItems(pool, 'value', ctx);
    assert.ok(ctx.itemValue(byVal[0]) >= ctx.itemValue(byVal[1]) && ctx.itemValue(byVal[N - 2]) >= ctx.itemValue(byVal[N - 1]));
    assert.equal(pool[0].uid, 'w0', 'source array preserved untouched');

    // Pure card search over 5,000 items excludes lore
    const matched = C.filterItems(pool, { cat: 'weapons', rarity: 'all', material: 'Mithril', query: 'fire blade' }, null, null, ctx);
    assert.equal(matched.length, 250);
    const loreMiss = C.filterItems(pool, { cat: 'all', rarity: 'all', material: 'all', query: 'ancient' }, null, null, ctx);
    assert.equal(loreMiss.length, 0);

    // RU sortItems('name') pre-ranked collator produces exact alphabetical order
    const byName = C.sortItems(pool, 'name', ctx);
    assert.equal(byName.length, N);
    const ruCol = new Intl.Collator('ru', { sensitivity: 'base', numeric: true });
    assert.ok(ruCol.compare(byName[0].name, byName[1].name) <= 0);
    assert.ok(ruCol.compare(byName[N - 2].name, byName[N - 1].name) <= 0);
  });

  // RU container pure-JS search translates item names, techInfo, recipe ingredients, Worth, and invalidates mutated scalars
  withFakeEnv('ru', (C) => {
    globalThis.__translate = (s) => ({
      Torch: 'Факел',
      'The Wild Elves': 'Дикие эльфы',
      Technique: 'Боевой прием',
      Lunge: 'Выпад',
      'Dash 5m': 'Рывок 5м',
      'Recipe for': 'Рецепт для',
      Ingredients: 'Ингредиенты',
      'Healing Potion': 'Зелье лечения',
      'Red Flowers': 'Красные цветы',
      Worth: 'Ценность',
      '500 gold': '500 золота',
    }[s] || s);
    let activeLight = null;
    const ruTorch = { uid: 'rt1', name: 'Torch', group: 'UselessItems2', templateIndex: 247, rarity: 'common', isLit: false };
    const ruBook = { uid: 'rb1', name: 'The Wild Elves', group: 'Books', templateIndex: 277, rarity: 'common' };
    const ruSword = { uid: 'rs1', name: 'Torch Sword', group: 'Weapons', templateIndex: 120, rarity: 'rare', exalted: false };
    const ruRecipe = { uid: 'rr1', name: 'Recipe', group: 'Books', templateIndex: 278, rarity: 'common' };
    const ruLetter = { uid: 'rl1', name: 'Letter of Credit', group: 'MiscItems', templateIndex: 275, rarity: 'common', isLetter: true };
    const items = [ruTorch, ruBook, ruSword, ruRecipe, ruLetter];
    const ruCtx = {
      live: true,
      lightSource: () => activeLight,
      rarityOf: (it) => it.rarity || 'common',
      isLocked: () => false,
      isJunk: () => false,
      itemLine: (it) => {
        if (it === ruRecipe) return { name: it.name, recipe: { potion: 'Healing Potion', ingredients: ['Red Flowers'] } };
        return { name: it.name, condition: it === ruSword ? 85 : null };
      },
      techInfo: (it) => (it === ruSword ? { name: 'Lunge', what: 'Dash 5m' } : null),
      letterWorth: (it) => (it === ruLetter ? '500 gold' : null),
    };
    assert.deepEqual(C.filterItems(items, { query: 'факел' }, null, null, ruCtx).map((x) => x.uid), ['rt1'], 'RU container search finds translated item name');
    assert.deepEqual(C.filterItems(items, { query: 'дикие эльфы' }, null, null, ruCtx).map((x) => x.uid), ['rb1'], 'RU container search finds translated book title');
    assert.deepEqual(C.filterItems(items, { query: 'боевой прием выпад' }, null, null, ruCtx).map((x) => x.uid), ['rs1'], 'RU container search indexes techInfo');
    assert.deepEqual(C.filterItems(items, { query: 'ингредиенты красные цветы' }, null, null, ruCtx).map((x) => x.uid), ['rr1'], 'RU container search indexes recipe ingredients');
    assert.deepEqual(C.filterItems(items, { query: 'ценность 500 золота' }, null, null, ruCtx).map((x) => x.uid), ['rl1'], 'RU container search indexes Worth');
    assert.equal(C.filterItems(items, { query: 'возвышенный' }, null, null, ruCtx).length, 0);
    ruSword.exalted = true;
    assert.deepEqual(C.filterItems(items, { query: 'возвышенный' }, null, null, ruCtx).map((x) => x.uid), ['rs1'], 'containerCardTextOf invalidates on exalted mutation');
    assert.equal(C.filterItems(items, { query: 'факел горит' }, null, null, ruCtx).length, 0);
    activeLight = ruTorch;
    assert.deepEqual(C.filterItems(items, { query: 'факел горит' }, null, null, ruCtx).map((x) => x.uid), ['rt1'], 'containerCardTextOf invalidates when lightSource changes');
    // RU sortItems('name') orders by translated visible names (Дикие < Лист/Бук? 'Дикие эльфы' < 'Факел')
    const sortedRu = C.sortItems([ruTorch, ruBook], 'name', ruCtx);
    assert.deepEqual(sortedRu.map((x) => x.uid), ['rb1', 'rt1'], 'RU container name sort uses translated visible item names');
  });
});

test('transformContainer hooks live 0.1.14631 bundles cleanly, idempotently, and with valid JS syntax', { skip: !GAME_DIR && 'DFO_BUILD_DIR not set' }, () => {
  const sfRaw = findAsset(GAME_DIR, 'storeFilter-');
  const eiRaw = findAsset(GAME_DIR, 'enhancedInventory-');
  assert.ok(sfRaw && eiRaw, 'storeFilter and enhancedInventory bundles must exist in DFO_BUILD_DIR');

  const log = [];
  const sf1 = transformContainer('assets/storeFilter-test.js', sfRaw, log);
  const ei1 = transformNearby('assets/enhancedInventory-test.js',
    transformInventory('assets/enhancedInventory-test.js',
      transformContainer('assets/enhancedInventory-test.js', eiRaw, log), log), log);

  assert.ok(log.some(([id, n]) => id === 'container.filter' && n === 1));
  assert.ok(log.some(([id, n]) => id === 'container.view' && n === 1));
  assert.ok(!log.some(([id]) => id.includes('!error')), `transform errors: ${JSON.stringify(log)}`);

  // Idempotent on second pass
  const log2 = [];
  assert.equal(transformContainer('assets/storeFilter-test.js', sf1, log2), sf1);
  assert.equal(transformContainer('assets/enhancedInventory-test.js', ei1, log2), ei1);
  assert.equal(log2.length, 0);

  // Salvage guard in container.view must apply ONLY to local side, never block remote stack transfers
  assert.match(ei1, /\([a-zA-Z_$]+!==`local`\|\|![a-zA-Z_$]+\)&&__dfoContainerClick\$\(/);

  // Syntax check real transformed bundles as ES modules
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfo-container-syn-'));
  try {
    const sfFile = path.join(tmpDir, 'sf.mjs');
    const eiFile = path.join(tmpDir, 'ei.mjs');
    fs.writeFileSync(sfFile, sf1);
    fs.writeFileSync(eiFile, ei1);
    execFileSync(process.execPath, ['--check', sfFile], { stdio: 'pipe' });
    execFileSync(process.execPath, ['--check', eiFile], { stdio: 'pipe' });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('paired Ground empty transition, modal key isolation, Cancel Enter handling, and empty storesearch Escape blur', () => {
  withFakeEnv('en', (C, doc) => {
    const docListeners = [];
    const origAdd = doc.addEventListener.bind(doc);
    const origRem = doc.removeEventListener.bind(doc);
    doc.addEventListener = (ev, fn, opts) => {
      docListeners.push({ ev, fn });
      origAdd(ev, fn, opts);
    };
    doc.removeEventListener = (ev, fn, opts) => {
      const idx = docListeners.findIndex((e) => e.ev === ev && e.fn === fn);
      if (idx >= 0) docListeners.splice(idx, 1);
      origRem(ev, fn, opts);
    };

    const gItem = { uid: 'g1', name: 'Dropped Sword', group: 'Weapons', templateIndex: 120, stackCount: 1 };
    const bagStack = { uid: 'b1', name: 'Red Flowers', group: 'PlantIngredients1', templateIndex: 10, stackCount: 10 };
    const ctx = {
      live: true,
      paired: true,
      el: (t, c, txt) => {
        const n = doc.createElement(t);
        if (c) n.className = c;
        if (txt != null) n.textContent = txt;
        return n;
      },
      remote: { kind: 'ground', title: 'Ground', items: [gItem], count: 1, weight: 2 },
      pages: [['weapons', 'Weapons'], ['armor', 'Armor'], ['clothing', 'Clothing'], ['potions', 'Potions'], ['ingredients', 'Ingredients'], ['books', 'Books'], ['valuables', 'Valuables'], ['misc', 'Misc'], ['junk', 'Junk']],
      filter: { kind: 'ground', cat: 'all', rarity: 'all', material: 'all', query: '' },
      resetFilter: (k) => { ctx.filter = { kind: k, cat: 'all', rarity: 'all', material: 'all', query: '' }; },
      pocketGold: 50,
      carryNow: 10,
      carryMax: 100,
      isStowableKind: () => true,
      buildItemRow: (it) => { const b = doc.createElement('button'); b.className = 'itemrow'; b._it = it; return b; },
      mountRemoteList: () => ({ sync() { } }),
      rarityOf: () => 'common',
      itemLine: (it) => ({ name: it.name }),
      maxQty: () => 10,
      takeItem: () => { },
      stowItem: () => { },
      close: () => { },
    };

    // Mount standard Ground container inside shell, then unmount only lootWin (last ground item taken)
    const shell = doc.createElement('div');
    shell.className = 'pack-shell paired';
    const packWin = doc.createElement('div');
    packWin.className = 'pack-win';
    const lootAside = doc.createElement('aside');
    lootAside.className = 'loot-win';
    const remoteCol = C.buildRemote(ctx);
    lootAside.append(remoteCol);
    shell.append(packWin, lootAside);
    doc.body.append(shell);
    C.onShellMounted(shell, lootAside, packWin, ctx);
    assert.ok(docListeners.some((l) => l.ev === 'pointerdown'), 'standard mount attaches document pointerdown listener');

    // Also test search Escape: clears when non-empty, blurs when empty
    const searchInput = remoteCol.querySelector('.storesearch');
    let blurred = 0;
    searchInput.blur = () => { blurred++; };
    searchInput.value = 'sword';
    searchInput.onkeydown({ key: 'Escape', preventDefault() { }, stopPropagation() { } });
    assert.equal(searchInput.value, '');
    assert.equal(blurred, 0);
    searchInput.onkeydown({ key: 'Escape', preventDefault() { }, stopPropagation() { } });
    assert.equal(blurred, 1, 'second Escape on empty .storesearch calls blur()');

    // Empty ground -> onShellMounted called with lootWin = null must clean up pointerdown listener
    C.onShellMounted(shell, null, packWin, ctx);
    assert.equal(docListeners.some((l) => l.ev === 'pointerdown'), false, 'empty Ground transition removes leaked pointerdown listener');

    // Open store quantity modal, focus Cancel button, verify Enter does NOT confirm & onKeyDown shields hotkeys
    let stowed = 0;
    ctx.stowItem = () => { stowed++; };
    const modal = C.showQuantityModal({ item: bagStack, mode: 'store', maxAmount: 10, ctx });
    modal.input.value = '5';
    doc.activeElement = modal.btnCancel;
    modal.backdrop.parentNode.dispatchEvent({ type: 'keydown', key: 'Enter', target: modal.btnCancel, preventDefault() { }, stopPropagation() { } });
    assert.equal(stowed, 0, 'Enter while Cancel button focused must NOT submit confirm()');
    assert.equal(C.onKeyDown({ key: 'i', target: modal.btnCancel, stopPropagation() { } }), true, 'onKeyDown blocks hotkeys behind open modal');
    assert.equal(C.onKeyDown({ key: 'Escape', target: modal.btnCancel, preventDefault() { }, stopPropagation() { } }), true);
    assert.equal(stowed, 0);
    assert.equal(modal.backdrop.parentNode, null, 'Escape closes quantity modal');

    // maxQty === 0 immediately delegates to takeItem/stowItem (native refusal notice) instead of opening modal with max = stackCount
    let takenZero = 0;
    let stowedZero = 0;
    ctx.maxQty = () => 0;
    ctx.takeItem = (_it, n) => { takenZero++; assert.equal(n, null); };
    ctx.stowItem = (_it, n) => { stowedZero++; assert.equal(n, null); };
    ctx.remote = { kind: 'chest', title: 'Chest', items: [bagStack], count: 1, weight: 5 };
    assert.equal(C.handleRowClick(bagStack, 'remote', { ctrlKey: true, shiftKey: true, stopPropagation() { } }, ctx), true);
    assert.equal(takenZero, 1, 'maxQty === 0 on remote Ctrl+Shift+Click calls takeItem directly');
    assert.equal(doc.querySelector('.dfo-loot-modal'), null, 'maxQty === 0 does not open bogus quantity modal for remote take');
    assert.equal(C.handleRowClick(bagStack, 'local', { ctrlKey: true, shiftKey: true, stopPropagation() { } }, ctx), true);
    assert.equal(stowedZero, 1, 'maxQty === 0 on local Ctrl+Shift+Click calls stowItem directly');
    assert.equal(doc.querySelector('.dfo-loot-modal'), null, 'maxQty === 0 does not open bogus quantity modal for local store');

    const ctxMenu = doc.createElement('div');
    ctxMenu.className = 'inv-menu';
    C.decorateContextMenu(ctxMenu, bagStack, 'remote', () => { }, ctx, 10, 10);
    const takeCustomBtn = [...ctxMenu.querySelectorAll('button.inv-menu-item')][2];
    takeCustomBtn.onclick({ stopPropagation() { } });
    assert.equal(takenZero, 2, 'maxQty === 0 on context-menu takeCustom calls takeItem directly');
    assert.equal(doc.querySelector('.dfo-loot-modal'), null, 'takeCustom with maxQty === 0 does not open quantity modal');

    // Opening quantity modal closes any open container filter dropdown inside activeMount.col
    C.onShellMounted(shell, lootAside, packWin, ctx);
    const ddHost = doc.createElement('div');
    ddHost.className = 'dfo-loot-dd is-open';
    const ddBtn = doc.createElement('button');
    ddBtn.className = 'dfo-loot-dd-btn';
    ddBtn.setAttribute('aria-expanded', 'true');
    ddHost.append(ddBtn);
    remoteCol.append(ddHost);
    ctx.maxQty = () => 10;
    const modal2 = C.showQuantityModal({ item: bagStack, mode: 'take', maxAmount: 5, ctx });
    assert.ok(modal2);
    assert.equal(ddHost.classList.contains('is-open'), false, 'showQuantityModal closes open dropdowns before opening');
    assert.equal(ddBtn.getAttribute('aria-expanded'), 'false');
    assert.equal(modal2.btnCancel.classList.contains('dfo-loot-modal-cancel'), true, 'modal Cancel button carries readonly marker class for paired listener');
    C.closeQuantityModal();
    assert.equal(modal2.backdrop.parentNode, null, 'closeQuantityModal detaches active modal');

    // syncPairedHeight on width change only remeasures remote vHandle instead of calling ctx.remeasureRemote (which would clear 5k packlists heights)
    let remoteSyncs = [];
    let fullRemeasures = 0;
    ctx.remote = { kind: 'container', title: 'Chest', items: [gItem], count: 1, weight: 2 };
    ctx.mountRemoteList = () => ({
      sync(o) { remoteSyncs.push(o ? { ...o } : {}); },
    });
    ctx.remeasureRemote = () => { fullRemeasures++; };
    const col2 = C.buildRemote(ctx);
    const lb2 = col2.querySelector('.remotelist');
    lb2.clientWidth = 300;
    lootAside.textContent = '';
    lootAside.append(col2);
    packWin.style.height = '520px';
    C.onShellMounted(shell, lootAside, packWin, ctx);
    remoteSyncs.length = 0;
    fullRemeasures = 0;
    lb2.clientWidth = 360;
    C.onShellMounted(shell, lootAside, packWin, ctx);
    assert.equal(fullRemeasures, 0, 'container width change does not wipe .packlists 5k height cache via ctx.remeasureRemote');
    assert.deepEqual(remoteSyncs, [{ remeasure: true }], 'container width change remeasures active remote vHandle only');

    // classifyItem cache invalidates on stolen/cursed/currentCondition/value/flags in-place mutations
    const tagItem = { uid: 't1', group: 'Weapons', templateIndex: 120, name: 'Iron Blade', value: 120, currentCondition: 100 };
    const tagEnv = {
      seq: 1,
      packPageFn: (it) => ((it.stolen || it.cursed || it.currentCondition === 0 || it.value === 0) ? 'junk' : 'weapons'),
    };
    assert.equal(C.classifyItem(tagItem, ctx, null, tagEnv).pg, 'weapons');
    tagItem.stolen = true;
    assert.equal(C.classifyItem(tagItem, ctx, null, tagEnv).pg, 'junk', 'classifyItem invalidates on stolen mutation');
    tagItem.stolen = false;
    tagItem.cursed = true;
    assert.equal(C.classifyItem(tagItem, ctx, null, tagEnv).pg, 'junk', 'classifyItem invalidates on cursed mutation');
    tagItem.cursed = false;
    tagItem.currentCondition = 0;
    assert.equal(C.classifyItem(tagItem, ctx, null, tagEnv).pg, 'junk', 'classifyItem invalidates on currentCondition mutation');
    tagItem.currentCondition = 100;
    tagItem.value = 0;
    assert.equal(C.classifyItem(tagItem, ctx, null, tagEnv).pg, 'junk', 'classifyItem invalidates on value mutation');

    // classifyItem & containerCardTextOf keep warm caches across meta=null vs meta=__dfoStoreMeta$ when page/mat/rar fns match
    let cardCalls = 0;
    const sharedPage = (it) => (it.group === 'Weapons' ? 'weapons' : 'misc');
    const sharedMat = () => 'Iron';
    const sharedRar = (it) => it.rarity || 'common';
    const metaA = { pageOf: sharedPage, materialOf: sharedMat, rarityOf: sharedRar };
    const metaItem = { uid: 'meta1', group: 'Weapons', templateIndex: 101, name: 'Meta Blade', rarity: 'rare', value: 50, armorType: 'Chain' };
    const ctxMeta = {
      ...ctx,
      live: true,
      itemLine: () => { cardCalls++; return { material: 'Iron' }; },
      itemEffects: () => ['+5 Attack'],
    };
    globalThis.__dfoStoreFilterMeta = metaA;
    try {
      const c1 = C.classifyItem(metaItem, ctxMeta, null);
      const t1 = C.containerCardTextOf(metaItem, ctxMeta, null);
      const callsAfterFirst = cardCalls;
      const metaB = { pageOf: sharedPage, materialOf: sharedMat, rarityOf: sharedRar };
      const c2 = C.classifyItem(metaItem, ctxMeta, metaB);
      const t2 = C.containerCardTextOf(metaItem, ctxMeta, metaB);
      assert.equal(c2, c1, 'classifyItem hits cache across null vs equivalent meta');
      assert.equal(t2, t1, 'containerCardTextOf hits cache across null vs equivalent meta');
      assert.equal(cardCalls, callsAfterFirst, 'cache hit avoids recomputing itemLine during Take All / storeFilter');
    } finally {
      delete globalThis.__dfoStoreFilterMeta;
    }

    // showQuantityModal closes inventory sort/junk dialogs & charcol tooltips; Escape closes modal before windowStack
    let closeSortCount = 0;
    let closeJunkCount = 0;
    let cleanTipCount = 0;
    const prevPackGlobal = globalThis.__dfoPack;
    const prevCharcolGlobal = globalThis.__dfoCharcolV2;
    globalThis.__dfoPack = { closeSort: () => { closeSortCount++; }, closeJunk: () => { closeJunkCount++; } };
    globalThis.__dfoCharcolV2 = { cleanupCharcolTooltips: () => { cleanTipCount++; } };
    try {
      const mOverlap = C.showQuantityModal({ item: bagStack, mode: 'take', maxAmount: 3, ctx });
      assert.ok(mOverlap);
      assert.equal(closeSortCount, 1);
      assert.equal(closeJunkCount, 1);
      assert.equal(cleanTipCount, 1);
      C.closeQuantityModal();
    } finally {
      globalThis.__dfoPack = prevPackGlobal;
      globalThis.__dfoCharcolV2 = prevCharcolGlobal;
    }
  });
});

test('dfo_container root Escape capture closes modal/dropdown before windowStack and dropdown closes on focusout', () => {
  const prevAdd = globalThis.addEventListener;
  const prevRemove = globalThis.removeEventListener;
  const prevDetach = globalThis.__dfoContainerDetachKey$;
  const capListeners = [];
  globalThis.addEventListener = (type, fn, cap) => {
    if (type === 'keydown' && cap) capListeners.push(fn);
  };
  globalThis.removeEventListener = (type, fn, cap) => {
    if (type !== 'keydown' || !cap) return;
    const idx = capListeners.indexOf(fn);
    if (idx >= 0) capListeners.splice(idx, 1);
  };
  try {
    withFakeEnv('en', (C, doc) => {
      let windowStackClosed = 0;
      const onWindowStackKey = (ev) => {
        if (ev.key === 'Escape') windowStackClosed++;
      };
      // Emulate windowStack registering after dfo_container.js
      capListeners.push(onWindowStackKey);

      const fireEscape = () => {
        let stoppedNow = false;
        const ev = {
          type: 'keydown',
          key: 'Escape',
          preventDefault() { },
          stopPropagation() { },
          stopImmediatePropagation() { stoppedNow = true; },
        };
        for (const fn of [...capListeners]) {
          fn(ev);
          if (stoppedNow) break;
        }
      };

      const item = { uid: 's1', name: 'Arrows', stackCount: 10, value: 1 };
      const ctx = {
        live: true,
        items: [item],
        el: (t, c, txt) => {
          const n = doc.createElement(t);
          if (c) n.className = c;
          if (txt != null) n.textContent = txt;
          return n;
        },
        pages: [['weapons', 'Weapons'], ['misc', 'Misc'], ['junk', 'Junk']],
        remote: { kind: 'chest', title: 'Chest', items: [item], count: 1, weight: 1 },
        filter: { kind: 'chest', cat: 'all', rarity: 'all', material: 'all', query: '' },
        resetFilter: (k) => { ctx.filter = { kind: k, cat: 'all', rarity: 'all', material: 'all', query: '' }; },
        pocketGold: 50,
        carryNow: 10,
        carryMax: 100,
        mountRemoteList: () => ({ sync() { } }),
        rarityOf: () => 'common',
        itemLine: (it) => ({ name: it.name }),
        nameOf: (it) => it.name,
        takeItem: () => { },
        stowItem: () => { },
        close: () => { },
      };

      const modal = C.showQuantityModal({ item, mode: 'take', maxAmount: 10, ctx });
      assert.ok(modal);
      fireEscape();
      assert.equal(modal.backdrop.parentNode, null, 'root capture Escape closes quantity modal');
      assert.equal(windowStackClosed, 0, 'quantity modal Escape stops before windowStack closes inventory');

      const col = C.buildRemote(ctx);
      doc.body.append(col);
      C.onShellMounted(doc.body, doc.body, doc.body, ctx);
      const ddWrap = col.querySelector('.dfo-loot-dd');
      const ddBtn = col.querySelector('.dfo-loot-dd-btn');
      ddWrap.contains = (other) => other === ddWrap || other === ddBtn;
      ddWrap.addEventListener = ddWrap.addEventListener.bind(ddWrap);
      ddBtn.onclick({ preventDefault() { }, stopPropagation() { } });
      assert.equal(ddWrap.classList.contains('is-open'), true, 'dropdown opens on button click');

      // focusout to an external node closes dropdown
      ddWrap.dispatchEvent({ type: 'focusout', relatedTarget: { outside: true } });
      assert.equal(ddWrap.classList.contains('is-open'), false, 'focusout to sibling outside wrap closes dropdown');

      // Reopen dropdown and verify root Escape yields when a foreground overlay (.inv-info / .inv-menu) is active
      ddBtn.onclick({ preventDefault() { }, stopPropagation() { } });
      assert.equal(ddWrap.classList.contains('is-open'), true);
      const fgOverlay = doc.createElement('div');
      fgOverlay.className = 'inv-info inv-target';
      doc.body.append(fgOverlay);
      fireEscape();
      assert.equal(ddWrap.classList.contains('is-open'), true, 'background dropdown yields Escape while .inv-info overlay is open');
      fgOverlay.remove();

      // With foreground overlay gone, root Escape closes dropdown before windowStack
      windowStackClosed = 0;
      fireEscape();
      assert.equal(ddWrap.classList.contains('is-open'), false, 'root capture Escape closes open dropdown');
      assert.equal(windowStackClosed, 0, 'dropdown Escape stops before windowStack closes inventory');
    });
  } finally {
    try { globalThis.__dfoContainerDetachKey$?.(); } catch { }
    if (prevDetach !== undefined) globalThis.__dfoContainerDetachKey$ = prevDetach;
    else delete globalThis.__dfoContainerDetachKey$;
    globalThis.addEventListener = prevAdd;
    globalThis.removeEventListener = prevRemove;
  }
});

test('packLockGuards refreshes model on Junk/Not junk toggle just like Lock/Unlock', () => {
  const { packLockGuards, lifecycle } = require('../src/mod/inventory-transform.cjs');
  const sample = `
    function Qs(e){if(R?.kind===\`ground\`&&wt(e,\`drop\`)||Xs(e)||R&&jt(e,R.kind)||R&&Zs(e))return{kind:\`stow\`,label:null,speaks:!0};let t=xi(e,{});return t.ok?{kind:\`stow\`,label:es[R.kind]}:{kind:\`nope\`,label:null}}
    function Qc(e){if(F=null,R?.kind===\`ground\`&&wt(e,\`drop\`))return F=tr(w(e,{getQuest:j.getQuest??null})),$();if(R&&Pt(e))return F=Nt(w(e,{getQuest:j.getQuest??null})),$();let t=Ke(j,null),n=xi(e,{});Zc(\`put\`,e,n.amount,()=>yi(e,n,j.items(),t,{}))}
    function nl(t){F=null;let n=t===\`take\`,r=n?ia(R.items,tl(),uu):M.tabs.find(e=>e.tab===fs)?.items??[],i=n?Ke(j,null):j.items?.()??[],a=n?j.items?.()??[]:Ke(j,null),o=null,s=null,c=null,l=[],{moved:u,notice:d}=So([...r],e=>{if(!i.includes(e))return{verdict:\`skip\`};if(!n){if(Pt(e))return{verdict:\`skip\`,refusal:{text:Nt(w(e,{getQuest:j.getQuest??null}))}};if(R.kind===\`ground\`&&wt(e,\`drop\`))return{verdict:\`skip\`,refusal:{text:tr(w(e,{getQuest:j.getQuest??null}))}}}let p=n?bi(e):xi(e);return{verdict:xo(e,p),refusal:p.refusal,plan:p}},(e,t)=>yi(e,t.plan,i,a,{}));if(d)F=d;}
    function $(){return render();}
    function G(){return refresh();}
    function Du(e,t,r){
      let x=U(\`div\`,\`packtip\`);
      if(t===\`local\`){let t=U(\`button\`,\`act\`,ca(e)?\`Unlock\`:\`Lock\`);t.onclick=()=>{da(e),ua(e),F=null,$()}}
      if(t===\`local\`&&!r.equipped&&fa(e)){let t=U(\`button\`,\`act\`,ma(e)?\`Not junk\`:\`Junk\`);t.onclick=()=>{ha(e),F=null,$()}}
      return x;
    }
  `;
  const patched = packLockGuards(sample, { elFn: 'U', refreshFn: 'G', renderFn: '$' });
  assert.ok(patched.includes('da(e),ua(e),F=null,G(),$()'), 'Lock/Unlock calls G(),$()');
  assert.ok(patched.includes('ha(e),F=null,G(),$()'), 'Junk/Not junk calls G(),$() so Junk tab & paired Stash all stay in sync');

  // Also test lifecycle __dfoInventoryRemeasure$(shell, { soft: true }) passes { draw: true }
  const syncCalls = [];
  const lcSrc = `
    let h={contains(){return true}},d={},c={key:1,img:1},zs=[{sync(o){syncCalls.push(o)}}];
    const arm={subscribe(fn){this.fn=fn}};
    var Ws=e=>{for(let t of zs)t.sync(e)};
    function r(){}
    function mount(){arm.subscribe(()=>{c={key:null,img:null};if(h)r()});r()}
  `;
  const api = new Function('syncCalls', lifecycle(lcSrc, 'r', 'd') + '\nreturn {remeasure:globalThis.__dfoInventoryRemeasure$}')(syncCalls);
  assert.equal(api.remeasure({ isConnected: true }), true);
  assert.equal(api.remeasure({ isConnected: true }, { soft: true }), true);
  assert.deepEqual(syncCalls.map((x) => ({ ...x })), [{ remeasure: true }, { draw: true }]);

  if (GAME_DIR) {
    const { transformContainer } = require('../src/mod/container-transform.cjs');
    const { transformInventory } = require('../src/mod/inventory-transform.cjs');
    const sfRaw = findAsset(GAME_DIR, 'storeFilter-');
    const eiRaw = findAsset(GAME_DIR, 'enhancedInventory-');
    assert.ok(sfRaw && eiRaw, 'storeFilter and enhancedInventory bundles must exist in DFO_BUILD_DIR');
    const sfOut = transformContainer('assets/storeFilter-test.js', sfRaw, []);
    assert.ok(sfOut.includes('const __dfoStoreMeta$={'), 'storeFilter hoists shared __dfoStoreMeta$ once');
    assert.ok(!/filterItems[\s\S]*__dfoContainerFilter\$\([^;]+\{pageOf:/.test(sfOut), 'storeFilter does not allocate meta literal per call');
    const out = transformInventory('assets/enhancedInventory-test.js', eiRaw, []);
    assert.match(out, /Not junk[`'"]\s*:\s*[`'"]Junk[`'"]\);[\w$]+\.onclick=\(\)=>\{[\w$]+\([\w$]+\),[\w$]+=null,[\w$]+\(\),[\w$]+\(\)\}/, 'live enhancedInventory Junk/Not junk toggles call refresh()+render()');
    assert.ok(out.includes('opts?.soft?{draw:true}:{remeasure:true}'), 'live enhancedInventory supports soft draw remeasure');
    assert.ok(out.includes('isFindRendered?.()===!0'), 'live enhancedInventory isolates Find scrollTop from tab scroll map');
    assert.ok(out.includes('isFindOpen?.()===!0'), 'live enhancedInventory restores Find scrollTop in Find mode');

    // Execute extracted save/restore scroll statements against simulated normal -> Find -> normal transitions
    const saveStmt = /let ([\w$]+)=([\w$]+)\.querySelector\(`\.packlists`\);\(globalThis\.__dfoPack\?\.isFindRendered\?\.\(\)===!0\?[\s\S]{0,160}?\.clear\(\)/.exec(out);
    const restoreStmt = /let ([\w$]+)=([\w$]+)\.querySelector\(`\.packlists`\);\(globalThis\.__dfoPack\?\.isFindOpen\?\.\(\)===!0\?[\s\S]{0,180}?,([\w$]+)=([\w$]+)/.exec(out);
    assert.ok(saveStmt && restoreStmt, 'live enhancedInventory exposes executable Find scroll save & restore statements');
    const hsFn = /,([\w$]+)\(\),([\w$]+)\.clear\(\)$/.exec(saveStmt[0]);
    assert.ok(hsFn);
    const simFn = new Function(
      'packObj', 'ps', 'fsInit', 'msInit', 'rootEl',
      `let ${saveStmt[2]}=rootEl,${restoreStmt[4]}=fsInit,${restoreStmt[3]}=msInit;
       const ${hsFn[1]}=()=>{},${hsFn[2]}={clear(){}};
       const prev=globalThis.__dfoPack;globalThis.__dfoPack=packObj;
       try{
         const save=()=>{${saveStmt[0]}};
         const restore=()=>{${restoreStmt[0]}};
         return {save,restore,getMs:()=>${restoreStmt[3]},setFs:(v)=>{${restoreStmt[4]}=v;}};
       }finally{}`
    );
    const prevPack = globalThis.__dfoPack;
    try {
      const ps = new Map([['weapons', 120]]);
      const packEl = { scrollTop: 120 };
      const rootEl = { querySelector: () => packEl };
      let isRendered = false, isOpen = false, fScroll = 0;
      const sim = simFn({
        isFindRendered: () => isRendered,
        isFindOpen: () => isOpen,
        findScrollTop: () => fScroll,
        syncFindScroll: (v) => { if (isOpen && isRendered) fScroll = v; },
      }, ps, 'weapons', 'weapons', rootEl);
      // Case A: normal -> open Find
      isOpen = true; isRendered = false;
      packEl.scrollTop = 260;
      sim.save();
      assert.equal(ps.get('weapons'), 260, 'opening Find preserves pre-Find tab scroll in ps');
      isRendered = true;
      packEl.scrollTop = 999;
      sim.restore();
      assert.equal(packEl.scrollTop, 0, 'opening Find starts Find scrollTop at 0 instead of inheriting tab scroll');
      // Case B: scrolled inside Find -> transfer/re-render
      packEl.scrollTop = 640;
      sim.save();
      assert.equal(fScroll, 640, 're-render inside Find syncs findScrollTop');
      assert.equal(ps.get('weapons'), 260, 'Find scroll never overwrites tab scroll ps');
      packEl.scrollTop = 0;
      sim.restore();
      assert.equal(packEl.scrollTop, 640, 're-render inside Find restores findScrollTop before sync');
      // Case C: close Find -> back to normal tab
      isOpen = false;
      packEl.scrollTop = 640;
      sim.save();
      isRendered = false;
      sim.restore();
      assert.equal(packEl.scrollTop, 260, 'closing Find restores pre-Find tab scroll cleanly');
      assert.equal(sim.getMs(), 'weapons');
    } finally {
      globalThis.__dfoPack = prevPack;
    }
  }
});

function findChromiumBin() {
  for (const cand of [
    process.env.CHROMIUM_BIN,
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ].filter(Boolean)) {
    if (fs.existsSync(cand)) return cand;
  }
  return '';
}

test('dfo_container CSS uses Grid on all widths, styles .vrows-gap, removes contain paint culling, and syncs height before scroll restore', () => {
  const dcSrc = fs.readFileSync(path.join(ROOT, 'src/mod/page/dfo_container.js'), 'utf8');
  assert.ok(!/\.remotelist\s*\{[^}]*flex-direction:\s*column/i.test(dcSrc), '.remotelist never sets flex-direction: column');
  assert.ok(/:is\(\.vlist-top,\s*\.vlist-bot,\s*\.vrows-gap\)\s*\{[^}]*flex:\s*0\s+0\s+auto\s*!important/i.test(dcSrc), 'CSS overrides inline flex:0 0 100% on .vrows-gap');
  assert.ok(!/\.remotelist\s*\{[^}]*contain:\s*layout\s+style\s+paint/i.test(dcSrc), '.remotelist drops contain: layout style paint compositor culling');
  assert.ok(!/\.itemrow\s*\{[^}]*contain:\s*layout\s+style/i.test(dcSrc), '.itemrow drops contain: layout style');
  const syncAt = dcSrc.indexOf('syncPairedHeight(shell, lootWin, packWin, ctx);');
  const restoreAt = dcSrc.indexOf('activeMount?.restoreScrollAfterMount?.();');
  assert.ok(syncAt > 0 && restoreAt > 0, 'onShellMounted calls both syncPairedHeight and restoreScrollAfterMount');
  assert.ok(syncAt < restoreAt, 'onShellMounted syncs paired height BEFORE restoring scroll position');
});

test('real Chromium: container virtual list with native Lo() renders items cleanly at 25..5000 items across all viewport sizes', { skip: !findChromiumBin() || !GAME_DIR }, () => {
  const chrome = findChromiumBin();
  const eiRaw = findAsset(GAME_DIR, 'enhancedInventory-');
  assert.ok(eiRaw, 'enhancedInventory bundle required');
  const loMatch = /var Po=[^;]+;function Lo\([\s\S]+?get whole\(\)\{[\s\S]+?range:\(\)=>\[[\w$]+,[\w$]+\]\}\}/.exec(eiRaw);
  assert.ok(loMatch, 'native Lo virtualizer found in enhancedInventory');

  // Build isolated harness loading real dfo_container.js CSS + native Lo()
  const cssM = /const CSS = `([\s\S]*?)`;/.exec(fs.readFileSync(path.join(ROOT, 'src/mod/page/dfo_container.js'), 'utf8'));
  assert.ok(cssM);
  const resolvedCss = cssM[1].replace(/\$\{FRAME_SVG\}/g, '');

  const harness = (w, h, paired, counts) => {
    const html = `<!doctype html><html data-dfo-container="1"><head><meta charset="utf-8"><style>
      body{margin:0;background:#111;color:#eee;}
      .pack-shell{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;gap:12px;padding:12px;backdrop-filter:blur(6px);}
      ${resolvedCss}
      html[data-dfo-container] .pack-shell .loot-win .remotelist .itemrow{min-height:46px;box-sizing:border-box;display:flex;align-items:center;padding:6px 8px;}
    </style></head><body>
    <div id="mount"></div><pre id="out"></pre>
    <script>
      try {
      ${loMatch[0]}
      const mount = document.getElementById('mount');
      const results = [];
      for (const n of ${JSON.stringify(counts)}) {
        const shell = document.createElement('div');
        shell.className = 'pack-shell' + (${paired ? 'true' : 'false'} ? ' paired' : '');
        const loot = document.createElement('aside');
        loot.className = 'loot-win';
        loot.setAttribute('data-dfo-loot-kind', 'container');
        if (${paired ? 'true' : 'false'}) loot.style.setProperty('--dfo-paired-loot-h', '600px');
        const col = document.createElement('section');
        col.className = 'packcol packremote';
        const list = document.createElement('div');
        list.className = 'remotelist';
        col.append(list);
        loot.append(col);
        shell.append(loot);
        if (${paired ? 'true' : 'false'}) {
          const pw = document.createElement('div');
          pw.className = 'pack-win';
          pw.style.cssText = 'width:600px;height:600px;';
          shell.append(pw);
        }
        mount.replaceChildren(shell);
        const items = Array.from({ length: n }, (_, i) => ({ name: 'Item ' + i, idx: i }));
        const sizes = new Map();
        const vh = Lo(list, items, (it) => {
          const b = document.createElement('button');
          b.className = 'itemrow dfo-item-row';
          b.textContent = it.name;
          return b;
        }, { min: 60, first: 36, sizes });
        vh.sync();
        const r = list.getBoundingClientRect();
        const measureVisible = () => {
          const lr = list.getBoundingClientRect();
          const rows = [...list.querySelectorAll('.itemrow')];
          return rows.filter((el) => {
            const br = el.getBoundingClientRect();
            return br.height > 0 && br.bottom > lr.top && br.top < lr.bottom;
          }).length;
        };
        const visTop = measureVisible();
        list.scrollTop = Math.floor(list.scrollHeight / 2);
        vh.sync();
        const visMid = measureVisible();
        list.scrollTop = list.scrollHeight;
        vh.sync();
        const visEnd = measureVisible();
        const gaps = [...list.querySelectorAll('.vrows-gap')].map((g) => ({
          inlineH: parseFloat(g.style.height) || 0,
          rectH: Math.round(g.getBoundingClientRect().height),
        }));
        results.push({
          n, clientH: list.clientHeight, scrollH: list.scrollHeight, rectH: Math.round(r.height),
          visTop, visMid, visEnd, range: vh.range(), gaps,
        });
        vh.dispose();
      }
      document.getElementById('out').textContent = JSON.stringify(results);
      } catch (err) {
        document.getElementById('out').textContent = JSON.stringify({ error: String(err && err.stack || err) });
      }
    </script></body></html>`;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfo-cont-br-'));
    const f = path.join(tmpDir, 't.html');
    try {
      fs.writeFileSync(f, html);
      const outDom = execFileSync(chrome, [
        '--headless=new', '--disable-gpu', '--no-sandbox', `--window-size=${w},${h}`,
        '--dump-dom', 'file:///' + f.replace(/\\/g, '/'),
      ], { encoding: 'utf8', timeout: 20000 });
      const m = /<pre id="out">([\s\S]*?)<\/pre>/.exec(outDom);
      assert.ok(m, 'browser printed measurement output');
      const parsed = JSON.parse(m[1]);
      if (parsed && !Array.isArray(parsed) && parsed.error) assert.fail(parsed.error);
      return parsed;
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  };

  for (const [label, w, h, paired, counts] of [
    ['paired-1366', 1366, 768, true, [25, 65, 200, 5000]],
    ['paired-1920', 1920, 1080, true, [25, 65, 200, 5000]],
    ['solo-1920', 1920, 1080, false, [25, 65, 200]],
    ['mobile-600', 600, 800, false, [25, 65, 200]],
  ]) {
    const rows = harness(w, h, paired, counts);
    for (const r of rows) {
      assert.ok(r.clientH >= 180, `${label} n=${r.n}: clientH collapsed (${r.clientH})`);
      assert.ok(r.visTop > 0 && r.visMid > 0 && r.visEnd > 0, `${label} n=${r.n}: blank rows (${JSON.stringify(r)})`);
      assert.equal(r.range[1], r.n, `${label} n=${r.n}: bottom scroll stopped early at ${JSON.stringify(r.range)}`);
      for (const g of r.gaps) {
        assert.ok(Math.abs(g.rectH - g.inlineH) <= 2, `${label} n=${r.n}: .vrows-gap collapsed inline=${g.inlineH} rect=${g.rectH}`);
      }
    }
  }
});
