// @ts-nocheck
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
export class GremiusRealtime {
    url;
    ws = null;
    state = "disconnected";
    clientId = null;
    userId = null;
    // Subscriptions
    channelHandlers = new Map();
    presenceHandlers = new Map();
    stateHandlers = new Set();
    // Reconnection
    reconnectAttempts = 0;
    maxReconnectAttempts = 10;
    reconnectDelay = 1000;
    reconnectTimer = null;
    // Pending subscriptions (to restore after reconnect)
    pendingChannels = new Set();
    pendingRooms = new Set();
    // Heartbeat
    pingInterval = null;
    pingTimeout = 30000;
    constructor(url) {
        this.url = url;
    }
    // ═══════════════════════════════════════════════════════════
    // Connection Management
    // ═══════════════════════════════════════════════════════════
    /**
     * Connect to the WebSocket server.
     * Returns a promise that resolves when connected.
     */
    async connect() {
        if (this.state === "connected" || this.state === "connecting") {
            return;
        }
        return new Promise((resolve, reject) => {
            this.setState("connecting");
            try {
                this.ws = new WebSocket(this.url);
                this.ws.onopen = () => {
                    this.reconnectAttempts = 0;
                    this.startHeartbeat();
                    // Wait for "connected" message from server
                };
                this.ws.onmessage = (event) => {
                    this.handleMessage(event.data);
                    // Resolve promise on first connection
                    if (this.state === "connecting") {
                        this.setState("connected");
                        this.resubscribe();
                        resolve();
                    }
                };
                this.ws.onclose = () => {
                    this.stopHeartbeat();
                    if (this.state !== "disconnected") {
                        this.scheduleReconnect();
                    }
                };
                this.ws.onerror = (error) => {
                    console.error("[GremiusRealtime] WebSocket error:", error);
                    if (this.state === "connecting") {
                        reject(new Error("Failed to connect"));
                    }
                };
            }
            catch (err) {
                this.setState("disconnected");
                reject(err);
            }
        });
    }
    /**
     * Disconnect from the WebSocket server.
     */
    disconnect() {
        this.setState("disconnected");
        this.stopHeartbeat();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.clientId = null;
        this.userId = null;
    }
    /**
     * Get current connection state.
     */
    getState() {
        return this.state;
    }
    /**
     * Listen for connection state changes.
     */
    onStateChange(handler) {
        this.stateHandlers.add(handler);
        return () => this.stateHandlers.delete(handler);
    }
    // ═══════════════════════════════════════════════════════════
    // Channel Subscriptions (Live Queries)
    // ═══════════════════════════════════════════════════════════
    /**
     * Subscribe to a channel for live updates.
     *
     * @param channel Channel name (e.g., "table:datasetId" or "entry:entryId")
     * @param handler Callback for mutation events
     * @returns Unsubscribe function
     */
    subscribe(channel, handler) {
        // Track handler
        if (!this.channelHandlers.has(channel)) {
            this.channelHandlers.set(channel, new Set());
        }
        this.channelHandlers.get(channel).add(handler);
        // Track for reconnection
        this.pendingChannels.add(channel);
        // Send subscription request if connected
        if (this.state === "connected") {
            this.send({ type: "subscribe", channel });
        }
        // Return unsubscribe function
        return () => {
            const handlers = this.channelHandlers.get(channel);
            if (handlers) {
                handlers.delete(handler);
                if (handlers.size === 0) {
                    this.channelHandlers.delete(channel);
                    this.pendingChannels.delete(channel);
                    if (this.state === "connected") {
                        this.send({ type: "unsubscribe", channel });
                    }
                }
            }
        };
    }
    /**
     * Convenience method to subscribe to a dataset's changes.
     */
    subscribeToDataset(datasetId, handler) {
        return this.subscribe(`table:${datasetId}`, handler);
    }
    /**
     * Convenience method to subscribe to a single entry's changes.
     */
    subscribeToEntry(entryId, handler) {
        return this.subscribe(`entry:${entryId}`, handler);
    }
    // ═══════════════════════════════════════════════════════════
    // Presence
    // ═══════════════════════════════════════════════════════════
    /**
     * Join a presence room to track who's online.
     */
    joinRoom(room) {
        this.pendingRooms.add(room);
        if (this.state === "connected") {
            this.send({ type: "presence:join", room });
        }
    }
    /**
     * Leave a presence room.
     */
    leaveRoom(room) {
        this.pendingRooms.delete(room);
        this.presenceHandlers.delete(room);
        if (this.state === "connected") {
            this.send({ type: "presence:leave", room });
        }
    }
    /**
     * Listen for presence updates in a room.
     */
    onPresence(room, handler) {
        if (!this.presenceHandlers.has(room)) {
            this.presenceHandlers.set(room, new Set());
        }
        this.presenceHandlers.get(room).add(handler);
        return () => {
            const handlers = this.presenceHandlers.get(room);
            if (handlers) {
                handlers.delete(handler);
                if (handlers.size === 0) {
                    this.presenceHandlers.delete(room);
                }
            }
        };
    }
    // ═══════════════════════════════════════════════════════════
    // Internal Methods
    // ═══════════════════════════════════════════════════════════
    setState(state) {
        if (this.state === state)
            return;
        this.state = state;
        for (const handler of this.stateHandlers) {
            try {
                handler(state);
            }
            catch { }
        }
    }
    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }
    handleMessage(raw) {
        let msg;
        try {
            msg = JSON.parse(raw);
        }
        catch {
            return;
        }
        switch (msg.type) {
            case "connected":
                this.clientId = msg.clientId || null;
                this.userId = msg.userId || null;
                break;
            case "message":
                if (msg.channel && msg.data) {
                    const handlers = this.channelHandlers.get(msg.channel);
                    if (handlers) {
                        for (const handler of handlers) {
                            try {
                                handler(msg.data);
                            }
                            catch { }
                        }
                    }
                }
                break;
            case "presence":
                if (msg.room && msg.users) {
                    const handlers = this.presenceHandlers.get(msg.room);
                    if (handlers) {
                        for (const handler of handlers) {
                            try {
                                handler(msg.users);
                            }
                            catch { }
                        }
                    }
                }
                break;
            case "subscribed":
            case "unsubscribed":
                // Acknowledgments — could track pending state
                break;
            case "pong":
                // Heartbeat response
                break;
            case "error":
                console.warn("[GremiusRealtime] Server error:", msg.message);
                break;
        }
    }
    resubscribe() {
        // Restore channel subscriptions
        for (const channel of this.pendingChannels) {
            this.send({ type: "subscribe", channel });
        }
        // Restore presence rooms
        for (const room of this.pendingRooms) {
            this.send({ type: "presence:join", room });
        }
    }
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.setState("disconnected");
            console.error("[GremiusRealtime] Max reconnection attempts reached");
            return;
        }
        this.setState("reconnecting");
        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
        console.log(`[GremiusRealtime] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
        this.reconnectTimer = setTimeout(() => {
            this.connect().catch(() => {
                // Will retry via onclose
            });
        }, delay);
    }
    startHeartbeat() {
        this.pingInterval = setInterval(() => {
            this.send({ type: "ping" });
        }, this.pingTimeout);
    }
    stopHeartbeat() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }
}
// ═══════════════════════════════════════════════════════════════
// Factory Function
// ═══════════════════════════════════════════════════════════════
/**
 * Create a GremiusRealtime instance with sensible defaults.
 *
 * @param baseUrl Base URL of the Gremius API (e.g., "http://localhost:3001")
 */
export function createRealtime(baseUrl) {
    const wsUrl = baseUrl
        .replace(/^http:/, "ws:")
        .replace(/^https:/, "wss:")
        .replace(/\/$/, "") + "/api/realtime";
    return new GremiusRealtime(wsUrl);
}
//# sourceMappingURL=realtime.js.map