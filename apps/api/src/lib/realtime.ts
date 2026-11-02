/**
 * Kitsuden — Real-time WebSocket Server
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

import { subscribe, publish, getValkeyClient } from "./valkey";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface WSClient {
  id: string;
  userId: string | null;
  /** Rol del usuario — lo necesita la autorización de canales. */
  userRole: string | null;
  socket: ServerWebSocket<WSClientData>;
  channels: Set<string>;
  rooms: Set<string>; // Presence rooms
}

export interface WSClientData {
  clientId: string;
  userId: string | null;
  userRole?: string | null;
}

interface IncomingMessage {
  type: "subscribe" | "unsubscribe" | "presence:join" | "presence:leave" | "ping";
  channel?: string;
  room?: string;
}

// ═══════════════════════════════════════════════════════════════
// Connection Manager
// ═══════════════════════════════════════════════════════════════

class RealtimeManager {
  private clients = new Map<string, WSClient>();
  private channelSubscribers = new Map<string, Set<string>>(); // channel → Set<clientId>
  private presenceRooms = new Map<string, Map<string, { id: string; name?: string }>>(); // room → Map<clientId, user>
  // @ts-ignore - Private property, may be used in future
  private _valkeySubscriptions = new Map<string, () => Promise<void>>(); // channel → unsubscribe fn
  private initialized = false;

