/**
 * Kitsuden — Code Graph: Edición semántica (estilo Serena, determinista)
 * ============================================================================
 *
 * Convierte el code-graph de solo-lectura en un editor a nivel SÍMBOLO: el
 * agente deja de "leer tu código" y pasa a "refactorizar tu código".
 *
 *   renameSymbol       → renombra un símbolo y TODAS sus referencias
 *   replaceSymbolBody  → reemplaza el cuerpo de una función/clase por nombre
 *   safeDeleteSymbol   → borra un símbolo solo si nadie lo referencia
 *   insertBeforeSymbol → inserta código justo antes de un símbolo
 *
 * SEGURO POR DEFECTO — tres garantías, en este orden:
 *
 *   1. DRY-RUN: ninguna operación escribe a disco salvo `apply: true`. Siempre
 *      devuelve los `edits` para revisar antes de aplicar.
 *   2. SIN AMBIGÜEDAD: si el nombre resuelve a más de un símbolo (o a ninguno),
 *      la operación se RECHAZA en vez de adivinar cuál tocar.
 *   3. VERIFICACIÓN SINTÁCTICA: cada archivo modificado se re-parsea; si el
 *      resultado no compila sintácticamente, la operación se aborta entera y
 *      NADA se escribe (todo-o-nada).
 *
 * El renombrado usa el AST (identificadores reales), no búsqueda de texto: no
 * toca strings, comentarios ni subcadenas de otros nombres.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { SourceFileInput } from "./indexer";

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface FileEdit {
  /** Ruta relativa del archivo. */
  path: string;
  /** Número de ocurrencias modificadas en este archivo. */
  occurrences: number;
  /** Contenido resultante (para revisar en dry-run). */
  content: string;
}

export interface EditResult {
  ok: boolean;
  /** Motivo del rechazo cuando `ok` es false. */
  error?: string;
  /** Archivos que cambiarían (dry-run) o cambiaron (`apply: true`). */
  edits: FileEdit[];
  /** true si los cambios se escribieron a disco. */
  applied: boolean;
  /** Resumen legible de la operación. */
  summary: string;
}

export interface EditOptions {
  /** Escribir a disco. Default false (dry-run). */
  apply?: boolean;
  /** Root del repo para resolver rutas al escribir. */
  root?: string;
}

// ── Carga lazy de typescript (igual que el indexer) ──────────────────────────

let tsModule: any = null;
async function loadTs(): Promise<any> {
  if (!tsModule) {
    const mod: any = await import("typescript");
    tsModule = mod.default ?? mod;
  }
  return tsModule;
}

function fail(error: string): EditResult {
  return { ok: false, error, edits: [], applied: false, summary: error };
}

/**
 * Verifica que el texto siga siendo TypeScript sintácticamente válido.
 * Es la última red de seguridad antes de escribir.
 */
async function isParseable(path: string, content: string): Promise<boolean> {
  const ts = await loadTs();
  const sf = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);
  // `parseDiagnostics` no es público pero es la vía estándar para detectar
  // errores de sintaxis sin levantar un Program completo.
  const diags = (sf as any).parseDiagnostics ?? [];
  return diags.length === 0;
}

/** Escribe los edits a disco, o los devuelve tal cual en dry-run. */
async function commit(
  edits: FileEdit[],
  options: EditOptions,
  summary: string
): Promise<EditResult> {
  // Verificación sintáctica de TODOS los archivos antes de tocar ninguno.
  for (const edit of edits) {
    if (!(await isParseable(edit.path, edit.content))) {
      return fail(
        `La edición dejaría "${edit.path}" con sintaxis inválida — abortado sin escribir nada.`
      );
    }
  }

  if (options.apply) {
    const root = options.root ?? process.cwd();
    for (const edit of edits) writeFileSync(join(root, edit.path), edit.content);
  }

  return {
    ok: true,
    edits,
    applied: Boolean(options.apply),
    summary: options.apply ? summary : `${summary} (dry-run: nada escrito)`,
  };
}

// ── Localización de símbolos ─────────────────────────────────────────────────

interface DeclSite {
  path: string;
  /** Offset de inicio y fin de la declaración completa. */
  start: number;
  end: number;
  kind: string;
}

