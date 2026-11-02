/**
 * KITSUDEN Brain — WikiAuthor (Layer 2 authoring)
 * ============================================================================
 *
 * Un `WikiAuthor` toma una fuente + señales deterministas (extraction.ts) y
 * produce el CUERPO en Markdown de una página de wiki. El pipeline que lo rodea
 * (qué páginas tocar, frontmatter, backlinks, conexiones) es 100% determinista;
 * el autor solo redacta la prosa.
 *
 * Tres proveedores, del más determinista al más "IA":
 *
 *   1. instruction (DEFAULT) — CERO IA, offline, determinista byte a byte.
 *      Emite una página estructurada a partir de las señales + un bloque
 *      <!-- AGENT-TASK --> con instrucciones precisas para que una IA LOCAL
 *      (Claude Code, Cursor, Ollama con herramientas) complete la prosa
 *      siguiendo BRAIN.md. Es la vía "que una IA local entiende cómo hacer".
 *
 *   2. api — usa un LLM vía API (Anthropic SDK, ya dependencia del repo).
 *      Para "IAs consumidas por API".
 *
 *   3. cli — invoca un binario (claude -p, ollama run, etc.) pasándole un
 *      prompt determinista y leyendo stdout. Para "IAs consumidas por CLI".
 *
 * Selección por entorno: KITSUDEN_BRAIN_AUTHOR = instruction | api | cli
 */

import { spawn } from "node:child_process";

import type { ExtractionResult } from "./extraction";

// ── Contrato ──────────────────────────────────────────────────────────────

export interface AuthorTask {
  /** Título de la fuente/página. */
  title: string;
  /** Contenido crudo de la fuente (Layer 1). */
  content: string;
  /** Señales deterministas ya extraídas. */
  signals: ExtractionResult;
  /** Títulos de notas relacionadas para cross-linking legible. */
  relatedTitles: string[];
  /** Reglas del vault (Layer 3 / BRAIN.md) que el autor debe respetar. */
  schemaRules: string;
}

export interface AuthorResult {
  /** Cuerpo Markdown de la página (sin frontmatter; el pipeline lo añade). */
  markdown: string;
  /** Proveedor que generó el contenido. */
  authoredBy: string;
  /** true si el cuerpo aún requiere que una IA lo complete (instruction mode). */
  pendingAgent: boolean;
}

export interface WikiAuthor {
  id: string;
  author(task: AuthorTask): Promise<AuthorResult>;
}

// ── Prompt determinista (compartido por api y cli) ──────────────────────────

/**
 * Construye el prompt de forma DETERMINISTA a partir de la tarea. La misma
 * tarea produce siempre el mismo prompt (clave para reproducibilidad).
 */
export function buildAuthorPrompt(task: AuthorTask): string {
  const related =
    task.relatedTitles.length > 0
      ? task.relatedTitles.map((t) => `- [[${t}]]`).join("\n")
      : "- (ninguna todavía)";

  return [
    "Eres el mantenedor de una wiki-cerebro estilo Karpathy. Redacta el CUERPO",
    "en Markdown de una página que resume e interpreta la fuente. Reglas:",
    "",
    task.schemaRules,
    "",
    `# Fuente: ${task.title}`,
    "",
    "## Señales deterministas ya extraídas (respétalas):",
    `- Resumen extractivo: ${task.signals.summary || "(vacío)"}`,
    `- Keywords: ${task.signals.keywords.join(", ") || "(ninguna)"}`,
    `- Headings: ${task.signals.headings.join(" | ") || "(ninguno)"}`,
    `- Enlaces: ${task.signals.links.join(" ") || "(ninguno)"}`,
    "",
    "## Backlinks a cross-linkear (usa sintaxis [[Título]]):",
    related,
    "",
    "## Contenido crudo:",
    task.content.slice(0, 8000),
    "",
    "Devuelve SOLO Markdown (sin frontmatter, sin ```). Empieza con un resumen",
    "de 2-3 frases y luego secciones con los conceptos clave y sus backlinks.",
  ].join("\n");
}

// ── 1. Instruction author (determinista, sin IA) ────────────────────────────

/**
 * Renderiza una página determinista + un bloque de tarea que una IA local puede
 * ejecutar. Sin llamadas externas. Salida estable byte a byte.
 */
