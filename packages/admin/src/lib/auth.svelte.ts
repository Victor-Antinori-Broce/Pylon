import { t } from "$lib/i18n";
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
let setupTokenRequired = $state(false);

// Getters for readonly access (cannot export derived directly)
export function getUser() {
  return user;
}
export function getLoading() {
  return loading;
}
export function getError() {
  return error;
}
export function getChecked() {
  return checked;
}
export function isLoggedIn() {
  return !!user;
}
export function isAdmin() {
  return user?.role === "admin";
}
/**
 * Quien puede usar el panel: `admin` o `editor` (el «staff» de la API, ver
 * apps/api/src/middleware/auth-guard.ts). El editor gestiona contenido —blog,
 * medios, páginas— y no ve la parte de sistema. Antes el login solo admitía
 * admin, así que dar el rol de editor desde Ajustes no servía para nada.
 */
export function isStaff() {
  return user?.role === "admin" || user?.role === "editor";
}
export function isInitialized() {
  return initialized;
}
/** The API asks for the one-time token printed in its log (production, public mode). */
export function needsSetupToken() {
  return setupTokenRequired;
}

/**
 * Check if the system is initialized (has at least one administrator)
 */
export async function checkInit() {
  try {
    const res = await fetch(`${API_URL}/api/system/init-check`);
    const data = await res.json();
    if (data.initialized !== undefined) {
      initialized = data.initialized;
    }
    setupTokenRequired = data.setupTokenRequired === true;
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
      console.warn(`[auth] checkSession failed with status ${res.status}, clearing user`);
      user = null;
      return;
    }
    const data = await res.json();
    user = data?.user || null;
  } catch (err) {
    console.error(`[auth] checkSession error:`, err);
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
      /**
       * Se conserva el `code` además del texto. Con la verificación de email
       * obligatoria, «contraseña incorrecta» y «tienes que confirmar tu email»
       * piden cosas distintas —la segunda, un botón para reenviar el enlace—
       * y sin el código solo quedaba comparar el mensaje en inglés.
       */
      const fallo = new Error(body.message || body.error || t("auth.credencialesInvalidas")) as Error & {
        code?: string;
      };
      fallo.code = body.code;
      throw fallo;
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
 * Pide el correo para restablecer la contraseña.
 *
 * `redirectTo` es la raíz del panel: sin sesión, el panel pinta el login en
 * cualquier ruta, y es el propio login quien reconoce el `?token=` con el que
 * better-auth vuelve. Una ruta `/reset-password` aparte quedaría tapada.
 *
 * No se distingue «no existe esa cuenta» de «enviado»: decirlo permitiría
 * averiguar qué emails están registrados probando direcciones.
 */
export async function requestPasswordReset(email: string) {
  const res = await fetch(`${API_URL}/api/auth/request-password-reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, redirectTo: `${window.location.origin}/` }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || t("auth.noSePudoSolicitarRestablecimiento"));
  }
}

/** Fija la contraseña nueva con el token del enlace. */
export async function resetPassword(token: string, newPassword: string) {
  const res = await fetch(`${API_URL}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ token, newPassword }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || t("auth.noSePudoCambiarContrasena"));
  }
}

/** Reenvía el enlace de verificación a quien no pudo entrar por no tenerlo. */
export async function resendVerification(email: string) {
  const res = await fetch(`${API_URL}/api/auth/send-verification-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, callbackURL: `${window.location.origin}/` }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || t("auth.noSePudoReenviarCorreo"));
  }
}

export interface SocialProvider {
  id: string;
  label: string;
}

let socialProviders = $state<SocialProvider[]>([]);
export function getSocialProviders() {
  return socialProviders;
}

/**
 * Pregunta al servidor QUÉ proveedores OAuth están configurados.
 *
 * Se pregunta en vez de tener la lista escrita en el cliente porque un botón
 * de un proveedor sin credenciales no falla al pulsarlo: falla DESPUÉS del
 * redirect, en una página de Discord o Google que ya no es nuestra, con un
 * error que no explica nada.
 */
export async function loadSocialProviders() {
  try {
    const res = await fetch(`${API_URL}/api/system/auth-providers`);
    if (!res.ok) return;
    const data = await res.json();
    socialProviders = Array.isArray(data?.social) ? data.social : [];
  } catch {
    socialProviders = [];
  }
}

/**
 * Entrar con un proveedor social.
 *
 * No devuelve nada: `sign-in/social` responde con la URL de autorización y el
 * navegador se va del sitio. Al volver, el callback deja la cookie de sesión y
 * el arranque normal (`checkSession`) decide si esa cuenta puede entrar aquí.
 */
export async function signInWithProvider(providerId: string, callbackURL = "/") {
  loading = true;
  error = null;
  try {
    const res = await fetch(`${API_URL}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ provider: providerId, callbackURL }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.url) {
      throw new Error(
        data?.message || data?.error || t("auth.noSePudoIniciarSesionCon", { providerId })
      );
    }

    window.location.href = data.url;
  } catch (err: any) {
    error = err.message;
    loading = false;
    throw err;
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
