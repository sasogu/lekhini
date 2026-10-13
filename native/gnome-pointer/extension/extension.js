import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

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
</interface></node>`;

export default class LekhiniPointer extends Extension {
    enable() {
        this._service = Gio.DBusExportedObject.wrapJSObject(XML, {
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
    }

    disable() {
        this._service?.unexport();
        this._service = null;
    }
}
