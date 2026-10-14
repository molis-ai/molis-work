#!/bin/zsh
# Verify one Prologue commit the way the merge rule asks: build dist first, typecheck, SDK full suite
# (two workers, niced), then a clean `git archive` → pack → consumer that only uses the public entry.
#   prologue-verify.sh <worktree> <label> [prev-tgz]
# prev-tgz: a package built from the previous slice; every consumer script is re-run against it and
# the ones that fail are listed (a new script should fail on the old package).
set -u
W=$1; LABEL=$2; PREV=${3:-}
OUT=${PROLOGUE_VERIFY_OUT:-${TMPDIR:-/tmp}/prologue-verify}/$LABEL
rm -rf $OUT; mkdir -p $OUT
cd $W || exit 2
SHA=$(git rev-parse HEAD)
echo "commit $SHA" > $OUT/summary.txt
step() { echo "[$(date +%H:%M:%S)] $1" | tee -a $OUT/summary.txt; }

step "build dist"
pnpm --filter @prologue/sdk run build > $OUT/build.log 2>&1 || { step "BUILD FAILED"; exit 1; }
step "typecheck"
node_modules/.bin/tsc -p tsconfig.typecheck.json --noEmit > $OUT/typecheck.log 2>&1 && step "typecheck ok" || step "TYPECHECK FAILED (see typecheck.log)"

step "full suite (maxWorkers=2, nice; NOT RUN: desktop-computer-use.live drives the real macOS desktop)"
nice -n 10 pnpm exec vitest run --maxWorkers=2 --exclude "packages/sdk/test/desktop-computer-use.live.test.ts" --reporter=default --reporter=json --outputFile.json=$OUT/vitest.json > $OUT/vitest.log 2>&1
step "full suite exit $?"
node -e '
const r = require(process.argv[1]);
const failed = r.testResults.filter(f => f.status !== "passed" && f.assertionResults.some(a => a.status === "failed") || (f.status === "failed" && f.assertionResults.length === 0));
console.log(`files ${r.testResults.length} · tests passed ${r.numPassedTests} failed ${r.numFailedTests} skipped ${r.numPendingTests + r.numTodoTests} · failed files ${failed.length}`);
for (const f of failed) console.log("FAILED", f.name.replace(process.cwd() + "/", ""), (f.message || "").split("\n")[0].slice(0, 200));
' $OUT/vitest.json | tee -a $OUT/summary.txt

step "clean archive → pack"
A=$OUT/archive; P=$OUT/pack; C=$OUT/consumer
mkdir -p $A $P $C
git archive HEAD | tar -x -C $A
(cd $A && pnpm install --frozen-lockfile --offline > $OUT/archive-install.log 2>&1 && pnpm --filter @prologue/sdk run build > $OUT/archive-build.log 2>&1 && cd packages/sdk && pnpm pack --pack-destination $P > $OUT/pack.log 2>&1) || { step "ARCHIVE/PACK FAILED"; exit 1; }
TGZ=$(ls $P/*.tgz | head -1)
step "packed $(basename $TGZ) $(stat -f %z $TGZ) bytes"
consume() {
  local dir=$1 tgz=$2
  mkdir -p $dir
  printf '{"private":true,"type":"module","dependencies":{"@prologue/sdk":"file:%s"}}\n' $tgz > $dir/package.json
  (cd $dir && pnpm install --offline --ignore-scripts > install.log 2>&1) || { echo "install failed in $dir"; return 1; }
  cp $W/packages/sdk/test/fixtures/*-consumer.mjs $dir/
  for f in $dir/*-consumer.mjs; do
    if (cd $dir && timeout 300 node $(basename $f) > $(basename $f).log 2>&1); then echo "pass $(basename $f)"; else echo "FAIL $(basename $f)"; fi
  done
}
step "consumer checks on this package"
consume $C $TGZ | tee -a $OUT/summary.txt
if [[ -n "$PREV" ]]; then
  step "consumer checks on previous package $(basename $PREV) (new scripts should fail)"
  consume $OUT/consumer-prev $PREV | tee -a $OUT/summary.txt
fi
cp $TGZ $OUT/
step "done"
