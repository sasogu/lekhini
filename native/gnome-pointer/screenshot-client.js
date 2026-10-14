import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// Subscribe before calling: a fast portal may respond before Screenshot returns.
const connection = Gio.DBus.session;
const loop = new GLib.MainLoop(null, false);
const token = 'lekhini_' + GLib.uuid_string_random().replaceAll('-', '_');
const sender = connection.get_unique_name().slice(1).replaceAll('.', '_');
const request = `/org/freedesktop/portal/desktop/request/${sender}/${token}`;
let finished = false;
function finish(result) {
    if (finished) return;
    finished = true;
    print(JSON.stringify(result));
    loop.quit();
}
const signal = connection.signal_subscribe('org.freedesktop.portal.Desktop',
    'org.freedesktop.portal.Request', 'Response', request, null,
    Gio.DBusSignalFlags.NONE, (_connection, _sender, _path, _iface, _signal, parameters) => {
        const [response, results] = parameters.deep_unpack();
        const uri = results.uri?.deep_unpack();
        finish(response === 0 && typeof uri === 'string'
            ? {uri} : {cancelled: response === 1, failed: response !== 1});
    });
const timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 120000, () => {
    connection.call('org.freedesktop.portal.Desktop', request,
        'org.freedesktop.portal.Request', 'Close', null, null,
        Gio.DBusCallFlags.NONE, 2000, null, null);
    finish({failed: true});
    return GLib.SOURCE_REMOVE;
});
connection.call('org.freedesktop.portal.Desktop', '/org/freedesktop/portal/desktop',
    'org.freedesktop.portal.Screenshot', 'Screenshot',
    new GLib.Variant('(sa{sv})', ['', {
        handle_token: new GLib.Variant('s', token),
        interactive: new GLib.Variant('b', false),
        modal: new GLib.Variant('b', true),
    }]), null, Gio.DBusCallFlags.NONE, 10000, null, (bus, result) => {
        try { bus.call_finish(result); } catch { finish({failed: true}); }
    });
loop.run();
if (!finished) finish({failed: true});
GLib.source_remove(timeout);
connection.signal_unsubscribe(signal);
