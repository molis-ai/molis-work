#!/usr/bin/env bash
set -euo pipefail
native_dir="$(cd "$(dirname "$0")" && pwd)"
if [[ "$(uname -s)" != Darwin ]]; then
  echo 'Jelly 原生素材提取仅支持 macOS。' >&2
  exit 1
fi
mkdir -p "$native_dir/bin"
swiftc -O -target "$(uname -m)-apple-macosx14.0" -parse-as-library "$native_dir/JellyMaterial.swift" -o "$native_dir/bin/jelly-material" -framework AppKit -framework PDFKit -framework Vision -framework ImageIO
