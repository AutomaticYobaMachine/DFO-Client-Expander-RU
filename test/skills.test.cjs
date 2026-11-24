'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformAsset, injectPage } = require('../src/mod/transforms.cjs');

const SAMPLE_WORLD_TICK = `
function RL(e,t){let r=e.skills?.[t]??0,i=e.skillUses?.[t]??0,a=10;return{uses:i,needed:a,remaining:Math.max(0,a-i),capped:r>=100,ready:r<100&&i>=a}}
function zL(e,t=null){return Number.isFinite(t)?Math.max(0,Math.floor(e?.lastSkillCheckTime??0)+360+1-Math.floor(t)):0}
function LKe(e,{now:t=null}={}){if(!e?.chargenDone||!Array.isArray(e.skillUses)||zL(e,t)>0)return 0;let n=0;for(let t=0;t<e.skillUses.length;t++)RL(e,t).ready&&n++;return n}
function Fo(e){return(e.skills??[]).reduce((a,b)=>a+b,0)}
function FKe(e,t,n=Math.random,r=null,i=null,a=null,o=null){if(!e.chargenDone||t-(e.lastSkillCheckTime??0)<=360)return[];e.lastSkillCheckTime=t;let s=15,c=new Set([]),l=[],u=[];for(let t=0;t<e.skillUses.length;t++){if(c.has(t))continue;let n=RL(e,t);if(!(!n.ready||n.capped)){let n=(e.skills[t]??0)+1;e.skills[t]=n,e.skillUses[t]=0,l.push({skillIdx:t,newVal:n,name:'Skill'+t})}}if(l.length){let t=Fo(e);e.currentLevelUpSkillSum>=t||(e.currentLevelUpSkillSum=t);e.totalSkillUps=(e.totalSkillUps??0)+l.length}return l}
`;

const SAMPLE_WAGON_KINDS = `
function Ct(e,t,n=1,r=!1){if(!e.skillUses)return;if(r){e.skillUses[t]=(e.skillUses[t]||0)+n;return}e.skillUses[t]=(e.skillUses[t]||0)+n,e.skillUses[t]>2e4&&(e.skillUses[t]=2e4)}
`;

