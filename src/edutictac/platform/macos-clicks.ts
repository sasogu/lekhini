import { ipcMain, screen, app, shell } from 'electron';
import { getState, onChange, patch } from '../../main/hub';
import { getOverlays } from '../../main/windows/overlay';

type ClickEvent = { button: number; x: number; y: number };
type NativeClickObserver = {
  hasPermission(): boolean;
  requestPermission(): boolean;
  start(callback: (event: ClickEvent) => void): boolean;
  stop(): void;
};

let observer: NativeClickObserver | null = null;
try {
  if (process.platform === 'darwin') observer = require('@edutictac/macos-click-observer') as NativeClickObserver;
} catch (error) {
  console.warn('[EduTicTac] macOS click observer unavailable', error);
}

function stop(): void { observer?.stop(); }

function sync(): void {
  if (!observer || process.platform !== 'darwin' || !getState().edutictacClicks.enabled || !observer.hasPermission()) {
    stop();
    return;
  }
  if (!observer.start(({ button, x, y }) => {
    const display = screen.getDisplayNearestPoint({ x, y });
    const overlay = getOverlays().get(display.id);
    if (!overlay || overlay.isDestroyed()) return;
    overlay.webContents.send('edutictac:click', {
      button: button === 0 ? 'left' : button === 1 ? 'right' : 'middle',
      x: x - display.bounds.x,
      y: y - display.bounds.y,
      id: `${Date.now()}-${Math.random()}`,
    });
  })) console.warn('[EduTicTac] macOS click listener could not be started');
}

export function registerMacClickObserver(): void {
  ipcMain.handle('edutictac:clicks:status', () => !!observer && process.platform === 'darwin' && observer.hasPermission());
  ipcMain.handle('edutictac:clicks:request', () => {
    if (!observer || process.platform !== 'darwin') return false;
    if (!observer.hasPermission()) observer.requestPermission();
    const granted = observer.hasPermission();
    if (granted) patch({ edutictacClicks: { enabled: true } });
    return granted;
  });
  ipcMain.handle('edutictac:clicks:open-settings', () => {
    if (process.platform === 'darwin') {
      return shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent');
    }
  });
  onChange((_state, changed) => { if (changed.has('edutictacClicks')) sync(); });
  app.on('will-quit', stop);
  sync();
}
