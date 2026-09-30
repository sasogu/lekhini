import { createSignal, onCleanup, onMount, Show, For } from 'solid-js';

type Settings = { enabled: boolean; color: string; size: number; duration: number; opacity: number; showButton: boolean };
type Ripple = { id: string; button: 'left' | 'right' | 'middle'; x: number; y: number };

export function ClickEffects() {
  const [settings, setSettings] = createSignal<Settings>({ enabled: false, color: '#ff3b30', size: 68, duration: 520, opacity: 0.8, showButton: false });
  const [ripples, setRipples] = createSignal<Ripple[]>([]);
  const timers = new Set<ReturnType<typeof setTimeout>>();
  onMount(() => {
    const offState = window.pen.hub.onBroadcast((value) => {
      const next = (value as { edutictacClicks?: Settings }).edutictacClicks;
      if (next) setSettings(next);
    });
    const offClick = window.pen.clicks.onClick((event) => {
      setRipples((items) => [...items.slice(-5), event]);
      const timer = setTimeout(() => {
        setRipples((items) => items.filter((item) => item.id !== event.id));
        timers.delete(timer);
      }, settings().duration);
      timers.add(timer);
    });
    void window.pen.hub.get().then((value) => {
      const next = (value as { edutictacClicks?: Settings }).edutictacClicks;
      if (next) setSettings(next);
    });
    onCleanup(() => { offState(); offClick(); for (const timer of timers) clearTimeout(timer); });
  });
  return <Show when={settings().enabled}>
    <For each={ripples()}>{(ripple) => <div class={`edutictac-click edutictac-click-${ripple.button}`}
      style={{ left: `${ripple.x}px`, top: `${ripple.y}px`, width: `${settings().size}px`, height: `${settings().size}px`, color: settings().color, opacity: settings().opacity, 'animation-duration': `${settings().duration}ms` }}>
      <Show when={settings().showButton}><span>{ripple.button === 'left' ? 'L' : ripple.button === 'right' ? 'R' : 'M'}</span></Show>
    </div>}</For>
  </Show>;
}
