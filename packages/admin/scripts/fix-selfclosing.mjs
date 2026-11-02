/**
 * Corrige tags no-void auto-cerrados en Svelte (`<textarea ... />`),
 * que son ambiguos en HTML: `<textarea ...></textarea>`.
 *
 * Uso: node scripts/fix-selfclosing.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const TARGETS = [
  ["src/lib/components/calculated-fields/FormulaBuilder.svelte", 378],
  ["src/lib/components/forms/DynamicForm.svelte", 478],
  ["src/lib/components/forms/DynamicForm.svelte", 497],
  ["src/views/datasets/DatasetCreator.svelte", 271],
];

const byFile = new Map();
for (const [file, line] of TARGETS) {
  if (!byFile.has(file)) byFile.set(file, []);
  byFile.get(file).push(line);
}

let total = 0;
for (const [file, lineNums] of byFile) {
  const lines = readFileSync(file, "utf8").split("\n");
  // De abajo hacia arriba: no mueve los offsets de los anteriores.
  lineNums.sort((a, b) => b - a);
  for (const ln of lineNums) {
    let i = ln - 1;
    // Avanzar hasta la línea que cierra el tag con "/>"
    while (i < lines.length && !lines[i].includes("/>")) i++;
    if (i >= lines.length) continue;
    lines[i] = lines[i].replace(/\s*\/>/, "></textarea>");
    total++;
  }
  writeFileSync(file, lines.join("\n"));
  console.log("fixed", file);
}
console.log(`\nself-closing corregidos: ${total}`);
