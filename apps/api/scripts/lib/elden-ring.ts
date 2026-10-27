/**
 * Elden Ring → plan de carga (wiki, base de datos y creador de equipo)
 * ============================================================================
 *
 * La WIKI sale de las dos fuentes de abajo. Las HERRAMIENTAS (siete tablas, el
 * creador de equipo y una ficha por arma) salen de las cifras que introdujo el
 * propietario y viven en `elden-ring-herramientas.ts`; si esos ficheros no
 * están, el juego entra solo con wiki.
 *
 * ── DOS FUENTES, Y CADA UNA TAPA EL AGUJERO DE LA OTRA ─────────────────────
 *
 *   · `CyberGiant7/Elden-Ring-Automatic-Checklist` (**MIT**, junio de 2026) —
 *     el catálogo COMPLETO, con Shadow of the Erdtree: 1.663 objetos por
 *     categoría, 41 jefes del DLC y 105 gracias. Pero solo nombre y clase.
 *   · `deliton/eldenring-api` (**sin fichero de licencia**, mayo de 2024) —
 *     los datos gordos del juego base: región, localización, botín y vida de
 *     106 jefes. No tiene nada del DLC.
 *
 * La licenciada gana en cobertura y la otra en profundidad, así que se usan
 * las dos: la MIT pone el esqueleto y la local rellena lo que sabe. Cada
 * página dice de dónde sale lo que enseña, y el riesgo de la segunda lo asume
 * el propietario del proyecto, igual que con la fuente GPL de Wilds.
 *
 * ── LO QUE NO SE CARGA, A PROPÓSITO ────────────────────────────────────────
 *
 * Las **descripciones** son prosa de FromSoftware: no se copian. Van nombres,
 * regiones, botines y números, que son hechos. Y **un jefe del DLC no tiene
 * página propia**: de él solo se conoce el nombre, y una página con un título
 * y nada debajo es peor que una línea en el índice.
 */

import { CATEGORIAS_DEL_SITIO } from "./gacha-comun";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { extraerEnlacesWiki, slugDePaginaWiki } from "@kitsuden/shared";

import { herramientasEldenRing, type DatosDeHerramientasEr } from "./elden-ring-herramientas";
import type { PaginaPlanificada, PlanDeCarga } from "./plan-de-carga";

// ── Lo que traen las fuentes ─────────────────────────────────────────────────

/** `{ "000F4240": { name, class } }` por categoría. */
type CatalogoCrudo = Record<string, Record<string, { name: string; class?: string; subcategory?: string }>>;

interface JefeLocal {
  id: string;
  name: string;
  region?: string | null;
  location?: string | null;
  drops?: string[];
  healthPoints?: string | null;
}

export interface ArteEldenRing {
  portada?: string;
  ilustracion?: string;
  logo?: string;
  /** La portada ya lleva el logo impreso (cápsula de Steam): la tarjeta no lo repite encima */
  logoImpreso?: boolean;
  figuras?: string[];
  steam_app_id?: number;
}

export interface DatosEldenRing {
  /** Commit de la fuente MIT */
  version: string;
  fechaCatalogo: string;
  fechaLocal: string;
  base: CatalogoCrudo;
  dlc: CatalogoCrudo;
  /** Jefes con datos de verdad (fuente local, solo juego base) */
  jefes: JefeLocal[];
  arte: ArteEldenRing;
  /** Las cifras introducidas a mano (armas, armaduras…); sin ellas el juego entra solo con wiki */
  herramientas: DatosDeHerramientasEr | null;
}

/** Fecha en que se revisaron las cifras de las herramientas */
export const REVISADA_HERRAMIENTAS = "2026-10-19";

/** Los ficheros de jefes y gracias del repo MIT vienen en UTF-16. */
function leerJson<T>(ruta: string): T {
  const buf = readFileSync(ruta);
  const utf16 = buf.length > 1 && buf[0] === 0xff && buf[1] === 0xfe;
  const texto = (utf16 ? buf.toString("utf16le") : buf.toString("utf-8")).replace(/^\uFEFF/, "");
  return JSON.parse(texto) as T;
}

