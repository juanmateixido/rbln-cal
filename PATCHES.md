# RBLN Agenda: ancla y parches

Ancla: `calcom/cal.diy` `main` **54343aa685ae8f33159d2f485ec4a57bad5c574a**.
Licencia raíz: MIT. Rama propia: `rbln`; `upstream` solo lectura.
No usar los tags `v6.2.x` de Cal.com anteriores a la separación.

## Cambios propios

- Seguridad — `apps/api/v2/src/lib/filterReqHeaders.ts` y su `.spec.ts`:
  redacta `authorization`, `cookie` y todo `x-*` con `key`, `secret` o `token`,
  sin distinguir mayúsculas. Mantiene la lista permitida de otros encabezados
  y no muta la petición. Corrige la exposición de Authorization en el ancla.
  Consumidor: `apps/api/v2/src/filters/http-exception.filter.ts:21`; también
  lo usan los filtros Prisma, tRPC, Zod y CalendarService del mismo directorio.
  Excepción de seguridad aprobada para T0a, con PR separado hacia `rbln` y
  revisión de Sol gestionada por el orquestador. Preservar en todo merge de
  upstream. [Prueba y gate de despliegue](rbln/evidence/api-log-redaction.md).
- Seguridad ampliada — los seis filtros de error listados en el README omiten
  body, query, correo del usuario y excepción cruda (su mensaje puede contener
  la query). Conservan requestId y metadatos de error; respuestas sin cambios.
  `x-cal-client-id` deja de registrarse. Las pruebas capturan Logger.error con
  marcadores ficticios independientes en header/body/query y mantienen el 404.
- Ronda 3 — `lib/safe-parse/safe-parse.ts` registra solo mensaje fijo y códigos
  de issues, nunca input, schema, issues completos ni stack. Los callbacks de
  `modules/conferencing/controllers/conferencing.controller.ts` y
  `modules/stripe/controllers/stripe.controller.ts` omiten el mensaje crudo y
  `error_description`. `modules/oauth-clients/services/oauth-flow.service.ts`
  conserva solo tipo/código del error Redis, sin `command.args` ni token.
  Todas estas rutas son relativas a `apps/api/v2/src/`; listado completo para
  sync en README. Regresiones con captura de logger y contraste contra el ancla;
  datos/fallback de safeParse, redirecciones, estados, mensajes y cabeceras HTTP
  se conservan. El requestId en el log no altera el valor de la cabecera HTTP.
- Cierre Redis — `apps/api/v2/src/modules/redis/redis.service.ts:42` del ancla
  registraba el error completo de `quit()`. Un fallo AUTH con comandos pendientes
  puede incluir la contraseña en `command.args` de ioredis 5.3.2; afecta a la
  conexión compartida de throttling (`apps/api/v2/src/app.module.ts:72`). Se
  registra solo evento fijo, tipo/código, conservando el comportamiento del
  cierre. Preservar `redis.service.spec.ts`, que reproduce el rechazo AUTH con
  contraseña ficticia y falla contra el ancla.
- Residuales API v1 aceptados por el orquestador, sin parche: bajo
  `apps/api/v2/src/`, `platform/bookings/2024-08-13/services/input.service.ts:734`,
  `modules/auth/oauth2/services/oauth2-error.service.ts:52,66,70`,
  `modules/auth/oauth2/controllers/atoms-oauth2.controller.ts:52` y errores de
  conexión/desconexión de `modules/prisma/prisma-read.service.ts:71,80` y
  `modules/prisma/prisma-write.service.ts:77,86`. El uso aprobado es API key por
  hash, sin OAuth de plataforma, atoms ni Stripe. Conservar esta lista durante
  el sync; reevaluarla antes de ampliar ese uso, sin asumir logs libres de secretos.
- Guarda, sin parche web/middleware informativos — `deploy/sync-vars.py` fija
  API `LOG_LEVEL=warn`, `NEXTAUTH_DEBUG` vacío y `NEXT_PUBLIC_LOGGER_LEVEL=4`.
  `scripts/rbln/check-log-policy.cjs` los verifica en CI y dentro del contenedor
  del smoke. Riesgo residual: `next-auth-options.ts:154,430,569` (credenciales y
  sesión) y `packages/app-store/_utils/oauth/OAuthManager.ts:340` (bearer Google)
  siguen teniendo logs debug; nunca bajar el nivel ni habilitar debug en v1.
  Riesgo residual adicional que **sobrevive a warn**: URL con query en logs de
  error de `packages/lib/server/defaultResponder.ts:56`,
  `packages/lib/tracing/index.ts:72` y `apps/web/app/api/parseRequestData.ts:36`.
  La configuración no redacta estas rutas; siguen sin parche web en v1 por
  decisión del orquestador. No considerar esos logs libres de datos sensibles.
