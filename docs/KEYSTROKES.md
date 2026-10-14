# Keystrokes EduTicTac

## Comportamiento

Keystrokes muestra temporalmente combinaciones como `⌘C`, `⌘⇧4`, `⌥Tab` y
teclas especiales. La opción predeterminada y recomendada es **Only
shortcuts**: sin modificadores, únicamente aparecen teclas especiales como
Escape, Tab, Return, flechas y teclas de función.

La posición, tamaño de texto, fondo, opacidad, duración y número máximo de
combinaciones visibles son configurables. Los eventos se envían únicamente al
overlay del monitor donde se encuentra el puntero.

## Privacidad

El observador nativo de macOS nunca llama a una API de conversión de teclas a
texto. Solo entrega el código físico de una pulsación y las banderas de
modificadores. La aplicación:

- no reconstruye palabras ni secuencias escritas;
- no guarda eventos ni mantiene historial;
- no envía pulsaciones por red;
- descarta cada combinación cuando termina su animación;
- inicia el observador solo mientras la función está activa.

Desactivar **Only shortcuts** permite representar las teclas físicas
compatibles de forma individual y temporal. No cambia las garantías de
almacenamiento y red, aunque el modo recomendado reduce al mínimo la
información observada y mostrada.

## macOS

`native/macos-shortcut-observer` usa un `CGEventTap` pasivo y de solo escucha.
Requiere Input Monitoring, el mismo permiso utilizado por Click Effects. La
solicitud se realiza al activar Keystrokes por primera vez y el panel de
configuración ofrece acceso directo a los ajustes de privacidad de macOS.

El addon se compila para arm64 y x86_64 durante `prebuild`. En plataformas no
compatibles se construye un stub inactivo para mantener los builds actuales.

## Limitaciones actuales

- Hay proveedores para macOS y Linux/GNOME; Linux requiere instalar el observador nativo.
- No representa teclas que no estén en el mapa físico conocido.
- La distribución visible usa nombres y símbolos de macOS; no intenta inferir
  el carácter producido por la distribución de teclado del usuario.

## GNOME / Linux

La integración de la aplicación requiere GNOME Wayland y su puente de
posición activo, que permite suspender el observador al bloquear la sesión.

El monitor de teclado de Mutter 48 está restringido a su cliente de
accesibilidad, y los eventos de Clutter filtrados por el compositor no
alcanzan una extensión al escribir en aplicaciones Wayland. El adaptador
Linux usa un observador pequeño de eventos físicos de teclado, autorizado
mediante Polkit. No registra aceleradores que consuman `Ctrl+C`, no reinyecta
eventos y no modifica su entrega a las aplicaciones. Véanse el
[control de acceso del monitor de Mutter 48](https://raw.githubusercontent.com/GNOME/mutter/48.7/src/backends/meta-a11y-manager.c)
y su [filtrado de eventos](https://raw.githubusercontent.com/GNOME/mutter/48.7/src/core/events.c).

Instalación desde el repositorio:

```sh
npm run build:linux-shortcut-observer
bash scripts/install-linux-shortcut-observer.sh
```

La compilación requiere C++17 y las cabeceras de libsystemd
(`g++` y `libsystemd-dev` en Debian). El binario usa libsystemd del sistema.

El instalador copia el ejecutable a
`/opt/lekhini-shortcuts/bin/shortcut-observer` con propietario root y permisos
755, y una acción Polkit específica con autorización administrativa para el
usuario local activo. No cambia grupos ni permisos de los dispositivos de
entrada. El paquete Linux incluye binario y política en
`resources/linux-shortcuts/`.

Al activar **Keystrokes**, GNOME pide autorización para esta sesión de la
aplicación. Hasta recibir `READY 1`, no se activa la observación. La misma
autorización se reutiliza al apagar y encender la función mientras Lekhini
sigue abierta, pero apagarla envía `PAUSE`: se cierran todos los teclados y
el proceso queda dormido esperando una orden. Cerrar la app cierra stdin y
termina el observador; funciona también si la app termina inesperadamente.
GNOME bloqueado o sin posición global provoca también `PAUSE`.
El observador comprueba además que el usuario autorizado sigue siendo el
usuario activo de `seat0`; al cambiar de usuario o consola cierra los teclados.

El observador abre exclusivamente dispositivos de teclado en modo de solo
lectura, sin un grab exclusivo. Filtra antes de escribir stdout: solo salen
etiquetas físicas como `Ctrl+C`, `Ctrl+Shift+V`, `Alt+Tab` y teclas especiales.
Descarta escritura ordinaria, Shift con letras y AltGr; no convierte las
teclas usando la distribución, no compone palabras, no guarda eventos y no
envía nada por red. El filtro vuelve a validarse en Electron. **Only
shortcuts** es obligatorio en Linux y la función arranca apagada.

Se reconoce teclado nuevo y desconexión, se conserva el estado de
modificadores por dispositivo y se resincroniza tras `SYN_DROPPED`. La
posición del puente GNOME dirige la etiqueta al monitor del puntero, incluso
si el círculo está apagado. Teacher Mode comprueba la autorización antes de
activarse con Keystrokes incluido.

Las etiquetas de letras y números siguen posiciones físicas QWERTY. No
representan necesariamente el carácter de una distribución remapeada.

Verificación:

```sh
native/linux-shortcuts/build/shortcut-observer --self-test
node --experimental-strip-types --test src/edutictac/keystrokes/linux-observer.test.mjs
```

Las pruebas usan entradas ficticias y cubren filtrado, autorización pendiente
y cancelada, pausa y cierre. `--probe` abre y cierra teclados para comprobar
disponibilidad sin leer pulsaciones. La prueba interactiva global requiere
activar la función y autorizar desde la sesión gráfica, no desde SSH.

## Validación

La representación de combinaciones, el filtro **Only shortcuts** y la
integración con Input Monitoring se han validado en el Mac de pruebas con una
compilación firmada.
