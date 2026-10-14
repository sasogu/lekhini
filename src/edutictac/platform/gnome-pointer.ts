import { app } from 'electron';
import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import { createInterface } from 'node:readline';

type Point = { x: number; y: number };
export type GnomeClick = Point & { button: 'left' | 'right' | 'middle' };
type Subscription<T> = { publish: (event: T) => void; unavailable: () => void };
let available = false;
let clicksAvailable = false;
let magnifierAvailable = false;
let cursorHighlightAvailable = false;
const pointers = new Set<Subscription<Point | null>>();
const clicks = new Set<Subscription<GnomeClick>>();
let stopHelper: (() => void) | null = null;
let helperButtons = false;

export function usesWaylandSession(): boolean {
  return process.platform === 'linux' && process.env.XDG_SESSION_TYPE === 'wayland';
}
export function hasGnomePointer(): boolean { return available; }
export function hasGnomeClicks(): boolean { return clicksAvailable; }
export function hasGnomeMagnifier(): boolean { return magnifierAvailable; }
export function hasGnomeCursorHighlight(): boolean { return cursorHighlightAvailable; }

async function probe(method: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    execFile('gdbus', ['call', '--session', '--dest', 'org.gnome.Shell',
      '--object-path', '/es/edutictac/Lekhini/Pointer',
      '--method', `es.edutictac.Lekhini.Pointer.${method}`],
    { timeout: 2000 }, (error) => resolve(!error));
  });
}

export async function probeGnomePointer(): Promise<void> {
  if (!usesWaylandSession()) return;
  available = await probe('GetPosition');
  // Version 1 still supports the cursor until the user reloads GNOME.
  clicksAvailable = available && await probe('GetState');
  magnifierAvailable = available && await probe('GetMagnifierStatus');
  cursorHighlightAvailable = available && await probe('GetCursorHighlightStatus');
}

function isPoint(value: unknown): value is Point {
  return value !== null && typeof value === 'object' && 'x' in value && 'y' in value &&
    typeof value.x === 'number' && typeof value.y === 'number' &&
    Number.isFinite(value.x) && Number.isFinite(value.y);
}

function syncHelper(): void {
  const needsButtons = clicks.size > 0;
  if (stopHelper && helperButtons === needsButtons && (pointers.size || needsButtons)) return;
  stopHelper?.();
  stopHelper = null;
  if ((!pointers.size && !needsButtons) || !available) return;
  const helper = app.isPackaged
    ? path.join(process.resourcesPath, 'bin/gnome-pointer-client.js')
    : path.join(app.getAppPath(), 'native/gnome-pointer/client.js');
  const child = spawn('gjs', ['-m', helper, ...(needsButtons ? ['--buttons'] : [])],
    { stdio: ['ignore', 'pipe', 'ignore'] });
  helperButtons = needsButtons;
  const lines = createInterface({ input: child.stdout });
  let stopped = false;
  lines.on('line', (line) => {
    try {
      const event = JSON.parse(line);
      if (event?.type === 'position' && (event.point === null || isPoint(event.point))) {
        for (const listener of pointers) listener.publish(event.point);
      } else if (event?.type === 'click' && isPoint(event) && 'button' in event &&
        (event.button === 'left' || event.button === 'right' || event.button === 'middle')) {
        for (const listener of clicks) listener.publish({ x: event.x, y: event.y, button: event.button });
      }
    } catch { /* Ignore malformed helper output. */ }
  });
  const lost = () => {
    if (stopped) return;
    stopped = true;
    lines.close();
    child.kill();
    stopHelper = null;
    available = false;
    clicksAvailable = false;
    const pointerListeners = [...pointers];
    const clickListeners = [...clicks];
    pointers.clear();
    clicks.clear();
    for (const listener of pointerListeners) { listener.publish(null); listener.unavailable(); }
    for (const listener of clickListeners) listener.unavailable();
  };
  child.once('error', lost);
  child.once('exit', lost);
  stopHelper = () => {
    stopped = true;
    lines.close();
    child.kill();
  };
}

export function startGnomePointer(
  publish: (point: Point | null) => void,
  unavailable: () => void,
): () => void {
  const subscription = { publish, unavailable };
  pointers.add(subscription);
  syncHelper();
  return () => { pointers.delete(subscription); syncHelper(); };
}

export function startGnomeClicks(
  publish: (click: GnomeClick) => void,
  unavailable: () => void,
): () => void {
  const subscription = { publish, unavailable };
  clicks.add(subscription);
  syncHelper();
  return () => { clicks.delete(subscription); syncHelper(); };
}
