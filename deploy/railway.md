# RBLN Agenda · operación y despliegue

Ancla: `calcom/cal.diy` `main` `54343aa685ae8f33159d2f485ec4a57bad5c574a`.
Ver [README-RBLN.md](../README-RBLN.md) y [PATCHES.md](../PATCHES.md).
Estado de aceptación: [T0](../rbln/evidence/T0.md). Nunca inferir un GO a partir
de un deployment sano. `BOOKING_MODE=off` hasta aprobación explícita de Juanma.

## Infraestructura

Proyecto Railway `rbln-cal`: `e9436072-a192-43c7-b0fd-6d6723264525`.
Entorno `production`: `3082cdf3-2bfe-4ab5-9f6c-d56bbac68ad8`.

| Servicio | Imagen / función | Persistencia y salud |
|---|---|---|
| `postgres` | `postgres:16-alpine`, DB `calendso` | volumen `/var/lib/postgresql/data`; `PGDATA` subdirectorio `pgdata`; backups DAILY/WEEKLY/MONTHLY habilitados |
| `redis` | `redis:7-alpine`, autenticación obligatoria, AOF | volumen `/data`; solo red privada |
| `cal-web` | `ghcr.io/juanmateixido/rbln-cal-web` | puerto 3000; salud `/api/auth/csrf`; UI `/auth/login` |
| `cal-api` | `ghcr.io/juanmateixido/rbln-cal-api` | puerto 5555; **`/health` sin `/v2`** |
| `t0-sink` | `python:3.11-alpine`, [receptor](t0-sink.py) | HTTP 8080 `/health`; SMTP privado 1025; memoria, sin disco ni envíos |

La API pública usa `https://cal-api-production-902f.up.railway.app/v2`.
No se crea `agenda-api.*`. La web de preparación usa
`https://cal-web-production-6281.up.railway.app`; el dominio definitivo es
`https://agenda.rebelion.training`. Los valores CNAME/TXT exactos fueron enviados
al orquestador para su paso humano agrupado. DNS no forma parte del wizard.

## Imágenes y migraciones

