/**
 * Generador de tipos TypeScript
 * ============================================================================
 *
 * Un tipo mal generado no falla: se propaga en silencio a todo el código de
 * quien lo usa, y aparece meses después como un bug de runtime. Por eso el
 * generador es puro y esto lo prueba caso por caso.
 *
 * Los tres que más importan:
 *   - `bigint` NO es `number` en JS sin perder precisión.
 *   - `jsonb` NO es `any`, porque `any` apaga la comprobación entera.
 *   - Lo que tiene default es OPCIONAL al insertar, o el usuario acaba
 *     inventándose el `id` o casteando.
 */

import { describe, expect, test } from "vitest";

import {
  generateTypes,
  isOptionalOnInsert,
  mapColumnType,
  propertyKey,
  toPascalCase,
  type IntrospectedColumn,
  type IntrospectedTable,
} from "../../packages/codegen/src/generators/types";

function col(name: string, type: string, over: Partial<IntrospectedColumn> = {}) {
  return {
    name,
    type,
    nullable: false,
    defaultValue: null,
    isPrimaryKey: false,
    ...over,
  } as IntrospectedColumn;
}

const POSTS: IntrospectedTable = {
  name: "blog_posts",
  columns: [
    col("id", "uuid", { isPrimaryKey: true, defaultValue: "gen_random_uuid()" }),
    col("title", "text"),
    col("excerpt", "text", { nullable: true }),
    col("views", "int4", { defaultValue: "0" }),
    col("content", "jsonb", { nullable: true }),
    col("author_id", "uuid", {
      nullable: true,
      isForeignKey: true,
      foreignTable: "auth_users",
      foreignColumn: "id",
    }),
    col("created_at", "timestamptz", { defaultValue: "now()" }),
  ],
  primaryKey: ["id"],
};

// ── Mapeo de tipos ───────────────────────────────────────────────────────────

describe("mapeo Postgres → TypeScript", () => {
  test("los tipos comunes", () => {
    expect(mapColumnType("text")).toBe("string");
    expect(mapColumnType("uuid")).toBe("string");
    expect(mapColumnType("int4")).toBe("number");
    expect(mapColumnType("boolean")).toBe("boolean");
  });

  test("los enteros grandes son STRING, no number", () => {
    // El driver de Postgres los devuelve como string porque no caben en un
    // number de JS. Tiparlos como number es un bug silencioso en cuanto los
    // ids crecen.
    expect(mapColumnType("bigint")).toBe("string");
    expect(mapColumnType("int8")).toBe("string");
    expect(mapColumnType("numeric")).toBe("string");
    expect(mapColumnType("decimal")).toBe("string");
  });

  test("las fechas son string: viajan como ISO por JSON", () => {
    expect(mapColumnType("timestamptz")).toBe("string");
    expect(mapColumnType("date")).toBe("string");
  });

  test("jsonb es UNKNOWN, nunca any", () => {
    // `any` apagaría la comprobación de todo lo que toque ese campo, que es lo
    // contrario de generar tipos. `unknown` obliga a estrechar.
    expect(mapColumnType("jsonb")).toBe("unknown");
    expect(mapColumnType("json")).toBe("unknown");
  });

  test("arrays en las dos notaciones de Postgres", () => {
    expect(mapColumnType("_text")).toBe("string[]");
    expect(mapColumnType("text[]")).toBe("string[]");
    expect(mapColumnType("_int4")).toBe("number[]");
  });

  test("un tipo desconocido cae a unknown, no a any", () => {
    expect(mapColumnType("tipo_raro_de_extension")).toBe("unknown");
  });
});

// ── Identificadores ──────────────────────────────────────────────────────────

describe("identificadores", () => {
  test("nombre de tabla a PascalCase", () => {
    expect(toPascalCase("blog_posts")).toBe("BlogPosts");
    expect(toPascalCase("member-access")).toBe("MemberAccess");
  });

  test("entrecomilla las claves que no son identificadores válidos", () => {
    // Sin esto, una columna llamada `2fa_enabled` genera un fichero que no
    // compila y el usuario no sabe por qué.
    expect(propertyKey("title")).toBe("title");
    expect(propertyKey("2fa_enabled")).toBe('"2fa_enabled"');
    expect(propertyKey("user-id")).toBe('"user-id"');
    expect(propertyKey("order")).toBe("order"); // palabra reservada pero clave válida
  });
});

// ── Opcionalidad al insertar ─────────────────────────────────────────────────

