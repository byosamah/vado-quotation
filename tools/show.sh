#!/bin/bash
# Rebuild a proposal and put the fresh copy in front of PowerPoint.
#
#   tools/show.sh jobs/260823MKM-RES-VILLA.json
#
# PowerPoint keeps its own copy in memory, so a rebuild under an open file
# is invisible until the window is closed and reopened. Doing that by hand
# every round is the kind of friction that makes people stop checking.
#
# Closes only the one presentation, by name, so other work stays open.
# Discards nothing you wanted: the .pptx is generated, never edited.
set -euo pipefail

cd "$(dirname "$0")/.."

# PYTHON lets a caller with a different PATH point at the right interpreter
PY="${PYTHON:-python3}"

[ $# -ge 1 ] || { echo "usage: tools/show.sh jobs/<id>.json [jobs/<other>.json ...]"; exit 2; }

# Close every one first, then build, then reopen. Closing as we go lets
# PowerPoint hold a stale copy of the second file while the first is being
# swapped, which is how you end up staring at yesterday's slide.
for JOB in "$@"; do
  NAME="$(basename "${JOB%.json}").pptx"
  osascript > /dev/null 2>&1 <<EOS || true
tell application "Microsoft PowerPoint"
	close (every presentation whose name is "$NAME") saving no
end tell
EOS
done

for JOB in "$@"; do
  OUT="out/$(basename "${JOB%.json}").pptx"
  "$PY" build.py --data "$JOB" --out "$OUT"
  "$PY" tools/lint_pptx.py "$OUT" > /dev/null
done

sleep 1
for JOB in "$@"; do
  open "out/$(basename "${JOB%.json}").pptx"
  sleep 2
done
echo "reopened: $(for J in "$@"; do printf '%s ' "$(basename "${J%.json}").pptx"; done)"
