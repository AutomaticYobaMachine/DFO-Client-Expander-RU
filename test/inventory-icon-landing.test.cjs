'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  inventory,
  lifecycle,
  disableModelIcons,
  worldItemIcons,
} = require('../src/mod/inventory-transform.cjs');

test('Morrowind item icons are disabled in enhancedInventory so tiles and item cards fall back to 2D sprites', () => {
  const src = [
    'let wtCalls = 0, ssCalls = 0;',
    'const wt = () => { wtCalls++; return "data:image/png;base64,MW"; };',
    'const Gr = () => 2;',
    'const A = { fpArm: {} };',
    'var hl=(e,t)=>wt(e,t,A.fpArm);function gl(e,t){let n=hl(e,Math.round(t*Gr()));return n?{src:n,w:t,h:t,smooth:!0}:null}',
    'function ss(line, opts){ ssCalls++; return { src: "classic-2d:" + line.key, w: opts.box, h: opts.box, smooth: false }; }',
    'function renderTile(line, t){ return gl(line.item, t) || ss(line, { box: t }); }',
    'function renderCard(line, size){ return gl(line.item, size) || ss(line, { box: size }); }',
  ].join('\n');

  const out = disableModelIcons(src);
  const app = new Function(out + '\nreturn { hl, gl, renderTile, renderCard, stats: () => ({ wtCalls, ssCalls }) }')();
  assert.equal(app.hl({ templateIndex: 1 }, 48), null);
  assert.equal(app.gl({ templateIndex: 1 }, 32), null);
  const tile = app.renderTile({ key: 'iron_sword', item: { templateIndex: 1 } }, 32);
  const card = app.renderCard({ key: 'iron_sword', item: { templateIndex: 1 } }, 64);
  assert.equal(tile.src, 'classic-2d:iron_sword');
  assert.equal(card.src, 'classic-2d:iron_sword');
  assert.deepEqual(app.stats(), { wtCalls: 0, ssCalls: 2 });
});

test('worldTick NV and fpArm.itemIcon return null, falling back to 2D hotbar/HUD sprites without preloads', () => {
  const src = [
    'let preloadCalls = 0, fallbackCalls = 0, figureCalls = 0;',
    'let n = { ok: true, catalog: { gen: 1, archives: [] } }, e = {};',
    'function Nn(){ preloadCalls++; }',
    'var ZJ = { itemIcon(t,{size:r=96}={}){if(!(n&&n.ok&&n.catalog&&e)||!t)return null;Nn();return { width: 1, data: [] };}, figure(){ figureCalls++; return "fig"; } };',
    'function NV(e,t,n){if(!n||typeof n.itemIcon!=`function`||!e)return null;let r=null;r=n.itemIcon(e,{size:t});return r?"mw-icon":null;}',
    'function _f(line){ fallbackCalls++; return "classic-2d:" + line.id; }',
    'function renderHud(line){ let icon = NV(line.item, 48, ZJ); return icon || _f(line); }',
  ].join('\n');

  const out = worldItemIcons(src);
  const app = new Function(out + '\nreturn { NV, ZJ, renderHud, stats: () => ({ preloadCalls, fallbackCalls, figureCalls }) }')();
  assert.equal(app.ZJ.itemIcon({ templateIndex: 5 }, { size: 48 }), null);
  assert.equal(app.NV({ templateIndex: 5 }, 48, app.ZJ), null);
  assert.equal(app.renderHud({ id: 'longsword', item: { templateIndex: 5 } }), 'classic-2d:longsword');
  assert.equal(app.ZJ.figure(), 'fig', '3D character figure remains intact');
  assert.deepEqual(app.stats(), { preloadCalls: 0, fallbackCalls: 1, figureCalls: 1 });
});

test('obsolete DOM tile interception is absent while landingTiles and native fpArm figure repaints stay clean', async () => {
  const src = [
    'let h = { children: [], contains(){ return true; } }, cache = { key: 1, img: 1 }, d = { entity: {} };',
    'let paints = 0, landed = 0, wait = new Map();',
    'const arm = { subscribe(fn){ this.fn = fn; }, notify(){ this.fn(); } };',
    'function recompose(){ return Promise.resolve(); }',
    'function figure(){Promise.resolve(recompose(d.entity)).then(()=>{h&&r()}).catch(()=>{})}',
    'function tuFactory(make, opts){ return { tile(spec){ let el = make(spec, () => { wait.set(el, spec); landed++; }); return el; }, clear(){ wait.clear(); } }; }',
    'function ru(line, box, onReady, snap){ return { key: line.key, onReady, snap }; }',
    'var tu = tuFactory((e, t) => ru(e.line, e.box, t, e.snap), { alive: () => !!h });',
    'function r(){ paints++; h.children = [tu.tile({ line: { key: "k1" }, box: 32, snap: true })]; }',
    'function mount(){ arm.subscribe(()=>{cache={key:null,img:null};if(h)r()}); r(); }',
  ].join('\n');

  const out = lifecycle(src, 'r', 'd', true);
  assert.doesNotMatch(out, /__dfoVisualNotice\$|__dfoLiveTiles\$|__dfoTrackVisual\$|__dfoReadFigureSignature\$/);
  assert.match(out, /__dfoFigureNotice\$\(h\)/);

  const app = new Function(out + '\nreturn { mount, arm, paints: () => paints, landed: () => landed }')();
  app.mount();
  assert.equal(app.paints(), 1);
  app.arm.notify();
  assert.equal(app.paints(), 1, 'figure notification waits for microtask coalescing');
  await Promise.resolve();
  assert.equal(app.paints(), 2, 'genuine figure update still triggers one repaint');
});

test('icon removal transforms fail closed when native bundle signatures change', () => {
  assert.throws(() => disableModelIcons('function gl(){return null}'), /inventory modelPicture/);
  assert.throws(() => worldItemIcons('function NV(){}'), /worldTick modelItemIconUrl/);
  assert.throws(
    () => worldItemIcons('function NV(e,t,n){if(!n||typeof n.itemIcon!=`function`||!e)return null;}'),
    /worldTick fpArm\.itemIcon/
  );
  assert.throws(() => inventory('const broken=1;'), /pack list/);
});
