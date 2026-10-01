import { app, ipcMain, screen, shell } from 'electron';
import { getState, onChange, patch } from '../../main/hub';
import { getOverlays } from '../../main/windows/overlay';

type NativeKeyEvent = { keyCode: number; flags: number };
type NativeShortcutObserver = {
  hasPermission(): boolean;
  requestPermission(): boolean;
  start(callback: (event: NativeKeyEvent) => void): boolean;
  stop(): void;
};

const FLAG_SHIFT = 0x00020000;
const FLAG_CONTROL = 0x00040000;
const FLAG_OPTION = 0x00080000;
const FLAG_COMMAND = 0x00100000;

const keyNames = new Map<number, string>([
  [0, 'A'], [1, 'S'], [2, 'D'], [3, 'F'], [4, 'H'], [5, 'G'], [6, 'Z'], [7, 'X'],
  [8, 'C'], [9, 'V'], [11, 'B'], [12, 'Q'], [13, 'W'], [14, 'E'], [15, 'R'],
  [16, 'Y'], [17, 'T'], [18, '1'], [19, '2'], [20, '3'], [21, '4'], [22, '6'],
  [23, '5'], [24, '='], [25, '9'], [26, '7'], [27, '−'], [28, '8'], [29, '0'],
  [30, ']'], [31, 'O'], [32, 'U'], [33, '['], [34, 'I'], [35, 'P'], [37, 'L'],
  [38, 'J'], [39, '’'], [40, 'K'], [41, ';'], [42, '\\'], [43, ','], [44, '/'],
  [45, 'N'], [46, 'M'], [47, '.'], [50, '`'], [36, 'Return'], [48, 'Tab'],
  [49, 'Space'], [51, 'Delete'], [53, 'Esc'], [71, 'Clear'], [76, 'Enter'],
  [96, 'F5'], [97, 'F6'], [98, 'F7'], [99, 'F3'], [100, 'F8'], [101, 'F9'],
  [103, 'F11'], [109, 'F10'], [111, 'F12'], [115, 'Home'], [116, 'Page Up'],
  [117, 'Forward Delete'], [118, 'F4'], [119, 'End'], [120, 'F2'], [121, 'Page Down'],
  [122, 'F1'], [123, '←'], [124, '→'], [125, '↓'], [126, '↑'],
]);

const specialKeys = new Set([
  'Return', 'Tab', 'Space', 'Delete', 'Esc', 'Clear', 'Enter', 'Home', 'Page Up',
  'Forward Delete', 'End', 'Page Down', '←', '→', '↓', '↑',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
]);

let observer: NativeShortcutObserver | null = null;
try {
  if (process.platform === 'darwin') observer = require('@edutictac/macos-shortcut-observer') as NativeShortcutObserver;
} catch (error) {
  console.warn('[EduTicTac] macOS shortcut observer unavailable', error);
}

function formatShortcut(event: NativeKeyEvent, onlyShortcuts: boolean): string | null {
  const key = keyNames.get(event.keyCode);
  if (!key) return null;
  const modifiers: string[] = [];
  if (event.flags & FLAG_CONTROL) modifiers.push('⌃');
  if (event.flags & FLAG_OPTION) modifiers.push('⌥');
  if (event.flags & FLAG_SHIFT) modifiers.push('⇧');
  if (event.flags & FLAG_COMMAND) modifiers.push('⌘');
  if (onlyShortcuts && modifiers.length === 0 && !specialKeys.has(key)) return null;
  return `${modifiers.join('')}${key}`;
}

function stop(): void { observer?.stop(); }

function sync(): void {
  const settings = getState().edutictacKeystrokes;
  if (!observer || process.platform !== 'darwin' || !settings.enabled || !observer.hasPermission()) {
    stop();
    return;
  }
  if (!observer.start((event) => {
    const current = getState().edutictacKeystrokes;
    if (!current.enabled) return;
    const label = formatShortcut(event, current.onlyShortcuts);
    if (!label) return;
    const point = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(point);
    const overlay = getOverlays().get(display.id);
    if (!overlay || overlay.isDestroyed()) return;
    overlay.webContents.send('edutictac:keystroke', { label, id: `${Date.now()}-${Math.random()}` });
  })) console.warn('[EduTicTac] macOS shortcut listener could not be started');
}

export function registerMacShortcutObserver(): void {
  ipcMain.handle('edutictac:keystrokes:status', () =>
    !!observer && process.platform === 'darwin' && observer.hasPermission());
  ipcMain.handle('edutictac:keystrokes:request', () => {
    if (!observer || process.platform !== 'darwin') return false;
    if (!observer.hasPermission()) observer.requestPermission();
    const granted = observer.hasPermission();
    if (granted) patch({ edutictacKeystrokes: { enabled: true } });
    return granted;
  });
  ipcMain.handle('edutictac:keystrokes:open-settings', () => {
    if (process.platform === 'darwin') {
      return shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent');
    }
  });
  onChange((_state, changed) => { if (changed.has('edutictacKeystrokes')) sync(); });
  app.on('will-quit', stop);
  sync();
}