function leerHerramientas(raiz: string): DatosDeHerramientasEr | null {
  const f = (n: string) => join(raiz, "data", n);
  if (!existsSync(f("weapons.json"))) return null;
  const lista = <T>(n: string): T[] => {
    const j = leerJson<unknown>(f(n));
    return (Array.isArray(j) ? j : []) as T[];
  };
  return {
    armas: lista("weapons.json"),
    escudos: lista("shields.json"),
    armaduras: lista("armors.json"),
    talismanes: lista("talismans.json"),
    clases: lista("classes.json"),
    cenizas: lista("ashes.json"),
    hechizos: lista("sorceries.json"),
    encantamientos: lista("incantations.json"),
    municion: lista("ammos.json"),
    efectos: existsSync(f("traducciones-efectos.json")) ? leerJson(f("traducciones-efectos.json")) : {},
    // Las descripciones traducidas, en lotes: `traducciones/desc-1.json` … (inglés exacto → es/pt)
    descripciones: existsSync(join(raiz, "data", "traducciones"))
      ? Object.assign(
          {},
          ...readdirSync(join(raiz, "data", "traducciones"))
            .filter((n) => /^desc-\d+\.json$/.test(n))
            .sort()
            .map((n) => leerJson<Record<string, { es: string; pt: string }>>(join(raiz, "data", "traducciones", n)))
        )
      : {},
    fichasAparte: readdirSync(join(raiz, "data"))
      .filter((n) => /^fichas-dlc.*\.json$/.test(n))
      .sort()
      .flatMap((n) => leerJson<Array<{ slug: string; title: string; content: string }>>(f(n))),
  };
}

export function leerDatosEldenRing(raiz: string): DatosEldenRing {
  const cat = (f: string) => leerJson<CatalogoCrudo>(join(raiz, "data", "checklist", f));
  const jefesMit = leerJson<{ bosses: Record<string, { name: string }> }>(
    join(raiz, "data", "checklist", "bosses.json")
  );
  const graciasMit = leerJson<{ graces: Record<string, { name: string; subcategory?: string }> }>(
    join(raiz, "data", "checklist", "graces.json")
  );

  const base = cat("all_items.json");
  base.bosses = jefesMit.bosses;
  base.graces = graciasMit.graces;

  const localRuta = join(raiz, "data", "bosses.json");
  const jefes = existsSync(localRuta) ? leerJson<JefeLocal[]>(localRuta) : [];

  const informe = existsSync(join(raiz, "data", "_report.json"))
    ? leerJson<{ actualizado?: string }>(join(raiz, "data", "_report.json"))
    : {};

  return {
    version: "be4060d21f",
    fechaCatalogo: "2026-06-30",
    fechaLocal: informe.actualizado ?? "2024-05-06",
    base,
    dlc: cat("dlc_items.json"),
    jefes: Array.isArray(jefes) ? jefes : [],
    arte: existsSync(join(raiz, "data", "arte.json"))
      ? leerJson<ArteEldenRing>(join(raiz, "data", "arte.json"))
      : {},
    herramientas: leerHerramientas(raiz),
  };
}

// ── Etiquetas nuestras ───────────────────────────────────────────────────────

const CATEGORIAS: Array<{ clave: string; titulo: string; singular: string }> = [
  { clave: "armament", titulo: "Armas", singular: "arma" },
  { clave: "armor", titulo: "Armaduras", singular: "pieza" },
  { clave: "ashesOfWar", titulo: "Cenizas de guerra", singular: "ceniza" },
  { clave: "magic", titulo: "Hechizos", singular: "hechizo" },
  { clave: "spiritAshes", titulo: "Espíritus", singular: "espíritu" },
  { clave: "talisman", titulo: "Talismanes", singular: "talismán" },
];

// ── El plan ──────────────────────────────────────────────────────────────────

