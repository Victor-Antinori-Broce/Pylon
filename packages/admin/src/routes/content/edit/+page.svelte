<script lang="ts">
  /**
   * Editor de contenido — el unico
   * ==========================================================================
   *
   * ── LO QUE HABIA ANTES ───────────────────────────────────────────────────
   *
   * Esta ruta era un `+page.ts` que redirigia a `/g/system-tools/editor`, y
   * alli vivia `EditorView`: un editor de markdown con vista previa que
   * IGNORABA por completo `?collection` e `?id` —arrancaba siempre con su texto
   * de demostracion— y cuyo boton «Save Draft» no tenia `onclick`.
   *
   * Es decir: «Nuevo Post» y editar un post existente abrian los dos el mismo
   * documento de ejemplo, y nada de lo que escribieras se guardaba. Crear un
   * post era imposible.
   *
   * Mientras tanto `BlogPostEditor` —titulo, slug, extracto, estado,
   * programacion, autor, imagen destacada, etiquetas, overrides de SEO, con
   * create/update/delete contra `/api/blog`— existia completo y no lo
   * enlazaba nadie.
   *
   * ── AHORA ────────────────────────────────────────────────────────────────
   *
   * Un solo editor. El de markdown con vista previa y el de bloques viven
   * DENTRO de el: el primero como modo de escritura del campo `content` (los
   * dos editores emitian la misma cadena, asi que no eran dos editores) y el
   * segundo como pestaña propia sobre la columna `blocks`.
   *
   * Sin `?id` es un post nuevo. Con `?id` se carga ese.
   */
  import { page } from "$app/stores";

  import BlogPostEditor from "$lib/components/blog/BlogPostEditor.svelte";

  const postId = $derived($page.url.searchParams.get("id"));
</script>

<BlogPostEditor {postId} />
