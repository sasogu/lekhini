# Arquitectura de Lekhini y puntos de extensión de EduTicTac Presenter

Esta auditoría corresponde al upstream `opensourcebharat/lekhini`, rama `main`, revisado en el commit `4c86796c57ecef9f4e45aca8c392f4f96b68576c`. El objetivo es describir la implementación observada y proponer extensiones pequeñas; no anticipa comportamiento que aún no se haya implementado o probado.

## Arquitectura actual

Lekhini es una aplicación de escritorio Electron 32, TypeScript, Vite y SolidJS. Electron mantiene el proceso principal, los overlays, la barra y la ventana flyout. SolidJS representa la interfaz de la barra y los controles del overlay. Zustand vanilla guarda el estado efímero de dibujo por renderer. `electron-store` persiste preferencias en el proceso principal. Vite compila una entrada para el proceso principal, otra para preload y páginas independientes para overlay, toolbar y flyout. `electron-builder` genera DMG/ZIP para macOS, NSIS para Windows y AppImage para Linux. La CI existente hace typecheck en macOS, Windows y Ubuntu con Node 22; el workflow de release construye los tres sistemas.

La licencia es MIT. Deben mantenerse `LICENSE`, el aviso de copyright y las atribuciones de Open Source Bharat y los contribuidores de Lekhini. La integración de IA existente incluye Ollama local y proveedores cloud optativos, además de autocorrección, chat y RAG por perfil. Debe conservarse íntegra.

## Flujo principal

`src/main/main.ts` espera a `app.whenReady()`, inicializa persistencia, hidrata el hub, registra IPC para hub, overlays, permisos, captura, toolbar, flyout, IA y actualizaciones, crea un overlay por display y una toolbar, escucha cambios de pantallas y registra shortcuts. `src/main/hub.ts` es la autoridad de estado compartida: `patch()` valida/aplica cambios, persiste los campos correspondientes y difunde el snapshot a las ventanas suscritas. Los renderers llaman APIs expuestas con `contextBridge` por `src/main/preload.ts`; no acceden directamente a Node ni a `ipcRenderer`.

En cada overlay, `src/renderer/overlay/App.tsx` enlaza el pipeline de puntero, las capas canvas, la tienda Zustand, el estado central del hub y las acciones IPC. `CommittedLayer` vuelve a dibujar elementos persistidos por cambios; `LiveLayer` pinta el elemento en curso de inmediato. El pipeline de dibujo aprovecha `pointerrawupdate`/eventos coalescidos donde esté disponible y agrupa movimientos con `requestAnimationFrame`. La toolbar es una ventana Solid independiente. El flyout es otra ventana pequeña para que los menús no muevan la barra.

## Herramientas y perfiles

Las herramientas de anotación son estrategias tipadas en `src/renderer/overlay/tools/`, reunidas por `buildRegistry()` en `tools/registry.ts`. La interfaz `Tool` define `onDown`, `onMove` y `onUp`; `ToolContext` proporciona las operaciones de dibujo. Los tipos de elementos y ajustes compartidos viven en `src/shared/types.ts`. Los grupos y atajos visibles de herramientas se definen en `src/shared/toolGroups.ts`, `src/shared/constants.ts` y `src/renderer/toolbar/toolDefs.tsx`.

`src/shared/profiles.ts` define perfiles `general`, `teacher` y `trader`, que filtran la lista de herramientas y el prompt de IA. El perfil Teacher ya existe, pero no activa efectos de presentación ni guarda configuraciones completas de las funciones. `PersistedState` está definido en `src/main/persistence.ts`; `electron-store` realiza la persistencia y `hub.ts` hace la hidratación tolerante a campos antiguos. No hay un sistema genérico de presets importables/exportables.

## Ventanas, overlays y pantallas

`src/main/windows/overlay.ts` crea un `BrowserWindow` transparente, sin marco, siempre visible encima, sin foco y con click-through mediante `setIgnoreMouseEvents(true, { forward: true })`. Cada overlay ocupa los límites de un `Display` y carga el mismo documento renderer, con el ID del display como query. `syncOverlaysToDisplays()` actualiza bounds, crea overlays añadidos y cierra los retirados; `main.ts` escucha `display-added`, `display-removed` y `display-metrics-changed`.

En modo dibujo, el proceso principal desactiva click-through para que las herramientas reciban entrada. Esta infraestructura preserva la geometría por pantalla y el factor DPR; cualquier módulo EduTicTac debe reutilizarla. El overlay tiene canvas con DPR mínimo 2 para anotaciones. Hay que vigilar consumo de memoria si se agregan más superficies de resolución completa.

No se debe asumir que Electron puede posicionar libremente ventanas en Wayland: su documentación advierte que mover, posicionar, enfocar y redimensionar ventanas mediante `BrowserWindow` no es generalmente posible bajo Wayland. El overlay transparente sobre todas las ventanas, su orden z, pantalla completa, click-through y el posicionamiento de toolbar deben probarse por compositor. La configuración multi-display actual depende de esas capacidades del sistema.