export function createInstructionAuthor(): WikiAuthor {
  return {
    id: "instruction",
    async author(task: AuthorTask): Promise<AuthorResult> {
      const { signals } = task;
      const backlinks =
        task.relatedTitles.length > 0
          ? task.relatedTitles.map((t) => `[[${t}]]`).join(", ")
          : "_(sin relaciones aún)_";

      const keywordLine = signals.keywords.length ? signals.keywords.join(", ") : "_(ninguna)_";
      const linksBlock = signals.links.length
        ? signals.links.map((l) => `- <${l}>`).join("\n")
        : "_(sin enlaces)_";

      const md = [
        `> **Resumen:** ${signals.summary || "_pendiente de redacción_"}`,
        "",
        "## Conceptos clave",
        "",
        keywordLine,
        "",
        "## Backlinks",
        "",
        backlinks,
        "",
        "## Fuentes / enlaces",
        "",
        linksBlock,
        "",
        "<!-- AGENT-TASK",
        "Una IA (local, API o CLI) debe completar esta página siguiendo BRAIN.md:",
        "1. Reescribe el resumen en 2-3 frases claras.",
        "2. Expande cada concepto clave en un párrafo, con backlinks [[...]].",
        "3. No inventes datos que no estén en la fuente cruda.",
        "4. Al terminar, elimina este bloque AGENT-TASK.",
        "-->",
      ].join("\n");

      return { markdown: md, authoredBy: "instruction", pendingAgent: true };
    },
  };
}

// ── 2. API author (Anthropic SDK) ───────────────────────────────────────────

export interface ApiAuthorOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
}

/**
 * Autor vía API de Anthropic. Import dinámico para no acoplar el engine al SDK
 * cuando no se usa este modo.
 */
export function createApiAuthor(opts: ApiAuthorOptions = {}): WikiAuthor {
  return {
    id: "api",
    async author(task: AuthorTask): Promise<AuthorResult> {
      const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        // Degradación segura y determinista: si no hay clave, cae a instruction.
        const fallback = await createInstructionAuthor().author(task);
        return { ...fallback, authoredBy: "api:no-key→instruction" };
      }

      // Import dinámico sin acoplar tipos: el SDK es dependencia de apps/api,
      // no del engine. Se resuelve en runtime cuando este modo se usa.
      // @ts-ignore - módulo opcional resuelto en runtime por el host (apps/api)
      const mod: any = await import("@anthropic-ai/sdk");
      const Anthropic = mod.default ?? mod;
      const client = new Anthropic({ apiKey });
      const model = opts.model ?? "claude-haiku-4-5-20251001";

      const message: any = await client.messages.create({
        model,
        max_tokens: opts.maxTokens ?? 1024,
        messages: [{ role: "user", content: buildAuthorPrompt(task) }],
      });

      const text = (message.content as Array<{ type: string; text?: string }>)
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("\n")
        .trim();

      return { markdown: text, authoredBy: `api:${model}`, pendingAgent: false };
    },
  };
}

// ── 3. CLI author (claude -p, ollama run, ...) ──────────────────────────────

export interface CliAuthorOptions {
  /** Comando base, p.ej. "claude" o "ollama". */
  command: string;
  /** Args; el prompt se pasa por stdin salvo que se indique un placeholder. */
  args?: string[];
  /** ms antes de abortar. */
  timeoutMs?: number;
}

/**
 * Autor vía CLI: pasa el prompt determinista por stdin y lee stdout.
 * Ejemplos:
 *   { command: "claude", args: ["-p"] }
 *   { command: "ollama", args: ["run", "llama3.1"] }
 */
export function createCliAuthor(opts: CliAuthorOptions): WikiAuthor {
  return {
    id: "cli",
    async author(task: AuthorTask): Promise<AuthorResult> {
      const prompt = buildAuthorPrompt(task);
      const timeoutMs = opts.timeoutMs ?? 60_000;

      const text = await new Promise<string>((resolve, reject) => {
        const child = spawn(opts.command, opts.args ?? [], {
          stdio: ["pipe", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error(`CLI author timeout tras ${timeoutMs}ms`));
        }, timeoutMs);

        child.stdout.on("data", (d) => (stdout += d.toString()));
        child.stderr.on("data", (d) => (stderr += d.toString()));
        child.on("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          if (code === 0) resolve(stdout.trim());
          else reject(new Error(`CLI author exit ${code}: ${stderr.slice(0, 500)}`));
        });

        child.stdin.write(prompt);
        child.stdin.end();
      });

      return { markdown: text, authoredBy: `cli:${opts.command}`, pendingAgent: false };
    },
  };
}

// ── Selector por entorno ────────────────────────────────────────────────────

export type AuthorMode = "instruction" | "api" | "cli";

/**
 * Resuelve el autor según config/entorno. Default: instruction (determinista,
 * offline, cero costo). El pipeline funciona idéntico con cualquier autor.
 */
export function resolveAuthor(
  mode?: AuthorMode,
  options?: { api?: ApiAuthorOptions; cli?: CliAuthorOptions }
): WikiAuthor {
  const selected = (
    mode ??
    (process.env.KITSUDEN_BRAIN_AUTHOR as AuthorMode) ??
    "instruction"
  ).trim();

  switch (selected) {
    case "api":
      return createApiAuthor(options?.api);
    case "cli":
      if (!options?.cli?.command) {
        // Sin comando configurado, degradar a instruction en vez de fallar.
        return createInstructionAuthor();
      }
      return createCliAuthor(options.cli);
    case "instruction":
    default:
      return createInstructionAuthor();
  }
}
