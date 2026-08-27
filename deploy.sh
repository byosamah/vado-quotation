#!/usr/bin/env bash
# Rebuild the fillable HTML and put it on Vercel.
#
#   ./deploy.sh            a preview URL, for checking
#   ./deploy.sh --prod     the live URL the team uses
#
# It refuses to deploy if the Python deck fails its own checks, so a broken
# proposal cannot reach the office. Note what it does NOT check: the browser
# tests that compare the HTML against the PowerPoint need a browser, and are
# run by hand with html/tests/prepare.py. Green here means the data and every
# saved job are sound; it does not mean somebody looked at the pages.
set -euo pipefail
cd "$(dirname "$0")"
PY="${PYTHON:-python3}"

echo "==> checking the deck"
PYTHON="$PY" tools/smoke.sh

echo "==> building the MCP bundles"
"$PY" tools/build_mcp.py

echo "==> building web/index.html"
BYTES=$(wc -c < web/index.html)
if [ "$BYTES" -lt 500000 ]; then
  echo "index.html is only $BYTES bytes; the fonts or images did not embed." >&2
  exit 1
fi
echo "    $(( BYTES / 1024 )) KB"

echo "==> deploying"
if [ "${1:-}" = "--prod" ]; then
  vercel deploy web --prod --yes
else
  vercel deploy web --yes
fi

cat <<'NOTE'

Reminder: protection is per project, not per deployment.
If you ever recreate the project, turn password protection back on before
sharing the link. The file carries the office IBAN and the signature scan.
NOTE
