<script lang="ts">
  /**
   * Selector de idioma del panel (inglés por defecto, español opcional).
   * Guarda la elección y recarga: ver `$lib/i18n/locale.svelte.ts`.
   */
  import { t, getLocale, setLocale, type Idioma } from "$lib/i18n";

  let { class: clase = "" }: { class?: string } = $props();

  function cambiar(e: Event) {
    setLocale((e.currentTarget as HTMLSelectElement).value as Idioma);
  }
</script>

<select
  class="bg-kitsuden-bg border border-kitsuden-border rounded-lg text-xs text-kitsuden-text-dim px-2 py-1 hover:text-kitsuden-text focus:outline-none focus:border-kitsuden-accent {clase}"
  aria-label={t("languageSwitcher.language")}
  title={t("languageSwitcher.language")}
  value={getLocale()}
  onchange={cambiar}
  data-testid="language-switcher"
>
  <option value="en">{t("languageSwitcher.english")}</option>
  <option value="es">{t("languageSwitcher.spanish")}</option>
</select>
