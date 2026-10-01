import type { BrowserWindow } from 'electron';
import { persisted, save } from '../../main/persistence';

const controls = new Set<BrowserWindow>();

export function displayLinkCompatibilityEnabled(): boolean {
  return persisted().edutictacDisplayLinkCompatibility === true;
}

function applyCapturePolicy(window: BrowserWindow): void {
  const compatible = process.platform === 'darwin' && displayLinkCompatibilityEnabled();
  window.setContentProtection(!process.env.LEKHINI_CAPTURE_TOOLBAR && !compatible);
}

/** DisplayLink needs capturable pixels even on a physically attached monitor. */
export function registerControlWindow(window: BrowserWindow): void {
  controls.add(window);
  window.once('closed', () => controls.delete(window));
  applyCapturePolicy(window);
}

export function setDisplayLinkCompatibility(enabled: boolean): void {
  save('edutictacDisplayLinkCompatibility', enabled);
  for (const window of controls) {
    if (!window.isDestroyed()) applyCapturePolicy(window);
  }
}
