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
import { getOGImageUrl } from "./seo-utils";
// ═══════════════════════════════════════════════════════════════════════════
// JSON-LD GENERATORS
// ═══════════════════════════════════════════════════════════════════════════
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
export function generateFAQPageSchema(faqs, options) {
    if (!faqs || faqs.length === 0)
        return null;
    const { stripHtml = true, maxAnswerLength = 500 } = options || {};
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((faq) => {
            // Limpiar HTML si es necesario
            let answer = faq.a;
            if (stripHtml) {
                answer = stripHtmlTags(answer);
            }
            // Truncar respuesta si es muy larga (Google recomienda respuestas concisas)
            if (answer.length > maxAnswerLength) {
                answer = answer.substring(0, maxAnswerLength).trim() + "...";
            }
            return {
                "@type": "Question",
                name: faq.q,
                acceptedAnswer: {
                    "@type": "Answer",
                    text: answer,
                },
            };
        }),
    };
}
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
export function generateArticleSchema(data) {
    const schema = {
        "@context": "https://schema.org",
        "@type": data.type || "BlogPosting",
        headline: data.title,
        description: data.description,
        datePublished: new Date(data.publishedAt).toISOString(),
        abstract: data.bluf, // BLUF como abstract para IA
    };
    // URL opcional
    if (data.url) {
        schema.url = data.url;
    }
    // Fecha de modificación (opcional pero recomendada)
    if (data.modifiedAt) {
        schema.dateModified = new Date(data.modifiedAt).toISOString();
    }
    // Imagen (puede ser string o ImageObject)
    if (data.image) {
        if (data.imageWidth && data.imageHeight) {
            schema.image = {
                "@type": "ImageObject",
                url: data.image,
                width: data.imageWidth,
                height: data.imageHeight,
            };
        }
        else {
            schema.image = data.image;
        }
    }
    // Autor
    if (data.author) {
        schema.author = {
            "@type": "Person",
            name: data.author.name,
            url: data.author.url,
        };
    }
    // Publisher
    if (data.publisher) {
        schema.publisher = {
            "@type": "Organization",
            name: data.publisher.name,
        };
        if (data.publisher.logo) {
            schema.publisher.logo = {
                "@type": "ImageObject",
                url: data.publisher.logo,
            };
        }
    }
    // Word count (útil para IA)
    if (data.wordCount) {
        schema.wordCount = data.wordCount;
    }
    // FAQ Schema separado (Google recomienda no anidar FAQPage dentro de Article)
    if (data.faqs && data.faqs.length > 0) {
        schema.faqSchema = generateFAQPageSchema(data.faqs);
    }
    return schema;
}
// ═══════════════════════════════════════════════════════════════════════════
// BLUF (BOTTOM LINE UP FRONT) UTILITIES
// ═══════════════════════════════════════════════════════════════════════════
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
export function validateBLUF(bluf) {
    const result = {
        isValid: true,
        errors: [],
        warnings: [],
        metrics: {
            wordCount: 0,
            charCount: 0,
            readingTime: 0,
        },
    };
    if (!bluf || bluf.trim().length === 0) {
        result.errors.push("BLUF no puede estar vacío");
        result.isValid = false;
        return result;
    }
    // Calcular métricas
    const cleanText = bluf.trim();
    const words = cleanText.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    const charCount = cleanText.length;
    const readingTime = Math.ceil(wordCount / 200); // 200 WPM promedio
    result.metrics = { wordCount, charCount, readingTime };
    // Validar límite de palabras (estricto: max 50)
    if (wordCount > 50) {
        result.errors.push(`BLUF excede el límite de 50 palabras (actual: ${wordCount}). ` +
            "Las IAs truncan respuestas largas.");
        result.isValid = false;
    }
    else if (wordCount > 40) {
        result.warnings.push(`BLUF tiene ${wordCount} palabras. ` +
            "Considera reducir a 30-40 palabras para mejor extracción por IA.");
    }
    // Validar longitud mínima
    if (wordCount < 10) {
        result.warnings.push(`BLUF tiene solo ${wordCount} palabras. ` +
            "Podría ser insuficiente para contexto.");
    }
    // Validar que no sea solo mayúsculas (spam indicator)
    const upperCaseRatio = cleanText.replace(/[^a-zA-Z]/g, '').length > 0
        ? cleanText.replace(/[^A-Z]/g, '').length / cleanText.replace(/[^a-zA-Z]/g, '').length
        : 0;
    if (upperCaseRatio > 0.7) {
        result.warnings.push("Evita usar MAYÚSCULAS excesivas en el BLUF");
    }
    // Validar primera letra mayúscula
    if (!/^[A-ZÁÉÍÓÚÜÑ]/.test(cleanText)) {
        result.warnings.push("El BLUF debe comenzar con mayúscula");
    }
    // Validar puntuación final
    if (!/[.!?]$/.test(cleanText)) {
        result.warnings.push("El BLUF debe terminar con puntuación");
    }
    return result;
}
/**
 * Sugerir mejora para BLUF basado en el contenido
 *
 * @param content - Contenido completo del artículo
 * @param maxWords - Máximo de palabras (default: 50)
 * @returns BLUF sugerido extraído del primer párrafo
 */
