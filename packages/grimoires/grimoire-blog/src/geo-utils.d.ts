/**
 * GEO (Generative Engine Optimization) Utilities
 *
 * Funciones para optimizar contenido para motores de IA y generar
 * rich snippets estructurados (Schema.org).
 *
 * Incluye:
 * - Generación de JSON-LD (FAQPage, Article, BlogPosting)
 * - Validación de BLUF (Bottom Line Up Front)
 * - Sanitización de HTML para FAQs
 * - Extracción de tabla de contenidos (TOC)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * REFERENCIAS:
 * ═══════════════════════════════════════════════════════════════════════════
 * - Schema.org FAQPage: https://schema.org/FAQPage
 * - Google FAQ Rich Snippets: https://developers.google.com/search/docs/appearance/structured-data/faqpage
 * - BLUF Writing Style: https://www.plainlanguage.gov/guidelines/organize/whenever-possible-use-the-bluf-botton-line-up-front/
 */
import type { FAQItem } from "./schema.local";
/**
 * JSON-LD Schema.org FAQPage structure
 */
export interface FAQPageSchema {
    "@context": "https://schema.org";
    "@type": "FAQPage";
    mainEntity: Array<{
        "@type": "Question";
        name: string;
        acceptedAnswer: {
            "@type": "Answer";
            text: string;
        };
    }>;
}
/**
 * Article/BlogPosting schema with BLUF
 */
export interface ArticleSchema {
    "@context": "https://schema.org";
    "@type": "BlogPosting" | "Article" | "NewsArticle";
    headline: string;
    description: string;
    url?: string;
    image?: string | {
        "@type": "ImageObject";
        url: string;
        width?: number;
        height?: number;
    };
    datePublished: string;
    dateModified?: string;
    author?: {
        "@type": "Person";
        name: string;
        url?: string;
    };
    publisher?: {
        "@type": "Organization";
        name: string;
        logo?: {
            "@type": "ImageObject";
            url: string;
        };
    };
    articleBody?: string;
    wordCount?: number;
    /** AI-optimized abstract (BLUF) */
    abstract?: string;
    /** FAQ Schema (separate from Article) */
    faqSchema?: FAQPageSchema | null;
}
/**
 * TOC Item extracted from headings
 */
export interface TOCItem {
    level: number;
    text: string;
    id: string;
}
/**
 * Validation result for content
 */
export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    metrics: {
        wordCount: number;
        charCount: number;
        readingTime: number;
    };
}
/**
 * Generate FAQPage Schema.org JSON-LD from FAQ items
 *
 * Esta función transforma el array de FAQs de la base de datos
 * en el formato estructurado requerido por Schema.org para
 * rich snippets en Google.
 *
 * @param faqs - Array de FAQs desde la base de datos
 * @param baseUrl - URL base del sitio (para enlaces internos)
 * @returns Objeto JSON-LD listo para inyectar en <head>
 *
 * @example
 * const faqs = [
 *   { q: "¿Qué es SEO?", a: "Es la optimización..." },
 *   { q: "¿Por qué es importante?", a: "Porque..." }
 * ];
 *
 * const schema = generateFAQPageSchema(faqs);
 * // Inyectar en HTML: <script type="application/ld+json">
 */
export declare function generateFAQPageSchema(faqs: FAQItem[], options?: {
    stripHtml?: boolean;
    maxAnswerLength?: number;
}): FAQPageSchema | null;
/**
 * Generate Article/BlogPosting Schema.org JSON-LD
 *
 * @param data - Datos del artículo
 * @returns Schema JSON-LD completo
 *
 * @example
 * const schema = generateArticleSchema({
 *   title: "Guía SEO 2024",
 *   description: "Aprende SEO...",
 *   bluf: "Resumen de 50 palabras...",
 *   publishedAt: "2024-01-15",
 *   author: { name: "Juan" },
 *   faqs: [...]
 * });
 */
export declare function generateArticleSchema(data: {
    title: string;
    description: string;
    bluf?: string;
    url: string;
    publishedAt: string | Date;
    modifiedAt?: string | Date;
    image?: string;
    imageWidth?: number;
    imageHeight?: number;
    author?: {
        name: string;
        url?: string;
    };
    publisher?: {
        name: string;
        logo?: string;
    };
    wordCount?: number;
    faqs?: FAQItem[];
    type?: "BlogPosting" | "Article" | "NewsArticle";
}): ArticleSchema;
/**
 * Validar BLUF (Bottom Line Up Front)
 *
 * El BLUF es un resumen conciso diseñado para:
 * 1. Ser extraído por IA como respuesta directa
 * 2. Cumplir con límites de longitud de snippets
 *
 * Reglas de validación:
 * - Máximo 50 palabras (ideal: 30-40)
 * - Debe contener la respuesta principal
 * - No debe repetir el título
 * - Debe ser auto-contenido
 *
 * @param bluf - Texto BLUF a validar
 * @returns Resultado de validación con métricas
 *
 * @example
 * const result = validateBLUF(
 *   "El SEO en 2024 requiere contenido de calidad, " +
 *   "experiencia de usuario excelente y optimización para búsquedas por voz."
 * );
 * // result.isValid = true
 * // result.metrics.wordCount = 17
 */
export declare function validateBLUF(bluf: string | null | undefined): ValidationResult;
/**
 * Sugerir mejora para BLUF basado en el contenido
 *
 * @param content - Contenido completo del artículo
 * @param maxWords - Máximo de palabras (default: 50)
 * @returns BLUF sugerido extraído del primer párrafo
 */
