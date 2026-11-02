/**
 * `kitsuden makemigrations` sobre defineModelo: el diff produce el ALTER justo
 * ============================================================================
 *
 * Dos niveles:
 *
 *   1. El diff puro (`generarMigracionDeModelos`): de la instantánea guardada
 *      del kon de demostración a un modelo cambiado. El SQL generado se APLICA
 *      sobre PGlite encima de 0000_models.sql y se comprueba la tabla que deja.
 *   2. El CLI de verdad (`generarMigracionesDeModelos`, que carga los modelos
 *      con bun): en una copia del fixture escribe 0000 idéntico al del repo,
 *      no escribe nada si no hay cambios, y tras editar el fichero del modelo
 *      escribe 0001 con el ALTER. Necesita `bun` en el PATH y
 *      `@kitsuden/shared` compilado (`pnpm --filter @kitsuden/shared build`).
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import {
  campo,
  defineModelo,
  generarMigracionDeModelos,
  instantaneaDeModelos,
  type Instantanea,
} from "@kitsuden/shared";
import { afterAll, describe, expect, it } from "vitest";

import { generarMigracionesDeModelos, makeModel, siguienteNumero } from "../../packages/cli/src/commands/modelos";

import { category, note } from "./fixtures/kon-notas/notas.modelo";

const RAIZ = resolve(__dirname, "../..");
const FIXTURE = join(__dirname, "fixtures", "kon-notas");
const leer = (ruta: string) => readFileSync(ruta, "utf8");
const instantanea = JSON.parse(leer(join(FIXTURE, "migrations", "modelos.snapshot.json"))) as Instantanea;

/** El modelo de notas, cambiado como lo cambiaría alguien una semana después. */
const notaV2 = defineModelo({
  nombre: "note",
  etiqueta: "Note",
  descripcion: "A personal note. Each account sees only its own.",
  campos: {
    title: campo.texto({ max: 300, requerido: true }), // 200 → 300
    content: campo.textoLargo({ antes: "body" }), // renombrado
    status: campo.enumerado(["draft", "published", "archived"], { requerido: true, porDefecto: "draft" }), // + archived
    priority: campo.entero({ min: 0, max: 10, requerido: true, porDefecto: 0 }), // max 5 → 10
    pinned: campo.booleano({ requerido: true, porDefecto: false }),
    dueAt: campo.fecha(),
    slug: campo.texto({ max: 80 }), // ya no es único
    color: campo.texto({ max: 20, requerido: true, porDefecto: "gray" }), // nuevo, obligatorio con valor
    // meta: quitado → destructivo, sale comentado
  },
  acceso: { leer: "dueno", escribir: "dueno" },
});

