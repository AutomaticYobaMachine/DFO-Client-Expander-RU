'use strict';
// Isolated execution of the exact injection helper, not a claim that the published Electron
// bundle or its minified signatures have passed validation. See docs/inventory-window-render-stabilization-plan.md.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { lifecycle } = require('../src/mod/inventory-transform.cjs');

function fixture(count = 45) {
  const src = [
    'let h={children:[],append(s){this.children.push(s)}},cache={key:1,img:1};',
    'let paints=0,depth=0,maxDepth=0,filling=false,repaintDuringFill=false,fail=false,warnings=0;',
    'const console={warn(){warnings++}};',
    'const ready=new Set(),observers=[],arm={subscribe(fn){observers.push(fn)},notify(){for(const fn of observers)fn()}};',
    'const keys='+JSON.stringify(Array.from({ length: count }, (_, i) => i))+';',
    'function item(k){if(ready.has(k))return;ready.add(k);arm.notify()}',
    'function r(){depth++;maxDepth=Math.max(maxDepth,depth);paints++;',
    '  if(filling)repaintDuringFill=true;',
    '  if(fail){depth--;throw new Error("native render failure")}',
    '  h.children.length=0;const shell={stamp:paints};',
    '  for(const k of keys)item(k);h.append(shell);depth--;',
    '}',
    'function mount(){arm.subscribe(()=>{cache={key:null,img:null};if(h)r()});r()}',
    'function refill(k){filling=true;item(k);filling=false}',
    'function newHost(){h={children:[],append(s){this.children.push(s)}};r()}',
    'function unmount(){h=null}',
    'function setFail(v){fail=v}',
    'function stale(){cache={key:1,img:1};arm.notify()}',
    'function inspect(){return {paints,depth,maxDepth,shells:h?.children.length??0,cache:cache.key,repaintDuringFill,warnings}}',
  ].join('\n');
  const result = lifecycle(src, 'r');
  const app = new Function(result + '\nreturn {mount,refill,newHost,unmount,setFail,stale,arm,inspect,r}')();
  return { app, result };
}

test('45 cold icon keys cause no recursive render or sibling shells', async () => {
  const { app, result } = fixture();
  app.mount();
  assert.equal(app.inspect().paints, 1);
  assert.equal(app.inspect().shells, 1);
  assert.equal(app.inspect().maxDepth, 1);
  await Promise.resolve();
  assert.equal(app.inspect().paints, 2, 'one coalesced follow-up');
  assert.equal(app.inspect().shells, 1);
  assert.equal(app.inspect().maxDepth, 1);
  assert.match(result, /function __dfoNativeRender\$\(\)/);
  assert.match(result, /__dfoFigureNotice\$\(h\)/);
});

test('storecat-style in-place refill completes before an icon wake can repaint', async () => {
  const { app } = fixture(0);
  app.mount();
  app.refill(102);
  assert.equal(app.inspect().repaintDuringFill, false);
  assert.equal(app.inspect().paints, 1);
  await Promise.resolve();
  assert.equal(app.inspect().paints, 2);
  assert.equal(app.inspect().repaintDuringFill, false);
});

test('cache invalidation is immediate but burst notifications are coalesced', async () => {
  const { app } = fixture(0);
  app.mount();
  for (let i = 0; i < 50; i++) app.stale();
  assert.equal(app.inspect().cache, null, 'native figure cache invalidation remains synchronous');
  assert.equal(app.inspect().paints, 1);
  await Promise.resolve();
  assert.equal(app.inspect().paints, 2, 'one repaint for 50 synchronous notifications');
});

test('old host notification cannot repaint a replacement session', async () => {
  const { app } = fixture(0);
  app.mount();
  app.stale();
  app.newHost();
  assert.equal(app.inspect().paints, 2);
  await Promise.resolve();
  assert.equal(app.inspect().paints, 2, 'stale microtask sees another host');
  app.stale();
  app.unmount();
  await Promise.resolve();
  assert.equal(app.inspect().paints, 2, 'closed host never repaints');
});

test('native exception releases the recursion guard without scheduling retries', () => {
  const { app } = fixture(0);
  app.mount();
  app.setFail(true);
  assert.throws(() => app.r(), /native render failure/);
  app.setFail(false);
  app.r();
  assert.equal(app.inspect().paints, 3, 'one failed call and a later valid repaint');
  assert.equal(app.inspect().depth, 0);
});

test('deferred native error is reported and never becomes an unhandled retry loop', async () => {
  const { app } = fixture(0);
  app.mount();
  app.setFail(true);
  app.stale();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(app.inspect().paints, 2);
  assert.equal(app.inspect().warnings, 1);
  app.setFail(false);
  app.r();
  assert.equal(app.inspect().paints, 3, 'manual repaint still works after a failed notification');
});

test('retry on the same host invalidates pending callbacks from the previous mount', async () => {
  const { app } = fixture(0);
  app.mount();
  app.stale();
  app.mount(); // enhancedChunk can retry with the exact same host element
  assert.equal(app.inspect().paints, 2);
  await Promise.resolve();
  assert.equal(app.inspect().paints, 2, 'the first generation cannot repaint the second');
  app.stale(); // both callbacks are still in this fixture's Set
  await Promise.resolve();
  assert.equal(app.inspect().paints, 3, 'only the latest subscriber schedules a repaint');
});

