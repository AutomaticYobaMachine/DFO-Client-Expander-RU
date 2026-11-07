#!/usr/bin/env node
"use strict";
const { uiScripts } = require("./ui-text-stand.cjs");
// Exercise the published client renderers and production transforms. Only data
// and the scene loop are fixtures; there is no second implementation of a window.
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  assert = require("node:assert/strict");
const { parse } = require(process.env.DFO_ACORN_MODULE || "acorn");
const { chromium } = require(process.env.DFO_PLAYWRIGHT_MODULE || "playwright");
const {
  geometry,
  interactions,
  settle,
} = require("./check-service-interactions.cjs");
const {writeGallery}=require('./service-window-gallery.cjs');
const root = path.resolve(__dirname, ".."),
  payload = process.env.DFO_SERVICE_PAYLOAD_DIR,
  modDir = payload ? path.join(payload, "mod") : path.join(root, "src/mod"),
  dataDir = path.join(payload || root, "data/ru"),
  build = process.env.DFO_BUILD_DIR,
  assets = path.join(build || "", "assets");
assert.ok(build, "DFO_BUILD_DIR must point to verified published assets");
const { transformAsset } = require(path.join(modDir, "transforms.cjs")),
  { buildDict, buildI18n } = require(
    path.join(
      payload ? path.join(payload, "patcher") : path.join(root, "src"),
      "ru-build.cjs",
    ),
  );
const files = fs.readdirSync(assets).filter((f) => f.endsWith(".js")),
  source = (f) => fs.readFileSync(path.join(assets, f), "utf8");
const choose = (prefix, word) =>
  files.find((f) => f.startsWith(prefix) && source(f).includes(word));
const mods = {
  ports: choose("arenaGate-", "spellMaker:"),
  enchant: choose("virtueLevelUp-", "selectingPowers"),
  picker: choose("listPicker-", "pick-shell"),
  trade: choose("enhancedTrade-", "as mountEnhancedTrade"),
  book: choose("enhancedSpellbook-", "as mountEnhancedSpellbook"),
  nativeBook: choose("spellbookWindow-", "refreshSpellsList("),
  broker: choose("brokerWindow-", "as mountBrokerWindow"),
  board: choose("noticeWindow-", "as mountNoticeBoard"),
  standard: choose("standardSpells-", "registerSpellRecordsAsset"),
};
for (const [k, v] of Object.entries(mods))
  assert.ok(v, "Missing published module " + k);
