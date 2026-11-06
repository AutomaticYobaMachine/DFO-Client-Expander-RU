"use strict";
const fs = require("node:fs"),
  path = require("node:path");
const names = {
  broker: "Рейдовый магазин за угольки",
  "broker-panoply": "Недельное вооружение боевого мага",
  "trade-buy": "Покупка предметов",
  "trade-sell": "Продажа предметов",
  spells: "Книга и выбор заклинаний",
  spellshop: "Покупка заклинаний",
  spellmaker: "Создание заклинания",
  "spellmaker-editor": "Параметры: мгновенный урон",
  "spellmaker-editor-continuous": "Параметры: длительный урон",
  "spellmaker-editor-absorb": "Параметры: поглощение, предел 50%",
  "spellmaker-picker": "Выбор группы эффекта",
  "spellmaker-variant": "Выбор варианта эффекта",
  board: "Доска объявлений",
  "board-orders": "Заказы города",
  bank: "Банк",
  "bank-deposit": "Банк: ввод суммы",
  enchant: "Зачарование предмета",
  "enchant-picker": "Выбор свойства зачарования",
  "enchant-parameter": "Выбор параметра: навык",
  "enchant-spell": "Выбор встроенного заклинания",
};
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function writeGallery(dir, report) {
  const figures = report.windows
    .map(
      (w) =>
        `<figure id="${w.kind}"><figcaption>${escape(names[w.kind] || w.kind)}</figcaption><a href="${w.kind}.png"><img src="${w.kind}.png" alt="${escape(names[w.kind] || w.kind)}" width="1920" height="1080" loading="lazy"></a><p><a href="${w.kind}.png">Открыть отдельный PNG, 1920×1080</a></p></figure>`,
    )
    .join("\n");
  const intro = `DFO-Client-Expander-RU ${escape(report.modVersion)} · клиент ${escape(report.clientVersion || "из DFO_BUILD_DIR")}`;
  fs.writeFileSync(
    path.join(dir, "index.html"),
    `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Проверка игровых окон DFO</title><style>html{color-scheme:dark;background:#101315;color:#e8e1d2;font:17px/1.5 system-ui}body{max-width:1360px;margin:32px auto;padding:0 20px}h1{font-size:28px;color:#dec38b}a{color:#accfe4}nav{display:flex;flex-wrap:wrap;gap:8px 20px;margin:24px 0}figure{margin:32px 0;border:1px solid #69604c;background:#181b1d;padding:12px}figcaption{font-size:22px;color:#dec38b;margin:0 0 12px}img{display:block;width:100%;height:auto}figure p{margin:8px 0 0;font-size:14px}.note{color:#bdb7ab;max-width:1000px}</style><h1>Проверочные скриншоты игровых окон</h1><p>${intro}</p><p class="note">Настоящие построители интерфейса опубликованного клиента и код из payload собранного EXE. Персонаж, товары и ответы сервера — данные проверочного стенда. Эти снимки не подтверждают совершение покупок или банковских операций на игровом сервере.</p><p>Проверено ${report.windows.length} состояний на Full HD и ещё ${report.smallScreens.length} состояний на 1366×768 / 1280×720; сценариев взаимодействия — ${report.interactions.length}. Ошибок JavaScript: ${report.errors.length}.</p><p><a href="../service-windows.md">Описание изменений</a> · <a href="checks.json">Полный машинный отчёт</a></p><nav>${report.windows.map((w) => `<a href="#${w.kind}">${escape(names[w.kind] || w.kind)}</a>`).join("")}</nav>${figures}</html>\n`,
  );
  fs.writeFileSync(
    path.join(dir, "README.md"),
    `# Проверка окон ${report.modVersion}\n\n[Галерея](index.html) · [Отчёт](checks.json) · [Изменения](../service-windows.md)\n\nОригинальные построители клиента с тестовыми данными; сетевые сделки не выполнялись.\n\n${report.windows.map((w) => `- [${names[w.kind] || w.kind}](${w.kind}.png)`).join("\n")}\n`,
  );
}
module.exports = { writeGallery };
