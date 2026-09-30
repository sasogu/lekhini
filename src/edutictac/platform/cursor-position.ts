import { app, screen } from 'electron';

export function isCursorPositionSupported(): boolean {
  if (process.platform !== 'linux') return true;
  // Electron 32 uses X11 unless Wayland is explicitly selected. Never query
  // screen.getCursorScreenPoint() on native Wayland: Electron returns (0, 0).
  const ozone = app.commandLine.getSwitchValue('ozone-platform');
  const hint = app.commandLine.getSwitchValue('ozone-platform-hint') || process.env.ELECTRON_OZONE_PLATFORM_HINT;
  const nativeWayland = ozone === 'wayland' ||
    (process.env.XDG_SESSION_TYPE === 'wayland' && hint === 'auto');
  return !nativeWayland;
}

export function readCursorPosition(): Electron.Point {
  return screen.getCursorScreenPoint();
}
