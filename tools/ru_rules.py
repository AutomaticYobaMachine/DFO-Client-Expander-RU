# DFO Mod - the Russian text's two standing rules, applied to every Russian string the mod ships (the pack's tables and
# quests, the overrides of the game's own Russian, DFO_RU's dictionary and quests):
#
#   1. NAMES ON THE MAP STAY AS THE MAP WRITES THEM. A town, a region (a kingdom of the Iliac Bay), a dungeon, a venue is
#      written in its original Latin letters, so the word in a quest or a dialogue is the word the map and the travel
#      window show. A transliteration ("Даггерфолла", "в Сентинеле") becomes the name itself ("Daggerfall", "в Sentinel").
#      Provinces beyond the map (Сиродил, Скайрим, Хай Рок, Морровинд...) and the Iliac Bay in prose keep their modern
#      Russian names - they are lore, not places to travel to.
#   2. TODAY'S TES TERMS: двемеры (never дварфы, дворфы or гномы), каджиты, Обливион, оборотни, эбонит, адамантий,
#      орочий, даэдрический, Хай Рок, Скайрим, Эбонарм, Боэтия, Тёмное Братство, Гильдия магов...
#
# Every rule touches Cyrillic words alone - keys, macros (%pcn, _qgiver_, {n}), markup and English are never matched -
# and every rule is idempotent: run twice, the text is the same.
import re

L = 'А-Яа-яЁё'
NB = rf"(?<![{L}\-'’])"          # not inside a longer word
NA = rf"(?![{L}])"

# ─── 1. places ──────────────────────────────────────────────────────────────────────────────────────────────────────
def forms(nom):
    """A Russian place name's case forms, as one regex alternative, from its nominative."""
    n = re.escape(nom)
    if nom.endswith('ия'):
        return re.escape(nom[:-2]) + '(?:ия|ии|ию|ией)'
    if nom.endswith('ья'):
        return re.escape(nom[:-2]) + '(?:ья|ьи|ью|ьей)'
    if nom.endswith('а'):
        return re.escape(nom[:-1]) + '(?:а|ы|е|у|ой)'
    if nom.endswith('ь'):
        return re.escape(nom[:-1]) + '(?:ь|я|ю|ем|е)'
    if nom[-1] in 'оуиеэюё':
        return n
    return n + '(?:а|у|ом|е)?'

