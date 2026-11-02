# Operaciones: migraciones, RLS y copias de seguridad

Este documento existe porque las tres cosas que siguen se hacen **cuando algo
va mal**, y ese no es el momento de leer TypeScript.

---

## Lo primero, y solo una vez por base de datos

> **Si la base ya existe, ejecuta `--baseline` ANTES de nada.**

```bash
cd apps/api && bun run db:migrate:baseline
```

**Por qué.** Durante mucho tiempo no hubo runner: las 31 migraciones de
`src/db/migrations/` se aplicaban a mano con `psql`, y `db:migrate` era
`drizzle-kit`, que solo conocía 2. Tu base **ya tiene ese esquema**, pero el
historial está vacío.

`--baseline` marca todo lo presente como aplicado **sin ejecutarlo**. Sin ese
paso, el runner intentaría reaplicar 31 migraciones sobre datos reales.

Es un comando de una sola vez. En una base nueva y vacía **no lo uses**: ahí
quieres que las migraciones corran de verdad.

---

## Migraciones

```bash
bun run db:migrate            # aplicar pendientes + políticas RLS
bun run db:migrate:status     # qué hay aplicado y qué falta
bun run db:migrate:dry        # qué se ejecutaría, sin tocar nada
bun run db:migrate:baseline   # marcar sin ejecutar (base preexistente)
```

Aplica en este orden, que no es arbitrario:

1. `apps/api/drizzle/*.sql` — el esquema base generado por drizzle-kit
2. `apps/api/src/db/migrations/*.sql` — las manuales, que **extienden** ese base
3. Las políticas RLS (`rls-policies.sql` y `rls-owned-tables.sql`)

Cada fichero va en **una transacción**: si un statement falla, la migración
entera se deshace y el historial no la registra. No quedan medias migraciones.

El historial vive en la tabla `kitsuden_migrations`, con el checksum de cada
fichero.

### "Estas migraciones cambiaron DESPUÉS de aplicarse"

El runner se niega a seguir. **Es correcto que se niegue**: una migración
aplicada es historia, y editarla no la reaplica — la base y el repositorio
están diciendo cosas distintas.

Lo que hay que hacer es **añadir una migración nueva** que corrija. `--allow-drift`
existe para forzarlo, y solo debería usarse sabiendo exactamente por qué.

### "Faltan extensiones de Postgres"

La cadena necesita `vector` (pgvector) y `pg_trgm`. El runner lo comprueba
**antes** de aplicar nada, porque `CREATE EXTENSION IF NOT EXISTS` no protege:
falla solo si ya está creada, no si no está disponible.

En Docker, usa una imagen que las traiga:

```yaml
image: pgvector/pgvector:pg16
```

**En modo lite (PGlite) `vector` no existe.** Es un techo del modo lite, no un
error de configuración: brain y la búsqueda semántica no se pueden migrar ahí.
Se probó bajar PGlite a 0.3.x —donde sí está— y produce 100 errores de tipos en
la capa de consultas, así que se descartó.

### "La conexión usa X, que es SUPERUSUARIO"

Aviso, no error. **Postgres ignora RLS para superusuarios**, con `FORCE` y
todo: las políticas quedan decorativas y el aislamiento entre tenants no se
aplica. En producción, conéctate con un rol normal.

---

## Copias de seguridad

```bash
bun run db:backup          # crear (y verificar)
bun run db:backup:list     # listar
bun run db:restore <fich>  # restaurar (pide confirmación)
```

Variables: `BACKUP_DIR` (por defecto `./backups`) y `BACKUP_KEEP` (por defecto 7).

**Cada volcado se verifica al escribirlo**, leyendo su índice con
`pg_restore --list`. Si no se puede leer, se borra y el comando falla. Un backup
que nunca se ha leído no es un backup: es un fichero, y el día que se descubre
que estaba corrupto es por definición el peor día posible.

Formato `-Fc` (custom): comprimido y permite restaurar tablas sueltas. Un `.sql`
plano solo se restaura entero.

### Restaurar

```bash
bun run db:restore kitsuden-2026-08-15T10-30-00.dump
```

Muestra qué va a sobrescribir y **se niega a seguir**. Para confirmar de verdad:

