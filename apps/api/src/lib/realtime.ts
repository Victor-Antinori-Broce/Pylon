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
  /** Sesión de better-auth con la que se abrió el socket (null: anónimo). */
  sessionId: string | null;
  /** Caducidad de esa sesión (ms epoch); el socket no vive más que ella. */
  sessionExpiresAt: number | null;
  socket: ServerWebSocket<WSClientData>;
  channels: Set<string>;
  rooms: Set<string>; // Presence rooms
}

export interface WSClientData {
  clientId: string;
  userId: string | null;
  userRole?: string | null;
  sessionId?: string | null;
  sessionExpiresAt?: number | null;
}

interface IncomingMessage {
  type: "subscribe" | "unsubscribe" | "presence:join" | "presence:leave" | "ping";
  channel?: string;
  room?: string;
}

/**
 * Tope de longitud de `type`, `channel` y `room` en un frame del cliente. Los
 * nombres válidos son cortos; uno enorme solo sirve para gastar CPU en regex
 * o inflar el mensaje de error que se le devuelve.
 */
export const MAX_NOMBRE_EN_FRAME = 200;

/** Cada cuánto se revalida la sesión de los sockets con usuario. */
export const REVALIDAR_SESION_MS = 60_000;

/** Códigos de cierre (rango 4000–4999, de aplicación). */
export const CIERRE_SESION_INVALIDA = 4401;

// ═══════════════════════════════════════════════════════════════
// Revalidación de sesión (pura, testeable)
// ═══════════════════════════════════════════════════════════════

/** Lo que el socket guardó al abrirse. */
export interface SesionDelSocket {
  userId: string | null;
  userRole: string | null;
  sessionId: string | null;
}

/** La sesión tal como está AHORA en la base de datos (null: ya no existe). */
export interface SesionActual {
  userId: string;
  role: string | null;
  /** ms epoch */
  expiresAt: number;
}

export type DecisionDeSesion =
  | { mantener: true; expiresAt: number | null }
  | { mantener: false; motivo: "revocada" | "caducada" | "otro-usuario" | "rol-cambiado" | "sin-sesion" };

/**
 * ¿Sigue valiendo el socket? Decide con lo que se guardó al abrirlo y lo que
 * hay ahora. El anónimo no tiene sesión que revalidar: se mantiene (sus
 * permisos ya son los mínimos). Un cambio de rol, en cualquier sentido,
 * cierra: el cliente reconecta y se le autoriza con el rol nuevo.
 */
export function decidirSesion(
  socket: SesionDelSocket,
  actual: SesionActual | null,
  ahora: number
): DecisionDeSesion {
  if (!socket.userId) return { mantener: true, expiresAt: null };
  // Con usuario pero sin id de sesión no hay forma de revalidar: cerrar.
  if (!socket.sessionId) return { mantener: false, motivo: "sin-sesion" };
  if (!actual) return { mantener: false, motivo: "revocada" };
  if (actual.expiresAt <= ahora) return { mantener: false, motivo: "caducada" };
  if (actual.userId !== socket.userId) return { mantener: false, motivo: "otro-usuario" };
  if ((actual.role ?? null) !== (socket.userRole ?? null)) {
    return { mantener: false, motivo: "rol-cambiado" };
  }
  return { mantener: true, expiresAt: actual.expiresAt };
}

