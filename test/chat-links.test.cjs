'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { css, stacks } = require('../src/mod/page/dfo_fonts.js');
const { makeChatLinks } = require('../src/mod/page/dfo_ui_text.js');
const { transformAsset, EXPECTED, expectedHooks } = require('../src/mod/transforms.cjs');

// Minimal DOM shim for testing chat link rendering, click/copy handlers, and ru_i18n guards
function fakeDom() {
  const styles = [];
  const makeEl = (tag, cls = '', text = null) => {
    const listeners = new Map();
    const classes = new Set(String(cls || '').split(/\s+/).filter(Boolean));
    const el = {
      nodeType: 1,
      nodeName: String(tag).toUpperCase(),
      tagName: String(tag).toUpperCase(),
      className: cls || '',
      dataset: {},
      style: {},
      children: [],
      attributes: {},
      _text: '',
      classList: {
        add: (...names) => names.forEach(n => classes.add(n)),
        remove: (...names) => names.forEach(n => classes.delete(n)),
        contains: n => classes.has(n),
      },
      get textContent() {
        return this.children.length ? this.children.map(c => c.textContent ?? c.nodeValue ?? '').join('') : this._text;
      },
      set textContent(v) {
        this.children = [];
        this._text = String(v ?? '');
      },
      append(...nodes) { this.children.push(...nodes); },
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
      dispatch(type, ev = {}) {
        for (const fn of listeners.get(type) || []) fn(ev);
      },
      closest() { return null; },
    };
    if (text != null) el.textContent = text;
    return el;
  };
  const doc = {
    head: { append(el) { styles.push(el); } },
    getElementById(id) { return styles.find(s => s.id === id) || null; },
    createElement(tag) { return makeEl(tag); },
    createTextNode(v) { return { nodeType: 3, nodeValue: String(v ?? ''), textContent: String(v ?? '') }; },
    styles,
  };
  const opened = [], copied = [];
  const win = {
    document: doc,
    open(url, target, rel) { opened.push({ url, target, rel }); return {}; },
    navigator: { clipboard: { writeText(v) { copied.push(v); return Promise.resolve(); } } },
    setTimeout(fn) { return fn; },
    __dfoItemName(name) {
      return name === "Sentinel's Mail Hauberk of the Bear" ? 'Дозорный кольчужный хауберк медведя' : null;
    },
  };
  return { doc, win, mkEl: makeEl, opened, copied, styles };
}

