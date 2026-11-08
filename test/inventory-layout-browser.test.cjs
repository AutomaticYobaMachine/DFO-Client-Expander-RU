'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { pathToFileURL } = require('node:url');

const mod = fs.readFileSync(path.join(__dirname, '../src/mod/page/dfo_pack.js'), 'utf8');
const browsers = [process.env.CHROMIUM_BIN, 'chromium', 'google-chrome', 'chromium-browser'].filter(Boolean);
const browser = browsers.find((name) => cp.spawnSync(name, ['--version'], { encoding: 'utf8' }).status === 0);

function measure(paired) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfo-pack-geometry-'));
  try {
    const html = [
      '<!doctype html><html lang="ru"><head><meta charset="utf-8">',
      '<style>',
      'html,body{margin:0;width:100%;height:100%;background:#18191d;font:12px sans-serif}',
      '.pack-shell{position:fixed;inset:0;display:grid;place-items:center}',
      '.pack-win{width:min(1040px,95vw);height:660px;display:flex;flex-direction:column;box-sizing:border-box;border:2px solid #716447;background:#0c0e12}',
      '.pack-id{display:flex;align-items:center;gap:5px;height:54px;padding:5px 12px;box-sizing:border-box}',
      '.pack-id h2{display:flex;gap:10px;align-items:center;font-size:18px;margin:0;color:#edca81}',
      '.pack-id .act{white-space:nowrap;padding:6px 8px;font-size:12px}',
      '.pack{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,380px)}',
      '.pack-main{min-width:0;background:#080a0d;padding:10px;box-sizing:border-box;color:#d3c7aa}',
      '.pack-dock{min-width:0;display:flex;flex-direction:column;border-left:2px solid #777;background:#0c0e11}',
      '.packcats{min-width:0;display:flex;flex-wrap:wrap;gap:2px;padding:0 8px;box-sizing:border-box}',
      '.packtabs{display:grid;grid-template-columns:repeat(3,1fr);width:100%;margin:0}',
      '.packtab{display:flex;min-width:0;overflow:hidden;white-space:nowrap;padding:2px 4px;font:11px sans-serif;color:#b8a77c}',
      '.packtab .count{display:block;font-size:10px;margin-left:auto}',
      '.packlists{flex:1;min-height:0;overflow:auto}',
      '.packcol{padding:6px 8px;display:flex;flex-wrap:wrap;gap:8px;box-sizing:border-box}',
      '.itemrow{height:52px;border:1px solid #7a6041;box-sizing:border-box;color:#c9b78f;min-width:0}',
      '</style></head><body>',
      '<script>',
      'window.__DFO_MOD_CFG__ = { inventory: { enabled: true } };',
      'window.__dfoPackRules = {',
      '  cleanState: function() { return { view:"rows", autoSort:true, junk:{tags:[]},revision:0}; },',
      '  cleanSettings: function(s) { return s; }',
      '};',
      'const names = {"pack.view.rows":"СПИСОК","pack.view.grid":"ЗНАЧКИ","pack.sort.auto":"АВТОСОРТИРОВКА","pack.junk.button":"ХЛАМ..."};',
      'window.__dfoUi = { t: function(k) { return names[k] || k; } };',
      '</script>',
      '<script>', mod.replace(/<\/script/gi, '<\\/script'), '</script>',
      '<script>',
      '(function(){',
      'const el = (tag,cls,txt) => {const n=document.createElement(tag); n.className=cls||""; if(txt)n.textContent=txt; return n;};',
      'const shell=el("div", ' + JSON.stringify('pack-shell' + (paired ? ' paired' : '')) + ');',
      'const win=el("div","pack-win"); const head=el("header","pack-id");',
      'const name=el("div",""); const title=el("h2","","Pack");title.append(el("span","pack-who","VANAL ORAN"));name.append(title);head.append(name);',
      'head.append(el("button","act","СОРТИРОВАТЬ"),el("button","act","КОДЕКС"));',
      'const close=el("button","act","ЗАКРЫТЬ");',
      'win.append(head);',
      'window.__dfoPack.head(head,function(){});head.append(close);',
      'const grid=el("div","pack"); const main=el("div","pack-main","ЭКИПИРОВКА");',
      'const dock=el("div","pack-dock"), shelf=el("section","packcol packcats"), tabs=el("div","packtabs");',
      'const labels=["ОРУЖИЕ","БРОНЯ","ОДЕЖДА","ЗЕЛЬЯ","ИНГРЕДИЕНТЫ","КНИГИ","ЦЕННОСТИ","РАЗНОЕ","ХЛАМ"];',
      'labels.forEach((name,i)=>{const b=el("button","packtab",name); b.append(el("span","count",String([2,0,0,2,0,9,1,22,1][i]))); tabs.append(b)});',
      'shelf.append(tabs); const lists=el("div","packlists"), items=el("section","packcol");',
      'for(let i=0;i<4;i++)items.append(el("div","itemrow","ПРЕДМЕТ "+i));',
      'lists.append(items);dock.append(shelf,lists);grid.append(main,dock);win.append(grid);shell.append(win);document.body.append(shell);',
      '// Native styles can be inserted AFTER the mod stylesheet. They used to win over the unforced inner grid.',
      'const late=document.createElement("style");',
      'late.textContent="html[data-dfo-pack] .pack-shell:not(.paired) .pack {grid-template-columns:minmax(0,1fr) 380px !important}";',
      'document.head.append(late);',
      'Promise.resolve().then(()=>requestAnimationFrame(()=>{',
      ' const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right}};',
      ' const all=[...tabs.querySelectorAll(".packtab")];const rows=[...items.querySelectorAll(".itemrow")];',
      ' const result={',
      '  window:rect(win),main:rect(main),dock:rect(dock),',
      '  categoryRects:all.map(rect),',
      '  categoryVisible:all.map(b=>b.scrollWidth<=b.clientWidth+1 && (function(){const r=b.getBoundingClientRect(),n=b.querySelector(".count").getBoundingClientRect();return n.left>=r.left-1&&n.right<=r.right+1})()),',
      '  rowRects:rows.map(rect),',
      '  inlineGrid:grid.style.getPropertyValue("grid-template-columns"),inlineFrame:win.style.getPropertyValue("width")',
      ' };',
      ' document.body.append(document.createComment("DFO_LAYOUT_JSON:"+JSON.stringify(result)));',
      '}));',
      '})();',
      '</script></body></html>'
    ].join('\n');
    const file = path.join(dir, 'test.html');
    fs.writeFileSync(file, html);
    const result = cp.spawnSync(browser, [
      '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
      '--hide-scrollbars','--window-size=1920,900','--virtual-time-budget=3000',
      '--dump-dom',pathToFileURL(file).href
    ], { encoding:'utf8', timeout:25000, maxBuffer:4*1024*1024 });
    assert.equal(result.status,0,result.stderr?.slice(-1500));
    const found = result.stdout.match(/<!--DFO_LAYOUT_JSON:(\{[^\n]*\})-->/);
    assert.ok(found,'Chrome never emitted measured geometry: '+result.stdout.slice(-1200));
    return JSON.parse(found[1]);
  } finally {
    fs.rmSync(dir, { recursive:true,force:true });
  }
}

