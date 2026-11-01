// Dev tool: DFO_RU's launcher and shell strings as plain pairs (data/ru_shell.json), out of the patcher's own literals
// (strings.json, read from DFO_Patcher.exe's metadata) and its translated lib/shellDialogs.cjs aligned with the original.
const fs = require('fs');
const acorn = require('/opt/npm-tools/node_modules/acorn');
const [stringsFile, ruDialogs, enDialogs, out] = process.argv.slice(2);
const S = JSON.parse(fs.readFileSync(stringsFile, 'utf8'));
const pairs = (list) => { const o = []; for (let i = 0; i + 1 < list.length; i += 2) o.push([list[i], list[i + 1]]); return o; };
const lits = (src) => {
  const out = [];
  const walk = (n) => {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'Literal' && typeof n.value === 'string') out.push(src.slice(n.start, n.end));
    if (n.type === 'TemplateLiteral') out.push(src.slice(n.start, n.end));
    for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object' && k !== 'loc') walk(v); }
  };
  walk(acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script' }));
  return out;
};
const ru = fs.readFileSync(ruDialogs, 'utf8').replace(/\r\n/g, '\n');
const en = fs.readFileSync(enDialogs, 'utf8');
const a = lits(en), b = lits(ru);
const dialogs = a.length === b.length ? a.map((x, i) => [x, b[i]]).filter(([x, y]) => x !== y) : [];
const result = {
  'launcher/index.html': pairs(S['JsHookPatcher.PatchLauncherHtml']),
  'launcher/launcher.js': pairs(S['JsHookPatcher.PatchLauncherJs']),
  'main.cjs': pairs(S['JsHookPatcher.PatchMainCjs']),
  'lib/launcherState.cjs': pairs(S['JsHookPatcher.PatchLauncherState']),
  'lib/shellDialogs.cjs': dialogs,
  'launcher/launcher.css': [S['JsHookPatcher.PatchLauncherCss'].slice(0, 2)],
};
fs.writeFileSync(out, JSON.stringify(result, null, 1));
for (const [k, v] of Object.entries(result)) console.log(k, v.length);
