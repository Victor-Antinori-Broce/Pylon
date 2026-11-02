/**
 * Los manifiestos de los kons se validan
 * ============================================================================
 *
 * Cuatro `kon.json` declaraban `"$schema": "../../schemas/kon-schema.json"` y
 * ese fichero NO EXISTÍA. Nada validaba los manifiestos, y la deriva de forma
 * que eso permitió no era cosmética:
 *
 *   - kon-academy-lms (25 tablas) y kon-crm (6) las declaraban en
 *     `database.tables`. Ningún lector consulta ese campo: routes/modules.ts
 *     lee `manifest.tables`, así que el panel les contaba CERO tablas.
 *   - kon-agile tenía las dos listas a la vez y no coincidían: 8 arriba, 13
 *     en `database.tables`.
 *
 * El esquema vive en packages/schemas/kon-schema.json. El validador de aquí
 * es deliberadamente pequeño —cubre el subconjunto de draft-07 que el esquema
 * usa— porque el repositorio no tiene ajv y añadir una dependencia para esto
 * sería peor negocio que treinta líneas legibles.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { HAY_KONS_INSTALADOS } from "./helpers/kons-conocidos";

const RAIZ = join(__dirname, "..", "..");
const KONS = join(RAIZ, "packages", "kons");
const ESQUEMA = join(RAIZ, "packages", "schemas", "kon-schema.json");

function listarKons(): string[] {
  return readdirSync(KONS, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(KONS, e.name, "kon.json")))
    .map((e) => e.name);
}

const leer = (ruta: string) => JSON.parse(readFileSync(ruta, "utf8"));

// ── Validador mínimo de draft-07 (solo lo que este esquema usa) ─────────────

type Json = Record<string, unknown>;

function validar(dato: unknown, esquema: Json, ruta = ""): string[] {
  const fallos: string[] = [];
  const donde = ruta || "(raíz)";

  if (esquema.const !== undefined && dato !== esquema.const) {
    fallos.push(`${donde}: se esperaba ${JSON.stringify(esquema.const)}`);
    return fallos;
  }

  if (Array.isArray(esquema.enum) && !esquema.enum.includes(dato as never)) {
    fallos.push(`${donde}: ${JSON.stringify(dato)} no está en ${JSON.stringify(esquema.enum)}`);
    return fallos;
  }

  if (esquema.oneOf) {
    const alternativas = esquema.oneOf as Json[];
    if (!alternativas.some((alt) => validar(dato, alt, ruta).length === 0)) {
      fallos.push(`${donde}: no encaja en ninguna de las formas permitidas`);
    }
    return fallos;
  }

  const tipos = esquema.type
    ? Array.isArray(esquema.type)
      ? (esquema.type as string[])
      : [esquema.type as string]
    : [];
  if (tipos.length && !tipos.some((t) => esTipo(dato, t))) {
    fallos.push(`${donde}: se esperaba ${tipos.join("|")}, llegó ${tipoDe(dato)}`);
    return fallos;
  }

  if (typeof dato === "string") {
    if (typeof esquema.minLength === "number" && dato.length < esquema.minLength) {
      fallos.push(`${donde}: cadena vacía o demasiado corta`);
    }
    if (typeof esquema.pattern === "string" && !new RegExp(esquema.pattern).test(dato)) {
      fallos.push(`${donde}: "${dato}" no cumple ${esquema.pattern}`);
    }
  }

  if (Array.isArray(dato) && esquema.items) {
    dato.forEach((elem, i) =>
      fallos.push(...validar(elem, esquema.items as Json, `${donde}[${i}]`))
    );
  }

  if (dato && typeof dato === "object" && !Array.isArray(dato)) {
    const obj = dato as Json;

    for (const req of (esquema.required as string[]) || []) {
      if (!(req in obj)) fallos.push(`${donde}: falta la clave obligatoria "${req}"`);
    }

    // `not: { required: [...] }` — la usamos para prohibir database.tables
    const no = esquema.not as Json | undefined;
    for (const prohibida of (no?.required as string[]) || []) {
      if (prohibida in obj) fallos.push(`${donde}: la clave "${prohibida}" no está permitida aquí`);
    }

    const props = (esquema.properties as Record<string, Json>) || {};
    if (esquema.additionalProperties === false) {
      for (const clave of Object.keys(obj)) {
        if (!(clave in props)) fallos.push(`${donde}: clave no reconocida "${clave}"`);
      }
    }
    for (const [clave, sub] of Object.entries(props)) {
      if (clave in obj) fallos.push(...validar(obj[clave], sub, ruta ? `${ruta}.${clave}` : clave));
    }

    for (const rama of (esquema.allOf as Json[]) || []) {
      const cond = rama.if as Json | undefined;
      const entonces = rama.then as Json | undefined;
      if (cond && entonces && validar(obj, cond, ruta).length === 0) {
        fallos.push(...validar(obj, entonces, ruta));
      }
    }
  }

  return fallos;
}

function tipoDe(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (Number.isInteger(v)) return "integer";
  return typeof v;
}

function esTipo(v: unknown, t: string): boolean {
  if (t === "integer") return Number.isInteger(v);
  if (t === "array") return Array.isArray(v);
  if (t === "object") return !!v && typeof v === "object" && !Array.isArray(v);
  if (t === "null") return v === null;
  return typeof v === t;
}

// ── Pruebas ────────────────────────────────────────────────────────────────

describe("kon-schema.json", () => {
  it("existe donde los manifiestos dicen que existe", () => {
    // Los kon.json lo referencian como "../../schemas/kon-schema.json" desde
    // packages/kons/<kon>/, que resuelve justo aquí.
    expect(existsSync(ESQUEMA)).toBe(true);
  });

  it.skipIf(!HAY_KONS_INSTALADOS)("hay kons que validar", () => {
    expect(listarKons().length).toBeGreaterThan(20);
  });
});

describe.skipIf(!HAY_KONS_INSTALADOS)("todos los kon.json cumplen el esquema", () => {
  const esquema = leer(ESQUEMA) as Json;

  it.each(listarKons())("%s", (kon) => {
    const fallos = validar(leer(join(KONS, kon, "kon.json")), esquema);
    expect(fallos, `${kon}/kon.json:\n  - ${fallos.join("\n  - ")}`).toEqual([]);
  });
});

describe.skipIf(!HAY_KONS_INSTALADOS)("el manifiesto declara TODAS las tablas que el kon crea", () => {
  /**
   * `tables` no es documentación: se consume.
   *
   *   · `instalarEsquemaDeKon` lo usa para decidir si la instalación de un kon
   *     salió bien. Lo que no esté declarado, no se comprueba.
   *   · `routes/modules.ts` cuenta filas por tabla declarada, así que una
   *     tabla ausente aparece como cero en el panel.
   *
   * Cinco kons declaraban de menos —crm ×3, members ×2, maps, wiki y
   * ecommerce ×1— y el síntoma era justo ese: ocho tablas que existían, que su
   * propio código conocía, y que la validación de instalación no miraba.
   */
  const nombreDeTabla = (t: unknown) =>
    typeof t === "string" ? t : (t as { name?: string })?.name;

  /**
   * Tablas que el SQL del kon deja EN PIE.
   *
   * No basta con contar `CREATE TABLE`: kon-booking crea `rooms`, `amenities`…
   * y acto seguido las renombra a `booking_*`. Exigir que declare los nombres
   * intermedios sería exigirle que documente algo que ya no existe.
   */
  function tablasQueDeja(kon: string): string[] {
    const dir = join(KONS, kon, "migrations");
    if (!existsSync(dir)) return [];

    const vivas = new Set<string>();
    // `CREATE TABLE IF NOT EXISTS` con espaciado variable: sin tolerarlo, el
    // grupo opcional no casaba y se capturaba literalmente «if» como tabla.
    const crea = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z0-9_]+)"?/gi;
    const renombra =
      /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?"?([a-z0-9_]+)"?\s+RENAME\s+TO\s+"?([a-z0-9_]+)"?/gi;

    for (const f of readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      // Sin quitar los comentarios, una migración de esports que MENCIONA
      // «CREATE TABLE IF NOT EXISTS» dentro de una explicación se leía como
      // DDL y producía una tabla llamada «IF».
      const sql = readFileSync(join(dir, f), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/--.*/g, " ");

      for (const m of sql.matchAll(crea)) vivas.add(m[1]);
      for (const m of sql.matchAll(renombra)) {
        vivas.delete(m[1]);
        vivas.add(m[2]);
      }
    }
    return [...vivas];
  }

  it.each(listarKons())("%s", (kon) => {
    const manifiesto = leer(join(KONS, kon, "kon.json"));
    const declaradas = new Set((manifiesto.tables ?? []).map(nombreDeTabla));

    // Las tablas que CREA y no declara. Al revés no se comprueba: un kon con
    // `strategy: "drizzle"` declara tablas que crea drizzle-kit, no su SQL.
    const sinDeclarar = tablasQueDeja(kon).filter((t) => !declaradas.has(t));

    expect(
      sinDeclarar,
      `${kon} crea estas tablas pero no las declara en kon.json, así que la ` +
        `comprobación de instalación no las mira y el panel las cuenta como ` +
        `cero: ${sinDeclarar.join(", ")}`
    ).toEqual([]);
  });
});