```bash
bun run scripts/backup.ts --restore <fichero> --yes-i-am-sure
```

Después de restaurar, **ejecuta las migraciones**: la copia es del momento en
que se hizo y puede faltarle lo aplicado desde entonces.

```bash
bun run db:migrate
```

### Requisitos

`pg_dump` y `pg_restore` deben estar instalados, y su versión debe ser **igual o
mayor** que la del servidor — si es menor, `pg_dump` se niega a volcar. Es el
fallo más común al hacer copias desde otra máquina.

En el contenedor de la API:

```bash
apt-get install -y postgresql-client
```

**El modo lite no se copia con `pg_dump`.** PGlite guarda en disco local:
cópialo con el sistema de ficheros.

---

## Qué pasa en cada despliegue

`docker/start-with-check.sh`, paso 4, ejecuta `scripts/migrate.ts`. Eso aplica
las migraciones pendientes y las políticas RLS.

**Sin `||`**: si falla, el contenedor no arranca. Es lo que queremos. Antes ese
paso era `bunx drizzle-kit migrate || echo "No pending migrations"`, que aplicaba
2 de 31 **y se tragaba los errores** — una migración rota imprimía un mensaje
tranquilizador y la API arrancaba con el esquema a medias.

## Qué comprueba CI

En cada push, contra un Postgres real:

1. Construye el esquema **desde cero** aplicando la cadena completa
2. Ejecuta una **segunda pasada** y falla si aplica algo — una migración no
   idempotente rompe cualquier despliegue que se reintente
3. Corre los tests

Antes de esto CI levantaba Postgres y lanzaba los tests **sin crear el
esquema**, así que la cadena no se validaba nunca. Cuando por fin se ejecutó,
estaba rota: la migración 0020 usaba una columna que ninguna migración creaba,
porque los ficheros 0003–0019 no están en el repositorio.

### Guardianes: los tests que no prueban código

Dentro de la suite hay varios tests que no comprueban comportamiento sino
**invariantes del repositorio**. Si uno se pone en rojo no has roto una
función: has cruzado una línea que alguien dibujó a propósito. Todos llevan el
motivo en su cabecera y en el mensaje del fallo; aquí está el mapa.

