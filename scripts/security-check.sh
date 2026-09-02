#!/usr/bin/env bash
set -euo pipefail

project_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "${project_dir}"

fail() {
  echo "SECURITY CHECK FAILED: $*" >&2
  exit 1
}

# Editor-controlled strings must never be promoted to trusted HTML.
if grep -R -n -E '\|[[:space:]]*safeHTML' layouts; then
  fail "safeHTML is present in a layout; review the escaping context"
fi

# Every client-facing image field must be raster-only and must not accept a URL.
image_fields=$(grep -c 'widget: image' static/admin/config.yml || true)
restricted_fields=$(grep 'widget: image' static/admin/config.yml \
  | grep -c "accept: 'image/jpeg,image/png,image/webp'.*choose_url: false" || true)
if [[ "${image_fields}" -eq 0 || "${image_fields}" -ne "${restricted_fields}" ]]; then
  fail "all CMS image fields must be raster-only with choose_url disabled"
fi

if grep -q -E '^[[:space:]]+svg:' static/admin/config.yml; then
  fail "SVG processing is enabled for client uploads"
fi

grep -q 'auth_methods: \[oauth\]' static/admin/config.yml \
  || fail "CMS login must be OAuth-only"
grep -q 'branch: master' static/admin/config.yml \
  || fail "CMS branch no longer matches the repository default"

# Online booking is switched on, but the picker only appears with
# ?forhaandsvisning in the address. That flag is the ONLY thing standing
# between a visitor and a booking form that still points at test payments.
# If booking.preview disappears from data/site.yaml, data-preview renders
# empty, the check in booking.js stops matching, and the form goes live to
# everyone without anyone deciding it should.
#
# This replaced an older guard that watched for a temporary "online: true"
# during a dev session. That failure mode is gone: online is now permanently
# true, and preview is what holds the door.
preview_flags=$(grep -c '^    preview: ' data/site.yaml || true)
if [[ "${preview_flags}" -ne 2 ]]; then
  fail "booking.preview must be set for both languages in data/site.yaml"
fi

[[ -f static/_headers ]] || fail "Cloudflare security headers are missing"
grep -q 'Content-Security-Policy:' static/_headers || fail "CSP is missing"
grep -q 'Strict-Transport-Security:' static/_headers || fail "HSTS is missing"

# Cloudflare JOINS duplicate headers with a comma, and a browser given two
# policies enforces the intersection of both. A site-wide CSP on /* would
# therefore strip /admin/ of the sources the CMS needs, without any error.
if grep -A6 '^/\*$' static/_headers | grep -q 'Content-Security-Policy:'; then
  fail "a CSP on /* would intersect with the /admin/ policy and break the CMS"
fi

