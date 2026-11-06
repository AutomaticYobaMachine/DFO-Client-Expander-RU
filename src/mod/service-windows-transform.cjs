"use strict";
const ID = "[\\w$]+";
function required(text, re, name) {
  const m = re.exec(text);
  if (!m) throw Error("Unsupported service UI " + name);
  return m;
}
function transformServices(rel, text, log) {
  if (
    !rel.endsWith(".js") ||
    /Worker-[^/]+\.js$/.test(rel) ||
    text.includes("/*services.windows*/")
  )
    return text;
  const code = [],
    hits = [];
  let patched = text;
  try {
    if (
      text.includes("spellMaker:") &&
      text.includes("spellShop:") &&
      text.includes("Effect settings")
    ) {
      const specs = required(
        text,
        new RegExp(
          `(${ID})=Object\\.freeze\\(\\{guild:${ID},coven:${ID},bank:${ID},bankPurchase:${ID},transport:${ID},daedra:${ID},potionMaker:${ID},itemMaker:${ID},spellMaker:${ID},spellShop:${ID}\\}\\)`,
        ),
        "ports",
      )[1];
      const groups = required(
        text,
        new RegExp(
          `_addEffectNoSound\\(\\)\\{let (${ID})=(${ID})\\(\\);this\\.picker=new`,
        ),
        "spell groups",
      )[2];
      const subs = required(
        text,
        new RegExp(`_pickGroup\\((${ID})\\)\\{let (${ID})=(${ID})\\(\\1\\);`),
        "spell subgroups",
      )[3];
      const effects = required(
        text,
        new RegExp(
          `effectOf\\((${ID})\\)\\{return \\1\\?(${ID})\\.find\\((${ID})=>\\3\\.key===\\1\\.key\\)\\?\\?null:null\\}`,
        ),
        "spell catalogue",
      )[2];
      code.push(
        `globalThis.__dfoServices?.ports(${specs},{groups:${groups},subgroups:${subs},effects:${effects}});`,
      );
      hits.push(["services.ports", 1]);
    }
    if (
      text.includes("heldEquipFree") &&
      text.includes("castingSkillOf") &&
      text.includes("timeEffectsLastRerolled")
    ) {
      const ctx = required(
        text,
        new RegExp(
          `(${ID})=(${ID})=>\\2&&(${ID})\\?\\{\\.\\.\\.\\3,\\.\\.\\.\\2\\}:\\2\\?\\?\\3`,
        ),
        "spell registry",
      )[3];
      code.push(
        `globalThis.__dfoServices?.spellRegistry(id=>${ctx}?.spellsByIndex?.()?.get?.(id)??null);`,
      );
      hits.push(["services.spellRegistry", 1]);
    }
    if (
      text.includes("this.selectingPowers=") &&
      text.includes("_pickPrimary(")
    ) {
      const primary = required(
        text,
        new RegExp(
          `this\\.selectingPowers=(${ID});let (${ID})=(${ID})\\(\\1,\\{item:this\\.selected,powers:(${ID})\\.powers,sideEffects:\\4\\.sideEffects,souls:this\\._souls\\}\\);`,
        ),
        "enchantment list",
      );
      const name = required(
        text.slice(primary.index, primary.index + 700),
        new RegExp(`items:${primary[2]}\\.map\\((${ID})\\)`),
        "enchantment name",
      )[1];
      const pick = required(
        text,
        new RegExp(
          `_pickPrimary\\((${ID})\\)\\{let (${ID})=this\\._lists\\(\\),(${ID})=(${ID})\\(\\1,\\{powers:\\2\\.powers,sideEffects:\\2\\.sideEffects,selectingPowers:this\\.selectingPowers,souls:this\\._souls\\}`,
        ),
        "enchantment variants",
      )[4];
      code.push(
        `globalThis.__dfoServices?.enchantCatalog({primary:${primary[3]},pick:${pick},name:${name}});`,
      );
      hits.push(["services.enchantCatalog", 1]);
    }
    if (
      text.includes("pick-shell") &&
      text.includes("pick-row") &&
      text.includes("JSON.stringify(")
    ) {
      const draw = required(
        text,
        new RegExp(
          `function (${ID})\\((${ID}),(${ID}),(${ID}),(${ID}),(${ID})=globalThis\\.document\\)\\{if\\(!\\6\\?\\.body\\|\\|${ID}\\(\\)\\|\\|!\\2\\?\\.items\\)`,
        ),
        "picker draw",
      )[1];
      const active = required(
        text,
        new RegExp(`(${ID})=\\{picker:${ID},sig:${ID},\\.\\.\\.${ID}\\}`),
        "picker state",
      )[1];
      code.push(
        `{const native=${draw};${draw}=function(...args){const ok=native(...args);if(ok)globalThis.__dfoServices?.picker(args[0],${active});return ok}}`,
      );
      hits.push(["services.picker", 1]);
    }
    if (
      text.includes(" as mountEnhancedTrade") &&
      text.includes("trade-detail-info")
    ) {
      const mount = required(
        text,
        new RegExp(`(${ID}) as mountEnhancedTrade`),
        "trade mount",
      )[1];
      const click = required(
        text,
        new RegExp(`(${ID})\\.item===${ID}&&${ID}-\\1\\.time<=`),
        "trade click state",
      )[1];
      const row = required(
        text,
        new RegExp(
          `function ${ID}\\((${ID}),${ID}\\)\\{let ${ID}=(${ID})\\(\\1,(${ID})\\.entity\\),${ID}=`,
        ),
        "trade item line",
      );
      if (!text.slice(row.index, row.index + 160).includes("itemrow"))
        throw Error("Unsupported trade row");
      const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      let count = 0;
      patched = text.replace(
        new RegExp(
          `(?<![\\w$])${escape(row[2])}\\(${ID}(?:\\.item)?,${escape(row[3])}\\.entity\\)`,
          "g",
        ),
        (call) => {
          count++;
          return `__dfoServiceTradeLine(${call})`;
        },
      );
      if (count !== 4) throw Error("Unsupported trade item lines: " + count);
      code.push(
        `function __dfoServiceTradeLine(line){return globalThis.__dfoServices?.tradeLine(line)??line}`,
      );
      // The original module keeps its last-click clock across unmounts. A first
      // click in a new counter must not complete a double-click from the old one.
      code.push(
        `{const native=${mount};${mount}=function(...args){${click}={item:null,time:0};return native.apply(this,args)}}`,
      );
      hits.push(["services.trade", 1]);
    }
  } catch (e) {
    log.push(["services!error " + e.message, 0]);
    return text;
  }
  log.push(...hits);
  return code.length
    ? patched + "\n;" + code.join("\n") + "\n/*services.windows*/"
    : text;
}
module.exports = { transformServices };
