import { app, Menu, nativeImage, screen, Tray } from 'electron';
import { getState, patch } from '../../main/hub';
import { createToolbar, getToolbar } from '../../main/windows/toolbar';

let tray: Tray | null = null;

/** Explicit recovery also rebuilds the transparent window/compositor. */
export function showPresentationToolbar(recreate = false, settings = false): void {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  let window = getToolbar();
  if (recreate && window && !window.isDestroyed()) {
    window.destroy();
    window = null;
  }
  patch({ minimized: false, settingsOpen: settings, statusPanelOpen: false, chatOpen: false, flyout: null });
  const created = !window || window.isDestroyed();
  if (created) window = createToolbar(getState().orientation);
  const toolbar = window!;
  const reveal = () => {
    if (toolbar.isDestroyed()) return;
    const area = display.workArea;
    const bounds = toolbar.getBounds();
    const width = Math.min(bounds.width, Math.max(1, area.width - 32));
    const height = Math.min(bounds.height, Math.max(1, area.height - 32));
    toolbar.setBounds({ x: area.x + 16, y: area.y + 16, width, height });
    toolbar.setOpacity(1);
    toolbar.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    toolbar.setAlwaysOnTop(true, 'screen-saver', 2);
    app.show();
    toolbar.show();
    toolbar.moveTop();
    toolbar.focus();
  };
  if (created) toolbar.webContents.once('did-finish-load', reveal);
  else reveal();
}

export function registerMacMenu(): void {
  if (process.platform !== 'darwin' || tray) return;
  // A small monochrome L in a ring; template rendering follows menu-bar theme.
  const size = 36;
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const radius = Math.hypot(x - 17.5, y - 17.5);
      const ring = radius >= 14 && radius <= 16;
      const letter = (x >= 12 && x <= 15 && y >= 9 && y <= 25) ||
        (x >= 12 && x <= 24 && y >= 22 && y <= 25);
      if (ring || letter) pixels[(y * size + x) * 4 + 3] = 255;
    }
  }
  const icon = nativeImage.createFromBitmap(pixels, { width: size, height: size, scaleFactor: 2 });
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Lekhini · EduTicTac Presenter');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Mostrar barra', click: () => showPresentationToolbar() },
    { label: 'Recuperar barra en esta pantalla', click: () => showPresentationToolbar(true) },
    { label: 'Ajustes…', click: () => showPresentationToolbar(false, true) },
    { type: 'separator' },
    { label: 'Pausar anotaciones', click: () => patch({ drawMode: false }) },
    { type: 'separator' },
    { label: 'Salir de Lekhini', click: () => app.quit() },
  ]));
  app.once('will-quit', () => { tray?.destroy(); tray = null; });
}
