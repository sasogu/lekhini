"""Run under dbus-run-session: protocol tests without capturing any desktop."""
from pathlib import Path
import json, subprocess
import gi
gi.require_version('Gio', '2.0')
from gi.repository import Gio, GLib
bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
bus.call_sync('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'RequestName', GLib.Variant('(su)', ('org.freedesktop.portal.Desktop', 0)), None, 0, -1, None)
xml = '''<node><interface name="org.freedesktop.portal.Screenshot"><method name="Screenshot"><arg type="s" direction="in"/><arg type="a{sv}" direction="in"/><arg type="o" direction="out"/></method></interface></node>'''
response_code = 0

def requested(connection, sender, object_path, interface, method, params, invocation):
    parent, options = params.unpack()
    assert options['interactive'] is False
    token = options['handle_token']
    request = '/org/freedesktop/portal/desktop/request/' + sender[1:].replace('.', '_') + '/' + token
    # Exercise the fast-response race: emit before returning the handle.
    results = {'uri': GLib.Variant('s', 'file:///tmp/lekhini-test-only.png')} if response_code == 0 else {}
    connection.emit_signal(sender, request, 'org.freedesktop.portal.Request', 'Response', GLib.Variant('(ua{sv})', (response_code, results)))
    invocation.return_value(GLib.Variant('(o)', (request,)))

bus.register_object('/org/freedesktop/portal/desktop', Gio.DBusNodeInfo.new_for_xml(xml).interfaces[0], requested, None, None)
helper = Path(__file__).resolve().parents[1] / 'native/gnome-pointer/screenshot-client.js'
for response_code in [0, 1, 2]:
    child = subprocess.Popen(['gjs', '-m', str(helper)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    context = GLib.MainContext.default()
    while child.poll() is None:
        while context.pending(): context.iteration(False)
        GLib.usleep(1000)
    output, errors = child.communicate(timeout=5)
    assert child.returncode == 0, errors
    result = json.loads(output)
    if response_code == 0: assert result == {'uri': 'file:///tmp/lekhini-test-only.png'}
    else: assert result == {'cancelled': response_code == 1, 'failed': response_code != 1}
print('Screenshot portal: fast response, success, cancellation and failure PASS')
