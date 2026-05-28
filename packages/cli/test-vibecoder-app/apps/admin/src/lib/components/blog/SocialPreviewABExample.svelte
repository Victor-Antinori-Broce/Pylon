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
  import SocialPreview from './SocialPreview.svelte';
  import { GitCompare, Loader2 } from 'lucide-svelte';

  // Datos de ejemplo para la comparación
  const variantA = {
    title: "10 Estrategias SEO para 2024 | Mi Blog",
    metaDescription: "Descubre las mejores técnicas de SEO para este año. Guía completa con ejemplos prácticos.",
    canonicalUrl: "https://ejemplo.com/blog/seo-2024",
    openGraph: {
      title: "🚀 10 Estrategias SEO que funcionan en 2024",
      description: "Descubre las tácticas SEO probadas que aumentaron el tráfico orgánico de 500+ empresas.",
      url: "https://ejemplo.com/blog/seo-2024",
      image: {
        url: "https://ejemplo.com/images/seo-strategy-a.jpg",
        width: 1200,
        height: 630,
        isWhatsAppCompatible: true
      },
      siteName: "Mi Blog"
    },
    twitterCard: {
      card: "summary_large_image",
      title: "10 Estrategias SEO para 2024 🧵",
      description: "Descubre las tácticas SEO probadas...",
      image: "https://ejemplo.com/images/seo-strategy-a.jpg"
    },
    whatsAppValidation: {
      isValid: true,
      checks: {
        format: true,
        fileSize: true,
        dimensions: true,
        isAbsoluteUrl: true
      },
      warnings: [],
      recommendations: []
    }
  };

  const variantB = {
    title: "Guía SEO 2024: Cómo posicionar en Google | Mi Blog",
    metaDescription: "Aprende a posicionar tu web en Google con nuestra guía SEO 2024. Estrategias actualizadas y efectivas.",
    canonicalUrl: "https://ejemplo.com/blog/seo-2024",
    openGraph: {
      title: "Guía Completa SEO 2024: Domina Google",
      description: "Todo lo que necesitas saber para posicionar tu web en Google este año. Casos reales.",
      url: "https://ejemplo.com/blog/seo-2024",
      image: {
        url: "https://ejemplo.com/images/seo-guide-b.jpg",
        width: 1200,
        height: 630,
        isWhatsAppCompatible: false
      },
      siteName: "Mi Blog"
    },
    twitterCard: {
      card: "summary_large_image",
      title: "Guía SEO 2024: Domina Google 🚀",
      description: "Todo lo que necesitas saber para posicionar...",
      image: "https://ejemplo.com/images/seo-guide-b.jpg"
    },
    whatsAppValidation: {
      isValid: false,
      checks: {
        format: true,
        fileSize: false,
        dimensions: true,
        isAbsoluteUrl: true
      },
      warnings: ["Image file size (450KB) exceeds WhatsApp limit of 300KB"],
      recommendations: ["Compress image to under 300KB using TinyPNG"]
    }
  };

  // Props
  interface Props {
    showComparison?: boolean;
  }

  let { showComparison = true }: Props = $props();
</script>

<div class="ab-example">
  <div class="ab-header">
    <GitCompare size={24} />
    <h2>Comparación A/B de Open Graph</h2>
  </div>
  
  <p class="ab-description">
    Compara dos versiones diferentes de títulos, descripciones o imágenes 
    para ver cuál funciona mejor en redes sociales.
  </p>

  {#if showComparison}
    <div class="comparison-container">
      <SocialPreview 
        comparisonMode={true}
        variantA={variantA}
        variantB={variantB}
        labelA="Título Emocional + Emoji"
        labelB="Título Descriptivo"
      />
    </div>
  {/if}

  <div class="ab-notes">
    <h3>💡 Cómo interpretar los resultados:</h3>
    <ul>
      <li><strong>WhatsApp Issues:</strong> Muestra cuántos problemas tiene cada variante</li>
      <li><strong>Validación:</strong> Verifica formato, tamaño y dimensiones de imagen</li>
      <li><strong>Debug Panel:</strong> Muestra longitudes de título y descripción</li>
      <li><strong>Ganador:</strong> La variante con menos issues de validación</li>
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
