/**
 * Kitsuden — Code Graph: Historia git (Sourcegraph-style, solo lectura)
 * ============================================================================
 *
 * Primitivas de historia para agentes: búsqueda de commits, historia de un
 * archivo y resumen de un commit. Todo por `git` CLI en modo solo-lectura;
 * determinista dado el estado del repo.
 *
 * Si `git` no está disponible o el directorio no es un repo, devuelve listas
 * vacías (degradación limpia, igual que system-map sin DB).
 */

import { execFileSync } from "node:child_process";

export interface CommitInfo {
  sha: string;
  author: string;
  date: string;
  subject: string;
}

export interface CommitSearchOptions {
  /** Texto a buscar en mensajes de commit (git log --grep). */
  grep?: string;
  /** Limitar a commits que tocan esta ruta. */
  path?: string;
  author?: string;
  limit?: number;
}

const FORMAT = "%H%x1f%an%x1f%aI%x1f%s";

function runGit(cwd: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    });
  } catch {
    return "";
  }
}

function parseLog(raw: string): CommitInfo[] {
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, author, date, subject] = line.split("\x1f");
      return { sha, author, date, subject };
    })
    .filter((c) => c.sha && c.subject !== undefined);
}

/** Busca commits por mensaje/autor/ruta. */
export function commitSearch(root: string, options: CommitSearchOptions = {}): CommitInfo[] {
  const args = ["log", `--format=${FORMAT}`, `-n`, String(options.limit ?? 20)];
  if (options.grep) args.push("--grep", options.grep, "-i");
  if (options.author) args.push("--author", options.author);
  if (options.path) args.push("--", options.path);
  return parseLog(runGit(root, args));
}

/** Historia de un archivo (sigue renames). */
export function fileHistory(root: string, path: string, limit = 20): CommitInfo[] {
  return parseLog(
    runGit(root, ["log", `--format=${FORMAT}`, "-n", String(limit), "--follow", "--", path])
  );
}

export interface CommitDetail extends CommitInfo {
  /** Archivos tocados con conteo de líneas: "12\t3\tpath". */
  files: { path: string; added: number; removed: number }[];
}

/** Detalle de un commit: metadata + archivos tocados (sin el patch completo). */
export function commitShow(root: string, sha: string): CommitDetail | null {
  if (!/^[0-9a-f]{4,40}$/i.test(sha)) return null;
  const meta = parseLog(runGit(root, ["log", "-1", `--format=${FORMAT}`, sha]));
  if (meta.length === 0) return null;
  const numstat = runGit(root, ["show", "--numstat", "--format=", sha]);
  const files = numstat
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [added, removed, path] = line.split("\t");
      return {
        path: path ?? "",
        added: Number.parseInt(added, 10) || 0,
        removed: Number.parseInt(removed, 10) || 0,
      };
    })
    .filter((f) => f.path);
  return { ...meta[0], files };
}
