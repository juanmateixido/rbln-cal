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

## Operación

- [Parches y procedimiento de actualización](PATCHES.md).
- [Railway, secretos, T0, copias y rollback](deploy/railway.md).
- Imágenes web/API construidas exclusivamente en GitHub Actions; no instalar
  ni construir Cal en bee.
- Infisical `RBLN /cal` es la fuente única de configuración de `rbln-cal`.
  `deploy/sync-vars.sh --dry-run` lista nombres; `--apply` replica y despliega
  una vez por servicio. Solo usa `leer.py`/`bee-lector`, nunca credenciales Admin.
- Las cinco variables del puente corresponden a `RBLN /crm`, bajo aprobación
  de crm-foundation. Hasta entonces la API key queda en `/cal CAL_API_KEY_CRM`.
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
