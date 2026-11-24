'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const vm = require('node:vm');

const R = require('../src/mod/page/dfo_spellbook_rules.js');
const { transformSpellbook } = require('../src/mod/spellbook-transform.cjs');
const { createLootStore } = require('../src/mod/loot-store.cjs');
const { wrap } = require('../src/mod/hook.cjs');
const { injectPage, expectedHooks } = require('../src/mod/transforms.cjs');
const { uiBundle } = require('../src/mod/item-text.cjs');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_ASAR = 'C:/Games/DaggerfallGameFiles/DFO/DFO Online/resources/app.asar.dfo-mod-original.bak';

function makeSpell(index, name, {
  cost = 12,
  target = 2,
  element = 0,
  effect = { type: 4, subType: 0, baseMagnitude: 8, plusMagnitude: 2, magnitudePerLevel: 1, baseDuration: 0, plusDuration: 0, durationPerLevel: 0, baseChance: 0, plusChance: 0, chancePerLevel: 0 },
  effects = null,
  custom = true,
  tag = null,
  icon = 0,
  noIcon = false,
} = {}) {
  return {
    index,
    id: `sp_${index}`,
    name,
    cost,
    target,
    element,
    custom,
    tag,
    icon,
    noIcon,
    effects: effects || [effect, null, null],
  };
}

