#!/usr/bin/env bash
set -euo pipefail
native_dir="$(cd "$(dirname "$0")" && pwd)"
if [[ "$(uname -s)" != Darwin ]]; then
  echo 'Jelly 音视频转写仅支持 macOS。' >&2
  exit 1
fi
swift build -c release --package-path "$native_dir/whisper" --product jelly-whisper
mkdir -p "$native_dir/bin"
# Replace the destination entry atomically: a worktree may contain a symlink to another checkout.
helper_install="$(mktemp "$native_dir/bin/.jelly-whisper.XXXXXX")"
trap 'rm -f "$helper_install"' EXIT
cp -p "$native_dir/whisper/.build/release/jelly-whisper" "$helper_install"
mv -f "$helper_install" "$native_dir/bin/jelly-whisper"
