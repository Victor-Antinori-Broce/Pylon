/**
 * Auth Store (Svelte 5 Runes)
 *
 * Manages session state for the Admin Panel.
 * Uses Better-Auth's cookie-based sessions via fetch.
 */

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role: string;
}

// Svelte 5 Runes for state
let user = $state<AuthUser | null>(null);
let loading = $state(false);
let error = $state<string | null>(null);
let checked = $state(false);
let initialized = $state(true); // Default to true to prevent flash of setup screen

// Getters for readonly access (cannot export derived directly)
export function getUser() { return user; }
export function getLoading() { return loading; }
export function getError() { return error; }
export function getChecked() { return checked; }
export function isLoggedIn() { return !!user; }
export function isAdmin() { return user?.role === "admin"; }
export function isInitialized() { return initialized; }

/**
 * Check if the system is initialized (has at least one user)
 */
export async function checkInit() {
  try {
    const res = await fetch(`${API_URL}/api/system/init-check`);
    const data = await res.json();
    if (data.initialized !== undefined) {
      initialized = data.initialized;
    }
  } catch {
    initialized = true; // Fallback assumption
  }
}

/**
 * Check current session (cookie-based)
 */
export async function checkSession() {
  loading = true;
  error = null;
  try {
    const res = await fetch(`${API_URL}/api/auth/get-session`, {
      credentials: "include",
    });
    if (!res.ok) {
      user = null;
      return;
    }
    const data = await res.json();
    user = data?.user || null;
  } catch {
    user = null;
  } finally {
    loading = false;
    checked = true;
  }
}

/**
 * Sign in with email + password
 */
export async function signIn(email: string, password: string) {
  loading = true;
  error = null;
  try {
    const res = await fetch(`${API_URL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || body.error || "Invalid credentials");
    }

    const data = await res.json();
    user = data?.user || null;
    return data;
  } catch (err: any) {
    error = err.message;
    throw err;
  } finally {
    loading = false;
  }
}

/**
 * Sign out
 */
export async function signOut() {
  try {
    await fetch(`${API_URL}/api/auth/sign-out`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // ignore
  }
  user = null;
}
