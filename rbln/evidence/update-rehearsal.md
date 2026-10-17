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

**Pendiente para criterio 11 completo:** CI de imágenes, despliegue del merge
en entorno de ensayo con DB/Redis aislados y T0 abreviado. El merge limpio y la
igualdad de árbol no sustituyen esa prueba de runtime.

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
- [Build de imágenes del merge de ensayo](https://github.com/juanmateixido/rbln-cal/actions/runs/39042366070): en curso al registrar este paso.

Sigue pendiente el ensayo de runtime aislado; esta repetición demuestra que
el merge conserva también los archivos de privacidad añadidos al fork.

Entorno de ensayo creado vacío (sin duplicar configuración de producción):
`dc2cb79c-a017-4b84-b3df-68f012d26b5d`, `update-rehearsal-20261017`, dentro de
`rbln-cal`. Postgres, Redis y sink están en SUCCESS. Volúmenes propios:
`e2c96c5e-fc40-419a-8bcb-086685aacff5` y
`0f754d57-6eda-4ab2-a3e9-6b82e67ed946`. Ningún volumen productivo reutilizado.
Las variables se leyeron exclusivamente con bee-lector; se conservan las
fuentes de secretos existentes, y las URLs de DB/Redis usan referencias de
Railway a esos servicios de ensayo. SMTP apunta a `rehearsal-sink` en captura.
No se configuró Google ni se abrió sesión de usuario en este entorno.
