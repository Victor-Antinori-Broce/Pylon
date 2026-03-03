<!--
  UserMenu.vue — Public site user menu (Astro Island)

  State:
  - Logged out: Shows "Sign In" button
  - Logged in: Shows avatar + dropdown (profile, logout)
-->
<template>
  <div class="user-menu-wrapper">
    <!-- Loading / checking session -->
    <div v-if="checking" class="user-menu-skeleton" />

    <!-- Logged Out -->
    <button
      v-else-if="!user"
      @click="showLoginModal = true"
      class="sign-in-btn"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
        <polyline points="10 17 15 12 10 7"/>
        <line x1="15" y1="12" x2="3" y2="12"/>
      </svg>
      <span>Sign In</span>
    </button>

    <!-- Logged In -->
    <div v-else class="user-avatar-wrapper" ref="avatarRef">
      <button @click="dropdownOpen = !dropdownOpen" class="avatar-btn">
        <img
          v-if="user.image"
          :src="user.image"
          :alt="user.name"
          class="avatar-img"
        />
        <div v-else class="avatar-placeholder">
          {{ user.name?.[0]?.toUpperCase() || '?' }}
        </div>
      </button>

      <!-- Dropdown -->
      <Transition name="dropdown">
        <div v-if="dropdownOpen" class="user-dropdown">
          <div class="dropdown-header">
            <p class="dropdown-name">{{ user.name }}</p>
            <p class="dropdown-email">{{ user.email }}</p>
          </div>
          <div class="dropdown-divider" />
          <button @click="handleSignOut" class="dropdown-item dropdown-item-danger">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sign Out
          </button>
        </div>
      </Transition>
    </div>

    <!-- Login Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showLoginModal" class="login-overlay" @click.self="showLoginModal = false">
          <div class="login-modal">
            <div class="modal-header">
              <h3 class="modal-title">Sign In</h3>
              <button @click="showLoginModal = false" class="modal-close">✕</button>
            </div>

            <div v-if="errorMsg" class="modal-error">{{ errorMsg }}</div>

            <form @submit.prevent="handleEmailLogin" class="modal-form">
              <input
                v-model="loginEmail"
                type="email"
                placeholder="Email"
                class="modal-input"
                required
              />
              <input
                v-model="loginPassword"
                type="password"
                placeholder="Password"
                class="modal-input"
                required
              />
              <button type="submit" :disabled="loggingIn" class="modal-submit-btn">
                <span v-if="loggingIn" class="modal-spinner" />
                <span v-else>Sign In</span>
              </button>
            </form>

            <div class="modal-divider">
              <span>or</span>
            </div>

            <button @click="handleDiscordLogin" class="discord-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.8733.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286z"/>
              </svg>
              Continue with Discord
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";

interface AuthUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role: string;
}

const API_URL = import.meta.env.PUBLIC_API_URL || "http://localhost:3001";

const user = ref<AuthUser | null>(null);
const checking = ref(true);
const dropdownOpen = ref(false);
const showLoginModal = ref(false);
const loginEmail = ref("");
const loginPassword = ref("");
const loggingIn = ref(false);
const errorMsg = ref("");
const avatarRef = ref<HTMLElement | null>(null);