test('dfo_fonts applies unified DFO Flow (item-font-description.otf, zero Ckazka) to item descriptions and all 4 mixed-case zones', () => {
  assert.match(stacks.description, /^'DFO Flow','DFO Flexi'/);
  assert.doesNotMatch(stacks.description, /DFO Ckazka/);
  assert.match(stacks.sigil, /^'DFO Ckazka','DFO Flexi'/);
  const sheet = css('../dfo-mod/fonts/');
  assert.match(sheet, /font-family:'DFO Flow';src:url\("\.\.\/dfo-mod\/fonts\/item-font-description\.otf/);
  assert.doesNotMatch(sheet, /font-family:'DFO Narrative'/);
  assert.match(sheet, /--dfo-font-description:'DFO Flow','DFO Flexi'/);
  assert.match(sheet, /--dfo-narrative-font:'DFO Flow','DFO Flexi'/);
  // 1) Service messages, statuses & right-side notifications (uses :where to avoid specificity leakage over h1-h6/buttons)
  assert.match(sheet, /:root body :where\(\.hudstatus/);
  for (const sel of ['.hudstatus', '.hudmid', '.notice-body', '.notice-row:not(.herald-kind):not(.herald-title):not(.tut-title)', '.qtrack-line', '.dlg-body', '.dfo-status-tip .dfo-st-line', '.dfsocial-toast', '.dfduel-toast']) {
    assert.ok(sheet.includes(sel), `missing service/status selector: ${sel}`);
  }
  // 2) NPC dialogue text
  for (const sel of ['.talk-log', '.talk-entry', '.talk-q', '.talk-regard-words', '.talk-hint']) {
    assert.ok(sheet.includes(sel), `missing NPC dialogue selector: ${sel}`);
  }
  // 3) Quest journal prose
  for (const sel of ['.px-qdetail .px-qdesc', '.px-qdetail .px-qentry', '.px-qdetail .px-qobj-text', '.px-qdetail .px-qline-said']) {
    assert.ok(sheet.includes(sel), `missing quest journal selector: ${sel}`);
  }
  // 4) In-game chat messages, names & input
  for (const sel of ['.dfchat-line .dfchat-text', '.dfchat-line .dfchat-name', '.dfchat-who-name', '.dfchat-input', '.dfchat-suggest-label']) {
    assert.ok(sheet.includes(sel), `missing chat selector: ${sel}`);
  }
  // Controls and tags inside narrative containers remain in the UI font
  assert.match(sheet, /\.herald-title[\s\S]*?\.dlg-btn[\s\S]*?font-family:'DFO Gabin'/);
});

test('chatLinks splits URLs cleanly, preserves mixed case, trims punctuation, and handles click/copy safely', () => {
  const { win, mkEl, opened, copied } = fakeDom();
  const api = makeChatLinks(win);

  const parts = api.splitUrls('Join (https://discord.gg/AbCdEf), see https://en.wikipedia.org/wiki/Daggerfall_(game)! Also www.DFO.org/Guide?x=1&y=2, discord.gg/XyZ9 and ссылка:https://t.me/dfo_ru.');
  const urls = parts.filter(p => p.type === 'url');
  assert.deepEqual(urls.map(u => [u.text, u.href]), [
    ['https://discord.gg/AbCdEf', 'https://discord.gg/AbCdEf'],
    ['https://en.wikipedia.org/wiki/Daggerfall_(game)', 'https://en.wikipedia.org/wiki/Daggerfall_(game)'],
    ['www.DFO.org/Guide?x=1&y=2', 'https://www.dfo.org/Guide?x=1&y=2'],
    ['discord.gg/XyZ9', 'https://discord.gg/XyZ9'],
    ['https://t.me/dfo_ru', 'https://t.me/dfo_ru'],
  ]);
  assert.equal(api.safeHref('javascript:alert(1)'), null);
  assert.equal(api.safeHref('data:text/html,hi'), null);

  const host = mkEl('span', 'dfchat-text');
  api.renderLine(host, 'Check https://discord.gg/AbCdEf now', mkEl, { system: false });
  assert.equal(host.dataset.dfoRaw, '1');
  assert.equal(host.children.length, 3);
  assert.equal(host.children[0].dataset.dfoRaw, '1');
  const link = host.children[1];
  assert.equal(link.tagName, 'A');
  assert.equal(link.className, 'dfchat-url');
  assert.equal(link.dataset.dfoRaw, '1');
  assert.equal(link.textContent, 'https://discord.gg/AbCdEf');
  let downStopped = 0;
  link.dispatch('mousedown', { stopPropagation() { downStopped++; } });
  link.dispatch('pointerdown', { stopPropagation() { downStopped++; } });
  assert.equal(downStopped, 2);
  link.dispatch('click', { preventDefault() {}, stopPropagation() {} });
  assert.equal(opened.length, 1);
  assert.equal(opened[0].url, 'https://discord.gg/AbCdEf');
  link.dispatch('contextmenu', { preventDefault() {}, stopPropagation() {} });
  assert.equal(copied[0], 'https://discord.gg/AbCdEf');
  assert.equal(link.classList.contains('is-copied'), true);

  // If win.open throws, click falls back to clipboard copy
  win.open = () => { throw new Error('blocked'); };
  link.dispatch('click', { preventDefault() {}, stopPropagation() {} });
  assert.equal(copied.length, 2);

  // System lines leave non-URL text untranslated-raw-free so ru_i18n can localize system text, while protecting URLs
  const sysHost = mkEl('span', 'dfchat-text');
  api.renderLine(sysHost, 'Welcome! Visit https://discord.gg/AbCdEf', mkEl, { system: true });
  assert.equal(sysHost.dataset.dfoRaw, undefined);
  assert.equal(sysHost.children[0].dataset.dfoRaw, undefined);
  assert.equal(sysHost.children[1].dataset.dfoRaw, '1');
});

test('chatLinks matches Russian, English, %it shortName, reverse-order, stacked, and foreign-locale [Item] links plus URLs and mentions', () => {
  const { win, mkEl } = fakeDom();
  const api = makeChatLinks(win);
  const labelOf = item => item._ru;
  const makeItemSpan = (item, mk) => {
    const sp = mk('span', 'dfchat-item');
    sp.dataset.dfoRaw = '1';
    sp.textContent = `[${labelOf(item)}]`;
    sp._item = item;
    return sp;
  };
  const sword = { shortName: '%it Longsword', _ru: 'Стальной длинный меч' };
  const dagger = { shortName: '%it Dagger', _ru: 'Железный кинжал' };
  const armor = { name: "Sentinel's Mail Hauberk of the Bear", _ru: 'Дозорный кольчужный хауберк медведя' };
  const arrows = { name: 'Arrow', stackCount: 50, _ru: 'Стрела x50' };

  // 1) Russian player -> Russian client
  const ruNodes = api.renderItems('Продам [Стальной длинный меч] за 500g', [sword], mkEl, {}, makeItemSpan, labelOf);
  assert.equal(ruNodes.filter(n => n.className === 'dfchat-item').length, 1);
  assert.equal(ruNodes.find(n => n.className === 'dfchat-item').textContent, '[Стальной длинный меч]');

  // 2) Reverse-order %it shortName items from English player -> matched to exact item, NEVER swapped!
  const revNodes = api.renderItems('WTS [Iron Dagger] and [Steel Longsword]', [sword, dagger], mkEl, {}, makeItemSpan, labelOf);
  assert.deepEqual(revNodes.filter(n => n.className === 'dfchat-item').map(n => n._item), [dagger, sword]);

  // 3) English player -> Russian client (raw name, material-prefixed name, stacked name, plus URL & @mention)
  const enNodes = api.renderItems(
    '@Hero WTS [Steel Longsword] and [Sentinel\'s Mail Hauberk of the Bear] + [Arrow x50] https://discord.gg/AbCdEf',
    [sword, armor, arrows],
    mkEl,
    {
      mention: txt => txt.includes('@Hero')
        ? [mkEl('span', 'dfchat-mention', '@Hero'), { nodeType: 3, nodeValue: txt.slice(5) }]
        : [{ nodeType: 3, nodeValue: txt }],
    },
    makeItemSpan,
    labelOf
  );
  const itemsFound = enNodes.filter(n => n.className === 'dfchat-item').map(n => n.textContent);
  assert.deepEqual(itemsFound, ['[Стальной длинный меч]', '[Дозорный кольчужный хауберк медведя]', '[Стрела x50]']);
  assert.equal(enNodes.filter(n => n.className === 'dfchat-url').length, 1);
  assert.equal(enNodes.filter(n => n.className === 'dfchat-mention').length, 1);

  // 4) Bracketed URL before third-language item -> Pass 2 never steals the URL token!
  const deNodes = api.renderItems('[https://discord.gg/AbCd] Suche [Stahllangschwert]!', [sword], mkEl, {}, makeItemSpan, labelOf);
  assert.equal(deNodes.filter(n => n.className === 'dfchat-url').length, 1);
  assert.equal(deNodes.filter(n => n.className === 'dfchat-item').length, 1);
  assert.equal(deNodes.find(n => n.className === 'dfchat-item')._item, sword);

  // 5) Attached item without brackets -> appended so it stays inspectable
  const bareNodes = api.renderItems('look at this', [sword], mkEl, {}, makeItemSpan, labelOf);
  assert.equal(bareNodes.filter(n => n.className === 'dfchat-item').length, 1);

  // 6) Suggest matches both localized Russian and %it-stripped English query
  assert.equal(api.matchSuggest(sword, 'сталь', sword._ru).match, true);
  assert.equal(api.matchSuggest(sword, 'long', sword._ru).match, true);
  assert.equal(api.matchSuggest(sword, 'bow', sword._ru).match, false);

  // 7) Outgoing match is case-insensitive and retains item even if typed in English or lowercase
  const kept = api.matchOutgoing([{ label: sword._ru, item: sword }], 'wts [стальной длинный меч]', 4);
  assert.equal(kept.length, 1);
  const keptEn = api.matchOutgoing([{ label: sword._ru, item: sword }], 'wts [LONGSWORD]', 4);
  assert.equal(keptEn.length, 1);
});

test('chat.links transform patches all 5 chat sites cleanly, is idempotent, and is tracked in expectedHooks', () => {
  assert.deepEqual(EXPECTED.chat, ['chat.links']);
  assert.ok(expectedHooks({}).includes('chat.links'));
  assert.equal(expectedHooks({ chatLinks: false }).includes('chat.links'), false);
  const sample = [
    'function n8t(e,t){let n=t(`span`,`dfchat-item`,`[${yJ(e)}]`),r=Zw(e);return r&&(n.style.color=r),n.addEventListener(`mouseenter`,()=>n1e(e,{},n,`shop`)),n.addEventListener(`mouseleave`,()=>bJ()),n}',
    'function r8t(e,t,n,{plain:r,mention:i}={}){let a=r??(e=>n(`span`,`dfchat-plain`,e)),o=(t??[]).map(e=>({label:yJ(e),item:e})),s=[],c=0,l=String(e??``);for(;c<l.length;){let e=-1,t=-1,r=0;for(let n=0;n<o.length;n++){let i=o[n];if(!i)continue;let a=`[${i.label}]`,s=l.indexOf(a,c);s>=0&&(e<0||s<e)&&(e=s,t=n,r=a.length)}if(t<0){let e=l.slice(c);e&&s.push(...i?i(e):[a(e)]);break}if(e>c){let t=l.slice(c,e);s.push(...i?i(t):[a(t)])}s.push(n8t(o[t].item,n)),o[t]=null,c=e+r}return s.length?s:[a(l)]}',
    'function i8t(e,t,{limit:n=1/0}={}){let r=String(t??``).toLowerCase(),i=[];for(let t of e??[]){if(!t||typeof t!=`object`||Array.isArray(t))continue;let e=yJ(t);if(!e||e===`?`)continue;let n=e.toLowerCase();(!r||n.includes(r))&&i.push({item:t,label:e,equipped:Jr(t),score:!r||n.startsWith(r)?0:1})}return i}',
    'function a8t(e,t,{max:n=4}={}){let r=String(t??``),i=new Map,a=[];for(let t of e??[]){if(a.length>=n)break;let e=t?.label,o=t?.item;if(!e||!o)continue;let s=`[${e}]`,c=0;for(let e=0;(e=r.indexOf(s,e))>=0;e+=s.length)c++;let l=i.get(e)??0;l>=c||(a.push(t),i.set(e,l+1))}return a}',
    'function Zt(t,n,r){let a=b(`div`,`dfchat-line`),o=null,s=null;if(s&&a.append(s),t.system){let e=b(`span`,`dfchat-text`,t.text);return a.append(e),t.copy&&a.append(Xt(t.copy)),{node:a,chan:o,time:s,nameEl:null,tag:null,text:e}}let c=b(`span`,`dfchat-name`,t.name||`?`),u=b(`span`,`dfchat-tag`,`#${u3(t.id)}`),d=t8t(t),f=b(`span`,`dfchat-text`,d.length||t.ping?null:t.text);return d.length?f.append(...r8t(t.text,d,b,{plain:e=>typeof l.createTextNode==`function`?l.createTextNode(e):b(`span`,`dfchat-plain`,e),mention:t.ping?t=>qt(t,e.self):null})):t.ping&&f.append(...qt(t.text,e.self)),a.append(c,u,f),{node:a,chan:o,time:s,nameEl:c,tag:u,text:f}}',
  ].join('\n');

  const res = transformAsset('assets/world-probe.js', sample, { fonts: false, ru: false, marks: false, dungeons: false, nearbyLoot: false, waypoints: false, skills: false });
  assert.deepEqual(res.log.filter(([id]) => id === 'chat.links'), [['chat.links', 5]]);
  // Valid JS syntax
  new Function(res.text);
  // Idempotent on second pass
  const res2 = transformAsset('assets/world-probe.js', res.text, { fonts: false, ru: false, marks: false, dungeons: false, nearbyLoot: false, waypoints: false, skills: false });
  assert.equal(res2.text, res.text);
  assert.deepEqual(res2.log.filter(([id]) => id === 'chat.links'), [['chat.links', 0]]);
});

test('chat.links matches all 5 sites in the real world bundle and parses cleanly', { skip: !process.env.DFO_BUILD_DIR }, () => {
  const dir = path.join(process.env.DFO_BUILD_DIR, 'assets');
  const worldFile = fs.readdirSync(dir).find(f => /^world-.*\.js$/.test(f));
  assert.ok(worldFile, 'world chunk found');
  const src = fs.readFileSync(path.join(dir, worldFile), 'utf8');
  const res = transformAsset('assets/' + worldFile, src, { fonts: true, ru: true, marks: true, dungeons: true, nearbyLoot: true, itemCards: true, inventory: true });
  assert.deepEqual(res.log.filter(([id]) => id === 'chat.links'), [['chat.links', 5]]);
  assert.equal(res.log.some(([id]) => id.includes('!error')), false, JSON.stringify(res.log));
  try {
    const acorn = require(process.env.DFO_ACORN_MODULE || 'acorn');
    acorn.parse(res.text, { ecmaVersion: 'latest', sourceType: 'module' });
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') throw err;
  }
});

test('ru_i18n skips chat raw nodes, @mention createTextNode (__dfoRawDepth), and URLs without poisoning cache', () => {
  const src = fs.readFileSync(path.join(__dirname, '../data/ru/ru_i18n.js'), 'utf8');
  const sandbox = {
    window: { __RU_DICT__: { 'Hello': 'Привет', 'Longsword': 'Длинный меч', 'Settings': 'Настройки' } },
    console: { log() {} },
    Document: undefined,
    Node: { prototype: {} },
    HTMLElement: undefined,
    HTMLInputElement: undefined,
    HTMLTextAreaElement: undefined,
    Element: { prototype: { append() {}, setAttribute() {} } },
    CanvasRenderingContext2D: undefined,
    MutationObserver: undefined,
    document: { readyState: 'complete' },
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(src, sandbox);
  const tr = sandbox.__translate;
  assert.equal(typeof tr, 'function');
  // Raw chat guard BEFORE cache: never poisons regular UI translation
  assert.equal(tr('Hello', { dataset: { dfoRaw: '1' } }), 'Hello');
  assert.equal(tr('Hello'), 'Привет');
  assert.equal(tr('Longsword', { classList: { contains: c => c === 'dfchat-item' } }), 'Longsword');
  assert.equal(tr('Settings', { classList: { contains: c => c === 'dfchat-plain' } }), 'Settings');
  assert.equal(tr('Settings', { classList: { contains: c => c === 'dfchat-hit' } }), 'Settings');
  assert.equal(tr('https://discord.gg/AbCdEf'), 'https://discord.gg/AbCdEf');
  assert.equal(tr('www.example.com/Hello'), 'www.example.com/Hello');
  assert.equal(tr('discord.gg/Longsword'), 'discord.gg/Longsword');
  // Re-entrant __dfoRawDepth protects synchronous createTextNode calls inside qt (@mention)
  sandbox.__dfoRawDepth = 1;
  assert.equal(tr('Hello'), 'Hello');
  assert.equal(tr('Settings'), 'Settings');
  sandbox.__dfoRawDepth = 0;
  assert.equal(tr('Settings'), 'Настройки');
});
