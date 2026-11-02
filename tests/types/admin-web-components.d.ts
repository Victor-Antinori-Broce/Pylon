/**
 * Vistas de admin de terceros: Web Components en `.js`
 * ============================================================================
 *
 * Las vistas que aporta un kon al admin NO son fuente `.svelte` que se importe
 * en tiempo de compilación: son Web Components (`type: "element"`) que se
 * cargan en tiempo de EJECUCIÓN, ya construidos. El núcleo del admin sigue
 * siendo Svelte; el punto de extensión es deliberadamente `.js` plano para que
 * un tercero no tenga que compilar contra nuestra cadena de herramientas.
 *
 * Por eso no hay —ni debe haber— un `.d.ts` junto a cada componente, y por eso
 * TypeScript se queja (TS7016) cuando un test los importa.
 *
 * El import de un componente así es SIEMPRE por su efecto: al evaluarse, el
 * módulo se registra en `customElements`. No exporta nada que se use. De ahí
 * que el tipo declarado aquí sea vacío: decir `any` invitaría a leer exports
 * que no existen.
 *
 * Para probar otro componente, añade su línea. Se listan uno a uno a propósito:
 * un `declare module "*.js"` genérico se tragaría también los errores de tipo
 * de cualquier `.js` legítimo que entrara en el programa.
 */

declare module "*/admin/tierlist-editor.js" {
  const _: Record<string, never>;
  export = _;
}
