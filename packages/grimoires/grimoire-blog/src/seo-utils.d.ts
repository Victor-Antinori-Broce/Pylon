/**
 * SEO Utilities for Blog Posts
 *
 * Image Transform URL Helpers:
 * - getFeaturedImageUrl: /api/media/preset/{id}/large
 * - getOGImageUrl: /api/media/transform/{id}?w=1200&h=630&fit=cover&f=jpeg&q=90
 * - Focal point support for smart cropping
 *
 * Comprehensive SEO metadata generation including:
 * - Meta tags for search engines (title, description, robots)
 * - Open Graph tags for social sharing (Facebook, LinkedIn, etc.)
 * - Twitter Cards for Twitter/X sharing
 * - JSON-LD Schema.org structured data
 * - Canonical URLs and hreflang
 * - Reading time and word count
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * USAGE:
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * const seoData = generateSEOMetadata({
 *   post: blogPost,
 *   author: { name: "John Doe", image: "..." },
 *   featuredImage: { url: "...", width: 1200, height: 630 },
 *   siteConfig: {
 *     name: "My Blog",
 *     baseUrl: "https://example.com",
 *     twitterHandle: "@myblog",
 *     defaultOgImage: "https://example.com/default-og.jpg"
 *   }
 * });
 *
 * // Access different SEO components:
 * seoData.title           // Optimized title (50-60 chars)
 * seoData.metaDescription // Optimized description (150-160 chars)
 * seoData.metaTags        // Array of { name, content }
 * seoData.openGraph       // Open Graph object
 * seoData.twitterCard     // Twitter Card object
 * seoData.jsonLd          // JSON-LD structured data
 * seoData.canonicalUrl    // Canonical URL
 * seoData.hreflang        // Language alternatives
 */
import type { BlogPost, BlogPostWithRelations } from "./schema";
/** SEO length limits (best practices) */
export declare const SEO_LIMITS: {
    /** Page title: 50-60 characters for optimal display in SERP */
    readonly title: {
        readonly min: 30;
        readonly optimal: 55;
        readonly max: 60;
    };
    /** Meta description: 150-160 characters for optimal display */
    readonly description: {
        readonly min: 50;
        readonly optimal: 155;
        readonly max: 160;
    };
    /** Open Graph title: up to 88 characters */
    readonly ogTitle: {
        readonly max: 88;
    };
    /** Open Graph description: up to 200 characters */
    readonly ogDescription: {
        readonly max: 200;
    };
    /** Twitter title: up to 70 characters */
    readonly twitterTitle: {
        readonly max: 70;
    };
    /** Twitter description: up to 200 characters */
    readonly twitterDescription: {
        readonly max: 200;
    };
};
/** Schema.org types for blog content */
export declare const SCHEMA_TYPES: {
    readonly BLOG_POSTING: "BlogPosting";
    readonly ARTICLE: "Article";
    readonly NEWS_ARTICLE: "NewsArticle";
    readonly TECH_ARTICLE: "TechArticle";
    readonly SCHOLARLY_ARTICLE: "ScholarlyArticle";
    readonly BLOG: "Blog";
    readonly WEB_PAGE: "WebPage";
    readonly PERSON: "Person";
    readonly ORGANIZATION: "Organization";
    readonly IMAGE_OBJECT: "ImageObject";
};
/** Robot meta directives */
export declare const ROBOT_DIRECTIVES: {
    readonly INDEX_FOLLOW: "index,follow";
    readonly INDEX_NOFOLLOW: "index,nofollow";
    readonly NOINDEX_FOLLOW: "noindex,follow";
    readonly NOINDEX_NOFOLLOW: "noindex,nofollow";
    readonly INDEX_FOLLOW_NOARCHIVE: "index,follow,noarchive";
    readonly NOINDEX_NOFOLLOW_NOARCHIVE: "noindex,nofollow,noarchive";
};
/**
 * WhatsApp Open Graph Image Requirements (STRICT)
 *
 * WhatsApp is VERY picky about og:image. If these requirements are not met,
 * WhatsApp will NOT show the image preview in chats.
 *
 * Source: https://developers.facebook.com/docs/sharing/webmasters/images/
 * WhatsApp specific: https://stackoverflow.com/questions/19778620/provide-an-image-for-whatsapp-link-sharing
 */
