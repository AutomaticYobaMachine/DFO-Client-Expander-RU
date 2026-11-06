// DFO Mod - the installer. Run by the game's own exe as Node (Установить.cmd: ELECTRON_RUN_AS_NODE=1 "DFO Online.exe"
// patcher.cjs install), so nothing else needs installing.
//
// What it does to the install (DFO_RU's way, made to survive the game's updates):
//   - app.asar is backed up once (app.asar.dfo-mod-original.bak - the clean one; DFO_RU's own clean copy where it was
//     installed over), then written again with: the mod's payload under dfo-mod/, main.cjs's dagger:// handler
//     wrapped (dfo-mod/hook.cjs), and the launcher's and the shell's words in Russian (DFO_RU's tables).
//   - The game's files themselves are never touched: the hook puts the mod into them as the shell serves them, so the
//     per-file updates (<userData>/Game) go on, and the mod rides every new version without being installed again.
//   - DFO_RU turned the update check off and rolled the game back to the installer's copy; that is undone - an old
//     game cannot play online with the current server.
// uninstall puts the clean app.asar back.
'use strict';
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const fs = (() => { try { return require('original-fs'); } catch { return require('node:fs'); } })();
const { openAsar, listFiles, readFile, writeAsar } = require('./asar.cjs');
const { buildDict, buildI18n, buildQuests } = require('./ru-build.cjs');

const ROOT = path.resolve(__dirname, '..');          // the unpacked mod folder: patcher/, mod/, data/
const MOD = path.join(ROOT, 'mod');
const DATA = path.join(ROOT, 'data');
const BAK = '.dfo-mod-original.bak';
const VERSION = JSON.parse(fs.readFileSync(path.join(MOD, 'version.json'), 'utf8')).version;
const { createLootStore, validLootKey: validKey, cachedLootKey, cachedDungeonKey } = require(path.join(MOD, 'loot-store.cjs'));

const args = process.argv.slice(2);
const cmd = args.find((a) => !a.startsWith('--')) ?? 'install';
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
const flag = (name) => args.includes(`--${name}`);

const say = (s = '') => process.stdout.write(`${s}\n`);
class Stop extends Error {}
const stop = (s) => { throw new Stop(s); };

function findAsar() {
  const given = opt('asar');
  if (given) return path.resolve(given);
  const exe = process.execPath;
  const c = [path.join(path.dirname(exe), 'resources', 'app.asar')];
  for (const p of c) if (fs.existsSync(p)) return p;
  stop('Не найден resources\\app.asar рядом с игрой. Запустите установку из папки мода через Установить.cmd.');
}
function userDataDir() {
  const given = opt('user-data');
  if (given) return path.resolve(given);
  const base = process.env.APPDATA ?? path.join(process.env.HOME ?? '', '.config');
  for (const n of ['DFO Online', 'Daggerfall JavaScript', 'daggerfall-js-app']) { const p = path.join(base, n); if (fs.existsSync(p)) return p; }
  return path.join(base, 'DFO Online');
}
function gameRunning() {
  if (process.platform !== 'win32' || flag('no-proc-check')) return false;
  let out = '';
  try { out = execFileSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8' }); } catch { return false; }
  const me = path.basename(process.execPath).toLowerCase();
  for (const line of out.split(/\r?\n/)) {
    const m = /^"([^"]+)","(\d+)"/.exec(line);
    if (!m || Number(m[2]) === process.pid) continue;
    const n = m[1].toLowerCase();
    if ((me !== 'node.exe' && n === me) || /^(dfo online|daggerfall online|daggerfallonline)\.exe$/.test(n)) return true;
  }
  return false;
}
const versionOf = (a) => { try { return JSON.parse(readFile(a, 'package.json').toString('utf8')).version ?? '?'; } catch { return '?'; } };
/** DFO_RU's clean copy: app.asar.clean.<version>.bak (or .clean.bak) beside the archive, the newest. */
function ruBackup(asarPath) {
  const dir = path.dirname(asarPath), base = path.basename(asarPath);
  const found = fs.readdirSync(dir).filter((n) => n.startsWith(`${base}.clean`) && n.endsWith('.bak')).map((n) => path.join(dir, n));
  found.sort((x, y) => fs.statSync(y).mtimeMs - fs.statSync(x).mtimeMs);
  return found[0] ?? null;
}
function replaceFile(tmp, target) {
  for (let i = 0; ; i++) {
    try { fs.renameSync(tmp, target); return; } catch (e) {
      if (i >= 8) { try { fs.unlinkSync(tmp); } catch { /* left for the next run */ } stop(`Не удалось заменить ${target} (файл занят другим процессом). Закройте игру и повторите.`); }
      const until = Date.now() + 500; while (Date.now() < until) { /* wait for the lock to go */ }
    }
  }
}
const pairsApply = (text, pairs) => { let t = text, n = 0; for (const [a, b] of pairs) if (t.includes(a)) { t = t.split(a).join(b); n++; } return { text: t, n }; };