# English name -> the Russian spellings met in DG_RU, DFO_RU and the game's own drafts (nominative)
PLACES = {
    'Daggerfall': ['Даггерфолл', 'Дагерфолл', 'Даггерфол'],
    # the provinces' capitals: points on DFO Online's map of Tamriel (world/tamrielCapitals.js), so Latin too
    'Mournhold': ['Морнхолд'], 'Solitude': ['Солитьюд', 'Солитьюде'], 'Alinor': ['Алинор'], 'Falinesti': ['Фалинести'],
    'Torval': ['Торвал'], 'Helstrom': ['Хелстром'],
    'Sentinel': ['Сентинел', 'Сентинель'],
    'Wayrest': ['Вэйрест', 'Вайрест', 'Уэйрест', 'Вейрест'],
    'Orsinium': ['Орсиниум'],
    'Betony': ['Бетония', 'Бетони'],
    'Glenpoint': ['Гленпоинт', 'Гленпойнт'],
    'Anticlere': ['Антиклер'],
    'Lainlyn': ['Леинлин', 'Лейнлин'],
    'Northmoor': ['Нортмур'],
    'Menevia': ['Меневия'],
    'Alcaire': ['Алькаир', 'Алкейр', 'Алькер'],
    'Koegria': ['Коегрия', 'Коэгрия'],
    'Bhoriane': ['Бориэн', 'Бхориан'],
    'Kambria': ['Камбрия'],
    'Phrygias': ['Фригия'],
    'Urvaius': ['Урваюс'],
    'Ykalon': ['Икалон'],
    'Daenia': ['Дейния'],
    'Shalgora': ['Шелгора', 'Шалгора'],
    'Abibon-Gora': ['Абибон-Гора'],
    'Kairou': ['Каиру'],
    'Pothago': ['Потаго'],
    'Myrkwasa': ['Меркваса', 'Мирквас'],
    'Ayasofya': ['Аясофья'],
    'Tigonus': ['Тигонус'],
    'Kozanset': ['Козансет'],
    'Satakalaam': ['Сатакалам', 'Сатакалаам'],
    'Totambu': ['Тотамбу'],
    'Mournoth': ['Морнот'],
    'Ephesus': ['Ефес', 'Эфес'],
    'Santaki': ['Сантаки'],
    'Antiphyllos': ['Антифиллос'],
    'Bergama': ['Бергама'],
    'Gavaudon': ['Говадон', 'Гаводон'],
    'Tulune': ['Тулуне'],
    'Cybiades': ['Цибиадес', 'Кибиадес'],
    'Dwynnen': ['Двиннен'],
    'Wrothgaria': ['Ротгария'],
    "Dak'fron": ["Дак'фрон"],
    "Alik'r": ["Алик'р"],
    'Balfiera': ['Балфиера'],
    'Shedungent': ['Шедунгент'],
    'Devilrock': ['Девилрок'],
    'Bantha': ['Банта'],
    'Yeorth': ['Йеорт'],
}
# whole phrases first (their words would otherwise go one by one)
PHRASES = [
    (r'Имперск(?:ий|ого|ому|им|ом) [Гг]ород(?:а|у|ом|е)?', 'Imperial City'),
    (r'Драконий Хвост|Драконьего Хвоста|Драконьему Хвосту|Драконьим Хвостом|Драконьем Хвосте', 'Dragontail'),
    (r'Торфяник(?:и|ов|ах|ам|ами) Долины Теней', 'Glenumbra Moors'),
    (r'Холм(?:ы|ов|ах|ам|ами) Илессана|Илессанск(?:ие|их|им|ими) холм(?:ы|ов|ах|ам|ами)', 'Ilessan Hills'),
    (r'Илессан(?:а|у|ом|е)?', 'Ilessan'),
    (r'Ротгарианск(?:ие|их|им|ими) гор(?:ы|ах|ам|ами)?', 'Wrothgarian Mountains'),
    (r'Гленпоинтск(?:ие|их|им|ими) предгорь(?:я|ях|ям|ями)', 'Glenpoint Foothills'),
    (r'Равеннийск(?:ий|ого|ому|им|ом) лес(?:а|у|ом|е)?', 'Ravennian Forest'),
    (r'Мантелл[а-яё]* (?:Крукс|Предел)[а-яё]*', 'Mantellan Crux'),
    (r'(?:[Кк]урган(?:а|у|ом|е)? Скург|Скург(?:ов|овом|ова)? [Кк]урган(?:а|у|ом|е)?)', 'Scourg Barrow'),
    (r'Скург', 'Scourg'),
    (r'Каперск(?:ая|ой|ую|ою) (?:крепост[ьиюей]+|твердын[яиюей]+)', "Privateer's Hold"),
    (r'[Бб]ашн(?:я|и|е|ю|ей) Диренни', 'Direnni Tower'),
    (r'Вудборн-Холл(?:а|у|ом|е)?', 'Woodborne Hall'),
    (r'[Гг]робниц(?:а|ы|е|у|ей) (?:Лизандуса|Лисандуса)', "Lysandus' Tomb"),
]
_place_res = [(re.compile(NB + '(?:' + p + ')' + NA), en) for p, en in PHRASES]
for en, ru in PLACES.items():
    _place_res.append((re.compile(NB + '(?:' + '|'.join(forms(r) for r in sorted(ru, key=len, reverse=True)) + ')' + NA), en))

def restore_places(s):
    for rx, en in _place_res:
        s = rx.sub(en, s)
    return s

# ─── 2. terms ───────────────────────────────────────────────────────────────────────────────────────────────────────
def _caps(m, low):
    return low[0].upper() + low[1:] if m.group(0)[0].isupper() else low

def _map(table):
    """A rule from a word-forms table {old: new}, either case of the first letter."""
    keys = sorted(table, key=len, reverse=True)
    rx = re.compile(NB + '(' + '|'.join(re.escape(k[0].upper() + k[1:]) + '|' + re.escape(k) for k in keys) + ')' + NA)
    low = {k: v for k, v in table.items()}
    return rx, (lambda m: _caps(m, low[m.group(1)[0].lower() + m.group(1)[1:]]))

