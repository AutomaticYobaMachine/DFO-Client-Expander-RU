'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {bindInput}=require('../src/mod/page/dfo_loot.js');

function fixture(code, {instant=false}={}) {
  const handlers=new Map(), target={addEventListener:(type,fn)=>handlers.set(type,fn),removeEventListener:type=>handlers.delete(type),document:{activeElement:null}};
  let count=0, open=false, blocked=false;
  const api={isOpen:()=>open,isOpening:()=>false,canOpen:()=>!blocked&&!open,activate(){count++;open=!instant}};
  const dispose=bindInput(api,{keyCode:code},target);
  function fire(type,extra={}) {
    const e={type,prevented:false,stopped:false,preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true},...extra};
    handlers.get(type)?.(e);return e;
  }
  return {fire,target,handlers,dispose,get count(){return count},close(){open=false},block(on){blocked=on}};
}

test('mouse 4/5 use DOM back/forward buttons and suppress the complete pointer/mouse sequence',()=>{
  for(const [code,button] of [['Mouse3',1],['Mouse4',3],['Mouse5',4]]) {
    const f=fixture(code,{instant:true});
    for(const other of [0,2,...(button===3?[4]:[3])].filter(n=>n!==button)) {
      assert.equal(f.fire('pointerdown',{button:other,pointerType:'mouse'}).prevented,false);
    }
    assert.equal(f.count,0);
    for(const type of ['pointerdown','mousedown','pointerup','mouseup','auxclick']) {
      const e=f.fire(type,{button,pointerType:'mouse'});assert.ok(e.prevented&&e.stopped,type);
    }
    assert.equal(f.count,1,'compatibility mousedown repeated an instant autoloot');
    for(const type of ['pointerdown','mousedown','pointerup','mouseup','auxclick']) f.fire(type,{button,pointerType:'mouse'});
    assert.equal(f.count,2,'release did not allow a fresh physical press');
    f.dispose();assert.equal(f.handlers.size,0);
  }
});

test('mouse input respects chat, editable focus, modifiers and blocked overlays, then recovers after blur',()=>{
  const f=fixture('Mouse5');
  for(const extra of [{ctrlKey:true},{shiftKey:true},{altKey:true},{metaKey:true},{defaultPrevented:true},{target:{closest:()=>({})}}]) {
    assert.equal(f.fire('pointerdown',{button:4,pointerType:'mouse',...extra}).prevented,false);
  }
  f.target.document.activeElement={closest:()=>({})};
  assert.equal(f.fire('mousedown',{button:4}).prevented,false);
  f.target.document.activeElement=null;f.block(true);
  assert.equal(f.fire('pointerdown',{button:4}).prevented,false);
  assert.equal(f.fire('mouseup',{button:4}).prevented,false);
  assert.equal(f.count,0);
  f.block(false);f.fire('mousedown',{button:4});assert.equal(f.count,1);
  f.fire('mousedown',{button:4});assert.equal(f.count,1);
  f.fire('blur');f.close();f.fire('mousedown',{button:4});assert.equal(f.count,2);
});

test('NumPad keys use physical codes with Num Lock on or off, including a distinct Enter and decimal key',()=>{
  for(const [code,key] of [['Numpad1','1'],['Numpad1','End'],['Numpad0','Insert'],['NumpadDecimal','Delete'],['NumpadEnter','Enter'],['NumpadAdd','+'],['NumpadDivide','/']]) {
    const f=fixture(code);
    const other=code==='NumpadEnter'?'Enter':code==='Numpad1'?'Digit1':'KeyJ';
    assert.equal(f.fire('keydown',{code:other,key}).prevented,false);
    assert.equal(f.fire('keydown',{code,key,repeat:true}).prevented,false);
    const e=f.fire('keydown',{code,key});assert.ok(e.prevented&&e.stopped);assert.equal(f.count,1);
    for(let i=0;i<20;i++) f.fire('keydown',{code,key,repeat:true});
    assert.equal(f.count,1);
    assert.ok(f.fire('keyup',{code,key}).prevented,'release leaked into the newly opened window');
    f.close();f.fire('keydown',{code,key});assert.equal(f.count,2);
  }
});

test('typing and keyboard modifiers stay native; an instant autoloot cannot repeat until a fresh key press',()=>{
  const f=fixture('KeyK',{instant:true});
  for(const extra of [{target:{closest:()=>({})}},{ctrlKey:true},{altKey:true},{shiftKey:true},{metaKey:true}]) assert.equal(f.fire('keydown',{code:'KeyK',...extra}).prevented,false);
  assert.equal(f.count,0);f.fire('keydown',{code:'KeyK'});
  for(let i=0;i<20;i++) f.fire('keydown',{code:'KeyK',repeat:true});
  assert.equal(f.count,1);f.fire('keyup',{code:'KeyK'});f.fire('keydown',{code:'KeyK'});assert.equal(f.count,2);
});

test('a bound Tab or Enter/Space keeps native navigation and button activation inside the open loot UI',()=>{
  for(const code of ['Tab','Enter','NumpadEnter','Space']) {
    const f=fixture(code);
    f.fire('keydown',{code});f.fire('keyup',{code});assert.equal(f.count,1);
    const target={closest:selector=>selector==='button,[role="button"]'?{}:null};
    const e=f.fire('keydown',{code,target});assert.equal(e.prevented,false,'stole UI control '+code);
    assert.equal(f.fire('keyup',{code,target}).prevented,false);
    assert.equal(f.count,1);
  }
});