| Guardián                                                   | Qué impide                                                                                                                                                | Cómo se sale del rojo                                                                                                                         |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/any-ratchet.test.ts`                           | Que crezca el número de `any` sin justificar                                                                                                              | Tipa lo que añadiste, o ponle un `eslint-disable-next-line @typescript-eslint/no-explicit-any -- <razón>`. Solo baja el techo, nunca lo subas |
| `tests/unit/ts-suppression-ratchet.test.ts`                | `@ts-ignore`/`@ts-expect-error` nuevos, y cualquiera sin explicación                                                                                      | Arregla el tipo, o explica la supresión en la misma línea                                                                                     |
| `tests/unit/kon-typecheck-coverage.test.ts`                | Kons que no declaran `typecheck` y que `pnpm -r typecheck` saltaría en silencio                                                                           | Añade `"typecheck": "tsc --noEmit"` y su `tsconfig.json`                                                                                      |
| `tests/unit/kon-loadable.test.ts`                          | Kons que el cargador daría por fallidos al arrancar ("no router or init found")                                                                           | Exporta `const kon = defineKon({ createRouter })`, un router de Hono o un `init*`                                                             |
| `tests/unit/enum-sin-castear.test.ts`                      | `eq(columna, valor as any)`: si la columna es un enum de Postgres, un valor que no pertenece hace fallar la consulta entera (500), no devolver cero filas | Usa `eqEnum(columna, valor)` de `@kitsuden/engine`                                                                                            |
| `tests/unit/mcp-args-validados.test.ts`                    | Herramientas MCP sin esquema: los argumentos los escribe un LLM y llegan hasta `.insert()`                                                                | Añade su entrada a `ESQUEMAS_ARGS` en `mcp-tools.ts`                                                                                          |
| `tests/unit/guard-drizzle-where.test.ts`                   | (en EJECUCIÓN) Segunda llamada a `.where()` sobre el mismo builder, venga de donde venga — también desde una función auxiliar                             | Pásate las CONDICIONES entre funciones, no el builder                                                                                         |
| `tests/unit/drizzle-where-encadenado.test.ts`              | Filtros acumulados con `q = q.where(...)` repetido: en Drizzle el segundo SUSTITUYE al primero y la consulta devuelve de más                              | Acumula en un array y llama a `.where(and(...condiciones))` una sola vez                                                                      |
| `tests/unit/engine-facade-cycles.test.ts`                  | Que un archivo que hace _deep import_ del engine importe además la fachada y reabra el ciclo                                                              | Haz deep import también de lo que falte (p. ej. `packages/engine/src/errors`)                                                                 |
| `apps/api/src/tests-unit/rls-coverage.test.ts`             | Tablas nuevas sin política RLS                                                                                                                            | Clasifica la tabla y añádele su política en `rls-policies.sql`                                                                                |
| `scripts/check-test-isolation.mjs` (`pnpm test:isolation`) | Tests que se contaminan entre sí                                                                                                                          | —                                                                                                                                             |

Cinco de ellos existen porque el fallo ya ocurrió: el de typecheck se escribió
después de descubrir que 13 de 29 kons no se comprobaban —y que por eso dos
archivos que **ni siquiera parseaban** convivían con un `pnpm typecheck` en
verde—; el de la fachada, después de que un `import` añadido por comodidad
reabriera un ciclo dos líneas por debajo del comentario que lo prohibía; y el de
carga, después de encontrar `kon-ecommerce` con esquema, servicio, policies,
migración y manifiesto, compilando y con sus pruebas en verde, siendo en
realidad una biblioteca que el cargador no podía montar.

El de `.where()` es el que más sitios destapó: siete, repartidos entre CRM,
esports, la biblioteca de medios, la exportación de datasets y las dos
implementaciones de batch. Todos con la misma forma —un filtro opcional por
`if`, que es como se escribe eso— y todos devolviendo o tocando de más sin dar
un solo error.

Un verde que miente cuesta más que un rojo.

---

## Distribuir kons

El núcleo (`kitsuden` + `@kitsuden/datasets`, `media`, `blocks`) es lo que
siempre va. Los 29 kons son paquetes npm independientes que se instalan a
demanda — ninguno es dependencia del núcleo.

```bash
pnpm run publish:kons:dry   # qué se publicaría, sin publicar
pnpm run publish:kons       # publicar todos
pnpm --filter @kitsuden/kon-crm publish   # solo uno
```

**Usa `pnpm publish`, nunca `npm publish`.** Las `peerDependencies` de un kon
declaran `"@kitsuden/shared": "workspace:*"`, que es un protocolo de pnpm.
`pnpm` lo reescribe a un rango real al empaquetar; `npm` lo deja tal cual y el
tarball resultante falla al instalarse con `EUNSUPPORTEDPROTOCOL`.

### Qué viaja en el paquete

Cada kon declara `files` con lo suyo. Tres cosas son obligatorias y hay que
mantenerlas si se toca:

- **`kon.json`** — el cargador lo LEE para sacar el id, el `mountPath` y las
  vistas del admin. Sin él, el kon se instala y no aparece.
- **`index.ts`** — el punto de entrada. Los kons publican TypeScript, no
  compilado, porque el host corre Bun e importa `.ts` directamente.
- **`migrations/`** — si el kon tiene tablas y no viajan sus migraciones, se
  instala y revienta al primer uso.

No viajan: `tsconfig.json`, `tests/`, `*.test.ts` ni notas de desarrollo.

### Instalar todo, activar poco

Los 28 kons pesan **3,9 MB de código fuente**. Van todos en la imagen a
propósito: activar uno es entonces un `UPDATE` sobre `installed_kons`, no un
build y un despliegue.

Solo cuatro nacen encendidos — `datasets`, `media`, `blocks` y `kon-blog`. El
resto se activan por base de datos.

Eso deja de servir el día que un kon sea de pago: el código estaría en la imagen
de todos. Para eso está `installed_kons.source`, que ya contempla `npm`,
`github` y `marketplace` — un kon comercial se instala desde un registro con
credenciales, no viaja en la imagen base.