TERMS = [
    (re.compile(NB + r'Дворф-Корол(ь|я|ю|ём|ем|е)' + NA), lambda m: f'Корол{m.group(1)} двемеров'),
    _map({'вервольф': 'оборотень', 'вервольфа': 'оборотня', 'вервольфу': 'оборотню', 'вервольфом': 'оборотнем', 'вервольфе': 'оборотне',
          'вервольфы': 'оборотни', 'вервольфов': 'оборотней', 'вервольфам': 'оборотням', 'вервольфами': 'оборотнями', 'вервольфах': 'оборотнях'}),
    _map({'хаджит': 'каджит', 'хаджита': 'каджита', 'хаджиту': 'каджиту', 'хаджитом': 'каджитом', 'хаджите': 'каджите', 'хаджиты': 'каджиты',
          'хаджитов': 'каджитов', 'хаджитам': 'каджитам', 'хаджитами': 'каджитами', 'хаджитах': 'каджитах', 'хаджитка': 'каджитка', 'хаджитки': 'каджитки'}),
    _map({'дварф': 'двемер', 'дварфа': 'двемера', 'дварфы': 'двемеры', 'дварфов': 'двемеров', 'дварфам': 'двемерам', 'дварфами': 'двемерами',
          'дворф': 'двемер', 'дворфа': 'двемера', 'дворфы': 'двемеры', 'дворфов': 'двемеров', 'дворфам': 'двемерам',
          'гномам': 'двемерам', 'гномов': 'двемеров', 'гномами': 'двемерами',
          'гномья': 'двемерская', 'гномье': 'двемерское', 'гномьи': 'двемерские', 'гномий': 'двемерский', 'гномьей': 'двемерской',
          'гномьего': 'двемерского', 'гномьему': 'двемерскому', 'гномью': 'двемерскую', 'гномьим': 'двемерским', 'гномьих': 'двемерских',
          'дварфский': 'двемерский', 'дварфское': 'двемерское', 'дварфская': 'двемерская', 'дварфские': 'двемерские', 'дварфского': 'двемерского',
          'дворфский': 'двемерский', 'дворфское': 'двемерское', 'дворфская': 'двемерская', 'дворфские': 'двемерские', 'дворфского': 'двемерского'}),
    _map({'оркский': 'орочий', 'оркская': 'орочья', 'оркское': 'орочье', 'оркские': 'орочьи', 'оркского': 'орочьего', 'оркской': 'орочьей',
          'оркскому': 'орочьему', 'оркскую': 'орочью', 'оркским': 'орочьим', 'оркских': 'орочьих', 'оркскими': 'орочьими', 'оркском': 'орочьем'}),
    (re.compile(NB + r'эбенового дерева' + NA), lambda m: 'эбонита'),
    _map({'эбен': 'эбонит', 'эбена': 'эбонита', 'эбеном': 'эбонитом', 'эбеновый': 'эбонитовый', 'эбеновая': 'эбонитовая', 'эбеновое': 'эбонитовое',
          'эбеновые': 'эбонитовые', 'эбенового': 'эбонитового', 'эбеновой': 'эбонитовой', 'эбеновую': 'эбонитовую', 'эбеновым': 'эбонитовым',
          'эбеновых': 'эбонитовых'}),
    _map({'адамантит': 'адамантий', 'адамантита': 'адамантия', 'адамантиновый': 'адамантиевый', 'адамантиновая': 'адамантиевая',
          'адамантиновое': 'адамантиевое', 'адамантиновые': 'адамантиевые', 'адамантиновой': 'адамантиевой', 'адамантинового': 'адамантиевого',
          'адамантиновую': 'адамантиевую'}),
    _map({'даэдрике': 'даэдрическом'}),
    (re.compile(NB + r'Забвени(е|я|ю|ем|и)' + NA), lambda m: 'Обливион' + {'е': '', 'я': 'а', 'ю': 'у', 'ем': 'ом', 'и': 'е'}[m.group(1)]),
    _map({'скарим': 'скайрим', 'скарима': 'скайрима', 'скариму': 'скайриму', 'скаримом': 'скайримом', 'скариме': 'скайриме'}),
    (re.compile(NB + r'Высок(ий|ого|ому|им|ом) Кам(?:ень|ня|ню|нем|не)' + NA),
     lambda m: 'Хай Рок' + {'ий': '', 'ого': 'а', 'ому': 'у', 'им': 'ом', 'ом': 'е'}[m.group(1)]),
    _map({'эйбонарм': 'эбонарм', 'эйбонарма': 'эбонарма', 'эйбонарму': 'эбонарму', 'эйбонармом': 'эбонармом', 'эйбонарме': 'эбонарме'}),
    (re.compile(NB + r'Боэтиа' + NA), lambda m: 'Боэтия'),
    (re.compile(NB + r'(Имперск(?:ий|ого|ому|им|ом)) Город(|а|у|ом|е)' + NA), lambda m: f'{m.group(1)} город{m.group(2)}'),
    # the skills as the user's game names them: the blades plural ("+8 к Длинным Клинкам"), blunt weapons Дробящее оружие
    (re.compile(NB + r'([Дд]линн|[Кк]оротк)(?:(ий|ый) клинок|(ого) клинка|(ому) клинку|(им|ым) клинком|(ом) клинке)' + NA),
     lambda m: m.group(1)[0].upper() + m.group(1)[1:] + {'ий': 'ие Клинки', 'ый': 'ые Клинки', 'ого': 'их Клинков', 'ому': 'им Клинкам', 'им': 'ими Клинками', 'ым': 'ыми Клинками', 'ом': 'их Клинках'}[next(g for g in m.groups()[1:] if g)].replace('оркие', 'откие')),
    (re.compile(NB + r'([Дд]линн|[Кк]оротк)(ые|ых|ым|ыми|ие|их|им|ими) клинк(и|ов|ам|ами|ах)' + NA),
     lambda m: f'{m.group(1)[0].upper()}{m.group(1)[1:]}{m.group(2)} Клинк{m.group(3)}'),
    (re.compile(NB + r'([Тт])уп(ое|ого|ому|ым|ом) оружи(е|я|ю|ем|и)' + NA),
     lambda m: f"{'Д' if m.group(1) == 'Т' else 'д'}робящ{ {'ое': 'ее', 'ого': 'его', 'ому': 'ему', 'ым': 'им', 'ом': 'ем'}[m.group(2)]} оружи{m.group(3)}"),
    (re.compile(NB + r'Цар(ь|я|ю|ём|ем|е) Червей' + NA), lambda m: 'Корол' + {'ь': 'ь', 'я': 'я', 'ю': 'ю', 'ём': 'ём', 'ем': 'ём', 'е': 'е'}[m.group(1)] + ' Червей'),
    (re.compile(NB + r'(Гильди(?:я|и|ю|ей|ям|ях)) (Магов|Бойцов|Воров)' + NA), lambda m: f'{m.group(1)} {m.group(2).lower()}'),
    (re.compile(NB + r'([Тт])[её]мн(ое|ого|ому|ым|ом) братств(о|а|у|ом|е)' + NA), lambda m: f'{m.group(1)}ёмн{m.group(2)} Братств{m.group(3)}'),
    (re.compile(NB + r'([Тт])емн(ый|ая|ое|ые|ого|ой|ым|ых|ому|ую|ыми|ом)' + NA), lambda m: f'{m.group(1)}ёмн{m.group(2)}'),
]

