#!/usr/bin/env bash
set -eu

source_checkout=$1
expected_head=$2
shift 2

first=
if [ ! -d repo ]; then
  git clone -q --no-local -- "$source_checkout" repo
  first=1
fi
cd repo
git fetch -q --force -- "$source_checkout" "$expected_head"
git checkout -q --detach --force "$expected_head"

verify_head() {
  local actual_head
  actual_head=$(git rev-parse --verify HEAD)
  if [ "$actual_head" != "$expected_head" ]; then
    printf 'linux-repro: cannot %s: expected HEAD %s, found %s\n' "$1" "$expected_head" "$actual_head" >&2
    exit 1
  fi
  printf 'linux-repro: %s HEAD %s\n' "$1" "$actual_head"
}

if [ -n "$first" ] || [ -n "${REBUILD:-}" ]; then
  verify_head build
  mkdir -p "$HOME/.npm-global"
  npm config set prefix "$HOME/.npm-global" >/dev/null
  npm install --global "$(node -p 'require("./package.json").packageManager')" >/dev/null
  export npm_config_nodedir=/usr/local
  pnpm install --frozen-lockfile >/dev/null
  pnpm build >/dev/null
fi
verify_head test
exec node scripts/run-tests.mjs --jobs 1 "$@"
