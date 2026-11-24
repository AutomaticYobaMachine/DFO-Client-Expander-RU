#!/usr/bin/env python3
# DFO Mod - THE RUSSIAN PACK, built. Run after any change to data/ru-src, data/ru-fixes or tools/ru_rules.py:
#     python3 -I tools/build-ru-pack.py
#
# data/ru-pack/ - a Daggerfall Unity translation pack the game itself reads (its own language system, Russian chosen):
#   Text/Internal_*.csv    DG_RU's tables (Mirazent, CC BY-SA 4.0) with the holes filled (data/ru-fixes), the names on the
#                          map put back in Latin letters and today's TES terms (tools/ru_rules.py); the lists the game
#                          builds venue names from are left out, so taverns, shops, halls and temples keep their names
#   Text/Quests/*-LOC.txt  DG_RU's quest messages DFO_RU's quests lack (DFO_RU's own stay), under the same two rules
#   Text/Port_Strings.csv  the game's own Russian (its drafts of the port's words), only the rows the two rules change and
#                          the rows data/ru-fixes/Port_Strings.csv writes
#   PACK.json, LICENSE, index.json (what the shell hook serves and the page lists)
# And DFO_RU's own data (data/ru: the dictionary, its rules, its quests) put under the same two rules in place, the
# dictionary's map names taken out, the hand's words added (data/ru-fixes/dictionary.json), the quest names it lacked
# taken from DG_RU.
import csv, json, os, re, sys, glob, shutil
sys.path.insert(0, os.path.dirname(__file__))
from ru_rules import fix, mana

csv.field_size_limit(10 ** 9)
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'data', 'ru-src')
FIXES = os.path.join(ROOT, 'data', 'ru-fixes')
OUT = os.path.join(ROOT, 'data', 'ru-pack')
RU = os.path.join(ROOT, 'data', 'ru')
VERSION = json.load(open(os.path.join(ROOT, 'src', 'mod', 'version.json')))['version']

def read_table(path):
    if not os.path.exists(path):
        return {}
    with open(path, encoding='utf-8-sig', newline='') as f:
        rows = list(csv.reader(f))
    if rows and rows[0][:2] == ['Key', 'Value']:
        rows = rows[1:]
    out = {}
    for r in rows:
        if len(r) >= 2 and r[0]:
            out[r[0]] = r[1]
    return out

def write_table(path, rows):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write('Key,Value\n')
        for k, v in rows.items():
            f.write(f'{k},"{v.replace(chr(34), chr(34) * 2)}"\n')

# the venue names' parts (world/buildingNames.js): a tavern's, a shop's, the bank's, a house for sale's, the palace's, the
# wall's - kept English, as every name on the map is
VENUE_KEYS = {'StoresA', 'GeneralStoresB', 'WeaponStoresB', 'ArmorStoresB', 'BookStoresB', 'LibraryStoresB', 'ClothingStoresB',
              'AlchemyStoresB', 'GemStoresB', 'PawnStoresB', 'FurnitureStoresB', 'LivestockStoresB', 'TavernsA', 'TavernsB',
              'houseForSale', 'theBankOf', 'palace', 'cityWall', 'regionNames', 'daggerfall', 'wayrest', 'sentinel'}
TABLES = ['Internal_Factions', 'Internal_Flats', 'Internal_Items', 'Internal_MagicItems', 'Internal_RSC', 'Internal_Settings',
          'Internal_Spells', 'Internal_Strings']

QUEST_PREFIX = re.compile(r'^(.+)-[A-Za-z0-9_-]{8}\.js$')
MSG_HEAD = re.compile(r'^\s*([A-Za-z]+):\s*(\[\s*\d+\s*\]|[+-]?\d+)\s*$')
norm_head = lambda s: re.sub(r'\s+', ' ', s).strip()
# DFO_RU keys a quest by its chunk's name, where the build writes a quest's '$' as '_' ($CUREVAM -> assets/_CUREVAM-*.js)
dfo_key = lambda q: q.replace('$', '_').upper()

