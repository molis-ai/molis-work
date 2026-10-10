#!/bin/bash
# W2-05 maintenance runner (specs/repository-anti-corruption/spec.md, "真实 Home 维护五"): give the Experiments private store and any
# Alchemist search store of a Home their version 1. It runs `store-maintenance-experiments-private-v1.sql` and
# `store-maintenance-alchemist-search-v1.sql` (next to this file) and checks the result. Delete the three files, the verify script
# and `tests/store-version-maintenance.test.ts` together once the real Home has been done.
#
#   bash tests/fixtures/store-maintenance-run.sh <home>
#       REHEARSAL (the default). Changes nothing in <home>: checks that nothing holds the stores, copies each one with SQLite's backup
#       API through an immutable read (no -shm or -wal is created or touched), mirrors them under a scratch directory laid out like a
#       Home, runs the real SQL on the copies and verifies the result. KEEP=1 keeps the scratch Home (it holds the Home's data) so
#       that `node tests/fixtures/store-maintenance-verify-open.mjs <scratch home>` can open it with the built code; TMPDIR chooses
#       where the scratch directory goes.
#   bash tests/fixtures/store-maintenance-run.sh <home> --apply <backup-dir> [--maintenance-window]
#       APPLY. Full backup of <home> (an APFS clone on macOS) to <backup-dir>, which must not exist and must lie outside <home>;
#       then the SQL on the real files, then the same verification. For the real Home (~/.molis-work) --apply also needs
#       --maintenance-window (the user approved the window), and ports 4173, 4207 and 4208 must be quiet.
#
# Each SQL file is one transaction with named CHECKs as preconditions (unversioned, only the baseline table, its columns in order,
# no extra index, foreign key, CHECK, view or trigger). `sqlite3 -bail` stops at the first error and the open transaction rolls
# back. The SQL writes `PRAGMA user_version = 1` and nothing else. Undo: `sqlite3 <file> "PRAGMA user_version = 0"` (the old build
# ignores the version) or restore <backup-dir>.
set -eu
export LC_ALL=C   # the URI encoder below works on bytes

here=$(cd "$(dirname "$0")" && pwd -P)
usage="usage: store-maintenance-run.sh <home> [--apply <backup-dir> [--maintenance-window]]"
home=${1:?$usage}
mode=rehearsal; backup=""; window=no
shift 1
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) mode=apply; backup=${2:?--apply needs a backup directory}; shift 2 ;;
    --maintenance-window) window=yes; shift ;;
    *) echo "unknown argument $1 ($usage)" >&2; exit 2 ;;
  esac
done
exp_sql="$here/store-maintenance-experiments-private-v1.sql"
search_sql="$here/store-maintenance-alchemist-search-v1.sql"
[ -f "$exp_sql" ] && [ -f "$search_sql" ] || { echo "the maintenance SQL files are not next to this script ($here)" >&2; exit 2; }
for tool in sqlite3 lsof; do command -v "$tool" >/dev/null 2>&1 || { echo "$tool is needed and was not found" >&2; exit 2; }; done
[ -d "$home" ] || { echo "$home is not a directory" >&2; exit 2; }
home=$(cd "$home" && pwd -P)
real=$(cd "$HOME/.molis-work" 2>/dev/null && pwd -P || echo "")
if [ "$mode" = apply ] && [ "$home" = "$real" ] && [ "$window" != yes ]; then
  echo "$home is the real Home: --apply needs --maintenance-window (the approved maintenance window)" >&2; exit 2
fi

