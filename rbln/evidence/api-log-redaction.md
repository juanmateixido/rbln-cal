# API v2: Authorization sin redactar en errores

17/10/2026, detectado **antes de crear o utilizar una API key real**.

En el ancla `54343aa685ae8f33159d2f485ec4a57bad5c574a`:

- `apps/api/v2/src/lib/filterReqHeaders.ts:6` devuelve el valor completo de
  `Authorization` / `authorization`.
- `apps/api/v2/src/filters/http-exception.filter.ts:21` llama a `logger.error`
  con `headers: filterReqHeaders(request.headers)`.
- `apps/api/v2/src/lib/logger.ts` no contiene un redactor; en producción aplica
  `format.json()`. `LOG_LEVEL=warn` mantiene los logs de error.

Prueba ejecutada del helper del ancla con un **marcador ficticio, sin acceso a
ningún servicio**, sin instalar ni construir Cal: `lowercase_leaked=true`,
`uppercase_leaked=true`. Se imprimieron solo esos booleanos. La prueba HTTP
completa con marcador ficticio se confirmó después en Railway (detalle abajo).

Impacto: los errores esperados de T0 (doble reserva, confirm repetido, etc.)
pueden terminar registrando la API key. No se ejecutan pruebas autenticadas
hasta resolverlo. No hubo exposición: aún no hay API key ni sesiones Giuli.

## Parche y pruebas

El orquestador aprobó la excepción de seguridad y luego autorizó abrir/revisar
el PR antes de tener imagen. PR separado hacia `rbln`, nunca commit directo.
Redacción de Authorization, Cookie y cualquier x-* que contenga key, secret
o token, sin distinguir mayúsculas. Los demás encabezados siguen su allowlist;
la petición original permanece intacta.

`filterReqHeaders.spec.ts`, ejecutado con `bun test` (sin instalar ni construir
Cal), usa los globals compatibles con Jest y no añade dependencias:

- Sin parche: **13 fallos, 3 pases**; Authorization devuelve el valor ficticio.
- Con parche: **16 pases, 0 fallos**, 43 aserciones.
- Biome y TypeScript estricto de ambos archivos: pasan.

