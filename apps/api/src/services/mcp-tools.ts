/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MCP Hardcoded Tools — Kitsuden Agents Engine
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Servicio compartido que expone las herramientas MCP hardcodeadas de Kitsuden.
 * Usado por:
 *   - apps/api/src/routes/mcp.ts (MCP server)
 *   - apps/api/src/services/agent-tools.ts (tool calling del Agent Engine)
 */

import { AsyncLocalStorage } from "node:async_hooks";

import { fijarContextoRls, messageOf } from "@kitsuden/engine";
import {
  accesoADataset,
  buildDatasetWhere,
  camposDelSchema,
  checkReadAccess,
  checkWriteAccess,
  concedeScope,
  firmaDeAgente,
  publishedOrOwn,
  type AccionDeDataset,
  type FirmanteDeAgente,
  type PolicyJson,
  type RLSRule,
} from "@kitsuden/shared";
import { and, eq, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";

import { db, mergedSchema } from "@/db";
import { actions, dataEntries, dataSets, installedKons, modules, siteSettings } from "@/db/schema";
import { emailQueue } from "@/lib/queue";
import { CodigoFueraDePromocion, TABLAS_SOLO_POR_SU_RUTA, traeCodigo } from "@/lib/codigo-de-acciones";
import { sinColumnasSecretas, TABLAS_ESCRITURA_ADMIN, tablaNativaProhibida } from "@/lib/tablas-explorables";
import { codificarRespuesta, type Formato, type FormatoPedido } from "@/lib/formatos";
import { MODOS_DE_ENVOLTORIO, type ModoDeEnvoltorio } from "@/lib/ajustes-mcp";
import { envolverFilas, procedenciaDeFilas, type Procedencia } from "@/lib/procedencia";
import { KON_REGISTRY } from "@/services/module-registry";

import { generateReact } from "../../../../packages/codegen/src/generators/react";
import { generateSvelte } from "../../../../packages/codegen/src/generators/svelte";
import { generateVue } from "../../../../packages/codegen/src/generators/vue";

import type { LLMTool } from "./llm/types";
import { introspectTable } from "./schema-introspector";

/**
 * Scopes mínimos requeridos para ejecutar cada tool hardcodeada.
 * Tools no listadas requieren el scope por defecto "mcp:read".
 */
const TOOL_SCOPES: Record<string, string> = {
  kitsuden_query_collection: "mcp:read",
  kitsuden_query_dataset: "mcp:read",
  kitsuden_list_datasets: "mcp:read",
  kitsuden_describe_collection: "mcp:read",
  kitsuden_system_status: "mcp:read",
  kitsuden_create_record: "mcp:write",
  kitsuden_update_record: "mcp:write",
  kitsuden_delete_record: "mcp:write",
  kitsuden_insert_record: "mcp:write",
  kitsuden_create_dataset: "mcp:admin",
  kitsuden_install_kon: "mcp:admin",
  kitsuden_define_action: "mcp:admin",
  kitsuden_enable_auth: "mcp:admin",
  // Encola correos a cualquier destinatario: no basta con `mcp:write`, que
  // tiene el preset «data-editor» (auditoría 2026-10-25).
  kitsuden_dispatch_worker: "mail:send",
  kitsuden_generate_frontend_hook: "mcp:read",
};

/**
 * Validación de los argumentos de cada herramienta
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ESTA es la frontera. Lo que llega a `executeHardcodedTool` lo ha escrito un
 * MODELO, no un cliente nuestro: es texto generado que puede traer cualquier
 * forma, campos de más o tipos que no son. Antes se leía con `args as any` y
 * viajaba directo hasta un `.insert()` o un `.update()`.
 *
 * `as any` no es aquí un detalle de tipos: es la ausencia de la comprobación.
 * Con él, `data` podía ser una cadena, `limit` un objeto, y `collection`
 * cualquier cosa que luego se comparaba contra el esquema.
 *
 * Se valida UNA vez, en el despacho, antes de entrar a ningún handler. Así no
 * se puede añadir una herramienta y olvidarse: sin entrada aquí, no se
 * ejecuta (ver el `default` de `esquemaDe`) y hay un test que lo comprueba.
 *
 * Los mensajes de error se devuelven al modelo como texto: son para que
 * reintente bien, así que dicen QUÉ campo y QUÉ se esperaba.
 */

/**
 * Formato del resultado. `auto` (por defecto) elige para CADA respuesta el más
 * corto entre JSON compacto, TOON y TRON que vuelva a dar exactamente los
 * mismos datos (lib/formatos.ts). El formato elegido va en `_meta` del
 * resultado (`kitsuden/format`).
 */
const FORMATO = z.enum(["auto", "json", "toon", "tron"]).default("auto");
const FORMATO_JSON_SCHEMA = {
  type: "string",
  enum: ["auto", "json", "toon", "tron"] as string[],
  default: "auto",
  description:
    "Result format. 'auto' (default) returns compact JSON, TOON or TRON, whichever is shortest for this result without losing data; the result's _meta['kitsuden/format'] says which. 'json' always returns compact JSON.",
};
/**
 * Cómo envolver el texto que escribieron otros (lib/procedencia.ts). Sin él,
 * el del agente (panel) o `none`: los clientes de siempre no ven cambio.
 */
const ENVOLTORIO = z.enum(MODOS_DE_ENVOLTORIO).optional();
const ENVOLTORIO_JSON_SCHEMA = {
  type: "string",
  enum: [...MODOS_DE_ENVOLTORIO] as string[],
  description:
    "Wrap text written by users/other agents: 'delimiters' (<untrusted-content>…</untrusted-content>) or 'object' ({\"untrusted\": \"…\"}). Default: the agent's setting, else 'none'. Who wrote each record is always in _meta['kitsuden/provenance'].",
};
/** Un registro: objeto plano. Nunca un array ni un escalar. */
const DATOS = z.record(z.string(), z.unknown());

/**
 * Estado de una entrada. Es un ENUM de Postgres (`content_status`), no texto
 * libre — con `z.string()` un modelo podía mandar "publicado" y la consulta
 * reventaba contra el tipo de la columna, con un error de base de datos en vez
 * de un mensaje que el modelo pudiera corregir. Lo destapó el comprobador en
 * cuanto se quitó el `as any`.
 */
const ESTADO = z.enum(["draft", "published", "archived"]);

/**
 * Carga de un job de la cola de email.
 *
 * `emailQueue.add` exige `EmailJobData` (to/subject/html). Antes el payload
 * entraba como objeto libre, así que un modelo podía encolar un job que el
 * worker no sabe procesar: el fallo aparecía LEJOS, en el worker, y sin
 * relación visible con quien lo encoló.
 */
const PAYLOAD_EMAIL = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(500),
  html: z.string().min(1),
  text: z.string().optional(),
});

