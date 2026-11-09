'use strict';
// Independent GDI screen-DC sampler, controlled by Electron main. It reads the
// displayed desktop, not the game JS / NativeImage. Samples are hashes only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {isFrameProbeEvent}=require('./inventory-frame-monitor.cjs');

function createDesktopMonitor(trace,opts={}){
 const now=opts.now||Date.now, interval=opts.setInterval||setInterval;
 const cancel=opts.clearInterval||clearInterval;
 const spawnChild=opts.spawn||spawn,io=opts.fs||fs;
 const platform=opts.platform||process.platform;
 const bundled=opts.bundlePath||path.join(__dirname,'bin/dfo-desktop-probe.exe');
 const dest=opts.destination||path.join(trace.dir,'dfo-desktop-probe-1.29.13.exe');
 const watched=new Map();
 let until=0,timer=null,prepared=false,nextRetry=0,attempts=0;
 const log=(type,data)=>{try{trace.serverEvent(type,data)}catch{}};
 const hash=buf=>crypto.createHash('sha256').update(buf).digest('hex');
 function extract(){
  if(prepared)return dest;
  const binary=io.readFileSync(bundled);
  const digest=hash(binary);
  const same=()=>{try{return hash(io.readFileSync(dest))===digest}catch{return false}};
  if(!same()){
   io.mkdirSync(path.dirname(dest),{recursive:true});
   const tmp=dest+'.'+process.pid+'.tmp';
   try{
    io.writeFileSync(tmp,binary);
    try{io.renameSync(tmp,dest)}catch(e){if(!same())throw e}
   }finally{try{io.unlinkSync(tmp)}catch{}}
   if(!same())throw Error('native sampler SHA-256 mismatch');
  }
  prepared=true;return dest;
 }
 function game(contents){
  try{return /^dagger:\/\/game(?:\/|$)/.test(contents.getURL())}catch{return false}
 }
 function nativeHandle(contents){
  const win=contents.getOwnerBrowserWindow?.();
  if(!win||win.isDestroyed?.())return null;
  const h=win.getNativeWindowHandle?.();
  if(!Buffer.isBuffer(h)||h.length<4)return null;
  const number=h.length>=8?h.readBigUInt64LE(0):BigInt(h.readUInt32LE(0));
  return number>0n?number.toString():null;
 }
 function stop(state,reason){
  if(!state.child)return;
  const p=state.child;
  state.child=null;state.stopping=true;
  log('desktop.stop',{webContentsId:state.id,reason,samples:state.samples,
    lastSampleAgeMs:state.sampleAt?now()-state.sampleAt:-1});
  try{p.kill()}catch{}
 }
 function start(state){
  if(until<=now()||state.child||platform!=='win32'||!game(state.contents)||
    now()<nextRetry||attempts>=3)return;
  let hwnd;
  try{hwnd=nativeHandle(state.contents)}catch(e){
   log('desktop.window.error',{webContentsId:state.id,message:String(e.message).slice(0,140)});
   nextRetry=now()+20000;return;
  }
  if(!hwnd){
   log('desktop.window.unavailable',{webContentsId:state.id});
   nextRetry=now()+15000;return;
  }
  let p;
  try{
   const helper=extract();
   p=spawnChild(helper,[hwnd],{
     windowsHide:true,stdio:['pipe','pipe','pipe'],detached:false
   });
  }catch(e){
   nextRetry=now()+20000;
   log('desktop.start.error',{webContentsId:state.id,message:String(e.message).slice(0,140)});
   return;
  }
  attempts++;state.child=p;state.stopping=false;state.buffer='';
  state.samples=0;state.sampleAt=0;
  log('desktop.start',{webContentsId:state.id,method:'gdi-screen-dc',windowHandle:hwnd});
  p.stdout?.on('data',chunk=>{
   if(state.child!==p)return;
   state.buffer+=String(chunk);
   if(state.buffer.length>32768){
    log('desktop.protocol.error',{webContentsId:state.id,message:'native output too large'});
    stop(state,'oversized-output');return;
   }
   for(let pos;(pos=state.buffer.indexOf('\n'))>=0;){
    const line=state.buffer.slice(0,pos);
    state.buffer=state.buffer.slice(pos+1);
    if(!line.trim())continue;
    try{
     const r=JSON.parse(line);
     if(r.type!=='desktop.sample'||!Number.isFinite(r.at)||
       typeof r.valid!=='boolean'||typeof r.foreground!=='boolean')continue;
     state.samples++;state.sampleAt=now();
     log('desktop.sample',{
      webContentsId:state.id,capturedAt:r.at,valid:r.valid,
      method:'gdi-screen-dc',reason:String(r.reason||'').slice(0,60),
      foreground:r.foreground,visible:!!r.visible,minimized:!!r.minimized,
      windowWidth:Number(r.width)||0,windowHeight:Number(r.height)||0,
      colorBins:Number(r.colorBins)||0,regions:String(r.regions||'').slice(0,180),
      changedRegions:Number(r.changedRegions),
      centerChanged:!!r.centerChanged,centerAgeMs:Number(r.centerAgeMs),
      captureMs:Number(r.captureMs)
     });
    }catch(e){log('desktop.protocol.error',{webContentsId:state.id,message:String(e.message).slice(0,130)})}
   }
  });
  p.stderr?.on('data',v=>log('desktop.stderr',{
   webContentsId:state.id,message:String(v).slice(0,130)}));
  p.on('error',e=>{
   nextRetry=now()+20000;
   log('desktop.process.error',{webContentsId:state.id,message:String(e.message).slice(0,130)})
  });
  p.on('close',(code,signal)=>{
   const expected=state.stopping;
   if(state.child===p)state.child=null;
   if(!expected)nextRetry=now()+20000;
   log('desktop.process.exit',{webContentsId:state.id,code:Number.isInteger(code)?code:-1,
     expected,signal:String(signal||''),samples:state.samples});
  });
 }
 function pulse(){
  for(const state of watched.values()){
   if(until>now())start(state);else stop(state,'watch-expired');
  }
  if(until<=now()&&timer!==null){cancel(timer);timer=null}
 }
 function track(contents){
  if(!contents||watched.has(contents))return;
  const state={contents,id:Number.isInteger(contents.id)?contents.id:-1,
    child:null,stopping:false,buffer:'',samples:0,sampleAt:0};
  watched.set(contents,state);
  contents.on?.('did-finish-load',()=>{if(until>now())start(state)});
  contents.on?.('destroyed',()=>{stop(state,'contents-destroyed');watched.delete(contents)});
  if(until>now())start(state);
 }
 function feed(events){
  if(!Array.isArray(events)||!events.some(isFrameProbeEvent))return;
  const fresh=until<=now();
  until=now()+90000;
  if(platform!=='win32'){
   if(fresh)log('desktop.unavailable',{reason:'not-windows'});
   return;
  }
  if(fresh){attempts=0;log('desktop.armed',{watchMs:90000,method:'gdi-screen-dc'})}
  for(const state of watched.values())start(state);
  if(timer===null){timer=interval(pulse,2000);timer?.unref?.()}
 }
 return{track,feed,pulse};
}
module.exports={createDesktopMonitor};