test('skills transforms: instant HUD readiness, no false 6h timer reset, and exact 360-minute (6h) rest advancement', () => {
  const r1 = transformAsset('assets/worldTick-DRJ5YnrH.js', SAMPLE_WORLD_TICK, {});
  const hooks1 = Object.fromEntries(r1.log);
  assert.equal(hooks1['skills.ready'], 1);
  assert.equal(hooks1['skills.wait'], 1);
  assert.equal(hooks1['skills.advance'], 1);

  const r2 = transformAsset('assets/wagonKinds-BjeaXBe7.js', SAMPLE_WAGON_KINDS, {});
  const hooks2 = Object.fromEntries(r2.log);
  assert.equal(hooks2['skills.tally'], 1);

  // Worker bundle must not be touched by skills.tally
  const rWorker = transformAsset('assets/classicDungeonWorker-Ca7zG7z3.js', SAMPLE_WAGON_KINDS, {});
  assert.equal(Object.fromEntries(rWorker.log)['skills.tally'] ?? 0, 0);

  let soundCount = 0;
  const hudStackChildren = [];
  const sandbox = {
    Math,
    Number,
    Array,
    Set,
    Object,
    String,
    Date: { now: () => 100000 + soundCount * 1000 },
    setTimeout: () => {},
    Audio: function FakeAudio() {
      return {
        volume: 1,
        play() {
          soundCount++;
          return Promise.resolve();
        },
      };
    },
    document: {
      querySelector(sel) {
        if (sel === '.hud-adv-skill') return hudStackChildren[0] || null;
        if (sel === '.hud-adv-stack') {
          return {
            appendChild(el) {
              hudStackChildren.push(el);
            },
          };
        }
        return null;
      },
      createElement(tag) {
        return {
          tag,
          style: {},
          attrs: {},
          setAttribute(k, v) { this.attrs[k] = v; },
          addEventListener() {},
        };
      },
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;

  const pageScript = fs.readFileSync(path.join(__dirname, '../src/mod/page/dfo_skills.js'), 'utf8');
  vm.runInNewContext(pageScript, sandbox);
  vm.runInNewContext(r1.text + '\n' + r2.text, sandbox);

  const player = {
    characterId: 'hero-1',
    chargenDone: true,
    lastSkillCheckTime: 1000,
    skills: [30, 40],
    skillUses: [9, 0],
  };

  // Initial HUD sync at t = 1050 (only 50 minutes after lastSkillCheckTime): 0 skills ready.
  assert.equal(sandbox.LKe(player, { now: 1050 }), 0);
  assert.equal(soundCount, 0);

  // Player rests 1 hour at t = 1060 (only 60 minutes after 1000, cooldown is 360 min):
  // FKe returns [] immediately and does not overwrite lastSkillCheckTime.
  assert.equal(sandbox.FKe(player, 1060).length, 0);
  assert.equal(player.lastSkillCheckTime, 1000, 'lastSkillCheckTime must not reset when cooldown is not met');

  // Even if lastSkillCheckTime was 1400 (only 100 minutes ago at t = 1500),
  // reaching 10 uses via Ct (tallySkill) must IMMEDIATELY trigger the sound, show the HUD icon,
  // and LKe must return 1 right away without waiting 6 hours!
  player.lastSkillCheckTime = 1400;
  sandbox.Ct(player, 0, 1, false);
  assert.equal(soundCount, 1, 'sound must play the exact instant a skill reaches readiness');
  assert.equal(hudStackChildren.length, 1, 'yellow HUD icon must be injected immediately');
  assert.equal(sandbox.LKe(player, { now: 1500 }), 1, 'LKe must report 1 ready skill immediately even with cooldown > 0');

  // If player rests only 2 hours (120 min, t = 1520 -> 220m since 1300 < 360m), skill does not advance yet
  // and the yellow HUD icon stays visible (LKe still returns 1).
  assert.equal(sandbox.FKe(player, 1520).length, 0);
  assert.equal(sandbox.LKe(player, { now: 1520 }), 1, 'yellow HUD icon must persist until 6h rest completes');

  // Player now rests 6 hours from lastSkillCheckTime = 1400 -> t = 1400 + 360 = 1760 (exact 360m = 6h!).
  const raised = sandbox.FKe(player, 1760);
  assert.equal(raised.length, 1, 'exact 6-hour (360 min) rest must advance the skill');
  assert.equal(raised[0].skillIdx, 0);
  assert.equal(raised[0].newVal, 31);
  assert.equal(player.lastSkillCheckTime, 1760);
  assert.equal(sandbox.LKe(player, { now: 1760 }), 0, 'HUD icon clears once the skill has leveled up');
  assert.equal(soundCount, 2, 'sound plays on skill level-up');
});

test('injectPage includes dfo_skills.js and boosted skill_up.wav exists with valid RIFF WAVE header', () => {
  const html = injectPage('<html><head></head><body><script type="module" src="./main.js"></script></body></html>', './', {});
  assert.match(html, /dfo-mod\/dfo_skills\.js/);

  const wavPath = path.join(__dirname, '../src/mod/sfx/skill_up.wav');
  const buf = fs.readFileSync(wavPath);
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WAVE');
  assert.ok(buf.length > 200000);
});

const LIVE_ASAR = 'C:\\Games\\DaggerfallGameFiles\\DFO\\DFO Online\\resources\\app.asar';
test('skills transforms match live DFO app.asar bundles cleanly', { skip: !fs.existsSync(LIVE_ASAR) }, () => {
  const { openAsar, readFile, listFiles } = require('../src/asar.cjs');
  const a = openAsar(LIVE_ASAR);
  try {
    const files = [...listFiles(a.header).keys()];
    const wtFile = files.find((f) => f.startsWith('dist/assets/worldTick-') && f.endsWith('.js'));
    const wkFile = files.find((f) => f.startsWith('dist/assets/wagonKinds-') && f.endsWith('.js'));
    assert.ok(wtFile, 'worldTick bundle present');
    assert.ok(wkFile, 'wagonKinds bundle present');

    const wtRes = transformAsset(wtFile.replace(/^dist\//, ''), readFile(a, wtFile).toString('utf8'), {});
    const wtHooks = Object.fromEntries(wtRes.log);
    assert.equal(wtHooks['skills.ready'], 1);
    assert.equal(wtHooks['skills.wait'], 1);
    assert.equal(wtHooks['skills.advance'], 1);

    const wkRes = transformAsset(wkFile.replace(/^dist\//, ''), readFile(a, wkFile).toString('utf8'), {});
    const wkHooks = Object.fromEntries(wkRes.log);
    assert.equal(wkHooks['skills.tally'], 1);
  } finally {
    a.close();
  }
});

