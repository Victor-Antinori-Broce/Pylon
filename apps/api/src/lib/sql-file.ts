/**
 * Lectura y troceado de ficheros SQL.
 * ============================================================================
 *
 * Existe una sola copia de esto a propósito: el runner de migraciones y el
 * aplicador de RLS tienen que trocear igual, y dos copias divergen.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * Trocea un fichero SQL en statements respetando los cuerpos con etiqueta
 * dólar (`$$ … $$`, `$POLICY$ … $POLICY$`).
 *
 * No vale partir por `;`: los bloques `DO $$` y los cuerpos de función llevan
 * `;` dentro, y trocear ahí se los entrega rotos a Postgres.
 *
 * Y no basta con contar marcadores —que es lo que hacía la versión anterior en
 * apply-rls.ts—: si dentro de un `$POLICY$` aparece un `$$`, el contador se
 * descuadra y a partir de ahí el fichero entero se trocea mal. Hay que
 * recordar QUÉ etiqueta abrió y cerrar solo con esa misma.
 */
export function splitStatements(raw: string): string[] {
  // drizzle-kit marca los límites explícitamente. Cuando están, se usan: sus
  // líneas terminan en `;--> statement-breakpoint`, no en `;`, así que el
  // heurístico de abajo veía el fichero entero como UN statement y se lo
  // entregaba a Postgres de una pieza.
  if (raw.includes("--> statement-breakpoint")) {
    return raw
      .split("--> statement-breakpoint")
      .map((s) => quitarComentarios(s).trim())
      .filter((s) => s.length > 0);
  }

  const statements: string[] = [];
  let buffer = "";
  let openTag: string | null = null;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();

    // Comentarios y líneas en blanco fuera de un cuerpo: se descartan para que
    // el statement que se guarda sea el SQL y nada más.
    if (!openTag && (trimmed === "" || trimmed.startsWith("--"))) continue;

    buffer += line + "\n";

    for (const marca of line.match(/\$[A-Za-z_]*\$/g) ?? []) {
      if (openTag === null) openTag = marca;
      else if (marca === openTag) openTag = null;
      // Una etiqueta distinta dentro de un cuerpo abierto es contenido, no un
      // delimitador. Ignorarla es justo lo que arregla el descuadre.
    }

    // Se compara SIN el comentario final: una línea como
    // `ALTER TABLE x FORCE ROW LEVEL SECURITY; -- nota` no termina en `;`, así
    // que sin esto no se cortaba y el statement se fusionaba con el siguiente.
    if (!openTag && sinComentarioFinal(trimmed).endsWith(";")) {
      statements.push(buffer.trim());
      buffer = "";
    }
  }

  // Un último statement sin `;` final sigue siendo válido para Postgres.
  const resto = buffer.trim();
  if (resto) statements.push(resto);

  return statements;
}

/**
 * Recorta el comentario `--` final de una línea, solo para decidir si el
 * statement termina ahí.
 *
 * Un `--` dentro de una cadena NO es un comentario: `SELECT '-- no';` seguiría
 * siendo la misma línea. Se distingue contando las comillas simples anteriores
 * —número par = estamos fuera de una cadena— y tratando `''` como comilla
 * escapada, que es como Postgres las escribe.
 */
function sinComentarioFinal(linea: string): string {
  let enCadena = false;

  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === "'") {
      // `''` dentro de una cadena es una comilla literal, no su cierre.
      if (enCadena && linea[i + 1] === "'") {
        i++;
        continue;
      }
      enCadena = !enCadena;
    } else if (!enCadena && c === "-" && linea[i + 1] === "-") {
      return linea.slice(0, i).trimEnd();
    }
  }

  return linea;
}

/**
 * Quita comentarios de línea completos, conservando los que van al final de
 * una línea con SQL (que pueden formar parte de un cuerpo con etiqueta dólar).
 */
function quitarComentarios(bloque: string): string {
  return bloque
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
}

export interface SqlFile {
  /** Nombre del fichero, que es la clave en el historial de migraciones. */
  name: string;
  path: string;
  raw: string;
  /** sha256 del contenido: detecta que una migración ya aplicada cambió. */
  checksum: string;
  statements: string[];
}

export function readSqlFile(path: string, name: string): SqlFile {
  const raw = readFileSync(path, "utf8");
  return {
    name,
    path,
    raw,
    checksum: createHash("sha256").update(raw).digest("hex").slice(0, 16),
    statements: splitStatements(raw),
  };
}
