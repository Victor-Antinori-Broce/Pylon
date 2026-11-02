/**
 * Cobertura RLS — cada tabla con dueño está DECIDIDA, no olvidada
 * ============================================================================
 *
 * El agujero que este test cierra: RLS cubría 2 tablas de 147 y nadie lo
 * sabía, porque nada obligaba a decidir. Una tabla nueva con `user_id` nacía
 * sin política y sin que ningún check lo señalara.
 *
 * La regla: toda tabla con columna de propiedad (user_id, owner_id,
 * created_by, author_id) debe estar en UNO de dos sitios:
 *
 *   · rls-owned-tables.sql — propiedad PERSONAL → aislada por RLS
 *   · COLLABORATIVE (aquí) — autoría en herramienta de equipo → decidido que
 *     NO se aísla, con la razón escrita al lado
 *
 * Una tabla en ninguno de los dos rompe el test. Así "se me olvidó" deja de
 * ser un estado posible: o la aislaste, o firmaste por qué no.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "bun:test";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..", "..", "..", "..");

/**
 * Tablas cuya columna de propiedad es AUTORÍA en una herramienta colaborativa.
 * Aislarlas por creador rompería la visibilidad de equipo que es el punto de
 * esas apps; su control de acceso vive en las policies de aplicación, que
 * entienden de equipos y roles.
 */
