# Admin Panel — Estado y Roadmap para Beta

> **Última actualización:** 2026-06-30
> **Versión:** 0.9.0-beta

---

## Estado general

El panel de administración **compila y builda exitosamente**, pero no está listo para beta pública sin los ajustes documentados aquí.

- `pnpm build` ✅ exitoso (~1m 30s, adapter-static)
- `svelte-check` ✅ 0 errores, ~71 warnings de a11y/CSS
- `pnpm test` ✅ configuración de Vitest resuelta (`$app/navigation` y `$app/stores` mockeados)

---

## Vistas funcionales (listas para beta)

| Ruta                           | Vista                        | Estado                                  |
| ------------------------------ | ---------------------------- | --------------------------------------- |
| `/` / `/dashboard`             | `Dashboard.svelte`           | ✅ Funcional, con links rotos conocidos |
| `/datasets`                    | CRUD de datasets             | ✅ Funcional                            |
| `/datasets/new`                | Creador de datasets          | ✅ Funcional                            |
| `/datasets/[id]/edit`          | Editor de schema             | ✅ Funcional                            |
| `/datasets/[id]/entries`       | Entradas JSONB               | ✅ Funcional                            |
| `/agents`                      | Agentes NHI                  | ✅ Funcional                            |
| `/agents/[id]`                 | Detalle de agente            | ✅ Funcional                            |
| `/agents/traces`               | Logs de agentes              | ✅ Funcional                            |
| `/actions`                     | Actions Engine               | ✅ Funcional                            |
| `/settings`                    | Configuración del sitio      | ✅ Funcional                            |
| `/kons`                        | Lista de kons                | ✅ Funcional                            |
| `/grimoires`                   | Gestión de grimoires         | ✅ Funcional                            |
| `/g/[id]` / `/g/[id]/[viewId]` | Renderizado dinámico de kons | ✅ Funcional                            |

---

## Vistas con problemas conocidos

| Problema                          | Ubicación                                  | Prioridad   | Nota                                                                  |
| --------------------------------- | ------------------------------------------ | ----------- | --------------------------------------------------------------------- |
| ~~Links rotos en dashboard~~      | `Dashboard.svelte`                         | ✅ Resuelto | Redirigidos a `/g/kon-*` y `/directory/org-chart`                     |
| ~~Tests de admin fallan~~         | `vitest.config.ts`                         | ✅ Resuelto | Mocks de `$app/navigation` y `$app/stores` agregados                  |
| ~~`/data-viewer` sin protección~~ | `src/routes/data-viewer/+page.svelte`      | ✅ Resuelto | Acceso restringido a usuarios con rol `admin`                         |
| Warnings masivos de a11y          | Múltiples vistas                           | **Alto**    | Reducidos de ~239 a ~71; resto es menor (labels descriptivos, @apply) |
| `EditorView.svelte` placeholder   | `src/views/system-tools/EditorView.svelte` | Medio       | Solo imprime greeting en consola                                      |
| Página de error global faltante   | `src/routes/+error.svelte`                 | Medio       | No existe                                                             |
| `console.log` de debug            | `LoginView.svelte`, `+layout.svelte`, etc. | Medio       | Ruido en producción                                                   |

---

## Links rotos del dashboard

Los siguientes accesos directos del dashboard deben corregirse:

- `/users` → redirigir a `/g/kon-directory` o crear ruta `/users`
- `/posts` → redirigir a `/g/kon-blog`
- `/media` → redirigir a `/g/kon-media`
- `/blocks` → redirigir a `/g/kon-blocks`

Alternativa para beta: usar URLs del kon correspondiente (`/g/kon-*`).

---

## Pendientes antes de beta

### Bloqueantes (resueltos)

1. ✅ Corregir links del dashboard.
2. ✅ Arreglar configuración de Vitest para tests de admin.

### Altos

3. ✅ Proteger `/data-viewer` detrás de rol super-admin o feature flag.
4. Reducir warnings restantes de a11y (labels descriptivos, `@apply`, elementos interactivos).
5. Agregar `+error.svelte` y manejo global de errores.

### Medios

6. ✅ Limpiar `console.log` de debug en `LoginView.svelte`.
7. Revisar `EditorView.svelte` placeholder.
8. Implementar code-splitting para reducir chunk principal (>500 kB).

---

## Notas técnicas

- Usa `adapter-static` con `fallback: "index.html"` (modo SPA).
- `ssr = false` y `prerender = false` en `+layout.ts`.
- Alias configurados: `$lib`, `$components`, `$views`, `$stores`, `$types`.
