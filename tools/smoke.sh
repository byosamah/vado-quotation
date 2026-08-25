#!/bin/bash
# Run everything and fail loudly. Cheap insurance against a tool that
# crashes while a filtered read of its output looks fine.
#
#   tools/smoke.sh
set -uo pipefail
cd "$(dirname "$0")/.."
PY="${PYTHON:-python3}"
fail=0

run() {  # run <label> <expected-exit> <command...>
  local label="$1" want="$2"; shift 2
  local out; out="$("$@" 2>&1)"; local rc=$?
  if [ "$rc" != "$want" ]; then
    echo "FAIL  $label  (exit $rc, wanted $want)"
    echo "$out" | tail -6 | sed 's/^/      /'
    fail=1
  else
    echo "ok    $label"
  fi
}

run "build: blank template"        0 "$PY" build.py --out out/_smoke-template.pptx
run "lint: blank template"         0 "$PY" tools/lint_pptx.py out/_smoke-template.pptx
run "compare: matches the original" 1 "$PY" tools/compare.py out/_smoke-template.pptx
# Every job is expected to build and lint clean. presend is allowed to
# report blockers, because a job in progress legitimately has them; only a
# crash is a failure. That distinction is the whole point of this script:
# a crashing checker and a passing checker look identical through a grep.
for job in jobs/*.json; do
  name="$(basename "${job%.json}")"
  run "build: $name" 0 "$PY" build.py --data "$job" --out "out/_smoke-$name.pptx"
  run "lint: $name"  0 "$PY" tools/lint_pptx.py "out/_smoke-$name.pptx"
  # a real job may legitimately have blockers, so only a crash counts
  "$PY" tools/presend.py "$job" "out/_smoke-$name.pptx" >/dev/null 2>"$TMPDIR/err.$$"
  if grep -q Traceback "$TMPDIR/err.$$"; then
    echo "FAIL  presend: $name crashed"; tail -4 "$TMPDIR/err.$$" | sed 's/^/      /'; fail=1
  else
    echo "ok    presend: $name"
  fi
  rm -f "$TMPDIR/err.$$"
done

rm -f out/_smoke-*.pptx out/_smoke-*.pptx.manifest.json
[ "$fail" = 0 ] && echo "all good" || echo "SOMETHING IS BROKEN"
exit $fail
