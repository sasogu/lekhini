import { app } from 'electron';
import { onChange, patch } from '../../main/hub';

let applying = false;

export function registerTeacherModeController(): void {
  const unsubscribe = onChange((state, changed) => {
    if (applying || !changed.has('edutictacTeacherMode')) return;
    const teacher = state.edutictacTeacherMode;
    applying = true;
    try {
      patch({
        edutictacCursor: { enabled: teacher.enabled && teacher.cursor },
        edutictacClicks: { enabled: teacher.enabled && teacher.clicks },
        edutictacKeystrokes: { enabled: teacher.enabled && teacher.keystrokes },
        edutictacSpotlight: { enabled: teacher.enabled && teacher.spotlight },
        edutictacMagnifier: { enabled: teacher.enabled && teacher.magnifier },
        drawMode: teacher.enabled && teacher.annotations,
      });
    } finally {
      applying = false;
    }
  });
  app.on('will-quit', unsubscribe);
}
