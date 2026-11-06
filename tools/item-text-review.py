#!/usr/bin/env python3
"""Item description review over a sample (tools/item-text-sample.mjs): what a reader would trip on.
  python3 tools/item-text-review.py [dir]   reads dir/cards.json (and cards-rare.json), writes dir/review.json
Spelling needs hunspell with ru_RU and en_GB; the head-noun agreement check needs pymorphy3 (pip install pymorphy3
pymorphy3-dicts-ru). A check whose tool is missing is skipped and says so. Exit status 1 when any problem is found."""
import json, re, subprocess, sys, collections, shutil
from pathlib import Path

DIR = Path(sys.argv[1] if len(sys.argv) > 1 else '.')
cards = json.loads((DIR / 'cards.json').read_text())
rare = json.loads((DIR / 'cards-rare.json').read_text()) if (DIR / 'cards-rare.json').exists() else []
try:
    import pymorphy3
    MORPH = pymorphy3.MorphAnalyzer()
except Exception:
    MORPH = None
G = {'masc': 'm', 'femn': 'f', 'neut': 'n'}

def head_gender(text):
    for w in re.findall(r'[А-Яа-яЁё-]+', re.split(r'[,—:;]', text)[0]):
        if not MORPH.word_is_known(w.lower()): return None   # a world's word (вакидзаси, сюрко): no judgement
        parses = MORPH.parse(w)
        p = [x for x in parses if 'NOUN' in x.tag and 'nomn' in x.tag]
        adjective = any(('ADJF' in x.tag or 'PRTF' in x.tag) and 'nomn' in x.tag for x in parses)
        if p and ('NOUN' in parses[0].tag or not adjective): return 'p' if 'plur' in p[0].tag else G.get(p[0].tag.gender, '?')
    return None

def spell(words, dic):
    if not shutil.which('hunspell'): return None
    out = subprocess.run(['hunspell', '-i', 'utf-8', '-d', dic, '-l'], input='\n'.join(words), capture_output=True, text=True).stdout
    return sorted(set(out.split()))

CLOTH = {'MensClothing', 'WomensClothing', 'Jewellery'}
STRIKE = re.compile(r'^(affix\.(damage|leech|elemental|slayer|wellspring)|combo\.affix\.(damage|leech|might|precision|bane)|technique\.|enchantment\.(2|4|6|20)(\.|$)|content\.poison)')
WARD = re.compile(r'^(affix\.(armor|thorns)|combo\.affix\.(armor|thorned))')
problems = collections.OrderedDict((k, []) for k in [
    'род/число первой фразы не совпадает с названием', 'фрагмент о бое у вещи, которая не бьёт', 'фрагмент о защите у вещи, которая не защищает',
    'износ у того, что не надевают', 'износ «кузнец/царапины» у одежды и украшений', 'износ или ремонт у боеприпасов', 'содержимое у чужой вещи',
    '«сам металл» у кожи', 'навык описан как удар оружия у не-оружия', 'свежесть основы спорит с порчей', 'грубая работа названа добротной',
    'два предложения подряд с одного зачина', 'одно предложение дважды', 'подсказка не к месту', 'нет подсказки', 'краденое не отдельной строкой',
    'не два абзаца'])
