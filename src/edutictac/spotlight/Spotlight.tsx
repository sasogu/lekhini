import { createSignal, onCleanup, onMount, Show, Switch, Match } from 'solid-js';

type Settings = {
  enabled: boolean;
  shape: 'circle' | 'ellipse' | 'rectangle';
  width: number;
  height: number;
  feather: number;
  dimOpacity: number;
  locked: boolean;
};

const defaults: Settings = {
  enabled: false,
  shape: 'circle',
  width: 280,
  height: 280,
  feather: 28,
  dimOpacity: 0.62,
  locked: false,
};

export function Spotlight() {
  const [settings, setSettings] = createSignal<Settings>(defaults);
  const [point, setPoint] = createSignal<{ x: number; y: number } | null>(null);

  onMount(() => {
    const offState = window.pen.hub.onBroadcast((value) => {
      const next = (value as { edutictacSpotlight?: Settings }).edutictacSpotlight;
      if (next) setSettings(next);
    });
    const offPoint = window.pen.cursor.onPosition((next) => {
      // Lock keeps the last received point even when the shared tracker
      // stops and clears the other monitor overlays.
      if (!settings().locked) setPoint(next);
    });
    void window.pen.hub.get().then((value) => {
      const next = (value as { edutictacSpotlight?: Settings }).edutictacSpotlight;
      if (next) setSettings(next);
    });
    onCleanup(() => {
      offState();
      offPoint();
    });
  });

  return (
    <Show when={settings().enabled && point()}>
      {(p) => (
        <svg class="edutictac-spotlight" width="100%" height="100%" aria-hidden="true">
          <defs>
            <filter id="edutictac-spotlight-feather" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation={settings().feather / 2} />
            </filter>
            <mask id="edutictac-spotlight-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              <Switch>
                <Match when={settings().shape === 'circle'}>
                  <circle cx={p().x} cy={p().y} r={settings().width / 2} fill="black"
                    filter={settings().feather > 0 ? 'url(#edutictac-spotlight-feather)' : undefined} />
                </Match>
                <Match when={settings().shape === 'ellipse'}>
                  <ellipse cx={p().x} cy={p().y} rx={settings().width / 2} ry={settings().height / 2}
                    fill="black" filter={settings().feather > 0 ? 'url(#edutictac-spotlight-feather)' : undefined} />
                </Match>
                <Match when={settings().shape === 'rectangle'}>
                  <rect x={p().x - settings().width / 2} y={p().y - settings().height / 2}
                    width={settings().width} height={settings().height} rx="18" fill="black"
                    filter={settings().feather > 0 ? 'url(#edutictac-spotlight-feather)' : undefined} />
                </Match>
              </Switch>
            </mask>
          </defs>
          <rect x="0" y="0" width="100%" height="100%" fill="black"
            opacity={settings().dimOpacity} mask="url(#edutictac-spotlight-mask)" />
        </svg>
      )}
    </Show>
  );
}
