/**
 * Lo que un kon declara en `admin.views` tiene que llegar al panel
 * ============================================================================
 *
 * ── EL FALLO ───────────────────────────────────────────────────────────────
 *
 * `admin-registry.ts` convierte cada vista del `kon.json` en el objeto que
 * viaja al panel, copiando CAMPO POR CAMPO:
 *
 *     const view = { id: raw.id, type, title: raw.title, table: raw.table };
 *     if (raw.groupBy !== undefined) view.groupBy = raw.groupBy;
 *     …
 *
 * Lo que no se nombra ahí desaparece. Sin error, sin aviso, sin rastro.
 *
 * `defaultFilter` no estaba. Es el campo que hace que «Publicados» enseñe los
 * publicados y «Borradores» los borradores, así que las dos pestañas pedían la
 * tabla entera y enseñaban lo mismo: un post en borrador salía bajo
 * «Publicados».
 *
 * ── LO QUE HACE ESTE CASO INSTRUCTIVO ──────────────────────────────────────
 *
 * Ya se había «arreglado» una vez. En el cliente, `generateExplorerConfig`
 * tampoco copiaba `defaultFilter`; se corrigió eso, se comprobó que la copia
 * estaba, y el fallo siguió exactamente igual — porque el dato nunca salía del
 * servidor. Se reparó la segunda mitad del camino mientras la primera seguía
 * cortada, y la prueba de entonces pasaba en verde vigilando la mitad
 * equivocada.
 *
 * Por eso esta prueba no mira una lista escrita a mano: LEE las claves que los
 * kons usan de verdad y las contrasta con las que el mapeo menciona. Si mañana
 * alguien añade `defaultSort` a un `kon.json`, esto falla hasta que se reenvíe.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const REGISTRO = join(RAIZ, "apps", "api", "src", "services", "admin-registry.ts");

/** Las carpetas donde viven los kons con manifiesto. */
const ORIGENES = [join(RAIZ, "packages", "kons"), join(RAIZ, "packages", "core")];

/** Claves que el mapeo procesa de forma especial y no necesitan reenvío literal. */
const ESTRUCTURALES = new Set(["id", "type", "title", "table", "component"]);

function clavesUsadasEnVistas(): Map<string, string[]> {
  const usos = new Map<string, string[]>();

  for (const origen of ORIGENES) {
    if (!existsSync(origen)) continue;

    for (const dir of readdirSync(origen)) {
      const manifiesto = join(origen, dir, "kon.json");
      if (!existsSync(manifiesto)) continue;

      let kon: { id?: string; admin?: { views?: Record<string, unknown>[] } };
      try {
        kon = JSON.parse(readFileSync(manifiesto, "utf-8"));
      } catch {
        continue;
      }

      const konId = kon.id || dir;
      for (const vista of kon.admin?.views ?? []) {
        for (const clave of Object.keys(vista)) {
          usos.set(clave, [...new Set([...(usos.get(clave) ?? []), konId])]);
        }
      }
    }
  }

  return usos;
}

describe("los campos declarados por los kons llegan al panel", () => {
  const registro = readFileSync(REGISTRO, "utf-8");
  const usadas = clavesUsadasEnVistas();

  it("se han encontrado vistas que analizar", () => {
    expect(
      usadas.size,
      "no se leyó ninguna clave de `admin.views`. Si cambió la forma de los " +
        "manifiestos, esta prueba pasaría vacía sin vigilar nada."
    ).toBeGreaterThan(4);
  });

  it("ninguna clave usada se cae por el camino", () => {
    const perdidas: string[] = [];

    for (const [clave, kons] of usadas) {
      if (ESTRUCTURALES.has(clave)) continue;

      /**
       * Se busca `raw.<clave>` — la forma que tiene el reenvío. Basta con que
       * el mapeo la nombre: si la nombra, alguien decidió qué hacer con ella.
       * Lo que esto persigue es el olvido, no una firma concreta.
       */
      if (!new RegExp(`raw\\.${clave}\\b`).test(registro)) {
        perdidas.push(
          `«${clave}» la declaran ${kons.join(", ")} y \`admin-registry.ts\` no ` +
            `la menciona, así que no sale del servidor. El panel nunca la ve y ` +
            `no hay ningún error: simplemente no pasa lo que el kon pidió.`
        );
      }
    }

    expect(perdidas, perdidas.join("\n\n")).toEqual([]);
  });

  it("`defaultFilter` viaja, que es lo que separa una pestaña de otra", () => {
    /**
     * El caso concreto, aparte, para que si vuelve a caerse el mensaje diga
     * exactamente qué se rompe y no un fallo genérico.
     */
    expect(
      /raw\.defaultFilter\b/.test(registro),
      "sin `defaultFilter`, «Publicados» y «Borradores» piden la misma tabla sin " +
        "filtrar y enseñan lo mismo: un borrador aparece bajo «Publicados»."
    ).toBe(true);
  });
});