# The Cal embed is gone; booking runs on the site's own picker. If the embed
# comes back, the CSP has to be opened again AND a consent banner has to be
# built, because it fetches from a third party on page load.
if grep -q 'cal.eu' static/_headers layouts/partials/*.html static/js/*.js 2>/dev/null; then
  fail "the Cal embed is back; re-read layouts/partials/sections/booking-picker.html first"
fi

# The booking receipt carries a customer name and the full street address.
grep -q '^/tak/\*' static/_headers || fail "the booking receipt has no headers rule"
grep -A4 '^/tak/\*' static/_headers | grep -q 'X-Robots-Tag: noindex' \
  || fail "the booking receipt must be noindex"
grep -A4 '^/tak/\*' static/_headers | grep -q 'Cache-Control: no-store' \
  || fail "the booking receipt must never be held in a shared cache"

# The full address is a Worker secret on purpose. /tak/ is a public page, so
# anything built into it can be read by anyone who opens the address.
if grep -R -n -E 'Fredericiagade [0-9]' data layouts static content; then
  fail "the full street address must not be built into the site; it is SALON_ADDRESS"
fi

# Reject both SVG filenames and disguised active content. Checking the magic
# bytes means an SVG renamed to .jpg cannot pass the deployment gate.
while IFS= read -r -d '' media_file; do
  lower_name=${media_file,,}
  signature=$(od -An -tx1 -N12 -- "${media_file}" | tr -d ' \n')

  case "${lower_name}" in
    *.jpg|*.jpeg)
      [[ "${signature:0:6}" == "ffd8ff" ]] \
        || fail "${media_file} is not a real JPEG"
      ;;
    *.png)
      [[ "${signature:0:16}" == "89504e470d0a1a0a" ]] \
        || fail "${media_file} is not a real PNG"
      ;;
    *.webp)
      [[ "${signature:0:8}" == "52494646" && "${signature:16:8}" == "57454250" ]] \
        || fail "${media_file} is not a real WebP"
      ;;
    *)
      fail "unsupported file type in client media directory: ${media_file}"
      ;;
  esac
done < <(find static/img -type f -print0)

if grep -R -n -E 'Betroet af 180\+|Trusted by 180\+|Baseret på 48 anmeldelser|Based on 48 reviews' \
  data layouts i18n static/admin; then
  fail "an unsupported legacy review-count claim has returned"
fi

hugo --cleanDestinationDir --gc --minify

# Hvert getElementById i sitets JavaScript skal svare til et element, der
# faktisk bliver bygget. Sker det ikke, kaster koden en TypeError midt i en
# hændelse, og den slags bliver typisk fanget af en catch, der tror det er en
# netværksfejl — så prøver siden bare igen, og den besøgende ser en evig
# spinner uden en fejl nogen steder.
#
# Det skete 2/9-2026: thAddress blev klippet ud af thanks.html ved en
# oprydning, og bookingkvitteringen stod og ventede i det uendelige på en
# booking, der for længst var gennemført.
python3 - <<'PYCHECK' || fail "et getElementById peger på et element, der ikke bygges"
import pathlib, re, sys

# vagtpost = det element, scriptet selv tjekker for, før det gør noget.
# Findes det ikke på siden, er blokken slet ikke bygget (tidsvælgeren
# bygges kun når booking.online er true), og så er der intet at holde op
# mod. Findes det, SKAL resten også være der.
sider = {
    'static/js/thanks.js': ('thanksCard',
                            ['public/tak/index.html', 'public/en/thanks/index.html']),
    'static/js/booking.js': ('bookingPicker',
                             ['public/index.html', 'public/en/index.html']),
}


def har(markup, ident):
    # Minifieren fjerner anførselstegn, så begge former skal godtages.
    return re.search(r'id=(?:"%s"|%s)(?=[\s>])' % (re.escape(ident), re.escape(ident)), markup)


problemer = 0
for js, (vagtpost, htmls) in sider.items():
    kilde = pathlib.Path(js)
    if not kilde.exists():
        continue
    ider = set(re.findall(r'getElementById\(\s*"([^"]+)"', kilde.read_text(encoding='utf-8')))
    for html in htmls:
        f = pathlib.Path(html)
        if not f.exists():
            continue
        markup = f.read_text(encoding='utf-8')
        if not har(markup, vagtpost):
            continue      # blokken er ikke bygget på den her side
        for i in sorted(ider):
            if not har(markup, i):
                print(f'  {js}: getElementById("{i}") findes ikke i {html}')
                problemer += 1

sys.exit(1 if problemer else 0)
PYCHECK

# Kvitteringen køres igennem alle sine tilstande mod den HTML, Hugo lige har
# bygget. Tjekket ovenfor fanger et manglende element; det her fanger også en
# tom adresse, et forkert datoformat i kalenderlinkene og en tilstand, der
# viser den forkerte besked. Se scripts/booking/test-kvittering.mjs.
if command -v node >/dev/null 2>&1; then
  node scripts/booking/test-kvittering.mjs || fail "bookingkvitteringen opfører sig forkert"
else
  echo "ADVARSEL: node mangler, kvitteringstesten blev sprunget over" >&2
fi

if find public -type f -name '*.html' -exec grep -H -n -i -E \
  '<[^>]+[[:space:]]on[a-z]+[[:space:]]*=' {} +; then
  fail "generated HTML contains an inline event handler"
fi

echo "Security checks passed."