export declare const WHATSAPP_OG_LIMITS: {
    /** Maximum file size: 300KB (WhatsApp will reject larger images) */
    readonly maxFileSizeKB: 300;
    readonly maxFileSizeBytes: number;
    /**
     * Ideal dimensions for og:image
     * Aspect ratio: 1.91:1 (Facebook/LinkedIn standard)
     * WhatsApp crops to square in some cases, so center important content
     */
    readonly idealDimensions: {
        readonly width: 1200;
        readonly height: 630;
        readonly ratio: 1.91;
    };
    /** Minimum dimensions (below this WhatsApp may not show preview) */
    readonly minDimensions: {
        readonly width: 400;
        readonly height: 400;
    };
    /**
     * Accepted formats for WhatsApp og:image
     * JPG and PNG are safest
     * AVOID WebP - some older WhatsApp versions don't render it
     * AVOID GIF - not supported for preview
     * AVOID SVG - not supported
     */
    readonly acceptedFormats: readonly ["image/jpeg", "image/jpg", "image/png"];
    readonly acceptedExtensions: readonly [".jpg", ".jpeg", ".png"];
    /**
     * Format recommendations by platform:
     * - WhatsApp: JPG/PNG only, < 300KB
     * - Facebook: JPG/PNG/WebP, any size
     * - LinkedIn: JPG/PNG, minimum 1200x627
     * - Twitter: JPG/PNG/WebP/GIF, any size
     */
    readonly recommendedFormat: "image/jpeg";
};
/** Open Graph content types */
export declare const OG_TYPES: {
    /** Default for web pages */
    readonly WEBSITE: "website";
    /** For blog posts and articles */
    readonly ARTICLE: "article";
    /** For news content */
    readonly NEWS_ARTICLE: "news.article";
    /** For video content */
    readonly VIDEO: "video.other";
    /** For audio content */
    readonly AUDIO: "audio.other";
    /** For books */
    readonly BOOK: "book";
    /** For profiles */
    readonly PROFILE: "profile";
};
/** Twitter Card types */
export declare const TWITTER_CARD_TYPES: {
    /** Summary card (small image, 1:1 ratio) */
    readonly SUMMARY: "summary";
    /** Large image card (2:1 ratio, RECOMMENDED) */
    readonly SUMMARY_LARGE_IMAGE: "summary_large_image";
    /** App card (for mobile apps) */
    readonly APP: "app";
    /** Player card (for video/audio) */
    readonly PLAYER: "player";
};
/**
 * Focal point for smart cropping (normalized coordinates 0-1)
 */
export interface FocalPoint {
    x: number;
    y: number;
}
/**
 * Generate featured image URL using media preset endpoint
 * Endpoint: /api/media/preset/{id}/large
 *
 * @param mediaId - The media item UUID
 * @param baseUrl - Optional base URL (defaults to empty string for relative URLs)
 * @returns Transform URL for featured image (1200x800, webp, quality 90)
 */
export declare function getFeaturedImageUrl(mediaId: string, baseUrl?: string): string;
/**
 * Generate OG image URL using media transform endpoint
 * Optimized for WhatsApp/Facebook (1200x630, jpeg, quality 90)
 * Endpoint: /api/media/transform/{id}?w=1200&h=630&fit=cover&f=jpeg&q=90
 *
 * @param mediaId - The media item UUID
 * @param focalPoint - Optional focal point for smart cropping
 * @param baseUrl - Optional base URL (defaults to empty string for relative URLs)
 * @returns Transform URL for OG image
 */
export declare function getOGImageUrl(mediaId: string, focalPoint?: FocalPoint, baseUrl?: string): string;
/**
 * Generate custom transform URL with specific dimensions
 *
 * @param mediaId - The media item UUID
 * @param width - Target width
 * @param height - Target height (optional)
 * @param options - Transform options
 * @param baseUrl - Optional base URL
 * @returns Custom transform URL
 */
