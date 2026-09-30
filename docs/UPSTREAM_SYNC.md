# Sincronización con Lekhini upstream

Este fork deriva de [opensourcebharat/lekhini](https://github.com/opensourcebharat/lekhini), bajo licencia MIT. Conserva `LICENSE`, copyright y atribuciones. El commit de referencia de esta auditoría es `4c86796c57ecef9f4e45aca8c392f4f96b68576c`.

## Remotos y ramas

Configura `origin` como el repositorio del fork EduTicTac y `upstream` como el repositorio oficial. No cambies el remoto de un clon que todavía solo tenga `upstream` hasta conocer la URL publicada del fork:

```sh
git remote -v
git remote add upstream https://github.com/opensourcebharat/lekhini.git
# Configurar origin una vez creado el fork en GitHub:
git remote set-url origin https://github.com/ORGANIZACION/lekhini.git
git fetch upstream --prune
git fetch origin --prune
```

El repositorio observado solo ofrece `main`; no se deben asumir ramas de upstream adicionales. Mantén el modelo `upstream/main → main → develop → feature/*`: `main` refleja una base integrable y se reserva para releases; `develop` reúne cambios validados del fork; cada función/documento trabaja en una rama corta `feature/*` o `docs/*`. Integra primero upstream en `main`, valida, y después propaga a `develop`. Evita commits directos de funcionalidades en `main`.

## Revisar antes de integrar

1. Anota el commit de producción actual y consulta releases, changelog, CI y commits desde esa base.
2. Inspecciona el diff antes de tocar la rama local:

   ```sh
   git fetch upstream --prune
   git log --oneline --decorate HEAD..upstream/main
   git diff --stat HEAD...upstream/main
   git diff --name-status HEAD...upstream/main
   git diff HEAD...upstream/main -- src/main src/renderer src/shared package.json electron-builder.yml .github
   ```

3. Clasifica cambios upstream en arquitectura/IPC, ventanas y displays, dibujo, perfiles/persistencia, IA, permisos/captura, dependencias, workflows y packaging. Lee los commits completos que afecten nuestros puntos de extensión.
4. Ejecuta CI y validación de base antes de integrar. Identifica cambios al esquema persistido, shortcuts, permisos, APIs Electron y artefactos.
5. Solo entonces integra y valida de nuevo en macOS, Windows y Linux según la superficie tocada.

## Merge recomendado

Para un fork que mantiene ramas publicadas, el merge preserva claramente el historial y los commits de upstream. En una rama temporal actualizada desde `origin/main`:

```sh
git switch main
git fetch upstream --prune
git merge --no-ff upstream/main
# Resolver, revisar y validar
# Publicar al fork solo después de la validación:
git push origin main
```

Si hay conflictos, primero considera si el cambio EduTicTac puede moverse a un nuevo archivo en `src/edutictac/` y reducir la edición del archivo central. Resuelve con el comportamiento upstream como base, integra la extensión al punto más estrecho posible y revisa el archivo entero: un conflicto resuelto sin marcadores puede aun borrar lógica. Ejecuta `git diff --check`, revisa cada resolución y confirma que no se perdió IA, hotkeys, multi-monitor, permisos, perfiles o tools. No automatices resoluciones repetidas de archivos sensibles.

El rebase sirve para ramas privadas de feature cuando se desea una serie lineal y aún no se han compartido; no es el método recomendado para reescribir `main` o `develop` publicados. No mezcles merge y rebase sobre una misma rama publicada.

## Reducir divergencia

Intentamos mantener con cambios mínimos estos archivos upstream: `src/main/main.ts`, `hub.ts`, `preload.ts`, `persistence.ts`, `windows/overlay.ts`, `hotkeys.ts`, `src/renderer/overlay/App.tsx`, `src/renderer/toolbar/App.tsx`, `src/shared/types.ts` y `constants.ts`. Son puertas de entrada necesarias para estado, IPC y UI, así que no siempre podrán quedar intactos. Cada modificación debe enlazar una extensión EduTicTac aislada y evitar reformas cosméticas/refactors del resto.

El código propio se ubicará en `src/edutictac/`, empezando por `shared/`, `cursor/` y `platform/`. Las siguientes áreas candidatas son `clicks/`, `keystrokes/`, `spotlight/`, `magnifier/`, `teacher-mode/` y `presets/`. La documentación derivada del fork vive en `docs/`. No duplicar overlays, estado global, persistencia, shortcuts ni herramientas de dibujo existentes.

Mantener commits pequeños con prefijos convencionales (`feat(cursor):`, `fix(platform):`, `docs(upstream):`). Evitar mezclar actualización upstream con una función EduTicTac: una rama y merge para upstream, commits separados para la integración posterior. Conservar `package-lock.json` upstream salvo que una dependencia sea necesaria y esté justificada.

## Identidad de publicación

Antes de publicar instaladores del fork hay que revisar `productName`, `appId`, ubicación de datos de usuario, `publish` de electron-builder, URLs del updater, nombre de atajo y firma. El upstream configura GitHub Releases de Open Source Bharat; publicar sin ajustar el canal de actualizaciones expondría a instalaciones del fork a consumir releases upstream y a la inversa. Debe hacerse en un cambio aislado, preservando una ruta de migración de datos y atribuciones.