function symbols(s) {
  const out = { f: [], c: [], v: [] },
    stack = [parse(s, { ecmaVersion: "latest", sourceType: "module" })];
  while (stack.length) {
    const n = stack.pop();
    if (!n || typeof n !== "object") continue;
    const t = s.slice(n.start, n.end);
    if (n.type === "FunctionDeclaration")
      out.f.push({ name: n.id.name, text: t });
    if (n.type === "VariableDeclarator") {
      out.v.push({ name: n.id.name, text: t });
      if (n.init?.type === "ClassExpression")
        out.c.push({ name: n.id.name, text: t });
    }
    if (n.type === "ClassDeclaration") out.c.push({ name: n.id.name, text: t });
    for (const v of Object.values(n))
      if (v && typeof v === "object")
        Array.isArray(v) ? stack.push(...v) : stack.push(v);
  }
  return out;
}
function expose(s, f) {
  if (![mods.ports, mods.enchant, mods.picker, mods.nativeBook].includes(f))
    return "";
  const a = symbols(s),
    find = (list, ...parts) => {
      const v = a[list]
        .filter((x) => parts.every((p) => x.text.includes(p)))
        .sort((x, y) => x.text.length - y.text.length)[0];
      assert.ok(v, "Missing native test seam " + parts);
      return v.name;
    };
  let p = [];
  if (f === mods.ports)
    p = [
      ["port", find("f", "port-host port-", "new Proxy")],
      ["specs", find("v", "Object.freeze({guild:", "spellMaker:")],
      ["SpellMaker", find("c", "firstFreeSlot()", "effectOf(")],
      ["EffectEditor", find("c", "descriptionRows()", "setValue(")],
      ["Bank", find("c", "transactionType", "loanBorrow")],
      [
        "effects",
        /effectOf\([\w$]+\)\{return [\w$]+\?([\w$]+)\.find\(/.exec(s)[1],
      ],
    ];
  if (f === mods.enchant)
    p = [["ItemMaker", find("c", "selectingPowers", "_pickPrimary(")]];
  if (f === mods.nativeBook)
    p = [
      [
        "SpellShop",
        find("c", "buyButton()", "tradePrice()", "refreshSpellsList("),
      ],
    ];
  if (f === mods.picker) {
    const geo = /\{x:([\w$]+),y:([\w$]+),list:([\w$]+)\.list\}/.exec(s);
    assert.ok(geo, "Missing native picker geometry");
    p = [
      ["pickerGeo", `{x:${geo[1]},y:${geo[2]},list:${geo[3]}.list}`],
      ["ListPicker", find("c", "rowsDisplayed", "rowHeight(")],
      [
        "drawPicker",
        find("f", "JSON.stringify(", ".selectedIndex", ".watchdog"),
      ],
    ];
  }
  return (
    "\n;globalThis.serviceNative={...globalThis.serviceNative," +
    p.map(([k, v]) => k + ":" + v).join(",") +
    "};"
  );
}
const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8">${uiScripts()}<title>DFO service windows — actual client audit</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:radial-gradient(ellipse at 45% 30%,#30332d,#101416 65%)}#scene{position:fixed;inset:0;width:100%;height:100%}</style><script>globalThis.__serviceModules=${JSON.stringify(mods)};globalThis.__DFO_MOD_CFG__={ru:{on:true},fonts:{enabled:true},itemCards:{enabled:true}};</script><script src="/dfo-mod/dfo_font_data.js"></script><script src="/dfo-mod/dfo_fonts.js"></script><script src="/dfo-mod/ru_dict.js"></script><script src="/dfo-mod/ru_i18n.js"></script><script src="/dfo-mod/ru_items.js"></script><script src="/dfo-mod/dfo_item_cards.js"></script><script src="/dfo-mod/dfo_service_details.js"></script><script src="/dfo-mod/dfo_services.js"></script></head><body><canvas id="scene" width="1920" height="1080"></canvas><div id="service-host"></div><script type="module" src="/service-fixture.js"></script></body></html>`;
const fixture = fs.readFileSync(
  path.join(__dirname, "fixtures/service-windows.mjs"),
  "utf8",
);
const report = {
  clientVersion: process.env.DFO_BUILD_TAG || null,
  modVersion: require(path.join(modDir, "version.json")).version,
  modules: mods,
  windows: [],
  errors: [],
  warnings: [],
};
const server = http.createServer((req, res) => {
  try {
    const u = new URL(req.url, "http://local");
    if (u.pathname === "/favicon.ico") {
      res.writeHead(204);
      return res.end();
    }
    let data,
      type = "text/javascript;charset=utf-8";
    if (u.pathname === "/") {
      data = html;
      type = "text/html;charset=utf-8";
    } else if (u.pathname === "/service-fixture.js") data = fixture;
    else if (u.pathname === "/dfo-mod/ru_dict.js") data = buildDict(dataDir);
    else if (u.pathname === "/dfo-mod/ru_i18n.js") data = buildI18n(dataDir);
    else if (u.pathname.startsWith("/dfo-mod/")) {
      const name = path.basename(u.pathname),
        font = /\.(ttf|otf)$/.test(name);
      const p = path.join(modDir, font ? "fonts" : "page", name);
      if (!fs.existsSync(p) && name.startsWith("dfo_service")) data = "";
      else data = fs.readFileSync(p);
      if (font) type = "font/" + (name.endsWith(".otf") ? "otf" : "ttf");
    } else if (
      u.pathname.startsWith("/arena2/") &&
      process.env.DFO_ARENA2_DIR
    ) {
      data = fs.readFileSync(
        path.join(
          process.env.DFO_ARENA2_DIR,
          path.basename(u.pathname).toUpperCase(),
        ),
      );
      type = "application/octet-stream";
    } else if (u.pathname.startsWith("/assets/")) {
      const f = path.basename(u.pathname),
        raw = source(f),
        out = transformAsset("assets/" + f, raw, {
          fonts: true,
          itemCards: true,
          ru: true,
          nearbyLoot: false,
          dungeons: false,
          marks: false,
        });
      data = out.text + expose(raw, f);
    } else {
      res.writeHead(404);
      return res.end();
    }
    res.setHeader("Content-Type", type);
    res.end(data);
  } catch (e) {
    console.error(req.url, e);
    res.writeHead(500);
    res.end(String(e));
  }
});
async function main() {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.DFO_CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    });
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
    });
    page.on("pageerror", (e) => {
      report.errors.push(e.stack);
      console.error("PAGE", e.message);
    });
    page.on("console", (m) => {
      if (m.type() === "warning" && /^\[(?:DFO services|port)\]/.test(m.text()))
        report.warnings.push(m.text());
      if (
        m.type() === "error" ||
        (m.type() === "warning" && m.text().startsWith("[port]"))
      )
        console.error("BROWSER", m.text().slice(0, 220));
    });
    await page.goto(
      "http://127.0.0.1:" + server.address().port + "/?skin=enhanced&ru&online",
    );
    await page.waitForFunction(() => globalThis.ready, { timeout: 60000 });
    const dir =
      process.env.DFO_SCREENSHOT_DIR ||
      path.join(root, "docs/service-window-checks");
    fs.mkdirSync(dir, { recursive: true });
    for (const kind of (
      process.env.DFO_SERVICE_CASES ||
      "broker,broker-panoply,trade-buy,trade-sell,spells,spellshop,spellmaker,spellmaker-editor,spellmaker-editor-continuous,spellmaker-editor-absorb,spellmaker-picker,spellmaker-variant,board,board-orders,bank,bank-deposit,enchant,enchant-picker,enchant-parameter,enchant-spell"
    ).split(",")) {
      try {
        const text = await page.evaluate((k) => servicesAudit.show(k), kind);
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(dir, kind + ".png") });
        const bounds = await geometry(page, kind);
        report.windows.push({
          kind,
          text: text.slice(0, 1500),
          geometry: bounds,
        });
        console.log("SCREEN", kind, text.replace(/\n/g, " ").slice(0, 130));
      } catch (e) {
        console.error("CASE", kind, e.message);
        report.windows.push({ kind, error: e.message });
        await page.screenshot({ path: path.join(dir, kind + "-error.png") });
        if (process.env.DFO_SERVICE_FAIL_FAST === "1") throw e;
      }
    }
    assert.equal(
      report.windows.filter((w) => w.error).length,
      0,
      "A requested window failed",
    );
    report.interactions = await interactions(page);
    report.smallScreens = [];
    for (const viewport of [
      { width: 1366, height: 768 },
      { width: 1280, height: 720 },
    ]) {
      await page.setViewportSize(viewport);
      for (const kind of report.windows.map((w) => w.kind)) {
        await page.evaluate((k) => servicesAudit.show(k), kind);
        await settle(page);
        const bounds = await geometry(page, kind);
        report.smallScreens.push({ viewport, kind, geometry: bounds });
      }
    }
    fs.writeFileSync(
      path.join(dir, "checks.json"),
      JSON.stringify(report, null, 2),
    );
    console.log("Saved", dir);
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.warnings, []);
    writeGallery(dir, report);
  } finally {
    if (browser) await browser.close();
    await new Promise((r) => server.close(r));
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
