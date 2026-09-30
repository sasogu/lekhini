import { createSignal, onCleanup, onMount, Show } from 'solid-js';

type Settings = { enabled: boolean; color: string; size: number; opacity: number; shape: 'ring' | 'dot' };

export function CursorHighlight() {
  const [settings, setSettings] = createSignal<Settings>({ enabled: false, color: '#ff3b30', size: 44, opacity: 0.85, shape: 'ring' });
  const [point, setPoint] = createSignal<{ x: number; y: number } | null>(null);
  onMount(() => {
    const offState = window.pen.hub.onBroadcast((value) => {
      const next = (value as { edutictacCursor?: Settings }).edutictacCursor;
      if (next) setSettings(next);
    });
    const offPoint = window.pen.cursor.onPosition(setPoint);
    void window.pen.hub.get().then((value) => {
      const next = (value as { edutictacCursor?: Settings }).edutictacCursor;
      if (next) setSettings(next);
    });
    onCleanup(() => { offState(); offPoint(); });
  });
  return (
    <Show when={settings().enabled && point()}>
      {(p) => <div class={`edutictac-cursor edutictac-cursor-${settings().shape}`} style={{
        left: `${p().x}px`, top: `${p().y}px`, width: `${settings().size}px`, height: `${settings().size}px`,
        color: settings().color, opacity: settings().opacity,
      }} />}
    </Show>
  );
}