test('minified short-circuit subscriber syntax is recognized', async () => {
  const src = [
    'let h={},c={key:1,img:1},paints=0;',
    'const arm={subscribe(fn){this.fn=fn},notify(){this.fn()}};',
    'function r(){paints++}',
    'function mount(){arm.subscribe(()=>{c={key:null,img:null},h&&r()});r()}',
  ].join('\n');
  const code = lifecycle(src, 'r');
  const app = new Function(code + '\nreturn {mount,arm,paint:()=>paints}')();
  app.mount();app.arm.notify();app.arm.notify();
  assert.equal(app.paint(), 1);
  await Promise.resolve();
  assert.equal(app.paint(), 2);
});

test('another synchronous render source is also held behind the active native render', async () => {
  const src = [
    'let h={},calls=0,depth=0,maxDepth=0,nested=true,c={key:null,img:null};',
    'const arm={subscribe(fn){this.fn=fn}};',
    'function r(){calls++;depth++;maxDepth=Math.max(maxDepth,depth);if(nested){nested=false;r()}depth--}',
    'function mount(){arm.subscribe(()=>{c={key:null,img:null};if(h)r()});r()}',
  ].join('\n');
  const code = lifecycle(src, 'r');
  const app = new Function(code + '\nreturn {mount,inspect:()=>({calls,maxDepth})}')();
  app.mount();
  assert.equal(app.inspect().calls, 1);
  assert.equal(app.inspect().maxDepth, 1);
  await Promise.resolve();
  assert.equal(app.inspect().calls, 2);
  assert.equal(app.inspect().maxDepth, 1);
});

test('unsupported or duplicated fpArm callback is rejected without a partial patch', () => {
  const src = [
    'let h={};function r(){}',
    'const o={subscribe(fn){return fn}};',
    'o.subscribe(()=>{if(h)r()})',
  ].join('\n');
  assert.throws(() => lifecycle(src, 'r'), /inventory fpArm callback: 0 places/);
  const duplicate = src.replace('if(h)r()', 'c={key:null,img:null};if(h)r()');
  assert.throws(() => lifecycle(duplicate + duplicate, 'r'), /(inventory native render|inventory fpArm callback)/);
});

test('a synchronous A-to-B mount during native paint still paints B after unwinding', async () => {
  const src = [
    'let h=null,d={},c={key:1,img:1},a={shells:0},b={shells:0},swap=true;',
    'const arm={subscribe(fn){this.fn=fn}};',
    'function r(){const active=h;if(active===a&&swap){swap=false;mount(b)}active.shells++}',
    'function mount(next){h=next;d={};arm.subscribe(()=>{c={key:null,img:null};if(h)r()});r()}',
  ].join('\n');
  const app = new Function(lifecycle(src, 'r', 'd') + '\nreturn {mount,a,b}')();
  app.mount(app.a);
  assert.equal(app.b.shells, 0, 'B is not rendered recursively within A');
  await Promise.resolve();
  assert.equal(app.b.shells, 1, 'B receives the suppressed initial repaint');
});

test('a pending notification from A cannot paint B reusing the same host without fpArm', async () => {
  const src = [
    'let h={},d={id:0},c={key:1,img:1},paints=0;',
    'const arm={subscribe(fn){this.fn=fn},notify(){this.fn()}};',
    'function r(){paints++}',
    'function mount(withArm){d={id:d.id+1};if(withArm)arm.subscribe(()=>{c={key:null,img:null};if(h)r()});r()}',
  ].join('\n');
  const app = new Function(lifecycle(src, 'r', 'd') + '\nreturn {mount,arm,paints:()=>paints}')();
  app.mount(true);
  app.arm.notify();
  app.mount(false);
  await Promise.resolve();
  assert.equal(app.paints(), 2);
  app.arm.notify();
  await Promise.resolve();
  assert.equal(app.paints(), 2, 'old subscriber must not repaint B');
});

test('an ordinary render after the figure notification consumes pending repaint', async () => {
  const src = [
    'let h={},d={},c={key:1,img:1},paints=0;',
    'const arm={subscribe(fn){this.fn=fn},notify(){this.fn()}};',
    'function r(){paints++}',
    'function mount(){arm.subscribe(()=>{c={key:null,img:null};if(h)r()});r()}',
  ].join('\n');
  const app = new Function(lifecycle(src, 'r', 'd') + '\nreturn {mount,arm,r,paints:()=>paints}')();
  app.mount();
  app.arm.notify();
  app.r();
  await Promise.resolve();
  assert.equal(app.paints(), 2, 'no redundant third render');
});

test('the optional native remeasure callback has host ownership and invokes private sync', () => {
  const src = [
    'let h={contains(s){return s.good}},d={},c={key:1,img:1},calls=0;',
    'const arm={subscribe(fn){this.fn=fn}},L=[{sync(opts){if(opts.remeasure)calls++}}];',
    'const measure=e=>{for(const v of L)v.sync(e)};',
    'function r(){}',
    'function mount(){arm.subscribe(()=>{c={key:null,img:null};if(h)r()});r()}',
  ].join('\n');
  const app = new Function(lifecycle(src, 'r', 'd') + '\nreturn {mount,calls:()=>calls,remeasure:globalThis.__dfoInventoryRemeasure$}')();
  assert.equal(app.remeasure({isConnected:true,good:true}), true);
  assert.equal(app.remeasure({isConnected:true,good:false}), false);
  assert.equal(app.calls(), 1);
});
