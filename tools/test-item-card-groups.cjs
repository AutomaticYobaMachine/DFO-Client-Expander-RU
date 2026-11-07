'use strict';
// The same items on the English and the Russian page (tools/test-item-cards-browser.cjs, the real enhanced card):
//   node tools/test-item-card-groups.cjs "$DFO_BUILD_DIR"
// Every rarity, affix, enchantment, socket, technique, legendary, imprint, gilded, aetheric, sigil and curse from
// docs/item-field-catalog.json. A native line's group must not depend on the language: a legendary property read as
// a passive effect on the translated page is the bug this guards. Each legendary, imprint and gilded piece keeps its
// own "Legendary property" block with the power's name; the native sigil/set/technique/comparison blocks are the same
// in both languages. Every template of the catalog also says where it is worn (Slot) the same way in both, and a
// weapon worn in a hand says the skill it trains.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.DFO_PLAYWRIGHT_MODULE || 'playwright');
const { server } = require('./test-item-cards-browser.cjs');

async function collect(page) {
  return page.evaluate(async () => {
    const [rows, data] = await Promise.all([fetch('/audit-catalog.json').then(r => r.json()), fetch('/audit-item-states.json').then(r => r.json())]);
    __cardAuditRegister(rows.filter(r => !auditNative.readers.template(r.index)));
    const mk = (templateIndex, group, extra = {}) => ({ templateIndex, group, material: group === 'Armor' ? 513 : 1, stackCount: 1, currentCondition: 100, maxCondition: 100, value: 1000, isIdentified: true, ...extra });
    const list = [];
    for (const item of [mk(120, 'Weapons'), mk(102, 'Armor'), mk(0, 'MensClothing'), mk(141, 'Jewellery')]) {
      for (const rarity of Object.keys(data.enums.rarities)) list.push(['rarity ' + item.group + ' ' + rarity, { ...item, rarity, affixes: [{ id: 'stat', param: 'strength', value: 10 }], enchantments: [{ type: 0, param: 4 }] }]);
    }
    for (const [id, rule] of Object.entries(data.enums.affixes || {})) {
      if (id === 'technique') continue;
      const params = Array.isArray(rule.params) && rule.params.length ? rule.params : [null];
      const group = rule.groups?.[0] || 'Weapons';
      for (const param of params) for (const rarity of ['magic', 'rare', 'legendary']) list.push(['affix ' + id + ' ' + param + ' ' + rarity, mk(group === 'Armor' ? 102 : 120, group, { rarity, affixes: [{ id, param, value: (rule.ranges?.[rarity] || [10])[0] }] })]);
    }
    for (const e of data.records.enchants) for (const param of e.params?.length ? e.params : [{ value: 0 }]) list.push(['enchant ' + e.name + ' ' + param.value, mk(120, 'Weapons', { rarity: 'rare', enchantments: [{ type: e.type, param: param.value }] })]);
    for (const socket of data.enums.sockets) list.push(['socket ' + socket, mk(120, 'Weapons', { rarity: 'rare', sockets: [socket] })]);
    for (const [id, t] of Object.entries(data.records.techniques)) list.push(['technique ' + id, mk(t.families.includes('archery') ? 130 : 120, 'Weapons', { rarity: 'rare', affixes: [{ id: 'technique', param: id, value: 20 }] })]);
    for (const r of data.records.legendaries) list.push(['legendary ' + r.id, mk(r.templates?.[0] || 120, r.group, { rarity: 'legendary', legendary: r.id, name: r.name, affixes: r.affixes, enchantments: r.enchantment ? [r.enchantment] : [] })]);
    for (const r of data.records.legendaries) list.push(['imprint ' + r.id, mk(r.templates?.[0] || 120, r.group, { rarity: 'rare', imprint: r.id, affixes: [{ id: 'stat', param: 'strength', value: 5 }] })]);
    for (const r of data.records.gilded) list.push(['gilded ' + r.id, mk(r.templateIndex, r.group, { rarity: 'gilded', gilded: r.id, name: r.name, affixes: r.affixes, material: r.material })]);
    for (const r of data.records.aetheric) list.push(['aetheric ' + r.id, mk(r.templateIndex, r.group, { rarity: 'aetheric', aetheric: r.id, name: r.name, affixes: r.affixes, sigil: { set: r.set, party: 1, xp: 37500 } })]);
    for (const set of data.enums.sigilSets) list.push(['sigil ' + set, mk(102, 'Armor', { rarity: 'rare', sigil: { set, party: 1, xp: 37500 } })]);
    for (const c of [{ type: 16, param: 0 }, { type: 21, param: 0 }]) list.push(['cursed ' + c.type, mk(120, 'Weapons', { rarity: 'rare', cursed: c, enchantments: [c] })]);
    // Every template, plain: where it is worn and what it trains.
    for (const r of rows) for (const group of r.groups || []) list.push(['template ' + r.index + ' ' + group, mk(r.index, group, { name: r.name })]);
    const api = window.__dfoItemCards, res = {};
    __cardTestActivate?.(20);
    for (const [label, item] of list) {
      const host = document.createElement('div'); host.className = 'inv-tip'; document.body.append(host);
      let card;
      try { card = __cardAuditBuild(structuredClone(item), 'local', {}); } catch (e) { res[label] = { error: String(e) }; host.remove(); continue; }
      host.replaceChildren(card); api.fitTip(host);
      const groups = {};
      for (const g of card.querySelectorAll('.dfo-item-group')) groups[g.dataset.group] = (groups[g.dataset.group] || 0) + g.querySelectorAll('li').length;
      const blocks = [...card.querySelectorAll('.sigilbox,.setbox,.techbox,.cmp')].map(n => n.className.split(' ')[0]).sort();
      const rowsOf = [...card.querySelectorAll('.dfo-item-stats>.pair')].map(p => [p.querySelector('dt')?.textContent ?? '', p.querySelector('dd')?.textContent ?? '']);
      res[label] = { dressed: card.classList.contains('dfo-item-card'), groups, blocks, power: card.querySelector('.dfo-item-power-name')?.textContent ?? null, rows: rowsOf };
      host.remove();
    }
    return { res, stats: api.stats() };
  });
}

