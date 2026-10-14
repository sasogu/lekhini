#!/usr/bin/env bash
set -euo pipefail
mkdir -p native/linux-shortcuts/build
if [[ "$(uname -s)" != Linux ]]; then exit 0; fi
"${CXX:-g++}" -std=c++17 -O2 -Wall -Wextra -Werror \
  native/linux-shortcuts/shortcut-observer.cpp -l:libsystemd.so.0 -o native/linux-shortcuts/build/shortcut-observer
