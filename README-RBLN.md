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
