# Lekhini en GNOME Wayland

En GNOME Wayland, ejecutar Electron mediante XWayland no permite seguir el
ratón por todo el escritorio: XWayland solo recibe su movimiento sobre
superficies X11. La prueba en el ThinkPad con Debian 13 y GNOME 48.7 confirmó
que el círculo seguía al ratón sobre Lekhini y dejaba de actualizarse al salir
de la aplicación, incluso en la misma pantalla.

La extensión **Lekhini Pointer Bridge** proporciona la posición lógica del
ratón desde GNOME Shell. Lekhini conserva sus overlays y envía el círculo al
monitor correspondiente. El puente no lee teclas, no captura pantallas y no
conserva un historial; devuelve una posición solo cuando un cliente la pide.
En la pantalla bloqueada no proporciona coordenadas.

## Instalación para GNOME 48

Desde el repositorio:

```sh
mkdir -p ~/.local/share/gnome-shell/extensions/lekhini-pointer@edutictac.es
cp native/gnome-pointer/extension/* ~/.local/share/gnome-shell/extensions/lekhini-pointer@edutictac.es/
```

En la versión empaquetada, los mismos archivos están en
`resources/gnome-pointer-extension/`. El cliente está en
`resources/bin/gnome-pointer-client.js`; requiere `gjs` y `gdbus` en el sistema.

Después de instalar una extensión nueva, cerrar sesión y volver a entrar
para que GNOME la descubra. Activar con:

```sh
gnome-extensions enable lekhini-pointer@edutictac.es
```

Abrir Lekhini mediante XWayland (`--ozone-platform=x11`). Si la extensión se
activa después de abrir la app, reiniciar Lekhini. Sin el puente, las ayudas
que requieren posición global se marcan como no disponibles en Wayland.
Una sesión X11 sigue utilizando la API de Electron; macOS conserva su
observador nativo.

El cliente de posición se ejecuta solo mientras cursor, Spotlight o efectos
de clic necesitan observar el ratón. Un único proceso GJS compartido consulta a GNOME
de forma asíncrona cada 8 ms, con una sola petición en curso, y publica
únicamente cambios. Solo pide el estado de botones cuando Click effects está
activado; con solo el círculo activo no consulta botones. Al apagar las ayudas o salir de la app
se detiene. Si desaparece el puente, oculta la ayuda y detiene el seguimiento
sin recurrir a coordenadas parciales de XWayland.

## Verificación del 2026-10-13

- Typecheck y compilación Linux completa correctos.
- Extensión cargada en GNOME Shell 48.7 en una sesión Wayland headless aislada:
  el método D-Bus y el cliente GJS entregan la misma posición.
- Al desactivar la extensión, el cliente se detiene y el objeto D-Bus deja de
  estar disponible.
- El usuario confirmó el círculo funcionando en el escritorio real después
  de cargar la extensión en el ThinkPad; percibe un ligero retraso al moverse.

## Efectos de clic (versión 2)

La versión 2 del puente añade `GetState`, que proporciona solo los botones
izquierdo, central y derecho, sin modificadores de teclado. El cliente detecta
cada transición de suelto a pulsado y reutiliza los efectos visuales existentes
de Lekhini en el monitor correspondiente. Una pulsación mantenida no produce
repeticiones. Al iniciar con un botón ya pulsado o reanudar después del bloqueo
no se inventa un clic. Como se consulta estado, una pulsación completa de menos
de 8 ms puede quedar entre dos muestras y no producir un efecto.

