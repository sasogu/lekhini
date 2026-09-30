import { app, BrowserWindow, ipcMain } from 'electron';
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { getState, onChange } from '../../main/hub';
import { screenStatus } from '../../main/permissions';
import { getOverlays } from '../../main/windows/overlay';
import { onCursorPosition, type CursorPosition } from '../cursor/tracker';

const MAGIC = Buffer.from('LMFR');
const HEADER_SIZE = 16;
const MAX_FRAME_BYTES = 16 * 1024 * 1024;
const FPS = 15;

type Tile = {
  displayId: number;
  x: number;
  y: number;
  width: number;
  height: number;
  outputWidth: number;
  outputHeight: number;
};

let provider: ChildProcessByStdio<null, Readable, Readable> | null = null;
let providerGeneration = 0;
let tile: Tile | null = null;
let buffered = Buffer.alloc(0);
let lastPoint: CursorPosition | null = null;
let permissionNotified = false;

function providerPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'bin', 'magnifier-capture')
    : path.join(app.getAppPath(), 'native', 'macos-magnifier', 'build', 'magnifier-capture');
}

function supported(): boolean {
  return process.platform === 'darwin' && fs.existsSync(providerPath());
}

function stopProvider(): void {
  providerGeneration += 1;
  const current = provider;
  provider = null;
  tile = null;
  buffered = Buffer.alloc(0);
  if (current && !current.killed) current.kill('SIGTERM');
  for (const overlay of getOverlays().values()) {
    if (!overlay.isDestroyed()) overlay.webContents.send('edutictac:magnifier-frame', null);
  }
}

function notifyPermissionNeeded(): void {
  if (permissionNotified) return;
  permissionNotified = true;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('permissions:needed', { reason: 'screen' });
  }
}

function desiredTile(point: CursorPosition): Tile {
  const settings = getState().edutictacMagnifier;
  const sampledSize = settings.size / settings.zoom;
  const logicalSize = Math.min(
    Math.max(Math.ceil(sampledSize + 180), 320),
    point.displayWidth,
    point.displayHeight,
  );
  const x = Math.max(0, Math.min(point.displayWidth - logicalSize, Math.round(point.x - logicalSize / 2)));
  const y = Math.max(0, Math.min(point.displayHeight - logicalSize, Math.round(point.y - logicalSize / 2)));
  const pixelScale = Math.min(Math.max(point.scaleFactor, 1), 2);
  return {
    displayId: point.displayId,
    x,
    y,
    width: logicalSize,
    height: logicalSize,
    outputWidth: Math.round(logicalSize * pixelScale),
    outputHeight: Math.round(logicalSize * pixelScale),
  };
}

function tileStillCovers(point: CursorPosition): boolean {
  if (!tile || tile.displayId !== point.displayId) return false;
  const sampledRadius = getState().edutictacMagnifier.size / getState().edutictacMagnifier.zoom / 2;
  const margin = sampledRadius + 24;
  return (
    point.x - tile.x >= margin &&
    point.y - tile.y >= margin &&
    tile.x + tile.width - point.x >= margin &&
    tile.y + tile.height - point.y >= margin
  );
}

function startProvider(nextTile: Tile): void {
  stopProvider();
  const generation = providerGeneration;
  tile = nextTile;
  buffered = Buffer.alloc(0);
  const child = spawn(providerPath(), [
    String(nextTile.displayId),
    String(nextTile.x),
    String(nextTile.y),
    String(nextTile.width),
    String(nextTile.height),
    String(nextTile.outputWidth),
    String(nextTile.outputHeight),
    String(FPS),
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  provider = child;

  child.stdout.on('data', (chunk: Buffer) => {
    if (generation !== providerGeneration || provider !== child) return;
    buffered = Buffer.concat([buffered, chunk]);
    parseFrames(generation);
  });
  child.stderr.on('data', (chunk: Buffer) => {
    const message = chunk.toString('utf8').trim();
    if (message) console.warn('[EduTicTac] magnifier provider:', message);
  });
  child.once('error', (error) => {
    if (generation === providerGeneration) console.warn('[EduTicTac] magnifier provider failed', error);
  });
  child.once('exit', (code, signal) => {
    if (generation !== providerGeneration || provider !== child) return;
    provider = null;
    tile = null;
    buffered = Buffer.alloc(0);
    if (code && signal !== 'SIGTERM') {
      console.warn('[EduTicTac] magnifier provider exited', { code, signal });
    }
  });
}

function parseFrames(generation: number): void {
  while (buffered.length >= HEADER_SIZE) {
    if (!buffered.subarray(0, 4).equals(MAGIC)) {
      const nextMagic = buffered.indexOf(MAGIC, 1);
      buffered = nextMagic >= 0 ? buffered.subarray(nextMagic) : Buffer.alloc(0);
      continue;
    }
    const width = buffered.readUInt32LE(4);
    const height = buffered.readUInt32LE(8);
    const byteLength = buffered.readUInt32LE(12);
    if (!width || !height || byteLength !== width * height * 4 || byteLength > MAX_FRAME_BYTES) {
      console.warn('[EduTicTac] magnifier provider sent an invalid frame header');
      stopProvider();
      return;
    }
    if (buffered.length < HEADER_SIZE + byteLength) return;
    const pixels = Uint8Array.from(buffered.subarray(HEADER_SIZE, HEADER_SIZE + byteLength));
    buffered = buffered.subarray(HEADER_SIZE + byteLength);
    if (generation !== providerGeneration || !tile || !lastPoint) return;
    const overlay = getOverlays().get(tile.displayId);
    if (!overlay || overlay.isDestroyed()) continue;
    overlay.webContents.send('edutictac:magnifier-frame', {
      width,
      height,
      pixels,
      tileX: tile.x,
      tileY: tile.y,
      tileWidth: tile.width,
      tileHeight: tile.height,
    });
  }
}

function handlePosition(point: CursorPosition | null): void {
  lastPoint = point;
  const settings = getState().edutictacMagnifier;
  if (!point || !settings.enabled || !supported()) {
    if (provider) stopProvider();
    return;
  }
  const permission = screenStatus();
  if (permission === 'denied' || permission === 'restricted') {
    stopProvider();
    notifyPermissionNeeded();
    return;
  }
  permissionNotified = false;
  if (!provider || !tileStillCovers(point)) startProvider(desiredTile(point));
}

export function registerMagnifierController(): void {
  ipcMain.handle('edutictac:magnifier-supported', () => supported());
  const unsubscribePosition = onCursorPosition(handlePosition);
  const unsubscribeState = onChange((_state, changed) => {
    if (!changed.has('edutictacMagnifier')) return;
    stopProvider();
    handlePosition(lastPoint);
  });
  app.on('will-quit', () => {
    unsubscribePosition();
    unsubscribeState();
    stopProvider();
  });
}
