#!/usr/bin/env bash
set -euo pipefail
lekhini_installer_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ -d "$lekhini_installer_dir/resources/linux-shortcuts" ]]; then
  lekhini_source="$lekhini_installer_dir/resources/linux-shortcuts"
else
  lekhini_source="$lekhini_installer_dir/../native/linux-shortcuts"
fi
lekhini_source="${1:-$lekhini_source}"
test -x "$lekhini_source/build/shortcut-observer"
test -f "$lekhini_source/es.edutictac.lekhini.shortcuts.policy"
sudo install -d -o root -g root -m755 /opt/lekhini-shortcuts /opt/lekhini-shortcuts/bin
sudo install -Dm755 "$lekhini_source/build/shortcut-observer" /opt/lekhini-shortcuts/bin/shortcut-observer
sudo install -Dm644 "$lekhini_source/es.edutictac.lekhini.shortcuts.policy" /usr/share/polkit-1/actions/es.edutictac.lekhini.shortcuts.policy
