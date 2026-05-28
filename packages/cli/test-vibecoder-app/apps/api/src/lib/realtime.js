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
import { subscribe, publish, getValkeyClient } from "./valkey";
// ═══════════════════════════════════════════════════════════════
// Connection Manager
// ═══════════════════════════════════════════════════════════════
class RealtimeManager {
    clients = new Map();
    channelSubscribers = new Map(); // channel → Set<clientId>
    presenceRooms = new Map(); // room → Map<clientId, user>
    // @ts-ignore - Private property, may be used in future
    _valkeySubscriptions = new Map(); // channel → unsubscribe fn
    initialized = false;
    /**
     * Initialize Valkey subscriber for real-time events.
     * Call once at server startup.
     */
    async initialize() {
        if (this.initialized)
            return;
        try {
            // Subscribe to all table, entry, and content channels via pattern
            await subscribe("table:*", (channel, message) => {
                this.broadcastToChannel(channel, message);
            });
            await subscribe("entry:*", (channel, message) => {
                this.broadcastToChannel(channel, message);
            });
            await subscribe("content:*", (channel, message) => {
                this.broadcastToChannel(channel, message);
            });
            this.initialized = true;
            console.log("  📡 Real-time Manager initialized (Valkey Pub/Sub)");
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`  ⚠️  Real-time Manager: Valkey not available (${message})`);
        }
    }
    /**
     * Register a new WebSocket connection.
     */
    addClient(clientId, socket, userId) {
        const client = {
            id: clientId,
            userId,
            socket,
            channels: new Set(),
            rooms: new Set(),
        };
        this.clients.set(clientId, client);
        console.log(`  📡 [WS] Client connected: ${clientId} (user: ${userId || "anonymous"})`);
        return client;
    }
    /**
     * Remove a WebSocket connection and clean up subscriptions.
     */
    removeClient(clientId) {
        const client = this.clients.get(clientId);
        if (!client)
            return;
        // Leave all channels
        for (const channel of client.channels) {
            this.unsubscribeFromChannel(clientId, channel);
        }
        // Leave all presence rooms
        for (const room of client.rooms) {
            this.leavePresenceRoom(clientId, room);
        }
        this.clients.delete(clientId);
        console.log(`  📡 [WS] Client disconnected: ${clientId}`);
    }
    /**
     * Subscribe a client to a channel.
     */
    subscribeToChannel(clientId, channel) {
        const client = this.clients.get(clientId);
        if (!client)
            return;
        // Validate channel format (table, entry, content channels)
        if (!channel.match(/^(table|entry|content):[a-zA-Z0-9_-]+$/)) {
            this.sendError(client.socket, `Invalid channel format: ${channel}`);
            return;
        }
        client.channels.add(channel);
        // Track channel subscribers
        if (!this.channelSubscribers.has(channel)) {
            this.channelSubscribers.set(channel, new Set());
        }
        this.channelSubscribers.get(channel).add(clientId);
        this.send(client.socket, { type: "subscribed", channel });
        console.log(`  📡 [WS] ${clientId} subscribed to ${channel}`);
    }
    /**
     * Unsubscribe a client from a channel.
     */
    unsubscribeFromChannel(clientId, channel) {
        const client = this.clients.get(clientId);
        if (client) {
            client.channels.delete(channel);
            this.send(client.socket, { type: "unsubscribed", channel });
        }
        const subscribers = this.channelSubscribers.get(channel);
        if (subscribers) {
            subscribers.delete(clientId);
            if (subscribers.size === 0) {
                this.channelSubscribers.delete(channel);
            }
        }
    }
    /**
     * Broadcast a message to all subscribers of a channel.
     */
    broadcastToChannel(channel, message) {
        const subscribers = this.channelSubscribers.get(channel);
        if (!subscribers || subscribers.size === 0)
            return;
        let data;
        try {
            data = JSON.parse(message);
        }
        catch {
            data = message;
        }
        const payload = { type: "message", channel, data };
        for (const clientId of subscribers) {
            const client = this.clients.get(clientId);
            if (client) {
                this.send(client.socket, payload);
            }
        }
    }
    // ═══════════════════════════════════════════════════════════
    // Presence System
    // ═══════════════════════════════════════════════════════════
    /**
     * Join a presence room.
     */
    joinPresenceRoom(clientId, room) {
        const client = this.clients.get(clientId);
        if (!client)
            return;
        // Validate room format
        if (!room.match(/^[a-zA-Z0-9_:-]+$/)) {
            this.sendError(client.socket, `Invalid room format: ${room}`);
            return;
        }
        client.rooms.add(room);
        if (!this.presenceRooms.has(room)) {
            this.presenceRooms.set(room, new Map());
        }
        const roomUsers = this.presenceRooms.get(room);
        roomUsers.set(clientId, {
            id: client.userId || clientId,
            name: client.userId ? undefined : "Anonymous",
        });
        // Broadcast presence update to all in room
        this.broadcastPresence(room);
        console.log(`  📡 [WS] ${clientId} joined presence room ${room}`);
    }
    /**
     * Leave a presence room.
     */
    leavePresenceRoom(clientId, room) {
        const client = this.clients.get(clientId);
        if (client) {
            client.rooms.delete(room);
        }
        const roomUsers = this.presenceRooms.get(room);
        if (roomUsers) {
            roomUsers.delete(clientId);
            if (roomUsers.size === 0) {
                this.presenceRooms.delete(room);
            }
            else {
                this.broadcastPresence(room);
            }
        }
    }
    /**
     * Broadcast current presence to all users in a room.
     */
    broadcastPresence(room) {
        const roomUsers = this.presenceRooms.get(room);
        if (!roomUsers)
            return;
        const users = Array.from(roomUsers.values());
        const payload = { type: "presence", room, users, count: users.length };
        for (const [clientId] of roomUsers) {
            const client = this.clients.get(clientId);
            if (client) {
                this.send(client.socket, payload);
            }
        }
    }
    // ═══════════════════════════════════════════════════════════
    // Public API for GrimoireContext
    // ═══════════════════════════════════════════════════════════
    /**
     * Broadcast a message to a channel.
     * Used by GrimoireContext.realtime.broadcast()
     */
    broadcast(channel, message) {
        // Publish to Valkey for horizontal scaling (async, fire-and-forget)
        getValkeyClient().then((valkey) => {
            if (valkey) {
                valkey.publish(channel, JSON.stringify(message)).catch(() => {
                    // Valkey publish failed, ignore
                });
            }
        }).catch(() => {
            // Valkey not available, broadcast locally only
        });
        // Also broadcast locally
        this.broadcastToChannel(channel, JSON.stringify(message));
    }
    /**
     * Send a message to a specific user.
     * Used by GrimoireContext.realtime.sendToUser()
     */
    sendToUser(userId, message) {
        // Find all clients for this user
        for (const [, client] of this.clients) {
            if (client.userId === userId) {
                this.send(client.socket, message);
            }
        }
    }
    // ═══════════════════════════════════════════════════════════
    // Message Handling
    // ═══════════════════════════════════════════════════════════
    /**
     * Handle incoming WebSocket message.
     */
    handleMessage(clientId, raw) {
        let msg;
        try {
            msg = JSON.parse(raw);
        }
        catch {
            const client = this.clients.get(clientId);
            if (client)
                this.sendError(client.socket, "Invalid JSON");
            return;
        }
        const client = this.clients.get(clientId);
        if (!client)
            return;
        switch (msg.type) {
            case "subscribe":
                if (msg.channel)
                    this.subscribeToChannel(clientId, msg.channel);
                break;
            case "unsubscribe":
                if (msg.channel)
                    this.unsubscribeFromChannel(clientId, msg.channel);
                break;
            case "presence:join":
                if (msg.room)
                    this.joinPresenceRoom(clientId, msg.room);
                break;
            case "presence:leave":
                if (msg.room)
                    this.leavePresenceRoom(clientId, msg.room);
                break;
            case "ping":
                this.send(client.socket, { type: "pong", timestamp: Date.now() });
                break;
            default: {
                // Unknown message type
                const unknownMsg = msg;
                this.sendError(client.socket, `Unknown message type: ${unknownMsg.type ?? 'undefined'}`);
            }
        }
    }
    // ═══════════════════════════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════════════════════════
    send(socket, data) {
        try {
            socket.send(JSON.stringify(data));
        }
        catch {
            // Socket closed
        }
    }
    sendError(socket, message) {
        this.send(socket, { type: "error", message });
    }
    /**
     * Get stats for monitoring.
     */
    getStats() {
        return {
            connections: this.clients.size,
            channels: this.channelSubscribers.size,
            rooms: this.presenceRooms.size,
        };
    }
}
// Singleton instance
export const realtimeManager = new RealtimeManager();
// ═══════════════════════════════════════════════════════════════
// Broadcast Helper (for use in data layer)
// ═══════════════════════════════════════════════════════════════
/**
 * Publish a content update to the real-time layer.
 * Used when blog posts or pages are updated in the editor.
 *
 * @param contentId Post/page ID
 * @param event Event type: "update" | "publish" | "unpublish"
 * @param content The content data (blocks, metadata)
 */
export async function broadcastContentUpdate(contentId, event, content) {
    const payload = {
        event,
        contentId,
        content,
        timestamp: Date.now(),
    };
    await publish(`content:${contentId}`, payload);
}
/**
 * Publish a mutation event to the real-time layer.
 * Call this from the data layer after successful insert/update/delete.
 *
 * @param datasetId Dataset ID
 * @param event Event type: "insert" | "update" | "delete"
 * @param entry The entry data
 */
export async function broadcastMutation(datasetId, event, entry) {
    const payload = {
        event,
        datasetId,
        entry,
        timestamp: Date.now(),
    };
    // Publish to table channel (all entries in dataset)
    await publish(`table:${datasetId}`, payload);
    // Publish to entry channel (specific entry)
    if (entry.id) {
        await publish(`entry:${entry.id}`, payload);
    }
}
//# sourceMappingURL=realtime.js.map