/**
 * Mock de `$app/navigation` para tests unitarios.
 *
 * El alias a este fichero ya estaba en vitest.config.ts, pero el fichero nunca
 * se creó: cualquier test que importara —aunque fuera de forma transitiva— un
 * componente con `goto` fallaba al resolver, sin llegar a ejecutar ni un caso.
 */

export const goto = async (_url: string | URL) => {};
export const invalidate = async (_dep?: string) => {};
export const invalidateAll = async () => {};
export const preloadData = async (_href: string) => ({});
export const preloadCode = async (..._urls: string[]) => {};
export const pushState = (_url: string, _state: unknown) => {};
export const replaceState = (_url: string, _state: unknown) => {};
export const afterNavigate = (_cb: unknown) => {};
export const beforeNavigate = (_cb: unknown) => {};
export const onNavigate = (_cb: unknown) => {};
export const disableScrollHandling = () => {};
