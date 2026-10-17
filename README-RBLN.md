# RBLN Agenda

Fork operativo: `juanmateixido/rbln-cal`, rama `rbln`, proyecto Railway `rbln-cal`.

## Por qué esta ancla

La base es **`calcom/cal.diy` `main` `54343aa685ae8f33159d2f485ec4a57bad5c574a`**.
Su licencia raíz es MIT, no tiene directorios `ee/` y su estrategia de API key
no llama a `checkLicense`.

**No usar `v6.2.0`**: ese tag pertenece a Cal.com antes de la separación;
contiene `apps/api/v2/src/ee` bajo licencia comercial y una consulta de licencia
que corta la autenticación por API key. Las actualizaciones de este fork parten
de un SHA concreto y revisado de `cal.diy main`, nunca de aquellos tags.

## Parches sobre upstream

- Redacción de encabezados en `apps/api/v2/src/lib/filterReqHeaders.ts`. En
  `54343aa`, línea 6, el helper devuelve Authorization completo y
  `apps/api/v2/src/filters/http-exception.filter.ts:21` lo envía al log.
  El parche conserva los metadatos permitidos y reemplaza credenciales por
  `[REDACTED]`, sin modificar la petición ni la autenticación. Sus pruebas
  deben conservarse en cada actualización, incluido el sync de `840949a1e1`.
  La prueba HTTP antes/después sigue siendo condición para crear la primera
  API key o abrir una sesión de Giuliana; ver [evidencia](rbln/evidence/api-log-redaction.md).
- Pendiente después del lanzamiento: Juanma decide si reportar este hallazgo
  a `calcom/cal.diy`. No se abre issue ni PR upstream ni se contacta al proyecto.

La ampliación del PR #1 elimina cuerpos, queries y objetos/mensajes crudos de
excepción de los logs de error. Estos últimos también pueden repetir la query
(por ejemplo, un 404 de Nest). Conserva tipo/código/status e identificador de
request; las respuestas HTTP mantienen sus códigos y mensajes. Tampoco registra
el correo del usuario. `x-cal-client-id` queda fuera de la allowlist.

Archivos de aplicación divergentes que debe preservar el sync:

- `apps/api/v2/src/lib/filterReqHeaders.ts`
- `apps/api/v2/src/filters/http-exception.filter.ts`
- `apps/api/v2/src/filters/prisma-exception.filter.ts`
- `apps/api/v2/src/filters/trpc-exception.filter.ts`
- `apps/api/v2/src/filters/zod-exception.filter.ts`
- `apps/api/v2/src/filters/calendar-service-exception.filter.ts`
- `apps/api/v2/src/modules/auth/oauth2/filters/oauth2-http-exception.filter.ts`
- `apps/api/v2/src/lib/safe-parse/safe-parse.ts`
- `apps/api/v2/src/modules/conferencing/controllers/conferencing.controller.ts`
- `apps/api/v2/src/modules/stripe/controllers/stripe.controller.ts`
- `apps/api/v2/src/modules/oauth-clients/services/oauth-flow.service.ts`
- `apps/api/v2/src/modules/redis/redis.service.ts`

Conservar también `filterReqHeaders.spec.ts`, `http-exception.filter.spec.ts`,
`error-log-privacy.spec.ts`, `safe-parse.spec.ts`, `oauth-log-privacy.spec.ts`, `redis.service.spec.ts`,
el workflow `rbln-log-tests.yml` y la guarda `scripts/rbln/check-log-policy.cjs`.
Los middleware/interceptor informativos de API no se parchean: `LOG_LEVEL=warn`
los suprime, y la CI/smoke rechazan el nivel por defecto `info`.

`safeParse` registra solo un evento fijo y los códigos de issues; conserva datos
parseados, fallback y silencio con `logError=false`. Los callbacks OAuth de
conferencing/Stripe omiten mensajes crudos y `error_description`; la propagación
de tokens omite el error Redis completo y sus `command.args`. Las regresiones
capturan los loggers y comprueban redirecciones/fallback. Los seis filtros
conservan exactamente las respuestas del ancla, incluso el comportamiento de
la cabecera `X-Request-Id`; solo el log aprovecha el identificador en minúsculas.

En el ancla, `apps/api/v2/src/modules/redis/redis.service.ts:42` registra completo
el error de `quit()`. Un fallo AUTH con comandos pendientes puede incluir la
contraseña en `command.args` (ioredis 5.3.2); esta conexión también se comparte
con throttling (`apps/api/v2/src/app.module.ts:72`). El parche conserva solo
evento fijo, tipo y código, sin cambiar el cierre. La regresión captura un error
AUTH con contraseña ficticia y debe fallar sin el parche.

