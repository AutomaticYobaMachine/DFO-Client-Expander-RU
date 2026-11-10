'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { lifecycle } = require('../src/mod/inventory-transform.cjs');

// Controlled native-like fixture. The published game bundle has a separate
// fail-closed compatibility gate in tools/check-build.cjs.
function fixture(){
  const source = [
    'let h={current:null,contains(t){return t===this.current}},d=null,cache={},paints=0,draws=0;',
    'const model={pieces:1},icons=new Map(),observers=[];',
    'const arm={subscribe(fn){observers.push(fn)},notify(){for(const fn of observers)fn()},status(){return {active:true,reason:"built",skeletonPath:"p",pieces:model.pieces,worn:[]}}};',
    'd={fpArm:arm,entity:{}};',
    'function tileFor(src){return {isConnected:true,src,wear:null,',
    '  classList:{contains(c){return c==="has-icon"}},',
    '  querySelector(q){if(q===".wear")return this.wear;return {getAttribute:()=>this.src}},',
    '  append(w){this.wear=w},replaceWith(fresh){this.isConnected=false;h.current=fresh}}}',
    'function itemTile(line,box,ready,snap){draws++;return tileFor(icons.get(line.item.id)||"classic")}',
    'function landingTiles(draw,o){return {tile(spec){return draw(spec,()=>{})}}}',
    'const waiting=landingTiles((spec,landed)=>itemTile(spec.line,spec.box,landed,spec.snap),{alive:()=>!!h});',
    'function r(){paints++;h.current=waiting.tile({line:{item:{id:"a"}},box:32,snap:true})}',
    'function paperDoll(e){return null}',
    'function refreshFigure(){Promise.resolve(paperDoll(d.entity)).then(()=>{h&&r()}).catch(()=>{})}',
    'function mount(){arm.subscribe(()=>{cache={key:null,img:null};if(h)r()});r()}',
    'function changeCategory(){h.current.isConnected=false;h.current=waiting.tile({line:{item:{id:"b"}},box:32,snap:true})}',
    'function state(){return {paints,draws,src:h.current.src,connected:h.current.isConnected}}',
  ].join('\n');
  const result=lifecycle(source,'r','d',true,true);
  const app=new Function(result+'\nreturn {arm,mount,changeCategory,state,model,icons,refreshFigure,liveTiles:()=>__dfoLiveTiles$.size}')();
  return {app,result};
}

test('40 pending icon notices do not cause a second full render; model icons land in the existing row',async()=>{
  const {app,result}=fixture();
  assert.match(result,/__dfoTrackVisual\$/);
  assert.match(result,/function __dfoVisualNotice\$/);
  app.mount();
  const before=app.state().paints;
  app.icons.set('a','model-1');
  for(let i=0;i<40;i++)app.arm.notify();
  assert.equal(app.state().paints,before);
  await Promise.resolve();
  assert.equal(app.state().paints,before,'icon notification must not repaint inventory shell');
  assert.equal(app.state().src,'model-1');
});

test('late callback from old category cannot replace the new category tile',async()=>{
  const {app}=fixture();
  app.mount();
  app.icons.set('a','old-model');
  app.arm.notify();
  app.changeCategory();
  await Promise.resolve();
  assert.equal(app.state().src,'classic','new category must not be painted with old item data');
  app.icons.set('b','new-model');
  app.arm.notify();
  await Promise.resolve();
  assert.equal(app.state().src,'new-model');
  assert.equal(app.state().paints,1,'filter-only changes cannot trigger full shell rebuild');
});

test('repeated warm-cache category refills release detached tile registry entries',async()=>{
  const {app}=fixture();
  app.mount();
  for(let i=0;i<40;i++)app.changeCategory();
  await Promise.resolve();
  assert.equal(app.liveTiles(),1,'only the current connected category may remain tracked');
});

test('real rig structural change can still request one owner-scoped full repaint',async()=>{
  const {app}=fixture();
  app.mount();
  app.model.pieces++;
  app.arm.notify();app.arm.notify();
  await Promise.resolve();
  assert.equal(app.state().paints,2);
});

test('an incompatible native factory fails closed rather than silently leaving the bug',()=>{
  const {result}=fixture();
  assert.ok(result.includes('const waiting=landingTiles'));
  const src=[
    'let h={},d={fpArm:{status(){return {active:true}}}};',
    'function r(){};function foo(){return 1}',
    'function figure(){Promise.resolve(foo(d.entity)).then(()=>{h&&r()}).catch(()=>{})}',
    'const waiting=otherFactory(()=>null,{alive:()=>!!h});',
    'let cache={};const arm={subscribe(fn){return fn}};',
    'arm.subscribe(()=>{cache={key:null,img:null};if(h)r()})',
  ].join('\n');
  assert.throws(()=>lifecycle(src,'r','d',true,true),/native landingTiles icon factory/);
});
