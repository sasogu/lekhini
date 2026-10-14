import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import fs from 'node:fs';

const HELPER = '/opt/lekhini-shortcuts/bin/shortcut-observer';
const PKEXEC = '/usr/bin/pkexec';
const launchHelper = () => spawn(PKEXEC, [HELPER], { stdio: ['pipe', 'pipe', 'pipe'] });

export function validShortcutLabel(label: string): boolean {
  if (label.length > 64) return false;
  const match = /^(Ctrl\+)?(Alt\+)?(Super\+)?(Shift\+)?([A-Z0-9]|F[1-9]|F1[0-2]|Esc|Tab|Enter|Backspace|Delete|Home|End|Page Up|Page Down|Left|Right|Up|Down|Space|\-|=|\[|\])$/.exec(label);
  if (!match) return false;
  return !!(match[1] || match[2] || match[3]) || !/^([A-Z0-9]|Space|\-|=|\[|\])$/.test(match[5]);
}

export function linuxShortcutsInstalled(): boolean {
  if (process.platform !== 'linux' || !fs.existsSync(PKEXEC)) return false;
  try {
    for (const directory of ['/opt', '/opt/lekhini-shortcuts', '/opt/lekhini-shortcuts/bin']) {
      const parent = fs.lstatSync(directory);
      if (!parent.isDirectory() || parent.uid !== 0 || (parent.mode & 0o022)) return false;
    }
    const stat = fs.lstatSync(HELPER);
    return stat.isFile() && stat.uid === 0 && !(stat.mode & 0o022) && !!(stat.mode & 0o111);
  } catch { return false; }
}

export class LinuxShortcutObserver {
  private child: ChildProcessWithoutNullStreams | null = null;
  private ready = false;
  private paused = true;
  private pending: Promise<boolean> | null = null;
  private finish: ((value: boolean) => void) | null = null;
  private publish: (label: string) => void;
  private unavailable: () => void;
  private installed: () => boolean;
  private launch: () => ChildProcessWithoutNullStreams;

  constructor(publish: (label: string) => void, unavailable: () => void,
    dependencies: { installed?: () => boolean; launch?: () => ChildProcessWithoutNullStreams } = {}) {
    this.publish = publish;
    this.unavailable = unavailable;
    this.installed = dependencies.installed ?? linuxShortcutsInstalled;
    this.launch = dependencies.launch ?? launchHelper;
  }

  hasPermission(): boolean { return this.ready; }

  authorize(): Promise<boolean> {
    if (this.ready) return Promise.resolve(true);
    if (this.pending) return this.pending;
    if (!this.installed()) return Promise.resolve(false);
    this.pending = new Promise(resolve => { this.finish = resolve; });
    const result = this.pending;
    const child = this.launch();
    this.child = child;
    // Never relay authentication output or keyboard events to application logs.
    child.stderr.resume();
    const lines = createInterface({ input: child.stdout });
    lines.on('line', line => {
      if (this.child !== child) return;
      if (line === 'READY 1') {
        this.ready = true;
        this.finish?.(true);
        this.finish = null;
        this.pending = null;
      } else if (this.ready && !this.paused && line.startsWith('KEY\t')) {
        const label = line.slice(4);
        if (validShortcutLabel(label)) this.publish(label);
      }
    });
    const lost = () => {
      lines.close();
      if (this.child !== child) return;
      const wasReady = this.ready;
      this.stop();
      if (wasReady) this.unavailable();
    };
    child.once('error', lost);
    child.once('exit', lost);
    child.stdin.on('error', lost);
    return result;
  }

  resume(): void {
    if (!this.ready || !this.paused) return;
    this.paused = false;
    this.child?.stdin.write('RESUME\n');
  }

  pause(): void {
    if (!this.ready || this.paused) return;
    this.paused = true;
    this.child?.stdin.write('PAUSE\n');
  }

  stop(): void {
    const child = this.child;
    const wasReady = this.ready;
    this.child = null;
    this.ready = false;
    this.paused = true;
    this.finish?.(false);
    this.finish = null;
    this.pending = null;
    child?.stdin.end(); // root helper terminates on EOF, including after app crash
    if (child && !wasReady) {
      // pkexec is still awaiting authorization; EOF remains the fallback if
      // it became privileged just before READY reached the application.
      try { child.kill(); } catch { /* stdin closure owns the helper lifetime */ }
    }
  }
}
