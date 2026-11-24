'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const cp = require('node:child_process');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..');
const { transformUiStyleLock, lockSkin, lockPrefs, lockDress, lockMenu } = require('../src/mod/ui-style-lock-transform.cjs');
const { transformAsset, EXPECTED, expectedHooks } = require('../src/mod/transforms.cjs');
const itemText = require('../src/mod/item-text.cjs');

const BUILD_DIR = process.env.DFO_BUILD_DIR || path.join(os.tmpdir(), 'dfo-test-build-dir', 'dist');
const ASSETS_DIR = path.join(BUILD_DIR, 'assets');
const hasLiveBuild = fs.existsSync(ASSETS_DIR);

function findAsset(prefix) {
  if (!hasLiveBuild) return null;
  const f = fs.readdirSync(ASSETS_DIR).find((x) => x.startsWith(prefix) && x.endsWith('.js'));
  return f ? { rel: `assets/${f}`, text: fs.readFileSync(path.join(ASSETS_DIR, f), 'utf8') } : null;
}

function checkSyntax(code, label) {
  const tmp = path.join(os.tmpdir(), `dfo-syntax-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  fs.writeFileSync(tmp, code, 'utf8');
  try {
    const res = cp.spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
    assert.equal(res.status, 0, `${label} syntax error: ${res.stderr}`);
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

test('uiStyleLock expectedHooks registration and opt-out', () => {
  assert.deepEqual(EXPECTED.uiStyle, ['uiStyle.skin', 'uiStyle.prefs', 'uiStyle.dress', 'uiStyle.menu']);
  const def = expectedHooks({});
  for (const h of EXPECTED.uiStyle) assert.ok(def.includes(h), `expectedHooks({}) missing ${h}`);
  const off = expectedHooks({ uiStyleLock: false });
  for (const h of EXPECTED.uiStyle) assert.equal(off.includes(h), false, `expectedHooks({uiStyleLock:false}) should omit ${h}`);
});

test('lockSkin forces enhanced skin regardless of URL query, saved pref, or setSkin calls', () => {
  const sample = `var r=Object.freeze([\`enhanced\`,\`classic\`]),i=\`enhanced\`,a=Object.freeze({enhanced:\`Enhanced Plus\`,classic:\`Classic\`}),o=e=>r.includes(e)?e:null;function s(t=globalThis.location?.search??\`\`){return o(e(\`skin\`,t))}var c=null,l=null,u,d=i;function f(e){let t=e===void 0?globalThis.location?.search??\`\`:e;if(typeof t!=\`string\`)return s(e)??o(n(\`skin\`))??\`enhanced\`;if(t!==c&&(l=s(t),c=t),l!==null)return l;let r=n(\`skin\`);return r!==u&&(d=o(r)??\`enhanced\`,u=r),d}var p=e=>f(e)===\`enhanced\`;function b(e){return o(e)?t(\`skin\`,e)===!1?null:e:o(n(\`skin\`))??\`enhanced\`}`;
  const out = lockSkin(sample);
  const writes = [];
  const api = vm.runInNewContext(`(() => {
    const e = (k, q) => new URLSearchParams(q).get(k);
    const n = () => 'classic';
    const t = (k, v) => { writes.push(k + '=' + v); return true; };
    ${out}
    return { s, f, p, b };
  })()`, { writes, location: { search: '?skin=classic' }, URLSearchParams });

  assert.equal(api.s('?skin=classic'), null);
  assert.equal(api.f('?skin=classic'), 'enhanced');
  assert.equal(api.f(), 'enhanced');
  assert.equal(api.p('?skin=classic'), true);
  assert.equal(api.b('classic'), 'enhanced');
  assert.deepEqual(writes, ['skin=enhanced']);
});

test('lockPrefs migrates pre-existing classic/grimoire/non-slate localStorage and preserves other preferences', () => {
  const sample = `const U=\`dagger.ui.v1\`,q=Object.freeze({skin:\`enhanced\`,uiPack:\`none\`,plusTheme:\`slate\`,plusDress:\`none\`,hudScale:1,open:{}});let J=null;function X(){J={...q,open:{}};try{let e=Y()?.getItem(U);if(e){let t=JSON.parse(e);if(t&&typeof t==\`object\`){J={...q,...t,open:{...t.open??{}}}}}}catch(e){console.warn(\`[uiPrefs] stored screen preferences unreadable; using defaults\`,e)}return J}function Z(){Y()?.setItem(U,JSON.stringify(J));return!0}function $(e){let n=t(e);return n===void 0?(J===null&&X(),J[e]??q[e]):n}function ee(e,t){return J===null&&X(),J[e]=t,Z()}`;
  const out = lockPrefs(sample);
  const store = new Map([
    ['dagger.ui.v1', JSON.stringify({ skin: 'classic', uiPack: 'grimoire', plusDress: 'grimoire', plusTheme: 'ember', hudScale: 1.25 })],
  ]);
  const api = vm.runInNewContext(`(() => {
    const Y = () => ({ getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) });
    const t = (k) => (k === 'skin' ? 'classic' : k === 'plusDress' ? 'grimoire' : k === 'plusTheme' ? 'stone' : undefined);
    ${out}
    return { X, $, ee };
  })()`, { store, console });

  const loaded = api.X();
  assert.equal(loaded.skin, 'enhanced');
  assert.equal(loaded.uiPack, 'none');
  assert.equal(loaded.plusDress, 'none');
  assert.equal(loaded.plusTheme, 'slate', 'non-slate UI theme must migrate to slate');
  assert.equal(loaded.hudScale, 1.25, 'Other user preferences must be preserved');

  // Even URL override `t(k)` cannot return classic/grimoire/non-slate
  assert.equal(api.$('skin'), 'enhanced');
  assert.equal(api.$('uiPack'), 'none');
  assert.equal(api.$('plusDress'), 'none');
  assert.equal(api.$('plusTheme'), 'slate');
  assert.equal(api.$('hudScale'), 1.25);

  // Writes to skin/uiPack/plusDress/plusTheme coerce cleanly; other prefs persist
  api.ee('skin', 'classic');
  api.ee('uiPack', 'grimoire');
  api.ee('plusDress', 'grimoire');
  api.ee('plusTheme', 'forest');
  api.ee('hudScale', 1.1);
  const persisted = JSON.parse(store.get('dagger.ui.v1'));
  assert.equal(persisted.skin, 'enhanced');
  assert.equal(persisted.uiPack, 'none');
  assert.equal(persisted.plusDress, 'none');
  assert.equal(persisted.plusTheme, 'slate');
  assert.equal(persisted.hudScale, 1.1);
});

test('lockDress blocks classic uiPack, Grimoire plusDress, and non-Slate themes while keeping base Enhanced Plus Slate intact', () => {
  const sample = `var Ve=Object.freeze({slate:{name:\`Slate\`,swatch:\`#171b21\`},stone:{name:\`Stone\`,swatch:\`#6a6a64\`,panel:\`#5a5a54\`,ground:\`#51514c\`},ember:{name:\`Ember\`,swatch:\`#3a1a14\`,panel:\`#301914\`,ground:\`#2a1510\`}}),He=\`slate\`;const Lt={grimoire:{id:\`grimoire\`}},Rt=e=>e===\`none\`||Object.hasOwn(Lt,e)?e:null,Xn=\`grimoire\`;function zt(e=globalThis.location?.search??\`\`){return Rt(t(\`uipack\`,e))}function Bt(e){if(s(e)!==\`classic\`)return null;let t=zt(e)??(a(e)?\`none\`:Rt(i(\`uiPack\`))??\`none\`);return t===\`none\`?null:Lt[t]}function Vt(e){return Rt(e)?r(\`uiPack\`,e):!1}var $n=e=>{let n=t(\`dress\`,e??globalThis.location?.search??\`\`);return(n===\`grimoire\`||n===\`none\`?n:i(\`plusDress\`))===\`grimoire\`?Xn:\`none\`};var eo=()=>Object.hasOwn(Ve,i(\`plusTheme\`))?i(\`plusTheme\`):He;function to(e=globalThis.document){let t=e?.documentElement;t?.dataset&&(qa(e),$n()===\`grimoire\`?(t.dataset.plusTheme=He,ka(e)):t.dataset.plusTheme=eo())}function no(e,t=globalThis.document){return Object.hasOwn(Ve,e)?(r(\`plusTheme\`,e),to(t),!0):!1}`;
  const out = lockDress(sample);
  const counts = { ka: 0, qa: 0 };
  const writes = [];
  const doc = { documentElement: { dataset: { plusDress: 'grimoire', plusTheme: 'ember' } } };
  const uiRu = itemText.uiText('ru');
  const api = vm.runInNewContext(`(() => {
    const s = () => 'classic';
    const a = () => false;
    const i = (k) => (k === 'uiPack' || k === 'plusDress' ? 'grimoire' : 'ember');
    const r = (k, v) => { writes.push(k + '=' + v); return true; };
    const t = (k, q) => new URLSearchParams(q).get(k);
    const qa = () => { counts.qa++; };
    const ka = () => { counts.ka++; };
    ${out}
    return { Ve, Bt, Vt, $n, eo, to, no };
  })()`, { writes, counts, URLSearchParams, location: { search: '?uipack=grimoire&dress=grimoire' }, globalThis: { __dfoUi: uiRu } });

  assert.deepEqual(Object.keys(api.Ve), ['slate'], 'Ve must expose ONLY slate');
  assert.equal(api.Ve.slate.name, uiRu.t('uiStyle.themeSlate'), 'slate name localized cleanly');
  assert.equal(api.Ve.slate.swatch, '#171b21');
  // Downstream consumers (worldTick / deepWaterRuntime) filter Ve entries by .panel
  assert.equal(Object.entries(api.Ve).filter(([, e]) => e.panel).length, 0);

  assert.equal(api.Bt('?uipack=grimoire'), null);
  assert.equal(api.Vt('grimoire'), false);
  assert.equal(api.Vt('none'), true);
  assert.equal(api.$n('?dress=grimoire'), 'none');
  assert.equal(api.eo(), 'slate');
  assert.equal(api.no('ember', doc), false);
  assert.equal(api.no('stone', doc), false);
  assert.equal(api.no('slate', doc), true);
  assert.deepEqual(writes, ['uiPack=none', 'plusTheme=slate']);

  api.to(doc);
  assert.equal(doc.documentElement.dataset.plusDress, undefined, 'stale data-plus-dress must be stripped');
  assert.equal(doc.documentElement.dataset.plusTheme, 'slate', 'data-plus-theme must stay locked to slate');
  assert.ok(counts.qa >= 1, 'font style helper qa() must still run');
  assert.equal(counts.ka, 0, 'Grimoire kit installer must never run');
});

test('live 0.1.14631 bundle: all 4 uiStyle hooks match, pass node --check, are idempotent, and strip Classic/Grimoire from UI Overhaul', { skip: !hasLiveBuild && 'live DFO_BUILD_DIR not present' }, () => {
  const targets = [
    ['uiSkin-', 'uiStyle.skin'],
    ['uiPrefs-', 'uiStyle.prefs'],
    ['enhancedStyle-', 'uiStyle.dress'],
    ['enhancedMenu-', 'uiStyle.menu'],
  ];
  const seen = new Set();

  for (const [prefix, hookId] of targets) {
    // uiPrefs has a tiny re-export chunk (uiPrefs-rLOrbHEM.js) and the real store (uiPrefs-XoEY-xpz.js).
    const matches = fs.readdirSync(ASSETS_DIR)
      .filter((x) => x.startsWith(prefix) && x.endsWith('.js'))
      .map((f) => ({ rel: `assets/${f}`, text: fs.readFileSync(path.join(ASSETS_DIR, f), 'utf8') }));
    assert.ok(matches.length >= 1, `missing ${prefix} asset`);

    let fired = 0;
    for (const { rel, text } of matches) {
      const log1 = [];
      const out1 = transformUiStyleLock(rel, text, log1);
      const errs1 = log1.filter(([id]) => id.includes('!error'));
      assert.deepEqual(errs1, [], `${rel} errors: ${errs1.map((e) => e[0]).join(', ')}`);
      if (log1.some(([id, n]) => id === hookId && n > 0)) {
        fired++;
        seen.add(hookId);
        checkSyntax(out1, rel);

        // Idempotency check
        const log2 = [];
        const out2 = transformUiStyleLock(rel, out1, log2);
        assert.equal(out2, out1, `${rel} must be idempotent`);
        assert.equal(log2.length, 0, `${rel} second pass must not re-fire`);

        if (hookId === 'uiStyle.dress') {
          assert.ok(out1.includes("globalThis.__dfoUi?.t('uiStyle.themeSlate')"), 'Slate theme label wired');
          assert.equal(out1.includes('stone:{name:`Stone`'), false, 'Stone theme removed from PLUS_THEMES');
          assert.equal(out1.includes('ember:{name:`Ember`'), false, 'Ember theme removed from PLUS_THEMES');
          assert.equal(out1.includes('forest:{name:`Forest`'), false, 'Forest theme removed from PLUS_THEMES');
          assert.equal(out1.includes('night:{name:`Night`'), false, 'Night theme removed from PLUS_THEMES');
          assert.equal(out1.includes('iron:{name:`Iron`'), false, 'Iron theme removed from PLUS_THEMES');
        }
        if (hookId === 'uiStyle.menu') {
          // Verify Texture & Sound Overhaul remain intact while UI Overhaul only has enhanced-plus
          assert.ok(out1.includes('id:`texture`,title:`Texture Overhaul`'), 'Texture Overhaul preserved');
          assert.ok(out1.includes('id:`sound`,title:`Sound Overhaul`'), 'Sound Overhaul preserved');
          const uiAt = out1.indexOf('id:`ui`,title:`UI Overhaul`');
          const afterUi = out1.slice(uiAt, out1.indexOf(']);function', uiAt));
          assert.ok(afterUi.includes('`enhanced-plus`'), 'enhanced-plus kept in UI Overhaul');
          assert.ok(afterUi.includes("globalThis.__dfoUi?.t('uiStyle.name')"), 'localized name wired');
          assert.equal(afterUi.includes('`classic`'), false, 'Classic option removed from UI Overhaul');
          assert.equal(afterUi.includes('`dfo-grimoire`'), false, 'DFO Grimoire option removed from UI Overhaul');
          assert.equal(afterUi.includes('rx.id,rx.title'), false, 'Classic GrimoireUI option removed from UI Overhaul');
          // Verify single-option arrow hiding & dot suppression
          assert.ok(out1.includes("style.visibility=`hidden`"), 'single-option arrows hidden cleanly');
          assert.ok(out1.includes("setAttribute(`aria-hidden`,`true`)"), 'single-option arrows marked aria-hidden');
        }
      }
    }
    assert.equal(fired, 1, `expected ${hookId} to fire exactly once across ${prefix}*.js`);
  }
  assert.deepEqual([...seen].sort(), [...EXPECTED.uiStyle].sort());

  // Also confirm transformAsset runs uiStyle hooks by default and skips them when uiStyleLock: false
  const skinAsset = findAsset('uiSkin-');
  const rOn = transformAsset(skinAsset.rel, skinAsset.text, { ru: false, marks: false, fonts: false });
  assert.ok(rOn.log.some(([id, n]) => id === 'uiStyle.skin' && n === 1));
  const rOff = transformAsset(skinAsset.rel, skinAsset.text, { ru: false, marks: false, fonts: false, uiStyleLock: false });
  assert.equal(rOff.log.some(([id]) => id === 'uiStyle.skin'), false);
});

test('uiStyle localization strings exist and format cleanly in EN and RU', () => {
  const en = itemText.uiText('en');
  const ru = itemText.uiText('ru');
  for (const key of ['uiStyle.name', 'uiStyle.by', 'uiStyle.blurb', 'uiStyle.themeSlate']) {
    assert.notEqual(en.t(key), key, `en missing ${key}`);
    assert.notEqual(ru.t(key), key, `ru missing ${key}`);
  }
  assert.match(ru.t('uiStyle.blurb'), /Enhanced Plus/i);
  assert.equal(ru.t('uiStyle.themeSlate'), 'Слейт');
});

test('dfo_container onShellMounted closes store quantity modal when remote container disappears (!lootWin)', () => {
  const makeNode = (tag) => {
    const el = {
      tagName: String(tag || 'DIV').toUpperCase(),
      className: '',
      style: { setProperty() {}, removeProperty() {} },
      dataset: {},
      children: [],
      attributes: {},
      classList: {
        _s: new Set(),
        add(...c) { c.forEach((x) => this._s.add(x)); },
        remove(...c) { c.forEach((x) => this._s.delete(x)); },
        toggle(c, f) { f ? this._s.add(c) : this._s.delete(c); },
        contains(c) { return this._s.has(c); },
      },
      append(...xs) { this.children.push(...xs); },
      setAttribute(k, v) { this.attributes[k] = String(v); },
      addEventListener() {},
      removeEventListener() {},
      remove() { this.removed = true; },
      focus() {},
      select() {},
      querySelector() { return null; },
    };
    return el;
  };
  const body = makeNode('body');
  const head = makeNode('head');
  const mockDoc = {
    body,
    head,
    documentElement: makeNode('html'),
    getElementById: () => null,
    createElement: (tag) => makeNode(tag),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
  };
  const sandbox = {
    document: mockDoc,
    window: null,
    globalThis: null,
    addEventListener() {},
    removeEventListener() {},
    setTimeout,
    clearTimeout,
    console,
    Math,
    Number,
    String,
    Array,
    Object,
    Map,
    Set,
    WeakMap,
    WeakSet,
    RegExp,
    JSON,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src/mod/page/dfo_container.js'), 'utf8'), sandbox);
  const cont = sandbox.__dfoContainer;
  try {
    const modal = cont.showQuantityModal({
      item: { name: 'Health Potion', stackCount: 5 },
      mode: 'store',
      maxAmount: 5,
      ctx: { el: (t) => makeNode(t), stowItem() {} },
    });
    assert.ok(modal, 'store quantity modal opened');
    assert.equal(modal.backdrop.removed, undefined);
    // Container closes (!lootWin): store modal must close cleanly
    cont.onShellMounted(makeNode('div'), null, makeNode('section'), {});
    assert.equal(modal.backdrop.removed, true, 'store quantity modal must close when remote container vanishes');
  } finally {
    cont.onUnmount();
  }
});

test('lockMenu hides arrows, omits dots, ignores arrow keys when UI Overhaul has 1 option, and preserves Enhanced Plus sub-controls', () => {
  const sample = `
var ex=(e=globalThis.location?.search??\`\`)=>{let t=u(\`dress\`,e);return(t===\`grimoire\`||t===\`none\`?t:k(\`plusDress\`))===\`grimoire\`?\`grimoire\`:\`none\`};
var ix=Object.freeze([
  Object.freeze({id:\`sound\`,title:\`Sound Overhaul\`,options:Object.freeze([
    {id:\`classic\`,name:\`Classic\`,by:\`Orig\`,blurb:\`Old\`,isOn:()=>!1,apply:()=>({reload:!1})},
    {id:\`enhanced\`,name:\`Enhanced\`,by:\`DFO\`,blurb:\`New\`,isOn:()=>!0,apply:()=>({reload:!1})}
  ])}),
  Object.freeze({id:\`ui\`,title:\`UI Overhaul\`,effect:\`Switching reloads the game.\`,options:Object.freeze([
    tx(\`classic\`,De.classic,\`classic\`,vi,{by:\`The original game\`,blurb:\`Classic.\`}),
    tx(\`enhanced-plus\`,De.enhanced,\`enhanced\`,vi,{by:\`Daggerfall Online\`,blurb:\`Modern.\`}),
    tx(\`grimoire\`,\`GrimoireUI\`,\`classic\`,\`grimoire\`,{by:\`LS\`,blurb:\`Classic grimoire.\`}),
    tx(\`dfo-grimoire\`,\`Daggerfall Online Grimoire\`,\`enhanced\`,vi,{dress:\`grimoire\`,by:\`DFO\`,blurb:\`Plus grimoire.\`})
  ])})
]);
function tk(e){
  let t=e.options.find(x=>x.isOn())??null,n=e.options.length,r=0,a=e.options[r],o=q(\`section\`,\`look-panel\`);
  let s=t=>{renders++};
  o.onkeydown=e=>{e.key===\`ArrowLeft\`?(e.preventDefault(),s(-1)):e.key===\`ArrowRight\`&&(e.preventDefault(),s(1))};
  let c=q(\`div\`,\`look-nav\`),l=(t,r,i)=>{let a=q(\`button\`,\`look-arrow\`,r);return a.type=\`button\`,a.setAttribute(\`aria-label\`,i(e.title.toLowerCase())),a.disabled=n<2,a.onclick=e=>{e.stopPropagation(),s(t)},a},u=q(\`div\`);
  u.append(q(\`div\`,\`look-name\`,a.name),q(\`div\`,\`look-by\`,a.by));
  let d=q(\`div\`,\`look-dots\`);if(e.options.forEach((e,n)=>d.append(q(\`span\`,\`look-dot\`))),u.append(d),c.append(l(-1,\`‹\`,()=>\`prev\`),u,l(1,\`›\`,()=>\`next\`)),o.append(c,q(\`p\`,\`look-blurb\`,a.blurb)),e.id===\`ui\`&&a.id===\`enhanced-plus\`&&a===t){
    o.append(q(\`div\`,\`look-colours\`,\`UI color\`));
  }
  return o;
}`;
  const out = lockMenu(sample);
  let renders = 0;
  const makeEl = (tag, cls = '', text = '') => {
    const el = {
      tag, className: cls || '', textContent: text ?? '', style: {}, dataset: {}, attrs: {}, children: [],
      setAttribute(k, v) { this.attrs[k] = String(v); },
      append(...xs) { this.children.push(...xs); },
    };
    return el;
  };
  const uiPack = itemText.uiText('ru');
  const res = vm.runInNewContext(`(() => {
    let renders = 0;
    const u = () => 'grimoire';
    const k = () => 'grimoire';
    const De = { enhanced: 'Enhanced Plus', classic: 'Classic' };
    const vi = 'none';
    const tx = (id, name, skin, pack, meta) => Object.freeze({ id, name, skin, pack, ...meta, isOn: () => skin === 'enhanced' });
    const q = makeEl;
    ${out}
    const uiCard = ix.find(x => x.id === 'ui');
    const soundCard = ix.find(x => x.id === 'sound');
    const uiDom = tk(uiCard);
    const soundDom = tk(soundCard);
    uiDom.onkeydown({ key: 'ArrowRight', preventDefault() {} });
    uiDom.onkeydown({ key: 'ArrowLeft', preventDefault() {} });
    const rendersAfterUiArrows = renders;
    soundDom.onkeydown({ key: 'ArrowRight', preventDefault() {} });
    const rendersAfterSoundArrow = renders;
    return { exVal: ex('?dress=grimoire'), uiCard, soundCard, uiDom, soundDom, rendersAfterUiArrows, rendersAfterSoundArrow };
  })()`, { makeEl, globalThis: { __dfoUi: uiPack } });

  assert.equal(res.exVal, 'none');
  assert.equal(res.soundCard.options.length, 2, 'Sound Overhaul options must remain untouched');
  assert.equal(res.uiCard.options.length, 1, 'UI Overhaul must have exactly 1 option');
  assert.equal(res.uiCard.options[0].id, 'enhanced-plus');
  assert.equal(res.uiCard.options[0].name, uiPack.t('uiStyle.name'));
  assert.equal(res.uiCard.options[0].by, uiPack.t('uiStyle.by'));
  assert.equal(res.uiCard.options[0].blurb, uiPack.t('uiStyle.blurb'));

  const uiNav = res.uiDom.children[0];
  const [prevBtn, centerBox, nextBtn] = uiNav.children;
  assert.equal(prevBtn.disabled, true);
  assert.equal(nextBtn.disabled, true);
  assert.equal(prevBtn.style.visibility, 'hidden');
  assert.equal(nextBtn.style.visibility, 'hidden');
  assert.equal(prevBtn.attrs['aria-hidden'], 'true');
  assert.equal(nextBtn.attrs['aria-hidden'], 'true');
  const uiDots = centerBox.children[2];
  assert.equal(uiDots.children.length, 0, 'single-option card omits pagination dots');
  assert.ok(res.uiDom.children.some((c) => c.className === 'look-colours'), 'Enhanced Plus sub-controls stay mounted');
  assert.equal(res.rendersAfterUiArrows, 0, 'ArrowLeft/ArrowRight on 1-option UI card must not re-render');
  assert.equal(res.rendersAfterSoundArrow, 1, 'ArrowRight on 2-option Sound card still cycles normally');

  const soundNav = res.soundDom.children[0];
  assert.equal(soundNav.children[0].disabled, false);
  assert.equal(soundNav.children[0].style.visibility, undefined);
  assert.equal(soundNav.children[1].children[2].children.length, 2, '2-option card keeps pagination dots');
});

test('dfo_item_cards scroll listener skips unrelated list scrolls and repositions on viewport/ancestor scroll', () => {
  const listeners = new Map();
  const makeEl = (tag, cls = '') => {
    const el = {
      tagName: String(tag).toUpperCase(),
      className: cls,
      textContent: '',
      isConnected: true,
      dataset: {},
      style: { cssText: '', visibility: '', zoom: '1', left: '0px', top: '0px', maxHeight: '', setProperty() {}, removeProperty() {} },
      children: [],
      get childNodes() { return this.children; },
      get firstElementChild() { return this.children[0] || null; },
      nextElementSibling: null,
      classList: {
        _s: new Set(cls ? cls.split(/\s+/) : []),
        add(...xs) { xs.forEach((x) => this._s.add(x)); },
        remove(...xs) { xs.forEach((x) => this._s.delete(x)); },
        contains(x) { return this._s.has(x); },
      },
      offsetWidth: 400,
      offsetHeight: 300,
      scrollWidth: 400,
      scrollHeight: 300,
      clientWidth: 400,
      offsetLeft: 20,
      offsetTop: 20,
      parentElement: null,
      getBoundingClientRect() { return { left: 20, top: 20, width: 400, height: 300 }; },
      closest() { return null; },
      contains(node) { return node === this; },
      matches() { return false; },
      append(...xs) { for (const x of xs) { if (x && typeof x === 'object') x.parentElement = this; this.children.push(x); } },
      prepend(...xs) { for (let i = xs.length - 1; i >= 0; i--) { if (xs[i] && typeof xs[i] === 'object') xs[i].parentElement = this; this.children.unshift(xs[i]); } },
      insertBefore(node, ref) { if (node && typeof node === 'object') node.parentElement = this; const idx = this.children.indexOf(ref); if (idx < 0) this.children.push(node); else this.children.splice(idx, 0, node); },
      replaceChildren(...xs) { this.children = []; this.append(...xs); },
      cloneNode() { return makeEl(this.tagName, this.className); },
      setAttribute() {},
      getAttribute() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
    };
    return el;
  };
  const docEl = makeEl('html');
  const body = makeEl('body');
  const head = makeEl('head');
  const host = makeEl('div', 'packdetail');
  const card = makeEl('div', 'card');
  const cardBody = makeEl('div', 'card-body');
  card.children.push(cardBody);
  card.closest = (sel) => (sel.includes('packdetail') ? host : null);
  host.children.push(card);
  host.contains = (node) => node === host || node === card;
  const unrelatedList = makeEl('div', 'packlist');
  unrelatedList.contains = () => false;

  const win = {
    innerWidth: 1920,
    innerHeight: 1080,
    document: {
      documentElement: docEl,
      body,
      head,
      baseURI: 'http://localhost/play/',
      currentScript: { src: 'http://localhost/play/dfo-mod/dfo_item_cards.js' },
      getElementById: () => null,
      createElement: (t) => makeEl(t),
      createElementNS: (_ns, t) => makeEl(t),
      fonts: null,
    },
    location: { href: 'http://localhost/play/' },
    MutationObserver: class { observe() {} disconnect() {} takeRecords() { return []; } },
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (fn) => { fn(); return 1; },
    addEventListener(type, fn) { listeners.set(type, fn); },
  };
  const mod = require('../src/mod/page/dfo_item_cards.js');
  mod.install(win);
  const api = win.__dfoItemCards;
  api.register({
    template: () => ({ name: 'Sword' }),
    value: () => 100,
    variantWord: () => '',
    material: () => 'Steel',
    materialLabel: (m) => m,
    saysMaterial: () => true,
    isAmmo: () => false,
    isHandWraps: () => false,
    sale: () => ({ cost: 200 }),
    isGold: () => false,
  });
  api.dress(card, { item: { group: 'Weapons', templateIndex: 1, material: 1, value: 100, stackCount: 1 }, weight: 2 }, { known: () => true, meta: [], credit: () => null });
  api.fitCard(card);
  const before = api.stats().placements;
  assert.ok(before >= 1, 'initial fitCard must place the card');

  const onScroll = listeners.get('scroll');
  assert.equal(typeof onScroll, 'function');
  // Scrolling an unrelated .packlist must NOT trigger synchronous placement reflows!
  onScroll({ target: unrelatedList });
  assert.equal(api.stats().placements, before, 'unrelated list scroll must not re-place the card');

  // Scrolling the document/viewport MUST still reposition!
  onScroll({ target: win.document });
  assert.equal(api.stats().placements, before + 1, 'viewport scroll must still reposition the card');
});

const CHROME_BIN = (() => {
  if (process.env.CHROMIUM_BIN && fs.existsSync(process.env.CHROMIUM_BIN)) return process.env.CHROMIUM_BIN;
  if (process.platform === 'win32') {
    for (const p of [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ]) if (fs.existsSync(p)) return p;
  }
  return null;
})();

test('real Chromium E2E: live transformed 0.1.14631 uiPrefs + uiSkin + enhancedStyle + enhancedMenu locks to Enhanced Plus (Slate)', {
  skip: (!hasLiveBuild || !CHROME_BIN) && 'live DFO_BUILD_DIR and Chromium required',
}, async () => {
  const fPrefs = fs.readdirSync(ASSETS_DIR).find((f) => f.startsWith('uiPrefs-') && fs.statSync(path.join(ASSETS_DIR, f)).size > 5000);
  const fSkin = fs.readdirSync(ASSETS_DIR).find((f) => f.startsWith('uiSkin-') && f.endsWith('.js'));
  const fStyle = fs.readdirSync(ASSETS_DIR).find((f) => f.startsWith('enhancedStyle-') && f.endsWith('.js'));
  const fMenu = fs.readdirSync(ASSETS_DIR).find((f) => f.startsWith('enhancedMenu-') && f.endsWith('.js'));
  assert.ok(fPrefs && fSkin && fStyle && fMenu, 'required live assets must exist');

  const ctx = { ru: true, marks: true, nearbyLoot: true, dungeons: true, itemCards: true, inventory: true, fonts: true, uiStyleLock: true, quests: {}, ql: null };
  const uiDataScript = itemText.uiBundle('ru');
  const uiRuntimeScript = fs.readFileSync(path.join(ROOT, 'src/mod/page/dfo_ui_text.js'), 'utf8');

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/e2e.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><html><head><meta charset="utf-8">
        <script>
          localStorage.setItem('dagger.ui.v1', JSON.stringify({ skin:'classic', uiPack:'grimoire', plusDress:'grimoire', plusTheme:'ember', textFont:'dyslexic', hudScale:1.25 }));
        </script>
        <script src="/dfo_ui_text_data.js"></script>
        <script src="/dfo_ui_text.js"></script>
      </head><body><div id="mount"></div><pre id="out">PENDING</pre>
        <script type="module">
          const out = document.getElementById('out');
          const errors = [];
          window.addEventListener('error', e => errors.push(String(e.message || e)));
          window.addEventListener('unhandledrejection', e => errors.push(String(e.reason || e)));
          try {
            const prefs = await import('/assets/${fPrefs}');
            const skin = await import('/assets/${fSkin}');
            const style = await import('/assets/${fStyle}');
            const menu = await import('/assets/${fMenu}');
            style.n(document);
            const setClassic = skin.c('classic');
            const setPack = style.Ft('grimoire');
            const setEmber = style.Y('ember', document);
            const setSlate = style.Y('slate', document);
            prefs.c('skin', 'classic');
            prefs.c('uiPack', 'grimoire');
            prefs.c('plusDress', 'grimoire');
            prefs.c('plusTheme', 'night');

            const host = document.getElementById('mount');
            const mountFn = Object.values(menu).find(v => typeof v === 'function' && /enhancedMenu|px-home|look-grid|mount/i.test(String(v)));
            const handle = mountFn(host, { mode: 'pause', onResume() {}, onSave() {}, onLoad() {}, onNewGame() {}, hasSave: () => false, listSaves: () => [], getSettings: () => ({}), setSetting: () => {} });
            const lookBtn = [...host.querySelectorAll('button')].find(b => /Overhaul|Look/i.test(b.textContent || ''));
            lookBtn?.click();
            await new Promise(r => setTimeout(r, 120));

            const uiPanel = host.querySelector('.look-panel[data-panel="ui"]');
            const texPanel = host.querySelector('.look-panel[data-panel="texture"]');
            const sndPanel = host.querySelector('.look-panel[data-panel="sound"]');
            const uiArrows = uiPanel ? [...uiPanel.querySelectorAll('.look-arrow')].map(b => ({ disabled: b.disabled, vis: b.style.visibility, ariaHidden: b.getAttribute('aria-hidden') })) : [];
            const uiGroups = uiPanel ? [...uiPanel.querySelectorAll('.look-colours')].map(g => ({
              label: g.querySelector('.look-colours-label')?.textContent,
              buttons: [...g.querySelectorAll('button.look-colour')].map(b => ({ text: b.textContent, pressed: b.getAttribute('aria-pressed') })),
            })) : [];
            const aboutBtn = [...host.querySelectorAll('button')].find(b => /^About$/i.test((b.textContent || '').trim()));
            aboutBtn?.click();
            await new Promise(r => setTimeout(r, 60));
            const aboutText = host.textContent || '';
            handle?.unmount?.();

            const cssTxt = document.getElementById('enhanced-plus-style')?.textContent || '';
            out.textContent = JSON.stringify({
              ok: true, errors,
              skin: skin.u(), isEnhanced: skin.o(), urlSkin: skin.l('?skin=classic'), setClassic,
              prefSkin: prefs.n('skin'), prefUiPack: prefs.n('uiPack'), prefPlusDress: prefs.n('plusDress'), prefPlusTheme: prefs.n('plusTheme'), prefHudScale: prefs.n('hudScale'),
              activeUiPack: style.Ot('?uipack=grimoire'), setPack, themes: Object.keys(style.Kt), slateName: style.Kt.slate?.name, activeTheme: style.q(), setEmber, setSlate,
              dataPlusTheme: document.documentElement.dataset.plusTheme,
              dataPlusDress: document.documentElement.dataset.plusDress ?? null,
              hasEnhancedPlusStyle: !!document.getElementById('enhanced-plus-style'),
              hasGrimoireKit: !!document.getElementById('daggerfall-online-grimoire-kit'),
              hasGeneratedNonSlateTheme: /PLUS2:\\s*(?:Stone|Iron|Ember|Forest|Night)/.test(cssTxt),
              uiName: uiPanel?.querySelector('.look-name')?.textContent ?? null,
              uiDots: uiPanel ? uiPanel.querySelectorAll('.look-dot').length : -1,
              uiArrows,
              uiUseDisabled: uiPanel?.querySelector('.look-use')?.disabled ?? null,
              uiGroups,
              texDots: texPanel ? texPanel.querySelectorAll('.look-dot').length : -1,
              sndDots: sndPanel ? sndPanel.querySelectorAll('.look-dot').length : -1,
              aboutHasInterfaceName: aboutText.includes('Enhanced Plus (Слейт)'),
            });
          } catch (e) {
            out.textContent = JSON.stringify({ ok: false, errors, error: String(e?.stack || e) });
          }
        </script>
      </body></html>`);
      return;
    }
    if (url.pathname === '/dfo_ui_text_data.js') { res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }); res.end(uiDataScript); return; }
    if (url.pathname === '/dfo_ui_text.js') { res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }); res.end(uiRuntimeScript); return; }
    if (url.pathname.startsWith('/assets/')) {
      const rel = url.pathname.slice(1);
      const full = path.join(BUILD_DIR, rel);
      if (fs.existsSync(full)) {
        const orig = fs.readFileSync(full, 'utf8');
        const tr = transformAsset(rel, orig, ctx);
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        res.end(tr.text);
        return;
      }
    }
    res.writeHead(404); res.end('not found');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfo-uistyle-chrome-'));
  try {
    const stdout = await new Promise((resolve, reject) => {
      cp.execFile(CHROME_BIN, [
        '--headless=new', '--no-sandbox', '--disable-gpu', `--user-data-dir=${userDir}`,
        '--virtual-time-budget=6000', '--dump-dom',
        `http://127.0.0.1:${port}/e2e.html?skin=classic&uipack=grimoire&dress=grimoire`,
      ], { encoding: 'utf8', timeout: 25000, maxBuffer: 10 * 1024 * 1024 }, (err, out, stderr) => {
        if (err && !out) return reject(new Error(`${err.message}: ${stderr}`));
        resolve(out);
      });
    });
    const m = /<pre id="out">([\s\S]*?)<\/pre>/.exec(stdout || '');
    assert.ok(m, 'Chrome E2E did not emit <pre id="out">');
    const data = JSON.parse(m[1]);
    assert.equal(data.ok, true, data.error);
    assert.deepEqual(data.errors, [], 'zero runtime errors expected');
    assert.equal(data.skin, 'enhanced');
    assert.equal(data.isEnhanced, true);
    assert.equal(data.urlSkin, null);
    assert.equal(data.setClassic, 'enhanced');
    assert.equal(data.prefSkin, 'enhanced');
    assert.equal(data.prefUiPack, 'none');
    assert.equal(data.prefPlusDress, 'none');
    assert.equal(data.prefPlusTheme, 'slate');
    assert.equal(data.prefHudScale, 1.25);
    assert.equal(data.activeUiPack, null);
    assert.equal(data.setPack, false);
    assert.deepEqual(data.themes, ['slate']);
    assert.equal(data.slateName, 'Слейт');
    assert.equal(data.activeTheme, 'slate');
    assert.equal(data.setEmber, false);
    assert.equal(data.setSlate, true);
    assert.equal(data.dataPlusTheme, 'slate');
    assert.equal(data.dataPlusDress, null);
    assert.equal(data.hasEnhancedPlusStyle, true);
    assert.equal(data.hasGrimoireKit, false);
    assert.equal(data.hasGeneratedNonSlateTheme, false);
    assert.equal(data.uiName, 'Enhanced Plus (Слейт)');
    assert.equal(data.uiDots, 0);
    assert.equal(data.uiUseDisabled, true);
    assert.deepEqual(data.uiArrows, [
      { disabled: true, vis: 'hidden', ariaHidden: 'true' },
      { disabled: true, vis: 'hidden', ariaHidden: 'true' },
    ]);
    const colorGroup = data.uiGroups.find((g) => g.label === 'UI color');
    assert.deepEqual(colorGroup?.buttons, [{ text: 'Слейт', pressed: 'true' }]);
    const fontGroup = data.uiGroups.find((g) => g.label === 'Text font');
    assert.deepEqual(fontGroup?.buttons, [{ text: 'Шрифты сообщества', pressed: 'true' }]);
    assert.ok(data.uiGroups.some((g) => g.label === 'Cursor' && g.buttons.length === 2), 'Cursor controls preserved');
    assert.ok(data.uiGroups.some((g) => g.label === 'Item info on hover' && g.buttons.length === 2), 'Hover info controls preserved');
    assert.ok(data.texDots >= 2, 'Texture Overhaul untouched');
    assert.ok(data.sndDots >= 2, 'Sound Overhaul untouched');
    assert.equal(data.aboutHasInterfaceName, true, 'About screen shows locked interface name');
  } finally {
    server.close();
    fs.rmSync(userDir, { recursive: true, force: true });
  }
});
