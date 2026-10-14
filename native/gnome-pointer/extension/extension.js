import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {ZoomLease} from './zoom-lease.mjs';
import {CursorHighlight} from './cursor-highlight.js';

const XML = `<node><interface name="es.edutictac.Lekhini.Pointer">
  <method name="GetPosition">
    <arg name="available" type="b" direction="out"/>
    <arg name="x" type="i" direction="out"/>
    <arg name="y" type="i" direction="out"/>
  </method>
  <method name="GetState">
    <arg name="available" type="b" direction="out"/>
    <arg name="x" type="i" direction="out"/>
    <arg name="y" type="i" direction="out"/>
    <arg name="buttons" type="u" direction="out"/>
  </method>
  <method name="GetMagnifierStatus">
    <arg name="active" type="b" direction="out"/>
    <arg name="zoom" type="d" direction="out"/>
  </method>
  <method name="SetMagnifier">
    <arg name="enabled" type="b" direction="in"/>
    <arg name="zoom" type="d" direction="in"/>
  </method>
  <signal name="MagnifierStopped"/>
  <method name="GetCursorHighlightStatus"><arg name="active" type="b" direction="out"/></method>
  <method name="SetCursorHighlight">
    <arg name="enabled" type="b" direction="in"/>
    <arg name="color" type="s" direction="in"/>
    <arg name="size" type="d" direction="in"/>
    <arg name="opacity" type="d" direction="in"/>
    <arg name="shape" type="s" direction="in"/>
  </method>
  <signal name="CursorHighlightStopped"/>
</interface></node>`;

export default class LekhiniPointer extends Extension {
    enable() {
        const applications = new Gio.Settings({schema_id: 'org.gnome.desktop.a11y.applications'});
        const magnifier = new Gio.Settings({schema_id: 'org.gnome.desktop.a11y.magnifier'});
        this._zoom = new ZoomLease({
            get enabled() { return applications.get_boolean('screen-magnifier-enabled'); },
            set enabled(value) { applications.set_boolean('screen-magnifier-enabled', value); },
            get zoom() { return magnifier.get_double('mag-factor'); },
            set zoom(value) { magnifier.set_double('mag-factor', value); },
        });
        const extension = this;
        this._highlight = new CursorHighlight(() => this._service?.emit_signal('CursorHighlightStopped', null));
        this._service = Gio.DBusExportedObject.wrapJSObject(XML, {
            GetCursorHighlightStatus() { return !!extension._highlight.owner; },
            SetCursorHighlightAsync(settings, invocation) {
                try {
                    extension._highlight.update(invocation.get_sender(), ...settings);
                    invocation.return_value(new GLib.Variant('()', []));
                } catch (error) {
                    if (!extension._highlight.owner || extension._highlight.owner === invocation.get_sender())
                        extension._highlight.stop();
                    invocation.return_dbus_error('es.edutictac.Lekhini.Error.Cursor', error.message);
                }
            },
            GetMagnifierStatus() {
                return [extension._zoom.settings.enabled, extension._zoom.settings.zoom];
            },
            SetMagnifierAsync([enabled, zoom], invocation) {
                const sender = invocation.get_sender();
                try {
                    if (enabled && (Main.sessionMode.isLocked || Main.sessionMode.isGreeter))
                        throw new Error('Desktop is locked');
                    extension._zoom.update(sender, enabled, zoom);
                    if (enabled && !extension._ownerWatch) {
                        extension._ownerWatch = Gio.bus_watch_name_on_connection(
                            Gio.DBus.session, sender, Gio.BusNameWatcherFlags.NONE,
                            null, () => {
                                if (extension._zoom?.owner === sender) extension._stopMagnifier();
                            });
                    } else if (!enabled) {
                        extension._stopMagnifier();
                    }
                    invocation.return_value(new GLib.Variant('()', []));
                } catch (error) {
                    invocation.return_dbus_error('es.edutictac.Lekhini.Error.Magnifier', error.message);
                }
            },
            GetPosition() {
                if (Main.sessionMode.isLocked || Main.sessionMode.isGreeter)
                    return [false, 0, 0];
                const [x, y] = global.get_pointer();
                return [true, Math.round(x), Math.round(y)];
            },
            GetState() {
                if (Main.sessionMode.isLocked || Main.sessionMode.isGreeter)
                    return [false, 0, 0, 0];
                const [x, y, modifiers] = global.get_pointer();
                // Never expose keyboard modifier state through the bridge.
                // GNOME 48's native seat maskmap orders BUTTON1, BUTTON3,
                // BUTTON2 for primary, middle, secondary. Normalize the wire
                // format to 1=left, 2=middle, 4=right (tested with virtual input).
                const buttons = (modifiers & Clutter.ModifierType.BUTTON1_MASK ? 1 : 0) |
                    (modifiers & Clutter.ModifierType.BUTTON3_MASK ? 2 : 0) |
                    (modifiers & Clutter.ModifierType.BUTTON2_MASK ? 4 : 0);
                return [true, Math.round(x), Math.round(y), buttons];
            },
        });
        this._service.export(Gio.DBus.session, '/es/edutictac/Lekhini/Pointer');
        this._sessionSignal = Main.sessionMode.connect('updated', () => {
            if (Main.sessionMode.isLocked || Main.sessionMode.isGreeter) this._stopMagnifier();
            this._highlight.position();
        });
    }

    _stopMagnifier() {
        if (this._zoom?.owner) this._zoom.release(this._zoom.owner);
        if (this._ownerWatch) Gio.bus_unwatch_name(this._ownerWatch);
        this._ownerWatch = 0;
        this._service?.emit_signal('MagnifierStopped', null);
    }

    disable() {
        this._highlight?.stop();
        this._highlight = null;
        this._stopMagnifier();
        if (this._sessionSignal) Main.sessionMode.disconnect(this._sessionSignal);
        this._sessionSignal = 0;
        this._zoom = null;
        this._service?.unexport();
        this._service = null;
    }
}
