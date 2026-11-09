'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/mod/page/dfo_pack.js'),'utf8');
const begin=source.indexOf('  function resetGeometry(shell) {');
const end=source.indexOf('  function head(header, repaint) {',begin);
assert.ok(begin>=0&&end>begin);
const helpers=source.slice(begin,end);
function fixture(paired=false){
  const node=(width=0,height=0)=>{
    const props=new Map();
    return {isConnected:true,getBoundingClientRect:()=>({width,height}),
      style:{setProperty(k,v){props.set(k,v)},removeProperty(k){props.delete(k)},getPropertyValue(k){return props.get(k)||''}},
      querySelector(){return null}};
  };
  const win=node(paired?1040:1600,640),grid=node(),main=node(656,600),dock=node(380,600),
    character=node(),shelf=node(),tabs=node(),items=node(),remote=node(340,600),shell=node();
  tabs.children=Array.from({length:9},()=>Object.assign(node(),{scrollWidth:40,clientWidth:50}));
  shell.classList={contains:x=>paired&&x==='paired'};
  shell.querySelector=s=>({':scope > .pack-win':win,':scope > .loot-win':remote})[s]??null;
  win.querySelector=s=>s==='.pack'?grid:null;
  grid.querySelector=s=>({'.pack-main':main,'.pack-dock':dock})[s]??null;
  main.querySelector=s=>s===':scope > .charcol'?character:null;
  dock.querySelector=s=>({'.packcats':shelf,'.packlists > .packcol':items})[s]??null;
  shelf.querySelector=s=>s==='.packtabs'?tabs:null;
  const root={innerWidth:1920,innerHeight:1080,devicePixelRatio:1,matchMedia:()=>({matches:true}),count:0,
    __dfoInventoryRemeasure$(){this.count++}};
  const {applyGeometry}=new Function('root','doc','scaledShells','state',helpers+'\nreturn {applyGeometry};')
    (root,{documentElement:{}},new WeakMap(),{view:'rows'});
  return {root,shell,win,header:{closest:()=>shell},applyGeometry};
}
test('native baseline persists without cumulative enlargement when viewport changes',()=>{
  const h=fixture();
  h.applyGeometry(h.header);
  assert.equal(h.win.style.getPropertyValue('height'),'760px');
  h.applyGeometry(h.header);
  assert.equal(h.root.count,1);
  h.root.innerWidth=1700;
  h.applyGeometry(h.header);
  assert.equal(h.win.style.getPropertyValue('height'),'760px');
  assert.equal(h.root.count,2);
  h.root.innerWidth=800;h.root.matchMedia=()=>({matches:false});
  h.applyGeometry(h.header);
  assert.equal(h.win.style.getPropertyValue('height'),'');
  assert.equal(h.root.count,3);
  h.shell.isConnected=false;h.applyGeometry(h.header);
  assert.equal(h.root.count,3);
});
test('paired pack grows overall width but constrains itself beside remote pane',()=>{
  const h=fixture(true);
  h.applyGeometry(h.header);
  assert.equal(h.win.style.getPropertyValue('width'),'1171.2px');
  h.root.innerWidth=1350;h.applyGeometry(h.header);
  assert.equal(h.win.style.getPropertyValue('width'),'1040px');
});
