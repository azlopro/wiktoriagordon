#!/usr/bin/env bash
#
# Bygger de to link-forhåndsvisninger (Open Graph-kort) i static/img/.
#
# HVORFOR EN BROWSER OG IKKE ET BILLEDBIBLIOTEK:
# Kortene skal bruge sitets egne skrifter, som kun findes som woff2. Ved at
# lade Chromium tegne dem får vi Cormorant Garamond og Jost præcis som på
# siden, i stedet for en tilnærmelse med en anden skrift.
#
# Teksten står i dette script, ikke i CMS'et. Kortene er billeder, der bygges
# på forhånd, så et CMS-felt ville se ud som om det virkede uden at ændre
# noget som helst. Skal teksten laves om, rettes den her, og scriptet køres:
#
#     bash scripts/og-card/make.sh
#
# Kør det og commit de to PNG-filer. Facebook og LinkedIn cacher kortene
# aggressivt; brug deres debuggere til at hente den nye version.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

command -v chromium >/dev/null || { echo "chromium mangler" >&2; exit 1; }

work="$(mktemp -d)"
trap 'rm -rf "$work"; kill %1 2>/dev/null || true' EXIT

cp -r static/fonts "$work/fonts"
mkdir -p "$work/img"
cp static/img/logo-wg.png "$work/img/"

render() {   # sprog  fil  eyebrow  navn  tagline  sted
  sed -e "s|__LANG__|$1|" -e "s|__EYEBROW__|$3|" -e "s|__NAME__|$4|" \
      -e "s|__TAGLINE__|$5|" -e "s|__PLACE__|$6|" \
      scripts/og-card/card.html > "$work/card.html"
  chromium --headless --disable-gpu --no-sandbox --hide-scrollbars \
    --force-device-scale-factor=1 --window-size=1200,630 \
    --virtual-time-budget=5000 --screenshot="static/img/$2" \
    "http://localhost:8907/card.html" >/dev/null 2>&1
  echo "  static/img/$2"
}

python3 -m http.server 8907 --directory "$work" >/dev/null 2>&1 &
sleep 1

echo "Bygger link-forhåndsvisninger:"
render da og-card-v2.png \
  "Koreansk lash lift · Brynstyling" \
  "Wiktoria Gordon" \
  "Dit smukkeste jeg, helt naturligt" \
  "Horsens"
render en og-card-en-v2.png \
  "Korean lash lift · Brow styling" \
  "Wiktoria Gordon" \
  "Your most beautiful you, naturally" \
  "Horsens"
echo "Færdig."
