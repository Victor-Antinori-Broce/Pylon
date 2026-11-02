/**
 * Kitsuden — Índice de árbol para recuperación por razonamiento
 * ============================================================================
 *
 * Segunda capa de recuperación, complementaria a la búsqueda vectorial
 * (inspirada en PageIndex).
 *
 * EL PROBLEMA QUE RESUELVE: trocear un documento en fragmentos de N tokens
 * destruye su estructura. Una guía tiene secciones con significado —
 * "Rotación", "Gear por fase", "Estrategia del boss"— y un chunk a mitad de
 * una tabla no significa nada. La búsqueda vectorial devuelve trozos
 * "parecidos" y confía en que el modelo reconstruya el sentido.
 *
 * LA ALTERNATIVA: preservar el índice del documento como ÁRBOL y dejar que el
 * agente navegue — como un humano que abre el manual por el capítulo correcto.
 * Cada respuesta trae la ruta exacta de dónde salió: `Guía > Fase 3 > Gear`.
 *
 * CUÁNDO USAR CADA UNA (no se reemplazan):
 *   · Vector  → "encuéntrame algo parecido", corpus grande, respuesta rápida.
 *   · Árbol   → documento largo y estructurado, respuesta que debe citar
 *               fuente, o cuando la pregunta exige entender la jerarquía.
 *
 * COSTE: navegar razonando implica llamadas al LLM por consulta (segundos y
 * céntimos), frente a un embedding + ANN (milisegundos). Por eso la
 * construcción del árbol es DETERMINISTA y sin IA: solo la navegación puede
 * usar el modelo, y hasta eso tiene un modo heurístico sin coste.
 */

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface TreeNode {
  /** Ruta jerárquica estable: "0.2.1". Es la cita. */
  id: string;
  /** Texto del encabezado. */
  title: string;
  /** Nivel (1 = h1). */
  level: number;
  /** Contenido propio de la sección, sin el de los hijos. */
  content: string;
  /** Resumen determinista de la sección (primera frase útil). */
  summary: string;
  /** Línea de inicio en el documento original — trazabilidad exacta. */
  line: number;
  children: TreeNode[];
}

export interface ContentTree {
  /** Título del documento (primer h1, o el nombre dado). */
  title: string;
  /** Identificador de la fuente (slug, ruta, id de dataset…). */
  sourceId: string;
  root: TreeNode[];
  /** Nodos totales — para decidir si el árbol cabe en el contexto. */
  nodeCount: number;
}

/** Ruta legible de un nodo: "Guía > Fase 3 > Gear". */
export interface TreePath {
  id: string;
  titles: string[];
  line: number;
}

// ── Construcción (determinista, sin IA) ──────────────────────────────────────

