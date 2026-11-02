/**
 * Guía para agentes — lo que se sirve en `GET /llms.txt`
 * ============================================================================
 *
 * ── LO QUE HABIA ───────────────────────────────────────────────────────────
 *
 * `apps/api/llms.txt` eran 27 líneas autogeneradas que decían
 * «Total documented entities: 0» y «Knowledge graph: 0 nodes». Ni una mención
 * a torneos, tier lists o catálogos. Para un producto pensado para quien
 * construye con agentes, ese fichero ES la documentación: es lo primero que
 * un agente lee, y le decía que no había nada.
 *
 * ── LO QUE HAY AHORA ───────────────────────────────────────────────────────
 *
 * Tres partes:
 *
 *   1. Las reglas que un agente suele romper, con el error que va a ver si
 *      las rompe. Son las que costaron fallos reales en este proyecto.
 *   2. Recetas para lo que se construye de verdad en el nicho: una tier list
 *      de personajes y un torneo suizo con check-in.
 *   3. Las rutas de los kons, generadas del router montado. No se pueden
 *      quedar atrás respecto de la API porque salen de ella.
 *
 * Las dos primeras son estáticas a propósito: dicen POR QUÉ, y eso no se puede
 * deducir de un esquema.
 */

import type { RutaDeKon } from "./rutas-de-kons";

/**
 * Herramientas de dominio del servidor MCP (`packages/mcp-server`).
 *
 * Se repiten aquí para que la guía no dependa de ese paquete. Una prueba
 * comprueba que coinciden con las que el servidor registra de verdad.
 */
export const HERRAMIENTAS_MCP_DE_DOMINIO: readonly { nombre: string; para: string }[] = [
  { nombre: "kitsuden_guide", para: "esta guía" },
  { nombre: "kitsuden_describe_api", para: "las rutas de un kon, compactas" },
  { nombre: "catalog_create", para: "crear un catálogo (personajes, objetos, cartas…)" },
  { nombre: "catalog_add_entries", para: "añadir entradas al catálogo en bloque" },
  { nombre: "tierlist_create", para: "crear una tier list, rellena desde un catálogo" },
  { nombre: "tierlist_sync", para: "traer lo nuevo del catálogo sin mover lo colocado" },
  { nombre: "tierlist_place", para: "colocar un elemento en una fila" },
  { nombre: "tierlist_get", para: "la tier list agrupada por filas" },
  { nombre: "tierlist_list", para: "las tier lists que hay, con su slug" },
  { nombre: "tournament_list", para: "buscar torneos por título para saber su id" },
  { nombre: "tournament_get", para: "un torneo con sus participantes y su check-in" },
  { nombre: "tournament_create", para: "crear un torneo con su formato" },
  { nombre: "tournament_add_players", para: "crear jugadores por alias e inscribirlos" },
  { nombre: "tournament_checkin", para: "abrir la ventana, marcar, deshacer, ver el estado" },
  { nombre: "tournament_start", para: "generar el cuadro (en suizo, la ronda 1)" },
  { nombre: "tournament_sets", para: "los sets abiertos, con nombres y los ids para reportar" },
  { nombre: "tournament_report_set", para: "reportar el ganador de un set" },
  { nombre: "tournament_next_round", para: "emparejar la siguiente ronda de un suizo" },
  { nombre: "tournament_standings", para: "la clasificación según el formato" },
  { nombre: "broadcast_sections", para: "qué partes de Broadcast están encendidas" },
  { nombre: "broadcast_create_match", para: "un enfrentamiento al mejor de N para el overlay" },
];

