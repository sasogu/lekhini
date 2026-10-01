import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';

type Settings = {
  enabled: boolean;
  onlyShortcuts: boolean;
  position: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
  fontSize: number;
  background: string;
  opacity: number;
  duration: number;
  maxVisible: number;
};
type Item = { id: string; label: string };

const defaults: Settings = {
  enabled: false,
  onlyShortcuts: true,
  position: 'bottom-center',
  fontSize: 28,
  background: '#111111',
  opacity: 0.88,
  duration: 1600,
  maxVisible: 3,
};

export function Keystrokes() {
  const [settings, setSettings] = createSignal(defaults);
  const [items, setItems] = createSignal<Item[]>([]);
  const timers = new Set<ReturnType<typeof setTimeout>>();

  onMount(() => {
    const offState = window.pen.hub.onBroadcast((value) => {
      const next = (value as { edutictacKeystrokes?: Settings }).edutictacKeystrokes;
      if (next) setSettings(next);
    });
    const offKey = window.pen.keystrokes.onKey((item) => {
      setItems((current) => [...current, item].slice(-settings().maxVisible));
      const timer = setTimeout(() => {
        setItems((current) => current.filter((entry) => entry.id !== item.id));
        timers.delete(timer);
      }, settings().duration);
      timers.add(timer);
    });
    void window.pen.hub.get().then((value) => {
      const next = (value as { edutictacKeystrokes?: Settings }).edutictacKeystrokes;
      if (next) setSettings(next);
    });
    onCleanup(() => {
      offState();
      offKey();
      for (const timer of timers) clearTimeout(timer);
    });
  });

  return <Show when={settings().enabled}>
    <div class={`edutictac-keystrokes edutictac-keystrokes-${settings().position}`}>
      <For each={items()}>{(item) =>
        <div class="edutictac-keystroke" style={{
          'font-size': `${settings().fontSize}px`,
          'background-color': settings().background,
          opacity: settings().opacity,
        }}>{item.label}</div>}
      </For>
    </div>
  </Show>;
}
