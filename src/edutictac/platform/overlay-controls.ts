import type { BrowserWindow } from 'electron';
import { drawingRegions } from './overlay-control-regions';

const overlays = new Set<BrowserWindow>();
const controls = new Set<BrowserWindow>();
let drawing = false;

function sync(): void {
  const visible = [...controls].filter((win) => !win.isDestroyed() && win.isVisible())
    .map((win) => win.getBounds());
  for (const win of overlays) {
    if (win.isDestroyed()) continue;
    try {
      if (!drawing) {
        win.setIgnoreMouseEvents(true, { forward: true });
        win.setShape([]);
        continue;
      }
      const regions = drawingRegions(win.getBounds(), visible);
      // [] resets Electron's shape to a full rectangle; it is NOT an empty input region.
      win.setShape(regions);
      win.setIgnoreMouseEvents(regions.length === 0, { forward: true });
    } catch (error) {
      // Leave the desktop usable if the compositor rejects shaped windows.
      win.setIgnoreMouseEvents(true, { forward: true });
      console.warn('[EduTicTac] annotation input disabled: control protection failed', error);
    }
  }
}

export function registerDrawingOverlay(win: BrowserWindow): void {
  if (process.platform !== 'linux') return;
  overlays.add(win);
  win.on('move', sync);
  win.on('resize', sync);
  win.once('closed', () => { overlays.delete(win); });
  sync();
}

export function registerDrawingControl(win: BrowserWindow): void {
  if (process.platform !== 'linux') return;
  controls.add(win);
  win.on('move', sync);
  win.on('resize', sync);
  win.on('show', sync);
  win.on('hide', sync);
  win.once('closed', () => { controls.delete(win); sync(); });
  sync();
}

export function protectDrawingControls(enabled: boolean): void {
  if (process.platform !== 'linux') return;
  drawing = enabled;
  sync();
}
