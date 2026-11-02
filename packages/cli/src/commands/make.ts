/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MAKE COMMAND — Generadores de scaffolding (estilo artisan / manage.py)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Un modelo (defineModelo, ver modelos.ts y docs/agents/models.md):
 *   kitsuden make model note --kon notas   → packages/kons/kon-notas/src/note.modelo.ts
 *
 * Kon entero (ver make-kon.ts):
 *   kitsuden make kon recipes            → packages/kons/kon-recipes/ + tests/unit/kon-recipes.test.ts
 *
 * Dentro de un kon (la forma de los kons reales: ficheros planos en su raíz):
 *   kitsuden make policy Draft --kon blog  → añade definePolicy("blog-draft") a
 *                                            register<Blog>Policy() en <kon>/blog.policy.ts
 *                                            (crea el fichero si no existe)
 *   kitsuden make request CreatePost --kon blog → <kon>/create-post.request.ts
 *   kitsuden make job SendEmail --kon blog      → <kon>/send-email.job.ts
 *   kitsuden make test payment --kon blog       → tests/unit/kon-blog-payment.test.ts (vitest)
 *
 * En la app (apps/api):
 *   kitsuden make request CreatePost   → apps/api/src/requests/create-post.request.ts
 *   kitsuden make job SendEmail        → apps/api/src/jobs/send-email.job.ts
 *   kitsuden make test payment         → apps/api/src/tests-unit/payment.test.ts (bun:test)
 *
 * ── POR QUÉ `policy` EXIGE --kon ───────────────────────────────────────────
 *
 * Antes generaba `apps/api/src/policies/<x>.policy.ts`, una carpeta que no
 * existe en el repo y que nada importa: la policy quedaba sin registrar y el
 * recurso, denegado para todos (deny-by-default) sin ningún aviso. Las
 * policies reales viven en el kon dueño del recurso (`<kon>.policy.ts`, con
 * `register<Kon>Policy()` llamada al importarse) o en packages/core.
 *
 * Los tests de un kon van a tests/unit y con vitest: `mock.module` de bun se
 * filtra entre ficheros, y la suite de kons con el stack limpio es la de
 * vitest.
 */

import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import chalk from "chalk";

import { encontrarRaizDelRepo, makeKonCommand } from "./make-kon.js";
import { makeModel } from "./modelos.js";

type MakeKind = "kon" | "model" | "policy" | "request" | "job" | "test";
const VALIDOS: MakeKind[] = ["kon", "model", "policy", "request", "job", "test"];

export interface MakeOptions {
  force?: boolean;
  kon?: string;
  /** make model: carpeta donde va el modelo (la app, p. ej. apps/api/src/modelos). */
  dir?: string;
  root?: string;
  icon?: string;
  title?: string;
  description?: string;
}

