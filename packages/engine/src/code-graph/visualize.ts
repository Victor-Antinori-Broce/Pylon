/**
 * Kitsuden — Code Graph: Visualización interactiva (determinista, sin CDN)
 * ============================================================================
 *
 * Genera un HTML autocontenido con un grafo de fuerza dirigida del código o de
 * la arquitectura. Sin dependencias externas: la simulación física y el render
 * SVG van embebidos, así que funciona offline y sin build step.
 *
 * El layout es DETERMINISTA: las posiciones iniciales derivan de un hash del id
 * del nodo (no de Math.random), así el mismo grafo produce siempre la misma
 * imagen — igual que el resto del code-graph.
 */

import type { CodeGraph } from "./indexer";
import { communities } from "./queries";

export interface VisualizeOptions {
  /** Título mostrado en la cabecera. */
  title?: string;
  /**
   * Máximo de nodos a renderizar (default 150). Se priorizan los de mayor
   * grado; el resto se omite para que el grafo siga siendo legible.
   */
  maxNodes?: number;
  /** Incluir símbolos además de archivos (default false: solo archivos). */
  includeSymbols?: boolean;
}

interface VizNode {
  id: string;
  label: string;
  group: string;
  degree: number;
  kind: "file" | "symbol" | "package";
}

interface VizEdge {
  source: string;
  target: string;
  relation: string;
}

/** Agrupa por subsistema (packages/core, apps/api, kons/<x>…). */
function groupOf(path: string): string {
  if (path.startsWith("pkg:")) return "external";
  const parts = path.split("/");
  if (parts[0] === "packages" && parts[1] === "kons" && parts.length > 2) {
    return parts.slice(0, 3).join("/");
  }
  return parts.slice(0, 2).join("/");
}

function shortLabel(id: string): string {
  if (id.startsWith("pkg:")) return id.slice(4);
  const hashIdx = id.indexOf("#");
  if (hashIdx !== -1) return id.slice(hashIdx + 1);
  const parts = id.split("/");
  return parts[parts.length - 1] ?? id;
}

