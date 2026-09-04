#!/usr/bin/env bash
# =====================================================================
#  Måler topbjælken i alle telefonbredder.
#
#  Mærket, sprogskifteren, bookingknappen og burgeren deler én linje, og
#  navnet må ikke brække. Bliver et af dem større, lægger navnet sig oven
#  i sprogskifteren uden at nogen CSS-regel fejler — det ses kun, hvis man
#  måler eller kigger på præcis den bredde. Derfor det her script.
#
#  Kolonnen "luft" er afstanden i px fra navnets højre kant til
#  sprogskifterens venstre. Negative tal betyder, at de overlapper.
#
#      bash scripts/maal-topbjaelke.sh
#
#  Kræver chromium og en bygget side i ./public. Måles fra 320 px og op.
#
#  Der måles på DOM'en og ikke på et skærmbillede. Chromiums
#  --force-device-scale-factor ændrer hvad 100vw regner ud til i headless,
#  og mærkets størrelse er netop bygget på 100vw. Et skærmbillede taget med
#  det flag viser derfor et overlap, der ikke findes i en rigtig browser.
#  Skal der tages billeder til kontrol, så lad flaget være.
# =====================================================================
set -euo pipefail

project_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "${project_dir}"

command -v chromium >/dev/null 2>&1 || { echo "chromium mangler"; exit 1; }
[[ -f public/index.html ]] || { echo "byg siden først: hugo"; exit 1; }

port=8873
python3 -m http.server "${port}" --directory public >/dev/null 2>&1 &
server=$!
trap 'kill "${server}" 2>/dev/null || true; rm -f public/__maal.html' EXIT
sleep 1

cat > public/__maal.html <<'HTML'
<!doctype html><meta charset=utf-8><title>maal</title>
<style>html,body{margin:0}iframe{border:0;display:block}</style>
<iframe id=f src="/"></iframe><pre id=out></pre>
<script>
var w = parseInt(new URLSearchParams(location.search).get('w') || '390', 10);
var f = document.getElementById('f');
f.width = w; f.height = 800;
f.onload = function () {
  var d = f.contentDocument;
  function box(sel) { return d.querySelector(sel).getBoundingClientRect(); }
  var name = box('.brand-text'), lang = box('.lang-switch--compact');
  document.getElementById('out').textContent =
    (lang.x - name.right).toFixed(1) + ' ' +
    box('.nav-toggle').right.toFixed(1) + ' ' + box('.nav').right.toFixed(1);
};
</script>
HTML

printf '%6s  %6s  %s\n' bredde luft status
worst=999
# 320 px er gulvet: den smalleste telefon, der findes (iPhone SE, 1. udgave).
# Under det skrumper navnet til noget, der ikke kan læses, og så er det
# bedre at lade det løbe ud end at gøre mærket ulæseligt for alle andre.
for w in 320 331 340 350 360 366 375 385 390 395 401 414 430 460 500 560 620 700 720; do
  line=$(chromium --headless --disable-gpu --virtual-time-budget=3500 \
      --dump-dom "http://localhost:${port}/__maal.html?w=${w}" 2>/dev/null \
    | python3 -c "
import sys, re, html
m = re.search(r'<pre id=\"out\">(.*?)</pre>', sys.stdin.read(), re.S)
print(html.unescape(m.group(1)) if m else '')
")
  gap=$(echo "${line}" | cut -d' ' -f1)
  burger=$(echo "${line}" | cut -d' ' -f2)
  nav=$(echo "${line}" | cut -d' ' -f3)
  status=ok
  awk "BEGIN{exit !(${gap} < 2)}" && status="FOR LIDT LUFT"
  awk "BEGIN{exit !(${burger} > ${nav} + 0.5)}" && status="BURGEREN LØBER UD"
  printf '%6s  %6s  %s\n' "${w}" "${gap}" "${status}"
  worst=$(awk "BEGIN{print (${gap} < ${worst}) ? ${gap} : ${worst}}")
done
echo
echo "mindste luft: ${worst} px"
