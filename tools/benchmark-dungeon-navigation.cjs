'use strict';
// Read-only benchmark with the original client's model repairs and real player collider.
// DFO_UPSTREAM_DIR=... ARENA2_PATH=... node tools/benchmark-dungeon-navigation.cjs
const G=require('../src/mod/page/dfo_dungeon_graph.js'),M=require('../src/mod/page/dfo_dungeon_nav_model.js');
const {realDungeon,realBlock}=require('../test/helpers/dungeon-navigation.cjs');
if(!process.env.DFO_UPSTREAM_DIR||!process.env.ARENA2_PATH)throw Error('Set DFO_UPSTREAM_DIR and ARENA2_PATH to the original source and your ARENA2 files.');
(async()=>{
  const out={engine:'player milestone graph',scenes:[]},pause=async()=>new Promise(setImmediate);
  async function measure(name,r,queries){
    const at=performance.now(),g=new G.Graph(),input=await G.snapshot(M.navigationGeometry(r.col),r.actions,pause);await g.build(input,pause);
    const scene={name,triangles:input.total/9,parts:input.parts.length,nodes:g.nodes.length,prepareMs:Math.round(performance.now()-at),queries:[]};
    for(const q of queries)for(let run=0;run<2;run++){
      const t=performance.now(),route=await g.route(q.from,[{key:q.key,at:q.at}],r.transitions||[],pause);
      scene.queries.push({goal:q.key,cached:!!run,ms:Math.round(performance.now()-t),distance:route?Math.round(route.distance*10)/10:null,kinds:route?[...new Set(route.kinds)]:[],testedEdges:g.tested});
      if(!route)throw Error('No route for '+name+' '+q.key);
    }
    out.scenes.push(scene);
  }
  const dungeon=await realDungeon();await measure("Privateer's Hold",dungeon,dungeon.anchors.slice(0,2).map((at,i)=>({key:'enemy-marker-'+i,from:dungeon.from,at})));
  const block=await realBlock('S0000140.RDB');await measure('S0000140.RDB elevator 74013',block,[{key:'down',from:[24,12.8,25.6],at:[24,0,25.6]},{key:'up',from:[24,0,25.6],at:[24,12.8,25.6]}]);
  console.log(JSON.stringify(out,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
