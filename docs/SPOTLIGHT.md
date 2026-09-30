# Spotlight EduTicTac

Spotlight reutiliza las ventanas overlay que Lekhini ya crea para cada
monitor. No crea ventanas adicionales ni captura la pantalla: cada renderer
dibuja una máscara SVG transparente que oscurece el exterior de una abertura.
El cursor y los clics permanecen visibles sobre la máscara.

## Comportamiento

- Formas: círculo, elipse y rectángulo redondeado.
- Anchura y altura configurables; el círculo mantiene ambos valores iguales.
- Borde suavizado y nivel de oscurecimiento configurables.
- Sigue el cursor mediante el proveedor de posición ya utilizado por Cursor
  Highlight. El temporizador solo está activo mientras alguna de las dos
  herramientas necesita posiciones.
- `Command/Ctrl+Shift+L` bloquea o desbloquea la abertura en su posición
  actual. El bloqueo es estado de sesión y no se persiste, porque una posición
  guardada puede dejar de ser válida al reiniciar o cambiar monitores.
- La máscara usa `pointer-events: none`; no intercepta clics ni teclado.

## Multimonitor y plataformas

El proceso principal convierte las coordenadas globales en coordenadas DIP
locales del display y solo actualiza el overlay que contiene el cursor. Al
cambiar de monitor limpia el overlay anterior. Si Spotlight se bloquea, se
detiene el seguimiento y permanece únicamente en el monitor actual.

Funciona en macOS, Windows y X11 mediante `screen.getCursorScreenPoint()`. En
Wayland nativo permanece desactivado cuando Electron no puede obtener una
posición global fiable. No se solicitan permisos de captura de pantalla.

## Persistencia

Se guarda `edutictacSpotlight` con activación, forma, dimensiones, suavizado y
oscurecimiento. `locked` vive solamente en el hub durante la sesión. Los
valores se validan y limitan al hidratar y al recibir cambios desde el
renderer.

## Archivos y validación

La capa propia vive en `src/edutictac/spotlight/Spotlight.tsx`. Comparte
`src/edutictac/cursor/tracker.ts` con Cursor Highlight. Estado y validación se
integran en hub/persistencia; el atajo está en `src/main/hotkeys.ts`; la UI se
añade al panel de configuración existente.

La fase se validó con `npm run prebuild` en Debian y con un paquete arm64
firmado mediante Developer ID Application en macOS. Falta la validación visual
manual del usuario en Retina y multimonitor.