const HEADING = /^(#{1,6})\s+(.+?)\s*$/;

/** Primera frase con sustancia — el resumen sin llamar a ningún modelo. */
function summarize(content: string, maxLength = 180): string {
  const clean = content
    .replace(/```[\s\S]*?```/g, " ") // fuera bloques de código
    .replace(/[|>*_`#-]/g, " ") // fuera marcas de markdown y tablas
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) return "";
  const sentence = clean.split(/(?<=[.!?])\s/)[0] ?? clean;
  return sentence.length > maxLength ? `${sentence.slice(0, maxLength - 1)}…` : sentence;
}

/**
 * Construye el árbol a partir de los encabezados markdown.
 *
 * Es determinista y barato: mismo documento → mismo árbol, sin IA. Eso importa
 * porque el índice se reconstruye cada vez que cambia el contenido, y pagar un
 * LLM por eso sería prohibitivo.
 */
export function buildContentTree(
  markdown: string,
  options: { sourceId: string; title?: string } = { sourceId: "doc" }
): ContentTree {
  const lines = markdown.split("\n");

  interface Raw {
    level: number;
    title: string;
    line: number;
    body: string[];
  }

  const sections: Raw[] = [];
  let current: Raw | null = null;
  const preamble: string[] = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Los ``` alternan bloque de código: un "# " dentro NO es un encabezado.
    if (/^\s*```/.test(line)) inCodeBlock = !inCodeBlock;

    const match = inCodeBlock ? null : HEADING.exec(line);
    if (match) {
      current = { level: match[1].length, title: match[2], line: i + 1, body: [] };
      sections.push(current);
    } else if (current) {
      current.body.push(line);
    } else {
      preamble.push(line);
    }
  }

  // Anidado por nivel con una pila.
  const root: TreeNode[] = [];
  const stack: TreeNode[] = [];
  let counter = 0;

  // El preámbulo (texto antes del primer encabezado) no se pierde: se cuelga
  // como nodo introductorio, o el documento entero si no hay encabezados.
  const preambleText = preamble.join("\n").trim();
  if (preambleText) {
    const node: TreeNode = {
      id: String(counter++),
      title: options.title ?? "Introducción",
      level: 1,
      content: preambleText,
      summary: summarize(preambleText),
      line: 1,
      children: [],
    };
    root.push(node);
  }

  for (const section of sections) {
    const content = section.body.join("\n").trim();
    const node: TreeNode = {
      id: "",
      title: section.title,
      level: section.level,
      content,
      summary: summarize(content),
      line: section.line,
      children: [],
    };

    // Desapilar hasta encontrar el padre (nivel menor).
    while (stack.length > 0 && stack[stack.length - 1].level >= section.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      node.id = String(counter++);
      root.push(node);
    } else {
      const parent = stack[stack.length - 1];
      node.id = `${parent.id}.${parent.children.length}`;
      parent.children.push(node);
    }
    stack.push(node);
  }

  const count = (nodes: TreeNode[]): number =>
    nodes.reduce((n, node) => n + 1 + count(node.children), 0);

  return {
    title: options.title ?? sections.find((s) => s.level === 1)?.title ?? options.sourceId,
    sourceId: options.sourceId,
    root,
    nodeCount: count(root),
  };
}

// ── Navegación ───────────────────────────────────────────────────────────────

/** Busca un nodo por su id de ruta. */
export function findNode(tree: ContentTree, id: string): TreeNode | null {
  const walk = (nodes: TreeNode[]): TreeNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      const found = walk(node.children);
      if (found) return found;
    }
    return null;
  };
  return walk(tree.root);
}

/** Ruta legible hasta un nodo — la cita que acompaña a la respuesta. */
export function pathOf(tree: ContentTree, id: string): TreePath | null {
  const walk = (nodes: TreeNode[], titles: string[]): TreePath | null => {
    for (const node of nodes) {
      const trail = [...titles, node.title];
      if (node.id === id) return { id, titles: trail, line: node.line };
      const found = walk(node.children, trail);
      if (found) return found;
    }
    return null;
  };
  return walk(tree.root, []);
}

/**
 * Índice compacto del árbol: solo títulos y resúmenes, sin cuerpo.
 *
 * Esto es lo que se le da al agente para que ELIJA la rama. Meter el documento
 * entero en el contexto sería justo lo que este enfoque evita: el índice de
 * una guía de 20.000 palabras cabe en unos cientos de tokens.
 */
export function renderIndex(tree: ContentTree, maxDepth = 3): string {
  const lines: string[] = [`# ${tree.title}`, ""];

  const walk = (nodes: TreeNode[], depth: number) => {
    if (depth > maxDepth) return;
    for (const node of nodes) {
      const indent = "  ".repeat(depth);
      const summary = node.summary ? ` — ${node.summary}` : "";
      lines.push(`${indent}[${node.id}] ${node.title}${summary}`);
      walk(node.children, depth + 1);
    }
  };

  walk(tree.root, 0);
  return lines.join("\n");
}

/** Contenido de un nodo con el de sus hijos — lo que se lee tras elegir rama. */
export function readNode(tree: ContentTree, id: string, includeChildren = true): string {
  const node = findNode(tree, id);
  if (!node) return "";

  const parts: string[] = [];
  const walk = (n: TreeNode, depth: number) => {
    parts.push(`${"#".repeat(Math.min(n.level + depth, 6))} ${n.title}`);
    if (n.content) parts.push(n.content);
    if (includeChildren) for (const child of n.children) walk(child, depth);
  };

  walk(node, 0);
  return parts.join("\n\n").trim();
}

// ── Selección de rama ────────────────────────────────────────────────────────

export interface BranchSelector {
  /**
   * Dado el índice y la pregunta, devuelve los ids de los nodos relevantes.
   * Lo implementa el host con un LLM; el modo heurístico es el fallback.
   */
  select(index: string, query: string): Promise<string[]>;
}

export interface RetrieveOptions {
  /** Sin selector se usa el emparejamiento heurístico (sin coste, sin IA). */
  selector?: BranchSelector;
  /** Máximo de secciones a devolver. */
  maxSections?: number;
  /** Incluir el contenido de los hijos de cada sección elegida. */
  includeChildren?: boolean;
}

export interface RetrievedSection {
  /** Ruta citable: "Guía > Fase 3 > Gear". */
  path: string;
  id: string;
  line: number;
  content: string;
  /** "reasoned" (el agente eligió) o "heuristic" (coincidencia de términos). */
  via: "reasoned" | "heuristic";
  score?: number;
}

/**
 * Selección heurística: puntúa por coincidencia de términos en título y
 * resumen. No es tan buena como el razonamiento del LLM, pero es determinista,
 * instantánea y gratis — y sirve de fallback cuando no hay modelo disponible.
 */
function heuristicSelect(
  tree: ContentTree,
  query: string,
  limit: number
): { id: string; score: number }[] {
  const terms = query
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 2);
  if (terms.length === 0) return [];

  const scored: { id: string; score: number }[] = [];

  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      const title = node.title.toLowerCase();
      const body = `${node.summary} ${node.content}`.toLowerCase();

      let score = 0;
      for (const term of terms) {
        // El título pesa mucho más: es lo que declara de qué va la sección.
        if (title.includes(term)) score += 3;
        if (body.includes(term)) score += 1;
      }
      if (score > 0) scored.push({ id: node.id, score: score / terms.length });
      walk(node.children);
    }
  };

  walk(tree.root);
  return scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, limit);
}

