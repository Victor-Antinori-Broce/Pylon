<!--
  SocialPreviewABExample.svelte
  
  Ejemplo de cómo usar el modo Comparación A/B del componente SocialPreview.
  Permite comparar dos versiones diferentes de OG tags side-by-side.
  
  Uso típico:
  - Comparar diferentes títulos
  - Comparar diferentes imágenes
  - Comparar diferentes descripciones
  - Testear cuál versión tiene mejor SEO
-->
<script lang="ts">
  import { t } from "$lib/i18n";
  import { GitCompare } from "lucide-svelte";

  import SocialPreview from "./SocialPreview.svelte";

  // Datos de ejemplo para la comparación
  const variantA = {
    title: t("socialPreviewABExample.n10EstrategiasSeoPara2024"),
    metaDescription:
      "Descubre las mejores técnicas de SEO para este año. Guía completa con ejemplos prácticos.",
    canonicalUrl: "https://ejemplo.com/blog/seo-2024",
    openGraph: {
      title: t("socialPreviewABExample.n10EstrategiasSeoQueFuncionan"),
      description:
        t("socialPreviewABExample.descubreLasTacticasSeoProbadas"),
      url: "https://ejemplo.com/blog/seo-2024",
      image: {
        url: "https://ejemplo.com/images/seo-strategy-a.jpg",
        width: 1200,
        height: 630,
        isWhatsAppCompatible: true,
      },
      siteName: "Mi Blog",
    },
    twitterCard: {
      card: "summary_large_image",
      title: t("socialPreviewABExample.n10EstrategiasSeoPara20242"),
      description: t("socialPreviewABExample.descubreLasTacticasSeoProbadas2"),
      image: "https://ejemplo.com/images/seo-strategy-a.jpg",
    },
    whatsAppValidation: {
      isValid: true,
      checks: {
        format: true,
        fileSize: true,
        dimensions: true,
        isAbsoluteUrl: true,
      },
      warnings: [],
      recommendations: [],
    },
  };

  const variantB = {
    title: t("socialPreviewABExample.guiaSeo2024ComoPosicionar"),
    metaDescription:
      "Aprende a posicionar tu web en Google con nuestra guía SEO 2024. Estrategias actualizadas y efectivas.",
    canonicalUrl: "https://ejemplo.com/blog/seo-2024",
    openGraph: {
      title: t("socialPreviewABExample.guiaCompletaSeo2024Domina"),
      description:
        t("socialPreviewABExample.todoLoQueNecesitasSaber"),
      url: "https://ejemplo.com/blog/seo-2024",
      image: {
        url: "https://ejemplo.com/images/seo-guide-b.jpg",
        width: 1200,
        height: 630,
        isWhatsAppCompatible: false,
      },
      siteName: "Mi Blog",
    },
    twitterCard: {
      card: "summary_large_image",
      title: t("socialPreviewABExample.guiaSeo2024DominaGoogle"),
      description: t("socialPreviewABExample.todoLoQueNecesitasSaber2"),
      image: "https://ejemplo.com/images/seo-guide-b.jpg",
    },
    whatsAppValidation: {
      isValid: false,
      checks: {
        format: true,
        fileSize: false,
        dimensions: true,
        isAbsoluteUrl: true,
      },
      warnings: ["Image file size (450KB) exceeds WhatsApp limit of 300KB"],
      recommendations: ["Compress image to under 300KB using TinyPNG"],
    },
  };

  // Props
  interface Props {
    showComparison?: boolean;
  }

  const { showComparison = true }: Props = $props();
</script>

<div class="ab-example">
  <div class="ab-header">
    <GitCompare size={24} />
    <h2>{t("socialPreviewABExample.comparacionABDeOpen")}</h2>
  </div>

  <p class="ab-description">
    {t("socialPreviewABExample.comparaDosVersionesDiferentesDe")}
  </p>

  {#if showComparison}
    <div class="comparison-container">
      <SocialPreview
        comparisonMode={true}
        {variantA}
        {variantB}
        labelA="Título Emocional + Emoji"
        labelB="Título Descriptivo"
      />
    </div>
  {/if}

  <div class="ab-notes">
    <h3>{t("socialPreviewABExample.comoInterpretarLosResultados")}</h3>
    <ul>
      <li><strong>{t("socialPreviewABExample.whatsappIssues")}</strong> {t("socialPreviewABExample.muestraCuantosProblemasTieneCada")}</li>
      <li><strong>{t("socialPreviewABExample.validacion")}</strong> {t("socialPreviewABExample.verificaFormatoTamanoYDimensiones")}</li>
      <li><strong>{t("socialPreviewABExample.debugPanel")}</strong> {t("socialPreviewABExample.muestraLongitudesDeTituloY")}</li>
      <li><strong>{t("socialPreviewABExample.ganador")}</strong> {t("socialPreviewABExample.laVarianteConMenosIssues")}</li>
    </ul>
  </div>
</div>

<style>
  .ab-example {
    padding: 24px;
    background: #f9fafb;
    border-radius: 12px;
  }

  .ab-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }

  .ab-header h2 {
    margin: 0;
    font-size: 20px;
    color: #111827;
  }

  .ab-description {
    color: #6b7280;
    margin-bottom: 24px;
    line-height: 1.5;
  }

  .comparison-container {
    margin-bottom: 24px;
  }

  .ab-notes {
    background: white;
    padding: 20px;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
  }

  .ab-notes h3 {
    margin: 0 0 12px 0;
    font-size: 14px;
    color: #374151;
  }

  .ab-notes ul {
    margin: 0;
    padding-left: 20px;
    color: #6b7280;
    font-size: 13px;
    line-height: 1.8;
  }

  .ab-notes li {
    margin: 4px 0;
  }
</style>