Residuales API v1 aceptados por el orquestador tras ronda 3: el uso de RBLN se
limita a API key por hash, sin OAuth de plataforma, atoms ni Stripe. Persisten
logs crudos en estas rutas del ancla (todas bajo `apps/api/v2/src/`):

- `platform/bookings/2024-08-13/services/input.service.ts:734`
- `modules/auth/oauth2/services/oauth2-error.service.ts:52,66,70`
- `modules/auth/oauth2/controllers/atoms-oauth2.controller.ts:52`
- `modules/prisma/prisma-read.service.ts:71,80`
- `modules/prisma/prisma-write.service.ts:77,86`

Los dos últimos son errores de conexión/desconexión. Esta aceptación no afirma
que todos los logs sean inocuos: preservar la lista en el sync y revisar el
riesgo antes de habilitar cualquiera de los usos excluidos.

Riesgo residual web v1: `packages/features/auth/lib/next-auth-options.ts:154,430,569`
y `packages/app-store/_utils/oauth/OAuthManager.ts:340` pueden imprimir credenciales,
sesiones o el bearer de Google si se habilita debug. No se parchean en v1.
El sync fija `NEXTAUTH_DEBUG` vacío (evita cadenas truthy) y
`NEXT_PUBLIC_LOGGER_LEVEL=4` (warn); la guarda de CI/smoke exige nivel 4–6 y debug
ausente/vacío. No habilitar debug para investigar una incidencia con credenciales.

También queda riesgo residual de URL con query en logs **de error**, que
**sobreviven a warn**: `packages/lib/server/defaultResponder.ts:56`,
`packages/lib/tracing/index.ts:72` y `apps/web/app/api/parseRequestData.ts:36`.
La guarda de nivel no los elimina. Por decisión del orquestador, siguen sin
parche web en v1; tratar los logs como sensibles y no asumir que warn los sanea.

## Operación

- [Parches y procedimiento de actualización](PATCHES.md).
- [Railway, secretos, T0, copias y rollback](deploy/railway.md).
- Imágenes web/API construidas exclusivamente en GitHub Actions; no instalar
  ni construir Cal en bee.
- Infisical `RBLN /cal` es la fuente única de configuración de `rbln-cal`.
  `deploy/sync-vars.sh --dry-run` lista nombres; `--apply` replica y despliega
  una vez por servicio. Solo usa `leer.py`/`bee-lector`, nunca credenciales Admin.
- Las cinco variables del puente corresponden a `RBLN /crm`, bajo aprobación
  de crm-foundation. La API key se crea solo después de su aprobación y se guarda
  directamente en `RBLN /crm CAL_API_KEY`; no se crea una copia en `/cal`.
  **`BOOKING_MODE=off` hasta GO de Juanma.** `/cal` no se sincroniza al CRM.
- `SMTP_MODE=capture` mantiene los correos en el receptor T0; no se activa
  Mailgun ni se ejecuta el wizard de Google sin GO.
- [Wizard único del GO](rbln/wizard-juanma.sh): `--dry-run` sin efectos;
  OAuth, reset de Giuli con rechazo verificado de la inicial y calendario.

## Imagen pública

GHCR publica `ghcr.io/juanmateixido/rbln-cal-web` y `rbln-cal-api` con el
`GITHUB_TOKEN` efímero del workflow (`packages: write`), sin PAT personal.
Cada imagen nueva lleva `sha-<commit completo>`; la CI rechaza sobrescribir
ese tag. Railway usa el digest asociado, nunca `latest`.

Se hornean código MIT, dependencias, recursos, URLs/nombre `NEXT_PUBLIC_*`
y configuración pública de compilación. Ningún valor de Infisical llega al
builder. Las variables privadas solo entran al contenedor en ejecución mediante
`deploy/sync-vars.sh`. `.dockerignore` excluye archivos `.env`, claves locales
y evidencia de sesiones.

Cal necesita algunas variables durante la compilación. `deploy/build-fixtures.sh`
contiene únicamente literales públicos de CI: PostgreSQL efímero sin contraseña
y rellenos sin acceso a ningún entorno. BuildKit los monta temporalmente, sin
ARG/ENV persistidos. No son credenciales de Railway ni se leen de Infisical.

`deploy/check-public-image.py` bloquea argumentos privados, acceso a Infisical
desde el workflow, cambios en esos fixtures y nombres privados en
`docker history --no-trunc` / entorno final. Usa un snapshot de nombres de
`RBLN /cal` y del puente `/crm`, con excepciones explícitas para configuración
pública; también rechaza nombres nuevos de tokens/secretos. No imprime valores.
Este control complementa la revisión: no detecta todo secreto arbitrario que
alguien incrustara en un archivo de código.

La visibilidad pública de ambos paquetes se verifica sin login. Si requiere
intervención, está agrupada en el wizard; no se crea token `read:packages`.
Una futura imagen privada requeriría una decisión nueva y token vía wizard.