export declare function getTransformUrl(mediaId: string, width: number, height?: number, options?: {
    fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
    format?: 'jpeg' | 'png' | 'webp' | 'avif';
    quality?: number;
    focalPoint?: FocalPoint;
}, baseUrl?: string): string;
/** Site-wide SEO configuration */
export interface SiteSEOConfig {
    /** Site name (appears in title: "Post Title | Site Name") */
    name: string;
    /** Base URL without trailing slash (e.g., "https://example.com") */
    baseUrl: string;
    /** Default language code (e.g., "es", "en") */
    defaultLanguage?: string;
    /** Twitter/X handle (e.g., "@myblog") */
    twitterHandle?: string;
    /** Default Open Graph image URL */
    defaultOgImage?: string;
    /** Site description (fallback) */
    defaultDescription?: string;
    /** Organization/Publisher info for Schema.org */
    publisher?: {
        name: string;
        logo?: string;
        url?: string;
    };
    /** Social media profiles for SameAs */
    socialProfiles?: {
        twitter?: string;
        facebook?: string;
        linkedin?: string;
        instagram?: string;
        youtube?: string;
    };
}
/** Author information */
export interface AuthorInfo {
    id: string;
    name: string;
    email?: string;
    image?: string;
    bio?: string;
    jobTitle?: string;
    url?: string;
    sameAs?: string[];
}
/** Featured image with dimensions */
export interface FeaturedImage {
    id: string;
    url: string;
    alt?: string;
    width?: number;
    height?: number;
    mimeType?: string;
    /** File size in bytes (for WhatsApp validation) */
    fileSize?: number;
}
/**
 * Open Graph image with WhatsApp-specific requirements
 * This is the image used for social sharing previews
 */
export interface OGImage {
    /** Image URL - MUST be absolute (not relative) */
    url: string;
    /** Alt text for accessibility */
    alt: string;
    /** Width in pixels (ideally 1200 for WhatsApp) */
    width: number;
    /** Height in pixels (ideally 630 for WhatsApp) */
    height: number;
    /** MIME type - should be image/jpeg or image/png for WhatsApp */
    type: string;
    /** File size in bytes (must be < 300KB for WhatsApp) */
    fileSize?: number;
    /** Whether this image meets WhatsApp requirements */
    isWhatsAppCompatible?: boolean;
}
/** SEO Overrides from database */
export interface SEOOverrides {
    /** Custom meta title (overrides auto-generated) */
    metaTitle?: string;
    /** Custom meta description (overrides auto-generated) */
    metaDescription?: string;
    /** Canonical URL override */
    canonicalUrl?: string;
    /** Robots meta tag override */
    robots?: string;
    /** Focus keyword for analysis */
    focusKeyword?: string;
    /** Prevent search engines from indexing */
    noindex?: boolean;
    /** Prevent search engines from following links */
    nofollow?: boolean;
    /** Open Graph overrides */
    og?: {
        title?: string;
        description?: string;
        /** @deprecated Use imageId instead for transform endpoint support */
        image?: string;
        /** Media ID for transform endpoint (preferred) */
        imageId?: string;
        imageAlt?: string;
        type?: string;
    };
    /** Twitter Card overrides */
    twitter?: {
        title?: string;
        description?: string;
        image?: string;
        card?: "summary" | "summary_large_image" | "app" | "player";
    };
    /** Schema.org overrides */
    schema?: {
        type?: keyof typeof SCHEMA_TYPES;
        articleSection?: string;
    };
    /** Keywords for meta tag (comma-separated) */
    keywords?: string;
    /** Language variants (hreflang) */
    hreflang?: Array<{
        lang: string;
        url: string;
    }>;
}
/** Individual meta tag */
export interface MetaTag {
    name?: string;
    property?: string;
    content?: string;
    charset?: string;
    httpEquiv?: string;
}
/** Open Graph metadata */
export interface OpenGraphData {
    /** Open Graph title (appears on Facebook, LinkedIn, WhatsApp) */
    title: string;
    /**
     * Open Graph description
     * For WhatsApp: Keep it persuasive and mobile-friendly (1-2 lines)
     */
    description: string;
    /** Canonical URL - MUST be absolute URL */
    url: string;
    /** Content type - use 'article' for blog posts */
    type: string;
    /**
     * Open Graph image - CRITICAL for WhatsApp
     * Must be: < 300KB, 1200x630px ideal, JPG/PNG format
     */
    image?: OGImage;
    /** Site name (appears above title on Facebook) */
    siteName: string;
    /** Locale format: language_TERRITORY (e.g., "es_ES", "en_US") */
    locale: string;
    /** Article-specific metadata */
    article?: {
        /** ISO 8601 published date */
        publishedTime: string;
        /** ISO 8601 modified date */
        modifiedTime?: string;
        /** Author name */
        author?: string;
        /** Article category/section */
        section?: string;
        /** Article tags */
        tags?: string[];
    };
}
/** Twitter Card metadata */
export interface TwitterCardData {
    card: "summary" | "summary_large_image" | "app" | "player";
    site?: string;
    creator?: string;
    title: string;
    description: string;
    image?: string;
    imageAlt?: string;
}
/** JSON-LD structured data */
export interface JsonLdData {
    "@context": string;
    "@type": string;
    [key: string]: any;
}
/** Complete SEO metadata package */
export interface SEOMetadata {
    /** Optimized page title (50-60 chars) */
    title: string;
    /** Optimized meta description (150-160 chars) */
    metaDescription: string;
    /** Canonical URL */
    canonicalUrl: string;
    /** Array of all meta tags */
    metaTags: MetaTag[];
    /** Open Graph data (WhatsApp, Facebook, LinkedIn) */
    openGraph: OpenGraphData;
    /** Twitter Card data (X/Twitter) */
    twitterCard: TwitterCardData;
    /** JSON-LD structured data scripts */
    jsonLd: JsonLdData[];
    /** Robots directive */
    robots: string;
    /** Hreflang alternatives */
    hreflang?: Array<{
        lang: string;
        url: string;
    }>;
    /** Keywords meta tag */
    keywords?: string;
    /** Reading time in minutes */
    readingTime?: number;
    /** Word count */
    wordCount?: number;
    /** SEO validation warnings (title, description, keywords) */
    warnings?: string[];
    /** SEO score (0-100) */
    score?: number;
    /**
     * WhatsApp Open Graph image validation
     * Critical for ensuring image previews work on WhatsApp
     */
    whatsAppValidation?: WhatsAppImageValidation | null;
}
/** Options for SEO generation */
export interface SEOMetadataOptions {
    post: BlogPost | BlogPostWithRelations;
    author?: AuthorInfo;
    featuredImage?: FeaturedImage | null;
    siteConfig: SiteSEOConfig;
    /** Additional tags for this post */
    tags?: Array<{
        name: string;
        slug: string;
    }>;
    /** Categories/sections */
    categories?: string[];
    /** Is this a news article (time-sensitive)? */
    isNewsArticle?: boolean;
    /** Previous post (for navigation) */
    prevPost?: {
        title: string;
        slug: string;
    } | null;
    /** Next post (for navigation) */
    nextPost?: {
        title: string;
        slug: string;
    } | null;
    /** Related posts */
    relatedPosts?: Array<{
        title: string;
        slug: string;
    }>;
}
/**
 * Strip HTML tags and normalize whitespace
 */