describe("qué es opcional al insertar", () => {
  test("lo que tiene default", () => {
    expect(isOptionalOnInsert(col("views", "int4", { defaultValue: "0" }))).toBe(true);
  });

  test("lo nullable", () => {
    expect(isOptionalOnInsert(col("excerpt", "text", { nullable: true }))).toBe(true);
  });

  test("una PK autogenerada, aunque no declare default", () => {
    // Exigir un id que genera Postgres obliga a inventárselo o a castear.
    expect(isOptionalOnInsert(col("id", "uuid", { isPrimaryKey: true }))).toBe(true);
  });

  test("una columna obligatoria de verdad NO es opcional", () => {
    expect(isOptionalOnInsert(col("title", "text"))).toBe(false);
  });
});

// ── Emisión ──────────────────────────────────────────────────────────────────

describe("fichero generado", () => {
  const out = generateTypes([POSTS]);

  test("emite Row, Insert y Update por tabla", () => {
    expect(out).toContain("export interface BlogPostsRow");
    expect(out).toContain("export interface BlogPostsInsert");
    expect(out).toContain("export type BlogPostsUpdate");
  });

  test("en Row todo está presente; los nullable llevan | null", () => {
    const row = out.slice(
      out.indexOf("interface BlogPostsRow"),
      out.indexOf("interface BlogPostsInsert")
    );
    expect(row).toMatch(/title: string;/);
    expect(row).toMatch(/excerpt: string \| null;/);
    // El id NO es opcional al leer: siempre viene.
    expect(row).toMatch(/id: string;/);
  });

  test("en Insert lo autogenerado es opcional", () => {
    const insert = out.slice(
      out.indexOf("interface BlogPostsInsert"),
      out.indexOf("BlogPostsUpdate")
    );
    expect(insert).toMatch(/id\?: string;/);
    expect(insert).toMatch(/views\?: number;/);
    expect(insert).toMatch(/created_at\?: string;/);
    // Pero el título sigue siendo obligatorio.
    expect(insert).toMatch(/\n {2}title: string;/);
  });

  test("Update excluye la clave primaria", () => {
    // Cambiar la PK no es actualizar, es otra fila.
    expect(out).toMatch(/BlogPostsUpdate = Partial<Omit<BlogPostsInsert, "id">>/);
  });

  test("documenta las claves foráneas en el propio tipo", () => {
    expect(out).toMatch(/→ auth_users\.id/);
  });

  test("emite el mapa Database y sus helpers", () => {
    expect(out).toContain("export interface Database");
    expect(out).toMatch(/blog_posts: \{/);
    expect(out).toContain("export type Row<T extends TableName>");
    expect(out).toContain("export type TableName = keyof Database");
  });

  test("avisa de que es generado", () => {
    expect(out).toMatch(/NO EDITAR A MANO/);
  });
});

// ── Determinismo ─────────────────────────────────────────────────────────────

describe("determinismo", () => {
  test("el mismo esquema produce el mismo fichero", () => {
    // Sin esto, regenerar ensuciaría cada commit con un diff de ruido.
    expect(generateTypes([POSTS])).toBe(generateTypes([POSTS]));
  });

  test("el orden de entrada no cambia la salida", () => {
    const other: IntrospectedTable = { name: "tags", columns: [col("id", "uuid")] };
    expect(generateTypes([POSTS, other])).toBe(generateTypes([other, POSTS]));
  });

  test("el orden de las columnas tampoco", () => {
    const reversed: IntrospectedTable = { ...POSTS, columns: [...POSTS.columns].reverse() };
    expect(generateTypes([reversed])).toBe(generateTypes([POSTS]));
  });
});

// ── Casos límite ─────────────────────────────────────────────────────────────

describe("casos límite", () => {
  test("sin tablas emite un Database vacío que compila", () => {
    const out = generateTypes([]);
    expect(out).toContain("export interface Database {}");
  });

  test("respeta las exclusiones", () => {
    const out = generateTypes([POSTS], { exclude: ["blog_posts"] });
    expect(out).not.toContain("BlogPostsRow");
  });

  test("ignora tablas sin columnas en vez de emitir basura", () => {
    const out = generateTypes([{ name: "vacia", columns: [] }]);
    expect(out).not.toContain("VaciaRow");
  });

  test("una tabla sin PK genera Update sin Omit roto", () => {
    const out = generateTypes([{ name: "log", columns: [col("msg", "text")] }]);
    expect(out).toMatch(/LogUpdate = Partial<Omit<LogInsert, never>>/);
  });
});