/** main.cjs's handler wrapped by the mod - the shell's own one answers if the mod cannot load. */
function hookMain(src) {
  const re = /protocol\.handle\(\s*(['"`])dagger\1\s*,\s*([\w$]+)\s*\)/;
  const m = re.exec(src);
  if (!m) return null;
  const h = m[2];
  const wrapped = `protocol.handle('dagger', (() => { try { return require('./dfo-mod/hook.cjs').wrap(${h}, { app }); } catch (e) { console.error('[dfo-mod]', e); return ${h}; } })())`;
  return src.slice(0, m.index) + wrapped + src.slice(m.index + m[0].length);
}

/** The mod's switches in <userData>/dfo-mod.json: made with the defaults where missing, then each `--set key=0|1`
 *  of the installer's window applied, preserving independent feature settings. */
function writeConfig(ud, withRu) {
  fs.mkdirSync(ud, { recursive: true });
  const file = path.join(ud, 'dfo-mod.json');
  const store = createLootStore(ud);
  let cfg = { enabled: true, ru: withRu, marks: true, nearbyLoot: true, dungeons: true, itemCards: true, fonts: true, nearbyLootOptions: { keyCode: 'KeyJ' }, marksOptions: { onlyVisited: true, markRadiusM: 1200, nameRadiusM: 300, maxMarks: 60 } };
  try { if (fs.existsSync(file)) cfg = { ...cfg, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* a broken file is written again */ }
  cfg.marksOptions = { onlyVisited: true, markRadiusM: 1200, nameRadiusM: 300, maxMarks: 60, ...(cfg.marksOptions ?? {}) };

  // Determine hotkey: explicit cli flag > cached in dfo-mod-cache.json > existing config > default KeyJ
  let chosenKey = null;
  const explicitKey = opt('loot-key');
  if (validKey(explicitKey)) {
    chosenKey = explicitKey;
  } else {
    chosenKey = store.lootKey();
    if (!chosenKey && validKey(cfg.nearbyLootOptions?.keyCode)) {
      chosenKey = cfg.nearbyLootOptions.keyCode;
    }
  }
  if (!chosenKey) chosenKey = 'KeyJ';

  cfg.nearbyLootOptions = { ...(cfg.nearbyLootOptions ?? {}), keyCode: chosenKey };
  const dungeonKey = opt('dungeon-key') ?? store.dungeonKey() ?? (validKey(cfg.dungeonOptions?.keyCode) ? cfg.dungeonOptions.keyCode : 'KeyK');
  cfg.dungeonOptions = { ...(cfg.dungeonOptions ?? {}), keyCode: dungeonKey };
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== '--set') continue;
    const [k, v] = String(args[i + 1] ?? '').split('=');
    const on = v === '1' || v === 'true';
    if (k === 'ru') cfg.ru = on && withRu;
    else if (k === 'marks' || k === 'nearbyLoot' || k === 'dungeons' || k === 'itemCards' || k === 'fonts' || k === 'enabled') cfg[k] = on;
    else if (k === 'onlyVisited') cfg.marksOptions.onlyVisited = on;
  }
  if (!withRu) cfg.ru = false;
  const tmp = file + '.tmp';
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(cfg, null, 2)}\n`);
    // Cache is authoritative for the binding. Validate/preserve every other
    // namespace and confirm its atomic write before publishing the config.
    store.saveHotkeys({ loot: chosenKey, dungeon: dungeonKey });
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch {}
    stop(`Не удалось сохранить настройки и назначенные кнопки: ${e.message}`);
  }

  return file;
}

function install() {
  if (args.includes('--dungeon-key') && !validKey(opt('dungeon-key'))) stop('Некорректная кнопка сведений о данже. Назначьте клавишу заново в установщике.');
  const lootKey = opt('loot-key');
  if (args.includes('--loot-key') && (lootKey === null || !validKey(lootKey))) stop('Некорректная кнопка лута. Назначьте клавишу заново в установщике.');
  const asarPath = findAsar();
  const ud = userDataDir();
  say(`DFO-Client-Expander-RU ${VERSION} — установка`);
  say('Автор: AutomaticYobaMachine. Создано специально для русского сообщества DFO Online.');
  say(`Игра:   ${path.dirname(path.dirname(asarPath))}`);
  if (gameRunning()) stop('DFO Online сейчас запущена. Закройте игру полностью и запустите установку снова.');
  try { createLootStore(ud).read(); }
  catch (e) { stop(`Не удалось прочитать кеш настроек; файлы клиента не изменены: ${e.message}`); }

  let cur = openAsar(asarPath);
  const curFiles = listFiles(cur.header);
  const curVersion = versionOf(cur);
  const modded = curFiles.has('dfo-mod/hook.cjs');
  const ruPatched = curFiles.has('dist/assets/ru_dict.js') || curFiles.has('dist/assets/ru_i18n.js');
  const ourBak = asarPath + BAK;
  let baseFile = asarPath;
  if (modded) {
    if (!fs.existsSync(ourBak)) { cur.close(); stop(`app.asar уже изменён этим модом, но чистой копии (${path.basename(ourBak)}) нет. Переустановите игру и запустите установку снова.`); }
    baseFile = ourBak;
    say('Мод уже стоит - переустанавливаю поверх чистой копии.');
  } else if (ruPatched) {
    const rb = ruBackup(asarPath);
    if (rb) {
      const ra = openAsar(rb); const rv = versionOf(ra); ra.close();
      if (rv === curVersion) { baseFile = rb; say(`Найден старый русификатор DFO_RU - беру его чистую копию: ${path.basename(rb)}`); }
      else say(`Внимание: копия DFO_RU (${rv}) от другой версии оболочки (${curVersion}) - ставлю поверх текущего файла.`);
    } else say('Внимание: стоит старый русификатор DFO_RU без чистой копии - ставлю поверх него.');
  }
  if (baseFile !== asarPath) { cur.close(); cur = openAsar(baseFile); }
  const base = cur;
  // the clean copy, kept once - a newer clean app.asar (the installer updated the shell) replaces an older one
  if (!modded) {
    let keep = !fs.existsSync(ourBak);
    if (!keep) { const b = openAsar(ourBak); keep = versionOf(b) !== versionOf(base); b.close(); }
    if (keep) { say('Сохраняю чистую копию app.asar...'); fs.copyFileSync(baseFile, `${ourBak}.tmp`); replaceFile(`${ourBak}.tmp`, ourBak); }
  }

  const put = new Map();
  const text = (rel) => readFile(base, rel)?.toString('utf8') ?? null;
  const orig = (rel, buf) => put.set(`dfo-mod/orig/${rel}`, buf);

  // main.cjs: the hook
  const main = text('main.cjs');
  if (main == null) { base.close(); stop('В app.asar нет main.cjs - неизвестная версия оболочки.'); }
  let hooked = hookMain(main);
  if (!hooked) { base.close(); stop('Не найдено место для перехватчика в main.cjs (protocol.handle(\'dagger\', ...)). Эта версия оболочки не поддерживается.'); }
  orig('main.cjs', Buffer.from(main));

  // the Russian localization - DFO_RU's tables
  const ruDir = path.join(DATA, 'ru');
  const withRu = !flag('no-ru') && fs.existsSync(path.join(ruDir, 'ru_master.json'));
  const report = [];
  if (withRu) {
    say('Собираю русификатор (словарь, правила, квесты)...');
    put.set('dfo-mod/page/ru_dict.js', Buffer.from(buildDict(ruDir)));
    put.set('dfo-mod/page/ru_i18n.js', Buffer.from(buildI18n(ruDir)));
    const quests = buildQuests(ruDir);
    put.set('dfo-mod/ru/quests.json', Buffer.from(JSON.stringify(quests)));
    if (fs.existsSync(path.join(ruDir, 'ql_ru.json'))) put.set('dfo-mod/ru/ql.json', fs.readFileSync(path.join(ruDir, 'ql_ru.json')));
    put.set('dfo-mod/ru/tiny5_cyrillic.woff2', fs.readFileSync(path.join(ruDir, 'tiny5_cyrillic.woff2')));
    report.push(`квестов: ${Object.keys(quests).length}`);
    const shell = JSON.parse(fs.readFileSync(path.join(DATA, 'ru_shell.json'), 'utf8'));
    for (const [rel, pairs] of Object.entries(shell)) {
      const src = rel === 'main.cjs' ? hooked : text(rel);
      if (src == null) continue;
      const r = pairsApply(src, pairs);
      if (rel === 'main.cjs') { hooked = r.text; continue; }
      if (r.text !== src) { orig(rel, Buffer.from(src)); put.set(rel, Buffer.from(r.text)); }
      report.push(`${rel}: ${r.n}/${pairs.length}`);
    }
    if (put.has('launcher/launcher.css')) put.set('launcher/fonts/PixelifySans-cyrillic.woff2', fs.readFileSync(path.join(ruDir, 'tiny5_cyrillic.woff2')));
    // the pack the game's own language system reads (data/ru-pack: DG_RU's tables and quests, filled and fixed)
    const packDir = path.join(DATA, 'ru-pack');
    if (fs.existsSync(path.join(packDir, 'index.json'))) {
      const idx = JSON.parse(fs.readFileSync(path.join(packDir, 'index.json'), 'utf8'));
      put.set('dfo-mod/ru-pack/index.json', fs.readFileSync(path.join(packDir, 'index.json')));
      for (const f of idx.files) put.set(`dfo-mod/ru-pack/${f}`, fs.readFileSync(path.join(packDir, ...f.split('/'))));
      for (const f of ['PACK.json', 'LICENSE']) if (fs.existsSync(path.join(packDir, f))) put.set(`dfo-mod/ru-pack/${f}`, fs.readFileSync(path.join(packDir, f)));
      report.push(`пак: ${idx.files.length} файлов`);
    }
  }
  put.set('main.cjs', Buffer.from(hooked));

  // the mod itself
  for (const rel of ['hook.cjs', 'transforms.cjs', 'item-cards-transform.cjs', 'page/dfo_item_cards.js', 'item-text.cjs', 'page/dfo_item_text.js', 'nearby-loot-transform.cjs', 'loot-tags-transform.cjs', 'dungeon-transform.cjs', 'dungeon-live-transform.cjs', 'dungeon-nav-transform.cjs', 'page/dfo_dungeon_model.js', 'page/dfo_dungeons.js', 'page/dfo_dungeon_live_model.js', 'page/dfo_dungeon_live.js', 'page/dfo_dungeon_graph.js', 'page/dfo_dungeon_nav_model.js', 'page/dfo_dungeon_nav.js', 'loot-store.cjs', 'page/dfo_loot_rules.js', 'page/dfo_loot_ui.js', 'page/dfo_loot.js', 'version.json', 'page/dfo_marks.js', 'page/dfo_town.js', 'page/ru_locale.js', 'page/ru_items.js']) put.set(`dfo-mod/${rel}`, fs.readFileSync(path.join(MOD, ...rel.split('/'))));

  // item descriptions: English always (the language without the translation), Russian only with the translation
  const { installFiles } = require(path.join(MOD, 'item-text.cjs'));
  for (const rel of installFiles(withRu ? ['en', 'ru'] : ['en'], path.join(MOD, 'item-text'))) put.set(`dfo-mod/item-text/${rel}`, fs.readFileSync(path.join(MOD, 'item-text', ...rel.split('/'))));
  for (const file of [...Object.values(require(path.join(MOD,'page/dfo_fonts.js')).files), 'FONT-NOTICES.txt'])
    put.set(`dfo-mod/fonts/${file}`, fs.readFileSync(path.join(MOD, 'fonts', file)));
  put.set('dfo-mod/fonts-transform.cjs',fs.readFileSync(path.join(MOD,'fonts-transform.cjs')));
  put.set('dfo-mod/ui-calibration-transform.cjs',fs.readFileSync(path.join(MOD,'ui-calibration-transform.cjs')));
  for(const rel of ['service-windows-transform.cjs','page/dfo_services.js','page/dfo_service_details.js'])put.set('dfo-mod/'+rel,fs.readFileSync(path.join(MOD,...rel.split('/'))));
  put.set('dfo-mod/page/dfo_fonts.js',fs.readFileSync(path.join(MOD,'page/dfo_fonts.js')));
  put.set('dfo-mod/page/dfo_font_data.js',fs.readFileSync(path.join(MOD,'page/dfo_font_data.js')));
  put.set('dfo-mod/font-assets.cjs',fs.readFileSync(path.join(MOD,'font-assets.cjs')));
  let fonts=true;
  try{fonts=JSON.parse(fs.readFileSync(path.join(ud,'dfo-mod.json'),'utf8')).fonts!==false}catch{}
  for(let i=0;i<args.length;i++)if(args[i]==='--set'&&String(args[i+1]).startsWith('fonts='))fonts=/^fonts=(?:1|true)$/.test(args[i+1]);
  const fontDrop=new Set(),fontRecovery={},allowedFontFiles=new Set(Object.values(require(path.join(MOD,'page/dfo_fonts.js')).files).map(f=>'dfo-mod/fonts/'+f));
  if(fonts){
    for(const [rel,entry]of listFiles(base.header)){
      if(!allowedFontFiles.has(rel)&&/\.(?:ttf|otf|woff2?)$/i.test(rel)){
        fontDrop.add(rel);
        const unpacked=asarPath+'.unpacked/'+rel;
        const bytes=entry.unpacked?(fs.existsSync(unpacked)&&!rel.includes('..')?fs.readFileSync(unpacked):null):readFile(base,rel);
        if(bytes){fontRecovery[rel]=bytes.toString('base64');fontDrop.add(rel);}
      }
    }
    for(const rel of [...put.keys()])if(!allowedFontFiles.has(rel)&&/\.(?:ttf|otf|woff2?)$/i.test(rel)){put.delete(rel);fontDrop.add(rel);}
    put.set('dfo-mod/font-recovery.json',Buffer.from(JSON.stringify(fontRecovery)));
  }
  if(fonts&&listFiles(base.header).has('launcher/launcher.css')){
    const key='launcher/launcher.css',source=put.get(key)??readFile(base,key);if(!put.has(`dfo-mod/orig/${key}`))orig(key,readFile(base,key));
    const {launcherCss,stripFaces}=require(path.join(MOD,'fonts-transform.cjs'));
    put.set(key,Buffer.from(stripFaces(String(source)).text+'\n'+launcherCss()));
  }

  say('Пересобираю app.asar...');
  const tmp = `${asarPath}.dfo-tmp`;
  let last = -1;
  writeAsar(base, tmp, { put,drop:fontDrop }, (d, n) => { const p = Math.floor((d / n) * 10); if (p !== last) { last = p; say(`  ${p * 10}%`); } });
  base.close();
  if (cur !== base) cur.close();
  replaceFile(tmp, asarPath);

  // the mod's switches: written once, the player's own edits kept - and what the installer's window chose (--set)
  const cfgFile = writeConfig(ud, withRu);
  // DFO_RU's update lock undone (it stopped the game's own updates to keep its patch)
  const shellCfg = path.join(ud, 'config.json');
  if ((ruPatched || ruBackup(asarPath)) && fs.existsSync(shellCfg)) {
    const c = fs.readFileSync(shellCfg, 'utf8');
    if (/"updateCheck"\s*:\s*false/.test(c)) {
      fs.writeFileSync(shellCfg, c.replace(/"updateCheck"\s*:\s*false/, '"updateCheck": true'));
      say('Автообновление игры снова включено (его выключал старый русификатор): мод переживает обновления сам.');
    }
  }
  say('');
  say(`Готово. Мод ${VERSION} установлен${withRu ? ' вместе с русификатором' : ''}.`);
  if (report.length) say(`Русификатор: ${report.join('; ')}`);
  say(`Настройки: ${cfgFile}`);
  say(`Журнал хуков (после запуска игры): ${path.join(ud, 'dfo-mod.log')}`);
}

function uninstall() {
  const asarPath = findAsar();
  say(`DFO-Client-Expander-RU ${VERSION} — удаление`);
  if (gameRunning()) stop('DFO Online сейчас запущена. Закройте игру полностью и запустите удаление снова.');
  const ourBak = asarPath + BAK;
  const a = openAsar(asarPath);
  const files = listFiles(a.header);
  if (!files.has('dfo-mod/hook.cjs')) { a.close(); say('Мод не установлен - app.asar и так чистый.'); return; }
  if (fs.existsSync(ourBak)) {
    a.close();
    fs.copyFileSync(ourBak, `${asarPath}.dfo-tmp`);
    replaceFile(`${asarPath}.dfo-tmp`, asarPath);
    fs.unlinkSync(ourBak);
    say('Готово: чистый app.asar возвращён на место.');
    return;
  }
  // no clean copy: the originals the mod kept inside, put back, and the mod taken out
  const put = new Map(), drop = new Set();
  const recovered=readFile(a,'dfo-mod/font-recovery.json');
  if(recovered)for(const [rel,bytes]of Object.entries(JSON.parse(recovered.toString())))if(!rel.includes('..')&&!path.isAbsolute(rel))put.set(rel,Buffer.from(bytes,'base64'));
  for (const rel of files.keys()) {
    if (rel.startsWith('dfo-mod/orig/')) put.set(rel.slice('dfo-mod/orig/'.length), readFile(a, rel));
    if (rel.startsWith('dfo-mod/')) drop.add(rel);
  }
  drop.add('launcher/fonts/PixelifySans-cyrillic.woff2');
  writeAsar(a, `${asarPath}.dfo-tmp`, { put, drop });
  a.close();
  replaceFile(`${asarPath}.dfo-tmp`, asarPath);
  say('Готово: исходные файлы оболочки возвращены, мод убран.');
}

function status() {
  const asarPath = findAsar();
  const ud = userDataDir();
  const a = openAsar(asarPath);
  const files = listFiles(a.header);
  const st = { asar: asarPath, shell: versionOf(a), installed: files.has('dfo-mod/hook.cjs'), withRu: files.has('dfo-mod/page/ru_dict.js'),
    modVersion: null, cleanCopy: fs.existsSync(asarPath + BAK), oldRu: files.has('dist/assets/ru_dict.js'), running: gameRunning(), cfg: null, userData: ud, cachedLootKey: null, cachedDungeonKey: null };
  try { st.modVersion = JSON.parse(readFile(a, 'dfo-mod/version.json')?.toString('utf8') ?? 'null')?.version ?? null; } catch { st.modVersion = null; }
  a.close();
  try { st.cfg = JSON.parse(fs.readFileSync(path.join(ud, 'dfo-mod.json'), 'utf8')); } catch { st.cfg = null; }

  // Check cache first for assigned hotkey!
  const cacheFile = path.join(ud, 'dfo-mod-cache.json');
  try {
    if (fs.existsSync(cacheFile)) {
      const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (cache && typeof cache === 'object') {
        st.cachedLootKey = cachedLootKey(cache);
        st.cachedDungeonKey = cachedDungeonKey(cache);
      }
    }
  } catch {}
  if (st.cachedLootKey) {
    st.cfg = st.cfg || {};
    st.cfg.nearbyLootOptions = { ...(st.cfg.nearbyLootOptions || {}), keyCode: st.cachedLootKey };
  }
  if (st.cachedDungeonKey) {
    st.cfg = st.cfg || {};
    st.cfg.dungeonOptions = { ...(st.cfg.dungeonOptions || {}), keyCode: st.cachedDungeonKey };
  }

  if (flag('json')) { say(JSON.stringify(st)); return; }
  say(`app.asar: ${asarPath} (оболочка ${st.shell})`);
  say(`Мод: ${st.installed ? `установлен ${st.modVersion ?? ''}` : 'не установлен'}${st.withRu ? ', с русификатором' : ''}`);
  if (st.cachedLootKey) say(`Кнопка лута (в кеше): ${st.cachedLootKey}`);
  say(`Чистая копия: ${st.cleanCopy ? 'есть' : 'нет'}`);
  const log = path.join(ud, 'dfo-mod.log');
  if (fs.existsSync(log)) { say('Журнал последнего запуска:'); say(fs.readFileSync(log, 'utf8').split('\n').slice(0, 40).join('\n')); }
}

try {
  if (cmd === 'install') install();
  else if (cmd === 'uninstall') uninstall();
  else if (cmd === 'status') status();
  else stop(`Неизвестная команда: ${cmd}`);
} catch (e) {
  say('');
  say(e instanceof Stop ? `Ошибка: ${e.message}` : `Сбой: ${e?.stack ?? e}`);
  process.exitCode = 1;
}
