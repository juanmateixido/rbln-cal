# UI-01 — tema Rebelión v3

Implementación del 22/10/2026. Base `rbln` en `a1a7af6df9`, anclada a
`calcom/cal.diy` `54343aa685ae8f33159d2f485ec4a57bad5c574a`.
Rama `rbln-tema-v3-20261022`, worktree `/var/tmp/rbln-cal-tema-20261022`.
**PR solamente: producción no fue modificada.**

## Qué cambia

Un CSS global, importado después de los estilos Cal/COSS, fija el registro
oscuro en raíz y clases light/dark. Fondo `#0A0A12`, superficie `#1E1E29`,
línea decorativa `#2E2E34`, blanco y secundario `#A0A1A8`. CTA `#FF8FD0`,
hover `#F973C1`, activo `#EC5DB0`, texto `#050A17`. Lima `#DCFF6E` para foco.
`--rbln-brand: #FF007A` queda reservado para marca, sin aplicarlo a acciones.
Los campos usan bordes más claros para distinguir sus límites; los mensajes
semánticos conservan colores legibles también con la clase light de Cal.

Geist variable y Manrope 700 se cargan mediante `next/font/local`, conservando
`--font-sans` y `--font-cal`. Los encabezados y `.font-cal` usan peso 700.
Ambos binarios y licencias OFL son copias exactas del CRM aprobado; hashes en
[fonts.json](../evidence/UI-01/fonts.json). No se incorpora proveedor remoto.
El color de la barra del navegador también usa el fondo RBLN.

No se reescriben componentes ni se modifica lógica de autenticación/reservas.
Los cinco tokens de branding tienen `!important` porque Cal los escribe inline
por usuario: esta instancia usa una única marca. Foco, grilla y aviso móvil
requieren unas prioridades adicionales; son advertencias de Biome documentadas,
sin supresiones de reglas. El formateador compacta una lista ya existente del
layout; no cambia su comportamiento.

## Logo pendiente

Las dos ubicaciones solicitadas contienen distintivos Ironman, sin un vector
RBLN identificable. Se conserva Cal.diy en login/header. No se dibuja una marca
aproximada ni se reemplaza un logo mediante pseudo-elementos. Cuando esté el
vector oficial, el login tiene un h1 literal y el header usa `Logo`/`/api/logo`;
puede hacerse una sustitución pequeña y separada, con texto alternativo correcto.

## Verificación y capturas

[Giuli 390](../evidence/UI-01/giuli-390.png) ·
[Giuli 1440](../evidence/UI-01/giuli-1440.png) ·
[Login 390](../evidence/UI-01/login-390.png) ·
[Login 1440](../evidence/UI-01/login-1440.png) ·
[Foco 390](../evidence/UI-01/login-focus-390.png).

Son las páginas públicas reales, con el CSS final inyectado en Chromium
headless local y un shim de fuentes que sirve los mismos binarios. No son
capturas de un build o deploy. El hash del CSS está en
[verification.json](../evidence/UI-01/verification.json).

- 390 × 844 y 1440 × 900; preferencias light y dark: fuentes cargadas,
  encabezados 700, fondo exacto, CTA, prioridad sobre branding inline, foco por
  teclado y ausencia de desbordamiento horizontal comprobados con assertions.
- Sin errores JavaScript ni peticiones de escritura. El navegador bloquea todo
  método salvo GET/HEAD/OPTIONS, no usa cuentas y no conserva sesiones.
- Axe: cero violaciones detectadas de color-contrast. Reporta revisión manual
  pendiente en títulos del contenido difuminado de Giuli y el enlace de registro
  sobre la grilla. Los títulos son placeholders del estado vacío; el enlace
  blanco sobre fondo oscuro supera AA. No se afirma una auditoría AA completa.
- [Contrastes calculados](../evidence/UI-01/contrast.json): secundario/superficie
  6,41:1; CTA 9,50:1; hover 7,77:1; activo 6,36:1. Foco/superficie 14,59:1.
- [Mutación](../evidence/UI-01/mutation.json): un fondo blanco temporal hace
  fallar el test; fuente final restaurada.
- Biome 2.3.10 check de layout, globals, tema y runner: cero errores. Persisten
  advertencias de prioridad CSS justificadas y avisos del layout de upstream.
  `node --check rbln/theme/preview.cjs` pasa.
- `yarn type-check:ci --force` fue intentado: Yarn no encuentra el estado de
  node_modules. No se instaló ni compiló Cal en Bee. Tipos completos y build
  quedan para Actions; no se los declara aprobados.
- `/giuli` no ofrece enlaces públicos de eventos. No se publicó ninguno para
  obtener una captura. Queda comprobar booker con disponibilidad, selección de
  fecha/slot, formulario, error y confirmación en ensayo antes de producción.

Reproducir desde la raíz, con Playwright y Chromium ya instalados (el runner
acepta también un módulo/ejecutable local existente):

```bash
flock -n /tmp/bee-pesado.lock env \
  PLAYWRIGHT_MODULE=/ruta/node_modules/playwright-core \
  CHROMIUM_PATH=/ruta/chrome-headless-shell \
  AXE_PATH=/ruta/node_modules/axe-core/axe.min.js \
  node rbln/theme/preview.cjs
```

Un único proceso pesado en Bee. No ejecutar instalación/build del monorepo.

## Próximo deploy — preparado, no ejecutado

1. Revisar el draft, aprobarlo y mergearlo a `rbln`. La workflow `image.yml`
   puede probar esta rama por workflow_dispatch; no tiene deploy. Su push trigger
   solo escucha `rbln`, no esta rama. Un build de rama no sustituye al del SHA
   resultante del merge.