for c in cards + rare:
    n = c['n'] if c in cards else f"R{c['n']}"
    g = c['item']['group']; ru = c['ru']; keys = [f['key'] for f in ru]; t = c['ruText']
    body = [f for f in ru if f['category'] != 'hint']
    texts = [f['text'] for f in body]
    if MORPH and body:
        follows = len(ru) > 1 and (any(re.match(r'(Он|Она|Оно|Они|На (нём|ней|них)|В (него|неё|них)|Его|Её|Их)\b', f['text']) for f in ru[1:]) or 'страже' in t)
        hg = head_gender(texts[0])
        if follows and hg and hg != c['gender'] and not texts[0].startswith(('Высокие', 'Всё', 'То,')): problems['род/число первой фразы не совпадает с названием'].append(n)
    for k in keys:
        fists = k.startswith('technique.') and c['item']['templateIndex'] in (103, 524)   # the game gives gauntlets hand-to-hand techniques
        if STRIKE.match(k) and g != 'Weapons' and not fists: problems['фрагмент о бое у вещи, которая не бьёт'].append(n)
        if WARD.match(k) and g != 'Armor': problems['фрагмент о защите у вещи, которая не защищает'].append(n)
        if k.startswith('condition.') and g not in ('Weapons', 'Armor', 'Jewellery', 'MensClothing', 'WomensClothing'): problems['износ у того, что не надевают'].append(n)
        if k.startswith('content.') and k != 'content.poison' and c['item']['templateIndex'] not in (83, 274): problems['содержимое у чужой вещи'].append(n)
    if g in CLOTH and re.search(r'кузнец|царапин', ' '.join(f['text'] for f in ru if f['key'].startswith('condition.'))): problems['износ «кузнец/царапины» у одежды и украшений'].append(n)
    if c['item']['templateIndex'] in (131, 561) and (any(k.startswith('condition.') for k in keys) or 'hint.repair' in keys): problems['износ или ремонт у боеприпасов'].append(n)
    if 'affix.armor' in keys and (c['facts'].get('armorType') == 'leather' or c['facts'].get('material') in ('leather', 'fur')) and 'сам металл' in t: problems['«сам металл» у кожи'].append(n)
    if g != 'Weapons' and re.search(r'направля\w+ удар топора|придаю?т вес каждому удару|оттачива\w+ владение', t): problems['навык описан как удар оружия у не-оружия'].append(n)
    if any(k.startswith('food.stage.') and k[-1] in '234' for k in keys) and texts and re.search(r'(Свеж|Хрустящ|горяч|Сладкий)', texts[0]): problems['свежесть основы спорит с порчей'].append(n)
    if ('craft.quality.0' in keys or 'combo.craft.crude-maker' in keys) and 'Добротн' in t.split('\n\n')[-1]: problems['грубая работа названа добротной'].append(n)
    if any(' '.join(a.split()[:2]).lower() == ' '.join(b.split()[:2]).lower() for a, b in zip(texts, texts[1:])): problems['два предложения подряд с одного зачина'].append(n)
    if len(set(texts)) != len(texts): problems['одно предложение дважды'].append(n)
    hint = [f['key'] for f in ru if f['category'] == 'hint']
    if not hint: problems['нет подсказки'].append(n)
    elif (hint[0] == 'hint.weapon.common' and g != 'Weapons') or (hint[0] == 'hint.armor.common' and g != 'Armor') or (hint[0] == 'hint.repair' and g not in ('Weapons', 'Armor')):
        problems['подсказка не к месту'].append(n)
    if c['item'].get('stolen') and '\n' + next((f['text'] for f in ru if f['category'] == 'standing'), '\0') not in t: problems['краденое не отдельной строкой'].append(n)
    if len(t.split('\n\n')) != 2: problems['не два абзаца'].append(n)

words_ru, words_en = collections.Counter(), collections.Counter()
for c in cards + rare:
    words_ru.update(re.findall(r'[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*', c['ruText']))
    words_en.update(re.findall(r"[A-Za-z]+(?:'[a-z]+)?", c['enText']))
report = {'cards': len(cards), 'rare': len(rare), 'problems': problems,
          'unknown_words_ru': spell(list(words_ru), 'ru_RU'), 'unknown_words_en': spell(list(words_en), 'en_GB'),
          'skipped': [x for x, ok in (('agreement (pymorphy3)', MORPH), ('spelling (hunspell)', shutil.which('hunspell'))) if not ok]}
(DIR / 'review.json').write_text(json.dumps(report, ensure_ascii=False, indent=1))
touched = set()
for k, v in problems.items():
    touched |= set(v)
    print(f'{len(v):4}  {k}' + (f'  {v[:10]}' if v else ''))
print(f'{len(touched):4}  карточек с проблемами из {len(cards)} + {len(rare)}')
for k in ('unknown_words_ru', 'unknown_words_en'):
    if report[k] is not None: print(f'{k}: {len(report[k])} (названия и термины мира проверяются глазами): {" ".join(report[k][:80])}')
if report['skipped']: print('skipped:', ', '.join(report['skipped']))
sys.exit(1 if touched else 0)