async function main() {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const browser = await chromium.launch();
  try {
    const out = {}, errors = [];
    for (const [locale, query] of [['en', ''], ['ru', '?ru']]) {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      page.on('pageerror', e => errors.push(locale + ': ' + (e.stack || e)));
      await page.goto(`http://127.0.0.1:${server.address().port}/${query}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.ready);
      out[locale] = await collect(page);
      await page.close();
    }
    assert.deepEqual(errors, [], 'no page errors');
    const { en, ru } = { en: out.en.res, ru: out.ru.res };
    const labels = Object.keys(en);
    assert.deepEqual(Object.keys(ru), labels);
    const words = { en: { slot: 'Slot', skill: 'Skill' }, ru: { slot: 'Слот', skill: 'Навык' } };
    const value = (rows, label) => rows.find(([dt]) => dt === label)?.[1] ?? null;
    let powers = 0, slots = 0, skills = 0;
    for (const label of labels) {
      const a = en[label], b = ru[label];
      assert.ok(!a.error && !b.error, `${label}: ${a.error || b.error}`);
      assert.equal(b.dressed, a.dressed, `${label}: dressed in both languages`);
      if (!a.dressed) continue;
      assert.deepEqual(b.groups, a.groups, `${label}: the same groups in both languages`);
      assert.deepEqual(b.blocks, a.blocks, `${label}: the same native blocks`);
      if (/^(?:legendary|imprint|gilded) /.test(label)) {
        powers++;
        for (const [locale, card] of [['en', a], ['ru', b]]) {
          assert.ok(card.power && card.groups.power >= 1, `${label} (${locale}): the legendary property has its own block, not a passive effect: ${JSON.stringify(card.groups)}`);
        }
      }
      for (const [locale, card] of [['en', a], ['ru', b]]) {
        const slot = value(card.rows, words[locale].slot), skill = value(card.rows, words[locale].skill);
        for (const text of [slot, skill]) if (text != null) assert.doesNotMatch(text, /^cards\./, `${label} (${locale}): a key without words`);
        if (skill != null) assert.ok(slot != null, `${label} (${locale}): a skill only for a piece that is worn`);
      }
      const slotEn = value(a.rows, 'Slot'), slotRu = value(b.rows, 'Слот'), skillEn = value(a.rows, 'Skill'), skillRu = value(b.rows, 'Навык');
      assert.equal(slotRu != null, slotEn != null, `${label}: a slot row in both languages or in neither`);
      assert.equal(skillRu != null, skillEn != null, `${label}: a skill row in both languages or in neither`);
      if (slotEn) slots++;
      if (skillEn) skills++;
      if (/ Weapons$/.test(label) && slotEn && /hand/i.test(slotEn)) assert.ok(skillEn, `${label}: a weapon in a hand trains a skill`);
    }
    assert.equal(out.en.stats.failures, 0); assert.equal(out.ru.stats.failures, 0);
    assert.ok(powers >= 80, `${powers} legendary/imprint/gilded cards`);
    assert.ok(slots > 100 && skills > 20, `${slots} slot rows, ${skills} skill rows`);
    console.log(JSON.stringify({ cards: labels.length, legendaryBlocks: powers, slotRows: slots, skillRows: skills, errors }, null, 1));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
