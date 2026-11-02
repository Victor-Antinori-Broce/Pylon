/**
 * Saneador de HTML: los autoenlaces de markdown no son una puerta trasera
 * ============================================================================
 *
 * Auditoría 2026-10-25 (A1): el paso de «autoenlaces» apartaba TAL CUAL todo
 * lo que pareciera `<algo@algo>` o `<https:…>`, y lo apartado no pasaba por la
 * lista blanca. Para el navegador `<x@x/onfocus=…>` es una etiqueta `x@x` con
 * un manejador de eventos (la `/` corta el nombre), y `<https://x/onfocus=…>`
 * otra (`https:`). Era XSS almacenado en el blog, los bloques y la wiki.
 *
 * Ahora un autoenlace se reescribe como `<a href>` construido por el saneador.
 * Las dos copias (blog y bloques) tienen que decir lo mismo.
 */

import { describe, expect, it } from "vitest";

import { sanearHtml as deBloques } from "../../packages/core/blocks/blocks.saneado";
import { sanearHtml as delBlog } from "../../packages/kons/kon-blog/src/saneado";

const CARGAS = [
  `<x@x/tabindex='1'/autofocus/onfocus='alert(document.domain)'>`,
  `<https://x/onfocus=alert(1)/autofocus/tabindex=1>`,
  `<mailto:x/onmouseover=alert(1)>`,
  `<a@b.c/onfocus=alert(1)>`,
  `<javascript:alert(1)>`,
];

for (const [nombre, sanear] of [
  ["blog", delBlog],
  ["bloques", deBloques],
] as const) {
  describe(`saneado de ${nombre}: autoenlaces`, () => {
    it("ninguna carga deja un manejador de eventos vivo", () => {
      for (const carga of CARGAS) {
        const limpio = sanear(carga);
        // Un manejador solo es peligroso DENTRO de una etiqueta: fuera de un
        // atributo construido (href="…") no debe quedar ninguno.
        const sinHref = limpio.replace(/href="[^"]*"/g, "");
        expect(sinHref, carga).not.toMatch(/<[^>]*\bon[a-z]+\s*=/i);
        expect(limpio, carga).not.toMatch(/<(?!a\b|\/a\b)[a-z][^>]*@/i);
        expect(limpio, carga).not.toContain("javascript:");
      }
    });

    it("los autoenlaces legítimos siguen siendo enlaces", () => {
      expect(sanear("<https://example.com/a?b=1&c=2>")).toBe(
        '<a href="https://example.com/a?b=1&amp;c=2">https://example.com/a?b=1&amp;c=2</a>'
      );
      expect(sanear("<ana@example.com>")).toBe('<a href="mailto:ana@example.com">ana@example.com</a>');
      expect(sanear("<mailto:a@b.c>")).toBe('<a href="mailto:a@b.c">mailto:a@b.c</a>');
    });

    it("es idempotente y no toca lo que no es etiqueta", () => {
      for (const t of [...CARGAS, "<https://example.com>", "a < b y <3"]) {
        expect(sanear(sanear(t)), t).toBe(sanear(t));
      }
      expect(sanear("a < b y <3")).toBe("a < b y <3");
    });
  });
}
