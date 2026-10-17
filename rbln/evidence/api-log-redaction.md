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
completa con marcador ficticio queda pendiente del deployment sin parches.

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
real y contraste rojo contra `54343aa` corre en `rbln-log-tests.yml` de CI;
**resultado pendiente al preparar esta revisión**, no se construye Cal en bee.

**Reproducción HTTP y log real: PENDIENTES.** No sustituirlas por este test.
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

No se modifican autenticación, reservas, mails ni idioma. El reporte a terceros
queda pendiente de decisión de Juanma después del lanzamiento; no se contactó
a cal.diy ni se abrió issue/PR upstream.
