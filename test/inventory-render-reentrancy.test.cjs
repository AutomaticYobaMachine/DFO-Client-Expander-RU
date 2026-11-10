'use strict';
// Isolated execution of the exact injection helper, not a claim that the published Electron
// bundle or its minified signatures have passed validation. See docs/inventory-window-render-stabilization-plan.md.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { lifecycle, cleanSameHostRemount, sessionHandle, doorOwnership, transformInventory } = require('../src/mod/inventory-transform.cjs');

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

test('incompatible view fails closed, without partially publishing the inventory transform', () => {
  const log = [];
  const invalid = 'const a=' + String.fromCharCode(96) + 'packPhoneDoll' + String.fromCharCode(96) + ',b=' + String.fromCharCode(96) + 'packempty' + String.fromCharCode(96) + ';';
  assert.throws(() => transformInventory('assets/enhancedInventory-test.js', invalid, log), /inventory lifecycle compatibility failure/);
  assert.ok(log.some(([id]) => id.startsWith('inventory.view!error ')));
});

test('published-style var sync binding with for(let ...) exposes the same remeasure callback', () => {
  const src = [
    'let h={contains(){return true}},d={},c={key:1,img:1},calls=0,zs=[{sync(o){if(o.remeasure)calls++}}];',
    'const arm={subscribe(fn){this.fn=fn}};',
    'var Ws=e=>{for(let t of zs)t.sync(e)};',
    'function r(){}',
    'function mount(){arm.subscribe(()=>{c={key:null,img:null};if(h)r()});r()}',
  ].join('\n');
  const app = new Function(lifecycle(src, 'r', 'd') + '\nreturn {calls:()=>calls,fn:globalThis.__dfoInventoryRemeasure$}')();
  assert.equal(app.fn({isConnected:true}), true);
  assert.equal(app.calls(), 1);
});

test('view handle retains its dropped items and stale unmount is idempotent', () => {
  const raw = [
    'let H=null,dropped=[],closes=0,repaints=0;',
    'function mount(){dropped=[];H={repaint(){repaints++},dropped:()=>dropped,unmount(){closes++;H=null}};return H}',
    'function put(it){dropped.push(it)}',
    'function state(){return {closes,repaints}}',
  ].join('\n');
  const app = new Function(sessionHandle(raw) + '\nreturn {mount,put,state}')();
  const a = app.mount();
  app.put('A');
  const b = app.mount();
  app.put('B');
  assert.deepEqual(a.dropped(), ['A'], 'A must not see B drop pile');
  assert.deepEqual(b.dropped(), ['B']);
  a.repaint();a.unmount();
  assert.equal(app.state().closes, 0, 'A must not unmount B');
  b.repaint();
  assert.equal(app.state().repaints, 1);
  b.unmount();b.unmount();
  assert.equal(app.state().closes, 1, 'unmount is idempotent');
});

test('disposed overlay rejects late A load during pending save even before fired becomes true', () => {
  const raw = [
    'let fired=false,host={isConnected:true},onSavePending=true,live=null;host.id="enhanced-inventory";',
    'function close(){if(onSavePending)return;fired=true}',
    'const overlay={get done(){return fired},input(){},click(){},dispose(){close()}};',
    'function mountEnhancedChunk(o){live=o}',
    'mountEnhancedChunk({alive:()=>!fired,host,onDismiss:()=>{host.remove();fired=true}})',
  ].join('\n');
  const app=new Function(doorOwnership(raw)+'\nreturn {overlay,host,alive:()=>live.alive(),finish:()=>onSavePending=false}')();
  assert.equal(app.alive(),true);
  app.overlay.dispose();
  assert.equal(app.alive(),false,'A must be retired before async save resolves');
  app.finish();
  assert.equal(app.alive(),false);
});

test('asynchronous paperdoll completion from A cannot repaint B', async () => {
  const src = [
    'let h={id:1},d={entity:1},c={key:1,img:1},paints=[],finish=[];',
    'const arm={subscribe(fn){this.fn=fn}};',
    'function recompose(e){return new Promise(r=>finish.push(r))}',
    'function figure(){Promise.resolve(recompose(d.entity)).then(()=>{h&&r()}).catch(()=>{})}',
    'function r(){paints.push(d.entity)}',
    'function mount(){arm.subscribe(()=>{c={key:null,img:null};if(h)r()})}',
    'function next(){h={id:2};d={entity:2}}',
  ].join('\n');
  const patched = lifecycle(src, 'r', 'd', true);
  assert.match(patched, /h===__dfoFigureHost\$&&d===__dfoFigureSession\$&&__dfoFigureGen\$===__dfoFigureGeneration\$&&__dfoFilterEpoch\$===__dfoFigureFilterEpoch\&&r\(\)/,&r\(\)/, 'do not expand $& replacement tokens or omit the mount/filter generation');
  const app = new Function(patched + '\nreturn {figure,next,finish,paints}')();
  app.figure();
  app.next();
  app.finish.shift()();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(app.paints, [], 'A completion is stale');
  app.figure();
  app.finish.shift()();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(app.paints, [2], 'B completion repaints B');
});

