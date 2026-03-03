import type { PaginatedResponse, Game, BlogPost, Platform, Tag, Streamer, Media, SiteSettings, AuthResponse } from "$types";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
    localStorage.setItem("gremius_token", token);
  }

  getToken(): string | null {
    if (!this.token) this.token = localStorage.getItem("gremius_token");
    return this.token;
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem("gremius_token");
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...((options.headers as Record<string, string>) || {}),
    };

    if (!(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    const token = this.getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${API}/api${path}`, { ...options, headers });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || err.detail || `HTTP ${res.status}`);
    }

    return res.json();
  }

  // ── Generic HTTP Methods ──
  async get<T>(path: string, options?: RequestInit): Promise<T> {
    return this.request<T>(path, { ...options, method: "GET" });
  }

  async post<T>(path: string, body?: any, options?: RequestInit): Promise<T> {
    return this.request<T>(path, { ...options, method: "POST", body: body ? JSON.stringify(body) : undefined });
  }

  async patch<T>(path: string, body?: any, options?: RequestInit): Promise<T> {
    return this.request<T>(path, { ...options, method: "PATCH", body: body ? JSON.stringify(body) : undefined });
  }

  async delete<T>(path: string, options?: RequestInit): Promise<T> {
    return this.request<T>(path, { ...options, method: "DELETE" });
  }

  // ── Auth ──
  login(email: string, password: string) {
    return this.request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  register(email: string, password: string, displayName: string) {
    return this.request<any>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, displayName }),
    });
  }

  // ── Games ──
  getGames(params?: { limit?: number; page?: number; search?: string; status?: string }) {
    const q = new URLSearchParams();
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.page) q.set("page", String(params.page));
    if (params?.search) q.set("search", params.search);
    if (params?.status) q.set("status", params.status);
    return this.request<PaginatedResponse<Game>>(`/games?${q}`);
  }

  getGame(id: string) { return this.request<Game>(`/games/${id}`); }
  getGameBySlug(slug: string) { return this.request<Game>(`/games/slug/${slug}`); }
  createGame(data: Partial<Game>) { return this.request<Game>("/games", { method: "POST", body: JSON.stringify(data) }); }
  updateGame(id: string, data: Partial<Game>) { return this.request<Game>(`/games/${id}`, { method: "PATCH", body: JSON.stringify(data) }); }
  deleteGame(id: string) { return this.request<{ deleted: boolean }>(`/games/${id}`, { method: "DELETE" }); }

  // ── Blog Posts ──
  getPosts(params?: { limit?: number; page?: number; status?: string }) {
    const q = new URLSearchParams();
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.page) q.set("page", String(params.page));
    if (params?.status) q.set("status", params.status);
    return this.request<PaginatedResponse<BlogPost>>(`/blog?${q}`);
  }

  getPost(id: string) { return this.request<BlogPost>(`/blog/${id}`); }
  getPostBySlug(slug: string) { return this.request<BlogPost>(`/blog/slug/${slug}`); }
  createPost(data: Partial<BlogPost>) { return this.request<BlogPost>("/blog", { method: "POST", body: JSON.stringify(data) }); }
  updatePost(id: string, data: Partial<BlogPost>) { return this.request<BlogPost>(`/blog/${id}`, { method: "PATCH", body: JSON.stringify(data) }); }
  deletePost(id: string) { return this.request<{ deleted: boolean }>(`/blog/${id}`, { method: "DELETE" }); }

  // ── Platforms / Tags ──
  getPlatforms() { return this.request<PaginatedResponse<Platform>>("/platforms"); }
  createPlatform(data: Partial<Platform>) { return this.request<Platform>("/platforms", { method: "POST", body: JSON.stringify(data) }); }
  getTags() { return this.request<PaginatedResponse<Tag>>("/tags"); }
  createTag(data: Partial<Tag>) { return this.request<Tag>("/tags", { method: "POST", body: JSON.stringify(data) }); }

  // ── Streamers ──
  getStreamers() { return this.request<PaginatedResponse<Streamer>>("/streamers"); }
  createStreamer(data: Partial<Streamer>) { return this.request<Streamer>("/streamers", { method: "POST", body: JSON.stringify(data) }); }

  // ── Media ──
  getMedia(params?: { limit?: number; page?: number }) {
    const q = new URLSearchParams();
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.page) q.set("page", String(params.page));
    return this.request<PaginatedResponse<Media>>(`/media?${q}`);
  }

  uploadMedia(file: File, alt?: string) {
    const form = new FormData();
    form.append("file", file);
    if (alt) form.append("alt", alt);
    return this.request<Media>("/media/upload", { method: "POST", body: form });
  }

  deleteMedia(id: string) { return this.request<{ deleted: boolean }>(`/media/${id}`, { method: "DELETE" }); }

  // ── Settings ──
  getSettings() { return this.request<SiteSettings>("/settings"); }
  updateSettings(data: Partial<SiteSettings>) { return this.request<SiteSettings>("/settings", { method: "PATCH", body: JSON.stringify(data) }); }

  // ── Health ──
  health() { return this.request<{ status: string }>("/health"); }
}

export const api = new ApiClient();