export function suggestBLUF(content, maxWords = 50) {
    // Extraer primer párrafo significativo
    const paragraphs = content
        .replace(/<[^>]+>/g, ' ') // Limpiar HTML
        .split(/\n\s*\n/)
        .map(p => p.trim())
        .filter(p => p.length > 50); // Ignorar párrafos muy cortos
    if (paragraphs.length === 0)
        return "";
    const firstParagraph = paragraphs[0];
    const words = firstParagraph.split(/\s+/);
    if (words.length <= maxWords) {
        return firstParagraph;
    }
    // Truncar a límite de palabras, terminando en frase completa
    const truncated = words.slice(0, maxWords).join(' ');
    const lastPeriod = truncated.lastIndexOf('.');
    if (lastPeriod > truncated.length * 0.7) {
        return truncated.substring(0, lastPeriod + 1);
    }
    return truncated + '...';
}
// ═══════════════════════════════════════════════════════════════════════════
// HTML SANITIZATION
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Etiquetas HTML permitidas para FAQs y contenido
 *
 * Lista blanca de etiquetas seguras que permiten estructura
 * sin riesgo de XSS.
 */
export const ALLOWED_HTML_TAGS = [
    // Estructura de texto
    'p', 'br', 'hr',
    // Formato inline
    'strong', 'b', 'em', 'i', 'u', 'mark', 'small', 'del', 'ins',
    // Enlaces (se validan separadamente)
    'a',
    // Listas
    'ul', 'ol', 'li',
    // Tablas (para comparaciones)
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption',
    // Encabezados (limitados)
    'h3', 'h4',
    // Otros
    'blockquote', 'code', 'pre', 'sup', 'sub',
];
/**
 * Atributos HTML permitidos por etiqueta
 */
export const ALLOWED_ATTRIBUTES = {
    'a': ['href', 'title', 'rel'],
    'img': ['src', 'alt', 'width', 'height'],
    'th': ['scope', 'colspan', 'rowspan'],
    'td': ['colspan', 'rowspan'],
    '*': ['class'], // Clases permitidas en todas las etiquetas
};
/**
 * URLs permitidas en href (prevenir javascript:)
 */