def fix_terms(s):
    for rx, rep in TERMS:
        s = rx.sub(rep, s)
    return s

# MAGICKA IS MANA (the user's word): a string whose English says magicka (or Daggerfall's "spell points") names the mana
MAGICKA_EN = re.compile(r'(?i)magicka|spell[ -]?(?:points?|pts)\b|\bSP\b')
MAGIC_EN = re.compile(r'(?i)\bmagic(?!ka)')
def _mana_case(src, word):
    return word[0].upper() + word[1:] if src[:1].isupper() else word
MANA_RULES = [
    # "50 spell points" -> "50 ед. маны"; the label "Spell Points" -> "Мана"; any other -> "очки маны"
    (re.compile(r'(\d+)\s*' + r'[Оо]чк(?:и|ов|ам|ами|ах|о|а) (?:заклинаний|магии|магической энергии|маны)' + NA), lambda m: f'{m.group(1)} ед. маны'),
    (re.compile(r'^[Оо]чк(?:и|ов) (?:заклинаний|магии|магической энергии|маны)' + NA), lambda m: 'Мана'),
    (re.compile(NB + r'([Оо]чк(?:и|ов|ам|ами|ах|о|а)) (?:заклинаний|магии|магической энергии)' + NA), lambda m: f'{m.group(1)} маны'),
    (re.compile(NB + r'[Оо]ч\. закл\.' + NA), lambda m: 'Мана' if m.start() == 0 else 'маны'),
    (re.compile(NB + r'([Мм])агическ(?:ая|ой|ую) энерги(я|и|ю|ей)' + NA), lambda m: _mana_case(m.group(0), {'я': 'мана', 'и': 'маны', 'ю': 'ману', 'ей': 'маной'}[m.group(2)])),
    (re.compile(NB + r'(в|о|об|при|по|к) ([Мм])аги(?:и|ке)' + NA), lambda m: f"{m.group(1)} {_mana_case(m.group(2), 'мане')}"),
    (re.compile(NB + r'([Мм])аги(я|и|ю|ей)' + NA), lambda m: _mana_case(m.group(0), {'я': 'мана', 'и': 'маны', 'ю': 'ману', 'ей': 'маной'}[m.group(2)])),
    (re.compile(NB + r'([Мм])агик(а|и|у|ой|е)' + NA), lambda m: _mana_case(m.group(0), {'а': 'мана', 'и': 'маны', 'у': 'ману', 'ой': 'маной', 'е': 'мане'}[m.group(2)])),
    (re.compile(NB + r'МЭ' + NA), lambda m: 'Мана'),
]
# where the English says magic too, only the spell points and these phrases (the magicka in them) are mana
MANA_PHRASES = [('врождённую магию', 'врождённую ману'), ('способностью магии', 'способностью маны'),
                ('изучению магии и её применению', 'изучению маны и её применению'), ('вашей магии', 'вашей маны'),
                ('вытягивает из жертв[/left] очки маны', 'вытягивает из жертв[/left] ману'), ('вытягивает очки заклинаний', 'вытягивает ману'),
                ('вытягивает очки маны', 'вытягивает ману')]
