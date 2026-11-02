/**
 * Páginas de wiki en el frontend: enlaces que resuelven y nada que ejecute
 * ============================================================================
 *
 * Una página de wiki la edita CUALQUIER sesión y se sirve en su subdominio.
 * Lo que se fija aquí son las dos promesas de `renderizarPaginaWiki`:
 *
 *   1. `[[Enlace]]` lleva al mismo slug que el servidor indexa al guardar —
 *      por eso el motor de enlaces vive en `@kitsuden/shared` y no copiado.
 *   2. Ni HTML colado ni `javascript:` en un enlace markdown llegan a la
 *      página. `marked` no sanea por sí mismo desde la versión 5.
 */

import { describe, expect, it } from "vitest";

import {
  extraerEnlacesWiki,
  markdownSeguro,
  renderizarPaginaWiki,
} from "../../packages/shared/src/index";

const aRaiz = (slug: string) => `/${slug}`;

describe("[[enlaces]] en la página pública", () => {
  it("apuntan al mismo slug que el servidor indexa", () => {
    const contenido = "Mira [[Espada Larga]] y [[Baldur's Gate 3]].";
    const html = renderizarPaginaWiki(contenido, aRaiz);

    for (const enlace of extraerEnlacesWiki(contenido)) {
      expect(html).toContain(`href="/${enlace.slug}"`);
    }
    expect(html).toContain('href="/baldurs-gate-3"');
  });

  it("usan la etiqueta alternativa cuando la hay", () => {
    const html = renderizarPaginaWiki("[[Espada Larga|la espada]]", aRaiz);
    expect(html).toContain('<a href="/espada-larga">la espada</a>');
  });

  it("los corchetes del texto no rompen el enlace", () => {
    const html = renderizarPaginaWiki("[[Armas|Armas [T1]]]", aRaiz);
    expect(html).toContain('href="/armas"');
  });
});

describe("nada ejecutable llega a la página", () => {
  it("el HTML escrito en la página sale como texto", () => {
    const html = renderizarPaginaWiki(
      '<script>alert(1)</script><img src=x onerror="alert(1)">',
      aRaiz
    );
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img[^>]+onerror/i);
  });

  it("un enlace markdown a javascript: se queda en texto", () => {
    /**
     * Era el hueco: escapar `<` no toca la sintaxis markdown, y `marked`
     * convertía esto en un `<a href="javascript:…">` que ejecutaba al pulsar.
     */
    const html = renderizarPaginaWiki("[pulsa](javascript:alert(1))", aRaiz);
    expect(html).not.toMatch(/href="javascript:/i);
    expect(html).toContain("pulsa");
  });

  it("tampoco pasan data: ni vbscript:, ni en imágenes", () => {
    const html = markdownSeguro(
      "[a](data:text/html,<b>x</b>) [b](vbscript:msgbox) ![c](javascript:alert(1))"
    );
    expect(html).not.toMatch(/(href|src)="(data|vbscript|javascript):/i);
  });

  it("los enlaces normales siguen funcionando", () => {
    const html = markdownSeguro(
      "[web](https://kitsuden.gg) y [interna](/armas) ![logo](/logo.png)"
    );
    expect(html).toContain('<a href="https://kitsuden.gg">web</a>');
    expect(html).toContain('<a href="/armas">interna</a>');
    expect(html).toContain('<img src="/logo.png" alt="logo">');
  });

  it("las citas siguen siendo citas (el > no se escapa)", () => {
    expect(markdownSeguro("> una cita")).toContain("<blockquote>");
  });
});
