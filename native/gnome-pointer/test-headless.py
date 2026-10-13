"""Run with dbus-run-session -- python3 native/gnome-pointer/test-headless.py.

Uses an isolated GNOME compositor, settings and runtime directory. Synthetic
button injection exists only in its temporary extension copy, never in the
installed extension or the user's desktop.
"""
import json
import argparse
import os
from pathlib import Path
import select
import shutil
import subprocess
import tempfile
import time

source = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--app', action='store_true', help='Also verify Spotlight and Teacher Mode in Electron')
args = parser.parse_args()
with tempfile.TemporaryDirectory(prefix="lekhini-click-test-") as directory:
    root = Path(directory)
    runtime = root / "runtime"
    runtime.mkdir(mode=0o700)
    data = root / "data"
    extension = data / "gnome-shell/extensions/lekhini-pointer@edutictac.es"
    shutil.copytree(source / "extension", extension)
    code = (extension / "extension.js").read_text()
    code = code.replace("import Gio from 'gi://Gio';", "import Gio from 'gi://Gio';\nlet testDevice;")
    code = code.replace("</interface></node>", '''
      <method name="TestButton"><arg type="u" direction="in"/><arg type="b" direction="in"/></method>
      <method name="TestMove"><arg type="i" direction="in"/><arg type="i" direction="in"/></method>
      <method name="TestMagnifierView"><arg type="b" direction="out"/><arg type="d" direction="out"/></method>
    </interface></node>''')
    code = code.replace("            GetState() {", """            TestButton(button, pressed) {
                testDevice ??= Clutter.get_default_backend().get_default_seat()
                    .create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
                testDevice.notify_button(GLib.get_monotonic_time(), button,
                    pressed ? Clutter.ButtonState.PRESSED : Clutter.ButtonState.RELEASED);
            },
            TestMove(x, y) {
                testDevice ??= Clutter.get_default_backend().get_default_seat()
                    .create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
                testDevice.notify_absolute_motion(GLib.get_monotonic_time(), x, y);
            },
            TestMagnifierView() {
                return [Main.magnifier.isActive(), Main.magnifier.getZoomRegions()[0].getMagFactor()[0]];
            },
            GetState() {""")
    (extension / "extension.js").write_text(code)
    env = {**os.environ, "XDG_RUNTIME_DIR": str(runtime), "XDG_DATA_HOME": str(data),
           "XDG_CONFIG_HOME": str(root / 'config'), "XDG_CACHE_HOME": str(root / 'cache'),
           "XDG_SESSION_TYPE": "wayland", "WAYLAND_DISPLAY": "lekhini-test",
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
        zoom_helper = None
        application = None
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
            original_zoom = call("es.edutictac.Lekhini.Pointer.GetMagnifierStatus").stdout.strip()
            zoom_helper = subprocess.Popen(["gjs", "-m", str(source / "magnifier-client.js")],
                                           env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                           stderr=subprocess.PIPE, text=True)

            def zoom_to(enabled, zoom):
                zoom_helper.stdin.write(json.dumps({"enabled": enabled, "zoom": zoom}) + "\n")
                zoom_helper.stdin.flush()
                assert select.select([zoom_helper.stdout], [], [], 5)[0], "No zoom acknowledgement"
                reply = zoom_helper.stdout.readline().strip()
                assert reply == "applied", (reply, zoom_helper.poll())

            zoom_to(True, 2)
            assert call("es.edutictac.Lekhini.Pointer.GetMagnifierStatus").stdout.strip() == "(true, 2.0)"
            for _ in range(20):
                view = call("es.edutictac.Lekhini.Pointer.TestMagnifierView").stdout.strip()
                if view == "(true, 2.0)": break
                time.sleep(.1)
            assert view == "(true, 2.0)", view
            zoom_to(True, 4)
            assert call("es.edutictac.Lekhini.Pointer.GetMagnifierStatus").stdout.strip() == "(true, 4.0)"
            # A one-shot second sender must not steal the active client lease.
            assert call("es.edutictac.Lekhini.Pointer.SetMagnifier", "true", "3.0").returncode != 0
            zoom_helper.stdin.close()
            zoom_helper.wait(timeout=5)
            for _ in range(20):
                if call("es.edutictac.Lekhini.Pointer.GetMagnifierStatus").stdout.strip() == original_zoom:
                    break
                time.sleep(.1)
            assert call("es.edutictac.Lekhini.Pointer.GetMagnifierStatus").stdout.strip() == original_zoom
            print("Native zoom 2x/4x, exclusive lease and restoration after stdin EOF: PASS", flush=True)

            # Loss of the D-Bus sender also restores zoom after a client crash.
            zoom_helper = subprocess.Popen(["gjs", "-m", str(source / "magnifier-client.js")],
                                           env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                           stderr=subprocess.PIPE, text=True)
            zoom_to(True, 3)
            zoom_helper.kill()
            zoom_helper.wait(timeout=5)
            for _ in range(20):
                if call("es.edutictac.Lekhini.Pointer.GetMagnifierStatus").stdout.strip() == original_zoom:
                    break
                time.sleep(.1)
            assert call("es.edutictac.Lekhini.Pointer.GetMagnifierStatus").stdout.strip() == original_zoom
            print("Client crash restores native zoom: PASS", flush=True)
            if args.app:
                project = source.parents[1]
                application = subprocess.Popen([
                    str(project / 'node_modules/electron/dist/electron'), str(project),
                    '--ozone-platform=wayland', '--remote-debugging-address=127.0.0.1',
                    '--remote-debugging-port=19327',
                ], env=env, stdout=log, stderr=log)
                test = subprocess.run(['node', str(source / 'test-spotlight.mjs')],
                                      env=env, capture_output=True, text=True, timeout=30)
                print(test.stdout, end='', flush=True)
                assert test.returncode == 0, test.stderr
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
            if application and application.poll() is None:
                application.terminate()
                application.wait(timeout=5)
            if zoom_helper and zoom_helper.poll() is None:
                zoom_helper.terminate()
                zoom_helper.wait(timeout=5)
            if helper and helper.poll() is None:
                helper.terminate()
                helper.wait(timeout=5)
            shell.terminate()
            try:
                shell.wait(timeout=5)
            except subprocess.TimeoutExpired:
                shell.kill()
                shell.wait()
