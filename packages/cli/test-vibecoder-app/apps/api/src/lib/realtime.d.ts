/**
 * GremiusCMS — Real-time WebSocket Server
 *
 * Provides WebSocket connections for Live Queries and Presence.
 * Uses Valkey Pub/Sub as the message broker for horizontal scaling.
 *
 * Channels:
 *   - table:{datasetId}  → All mutations in a dataset
 *   - entry:{entryId}    → Single entry updates
 *   - presence:{room}    → Who's online in a room
 *
 * Protocol (JSON messages):
 *   Client → Server:
 *     { "type": "subscribe", "channel": "table:abc123" }
 *     { "type": "unsubscribe", "channel": "table:abc123" }
 *     { "type": "presence:join", "room": "editor:doc-1" }
 *     { "type": "presence:leave", "room": "editor:doc-1" }
 *     { "type": "ping" }
 *
 *   Server → Client:
 *     { "type": "subscribed", "channel": "table:abc123" }
 *     { "type": "unsubscribed", "channel": "table:abc123" }
 *     { "type": "message", "channel": "table:abc123", "data": {...} }
 *     { "type": "presence", "room": "...", "users": [...] }
 *     { "type": "pong" }
 *     { "type": "error", "message": "..." }
 */
import type { ServerWebSocket } from "bun";
export interface WSClient {
    id: string;
    userId: string | null;
    socket: ServerWebSocket<WSClientData>;
    channels: Set<string>;
    rooms: Set<string>;
}
export interface WSClientData {
    clientId: string;
    userId: string | null;
}
declare class RealtimeManager {
    private clients;
    private channelSubscribers;
    private presenceRooms;
    private _valkeySubscriptions;
    private initialized;
    /**
     * Initialize Valkey subscriber for real-time events.
     * Call once at server startup.
     */
    initialize(): Promise<void>;
    /**
     * Register a new WebSocket connection.
     */
    addClient(clientId: string, socket: ServerWebSocket<WSClientData>, userId: string | null): WSClient;
    /**
     * Remove a WebSocket connection and clean up subscriptions.
     */
    removeClient(clientId: string): void;
    /**
     * Subscribe a client to a channel.
     */
    subscribeToChannel(clientId: string, channel: string): void;
    /**
     * Unsubscribe a client from a channel.
     */
    unsubscribeFromChannel(clientId: string, channel: string): void;
    /**
     * Broadcast a message to all subscribers of a channel.
     */
    private broadcastToChannel;
    /**
     * Join a presence room.
     */
    joinPresenceRoom(clientId: string, room: string): void;
    /**
     * Leave a presence room.
     */
    leavePresenceRoom(clientId: string, room: string): void;
    /**
     * Broadcast current presence to all users in a room.
     */
    private broadcastPresence;
    /**
     * Broadcast a message to a channel.
     * Used by GrimoireContext.realtime.broadcast()
     */
    broadcast(channel: string, message: unknown): void;
    /**
     * Send a message to a specific user.
     * Used by GrimoireContext.realtime.sendToUser()
     */
    sendToUser(userId: string, message: unknown): void;
    /**
     * Handle incoming WebSocket message.
     */
    handleMessage(clientId: string, raw: string): void;
    private send;
    private sendError;
    /**
     * Get stats for monitoring.
     */
    getStats(): {
        connections: number;
        channels: number;
        rooms: number;
    };
}
export declare const realtimeManager: RealtimeManager;
/**
 * Publish a content update to the real-time layer.
 * Used when blog posts or pages are updated in the editor.
 *
 * @param contentId Post/page ID
 * @param event Event type: "update" | "publish" | "unpublish"
 * @param content The content data (blocks, metadata)
 */
export declare function broadcastContentUpdate(contentId: string, event: "update" | "publish" | "unpublish", content: Record<string, unknown>): Promise<void>;
/**
 * Publish a mutation event to the real-time layer.
 * Call this from the data layer after successful insert/update/delete.
 *
 * @param datasetId Dataset ID
 * @param event Event type: "insert" | "update" | "delete"
 * @param entry The entry data
 */
export declare function broadcastMutation(datasetId: string, event: "insert" | "update" | "delete", entry: Record<string, unknown>): Promise<void>;
export {};
//# sourceMappingURL=realtime.d.ts.map