const COLLABORATIVE = new Map<string, string>([
  // Tienda: `owner_id` es QUIÉN LO CREÓ, no de quién es la fila. El comprador
  // no es un usuario del sistema — se identifica por `customer_email` —, y el
  // equipo que lleva la tienda tiene que ver el catálogo y los pedidos enteros
  // o no puede servirlos. Aislar por creador dejaría a media plantilla sin ver
  // los pedidos que le toca fabricar.
  ["shop_products", "catálogo compartido por el equipo de la tienda"],
  ["shop_orders", "los pedidos los sirve el equipo, no solo quien los registró"],

  // CRM: los deals y contactos son del EQUIPO de ventas, no de quien los tecleó.
  ["crm_companies", "cartera compartida del equipo de ventas"],
  ["crm_contacts", "cartera compartida del equipo de ventas"],
  ["crm_pipelines", "configuración compartida"],
  ["crm_deals", "cartera compartida del equipo de ventas"],
  ["crm_activities", "actividad visible para el equipo"],
  ["crm_entity_configs", "configuración compartida"],
  // Agile: un issue lo ve todo el proyecto, no solo quien lo abrió. La
  // pertenencia al proyecto la aplica la RLS propia de kon-agile/0001.
  ["agile_project_members", "pertenencia a proyecto; RLS propia en kon-agile/0001"],
  ["agile_projects", "visibles para todo el equipo del proyecto"],
  ["agile_cycles", "planificación compartida"],
  ["agile_modules", "planificación compartida"],
  ["agile_issues", "un issue lo ve todo el proyecto"],
  ["agile_issue_links", "relaciones entre issues compartidos"],
  ["agile_intakes", "bandeja de entrada del equipo"],
  ["agile_comments", "conversación visible para el proyecto"],
  // Contabilidad: el rol contable lo da un admin; RLS propia en kon-conta/0001.
  ["conta_permisos", "permisos contables; RLS propia en kon-conta/0001"],
  // DMS: los documentos se comparten (por ACL, con RLS propia en
  // kon-dms/0005); el rastro personal SÍ está aislado.
  ["dms_documents", "documentos compartidos con viewers/editores"],
  ["dms_access_log", "auditoría: debe verla compliance, no solo el actor"],
  ["dms_document_comments", "conversación visible para quien ve el documento"],
  // Directorio: es un directorio — su naturaleza es ser visible.
  ["directory_employees", "directorio corporativo, visible por diseño"],
  // Ya cubierta por rls-policies.sql (la política original, con su matiz de
  // owner_id NULL + data->>'ownerId' que este generador no reproduce).
  ["data_entries", "aislada en rls-policies.sql con política propia"],
  // Academy: pertenencia a grupos y bitácora — las gestiona formación/RRHH.
  ["grupo_usuarios", "matrícula de grupos, la gestiona el formador"],
  ["actividad_log", "auditoría de formación: debe verla el formador"],
  // Blog: el author_id es autoría editorial; los posts son públicos o del
  // flujo editorial, nunca privados del autor.
  ["blog_posts", "contenido editorial, visible por flujo de publicación"],
  // OCR: los documentos entran por pipeline (contexto sistema) y los revisa
  // un equipo de operadores.
  ["ocr_documents", "cola de proceso revisada por operadores"],
  // Broadcast: un set de torneo lo opera un equipo de producción entero
  // (dirección, operador de marcador, casters) y su overlay lo lee OBS SIN
  // sesión. Aislarlo por el operador que lo tecleó rompería el directo; quién
  // puede MUTARLO lo decide la policy "broadcast".
  ["broadcast_matches", "producción de directo: la ve todo el equipo y el overlay sin sesión"],
  // Wiki: el historial es su razón de ser. Aislar revisiones por autor dejaría
  // a cada editor viendo solo las suyas — es decir, sin historial.
  ["wiki_revisions", "el historial de un wiki es público por definición"],
  // CardSim: una partida la comparten sus jugadores y sus espectadores. Lo que
  // cada uno VE lo recorta `viewFor` por asiento, que es la capa correcta:
  // aislar la fila entera dejaría al rival sin poder ver la mesa.
  ["cardsim_sessions", "partida compartida; el secreto lo aplica viewFor por asiento"],
  // Una clasificación es PÚBLICA: es literalmente lo que se publica. Aislarla
  // por usuario dejaría a cada uno viendo solo su propia fila — o sea, sin
  // ranking.
  ["cardsim_ratings", "tabla clasificatoria pública: aislarla la vaciaría"],
  // La cola de emparejamiento SOLO sirve si el emparejador puede leer las
  // filas de OTROS: aislada por usuario, nadie encontraría rival nunca. Las
  // filas no salen jamás al cliente — solo las lee la ruta que forma la mesa.
  ["cardsim_queue", "el emparejador necesita ver las filas ajenas; no se sirven al cliente"],
  // Un escaparate es PÚBLICO: es literalmente lo que se publica. Aislar las
  // entradas por autor dejaría a cada uno viendo solo sus mazos — o sea, sin
  // galería. Quién puede EDITARLAS lo decide la policy "deckshow".
  ["deckshow_entries", "galería pública: aislarla por autor la vaciaría"],
  // Un "me gusta" tiene que contarse y tiene que poder responder "¿le he dado
  // yo?". Aislado por usuario no se puede hacer ninguna de las dos cosas.
  ["deckshow_likes", "el contador es público y hay que saber si ya votaste"],
  // Un dataset de cartas es catálogo editorial: lo sube quien administra y lo
  // consulta cualquiera sin cuenta, que es la razón de ser de la herramienta.
  ["handlab_datasets", "catálogo de cartas público; owner_id dice quién lo administra"],
  // Un set de autobattler es catálogo del JUEGO: lo sube quien administra y lo
  // consulta cualquiera sin cuenta — calcular sinergias es para lo que se entra.
  ["autobattler_sets", "catálogo del set público; owner_id dice quién lo administra"],
  // Las comps son una tier list pública. Aislarlas por autor dejaría a cada uno
  // viendo solo las suyas; quién puede EDITARLAS lo decide la policy.
  ["autobattler_comps", "tier list pública de composiciones: aislarla la vaciaría"],
  // Un comentario se publica para que lo lean. Aislarlo por autor dejaría a
  // cada uno viendo solo los suyos, que es un hilo de una persona. Lo que se
  // OCULTA (borrado, en moderación) lo decide `status`, no RLS.
  ["comments", "hilo público: aislarlo por autor lo dejaría en un monólogo"],
  // Mismo caso que deckshow_likes: el contador es público y la interfaz tiene
  // que poder responder "¿he votado yo ya?" — aislado no se puede ninguna.
  ["comment_votes", "el contador es público y hay que saber si ya votaste"],
  // ── Las tres que destapó ensanchar OWNERSHIP a `*_user_id` (2026-08-09) ──
  // Esports: una ficha de jugador y una lista de inscritos son PÚBLICAS —es
  // literalmente lo que se publica de un torneo. Aislarlas por la cuenta que
  // se apuntó dejaría el bracket vacío para todo el mundo menos su dueño.
  // Quién puede MUTARLAS lo decide la policy del kon.
  ["esports_players", "ficha pública de competidor: el bracket la enseña a todos"],
  [
    "esports_tournament_participants",
    "la lista de inscritos de un torneo es pública por definición",
  ],
  // Members: `auth_user_id` es el puente OPCIONAL a una cuenta del CMS (lo
  // normal es null), no la propiedad de la fila. Un miembro es un contacto que
  // gestiona el equipo desde el admin; aislarlo por esa columna escondería del
  // panel a los miles que no tienen cuenta.
  ["members", "contacto gestionado por el equipo; auth_user_id es un puente opcional"],

  // Fase F (2026-10-24): `sponsor_user_id` es el humano que FIRMA lo que crea
  // un agente, no el dueño de la fila. Agentes y propuestas son configuración
  // y bandeja del equipo (solo las tocan la API y el panel de admin/editor).
  ["agent_identities", "identidad de agente gestionada por admin; sponsor_user_id es su firmante, no su dueño"],
  ["agent_proposals", "bandeja de aprobación del equipo; sponsor_user_id es el firmante del agente"],
  // Un equipo es PÚBLICO: sale en el bracket, en las clasificaciones y en el
  // overlay. `created_by_user_id` dice quién puede administrarlo, no quién
  // puede verlo — eso lo decide la policy del kon (solo el capitán invita).
  ["esports_teams", "un equipo se publica en el bracket; created_by es quien administra"],
  // Una invitación la tienen que ver los DOS: quien invita, para saber si
  // sigue pendiente, y quien la recibe. Aislarla por el emisor dejaría al
  // invitado sin poder abrir su propio enlace. Lo que la protege es el token,
  // que es aleatorio y de un solo uso.
  ["esports_team_invites", "la ven emisor y receptor; lo que la protege es el token"],
]);

