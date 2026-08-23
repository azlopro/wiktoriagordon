#!/usr/bin/env bash
#
# Bygger sitet på Cloudflare.
#
# HVORFOR ET SCRIPT OG IKKE BARE "hugo --gc --minify":
# Cloudflare kan godt hente Hugo selv, hvis env-variablen HUGO_VERSION er sat i
# dashboardet. Men den variabel forsvinder, når nogen retter i byggeindstillingerne,
# og så bygger den enten med en anden Hugo-version end den, sitet er testet med,
# eller slet ikke. Her står versionen i repoet, hvor den følger med i historikken.
#
# Scriptet kaldes af wrangler selv via "build.command" i wrangler.jsonc, IKKE af
# dashboardets byggefelt. Det er med vilje: felterne i dashboardet er tomme, og de
# er blevet ryddet før uden at nogen opdagede det. Står byggeriet i repoet, kan det
# ikke ske igen.
#
# Samme mønster som ithjælpnu.dk.

set -euo pipefail

HUGO_VERSION=0.163.2   # samme som lokalt; hæves her, når der skal opgraderes
TZ=Europe/Copenhagen

export TZ
export HUGO_CACHEDIR="${PWD}/.cache/hugo"

build_temp_dir=""
cleanup() {
  if [[ -n "${build_temp_dir}" && -d "${build_temp_dir}" ]]; then
    rm -rf "${build_temp_dir}"
  fi
}
trap cleanup EXIT SIGINT SIGTERM

build_temp_dir="$(mktemp -d)"

echo "Henter Hugo ${HUGO_VERSION}..."
curl -sfL --output-dir "${build_temp_dir}" -O \
  "https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/hugo_${HUGO_VERSION}_linux-amd64.tar.gz"
mkdir -p "${HOME}/.local/hugo"
tar -C "${HOME}/.local/hugo" -xf "${build_temp_dir}/hugo_${HUGO_VERSION}_linux-amd64.tar.gz"
export PATH="${HOME}/.local/hugo:${PATH}"

hugo version

# Sitet bruger hverken SCSS, Go-moduler, npm-pakker eller git-submoduler, så der er
# ikke mere at installere. Kommer noget af det til, hører det til her.

# Sikkerhedstjekket bygger selv sitet til sidst. Fejler et af tjekkene, stopper
# deployet her i stedet for at lægge sig oven på et site, der virker.
echo "Kører sikkerhedstjek og bygger..."
bash scripts/security-check.sh

# Et tomt eller halvt build skal ikke deployes.
if [[ ! -f public/index.html ]]; then
  echo "FEJL: public/index.html blev ikke bygget" >&2
  exit 1
fi
if [[ ! -f public/_headers ]]; then
  echo "FEJL: _headers mangler i public/ — CSP, HSTS og noindex på demo-domænet" >&2
  echo "      ville forsvinde lydløst ved deploy" >&2
  exit 1
fi

echo "Bygget: $(find public -name '*.html' | wc -l) HTML-sider"
