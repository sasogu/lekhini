import Gio from 'gi://Gio';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Movement stays inside the compositor: no timer, D-Bus position messages,
// Electron IPC, interpolation or animation on the native highlight path.
export class CursorHighlight {
    constructor(stopped) {
        this.owner = null;
        this.actor = null;
        this._stopped = stopped;
    }

    update(sender, enabled, color, size, opacity, shape) {
        if (this.owner && this.owner !== sender)
            throw new Error('Cursor highlight is already in use');
        if (!enabled) { this.stop(); return; }
        if (!/^#[\da-f]{6}$/i.test(color) || !Number.isFinite(size) || size < 16 || size > 120 ||
            !Number.isFinite(opacity) || opacity < 0.1 || opacity > 1 || !['ring', 'dot'].includes(shape))
            throw new Error('Invalid cursor highlight settings');
        if (Main.sessionMode.isLocked || Main.sessionMode.isGreeter)
            throw new Error('Desktop is locked');
        if (!this.actor) {
            this._tracker = global.backend.get_cursor_tracker();
            this.actor = new St.Widget({name: 'lekhini-native-cursor', reactive: false, can_focus: false});
            Main.layoutManager.addTopChrome(this.actor, {trackFullscreen: true});
            this._motion = this._tracker.connect('position-invalidated', () => this.position());
            this._visibility = this._tracker.connect('visibility-changed', () => this.position());
            this.owner = sender;
            this._watch = Gio.bus_watch_name_on_connection(Gio.DBus.session, sender,
                Gio.BusNameWatcherFlags.NONE, null, () => this.stop());
        }
        this.actor.set_size(size, size);
        this.actor.opacity = Math.round(opacity * 255);
        this.actor.set_style(`border-radius: ${size / 2}px; ${shape === 'dot'
            ? `background-color: ${color}; border-width: 0;`
            : `background-color: transparent; border: 3px solid ${color};`}`);
        this.position();
    }

    position() {
        if (!this.actor) return;
        if (Main.sessionMode.isLocked || Main.sessionMode.isGreeter || !this._tracker.get_pointer_visible()) {
            this.actor.hide();
            return;
        }
        const [x, y] = global.get_pointer();
        this.actor.set_position(x - this.actor.width / 2, y - this.actor.height / 2);
        this.actor.show();
    }

    stop() {
        if (this._watch) Gio.bus_unwatch_name(this._watch);
        this._watch = 0;
        if (this.actor) {
            this._tracker.disconnect(this._motion);
            this._tracker.disconnect(this._visibility);
            this.actor.destroy();
        }
        this.actor = null;
        this._tracker = null;
        const hadOwner = !!this.owner;
        this.owner = null;
        if (hadOwner) this._stopped();
    }
}
