# Click Effects: viabilidad y diseño

## Estado de implementación

El primer incremento prioriza macOS. `src/edutictac/platform/macos-clicks.ts` conecta un módulo nativo pequeño con el hub y reutiliza los overlays existentes; `src/edutictac/clicks/ClickEffects.tsx` dibuja los ripples. La preferencia queda en `edutictacClicks`. El addon escucha únicamente mouse-down izquierdo, derecho y central mediante un event tap `listenOnly`, devuelve cada evento original sin alterarlo y no declara ni selecciona eventos de teclado.

La compilación TypeScript y el build Linux pasan; el addon nativo también se compiló en el Mac y el usuario confirmó que el ripple funciona tras conceder Input Monitoring. Aún falta validar varios monitores y Retina. Windows y X11 están pendientes; Wayland no ofrece una API pasiva universal y queda no disponible.

## Qué falta

Electron no ofrece un evento global de botón del ratón. La opción `forward` de `BrowserWindow.setIgnoreMouseEvents()` solo reenvía movimiento a Chromium; el clic atraviesa la ventana y llega a la aplicación inferior, como debe hacer el overlay actual. Por tanto, no se puede generar una animación global conectando `pointerdown` al canvas existente.

## Proveedores posibles

| Plataforma | Fuente de eventos | Permiso / límite | Decisión |
| --- | --- | --- | --- |
| macOS | `CGEventTap` en modo `listenOnly`, con máscara solo para mouse-down | Input Monitoring; comprobar/explicar al activar. No instalar tap que pueda modificar eventos | Adaptador nativo pequeño; nunca incluir máscaras de teclado |
| Windows | Hook `WH_MOUSE_LL`; callback rápido y siempre `CallNextHookEx` | Sin permiso de usuario específico en el caso normal. No devolver un valor que suprima el evento | Adaptador nativo pequeño; solo down izquierdo/derecho/central |
| Linux/X11 | X RECORD para eventos de botón | Requiere sesión X11 y servidor/extensión disponible; eventos de dispositivos apuntadores | Adaptador X11; si falta RECORD, marcar no disponible |
| Linux/Wayland | No hay API general para observar clics de otras superficies | InputCapture usa zonas/barreras para capturar entrada y puede dirigir eventos a la app; no es un monitor pasivo de clics | No soportar globalmente en esta fase; no activar InputCapture para simular un listener |

## Dependencia descartada para el primer MVP

`uiohook-napi` publica eventos globales de mouse y teclado desde el mismo hook. No usarlo en el primer MVP: no hemos verificado que pueda desactivar totalmente la observación nativa del teclado al pedir solo eventos de mouse. Además, existe un informe de crash al iniciarlo en Electron/macOS cuando falta Accesibilidad. Implementar adaptadores acotados que pidan solo los eventos necesarios reduce permisos y evita introducir comportamiento de keylogger.

## Diseño del módulo

La animación es un consumidor sin permisos: recibe `{button, x, y, id}` ya normalizado, selecciona el overlay correspondiente por pantalla y dibuja un ripple en una capa propia con `pointer-events: none`. El hook emite únicamente al pulsar, no registra historial y no guarda coordenadas. No llama APIs de síntesis de entrada ni altera eventos. Las preferencias se guardan bajo `edutictacClicks`.

La activación debe ser explícita y bajo demanda. Iniciar el proveedor al activar Click Effects; detenerlo y liberar recursos al desactivar/cerrar. En macOS consultar el estado de Input Monitoring y mostrar instrucciones del sistema únicamente al activar; no pedir permiso durante el inicio general de la app. En Windows y X11 comprobar resultado de instalación/inicio y mostrar estado no disponible cuando falla.

## Orden de implementación

1. Validar coordenadas en Retina y en una configuración con varios monitores; el punto Quartz debe coincidir con las coordenadas DIP de Electron.
2. Añadir prueba unitaria de normalización y preferencias, y ajustar detalles visuales según la prueba en pantalla.
3. Adaptador Windows `WH_MOUSE_LL` que siempre reenvíe el evento.
4. Adaptador X11 X RECORD, condicionado a disponibilidad; Wayland queda expresamente no disponible.

El addon macOS se compila como binario universal durante `prebuild` y se incluye fuera de ASAR; electron-builder no rehace dependencias nativas en Python del sistema. No añadir un addon Node que incluya captura de teclado ni arrancar helpers privilegiados.

## Fuentes técnicas

- [Electron: ventanas click-through y forwarding](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions): `forward` reenvía movimiento en macOS/Windows.
- [Apple: `CGEventTapCreate`](https://developer.apple.com/documentation/coregraphics/cgevent/tapcreate%28tap%3Aplace%3Aoptions%3Aeventsofinterest%3Acallback%3Auserinfo%3A): permite un tap listen-only con una máscara acotada; el permiso de Input Monitoring aplica al monitoreo de eventos.
- [Apple: `IOHIDRequestAccess`](https://developer.apple.com/documentation/iokit/3181574-iohidrequestaccess): solicita Input Monitoring y registra la app para que se pueda autorizar en Ajustes del Sistema.
- [Apple WWDC: privacidad de eventos](https://developer.apple.com/videos/play/wwdc2019/701/): describe la autorización para taps de escucha frente a taps que modifican eventos.
- [Microsoft: `LowLevelMouseProc`](https://learn.microsoft.com/en-us/windows/win32/winmsg/lowlevelmouseproc): detalla botones mouse-down y recomienda pasar eventos sin procesar con `CallNextHookEx`.
- [X.Org: X Record Extension](https://www.x.org/docs/Xext/record.pdf): protocolo para registrar eventos del servidor X, incluidos eventos de botones.
- [XDG Portal InputCapture](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.InputCapture.html): captura activada por barreras con control del compositor; no es una API de observación pasiva.
- [uiohook-napi](https://github.com/SnosMe/uiohook-napi): API combinada de keyboard/mouse; [incidencia de Electron/macOS sin permiso](https://github.com/SnosMe/uiohook-napi/issues/24).