def hand_quests():
    """The quests DFO Online writes itself (its questlines, its starts), translated by hand: data/ru-fixes/quests/*.txt -
    "@@ QUEST | DisplayName" opens a quest, "== Header: [id]" a message, its lines as the panel shows them.
    Answers {QUEST: {'name': ..., 'messages': {header: text}}}."""
    out = {}
    for p in sorted(glob.glob(os.path.join(FIXES, 'quests', '*.txt'))):
        q = msg = None
        buf = []
        def flush():
            if q and msg is not None:
                while buf and not buf[-1].strip():
                    buf.pop()
                out[q]['messages'][norm_head(msg)] = '\n'.join(buf)
        for line in open(p, encoding='utf-8').read().replace('\r', '').split('\n'):
            if line.startswith('@@ '):
                flush(); msg = None; buf = []
                k, _, name = line[3:].partition('|')
                q = k.strip().upper()
                out[q] = {'name': name.strip(), 'messages': {}}
            elif line.startswith('== '):
                flush(); buf = []
                msg = line[3:].strip()
            elif msg is not None:
                buf.append(line.rstrip())
        flush()
    return out

NAMED_HOLE = re.compile(r'\{([A-Za-z_]\w*)\}')
WORD_HOLE = "([A-Z][\\w'\u2019-]*(?: [A-Z][\\w'\u2019-]*)?)"

def ui_rule(en, ru):
    """An English template with {} holes ("{} holds a gem.") and its Russian ({} in the same order, or {1}..{n}) as the
    page's rule: an anchored regex and a replacement with $1..$n. A {W} hole takes only a name of one or two capitalised
    words ("{W} Log" is "Oak Log", never "Read the Captain's Log")."""
    parts = re.split(r'(\{\}|\{W\})', en)
    rx = '^' + ''.join(re.escape(p) if i % 2 == 0 else ('(.*?)' if p == '{}' else WORD_HOLE) for i, p in enumerate(parts)) + '$'
    n = len(parts) // 2
    if re.search(r'\{\d+\}', ru):
        rep = re.sub(r'\{(\d+)\}', lambda m: '$' + m.group(1), ru)
    else:
        k = [0]
        def nxt(m):
            k[0] += 1
            return '$' + str(k[0])
        rep = re.sub(r'\{\}', nxt, ru)
        if k[0] != n:
            raise SystemExit(f'template holes differ: {en!r} -> {ru!r}')
    return {'re': rx, 'rep': rep}

def dfo_quests():
    """DFO_RU's quests as the shell gives them to the game (src/ru-build.cjs buildQuests): QUEST -> {name, messages}."""
    out = {}
    p = os.path.join(RU, 'quest_display_names_ru.json')
    if os.path.exists(p):
        for k, v in json.load(open(p, encoding='utf-8')).items():
            out.setdefault(k.upper(), {})['name'] = str(v)
    for p in glob.glob(os.path.join(RU, 'quest_batches_ru', '*_ru.json')):
        for f, msgs in json.load(open(p, encoding='utf-8')).items():
            m = QUEST_PREFIX.match(f)
            key = (m.group(1) if m else re.sub(r'\.js$', '', f)).upper()
            q = out.setdefault(key, {})
            q.setdefault('messages', {}).update({norm_head(h): str(t) for h, t in (msgs or {}).items()})
    return out

def loc_without(text, have, name):
    """A -LOC quest without the messages `have` holds (by header, as transforms.cjs ru.quest matches them), its
    DisplayName `name` when given. Answers (text, messages kept, messages cut)."""
    lines = text.split('\n')
    out, kept, cut, i, in_qrc = [], 0, 0, 0, False
    while i < len(lines):
        l = lines[i]
        t = l.strip()
        if name and t.lower().startswith('displayname:'):
            out.append(l[:l.lower().index('displayname:') + len('displayname:')] + ' ' + name)
            i += 1
            continue
        if t.lower().startswith('qrc:'):
            in_qrc = True
        elif t.lower().startswith('qbn:'):
            in_qrc = False
        m = MSG_HEAD.match(l) if in_qrc else None
        if not m:
            out.append(l)
            i += 1
            continue
        j = i + 1
        while j < len(lines) and not MSG_HEAD.match(lines[j]) and not lines[j].strip().lower().startswith('qbn:'):
            j += 1
        if norm_head(f'{m.group(1)}: {m.group(2)}') in have or norm_head(l) in have:
            cut += 1
        else:
            out.extend(lines[i:j])
            kept += 1
        i = j
    return '\n'.join(out), kept, cut