/** Extrae el subgrafo a renderizar: los N nodos de mayor grado y sus aristas. */
function buildViz(graph: CodeGraph, options: VisualizeOptions) {
  const maxNodes = options.maxNodes ?? 150;
  const includeSymbols = options.includeSymbols ?? false;

  const degree = new Map<string, number>();
  const bump = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1);

  const relevant = graph.edges.filter((e) => {
    if (includeSymbols) return true;
    // Solo aristas archivo→archivo/paquete.
    return e.relation === "imports";
  });

  for (const e of relevant) {
    bump(e.from);
    bump(e.to);
  }

  const ranked = Array.from(degree.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxNodes);
  const keep = new Set(ranked.map(([id]) => id));

  const nodes: VizNode[] = ranked.map(([id, deg]) => ({
    id,
    label: shortLabel(id),
    group: groupOf(id),
    degree: deg,
    kind: id.startsWith("pkg:") ? "package" : id.includes("#") ? "symbol" : "file",
  }));

  const seen = new Set<string>();
  const edges: VizEdge[] = [];
  for (const e of relevant) {
    if (!keep.has(e.from) || !keep.has(e.to)) continue;
    const key = `${e.from}→${e.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ source: e.from, target: e.to, relation: e.relation });
  }

  return { nodes, edges };
}

/**
 * Renderiza el grafo como una página HTML autocontenida.
 * `graph` es el CodeGraph ya indexado (indexRepo / indexFiles).
 */
export function renderGraphHtml(graph: CodeGraph, options: VisualizeOptions = {}): string {
  const { nodes, edges } = buildViz(graph, options);
  const title = options.title ?? "Kitsuden Code Graph";
  const clusters = communities(graph).slice(0, 12);

  const payload = JSON.stringify({ nodes, edges, clusters, summary: graph.summary });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  :root {
    --bg: #0b0b0f; --panel: #14141b; --border: #26263200; --line: #2a2a36;
    --text: #e6e6ef; --dim: #8b8b9e; --accent: #22d3ee;
  }
  @media (prefers-color-scheme: light) {
    :root { --bg:#fafafc; --panel:#fff; --line:#e3e3ea; --text:#16161d; --dim:#6b6b7d; --accent:#0891b2; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
    font:14px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; overflow:hidden; }
  header { padding:12px 18px; border-bottom:1px solid var(--line);
    display:flex; align-items:baseline; gap:16px; flex-wrap:wrap; }
  h1 { font-size:15px; margin:0; font-weight:650; letter-spacing:-.01em; }
  .stats { color:var(--dim); font-size:12px; display:flex; gap:14px; flex-wrap:wrap; }
  .stats b { color:var(--text); font-weight:600; }
  main { display:flex; height:calc(100vh - 53px); }
  #canvas { flex:1; cursor:grab; }
  #canvas:active { cursor:grabbing; }
  aside { width:260px; border-left:1px solid var(--line); padding:14px 16px;
    overflow-y:auto; background:var(--panel); }
  aside h2 { font-size:11px; text-transform:uppercase; letter-spacing:.08em;
    color:var(--dim); margin:0 0 10px; font-weight:600; }
  .row { display:flex; align-items:center; gap:8px; padding:4px 0; font-size:12.5px; }
  .dot { width:9px; height:9px; border-radius:50%; flex:none; }
  .row span:last-child { color:var(--dim); margin-left:auto; font-variant-numeric:tabular-nums; }
  .sel { margin-top:20px; padding-top:14px; border-top:1px solid var(--line); }
  .sel code { font-size:11.5px; word-break:break-all; color:var(--accent); display:block; margin-bottom:8px; }
  input[type=search] { width:100%; padding:6px 9px; border-radius:6px; border:1px solid var(--line);
    background:var(--bg); color:var(--text); font-size:12.5px; margin-bottom:14px; }
  input[type=search]:focus { outline:none; border-color:var(--accent); }
  .hint { color:var(--dim); font-size:11.5px; margin-top:14px; line-height:1.6; }
  text { pointer-events:none; user-select:none; }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(title)}</h1>
  <div class="stats">
    <div><b id="s-nodes">0</b> nodos</div>
    <div><b id="s-edges">0</b> aristas</div>
    <div><b>${graph.summary.totalFiles}</b> archivos</div>
    <div><b>${graph.summary.totalSymbols}</b> símbolos</div>
  </div>
</header>
<main>
  <svg id="canvas"></svg>
  <aside>
    <input type="search" id="q" placeholder="Filtrar nodos…" autocomplete="off" />
    <h2>Subsistemas</h2>
    <div id="legend"></div>
    <div class="sel" id="sel" hidden>
      <h2>Seleccionado</h2>
      <code id="sel-id"></code>
      <div class="row"><span>Conexiones</span><span id="sel-deg"></span></div>
      <div class="row"><span>Grupo</span><span id="sel-group"></span></div>
    </div>
    <p class="hint">Arrastra para mover · rueda para zoom · clic en un nodo para aislar sus vecinos.</p>
  </aside>
</main>
<script>
const DATA = ${payload};

// ── Paleta determinista por grupo ────────────────────────────────────────────
const PALETTE = ["#22d3ee","#a78bfa","#f472b6","#fbbf24","#34d399","#60a5fa",
                 "#fb923c","#c084fc","#2dd4bf","#f87171","#a3e635","#38bdf8"];
const groups = [...new Set(DATA.nodes.map(n => n.group))].sort();
const colorOf = g => PALETTE[groups.indexOf(g) % PALETTE.length];

// Hash estable → posición inicial determinista (sin Math.random).
function hash(s) { let h = 2166136261; for (let i=0;i<s.length;i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }

const svg = document.getElementById("canvas");
let W = svg.clientWidth, H = svg.clientHeight;

const nodes = DATA.nodes.map(n => ({
  ...n,
  x: (hash(n.id) - 0.5) * W * 0.8 + W/2,
  y: (hash(n.id + "y") - 0.5) * H * 0.8 + H/2,
  vx: 0, vy: 0,
  r: Math.min(4 + Math.sqrt(n.degree) * 1.9, 20),
}));
const byId = new Map(nodes.map(n => [n.id, n]));
const links = DATA.edges
  .map(e => ({ s: byId.get(e.source), t: byId.get(e.target) }))
  .filter(l => l.s && l.t);

document.getElementById("s-nodes").textContent = nodes.length;
document.getElementById("s-edges").textContent = links.length;

// ── Simulación de fuerzas (Fruchterman-Reingold simplificado) ────────────────
const K = Math.sqrt((W * H) / Math.max(nodes.length, 1)) * 0.55;
let alpha = 1;

function tick() {
  if (alpha < 0.005) return;
  // Repulsión (O(n²) — aceptable hasta ~300 nodos)
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      let dx = a.x - b.x, dy = a.y - b.y;
      let d2 = dx*dx + dy*dy;
      if (d2 < 0.01) { dx = (hash(a.id+b.id)-0.5); dy = (hash(b.id+a.id)-0.5); d2 = 0.01; }
      const f = (K * K) / d2;
      const d = Math.sqrt(d2);
      a.vx += (dx/d) * f; a.vy += (dy/d) * f;
      b.vx -= (dx/d) * f; b.vy -= (dy/d) * f;
    }
  }
  // Atracción por aristas
  for (const l of links) {
    const dx = l.t.x - l.s.x, dy = l.t.y - l.s.y;
    const d = Math.max(Math.sqrt(dx*dx + dy*dy), 0.01);
    const f = (d * d) / K * 0.06;
    const fx = (dx/d) * f, fy = (dy/d) * f;
    l.s.vx += fx; l.s.vy += fy;
    l.t.vx -= fx; l.t.vy -= fy;
  }
  // Gravedad al centro + integración
  for (const n of nodes) {
    n.vx += (W/2 - n.x) * 0.0015;
    n.vy += (H/2 - n.y) * 0.0015;
    if (n.fixed) { n.vx = n.vy = 0; continue; }
    n.x += Math.max(-18, Math.min(18, n.vx * alpha));
    n.y += Math.max(-18, Math.min(18, n.vy * alpha));
    n.vx *= 0.72; n.vy *= 0.72;
  }
  alpha *= 0.985;
}

// ── Render ───────────────────────────────────────────────────────────────────
const NS = "http://www.w3.org/2000/svg";
const gRoot = document.createElementNS(NS, "g");
const gLinks = document.createElementNS(NS, "g");
const gNodes = document.createElementNS(NS, "g");
gRoot.append(gLinks, gNodes); svg.append(gRoot);

const lineEls = links.map(() => {
  const el = document.createElementNS(NS, "line");
  el.setAttribute("stroke", "var(--line)"); el.setAttribute("stroke-width", "1");
  gLinks.append(el); return el;
});

let selected = null, filter = "";

const nodeEls = nodes.map(n => {
  const g = document.createElementNS(NS, "g");
  const c = document.createElementNS(NS, "circle");
  c.setAttribute("r", n.r); c.setAttribute("fill", colorOf(n.group));
  c.setAttribute("stroke", "var(--bg)"); c.setAttribute("stroke-width", "1.5");
  c.style.cursor = "pointer";
  const t = document.createElementNS(NS, "text");
  t.textContent = n.label;
  t.setAttribute("font-size", "10.5"); t.setAttribute("fill", "var(--text)");
  t.setAttribute("text-anchor", "middle"); t.setAttribute("dy", -n.r - 5);
  g.append(c, t); gNodes.append(g);
  c.addEventListener("click", e => { e.stopPropagation(); select(n); });
  return { g, c, t, n };
});

function neighborsOf(node) {
  const set = new Set([node.id]);
  for (const l of links) {
    if (l.s.id === node.id) set.add(l.t.id);
    if (l.t.id === node.id) set.add(l.s.id);
  }
  return set;
}

function select(n) {
  selected = selected && selected.id === n.id ? null : n;
  const panel = document.getElementById("sel");
  if (selected) {
    panel.hidden = false;
    document.getElementById("sel-id").textContent = selected.id;
    document.getElementById("sel-deg").textContent = selected.degree;
    document.getElementById("sel-group").textContent = selected.group;
  } else panel.hidden = true;
  paint();
}
svg.addEventListener("click", () => { if (selected) select(selected); });

function paint() {
  const near = selected ? neighborsOf(selected) : null;
  const q = filter.toLowerCase();
  for (const { g, c, n } of nodeEls) {
    const matches = !q || n.id.toLowerCase().includes(q);
    const active = (!near || near.has(n.id)) && matches;
    g.setAttribute("opacity", active ? "1" : "0.12");
    c.setAttribute("stroke", selected && selected.id === n.id ? "var(--accent)" : "var(--bg)");
    c.setAttribute("stroke-width", selected && selected.id === n.id ? "2.5" : "1.5");
  }
  lineEls.forEach((el, i) => {
    const l = links[i];
    const active = !near || (near.has(l.s.id) && near.has(l.t.id));
    el.setAttribute("opacity", active ? "0.42" : "0.05");
  });
}

function draw() {
  tick();
  lineEls.forEach((el, i) => {
    const l = links[i];
    el.setAttribute("x1", l.s.x); el.setAttribute("y1", l.s.y);
    el.setAttribute("x2", l.t.x); el.setAttribute("y2", l.t.y);
  });
  for (const { g, n } of nodeEls) g.setAttribute("transform", \`translate(\${n.x},\${n.y})\`);
  requestAnimationFrame(draw);
}

// ── Zoom + pan ───────────────────────────────────────────────────────────────
let zoom = 1, panX = 0, panY = 0;
const applyView = () => gRoot.setAttribute("transform", \`translate(\${panX},\${panY}) scale(\${zoom})\`);
svg.addEventListener("wheel", e => {
  e.preventDefault();
  const k = e.deltaY < 0 ? 1.12 : 0.89;
  zoom = Math.max(0.15, Math.min(4, zoom * k));
  applyView();
}, { passive: false });

let dragging = null, last = null;
svg.addEventListener("mousedown", e => {
  const hit = nodeEls.find(({ n }) => {
    const dx = (e.offsetX - panX) / zoom - n.x, dy = (e.offsetY - panY) / zoom - n.y;
    return dx*dx + dy*dy < (n.r + 4) ** 2;
  });
  if (hit) { dragging = hit.n; dragging.fixed = true; }
  last = { x: e.clientX, y: e.clientY };
});
window.addEventListener("mousemove", e => {
  if (!last) return;
  const dx = e.clientX - last.x, dy = e.clientY - last.y;
  if (dragging) { dragging.x += dx / zoom; dragging.y += dy / zoom; alpha = Math.max(alpha, 0.25); }
  else { panX += dx; panY += dy; applyView(); }
  last = { x: e.clientX, y: e.clientY };
});
window.addEventListener("mouseup", () => {
  if (dragging) dragging.fixed = false;
  dragging = null; last = null;
});

// ── Leyenda + filtro ─────────────────────────────────────────────────────────
const legend = document.getElementById("legend");
for (const cl of DATA.clusters) {
  const row = document.createElement("div"); row.className = "row";
  const dot = document.createElement("i"); dot.className = "dot";
  dot.style.background = colorOf(cl.group);
  const name = document.createElement("span"); name.textContent = cl.group;
  const count = document.createElement("span"); count.textContent = cl.files;
  row.append(dot, name, count); legend.append(row);
}
document.getElementById("q").addEventListener("input", e => { filter = e.target.value; paint(); });

window.addEventListener("resize", () => { W = svg.clientWidth; H = svg.clientHeight; alpha = 0.5; });
paint(); draw();
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}