/**
 * Recupera las secciones relevantes navegando el árbol.
 *
 * Con `selector` el agente razona sobre el índice y elige; sin él se usa la
 * heurística. En ambos casos el resultado trae la RUTA de origen, así que la
 * respuesta puede citar exactamente de dónde salió — a diferencia de una
 * coincidencia vectorial, que es opaca.
 */
export async function retrieveFromTree(
  tree: ContentTree,
  query: string,
  options: RetrieveOptions = {}
): Promise<RetrievedSection[]> {
  const maxSections = options.maxSections ?? 3;
  const includeChildren = options.includeChildren ?? true;

  let ids: string[] = [];
  let via: "reasoned" | "heuristic" = "heuristic";
  let scores: Map<string, number> | undefined;

  if (options.selector) {
    try {
      ids = (await options.selector.select(renderIndex(tree), query)).slice(0, maxSections);
      via = "reasoned";
    } catch {
      ids = []; // el selector falló → heurística
    }
  }

  if (ids.length === 0) {
    const picked = heuristicSelect(tree, query, maxSections);
    ids = picked.map((p) => p.id);
    scores = new Map(picked.map((p) => [p.id, p.score]));
    via = "heuristic";
  }

  const sections: RetrievedSection[] = [];
  for (const id of ids) {
    const path = pathOf(tree, id);
    if (!path) continue; // el selector puede inventar ids: se descartan
    sections.push({
      id,
      path: path.titles.join(" > "),
      line: path.line,
      content: readNode(tree, id, includeChildren),
      via,
      score: scores?.get(id),
    });
  }

  return sections;
}