GNOME 48 nativo intercambia los bits de los botones central y derecho en su
[`maskmap`](https://raw.githubusercontent.com/GNOME/mutter/gnome-48/src/backends/native/meta-seat-impl.c).
El puente normaliza explícitamente los bits a 1=izquierdo, 2=central y 4=derecho.
Esto se comprobó con un dispositivo virtual dentro del compositor de prueba.

Una extensión de versión 1 sigue proporcionando el círculo a la aplicación
nueva, pero no los clics. Tras actualizar la extensión, cerrar sesión y volver
a entrar para cargar la versión 2. Activar **EduTicTac / Click effects → On**;
puede incluirse también en Teacher Mode. La visualización de atajos dispone
de un [observador Linux autorizado mediante Polkit](./KEYSTROKES.md#gnome--linux).

## Spotlight y zoom del escritorio (versión 3)

Para instalar o actualizar el directorio completo del puente desde el
repositorio, ejecutar `bash scripts/install-gnome-bridge.sh` en la sesión
gráfica. El paquete portátil Linux incluye el mismo script como
`install-gnome-bridge.sh`, junto con `launch.sh` y `LEEME-GNOME.txt`.

Spotlight reutiliza el puente de posición: la abertura sigue al ratón sobre
aplicaciones nativas, permite bloquearse con el botón de la barra y se
desactiva junto con Teacher Mode. El efecto se pinta en el monitor del cursor.
Los atajos globales de Electron sobre superficies Wayland requieren todavía
su validación independiente; el bloqueo por botón está probado.

La versión 3 añade **Desktop zoom** en la barra y en la composición de Teacher
Mode. Controla el ampliador nativo de GNOME con niveles 1.5x, 2x, 3x y 4x, usando
las preferencias de posición, seguimiento y filtros configuradas en GNOME.
No cambia el diámetro, borde ni opacidad de la lente macOS: esos controles
solo se muestran en macOS. En GNOME se utiliza el zoom del escritorio y no
se transfieren ni guardan fotogramas en Lekhini.

`SetMagnifier` mantiene una sesión exclusiva asociada al cliente D-Bus. Guarda
el estado anterior de activación y ampliación y lo restaura al apagar,
desconectar el cliente, bloquear la sesión o desactivar la extensión. Si el
usuario cambió un valor mediante GNOME mientras Lekhini estaba activo, ese
valor nuevo se conserva. Un zoom de accesibilidad que ya estuviera activo
permanece activo al salir de Lekhini.

El helper `gnome-magnifier-client.js` recibe configuración por stdin; cuando
Electron termina, EOF cierra la conexión D-Bus y GNOME libera la sesión aunque
Electron no haya completado su cierre normal. Con solo Desktop zoom activo no
se inicia el seguimiento GJS del cursor: el ampliador nativo hace su propio
seguimiento.

Tras instalar el puente v3 hay que cerrar sesión y volver a entrar para que
GNOME cargue los métodos nuevos. La app sigue admitiendo círculo con v1 y
clics con v2, y marca el zoom como no disponible hasta cargar v3.

Pruebas adicionales:

```sh
node --test native/gnome-pointer/buttons.test.mjs native/gnome-pointer/zoom-lease.test.mjs
dbus-run-session -- python3 native/gnome-pointer/test-headless.py --app
```

La prueba usa un GNOME 48.7 y Electron aislados con configuración temporal.
Comprueba el actor del ampliador nativo, zoom 2x/4x, exclusividad y restauración
tras EOF y terminación abrupta. Dentro de Electron comprueba la abertura SVG
de Spotlight tras mover el ratón virtual, bloquear, desbloquear y apagar; y
la activación/desactivación conjunta de Spotlight y Desktop zoom en Teacher
Mode. Las pruebas no modifican la sesión ni las preferencias del escritorio
actual. Pendiente de comprobar estas funciones en las tres pantallas físicas
del ThinkPad, que estaba desconectado durante esta implementación.

Pruebas del 2026-10-13:

- El usuario confirma el círculo global en el escritorio real del ThinkPad.
- Cuatro pruebas de transiciones de botones, pulsación mantenida y reanudación:
  `node --test native/gnome-pointer/buttons.test.mjs`.
- Prueba de botones virtuales con GNOME Shell 48.7 real en sesión aislada:
  `dbus-run-session -- python3 native/gnome-pointer/test-headless.py`.
  Izquierdo, central y derecho llegan sin duplicados; desactivar la extensión
  elimina el objeto D-Bus y detiene el cliente. La inyección de pruebas se
  añade únicamente a una copia temporal y nunca al puente instalado.
- Typecheck y empaquetado Linux correctos. Pendiente de validación visual de
  los clics en el escritorio real tras cargar la extensión actualizada.
