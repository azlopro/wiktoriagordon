#!/usr/bin/env python3
"""
Kontrollerer at redigeringssystemet i /admin/ passer til data/.

HVORFOR:
Datafilerne og CMS'et hænger sammen tre steder, og ingen af dem fejler
højlydt, når de kommer ud af trit:

  1. Et felt i data/ uden et felt i config.yml bliver SLETTET, når Wiktoria
     gemmer. Sveltia skriver hele filen om og kender kun sine egne felter.
  2. En samling uden en preview i previews.js falder tilbage til en rå
     visning: ren tekst, ingen forhåndsvisning af siden.
  3. Previewen kan pege på felter, der er flyttet eller omdøbt. Så står der
     tomme pladser for billeder der ikke findes, mens de billeder der
     faktisk er, ikke vises nogen steder.

Kør efter enhver ændring i data/*.yaml:

    python3 scripts/cms-check.py

Bevidst holdt UDE af build.sh: den kører på Cloudflare, og et manglende
PyYAML dér ville stoppe et deploy over noget, der kun handler om
redigeringsoplevelsen.
"""
import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
problems = []


def note(msg):
    problems.append(msg)
    print(f'  FEJL: {msg}')


cfg = yaml.safe_load((ROOT / 'static/admin/config.yml').read_text(encoding='utf-8'))
# filnavn -> samlingsdefinition, og samlingens navn ved siden af: de to er
# ikke det samme ("data/site.yaml" mod "site"), og previews slaas op paa navnet
files = {f['file'].replace('data/', ''): f
         for c in cfg['collections'] for f in c.get('files', []) if 'file' in f}
names = {f['file'].replace('data/', ''): f['name']
         for c in cfg['collections'] for f in c.get('files', []) if 'file' in f}
js = (ROOT / 'static/admin/previews.js').read_text(encoding='utf-8')


def declared(fields):
    out = {}
    for f in fields or []:
        sub = None
        if f.get('widget') == 'object':
            sub = declared(f.get('fields'))
        elif f.get('widget') == 'list':
            sub = declared(f.get('fields')) if f.get('fields') else {'*': None}
        out[f['name']] = sub
    return out


def compare(data, decl, path=''):
    missing = []
    if not isinstance(data, dict) or decl is None:
        return missing
    for key, value in data.items():
        if key not in decl:
            missing.append(path + key)
        elif isinstance(value, dict):
            missing += compare(value, decl[key], f'{path}{key}.')
        elif isinstance(value, list) and value and isinstance(value[0], dict):
            missing += compare(value[0], decl[key], f'{path}{key}[].')
    return missing


print('1. Har hver datafil en samling i CMS\'et?')
on_disk = {p.name for p in (ROOT / 'data').glob('*.yaml')}
for name in sorted(on_disk - set(files)):
    note(f'data/{name} har ingen samling i config.yml og kan ikke redigeres')
if not problems:
    print(f'   ok, alle {len(on_disk)} filer')

print('2. Er hvert felt i data/ erklaeret i CMS\'et?')
before = len(problems)
for name, coll in sorted(files.items()):
    data = yaml.safe_load((ROOT / 'data' / name).read_text(encoding='utf-8'))
    branches = {k: v for k, v in data.items() if k in ('da', 'en')} or {'': data}
    missing = set()
    for _, branch in branches.items():
        missing |= set(compare(branch, declared(coll.get('fields'))))
    if missing:
        note(f'{name}: {sorted(missing)} slettes naar der gemmes')
if len(problems) == before:
    print('   ok')

print('3. Har hver samling en forhaandsvisning?')
before = len(problems)
registered = set(re.findall(r"register\('([a-z]+)'", js))
for filename, name in sorted(names.items()):
    if name not in registered:
        note(f'samlingen "{name}" ({filename}) har ingen preview og vises som ren tekst')
if len(problems) == before:
    print('   ok')

print('4. Passer billed-previewen til images.yaml?')
before = len(problems)
imgs = set(yaml.safe_load((ROOT / 'data/images.yaml').read_text(encoding='utf-8')))
block = re.search(r'var labels = \{([^}]*)\}', js)
if not block:
    note('kunne ikke finde billed-etiketterne i previews.js')
else:
    labels = set(re.findall(r"(\w+): '", block.group(1)))
    for extra in sorted(labels - imgs):
        note(f'previewen viser "{extra}", som ikke findes i images.yaml')
    for gone in sorted(imgs - labels):
        note(f'"{gone}" findes i images.yaml, men vises ikke i previewen')
if len(problems) == before:
    print('   ok')

print()
if problems:
    print(f'{len(problems)} problem(er) i redigeringssystemet')
    sys.exit(1)
print('Redigeringssystemet passer til data.')