const REGLAS = `## Reglas que un agente suele romper

Cada una costó un fallo real. Si la rompes, el error lo dice.

1. **Los campos que no existen se rechazan, no se ignoran.** Un cuerpo con una
   clave desconocida responde **422** con \`error.details.unknownKeys\`: la clave,
   \`didYouMean\` con el nombre correcto y \`validKeys\`. No reintentes con el
   mismo cuerpo: corrige el nombre que te sugiere.
2. **\`id\`, \`createdAt\` y \`updatedAt\` se ignoran** en los cuerpos —los pone el
   servidor— y se avisa en la cabecera \`X-Kitsuden-Ignored-Fields\`.
3. **Un 404 en \`/api\` trae \`didYouMean\`** con las rutas parecidas, y un **405**
   trae los métodos válidos en \`allow\`. Léelos antes de probar otra ruta.
4. **Un 409 con \`section\` significa que una parte del kon está apagada.** El
   campo \`enableWith\` dice qué ajuste encenderla. No es una avería.
5. **\`winnerId\` es un id de PARTICIPANTE, no de jugador.** Un jugador se inscribe
   en un torneo y eso crea un participante con otro id. Reporta un set con
   \`matchId\` (la fila del set) y el id de participante.
6. **Un Bo3 se gana al llegar a 2.** En Broadcast manda \`bestOf\` (1, 3, 5, 7 o 9)
   y el servidor calcula \`firstTo\`. No los confundas: con un 3 donde iba un 2
   el enfrentamiento cierra una partida antes.
7. **En suizo, reporta TODOS los sets de la ronda antes de emparejar la
   siguiente.** Emparejar con la ronda a medias da 409. Tras reportar el último,
   la respuesta trae \`next\` con la ruta de la siguiente ronda.
8. **Un resultado de suizo no se corrige con la ronda siguiente ya emparejada**:
   cambiaría cruces publicados (409).
9. **\`PUT /api/esports/matches/:id\` no sirve para suizo ni round robin**: esa ruta
   daba el torneo por terminado. Responde 409 con la ruta buena en \`use\`.
10. **Check-in: \`drop\` antes de generar el cuadro, \`dq\` después.** Resolver
    ausentes va en dos pasos: sin \`confirm: true\` solo devuelve el plan.
11. **Una tier list no es dueña de sus fichas.** Salen de un catálogo (dataset) y
    sincronizar trae lo nuevo sin mover lo ya colocado. La imagen se toma del
    campo que el catálogo declara de tipo \`image\` o \`url\`.
12. **Un agente opera con scopes.** Un token \`kitsuden_agent_*\` con
    \`esports:*\` puede llevar un torneo; sin ese scope, las acciones de
    organización dan 403 aunque el token sea válido.`;

const RECETAS = `## Recetas

### Una tier list de personajes (con MCP)

1. \`catalog_create\` con \`name: "Personajes"\` y \`withImage: true\` → \`datasetId\`.
2. \`catalog_add_entries\` con \`datasetId\` y \`entries: [{ "title": "Aria", "image": "https://…" }]\`.
3. \`tierlist_create\` con \`slug\`, \`title\` y \`catalogDatasetId\` → se rellena sola.
4. \`tierlist_place\` con \`slug\`, \`itemId\` y \`tierId\` (\`null\` la devuelve al pool).
5. Si el catálogo cambia, \`tierlist_sync\`: lo colocado no se mueve.

### Un torneo suizo con check-in (con MCP)

1. \`tournament_create\` con \`title\`, \`bracketFormat: "swiss"\` y \`status: "Open"\`.
2. \`tournament_add_players\` con \`tournamentId\` y \`aliases\`.
3. \`tournament_checkin\` con \`action: "open"\`, luego \`action: "mark"\` por cada
   participante presente, y \`action: "status"\` para ver quién falta.
4. \`tournament_checkin\` con \`action: "drop"\` y \`confirm: true\` para quitar ausentes
   **antes** de empezar.
5. \`tournament_start\` → empareja la ronda 1.
6. \`tournament_sets\` → para cada set, \`tournament_report_set\` con \`matchId\` y
   el \`winnerId\` de participante que trae el propio set.
7. \`tournament_next_round\` cuando no queden sets abiertos. Repite 6 y 7.
8. \`tournament_standings\` → clasificación con OMW, que es el desempate del suizo.

### Sin MCP

Todo lo anterior son rutas HTTP normales (abajo). Para un frontend,
\`kitsuden generate-sdk\` genera un cliente tipado desde el contrato, y
\`@kitsuden/sdk-react\` trae \`useTierList\`, \`useBracket\` y \`useCheckIn\`.`;

