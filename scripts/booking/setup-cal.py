#!/usr/bin/env python3
"""
Opretter behandlingerne som event types i Cal.

HVORFOR ET SCRIPT:
Ni behandlinger med seks indstillinger hver er 54 felter at ramme rigtigt i
hånden. Scriptet gør det ensartet, kan køres igen når noget skal laves om, og
efterlader opsætningen som noget man kan læse frem for noget man skal huske.

Det er IDEMPOTENT: findes en event type med samme slug i forvejen, opdateres
den i stedet for at blive oprettet igen. Kør den så mange gange du vil.

Navne og beskrivelser hentes fra data/services.yaml, så Cal og prislisten
siger det samme. Varigheder tages fra samme fil, hvis de er udfyldt, og
falder ellers tilbage på estimaterne herunder.

Brug:
    echo 'CAL_API_KEY=cal_live_...' > scripts/booking/.env
    python3 scripts/booking/setup-cal.py            # vis hvad der ville ske
    python3 scripts/booking/setup-cal.py --apply    # gør det

Nøglen giver fuld adgang til kontoen, inklusive bookinger og kundeoplysninger.
Slet .env og tilbagekald nøglen i Cal, når opsætningen står, og under alle
omstændigheder før kontoen overdrages til Wiktoria.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
API = 'https://api.cal.com/v2'
API_VERSION = '2024-06-14'

REDIRECT = 'https://www.wiktoriagordon.dk/betal/'
BUFFER_AFTER = 15      # minutter til oprydning og skift
NOTICE = 12 * 60       # kunden kan tidligst booke 12 timer ude

# slug -> (nøgle i services.yaml efter rækkefølge, estimeret varighed)
# Slugs er engelske og neutrale, fordi de står i URL'en og i calSlug.
# Navnene kommer fra services.yaml og er danske.
PLAN = [
    ('lash-lift', 60),
    ('brow-lamination', 45),
    ('brow-lamination-tint', 60),
    ('brow-tint-shaping', 45),
    ('brow-shaping', 30),
    ('lash-brow-lamination-tint', 120),
    ('lash-brow-lamination', 105),
    ('lash-brow-tint', 105),
    ('lash-brow-shaping', 90),
]


def load_key():
    env = Path(__file__).with_name('.env')
    if env.exists():
        for line in env.read_text(encoding='utf-8').splitlines():
            if line.startswith('CAL_API_KEY='):
                return line.split('=', 1)[1].strip()
    key = os.environ.get('CAL_API_KEY')
    if not key:
        sys.exit('CAL_API_KEY mangler. Læg den i scripts/booking/.env')
    return key


def call(method, path, key, body=None):
    req = urllib.request.Request(
        API + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            'Authorization': f'Bearer {key}',
            'cal-api-version': API_VERSION,
            'Content-Type': 'application/json',
        })
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors='replace')[:400]
        sys.exit(f'{method} {path} svarede {e.code}\n{detail}')


def minutes(service, fallback):
    """Varighed fra services.yaml hvis den er udfyldt, ellers estimatet."""
    raw = (service.get('duration') or '').strip()
    digits = ''.join(c for c in raw if c.isdigit())
    return int(digits) if digits else fallback


def main():
    apply = '--apply' in sys.argv
    key = load_key()
    services = yaml.safe_load((ROOT / 'data/services.yaml').read_text(encoding='utf-8'))['da']['main']
    if len(services) != len(PLAN):
        sys.exit(f'services.yaml har {len(services)} behandlinger, planen har {len(PLAN)}')

    existing = {e['slug']: e for e in call('GET', '/event-types', key).get('data', [])}
    print(f'{len(existing)} event types findes i forvejen\n')

    for (slug, fallback), svc in zip(PLAN, services):
        payload = {
            'title': svc['title'],
            'slug': slug,
            'lengthInMinutes': minutes(svc, fallback),
            'description': svc.get('desc') or '',
            'requiresConfirmation': True,
            'successRedirectUrl': REDIRECT,
            'afterEventBuffer': BUFFER_AFTER,
            'minimumBookingNotice': NOTICE,
            'bookingFields': [{
                'type': 'phone',
                'slug': 'attendeePhoneNumber',
                'label': 'Telefonnummer',
                'required': True,
                'hidden': False,
            }],
        }
        found = existing.get(slug)
        verb = 'opdaterer' if found else 'opretter'
        est = '' if (svc.get('duration') or '').strip() else '  (estimeret varighed)'
        print(f"  {verb:10} {slug:28} {payload['lengthInMinutes']:>3} min  {svc['title']}{est}")
        if not apply:
            continue
        if found:
            call('PATCH', f"/event-types/{found['id']}", key, payload)
        else:
            call('POST', '/event-types', key, payload)

    if not apply:
        print('\nIngenting er ændret. Kør igen med --apply for at gøre det.')
    else:
        print('\nFærdig. Tjek i Cal at "requires confirmation" står til på alle ni:')
        print('API\'et understøtter feltet, men er det ikke slået igennem, er det')
        print('ni klik under Advanced, og resten af opsætningen står allerede.')


if __name__ == '__main__':
    main()