/**
 * Columnas que denotan propiedad/autoría.
 *
 * El sufijo se ancla al final pero NO al principio: antes exigía el nombre
 * exacto (`"user_id"`), así que una columna `registered_by_user_id` —o
 * cualquier `*_user_id`, que es la forma normal de nombrarla cuando la tabla
 * ya tiene otra referencia a usuario— entraba sin que nadie tuviera que
 * decidir nada. Es justo el agujero que este test existe para cerrar.
 */
const OWNERSHIP = /"(\w*_)?(user_id|owner_id|created_by|author_id)"/;

/** Extrae (tabla → tiene columna de propiedad) de un archivo de schema. */
function ownedTablesIn(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const out: string[] = [];

  // Trocea por definición de tabla; el nombre SQL es el primer argumento.
  const chunks = source.split(/export const \w+ = pgTable\(/).slice(1);
  for (const chunk of chunks) {
    const name = chunk.match(/^\s*"(\w+)"/)?.[1];
    if (!name) continue;
    // Solo el cuerpo de ESTA tabla, no lo que venga después.
    const body = chunk.slice(
      0,
      chunk.indexOf("pgTable(") === -1 ? undefined : chunk.indexOf("pgTable(")
    );
    if (OWNERSHIP.test(body)) out.push(name);
  }
  return out;
}

function allSchemaFiles(): string[] {
  const files = [join(ROOT, "apps/api/src/db/schema-core.ts")];
  const konsDir = join(ROOT, "packages/kons");
  for (const kon of readdirSync(konsDir, { withFileTypes: true })) {
    if (!kon.isDirectory()) continue;
    const base = join(konsDir, kon.name);
    for (const candidate of readdirSync(base)) {
      if (candidate.endsWith(".schema.ts")) files.push(join(base, candidate));
    }
    // Algunos kons llevan el schema en src/
    try {
      for (const candidate of readdirSync(join(base, "src"))) {
        if (/^schema.*\.ts$/.test(candidate)) files.push(join(base, "src", candidate));
      }
    } catch {
      /* sin src/ */
    }
  }
  return files;
}

const RLS_SQL = readFileSync(join(ROOT, "apps/api/src/db/rls-owned-tables.sql"), "utf8");

describe("cobertura RLS", () => {
  const owned = allSchemaFiles().flatMap(ownedTablesIn);

  test("hay tablas con dueño que auditar (el detector funciona)", () => {
    // Si esto baja de 20, el parser se rompió y el resto del test estaría
    // aprobando en vacío — la clase de verde falso que ya nos mordió.
    // (Sin kons instalados —clon limpio del núcleo— solo quedan las del
    // núcleo, que son unas pocas: el umbral baja, pero no a cero.)
    const hayKons = readdirSync(join(ROOT, "packages/kons"), { withFileTypes: true }).some(
      (e) => e.isDirectory() && e.name.startsWith("kon-")
    );
    expect(owned.length).toBeGreaterThan(hayKons ? 20 : 3);
  });

  for (const table of new Set(owned)) {
    test(`${table}: aislada por RLS o excluida con razón`, () => {
      const isolated = RLS_SQL.includes(`('${table}',`);
      const excluded = COLLABORATIVE.has(table);

      expect(
        isolated || excluded,
        `La tabla "${table}" tiene columna de propiedad pero no está ni en ` +
          `rls-owned-tables.sql ni en la lista COLLABORATIVE de este test. ` +
          `Decide: ¿la fila es PERSONAL (añádela al SQL) o de EQUIPO ` +
          `(añádela a COLLABORATIVE con la razón)?`
      ).toBe(true);

      // Estar en los dos sitios también es un error: significa que dos
      // personas decidieron cosas contrarias sin verse.
      expect(
        !(isolated && excluded),
        `"${table}" está aislada en el SQL Y excluida como colaborativa. Elige una.`
      ).toBe(true);
    });
  }

  test("el SQL aplica FORCE, no solo ENABLE", () => {
    // Sin FORCE el dueño de la tabla (el rol de la app) queda exento y todas
    // estas políticas serían decorativas — exactamente el bug de agent-rls.
    expect(RLS_SQL).toContain("FORCE ROW LEVEL SECURITY");
  });

  test("agent-rls también fuerza RLS al dueño", () => {
    const source = readFileSync(join(ROOT, "apps/api/src/lib/agent-rls.ts"), "utf8");
    const enableBlock = source.match(/enableRLS[\s\S]{0,400}/)?.[0] ?? "";
    expect(enableBlock).toContain("FORCE ROW LEVEL SECURITY");
  });
});