const ESQUEMAS_ARGS = {
  kitsuden_list_datasets: z.object({ format: FORMATO }),

  kitsuden_describe_collection: z.object({
    collection: z.string().min(1),
    format: FORMATO,
  }),

  kitsuden_system_status: z.object({}),

  kitsuden_query_collection: z.object({
    collection: z.string().min(1),
    // El tope es del servidor, no del modelo: un `limit` enorme es la forma
    // más fácil de que una herramienta de lectura tumbe la base.
    limit: z.number().int().min(1).max(1000).default(50),
    offset: z.number().int().min(0).default(0),
    search: z.string().max(500).optional(),
    sort: z.string().max(120).optional(),
    where: DATOS.optional(),
    format: FORMATO,
    untrusted_wrap: ENVOLTORIO,
  }),

  kitsuden_create_record: z.object({
    collection: z.string().min(1),
    data: DATOS,
    status: ESTADO.default("published"),
  }),

  // Acepta el esquema nuevo {collection, id} y el legacy {entryId}. El
  // `superRefine` exige que venga uno de los dos: antes eso se comprobaba a
  // mano dentro del handler y devolvía una cadena suelta.
  kitsuden_update_record: z
    .object({
      collection: z.string().min(1).optional(),
      id: z.string().min(1).optional(),
      entryId: z.string().min(1).optional(),
      data: DATOS,
      status: ESTADO.optional(),
    })
    .superRefine((v, ctx) => {
      if (!v.id && !v.entryId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["id"],
          message: "Hace falta 'id' (o 'entryId' en el modo legacy).",
        });
      }
    }),

  kitsuden_delete_record: z
    .object({
      collection: z.string().min(1).optional(),
      id: z.string().min(1).optional(),
      entryId: z.string().min(1).optional(),
    })
    .superRefine((v, ctx) => {
      if (!v.id && !v.entryId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["id"],
          message: "Hace falta 'id' (o 'entryId' en el modo legacy).",
        });
      }
    }),

  kitsuden_query_dataset: z.object({
    datasetId: z.string().min(1),
    limit: z.number().int().min(1).max(100).default(50),
    offset: z.number().int().min(0).default(0),
    status: ESTADO.optional(),
    format: FORMATO,
    untrusted_wrap: ENVOLTORIO,
  }),

  kitsuden_insert_record: z.object({
    datasetId: z.string().min(1),
    data: DATOS,
    status: ESTADO.default("draft"),
  }),

  kitsuden_create_dataset: z.object({
    name: z.string().min(1).max(200),
    // El slug acaba en una URL: se restringe aquí en vez de escaparse luego.
    slug: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Solo minúsculas, números y guiones."),
    fields: z.array(DATOS).min(1),
    rlsEnabled: z.boolean().default(true),
    description: z.string().max(2000).optional(),
  }),

  kitsuden_install_kon: z.object({
    konId: z.string().min(1).max(120),
    source: z.enum(["local", "npm", "marketplace"]).default("npm"),
  }),

  kitsuden_define_action: z.object({
    name: z.string().min(1).max(200),
    slug: z.string().min(1).max(120),
    type: z.enum(["code", "webhook_out", "webhook_in", "agent"]),
    trigger: z.enum(["manual", "cron", "event", "http"]),
    triggerConfig: DATOS.optional(),
    config: DATOS.optional(),
  }),

  kitsuden_enable_auth: z.object({
    methods: z.array(z.string().min(1)).min(1),
    requireEmailVerification: z.boolean().default(true),
  }),

  kitsuden_dispatch_worker: z.object({
    queueName: z.literal("email"),
    jobName: z.string().min(1).max(120),
    payload: PAYLOAD_EMAIL,
  }),

  kitsuden_generate_frontend_hook: z.object({
    collection: z.string().min(1),
    framework: z.enum(["react", "vue", "svelte"]).default("react"),
    type: z.enum(["hook", "component", "form", "types", "all"]).default("all"),
  }),
} as const;

export type NombreDeHerramienta = keyof typeof ESQUEMAS_ARGS;

/** Forma ya validada de los argumentos de una herramienta. */
type ArgsDe<N extends NombreDeHerramienta> = z.infer<(typeof ESQUEMAS_ARGS)[N]>;

/** Los nombres con esquema. Lo usa el test que impide añadir uno sin él. */
export function nombresConEsquema(): string[] {
  return Object.keys(ESQUEMAS_ARGS);
}

/**
 * Valida los argumentos de una herramienta.
 *
 * Lanza si la herramienta no tiene esquema: es deliberado. Una herramienta sin
 * validación declarada no debe poder ejecutarse "por defecto" — así el olvido
 * se nota al primer uso y no cuando alguien manda algo raro.
 */