/** Encuentra las declaraciones top-level de `name` en los archivos dados. */
async function findDeclarations(files: SourceFileInput[], name: string): Promise<DeclSite[]> {
  const ts = await loadTs();
  const out: DeclSite[] = [];

  for (const file of files) {
    const sf = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true);
    for (const stmt of sf.statements) {
      const push = (kind: string, node: any) =>
        out.push({ path: file.path, start: node.getStart(sf), end: node.getEnd(), kind });

      if (
        (ts.isFunctionDeclaration(stmt) ||
          ts.isClassDeclaration(stmt) ||
          ts.isInterfaceDeclaration(stmt) ||
          ts.isTypeAliasDeclaration(stmt) ||
          ts.isEnumDeclaration(stmt)) &&
        stmt.name?.text === name
      ) {
        push(ts.SyntaxKind[stmt.kind], stmt);
      } else if (ts.isVariableStatement(stmt)) {
        for (const decl of stmt.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.name.text === name) {
            // La declaración incluye el `export const` completo.
            push("VariableStatement", stmt);
          }
        }
      }
    }
  }
  return out;
}

/** Todos los identificadores con ese nombre, por archivo (para renombrar). */
async function findIdentifiers(
  files: SourceFileInput[],
  name: string
): Promise<Map<string, number[]>> {
  const ts = await loadTs();
  const byFile = new Map<string, number[]>();

  for (const file of files) {
    const sf = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true);
    const offsets: number[] = [];

    const visit = (node: any) => {
      // Solo identificadores REALES del AST: nunca strings ni comentarios.
      if (ts.isIdentifier(node) && node.text === name) {
        // No renombrar la clave de `{ foo: bar }` cuando foo no es el símbolo.
        const parent = node.parent;
        const isPropertyKey =
          parent &&
          ts.isPropertyAssignment(parent) &&
          parent.name === node &&
          parent.initializer !== node;
        if (!isPropertyKey) offsets.push(node.getStart(sf));
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);

    if (offsets.length > 0) byFile.set(file.path, offsets);
  }
  return byFile;
}

const VALID_IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

// ── Operaciones ──────────────────────────────────────────────────────────────

/**
 * Renombra un símbolo y todas sus referencias, vía AST.
 * Rechaza si el símbolo no existe, es ambiguo, o el nuevo nombre ya se usa.
 */
export async function renameSymbol(
  files: SourceFileInput[],
  oldName: string,
  newName: string,
  options: EditOptions = {}
): Promise<EditResult> {
  if (!VALID_IDENT.test(newName)) {
    return fail(`"${newName}" no es un identificador válido de TypeScript.`);
  }
  if (oldName === newName) return fail("El nombre nuevo es igual al actual.");

  const decls = await findDeclarations(files, oldName);
  if (decls.length === 0) return fail(`No se encontró ninguna declaración de "${oldName}".`);
  if (decls.length > 1) {
    const where = decls.map((d) => d.path).join(", ");
    return fail(
      `"${oldName}" está declarado en ${decls.length} sitios (${where}) — ambiguo, no se renombra.`
    );
  }

  // Colisión: el nombre nuevo ya existe como declaración.
  const clash = await findDeclarations(files, newName);
  if (clash.length > 0) {
    return fail(`"${newName}" ya está declarado en ${clash[0].path} — colisión.`);
  }

  const hits = await findIdentifiers(files, oldName);
  const byPath = new Map(files.map((f) => [f.path, f.content]));
  const edits: FileEdit[] = [];

  for (const [path, offsets] of hits) {
    const content = byPath.get(path)!;
    // De atrás hacia adelante: los offsets previos no se desplazan.
    let next = content;
    for (const off of [...offsets].sort((a, b) => b - a)) {
      next = next.slice(0, off) + newName + next.slice(off + oldName.length);
    }
    edits.push({ path, occurrences: offsets.length, content: next });
  }

  const total = edits.reduce((n, e) => n + e.occurrences, 0);
  return commit(
    edits.sort((a, b) => a.path.localeCompare(b.path)),
    options,
    `Renombrado "${oldName}" → "${newName}": ${total} referencias en ${edits.length} archivos`
  );
}