stores=()   # "<sql>|<file>" pairs
[ -e "$home/plugins/experiments/private.sqlite" ] && stores+=("$exp_sql|$home/plugins/experiments/private.sqlite")
for f in "$home"/alchemist/projects/*/search.sqlite; do [ -e "$f" ] && stores+=("$search_sql|$f"); done
echo "home: $home   mode: $mode   stores found: ${#stores[@]}"
for pair in "${stores[@]+"${stores[@]}"}"; do echo "  ${pair#*|}"; done
[ "${#stores[@]}" -gt 0 ] || { echo "nothing to stamp"; exit 0; }

# 1. Nothing may hold the stores or serve this Home.
for pair in "${stores[@]}"; do
  for f in "${pair#*|}" "${pair#*|}-wal" "${pair#*|}-shm"; do
    if [ -e "$f" ] && [ -n "$(lsof -t -- "$f" 2>/dev/null || true)" ]; then echo "a process holds $f: $(lsof -t -- "$f" | tr '\n' ' ')" >&2; exit 1; fi
  done
done
if [ "$home" = "$real" ]; then
  for port in 4173 4207 4208; do
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then echo "something listens on port $port: stop it first" >&2; exit 1; fi
  done
  echo "ok: no process holds the stores, ports 4173/4207/4208 are quiet"
else
  echo "ok: no process holds the stores (not the real Home: ports not checked)"
fi

# The path part of a SQLite `file:` URI: everything but unreserved characters and "/" is percent-encoded, so that a "%", "?" or
# "#" in a path (Alchemist writes a project id such as "a.b" as the directory "a%2Eb") is the character it is on disk, and every
# byte of a non-ASCII name becomes its own %XX. The byte is masked to 0-255: macOS /bin/bash 3.2 reads the byte after `'` as a signed
# char, so a byte of 0x80 or more (the UTF-8 of 家, say) would print as %FFFFFFFFFFFFFFE5 and the store could not be opened.
uri_path() {
  local s=$1 out="" c i
  for ((i = 0; i < ${#s}; i++)); do
    c=${s:i:1}
    case "$c" in [a-zA-Z0-9._~/-]) out+=$c ;; *) out+=$(printf '%%%02X' "$(( $(printf '%d' "'$c") & 255 ))") ;; esac
  done
  printf '%s' "$out"
}
# The canonical absolute form of a path that may not exist yet (its nearest existing ancestor, resolved, plus the rest).
canonical() {
  local p=$1 rest=""
  while [ ! -d "$p" ]; do rest="/$(basename "$p")$rest"; p=$(dirname "$p"); done
  printf '%s%s' "$(cd "$p" && pwd -P)" "$rest"
}
# A read that touches nothing in the Home: an immutable open creates no -shm or -wal and removes none.
read_only() { sqlite3 "file:$(uri_path "$1")?immutable=1" "$2"; }
digest() { if command -v shasum >/dev/null 2>&1; then shasum -a 256; else sha256sum; fi | cut -d' ' -f1; }
fingerprint() { sqlite3 "$1" ".dump" | grep -v '^PRAGMA\|^BEGIN\|^COMMIT' | digest; }
verify() {   # <file> <fingerprint before>
  local uv ok fp
  uv=$(sqlite3 "$1" "PRAGMA user_version"); ok=$(sqlite3 "$1" "PRAGMA integrity_check"); fp=$(fingerprint "$1")
  [ "$uv" = 1 ] && [ "$ok" = ok ] && [ "$fp" = "$2" ] || { echo "VERIFY FAILED $1: user_version=$uv integrity=$ok content-unchanged=$([ "$fp" = "$2" ] && echo yes || echo NO)" >&2; return 1; }
  echo "verified $1: user_version=1, integrity_check ok, schema and rows unchanged (dump ${2:0:12})"
}

# 2. The reads before the stamp are immutable ones, which ignore a -wal file: a non-empty one (committed rows a dead process never
#    folded in) would make them miss what is in it, so that is a stop for the user to decide.
for pair in "${stores[@]}"; do
  if [ -s "${pair#*|}-wal" ]; then echo "${pair#*|}-wal is not empty: a process died with committed rows in it. Stop: opening the store folds them in, which is a write to the Home that this runner does not do on its own." >&2; exit 1; fi
done

if [ "$mode" = rehearsal ]; then
  scratch=$(mktemp -d "${TMPDIR:-/tmp}/molis-stamp-rehearsal.XXXXXX")
  [ -n "${KEEP:-}" ] || trap 'rm -rf "$scratch"' EXIT        # the copies hold the Home's data: removed unless KEEP=1
  chmod 700 "$scratch"
  for pair in "${stores[@]}"; do
    sql=${pair%%|*}; file=${pair#*|}; rel=${file#"$home"/}; copy="$scratch/$rel"
    mkdir -p "$(dirname "$copy")"
    read_only "$file" ".backup \"$copy\""                       # read-only on the Home: immutable open, no -shm or -wal touched
    [ -s "$copy" ] || { echo "the copy of $file is empty" >&2; exit 1; }
    before=$(fingerprint "$copy")
    [ "$(sqlite3 "$copy" 'PRAGMA user_version')" = 0 ] || { echo "$file is not at version 0 (already stamped?)" >&2; exit 1; }
    sqlite3 -bail "$copy" < "$sql"
    verify "$copy" "$before"
  done
  echo "REHEARSAL OK on copies; nothing in $home was changed"
  if [ -n "${KEEP:-}" ]; then echo "scratch home kept: $scratch"; else echo "(copies removed; KEEP=1 keeps them)"; fi
  exit 0
fi

# APPLY. Stores already at version 1 are left alone; any other version is a stop. Nothing to do means no backup either.
todo=()
for pair in "${stores[@]}"; do
  v=$(read_only "${pair#*|}" 'PRAGMA user_version')
  if [ "$v" = 1 ]; then echo "already version 1: ${pair#*|}"; elif [ "$v" = 0 ]; then todo+=("$pair"); else echo "${pair#*|} is at version $v: stop, this is not the store the maintenance is for" >&2; exit 1; fi
done
[ "${#todo[@]}" -gt 0 ] || { echo "every store already has its version; nothing to do"; exit 0; }
stores=("${todo[@]}")
backup=$(canonical "$backup")
[ ! -e "$backup" ] || { echo "$backup already exists" >&2; exit 2; }
case "$backup" in "$home"/*) echo "the backup must be outside the Home" >&2; exit 2 ;; esac
mkdir -p "$(dirname "$backup")"
if [ "$(uname)" = Darwin ]; then cp -c -R "$home" "$backup"; else cp -R "$home" "$backup"; fi   # APFS clone of the whole Home on macOS
for pair in "${stores[@]}"; do
  rel=${pair#*|}; rel=${rel#"$home"/}
  cmp "$home/$rel" "$backup/$rel" || { echo "backup differs from the original at $rel" >&2; exit 1; }
done
echo "backup: $backup (the stores are byte-identical to the originals)"
for pair in "${stores[@]}"; do
  sql=${pair%%|*}; file=${pair#*|}
  before=$(fingerprint "$file")
  [ "$(sqlite3 "$file" 'PRAGMA user_version')" = 0 ] || { echo "$file is not at version 0 (already stamped?)" >&2; exit 1; }
  sqlite3 -bail "$file" < "$sql"
  verify "$file" "$before"
done
echo "STAMPED. Next: start the new build and open Experiments once; keep $backup until the user accepts."
