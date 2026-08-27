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
siger det samme. Kalenderens bloktid ligger separat herunder, fordi den
offentlige behandlingstid kan være et interval og ikke inkluderer pausen.

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

# Ingen successRedirectUrl: "Redirect on booking" er en Teams-funktion, og
# API'et afviser den med 403 på gratis-planen. Det er derfor bookingen ikke
# længere går gennem Cals egen side, se PLAN.md.
BUFFER_AFTER = 0       # bloktiden nedenfor indeholder allerede oprydning og skift
NOTICE = 12 * 60       # kunden kan tidligst booke 12 timer ude

# Kalenderens bloktid er bevidst adskilt fra den behandlingstid, kunden ser.
# Wiktoria har bedt om 60 minutter pr. enkeltbehandling og 120 minutter pr.
# sæt; de tider indeholder allerede oprydning og skift mellem kunder.
FALLBACK_MINUTES = {
    'lash-lift': 60,
    'brow-lamination': 60,
    'brow-lamination-tint': 60,
    'brow-tint-shaping': 60,
    'brow-shaping': 60,
    'lash-brow-lamination-tint': 120,
    'lash-brow-lamination': 120,
    'lash-brow-tint': 120,
    'lash-brow-shaping': 120,
}


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
            # Uden en rigtig User-Agent svarer Cals API 403 med Cloudflare-kode
            # 1010: bot-beskyttelsen afviser Pythons standardstreng.
            'User-Agent': 'wiktoriagordon-setup/1.0 (+https://www.wiktoriagordon.dk)',
            'Accept': 'application/json',
        })
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors='replace')[:400]
        sys.exit(f'{method} {path} svarede {e.code}\n{detail}')


def minutes(_service, fallback):
    """Kalenderens bloktid; den offentlige varighed kan være et interval."""
    return fallback


def main():
    apply = '--apply' in sys.argv
    key = load_key()
    services = yaml.safe_load((ROOT / 'data/services.yaml').read_text(encoding='utf-8'))['da']['main']
    services = [s for s in services if (s.get('calSlug') or '').strip()]
    unknown = [s['calSlug'] for s in services if s['calSlug'] not in FALLBACK_MINUTES]
    if unknown:
        sys.exit(f'ingen varighed kendt for: {unknown}')

    existing = {e['slug']: e for e in call('GET', '/event-types', key).get('data', [])}
    print(f'{len(existing)} event types findes i forvejen\n')

    for svc in services:
        slug = svc['calSlug']
        payload = {
            'title': svc['title'],
            'slug': slug,
            'lengthInMinutes': minutes(svc, FALLBACK_MINUTES[slug]),
            'description': svc.get('desc') or '',
            # TÆNDT med vilje, selvom vores egen booking altid er betalt inden
            # den oprettes. Cals event types er nemlig offentligt bookbare på
            # cal.com/<bruger>/<slug>, og uden bekræftelse kunne enhver, der
            # finder det link, booke uden om betalingen og få en bekræftet tid
            # gratis.
            #
            # Workeren bekræfter selv de betalte bookinger med
            # POST /v2/bookings/{uid}/confirm lige efter oprettelsen, så
            # Wiktoria ikke skal gøre noget. Det der bliver liggende og venter
            # på hende, er præcis det der ikke er betalt for.
            # Feltet hedder confirmationPolicy, ikke requiresConfirmation. Det
            # sidste accepteres af API'et uden at fejle og bliver derefter
            # ignoreret, hvilket er grunden til at scriptet nu læser sine egne
            # indstillinger tilbage.
            'confirmationPolicy': {
                'type': 'always',
                'blockUnconfirmedBookingsInBooker': True,
            },
            # Skjult fra hendes Cal-profil, så den eneste annoncerede vej til
            # booking er hendes egen hjemmeside. Bemærk at skjult IKKE er en
            # spærre: en skjult event type kan stadig bookes direkte på sin
            # adresse. Det er confirmationPolicy der lukker den vej.
            'hidden': True,
            'afterEventBuffer': BUFFER_AFTER,
            'minimumBookingNotice': NOTICE,
            # Wiktoria vil have fornavn, efternavn og telefon. Ingen mail.
            # Cal understøtter det: telefon som påkrævet felt, mailfeltet skjult.
            'bookingFields': [
                {
                    'type': 'name',
                    'slug': 'name',
                    'label': 'Navn',
                    'required': True,
                    'hidden': False,
                    'variant': 'firstAndLastName',
                },
                {
                    'type': 'phone',
                    'slug': 'attendeePhoneNumber',
                    'label': 'Telefonnummer',
                    'required': True,
                    'hidden': False,
                },
                {
                    'type': 'email',
                    'slug': 'email',
                    'required': False,
                    'hidden': True,
                },
            ],
        }
        found = existing.get(slug)
        verb = 'opdaterer' if found else 'opretter'
        print(f"  {verb:10} {slug:28} {payload['lengthInMinutes']:>3} min  {svc['title']}")
        if not apply:
            continue
        if found:
            call('PATCH', f"/event-types/{found['id']}", key, payload)
        else:
            call('POST', '/event-types', key, payload)

    if not apply:
        print('\nIngenting er ændret. Kør igen med --apply for at gøre det.')
        return

    verify(key, {s['calSlug']: minutes(s, FALLBACK_MINUTES[s['calSlug']])
                 for s in services})


def verify(key, expected):
    """Læs indstillingerne tilbage fra Cal og hold dem op mod det, vi bad om.

    Et 200-svar betyder kun at kaldet blev modtaget, ikke at feltet slog
    igennem: Cal kan afvise en enkelt indstilling uden at fejle på resten.
    Derfor læses de tilbage."""
    print('\nKontrollerer hvad der faktisk står i Cal:\n')
    data = call('GET', '/event-types', key).get('data', [])
    found = {e['slug']: e for e in data}
    problems = 0

    print(f"  {'behandling':28} {'min':>4} {'buffer':>7} {'varsel':>7}  bekræft  telefon  skjult")
    print('  ' + '-' * 68)
    for slug, want_min in expected.items():
        e = found.get(slug)
        if not e:
            print(f'  {slug:28} MANGLER I CAL'); problems += 1; continue
        fields = e.get('bookingFields') or []
        phone = any(f.get('slug') == 'attendeePhoneNumber' and f.get('required')
                    for f in fields)
        policy = e.get('confirmationPolicy') or {}
        conf = policy.get('type') == 'always'
        got_min = e.get('lengthInMinutes')
        buf = e.get('afterEventBuffer') or 0
        notice = e.get('minimumBookingNotice') or 0
        hidden = bool(e.get('hidden'))
        print(f"  {slug:28} {got_min:>4} {buf:>7} {notice:>7}  "
              f"{'ja ' if conf else 'NEJ':>7}  {'ja' if phone else 'NEJ':>7}  "
              f"{'ja' if hidden else 'NEJ'}")
        if got_min != want_min or buf != BUFFER_AFTER or notice != NOTICE \
                or not conf or not phone or not hidden:
            problems += 1

    print()
    if problems:
        print(f'{problems} behandling(er) står ikke som forventet. Ret dem i Cal,')
        print('eller kør scriptet igen.')
        sys.exit(1)
    print('Alle ni står som de skal.')


if __name__ == '__main__':
    main()
