# Ensayo de actualización · 17/10/2026

Upstream `main` sigue en `54343aa685ae8f33159d2f485ec4a57bad5c574a`; no hay
SHA posterior. Se aplica la alternativa autorizada por el orquestador.

Rama publicada: `rbln-update-rehearsal-20261017`.

1. Base anterior: `c339c9c47998d5213aab7701c99aa246db4619d3`.
2. Cherry-pick de los seis commits propios hasta `ec2ae67c8a`, preservando
   Dockerfile, workflow, sync, configuración, wizard y runbook.
3. `git merge --no-ff 54343aa685ae8f33159d2f485ec4a57bad5c574a`: limpio, sin
   conflictos. Solo entraron las dos líneas de corrección de CacheProvider de
   upstream en `apps/web/app/providers.tsx` y `apps/web/pages/_app.tsx`.
4. Merge resultante: `cef4473617a16bce9ec30bb5242c821ef5d87794`.
   Árbol `3ddce9ce55ae86f01e624f108ec1bd74def104ed`.
5. `git diff --exit-code refs/heads/rbln HEAD --`: exit 0. El árbol coincide
   exactamente con `rbln` en `ec2ae67c8a`; parches conservados.

No hubo build local. [CI de tooling](https://github.com/juanmateixido/rbln-cal/actions/runs/39038927476)
verde para ese árbol (cinco pruebas del sync, sintaxis, Biome, type-check
incremental del configurador y wizard seco).

Primera pasada de código; el ensayo completo con imágenes y runtime se cerró
en la repetición de abajo. El merge limpio solo no sustituye esa prueba.

## Repetición con el parche de privacidad completo

17/10, después del merge del PR #1. Rama publicada:
`rbln-update-rehearsal-privacy-20261017`.

- Misma base anterior `c339c9c47998d5213aab7701c99aa246db4619d3`.
- Se aplica el diff propio completo de `54343aa` a
  `c9521d3cf8a3e4b081fd48bfd8f15abc4e0ce388`, incluyendo el parche aprobado
  por Sol y los scripts de operación. Commit de aplicación: `45a09eccf1`.
- Merge del ancla limpio: `7d916c70353d0248bfbde12d35b934d4583b3685`.
- Árbol `dc07f0ff1d5715d1aa0a7f71403bb89cd9db3726`, idéntico a `rbln`
  en `c9521d3`; `git diff --exit-code` devuelve 0.
- [CI de tooling de ese árbol](https://github.com/juanmateixido/rbln-cal/actions/runs/39042256277): verde.
- [Build de imágenes del merge de ensayo](https://github.com/juanmateixido/rbln-cal/actions/runs/39042366070): ambos jobs verdes, imágenes públicas publicadas.

Esta repetición conserva también los archivos de privacidad del fork y pasa
el ensayo de runtime aislado descrito abajo.

Entorno de ensayo creado vacío (sin duplicar configuración de producción):
`dc2cb79c-a017-4b84-b3df-68f012d26b5d`, `update-rehearsal-20261017`, dentro de
`rbln-cal`. Postgres, Redis y sink están en SUCCESS. Volúmenes propios:
`e2c96c5e-fc40-419a-8bcb-086685aacff5` y
`0f754d57-6eda-4ab2-a3e9-6b82e67ed946`. Ningún volumen productivo reutilizado.
Las variables se leyeron exclusivamente con bee-lector; se conservan las
fuentes de secretos existentes, y las URLs de DB/Redis usan referencias de
Railway a esos servicios de ensayo. SMTP apunta a `rehearsal-sink` en captura.
No se configuró Google. Se creó una cuenta fixture por el registro web, con la
clave inicial de bootstrap leída desde Infisical. Las sesiones figuran en
`agent-sessions.jsonl`; esa clave compartida se inutilizó en el ensayo antes
de apagarlo, sin cambiar la cuenta de producción.

## Runtime y cierre de P-08

Imágenes construidas por Actions y desplegadas por digest: ver
`update-rehearsal-deployment.json`. `/health` y web responden 200.
`update-rehearsal-runtime.json` registra a las 15:25:07 UTC: API key 200,
anónimo 401, PENDING creado, slot ocupado tras 3,2 s, segundo POST rechazado
400, confirmación y relectura accepted, confirmación repetida 400,
reprogramación/cancelación/rechazo correctos, cinco triggers firmados y
ninguna reserva sintética activa al terminar. La lectura inmediata del slot
sigue dentro del TTL de 2.000 ms, igual que en producción.

El cierre tiene horas exactas en `update-rehearsal-cleanup.json`: revocación
de la clave por UI y comprobación 401; borrado de `RBLN /cal REHEARSAL_API_KEY`
y lectura Viewer 404; aviso a secrets-vault; rotación de la contraseña fixture
a un valor aleatorio descartado y rechazo explícito de la inicial; parada
de los cinco servicios y, por la última orden del orquestador, borrado completo
del entorno y de sus dos volúmenes. No se tocaron recursos productivos ni `/crm`.

Sesión de 15:25:42: interrumpida por reinicio del orquestador, **sin logout
verificado**; no quedó proceso de navegador ni storageState persistido. Ocurrió
en el entorno aislado. Un segundo intento tuvo un timeout de automatización,
también registrado sin afirmar logout. Las sesiones siguientes cerraron por
signout verificado, borrado de cookies y cierre de contexto/navegador.

**Criterio 11 / P-08: PASS.** El merge conserva los parches y el runtime aislado
repite T0. El identificador de la imagen de producción no cambia por el ensayo.

Cierre verificado el **17/10/2026 a las 15:35:06 UTC**: `environment.deletedAt`
= 15:34:24.781Z; solo queda `production` en el proyecto, los cinco servicios de
ensayo ya no aparecen y el entorno no tiene instancias de volumen. Las dos
mutaciones `volumeDelete` fueron aceptadas a las 15:33:35 UTC. Los objetos de
volumen pueden seguir listados durante la [retención de eliminación de hasta
48 horas de Railway](https://docs.railway.com/volumes/reference); esto no es un
entorno activo ni una cuenta accesible. La contraseña inicial ya fue rechazada
antes de eliminarlo. No se afirma una purga física inmediata del proveedor.
