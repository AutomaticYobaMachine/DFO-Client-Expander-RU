#!/usr/bin/env node
'use strict';
// The item templates a published game build actually knows: DFU's 288 rows plus every custom row the build's own
// registrar receives from its modules. Runs the unchanged release in Chromium; only this listing reads the registrar.
//
// DFO_PLAYWRIGHT_MODULE=... DFO_CHROMIUM_PATH=... node tools/list-item-templates.cjs <game-build> [out.json]
// Without out.json the list is printed. tools/item-text-coverage.cjs compares it with the description tables.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');

const ID = '[\\w$]+';
const esc = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The chunk holding the template table and its registrar; the importers that hand rows to it. */
function locate(assets) {
  const files = fs.readdirSync(assets).filter(file => file.endsWith('.js') && !/Worker-/.test(file));
  const sign = /function ([\w$]+)\(([\w$]+)\)\{for\(let ([\w$]+) of \2\?\?\[\]\)!Number\.isFinite\(\3\?\.index\)\|\|\3\.index<([\w$]+)\.length\|\|([\w$]+)\.set\(\3\.index,Object\.freeze\(\{custom:!0,/;
  let home = null;
  for (const file of files) {
    const text = fs.readFileSync(path.join(assets, file), 'utf8');
    const match = sign.exec(text);
    if (match) { if (home) throw new Error(`two template registrars: ${home.file}, ${file}`); home = { file, register: match[1], table: match[4], custom: match[5] }; }
  }
  if (!home) throw new Error('template registrar not found in this build');
  const homeText = fs.readFileSync(path.join(assets, home.file), 'utf8');
  const exported = new RegExp(`[{,]${esc(home.register)} as (${ID})[,}]`).exec(homeText.slice(homeText.lastIndexOf('export{')));
  if (!exported) throw new Error('template registrar is not exported');
  const importers = [];
  for (const file of files) {
    if (file === home.file) continue;
    const text = fs.readFileSync(path.join(assets, file), 'utf8');
    const statement = new RegExp(`import\\{([^}]*)\\}from"\\./${esc(home.file)}"`).exec(text);
    if (!statement) continue;
    const alias = new RegExp(`(?:^|,)${esc(exported[1])} as (${ID})(?:,|$)`).exec(statement[1]);
    if (!alias) continue;
    // Calls inside install functions (e.g. Roleplay & Realism) are replayed with their module-level row arrays.
    const args = [...text.matchAll(new RegExp(`(?<![\\w$.])${esc(alias[1])}\\((${ID})\\)`, 'g'))].map(m => m[1]);
    importers.push({ file, alias: alias[1], args: [...new Set(args)] });
  }
  return { home, importers };
}

async function listTemplates(build) {
  const { chromium } = require(process.env.DFO_PLAYWRIGHT_MODULE || 'playwright');
  const assets = path.join(build, 'assets');
  const { home, importers } = locate(assets);
  const patched = new Map();
  patched.set(home.file, text => text.replace(new RegExp(`function ${esc(home.register)}\\(([\\w$]+)\\)\\{`),
    (all, rows) => `${all}globalThis.__dfoTemplateRows?.push(...(${rows}??[]));`) +
    `\n;globalThis.__dfoTemplateTable=${home.table};globalThis.__dfoTemplateCustom=${home.custom};\n`);
  for (const { file, alias, args } of importers) {
    patched.set(file, text => text + args.map(arg => `\n;try{${alias}(${arg})}catch{}`).join('') + '\n');
  }
  const page = `<!doctype html><meta charset="utf-8"><script>globalThis.__dfoTemplateRows=[];</script><script type="module">
const errors=[];
await import('/assets/${home.file}');
for(const file of ${JSON.stringify(importers.map(i => i.file))}){try{await import('/assets/'+file)}catch(e){errors.push(file+': '+(e?.message||e))}}
const rows=[];
const plain=t=>Object.fromEntries(Object.entries(t).filter(([,v])=>v==null||['string','number','boolean'].includes(typeof v)));
for(const t of globalThis.__dfoTemplateTable)if(t)rows.push({...plain(t),source:'dfu'});
for(const t of globalThis.__dfoTemplateCustom.values())rows.push({...plain(t),source:'custom'});
window.result={rows,errors};
</script>`;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html;charset=utf-8'); return res.end(page); }
    const file = path.resolve(build, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(build + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    let body = fs.readFileSync(file);
    if (file.endsWith('.js')) {
      res.setHeader('Content-Type', 'text/javascript');
      const change = patched.get(path.basename(file));
      if (change) body = change(body.toString());
    } else if (file.endsWith('.json')) res.setHeader('Content-Type', 'application/json');
    res.end(body);
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({ executablePath: process.env.DFO_CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
  try {
    const tab = await browser.newPage();
    await tab.goto(`http://127.0.0.1:${server.address().port}/`);
    await tab.waitForFunction(() => window.result, null, { timeout: 120000 });
    const { rows, errors } = await tab.evaluate(() => window.result);
    rows.sort((a, b) => a.index - b.index);
    return { build: path.basename(path.resolve(build)), registrar: home.file, importers: importers.map(i => i.file), errors, rows };
  } finally { await browser.close(); server.close(); }
}

if (require.main === module) {
  const build = path.resolve(process.argv[2] || process.env.DFO_BUILD_DIR || '');
  listTemplates(build).then(result => {
    const out = process.argv[3];
    if (out) fs.writeFileSync(out, JSON.stringify(result, null, 1) + '\n');
    else for (const row of result.rows) console.log(`${row.index}\t${row.source}\t${row.name}`);
    console.error(`${result.rows.length} templates (${result.rows.filter(r => r.source === 'custom').length} custom) from ${result.build}; import errors: ${result.errors.length}`);
    for (const error of result.errors) console.error('  ' + error);
  }).catch(error => { console.error(error); process.exit(1); });
}
module.exports = { listTemplates, locate };