No ejecutar `yarn install`, Next/Turbo/Nest builds ni Docker builds en bee.
[Actions](https://github.com/juanmateixido/rbln-cal/actions/workflows/image.yml)
construye ambas imágenes desde la rama `rbln`, prueba migraciones y arranque HTTP
con Postgres/Redis efímeros, y publica una etiqueta por commit: `sha-<SHA completo>`.
La CI rechaza sobrescribirla y ejecuta el check de imagen pública antes de publicar.
Los builds iniciales anteriores al control usaban `diy-54343aa-rbln.*`; no son
la imagen aprobada para abrir sesiones o cargar credenciales de usuarios.

Registrar siempre el digest OCI real y SHA del fork en T0 antes del despliegue.
Configurar Railway con `ghcr.io/...@sha256:...`, nunca `latest`. GHCR debe ser
público como el fork. No se usa ni crea un PAT/read:packages. Si hace falta
cambiar visibilidad, ejecutar la etapa `--images sha-<SHA>` del wizard con Juanma;
es independiente del GO de SMTP/Google y no abre sesiones de Giuliana.
Los únicos valores de build son configuración pública y los fixtures literales
descritos en [Imagen pública](../README-RBLN.md#imagen-pública); nunca Infisical.

La alternativa de consultar la integración GitHub de Railway por GraphQL
(`gitHubRepoAccessAvailable`) devolvió `Not Authorized` con el token del workspace
el 17/10. No se confirmó acceso ni se inició un build remoto. El camino aprobado
sigue siendo GHCR público; están prohibidos los registros anónimos/efímeros.

El arranque de web de upstream ejecuta `yarn prisma migrate deploy`, carga las
apps y arranca Next. Normalmente se migra primero con web y arranca API después.
Para reproducir la fuga sin abrir el setup web, el 17/10 se arrancó primero API
con `preDeployCommand=["yarn prisma migrate deploy"]` en Railway. Antes del
primer arranque web, retirar ese comando de API y comprobar que terminó la
migración anterior. No iniciar dos migradores a la vez. La API usa el mismo Postgres y claves de
NextAuth/cifrado, y exige Redis. `JWT_SECRET`, `API_URL`, `DATABASE_DIRECT_URL`,
`DATABASE_READ_URL`, `DATABASE_WRITE_URL` figuran en la configuración del ancla.
`CALCOM_SERVICE_ACCOUNT_ENCRYPTION_KEY` también figura en `.env.example`, pero
solo se consume para credenciales de service accounts delegadas, que no se usan
con el OAuth personal de Giuli. No hay licencia de API key que cargar.

`STRIPE_API_KEY=sk_test_unused` y `STRIPE_WEBHOOK_SECRET=whsec_unused` son cadenas
inertes exigidas por el arranque de API v2. Las aplica `sync-vars.py` como
literales documentados: **no son secretos ni están en Infisical**. No se instala
Stripe ni se habilita ningún cobro de Cal.

## Camino oficial de variables hasta el sync formal de secrets-vault

```bash
deploy/sync-vars.sh --dry-run
deploy/sync-vars.sh --apply
```

El script usa exclusivamente `~/.config/infisical/leer.py` (identidad
`bee-lector`, Viewer). No lee `cargador.env`, archivos dotenv ni credenciales
Admin. Los valores llegan por variables de entorno del proceso; GraphQL se
envía a `curl` por stdin, nunca por argumentos, archivos o logs. La salida
contiene nombres, no valores. No usar `bash -x` ni capturar el entorno.

Fuente propia: `RBLN /cal`. El destino está restringido por UUID al proyecto
`rbln-cal`; nunca sincroniza al CRM. SMTP real se lee directamente de
`RBLN /mailgun` (`MAILGUN_SMTP_HOST/PORT/USER/PASSWORD`), sin duplicarlo en `/cal`.
El receptor T0 usa el `CAL_WEBHOOK_SECRET` existente en `/crm` mediante lectura;
no modifica esa ruta. El sync formal de Infisical queda pendiente no bloqueante
de secrets-vault. Volver a correr este script cada vez que cambie un secreto.

Cada colección se escribe con `variableCollectionUpsert`, `skipDeploys: true`.
Solo tras completar todas, se solicita **un deployment por servicio**. Si una
escritura falla, no se inicia ninguno: corregir y repetir. `--apply-no-deploy`
sirve para provisionar servicios sin imagen todavía; requiere la activación
posterior explícita. `CAL_SYNC_WAIT_DEPLOYS=yes` espera el resultado de los IDs
de deployment recién creados, usado en el wizard para no enviar el reset a la
vieja instancia de captura. El script no borra variables ajenas al allowlist.

Las claves nuevas se cargan solo con `cargar.py` por stdin. Las bajas las realiza
secrets-vault con su procedimiento: el lector no tiene permisos de borrado.

## Cuenta única, sesiones y GO

La cuenta de Giuliana se crea mediante el formulario web de setup con
Playwright local: [bootstrap.cjs](../scripts/rbln/bootstrap.cjs). No se insertan
API keys por SQL. La interfaz de API keys produce `CAL_API_KEY`, que se
carga directamente en `RBLN /crm` solo después de la aprobación de crm-foundation.
Hasta ese OK no se crea la clave. El script exige `CAL_CRM_KEY_APPROVED=yes`
como constancia operativa de esa aprobación; no sustituye al mensaje del responsable.
No se imprime ni se guarda en un archivo ni se duplica en `/cal`.
Foundation aprobó el nombre el 17/10: la clave fue creada por UI y cargada en
esa ruta a las 15:07 UTC, después del gate DESPUÉS. `/me` 200 y un 404 deliberado
verificaron su funcionamiento y ausencia en logs/respuestas, sin guardar crudos.
El perfil se configura por tRPC y el resto por API v2 con
[configure.ts](../scripts/rbln/configure.ts). Correrlo dos veces y comparar el
mapa de 10 eventos antes de dar P-05 por aprobado.

`CAL_ADMIN_EMAIL` identifica a la cuenta; `CAL_ADMIN_INITIAL_PASSWORD` es una
clave aleatoria de bootstrap, nunca una contraseña personal de Giuliana. Antes
del GO solo la usan agentes. No se entrega a nadie. Cada tarea abre un contexto
aislado, hace logout, verifica que no hay usuario autenticado y lo registra en
[agent-sessions.jsonl](../rbln/evidence/agent-sessions.jsonl). Los procesos de
navegador usan `flock /tmp/bee-pesado.lock`; no persisten cookies/storageState.

Hasta GO: `SMTP_MODE=capture`; ningún correo sale a Giuli o pacientes. Todos los
tipos de evento quedan ocultos, no hay Google conectado ni SMS/workflows
nativos configurados. El webhook del CRM queda inactivo; T0 usa exclusivamente
el receptor efímero. No apagar `disableStandardEmails.all.attendee/host`:
esos flags silencian también confirmación/cancelación/reprogramación con ICS.

```bash
rbln/wizard-juanma.sh --dry-run  # seguro: sin red, secretos ni correo
# Solo después del GO explícito, con Juanma y Giuli presentes:
rbln/wizard-juanma.sh --go
```

El [wizard](../rbln/wizard-juanma.sh) agrupa OAuth Google, reset y calendario.
La app OAuth se publica; Giuli conecta su cuenta y elige `Pacientes`. Existe
un cliente distinto en `TXD /google-staff`; no se reutiliza entre proyectos.
No se encontró gcloud en bee ni en el Mac durante la revisión de automatización.

Con Giuli leyendo su correo **en ese momento**, el wizard solicita el reset de
un uso/6 h. Ella define su clave directamente en Cal y la guarda en su gestor;
el agente no la recibe. Después, una comprobación automática exige que la clave
inicial sea rechazada expresamente por credenciales incorrectas y que no exista
sesión. Un error de red, rate limit o error distinto **no cuenta como éxito**.
La evidencia de rotación habilita a secrets-vault a borrar la inicial según
T14e; el wizard no la borra por su cuenta. `BOOKING_MODE` continúa `off`.

## T0 y frontera con el CRM

T0a usa imagen sin parches funcionales y un único evento oculto antes de P-05:
API key, PENDING y slots, confirm/decline, firma de webhooks, autenticación,
UID, confirm repetido, memoria/arranque. Cada rojo incluye el árbol de decisión
para bridge en [T0.md](../rbln/evidence/T0.md). No usar endpoints del CRM para
recibir pruebas.

En P-05, fijar explícitamente `confirmationPolicy: { type: "always",
blockUnconfirmedBookingsInBooker: true }`. La API comparte una caché de slots
de 2.000 ms por input exacto; una lectura inmediata tras una mutación puede ser
anterior a ella. T0a comprueba por separado la lectura tras más de 3 s y el
rechazo de un segundo POST con otro asistente. No se cambió `SLOTS_CACHE_TTL`.

T0b revisa el español efectivo, branding y MIME/ICS capturados. El enlace
`/booking/{uid}?changes=true` que sigue en texto/ICS se acepta como cosmético
solo si ambos flags impiden cancelar/reprogramar de verdad. Si permite hacerlo,
detener ese flujo, reportar y proponer el parche mínimo en PATCHES antes de
aplicarlo. `no-reply@cal.com` en ICS es cosmético aceptado. Giuli no debe aceptar
solicitudes desde el mail: el puente registra/alerta `confirmed_unpaid` si ocurre.

`RBLN /crm` pertenece a crm-foundation. Los cuatro nombres cargados inicialmente
(`CAL_API_URL`, `CAL_WEBHOOK_SECRET`, `BOOKING_MODE`, `BOOKING_TEST_TO`) están
pendientes de la confirmación documental de su aprobación. `CAL_API_KEY` sí recibió el OK
explícito y ya se guarda directamente allí,
sin el fallback anterior `/cal CAL_API_KEY_CRM` (nunca llegó a crearse). Comunicar solo nombres/rutas al
catálogo de secrets-vault, con copia a ambos orquestadores.

## Actualización, ensayo y rollback

1. `git fetch upstream main`; fijar SHA posterior concreto, revisar MIT, ausencia
   de `ee/`, cambios de autenticación/API y migraciones. No usar tags comerciales.
2. Crear rama de ensayo desde `rbln`; merge del SHA revisado. Resolver conflictos
   preservando PATCHES. Tipos, Biome y pruebas relevantes en CI; construir allí.
3. Si no hay SHA posterior, como al 17/10/2026, crear ensayo desde el padre
   `c339c9c47998d5213aab7701c99aa246db4619d3`, aplicar commits propios y mergear
   `54343aa`. Registrar árbol/resultados; no modificar el ancla de producción.
4. Crear entorno de ensayo Railway con DB/Redis propios y SMTP captura; no
   reutilizar volumen de producción. Desplegar digests nuevos, migrar y ejecutar
   T0 abreviado: API key, slots/PENDING, confirm/decline y firma de webhook.
5. Conservar backup previo, SHA/digests anteriores, resultados y aprobación.
   Solo entonces actualizar producción. No activar `BOOKING_MODE` como efecto
   colateral de una actualización.

### Recrear el ensayo desde cero

El entorno del 17/10 **se borró, no se dejó apagado**. No restaurar sus volúmenes
ni reutilizar sus UUID. Esta secuencia reproduce el aprovisionamiento comprobado:

1. Con `leer.py RBLN /railway RAILWAY_API_TOKEN -- <proceso>`, usar GraphQL
   `environmentCreate(input:{projectId,name:"update-rehearsal-<fecha>"})`, sin
   `sourceEnvironmentId`. Leer el ID nuevo y exigir que difiera de `production`.
   Crear cinco servicios por `serviceCreate` con `projectId`, ese `environmentId`
   y nombres `rehearsal-postgres`, `rehearsal-redis`, `rehearsal-web`,
   `rehearsal-api`, `rehearsal-sink`. Guardar solo IDs, nombres y dominios.
2. `volumeCreate` con `projectId`, `environmentId`, `serviceId` y `mountPath`:
   Postgres `/var/lib/postgresql/data`, Redis `/data`. Crear dominios por
   `serviceDomainCreate` para web 3000, API 5555 y sink 8080. No copiar volúmenes,
   usuarios, sesiones ni dumps de producción.
3. Usar `deploy/sync-vars.py:collections()` como lista de variables y la misma
   cadena de lectores Viewer de `deploy/sync-vars.sh`. **No ejecutar el sync
   productivo sin adaptar el destino**: sus IDs de Infisical son productivos.
   En memoria, sustituir todos los IDs de servicio/entorno y estas conexiones:
   - Web/API: `DATABASE_URL` y `DATABASE_DIRECT_URL` =
     `postgresql://postgres:${{rehearsal-postgres.POSTGRES_PASSWORD}}@rehearsal-postgres.railway.internal:5432/calendso`;
     `DATABASE_HOST=rehearsal-postgres.railway.internal`.
   - API: `DATABASE_READ_URL` y `DATABASE_WRITE_URL` iguales a la DB anterior;
     `REDIS_URL=redis://:${{rehearsal-redis.REDIS_PASSWORD}}@rehearsal-redis.railway.internal:6379`.
   - Web/API: `NEXT_PUBLIC_WEBAPP_URL` y `NEXTAUTH_URL` al dominio nuevo de web,
     `NEXT_PUBLIC_API_V2_URL` al dominio nuevo de API + `/v2`; API `API_URL`
     al mismo dominio sin `/v2`.
   - SMTP exclusivamente `rehearsal-sink.railway.internal:1025`, usuario/clave
     vacíos; eliminar `GOOGLE_API_CREDENTIALS`. Conservar guardas de logging.
   Enviar colecciones por `variableCollectionUpsert`, `skipDeploys:true`,
   `replace:true` únicamente sobre los servicios nuevos y vacíos. Valores solo
   en memoria/stdin de curl, nunca archivos ni argumentos de proceso.
4. Configurar `serviceInstanceUpdate`: Postgres `postgres:16-alpine`, Redis
   `redis:7-alpine` con AOF y `requirepass` leído de `REDIS_PASSWORD` al arrancar.
   El sink usa `python:3.11-alpine` y ejecuta el contenido versionado de
   `deploy/t0-sink.py` (puede pasarse como código base64 público en startCommand),
   con `/health` y puerto 8080. Arrancar infraestructura por
   `serviceInstanceDeployV2`; esperar SUCCESS antes de web/API.
5. Poner los dos digests del merge ensayado en `source.image`, nunca los tags
   mutables. Arrancar API con `preDeployCommand:["yarn prisma migrate deploy"]`,
   `/health`, puerto 5555; esperar SUCCESS y salud 200. Retirar ese comando,
   arrancar web con `/api/auth/csrf`, puerto 3000 y verificar 200. Así nunca
   corren dos migradores a la vez. Comprobar marcadores ficticios en logs antes
   de abrir una sesión o crear una clave real de ensayo.
6. Crear la cuenta fixture por `/auth/setup` con Playwright local y registro de
   sesiones. Crear la clave desde la interfaz y guardarla como
   `RBLN /cal REHEARSAL_API_KEY`, avisando al catálogo. Nunca reutilizar la clave
   CRM. El ensayo del 17/10 usó la inicial de bootstrap; para un ensayo nuevo,
   preferir una contraseña aleatoria independiente guardada temporalmente en
   Infisical y registrada en el catálogo, con baja autorizada al cerrar.
7. Por API, crear un horario de prueba (`POST /v2/schedules`, versión 2024-06-11,
   Asunción, lunes a viernes 10–20) y un único tipo oculto con autenticación,
   45 min, confirmación always y `blockUnconfirmedBookingsInBooker:true`,
   ubicación presencial de ensayo y ambos flags de cambios false. Crear webhook
   activo hacia el sink nuevo con los cinco triggers de T0 y versión 2021-10-20.
   Adaptar la guardia de origen y el archivo de salida de `scripts/rbln/t0-api.py`
   en una copia temporal; mantener todas las aserciones/finally y pasar la clave
   de ensayo como `CAL_API_KEY` solo al proceso. No sobrescribir T0 productivo.
8. Repetir T0, registrar SHA/digests/IDs y resultados sanitizados; cerrar siguiendo
   la lista de abajo. No habilitar Google, correo real ni BOOKING_MODE.

La secuencia y los nombres se cotejaron con los scripts de aprovisionamiento y
las respuestas GraphQL del ensayo completado (`update-rehearsal-deployment.json`
y `update-rehearsal-runtime.json`). Se verificó documentación, sin crear un
segundo entorno ni cargar nuevas claves para probar el runbook.

Cierre obligatorio del ensayo: revocar su API key en Cal y verificar 401; borrar
`RBLN /cal REHEARSAL_API_KEY` de Infisical y avisar a secrets-vault para retirar
el nombre del catálogo. Si la cuenta fixture usó la clave inicial de bootstrap,
rotarla a un valor aleatorio descartado y comprobar que la inicial ya no entra.
Cerrar y registrar las sesiones. Detener los deployments y aplicar la política
de retención autorizada: el ensayo del 17/10 se eliminó completo con DB, Redis
y volúmenes por orden final del orquestador. Registrar cada hora y comprobar
por GraphQL que no quedan servicios activos ni instancias de volumen. Railway
retiene volúmenes eliminados hasta 48 h antes de la purga definitiva. Nunca
operar sobre los IDs de producción.

Rollback de aplicación: volver a los digests anteriores en `source.image` y
desplegar web/API una vez. Primero revisar compatibilidad de la imagen anterior
con el esquema migrado. Un downgrade de código no revierte una migración.

Restauración de DB: detener escrituras de web/API, tomar snapshot de la DB actual,
restaurar el backup elegido a un **volumen/servicio nuevo** mediante Railway,
comprobar integridad y T0 en entorno aislado, y luego cambiar las URLs DB con
`cargar.py` + sync. Nunca pisar el único volumen válido. Registrar punto de
restauración y reservas que requieren reconciliación; confirmar rollback con
el orquestador. Redis no es la fuente de reservas: reconstruir cachés desde DB.

Rotación de API key: crear reemplazo por UI, guardar `RBLN /crm CAL_API_KEY` con aprobación de foundation,
comprobar `/v2/me`, coordinar copia al CRM con foundation y desplegar consumidor;
revocar anterior solo tras verificar la nueva. Rotación de webhook: coordinar
ventana con bridge, habilitar temporalmente verificación de ambos secretos en
receptor si está soportada, actualizar secreto del webhook por API y verificar
una entrega firmada; retirar anterior después. No rotar claves de cifrado de
credenciales como si fueran tokens: requieren migración/reconexión controlada.

El sink T0 conserva como máximo 100 correos y 100 webhooks en RAM, accesibles
solo con token Viewer de captura. Reiniciarlo purga las capturas. Retirarlo
después del GO cuando termine la evidencia; no guardar MIME con PII en Git.
