/**
 * KITSUDEN Brain — Layer 3: Schema document (BRAIN.md)
 * ============================================================================
 *
 * Genera BRAIN.md: el "esquema" del método Karpathy. Es un documento de
 * configuración que convierte a cualquier IA (local, API o CLI) en un
 * mantenedor DISCIPLINADO de la wiki, no en un chatbot genérico.
 *
 * La salida es 100% determinista (mismo proyecto → mismo BRAIN.md). Una IA
 * local (Claude Code, Cursor, Ollama con herramientas) puede leer este archivo
 * y ejecutar las 4 operaciones siguiendo reglas explícitas.
 */

export interface BrainSchemaOptions {
  projectName?: string;
  wikiPath?: string;
}

/** Devuelve el contenido de BRAIN.md como string determinista. */
export function generateBrainSchemaDoc(options: BrainSchemaOptions = {}): string {
  const project = options.projectName ?? "este proyecto";
  const wikiPath = options.wikiPath ?? ".kitsuden/brain";

  return `# BRAIN.md — Esquema del Segundo Cerebro (${project})

> Documento de configuración estilo Karpathy. Cualquier IA (local, API o CLI)
> que mantenga esta wiki DEBE seguir estas reglas. Generado automáticamente por
> KITSUDEN Brain — no lo edites a mano.

## Las 3 capas

- **Layer 1 — \`sources\` (tabla \`brain_sources\`)**: corpus crudo e INMUTABLE.
  La IA lee pero NUNCA edita. Cada fuente se identifica por el hash SHA-256 de
  su contenido. Recapturar el mismo contenido es idempotente.
- **Layer 2 — \`wiki\` (tabla \`brain_notes\` + \`${wikiPath}/\`)**: mantenida por IA.
  Resúmenes, páginas de concepto y cross-references. Tú lees; la IA escribe.
- **Layer 3 — este \`BRAIN.md\`**: el esquema. Estructura, convenciones y flujos.

## Reglas para páginas de la wiki

- Frontmatter obligatorio: \`title\`, \`summary\`, \`source_path\`, \`tags\`, \`updated_at\`.
- Cada página empieza con un resumen de 2-3 frases.
- Cross-linkea conceptos con sintaxis \`[[Título]]\`.
- Cita la fuente por su \`source_path\` (\`source:<uuid>\`). NUNCA inventes datos
  que no estén en la fuente cruda de Layer 1.
- Una sola fuente puede tocar 10-15 páginas: propaga los backlinks.

## Las 4 operaciones

| Operación | Determinista | Qué hace |
| :-------- | :----------- | :------- |
| \`capture\` | núcleo sí, prosa según autor | Ingesta una fuente → deriva su página → descubre conexiones. |
| \`sync\`    | sí | Reconcilia Layer 2 desde Layer 1 (crea páginas faltantes). |
| \`lint\`    | **100% sí** | Health-check: links rotos, huérfanas, stale, duplicadas, delgadas. |
| \`digest\`  | selección sí, prosa según autor | Recap de la actividad reciente. |

## Autores (cómo se escribe la prosa)

El análisis (resumen extractivo, keywords, headings, backlinks) es DETERMINISTA
y ya viene resuelto (\`extraction.ts\`). El autor solo redacta:

- \`instruction\` (default): cero IA, offline. Emite la página + un bloque
  \`<!-- AGENT-TASK -->\` con instrucciones para que una IA LOCAL la complete.
- \`api\`: usa un LLM vía API (Anthropic).
- \`cli\`: invoca un binario (\`claude -p\`, \`ollama run\`, ...) por stdin/stdout.

Selecciona con la variable de entorno \`KITSUDEN_BRAIN_AUTHOR=instruction|api|cli\`.

## Endpoints HTTP

\`\`\`
POST /api/brain/sources     # ingesta fuente cruda (Layer 1)
GET  /api/brain/sources     # lista fuentes
POST /api/brain/capture     # ingesta + deriva página (Layer 1 → Layer 2)
POST /api/brain/sync        # reconcilia Layer 2 desde Layer 1
GET  /api/brain/lint        # health-check determinista
POST /api/brain/digest      # recap de actividad reciente
GET  /api/brain/schema      # este BRAIN.md
\`\`\`

## Flujo para una IA local

1. Lee este BRAIN.md.
2. Ejecuta \`capture\` con la fuente nueva (o deja que el usuario la suba).
3. Si el autor fue \`instruction\`, busca páginas con bloque \`AGENT-TASK\` y
   complétalas siguiendo las reglas de arriba; elimina el bloque al terminar.
4. Corre \`lint\` y arregla lo que reporte (links rotos, huérfanas, contradicciones).
5. Semanalmente, ejecuta \`digest\` para el recap.
`;
}
