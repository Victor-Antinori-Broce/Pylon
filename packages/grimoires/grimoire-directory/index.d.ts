/**
 * Gremio CMS — Employee Directory (DI Version)
 *
 * REST API for employee profiles, departments, positions,
 * and organizational hierarchy.
 *
 * MIGRATED: Now uses Dependency Injection via GrimoireContext
 */
import { createDirectoryRouter } from "./directory.routes";
import * as schema from "./directory.schema";
export * from "./directory.schema";
export { createDirectoryRouter };
export declare const grimoire: import("@gremius/shared").GrimoireDefinition;
export { schema };
export default grimoire;
//# sourceMappingURL=index.d.ts.map