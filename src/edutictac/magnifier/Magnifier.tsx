import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js';

type Settings = {
  enabled: boolean;
  zoom: 1.5 | 2 | 3 | 4;
  size: number;
  borderColor: string;
  borderWidth: number;
  opacity: number;
};

type Frame = {
  width: number;
  height: number;
  pixels: Uint8Array;
  tileX: number;
  tileY: number;
  tileWidth: number;
  tileHeight: number;
};

const defaults: Settings = {
  enabled: false,
  zoom: 2,
  size: 260,
  borderColor: '#ffffff',
  borderWidth: 4,
  opacity: 1,
};

export function Magnifier() {
  const [settings, setSettings] = createSignal<Settings>(defaults);
  const [point, setPoint] = createSignal<{ x: number; y: number } | null>(null);
  const [frame, setFrame] = createSignal<Frame | null>(null);
  let canvas!: HTMLCanvasElement;
  const source = document.createElement('canvas');

  onMount(() => {
    const offState = window.pen.hub.onBroadcast((value) => {
      const next = (value as { edutictacMagnifier?: Settings }).edutictacMagnifier;
      if (next) setSettings(next);
    });
    const offPoint = window.pen.cursor.onPosition(setPoint);
    const offFrame = window.pen.magnifier.onFrame(setFrame);
    void window.pen.hub.get().then((value) => {
      const next = (value as { edutictacMagnifier?: Settings }).edutictacMagnifier;
      if (next) setSettings(next);
    });
    onCleanup(() => {
      offState();
      offPoint();
      offFrame();
    });
  });

  createEffect(() => {
    const currentFrame = frame();
    const currentPoint = point();
    const currentSettings = settings();
    if (!canvas || !currentFrame || !currentPoint || !currentSettings.enabled) return;

    source.width = currentFrame.width;
    source.height = currentFrame.height;
    const sourceContext = source.getContext('2d');
    if (!sourceContext) return;
    const pixels = Uint8ClampedArray.from(currentFrame.pixels);
    sourceContext.putImageData(new ImageData(pixels, currentFrame.width, currentFrame.height), 0, 0);

    const deviceScale = Math.min(window.devicePixelRatio || 1, 2);
    const outputSize = Math.round(currentSettings.size * deviceScale);
    if (canvas.width !== outputSize) canvas.width = outputSize;
    if (canvas.height !== outputSize) canvas.height = outputSize;
    const context = canvas.getContext('2d');
    if (!context) return;

    const sourceLogicalSize = currentSettings.size / currentSettings.zoom;
    const frameScaleX = currentFrame.width / currentFrame.tileWidth;
    const frameScaleY = currentFrame.height / currentFrame.tileHeight;
    const sx = (currentPoint.x - currentFrame.tileX - sourceLogicalSize / 2) * frameScaleX;
    const sy = (currentPoint.y - currentFrame.tileY - sourceLogicalSize / 2) * frameScaleY;
    const sw = sourceLogicalSize * frameScaleX;
    const sh = sourceLogicalSize * frameScaleY;
    context.clearRect(0, 0, outputSize, outputSize);
    context.imageSmoothingEnabled = false;
    context.drawImage(source, sx, sy, sw, sh, 0, 0, outputSize, outputSize);
  });

  return (
    <Show when={settings().enabled && point() && frame()}>
      <canvas
        ref={canvas}
        class="edutictac-magnifier"
        style={{
          left: `${point()!.x}px`,
          top: `${point()!.y}px`,
          width: `${settings().size}px`,
          height: `${settings().size}px`,
          opacity: settings().opacity,
          border: `${settings().borderWidth}px solid ${settings().borderColor}`,
        }}
        aria-hidden="true"
      />
    </Show>
  );
}
