/**
 * @gremius/sdk — Real-time Module
 *
 * Provides WebSocket connection management and Live Query subscriptions.
 *
 * Usage:
 *   import { GremiusRealtime } from '@gremius/sdk/realtime';
 *
 *   const rt = new GremiusRealtime(process.env.GREMIUS_WS_URL || 'ws://localhost:3001/api/realtime');
 *   await rt.connect();
 *
 *   // Subscribe to all changes in a dataset
 *   const unsub = rt.subscribe('table:matches', (data) => {
 *     console.log('Mutation:', data.event, data.entry);
 *   });
 *
 *   // Presence
 *   rt.joinRoom('editor:doc-123');
 *   rt.onPresence('editor:doc-123', (users) => {
 *     console.log('Users online:', users);
 *   });
 *
 *   // Cleanup
 *   unsub();
 *   rt.disconnect();
 */
export type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";
export interface MutationEvent {
    event: "insert" | "update" | "delete";
    datasetId: string;
    entry: Record<string, unknown>;
    timestamp: number;
}
export interface PresenceUser {
    id: string;
    name?: string;
}
export interface PresenceEvent {
    room: string;
    users: PresenceUser[];
    count: number;
}
type MessageHandler = (data: MutationEvent) => void;
type PresenceHandler = (users: PresenceUser[]) => void;
type StateHandler = (state: ConnectionState) => void;
export declare class GremiusRealtime {
    private url;
    private ws;
    private state;
    private clientId;
    private userId;
    private channelHandlers;
    private presenceHandlers;
    private stateHandlers;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private reconnectDelay;
    private reconnectTimer;
    private pendingChannels;
    private pendingRooms;
    private pingInterval;
    private pingTimeout;
    constructor(url: string);
    /**
     * Connect to the WebSocket server.
     * Returns a promise that resolves when connected.
     */
    connect(): Promise<void>;
    /**
     * Disconnect from the WebSocket server.
     */
    disconnect(): void;
    /**
     * Get current connection state.
     */
    getState(): ConnectionState;
    /**
     * Listen for connection state changes.
     */
    onStateChange(handler: StateHandler): () => void;
    /**
     * Subscribe to a channel for live updates.
     *
     * @param channel Channel name (e.g., "table:datasetId" or "entry:entryId")
     * @param handler Callback for mutation events
     * @returns Unsubscribe function
     */
    subscribe(channel: string, handler: MessageHandler): () => void;
    /**
     * Convenience method to subscribe to a dataset's changes.
     */
    subscribeToDataset(datasetId: string, handler: MessageHandler): () => void;
    /**
     * Convenience method to subscribe to a single entry's changes.
     */
    subscribeToEntry(entryId: string, handler: MessageHandler): () => void;
    /**
     * Join a presence room to track who's online.
     */
    joinRoom(room: string): void;
    /**
     * Leave a presence room.
     */
    leaveRoom(room: string): void;
    /**
     * Listen for presence updates in a room.
     */
    onPresence(room: string, handler: PresenceHandler): () => void;
    private setState;
    private send;
    private handleMessage;
    private resubscribe;
    private scheduleReconnect;
    private startHeartbeat;
    private stopHeartbeat;
}
/**
 * Create a GremiusRealtime instance with sensible defaults.
 *
 * @param baseUrl Base URL of the Gremius API (e.g., "http://localhost:3001")
 */
export declare function createRealtime(baseUrl: string): GremiusRealtime;
export {};
//# sourceMappingURL=realtime.d.ts.map