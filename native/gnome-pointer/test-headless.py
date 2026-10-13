"""Run with dbus-run-session -- python3 native/gnome-pointer/test-headless.py.

Uses an isolated GNOME compositor, settings and runtime directory. Synthetic
button injection exists only in its temporary extension copy, never in the
installed extension or the user's desktop.
"""
import json
import os
from pathlib import Path
import select
import shutil
import subprocess
import tempfile
import time

source = Path(__file__).resolve().parent
with tempfile.TemporaryDirectory(prefix="lekhini-click-test-") as directory:
    root = Path(directory)
    runtime = root / "runtime"
    runtime.mkdir(mode=0o700)
    data = root / "data"
    extension = data / "gnome-shell/extensions/lekhini-pointer@edutictac.es"
    shutil.copytree(source / "extension", extension)
    code = (extension / "extension.js").read_text()
    code = code.replace("import Gio from 'gi://Gio';", "import Gio from 'gi://Gio';\nimport GLib from 'gi://GLib';\nlet testDevice;")
    code = code.replace("</interface></node>", '<method name="TestButton"><arg type="u" direction="in"/><arg type="b" direction="in"/></method></interface></node>')
    code = code.replace("            GetState() {", """            TestButton(button, pressed) {
                testDevice ??= Clutter.get_default_backend().get_default_seat()
                    .create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
                testDevice.notify_button(GLib.get_monotonic_time(), button,
                    pressed ? Clutter.ButtonState.PRESSED : Clutter.ButtonState.RELEASED);
            },
            GetState() {""")
    (extension / "extension.js").write_text(code)
    env = {**os.environ, "XDG_RUNTIME_DIR": str(runtime), "XDG_DATA_HOME": str(data),
           "GSETTINGS_BACKEND": "memory", "LIBGL_ALWAYS_SOFTWARE": "1"}

    def call(method, *args, object_path="/es/edutictac/Lekhini/Pointer"):
        return subprocess.run(["gdbus", "call", "--session", "--dest", "org.gnome.Shell",
                               "--object-path", object_path, "--method", method, *args],
                              env=env, capture_output=True, text=True, timeout=3)

    with (root / "shell.log").open("w+") as log:
        shell = subprocess.Popen(["gnome-shell", "--headless", "--wayland", "--no-x11",
                                  "--virtual-monitor=1920x1080", "--wayland-display=lekhini-test"],
                                 env=env, stdout=log, stderr=log)
        helper = None
        try:
            for _ in range(40):
                call("org.gnome.Shell.Extensions.EnableExtension", "lekhini-pointer@edutictac.es",
                     object_path="/org/gnome/Shell")
                state = call("es.edutictac.Lekhini.Pointer.GetState")
                if state.returncode == 0:
                    break
                assert shell.poll() is None, "Test compositor exited"
                time.sleep(.25)
            assert state.returncode == 0, state.stderr
            print("Native GNOME state:", state.stdout.strip(), flush=True)
            helper = subprocess.Popen(["gjs", "-m", str(source / "client.js"), "--buttons"],
                                      env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            assert select.select([helper.stdout], [], [], 5)[0], "No first position"
            assert json.loads(helper.stdout.readline())["type"] == "position"
            for button in (1, 2, 3):
                result = call("es.edutictac.Lekhini.Pointer.TestButton", str(button), "true")
                assert result.returncode == 0, result.stderr
                time.sleep(.1)
                result = call("es.edutictac.Lekhini.Pointer.TestButton", str(button), "false")
                assert result.returncode == 0, result.stderr
                time.sleep(.05)
            result = call("org.gnome.Shell.Extensions.DisableExtension", "lekhini-pointer@edutictac.es",
                          object_path="/org/gnome/Shell")
            assert result.returncode == 0, result.stderr
            remaining, stderr = helper.communicate(timeout=5)
            events = [json.loads(line) for line in remaining.splitlines()]
            buttons = [event["button"] for event in events if event["type"] == "click"]
            assert buttons == ["left", "middle", "right"], (buttons, stderr)
            print("Native presses → GJS stream: left, middle, right, no duplicates: PASS", flush=True)
            assert helper.returncode != 0
            assert call("es.edutictac.Lekhini.Pointer.GetState").returncode != 0
            print("Disabling removes the bridge and stops the helper: PASS", flush=True)
        except Exception as error:
            print("Test failed:", repr(error), flush=True)
            log.flush()
            log.seek(0)
            print("\n".join(line for line in log.read().splitlines()
                            if "lekhini" in line.lower() or "JS ERROR" in line), flush=True)
            raise
        finally:
            if helper and helper.poll() is None:
                helper.terminate()
                helper.wait(timeout=5)
            shell.terminate()
            try:
                shell.wait(timeout=5)
            except subprocess.TimeoutExpired:
                shell.kill()
                shell.wait()
