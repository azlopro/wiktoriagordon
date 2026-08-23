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

[[ -f static/_headers ]] || fail "Cloudflare security headers are missing"
grep -q 'Content-Security-Policy:' static/_headers || fail "CSP is missing"
grep -q 'Strict-Transport-Security:' static/_headers || fail "HSTS is missing"

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

if find public -type f -name '*.html' -exec grep -H -n -i -E \
  '<[^>]+[[:space:]]on[a-z]+[[:space:]]*=' {} +; then
  fail "generated HTML contains an inline event handler"
fi

echo "Security checks passed."
