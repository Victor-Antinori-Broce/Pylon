/**
 * Content Publishing Utilities
 *
 * Helper functions for content generation and manipulation.
 * These were previously in @gremius/core/content-publishing
 */
/**
 * Generate a URL-friendly slug from a string
 */
export declare function generateSlug(text: string): string;
/**
 * Render a template string with data interpolation
 * Simple template: "Hello {name}" + {name: "World"} = "Hello World"
 */
export declare function renderTemplate(template: string, data: Record<string, any>): string;
/**
 * Generate an excerpt from content
 * Takes first N characters and adds ellipsis if truncated
 */
export declare function generateExcerpt(content: Record<string, any>, maxLength?: number): string;
/**
 * Estimate reading time in minutes
 * Average reading speed: 200 words per minute
 */
export declare function estimateReadingTime(text: string, wordsPerMinute?: number): number;
/**
 * Sanitize HTML content
 * Basic sanitization - removes script tags and dangerous attributes
 */
export declare function sanitizeHtml(html: string): string;
/**
 * Convert plain text to HTML paragraphs
 */
export declare function textToHtml(text: string): string;
/**
 * Extract first image URL from HTML content
 */
export declare function extractFirstImage(html: string): string | null;
/**
 * Count words in text
 */
export declare function countWords(text: string): number;
/**
 * Truncate text with ellipsis
 */
export declare function truncate(text: string, maxLength: number, suffix?: string): string;
//# sourceMappingURL=content-utils.d.ts.map