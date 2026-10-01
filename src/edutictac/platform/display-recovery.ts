import { app, screen } from 'electron';
import { getState, patch } from '../../main/hub';
import { getToolbar, resizeToolbar } from '../../main/windows/toolbar';

/** Re-anchor the toolbar after a display is replaced or becomes primary. */
export function registerDisplayRecovery(): void {
  let pending: ReturnType<typeof setTimeout> | undefined;
  const recover = () => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = undefined;
      const toolbar = getToolbar();
      if (!toolbar || toolbar.isDestroyed()) return;
      const state = getState();
      patch({ flyout: null });
      const dock = state.settingsOpen || state.statusPanelOpen || state.chatOpen ? 'panel' : 'none';
      resizeToolbar(state.orientation, state.minimized, dock, 'default');
      const area = screen.getPrimaryDisplay().workArea;
      const bounds = toolbar.getBounds();
      const width = Math.min(bounds.width, Math.max(1, area.width - 16));
      const height = Math.min(bounds.height, Math.max(1, area.height - 16));
      toolbar.setBounds({
        x: Math.max(area.x + 8, Math.min(bounds.x, area.x + area.width - width - 8)),
        y: Math.max(area.y + 8, Math.min(bounds.y, area.y + area.height - height - 8)),
        width, height,
      });
    }, 150);
  };
  screen.on('display-added', recover);
  screen.on('display-removed', recover);
  screen.on('display-metrics-changed', recover);
  app.once('will-quit', () => {
    if (pending) clearTimeout(pending);
    screen.removeListener('display-added', recover);
    screen.removeListener('display-removed', recover);
    screen.removeListener('display-metrics-changed', recover);
  });
}
