(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) api.install(root);
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const DATA_KEYS = ['template', 'value', 'variantWord', 'material', 'materialLabel', 'saysMaterial', 'isAmmo', 'isHandWraps'];
  const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const money = value => finite(value) && value <= Number.MAX_SAFE_INTEGER;
  const variants = { Fur: 'Мех', Mail: 'Кольчужная', Brigandine: 'Бригандина' };
  // These English material names are also skill names; the generic RU text hook uses the language meaning.
  const materialTerms = { Daedric: 'Даэдрический металл', Orcish: 'Орочий металл' };

  /** Pure presentation data. Never mint, identify, repair or write to the item. */
  function derive(item, line, native, context = {}) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const known = typeof context.known === 'function' ? context.known() === true : context.known === true;
    const rawCount = item.stackCount == null ? 1 : item.stackCount;
    const count = Number.isSafeInteger(rawCount) && rawCount > 0 ? rawCount : null;
    const gear = item.group === 'Armor' || item.group === 'Weapons';
    const ammo = gear && native.isAmmo(item);
    let material = null, construction = null;
    if (gear && !ammo) {
      if (native.isHandWraps(item)) material = 'Ткань';
      else if (!Number.isInteger(item.material) || item.material < 0) material = 'Нет данных';
      else if (native.saysMaterial(item)) {
        const variant = String(native.variantWord(item) || '').trim();
        if (variant) construction = variants[variant] || variant;
        if (variant === 'Fur') material = 'Мех';
        else {
          const name = native.material(item);
          material = name === 'Chain' ? 'Металл не указан' : name ? materialTerms[name] || native.materialLabel(name) : 'Нет данных';
        }
      } else material = line.material || 'Не указан';
    }
    let unitValue = null, source = null;
    if (known && count != null) {
      const credit = typeof context.credit === 'function' ? context.credit() : null;
      // letterWorthGold is a native display string, not a number: its non-null result identifies credit.
      if (credit != null && money(item.value)) { unitValue = Math.trunc(item.value); source = 'credit'; }
      else if (money(item.value)) { unitValue = item.value; source = 'stored'; }
      else if (native.template(item.templateIndex)) {
        const value = native.value(item);
        if (money(value)) { unitValue = value; source = 'base'; }
      }
    }
    const product = unitValue == null || count == null ? null : unitValue * count;
    const total = finite(product) && product <= Number.MAX_SAFE_INTEGER ? product : null;
    // Wallets/containers have a native contents weight; do not price their contents as the empty object.
    const ordinaryWeight = ['Weapons', 'Armor', 'MensClothing', 'WomensClothing', 'Jewellery'].includes(item.group);
    const perKg = ordinaryWeight && money(total) && finite(line.weight) && line.weight > 0
      ? total / line.weight : null;
    return { known, count, material, construction, unitValue, total, source,
      perKg: finite(perKg) && perKg <= Number.MAX_SAFE_INTEGER ? perKg : null };
  }

  const CSS = `
body .card.dfo-item-card { padding:0!important; margin:0; display:block!important; overflow:visible!important; max-height:none!important; box-sizing:border-box; }
body .card.dfo-item-card>.card-body { display:block; flex:none; min-height:0; padding:0; overflow:visible!important; max-height:none!important; }
body .inv-tip.dfo-item-host { width:max-content!important; max-width:none!important; max-height:none!important; overflow:visible!important; pointer-events:none; }
body .pack-shell .packdetail.dfo-item-host { width:max-content!important; height:auto!important; max-width:none!important; max-height:none!important; overflow:visible!important; bottom:auto!important; right:auto!important; transition:none!important; }
.dfo-item-main { display:grid; grid-template-columns:260px minmax(0,1fr); gap:14px; padding:12px; box-sizing:border-box; }
.dfo-item-left { min-width:0; border-right:1px solid #544b37; padding-right:12px; }
.dfo-item-head { display:grid; grid-template-columns:64px minmax(0,1fr); gap:10px; align-items:center; margin-bottom:12px; }
.dfo-item-card .dfo-item-head>.bigicon { width:64px; height:82px; margin:0!important; display:flex; align-items:center; justify-content:center; }
.dfo-item-card .dfo-item-head>.bigicon img,.dfo-item-card .dfo-item-head>.bigicon canvas { width:auto!important; height:auto!important; max-width:60px!important; max-height:78px!important; object-fit:contain; }
.dfo-item-card .dfo-item-title h3 { font-family:inherit; font-weight:400; font-size:18px; line-height:1.2; text-align:left; text-transform:none; letter-spacing:normal; margin:0!important; overflow-wrap:anywhere; }
.dfo-item-tier { font-size:11px; margin:0 0 4px; color:var(--rar,var(--brass,#d5b26e)); }
.dfo-item-tier::before { content:var(--rar-pips,''); margin-right:4px; font-size:9px; }
.dfo-item-card .dfo-item-stats { display:block!important; margin:0; padding:0; }
.dfo-item-card .dfo-item-stats>.pair { display:flex!important; justify-content:space-between; gap:8px; margin:0 0 6px; font-size:12px!important; line-height:1.3!important; }
.dfo-item-card .dfo-item-stats>.pair>dt { font:inherit!important; letter-spacing:normal!important; text-transform:none!important; text-align:left!important; color:var(--dim,#a89f88); }
.dfo-item-card .dfo-item-stats>.pair>dd { font:inherit!important; margin:0; text-align:right; min-width:0; overflow-wrap:anywhere; }
.dfo-item-primary { display:flex; align-items:baseline; justify-content:space-between; gap:8px; border-bottom:1px solid #454534; padding:0 0 9px; margin:0 0 10px; }
.dfo-item-primary>span { font-size:11px; color:var(--dim,#a89f88); }
.dfo-item-primary>strong { font-size:23px; line-height:1.1; font-weight:400; min-width:0; overflow-wrap:anywhere; }
.dfo-item-card .dfo-item-statuses>p { text-align:left!important; font-size:11px!important; line-height:1.35!important; margin:7px 0 0; overflow-wrap:anywhere; }
.dfo-item-effects { display:flex; flex-direction:column; gap:5px; min-width:0; }
.dfo-item-card .dfo-item-lines { display:block; padding:0; margin:0; list-style:none; font-size:12px!important; line-height:1.3!important; color:#f3cf86!important; text-align:left; }
.dfo-item-card .dfo-item-lines>li { display:block; font:inherit!important; color:inherit!important; letter-spacing:normal!important; text-transform:none!important; margin:0 0 3px; white-space:normal; overflow-wrap:anywhere; }
.dfo-item-card .dfo-item-lines>li:first-child { font-size:12px; letter-spacing:normal; text-transform:none; color:inherit; }
.dfo-item-card .dfo-item-lines>li:first-child::before { content:none!important; }
.dfo-item-card .dfo-item-meta { list-style:none; padding:8px 0 0; margin:8px 0 0; border-top:1px solid #454534; font-size:11px!important; line-height:1.4!important; overflow-wrap:anywhere; }
.dfo-item-card .dfo-item-meta>li { margin:0 0 4px; }
.dfo-item-socket-lines { font-size:11px; line-height:1.35; margin:0; }
.dfo-item-socket-lines>div { margin-bottom:4px; overflow-wrap:anywhere; }
.dfo-item-effects>.cmp { margin:0; }
.dfo-item-footer { display:flex; justify-content:flex-end; border-top:1px solid #5c4e37; padding:8px 12px 10px; text-align:right; }
.dfo-item-price { display:flex; flex-direction:column; align-items:flex-end; gap:3px; }
.dfo-item-price-label,.dfo-item-unit-price { font-size:11px; color:var(--dim,#a89f88); }
.dfo-item-price-value { font-size:19px; line-height:1.1; color:var(--brass,#efd18e); white-space:nowrap; }
`;

  function install(win) {
    if (win.__DFO_MOD_CFG__?.itemCards?.enabled === false || win.__dfoItemCards) return;
    const doc = win.document, native = {}, states = new WeakMap(), pending = new Set(), active = new Map();
    const counters = { dressed: 0, failures: 0, lastError: '', layouts: 0, placements: 0, observerCallbacks: 0 };
    let scheduled = false;
    const node = (tag, cls, text) => {
      const value = doc.createElement(tag);
      if (cls) value.className = cls;
      if (text != null) value.textContent = String(text);
      return value;
    };
    // The RU runtime translates textContent synchronously, before the shared native builder returns.
    const said = text => node('span', null, text).textContent;
    const formatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
    const format = number => formatter.format(number);
    const ready = () => DATA_KEYS.every(key => typeof native[key] === 'function');
    const addPair = (list, label, value) => {
      if (value == null || value === '') return;
      const pair = node('div', 'pair'); pair.append(node('dt', null, label), node('dd', null, value)); list.append(pair);
    };
    const ensureStyle = () => {
      if (doc.getElementById('dfo-item-cards-style')) return;
      const style = node('style'); style.id = 'dfo-item-cards-style'; style.textContent = CSS; (doc.head || doc.documentElement).append(style);
    };
    function price(state, data) {
      if (!data) return;
      const label = data.source === 'credit' ? 'Аккредитив · номинал'
        : data.source === 'base' ? 'Базовая ценность · расчёт'
          : data.count > 1 ? 'Ценность стопки · номинал' : 'Ценность · номинал';
      const value = data.total == null ? data.known ? 'Нет данных' : 'Не опознана' : format(data.total) + ' зол.';
      const unit = data.count > 1 && data.unitValue != null ? format(data.unitValue) + ' зол. / шт.' : '';
      if (state.priceLabel.textContent !== label) state.priceLabel.textContent = label;
      if (state.priceValue.textContent !== value) state.priceValue.textContent = value;
      if (state.unitPrice.textContent !== unit) state.unitPrice.textContent = unit;
      state.unitPrice.hidden = !unit;
    }

    function dress(card, line, context) {
      if (!ready() || !card || !line?.item || states.has(card) || typeof context?.known !== 'function') return;
      const into = [...card.children].find(child => child.classList.contains('card-body')) || card;
      const original = [...into.childNodes];
      try {
        const data = derive(line.item, line, native, context);
        if (!data) return;
        const main = node('div', 'dfo-item-main'), left = node('div', 'dfo-item-left'), effects = node('div', 'dfo-item-effects');
        const head = node('div', 'dfo-item-head'), title = node('div', 'dfo-item-title');
        const stats = node('dl', 'stats dfo-item-stats'), statuses = node('div', 'dfo-item-statuses');
        const meta = node('ul', 'dfo-item-meta'), socketLines = node('div', 'dfo-item-socket-lines');
        const wantedMeta = new Map();
        for (const text of context.meta || []) { const key = said(text); wantedMeta.set(key, (wantedMeta.get(key) || 0) + 1); }
        // The native non-common rarity attribute guarantees a tier line after crafting/heirloom metadata.
        // Keep its original wording, including Perfect / Exalted / Cursed / Damned and any locale.
        const hasTier = !!card.dataset.rarity && card.dataset.rarity !== 'common';
        const labels = { damage: said('Damage'), armour: said('Armour'), worth: said('Worth'), type: said('Type') };
        let icon = null, name = null, primary = null, tier = null;
        const leftNative = [], rightNative = [];
        for (const child of [...into.children]) {
          if (child.classList.contains('bigicon')) { icon = child; continue; }
          if (child.tagName === 'H3') { name = child; continue; }
          if (child.classList.contains('meta')) continue; // Its material and stack now have explicit, separate rows.
          if (child.tagName === 'DL' && child.classList.contains('stats')) {
            for (const pair of [...child.children]) {
              const label = pair.querySelector('dt')?.textContent || '';
              if (label === labels.damage || label === labels.armour) { primary = pair.cloneNode(true); continue; }
              if (label === labels.worth && data.source === 'credit') continue;
              const copy = pair.cloneNode(true);
              if (label === labels.type) copy.querySelector('dt').textContent = 'Тип брони';
              stats.append(copy);
            }
            continue;
          }
          if (child.tagName === 'UL' && child.classList.contains('rarity')) {
            const list = child.cloneNode(false); list.classList.add('dfo-item-lines');
            for (const originalLine of [...child.children]) {
              const text = originalLine.textContent;
              if ((wantedMeta.get(text) || 0) > 0) { wantedMeta.set(text, wantedMeta.get(text) - 1); meta.append(originalLine.cloneNode(true)); }
              else if (!tier && hasTier) tier = text;
              else list.append(originalLine.cloneNode(true));
            }
            if (list.children.length) rightNative.push(list);
            continue;
          }
          if (child.matches('.lockline,.boundline')) { statuses.append(child.cloneNode(true)); continue; }
          if (child.classList.contains('sock-wells') || child.classList.contains('sock-choose') || child.classList.contains('sock-none')) {
            leftNative.push(child);
            if (data.known) for (const well of child.querySelectorAll('.sock-well')) {
              const text = well.getAttribute('title') || well.getAttribute('aria-label');
              if (text) socketLines.append(node('div', null, text));
            }
            continue;
          }
          rightNative.push(child); // Preserve current and future native integrations as actual nodes.
        }
        if (tier) title.append(node('div', 'dfo-item-tier', tier));
        if (name) title.append(name);
        if (icon) head.append(icon); else head.style.gridTemplateColumns = 'minmax(0,1fr)';
        head.append(title); left.append(head);
        if (primary) {
          const badge = node('div', 'dfo-item-primary');
          badge.append(node('span', null, primary.querySelector('dt')?.textContent), node('strong', null, primary.querySelector('dd')?.textContent));
          left.append(badge);
        }
        addPair(stats, 'Материал', data.material);
        if (data.construction && data.construction !== data.material) addPair(stats, 'Конструкция', data.construction);
        if (data.count > 1) addPair(stats, 'Количество', data.count);
        if (data.perKg != null) addPair(stats, 'Ценность / кг', format(data.perKg) + ' зол.');
        left.append(stats);
        if (statuses.children.length) left.append(statuses);
        if (meta.children.length) left.append(meta);
        left.append(...leftNative);
        effects.append(...rightNative);
        if (socketLines.children.length) effects.append(socketLines);
        main.append(left, effects);
        const footer = node('div', 'dfo-item-footer'), priceBox = node('div', 'dfo-item-price');
        const priceLabel = node('span', 'dfo-item-price-label'), unitPrice = node('span', 'dfo-item-unit-price'), priceValue = node('strong', 'dfo-item-price-value');
        priceBox.append(priceLabel, unitPrice, priceValue); footer.append(priceBox);
        // A native render is a snapshot: sizing must not repeatedly read game rules or mix a fresh price with old stats.
        const state = { main, footer, priceLabel, priceValue, unitPrice, dirty: true, host: null };
        price(state, data);
        into.replaceChildren(main, footer);
        card.classList.add('dfo-item-card');
        states.set(card, state); counters.dressed++;
        ensureStyle();
        // Initial construction can be detached. The native fit call performs the connected measurement.
        card.style.width = Math.min(600, Math.max(1, (win.innerWidth || 1920) - 16)) + 'px';
      } catch (error) {
        into.replaceChildren(...original); card.classList.remove('dfo-item-card'); states.delete(card);
        counters.failures++; counters.lastError = String(error?.message || error);
      }
    }

    function hostOf(card) { return card.closest('.inv-tip,.packdetail'); }
    function viewport() {
      const v = win.visualViewport;
      const width = Math.max(0, Math.min(win.innerWidth, v?.width ?? win.innerWidth));
      const height = Math.max(0, Math.min(win.innerHeight, v?.height ?? win.innerHeight));
      const pad = Math.min(8, width / 4, height / 4);
      return { left: (v?.offsetLeft || 0) + pad, top: (v?.offsetTop || 0) + pad,
        width: Math.max(0, width - pad * 2), height: Math.max(0, height - pad * 2) };
    }
    function extent(host) {
      const box = host.getBoundingClientRect();
      const sx = host.offsetWidth ? box.width / host.offsetWidth : 1;
      const sy = host.offsetHeight ? box.height / host.offsetHeight : 1;
      // Include native chrome, actions, wallet/binder sheets and any unbroken overflowing labels.
      return { box, width: Math.max(box.width, host.scrollWidth * sx), height: Math.max(box.height, host.scrollHeight * sy) };
    }
    const shape = host => {
      const e = extent(host);
      return [e.width.toFixed(2), e.height.toFixed(2), host.offsetWidth, host.offsetHeight].join(':');
    };
    function release(card, state) {
      for (const observer of state.observers || []) observer.disconnect();
      active.delete(card); pending.delete(card); state.host = null; state.observers = null;
    }
    function track(card, state, host) {
      if (state.host === host) return;
      for (const [other, old] of active) if (!other.isConnected) release(other, old);
      if (state.host) release(card, state);
      state.host = host; state.observers = []; active.set(card, state);
      // Observe only the card and its ancestor chain, never the game's entire HUD subtree.
      const content = new win.MutationObserver(() => {
        counters.observerCallbacks++;
        if (!card.isConnected) return release(card, state);
        if (shape(host) !== state.shape) queue(card, true);
      });
      content.observe(host, { childList: true, characterData: true, subtree: true }); state.observers.push(content);
      const position = new win.MutationObserver(records => {
        counters.observerCallbacks++;
        if (!card.isConnected) return release(card, state);
        const moved = records.some(r => r.type === 'attributes' && (r.target !== host || host.style.cssText !== state.styleStamp || host.className !== state.classStamp));
        if (moved) fit(card, shape(host) !== state.shape);
      });
      for (let parent = host; parent; parent = parent.parentElement) {
        position.observe(parent, { attributes: true, attributeFilter: ['style', 'class'], childList: true });
      }
      state.observers.push(position);
      if (win.ResizeObserver) {
        const resized = new win.ResizeObserver(() => {
          counters.observerCallbacks++;
          if (!card.isConnected) return release(card, state);
          if (shape(host) !== state.shape) fit(card, true);
        });
        resized.observe(host); state.observers.push(resized);
      }
    }
    function measure(card, state, host, view) {
      counters.layouts++;
      // Reset emergency zoom before measuring; ordinary Full HD cards keep their original text size.
      host.style.zoom = '1';
      const initial = host.getBoundingClientRect();
      const parentScale = host.offsetWidth ? initial.width / host.offsetWidth : 1;
      const limit = Math.max(320, view.width / (parentScale || 1));
      const widths = [...new Set([600, 640, 700, 740].map(width => Math.min(width, limit)))];
      for (const width of widths) {
        card.style.width = width + 'px';
        state.main.style.gridTemplateColumns = Math.min(260, Math.round(width * 0.44)) + 'px minmax(0,1fr)';
        if (extent(host).height <= Math.min(960, view.height)) break;
      }
      const size = extent(host);
      const zoom = Math.min(1, view.width / Math.max(1, size.width), view.height / Math.max(1, size.height));
      // Last resort for physically oversized cards: keep every line, with no cropping or inner scrolling.
      host.style.zoom = String(Math.max(0.00001, zoom < 1 ? zoom * 0.998 : 1));
      state.dirty = false;
    }
    function place(host, view) {
      counters.placements++;
      for (let attempt = 0; attempt < 2; attempt++) {
        const e = extent(host), box = e.box;
        const x = Math.max(view.left, Math.min(box.left, view.left + view.width - e.width));
        const y = Math.max(view.top, Math.min(box.top, view.top + view.height - e.height));
        const dx = x - box.left, dy = y - box.top;
        if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) break;
        const left = Number.parseFloat(host.style.left) || host.offsetLeft || 0;
        const top = Number.parseFloat(host.style.top) || host.offsetTop || 0;
        // Measure the coordinate conversion, including CSS zoom and scaled containing blocks.
        // The probe and correction run synchronously before paint; the probe is never visible.
        host.style.left = left + 16 + 'px'; host.style.top = top + 16 + 'px';
        const moved = host.getBoundingClientRect();
        const sx = (moved.left - box.left) / 16 || 1, sy = (moved.top - box.top) / 16 || 1;
        host.style.left = left + dx / sx + 'px'; host.style.top = top + dy / sy + 'px';
      }
    }
    function fit(card, dirty = false) {
      const state = states.get(card);
      if (!state) return false;
      const host = hostOf(card);
      if (!host || !host.isConnected) { state.dirty = true; return true; }
      try {
        if (!host.classList.contains('dfo-item-host')) host.classList.add('dfo-item-host');
        for (const cls of ['tip-compact', 'tip-tight']) if (host.classList.contains(cls)) host.classList.remove(cls);
        for (const cls of ['card-compact', 'card-tight']) if (card.classList.contains(cls)) card.classList.remove(cls);
        if (card.style.maxHeight !== 'none') card.style.maxHeight = 'none';
        track(card, state, host);
        const view = viewport(), key = [view.width, view.height].join(':');
        if (!view.width || !view.height) {
          host.style.visibility = 'hidden'; state.styleStamp = host.style.cssText; state.classStamp = host.className; return true;
        }
        if (state.dirty || dirty || state.view !== key) measure(card, state, host, view);
        place(host, view);
        // Account for fractional layout rounding and unusual overflowing native rows after zoom.
        const e = extent(host);
        if (e.width > view.width + 0.05 || e.height > view.height + 0.05) {
          host.style.zoom = String((Number(host.style.zoom) || 1) * Math.min(view.width / e.width, view.height / e.height) * 0.998);
          place(host, view);
        }
        if (host.style.visibility !== 'visible') host.style.visibility = 'visible';
        state.view = key; state.shape = shape(host); state.styleStamp = host.style.cssText; state.classStamp = host.className;
      } catch (error) { counters.failures++; counters.lastError = String(error?.message || error); }
      return true;
    }
    function queue(card, dirty = false) {
      const state = states.get(card);
      if (!state) return;
      state.dirty ||= dirty;
      pending.add(card);
      if (scheduled) return;
      scheduled = true;
      win.requestAnimationFrame(() => {
        scheduled = false;
        const batch = [...pending]; pending.clear();
        for (const card of batch) {
          const state = states.get(card);
          if (!card.isConnected) { if (state?.host) release(card, state); }
          else fit(card);
        }
      });
    }
    const refresh = () => {
      for (const [card, state] of active) {
        if (card.isConnected) fit(card, shape(state.host) !== state.shape); else release(card, state);
      }
    };
    const reposition = () => { for (const [card, state] of active) { if (card.isConnected) fit(card); else release(card, state); } };
    win.addEventListener('resize', refresh);
    win.addEventListener('scroll', reposition, { capture: true, passive: true });
    win.visualViewport?.addEventListener('resize', refresh);
    win.visualViewport?.addEventListener('scroll', reposition);
    doc.fonts?.addEventListener?.('loadingdone', refresh);
    win.__dfoItemCards = Object.freeze({
      register(parts) { for (const key of DATA_KEYS) if (typeof parts?.[key] === 'function') native[key] = parts[key]; },
      dress,
      // The native second argument is room in pixels, not our internal dirty/invalidation flag.
      fitCard(card) {
        const state = states.get(card);
        if (!state) return false;
        const host = hostOf(card);
        return fit(card, !!(state?.shape && host && shape(host) !== state.shape));
      },
      fitTip(host) { const card = host?.querySelector('.dfo-item-card'); return card ? fit(card) : false; },
      stats: () => ({ ...counters, ready: ready(), active: active.size, pending: pending.size }),
    });
  }
  return { derive, install, CSS };
});
