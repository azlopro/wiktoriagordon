#!/usr/bin/env bash
#
# Kør sitet lokalt.
#
# Bookingen er TÆNDT i data/site.yaml, men tidsvælgeren viser sig kun, hvis
# der står ?forhaandsvisning i adressen. Almindelige besøgende ser DM-knapperne
# som før. Scriptet skal derfor ikke længere slå noget til og fra undervejs.
#
#   bash scripts/booking/dev.sh          rigtige tider og rigtig testbetaling
#   bash scripts/booking/dev.sh --stub   opdigtet fra ende til anden
#
# ⚠️  HUSK ?forhaandsvisning I ADRESSEN, ellers ser du DM-knapperne som en
#     almindelig besoegende:  http://127.0.0.1:8788/?forhaandsvisning#booking
#
# --stub kræver ingen nøgler overhovedet. Den svarer på /api/slots,
# /api/checkout og /api/booking med opdigtede svar og springer MobilePay over,
# så hele forløbet fra tidsvælger til kvittering kan afprøves i browseren.
# Brug den til alt, der handler om, hvordan siderne opfører sig.
#
# Uden --stub køres Workeren rigtigt. Så skal scripts/booking/.env indeholde:
#   CAL_API_KEY=cal_live_...
#   MOBILEPAY_CLIENT_ID=...
#   MOBILEPAY_CLIENT_SECRET=...
#   MOBILEPAY_SUBSCRIPTION_KEY=...
#   MOBILEPAY_MSN=...
#   SALON_ADDRESS=Fredericiagade 11, 1. sal, 8700 Horsens
#
# ⚠️  BEMÆRK: MobilePay kræver https på returnUrl, og localhost er http.
#     Betalingsdelen kan derfor IKKE køres helt igennem her. Den skal testes
#     på et rigtigt deploy mod apitest.vipps.no. Se scripts/booking/PLAN.md.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

PORT=8788
STUB=0
[[ "${1:-}" == "--stub" ]] && STUB=1

# Bookingen er TAENDT i data/site.yaml, men tidsvaelgeren viser sig kun med
# ?forhaandsvisning i adressen. Der er derfor ikke laengere noget at slaa til
# og fra her, og heller ikke noget at rydde op efter: det gamle script rettede
# i site.yaml og skulle huske at rette tilbage igen.
echo "Bygger..."
hugo --quiet --destination public

cleanup() {
  rm -f .dev-stub.py .dev.vars
}
trap cleanup EXIT INT TERM

if [[ "$STUB" == "1" ]]; then
  cat > .dev-stub.py <<'PY'
import http.server, json, datetime, urllib.parse, secrets, time

ROOT = 'public'

# Opdigtede bookinger. Nøglen er referencen, værdien er hvornår den blev
# oprettet: de første par opslag svarer "undervejs", så ventetilstanden på
# kvitteringssiden også bliver set.
PENDING = {}


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def reply(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header('content-type', 'application/json')
        self.send_header('content-length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)

        if u.path == '/api/slots':
            start = datetime.date.fromisoformat(
                q.get('from', [datetime.date.today().isoformat()])[0])
            days = {}
            for i in range(7):
                d = start + datetime.timedelta(days=i)
                if d.weekday() in (5, 6):          # lukket i weekenden
                    continue
                days[d.isoformat()] = [
                    f'{d.isoformat()}T{h:02d}:{m:02d}:00.000+02:00'
                    for h, m in ((10, 0), (11, 30), (13, 0), (14, 30), (16, 0))]
            return self.reply({'timeZone': 'Europe/Copenhagen', 'days': days})

        if u.path == '/api/booking':
            ref = q.get('ref', [''])[0]
            rec = PENDING.get(ref)
            if not rec:
                return self.reply({'error': 'ukendt booking'}, 404)
            # Lad den stå og vente et par sekunder, så ventetilstanden ses.
            if time.time() - rec['at'] < 4:
                return self.reply({**rec['data'], 'status': 'pending'})
            return self.reply({
                **rec['data'],
                'status': 'done',
                'address': 'Teststræde 1, 1. sal, 8700 Horsens',
            })

        return super().do_GET()

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        if u.path != '/api/checkout':
            return self.reply({'error': 'ukendt endepunkt'}, 404)

        length = int(self.headers.get('content-length') or 0)
        body = json.loads(self.rfile.read(length) or b'{}')

        ref = 'wg-' + secrets.token_hex(16)
        start = datetime.datetime.fromisoformat(
            body['start'].replace('Z', '+00:00'))
        PENDING[ref] = {'at': time.time(), 'data': {
            'title': body.get('treatment', 'Behandling'),
            'start': start.isoformat(),
            'end': (start + datetime.timedelta(minutes=60)).isoformat(),
            'firstName': body.get('firstName', ''),
            'lang': body.get('lang', 'da'),
        }}
        # MobilePay springes over: kunden sendes direkte til kvitteringen,
        # præcis som hun ville lande der efter en godkendt betaling.
        path = '/en/thanks/' if body.get('lang') == 'en' else '/tak/'
        return self.reply({'redirectUrl': f'{path}?ref={ref}'})

    def log_message(self, *a):
        pass


print('Opdigtet fra ende til anden. Åbn http://127.0.0.1:8788/?forhaandsvisning#booking')
http.server.ThreadingHTTPServer(('127.0.0.1', 8788), H).serve_forever()
PY
  python3 .dev-stub.py
else
  if [[ ! -f scripts/booking/.env ]]; then
    echo "scripts/booking/.env mangler. Kør med --stub, eller læg nøglerne der." >&2
    exit 1
  fi
  # wrangler læser .dev.vars af sig selv. Filen er i .gitignore og slettes af
  # cleanup ovenfor, så nøglerne aldrig bliver liggende i træet.
  cp scripts/booking/.env .dev.vars
  echo 'MOBILEPAY_ENV=test' >> .dev.vars
  echo "Rigtige tider fra Cal. Åbn http://127.0.0.1:$PORT/?forhaandsvisning#booking"
  npx --yes wrangler@4 dev --port "$PORT" --local
fi
