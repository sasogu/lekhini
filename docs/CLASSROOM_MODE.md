# Aula táctil en Lekhini

Activa **Settings → EduTicTac / Aula → Aula táctil**, al principio de la
configuración. La elección se guarda y se recupera al abrir la aplicación.
**Barra normal** vuelve a la interfaz habitual. Se conserva la orientación
horizontal o vertical elegida y el monitor en el que está la barra.

## Uso

- **Escritorio** pausa el dibujo y quita el fondo de pizarra.
- **Escribir**, **Resaltar**, **Borrador**, **Mover**, **Texto** y **Flecha**
  seleccionan directamente la herramienta y activan el dibujo.
- **Deshacer** y **Rehacer** recuperan cambios del lienzo.
- **Limpiar** pide un segundo toque en **Confirmar**; la confirmación caduca
  a los cinco segundos. La limpieza puede deshacerse.
- **Pizarra** alterna entre fondo transparente, blanco y negro.
- **Captura** usa el guardado existente de capturas PNG con anotaciones.
- **Color y grosor** abre una paleta con botones de 44 píxeles.

Las herramientas principales tienen objetivos de al menos 56 píxeles,
etiquetas visibles y un estado explícito de dibujo/escritorio. El modo de
aula no activa por sí mismo observadores de teclado ni efectos docentes;
esos ajustes siguen disponibles en Configuración.

## Validación

```bash
npm run typecheck
npm run build:unpacked
dbus-run-session -- python3 scripts/test-gnome-controls.py
dbus-run-session -- python3 scripts/test-gnome-controls.py --capture
dbus-run-session -- python3 scripts/test-screenshot-portal.py
```

La prueba de GNOME aislada comprueba clics nativos en ambas barras,
entrada de texto, borrado completo y durante un trazo, confirmación de
limpieza, retorno al escritorio, fondos de pizarra, paleta táctil,
preferencia persistida y vuelta a la barra normal. La captura de revisión
contiene solamente la barra del entorno aislado.

## Estado al dejar el trabajo (2026-10-14)

El usuario ha confirmado dibujo, texto, limpieza y captura funcionando en
GNOME en el ThinkPad. La captura utiliza el portal Screenshot en Wayland,
conserva las anotaciones y los fondos, y respeta la carpeta de imágenes
configurada en el sistema. Captura guarda una imagen PNG; todavía no guarda
una pizarra editable. Se continúa sobre Lekhini, sin crear otra aplicación.

## Siguientes fases

Orden propuesto para retomar otro día:

1. **Pizarras editables:** guardar y abrir trazos, textos y fondo para continuar
   trabajando; mantener la captura PNG como exportación.
2. **Autoguardado y recuperación:** recuperar la última pizarra al cerrar la
   aplicación o tras un fallo.
3. **Multitáctil:** gestionar varios contactos con trazos independientes.
4. **Lápiz, dedo y palma:** distinguir herramientas y evitar marcas de la palma
   según las capacidades reales del panel.
5. **Validación física:** comprobar GNOME con panel táctil, varios monitores y
   escalado. Revisar también la posición de la barra al cambiar de orientación:
   las pruebas aisladas han mostrado fallos intermitentes.

El siguiente trabajo recomendado es el guardado editable y la recuperación.
Estas fases están pendientes; no se han implementado en esta sesión.
