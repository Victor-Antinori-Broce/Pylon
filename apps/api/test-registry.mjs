import { KON_REGISTRY } from "./src/services/module-registry.js";
console.log("Count:", KON_REGISTRY.length);
for (const g of KON_REGISTRY) {
  console.log(g.key, "-", g.category);
}
