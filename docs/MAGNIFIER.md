# Lupa EduTicTac: diseño de captura regional

## Objetivo

Mostrar una lente alrededor del cursor con zoom 1.5x, 2x, 3x o 4x, diámetro,
borde, sombra y opacidad configurables. La lente será pasiva
(`pointer-events: none`) y reutilizará los overlays multimonitor existentes.

La función requiere píxeles reales del escritorio. A diferencia de Cursor
Highlight y Spotlight, necesita permiso de captura y debe adquirir recursos
solo mientras esté activa.

## Decisión para macOS

Usar **ScreenCaptureKit** mediante un proveedor nativo pequeño. `SCStream` admite
una configuración con `sourceRect`; si no se especifica, captura el display
entero. La implementación debe fijar siempre una región y una resolución de
salida acotadas.

Diseño propuesto:

1. Seleccionar el `SCDisplay` que corresponde al display de Electron.
2. Crear un `SCContentFilter` para ese display, excluyendo las ventanas de
   Lekhini para impedir recursión visual.
3. Capturar un tile pequeño alrededor del cursor, no el monitor completo.
4. Entregar frames como buffers de píxeles al proceso principal y desde allí
   únicamente al overlay del monitor activo.
5. Recortar dentro del tile en el renderer. Actualizar `sourceRect` cuando el
   cursor se acerque al borde del tile, en vez de reconfigurar el stream en
   cada píxel recorrido.
6. Limitar inicialmente a 15 FPS, `queueDepth` bajo y procesar únicamente los
   frames completos;
   descartar frames atrasados.
7. Detener el stream, liberar buffers y limpiar la lente al desactivar.

Este enfoque mantiene el tráfico CPU/IPC limitado a una región pequeña. Apple
permite actualizar la configuración de un stream activo sin reiniciarlo.
`SCScreenshotManager` puede servir como fallback de baja frecuencia para una
captura individual, pero no es la primera opción para una lupa fluida.

Fuentes:

- [Apple: `SCStreamConfiguration.sourceRect`](https://developer.apple.com/documentation/screencapturekit/scstreamconfiguration/sourcerect)
- [Apple: captura de pantalla con ScreenCaptureKit](https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-in-macos)
- [Apple: `SCScreenshotManager`](https://developer.apple.com/documentation/screencapturekit/scscreenshotmanager)

## Por qué no usar `desktopCapturer` como motor principal

Electron devuelve fuentes de pantalla o ventana y thumbnails escalados. No
ofrece una API para pedir una región nativa alrededor del cursor, y tampoco
garantiza que el thumbnail tenga exactamente el tamaño solicitado. Capturar el
monitor completo para recortarlo en JavaScript aumentaría ancho de banda,
memoria y coste sin necesidad.

Fuente: [Electron `desktopCapturer`](https://www.electronjs.org/docs/latest/api/desktop-capturer/).

## Otras plataformas

| Plataforma | Proveedor recomendado | Estado |
| --- | --- | --- |
| Windows | Desktop Duplication o Windows Graphics Capture con recorte GPU y copia a CPU solo de la región | Diseño pendiente de adaptador |
| Linux X11 | `XShmGetImage` de una región pequeña | Diseño pendiente de adaptador |
| Linux Wayland | ScreenCast portal + PipeWire | Parcial: el portal captura una fuente consentida, pero no ofrece posición global universal para seguir el cursor |

En Wayland nativo la lupa debe marcarse como no disponible cuando no exista un
mecanismo fiable de posición. No se leerán dispositivos de entrada, no se
pedirá root y no se usará X11 como única ruta.

## Coordenadas y multimonitor

Electron expresa bounds y cursor en DIP; ScreenCaptureKit configura la región
en puntos lógicos y entrega buffers con resolución física. El adaptador debe
mantener ambas dimensiones explícitas:

- coordenadas globales DIP para seleccionar el display;
- coordenadas locales al display para `sourceRect`;
- dimensiones físicas del frame para Retina;
- tamaño CSS de la lente para presentar el zoom correcto.

Hay que probar monitores con escalas distintas, posiciones negativas,
movimiento entre displays y hotplug. Al cruzar de pantalla se destruye el
stream anterior y se crea uno para el nuevo `SCDisplay`.

## Permisos y privacidad

En macOS la primera activación usa Screen Recording. No se solicita al iniciar
la aplicación. Los frames viven en memoria, no se guardan, no se envían por red
y se descartan inmediatamente después de pintar. La función de captura de
Lekhini ya gestiona el panel del permiso; la lupa debe reutilizarlo.

## Fases de implementación

1. Proveedor ScreenCaptureKit con start/stop y exclusión de ventanas propias.
2. Adaptador principal que enlaza cursor, display y ciclo de vida.
3. Renderer de lente y ajustes persistentes.
4. Pruebas de coordenadas, Retina, permisos y liberación de recursos.
5. Proveedores Windows/X11 y documentación de Wayland.

## Proveedor implementado

`native/macos-magnifier/MagnifierCapture.swift` implementa el primer
incremento. Recibe display, rectángulo, resolución de salida y FPS; crea un
`SCStream` regional que excluye `org.opensourcebharat.lekhini`; y escribe
frames RGBA mediante un protocolo binario con cabecera y longitud. Mantiene
`queueDepth` en 2, no incluye cursor ni audio y libera el stream al recibir
SIGTERM/SIGINT.

`scripts/build-magnifier-provider.sh` genera un helper `.app` universal
arm64+x86_64 en macOS. Su identificador estable permite que TCC recuerde el
permiso Screen Recording del proveedor entre compilaciones. En otras
plataformas incluye un stub inactivo para conservar los builds existentes. El
bundle se empaqueta como `bin/Lekhini Magnifier.app`.

`src/edutictac/magnifier/controller.ts` inicia el proveedor solo cuando la lupa
está activa. Reutiliza el cursor y los overlays existentes, valida el framing
de stdout, reinicia el tile cuando el puntero se aproxima a un borde y detiene
el proceso al desactivar la función o cerrar Lekhini.

`src/edutictac/magnifier/Magnifier.tsx` recibe el tile únicamente en el overlay
del monitor activo, recorta la región bajo el puntero y dibuja la lente. Los
ajustes persistentes permiten elegir zoom, diámetro, color y grosor del borde,
y opacidad. La interfaz solo habilita la función si el proveedor regional está
disponible.

## Estado de validación

### Corrección de entrega de fotogramas (2026-10-01)

El helper usa ahora el bucle de AppKit, con una tarea asíncrona que conserva
el stream y los manejadores de señales hasta recibir SIGTERM/SIGINT. Se retira
la espera con una continuación descartada y el `dispatchMain()` dentro de
`async main`. Arrancar el proceso o recibir `startCapture` no demuestra que
estén llegando muestras: la verificación mide fotogramas recibidos por el
overlay y contenido dibujado en su canvas, sin guardar capturas.

También se corrige la comprobación de cobertura en las esquinas, que podía
reiniciar el helper en cada movimiento al exigir márgenes fuera del monitor.
El renderer repinta al montar el canvas y carga los píxeles solo cuando cambia
el fotograma, evitando repetir esa copia con cada evento del puntero.

Pruebas de geometría (Node 22.6+):
`node --experimental-strip-types --test src/edutictac/magnifier/geometry.test.mjs`.

Un rechazo TCC al ejecutar el helper desde SSH no prueba un rechazo al
ejecutarlo desde Lekhini. La validación debe hacerse dentro de la aplicación
firmada, con su contexto real de lanzamiento.

Verificación en la compilación firmada `56ff563`: 25 fotogramas recibidos en
la primera prueba de tres segundos sobre el monitor principal de 1920×1080,
canvas de lente presente, proceso auxiliar terminado al apagar y nuevos
fotogramas al reactivar. La firma profunda del paquete también pasa.

- Compilación y comprobación de tipos superadas en Linux.
- Proveedor universal y aplicación firmada compilados correctamente en macOS.
- Firma profunda de la aplicación y firma del proveedor verificadas.
- Captura regional y representación de la lente validadas visualmente en el
  Mac de pruebas.
- Pendiente ampliar la validación específica de Retina, cambio entre monitores
  y liberación de recursos durante sesiones prolongadas.
