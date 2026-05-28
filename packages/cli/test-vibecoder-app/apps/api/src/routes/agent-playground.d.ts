/**
 * Agent Playground API
 *
 * Endpoint para chatear con agentes desde el Admin UI.
 * Conecta con el MCP server para procesar mensajes.
 */
import { Hono } from "hono";
declare const playgroundRouter: Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
export default playgroundRouter;
//# sourceMappingURL=agent-playground.d.ts.map