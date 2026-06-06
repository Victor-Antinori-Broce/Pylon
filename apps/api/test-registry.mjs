import { GRIMOIRE_REGISTRY } from "./src/services/module-registry.js";
console.log("Count:", GRIMOIRE_REGISTRY.length);
for (const g of GRIMOIRE_REGISTRY) {
  console.log(g.key, "-", g.category);
}
