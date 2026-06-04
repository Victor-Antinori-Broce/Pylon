/**
 * GremiusCMS — Real-time Test Suite
 *
 * Tests WebSocket connection, channel subscription, ping/pong,
 * presence system, and error handling.
 */

import { describe, it, expect, beforeAll } from "bun:test";

const WS_URL = process.env.WS_URL || "ws://localhost:3001/api/realtime";
let wsAvailable = false;

describe("Real-time WebSocket", () => {
  beforeAll(async () => {
    // Quick check if WebSocket server is available
    const ws = new WebSocket(WS_URL);
    wsAvailable = await Promise.race([
      new Promise<boolean>((resolve) => {
        ws.onopen = () => { ws.close(); resolve(true); };
        ws.onerror = () => resolve(false);
      }),
      new Promise<boolean>((resolve) => setTimeout(() => { ws.close(); resolve(false); }, 1000)),
    ]);
  });
  it("should connect to WebSocket server", async () => {
    if (!wsAvailable) {
      console.log("⏭️ Skipping WebSocket tests — server not available");
      return;
    }
    const ws = new WebSocket(WS_URL);

    const result = await Promise.race([
      new Promise<boolean>((resolve) => {
        ws.onopen = () => {
          ws.onmessage = (event) => {
            try {
              const msg = JSON.parse(event.data as string);
              if (msg.type === "connected" && msg.clientId) {
                ws.close();
                resolve(true);
              }
            } catch {
              ws.close();
              resolve(false);
            }
          };
        };
        ws.onerror = () => {
          resolve(false);
        };
      }),
      new Promise<boolean>((resolve) => setTimeout(() => { ws.close(); resolve(false); }, 3000)),
    ]);

    expect(result).toBe(true);
  });

  it("should subscribe to a channel", async () => {
    if (!wsAvailable) return;
    const ws = new WebSocket(WS_URL);

    const result = await Promise.race([
      new Promise<boolean>((resolve) => {
        ws.onmessage = (event) => {
          const msg = JSON.parse(event.data as string);
          if (msg.type === "connected") {
            ws.send(JSON.stringify({ type: "subscribe", channel: "table:test-dataset" }));
          }
          if (msg.type === "subscribed" && msg.channel === "table:test-dataset") {
            ws.close();
            resolve(true);
          }
        };
        ws.onerror = () => resolve(false);
      }),
      new Promise<boolean>((resolve) => setTimeout(() => { ws.close(); resolve(false); }, 3000)),
    ]);

    expect(result).toBe(true);
  });

  it("should handle ping/pong heartbeat", async () => {
    if (!wsAvailable) return;
    const ws = new WebSocket(WS_URL);

    const result = await Promise.race([
      new Promise<boolean>((resolve) => {
        ws.onmessage = (event) => {
          const msg = JSON.parse(event.data as string);
          if (msg.type === "connected") {
            ws.send(JSON.stringify({ type: "ping" }));
          }
          if (msg.type === "pong" && msg.timestamp) {
            ws.close();
            resolve(true);
          }
        };
        ws.onerror = () => resolve(false);
      }),
      new Promise<boolean>((resolve) => setTimeout(() => { ws.close(); resolve(false); }, 3000)),
    ]);

    expect(result).toBe(true);
  });

  it("should handle presence system", async () => {
    if (!wsAvailable) return;
    const ws = new WebSocket(WS_URL);

    const result = await Promise.race([
      new Promise<boolean>((resolve) => {
        ws.onmessage = (event) => {
          const msg = JSON.parse(event.data as string);
          if (msg.type === "connected") {
            ws.send(JSON.stringify({ type: "presence:join", room: "test-room" }));
          }
          if (msg.type === "presence" && msg.room === "test-room") {
            if (msg.count >= 1 && Array.isArray(msg.users)) {
              ws.close();
              resolve(true);
            }
          }
        };
        ws.onerror = () => resolve(false);
      }),
      new Promise<boolean>((resolve) => setTimeout(() => { ws.close(); resolve(false); }, 3000)),
    ]);

    expect(result).toBe(true);
  });

  it("should handle invalid JSON gracefully", async () => {
    if (!wsAvailable) return;
    const ws = new WebSocket(WS_URL);

    const result = await Promise.race([
      new Promise<boolean>((resolve) => {
        ws.onmessage = (event) => {
          const msg = JSON.parse(event.data as string);
          if (msg.type === "connected") {
            ws.send("not valid json {{{");
          }
          if (msg.type === "error") {
            ws.close();
            resolve(true);
          }
        };
        ws.onerror = () => resolve(false);
      }),
      new Promise<boolean>((resolve) => setTimeout(() => { ws.close(); resolve(false); }, 3000)),
    ]);

    expect(result).toBe(true);
  });
});
