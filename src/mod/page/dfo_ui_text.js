(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) api.install(root);
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  // The mod's own interface strings, in the one language this install speaks: the same locale packs as the item
  // descriptions (src/mod/item-text/<en|ru>/ui/*.csv) and the same choice - Russian with the translation installed and
  // on, English otherwise. The hook serves the chosen locale as data (dfo_ui_text_data.js: __dfoUiPack), English
  // already under it, so a key the locale lacks still reads in English.
  //
  //   t('loot.title')                         the string
  //   t('loot.count', { n: 3 })               {n} - a value
  //   t('loot.items', { n: 3 })               {n:item|items} - a word for the number (en: one|other; ru: one|few|many)
  //   number(1234.5, { maximumFractionDigits: 1 })   the locale's own digits and separators
  const PLURAL = Object.freeze({
    en: n => (n === 1 ? 0 : 1),
    ru: n => {
      if (!Number.isInteger(n)) return 1;   // «1,5 метра»
      const a = Math.abs(n) % 100, b = a % 10;
      return a > 10 && a < 20 ? 2 : b === 1 ? 0 : b >= 2 && b <= 4 ? 1 : 2;
    },
  });
  const FORMS = Object.freeze({ en: 2, ru: 3 });
  const PLACE = /\{([A-Za-z][A-Za-z0-9]*)(?::([^{}]*))?\}/g;
  const TAGS = Object.freeze({ en: 'en-US', ru: 'ru-RU' });

  /** A string's places parsed once: its fixed pieces and { name, forms, all } for each place. */
  function compile(text) {
    const parts = [];
    let at = 0;
    for (const m of String(text).matchAll(PLACE)) {
      if (m.index > at) parts.push(text.slice(at, m.index));
      parts.push({ name: m[1], forms: m[2] == null ? null : m[2].split('|'), all: m[0] });
      at = m.index + m[0].length;
    }
    if (at < text.length) parts.push(text.slice(at));
    return parts;
  }
  /** Fill a parsed string: values as they are, number words by the locale's plural rule. A missing value keeps its
   *  place visible rather than silently dropping words. */
  function fill(parts, params, locale) {
    let out = '';
    for (const p of parts) {
      if (typeof p === 'string') { out += p; continue; }
      const value = params && Object.prototype.hasOwnProperty.call(params, p.name) ? params[p.name] : undefined;
      if (p.forms == null) { out += value == null ? p.all : String(value); continue; }
      const n = Number(value);
      if (!Number.isFinite(n)) { out += p.forms[p.forms.length - 1]; continue; }
      const rule = PLURAL[locale] || PLURAL.en;
      out += p.forms[Math.min(rule(n), p.forms.length - 1)];
    }
    return out;
  }
  const format = (text, params, locale) => fill(compile(String(text)), params, locale);
  /** The places a string names, for the tables' checks: { name: number of word forms, or 0 for a value }. */
  function places(text) {
    const out = {};
    for (const m of String(text).matchAll(PLACE)) out[m[1] + (m[2] == null ? '' : ':')] = m[2] == null ? 0 : m[2].split('|').length;
    return out;
  }
  function make(pack) {
    const strings = pack && typeof pack.strings === 'object' && pack.strings ? pack.strings : {};
    const locale = pack && typeof pack.locale === 'string' ? pack.locale : 'en';
    const numbers = new Map();
    // Each string parsed once, on first use: a plain one is answered as it is, one with places filled from its parts.
    const parsed = new Map();
    const t = (key, params) => {
      let p = parsed.get(key);
      if (p === undefined) {
        if (!Object.prototype.hasOwnProperty.call(strings, key)) return key;
        const text = String(strings[key]);
        p = text.indexOf('{') < 0 ? text : compile(text);
        parsed.set(key, p);
      }
      return typeof p === 'string' ? p : fill(p, params, locale);
    };
    return Object.freeze({
      locale,
      tag: TAGS[locale] || TAGS.en,
      t,
      has: key => Object.prototype.hasOwnProperty.call(strings, key),
      /** The locale's own digits: «1 234,5» in Russian, "1,234.5" in English. */
      number(value, options) {
        let id = '';
        if (options) {
          const keys = Object.keys(options);
          if (keys.length === 1 && keys[0] === 'maximumFractionDigits') id = 'mfd:' + options.maximumFractionDigits;
          else if (keys.length > 0) id = JSON.stringify(options);
        }
        let fmt = numbers.get(id);
        if (!fmt) {
          fmt = new Intl.NumberFormat(TAGS[locale] || TAGS.en, options);
          numbers.set(id, fmt);
        }
        return fmt.format(value);
      },
      plural: n => (PLURAL[locale] || PLURAL.en)(n),
    });
  }
  // ─── CHAT LINKS (cross-locale [Item] links + clickable/copyable URLs) ─────────────────────────────────────────────
  const URL_RE = /(?:https?:\/\/|www\.|(?:discord\.gg|youtu\.be|t\.me)\/)[^\s<>"'`\u0000-\u001f]+/gi;
  const URL_LOOKS = /^(?:https?:\/\/|www\.|(?:discord\.gg|youtu\.be|t\.me)\/)/i;
  const URL_PRE_OK = /^$|[\s([<{"'«—–]$/;
  const TRAIL_PUNCT = /[.,;:!?'"»>…]+$/;
  const CLOSE_PAIRS = Object.freeze({ ')': '(', ']': '[', '}': '{' });

  function trimUrl(raw) {
    let url = String(raw || '');
    for (;;) {
      const stripped = url.replace(TRAIL_PUNCT, '');
      if (stripped !== url) { url = stripped; continue; }
      const last = url[url.length - 1];
      const open = CLOSE_PAIRS[last];
      if (open) {
        let opens = 0, closes = 0;
        for (let i = 0; i < url.length; i++) {
          if (url[i] === open) opens++;
          else if (url[i] === last) closes++;
        }
        if (closes > opens) { url = url.slice(0, -1); continue; }
      }
      break;
    }
    return url;
  }

  function safeHref(raw) {
    if (!raw) return null;
    const candidate = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
    try {
      const u = new URL(candidate);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      if (!u.hostname || !u.hostname.includes('.')) return null;
      return u.href;
    } catch { return null; }
  }

  function splitUrls(text) {
    const str = String(text ?? '');
    if (!str) return [];
    const parts = [];
    let at = 0;
    URL_RE.lastIndex = 0;
    for (let m; (m = URL_RE.exec(str)); ) {
      const pre = m.index > 0 ? str[m.index - 1] : '';
      const allowColon = pre === ':' && /^https?:\/\//i.test(m[0]);
      if (!URL_PRE_OK.test(pre) && !allowColon) continue;
      const clean = trimUrl(m[0]);
      const href = safeHref(clean);
      if (!clean || !href) continue;
      if (m.index > at) parts.push({ type: 'text', text: str.slice(at, m.index) });
      parts.push({ type: 'url', text: clean, href });
      at = m.index + clean.length;
      URL_RE.lastIndex = at;
    }
    if (at < str.length) parts.push({ type: 'text', text: str.slice(at) });
    return parts;
  }

  const normName = s => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const stripStack = s => String(s ?? '').replace(/\s+x\d+$/i, '').trim();
  const stripFmt = s => String(s ?? '').replace(/%[a-z]+/gi, ' ').replace(/\s+/g, ' ').trim();

  function itemCandidates(item, labelOf, win) {
    const exact = new Set(), loose = new Set(), bases = new Set();
    const stack = Number(item?.stackCount ?? item?.stack ?? 0);
    const add = (val) => {
      const raw = typeof val === 'string' ? val.trim() : '';
      if (!raw || raw === '?') return;
      const variants = [raw];
      if (raw.includes('%')) {
        const cleaned = stripFmt(raw);
        if (cleaned && cleaned !== raw) variants.push(cleaned);
      }
      for (const s of variants) {
        exact.add(s);
        const lo = normName(s);
        loose.add(lo);
        const base = stripStack(lo);
        if (base) { loose.add(base); bases.add(base); }
        if (stack > 1 && !/\sx\d+$/i.test(s)) {
          const withStack = `${s} x${stack}`;
          exact.add(withStack);
          loose.add(normName(withStack));
        }
      }
    };
    if (typeof labelOf === 'function') { try { add(labelOf(item)); } catch {} }
    if (item && typeof item === 'object') {
      add(item.name);
      add(item.shortName);
      add(item.displayName);
      add(item.templateName);
      if (typeof item.name === 'string' && typeof win?.__dfoItemName === 'function') {
        try { add(win.__dfoItemName(item.name)); } catch {}
      }
      if (typeof item.shortName === 'string' && typeof win?.__dfoItemName === 'function') {
        try { add(win.__dfoItemName(stripFmt(item.shortName))); } catch {}
      }
    }
    return { exact, loose, bases };
  }

  function ensureChatLinksStyle(doc) {
    if (!doc?.head || doc.getElementById('dfo-chat-links-style')) return;
    const st = doc.createElement('style');
    st.id = 'dfo-chat-links-style';
    st.textContent =
      '.dfchat-peek .dfchat-item,.dfchat-peek .dfchat-url{pointer-events:auto!important;}' +
      '.dfchat-list .dfchat-line{user-select:text;-webkit-user-select:text;}' +
      '.dfchat-item{cursor:pointer!important;}' +
      '.dfchat-url{color:#7ec8ff;font-style:normal;text-decoration:underline;text-underline-offset:2px;cursor:pointer;pointer-events:auto;word-break:break-all;}' +
      '.dfchat-url:hover,.dfchat-url:focus-visible{color:#b8e2ff;outline:none;}' +
      '.dfchat-url.is-copied::after{content:" \\2713";color:#7fe08a;font-style:normal;text-decoration:none;display:inline-block;}' +
      ':root[data-theme="grimoire"] .dfchat-url,body.grimoire .dfchat-url{color:#1f5c99;}' +
      ':root[data-theme="grimoire"] .dfchat-url:hover,body.grimoire .dfchat-url:hover{color:#0f3d6b;}';
    doc.head.append(st);
  }

  function makeChatLinks(win) {
    const markRaw = (el) => { if (el && el.dataset) el.dataset.dfoRaw = '1'; return el; };
    const withRaw = (fn) => {
      const g = typeof globalThis === 'object' ? globalThis : null;
      if (win) win.__dfoRawDepth = (win.__dfoRawDepth || 0) + 1;
      if (g && g !== win) g.__dfoRawDepth = (g.__dfoRawDepth || 0) + 1;
      try { return fn(); } finally {
        if (win) win.__dfoRawDepth = Math.max(0, (win.__dfoRawDepth || 1) - 1);
        if (g && g !== win) g.__dfoRawDepth = Math.max(0, (g.__dfoRawDepth || 1) - 1);
      }
    };
    const copyHref = (href, el) => {
      try { win?.navigator?.clipboard?.writeText?.(href)?.catch?.(() => {}); } catch {}
      if (el?.classList) {
        el.classList.add('is-copied');
        try { (win?.setTimeout ?? setTimeout)(() => el.classList.remove('is-copied'), 1200); } catch {}
      }
    };
    const makePlain = (text, mkEl, { plain, system }) => {
      if (!text) return null;
      if (system) return typeof plain === 'function' ? plain(text) : mkEl('span', 'dfchat-plain', text);
      const sp = mkEl('span', 'dfchat-plain');
      markRaw(sp);
      sp.textContent = text;
      return sp;
    };
    const makeUrlEl = (part, mkEl) => {
      const a = mkEl('a', 'dfchat-url');
      markRaw(a);
      a.href = part.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.title = part.href;
      a.textContent = part.text;
      const stopDown = (ev) => { ev.stopPropagation?.(); };
      a.addEventListener?.('mousedown', stopDown);
      a.addEventListener?.('pointerdown', stopDown);
      a.addEventListener?.('click', (ev) => {
        ev.preventDefault?.();
        ev.stopPropagation?.();
        if (ev.ctrlKey || ev.metaKey) { copyHref(part.href, a); return; }
        let opened = null, threw = false;
        try { opened = win?.open?.(part.href, '_blank', 'noopener,noreferrer'); } catch { threw = true; }
        if (threw || opened === undefined) copyHref(part.href, a);
      });
      a.addEventListener?.('contextmenu', (ev) => {
        ev.preventDefault?.();
        ev.stopPropagation?.();
        copyHref(part.href, a);
      });
      return a;
    };
    const linkify = (text, mkEl, { plain = null, mention = null, system = false } = {}) => {
      const str = String(text ?? '');
      if (!str) return [];
      const out = [];
      for (const seg of splitUrls(str)) {
        if (seg.type === 'url') {
          out.push(makeUrlEl(seg, mkEl));
        } else if (seg.text) {
          if (typeof mention === 'function') {
            const produced = (system ? mention(seg.text) : withRaw(() => mention(seg.text))) || [];
            for (const node of produced) {
              if (!system && node && node.nodeType === 3) {
                const sp = makePlain(node.nodeValue ?? '', mkEl, { system: false });
                if (sp) out.push(sp);
              } else {
                if (!system) markRaw(node);
                out.push(node);
              }
            }
          } else {
            const node = makePlain(seg.text, mkEl, { plain, system });
            if (node) out.push(node);
          }
        }
      }
      return out;
    };
    const renderLine = (host, text, mkEl, { plain = null, mention = null, system = false } = {}) => {
      ensureChatLinksStyle(host?.ownerDocument || win?.document);
      if (!system) markRaw(host);
      const nodes = linkify(text, mkEl, { plain, mention, system });
      if (nodes.length) host.append(...nodes);
      return host;
    };
    const renderItems = (text, items, mkEl, opts, makeItemSpan, labelOf) => {
      ensureChatLinksStyle(win?.document);
      const str = String(text ?? '');
      const { plain = null, mention = null } = opts || {};
      const pool = (items ?? []).map((item, idx) => ({ idx, item, cand: itemCandidates(item, labelOf, win), used: false }));
      const tokens = [];
      for (const m of str.matchAll(/\[([^\]\[]+)\]/g)) {
        tokens.push({ start: m.index, end: m.index + m[0].length, inner: m[1], norm: normName(m[1]), base: stripStack(normName(m[1])), item: null });
      }
      // Pass 1a: exact label match
      for (const tok of tokens) {
        const hit = pool.find(p => !p.used && p.cand.exact.has(tok.inner));
        if (hit) { hit.used = true; tok.item = hit.item; }
      }
      // Pass 1b: case-insensitive / material-prefixed / stack-normalized match
      for (const tok of tokens) {
        if (tok.item) continue;
        const hit = pool.find(p => !p.used && (
          p.cand.loose.has(tok.norm) ||
          (tok.base && p.cand.loose.has(tok.base)) ||
          [...p.cand.bases].some(b => b.length >= 3 && (tok.base.endsWith(' ' + b) || b.endsWith(' ' + tok.base)))
        ));
        if (hit) { hit.used = true; tok.item = hit.item; }
      }
      // Pass 2: cross-locale positional fallback for remaining attached items (never steal bracketed URLs)
      const leftover = pool.filter(p => !p.used);
      if (leftover.length) {
        let li = 0;
        for (const tok of tokens) {
          if (tok.item || li >= leftover.length) continue;
          if (URL_LOOKS.test(tok.inner.trim())) continue;
          leftover[li].used = true;
          tok.item = leftover[li].item;
          li++;
        }
      }
      const out = [];
      let pos = 0;
      for (const tok of tokens) {
        if (!tok.item) continue;
        if (tok.start > pos) out.push(...linkify(str.slice(pos, tok.start), mkEl, { plain, mention, system: false }));
        const span = withRaw(() => makeItemSpan(tok.item, mkEl));
        markRaw(span);
        out.push(span);
        pos = tok.end;
      }
      if (pos < str.length) out.push(...linkify(str.slice(pos), mkEl, { plain, mention, system: false }));
      // If attached items had no [bracket] token at all, append them so they are still inspectable.
      for (const p of pool) {
        if (p.used) continue;
        if (out.length) { const sp = makePlain(' ', mkEl, { system: false }); if (sp) out.push(sp); }
        const span = withRaw(() => makeItemSpan(p.item, mkEl));
        markRaw(span);
        out.push(span);
      }
      return out.length ? out : [makePlain(str, mkEl, { plain, system: false })].filter(Boolean);
    };
    const matchSuggest = (item, query, label) => {
      if (!item || !label || label === '?') return { match: false, score: 2 };
      const q = normName(query);
      if (!q) return { match: true, score: 0 };
      const names = [normName(label)];
      if (typeof item.name === 'string') names.push(normName(item.name));
      if (typeof item.shortName === 'string') names.push(normName(stripFmt(item.shortName)));
      if (names.some(n => n && n.startsWith(q))) return { match: true, score: 0 };
      if (names.some(n => n && n.includes(q))) return { match: true, score: 1 };
      return { match: false, score: 2 };
    };
    const matchOutgoing = (entries, text, max = 4) => {
      const str = String(text ?? '');
      const lower = str.toLowerCase();
      const used = new Map(), out = [];
      for (const entry of entries ?? []) {
        if (out.length >= max) break;
        const label = entry?.label, item = entry?.item;
        if (!label || !item) continue;
        const targets = new Set([normName(label)]);
        if (typeof item.name === 'string' && item.name.trim()) targets.add(normName(item.name));
        if (typeof item.shortName === 'string' && item.shortName.trim()) targets.add(normName(stripFmt(item.shortName)));
        let matchedKey = null, total = 0;
        for (const key of targets) {
          const needle = `[${key}]`;
          let c = 0;
          for (let at = 0; (at = lower.indexOf(needle, at)) >= 0; at += needle.length) c++;
          if (c > 0) { matchedKey = key; total = c; break; }
        }
        if (!matchedKey) continue;
        const seen = used.get(matchedKey) ?? 0;
        if (seen >= total) continue;
        out.push(entry);
        used.set(matchedKey, seen + 1);
      }
      return out;
    };
    return Object.freeze({ splitUrls, safeHref, trimUrl, itemCandidates, linkify, renderLine, renderItems, matchSuggest, matchOutgoing });
  }

  function install(win) {
    if (!win.__dfoUi) win.__dfoUi = make(win.__dfoUiPack);
    if (!win.__dfoChatLinks) win.__dfoChatLinks = makeChatLinks(win);
    ensureChatLinksStyle(win?.document);
  }
  /** A page script's accessor: the installed strings, or the key itself before they load (never a throw). */
  function bind(root) {
    return (key, params) => (root.__dfoUi ? root.__dfoUi.t(key, params) : key);
  }
  return { PLURAL, FORMS, TAGS, format, places, make, makeChatLinks, install, bind };
});
