/**
 * Auth Store (Svelte 5 Runes)
 *
 * Manages session state for the Admin Panel.
 * Uses Better-Auth's cookie-based sessions via fetch.
 */

// In production (Docker): VITE_API_URL is "" — fetch uses relative URLs
// which nginx proxies to the API container internally. Same-origin cookies.
// In development: VITE_API_URL is "http://localhost:3001" (set in packages/admin/.env)
const API_URL = import.meta.env.VITE_API_URL ?? "";

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
    console.log(`[auth] checkSession → GET ${API_URL}/api/auth/get-session`);
    const res = await fetch(`${API_URL}/api/auth/get-session`, {
      credentials: "include",
    });
    console.log(`[auth] checkSession response: ${res.status} ${res.statusText}`);
    if (!res.ok) {
      console.warn(`[auth] checkSession failed with status ${res.status}, clearing user`);
      user = null;
      return;
    }
    const data = await res.json();
    console.log(`[auth] checkSession data:`, JSON.stringify(data?.user ? { id: data.user.id, role: data.user.role, name: data.user.name } : null));
    user = data?.user || null;
  } catch (err) {
    console.error(`[auth] checkSession error:`, err);
    user = null;
  } finally {
    loading = false;
    checked = true;
    console.log(`[auth] checkSession done → user=${user?.name || 'null'}, role=${user?.role || 'null'}, loggedIn=${!!user}`);
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
    // Better-Auth sign-in response may not include additionalFields (e.g. role).
    // We set the user from sign-in response as a preliminary value.
    // The caller should follow up with checkSession() to get the full user.
    if (data?.user) {
      user = data.user;
    }
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
