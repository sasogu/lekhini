# Linux: X11 y Wayland

## Estado de las extensiones EduTicTac

| Función | X11 | Wayland nativo | Motivo / fallback |
| --- | --- | --- | --- |
| Cursor Highlight | Compatible en diseño; pendiente de prueba real | No disponible | Electron 32 no expone una posición global fiable del cursor |
| Click Effects | Adaptador X11 pendiente | No disponible | Wayland no ofrece observación pasiva universal de clics globales |
| Spotlight | Compatible en diseño; pendiente de prueba real | No disponible | Comparte el proveedor de posición con Cursor Highlight |
| Captura upstream | Compatible | Mediada por portal | Electron usa PipeWire/ScreenCast portal según compositor |
| Shortcuts upstream | `globalShortcut` | Dependiente del entorno | El portal GlobalShortcuts requiere integración específica aún no implementada |

## Detección actual

`src/edutictac/platform/cursor-position.ts` desactiva las funciones que
requieren posición global cuando Electron usa Ozone Wayland o cuando la sesión
es Wayland con selección automática. La política es conservadora: evita
mostrar un foco inmóvil en `{0, 0}` y prometer soporte inexistente.

Una aplicación Electron ejecutada mediante XWayland puede usar el camino X11,
pero no debe inferirse únicamente desde `XDG_SESSION_TYPE`. GNOME, KDE Plasma y
compositores wlroots difieren en portales y capacidades disponibles.

## Portales

- `org.freedesktop.portal.ScreenCast` y PipeWire permiten captura con
  consentimiento del usuario. Son apropiados para una futura lupa, pero no
  proporcionan posición global del cursor.
- `org.freedesktop.portal.GlobalShortcuts` permite shortcuts aprobados por el
  usuario. Requiere un adaptador específico y detección de disponibilidad.
- `org.freedesktop.portal.InputCapture` controla sesiones explícitas de captura
  de entrada; no equivale a observar pasivamente clics en todo el escritorio y
  no se usará como atajo inseguro.

El fork no requiere root, no lee dispositivos `/dev/input` y no depende
exclusivamente de X11. Las funciones no disponibles deben aparecer como tales
en la interfaz.

## Validación pendiente

Probar por separado GNOME, KDE Plasma y un compositor wlroots; registrar
backend efectivo de Electron, versión de portal, escalado fraccional,
multimonitor y comportamiento de hotplug. No considerar una prueba bajo
XWayland como validación de Wayland nativo.