/**
 * Reemplaza la declaración completa de un símbolo por código nuevo.
 * El reemplazo debe ser la declaración entera (`export function x() {...}`).
 */
export async function replaceSymbolBody(
  files: SourceFileInput[],
  name: string,
  replacement: string,
  options: EditOptions = {}
): Promise<EditResult> {
  const decls = await findDeclarations(files, name);
  if (decls.length === 0) return fail(`No se encontró la declaración de "${name}".`);
  if (decls.length > 1) {
    return fail(`"${name}" está declarado en ${decls.length} sitios — ambiguo, no se reemplaza.`);
  }

  const decl = decls[0];
  const content = files.find((f) => f.path === decl.path)!.content;
  const next = content.slice(0, decl.start) + replacement.trimEnd() + content.slice(decl.end);

  return commit(
    [{ path: decl.path, occurrences: 1, content: next }],
    options,
    `Reemplazado el cuerpo de "${name}" en ${decl.path}`
  );
}

/**
 * Borra un símbolo — SOLO si nadie lo referencia fuera de su declaración.
 * Es la garantía que hace segura la limpieza automática de código muerto.
 */
export async function safeDeleteSymbol(
  files: SourceFileInput[],
  name: string,
  options: EditOptions = {}
): Promise<EditResult> {
  const decls = await findDeclarations(files, name);
  if (decls.length === 0) return fail(`No se encontró la declaración de "${name}".`);
  if (decls.length > 1) {
    return fail(`"${name}" está declarado en ${decls.length} sitios — ambiguo, no se borra.`);
  }

  const decl = decls[0];
  const hits = await findIdentifiers(files, name);

  // Referencias fuera del rango de la declaración = está en uso.
  const external: string[] = [];
  for (const [path, offsets] of hits) {
    for (const off of offsets) {
      const insideDecl = path === decl.path && off >= decl.start && off < decl.end;
      if (!insideDecl) external.push(`${path}:${off}`);
    }
  }
  if (external.length > 0) {
    return fail(
      `"${name}" tiene ${external.length} referencias activas (p.ej. ${external[0]}) — no se borra.`
    );
  }

  const content = files.find((f) => f.path === decl.path)!.content;
  // Consumir la línea completa y el salto que la sigue.
  let start = decl.start;
  while (start > 0 && content[start - 1] !== "\n") start--;
  let end = decl.end;
  while (end < content.length && content[end] !== "\n") end++;
  if (end < content.length) end++;

  const next = content.slice(0, start) + content.slice(end);
  return commit(
    [{ path: decl.path, occurrences: 1, content: next }],
    options,
    `Borrado "${name}" de ${decl.path} (sin referencias activas)`
  );
}

/** Inserta código justo antes de la declaración de un símbolo. */
export async function insertBeforeSymbol(
  files: SourceFileInput[],
  name: string,
  code: string,
  options: EditOptions = {}
): Promise<EditResult> {
  const decls = await findDeclarations(files, name);
  if (decls.length === 0) return fail(`No se encontró la declaración de "${name}".`);
  if (decls.length > 1) {
    return fail(`"${name}" está declarado en ${decls.length} sitios — ambiguo.`);
  }

  const decl = decls[0];
  const content = files.find((f) => f.path === decl.path)!.content;
  let start = decl.start;
  while (start > 0 && content[start - 1] !== "\n") start--;

  const next = content.slice(0, start) + `${code.trimEnd()}\n\n` + content.slice(start);
  return commit(
    [{ path: decl.path, occurrences: 1, content: next }],
    options,
    `Insertado código antes de "${name}" en ${decl.path}`
  );
}

// ── Helper para cargar los archivos del repo ─────────────────────────────────

/** Lee los archivos indicados (rutas relativas) desde el root. */
export function loadFiles(root: string, paths: string[]): SourceFileInput[] {
  const out: SourceFileInput[] = [];
  for (const path of paths) {
    try {
      out.push({ path, content: readFileSync(join(root, path), "utf8") });
    } catch {
      // omitido: archivo ilegible
    }
  }
  return out;
}
