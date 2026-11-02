/**
 * Brain — índice de árbol (recuperación por razonamiento)
 * ============================================================================
 * Segunda capa junto a la búsqueda vectorial. La construcción es determinista
 * (sin IA), así que se prueba entera en memoria; el selector se inyecta como
 * fake para probar la vía razonada sin llamar a un modelo.
 */

import {
  buildContentTree,
  retrieveFromTree,
  renderTreeIndex,
  readTreeNode,
  findTreeNode,
  treePathOf,
  type BranchSelector,
} from "@kitsuden/engine";
import { describe, expect, test } from "bun:test";

/** Una guía con la estructura típica: secciones anidadas y una tabla. */
const GUIDE = `# Guía de Mago de Hielo

Build orientada a PvE de alto nivel.

## Leveleo

Sube por zonas de élite hasta nivel 40.

### Rotación de leveleo

Escarcha, Lanza, Nova cuando haya 3 o más enemigos.

## Gear por fase

### Fase 1

Set de iniciación. Prioriza intelecto sobre crítico.

### Fase 3

El set de Escarcha Eterna es obligatorio aquí.

| Pieza | Fuente |
|-------|--------|
| Casco  | Boss final |

## Estrategia del boss

Muévete fuera del charco en la fase de transición.
`;

describe("construcción del árbol (determinista, sin IA)", () => {
  test("anida por nivel de encabezado", () => {
    const tree = buildContentTree(GUIDE, { sourceId: "guia-mago" });

    expect(tree.title).toBe("Guía de Mago de Hielo");
    // Preámbulo + h1 → luego los h2 cuelgan del h1
    const h1 = tree.root.find((n) => n.title === "Guía de Mago de Hielo");
    expect(h1).toBeDefined();
    expect(h1!.children.map((c) => c.title)).toEqual([
      "Leveleo",
      "Gear por fase",
      "Estrategia del boss",
    ]);
  });

  test("anida el tercer nivel bajo su padre", () => {
    const tree = buildContentTree(GUIDE, { sourceId: "g" });
    const gear = findTreeNode(tree, "0.1");
    expect(gear!.title).toBe("Gear por fase");
    expect(gear!.children.map((c) => c.title)).toEqual(["Fase 1", "Fase 3"]);
  });

  test("resume cada sección sin llamar a ningún modelo", () => {
    const tree = buildContentTree(GUIDE, { sourceId: "g" });
    const fase3 = findTreeNode(tree, "0.1.1");
    expect(fase3!.summary).toContain("Escarcha Eterna");
    // El resumen limpia las marcas de tabla.
    expect(fase3!.summary).not.toContain("|");
  });

  test("guarda la línea de origen (trazabilidad)", () => {
    const tree = buildContentTree(GUIDE, { sourceId: "g" });
    expect(findTreeNode(tree, "0.1.1")!.line).toBeGreaterThan(0);
  });

  test("es DETERMINISTA: misma entrada, mismo árbol", () => {
    const a = buildContentTree(GUIDE, { sourceId: "g" });
    const b = buildContentTree(GUIDE, { sourceId: "g" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("NO confunde un '#' dentro de un bloque de código con un encabezado", () => {
    const doc = "# Real\n\n```bash\n# esto es un comentario\n```\n\n## Otra\n";
    const tree = buildContentTree(doc, { sourceId: "d" });
    const titles: string[] = [];
    const walk = (nodes: any[]) => nodes.forEach((n) => (titles.push(n.title), walk(n.children)));
    walk(tree.root);
    expect(titles).toEqual(["Real", "Otra"]);
  });

  test("documento sin encabezados no se pierde", () => {
    const tree = buildContentTree("Solo texto plano, sin títulos.", { sourceId: "d" });
    expect(tree.nodeCount).toBe(1);
    expect(tree.root[0].content).toContain("Solo texto plano");
  });
});

describe("índice compacto (lo que ve el agente)", () => {
  test("incluye ids y resúmenes, NO el cuerpo completo", () => {
    const tree = buildContentTree(GUIDE, { sourceId: "g" });
    const index = renderTreeIndex(tree);

    expect(index).toContain("[0.1.1] Fase 3");
    expect(index).toContain("Escarcha Eterna"); // el resumen sí
    expect(index).not.toContain("| Casco"); // la tabla no
    // El índice es MUCHO más corto que el documento: por eso cabe en contexto.
    expect(index.length).toBeLessThan(GUIDE.length);
  });

  test("respeta la profundidad máxima", () => {
    const tree = buildContentTree(GUIDE, { sourceId: "g" });
    expect(renderTreeIndex(tree, 1)).not.toContain("Fase 3");
  });
});

describe("lectura y citas", () => {
  test("readNode devuelve la sección con sus hijos", () => {
    const tree = buildContentTree(GUIDE, { sourceId: "g" });
    const gear = readTreeNode(tree, "0.1");
    expect(gear).toContain("Fase 1");
    expect(gear).toContain("Escarcha Eterna");
    expect(gear).not.toContain("charco"); // no traga secciones hermanas
  });

  test("pathOf da la ruta citable", () => {
    const tree = buildContentTree(GUIDE, { sourceId: "g" });
    const path = treePathOf(tree, "0.1.1");
    expect(path!.titles).toEqual(["Guía de Mago de Hielo", "Gear por fase", "Fase 3"]);
  });
});

describe("recuperación", () => {
  test("heurística: acierta la sección por términos del título", async () => {
    const tree = buildContentTree(GUIDE, { sourceId: "g" });
    const results = await retrieveFromTree(tree, "gear de la fase 3", { maxSections: 2 });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].via).toBe("heuristic");
    // Cada resultado trae su CITA — a diferencia de un match vectorial opaco.
    expect(results[0].path).toContain("Gear por fase");
    expect(results[0].line).toBeGreaterThan(0);
  });

  test("razonada: el selector elige la rama y se marca como 'reasoned'", async () => {
    const tree = buildContentTree(GUIDE, { sourceId: "g" });

    // Fake del agente: en real, un LLM lee el índice y devuelve los ids.
    const selector: BranchSelector = {
      async select(index, query) {
        expect(index).toContain("[0.2] Estrategia del boss"); // recibió el índice
        expect(query).toContain("boss");
        return ["0.2"];
      },
    };

    const results = await retrieveFromTree(tree, "cómo mato al boss", { selector });
    expect(results[0].via).toBe("reasoned");
    expect(results[0].content).toContain("charco");
    expect(results[0].path).toContain("Estrategia del boss");
  });

  test("si el selector FALLA, cae a la heurística (no rompe)", async () => {
    const tree = buildContentTree(GUIDE, { sourceId: "g" });
    const roto: BranchSelector = {
      async select() {
        throw new Error("LLM caído");
      },
    };

    const results = await retrieveFromTree(tree, "rotación de leveleo", { selector: roto });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].via).toBe("heuristic");
  });

  test("descarta los ids inventados por el selector (alucinación)", async () => {
    const tree = buildContentTree(GUIDE, { sourceId: "g" });
    const inventa: BranchSelector = {
      async select() {
        return ["99.99", "0.2"];
      },
    };

    const results = await retrieveFromTree(tree, "boss", { selector: inventa });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("0.2");
  });

  test("consulta sin coincidencias devuelve vacío, no ruido", async () => {
    const tree = buildContentTree(GUIDE, { sourceId: "g" });
    expect(await retrieveFromTree(tree, "zzz qqq")).toEqual([]);
  });
});