function validarArgs<N extends NombreDeHerramienta>(
  nombre: N,
  args: Record<string, unknown>
): z.infer<(typeof ESQUEMAS_ARGS)[N]> {
  const esquema = ESQUEMAS_ARGS[nombre];
  if (!esquema) throw new Error(`La herramienta '${nombre}' no declara esquema de argumentos`);

  const r = esquema.safeParse(args ?? {});
  if (!r.success) {
    const detalle = r.error.issues
      .map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`)
      .join("; ");
    throw new Error(`Argumentos inválidos para '${nombre}' — ${detalle}`);
  }
  return r.data as z.infer<(typeof ESQUEMAS_ARGS)[N]>;
}

function hasToolScope(scopes: string[], required: string): boolean {
  // La regla única de Kitsuden (comodines y denegaciones): @kitsuden/shared.
  return concedeScope(scopes, required);
}

/**
 * Herramientas que leen o escriben un DATASET, y la acción que piden sobre él.
 * Para ellas el permiso se decide con el dataset ya resuelto (fase E):
 *
 *   1. una denegación `!datasets:<slug>:<acción>` (o más amplia) → no;
 *   2. `datasets:<slug>:<acción>` (o `datasets:*:<acción>`…) → sí;
 *   3. si no, el scope amplio de la herramienta (`mcp:read`/`mcp:write`),
 *      como siempre.
 *
 * Sobre una tabla nativa (no dataset) solo vale el amplio.
 */
const ACCION_DE_DATASET: Partial<Record<string, AccionDeDataset>> = {
  kitsuden_list_datasets: "read",
  kitsuden_describe_collection: "read",
  kitsuden_query_collection: "read",
  kitsuden_query_dataset: "read",
  kitsuden_create_record: "write",
  kitsuden_insert_record: "write",
  kitsuden_update_record: "write",
  kitsuden_delete_record: "delete",
};

class PermisoDeHerramienta extends Error {
  readonly status = 403;
  readonly code = "FORBIDDEN";
}

/**
 * Quién llama a la herramienta (el agente de la sesión MCP), para las reglas
 * que no dependen solo de los scopes: la política del dataset, sus `rlsRules`
 * y el firmante. Se fija una vez por llamada en `executeHardcodedTool`.
 */
interface ActorMcp {
  id: string;
  scopes: string[];
  sponsor: FirmanteDeAgente | null;
  /** The human who approved this call, when it replays a held proposal. Set only by the server. */
  approvedBy?: string;
  /** La transacción RLS de la llamada (ver `executeHardcodedTool`). */
  tx?: unknown;
  /** Envoltorio del contenido no confiable del agente (lib/procedencia.ts). */
  untrustedWrap?: ModoDeEnvoltorio;
}
const actorDeLaLlamada = new AsyncLocalStorage<ActorMcp>();
const actor = (): ActorMcp => actorDeLaLlamada.getStore() ?? { id: "", scopes: [], sponsor: null };

/**
 * La conexión de las herramientas: la transacción RLS de la llamada, o la
 * global fuera de una (p. ej. una prueba que llama a una función suelta).
 * Auditoría 2026-10-25: `/api/mcp` no corría en la transacción RLS y todas
 * las consultas de aquí iban por `db` con el contexto vacío, que las
 * políticas tratan como «sistema».
 */
const bd = (): typeof db => (actor().tx as typeof db | undefined) ?? db;

/** Un agente ante la política de un dataset (como lo ve kon-datasets en REST). */
const comoAgente = () => ({ id: actor().id || "agent", role: "agent" });

/** Lo mínimo de un dataset para decidir. */
interface DatasetConPolitica {
  slug: string;
  policyJson?: unknown;
}

/**
 * ¿Abre la POLÍTICA del dataset esta acción a un agente que solo trae el
 * scope amplio de la herramienta? Fase F, decisión del propietario: igual que
 * REST (kon-datasets) — leer necesita `readAccess` que admita a una sesión
 * (`public`/`authenticated`) o el scope de política `dataset:view`
 * (`admin` lo cubre); escribir, además, `writeAccess` o
 * `dataset-entry:<create|update|delete>`. Sin política = solo admin.
 */
function politicaAbre(scopes: string[], ds: DatasetConPolitica, accion: AccionDeDataset): boolean {
  const politica = (ds.policyJson ?? null) as PolicyJson | null;
  const lee = checkReadAccess(politica, comoAgente()) || concedeScope(scopes, "dataset:view");
  if (accion === "read") return lee;
  const permiso = accion === "delete" ? "dataset-entry:delete" : "dataset-entry:create";
  return lee && (checkWriteAccess(politica, comoAgente()) || concedeScope(scopes, permiso));
}

/**
 * ¿Puede esta sesión usar `tool` sobre el dataset? Lanza 403 si no.
 *
 *   1. una denegación `!datasets:<slug>:<acción>` → no;
 *   2. `datasets:<slug>:<acción>` → sí (fase E: el scope por dataset abre);
 *   3. si no, el scope amplio de la herramienta abre la HERRAMIENTA, y la
 *      política del dataset decide (fase F; antes `mcp:read` leía cualquier
 *      dataset, también los «solo admin»).
 */
/**
 * ¿Puede este agente LEER el dataset? La misma regla que las herramientas
 * (scope por dataset, denegaciones, política), sin lanzar. La usan los
 * recursos MCP (`kitsuden://datasets`), que antes listaban todos.
 */
export function agentePuedeLeerDataset(
  agente: { agentId: string; scopes: string[] },
  ds: DatasetConPolitica
): boolean {
  return actorDeLaLlamada.run({ id: agente.agentId, scopes: agente.scopes, sponsor: null }, () => {
    try {
      exigirDataset("kitsuden_list_datasets", agente.scopes, ds);
      return true;
    } catch {
      return false;
    }
  });
}

function exigirDataset(toolName: string, scopes: string[] | undefined, ds: DatasetConPolitica): void {
  const accion = ACCION_DE_DATASET[toolName] ?? "read";
  const lista = scopes ?? [];
  const acceso = accesoADataset(lista, ds.slug, accion);
  if (acceso === "denegado") {
    throw new PermisoDeHerramienta(
      `Agent key is denied '${accion}' on dataset '${ds.slug}' (tool '${toolName}')`
    );
  }
  if (acceso === "concedido") return;
  assertToolScope(toolName, lista);
  if (!politicaAbre(lista, ds, accion)) {
    throw new PermisoDeHerramienta(
      `Dataset '${ds.slug}' policy does not allow '${accion}' for agents (tool '${toolName}'). ` +
        `Grant 'datasets:${ds.slug}:${accion}' or change the dataset's policy.`
    );
  }
}

/**
 * Las `rlsRules` de la política, como en REST: a un agente se le aplican
 * siempre (no es del equipo), aunque el dataset se le abra por scope.
 */
function dondeVisibleParaAgente(datasetId: string, ds: { policyJson?: unknown }) {
  const reglas = ((ds.policyJson ?? null) as PolicyJson | null)?.rlsRules as RLSRule[] | undefined;
  return buildDatasetWhere(datasetId, reglas, comoAgente()).where;
}

/**
 * Which rows of a dataset this agent reads: like REST outside the team, the
 * published and its own (`created_by_id`: their owner is its sponsor). An agent
 * with `admin` stands for the team.
 */
function filasLegibles(scopes: string[]) {
  return hasToolScope(scopes, "admin") ? undefined : publishedOrOwn(actor().id || null);
}

/**
 * The row an update or delete by id may touch, or `null` (treated as not found:
 * a hidden row does not exist for this agent). `policyJson.rlsRules` always apply.
 *
 * Like REST (`dataset-entry:update|delete`): an agent let in by a scope that names
 * the action (`datasets:<slug>:<action>`, `dataset-entry:<verb>`, `admin`) edits
 * any row it can see; one let in only by `mcp:write` plus the dataset's policy
 * edits only its own. Before, that one edited or deleted any row by id.
 */
async function filaEditable(
  ds: DatasetConPolitica,
  dataSetId: string,
  entryId: string,
  accion: "write" | "delete",
  scopes: string[] | undefined
): Promise<typeof dataEntries.$inferSelect | null> {
  const [fila] = await bd()
    .select()
    .from(dataEntries)
    .where(and(dondeVisibleParaAgente(dataSetId, ds) ?? eq(dataEntries.dataSetId, dataSetId), eq(dataEntries.id, entryId)))
    .limit(1);
  if (!fila) return null;
  const lista = scopes ?? [];
  const yo = actor().id;
  if (!yo) return fila;
  // A human reviewed this exact call, so it is not limited to the agent's own rows.
  if (actor().approvedBy) return fila;
  const verbo = accion === "delete" ? "dataset-entry:delete" : "dataset-entry:update";
  if (accesoADataset(lista, ds.slug, accion) === "concedido" || concedeScope(lista, verbo)) return fila;
  return fila.ownerId === yo || fila.createdById === yo ? fila : null;
}

/**
 * El dueño de una entrada que crea el agente: su FIRMANTE humano (fase F,
 * @kitsuden/shared firmante.ts). Sin firmante, sin dueño (salvo un agente con
 * `admin` que lo nombre en `data.ownerId`). Lanza 403 si no vale.
 */
function duenoDeEntrada(pedido: unknown): string | null {
  const a = actor();
  if (!a.id) return typeof pedido === "string" ? pedido : null;
  const firma = firmaDeAgente(
    { role: "agent", scopes: a.scopes, sponsor: a.sponsor },
    typeof pedido === "string" ? pedido : null,
    "nadie"
  );
  if (!firma.ok) throw new PermisoDeHerramienta(`${firma.code}: ${firma.mensaje}`);
  return firma.autor;
}

/** ¿Puede ver ESTE dataset en un listado? (sin lanzar) */
function veDataset(scopes: string[] | undefined, ds: DatasetConPolitica): boolean {
  const slug = ds.slug;
  const acceso = accesoADataset(scopes ?? [], slug, "read");
  if (acceso === "denegado") return false;
  if (acceso === "concedido") return true;
  return (
    hasToolScope(scopes ?? [], TOOL_SCOPES.kitsuden_list_datasets!) &&
    politicaAbre(scopes ?? [], ds, "read")
  );
}

/**
 * ¿Tiene la sesión ALGÚN camino para esta herramienta de datasets? (el amplio,
 * o un scope de dataset con esa acción). Si no, se corta antes de tocar nada.
 */
function puedeIntentarDataset(toolName: string, scopes: string[] | undefined): boolean {
  const accion = ACCION_DE_DATASET[toolName];
  if (!accion) return false;
  const lista = scopes ?? [];
  if (hasToolScope(lista, TOOL_SCOPES[toolName] || "mcp:read")) return true;
  return lista.some((s) => {
    if (s.startsWith("!") || !s.startsWith("datasets:")) return false;
    const partes = s.split(":");
    const ultimo = partes[partes.length - 1];
    return ultimo === accion || ultimo === "*";
  });
}

/**
 * Verifica si el contexto del agente tiene el scope requerido para una tool.
 */
/** ¿Escribe esta herramienta del núcleo? (para la cuota de escrituras del día) */
export function herramientaQueEscribe(toolName: string): boolean {
  const s = TOOL_SCOPES[toolName];
  return s === "mcp:write" || s === "mcp:admin" || s === "mail:send";
}

/**
 * ¿Podría esta sesión usar la herramienta del núcleo? (sin lanzar). Fase F: si
 * no, la llamada no se retiene como propuesta; sigue y da su error de siempre.
 */
export function puedeIntentarHerramienta(toolName: string, scopes?: string[]): boolean {
  const lista = scopes ?? [];
  if (ACCION_DE_DATASET[toolName] && puedeIntentarDataset(toolName, lista)) return true;
  return hasToolScope(lista, TOOL_SCOPES[toolName] || "mcp:read");
}

export function assertToolScope(toolName: string, scopes?: string[]): void {
  const required = TOOL_SCOPES[toolName] || "mcp:read";
  if (!hasToolScope(scopes || [], required)) {
    throw new Error(`Agent lacks required scope '${required}' to execute tool '${toolName}'`);
  }
}

/**
 * Scope base de una herramienta DINÁMICA (acción `agent.tool:*` de un kon).
 * No se sabe si lee o escribe —es código del kon—, así que se exige
 * `mcp:write`: con el `mcp:read` por defecto, un agente de solo lectura
 * ejecutaba acciones que escriben. Los `requiredScopes` que la acción
 * declare los exige después el engine.
 */
export function assertDynamicToolScope(toolName: string, scopes?: string[]): void {
  if (!hasToolScope(scopes || [], "mcp:write")) {
    throw new Error(`Agent lacks required scope 'mcp:write' to execute tool '${toolName}'`);
  }
}

export interface MCPSessionContext {
  /** The human who approved this call, when it replays a held proposal. */
  approvedBy?: string;
  agentId: string;
  agentName: string;
  apiKeyId?: string;
  scopes?: string[];
  /** Fase F: el firmante humano del agente (dueño de lo que crea). */
  sponsor?: FirmanteDeAgente | null;
  /** Envoltorio del contenido no confiable por defecto (panel, lib/ajustes-mcp.ts). */
  untrustedWrap?: ModoDeEnvoltorio;
}

export interface MCPExecutionCallbacks {
  /**
   * Llamado después de mutar datos para invalidar caches (p.ej. GraphQL).
   */
  onMutate?: () => Promise<void> | void;
}

/**
 * Lista de herramientas MCP hardcodeadas disponibles para agentes.
 */
/**
 * El formato en que salió el texto de la herramienta que se está ejecutando.
 * Las herramientas devuelven texto; quien necesita saber el formato (la ruta
 * MCP, para ponerlo en `_meta`) llama a `executeHardcodedToolConFormato`.
 */
const formatoDeLaSalida = new AsyncLocalStorage<{ formato?: Formato; procedencia?: Procedencia }>();

/** Codifica el resultado de una herramienta en el formato pedido (`auto` por defecto). */
function salida(datos: unknown, pedido: FormatoPedido | undefined, herramienta: string): string {
  const r = codificarRespuesta(datos, pedido ?? "auto", { clave: `mcp:${herramienta}` });
  const registro = formatoDeLaSalida.getStore();
  if (registro) registro.formato = r.formato;
  return r.texto;
}

/**
 * Como `executeHardcodedTool`, y además dice en qué formato salió el texto
 * (`undefined` si la herramienta devolvió un mensaje y no datos).
 */
export async function executeHardcodedToolConFormato(
  name: string,
  args: Record<string, unknown>,
  session?: MCPSessionContext,
  callbacks?: MCPExecutionCallbacks
): Promise<{ text: string; formato?: Formato; procedencia?: Procedencia }> {
  const registro: { formato?: Formato; procedencia?: Procedencia } = {};
  const text = await formatoDeLaSalida.run(registro, () => executeHardcodedTool(name, args, session, callbacks));
  return { text, formato: registro.formato, procedencia: registro.procedencia };
}

/**
 * Quién escribió cada fila (lib/procedencia.ts) y, si se pidió, el texto de
 * las no confiables envuelto. La procedencia queda en el registro de la
 * llamada para que la ruta MCP la ponga en `_meta`.
 */
async function conProcedencia<T>(filas: T[], pedido: ModoDeEnvoltorio | undefined): Promise<T[]> {
  const modo = pedido ?? actor().untrustedWrap ?? "none";
  const procedencia = await procedenciaDeFilas(filas, bd() as never, { lector: actor().id || null, wrap: modo });
  const registro = formatoDeLaSalida.getStore();
  if (registro) registro.procedencia = procedencia;
  return envolverFilas(filas, procedencia, modo);
}

/** ¿Solo lee esta herramienta del núcleo? (toolset `read`, lib/ajustes-mcp.ts) */
export function herramientaDelNucleoDeSoloLectura(toolName: string): boolean {
  return TOOL_SCOPES[toolName] === "mcp:read";
}

/** ¿Es de datasets/colecciones del núcleo? (toolset `data`) */
export function herramientaDelNucleoDeDatos(toolName: string): boolean {
  return /^kitsuden_(list_datasets|describe_collection|query_collection|query_dataset|create_record|update_record|delete_record|insert_record)$/.test(
    toolName
  );
}

export function listHardcodedMCPTools(): LLMTool[] {
  return HARD_CODED_TOOLS;
}

/**
 * Ejecuta una herramienta MCP hardcodeada por nombre.
 */
export async function executeHardcodedTool(
  name: string,
  args: Record<string, unknown>,
  session?: MCPSessionContext,
  callbacks?: MCPExecutionCallbacks
): Promise<string> {
  // Las de datasets deciden con el dataset resuelto (ver ACCION_DE_DATASET);
  // aquí solo se corta a quien no tiene NINGÚN camino. Las demás, su scope.
  if (ACCION_DE_DATASET[name]) {
    if (!puedeIntentarDataset(name, session?.scopes)) assertToolScope(name, session?.scopes);
  } else {
    assertToolScope(name, session?.scopes);
  }
  const scopes = session?.scopes ?? [];
  // Dentro de una transacción con el contexto RLS del agente, el MISMO que
  // tendría por REST (`role: "agent"`, ver index.ts), y con sus scopes en
  // `app.agent_scopes`: Postgres filtra por fila también aquí, no solo la
  // lógica de cada herramienta. Las políticas de `data_entries` conocen las
  // dos vías de la aplicación — scopes finos y fase F (scope de la
  // herramienta + `policyJson`), ver `kitsuden_agente_abre_por_politica` en
  // rls-policies.sql (auditoría 2026-10-25).
  return db.transaction(async (tx) => {
    const usuario = { id: session?.agentId ?? "", role: "agent", scopes };
    await fijarContextoRls(tx as never, usuario);
    return actorDeLaLlamada.run(
      { id: session?.agentId ?? "", scopes, sponsor: session?.sponsor ?? null, approvedBy: session?.approvedBy, tx, untrustedWrap: session?.untrustedWrap },
      () => ejecutarConActor(name, args, scopes, callbacks)
    );
  });
}

async function ejecutarConActor(
  name: string,
  args: Record<string, unknown>,
  scopes: string[],
  callbacks?: MCPExecutionCallbacks
): Promise<string> {
  // Ninguna herramienta se ejecuta sin esquema declarado. No es una comprobación
  // defensiva de más: si alguien añade una y olvida el esquema, esto falla al
  // primer uso en vez de dejarla pasar sin validar.
  if (!(name in ESQUEMAS_ARGS)) {
    throw new Error(`Unknown hardcoded MCP tool: ${name}`);
  }

  // `validarArgs` se llama con el nombre LITERAL en cada rama, no con una
  // variable: así TypeScript sabe exactamente qué forma devuelve y los
  // handlers reciben un tipo concreto. Con un `validarArgs(name, args)` común
  // habría que castear en cada llamada, que es cambiar un `as any` por otro
  // cast y dejar la medida igual de engañosa.
  switch (name) {
    case "kitsuden_list_datasets":
      return kitsudenListDatasets(validarArgs("kitsuden_list_datasets", args), scopes);
    case "kitsuden_describe_collection":
      return kitsudenDescribeCollection(validarArgs("kitsuden_describe_collection", args), scopes);
    case "kitsuden_system_status":
      return kitsudenSystemStatus();
    case "kitsuden_query_collection":
      return kitsudenQueryCollection(validarArgs("kitsuden_query_collection", args), scopes);
    case "kitsuden_create_record":
      return kitsudenCreateRecord(validarArgs("kitsuden_create_record", args), callbacks, scopes);
    case "kitsuden_update_record":
      return kitsudenUpdateRecord(validarArgs("kitsuden_update_record", args), callbacks, scopes);
    case "kitsuden_delete_record":
      return kitsudenDeleteRecord(validarArgs("kitsuden_delete_record", args), callbacks, scopes);
    case "kitsuden_query_dataset":
      return kitsudenQueryDataset(validarArgs("kitsuden_query_dataset", args), scopes);
    case "kitsuden_insert_record":
      return kitsudenInsertRecord(validarArgs("kitsuden_insert_record", args), callbacks, scopes);
    case "kitsuden_create_dataset":
      return kitsudenCreateDataset(validarArgs("kitsuden_create_dataset", args), callbacks);
    case "kitsuden_install_kon":
      return kitsudenInstallKon(validarArgs("kitsuden_install_kon", args), callbacks);
    case "kitsuden_define_action":
      return kitsudenDefineAction(validarArgs("kitsuden_define_action", args));
    case "kitsuden_enable_auth":
      return kitsudenEnableAuth(validarArgs("kitsuden_enable_auth", args));
    case "kitsuden_dispatch_worker":
      return kitsudenDispatchWorker(validarArgs("kitsuden_dispatch_worker", args));
    case "kitsuden_generate_frontend_hook":
      return kitsudenGenerateFrontendHook(validarArgs("kitsuden_generate_frontend_hook", args));
    default:
      throw new Error(`Unknown hardcoded MCP tool: ${name}`);
  }
}

const HARD_CODED_TOOLS: LLMTool[] = [
  {
    type: "function",
    function: {
      name: "kitsuden_list_datasets",
      description:
        "List all available datasets with their field schemas. Useful for discovering data structure before querying.",
      parameters: {
        type: "object",
        properties: {
          format: FORMATO_JSON_SCHEMA,
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "kitsuden_describe_collection",
      description:
        "Get the schema (columns/fields) of any collection — dataset or native table. Essential before querying unknown collections.",
      parameters: {
        type: "object",
        properties: {
          collection: {
            type: "string",
            description: "Dataset slug or native table name, e.g. 'blog-posts' or 'games'",
          },
          format: FORMATO_JSON_SCHEMA,
        },
        required: ["collection"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "kitsuden_system_status",
      description:
        "Get full system health: database, queue, realtime, memory, active kons, and GraphQL schema status.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "kitsuden_query_collection",
      description:
        "Query records from ANY collection — dataset or native kon table. Uses the unified /api/items/{collection} endpoint. Respects RLS. Supports search, sort and pagination; the result comes in the shortest lossless format (see 'format').",
      parameters: {
        type: "object",
        properties: {
          collection: {
            type: "string",
            description: "Dataset slug or table name, e.g. 'blog-posts', 'games', 'tasks'",
          },
          limit: { type: "number", default: 50, description: "Max records (max 1000)" },
          offset: { type: "number", default: 0, description: "Pagination offset" },
          search: { type: "string", description: "Full-text search on title/name fields" },
          sort: {
            type: "string",
            description: "Sort field, e.g. 'createdAt' or '-createdAt' for desc",
          },
          where: {
            type: "object",
            description: "JSON filter object, e.g. {status: 'published'}",
          },
          format: FORMATO_JSON_SCHEMA,
          untrusted_wrap: ENVOLTORIO_JSON_SCHEMA,
        },
        required: ["collection"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "kitsuden_create_record",
      description:
        "Insert a new record into ANY collection — dataset or native table. Uses /api/items/{collection}.",
      parameters: {
        type: "object",
        properties: {
          collection: { type: "string", description: "Dataset slug or table name" },
          data: { type: "object", description: "Record payload" },
          status: {
            type: "string",
            default: "published",
            description: "Initial status (datasets only)",
          },
        },
        required: ["collection", "data"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "kitsuden_update_record",
      description:
        "Update a record by ID in ANY collection — dataset or native table. Uses /api/items/{collection}/{id}.",
      parameters: {
        type: "object",
        properties: {
          collection: { type: "string", description: "Dataset slug or table name" },
          id: { type: "string", description: "Record UUID or primary key" },
          data: { type: "object", description: "Fields to update" },
        },
        required: ["collection", "id", "data"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "kitsuden_delete_record",
      description:
        "Delete a record by ID from ANY collection — dataset or native table. Uses /api/items/{collection}/{id}.",
      parameters: {
        type: "object",
        properties: {
          collection: { type: "string", description: "Dataset slug or table name" },
          id: { type: "string", description: "Record UUID or primary key" },
        },
        required: ["collection", "id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "kitsuden_query_dataset",
      description:
        "[Legacy] Query records from a dataset by UUID. Prefer kitsuden_query_collection for new code.",
      parameters: {
        type: "object",
        properties: {
          datasetId: { type: "string", description: "UUID of the dataset" },
          limit: { type: "number", default: 50, description: "Max records (max 100)" },
          offset: { type: "number", default: 0, description: "Pagination offset" },
          status: {
            type: "string",
            enum: ["draft", "published", "archived"],
            description: "Filtro por estado",
          },
          format: FORMATO_JSON_SCHEMA,
          untrusted_wrap: ENVOLTORIO_JSON_SCHEMA,
        },
        required: ["datasetId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "kitsuden_insert_record",
      description:
        "[Legacy] Insert a record into a dataset by UUID. Prefer kitsuden_create_record for new code.",
      parameters: {
        type: "object",
        properties: {
          datasetId: { type: "string", description: "UUID of the dataset" },
          data: { type: "object", description: "Record data matching dataset schema" },
          status: { type: "string", enum: ["draft", "published", "archived"], default: "draft" },
        },
        required: ["datasetId", "data"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "kitsuden_create_dataset",
      description:
        "Create a new JSONB dataset with a defined schema. This is the primary way to store custom user-defined data when no kon exists for the use case.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Display name of the dataset" },
          slug: { type: "string", description: "URL-friendly identifier" },
          fields: { type: "array", description: "Schema fields", items: { type: "object" } },
          rlsEnabled: {
            type: "boolean",
            default: true,
            description: "Enable row-level security",
          },
          description: { type: "string", description: "Optional description" },
        },
        required: ["name", "slug", "fields"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "kitsuden_install_kon",
      description:
        "Install a kon (domain module). Registers it in the database, runs SQL migrations if found locally, and enables it in the module registry.",
      parameters: {
        type: "object",
        properties: {
          konId: { type: "string", description: "e.g. kon-crm" },
          source: {
            type: "string",
            enum: ["local", "npm", "marketplace"],
            default: "npm",
            description: "Installation source",
          },
          autoEnable: {
            type: "boolean",
            default: true,
            description: "Enable immediately in modules table",
          },
        },
        required: ["konId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "kitsuden_define_action",
      description:
        "Create a unified action (code, webhook, or agent trigger) that runs automation in response to events.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          slug: { type: "string" },
          type: { type: "string", enum: ["code", "webhook_out", "webhook_in", "agent"] },
          trigger: { type: "string", enum: ["manual", "cron", "event", "http"] },
          triggerConfig: {
            type: "object",
            description: "e.g. {cronExpression, eventName, httpPath}",
          },
          config: { type: "object", description: "e.g. {code, url, method}" },
        },
        required: ["name", "slug", "type", "trigger"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "kitsuden_enable_auth",
      description:
        "Configure authentication methods for the project. Updates the site settings to reflect enabled auth providers.",
      parameters: {
        type: "object",
        properties: {
          methods: {
            type: "array",
            items: { type: "string" },
            description: "Auth providers: email, google, github, microsoft",
          },
          requireEmailVerification: { type: "boolean", default: true },
        },
        required: ["methods"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "kitsuden_dispatch_worker",
      description: "Enqueue an async background email job. Only the 'email' queue exists today.",
      parameters: {
        type: "object",
        properties: {
          // Antes decía "email, webhooks". La de webhooks no existe: el handler
          // responde `Unknown queue`. Anunciar una cola que no está solo hace
          // que el modelo la intente y falle.
          queueName: { type: "string", enum: ["email"], description: "Queue name" },
          jobName: { type: "string", description: "Job handler name, e.g. system.welcome" },
          payload: {
            type: "object",
            description: "Email payload: {to, subject, html, text?}",
            properties: {
              to: { type: "string" },
              subject: { type: "string" },
              html: { type: "string" },
              text: { type: "string" },
            },
            required: ["to", "subject", "html"],
          },
        },
        required: ["queueName", "jobName", "payload"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "kitsuden_generate_frontend_hook",
      description:
        "Generate complete, strongly-typed frontend code (React hooks, Vue composables, Svelte stores, components, forms, types) for any collection. Uses the real codegen engine.",
      parameters: {
        type: "object",
        properties: {
          collection: {
            type: "string",
            description: "Dataset slug or table name, e.g. 'blog-posts' or 'games'",
          },
          framework: { type: "string", enum: ["react", "vue", "svelte"], default: "react" },
          type: {
            type: "string",
            enum: ["hook", "component", "form", "types", "all"],
            default: "all",
          },
        },
        required: ["collection"],
      },
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// TOOL IMPLEMENTATIONS
// ═══════════════════════════════════════════════════════════════════════════

async function kitsudenListDatasets(
  args: ArgsDe<"kitsuden_list_datasets">,
  scopes: string[]
): Promise<string> {
  const format = (args.format as FormatoPedido) || "auto";
  const allDatasets = (await bd().select().from(dataSets).orderBy(dataSets.name)).filter((ds) =>
    veDataset(scopes, ds)
  );
  const mapped = allDatasets.map((ds: any) => ({
    id: ds.id,
    name: ds.name,
    slug: ds.slug,
    description: ds.description,
    fields:
      camposDelSchema(ds.schema)
        .map((f: any) => `${f.key ?? f.name}:${f.type}${f.required ? "*" : ""}`)
        .join(", ") || "none",
  }));
  return salida(mapped, format, "kitsuden_list_datasets");
}

async function kitsudenDescribeCollection(
  args: ArgsDe<"kitsuden_describe_collection">,
  scopes: string[]
): Promise<string> {
  const collection = args.collection as string;
  const format = (args.format as FormatoPedido) || "auto";

  const [ds] = await bd().select().from(dataSets).where(eq(dataSets.slug, collection)).limit(1);
  if (ds) {
    exigirDataset("kitsuden_describe_collection", scopes, ds);
    const output = {
      type: "dataset",
      id: ds.id,
      name: ds.name,
      slug: ds.slug,
      schema: ds.schema,
      policyJson: ds.policyJson,
    };
    return salida(output, format, "kitsuden_describe_collection");
  }

  const table = tablaNativaPermitida("kitsuden_describe_collection", scopes, collection, "esquema");
  if (!table) {
    return `Collection not found: ${collection}`;
  }

  const columns =
    columnasDeTabla(table) ??
    Object.entries(columnasDeTabla(table) || {}).map(([name, col]: [string, any]) => ({
      name: col.name || name,
      type: col.dataType || col.columnType || "string",
      notNull: !!col.notNull,
      primary: !!col.primary,
    }));

  const output = { type: "native_table", name: collection, columns };
  return salida(output, format, "kitsuden_describe_collection");
}

async function kitsudenSystemStatus(): Promise<string> {
  try {
    const [{ count: datasetCount }] = await bd().select({ count: sql`COUNT(*)` }).from(dataSets);
    const [{ count: entryCount }] = await bd().select({ count: sql`COUNT(*)` }).from(dataEntries);
    const [{ count: konCount }] = await bd().select({ count: sql`COUNT(*)` }).from(installedKons);
    const [{ count: actionCount }] = await bd().select({ count: sql`COUNT(*)` }).from(actions);

    const status = {
      database: "connected",
      datasets: Number(datasetCount),
      entries: Number(entryCount),
      installedKons: Number(konCount),
      actions: Number(actionCount),
      activeModules: KON_REGISTRY.length,
      memory: {
        used: process.memoryUsage().heapUsed,
        total: process.memoryUsage().heapTotal,
      },
      uptime: process.uptime(),
    };
    return JSON.stringify(status);
  } catch (err: unknown) {
    return `System status failed: ${messageOf(err)}`;
  }
}

/**
 * Sanitiza una clave para accesos a JSONB.
 * Solo permite identificadores alfanuméricos con guiones bajos y guiones.
 */
function sanitizeJsonbKey(key: string): string | null {
  if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(key)) return null;
  return key;
}

/**
 * Busca una tabla del esquema por su nombre, sin distinguir mayúsculas.
 *
 * Estaba escrito CINCO veces, idéntico, cada una con su `(mergedSchema as any)`
 * y su propia comprobación de nulo. Cinco copias de una búsqueda por nombre es
 * como acaban divergiendo: basta que una añada un alias o normalice distinto.
 *
 * El nombre lo elige un LLM, así que la resolución tiene que ser por
 * coincidencia contra las claves REALES del esquema y nunca por concatenación:
 * así un nombre inventado devuelve `null` en vez de construir una referencia.
 */
/**
 * Accesos a las tripas de una tabla de Drizzle resuelta en ejecución.
 *
 * Drizzle guarda los metadatos en símbolos internos y su tipo público no
 * expone las columnas por índice, así que aquí hace falta un `any`. La
 * diferencia con antes es que ahora hay UNO, justificado y en un sitio, en vez
 * de seis sueltos por el archivo: si Drizzle cambia estos símbolos, se arregla
 * aquí y no se va buscando.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ver el bloque de arriba
const tripas = (tabla: PgTable): any => tabla as any;

/** Nombre real de la tabla en la base. */
function nombreDeTabla(tabla: PgTable): string {
  return String(tripas(tabla)[Symbol.for("drizzle:Name")] ?? "");
}

/** Metadatos de columnas, del símbolo interno o del objeto `columns`. */
function columnasDeTabla(tabla: PgTable): unknown {
  const t = tripas(tabla);
  return t[Symbol.for("drizzle:Columns")] ?? t.columns ?? {};
}

/**
 * Columna `id`. LANZA si no existe en vez de devolver `undefined`, que era lo
 * que pasaba antes: un `eq(undefined, valor)` produce SQL roto o, peor, una
 * condición que no filtra nada en un UPDATE.
 */
function columnaId(tabla: PgTable, operacion: string): unknown {
  const col = tripas(tabla).id;
  if (!col) throw new Error(`${operacion}: la colección no tiene columna 'id'`);
  return col;
}

function tablaDelEsquema(nombre: unknown): PgTable | null {
  if (typeof nombre !== "string" || nombre === "") return null;
  const clave = Object.keys(mergedSchema).find((k) => k.toLowerCase() === nombre.toLowerCase());
  if (!clave) return null;
  const tabla = (mergedSchema as Record<string, unknown>)[clave];
  // El esquema fusionado también trae enums y relaciones; solo valen tablas.
  return tabla && typeof tabla === "object" ? (tabla as PgTable) : null;
}

/**
 * ── TABLAS NATIVAS POR MCP (auditoría 2026-10-25) ──────────────────────────
 *
 * Las herramientas de colección caían a CUALQUIER tabla del esquema fusionado
 * —`auth_users`, `auth_verifications`, `agent_identities`…— con solo
 * `mcp:read`/`mcp:write`, y `/api/mcp` no corre dentro de la transacción RLS.
 * Con el preset de solo lectura un agente leía el token de un reset de
 * contraseña (better-auth lo guarda en claro) y se quedaba con la cuenta del
 * admin; con `mcp:write` se escribía `scopes: ["admin"]` en su propia fila.
 *
 * Ahora:
 *   · LEER o ESCRIBIR datos de una tabla nativa exige el scope `admin` (lo
 *     mismo que `/api/items` por REST). Un agente normal trabaja con datasets.
 *   · Las tablas de `TABLAS_PROHIBIDAS` (credenciales, sesiones, claves,
 *     secretos) no se tocan por MCP con ningún scope, ni para describirlas.
 *   · Las de `TABLAS_SIN_ESCRITURA_MCP` se pueden leer (con `admin`) pero
 *     nunca escribir por aquí: son las que dan o quitan poder a un agente o a
 *     una persona, y se cambian desde su pantalla, con su auditoría.
 *   · Lo que se devuelve pasa por `sinColumnasSecretas`.
 */
const SCOPE_TABLAS_NATIVAS = "admin";

const TABLAS_SIN_ESCRITURA_MCP = new Set([
  ...TABLAS_ESCRITURA_ADMIN,
  "agent_identities",
  "agent_proposals",
  "agent_proposal_files",
  "agent_audit_logs",
  "approval_settings",
  "actions",
  "data_sources",
  // Fase I: el código de las acciones y su historial, solo por la promoción.
  ...TABLAS_SOLO_POR_SU_RUTA,
]);

// La misma regla que GraphQL, relaciones y consultas por tabla: un solo sitio.
const prohibidaPorMcp = tablaNativaProhibida;

/**
 * La tabla nativa que puede usar esta herramienta, o lanza. `uso`:
 *   esquema   describirla (columnas): basta el scope de la herramienta;
 *   lectura   sus filas: además `admin`;
 *   escritura además `admin` y que no sea de `TABLAS_SIN_ESCRITURA_MCP`.
 */
function tablaNativaPermitida(
  toolName: string,
  scopes: string[],
  coleccion: unknown,
  uso: "esquema" | "lectura" | "escritura"
): PgTable | null {
  const tabla = tablaDelEsquema(coleccion);
  if (!tabla) return null;
  const nombre = nombreDeTabla(tabla);
  if (prohibidaPorMcp(nombre)) return null;
  assertToolScope(toolName, scopes);
  if (uso !== "esquema" && !hasToolScope(scopes, SCOPE_TABLAS_NATIVAS)) {
    throw new Error(
      `Tool '${toolName}' on the native table '${nombre}' requires the '${SCOPE_TABLAS_NATIVAS}' scope. Agents work with datasets: use kitsuden_list_datasets.`
    );
  }
  if (uso === "escritura" && TABLAS_SIN_ESCRITURA_MCP.has(nombre)) {
    throw new Error(`'${nombre}' cannot be written over MCP; use its admin screen.`);
  }
  return tabla;
}

async function kitsudenQueryCollection(
  args: ArgsDe<"kitsuden_query_collection">,
  scopes: string[]
): Promise<string> {
  const { collection, limit = 50, offset = 0, search, sort, where, format = "auto", untrusted_wrap } = args;

  if (!collection) return "Missing: collection";

  const [ds] = await bd().select().from(dataSets).where(eq(dataSets.slug, collection)).limit(1);
  let results: any[];

  if (ds) {
    exigirDataset("kitsuden_query_collection", scopes, ds);
    // Las `rlsRules` de la política, como en REST (fase F), y sin borradores ajenos.
    const conditions = [dondeVisibleParaAgente(ds.id, ds) ?? eq(dataEntries.dataSetId, ds.id), filasLegibles(scopes)];
    if (where && typeof where === "object") {
      for (const [k, v] of Object.entries(where)) {
        const safeKey = sanitizeJsonbKey(k);
        if (!safeKey) continue;
        conditions.push(sql`data->>${safeKey} = ${String(v)}`);
      }
    }
    results = await bd()
      .select()
      .from(dataEntries)
      .where(and(...conditions))
      .limit(Math.min(Number(limit) || 50, 1000))
      .offset(Number(offset) || 0);
  } else {
    const table = tablaNativaPermitida("kitsuden_query_collection", scopes, collection, "lectura");
    if (!table) return `Collection not found: ${collection}`;
    results = sinColumnasSecretas(
      await bd()
        .select()
        .from(table)
        .limit(Math.min(Number(limit) || 50, 1000))
        .offset(Number(offset) || 0)
    ) as any[];
  }

  return salida(await conProcedencia(results, untrusted_wrap), format, "kitsuden_query_collection");
}

async function kitsudenCreateRecord(
  args: ArgsDe<"kitsuden_create_record">,
  callbacks: MCPExecutionCallbacks | undefined,
  scopes: string[]
): Promise<string> {
  const { collection, data, status = "published" } = args;
  if (!collection || !data) return "Missing: collection, data";

  const [ds] = await bd().select().from(dataSets).where(eq(dataSets.slug, collection)).limit(1);
  if (ds) {
    exigirDataset("kitsuden_create_record", scopes, ds);
    // Fase F: el dueño es el FIRMANTE humano del agente; `created_by_id`, el agente.
    const dueno = duenoDeEntrada(data?.ownerId);
    const [record] = await bd()
      .insert(dataEntries)
      .values({
        dataSetId: ds.id,
        title: data?.title || data?.name || "Untitled",
        data: { ...(data || {}), ownerId: dueno },
        status,
        ownerId: dueno,
        createdById: actor().id || null,
      } as any)
      .returning();
    await callbacks?.onMutate?.();
    return `Created dataset record: ${record.id}`;
  }

  const table = tablaNativaPermitida("kitsuden_create_record", scopes, collection, "escritura");
  if (!table) return `Collection not found: ${collection}`;

  const result = (await bd()
    .insert(table as any)
    .values(data)
    .returning()) as any[];
  await callbacks?.onMutate?.();
  return `Created native record: ${result[0]?.id}`;
}

/**
 * Funde `data` sobre lo guardado, pero `ownerId` sigue siendo el de la fila:
 * al crear lo fija `duenoDeEntrada`, y una edición no puede cambiarlo (las
 * reglas `rlsRules` de un dataset filtran por `data->>'ownerId'`; sin esto un
 * agente plantaba sus filas en la vista de otro usuario).
 */
export function fusionarConservandoDueno(
  guardado: unknown,
  data: Record<string, unknown>
): Record<string, unknown> {
  const previo = (guardado && typeof guardado === "object" ? guardado : {}) as Record<string, unknown>;
  const fusion: Record<string, unknown> = { ...previo, ...data };
  if (Object.prototype.hasOwnProperty.call(previo, "ownerId")) fusion.ownerId = previo.ownerId;
  else delete fusion.ownerId;
  return fusion;
}

async function kitsudenUpdateRecord(
  args: ArgsDe<"kitsuden_update_record">,
  callbacks: MCPExecutionCallbacks | undefined,
  scopes: string[]
): Promise<string> {
  // Soporta tanto el esquema {collection, id, data} como el legacy {entryId, data, status}
  const legacyEntryId = args.entryId;
  const collection = args.collection;
  const recordId = args.id || legacyEntryId;
  const data = args.data;

  if (!recordId || !data) return "Missing: id (or entryId), data";

  if (legacyEntryId && !collection) {
    // Legacy MCP mode: entryId es un dataEntries.id
    const [existing] = await bd()
      .select()
      .from(dataEntries)
      .where(eq(dataEntries.id, recordId))
      .limit(1);
    if (!existing) return `Record not found: ${recordId}`;
    const delDataset = await datasetPorId(existing.dataSetId);
    exigirDataset("kitsuden_update_record", scopes, delDataset);
    if (!(await filaEditable(delDataset, existing.dataSetId, recordId, "write", scopes))) {
      return `Record not found: ${recordId}`;
    }
    const mergedData = fusionarConservandoDueno(existing.data, data);
    const updates: Record<string, unknown> = { data: mergedData, updatedAt: new Date() };
    if (args.status) updates.status = args.status;
    const [updated] = await bd()
      .update(dataEntries)
      .set(updates)
      .where(eq(dataEntries.id, recordId))
      .returning();
    await callbacks?.onMutate?.();
    return `Updated dataset record: ${updated.id}`;
  }

  if (!collection) return "Missing: collection";

  const [ds] = await bd().select().from(dataSets).where(eq(dataSets.slug, collection)).limit(1);
  if (ds) {
    exigirDataset("kitsuden_update_record", scopes, ds);
    // De ESTE dataset: con el id de una entrada de otro, el scope de este no
    // puede servir para escribir en aquel.
    const existing = await filaEditable(ds, ds.id, recordId, "write", scopes);
    if (!existing) return `Record not found: ${recordId}`;
    const mergedData = fusionarConservandoDueno(existing.data, data);
    const [updated] = await bd()
      .update(dataEntries)
      .set({ data: mergedData, updatedAt: new Date() })
      .where(eq(dataEntries.id, recordId))
      .returning();
    await callbacks?.onMutate?.();
    return `Updated dataset record: ${updated.id}`;
  }

  const table = tablaNativaPermitida("kitsuden_update_record", scopes, collection, "escritura");
  if (!table) return `Collection not found: ${collection}`;

  const result = (await bd()
    .update(table)
    .set(data)
    .where(eq(columnaId(table, "update_record") as never, recordId))
    .returning()) as Array<{ id?: string }>;
  await callbacks?.onMutate?.();
  return `Updated native record: ${result[0]?.id}`;
}

async function kitsudenDeleteRecord(
  args: ArgsDe<"kitsuden_delete_record">,
  callbacks: MCPExecutionCallbacks | undefined,
  scopes: string[]
): Promise<string> {
  // Soporta {collection, id} y legacy {entryId}
  const legacyEntryId = args.entryId;
  const collection = args.collection;
  const recordId = args.id || legacyEntryId;

  if (!recordId) return "Missing: id (or entryId)";

  if (legacyEntryId && !collection) {
    const [existente] = await bd()
      .select({ dataSetId: dataEntries.dataSetId })
      .from(dataEntries)
      .where(eq(dataEntries.id, recordId))
      .limit(1);
    if (!existente) return `Record not found: ${recordId}`;
    const delDataset = await datasetPorId(existente.dataSetId);
    exigirDataset("kitsuden_delete_record", scopes, delDataset);
    if (!(await filaEditable(delDataset, existente.dataSetId, recordId, "delete", scopes))) {
      return `Record not found: ${recordId}`;
    }
    const [deleted] = await bd()
      .delete(dataEntries)
      .where(eq(dataEntries.id, recordId))
      .returning({ id: dataEntries.id });
    if (!deleted) return `Record not found: ${recordId}`;
    await callbacks?.onMutate?.();
    return `Deleted dataset record: ${deleted.id}`;
  }

  if (!collection) return "Missing: collection";

  const [ds] = await bd().select().from(dataSets).where(eq(dataSets.slug, collection)).limit(1);
  if (ds) {
    exigirDataset("kitsuden_delete_record", scopes, ds);
    if (!(await filaEditable(ds, ds.id, recordId, "delete", scopes))) {
      return `Record not found: ${recordId}`;
    }
    const [deleted] = await bd()
      .delete(dataEntries)
      .where(and(eq(dataEntries.id, recordId), eq(dataEntries.dataSetId, ds.id)))
      .returning({ id: dataEntries.id });
    if (!deleted) return `Record not found: ${recordId}`;
    await callbacks?.onMutate?.();
    return `Deleted dataset record: ${deleted.id}`;
  }

  const table = tablaNativaPermitida("kitsuden_delete_record", scopes, collection, "escritura");
  if (!table) return `Collection not found: ${collection}`;

  const result = (await bd()
    .delete(table)
    .where(eq(columnaId(table, "delete_record") as never, recordId))
    .returning({ id: columnaId(table, "delete_record") as never })) as Array<{ id?: string }>;
  await callbacks?.onMutate?.();
  return `Deleted native record: ${result[0]?.id}`;
}

async function kitsudenQueryDataset(
  args: ArgsDe<"kitsuden_query_dataset">,
  scopes: string[]
): Promise<string> {
  const { datasetId, limit = 50, offset = 0, status, format = "auto", untrusted_wrap } = args;
  if (!datasetId) return "Missing: datasetId";

  const [dataset] = await bd().select().from(dataSets).where(eq(dataSets.id, datasetId)).limit(1);
  if (!dataset) return `Dataset not found: ${datasetId}`;
  exigirDataset("kitsuden_query_dataset", scopes, dataset);

  // Las `rlsRules` de la política, como en REST (fase F), y sin borradores ajenos.
  const conditions = [dondeVisibleParaAgente(datasetId, dataset) ?? eq(dataEntries.dataSetId, datasetId), filasLegibles(scopes)];
  if (status) conditions.push(eq(dataEntries.status, status));

  const results = await bd()
    .select()
    .from(dataEntries)
    .where(and(...conditions))
    .limit(Math.min(Number(limit) || 50, 100))
    .offset(Number(offset) || 0);

  return salida(await conProcedencia(results, untrusted_wrap), format, "kitsuden_query_dataset");
}

async function kitsudenInsertRecord(
  args: ArgsDe<"kitsuden_insert_record">,
  callbacks: MCPExecutionCallbacks | undefined,
  scopes: string[]
): Promise<string> {
  const { datasetId, data, status = "draft" } = args;
  if (!datasetId || !data) return "Missing: datasetId, data";
  const ds = await datasetPorId(datasetId);
  if (!ds.slug) return `Dataset not found: ${datasetId}`;
  exigirDataset("kitsuden_insert_record", scopes, ds);

  // Fase F: el dueño es el FIRMANTE humano del agente; `created_by_id`, el agente.
  const dueno = duenoDeEntrada(data?.ownerId);
  const [newRecord] = await bd()
    .insert(dataEntries)
    .values({
      dataSetId: datasetId,
      title: data?.title || "Untitled",
      data: { ...(data || {}), ownerId: dueno },
      status,
      ownerId: dueno,
      createdById: actor().id || null,
    } as any)
    .returning();

  await callbacks?.onMutate?.();
  return `Record created: ${newRecord.id}`;
}

/** El slug de un dataset por id (`""` si no existe: entonces no hay scope que valga). */
/** El slug y la política de un dataset por id (`slug` vacío si no existe). */
async function datasetPorId(id: string): Promise<DatasetConPolitica> {
  const [ds] = await bd()
    .select({ slug: dataSets.slug, policyJson: dataSets.policyJson })
    .from(dataSets)
    .where(eq(dataSets.id, id))
    .limit(1);
  return { slug: ds?.slug ?? "", policyJson: ds?.policyJson ?? null };
}

async function kitsudenCreateDataset(
  args: ArgsDe<"kitsuden_create_dataset">,
  callbacks?: MCPExecutionCallbacks
): Promise<string> {
  const { name, slug, fields, rlsEnabled = true, description } = args;
  if (!name || !slug || !fields) return "Missing: name, slug, fields";

  const policyJson = rlsEnabled
    ? {
        enableRLS: true,
        readAccess: "authenticated" as const,
        writeAccess: "authenticated" as const,
        rlsRules: [{ field: "ownerId", operator: "eq", value: "__USER_ID__" }],
      }
    : undefined;

  const [newDataset] = await bd()
    .insert(dataSets)
    .values({
      name,
      slug,
      description: description || null,
      schema: { fields },
      policyJson,
    } as any)
    .returning();

  await callbacks?.onMutate?.();
  return `Dataset created: ${newDataset.id} (${newDataset.slug})`;
}

async function kitsudenInstallKon(
  args: ArgsDe<"kitsuden_install_kon">,
  callbacks?: MCPExecutionCallbacks
): Promise<string> {
  const { konId, source = "npm" } = args;
  if (!konId) return "Missing: konId";
  if (!["local", "npm", "marketplace"].includes(source))
    return "Invalid source. Must be: local, npm, marketplace";

  await bd()
    .insert(installedKons)
    .values({
      konId,
      name: konId,
      version: "latest",
      source,
      path: `kons/${konId}`,
      enabled: true,
    } as any)
    .returning();

  const [existingModule] = await bd().select().from(modules).where(eq(modules.key, konId)).limit(1);
  if (existingModule) {
    await bd().update(modules).set({ enabled: true }).where(eq(modules.key, konId));
  } else {
    await bd().insert(modules).values({ key: konId, name: konId, enabled: true } as any);
  }

  await callbacks?.onMutate?.();
  return `Kon ${konId} registered. Restart the API to activate.`;
}

async function kitsudenDefineAction(args: ArgsDe<"kitsuden_define_action">): Promise<string> {
  const { name, slug, type, trigger, triggerConfig, config } = args;
  if (!name || !slug || !type || !trigger) return "Missing: name, slug, type, trigger";
  if (!["code", "webhook_out", "webhook_in", "agent"].includes(type)) return "Invalid type";
  if (!["manual", "cron", "event", "http"].includes(trigger)) return "Invalid trigger";
  // Fase I (decisión 2): el código de una acción solo entra por promotion_propose.
  if (type === "code" || traeCodigo(config)) throw new CodigoFueraDePromocion();
  // F7: la URL de un webhook saliente, comprobada al guardarla (y otra vez al enviar).
  if (type === "webhook_out") {
    const { problemaDeUrlDeWebhook } = await import("@/lib/actions/handlers/webhook-out-handler");
    const problema = await problemaDeUrlDeWebhook((config as { url?: unknown } | undefined)?.url);
    if (problema) return problema;
  }
  // F6: un agente no define una acción que haga hablar a un agente con MÁS
  // permisos que él (su `config.agentId` correría con los scopes de ese).
  if (type === "agent" || (config as { agentId?: unknown } | undefined)?.agentId !== undefined) {
    const { motivoParaNoDefinir } = await import("@/lib/actions/handlers/agent-handler");
    const motivo = await motivoParaNoDefinir((config as { agentId?: unknown } | undefined)?.agentId, actor().scopes);
    if (motivo) throw new PermisoDeHerramienta(motivo);
  }

  const [newAction] = await bd()
    .insert(actions)
    .values({
      name,
      slug,
      type,
      trigger,
      triggerConfig: triggerConfig || {},
      config: config || {},
    } as any)
    .returning();

  return `Action created: ${newAction.id} (${newAction.slug})`;
}

async function kitsudenEnableAuth(args: ArgsDe<"kitsuden_enable_auth">): Promise<string> {
  const { methods, requireEmailVerification = true } = args;
  if (!methods || !Array.isArray(methods) || methods.length === 0)
    return "Missing or invalid: methods";

  const [settings] = await bd().select().from(siteSettings).limit(1);
  const branding = (settings?.branding || {}) as Record<string, unknown>;
  const updatedBranding = {
    ...branding,
    authConfig: { methods, requireEmailVerification },
  };

  if (settings) {
    await bd()
      .update(siteSettings)
      .set({ branding: updatedBranding as any })
      .where(eq(siteSettings.id, settings.id));
  } else {
    await bd().insert(siteSettings).values({ branding: updatedBranding } as any);
  }

  return `Auth configured: ${methods.join(", ")}. Restart API to apply OAuth providers.`;
}

async function kitsudenDispatchWorker(args: ArgsDe<"kitsuden_dispatch_worker">): Promise<string> {
  const { queueName, jobName, payload } = args;
  if (!queueName || !jobName || !payload) return "Missing: queueName, jobName, payload";

  if (queueName === "email") {
    const job = await emailQueue.add(jobName, payload);
    return `Job dispatched: ${job?.id || "unknown"}`;
  }

  return `Unknown queue: ${queueName}. Available: email`;
}

async function kitsudenGenerateFrontendHook(
  args: ArgsDe<"kitsuden_generate_frontend_hook">
): Promise<string> {
  const { collection, framework = "react", type = "all" } = args;
  if (!collection) return "Missing: collection";
  if (!["react", "vue", "svelte"].includes(framework)) {
    return "Invalid framework. Must be: react, vue, svelte";
  }

  // Resolve collection schema
  const [ds] = await bd().select().from(dataSets).where(eq(dataSets.slug, collection)).limit(1);
  let columns: any[] = [];
  let kind: "dataset" | "native" = "native";
  let primaryKey = "id";

  if (ds) {
    kind = "dataset";
    columns = ((ds.schema as any)?.fields || []).map((f: any) => ({
      name: f.fieldName || f.name,
      type: f.fieldType || f.type,
      required: !!f.required,
    }));
    columns.unshift(
      { name: "id", type: "uuid", required: true, isPrimaryKey: true },
      { name: "title", type: "text", required: true },
      { name: "createdAt", type: "timestamp", required: true },
      { name: "updatedAt", type: "timestamp", required: true }
    );
  } else {
    const table = tablaNativaPermitida("kitsuden_generate_frontend_hook", actor().scopes, collection, "esquema");
    if (!table) return `Collection not found: ${collection}`;

    const tableName = nombreDeTabla(table);
    const introspected = await introspectTable(tableName);
    columns =
      introspected?.columns.map((c) => ({
        name: c.name,
        type: c.type,
        required: !c.nullable,
        isPrimaryKey: c.isPrimaryKey,
        isRelation: c.isForeignKey,
      })) || [];
    primaryKey = introspected?.primaryKey[0] || "id";
  }

  const collectionInfo = {
    slug: collection,
    name: collection,
    kind,
    columns,
    primaryKey,
  };

  const genOptions = {
    collection: collectionInfo,
    framework: framework as "react" | "vue" | "svelte",
    type: type as "hook" | "component" | "form" | "types" | "all",
    baseUrl: "",
  };

  let files;
  switch (framework) {
    case "react":
      files = generateReact(genOptions);
      break;
    case "vue":
      files = generateVue(genOptions);
      break;
    case "svelte":
      files = generateSvelte(genOptions);
      break;
    default:
      return "Unsupported framework";
  }

  return files
    .map(
      (f) =>
        `// ════════════════════════════════════════\n// ${f.filename}\n// ════════════════════════════════════════\n\n${f.content}`
    )
    .join("\n\n");
}
