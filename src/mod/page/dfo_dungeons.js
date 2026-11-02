(function (root) {
  'use strict';
  if (root.__dfoDungeons || root.__DFO_MOD_CFG__?.dungeons?.enabled === false) return;
  const M = root.__dfoDungeonModel, doc = root.document, stack = [], modelCache = new WeakMap(), sprites = new Map();
  let host = null, notes = {}, current = null, loadStarted = false, readError = '', cacheError = '', lastObservation = '', lastSaved = 0, retryObservationAt = 0;
  let questMarks = [];
  const tr = text => { try { return root.__translate?.(text) || text; } catch { return text; } };
  const safe = (fn, fallback = null) => { try { return fn() ?? fallback; } catch { return fallback; } };
  const el = (tag, cls, text) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const btn = (text, action) => { const n = el('button', '', text); n.type = 'button'; n.onclick = action; return n; };
  const pct = n => typeof n === 'number' && Number.isFinite(n) ? `${M.number(100 * n)}%` : 'неизвестно', mult = n => `×${M.number(n, 2)}`;
  const when = at => new Date(at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
  const tools = () => ({ ...root.__dfoDungeonTools, ...host?.__dfoWorld, online: () => host?.params?.has('online') === true });
  const keyOf = loc => String(loc?.mapTableData?.mapId ?? '');
  const allowed = loc => M.eligible(loc) && safe(() => tools().allowed?.(loc), false) === true;
  const viewReady = () => safe(() => { const t = tools(); return t.modes?.()?.mode === 'exterior' && t.viewOpen?.() === true; }, false);

  function records() {
    const out = new Map();
    for (const p of safe(() => host.travelViewPlaces(), [])) if (M.eligible(p.summary?.loc)) out.set(p.key, { ...p, loc: p.summary.loc, px: p.summary.pixel.x, py: p.summary.pixel.y });
    for (const p of safe(() => host.travelViewFarPlaces(), [])) if (M.eligible(p.summary?.loc)) out.set(p.key, { ...p, loc: p.summary.loc, px: p.summary.pixel.x, py: p.summary.pixel.y });
    for (const p of safe(() => host.travelViewDungeons(), [])) if (p.found && M.eligible(p.loc)) out.set(p.key, p);
    for (const [key, p] of out) if (!allowed(p.loc)) out.delete(key);
    return out;
  }
  function model(p) {
    const t = tools(), player = t.player?.(); if (!player) return null;
    const weapon = t.weapon?.(player), note = notes[keyOf(p.loc)];
    const sig = JSON.stringify([Math.floor(Date.now() / 1000), player.level, player.skills, player.stats, player._mentor, weapon?.material, t.renown?.(), note?.at, t.spawnRecord?.(p)]);
    const old = modelCache.get(p.loc); if (old?.sig === sig) return old.model;
    const value = M.forecast(p, player, t, note?.online === t.online() ? note : null); modelCache.set(p.loc, { sig, model: value }); return value;
  }
  const scoreText = m => `|${m.scores.threat ? M.SKULL.repeat(m.scores.threat) : '?'}|${m.scores.loot ? '◆'.repeat(m.scores.loot) : '?'}|${m.scores.growth ? '↑'.repeat(m.scores.growth) : '?'}| ★ - ${m.scores.renown == null ? '?' : m.scores.renown.toFixed(1).replace('.', ',')}`;
  function decorate(marks) {
    if (!host) return marks;
    questMarks = marks.filter(m => /^quest:-?\d+,-?\d+$/.test(m.key || ''));
    const byKey = records();
    return marks.map(mark => {
      const p = byKey.get(mark.key); if (!p || mark.label === '?') return mark;
      const value = safe(() => model(p)); if (!value) return mark;
      const distance = /[\d.,]+\s*(?:km|m|км|м)$/.exec(mark.sub || '')?.[0];
      const metadata = value.metadata + (distance ? ` · ${distance}` : ''), rating = scoreText(value);
      const signature = JSON.stringify([value.title, metadata, rating, value.color]);
      return { ...mark, label: value.title, sub: `${metadata}; ${rating}`, pick: true,
        dfoDungeon: { model: value, metadata, signature },
        tip: () => ({ title: value.name, lines: ['ЛКМ — сведения о данже', 'Оценки персонализированы по вашему персонажу.', 'В путь — отдельной кнопкой в карточке.'] }) };
    });
  }

  function sprite(document, mark, dpr = 1) {
    const { model: m, metadata, signature } = mark.dfoDungeon, max = Math.max(180, Math.min(580, (document.defaultView?.innerWidth || 900) - 20));
    const key = `${signature}|${dpr}|${max}`, saved = sprites.get(key); if (saved) return saved;
    const c = document.createElement('canvas'), g = c.getContext('2d'); if (!g) return null;
    const ellipsis = (text, width) => { if (g.measureText(text).width <= width) return text; let s = text; while (s.length && g.measureText(s + '…').width > width) s = s.slice(0, -1); return s + '…'; };
    const segments = [
      { text: '|', color: '#e8e5dc' }, { text: m.scores.threat ? M.SKULL.repeat(m.scores.threat) : '?', color: M.COLORS.threat },
      { text: '|', color: '#e8e5dc' }, { text: m.scores.loot ? '◆'.repeat(m.scores.loot) : '?', color: M.COLORS.loot },
      { text: '|', color: '#e8e5dc' }, { text: m.scores.growth ? '↑'.repeat(m.scores.growth) : '?', color: M.COLORS.growth },
      { text: `| ★ - ${m.scores.renown == null ? '?' : m.scores.renown.toFixed(1).replace('.', ',')}`, color: M.COLORS.renown },
    ];
    g.font = '600 12px system-ui, sans-serif'; const title = ellipsis(m.title, max - 16), titleW = g.measureText(title).width;
    g.font = '11px system-ui, sans-serif'; const sub = ellipsis(metadata, max - 16), subW = g.measureText(sub).width;
    const scoreFont = '13px "Segoe UI Symbol", "DejaVu Sans", sans-serif';
    g.font = scoreFont; const scoreW = segments.reduce((n, s) => n + g.measureText(s.text).width, 0);
    const w = Math.min(max, Math.ceil(Math.max(titleW, subW, scoreW) + 16)), h = 64;
    c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr); g.scale(dpr, dpr);
    g.fillStyle = 'rgba(18,21,28,.9)'; g.fillRect(0, 0, w, h); g.strokeStyle = '#b89854'; g.lineWidth = 1; g.strokeRect(.5, .5, w - 1, h - 1);
    g.textBaseline = 'top'; g.font = '600 12px system-ui, sans-serif'; g.fillStyle = m.color;
    const split = title.indexOf(']') + 1; g.fillText(split ? title.slice(0, split) : title, 8, 6);
    if (split) { g.fillStyle = '#f2e4c0'; g.fillText(title.slice(split), 8 + g.measureText(title.slice(0, split)).width, 6); }
    g.font = '11px system-ui, sans-serif'; g.fillStyle = '#e1ddd3'; g.fillText(sub, 8, 25);
    g.font = scoreFont; let x = 8; for (const s of segments) { g.fillStyle = s.color; g.fillText(s.text, x, 43); x += g.measureText(s.text).width; }
    const result = { c, w, h }; sprites.set(key, result); if (sprites.size > 96) sprites.delete(sprites.keys().next().value); return result;
  }
  function box(q, vw) {
    const { w, h } = q.sp, x = vw > w + 8 ? Math.min(Math.max(4, q.x - w / 2), vw - 4 - w) : q.x - w / 2;
    const y = q.side === 3 ? q.y - 10 - h : !q.held ? q.y - 24 - h / 2 : q.y + 10;
    return { x0: x - 4, x1: x + w + 4, y0: Math.min(q.y - 10, y - 4), y1: Math.max(q.y + 8, y + h + 4) };
  }

  function styles() {
    if (doc.getElementById('dfo-dungeon-style')) return;
    const node = el('style'); node.id = 'dfo-dungeon-style'; node.textContent = `
.dfo-dungeon-dialog{box-sizing:border-box;color:#eee7d6;background:#181d25;border:2px solid #b89854;border-radius:7px;width:min(860px,94vw);max-height:88vh;overflow:auto;padding:20px;font:15px/1.55 system-ui,sans-serif;box-shadow:0 8px 50px #000b}.dfo-dungeon-dialog::backdrop{background:#0008}.dfo-dungeon-dialog h2{margin:0 0 6px;font-size:22px;color:#f1d58a}.dfo-dungeon-dialog h3{font-size:17px;color:#e0c789;margin:20px 0 6px}.dfo-dungeon-dialog p{margin:8px 0}.dfo-dungeon-dialog button{font:inherit;cursor:pointer;color:#eee7d6;background:#303845;border:1px solid #78828c;border-radius:4px;padding:7px 12px}.dfo-dungeon-dialog button:hover{border-color:#edca73}.dfo-dungeon-dialog button:focus-visible{outline:2px solid #f3d38a;outline-offset:2px}.dfo-dungeon-dialog button:disabled{opacity:.55;cursor:wait}.dfo-dungeon-tabs,.dfo-dungeon-footer{display:flex;flex-wrap:wrap;gap:6px;margin:14px 0}.dfo-dungeon-tabs [aria-selected=true]{color:#151515;background:#dabc72;border-color:#ffe1a0}.dfo-dungeon-footer{justify-content:flex-end;margin-bottom:0}.dfo-dungeon-personal{color:#b9c5cf;font-size:13px}.dfo-dungeon-dialog table{border-collapse:collapse;width:100%;font-size:14px}.dfo-dungeon-dialog th,.dfo-dungeon-dialog td{padding:5px 8px;border-bottom:1px solid #414753;vertical-align:top;text-align:left}.dfo-dungeon-dialog th{color:#c9b780;font-weight:500}.dfo-dungeon-table{max-width:100%;overflow-x:auto}.dfo-dungeon-dialog .dfo-dungeon-status{color:#ffaea4;min-height:1.5em}.dfo-dungeon-ratings{display:flex;gap:14px;flex-wrap:wrap;margin:12px 0;font-size:19px}.dfo-dungeon-guide{width:min(740px,94vw)}
`; doc.head.append(node);
  }
  function modal(title, guide = false) {
    styles(); const prior = doc.activeElement, node = el('dialog', `dfo-dungeon-dialog${guide ? ' dfo-dungeon-guide' : ''}`);
    const heading = el('h2', '', title); heading.id = `dfo-dungeon-title-${stack.length}`; node.setAttribute('aria-labelledby', heading.id); node.append(heading);
    const state = { node, heading, content: el('div'), status: el('p', 'dfo-dungeon-status'), close: null };
    state.status.setAttribute('role', 'status'); node.append(state.content, state.status);
    state.close = () => { if (!stack.includes(state)) return; for (const nested of [...stack.slice(stack.indexOf(state) + 1)].reverse()) nested.close(); stack.splice(stack.indexOf(state), 1); node.close(); node.remove(); if (current?.modal === state) current = null; if (prior?.isConnected) prior.focus(); };
    for (const type of ['click', 'mousedown', 'mouseup', 'pointerdown', 'wheel']) node.addEventListener(type, e => e.stopPropagation());
    node.addEventListener('cancel', e => { e.preventDefault(); e.stopPropagation(); state.close(); });
    doc.body.append(node); stack.push(state); node.showModal(); return state;
  }
  root.addEventListener('keydown', e => {
    if (!stack.length) return;
    e.stopImmediatePropagation();
    if (e.key === 'Escape') { e.preventDefault(); stack.at(-1).close(); }
    else if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) && e.target?.getAttribute('role') === 'tab') {
      e.preventDefault(); const buttons = [...e.target.parentNode.children], index = buttons.indexOf(e.target);
      buttons[e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length].click();
      buttons.find(b => b.getAttribute('aria-selected') === 'true')?.focus();
    }
  }, true);
  const paragraph = (body, text, cls = '') => body.append(el('p', cls, text));
  const section = (body, title) => body.append(el('h3', '', title));
  function table(body, headers, rows) {
    const wrap = el('div', 'dfo-dungeon-table'), t = el('table'), head = el('thead'), tr = el('tr');
    for (const word of headers) { const h = el('th', '', word); h.scope = 'col'; tr.append(h); } head.append(tr); t.append(head);
    const tbody = el('tbody'); for (const values of rows) { const row = el('tr'); for (const value of values) row.append(el('td', '', value == null ? 'неизвестно' : String(value))); tbody.append(row); } t.append(tbody); wrap.append(t); body.append(wrap);
  }
  function guide() {
    const m = modal('Как читать оценки данжа', true), b = m.content;
    paragraph(b, 'Это персональные индексы мода, а не вероятность победы или обещание конкретного дропа. Они пересчитываются по текущему персонажу.');
    section(b, '☠ Угроза — от 1 до 5');
    paragraph(b, 'Сравниваем средний уровень ожидаемых врагов с вашим эффективным уровнем, учитываем долю боссов, усиление здоровья и урона и долю врагов, которым не подходит базовый металл оружия. Усиление места, навыков, уровня и Славы читается из формул игры; элитный данж добавляет свои множители. Заклинания, тактика и мастерство игрока в индекс не входят.');
    paragraph(b, 'Индекс до округления: 1 + 1,1 × (средний уровень / максимум из 5 и вашего уровня) + доля боссов + 0,55 × log₂(здоровье × урон) + доля неподходящего металла. Результат округляем и ограничиваем от 1 до 5. Множители здоровья и урона относительны базовому виду врага.');
    section(b, '◆ Добыча — от 1 до 5');
    paragraph(b, 'Оценивает качество источников: ранг сокровищ, долю боссов и элитный данж. Индекс: 1 + 2,5 × ранг / 18 + доля боссов + 0,5 за элитный данж, с округлением и ограничением 1–5. Это не число предметов за час: количество точек и длительность зачистки снаружи неизвестны. Точные пороги редкости для вашего уровня и Удачи показаны во вкладке «Добыча».');
    section(b, '↑ Рост — от 1 до 5');
    paragraph(b, 'До навыка 100 индекс равен 5: ограничение обучения от слабого противника ещё не действует. Выше 100 берём ваш самый высокий боевой/магический навык и средний вес обучения по прогнозу врагов. Игра сравнивает (5 × уровень вызова + 30) с навыком: ниже 75% обучение боевому навыку не идёт; от 75% до 100% вес растёт квадратично; далее доходит до 1,5. Индекс мода: 1 + 4 × вес / 1,5, округлённый в пределах 1–5. Магия также имеет обучение без боя, которое этот индекс не оценивает.');
    section(b, '★ Слава — от 0,0 до 5,0');
    paragraph(b, 'Средний опыт Славы за ожидаемое убийство делим на максимальную награду за одно убийство при вашей текущей Славе и умножаем на 5. Опыт и предел берём из игры; бонусы группы и лимиты сервиса могут изменить итог. В офлайне Слава не начисляется. Сырые XP показаны в карточке.');
    section(b, 'Что известно до входа');
    paragraph(b, 'Состав — прогноз по таблице и вашему уровню, без построения данжа. Если мод игры предлагает несколько таблиц, используется их равновесная смесь. Фиксированные и водные враги, серверная память предыдущего посетителя и квестовые подкрепления могут отличаться. Наблюдения после посещения показываются отдельно со временем; они не гарантируют текущее состояние комнаты.');
    paragraph(b, 'Число врагов и сундуков без чтения игровых блоков заранее неизвестно. Клиент снаружи не знает общий онлайн внутри, точное содержимое сундуков, состояние Aurum и выработку жил. Отсутствие записи в журнале исчезновения не доказывает, что никто не входил.');
    b.append(btn('Закрыть', m.close));
  }

  const TABS = [['overview', 'Оценка'], ['enemies', 'Враги'], ['loot', 'Добыча'], ['resources', 'Ресурсы'], ['world', 'Мир и группа'], ['visit', 'Посещение']];
  function contents(body, tab, m, p) {
    if (tab === 'overview') {
      const ratings = el('div', 'dfo-dungeon-ratings');
      for (const [id, icon, title] of [['threat', M.SKULL, 'Угроза'], ['loot', '◆', 'Добыча'], ['growth', '↑', 'Рост'], ['renown', '★', 'Слава']]) { const r = el('span', '', `${icon} ${title}: ${m.scores[id] == null ? '?' : M.number(m.scores[id])}/5`); r.style.color = M.COLORS[id]; r.style.fontFamily = '"Segoe UI Symbol", "DejaVu Sans", sans-serif'; ratings.append(r); } body.append(ratings);
      paragraph(body, 'Оценки учитывают данные вашего персонажа и персонализированы. Это прогноз для выбора цели, а не подтверждённый состав сетевого данжа.');
      if (!m.ready) paragraph(body, 'Часть данных игры ещё недоступна. Оценки не подменяются выдуманными числами.');
      section(body, 'Почему такая угроза');
      paragraph(body, `Ожидаемый средний уровень: ${M.number(m.meanLevel)}; боссов по правилам добычи: ${pct(m.boss)}. Среднее усиление здоровья ${mult(m.hp)}, урона ${mult(m.damage)}. Ваш эффективный уровень: ${m.level}.`);
      paragraph(body, m.blocked == null ? 'Оружие в руках не определено; пригодность металла не оценена.' : `По базовому металлу оружие не подходит ${pct(m.blocked)} ожидаемых врагов. Это не учитывает заклинания и особые способы атаки.`);
      section(body, 'Зачем идти');
      paragraph(body, `Добыча: ранг ${m.rank ?? '?'}; ${m.elite ? 'элитные множители и больше противников' : 'обычные множители'}. ${m.family ? `При легендарном выборе предпочтительна семья «${M.FAMILY[m.family] || m.family}».` : 'Предпочтительной семьи легендарных вещей нет.'}`);
      paragraph(body, m.bestSkill > 100 ? `Рост: лучший боевой/магический навык ${m.bestSkill}; средний вес обучения ${M.number(m.growthWeight, 2)} из 1,5. Высокий индекс означает подходящий вызов для этого навыка.` : `Рост: лучший боевой/магический навык ${m.bestSkill || 'ещё не известен'}. До 100 ограничение от слабого противника не применяется.`);
      paragraph(body, m.xp == null ? 'Слава: в офлайне не начисляется; в онлайне требуется известный уровень Славы.' : `Слава: в среднем ${M.number(m.xp)} XP за убийство до бонуса группы и ограничений сервиса.`);
      if (m.aurum != null) paragraph(body, `Дополнительная цель: Aurum ${m.aurum}. ${m.aurumTaken === true ? 'На этом устройстве есть отметка о получении на текущей неделе.' : 'Текущее серверное состояние сундука снаружи неизвестно.'}`);
      if (m.note) paragraph(body, `Есть наблюдение от ${when(m.note.at)} — подробнее во вкладке «Посещение».`, 'dfo-dungeon-personal');
    } else if (tab === 'enemies') {
      paragraph(body, `Прогноз для уровня ${m.level}; ${m.alternate ? 'вариативный' : 'классический'} выбор. ${m.choices > 1 ? `Усреднение ${m.choices} возможных таблиц; активный выбор мода не изменяется.` : 'Одна таблица встреч.'} Доли относятся к случайным сухопутным точкам, не ко всем врагам данжа.`);
      table(body, ['Враг', 'Доля', 'Уровень', 'Усиление HP / урона', 'Уровень вызова', 'Металл'], m.rows.map(r => [tr(r.name), pct(r.probability), r.level, `${mult(r.hp)} / ${mult(r.damage)}`, M.number(r.challenge), r.minMetal < 0 ? 'любой' : `${M.METALS[r.minMetal] || r.minMetal} и лучше`]));
      paragraph(body, 'Босс для оценки добычи — даэдра по affinity либо враг уровня 18+. Это не обязательно отдельный босс с особым именем. Фиксированные, водные и квестовые враги сюда не входят.');
      paragraph(body, 'В элитном данже обычных врагов ×3, их базовые здоровье и урон ×2. Особые элитные враги — отдельный механизм; точное число подходящих точек без раскладки блоков неизвестно.');
      if (m.eliteSlots != null) paragraph(body, `План элитных врагов для ID этого места: до ${m.eliteSlots}. Это штатный детерминированный бюджет, а не подтверждение присутствия: нужны подходящие враги, а сохранённая сервером комната может отличаться. Особые элитные черты в общий индекс угрозы не входят.`);
    } else if (tab === 'loot') {
      table(body, ['Параметр', 'Значение'], [['Ранг сокровищ', m.rank], ['Удача персонажа', m.luck], ['Множитель качества элитного данжа', m.elite ? '×1,2' : '×1'], ['Доля боссов', pct(m.boss)], ['Система редкости', m.lootOn ? 'включена' : 'выключена']]);
      if (m.chances) table(body, ['Порог подходящего предмета из сундука', 'Вероятность'], [['Не ниже магического', `${M.number(m.chances.magic / 10, 2)}%`], ['Не ниже редкого', `${M.number(m.chances.rare / 10, 2)}%`], ['Не ниже легендарного', `${M.number(m.chances.legendary / 10, 2)}%`]]);
      paragraph(body, 'Это вложенные пороги для предмета, пригодного для редкости, а не независимые события и не шанс на весь сундук. Уровень, Удача и доступные усиления поиска читаются из текущей игры. Количество предметов и точек снаружи неизвестно.');
      section(body, 'Предпочтительные легендарные вещи');
      paragraph(body, m.family ? `Семья «${M.FAMILY[m.family] || m.family}»: при уже состоявшемся легендарном выборе её предметы имеют пятикратный вес. Ранг не гарантирует легендарный предмет.` : 'У этого типа нет предпочтительной семьи.');
      if (m.signatures.length) table(body, ['Предмет', 'ID'], m.signatures.map(r => [tr(r.name), r.id]));
      paragraph(body, 'Трупы используют собственные уровень и семью врага; босс имеет более щедрый источник. Сундуки используют тип данжа. Чемпионы, квесты и особые враги могут иметь собственные правила.');
    } else if (tab === 'resources') {
      section(body, 'Aurum');
      paragraph(body, !m.online ? 'Сундук Aurum доступен только в онлайне.' : m.aurum == null ? 'Награда Aurum для этого места недоступна клиенту.' : `Награда сундука: ${m.aurum} Aurum. Перезаполнение — в понедельник по неделе сервиса.`);
      paragraph(body, m.aurumTaken === true ? 'Локальный журнал текущего аккаунта отмечает получение на этой неделе. Серверное подтверждение доступно при взаимодействии внутри.' : m.aurumTaken === false ? 'Локальной отметки текущего аккаунта на этой неделе нет. Это не подтверждение, что сундук сейчас доступен.' : 'Локальный журнал текущего аккаунта не доступен. Серверный статус снаружи не запрашивается.');
      section(body, 'Жилы на сегодня');
      if (m.veins) table(body, ['Жила', 'Материал', 'Уровень'], m.veins.map((r, i) => [i + 1, M.MATERIALS[r.material] || r.material, r.tier]));
      else paragraph(body, 'Список жил для этого места недоступен.');
      paragraph(body, 'Состав рассчитан штатным законом профессий для текущего дня сервиса. Выработку знает сервис профессий; наличие строки не означает, что жила ещё не выкопана. Ключ места учитывает полную идентичность данжей за пределами залива.');
    } else if (tab === 'world') {
      const regionName = p.loc.regionName || safe(() => root.__dfoWorld.maps().getRegionName(p.loc.regionIndex));
      table(body, ['Место', 'Данные'], [['Тип', m.typeName], ['Размер по правилам клиента', m.size], ['Блоков исходной локации', p.loc.dungeon?.blocks?.length], ['Уровень данжа', m.elite ? 'элитный' : 'обычный'], ['Происхождение', m.life.text], ['Регион', tr(regionName) || p.loc.regionIndex], ['ID карты', keyOf(p.loc)], ['Координаты карты', `${p.px}, ${p.py}`], ['Возрождение врагов и сундуков', m.respawn == null ? null : `${M.number(m.respawn / 60000)} мин`]]);
      if (m.life.expires) paragraph(body, `Предельный срок по журналу: ${when(m.life.expires)}. ${m.life.cleared ? 'Журнал отмечает зачистку.' : 'Журнал содержит первый вход.'} Нахождение игрока внутри может задерживать исчезновение; точную текущую занятость снаружи клиент не знает.`);
      else if (p.loc.spawned) paragraph(body, 'Нет актуальной записи о сроке исчезновения в доступном журнале. Это означает «неизвестно», а не «вечный» или «никто не входил».');
      section(body, 'Квесты и награды');
      const bounties = safe(() => host.bountyHost.mapMarks(), []).filter(b => Math.floor(b.cx) === p.px && Math.floor(b.cy) === p.py);
      paragraph(body, bounties.length ? bounties.map(b => tr(b.label || 'Награда на это место')).join('; ') : 'Клиент не сообщает активной награды для этих координат.');
      const quests = questMarks.filter(r => r.key === `quest:${p.px},${p.py}`);
      if (quests.length) paragraph(body, `На эти координаты указывает метка квеста: ${quests.map(r => tr(r.label)).join('; ')}.`);
      paragraph(body, 'Привязки к квестам и группа отображаются только когда клиент явно сообщает данж: совпадение одних координат не считается подтверждением присутствия.');
      section(body, 'Группа');
      const poseOf = peer => peer.p ?? peer.pose ?? peer, roomOf = peer => peer.room ?? poseOf(peer).room;
      const peers = safe(() => host.social?.others?.(), []).filter(peer => {
        const pose = poseOf(peer);
        return new RegExp(`^dungeon:m${keyOf(p.loc)}(?:\\.[sm])?$`).test(roomOf(peer) || '')
          || (pose.in === 1 && pose.px === p.px && pose.py === p.py && pose.loc === p.loc.name);
      });
      const bar = (pose, now, max) => typeof pose[now] === 'number' ? `${pose[now]}${typeof pose[max] === 'number' ? ' / ' + pose[max] : ''}` : null;
      if (peers.length) {
        table(body, ['Сопартиец', 'Здоровье', 'Магия', 'Усталость', 'Комната / источник'], peers.map(r => { const q = poseOf(r); return [r.name || 'Сопартиец', bar(q, 'h', 'hm'), bar(q, 'm', 'mm'), bar(q, 'f', 'fm'), roomOf(r) || q.ins || 'место в позе группы']; }));
        paragraph(body, 'Это последние доступные сведения группы; они могут устареть. Размер/инстанс комнаты указан только если он сообщён.');
      }
      else paragraph(body, 'Нет доступных подтверждённых данных о сопартийцах в этом данже. Общее число игроков внутри снаружи не известно.');
    } else {
      paragraph(body, 'Здесь сохраняются только наблюдения этого клиента после посещения. Это исторические сведения: другие игроки, возрождение или новая память комнаты могли изменить данж.');
      if (!m.note) { paragraph(body, 'Сохранённых наблюдений об этом данже нет.'); return; }
      paragraph(body, `Наблюдалось: ${when(m.note.at)} (${m.note.online ? 'онлайн' : 'офлайн'}).`);
      table(body, ['Последнее наблюдение', 'Количество'], [['Живых врагов', m.note.alive], ['Убитых врагов', m.note.dead], ['Наземных куч', m.note.piles], ['Трупов в списке целей', m.note.corpses], ['Дверей, состояние которых доступно', m.note.doors], ['Открытых из них', m.note.openDoors]]);
      table(body, ['Наблюдавшийся вид', 'Количество'], m.note.counts.map(r => [tr(tools().enemyName?.(r.type) || `Враг ${r.type}`), r.count]));
      paragraph(body, 'Точные содержимое сундуков, игроки вне группы и неизвестные состояния испытаний не восстанавливаются по косвенным признакам.');
    }
  }
  function render(force = false) {
    if (!current) return;
    const p = records().get(current.key), m = p && model(p), state = current;
    if (!m) { state.modal.status.textContent = 'Метка больше не доступна. Путешествие не запускается.'; state.travel.disabled = true; return; }
    const signature = JSON.stringify([m, state.tab, readError, cacheError]); if (!force && signature === state.signature) return;
    state.signature = signature; state.place = p; state.modal.heading.textContent = m.name || 'Данж';
    for (const [id, b] of state.tabs) { const yes = id === state.tab; b.setAttribute('aria-selected', String(yes)); b.tabIndex = yes ? 0 : -1; }
    const scroll = state.modal.node.scrollTop; state.body.replaceChildren(); contents(state.body, state.tab, m, p); state.modal.node.scrollTop = scroll;
    state.body.setAttribute('aria-labelledby', `dfo-dungeon-tab-${state.tab}`);
    state.travel.disabled = state.travelling; state.modal.status.textContent = readError || cacheError || state.message || '';
  }
  function open(key) {
    if (!viewReady()) return false;
    const p = records().get(key); if (!p) return false;
    void loadNotes();
    if (current) { current.key = key; current.tab = 'overview'; render(true); return true; }
    const m = modal(p.loc.name || 'Данж'), tabs = el('div', 'dfo-dungeon-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Сведения о данже');
    paragraph(m.content, 'Персональная оценка по текущим данным персонажа. Прогноз и наблюдения разделены.', 'dfo-dungeon-personal'); m.content.append(tabs);
    const body = el('div'); body.setAttribute('role', 'tabpanel'); body.id = 'dfo-dungeon-content'; m.content.append(body);
    current = { modal: m, key, tab: 'overview', tabs: new Map(), body, travelling: false, signature: '' };
    for (const [id, word] of TABS) { const b = btn(word, () => { if (current) { current.tab = id; render(true); } }); b.setAttribute('role', 'tab'); b.setAttribute('aria-controls', body.id); b.id = `dfo-dungeon-tab-${id}`; tabs.append(b); current.tabs.set(id, b); }
    const foot = el('div', 'dfo-dungeon-footer'), travel = btn('В путь', async () => {
      const state = current; if (!state || state.travelling) return;
      if (!viewReady()) { closeAll(); return; }
      const live = records().get(state.key); if (!live) { m.status.textContent = 'Метка больше не доступна.'; travel.disabled = true; return; }
      state.travelling = true; travel.disabled = true;
      state.message = '';
      try { const ok = await tools().travel?.(live); if (ok) closeAll(); else m.status.textContent = state.message = 'Игра не начала путешествие. Проверьте сообщение игры и условия пути.'; }
      catch (e) { m.status.textContent = state.message = e.message || String(e); }
      finally { state.travelling = false; if (travel.isConnected) travel.disabled = false; }
    }); current.travel = travel; foot.append(btn('Мини-гайд', guide), travel, btn('Закрыть', m.close)); m.content.append(foot); render(true); return true;
  }
  function closeAll() { for (const m of [...stack].reverse()) m.close(); }
  async function loadNotes() {
    if (loadStarted) return; loadStarted = true;
    try { const r = await root.fetch('/dfo-mod/dungeon-notes', { cache: 'no-store' }); if (!r.ok) throw new Error('Не удалось прочитать журнал посещений.'); const value = await r.json(); for (const v of value.notes || []) { const n = M.cleanNote(v); if (n && (!notes[n.id] || notes[n.id].at < n.at)) notes[n.id] = n; } readError = ''; }
    catch (e) { readError = e.message; loadStarted = false; }
  }
  function observe() {
    const t = tools(), modes = t.modes?.();
    if (Date.now() < retryObservationAt) return;
    if (modes?.mode !== 'dungeon') return;
    const loc = modes.dungeonLocation, ctx = modes.dungeonCtx; if (!allowed(loc) || !ctx?.foes) return;
    const counts = new Map(); let alive = 0, dead = 0;
    for (const f of ctx.foes) { const id = f.src?.mobileType ?? f.entity?.mobileType; if (!Number.isInteger(id) || f.src?.allied || f.companion != null) continue; counts.set(id, (counts.get(id) || 0) + 1); if (f.dead || f.corpse) dead++; else alive++; }
    const targets = safe(() => ctx.lootTargets(), null), objects = safe(() => [...ctx.actions.objects.values()], null);
    const doors = objects ? objects.filter(r => r.kind === 'door') : null;
    const value = M.cleanNote({ id: keyOf(loc), at: Date.now(), online: t.online(), counts: [...counts].map(([type, count]) => ({ type, count })), alive, dead,
      piles: targets ? targets.filter(r => /^(loot|droppedLoot):/.test(r.key)).length : null, corpses: targets ? targets.filter(r => /^corpse:/.test(r.key)).length : null,
      doors: doors ? doors.length : null, openDoors: doors ? doors.filter(r => r.state === 'end').length : null });
    if (!value) return;
    const signature = JSON.stringify({ ...value, at: 0 });
    if (signature === lastObservation && Date.now() - lastSaved < 30000) return;
    lastObservation = signature; lastSaved = Date.now(); notes[value.id] = value;
    root.fetch('/dfo-mod/dungeon-notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }).then(r => { if (!r.ok) throw new Error('Не удалось сохранить журнал посещений.'); cacheError = ''; }).catch(e => { cacheError = e.message; lastObservation = ''; retryObservationAt = Date.now() + 30000; });
  }
  root.__dfoDungeons = { register(value) { if (host && host !== value) closeAll(); host = value; lastObservation = ''; retryObservationAt = 0; void loadNotes(); }, decorate, sprite, box, open, closeAll,
    isOpen: () => stack.length > 0, state: () => ({ key: current?.key ?? null, tab: current?.tab ?? null }) };
  root.setInterval(() => { if (!host) return; safe(observe); if (current) { if (!viewReady()) closeAll(); else safe(() => render()); } }, 1500);
})(globalThis);