const ALLOWED_URL_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:'];
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
export function sanitizeHTML(html, options) {
    const { allowedTags = ALLOWED_HTML_TAGS, stripAll = false } = options || {};
    if (stripAll) {
        return stripHtmlTags(html);
    }
    // Crear un DOM parser (funciona en browser, para Node usar jsdom o similar)
    if (typeof DOMParser === 'undefined') {
        // Fallback simple para Node.js
        return stripHtmlTags(html);
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    function sanitizeNode(node) {
        // Text nodes se mantienen
        if (node.nodeType === Node.TEXT_NODE) {
            return node.cloneNode();
        }
        // Element nodes
        if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node;
            const tagName = element.tagName.toLowerCase();
            // Si la etiqueta no está permitida, solo mantener contenido de texto
            if (!allowedTags.includes(tagName)) {
                const text = document.createTextNode(element.textContent || '');
                return text;
            }
            // Crear nueva etiqueta limpia
            const cleanElement = document.createElement(tagName);
            // Copiar atributos permitidos
            const allowedAttrs = ALLOWED_ATTRIBUTES[tagName] || ALLOWED_ATTRIBUTES['*'] || [];
            Array.from(element.attributes).forEach(attr => {
                const attrName = attr.name.toLowerCase();
                if (allowedAttrs.includes(attrName)) {
                    let attrValue = attr.value;
                    // Validar URLs en href/src
                    if (attrName === 'href' || attrName === 'src') {
                        try {
                            const url = new URL(attrValue, 'http://example.com');
                            if (!ALLOWED_URL_SCHEMES.includes(url.protocol)) {
                                return; // Skip atributo con URL inválida
                            }
                            // Agregar rel="nofollow" a enlaces externos
                            if (attrName === 'href' && tagName === 'a') {
                                cleanElement.setAttribute('rel', 'nofollow noopener');
                            }
                        }
                        catch {
                            return; // Skip atributo con URL malformada
                        }
                    }
                    cleanElement.setAttribute(attrName, attrValue);
                }
            });
            // Recursivamente sanitizar hijos
            Array.from(element.childNodes).forEach(child => {
                const cleanChild = sanitizeNode(child);
                if (cleanChild) {
                    cleanElement.appendChild(cleanChild);
                }
            });
            return cleanElement;
        }
        return null;
    }
    // Sanitizar body
    const cleanBody = document.createElement('div');
    Array.from(doc.body.childNodes).forEach(child => {
        const cleanChild = sanitizeNode(child);
        if (cleanChild) {
            cleanBody.appendChild(cleanChild);
        }
    });
    return cleanBody.innerHTML;
}
/**
 * Versión simple de sanitización para Node.js (sin DOM)
 * Elimina todas las etiquetas HTML
 *
 * @param html - HTML a limpiar
 * @returns Texto plano
 */
