/**
 * GremiusCMS - Hono API Server v0.8.0-beta (Actions Unification)
 *
 * Runtime: Bun + Hono
 * Auth: Better-Auth (cookie sessions)
 * Queue: BullMQ + DragonflyDB
 * Real-time: WebSocket + Valkey Pub/Sub
 * Actions: Unified Workers + Webhooks + Agents engine
 *
 * 3-Tier Architecture:
 *   - ENGINE (Nivel 1): Auth, DB, Actions — always active (packages/engine/)
 *   - CORE   (Nivel 2): Data Sets, Media, Connectors — switchable (packages/core/)
 *   - GRIMOIRES (Nivel 3): Business modules — loaded via module-loader (packages/grimoires/)
 *
 * Phase 3: Actions Unification Complete
 *   - actions table replaces gremius_functions + webhooks
 *   - ActionEngine handles all automation types
 *   - Legacy APIs maintained for backward compatibility
 */
import type { ServerWebSocket } from "bun";
import { type WSClientData } from "./lib/realtime";
declare const _default: {
    port: number;
    fetch: (req: Request, server: any) => Promise<Response>;
    websocket: {
        open(ws: ServerWebSocket<WSClientData>): void;
        message(ws: ServerWebSocket<WSClientData>, message: string | Buffer): void;
        close(ws: ServerWebSocket<WSClientData>): void;
        error(ws: ServerWebSocket<WSClientData>, error: Error): void;
    };
};
export default _default;
//# sourceMappingURL=index.d.ts.map