## Shortcuts

`src/main/hotkeys.ts` registra shortcuts globales con `globalShortcut`. `HOTKEYS` reside en `src/shared/constants.ts`; hoy el toggle de dibujo se registra siempre y undo/redo/clear/captura/copia se registran según el modo de dibujo. Los callbacks localizan la pantalla bajo el cursor con `screen.getCursorScreenPoint()` y `getDisplayNearestPoint()` para enviar la acción al overlay adecuado. Electron devuelve un resultado booleano al registrar, que debe comprobarse para detectar colisiones; Lekhini actualmente registra los principales shortcuts sin exponer una configuración general editable.

En Wayland, `globalShortcut` y acceso al cursor/puntero global no pueden tratarse como equivalentes a X11. El portal GlobalShortcuts ofrece bindings concedidos por usuario y una API DBus diferente, que Electron 32 no expone a través de esta capa de `globalShortcut`. Habrá que ofrecer compatibilidad parcial o implementar integración DBus aislada, sin hooks de teclado inseguros.

## Captura y permisos

`src/main/capture.ts` usa `desktopCapturer.getSources()` y thumbnails para la captura explícita de screenshot/snip. La captura completa se solicita con tamaño del display multiplicado por su `scaleFactor`; las coordenadas del recorte vuelven al renderer para componer anotaciones. En Linux, los IDs de fuente pueden faltar y se intenta emparejar por orden. No se observa captura continua.

`src/main/permissions.ts` trata Screen Recording y Accessibility en macOS. En los demás sistemas los reporta como concedidos y permite que los portales medien al iniciar una captura. Accessibility se requiere hoy para que shortcuts funcionen mientras otra aplicación tiene foco en macOS. Un cursor visual que dependa de recibir el movimiento global puede necesitar permisos o APIs adicionales; la política correcta es solicitar acceso solo al activar la función y explicar el uso. Una ampliación que capture pantalla continuamente aumentaría tanto permisos como coste, por lo que debe quedar fuera de Cursor Highlight.

## Sistema operativo y empaquetado

- **macOS:** Electron empaqueta DMG y ZIP para arm64/x64. Screen Recording se usa actualmente para screenshot y Accessibility para shortcuts. ScreenCaptureKit es una API nativa de captura que puede evaluarse para una lupa recortada en el futuro; no forma parte de la implementación actual y no elimina el consentimiento de captura. La firma/notarización y los entitlements están en el builder y sus scripts.
- **Windows:** el target actual es NSIS x64/arm64. `globalShortcut` de Electron da el mecanismo de atajo global; captura usa `desktopCapturer`. Las APIs nativas de captura/acceso al puntero deben justificarse frente a Electron antes de sumar un módulo nativo.
- **Linux X11:** el target es AppImage x64/arm64. Electron puede ofrecer capacidades globales de ventanas y shortcuts dependientes de X11/entorno.
- **Linux Wayland:** Electron puede ejecutarse mediante XWayland, pero eso no concede visibilidad/input global del escritorio Wayland. ScreenCast de xdg-desktop-portal entrega streams PipeWire con consentimiento para compartir pantalla; es una base posible para magnifier, con coste y UX de consentimiento. No es un servicio general de lectura de teclado o puntero. GNOME, KDE Plasma y wlroots dependen de backend y versiones del portal; `xdg-desktop-portal-wlr` documenta backend específico wlroots. La guía específica `docs/LINUX_WAYLAND.md` queda pendiente para una fase posterior; hasta entonces, no afirmar soporte universal.

## Extensiones EduTicTac propuestas

Ubicación inicial, sin desplazar archivos upstream:

```text
src/edutictac/
  shared/       # tipos, defaults y validación pura de settings/presets
  cursor/       # estado, presentación del indicador y adaptadores de plataforma
  platform/     # capacidades/limitaciones detectadas por plataforma
```

Los módulos que se añadan después (`clicks/`, `keystrokes/`, `spotlight/`, `magnifier/`, `teacher-mode/`, `presets/`) deben seguir ese namespace. Las funciones visuales simples se pintarán en una capa overlay dedicada y pasiva, reutilizando cada ventana actual; no se crearán overlays duplicados por pantalla. La obtención de eventos globales, cuando la plataforma lo permita, irá detrás de un adaptador explícito y no dependerá de los eventos de dibujo: el overlay permanece click-through y, por tanto, no recibe de forma fiable el movimiento del puntero subyacente.

El estado persistente nuevo debe añadirse bajo una propiedad `edutictac` en `PersistedState`, con defaults y normalización propios. Las operaciones efímeras viajan por una interfaz EduTicTac estrecha del preload y el hub. Los perfiles existentes deben mantenerse como selección de herramientas/IA; Teacher Mode debe componerse como estado opcional, no redefinir `ProfileId` con semánticas incompatibles.

## Cursor Highlight: integración mínima propuesta

