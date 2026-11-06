"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const details = require("../src/mod/page/dfo_service_details.js");
const {
  transformServices,
} = require("../src/mod/service-windows-transform.cjs");
const { injectPage, expectedHooks } = require("../src/mod/transforms.cjs");
const S = Object.freeze({
  durationBase: 3,
  durationMod: 2,
  durationPerLevel: 4,
  chanceBase: 30,
  chanceMod: 5,
  chancePerLevel: 3,
  magnitudeBaseLow: 5,
  magnitudeBaseHigh: 10,
  magnitudeLevelBase: 2,
  magnitudeLevelHigh: 4,
  magnitudePerLevel: 3,
});
const effect = (type, subType, flags = {}) => ({ type, subType, ...flags });

test("descriptions are read-only, deterministic and preserve unsupported effects", () => {
  const random = Math.random;
  Math.random = () => {
    throw Error("Description rolled game RNG");
  };
  try {
    for (const key of Object.keys(details.mechanics)) {
      const e = Object.freeze(
        effect(+key, 255, { duration: true, chance: true, magnitude: true }),
      );
      assert.deepEqual(details.spell(e, S, 24), details.spell(e, S, 24));
      assert.doesNotMatch(
        JSON.stringify(details.spell(e, S, 24)),
        /undefined|NaN|Infinity|\{\w+\}/,
      );
    }
    for (const e of [
      null,
      undefined,
      {},
      { key: "nonsense" },
      effect(999, 255),
    ])
      assert.equal(details.spell(e, S, 24), null);
    assert.equal(details.enchant("Unknown", 0), null);
    assert.equal(
      details.spell(effect(4, 0, { magnitude: true }), {}, 24),
      null,
    );
    assert.equal(
      details.spell(
        effect(1, 0, { duration: true }),
        { ...S, durationMod: NaN },
        24,
      ),
      null,
    );
  } finally {
    Math.random = random;
  }
});

test("player-facing exceptional laws are explicit rather than guessed", () => {
  const all = (type, sub, flags = {}) =>
    JSON.stringify(details.spell(effect(type, sub, flags), S, 24));
  assert.match(all(20, 255, { chance: true }), /50%/);
  assert.match(all(20, 255, { chance: true }), /ПОЛУЧАТЕЛЯ/);
  assert.match(all(2, 255, { duration: true }), /14 игр\. мин\./);
  assert.match(all(6, 1, { chance: true }), /без добычи/);
  assert.match(all(11, 0, { magnitude: true }), /Не повышает здоровую/);
  assert.match(all(11, 8, { magnitude: true }), /не на остаток здоровья/);
  assert.match(all(1, 1, { duration: true, magnitude: true }), /M × 64/);
  assert.match(JSON.stringify(details.enchant("FeatherWeight", 0)), /0,25 кг/);
  assert.match(JSON.stringify(details.enchant("EnhancesSkill", 0)), /15/);
  assert.match(
    JSON.stringify(details.enchant("WeakensArmor", 0)),
    /min\(0, \+5\) = 0/,
  );
  assert.match(JSON.stringify(details.enchant("RepairsObjects", 0)), /50/);
  assert.match(JSON.stringify(details.enchant("VampiricEffect", 0)), /2,25 м/);
  for (const type of Object.keys(details.enchantNames))
    for (const param of [null, 0, 1, 2, 4, 15]) {
      const r = details.enchant(type, param, {
        cost: -500,
        name: "Проверочный вариант",
      });
      assert.ok(r.summary.length > 40, type);
      assert.doesNotMatch(JSON.stringify(r), /undefined|NaN|Infinity/);
      assert.equal(
        r.stats.find(([k]) => k === "Освобождает бюджет")[1],
        "500 очк.",
      );
    }
});

test("service bootstrap respects independent language/font features", () => {
  const html = "<html><head></head><body></body></html>";
  for (const ctx of [
    { ru: true },
    { fonts: true },
    { ru: true, fonts: true },
  ]) {
    const out = injectPage(html, "/", ctx);
    assert.match(out, /dfo_service_details\.js/);
    assert.match(out, /dfo_services\.js/);
    assert.ok(
      out.indexOf("dfo_service_details.js") < out.indexOf("dfo_services.js"),
    );
    assert.ok(expectedHooks(ctx).includes("services.enchantCatalog"));
  }
  assert.doesNotMatch(injectPage(html, "/", {}), /dfo_services\.js/);
});

