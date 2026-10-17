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
- Guarda, sin parche web/middleware informativos — `deploy/sync-vars.py` fija
  API `LOG_LEVEL=warn`, `NEXTAUTH_DEBUG` vacío y `NEXT_PUBLIC_LOGGER_LEVEL=4`.
  `scripts/rbln/check-log-policy.cjs` los verifica en CI y dentro del contenedor
  del smoke. Riesgo residual: `next-auth-options.ts:154,430,569` (credenciales y
  sesión) y `packages/app-store/_utils/oauth/OAuthManager.ts:340` (bearer Google)
  siguen teniendo logs debug; nunca bajar el nivel ni habilitar debug en v1.
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