test('overlapping lazy openings reject A after B becomes the current inventory host', () => {
  const raw = [
    'let closed=0,unregistered=0;',
    'function create(){',
    '  let fired=false,host={isConnected:true,remove(){this.isConnected=false}};',
    '  host.id="enhanced-inventory";',
    '  function close(){if(fired)return;unregistered++;host.remove();fired=true;closed++}',
    '  const overlay={get done(){return fired},dispose(){close()}};',
    '  const request={alive:()=>!fired,host,onDismiss:()=>{host.remove();fired=true},label:"inventory"};',
    '  return {overlay,request}',
    '}',
    'function stats(){return {closed,unregistered}}',
  ].join('\n');
  const code = doorOwnership(raw);
  const app = new Function(code+'\nreturn {create,stats}')();
  const a=app.create(),b=app.create();
  assert.equal(a.request.alive(),false,'A must be cancelled without requiring dispose()');
  assert.equal(b.request.alive(),true,'B must retain permission to mount');
  a.overlay.dispose();
  assert.equal(b.request.alive(),true,'an old close cannot retire B');
  b.request.onDismiss();
  assert.deepEqual(app.stats(),{closed:2,unregistered:2},'error dismissal runs the full close path');
  assert.equal(b.request.host.isConnected,false);
  assert.equal(b.request.alive(),false);
});

test('lazy load failure respects deferred chest save instead of bypassing closeSession', () => {
  const raw = [
    'let pendingSave=true,completed=0;',
    'let fired=false,host={isConnected:true,remove(){this.isConnected=false}};',
    'host.id="enhanced-inventory";',
    'function close(){if(fired||pendingSave)return;host.remove();fired=true;completed++}',
    'const overlay={get done(){return fired},dispose(){close()}};',
    'const request={alive:()=>!fired,host,onDismiss:()=>{host.remove();fired=true},label:"inventory"};',
    'function finish(){pendingSave=false;close()}',
  ].join('\n');
  const code=doorOwnership(raw);
  const app=new Function(code+'\nreturn {request,finish,completed:()=>completed}')();
  app.request.onDismiss();
  assert.equal(app.request.host.isConnected,true,'do not bypass pending save');
  assert.equal(app.completed(),0);
  app.finish();
  assert.equal(app.completed(),1);
  assert.equal(app.request.host.isConnected,false);
});

test('same-host lazy retry retires the previous view but retains its host', () => {
  const raw = [
    'let host=null,_view=null,live=0,disposed=0;',
    'function mount(hostEl){',
    '  if(host&&host!==hostEl){let prev=host;_view?.unmount(),prev.remove?.()}',
    '  host=hostEl;live++;let closed=false;',
    '  _view={unmount(){if(closed)return;closed=true;live--;disposed++}};',
    '  return _view;',
    '}',
    'function state(){return {live,disposed}}',
  ].join('\n');
  const patched=cleanSameHostRemount(raw);
  const app=new Function(patched+'\nreturn {mount,state}')();
  const a={removed:0,remove(){this.removed++}},b={removed:0,remove(){this.removed++}};
  const viewA=app.mount(a);
  const viewA2=app.mount(a);
  assert.notEqual(viewA,viewA2);
  assert.deepEqual(app.state(),{live:1,disposed:1},'retry must release previous view allocations');
  assert.equal(a.removed,0,'reuse must not detach the incoming DOM host');
  app.mount(b);
  assert.deepEqual(app.state(),{live:1,disposed:2});
  assert.equal(a.removed,1,'handoff to a distinct host still detaches A');
  assert.equal(b.removed,0);
});
test('same-host native cleanup signature is a strict compatibility gate', () => {
  assert.throws(() => cleanSameHostRemount('function mount(){}'), /same-host cleanup: 0 places/);
});

test('published-style comma-prelude and shadowed incoming name preserve cleanup', () => {
  const raw = [
    'let k=null,us=null,prelude=0,disposals=0;',
    'function Pr(){prelude++}function Fr(){prelude++}',
    'function hd(e,t={}){',
    '  if(Pr(),Fr(),k&&k!==e){let e=k;us?.unmount(),e.remove?.()}',
    '  k=e;us={unmount(){disposals++;k=null}};',
    '}',
    'function state(){return {prelude,disposals,host:k}}',
  ].join('\n');
  const patched=cleanSameHostRemount(raw);
  const app=new Function(patched+'\nreturn {hd,state}')();
  const a={removed:0,remove(){this.removed++}},b={removed:0,remove(){this.removed++}};
  app.hd(a);
  app.hd(a);
  assert.equal(app.state().prelude,4,'original native prelude still runs exactly once per mount');
  assert.equal(app.state().disposals,1,'same host must dispose the former view');
  assert.equal(app.state().host,a);
  assert.equal(a.removed,0,'same-host retry keeps the live element attached');
  app.hd(b);
  assert.deepEqual(app.state(),{prelude:6,disposals:2,host:b});
  assert.equal(a.removed,1,'new incoming argument must not be shadowed by block-local variable');
});

