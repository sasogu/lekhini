#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$ROOT_DIR/native/macos-magnifier/MagnifierCapture.swift"
OUTPUT_DIR="$ROOT_DIR/native/macos-magnifier/build"
OUTPUT="$OUTPUT_DIR/magnifier-capture"

mkdir -p "$OUTPUT_DIR"

if [[ "$(uname -s)" != "Darwin" ]]; then
  cp "$ROOT_DIR/native/macos-magnifier/stub.sh" "$OUTPUT"
  chmod 755 "$OUTPUT"
  exit 0
fi

ARM64="$OUTPUT_DIR/magnifier-capture-arm64"
X64="$OUTPUT_DIR/magnifier-capture-x64"
COMMON=(
  -O
  -parse-as-library
  -framework ScreenCaptureKit
  -framework CoreMedia
  -framework CoreVideo
)

xcrun swiftc "${COMMON[@]}" -target arm64-apple-macos12.3 "$SOURCE" -o "$ARM64"
xcrun swiftc "${COMMON[@]}" -target x86_64-apple-macos12.3 "$SOURCE" -o "$X64"
lipo -create "$ARM64" "$X64" -output "$OUTPUT"
chmod 755 "$OUTPUT"
rm -f "$ARM64" "$X64"