def main():
    report = []
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    files = []
    # ─── the DFU tables ───
    for t in TABLES:
        en = read_table(os.path.join(SRC, 'en', f'{t}.csv'))
        dg = read_table(os.path.join(SRC, 'DG_RU', 'Text', f'{t}.csv'))
        fx = read_table(os.path.join(FIXES, f'{t}.csv'))
        rows, changed, dropped = {}, 0, 0
        for k in list(en.keys()) + [k for k in dg if k not in en] + [k for k in fx if k not in en and k not in dg]:
            if k in rows:
                continue
            if t == 'Internal_Strings' and k in VENUE_KEYS:
                dropped += int(k in dg or k in fx)
                continue
            v = fx.get(k, dg.get(k))
            if v is None:
                continue
            nv = mana(en.get(k, ''), fix(v))
            changed += int(nv != v)
            rows[k] = nv
        write_table(os.path.join(OUT, 'Text', f'{t}.csv'), rows)
        files.append(f'Text/{t}.csv')
        report.append(f'{t}: {len(rows)} rows (of {len(en)} English), {sum(1 for k in fx if k in rows)} from the fixes, {changed} by the rules, {dropped} venue lists left out')
    # ─── the quests: DG_RU's words only where DFO_RU has none ───
    # A -LOC message replaces the quest's own text by its id, and DFO_RU's quests (data/ru) are already put into the quest
    # source as the shell serves it (transforms.cjs ru.quest) - so a message DFO_RU translates is left out of the -LOC
    # file, a quest DFO_RU translates whole has no -LOC file at all, and a -LOC file's DisplayName is DFO_RU's where it
    # names the quest. DG_RU fills the quests and the messages DFO_RU never had.
    # the quests DFO Online writes itself: the hand's translation, as one more of DFO_RU's batches and its names
    hq = hand_quests()
    hb = {f'{q}.js': {h: fix(t) for h, t in v['messages'].items()} for q, v in hq.items()}
    json.dump(hb, open(os.path.join(RU, 'quest_batches_ru', 'dfo_hand_ru.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    dnp0 = os.path.join(RU, 'quest_display_names_ru.json')
    dn0 = json.load(open(dnp0, encoding='utf-8'))
    for q, v in hq.items():
        if v['name']:
            dn0[q] = fix(v['name'])
    json.dump(dn0, open(dnp0, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    report.append(f"DFO quests by hand: {len(hq)} quests, {sum(len(v['messages']) for v in hq.values())} messages")
    # the questlines' sheets (what to do, the choices, how it ended - systems/questlines/sheets) and the messages their
    # patches add to the classic quests (patches/*.json `new`): English -> Russian, keyed as the chunk writes the text
    # inside its template literal (transforms.cjs ru.ql)
    tpl = lambda s: s.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')
    qd = os.path.join(FIXES, 'ql')
    sheets = json.load(open(os.path.join(qd, 'sheets_ru.json'), encoding='utf-8'))
    pnew = json.load(open(os.path.join(qd, 'patches_new_ru.json'), encoding='utf-8'))
    ql = {'t': {tpl(en): tpl(mana(en, fix(ru))) for en, ru in sheets.items()},
          'n': {tpl(en): tpl(fix(ru)) for en, ru in pnew.items()}}
    json.dump(ql, open(os.path.join(RU, 'ql_ru.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    report.append(f"questline sheets: {len(ql['t'])} lines, quest patches: {len(ql['n'])}")
    # first the names: a quest DFO_RU translates without a DisplayName takes DG_RU's (DFO_RU's own table of names)
    dnp = os.path.join(RU, 'quest_display_names_ru.json')
    dn = json.load(open(dnp, encoding='utf-8'))
    have_names = {k.upper() for k in dn}
    named = 0
    for p in sorted(glob.glob(os.path.join(SRC, 'DG_RU', 'Text', 'Quests', '*-LOC.txt'))):
        q = dfo_key(os.path.basename(p)[:-len('-LOC.txt')])
        if q in have_names:
            continue
        m = re.search(r'^\s*DisplayName:[ \t]*(.+?)\s*$', open(p, encoding='utf-8').read(), re.M | re.I)
        if m and m.group(1).strip():
            dn[q] = fix(m.group(1).strip())
            named += 1
    if named:
        json.dump(dn, open(dnp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    report.append(f'Quest names: {named} DFO_RU lacked, taken from DG_RU')
    dfo = dfo_quests()
    qn = qc = qpart = qdrop = qmsg = 0
    for p in sorted(glob.glob(os.path.join(SRC, 'DG_RU', 'Text', 'Quests', '*-LOC.txt'))):
        name = os.path.basename(p)
        s = fix(open(p, encoding='utf-8').read())
        q = dfo.get(dfo_key(name[:-len('-LOC.txt')]), {})
        ns, kept, cut = loc_without(s, q.get('messages', {}), q.get('name'))
        if not kept:
            qdrop += 1
            continue
        qpart += int(cut > 0)
        qc += int(bool(q))
        qmsg += kept
        dst = os.path.join(OUT, 'Text', 'Quests', name)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        open(dst, 'w', encoding='utf-8', newline='').write(ns)
        files.append(f'Text/Quests/{name}')
        qn += 1
    report.append(f'Quests: {qn} -LOC files ({qmsg} messages): {qn - qc} quests DFO_RU lacks, {qpart} with only the messages it '
                  f'lacks; {qdrop} left out (DFO_RU has every message)')
    # ─── the game's own Russian: the rows the rules change, and the hand's ───
    machine = read_table(os.path.join(SRC, 'port_ru_machine.csv'))
    hand = read_table(os.path.join(FIXES, 'Port_Strings.csv'))
    en_port = read_table(os.path.join(SRC, 'en', 'Port_Strings.csv'))
    # the same English, the same Russian everywhere: data/ru-fixes/port_by_english.json {English value: Russian}
    pbe_p = os.path.join(FIXES, 'port_by_english.json')
    by_en = json.load(open(pbe_p, encoding='utf-8')) if os.path.exists(pbe_p) else {}
    port = {}
    for k, v in machine.items():
        nv = by_en.get(en_port.get(k)) or mana(en_port.get(k, ''), fix(v))
        if nv != v:
            port[k] = nv
    ruled = len(port)
    for k, v in hand.items():
        port[k] = mana(en_port.get(k, ''), fix(v))
    if port:
        write_table(os.path.join(OUT, 'Text', 'Port_Strings.csv'), port)
        files.append('Text/Port_Strings.csv')
    report.append(f'Port_Strings: {len(port)} rows over the game drafts ({ruled} by the rules, {len(hand)} by hand)')
    # ─── the books: the game reads a translation's Text/Books/<BOOK>-LOC.txt before the classic BOK file
    # (systems/localizedBook.js, DFU's LocalizedBook) - DFU's own English -LOC books, translated (data/ru-fixes/books) ───
    nb = 0
    for bp in sorted(glob.glob(os.path.join(FIXES, 'books', 'BOK*-LOC.txt'))):
        name = os.path.basename(bp)
        text = open(bp, encoding='utf-8').read().replace('\r\n', '\n')
        text = fix(text)
        os.makedirs(os.path.join(OUT, 'Text', 'Books'), exist_ok=True)
        open(os.path.join(OUT, 'Text', 'Books', name), 'w', encoding='utf-8', newline='\r\n').write(text)
        files.append(f'Text/Books/{name}')
        nb += 1
    report.append(f'books: {nb}')
    # ─── who made it ───
    dgm = json.load(open(os.path.join(SRC, 'DG_RU', 'PACK.json'), encoding='utf-8'))
    meta = {
        'name': 'DFO Mod — русский перевод',
        'authors': [f'{a} (DG_RU)' for a in dgm.get('authors', [])] + ['DFO Mod'],
        'source': dgm.get('source', ''),
        'license': dgm.get('license', 'CC BY-SA 4.0'),
        'terms': 'Основа — пак DG_RU (CC BY-SA 4.0): текст квестов и таблиц Daggerfall. Дополнен, термины приведены к '
                 'современным, названия городов, регионов, подземелий и заведений оставлены как на карте. Распространяется на тех же условиях.',
        'version': VERSION,
    }
    os.makedirs(OUT, exist_ok=True)
    json.dump(meta, open(os.path.join(OUT, 'PACK.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    open(os.path.join(OUT, 'LICENSE'), 'w', encoding='utf-8').write(
        'This pack is a derivative of DG_RU by Mirazent, licensed under CC BY-SA 4.0\n'
        '(https://creativecommons.org/licenses/by-sa/4.0/). Changes: missing records translated, place names restored to\n'
        'their original spelling, terminology modernised (DFO Mod). The derivative is shared under the same licence.\n'
        'The quest and book text it translates is the property of Bethesda Softworks.\n')
    json.dump({'meta': meta, 'files': files}, open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    report.append(f'pack: {len(files)} files')

    # ─── DFO_RU's own data, under the same rules ───
    locs = set(read_table(os.path.join(SRC, 'en', 'Internal_Locations.csv')).values())
    locs |= set(read_table(os.path.join(SRC, 'en', 'Internal_Strings.csv')).get('regionNames', '').split('\n'))
    mp = os.path.join(RU, 'ru_master.json')
    master = json.load(open(mp, encoding='utf-8'))
    removed = [k for k in master if k in locs and master[k] != k]
    for k in removed:
        del master[k]
    mc = 0
    for k, v in master.items():
        nv = mana(k, fix(v)) if isinstance(v, str) else v
        if nv != v:
            master[k] = nv
            mc += 1
    # the hand's: the project's words the game writes without its text core (data/ru-fixes/dictionary.json)
    hp = os.path.join(FIXES, 'dictionary.json')
    hand_dict = json.load(open(hp, encoding='utf-8')) if os.path.exists(hp) else {}
    # every item's name as the game's own table gives it (the pack's Internal_Items, by template), for the places the
    # interface writes a name in English - the words that are also a material, a cargo or a plain word left out
    ITEM_STOP = {'Iron', 'Silver', 'Gold', 'Copper', 'Lead', 'Tin', 'Mercury', 'Brass', 'Platinum', 'Lodestone', 'Sulphur', 'Ring',
                 'Mark', 'Staff', 'Wrap', 'Card', 'Map', 'Book', 'Fish', 'Wine', 'Grain', 'Wool', 'Silk', 'Ivory', 'Spices', 'Parts of',
                 'Deed to', 'Horse', 'Rations', 'Painting', 'Altar', 'Bandage', 'Clay Jar', 'Glass Jar', 'Glass Bottle'}
    names_en = json.load(open(os.path.join(SRC, 'item_templates_en.json'), encoding='utf-8'))
    items_ru = read_table(os.path.join(OUT, 'Text', 'Internal_Items.csv'))
    n_items = 0
    for idx, en_name in names_en.items():
        ru_name = items_ru.get(idx)
        if ru_name and en_name not in ITEM_STOP and en_name not in hand_dict and len(en_name) > 2:
            hand_dict[en_name] = ru_name
            n_items += 1
    report.append(f'item names for the interface: {n_items}')
    ui_rx = []
    for up in sorted(glob.glob(os.path.join(FIXES, 'ui', '*.json'))):
        for en_s, ru_s in json.load(open(up, encoding='utf-8')).items():
            if not ru_s:
                continue
            if '{}' in en_s or '{W}' in en_s:
                ui_rx.append((len(en_s.replace('{}', '').replace('{W}', '')), ui_rule(en_s, mana(en_s, fix(ru_s)))))
            else:
                hand_dict[en_s] = ru_s
                if NAMED_HOLE.search(en_s):
                    # a line whose holes are named ("An honor, {player}."), shown filled: the same rule, by position
                    first = {}
                    for i, nm in enumerate(NAMED_HOLE.findall(en_s)):
                        first.setdefault(nm, i + 1)
                    en_p = NAMED_HOLE.sub('{}', en_s)
                    ru_p = NAMED_HOLE.sub(lambda m: '{%d}' % first[m.group(1)] if m.group(1) in first else m.group(0), ru_s)
                    if re.search(r'\{\d+\}', ru_p):
                        ui_rx.append((len(en_p.replace('{}', '')), ui_rule(en_p, mana(en_p, fix(ru_p)))))
    # the longer a rule's own words, the more it says: the most particular rule is tried first
    ui_rx = [r for _, r in sorted(ui_rx, key=lambda x: -x[0])]
    json.dump(ui_rx, open(os.path.join(RU, 'ui_templates.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    report.append(f'interface templates by hand: {len(ui_rx)}')
    for k, v in hand_dict.items():
        master[k] = mana(k, fix(v))
    json.dump(master, open(mp, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    # a word the hand translates is no longer one DFO_RU keeps English (its runtime's PRESERVE_SET, ru_i18n.js)
    ip = os.path.join(RU, 'ru_i18n.js')
    js = open(ip, encoding='utf-8').read()
    m = re.search(r'const PRESERVE_SET = new Set\((\[.*?\])\);', js, re.S)
    if m:
        keep = json.loads(m.group(1))
        kept = [k for k in keep if k not in hand_dict]
        if len(kept) != len(keep):
            js = js[:m.start(1)] + json.dumps(kept, ensure_ascii=False) + js[m.end(1):]
            open(ip, 'w', encoding='utf-8').write(js)
        report.append(f'DFO_RU kept-English words: {len(kept)} ({len(keep) - len(kept)} now translated by hand)')
    report.append(f'DFO_RU dictionary: {len(master)} entries, {len(removed)} map names taken out, {mc} changed by the rules, {len(hand_dict)} by hand')
    qc = 0
    for p in glob.glob(os.path.join(RU, 'quest_batches_ru', '*.json')):
        d = json.load(open(p, encoding='utf-8'))
        ch = False
        for f, msgs in d.items():
            for h, v in list(msgs.items()):
                nv = fix(v)
                if nv != v:
                    msgs[h] = nv; ch = True; qc += 1
        if ch:
            json.dump(d, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    report.append(f'DFO_RU quests: {qc} messages changed')
    for name in ['quest_display_names_ru.json']:
        p = os.path.join(RU, name)
        d = json.load(open(p, encoding='utf-8'))
        d2 = {k: fix(v) for k, v in d.items()}
        if d2 != d:
            json.dump(d2, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    p = os.path.join(RU, 'dynamic_rx.json')
    rx = json.load(open(p, encoding='utf-8'))
    rc = 0
    for r in rx:
        if isinstance(r, dict) and isinstance(r.get('repStr'), str):
            n = mana(r['regexStr'], fix(r['repStr']))
            if n != r['repStr']:
                r['repStr'] = n; rc += 1
    json.dump(rx, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    report.append(f'DFO_RU dynamic rules: {rc} changed')
    p = os.path.join(ROOT, 'data', 'ru_shell.json')
    sh = json.load(open(p, encoding='utf-8'))
    def walk(o):
        if isinstance(o, dict): return {k: walk(v) for k, v in o.items()}
        if isinstance(o, list): return [walk(v) for v in o]
        return fix(o) if isinstance(o, str) else o
    sh2 = walk(sh)
    if sh2 != sh:
        json.dump(sh2, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('\n'.join(report))

if __name__ == '__main__':
    main()
