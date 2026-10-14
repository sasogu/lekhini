import { BrowserWindow, Display, ipcMain, screen } from 'electron';
import path from 'node:path';
import { getState, subscribe } from '../hub';
import { registerDrawingHotkeys, registerEscapeWhileDrawing } from '../hotkeys';
import { registerDrawingOverlay, protectDrawingControls } from '../../edutictac/platform/overlay-controls';

const overlays = new Map<number, BrowserWindow>();

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

export function createOverlayForDisplay(display: Display): BrowserWindow {
  const win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    // Linux cannot change focusability after creation. Text input needs a
    // managed window; showInactive + click-through keep idle overlays passive.
    focusable: process.platform === 'linux',
    acceptFirstMouse: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });

  const displayId = display.id;
  ipcMain.removeHandler(`overlay:display-id:${displayId}`);

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[pen] overlay ${displayId} did-fail-load`, code, desc, url);
  });
  win.webContents.on('console-message', (_e, _lvl, msg, line, src) => {
    console.log(`[overlay-${displayId}-console] ${msg} (${src}:${line})`);
  });
  win.once('ready-to-show', () => {
    console.log(`[pen] overlay ${displayId} ready-to-show`);
    if (process.platform === 'linux') win.showInactive();
    else win.show();
  });

  if (VITE_DEV_SERVER_URL) {
    const url = `${VITE_DEV_SERVER_URL}src/renderer/overlay/index.html?display=${displayId}`;
    console.log(`[pen] overlay ${displayId} loading`, url);
    win.loadURL(url);
  } else {
    win.loadFile(path.join(__dirname, '../../dist/src/renderer/overlay/index.html'), {
      query: { display: String(displayId) },
    });
  }

  subscribe(win);
  overlays.set(displayId, win);
  registerDrawingOverlay(win);
  win.once('closed', () => overlays.delete(displayId));

  return win;
}

export function getOverlays(): Map<number, BrowserWindow> {
  return overlays;
}

export function setDrawMode(enabled: boolean) {
  protectDrawingControls(enabled);
  for (const win of overlays.values()) {
    if (win.isDestroyed()) continue;
    if (enabled) {
      if (process.platform !== 'linux') win.setIgnoreMouseEvents(false);
      // The 'screen-saver' z-level only exists on macOS; on Windows and
      // Linux another topmost window (or a fullscreen app) can slip
      // above the overlay. Re-asserting on every draw-mode entry pushes
      // the overlay back to the top of the topmost band right when the
      // user needs it.
      if (process.platform !== 'darwin') {
        win.setAlwaysOnTop(true, 'screen-saver');
      }
    } else {
      win.setIgnoreMouseEvents(true, { forward: true });
    }
  }
}

export function syncOverlaysToDisplays() {
  const displays = screen.getAllDisplays();
  const seenIds = new Set<number>();

  for (const display of displays) {
    seenIds.add(display.id);
    if (overlays.has(display.id)) {
      const win = overlays.get(display.id)!;
      win.setBounds(display.bounds);
    } else {
      createOverlayForDisplay(display);
    }
  }

  for (const [id, win] of overlays) {
    if (!seenIds.has(id) && !win.isDestroyed()) win.close();
  }
}

export function registerOverlayIpc() {
  ipcMain.on('overlay:display-id', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    let foundId = -1;
    if (win) {
      for (const [id, w] of overlays) {
        if (w === win) {
          foundId = id;
          break;
        }
      }
    }
    event.returnValue = foundId;
  });

  ipcMain.handle('overlay:request-focus', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      // Native editing must receive Escape and ordinary editing shortcuts.
      registerEscapeWhileDrawing(false);
      registerDrawingHotkeys(false);
      if (process.platform !== 'linux') win.setFocusable(true);
      win.focus();
    }
  });

  ipcMain.handle('overlay:release-focus', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      if (process.platform === 'linux') win.blur();
      else win.setFocusable(false);
      registerDrawingHotkeys(getState().drawMode);
      registerEscapeWhileDrawing(getState().drawMode);
    }
  });
}
