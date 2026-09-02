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
    python3 scripts/booking/setup-cal.py --check    # laes hvad der ER i Cal
    python3 scripts/booking/setup-cal.py            # vis hvad der VILLE ske
    python3 scripts/booking/setup-cal.py --apply    # goer det

--check aendrer ingenting og kraever ingenting. Brug den foerst.

⚠️  --apply OVERSKRIVER det, der staar i Cal, ogsaa det der er sat i haanden.
    Ved kontrollen 2/9-2026 stod ni event types med andre varigheder, en
    buffer paa 15 min, uden 'hidden' og HELT UDEN mailfelt (telefonbooking,
    som er praecis det vi vil have). Koeres --apply som scriptet staar nu,
    bliver alt det lavet om, og der bliver FOEJET ET MAILFELT TIL IGEN.
    Ret listerne herunder, saa de beskriver det aftalte, FOER du bruger den.

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
# 15 minutter mellem kunder til oprydning og skift. Varighederne herunder er
# derfor ren behandlingstid; bloktiden er varighed + buffer.
BUFFER_AFTER = 15
NOTICE = 12 * 60       # kunden kan tidligst booke 12 timer ude

# ⚠️  DE HER TAL ER WIKTORIAS EGNE, aflaest fra hendes Cal-konto 2/9-2026.
#     En tidligere udgave af scriptet stod med 60 og 120 hele vejen igennem og
#     buffer 0, og et --apply ville have lavet hendes kalender om uden at
#     nogen bad om det. Ret dem kun efter aftale med hende.
FALLBACK_MINUTES = {
    'lash-lift': 60,
    'brow-lamination': 45,
    'brow-lamination-tint': 60,
    'brow-tint-shaping': 45,
    'brow-shaping': 30,
    'lash-brow-lamination-tint': 120,
    'lash-brow-lamination': 105,
    'lash-brow-tint': 105,
    'lash-brow-shaping': 90,
}

# Aabningstider, aftalt med Wiktoria. Skemaet hedder "Working hours" og er
# hendes standard; alle event types arver det.
HOURS = [
    {'days': ['Monday', 'Tuesday', 'Wednesday'], 'startTime': '10:00', 'endTime': '19:00'},
    {'days': ['Thursday', 'Friday'], 'startTime': '10:00', 'endTime': '16:00'},
]
TIMEZONE = 'Europe/Copenhagen'


def load_env():
    env = Path(__file__).with_name('.env')
    out = {}
    if env.exists():
        for line in env.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                out[k.strip()] = v.strip()
    return out


def load_key():
    key = load_env().get('CAL_API_KEY') or os.environ.get('CAL_API_KEY')
    if not key:
        sys.exit('CAL_API_KEY mangler. Læg den i scripts/booking/.env')
    return key


def load_address():
    """Salonens fulde adresse.

    Den staar i .env og ALDRIG i repoet, samme sted som Worker-secreten
    SALON_ADDRESS. I Cal saettes den med public=false, saa den kun vises efter
    en booking og ikke paa den offentlige bookingside."""
    return load_env().get('SALON_ADDRESS', '').strip()


