/**
 * API Client Composable
 */
import { ref } from "vue";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export function useApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function get<T>(path: string): Promise<T> {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch(`${API_URL}/api${path}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err: any) {
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function post<T>(path: string, body: unknown): Promise<T> {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch(`${API_URL}/api${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err: any) {
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function patch<T>(path: string, body: unknown): Promise<T> {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch(`${API_URL}/api${path}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err: any) {
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function del<T>(path: string): Promise<T> {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch(`${API_URL}/api${path}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err: any) {
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function upload(path: string, file: File, fields?: Record<string, string>) {
    loading.value = true;
    error.value = null;
    try {
      const form = new FormData();
      form.append("file", file);
      if (fields) for (const [k, v] of Object.entries(fields)) form.append(k, v);
      const res = await fetch(`${API_URL}/api${path}`, { method: "POST", body: form, credentials: "include" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err: any) {
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  return { get, post, patch, del, upload, loading, error, API_URL };
}