test("unsupported and partial signatures keep the original module atomically", () => {
  const src = 'const a={spellMaker:1,spellShop:2};const s="Effect settings";';
  const log = [];
  assert.equal(transformServices("assets/change.js", src, log), src);
  assert.equal(log.length, 1);
  assert.match(log[0][0], /services!error/);
  assert.equal(
    transformServices("assets/workerWorker-12345678.js", src, []),
    src,
  );
  assert.equal(
    transformServices("assets/no.js", "const n=123;", []),
    "const n=123;",
  );
});

const build = process.env.DFO_BUILD_DIR;
test(
  "published client: exact seams, syntax, idempotence and native duration/chance/magnitude parity",
  { skip: !build },
  () => {
    const { parse } = require(process.env.DFO_ACORN_MODULE || "acorn"),
      hits = {},
      laws = {};
    const functions = (s) => {
      const stack = [parse(s, { ecmaVersion: "latest", sourceType: "module" })],
        out = [];
      while (stack.length) {
        const n = stack.pop();
        if (!n || typeof n !== "object") continue;
        if (
          n.type === "FunctionDeclaration" ||
          (n.type === "VariableDeclarator" &&
            n.init?.type === "ArrowFunctionExpression")
        )
          out.push(s.slice(n.start, n.end));
        for (const v of Object.values(n))
          if (v && typeof v === "object")
            Array.isArray(v) ? stack.push(...v) : stack.push(v);
      }
      return out;
    };
    for (const f of fs
      .readdirSync(path.join(build, "assets"))
      .filter((f) => f.endsWith(".js"))) {
      const src = fs.readFileSync(path.join(build, "assets", f), "utf8"),
        log = [];
      const out = transformServices("assets/" + f, src, log);
      assert.ok(
        !log.some(([k]) => k.includes("!error")),
        f + ": " + JSON.stringify(log),
      );
      for (const [k, n] of log) hits[k] = (hits[k] || 0) + n;
      if (out !== src) {
        parse(out, { ecmaVersion: "latest", sourceType: "module" });
        assert.equal(transformServices("assets/" + f, out, []), out);
      }
      if (f.startsWith("flatAnimation-") || f.startsWith("spellcast-"))
        for (const code of functions(src)) {
          if (code.length > 400) continue;
          const role =
            code.includes(".durationBase+") &&
            code.includes(".durationPerLevel")
              ? "duration"
              : code.includes(".chanceBase+") &&
                  code.includes(".chancePerLevel")
                ? "chance"
                : code.includes(".magnitudeBaseLow") &&
                    code.includes(".magnitudeLevelBase") &&
                    code.includes(".magnitudePerLevel")
                  ? "magnitude"
                  : null;
          if (role)
            laws[role] = vm.runInNewContext(
              "(" + code.replace(/^[\w$]+=/, "") + ")",
            );
        }
    }
    assert.deepEqual(hits, {
      "services.ports": 1,
      "services.picker": 1,
      "services.spellRegistry": 1,
      "services.enchantCatalog": 1,
      "services.trade": 1,
    });
    assert.deepEqual(Object.keys(laws).sort(), [
      "chance",
      "duration",
      "magnitude",
    ]);
    let checked = 0;
    for (const level of [1, 2, 3, 4, 19, 24, 100])
      for (const step of [0, 1, 3, 20]) {
        const s = {
          ...S,
          durationPerLevel: step,
          chancePerLevel: step,
          magnitudePerLevel: step,
        };
        const r = details.spell(
          effect(1, 0, { duration: true, chance: true, magnitude: true }),
          s,
          level,
        );
        const number = (t) => Number(t.replace(/[^\d.−-]/g, ""));
        assert.equal(
          number(r.stats.find(([k]) => k === "Базовая длительность")[1]),
          laws.duration(s, level),
        );
        assert.equal(
          number(r.stats.find(([k]) => k.startsWith("Базовый шанс"))[1]),
          Math.max(0, Math.min(100, laws.chance(s, level))),
        );
        const expected = [
          laws.magnitude(s, level, () => 0),
          laws.magnitude(s, level, () => 1 - Number.EPSILON),
        ];
        const actual = r.stats
          .find(([k]) => k === "Базовая величина")[1]
          .split("–")
          .map(number);
        assert.deepEqual(actual, expected);
        checked++;
      }
    assert.equal(checked, 28);
  },
);
