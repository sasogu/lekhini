# Privacidad de las extensiones EduTicTac

Las extensiones EduTicTac funcionan localmente. No añaden telemetría, cuentas,
servicios remotos ni envío de datos. No eliminan ni alteran las integraciones
online e IA que ya ofrece Lekhini.

## Datos tratados

| Función | Datos temporales | Persistencia | Red |
| --- | --- | --- | --- |
| Cursor Highlight | Coordenada actual del puntero | Solo ajustes visuales | Ninguna |
| Click Effects | Botón y coordenada del último clic durante la animación | Solo ajustes visuales | Ninguna |
| Spotlight | Coordenada actual o bloqueada | Ajustes visuales; la posición bloqueada no se guarda | Ninguna |
| Magnifier | Frames de una región pequeña mientras esté activa | Ajustes visuales | Ninguna |

Click Effects no escucha teclas, no guarda eventos y no modifica ni impide el
clic original. Las capas del renderer usan `pointer-events: none`.

## Permisos

- Cursor Highlight y Spotlight no solicitan permisos propios.
- Click Effects solicita Input Monitoring en macOS al activarlo por primera
  vez. Su event tap incluye exclusivamente botones del ratón.
- Screen Recording pertenece a la captura de pantalla existente de Lekhini;
  Spotlight no utiliza ese permiso.
- Las claves de IA upstream permanecen cifradas mediante Electron Safe
  Storage y pueden provocar un diálogo del Llavero. Las extensiones EduTicTac
  no leen esas claves.

## Captura y memoria

Spotlight oscurece mediante una máscara SVG; no obtiene píxeles del escritorio.
Cursor Highlight consulta la posición global disponible en Electron. Los clics
se descartan al terminar su animación. Al desactivar una función se detienen
sus timers o listeners y se eliminan sus elementos visuales.
