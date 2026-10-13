// A single helper per active tracking session. No keyboard or screen access.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {ButtonTransitions} from './buttons.mjs';

const loop = new GLib.MainLoop(null, false);
let busy = false;
let last = '';
let failed = false;
const includeButtons = ARGV.includes('--buttons');
const buttons = new ButtonTransitions();
const timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 8, () => {
    if (busy)
        return GLib.SOURCE_CONTINUE;
    busy = true;
    Gio.DBus.session.call('org.gnome.Shell', '/es/edutictac/Lekhini/Pointer',
        'es.edutictac.Lekhini.Pointer', includeButtons ? 'GetState' : 'GetPosition', null,
        new GLib.VariantType(includeButtons ? '(biiu)' : '(bii)'), Gio.DBusCallFlags.NONE, 1000, null,
        (connection, result) => {
            busy = false;
            try {
                const [available, x, y, mask] = connection.call_finish(result).deep_unpack();
                const line = JSON.stringify({type: 'position', point: available ? {x, y} : null});
                if (line !== last) {
                    print(line);
                    last = line;
                }
                if (!available) buttons.reset();
                else if (includeButtons) {
                    for (const click of buttons.update(mask, x, y)) print(JSON.stringify(click));
                }
            } catch {
                failed = true;
                loop.quit();
            }
        });
    return GLib.SOURCE_CONTINUE;
});
loop.run();
GLib.source_remove(timer);
if (failed)
    throw new Error('Lekhini Pointer Bridge is unavailable');