export declare function stripHtml(html: string): string;
/**
 * Extract text content from Lexical editor JSON
 */
export declare function extractTextFromLexical(content: any): string;
/**
 * Truncate text to specific character count, ending at word boundary
 */
export declare function truncateToLimit(text: string, limit: number, addEllipsis?: boolean): string;
/**
 * Count words in text
 */
export declare function countWords(text: string): number;
/**
 * Estimate reading time in minutes
 */
export declare function estimateReadingTime(content: string | any, wordsPerMinute?: number): number;
/**
 * Format ISO date string
 */
export declare function formatISODate(date: Date | string | null): string | undefined;
/**
 * Generate post URL
 */
export declare function generatePostUrl(siteConfig: SiteSEOConfig, slug: string): string;
/**
 * Generate title with site name suffix (respects 60 char limit)
 */
export declare function generateTitle(postTitle: string, siteName: string, separator?: string, override?: string): string;
/**
 * Generate meta description from excerpt or content
 */
export declare function generateMetaDescription(excerpt: string | null | undefined, content: any, override?: string): string;
/**
 * Validation result for WhatsApp Open Graph image
 */
export interface WhatsAppImageValidation {
    /** Whether the image meets ALL WhatsApp requirements */
    isValid: boolean;
    /** Specific checks that passed/failed */
    checks: {
        format: boolean;
        fileSize: boolean;
        dimensions: boolean;
        minDimensions: boolean;
        isAbsoluteUrl: boolean;
    };
    /** Human-readable warnings */
    warnings: string[];
    /** Recommendations for fixing issues */
    recommendations: string[];
    /** Image metadata */
    metadata: {
        format?: string;
        fileSizeKB?: number;
        width?: number;
        height?: number;
        aspectRatio?: number;
    };
}
/**
 * Check if image format is compatible with WhatsApp
 * WhatsApp only reliably supports JPG and PNG
 * WebP, GIF, SVG may not render in previews
 */