2. Esperar imágenes y smoke de Actions; comprobar también `RBLN quality`, que
   al completar imágenes ejecuta los tipos completos en la imagen de API.
   No asumir que una corrida pendiente o un tipo fallido es inocuo.
3. Registrar SHA completo y digest web de GHCR, además del digest anterior.
   Probar el nuevo digest en ensayo con su DB/Redis y el booker real. El tema
   solo afecta web: no requiere cambiar el servicio API ni migraciones nuevas.
4. Con aprobación de deploy, apuntar `cal-web` al digest inmutable aprobado y
   desplegar una vez según `deploy/railway.md`. Verificar salud, login, panel,
   Giuli, booker, fuentes sin Google y foco a 390/1440. No alterar SMTP,
   BOOKING_MODE, eventos ni credenciales como parte del tema.
5. Reversión: volver al digest web anterior. Para retirar el cambio del código,
   revertir el commit de UI-01 en otra rama y pasar por PR/build. No hay cambio
   de datos que restaurar. No usar latest ni empujar a upstream.

## Cierre del registro — preparado, no ejecutado

Opción sin rebuild: activar globalmente `disable-signup` en
`/settings/admin/flags`, con una cuenta ADMIN. El control usa la mutación interna
`viewer.admin.toggleFeatureFlag`, entrada `{ "slug": "disable-signup", "enabled": true }`.
Leer antes el valor y después confirmar el readback. No basta con asignarla a
un usuario/equipo. Si no existe la fila, la operación admin update no la crea;
un operador autorizado puede provisionarla por Prisma `feature.upsert`:

```js
await prisma.feature.upsert({
  where: { slug: "disable-signup" },
  create: { slug: "disable-signup", enabled: true },
  update: { enabled: true },
});
```

Esto es una mutación futura de producción; no fue ejecutada en esta tarea.
La ruta de registro y la API usan `FeaturesRepository` legacy con caché local
**hasta 5 minutos por proceso**. Esperar su vencimiento en todas las réplicas o
reiniciar web con el mismo digest para aplicar de inmediato, sin reconstruir.
El administrador invalida la caché nueva, no necesariamente la legacy.

Verificar anónimamente que GET `/signup` redirige al error de registro cerrado
y que POST `/api/auth/signup` con cuerpo vacío `{}` rechaza con 403 y mensaje
`Signup is disabled` (sin token y sin datos capaces de crear una cuenta).
No enviar un alta válida. Con flag global, la página bloquea incluso con token;
la API conserva bypass para token de invitación y valida el token después.
No presentar esto como revocación de invitaciones ni cierre de otros proveedores
OAuth; probar esas rutas por separado si llegan a habilitarse.

El enlace «Create account» del login depende solo de la variable pública: puede
seguir visible al activar la feature. Para ocultarlo también, se necesita
`NEXT_PUBLIC_DISABLE_SIGNUP=true` **durante next build** y coherencia en runtime.
El Dockerfile actual no expone ese ARG; poner solo la variable en Railway ni
pasar un build-arg ignorado no corrige el bundle. El ejecutor deberá preparar
un cambio separado en Dockerfile (ARG/ENV del builder y runtime), workflow
(build-args) y allowlist pública `PUBLIC_ARGS` de `deploy/check-public-image.py`,
además del flujo de configuración de `deploy/sync-vars.py`. Mantener la fuente
de configuración en Infisical `RBLN /cal`, reconstruir en Actions con un SHA
nuevo, verificar el valor incluido en el bundle y desplegar su digest. No
introducir secretos en argumentos de construcción. Esta configuración pública
no necesita pedir una clave a Juanma.

## Español — preparado, no ejecutado

- Usuarios existentes: Settings → General → Español. Automatización limitada
  al usuario autenticado: `viewer.me.updateProfile` con `{ "locale": "es" }`,
  o PATCH API v2 `/me`, versión `2024-06-11`, mismo campo. Leer `/me` antes y
  después; renovar la sesión para que su token tenga el locale actualizado.
- Eventos existentes: Advanced → idioma de interfaz Español; API v2
  PATCH `/event-types/<id>`, versión `2024-06-14`, `{ "interfaceLanguage": "es" }`.
  Enumerar IDs reales, aplicar solo ese campo y comprobar cada GET. No correr
  `scripts/rbln/configure.ts` entero: también cambia otras configuraciones.
- Para nuevos usuarios/eventos, establecer explícitamente `locale: "es"` e
  `interfaceLanguage: "es"` en el flujo autorizado de aprovisionamiento. No
  confiar en el navegador ni en la herencia de idioma del organizador.
- Login y listado anónimos negocian Accept-Language. Español para el perfil y
  evento no fuerza esas páginas en un navegador inglés. No hay una variable
  global encontrada para ello: imponer español a todos requeriría un parche
  de política de idioma separado, fuera de UI-01.

Todo lo anterior queda para el ejecutor: no se abrieron sesiones ni se leyeron
secretos ni se aplicaron flags, idiomas, settings o deploys en esta tarea.

## Mantenimiento

Riesgo bajo a moderado. En cada merge de upstream conservar la importación,
los dos loaders locales y este CSS. Revisar tokens Cal/COSS, nuevas clases
light/dark, `login-form`, slots COSS, `gridFade` y aviso de instalación móvil.
Estos selectores auxiliares son el punto más frágil. Repetir capturas y probar
booker/panel autenticado en ensayo; la inyección pública no prueba esas rutas.
La lista exacta de archivos está registrada en `PATCHES.md`.