- P-01 — `.github/workflows/image.yml`: construye web y API v2 solo en GitHub
  Actions, prueba migraciones/arranque y publica imágenes GHCR con etiqueta
  `sha-<commit completo>` y revisión OCI. Sin credenciales de
  producción en CI. Las cadenas `ci-only` son rellenos de un entorno efímero sin
  autenticación de Postgres; no son credenciales desplegadas.
- P-02 — `Dockerfile`: expone `NEXT_PUBLIC_APP_NAME` al build para configurar
  «RBLN Agenda» sin modificar la lógica de marca.
- Imagen pública — ambos Dockerfiles eliminan ARG/ENV de credenciales.
  BuildKit monta únicamente los fixtures públicos de `deploy/build-fixtures.sh`.
  `deploy/check-public-image.py` bloquea nombres privados en build-args, historial
  y entorno final; `.dockerignore` excluye configuración local. La CI no lee
  Infisical y publica exclusivamente con `GITHUB_TOKEN`, sin sobrescribir tags SHA.

No se ha cambiado el locale por defecto. Primero se configura usuario `es` e
`interfaceLanguage: "es"`; cualquier parche de idioma o de PoweredBy requiere
un fallo reproducible de T0 y una entrada en este archivo.

## Configuración P-05, sin parche funcional

T0b verificó que `disableCancelling=true` bloquea tanto al asistente como al
panel de Giuli y la API; `disableRescheduling=true` bloquea enlace y panel,
aunque la API permite reprogramar. Ambos quedan en **false**, por decisión del
orquestador. Los cambios externos de reservas pagadas pasan a revisión/alerta
en el CRM, sin reintegro automático; política 24 h / 2 cambios asistida por Giuli.

Los diez IDs se conservan en `rbln/evidence/event-types.json`. Los cinco online
quedan ocultos, autenticados, con `meet_pending: true` y ubicación provisional
`attendeeDefined`, aprobada explícitamente. No se reserva en ellos antes del GO.
Omitir `locations` selecciona CalVideo por defecto
(`packages/trpc/server/routers/viewer/eventTypes/heavy/create.handler.ts:73`);
`[]` devuelve 400 (`packages/platform/types/event-types/event-types_2024_06_14/inputs/locations.input.ts:164`).
Google Meet devuelve 400 mientras no esté conectado. El wizard, tras OAuth y
conexión de Giuli, hace PATCH y GET de los cinco: falla si la única ubicación
no es Meet. No se usan links falsos, CalVideo ni credenciales ficticias.

PENDING bloquea el tipo propio después de la caché de 2 s y rechaza un segundo
POST. No bloquea otro tipo del mismo usuario; ACCEPTED sí. La política entre
tipos corresponde al puente, sin cambio de Cal. Ver T0a/T0b en `rbln/evidence/`.

## Actualización

1. `git fetch upstream main` y revisar un **SHA concreto posterior** (licencia,
   cambios, migraciones y API). Nunca actualizar a un tag de Cal.com.
2. En una rama de ensayo desde `rbln`, `git merge --no-ff <SHA_REVISADO>`.
3. Resolver cada conflicto preservando los cambios listados arriba; actualizar
   ancla y prefijo de las etiquetas del workflow. No empujar a `upstream`.
4. CI: tipos, lint y pruebas relevantes; imágenes construidas en GitHub Actions.
5. Desplegar los digests en un entorno Railway de ensayo con DB/Redis propios.
   Migraciones por `prisma migrate deploy`; T0 abreviado: API key, slots/hold,
   confirmación, rechazo y webhooks firmados.
6. Registrar SHA, digests, evidencia y copia de seguridad; producción solo tras
   aprobar el ensayo. Rollback y restauración se detallan en `deploy/railway.md`.

El baseline continúa anclado aunque se publique una nueva revisión upstream.

- P-03 — `deploy/sync-vars.sh` y `deploy/sync-vars.py`: réplica explícita desde
  Infisical usando solo `bee-lector` (`leer.py`), `skipDeploys: true` y una
  activación final por servicio. El sync formal de Infisical queda pendiente no
  bloqueante de secrets-vault; no se usa ninguna credencial Admin.
- P-06 — `deploy/t0-sink.py`: receptor efímero de correo/webhooks para T0, sin
  envíos SMTP salientes, sin persistencia ni registros de payloads. Lectura de
  capturas autenticada; webhook autenticado con HMAC sobre bytes crudos.
