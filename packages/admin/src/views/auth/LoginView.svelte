<script lang="ts">
  import {
    signIn,
    signOut,
    signInWithProvider,
    loadSocialProviders,
    getSocialProviders,
    checkSession,
    getLoading,
    getError,
    isLoggedIn,
    isAdmin,
    requestPasswordReset,
    resetPassword,
    resendVerification,
  } from "../../lib/auth.svelte";

  import { goto } from "$app/navigation";

  let email = $state("");
  let password = $state("");
  let localError = $state<string | null>(null);

  const loading = $derived(getLoading());
  const storeError = $derived(getError());
  const error = $derived(localError || storeError);
  const providers = $derived(getSocialProviders());

  /**
   * Qué enseña la tarjeta: entrar, pedir el enlace de reseteo, o fijar la
   * contraseña nueva.
   *
   * Los tres viven AQUÍ y no en rutas propias porque, sin sesión, el panel
   * pinta este login en cualquier ruta: una página `/reset-password` quedaría
   * tapada por él. better-auth vuelve del enlace a la raíz con `?token=`, y es
   * este componente quien lo reconoce.
   *
   * Antes no existía nada de esto: la verificación era imposible de pedir de
   * nuevo y la recuperación de contraseña no tenía ni botón ni formulario, así
   * que los correos habrían llevado a ninguna parte.
   */
  let modo = $state<"entrar" | "olvido" | "nueva">("entrar");
  let aviso = $state<string | null>(null);
  let pendienteDeVerificar = $state(false);
  let resetToken = $state<string | null>(null);
  let nuevaPassword = $state("");
  let repetirPassword = $state("");
  let enviando = $state(false);

  // Fuera del modo «entrar», un error viejo del store no tiene nada que ver
  // con lo que se está haciendo.
  const errorVisible = $derived(modo === "entrar" ? error : localError);

  // Se lee la URL una vez. No se lee ningún estado reactivo aquí dentro, así
  // que el efecto no puede volver a dispararse con lo que escribe.
  $effect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token) {
      resetToken = token;
      modo = "nueva";
    }
    if (params.get("error") === "INVALID_TOKEN") {
      localError = "El enlace ha caducado o ya se usó. Pide uno nuevo.";
      modo = "olvido";
    }
  });

  // Los botones sociales los dicta el servidor: pintar uno sin credenciales
  // configuradas solo falla DESPUÉS del redirect, ya fuera del sitio.
  $effect(() => {
    void loadSocialProviders();
  });

  const PROVIDER_STYLE: Record<string, { color: string; icon: string }> = {
    // Blurple de Discord: es la marca por la que se reconoce el botón.
    discord: {
      color: "#5865f2",
      icon: "M20.3 4.5A19.8 19.8 0 0 0 15.4 3l-.2.5c1.6.4 2.9 1 4.1 1.8a13.7 13.7 0 0 0-10.6 0A12 12 0 0 1 12.8 3.5L12.6 3a19.8 19.8 0 0 0-4.9 1.5C4.5 9.2 3.7 13.7 4.1 18.2a19.9 19.9 0 0 0 6 3l1.2-2c-.7-.2-1.3-.5-1.9-.9l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.2.7-1.9 1l1.2 1.9a19.9 19.9 0 0 0 6-3c.5-5.2-.8-9.7-3.6-13.7ZM9.7 15.5c-1.2 0-2.1-1.1-2.1-2.4 0-1.3.9-2.4 2.1-2.4s2.2 1.1 2.2 2.4c0 1.3-1 2.4-2.2 2.4Zm4.6 0c-1.2 0-2.1-1.1-2.1-2.4 0-1.3.9-2.4 2.1-2.4s2.2 1.1 2.2 2.4c0 1.3-1 2.4-2.2 2.4Z",
    },
    github: {
      color: "#24292f",
      icon: "M12 2A10 10 0 0 0 8.8 21.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.7.4-1.1.6-1.4-2.2-.2-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.6 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.3.2 2.3.1 2.6.6.7 1 1.6 1 2.7 0 3.9-2.4 4.8-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2Z",
    },
    google: {
      color: "#ea4335",
      icon: "M12 11v2.9h4.1a3.6 3.6 0 0 1-1.5 2.3l2.4 1.9c1.4-1.3 2.2-3.2 2.2-5.5 0-.5 0-1-.1-1.5H12Zm-6.6 1.9-.5 2.1-2.1.1A9 9 0 0 1 12 3c2.3 0 4.4.9 6 2.3l-2.5 2.5A5.4 5.4 0 0 0 6.9 10a5.4 5.4 0 0 0-1.5 2.9ZM12 21c-3.5 0-6.5-2-8-4.9l3.4-2.7A5.4 5.4 0 0 0 12 17c1 0 2-.3 2.8-.8l2.5 1.9A9 9 0 0 1 12 21Z",
    },
    microsoft: {
      color: "#00a4ef",
      icon: "M3 3h8.5v8.5H3V3Zm9.5 0H21v8.5h-8.5V3ZM3 12.5h8.5V21H3v-8.5Zm9.5 0H21V21h-8.5v-8.5Z",
    },
  };

  async function handleSocial(providerId: string) {
    localError = null;
    try {
      await signInWithProvider(providerId, window.location.origin);
    } catch {
      // el error ya está en el store
    }
  }

  async function handleLogin(e: Event) {
    e.preventDefault();
    localError = null;

    try {
      const signInResult = await signIn(email, password);

      // Better-Auth sign-in may not return additionalFields (like role).
      // Fetch the full session to get the complete user object with role.
      await checkSession();

      // Check if the user has admin role
      if (!isAdmin()) {
        console.warn("[login] User is NOT admin, signing out. Role:", signInResult?.user?.role);
        localError = "Access denied \u2014 admin role required";
        await signOut();
        return;
      }

      goto("/");
    } catch (err) {
      console.error("[login] Login error:", err);
      // Con la verificación obligatoria, la contraseña puede ser correcta y aun
      // así no dejar entrar. Se dice en claro y se ofrece el reenvío, en vez de
      // un «Email not verified» en inglés sin ninguna salida.
      if ((err as { code?: string })?.code === "EMAIL_NOT_VERIFIED") {
        pendienteDeVerificar = true;
        localError = "Tienes que confirmar tu email antes de entrar. Revisa tu correo.";
      }
    }
  }

  async function handleReenviar() {
    aviso = null;
    enviando = true;
    try {
      await resendVerification(email);
      localError = null;
      aviso = "Te hemos enviado otro enlace de confirmación.";
    } catch (err) {
      localError = (err as Error).message;
    } finally {
      enviando = false;
    }
  }

  async function handleOlvido(e: Event) {
    e.preventDefault();
    localError = null;
    aviso = null;
    enviando = true;
    try {
      await requestPasswordReset(email);
      // El mismo mensaje exista o no la cuenta: distinguirlo permitiría
      // averiguar qué emails están registrados probando direcciones.
      aviso =
        "Si existe una cuenta con ese email, te llegará un enlace para restablecer la contraseña.";
    } catch (err) {
      localError = (err as Error).message;
    } finally {
      enviando = false;
    }
  }

  async function handleNueva(e: Event) {
    e.preventDefault();
    localError = null;
    if (nuevaPassword.length < 8) {
      localError = "La contraseña necesita al menos 8 caracteres.";
      return;
    }
    if (nuevaPassword !== repetirPassword) {
      localError = "Las dos contraseñas no coinciden.";
      return;
    }
    if (!resetToken) {
      localError = "Falta el enlace de restablecimiento. Pide uno nuevo.";
      modo = "olvido";
      return;
    }
    enviando = true;
    try {
      await resetPassword(resetToken, nuevaPassword);
      // Fuera el token de la URL: recargar volvería a este formulario con un
      // token que ya no vale.
      window.history.replaceState({}, "", window.location.pathname);
      resetToken = null;
      nuevaPassword = "";
      repetirPassword = "";
      modo = "entrar";
      aviso = "Contraseña cambiada. Entra con la nueva.";
    } catch (err) {
      localError = (err as Error).message;
    } finally {
      enviando = false;
    }
  }

  function cambiarModo(siguiente: "entrar" | "olvido") {
    modo = siguiente;
    localError = null;
    aviso = null;
    pendienteDeVerificar = false;
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
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      </div>
      <h1 class="brand-name">Kitsuden</h1>
      <p class="brand-sub">Admin Console</p>
    </div>

    <!-- Error -->
    {#if errorVisible}
      <div class="error-banner">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line
            x1="9"
            y1="9"
            x2="15"
            y2="15"
          />
        </svg>
        {errorVisible}
      </div>
    {/if}

    {#if aviso}
      <div class="aviso-banner" role="status">{aviso}</div>
    {/if}

    <!-- Form -->
    {#if modo === "entrar"}
      <form onsubmit={handleLogin} class="login-form">
        <div class="field">
          <label class="field-label" for="email">Email</label>
          <input
            bind:value={email}
            type="email"
            id="email"
            placeholder="admin@kitsuden.gg"
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
        <button type="submit" disabled={loading} class="login-btn">
          {#if loading}
            <span class="spinner"></span>
          {:else}
            <span>Sign In</span>
          {/if}
        </button>
      </form>

      {#if pendienteDeVerificar}
        <button
          type="button"
          class="link-btn"
          disabled={enviando || !email}
          onclick={handleReenviar}
        >
          Reenviar el correo de confirmación
        </button>
      {/if}
      <button type="button" class="link-btn" onclick={() => cambiarModo("olvido")}>
        ¿Olvidaste tu contraseña?
      </button>
    {:else if modo === "olvido"}
      <form onsubmit={handleOlvido} class="login-form">
        <div class="field">
          <label class="field-label" for="email-olvido">Email</label>
          <input
            bind:value={email}
            type="email"
            id="email-olvido"
            placeholder="admin@kitsuden.gg"
            class="field-input"
            autocomplete="email"
            required
          />
        </div>
        <button type="submit" disabled={enviando} class="login-btn">
          {#if enviando}
            <span class="spinner"></span>
          {:else}
            <span>Enviar enlace</span>
          {/if}
        </button>
      </form>
      <button type="button" class="link-btn" onclick={() => cambiarModo("entrar")}>
        Volver a entrar
      </button>
    {:else}
      <form onsubmit={handleNueva} class="login-form">
        <div class="field">
          <label class="field-label" for="nueva-password">Contraseña nueva</label>
          <input
            bind:value={nuevaPassword}
            type="password"
            id="nueva-password"
            class="field-input"
            autocomplete="new-password"
            minlength="8"
            required
          />
        </div>
        <div class="field">
          <label class="field-label" for="repetir-password">Repítela</label>
          <input
            bind:value={repetirPassword}
            type="password"
            id="repetir-password"
            class="field-input"
            autocomplete="new-password"
            minlength="8"
            required
          />
        </div>
        <button type="submit" disabled={enviando} class="login-btn">
          {#if enviando}
            <span class="spinner"></span>
          {:else}
            <span>Guardar contraseña</span>
          {/if}
        </button>
      </form>
    {/if}

    {#if modo === "entrar" && providers.length > 0}
      <div class="divider"><span>o</span></div>
      <div class="social-list">
        {#each providers as provider (provider.id)}
          <button
            type="button"
            class="social-btn"
            disabled={loading}
            style:--brand={PROVIDER_STYLE[provider.id]?.color ?? "#4a4a5a"}
            onclick={() => handleSocial(provider.id)}
          >
            {#if PROVIDER_STYLE[provider.id]}
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d={PROVIDER_STYLE[provider.id].icon} />
              </svg>
            {/if}
            <span>Continuar con {provider.label}</span>
          </button>
        {/each}
      </div>
      <!-- Entrar por aquí crea la cuenta si no existe, pero esta consola exige
           rol admin: sin él, checkSession la echa igual que a una contraseña. -->
      <p class="social-note">La consola sigue exigiendo rol de administrador.</p>
    {/if}

    <p class="login-hint">Built with Better-Auth 🔐</p>
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
    background: #0a0612;
    overflow: hidden;
  }

  .grid-overlay {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(168, 85, 247, 0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(168, 85, 247, 0.03) 1px, transparent 1px);
    background-size: 60px 60px;
    animation: drift 20s linear infinite;
  }

  @keyframes drift {
    from {
      transform: translate(0, 0);
    }
    to {
      transform: translate(60px, 60px);
    }
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
    border: 1px solid rgba(168, 85, 247, 0.08);
    border-radius: 1.25rem;
    box-shadow:
      0 0 80px rgba(168, 85, 247, 0.05),
      inset 0 0 60px rgba(0, 0, 0, 0.3);
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
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.12), rgba(168, 85, 247, 0.03));
    border: 1px solid rgba(168, 85, 247, 0.15);
    color: #c084fc;
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
    background: rgba(255, 45, 111, 0.08);
    border: 1px solid rgba(255, 45, 111, 0.15);
    color: #ff6b8a;
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
    transition:
      border-color 0.2s,
      box-shadow 0.2s;
    font-family: inherit;
  }

  .field-input::placeholder {
    color: rgba(255, 255, 255, 0.15);
  }

  .field-input:focus {
    border-color: rgba(168, 85, 247, 0.3);
    box-shadow: 0 0 0 3px rgba(168, 85, 247, 0.06);
  }

  /* ── Button ── */
  .login-btn {
    margin-top: 0.5rem;
    width: 100%;
    padding: 12px;
    border-radius: 10px;
    border: none;
    background: linear-gradient(120deg, #a855f7, #ff2d6f);
    color: #fff;
    font-size: 0.85rem;
    font-weight: 700;
    cursor: pointer;
    transition:
      transform 0.15s,
      box-shadow 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-family: inherit;
  }

  .login-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 24px rgba(168, 85, 247, 0.2);
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
    border-top-color: #0a0612;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* ── Social ── */
  .divider {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 1.5rem 0 1rem;
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: rgba(255, 255, 255, 0.2);
  }

  .divider::before,
  .divider::after {
    content: "";
    flex: 1;
    height: 1px;
    background: rgba(255, 255, 255, 0.06);
  }

  .social-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .social-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    padding: 11px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
    color: rgba(255, 255, 255, 0.85);
    font-size: 0.8rem;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition:
      border-color 0.2s,
      background 0.2s;
  }

  .social-btn:hover:not(:disabled) {
    border-color: var(--brand);
    background: color-mix(in srgb, var(--brand) 12%, transparent);
  }

  .social-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .social-btn svg {
    color: var(--brand);
    flex: none;
  }

  .social-note {
    text-align: center;
    font-size: 0.6rem;
    color: rgba(255, 255, 255, 0.25);
    margin-top: 0.75rem;
  }

  /* ── Hint ── */
  .login-hint {
    text-align: center;
    font-size: 0.6rem;
    color: rgba(255, 255, 255, 0.15);
    margin-top: 1.5rem;
  }

  .aviso-banner {
    padding: 10px 14px;
    margin-bottom: 1.25rem;
    border-radius: 10px;
    background: rgba(74, 217, 145, 0.08);
    border: 1px solid rgba(74, 217, 145, 0.18);
    color: #6ee7a8;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .link-btn {
    display: block;
    width: 100%;
    margin-top: 0.75rem;
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.45);
    font-size: 0.72rem;
    cursor: pointer;
    font-family: inherit;
    text-align: center;
  }

  .link-btn:hover:not(:disabled) {
    color: #fff;
    text-decoration: underline;
  }

  .link-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