function createRichFakeDom() {
  let doc = null;
  const splitSelectorParts = (sel) => String(sel || '').trim().split(/\s+/).pop();

  const matchesSimple = (node, simple) => {
    if (!simple || !node || node.tagName === '#TEXT') return false;
    let s = simple;
    const attrMatches = [...s.matchAll(/\[([a-zA-Z0-9_-]+)(?:=["']?([^"'\]]*)["']?)?\]/g)];
    s = s.replace(/\[[^\]]+\]/g, '');
    const classes = [...s.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((m) => m[1]);
    s = s.replace(/\.[a-zA-Z0-9_-]+/g, '');
    const idMatch = s.match(/#([a-zA-Z0-9_-]+)/);
    s = s.replace(/#[a-zA-Z0-9_-]+/g, '');
    const tag = s.trim().toLowerCase();

    if (tag && tag !== '*' && node.tagName.toLowerCase() !== tag) return false;
    if (idMatch && node.id !== idMatch[1]) return false;
    for (const c of classes) {
      if (!node.classList.contains(c)) return false;
    }
    for (const m of attrMatches) {
      const k = m[1];
      const expected = m[2];
      const actual = k.startsWith('data-')
        ? node.dataset[k.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())]
        : node.getAttribute(k);
      if (actual === null || actual === undefined) return false;
      if (expected !== undefined && String(actual) !== expected) return false;
    }
    return true;
  };

  const makeNode = (tag, ns = '') => {
    const classes = new Set();
    const attrs = new Map();
    const listeners = new Map();
    const styleProps = new Map();
    const dataset = new Proxy({}, {
      set(target, prop, val) {
        target[prop] = String(val);
        attrs.set('data-' + String(prop).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), String(val));
        return true;
      },
      deleteProperty(target, prop) {
        delete target[prop];
        attrs.delete('data-' + String(prop).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()));
        return true;
      },
    });

    const node = {
      tagName: String(tag).toUpperCase(),
      namespaceURI: ns,
      ownerDocument: doc,
      id: '',
      get className() { return [...classes].join(' '); },
      set className(v) {
        classes.clear();
        for (const c of String(v || '').split(/\s+/).filter(Boolean)) classes.add(c);
        attrs.set('class', [...classes].join(' '));
      },
      children: [],
      parentNode: null,
      get isConnected() {
        let cur = node;
        while (cur.parentNode) cur = cur.parentNode;
        return cur === doc?.documentElement;
      },
      textContent: '',
      innerHTML: '',
      value: '',
      type: '',
      placeholder: '',
      disabled: false,
      hidden: false,
      tabIndex: -1,
      scrollTop: 0,
      scrollLeft: 0,
      clientHeight: 620,
      clientWidth: 1400,
      offsetHeight: 58,
      width: 350,
      height: 281,
      dataset,
      style: {
        setProperty(k, v) { styleProps.set(k, String(v)); node.style[k] = String(v); },
        removeProperty(k) { styleProps.delete(k); delete node.style[k]; },
        getPropertyValue(k) { return styleProps.get(k) || ''; },
      },
      classList: {
        add: (...xs) => xs.filter(Boolean).forEach((c) => classes.add(c)),
        remove: (...xs) => xs.forEach((c) => classes.delete(c)),
        toggle: (c, f) => {
          const on = f === undefined ? !classes.has(c) : !!f;
          if (on) classes.add(c);
          else classes.delete(c);
          return on;
        },
        contains: (c) => classes.has(c),
      },
      setAttribute(k, v) {
        const s = String(v);
        attrs.set(k, s);
        if (k === 'id') node.id = s;
        else if (k === 'class') node.className = s;
        else if (k.startsWith('data-')) {
          const prop = k.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
          dataset[prop] = s;
        }
      },
      getAttribute: (k) => (k === 'id' && node.id ? node.id : (attrs.get(k) ?? null)),
      removeAttribute: (k) => {
        attrs.delete(k);
        if (k === 'id') node.id = '';
      },
      append(...xs) {
        for (const x of xs) {
          if (x == null) continue;
          if (x.tagName === '#FRAG') {
            node.append(...x.children);
            continue;
          }
          const child = typeof x === 'string' || typeof x === 'number' ? makeText(String(x)) : x;
          if (child.parentNode && child.parentNode !== node) child.remove();
          child.parentNode = node;
          node.children.push(child);
        }
      },
      prepend(...xs) {
        for (let i = xs.length - 1; i >= 0; i--) {
          const x = xs[i];
          if (x == null) continue;
          if (x.tagName === '#FRAG') {
            node.prepend(...x.children);
            continue;
          }
          const child = typeof x === 'string' || typeof x === 'number' ? makeText(String(x)) : x;
          if (child.parentNode && child.parentNode !== node) child.remove();
          child.parentNode = node;
          node.children.unshift(child);
        }
      },
      before(x) {
        if (!node.parentNode || !x) return;
        const p = node.parentNode;
        if (x.parentNode) x.remove();
        x.parentNode = p;
        const idx = p.children.indexOf(node);
        p.children.splice(idx >= 0 ? idx : p.children.length, 0, x);
      },
      replaceWith(x) {
        if (!node.parentNode || !x) return;
        const p = node.parentNode;
        const idx = p.children.indexOf(node);
        if (x.parentNode) x.remove();
        x.parentNode = p;
        if (idx >= 0) p.children.splice(idx, 1, x);
        else p.children.push(x);
        node.parentNode = null;
      },
      replaceChildren(...xs) {
        for (const c of [...node.children]) c.parentNode = null;
        node.children.length = 0;
        node.append(...xs);
      },
      remove() {
        if (!node.parentNode) return;
        const arr = node.parentNode.children;
        const i = arr.indexOf(node);
        if (i >= 0) arr.splice(i, 1);
        node.parentNode = null;
      },
      contains(target) {
        let cur = target;
        while (cur) {
          if (cur === node) return true;
          cur = cur.parentNode;
        }
        return false;
      },
      closest(sel) {
        const parts = sel.split(',').map((s) => splitSelectorParts(s));
        let cur = node;
        while (cur) {
          if (parts.some((p) => matchesSimple(cur, p))) return cur;
          cur = cur.parentNode;
        }
        return null;
      },
      matches(sel) {
        return sel.split(',').some((s) => matchesSimple(node, splitSelectorParts(s)));
      },
      querySelector(sel) {
        const parts = sel.split(',').map((s) => splitSelectorParts(s));
        const walk = (list) => {
          for (const c of list) {
            if (parts.some((p) => matchesSimple(c, p))) return c;
            if (c.children?.length) {
              const hit = walk(c.children);
              if (hit) return hit;
            }
          }
          return null;
        };
        return walk(node.children);
      },
      querySelectorAll(sel) {
        const parts = sel.split(',').map((s) => splitSelectorParts(s));
        const out = [];
        const walk = (list) => {
          for (const c of list) {
            if (parts.some((p) => matchesSimple(c, p))) out.push(c);
            if (c.children?.length) walk(c.children);
          }
        };
        walk(node.children);
        return out;
      },
      addEventListener(type, fn) {
        const arr = listeners.get(type) ?? [];
        arr.push(fn);
        listeners.set(type, arr);
      },
      removeEventListener(type, fn) {
        const arr = listeners.get(type);
        if (!arr) return;
        const idx = arr.indexOf(fn);
        if (idx >= 0) arr.splice(idx, 1);
      },
      dispatchEvent(ev = {}) {
        const event = {
          type: ev.type || '',
          target: ev.target || node,
          currentTarget: node,
          defaultPrevented: false,
          preventDefault() { event.defaultPrevented = true; },
          stopPropagation() {},
          ...ev,
        };
        if (event.type === 'click' && typeof node.onclick === 'function') node.onclick(event);
        if (event.type === 'submit' && typeof node.onsubmit === 'function') node.onsubmit(event);
        if (event.type === 'input' && typeof node.oninput === 'function') node.oninput(event);
        for (const fn of [...(listeners.get(event.type) ?? [])]) fn(event);
        return !event.defaultPrevented;
      },
      click() {
        if (node.disabled) return;
        node.dispatchEvent({ type: 'click', target: node });
      },
      focus() {},
      select() {},
      getBoundingClientRect() {
        const h = node.classList.contains('is-open') ? 398 : (node.classList.contains('dfo-sb-card') ? 58 : 620);
        return { top: 100, left: 150, width: 1400, height: h, right: 1550, bottom: 100 + h };
      },
      getContext() {
        return {
          clearRect() {}, save() {}, restore() {}, translate() {}, scale() {}, rotate() {},
          beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, fill() {}, stroke() {},
          fillRect() {}, strokeRect() {}, createRadialGradient: () => ({ addColorStop() {} }),
          createLinearGradient: () => ({ addColorStop() {} }),
        };
      },
      cloneNode(deep) {
        const copy = makeNode(tag, ns);
        copy.className = node.className;
        if (deep) {
          for (const c of node.children) copy.append(c.cloneNode(true));
        }
        return copy;
      },
    };
    return node;
  };

  const makeText = (txt) => ({
    tagName: '#TEXT',
    ownerDocument: doc,
    textContent: String(txt),
    parentNode: null,
    children: [],
    remove() {
      if (!this.parentNode) return;
      const i = this.parentNode.children.indexOf(this);
      if (i >= 0) this.parentNode.children.splice(i, 1);
      this.parentNode = null;
    },
    cloneNode() { return makeText(this.textContent); },
  });

  doc = {
    documentElement: null,
    head: null,
    body: null,
    hidden: false,
    _listeners: new Map(),
    createElement: (tag) => makeNode(tag, ''),
    createElementNS: (ns, tag) => makeNode(tag, ns),
    createDocumentFragment: () => makeNode('#FRAG', ''),
    createTextNode: (txt) => makeText(txt),
    getElementById(id) { return this.documentElement.querySelector(`#${id}`); },
    addEventListener(type, fn) {
      const arr = this._listeners.get(type) ?? [];
      arr.push(fn);
      this._listeners.set(type, arr);
    },
    removeEventListener(type, fn) {
      const arr = this._listeners.get(type);
      if (!arr) return;
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },
  };
  doc.documentElement = makeNode('html');
  doc.head = makeNode('head');
  doc.body = makeNode('body');
  doc.documentElement.append(doc.head, doc.body);
  return doc;
}

