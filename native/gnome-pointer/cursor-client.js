import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// stdin is also the lifetime of the app connection: EOF closes the D-Bus
// sender, letting GNOME remove the highlight even if Electron exits abruptly.
const loop = new GLib.MainLoop(null, false);
const input = new Gio.DataInputStream({
    base_stream: new Gio.UnixInputStream({fd: 0, close_fd: false}),
});
let pending = null;
let busy = false;
let closed = false;
const signal = Gio.DBus.session.signal_subscribe('org.gnome.Shell',
    'es.edutictac.Lekhini.Pointer', 'CursorHighlightStopped',
    '/es/edutictac/Lekhini/Pointer', null, Gio.DBusSignalFlags.NONE, () => {
        print('stopped');
        loop.quit();
    });

function applyNext() {
    if (busy) return;
    if (!pending) {
        if (closed) loop.quit();
        return;
    }
    const settings = pending;
    pending = null;
    busy = true;
    Gio.DBus.session.call('org.gnome.Shell', '/es/edutictac/Lekhini/Pointer',
        'es.edutictac.Lekhini.Pointer', 'SetCursorHighlight',
        new GLib.Variant('(bsdds)', [settings.enabled, settings.color, settings.size, settings.opacity, settings.shape]), null,
        Gio.DBusCallFlags.NONE, 2000, null, (connection, result) => {
            busy = false;
            try {
                connection.call_finish(result);
                print('applied');
                applyNext();
            } catch {
                print('stopped');
                loop.quit();
            }
        });
}

function readNext() {
    input.read_line_async(GLib.PRIORITY_DEFAULT, null, (stream, result) => {
        try {
            const [line] = stream.read_line_finish_utf8(result);
            if (line === null) {
                closed = true;
                applyNext();
                return;
            }
            const settings = JSON.parse(line);
            if (typeof settings.enabled !== 'boolean' || !/^#[\da-f]{6}$/i.test(settings.color) ||
                !Number.isFinite(settings.size) || settings.size < 16 || settings.size > 120 ||
                !Number.isFinite(settings.opacity) || settings.opacity < 0.1 || settings.opacity > 1 ||
                !['ring', 'dot'].includes(settings.shape))
                throw new Error('Invalid cursor settings');
            pending = settings;
            applyNext();
            readNext();
        } catch {
            print('stopped');
            loop.quit();
        }
    });
}
readNext();
loop.run();
Gio.DBus.session.signal_unsubscribe(signal);
