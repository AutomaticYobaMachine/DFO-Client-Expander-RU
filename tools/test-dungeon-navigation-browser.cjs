'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const upstream=path.resolve(process.argv[2]||'/tmp/dfo-upstream'),dist=path.resolve(process.argv[3]||'/tmp/dfo-release-0.1.14520');
const {chromium}=require(path.join(upstream,'node_modules/playwright')),{parse}=require(path.join(upstream,'node_modules/acorn'));
const {transformAsset}=require('../src/mod/transforms.cjs'),assets=path.join(dist,'assets');
const world=fs.readdirSync(assets).find(f=>/^world-[^.]+\.js$/.test(f)),deep=fs.readdirSync(assets).find(f=>/^deepWaterRuntime-/.test(f));
let colliderName,colliderFile;
for(const file of fs.readdirSync(assets).filter(f=>f.endsWith('.js'))){
 const raw=fs.readFileSync(path.join(assets,file),'utf8');if(!raw.includes('raycastHit(')||!raw.includes('addMesh('))continue;
 const ast=parse(raw,{ecmaVersion:'latest',sourceType:'module'}),pending=[ast];
 while(pending.length){const n=pending.pop();if(n.type==='VariableDeclarator'&&n.init?.type==='ClassExpression'&&['raycastHit','addMesh'].every(name=>n.init.body.body.some(p=>p.key?.name===name)))colliderName=n.id.name;
  if(n.type==='ClassDeclaration'&&['raycastHit','addMesh'].every(name=>n.body.body.some(p=>p.key?.name===name)))colliderName=n.id.name;
  if(colliderName){colliderFile=file;break;}
  for(const value of Object.values(n))if(value&&typeof value==='object')Array.isArray(value)?pending.push(...value.filter(x=>x&&typeof x==='object')):pending.push(value);
 }if(colliderName)break;
}
assert.ok(colliderName,'published physical Collider');