test('dfo_spellbook_rules validates sort modes, deduplicates keys, reconciles custom order, and evicts default-matching profiles', () => {
  assert.deepEqual(R.SORT_MODES, ['custom', 'default', 'name', 'costAsc', 'costDesc', 'school']);
  assert.equal(R.SORT_MODES[0], 'custom');

  assert.equal(R.profileKeyOf({ id: 'hero-1', name: 'Aelric' }), 'aelric');
  assert.equal(R.profileKeyOf({ name: 'Jagar' }), 'jagar');
  assert.equal(R.profileKeyOf(null), 'default');

  const spA = makeSpell(0, 'Fireball');
  const spB = makeSpell(1, 'Heal');
  const spDup1 = makeSpell(2, 'Custom Bolt');
  const spDup2 = makeSpell(3, 'Custom Bolt');
  const keys = R.spellOrderKeys([spA, spB, spDup1, spDup2]);
  assert.equal(new Set(keys).size, 4, 'duplicate spells get distinct deterministic keys');

  // Survives deleted spell removal (GC) and appends newly learned spells at tail
  const spNew = makeSpell(4, 'Levitate');
  const nextKeys = R.spellOrderKeys([spA, spB, spNew]);
  const rec = R.reconcileOrder([keys[1], 'n:deleted|', keys[0]], nextKeys);
  assert.deepEqual(rec, [keys[1], keys[0], nextKeys[2]]);

  // cleanSettings normalizes garbage inputs and removes empty/invalid entries
  const cleaned = R.cleanSettings({
    sortMode: 'bogus',
    orders: {
      aelric: ['a', 'a', '', 123, 'b'],
      '': ['x'],
    },
  });
  assert.equal(cleaned.sortMode, 'custom');
  assert.deepEqual(cleaned.orders.aelric, ['a', 'b']);
  assert.equal(cleaned.orders[''], undefined);

  // If custom order equals native spell order, withProfileOrder drops the profile entry
  const nativeOrder = [keys[0], keys[1]];
  const withCustom = R.withProfileOrder(
    { v: 1, sortMode: 'custom', orders: {} },
    'aelric',
    [keys[1], keys[0]],
    [spA, spB],
  );
  assert.deepEqual(withCustom.orders.aelric, [keys[1], keys[0]]);

  const trimmed = R.withProfileOrder(
    withCustom,
    'aelric',
    nativeOrder,
    nativeOrder,
  );
  assert.equal(trimmed.orders.aelric, undefined, 'reverting to native order prunes cache entry');
});

