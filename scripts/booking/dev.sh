#!/usr/bin/env bash
#
# Kør sitet lokalt med online-booking tændt.
#
# Bookingen er slået fra i data/site.yaml, indtil den er klar til at gå live.
# Scriptet tænder den midlertidigt, bygger, serverer, og slukker den igen når
# du lukker ned. Også hvis du afbryder med ctrl+c, og også hvis det fejler
# undervejs. Det er derfor der er en trap: ellers ville en afbrudt kørsel
# efterlade online: true i en fil, der er med i git.
#
#   bash scripts/booking/dev.sh          rigtige tider fra Cal
#   bash scripts/booking/dev.sh --stub   opdigtede tider, ingen nøgle nødvendig
#
# Rigtige tider kræver scripts/booking/.env med CAL_API_KEY. Bemærk at Cal kun
# har ledige tider, hvis Wiktorias åbningstider er sat. Er de ikke, ser du den
# tomme tilstand med knappen til Instagram, hvilket er hvad en besøgende ville
# se lige nu.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

PORT=8788
STUB=0
[[ "${1:-}" == "--stub" ]] && STUB=1

BACKUP="$(mktemp)"
cp data/site.yaml "$BACKUP"

cleanup() {
  cp "$BACKUP" data/site.yaml
  rm -f "$BACKUP" .dev-stub.py
  echo
  echo "Bookingen er slået fra igen. data/site.yaml er som før."
}
trap cleanup EXIT INT TERM

sed -i 's/^    online: false$/    online: true/' data/site.yaml
echo "Bygger med booking tændt..."
hugo --quiet --destination public

if [[ "$STUB" == "1" ]]; then
  cat > .dev-stub.py <<'PY'
import http.server, json, datetime, urllib.parse
ROOT = 'public'
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == '/api/slots':
            q = urllib.parse.parse_qs(u.query)
            start = datetime.date.fromisoformat(
                q.get('from', [datetime.date.today().isoformat()])[0])
            days = {}
            for i in range(7):
                d = start + datetime.timedelta(days=i)
                if d.weekday() in (0, 6):          # lukket mandag og søndag
                    continue
                days[d.isoformat()] = [
                    f'{d.isoformat()}T{h:02d}:{m:02d}:00.000+02:00'
                    for h, m in ((9,0),(10,30),(12,0),(13,30),(15,0),(16,30))]
            body = json.dumps({'timeZone': 'Europe/Copenhagen', 'days': days}).encode()
            self.send_response(200)
            self.send_header('content-type', 'application/json')
            self.send_header('content-length', str(len(body)))
            self.end_headers(); self.wfile.write(body); return
        return super().do_GET()
    def log_message(self, *a): pass
print(f'Opdigtede tider. Åbn http://127.0.0.1:8788/#booking')
http.server.ThreadingHTTPServer(('127.0.0.1', 8788), H).serve_forever()
PY
  python3 .dev-stub.py
else
  if [[ ! -f scripts/booking/.env ]]; then
    echo "scripts/booking/.env mangler. Kør med --stub, eller læg CAL_API_KEY der." >&2
    exit 1
  fi
  KEY="$(grep '^CAL_API_KEY=' scripts/booking/.env | cut -d= -f2-)"
  echo "Rigtige tider fra Cal. Åbn http://127.0.0.1:$PORT/#booking"
  npx --yes wrangler@4 dev --port "$PORT" --local --var "CAL_API_KEY:$KEY"
fi