export function planDeCargaEldenRing(datos: DatosEldenRing): PlanDeCarga {
  const https = (v: string | undefined) => (v && /^https:\/\//i.test(v) ? v : null);
  const celda = (t: unknown) => String(t ?? "").replace(/\|/g, "\\|");

  const fuentes = [
    `Catálogo (incluido Shadow of the Erdtree): [Elden Ring Automatic Checklist](https://github.com/CyberGiant7/Elden-Ring-Automatic-Checklist) (MIT), commit \`${datos.version}\`.`,
    `Datos de los jefes del juego base: [eldenring-api](https://github.com/deliton/eldenring-api), sin fichero de licencia, ${datos.fechaLocal}.`,
  ];
  const nota = `\n\n---\n\n*${fuentes.join(" ")}*\n`;

  /** Base de datos, creador de equipo y una ficha por arma (si están las cifras) */
  const h = datos.herramientas ? herramientasEldenRing(datos.herramientas, REVISADA_HERRAMIENTAS) : null;
  const fichaDeArma = (nombre: string): string | null => {
    const slug = h?.fichaDe.get(nombre.toLowerCase().replace(/[^a-z0-9]/g, ""));
    return slug ? `/elden-ring/wiki/${slug}` : null;
  };

  /** Jefes del juego base con datos: son los que tienen página propia. */
  const jefesConDatos = datos.jefes.filter((j) => (j.name ?? "").trim());
  const nombresConPagina = new Set(jefesConDatos.map((j) => j.name.trim()));

  const jefesDelDlc = Object.values(datos.dlc.bosses ?? {})
    .map((b) => b.name)
    .filter((n) => n && !nombresConPagina.has(n));

  const paginas: Array<{ title: string; content: string }> = [];

  /**
   * Un jefe puede aparecer VARIAS veces: el Apóstol de piel divina sale en
   * Caelid y en la Meseta de Altus, y los Parientes de la podredumbre en dos
   * cuevas del monte Gelmir. Cada aparición es una fila de la fuente, pero es
   * el MISMO jefe: se agrupan por su dirección y la página cuenta dónde sale
   * cada vez. Con una página por fila, la segunda pisaba a la primera.
   */
  const porSlug = new Map<string, JefeLocal[]>();
  for (const j of jefesConDatos) {
    const slug = slugDePaginaWiki(j.name.trim());
    porSlug.set(slug, [...(porSlug.get(slug) ?? []), j]);
  }

  for (const apariciones of porSlug.values()) {
    const nombre = apariciones[0].name.trim();
    const regiones = [...new Set(apariciones.map((a) => (a.region ?? "").trim()).filter(Boolean))];
    const botin = [...new Set(apariciones.flatMap((a) => a.drops ?? []))];
    const vidas = [...new Set(apariciones.map((a) => a.healthPoints).filter((v): v is string => Boolean(v) && v !== "???"))];

    paginas.push({
      title: nombre,
      content: [
        `**${nombre}** es un jefe de Elden Ring${regiones.length ? ` (${regiones.join(", ")})` : ""}.`,
        vidas.length === 1 ? `Tiene **${vidas[0]}** de vida.` : "",
        apariciones.length > 1
          ? [
              "## Dónde aparece",
              "",
              "| Región | Lugar | Vida |",
              "|---|---|---|",
              ...apariciones.map(
                (a) =>
                  `| ${celda(a.region ?? "—")} | ${celda(a.location ?? "—")} | ${celda(
                    a.healthPoints && a.healthPoints !== "???" ? a.healthPoints : "—"
                  )} |`
              ),
            ].join("\n")
          : apariciones[0].location
            ? `Se encuentra en **${apariciones[0].location}**.`
            : "",
        botin.length ? ["## Botín", "", ...botin.map((d) => `- ${celda(d)}`)].join("\n") : "",
      ]
        .filter(Boolean)
        .join("\n\n")
        .concat(nota),
    });
  }

  // ── Índice de jefes, por región ────────────────────────────────────────
  const porRegion = new Map<string, Set<string>>();
  for (const j of jefesConDatos) {
    const region = (j.region ?? "").trim() || "Sin región";
    porRegion.set(region, (porRegion.get(region) ?? new Set<string>()).add(j.name.trim()));
  }
  paginas.push({
    title: "Jefes",
    content: [
      `Los **${porSlug.size}** jefes del juego base, por región.`,
      ...[...porRegion.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], "es"))
        .flatMap(([region, nombres]) => [
          "",
          `## ${region}`,
          "",
          ...[...nombres].sort((a, b) => a.localeCompare(b, "es")).map((n) => `- [[${n}]]`),
        ]),
      ...(jefesDelDlc.length
        ? [
            "",
            "## Shadow of the Erdtree",
            "",
            ...jefesDelDlc.sort((a, b) => a.localeCompare(b, "es")).map((n) => `- ${celda(n)}`),
          ]
        : []),
    ]
      .join("\n")
      .concat(nota),
  });

  // ── Una página por categoría, con el catálogo completo ─────────────────
  for (const c of CATEGORIAS) {
    const base = Object.values(datos.base[c.clave] ?? {});
    const dlc = Object.values(datos.dlc[c.clave] ?? {});
    if (base.length + dlc.length === 0) continue;

    const filas = [
      ...base.map((x) => ({ ...x, dlc: false })),
      ...dlc.map((x) => ({ ...x, dlc: true })),
    ].sort((a, b) => (a.class ?? "").localeCompare(b.class ?? "", "es") || a.name.localeCompare(b.name, "es"));

    paginas.push({
      title: c.titulo,
      content: [
        `Las **${filas.length}** ${c.titulo.toLowerCase()} del juego, incluidas las ${dlc.length} de Shadow of the Erdtree.`,
        "",
        "| Nombre | Tipo | DLC |",
        "|---|---|---|",
        ...filas.map((f) => {
          const ficha = c.clave === "armament" ? fichaDeArma(f.name) : null;
          const nombre = ficha ? `[${celda(f.name)}](${ficha})` : celda(f.name);
          return `| ${nombre} | ${celda(f.class ?? "—")} | ${f.dlc ? "Sí" : "" } |`;
        }),
      ]
        .join("\n")
        .concat(nota),
    });
  }

  const indice = {
    title: "Elden Ring",
    content: [
      "Wiki de **Elden Ring**: el catálogo completo del juego y de Shadow of the Erdtree, y los jefes del juego base con su región, su botín y su vida.",
      "",
      "## Secciones",
      "",
      "- [[Jefes]]",
      ...CATEGORIAS.filter((c) => (datos.base[c.clave] ?? datos.dlc[c.clave]) !== undefined).map(
        (c) => `- [[${c.titulo}]]`
      ),
    ]
      .join("\n")
      .concat(nota),
  };

  const conEnlaces: PaginaPlanificada[] = [indice, ...paginas].map((p) => ({
    slug: slugDePaginaWiki(p.title),
    title: p.title,
    content: p.content.trim() + "\n",
    enlaces: [...new Set(extraerEnlacesWiki(p.content).map((l) => l.slug))],
  }));

  // Las fichas de armas llevan su slug propio (`troll_knights_sword`), el que ya tenían
  if (h) conEnlaces.push(...h.paginasDeArmas);

  const creadas = new Set(conEnlaces.map((p) => p.slug));
  if (creadas.size !== conEnlaces.length) {
    const vistos = new Set<string>();
    const repes = conEnlaces.map((p) => p.slug).filter((s) => (vistos.has(s) ? true : (vistos.add(s), false)));
    throw new Error(`Dos páginas de la wiki comparten slug: ${[...new Set(repes)].slice(0, 5).join(", ")}`);
  }
  const rotos = conEnlaces.flatMap((p) => p.enlaces.filter((s) => !creadas.has(s)).map((s) => `${p.slug} → ${s}`));
  if (rotos.length > 0) throw new Error(`Enlaces de wiki sin página: ${rotos.slice(0, 10).join(", ")}`);

  const figuras = (datos.arte.figuras ?? []).map(https).filter((u): u is string => u !== null);

  return {
    juego: {
      slug: "elden-ring",
      title: "Elden Ring",
      subtitle: "Las Tierras Intermedias",
      excerpt: "La wiki de Elden Ring: catálogo completo con Shadow of the Erdtree y los jefes del juego base.",
      releaseDate: "2022-02-25",
      developer: "FromSoftware",
      publisher: "Bandai Namco",
      externalIds: datos.arte.steam_app_id ? { steamAppId: datos.arte.steam_app_id } : {},
      specs: {
        platforms: ["PC", "PlayStation 5", "Xbox Series X|S"],
        links: { steam: "https://store.steampowered.com/app/1245620/" },
        ...(https(datos.arte.portada) ? { coverUrl: https(datos.arte.portada) } : {}),
        ...(https(datos.arte.ilustracion) ? { heroUrl: https(datos.arte.ilustracion) } : {}),
        ...(https(datos.arte.logo) ? { logoUrl: https(datos.arte.logo) } : {}),
        ...(datos.arte.logoImpreso ? { logoImpreso: true } : {}),
        ...(figuras.length > 0 ? { figuras } : {}),
        /**
         * Elden Ring entra SOLO con wiki: aquí se dice, para que el hueco de
         * las herramientas se lea como una decisión y no como un olvido.
         */
        proximamente: h
          ? []
          : [
              {
                etiqueta: "Base de datos",
                grupo: "base-de-datos",
                nota: "Las estadísticas están en una fuente sin licencia y anterior al DLC. Elden Ring entra solo con wiki.",
              },
            ],
      },
    },
    datasets: h?.datasets ?? [],
    tierLists: [],
    builders: h ? [h.builder] : [],
    wiki: {
      slug: "eldenring",
      title: "Wiki de Elden Ring",
      description:
        "Catálogo completo de Elden Ring y Shadow of the Erdtree, y los jefes del juego base con su región, su botín y su vida.",
      paginas: conEnlaces,
    },
    resumenDeRevision: `Importado de Elden Ring Automatic Checklist (${datos.version})`,
    noticias: [],
    categoriaDeNoticias: null,
    categorias: [
      ...CATEGORIAS_DEL_SITIO,
    ],
    colecciones: [{ slug: "valhalla", title: "Valhalla Legion", description: "Los juegos de esta web." }],
    bloques: h?.bloques ?? [],
  };
}
