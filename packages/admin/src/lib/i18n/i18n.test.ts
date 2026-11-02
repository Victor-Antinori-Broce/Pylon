/**
 * El panel habla dos idiomas y ningún texto visible se queda fuera del diccionario
 * ============================================================================
 *
 * Tres comprobaciones, cada una contra una forma distinta de romperlo:
 *
 *   1. en.ts y es.ts tienen EXACTAMENTE las mismas claves, ninguna vacía, y
 *      los mismos `{marcadores}`: si el español pierde un `{count}`, la cifra
 *      desaparece de la pantalla sin error.
 *   2. Toda clave que el código pide con t("...") existe. Una clave que falta
 *      no rompe nada: se pinta la clave en crudo, que es justo lo que no se ve
 *      en una revisión rápida.
 *   3. Heurística de texto suelto: se parsea cada .svelte y se buscan nodos de
 *      texto con letras (y atributos placeholder/title/aria-label/alt/label
 *      escritos a mano). Un texto nuevo sin t() falla aquí.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { parse } from "svelte/compiler";
import { describe, expect, it, vi } from "vitest";

import en from "./en";
import es from "./es";
import { t, setLocale, getLocale } from "./locale.svelte";

const SRC = join(__dirname, "..", "..");

// Parsear ~200 .svelte lleva varios segundos con la suite en paralelo.
vi.setConfig({ testTimeout: 120_000 });

type Dic = Record<string, Record<string, string>>;

function aplanar(d: Dic): Map<string, string> {
  const m = new Map<string, string>();
  for (const [ns, claves] of Object.entries(d)) for (const [k, v] of Object.entries(claves)) m.set(`${ns}.${k}`, v);
  return m;
}

const EN = aplanar(en as Dic);
const ES = aplanar(es as Dic);

const marcadores = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

function fuentes(ext: RegExp): string[] {
  const r: string[] = [];
  (function recorrer(d: string) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) recorrer(p);
      else if (ext.test(e.name) && !/\.test\.ts$/.test(e.name)) r.push(p);
    }
  })(SRC);
  return r;
}

describe("diccionarios", () => {
  it("en y es tienen las mismas claves", () => {
    const soloEn = [...EN.keys()].filter((k) => !ES.has(k));
    const soloEs = [...ES.keys()].filter((k) => !EN.has(k));
    expect({ soloEn, soloEs }).toEqual({ soloEn: [], soloEs: [] });
  });

  it("ningún texto vacío", () => {
    const vacios = [...EN, ...ES].filter(([, v]) => !v.trim()).map(([k]) => k);
    expect(vacios).toEqual([]);
  });

  it("los dos idiomas llevan los mismos {marcadores}", () => {
    const distintos = [...EN].filter(([k, v]) => marcadores(v).join() !== marcadores(ES.get(k) ?? "").join());
    expect(distintos.map(([k]) => k)).toEqual([]);
  });
});

describe("claves usadas en el código", () => {
  it("toda clave pedida con t()/tr() existe en los dos idiomas", () => {
    const faltan: string[] = [];
    for (const f of fuentes(/\.(svelte|ts)$/)) {
      if (f.includes(`${sep}i18n${sep}`)) continue;
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/\btr?\(\s*"([A-Za-z0-9_]+\.[A-Za-z0-9_.]+)"/g)) {
        if (!EN.has(m[1]) || !ES.has(m[1])) faltan.push(`${relative(SRC, f)}: ${m[1]}`);
      }
    }
    expect(faltan).toEqual([]);
  });
});

/**
 * Lo que puede quedarse escrito a mano: nombres propios y siglas que no se
 * traducen. Cuanto más corta la lista, más útil la prueba.
 */
const PERMITIDOS = new Set(["Kitsuden", "Kitsuden Admin", "Kitsuden CMS", "API", "MCP", "SEO", "JSON", "CSV", "URL"]);
const SIN_TEXTO = new Set(["code", "pre", "kbd", "samp", "textarea", "style", "script"]);
const ATRIBUTOS = new Set(["placeholder", "title", "aria-label", "alt", "label"]);

function tieneLetras(s: string): boolean {
  return /\p{L}{2,}/u.test(s);
}

/**
 * Ejemplos técnicos en atributos (sobre todo placeholders): URLs, claves en
 * minúsculas, `sk-...`, colores, siglas. Son iguales en cualquier idioma.
 * Solo se perdonan en ATRIBUTOS: en un nodo de texto, «clear» es una palabra.
 */
function esEjemploTecnico(s: string): boolean {
  return (
    /^https?:\/\//.test(s) ||
    /^[a-z0-9_.\-/]+$/.test(s) ||
    /^[a-z]{2,}-\.{3}$/.test(s) ||
    /^#[0-9a-f]{3,8}$/i.test(s) ||
    /^[A-Z0-9]{2,4}$/.test(s)
  );
}

describe("texto visible fuera del diccionario (heurística)", () => {
  it("ningún .svelte deja texto con letras sin pasar por t()", () => {
    const sueltos: string[] = [];
    for (const f of fuentes(/\.svelte$/)) {
      const src = readFileSync(f, "utf8");
      const ast = parse(src, { modern: true }) as unknown as { fragment: unknown };
      const anotar = (texto: string, nodo: { start: number }) => {
        const limpio = texto.replace(/\s+/g, " ").trim();
        if (!tieneLetras(limpio) || PERMITIDOS.has(limpio)) return;
        const linea = src.slice(0, nodo.start).split("\n").length;
        sueltos.push(`${relative(SRC, f)}:${linea} «${limpio.slice(0, 60)}»`);
      };
      const visitar = (nodo: unknown, padre: string | null): void => {
        if (!nodo || typeof nodo !== "object") return;
        if (Array.isArray(nodo)) return nodo.forEach((n) => visitar(n, padre));
        const n = nodo as Record<string, unknown> & { type?: string; name?: string };
        if (n.type === "Text" && !SIN_TEXTO.has(padre ?? "")) anotar(String(n.data), n as { start: number });
        if (Array.isArray(n.attributes) && (n.type === "RegularElement" || n.type === "Component")) {
          for (const a of n.attributes as Array<Record<string, unknown>>) {
            if (a.type !== "Attribute" || !ATRIBUTOS.has(String(a.name)) || !Array.isArray(a.value)) continue;
            for (const parte of a.value as Array<Record<string, unknown>>) {
              if (parte.type === "Text" && !esEjemploTecnico(String(parte.data).trim()))
                anotar(String(parte.data), parte as unknown as { start: number });
            }
          }
        }
        for (const [k, v] of Object.entries(n)) {
          if (["attributes", "expression", "metadata", "parent", "instance", "module", "css", "options"].includes(k)) continue;
          if (v && typeof v === "object") visitar(v, typeof n.name === "string" ? n.name : padre);
        }
      };
      visitar(ast.fragment, null);
    }
    expect(sueltos).toEqual([]);
  });
});

describe("t()", () => {
  it("inglés por defecto, interpola y cae al inglés", () => {
    expect(getLocale()).toBe("en");
    expect(t("languageSwitcher.language")).toBe("Language");
    expect(t("common.more", { v: 3 })).toBe("+3 more");
    expect(t("no.existe")).toBe("no.existe");
  });

  it("el español se elige y se guarda", () => {
    setLocale("es", { recargar: false });
    expect(t("languageSwitcher.language")).toBe("Idioma");
    expect(localStorage.getItem("kitsuden-admin-locale")).toBe("es");
    setLocale("en", { recargar: false });
    expect(t("languageSwitcher.language")).toBe("Language");
  });
});