  /**
   * Initialize Valkey subscriber for real-time events.
   * Call once at server startup.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`  ⚠️  Real-time Manager: Valkey not available (${message})`);
    }
  }

  /**
   * Register a new WebSocket connection.
   */
  addClient(
    clientId: string,
    socket: ServerWebSocket<WSClientData>,
    userId: string | null,
    userRole: string | null = null
  ): WSClient {
    const client: WSClient = {
      id: clientId,
      userId,
      userRole,
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
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

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
  async subscribeToChannel(clientId: string, channel: string): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Validate channel format (table, entry, content channels)
    if (!channel.match(/^(table|entry|content):[a-zA-Z0-9_-]+$/)) {
      this.sendError(client.socket, `Invalid channel format: ${channel}`);
      return;
    }

    // AUTORIZACIÓN — antes solo se validaba el FORMATO del canal, así que
    // cualquier cliente conectado podía escuchar cualquier tabla. El
    // autorizador lo inyecta el host (ver setSubscriptionAuthorizer) para no
    // acoplar el transporte a las políticas ni crear un ciclo de imports.
    // Sin autorizador registrado: deny-by-default salvo admin.
    const user = { id: client.userId, role: client.userRole ?? null };
    const allowed = _authorizer ? await _authorizer(channel, user) : client.userRole === "admin";

    if (!allowed) {
      this.sendError(client.socket, `Not authorized for channel: ${channel}`);
      console.warn(`  🔒 [WS] ${clientId} DENIED on ${channel} (user: ${client.userId ?? "anon"})`);
      return;
    }

    client.channels.add(channel);

    // Track channel subscribers
    if (!this.channelSubscribers.has(channel)) {
      this.channelSubscribers.set(channel, new Set());
    }
    this.channelSubscribers.get(channel)!.add(clientId);

    this.send(client.socket, { type: "subscribed", channel });
    console.log(`  📡 [WS] ${clientId} subscribed to ${channel}`);
  }

  /**
   * Unsubscribe a client from a channel.
   */
  unsubscribeFromChannel(clientId: string, channel: string): void {
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
  private broadcastToChannel(channel: string, message: string): void {
    const subscribers = this.channelSubscribers.get(channel);
    if (!subscribers || subscribers.size === 0) return;

    let data: unknown;
    try {
      data = JSON.parse(message);
    } catch {
      data = message;
    }

    for (const clientId of subscribers) {
      const client = this.clients.get(clientId);
      if (!client) continue;

      // FILTRADO POR SUSCRIPTOR — no un fan-out ciego.
      // Entregar la misma fila a todos los suscritos al canal filtraría datos
      // entre usuarios (el mismo bug que tuvimos en GraphQL y en las entries
      // de datasets, pero en streaming). El filtro decide POR CLIENTE si esa
      // fila concreta le corresponde; sin filtro registrado, solo se entrega
      // a admins (deny-by-default).
      const visible = _rowFilter
        ? _rowFilter(channel, data, { id: client.userId, role: client.userRole ?? null })
        : client.userRole === "admin"
          ? data
          : null;

      if (visible === null || visible === undefined) continue;
      this.send(client.socket, { type: "message", channel, data: visible });
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Presence System
  // ═══════════════════════════════════════════════════════════

  /**
   * Join a presence room.
   */
  joinPresenceRoom(clientId: string, room: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Validate room format
    if (!room.match(/^[a-zA-Z0-9_:-]+$/)) {
      this.sendError(client.socket, `Invalid room format: ${room}`);
      return;
    }

    // Presencia solo con sesión: cualquiera que abriera el socket entraba en
    // cualquier sala y veía quién estaba (auditoría 2026-10-25).
    if (!client.userId) {
      this.sendError(client.socket, "Presence requires an authenticated session");
      return;
    }

    client.rooms.add(room);

    if (!this.presenceRooms.has(room)) {
      this.presenceRooms.set(room, new Map());
    }

    const roomUsers = this.presenceRooms.get(room)!;
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
  leavePresenceRoom(clientId: string, room: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.rooms.delete(room);
    }

    const roomUsers = this.presenceRooms.get(room);
    if (roomUsers) {
      roomUsers.delete(clientId);
      if (roomUsers.size === 0) {
        this.presenceRooms.delete(room);
      } else {
        this.broadcastPresence(room);
      }
    }
  }

  /**
   * Broadcast current presence to all users in a room.
   */
  private broadcastPresence(room: string): void {
    const roomUsers = this.presenceRooms.get(room);
    if (!roomUsers) return;

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
  // Public API for KonContext
  // ═══════════════════════════════════════════════════════════

  /**
   * Broadcast a message to a channel.
   * Used by KonContext.realtime.broadcast()
   */
  broadcast(channel: string, message: unknown): void {
    // Publish to Valkey for horizontal scaling (async, fire-and-forget)
    getValkeyClient()
      .then((valkey) => {
        if (valkey) {
          valkey.publish(channel, JSON.stringify(message)).catch(() => {
            // Valkey publish failed, ignore
          });
        }
      })
      .catch(() => {
        // Valkey not available, broadcast locally only
      });

    // Also broadcast locally
    this.broadcastToChannel(channel, JSON.stringify(message));
  }

  /**
   * Send a message to a specific user.
   * Used by KonContext.realtime.sendToUser()
   */
  sendToUser(userId: string, message: unknown): void {
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
  handleMessage(clientId: string, raw: string): void {
    let msg: IncomingMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      const client = this.clients.get(clientId);
      if (client) this.sendError(client.socket, "Invalid JSON");
      return;
    }

    const client = this.clients.get(clientId);
    if (!client) return;

    switch (msg.type) {
      case "subscribe":
        if (msg.channel) this.subscribeToChannel(clientId, msg.channel);
        break;

      case "unsubscribe":
        if (msg.channel) this.unsubscribeFromChannel(clientId, msg.channel);
        break;

      case "presence:join":
        if (msg.room) this.joinPresenceRoom(clientId, msg.room);
        break;

      case "presence:leave":
        if (msg.room) this.leavePresenceRoom(clientId, msg.room);
        break;

      case "ping":
        this.send(client.socket, { type: "pong", timestamp: Date.now() });
        break;

      default: {
        // Unknown message type
        const unknownMsg = msg as { type?: string };
        this.sendError(client.socket, `Unknown message type: ${unknownMsg.type ?? "undefined"}`);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════

  private send(socket: ServerWebSocket<WSClientData>, data: unknown): void {
    try {
      socket.send(JSON.stringify(data));
    } catch {
      // Socket closed
    }
  }

  private sendError(socket: ServerWebSocket<WSClientData>, message: string): void {
    this.send(socket, { type: "error", message });
  }

  /**
   * Get stats for monitoring.
   */
  getStats(): {
    connections: number;
    channels: number;
    rooms: number;
  } {
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
export async function broadcastContentUpdate(
  contentId: string,
  event: "update" | "publish" | "unpublish",
  content: Record<string, unknown>
): Promise<void> {
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
export async function broadcastMutation(
  datasetId: string,
  event: "insert" | "update" | "delete",
  entry: Record<string, unknown>
): Promise<void> {
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

// ═══════════════════════════════════════════════════════════════════════════
// AUTORIZACIÓN INYECTABLE (patrón de setTelemetryProvider)
//
// El transporte no debe conocer las políticas de datos: el host las cablea al
// arrancar. Así realtime.ts no importa rls-builder ni la DB — evita el ciclo y
// deja el módulo testeable en aislamiento.
// ═══════════════════════════════════════════════════════════════════════════

/** Usuario mínimo que ve la capa de autorización del realtime. */
export interface RealtimeUser {
  id: string | null;
  role: string | null;
}

/** ¿Puede este usuario suscribirse a este canal? */
export type SubscriptionAuthorizer = (
  channel: string,
  user: RealtimeUser
) => boolean | Promise<boolean>;

/**
 * Recorta un evento para un suscriptor concreto. Devuelve `null` para NO
 * entregarlo (p.ej. la fila pertenece a otro usuario).
 */
export type RowFilter = (channel: string, data: unknown, user: RealtimeUser) => unknown | null;

let _authorizer: SubscriptionAuthorizer | null = null;
let _rowFilter: RowFilter | null = null;

/**
 * Registra quién puede suscribirse a qué. SIN esto, solo los admins pueden
 * suscribirse (deny-by-default): preferimos un realtime que no funcione a uno
 * que filtre datos entre usuarios.
 */
export function setSubscriptionAuthorizer(fn: SubscriptionAuthorizer | null): void {
  _authorizer = fn;
}

/** Registra el filtro por fila que se aplica a cada suscriptor en el broadcast. */
export function setRowFilter(fn: RowFilter | null): void {
  _rowFilter = fn;
}
