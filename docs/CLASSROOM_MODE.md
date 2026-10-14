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
```

La prueba de GNOME aislada comprueba clics nativos en ambas barras,
entrada de texto, borrado completo y durante un trazo, confirmación de
limpieza, retorno al escritorio, fondos de pizarra, paleta táctil,
preferencia persistida y vuelta a la barra normal. La captura de revisión
contiene solamente la barra del entorno aislado.

## Siguientes fases

- Guardado y recuperación de pizarras editables.
- Entrada de varios contactos con trazos independientes.
- Distinción entre lápiz, dedo y palma según las capacidades del panel.
- Validación de GNOME con panel táctil físico, varios monitores y escalado.
