import { buildAdminRegistry } from "./src/services/admin-registry.js";

const registry = await buildAdminRegistry();
for (const g of registry) {
  const defaultViewExists = g.views.some((v) => v.id === g.defaultView);
  if (!defaultViewExists) {
    console.log(
      "BAD:",
      g.id,
      "defaultView:",
      g.defaultView,
      "views:",
      g.views.map((v) => v.id)
    );
  }
  for (const view of g.views) {
    if (!["grid", "kanban", "calendar", "custom"].includes(view.type)) {
      console.log("BAD TYPE:", g.id, view.id, view.type);
    }
  }
}
console.log("Done");
