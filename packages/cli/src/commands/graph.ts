/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GRAPH COMMAND — Code Graph determinista (sin IA)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   kitsuden graph                      # resumen: god nodes + clusters
 *   kitsuden graph symbol <nombre>      # find_symbol + referencias
 *   kitsuden graph outline <archivo>    # esqueleto de un archivo
 *   kitsuden graph path <a> <b>         # camino entre dos nodos
 *   kitsuden graph search <patrón>      # búsqueda regex estructurada
 *   kitsuden graph history [ruta]       # commits recientes (de una ruta)
 *
 * Config: KITSUDEN_API_URL (default http://localhost:3000), KITSUDEN_API_TOKEN.
 */

import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import chalk from "chalk";

interface GraphOptions {
  json?: boolean;
  /** Escribir los cambios de una edición semántica (default: dry-run). */
  apply?: boolean;
}

export async function graphCommand(
  action = "summary",
  args: string[] = [],
  options: GraphOptions = {}
): Promise<void> {
  const base = process.env.KITSUDEN_API_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const token = process.env.KITSUDEN_API_TOKEN;
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const get = async (path: string): Promise<any> => {
    const res = await fetch(`${base}/api/code-graph${path}`, { headers });
    return res.json();
  };

  try {
    switch (action) {
      case "summary": {
        const data = await get("");
        if (options.json) return console.log(JSON.stringify(data, null, 2));
        const s = data.summary ?? {};
        console.log(chalk.cyan("\n🕸️  Code Graph\n"));
        console.log(`  Archivos:  ${s.totalFiles ?? 0}`);
        console.log(`  Símbolos:  ${s.totalSymbols ?? 0}`);
        console.log(`  Aristas:   ${s.totalEdges ?? 0}`);
        console.log(chalk.yellow("\n  God nodes (más conectados):"));
        for (const g of (s.godNodes ?? []).slice(0, 5)) {
          console.log(`    ${g.degree.toString().padStart(4)}  ${g.id}`);
        }
        console.log(chalk.yellow("\n  Subsistemas:"));
        for (const cItem of (data.communities ?? []).slice(0, 8)) {
          console.log(`    ${cItem.files.toString().padStart(4)} archivos  ${cItem.group}`);
        }
        console.log();
        break;
      }
      case "symbol": {
        const name = args[0];
        if (!name) return fail("Uso: kitsuden graph symbol <nombre>");
        const data = await get(`/symbol/${encodeURIComponent(name)}`);
        if (options.json) return console.log(JSON.stringify(data, null, 2));
        if (data.error) return fail(data.error.message);
        console.log(chalk.cyan(`\n🔎 ${name}\n`));
        for (const m of data.matches ?? []) {
          const badge = m.exported ? chalk.green("export") : chalk.gray("local ");
          console.log(`  ${badge} ${m.kind.padEnd(9)} ${m.file}:${m.line}`);
        }
        for (const ref of data.references ?? []) {
          if (ref.calledBy.length)
            console.log(chalk.yellow(`\n  Llamado por (${ref.symbol.file}):`));
          for (const cb of ref.calledBy) console.log(`    ${cb.id} (${cb.confidence})`);
          if (ref.importedBy.length) console.log(chalk.yellow("\n  Importado por:"));
          for (const ib of ref.importedBy) console.log(`    ${ib}`);
        }
        console.log();
        break;
      }
      case "outline": {
        const file = args[0];
        if (!file) return fail("Uso: kitsuden graph outline <archivo>");
        const data = await get(`/outline?file=${encodeURIComponent(file)}`);
        if (options.json) return console.log(JSON.stringify(data, null, 2));
        if (data.error) return fail(data.error.message);
        console.log(chalk.cyan(`\n📄 ${data.file}\n`));
        for (const s of data.symbols ?? []) {
          const badge = s.exported ? chalk.green("export") : chalk.gray("local ");
          console.log(`  ${String(s.line).padStart(4)}  ${badge} ${s.kind.padEnd(9)} ${s.name}`);
        }
        console.log();
        break;
      }
      case "path": {
        const [from, to] = args;
        if (!from || !to) return fail("Uso: kitsuden graph path <a> <b>");
        const data = await get(
          `/path?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        );
        if (options.json) return console.log(JSON.stringify(data, null, 2));
        if (data.error) return fail(data.error.message);
        console.log(chalk.cyan(`\n🧭 ${data.hops} saltos\n`));
        data.path.forEach((node: string, i: number) => {
          console.log(`  ${i === 0 ? "●" : i === data.path.length - 1 ? "◎" : "│"} ${node}`);
        });
        console.log();
        break;
      }
      case "search": {
        const pattern = args[0];
        if (!pattern) return fail("Uso: kitsuden graph search <patrón>");
        const data = await get(`/search?q=${encodeURIComponent(pattern)}`);
        if (options.json) return console.log(JSON.stringify(data, null, 2));
        console.log(chalk.cyan(`\n🔍 ${data.total} resultados\n`));
        for (const h of data.hits ?? []) {
          console.log(`  ${chalk.gray(`${h.file}:${h.line}`)}  ${h.text}`);
        }
        console.log();
        break;
      }
      case "history": {
        const path = args[0];
        const qs = path ? `?path=${encodeURIComponent(path)}` : "";
        const data = await get(`/history${qs}`);
        if (options.json) return console.log(JSON.stringify(data, null, 2));
        console.log(chalk.cyan(`\n📜 ${data.total} commits\n`));
        for (const cm of data.commits ?? []) {
          console.log(
            `  ${chalk.yellow(cm.sha.slice(0, 8))} ${chalk.gray(cm.date.slice(0, 10))} ${cm.subject}`
          );
        }
        console.log();
        break;
      }
      case "open":
      case "visualize": {
        // Descarga el HTML autocontenido y lo abre en el navegador.
        const res = await fetch(`${base}/api/code-graph/visualize`, { headers });
        if (!res.ok) return fail(`La API respondió ${res.status}`);
        const html = await res.text();
        const out = join(tmpdir(), "kitsuden-code-graph.html");
        writeFileSync(out, html);
        console.log(chalk.cyan(`\n🕸️  Grafo generado: ${out}\n`));
        const opener =
          process.platform === "win32"
            ? "start"
            : process.platform === "darwin"
              ? "open"
              : "xdg-open";
        spawn(opener, [out], { shell: true, detached: true, stdio: "ignore" }).unref();
        break;
      }
      case "semantic": {
        const query = args.join(" ");
        if (!query) return fail("Uso: kitsuden graph semantic <pregunta en lenguaje natural>");
        const data = await get(`/semantic?q=${encodeURIComponent(query)}`);
        if (options.json) return console.log(JSON.stringify(data, null, 2));
        const badge = data.mode === "semantic" ? chalk.green("embeddings") : chalk.yellow("léxico");
        console.log(
          chalk.cyan(`\n🧠 ${data.total} resultados`),
          chalk.gray(`(${badge}, ${data.indexed} símbolos indexados)\n`)
        );
        for (const h of data.hits ?? []) {
          const pct = (h.score * 100).toFixed(0).padStart(3);
          console.log(
            `  ${chalk.yellow(pct + "%")} ${chalk.bold(h.symbol.name)} ${chalk.gray(`${h.symbol.file}:${h.symbol.line}`)}`
          );
        }
        console.log();
        break;
      }
      case "rename":
      case "delete":
      case "replace": {
        const [name, second] = args;
        if (!name)
          return fail(
            `Uso: kitsuden graph ${action} <símbolo> ${action === "rename" ? "<nuevoNombre>" : ""}`
          );
        const op = action === "rename" ? "rename" : action === "delete" ? "delete" : "replace";
        const body: Record<string, unknown> = { name, apply: options.apply === true };
        if (action === "rename") {
          if (!second) return fail("Uso: kitsuden graph rename <símbolo> <nuevoNombre>");
          body.newName = second;
        }
        if (action === "replace") {
          if (!second) return fail("Uso: kitsuden graph replace <símbolo> <código>");
          body.code = second;
        }
        const res = await fetch(`${base}/api/code-graph/edit/${op}`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data: any = await res.json();
        if (options.json) return console.log(JSON.stringify(data, null, 2));
        if (!data.ok) return fail(data.error ?? data.summary ?? "Operación rechazada");
        console.log(chalk.green(`\n✓ ${data.summary}\n`));
        for (const e of data.edits ?? []) {
          console.log(`  ${chalk.gray(e.path)} ${chalk.yellow(`(${e.occurrences})`)}`);
        }
        if (!data.applied) {
          console.log(chalk.yellow("\n  Dry-run: nada escrito. Añade --apply para aplicar.\n"));
        } else console.log();
        break;
      }
      default:
        fail(
          `Acción desconocida: ${action}. Usa: summary|symbol|outline|path|search|semantic|history|open|rename|replace|delete`
        );
    }
  } catch (err) {
    console.error(chalk.red(`Fallo al contactar la API en ${base}: ${(err as Error).message}`));
    console.error(chalk.gray("¿Está corriendo la API? (kitsuden dev / kitsuden start)"));
    process.exit(1);
  }
}

function fail(msg: string): void {
  console.error(chalk.red(msg));
  process.exit(1);
}
