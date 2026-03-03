<script lang="ts">
  import { checkInit, checkSession } from "../../lib/auth.svelte";
  
  let name = $state("");
  let email = $state("");
  let password = $state("");
  let error = $state<string | null>(null);
  let loading = $state(false);

  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

  async function handleSetup(e: Event) {
    e.preventDefault();
    loading = true;
    error = null;
    
    try {
      const res = await fetch(`${API_URL}/api/system/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Need credentials to save the auth cookie the backend sets
        credentials: "include",
        body: JSON.stringify({ name, email, password }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Launch sequence failed.");
      }
      
      // Setup successful!
      // Update the initialization state
      await checkInit();
      // Fetch the newly created session
      await checkSession();
      // Layout component reactive logic will then show the admin panel!
    } catch (err: any) {
      error = err.message || "An unexpected error occurred.";
    } finally {
      loading = false;
    }
  }
</script>

<div class="login-bg">
  <div class="grid-overlay"></div>

  <div class="login-card">
    <div class="brand">
      <div class="brand-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2"/>
          <polyline points="2 17 12 22 22 17"/>
          <polyline points="2 12 12 17 22 12"/>
        </svg>
      </div>
      <h1 class="brand-name">System Init</h1>
      <p class="brand-sub">Create master admin</p>
    </div>

    {#if error}
      <div class="error-banner">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        {error}
      </div>
    {/if}

    <form onsubmit={handleSetup} class="login-form">
      <div class="field">
        <label class="field-label" for="name">Display Name</label>
        <input
          bind:value={name}
          type="text"
          id="name"
          placeholder="System Admin"
          class="field-input"
          required
        />
      </div>
      <div class="field">
        <label class="field-label" for="email">Admin Email</label>
        <input
          bind:value={email}
          type="email"
          id="email"
          placeholder="admin@gremius.gg"
          class="field-input"
          required
        />
      </div>
      <div class="field">
        <label class="field-label" for="password">Master Password</label>
        <input
          bind:value={password}
          type="password"
          id="password"
          placeholder="••••••••"
          class="field-input"
          minlength="8"
          required
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        class="login-btn mt-2"
      >
        {#if loading}
          <span class="spinner"></span>
        {:else}
          <span>Initialize Registry</span>
        {/if}
      </button>
    </form>

    <p class="login-hint">
      This action seals the installation.
    </p>
  </div>
</div>

<style>
/* Same styles as LoginView but tweaked slightly */
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

.login-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 400px; /* Slightly wider for the extra fields */
  padding: 2.5rem 2rem;
  background: rgba(16, 16, 24, 0.7);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(0, 229, 255, 0.08);
  border-radius: 1.25rem;
  box-shadow: 0 0 80px rgba(0, 229, 255, 0.05), inset 0 0 60px rgba(0, 0, 0, 0.3);
}

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

.login-btn {
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

.mt-2 {
  margin-top: 0.5rem;
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

.login-hint {
  text-align: center;
  font-size: 0.6rem;
  color: rgba(255, 255, 255, 0.15);
  margin-top: 1.5rem;
}
</style>