El indicador puede dibujarse en la ventana overlay que contiene el punto del cursor, por encima de las capas de anotación y debajo de controles interactivos, usando un canvas o elemento overlay propio con `pointer-events: none`. Conviene separar primero settings/defaults/renderizador bajo `src/edutictac/cursor/` y una interfaz `src/edutictac/platform/`; no leer ni almacenar pulsaciones ni capturar pantalla.

Si una API de plataforma proporciona posición global de cursor con eventos, se actualizará una coordenada compartida y se enviará solo al overlay correspondiente, con throttling/pintado por frame cuando haya movimiento. No se debe usar un `setInterval` rápido como sustituto sin medirlo. Hay que contemplar coordenadas virtuales negativas, escala/DPR y cambio de monitor; `screen.getDisplayNearestPoint` permite resolver el display desde el proceso principal, pero Electron `screen` no emite por sí solo cada movimiento global. La viabilidad cross-platform del proveedor es el riesgo principal.

### Archivos upstream que se modificarían para la primera implementación

Lista estimada tras el análisis, aún no aplicada:

1. `src/main/main.ts`: iniciar/parar adaptador y limpiar recursos con el ciclo de vida.
2. `src/main/hub.ts`: añadir y difundir estado EduTicTac mínimo.
3. `src/main/persistence.ts`: persistir configuración anidada con defaults/compatibilidad.
4. `src/main/preload.ts` y `src/shared/types.ts`: tipos y puente IPC acotado, validado.
5. `src/main/windows/overlay.ts`: informar al renderer del display/ajustar propagación de estado solo si el canal existente no basta.
6. `src/renderer/overlay/App.tsx` y `src/renderer/overlay/index.html`: montar la capa visual pasiva y recibir posición/configuración.
7. Posiblemente `src/main/hotkeys.ts` y `src/shared/constants.ts` para el toggle inicial, únicamente si se aprueba un shortcut nuevo tras revisar colisiones.
8. `src/renderer/toolbar/App.tsx` y sus estilos para activar y configurar el módulo desde Ajustes.

Archivos nuevos: `src/edutictac/cursor/*`, `src/edutictac/platform/*` y pruebas unitarias para normalización/coordenadas/proveedor. La cantidad exacta de archivos core puede reducirse si el estado se expone mediante un único namespace en un canal ya existente; hay que preservar el encapsulado del preload. No hay infraestructura pública de plugins que evite por completo estos puntos de conexión.

## Zonas que conviene mantener estables

Para facilitar merges, limitar conflictos en `src/main/main.ts`, `hub.ts`, `preload.ts`, `persistence.ts`, `windows/overlay.ts`, `renderer/overlay/App.tsx`, `renderer/toolbar/App.tsx`, `shared/types.ts` y `shared/constants.ts`: son puntos centrales y upstream probablemente los modifica. No reformatear ni reorganizar `src/main/ai/`, herramientas canvas, perfiles, workflows, scripts de release o builder sin una necesidad funcional. Mantener nombres y arquitectura de ventanas, capas, IPC, captura, IA y perfiles. No reescribir dependencias ni lockfile para cambios sin dependencias nuevas.

## Riesgos de compatibilidad upstream

- Los cambios en hub, IPC, preload y componentes raíz pueden coincidir con mejoras upstream; aislar tipos, defaults y lógica EduTicTac minimiza el tamaño de los conflictos.
- Los IDs de canales IPC y el estado serializable deben mantenerse versionados/tolerantes ante campos ausentes.
- El overlay por monitor está probado por el diseño para distintos bounds/DPR, pero la captura de eventos globales, escalado mixto y hotplug requerirán pruebas reales.
- Wayland limita posicionamiento y acceso global; un fallback XWayland no representa soporte nativo completo.
- `electron-builder.yml` publica actualizaciones desde `opensourcebharat/lekhini`. Antes de distribuir un fork hay que establecer identidad, repositorio/feed y firma propios para no compartir auto-updates o identidad de usuario. También requiere revisar appId, nombre de producto y rutas de datos con una migración deliberada.
- Agregar captura de pantalla para lupa puede implicar consentimiento persistente y un flujo por portal. No debe habilitarse al arrancar.
- El repo no declara actualmente un runner de tests ni lint. La fase de implementación debe definir tests acotados sin cambiar innecesariamente la CI existente.

## Orden recomendado

1. Mantener los documentos de arquitectura, upstream y límites Wayland actualizados.
2. Añadir modelos/defaults/validadores puros de EduTicTac bajo `src/edutictac/shared/`.
3. Probar viabilidad del proveedor de puntero por OS y compositor antes de UI o prometer soporte.
4. Implementar Cursor Highlight en el overlay existente, limitar IPC y consumo al estado activo y documentar fallbacks.
5. Solo después ampliar el bridge/settings y seguir por fases separadas para clics, keystrokes, spotlight y magnifier.
6. Componer Teacher Mode/presets sobre ajustes EduTicTac y el perfil upstream sin reemplazarlo.
7. Validar plataformas, packaging y privacidad antes de distribuir.