export function stripHtmlTags(html) {
    if (!html)
        return '';
    return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
/**
 * Sanitizar específicamente para FAQs (más restrictivo)
 *
 * @param text - Texto a sanitizar
 * @returns HTML limpio para FAQ
 */
export function sanitizeFAQText(text) {
    // Permitir solo formato básico en FAQs
    const allowedFAQTags = ['p', 'br', 'strong', 'b', 'em', 'i', 'a', 'code'];
    return sanitizeHTML(text, { allowedTags: allowedFAQTags });
}
// ═══════════════════════════════════════════════════════════════════════════
// TABLE OF CONTENTS (TOC) EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Extraer tabla de contenidos desde contenido Lexical o HTML
 *
 * @param content - Contenido (Lexical JSON o HTML)
 * @returns Array de items de TOC
 */
export function extractTOC(content) {
    const toc = [];
    if (!content)
        return toc;
    // Si es Lexical format
    if (typeof content === 'object' && content.root) {
        extractLexicalHeadings(content.root, toc);
    }
    else if (typeof content === 'string') {
        // Si es HTML
        extractHTMLHeadings(content, toc);
    }
    return toc;
}
function extractLexicalHeadings(node, toc) {
    if (!node)
        return;
    // Heading nodes en Lexical
    if (node.type === 'heading' && node.tag) {
        const level = parseInt(node.tag.replace('h', ''));
        const text = extractTextFromLexicalNode(node);
        if (text && level >= 2 && level <= 4) {
            toc.push({
                level,
                text: text.substring(0, 100),
                id: slugify(text),
            });
        }
    }
    // Recursivamente procesar hijos
    if (node.children && Array.isArray(node.children)) {
        node.children.forEach((child) => extractLexicalHeadings(child, toc));
    }
}
function extractHTMLHeadings(html, toc) {
    const headingRegex = /<h([2-4])[^>]*>(.*?)<\/h\1>/gi;
    let match;
    while ((match = headingRegex.exec(html)) !== null) {
        const level = parseInt(match[1]);
        const text = stripHtmlTags(match[2]);
        if (text) {
            toc.push({
                level,
                text: text.substring(0, 100),
                id: slugify(text),
            });
        }
    }
}
function extractTextFromLexicalNode(node) {
    if (!node)
        return '';
    if (node.text)
        return node.text;
    if (node.children && Array.isArray(node.children)) {
        return node.children.map(extractTextFromLexicalNode).join('');
    }
    return '';
}
function slugify(text) {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50);
}
// ═══════════════════════════════════════════════════════════════════════════
// API PAYLOAD BUILDER
// ═══════════════════════════════════════════════════════════════════════════
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
export function buildAPIPayload(post, options) {
    const { baseUrl, siteName, stripHtmlFromBluf = true } = options;
    // Construir URL canónica
    const canonicalUrl = `${baseUrl.replace(/\/$/, '')}/blog/${post.slug}`;
    // Preparar BLUF
    let bluf = post.blufText || post.excerpt || '';
    if (stripHtmlFromBluf) {
        bluf = stripHtmlTags(bluf);
    }
    // Asegurar que nunca sea null
    bluf = bluf || '';
    // Contar palabras del contenido
    const contentText = typeof post.content === 'string'
        ? post.content
        : JSON.stringify(post.content);
    const wordCount = contentText.split(/\s+/).filter(w => w.length > 0).length;
    // Generar FAQ schema
    const faqSchema = post.faqData && post.faqData.length > 0
        ? generateFAQPageSchema(post.faqData)
        : undefined;
    return {
        id: post.id,
        slug: post.slug,
        status: post.status,
        publishedAt: post.publishedAt
            ? new Date(post.publishedAt).toISOString()
            : undefined,
        updatedAt: new Date(post.updatedAt || Date.now()).toISOString(),
        author: post.author,
        seo: {
            title: post.metaTitle || `${post.title} | ${siteName}`,
            description: post.metaDescription || post.excerpt || '',
            canonicalUrl,
            ogImage: post.ogImageId
                ? getOGImageUrl(post.ogImageId, post.featuredImageFocalPoint || undefined, baseUrl)
                : post.featuredImageId
                    ? getOGImageUrl(post.featuredImageId, post.featuredImageFocalPoint || undefined, baseUrl)
                    : undefined,
            ogImageWidth: 1200,
            ogImageHeight: 630,
            featuredImageId: post.featuredImageId,
            featuredImageFocalPoint: post.featuredImageFocalPoint || undefined,
        },
        geo_ai: {
            bluf,
            schema_faq: faqSchema,
            dataset_url: post.datasetUrl || undefined,
            reading_time: post.readingTime || Math.ceil(wordCount / 200),
            word_count: wordCount,
        },
        content: {
            body: post.content,
            excerpt: post.excerpt,
            toc: extractTOC(post.content),
        },
    };
}
// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════
export default {
    // JSON-LD Generators
    generateFAQPageSchema,
    generateArticleSchema,
    // BLUF Utilities
    validateBLUF,
    suggestBLUF,
    // HTML Sanitization
    sanitizeHTML,
    stripHtmlTags,
    sanitizeFAQText,
    ALLOWED_HTML_TAGS,
    ALLOWED_ATTRIBUTES,
    // TOC
    extractTOC,
    // API Builder
    buildAPIPayload,
};
//# sourceMappingURL=geo-utils.js.map