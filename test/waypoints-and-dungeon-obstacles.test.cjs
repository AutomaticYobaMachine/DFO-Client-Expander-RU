'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { transformAsset, EXPECTED, expectedHooks } = require('../src/mod/transforms.cjs');
const G = require('../src/mod/page/dfo_dungeon_graph.js');
const M = require('../src/mod/page/dfo_dungeon_nav_model.js');

const SAMPLE_PROP_BODIES = `
function cacheBlock(o,n,i){o.size>=64&&o.delete(o.keys().next().value),o.set(n,i)}
var sO=\`dfjs.waypoints\`,oO=Object.freeze([\`personal\`,\`party\`,\`guild\`]),dO={defaultName:e=>\`Waypoint \${e}\`};
var listState={list:[]},seq=0;
function EO(){return listState}
function LO(){let e=new Set(EO().list.map(e=>e.name));for(let t=1;t<1e3;t++){let n=dO.defaultName(t);if(!e.has(n))return n}return\`Waypoint\`}
function VO(id){listState.list=listState.list.filter(x=>x.id!==id);return true}
function RO({kind:e=\`personal\`,mx:t,my:n,name:r,color:i,by:a=\`\`}){let o=oO.includes(e)?e:\`personal\`,s=EO(),c=s.list.filter(e=>e.kind===o&&e.mine);c.length>=64&&VO(c[0].id,{quiet:!0});let l={id:'wp-'+(++seq),kind:o,name:r||LO(),mx:t,my:n,mine:!0};return s.list.push(l),l}
`;

function boxMesh(x0, x1, y0, y1, z0, z1) {
  const v = [
    x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0,
    x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1,
  ];
  const idx = [
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4,
    3, 7, 6, 3, 6, 2,
    0, 4, 7, 0, 7, 3,
    1, 2, 6, 1, 6, 5,
  ];
  const positions = Float32Array.from(v);
  const indices = Uint16Array.from(idx);
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { normals[k] += nx; normals[k + 1] += ny; normals[k + 2] += nz; }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= l; normals[i + 1] /= l; normals[i + 2] /= l;
  }
  return { positions, indices, normals };
}

function makeCollider() {
  const _buckets = new Map();
  const baseId = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  function addBox(key, x0, x1, y0, y1, z0, z1) {
    const { positions, indices } = boxMesh(x0, x1, y0, y1, z0, z1);
    addRaw(key, positions, indices);
  }
  function addRaw(key, positions, indices, offset = [0, 0, 0]) {
    const tris = [];
    for (let i = 0; i < indices.length; i += 3) {
      const tri = [];
      for (let j = 0; j < 3; j++) {
        const id = indices[i + j] * 3;
        tri.push([positions[id] + offset[0], positions[id + 1] + offset[1], positions[id + 2] + offset[2]]);
      }
      tris.push(tri);
    }
    _buckets.set(key, { tris, part: new Array(tris.length).fill(0), parts: 1, t: () => [0, 0, 0], r: () => null });
  }
  function raycastHit(origin, dir, max, opts = {}) {
    const skip = new Set(opts?.skip || []);
    let best = Infinity, hitKey = null, hitNormal = null;
    for (const [key, b] of _buckets) {
      if (skip.has(key)) continue;
      for (const [a, c1, c2] of b.tris) {
        const e1 = [c1[0] - a[0], c1[1] - a[1], c1[2] - a[2]];
        const e2 = [c2[0] - a[0], c2[1] - a[1], c2[2] - a[2]];
        const p = [dir[1] * e2[2] - dir[2] * e2[1], dir[2] * e2[0] - dir[0] * e2[2], dir[0] * e2[1] - dir[1] * e2[0]];
        const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
        if (Math.abs(det) < 1e-10) continue;
        const inv = 1 / det, tvec = [origin[0] - a[0], origin[1] - a[1], origin[2] - a[2]];
        const u = (tvec[0] * p[0] + tvec[1] * p[1] + tvec[2] * p[2]) * inv;
        if (u < -1e-5 || u > 1 + 1e-5) continue;
        const q = [tvec[1] * e1[2] - tvec[2] * e1[1], tvec[2] * e1[0] - tvec[0] * e1[2], tvec[0] * e1[1] - tvec[1] * e1[0]];
        const v = (dir[0] * q[0] + dir[1] * q[1] + dir[2] * q[2]) * inv;
        if (v < -1e-5 || u + v > 1 + 1e-5) continue;
        const dist = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
        if (dist > 1e-4 && dist <= max && dist < best) {
          best = dist;
          hitKey = key;
          const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
          const nl = Math.hypot(nx, ny, nz) || 1;
          hitNormal = [nx / nl, ny / nl, nz / nl];
        }
      }
    }
    return hitKey ? { dist: best, key: hitKey, normal: hitNormal } : null;
  }
  return { _buckets, addBox, addRaw, raycastHit, baseId };
}

