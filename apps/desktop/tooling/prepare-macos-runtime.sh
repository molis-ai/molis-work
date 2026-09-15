#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
RESOURCE_DIR="$REPO_ROOT/apps/desktop/src-tauri/resources/molis-work-runtime"
NODE_VERSION="${MOLIS_WORK_NODE_VERSION:-24.14.0}"
REQUESTED_ARCH="${MOLIS_WORK_MACOS_ARCH:-$(uname -m)}"

case "$REQUESTED_ARCH" in
  arm64|aarch64) NODE_ARCH="arm64" ;;
  x64|x86_64|amd64) NODE_ARCH="x64" ;;
  *) echo "Unsupported macOS architecture: $REQUESTED_ARCH" >&2; exit 1 ;;
esac

case "$(uname -m)" in
  arm64) HOST_ARCH="arm64" ;;
  x86_64) HOST_ARCH="x64" ;;
  *) echo "Unsupported build host architecture: $(uname -m)" >&2; exit 1 ;;
esac

if [[ "$NODE_ARCH" != "$HOST_ARCH" ]]; then
  echo "Runtime payload must be prepared on the target architecture ($NODE_ARCH requested, $HOST_ARCH host)." >&2
  exit 1
fi

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/molis-work-macos-runtime.XXXXXX")"
cleanup() { rm -rf "$TEMP_DIR"; }
trap cleanup EXIT INT TERM

ARCHIVE="node-v${NODE_VERSION}-darwin-${NODE_ARCH}.tar.gz"
BASE_URL="https://nodejs.org/dist/v${NODE_VERSION}"
curl --fail --silent --show-error --location "$BASE_URL/SHASUMS256.txt" --output "$TEMP_DIR/SHASUMS256.txt"
curl --fail --silent --show-error --location "$BASE_URL/$ARCHIVE" --output "$TEMP_DIR/$ARCHIVE"
grep "  $ARCHIVE\$" "$TEMP_DIR/SHASUMS256.txt" > "$TEMP_DIR/checksum.txt"
(cd "$TEMP_DIR" && shasum -a 256 -c checksum.txt)
tar -xzf "$TEMP_DIR/$ARCHIVE" -C "$TEMP_DIR"
NODE_HOME="$TEMP_DIR/node-v${NODE_VERSION}-darwin-${NODE_ARCH}"

node "$SCRIPT_DIR/prepare-runtime-payload.mjs" "$REPO_ROOT" "$RESOURCE_DIR" "$NODE_HOME/bin/node"

echo "Prepared Molis Work macOS runtime: $RESOURCE_DIR ($NODE_ARCH, Node v$NODE_VERSION)"
