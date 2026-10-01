# Desarrollo y firma en macOS

## Paquete de pruebas

El paquete local se genera en `release/mac-arm64/Lekhini.app`. El build normal
ejecuta `prebuild`, compila el addon de clics como universal arm64+x64,
empaqueta Electron y firma el resultado.

```sh
npm install
npm run build:unpacked
```

## Firma

`scripts/adhocSign.cjs` aplica una firma ad hoc como respaldo cuando no hay
certificado. Esta firma cambia de requisito al cambiar el contenido del bundle;
macOS puede invalidar entonces permisos TCC concedidos a una compilación
anterior.

Para builds estables debe usarse Developer ID Application. La identidad está
en el llavero de la sesión gráfica del Mac y puede no ser visible desde SSH.
Ejecutar el build desde una Terminal gráfica. `electron-builder` selecciona
automáticamente una identidad válida; si se usa `CSC_NAME`, proporcionar el
nombre sin el prefijo `Developer ID Application:`.

La primera firma puede pedir que `codesign` acceda a la clave privada del
Llavero. Elegir **Permitir siempre** evita repetir el diálogo. Nunca exportar,
copiar ni registrar en el repositorio la clave privada, contraseñas, hashes de
certificado o credenciales de notarización.

Verificación recomendada:

```sh
codesign --verify --deep --strict --verbose=2 release/mac-arm64/Lekhini.app
codesign -dv --verbose=2 release/mac-arm64/Lekhini.app
codesign -d -r- release/mac-arm64/Lekhini.app
```

El requisito debe contener el identificador `org.opensourcebharat.lekhini`,
la cadena Apple y el Team ID; no debe consistir en un `cdhash` ad hoc.

## Permisos TCC

Con Developer ID estable, las reconstrucciones firmadas con la misma identidad
deben conservar permisos. Al cambiar desde firma ad hoc a Developer ID hay que
concederlos una última vez. Si una build ad hoc anterior deja entradas
incompatibles, cerrar Lekhini y restablecer únicamente sus servicios:

```sh
tccutil reset ScreenCapture org.opensourcebharat.lekhini
tccutil reset ListenEvent org.opensourcebharat.lekhini
```

Después, abrir el paquete nuevo y autorizar Grabación de pantalla y
Monitorización de entrada. No reconstruir entre la autorización y la prueba.

## Dock y cierre

Al añadir, retirar o cambiar la configuración de un monitor, el adaptador
`src/edutictac/platform/display-recovery.ts` recoloca la barra en la pantalla
principal y limita sus dimensiones al área útil. Cierra los menús flotantes,
pero conserva el panel de ajustes abierto. Esto evita que los controles queden
fuera de pantalla al sustituir el monitor principal por uno más pequeño.

Verificado en `56ff563`: una barra colocada en (-6000, -3000), con tamaño
1800×1500 y ajustes abiertos, se recupera dentro del área útil 1920×965 del
principal tras el evento de cambio de monitor. No se modificó la configuración
real de pantallas para esta prueba.

Lekhini muestra su icono en el Dock en builds empaquetados. El evento
`activate` muestra y enfoca la toolbar existente o la crea de nuevo si ya no
existe. El botón rojo oculta la toolbar y conserva la aplicación y el icono de
menú activos; al pulsarlo en el Dock o usar «Mostrar barra» se recupera. La
opción «Salir de Lekhini» del menú termina la aplicación.

La aplicación también mantiene un icono en la barra de menús mientras está
abierta. Desde él se puede mostrar o recuperar la barra en la pantalla
del puntero, abrir los ajustes completos, alternar las funciones de presentación
y activar herramientas de anotación. La recuperación coloca la toolbar a
64 píxeles del borde izquierdo del área útil para hacerla más visible. «Salir
de Lekhini» termina la aplicación; cerrar la toolbar conserva el icono para
poder volver a mostrarla.

## Pantallas conectadas mediante DisplayLink

Si la barra se ve en un monitor pero desaparece al arrastrarla a otro, revisar
si está activo DisplayLink Manager. Su salida usa captura de pantalla incluso
cuando se mira directamente el monitor físico. La protección de captura de
las ventanas de controles puede impedir que DisplayLink las muestre.

En el menú superior de Lekhini, activar **Compatibilidad DisplayLink
(controles visibles en capturas)**. Se guarda en la configuración existente
como `edutictacDisplayLinkCompatibility`, se aplica inmediatamente a la barra
y sus menús flotantes, y se conserva tras reiniciar. Por defecto está
desactivada. Con esta opción, los controles también pueden aparecer en las
capturas, videoconferencias y grabaciones; se pueden ocultar con el botón rojo.

Diagnóstico comprobado el 1 de octubre de 2026: Mac M1 con DELL S2719DC y
Samsung SMEX2220, DisplayLink Manager activo. Electron y Quartz informaban de
una barra visible dentro del Samsung, y su renderer dibujaba correctamente.
Cambiar coordenadas, prioridad o escritorio no resolvía el problema. Al
desactivar `setContentProtection` sin moverla, el usuario confirmó que aparecía
en Samsung y que podía arrastrarla entre ambos monitores. No atribuir este
síntoma solamente a coordenadas o a la pantalla principal.

Referencias: [DisplayLink y permisos de captura](https://support.displaylink.com/knowledgebase/articles/2008685-macos-screen-recording-permission),
[Electron: protección de contenido](https://www.electronjs.org/docs/latest/api/browser-window#winsetcontentprotectionenable-macos-windows).

## Notarización

Una firma Developer ID válida no implica que el paquete esté notarizado. El
build local puede indicar que omitió notarización si no están configuradas las
credenciales de Apple. La notarización debe resolverse antes de distribuir un
DMG a terceros; no es necesaria para validar localmente Spotlight, Cursor o
Click Effects.
