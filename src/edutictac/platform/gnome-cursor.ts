import { app } from 'electron';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import path from 'node:path';

export type CursorSettings = { enabled: boolean; color: string; size: number; opacity: number; shape: 'ring' | 'dot' };

export function startGnomeCursor(applied: () => void, unavailable: () => void): {
  update(settings: CursorSettings): void;
  stop(): void;
} {
  const helper = app.isPackaged
    ? path.join(process.resourcesPath, 'bin/gnome-cursor-client.js')
    : path.join(app.getAppPath(), 'native/gnome-pointer/cursor-client.js');
  const child = spawn('gjs', ['-m', helper], { stdio: ['pipe', 'pipe', 'ignore'] });
  const lines = createInterface({ input: child.stdout });
  let stopped = false;
  const lost = () => {
    if (stopped) return;
    stopped = true;
    lines.close();
    child.kill();
    unavailable();
  };
  child.once('error', lost);
  child.once('exit', lost);
  child.stdin.on('error', lost);
  lines.on('line', (line) => { if (line === 'stopped') lost(); else if (line === 'applied') applied(); });
  return {
    update: (settings) => {
      if (!stopped) child.stdin.write(`${JSON.stringify(settings)}\n`);
    },
    stop: () => {
      stopped = true;
      lines.close();
      // Closing stdin removes the GNOME highlight, without changing unrelated
      // cursor settings. SIGKILL is only a fallback for a stuck helper.
      child.stdin.end();
      const timer = setTimeout(() => { if (child.exitCode === null) child.kill(); }, 2500);
      timer.unref();
      child.once('exit', () => clearTimeout(timer));
    },
  };
}
