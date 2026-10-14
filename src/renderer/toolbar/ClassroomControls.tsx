import { createSignal, For, onCleanup } from 'solid-js';
import type { ToolId, ToolSettings, Whiteboard } from '../../shared/types';
import { Icons } from './icons';
import { TOOL_BY_ID } from './toolDefs';

interface Props {
  state: { drawMode: boolean; activeTool: ToolId; settings: ToolSettings; whiteboard: Whiteboard };
  cycleBoard(): void;
  openPalette(): void;
  paletteRef(el: HTMLButtonElement): void;
}
const TOOLS: { id: ToolId; label: string }[] = [
  { id: 'pen', label: 'Escribir' }, { id: 'highlighter', label: 'Resaltar' },
  { id: 'eraser', label: 'Borrador' }, { id: 'hand', label: 'Mover' },
  { id: 'text', label: 'Texto' }, { id: 'arrow', label: 'Flecha' },
];

export function ClassroomControls(props: Props) {
  const [confirmClear, setConfirmClear] = createSignal(false);
  let clearTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(clearTimer));
  const clear = () => {
    if (confirmClear()) {
      clearTimeout(clearTimer);
      setConfirmClear(false);
      void window.pen.relay.clear();
    } else {
      setConfirmClear(true);
      clearTimer = setTimeout(() => setConfirmClear(false), 5000);
    }
  };
  return (
    <div class="classroom-controls" aria-label="Herramientas de aula">
      <p class="classroom-status" role="status">{props.state.drawMode ? 'Modo dibujo' : 'Escritorio libre'}</p>
      <button class={`classroom-btn ${!props.state.drawMode ? 'active' : ''}`}
        aria-pressed={!props.state.drawMode} aria-label="Usar el escritorio" data-action="desktop"
        onClick={() => void window.pen.hub.update({ drawMode: false, whiteboard: 'off', flyout: null })}>
        {Icons.eyeOff()}<span>Escritorio</span>
      </button>
      <For each={TOOLS}>{(tool) => (
        <button class={`classroom-btn ${props.state.drawMode && props.state.activeTool === tool.id ? 'active' : ''}`}
          aria-pressed={props.state.drawMode && props.state.activeTool === tool.id}
          aria-label={tool.label} data-tool={tool.id}
          onClick={() => void window.pen.hub.update({ activeTool: tool.id, drawMode: true, flyout: null })}>
          {TOOL_BY_ID[tool.id].icon()}<span>{tool.label}</span>
        </button>
      )}</For>
      <button class="classroom-btn" aria-label="Deshacer" onClick={() => void window.pen.relay.undo()}>
        {Icons.undo()}<span>Deshacer</span>
      </button>
      <button class="classroom-btn" aria-label="Rehacer" onClick={() => void window.pen.relay.redo()}>
        {Icons.redo()}<span>Rehacer</span>
      </button>
      <button class={`classroom-btn ${confirmClear() ? 'active' : ''}`} data-action="clear"
        aria-label={confirmClear() ? 'Confirmar limpieza' : 'Limpiar todo'} onClick={clear}>
        {Icons.clear()}<span>{confirmClear() ? 'Confirmar' : 'Limpiar'}</span>
      </button>
      <button class={`classroom-btn ${props.state.whiteboard !== 'off' ? 'active' : ''}`}
        aria-label="Cambiar fondo de pizarra" data-action="board" onClick={props.cycleBoard}>
        {Icons.whiteboard()}<span>{props.state.whiteboard === 'off' ? 'Pizarra' : props.state.whiteboard === 'white' ? 'Blanca' : 'Negra'}</span>
      </button>
      <button class="classroom-btn" aria-label="Guardar captura" onClick={() => void window.pen.relay.screenshot()}>
        {Icons.camera()}<span>Captura</span>
      </button>
      <button ref={props.paletteRef} class="classroom-btn classroom-palette" aria-label="Color y grosor"
        onClick={props.openPalette}>
        <span class="classroom-color" style={{ background: props.state.settings.color }} />
        <span>Color y grosor</span>
      </button>
      <button class="classroom-btn classroom-exit" aria-label="Volver a la barra normal"
        onClick={() => void window.pen.hub.update({ classroomMode: false })}>
        {Icons.gear()}<span>Barra normal</span>
      </button>
    </div>
  );
}
