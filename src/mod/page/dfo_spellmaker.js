/* DFO Spellmaker Overhaul — Production Runtime, UI Modals & Real Game Client Bridge.
 * Integrates the calibrated 1/3 + 2/3 Spellmaker workspace, 3D modular school/element visualization,
 * 69-icon school-grouped selector with live ICON00I0.IMG override & first-effect auto-pick,
 * bilingual RU/EN modular spell name generator, dual-pane 94-effect picker with warnings/formulas,
 * 3-panel gold-slider effect editor, and spell mechanics guide directly into DFO Online's SpellMaker (yH/vH/WB). */
/* Shared Effect Information UI Components & Tip Controller.
 * Used identically by both the Spell Effect Picker (.dfo-fx-picker-modal) and
 * the Selected Effect Parameter Editor (.dfo-fxed-win) with zero duplication. */
(function (root) {
  'use strict';

  function el(doc, tag, cls, text = null) {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }

  let fxUiSvgUid = 0;

  function makeSvg(doc, viewBox, cls, spec) {
    const ns = 'http://www.w3.org/2000/svg';
    const mk = (tag) => (doc.createElementNS ? doc.createElementNS(ns, tag) : doc.createElement(tag));
    const svg = mk('svg');
    svg.setAttribute('viewBox', viewBox);
    if (cls) svg.setAttribute('class', cls);
    svg.setAttribute('aria-hidden', 'true');
    const prefix = `dfofx${++fxUiSvgUid}_`;
    const resolve = (v) => (typeof v === 'string' && v.startsWith('@') ? `url(#${prefix}${v.slice(1)})` : String(v));
    if (spec && !Array.isArray(spec) && Array.isArray(spec.defs) && spec.defs.length) {
      const defsEl = mk('defs');
      for (const g of spec.defs) {
        const grad = mk(g.tag || 'linearGradient');
        for (const [k, v] of Object.entries(g)) {
          if (k === 'tag' || k === 'stops') continue;
          grad.setAttribute(k, k === 'id' ? prefix + v : String(v));
        }
        for (const [offset, color, opacity] of g.stops || []) {
          const st = mk('stop');
          st.setAttribute('offset', offset);
          st.setAttribute('stop-color', color);
          if (opacity != null) st.setAttribute('stop-opacity', String(opacity));
          grad.append(st);
        }
        defsEl.append(grad);
      }
      svg.append(defsEl);
    }
    const shapes = Array.isArray(spec) ? spec : (spec?.shapes || []);
    for (const def of shapes) {
      const node = mk(def.tag || 'path');
      for (const [k, v] of Object.entries(def)) {
        if (k !== 'tag') node.setAttribute(k, resolve(v));
      }
      svg.append(node);
    }
    return svg;
  }

  function makeGrimoireSvg(doc) {
    return makeSvg(doc, '0 0 24 24', 'dfo-st-head-ico', {
      defs: [
        { tag: 'linearGradient', id: 'cov', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#93c5fd'], ['50%', '#2563eb'], ['100%', '#172554']] },
        { tag: 'linearGradient', id: 'pg', x1: '0', y1: '0', x2: '0', y2: '1', stops: [['0%', '#fef9c3'], ['60%', '#d6c08d'], ['100%', '#8a7144']] },
      ],
      shapes: [
        { d: 'M2.6 5.2C2.6 4.4 3.3 3.8 4.1 3.8H11.2V19.6H4.1C3.3 19.6 2.6 19 2.6 18.2Z', fill: '@cov', stroke: '#060b16', 'stroke-width': 1.05, 'stroke-linejoin': 'round' },
        { d: 'M21.4 5.2C21.4 4.4 20.7 3.8 19.9 3.8H12.8V19.6H19.9C20.7 19.6 21.4 19 21.4 18.2Z', fill: '@cov', stroke: '#060b16', 'stroke-width': 1.05, 'stroke-linejoin': 'round' },
        { d: 'M4.4 5.6H10.6V17.7H4.4Z', fill: '@pg', opacity: 0.92 },
        { d: 'M13.4 5.6H19.6V17.7H13.4Z', fill: '@pg', opacity: 0.85 },
        { d: 'M10.9 4.2H13.1V19.6H10.9Z', fill: '#eab308', stroke: '#451a03', 'stroke-width': 0.65 },
        { d: 'M5.8 8.3H9.3M5.8 11H9.3M5.8 13.7H8.5M14.7 8.3H18.2M14.7 11H18.2', fill: 'none', stroke: '#3b2c12', 'stroke-width': 1.05, 'stroke-linecap': 'round' },
        { d: 'M16.1 17.6V21.7L17.4 20.6L18.7 21.7V17.6Z', fill: '#dc2626', stroke: '#450a0a', 'stroke-width': 0.55 },
      ],
    });
  }

  function makeHazardSvg(doc, severity) {
    const isDanger = severity === 'danger';
    return makeSvg(doc, '0 0 24 24', 'dfo-fxp-alert-ico', {
      defs: [
        { tag: 'linearGradient', id: 'tri', x1: '0', y1: '0', x2: '0.4', y2: '1', stops: isDanger ? [['0%', '#fecaca'], ['45%', '#dc2626'], ['100%', '#450a0a']] : [['0%', '#fef08a'], ['45%', '#f59e0b'], ['100%', '#78350f']] },
      ],
      shapes: [
        { d: 'M12 2.4L21.5 19.8H2.5Z', fill: '@tri', stroke: '#0e0604', 'stroke-width': 1.15, 'stroke-linejoin': 'round' },
        { d: 'M12 5.4L18.9 18.1H5.1Z', fill: isDanger ? '#3b0a0a' : '#451a03', stroke: isDanger ? '#fca5a5' : '#fde68a', 'stroke-width': 0.65, 'stroke-linejoin': 'round' },
        { d: 'M12 9.1V13.8', fill: 'none', stroke: isDanger ? '#fee2e2' : '#fef08a', 'stroke-width': 2.0, 'stroke-linecap': 'round' },
        { tag: 'circle', cx: 12, cy: 16.4, r: 1.15, fill: isDanger ? '#fee2e2' : '#fef08a' },
      ],
    });
  }

  function buildKvTable(doc, rows) {
    const table = el(doc, 'table', 'dfo-kv');
    const tbody = doc.createElement('tbody');
    for (const [k, v] of rows) {
      const tr = doc.createElement('tr');
      const th = doc.createElement('th');
      th.textContent = k ?? '';
      const td = doc.createElement('td');
      td.textContent = v ?? '';
      tr.append(th, td);
      tbody.append(tr);
    }
    table.append(tbody);
    return table;
  }

  function buildChipTipDef(ef, d, ru, kind) {
    const t = ef.type;
    const sub = ef.subType;
    const isFatigue = ((t === 1 || t === 4) && sub === 1) || ((t === 10 || t === 11) && sub === 9);
    const isOvercapChance = t === 12 || t === 19 || t === 21 || t === 22 || (t === 6 && (sub === 1 || sub === 2));

    switch (kind) {
      case 'duration':
        return {
          tone: 'purple',
          title: ru ? 'Есть время действия' : 'Lasts Over Time',
          body: ru
            ? 'У этого эффекта можно настроить, сколько игровых минут он будет оставаться активным. Первое срабатывание происходит сразу в момент каста, а затем действие повторяется раз в минуту, пока не истечёт таймер.'
            : 'Lets you set how many in-game minutes this effect remains active. The first activation triggers immediately on cast, then repeats once every in-game minute until the timer expires.',
          note: t === 2
            ? (ru
              ? 'Важно для призыва: первая минута уходит на открытие окна выбора вещи. Оставьте базу на 1 и добавьте хотя бы +1 минуту за уровень — тогда уже на 1-м уровне получится 2+ минуты.'
              : 'Conjuration note: the first minute is spent opening the item picker. Leaving Base at 1 plus +1 per level already gives 2+ minutes at Level 1.')
            : (ru
              ? 'Совет по выгоде: не выкручивайте базовую длительность вверх — оставьте её на 1, а основной рост вынесите в прибавку за уровень. Заклинание само станет долгим по мере прокачки и выйдет намного дешевле.'
              : 'Economy tip: leave Base duration at 1 and put the growth into per-level scaling instead — the duration grows as you level up while costing far less SP and gold.'),
        };
      case 'chance':
        return {
          tone: 'amber',
          title: ru ? 'Применяется с шансом' : 'Chance-Based Effect',
          body: ru
            ? 'Эффект срабатывает не автоматически, а с настроенной вами вероятностью в процентах (а при касте по врагу дополнительно проверяются его защиты). Если бросок процента не удался, в этот раз ничего не происходит.'
            : 'Does not trigger automatically — you configure a percentage probability for it to fire (and hostile casts also check enemy defenses). If the roll fails, this slot skips harmlessly.',
          note: t === 20
            ? (ru
              ? 'Особое ограничение: для заклинания «Поглощение заклинаний» шанс не поднимается выше 50%, какие бы значения вы ни выставили.'
              : 'Special cap: crafted Spell Absorption never exceeds 50% trigger chance no matter how high you tune the sliders.')
            : isOvercapChance
              ? (ru
                ? 'Выгодная настройка: везде выгоднее оставлять базовый шанс на 1, а набирать процент прибавкой за каждый 1 уровень (например +7–10% за уровень) — это в разы дешевле. При навыке школы выше 100 шанс дополнительно растёт.'
                : 'Smart setup: leave Base at 1 and grow Chance via +7–10% per 1 level — it costs far less and caps reliably by mid-levels. School skill past 100 boosts chance even further.')
              : (ru
                ? 'Выгодная настройка: не ставьте сразу 100% в базе! Дешевле оставить базу на 1 и задать уровневую прибавку (например ~7% за каждый 1 уровень): за пару часов прокачки до 10–14 уровня шанс сам выйдет к максимуму за малую цену.'
                : 'Smart setup: do NOT set Base straight to 100%! Keep Base at 1 and set per-level growth (~7% every 1 level): it slashes MP & gold cost sharply and hits full reliability around levels 10–14.'),
        };
      case 'magnitude':
        return {
          tone: 'red',
          title: ru ? 'Применяется числовое значение' : 'Numeric Power Value',
          body: ru
            ? 'Внутри этого эффекта настраивается разброс силы — сколько именно очков урона, лечения, запаса щита или характеристики он даст. При касте и на каждом минутном срабатывании игра каждый раз выбирает случайное число из заданных границ.'
            : 'Lets you tune a minimum–maximum power range — how many points of damage, healing, barrier HP, or attribute change it applies. Every cast and every minute tick rolls a fresh random value within that range.',
          note: isFatigue
            ? (ru
              ? 'Особенность запаса сил: внутри игры каждая единица здесь умножается на 64! Даже скромные цифры вроде 2–5 дают 128–320 единиц бодрости.'
              : 'Fatigue quirk: every 1 point here multiplies by 64 inside the engine! Even tiny numbers like 2–5 equal 128–320 Fatigue points.')
            : (t === 7 || (t === 11 && sub < 8))
              ? (ru
                ? 'Совет по выгоде: оставляйте базовую силу на 1 и вкладывайтесь в уровневую прибавку за каждый уровень — штраф характеристике держится бессрочно до «Исцеления характеристики» и складывается при повторных бросках.'
                : 'Economy tip: leave Base at 1 and put power into per-level growth every level — attribute drain persists until cured by Heal Attribute and accumulates across casts.')
              : (ru
                ? 'Совет по выгоде: везде, где возможно, оставляйте базовую величину на 1 и накручивайте именно прибавку за каждый 1 уровень — по мере роста уровня сила сама выйдет на высокие значения, а цена в мане и золоте будет в разы ниже.'
                : 'Economy tip: leave Base values at 1 and stack power into per-level growth every 1 level — you reach the same strength within a few levels for several times less SP and gold.'),
        };
      case 'nosliders':
        return {
          tone: 'gold',
          title: ru ? 'Фиксированный эффект без настроек' : 'Built-In Fixed Behavior',
          body: ru
            ? 'У этого эффекта нет внутренних настроек длительности, шанса или силы — его поведение и базовая цена жёстко заданы игрой. Вы выбираете только куда применять заклинание и его стихию, а скидка маны от навыка школы работает как обычно.'
            : 'This effect has no duration, chance, or strength sliders — its behavior and base price are fixed by the game. You only choose target delivery and spell element while school skill still discounts MP cost.',
        };
      case 'target':
        if (d.spec.targets === 1) {
          return {
            tone: 'gold',
            title: ru ? 'Применяется только на себя' : 'Applies Only to Yourself',
            body: ru
              ? 'Пока этот слот есть в заклинании, выбрать касание, выстрел или область не получится — заклинание срабатывает строго на вашего героя. Зато заклинания на себя никогда не проверяют вражеское сопротивление и спасброски.'
              : 'While this slot is included, touch, ranged bolt, and area delivery lock out so the spell targets strictly your character. Self-casts automatically bypass enemy resistance and saving throws.',
          };
        }
        if (d.spec.targets === 30) {
          return {
            tone: 'amber',
            title: ru ? 'Нельзя применить на самого себя' : 'Cannot Target Yourself',
            body: ru
              ? 'Атакующий или внешний эффект — применить его напрямую на себя запрещено. Доступны касание вплотную, одиночный выстрел во врага, взрыв вокруг заклинателя или область на расстоянии.'
              : 'Offensive or outward effect that blocks casting directly on yourself. Delivery must be Touch, Single Ranged Bolt, Area Around Caster, or Area at Range.',
          };
        }
        return {
          tone: 'teal',
          title: ru ? 'Можно применить и на себя, и на других' : 'Self or Other Targets',
          body: ru
            ? 'Универсальный эффект: работает во всех пяти форматах доставки — на себя, касанием, выстрелом в цель, вокруг себя или в область на расстоянии. Учитывайте, что дальность и площадь заметно повышают итоговую стоимость.'
            : 'Flexible effect compatible with all 5 delivery modes: Caster Only, Touch, Single Bolt, Area Around Caster, and Area at Range. Keep in mind ranged and area modes multiply final SP and gold cost.',
        };
      case 'channel':
        if (d.spec.magicOnly) {
          return {
            tone: 'purple',
            title: ru ? 'Защита цели всегда проверяется как Магия' : 'Target Defends Using Magic Only',
            body: ru
              ? 'Какую бы стихию (Огонь, Мороз, Молнию или Яд) вы ни выставили сверху конструктора, при попадании в цель игра игнорирует стихийные сопротивления врага и проверяет защиту исключительно против чистой Магии.'
              : 'Regardless of which element icon you select at the top of the Spellmaker, enemy hits ignore elemental resistances and always check defenses strictly against pure Magic.',
          };
        }
        return {
          tone: 'teal',
          title: ru ? 'Защита цели зависит от выбранной стихии' : 'Uses Your Chosen Spell Element',
          body: ru
            ? 'Сопротивление и спасбросок врага проверяются по той самой стихии (Огонь, Мороз, Молния, Яд или Магия), которую вы выставили вверху конструктора. Подбирайте элемент под уязвимости противников!'
            : 'Target resistances and saving throws test whichever element you selected at the top of the Spellmaker (Fire, Frost, Shock, Poison, or Magic). Match elements against enemy weaknesses!',
        };
      case 'overcap':
      default:
        return {
          tone: 'teal',
          title: ru ? 'Дополнительный рост при навыке выше 100' : 'Extra Scaling Above Skill 100',
          body: ru
            ? 'Если у вас активно «Мастерство навыков», прокачка нужной школы магии выше 100 (вплоть до 200) не только удешевляет стоимость маны, но и напрямую усиливает эффект вплоть до +40% сверх обычного предела.'
            : 'When "Master Skills" is active, pushing this effect’s Magic School skill above 100 (up to 200) not only reduces SP cost further, it boosts effect strength/duration/chance up to +40%.',
          note: ru
            ? 'Отражённые заклинания и встроенные чары на экипировке этот бонус сверх 100 не получают.'
            : 'Note: reflected casts and equipped item enchantments do not receive this over-100 bonus.',
        };
    }
  }

  function createTipController(doc, tipHost, ru) {
    let activeTip = null;
    let activeOwner = null;

    function hide() {
      if (activeTip) {
        try { activeTip.remove(); } catch {}
      }
      activeTip = null;
      activeOwner = null;
    }

    function show(anchorEl, defOrFn) {
      if (!tipHost || !tipHost.isConnected || !anchorEl || !anchorEl.isConnected) return;
      const tipDef = typeof defOrFn === 'function' ? defOrFn() : defOrFn;
      if (!tipDef) return;
      hide();

      const tip = el(doc, 'div', 'dfo-status-tip dfo-sm-tip dfo-fxp-chip-tip');
      tip.setAttribute('role', 'tooltip');

      const head = el(doc, 'div', 'dfo-st-head');
      const dot = el(doc, 'span', `dfo-fxp-tip-gem chip-${tipDef.tone || 'gold'}`, '◆');
      head.append(dot, el(doc, 'span', null, tipDef.title || ''));
      tip.append(head);

      const body = el(doc, 'div', 'dfo-st-body');
      const info = el(doc, 'div', 'dfo-st-info');
      info.append(
        el(doc, 'div', 'dfo-st-fk', tipDef.kicker || (ru ? 'Что это означает' : 'What this means')),
        el(doc, 'div', 'dfo-st-line', tipDef.body || ''),
      );
      if (tipDef.note) {
        info.append(el(doc, 'div', `dfo-st-line ${tipDef.noteTone || 'is-center'}`, tipDef.note));
      }
      body.append(info);
      tip.append(body);

      tip.style.visibility = 'hidden';
      tipHost.append(tip);

      const rect = anchorEl.getBoundingClientRect();
      const vw = doc.defaultView?.innerWidth || doc.documentElement.clientWidth || 1920;
      const vh = doc.defaultView?.innerHeight || doc.documentElement.clientHeight || 1080;
      const tw = tip.offsetWidth || 320;
      const th = tip.offsetHeight || 110;

      let left = rect.left;
      if (left + tw > vw - 14) left = Math.max(14, vw - tw - 14);
      if (left < 14) left = 14;

      let top = rect.bottom + 8;
      if (top + th > vh - 14 && rect.top - th - 8 >= 14) {
        top = rect.top - th - 8;
      }

      tip.style.left = `${Math.round(left)}px`;
      tip.style.top = `${Math.round(top)}px`;
      tip.style.visibility = 'visible';

      activeTip = tip;
      activeOwner = anchorEl;
    }

    function attach(targetEl, defOrFn, opts = {}) {
      if (opts.tabStop !== false) targetEl.tabIndex = 0;
      targetEl.dataset.hasTip = '1';
      if (!targetEl.getAttribute('aria-label')) {
        const tipDef = typeof defOrFn === 'function' ? defOrFn() : defOrFn;
        if (tipDef?.title) {
          targetEl.setAttribute('aria-label', `${targetEl.textContent || tipDef.title} — ${tipDef.title}`);
        }
      }
      targetEl.addEventListener('mouseenter', () => show(targetEl, defOrFn));
      targetEl.addEventListener('mouseleave', () => {
        if (activeOwner === targetEl) hide();
      });
      targetEl.addEventListener('focus', () => show(targetEl, defOrFn));
      targetEl.addEventListener('blur', () => {
        if (activeOwner === targetEl) hide();
      });
    }

    return { hide, show, attach };
  }

  function buildEffectHeroCard({ doc, effect, details, ru, tipCtrl, extraNodes = null }) {
    const sc = details.school;
    const effName = ru ? details.nameRu : details.nameEn;

    const headCard = el(doc, 'div', 'dfo-rar-card dfo-fxp-hero-card');
    headCard.style.setProperty('--dfo-rar', sc.color);
    const corners = el(doc, 'span', 'dfo-item-corners');
    for (let i = 0; i < 4; i++) corners.append(doc.createElement('i'));
    headCard.append(corners);

    const cardTop = el(doc, 'div', 'dfo-fxp-hero-top');
    const titleWrap = el(doc, 'div', 'dfo-fxp-hero-titles');
    titleWrap.append(el(doc, 'h3', 'dfo-rar-card-title dfo-fxp-hero-name', effName));
    cardTop.append(titleWrap);

    const keyTag = el(doc, 'span', 'dfo-fxp-id-badge', `ID ${effect.type},${effect.subType}`);
    cardTop.append(keyTag);
    headCard.append(cardTop);

    const chipsRow = el(doc, 'div', 'dfo-fxp-chips');
    const addChip = (tone, label, kind) => {
      const chip = el(doc, 'span', `dfo-chip chip-${tone}`, label);
      tipCtrl?.attach(chip, buildChipTipDef(effect, details, ru, kind));
      chipsRow.append(chip);
    };

    let hasSlider = false;
    if (effect.duration) {
      hasSlider = true;
      addChip('purple', ru ? 'Есть время действия' : 'Lasts Over Time', 'duration');
    }
    if (effect.chance) {
      hasSlider = true;
      addChip('amber', ru ? 'Применяется с шансом' : 'Chance-Based Effect', 'chance');
    }
    if (effect.magnitude) {
      hasSlider = true;
      addChip('red', ru ? 'Применяется числовое значение' : 'Numeric Power Value', 'magnitude');
    }
    if (!hasSlider) {
      addChip('gold', ru ? 'Фиксированный (без настроек)' : 'Fixed (No Settings)', 'nosliders');
    }

    addChip(
      details.spec.targets === 1 ? 'gold' : details.spec.targets === 30 ? 'amber' : 'teal',
      ru ? details.targetLabelRu : details.targetLabelEn,
      'target',
    );
    addChip(
      details.spec.magicOnly ? 'purple' : 'teal',
      ru ? details.channelLabelRu : details.channelLabelEn,
      'channel',
    );
    if (details.skillBoosted) {
      addChip('teal', ru ? 'Усиливается при навыке > 100' : 'Boosted Above 100 Skill', 'overcap');
    }
    headCard.append(chipsRow);

    if (extraNodes) {
      for (const n of extraNodes) if (n) headCard.append(n);
    }

    return headCard;
  }

  function buildWarningPlaque(doc, warning, ru) {
    if (!warning) return null;
    const toneCls = warning.tone === 'danger' ? 'is-danger' : 'is-warn';
    const alert = el(doc, 'section', `dfo-fxp-alert ${toneCls}`);
    const alertHead = el(doc, 'div', 'dfo-fxp-alert-head');
    alertHead.append(
      makeHazardSvg(doc, warning.tone),
      el(doc, 'span', 'dfo-fxp-alert-badge', ru ? warning.badgeRu : warning.badgeEn),
    );
    alert.append(
      alertHead,
      el(doc, 'div', 'dfo-fxp-alert-title', ru ? warning.titleRu : warning.titleEn),
      el(doc, 'p', 'dfo-fxp-alert-text', ru ? warning.textRu : warning.textEn),
    );
    return alert;
  }

  function buildMechanicsCard(doc, details, ru) {
    const mechCard = el(doc, 'section', 'dfo-well-frame dfo-fxp-mech-card');
    const mechHead = el(doc, 'div', 'dfo-fxp-sec-head');
    mechHead.append(
      el(doc, 'span', 'dfo-fxp-sec-gem', '◆'),
      el(doc, 'span', 'dfo-fxp-sec-title', ru ? 'Механика Эффекта' : 'Effect Mechanics'),
    );
    mechCard.append(mechHead);

    const mechParas = ru ? details.mechanicsRu : details.mechanicsEn;
    for (const txt of mechParas) {
      mechCard.append(el(doc, 'p', 'dfo-fxp-mech-p', txt));
    }
    return mechCard;
  }

  function buildFormulaSpoiler(doc, details, ru, opts = {}) {
    const det = el(doc, 'details', 'dfo-gm-spoiler dfo-fxp-spoiler');
    if (opts.open) det.open = true;
    const sum = el(doc, 'summary', 'dfo-gm-spoiler-sum');
    sum.append(
      el(doc, 'span', 'dfo-gm-spoiler-arrow', '▸'),
      el(doc, 'span', null, ru ? 'Спойлер: точная формула цены и расчёта в коде' : 'Spoiler: exact price & engine calculation formulas'),
    );
    det.append(sum);

    const spBody = el(doc, 'div', 'dfo-gm-spoiler-body');
    const rows = [...(ru ? details.spoilerRu : details.spoilerEn), ...(opts.extraRows || [])];
    spBody.append(buildKvTable(doc, rows));
    det.append(spBody);
    return det;
  }

  // Exact live outcome math matching dfo_service_details.js (L140-239)
  function computeEffectOutcome(effect, settings, level) {
    const L = Math.max(1, Math.trunc(Number(level) || 1));
    const s = settings || {};
    const t = effect?.type ?? -1;
    const sub = effect?.subType ?? 255;
    const isFatigue = ((t === 1 || t === 4) && sub === 1) || ((t === 10 || t === 11) && sub === 9);
    const chanceCap = t === 20 ? 50 : 100;

    let duration = null;
    if (effect?.duration) {
      const base = Math.trunc(Number(s.durationBase) || 1);
      const mod = Math.trunc(Number(s.durationMod) || 1);
      const per = Math.max(1, Math.trunc(Number(s.durationPerLevel) || 1));
      const steps = Math.max(1, Math.floor(L / per));
      const total = base + mod * steps;
      duration = {
        base,
        mod,
        per,
        steps,
        total,
        itemLife: t === 2 ? Math.max(0, total - 1) : null,
      };
    }

    let chance = null;
    if (effect?.chance) {
      const base = Math.trunc(Number(s.chanceBase) || 1);
      const mod = Math.trunc(Number(s.chanceMod) || 1);
      const per = Math.max(1, Math.trunc(Number(s.chancePerLevel) || 1));
      const steps = Math.floor(L / per);
      const raw = base + mod * steps;
      const capped = Math.max(0, Math.min(chanceCap, raw));
      chance = {
        base,
        mod,
        per,
        steps,
        raw,
        capped,
        cap: chanceCap,
        overCap: raw > chanceCap,
      };
    }

    let magnitude = null;
    if (effect?.magnitude) {
      const baseLo = Math.trunc(Number(s.magnitudeBaseLow) || 1);
      const baseHi = Math.trunc(Number(s.magnitudeBaseHigh) || 1);
      const stepLo = Math.trunc(Number(s.magnitudeLevelBase) || 1);
      const stepHi = Math.trunc(Number(s.magnitudeLevelHigh) || 1);
      const per = Math.max(1, Math.trunc(Number(s.magnitudePerLevel) || 1));
      const steps = Math.floor(L / per);
      const lo = baseLo + stepLo * steps;
      const hi = baseHi + stepHi * steps;
      magnitude = {
        baseLo,
        baseHi,
        stepLo,
        stepHi,
        per,
        steps,
        lo,
        hi,
        isFatigue,
        fatigueLo: isFatigue ? lo * 64 : lo,
        fatigueHi: isFatigue ? hi * 64 : hi,
      };
    }

    return {
      level: L,
      type: t,
      subType: sub,
      isFatigue,
      duration,
      chance,
      magnitude,
    };
  }

  root.__dfoSpellmakerEffectUi = Object.freeze({
    el,
    makeSvg,
    makeGrimoireSvg,
    makeHazardSvg,
    buildKvTable,
    buildChipTipDef,
    createTipController,
    buildEffectHeroCard,
    buildWarningPlaque,
    buildMechanicsCard,
    buildFormulaSpoiler,
    computeEffectOutcome,
  });
})(typeof window !== 'undefined' ? window : globalThis);

/* Rich Dual-Pane Spell Effect Selection Window (.dfo-fx-picker-modal).
 * Styled 1:1 after ui-references (cards-lists-and-badges.js + containers-and-chrome.js + buttons-and-controls.js).
 * Left pane: effects divided by the 6 Magic Schools with invariant family dividers and warning indicators.
 * Right pane: corner-ornamented header card with tooltip-explained capability chips, prominent warning/quirk
 *             plaque for broken/tricky effects, plain-language mechanics breakdown, and exact formula spoiler. */
(function (root) {
  'use strict';

  const Ui = () => root.__dfoSpellmakerEffectUi;
  const el = (doc, tag, cls, text = null) => Ui().el(doc, tag, cls, text);
  const makeGrimoireSvg = (doc) => Ui().makeGrimoireSvg(doc);
  const makeHazardSvg = (doc, sev) => Ui().makeHazardSvg(doc, sev);

  let activeState = null;

  function hideChipTip(st) {
    st?.tipCtrl?.hide();
  }

  function close({ notifyCancel = false } = {}) {
    if (!activeState) return;
    const st = activeState;
    activeState = null;
    if (st.onDocKeydown) { try { st.doc.removeEventListener('keydown', st.onDocKeydown, true); } catch {} st.onDocKeydown = null; }
    hideChipTip(st);
    try {
      if (typeof st.dlg.close === 'function' && st.dlg.open) st.dlg.close();
    } catch {}
    try { st.dlg.remove(); } catch {}
    if (notifyCancel && typeof st.onCancel === 'function') {
      st.onCancel();
    }
  }

  function renderDetailPane(st) {
    const { doc, detailBody, selectBtn, ru, catalogItems, selectedKey, tipCtrl } = st;
    const ui = Ui();
    hideChipTip(st);
    const item = catalogItems.find((x) => x.effect.key === selectedKey) || catalogItems[0] || null;
    if (!item) {
      detailBody.replaceChildren(
        el(doc, 'div', 'dfo-fxp-empty-detail', ru
          ? 'Эффекты не найдены.'
          : 'No effects available.'),
      );
      selectBtn.disabled = true;
      selectBtn.textContent = ru ? 'Выберите эффект' : 'Select an effect';
      return;
    }

    const ef = item.effect;
    const d = item.details;
    const effName = ru ? d.nameRu : d.nameEn;

    detailBody.replaceChildren();
    detailBody.append(ui.buildEffectHeroCard({ doc, effect: ef, details: d, ru, tipCtrl }));

    const alert = ui.buildWarningPlaque(doc, d.warning, ru);
    if (alert) detailBody.append(alert);

    detailBody.append(ui.buildMechanicsCard(doc, d, ru));
    detailBody.append(ui.buildFormulaSpoiler(doc, d, ru));

    detailBody.scrollTop = 0;

    selectBtn.disabled = false;
    selectBtn.textContent = ru ? `Выбрать «${effName}» →` : `Select "${effName}" →`;
  }

  function getFilteredItems(st) {
    const q = (st.query || '').trim().toLowerCase();
    return st.catalogItems.filter(({ details }) => {
      if (st.schoolFilter !== 'all' && String(details.schoolId) !== String(st.schoolFilter)) return false;
      if (st.warnOnly && !details.hasWarning) return false;
      if (q && !details.searchHaystack.includes(q)) return false;
      return true;
    });
  }

  function getFamilyTitle(details, ru) {
    if (ru) {
      return details.groupEn === 'Dispel' ? 'Рассеивание / Изгнание' : details.groupRu;
    }
    return details.groupEn === 'Dispel' ? 'Dispel / Banish' : details.groupEn;
  }

  function buildFamilyGroups(schoolItems, ru) {
    const groups = [];
    for (const item of schoolItems) {
      const famKey = item.details.groupEn || item.details.nameEn;
      const last = groups[groups.length - 1];
      if (last && last.famKey === famKey) {
        last.items.push(item);
      } else {
        groups.push({
          famKey,
          label: getFamilyTitle(item.details, ru),
          items: [item],
        });
      }
    }
    return groups;
  }

  function renderListPane(st) {
    const { doc, listScroll, countBadge, ru, Catalog } = st;
    const filtered = getFilteredItems(st);
    const ordered = [];
    for (const sid of Catalog.SCHOOL_ORDER) {
      for (const x of filtered) {
        if (x.details.schoolId === sid) ordered.push(x);
      }
    }
    st.filteredItems = ordered;
    countBadge.textContent = String(ordered.length);

    if (!ordered.some((x) => x.effect.key === st.selectedKey)) {
      st.selectedKey = ordered[0]?.effect.key || null;
    }

    listScroll.replaceChildren();
    st.rowEls = new Map();

    if (!ordered.length) {
      listScroll.append(
        el(doc, 'div', 'dfo-fxp-empty-list', ru
          ? 'Эффекты не найдены.'
          : 'No effects found.'),
      );
      renderDetailPane(st);
      return;
    }

    // Group strictly by Magic School (preserving canonical SCHOOL_ORDER 22..27)
    for (const sid of Catalog.SCHOOL_ORDER) {
      const schoolItems = ordered.filter((x) => x.details.schoolId === sid);
      if (!schoolItems.length) continue;

      const sInfo = Catalog.SCHOOL_INFO[sid];
      const sec = el(doc, 'section', 'dfo-fxp-sch-sec');
      sec.style.setProperty('--sch-c', sInfo.color);

      const secHead = el(doc, 'div', 'dfo-fxp-sch-head');
      const secLeft = el(doc, 'div', 'dfo-fxp-sch-left');
      secLeft.append(
        el(doc, 'span', 'dfo-fxp-sch-gem', '◆'),
        el(doc, 'span', 'dfo-fxp-sch-name', ru ? sInfo.ru : sInfo.en),
        el(doc, 'span', 'dfo-fxp-sch-sub', ru ? sInfo.tagRu : sInfo.tagEn),
      );
      secHead.append(secLeft, el(doc, 'span', 'dfo-fxp-sch-cnt', String(schoolItems.length)));
      sec.append(secHead);

      const rowsWrap = el(doc, 'div', 'dfo-fxp-rows');
      const famGroups = buildFamilyGroups(schoolItems, ru);
      let prevWasMulti = false;

      for (const fam of famGroups) {
        if (fam.items.length >= 2) {
          const famDiv = el(doc, 'div', 'dfo-fxp-fam-div');
          famDiv.setAttribute('aria-hidden', 'true');
          famDiv.append(
            el(doc, 'span', 'dfo-fxp-fam-line'),
            el(doc, 'span', 'dfo-fxp-fam-lbl', `◆ ${fam.label} (${fam.items.length})`),
            el(doc, 'span', 'dfo-fxp-fam-line'),
          );
          rowsWrap.append(famDiv);
          prevWasMulti = true;
        } else {
          if (prevWasMulti) {
            const hairDiv = el(doc, 'div', 'dfo-fxp-hair-div');
            hairDiv.setAttribute('aria-hidden', 'true');
            hairDiv.append(
              el(doc, 'span', 'dfo-fxp-fam-line'),
              el(doc, 'span', 'dfo-fxp-hair-gem', '◆'),
              el(doc, 'span', 'dfo-fxp-fam-line'),
            );
            rowsWrap.append(hairDiv);
          }
          prevWasMulti = false;
        }

        for (const item of fam.items) {
          const ef = item.effect;
          const d = item.details;
          const isSel = ef.key === st.selectedKey;
          const row = el(doc, 'button', `dfo-item-row dfo-fxp-row${isSel ? ' is-selected' : ''}`);
          row.type = 'button';
          row.dataset.effectKey = ef.key;
          row.style.setProperty('--dfo-row-rar', sInfo.color);

          const main = el(doc, 'div', 'dfo-item-row-main');
          main.append(el(doc, 'div', 'dfo-item-row-name', ru ? d.nameRu : d.nameEn));
          const subMeta = [];
          if (ef.duration) subMeta.push(ru ? 'Длит.' : 'Dur');
          if (ef.chance) subMeta.push(ru ? 'Шанс' : 'Chance');
          if (ef.magnitude) subMeta.push(ru ? 'Сила' : 'Mag');
          if (d.spec.targets === 1) subMeta.push(ru ? 'На себя' : 'Self');
          else if (d.spec.targets === 30) subMeta.push(ru ? 'В цель' : 'Target');
          main.append(el(doc, 'div', 'dfo-item-row-meta', subMeta.join(' · ')));

          row.append(main);

          const rightTags = el(doc, 'div', 'dfo-fxp-row-tags');
          if (d.hasWarning) {
            const wCls = d.warningSeverity === 'danger' ? 'is-danger' : 'is-warn';
            const warnTag = el(doc, 'span', `dfo-fxp-tag-warn ${wCls}`, '⚠');
            warnTag.title = ru ? d.warning.titleRu : d.warning.titleEn;
            rightTags.append(warnTag);
          }
          row.append(rightTags);

          row.onclick = (e) => {
            e.stopPropagation();
            selectRow(st, ef.key, false);
          };
          row.ondblclick = (e) => {
            e.stopPropagation();
            confirmPick(st, ef);
          };

          rowsWrap.append(row);
          st.rowEls.set(ef.key, row);
        }
      }

      sec.append(rowsWrap);
      listScroll.append(sec);
    }

    renderDetailPane(st);
  }

  function selectRow(st, key, scrollIntoView = false) {
    if (!key || st.selectedKey === key) return;
    const prevEl = st.rowEls.get(st.selectedKey);
    if (prevEl) prevEl.classList.remove('is-selected');
    st.selectedKey = key;
    const nextEl = st.rowEls.get(key);
    if (nextEl) {
      nextEl.classList.add('is-selected');
      if (scrollIntoView) {
        try { nextEl.scrollIntoView({ block: 'nearest' }); } catch {}
      }
    }
    renderDetailPane(st);
  }

  function confirmPick(st, overrideEffect = null) {
    const item = overrideEffect
      ? { effect: overrideEffect }
      : st.filteredItems.find((x) => x.effect.key === st.selectedKey) || st.filteredItems[0];
    if (!item || !item.effect) return;
    const picked = item.effect;
    const cb = st.onPick;
    close({ notifyCancel: false });
    if (typeof cb === 'function') cb(picked);
  }

  function open({
    doc = root.document,
    entity = null,
    isRu = true,
    slotIndex = 0,
    initialSchool = 'all',
    initialQuery = '',
    initialEffectKey = null,
    mountHost = null,
    onPick = null,
    onCancel = null,
  } = {}) {
    close({ notifyCancel: false });
    const Catalog = root.__dfoSpellmakerCatalog;
    if (!Catalog) return;

    const ru = !!isRu;
    const catalogItems = Catalog.buildCatalogList(entity, ru ? 'ru' : 'en');
    const effWordRu = (n) => {
      const m100 = n % 100;
      const m10 = n % 10;
      if (m100 >= 11 && m100 <= 14) return 'ЭФФЕКТОВ';
      if (m10 === 1) return 'ЭФФЕКТ';
      if (m10 >= 2 && m10 <= 4) return 'ЭФФЕКТА';
      return 'ЭФФЕКТОВ';
    };

    const dlg = el(doc, 'dialog', 'dfo-panel dfo-win dfo-window-frame dfo-seal-modal dfo-sm-dialog dfo-fx-picker-modal');
    dlg.setAttribute('aria-labelledby', 'dfo-fxp-modal-title');

    // Header
    const head = el(doc, 'div', 'wh');
    head.append(makeGrimoireSvg(doc));
    const slotNum = Math.max(1, Math.min(3, (slotIndex | 0) + 1));
    const titleSpan = el(
      doc,
      'span',
      't',
      ru ? `Выбор эффекта заклинания · Слот ${slotNum} из 3` : `Choose Spell Effect · Slot ${slotNum} of 3`,
    );
    titleSpan.id = 'dfo-fxp-modal-title';
    const metaChip = el(
      doc,
      'span',
      'dfo-sm-meta-chip',
      ru ? `${catalogItems.length} ${effWordRu(catalogItems.length)} · 6 ШКОЛ МАГИИ` : `${catalogItems.length} EFFECTS · 6 MAGIC SCHOOLS`,
    );
    const closeX = el(doc, 'button', 'x', '✕');
    closeX.type = 'button';
    closeX.setAttribute('aria-label', ru ? 'Закрыть' : 'Close');
    head.append(titleSpan, metaChip, closeX);

    const firstOrderedItem = Catalog.SCHOOL_ORDER
      .map((sid) => catalogItems.find((x) => x.details.schoolId === sid))
      .find(Boolean) || catalogItems[0];

    const defaultKey = initialEffectKey
      || (initialSchool !== 'all'
        ? catalogItems.find((x) => String(x.details.schoolId) === String(initialSchool))?.effect.key
        : null)
      || firstOrderedItem?.effect.key
      || null;

    const state = {
      doc,
      dlg,
      ru,
      slotIndex: slotNum - 1,
      Catalog,
      catalogItems,
      filteredItems: [],
      rowEls: new Map(),
      schoolFilter: initialSchool || 'all',
      warnOnly: false,
      query: initialQuery || '',
      selectedKey: defaultKey,
      tipCtrl: Ui().createTipController(doc, dlg, ru),
      listScroll: null,
      countBadge: null,
      detailBody: null,
      selectBtn: null,
      onPick,
      onCancel,
    };

    // Body Dual-Pane Grid (no top filter/search/tabs bar)
    const body = el(doc, 'div', 'wb dfo-fxp-wb');
    const grid = el(doc, 'div', 'dfo-sm-grid dfo-fxp-grid');

    // Left Pane: Divided by Magic Schools
    const leftPane = el(doc, 'section', 'dfo-subpanel-frame dfo-sm-pane is-stats dfo-fxp-list-pane');
    const leftHead = el(doc, 'div', 'dfo-sm-pane-head is-stats');
    const leftTitleWrap = el(doc, 'span', 'dfo-sm-pane-title-wrap');
    leftTitleWrap.append(
      el(doc, 'span', 'dfo-sm-pane-gem', '◆'),
      el(doc, 'span', 'dfo-sm-pane-title', ru ? 'Школы и эффекты магии' : 'Effects by Magic School'),
    );
    const countBadge = el(doc, 'span', 'dfo-chip chip-teal dfo-sm-pane-count', String(catalogItems.length));
    leftHead.append(leftTitleWrap, countBadge);
    const listScroll = el(doc, 'div', 'dfo-sm-pane-body dfo-scroll dfo-fxp-list');
    leftPane.append(leftHead, listScroll);

    const divider = el(doc, 'div', 'dfo-sm-divider');
    divider.setAttribute('aria-hidden', 'true');
    divider.append(el(doc, 'span', 'dfo-sm-divider-line'), el(doc, 'span', 'dfo-sm-divider-gem', '◆'), el(doc, 'span', 'dfo-sm-divider-line'));

    // Right Pane: Effect Information + Warnings + Formula Spoiler
    const rightPane = el(doc, 'section', 'dfo-subpanel-frame dfo-sm-pane is-passives dfo-fxp-detail-pane');
    const rightHead = el(doc, 'div', 'dfo-sm-pane-head is-passives');
    const rightTitleWrap = el(doc, 'span', 'dfo-sm-pane-title-wrap');
    rightTitleWrap.append(
      el(doc, 'span', 'dfo-sm-pane-gem', '◆'),
      el(doc, 'span', 'dfo-sm-pane-title', ru ? 'Информация по Эффекту' : 'Effect Information'),
    );
    rightHead.append(rightTitleWrap);
    const detailBody = el(doc, 'div', 'dfo-sm-pane-body dfo-scroll dfo-fxp-detail');
    rightPane.append(rightHead, detailBody);

    grid.append(leftPane, divider, rightPane);
    body.append(grid);

    // Footer
    const foot = el(doc, 'div', 'wf dfo-fxp-foot');
    foot.append(el(
      doc,
      'span',
      'dfo-sm-foot-hint',
      ru ? '↑↓ — выбор · Enter / двойной клик — добавить эффект · Esc — отмена' : '↑↓ move · Enter / double-click to select · Esc cancel',
    ));
    const footBtns = el(doc, 'div', 'dfo-fxp-foot-btns');
    const cancelBtn = el(doc, 'button', 'dfo-ornate-btn dfo-fxp-cancel-btn', ru ? 'Отмена' : 'Cancel');
    cancelBtn.type = 'button';
    const selectBtn = el(doc, 'button', 'dfo-ornate-btn primary dfo-fxp-confirm-btn', ru ? 'Выбрать →' : 'Select →');
    selectBtn.type = 'button';
    footBtns.append(cancelBtn, selectBtn);
    foot.append(footBtns);

    dlg.append(head, body, foot);

    state.listScroll = listScroll;
    state.countBadge = countBadge;
    state.detailBody = detailBody;
    state.selectBtn = selectBtn;

    detailBody.addEventListener('scroll', () => hideChipTip(state), { passive: true });
    listScroll.addEventListener('scroll', () => hideChipTip(state), { passive: true });

    closeX.onclick = (e) => { e.stopPropagation(); close({ notifyCancel: true }); };
    cancelBtn.onclick = (e) => { e.stopPropagation(); close({ notifyCancel: true }); };
    selectBtn.onclick = (e) => { e.stopPropagation(); confirmPick(state); };

    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close({ notifyCancel: true }); });
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) close({ notifyCancel: true });
      e.stopPropagation();
    });

    const onDocKeydown = (e) => {
      if (activeState !== state || !dlg.isConnected) {
        try { doc.removeEventListener('keydown', onDocKeydown, true); } catch {}
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close({ notifyCancel: true });
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        const items = state.filteredItems;
        if (items.length) {
          const cur = Math.max(0, items.findIndex((x) => x.effect.key === state.selectedKey));
          const next = e.key === 'ArrowDown'
            ? Math.min(items.length - 1, cur + 1)
            : Math.max(0, cur - 1);
          selectRow(state, items[next].effect.key, true);
        }
        return;
      }
      if (e.key === 'Enter' && e.target !== closeX && e.target !== cancelBtn) {
        if (e.target?.tagName === 'SUMMARY') { e.stopPropagation(); return; }
        e.preventDefault();
        e.stopPropagation();
        confirmPick(state);
        return;
      }
      e.stopPropagation();
    };
    state.onDocKeydown = onDocKeydown;
    doc.addEventListener('keydown', onDocKeydown, true);
    for (const type of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'wheel', 'keyup']) {
      dlg.addEventListener(type, (e) => e.stopPropagation());
    }

    activeState = state;
    renderListPane(state);
    const hostEl = (mountHost && mountHost.isConnected) ? mountHost : doc.body;
    hostEl.append(dlg);
    try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); }
    const selEl = state.rowEls.get(state.selectedKey);
    if (selEl) {
      try { selEl.scrollIntoView({ block: 'nearest' }); } catch {}
      try { selEl.focus({ preventScroll: true }); } catch {}
    } else if (typeof dlg.focus === 'function') {
      try { dlg.focus(); } catch {}
    }
  }

  root.__dfoSpellmakerPicker = Object.freeze({
    open,
    close,
    isOpen: () => { if (activeState && !activeState.dlg?.isConnected) { if (activeState.onDocKeydown) { try { activeState.doc.removeEventListener('keydown', activeState.onDocKeydown, true); } catch {} } activeState = null; return false; } return Boolean(activeState); },
    getState: () => (activeState ? {
      schoolFilter: activeState.schoolFilter,
      warnOnly: activeState.warnOnly,
      query: activeState.query,
      selectedKey: activeState.selectedKey,
      slotIndex: activeState.slotIndex ?? 0,
    } : null),
    setQuery: (q) => {
      if (!activeState) return;
      activeState.query = String(q || '');
      renderListPane(activeState);
    },
    setSchool: (sid) => {
      if (!activeState) return;
      activeState.schoolFilter = sid;
      renderListPane(activeState);
    },
    setWarnOnly: (val) => {
      if (!activeState) return;
      activeState.warnOnly = !!val;
      renderListPane(activeState);
    },
    selectEffect: (key) => {
      if (!activeState) return;
      selectRow(activeState, key, true);
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);

/* Lightweight Selected Effect Parameter Editor Window (.dfo-fxed-win).
 * Styled 1:1 after ui-references (window-frame.css, backgrounds.css, cards-lists-and-badges.js, buttons-and-controls.js).
 * Upper Block: Compact Left Cost/Summary Pane (Slot MP/Gold, Level Outcome, Whole Spell Total) + Wide Right Mechanics/Warning/Formula Pane.
 * Lower Block: 3 Panels in a Row (Duration | Chance | Magnitude) split by a brass Base/Level divider, with ±1 steppers,
 *              editable numeric inputs, and thin golden metallic wire sliders with sculpted 3D metallic sphere thumbs. */
(function (root) {
  'use strict';

  const Ui = () => root.__dfoSpellmakerEffectUi;

  function buildPanelSpecs(details, ef, ru, boundsFor) {
    const k = ef?.key || '';
    const chMax = boundsFor('chanceBase', k)?.[1] ?? 100;
    const isAbsorb = ef?.type === 20;

    return [
      {
        id: 'duration',
        accent: '#b57bee',
        accentRgb: '181, 123, 238',
        title: ru ? 'Длительность' : 'Duration',
        helpDef: {
          tone: 'purple',
          title: ru ? 'Длительность эффекта (в раундах / минутах)' : 'Effect Duration (Rounds / Game Minutes)',
          kicker: ru ? 'Как работает время действия' : 'How duration works',
          body: ru
            ? 'Первое срабатывание происходит сразу при касте заклинания, а затем эффект срабатывает повторно раз в игровую минуту, пока не истечёт счётчик.'
            : 'The first tick activates immediately upon cast, then fires once every in-game minute until the remaining counter reaches zero.',
          note: ef?.type === 2
            ? (ru
              ? 'Для призыва вещей 1-я минута уходит на выбор предмета — делайте итог от 2 мин. и выше.'
              : 'For Create Item, the 1st minute opens the item menu — aim for 2+ minutes total.')
            : (ru
              ? 'Совет по выгоде: оставляйте базу на 1 и вкладывайте рост в прибавку за каждый 1 уровень — цена в мане и золоте будет в разы ниже.'
              : 'Economy tip: keep Base at 1 and place growth into per-level scaling — SP and gold cost drops sharply.'),
        },
        fields: [
          {
            field: 'durationBase',
            section: 'base',
            label: ru ? 'База (мин.)' : 'Base (min)',
            coarse: 10,
            tip: ru
              ? 'Начальное количество минут на 1-м уровне. Выгоднее всего оставлять на 1!'
              : 'Starting minutes at Level 1. Keeping this at 1 saves the most MP & gold!',
          },
          {
            field: 'durationMod',
            section: 'level',
            label: ru ? '+ за шаг ур.' : '+ per step',
            coarse: 10,
            tip: ru
              ? 'Сколько минут добавляется каждый раз, когда срабатывает уровневая прибавка.'
              : 'How many minutes are added each time the level-scaling step triggers.',
          },
          {
            field: 'durationPerLevel',
            section: 'level',
            label: ru ? 'Каждые N ур.' : 'Every N lvls',
            coarse: 5,
            tip: ru
              ? 'Раз в сколько уровней срабатывает прибавка. Значение 1 означает прибавку каждый уровень!'
              : 'How many hero levels between scaling steps. 1 means it scales every single level!',
          },
        ],
      },
      {
        id: 'chance',
        accent: '#d5b26e',
        accentRgb: '213, 178, 110',
        title: ru ? 'Шанс срабатывания' : 'Trigger Chance',
        helpDef: {
          tone: 'amber',
          title: ru ? 'Вероятность срабатывания эффекта (%)' : 'Effect Trigger Probability (%)',
          kicker: ru ? 'Как считается шанс' : 'How trigger chance works',
          body: ru
            ? 'Заклинания с шансом бросают процент на срабатывание при каждом касте (а по врагам дополнительно проверяются их сопротивления и спасбросок).'
            : 'Chance-based effects roll a percentage each cast (and hostile casts also test enemy resistances and saving throws).',
          note: isAbsorb
            ? (ru
              ? 'Для «Поглощения заклинаний» верхний потолок в коде равен 50% (выше 50% выставить нельзя).'
              : 'Crafted Spell Absorption is hard-capped at 50% max trigger chance.')
            : (ru
              ? 'Выгодная настройка: НЕ ставьте сразу 100% в базе! Оставьте базу 1% и поставьте +7% каждые 1 ур. — к 14-му уровню уже 99%, а стоимость в разы ниже.'
              : 'Smart tuning: do NOT set Base to 100%! Keep Base at 1% and add +7% every 1 level — reaches 99% by level 14 for a fraction of the cost.'),
        },
        fields: [
          {
            field: 'chanceBase',
            section: 'base',
            label: ru ? 'Базовый шанс (%)' : 'Base chance (%)',
            coarse: 10,
            tip: isAbsorb
              ? (ru ? `Начальный шанс от 1 до ${chMax}% (для Поглощения лимит 50%).` : `Base chance 1..${chMax}% (Absorption cap is 50%).`)
              : (ru ? 'Начальный шанс на 1-м уровне. Выгоднее оставлять 1% и брать рост уровнями!' : 'Base % at Level 1. Keeping 1% + level growth is much cheaper!'),
          },
          {
            field: 'chanceMod',
            section: 'level',
            label: ru ? '+ % за шаг ур.' : '+ % per step',
            coarse: 10,
            tip: ru
              ? 'Сколько процентов прибавляется за каждый шаг уровня. Отличный ориентир: 7–10% при шаге 1 ур.'
              : 'Percent added per level step. Sweet spot is 7–10% with step = 1 level.',
          },
          {
            field: 'chancePerLevel',
            section: 'level',
            label: ru ? 'Каждые N ур.' : 'Every N lvls',
            coarse: 5,
            tip: ru
              ? 'Раз в сколько уровней прибавляются проценты. При 1 прибавка работает каждый уровень!'
              : 'Levels needed per percent step. 1 = grows every single level!',
          },
        ],
      },
      {
        id: 'magnitude',
        accent: '#e2574c',
        accentRgb: '226, 87, 76',
        title: ru ? 'Величина / Сила' : 'Magnitude',
        helpDef: {
          tone: 'red',
          title: ru ? 'Диапазон числовой силы (От — До)' : 'Numeric Power Range (Min — Max)',
          kicker: ru ? 'Как считается сила эффекта' : 'How magnitude works',
          body: ru
            ? 'При каждом применении (и на каждом тике длительных заклинаний) игра случайно выбирает значение между нижней и верхней границей.'
            : 'Each application (and every tick of timed spells) rolls a random amount between your minimum and maximum bounds.',
          note: details?.warning?.id === 'fatigue_x64' || ((ef?.type === 1 || ef?.type === 4) && ef?.subType === 1) || ((ef?.type === 10 || ef?.type === 11) && ef?.subType === 9)
            ? (ru
              ? 'Для Запаса сил: в коде движка каждая 1 единица умножается на ×64! Цифры 1–3 уже дают 64–192 бодрости.'
              : 'Fatigue multiplier: inside the engine every 1 point here multiplies by ×64! Even 1–3 equals 64–192 Fatigue.')
            : (ru
              ? 'Совет по выгоде: оставляйте базовые «от–до» на единице (1–1), а основную мощь задавайте уровневыми прибавками!'
              : 'Economy tip: leave Base min–max at 1–1 and put real strength into per-level growth!'),
        },
        fields: [
          {
            field: 'magnitudeBaseLow',
            section: 'base',
            label: ru ? 'База: от (мин.)' : 'Base min',
            coarse: 10,
            tip: ru ? 'Минимальная стартовая сила на 1-м уровне. Выгоднее оставлять 1.' : 'Minimum starting power at Level 1. Best kept at 1.',
          },
          {
            field: 'magnitudeBaseHigh',
            section: 'base',
            label: ru ? 'База: до (макс.)' : 'Base max',
            coarse: 10,
            tip: ru ? 'Максимальная стартовая сила на 1-м уровне (не меньше «Базы от»).' : 'Maximum starting power at Level 1 (stays >= Base min).',
          },
          {
            field: 'magnitudeLevelBase',
            section: 'level',
            label: ru ? '+ от (за шаг)' : '+ min / step',
            coarse: 10,
            tip: ru ? 'Сколько добавляется к нижней границе силы за каждый шаг прокачки.' : 'Added to minimum roll each scaling step.',
          },
          {
            field: 'magnitudeLevelHigh',
            section: 'level',
            label: ru ? '+ до (за шаг)' : '+ max / step',
            coarse: 10,
            tip: ru ? 'Сколько добавляется к верхней границе силы за каждый шаг прокачки.' : 'Added to maximum roll each scaling step.',
          },
          {
            field: 'magnitudePerLevel',
            section: 'level',
            label: ru ? 'Каждые N ур.' : 'Every N lvls',
            coarse: 5,
            tip: ru ? 'Раз в сколько уровней прибавляется сила (1 = каждый уровень).' : 'Levels between strength increases (1 = every level).',
          },
        ],
      },
    ];
  }

  function disabledReasonText(panelId, ef, ru) {
    const t = ef?.type ?? -1;
    const sub = ef?.subType ?? 255;
    if (panelId === 'duration') {
      if (t === 16 || t === 17) {
        return ru
          ? 'Длительность не задаётся: заклинание действует мгновенно на замок двери (открытие или запирание).'
          : 'No duration slider: applies immediately to the targeted door lock (open or lock).';
      }
      if (t === 7 || (t === 11 && sub < 8)) {
        return ru
          ? 'Длительность не настраивается: восстановление или постоянный урон характеристике срабатывает мгновенно.'
          : 'No duration slider: applies immediately rather than running on a minute timer.';
      }
      return ru
        ? 'Мгновенный эффект — срабатывает один раз в момент применения, без таймера минут.'
        : 'Instant effect — triggers once on impact without an active duration timer.';
    }
    if (panelId === 'chance') {
      return ru
        ? 'У этого эффекта нет настройки процента — триггер срабатывает автоматически при каждом касте (по врагу проверяются лишь его защиты).'
        : 'No trigger chance slider — fires automatically on cast (hostile targets still roll defenses/resistances).';
    }
    return ru
      ? 'Числовая сила не настраивается — величина действия задана самой механикой этого эффекта.'
      : 'Numeric magnitude is not used — effect strength comes from its built-in mechanic rather than a min/max range.';
  }

  function makeParamIcon(makeSvgIcon, kind, cls = 'dfo-fxed-res-ico') {
    return typeof makeSvgIcon === 'function' ? makeSvgIcon(kind, cls) : null;
  }

  function renderCostCell(elTarget, textVal, iconKind, makeSvgIcon, cls = 'dfo-fxed-res-ico') {
    if (elTarget._costIconKind === iconKind && elTarget._costNumEl && elTarget._costNumEl.isConnected) {
      if (elTarget._costNumEl.textContent !== textVal) elTarget._costNumEl.textContent = textVal;
      return;
    }
    const doc = elTarget.ownerDocument;
    elTarget.replaceChildren();
    const wrap = Ui().el(doc, 'span', 'dfo-fxed-res-val');
    const numEl = Ui().el(doc, 'span', 'dfo-fxed-res-num', textVal);
    wrap.append(numEl);
    const ico = makeParamIcon(makeSvgIcon, iconKind, cls);
    if (ico) wrap.append(ico);
    elTarget.append(wrap);
    elTarget._costIconKind = iconKind;
    elTarget._costNumEl = numEl;
  }

  function appendOutcomePill(target, iconKind, text, makeSvgIcon) {
    const doc = target.ownerDocument;
    const item = Ui().el(doc, 'span', 'dfo-fxed-out-item');
    const ico = makeParamIcon(makeSvgIcon, iconKind, 'dfo-fxed-param-ico');
    if (ico) item.append(ico);
    item.append(Ui().el(doc, 'span', null, text));
    target.append(item);
  }

  function renderOutcomeStrip(elTarget, outcome, ru, fmtNum, makeSvgIcon) {
    const sig = [
      ru ? '1' : '0',
      outcome.duration ? outcome.duration.total : '',
      outcome.chance ? outcome.chance.capped : '',
      outcome.magnitude ? `${outcome.magnitude.lo}-${outcome.magnitude.hi}-${outcome.magnitude.isFatigue ? 1 : 0}` : '',
    ].join('|');
    if (elTarget._outcomeSig === sig) return;
    elTarget._outcomeSig = sig;
    elTarget.replaceChildren();
    let hasAny = false;
    if (outcome.duration) {
      hasAny = true;
      appendOutcomePill(
        elTarget,
        'clock',
        `${outcome.duration.total} ${ru ? 'мин.' : 'min'}`,
        makeSvgIcon,
      );
    }
    if (outcome.chance) {
      hasAny = true;
      appendOutcomePill(elTarget, 'chance', `${outcome.chance.capped}%`, makeSvgIcon);
    }
    if (outcome.magnitude) {
      hasAny = true;
      const m = outcome.magnitude;
      if (m.isFatigue) {
        appendOutcomePill(
          elTarget,
          'power',
          m.fatigueLo === m.fatigueHi
            ? `${fmtNum(m.fatigueLo)} ${ru ? 'бодр.' : 'fat.'}`
            : `${fmtNum(m.fatigueLo)}–${fmtNum(m.fatigueHi)} ${ru ? 'бодр.' : 'fat.'}`,
          makeSvgIcon,
        );
      } else {
        appendOutcomePill(
          elTarget,
          'power',
          m.lo === m.hi
            ? `${m.lo} ${ru ? 'ед.' : 'pts'}`
            : `${m.lo}–${m.hi} ${ru ? 'ед.' : 'pts'}`,
          makeSvgIcon,
        );
      }
    }
    if (!hasAny) {
      elTarget.textContent = ru ? 'Фиксированно' : 'Fixed effect';
    }
  }

  function buildSpoilerLiveParts(ed, outcome, details, ru, Data, fmtNum, getSlotCost) {
    const slot = ed.deps.slot;
    const entity = ed.deps.entity;
    const cost = typeof getSlotCost === 'function' ? getSlotCost(slot, entity) : Data.calcEffectCost(slot, entity);
    const skillVal = Number(entity?.skills?.[details?.schoolId] ?? 55);
    const L = outcome.level;
    const parts = [];
    if (outcome.duration) {
      const d = outcome.duration;
      parts.push(`D=${d.base}+${d.mod}×max(1,⌊${L}/${d.per}⌋)=${d.total}`);
      if (d.itemLife != null) parts.push(`${ru ? 'жизнь вещи' : 'itemLife'}=${d.itemLife}`);
    }
    if (outcome.chance) {
      const c = outcome.chance;
      parts.push(`C=${c.base}+${c.mod}×⌊${L}/${c.per}⌋=${c.raw}%${c.overCap ? `→${c.capped}%` : ''}`);
    }
    if (outcome.magnitude) {
      const m = outcome.magnitude;
      const rng = m.lo === m.hi ? `${m.lo}` : `${m.lo}–${m.hi}`;
      parts.push(`M=[${m.baseLo}..${m.baseHi}]+[${m.stepLo}..${m.stepHi}]×⌊${L}/${m.per}⌋=${rng}`);
    }
    return {
      label: ru ? `Расчёт (ур. ${L})` : `Live calc (lvl ${L})`,
      formulaPrefix: parts.join(' · '),
      sp: cost.sp,
      gold: cost.gold,
      skillVal,
    };
  }

  function renderSpoilerLiveCell(cellEl, liveData, ru, fmtNum, makeSvgIcon) {
    if (!cellEl) return;
    const sig = `${ru ? 1 : 0}|${liveData.formulaPrefix}|${liveData.sp}|${liveData.gold}|${liveData.skillVal}`;
    if (cellEl._liveSig === sig) return;
    cellEl._liveSig = sig;
    const doc = cellEl.ownerDocument;
    cellEl.replaceChildren();
    if (liveData.formulaPrefix) {
      cellEl.append(doc.createTextNode(`${liveData.formulaPrefix} · `));
    }
    const mpWrap = Ui().el(doc, 'span', 'dfo-fxed-inline-res is-mana');
    mpWrap.append(doc.createTextNode(fmtNum(liveData.sp)));
    const manaIco = makeParamIcon(makeSvgIcon, 'mana', 'dfo-fxed-inline-ico');
    if (manaIco) mpWrap.append(manaIco);
    cellEl.append(mpWrap, doc.createTextNode(' / '));

    const gpWrap = Ui().el(doc, 'span', 'dfo-fxed-inline-res is-gold');
    gpWrap.append(doc.createTextNode(fmtNum(liveData.gold)));
    const goldIco = makeParamIcon(makeSvgIcon, 'gold', 'dfo-fxed-inline-ico');
    if (goldIco) gpWrap.append(goldIco);
    cellEl.append(gpWrap, doc.createTextNode(` (${ru ? 'навык' : 'skill'} ${liveData.skillVal})`));
  }

  function attachHoldStep(btn, fn) {
    let delayId = null;
    let repId = null;
    const stop = () => {
      if (delayId) { clearTimeout(delayId); delayId = null; }
      if (repId) { clearInterval(repId); repId = null; }
    };
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || btn.disabled) return;
      e.preventDefault();
      fn();
      delayId = setTimeout(() => {
        if (btn.disabled || !btn.isConnected) return;
        repId = setInterval(() => {
          if (btn.disabled || !btn.isConnected) { stop(); return; }
          fn();
        }, 70);
      }, 360);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) {
      btn.addEventListener(ev, stop);
    }
    btn.addEventListener('click', (e) => {
      // Handle keyboard activation (Enter/Space on focused button, detail === 0) without double-stepping pointerdown
      if (e.detail === 0 && !btn.disabled) fn();
    });
  }

  function updatePanelLive(panelRef, ef, slot, outcome, ru, fmtNum) {
    const { id, badgeEl, previewVal, disabled, fieldRows } = panelRef;
    const s = slot?.settings || {};

    if (disabled) {
      badgeEl.textContent = ru ? 'Не используется' : 'Not used';
      return;
    }

    if (id === 'duration' && outcome.duration) {
      const d = outcome.duration;
      badgeEl.textContent = ru ? `Ур. ${outcome.level}: ${d.total} мин.` : `Lvl ${outcome.level}: ${d.total} min`;
      if (d.itemLife != null) {
        previewVal.textContent = ru
          ? `${d.total} мин. · жизнь вещи: ${d.itemLife} мин.`
          : `${d.total} min · item lifetime: ${d.itemLife} min`;
      } else {
        previewVal.textContent = ru
          ? `${d.total} ${d.total === 1 ? 'игровая минута (раунд)' : 'игр. мин. (раундов)'}`
          : `${d.total} game minute${d.total === 1 ? '' : 's'} (rounds)`;
      }
    } else if (id === 'chance' && outcome.chance) {
      const c = outcome.chance;
      badgeEl.textContent = ru ? `Ур. ${outcome.level}: ${c.capped}%` : `Lvl ${outcome.level}: ${c.capped}%`;
      previewVal.textContent = ef?.type === 20
        ? (ru ? `${c.capped}% (потолок поглощения)` : `${c.capped}% (absorption cap)`)
        : (ru ? `${c.capped}% шанс срабатывания` : `${c.capped}% trigger chance`);
    } else if (id === 'magnitude' && outcome.magnitude) {
      const m = outcome.magnitude;
      const rng = m.lo === m.hi ? `${m.lo}` : `${m.lo}–${m.hi}`;
      if (m.isFatigue) {
        const fatRng = m.fatigueLo === m.fatigueHi ? fmtNum(m.fatigueLo) : `${fmtNum(m.fatigueLo)}–${fmtNum(m.fatigueHi)}`;
        badgeEl.textContent = ru ? `Ур. ${outcome.level}: ${fatRng}` : `Lvl ${outcome.level}: ${fatRng}`;
        previewVal.textContent = ru
          ? `${fatRng} ед. запаса сил`
          : `${fatRng} Fatigue pts`;
      } else {
        badgeEl.textContent = ru ? `Ур. ${outcome.level}: ${rng} ед.` : `Lvl ${outcome.level}: ${rng} pts`;
        previewVal.textContent = ru
          ? `${rng} ед. за бросок`
          : `${rng} pts per roll`;
      }
    }

    const activeEl = panelRef.doc.activeElement;
    for (const row of fieldRows) {
      const val = s[row.field] ?? row.min;
      const isFocusedTyping = row.inputEl === activeEl && row.inputEl.dataset.editing === '1';
      if (!isFocusedTyping) {
        row.inputEl.value = String(val);
      }
      if (row.sliderEl) {
        row.sliderEl.value = String(val);
        const span = Math.max(1, row.max - row.min);
        const pct = Math.max(0, Math.min(100, ((val - row.min) / span) * 100));
        row.sliderEl.style.setProperty('--slider-pct', `${pct.toFixed(2)}%`);
      }
      row.minusBtn.disabled = val <= row.min;
      row.plusBtn.disabled = val >= row.max;
    }
  }

  function syncLight(refs) {
    if (!refs || !refs.sm || !refs.ed || !refs.rootEl?.isConnected) return;
    const { sm, ed, details, ru, fmtNum, Data, makeSvgIcon, getSlotCost, evalCreationState } = refs;
    const ef = ed.deps.effect;
    const slot = ed.deps.slot;
    const entity = ed.deps.entity;
    const L = Math.max(1, Math.trunc(Number(entity?.level) || 1));

    const outcome = Ui().computeEffectOutcome(ef, slot?.settings, L);
    const slotCost = typeof getSlotCost === 'function' ? getSlotCost(slot, entity) : Data.calcEffectCost(slot, entity);
    const cs = typeof evalCreationState === 'function' ? evalCreationState() : sm.evalCreationState();

    // Update top plaques using currency & parameter icons
    renderCostCell(refs.plaqueSpVal, fmtNum(slotCost.sp), 'mana', makeSvgIcon);
    renderCostCell(refs.plaqueGoldVal, fmtNum(slotCost.gold), 'gold', makeSvgIcon);
    renderOutcomeStrip(refs.plaqueOutVal, outcome, ru, fmtNum, makeSvgIcon);

    // Update whole spell impact strip using mana & gold icons
    renderCostCell(refs.spellManaVal, `${fmtNum(cs.spCost)} / ${fmtNum(cs.maxMana)}`, 'mana', makeSvgIcon, 'dfo-fxed-res-ico is-sm');
    renderCostCell(refs.spellGoldVal, fmtNum(cs.goldCost), 'gold', makeSvgIcon, 'dfo-fxed-res-ico is-sm');

    const badge = refs.spellStatusBadge;
    badge.classList.remove('is-ready', 'is-warn', 'is-bad');
    if (!cs.hasGold) {
      badge.classList.add('is-bad');
      badge.textContent = ru ? 'Не хватает золота' : 'Not enough gold';
    } else if (cs.spCost > cs.maxMana) {
      badge.classList.add('is-warn');
      badge.textContent = ru ? 'Выше макс. маны' : 'Exceeds max pool';
    } else if (!cs.enoughCastMana) {
      badge.classList.add('is-warn');
      badge.textContent = ru ? 'Мало текущей маны' : 'Low current mana';
    } else {
      badge.classList.add('is-ready');
      badge.textContent = ru ? 'Хватает маны и золота' : 'Affordable to cast';
    }

    // Update live calculation row inside Formula Spoiler without collapsing it
    if (refs.spoilerKvCell) {
      const liveData = buildSpoilerLiveParts(ed, outcome, details, ru, Data, fmtNum, getSlotCost);
      refs.spoilerKvLabel.textContent = liveData.label;
      renderSpoilerLiveCell(refs.spoilerKvCell, liveData, ru, fmtNum, makeSvgIcon);
    }

    // Update 3 numeric panels
    for (const pr of refs.panelRefs) {
      updatePanelLive(pr, ef, slot, outcome, ru, fmtNum);
    }

    // Live sync complete without rebuilding DOM or stealing focus.
  }

  function renderEditorWindow(inner, portWin, sm, ctx) {
    const ui = Ui();
    const { Data, Catalog, ru, fmtNum, standState, makeSvgIcon, getSlotCost, evalCreationState, onStepField, onSetField, onResetSlot, onDeleteSlot, onDone, tipHost } = ctx;
    const doc = inner.ownerDocument;
    const el = (tag, cls, text = null) => ui.el(doc, tag, cls, text);
    const ed = sm.editor;
    const slot = ed.deps.slot;
    const ef = ed.deps.effect;
    const entity = ed.deps.entity;
    const _byRef = Array.isArray(sm.slots) ? sm.slots.indexOf(slot) : -1;
    const slotIdx = _byRef >= 0 ? _byRef : Math.max(0, sm.editOrDeleteSlot ?? 0);

    const efMeta = Data.EFFECT_BY_KEY.get(slot?.key || ef?.key) || ef;
    const details = Catalog.getEffectDetails(efMeta, entity, ru ? 'ru' : 'en') || {
      school: { id: 22, ru: 'Магия', en: 'Magic', color: '#d5b26e' },
      schoolId: 22,
      nameRu: ef.name || ef.key,
      nameEn: ef.name || ef.key,
      spec: { targets: ef.targets ?? 31, magicOnly: false },
      targetLabelRu: 'Универсальная цель',
      targetLabelEn: 'Flexible targets',
      channelLabelRu: 'Зависит от стихии',
      channelLabelEn: 'Uses spell element',
      skillBoosted: false,
      warning: null,
      mechanicsRu: ed.descriptionRows() || [],
      mechanicsEn: ed.descriptionRows() || [],
      spoilerRu: [],
      spoilerEn: [],
    };
    const effName = ru ? details.nameRu : details.nameEn;

    portWin.className = 'px-win port-win dfo-window-frame dfo-fxed-win';
    portWin.style.setProperty('--sm-sch-c', details.school.color || '#d5b26e');

    if (standState.editorTipCtrl) {
      try { standState.editorTipCtrl.hide(); } catch {}
    }
    const tipCtrl = ui.createTipController(doc, tipHost || doc.body, ru);
    standState.editorTipCtrl = tipCtrl;

    // ── Header ──
    const head = el('header', 'port-head dfo-sm-head dfo-fxed-head');
    const titles = el('div', 'port-titles');
    titles.append(el('h2', 'port-title', `${effName}`));
    const subWrap = el('div', 'dfo-sm-head-orn');
    const slotPill = el('span', 'dfo-fxed-slot-pill', ru ? `Слот ${slotIdx + 1} из 3` : `Slot ${slotIdx + 1} of 3`);
    const subEl = el('span', 'port-sub', ru ? 'Параметры эффекта' : 'Effect settings');
    subWrap.append(el('span', 'dfo-sm-head-line'), slotPill, subEl, el('span', 'dfo-sm-head-line'));
    titles.append(subWrap);
    head.append(titles);

    // ── Body ──
    const body = el('div', 'port-body dfo-fxed-body');

    // =========================================================================
    // 1. UPPER BLOCK (Duplicated Picker Information + Live Slot & Spell Costs)
    // =========================================================================
    const topGrid = el('div', 'dfo-sm-grid dfo-fxed-top-grid');

    // Upper-Left: Narrow Cost & Live Summary Pane (Prices, Outcome at Level, Whole Spell Total)
    const upLeft = el('section', 'dfo-subpanel-frame dfo-sm-pane dfo-fxed-up-left');
    const upLeftHead = el('div', 'dfo-sm-pane-head is-stats');
    const upLeftTitleWrap = el('span', 'dfo-sm-pane-title-wrap');
    upLeftTitleWrap.append(
      el('span', 'dfo-sm-pane-gem', '◆'),
      el('span', 'dfo-sm-pane-title', ru ? 'Стоимость и Итог' : 'Cost & Outcome'),
    );
    upLeftHead.append(upLeftTitleWrap);

    const upLeftBody = el('div', 'dfo-sm-pane-body dfo-fxed-up-left-body');

    // 3 Stat Plaques (.dfo-stat-strip: 2 Cost plaques side-by-side + Full-width Outcome plaque)
    const statStrip = el('div', 'dfo-stat-strip dfo-fxed-kpi-strip');
    const skillVal = Number(entity?.skills?.[details.schoolId] ?? 55);
    const L = Math.max(1, Math.trunc(Number(entity?.level) || 1));

    const makePlaque = (cls, label, hintText) => {
      const card = el('div', `dfo-stat-plaque ${cls}`);
      card.append(el('span', 'dfo-stat-label', label));
      const val = el('span', 'dfo-stat-value', '—');
      const hint = el('span', 'dfo-fxed-plaque-sub', hintText);
      card.append(val, hint);
      return { card, val };
    };

    const plaqueSp = makePlaque(
      'is-mana',
      ru ? 'Мана слота' : 'Slot mana',
      ru ? `навык школы: ${skillVal}` : `school skill: ${skillVal}`,
    );
    const plaqueGold = makePlaque(
      'is-gold',
      ru ? 'Золото слота' : 'Slot gold',
      ru ? 'базовая цена слота' : 'base slot cost',
    );
    const plaqueOut = makePlaque(
      'is-power',
      ru ? `Итог на ур. ${L}` : `Result at lvl ${L}`,
      ru ? 'с учётом уровня героя' : 'at active hero level',
    );
    statStrip.append(plaqueSp.card, plaqueGold.card, plaqueOut.card);
    upLeftBody.append(statStrip);

    // Whole Spell Total Bar (.dfo-well-frame)
    const spellBar = el('div', 'dfo-well-frame dfo-fxed-spell-bar');
    const spellMeta = el('div', 'dfo-fxed-spell-meta');
    const mult = Data.TARGET_MULT?.[sm.rangeType ?? 0] ?? 1;
    spellMeta.append(
      el('span', 'dfo-fxed-spell-lbl', ru ? 'Заклинание целиком:' : 'Whole spell total:'),
      el('span', 'dfo-fxed-spell-mult', mult !== 1 ? `×${mult}` : (ru ? '×1 (на себя/касание)' : '×1 (self/touch)')),
    );
    const spellNums = el('div', 'dfo-fxed-spell-nums');
    const spellManaVal = el('span', 'dfo-fxed-spell-mp', '—');
    const spellGoldVal = el('span', 'dfo-fxed-spell-gp', '—');
    const spellStatusBadge = el('span', 'dfo-fxed-spell-badge', '—');
    spellNums.append(spellManaVal, spellGoldVal, spellStatusBadge);
    spellBar.append(spellMeta, spellNums);
    upLeftBody.append(spellBar);

    upLeft.append(upLeftHead, upLeftBody);

    // Vertical brass divider
    const topDivider = el('div', 'dfo-sm-divider');
    topDivider.setAttribute('aria-hidden', 'true');
    topDivider.append(
      el('span', 'dfo-sm-divider-line'),
      el('span', 'dfo-sm-divider-gem', '◆'),
      el('span', 'dfo-sm-divider-line'),
    );

    // Upper-Right: Duplicated Picker Right Pane (Warning Plaque + Mechanics Card + Exact Formula Spoiler)
    const upRight = el('section', 'dfo-subpanel-frame dfo-sm-pane dfo-fxed-up-right');
    const upRightHead = el('div', 'dfo-sm-pane-head is-passives');
    const upRightTitleWrap = el('span', 'dfo-sm-pane-title-wrap');
    upRightTitleWrap.append(
      el('span', 'dfo-sm-pane-gem', '◆'),
      el('span', 'dfo-sm-pane-title', ru ? 'Информация по Эффекту' : 'Effect Information'),
    );
    upRightHead.append(upRightTitleWrap);

    const upRightBody = el('div', 'dfo-sm-pane-body dfo-scroll dfo-fxp-detail dfo-fxed-up-right-body');
    upRightBody.dataset.scrollKey = `fxed-info:${ef.key}`;

    const warnPlaque = ui.buildWarningPlaque(doc, details.warning, ru);
    if (warnPlaque) upRightBody.append(warnPlaque);
    upRightBody.append(ui.buildMechanicsCard(doc, details, ru));

    const spoilerEl = ui.buildFormulaSpoiler(doc, details, ru, {
      open: Boolean(standState.editorSpoilerOpen),
      extraRows: [[ru ? `Расчёт (ур. ${L})` : `Live calc (lvl ${L})`, '—']],
    });
    spoilerEl.addEventListener('toggle', () => {
      standState.editorSpoilerOpen = spoilerEl.open;
    });
    const lastTr = spoilerEl.querySelector('tbody tr:last-child');
    const spoilerKvLabel = lastTr?.querySelector('th') || null;
    const spoilerKvCell = lastTr?.querySelector('td') || null;
    upRightBody.append(spoilerEl);

    upRightBody.addEventListener('scroll', () => tipCtrl.hide(), { passive: true });
    upRight.append(upRightHead, upRightBody);

    topGrid.append(upLeft, topDivider, upRight);
    body.append(topGrid);

    // =========================================================================
    // 2. LOWER BLOCK: 3 PANELS IN A ROW (Duration | Chance | Magnitude)
    // =========================================================================
    const panelsRow = el('div', 'dfo-fxed-panels');
    const panelDefs = buildPanelSpecs(details, ef, ru, Data.boundsFor);
    const panelRefs = [];

    for (const spec of panelDefs) {
      const enabled = spec.fields.some((f) => ed.enabled(f.field));
      const panel = el('section', `dfo-subpanel-frame dfo-fxed-panel is-${spec.id}${enabled ? '' : ' is-disabled'}`);
      panel.style.setProperty('--dfo-panel-c', spec.accent);
      panel.style.setProperty('--dfo-panel-rgb', spec.accentRgb);

      // Panel Header (using parameter icon)
      const pHead = el('div', 'dfo-fxed-panel-head');
      const pTitleWrap = el('div', 'dfo-fxed-panel-title-wrap');
      const pIconKind = spec.id === 'duration' ? 'clock' : spec.id === 'chance' ? 'chance' : 'power';
      const pIco = makeParamIcon(makeSvgIcon, pIconKind, 'dfo-fxed-panel-ico');
      pTitleWrap.append(
        pIco || el('span', 'dfo-fxed-panel-gem', '◆'),
        el('h3', 'dfo-fxed-panel-title', spec.title),
      );
      const helpBtn = el('button', 'dfo-fxed-help-dot', '?');
      helpBtn.type = 'button';
      helpBtn.setAttribute('aria-label', spec.helpDef.title);
      tipCtrl.attach(helpBtn, spec.helpDef);
      pTitleWrap.append(helpBtn);

      const badgeEl = el('span', 'dfo-fxed-live-badge', enabled ? '—' : (ru ? 'Не используется' : 'Not used'));
      pHead.append(pTitleWrap, badgeEl);
      panel.append(pHead);

      const pBody = el('div', 'dfo-fxed-panel-body');

      if (!enabled) {
        const offWell = el('div', 'dfo-well-frame dfo-fxed-disabled-well');
        offWell.append(
          el('div', 'dfo-fxed-disabled-title', ru ? 'Параметр неактивен' : 'Parameter Inactive'),
          el('p', 'dfo-fxed-disabled-msg', disabledReasonText(spec.id, ef, ru)),
        );
        pBody.append(offWell);
        panel.append(pBody);
        panelsRow.append(panel);
        panelRefs.push({
          id: spec.id,
          doc,
          disabled: true,
          badgeEl,
          fieldRows: [],
        });
        continue;
      }

      // Live Final Result Only (formula & tip removed per user request)
      const prevWell = el('div', 'dfo-well-frame dfo-fxed-preview');
      const prevLbl = el('span', 'dfo-fxed-preview-lbl', ru ? 'Конечный расчёт:' : 'Final outcome:');
      const previewVal = el('span', 'dfo-fxed-preview-top', '—');
      prevWell.append(prevLbl, previewVal);
      pBody.append(prevWell);

      // Numeric Control Rows split clearly into Base / Level sections with Divider + Metallic Gold Sliders
      const rowsWrap = el('div', 'dfo-fxed-rows');
      const fieldRows = [];
      let prevSection = null;

      for (const fDef of spec.fields) {
        if (fDef.section === 'base' && prevSection === null) {
          const baseLbl = el('div', 'dfo-fxed-sect-lbl', ru ? 'Стартовая база' : 'Base Values');
          rowsWrap.append(baseLbl);
        } else if (fDef.section === 'level' && prevSection === 'base') {
          const div = el('div', 'dfo-fxed-sect-div');
          div.setAttribute('aria-hidden', 'true');
          div.append(
            el('span', 'dfo-fxed-sect-line'),
            el('span', 'dfo-fxed-sect-text', ru ? '◆ Рост с уровнем' : '◆ Level Scaling'),
            el('span', 'dfo-fxed-sect-line'),
          );
          rowsWrap.append(div);
        }
        prevSection = fDef.section;

        const bounds = Data.boundsFor(fDef.field, slot?.key) || [1, 100];
        const min = bounds[0];
        const max = bounds[1];

        const row = el('div', 'dfo-fxed-row');
        row.dataset.field = fDef.field;

        const rowTop = el('div', 'dfo-fxed-row-top');
        const lblLine = el('div', 'dfo-fxed-row-lbl-line');
        const lbl = el('span', 'dfo-fxed-row-lbl', fDef.label);
        const fHelp = el('span', 'dfo-fxed-help-dot is-mini', '?');
        tipCtrl.attach(fHelp, {
          tone: spec.id === 'duration' ? 'purple' : spec.id === 'chance' ? 'amber' : 'red',
          title: fDef.label,
          kicker: ru ? `Пределы: от ${min} до ${max}` : `Range: ${min} to ${max}`,
          body: fDef.tip,
        });
        const rangeTag = el('span', 'dfo-fxed-row-range', `(${min}..${max})`);
        lblLine.append(lbl, fHelp, rangeTag);

        const stepper = el('div', 'dfo-fxed-stepper');
        const minusBtn = el('button', 'dfo-fxed-step', '−');
        minusBtn.type = 'button';
        minusBtn.title = ru ? 'Уменьшить на 1' : 'Decrease by 1';
        attachHoldStep(minusBtn, () => { inputEl.dataset.editing = '0'; if (doc.activeElement === inputEl) inputEl.blur(); (onStepField ? onStepField(fDef.field, -1) : ed._step(fDef.field, -1, { light: true })); });

        const inputEl = el('input', 'dfo-fxed-input');
        inputEl.type = 'text';
        inputEl.inputMode = 'numeric';
        inputEl.maxLength = 3;
        inputEl.autocomplete = 'off';
        inputEl.value = String(slot?.settings?.[fDef.field] ?? min);
        inputEl.setAttribute('aria-label', fDef.label);
        inputEl.title = `${min} .. ${max}`;

        inputEl.addEventListener('focus', () => {
          inputEl.dataset.editing = '1';
          try { inputEl.select(); } catch {}
        });
        inputEl.addEventListener('input', () => {
          const digits = inputEl.value.replace(/[^\d]/g, '');
          if (digits !== inputEl.value) inputEl.value = digits;
          if (!digits) return;
          const n = parseInt(digits, 10);
          if (Number.isFinite(n) && n >= min && n <= max) {
            (onSetField ? onSetField(fDef.field, n) : ed.setValue(fDef.field, n, { light: true }));
          }
        });
        inputEl.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            inputEl.dataset.editing = '0';
            (onStepField ? onStepField(fDef.field, e.shiftKey ? fDef.coarse : 1) : ed._step(fDef.field, e.shiftKey ? fDef.coarse : 1, { light: true }));
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            inputEl.dataset.editing = '0';
            (onStepField ? onStepField(fDef.field, e.shiftKey ? -fDef.coarse : -1) : ed._step(fDef.field, e.shiftKey ? -fDef.coarse : -1, { light: true }));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            inputEl.blur();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            inputEl.dataset.editing = '0';
            inputEl.blur();
            (onDone ? onDone() : ed._close());
          }
        });
        inputEl.addEventListener('keyup', (e) => e.stopPropagation());
        inputEl.addEventListener('blur', () => {
          const wasEditing = inputEl.dataset.editing === '1';
          inputEl.dataset.editing = '0';
          if (!wasEditing || !inputEl.isConnected || ed.done) return;
          const n = parseInt(inputEl.value, 10);
          const next = Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : (slot?.settings?.[fDef.field] ?? min);
          inputEl.value = String(next);
          (onSetField ? onSetField(fDef.field, next) : ed.setValue(fDef.field, next, { light: true }));
        });

        const plusBtn = el('button', 'dfo-fxed-step', '+');
        plusBtn.type = 'button';
        plusBtn.title = ru ? 'Увеличить на 1' : 'Increase by 1';
        attachHoldStep(plusBtn, () => { inputEl.dataset.editing = '0'; if (doc.activeElement === inputEl) inputEl.blur(); (onStepField ? onStepField(fDef.field, 1) : ed._step(fDef.field, 1, { light: true })); });

        stepper.append(minusBtn, inputEl, plusBtn);
        rowTop.append(lblLine, stepper);

        // Thin Golden Metallic Track + Sculpted 3D Metallic Sphere Slider
        const sliderWrap = el('div', 'dfo-fxed-slider-wrap');
        const sliderEl = el('input', 'dfo-fxed-slider');
        sliderEl.type = 'range';
        sliderEl.min = String(min);
        sliderEl.max = String(max);
        sliderEl.step = '1';
        sliderEl.value = String(slot?.settings?.[fDef.field] ?? min);
        sliderEl.setAttribute('aria-label', `${fDef.label} slider`);
        sliderEl.addEventListener('input', () => {
          const n = parseInt(sliderEl.value, 10);
          if (Number.isFinite(n)) {
            inputEl.dataset.editing = '0';
            (onSetField ? onSetField(fDef.field, n) : ed.setValue(fDef.field, n, { light: true }));
          }
        });
        sliderEl.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            sliderEl.blur();
            (onDone ? onDone() : ed._close());
          }
        });
        sliderEl.addEventListener('keyup', (e) => e.stopPropagation());
        sliderWrap.append(sliderEl);

        row.append(rowTop, sliderWrap);
        rowsWrap.append(row);

        fieldRows.push({
          field: fDef.field,
          min,
          max,
          inputEl,
          sliderEl,
          minusBtn,
          plusBtn,
        });
      }
      pBody.append(rowsWrap);

      panel.append(pBody);
      panelsRow.append(panel);
      panelRefs.push({
        id: spec.id,
        doc,
        disabled: false,
        badgeEl,
        previewVal,
        fieldRows,
      });
    }

    body.append(panelsRow);

    // ── Footer (.dfo-ornate-btn controls) ──
    const foot = el('footer', 'port-foot dfo-fxed-foot');

    const footLeft = el('div', 'dfo-fxed-foot-left');
    const delBtn = el('button', 'dfo-ornate-btn dfo-fxed-del-btn', ru ? 'Удалить эффект' : 'Remove effect');
    delBtn.type = 'button';
    const releaseInputs = (commitPending) => {
      for (const p of panelRefs) {
        for (const r of p.fieldRows) {
          if (commitPending && r.inputEl.dataset.editing === '1' && doc.activeElement === r.inputEl) {
            const n = parseInt(r.inputEl.value, 10);
            if (Number.isFinite(n)) {
              const clamped = Math.max(r.min, Math.min(r.max, n));
              r.inputEl.value = String(clamped);
              (onSetField ? onSetField(r.field, clamped) : ed.setValue(r.field, clamped, { light: true }));
            }
          }
          r.inputEl.dataset.editing = '0';
          if (doc.activeElement === r.inputEl) r.inputEl.blur();
        }
      }
    };
    delBtn.onclick = () => { releaseInputs(false); (onDeleteSlot ? onDeleteSlot() : ed._deleteSlot?.()); };

    const hasEditableGroups = panelRefs.some((p) => !p.disabled);
    const resetBtn = el('button', 'dfo-ornate-btn dfo-fxed-reset-btn', ru ? 'Сбросить в 1' : 'Reset to 1');
    resetBtn.type = 'button';
    resetBtn.disabled = !hasEditableGroups;
    resetBtn.title = ru ? 'Выставить все параметры слота на минимум 1 (экономная база)' : 'Reset all active sliders in this slot to minimum 1';
    resetBtn.onclick = () => {
      releaseInputs(false);
      if (onResetSlot) onResetSlot();
      else if (typeof ed.applyPatch === 'function') ed.applyPatch(Data.defaultSettings(), { light: true });
    };
    footLeft.append(delBtn, resetBtn);

    const footHint = el(
      'span',
      'dfo-sm-foot-hint dfo-fxed-foot-hint',
      ru ? 'Изменения применяются сразу · Выгоднее всего оставлять «Базу = 1» · Esc — готово'
         : 'Changes apply live · Keeping "Base = 1" saves the most mana · Esc — Done',
    );

    const doneBtn = el('button', 'dfo-ornate-btn primary dfo-fxed-done-btn', ru ? 'Готово' : 'Done');
    doneBtn.type = 'button';
    doneBtn.onclick = () => { releaseInputs(true); (onDone ? onDone() : ed._close()); };

    foot.append(footLeft, footHint, doneBtn);

    inner.append(head, body, foot);

    const refs = {
      rootEl: portWin,
      doc,
      sm,
      ed,
      details,
      ru,
      fmtNum,
      Data,
      makeSvgIcon,
      getSlotCost,
      evalCreationState,
      plaqueSpVal: plaqueSp.val,
      plaqueGoldVal: plaqueGold.val,
      plaqueOutVal: plaqueOut.val,
      spellManaVal,
      spellGoldVal,
      spellStatusBadge,
      spoilerKvLabel,
      spoilerKvCell,
      panelRefs,
    };

    standState.editorRefs = refs;
    syncLight(refs);
    return refs;
  }

  root.__dfoSpellmakerEditor = Object.freeze({
    render: renderEditorWindow,
    syncLight,
  });
})(typeof window !== 'undefined' ? window : globalThis);

/* Spellmaker Mechanics Guide Modal — Styled 1:1 after Inventory's "Equipped Gear Bonuses Summary" (.dfo-seal-modal).
 * Plain, accessible language for every player in the main body + collapsible <details> spoilers for exact math & caps. */
(function (root) {
  'use strict';

  function el(doc, tag, cls, text = null) {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }

  function makeBookSvg(doc, size = 20) {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('class', 'dfo-st-head-ico');
    svg.setAttribute('aria-hidden', 'true');
    const defs = [
      { tag: 'path', d: 'M3 5.5C3 4.7 3.7 4 4.5 4H11v15.5H5c-1.1 0-2-.7-2-1.8V5.5Z', fill: '#1c2b48', stroke: '#7da8ea', 'stroke-width': '1.5', 'stroke-linejoin': 'round' },
      { tag: 'path', d: 'M21 5.5C21 4.7 20.3 4 19.5 4H13v15.5h6c1.1 0 2-.7 2-1.8V5.5Z', fill: '#17233b', stroke: '#7da8ea', 'stroke-width': '1.5', 'stroke-linejoin': 'round' },
      { tag: 'path', d: 'M11 5.5h2v14h-2z', fill: '#d5b26e' },
      { tag: 'path', d: 'M5.5 8h4M5.5 11h4M5.5 14h3M14.5 8h4M14.5 11h4M14.5 14h3', stroke: '#f5d451', 'stroke-width': '1.2', 'stroke-linecap': 'round' },
    ];
    for (const def of defs) {
      const node = doc.createElementNS('http://www.w3.org/2000/svg', def.tag || 'path');
      for (const [k, v] of Object.entries(def)) {
        if (k !== 'tag') node.setAttribute(k, v);
      }
      svg.append(node);
    }
    return svg;
  }

  function getGuideData(ru) {
    if (ru) {
      return {
        title: 'Гайд по Механике Заклинаний',
        badge: 'ПАМЯТКА МАГА · БЕЗ ВОДЫ',
        intro: 'Простой и честный разбор того, как магия на самом деле работает внутри игры. Без заумных терминов: чтобы не тратить золото и ману зря, не проваливать ловлю душ и понимать, какие эффекты складываются, а какие сливаются в один.',
        kpis: [
          { label: 'Максимум слотов', value: '3', tone: 'total' },
          { label: '1 маг. раунд', value: '1 МИН.', tone: 'ok' },
          { label: 'Кап закл. поглощения', value: '50%', tone: 'arc' },
          { label: 'Потолок навыка 200', value: '+40% МАКС', tone: 'gold' },
        ],
        leftPane: {
          title: 'Основы, Порядок и Защита',
          count: '4 РАЗДЕЛА',
          cards: [
            {
              tag: 'Старт',
              tagTone: 'gold',
              title: '1. Введение: из чего собрано заклинание',
              paragraphs: [
                'Любое заклинание — это бутерброд максимум из 3 эффектов (строк). Сверху вы задаёте цель (в себя, касанием в упор, выстрелом во врага, волной вокруг себя или взрывом вдали) и стихию. Некоторые эффекты блокируют несовместимые цели: например, «Щит» или «Телепорт» работают только «На себя», а урон или «Паралич» нельзя кинуть на себя.',
                'У заклинания две РАЗНЫЕ цены: золото платится один раз мастеру гильдии за запись в книгу, а мана (МП) уходит при каждом применении. Если смешать эффекты из разных школ магии, скидка по навыку для каждого слота считается от ЕГО собственной школы! А формат цели умножает и ману, и цену в золоте.',
                'Если золота и книги хватает, но текущей маны мало даже на одно применение — купить заклинание всё равно можно (кнопка станет янтарной), но скастовать его получится только после отдыха.',
              ],
              spoilerTitle: 'Спойлер: точная формула цены (золото и мана)',
              spoilerLines: [
                ['Базовая цена слота', 'Считается по таблице эффекта от длительности, шанса, среднего разброса силы и шага «каждые N уровней» (чем меньше «N», тем выше цена).'],
                ['Множители цели (для МП и золота)', 'На себя: ×1 · Касание: ×1 · Одна цель на расстоянии: ×1.5 · Вокруг заклинателя: ×2 · Область на расстоянии: ×2.5.'],
                ['Итоговая мана и покупка', 'Мана (минимум 5 МП) = ⌊сумма(цена_слота с учётом скидки школы) × множитель_цели⌋. Выше навыка 100 цена маны продолжает снижаться до потолка эффективного навыка 140 (~на 28.6% дешевле, чем при 100). Золото = ⌊сумма(базовая_цена_слотов) × множитель_цели⌋ × наценка гильдии.'],
              ],
            },
            {
              tag: 'Важно',
              tagTone: 'red',
              title: '2. В каком порядке срабатывают слоты (1 → 2 → 3)',
              paragraphs: [
                'Игра НЕ смешивает слоты и НЕ запускает их одновременно. При попадании она проверяет их строго по очереди: сначала 1-й, потом 2-й, затем 3-й.',
                'Каждый слот проходит защиту цели ОТДЕЛЬНО. Вполне обычная ситуация, когда 1-й слот пробил монстра, а 2-й он заблокировал сопротивлением.',
                'ГЛАВНОЕ ПРАВИЛО «ЛОВУШКИ ДУШ»: если поставить урон в 1-й слот, а «Ловушку душ» во 2-й, враг может умереть от 1-го удара раньше, чем на него ляжет метка — камень душ останется пустым! Поэтому «Ловушку душ», «Безмолвие» или «Паралич» всегда ставьте ВЫШЕ урона (в 1-й слот).',
              ],
              spoilerTitle: 'Спойлер: точный порядок проверок для каждого слота',
              spoilerLines: [
                ['Шаг 1 — Иммунитет к параличу', 'Если слот накладывает Паралич, а на цели висит «Свобода движения» или врождённый иммунитет к параличу — слот сразу пропускается.'],
                ['Шаг 2 — Поглощение и Отражение', 'Сначала проверяется Поглощение (только для школы Разрушения). Если не поглотилось — Отражение: сработавший слот не бьёт врага, а ВСЁ заклинание целиком рикошетит обратно в заклинателя (без повторных отскоков и пинг-понга).'],
                ['Шаг 3 — Сопротивление магии', 'Для любых целей, кроме «На себя», кидается шанс полностью отменить текущий слот.'],
                ['Шаг 4 — Шанс и спасбросок', 'Проверяется ваш шанс наложения («C»), затем активные баффы защиты от стихии и спасбросок врага (каст «На себя» спасбросков не делает!).'],
              ],
            },
            {
              tag: 'Защита',
              tagTone: 'teal',
              title: '3. Три щита: Поглощение, Отражение и Сопротивление',
              paragraphs: [
                'ПОГЛОЩЕНИЕ ЗАКЛИНАНИЙ («съесть магию»): работает ТОЛЬКО против атакующих эффектов школы Разрушения — лечение, безмолвие или баффы оно не глотает! Самый коварный подвох: в вашей полоске маны должно хватать пустого места на ПОЛНУЮ (100%) цену входящего эффекта, при этом в ману вернётся ровно ПОЛОВИНА (50%) этой цены. Если мана полная или свободного места не хватает — поглощение не сработает, и урон пройдёт полностью!',
                'ОТРАЖЕНИЕ ЗАКЛИНАНИЙ: сработавший слот не действует на защитника, а всё заклинание целиком летит обратно в того, кто его бросил (за один проход отразиться может не больше раза — бесконечного «пинг-понга» нет, и заклинание «На себя» от себя не отскочит).',
                'СОПРОТИВЛЕНИЕ ЗАКЛИНАНИЯМ vs СПАСБРОСОК: «Сопротивление заклинаниям 30%» — это НЕ «минус 30% урона», а шанс 30% вообще не получить слот (0 урона, иначе прилетят все 100%). А уже дальше работает защита от конкретной стихии (Огонь, Холод и т.д.) и спасбросок с Волей, расой и вещами — удачный спасбросок способен плавно урезать урон вплоть до полного нуля.',
              ],
              spoilerTitle: 'Спойлер: шансы поглощения, кривая спасброска и канал «Магия»',
              spoilerLines: [
                ['Поглощение: 50% возврата', 'Эффект заклинания «Поглощение заклинаний» ограничен 50% шанса (зачарование даёт 50%, а преимущество карьеры в нужное время суток — 100%). Цена для проверки места считается от уровня получателя; восстанавливается ⌊цена × 0.5⌋ (при самокасте — не больше потраченной на бросок маны).'],
                ['Спасбросок цели', 'Сначала сумма баффов «Сопротивления стихии» может полностью обнулить урон. Иначе спасбросок (база 50% + Воля + раса/карьера/вещи, порог 5–95% или иммунитет 100%) при успехе снижает силу ступеньками от 95% вплоть до 0%.'],
                ['Скрытый канал Магии (id=4)', 'Лечение, щиты, усиления, усмирение, невидимость, открывашки и телепорты при спасбросках всегда идут как стихия «Магия», какую бы стихию вы ни выбрали сверху (каст «На себя» спасброски пропускает).'],
              ],
            },
            {
              tag: 'Время и рост',
              tagTone: 'purple',
              title: '4. Что такое «Раунд» и потолок навыка выше 100',
              paragraphs: [
                '1 магический раунд = 1 игровая минута. Самый первый раунд срабатывает МГНОВЕННО в секунду применения (ждать минуту начала действия не нужно: например, 3 раунда — это эффект сразу и ещё дважды с интервалом в минуту).',
                'ГЛАВНЫЙ СЕКРЕТ ВЫГОДЫ — НЕ ТРОГАЙТЕ «БАЗУ»: везде, где можно задать рост с уровнем, оставляйте «Базу» на 1, а нужную мощность, время или процент выкручивайте именно в «Прибавке за каждый 1 уровень» (например, 1 база + 7–10% в уровень вместо 100% в базе). Такой спелл стоит в разы меньше маны и золота, а к 10–14 уровню (которые берутся за пару часов) выходит на те же 100% или высокий урон!',
                'Рост «каждые N уровней» работает лесенкой: прибавка приходит на кратных уровнях, а для длительности всегда берётся минимум 1 шаг — даже персонаж 1-го уровня получит первую ступеньку времени.',
                'СВЕРХМАСТЕРСТВО (навык > 100): если активно «Мастерство навыков» (в онлайне включено всегда, в офлайне можно переключать), прокачка школы выше 100 даёт до +40% усиления при навыке 200! Но рост после 100 замедляется: каждое очко даёт четверть эффективности плюс бонусы за крупные рубежи.',
              ],
              spoilerTitle: 'Спойлер: точные формулы «D», «M», «C» и софткапа 101–200',
              spoilerLines: [
                ['Длительность D и Шанс C', 'D = База + Плюс × max(1, ⌊Уровень / Каждые_N⌋). C = База + Плюс × ⌊Уровень / Каждые_N⌋ (зажато 0–100%, у Поглощения кап 50%).'],
                ['Сила эффекта M', 'M = Случ[БазаМин; БазаМакс] + Случ[ПлюсМин; ПлюсМакс] × ⌊Уровень / Каждые_N⌋. Случайный бросок обновляется каждый тик!'],
                ['Софткап навыка (101–200)', 'ЭффНавык = ⌊100 + (Навык − 100) × 0.25 + Вехи⌋, где вехи: +2 (125), +3 (150), +4 (175), +6 (200) = +15. Навык 200 даёт эффективный 140 → множитель ×1.40 (+40% макс).'],
                ['На что влияет (> 100)', 'Прямой и длит. Урон здоровью, самолечение (Исцеление здоровья и Регенерация), Щит, шансы Отражения / Сопротивления магии (на себя) / Ловушки душ / Безмолвия / Изгнания и время Невидимости / Хамелеона / Тени. На рикошетом отражённые касты и вещи с эффектом «при ношении» не действует.'],
              ],
            },
          ],
        },
        rightPane: {
          title: 'Слияния, Сломанное и Ловушки',
          count: '3 РАЗДЕЛА',
          cards: [
            {
              tag: 'Стаки',
              tagTone: 'amber',
              title: '5. Какие эффекты сливаются, а какие складываются',
              paragraphs: [
                'НЕ ВСЁ СКЛАДЫВАЕТСЯ! Если дважды наложить одинаковый временный эффект («Хождение по воде», «Левитация», «Отражение», «Паралич» на врага или два «Длит. урона здоровью») — второй бросок НЕ удвоит силу! Он лишь продлит оставшееся время действия, оставив старую силу и шанс первого.',
                'ЧТО СКЛАДЫВАЕТСЯ ЧЕСТНО: любые слоты мгновенного «Урона» или «Исцеления» (3 слота урона ударят трижды подряд), а также тикающие эффекты РАЗНЫХ видов — на враге могут одновременно работать Длит. урон здоровью + Длит. урон мане + Длит. урон запасу сил.',
                'ОСОБЫЕ СЛИЯНИЯ: 1) «Щит» при повторе дозаряжает оставшуюся броню до своего максимума и продлевает срок. 2) «Истощение» только бессрочно снижает характеристику врага до лечения, а «Передача характеристики» снижает её у врага И лечит вашу ранее истощённую (выше базовой не поднимет); повторные штрафы суммируются в одном проклятии. 3) «Укрепление характеристики» и «Регенерация» сольются только при совпадении ВСЕХ 11 ползунков — сдвиньте любой на 1, и они будут работать параллельно!',
                'СТИХИИ И ЩИТЫ: среди заклинаний «Поглощение заклинаний» действует только максимальный процент среди активных эффектов (плюс отдельно чары и карьера). «Сопротивление заклинаниям», «Отражение» и «Понимание языков» при повторном обычном касте лишь продлевают оставшееся время (текущий % не перезаписывается до конца таймера). «Сопротивление стихиям» от разных источников (напр., бафф и предмет) суммируется, а повтор того же элемента обновляет время.',
              ],
              spoilerTitle: 'Спойлер: как слияние устроено в коде (flatAnimation)',
              spoilerLines: [
                ['Только продление времени', 'Паралич, Сопротивление стихии (той же), Ловушка душ, Поглощение, Отражение, Сопротивление магии, Понимание языков, Свет, Безмолвие, Обнаружение, Полёты и Маскировка.'],
                ['Ключ 11 настроек (settingsKey)', '«Укрепление характеристики» и «Регенерация» сравнивают все 11 числовых полей настроек: совпали — обновляют существующий бафф; отличаются — добавляют второй сверху!'],
                ['Особое суммирование', 'Drain/Transfer Attribute накапливают штраф до «Исцеления характеристики». Щит: shieldRemaining = min(startingShield, cur + roll).'],
              ],
            },
            {
              tag: 'Сломано / Баги',
              tagTone: 'red',
              title: '6. Что исключено, сломано или работает не так, как кажется',
              paragraphs: [
                '• «ПРЕВРАЩЕНИЕ СЕБЯ» и «ВОСКРЕШЕНИЕ»: исключены из конструктора заклинаний — собрать своё заклинание с ними нельзя (первое нужно для превращения вервольфа/вербоара, второе поднимает союзника касанием с 30% HP).',
                '• «РАСПЫЛЕНИЕ» (Disintegrate): НЕ ломает броню или оружие! Если пройдёт шанс и враг провалит спасбросок, заклинание пытается нанести ему урон, равный ВСЕМУ его текущему здоровью (лотерейный ваншот).',
                '• «РАССЕИВАНИЕ МАГИИ» (Dispel Magic): работает ТОЛЬКО на игроков — на монстрах полностью пропускается и не снимает с них ничего! Позволяет выбрать ОДИН ваш активный набор эффектов и снять все его слоты сразу (свои и союзные заклинания снимаются со 100% успехом, чужие проклятия и чары вещей «при ношении» проверяют шанс; если нажать «Отмена», мана всё равно потрачена).',
                '• «ИЗГНАНИЕ НЕЖИТИ / ДАЭДРА»: опасная ловушка! Изгнанный враг стирается из мира без трупа — вы НЕ получите с него добычу и его НЕ засчитают в квест на убийство.',
                '• «ОТКРЫТЬ / ЗАПЕРЕТЬ»: не взламывает дверь на расстоянии! Шанс срабатывания бросается сразу при касте заклинания, вешая на руки заряд. А уже при нажатии на дверь с вашим уровнем персонажа сравнивается уровень замка (без повторного броска шанса).',
                '• «СОЗДАНИЕ ПРЕДМЕТА»: теряет 1 игровую минуту СРАЗУ при касте. При итоговой длительности 1 минута предмет исчезнет сразу на 0-й минуте — оставьте базу на 1 и добавьте хотя бы +1 за уровень, чтобы уже на 1-м уровне было 2+ минуты.',
                '• «ОПРЕДЕЛИТЬ» (Identify) и «ТЕЛЕПОРТ»: «Определить» действует только на игрока (монстров пропускает) — ману за этот слот временно возвращают на время выбора, а списывается она лишь при подтверждении опознания (закрыли окно отменой — мана не сгорит!). «Телепорт» срабатывает только с целью «На себя».',
                '• «ЗАПАС СИЛ × 64» (не путать с Выносливостью!): для «Урона / Исцеления / Передачи запаса сил» (стамины) цифра из редактора внутри игры умножается на 64 (то есть «5» даёт 320 единиц запаса сил!).',
              ],
              spoilerTitle: 'Спойлер: точные проверки и ограничения в коде игры',
              spoilerLines: [
                ['Morph Self / Resurrect', 'Оба эффекта помечены craftable: false и убраны из каталога создания в мастерской.'],
                ['Dispel Magic и Identify', 'Оба пропускают цели с mobileType != null; Identify временно возвращает цену слота на время выбора и списывает её лишь при попытке опознать предмет.'],
                ['Открытие дверей (Open / Lock)', 'При нажатии на дверь тратит заряд и проверяет door.currentLockValue <= уровень игрока (скелетный ключ обходит проверку уровня).'],
                ['Create Item и Stamina × 64', 'Срок предмета = max(0, раунды − 1) мин. Вся работа со стаминой (damage/heal/transferFatigue) передаёт e × 64.'],
              ],
            },
            {
              tag: 'Тонкости',
              tagTone: 'gold',
              title: '7. Пять важных хитростей, о которых все забывают',
              paragraphs: [
                '1. ОБЫЧНАЯ vs ИСТИННАЯ невидимость (и Хамелеон / Тень): «Обычная» слетает мгновенно, стоит ударить врага или кинуть враждебное заклинание. «Истинная» НЕ спадает в бою! Обе удлиняются при Иллюзии выше 100.',
                '2. «ЩИТ» — это НЕ класс брони! Это временная подушка дополнительного здоровья поверх вашей полоски HP, которая принимает урон первой, пока не закончится.',
                '3. «ПЕРЕДАЧА ЗДОРОВЬЯ»: лечит вас ровно на ту сумму, которую выбросило заклинание по формуле — даже если у раненой крысы оставался 1 HP (но выше вашего максимума HP всё равно не зальёт).',
                '4. БОЛЕЗНИ И ВАМПИРИЗМ / ЛИКАНТРОПИЯ: если на вас висит обычная болезнь и ранняя инфекция вампира или оборотня, «Излечение болезни» сначала снимет ТОЛЬКО обычные болезни. Заражение снимется лишь повторным самоприменением, когда других болезней не осталось!',
                '5. «ПРЫЖОК» и «СВОБОДА ДВИЖЕНИЯ»: «Прыжок» даёт не проценты высоты, а фиксированную прибавку +0.6 к силе толчка и руление в полёте (ползунок силы не используется). «Свобода движения» при наложении сразу снимает висящий паралич и защищает от нового.',
              ],
              spoilerTitle: 'Спойлер: Detect, Усмирение, Картография и сложность',
              spoilerLines: [
                ['Обнаружение (Магия / Враги / Сокровища)', 'В редакторе настраивается только длительность — радиус задаётся системным детектором игры.'],
                ['Усмирение / Очарование', 'Держится до первой новой атаки игрока по цели; не действует на боссов и существ с защитой pacifyImmune.'],
                ['Общая картография', 'Делится открытой картой подземелья с союзниками по группе, которые прямо сейчас находятся в том же подземелье.'],
                ['Разрушение vs Исцеление', 'Урон по существам умножается на коэффициент сложности цели (damageScale), а лечение и щит на себя — нет.'],
              ],
            },
          ],
        },
        closeLabel: 'Закрыть',
        escHint: 'Esc или клик вне окна — закрыть',
      };
    }

    return {
      title: 'Spell Mechanics Guide',
      badge: 'MAGE FIELD MANUAL · NO JARGON',
      intro: 'An honest, plain-English field guide to how spells actually work under the hood. No math headaches — just clear rules so you never waste gold, botch Soul Traps, or cast buffs that quietly merge instead of stacking.',
      kpis: [
        { label: 'Max slots per spell', value: '3', tone: 'total' },
        { label: '1 magic round', value: '1 MIN', tone: 'ok' },
        { label: 'Spell Absorb cap', value: '50%', tone: 'arc' },
        { label: 'Skill 200 overcap', value: '+40% MAX', tone: 'gold' },
      ],
      leftPane: {
        title: 'Basics, Order & Defenses',
        count: '4 CHAPTERS',
        cards: [
          {
            tag: 'Basics',
            tagTone: 'gold',
            title: '1. What a spell is actually made of',
            paragraphs: [
              'Every custom spell is a stack of up to 3 effect rows. Above them you choose delivery (self, touch, single bolt at range, burst around you, or ranged blast) and an element. Some effects restrict targets: Shields and Teleport only allow Caster Only, while attacks and Paralyze cannot target yourself.',
              'Spells have TWO separate costs: Gold is paid once to inscribe the spell into your grimoire, while Magicka (SP) is spent on every cast. Mixing effects from different schools lets each slot use its OWN school skill discount, and your delivery format multiplies both SP and Gold!',
              'Even if your current magicka is below 1 cast, you can still craft and buy the spell as long as you have a Spellbook and enough gold (amber button) — just rest before trying to cast it.',
            ],
            spoilerTitle: 'Spoiler: exact gold & SP formulas',
            spoilerLines: [
              ['Base slot cost', 'Calculated from duration, chance, average min/max magnitude, and per-level step (smaller "every N levels" steps cost much more).'],
              ['Target multipliers (both SP & Gold)', 'Caster only: ×1 · By touch: ×1 · Single target at range: ×1.5 · Area around caster: ×2 · Area at range: ×2.5.'],
              ['Final SP & Gold price', 'Cast SP (min 5) = rounded-down sum(slot school-discounted cost) × target. Beyond skill 100, SP cost keeps dropping up to effective skill 140 (~28.6% cheaper than at 100). Guild Gold = rounded-down sum(base slot costs) × target × guild factor.'],
            ],
          },
          {
            tag: 'Critical',
            tagTone: 'red',
            title: '2. Slot execution order (1 → 2 → 3)',
            paragraphs: [
              'The engine does NOT fire slots all at once. It resolves Slot 1 first, then Slot 2, then Slot 3 — and each slot tests target defenses on its own! Slot 1 can land while Slot 2 gets resisted or bounced.',
              'SOUL TRAP RULE: Never put lethal Damage in Slot 1 and Soul Trap in Slot 2! If Slot 1 kills the creature, Soul Trap arrives on a corpse and captures nothing. Always place Soul Trap, Silence, or Paralyze ABOVE Damage!',
            ],
            spoilerTitle: 'Spoiler: exact per-slot defense pipeline',
            spoilerLines: [
              ['Step 1 — Paralysis Immunity', 'If a slot applies Paralyze and the target has Free Action or innate paralysis immunity, that slot is skipped right away.'],
              ['Step 2 — Absorption & Reflection', 'Spell Absorption runs first (Destruction effects only). Next, if Spell Reflection procs, that slot skips the defender AND the ENTIRE spell ricochets back onto the caster (no further bounces or infinite ping-pong).'],
              ['Step 3 — Spell Resistance', 'For any non-self cast, Spell Resistance rolls to completely shrug off that single slot.'],
              ['Step 4 — Chance & Saving Throw', 'Rolls effect Chance ("C"), summed Elemental Resistance buffs, and target elemental Saving Throw (Caster-only spells skip Spell Resistance and Saving Throws!).'],
            ],
          },
          {
            tag: 'Defense',
            tagTone: 'teal',
            title: '3. Absorption, Reflection, Resistance & Saves',
            paragraphs: [
              'SPELL ABSORPTION only eats offensive Destruction effects — never heals, Silence, or utility buffs! The big catch: your MP bar must have enough empty room for 100% of the absorbed effect cost, while only HALF (50%) of that cost is restored to your pool. If your magicka bar is full or lacks space, absorption fails and you take the full hit.',
              'SPELL REFLECTION bounces the spell if any incoming slot triggers it: that slot misses the target and the entire cast rebounds onto the original caster (capped at one bounce total; self-casts never reflect).',
              'SPELL RESISTANCE vs SAVING THROWS: "30% Spell Resistance" does NOT reduce damage by 30% — it is an all-or-nothing 30% chance to negate the slot completely (0% hit, otherwise 100%). Elemental Resistance buffs and Saving Throws (driven by Willpower, race/career perks, and gear) come next and can smoothly scale damage down anywhere from partial hits to 0%.',
            ],
            spoilerTitle: 'Spoiler: caps, return math & forced Magic channel',
            spoilerLines: [
              ['Absorption math', 'Spell-granted Absorption caps at 50% (item enchants roll 50%; career Light/Dark/Always gives 100%). Check uses the RECIPIENT level cost; restores floor(cost × 0.5) MP (self-cast hits cannot refund more than SP paid).'],
              ['Saving Throw curve', 'Active Elemental Resistance buffs sum first (full block on proc). Otherwise Saving Throw (50% base + Willpower + race/career/bio/gear, clamped 5–95% or 100% immune) smoothly scales near-saves down in 5% steps from 95% to 0%.'],
              ['Hidden Magic channel (id=4)', 'Heals, buffs, shields, pacify, concealment, open/lock, and teleport always test against Magic (id=4) regardless of chosen element icon when cast on others.'],
            ],
          },
          {
            tag: 'Timing',
            tagTone: 'purple',
            title: '4. Magic rounds, level scaling & skill overcap',
            paragraphs: [
              '1 magic round = 1 in-game minute, and the first round fires IMMEDIATELY the moment you cast — you never wait a minute for a buff or DoT to start ticking (3 rounds = instant tick + two more at +1m and +2m).',
              'THE GOLDEN ECONOMY RULE — LEAVE BASE AT 1: Whenever an effect allows per-level scaling, keep Base at 1 and put the growth into Plus per 1 level (e.g., Base 1 + 7–10% per level instead of Base 100%). Your spell becomes dramatically cheaper in both MP and gold, and naturally reaches full reliability or power around levels 10–14.',
              'Per-level scaling climbs in staircases ("every N levels" jumps only on multiples of "N"). Duration always grants at least 1 step so even a Level 1 mage gets the first step of duration.',
              'SKILL OVERCAP (> 100): With Master Skills active (always On online; toggleable offline), pushing a school past 100 up to 200 boosts spells up to +40% max! Above 100, each point counts for a quarter step plus milestone bonuses.',
            ],
            spoilerTitle: 'Spoiler: exact "D" / "M" / "C" & 101–200 softcap math',
            spoilerLines: [
              ['Duration D & Chance C', 'D = Base + Plus × max(1, ⌊Level / PerLevel⌋). C = clamp(0..100, Base + Plus × ⌊Level / PerLevel⌋) (Absorption spell capped at 50%).'],
              ['Magnitude M', 'Rand[BaseLo; BaseHi] + Rand[PlusLo; PlusHi] × floor(Level / PerLevel), re-rolled fresh on every round tick.'],
              ['Softcap (raw 101–200)', 'EffectiveSkill = ⌊100 + (Skill − 100) × 0.25 + Milestones⌋, where milestones add +2 (125), +3 (150), +4 (175), +6 (200) = +15. Raw 200 becomes eff. 140 → ×1.40 (+40% cap).'],
              ['Scaled effects', 'Direct & Continuous Health Damage, self Heal Health & Regenerate, Shield, Soul Trap / Silence / Dispel Undead-Daedra / Spell Reflection & Spell Resistance chance, and concealment duration. Does NOT apply to reflected hits or held magic item effects.'],
            ],
          },
        ],
      },
      rightPane: {
        title: 'Merging, Broken & Traps',
        count: '3 CHAPTERS',
        cards: [
          {
            tag: 'Stacking',
            tagTone: 'amber',
            title: '5. Which effects merge vs stack',
            paragraphs: [
              'NOT EVERYTHING STACKS! Re-casting the same timed effect (Water Walking, Levitate, Reflection, Paralyze, Light, Silence, Continuous Health Damage, etc.) does NOT double ticks or chance — it only extends the remaining timer if longer, keeping the original power and chance!',
              'WHAT STACKS CLEANLY: Instant Damage and Heal slots (3 damage slots = 3 hits), plus different damage-over-time (DoT) types ticking together (Health + Magicka + Fatigue DoTs all run side by side).',
              'SPECIAL MERGES: (1) Re-casting Shield tops up remaining barrier HP toward its ceiling and extends duration. (2) Drain Attribute lowers a target stat indefinitely until cured, while Transfer Attribute lowers theirs AND heals your own drained attribute (never boosts past base); repeat debuffs add together. (3) Fortify Attribute & Regenerate merge ONLY if all 11 slider values match identically — nudge any slider by 1 to stack two!',
              'RESISTANCES & SHIELDS: Spell Absorption uses the single highest active percentage (gear and career advantages roll alongside). Recasting Spell Resistance, Reflection, or Comprehend Languages normally extends remaining duration only (keeping the active % until it expires). Elemental Resistance stacks across different sources (item + spell), while recasting the same elemental spell just refreshes duration.',
            ],
            spoilerTitle: 'Spoiler: runtime merge & refresh table',
            spoilerLines: [
              ['Duration refresh only', 'Paralyze, same-element Resistance, Soul Trap, Absorption, Reflection, Spell Resistance, Comprehend Languages, Light, Silence, Detect, Movement & Concealment.'],
              ['11-slider key (settingsKey)', 'Fortify Attribute and Regenerate compare all 11 parameter sliders; an identical spell refreshes duration, while any difference creates a separate active buff.'],
              ['Special accumulation', 'Drain/Transfer Attribute sums penalties permanently until Heal Attribute. Shield: remaining = min(ceiling, current + roll).'],
            ],
          },
          {
            tag: 'Quirks',
            tagTone: 'red',
            title: '6. Excluded, broken, or misleading effects',
            paragraphs: [
              '• Morph Self & Resurrect: excluded from Spellmaker crafting (cannot be used in custom guild spells; Morph Self handles werewolf/wereboar shifting, while Resurrect revives allies by touch at 30% HP).',
              '• Disintegrate: does NOT break armor or weapons! On a failed save it simply tries to inflict damage equal to 100% of the target\'s current HP (an all-or-nothing one-shot lottery).',
              '• Dispel Magic: player-only (completely skipped on monsters!) — lets you pick ONE active spell bundle on yourself to clear all its slots at once (your own and ally spells always clear cleanly, while hostile debuffs and equipped item held-effects roll your chance; canceling still keeps the SP spent on cast).',
              '• Dispel Undead / Daedra: banished foes vanish outright with NO corpse, NO loot, and NO quest kill credit!',
              '• Open / Lock: does NOT unlock doors from afar! Its Chance rolls immediately on cast to arm your hands; when you next click a door, your character Level is checked against the door\'s lock level (no second chance roll).',
              '• Create Item: immediately burns 1 game minute on cast (rounds minus 1), so a 1-minute duration vanishes on minute 0 — keep Base at 1 plus +1 per level to start at 2+ minutes even at Level 1.',
              '• Identify & Teleport: Identify works only on players (skipped on mobs); it temporarily refunds the slot\'s SP while the window is open and only spends it when you actually try to identify an item (canceling keeps your SP, unlike Dispel Magic!). Teleport triggers only on Caster Only.',
              '• Fatigue × 64 (not Endurance!): Damage/Heal/Transfer Fatigue values in the editor multiply by 64 inside the engine (5 in the slider = 320 Fatigue points!).',
            ],
            spoilerTitle: 'Spoiler: exact internal engine guards',
            spoilerLines: [
              ['Excluded effects', 'Morph Self and Resurrect have craftable: false in spellEffects.',],
              ['Player-only filters', 'Dispel Magic and Identify skip targets with target.mobileType != null; Identify temporarily refunds slot SP until you confirm identification.',],
              ['Doors (Open / Lock)', 'Clicking a door consumes the armed charge and checks door.currentLockValue <= player level (bypassed by Skeleton Key).'],
              ['Lifetime & Fatigue scaling', 'Create Item lifetime = max(0, rounds - 1) minutes; all Fatigue effects pass magnitude * 64.'],
            ],
          },
          {
            tag: 'Tips',
            tagTone: 'gold',
            title: '7. Five crucial survival tricks',
            paragraphs: [
              '1. Normal vs True concealment: Normal Invisibility, Chameleon, and Shadow break immediately the moment you attack or cast hostilely; True variants stay active right through combat! Both scale duration above Illusion 100.',
              '2. Shield is NOT Armor Rating — it is an extra temporary HP cushion sitting on top of your health bar that absorbs damage first.',
              '3. Transfer Health heals you for the full rolled spell damage even if the dying rat only had 1 HP left (still capped by your max HP).',
              '4. Diseases vs Vampirism / Lycanthropy: if you carry an ordinary disease alongside an early vampire/werewolf infection, Cure Disease wipes ONLY ordinary diseases first. Cast it on yourself again once ordinary diseases are gone to purge the curse!',
              '5. Jumping & Free Action: Jumping grants a flat +0.6 jump boost plus mid-air steering (magnitude sliders are ignored). Free Action immediately clears active paralysis on cast and blocks new paralysis while active.',
            ],
            spoilerTitle: 'Spoiler: Detect, Pacify, Cartography & difficulty notes',
            spoilerLines: [
              ['Detect (Magic / Enemy / Treasure)', 'Only duration is configurable — detection radius is fixed by the engine detector.'],
              ['Pacify / Charm', 'Lasts until the player attacks the calmed target again; ignored by bosses or targets marked pacifyImmune.'],
              ['Shared Cartography', 'Shares newly explored dungeon map segments only with party members currently inside the same dungeon.'],
              ['Difficulty scaling', 'Hostile spell damage scales by target difficulty damageScale; self-healing and shields do not.'],
            ],
          },
        ],
      },
      closeLabel: 'Close',
      escHint: 'Esc or click outside window to close',
    };
  }

  let activeGuideModal = null;
  let activeGuideKeyHandler = null;
  let activeGuideDoc = null;

  function close() {
    if (activeGuideKeyHandler && activeGuideDoc) {
      try { activeGuideDoc.removeEventListener('keydown', activeGuideKeyHandler, true); } catch {}
    }
    activeGuideKeyHandler = null;
    activeGuideDoc = null;
    if (!activeGuideModal) return;
    const dlg = activeGuideModal;
    activeGuideModal = null;
    try { if (typeof dlg.close === 'function' && dlg.open) dlg.close(); } catch {}
    try { dlg.remove(); } catch {}
  }

  function renderPaneCard(doc, card) {
    const box = el(doc, 'article', 'dfo-well-frame dfo-gm-card');
    const head = el(doc, 'div', 'dfo-gm-card-head');
    const titleEl = el(doc, 'h4', 'dfo-gm-card-title', card.title);
    const badge = el(doc, 'span', `dfo-chip chip-${card.tagTone || 'gold'} dfo-gm-card-tag`, card.tag);
    head.append(titleEl, badge);
    box.append(head);

    const body = el(doc, 'div', 'dfo-gm-card-body');
    for (const pText of card.paragraphs) {
      body.append(el(doc, 'p', 'dfo-gm-p', pText));
    }
    box.append(body);

    if (card.spoilerTitle && Array.isArray(card.spoilerLines) && card.spoilerLines.length) {
      const det = el(doc, 'details', 'dfo-gm-spoiler');
      const sum = el(doc, 'summary', 'dfo-gm-spoiler-sum');
      sum.append(el(doc, 'span', 'dfo-gm-spoiler-arrow', '▸'), el(doc, 'span', null, card.spoilerTitle));
      det.append(sum);

      const list = el(doc, 'div', 'dfo-gm-spoiler-body');
      for (const [k, v] of card.spoilerLines) {
        const row = el(doc, 'div', 'dfo-gm-formula-row');
        row.append(el(doc, 'div', 'dfo-gm-formula-k', k), el(doc, 'div', 'dfo-gm-formula-v', v));
        list.append(row);
      }
      det.append(list);
      box.append(det);
    }

    return box;
  }

  function buildPane(doc, paneData, kindCls) {
    const pane = el(doc, 'section', `dfo-subpanel-frame dfo-sm-pane ${kindCls}`);
    const hBar = el(doc, 'div', `dfo-sm-pane-head ${kindCls}`);
    const leftWrap = el(doc, 'span', 'dfo-sm-pane-title-wrap');
    leftWrap.append(el(doc, 'span', 'dfo-sm-pane-gem', '◆'), el(doc, 'span', 'dfo-sm-pane-title', paneData.title));
    const chipCls = kindCls === 'is-stats' ? 'chip-teal' : 'chip-gold';
    const cntPill = el(doc, 'span', `dfo-chip ${chipCls} dfo-sm-pane-count`, paneData.count);
    hBar.append(leftWrap, cntPill);

    const scroll = el(doc, 'div', 'dfo-sm-pane-body dfo-scroll');
    const col = el(doc, 'div', 'dfo-gm-cards');
    for (const c of paneData.cards) {
      col.append(renderPaneCard(doc, c));
    }
    scroll.append(col);
    pane.append(hBar, scroll);
    return pane;
  }

  function open({ doc = root.document, isRu = true, mountHost = null } = {}) {
    close();
    const g = getGuideData(!!isRu);

    const dlg = el(doc, 'dialog', 'dfo-panel dfo-win dfo-window-frame dfo-seal-modal dfo-sm-dialog dfo-guide-modal');
    dlg.setAttribute('aria-labelledby', 'dfo-guide-modal-title');

    // Header (.wh matching Inventory Gear Summary)
    const head = el(doc, 'div', 'wh');
    head.append(makeBookSvg(doc, 22));
    const titleSpan = el(doc, 'span', 't', g.title);
    titleSpan.id = 'dfo-guide-modal-title';
    const metaChip = el(doc, 'span', 'dfo-sm-meta-chip', g.badge);
    const closeX = el(doc, 'button', 'x', '✕');
    closeX.type = 'button';
    closeX.setAttribute('aria-label', g.closeLabel);
    head.append(titleSpan, metaChip, closeX);

    // Hero intro + 4 KPI plaques
    const hero = el(doc, 'div', 'dfo-sm-hero');
    hero.append(el(doc, 'div', 'dfo-st-intro dfo-sm-intro', g.intro));
    const kpiBar = el(doc, 'div', 'dfo-sm-kpis');
    for (const k of g.kpis) {
      const box = el(doc, 'div', `dfo-sm-kpi dfo-subpanel-frame is-${k.tone}`);
      box.append(el(doc, 'div', 'dfo-sm-kpi-k', k.label), el(doc, 'div', 'dfo-sm-kpi-v', k.value));
      kpiBar.append(box);
    }
    hero.append(kpiBar);

    // Dual-pane body with central ornate divider
    const body = el(doc, 'div', 'wb dfo-scroll');
    const grid = el(doc, 'div', 'dfo-sm-grid');
    const leftPane = buildPane(doc, g.leftPane, 'is-stats');
    const divider = el(doc, 'div', 'dfo-sm-divider');
    divider.setAttribute('aria-hidden', 'true');
    divider.append(el(doc, 'span', 'dfo-sm-divider-line'), el(doc, 'span', 'dfo-sm-divider-gem', '◆'), el(doc, 'span', 'dfo-sm-divider-line'));
    const rightPane = buildPane(doc, g.rightPane, 'is-passives');
    grid.append(leftPane, divider, rightPane);
    body.append(grid);

    // Footer (.wf)
    const foot = el(doc, 'div', 'wf');
    foot.append(el(doc, 'span', 'dfo-sm-foot-hint', g.escHint));
    const closeBtn = el(doc, 'button', 'dfo-ornate-btn dfo-close-btn dfo-gm-close-btn', g.closeLabel);
    closeBtn.type = 'button';
    foot.append(closeBtn);

    dlg.append(head, hero, body, foot);

    closeX.onclick = (e) => { e.stopPropagation(); close(); };
    closeBtn.onclick = (e) => { e.stopPropagation(); close(); };
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) close();
      e.stopPropagation();
    });
    const onDocKey = (e) => {
      if (activeGuideModal !== dlg || !dlg.isConnected) {
        try { doc.removeEventListener('keydown', onDocKey, true); } catch {}
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      }
      e.stopPropagation();
    };
    activeGuideKeyHandler = onDocKey;
    activeGuideDoc = doc;
    doc.addEventListener('keydown', onDocKey, true);
    for (const type of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'wheel', 'keyup']) {
      dlg.addEventListener(type, (e) => e.stopPropagation());
    }

    activeGuideModal = dlg;
    const hostEl = (mountHost && mountHost.isConnected) ? mountHost : doc.body;
    hostEl.append(dlg);
    try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); }
    if (typeof closeBtn.focus === 'function') closeBtn.focus();
  }

  root.__dfoSpellmakerGuide = Object.freeze({
    open,
    close,
    isOpen: () => { if (activeGuideModal && !activeGuideModal.isConnected) { close(); return false; } return Boolean(activeGuideModal); },
  });
})(typeof window !== 'undefined' ? window : globalThis);

(function (root) {
  'use strict';
  if (!root.document || root.__dfoSpellmaker) return;

  const doc = root.document;
  const STYLE_ID = 'dfo-spellmaker-style';
  const SCOPED_CSS = "\n/* ═══════════════════════════════════════════════════════════════════════════\n   WORKZONE CSS (Editable 1:1 Override Layer — Окно создания заклинаний)\n   Всё, что будет настроено здесь, переносится 1-в-1 в src/mod/page/dfo_services.js.\n   ═══════════════════════════════════════════════════════════════════════════ */\n\n/* Global FRAME1 window & nested sub-panel/well tokens (ui-references/) */\n.port-spellmaker .port-win.dfo-window-frame,\ndialog.dfo-sm-dialog.dfo-window-frame {\n  box-sizing: border-box !important;\n  border: 2px solid #7d7460 !important;\n  border-image: url(\"data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20width%3D'25'%20height%3D'25'%20shape-rendering%3D'crispEdges'%3E%3Crect%20x%3D'0'%20y%3D'0'%20width%3D'25'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'0'%20y%3D'1'%20width%3D'1'%20height%3D'24'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'1'%20y%3D'1'%20width%3D'9'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'10'%20y%3D'1'%20width%3D'1'%20height%3D'5'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'11'%20y%3D'1'%20width%3D'3'%20height%3D'1'%20fill%3D'%23c2b79a'%2F%3E%3Crect%20x%3D'14'%20y%3D'1'%20width%3D'1'%20height%3D'5'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'15'%20y%3D'1'%20width%3D'9'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'24'%20y%3D'1'%20width%3D'1'%20height%3D'24'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'1'%20y%3D'2'%20width%3D'1'%20height%3D'8'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'2'%20y%3D'2'%20width%3D'7'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'9'%20y%3D'2'%20width%3D'1'%20height%3D'4'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'11'%20y%3D'2'%20width%3D'3'%20height%3D'1'%20fill%3D'%239a9079'%2F%3E%3Crect%20x%3D'15'%20y%3D'2'%20width%3D'1'%20height%3D'4'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'16'%20y%3D'2'%20width%3D'7'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'23'%20y%3D'2'%20width%3D'1'%20height%3D'8'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'11'%20y%3D'3'%20width%3D'3'%20height%3D'1'%20fill%3D'%237a7260'%2F%3E%3Crect%20x%3D'2'%20y%3D'4'%20width%3D'2'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'4'%20y%3D'4'%20width%3D'3'%20height%3D'1'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'7'%20y%3D'4'%20width%3D'2'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'11'%20y%3D'4'%20width%3D'3'%20height%3D'1'%20fill%3D'%235a5446'%2F%3E%3Crect%20x%3D'16'%20y%3D'4'%20width%3D'2'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'18'%20y%3D'4'%20width%3D'3'%20height%3D'1'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'21'%20y%3D'4'%20width%3D'2'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'4'%20y%3D'5'%20width%3D'1'%20height%3D'2'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'5'%20y%3D'5'%20width%3D'1'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'6'%20y%3D'5'%20width%3D'1'%20height%3D'2'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'11'%20y%3D'5'%20width%3D'3'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'5'%20width%3D'1'%20height%3D'2'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'19'%20y%3D'5'%20width%3D'1'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'20'%20y%3D'5'%20width%3D'1'%20height%3D'2'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'5'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'7'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'8'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'9'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'10'%20y%3D'6'%20width%3D'5'%20height%3D'1'%20fill%3D'%2316140f'%2F%3E%3Crect%20x%3D'15'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'16'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'17'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'19'%20y%3D'6'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'4'%20y%3D'7'%20width%3D'3'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'7'%20y%3D'7'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'8'%20y%3D'7'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'9'%20y%3D'7'%20width%3D'7'%20height%3D'1'%20fill%3D'%230c0d10'%2F%3E%3Crect%20x%3D'16'%20y%3D'7'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'17'%20y%3D'7'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'18'%20y%3D'7'%20width%3D'3'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'4'%20y%3D'8'%20width%3D'2'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'6'%20y%3D'8'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'7'%20y%3D'8'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'17'%20y%3D'8'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'8'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'19'%20y%3D'8'%20width%3D'2'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'2'%20y%3D'9'%20width%3D'4'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'6'%20y%3D'9'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'7'%20y%3D'9'%20width%3D'1'%20height%3D'7'%20fill%3D'%230c0d10'%2F%3E%3Crect%20x%3D'17'%20y%3D'9'%20width%3D'1'%20height%3D'7'%20fill%3D'%231c1a15'%2F%3E%3Crect%20x%3D'18'%20y%3D'9'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'19'%20y%3D'9'%20width%3D'4'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'1'%20y%3D'10'%20width%3D'5'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'6'%20y%3D'10'%20width%3D'1'%20height%3D'5'%20fill%3D'%2316140f'%2F%3E%3Crect%20x%3D'18'%20y%3D'10'%20width%3D'1'%20height%3D'5'%20fill%3D'%235a5446'%2F%3E%3Crect%20x%3D'19'%20y%3D'10'%20width%3D'5'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'1'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%23c2b79a'%2F%3E%3Crect%20x%3D'2'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%239a9079'%2F%3E%3Crect%20x%3D'3'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%237a7260'%2F%3E%3Crect%20x%3D'4'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%235a5446'%2F%3E%3Crect%20x%3D'5'%20y%3D'11'%20width%3D'1'%20height%3D'4'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'19'%20y%3D'11'%20width%3D'1'%20height%3D'4'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'20'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%234f4838'%2F%3E%3Crect%20x%3D'21'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%23443e31'%2F%3E%3Crect%20x%3D'22'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%233a352a'%2F%3E%3Crect%20x%3D'23'%20y%3D'11'%20width%3D'1'%20height%3D'3'%20fill%3D'%2325221b'%2F%3E%3Crect%20x%3D'1'%20y%3D'14'%20width%3D'4'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'20'%20y%3D'14'%20width%3D'4'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'1'%20y%3D'15'%20width%3D'1'%20height%3D'9'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'2'%20y%3D'15'%20width%3D'4'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'6'%20y%3D'15'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'15'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'19'%20y%3D'15'%20width%3D'4'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'23'%20y%3D'15'%20width%3D'1'%20height%3D'9'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'2'%20y%3D'16'%20width%3D'4'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'6'%20y%3D'16'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'7'%20y%3D'16'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'17'%20y%3D'16'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'16'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'19'%20y%3D'16'%20width%3D'4'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'6'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'7'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'8'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'9'%20y%3D'17'%20width%3D'7'%20height%3D'1'%20fill%3D'%231c1a15'%2F%3E%3Crect%20x%3D'16'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'17'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'18'%20y%3D'17'%20width%3D'1'%20height%3D'1'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'2'%20y%3D'18'%20width%3D'2'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'4'%20y%3D'18'%20width%3D'1'%20height%3D'3'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'5'%20y%3D'18'%20width%3D'2'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'7'%20y%3D'18'%20width%3D'1'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'8'%20y%3D'18'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'9'%20y%3D'18'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'10'%20y%3D'18'%20width%3D'5'%20height%3D'1'%20fill%3D'%235a5446'%2F%3E%3Crect%20x%3D'15'%20y%3D'18'%20width%3D'1'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'16'%20y%3D'18'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'17'%20y%3D'18'%20width%3D'1'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'18'%20y%3D'18'%20width%3D'2'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'20'%20y%3D'18'%20width%3D'1'%20height%3D'3'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'21'%20y%3D'18'%20width%3D'2'%20height%3D'5'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'5'%20y%3D'19'%20width%3D'1'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'6'%20y%3D'19'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'8'%20y%3D'19'%20width%3D'1'%20height%3D'4'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'9'%20y%3D'19'%20width%3D'1'%20height%3D'4'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'10'%20y%3D'19'%20width%3D'5'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'15'%20y%3D'19'%20width%3D'1'%20height%3D'4'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'16'%20y%3D'19'%20width%3D'1'%20height%3D'4'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'18'%20y%3D'19'%20width%3D'1'%20height%3D'1'%20fill%3D'%237a5424'%2F%3E%3Crect%20x%3D'19'%20y%3D'19'%20width%3D'1'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'5'%20y%3D'20'%20width%3D'2'%20height%3D'1'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'10'%20y%3D'20'%20width%3D'1'%20height%3D'5'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'11'%20y%3D'20'%20width%3D'3'%20height%3D'1'%20fill%3D'%234f4838'%2F%3E%3Crect%20x%3D'14'%20y%3D'20'%20width%3D'1'%20height%3D'5'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'18'%20y%3D'20'%20width%3D'2'%20height%3D'1'%20fill%3D'%233d2a12'%2F%3E%3Crect%20x%3D'4'%20y%3D'21'%20width%3D'3'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'11'%20y%3D'21'%20width%3D'3'%20height%3D'1'%20fill%3D'%23443e31'%2F%3E%3Crect%20x%3D'18'%20y%3D'21'%20width%3D'3'%20height%3D'2'%20fill%3D'%23c08a3e'%2F%3E%3Crect%20x%3D'11'%20y%3D'22'%20width%3D'3'%20height%3D'1'%20fill%3D'%233a352a'%2F%3E%3Crect%20x%3D'2'%20y%3D'23'%20width%3D'8'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'11'%20y%3D'23'%20width%3D'3'%20height%3D'1'%20fill%3D'%2325221b'%2F%3E%3Crect%20x%3D'15'%20y%3D'23'%20width%3D'8'%20height%3D'1'%20fill%3D'%23f3cf86'%2F%3E%3Crect%20x%3D'1'%20y%3D'24'%20width%3D'9'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'11'%20y%3D'24'%20width%3D'3'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3Crect%20x%3D'15'%20y%3D'24'%20width%3D'9'%20height%3D'1'%20fill%3D'%23050608'%2F%3E%3C%2Fsvg%3E\") 12 / 12px / 6px stretch !important;\n  background-color: var(--dfo-bg-window, rgba(12, 14, 18, 0.93)) !important;\n  background-image: var(--dfo-bg-dither-img, repeating-conic-gradient(rgba(255, 255, 255, 0.022) 0 25%, transparent 0 50%)) !important;\n  background-size: var(--dfo-bg-dither-size, 4px 4px) !important;\n  box-shadow: 4px 4px 0 6px rgba(0, 0, 0, 0.42), 0 12px 34px rgba(0, 0, 0, 0.78) !important;\n  border-radius: 0 !important;\n  outline: none !important;\n}\n.port-spellmaker .port-win.dfo-window-frame > .px-corner,\ndialog.dfo-sm-dialog.dfo-window-frame > .px-corner { display: none !important; }\n\n.port-spellmaker .dfo-subpanel-frame,\ndialog.dfo-sm-dialog .dfo-subpanel-frame {\n  background-color: var(--dfo-bg-panel, rgba(15, 17, 22, 0.92)) !important;\n  background-image: none !important;\n  border: 2px solid !important;\n  border-color: #9a9079 #3a352a #25221b #7a7260 !important;\n  box-shadow:\n    0 0 0 1px #050608,\n    inset 0 0 0 1px rgba(5, 6, 8, 0.75),\n    inset 0 3px 0 -1px rgba(255, 255, 255, 0.04),\n    3px 3px 0 1px rgba(0, 0, 0, 0.4) !important;\n  border-radius: 0 !important;\n}\n.port-spellmaker .dfo-well-frame,\ndialog.dfo-sm-dialog .dfo-well-frame {\n  background-color: var(--dfo-bg-well, rgba(8, 10, 13, 0.9)) !important;\n  border: 2px solid !important;\n  border-color: #25221b #7a7260 #9a9079 #3a352a !important;\n  box-shadow:\n    0 0 0 1px #050608,\n    inset 2px 2px 0 rgba(0, 0, 0, 0.5) !important;\n  border-radius: 0 !important;\n}\n\n/* Fix specificity override on .port-stat.warn inside editor/service windows */\n.port-spellmaker .port-stat.warn dd {\n  color: #ff9f98 !important;\n}\n\n/* Main Spellmaker Overhauled Window (+30% Right Width / Extra Height for 4-button stack) */\n.port-spellmaker .port-win.dfo-sm-win,\n.port-spellmaker .dfo-sm-win {\n  width: min(1508px, 96vw) !important;\n  height: min(1018px, calc(100dvh - 24px)) !important;\n  max-height: calc(100dvh - 24px) !important;\n  display: flex !important;\n  flex-direction: column !important;\n  overflow: visible !important;\n}\n.port-spellmaker .dfo-sm-win > .port-inner {\n  display: flex !important;\n  flex-direction: column !important;\n  min-height: 0 !important;\n  flex: 1 1 auto !important;\n  overflow: hidden !important;\n  background: transparent !important;\n}\n.port-spellmaker .dfo-sm-head {\n  flex: 0 0 auto !important;\n  padding: 7px 16px 6px !important;\n  background-color: transparent !important;\n  background-image: var(--dfo-bg-header, linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.015))) !important;\n  border-bottom: 1px solid #050608 !important;\n  box-shadow: 0 1px 0 rgba(163, 152, 128, 0.26), inset 0 1px 0 rgba(255,255,255,0.05) !important;\n  text-align: center !important;\n}\n.port-spellmaker .dfo-sm-head .port-title {\n  font-family: 'DFO Greengoth', var(--display, Georgia, serif) !important;\n  font-size: 20px !important;\n  letter-spacing: 0.08em !important;\n  text-indent: 0.08em !important;\n  color: #f6e7b0 !important;\n  text-shadow: 0 2px 0 #000, 0 0 8px rgba(0,0,0,0.85) !important;\n}\n.dfo-sm-head-orn {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: 10px;\n  margin-top: 2px;\n}\n.dfo-sm-head-line {\n  flex: 0 0 72px;\n  height: 1px;\n  background: linear-gradient(90deg, transparent, rgba(213, 178, 110, 0.55), transparent);\n}\n.port-spellmaker .dfo-sm-head .port-sub {\n  margin-top: 0 !important;\n  font-size: 12px !important;\n  letter-spacing: 0.05em !important;\n  color: #b7a071 !important;\n}\n.port-spellmaker .dfo-sm-body {\n  display: flex !important;\n  flex-direction: column !important;\n  flex: 1 1 auto !important;\n  min-height: 0 !important;\n  overflow: hidden !important;\n  padding: 9px 11px !important;\n  gap: 0 !important;\n}\n.dfo-sm-layout {\n  flex: 1 1 auto;\n  height: 100%;\n  display: grid;\n  grid-template-columns: 376px minmax(0, 1fr);\n  gap: 10px;\n  align-items: stretch;\n  min-height: 0;\n}\n.dfo-sm-col {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  min-width: 0;\n  min-height: 0;\n}\n.dfo-sm-panel {\n  padding: 7px 9px;\n  display: flex;\n  flex-direction: column;\n  gap: 7px;\n  min-width: 0;\n}\n.dfo-sm-panel-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  margin: -7px -9px 0 -9px;\n  padding: 4px 10px;\n  background-image: var(--dfo-bg-header, linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.015)));\n  border-bottom: 1px solid #050608;\n  box-shadow: 0 1px 0 rgba(163, 152, 128, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.04);\n}\n.dfo-sm-panel-title {\n  font-family: 'DFO Greengoth', var(--display, Georgia, serif) !important;\n  font-size: 12.5px !important;\n  letter-spacing: 0.07em !important;\n  text-transform: uppercase !important;\n  color: #e7d6a9 !important;\n  text-shadow: 0 1px 0 #000 !important;\n}\n.dfo-sm-panel-title::before {\n  content: '◆ ';\n  font-size: 9px;\n  color: #c08a3e;\n  margin-right: 4px;\n  vertical-align: 1px;\n  text-shadow: none;\n}\n\n/* Accent-Top Gradient Panels (ui-references/accent-panels.css canon; same recipe as\n   .dfo-fxed-panel in the effect editor and .dfo-sm-pane in the mechanics guide):\n   accent top edge + accent-tinted head + body tint that dissolves downward. */\n.dfo-sm-panel.dfo-subpanel-frame {\n  --dfo-panel-c: #d5b26e;\n  --dfo-panel-rgb: 213, 178, 110;\n  border-top-color: var(--dfo-panel-c) !important;\n  background-image: linear-gradient(\n    180deg,\n    rgba(var(--dfo-panel-rgb), 0.13) 0,\n    rgba(var(--dfo-panel-rgb), 0.045) clamp(36px, 20%, 120px),\n    rgba(var(--dfo-panel-rgb), 0) clamp(64px, 38%, 230px)\n  ) !important;\n}\n.dfo-sm-panel.dfo-subpanel-frame .dfo-sm-panel-head {\n  background-image:\n    linear-gradient(180deg, rgba(var(--dfo-panel-rgb), 0.18), rgba(var(--dfo-panel-rgb), 0.04)),\n    var(--dfo-bg-header, linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.015)));\n  border-bottom: 1px solid rgba(var(--dfo-panel-rgb), 0.36);\n  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.05);\n}\n.dfo-sm-panel.dfo-subpanel-frame .dfo-sm-panel-title::before { color: var(--dfo-panel-c); }\n\n/* Static accents per panel role */\n.dfo-sm-panel.dfo-sm-status-panel  { --dfo-panel-c: #d5b26e; --dfo-panel-rgb: 213, 178, 110; }\n.dfo-sm-panel.dfo-sm-viz-panel     { --dfo-panel-c: #60a5fa; --dfo-panel-rgb: 96, 165, 250; }\n.dfo-sm-panel.dfo-sm-target-panel  { --dfo-panel-c: #5eb99d; --dfo-panel-rgb: 94, 185, 157; }\n.dfo-sm-panel.dfo-sm-name-panel    { --dfo-panel-c: #f5d451; --dfo-panel-rgb: 245, 212, 81; }\n.dfo-sm-panel.dfo-sm-effects-panel { --dfo-panel-c: #b57bee; --dfo-panel-rgb: 181, 123, 238; }\n.dfo-sm-panel.dfo-sm-icons-panel   { --dfo-panel-c: #e0884a; --dfo-panel-rgb: 224, 136, 74; }\n\n/* State-driven accents: Element panel follows the chosen element, Cost panel follows the Create CTA state */\n.dfo-sm-panel.dfo-sm-element-panel { --dfo-panel-c: #e879f9; --dfo-panel-rgb: 232, 121, 249; }\n.dfo-sm-panel.dfo-sm-element-panel:has(.dfo-sm-elem-btn.on.is-fire)   { --dfo-panel-c: #fb923c; --dfo-panel-rgb: 251, 146, 60; }\n.dfo-sm-panel.dfo-sm-element-panel:has(.dfo-sm-elem-btn.on.is-cold)   { --dfo-panel-c: #38bdf8; --dfo-panel-rgb: 56, 189, 248; }\n.dfo-sm-panel.dfo-sm-element-panel:has(.dfo-sm-elem-btn.on.is-poison) { --dfo-panel-c: #4ade80; --dfo-panel-rgb: 74, 222, 128; }\n.dfo-sm-panel.dfo-sm-element-panel:has(.dfo-sm-elem-btn.on.is-shock)  { --dfo-panel-c: #a78bfa; --dfo-panel-rgb: 167, 139, 250; }\n.dfo-sm-panel.dfo-sm-cost-panel { --dfo-panel-c: #d5b26e; --dfo-panel-rgb: 213, 178, 110; }\n.dfo-sm-panel.dfo-sm-cost-panel:has(.dfo-sm-create-btn.is-ready)     { --dfo-panel-c: #52c298; --dfo-panel-rgb: 82, 194, 152; }\n.dfo-sm-panel.dfo-sm-cost-panel:has(.dfo-sm-create-btn.is-warn-mana) { --dfo-panel-c: #f59e0b; --dfo-panel-rgb: 245, 158, 11; }\n.dfo-sm-panel.dfo-sm-cost-panel:has(.dfo-sm-create-btn.is-blocked)   { --dfo-panel-c: #e2574c; --dfo-panel-rgb: 226, 87, 76; }\n\n/* Status & Final Cost Resource Chips (match dfo_pack .dfo-curr-chip canon, icon at end) */\n.dfo-sm-res-pair {\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 7px;\n}\n.dfo-sm-res-chip {\n  box-sizing: border-box;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 7px;\n  min-width: 0;\n  min-height: 33px;\n  padding: 4px 9px;\n  cursor: help;\n  outline: 0;\n  background: var(--dfo-bg-chip, rgba(10, 12, 16, 0.9));\n  border: 1px solid rgba(117, 99, 70, 0.56);\n  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.72), inset 0 1px 0 rgba(255, 255, 255, 0.04);\n  transition: border-color 110ms ease, filter 110ms ease;\n}\n.dfo-sm-res-chip:hover,\n.dfo-sm-res-chip:focus-visible {\n  filter: brightness(1.16);\n  border-color: rgba(213, 178, 110, 0.85);\n}\n.dfo-sm-res-chip.is-gold { border-left: 3px solid #f5d451; }\n.dfo-sm-res-chip.is-gold .dfo-sm-res-val { color: #f5d451; }\n.dfo-sm-res-chip.is-mana { border-left: 3px solid #38bdf8; }\n.dfo-sm-res-chip.is-mana .dfo-sm-res-val { color: #bae6fd; }\n.dfo-sm-res-chip.is-mana.is-low { border-left-color: #f59e0b; }\n.dfo-sm-res-chip.is-mana.is-low .dfo-sm-res-val { color: #fcd34d; }\n.dfo-sm-res-chip.is-warn {\n  border-left-color: #f59e0b !important;\n  border-color: rgba(245, 158, 11, 0.65) !important;\n}\n.dfo-sm-res-chip.is-warn .dfo-sm-res-val { color: #fcd34d !important; }\n.dfo-sm-res-chip.is-bad {\n  border-left-color: #e0584a !important;\n  border-color: rgba(224, 88, 74, 0.7) !important;\n}\n.dfo-sm-res-chip.is-bad .dfo-sm-res-val { color: #ff9f98 !important; }\n.dfo-sm-res-val {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-family: 'DFO Flexi', var(--data, monospace) !important;\n  font-variant-numeric: tabular-nums;\n  font-size: 15px !important;\n  line-height: 1.2 !important;\n  letter-spacing: 0.02em !important;\n  text-shadow: 0 1px 0 #000 !important;\n}\n.dfo-sm-res-ico {\n  width: 16px;\n  height: 16px;\n  flex: 0 0 16px;\n  filter: drop-shadow(0 1px 1px #000);\n}\n\n/* Full-Width Spell Visualization Window (fills left column cleanly) */\n.dfo-sm-viz-panel {\n  flex: 1 1 auto;\n  min-height: 195px;\n}\n.dfo-sm-viz-tag {\n  padding: 1px 7px;\n  font-size: 10.5px;\n  letter-spacing: 0.04em;\n  text-transform: uppercase;\n  border: 1px solid rgba(192, 138, 62, 0.5);\n  background: rgba(8, 10, 14, 0.78);\n}\n.dfo-sm-viz-well {\n  width: 100%;\n  flex: 1 1 auto;\n  min-height: 168px;\n  margin: 0;\n  overflow: hidden;\n  display: flex;\n  align-items: stretch;\n  justify-content: center;\n}\n.dfo-sm-viz-canvas {\n  width: 100%;\n  height: 100%;\n  display: block;\n  background: #050608;\n  cursor: pointer;\n}\n.dfo-sm-viz-canvas.pixelated {\n  image-rendering: pixelated;\n  image-rendering: crisp-edges;\n}\n\n/* Target Format & Element Selectors (Ornate RPG Polish) */\n.dfo-sm-target-grid {\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 5px;\n}\n.dfo-sm-tgt-btn {\n  --dfo-c: rgba(213, 178, 110, 0.35);\n  position: relative !important;\n  min-width: 0 !important;\n  min-height: 29px !important;\n  height: auto !important;\n  padding: 4px 8px !important;\n  justify-content: flex-start !important;\n  gap: 6px !important;\n  font-size: 11.5px !important;\n  letter-spacing: 0.02em !important;\n  text-indent: 0 !important;\n  text-transform: none !important;\n  text-align: left !important;\n  line-height: 1.2 !important;\n  border: 1px solid #63533a !important;\n  border-top-color: #8f7954 !important;\n  border-bottom-color: #2b2318 !important;\n  background: linear-gradient(180deg, rgba(31, 34, 42, 0.94), rgba(16, 18, 24, 0.98)) !important;\n  box-shadow: inset 0 1px 0 rgba(255, 224, 150, 0.08), inset 0 -1px 0 rgba(0, 0, 0, 0.72) !important;\n  color: #d8cfae !important;\n}\n.dfo-sm-tgt-btn.is-wide { grid-column: 1 / -1; }\n.dfo-sm-tgt-btn.on {\n  --dfo-c: #fde68a;\n  border-color: #d5b26e !important;\n  border-top-color: #f3cf86 !important;\n  background: linear-gradient(180deg, rgba(75, 57, 26, 0.95), rgba(31, 23, 9, 0.98)) !important;\n  color: #fde68a !important;\n  box-shadow: inset 0 0 0 1px rgba(253, 230, 138, 0.25), 0 0 6px rgba(213, 178, 110, 0.22) !important;\n}\n.dfo-sm-tgt-btn:disabled {\n  opacity: 0.35 !important;\n  color: #847c6a !important;\n}\n.dfo-sm-tgt-ico {\n  width: 14px;\n  height: 14px;\n  flex: 0 0 14px;\n}\n\n.dfo-sm-elem-grid {\n  display: grid;\n  grid-template-columns: repeat(5, minmax(0, 1fr));\n  gap: 5px;\n}\n.dfo-sm-elem-btn {\n  min-width: 0 !important;\n  min-height: 30px !important;\n  padding: 4px 4px !important;\n  justify-content: center !important;\n  gap: 4px !important;\n  font-size: 11px !important;\n  letter-spacing: 0.01em !important;\n  text-indent: 0 !important;\n  text-transform: none !important;\n  border: 1px solid #63533a !important;\n  border-top-color: #8f7954 !important;\n  border-bottom-color: #2b2318 !important;\n  background: linear-gradient(180deg, rgba(31, 34, 42, 0.94), rgba(16, 18, 24, 0.98)) !important;\n  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06) !important;\n  color: #d8cfae !important;\n}\n.dfo-sm-elem-dot {\n  width: 7px;\n  height: 7px;\n  border-radius: 50%;\n  background: var(--sm-el-c, #e879f9);\n  box-shadow: 0 0 5px var(--sm-el-c, #e879f9);\n  flex: 0 0 7px;\n}\n.dfo-sm-elem-btn.on {\n  border-color: var(--sm-el-c, #f3ef2c) !important;\n  background: linear-gradient(180deg, rgba(38, 42, 54, 0.98), rgba(14, 16, 22, 0.98)) !important;\n  color: #ffffff !important;\n  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--sm-el-c, #f3ef2c) 45%, transparent), 0 0 7px color-mix(in srgb, var(--sm-el-c, #f3ef2c) 25%, transparent) !important;\n}\n.dfo-sm-elem-btn:disabled {\n  opacity: 0.30 !important;\n  filter: grayscale(0.75);\n}\n\n/* Signature Ornate Buttons & Vertical Action Stack (ui-references/buttons-and-controls.js) */\n.dfo-sm-cta-stack {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n}\n.port-spellmaker .dfo-sm-win .dfo-ornate-btn,\n.port-spellmaker .dfo-sm-action-btn {\n  --dfo-c: #d4b16a;\n  position: relative !important;\n  width: 100% !important;\n  min-height: 36px !important;\n  height: 36px !important;\n  padding: 5px 14px !important;\n  box-sizing: border-box !important;\n  display: flex !important;\n  align-items: center !important;\n  justify-content: center !important;\n  gap: 8px !important;\n  border: 1px solid #6e5c3e !important;\n  border-top-color: #9e8355 !important;\n  border-bottom-color: #3b301f !important;\n  border-radius: 1px !important;\n  background: linear-gradient(180deg, #2b2419 0%, #191510 55%, #120f0b 100%) !important;\n  box-shadow:\n    inset 0 1px 0 rgba(255, 224, 150, 0.14),\n    inset 0 -1px 0 rgba(0, 0, 0, 0.72),\n    0 1px 2px rgba(0, 0, 0, 0.55) !important;\n  color: #f1e6c8 !important;\n  font-family: 'DFO Greengoth', var(--display, Georgia, serif) !important;\n  font-size: 13.5px !important;\n  letter-spacing: 0.07em !important;\n  text-indent: 0.07em !important;\n  text-transform: uppercase !important;\n  line-height: 1.15 !important;\n  text-shadow: 0 1px 0 #000 !important;\n  cursor: pointer !important;\n  user-select: none !important;\n  transition: filter 120ms ease, transform 80ms ease, border-color 120ms ease !important;\n}\n.dfo-sm-action-btn::before {\n  content: '';\n  position: absolute;\n  inset: 2px;\n  border: 1px solid rgba(255, 255, 255, 0.18);\n  pointer-events: none;\n}\n.dfo-sm-action-btn::after {\n  content: '';\n  position: absolute;\n  inset: 2px;\n  pointer-events: none;\n  background:\n    linear-gradient(var(--dfo-c), var(--dfo-c)) top left / 6px 1px no-repeat,\n    linear-gradient(var(--dfo-c), var(--dfo-c)) top left / 1px 6px no-repeat,\n    linear-gradient(var(--dfo-c), var(--dfo-c)) top right / 6px 1px no-repeat,\n    linear-gradient(var(--dfo-c), var(--dfo-c)) top right / 1px 6px no-repeat,\n    linear-gradient(var(--dfo-c), var(--dfo-c)) bottom left / 6px 1px no-repeat,\n    linear-gradient(var(--dfo-c), var(--dfo-c)) bottom left / 1px 6px no-repeat,\n    linear-gradient(var(--dfo-c), var(--dfo-c)) bottom right / 6px 1px no-repeat,\n    linear-gradient(var(--dfo-c), var(--dfo-c)) bottom right / 1px 6px no-repeat;\n}\n.dfo-sm-action-btn:hover { filter: brightness(1.14); }\n.dfo-sm-action-btn:active { transform: translateY(1px); }\n\n.dfo-sm-util-btn {\n  --dfo-c: #d4b16a;\n  color: #f6e7b0 !important;\n}\n.dfo-sm-util-btn::before {\n  border-color: rgba(213, 178, 110, 0.24);\n}\n/* Distinctive Royal Sapphire Arcane Pattern Button for \"Mechanics Guide\" */\n.port-spellmaker .dfo-sm-action-btn.dfo-sm-guide-btn {\n  --dfo-c: #93c5fd;\n  border-color: #3f63a8 !important;\n  border-top-color: #7fb2f0 !important;\n  border-bottom-color: #162442 !important;\n  background:\n    repeating-linear-gradient(\n      135deg,\n      rgba(147, 197, 253, 0.12) 0px,\n      rgba(147, 197, 253, 0.12) 4px,\n      transparent 4px,\n      transparent 10px\n    ),\n    radial-gradient(ellipse 65% 120% at 50% 0%, rgba(125, 168, 234, 0.24), transparent 72%),\n    linear-gradient(180deg, #243c69 0%, #162646 56%, #0d172c 100%) !important;\n  color: #e0f2fe !important;\n  box-shadow:\n    inset 0 1px 0 rgba(191, 219, 254, 0.24),\n    inset 0 -1px 0 rgba(0, 0, 0, 0.8),\n    0 1px 4px rgba(15, 23, 42, 0.72) !important;\n}\n.port-spellmaker .dfo-sm-action-btn.dfo-sm-guide-btn::before {\n  border-color: rgba(147, 197, 253, 0.36);\n}\n.port-spellmaker .dfo-sm-action-btn.dfo-sm-guide-btn:hover {\n  filter: brightness(1.16);\n  border-color: #60a5fa !important;\n  border-top-color: #bfdbfe !important;\n  box-shadow:\n    inset 0 1px 0 rgba(219, 234, 254, 0.3),\n    0 0 10px rgba(59, 130, 246, 0.35) !important;\n}\n.port-spellmaker .dfo-sm-action-btn.dfo-close-btn,\n.port-spellmaker .dfo-sm-util-btn.silver,\ndialog.dfo-seal-modal .dfo-ornate-btn.dfo-close-btn,\n.dfo-ornate-btn.dfo-close-btn {\n  --dfo-c: #f08a80;\n  border-color: #a1463e #4c1b18 #2d0e0c #782e28 !important;\n  background:\n    repeating-linear-gradient(-45deg, rgba(176, 56, 48, 0.22) 0 4px, rgba(16, 7, 9, 0.34) 4px 8px),\n    linear-gradient(180deg, #3d1618 0%, #250c0e 58%, #160709 100%) !important;\n  box-shadow: 0 0 0 1px #050608, inset 0 0 0 1px rgba(240, 138, 128, 0.18), inset 0 1px 0 rgba(255, 204, 198, 0.16) !important;\n  color: #fce0dc !important;\n}\n.port-spellmaker .dfo-sm-action-btn.dfo-close-btn::before,\n.port-spellmaker .dfo-sm-util-btn.silver::before,\ndialog.dfo-seal-modal .dfo-ornate-btn.dfo-close-btn::before,\n.dfo-ornate-btn.dfo-close-btn::before {\n  border-color: rgba(240, 138, 128, 0.28) !important;\n}\n.port-spellmaker .dfo-sm-action-btn.dfo-close-btn:hover:not(:disabled),\n.port-spellmaker .dfo-sm-util-btn.silver:hover:not(:disabled),\ndialog.dfo-seal-modal .dfo-ornate-btn.dfo-close-btn:hover:not(:disabled),\n.dfo-ornate-btn.dfo-close-btn:hover:not(:disabled) {\n  --dfo-c: #ffb0a7;\n  border-color: #c85a46 !important;\n  background:\n    repeating-linear-gradient(-45deg, rgba(212, 78, 66, 0.28) 0 4px, rgba(22, 9, 11, 0.28) 4px 8px),\n    linear-gradient(180deg, #521d20 0%, #341114 58%, #200a0c 100%) !important;\n  box-shadow: 0 0 0 1px #050608, 0 0 10px rgba(200, 90, 70, 0.3), inset 0 0 0 1px rgba(255, 176, 167, 0.28) !important;\n  color: #fff0ee !important;\n}\n\n.dfo-sm-create-btn.is-ready {\n  --dfo-c: #7fe3b5;\n  border-color: #2e8b6b !important;\n  border-top-color: #52c298 !important;\n  border-bottom-color: #163d31 !important;\n  background: linear-gradient(180deg, #225c4a 0%, #163d31 100%) !important;\n  color: #a7f3d0 !important;\n}\n.dfo-sm-create-btn.is-warn-mana {\n  --dfo-c: #fcd34d;\n  border-color: #d97706 !important;\n  border-top-color: #fbbf24 !important;\n  border-bottom-color: #341d07 !important;\n  background: linear-gradient(180deg, #5c3610 0%, #341d07 100%) !important;\n  color: #fde68a !important;\n}\n.dfo-sm-create-btn.is-blocked {\n  --dfo-c: #f87171;\n  border-color: #993830 !important;\n  border-top-color: #c85a46 !important;\n  border-bottom-color: #26100e !important;\n  background: linear-gradient(180deg, #451c19 0%, #26100e 100%) !important;\n  color: #fca5a5 !important;\n}\n.dfo-sm-cta-ico { width: 15px; height: 15px; flex: 0 0 15px; }\n\n/* Right Column: Direct Spell Name Input */\n.dfo-sm-name-count,\n.dfo-sm-fx-counter,\n.dfo-sm-icon-count {\n  font-family: 'DFO Flexi', var(--data, monospace) !important;\n  font-size: 12px;\n  color: #b7a071;\n}\n.dfo-sm-name-wrap {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  padding: 2px 6px 2px 10px;\n  min-height: 33px;\n}\n.dfo-sm-name-input {\n  flex: 1 1 auto;\n  min-width: 0;\n  border: 0;\n  background: transparent;\n  color: #f6e7b0;\n  font-family: 'DFO Greengoth', var(--display, Georgia, serif) !important;\n  font-size: 16px;\n  letter-spacing: 0.04em;\n  outline: none;\n}\n.dfo-sm-name-input::placeholder {\n  color: #7c7461;\n  font-family: 'DFO Gabin', var(--data, serif) !important;\n  font-size: 13.5px;\n}\n.port-spellmaker .dfo-sm-name-clear,\n.port-spellmaker .dfo-sm-name-reroll {\n  flex: 0 0 26px !important;\n  width: 26px !important;\n  min-width: 26px !important;\n  height: 26px !important;\n  min-height: 26px !important;\n  padding: 0 !important;\n  margin: 0 !important;\n  display: inline-flex !important;\n  align-items: center !important;\n  justify-content: center !important;\n  border: 1px solid #63533a !important;\n  border-top-color: #8f7954 !important;\n  border-bottom-color: #2b2318 !important;\n  border-radius: 1px !important;\n  background: linear-gradient(180deg, #272219 0%, #15120d 100%) !important;\n  color: #cbbd9d !important;\n  line-height: 1 !important;\n  text-indent: 0 !important;\n  cursor: pointer !important;\n  box-shadow: inset 0 1px 0 rgba(255, 224, 150, 0.08) !important;\n}\n.port-spellmaker .dfo-sm-name-reroll {\n  color: #e5c678 !important;\n}\n.dfo-sm-clear-ico {\n  width: 14px;\n  height: 14px;\n  display: block;\n  flex: 0 0 14px;\n}\n.port-spellmaker .dfo-sm-name-clear:hover,\n.port-spellmaker .dfo-sm-name-reroll:hover {\n  color: #fff !important;\n  border-color: #d5b26e !important;\n  filter: brightness(1.15);\n}\n.port-spellmaker .dfo-sm-name-reroll:hover {\n  color: #fde68a !important;\n}\n\n/* Right Column: Three Structured Effect Rows */\n.dfo-sm-fx-list {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n.dfo-sm-fx-row {\n  position: relative;\n  display: flex;\n  align-items: center;\n  gap: 9px;\n  min-height: 41px;\n  padding: 4px 8px;\n  background: var(--dfo-bg-row, rgba(16, 19, 24, 0.88));\n  border: 1px solid rgba(117, 99, 70, 0.38);\n  border-left: 3px solid var(--sm-sch-c, #756346);\n  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.65);\n  text-align: left;\n  cursor: pointer;\n  transition: background-color 110ms ease, border-color 110ms ease;\n}\n.dfo-sm-fx-row:hover {\n  background: var(--dfo-bg-row-hover, rgba(38, 42, 51, 0.92));\n  border-color: rgba(213, 178, 110, 0.68);\n}\n.dfo-sm-fx-row.is-empty {\n  border-left-color: rgba(117, 99, 70, 0.45);\n  border-style: dashed;\n  background: rgba(10, 12, 17, 0.62);\n}\n.dfo-sm-fx-idx {\n  width: 20px;\n  height: 20px;\n  flex: 0 0 20px;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  font-family: 'DFO Flexi', var(--data, monospace) !important;\n  font-size: 12px;\n  color: #f6e7b0;\n  background: rgba(8, 10, 14, 0.85);\n  border: 1px solid rgba(163, 152, 128, 0.4);\n}\n.dfo-sm-fx-info {\n  flex: 1 1 auto;\n  min-width: 0;\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n}\n.dfo-sm-fx-top {\n  display: flex;\n  align-items: center;\n  gap: 7px;\n  min-width: 0;\n}\n.dfo-sm-fx-name {\n  font-family: 'DFO Greengoth', var(--display, Georgia, serif) !important;\n  font-size: 13.5px;\n  color: #f6e7b0;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n.dfo-sm-fx-school {\n  font-size: 10.5px;\n  color: var(--sm-sch-c, #b7a071);\n  border: 1px solid color-mix(in srgb, var(--sm-sch-c, #756346) 45%, transparent);\n  background: rgba(8, 10, 14, 0.65);\n  padding: 0 5px;\n  white-space: nowrap;\n}\n.dfo-sm-fx-params {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px 8px;\n}\n.dfo-sm-fx-param {\n  font-size: 11px;\n  color: #b8af98;\n}\n.dfo-sm-fx-sp {\n  flex: 0 0 auto;\n  font-family: 'DFO Flexi', var(--data, monospace) !important;\n  font-size: 12.5px;\n  color: #7dd3fc;\n  padding: 2px 7px;\n  background: rgba(8, 18, 30, 0.72);\n  border: 1px solid rgba(56, 189, 248, 0.32);\n  white-space: nowrap;\n}\n.dfo-sm-fx-acts {\n  display: flex;\n  align-items: center;\n  gap: 4px;\n  flex: 0 0 auto;\n}\n.dfo-sm-fx-btn,\n.dfo-sm-fx-del {\n  min-width: 0 !important;\n  min-height: 26px !important;\n  height: 26px !important;\n  padding: 2px 9px !important;\n  font-size: 11.5px !important;\n  letter-spacing: 0.02em !important;\n  text-indent: 0 !important;\n  text-transform: none !important;\n  border: 1px solid rgba(117, 99, 70, 0.62) !important;\n  background: linear-gradient(180deg, #272219 0%, #15120d 100%) !important;\n}\n.dfo-sm-fx-del {\n  padding: 2px 8px !important;\n  color: #ff9f98 !important;\n}\n.dfo-sm-fx-empty-lbl {\n  flex: 1 1 auto;\n  font-size: 12.5px;\n  color: #8f8670;\n}\n.dfo-sm-fx-add-tag {\n  font-size: 11.5px;\n  color: #f5d451;\n  padding: 2px 8px;\n  border: 1px solid rgba(213, 178, 110, 0.45);\n  background: rgba(48, 38, 18, 0.45);\n}\n\n/* Right Column: Inline Spell Icon Showcase + School-Aggregated Selector */\n.dfo-sm-icons-panel {\n  flex: 1 1 auto;\n  min-height: 0;\n  display: flex;\n  flex-direction: column;\n  gap: 5px;\n}\n.dfo-sm-icon-showcase {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 4px 8px;\n  background: linear-gradient(90deg, rgba(16, 20, 28, 0.92), rgba(12, 14, 18, 0.72));\n  border: 1px solid rgba(117, 99, 70, 0.46);\n  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.65);\n}\n.dfo-sm-icon-preview {\n  position: relative;\n  width: 46px;\n  height: 46px;\n  flex: 0 0 46px;\n  padding: 0;\n  overflow: hidden;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  background: radial-gradient(circle, var(--sm-elem-glow, rgba(127, 227, 181, 0.28)) 0%, rgba(8,10,13,0.96) 80%) !important;\n  border-color: #52c298 !important;\n  box-shadow: 0 0 0 1px #050608, inset 0 0 10px rgba(127, 227, 181, 0.32) !important;\n}\n.dfo-sm-icon-preview img {\n  width: 100%;\n  height: 100%;\n  object-fit: fill;\n  image-rendering: pixelated;\n  display: block;\n}\n.dfo-sm-icon-meta {\n  flex: 1 1 auto;\n  min-width: 0;\n  display: flex;\n  flex-direction: column;\n  gap: 3px;\n}\n.dfo-sm-icon-cur-top {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  flex-wrap: wrap;\n}\n.dfo-sm-icon-cur-lbl {\n  font-family: 'DFO Greengoth', var(--display, Georgia, serif) !important;\n  font-size: 14px;\n  color: #f6e7b0;\n}\n.dfo-sm-icon-cur-school {\n  font-size: 10.5px;\n  letter-spacing: 0.04em;\n  text-transform: uppercase;\n  padding: 1px 6px;\n  color: var(--sm-sch-c, #d5b26e);\n  border: 1px solid color-mix(in srgb, var(--sm-sch-c, #d5b26e) 50%, transparent);\n  background: rgba(8, 10, 14, 0.72);\n}\n.dfo-sm-icon-cur-hint {\n  font-size: 11.5px;\n  color: #a89f88;\n  line-height: 1.25;\n}\n\n/* School Filter Tabs inside Spell Icon Panel (ui-references/.dfo-tabs) */\n.dfo-sm-school-tabs {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px;\n  padding: 2px 0;\n  border-bottom: 1px solid rgba(192, 138, 62, 0.24);\n}\n.dfo-sm-school-tab {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  padding: 2px 8px;\n  cursor: pointer;\n  color: #a89f88;\n  background: var(--dfo-bg-button, #1c1f26);\n  border: 1px solid rgba(117, 99, 70, 0.25);\n  border-radius: 2px;\n  font-family: 'DFO Gabin', var(--data, serif);\n  font-size: 11.5px;\n  transition: background-color 100ms ease, color 100ms ease, border-color 100ms ease;\n}\n.dfo-sm-school-tab:hover {\n  color: #f1e6c8;\n  border-color: rgba(192, 138, 62, 0.45);\n}\n.dfo-sm-school-tab.on {\n  color: #f6e7b0;\n  background: var(--dfo-bg-button-hover, #262a33);\n  border-color: rgba(192, 138, 62, 0.55);\n  box-shadow: inset 0 -2px 0 #c08a3e;\n}\n.dfo-sm-school-tab-cnt {\n  font-family: 'DFO Flexi', var(--data, monospace);\n  font-size: 11px;\n  color: #8b8270;\n}\n.dfo-sm-school-tab.on .dfo-sm-school-tab-cnt {\n  color: #d5b26e;\n}\n.dfo-sm-school-dot {\n  width: 6px;\n  height: 6px;\n  border-radius: 50%;\n  background: var(--sm-sch-c, #d5b26e);\n  box-shadow: 0 0 4px var(--sm-sch-c, #d5b26e);\n  flex: 0 0 6px;\n}\n\n.dfo-sm-icongrid-wrap {\n  flex: 1 1 auto;\n  min-height: 220px;\n  padding: 5px 7px;\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  overflow-y: auto;\n  overscroll-behavior: contain;\n  scrollbar-width: thin;\n  scrollbar-color: #756346 #0c0e11;\n}\n.dfo-sm-icongrid-wrap::-webkit-scrollbar { width: 7px; height: 7px; }\n.dfo-sm-icongrid-wrap::-webkit-scrollbar-track { background: #0c0e11; border-left: 1px solid rgba(117, 99, 70, 0.2); }\n.dfo-sm-icongrid-wrap::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #5e4f37, #3e3424); border: 1px solid #14171c; border-radius: 2px; }\n.dfo-sm-icongrid-wrap::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, #7d6949, #544630); }\n.dfo-sm-school-sec {\n  display: flex;\n  flex-direction: column;\n  gap: 3px;\n  padding: 3px 6px 4px;\n  background: rgba(12, 15, 21, 0.64);\n  border: 1px solid rgba(117, 99, 70, 0.26);\n  border-left: 2px solid var(--sm-sch-c, #756346);\n  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.45);\n}\n.dfo-sm-school-sec-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  padding-bottom: 1px;\n  border-bottom: 1px solid rgba(117, 99, 70, 0.2);\n}\n.dfo-sm-school-sec-name {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  font-family: 'DFO Gabin', var(--data, serif);\n  font-size: 11px;\n  letter-spacing: 0.08em;\n  text-transform: uppercase;\n  color: color-mix(in srgb, var(--sm-sch-c, #d5b26e) 65%, #f1e6c8);\n}\n.dfo-sm-school-sec-meta {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n}\n.dfo-sm-school-custom-badge {\n  font-size: 9.5px;\n  letter-spacing: 0.04em;\n  text-transform: uppercase;\n  padding: 0 5px;\n  color: #7fe3b5;\n  border: 1px solid rgba(46, 139, 107, 0.6);\n  background: rgba(22, 61, 49, 0.55);\n}\n.dfo-sm-school-sec-cnt {\n  font-family: 'DFO Flexi', var(--data, monospace);\n  font-size: 11px;\n  color: #8c826e;\n}\n\n.dfo-sm-icongrid {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(38px, 39px));\n  gap: 4px;\n  align-content: start;\n}\n.dfo-sm-iconcell {\n  --dfo-cell-c: rgba(213, 178, 110, 0.42);\n  position: relative;\n  aspect-ratio: 1 / 1;\n  width: 100%;\n  padding: 0;\n  overflow: hidden;\n  background: linear-gradient(180deg, rgba(24, 28, 36, 0.94), rgba(10, 12, 16, 0.98));\n  border: 1px solid #63533a;\n  border-top-color: #8f7954;\n  border-bottom-color: #2b2318;\n  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.85), 0 1px 3px rgba(0, 0, 0, 0.55);\n  cursor: pointer;\n  transition: transform 80ms ease, border-color 100ms ease, box-shadow 120ms ease, filter 100ms ease;\n}\n.dfo-sm-iconcell::before {\n  content: '';\n  position: absolute;\n  inset: 1px;\n  border: 1px solid rgba(255, 255, 255, 0.08);\n  pointer-events: none;\n  z-index: 2;\n}\n.dfo-sm-iconcell::after {\n  content: '';\n  position: absolute;\n  inset: 1px;\n  pointer-events: none;\n  z-index: 3;\n  background:\n    linear-gradient(var(--dfo-cell-c), var(--dfo-cell-c)) top left / 5px 1px no-repeat,\n    linear-gradient(var(--dfo-cell-c), var(--dfo-cell-c)) top left / 1px 5px no-repeat,\n    linear-gradient(var(--dfo-cell-c), var(--dfo-cell-c)) top right / 5px 1px no-repeat,\n    linear-gradient(var(--dfo-cell-c), var(--dfo-cell-c)) top right / 1px 5px no-repeat,\n    linear-gradient(var(--dfo-cell-c), var(--dfo-cell-c)) bottom left / 5px 1px no-repeat,\n    linear-gradient(var(--dfo-cell-c), var(--dfo-cell-c)) bottom left / 1px 5px no-repeat,\n    linear-gradient(var(--dfo-cell-c), var(--dfo-cell-c)) bottom right / 5px 1px no-repeat,\n    linear-gradient(var(--dfo-cell-c), var(--dfo-cell-c)) bottom right / 1px 5px no-repeat;\n}\n.dfo-sm-iconcell:hover {\n  --dfo-cell-c: #f5d451;\n  border-color: #d5b26e;\n  filter: brightness(1.14);\n  transform: translateY(-1px);\n  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.8), 0 0 7px rgba(213, 178, 110, 0.35);\n}\n/* Selected icon cell uses emerald/azure ready CTA palette (#225c4a / #52c298 / #7fe3b5) */\n.dfo-sm-iconcell.on {\n  --dfo-cell-c: #a7f3d0;\n  border: 2px solid #52c298;\n  border-color: #52c298 #2e8b6b #1b4d3e #46b58d;\n  background: linear-gradient(180deg, #225c4a 0%, #163d31 100%);\n  box-shadow:\n    inset 0 0 10px rgba(127, 227, 181, 0.55),\n    0 0 8px rgba(46, 139, 107, 0.65),\n    0 0 0 1px #050608;\n  z-index: 4;\n}\n.dfo-sm-iconcell.on::before {\n  border-color: rgba(167, 243, 208, 0.42);\n}\n.dfo-sm-iconcell img {\n  display: block;\n  width: 100%;\n  height: 100%;\n  object-fit: fill;\n  image-rendering: pixelated;\n  position: relative;\n  z-index: 1;\n}\n\n/* Canonical Hover Tooltips (.dfo-status-tip from dfo_pack.js) */\n.dfo-status-tip.dfo-sm-tip {\n  position: fixed;\n  z-index: 10060;\n  pointer-events: none;\n  box-sizing: border-box;\n  min-width: 300px;\n  max-width: min(470px, 92vw);\n  font-family: 'DFO Gabin', var(--data, serif);\n  color: #f1e6c8;\n  background: linear-gradient(180deg, rgba(24, 28, 35, 0.98) 0%, rgba(12, 14, 18, 0.98) 100%);\n  border: 2px solid;\n  border-color: #a5997e #413a2d #252119 #7e7562;\n  box-shadow: 0 0 0 1px #050608, inset 0 0 0 1px rgba(5, 6, 8, 0.82), 0 12px 28px rgba(0, 0, 0, 0.9);\n  border-radius: 1px;\n}\n.dfo-status-tip.dfo-sm-tip .dfo-st-head {\n  display: flex;\n  align-items: center;\n  gap: 7px;\n  padding: 7px 12px;\n  font-family: 'DFO Greengoth', var(--display, Georgia, serif);\n  font-size: 13px;\n  letter-spacing: 0.04em;\n  color: #f5d451;\n  text-shadow: 0 1px 0 #000;\n  background: linear-gradient(180deg, rgba(48, 38, 21, 0.88), rgba(20, 17, 12, 0.94));\n  border-bottom: 1px solid rgba(192, 138, 62, 0.45);\n}\n.dfo-status-tip.dfo-sm-tip .dfo-st-head-ico { width: 15px; height: 15px; flex: 0 0 15px; filter: drop-shadow(0 1px 1px #000); }\n.dfo-status-tip.dfo-sm-tip .dfo-st-body { padding: 9px 12px 11px; display: flex; flex-direction: column; gap: 5px; }\n.dfo-status-tip.dfo-sm-tip .dfo-st-cards { display: flex; flex-direction: column; gap: 5px; margin-bottom: 2px; }\n.dfo-status-tip.dfo-sm-tip .dfo-st-card {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  padding: 6px 10px;\n  background: linear-gradient(180deg, rgba(14, 17, 23, 0.95), rgba(8, 10, 14, 0.96));\n  border: 1px solid rgba(117, 99, 70, 0.52);\n  border-left: 3px solid #d4aa4f;\n  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.75);\n}\n.dfo-status-tip.dfo-sm-tip .dfo-st-card.is-gold { border-left-color: #f5d451; }\n.dfo-status-tip.dfo-sm-tip .dfo-st-card.is-gold .dfo-st-card-v { color: #f5d451; }\n.dfo-status-tip.dfo-sm-tip .dfo-st-card.is-shards { border-left-color: #38bdf8; }\n.dfo-status-tip.dfo-sm-tip .dfo-st-card.is-shards .dfo-st-card-v { color: #bae6fd; }\n.dfo-status-tip.dfo-sm-tip .dfo-st-card.is-loc { border-left-color: #f59e0b; }\n.dfo-status-tip.dfo-sm-tip .dfo-st-card.is-loc .dfo-st-card-v { color: #fde68a; }\n.dfo-status-tip.dfo-sm-tip .dfo-st-card.is-aurum { border-left-color: #e0584a; }\n.dfo-status-tip.dfo-sm-tip .dfo-st-card.is-aurum .dfo-st-card-v { color: #ff9f98; }\n.dfo-status-tip.dfo-sm-tip .dfo-st-card.is-embers { border-left-color: #2e8b6b; }\n.dfo-status-tip.dfo-sm-tip .dfo-st-card.is-embers .dfo-st-card-v { color: #7fe3b5; }\n.dfo-status-tip.dfo-sm-tip .dfo-st-card-l { display: flex; align-items: center; gap: 6px; min-width: 0; }\n.dfo-status-tip.dfo-sm-tip .dfo-st-card-ico { width: 14px; height: 14px; flex: 0 0 14px; }\n.dfo-status-tip.dfo-sm-tip .dfo-st-card-k { font-size: 11px; letter-spacing: 0.03em; color: #d6c8a8; text-transform: uppercase; }\n.dfo-status-tip.dfo-sm-tip .dfo-st-card-v {\n  font-family: 'DFO Flexi', var(--data, monospace);\n  font-variant-numeric: tabular-nums;\n  font-size: 14px;\n  white-space: nowrap;\n}\n.dfo-status-tip.dfo-sm-tip .dfo-st-info {\n  display: flex;\n  flex-direction: column;\n  gap: 5px;\n  padding: 7px 9px;\n  background: rgba(7, 9, 12, 0.72);\n  border: 1px solid rgba(117, 99, 70, 0.34);\n}\n.dfo-status-tip.dfo-sm-tip .dfo-st-fk { font-size: 10.5px; letter-spacing: 0.05em; text-transform: uppercase; color: #dec37f; }\n.dfo-status-tip.dfo-sm-tip .dfo-st-fv,\n.dfo-status-tip.dfo-sm-tip .dfo-st-line { font-size: 12px; line-height: 1.35; color: #ece2c8; text-shadow: 0 1px 0 #000; }\n.dfo-status-tip.dfo-sm-tip .dfo-st-line.is-good { color: #7fe3b5; }\n.dfo-status-tip.dfo-sm-tip .dfo-st-line.is-bad { color: #ff9f98; }\n.dfo-status-tip.dfo-sm-tip .dfo-st-line.is-center { color: #fcd34d; }\n.dfo-status-tip.dfo-sm-tip .dfo-st-sep {\n  height: 1px;\n  margin: 3px 0;\n  background: linear-gradient(90deg, transparent, rgba(192, 138, 62, 0.45), transparent);\n}\n\n/* ── Mechanics Guide Modal (1:1 Canon of Inventory's \"Equipped Gear Bonuses Summary\" .dfo-seal-modal) ── */\n:is(.port-spellmaker, dialog.dfo-sm-dialog, .dfo-sm-tip) .dfo-chip {\n  display: inline-block;\n  padding: 2px 7px;\n  border-radius: 2px;\n  border: 1px solid rgba(192, 138, 62, 0.36);\n  background: rgba(15, 18, 24, 0.85);\n  font-family: 'DFO Gabin', var(--data, serif);\n  font-size: 10.5px;\n  letter-spacing: 0.04em;\n  text-transform: uppercase;\n  color: #e7d6a9;\n}\n:is(.port-spellmaker, dialog.dfo-sm-dialog, .dfo-sm-tip) .dfo-chip.chip-gold { border-color: rgba(245, 212, 81, 0.5); color: #f5d451; background: rgba(68, 52, 20, 0.44); }\n:is(.port-spellmaker, dialog.dfo-sm-dialog, .dfo-sm-tip) .dfo-chip.chip-teal { border-color: rgba(94, 185, 157, 0.55); color: #7fe3b5; background: rgba(24, 68, 56, 0.46); }\n:is(.port-spellmaker, dialog.dfo-sm-dialog, .dfo-sm-tip) .dfo-chip.chip-red { border-color: rgba(224, 88, 74, 0.58); color: #ff9f98; background: rgba(88, 28, 24, 0.46); }\n:is(.port-spellmaker, dialog.dfo-sm-dialog, .dfo-sm-tip) .dfo-chip.chip-purple { border-color: rgba(192, 132, 252, 0.52); color: #dfb8ff; background: rgba(62, 32, 92, 0.44); }\n:is(.port-spellmaker, dialog.dfo-sm-dialog, .dfo-sm-tip) .dfo-chip.chip-amber { border-color: rgba(245, 158, 11, 0.55); color: #fcd34d; background: rgba(84, 46, 12, 0.46); }\n\ndialog.dfo-panel.dfo-win.dfo-seal-modal.dfo-sm-dialog {\n  box-sizing: border-box;\n  padding: 0;\n  margin: auto;\n  width: min(1320px, calc(100vw - 36px));\n  height: min(920px, calc(100dvh - 36px));\n  max-width: calc(100vw - 36px);\n  max-height: calc(100dvh - 36px);\n  display: flex;\n  flex-direction: column;\n  background-color: var(--dfo-bg-window, rgba(12, 14, 18, 0.96));\n  background-image: var(--dfo-bg-dither-img, repeating-conic-gradient(rgba(255, 255, 255, 0.022) 0 25%, transparent 0 50%));\n  background-size: var(--dfo-bg-dither-size, 4px 4px);\n  box-shadow: 4px 4px 0 6px rgba(0, 0, 0, 0.48), 0 18px 48px rgba(0, 0, 0, 0.9);\n  border-radius: 0;\n  color: var(--dfo-bone-warm, #f1e6c8);\n  font-family: 'DFO Gabin', var(--data, serif);\n  overflow: hidden;\n  outline: none;\n  z-index: 10050;\n}\ndialog.dfo-panel.dfo-win.dfo-seal-modal.dfo-sm-dialog:not([open]) { display: none; }\ndialog.dfo-panel.dfo-win.dfo-seal-modal.dfo-sm-dialog::backdrop { background: var(--dfo-bg-scrim, rgba(5, 7, 10, 0.8)); }\n\ndialog.dfo-seal-modal.dfo-sm-dialog .wh {\n  flex: 0 0 auto;\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 10px 12px 10px 16px;\n  background-color: var(--dfo-bg-panel, rgba(15, 17, 22, 0.94));\n  background-image:\n    radial-gradient(ellipse 36% 140% at 6% 50%, rgba(59, 130, 246, 0.24), transparent 72%),\n    linear-gradient(180deg, rgba(44, 38, 25, 0.9), rgba(16, 16, 20, 0.96));\n  border-bottom: 1px solid rgba(192, 138, 62, 0.5);\n  box-shadow: 0 1px 0 #050608, inset 0 1px 0 rgba(255, 224, 150, 0.08);\n  color: #f5d451;\n  font-family: 'DFO Greengoth', var(--display, Georgia, serif);\n  font-size: 17px;\n  letter-spacing: 0.05em;\n  text-shadow: 0 2px 0 #000, 0 0 10px rgba(0, 0, 0, 0.85);\n}\ndialog.dfo-seal-modal.dfo-sm-dialog .wh .dfo-st-head-ico {\n  width: 22px;\n  height: 22px;\n  flex: 0 0 22px;\n  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.85));\n}\ndialog.dfo-seal-modal.dfo-sm-dialog .wh .t {\n  flex: 1 1 auto;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: #f5d451;\n}\ndialog.dfo-seal-modal.dfo-sm-dialog .dfo-sm-meta-chip {\n  flex: 0 0 auto;\n  padding: 3px 10px;\n  border-radius: 2px;\n  border: 1px solid rgba(147, 197, 253, 0.45);\n  background: rgba(24, 39, 68, 0.55);\n  color: #e0f2fe;\n  font-family: 'DFO Gabin', var(--data, serif);\n  font-size: 11px;\n  letter-spacing: 0.05em;\n  text-transform: uppercase;\n  text-shadow: 0 1px 0 #000;\n}\ndialog.dfo-seal-modal.dfo-sm-dialog .wh .x {\n  flex: 0 0 auto;\n  background: none;\n  border: 0;\n  color: #a9a08a;\n  cursor: pointer;\n  font: inherit;\n  font-size: 17px;\n  line-height: 1;\n  padding: 2px 7px;\n}\ndialog.dfo-seal-modal.dfo-sm-dialog .wh .x:hover { color: #f6e7b0; }\n\ndialog.dfo-seal-modal.dfo-sm-dialog .dfo-sm-hero {\n  flex: 0 0 auto;\n  display: flex;\n  flex-direction: column;\n  gap: 9px;\n  padding: 10px 14px;\n  background:\n    radial-gradient(ellipse 52% 110% at 8% 0%, rgba(59, 130, 246, 0.14), transparent 68%),\n    var(--dfo-bg-footer, rgba(0, 0, 0, 0.24));\n  border-bottom: 1px solid rgba(117, 99, 70, 0.48);\n}\ndialog.dfo-seal-modal.dfo-sm-dialog .dfo-st-intro {\n  font-size: 12.5px;\n  line-height: 1.42;\n  color: #e9e0c8;\n  padding-left: 10px;\n  border-left: 3px solid #7da8ea;\n}\ndialog.dfo-seal-modal.dfo-sm-dialog .dfo-sm-kpis {\n  display: grid;\n  grid-template-columns: repeat(4, minmax(0, 1fr));\n  gap: 8px;\n}\ndialog.dfo-seal-modal.dfo-sm-dialog .dfo-sm-kpi {\n  --kpi-accent: #9e7f48;\n  --kpi-rgb: 158, 127, 72;\n  --kpi-val: #7fe3b5;\n  display: flex;\n  flex-direction: row;\n  align-items: center;\n  justify-content: space-between;\n  gap: 10px;\n  padding: 7px 12px;\n  border: 1px solid rgba(117, 99, 70, 0.52);\n  border-left: 3px solid var(--kpi-accent);\n  background: linear-gradient(90deg, rgba(var(--kpi-rgb), 0.14), rgba(10, 12, 16, 0.94) 55%);\n  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.72), 0 2px 6px rgba(0, 0, 0, 0.35);\n}\ndialog.dfo-seal-modal.dfo-sm-dialog .dfo-sm-kpi.is-total   { --kpi-accent: #3ebd8f; --kpi-rgb: 62, 189, 143;  --kpi-val: #7fe3b5; }\ndialog.dfo-seal-modal.dfo-sm-dialog .dfo-sm-kpi.is-ok      { --kpi-accent: #5eb99d; --kpi-rgb: 94, 185, 157;  --kpi-val: #7fe3b5; }\ndialog.dfo-seal-modal.dfo-sm-dialog .dfo-sm-kpi.is-arc     { --kpi-accent: #60a5fa; --kpi-rgb: 96, 165, 250;  --kpi-val: #9ec7ff; }\ndialog.dfo-seal-modal.dfo-sm-dialog .dfo-sm-kpi.is-gold    { --kpi-accent: #f5d451; --kpi-rgb: 245, 212, 81;  --kpi-val: #f5d451; }\ndialog.dfo-seal-modal.dfo-sm-dialog .dfo-sm-kpi-k {\n  font-size: 10.5px;\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n  color: #d6c8a8;\n  text-shadow: 0 1px 0 #000;\n  line-height: 1.2;\n}\ndialog.dfo-seal-modal.dfo-sm-dialog .dfo-sm-kpi-v {\n  flex: 0 0 auto;\n  font-family: 'DFO Flexi', var(--data, monospace);\n  font-variant-numeric: tabular-nums;\n  font-size: 18px;\n  line-height: 1;\n  color: var(--kpi-val);\n  text-shadow: 0 1px 0 #000;\n}\n\ndialog.dfo-seal-modal.dfo-sm-dialog .wb {\n  flex: 1 1 auto;\n  min-height: 0;\n  overflow: hidden;\n  display: flex;\n  flex-direction: column;\n  padding: 11px 14px;\n}\n:is(dialog.dfo-seal-modal.dfo-sm-dialog, .dfo-fxed-win) .dfo-sm-grid {\n  flex: 1 1 auto;\n  min-height: 0;\n  height: 100%;\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) 16px minmax(0, 1fr);\n  gap: 0;\n  align-items: stretch;\n}\n:is(dialog.dfo-seal-modal.dfo-sm-dialog, .dfo-fxed-win) .dfo-sm-divider {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  gap: 6px;\n  padding: 12px 0;\n}\n:is(dialog.dfo-seal-modal.dfo-sm-dialog, .dfo-fxed-win) .dfo-sm-divider-line {\n  flex: 1 1 auto;\n  width: 1px;\n  background: linear-gradient(180deg, transparent, rgba(192, 138, 62, 0.56) 28%, rgba(245, 212, 81, 0.44) 85%, transparent);\n}\n:is(dialog.dfo-seal-modal.dfo-sm-dialog, .dfo-fxed-win) .dfo-sm-divider-line:last-child {\n  background: linear-gradient(180deg, rgba(245, 212, 81, 0.44) 15%, rgba(192, 138, 62, 0.56) 72%, transparent);\n}\n:is(dialog.dfo-seal-modal.dfo-sm-dialog, .dfo-fxed-win) .dfo-sm-divider-gem {\n  font-size: 11px;\n  line-height: 1;\n  color: #d5b26e;\n  text-shadow: 0 0 6px rgba(245, 212, 81, 0.35), 0 1px 0 #000;\n}\n:is(dialog.dfo-seal-modal.dfo-sm-dialog, .dfo-fxed-win) .dfo-sm-pane {\n  display: flex;\n  flex-direction: column;\n  min-height: 0;\n  overflow: hidden;\n  padding: 0;\n}\n:is(dialog.dfo-seal-modal.dfo-sm-dialog, .dfo-fxed-win) .dfo-sm-pane.is-stats {\n  border-top-color: #5eb99d;\n  background: linear-gradient(180deg, rgba(14, 24, 24, 0.95), rgba(11, 14, 18, 0.97));\n}\n:is(dialog.dfo-seal-modal.dfo-sm-dialog, .dfo-fxed-win) .dfo-sm-pane.is-passives {\n  border-top-color: #d5b26e;\n  background: linear-gradient(180deg, rgba(25, 19, 14, 0.95), rgba(13, 13, 17, 0.97));\n}\n:is(dialog.dfo-seal-modal.dfo-sm-dialog, .dfo-fxed-win) .dfo-sm-pane-head {\n  flex: 0 0 auto;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  padding: 8px 12px;\n  text-shadow: 0 1px 0 #000;\n}\n:is(dialog.dfo-seal-modal.dfo-sm-dialog, .dfo-fxed-win) .dfo-sm-pane-head.is-stats {\n  background: linear-gradient(180deg, rgba(25, 50, 44, 0.76), rgba(13, 19, 22, 0.95));\n  border-bottom: 1px solid rgba(94, 185, 157, 0.34);\n}\n:is(dialog.dfo-seal-modal.dfo-sm-dialog, .dfo-fxed-win) .dfo-sm-pane-head.is-passives {\n  background: linear-gradient(180deg, rgba(56, 39, 22, 0.76), rgba(18, 16, 17, 0.95));\n  border-bottom: 1px solid rgba(213, 178, 110, 0.36);\n}\n:is(dialog.dfo-seal-modal.dfo-sm-dialog, .dfo-fxed-win) .dfo-sm-pane-title-wrap { display: inline-flex; align-items: center; gap: 7px; min-width: 0; }\n:is(dialog.dfo-seal-modal.dfo-sm-dialog, .dfo-fxed-win) .dfo-sm-pane-gem { font-size: 11px; line-height: 1; }\n:is(dialog.dfo-seal-modal.dfo-sm-dialog, .dfo-fxed-win) .dfo-sm-pane-head.is-stats .dfo-sm-pane-gem { color: #7fe3b5; }\n:is(dialog.dfo-seal-modal.dfo-sm-dialog, .dfo-fxed-win) .dfo-sm-pane-head.is-passives .dfo-sm-pane-gem { color: #f5d451; }\n:is(dialog.dfo-seal-modal.dfo-sm-dialog, .dfo-fxed-win) .dfo-sm-pane-title {\n  font-family: 'DFO Greengoth', var(--display, Georgia, serif);\n  font-size: 13.5px;\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n  color: #e7d6a9;\n}\n:is(dialog.dfo-seal-modal.dfo-sm-dialog, .dfo-fxed-win) .dfo-sm-pane-head.is-passives .dfo-sm-pane-title { color: #f6e7b0; }\n:is(dialog.dfo-seal-modal.dfo-sm-dialog, .dfo-fxed-win) .dfo-sm-pane-body {\n  flex: 1 1 auto;\n  min-height: 0;\n  overflow-y: auto;\n  overscroll-behavior: contain;\n  padding: 10px 11px 11px;\n  scrollbar-width: thin;\n  scrollbar-color: #756346 #0c0e11;\n}\n:is(dialog.dfo-seal-modal.dfo-sm-dialog, .dfo-fxed-win) .dfo-sm-pane-body::-webkit-scrollbar { width: 8px; }\n:is(dialog.dfo-seal-modal.dfo-sm-dialog, .dfo-fxed-win) .dfo-sm-pane-body::-webkit-scrollbar-track { background: #0c0e11; border-left: 1px solid rgba(117, 99, 70, 0.2); }\n:is(dialog.dfo-seal-modal.dfo-sm-dialog, .dfo-fxed-win) .dfo-sm-pane-body::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #5e4f37, #3e3424); border: 1px solid #14171c; border-radius: 2px; }\n\n/* Guide Section Cards & Collapsible Formula Spoilers */\n.dfo-gm-cards {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n}\n.dfo-gm-card {\n  padding: 9px 11px;\n  background: linear-gradient(180deg, rgba(11, 14, 19, 0.94), rgba(8, 10, 14, 0.96));\n  display: flex;\n  flex-direction: column;\n  gap: 7px;\n}\n.dfo-gm-card-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  padding-bottom: 5px;\n  border-bottom: 1px solid rgba(192, 138, 62, 0.28);\n}\n.dfo-gm-card-title {\n  margin: 0;\n  font-family: 'DFO Greengoth', var(--display, Georgia, serif);\n  font-size: 13.5px;\n  letter-spacing: 0.04em;\n  color: #f6e7b0;\n  text-shadow: 0 1px 0 #000;\n}\n.dfo-gm-card-body {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n}\n.dfo-gm-p {\n  margin: 0;\n  font-family: 'DFO Flow', 'DFO Gabin', Georgia, serif;\n  font-size: 12.8px;\n  line-height: 1.48;\n  color: #e4dcc8;\n}\n.dfo-gm-spoiler {\n  margin-top: 2px;\n  border: 1px solid rgba(125, 168, 234, 0.34);\n  background: rgba(14, 21, 34, 0.65);\n  border-radius: 2px;\n}\n.dfo-gm-spoiler-sum {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  padding: 5px 9px;\n  cursor: pointer;\n  list-style: none;\n  font-family: 'DFO Gabin', var(--data, serif);\n  font-size: 11.5px;\n  letter-spacing: 0.03em;\n  color: #93c5fd;\n  user-select: none;\n}\n.dfo-gm-spoiler-sum::-webkit-details-marker { display: none; }\n.dfo-gm-spoiler-sum:hover { color: #dbeafe; background: rgba(59, 130, 246, 0.12); }\n.dfo-gm-spoiler-arrow {\n  display: inline-block;\n  font-size: 11px;\n  transition: transform 120ms ease;\n}\n.dfo-gm-spoiler[open] .dfo-gm-spoiler-arrow {\n  transform: rotate(90deg);\n  color: #f5d451;\n}\n.dfo-gm-spoiler-body {\n  padding: 6px 9px 8px;\n  border-top: 1px dashed rgba(125, 168, 234, 0.28);\n  display: flex;\n  flex-direction: column;\n  gap: 5px;\n}\n.dfo-gm-formula-row {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  padding: 4px 7px;\n  background: rgba(7, 10, 16, 0.85);\n  border-left: 2px solid #d5b26e;\n}\n.dfo-gm-formula-k {\n  font-family: 'DFO Gabin', var(--data, serif);\n  font-size: 11px;\n  letter-spacing: 0.04em;\n  text-transform: uppercase;\n  color: #f5d451;\n}\n.dfo-gm-formula-v {\n  font-family: 'DFO Flexi', var(--data, monospace);\n  font-size: 11.5px;\n  line-height: 1.38;\n  color: #cbd5e1;\n}\n\ndialog.dfo-seal-modal.dfo-sm-dialog .wf {\n  flex: 0 0 auto;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 10px;\n  padding: 8px 14px 10px;\n  background: var(--dfo-bg-footer, rgba(0, 0, 0, 0.26));\n  border-top: 1px solid #050608;\n  box-shadow: inset 0 1px 0 rgba(163, 152, 128, 0.24);\n}\ndialog.dfo-seal-modal.dfo-sm-dialog .dfo-sm-foot-hint {\n  font-size: 11.5px;\n  color: #a89f88;\n}\ndialog.dfo-seal-modal.dfo-sm-dialog .dfo-gm-close-btn {\n  --dfo-c: #fde68a;\n  position: relative;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: auto !important;\n  min-width: 120px !important;\n  min-height: 30px !important;\n  height: 30px !important;\n  padding: 4px 18px !important;\n  border: 1px solid #a6823f;\n  border-top-color: #e4c175;\n  border-bottom-color: #4f3b18;\n  border-radius: 1px;\n  background: linear-gradient(180deg, #4b391a 0%, #2f230e 56%, #1f1709 100%);\n  color: #fde68a;\n  font-family: 'DFO Greengoth', var(--display, Georgia, serif);\n  font-size: 13px;\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n  text-shadow: 0 1px 0 #000;\n  cursor: pointer;\n}\ndialog.dfo-seal-modal.dfo-sm-dialog .dfo-gm-close-btn::before {\n  content: '';\n  position: absolute;\n  inset: 2px;\n  border: 1px solid rgba(253, 230, 138, 0.32);\n  pointer-events: none;\n}\ndialog.dfo-seal-modal.dfo-sm-dialog .dfo-gm-close-btn::after {\n  content: '';\n  position: absolute;\n  inset: 2px;\n  pointer-events: none;\n  background:\n    linear-gradient(var(--dfo-c), var(--dfo-c)) top left / 5px 1px no-repeat,\n    linear-gradient(var(--dfo-c), var(--dfo-c)) top left / 1px 5px no-repeat,\n    linear-gradient(var(--dfo-c), var(--dfo-c)) top right / 5px 1px no-repeat,\n    linear-gradient(var(--dfo-c), var(--dfo-c)) top right / 1px 5px no-repeat,\n    linear-gradient(var(--dfo-c), var(--dfo-c)) bottom left / 5px 1px no-repeat,\n    linear-gradient(var(--dfo-c), var(--dfo-c)) bottom left / 1px 5px no-repeat,\n    linear-gradient(var(--dfo-c), var(--dfo-c)) bottom right / 5px 1px no-repeat,\n    linear-gradient(var(--dfo-c), var(--dfo-c)) bottom right / 1px 5px no-repeat;\n}\ndialog.dfo-seal-modal.dfo-sm-dialog .dfo-gm-close-btn:hover { filter: brightness(1.16); }\n\n/* ── Dual-Pane Spell Effect Picker Modal (ui-references Cards, Rows, Chips, Warning Plaques) ── */\ndialog.dfo-panel.dfo-win.dfo-seal-modal.dfo-sm-dialog.dfo-fx-picker-modal {\n  width: min(1380px, calc(100vw - 32px));\n  height: min(920px, calc(100dvh - 32px));\n}\n\n.dfo-fxp-wb { padding: 10px 14px !important; }\n.dfo-fxp-grid {\n  grid-template-columns: minmax(420px, 43%) 16px minmax(0, 57%) !important;\n}\n.dfo-fxp-list {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n  padding: 9px 10px 12px !important;\n}\n.dfo-fxp-sch-sec {\n  --sch-c: #d5b26e;\n  display: flex;\n  flex-direction: column;\n  gap: 5px;\n}\n.dfo-fxp-sch-head {\n  position: sticky;\n  top: -9px;\n  z-index: 3;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  padding: 5px 9px;\n  background: linear-gradient(90deg, color-mix(in srgb, var(--sch-c) 20%, #10141b), rgba(12, 15, 20, 0.98) 65%);\n  border: 1px solid rgba(117, 99, 70, 0.42);\n  border-left: 3px solid var(--sch-c);\n  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.65);\n}\n.dfo-fxp-sch-left {\n  display: flex;\n  align-items: baseline;\n  gap: 7px;\n  min-width: 0;\n  overflow: hidden;\n}\n.dfo-fxp-sch-gem { font-size: 10px; color: var(--sch-c); flex: 0 0 auto; }\n.dfo-fxp-sch-name {\n  font-family: 'DFO Greengoth', var(--display, Georgia, serif);\n  font-size: 12.5px;\n  letter-spacing: 0.05em;\n  text-transform: uppercase;\n  color: #f6e7b0;\n  text-shadow: 0 1px 0 #000;\n  white-space: nowrap;\n}\n.dfo-fxp-sch-sub {\n  font-size: 10.5px;\n  color: #a89f88;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n.dfo-fxp-sch-cnt {\n  flex: 0 0 auto;\n  font-family: 'DFO Flexi', var(--data, monospace);\n  font-size: 11px;\n  padding: 1px 6px;\n  border-radius: 2px;\n  background: rgba(8, 10, 14, 0.85);\n  border: 1px solid color-mix(in srgb, var(--sch-c) 45%, #2a241b);\n  color: var(--sch-c);\n}\n.dfo-fxp-rows {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n.dfo-fxp-fam-div {\n  display: flex;\n  align-items: center;\n  gap: 7px;\n  margin: 6px 2px 2px;\n  padding: 1px 0;\n}\n.dfo-fxp-fam-div:first-child { margin-top: 2px; }\n.dfo-fxp-fam-line {\n  flex: 1 1 auto;\n  height: 1px;\n  background: linear-gradient(90deg, rgba(117, 99, 70, 0.14), color-mix(in srgb, var(--sch-c, #d5b26e) 46%, rgba(117, 99, 70, 0.35)), rgba(117, 99, 70, 0.14));\n}\n.dfo-fxp-fam-lbl {\n  flex: 0 0 auto;\n  font-family: 'DFO Gabin', var(--data, serif);\n  font-size: 10px;\n  letter-spacing: 0.08em;\n  text-transform: uppercase;\n  color: color-mix(in srgb, var(--sch-c, #d5b26e) 76%, #f1e6c8);\n  text-shadow: 0 1px 0 #000;\n  white-space: nowrap;\n}\n.dfo-fxp-hair-div {\n  display: flex;\n  align-items: center;\n  gap: 7px;\n  margin: 4px 10px 1px;\n}\n.dfo-fxp-hair-gem {\n  flex: 0 0 auto;\n  font-size: 8px;\n  line-height: 1;\n  color: color-mix(in srgb, var(--sch-c, #d5b26e) 58%, #8f846c);\n}\n\n/* Item-row styled effect selector rows (1:1 ui-references/cards-lists-and-badges.js) */\n.dfo-item-row.dfo-fxp-row {\n  --dfo-row-rar: #827a68;\n  width: 100%;\n  text-align: left;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 6px 9px 6px 10px;\n  background: var(--dfo-bg-row, rgba(16, 19, 24, 0.9));\n  border: 1px solid rgba(117, 99, 70, 0.28);\n  border-left: 3px solid var(--dfo-row-rar);\n  color: #e9e4d9;\n  cursor: pointer;\n  transition: background-color 110ms ease, border-color 110ms ease;\n}\n.dfo-item-row.dfo-fxp-row:hover {\n  background: var(--dfo-bg-row-hover, rgba(36, 41, 51, 0.94));\n  border-color: rgba(192, 138, 62, 0.5);\n  border-left-color: var(--dfo-row-rar);\n}\n.dfo-item-row.dfo-fxp-row.is-selected {\n  background: linear-gradient(90deg, rgba(44, 92, 78, 0.42), rgba(22, 32, 34, 0.94) 78%);\n  border-color: rgba(245, 212, 81, 0.85);\n  border-left: 4px solid var(--dfo-row-rar);\n  box-shadow: inset 0 0 0 1px rgba(245, 212, 81, 0.25);\n}\n.dfo-fxp-row .dfo-item-row-main {\n  flex: 1 1 auto;\n  min-width: 0;\n  display: flex;\n  flex-direction: column;\n  gap: 1px;\n}\n.dfo-fxp-row .dfo-item-row-name {\n  font-family: 'DFO Gabin', var(--data, serif);\n  font-size: 13px;\n  color: #f1e6c8;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n.dfo-fxp-row.is-selected .dfo-item-row-name { color: #fef08a; }\n.dfo-fxp-row .dfo-item-row-meta {\n  font-size: 10.5px;\n  color: #9e9682;\n}\n.dfo-fxp-row-tags {\n  flex: 0 0 auto;\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n}\n.dfo-fxp-tag-warn {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 20px;\n  height: 18px;\n  border-radius: 2px;\n  font-size: 11px;\n  line-height: 1;\n}\n.dfo-fxp-tag-warn.is-danger {\n  background: rgba(120, 28, 24, 0.72);\n  border: 1px solid rgba(226, 87, 76, 0.8);\n  color: #ff9f98;\n}\n.dfo-fxp-tag-warn.is-warn {\n  background: rgba(96, 54, 12, 0.68);\n  border: 1px solid rgba(245, 158, 11, 0.72);\n  color: #fcd34d;\n}\n\n/* Right Detail Pane */\n.dfo-fxp-detail {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n  padding: 11px 13px !important;\n}\n\n/* Corner-ornamented Rarity Card Header (1:1 ui-references/cards-lists-and-badges.js) */\n.dfo-rar-card.dfo-fxp-hero-card {\n  --dfo-rar: #d5b26e;\n  position: relative;\n  padding: 12px 14px;\n  background:\n    radial-gradient(ellipse 46% 120% at 10% 0%, color-mix(in srgb, var(--dfo-rar) 20%, transparent), transparent 65%),\n    var(--dfo-bg-panel, rgba(15, 17, 22, 0.94));\n  border: 1px solid color-mix(in srgb, var(--dfo-rar) 55%, #1d1a15);\n  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.85), 0 4px 14px rgba(0, 0, 0, 0.55);\n  display: flex;\n  flex-direction: column;\n  gap: 9px;\n}\n.dfo-rar-card.dfo-fxp-hero-card::before {\n  content: '';\n  position: absolute;\n  inset: 3px;\n  border: 1px solid rgba(255, 255, 255, 0.06);\n  pointer-events: none;\n}\n:is(.port-spellmaker, dialog.dfo-sm-dialog) .dfo-item-corners {\n  position: absolute;\n  inset: 0;\n  pointer-events: none;\n}\n:is(.port-spellmaker, dialog.dfo-sm-dialog) .dfo-item-corners > i {\n  position: absolute;\n  width: 9px;\n  height: 9px;\n  background: var(--dfo-rar);\n  opacity: 0.92;\n}\n:is(.port-spellmaker, dialog.dfo-sm-dialog) .dfo-item-corners > i:nth-child(1) { top: 0; left: 0; clip-path: polygon(0 0, 100% 0, 0 100%); }\n:is(.port-spellmaker, dialog.dfo-sm-dialog) .dfo-item-corners > i:nth-child(2) { top: 0; right: 0; clip-path: polygon(0 0, 100% 0, 100% 100%); }\n:is(.port-spellmaker, dialog.dfo-sm-dialog) .dfo-item-corners > i:nth-child(3) { bottom: 0; left: 0; clip-path: polygon(0 0, 0 100%, 100% 100%); }\n:is(.port-spellmaker, dialog.dfo-sm-dialog) .dfo-item-corners > i:nth-child(4) { bottom: 0; right: 0; clip-path: polygon(100% 0, 0 100%, 100% 100%); }\n\n.dfo-fxp-hero-top {\n  display: flex;\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: 10px;\n}\n.dfo-fxp-hero-titles {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  min-width: 0;\n}\n.dfo-fxp-hero-name {\n  margin: 0;\n  font-family: 'DFO Greengoth', var(--display, Georgia, serif);\n  font-size: 18px;\n  letter-spacing: 0.04em;\n  color: #f6e7b0;\n  text-shadow: 0 2px 0 #000;\n}\n.dfo-fxp-id-badge {\n  flex: 0 0 auto;\n  font-family: 'DFO Flexi', var(--data, monospace);\n  font-size: 10.5px;\n  padding: 2px 6px;\n  background: rgba(8, 10, 14, 0.85);\n  border: 1px solid rgba(117, 99, 70, 0.4);\n  color: #a89f88;\n}\n.dfo-fxp-chips {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 5px;\n}\n.dfo-fxp-chips .dfo-chip {\n  cursor: help;\n  transition: filter 110ms ease, box-shadow 110ms ease;\n}\n.dfo-fxp-chips .dfo-chip:hover,\n.dfo-fxp-chips .dfo-chip:focus-visible {\n  filter: brightness(1.22);\n  box-shadow: 0 0 0 1px rgba(245, 212, 81, 0.45), 0 2px 8px rgba(0, 0, 0, 0.55);\n  outline: none;\n}\n.dfo-status-tip.dfo-sm-tip.dfo-fxp-chip-tip {\n  position: fixed;\n  z-index: 10070;\n  min-width: 280px;\n  max-width: 375px;\n  pointer-events: none;\n}\n.dfo-fxp-tip-gem {\n  font-size: 11px;\n  line-height: 1;\n  color: #f5d451;\n}\n.dfo-fxp-tip-gem.chip-purple { color: #dfb8ff; }\n.dfo-fxp-tip-gem.chip-amber  { color: #fcd34d; }\n.dfo-fxp-tip-gem.chip-red    { color: #ff9f98; }\n.dfo-fxp-tip-gem.chip-teal   { color: #7fe3b5; }\n.dfo-fxp-tip-gem.chip-gold   { color: #f5d451; }\n\n/* Dedicated High-Readability Warning / Broken-Effect Plaque */\n.dfo-fxp-alert {\n  position: relative;\n  padding: 10px 13px;\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.72), 0 4px 12px rgba(0, 0, 0, 0.48);\n}\n.dfo-fxp-alert.is-danger {\n  border: 1px solid rgba(226, 87, 76, 0.75);\n  border-left: 4px solid #e2574c;\n  background:\n    repeating-linear-gradient(-45deg, rgba(226, 87, 76, 0.06) 0 6px, transparent 6px 12px),\n    linear-gradient(135deg, rgba(112, 22, 18, 0.56), rgba(18, 10, 12, 0.96) 58%);\n}\n.dfo-fxp-alert.is-warn {\n  border: 1px solid rgba(245, 158, 11, 0.68);\n  border-left: 4px solid #f59e0b;\n  background:\n    repeating-linear-gradient(-45deg, rgba(245, 158, 11, 0.05) 0 6px, transparent 6px 12px),\n    linear-gradient(135deg, rgba(102, 54, 14, 0.48), rgba(17, 13, 9, 0.96) 58%);\n}\n.dfo-fxp-alert-head {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n.dfo-fxp-alert-ico {\n  width: 20px;\n  height: 20px;\n  flex: 0 0 20px;\n  filter: drop-shadow(0 1px 2px #000);\n}\n.dfo-fxp-alert-badge {\n  font-family: 'DFO Gabin', var(--data, serif);\n  font-size: 11px;\n  letter-spacing: 0.08em;\n  text-transform: uppercase;\n  padding: 2px 8px;\n  border-radius: 2px;\n}\n.dfo-fxp-alert.is-danger .dfo-fxp-alert-badge {\n  background: rgba(140, 32, 26, 0.75);\n  border: 1px solid rgba(255, 159, 152, 0.5);\n  color: #fecaca;\n}\n.dfo-fxp-alert.is-warn .dfo-fxp-alert-badge {\n  background: rgba(110, 58, 12, 0.72);\n  border: 1px solid rgba(252, 211, 77, 0.5);\n  color: #fef08a;\n}\n.dfo-fxp-alert-title {\n  font-family: 'DFO Greengoth', var(--display, Georgia, serif);\n  font-size: 14px;\n  letter-spacing: 0.03em;\n  color: #f8ecd0;\n  text-shadow: 0 1px 0 #000;\n}\n.dfo-fxp-alert-text {\n  margin: 0;\n  font-family: 'DFO Flow', 'DFO Gabin', Georgia, serif;\n  font-size: 13px;\n  line-height: 1.48;\n  color: #f1e0d6;\n}\n\n/* Mechanics Description Card */\n.dfo-fxp-mech-card {\n  padding: 11px 13px;\n  display: flex;\n  flex-direction: column;\n  gap: 7px;\n}\n.dfo-fxp-sec-head {\n  display: flex;\n  align-items: center;\n  gap: 7px;\n  padding-bottom: 5px;\n  border-bottom: 1px solid rgba(192, 138, 62, 0.3);\n}\n.dfo-fxp-sec-gem { color: #d5b26e; font-size: 11px; }\n.dfo-fxp-sec-title {\n  font-family: 'DFO Greengoth', var(--display, Georgia, serif);\n  font-size: 13.5px;\n  letter-spacing: 0.05em;\n  text-transform: uppercase;\n  color: #e7d6a9;\n  text-shadow: 0 1px 0 #000;\n}\n.dfo-fxp-mech-p {\n  margin: 0;\n  font-family: 'DFO Flow', 'DFO Gabin', Georgia, serif;\n  font-size: 13px;\n  line-height: 1.5;\n  color: #e6dec8;\n}\n\n/* Key-Value Formula Table inside Spoiler (ui-references/cards-lists-and-badges.js) */\n.dfo-fxp-spoiler table.dfo-kv {\n  border-collapse: collapse;\n  width: 100%;\n  margin: 2px 0;\n  font-family: 'DFO Gabin', var(--data, serif);\n  font-size: 12px;\n}\n.dfo-fxp-spoiler table.dfo-kv th {\n  text-align: left;\n  font-weight: normal;\n  color: #f5d451;\n  padding: 4px 12px 4px 0;\n  width: 34%;\n  vertical-align: top;\n  border-bottom: 1px solid rgba(125, 168, 234, 0.16);\n}\n.dfo-fxp-spoiler table.dfo-kv td {\n  padding: 4px 0;\n  color: #dbeafe;\n  font-family: 'DFO Flexi', var(--data, monospace);\n  font-size: 11.8px;\n  line-height: 1.4;\n  vertical-align: top;\n  border-bottom: 1px solid rgba(125, 168, 234, 0.16);\n}\n.dfo-fxp-spoiler table.dfo-kv tr:last-child th,\n.dfo-fxp-spoiler table.dfo-kv tr:last-child td { border-bottom: 0; }\n\n.dfo-fxp-foot-btns {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n.dfo-fxp-cancel-btn,\n.dfo-fxp-confirm-btn {\n  --dfo-c: #d4b16a;\n  position: relative;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 6px;\n  min-height: 31px;\n  height: 31px;\n  padding: 4px 16px;\n  border: 1px solid #6e5c3e;\n  border-top-color: #9e8355;\n  border-bottom-color: #3b301f;\n  border-radius: 1px;\n  background: linear-gradient(180deg, #272219 0%, #191510 55%, #120f0b 100%);\n  box-shadow: inset 0 1px 0 rgba(255, 224, 150, 0.14), inset 0 -1px 0 rgba(0, 0, 0, 0.72), 0 1px 2px rgba(0, 0, 0, 0.55);\n  color: #f1e6c8;\n  font-family: 'DFO Greengoth', var(--display, Georgia, serif);\n  font-size: 12.5px;\n  letter-spacing: 0.05em;\n  text-transform: uppercase;\n  text-shadow: 0 1px 0 #000;\n  cursor: pointer;\n}\n.dfo-fxp-confirm-btn.primary {\n  --dfo-c: #fde68a;\n  border-color: #a6823f;\n  border-top-color: #e4c175;\n  border-bottom-color: #4f3b18;\n  background: linear-gradient(180deg, #4b391a 0%, #2f230e 56%, #1f1709 100%);\n  color: #fde68a;\n}\n.dfo-fxp-confirm-btn.primary::before,\n.dfo-fxp-cancel-btn::before {\n  content: '';\n  position: absolute;\n  inset: 2px;\n  border: 1px solid rgba(253, 230, 138, 0.28);\n  pointer-events: none;\n}\n.dfo-fxp-confirm-btn.primary::after,\n.dfo-fxp-cancel-btn::after {\n  content: '';\n  position: absolute;\n  inset: 2px;\n  pointer-events: none;\n  background:\n    linear-gradient(var(--dfo-c), var(--dfo-c)) top left / 5px 1px no-repeat,\n    linear-gradient(var(--dfo-c), var(--dfo-c)) top left / 1px 5px no-repeat,\n    linear-gradient(var(--dfo-c), var(--dfo-c)) top right / 5px 1px no-repeat,\n    linear-gradient(var(--dfo-c), var(--dfo-c)) top right / 1px 5px no-repeat,\n    linear-gradient(var(--dfo-c), var(--dfo-c)) bottom left / 5px 1px no-repeat,\n    linear-gradient(var(--dfo-c), var(--dfo-c)) bottom left / 1px 5px no-repeat,\n    linear-gradient(var(--dfo-c), var(--dfo-c)) bottom right / 5px 1px no-repeat,\n    linear-gradient(var(--dfo-c), var(--dfo-c)) bottom right / 1px 5px no-repeat;\n}\n.dfo-fxp-cancel-btn:hover,\n.dfo-fxp-confirm-btn:hover:not(:disabled) { filter: brightness(1.16); }\n.dfo-fxp-confirm-btn:disabled { opacity: 0.45; cursor: default; }\n.dfo-fxp-empty-list,\n.dfo-fxp-empty-detail {\n  padding: 20px;\n  text-align: center;\n  color: #a89f88;\n  font-size: 13px;\n}\n\n/* ── Window 3: Selected Effect Parameter Editor (.dfo-fxed-win, ui-references Canon) ── */\n.port-spellmaker .port-win.dfo-fxed-win,\n.port-spellmaker .dfo-fxed-win {\n  --sm-sch-c: #d5b26e;\n  width: min(1460px, 96vw) !important;\n  height: min(980px, calc(100dvh - 28px)) !important;\n  max-height: calc(100dvh - 28px) !important;\n  display: flex !important;\n  flex-direction: column !important;\n  overflow: visible !important;\n}\n.port-spellmaker .dfo-fxed-win > .port-inner {\n  display: flex !important;\n  flex-direction: column !important;\n  min-height: 0 !important;\n  flex: 1 1 auto !important;\n  overflow: hidden !important;\n  background: transparent !important;\n}\n.dfo-fxed-slot-pill {\n  flex: 0 0 auto;\n  font-family: 'DFO Flexi', var(--data, monospace);\n  font-size: 11px;\n  padding: 1px 8px;\n  border-radius: 2px;\n  background: rgba(8, 10, 14, 0.84);\n  border: 1px solid color-mix(in srgb, var(--sm-sch-c, #d5b26e) 55%, #463a24);\n  color: #f5d451;\n  text-shadow: 0 1px 0 #000;\n}\n.port-spellmaker .dfo-fxed-body {\n  flex: 1 1 auto !important;\n  min-height: 0 !important;\n  display: flex !important;\n  flex-direction: column !important;\n  gap: 10px !important;\n  padding: 10px 12px !important;\n  overflow: hidden !important;\n}\n\n/* Upper Block: Narrow Cost/Summary Left Pane + Spacious Effect Info Right Pane */\n.dfo-fxed-top-grid {\n  flex: 0 0 292px !important;\n  height: 292px !important;\n  min-height: 242px !important;\n  grid-template-columns: 376px 16px minmax(0, 1fr) !important;\n}\n.dfo-fxed-up-left-body {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  padding: 9px 10px !important;\n  overflow-y: auto;\n}\n.dfo-fxed-up-right-body {\n  padding: 9px 12px !important;\n  gap: 8px !important;\n}\n\n/* Canonical ui-references/cards-lists-and-badges.js Stat Plaques (2 Cost cols + Full-Width Power row) */\n.dfo-stat-strip.dfo-fxed-kpi-strip {\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 6px;\n}\n.dfo-stat-strip.dfo-fxed-kpi-strip .dfo-stat-plaque.is-power {\n  grid-column: 1 / -1;\n}\n.port-spellmaker .dfo-stat-plaque {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  padding: 6px 9px;\n  background: var(--dfo-bg-panel, rgba(15, 17, 22, 0.92));\n  border: 1px solid rgba(117, 99, 70, 0.55);\n  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.72);\n}\n.port-spellmaker .dfo-stat-plaque.is-mana  { border-left: 3px solid #38bdf8; }\n.port-spellmaker .dfo-stat-plaque.is-gold  { border-left: 3px solid #f5d451; }\n.port-spellmaker .dfo-stat-plaque.is-power { border-left: 3px solid var(--sm-sch-c, #7fe3b5); }\n.port-spellmaker .dfo-stat-label {\n  font-family: 'DFO Gabin', var(--data, serif);\n  font-size: 10px;\n  letter-spacing: 0.05em;\n  text-transform: uppercase;\n  color: #a89f88;\n}\n.port-spellmaker .dfo-stat-value {\n  font-family: 'DFO Flexi', var(--data, monospace);\n  font-variant-numeric: tabular-nums;\n  font-size: 14.5px;\n  color: #f6e7b0;\n  text-shadow: 0 1px 0 #000;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n.port-spellmaker .dfo-stat-plaque.is-mana .dfo-stat-value  { color: #bae6fd; }\n.port-spellmaker .dfo-stat-plaque.is-gold .dfo-stat-value  { color: #f5d451; }\n.port-spellmaker .dfo-stat-plaque.is-power .dfo-stat-value { color: #7fe3b5; }\n.dfo-fxed-plaque-sub {\n  font-size: 10.5px;\n  color: #8f8570;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n.dfo-fxed-res-val {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n}\n.dfo-fxed-res-ico {\n  width: 16px;\n  height: 16px;\n  flex: 0 0 16px;\n  filter: drop-shadow(0 1px 1px #000);\n}\n.dfo-fxed-res-ico.is-sm {\n  width: 14px;\n  height: 14px;\n  flex: 0 0 14px;\n}\n.dfo-fxed-out-item {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  margin-right: 10px;\n}\n.dfo-fxed-out-item:last-child { margin-right: 0; }\n.dfo-fxed-param-ico,\n.dfo-fxed-panel-ico {\n  width: 15px;\n  height: 15px;\n  flex: 0 0 15px;\n  filter: drop-shadow(0 1px 1px #000);\n}\n.dfo-fxed-panel.is-disabled .dfo-fxed-panel-ico {\n  opacity: 0.45;\n  filter: grayscale(0.75);\n}\n.dfo-fxed-inline-res {\n  display: inline-flex;\n  align-items: center;\n  gap: 3px;\n  font-weight: 600;\n}\n.dfo-fxed-inline-res.is-mana { color: #bae6fd; }\n.dfo-fxed-inline-res.is-gold { color: #f5d451; }\n.dfo-fxed-inline-ico {\n  width: 13px;\n  height: 13px;\n  flex: 0 0 13px;\n  vertical-align: -2px;\n}\n\n/* Whole-Spell Total Cost Strip */\n.dfo-fxed-spell-bar {\n  margin-top: auto;\n  display: flex;\n  flex-direction: column;\n  gap: 5px;\n  padding: 6px 9px;\n}\n.dfo-fxed-spell-meta {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 7px;\n  width: 100%;\n}\n.dfo-fxed-spell-lbl {\n  font-family: 'DFO Gabin', var(--data, serif);\n  font-size: 11.5px;\n  color: #cbbd9c;\n}\n.dfo-fxed-spell-mult {\n  font-family: 'DFO Flexi', var(--data, monospace);\n  font-size: 10.5px;\n  padding: 1px 6px;\n  border-radius: 2px;\n  background: rgba(18, 22, 30, 0.9);\n  border: 1px solid rgba(117, 99, 70, 0.4);\n  color: #b7a889;\n}\n.dfo-fxed-spell-nums {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 7px;\n  width: 100%;\n}\n.dfo-fxed-spell-mp {\n  font-family: 'DFO Flexi', var(--data, monospace);\n  font-variant-numeric: tabular-nums;\n  font-size: 12.5px;\n  color: #7dd3fc;\n}\n.dfo-fxed-spell-gp {\n  font-family: 'DFO Flexi', var(--data, monospace);\n  font-variant-numeric: tabular-nums;\n  font-size: 12.5px;\n  color: #f5d451;\n}\n.dfo-fxed-spell-badge {\n  font-family: 'DFO Gabin', var(--data, serif);\n  font-size: 10.5px;\n  padding: 1px 7px;\n  border-radius: 2px;\n  border: 1px solid rgba(117, 99, 70, 0.45);\n}\n.dfo-fxed-spell-badge.is-ready {\n  background: rgba(24, 68, 56, 0.55);\n  border-color: rgba(94, 185, 157, 0.6);\n  color: #7fe3b5;\n}\n.dfo-fxed-spell-badge.is-warn {\n  background: rgba(96, 54, 12, 0.55);\n  border-color: rgba(245, 158, 11, 0.62);\n  color: #fcd34d;\n}\n.dfo-fxed-spell-badge.is-bad {\n  background: rgba(110, 26, 22, 0.62);\n  border-color: rgba(226, 87, 76, 0.72);\n  color: #ff9f98;\n}\n\n/* Lower Block: Strictly 3 Numeric Parameter Panels in a Row */\n.dfo-fxed-panels {\n  flex: 1 1 auto;\n  min-height: 0;\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 10px;\n  align-items: stretch;\n}\n.dfo-fxed-panel {\n  --dfo-panel-c: #d5b26e;\n  --dfo-panel-rgb: 213, 178, 110;\n  display: flex;\n  flex-direction: column;\n  min-width: 0;\n  min-height: 0;\n  overflow: hidden;\n  border-top-color: var(--dfo-panel-c) !important;\n  background: linear-gradient(180deg, rgba(var(--dfo-panel-rgb), 0.09), var(--dfo-bg-panel, rgba(15, 17, 22, 0.94)) 34%) !important;\n}\n.dfo-fxed-panel.is-disabled {\n  opacity: 0.72;\n  background: var(--dfo-bg-panel, rgba(13, 15, 19, 0.92)) !important;\n  border-top-color: #625a48 !important;\n}\n.dfo-fxed-panel-head {\n  flex: 0 0 auto;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  padding: 7px 11px;\n  background: linear-gradient(180deg, rgba(var(--dfo-panel-rgb), 0.16), rgba(12, 14, 18, 0.95));\n  border-bottom: 1px solid rgba(var(--dfo-panel-rgb), 0.34);\n  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);\n}\n.dfo-fxed-panel.is-disabled .dfo-fxed-panel-head {\n  background: var(--dfo-bg-header, linear-gradient(180deg, rgba(255,255,255,0.04), rgba(0,0,0,0.2)));\n  border-bottom-color: rgba(117, 99, 70, 0.32);\n}\n.dfo-fxed-panel-title-wrap {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  min-width: 0;\n}\n.dfo-fxed-panel-gem {\n  font-size: 11px;\n  color: var(--dfo-panel-c);\n  line-height: 1;\n}\n.dfo-fxed-panel.is-disabled .dfo-fxed-panel-gem { color: #7c7462; }\n.dfo-fxed-panel-title {\n  margin: 0;\n  font-family: 'DFO Greengoth', var(--display, Georgia, serif);\n  font-size: 14px;\n  letter-spacing: 0.05em;\n  text-transform: uppercase;\n  color: #f6e7b0;\n  text-shadow: 0 1px 0 #000;\n  white-space: nowrap;\n}\n.dfo-fxed-panel.is-disabled .dfo-fxed-panel-title { color: #a89f88; }\n.dfo-fxed-help-dot {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 17px;\n  height: 17px;\n  padding: 0;\n  border-radius: 50%;\n  border: 1px solid rgba(var(--dfo-panel-rgb), 0.55);\n  background: rgba(10, 12, 16, 0.85);\n  color: var(--dfo-panel-c);\n  font-family: 'DFO Flexi', var(--data, monospace);\n  font-size: 10.5px;\n  font-weight: 700;\n  cursor: help;\n  flex: 0 0 auto;\n}\n.dfo-fxed-help-dot.is-mini {\n  width: 14px;\n  height: 14px;\n  font-size: 9.5px;\n  opacity: 0.82;\n}\n.dfo-fxed-help-dot:hover,\n.dfo-fxed-help-dot:focus-visible {\n  filter: brightness(1.25);\n  outline: none;\n  box-shadow: 0 0 0 1px rgba(245, 212, 81, 0.45);\n}\n.dfo-fxed-live-badge {\n  flex: 0 0 auto;\n  font-family: 'DFO Flexi', var(--data, monospace);\n  font-variant-numeric: tabular-nums;\n  font-size: 11px;\n  padding: 2px 7px;\n  border-radius: 2px;\n  background: rgba(8, 10, 14, 0.88);\n  border: 1px solid color-mix(in srgb, var(--dfo-panel-c) 50%, #2a241b);\n  color: color-mix(in srgb, var(--dfo-panel-c) 58%, #f6e7b0);\n  white-space: nowrap;\n}\n.dfo-fxed-panel.is-disabled .dfo-fxed-live-badge {\n  border-color: rgba(117, 99, 70, 0.35);\n  color: #8c826e;\n}\n\n.dfo-fxed-panel-body {\n  flex: 1 1 auto;\n  min-height: 0;\n  overflow-y: auto;\n  display: flex;\n  flex-direction: column;\n  gap: 7px;\n  padding: 8px 10px 9px;\n}\n\n/* Live Final Result Well inside each panel (single clean row) */\n.dfo-fxed-preview {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  padding: 7px 10px;\n}\n.dfo-fxed-preview-lbl {\n  font-family: 'DFO Gabin', var(--data, serif);\n  font-size: 11px;\n  letter-spacing: 0.03em;\n  color: #9e947d;\n  white-space: nowrap;\n}\n.dfo-fxed-preview-top {\n  font-family: 'DFO Greengoth', var(--display, Georgia, serif);\n  font-size: 13.5px;\n  letter-spacing: 0.03em;\n  color: #f6e7b0;\n  text-shadow: 0 1px 0 #000;\n  text-align: right;\n}\n\n.dfo-fxed-disabled-well {\n  flex: 1 1 auto;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  text-align: center;\n  gap: 6px;\n  padding: 18px 14px;\n}\n.dfo-fxed-disabled-title {\n  font-family: 'DFO Greengoth', var(--display, Georgia, serif);\n  font-size: 13px;\n  letter-spacing: 0.05em;\n  text-transform: uppercase;\n  color: #9e937d;\n}\n.dfo-fxed-disabled-msg {\n  margin: 0;\n  font-family: 'DFO Flow', 'DFO Gabin', Georgia, serif;\n  font-size: 12.5px;\n  line-height: 1.45;\n  color: #948a76;\n  max-width: 340px;\n}\n\n/* Numeric Control Rows Split into Base & Level Scaling with Gold Metallic Sliders */\n.dfo-fxed-rows {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n}\n.dfo-fxed-sect-lbl {\n  font-family: 'DFO Gabin', var(--data, serif);\n  font-size: 10px;\n  letter-spacing: 0.08em;\n  text-transform: uppercase;\n  color: color-mix(in srgb, var(--dfo-panel-c, #d5b26e) 68%, #d7ccb5);\n  padding: 0 2px;\n}\n.dfo-fxed-sect-div {\n  display: flex;\n  align-items: center;\n  gap: 7px;\n  margin: 4px 1px 1px;\n}\n.dfo-fxed-sect-line {\n  flex: 1 1 auto;\n  height: 1px;\n  background: linear-gradient(90deg, rgba(117, 99, 70, 0.16), color-mix(in srgb, var(--dfo-panel-c, #d5b26e) 58%, rgba(192, 138, 62, 0.4)), rgba(117, 99, 70, 0.16));\n}\n.dfo-fxed-sect-text {\n  flex: 0 0 auto;\n  font-family: 'DFO Gabin', var(--data, serif);\n  font-size: 10px;\n  letter-spacing: 0.08em;\n  text-transform: uppercase;\n  color: color-mix(in srgb, var(--dfo-panel-c, #d5b26e) 78%, #f6e7b0);\n  text-shadow: 0 1px 0 #000;\n  white-space: nowrap;\n}\n.dfo-fxed-row {\n  display: flex;\n  flex-direction: column;\n  gap: 5px;\n  padding: 6px 9px 7px;\n  background: var(--dfo-bg-row, rgba(16, 19, 24, 0.88));\n  border: 1px solid rgba(117, 99, 70, 0.34);\n  border-left: 2px solid color-mix(in srgb, var(--dfo-panel-c) 60%, #4b3e26);\n  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.55);\n}\n.dfo-fxed-row:hover {\n  border-color: rgba(213, 178, 110, 0.55);\n  background: var(--dfo-bg-row-hover, rgba(26, 30, 38, 0.94));\n}\n.dfo-fxed-row-top {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n}\n.dfo-fxed-row-lbl-line {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  min-width: 0;\n}\n.dfo-fxed-row-lbl {\n  font-family: 'DFO Gabin', var(--data, serif);\n  font-size: 12.5px;\n  color: #ede4cd;\n  white-space: nowrap;\n}\n.dfo-fxed-row-range {\n  font-family: 'DFO Flexi', var(--data, monospace);\n  font-size: 10px;\n  color: #8f8672;\n  white-space: nowrap;\n}\n.dfo-fxed-stepper {\n  flex: 0 0 auto;\n  display: inline-flex;\n  align-items: center;\n  gap: 3px;\n}\n.dfo-fxed-step {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  min-width: 26px;\n  height: 24px;\n  padding: 0 5px;\n  border: 1px solid #63533a;\n  border-top-color: #937d56;\n  border-bottom-color: #2f2618;\n  border-radius: 1px;\n  background: linear-gradient(180deg, #272219 0%, #15120d 100%);\n  color: #f1e6c8;\n  font-family: 'DFO Flexi', var(--data, monospace);\n  font-variant-numeric: tabular-nums;\n  font-size: 12.5px;\n  cursor: pointer;\n  user-select: none;\n  box-shadow: inset 0 1px 0 rgba(255, 224, 150, 0.12), 0 1px 2px rgba(0, 0, 0, 0.55);\n}\n.dfo-fxed-step:hover:not(:disabled) {\n  filter: brightness(1.18);\n  border-color: #d5b26e;\n  color: #fde68a;\n}\n.dfo-fxed-step:active:not(:disabled) { transform: translateY(1px); }\n.dfo-fxed-step:disabled {\n  opacity: 0.34;\n  cursor: default;\n}\n.dfo-fxed-input {\n  width: 44px;\n  height: 24px;\n  padding: 0 4px;\n  text-align: center;\n  background: var(--dfo-bg-input, rgba(4, 5, 7, 0.85));\n  border: 1px solid #756346;\n  border-bottom-color: #9a8660;\n  color: #f6e7b0;\n  font-family: 'DFO Flexi', var(--data, monospace);\n  font-variant-numeric: tabular-nums;\n  font-size: 13px;\n  box-shadow: inset 1px 1px 3px rgba(0, 0, 0, 0.78);\n  outline: none;\n}\n.dfo-fxed-input:focus {\n  border-color: #f5d451;\n  box-shadow: inset 1px 1px 3px rgba(0, 0, 0, 0.8), 0 0 6px rgba(245, 212, 81, 0.35);\n}\n\n/* Thin Golden Metallic Wire Track + Sculpted 3D Metallic Sphere Thumb */\n.dfo-fxed-slider-wrap {\n  display: flex;\n  align-items: center;\n  height: 18px;\n  padding: 0 2px;\n}\ninput[type=\"range\"].dfo-fxed-slider {\n  --slider-pct: 0%;\n  -webkit-appearance: none;\n  appearance: none;\n  width: 100%;\n  height: 18px;\n  margin: 0;\n  padding: 0;\n  background: transparent;\n  cursor: pointer;\n  outline: none;\n}\ninput[type=\"range\"].dfo-fxed-slider::-webkit-slider-runnable-track {\n  height: 3px;\n  border-radius: 2px;\n  background:\n    linear-gradient(\n      90deg,\n      #f6e29c 0%,\n      #d4a246 var(--slider-pct),\n      #423521 var(--slider-pct),\n      #251e12 100%\n    );\n  box-shadow:\n    inset 0 1px 0 rgba(255, 240, 185, 0.28),\n    0 0 0 1px #0d0b08,\n    0 1px 2px rgba(0, 0, 0, 0.85);\n}\ninput[type=\"range\"].dfo-fxed-slider::-webkit-slider-thumb {\n  -webkit-appearance: none;\n  appearance: none;\n  width: 14px;\n  height: 14px;\n  margin-top: -5.5px;\n  border-radius: 50%;\n  border: 1px solid #18140d;\n  background:\n    radial-gradient(\n      circle at 32% 28%,\n      #ffffff 0%,\n      #f8f0d8 15%,\n      #bfc6d1 38%,\n      #6f7784 68%,\n      #2a2f39 92%,\n      #14171d 100%\n    );\n  box-shadow:\n    inset 1px 1px 2px rgba(255, 255, 255, 0.72),\n    inset -2px -2px 3px rgba(10, 12, 16, 0.75),\n    inset 0 -1px 2px rgba(243, 207, 134, 0.42),\n    0 2px 4px rgba(0, 0, 0, 0.88),\n    0 0 0 1px rgba(213, 178, 110, 0.42);\n  transition: transform 90ms ease, box-shadow 120ms ease, filter 120ms ease;\n}\ninput[type=\"range\"].dfo-fxed-slider:hover::-webkit-slider-thumb,\ninput[type=\"range\"].dfo-fxed-slider:focus-visible::-webkit-slider-thumb {\n  filter: brightness(1.12);\n  transform: scale(1.08);\n  box-shadow:\n    inset 1px 1px 2px rgba(255, 255, 255, 0.82),\n    inset -2px -2px 3px rgba(10, 12, 16, 0.75),\n    inset 0 -1px 2px rgba(243, 207, 134, 0.52),\n    0 2px 5px rgba(0, 0, 0, 0.92),\n    0 0 7px rgba(243, 207, 134, 0.62);\n}\ninput[type=\"range\"].dfo-fxed-slider:active::-webkit-slider-thumb {\n  transform: scale(1.12);\n}\ninput[type=\"range\"].dfo-fxed-slider::-moz-range-track {\n  height: 3px;\n  border-radius: 2px;\n  background: linear-gradient(90deg, #f6e29c 0%, #d4a246 var(--slider-pct), #423521 var(--slider-pct), #251e12 100%);\n  box-shadow: 0 0 0 1px #0d0b08, 0 1px 2px rgba(0, 0, 0, 0.85);\n}\ninput[type=\"range\"].dfo-fxed-slider::-moz-range-thumb {\n  width: 14px;\n  height: 14px;\n  border-radius: 50%;\n  border: 1px solid #18140d;\n  background: radial-gradient(circle at 32% 28%, #ffffff 0%, #f8f0d8 15%, #bfc6d1 38%, #6f7784 68%, #2a2f39 92%, #14171d 100%);\n  box-shadow: inset 1px 1px 2px rgba(255, 255, 255, 0.72), 0 2px 4px rgba(0, 0, 0, 0.88), 0 0 0 1px rgba(213, 178, 110, 0.42);\n}\n.dfo-fxed-win button.dfo-ornate-btn,\n.dfo-fxed-win .dfo-ornate-btn {\n  --dfo-c: #d4b16a;\n  position: relative;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 6px;\n  width: auto !important;\n  flex: 0 0 auto;\n  padding: 5px 14px;\n  min-height: 29px;\n  white-space: nowrap !important;\n  border: 1px solid #8a734a;\n  border-top-color: #b4965f;\n  border-bottom-color: #463820;\n  border-radius: 1px;\n  background: linear-gradient(180deg, #2b2419 0%, #1a1610 56%, #110e0a 100%);\n  box-shadow: inset 0 1px 0 rgba(255, 224, 150, 0.14), inset 0 -1px 0 rgba(0, 0, 0, 0.7), 0 1px 2px rgba(0, 0, 0, 0.55);\n  color: #f1e6c8;\n  font-family: 'DFO Greengoth', var(--display, Georgia, serif);\n  font-size: 12.5px;\n  letter-spacing: 0.05em;\n  text-transform: uppercase;\n  text-shadow: 0 1px 0 #000;\n  cursor: pointer;\n  user-select: none;\n}\n.dfo-fxed-win .dfo-ornate-btn::before {\n  content: '';\n  position: absolute;\n  inset: 2px;\n  border: 1px solid rgba(255, 255, 255, 0.16);\n  pointer-events: none;\n}\n.dfo-fxed-win .dfo-ornate-btn::after {\n  content: '';\n  position: absolute;\n  inset: 2px;\n  pointer-events: none;\n  background:\n    linear-gradient(var(--dfo-c), var(--dfo-c)) top left / 5px 1px no-repeat,\n    linear-gradient(var(--dfo-c), var(--dfo-c)) top left / 1px 5px no-repeat,\n    linear-gradient(var(--dfo-c), var(--dfo-c)) top right / 5px 1px no-repeat,\n    linear-gradient(var(--dfo-c), var(--dfo-c)) top right / 1px 5px no-repeat,\n    linear-gradient(var(--dfo-c), var(--dfo-c)) bottom left / 5px 1px no-repeat,\n    linear-gradient(var(--dfo-c), var(--dfo-c)) bottom left / 1px 5px no-repeat,\n    linear-gradient(var(--dfo-c), var(--dfo-c)) bottom right / 5px 1px no-repeat,\n    linear-gradient(var(--dfo-c), var(--dfo-c)) bottom right / 1px 5px no-repeat;\n}\n.dfo-fxed-win .dfo-ornate-btn.primary {\n  --dfo-c: #fde68a;\n  border-color: #a6823f;\n  border-top-color: #e4c175;\n  border-bottom-color: #4f3b18;\n  background: linear-gradient(180deg, #4b391a 0%, #2f230e 56%, #1f1709 100%);\n  color: #fde68a;\n}\n.dfo-fxed-win .dfo-ornate-btn.silver {\n  --dfo-c: #cbd5e1;\n  border-color: #64748b;\n  border-top-color: #94a3b8;\n  border-bottom-color: #334155;\n  background: linear-gradient(180deg, #2a3340 0%, #1b222c 56%, #12171e 100%);\n  color: #e2e8f0;\n}\n.dfo-fxed-win .dfo-ornate-btn.dfo-fxed-del-btn {\n  --dfo-c: #ff9f98;\n  border-color: #8f3730;\n  border-top-color: #c9564c;\n  border-bottom-color: #3f1512;\n  background: linear-gradient(180deg, #4c1b18 0%, #2d110f 56%, #1c0a09 100%);\n  color: #fecaca;\n}\n.dfo-fxed-win .dfo-ornate-btn:hover:not(:disabled) { filter: brightness(1.16); }\n.dfo-fxed-win .dfo-ornate-btn:active:not(:disabled) { transform: translateY(1px); }\n.dfo-fxed-win .dfo-ornate-btn:disabled { opacity: 0.42; cursor: default; filter: grayscale(0.4); }\n\n/* Editor Footer (must stay strictly single-row, overriding upstream .port-foot wrap & 100% btn width) */\n.port-spellmaker .dfo-fxed-win .port-foot.dfo-fxed-foot {\n  flex: 0 0 auto !important;\n  display: flex !important;\n  flex-direction: row !important;\n  flex-wrap: nowrap !important;\n  align-items: center !important;\n  justify-content: space-between !important;\n  gap: 12px !important;\n  padding: 8px 14px 9px !important;\n  background: var(--dfo-bg-footer, rgba(0, 0, 0, 0.28)) !important;\n  border-top: 1px solid #050608 !important;\n  box-shadow: inset 0 1px 0 rgba(163, 152, 128, 0.24) !important;\n}\n.dfo-fxed-foot-left {\n  flex: 0 0 auto;\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n}\n.dfo-fxed-foot-hint {\n  flex: 1 1 auto;\n  min-width: 0;\n  font-size: 11.5px;\n  color: #a89f88;\n  text-align: center;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n.dfo-fxed-done-btn {\n  min-width: 152px !important;\n  min-height: 31px !important;\n  font-size: 13.5px !important;\n}\n\n\n/* Production Port Host Shell Integration */\n.port-spellmaker .port-shell {\n  padding: 8px 14px !important;\n}\n.port-spellmaker .port-win.size-dfo-sm-host > .port-inner > .port-head:not(.dfo-sm-head),\n.port-spellmaker .port-win.size-dfo-sm-host > .port-inner > .port-body:not(.dfo-sm-body):not(.dfo-fxed-body),\n.port-spellmaker .port-win.dfo-sm-win > .port-inner > .port-head:not(.dfo-sm-head),\n.port-spellmaker .port-win.dfo-sm-win > .port-inner > .port-body:not(.dfo-sm-body),\n.port-spellmaker .port-win.dfo-fxed-win > .port-inner > .port-head:not(.dfo-sm-head),\n.port-spellmaker .port-win.dfo-fxed-win > .port-inner > .port-body:not(.dfo-fxed-body),\n.port-spellmaker .port-screen.dfo-sm-driver {\n  display: none !important;\n}\n.port-spellmaker .dfo-sm-mount {\n  display: flex !important;\n  flex-direction: column !important;\n  flex: 1 1 auto !important;\n  min-height: 0 !important;\n  overflow: hidden !important;\n  background: transparent !important;\n}\n.port-spellmaker .dfo-sm-dlg-shell {\n  z-index: 10045 !important;\n}\n.port-spellmaker .dfo-sm-viz-canvas:not(.pixelated) {\n  image-rendering: auto !important;\n}\n\n/* Responsive compact calibration for 1366x768 & 1280x720 (1920x1080 remains 100% untouched) */\n@media (max-height: 880px) {\n  .port-spellmaker .port-shell {\n    padding: 6px 10px !important;\n  }\n  .port-spellmaker .port-win.dfo-sm-win,\n  .port-spellmaker .dfo-sm-win {\n    height: min(1018px, calc(100dvh - 14px)) !important;\n    max-height: calc(100dvh - 14px) !important;\n  }\n  .port-spellmaker .dfo-sm-head {\n    padding: 4px 12px 3px !important;\n  }\n  .port-spellmaker .dfo-sm-head .port-title {\n    font-size: 16.5px !important;\n    line-height: 1.15 !important;\n  }\n  .port-spellmaker .dfo-sm-head .port-sub {\n    font-size: 11px !important;\n  }\n  .port-spellmaker .dfo-sm-body {\n    padding: 6px 8px !important;\n  }\n  .port-spellmaker .dfo-sm-layout {\n    grid-template-columns: 348px minmax(0, 1fr);\n    gap: 8px;\n  }\n  .port-spellmaker .dfo-sm-col {\n    gap: 5px;\n  }\n  .port-spellmaker .dfo-sm-left {\n    overflow-y: auto;\n    scrollbar-width: thin;\n  }\n  .port-spellmaker .dfo-sm-panel {\n    padding: 4px 7px;\n    gap: 4px;\n  }\n  .port-spellmaker .dfo-sm-panel-head {\n    margin: -4px -7px 0 -7px;\n    padding: 3px 8px;\n  }\n  .port-spellmaker .dfo-sm-panel-title {\n    font-size: 11.5px !important;\n  }\n  .port-spellmaker .dfo-sm-res-chip {\n    min-height: 27px;\n    padding: 2px 7px;\n  }\n  .port-spellmaker .dfo-sm-res-val {\n    font-size: 13.5px !important;\n  }\n  .port-spellmaker .dfo-sm-viz-panel {\n    min-height: 118px;\n  }\n  .port-spellmaker .dfo-sm-viz-well {\n    min-height: 92px;\n  }\n  .port-spellmaker .dfo-sm-target-grid {\n    gap: 4px;\n  }\n  .port-spellmaker .dfo-sm-tgt-btn {\n    min-height: 23px !important;\n    padding: 2px 6px !important;\n    font-size: 11px !important;\n  }\n  .port-spellmaker .dfo-sm-elem-grid {\n    gap: 4px;\n  }\n  .port-spellmaker .dfo-sm-elem-btn {\n    min-height: 24px !important;\n    padding: 2px 3px !important;\n    font-size: 10.5px !important;\n  }\n  .port-spellmaker .dfo-sm-cta-stack {\n    gap: 4px;\n  }\n  .port-spellmaker .dfo-sm-win .dfo-ornate-btn,\n  .port-spellmaker .dfo-sm-action-btn {\n    min-height: 28px !important;\n    height: 28px !important;\n    padding: 3px 10px !important;\n    font-size: 12px !important;\n  }\n  .port-spellmaker .dfo-sm-name-wrap {\n    min-height: 28px;\n  }\n  .port-spellmaker .dfo-sm-name-input {\n    font-size: 14.5px;\n  }\n  .port-spellmaker .dfo-sm-fx-row {\n    min-height: 35px;\n    padding: 3px 7px;\n  }\n  .port-spellmaker .dfo-sm-icon-showcase {\n    padding: 3px 7px;\n    gap: 8px;\n  }\n  .port-spellmaker .dfo-sm-icon-preview {\n    width: 38px;\n    height: 38px;\n    flex: 0 0 38px;\n  }\n  .port-spellmaker .dfo-sm-icongrid-wrap {\n    min-height: 115px;\n  }\n  .port-spellmaker .port-win.dfo-fxed-win,\n  .port-spellmaker .dfo-fxed-win {\n    height: min(980px, calc(100dvh - 14px)) !important;\n    max-height: calc(100dvh - 14px) !important;\n  }\n  .port-spellmaker .dfo-fxed-body {\n    padding: 6px 8px !important;\n    gap: 6px !important;\n  }\n  .port-spellmaker .dfo-fxed-top-grid {\n    flex: 0 0 212px !important;\n    height: 212px !important;\n    min-height: 170px !important;\n    grid-template-columns: 344px 14px minmax(0, 1fr) !important;\n  }\n  .port-spellmaker .dfo-fxed-panel-head {\n    padding: 5px 8px;\n  }\n  .port-spellmaker .dfo-fxed-panel-body {\n    padding: 6px 8px;\n    gap: 5px;\n  }\n  .port-spellmaker .dfo-fxed-row {\n    padding: 4px 7px 5px;\n    gap: 3px;\n  }\n  .port-spellmaker .dfo-fxed-win .port-foot.dfo-fxed-foot {\n    padding: 5px 10px !important;\n  }\n  dialog.dfo-panel.dfo-win.dfo-seal-modal.dfo-sm-dialog {\n    height: min(920px, calc(100dvh - 16px));\n    max-height: calc(100dvh - 16px);\n  }\n  dialog.dfo-panel.dfo-win.dfo-seal-modal.dfo-sm-dialog .dfo-sm-hero {\n    padding: 7px 12px;\n    gap: 6px;\n  }\n  dialog.dfo-panel.dfo-win.dfo-seal-modal.dfo-sm-dialog .dfo-fxp-grid {\n    grid-template-columns: minmax(340px, 43%) 14px minmax(0, 57%) !important;\n  }\n}\n";

  // Unified 24x24 dark-fantasy SVG icons (ui-references/06-media-and-canvas M-01/M-02/M-04)
  // Mana uses its unique azure-droplet-in-golden-crescent emblem (Welkynd crystal stays strictly for shards).
  const RESOURCE_SVG = Object.freeze({
    gold: {
      defs: [
        { tag: 'linearGradient', id: 'rim', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#fff6bd'], ['38%', '#eab308'], ['78%', '#a16207'], ['100%', '#5c3605']] },
        { tag: 'radialGradient', id: 'face', cx: '34%', cy: '30%', r: '68%', stops: [['0%', '#fef9c3'], ['42%', '#f5c438'], ['85%', '#b87914'], ['100%', '#7c4b08']] },
      ],
      shapes: [
        { tag: 'circle', cx: 12, cy: 12, r: 9.8, fill: '@rim', stroke: '#0a0704', 'stroke-width': 1.15 },
        { tag: 'circle', cx: 12, cy: 12, r: 7.7, fill: '@face', stroke: '#78490a', 'stroke-width': 0.75 },
        { tag: 'circle', cx: 12, cy: 12, r: 6.2, fill: 'none', stroke: '#fef08a', 'stroke-width': 0.65, 'stroke-dasharray': '1.6 1.2', opacity: 0.85 },
        { d: 'M7.8 14.3L8.4 9.8L10.3 11.4L12 8.4L13.7 11.4L15.6 9.8L16.2 14.3Z', fill: '#6b3e06', stroke: '#fef08a', 'stroke-width': 0.55, 'stroke-linejoin': 'round' },
        { d: 'M8.1 15.2H15.9', fill: 'none', stroke: '#6b3e06', 'stroke-width': 1.15, 'stroke-linecap': 'round' },
        { tag: 'ellipse', cx: 8.6, cy: 7.2, rx: 2.1, ry: 0.9, transform: 'rotate(-35 8.6 7.2)', fill: '#ffffff', opacity: 0.62 },
      ],
    },
    loc: {
      defs: [
        { tag: 'linearGradient', id: 'paper', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#f9e7be'], ['55%', '#c9a362'], ['100%', '#765425']] },
        { tag: 'linearGradient', id: 'roll', x1: '0', y1: '0', x2: '0', y2: '1', stops: [['0%', '#fef3c7'], ['50%', '#b7873e'], ['100%', '#593b12']] },
        { tag: 'radialGradient', id: 'wax', cx: '36%', cy: '32%', r: '68%', stops: [['0%', '#fca5a5'], ['38%', '#dc2626'], ['85%', '#7f1d1d'], ['100%', '#450a0a']] },
      ],
      shapes: [
        { d: 'M4.4 5.2H18.4V19.6L16.1 18.2L13.8 19.6L11.5 18.2L9.2 19.6L6.8 18.2L4.4 19.6Z', fill: '@paper', stroke: '#0b0805', 'stroke-width': 1.1, 'stroke-linejoin': 'round' },
        { d: 'M3.2 4.6C3.2 3.3 4.2 2.4 5.4 2.4H17.6C18.8 2.4 19.8 3.3 19.8 4.6C19.8 5.8 18.8 6.7 17.6 6.7H5.4C4.2 6.7 3.2 5.8 3.2 4.6Z', fill: '@roll', stroke: '#0b0805', 'stroke-width': 1.05 },
        { d: 'M7.2 9.4H15.6M7.2 12H13.4M7.2 14.6H11.2', fill: 'none', stroke: '#4a3010', 'stroke-width': 1.15, 'stroke-linecap': 'round' },
        { d: 'M15.4 18.2L14 21.8L16.3 20.5L18.6 21.8L17.2 18.2Z', fill: '#991b1b', stroke: '#2b0606', 'stroke-width': 0.65, 'stroke-linejoin': 'round' },
        { tag: 'circle', cx: 16.3, cy: 15.8, r: 3.7, fill: '@wax', stroke: '#2b0606', 'stroke-width': 0.9 },
        { tag: 'circle', cx: 16.3, cy: 15.8, r: 2.3, fill: 'none', stroke: '#fde68a', 'stroke-width': 0.65, opacity: 0.85 },
        { d: 'M16.3 14.3L17.1 15.8L16.3 17.3L15.5 15.8Z', fill: '#fef08a' },
      ],
    },
    mana: {
      defs: [
        { tag: 'radialGradient', id: 'drop', cx: '38%', cy: '36%', r: '65%', stops: [['0%', '#e0f7ff'], ['30%', '#38bdf8'], ['72%', '#1d4ed8'], ['100%', '#172554']] },
        { tag: 'linearGradient', id: 'crescent', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#fef3c7'], ['45%', '#d4a448'], ['100%', '#6d4814']] },
      ],
      shapes: [
        { d: 'M3.2 12.6C3.4 18.1 7.2 22.1 12 22.1C16.8 22.1 20.6 18.1 20.8 12.6C19.3 15.8 16 17.7 12 17.7C8 17.7 4.7 15.8 3.2 12.6Z', fill: '@crescent', stroke: '#090b10', 'stroke-width': 1.05, 'stroke-linejoin': 'round' },
        { d: 'M12 2.1C12 2.1 17.9 8.9 17.9 13.3C17.9 16.6 15.3 19.1 12 19.1C8.7 19.1 6.1 16.6 6.1 13.3C6.1 8.9 12 2.1 12 2.1Z', fill: '@drop', stroke: '#081226', 'stroke-width': 1.15, 'stroke-linejoin': 'round' },
        { d: 'M12 4.1C13.6 6.4 16.2 10.1 16.2 13.2C16.2 15.6 14.3 17.5 12 17.5C9.7 17.5 7.8 15.6 7.8 13.2C7.8 10.1 10.4 6.4 12 4.1Z', fill: 'none', stroke: '#7dd3fc', 'stroke-width': 0.7, opacity: 0.75 },
        { d: 'M12 8.2L13.1 11.9L16.5 13L13.1 14.1L12 17.5L10.9 14.1L7.5 13L10.9 11.9Z', fill: '#e0f2fe', stroke: '#38bdf8', 'stroke-width': 0.5, 'stroke-linejoin': 'round' },
        { tag: 'circle', cx: 12, cy: 13, r: 1.35, fill: '#ffffff' },
        { d: 'M9.3 10.6C8.8 11.5 8.5 12.5 8.6 13.4', fill: 'none', stroke: '#ffffff', 'stroke-width': 1.15, 'stroke-linecap': 'round', opacity: 0.85 },
        { d: 'M12 18.7L13.2 20.1L12 21.5L10.8 20.1Z', fill: '#7dd3fc', stroke: '#0c223f', 'stroke-width': 0.6 },
      ],
    },
    ctaReady: {
      defs: [
        { tag: 'radialGradient', id: 'g', cx: '45%', cy: '38%', r: '60%', stops: [['0%', '#ecfdf5'], ['38%', '#34d399'], ['80%', '#0f5132'], ['100%', '#052e16']] },
      ],
      shapes: [
        { d: 'M12 1.8L15 9L22.2 12L15 15L12 22.2L9 15L1.8 12L9 9Z', fill: '@g', stroke: '#061a11', 'stroke-width': 1.1, 'stroke-linejoin': 'round' },
        { d: 'M12 4.6L13.7 10.3L19.4 12L13.7 13.7L12 19.4L10.3 13.7L4.6 12L10.3 10.3Z', fill: 'none', stroke: '#a7f3d0', 'stroke-width': 0.7, opacity: 0.9 },
        { tag: 'circle', cx: 12, cy: 12, r: 1.7, fill: '#ffffff' },
      ],
    },
    ctaWarn: {
      defs: [
        { tag: 'linearGradient', id: 'tri', x1: '0', y1: '0', x2: '0.4', y2: '1', stops: [['0%', '#fef08a'], ['45%', '#f59e0b'], ['100%', '#78350f']] },
      ],
      shapes: [
        { d: 'M12 2.4L21.5 19.8H2.5Z', fill: '@tri', stroke: '#0e0803', 'stroke-width': 1.15, 'stroke-linejoin': 'round' },
        { d: 'M12 5.4L18.9 18.1H5.1Z', fill: '#451a03', stroke: '#fde68a', 'stroke-width': 0.65, 'stroke-linejoin': 'round' },
        { d: 'M12 9.1V13.8', fill: 'none', stroke: '#fef08a', 'stroke-width': 2.0, 'stroke-linecap': 'round' },
        { tag: 'circle', cx: 12, cy: 16.4, r: 1.15, fill: '#fef08a' },
      ],
    },
    ctaBlocked: {
      defs: [
        { tag: 'radialGradient', id: 'red', cx: '40%', cy: '32%', r: '65%', stops: [['0%', '#fca5a5'], ['45%', '#b91c1c'], ['100%', '#3b0a0a']] },
      ],
      shapes: [
        { tag: 'circle', cx: 12, cy: 12, r: 9.5, fill: '@red', stroke: '#0e0505', 'stroke-width': 1.15 },
        { tag: 'circle', cx: 12, cy: 12, r: 7.4, fill: '#380d0c', stroke: '#fca5a5', 'stroke-width': 0.7, opacity: 0.85 },
        { d: 'M8.3 8.3L15.7 15.7M15.7 8.3L8.3 15.7', fill: 'none', stroke: '#fee2e2', 'stroke-width': 2.1, 'stroke-linecap': 'round' },
      ],
    },
    btnNew: {
      defs: [
        { tag: 'radialGradient', id: 'sp', cx: '45%', cy: '40%', r: '60%', stops: [['0%', '#ffffff'], ['42%', '#fde047'], ['85%', '#b45309'], ['100%', '#451a03']] },
      ],
      shapes: [
        { d: 'M11.5 2.4L13.7 9.1L20.4 11.3L13.7 13.5L11.5 20.2L9.3 13.5L2.6 11.3L9.3 9.1Z', fill: '@sp', stroke: '#140b03', 'stroke-width': 1.0, 'stroke-linejoin': 'round' },
        { d: 'M18.6 3.1L19.4 5.3L21.6 6.1L19.4 6.9L18.6 9.1L17.8 6.9L15.6 6.1L17.8 5.3Z', fill: '#fef08a', stroke: '#78350f', 'stroke-width': 0.45 },
        { tag: 'circle', cx: 5.5, cy: 18.2, r: 1.25, fill: '#fde68a' },
      ],
    },
    btnExit: {
      defs: [
        { tag: 'linearGradient', id: 'st', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#f8fafc'], ['55%', '#94a3b8'], ['100%', '#475569']] },
      ],
      shapes: [
        { d: 'M6.2 4.6L12 10.4L17.8 4.6L19.4 6.2L13.6 12L19.4 17.8L17.8 19.4L12 13.6L6.2 19.4L4.6 17.8L10.4 12L4.6 6.2Z', fill: '@st', stroke: '#090c12', 'stroke-width': 1.0, 'stroke-linejoin': 'round' },
      ],
    },
    btnGuide: {
      defs: [
        { tag: 'linearGradient', id: 'cov', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#93c5fd'], ['50%', '#2563eb'], ['100%', '#172554']] },
        { tag: 'linearGradient', id: 'pg', x1: '0', y1: '0', x2: '0', y2: '1', stops: [['0%', '#fef9c3'], ['60%', '#d6c08d'], ['100%', '#8a7144']] },
      ],
      shapes: [
        { d: 'M2.6 5.2C2.6 4.4 3.3 3.8 4.1 3.8H11.2V19.6H4.1C3.3 19.6 2.6 19 2.6 18.2Z', fill: '@cov', stroke: '#060b16', 'stroke-width': 1.05, 'stroke-linejoin': 'round' },
        { d: 'M21.4 5.2C21.4 4.4 20.7 3.8 19.9 3.8H12.8V19.6H19.9C20.7 19.6 21.4 19 21.4 18.2Z', fill: '@cov', stroke: '#060b16', 'stroke-width': 1.05, 'stroke-linejoin': 'round' },
        { d: 'M4.4 5.6H10.6V17.7H4.4Z', fill: '@pg', opacity: 0.92 },
        { d: 'M13.4 5.6H19.6V17.7H13.4Z', fill: '@pg', opacity: 0.85 },
        { d: 'M10.9 4.2H13.1V19.6H10.9Z', fill: '#eab308', stroke: '#451a03', 'stroke-width': 0.65 },
        { d: 'M5.8 8.3H9.3M5.8 11H9.3M5.8 13.7H8.5M14.7 8.3H18.2M14.7 11H18.2', fill: 'none', stroke: '#3b2c12', 'stroke-width': 1.05, 'stroke-linecap': 'round' },
        { d: 'M16.1 17.6V21.7L17.4 20.6L18.7 21.7V17.6Z', fill: '#dc2626', stroke: '#450a0a', 'stroke-width': 0.55 },
      ],
    },
    clearCross: {
      shapes: [
        { d: 'M6.5 6.5L17.5 17.5M17.5 6.5L6.5 17.5', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linecap': 'round' },
      ],
    },
    rerollName: {
      shapes: [
        { d: 'M4.5 9.5a7.5 7.5 0 0 1 13.2-3.4L19.5 4v5.5H14l2.1-2.1A5.2 5.2 0 0 0 6.8 10', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
        { d: 'M19.5 14.5a7.5 7.5 0 0 1-13.2 3.4L4.5 20v-5.5H10l-2.1 2.1a5.2 5.2 0 0 0 9.3-2.6', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
      ],
    },
    clock: {
      defs: [
        { tag: 'linearGradient', id: 'rim', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#f3e8ff'], ['45%', '#a855f7'], ['100%', '#3b0764']] },
        { tag: 'radialGradient', id: 'dial', cx: '40%', cy: '35%', r: '65%', stops: [['0%', '#3b1764'], ['70%', '#1b0d30'], ['100%', '#0d0618']] },
      ],
      shapes: [
        { d: 'M9.6 2.5H14.4M12 2.5V4.8', fill: 'none', stroke: '#f5d451', 'stroke-width': 1.8, 'stroke-linecap': 'round' },
        { tag: 'circle', cx: 12, cy: 13.2, r: 8.6, fill: '@rim', stroke: '#090512', 'stroke-width': 1.15 },
        { tag: 'circle', cx: 12, cy: 13.2, r: 6.7, fill: '@dial', stroke: '#d8b4fe', 'stroke-width': 0.65 },
        { d: 'M12 8.4V13.2L15.4 15.2', fill: 'none', stroke: '#f3e8ff', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
        { tag: 'circle', cx: 12, cy: 13.2, r: 1.15, fill: '#fde68a' },
      ],
    },
    chance: {
      defs: [
        { tag: 'linearGradient', id: 'hex', x1: '0', y1: '0', x2: '1', y2: '1', stops: [['0%', '#fef08a'], ['45%', '#c9963b'], ['100%', '#593b12']] },
        { tag: 'radialGradient', id: 'in', cx: '40%', cy: '35%', r: '65%', stops: [['0%', '#4a3312'], ['75%', '#211507'], ['100%', '#110a03']] },
      ],
      shapes: [
        { d: 'M12 2L20.3 6.8V17.2L12 22L3.7 17.2V6.8Z', fill: '@hex', stroke: '#0b0804', 'stroke-width': 1.15, 'stroke-linejoin': 'round' },
        { d: 'M12 4.1L18.4 7.8V16.2L12 19.9L5.6 16.2V7.8Z', fill: '@in', stroke: '#fde68a', 'stroke-width': 0.65, 'stroke-linejoin': 'round' },
        { tag: 'circle', cx: 9.1, cy: 9.3, r: 1.55, fill: '#fef08a' },
        { tag: 'circle', cx: 14.9, cy: 14.7, r: 1.55, fill: '#fef08a' },
        { d: 'M15.4 8.6L8.6 15.4', fill: 'none', stroke: '#f5d451', 'stroke-width': 1.7, 'stroke-linecap': 'round' },
      ],
    },
    power: {
      defs: [
        { tag: 'radialGradient', id: 'red', cx: '45%', cy: '38%', r: '62%', stops: [['0%', '#fecaca'], ['42%', '#ef4444'], ['85%', '#991b1b'], ['100%', '#450a0a']] },
      ],
      shapes: [
        { d: 'M12 1.9L15.1 8.6L22.2 9.7L17 14.7L18.3 21.8L12 18.4L5.7 21.8L7 14.7L1.8 9.7L8.9 8.6Z', fill: '@red', stroke: '#0e0505', 'stroke-width': 1.1, 'stroke-linejoin': 'round' },
        { d: 'M12 6.2L13.7 10.2L17.9 10.9L14.8 13.8L15.6 18L12 15.9L8.4 18L9.2 13.8L6.1 10.9L10.3 10.2Z', fill: '#fca5a5', stroke: '#fef2f2', 'stroke-width': 0.5, 'stroke-linejoin': 'round' },
        { tag: 'circle', cx: 12, cy: 12.6, r: 1.45, fill: '#fff7ed' },
      ],
    },
  });
  let svgUidCounter = 0;

  // Reset order sets High before Low so paired min/max clamping always lands cleanly at 1.
  const RESET_FIELD_ORDER = Object.freeze([
    'durationBase', 'durationMod', 'durationPerLevel',
    'chanceBase', 'chanceMod', 'chancePerLevel',
    'magnitudeBaseHigh', 'magnitudeBaseLow',
    'magnitudeLevelHigh', 'magnitudeLevelBase',
    'magnitudePerLevel',
  ]);

  // Fallback translations for standard SpellMaker English box text when native rows() isn't localized.
  const BOX_EN_TO_RU = Object.freeze({
    'You do not have enough gold': 'У вас недостаточно золота,',
    'to purchase this spell.': 'чтобы купить это заклинание.',
    'You do not have a spellbook': 'У вас нет книги заклинаний,',
    'with which to inscribe this spell.': 'чтобы вписать это заклинание.',
    'You must choose a name to call': 'Выберите название для этого',
    'this spell in your grimoire.': 'заклинания в своём гримуаре.',
    'The spell has been inscribed': 'Заклинание вписано',
    'in your grimoire.': 'в ваш гримуар.',
    'You can choose no more than three': 'Для одного заклинания можно',
    'effects for any spell.': 'выбрать не более трёх эффектов.',
    'How would you like to alter the spell?': 'Как бы вы хотели изменить заклинание?',
    'You must add at least one effect to this spell.': 'Вы должны добавить хотя бы один эффект к этому заклинанию.',
  });

  const instances = new WeakMap();
  const reported = new Set();
  let styleEl = null;
  let globalTipListenersBound = false;
  let activeGlobalState = null;

  function isRu() {
    return root.__DFO_MOD_CFG__?.ru?.on === true;
  }

  function DataApi() {
    return root.__dfoSpellmakerData || null;
  }

  function CatalogApi() {
    return root.__dfoSpellmakerCatalog || null;
  }

  function VizApi() {
    return root.DFO_SPELLMAKER_VIZ || null;
  }

  function IconRegistryApi() {
    return root.__dfoSpellIconRegistry || null;
  }

  function report(tag, err) {
    if (reported.has(tag)) return;
    reported.add(tag);
    root.console?.warn?.('[DFO spellmaker] ' + tag, err);
  }

  function ensureStyle() {
    if (styleEl && styleEl.isConnected) return;
    const head = doc.head || doc.documentElement;
    if (!head) return;
    let st = doc.getElementById?.(STYLE_ID);
    if (!st) {
      st = doc.createElement('style');
      st.id = STYLE_ID;
      st.textContent = SCOPED_CSS;
      head.append(st);
    } else {
      // Ensure Spellmaker overrides sit after dfo-service-windows in cascade order
      head.append(st);
    }
    styleEl = st;
  }

  function fmtNum(val) {
    const num = Math.max(0, Math.trunc(Number(val) || 0));
    const sep = isRu() ? ' ' : ',';
    return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  }

  function el(tag, cls, text = null) {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }

  function makeSvgIcon(kind, cls = 'dfo-sm-res-ico') {
    const ns = 'http://www.w3.org/2000/svg';
    const mk = (tag) => (doc.createElementNS ? doc.createElementNS(ns, tag) : doc.createElement(tag));
    const svg = mk('svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', cls);
    svg.setAttribute('aria-hidden', 'true');
    const spec = RESOURCE_SVG[kind] || RESOURCE_SVG.gold;
    const prefix = `dfosm${++svgUidCounter}_`;
    const resolve = (v) => (typeof v === 'string' && v.startsWith('@') ? `url(#${prefix}${v.slice(1)})` : String(v));
    if (Array.isArray(spec.defs) && spec.defs.length) {
      const defsEl = mk('defs');
      for (const g of spec.defs) {
        const grad = mk(g.tag || 'linearGradient');
        for (const [k, v] of Object.entries(g)) {
          if (k === 'tag' || k === 'stops') continue;
          grad.setAttribute(k, k === 'id' ? prefix + v : String(v));
        }
        for (const [offset, color, opacity] of g.stops || []) {
          const st = mk('stop');
          st.setAttribute('offset', offset);
          st.setAttribute('stop-color', color);
          if (opacity != null) st.setAttribute('stop-opacity', String(opacity));
          grad.append(st);
        }
        defsEl.append(grad);
      }
      svg.append(defsEl);
    }
    const shapes = Array.isArray(spec) ? spec : (spec.shapes || []);
    for (const def of shapes) {
      const node = mk(def.tag || 'path');
      for (const [k, v] of Object.entries(def)) {
        if (k !== 'tag') node.setAttribute(k, resolve(v));
      }
      svg.append(node);
    }
    return svg;
  }

  function targetIconSvg(idx) {
    const ns = 'http://www.w3.org/2000/svg';
    const mk = (tag) => (doc.createElementNS ? doc.createElementNS(ns, tag) : doc.createElement(tag));
    const svg = mk('svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'dfo-sm-tgt-ico');
    svg.setAttribute('aria-hidden', 'true');
    const paths = [
      [{ tag: 'circle', cx: 12, cy: 12, r: 3.8, fill: 'currentColor' }, { tag: 'circle', cx: 12, cy: 12, r: 8.5, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-dasharray': '3.2 2.2' }],
      [{ d: 'M5.5 14.5V8.7a1.3 1.3 0 012.6 0v3.3h1.3V6a1.3 1.3 0 012.6 0v6h1.3V6.8a1.3 1.3 0 012.6 0v5.8l2-1.6a1.3 1.3 0 011.7 2l-4 5.5H7.9L5.5 14.5z', fill: 'currentColor' }],
      [{ d: 'M3.8 20.2L19.2 4.8M19.2 4.8H11.4M19.2 4.8V12.6', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }],
      [{ tag: 'circle', cx: 12, cy: 12, r: 3.0, fill: 'currentColor' }, { tag: 'circle', cx: 12, cy: 12, r: 6.5, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }, { tag: 'circle', cx: 12, cy: 12, r: 9.8, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.3, 'stroke-dasharray': '3.8 2.4' }],
      [{ d: 'M12 2.2L14.4 9.2L21.8 12L14.4 14.8L12 21.8L9.6 14.8L2.2 12L9.6 9.2Z', fill: 'currentColor' }],
    ][idx] || [];
    for (const def of paths) {
      const node = mk(def.tag || 'path');
      for (const [k, v] of Object.entries(def)) {
        if (k !== 'tag') node.setAttribute(k, String(v));
      }
      svg.append(node);
    }
    return svg;
  }

  function playClick(law) {
    try {
      if (law?.audio?.playOneShot && law?.clips?.ButtonClick != null) {
        law.audio.playOneShot(law.clips.ButtonClick, 1);
      }
    } catch {}
  }

  function freshSeed() {
    return ((Math.random() * 0x7fffffff) | 0) || 1;
  }

  function getGoldBreakdown(w) {
    const ent = w?.entity;
    const purse = Math.max(0, Math.trunc(Number(ent?.goldPieces) || 0));
    const items = Array.isArray(ent?.items) ? ent.items : [];
    let locGold = 0;
    let locCount = 0;
    for (const it of items) {
      if (it && it.templateIndex === 275) {
        locGold += Math.max(0, Math.trunc(Number(it.value) || 0));
        locCount += 1;
      }
    }
    // Real game LOe/ROe validation & spending (hh/gh) counts both purse goldPieces and Letters of Credit
    // (templateIndex === 275), whereas vanilla yH.labels().money only reports mh(entity) (goldPieces).
    const spendable = purse + locGold;
    let labelMoney = NaN;
    try {
      if (typeof w?.labels === 'function') labelMoney = Number(w.labels()?.money);
    } catch {}
    const total = Number.isFinite(labelMoney) && labelMoney > spendable
      ? Math.trunc(labelMoney)
      : spendable;
    return { total, purse, locGold, locCount };
  }

  function getSlotCost(slot, entity, law) {
    if (!slot || slot.type == null || slot.type < 0) return { gold: 0, sp: 0 };
    if (typeof law?.effectCost === 'function') {
      try {
        const c = law.effectCost(slot, entity);
        if (c && Number.isFinite(c.gold) && Number.isFinite(c.sp)) {
          return { gold: Math.trunc(c.gold), sp: Math.trunc(c.sp) };
        }
      } catch {}
    }
    const Data = DataApi();
    return Data ? Data.calcEffectCost(slot, entity) : { gold: 0, sp: 0 };
  }

  function makeDefaultSettings(law) {
    if (typeof law?.defaultSettings === 'function') {
      try {
        const s = law.defaultSettings();
        if (s && typeof s === 'object') return { ...s };
      } catch {}
    }
    const Data = DataApi();
    return Data ? Data.defaultSettings() : {
      durationBase: 1, durationMod: 1, durationPerLevel: 1,
      chanceBase: 1, chanceMod: 1, chancePerLevel: 1,
      magnitudeBaseLow: 1, magnitudeBaseHigh: 1,
      magnitudeLevelBase: 1, magnitudeLevelHigh: 1, magnitudePerLevel: 1,
    };
  }

  function resolveLiveEffectRecord(effect, law) {
    if (!effect) return null;
    const key = effect.key || `${effect.type},${(effect.subType ?? 255) & 255}`;
    if (Array.isArray(law?.effects)) {
      const live = law.effects.find((e) => e && e.key === key);
      if (live) return live;
    }
    return DataApi()?.EFFECT_BY_KEY?.get(key) || effect;
  }

  function evalCreationState(w) {
    const ru = isRu();
    const ent = w?.entity || {};
    const hasSpellbook = Array.isArray(ent.items)
      && ent.items.some((i) => i && i.group === 'MiscItems' && i.templateIndex === 132);
    const used = typeof w?.usedSlots === 'function' ? w.usedSlots() : (w?.slots || []).filter(Boolean);
    const effectsCount = used.length;
    const hasName = Boolean(w?.name && String(w.name).trim());
    const gold = getGoldBreakdown(w);
    const goldHeld = gold.total;
    const maxMana = Math.max(0, Math.trunc(Number(ent.maxMagicka ?? w?.labels?.().maxSpellPoints ?? 0)));
    const curMana = Math.max(0, Math.trunc(Number(ent.magicka ?? maxMana)));
    const goldCost = Math.max(0, Math.trunc(Number(w?.totalGoldCost) || 0));
    const spCost = Math.max(0, Math.trunc(Number(w?.totalSpellPointCost) || 0));
    const hasGold = goldHeld >= goldCost;
    const hasValidTarget = effectsCount === 0 || (w?.allowedTargets ?? 31) !== 0;

    const reasons = [];
    if (!hasSpellbook) reasons.push(ru ? 'Нет книги заклинаний в сумке' : 'No spellbook in pack');
    if (effectsCount === 0) reasons.push(ru ? 'Не добавлен ни один эффект' : 'Add at least one effect');
    if (!hasValidTarget) reasons.push(ru ? 'Несовместимые цели эффектов («На себя» + «Не на себя»)' : 'Incompatible effect targets (Self-only + Non-self)');
    if (!hasName) reasons.push(ru ? 'Не указано название заклинания' : 'Enter a spell name');
    if (effectsCount > 0 && !hasGold) reasons.push(ru ? 'Недостаточно золота для оплаты' : 'Not enough gold');

    const canBuy = reasons.length === 0;
    const enoughCastMana = effectsCount === 0 || spCost <= curMana;
    const status = !canBuy ? 'blocked' : !enoughCastMana ? 'warn-mana' : 'ready';
    return {
      status,
      canBuy,
      enoughCastMana,
      hasSpellbook,
      hasValidTarget,
      effectsCount,
      hasName,
      hasGold,
      goldHeld,
      goldPurse: gold.purse,
      goldLoc: gold.locGold,
      goldLocCount: gold.locCount,
      curMana,
      maxMana,
      goldCost,
      spCost,
      reasons,
    };
  }

  // ── Status Tooltip Controller (mounted inside portHost so teardown cleans automatically) ──
  function hideStatusTip(state) {
    if (state?.activeTip) {
      try { state.activeTip.remove(); } catch {}
      state.activeTip = null;
    }
  }

  function ensureGlobalTipListeners() {
    if (globalTipListenersBound || !doc?.addEventListener) return;
    globalTipListenersBound = true;
    doc.addEventListener('pointerdown', () => hideStatusTip(activeGlobalState), true);
    doc.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideStatusTip(activeGlobalState); }, true);
    root.addEventListener?.('blur', () => hideStatusTip(activeGlobalState));
    doc.addEventListener('visibilitychange', () => {
      if (activeGlobalState) {
        activeGlobalState.vizLastTs = 0;
        activeGlobalState.vizLastRenderTs = 0;
      }
      if (doc.hidden) hideStatusTip(activeGlobalState);
    });
  }

  function attachStatusTip(state, anchor, getTitle, getRows) {
    if (!anchor?.addEventListener) return;
    ensureGlobalTipListeners();
    const show = () => {
      const host = (state.portHost && state.portHost.isConnected) ? state.portHost : doc.body;
      if (!anchor.isConnected || !host) return;
      hideStatusTip(state);
      const rows = getRows() || [];
      if (!rows.length) return;
      const rawTitle = typeof getTitle === 'function' ? getTitle() : getTitle;
      const tip = el('div', 'dfo-status-tip dfo-sm-tip');
      tip.setAttribute('role', 'tooltip');

      const head = el('div', 'dfo-st-head');
      if (rawTitle && typeof rawTitle === 'object') {
        if (rawTitle.icon) head.append(makeSvgIcon(rawTitle.icon, 'dfo-st-head-ico'));
        head.append(el('span', null, String(rawTitle.text || '')));
      } else {
        head.textContent = String(rawTitle || '');
      }

      const body = el('div', 'dfo-st-body');
      for (const r of rows) {
        if (r.kind === 'sep') {
          body.append(el('div', 'dfo-st-sep'));
        } else if (r.kind === 'cards') {
          const cards = el('div', 'dfo-st-cards');
          for (const item of r.items || []) {
            const card = el('div', `dfo-st-card${item.tone ? ` is-${item.tone}` : ''}`);
            const left = el('div', 'dfo-st-card-l');
            if (item.icon) left.append(makeSvgIcon(item.icon, 'dfo-st-card-ico'));
            left.append(el('span', 'dfo-st-card-k', item.label));
            card.append(left, el('span', 'dfo-st-card-v', item.value));
            cards.append(card);
          }
          body.append(cards);
        } else if (r.kind === 'info') {
          const box = el('div', 'dfo-st-info');
          for (const f of r.fields || []) {
            const fld = el('div', 'dfo-st-field');
            fld.append(el('div', 'dfo-st-fk', f.label), el('div', 'dfo-st-fv', f.value));
            box.append(fld);
          }
          body.append(box);
        } else {
          const cls = ['dfo-st-line', r.center ? 'is-center' : '', r.tone ? `is-${r.tone}` : ''].filter(Boolean).join(' ');
          body.append(el('div', cls, r.text));
        }
      }

      tip.append(head, body);
      tip._anchor = anchor;
      tip.style.visibility = 'hidden';
      host.append(tip);
      state.activeTip = tip;
      activeGlobalState = state;

      const ar = anchor.getBoundingClientRect();
      const tr = tip.getBoundingClientRect();
      const vw = root.innerWidth || doc.documentElement?.clientWidth || 1920;
      const vh = root.innerHeight || doc.documentElement?.clientHeight || 1080;
      const left = Math.round(Math.min(Math.max(8, ar.left), Math.max(8, vw - tr.width - 8)));
      const above = ar.top - tr.height - 8;
      const top = Math.round(above >= 8 ? above : Math.min(Math.max(8, ar.bottom + 8), Math.max(8, vh - tr.height - 8)));
      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
      tip.style.visibility = 'visible';
    };
    const hideMatch = () => {
      if (state.activeTip?._anchor === anchor) hideStatusTip(state);
    };
    anchor.addEventListener('mouseenter', show);
    anchor.addEventListener('focusin', show);
    anchor.addEventListener('mouseleave', hideMatch);
    anchor.addEventListener('focusout', hideMatch);
  }

  // ── 3D Modular Spell Visualization helpers (driven directly inside WB paint(cv)) ──
  function ensureVizCtrl(state) {
    const VIZ = VizApi();
    if (!VIZ) return null;
    if (!state.vizCtrl) {
      state.vizCtrl = VIZ.createController({ initialTime: 0.4, firstBurstAt: 3.0 });
    }
    return state.vizCtrl;
  }

  function buildVizSlots(w) {
    const Data = DataApi();
    if (!w || !Array.isArray(w.slots) || !Data) return [null, null, null];
    const elemId = Number.isFinite(w.element) ? w.element : 4;
    return [0, 1, 2].map((idx) => {
      const slot = w.slots[idx];
      if (!slot) return null;
      const spec = Data.getEffectSpec(slot.key);
      const schoolId = spec?.schoolId ?? 22;
      return schoolId === 22 ? { school: 22, element: elemId } : schoolId;
    });
  }

  function getCachedVizBundle(w, state) {
    if (!w || !Array.isArray(w.slots)) {
      return { sig: 'empty', vizSlots: [null, null, null], hasFx: false, analysis: null };
    }
    const elemId = Number.isFinite(w.element) ? w.element : 4;
    const s0 = w.slots[0]?.key || '';
    const s1 = w.slots[1]?.key || '';
    const s2 = w.slots[2]?.key || '';
    const sig = `${elemId}|${s0}|${s1}|${s2}`;
    if (state.vizCachedSig === sig && state.vizCachedAnalysis) {
      return {
        sig,
        vizSlots: state.vizCachedSlots,
        hasFx: state.vizCachedHasFx,
        analysis: state.vizCachedAnalysis,
      };
    }
    const vizSlots = buildVizSlots(w);
    const hasFx = vizSlots[0] !== null || vizSlots[1] !== null || vizSlots[2] !== null;
    const VIZ = VizApi();
    const analysis = VIZ ? VIZ.analyzeSlots(vizSlots) : null;
    state.vizCachedSig = sig;
    state.vizCachedSlots = vizSlots;
    state.vizCachedHasFx = hasFx;
    state.vizCachedAnalysis = analysis;
    return { sig, vizSlots, hasFx, analysis };
  }

  function syncVizSlotsState(w, state, opts = null) {
    const ctrl = ensureVizCtrl(state);
    if (!ctrl || !w) return;
    const { sig, hasFx } = getCachedVizBundle(w, state);
    const prevSig = state.vizLastSlotSig;
    const snap = Boolean(opts && opts.snapCover);

    if (snap) {
      ctrl.setOpenAmount(hasFx ? 1 : 0, hasFx);
    } else {
      ctrl.setHasEffects(hasFx);
      if (ctrl.isPaused()) {
        ctrl.setOpenAmount(hasFx ? 1 : 0, hasFx);
      } else if (hasFx && prevSig && prevSig !== sig && ctrl.getOpenAmount() > 0.85) {
        ctrl.triggerBurst(2);
      }
    }
    state.vizLastSlotSig = sig;
    state.vizDormantRendered = false;
  }

  function buildVizMotionHint(analysis, ru) {
    if (!analysis) return '';
    const n = analysis.activeCount || 0;
    const slots = analysis.slots || [];
    const parts = [];
    const hasDestr = slots.some((s) => s && s.id === 22);
    if (hasDestr && n >= 2) {
      let dHint = n >= 3 ? (ru ? 'Вращение ×3' : 'Orbit ×3') : (ru ? 'Вращение ×2' : 'Orbit ×2');
      if (n >= 3) {
        const ringFireMagic = [slots[1], slots[2]].some((s) => s && s.id === 22 && (s.elementKey === 'fire' || s.elementKey === 'magic'));
        if (ringFireMagic) dHint += ru ? ' + Болгарка' : ' + Spark Ring';
        const s0 = slots[0];
        if (s0 && s0.id === 22 && s0.elementKey !== 'shock') dHint += ru ? ' + Облако' : ' + Cloud';
      }
      parts.push(dHint);
    }
    const r0 = Boolean(slots[0] && slots[0].id === 23);
    const r1 = Boolean(slots[1] && slots[1].id === 23);
    const r2 = Boolean(slots[2] && slots[2].id === 23);
    const rCount = (r0 ? 1 : 0) + (r1 ? 1 : 0) + (r2 ? 1 : 0);
    if (r0 && r1 && r2) parts.push(ru ? '3 Обруча (3×/2.5×/2×) · Свет +30%' : '3 Hoops (3×/2.5×/2×) · Light +30%');
    else if (r1 && r2) parts.push(ru ? 'Усил. обруч +45° (3×/2×) · Свет +20%' : 'Boosted Hoop +45° · Light +20%');
    else if (rCount > 0) parts.push((ru ? 'Свет +' : 'Light +') + (rCount * 10) + '%' + (r0 ? (ru ? ' + Тени' : ' + Shadows') : ''));

    const i0 = Boolean(slots[0] && slots[0].id === 24);
    const i1 = Boolean(slots[1] && slots[1].id === 24);
    const i2 = Boolean(slots[2] && slots[2].id === 24);
    if (i0 && i1 && i2) parts.push(ru ? 'Икосаэдр 2× + Икосфера 42 + Годрейсы' : 'Icosahedron 2× + Icosphere 42 + Godrays');
    else if (!i0 && i1 && i2) parts.push(ru ? 'Икосаэдр + 2 Полигон. обруча' : 'Icosahedron + 2 Polygonal Hoops');
    else if (i1 || i2) parts.push(ru ? 'Икосаэдр 12в' : 'Icosahedron 12v');

    const a0 = Boolean(slots[0] && slots[0].id === 25);
    const a1 = Boolean(slots[1] && slots[1].id === 25);
    const a2 = Boolean(slots[2] && slots[2].id === 25);
    if (a0 && a1 && a2) parts.push(ru ? 'Клетка (8 штырей) + 2 Кольца + Годрейсы' : '8-Spine Cage + 2 Rings + Polar Godrays');
    else if (a1 || a2) parts.push(ru ? 'Панцирь-обруч (3 дуги)' : 'Carapace Hoop (3 Arcs)');

    const t0 = Boolean(slots[0] && slots[0].id === 26);
    const t1 = Boolean(slots[1] && slots[1].id === 26);
    const t2 = Boolean(slots[2] && slots[2].id === 26);
    if (t0 && t1 && t2) parts.push(ru ? 'Проекции (≤6) + 2 Обруча схем + Годрейсы' : 'Projections (≤6) + 2 Schematic Hoops + Godrays');
    else if (t0 && t1) parts.push(ru ? 'Сфер. проекции (≤3)' : 'Sphere Projections (≤3)');
    else if (!t0 && t1 && t2) parts.push(ru ? '2 Каркасных обруча схем' : '2 Schematic Hoops');
    else if (t1 || t2) parts.push(ru ? 'Каркасный обруч схем' : 'Schematic Hoop');

    const m0 = Boolean(slots[0] && slots[0].id === 27);
    const m1 = Boolean(slots[1] && slots[1].id === 27);
    const m2 = Boolean(slots[2] && slots[2].id === 27);
    if (m0 && m1 && m2) parts.push(ru ? 'Проекции (3с) + Анти-свет + 3 Обруча букв' : 'Occult Seals (3s) + Anti-Light + 3 Daedric Hoops');
    else if (m0 && m1) parts.push(ru ? 'Оккульт. проекции (3с) + Матрица даэдрика' : 'Occult Seals (3s) + Daedric Matrix');
    else {
      if (!m0 && m1) parts.push(ru ? 'Облако капель + Руны' : 'Droplet Cloud + Runes');
      if (m2) parts.push(ru ? 'Обруч даэдрика' : 'Daedric Hoop');
    }
    return parts.join(' · ');
  }

  function formatVizTagInfo(analysis, ru) {
    if (!analysis || analysis.activeCount === 0) {
      return { text: ru ? 'Покой · 0%' : 'Dormant · 0%', border: '#5e5543', color: '#b7a98a' };
    }
    const lead = analysis.slot1School || analysis.active[0]?.school;
    const border = lead?.primary || '#d5b26e';
    const color = lead?.core || '#f6e7b0';
    if (analysis.distinctCount >= 2) {
      return { text: ru ? `Синтез · ${analysis.distinctCount} шк.` : `Synthesis · ${analysis.distinctCount}`, border, color };
    }
    const only = analysis.uniqueSchools[0];
    const name = only ? (ru ? only.ru : only.en) : '';
    const elName = only?.element ? (ru ? only.element.ru : only.element.en) : '';
    if (analysis.activeCount === 3) {
      return { text: elName ? `${ru ? 'Триада' : 'Triad'} · ${elName}` : `${ru ? 'Триада' : 'Triad'} · ${name}`, border, color };
    }
    return { text: elName ? `${name} · ${elName}` : name, border, color };
  }

  function syncVizTag(state, analysis) {
    const tag = state.mainRefs?.vizTag;
    if (!tag) return;
    const info = formatVizTagInfo(analysis, isRu());
    if (state.vizTagText !== info.text) {
      state.vizTagText = info.text;
      tag.textContent = info.text;
    }
    if (state.vizTagBorder !== info.border) {
      state.vizTagBorder = info.border;
      tag.style.borderColor = info.border;
    }
    if (state.vizTagColor !== info.color) {
      state.vizTagColor = info.color;
      tag.style.color = info.color;
    }
  }

  function renderSpellVizFrame(w, state, cv, dtSec) {
    if (!cv || !cv.isConnected) return;
    const VIZ = VizApi();
    const ctrl = ensureVizCtrl(state);
    if (!VIZ || !ctrl) return;
    const W = VIZ.DEFAULT_WIDTH || 350;
    const H = VIZ.DEFAULT_HEIGHT || 281;
    let sizeChanged = false;
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
      sizeChanged = true;
    }
    const { hasFx, analysis } = getCachedVizBundle(w, state);
    if (dtSec > 0) ctrl.update(dtSec, hasFx);
    const flip = ctrl.getFlipSnapshot();
    const openAmount = ctrl.getOpenAmount();
    const isDormant = !hasFx && openAmount <= 0.001 && !flip.inBurst && !(flip.leaves && flip.leaves.length > 0);
    if (isDormant && state.vizDormantRendered && state.vizLastCanvas === cv && !sizeChanged) {
      state.vizLastAnalysis = analysis;
      syncVizTag(state, analysis);
      return;
    }
    const ctx = cv.getContext?.('2d');
    if (!ctx) return;
    let res = null;
    try {
      res = VIZ.renderScene(ctx, W, H, {
        tSec: ctrl.getTime(),
        flipSnapshot: flip,
        analysis,
        leftTemplate: 'auto',
        rightTemplate: 'auto',
        openAmount,
      });
    } catch (err) {
      report('viz.render', err);
      if (typeof ctx.reset === 'function') ctx.reset();
    }
    state.vizLastCanvas = cv;
    state.vizDormantRendered = isDormant;
    state.vizLastAnalysis = analysis;
    state.vizLastSpreadPair = res?.spreadPair || null;
    syncVizTag(state, analysis);
  }

  function isVizOccluded(w, state) {
    if (doc.hidden) return true;
    if (w?.editor || w?.picker) return true;
    if (root.__dfoSpellmakerPicker?.isOpen?.()) return true;
    if (root.__dfoSpellmakerGuide?.isOpen?.()) return true;
    if (state.dlgShell && state.dlgShell.isConnected) return true;
    return Boolean(state.vizCtrl?.isPaused?.());
  }

  // ── Auto-Icon & Modular Bilingual NameGen Logic ──
  function maybeAutoPickIcon(w, state, effect) {
    if (state.autoIconApplied || !effect) return false;
    const Data = DataApi();
    const reg = IconRegistryApi();
    if (!Data || !reg) return false;
    const spec = Data.getEffectSpec(effect.key);
    const schoolId = spec?.schoolId ?? 22;
    const picked = reg.pickRandomBySchool(schoolId, w.icon);
    if (picked) {
      w.icon = reg.resolveGameIconIndex(picked.value);
    }
    state.autoIconApplied = true;
    return Boolean(picked);
  }

  function refreshAutoName(w, state, rollSeed = false) {
    if (state.nameManuallyEdited) return;
    const used = typeof w.usedSlots === 'function' ? w.usedSlots() : (w.slots || []).filter(Boolean);
    if (used.length === 0) {
      w.name = '';
      state.nameAutoGenerated = false;
      return;
    }
    if (rollSeed) {
      state.nameSeed = ((Math.imul(state.nameSeed || 1, 1664525) + 1013904223) ^ ((Math.random() * 0x7fffffff) | 0)) >>> 0;
    }
    const gen = root.__dfoSpellmakerNameGen?.generate?.({
      slots: w.slots,
      element: w.element,
      lang: isRu() ? 'ru' : 'en',
      seed: state.nameSeed,
      Data: DataApi(),
    });
    if (gen) {
      w.name = gen.slice(0, 24);
      state.nameAutoGenerated = true;
    }
  }

  function rerollAutoName(w, state) {
    const used = typeof w.usedSlots === 'function' ? w.usedSlots() : (w.slots || []).filter(Boolean);
    if (used.length === 0) return;
    state.nameManuallyEdited = false;
    refreshAutoName(w, state, true);
    if (state.mainRefs?.nameInput) {
      state.mainRefs.nameInput.value = w.name || '';
    }
    syncMainLight(w, state);
  }

  function addEffectToSlot(w, state, effect, preferredSlotIdx = null) {
    if (!effect) return false;
    const liveEff = resolveLiveEffectRecord(effect, state.law);
    if (!liveEff) return false;
    const idx = (preferredSlotIdx != null && preferredSlotIdx >= 0 && preferredSlotIdx < 3 && !w.slots[preferredSlotIdx])
      ? preferredSlotIdx
      : (typeof w.firstFreeSlot === 'function' ? w.firstFreeSlot() : w.slots.findIndex((s) => !s));
    if (idx === -1) return false;
    w.slots[idx] = {
      type: liveEff.type,
      subType: liveEff.subType,
      key: liveEff.key,
      settings: makeDefaultSettings(state.law),
    };
    w._updateAllowedButtons?.();
    maybeAutoPickIcon(w, state, liveEff);
    refreshAutoName(w, state, true);
    syncVizSlotsState(w, state);
    w.editOrDeleteSlot = idx;
    w._openEditor?.(idx);
    state.structSig = '';
    forceRefresh(w, state);
    return true;
  }

  function removeSlot(w, state, slotIdx) {
    if (slotIdx < 0 || slotIdx > 2 || !w.slots?.[slotIdx]) return;
    w.slots[slotIdx] = null;
    if (w.editOrDeleteSlot === slotIdx) w.editOrDeleteSlot = -1;
    const used = typeof w.usedSlots === 'function' ? w.usedSlots() : w.slots.filter(Boolean);
    if (state.craftedOnce && used.length === 0) {
      state.autoIconApplied = false;
      state.craftedOnce = false;
      state.nameManuallyEdited = false;
    }
    w._updateAllowedButtons?.();
    refreshAutoName(w, state, true);
    syncVizSlotsState(w, state);
    state.structSig = '';
    forceRefresh(w, state);
  }

  function blurMainNameInput(state) {
    const inp = state?.mainRefs?.nameInput;
    if (inp && doc.activeElement === inp) {
      try { inp.blur(); } catch {}
    }
  }

  function openPickerModal(w, state, targetSlotIdx = null, pickerOpts = {}) {
    blurMainNameInput(state);
    const free = typeof w.firstFreeSlot === 'function' ? w.firstFreeSlot() : w.slots.findIndex((s) => !s);
    if (free === -1) {
      if (typeof w._box === 'function') w._box(1707);
      else if (typeof w._sayText === 'function') {
        const lines = DataApi()?.BOX_TEXT?.[isRu() ? 'ru' : 'en']?.[1707];
        w._sayText(Array.isArray(lines) ? lines.join(' ') : 'Max 3 effects.');
      }
      forceRefresh(w, state);
      return;
    }
    if (!root.__dfoSpellmakerPicker?.open) {
      state.nativeAddEffect?.call(w);
      return;
    }
    const slotIdx = (targetSlotIdx != null && targetSlotIdx >= 0 && targetSlotIdx < 3 && !w.slots[targetSlotIdx])
      ? targetSlotIdx
      : free;
    state.preferredSlotIdx = slotIdx;
    hideStatusTip(state);
    root.__dfoSpellmakerPicker.open({
      doc,
      entity: w.entity,
      isRu: isRu(),
      slotIndex: slotIdx,
      mountHost: state.portHost,
      initialSchool: pickerOpts.initialSchool ?? 'all',
      initialQuery: pickerOpts.initialQuery ?? '',
      initialEffectKey: pickerOpts.initialEffectKey ?? null,
      onPick: (effect) => {
        playClick(state.law);
        const pref = state.preferredSlotIdx;
        state.preferredSlotIdx = null;
        addEffectToSlot(w, state, effect, pref);
      },
      onCancel: () => {
        state.preferredSlotIdx = null;
      },
    });
  }

  function openGuideModal(state) {
    blurMainNameInput(state);
    hideStatusTip(state);
    playClick(state.law);
    root.__dfoSpellmakerGuide?.open?.({
      doc,
      isRu: isRu(),
      mountHost: state.portHost,
    });
  }

  function teardownOverlays(state) {
    if (!state) return;
    hideStatusTip(state);
    if (activeGlobalState === state) activeGlobalState = null;
    try { state.editorTipCtrl?.hide?.(); } catch {}
    state.editorTipCtrl = null;
    if (state.dlgShell) {
      try { state.dlgShell.remove(); } catch {}
      state.dlgShell = null;
      state.boxSig = '';
    }
    state.lastBoxRef = null;
    state.lastBoxHadNative = false;
    if (root.__dfoSpellmakerPicker?.isOpen?.()) {
      try { root.__dfoSpellmakerPicker.close({ notifyCancel: false }); } catch {}
    }
    if (root.__dfoSpellmakerGuide?.isOpen?.()) {
      try { root.__dfoSpellmakerGuide.close(); } catch {}
    }
    state.mainRefs = null;
    state.editorRefs = null;
    state.vizLastCanvas = null;
    state.vizDormantRendered = false;
    state.vizLastTs = 0;
    state.vizLastRenderTs = 0;
    state.structSig = '';
    state.lightSig = '';
    state.portHost = null;
    state.portWin = null;
    state.portInner = null;
    state.mountEl = null;
  }

  // ── Per-instance real yH method wrapping (idempotent across Proxy S & raw target e) ──
  function ensureInstanceState(w, law) {
    let state = instances.get(w) || w?.__dfoSmState || null;
    if (state) {
      instances.set(w, state);
      if (law && !state.law) state.law = law;
      return state;
    }
    const used = typeof w.usedSlots === 'function' ? w.usedSlots() : (w.slots || []).filter(Boolean);
    state = {
      law: law || null,
      lastLocale: '',
      autoIconApplied: used.length > 0,
      craftedOnce: false,
      nameManuallyEdited: Boolean(w.name && String(w.name).trim()),
      nameAutoGenerated: false,
      nameSeed: freshSeed(),
      iconSchoolFilter: 'all',
      scrollMemory: new Map(),
      editorSpoilerOpen: false,
      preferredSlotIdx: null,
      vizCtrl: null,
      vizLastTs: 0,
      vizLastRenderTs: 0,
      vizLastSlotSig: '',
      vizLastCanvas: null,
      vizDormantRendered: false,
      vizTagText: '',
      vizTagBorder: '',
      vizTagColor: '',
      vizCachedSig: '',
      vizCachedSlots: [null, null, null],
      vizCachedHasFx: false,
      vizCachedAnalysis: null,
      vizLastAnalysis: null,
      vizLastSpreadPair: null,
      cachedPortView: null,
      cachedPortViewLaw: null,
      mode: '',
      structSig: '',
      lightSig: '',
      boxSig: '',
      lastBoxRef: null,
      lastBoxHadNative: false,
      portHost: null,
      portWin: null,
      portInner: null,
      mountEl: null,
      dlgShell: null,
      mainRefs: null,
      editorRefs: null,
      editorTipCtrl: null,
      activeTip: null,
      nativeAddEffect: null,
      nativeAddAndEditSlot: null,
      nativeReset: null,
      nativeBuy: null,
      nativeOpenNameBox: null,
      nativeOpenIconPicker: null,
      nativeClose: null,
      nativeDispose: null,
      nativeInput: null,
      patched: false,
    };
    instances.set(w, state);
    try {
      Object.defineProperty(w, '__dfoSmState', { value: state, enumerable: false, configurable: true });
    } catch {}
    syncVizSlotsState(w, state, { snapCover: true });
    patchSpellMakerInstance(w, state);
    return state;
  }

  function patchSpellMakerInstance(w, state) {
    if (state.patched || !w) return;
    state.patched = true;

    if (typeof w._reset === 'function') {
      const orig = w._reset;
      state.nativeReset = orig;
      w._reset = function (...args) {
        blurMainNameInput(state);
        const res = orig.apply(this, args);
        state.autoIconApplied = false;
        state.craftedOnce = false;
        state.nameManuallyEdited = false;
        state.nameAutoGenerated = false;
        state.nameSeed = freshSeed();
        state.preferredSlotIdx = null;
        state.editorSpoilerOpen = false;
        if (state.mainRefs?.nameInput) state.mainRefs.nameInput.value = '';
        syncVizSlotsState(this, state);
        state.structSig = '';
        state.lightSig = '';
        return res;
      };
    }

    if (typeof w._stepIcon === 'function') {
      const orig = w._stepIcon;
      w._stepIcon = function (...args) {
        blurMainNameInput(state);
        const res = orig.apply(this, args);
        state.autoIconApplied = true;
        state.lightSig = '';
        return res;
      };
    }

    if (typeof w._setElement === 'function') {
      const orig = w._setElement;
      w._setElement = function (...args) {
        blurMainNameInput(state);
        const prev = this.element;
        const res = orig.apply(this, args);
        if (this.element !== prev) {
          const Data = DataApi();
          if (Data && !state.nameManuallyEdited && state.nameAutoGenerated && (this.slots || []).some((s) => s && Data.getEffectSpec(s.key).schoolId === 22)) {
            refreshAutoName(this, state, false);
          }
          syncVizSlotsState(this, state);
          state.structSig = '';
        }
        return res;
      };
    }

    if (typeof w._addEffect === 'function') {
      const orig = w._addEffect;
      state.nativeAddEffect = orig;
      w._addEffect = function (targetSlotIdx = null, pickerOpts = {}) {
        playClick(state.law);
        openPickerModal(this, state, typeof targetSlotIdx === 'number' ? targetSlotIdx : null, pickerOpts || {});
      };
    }

    if (typeof w._addAndEditSlot === 'function') {
      const orig = w._addAndEditSlot;
      state.nativeAddAndEditSlot = orig;
      w._addAndEditSlot = function (effect, ...args) {
        const res = orig.apply(this, [effect, ...args]);
        if (effect) {
          maybeAutoPickIcon(this, state, effect);
          refreshAutoName(this, state, true);
          syncVizSlotsState(this, state);
          state.structSig = '';
        }
        return res;
      };
    }

    if (typeof w._openNameBox === 'function') {
      const orig = w._openNameBox;
      state.nativeOpenNameBox = orig;
      w._openNameBox = function (...args) {
        const inp = state.mainRefs?.nameInput;
        if (inp && inp.isConnected) {
          playClick(state.law);
          try { inp.focus(); inp.select(); } catch {}
          return;
        }
        return orig.apply(this, args);
      };
    }

    if (typeof w._openIconPicker === 'function') {
      const orig = w._openIconPicker;
      state.nativeOpenIconPicker = orig;
      w._openIconPicker = function (...args) {
        const wrap = state.mainRefs?.iconGridWrap;
        if (wrap && wrap.isConnected) {
          playClick(state.law);
          const sel = wrap.querySelector?.('.dfo-sm-iconcell.on');
          try { sel?.scrollIntoView?.({ block: 'nearest' }); sel?.focus?.(); } catch {}
          return;
        }
        return orig.apply(this, args);
      };
    }

    if (typeof w._buy === 'function') {
      const orig = w._buy;
      state.nativeBuy = orig;
      w._buy = function (...args) {
        blurMainNameInput(state);
        const used = typeof this.usedSlots === 'function' ? this.usedSlots() : (this.slots || []).filter(Boolean);
        if (used.length > 0 && this.allowedTargets === 0) {
          playClick(state.law);
          const lines = DataApi()?.BOX_TEXT?.[isRu() ? 'ru' : 'en']?.incompatibleTargets;
          const msg = Array.isArray(lines) ? lines.join(' ') : 'Selected effects have incompatible target formats.';
          if (typeof this._sayText === 'function') this._sayText(msg);
          else this.box = { rows: [{ text: msg, center: true }], buttons: null };
          forceRefresh(this, state);
          return;
        }
        const beforeCount = Array.isArray(this.entity?.spells) ? this.entity.spells.length : 0;
        const res = orig.apply(this, args);
        const afterCount = Array.isArray(this.entity?.spells) ? this.entity.spells.length : 0;
        if (afterCount > beforeCount) {
          state.craftedOnce = true;
        }
        state.lightSig = '';
        forceRefresh(this, state);
        return res;
      };
    }

    if (typeof w._close === 'function') {
      const orig = w._close;
      state.nativeClose = orig;
      w._close = function (...args) {
        teardownOverlays(state);
        return orig.apply(this, args);
      };
    }

    // IMPORTANT: Never read `w.dispose` directly through WB's Proxy get trap (WB wraps `e.dispose`,
    // so capturing `w.dispose` and assigning back to `w.dispose` (= `e.dispose`) causes infinite recursion!).
    const ownDispose = Object.getOwnPropertyDescriptor(w, 'dispose')?.value;
    const protoDispose = Object.getPrototypeOf(w)?.dispose;
    const origDispose = typeof ownDispose === 'function'
      ? ownDispose
      : (typeof protoDispose === 'function' ? protoDispose : null);
    state.nativeDispose = origDispose;
    w.dispose = function (...args) {
      if (state.disposing) return undefined;
      state.disposing = true;
      try {
        teardownOverlays(state);
        return origDispose ? origDispose.apply(this, args) : undefined;
      } finally {
        state.disposing = false;
      }
    };

    if (typeof w.input === 'function') {
      const orig = w.input;
      state.nativeInput = orig;
      w.input = function (code, ev = null) {
        if (root.__dfoSpellmakerPicker?.isOpen?.() || root.__dfoSpellmakerGuide?.isOpen?.()) {
          return;
        }
        const active = doc.activeElement;
        if (!this.box && active && state.portHost?.contains?.(active) && active.matches?.('input,textarea,[contenteditable]')) {
          return;
        }
        if (this.box) blurMainNameInput(state);
        const hadEditor = Boolean(this.editor);
        const res = orig.apply(this, [code, ev]);
        if (hadEditor && !this.editor) {
          state.structSig = '';
          forceRefresh(this, state);
        }
        return res;
      };
    }
  }

  // ── Native w.box fallback dialog (only when w.box has buttons OR native .notice isn't active) ──
  function hasNativeNoticeFor(w) {
    if (w?._noticeKey) {
      const owned = doc.querySelector?.(`.notice-stack .notice[data-owner="${w._noticeKey}"]:not(.notice-out)`);
      if (owned && owned.style.display !== 'none') return true;
    }
    const generic = doc.querySelector?.('.notice-stack .notice:not(.notice-toast):not(.notice-out)');
    return Boolean(generic && generic.style.display !== 'none');
  }

  function translateBoxLine(line) {
    const txt = typeof line === 'string' ? line : (line?.text ?? '');
    if (!isRu() || !txt) return txt;
    return BOX_EN_TO_RU[txt] || txt;
  }

  function syncBoxOverlay(w, state, allowButtonlessFallback = true) {
    const box = w?.box || null;
    if (!box) {
      if (!state.boxSig && !state.dlgShell) return;
      state.boxSig = '';
      state.lastBoxRef = null;
      state.lastBoxHadNative = false;
      if (state.dlgShell) {
        try { state.dlgShell.remove(); } catch {}
        state.dlgShell = null;
      }
      return;
    }

    const hasButtons = Boolean(box.buttons?.length);
    // For buttonless notices inside Enhanced WB port, let e.draw() -> ny() mount its native notice first
    // before falling back to dlgShell (avoids a 1-frame modal flash on _buy() click).
    if (!hasButtons && !allowButtonlessFallback) return;

    const nativeActive = !hasButtons && hasNativeNoticeFor(w);
    if (box === state.lastBoxRef && nativeActive === state.lastBoxHadNative) {
      return;
    }
    state.lastBoxRef = box;
    state.lastBoxHadNative = nativeActive;

    const needFallback = Boolean(hasButtons || !nativeActive);
    const sig = needFallback
      ? JSON.stringify({
          rows: (box.rows || []).map(translateBoxLine),
          buttons: (box.buttons || []).map((b) => (typeof b === 'object' ? (b.label ?? b.id ?? b) : b)),
        })
      : '';
    if (sig === state.boxSig) return;
    state.boxSig = sig;
    if (state.dlgShell) {
      try { state.dlgShell.remove(); } catch {}
      state.dlgShell = null;
    }
    if (!needFallback || !state.portHost?.isConnected) return;

    const ru = isRu();
    const shell = el('div', 'dlg-shell dfo-sm-dlg-shell');
    const win = el('section', 'dlg-win px-win');
    win.setAttribute('role', 'dialog');

    const msg = el('div', 'dlg-msg');
    for (const r of box.rows || []) {
      msg.append(el('p', null, translateBoxLine(r)));
    }
    const acts = el('footer', 'dlg-acts');
    if (hasButtons) {
      for (const b of box.buttons) {
        const id = typeof b === 'object' ? (b.id ?? b) : b;
        const rawLabel = typeof b === 'object' ? (b.label ?? String(id)) : (id === 8 ? 'Edit' : id === 9 ? 'Delete' : String(id));
        const label = ru ? (rawLabel === 'Edit' ? 'Изменить' : rawLabel === 'Delete' ? 'Удалить' : rawLabel) : rawLabel;
        const btn = el('button', 'dlg-btn', label);
        btn.type = 'button';
        btn.onclick = (e) => {
          e.stopPropagation();
          w._dismissBox?.(id);
          forceRefresh(w, state);
        };
        acts.append(btn);
      }
    }
    const closeBtn = el('button', 'dlg-btn');
    closeBtn.type = 'button';
    closeBtn.append(
      el('span', 'dlg-key', hasButtons ? 'Esc' : 'OK'),
      el('span', 'dlg-label', hasButtons ? (ru ? 'Отмена' : 'Cancel') : (ru ? 'Закрыть' : 'Close')),
    );
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      w._dismissBox?.(null);
      forceRefresh(w, state);
    };
    acts.append(closeBtn);
    win.append(msg, acts);
    shell.append(win);
    shell.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target === shell && !hasButtons) {
        w._dismissBox?.(null);
        forceRefresh(w, state);
      }
    });
    state.portHost.append(shell);
    state.dlgShell = shell;
  }

  // ── Main Workspace UI Renderer & Lightweight Sync ──
  function buildResourceChip(state, toneClass, iconKind, valueText, getTipTitle, getTipRows) {
    const chip = el('div', `dfo-sm-res-chip ${toneClass}`);
    chip.tabIndex = 0;
    const valSpan = el('span', 'dfo-sm-res-val', valueText);
    const ico = makeSvgIcon(iconKind, 'dfo-sm-res-ico');
    chip.append(valSpan, ico);
    attachStatusTip(state, chip, getTipTitle, getTipRows);
    return { chip, valSpan };
  }

  function syncMainLight(w, state) {
    const refs = state.mainRefs;
    const Data = DataApi();
    if (!refs || !w || !Data) return;
    const ru = isRu();
    const cs = evalCreationState(w);

    refs.headerSub.textContent = w.name?.trim()
      ? `\u00ab${w.name.trim()}\u00bb`
      : (ru ? 'Безымянное заклинание' : 'An unnamed spell');

    refs.statusGold.valSpan.textContent = fmtNum(cs.goldHeld);
    refs.statusMana.valSpan.textContent = cs.curMana < cs.maxMana
      ? `${fmtNum(cs.curMana)} / ${fmtNum(cs.maxMana)}`
      : fmtNum(cs.curMana);
    refs.statusMana.chip.classList.toggle('is-low', cs.curMana < cs.maxMana);

    refs.costGold.valSpan.textContent = fmtNum(cs.goldCost);
    refs.costGold.chip.classList.toggle('is-bad', cs.effectsCount > 0 && !cs.hasGold);
    refs.costMana.valSpan.textContent = fmtNum(cs.spCost);
    refs.costMana.chip.classList.toggle('is-warn', cs.effectsCount > 0 && !cs.enoughCastMana);
    refs.costMana.chip.classList.toggle('is-bad', cs.effectsCount > 0 && cs.spCost > cs.maxMana);

    const btn = refs.createBtn;
    btn.classList.remove('is-ready', 'is-warn-mana', 'is-blocked');
    btn.classList.add(`is-${cs.status}`);
    btn.setAttribute('aria-disabled', cs.canBuy ? 'false' : 'true');
    if (btn._statusIcon !== cs.status || btn._langRu !== ru) {
      btn._statusIcon = cs.status;
      btn._langRu = ru;
      btn.replaceChildren(
        makeSvgIcon(cs.status === 'ready' ? 'ctaReady' : cs.status === 'warn-mana' ? 'ctaWarn' : 'ctaBlocked', 'dfo-sm-cta-ico'),
        el('span', null, ru ? 'Создать заклинание' : 'Create spell'),
      );
    }

    const nm = String(w.name || '');
    const len = nm.length;
    if (refs.nameInput && doc.activeElement !== refs.nameInput && refs.nameInput.value !== nm) {
      refs.nameInput.value = nm;
    }
    refs.nameCount.textContent = `${len}/24`;
    if (refs.nameReroll) {
      refs.nameReroll.style.display = cs.effectsCount > 0 ? '' : 'none';
    }
    refs.nameClear.style.visibility = len > 0 ? 'visible' : 'hidden';

    const totalIcons = Data.getIconTotalCount?.() || 69;
    const iconMeta = Data.getIconMeta?.(w.icon);
    const iconSrc = Data.getIconSrc(w.icon);
    if (refs.iconPreviewImg.src !== iconSrc && iconSrc) refs.iconPreviewImg.src = iconSrc;
    const schoolMeta = Data.getIconSchoolMeta?.()[iconMeta?.schoolId] || null;
    const schoolName = schoolMeta ? (ru ? schoolMeta.ru : schoolMeta.en) : '';
    const numDisp = iconMeta ? iconMeta.order : ((Math.trunc(w.icon) || 0) + 1);
    refs.iconIndexLabel.textContent = ru
      ? `Значок № ${numDisp} из ${totalIcons}`
      : `Icon #${numDisp} of ${totalIcons}`;
    if (refs.iconCurLabel) {
      refs.iconCurLabel.textContent = (ru ? iconMeta?.labelRu : iconMeta?.labelEn) || (ru ? `Значок № ${numDisp}` : `Icon #${numDisp}`);
    }
    if (refs.iconCurSchool) {
      refs.iconCurSchool.textContent = schoolName;
      refs.iconCurSchool.style.setProperty('--sm-sch-c', schoolMeta?.color || '#d5b26e');
      refs.iconCurSchool.style.display = schoolName ? '' : 'none';
    }
    if (refs.iconCurPack) {
      const packName = iconMeta
        ? (ru ? iconMeta.packTitleRu : iconMeta.packTitleEn)
        : (ru ? 'Базовый гримуар' : 'Vanilla Grimoire');
      const kindTag = iconMeta?.packKind === 'custom'
        ? (ru ? 'Модульный набор' : 'Custom module')
        : (ru ? 'Школа магии' : 'Magic school');
      refs.iconCurPack.textContent = `${kindTag} · ${packName}`;
    }

    const em = Data.ELEMENT_META[w.element ?? 4] || Data.ELEMENT_META[4];
    refs.iconShowcase.style.setProperty('--sm-elem-glow', em.glow);
    refs.iconShowcase.style.setProperty('--sm-elem-primary', em.primary);
    const vizAnalysis = getCachedVizBundle(w, state).analysis || state.vizLastAnalysis;
    syncVizTag(state, vizAnalysis);

    const activeKey = iconMeta?.key || `num:${((Math.trunc(w.icon) || 0) % 69 + 69) % 69}`;
    refs.iconCells.forEach((cell) => {
      cell.classList.toggle('on', cell.dataset.iconKey === activeKey);
    });
  }

  function refreshLiveIconImages(state) {
    const refs = state.mainRefs;
    const reg = IconRegistryApi();
    if (!refs || !reg) return;
    for (const cell of refs.iconCells) {
      const im = cell.querySelector?.('img');
      if (!im) continue;
      const entry = reg.findEntry(cell.dataset.iconVal ?? cell.dataset.iconKey);
      if (entry?.src && im.src !== entry.src) {
        im.src = entry.src;
      }
    }
  }

  function renderSpellmakerMain(mount, w, state) {
    const Data = DataApi();
    const ru = isRu();
    if (state.portWin) {
      state.portWin.className = 'px-win port-win dfo-window-frame dfo-sm-win';
    }

    const cs = evalCreationState(w);
    const em = Data.ELEMENT_META[w.element ?? 4] || Data.ELEMENT_META[4];
    const targetNames = ru
      ? ['На себя', 'Касание', 'Одиночная цель на расстоянии', 'Область вокруг заклинателя', 'Область на расстоянии']
      : ['Caster only', 'By touch', 'Single target at range', 'Area around caster', 'Area at range'];

    // ── Header ──
    const head = el('header', 'port-head dfo-sm-head');
    const titles = el('div', 'port-titles');
    titles.append(el('h2', 'port-title', ru ? 'Создание заклинаний' : 'Spellmaker'));
    const subWrap = el('div', 'dfo-sm-head-orn');
    const headerSub = el('span', 'port-sub', w.name?.trim() ? `\u00ab${w.name.trim()}\u00bb` : (ru ? 'Безымянное заклинание' : 'An unnamed spell'));
    subWrap.append(el('span', 'dfo-sm-head-line'), headerSub, el('span', 'dfo-sm-head-line'));
    titles.append(subWrap);
    head.append(titles);

    // ── Body (1/3 Left | 2/3 Right) ──
    const body = el('div', 'port-body dfo-sm-body');
    const grid = el('div', 'dfo-sm-layout');

    // ========== LEFT COLUMN ==========
    const leftCol = el('div', 'dfo-sm-col dfo-sm-left');

    // 1. STATUS PANEL
    const statusPanel = el('section', 'dfo-subpanel-frame dfo-sm-panel dfo-sm-status-panel');
    const statusHead = el('div', 'dfo-sm-panel-head');
    statusHead.append(el('span', 'dfo-sm-panel-title', ru ? 'Статус' : 'Status'));
    statusPanel.append(statusHead);
    const statusBody = el('div', 'dfo-sm-res-pair');

    const statusGold = buildResourceChip(
      state,
      'is-gold',
      'gold',
      fmtNum(cs.goldHeld),
      () => ({ icon: 'gold', text: ru ? 'Золото при себе' : 'Gold carried' }),
      () => {
        const s = evalCreationState(w);
        const items = [{
          icon: 'gold',
          tone: 'gold',
          label: ru ? 'Доступно к оплате' : 'Available gold',
          value: `${fmtNum(s.goldHeld)} ${ru ? 'зм' : 'gp'}`,
        }];
        if (s.goldLoc > 0) {
          items.push(
            { icon: 'gold', tone: 'gold', label: ru ? 'Монеты в кошельке' : 'Coins in purse', value: `${fmtNum(s.goldPurse)} ${ru ? 'зм' : 'gp'}` },
            { icon: 'gold', tone: 'loc', label: ru ? `Аккредитивы (${s.goldLocCount})` : `Letters of credit (${s.goldLocCount})`, value: `${fmtNum(s.goldLoc)} ${ru ? 'зм' : 'gp'}` },
          );
        }
        return [
          { kind: 'cards', items },
          {
            kind: 'info',
            fields: [{
              label: ru ? 'Назначение ресурса' : 'Resource role',
              value: ru
                ? 'Золото в кошельке и аккредитивы при персонаже. Списываются при записи нового заклинания в гримуар.'
                : 'Gold coins and Letters of Credit carried in your pack. Spent when inscribing a crafted spell into your grimoire.',
            }],
          },
        ];
      },
    );

    const statusMana = buildResourceChip(
      state,
      'is-mana',
      'mana',
      cs.curMana < cs.maxMana ? `${fmtNum(cs.curMana)} / ${fmtNum(cs.maxMana)}` : fmtNum(cs.curMana),
      () => ({ icon: 'mana', text: ru ? 'Текущий запас маны' : 'Current mana pool' }),
      () => {
        const s = evalCreationState(w);
        return [
          {
            kind: 'cards',
            items: [{ icon: 'mana', tone: 'shards', label: ru ? 'Сейчас / Максимум' : 'Current / Max', value: `${fmtNum(s.curMana)} / ${fmtNum(s.maxMana)} ${ru ? 'МП' : 'SP'}` }],
          },
          {
            kind: 'info',
            fields: [{
              label: ru ? 'Назначение ресурса' : 'Resource role',
              value: ru
                ? 'Доступный прямо сейчас резерв магической энергии. Если стоимость сотворения выше текущего запаса, заклинание можно купить, но сотворить его удастся только после отдыха.'
                : 'Your currently available magicka reserve. If the casting cost exceeds this pool, you can still craft the spell, but must rest to cast it.',
            }],
          },
        ];
      },
    );

    statusBody.append(statusGold.chip, statusMana.chip);
    statusPanel.append(statusBody);

    // 2. VISUALIZATION PANEL
    const vizPanel = el('section', 'dfo-subpanel-frame dfo-sm-panel dfo-sm-viz-panel');
    const vizHead = el('div', 'dfo-sm-panel-head');
    const VIZ = VizApi();
    const initBundle = getCachedVizBundle(w, state);
    const initTag = formatVizTagInfo(initBundle.analysis, ru);
    const vizTag = el('span', 'dfo-sm-viz-tag', initTag.text);
    vizTag.tabIndex = 0;
    vizTag.style.cursor = 'help';
    vizTag.style.borderColor = initTag.border;
    vizTag.style.color = initTag.color;
    attachStatusTip(
      state,
      vizTag,
      () => ({ icon: 'btnNew', text: ru ? 'Визуальная сцена заклинания' : 'Spell Visual Scene' }),
      () => {
        const an = state.vizLastAnalysis || getCachedVizBundle(w, state).analysis;
        const ctrl = state.vizCtrl;
        const pwrPct = Math.round((an?.powerProfile?.power || 0) * 100);
        const litCnt = an?.litCandleCount || 0;
        const motion = buildVizMotionHint(an, ru);
        const slotPairs = Array.isArray(an?.slotPairs) ? an.slotPairs : [];
        const candleTxt = slotPairs
          .filter((sp) => sp.school)
          .map((sp) => (ru ? `Сл.${sp.slotIndex + 1}` : `Sl.${sp.slotIndex + 1}`) + ` (#${sp.candleIds.join(',#')} · ${ru ? sp.school.ru : sp.school.en})`)
          .join(' · ') || (ru ? 'Все 6 свечей погашены' : 'All 6 candles unlit');
        const openAmt = ctrl ? ctrl.getOpenAmount() : 0;
        const sp = state.vizLastSpreadPair;
        const bookVal = openAmt <= 0.01
          ? (ru ? 'Закрыта (символ Охт)' : 'Closed (Oht cover)')
          : (ru ? `Открыта (${sp ? `${sp.leftId} + ${sp.rightId}` : 'авто'})` : `Open (${sp ? `${sp.leftId} + ${sp.rightId}` : 'auto'})`);
        return [
          {
            kind: 'cards',
            items: [
              { icon: 'btnNew', tone: 'gold', label: ru ? 'Свечение' : 'Radiance', value: `${pwrPct}%` },
              { icon: 'mana', tone: 'shards', label: ru ? 'Свечи' : 'Candles', value: `${litCnt} / 6` },
            ],
          },
          {
            kind: 'info',
            fields: [
              { label: ru ? 'Пары свечей на сессию' : 'Session candle pairs', value: candleTxt },
              { label: ru ? 'Гримуар на алтаре' : 'Altar grimoire', value: bookVal },
              {
                label: ru ? 'Эффекты и синергии' : 'Modules & synergies',
                value: motion || (an?.activeCount
                  ? (ru ? 'Базовое проявление выбранных школ. Клик по сцене листает страницы.' : 'Base school manifestation. Click the scene to flip pages.')
                  : (ru ? 'Добавьте эффекты, чтобы зажечь свечи, раскрыть гримуар и проявить заклинание.' : 'Add effects to light candles, open the grimoire, and manifest the spell.')),
              },
            ],
          },
        ];
      },
    );
    vizHead.append(el('span', 'dfo-sm-panel-title', ru ? 'Визуализация' : 'Visualization'), vizTag);
    const vizWell = el('div', 'dfo-well-frame dfo-sm-viz-well');
    const vizCanvas = doc.createElement('canvas');
    vizCanvas.className = 'dfo-sm-viz-canvas';
    vizCanvas.width = VIZ?.DEFAULT_WIDTH || 350;
    vizCanvas.height = VIZ?.DEFAULT_HEIGHT || 281;
    vizCanvas.title = ru ? 'Клик — перелистнуть страницы гримуара' : 'Click to flip grimoire pages';
    vizCanvas.setAttribute('aria-label', ru ? 'Арканная проекция заклинания' : 'Arcane spell projection');
    vizCanvas.addEventListener('click', () => {
      const ctrl = ensureVizCtrl(state);
      if (!ctrl) return;
      if (ctrl.getOpenAmount() > 0.5) {
        state.vizDormantRendered = false;
        ctrl.triggerBurst(4);
        renderSpellVizFrame(w, state, vizCanvas, 0);
      }
    });
    vizWell.append(vizCanvas);
    vizPanel.append(vizHead, vizWell);

    // 3. TARGET FORMAT PANEL
    const targetPanel = el('section', 'dfo-subpanel-frame dfo-sm-panel dfo-sm-target-panel');
    const targetHead = el('div', 'dfo-sm-panel-head');
    targetHead.append(el('span', 'dfo-sm-panel-title', ru ? 'Формат заклинания' : 'Target format'));
    targetPanel.append(targetHead);
    const targetGrid = el('div', 'dfo-sm-target-grid');
    targetNames.forEach((lbl, idx) => {
      const allowed = Boolean((w.allowedTargets ?? 31) & (1 << idx));
      const b = el('button', `port-btn port-chip dfo-sm-tgt-btn${allowed && w.rangeType === idx ? ' on' : ''}${idx >= 2 ? ' is-wide' : ''}`);
      b.type = 'button';
      b.disabled = !allowed;
      b.append(targetIconSvg(idx), el('span', null, lbl));
      b.onclick = () => {
        if (!((w.allowedTargets ?? 31) & (1 << idx))) return;
        blurMainNameInput(state);
        playClick(state.law);
        w._setTarget?.(idx);
        state.structSig = '';
        forceRefresh(w, state);
      };
      targetGrid.append(b);
    });
    targetPanel.append(targetGrid);

    // 4. ELEMENT PANEL
    const elemPanel = el('section', 'dfo-subpanel-frame dfo-sm-panel dfo-sm-element-panel');
    const elemHead = el('div', 'dfo-sm-panel-head');
    elemHead.append(el('span', 'dfo-sm-panel-title', ru ? 'Стихия' : 'Element'));
    elemPanel.append(elemHead);
    const elemRow = el('div', 'dfo-sm-elem-grid');
    Data.ELEMENT_META.forEach((meta, idx) => {
      const allowed = Boolean((w.allowedElements ?? 16) & (1 << idx));
      const b = el('button', `port-btn port-chip dfo-sm-elem-btn is-${meta.key}${w.element === idx ? ' on' : ''}`);
      b.type = 'button';
      b.disabled = !allowed;
      b.style.setProperty('--sm-el-c', meta.primary);
      b.append(el('span', 'dfo-sm-elem-dot'), el('span', null, ru ? meta.nameRu : meta.nameEn));
      b.onclick = () => {
        if (!((w.allowedElements ?? 16) & (1 << idx))) return;
        blurMainNameInput(state);
        playClick(state.law);
        w._setElement?.(idx);
        forceRefresh(w, state);
      };
      elemRow.append(b);
    });
    elemPanel.append(elemRow);

    // 5. FINAL COST & ACTION STACK
    const costPanel = el('section', 'dfo-subpanel-frame dfo-sm-panel dfo-sm-cost-panel');
    const costHead = el('div', 'dfo-sm-panel-head');
    costHead.append(el('span', 'dfo-sm-panel-title', ru ? 'Стоимость создания' : 'Spell cost'));
    costPanel.append(costHead);
    const costPair = el('div', 'dfo-sm-res-pair');

    const costGold = buildResourceChip(
      state,
      `is-gold${cs.effectsCount > 0 && !cs.hasGold ? ' is-bad' : ''}`,
      'gold',
      fmtNum(cs.goldCost),
      () => ({ icon: 'gold', text: ru ? 'Цена начертания в золоте' : 'Inscription gold cost' }),
      () => {
        const s = evalCreationState(w);
        return [
          {
            kind: 'cards',
            items: [{
              icon: 'gold',
              tone: s.hasGold ? 'gold' : 'aurum',
              label: ru ? 'Требуется / При себе' : 'Required / Carried',
              value: `${fmtNum(s.goldCost)} / ${fmtNum(s.goldHeld)}`,
            }],
          },
          {
            kind: 'info',
            fields: [{
              label: ru ? 'Статус оплаты' : 'Payment check',
              value: s.effectsCount === 0
                ? (ru ? 'Добавьте эффекты, чтобы рассчитать итоговую цену в гильдии.' : 'Add effects to calculate total guild fee.')
                : s.hasGold
                  ? (ru ? `Золота достаточно (останется ${fmtNum(s.goldHeld - s.goldCost)} зм).` : `Sufficient gold (${fmtNum(s.goldHeld - s.goldCost)} gp remaining).`)
                  : (ru ? `Не хватает ${fmtNum(s.goldCost - s.goldHeld)} золотых.` : `Missing ${fmtNum(s.goldCost - s.goldHeld)} gp.`),
            }],
          },
        ];
      },
    );

    const costMana = buildResourceChip(
      state,
      `is-mana${cs.effectsCount > 0 && !cs.enoughCastMana ? ' is-warn' : ''}${cs.effectsCount > 0 && cs.spCost > cs.maxMana ? ' is-bad' : ''}`,
      'mana',
      fmtNum(cs.spCost),
      () => ({ icon: 'mana', text: ru ? 'Расход маны на 1 сотворение' : 'Mana cost per cast' }),
      () => {
        const s = evalCreationState(w);
        const casts = Math.floor(s.curMana / Math.max(1, s.spCost));
        const castWordRu = (casts % 10 === 1 && casts % 100 !== 11)
          ? 'применение'
          : ((casts % 10 >= 2 && casts % 10 <= 4 && (casts % 100 < 12 || casts % 100 > 14)) ? 'применения' : 'применений');
        const castWordEn = casts === 1 ? 'cast' : 'casts';
        return [
          {
            kind: 'cards',
            items: [{
              icon: 'mana',
              tone: 'shards',
              label: ru ? 'Расход / Запас' : 'Cast / Current pool',
              value: `${fmtNum(s.spCost)} / ${fmtNum(s.curMana)} ${ru ? 'МП' : 'SP'}`,
            }],
          },
          {
            kind: 'info',
            fields: [{
              label: ru ? 'Доступность применения' : 'Cast readiness',
              value: s.effectsCount === 0
                ? (ru ? 'Выберите эффекты для расчёта затрат маны.' : 'Select effects to calculate casting cost.')
                : s.spCost <= s.curMana
                  ? (ru ? `Текущего запаса хватит на ${casts} ${castWordRu} подряд.` : `Enough current mana for ${casts} ${castWordEn}.`)
                  : s.spCost <= s.maxMana
                    ? (ru ? `Сейчас не хватает ${fmtNum(s.spCost - s.curMana)} МП (восстановите ману отдыхом, максимум ${fmtNum(s.maxMana)}).` : `Currently short by ${fmtNum(s.spCost - s.curMana)} SP (max pool is ${fmtNum(s.maxMana)}).`)
                    : (ru ? `Превышает даже ваш максимум маны (${fmtNum(s.maxMana)} МП)!` : `Exceeds even your max magicka (${fmtNum(s.maxMana)} SP)!`),
            }],
          },
        ];
      },
    );

    costPair.append(costGold.chip, costMana.chip);

    const createBtn = el('button', `port-btn dfo-sm-action-btn dfo-sm-create-btn is-${cs.status}`);
    createBtn.type = 'button';
    createBtn.setAttribute('aria-disabled', cs.canBuy ? 'false' : 'true');
    createBtn.onclick = () => w._buy?.();
    attachStatusTip(
      state,
      createBtn,
      () => {
        const s = evalCreationState(w);
        return {
          icon: s.status === 'ready' ? 'ctaReady' : s.status === 'warn-mana' ? 'ctaWarn' : 'ctaBlocked',
          text: ru ? 'Создать заклинание' : 'Create spell',
        };
      },
      () => {
        const s = evalCreationState(w);
        const badgeText = s.status === 'ready'
          ? (ru ? 'Готово к созданию' : 'Ready to craft')
          : s.status === 'warn-mana'
            ? (ru ? 'Создать можно · мало маны на каст' : 'Can buy · low current mana')
            : (ru ? 'Создание невозможно' : 'Cannot craft yet');
        const reasonText = s.status === 'ready'
          ? (ru ? 'Все требования выполнены. Нажмите, чтобы вписать заклинание в гримуар.' : 'All requirements met. Click to inscribe this spell into your spellbook.')
          : s.status === 'warn-mana'
            ? (ru
              ? `Заклинание можно купить и вписать в книгу сейчас, но текущей маны (${fmtNum(s.curMana)} / ${fmtNum(s.spCost)} МП) не хватит даже на 1 применение.`
              : `You can purchase and inscribe this spell now, but your current mana (${fmtNum(s.curMana)} / ${fmtNum(s.spCost)} SP) is not enough for 1 cast.`)
            : (s.reasons.join('; ') + '.');
        return [
          {
            kind: 'cards',
            items: [{
              icon: s.status === 'ready' ? 'ctaReady' : s.status === 'warn-mana' ? 'ctaWarn' : 'ctaBlocked',
              tone: s.status === 'ready' ? 'embers' : s.status === 'warn-mana' ? 'loc' : 'aurum',
              label: ru ? 'Вердикт' : 'Verdict',
              value: badgeText,
            }],
          },
          { kind: 'info', fields: [{ label: ru ? 'Причина' : 'Reason', value: reasonText }] },
        ];
      },
    );

    const btnNew = el('button', 'port-btn dfo-ornate-btn dfo-sm-action-btn dfo-sm-util-btn');
    btnNew.type = 'button';
    btnNew.append(makeSvgIcon('btnNew', 'dfo-sm-cta-ico'), el('span', null, ru ? 'Новое заклинание' : 'New spell'));
    btnNew.onclick = () => {
      if (typeof w._newSpell === 'function') w._newSpell();
      else w._reset?.();
      forceRefresh(w, state);
    };

    const btnGuide = el('button', 'port-btn dfo-ornate-btn dfo-sm-action-btn dfo-sm-guide-btn');
    btnGuide.type = 'button';
    btnGuide.append(makeSvgIcon('btnGuide', 'dfo-sm-cta-ico'), el('span', null, ru ? 'Гайд по Механике' : 'Mechanics Guide'));
    btnGuide.onclick = () => openGuideModal(state);

    const btnExit = el('button', 'port-btn dfo-ornate-btn silver dfo-close-btn dfo-sm-action-btn dfo-sm-util-btn');
    btnExit.type = 'button';
    btnExit.append(el('span', null, ru ? 'Закрыть' : 'Close'));
    btnExit.onclick = () => {
      playClick(state.law);
      w._close?.();
    };

    const actionStack = el('div', 'dfo-sm-cta-stack');
    actionStack.append(createBtn, btnNew, btnGuide, btnExit);
    costPanel.append(costPair, actionStack);
    leftCol.append(statusPanel, vizPanel, targetPanel, elemPanel, costPanel);

    // ========== RIGHT COLUMN ==========
    const rightCol = el('div', 'dfo-sm-col dfo-sm-right');

    // 1. DIRECT SPELL NAME INPUT PANEL
    const namePanel = el('section', 'dfo-subpanel-frame dfo-sm-panel dfo-sm-name-panel');
    const nameHead = el('div', 'dfo-sm-panel-head');
    const nameCount = el('span', 'dfo-sm-name-count', `${(w.name || '').length}/24`);
    nameHead.append(el('span', 'dfo-sm-panel-title', ru ? 'Название заклинания' : 'Spell name'), nameCount);
    const nameRow = el('div', 'dfo-sm-name-wrap dfo-well-frame');
    const nameInput = doc.createElement('input');
    nameInput.type = 'text';
    nameInput.maxLength = 24;
    nameInput.className = 'dfo-sm-name-input';
    nameInput.placeholder = ru ? 'Введите название заклинания…' : 'Enter spell name…';
    nameInput.value = w.name || '';
    nameInput.setAttribute('aria-label', ru ? 'Название заклинания' : 'Spell name');
    const nameReroll = el('button', 'port-btn dfo-sm-name-reroll');
    nameReroll.type = 'button';
    nameReroll.title = ru ? 'Подобрать другое название по эффектам' : 'Roll another modular spell name';
    nameReroll.setAttribute('aria-label', ru ? 'Подобрать другое название' : 'Roll another spell name');
    nameReroll.append(makeSvgIcon('rerollName', 'dfo-sm-clear-ico'));
    nameReroll.style.display = cs.effectsCount > 0 ? '' : 'none';
    const nameClear = el('button', 'port-btn dfo-sm-name-clear');
    nameClear.type = 'button';
    nameClear.title = ru ? 'Очистить название' : 'Clear name';
    nameClear.setAttribute('aria-label', ru ? 'Очистить название' : 'Clear name');
    nameClear.append(makeSvgIcon('clearCross', 'dfo-sm-clear-ico'));
    nameClear.style.visibility = (w.name || '').length > 0 ? 'visible' : 'hidden';

    nameInput.addEventListener('input', () => {
      w.name = nameInput.value.slice(0, 24);
      state.nameManuallyEdited = Boolean(w.name.trim());
      if (!state.nameManuallyEdited) state.nameAutoGenerated = false;
      syncMainLight(w, state);
    });
    nameInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        nameInput.blur();
      }
    });
    nameInput.addEventListener('keyup', (e) => e.stopPropagation());
    nameReroll.addEventListener('click', () => {
      blurMainNameInput(state);
      playClick(state.law);
      rerollAutoName(w, state);
    });
    nameClear.addEventListener('click', () => {
      playClick(state.law);
      w.name = '';
      state.nameManuallyEdited = false;
      state.nameAutoGenerated = false;
      nameInput.value = '';
      syncMainLight(w, state);
      nameInput.focus();
    });
    nameRow.append(nameInput, nameReroll, nameClear);
    namePanel.append(nameHead, nameRow);

    // 2. THREE EFFECT ROWS PANEL
    const fxPanel = el('section', 'dfo-subpanel-frame dfo-sm-panel dfo-sm-effects-panel');
    const fxHead = el('div', 'dfo-sm-panel-head');
    fxHead.append(
      el('span', 'dfo-sm-panel-title', ru ? 'Эффекты заклинания' : 'Spell effects'),
      el('span', 'dfo-sm-fx-counter', `${cs.effectsCount} / 3`),
    );
    const fxList = el('div', 'dfo-sm-fx-list');
    [0, 1, 2].forEach((idx) => {
      const slot = w.slots?.[idx];
      const liveFx = slot ? (w.effectOf?.(slot) || Data.EFFECT_BY_KEY.get(slot.key)) : null;
      const catalogFx = slot ? (Data.EFFECT_BY_KEY.get(slot.key) || liveFx) : null;
      if (slot && (liveFx || catalogFx)) {
        const fx = catalogFx || liveFx;
        const sch = Data.effectSchool(fx.key);
        const row = el('div', 'dfo-sm-fx-row is-filled');
        row.style.setProperty('--sm-sch-c', sch.color);
        const badge = el('span', 'dfo-sm-fx-idx', String(idx + 1));
        const info = el('div', 'dfo-sm-fx-info');
        const titleLine = el('div', 'dfo-sm-fx-top');
        const dispName = ru ? (fx.nameRu || fx.name) : (fx.nameEn || fx.name);
        titleLine.append(
          el('span', 'dfo-sm-fx-name', dispName),
          el('span', 'dfo-sm-fx-school', ru ? sch.ru : sch.en),
        );
        const subLine = el('div', 'dfo-sm-fx-params');
        for (const pText of Data.summarizeSlot(slot, fx, w.entity?.level ?? 1, ru ? 'ru' : 'en')) {
          subLine.append(el('span', 'dfo-sm-fx-param', pText));
        }
        info.append(titleLine, subLine);

        const slotSp = getSlotCost(slot, w.entity, state.law).sp;
        const costTag = el('span', 'dfo-sm-fx-sp', `${slotSp} ${ru ? 'МП' : 'SP'}`);
        const acts = el('div', 'dfo-sm-fx-acts');
        const editBtn = el('button', 'port-btn dfo-sm-fx-btn', ru ? 'Настроить' : 'Edit');
        editBtn.type = 'button';
        editBtn.onclick = (ev) => {
          ev.stopPropagation();
          playClick(state.law);
          w.editOrDeleteSlot = idx;
          w._openEditor?.(idx);
          state.structSig = '';
          forceRefresh(w, state);
        };
        const delBtn = el('button', 'port-btn dfo-sm-fx-del', '×');
        delBtn.type = 'button';
        delBtn.title = ru ? 'Удалить эффект' : 'Remove effect';
        delBtn.onclick = (ev) => {
          ev.stopPropagation();
          playClick(state.law);
          removeSlot(w, state, idx);
        };
        acts.append(editBtn, delBtn);

        row.onclick = () => {
          playClick(state.law);
          w.editOrDeleteSlot = idx;
          w._openEditor?.(idx);
          state.structSig = '';
          forceRefresh(w, state);
        };
        row.append(badge, info, costTag, acts);
        fxList.append(row);
      } else {
        const row = el('button', 'dfo-sm-fx-row is-empty');
        row.type = 'button';
        row.append(
          el('span', 'dfo-sm-fx-idx', String(idx + 1)),
          el('span', 'dfo-sm-fx-empty-lbl', ru ? 'Пустой слот — нажмите, чтобы выбрать эффект' : 'Empty slot — click to add effect'),
          el('span', 'dfo-sm-fx-add-tag', ru ? '+ Добавить' : '+ Add'),
        );
        row.onclick = () => {
          playClick(state.law);
          openPickerModal(w, state, idx);
        };
        fxList.append(row);
      }
    });
    fxPanel.append(fxHead, fxList);

    // 3. INLINE SPELL ICON PANEL
    const iconsPanel = el('section', 'dfo-subpanel-frame dfo-sm-panel dfo-sm-icons-panel');
    const totalIcons = Data.getIconTotalCount?.() || 69;
    const iconIndexLabel = el('span', 'dfo-sm-icon-count', '');
    const iconsHead = el('div', 'dfo-sm-panel-head');
    iconsHead.append(el('span', 'dfo-sm-panel-title', ru ? 'Значок заклинания' : 'Spell icon'), iconIndexLabel);

    const iconShowcase = el('div', 'dfo-sm-icon-showcase');
    iconShowcase.style.setProperty('--sm-elem-glow', em.glow);
    iconShowcase.style.setProperty('--sm-elem-primary', em.primary);

    const previewBox = el('div', 'dfo-well-frame dfo-sm-icon-preview');
    const previewImg = doc.createElement('img');
    previewImg.src = Data.getIconSrc(w.icon);
    previewImg.alt = String(w.icon ?? '');
    previewBox.append(previewImg);

    const showcaseMeta = el('div', 'dfo-sm-icon-meta');
    const iconCurTop = el('div', 'dfo-sm-icon-cur-top');
    const iconCurLabel = el('div', 'dfo-sm-icon-cur-lbl', '');
    const iconCurSchool = el('span', 'dfo-sm-icon-cur-school', '');
    iconCurTop.append(iconCurLabel, iconCurSchool);
    const iconCurPack = el('div', 'dfo-sm-icon-cur-hint', '');
    showcaseMeta.append(iconCurTop, iconCurPack);
    iconShowcase.append(previewBox, showcaseMeta);

    const schoolTabs = el('div', 'dfo-sm-school-tabs');
    const countsMap = Data.getIconSchoolCounts?.() || new Map();
    const schoolMetaMap = Data.getIconSchoolMeta?.() || {};
    const schoolOrder = Data.getIconSchoolOrder?.() || [22, 23, 24, 25, 26, 27];
    const gridWrap = el('div', 'dfo-well-frame dfo-sm-icongrid-wrap dfo-scroll');
    gridWrap.dataset.scrollKey = 'icons-inline';
    let iconCells = [];

    function renderIconSections() {
      gridWrap.replaceChildren();
      iconCells = [];
      const curMeta = Data.getIconMeta?.(w.icon);
      const activeKey = curMeta?.key || `num:${((Math.trunc(w.icon) || 0) % 69 + 69) % 69}`;
      const sections = Data.getIconSections?.(ru ? 'ru' : 'en', state.iconSchoolFilter) || [];
      const reg = IconRegistryApi();
      for (const sec of sections) {
        const secEl = el('div', 'dfo-sm-school-sec');
        secEl.style.setProperty('--sm-sch-c', sec.color);
        const secHead = el('div', 'dfo-sm-school-sec-head');
        const secLeft = el('span', 'dfo-sm-school-sec-name');
        secLeft.append(el('span', 'dfo-sm-school-dot'), el('span', null, sec.name));
        const secRight = el('span', 'dfo-sm-school-sec-meta');
        if (sec.hasCustom) {
          secRight.append(el('span', 'dfo-sm-school-custom-badge', ru ? '+ особые' : '+ custom'));
        }
        secRight.append(el('span', 'dfo-sm-school-sec-cnt', String(sec.entries.length)));
        secHead.append(secLeft, secRight);

        const secGrid = el('div', 'dfo-sm-icongrid');
        for (const entry of sec.entries) {
          const isSelected = entry.key === activeKey;
          const cell = el('button', `dfo-sm-iconcell${isSelected ? ' on' : ''}${entry.packKind === 'custom' ? ' is-custom' : ''}`);
          cell.type = 'button';
          cell.dataset.iconKey = entry.key;
          cell.dataset.iconVal = String(entry.value);
          cell.title = `${ru ? entry.labelRu : entry.labelEn} · ${sec.name}`;
          const im = doc.createElement('img');
          im.src = entry.src;
          im.alt = String(entry.order);
          cell.append(im);
          cell.onclick = () => {
            blurMainNameInput(state);
            playClick(state.law);
            w.icon = reg ? reg.resolveGameIconIndex(entry.value) : ((Math.trunc(entry.value) || 0) % 69 + 69) % 69;
            state.autoIconApplied = true;
            syncMainLight(w, state);
          };
          secGrid.append(cell);
          iconCells.push(cell);
        }
        secEl.append(secHead, secGrid);
        gridWrap.append(secEl);
      }
      if (state.mainRefs) state.mainRefs.iconCells = iconCells;
    }

    const tabButtons = [];
    const makeSchoolTab = (filterVal, label, dotColor, countVal) => {
      const b = el('button', `dfo-sm-school-tab${String(state.iconSchoolFilter) === String(filterVal) ? ' on' : ''}`);
      b.type = 'button';
      b.dataset.schoolFilter = String(filterVal);
      if (dotColor) {
        b.style.setProperty('--sm-sch-c', dotColor);
        b.append(el('span', 'dfo-sm-school-dot'));
      }
      b.append(el('span', null, label), el('span', 'dfo-sm-school-tab-cnt', String(countVal)));
      b.onclick = () => {
        state.iconSchoolFilter = filterVal;
        for (const tb of tabButtons) tb.classList.toggle('on', tb.dataset.schoolFilter === String(filterVal));
        renderIconSections();
      };
      tabButtons.push(b);
      return b;
    };

    schoolTabs.append(makeSchoolTab('all', ru ? 'Все' : 'All', null, totalIcons));
    for (const sid of schoolOrder) {
      const cnt = countsMap.get(sid) || 0;
      if (!cnt) continue;
      const meta = schoolMetaMap[sid];
      if (!meta) continue;
      schoolTabs.append(makeSchoolTab(sid, ru ? meta.ru : meta.en, meta.color, cnt));
    }

    renderIconSections();
    iconsPanel.append(iconsHead, iconShowcase, schoolTabs, gridWrap);

    rightCol.append(namePanel, fxPanel, iconsPanel);
    grid.append(leftCol, rightCol);
    body.append(grid);
    mount.append(head, body);

    state.mainRefs = {
      headerSub,
      statusGold,
      statusMana,
      costGold,
      costMana,
      createBtn,
      nameInput,
      nameCount,
      nameReroll,
      nameClear,
      iconShowcase,
      iconPreviewImg: previewImg,
      iconIndexLabel,
      iconCurLabel,
      iconCurSchool,
      iconCurPack,
      iconGridWrap: gridWrap,
      iconCells,
      vizTag,
      vizCanvas,
    };

    state.vizTagText = initTag.text;
    state.vizTagBorder = initTag.border;
    state.vizTagColor = initTag.color;
    state.vizDormantRendered = false;
    state.vizLastCanvas = null;

    syncMainLight(w, state);
    renderSpellVizFrame(w, state, vizCanvas, 0);
  }

  function renderSpellmakerEditor(mount, w, state) {
    state.mainRefs = null;
    state.editorRefs = null;
    const ed = w.editor;
    if (!ed || !root.__dfoSpellmakerEditor?.render) return;

    const getSlotIdx = () => {
      const byRef = Array.isArray(w.slots) ? w.slots.indexOf(ed.deps.slot) : -1;
      return byRef >= 0 ? byRef : Math.max(0, w.editOrDeleteSlot ?? 0);
    };

    const refs = root.__dfoSpellmakerEditor.render(mount, state.portWin, w, {
      Data: DataApi(),
      Catalog: CatalogApi(),
      ru: isRu(),
      fmtNum,
      standState: state,
      makeSvgIcon,
      tipHost: state.portHost || doc.body,
      getSlotCost: (slot, entity) => getSlotCost(slot, entity, state.law),
      evalCreationState: () => evalCreationState(w),
      onStepField: (field, delta) => {
        ed._step?.(field, delta);
        w._updateSpellCosts?.();
        root.__dfoSpellmakerEditor.syncLight(state.editorRefs);
      },
      onSetField: (field, val) => {
        ed.setValue?.(field, val);
        w._updateSpellCosts?.();
        root.__dfoSpellmakerEditor.syncLight(state.editorRefs);
      },
      onResetSlot: () => {
        playClick(state.law);
        for (const f of RESET_FIELD_ORDER) {
          if (ed.enabled?.(f)) ed.setValue?.(f, 1);
        }
        w._updateSpellCosts?.();
        root.__dfoSpellmakerEditor.syncLight(state.editorRefs);
      },
      onDeleteSlot: () => {
        playClick(state.law);
        const idx = getSlotIdx();
        ed._close?.();
        removeSlot(w, state, idx);
      },
      onDone: () => {
        playClick(state.law);
        ed._close?.();
        state.structSig = '';
        forceRefresh(w, state);
      },
    });
    state.editorRefs = refs;
  }

  function computeStructSig(w, state) {
    const mode = w.editor ? 'editor' : 'main';
    const lang = isRu() ? 'ru' : 'en';
    const slotsSig = (w.slots || []).map((s) => (s ? s.key : '-')).join(',');
    if (mode === 'editor') {
      const edKey = w.editor?.deps?.effect?.key || w.editor?.deps?.slot?.key || '';
      const slotIdx = Array.isArray(w.slots) ? w.slots.indexOf(w.editor?.deps?.slot) : -1;
      return `E|${lang}|${slotIdx}|${edKey}|${w.rangeType ?? 0}`;
    }
    return `M|${lang}|${slotsSig}|${w.rangeType ?? 0}|${w.element ?? 4}|${w.allowedTargets ?? 31}|${w.allowedElements ?? 16}|${state.iconSchoolFilter}`;
  }

  function computeLightSig(w) {
    const ent = w?.entity;
    const items = Array.isArray(ent?.items) ? ent.items : null;
    let hasBook = 0;
    let locGold = 0;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it) continue;
        if (!hasBook && it.templateIndex === 132 && it.group === 'MiscItems') hasBook = 1;
        else if (it.templateIndex === 275) locGold += Math.max(0, Math.trunc(Number(it.value) || 0));
      }
    }
    const purse = Math.max(0, Math.trunc(Number(ent?.goldPieces) || 0));
    const goldHeld = purse + locGold;
    const maxMana = Math.max(0, Math.trunc(Number(ent?.maxMagicka) || 0));
    const curMana = Math.max(0, Math.trunc(Number(ent?.magicka ?? maxMana) || 0));
    const goldCost = Math.max(0, Math.trunc(Number(w?.totalGoldCost) || 0));
    const spCost = Math.max(0, Math.trunc(Number(w?.totalSpellPointCost) || 0));
    const validTgt = (w?.allowedTargets ?? 31) !== 0 ? 1 : 0;
    const lvl = ent?.level ?? 1;
    const es = w?.editor?.deps?.slot?.settings;
    if (es) {
      return `E|${hasBook}|${validTgt}|${goldHeld}|${curMana}|${maxMana}|${goldCost}|${spCost}|${lvl}|${es.durationBase},${es.durationMod},${es.durationPerLevel},${es.chanceBase},${es.chanceMod},${es.chancePerLevel},${es.magnitudeBaseLow},${es.magnitudeBaseHigh},${es.magnitudeLevelBase},${es.magnitudeLevelHigh},${es.magnitudePerLevel}`;
    }
    return `M|${hasBook}|${validTgt}|${goldHeld}|${curMana}|${maxMana}|${goldCost}|${spCost}|${w?.name || ''}|${w?.icon ?? 0}|${lvl}`;
  }

  function ensureMount(w, state, cv) {
    const portWin = cv?.closest?.('.port-win') || null;
    const portInner = cv?.closest?.('.port-inner') || null;
    const portHost = cv?.closest?.('.port-host') || null;
    if (!portWin || !portInner || !portHost) return false;

    const sameMount = Boolean(
      state.mountEl
      && state.mountEl.parentElement === portInner
      && state.portWin === portWin
      && state.portHost === portHost
      && state.mountEl.childElementCount > 0,
    );
    if (sameMount) {
      return true;
    }

    // Host/window was rebuilt (e.g. WB 250ms watchdog tore down portHost while game was minimized,
    // or WB y(d) replaced portInner children): invalidate cached signatures & stale refs so full UI remounts cleanly.
    hideStatusTip(state);
    try { state.editorTipCtrl?.hide?.(); } catch {}
    state.editorTipCtrl = null;
    if (state.dlgShell && (!state.dlgShell.isConnected || state.dlgShell.parentElement !== portHost)) {
      try { state.dlgShell.remove(); } catch {}
      state.dlgShell = null;
    }
    state.portWin = portWin;
    state.portInner = portInner;
    state.portHost = portHost;
    activeGlobalState = state;
    ensureGlobalTipListeners();

    // Create dedicated mount root inside .port-inner; native hidden driver canvas stays intact for WB paint() ticks
    let mount = portInner.querySelector?.(':scope > .dfo-sm-mount') || null;
    if (!mount) {
      mount = el('div', 'dfo-sm-mount');
      portInner.append(mount);
    }
    state.mountEl = mount;
    state.structSig = '';
    state.lightSig = '';
    state.boxSig = '';
    state.lastBoxRef = null;
    state.lastBoxHadNative = false;
    state.mainRefs = null;
    state.editorRefs = null;
    state.vizDormantRendered = false;
    state.vizLastCanvas = null;
    state.vizLastTs = 0;
    state.vizLastRenderTs = 0;

    // Capture-phase guard: if w.box is open without buttons (e.g. 1705 inscribed notice),
    // clicking anywhere inside Spellmaker dismisses the box cleanly without firing an underlying button.
    if (!mount._dfoBoxGuardBound) {
      mount._dfoBoxGuardBound = true;
      mount.addEventListener('click', (e) => {
        if (w.box && !w.box.buttons?.length) {
          e.preventDefault();
          e.stopPropagation();
          w._dismissBox?.(null);
          forceRefresh(w, state);
        }
      }, true);
    }
    return true;
  }

  function forceRefresh(w, state) {
    if (!state?.mountEl || !state.mountEl.isConnected) return;
    renderOrSync(w, state, false);
  }

  function renderOrSync(w, state, advanceViz) {
    ensureStyle();
    const Data = DataApi();
    if (!Data) return;
    const lang = isRu() ? 'ru' : 'en';
    if (state.lastLocale !== lang) {
      state.lastLocale = lang;
      Data.setLocale(lang);
    }

    const reg = IconRegistryApi();
    if (reg?.syncLiveIcons?.()) {
      refreshLiveIconImages(state);
      state.lightSig = '';
    }

    const sSig = computeStructSig(w, state);
    const missingDom = !state.mountEl || state.mountEl.childElementCount === 0;
    const expectedWinCls = w.editor ? 'dfo-fxed-win' : 'dfo-sm-win';
    const missingWinCls = Boolean(state.portWin && !state.portWin.classList?.contains?.(expectedWinCls));
    if (sSig !== state.structSig || missingDom || missingWinCls) {
      hideStatusTip(state);
      try { state.editorTipCtrl?.hide?.(); } catch {}
      state.editorTipCtrl = null;

      for (const s of state.mountEl.querySelectorAll?.('[data-scroll-key]') || []) {
        state.scrollMemory.set(s.dataset.scrollKey, s.scrollTop);
      }
      state.mountEl.replaceChildren();
      state.mode = w.editor ? 'editor' : 'main';
      if (w.editor) {
        renderSpellmakerEditor(state.mountEl, w, state);
      } else {
        syncVizSlotsState(w, state);
        renderSpellmakerMain(state.mountEl, w, state);
      }
      for (const s of state.mountEl.querySelectorAll?.('[data-scroll-key]') || []) {
        const prev = state.scrollMemory.get(s.dataset.scrollKey);
        if (prev) s.scrollTop = prev;
      }
      state.structSig = sSig;
      state.lightSig = computeLightSig(w);
    } else {
      const lSig = computeLightSig(w);
      if (lSig !== state.lightSig) {
        if (w.editor && state.editorRefs) {
          root.__dfoSpellmakerEditor?.syncLight?.(state.editorRefs);
        } else if (!w.editor && state.mainRefs) {
          syncMainLight(w, state);
        }
        state.lightSig = lSig;
      }
    }

    syncBoxOverlay(w, state, advanceViz || !w.inPort);

    if (advanceViz && !w.editor && state.mainRefs?.vizCanvas) {
      const now = root.performance?.now?.() ?? Date.now();
      if (isVizOccluded(w, state)) {
        state.vizLastTs = 0;
        state.vizLastRenderTs = 0;
      } else {
        // Pace 350x281 altar preview to ~38 FPS steady (~48 FPS during page-flip/open transitions)
        // so high-refresh (120/144Hz) monitors and live 3D WebGL interiors never contend over 2D canvas redraws.
        const ctrl = state.vizCtrl;
        const flip = ctrl?.getFlipSnapshot?.();
        const openAmt = ctrl ? ctrl.getOpenAmount() : 0;
        const inTransition = Boolean(flip?.inBurst || (flip?.leaves && flip.leaves.length > 0) || (openAmt > 0.001 && openAmt < 0.999));
        const minIntervalMs = inTransition ? 20 : 26;
        const elapsedSinceRender = state.vizLastRenderTs > 0 ? (now - state.vizLastRenderTs) : minIntervalMs;
        if (elapsedSinceRender >= minIntervalMs || state.vizLastCanvas !== state.mainRefs.vizCanvas) {
          const dt = state.vizLastTs > 0 ? Math.min(0.08, Math.max(0, (now - state.vizLastTs) / 1000)) : 0;
          state.vizLastTs = now;
          state.vizLastRenderTs = now;
          renderSpellVizFrame(w, state, state.mainRefs.vizCanvas, dt);
        }
      }
    }
  }

  function tickPort(w, cv, law) {
    try {
      if (!w) return;
      const state = ensureInstanceState(w, law);
      if (w.done) {
        teardownOverlays(state);
        return;
      }
      if (law?.icon) {
        IconRegistryApi()?.setLiveIconProvider?.(law.icon);
      }
      if (!ensureMount(w, state, cv)) return;
      renderOrSync(w, state, true);
    } catch (err) {
      report('tickPort', err);
    }
  }

  function renderPortView(w, nativeView, law) {
    try {
      if (!w || !DataApi() || !CatalogApi()) return nativeView;
      ensureStyle();
      if (law?.icon) {
        IconRegistryApi()?.setLiveIconProvider?.(law.icon);
      }
      const state = ensureInstanceState(w, law);
      if (!state.cachedPortView || state.cachedPortViewLaw !== law) {
        state.cachedPortViewLaw = law;
        state.cachedPortView = {
          title: '',
          sub: '',
          size: 'dfo-sm-host',
          blocks: [
            {
              type: 'canvas',
              cls: 'dfo-sm-driver',
              paint: (cv) => tickPort(w, cv, law),
            },
          ],
          foot: [],
        };
      }
      return state.cachedPortView;
    } catch (err) {
      report('renderPortView', err);
      return nativeView;
    }
  }

  root.__dfoSpellmaker = Object.freeze({
    renderPortView,
    evalCreationState,
    getGoldBreakdown,
    getSlotCost,
    getState: (w) => instances.get(w) || w?.__dfoSmState || null,
    openGuide: (w) => {
      const st = instances.get(w) || w?.__dfoSmState;
      if (st) openGuideModal(st);
    },
    openPicker: (w, slotIdx = null, opts = {}) => {
      const st = instances.get(w) || w?.__dfoSmState;
      if (st) openPickerModal(w, st, slotIdx, opts);
    },
    addEffectToSlot: (w, effect, slotIdx = null) => {
      const st = instances.get(w) || w?.__dfoSmState;
      return st ? addEffectToSlot(w, st, effect, slotIdx) : false;
    },
    removeSlot: (w, slotIdx) => {
      const st = instances.get(w) || w?.__dfoSmState;
      if (st) removeSlot(w, st, slotIdx);
    },
    teardown: (w) => {
      const st = instances.get(w) || w?.__dfoSmState;
      if (st) teardownOverlays(st);
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