test('waypoints transforms raise manual per-kind cap from 64 to 512 without touching LRU block cache', () => {
  assert.deepEqual(EXPECTED.waypoints, ['waypoints.limit', 'waypoints.names']);
  assert.ok(expectedHooks({}).includes('waypoints.limit'));
  assert.equal(expectedHooks({ waypoints: false }).includes('waypoints.limit'), false);

  const res = transformAsset('assets/propBodies-test.js', SAMPLE_PROP_BODIES, {});
  const hooks = Object.fromEntries(res.log);
  assert.equal(hooks['waypoints.limit'], 1);
  assert.equal(hooks['waypoints.names'], 1);
  assert.match(res.text, /o\.size>=64&&o\.delete/);

  const sb = { Object, Set, Array, console };
  vm.runInNewContext(res.text, sb);
  for (let i = 0; i < 600; i++) sb.RO({ kind: 'personal', mx: 100 + i, my: 200 });
  const personal = sb.listState.list.filter(w => w.kind === 'personal');
  assert.equal(personal.length, 512);
  assert.equal(personal[0].mx, 188);
  assert.equal(personal.at(-1).mx, 699);

  // Separate kind maintains its own 512 cap independently
  for (let i = 0; i < 70; i++) sb.RO({ kind: 'guild', mx: 50 + i, my: 50 });
  assert.equal(sb.listState.list.filter(w => w.kind === 'guild').length, 70);

  // Default naming works beyond Waypoint 1000 across kinds without eviction (500 + 500 + 50 = 1050)
  sb.listState.list = [];
  for (let i = 1; i <= 500; i++) sb.RO({ kind: 'personal', mx: i, my: 10 });
  for (let i = 1; i <= 500; i++) sb.RO({ kind: 'party', mx: i, my: 20 });
  for (let i = 1; i <= 50; i++) sb.RO({ kind: 'guild', mx: i, my: 30 });
  assert.equal(sb.listState.list.length, 1050);
  assert.equal(sb.listState.list.at(-1).name, 'Waypoint 1050');
});

test('dungeon route & goalReached handle barred cages for foes and plinth items while blocking sealed rooms', async () => {
  const col = makeCollider();
  // Room floor: [0..16, y=0, 0..16]
  col.addBox('floor', 0, 16, -0.5, 0, 0, 16);
  // Cage at center (8, 0, 8): 3.6 x 2.55 x 2.4m with 0.35m solid plinth & roof & corner/center vertical bars
  col.addBox('cage-plinth', 6.2, 9.8, 0, 0.35, 6.725, 9.275);
  col.addBox('cage-roof', 6.2, 9.8, 2.35, 2.45, 6.725, 9.275);
  for (const [bx, bz] of [
    [6.2, 6.725], [7.95, 6.725], [9.7, 6.725],
    [6.2, 9.175], [7.95, 9.175], [9.7, 9.175],
    [6.2, 7.95], [9.7, 7.95],
  ]) {
    col.addBox(`bar-${bx}-${bz}`, bx, bx + 0.1, 0.35, 2.35, bz, bz + 0.1);
  }
  // Completely walled + roofed closed vault at [12.5..15.5, 0..3, 12.5..15.5]
  col.addBox('vault-n', 12.5, 15.5, 0, 3, 12.5, 12.8);
  col.addBox('vault-s', 12.5, 15.5, 0, 3, 15.2, 15.5);
  col.addBox('vault-w', 12.5, 12.8, 0, 3, 12.5, 15.5);
  col.addBox('vault-e', 15.2, 15.5, 0, 3, 12.5, 15.5);
  col.addBox('vault-roof', 12.5, 15.5, 3, 3.5, 12.5, 15.5);

  const actions = { objects: new Map() };
  const g = new G.Graph();
  await g.build(await G.snapshot(col, actions));

  // Case 1a: Quest foe (no explicit reach) inside barred cage with disconnected interior plinth floor
  const rFoe = await g.route([2, 0, 8], [{ kind: 'quest', at: [8, 0.05, 8] }]);
  assert.ok(rFoe, 'Expected outside-bars fallback route to caged foe');
  const endFoe = rFoe.points.at(-1);
  assert.ok(G.dist(endFoe, [8, 0.05, 8]) <= 2.45);
  assert.ok(endFoe[0] < 6.2 || endFoe[0] > 9.8 || endFoe[2] < 6.725 || endFoe[2] > 9.275, 'Stop outside cage perimeter');
  assert.equal(M.goalReached({ kind: 'quest', reach: 2.45, at: [8, 0.05, 8] }, endFoe, col), true);

  // Case 1b: Quest item (reach: 2.25) inside cage on 0.35m plinth
  const rItem = await g.route([2, 0, 8], [{ kind: 'quest', at: [8, 0.05, 8], reach: 2.25 }]);
  assert.ok(rItem, 'Expected route to item on cage plinth');
  assert.equal(M.goalReached({ kind: 'quest', reach: 2.25, at: [8, 0.05, 8] }, rItem.points.at(-1), col), true);

  // Case 1c: Solid walled room must remain unreachable
  const rVaultFoe = await g.route([2, 0, 8], [{ kind: 'quest', at: [14, 0, 14] }]);
  const rVaultItem = await g.route([2, 0, 8], [{ kind: 'quest', at: [14, 0, 14], reach: 2.25 }]);
  assert.equal(rVaultFoe, null);
  assert.equal(rVaultItem, null);
});