function fixture(Collider,mat4){
 const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2',{preserveDrawingBuffer:true,antialias:false});if(!gl)throw Error('WebGL2 unavailable');
 const col=new Collider(()=>-Infinity),I=mat4.identity(),geometry=[],colors=[],shift=[0,0,0],actions={objects:new Map()},isDoor=new URLSearchParams(location.search).has('door');
 const quad=(key,ps,color=[.22,.24,.27],move=null)=>{col.addMesh(key,new Float32Array(ps.flat()),new Uint16Array([0,1,2,0,2,3]),I,move);for(const j of [0,1,2,0,2,3]){geometry.push(...ps[j]);colors.push(...color);}};
 const wall=(key,x,z0,z1,color=[.32,.2,.12],move=null)=>quad(key,[[x,0,z0],[x,3,z0],[x,3,z1],[x,0,z1]],color,move);
 quad('floor',[[0,0,0],[14,0,0],[14,0,12],[0,0,12]]);wall('left',0,0,12);wall('right',14,0,12);
 quad('front',[[0,0,0],[14,0,0],[14,3,0],[0,3,0]]);quad('back',[[0,0,12],[14,0,12],[14,3,12],[0,3,12]]);
 if(isDoor){wall('partition-a',7,0,5.3);wall('partition-b',7,6.7,12);wall('door:1',7,5.3,6.7,[.35,.12,.06],()=>shift);actions.objects.set('door:1',{key:'door:1',kind:'door',currentLockValue:0});}
 else{wall('pillar-a',6,3,9,[.6,.12,.06]);wall('pillar-b',7,3,9,[.6,.12,.06]);quad('pillar-c',[[6,0,3],[7,0,3],[7,3,3],[6,3,3]],[.6,.12,.06]);quad('pillar-d',[[6,0,9],[7,0,9],[7,3,9],[6,3,9]],[.6,.12,.06]);}
 const feet=new Float32Array([2,0,6]),loc={name:'Navigation Test Dungeon',hasDungeon:true,mapTableData:{mapId:12345,dungeonType:0},dungeon:{blocks:[{}],recordElement:{header:{locationId:9}}}};
 const quests=new Map([1,2].map(uid=>[uid,{uid,displayName:'Одинаковое задание',resources:new Map([['place',{siteDetails:{mapId:12345,siteType:2}}]])}]));
 const behaviour=uid=>({questUID:uid,targetQuest:quests.get(uid),targetResource:{displayName:'Цель '+uid,isItem:true}});
 const stands=[{x:3,y:0,z:2,active:true,behaviour:behaviour(1)},{x:11,y:0,z:10,active:true,behaviour:behaviour(2)}];
 const foes=[{mobileType:1,src:{},entity:{eliteFoe:true,properName:'За стеной',health:20,maxHealth:20},ai:{feet:[8,0,6],isHostile:true}},{mobileType:1,src:{},entity:{eliteFoe:true,properName:'Ближний',health:20,maxHealth:20},ai:{feet:[3,0,10],isHostile:true}}];
 let overlay=null,passes=0,draws=0,questReads=0;
 const ctx={foes,actions,people:[],enemies:foes.map(f=>({x:f.ai.feet[0],y:0,z:f.ai.feet[2]})),exitDoors:[{centre:{x:0,y:1,z:0},normal:{x:-1,y:0,z:0},size:{y:2},matrix:mat4.trs(13,0,6,0,0,0)}]};
 const nav={collider:col,key:'navigation-fixture',feet,transitions:[]};Object.defineProperty(ctx,'dfoDungeonNavigation',{get:()=>nav});
 const questLog=()=>{questReads++;return{active:[...quests.values()].filter(q=>!q.questComplete).map(q=>({id:q.uid,name:q.displayName}))};};
 const live={ctx,location:loc,foes,aurum:{id:'d12345',foot:[11,0,2],open:false},questBridge:{machine:{quests},questLog},regen:()=>null,blocked:()=>!!overlay&&!overlay.done,owns:w=>overlay===w,mount:w=>{if(overlay&&!overlay.done)return false;overlay=w;return true},unmount:w=>{if(overlay===w)overlay=null},journal:()=>false};
 Object.defineProperty(ctx,'dfoDungeonLive',{get:()=>live});
 const sources={stands,boxOf:s=>({min:[s.x-.2,s.y,s.z-.2],max:[s.x+.2,s.y+1,s.z+.2]}),followedId:null};
 const modes={mode:'dungeon',dungeonCtx:ctx,dungeonLocation:loc,dfoDungeonQuestSources:sources,transitioning:false,toggleAutomap(){}};
 const entity={level:25,stats:{luck:50},skills:[]},session={room:'dungeon:m12345',status:'open',peers:new Map(),_rooms:new Map([['dungeon:m12345',new Set()]])};
 const tools={modes:()=>modes,player:()=>entity,presence:()=>session,viewOpen:()=>false,rank:()=>8,allowed:()=>true,size:()=> 'S',enemyName:()=> 'Rat',aurumKey:()=> 'd12345',aurumAmount:()=>7};
 __dfoDungeons.register({params:new URLSearchParams('online'),__dfoWorld:tools,travelViewPlaces:()=>[],travelViewFarPlaces:()=>[],travelViewDungeons:()=>[{key:'place:12345',loc,found:true,px:1,py:2}]});
 const shader=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
 const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,'#version 300 es\nlayout(location=0)in vec3 p;layout(location=1)in vec3 c;uniform mat4 proj;uniform mat4 view;out vec3 col;void main(){col=c;gl_Position=proj*view*vec4(p,1.);}'));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'#version 300 es\nprecision highp float;in vec3 col;out vec4 o;void main(){o=vec4(col,1.);}'));gl.linkProgram(program);
 const vao=gl.createVertexArray(),buffers=[];gl.bindVertexArray(vao);for(const[a,data]of[[0,geometry],[1,colors]]){const b=gl.createBuffer();buffers.push(b);gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,3,gl.FLOAT,false,0,0);}gl.bindVertexArray(null);
 const renderer={gl,_proj:mat4.perspective(70*Math.PI/180,canvas.width/canvas.height,.1,80),_view:mat4.lookAt([2,1.7,6],[12,.5,6],[0,1,0]),_camPos:[2,1.7,6],markForeignPass(){passes++;}};
 function draw(withLine=true){gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(.035,.04,.05,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.useProgram(program);gl.uniformMatrix4fv(gl.getUniformLocation(program,'proj'),false,renderer._proj);gl.uniformMatrix4fv(gl.getUniformLocation(program,'view'),false,renderer._view);gl.bindVertexArray(vao);gl.drawArrays(gl.TRIANGLES,0,geometry.length/3);gl.bindVertexArray(null);if(withLine)__dfoDungeonNavigation.draw(ctx,renderer);draws++;}
 function pixels(){const p=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;}
 function gpuCheck(){draw(false);const a=pixels();draw(true);const b=pixels();let blue=0,wallBlue=0,wall=0;for(let i=0;i<a.length;i+=4){const changed=b[i+2]>a[i+2]+20&&b[i+1]>a[i+1]+10;if(changed)blue++;if(a[i]>a[i+1]*2&&a[i]>50){wall++;if(changed)wallBlue++;}}return{blue,wallBlue,wall,error:gl.getError(),depth:gl.getParameter(gl.DEPTH_TEST),writes:gl.getParameter(gl.DEPTH_WRITEMASK),blend:gl.getParameter(gl.BLEND),passes};}
 function shaft(){
   for(const key of [...col._buckets.keys()])col.removeBucket(key);geometry.length=colors.length=0;actions.objects.clear();
   quad('floor',[[0,0,0],[14,0,0],[14,0,12],[0,0,12]]);quad('upper',[[7,4,0],[14,4,0],[14,4,12],[7,4,12]]);quad('shaft-wall',[[7,0,0],[7,4,0],[7,4,12],[7,0,12]]);
   for(const [i,data]of [geometry,colors].entries()){gl.bindBuffer(gl.ARRAY_BUFFER,buffers[i]);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);}
   nav.transitions=[];ctx.exitDoors=[{pos:[10,4,6]}];feet.set([2,0,6]);renderer._camPos=[4,2,8];renderer._view=mat4.lookAt([4,2,8],[7,2.5,6],[0,1,0]);
 }
 function lookAlong(p,q){renderer._camPos=[p[0],p[1]+1.7,p[2]];renderer._view=mat4.lookAt(renderer._camPos,[q[0],q[1]+.1,q[2]],[0,1,0]);}
 function loadComplex(data){
   for(const key of [...col._buckets.keys()])col.removeBucket(key);geometry.length=colors.length=0;actions.objects.clear();
   for(const part of data.parts){const indices=new Uint32Array(part.positions.length/3);for(let i=0;i<indices.length;i++)indices[i]=i;col.addMesh(part.key,new Float32Array(part.positions),indices,I);geometry.push(...part.positions);for(let i=0;i<indices.length;i++)colors.push(.22,.24,.27);}
   for(const o of data.actions)actions.objects.set(o.key,o);
   for(const [i,values]of [geometry,colors].entries()){gl.bindBuffer(gl.ARRAY_BUFFER,buffers[i]);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(values),gl.STATIC_DRAW);}
   nav.key=data.key;nav.transitions=[];ctx.exitDoors=[{pos:data.goal}];feet.set(data.from);lookAlong(data.from,[14,0,6]);
 }
 window.fixture={ctx,live,nav,modes,foes,quests,sources,stands,session,feet,shift,draw,renderer,gl,gpuCheck,shaft,loadComplex,lookAlong,get draws(){return draws},get passes(){return passes},get questReads(){return questReads}};
 function frame(){draw();requestAnimationFrame(frame);}requestAnimationFrame(frame);window.ready=true;
}
const scripts=['dfo_dungeon_model.js','dfo_dungeons.js','dfo_dungeon_live_model.js','dfo_dungeon_graph.js','dfo_dungeon_nav_model.js','dfo_dungeon_nav.js','dfo_dungeon_live.js'];
const html='<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#0d1118}canvas{position:fixed;inset:0;width:100vw;height:100vh}</style><script>if(new URLSearchParams(location.search).has("no-worker"))window.Worker=undefined;window.__DFO_MOD_CFG__={dungeons:{enabled:true,keyCode:"KeyK"},nearbyLoot:{enabled:false}};</script>'+scripts.map(f=>'<script src="/'+f+'"></script>').join('')+'</head><body><canvas width="960" height="640"></canvas><script type="module">import "/assets/'+world+'";import {FixtureCollider} from "/assets/'+colliderFile+'";import * as mat4 from "/fixture-mat4.js";('+fixture.toString()+')(FixtureCollider,mat4);</script></body></html>';
const cache=new Map(),labs=new Map();let workerRequests=0,graphWorkers=0;
const server=http.createServer((req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end(html);}
 if(url.pathname==='/fixture-mat4.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(upstream,'src/world/mat4.js')));}
 if(labs.has(url.pathname)){res.setHeader('Content-Type','application/json');return res.end(labs.get(url.pathname));}
 if(url.pathname.startsWith('/dfo-mod/dungeon-notes')){res.setHeader('Content-Type','application/json');return res.end('{"notes":[]}');}
 if(/^\/dfo_.*\.js$/.test(url.pathname)){if(req.headers['sec-fetch-dest']==='worker')graphWorkers++;res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(__dirname,'../src/mod/page',url.pathname.slice(1))));}
 const file=path.resolve(dist,'.'+url.pathname);if(!file.startsWith(dist+path.sep))throw Error('bad path');let body=fs.readFileSync(file);
 if(/navWorker-/.test(file))workerRequests++;
 if(url.pathname.endsWith('.js')){res.setHeader('Content-Type','text/javascript');if(!cache.has(file)){let t=transformAsset(url.pathname.slice(1),body.toString(),{dungeons:true,nearbyLoot:false,marks:false,ru:false}).text;if(path.basename(file)===colliderFile)t+='\nexport{'+colliderName+' as FixtureCollider};';cache.set(file,t);}body=cache.get(file);}
 res.end(body);
}catch(e){res.statusCode=404;res.end(e.message);}});
(async()=>{let browser,page;try{
 process.env.DFO_UPSTREAM_DIR=upstream;const {multiblock}=require('../test/helpers/dungeon-complex.cjs');
 for(const sealed of [false,true]){const r=await multiblock({sealed}),parts=[];for(const [key,b]of r.col._buckets){const groups=new Map();for(let i=0;i<b.tris.length;i++){const part=b.part[i];if(!groups.has(part))groups.set(part,[]);groups.get(part).push(...b.tris[i].slice(0,3).flat());}for(const positions of groups.values())parts.push({key,positions});}labs.set('/fixture-complex'+(sealed?'-sealed':'')+'.json',JSON.stringify({key:'complex:'+sealed,parts,actions:[...r.actions.objects.values()],from:r.from,goal:r.goal,blocks:r.blocks}));}
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const address='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:process.env.DFO_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});page=await browser.newPage({viewport:{width:1200,height:800}});
 const errors=[];page.on('pageerror',e=>{errors.push(String(e));console.error('PAGE',e)});await page.goto(address);await page.waitForFunction(()=>window.ready);await page.waitForTimeout(700);assert.equal(await page.evaluate(()=>fixture.questReads),0,'idle navigation must not scan the quest journal');await page.keyboard.press('k');const dialog=page.locator('.dfo-dungeon-live');await dialog.waitFor();
 for(const name of ['К выходу','К сундуку с аурумом','К ближайшему элитнику','К цели задания'])assert.equal(await dialog.getByRole('button',{name,exact:true}).isEnabled(),true);
 assert.equal(await dialog.getByRole('button',{name:'Обновить',exact:true}).count(),0);await dialog.getByRole('button',{name:'К выходу',exact:true}).click();await dialog.waitFor({state:'hidden'});
 await page.waitForFunction(()=>__dfoDungeonNavigation.state().phase==='following',null,{timeout:30000});await page.waitForFunction(()=>fixture.passes>0);
 assert.ok(graphWorkers>0,'the mod runs its own graph worker');assert.equal(workerRequests,0,'NPC navigation workers are never requested');const gpu=await page.evaluate(()=>fixture.gpuCheck());assert.ok(gpu.blue>20,JSON.stringify(gpu));assert.ok(gpu.wall>20);assert.equal(gpu.wallBlue,0,'depth test hides the route behind opaque walls');assert.equal(gpu.error,0);assert.equal(gpu.depth,true);assert.equal(gpu.writes,true);assert.equal(gpu.blend,false);
 const profileKey=await page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('dfo-player-route-profiles',1);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});const rows=await new Promise((resolve,reject)=>{const q=db.transaction('profiles').objectStore('profiles').getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});db.close();if(!rows.length)throw Error('profiles were not saved');for(const r of rows)if(!r.profile.points.length||!r.profile.links)throw Error('invalid saved profile');return rows[0].key;});
 if(process.env.DFO_SCREENSHOT_DIR){fs.mkdirSync(process.env.DFO_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.DFO_SCREENSHOT_DIR,'navigation-line.png')});}
 const masked=await page.evaluate(()=>{const col=fixture.nav.collider,I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];__dfoDungeonNavModel.notePlacement(col,'floor',{modelIdNum:74037});col.addMesh('floor',new Float32Array([4,0,0,4,3,0,4,3,12,4,0,12]),new Uint16Array([0,1,2,0,2,3]),I);const cast=c=>c.raycastHit([2,1,6],[1,0,0],12,{bodies:true}).dist,physical=cast(col),view=__dfoDungeonNavModel.navigationGeometry(col);return{physical,navigation:cast(view),after:cast(col),floor:__dfoDungeonNavModel.floor(view,[3,0,6])};});assert.equal(masked.physical,2);assert.equal(masked.after,2);assert.ok(masked.navigation>3);assert.ok(masked.floor,'masking a control in the shared bucket preserves the actual floor');
 await page.keyboard.press('k');await dialog.waitFor();await dialog.getByRole('button',{name:'К ближайшему элитнику',exact:true}).click();await page.waitForFunction(()=>__dfoDungeonNavigation.state().phase==='following'&&__dfoDungeonNavigation.state().name==='Ближний');
 await page.evaluate(()=>fixture.foes[1].dead=true);await page.waitForFunction(()=>__dfoDungeonNavigation.state().name==='За стеной');
 await page.keyboard.press('k');await dialog.waitFor();const select=dialog.getByRole('combobox',{name:'Задание для навигации'});await select.focus();await select.evaluate(n=>window.savedNavSelect=n);await page.evaluate(()=>fixture.foes[0].entity.health=17);await page.waitForTimeout(750);assert.equal(await select.evaluate(n=>n===window.savedNavSelect&&document.activeElement===n),true,'automatic updates must preserve the live quest selector and focus');await select.selectOption('2');await dialog.getByRole('button',{name:'К цели задания',exact:true}).click();await page.waitForFunction(()=>__dfoDungeonNavigation.state().phase==='following'&&__dfoDungeonNavigation.state().uid==='2');assert.equal(await page.evaluate(()=>__dfoDungeonNavigation.state().name),'Цель 2');
 await page.evaluate(()=>fixture.quests.get(2).questComplete=true);await page.waitForFunction(()=>__dfoDungeonNavigation.state().phase==='unavailable');await page.keyboard.press('k');await dialog.waitFor();await dialog.getByRole('button',{name:'Убрать маршрут',exact:true}).click();assert.equal(await page.evaluate(()=>__dfoDungeonNavigation.state().phase),'idle');
 await page.setViewportSize({width:720,height:600});const foot=await dialog.locator('.acts').boundingBox();assert.ok(foot.y+foot.height<=600);await dialog.getByRole('button',{name:'К сундуку с аурумом',exact:true}).click();await page.waitForFunction(()=>__dfoDungeonNavigation.state().phase==='following');await page.evaluate(()=>fixture.live.aurum.open=true);await page.waitForFunction(()=>__dfoDungeonNavigation.state().phase==='unavailable');
 await page.evaluate(()=>fixture.modes.mode='exterior');await page.waitForFunction(()=>__dfoDungeonNavigation.state().phase==='idle');
 await page.goto(address+'/?door=1');await page.waitForFunction(()=>window.ready);await page.keyboard.press('k');await dialog.waitFor();await dialog.getByRole('button',{name:'К выходу',exact:true}).click();await page.waitForFunction(()=>__dfoDungeonNavigation.state().phase==='following');await page.waitForFunction(()=>fixture.passes>0);await page.evaluate(()=>{const d=fixture.ctx.actions.objects.get('door:1');d.currentLockValue=20;d.special=true;});await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>__dfoDungeonNavigation.state().phase),'following','a locked or secret door does not sever the planned route');
 await page.evaluate(()=>{const n=fixture.nav,I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];n.collider.addMesh('upper',new Float32Array([0,3,0,10,3,0,10,3,12,0,3,12]),new Uint16Array([0,1,2,0,2,3]),I);n.transitions=[{entrance:{pos:[11,1,6]},exit:{pos:[8,3.2,6]}}];fixture.ctx.exitDoors=[{pos:[2,3,6]}];__dfoDungeonNavigation.start('exit');});await page.waitForFunction(()=>__dfoDungeonNavigation.state().phase==='following'&&__dfoDungeonNavigation.state().distance>10,null,{timeout:30000});
 await page.evaluate(()=>fixture.feet.set([8,3,6]));await page.waitForFunction(()=>__dfoDungeonNavigation.state().phase==='following'&&__dfoDungeonNavigation.state().distance<10&&!/переход/.test(__dfoDungeonNavigation.state().message),null,{timeout:30000});
 const beforeRoomChange=await page.evaluate(()=>fixture.passes);await page.waitForFunction(n=>fixture.passes>n,beforeRoomChange);const changedRoom=await page.evaluate(()=>{const before=fixture.passes;fixture.session.room='dungeon:m54321';fixture.draw();return{draws:fixture.passes-before,phase:__dfoDungeonNavigation.state().phase};});assert.equal(changedRoom.draws,0,'the old route must not render in a new network room before the timer ticks');assert.equal(changedRoom.phase,'idle');
 await page.evaluate(async key=>{const db=await new Promise(resolve=>{const q=indexedDB.open('dfo-player-route-profiles',1);q.onsuccess=()=>resolve(q.result);});await new Promise(resolve=>{const tx=db.transaction('profiles','readwrite');tx.objectStore('profiles').put({key,profile:{points:[['bad']],links:[]}});tx.oncomplete=resolve;});db.close();},profileKey);
 const beforeNoWorker=graphWorkers;await page.goto(address+'/?no-worker=1');await page.waitForFunction(()=>window.ready);await page.keyboard.press('k');await dialog.waitFor();await dialog.getByRole('button',{name:'К выходу',exact:true}).click();await page.waitForFunction(()=>__dfoDungeonNavigation.state().phase==='following',null,{timeout:30000});await page.waitForFunction(()=>fixture.passes>0);assert.equal(graphWorkers,beforeNoWorker,'the cooperative graph fallback does not start a worker');assert.equal(workerRequests,0);assert.ok((await page.evaluate(()=>fixture.gpuCheck())).blue>20);
 assert.equal(await page.evaluate(async key=>{const db=await new Promise(resolve=>{const q=indexedDB.open('dfo-player-route-profiles',1);q.onsuccess=()=>resolve(q.result);});const row=await new Promise(resolve=>{const q=db.transaction('profiles').objectStore('profiles').get(key);q.onsuccess=()=>resolve(q.result);});db.close();return row.profile.points.every(p=>p.length===3&&p.every(Number.isFinite));},profileKey),true,'profiles survive reload and a corrupt cached profile is rebuilt');
 await page.evaluate(()=>{fixture.shaft();const ribbon=__dfoDungeonGraph.ribbon;__dfoDungeonGraph.ribbon=(ps,...args)=>{window.lastRoute=ps;return ribbon(ps,...args)};__dfoDungeonNavigation.start('exit');});
 await page.waitForFunction(()=>__dfoDungeonNavigation.state().phase==='following'&&window.lastRoute?.some((p,i,a)=>i&&p[1]-a[i-1][1]>2));
 assert.ok((await page.evaluate(()=>fixture.gpuCheck())).blue>20,'the vertical ribbon is visible in real WebGL');
 await page.evaluate(()=>{const ps=window.lastRoute,i=ps.findIndex((p,i)=>i&&p[1]-ps[i-1][1]>2);fixture.feet.set(ps[i].map((x,k)=>(x+ps[i-1][k])/2));});
 await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>__dfoDungeonNavigation.state().phase),'following');assert.ok((await page.evaluate(()=>fixture.gpuCheck())).blue>20,'climbing in midair does not erase the route');
 for(const fallback of [false,true]){
   await page.goto(address+(fallback?'/?no-worker=1':'/'));await page.waitForFunction(()=>window.ready);
   await page.evaluate(async()=>{fixture.loadComplex(await(await fetch('/fixture-complex.json')).json());const make=__dfoDungeonGraph.client;__dfoDungeonGraph.client=(...args)=>{const c=make(...args),route=c.route;c.route=async(...query)=>window.fullRoute=await route(...query);return c;};__dfoDungeonNavigation.start('exit');});
   await page.waitForFunction(()=>__dfoDungeonNavigation.state().phase==='following'&&window.fullRoute?.distance>150,null,{timeout:30000});
   await page.waitForFunction(()=>fixture.passes>0);
   const report=await page.evaluate(()=>({height:Math.max(...fullRoute.points.map(p=>p[1])),blocks:[...new Set(fullRoute.points.map(p=>Math.floor(p[0]/51.2)))],gpu:fixture.gpuCheck()}));
   assert.ok(report.height>7.1);assert.deepEqual(report.blocks,[0,1,2]);assert.ok(report.gpu.blue>20,JSON.stringify(report));
   let previous=await page.evaluate(()=>__dfoDungeonNavigation.state().distance);
   for(const block of [1,2]){
     await page.evaluate(block=>{const ps=fullRoute.points,i=ps.findIndex(p=>p[0]>block*51.2+4&&p[1]>(block===1?3.5:7.1));if(i<0)throw Error('missing block waypoint');fixture.feet.set(ps[i]);fixture.lookAlong(ps[i],ps[i+1]||ps[i]);},block);
     await page.waitForFunction(before=>__dfoDungeonNavigation.state().phase==='following'&&__dfoDungeonNavigation.state().distance<before,previous);previous=await page.evaluate(()=>__dfoDungeonNavigation.state().distance);
     assert.ok((await page.evaluate(()=>fixture.gpuCheck())).blue>20,'route remains visible on floor/block '+block);
   }
   const cleared=await page.evaluate(async()=>{fixture.loadComplex(await(await fetch('/fixture-complex-sealed.json')).json());const before=fixture.passes;fixture.draw();const draws=fixture.passes-before;__dfoDungeonNavigation.start('exit');return draws;});assert.equal(cleared,0,'replacing the layout removes the old route before the next tick');
   await page.waitForFunction(()=>__dfoDungeonNavigation.state().phase==='unavailable',null,{timeout:30000});assert.equal((await page.evaluate(()=>fixture.gpuCheck())).blue,0,'disconnected floors never get a fabricated line');
 }
 assert.equal(workerRequests,0);assert.deepEqual(errors,[]);console.log('PASS: published Collider and own graph worker/fallback; exact quest and live UI; cache repair; real WebGL depth and vertical ribbon; three floors across three blocks with stairs, ramp, rotated geometry and disconnected-floor control');
}catch(e){if(page)console.error('STATE',await page.evaluate(()=>({ready:window.ready,state:window.__dfoDungeonNavigation?.state(),text:document.body.innerText.slice(-2200),render:Object.keys(window.__dfoDungeonRender||{})})).catch(()=>null));throw e;}finally{await browser?.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