describe("el diff (puro)", () => {
  it("sin cambios no hay migración", () => {
    const r = generarMigracionDeModelos(instantanea, [note, category], { kon: "notas" });
    expect(r.sql).toBe("");
    expect(r.cambios).toEqual([]);
  });

  it("la instantánea del repo es la de los modelos declarados", () => {
    expect(instantaneaDeModelos([category, note], "notas")).toEqual(instantanea);
  });

  const r = generarMigracionDeModelos(instantanea, [notaV2, category], { kon: "notas" });

  it("produce los ALTER de cada cambio, y nada para lo que no cambió", () => {
    expect(r.sql).toContain('ALTER TABLE "notes" ALTER COLUMN "title" TYPE varchar(300) USING "title"::varchar(300);');
    expect(r.sql).toContain('ALTER TABLE "notes" RENAME COLUMN "body" TO "content";');
    expect(r.sql).toContain('ALTER TABLE "notes" DROP CONSTRAINT IF EXISTS "notes_status_check";');
    expect(r.sql).toContain(`ADD CONSTRAINT "notes_status_check" CHECK ("status" IN ('draft', 'published', 'archived'));`);
    expect(r.sql).toContain(`ADD CONSTRAINT "notes_priority_check" CHECK ("priority" >= 0 AND "priority" <= 10);`);
    expect(r.sql).toContain('ALTER TABLE "notes" DROP CONSTRAINT IF EXISTS "notes_slug_key";');
    expect(r.sql).toContain(`ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "color" varchar(20) NOT NULL DEFAULT 'gray';`);
    expect(r.sql).toContain('-- DESTRUCTIVE (skipped; re-run with --allow-destructive to emit it): ALTER TABLE "notes" DROP COLUMN IF EXISTS "meta";');
    expect(r.sql).not.toContain('"categories"');
    expect(r.sql).not.toContain("CREATE POLICY"); // la política no cambió
    expect(r.avisos.join("\n")).toMatch(/meta/);
  });

  it("aplicado sobre la 0000 deja la tabla que describe el modelo nuevo", async () => {
    const pg = new PGlite();
    try {
      await pg.exec(leer(resolve(RAIZ, "apps/api/src/db/funciones-de-agente.sql")));
      await pg.exec(leer(join(FIXTURE, "migrations", "0000_models.sql")));
      await pg.exec("INSERT INTO notes (title, body, owner_id) VALUES ('antes', 'cuerpo viejo', 'ana')");
      await pg.exec(r.sql);
      const cols = await pg.query<{ column_name: string; data_type: string; len: number | null }>(
        "SELECT column_name, data_type, character_maximum_length AS len FROM information_schema.columns WHERE table_name = 'notes' ORDER BY column_name"
      );
      const por = Object.fromEntries(cols.rows.map((c) => [c.column_name, c]));
      expect(por.title?.len).toBe(300);
      expect(por.content).toBeDefined();
      expect(por.body).toBeUndefined();
      expect(por.meta).toBeDefined(); // el DROP salió comentado
      // El renombre conserva los datos; el campo nuevo toma su valor por defecto.
      const fila = await pg.query<{ content: string; color: string }>("SELECT content, color FROM notes");
      expect(fila.rows[0]).toEqual({ content: "cuerpo viejo", color: "gray" });
      // La CHECK nueva admite «archived» y sigue rechazando lo demás.
      await pg.exec("INSERT INTO notes (title, status, priority, owner_id) VALUES ('x', 'archived', 9, 'ana')");
      await expect(pg.exec("INSERT INTO notes (title, status, owner_id) VALUES ('x', 'borrado', 'ana')")).rejects.toThrow(/check/);
      // slug ya no es único.
      await pg.exec("INSERT INTO notes (title, slug, owner_id) VALUES ('a', 's', 'ana'), ('b', 's', 'ana')");
    } finally {
      await pg.close();
    }
  });

  it("con --allow-destructive el DROP sale de verdad", () => {
    const d = generarMigracionDeModelos(instantanea, [notaV2, category], { kon: "notas", permitirDestructivo: true });
    expect(d.sql).toMatch(/^ALTER TABLE "notes" DROP COLUMN IF EXISTS "meta";$/m);
  });

  it("un campo obligatorio NUEVO sin valor por defecto se niega (fallaría con filas)", () => {
    const mala = defineModelo({
      nombre: "note",
      descripcion: "x",
      campos: { ...note.campos, owner2: campo.texto({ requerido: true }) },
      acceso: note.acceso,
    });
    expect(() => generarMigracionDeModelos(instantanea, [mala, category], { kon: "notas" })).toThrow(/default/);
  });

  it("cambiar la política de acceso rehace las cuatro políticas RLS", () => {
    const publica = defineModelo({
      nombre: "category",
      plural: "categories",
      etiqueta: category.etiqueta,
      descripcion: category.descripcion,
      campos: category.campos,
      acceso: { leer: "publico", escribir: "staff" },
    });
    const otra = defineModelo({ nombre: "note", descripcion: note.descripcion, campos: note.campos, acceso: { leer: "dueno", escribir: "staff" } });
    const c = generarMigracionDeModelos(instantanea, [otra, publica], { kon: "notas" });
    expect(c.cambios).toEqual(["access policy of note: leer=dueno, escribir=staff"]);
    expect(c.sql.match(/CREATE POLICY/g)).toHaveLength(4);
    expect(c.sql).toContain("kitsuden_staff_efectivo('notas')");
  });

  it("quitar un modelo no borra su tabla salvo que se pida", () => {
    const c = generarMigracionDeModelos(instantanea, [note], { kon: "notas" });
    expect(c.sql).toContain('-- DESTRUCTIVE (skipped; re-run with --allow-destructive to emit it): DROP TABLE IF EXISTS "categories";');
  });
});