function cabecera(baseUrl: string, contratoPublicado: boolean): string {
  return `# Kitsuden — guía para agentes

> Backend para construir productos gamer con IA: catálogos de personajes y
> objetos, tier lists, torneos (eliminación, suizo, round robin) y emisión.
> Esta guía la sirve la API en marcha y sus rutas salen del código montado.

## Empezar

- **API:** \`${baseUrl}\`
${
    contratoPublicado
      ? `- **Contrato completo:** \`GET ${baseUrl}/docs/openapi.json\``
      : "- **Contrato completo:** esta instalación no lo publica (`ENABLE_SWAGGER=false`). Las rutas están abajo y, por MCP, `tools/list` da cada herramienta con su esquema."
  }
- **Credencial:** \`Authorization: Bearer kitsuden_agent_…\`, un token de agente
  creado en el panel de administración (Agentes) con los scopes que necesite:
  \`tierlist:*\`, \`esports:*\`, \`broadcast:*\`.
- **MCP:** \`kitsuden mcp\` arranca el servidor con las herramientas de abajo.
- **SDK:** \`kitsuden generate-sdk\` escribe un cliente tipado.`;
}

function herramientas(): string {
  return [
    "## Herramientas MCP de dominio",
    "",
    ...HERRAMIENTAS_MCP_DE_DOMINIO.map((h) => `- \`${h.nombre}\` — ${h.para}`),
  ].join("\n");
}

function camposDelCuerpo(ruta: RutaDeKon): string {
  const cuerpo = ruta.validation.find((v) => v.target === "json" || v.target === "form");
  type Def = { type?: string; in?: unknown; shape?: Record<string, unknown> };
  let def = (cuerpo?.schema as { _zod?: { def: Def } } | undefined)?._zod?.def;
  // `.transform()`/`.pipe()` envuelven el objeto en un `pipe`: se mira su entrada
  for (let i = 0; i < 5 && def?.type === "pipe"; i++) {
    def = (def.in as { _zod?: { def: Def } } | undefined)?._zod?.def;
  }
  if (def?.type !== "object" || !def.shape) return "";
  const claves = Object.keys(def.shape);
  return claves.length ? ` · cuerpo: ${claves.join(", ")}` : "";
}

function rutas(lista: RutaDeKon[] | undefined): string {
  if (lista === undefined) {
    return "## Rutas de los kons\n\nSe generan al servir `GET /llms.txt` desde la API en marcha: salen del router montado, \nasí que dependen de qué kons tenga encendidos cada instalación.";
  }
  if (lista.length === 0) {
    return "## Rutas de los kons\n\n(Ningún kon montado en esta instalación.)";
  }

  const porKon = new Map<string, RutaDeKon[]>();
  for (const r of lista) {
    if (r.path.includes("*")) continue;
    const grupo = porKon.get(r.konId) ?? [];
    grupo.push(r);
    porKon.set(r.konId, grupo);
  }

  const bloques = [...porKon.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([konId, grupo]) => {
      const lineas = grupo.map((r) => {
        const marcas = [
          r.auth === "required" ? "credencial" : "",
          r.section ? `sección «${r.section}»` : "",
        ]
          .filter(Boolean)
          .join(", ");
        const resumen = r.summary ? ` — ${r.summary}` : "";
        return `- \`${r.method} ${r.path}\`${resumen}${marcas ? ` [${marcas}]` : ""}${camposDelCuerpo(r)}`;
      });
      return `### ${konId}\n\n${lineas.join("\n")}`;
    });

  return `## Rutas de los kons\n\nGeneradas del router montado.\n\n${bloques.join("\n\n")}`;
}

export function generarGuiaParaAgentes(opciones: {
  baseUrl: string;
  rutas?: RutaDeKon[];
  /** ¿Se sirve `/api/docs/openapi.json`? (`ENABLE_SWAGGER`). Por defecto, sí. */
  contratoPublicado?: boolean;
}): string {
  return [
    cabecera(opciones.baseUrl, opciones.contratoPublicado ?? true),
    REGLAS,
    RECETAS,
    herramientas(),
    rutas(opciones.rutas),
    "",
  ].join("\n\n");
}
