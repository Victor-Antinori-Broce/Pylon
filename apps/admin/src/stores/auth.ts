/**
 * Auth Store (Pinia)
 *
 * Manages session state for the Admin Panel.
 * Uses Better-Auth's cookie-based sessions via fetch.
 */

import { defineStore } from "pinia";
import { ref, computed } from "vue";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface AuthUser {
    id: string;
    name: string;
    email: string;
    image?: string | null;
    role: string;
}

export const useAuthStore = defineStore("auth", () => {
    const user = ref<AuthUser | null>(null);
    const loading = ref(false);
    const error = ref<string | null>(null);
    const checked = ref(false); // has initial session check been done?

    const isLoggedIn = computed(() => !!user.value);
    const isAdmin = computed(() => user.value?.role === "admin");

    /**
     * Check current session (cookie-based)
     */
    async function checkSession() {
        loading.value = true;
        error.value = null;
        try {
            const res = await fetch(`${API_URL}/api/auth/get-session`, {
                credentials: "include",
            });
            if (!res.ok) {
                user.value = null;
                return;
            }
            const data = await res.json();
            user.value = data?.user || null;
        } catch {
            user.value = null;
        } finally {
            loading.value = false;
            checked.value = true;
        }
    }

    /**
     * Sign in with email + password
     */
    async function signIn(email: string, password: string) {
        loading.value = true;
        error.value = null;
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
            user.value = data?.user || null;
            return data;
        } catch (err: any) {
            error.value = err.message;
            throw err;
        } finally {
            loading.value = false;
        }
    }

    /**
     * Sign out
     */
    async function signOut() {
        try {
            await fetch(`${API_URL}/api/auth/sign-out`, {
                method: "POST",
                credentials: "include",
            });
        } catch {
            // ignore
        }
        user.value = null;
    }

    return {
        user,
        loading,
        error,
        checked,
        isLoggedIn,
        isAdmin,
        checkSession,
        signIn,
        signOut,
    };
});