def mana(en, ru):
    """The Russian of `en` with its magicka (Daggerfall's spell points, spell pts) named mana. Where the English says plain
    magic beside it, only the spell points and MANA_PHRASES change - the magic stays magic."""
    if not isinstance(ru, str) or not isinstance(en, str) or not MAGICKA_EN.search(en):
        return ru
    if MAGIC_EN.search(en):
        for rx, rep in MANA_RULES[:4]:
            ru = rx.sub(rep, ru)
        for x, y in MANA_PHRASES:
            ru = ru.replace(x, y)
        return ru
    for rx, rep in MANA_RULES:
        ru = rx.sub(rep, ru)
    return ru

def fix(s):
    """Both rules, places last (a term rule never makes a place, a place is never a term)."""
    if not isinstance(s, str) or not re.search(f'[{L}]', s):
        return s
    return restore_places(fix_terms(s))

if __name__ == '__main__':
    tests = ['Двор Даггерфолла', 'в Сентинеле и Вэйресте', 'Корона Даггерфолла', 'из Бетонии', 'Народ Абибон-Горы', 'хаджиты и вервольфы',
             'Клянусь Дворф-Королём', 'Борода короля гномов', 'гномьей стали', 'Тайна Забвения', 'Скарим', 'из Высокого Камня', 'Эйбонарм',
             'Гильдия Магов', 'Тёмное братство', 'Темный эльф', 'в Ротгарианских горах', 'Холмы Илессана', 'эбеновый кинжал', 'Слитки эбенового дерева',
             'оркского клинка', 'Илиакский залив', 'Сиродил', 'Тружусь усерднее всякого гнома', 'сентиментальный', 'Бантам', 'в Башне Диренни']
    for t in tests:
        print(f'{t!r:40} -> {fix(t)!r}')