// ── El CLI de verdad ────────────────────────────────────────────────────────

const COPIA = join(__dirname, "fixtures", `.tmp-makemigrations-${process.pid}`);
afterAll(() => rmSync(COPIA, { recursive: true, force: true }));

describe("kitsuden makemigrations (CLI, carga los modelos con bun)", () => {
  it("en una copia sin migraciones escribe 0000 idéntico al del repo; sin cambios no escribe; tras editar, 0001 con el ALTER", async () => {
    mkdirSync(COPIA, { recursive: true });
    cpSync(join(FIXTURE, "kon.json"), join(COPIA, "kon.json"));
    cpSync(join(FIXTURE, "notas.modelo.ts"), join(COPIA, "notas.modelo.ts"));

    const [primera] = await generarMigracionesDeModelos({ dir: COPIA });
    expect(primera?.destino.kon).toBe("notas");
    expect(primera?.fichero).toBe(join(COPIA, "migrations", "0000_models.sql"));
    expect(leer(primera!.fichero!)).toBe(leer(join(FIXTURE, "migrations", "0000_models.sql")));
    expect(JSON.parse(leer(join(COPIA, "migrations", "modelos.snapshot.json")))).toEqual(instantanea);
    // El script de un solo uso se borra.
    expect(existsSync(join(COPIA, `__kitsuden_makemigrations_${process.pid}.ts`))).toBe(false);

    const [segunda] = await generarMigracionesDeModelos({ dir: COPIA });
    expect(segunda?.fichero).toBeNull();

    const modelo = leer(join(COPIA, "notas.modelo.ts"));
    writeFileSync(join(COPIA, "notas.modelo.ts"), modelo.replace("max: 200, requerido: true", "max: 300, requerido: true"));
    const [tercera] = await generarMigracionesDeModelos({ dir: COPIA, name: "longer titles" });
    expect(tercera?.fichero).toBe(join(COPIA, "migrations", "0001_longer_titles.sql"));
    expect(tercera?.cambios).toEqual(["change type of note.title: varchar(200) → varchar(300)"]);
    expect(leer(tercera!.fichero!)).toContain('ALTER TABLE "notes" ALTER COLUMN "title" TYPE varchar(300)');
    expect(siguienteNumero(join(COPIA, "migrations"))).toBe("0002");

    // --dry-run no escribe.
    writeFileSync(join(COPIA, "notas.modelo.ts"), modelo.replace("max: 200, requerido: true", "max: 400, requerido: true"));
    const [ensayo] = await generarMigracionesDeModelos({ dir: COPIA, dryRun: true });
    expect(ensayo?.sql).toContain("varchar(400)");
    expect(existsSync(ensayo!.fichero!)).toBe(false);
  }, 120_000);

  it("make model genera un modelo que se declara sin errores (y exige dónde va)", async () => {
    mkdirSync(COPIA, { recursive: true });
    const notas = await makeModel("TaskItem", { dir: join(COPIA, "modelos") });
    expect(notas[0]).toContain("task-item.modelo.ts");
    const mod = (await import(join(COPIA, "modelos", "task-item.modelo.ts"))) as Record<string, { nombre: string; acceso: unknown }>;
    expect(mod.taskItem?.nombre).toBe("task-item");
    expect(mod.taskItem?.acceso).toEqual({ leer: "dueno", escribir: "dueno" });
    await expect(makeModel("x", {})).rejects.toThrow(/--kon|--dir/);
    await expect(makeModel("TaskItem", { dir: join(COPIA, "modelos") })).rejects.toThrow(/Already exists/);
  });
});
