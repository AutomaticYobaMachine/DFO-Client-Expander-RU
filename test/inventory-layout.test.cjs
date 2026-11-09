'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../src/mod/page/dfo_pack.js'), 'utf8');
const css = source.split('  const CSS = `')[1]?.split('`;')[0];

test('standalone inventory expands the actual frame, not a fake row across equipment', () => {
  assert.ok(css, 'inventory stylesheet must be present');
  assert.match(css, /\.pack-shell:not\(\.paired\) \.pack-win\s*\{[^}]*width:calc\(100vw - 24px\) !important/s);
  assert.ok(css.includes('grid-template-columns:min(656px, calc(100vw - 774px)) minmax(0,1fr) !important;'), 'standalone must inherit the paired equipment width');
  assert.doesNotMatch(css, /grid-template-areas:[^;]*tabs tabs/);
  assert.doesNotMatch(css, /\.pack-dock\s*\{\s*display:contents/);
  assert.doesNotMatch(css, /\.pack-main\s*\{\s*grid-area:/);
  assert.match(css, /max-width:1600px !important/);
  assert.match(source, /win\.style\.setProperty\('width', 'calc\(100vw - 24px\)', 'important'\)/);
  assert.match(source, /win\.style\.setProperty\('max-width', '1600px', 'important'\)/);
  assert.match(source, /grid\.style\.setProperty\('grid-template-columns', \(referenceLeft \* scale\) \+ 'px minmax\(0,1fr\)', 'important'\)/);
  assert.match(source, /referenceLeft = paired \? baseMain\.width : Math\.min\(656, Math\.max\(0, viewportWidth - 774\)\)/);
  assert.match(source, /character\.style\.setProperty\('zoom', String\(scale\), 'important'\)/);
  assert.match(source, /win\.style\.setProperty\('height', \(baseFrame\.height \+ extraHeight\) \+ 'px', 'important'\)/);
  assert.match(source, /if \(paired\) win\.style\.setProperty\('width', \(baseFrame\.width \+ extraWidth\) \+ 'px', 'important'\)/);
  assert.match(source, /dock\.style\.setProperty\('width', baseDock\.width \+ 'px', 'important'\)/);
  assert.match(source, /dock\.style\.setProperty\('min-width', '0'\)/);
  assert.match(source, /tabs\.style\.setProperty\('grid-template-columns', 'repeat\(9,minmax\(0,1fr\)\)', 'important'\)/);
});
test('nine categories stay on one row INSIDE the right inventory pane', () => {
  assert.match(css, /\.pack-shell:not\(\.paired\) \.pack-dock \.packcats \.packtabs\s*\{[^}]*display:grid; grid-template-columns:repeat\(9,minmax\(0,1fr\)\)/s);
  assert.match(css, /\.pack-shell\.paired \.pack-dock \.packcats \.packtabs\s*\{[^}]*repeat\(3,minmax\(0,1fr\)\)/s);
});
test('rectangular inventory rows have two full-width columns, except next to a container', () => {
  assert.match(css, /\.pack-shell:not\(\.paired\) \.pack-dock \.packcol:not\(\.packcats\)\s*\{[^}]*repeat\(2,minmax\(0,1fr\)\)/s);
  assert.match(css, /\.pack-shell\.paired \.pack-dock \.packcol:not\(\.packcats\)\s*\{[^}]*grid-template-columns:minmax\(0,1fr\)/s);
  assert.doesNotMatch(css, /\.pack-dock \.packcol\s*\{[^}]*grid-template-columns/);
});
test('header never wraps and replaces only the Pack word, retaining character name', () => {
  assert.match(css, /\.pack-id\.dfo-pack-head\s*\{[^}]*flex-flow:row nowrap/s);
  assert.match(css, /\.pack-id\.dfo-pack-head \.act\s*\{[^}]*white-space:nowrap/s);
  assert.match(source, /const who = title\.querySelector\('\.pack-who'\)/);
  assert.match(source, /title\.replaceChildren\(bag, \.\.\.\(who \? \[who\] : \[\]\)\)/);
});

test('geometry follows its own header and cannot repeatedly scale a foreign shell', () => {
  assert.match(source, /header\.closest\('\.pack-shell'\)/, 'the header selects its own ancestor shell');
  assert.doesNotMatch(source, /doc\.querySelector\('\.pack-shell'\)/, 'never scale the first unrelated shell');
  assert.match(source, /scaledShells\.get\(shell\)/);
  assert.match(source, /scaledShells\.set\(shell/);
  assert.match(source, /previous\?\.baseFrame \?\? win\.getBoundingClientRect\(\)/);
  assert.match(source, /root\.__dfoInventoryRemeasure\$\?\.\(shell\)/);
  assert.match(source, /root\.addEventListener\?\.\('resize'/);
});
