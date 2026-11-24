(function (root, factory) {
  'use strict'; const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root?.document) api.install(root); else if (typeof root?.postMessage === 'function') root.__dfoFontTools = api;
})(typeof globalThis === 'object' ? globalThis : null, function () {
  'use strict';
  const files = { Gabin: 'item-font-text.ttf', Greengoth: 'item-font-title.ttf', Flexi: 'item-font-numbers.ttf', Hangyaku: 'book-font-text.ttf', Ckazka: 'item-font-sigil.ttf', Ritalin: 'item-font-set.ttf', Wolga: 'item-font-legendary.otf', Flow: 'item-font-description.otf' };
  const slotDefs = [
    { id: 'body', family: 'Gabin', baseFile: 'item-font-text.ttf' },
    { id: 'title', family: 'Greengoth', baseFile: 'item-font-title.ttf' },
    { id: 'description', family: 'Flow', baseFile: 'item-font-description.otf' },
    { id: 'number', family: 'Flexi', baseFile: 'item-font-numbers.ttf' },
    { id: 'book', family: 'Hangyaku', baseFile: 'book-font-text.ttf' },
    { id: 'power', family: 'Wolga', baseFile: 'item-font-legendary.otf' },
    { id: 'sigil', family: 'Ckazka', baseFile: 'item-font-sigil.ttf' },
    { id: 'set', family: 'Ritalin', baseFile: 'item-font-set.ttf' },
  ];
  const slotFamilies = slotDefs.map(s => s.family);
  const formatOfFile = file => { const l = String(file || '').toLowerCase(); return l.endsWith('.otf') ? 'opentype' : l.endsWith('.woff2') ? 'woff2' : l.endsWith('.woff') ? 'woff' : 'truetype'; };
  const userBaseOf = base => /\/fonts\/$/i.test(base) ? base.replace(/\/fonts\/$/i, '/user-fonts/') : base + 'user-fonts/';
  const resolveSlots = (base, preset, revision = '1.30.0') => {
    const customRev = preset?.revision ? `${revision}-${preset.revision}` : revision;
    const baseQuery = '?dfo=' + encodeURIComponent(revision);
    const customQuery = '?dfo=' + encodeURIComponent(customRev);
    const uBase = userBaseOf(base);
    const out = [];
    for (const def of slotDefs) {
      let ov = preset?.slots?.[def.id];
      if (def.id === 'description' && (!ov || ov.mode !== 'custom') && preset?.slots?.narrative?.mode === 'custom') ov = preset.slots.narrative;
      const isCustom = ov && ov.mode === 'custom' && typeof ov.file === 'string' && ov.file && !/[\\/]|\.\./.test(ov.file);
      const baseUrl = base + def.baseFile + baseQuery;
      const baseFormat = formatOfFile(def.baseFile);
      const url = isCustom ? (uBase + encodeURIComponent(ov.file) + customQuery) : baseUrl;
      const format = (isCustom && ov.format) || formatOfFile(isCustom ? ov.file : def.baseFile);
      const src = isCustom ? `url(${JSON.stringify(url)}) format('${format}'),url(${JSON.stringify(baseUrl)}) format('${baseFormat}')` : `url(${JSON.stringify(baseUrl)}) format('${baseFormat}')`;
      out.push({ id: def.id, family: def.family, url, format, baseUrl, baseFormat, src, custom: !!isCustom, file: isCustom ? ov.file : def.baseFile });
    }
    return out;
  };
  const stacks = {
    body: "'DFO Gabin','DFO Flexi','DFO Ritalin',sans-serif",
    title: "'DFO Greengoth','DFO Gabin','DFO Flexi',sans-serif",
    description: "'DFO Flow','DFO Flexi','DFO Gabin','DFO Hangyaku',sans-serif",
    number: "'DFO Flexi','DFO Gabin','DFO Ritalin',sans-serif",
    book: "'DFO Hangyaku','DFO Gabin','DFO Flexi',sans-serif",
    sigil: "'DFO Ckazka','DFO Flexi','DFO Hangyaku',sans-serif",
    set: "'DFO Ritalin','DFO Gabin','DFO Flexi',sans-serif",
    power: "'DFO Wolga','DFO Gabin','DFO Flexi',sans-serif",
  };
  for (const role of Object.keys(stacks)) {
    const names = [...stacks[role].matchAll(/'DFO ([^']+)'/g)].map(m => m[1]);
    // Keep Ckazka completely out of description/prose fallback chains.
    const pool = role === 'description' ? slotFamilies.filter(f => f !== 'Ckazka') : slotFamilies;
    const baseTail = role === 'number' ? ['Base Num', 'Base Text'] : ['Base Text', 'Base Num'];
    stacks[role] = [...new Set([...names, ...pool, ...baseTail])].map(n => "'DFO " + n + "'").join(',') + ',sans-serif';
  }
  const ownFamily = /\bDFO (Gabin|Greengoth|Flexi|Hangyaku|Ckazka|Ritalin|Wolga|Flow|Narrative|Base Num|Base Text)\b/;
  const roles = { Gabin: 'body', Greengoth: 'title', Flexi: 'number', Hangyaku: 'book', Ckazka: 'sigil', Ritalin: 'set', Wolga: 'power', Flow: 'description', Narrative: 'description', 'Base Num': 'number', 'Base Text': 'body' };
  const fontMappings = new Map();
  const bookSize = px => Math.max(1, Math.round(px * 1.35));
  const seed = [...Array.from({ length: 95 }, (_, i) => 32 + i), ...Array.from({ length: 64 }, (_, i) => 1040 + i), 1025, 1105, 8211, 8212, 8230, 8470, 8594, 177, 215, 8734, ...Array.from({ length: 96 }, (_, i) => 160 + i)];
  const EMPTY_MARK = Object.freeze({}), SMALL_NEAR = Object.freeze({ dfoSmall: true, dfoQuiet: false }), SMALL_QUIET = Object.freeze({ dfoSmall: true, dfoQuiet: true });
  function css(base, revision = '1.30.0', preset = null) {
    const baseQuery = '?dfo=' + encodeURIComponent(revision);
    const resolved = resolveSlots(base, preset, revision);
    const slotFaces = resolved.map(s => `@font-face{font-family:'DFO ${s.family}';src:${s.src};font-style:normal;font-weight:400;font-display:swap;}`);
    const baseFallbacks = [
      `@font-face{font-family:'DFO Base Text';src:url(${JSON.stringify(base + 'item-font-text.ttf' + baseQuery)}) format('truetype');font-style:normal;font-weight:400;font-display:swap;}`,
      `@font-face{font-family:'DFO Base Num';src:url(${JSON.stringify(base + 'item-font-numbers.ttf' + baseQuery)}) format('truetype');font-style:normal;font-weight:400;font-display:swap;}`,
    ];
    const faces = [...slotFaces, ...baseFallbacks].join('\n');
    return faces + `\n/* DFO community fonts */
@layer dfo-community-fonts {
 :root {--display:${stacks.title}!important;--brand:${stacks.title}!important;--data:${stacks.body}!important;--body:${stacks.body}!important;--daggerfall-online-text-font:${stacks.body}!important;--pixel-font:${stacks.body}!important;--dfo-text-font:${stacks.body}!important;--dfo-narrative-font:${stacks.description}!important;--dfo-font-body:${stacks.body}!important;--dfo-font-ui:${stacks.body}!important;--dfo-font-title:${stacks.title}!important;--dfo-font-description:${stacks.description}!important;--dfo-font-desc:${stacks.description}!important;--dfo-font-narrative:${stacks.description}!important;--dfo-font-number:${stacks.number}!important;--dfo-font-num:${stacks.number}!important;--dfo-font-book:${stacks.book}!important;--dfo-font-power:${stacks.power}!important;--dfo-font-sigil:${stacks.sigil}!important;--dfo-font-set:${stacks.set}!important;--dfo-cur-font:${stacks.body};}
 :root body {font-family:var(--dfo-cur-font)!important;--dfo-title-step:0px!important;}
 :root body * {font-family:var(--dfo-cur-font)!important;}
 :root body *::before,:root body *::after {font-family:${stacks.body}!important;--dfo-title-step:0px!important;}
 :root body :is(h1,h2,h3,h4,h5,h6,[role=heading],.px-wordmark,.brand h1,.look-emblem,.window-title,.dialog-title,.panel-title) {font-family:${stacks.title}!important;--dfo-cur-font:${stacks.title}!important;--dfo-title-step:2px!important;}
 :root body :is(.dfo-item-group>h4,.dfo-item-stat-heading) {font-family:${stacks.body}!important;--dfo-cur-font:${stacks.body}!important;--dfo-title-step:0px!important;}
 :root body :is(.sigil-stage,.sigilbox .sigil-stage) {font-family:${stacks.sigil}!important;--dfo-cur-font:${stacks.sigil}!important;--dfo-title-step:0px!important;}
 :root body :is(.set-name,.setbox .set-name,.setline-name) {font-family:${stacks.set}!important;--dfo-cur-font:${stacks.set}!important;--dfo-title-step:0px!important;}
 :root body .dfo-item-power-name {font-family:${stacks.power}!important;--dfo-cur-font:${stacks.power}!important;--dfo-title-step:0px!important;}
 :root body :is(.dfo-item-text,.set-lore-text,.dfo-rar-card-desc,.dfo-fate-plea,.dfo-gm-p,.dfo-fxp-alert-text,.dfo-fxp-mech-p,.dfo-fxed-disabled-msg) {font-family:${stacks.description}!important;--dfo-cur-font:${stacks.description}!important;--dfo-title-step:0px!important;}
 :root body .dfo-item-title h3 {font-family:${stacks.title}!important;--dfo-cur-font:${stacks.title}!important;--dfo-title-step:2px!important;}
 :root body :is(.itemname>span,.wornname,.inv-menu-head) {font-family:${stacks.title}!important;--dfo-cur-font:${stacks.title}!important;--dfo-title-step:2px!important;}
 :root body .pack-shell .wornname {--dfo-title-step:0px!important;}
 :root body :is(.dfo-item-primary strong,.dfo-item-price-value) {font-family:${stacks.number}!important;--dfo-cur-font:${stacks.number}!important;--dfo-title-step:0px!important;}
 /* Mixed-case literary & prose face (DFO Flow — unified with item descriptions; zero Ckazka).
    Using :where(...) keeps specificity at (0,1,1) - above ':root body *' (0,1,1) by source order,
    while NEVER overriding h1..h6 headings (0,2,1), numeric counters, or UI buttons/tags below.
    Descendants inherit --dfo-cur-font and --dfo-title-step natively without universal '*' ancestor walks.
    1) Service messages, statuses & right-side notifications
    2) NPC dialogue text
    3) Quest journal prose
    4) In-game chat messages, names & input */
 :root body :where(.hudstatus,.hudmid,.hudprison,.lv-note,.herald-line,.notice-body,.notice-row:not(.herald-kind):not(.herald-title):not(.tut-title),.notice-cell,.notice-text,.notice-snippet,.notice-chronicle,.notice-tip,.qtrack-line,.qtrack-where,.qtrack-note,.kt-hud-line,.kt-hud-sub,.dlg-body,.dlg-row,.dlg-cell,.inputbox-rows,.inputbox .notice-row,.inv-info .inv-info-box p,.inv-tip.hud-tip .hud-tip-line,.inv-tip.hud-tip .hud-tip-foot,.inv-tip.hud-tip .meta,.dfo-status-tip .dfo-st-line,.dfo-status-tip .dfo-st-intro,.dfo-status-tip .dfo-st-p-desc,.dfo-status-tip .dfo-st-fv,.dfo-status-tip .dfo-st-click-sub,.dfsocial-toast,.dfduel-toast,.px-postwin .pm-body,.px-postwin .pm-say,.px-postwin .pm-empty,.pack-shell .fate-plea,.pack-shell .fate-body,.pack-shell .fate-confirm p) {font-family:${stacks.description}!important;--dfo-cur-font:${stacks.description}!important;--dfo-title-step:0px!important;}
 :root body :where(.talk-log,.talk-entry,.talk-q,.talk-regard-words,.talk-hint) {font-family:${stacks.description}!important;--dfo-cur-font:${stacks.description}!important;--dfo-title-step:0px!important;}
 :root body :where(.px-qdetail .px-qdesc,.px-qdetail .px-qentry,.px-qdetail .px-qoutcome,.px-qdetail .px-qobj-text,.px-qdetail .px-qobj-choice,.px-qdetail .px-qobj-q,.px-qdetail .px-qobj-a,.px-qdetail .px-qobj-outcome,.px-qdetail .px-qobj-reward,.px-qdetail .px-qline-what,.px-qdetail .px-qline-lead,.px-qdetail .px-qline-giver,.px-qdetail .px-qline-who,.px-qdetail .px-qline-said,.px-qdetail .px-note,.px-qdetail .px-qwhere,.px-qdetail .px-qentry-where) {font-family:${stacks.description}!important;--dfo-cur-font:${stacks.description}!important;--dfo-title-step:0px!important;}
 :root body :where(.dfchat-line .dfchat-text,.dfchat-line .dfchat-name,.dfchat-who-name,.dfchat-input,.dfchat-status,.dfchat-find-none,.dfchat-suggest-label,.dfchat-chan-hint) {font-family:${stacks.description}!important;--dfo-cur-font:${stacks.description}!important;--dfo-title-step:0px!important;}
 :root body .dfchat-line {font-size:calc(13.5px * var(--dfchat-scale,1))!important;line-height:1.4!important;}
 /* Keep interactive controls, uppercase tags & keycap hints inside narrative containers in the UI font (specificity 0,2,1 > 0,1,1) */
 :root body :is(.notice-hint,.herald-kind,.herald-title,.tut-title,.dlg-btn,.dlg-key,.dfsocial-btn,.dfduel-btn,.px-divword,.px-qverdict,.px-qobj-state,.px-qobj-tag,.px-qobj-or,.px-qarch),
 :root body :where(.notice-body,.dlg-body,.dlg-acts,.inputbox,.dfsocial-toast,.dfduel-toast,.px-qdetail,.talk-log) :is(button,.act) {font-family:${stacks.body}!important;--dfo-cur-font:${stacks.body}!important;--dfo-title-step:0px!important;}
 /* Mod UI semantic role assignments inside @layer dfo-community-fonts so Bank, Trade, Spellmaker, Inventory,
    Containers, Dungeons, Town Map, Loot Filter & Quick Cards honor both base and player-customized slots. */
 :root body :where(.port-bank .port-title,.port-bank .port-heading,.dfo-trade-mode-tag,.port-spellmaker .port-title,.dfo-sm-panel-title,.port-spellmaker .dfo-sm-win .dfo-ornate-btn,.port-spellmaker .dfo-sm-action-btn,.dfo-sm-name-input,.dfo-sm-fx-name,.dfo-sm-icon-cur-lbl,.dfo-status-tip.dfo-sm-tip .dfo-st-head,.dfo-sm-pane-title,.dfo-gm-card-title,.dfo-gm-close-btn,.dfo-fxp-sch-name,.dfo-fxp-hero-name,.dfo-fxp-alert-title,.dfo-fxp-sec-title,.dfo-fxp-cancel-btn,.dfo-fxp-confirm-btn,.dfo-fxed-panel-title,.dfo-fxed-preview-top,.dfo-fxed-disabled-title,.dfo-fxed-win .dfo-ornate-btn,.dfo-reward-prev-name,.dfo-fate-spare-title,.dfo-live-panel-head,.dfo-dungeon-dialog .wh .t,.dfo-dungeon-title,.dfo-dungeon-dialog .sec,.dfo-sec-title,.wplaque-title,.dfo-quick-name,.dfo-loot-dialog .wh .t,.dfo-loot-dialog legend,.dfo-status-tip .dfo-st-click-title,.dfo-pack-dtitle,.dfo-sort-name,#dfo-city-ui .dfo-title .n,#dfo-city-ui .dfo-key .sec,#dfo-city-ui .dfo-win table.grid th,#dfo-city-ui .dfo-win .sec),
 :root body :where(dialog.dfo-cartography-dialog .wh,dialog.dfo-seal-modal .wh,#dfo-city-ui .dfo-key .h,#dfo-city-ui .dfo-win .wh) {font-family:${stacks.title}!important;--dfo-cur-font:${stacks.title}!important;--dfo-title-step:0px!important;}
 :root body :where(dialog.dfo-cartography-dialog .wh,dialog.dfo-seal-modal .wh,#dfo-city-ui .dfo-key .h,#dfo-city-ui .dfo-win .wh)>button {font-family:${stacks.body}!important;--dfo-cur-font:${stacks.body}!important;--dfo-title-step:0px!important;}
 :root body :where(.wplaque-count,.dfo-quick-primary>strong,.dfo-row-kg,.piletab .piletabn,.dfo-loot-gold .v,.dfo-loot-carry .v,.dfo-carry-free,.dfo-find-count,.dfo-dd-count,.dfo-opt-count,.itemrow .itemwt,.dfo-fate-key,.dfo-loot-modal-input,.dfo-live-rating,.dfo-live-stat strong,.dfo-dungeon-counters dd,.dfo-cartography-dialog .dfo-stat-value,.dfo-banner-val,.wornac-total .v,.worntemp-total .v,.wornrow .wornac,.setline-count,.sf-v2-split .sf-tv,.sf-v2-split .sf-v,.dfo-st-pg-count,.dfo-st-p-val,.dfo-st-bonus-v,.dfo-sm-kpi-v,.dfo-sm-pane-count,.packtab .count,.dfo-vil-v,.dfo-curr-chip .v,.packcarry .v,.dfo-st-card-v,.dfo-bank-assets>.port-stats .port-stat dd,.dfo-bank-coin-val,.dfo-bank-scene-half>.port-stats dd,.port-actions.dfo-bank-btn-grid .port-btn,.dfo-bank-silver-panel>.port-stats dd,.dfo-bank-ships-panel>.port-stats dd,.dfo-bank-modal-input,.dfo-trade-modal-input,.dfo-service-help-formula,.dfo-trade-qty .qtyfield input,.dfo-trade-bottom .trade-fig b,.dfo-sm-res-val,.dfo-sm-name-count,.dfo-sm-fx-counter,.dfo-sm-icon-count,.dfo-sm-fx-idx,.dfo-sm-fx-sp,.dfo-sm-school-tab-cnt,.dfo-sm-school-sec-cnt,.dfo-gm-formula-v,.dfo-fxp-sch-cnt,.dfo-fxp-id-badge,.dfo-fxp-spoiler table.dfo-kv td,.dfo-fxed-slot-pill,.port-spellmaker .dfo-stat-value,.dfo-fxed-spell-mult,.dfo-fxed-spell-mp,.dfo-fxed-spell-gp,.dfo-fxed-help-dot,.dfo-fxed-live-badge,.dfo-fxed-row-range,.dfo-fxed-step,.dfo-fxed-input) {font-family:${stacks.number}!important;--dfo-cur-font:${stacks.number}!important;--dfo-title-step:0px!important;}
 /* Explicit per-element modular font opt-in attribute for any UI widget */
 :root body [data-dfo-font="body"] {font-family:${stacks.body}!important;--dfo-cur-font:${stacks.body}!important;--dfo-title-step:0px!important;}
 :root body [data-dfo-font="title"] {font-family:${stacks.title}!important;--dfo-cur-font:${stacks.title}!important;--dfo-title-step:0px!important;}
 :root body [data-dfo-font="description"] {font-family:${stacks.description}!important;--dfo-cur-font:${stacks.description}!important;--dfo-title-step:0px!important;}
 :root body [data-dfo-font="number"] {font-family:${stacks.number}!important;--dfo-cur-font:${stacks.number}!important;--dfo-title-step:0px!important;}
 :root body [data-dfo-font="book"] {font-family:${stacks.book}!important;--dfo-cur-font:${stacks.book}!important;--dfo-title-step:0px!important;}
 :root body [data-dfo-font="power"] {font-family:${stacks.power}!important;--dfo-cur-font:${stacks.power}!important;--dfo-title-step:0px!important;}
 :root body [data-dfo-font="sigil"] {font-family:${stacks.sigil}!important;--dfo-cur-font:${stacks.sigil}!important;--dfo-title-step:0px!important;}
 :root body [data-dfo-font="set"] {font-family:${stacks.set}!important;--dfo-cur-font:${stacks.set}!important;--dfo-title-step:0px!important;}
 /* Lower-priority defaults cover headings/names without an authored size.
    Their descendants inherit the result; no repeated +2 on nested spans. */
 :where(h1){font-size:calc(2em + var(--dfo-title-step,0px));}
 :where(h2){font-size:calc(1.5em + var(--dfo-title-step,0px));}
 :where(h3){font-size:calc(1.17em + var(--dfo-title-step,0px));}
 :where(h4){font-size:calc(1em + var(--dfo-title-step,0px));}
 :where(h5){font-size:calc(.83em + var(--dfo-title-step,0px));}
 :where(h6){font-size:calc(.67em + var(--dfo-title-step,0px));}
 :where([role=heading],.px-wordmark,.look-emblem,.window-title,.dialog-title,.panel-title,.itemname>span,.inv-menu-head){font-size:calc(1em + var(--dfo-title-step,0px));}
}
/* /DFO community fonts */
@layer dfo-community-fonts {
 :root body .hst-name {font-size:11px!important;line-height:1.2!important;white-space:normal!important;word-break:normal!important;overflow-wrap:normal!important;hyphens:none!important;max-width:240px!important;overflow:visible!important;text-overflow:clip!important;align-self:center!important;}
 :root body .hst-cell {align-items:center!important;}
 :root body .pack-shell .shelflabel {max-width:none!important;overflow:visible!important;text-overflow:clip!important;white-space:normal!important;word-break:normal!important;overflow-wrap:normal!important;text-align:center!important;}
 :root body .pack-shell .shelfgrp {min-width:min-content!important;}
 :root body .pack-shell .wornshelf {flex-wrap:wrap!important;}
 :root body .pack-shell .packtab .count {flex-shrink:0!important;min-width:4ch!important;text-align:right!important;}
 :root body :is(.itemrow .count,.itemrow .rowcount,.worncount,.hud-qcount,.hb-count) {font-family:${stacks.number}!important;--dfo-cur-font:${stacks.number}!important;font-size:12px!important;font-weight:400!important;line-height:1.1!important;letter-spacing:0!important;font-variant-numeric:tabular-nums;--dfo-title-step:0px!important;text-shadow:1px 0 #000,-1px 0 #000,0 1px #000,0 -1px #000,0 0 3px #000!important;}
 @media(min-width:1200px){
  :root body .pack-shell:not(.paired)>.pack-win {width:min(1160px,95vw)!important;}
  :root body .pack-shell:not(.paired) .pack {grid-template-columns:minmax(0,1fr) minmax(420px,500px)!important;}
 }
 /* Arms and hit rectangles occupy fixed directions; text cannot move a ray.
    All ornaments are shapes, independent of the font's diamond glyph. */
 :root body .px-rose .px-arm {box-sizing:border-box!important;width:32%!important;height:70px!important;min-width:0!important;min-height:0!important;padding:4px!important;gap:5px!important;justify-content:center!important;text-align:center!important;white-space:normal!important;overflow-wrap:normal!important;letter-spacing:.06em!important;text-indent:0!important;transform:translate(-50%,-50%)!important;flex-direction:column!important;line-height:1.2!important;}
 :root body .px-rose .px-n {left:50%!important;top:12%!important;right:auto!important;bottom:auto!important;}
 :root body .px-rose .px-s {left:50%!important;top:88%!important;right:auto!important;bottom:auto!important;}
 :root body .px-rose .px-e {left:84%!important;top:50%!important;right:auto!important;bottom:auto!important;}
 :root body .px-rose .px-w {left:16%!important;top:50%!important;right:auto!important;bottom:auto!important;}
 :root body .px-arm::before,:root body .px-arm::after {display:none!important;}
 :root body .dfo-dial-ray {position:absolute!important;pointer-events:none!important;background:rgba(125,116,96,.55)!important;}
 :root body .dfo-ray-n,:root body .dfo-ray-s {left:calc(50% - 1px)!important;width:2px!important;height:26%!important;}
 :root body .dfo-ray-n {top:24%!important;}
 :root body .dfo-ray-s {top:50%!important;}
 :root body .dfo-ray-e,:root body .dfo-ray-w {top:calc(50% - 1px)!important;height:2px!important;width:18%!important;}
 :root body .dfo-ray-e {left:50%!important;}
 :root body .dfo-ray-w {left:32%!important;}
 :root body .px-arm .px-term,:root body .px-arm .px-c {font-size:0!important;text-shadow:none!important;width:7px!important;height:7px!important;border:1px solid currentColor!important;transform:rotate(45deg)!important;flex:none!important;order:0!important;}
 :root body .px-arm .px-c {position:absolute!important;bottom:0!important;background:currentColor!important;width:3px!important;height:3px!important;}
 :root body .px-knot {font-size:0!important;text-shadow:none!important;box-sizing:border-box!important;transform:translate(-50%,-50%) rotate(45deg)!important;}
 :root body .px-knot-outer {width:32px!important;height:32px!important;border:2px solid rgba(125,116,96,.4)!important;}
 :root body .px-knot-mid {width:18px!important;height:18px!important;border:2px solid var(--brass,#b08d57)!important;}
 :root body .px-knot-core {width:6px!important;height:6px!important;background:#f3ef2c!important;}
}`;
  }
  // No observers or frame callbacks: layout follows native CSS, marks the
  // native map draw, and book work only runs when a book is typeset.
  function uiCalibration(win) {
    let player = null, ctx = null;
    const scaled = new WeakMap();
    const metric = (face, text) => { ctx ??= (typeof win.OffscreenCanvas === 'function' ? new win.OffscreenCanvas(1, 1) : win.document.createElement('canvas')).getContext('2d'); ctx.font = face.fnt.font; ctx.textBaseline = 'alphabetic'; return ctx.measureText(text) };
    const sizeFace = (face, scale) => {
      if (!face?.fnt?.canvas || scale === 1) return face;
      let cache = scaled.get(face); if (!cache) { cache = new Map(); scaled.set(face, cache) }
      if (cache.has(scale)) return cache.get(scale);
      const f = face.fnt, px = Math.max(.1, f.px * scale), font = `${f.weight ?? 400} ${px}px ${f.family || stacks.book}`;
      const out = { ...face, fnt: { ...f, px, font, fixedHeight: Math.ceil(px * 1.3) } };
      if (cache.size >= 128) cache.delete(cache.keys().next().value); cache.set(scale, out); return out;
    };
    const width = (face, text) => {
      if (face.fnt.canvas) { const m = metric(face, text); return Math.max(m.width, (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || 0)); }
      return win.__dfoFonts.measure(face.fnt, text) ?? 0;
    };
    function wrap(face, text, max) {
      const rows = []; let row = '';
      for (const para of String(text).split(/\r?\n/)) {
        row = ''; for (const word of para.split(/\s+/).filter(Boolean)) {
          const next = row ? row + ' ' + word : word;
          if (width(face, next) <= max) { row = next; continue }
          if (row) { rows.push(row); row = '' }
          if (width(face, word) <= max) { row = word; continue }
          // Books may contain an URL or one unbroken token. Preserve all its
          // characters across rows rather than clipping it at the paper edge.
          const chars = Array.from(word); let start = 0;
          while (start < chars.length) { let lo = 1, hi = Math.min(32, chars.length - start); while (hi < chars.length - start && width(face, chars.slice(start, start + hi).join('')) <= max) { lo = hi; hi = Math.min(chars.length - start, hi * 2) } while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (width(face, chars.slice(start, start + mid).join('')) <= max) lo = mid; else hi = mid - 1 } const part = chars.slice(start, start + lo).join(''); start += lo; if (start < chars.length) rows.push(part); else row = part; }
        }
        rows.push(row);
      }
      return rows;
    }
    function place(lines, fontFor, maxWidth = 300) {
      const placed = []; let y = 0;
      for (const line of lines) {
        let face = fontFor(line.font), scale = Number(line.scale ?? 1); if (!(scale > 0 && Number.isFinite(scale))) scale = 1;
        if (face?.fnt?.canvas) { face = sizeFace(face, scale); scale = 1; }
        const m = face?.fnt?.canvas ? metric(face, 'MgЙЁру') : null;
        const rowH = m ? Math.ceil(Math.max(face.fnt.fixedHeight, (m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent) + (m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent))) : (face?.fnt?.fixedHeight ?? 0) * scale;
        const rows = face && line.text ? wrap(face, line.text, Math.max(1, maxWidth / scale - .5)) : [line.text ?? ''];
        const h = rows.length * rowH; placed.push({ ...line, face, scale, rows, rowH, y, h }); y += h;
      }
      return { placed, maxHeight: y };
    }
    return {
      host(value) { const p = value?.player; player = p && typeof p === 'object' ? new WeakRef(p) : null },
      mark(m) {
        const kind = String(m.kind || ''), key = String(m.key || '');
        // Never include settlements, player names or friendly living-road
        // travellers. Only dungeon / hostile / gathering marks are quieter.
        const small = !!m.dfoDungeon || /(?:^| )(?:dungeon|lair|gather|band|camp|raider|chase)(?: |$)/.test(kind) || /^giant:|^hideout:/.test(key);
        if (!small) return EMPTY_MARK;
        const pos = player?.deref()?.pos;
        const distance = pos && m.at ? Math.hypot(m.at[0] - pos[0], m.at[2] - pos[2]) : NaN;
        return Number.isFinite(distance) && distance > 1000 ? SMALL_QUIET : SMALL_NEAR;
      },
      markerBox: q => ({ x0: q.x - 12, x1: q.x + 12, y0: q.y - 12, y1: q.y + 12 }),
      place,
      paint(ctx, face, text, x, y, { color, align = 'left', w = 0 } = {}) {
        if (!face?.fnt?.canvas) return false;
        if (!text) return true;
        const m = metric(face, text), left = Math.max(0, m.actualBoundingBoxLeft || 0), advance = Math.max(m.width, left + (m.actualBoundingBoxRight || 0));
        ctx.font = face.fnt.font; ctx.fillStyle = color; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
        const ascent = Math.ceil(m.fontBoundingBoxAscent ?? metric(face, 'MgЙЁру').actualBoundingBoxAscent);
        ctx.fillText(text, x + left + (align === 'center' ? Math.max(0, (w - advance) / 2) : 0), y + ascent); return true;
      },
    };
  }
  function mapFont(font) {
    if (typeof font !== 'string') return font;
    if (fontMappings.has(font)) return fontMappings.get(font);
    const size = /^(.*?\b(?:[\d.]+(?:px|pt|em|rem|%|pc|in|cm|mm|q)|xx-small|x-small|small|medium|large|x-large|xx-large|smaller|larger)(?:\s*\/\s*(?:normal|[\d.]+[a-z%]*))?\s+)(.+)$/i.exec(font);
    const own = size && ownFamily.exec(size[2]);
    const role = own ? roles[own[1]] : size && /FONT000[04]/i.test(size[2]) ? 'title' : 'body';
    const mapped = size ? size[1] + stacks[role] : font;
    if (font.length <= 512) { if (fontMappings.size >= 128) fontMappings.delete(fontMappings.keys().next().value); fontMappings.set(font, mapped); }
    return mapped;
  }
  function installCanvas(win, stats) {
    const contextFonts = new WeakMap();
    for (const Type of [win.CanvasRenderingContext2D, win.OffscreenCanvasRenderingContext2D]) {
      if (!Type?.prototype) continue;
      const proto = Type.prototype, font = Object.getOwnPropertyDescriptor(proto, 'font');
      if (!font?.get || !font?.set) continue;
      const ensure = ctx => { const actual = font.get.call(ctx); if (contextFonts.get(ctx)?.actual !== actual) { const own = mapFont(actual); font.set.call(ctx, own); contextFonts.set(ctx, { actual: font.get.call(ctx) }); if (own !== actual) stats.canvasChanges++; } };
      Object.defineProperty(proto, 'font', {
        ...font, get() { ensure(this); return font.get.call(this) }, set(value) {
          const previous = contextFonts.get(this);
          // Reading the native value still detects resize/reset/save/restore.
          // The repeated font assignment in book glyph measurement can skip
          // both shorthand parsing and the native setter when nothing changed.
          if (typeof value === 'string' && previous?.input === value && previous.actual === font.get.call(this)) return;
          const own = mapFont(value); font.set.call(this, own); const actual = font.get.call(this);
          if (ownFamily.test(actual)) contextFonts.set(this, { input: value, actual }); else contextFonts.delete(this);
          if (own !== value) stats.canvasChanges++;
        }
      });
      const origMeasure = proto.measureText, origFill = proto.fillText, origStroke = proto.strokeText;
      if (typeof origMeasure === 'function') proto.measureText = function (text) { ensure(this); return origMeasure.call(this, text); };
      if (typeof origFill === 'function') proto.fillText = function (text, x, y, maxW) { ensure(this); return maxW === undefined ? origFill.call(this, text, x, y) : origFill.call(this, text, x, y, maxW); };
      if (typeof origStroke === 'function') proto.strokeText = function (text, x, y, maxW) { ensure(this); return maxW === undefined ? origStroke.call(this, text, x, y) : origStroke.call(this, text, x, y, maxW); };
    }
  }
  function installFontSet(win, base, stats, preset = null, revision = '1.30.0') {
    const fontSet = win.document?.fonts || win.fonts, Native = win.FontFace;
    const load = fontSet.load.bind(fontSet), check = fontSet.check.bind(fontSet), add = fontSet.add.bind(fontSet);
    const resolved = resolveSlots(base, preset, revision);
    const baseQuery = '?dfo=' + encodeURIComponent(revision);
    const srcByFamily = new Map(resolved.map(s => [s.family, s.src]));
    srcByFamily.set('Base Text', `url(${JSON.stringify(base + 'item-font-text.ttf' + baseQuery)}) format('truetype')`);
    srcByFamily.set('Base Num', `url(${JSON.stringify(base + 'item-font-numbers.ttf' + baseQuery)}) format('truetype')`);
    const allFamilies = [...srcByFamily.keys()];
    // Only eagerly load redundant Base Text / Base Num faces when body / number are actually customized.
    const customBody = resolved.some(s => s.id === 'body' && s.custom);
    const customNumber = resolved.some(s => s.id === 'number' && s.custom);
    const loadFamilies = [...resolved.map(s => s.family), ...(customBody ? ['Base Text'] : []), ...(customNumber ? ['Base Num'] : [])];
    const canonicalMap = new Map(allFamilies.map(name => ['dfo ' + name.toLowerCase(), name]));
    const canonical = family => canonicalMap.get(String(family).replace(/["']/g, '').toLowerCase());
    const ownUrl = name => srcByFamily.get(name) || srcByFamily.get('Gabin');
    win.FontFace = new Proxy(Native, {
      construct(Type, args, New) {
        const raw = String(args[0] || '');
        const name = canonical(raw) || (/FONT000[04]/i.test(raw) ? 'Greengoth' : 'Gabin');
        stats.faceRedirects = (stats.faceRedirects || 0) + 1;
        return Reflect.construct(Type, ['DFO ' + name, ownUrl(name), args[2]], New === win.FontFace ? Type : New);
      }
    });
    fontSet.add = face => {
      let family; try { family = Object.getOwnPropertyDescriptor(Native.prototype, 'family').get.call(face) } catch { return add(face) }
      if (!canonical(family)) { stats.blockedFonts = (stats.blockedFonts || 0) + 1; return fontSet; }
      // CSS already owns one face per family. Legacy JS loaders must not
      // register a second copy under an old alias or replace that primary.
      for (const existing of fontSet) if (existing !== face && canonical(existing.family) === canonical(family)) return fontSet;
      return add(face);
    };
    fontSet.load = (font, text) => load(mapFont(font), text);
    fontSet.check = (font, text) => check(mapFont(font), text);
    return { fontSet, load, add, Native, ownUrl, allFamilies, loadFamilies };
  }
  function bitmapFonts(win) {
    const bytes = new Map(), letters = new Map();
    const get = input => {
      let height = 7;
      if (typeof input === 'string') height = Object.keys(win.__dfoFontData?.fonts || {}).find(h => win.__dfoFontData.fonts[h].name === input.replace(/\.FNT$/i, '').toUpperCase()) || 7;
      else if (input?.byteLength >= 4) height = new DataView(input.buffer, input.byteOffset, input.byteLength).getUint16(2, true);
      const entry = win.__dfoFontData?.fonts[height] || win.__dfoFontData?.fonts[7];
      if (!entry) return null;
      if (!bytes.has(entry.name)) bytes.set(entry.name, Uint8Array.from(win.atob(entry.base64), c => c.charCodeAt(0)));
      return bytes.get(entry.name);
    };
    return {
      bytes: get, letters(height = 7) {
        const h = Math.max(1, Math.min(64, Math.round(Number(height) || 7)));
        if (letters.has(h)) return letters.get(h);
        const canvas = typeof win.OffscreenCanvas === 'function' ? new win.OffscreenCanvas(64, 64) : win.document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d', { willReadFrequently: true }), family = [6, 8, 11, 13].includes(h) ? stacks.title : stacks.body, glyphs = new Map();
        ctx.font = '64px ' + family; const sample = ctx.measureText('AgЙЁjQ'), total = Math.max(16, (sample.actualBoundingBoxAscent || 50) + (sample.actualBoundingBoxDescent || 14)), ratio = h / total;
        const font = (64 * ratio) + 'px ' + family, baseline = (sample.actualBoundingBoxAscent || 50) * ratio;
        const glyph = code => {
          if (glyphs.has(code)) return glyphs.get(code);
          const char = code >= 32 && code <= 0x10ffff ? String.fromCodePoint(code) : '?';
          ctx.clearRect(0, 0, 64, 64); ctx.font = font; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff';
          const measured = ctx.measureText(char), left = Math.max(0, Math.ceil(measured.actualBoundingBoxLeft || 0));
          ctx.fillText(char, left, baseline);
          const width = Math.min(64, Math.max(1, Math.ceil(measured.width + left))), rgba = ctx.getImageData(0, 0, width, h).data;
          const mask = Uint8Array.from({ length: width * h }, (_, i) => rgba[i * 4 + 3] >= 80 ? 1 : 0);
          const value = { mask, width }; if (glyphs.size >= 1024) glyphs.delete(glyphs.keys().next().value); glyphs.set(code, value); return value;
        };
        const source = Object.freeze({ height: h, space: glyph(32).width, widthOf: code => glyph(code).width, lit: (code, x, y) => { const g = glyph(code); return x >= 0 && x < g.width && y >= 0 && y < h && !!g.mask[y * g.width + x] } });
        letters.set(h, source); return source;
      }
    };
  }
  function installWorker(win, base) {
    if (win.__dfoFonts) return win.__dfoFonts;
    const stats = { canvasChanges: 0, failures: [] }; installCanvas(win, stats);
    if (!win.fonts || !win.FontFace || !win.OffscreenCanvas) { win.__dfoFonts = { ready: Promise.resolve(false), enabled: false, stacks, preset: win.__dfoFontPreset || null, register() { }, measure() { return null }, draw() { return null }, makeFont() { return null }, bookFont: font => font }; return win.__dfoFonts; }
    const preset = win.__dfoFontPreset || null, revision = win.__DFO_MOD_CFG__?.fonts?.revision || preset?.version || '1.30.0';
    const policy = installFontSet(win, base, stats, preset, revision), faces = new Map();
    for (const name of policy.loadFamilies) { const face = new policy.Native('DFO ' + name, policy.ownUrl(name)); policy.add(face); faces.set(name, face); }
    // Wait once at worker startup so its very first text also has the same
    // fallback coverage as the main window. No font work runs per frame.
    const ready = Promise.all(policy.loadFamilies.map(async name => { try { await faces.get(name).load(); return true } catch (e) { stats.failures.push({ font: name, error: String(e) }); return false } })).then(all => all.some(Boolean));
    const bitmaps = bitmapFonts(win);
    win.__dfoFonts = Object.freeze({ ready, enabled: true, stacks, preset, register() { }, measure() { return null }, draw() { return null }, makeFont() { return null }, bookFont: font => font, fntBytes: bitmaps.bytes, pixelLetters: bitmaps.letters, stats: () => ({ ...stats, shorthandCacheSize: fontMappings.size }) }); return win.__dfoFonts;
  }
  function install(win) {
    if (win.__dfoFonts) return;
    const doc = win.document, base = new URL('.', doc.currentScript?.src || new URL('dfo-mod/dfo_fonts.js', doc.baseURI)).href;
    const preset = win.__dfoFontPreset || null, revision = win.__DFO_MOD_CFG__?.fonts?.revision || preset?.version || '1.30.0';
    // When served via external <link href=".../dfo_fonts.css"> (strict CSP launcher with style-src 'self'),
    // skip injecting a duplicate inline <style> tag so zero CSP errors occur.
    if (!doc.querySelector?.('link[href*="dfo_fonts.css"]')) {
      const style = doc.createElement('style'); style.id = 'dfo-community-fonts'; style.textContent = css(base, revision, preset); doc.head.append(style);
    }
    const stats = { canvasChanges: 0, classicDraws: 0, classicBatches: 0, glyphsDrawn: 0, faces: 0, failures: [] };
    const native = {}, renderers = new WeakMap(), fnts = new WeakMap(), firstFaces = new Map(), bookFonts = new WeakMap(), fontOwners = new WeakMap(), titleHeights = new WeakMap(); let enabled = false, serial = 0;
    const translate = text => typeof win.__translate === 'function' ? win.__translate(text) : text;
    installCanvas(win, stats);
    const { fontSet, load, loadFamilies } = installFontSet(win, base, stats, preset, revision);
    const bitmaps = bitmapFonts(win);
    // Load the faces declared by our stylesheet. Creating another FontFace
    // for each family duplicates registrations and needlessly retains them.
    const ready = Promise.all(loadFamilies.map(async name => {
      try { const faces = await load(`16px "DFO ${name}"`); if (!faces.length) throw Error('Font declaration unavailable'); return name; }
      catch (error) { stats.failures.push({ font: name, error: String(error?.message || error) }); return null; }
    })).then(loaded => { enabled = loaded.some(Boolean); return enabled });
    const createCanvas = () => typeof win.OffscreenCanvas === 'function' ? new win.OffscreenCanvas(1, 1) : doc.createElement('canvas');
    const measurer = createCanvas().getContext('2d');
    function faceFor(role, renderer) {
      let faces = renderer ? renderers.get(renderer) : firstFaces;
      if (!faces) { faces = new Map(); renderers.set(renderer, faces) }
      let face = faces.get(role); if (face) return face;
      if (typeof native.glyphFace !== 'function') return null;
      const family = stacks[role];
      face = native.glyphFace(family, { name: 'dfo-font-' + role + '-' + (++serial), raster: 64, page: 1024 });
      // Seed common text before the first upload; new players' ordinary names
      // must not cause a succession of full-atlas uploads on their first frame.
      for (const code of seed) face.add(code);
      measurer.font = '64px ' + family;
      const sample = measurer.measureText('АgЙЁjQ'), ascent = Math.max(8, sample.actualBoundingBoxAscent || 50), descent = Math.max(2, sample.actualBoundingBoxDescent || 14);
      face.dfoAscent = ascent * 45 / 64; face.dfoHeight = Math.max(16, ascent + descent) * 45 / 64;
      faces.set(role, face); stats.faces++; return face;
    }
    const roleOf = fnt => fnt?.dfoFontRole === 'book' ? 'book' : fnt?.fontName === 'FONT0000' || fnt?.fontName === 'FONT0004' ? 'title' : 'body';
    const isCtrl = c => c < 32 || (c >= 127 && c < 160);
    const classic = fnt => fnt && !fnt.canvas && typeof fnt.glyphWidth === 'function' && Number.isFinite(fnt.fixedHeight) && fnt.fixedHeight > 0;
    win.__dfoFonts = Object.freeze({
      ready, get enabled() { return enabled }, stacks, bookSize, calibration: uiCalibration(win), fntBytes: bitmaps.bytes, pixelLetters: bitmaps.letters, register(parts) { if (typeof parts?.glyphFace === 'function') native.glyphFace = parts.glyphFace; },
      bookFont(font) {
        if (!enabled || !classic(font?.fnt) || typeof native.glyphFace !== 'function') return font;
        if (font.fnt.dfoFontRole === 'book') return font;
        let book = bookFonts.get(font); if (book) return book;
        // A book's default font is also used by the rest of the UI. Give
        // the reader a stable view rather than changing that shared FNT.
        const fnt = Object.assign(Object.create(Object.getPrototypeOf(font.fnt)), font.fnt, { dfoFontRole: 'book', fixedHeight: bookSize(titleHeights.get(font.fnt) ?? font.fnt.fixedHeight) });
        const owner = fontOwners.get(font)?.deref(), face = faceFor('book', owner); if (face) fnts.set(fnt, new WeakRef(face));
        book = { ...font, fnt }; bookFonts.set(font, book); return book;
      },
      makeFont(renderer, fnt, name) {
        if (!enabled || typeof native.glyphFace !== 'function') return null;
        fnt.fontName ??= name; if (!classic(fnt)) return null;
        // Native layouts also read fixedHeight: change the logical metrics
        // with the draw, once per FNT, so the larger title cannot overlap rows.
        if (roleOf(fnt) === 'title' && !titleHeights.has(fnt)) { titleHeights.set(fnt, fnt.fixedHeight); fnt.fixedHeight += 2; }
        const face = faceFor(roleOf(fnt), renderer); if (!face) return null; fnts.set(fnt, new WeakRef(face)); const font = { fnt, tex: null }; fontOwners.set(font, new WeakRef(renderer)); return font;
      },
      measure(fnt, text) {
        if (!enabled || typeof text !== 'string') return null; text = translate(text);
        if (fnt?.canvas && fnt.font) { measurer.font = mapFont(fnt.font); return measurer.measureText(text).width; }
        if (!classic(fnt)) return null;
        const face = fnts.get(fnt)?.deref() || faceFor(roleOf(fnt)); if (!face) return null;
        const scale = fnt.fixedHeight / face.dfoHeight, fallbackGlyph = face.glyphs.get(63);
        let width = 0;
        for (let i = 0; i < text.length; i++) {
          const code = text.codePointAt(i); if (code > 0xffff) i++;
          if (isCtrl(code)) continue;
          if (!face.glyphs.has(code)) face.add(code);
          const g = face.glyphs.get(code) || fallbackGlyph;
          if (g) width += (g.advance || 0) * scale;
        }
        return width;
      },
      draw(renderer, font, text, x, y, scale = 1, color = [1, 1, 1, 1]) {
        if (!enabled || !classic(font?.fnt) || typeof text !== 'string') return null;
        const fnt = font.fnt, face = faceFor(roleOf(fnt), renderer); if (!face) return null;
        text = translate(text);
        for (let i = 0; i < text.length; i++) {
          const code = text.codePointAt(i); if (code > 0xffff) i++;
          if (isCtrl(code)) continue;
          if (!face.glyphs.has(code)) face.add(code);
        }
        const r = fnt.fixedHeight / face.dfoHeight * scale, baseline = y + face.dfoAscent * r;
        // The native renderer may evict UI textures or restore a GL context.
        // Learn its actual cache keys once per upload, without assuming their format.
        const cache = renderer.textures;
        if (cache instanceof Map) for (const page of face.pages) if (page.dfoCacheKey != null && cache.get(page.dfoCacheKey) !== page.tex) { page.tex = null; page.dirty = true; }
        const uploads = face.flush(renderer);
        if (uploads && cache instanceof Map) for (const page of face.pages) if (page.dfoKnownTex !== page.tex) { page.dfoKnownTex = page.tex; page.dfoCacheKey = undefined; for (const [key, tex] of cache) if (tex === page.tex) { page.dfoCacheKey = key; break; } }
        let cx = x, texture = null, run = [];
        const fallbackGlyph = face.glyphs.get(63);
        const flush = () => { if (!run.length) return; if (typeof renderer.drawScreenQuadRun === 'function') { renderer.drawScreenQuadRun(texture, run, color); stats.classicBatches++; } else for (const q of run) { renderer.drawScreenQuad(texture, q.dst, q.src, color); stats.classicBatches++; } run = []; };
        for (let i = 0; i < text.length; i++) {
          const code = text.codePointAt(i); if (code > 0xffff) i++;
          if (isCtrl(code)) continue;
          const g = face.glyphs.get(code) || fallbackGlyph;
          if (!g) continue;
          if (g.w > 0 && g.h > 0) { const tex = face.texOf(g); if (texture !== tex) { flush(); texture = tex; } run.push({ dst: { x: cx + g.offX * r, y: baseline - g.offY * r, w: g.w * r, h: g.h * r }, src: g.src }); stats.glyphsDrawn++; }
          cx += g.advance * r;
        }
        flush(); stats.classicDraws++; return cx - x;
      },
      stats: () => ({ ...stats, failures: [...stats.failures], enabled, shorthandCacheSize: fontMappings.size }),
    });
  }
  return { install, installWorker, css, mapFont, stacks, files, slotDefs, resolveSlots, uiCalibration, bookSize };
});
