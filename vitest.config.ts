/**
 * Config raíz de Vitest.
 *
 * Sin este archivo, un `npx vitest run` a secas no encuentra configuración y
 * barre el repo entero con los patrones por defecto: recoge las pruebas de
 * Bun (`import "bun:test"` → "Cannot find package"), las de Playwright
 * ("did not expect test.describe() to be called here"), las de Svelte
 * (`$state is not defined`) y hasta los worktrees de `.claude/`, que son
 * copias completas del repo. Resultado: 130 archivos en rojo y la impresión
 * de que el proyecto está roto cuando no lo está.
 *
 * Reexportar la config de la suite unitaria hace que el comando obvio haga lo
 * correcto. `pnpm test` sigue siendo la entrada documentada (unitarias + la
 * suite de Bun de apps/api, que es un runner distinto y no se puede fusionar
 * aquí); esto solo evita el tropiezo.
 */
export { default } from "./tests/unit/vitest.config";