export declare function suggestBLUF(content: string, maxWords?: number): string;
/**
 * Etiquetas HTML permitidas para FAQs y contenido
 *
 * Lista blanca de etiquetas seguras que permiten estructura
 * sin riesgo de XSS.
 */
export declare const ALLOWED_HTML_TAGS: readonly ["p", "br", "hr", "strong", "b", "em", "i", "u", "mark", "small", "del", "ins", "a", "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td", "caption", "h3", "h4", "blockquote", "code", "pre", "sup", "sub"];
/**
 * Atributos HTML permitidos por etiqueta
 */
export declare const ALLOWED_ATTRIBUTES: Record<string, string[]>;
/**
 * Sanitizar HTML permitiendo solo etiquetas seguras
 *
 * @param html - HTML a sanitizar
 * @param allowedTags - Lista de etiquetas permitidas (default: ALLOWED_HTML_TAGS)
 * @returns HTML sanitizado
 *
 * @example
 * const dirty = '<p>Texto</p><script>alert("xss")</script>';
 * const clean = sanitizeHTML(dirty);
 * // Result: '<p>Texto</p>'
 */
export declare function sanitizeHTML(html: string, options?: {
    allowedTags?: readonly string[];
    stripAll?: boolean;
}): string;
/**
 * Versión simple de sanitización para Node.js (sin DOM)
 * Elimina todas las etiquetas HTML
 *
 * @param html - HTML a limpiar
 * @returns Texto plano
 */
export declare function stripHtmlTags(html: string): string;
/**
 * Sanitizar específicamente para FAQs (más restrictivo)
 *
 * @param text - Texto a sanitizar
 * @returns HTML limpio para FAQ
 */
export declare function sanitizeFAQText(text: string): string;
/**
 * Extraer tabla de contenidos desde contenido Lexical o HTML
 *
 * @param content - Contenido (Lexical JSON o HTML)
 * @returns Array de items de TOC
 */
export declare function extractTOC(content: any): TOCItem[];
/**
 * Construir payload de API optimizado para frontend
 *
 * Esta función organiza todos los datos del post en la estructura
 * óptima para consumo por Astro, React, Vue, etc.
 *
 * @param post - Post desde la base de datos
 * @param options - Opciones de configuración
 * @returns Payload estructurado
 *
 * @example
 * const payload = buildAPIPayload(post, {
 *   baseUrl: "https://misitio.com",
 *   siteName: "Mi Blog"
 * });
 *
 * // En frontend:
 * <title>{payload.seo.title}</title>
 * <meta name="description" content={payload.seo.description} />
 * <script type="application/ld+json">
 *   {JSON.stringify(payload.geo_ai.schema_faq)}
 * </script>
 * <article>
 *   <p>{payload.geo_ai.bluf}</p>
 *   {@html payload.content.body}
 * </article>
 */
export declare function buildAPIPayload(post: {
    id: string;
    slug: string;
    title: string;
    content?: any;
    excerpt?: string | null;
    blufText?: string | null;
    faqData?: FAQItem[];
    datasetUrl?: string | null;
    metaTitle?: string | null;
    metaDescription?: string | null;
    ogImageId?: string | null;
    featuredImageId?: string | null;
    featuredImageFocalPoint?: {
        x: number;
        y: number;
    } | null;
    status: string;
    publishedAt?: Date | string | null;
    updatedAt?: Date | string;
    author?: {
        name: string;
        image?: string;
    };
    featuredImage?: {
        url: string;
        width?: number;
        height?: number;
    };
    readingTime?: number | null;
}, options: {
    baseUrl: string;
    siteName: string;
    stripHtmlFromBluf?: boolean;
}): {
    id: string;
    slug: string;
    status: string;
    publishedAt?: string;
    updatedAt: string;
    author?: {
        name: string;
        image?: string;
    };
    seo: {
        title: string;
        description: string;
        canonicalUrl: string;
        ogImage?: string;
        ogImageWidth?: number;
        ogImageHeight?: number;
        featuredImageId?: string;
        featuredImageFocalPoint?: {
            x: number;
            y: number;
        };
    };
    geo_ai: {
        bluf: string;
        schema_faq?: any;
        dataset_url?: string;
        reading_time?: number;
        word_count?: number;
    };
    content: {
        body: any;
        excerpt?: string;
        toc: any[];
    };
};
declare const _default: {
    generateFAQPageSchema: typeof generateFAQPageSchema;
    generateArticleSchema: typeof generateArticleSchema;
    validateBLUF: typeof validateBLUF;
    suggestBLUF: typeof suggestBLUF;
    sanitizeHTML: typeof sanitizeHTML;
    stripHtmlTags: typeof stripHtmlTags;
    sanitizeFAQText: typeof sanitizeFAQText;
    ALLOWED_HTML_TAGS: readonly ["p", "br", "hr", "strong", "b", "em", "i", "u", "mark", "small", "del", "ins", "a", "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td", "caption", "h3", "h4", "blockquote", "code", "pre", "sup", "sub"];
    ALLOWED_ATTRIBUTES: Record<string, string[]>;
    extractTOC: typeof extractTOC;
    buildAPIPayload: typeof buildAPIPayload;
};
export default _default;
//# sourceMappingURL=geo-utils.d.ts.map