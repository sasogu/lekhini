# Cursor Highlight: viabilidad y diseño de la primera extensión

## Resultado de viabilidad

Lekhini usa Electron 32. La API `screen.getCursorScreenPoint()` ofrece la posición actual en DIP y no emite eventos de movimiento. Por ello, en macOS, Windows y X11 el MVP puede consultar posición solo mientras Cursor Highlight esté activo, limitar actualizaciones a la frecuencia de refresco y detener el temporizador al apagarlo. El overlay existente usa los mismos bounds DIP por display; el proceso principal puede seleccionar la pantalla con `screen.getDisplayNearestPoint()` y mandar coordenadas locales únicamente a esa ventana.

Wayland nativo queda fuera de esta implementación. Electron documenta que la llamada no está soportada y devuelve `{0, 0}`; su fuente de Electron contiene explícitamente esa rama. No dibujar un indicador fijo en la esquina ni intentar deducir el movimiento global a partir de eventos de otras superficies. El protocolo Wayland entrega movimiento con coordenadas locales a la superficie con foco, no a una app en segundo plano. XWayland solo es una alternativa si Electron se inicia efectivamente en X11 y el entorno dispone de XWayland; no equivale a soporte Wayland nativo.

| Entorno | Posición global | Decisión del MVP |
| --- | --- | --- |
| macOS | Electron `screen.getCursorScreenPoint()` | Compatible; consultar solo al activar |
| Windows | Electron `screen.getCursorScreenPoint()` | Compatible; consultar solo al activar |
| Linux/X11 | Electron `screen.getCursorScreenPoint()` | Compatible; verificar multi-monitor y escalado |
| Linux/Wayland nativo | No expuesta por Electron 32 | Desactivar y explicar limitación |
| Linux/Wayland con XWayland | Depende de backend y lanzamiento real | Tratar como X11 solo si se detecta X11; no asumir |

## Diseño mínimo

Crear los módulos EduTicTac bajo `src/edutictac/`: `shared/` para settings y validación sin dependencias, `cursor/` para el pintado y ciclo de vida de Cursor Highlight, y `platform/` para capacidades y proveedor de posición. Reutilizar una ventana overlay existente por display.

El proceso principal consulta la posición únicamente mientras la función está activa, selecciona el display actual, convierte a coordenadas locales DIP y notifica ese overlay. El renderer actualiza una única capa visual pasiva con `pointer-events: none`; el pintado se agrupa en `requestAnimationFrame`. Al desactivar, elimina el temporizador, oculta la capa y libera listeners. El overlay sigue en click-through y no consume los clics.

El ajuste se conserva como `edutictacCursor` en `PersistedState`, con activación, forma, color, diámetro y opacidad validados. El preload expone solamente consulta de disponibilidad y suscripción a posiciones. No se capturan pantallas ni se observan teclas. El permiso de Accesibilidad de macOS no se solicita para consultar el cursor con Electron.

## Implementación actual

La implementación está en `src/edutictac/`. En macOS,
`native/macos-pointer-observer` recibe movimientos mediante un `CGEventTap`
pasivo. Esto evita consultar continuamente la posición y sigue con menor
latencia los monitores de alta frecuencia. Si el proveedor nativo o Input
Monitoring no están disponibles, el proceso conserva la consulta cada 16 ms
como fallback. En ambos casos envía posiciones solo cuando cambian y únicamente
al overlay de la pantalla bajo el cursor, y libera el proveedor al apagar la
función o cerrar la aplicación.

El renderer muestra anillo o punto sin interceptar entrada y lo desplaza con
`translate3d`, permitiendo al compositor moverlo sin recalcular el layout en
cada actualización. La configuración persiste tamaño, color y opacidad.

El seguimiento nativo y la reducción perceptible del retraso se validaron en
el Mac de pruebas con Cursor Highlight como única herramienta activa.

La disponibilidad Wayland se determina conservadoramente a partir de la selección explícita Ozone de Electron 32; en una sesión Wayland con hint `auto`, también se marca como no disponible. No se ha verificado en un equipo Wayland real y debe contrastarse en GNOME/KDE/wlroots antes de distribuir. La CI del proyecto no tiene suite de tests; la implementación se validó con typecheck y compilación Vite, no con interacción real multi-monitor.

### Cambios de integración realizados

Los archivos propios son `src/edutictac/platform/cursor-position.ts`, `src/edutictac/cursor/tracker.ts` y `src/edutictac/cursor/CursorHighlight.tsx`. Las integraciones upstream son `src/main/main.ts` para registrar el proveedor, hub y persistencia para settings, preload/tipos para IPC, montaje en el overlay y ajustes en la toolbar. `src/main/windows/overlay.ts` permanece intacto: ya crea los overlays multimonitor y cada ventana está suscrita al hub.

No se debe usar `screen.getCursorScreenPoint()` bajo Wayland. Identificar la sesión efectiva requiere comprobar backend Electron (X11/XWayland frente a Wayland), no inferir solo desde `XDG_SESSION_TYPE`, porque una sesión Wayland puede ejecutar Electron sobre XWayland. Si Electron 32 no expone el backend efectivo de forma fiable en esta app, fail closed en sesiones Wayland y documentar el fallback; no prometer compatibilidad automática.

## Fuentes

- [Electron `screen` API](https://www.electronjs.org/docs/v32.0.0/api/screen): posición actual del cursor en DIP; llamada no soportada en Wayland.
- [Implementación de Electron para `GetCursorScreenPoint`](https://github.com/electron/electron/blob/v32.1.2/shell/browser/api/electron_api_screen.cc): en Linux devuelve punto vacío si el backend es Wayland.
- [Modelo y protocolo Wayland](https://wayland.freedesktop.org/docs/book/Protocol.html): clientes reciben eventos de puntero en coordenadas locales de superficies con foco.
- [XDG Desktop Portal GlobalShortcuts](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.GlobalShortcuts.html): portal para registrar shortcuts con consentimiento, no API de posición global del puntero.
