#!/usr/bin/env bash
set -euo pipefail

lekhini_script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ -d "$lekhini_script_dir/resources/gnome-pointer-extension" ]]; then
  lekhini_extension_source="$lekhini_script_dir/resources/gnome-pointer-extension"
else
  lekhini_extension_source="$lekhini_script_dir/../native/gnome-pointer/extension"
fi
lekhini_extension_source="${1:-$lekhini_extension_source}"
test -f "$lekhini_extension_source/metadata.json"
test -f "$lekhini_extension_source/zoom-lease.mjs"
test -f "$lekhini_extension_source/cursor-highlight.js"

lekhini_extension_target="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/lekhini-pointer@edutictac.es"
mkdir -p "$lekhini_extension_target"
cp -a "$lekhini_extension_source/." "$lekhini_extension_target/"

python3 - <<'PY'
import ast
import subprocess

schema = 'org.gnome.shell'
raw = subprocess.check_output(['gsettings', 'get', schema, 'enabled-extensions'], text=True).strip()
if raw.startswith('@as '):
    raw = raw[4:]
extensions = ast.literal_eval(raw)
uuid = 'lekhini-pointer@edutictac.es'
if uuid not in extensions:
    extensions.append(uuid)
    subprocess.run(['gsettings', 'set', schema, 'enabled-extensions', repr(extensions)], check=True)
print('Puente GNOME v4 instalado; extensiones existentes conservadas.')
print('Guarda el trabajo, cierra sesión y vuelve a entrar para cargar la actualización.')
PY
