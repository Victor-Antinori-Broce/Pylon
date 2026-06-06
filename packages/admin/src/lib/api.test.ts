import { describe, it, expect, vi, beforeEach } from "vitest";

import { api } from "./api";

describe("ApiClient", () => {
  const API_URL = "http://localhost:3001"; // Default API URL for tests

  beforeEach(() => {
    api.clearToken();
    vi.resetAllMocks();
  });

  describe("token management", () => {
    it("should set and get token", () => {
      api.setToken("test-token");
      expect(api.getToken()).toBe("test-token");
    });

    it("should store token in localStorage", () => {
      const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
      api.setToken("test-token");
      expect(setItemSpy).toHaveBeenCalledWith("gremius_token", "test-token");
    });

    it("should clear token", () => {
      api.setToken("test-token");
      api.clearToken();
      expect(api.getToken()).toBeNull();
    });
  });

  describe("HTTP methods", () => {
    it("should make GET request", async () => {
      const mockData = { id: "1", name: "Test" };
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      } as Response);

      const result = await api.get("/test");

      expect(global.fetch).toHaveBeenCalledWith(
        `${API_URL}/api/test`,
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        })
      );
      expect(result).toEqual(mockData);
    });

    it("should make POST request with body", async () => {
      const mockData = { id: "1", name: "Test" };
      const body = { name: "Test" };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      } as Response);

      await api.post("/test", body);

      expect(global.fetch).toHaveBeenCalledWith(
        `${API_URL}/api/test`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(body),
        })
      );
    });

    it("should include auth header when token exists", async () => {
      api.setToken("test-token");

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      await api.get("/test");

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        })
      );
    });

    it("should throw error on failed request", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: async () => ({ error: "Resource not found" }),
      } as Response);

      await expect(api.get("/test")).rejects.toThrow("Resource not found");
    });

    it("should not set Content-Type for FormData", async () => {
      const formData = new FormData();
      formData.append("file", new Blob(["test"]), "test.txt");

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "1" }),
      } as Response);

      await api.post("/upload", formData);

      const callArgs = vi.mocked(global.fetch).mock.calls[0];
      const headers = callArgs[1]?.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBeUndefined();
    });
  });

  describe("convenience methods", () => {
    it("should get games with params", async () => {
      const mockResponse = { docs: [], totalDocs: 0 };
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await api.getGames({ limit: 10, page: 2, search: "test" });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/games?limit=10&page=2&search=test"),
        expect.any(Object)
      );
    });

    it("should upload media with FormData", async () => {
      const mockResponse = { id: "1", url: "http://example.com/image.jpg" };
      const file = new File(["test"], "test.jpg", { type: "image/jpeg" });

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await api.uploadMedia(file, "Test alt");

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        `${API_URL}/api/media/upload`,
        expect.objectContaining({
          method: "POST",
          body: expect.any(FormData),
        })
      );
    });
  });
});
