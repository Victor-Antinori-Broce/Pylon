<script lang="ts">
  /**
   * Quién está usando el panel, en la barra superior.
   *
   * Antes la barra decía «Admin» y pintaba una «A» fija, también para un
   * editor: el panel afirmaba un rol que esa persona no tenía. Ahora sale el
   * nombre real, su rol traducido y su avatar (o su inicial si no tiene, o si
   * la imagen no carga).
   */
  import { t } from "$lib/i18n";
  import type { AuthUser } from "$lib/auth.svelte";

  const API_URL = import.meta.env.VITE_API_URL ?? "";

  const { user }: { user: AuthUser } = $props();

  let imagenRota = $state(false);

  /** Nombre visible: el nombre, o la parte local del email si no hay nombre. */
  const nombre = $derived(user.name?.trim() || user.email?.split("@")[0] || "?");

  const inicial = $derived(nombre.charAt(0).toUpperCase() || "?");

  /**
   * Rol legible. Los conocidos se traducen; uno desconocido (un rol propio de
   * la instalación) se enseña tal cual antes que inventarle un nombre.
   */
  const rol = $derived.by(() => {
    switch (user.role) {
      case "admin":
        return t("usuarioActual.rolAdmin");
      case "editor":
        return t("usuarioActual.rolEditor");
      case "user":
        return t("usuarioActual.rolUsuario");
      default:
        return user.role || t("usuarioActual.rolUsuario");
    }
  });

  /**
   * Solo imágenes http(s) o rutas de la propia API. Cualquier otro esquema
   * (`javascript:`, `data:`…) se ignora y queda la inicial.
   */
  const avatar = $derived.by(() => {
    const img = user.image?.trim();
    if (!img) return null;
    if (/^https?:\/\//i.test(img)) return img;
    if (img.startsWith("/") && !img.startsWith("//")) return `${API_URL}${img}`;
    return null;
  });

  // Si cambia la imagen (otro usuario, foto nueva) se vuelve a intentar.
  $effect(() => {
    void avatar;
    imagenRota = false;
  });
</script>

<div class="flex items-center gap-2 min-w-0" data-testid="usuario-actual">
  <div class="hidden sm:flex flex-col items-end min-w-0 leading-tight">
    <span class="text-xs font-medium text-kitsuden-text truncate max-w-[10rem]" data-testid="usuario-nombre">
      {nombre}
    </span>
    <span class="text-[10px] text-kitsuden-subtle truncate max-w-[10rem]" data-testid="usuario-rol">{rol}</span>
  </div>
  <div
    class="w-8 h-8 rounded-full overflow-hidden bg-kitsuden-accent/10 border border-kitsuden-accent/20 flex items-center justify-center text-xs font-bold text-kitsuden-accent shrink-0"
    title={t("usuarioActual.descripcion", { nombre, rol })}
    aria-label={t("usuarioActual.descripcion", { nombre, rol })}
    role="img"
    data-testid="usuario-avatar"
  >
    {#if avatar && !imagenRota}
      <img src={avatar} alt="" class="w-full h-full object-cover" onerror={() => (imagenRota = true)} />
    {:else}
      {inicial}
    {/if}
  </div>
</div>
