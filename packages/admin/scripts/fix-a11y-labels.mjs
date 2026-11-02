/**
 * Codemod a11y — asocia `<label>` con su control (Svelte a11y_label_has_associated_control).
 *
 * Patrón que corrige (el único que toca, por seguridad):
 *
 *   <label class="...">Site Name</label>       →  <label for="ID" ...>Site Name</label>
 *   <input bind:value={siteName} ... />           <input id="ID" ... />
 *
 * Reglas:
 *   - Solo actúa si el label NO tiene ya `for=` y el siguiente elemento es un
 *     control (input/select/textarea) SIN `id=`.
 *   - El id se deriva del `bind:value={x}` del control (estable y legible); si
 *     no hay bind, del texto del label. Se garantiza unicidad por archivo.
 *   - Cualquier caso ambiguo se deja intacto (mejor un warning que romper el DOM).
 *
 * Uso:  node scripts/fix-a11y-labels.mjs <archivo.svelte> [...]
 */
import { readFileSync, writeFileSync } from "node:fs";

const CONTROL = /^\s*<(input|select|textarea)\b/;
const LABEL_OPEN = /^\s*<label\b/;

function slug(s) {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function processFile(path) {
  const src = readFileSync(path, "utf8");
  const lines = src.split("\n");
  const used = new Set(Array.from(src.matchAll(/\bid="([^"{}]+)"/g)).map((m) => m[1]));
  let changes = 0;

  for (let i = 0; i < lines.length; i++) {
    if (!LABEL_OPEN.test(lines[i])) continue;

    // Encontrar el cierre del tag <label ...> y luego </label>
    let openEnd = i;
    while (openEnd < lines.length && !lines[openEnd].includes(">")) openEnd++;
    const openTag = lines.slice(i, openEnd + 1).join("\n");
    if (/\bfor=/.test(openTag)) continue; // ya asociado

    let closeAt = openEnd;
    while (closeAt < lines.length && !lines[closeAt].includes("</label>")) closeAt++;
    if (closeAt >= lines.length) continue;

    // El control debe ser el siguiente elemento no vacío
    let ctrl = closeAt + 1;
    while (ctrl < lines.length && lines[ctrl].trim() === "") ctrl++;
    if (ctrl >= lines.length || !CONTROL.test(lines[ctrl])) continue;

    // Cuerpo del control hasta que cierre
    let ctrlEnd = ctrl;
    while (ctrlEnd < lines.length && !/\/?>\s*$/.test(lines[ctrlEnd])) ctrlEnd++;
    const ctrlBlock = lines.slice(ctrl, ctrlEnd + 1).join("\n");
    if (/\bid=/.test(ctrlBlock)) continue; // ya tiene id

    // Derivar id: bind:value={x} → x ; si no, del texto del label
    const bind = ctrlBlock.match(/bind:value=\{([A-Za-z_$][\w$.]*)\}/);
    const labelText = lines
      .slice(openEnd, closeAt + 1)
      .join(" ")
      .replace(/<[^>]*>/g, " ")
      .replace(/\{[^}]*\}/g, " ");
    let base = bind ? slug(bind[1].split(".").pop()) : slug(labelText);
    if (!base) continue;

    let id = base;
    let n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);

    // Insertar for= en el label y id= en el control
    lines[i] = lines[i].replace(/<label\b/, `<label for="${id}"`);
    lines[ctrl] = lines[ctrl].replace(/<(input|select|textarea)\b/, `<$1 id="${id}"`);
    changes++;
  }

  if (changes > 0) writeFileSync(path, lines.join("\n"));
  return changes;
}

let total = 0;
for (const file of process.argv.slice(2)) {
  const n = processFile(file);
  if (n) console.log(`${n.toString().padStart(3)}  ${file}`);
  total += n;
}
console.log(`\nlabels asociados: ${total}`);
