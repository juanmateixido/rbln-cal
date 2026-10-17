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
API keys por SQL. La interfaz de API keys produce `CAL_API_KEY_CRM`, que se
carga directamente en `RBLN /cal`; no se imprime ni se guarda en un archivo.
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

T0b revisa el español efectivo, branding y MIME/ICS capturados. El enlace
`/booking/{uid}?changes=true` que sigue en texto/ICS se acepta como cosmético
solo si ambos flags impiden cancelar/reprogramar de verdad. Si permite hacerlo,
detener ese flujo, reportar y proponer el parche mínimo en PATCHES antes de
aplicarlo. `no-reply@cal.com` en ICS es cosmético aceptado. Giuli no debe aceptar
solicitudes desde el mail: el puente registra/alerta `confirmed_unpaid` si ocurre.

`RBLN /crm` pertenece a crm-foundation. Los cuatro nombres cargados inicialmente
(`CAL_API_URL`, `CAL_WEBHOOK_SECRET`, `BOOKING_MODE`, `BOOKING_TEST_TO`) están
pendientes de su aprobación. `CAL_API_KEY` no se carga allí sin ese OK; la
API key permanece en `/cal CAL_API_KEY_CRM`. Comunicar solo nombres/rutas al
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

Rollback de aplicación: volver a los digests anteriores en `source.image` y
desplegar web/API una vez. Primero revisar compatibilidad de la imagen anterior
con el esquema migrado. Un downgrade de código no revierte una migración.

Restauración de DB: detener escrituras de web/API, tomar snapshot de la DB actual,
restaurar el backup elegido a un **volumen/servicio nuevo** mediante Railway,
comprobar integridad y T0 en entorno aislado, y luego cambiar las URLs DB con
`cargar.py` + sync. Nunca pisar el único volumen válido. Registrar punto de
restauración y reservas que requieren reconciliación; confirmar rollback con
el orquestador. Redis no es la fuente de reservas: reconstruir cachés desde DB.

Rotación de API key: crear reemplazo por UI, guardar `/cal CAL_API_KEY_CRM`,
comprobar `/v2/me`, coordinar copia al CRM con foundation y desplegar consumidor;
revocar anterior solo tras verificar la nueva. Rotación de webhook: coordinar
ventana con bridge, habilitar temporalmente verificación de ambos secretos en
receptor si está soportada, actualizar secreto del webhook por API y verificar
una entrega firmada; retirar anterior después. No rotar claves de cifrado de
credenciales como si fueran tokens: requieren migración/reconexión controlada.

El sink T0 conserva como máximo 100 correos y 100 webhooks en RAM, accesibles
solo con token Viewer de captura. Reiniciarlo purga las capturas. Retirarlo
después del GO cuando termine la evidencia; no guardar MIME con PII en Git.
