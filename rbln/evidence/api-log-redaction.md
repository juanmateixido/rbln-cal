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

**Reproducción HTTP después del parche: PENDIENTE.** No sustituirla por tests.
Enviar un bearer, body y query inventados a una ruta inexistente de la imagen sin parche;
guardar el log con ese marcador visible en `rbln/evidence/local-only/`, excluido
de Git. Registrar deployment/digest, hora UTC y resultado sanitizado aquí.
Repetir con los mismos marcadores en la imagen parcheada: header `[REDACTED]`,
body/query ausentes, identificador conservado. Ninguna credencial real en la prueba.
Hasta completar ambos pasos y la revisión, no crear CAL_API_KEY_CRM ni abrir
ninguna sesión de Giuliana. SMTP captura y BOOKING_MODE off permanecen vigentes.

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
