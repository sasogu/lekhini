# Extensiones EduTicTac implementadas

Este documento es el inventario técnico del fork **EduTicTac Presenter** sobre
Lekhini. La base de comparación actual es `upstream/main` en `4c86796`
(`v1.2.0`). El código upstream se conserva y las extensiones se montan sobre
su hub, persistencia y overlays multimonitor.

## Estado general

| Extensión | Estado | Plataformas actuales | Documentación |
| --- | --- | --- | --- |
| Cursor Highlight | Implementada | macOS, Windows y X11; desactivada en Wayland nativo | [CURSOR_HIGHLIGHT.md](./CURSOR_HIGHLIGHT.md) |
| Click Effects | Implementada y probada | macOS; Windows/X11 pendientes | [CLICK_EFFECTS.md](./CLICK_EFFECTS.md) |
| Spotlight | Implementada; pendiente de validación visual final | macOS, Windows y X11; desactivada en Wayland nativo | [SPOTLIGHT.md](./SPOTLIGHT.md) |
| Dock de macOS | Implementado | macOS | [MACOS_DEVELOPMENT.md](./MACOS_DEVELOPMENT.md) |
| Firma estable de desarrollo | Configurada en el Mac de pruebas | macOS | [MACOS_DEVELOPMENT.md](./MACOS_DEVELOPMENT.md) |
| Magnifier | Implementada y probada | ScreenCaptureKit en macOS; otros proveedores pendientes | [MAGNIFIER.md](./MAGNIFIER.md) |
| Keystrokes | Implementada; pendiente de validación en el Mac | macOS; modo «solo atajos» recomendado | [KEYSTROKES.md](./KEYSTROKES.md) |
| Teacher Mode | No implementada | Pendiente | — |
| Presets EduTicTac | No implementados | Pendiente | — |
| Shortcuts configurables | No implementados | Solo existe el bloqueo fijo de Spotlight | — |

## Arquitectura común

Las extensiones visuales viven en `src/edutictac/` y reutilizan una
`BrowserWindow` overlay por monitor. No crean otro sistema de ventanas, estado
o persistencia. El flujo compartido es:

1. La configuración se valida en `src/main/hub.ts` y se guarda mediante
   `src/main/persistence.ts`.
2. El hub difunde el estado a toolbar y overlays con el IPC existente.
3. `src/renderer/overlay/App.tsx` monta las capas EduTicTac.
4. Cada capa usa `pointer-events: none`, por lo que el ratón continúa hacia la
   aplicación inferior.
5. La configuración se muestra dentro del panel existente en
   `src/renderer/toolbar/App.tsx`.

Los puntos de integración modificados en upstream son deliberadamente
pequeños: registro del proveedor en `src/main/main.ts`, estado/persistencia,
preload tipado, montaje de componentes y controles de configuración. El
overlay y el store originales no se han duplicado.

## Cursor Highlight

`src/edutictac/cursor/tracker.ts` consulta la posición global en intervalos de
16 ms solo mientras Cursor Highlight o Spotlight la necesitan. Convierte las
coordenadas globales a DIP locales del monitor y evita emitir posiciones
repetidas. Al cambiar de monitor limpia el anterior.

`src/edutictac/cursor/CursorHighlight.tsx` dibuja un anillo o punto configurable
en color, tamaño y opacidad. La función no captura pantalla, no observa clics
y no necesita permisos adicionales en macOS.

## Click Effects

El addon `native/macos-click-observer/` observa exclusivamente mouse-down
izquierdo, derecho y central. Usa un `CGEventTap` de escucha, devuelve siempre
el evento original y no incluye máscara ni callback de teclado. La autorización
se solicita bajo demanda con IOKit y corresponde a **Input Monitoring**.

`src/edutictac/platform/macos-clicks.ts` inicia el listener solo cuando la
función está activa y autorizada, dirige cada clic al overlay del monitor y lo
detiene al desactivar o salir. `ClickEffects.tsx` mantiene como máximo seis
ripples temporales y elimina cada uno al concluir su animación. No existe
historial ni persistencia de eventos.

El script `scripts/build-click-observer.sh` genera un binario universal
arm64+x64 en macOS. En otras plataformas compila un stub para que los builds
continúen funcionando. El módulo `.node` se extrae de ASAR y
`electron-builder` no intenta reconstruirlo con otra versión de Python.

## Spotlight

`src/edutictac/spotlight/Spotlight.tsx` dibuja una máscara SVG dentro de cada
overlay. Ofrece círculo, elipse y rectángulo, dimensiones, suavizado y nivel de
oscurecimiento. Comparte el tracker del cursor y no captura la pantalla.

El atajo global `Command/Ctrl+Shift+L` congela la abertura en la última
posición. El bloqueo se conserva solo durante la sesión; forma y valores
visuales sí se guardan. Si el cursor visual permanece activo, su seguimiento
continúa sin mover el Spotlight bloqueado.

## Cambios de macOS

La aplicación empaquetada mantiene un icono en el Dock. Al activarlo vuelve a
mostrar y enfocar la toolbar, evitando que una ventana flotante cerrada o
oculta parezca irrecuperable.

Las compilaciones sin certificado conservan el fallback de firma ad hoc. El
Mac de pruebas dispone de una identidad Developer ID Application y los builds
firmados desde su sesión gráfica obtienen un Designated Requirement estable.
Esto permite que Screen Recording e Input Monitoring sobrevivan a futuras
recompilaciones firmadas con la misma identidad.

## Privacidad y permisos

Cursor Highlight y Spotlight solo procesan coordenadas en memoria. Click
Effects procesa tipo y posición del clic durante la animación. Ninguno envía
telemetría, registra historial ni almacena entrada. Las integraciones de IA
upstream permanecen intactas y sus claves siguen en Electron Safe Storage.

Los permisos macOS usados por el proyecto son:

- Screen Recording: solo para la función upstream de captura.
- Input Monitoring: solo para Click Effects.
- Accessibility: para shortcuts globales cuando macOS lo requiera.
- Llavero: para claves de proveedores de IA existentes en Lekhini.

Consulta [PRIVACY_EDUTICTAC.md](./PRIVACY_EDUTICTAC.md) para el detalle.

## Validación realizada

- `npm run typecheck` y `npm run prebuild` en Debian.
- Compilación universal y empaquetado arm64 en el Mac de pruebas.
- Firma profunda verificada con `codesign --verify --deep --strict`.
- Cursor Highlight y Click Effects comprobados manualmente en macOS.
- Captura upstream comprobada tras corregir permisos TCC.
- Persistencia de preferencias comprobada al cerrar y abrir la aplicación.

Spotlight requiere todavía una revisión visual manual en macOS, especialmente
con varios monitores y Retina. Windows, X11 y Wayland no se han probado aún en
hardware dentro de esta rama.
