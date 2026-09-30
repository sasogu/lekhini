import { app, ipcMain, screen } from 'electron';
import { getState, onChange } from '../../main/hub';
import { getOverlays } from '../../main/windows/overlay';
import { isCursorPositionSupported, readCursorPosition } from '../platform/cursor-position';

let timer: ReturnType<typeof setInterval> | null = null;
let previousDisplayId: number | null = null;
let previousX = Number.NaN;
let previousY = Number.NaN;

function hidePrevious(): void {
  if (previousDisplayId === null) return;
  const overlay = getOverlays().get(previousDisplayId);
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send('edutictac:cursor-position', null);
  previousDisplayId = null;
  previousX = Number.NaN;
  previousY = Number.NaN;
}

function stop(): void {
  if (timer) clearInterval(timer);
  timer = null;
  hidePrevious();
}

function pause(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

function tick(): void {
  const point = readCursorPosition();
  const display = screen.getDisplayNearestPoint(point);
  const overlay = getOverlays().get(display.id);
  if (!overlay || overlay.isDestroyed()) return;
  if (previousDisplayId !== display.id) hidePrevious();
  const x = point.x - display.bounds.x;
  const y = point.y - display.bounds.y;
  if (previousDisplayId === display.id && x === previousX && y === previousY) return;
  previousDisplayId = display.id;
  previousX = x;
  previousY = y;
  overlay.webContents.send('edutictac:cursor-position', { x, y });
}

function sync(): void {
  const state = getState();
  const needsPosition =
    state.edutictacCursor.enabled ||
    (state.edutictacSpotlight.enabled && !state.edutictacSpotlight.locked);
  // A locked spotlight deliberately keeps the last point visible. Stop
  // polling without sending the normal null/clear event to that overlay.
  if (
    isCursorPositionSupported() &&
    state.edutictacSpotlight.enabled &&
    state.edutictacSpotlight.locked &&
    !state.edutictacCursor.enabled
  ) {
    pause();
    return;
  }
  if (!isCursorPositionSupported() || !needsPosition) {
    stop();
    return;
  }
  if (timer) return;
  tick();
  timer = setInterval(tick, 16);
}

export function registerCursorTracker(): void {
  ipcMain.handle('edutictac:cursor-supported', () => isCursorPositionSupported());
  onChange((_state, changed) => {
    if (changed.has('edutictacCursor') || changed.has('edutictacSpotlight')) sync();
  });
  app.on('will-quit', stop);
  sync();
}