def call(method, path, key, body=None, version=None):
    req = urllib.request.Request(
        API + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            'Authorization': f'Bearer {key}',
            'cal-api-version': version or API_VERSION,
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


def schedule(key, apply):
    """Aabningstiderne.

    De hoerer med til opsaetningen paa lige fod med event typerne: staar de
    forkert, tilbyder tidsvaelgeren tider, salonen er lukket i. Ved kontrollen
    2/9-2026 stod der mandag-fredag 09-17, hvor aftalen er mandag-onsdag 10-19
    og torsdag-fredag 10-16."""
    data = call('GET', '/schedules', key, version='2024-06-11').get('data', [])
    default = next((s for s in data if s.get('isDefault')), None)
    if not default:
        print('  INTET standardskema fundet i Cal')
        return

    print(f"  skema #{default['id']} {default.get('name')!r} ({default.get('timeZone')})")
    for a in default.get('availability', []):
        print('    nu:   ', ','.join(a.get('days', [])), a.get('startTime'), '-', a.get('endTime'))
    for a in HOURS:
        print('    skal: ', ','.join(a['days']), a['startTime'], '-', a['endTime'])

    if not apply:
        return
    call('PATCH', f"/schedules/{default['id']}", key,
         {'timeZone': TIMEZONE, 'availability': HOURS}, version='2024-06-11')
    print('    rettet.')


def main():
    apply = '--apply' in sys.argv
    key = load_key()
    address = load_address()

    # Laes tilbage og gaa hjem. Ingen skrivninger, ingen risiko.
    if '--check' in sys.argv:
        services = yaml.safe_load(
            (ROOT / 'data/services.yaml').read_text(encoding='utf-8'))['da']['main']
        services = [s for s in services if (s.get('calSlug') or '').strip()]
        verify(key, {s['calSlug']: FALLBACK_MINUTES.get(s['calSlug'])
                     for s in services}, strict=False)
        print('Aabningstider:')
        schedule(key, apply=False)
        return

    services = yaml.safe_load((ROOT / 'data/services.yaml').read_text(encoding='utf-8'))['da']['main']
    services = [s for s in services if (s.get('calSlug') or '').strip()]
    unknown = [s['calSlug'] for s in services if s['calSlug'] not in FALLBACK_MINUTES]
    if unknown:
        sys.exit(f'ingen varighed kendt for: {unknown}')

    if not address:
        print('⚠️  SALON_ADDRESS mangler i scripts/booking/.env.')
        print('    Uden den bliver stedet staaende som Cal Video, og bookingen')
        print('    ser ud som et videomoede i hendes kalender. Laeg den ind og')
        print('    koer igen.\n')

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
            # INGEN MAIL, men feltet SKAL sendes med som skjult.
            #
            # ⚠️  UDELAD DET IKKE. Det blev proevet 2/9-2026: sendes
            #     bookingFields uden en email-post, genskaber Cal sit eget
            #     standardfelt som SYNLIGT OG PAAKRAEVET paa alle ni. Saa staar
            #     der pludselig et mailfelt paa den offentlige bookingside, og
            #     hele "ingen mailadresse"-beslutningen er rullet tilbage af et
            #     enkelt --apply.
            #
            # Med hidden=True ignorerer Cal enhver mail, der sendes med, og
            # laver i stedet en pladsholder ud fra telefonnummeret
            # (4552615380@sms.cal.com). Der indsamles altsaa ingen rigtig
            # mailadresse noget sted.
            #
            # Navnet er EET fuldt navn, ikke variant firstAndLastName.
            # worker/cal.js sender det som en streng netop derfor. Aendres det
            # her, skal koden aendres samtidig, ellers svarer Cal 400 paa hver
            # eneste booking.
            'bookingFields': [
                {
                    'type': 'name',
                    'slug': 'name',
                    'label': 'Navn',
                    'required': True,
                    'hidden': False,
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

        # Fysisk fremmoede, ikke Cal Video. public=False, saa adressen ikke
        # staar paa den offentlige bookingside; den vises foerst efter en
        # booking. Kunden faar den rigtige vej igennem paa /tak/.
        if address:
            payload['locations'] = [
                {'type': 'address', 'address': address, 'public': False},
            ]
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

    print('\nAabningstider:')
    schedule(key, apply=True)

    verify(key, {s['calSlug']: minutes(s, FALLBACK_MINUTES[s['calSlug']])
                 for s in services})


def verify(key, expected, strict=True):
    """Læs indstillingerne tilbage fra Cal og hold dem op mod det, vi bad om.

    Et 200-svar betyder kun at kaldet blev modtaget, ikke at feltet slog
    igennem: Cal kan afvise en enkelt indstilling uden at fejle på resten.
    Derfor læses de tilbage.

    strict=False bruges af --check, hvor forskelle er noget man skal SE og
    tage stilling til, ikke noget der skal stoppe scriptet med exit 1."""
    print('\nKontrollerer hvad der faktisk står i Cal:\n')
    data = call('GET', '/event-types', key).get('data', [])
    found = {e['slug']: e for e in data}
    problems = 0

    print(f"  {'behandling':28} {'min':>4} {'buf':>4} {'varsel':>7} "
          f" bekræft telefon    mail  navn         sted       skjult")
    print('  ' + '-' * 88)
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
        locs = e.get('locations') or []
        sted = 'video' if any(l.get('type') == 'integration' for l in locs) else (
            'fremmoede' if any(l.get('type') == 'address' for l in locs) else '-')
        # Mailfeltet og navnets variant afgør, hvad worker/cal.js skal sende.
        # Findes mailfeltet slet ikke, er event typen sat op som telefon-
        # booking, og det er dét vi vil have. Er navnet uden variant, skal
        # navnet sendes som én streng og ikke som {firstName, lastName}.
        mail_field = next((f for f in fields if f.get('slug') == 'email'), None)
        mail = 'intet' if not mail_field else (
            'skjult' if mail_field.get('hidden') else 'SYNLIGT')
        name_field = next((f for f in fields if f.get('slug') == 'name'), None)
        variant = (name_field or {}).get('variant') or 'fuldt navn'

        print(f"  {slug:28} {got_min:>4} {buf:>4} {notice:>7} "
              f"{'ja' if conf else 'NEJ':>7} {'ja' if phone else 'NEJ':>7} "
              f"{mail:>7}  {variant:<12} {sted:<10} {'ja' if hidden else 'NEJ'}")
        if got_min != want_min or buf != BUFFER_AFTER or notice != NOTICE \
                or not conf or not phone or not hidden \
                or mail == 'SYNLIGT' or sted != 'fremmoede':
            problems += 1

    print()
    if problems and not strict:
        print(f'{problems} behandling(er) står anderledes end scriptets egne tal.')
        print('Det betyder IKKE at de er forkerte. Tag stilling til hver forskel,')
        print('og ret scriptet til, hvis det er Cal der har ret.')
        return
    if problems:
        print(f'{problems} behandling(er) står ikke som forventet. Ret dem i Cal,')
        print('eller kør scriptet igen.')
        sys.exit(1)
    print('Alle ni står som de skal.')


if __name__ == '__main__':
    main()
