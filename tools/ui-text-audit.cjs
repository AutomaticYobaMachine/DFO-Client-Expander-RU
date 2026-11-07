'use strict';
// The mod's words audited inside any browser stand, without touching it:
//   node -r ./tools/ui-text-audit.cjs tools/test-dungeons-browser.cjs ...      (DFO_UI_LOCALE=en for the English pack)
// Every page the stand opens gets a watch on __dfoUi: a key the pack has no words for is reported (the page would show
// the key itself), and with the English pack any Cyrillic text that appears in the mod's own elements is listed - a
// Russian word that slipped past the packs. Missing keys fail the run; Cyrillic is listed for review (a stand's own
// fixtures may hold Russian names).
const Module = require('node:module');
const missing = new Set(), cyrillic = new Map();
let pages = 0;
const INIT = `(() => {
  const KEY = /^[a-z][A-Za-z0-9]*(?:\\.[A-Za-z0-9-]+)+$/, CYR = /[А-Яа-яЁё]/, told = new Set();
  const say = (kind, text) => { const line = kind + ' ' + String(text).replace(/\\s+/g, ' ').slice(0, 200); if (!told.has(line)) { told.add(line); console.warn(line); } };
  let ui;
  try {
    Object.defineProperty(window, '__dfoUi', { configurable: true, enumerable: true, get: () => ui, set: (v) => {
      ui = v && Object.freeze({ ...v, t: (k, p) => { if (!v.has(k) && KEY.test(k)) say('DFO_UI_MISSING', k); return v.t(k, p); } });
      if (v && v.locale === 'en') {
        // The mod's own elements: our classes and ids start with dfo; a text node in them that speaks Russian is a leak.
        const ours = (n) => { for (let e = n.nodeType === 1 ? n : n.parentElement; e; e = e.parentElement) if (/(^|\\s)dfo|^dfo/.test((e.className && e.className.baseVal == null ? e.className : '') + ' ' + (e.id || ''))) return true; return false; };
        const scan = (root) => { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (CYR.test(n.textContent) && ours(n)) say('DFO_UI_CYRILLIC', n.textContent); };
        const start = () => { scan(document.body); new MutationObserver((list) => { for (const m of list) { if (m.type === 'characterData') { if (CYR.test(m.target.textContent) && ours(m.target)) say('DFO_UI_CYRILLIC', m.target.textContent); } else for (const a of m.addedNodes) if (a.nodeType === 3 ? CYR.test(a.textContent) && ours(a) : a.nodeType === 1) a.nodeType === 3 ? say('DFO_UI_CYRILLIC', a.textContent) : scan(a); } }).observe(document.documentElement, { childList: true, subtree: true, characterData: true }); };
        if (document.body) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
      }
    } });
  } catch {}
})();`;

const heard = new WeakSet();
function listen(page) {
  if (heard.has(page)) return;
  heard.add(page);
  pages++;
  page.on('console', (m) => {
    const text = m.text();
    if (text.startsWith('DFO_UI_MISSING ')) missing.add(text.slice(15));
    else if (text.startsWith('DFO_UI_CYRILLIC ')) cyrillic.set(text.slice(16), (cyrillic.get(text.slice(16)) ?? 0) + 1);
  });
}
async function wrapContext(context) {
  if (context.__dfoAudit) return context;
  context.__dfoAudit = true;
  await context.addInitScript(INIT);
  for (const p of context.pages()) listen(p);
  context.on('page', listen);
  return context;
}
function wrapBrowser(browser) {
  const newContext = browser.newContext.bind(browser), newPage = browser.newPage.bind(browser);
  browser.newContext = async (...a) => wrapContext(await newContext(...a));
  // The page's own context gets the watch before the stand navigates anywhere.
  browser.newPage = async (...a) => { const p = await newPage(...a); await wrapContext(p.context()); listen(p); return p; };
  return browser;
}
const load = Module._load;
Module._load = function (request, parent, isMain) {
  const out = load.apply(this, arguments);
  if (out && out.chromium && !out.chromium.__dfoAudit) {
    const launch = out.chromium.launch.bind(out.chromium);
    out.chromium.launch = async (...a) => wrapBrowser(await launch(...a));
    out.chromium.__dfoAudit = true;
  }
  return out;
};
process.on('exit', () => {
  const lines = [`ui-text audit (${process.env.DFO_UI_LOCALE || 'stand default'}): ${pages} pages, ${missing.size} keys without words, ${cyrillic.size} Cyrillic texts in the mod's elements`];
  for (const k of missing) lines.push(`  MISSING ${k}`);
  for (const [t, n] of cyrillic) lines.push(`  CYRILLIC ${t}${n > 1 ? ` (x${n})` : ''}`);
  process.stderr.write(lines.join('\n') + '\n');
  if (missing.size && !process.exitCode) process.exitCode = 1;
});
