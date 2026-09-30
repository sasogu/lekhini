#!/usr/bin/env bash
set -euo pipefail

module_dir="native/macos-click-observer"
target_version="32.1.2"
electron_headers="https://electronjs.org/headers"

if [[ "$(uname -s)" == "Darwin" ]]; then
  node-gyp rebuild --directory "$module_dir" --target="$target_version" --dist-url="$electron_headers" --arch=arm64
  cp "$module_dir/build/Release/click_observer.node" /tmp/lekhini-click-observer-arm64.node
  node-gyp rebuild --directory "$module_dir" --target="$target_version" --dist-url="$electron_headers" --arch=x64
  lipo -create /tmp/lekhini-click-observer-arm64.node "$module_dir/build/Release/click_observer.node" \
    -output "$module_dir/build/Release/click_observer.node"
  rm /tmp/lekhini-click-observer-arm64.node
else
  node-gyp rebuild --directory "$module_dir" --target="$target_version" --dist-url="$electron_headers"
fi