describe("invariantes que el esquema por sí solo no expresa", () => {
  it("el id de cada kon coincide con su carpeta", () => {
    // La resolución va por el `id` del JSON, no por el nombre del directorio.
    const desalineados = listarKons().filter((kon) => leer(join(KONS, kon, "kon.json")).id !== kon);

    expect(desalineados).toEqual([]);
  });

  it("apuntan al esquema con $schema", () => {
    const sinSchema = listarKons().filter((kon) => !leer(join(KONS, kon, "kon.json")).$schema);

    expect(
      sinSchema,
      `Sin "$schema" el editor no valida al escribir y la deriva vuelve. Kons: ${sinSchema.join(", ")}`
    ).toEqual([]);
  });

  it("ningún kon esconde tablas en database.tables", () => {
    // El campo que se lee es `tables`. Uno paralelo dentro de `database` no
    // lo consulta nadie, y así es como CRM y Academy acabaron declarando 31
    // tablas invisibles entre los dos.
    const escondidas = listarKons().filter(
      (kon) => leer(join(KONS, kon, "kon.json")).database?.tables
    );

    expect(escondidas).toEqual([]);
  });

  it("los kons que montan rutas no chocan entre sí", () => {
    const porRuta = new Map<string, string[]>();
    for (const kon of listarKons()) {
      const ruta = leer(join(KONS, kon, "kon.json")).mount?.path;
      if (ruta) porRuta.set(ruta, [...(porRuta.get(ruta) || []), kon]);
    }

    const colisiones = [...porRuta.entries()].filter(([, kons]) => kons.length > 1);

    expect(colisiones).toEqual([]);
  });
});