/** Un nombre que viene en un frame: texto, no vacío y con tope. */
function nombreValido(valor: unknown): valor is string {
  return typeof valor === "string" && valor.length > 0 && valor.length <= MAX_NOMBRE_EN_FRAME;
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
  /** Cola por canal: un evento que espera a su política no adelanta a otro. */
  private channelQueues = new Map<string, Promise<void>>();
  /** Barrido periódico de sesiones; solo existe mientras haya clientes. */
  private revalidationTimer: ReturnType<typeof setInterval> | null = null;

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
    userRole: string | null = null,
    session: { id: string | null; expiresAt: number | null } = { id: null, expiresAt: null }
  ): WSClient {
    const client: WSClient = {
      id: clientId,
      userId,
      userRole,
      sessionId: userId ? session.id : null,
      sessionExpiresAt: userId ? session.expiresAt : null,
      socket,
      channels: new Set(),
      rooms: new Set(),
    };
    this.clients.set(clientId, client);
    this.startRevalidation();
    console.log(`  📡 [WS] Client connected: ${clientId} (user: ${userId || "anonymous"})`);
    return client;
  }

  // ═══════════════════════════════════════════════════════════
  // Revalidación de sesión
  //
  // La identidad y el rol se leían UNA vez en el upgrade y valían toda la
  // vida del socket: una cuenta degradada o con la sesión revocada seguía
  // recibiendo datos (auditoría de seguridad, F15/F82). Ahora se revalida al
  // suscribirse y cada REVALIDAR_SESION_MS, y el socket se cierra si la
  // sesión ya no existe, caducó o el rol cambió.
  // ═══════════════════════════════════════════════════════════

  /**
   * Revalida un cliente. Devuelve `true` si sigue conectado. Si el
   * validador falla (sin DB), se cierra: falla cerrado, como el HTTP, que
   * sin sesión legible trata la petición como anónima.
   */
  async revalidateClient(clientId: string): Promise<boolean> {
    const client = this.clients.get(clientId);
    if (!client) return false;
    if (!client.userId) return true; // anónimo: nada que revalidar

    let actual: SesionActual | null;
    try {
      if (_sessionValidator && client.sessionId) {
        actual = await _sessionValidator(client.sessionId);
      } else {
        // Sin validador registrado: al menos la caducidad que se guardó.
        actual =
          client.sessionExpiresAt !== null
            ? { userId: client.userId, role: client.userRole, expiresAt: client.sessionExpiresAt }
            : null;
      }
    } catch (err) {
      console.warn(`  🔒 [WS] ${clientId}: session check failed (${errorMessage(err)})`);
      this.closeClient(clientId, "Session could not be verified");
      return false;
    }

    // El cliente pudo irse mientras se consultaba.
    if (!this.clients.has(clientId)) return false;

    const decision = decidirSesion(
      { userId: client.userId, userRole: client.userRole, sessionId: client.sessionId },
      actual,
      Date.now()
    );
    if (!decision.mantener) {
      console.warn(`  🔒 [WS] ${clientId} closed: session ${decision.motivo}`);
      this.closeClient(clientId, `Session ${decision.motivo}`);
      return false;
    }
    // better-auth alarga la sesión al usarla: se guarda la caducidad nueva.
    client.sessionExpiresAt = decision.expiresAt;
    return true;
  }

  /** Revalida todos los sockets con usuario (lo llama el barrido periódico). */
  async revalidateAll(): Promise<void> {
    const ids = [...this.clients.values()].filter((c) => c.userId).map((c) => c.id);
    await Promise.all(ids.map((id) => this.revalidateClient(id).catch(() => false)));
  }

  /** Cierra el socket y limpia su estado. Idempotente. */
  closeClient(clientId: string, reason: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;
    this.sendError(client.socket, reason);
    try {
      client.socket.close(CIERRE_SESION_INVALIDA, reason.slice(0, 120));
    } catch {
      // Ya cerrado
    }
    this.removeClient(clientId);
  }

  private startRevalidation(): void {
    if (this.revalidationTimer) return;
    this.revalidationTimer = setInterval(() => {
      this.revalidateAll().catch((err) => {
        console.warn(`  🔒 [WS] session sweep failed: ${errorMessage(err)}`);
      });
    }, REVALIDAR_SESION_MS);
    // El barrido no mantiene vivo el proceso por sí solo.
    (this.revalidationTimer as { unref?: () => void }).unref?.();
  }

  private stopRevalidationIfIdle(): void {
    if (this.clients.size > 0 || !this.revalidationTimer) return;
    clearInterval(this.revalidationTimer);
    this.revalidationTimer = null;
  }

  /** ¿Caducó ya la sesión guardada? (comprobación barata, sin DB). */
  private sessionExpired(client: WSClient): boolean {
    return (
      client.userId !== null &&
      client.sessionExpiresAt !== null &&
      client.sessionExpiresAt <= Date.now()
    );
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
    this.stopRevalidationIfIdle();
    console.log(`  📡 [WS] Client disconnected: ${clientId}`);
  }

  /**
   * Subscribe a client to a channel.
   */
  async subscribeToChannel(clientId: string, channel: string): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Validate channel format (table, entry, content channels)
    if (!nombreValido(channel) || !/^(table|entry|content):[a-zA-Z0-9_-]+$/.test(channel)) {
      this.sendError(client.socket, "Invalid channel format");
      return;
    }

    // La sesión se revalida ANTES de autorizar: el rol con el que se decide
    // tiene que ser el de ahora, no el del upgrade.
    if (!(await this.revalidateClient(clientId))) return;

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

    // Se fue (o se le cerró) mientras se autorizaba: no dejar un suscriptor huérfano.
    if (this.clients.get(clientId) !== client) return;

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

    // El preparador (lo cablea el host) puede necesitar refrescar la política
    // del canal antes de filtrar. Mientras haya un refresco pendiente, los
    // eventos de ese canal esperan en cola para no llegar desordenados.
    let preparando: void | Promise<void> = undefined;
    try {
      preparando = _channelPreparer?.(channel);
    } catch (err) {
      console.warn(`  🔒 [WS] channel prepare failed on ${channel}: ${errorMessage(err)}`);
    }
    const pendiente = this.channelQueues.get(channel);
    if (!preparando && !pendiente) {
      this.fanOut(channel, message);
      return;
    }

    const siguiente: Promise<void> = (pendiente ?? Promise.resolve())
      .then(() => preparando)
      .catch((err) => {
        // Sin política fresca el filtro deja pasar solo a quien no la necesita.
        console.warn(`  🔒 [WS] channel prepare failed on ${channel}: ${errorMessage(err)}`);
      })
      .then(() => this.fanOut(channel, message))
      .catch((err) => {
        console.warn(`  📡 [WS] broadcast failed on ${channel}: ${errorMessage(err)}`);
      })
      .then(() => {
        if (this.channelQueues.get(channel) === siguiente) this.channelQueues.delete(channel);
      });
    this.channelQueues.set(channel, siguiente);
  }

  /** Entrega un mensaje ya preparado a cada suscriptor que pueda verlo. */
  private fanOut(channel: string, message: string): void {
    const subscribers = this.channelSubscribers.get(channel);
    if (!subscribers || subscribers.size === 0) return;

    let data: unknown;
    try {
      data = JSON.parse(message);
    } catch {
      data = message;
    }

    for (const clientId of [...subscribers]) {
      const client = this.clients.get(clientId);
      if (!client) continue;

      // La sesión caducó entre dos barridos: no se entrega y se cierra.
      if (this.sessionExpired(client)) {
        this.closeClient(clientId, "Session caducada");
        continue;
      }

      // FILTRADO POR SUSCRIPTOR — no un fan-out ciego.
      // Entregar la misma fila a todos los suscritos al canal filtraría datos
      // entre usuarios (el mismo bug que tuvimos en GraphQL y en las entries
      // de datasets, pero en streaming). El filtro decide POR CLIENTE si esa
      // fila concreta le corresponde; sin filtro registrado, solo se entrega
      // a admins (deny-by-default).
      let visible: unknown = null;
      try {
        visible = _rowFilter
          ? _rowFilter(channel, data, { id: client.userId, role: client.userRole ?? null })
          : client.userRole === "admin"
            ? data
            : null;
      } catch (err) {
        // Un filtro que falla no entrega (y no corta a los demás suscriptores).
        console.warn(`  🔒 [WS] row filter failed on ${channel}: ${errorMessage(err)}`);
        visible = null;
      }

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
    if (!nombreValido(room) || !/^[a-zA-Z0-9_:-]+$/.test(room)) {
      this.sendError(client.socket, "Invalid room format");
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
    const client = this.clients.get(clientId);
    if (!client) return;

    // El frame viene de un cliente que puede ser anónimo: nada de lo que trae
    // se usa sin comprobar su tipo. Un `null`, un número o `{"channel": 1}`
    // lanzaban dentro de una promesa sin `catch` (auditoría de seguridad, F78).
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.sendError(client.socket, "Invalid JSON");
      return;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      this.sendError(client.socket, "Invalid message");
      return;
    }
    const msg = parsed as Record<string, unknown>;
    if (!nombreValido(msg.type)) {
      this.sendError(client.socket, "Invalid message type");
      return;
    }
    const type = msg.type as IncomingMessage["type"];

    const necesitaCanal = type === "subscribe" || type === "unsubscribe";
    const necesitaSala = type === "presence:join" || type === "presence:leave";
    if (necesitaCanal && !nombreValido(msg.channel)) {
      this.sendError(client.socket, "Invalid channel");
      return;
    }
    if (necesitaSala && !nombreValido(msg.room)) {
      this.sendError(client.socket, "Invalid room");
      return;
    }
    const channel = msg.channel as string;
    const room = msg.room as string;

    try {
      switch (type) {
        case "subscribe":
          this.subscribeToChannel(clientId, channel).catch((err) => {
            console.warn(`  📡 [WS] ${clientId} subscribe failed: ${errorMessage(err)}`);
            const vivo = this.clients.get(clientId);
            if (vivo) this.sendError(vivo.socket, "Subscription failed");
          });
          break;

        case "unsubscribe":
          this.unsubscribeFromChannel(clientId, channel);
          break;

        case "presence:join":
          this.joinPresenceRoom(clientId, room);
          break;

        case "presence:leave":
          this.leavePresenceRoom(clientId, room);
          break;

        case "ping":
          this.send(client.socket, { type: "pong", timestamp: Date.now() });
          break;

        default:
          this.sendError(client.socket, "Unknown message type");
      }
    } catch (err) {
      console.warn(`  📡 [WS] ${clientId} message failed: ${errorMessage(err)}`);
      this.sendError(client.socket, "Message failed");
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

/**
 * Prepara un canal antes de repartir un evento (p. ej. refrescar la política
 * caducada del dataset). Si devuelve una promesa, el evento espera a que
 * termine; los siguientes del mismo canal esperan detrás, en orden.
 */
export type ChannelPreparer = (channel: string) => void | Promise<void>;

/** Lee la sesión por id tal como está ahora (null si ya no existe). */
export type SessionValidator = (sessionId: string) => Promise<SesionActual | null>;

let _channelPreparer: ChannelPreparer | null = null;
let _sessionValidator: SessionValidator | null = null;

export function setChannelPreparer(fn: ChannelPreparer | null): void {
  _channelPreparer = fn;
}

/**
 * Registra cómo se revalida una sesión. Sin esto solo se comprueba la
 * caducidad guardada en el upgrade (no se ven revocaciones ni cambios de rol).
 */
export function setSessionValidator(fn: SessionValidator | null): void {
  _sessionValidator = fn;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