Ronda 2: 19 tests de encabezados pasan (arrays, duplicados y eliminación de
x-cal-client-id incluidos); 3 tests de guarda de niveles y 6 de sync pasan.
Los seis filtros de error omiten body/query/excepción cruda y correo del actor;
la prueba nueva captura Logger.error por cada punto header/body/query, conserva
el requestId y verifica respuesta 404/mensaje intactos. Su ejecución con Nest
real y contraste rojo contra `54343aa` corrió en `rbln-log-tests.yml` de CI:
[run 39040455368](https://github.com/juanmateixido/rbln-cal/actions/runs/39040455368)
**PASS en head 2b40ec7db8159edcd7fe15b520afaec7771d57bc**: 22/22 pasan con el
parche; 19 fallan y 3 pasan sin él. El workflow exige fallos separados para
header, body y query. No se instala ni construye Cal en bee.

Ronda 3: **52 tests pasan** con Nest/Jest aislados (sin instalar el workspace
Cal), un worker y `flock /tmp/bee-pesado.lock`. En una copia temporal con los
11 archivos de producción restaurados al ancla: **29 fallan y 23 pasan**.
Hay fallos independientes en los seis filtros, safeParse, los dos callbacks
OAuth y la propagación Redis. Las **18 comprobaciones de respuesta HTTP**
(seis filtros × tres variantes de cabecera) pasan en ambas versiones. También
pasan fallback/silencio de safeParse, tipos estrictos de helpers/tests, tres
guardas de configuración y seis tests de sync. La CI repite el contraste y
verifica tipos de los archivos modificados con las dependencias de la imagen
API fijada; su resultado para el nuevo head se registra tras ejecutarse.

CI de regresión del head `c3bd085d63ba4520a2541874e7561959a7e8d833`:
[privacy PASS, run 39041319620](https://github.com/juanmateixido/rbln-cal/actions/runs/39041319620/job/117421239250).
Repite 52 pases y exige los 29 fallos esperados contra el ancla; tipos específicos
en el otro job del mismo run todavía pendientes al registrar esta evidencia.

Ronda 4: `RedisService.onModuleDestroy()` también omite el error crudo de
`quit()`: ioredis puede adjuntar un comando AUTH pendiente con su contraseña.
La regresión nueva usa un error AUTH ficticio, verifica ausencia de contraseña,
mensaje y `command.args`, y conserva el cierre sin propagación de la excepción.
**53/53 tests locales pasan; contra el ancla, 30 rojos esperados y 23 verdes.**
Tipos estrictos de Redis y su test, con ioredis 5.3.2, también pasan localmente.
El job `types` del head completo debe pasar antes del merge: el fallo de c3bd085
se debió a omitir `packages/types/*.d.ts` al acotar include; e0a1509 lo restaura.
Los residuales aceptados por el orquestador están listados en README/PATCHES,
condicionados al uso de API key por hash, sin OAuth de plataforma/atoms/Stripe.

Sol aprobó el delta Redis de `ed517af6c64012ddc7ff54ed3adb291805d252ad`.
`types` y `privacy` pasaron en
[run 39041835112](https://github.com/juanmateixido/rbln-cal/actions/runs/39041835112),
incluido el chequeo de todos los archivos modificados con dependencias de la
imagen API. PR #1 pasó a ready y se mergeó únicamente a `rbln` el 17/10 a las
14:45:51 UTC: `a7e8cc3096665cefe10a36579d64fdbbbc28617b`. La imagen de ese SHA
se construye en Actions; el gate runtime sigue pendiente.

Condición vigente de la clave: no crear API key hasta que crm-foundation apruebe
`RBLN /crm CAL_API_KEY`. Después se guarda directamente allí; el fallback anterior
`/cal CAL_API_KEY_CRM` quedó revocado y nunca llegó a crearse.

El comando completo solicitado `yarn type-check:ci --force --concurrency=1`
pasó en la imagen baseline en
[run 39040608795](https://github.com/juanmateixido/rbln-cal/actions/runs/39040608795)
(9 tareas con ese script). No equivale a tipar el nuevo parche: API v2 no
declara ese script, por eso la CI de privacidad agrega un `tsc` específico.

## Reproducción HTTP antes del parche: CONFIRMADA

2026-10-17 14:25:30 UTC, Railway `rbln-cal`, API deployment
`8a7c48e6-3087-42bb-8024-cc12ddb97379`, revisión sin parche
`0c6fed2117ae9aaa89a6c46ccb7d831c6431b3d0` sobre el ancla `54343aa`.
Imagen `ghcr.io/juanmateixido/rbln-cal-api@sha256:5f7805737f9e2d61cfb7e58086c540b6afad5fcc05273fcd1ca41fd8f0f5591c`.
Migraciones aplicadas una vez antes de arrancar API; deployment SUCCESS y
`GET /health` → 200.

`POST /v2/rbln-log-probe-before?apiKey=<marcador ficticio>` con Authorization
y body JSON también ficticios → 404. Captura por GraphQL `deploymentLogs`:

| Comprobación | Resultado |
|---|---|
| Bearer ficticio completo en log | Sí: fuga confirmada |
| apiKey ficticia del body en log | Sí: fuga confirmada |
| apiKey ficticia de query en log | Sí: fuga confirmada |
| `[REDACTED]` | No |
| Campo requestId | Sí |
| Credenciales reales/sesión de Giuliana | Ninguna |

Crudo con marcadores visibles: `rbln/evidence/local-only/api-log-before.json`,
excluido mediante `.git/info/exclude` y comprobado con `git check-ignore`.
No se commitea. No se copiaron valores de Infisical al request: todos los
marcadores se inventaron para esta prueba. SMTP captura/BOOKING_MODE off
verificados antes de ejecutarla.

Callbacks públicos, mismo deployment sin parche, 14:35 UTC: GET de
`/v2/conferencing/zoom/oauth/callback` y `/v2/stripe/save`, con state/code/error y
error_description completamente ficticios. Ambos devuelven **301 al fallback
esperado** y ambos registran el marcador completo de error_description.
No se siguió la redirección ni se creó credencial, usuario o sesión. Crudos y
resultados locales excluidos: `local-only/conferencing-before*.json` y
`local-only/stripe-before*.json`. Repetir después con los mismos marcadores.

## Reproducción después del parche: VERDE

17/10, 15:05:58 UTC. SHA `a7e8cc3096665cefe10a36579d64fdbbbc28617b`,
API `ghcr.io/juanmateixido/rbln-cal-api@sha256:c1156efdcec31eb8083ba0a0ccf6d062dc8d3d8b30c4978313f11a4202a1cb46`,
deployment `87c8ff67-6464-4588-80b0-68d50ba228ab` SUCCESS; `/health` **200**.
[CI de imágenes](https://github.com/juanmateixido/rbln-cal/actions/runs/39042133944)
verde para web y API, con build, controles de imagen pública, tests, smoke y pull.
[Digests y acceso anónimo](images.json).

| Probe con los mismos valores ficticios del ANTES | DESPUÉS |
|---|---|
| POST inexistente, Authorization + body + query | 404; encabezado `[REDACTED]`; los tres valores ausentes; requestId presente |
| Conferencing callback | 301 al mismo fallback; evento fijo; descripción/token/code ausentes |
| Stripe callback | 301 al mismo fallback; evento fijo; descripción/token/code ausentes |
| safeParse compilado dentro de la imagen | Evento fijo + `invalid_type`; input ausente; fallback 0 comprobado |
| Barrido de todos los logs del deployment | 62 registros, ventana no truncada, cero de los 9 marcadores |

safeParse se invocó una vez como pre-deploy con un dato inventado; no fue un
endpoint HTTP ni añadió una ruta. Su contraste contra el ancla está en tests;
no hubo invocación runtime ANTES de ese helper. El comando de prueba se retiró
después de verificarlo, sin reiniciar API. Los callbacks no siguieron el fallback.

Resultados sanitizados: [privacy-after.json](privacy-after.json). Crudos solo
bajo `local-only/`, excluidos de Git. No se usó ninguna credencial real en estos
probes ni hubo sesión Giuli antes de completar esta comprobación.

crm-foundation aprobó `RBLN /crm CAL_API_KEY` el 17/10, transmitido por el
orquestador. La clave se creará por UI después de este gate, se guardará solo
allí y se verificará un 4xx con ella: comparación exclusivamente en memoria,
sin imprimirla ni guardar crudos de esa prueba. SMTP captura y BOOKING_MODE off.

## Servicio web

Revisión de fuentes: `packages/lib/server/defaultResponder.ts`,
`apps/web/app/api/defaultResponderForAppDir.ts`,
`packages/trpc/server/onErrorHandler.ts` y
`packages/features/auth/lib/next-auth-options.ts`. Sus manejadores de error
no agregan los encabezados entrantes al log. La autenticación usa logs debug
para credenciales/sesión, por debajo del nivel configurado por defecto (warn).
Sentry no tiene DSN configurado. No se identificó aquí el mismo volcado de
headers de la API; **falta comprobar en ejecución errores web con marcador**.
Esta revisión acotada no afirma que todo log posible esté libre de secretos.
La ronda 2 mantiene la web sin parches y agrega guardas de configuración: debug
ausente/vacío, nivel warn o superior, con las rutas de riesgo residual en README/PATCHES.
La ronda 3 documenta además que `defaultResponder.ts:56`, `tracing/index.ts:72`
y `parseRequestData.ts:36` pueden registrar URL con query en errores aun con
warn. El nivel de log no elimina ese riesgo y la web continúa sin parche v1.

No se modifican autenticación, reservas, mails ni idioma. El reporte a terceros
queda pendiente de decisión de Juanma después del lanzamiento; no se contactó
a cal.diy ni se abrió issue/PR upstream.