// Check session on mount
onMounted(async () => {
  try {
    const res = await fetch(`${API_URL}/api/auth/get-session`, {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      user.value = data?.user || null;
    }
  } catch {
    // not logged in
  } finally {
    checking.value = false;
  }

  document.addEventListener("click", handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});

function handleClickOutside(e: Event) {
  if (avatarRef.value && !avatarRef.value.contains(e.target as Node)) {
    dropdownOpen.value = false;
  }
}

async function handleEmailLogin() {
  loggingIn.value = true;
  errorMsg.value = "";
  try {
    const res = await fetch(`${API_URL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: loginEmail.value, password: loginPassword.value }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || "Invalid credentials");
    }
    const data = await res.json();
    user.value = data?.user || null;
    showLoginModal.value = false;
    loginEmail.value = "";
    loginPassword.value = "";
  } catch (err: any) {
    errorMsg.value = err.message;
  } finally {
    loggingIn.value = false;
  }
}

function handleDiscordLogin() {
  // Redirect to Discord OAuth flow
  window.location.href = `${API_URL}/api/auth/sign-in/social?provider=discord`;
}

async function handleSignOut() {
  try {
    await fetch(`${API_URL}/api/auth/sign-out`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // ignore
  }
  user.value = null;
  dropdownOpen.value = false;
}
</script>

<style scoped>
/* ── Sign In Button ── */
.sign-in-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}
.sign-in-btn:hover {
  background: rgba(0, 229, 255, 0.08);
  border-color: rgba(0, 229, 255, 0.15);
  color: #00E5FF;
}

/* ── Avatar ── */
.user-avatar-wrapper {
  position: relative;
}

.avatar-btn {
  background: none;
  border: 2px solid rgba(255, 255, 255, 0.06);
  border-radius: 50%;
  padding: 0;
  cursor: pointer;
  transition: border-color 0.2s;
}
.avatar-btn:hover {
  border-color: rgba(0, 229, 255, 0.3);
}

.avatar-img {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
}

.avatar-placeholder {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(0, 229, 255, 0.2), rgba(224, 64, 251, 0.2));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: 700;
  color: #fff;
}

/* ── Dropdown ── */
.user-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 220px;
  background: rgba(16, 16, 24, 0.95);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  z-index: 100;
}

.dropdown-header {
  padding: 12px 14px;
}

.dropdown-name {
  font-size: 0.8rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
}

.dropdown-email {
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.35);
  margin-top: 2px;
}

.dropdown-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.06);
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 14px;
  font-size: 0.75rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
  background: none;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}
.dropdown-item:hover {
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.8);
}

.dropdown-item-danger:hover {
  background: rgba(255, 42, 109, 0.08);
  color: #FF6B8A;
}

/* ── Skeleton ── */
.user-menu-skeleton {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.04);
  animation: pulse 1.5s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* ── Login Modal ── */
.login-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.login-modal {
  width: 100%;
  max-width: 360px;
  background: rgba(16, 16, 24, 0.95);
  backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 1rem;
  padding: 1.5rem;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.25rem;
}

.modal-title {
  font-size: 1rem;
  font-weight: 700;
  color: #fff;
}

.modal-close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.3);
  cursor: pointer;
  font-size: 1rem;
  padding: 4px;
}

.modal-error {
  padding: 8px 12px;
  margin-bottom: 1rem;
  border-radius: 8px;
  background: rgba(255, 42, 109, 0.08);
  border: 1px solid rgba(255, 42, 109, 0.15);
  color: #FF6B8A;
  font-size: 0.75rem;
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.modal-input {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.8rem;
  color: #fff;
  outline: none;
  transition: border-color 0.2s;
  font-family: inherit;
}
.modal-input::placeholder { color: rgba(255, 255, 255, 0.15); }
.modal-input:focus { border-color: rgba(0, 229, 255, 0.3); }

.modal-submit-btn {
  padding: 10px;
  border-radius: 8px;
  border: none;
  background: linear-gradient(135deg, #00E5FF, #00B8D4);
  color: #0a0a12;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
}
.modal-submit-btn:hover:not(:disabled) { transform: translateY(-1px); }
.modal-submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.modal-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(10, 10, 18, 0.3);
  border-top-color: #0a0a12;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.modal-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 1rem 0;
  color: rgba(255, 255, 255, 0.15);
  font-size: 0.65rem;
}
.modal-divider::before,
.modal-divider::after {
  content: "";
  flex: 1;
  height: 1px;
  background: rgba(255, 255, 255, 0.06);
}

/* ── Discord Button ── */
.discord-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid rgba(88, 101, 242, 0.2);
  background: rgba(88, 101, 242, 0.1);
  color: #7289DA;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}
.discord-btn:hover {
  background: rgba(88, 101, 242, 0.15);
  border-color: rgba(88, 101, 242, 0.3);
}

/* ── Transitions ── */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.15s ease;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.95);
}

.modal-enter-active,
.modal-leave-active {
  transition: all 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .login-modal,
.modal-leave-to .login-modal {
  transform: scale(0.95);
}
</style>