function toKebab(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}
function toPascal(s: string): string {
  return s
    .replace(/[-_\s]+(.)?/g, (_, ch) => (ch ? ch.toUpperCase() : ""))
    .replace(/^(.)/, (_, ch) => ch.toUpperCase());
}
function toCamel(s: string): string {
  const p = toPascal(s);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

interface Destino {
  raiz: string;
  /** Carpeta del kon (packages/kons/kon-x) o null para la app. */
  dirKon: string | null;
  /** Nombre corto del kon, sin prefijo (blog para kon-blog). */
  konCorto: string | null;
}

function resolverDestino(opciones: MakeOptions): Destino {
  const raiz = opciones.root ? path.resolve(opciones.root) : encontrarRaizDelRepo(process.cwd());
  if (!raiz) {
    throw new Error(
      "Not inside a Kitsuden monorepo (no pnpm-workspace.yaml with packages/kons above). Pass --root <repo>."
    );
  }
  if (!opciones.kon) return { raiz, dirKon: null, konCorto: null };

  const konCorto = toKebab(opciones.kon).replace(/^kon-/, "");
  const dirKon = path.join(raiz, "packages", "kons", `kon-${konCorto}`);
  if (!existsSync(path.join(dirKon, "kon.json"))) {
    throw new Error(
      `packages/kons/kon-${konCorto} does not exist. Create it first: kitsuden make kon ${konCorto}`
    );
  }
  return { raiz, dirKon, konCorto };
}

// ── policy ──────────────────────────────────────────────────────────────────

function bloqueDePolicy(recurso: string, Pascal: string): string {
  return `  // ${Pascal}: deny-by-default. Ajusta las reglas; una acción sin regla se deniega.
  definePolicy<${Pascal}Recurso>("${recurso}", {
    view: (user, r) => r.published === true || user?.role === "admin" || user?.role === "editor",
    create: (user) => user?.role === "admin" || user?.role === "editor",
    update: (user) => user?.role === "admin" || user?.role === "editor",
    delete: (user) => user?.role === "admin",
  });
`;
}

function interfazDePolicy(Pascal: string): string {
  return `export interface ${Pascal}Recurso {
  published?: boolean | null;
}
`;
}

/**
 * Policy dentro de un kon: un único `<kon>.policy.ts` con
 * `register<Kon>Policy()`, como kon-booking o kon-directory.
 */
async function makePolicy(nombre: string, d: Destino): Promise<string[]> {
  if (!d.dirKon || !d.konCorto) {
    throw new Error(
      "Policies live in the kon that owns the resource: use --kon <name> " +
        "(e.g. kitsuden make policy Draft --kon blog). apps/api has no policies folder that anything loads."
    );
  }
  const k = d.konCorto;
  const K = toPascal(k);
  const kebab = toKebab(nombre);
  const recurso = kebab === k ? k : `${k}-${kebab}`;
  const Pascal = toPascal(nombre);
  const fichero = path.join(d.dirKon, `${k}.policy.ts`);
  const registrar = `register${K}Policy`;

  if (!existsSync(fichero)) {
    const contenido = `/**
 * ${K} — Política de autorización
 * ============================================================================
 * Deny-by-default. Importar este módulo registra las policies del kon.
 * \`${registrar}()\` existe porque las pruebas llaman a \`resetAuthz()\` y hay
 * que volver a registrarlas.
 */
import { definePolicy } from "@kitsuden/engine";

${interfazDePolicy(Pascal)}
export function ${registrar}(): void {
${bloqueDePolicy(recurso, Pascal)}}

${registrar}();
`;
    await fs.writeFile(fichero, contenido, "utf8");
    return [
      `created ${fichero}`,
      `wire it: in ${k}.routes.ts add \`import { ${registrar} } from "./${k}.policy";\` and call ${registrar}() at module level`,
      `publish it: add "${k}.policy.ts" to files[] in package.json`,
      `use it: await authorize(user, "update", resource, "${recurso}")`,
    ];
  }

  const fuente = await fs.readFile(fichero, "utf8");
  if (fuente.includes(`"${recurso}"`)) {
    throw new Error(`${path.basename(fichero)} already defines a policy "${recurso}"`);
  }
  const apertura = new RegExp(`export function ${registrar}\\(\\)(?::\\s*void)?\\s*\\{\\n`);
  const m = fuente.match(apertura);
  if (!m || m.index === undefined) {
    throw new Error(
      `${path.basename(fichero)} has no \`export function ${registrar}(): void {\`. ` +
        `Add this inside the function that registers the kon's policies:\n\n${bloqueDePolicy(recurso, Pascal)}`
    );
  }
  const corte = m.index + m[0].length;
  let nueva = fuente.slice(0, corte) + bloqueDePolicy(recurso, Pascal) + fuente.slice(corte);
  // La interfaz, justo antes de la función de registro.
  nueva = nueva.replace(m[0], `${interfazDePolicy(Pascal)}\n${m[0]}`);
  if (!/import\s*\{[^}]*\bdefinePolicy\b[^}]*\}\s*from\s*"@kitsuden\/engine"/.test(nueva)) {
    nueva = `import { definePolicy } from "@kitsuden/engine";\n${nueva}`;
  }
  await fs.writeFile(fichero, nueva, "utf8");
  return [
    `added policy "${recurso}" to ${registrar}() in ${fichero}`,
    `use it: await authorize(user, "update", resource, "${recurso}")`,
  ];
}

// ── request / job / test ────────────────────────────────────────────────────