test('loot-store, hook and transforms persist spellbook cache cleanly alongside other namespaces and order scripts before game modules', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfo-spellbook-store-'));
  try {
    const store = createLootStore(dir);
    assert.equal(store.spellbookState().revision, 0);
    assert.equal(store.spellbookState().sortMode, 'custom');

    const saved = store.saveSpellbook({
      revision: 0,
      sortMode: 'costDesc',
      orders: { aelric: ['n:a|', 'n:b|'] },
    });
    assert.equal(saved.revision, 1);
    assert.equal(saved.sortMode, 'costDesc');
    assert.throws(() => store.saveSpellbook({ revision: 0, sortMode: 'name' }), (e) => e.status === 409);

    // replaceCityCache must keep pack and spellbook intact
    store.savePack({ ...store.packState(), view: 'grid' });
    store.replaceCityCache({ towns: { Daggerfall: { visited: true } } });
    assert.equal(store.spellbookState().sortMode, 'costDesc');
    assert.deepEqual(store.spellbookState().orders.aelric, ['n:a|', 'n:b|']);
    assert.equal(store.packState().view, 'grid');
    assert.equal(store.read().towns.Daggerfall.visited, true);

    // hook.cjs HTTP endpoints and OWN static scripts
    const handler = wrap(async () => new Response('not found', { status: 404 }), { app: { getPath: () => dir } });
    const rulesRes = await handler(new Request('dagger://game/dfo-mod/dfo_spellbook_rules.js'));
    assert.equal(rulesRes.status, 200);
    const uiRes = await handler(new Request('dagger://game/dfo-mod/dfo_spellbook.js'));
    assert.equal(uiRes.status, 200);

    const getRes = await handler(new Request('dagger://game/dfo-mod/spellbook-settings'));
    assert.equal(getRes.status, 200);
    const getBody = await getRes.json();
    assert.equal(getBody.revision, 1);
    assert.equal(getBody.sortMode, 'costDesc');

    const conflictRes = await handler(new Request('dagger://game/dfo-mod/spellbook-settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ revision: 0, sortMode: 'school' }),
    }));
    assert.equal(conflictRes.status, 409);

    const okPost = await handler(new Request('dagger://game/dfo-mod/spellbook-settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ revision: 1, sortMode: 'custom', orders: { aelric: ['n:b|', 'n:a|'] } }),
    }));
    assert.equal(okPost.status, 200);
    const okBody = await okPost.json();
    assert.equal(okBody.revision, 2);

    const tooBig = await handler(new Request('dagger://game/dfo-mod/spellbook-settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(2 * 1024 * 1024 + 64),
    }));
    assert.equal(tooBig.status, 413);

    // transforms.cjs script injection & expectedHooks
    const html = '<html><head></head><body><script type="module" src="./assets/index.js"></script></body></html>';
    const injected = injectPage(html, './', { ru: true, fonts: true });
    const iRules = injected.indexOf('dfo-mod/dfo_spellbook_rules.js');
    const iSb = injected.indexOf('dfo-mod/dfo_spellbook.js');
    const iSvc = injected.indexOf('dfo-mod/dfo_services.js');
    const iMod = injected.indexOf('type="module"');
    assert.ok(iRules > 0 && iSb > iRules && iSvc > iSb && iMod > iSvc, 'spellbook scripts load before dfo_services.js and module entry');
    const hooks = expectedHooks({ ru: true, fonts: true });
    for (const h of ['spellbook.opener', 'spellbook.firmament', 'spellbook.mount', 'spellbook.regen', 'spellbook.folds', 'spellbook.skills']) {
      assert.ok(hooks.includes(h), `expectedHooks includes ${h}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('spellbook-transform skips Worker chunks and leaves unmatched chunks byte-identical', () => {
  const dummyMount = 'function mountEnhancedSpellbook(e,t={}){if(!e)return{render(){},destroy(){}};let n=0;return{render(){},destroy(){}}}';
  for (const workerRel of ['assets/Worker-deadbeef.js', 'assets/imperialPrebuildWorker-BzJRkYSO.js', 'assets/tamrielRoadsWorker-vkrS9uO-.js']) {
    const workerLog = [];
    assert.equal(transformSpellbook(workerRel, dummyMount, workerLog), dummyMount, `${workerRel} must stay untouched`);
    assert.equal(workerLog.length, 0);
  }

  const unrelated = 'export function helloWorld(){return 42;}';
  const otherLog = [];
  assert.equal(transformSpellbook('assets/other-1234.js', unrelated, otherLog), unrelated);
  assert.equal(otherLog.length, 0);
});

test('spellbook-transform hooks all 6 live ASAR targets cleanly with ES module syntax, idempotence, and fail-closed fallback', {
  skip: !fs.existsSync(DEFAULT_ASAR) && !process.env.DFO_BUILD_DIR,
}, () => {
  const { openAsar, listFiles, readFile } = require('../src/asar.cjs');
  const totals = new Map();
  let mountChunk = null;
  let workerUntouched = true;

  const inspectFile = (rel, text) => {
    const log = [];
    const out = transformSpellbook(rel, text, log);
    if (/[Ww]orker-/.test(rel) && out !== text) workerUntouched = false;
    for (const [id, n] of log) {
      assert.ok(!id.includes('!error'), `${rel}: ${id}`);
      totals.set(id, (totals.get(id) ?? 0) + n);
    }
    if (out !== text) {
      const chk = cp.spawnSync(process.execPath, ['--input-type=module', '--check'], { input: out, encoding: 'utf8' });
      assert.equal(chk.status, 0, `${rel} syntax error: ${chk.stderr}`);
      assert.equal(transformSpellbook(rel, out, []), out, `${rel}: second pass must be idempotent`);
      if (log.some(([id]) => id === 'spellbook.mount')) mountChunk = out;
    }
  };

  if (process.env.DFO_BUILD_DIR) {
    const assetsDir = path.join(process.env.DFO_BUILD_DIR, 'assets');
    for (const f of fs.readdirSync(assetsDir).filter((x) => x.endsWith('.js'))) {
      inspectFile('assets/' + f, fs.readFileSync(path.join(assetsDir, f), 'utf8'));
    }
  } else {
    const a = openAsar(DEFAULT_ASAR);
    try {
      for (const [rel, e] of listFiles(a.header)) {
        if (!rel.endsWith('.js') || !e || e.unpacked || e.link || e.offset == null) continue;
        inspectFile(rel, readFile(a, rel).toString('utf8'));
      }
    } finally {
      a.close();
    }
  }

  assert.equal(workerUntouched, true);
  assert.deepEqual([...totals.entries()].sort(), [
    ['spellbook.audio', 1],
    ['spellbook.firmament', 1],
    ['spellbook.folds', 1],
    ['spellbook.mount', 1],
    ['spellbook.opener', 1],
    ['spellbook.regen', 1],
    ['spellbook.skills', 1],
  ]);

  // Verify hoisted __dfoSbBridge right before the minified mount fn (so params e,t cannot shadow)
  assert.ok(mountChunk, 'mountChunk must be found');
  assert.match(mountChunk, /const __dfoSbBridge=\(\)=>\(\{[\s\S]*?\}\);function [\w$]+\(e,t=\{\}\)\{try\{if\(globalThis\.__dfoSpellbook&&typeof globalThis\.__dfoSpellbook\.mount==="function"\)/);
  assert.ok(
    mountChunk.includes('const __dfoSbH=globalThis.__dfoSpellbook.mount(e,t,__dfoSbBridge());if(__dfoSbH)return __dfoSbH;}}catch'),
    'transformed mount calls __dfoSpellbook.mount(e, t, __dfoSbBridge()) with try/catch fallback',
  );
});

test('dfo_spellbook full production wiring: 4-color skills, regen, hotbar pinning, actions, search/sort, rename/delete, and 500-spell virtualization', () => {
  const doc = createRichFakeDom();
  const globalListeners = new Map();
  let nextTimerId = 1;
  const activeTimers = new Set();

  const ctx = {
    Math, Number, String, Boolean, Array, Object, Map, Set, Date, Promise, JSON, Intl, WeakMap, RegExp, Error, console,
    AbortController: undefined,
    document: doc,
    devicePixelRatio: 1,
    __dfoUiPack: vm.runInNewContext(`${uiBundle('ru')};__dfoUiPack`, {}),
    __dfoSpellbookRules: R,
    __dfoSpellbookEnv: {
      enhancesSkillType: 18,
      skillRaw: (ent, sid) => ent.skills[sid] ?? 0,
      skillCappedBase: (ent, sid) => ent.skills[sid] ?? 0,
      skillEffective: (ent, sid) => {
        if (sid === 22) return 65; // base
        if (sid === 23) return 65; // +15 enchant -> buff
        if (sid === 24) return 50; // -20 revenant -> debuff
        if (sid === 25) return 65; // +15 enchant AND -10 revenant -> mixed
        return ent.skills[sid] ?? 0;
      },
      firmamentStats: () => ({ mpRegen: 8 }), // 0.8%
      inspectAttune: (ent) => ({
        blocked: Boolean(ent._noRegenCareer),
        power: { pct: 0.5, low: 1.0, name: 'Ring of Artaeum' },
      }),
      inspectModFolds: () => [
        { id: 'revenant', skills: { 24: -20, 25: -10 } },
      ],
      audio: { play: () => {} },
      clips: {
        skillUp: 'clip_up',
        spellCast: 'clip_cast',
        uiClick: 'clip_click',
        bookPage: 'clip_page',
      },
    },
    Audio: class { play() { return Promise.resolve(); } },
    addEventListener(type, fn) {
      const arr = globalListeners.get(type) ?? [];
      arr.push(fn);
      globalListeners.set(type, arr);
    },
    removeEventListener(type, fn) {
      const arr = globalListeners.get(type);
      if (!arr) return;
      const idx = arr.indexOf(fn);
      if (idx >= 0) arr.splice(idx, 1);
    },
    setTimeout(fn) { const id = nextTimerId++; activeTimers.add(id); return id; },
    clearTimeout(id) { activeTimers.delete(id); },
    requestAnimationFrame() { return nextTimerId++; },
    cancelAnimationFrame() {},
    getComputedStyle() { return { paddingTop: '7px' }; },
  };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.self = ctx;

  for (const rel of ['dfo_ui_text.js', 'dfo_spellmaker_icons.js', 'dfo_spellmaker_catalog.js', 'dfo_spellbook.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src/mod/page', rel), 'utf8'), ctx);
  }

  const sp1 = makeSpell(0, 'Огненный удар', { cost: 22, element: 0 });
  const sp2 = makeSpell(1, 'Малое исцеление', { cost: 14, element: 4, effect: { type: 10, subType: 0, baseMagnitude: 12, plusMagnitude: 4, magnitudePerLevel: 2, baseDuration: 0, plusDuration: 0, durationPerLevel: 0, baseChance: 0, plusChance: 0, chancePerLevel: 0 } });
  const sp3 = makeSpell(2, 'Проклятие ночи', { cost: 10, tag: 'vampire', element: 3, effect: { type: 20, subType: 0, baseMagnitude: 5, plusMagnitude: 0, magnitudePerLevel: 1, baseDuration: 3, plusDuration: 1, durationPerLevel: 1, baseChance: 0, plusChance: 0, chancePerLevel: 0 } });
  const sp4 = makeSpell(3, 'Звериный вой', { cost: 0, tag: 'lycanthrope', element: 4, custom: false, effect: { type: 16, subType: 0, baseMagnitude: 0, plusMagnitude: 0, magnitudePerLevel: 0, baseDuration: 2, plusDuration: 1, durationPerLevel: 1, baseChance: 100, plusChance: 0, chancePerLevel: 0 } });

  const twoHandSword = { id: '2h', name: 'Гребешок 2H', currentCondition: 10, enchantments: [] };
  const brokenRing = { id: 'brk', name: 'Сломанное кольцо', currentCondition: 0, enchantments: [{ type: 18, param: 22 }] };
  const enchAmulet = { id: 'amu', name: 'Амулет школы', currentCondition: 50, enchantments: [{ type: 18, param: 23 }, { type: 18, param: 25 }] };
  const attuneRing = { id: 'att', name: 'Ring of Artaeum', currentCondition: 50, power: { kind: 'attune' } };
  const entity = {
    id: 'hero-42',
    name: 'Драконид',
    level: 12,
    magicka: 231,
    maxMagicka: 452,
    _noRegenCareer: false,
    skills: { 22: 65, 23: 50, 24: 70, 25: 60, 26: 40, 27: 35 },
    equip: { slots: [twoHandSword, twoHandSword, brokenRing, enchAmulet, attuneRing] },
    _enchantMods: { skillMods: { 23: 15, 25: 15 } },
    spells: [sp1, sp2, sp3, sp4],
  };

  let readiedSpell = null;
  let readiedIdx = -1;
  const hotbar = [sp4, null, sp1, sp3];
  const events = { ready: [], abort: 0, toggleHb: [], quickSet: [], quickClear: 0, renamed: [], exit: 0, hotbarWin: [] };

  const host = doc.createElement('div');
  doc.body.append(host);

  let unregistered = false;
  let overlayDismissCleaned = false;
  let picker = null;

  const inst = ctx.__dfoSpellbook.mount(
    host,
    {
      entity,
      spells: () => entity.spells,
      readied: () => readiedSpell,
      readiedIndex: () => readiedIdx,
      castCost: (sp) => sp.cost,
      onReady: (sp, idx) => { readiedSpell = sp; readiedIdx = idx; events.ready.push(sp.name); },
      abortReady: () => { readiedSpell = null; readiedIdx = -1; events.abort++; },
      onExit: () => { events.exit++; },
      owner: 'book-owner',
    },
    {
      hotbarEnabled: () => true,
      hotbarOpen: () => true,
      hotbarSlot: (sp) => hotbar.indexOf(sp),
      overlayDismiss: () => () => { overlayDismissCleaned = true; },
      toggleHotbar: (sp) => {
        const i = hotbar.indexOf(sp);
        if (i >= 0) hotbar[i] = null;
        events.toggleHb.push(sp.id);
      },
      quickslotGet: () => null,
      quickslotSet: (sp) => { events.quickSet.push(sp.id); },
      quickslotClear: () => { events.quickClear++; },
      effectsOf: (sp) => sp.effects,
      mutateSpell: (arr, idx, patch) => {
        if (patch.name !== undefined) {
          arr[idx].name = patch.name;
          events.renamed.push([arr[idx].id, patch.name]);
        }
        Object.assign(arr[idx], patch);
        return true;
      },
      setHotbarWindow: (k, on) => events.hotbarWin.push([k, on]),
      registerHotbarPicker: (_k, p) => { picker = p; },
      registerKeys: () => () => { unregistered = true; },
      keyAction: (e) => (e.key === 'Escape' ? 'back' : null),
      calcCost: (sp, fn) => fn(sp),
      pvpAvailable: () => true,
      pvpLabel: () => 'PvP дуэль',
      pvpOpen: () => {},
      lycanTag: 'lycanthrope',
      ensureStyles: () => {},
    },
  );

  // 1. 4-color skills (Destruction=base, Restoration=buff, Illusion=debuff, Alteration=mixed)
  const cell22 = host.querySelector('[data-skill-id="22"]');
  const cell23 = host.querySelector('[data-skill-id="23"]');
  const cell24 = host.querySelector('[data-skill-id="24"]');
  const cell25 = host.querySelector('[data-skill-id="25"]');
  assert.ok(cell22.classList.contains('is-tone-base'), 'broken item skipped -> base white');
  assert.ok(cell23.classList.contains('is-tone-buff'), 'enchantment +15 -> green');
  assert.ok(cell24.classList.contains('is-tone-debuff'), 'revenant -20 -> red');
  assert.ok(cell25.classList.contains('is-tone-mixed'), 'enchant +15 and revenant -10 -> mixed yellow');
  assert.equal(cell24.querySelector('.dfo-sb-sk-val').textContent, '50');

  // 2. Magicka & Regen display (0.8% + 0.5% = 1.3%/РНД)
  assert.equal(host.querySelector('.dfo-sb-mana-mp').textContent, '231/452');
  assert.match(host.querySelector('.dfo-sb-mana-regen').textContent, /1\.3%\/РНД/);

  // 3. NoRegenSpellPoints blocks attune items while preserving Firmament regen
  entity._noRegenCareer = true;
  inst.render();
  assert.match(host.querySelector('.dfo-sb-mana-regen').textContent, /0\.8%\/РНД/);
  entity._noRegenCareer = false;
  inst.render();

  // 4. Hotbar-pinned spells sit at top in slot order (hb[0]=sp4, hb[2]=sp1, hb[3]=sp3) separated by divider from sp2
  const cards = host.querySelectorAll('.dfo-sb-card');
  const pinnedCards = cards.filter((c) => c.classList.contains('is-pinned-hotbar'));
  assert.equal(pinnedCards.length, 3);
  assert.equal(pinnedCards.map((c) => c.querySelector('.dfo-sb-spell-name').textContent).join('|'), 'Звериный вой|Огненный удар|Проклятие ночи');
  assert.ok(host.querySelector('.dfo-sb-hotbar-div'), 'canonical divider separates pinned from main');

  // 5. Ready / Unready wiring on main card (sp2)
  const sp2Card = cards.find((c) => !c.classList.contains('is-pinned-hotbar'));
  sp2Card.querySelector('.dfo-sb-head-btn.is-ready-btn').click();
  assert.deepEqual(events.ready, ['Малое исцеление']);
  inst.render();
  host.querySelectorAll('.dfo-sb-card').find((c) => !c.classList.contains('is-pinned-hotbar')).querySelector('.dfo-sb-head-btn.is-ready-btn').click();
  assert.equal(events.abort, 1);

  // 6. Hotbar picker resolves a spell
  assert.ok(picker && picker.selected()?.spell, 'hotbar picker resolves a spell');

  // 7. Inline rename via pencil -> omnibox -> submit
  host.querySelectorAll('.dfo-sb-card').find((c) => !c.classList.contains('is-pinned-hotbar')).querySelector('.dfo-sb-rename-pen').click();
  const renameForm = host.querySelector('.dfo-sb-head-rename-form');
  const renameInput = host.querySelector('.dfo-sb-head-rename-input');
  assert.ok(renameForm && renameInput, 'inline omnibox opens on pencil click');
  renameInput.value = 'Великое исцеление';
  renameForm.dispatchEvent({ type: 'submit' });
  assert.deepEqual(events.renamed, [['sp_1', 'Великое исцеление']]);

  // 8. Vampire / Lycanthrope delete protection
  const vampCard = host.querySelectorAll('.dfo-sb-card').find((c) => c.querySelector('.dfo-sb-spell-name')?.textContent === 'Проклятие ночи');
  vampCard.querySelector('.dfo-sb-head-btn.is-del-btn').click();
  assert.equal(host.querySelectorAll('.dfo-sb-modal-scrim').length, 0, 'protected vampire spell must not open delete confirmation');

  // Normal spell delete while readied aborts readiness cleanly before removing spell
  const normCard = host.querySelectorAll('.dfo-sb-card').find((c) => !c.classList.contains('is-pinned-hotbar'));
  normCard.querySelector('.dfo-sb-head-btn.is-ready-btn').click();
  assert.equal(readiedSpell, sp2, 'sp2 readied before delete');
  inst.render();
  host.querySelectorAll('.dfo-sb-card').find((c) => !c.classList.contains('is-pinned-hotbar')).querySelector('.dfo-sb-head-btn.is-del-btn').click();
  const confirmBtn = host.querySelector('.dfo-sb-modal-scrim .dfo-ornate-btn.danger');
  assert.ok(confirmBtn, 'delete confirmation modal renders danger confirm button');
  confirmBtn.click();
  assert.equal(entity.spells.some((x) => x.id === 'sp_1'), false, 'deleted spell removed from spellbook');
  assert.equal(readiedSpell, null, 'deleting readied spell aborts active readiness');
  assert.equal(events.abort, 2);

  // 9. Virtualization stress test with 500 spells + scroll + mid-drag destroy() leaves zero leaked listeners/timers
  for (let i = 4; i < 501; i++) {
    entity.spells.push(makeSpell(i, `Арканный импульс ${i}`, { cost: (i % 50) + 1 }));
  }
  inst.render();
  const mountedCount = host.querySelectorAll('.dfo-sb-card').length;
  assert.ok(mountedCount > 0 && mountedCount <= 45, `500-spell virtualization must cap mounted cards (got ${mountedCount})`);

  const well = host.querySelector('.dfo-sb-list-well');
  well.scrollTop = 6000;
  well.dispatchEvent({ type: 'scroll' });
  const mountedAfterScroll = host.querySelectorAll('.dfo-sb-card').length;
  assert.ok(mountedAfterScroll > 0 && mountedAfterScroll <= 45);

  // Start row drag on an unpinned card without releasing before destroy()
  const dragHead = host.querySelectorAll('.dfo-sb-card').find((c) => !c.classList.contains('is-pinned-hotbar'))?.querySelector('.dfo-sb-card-head');
  assert.ok(dragHead);
  dragHead.dispatchEvent({ type: 'pointerdown', button: 0, clientX: 200, clientY: 200 });
  for (const fn of [...(globalListeners.get('pointermove') ?? [])]) fn({ clientX: 200, clientY: 230 });

  inst.destroy();
  assert.equal(unregistered, true, 'destroy() unregisters key handler');
  assert.equal(overlayDismissCleaned, true, 'destroy() cleans overlayDismiss handler');
  assert.equal(host.children.length, 0, 'destroy() clears host DOM');
  assert.equal(activeTimers.size, 0, 'destroy() cancels all scheduled timers');
  assert.equal([...globalListeners.values()].reduce((acc, a) => acc + a.length, 0), 0, 'destroy() removes every window listener including active drag');
  assert.equal([...doc._listeners.values()].reduce((acc, a) => acc + a.length, 0), 0, 'destroy() removes every document listener');
  assert.deepEqual(events.hotbarWin, [['book', true], ['book', false]]);
});

test('dfo_spellbook 1500-spell scaling: MAX_ORDER_KEYS=4096 retains full order and search/filter/sort make zero redundant engine calls', () => {
  assert.equal(R.MAX_ORDER_KEYS, 4096);
  const effectTypes = [4, 10, 20, 16];
  const spells1500 = [];
  for (let i = 0; i < 1500; i++) {
    spells1500.push(makeSpell(i, `${i % 5 === 0 ? 'Пламенный вихрь' : 'Арканная искра'} ${i}`, {
      cost: (i % 70) + 2,
      element: i % 5,
      effect: {
        type: effectTypes[i % effectTypes.length],
        subType: 0,
        baseMagnitude: 8,
        plusMagnitude: 2,
        magnitudePerLevel: 1,
        baseDuration: 0,
        plusDuration: 0,
        durationPerLevel: 0,
        baseChance: 0,
        plusChance: 0,
        chancePerLevel: 0,
      },
    }));
  }

  // 1. Custom order supports >1024 spells without truncation
  const keys1500 = R.spellOrderKeys(spells1500);
  assert.equal(keys1500.length, 1500);
  const reversed1500 = [...keys1500].reverse();
  const savedOrder = R.withProfileOrder({ v: 1, sortMode: 'custom', orders: {} }, 'hero_1500', reversed1500, spells1500);
  assert.equal(savedOrder.orders.hero_1500.length, 1500, 'withProfileOrder retains all 1500 custom order keys');
  const reconciled1500 = R.reconcileOrder(savedOrder.orders.hero_1500, keys1500);
  assert.equal(reconciled1500.length, 1500);
  assert.equal(reconciled1500[0], reversed1500[0]);
  assert.equal(reconciled1500[1499], reversed1500[1499]);

  // 2. Call-budget verification across mount, search, dropdown filter, 6-mode sort cycle, and scroll
  const doc = createRichFakeDom();
  const globalListeners = new Map();
  let nextTimerId = 1;
  const activeTimers = new Set();
  const counts = { castCost: 0, hotbarSlot: 0, folds: 0, firmament: 0, attune: 0 };

  const ctx = {
    Math, Number, String, Boolean, Array, Object, Map, Set, Date, Promise, JSON, Intl, WeakMap, RegExp, Error, console,
    AbortController: undefined,
    document: doc,
    devicePixelRatio: 1,
    __dfoUiPack: vm.runInNewContext(`${uiBundle('ru')};__dfoUiPack`, {}),
    __dfoSpellbookRules: R,
    __dfoSpellbookEnv: {
      enhancesSkillType: 18,
      skillRaw: (ent, sid) => ent.skills[sid] ?? 0,
      skillCappedBase: (ent, sid) => ent.skills[sid] ?? 0,
      skillEffective: (ent, sid) => ent.skills[sid] ?? 0,
      firmamentStats: () => { counts.firmament++; return { mpRegen: 8 }; },
      inspectAttune: () => { counts.attune++; return { blocked: false, power: null }; },
      inspectModFolds: () => { counts.folds++; return []; },
      audio: { play: () => {} },
      clips: {},
    },
    Audio: class { play() { return Promise.resolve(); } },
    addEventListener(type, fn) {
      const arr = globalListeners.get(type) ?? [];
      arr.push(fn);
      globalListeners.set(type, arr);
    },
    removeEventListener(type, fn) {
      const arr = globalListeners.get(type);
      if (!arr) return;
      const idx = arr.indexOf(fn);
      if (idx >= 0) arr.splice(idx, 1);
    },
    setTimeout() { const id = nextTimerId++; activeTimers.add(id); return id; },
    clearTimeout(id) { activeTimers.delete(id); },
    requestAnimationFrame() { return nextTimerId++; },
    cancelAnimationFrame() {},
    getComputedStyle() { return { paddingTop: '7px' }; },
  };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.self = ctx;

  for (const rel of ['dfo_ui_text.js', 'dfo_spellmaker_icons.js', 'dfo_spellmaker_catalog.js', 'dfo_spellbook.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src/mod/page', rel), 'utf8'), ctx);
  }

  const entity = {
    id: 'hero-1500',
    name: 'Архимаг',
    level: 25,
    magicka: 400,
    maxMagicka: 800,
    skills: { 22: 80, 23: 75, 24: 70, 25: 65, 26: 60, 27: 55 },
    equip: { slots: [] },
    _enchantMods: { skillMods: {} },
    spells: spells1500,
  };
  const hotbar = [spells1500[10], null, spells1500[25], spells1500[40], null, spells1500[100]];
  const host = doc.createElement('div');
  doc.body.append(host);

  const inst = ctx.__dfoSpellbook.mount(
    host,
    {
      entity,
      spells: () => entity.spells,
      readied: () => null,
      readiedIndex: () => -1,
      castCost: (sp) => { counts.castCost++; return sp.cost; },
      onReady: () => {},
      abortReady: () => {},
      onExit: () => {},
      owner: 'book-1500',
    },
    {
      hotbarEnabled: () => true,
      hotbarOpen: () => true,
      hotbarSlot: (sp) => { counts.hotbarSlot++; return hotbar.indexOf(sp); },
      overlayDismiss: () => () => {},
      toggleHotbar: () => {},
      quickslotGet: () => null,
      quickslotSet: () => {},
      quickslotClear: () => {},
      effectsOf: (sp) => sp.effects,
      mutateSpell: () => true,
      setHotbarWindow: () => {},
      registerHotbarPicker: () => {},
      registerKeys: () => () => {},
      keyAction: () => null,
      calcCost: (sp, fn) => fn(sp),
      pvpAvailable: () => false,
      pvpLabel: () => '',
      pvpOpen: () => {},
      lycanTag: 'lycanthrope',
      ensureStyles: () => {},
    },
  );

  // One folds/firmament/attune read on mount (not 6x across schools) and capped virtualized DOM
  assert.equal(counts.folds, 1, 'collectSkillSnapshot precomputes inspectModFolds once for all 6 schools');
  assert.equal(counts.firmament, 1);
  assert.equal(counts.attune, 1);
  const initialMounted = host.querySelectorAll('.dfo-sb-card').length;
  assert.ok(initialMounted > 0 && initialMounted <= 45, `1500-spell mount must cap DOM cards (got ${initialMounted})`);

  const afterMount = { ...counts };

  // 5 consecutive search keystrokes must trigger ZERO engine calls
  const sInp = host.querySelector('.dfo-sb-search-input');
  for (const q of ['П', 'Пл', 'Пла', 'Плам', '']) {
    sInp.value = q;
    sInp.dispatchEvent({ type: 'input' });
  }
  assert.equal(counts.castCost, afterMount.castCost, 'search input triggers zero redundant castCost calls');
  assert.equal(counts.hotbarSlot, afterMount.hotbarSlot, 'search input triggers zero redundant hotbarSlot calls');
  assert.equal(counts.folds, afterMount.folds, 'search input triggers zero inspectModFolds calls');

  // School filter dropdown reuses option DOM nodes and triggers ZERO engine calls
  const ddBtn = host.querySelector('.dfo-sb-dd-btn');
  const optsBefore = host.querySelectorAll('.dfo-sb-dd-opt');
  const firstOptNode = optsBefore[0];
  ddBtn.click();
  optsBefore[1].click();
  ddBtn.click();
  optsBefore[0].click();
  assert.equal(host.querySelectorAll('.dfo-sb-dd-opt')[0], firstOptNode, 'dropdown option DOM nodes are reused across filter updates');
  assert.equal(counts.castCost, afterMount.castCost, 'school filter triggers zero castCost calls');
  assert.equal(counts.hotbarSlot, afterMount.hotbarSlot, 'school filter triggers zero hotbarSlot calls');
  assert.equal(counts.folds, afterMount.folds, 'school filter triggers zero inspectModFolds calls');

  // Cycling all 6 sort modes (custom -> default -> name -> costAsc -> costDesc -> school -> custom) triggers ZERO engine calls
  const sortBtn = host.querySelector('.dfo-sb-sort-btn');
  const initialSortLabel = sortBtn.querySelector('.dfo-sb-sort-lbl').textContent;
  for (let s = 0; s < 6; s++) sortBtn.click();
  assert.equal(sortBtn.querySelector('.dfo-sb-sort-lbl').textContent, initialSortLabel, '6 clicks cycle all sort modes back to start');
  assert.equal(counts.castCost, afterMount.castCost, 'sort cycling triggers zero castCost calls');
  assert.equal(counts.hotbarSlot, afterMount.hotbarSlot, 'sort cycling triggers zero hotbarSlot calls');
  assert.equal(counts.folds, afterMount.folds, 'sort cycling triggers zero inspectModFolds calls');

  // Scrolling inside 1500-spell virtualizer caps DOM and triggers ZERO engine calls
  const well = host.querySelector('.dfo-sb-list-well');
  for (const pos of [8, 12000, 28000, 0]) {
    well.scrollTop = pos;
    well.dispatchEvent({ type: 'scroll' });
    const c = host.querySelectorAll('.dfo-sb-card').length;
    assert.ok(c > 0 && c <= 45, `1500-spell scroll at ${pos}px must cap DOM cards (got ${c})`);
  }
  assert.equal(counts.castCost, afterMount.castCost, 'scrolling triggers zero castCost calls');
  assert.equal(counts.hotbarSlot, afterMount.hotbarSlot, 'scrolling triggers zero hotbarSlot calls');

  inst.destroy();
  assert.equal(host.children.length, 0);
  assert.equal(activeTimers.size, 0);
  assert.equal([...globalListeners.values()].reduce((acc, a) => acc + a.length, 0), 0);
  assert.equal([...doc._listeners.values()].reduce((acc, a) => acc + a.length, 0), 0);
});