test('new lazy opening closes the abandoned old overlay and removes its host', () => {
  const raw = [
    'let closed=0,unregistered=0;',
    'function create(){',
    '  let fired=false,host={isConnected:true,style:{},remove(){this.isConnected=false}};',
    '  host.id="enhanced-inventory";',
    '  function close(){if(fired)return;unregistered++;host.remove();fired=true;closed++}',
    '  const overlay={get done(){return fired},dispose(){close()}};',
    '  const request={alive:()=>!fired,host,onDismiss:()=>{host.remove();fired=true},label:"inventory"};',
    '  return {overlay,request,host}',
    '}',
    'function state(){return {closed,unregistered}}',
  ].join('\n');
  const app = new Function(doorOwnership(raw)+'\nreturn {create,state}')();
  const a = app.create(), b = app.create();
  assert.equal(a.request.alive(), false);
  assert.equal(a.host.isConnected, false, 'old host cannot intercept the new overlay');
  assert.equal(a.overlay.done, true, 'old native close() must have executed');
  assert.deepEqual(app.state(), {closed:1,unregistered:1});
  assert.equal(b.request.alive(), true);
  a.request.onDismiss();a.overlay.dispose();
  assert.equal(b.request.alive(), true, 'late A callbacks cannot dismiss B');
  b.request.onDismiss();
  assert.deepEqual(app.state(), {closed:2,unregistered:2});
});

test('handoff inerts A during a deferred save without bypassing its closeSession', () => {
  const raw = [
    'let closed=0,unregistered=0,finishA=null;',
    'function create(pending=false){',
    '  let fired=false,queued=false,host={isConnected:true,style:{},remove(){this.isConnected=false}};',
    '  host.id="enhanced-inventory";',
    '  function close(){',
    '    if(fired)return;',
    '    if(pending){if(!queued){queued=true;finishA=()=>{pending=false;close()}}return}',
    '    unregistered++;host.remove();fired=true;closed++',
    '  }',
    '  const overlay={get done(){return fired},dispose(){close()}};',
    '  const request={alive:()=>!fired,host,onDismiss:()=>{host.remove();fired=true},label:"inventory"};',
    '  return {overlay,request,host}',
    '}',
    'function finish(){finishA?.()}',
    'function state(){return {closed,unregistered}}',
  ].join('\n');
  const app = new Function(doorOwnership(raw)+'\nreturn {create,finish,state}')();
  const a = app.create(true);
  a.overlay.dispose();
  assert.equal(a.host.isConnected, true, 'native pending save retains A until completion');
  const b = app.create(false);
  assert.equal(a.request.alive(), false);
  assert.equal(a.host.isConnected, true);
  assert.equal(a.host.style.pointerEvents, 'none');
  assert.equal(a.host.style.visibility, 'hidden');
  assert.equal(b.request.alive(), true);
  app.finish();
  assert.equal(a.host.isConnected, false);
  assert.deepEqual(app.state(), {closed:1,unregistered:1});
  assert.equal(b.request.alive(), true, 'the late completion cannot close B');
  b.overlay.dispose();
  assert.deepEqual(app.state(), {closed:2,unregistered:2});
});

test('old figure promise cannot repaint a same-host same-deps remount', async () => {
  const src = [
    'let h={id:1},d={entity:1},c={key:1,img:1},paints=[],finish=[];',
    'const arm={subscribe(fn){this.fn=fn}};',
    'function recompose(e){return new Promise(resolve=>finish.push(resolve))}',
    'function figure(){Promise.resolve(recompose(d.entity)).then(()=>{h&&r()}).catch(()=>{})}',
    'function r(){paints.push(d.entity)}',
    'function mount(){arm.subscribe(()=>{c={key:null,img:null};if(h)r()})}',
  ].join('\n');
  const patched=lifecycle(src,'r','d',true);
  const app=new Function(patched+'\nreturn {figure,mount,finish,paints}')();
  app.mount();
  app.figure(); // A starts with the same host and deps objects that B will reuse
  app.mount();  // B has a new subscription generation, but no change of identity
  app.finish.shift()();
  await Promise.resolve();await Promise.resolve();
  assert.deepEqual(app.paints,[],'stale figure completion from A must not repaint B');
  app.figure();
  app.finish.shift()();
  await Promise.resolve();await Promise.resolve();
  assert.deepEqual(app.paints,[1],'current B figure completion must still repaint');
});