function plantilla(
  kind: "request" | "job" | "test",
  name: string,
  d: Destino
): { file: string; content: string; notas: string[] } {
  const kebab = toKebab(name);
  const Pascal = toPascal(name);
  const camel = toCamel(name);
  const app = path.join(d.raiz, "apps", "api", "src");
  const enKon = (f: string) => path.join(d.dirKon!, f);
  const publicar = d.dirKon
    ? [`publish it: add the file to files[] in the kon's package.json once index.ts imports it`]
    : [];

  switch (kind) {
    case "request":
      return {
        file: d.dirKon
          ? enKon(`${kebab}.request.ts`)
          : path.join(app, "requests", `${kebab}.request.ts`),
        notas: publicar,
        content: `import { validateRequest, validated } from "@kitsuden/engine";
import { z } from "@kitsuden/engine/zod";
import type { Context } from "hono";

/** Esquema de la request ${Pascal}. */
export const ${Pascal}Schema = z.object({
  // TODO: define tus campos
  title: z.string().min(1, "El título es obligatorio"),
});

export type ${Pascal}Input = z.infer<typeof ${Pascal}Schema>;

/** Middleware listo para usar: router.post("/x", ${camel}Request, handler). */
export const ${camel}Request = validateRequest(${Pascal}Schema, "json");

/** Lee los datos validados y tipados dentro del handler. */
export const get${Pascal} = (c: Context): ${Pascal}Input => validated<${Pascal}Input>(c, "json");
`,
      };

    case "job":
      return {
        file: d.dirKon ? enKon(`${kebab}.job.ts`) : path.join(app, "jobs", `${kebab}.job.ts`),
        notas: publicar,
        content: `export interface ${Pascal}Payload {
  // TODO: define el payload del job
  id: string;
}

/**
 * Job ${Pascal}. Ejecutado por el worker/queue.
 */
export async function ${camel}Job(payload: ${Pascal}Payload): Promise<void> {
  console.log("[job:${camel}] start", payload);
  // TODO: implementar
  console.log("[job:${camel}] done");
}
`,
      };

    case "test":
      if (d.dirKon) {
        return {
          file: path.join(d.raiz, "tests", "unit", `kon-${d.konCorto}-${kebab}.test.ts`),
          notas: [`run it: pnpm test:unit -- kon-${d.konCorto}-${kebab}`],
          content: `import { describe, expect, it } from "vitest";

describe("kon-${d.konCorto}: ${Pascal}", () => {
  it("TODO: escribe tu primera aserción", () => {
    expect(true).toBe(true);
  });
});
`,
        };
      }
      return {
        file: path.join(app, "tests-unit", `${kebab}.test.ts`),
        notas: [`run it: pnpm test:api -- ${kebab}`],
        content: `import { describe, it, expect } from "bun:test";

describe("${Pascal}", () => {
  it("TODO: escribe tu primera aserción", () => {
    expect(true).toBe(true);
  });
});
`,
      };
  }
}

export async function makeCommand(
  kind: string,
  name: string,
  options: MakeOptions = {}
): Promise<void> {
  if (!VALIDOS.includes(kind as MakeKind)) {
    console.error(chalk.red(`Unknown kind '${kind}'. Use: ${VALIDOS.join(" | ")}`));
    process.exit(1);
  }
  if (!name) {
    console.error(chalk.red(`Missing name. Example: kitsuden make ${kind} MyName`));
    process.exit(1);
  }

  // defineModelo (fase H3): docs/agents/models.md
  if (kind === "model") {
    try {
      const notas = await makeModel(name, { kon: options.kon, dir: options.dir, root: options.root, force: options.force });
      console.log(chalk.green("✔ model"));
      for (const n of notas) console.log(`  ${n}`);
    } catch (e) {
      console.error(chalk.red(`✖ ${(e as Error).message}`));
      process.exit(1);
    }
    return;
  }

  if (kind === "kon") {
    if (options.kon) {
      console.error(chalk.red("`make kon` takes the kon name as its argument, not --kon"));
      process.exit(1);
    }
    await makeKonCommand(name, options);
    return;
  }

  try {
    const destino = resolverDestino(options);
    const etiqueta = destino.konCorto
      ? chalk.magenta(`[kon-${destino.konCorto}]`)
      : chalk.gray("[app]");

    if (kind === "policy") {
      const notas = await makePolicy(name, destino);
      console.log(chalk.green("✔ policy") + ` ${etiqueta}`);
      for (const n of notas) console.log(`  ${n}`);
      return;
    }

    const { file, content, notas } = plantilla(kind as "request" | "job" | "test", name, destino);
    if (existsSync(file) && !options.force) {
      throw new Error(`Already exists: ${file} (use --force to overwrite)`);
    }
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, "utf8");
    console.log(chalk.green(`✔ ${kind}`) + ` ${etiqueta} ` + path.relative(process.cwd(), file));
    for (const n of notas) console.log(`  ${n}`);
  } catch (e) {
    console.error(chalk.red(`✖ ${(e as Error).message}`));
    process.exit(1);
  }
}