export declare function isWhatsAppCompatibleFormat(mimeType?: string): boolean;
/**
 * Get file extension from URL or MIME type
 */
export declare function getImageFormat(url: string, mimeType?: string): string;
/**
 * Validate if an image URL is absolute (required for Open Graph)
 * WhatsApp/Facebook require absolute URLs, not relative paths
 */
export declare function isAbsoluteUrl(url: string): boolean;
/**
 * Make a URL absolute if it's relative
 */
export declare function makeAbsoluteUrl(url: string, baseUrl: string): string;
/**
 * Validate image dimensions for WhatsApp
 * Ideal: 1200x630 (1.91:1 ratio)
 * Minimum: 400x400
 */
export declare function validateWhatsAppDimensions(width?: number, height?: number): {
    isValid: boolean;
    warnings: string[];
    recommendations: string[];
};
/**
 * Validate file size for WhatsApp (< 300KB)
 */
export declare function validateWhatsAppFileSize(fileSizeBytes?: number): {
    isValid: boolean;
    warnings: string[];
    fileSizeKB?: number;
};
/**
 * Complete WhatsApp Open Graph image validation
 * This is the main function to validate if an image will work on WhatsApp
 */
export declare function validateWhatsAppImage(imageUrl: string, options?: {
    width?: number;
    height?: number;
    fileSizeBytes?: number;
    mimeType?: string;
}): WhatsAppImageValidation;
/**
 * Generate Open Graph image object with WhatsApp validation
 * This ensures the image meets all requirements before being used
 */
export declare function generateOGImage(imageUrl: string, options?: {
    alt?: string;
    width?: number;
    height?: number;
    mimeType?: string;
    fileSizeBytes?: number;
    baseUrl?: string;
}): OGImage;
/**
 * Validate SEO metadata and return warnings
 */
export declare function validateSEO(title: string, metaDescription: string, focusKeyword?: string, content?: string): string[];
/**
 * Calculate SEO score (0-100)
 */
export declare function calculateSEOScore(title: string, metaDescription: string, hasFeaturedImage: boolean, hasAuthor: boolean, hasKeywords: boolean, warnings: string[]): number;
/**
 * Generate complete SEO metadata for a blog post
 *
 * This is the main function that generates all SEO components:
 * - Meta tags for search engines
 * - Open Graph tags for social sharing
 * - Twitter Card tags
 * - JSON-LD structured data (Schema.org)
 */
export declare function generateSEOMetadata(options: SEOMetadataOptions): SEOMetadata;
/**
 * Render meta tags as HTML string
 */
export declare function renderMetaTagsHTML(metaTags: MetaTag[]): string;
/**
 * Render JSON-LD scripts as HTML string
 */
export declare function renderJsonLdHTML(jsonLd: JsonLdData[]): string;
/**
 * Render canonical link tag
 */
export declare function renderCanonicalHTML(canonicalUrl: string): string;
/**
 * Render hreflang tags
 */
export declare function renderHreflangHTML(hreflang: Array<{
    lang: string;
    url: string;
}>): string;
/**
 * Generate complete HTML head content
 */
