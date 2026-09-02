#!/usr/bin/env python3
"""
Godkend en TESTBETALING uden MobilePay-appen.

HVORFOR DEN FINDES:
Resten af testlisten i PLAN.md kraever en godkendt betaling for hvert punkt:
book og haev, fortryd, luk browseren, to faner p aa en gang. Skal hver eneste
godkendes i haanden i MT-appen, bliver runden lang, og punkterne bliver
sprunget over. Testmiljoeet har derfor et endepunkt, der godkender for en:

    POST /epayment/v1/payments/{reference}/approve

DEN VIRKER KUN I TEST. Scriptet naegter at koere mod produktion, og
produktionens vaert svarer alligevel 404 paa endepunktet. Der findes
bevidst INGEN tilsvarende kode i worker/ - en "godkend hvad som helst"-vej
har intet at goere i den Worker, der hoerer til hendes rigtige site.

FORUDSAETNING: testbrugeren skal have godkendt MINDST EEN betaling i
MT-appen foerst. Derefter er brugeren kendt, og resten kan koeres herfra.
Faar du en fejl om det, er der ingen vej uden om appen den foerste gang.

Nøglerne laeses fra scripts/booking/.env, som er i .gitignore:

    MOBILEPAY_CLIENT_ID=...
    MOBILEPAY_CLIENT_SECRET=...
    MOBILEPAY_SUBSCRIPTION_KEY=...
    MOBILEPAY_MSN=2068956

Brug:
    python3 scripts/booking/approve-test.py wg-abc123...              # godkend
    python3 scripts/booking/approve-test.py wg-abc123... --status     # kun laes
"""
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

HOST = 'https://apitest.vipps.no'   # aldrig produktion, se docstring
ENV = Path(__file__).with_name('.env')

SYSTEM = {
    'Vipps-System-Name': 'wiktoriagordon.dk',
    'Vipps-System-Version': '1.0',
    'Vipps-System-Plugin-Name': 'w-website-booking',
    'Vipps-System-Plugin-Version': '1.0',
}


def load_env():
    if not ENV.exists():
        sys.exit(f'{ENV} mangler. Se docstring i toppen af filen.')
    out = {}
    for line in ENV.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            out[k.strip()] = v.strip()
    missing = [k for k in ('MOBILEPAY_CLIENT_ID', 'MOBILEPAY_CLIENT_SECRET',
                           'MOBILEPAY_SUBSCRIPTION_KEY', 'MOBILEPAY_MSN')
               if not out.get(k)]
    if missing:
        sys.exit('mangler i .env: ' + ', '.join(missing))
    return out


def call(path, env, method='GET', body=None, token=None):
    headers = {
        'Ocp-Apim-Subscription-Key': env['MOBILEPAY_SUBSCRIPTION_KEY'],
        'Merchant-Serial-Number': env['MOBILEPAY_MSN'],
        **SYSTEM,
    }
    if token:
        headers['Authorization'] = f'Bearer {token}'
    else:
        headers['client_id'] = env['MOBILEPAY_CLIENT_ID']
        headers['client_secret'] = env['MOBILEPAY_CLIENT_SECRET']
    if body is not None:
        headers['Content-Type'] = 'application/json'

    req = urllib.request.Request(
        HOST + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers=headers)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors='replace')[:500]
        return e.code, detail


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        sys.exit('brug: approve-test.py <reference> [--status]')
    ref = args[0]

    env = load_env()
    status, body = call('/accesstoken/get', env, method='POST')
    if status != 200:
        sys.exit(f'kunne ikke hente token ({status}): {body}')
    token = body['access_token']

    def show():
        s, b = call(f'/epayment/v1/payments/{ref}', env, token=token)
        if s != 200:
            print(f'  opslag fejlede ({s}): {b}')
            return None
        agg = b.get('aggregate', {})
        print(f"  state:      {b.get('state')}")
        for k in ('authorizedAmount', 'capturedAmount', 'cancelledAmount', 'refundedAmount'):
            v = (agg.get(k) or {}).get('value')
            if v:
                print(f"  {k:11} {v/100:.2f} {(agg.get(k) or {}).get('currency')}")
        return b.get('state')

    print(f'{ref}')
    print('foer:')
    show()

    if '--status' in sys.argv:
        return

    print('godkender...')
    s, b = call(f'/epayment/v1/payments/{ref}/approve', env,
                method='POST', body={}, token=token)
    if s not in (200, 202, 204):
        print(f'  FEJL {s}: {b}')
        print()
        print('  Er beskeden om en ukendt eller uverificeret bruger, skal')
        print('  testbrugeren godkende EEN betaling i MT-appen foerst.')
        sys.exit(1)

    print('efter:')
    show()


if __name__ == '__main__':
    main()
