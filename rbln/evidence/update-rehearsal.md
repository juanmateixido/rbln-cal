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