test('real Chromium: the widened standalone frame gives its NEW space to the right dock, not equipment', { skip: !browser }, () => {
  const result=measure(false);
  assert.ok(result.window.width>=1550,JSON.stringify(result));
  assert.ok(Math.abs(result.main.width-540)<=2,JSON.stringify(result));
  assert.ok(result.dock.width>=1000,JSON.stringify(result));
  const firstY=result.categoryRects[0].y;
  assert.ok(result.categoryRects.every(r=>Math.abs(r.y-firstY)<2),JSON.stringify(result));
  assert.ok(result.categoryVisible.every(Boolean),'at least one category label or its numeric count is clipped: '+JSON.stringify(result));
  assert.ok(result.rowRects[0].width>=450,JSON.stringify(result));
  assert.ok(result.rowRects[1].width>=450,JSON.stringify(result));
  assert.ok(Math.abs(result.rowRects[0].y-result.rowRects[1].y)<2,'item rows are not two side-by-side cards');
  assert.ok(result.rowRects[1].x>=result.rowRects[0].right,'item columns overlap');
  assert.match(result.inlineGrid,/^540px\\s+minmax\\(0(?:px)?,\\s*1fr\\)$/,'actual grid is not forced');
});

test('real Chromium: a paired container window is NOT forced into the standalone wide layout', { skip: !browser }, () => {
  const result=measure(true);
  assert.equal(result.inlineGrid,'');
  assert.equal(result.inlineFrame,'');
});