export declare function renderSEOHead(seo: SEOMetadata): string;
declare const _default: {
    generateSEOMetadata: typeof generateSEOMetadata;
    generateTitle: typeof generateTitle;
    generateMetaDescription: typeof generateMetaDescription;
    validateSEO: typeof validateSEO;
    calculateSEOScore: typeof calculateSEOScore;
    renderSEOHead: typeof renderSEOHead;
    renderMetaTagsHTML: typeof renderMetaTagsHTML;
    renderJsonLdHTML: typeof renderJsonLdHTML;
    validateWhatsAppImage: typeof validateWhatsAppImage;
    generateOGImage: typeof generateOGImage;
    isWhatsAppCompatibleFormat: typeof isWhatsAppCompatibleFormat;
    isAbsoluteUrl: typeof isAbsoluteUrl;
    makeAbsoluteUrl: typeof makeAbsoluteUrl;
    SEO_LIMITS: {
        /** Page title: 50-60 characters for optimal display in SERP */
        readonly title: {
            readonly min: 30;
            readonly optimal: 55;
            readonly max: 60;
        };
        /** Meta description: 150-160 characters for optimal display */
        readonly description: {
            readonly min: 50;
            readonly optimal: 155;
            readonly max: 160;
        };
        /** Open Graph title: up to 88 characters */
        readonly ogTitle: {
            readonly max: 88;
        };
        /** Open Graph description: up to 200 characters */
        readonly ogDescription: {
            readonly max: 200;
        };
        /** Twitter title: up to 70 characters */
        readonly twitterTitle: {
            readonly max: 70;
        };
        /** Twitter description: up to 200 characters */
        readonly twitterDescription: {
            readonly max: 200;
        };
    };
    SCHEMA_TYPES: {
        readonly BLOG_POSTING: "BlogPosting";
        readonly ARTICLE: "Article";
        readonly NEWS_ARTICLE: "NewsArticle";
        readonly TECH_ARTICLE: "TechArticle";
        readonly SCHOLARLY_ARTICLE: "ScholarlyArticle";
        readonly BLOG: "Blog";
        readonly WEB_PAGE: "WebPage";
        readonly PERSON: "Person";
        readonly ORGANIZATION: "Organization";
        readonly IMAGE_OBJECT: "ImageObject";
    };
    ROBOT_DIRECTIVES: {
        readonly INDEX_FOLLOW: "index,follow";
        readonly INDEX_NOFOLLOW: "index,nofollow";
        readonly NOINDEX_FOLLOW: "noindex,follow";
        readonly NOINDEX_NOFOLLOW: "noindex,nofollow";
        readonly INDEX_FOLLOW_NOARCHIVE: "index,follow,noarchive";
        readonly NOINDEX_NOFOLLOW_NOARCHIVE: "noindex,nofollow,noarchive";
    };
    WHATSAPP_OG_LIMITS: {
        /** Maximum file size: 300KB (WhatsApp will reject larger images) */
        readonly maxFileSizeKB: 300;
        readonly maxFileSizeBytes: number;
        /**
         * Ideal dimensions for og:image
         * Aspect ratio: 1.91:1 (Facebook/LinkedIn standard)
         * WhatsApp crops to square in some cases, so center important content
         */
        readonly idealDimensions: {
            readonly width: 1200;
            readonly height: 630;
            readonly ratio: 1.91;
        };
        /** Minimum dimensions (below this WhatsApp may not show preview) */
        readonly minDimensions: {
            readonly width: 400;
            readonly height: 400;
        };
        /**
         * Accepted formats for WhatsApp og:image
         * JPG and PNG are safest
         * AVOID WebP - some older WhatsApp versions don't render it
         * AVOID GIF - not supported for preview
         * AVOID SVG - not supported
         */
        readonly acceptedFormats: readonly ["image/jpeg", "image/jpg", "image/png"];
        readonly acceptedExtensions: readonly [".jpg", ".jpeg", ".png"];
        /**
         * Format recommendations by platform:
         * - WhatsApp: JPG/PNG only, < 300KB
         * - Facebook: JPG/PNG/WebP, any size
         * - LinkedIn: JPG/PNG, minimum 1200x627
         * - Twitter: JPG/PNG/WebP/GIF, any size
         */
        readonly recommendedFormat: "image/jpeg";
    };
    OG_TYPES: {
        /** Default for web pages */
        readonly WEBSITE: "website";
        /** For blog posts and articles */
        readonly ARTICLE: "article";
        /** For news content */
        readonly NEWS_ARTICLE: "news.article";
        /** For video content */
        readonly VIDEO: "video.other";
        /** For audio content */
        readonly AUDIO: "audio.other";
        /** For books */
        readonly BOOK: "book";
        /** For profiles */
        readonly PROFILE: "profile";
    };
    TWITTER_CARD_TYPES: {
        /** Summary card (small image, 1:1 ratio) */
        readonly SUMMARY: "summary";
        /** Large image card (2:1 ratio, RECOMMENDED) */
        readonly SUMMARY_LARGE_IMAGE: "summary_large_image";
        /** App card (for mobile apps) */
        readonly APP: "app";
        /** Player card (for video/audio) */
        readonly PLAYER: "player";
    };
};
export default _default;
//# sourceMappingURL=seo-utils.d.ts.map