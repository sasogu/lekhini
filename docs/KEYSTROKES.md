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

- El proveedor funcional inicial es macOS.
- No representa teclas que no estén en el mapa físico conocido.
- La distribución visible usa nombres y símbolos de macOS; no intenta inferir
  el carácter producido por la distribución de teclado del usuario.
