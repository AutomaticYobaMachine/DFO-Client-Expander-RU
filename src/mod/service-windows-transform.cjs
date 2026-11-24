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
      const iconMatch = new RegExp(
        `Array\\.from\\(\\{length:69\\},\\(${ID},(${ID})\\)=>\\(\\{icon:(${ID})\\(\\1\\)`,
      ).exec(text);
      const costMatch = new RegExp(
        `cost\\(\\)\\{return (${ID})\\(this\\.deps\\.slot,this\\.deps\\.entity\\)\\.sp\\}`,
      ).exec(text);
      const defSetMatch = new RegExp(
        `settings:(${ID})\\(\\)\\},this\\._updateAllowedButtons\\(\\)`,
      ).exec(text);
      const audioMatch =
        new RegExp(
          `_addEffect\\(\\)\\{if\\((${ID})\\.playOneShot\\((${ID})\\.ButtonClick,1\\),this\\.firstFreeSlot\\(\\)===-1\\)`,
        ).exec(text) ||
        new RegExp(`(${ID})\\.playOneShot\\((${ID})\\.ButtonClick,1\\)`).exec(
          text,
        );
      const extraLaw = [
        iconMatch ? `icon:${iconMatch[2]}` : null,
        costMatch ? `effectCost:${costMatch[1]}` : null,
        defSetMatch ? `defaultSettings:${defSetMatch[1]}` : null,
        audioMatch ? `audio:${audioMatch[1]},clips:${audioMatch[2]}` : null,
      ]
        .filter(Boolean)
        .join(",");
      code.push(
        `globalThis.__dfoServices?.ports(${specs},{groups:${groups},subgroups:${subs},effects:${effects}${extraLaw ? "," + extraLaw : ""}});`,
      );
      hits.push(["services.ports", 1]);
    }
    if (text.includes("takeLetter:()=>{") && text.includes("wagonGold:()=>")) {
      const bankPlayer = required(
        text,
        new RegExp(
          `takeLetter:\\(\\)=>\\{let (${ID})=\\((${ID})\\.items\\?\\?\\[\\]\\)\\.findIndex\\(${ID}=>${ID}\\.templateIndex===275\\)`,
        ),
        "bank player hook",
      );
      const ent = bankPlayer[2];
      patched = patched.replace(
        bankPlayer[0],
        `items:()=>${ent}.items??[],houses:()=>${ent}.houses??[],ownedShip:()=>${ent}.ownedShip??-1,bankAccounts:()=>${ent}.bankAccounts??[],raw:()=>${ent},` +
          bankPlayer[0],
      );
      hits.push(["services.bankPlayer", 1]);
    }
    if (text.includes("new OV({") && text.includes("accounts:()=>")) {
      const bankOV = required(
        text,
        new RegExp(
          `new OV\\(\\{accounts:\\(\\)=>(${ID})\\.bankAccounts,regionIndex:\\(\\)=>(${ID})\\(\\),`,
        ),
        "bank OV hook",
      );
      const envMatch = new RegExp(
        `onlineHomeLines:\\(\\)=>(${ID})\\.onlineHomes\\?`,
      ).exec(text.slice(bankOV.index, bankOV.index + 1500));
      const hostHooks = envMatch
        ? `homesApi:()=>${envMatch[1]}.homesApi??null,onlineHomes:()=>${envMatch[1]}.onlineHomes??null,`
        : "";
      patched = patched.replace(
        bankOV[0],
        `new OV({accounts:()=>${bankOV[1]}.bankAccounts,regionIndex:()=>${bankOV[2]}(),houses:()=>${bankOV[1]}.houses??[],ownedShip:()=>${bankOV[1]}.ownedShip??-1,rawPlayer:()=>${bankOV[1]},${hostHooks}`,
      );
      hits.push(["services.bankOV", 1]);
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
      const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
          `function (${ID})\\((${ID}),(${ID})\\)\\{let (${ID})=(${ID})\\(\\2,(${ID})\\.entity\\),(${ID})=`,
        ),
        "trade item line",
      );
      if (!text.slice(row.index, row.index + 160).includes("itemrow"))
        throw Error("Unsupported trade row");
      const Qt = row[1],
        g = row[5],
        S = row[6];
      const state = required(
        text,
        new RegExp(
          `function ${escape(mount)}\\((${ID}),(${ID})=\\{\\}\\)\\{return [^;]*?,(${ID})=\\1,${escape(S)}=\\2,(${ID})=\\2\\.mode\\?\\?\`Buy\`,(${ID})=${ID}\\(\\4\\),(${ID})=\\[\\],(${ID})=\\[\\],(${ID})=null,(${ID})=null,(${ID})=\\{item:null,text:\`\`\\}`,
        ),
        "trade state",
      );
      const [, , , x, C, w, T, E, D, O, k] = state;
      const repaint = required(
        text,
        new RegExp(`repaint:(${ID}),unmount\\(\\)`),
        "trade repaint",
      )[1];
      const close = required(
        text,
        new RegExp(
          `let (${ID})=${ID}\\(\`button\`,\`act\`,\`Close\`\\);\\1\\.onclick=(${ID}),`,
        ),
        "trade close",
      )[2];
      const clear = required(
        text,
        new RegExp(
          `let (${ID})=${ID}\\(\`button\`,\`act\`,\`Clear\`\\);\\1\\.onclick=\\(\\)=>\\{(${ID})\\(\\),`,
        ),
        "trade clear",
      )[2];
      const moves = required(
        text,
        new RegExp(
          `\\?\\(${escape(click)}=\\{item:null,time:0\\},${escape(O)}=null,${ID}===\`local\`\\?(${ID})\\(${ID}\\):(${ID})\\(${ID}\\)\\)`,
        ),
        "trade moves",
      );
      const wt = moves[1],
        Ot = moves[2];
      const St = required(
        text,
        new RegExp(
          `function (${ID})\\(\\)\\{if\\(!${escape(O)}\\)return!1;let\\{item:${ID},side:${ID}\\}=${escape(O)};`,
        ),
        "trade canMove",
      )[1];
      const At = required(
        text,
        new RegExp(
          `function (${ID})\\(\\)\\{if\\(!${escape(O)}\\)return;let\\{item:${ID},side:${ID}\\}=${escape(O)};${escape(O)}=null,`,
        ),
        "trade doMove",
      )[1];
      const calcLot = required(
        text,
        new RegExp(
          `function (${ID})\\(\\)\\{return (${ID})\\(${escape(C)},(${ID})\\(\\),\\{\\.\\.\\.${escape(S)}\\.priceCtx`,
        ),
        "trade calcLot",
      );
      const R = calcLot[1],
        d = calcLot[2],
        gt = calcLot[3];
      const calcPrice = required(
        text,
        new RegExp(
          `function (${ID})\\(${ID}=${escape(R)}\\(\\)\\)\\{let ${ID}=${escape(S)}\\.priceCtx\\?\\.\\(\\)\\?\\?\\{\\};return (${ID})\\(${escape(C)},`,
        ),
        "trade calcPrice",
      );
      const vt = calcPrice[1],
        he = calcPrice[2];
      const z = required(
        text,
        new RegExp(
          `function (${ID})\\(${ID},${ID}\\)\\{let ${ID}=${escape(S)}\\.priceCtx[\\s\\S]*?label:\`Buy for\``,
        ),
        "trade quote",
      )[1];
      const junk = required(
        text,
        new RegExp(
          `function (${ID})\\(\\)\\{if\\(!${ID}\\(\\)\\)return\\[\\];let (${ID})=${escape(S)}\\.isEquipped\\?\\?\\(\\(\\)=>!1\\),(${ID})=${ID}\\(\\);return\\(${escape(S)}\\.packItems\\?\\.\\(\\)\\?\\?\\[\\]\\)\\.filter\\((${ID})=>(${ID})\\(\\4\\)&&!\\2\\(\\4\\)&&!\\3\\.includes\\(\\4\\)&&!(${ID})\\(\\4\\)&&(${ID})\\(${escape(C)},\\4,\\{accepts:${escape(S)}\\.accepts,enchanted:${escape(S)}\\.enchanted\\}\\)&&(${ID})\\(\\4\\)\\)\\}`,
        ),
        "trade junk",
      );
      const zt = junk[1],
        Ke = junk[5],
        bt = junk[6],
        Te = junk[7],
        Bt = junk[8];
      const ie = required(
        text,
        new RegExp(
          `\\?(${ID})\\(${ID},${escape(S)}\\.weight\\?\\.\\(\\)\\?\\?\\{\\}\\):null`,
        ),
        "trade payment",
      )[1];
      const steal = required(
        text,
        new RegExp(
          `let (${ID})=${ID}\\(\`button\`,\`act trade-steal\`,\`Steal\`\\);\\1\\.disabled=!\\((${ID})\\(\\)>0\\),\\1\\.onclick=(${ID})`,
        ),
        "trade steal",
      );
      const Mt = steal[2],
        Nt = steal[3];
      const Vt = required(
        text,
        new RegExp(
          `let (${ID})=${ID}\\(\`button\`,\`act sell-junk\`,\`Sell junk \\([^\\\`]*\`\\);\\1\\.onclick=(${ID})`,
        ),
        "trade sellJunk",
      )[2];
      const primary = required(
        text,
        new RegExp(
          `function (${ID})\\(\\)\\{${escape(O)}&&${ID}\\(\\)\\?${ID}\\(\\):${escape(O)}\\?\\(${escape(At)}\\(\\),${escape(repaint)}\\(\\)\\):(${ID})\\(\\)\\}`,
        ),
        "trade primary",
      );
      const Ht = primary[1],
        J = primary[2];
      const qty = required(
        text,
        new RegExp(
          `let (${ID})=${escape(O)}\\.item,(${ID})=${ID}\\(\\1\\)>1\\?(${ID})\\(\\1,${escape(O)}\\.side\\):0;if\\(\\2>1&&\\(${escape(k)}\\.item!==\\1&&\\(${escape(k)}=\\{item:\\1,text:String\\(\\2\\)\\}\\),${ID}\\.append\\((${ID})\\(\\{max:\\2`,
        ),
        "trade qty",
      );
      const Tt = qty[3],
        nt = qty[4];
      const vlist = required(
        text,
        new RegExp(
          `\\?(${ID})\\((${ID})\\(${ID},${ID},(${ID})=>${escape(Qt)}\\(\\3,\`local\`\\),\\{onAim:(${ID}),sizes:(${ID})\\(\`local:\\$\\{(${ID})\\}\`\\)\\}\\)\\)`,
        ),
        "trade vlist",
      );
      const nn = vlist[1],
        it = vlist[2],
        on = vlist[4],
        cn = vlist[5],
        b = vlist[6];
      const syncV = required(
        text,
        new RegExp(
          `(${ID})=\\(\\)=>\\{${escape(x)}&&(${ID})\\(\\{remeasure:!0\\}\\)\\}`,
        ),
        "trade syncVirtual",
      )[2];
      const layout = required(
        text,
        new RegExp(
          `let (${ID})=${ID}\\(\`div\`,\`px-body trade-body\`\\),(${ID})=${ID}\\(\`div\`,\`packlists\`\\);\\2\\.append\\((${ID})\\(\\),(${ID})\\(\\)\\),\\1\\.append\\(\\2\\);let (${ID})=(${ID})\\(\\)\\?\\?`,
        ),
        "trade layout",
      );
      const $t = layout[3],
        tn = layout[4],
        dn = layout[6];
      const fn = required(
        text,
        new RegExp(
          `\\),${ID}\\.append\\((${ID})\\(\\)\\),${escape(D)}\\)\\{for\\(let`,
        ),
        "trade footer",
      )[1];
      const audio = required(
        text,
        new RegExp(
          `(${ID})\\.playOneShot\\(${ID}\\?\\.kind===\`letterOfCredit\`\\?(${ID})\\.ParchmentScratching:\\2\\.GoldPieces,1\\)`,
        ),
        "trade audio",
      );
      const u = audio[1],
        l = audio[2];
      const prep = required(
        text,
        new RegExp(
          `for\\(let (${ID}) of ${escape(zt)}\\(\\)\\)(${ID})\\(\\1,${escape(S)}\\.entity,!0\\),(${ID})\\(\\1,${escape(S)}\\.packItems\\(\\),${ID}\\(\\)\\)`,
        ),
        "trade prep",
      );
      const Ve = prep[2],
        V = prep[3];
      const Ge = required(
        text,
        new RegExp(
          `let ${ID}=${escape(S)}\\.isEquipped\\?\\?\\(\\(\\)=>!1\\),${ID}=new Set\\(${ID}\\(\\)\\),${ID}=(${ID})=>(${ID})\\(\\1,${escape(w)}\\)`,
        ),
        "trade baseFilter",
      )[2];
      const addIt = required(
        text,
        new RegExp(
          `function ${escape(V)}\\((${ID}),(${ID}),(${ID})\\)\\{let (${ID})=\\2\\.indexOf\\(\\1\\);\\4>=0&&\\2\\.splice\\(\\4,1\\),(${ID})\\(\\3,\\1`,
        ),
        "trade addItem",
      )[5];
      const splitIt = required(
        text,
        new RegExp(
          `(${ID})\\(${ID},\\{amount:${ID}\\},${escape(S)}\\.packItems\\(\\),${ID}\\(\\),\\{entity:${escape(S)}\\.entity,fromLocal:!0\\}\\)`,
        ),
        "trade splitTransfer",
      )[1];
      const words = required(
        text,
        new RegExp(`(${ID}) as tradeCountText,(${ID}) as tradeGoldText`),
        "trade words",
      );
      const dt = words[1],
        y = words[2];
      let count = 0;
      patched = text.replace(
        new RegExp(
          `(?<![\\w$])${escape(g)}\\(${ID}(?:\\.item)?,${escape(S)}\\.entity\\)`,
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
      code.push(
        `{` +
          `const _nMount=${mount},_nQt=${Qt},_n$t=${$t},_nTn=${tn},_nDn=${dn},_nFn=${fn},_nZt=${zt},_nVt=${Vt},_nHt=${Ht},_nJ=${J},_n$=${repaint};` +
          `const _bridge={` +
          `get host(){return ${x}},get hooks(){return ${S}},get mode(){return ${C}},` +
          `get tab(){return ${w}},set tab(v){${w}=v},get view(){return ${b}},set view(v){${b}=v},` +
          `get basket(){return ${T}},get staged(){return ${E}},get dialog(){return ${D}},set dialog(v){${D}=v},` +
          `get picked(){return ${O}},set picked(v){${O}=v},get qty(){return ${k}},set qty(v){${k}=v},` +
          `resetClick(){${click}={item:null,time:0}},` +
          `itemLine:(it,ent)=>__dfoServiceTradeLine(${g}(it,ent??${S}.entity)),` +
          `itemRow:(it,side)=>${Qt}(it,side),` +
          `repaint:()=>${repaint}(),close:()=>${close}(),clear:()=>${clear}(),` +
          `moveLocal:it=>${wt}(it),moveRemote:it=>${Ot}(it),canMovePicked:()=>${St}(),movePicked:()=>${At}(),` +
          `calcLot:()=>${R}(),calcCost:(m,items,ctx)=>${d}(m,items,ctx??(${S}.priceCtx?.()??{})),activeItems:()=>${gt}(),` +
          `calcLotTradePrice:lot=>${vt}(lot),calcTradePrice:(m,cost,q,sk,pcs,res)=>${he}(m,cost,q,sk,pcs,res),` +
          `quote:(it,side)=>${z}(it,side),isNativeJunk:it=>${Ke}(it),isUnsellable:it=>${bt}(it),` +
          `merchantAccepts:(m,it,opts)=>${Te}(m??${C},it,opts??{accepts:${S}.accepts,enchanted:${S}.enchanted}),` +
          `canStage:it=>${Bt}(it),selectPaymentForm:(amt,wt)=>${ie}(amt,wt??(${S}.weight?.()??{})),` +
          `stealCost:()=>${Mt}(),promptSteal:()=>${Nt}(),maxTransferable:(it,side)=>${Tt}(it,side),` +
          `createQtyField:opts=>${nt}(opts),` +
          `mountVirtual:(col,items,renderRow,key)=>${nn}(${it}(col,items,renderRow,{onAim:${on},sizes:${cn}(key)})),` +
          `syncVirtual:opts=>${syncV}(opts),baseFilter:(it,page)=>${Ge}(it,page),` +
          `prepareLocalForStage:it=>${Ve}(it,${S}.entity,!0),moveBetweenArrays:(it,fromArr,toArr)=>${V}(it,fromArr,toArr),` +
          `addItem:(arr,it,order)=>${addIt}(arr,it,order),splitTransfer:(it,opts,fromArr,toArr,ctx)=>${splitIt}(it,opts,fromArr,toArr,ctx),` +
          `goldText:n=>${y}(n),countText:n=>${dt}(n),audio:${u},clips:${l},` +
          `native:{row:_nQt,leftCol:_n$t,rightCol:_nTn,detail:_nDn,footer:_nFn,junkItems:_nZt,sellJunk:_nVt,primary:_nHt,commit:_nJ,repaint:_n$}` +
          `};` +
          `${Qt}=function(it,side){const el=_nQt(it,side);return globalThis.__dfoServices?.tradeRow?.(el,it,side,_bridge)??el};` +
          `${$t}=function(){return globalThis.__dfoServices?.tradeLeftCol?.(_bridge,_n$t)??_n$t()};` +
          `${tn}=function(){return globalThis.__dfoServices?.tradeRightCol?.(_bridge,_nTn)??_nTn()};` +
          `${dn}=function(){return globalThis.__dfoServices?.tradeDetail?.(_bridge,_nDn)??_nDn()};` +
          `${fn}=function(){return globalThis.__dfoServices?.tradeFooter?.(_bridge,_nFn)??_nFn()};` +
          `${zt}=function(){return globalThis.__dfoServices?.tradeJunkItems?.(_bridge,_nZt)??_nZt()};` +
          `${Vt}=function(){return globalThis.__dfoServices?.tradeSellJunk?.(_bridge,_nVt)??_nVt()};` +
          `${Ht}=function(){return globalThis.__dfoServices?.tradePrimary?.(_bridge,_nHt)??_nHt()};` +
          `${J}=function(){return globalThis.__dfoServices?.tradeCommit?.(_bridge,_nJ)??_nJ()};` +
          `${repaint}=function(...args){globalThis.__dfoServices?.tradeBeforeRepaint?.(_bridge);const r=_n$.apply(this,args);globalThis.__dfoServices?.tradeAfterPaint?.(_bridge);return r};` +
          `${mount}=function(...args){${click}={item:null,time:0};globalThis.__dfoServices?.tradeBeforeMount?.(_bridge,args);return _nMount.apply(this,args)};` +
          `}`,
      );
      hits.push(["services.trade", 1]);
    }
  } catch (e) {
    log.push(["services!error " + e.message, 0]);
    return text;
  }
  log.push(...hits);
  return code.length || patched !== text
    ? patched +
      (code.length ? "\n;" + code.join("\n") : "") +
      "\n/*services.windows*/"
    : text;
}
module.exports = { transformServices };
