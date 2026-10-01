import { app, Menu, nativeImage, screen, Tray } from 'electron';
import { getState, onChange, patch } from '../../main/hub';
import { createToolbar, getToolbar } from '../../main/windows/toolbar';
import type { ToolId } from '../../shared/types';
import { displayLinkCompatibilityEnabled, setDisplayLinkCompatibility } from './control-window-visibility';

let tray: Tray | null = null;
let menu: Menu | null = null;
let stopListening: (() => void) | null = null;

const annotationTools: Array<{ id: ToolId; label: string }> = [
  { id: 'pencil', label: 'Lápiz' },
  { id: 'pen', label: 'Pluma' },
  { id: 'highlighter', label: 'Resaltador' },
  { id: 'eraser', label: 'Borrador' },
  { id: 'hand', label: 'Mover lienzo' },
  { id: 'line', label: 'Línea' },
  { id: 'trendline', label: 'Línea de tendencia' },
  { id: 'arrow', label: 'Flecha' },
  { id: 'region', label: 'Rectángulo' },
  { id: 'ellipse', label: 'Elipse' },
  { id: 'fib', label: 'Fibonacci' },
  { id: 'text', label: 'Texto' },
  { id: 'snip', label: 'Captura de región' },
];

function syncMenuChecks(items: Menu): void {
  const state = getState();
  const checked: Record<string, boolean> = {
    'module-cursor': state.edutictacCursor.enabled,
    'module-clicks': state.edutictacClicks.enabled,
    'module-keystrokes': state.edutictacKeystrokes.enabled,
    'module-spotlight': state.edutictacSpotlight.enabled,
    'module-magnifier': state.edutictacMagnifier.enabled,
    'module-teacher': state.edutictacTeacherMode.enabled,
    'annotation-drawing': state.drawMode,
  };
  for (const [id, value] of Object.entries(checked)) {
    const item = items.getMenuItemById(id);
    if (item) item.checked = value;
  }
  for (const tool of annotationTools) {
    const item = items.getMenuItemById(`tool-${tool.id}`);
    if (item) item.checked = state.activeTool === tool.id;
  }
}

/** Explicit recovery also rebuilds the transparent window/compositor. */
export function showPresentationToolbar(recreate = false, settings = false): void {
  // Recover on the display containing the pointer. This matches the menu
  // bar the user clicked and avoids moving the toolbar to another workspace.
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
    const width = Math.min(bounds.width, Math.max(1, area.width - 16));
    const height = Math.min(bounds.height, Math.max(1, area.height - 16));
    const insetX = Math.min(64, Math.max(8, area.width - width - 8));
    toolbar.setBounds({ x: area.x + insetX, y: area.y + 16, width, height });
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
  menu = Menu.buildFromTemplate([
    { label: 'Mostrar barra', click: () => showPresentationToolbar() },
    { label: 'Recuperar barra en esta pantalla', click: () => showPresentationToolbar(true) },
    { label: 'Ajustes completos…', click: () => showPresentationToolbar(false, true) },
    {
      id: 'displaylink-compatibility',
      label: 'Compatibilidad DisplayLink (controles visibles en capturas)',
      type: 'checkbox',
      checked: displayLinkCompatibilityEnabled(),
      click: (item) => setDisplayLinkCompatibility(item.checked),
    },
    { type: 'separator' },
    {
      label: 'Presentación',
      submenu: [
        { id: 'module-cursor', label: 'Resaltado del cursor', type: 'checkbox', checked: getState().edutictacCursor.enabled, click: () => patch({ edutictacCursor: { enabled: !getState().edutictacCursor.enabled } }) },
        { id: 'module-clicks', label: 'Efectos de clic', type: 'checkbox', checked: getState().edutictacClicks.enabled, click: () => patch({ edutictacClicks: { enabled: !getState().edutictacClicks.enabled } }) },
        { id: 'module-keystrokes', label: 'Teclas y atajos', type: 'checkbox', checked: getState().edutictacKeystrokes.enabled, click: () => patch({ edutictacKeystrokes: { enabled: !getState().edutictacKeystrokes.enabled } }) },
        { id: 'module-spotlight', label: 'Spotlight', type: 'checkbox', checked: getState().edutictacSpotlight.enabled, click: () => patch({ edutictacSpotlight: { enabled: !getState().edutictacSpotlight.enabled } }) },
        { id: 'module-magnifier', label: 'Lupa', type: 'checkbox', checked: getState().edutictacMagnifier.enabled, click: () => patch({ edutictacMagnifier: { enabled: !getState().edutictacMagnifier.enabled } }) },
        { id: 'module-teacher', label: 'Teacher Mode', type: 'checkbox', checked: getState().edutictacTeacherMode.enabled, click: () => patch({ edutictacTeacherMode: { enabled: !getState().edutictacTeacherMode.enabled } }) },
      ],
    },
    {
      label: 'Herramienta de anotación',
      submenu: [
        { id: 'annotation-drawing', label: 'Modo de dibujo', type: 'checkbox', checked: getState().drawMode, click: () => patch({ drawMode: !getState().drawMode }) },
        { type: 'separator' },
        ...annotationTools.map(({ id, label }) => ({ id: `tool-${id}`, label, type: 'radio' as const, checked: getState().activeTool === id, click: () => patch({ activeTool: id, drawMode: true }) })),
      ],
    },
    { type: 'separator' },
    { label: 'Salir de Lekhini', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  stopListening = onChange(() => { if (menu) syncMenuChecks(menu); });
  app.once('will-quit', () => {
    stopListening?.();
    stopListening = null;
    tray?.destroy();
    tray = null;
    menu = null;
  });
}
