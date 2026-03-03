<script lang="ts">
  import { goto } from "$app/navigation";
  import { signIn, signOut, getLoading, getError, isLoggedIn, isAdmin } from "../../lib/auth.svelte";
  
  let email = $state("");
  let password = $state("");
  let localError = $state<string | null>(null);
  
  const loading = $derived(getLoading());
  const storeError = $derived(getError());
  const error = $derived(localError || storeError);
  
  async function handleLogin(e: Event) {
    e.preventDefault();
    localError = null;
    
    try {
      await signIn(email, password);
      
      // Check if the user has admin role
      if (!isAdmin()) {
        localError = "Access denied — admin role required";
        await signOut();
        return;
      }
      
      goto("/");
    } catch {
      // error is already set in the store
    }
  }
</script>

<!--
  LoginView.svelte — Admin Panel Login
  Cyberpunk glassmorphism aesthetic, centered card.
-->
<div class="login-bg">
  <!-- Animated grid background -->
  <div class="grid-overlay"></div>

  <div class="login-card">
    <!-- Logo / Brand -->
    <div class="brand">
      <div class="brand-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      </div>
      <h1 class="brand-name">Gremius</h1>
      <p class="brand-sub">Admin Console</p>
    </div>

    <!-- Error -->
    {#if error}
      <div class="error-banner">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        {error}
      </div>
    {/if}

    <!-- Form -->
    <form onsubmit={handleLogin} class="login-form">
      <div class="field">
        <label class="field-label" for="email">Email</label>
        <input
          bind:value={email}
          type="email"
          id="email"
          placeholder="admin@gremius.gg"
          class="field-input"
          autocomplete="email"
          required
        />
      </div>
      <div class="field">
        <label class="field-label" for="password">Password</label>
        <input
          bind:value={password}
          type="password"
          id="password"
          placeholder="••••••••"
          class="field-input"
          autocomplete="current-password"
          required
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        class="login-btn"
      >
        {#if loading}
          <span class="spinner"></span>
        {:else}
          <span>Sign In</span>
        {/if}
      </button>
    </form>

    <p class="login-hint">
      Built with Better-Auth 🔐
    </p>
  </div>
</div>

<style>
/* ── Background ── */
.login-bg {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0a0a12;
  overflow: hidden;
}

.grid-overlay {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(0, 229, 255, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 229, 255, 0.03) 1px, transparent 1px);
  background-size: 60px 60px;
  animation: drift 20s linear infinite;
}

@keyframes drift {
  from { transform: translate(0, 0); }
  to { transform: translate(60px, 60px); }
}

/* ── Card ── */
.login-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 380px;
  padding: 2.5rem 2rem;
  background: rgba(16, 16, 24, 0.7);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(0, 229, 255, 0.08);
  border-radius: 1.25rem;
  box-shadow: 0 0 80px rgba(0, 229, 255, 0.05), inset 0 0 60px rgba(0, 0, 0, 0.3);
}

/* ── Brand ── */
.brand {
  text-align: center;
  margin-bottom: 2rem;
}

.brand-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(0, 229, 255, 0.12), rgba(0, 229, 255, 0.03));
  border: 1px solid rgba(0, 229, 255, 0.15);
  color: #00E5FF;
  margin-bottom: 1rem;
}

.brand-name {
  font-size: 1.375rem;
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.02em;
}

.brand-sub {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: rgba(255, 255, 255, 0.3);
  margin-top: 4px;
}

/* ── Error ── */
.error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  margin-bottom: 1.25rem;
  border-radius: 10px;
  background: rgba(255, 42, 109, 0.08);
  border: 1px solid rgba(255, 42, 109, 0.15);
  color: #FF6B8A;
  font-size: 0.75rem;
  font-weight: 500;
}

/* ── Form ── */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.35);
}

.field-input {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  padding: 12px 14px;
  font-size: 0.85rem;
  color: #fff;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  font-family: inherit;
}

.field-input::placeholder {
  color: rgba(255, 255, 255, 0.15);
}

.field-input:focus {
  border-color: rgba(0, 229, 255, 0.3);
  box-shadow: 0 0 0 3px rgba(0, 229, 255, 0.06);
}

/* ── Button ── */
.login-btn {
  margin-top: 0.5rem;
  width: 100%;
  padding: 12px;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg, #00E5FF, #00B8D4);
  color: #0a0a12;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-family: inherit;
}

.login-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 24px rgba(0, 229, 255, 0.2);
}

.login-btn:active:not(:disabled) {
  transform: translateY(0);
}

.login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(10, 10, 18, 0.3);
  border-top-color: #0a0a12;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ── Hint ── */
.login-hint {
  text-align: center;
  font-size: 0.6rem;
  color: rgba(255, 255, 255, 0.15);
  margin-top: 1.5rem;
}
</style>