test('Geometry.ray catches diagonal Float32 triangle seam across bar quad', async () => {
  // Single rectangular vertical bar face split diagonally with Float32 seam offset
  const pos = Float32Array.from([
    16.85, 13.15, 6.55,
    16.85, 15.30, 6.55,
    16.925, 15.30, 6.675,
    16.85, 13.15, 6.55,
    16.925, 15.30, 6.675,
    16.85, 15.30, 6.675,
  ]);
  const geo = new G.Geometry(pos);
  await geo.index(async () => {});
  const eye = [16.056497115745557, 14.400000190734863, 7.34350288425444];
  const end = [17.40, 13.88, 6.00];
  const d = end.map((x, i) => x - eye[i]), len = Math.hypot(...d);
  assert.ok(geo.ray(eye, d.map(x => x / len), len), 'Ray across bar quad hypotenuse must not slip through Float32 crack');
});

test('lever-moved walls & rotating hatches block when closed, ignore mid-animation churn, and open on settle', async () => {
  const col = makeCollider();
  col.addBox('floor-hi-w', 0, 6, -0.5, 0, 0, 10);
  col.addBox('floor-hi-e', 9.2, 16, -0.5, 0, 0, 10);
  col.addBox('ceiling', 0, 16, 4, 4.5, 0, 10);
  col.addBox('floor-lo', 6, 9.2, -2.0, -1.5, 3.4, 6.6);
  // Side pit walls so access to pit center (7.6, -1.5, 5) is via drop through hatch [6..9.2, 0, 3.4..6.6]
  col.addBox('hatch-n', 6, 9.2, -1.5, 0, 0, 3.4);
  col.addBox('hatch-s', 6, 9.2, -1.5, 0, 6.6, 10);

  // 1) Rotating hatch 54001 covering [6..9.2, 0..0.15, 3.4..6.6]
  const hatchMesh = boxMesh(6, 9.2, 0, 0.15, 3.4, 6.6);
  const hatchObj = {
    key: 'act:blk:hatch', kind: 'action', modelIdNum: 54001,
    cpu: hatchMesh, base: col.baseId,
    translation: { x: 0, y: 0, z: 0 }, rotation: { x: -135, y: 0, z: 0 }, state: 'start',
  };
  col.addRaw(hatchObj.key, hatchMesh.positions, hatchMesh.indices);

  // 2) Vertical moving wall 61025 blocking x=12 across y=0..4 (drops y=-6 when end)
  const wallMesh = boxMesh(11.6, 12.4, 0, 4, 0, 10);
  const wallObj = {
    key: 'act:blk:wall', kind: 'action', modelIdNum: 61025,
    cpu: wallMesh, base: col.baseId,
    translation: { x: 0, y: -6, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, state: 'start',
  };
  col.addRaw(wallObj.key, wallMesh.positions, wallMesh.indices);

  // 3) Lever control 61028 + Door + Real 4x0.5x4 Lift deck
  const leverObj = { key: 'act:blk:lever', kind: 'action', modelIdNum: 61028, state: 'start' };
  const doorObj = { key: 'act:blk:door', kind: 'door', state: 'start' };
  const liftMesh = boxMesh(1, 5, 0, 0.5, 1, 5);
  const liftObj = {
    key: 'act:blk:lift', kind: 'action', modelIdNum: 74013,
    cpu: liftMesh, base: col.baseId,
    translation: { x: 0, y: 6, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, state: 'start',
  };
  col.addRaw(liftObj.key, liftMesh.positions, liftMesh.indices);

  const actions = {
    collider: col,
    objects: new Map([
      [hatchObj.key, hatchObj], [wallObj.key, wallObj],
      [leverObj.key, leverObj], [doorObj.key, doorObj], [liftObj.key, liftObj],
    ]),
  };

  assert.equal(G.actionRole(hatchObj, col), 'obstacle');
  assert.equal(G.actionRole(wallObj, col), 'obstacle');
  assert.equal(G.actionRole(leverObj, col), 'control');
  assert.equal(G.actionRole(doorObj, col), 'door');
  assert.equal(G.actionRole(liftObj, col), 'lift');

  const skip = M.routingSkip(actions, col);
  assert.equal(skip.includes(hatchObj.key), false);
  assert.equal(skip.includes(wallObj.key), false);
  assert.ok(skip.includes(leverObj.key));
  assert.ok(skip.includes(doorObj.key));
  assert.ok(skip.includes(liftObj.key));

  // Closed hatch blocks recess & closed wall blocks east side
  const revStart = G.revision(col, actions);
  let g = new G.Graph();
  await g.build(await G.snapshot(col, actions));
  assert.equal(await g.route([4, 0, 5], [{ kind: 'quest', at: [7.6, -1.5, 5], reach: 2.25 }]), null);
  assert.equal(await g.route([10.5, 0, 5], [{ kind: 'quest', at: [14, 0, 5] }]), null);

  // Mid-animation must NOT bump revision; lift state toggle must NOT bump revision
  hatchObj.state = 'forward';
  wallObj.state = 'forward';
  liftObj.state = 'end';
  assert.equal(G.revision(col, actions), revStart);

  // Settled open ('end') bumps revision & clears obstacles cleanly
  hatchObj.state = 'end';
  wallObj.state = 'end';
  col._buckets.delete(hatchObj.key);
  col.addBox(hatchObj.key, 6, 9.2, 0, 2.3, 3.0, 3.4); // rotated open vertically at hinge
  col._buckets.delete(wallObj.key);
  col.addBox(wallObj.key, 11.6, 12.4, -6, -2, 0, 10); // lowered under floor
  const revOpen = G.revision(col, actions);
  assert.ok(revOpen > revStart);

  g = new G.Graph();
  await g.build(await G.snapshot(col, actions));
  const rRecess = await g.route([4, 0, 5], [{ kind: 'quest', at: [7.6, -1.5, 5], reach: 2.25 }]);
  assert.ok(rRecess, 'Opened hatch allows dropping/reaching into recess without phantom closed lid');
  const rWall = await g.route([10.5, 0, 5], [{ kind: 'quest', at: [14, 0, 5] }]);
  assert.ok(rWall && rWall.kinds.includes('walk'), 'Lowered wall opens path across corridor');
});

test('revision rebuilds when an obstacle is first observed mid-animation and later settles to start or end', () => {
  const col = makeCollider();
  col.addBox('floor', 0, 10, -0.5, 0, 0, 10);
  const wallMesh = boxMesh(4.5, 5.5, 0, 4, 0, 10);
  const closingWall = {
    key: 'act:blk:closing', kind: 'action', modelIdNum: 61025,
    cpu: wallMesh, base: col.baseId,
    translation: { x: 0, y: -6, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, state: 'reverse',
  };
  col.addRaw(closingWall.key, wallMesh.positions, wallMesh.indices);
  const actions = { collider: col, objects: new Map([[closingWall.key, closingWall]]) };

  const revMid1 = G.revision(col, actions);
  // Continuing mid-animation must NOT churn revision
  const revMid2 = G.revision(col, actions);
  assert.equal(revMid2, revMid1);

  // Settling back to 'start' MUST bump revision (previously stuck forever)
  closingWall.state = 'start';
  const revSettledStart = G.revision(col, actions);
  assert.ok(revSettledStart > revMid1, 'Settling from initial reverse -> start must bump revision');
  assert.equal(G.revision(col, actions), revSettledStart);
});

test('navigationGeometry caches masked static buckets across moving bucket swaps and invalidates on notePlacement', () => {
  class MiniCollider {
    constructor() { this._buckets = new Map(); }
    raycastHit() { return null; }
  }
  const col = new MiniCollider();
  const tri = [[0, 0, 0], [1, 0, 0], [0, 0, 1]];
  const dungeonBucket = { tris: [tri, tri, tri], part: [0, 1, 2], parts: 3, t: () => [0, 0, 0], r: () => null };
  col._buckets.set('dungeon', dungeonBucket);
  col._buckets.set('door:1', { tris: [tri], part: [0], parts: 1, t: () => [0, 0, 0], r: () => null });

  // Note part index 1 (control 61032) on 'dungeon'
  dungeonBucket.parts = 1;
  M.notePlacement(col, 'dungeon', { modelIdNum: 61032 });
  dungeonBucket.parts = 3;

  const v1 = M.navigationGeometry(col);
  assert.equal(v1._buckets.get('dungeon').tris.length, 2);
  assert.equal(M.navigationGeometry(col), v1, 'Unchanged collider returns exact cached view');

  // Swap moving door bucket object -> new view, but static masked 'dungeon' bucket is reused without refiltering
  col._buckets.set('door:1', { tris: [tri], part: [0], parts: 1, t: () => [1, 0, 0], r: () => null });
  const v2 = M.navigationGeometry(col);
  assert.notEqual(v2, v1);
  assert.equal(v2._buckets.get('dungeon'), v1._buckets.get('dungeon'), 'Static masked dungeon bucket must be reused across moving bucket swaps');

  // Noting another control part on 'dungeon' invalidates the cached masked bucket
  dungeonBucket.parts = 2;
  M.notePlacement(col, 'dungeon', { modelIdNum: 61028 });
  dungeonBucket.parts = 3;
  const v3 = M.navigationGeometry(col);
  assert.equal(v3._buckets.get('dungeon').tris.length, 1);
});

test('Graph.route Pass 2 reuses Pass 1 exhausted shortest-path tree through a portal to a caged foe', async () => {
  const col = makeCollider();
  // Room A: [0..8, y=0, 0..8], Room B (separated by void): [20..36, y=0, 0..16]
  col.addBox('room-a', 0, 8, -0.5, 0, 0, 8);
  col.addBox('room-b', 20, 36, -0.5, 0, 0, 16);
  // Barred cage in Room B centered at (28, 0, 8)
  col.addBox('cage-plinth', 26.2, 29.8, 0, 0.35, 6.725, 9.275);
  col.addBox('cage-roof', 26.2, 29.8, 2.35, 2.45, 6.725, 9.275);
  for (const [bx, bz] of [
    [26.2, 6.725], [27.95, 6.725], [29.7, 6.725],
    [26.2, 9.175], [27.95, 9.175], [29.7, 9.175],
    [26.2, 7.95], [29.7, 7.95],
  ]) {
    col.addBox(`bar-${bx}-${bz}`, bx, bx + 0.1, 0.35, 2.35, bz, bz + 0.1);
  }
  const g = new G.Graph();
  await g.build(await G.snapshot(col, { objects: new Map() }));
  const transitions = [{ entrance: { pos: [6, 0, 4] }, exit: { pos: [22, 0, 8] } }];
  const r = await g.route([2, 0, 4], [{ kind: 'quest', at: [28, 0.05, 8] }], transitions);
  assert.ok(r && r.transition, 'Expected route through portal to caged foe in Room B');
  assert.ok(G.dist(r.transition.from, [6, 0, 4]) < 0.5);
  assert.ok(G.dist(r.transition.to, [22, 0, 8]) < 0.5);
});

test('cloudTrail minimal+out mode matches standard cloudTrail byte-for-byte and bodyBlocked accepts Set skip', () => {
  const pts = [];
  for (let i = 0; i <= 40; i++) pts.push([i * 2.5, (i % 4) * 0.25, Math.sin(i * 0.3) * 3]);
  const full = G.cloudTrail(pts, 4.25, { alpha: 0.92, dissipate: 0.15, lift: 1.0, playerPos: pts[0] });
  const holder = { buf: new Float32Array(0) };
  const min = G.cloudTrail(pts, 4.25, { alpha: 0.92, dissipate: 0.15, lift: 1.0, playerPos: pts[0], minimal: true, out: holder });
  assert.equal(min.count, full.count);
  assert.equal(min.vertices.length, full.vertices.length);
  for (let i = 0; i < full.vertices.length; i++) assert.equal(min.vertices[i], full.vertices[i]);
  assert.deepEqual(min.lights, full.lights);

  const col = makeCollider();
  col.addBox('wall', 2, 2.5, 0, 3, -2, 2);
  assert.ok(G.bodyBlocked(col, [0, 0, 0], [4, 0, 0], []));
  assert.equal(G.bodyBlocked(col, [0, 0, 0], [4, 0, 0], ['wall']), null);
  assert.equal(G.bodyBlocked(col, [0, 0, 0], [4, 0, 0], new Set(['wall'])), null);
});
