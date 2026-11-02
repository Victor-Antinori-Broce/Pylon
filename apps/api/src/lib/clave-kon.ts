/**
 * La identidad de un kon: una sola, aunque se escriba de dos formas
 * ============================================================================
 *
 * La tabla `modules` y los manifiestos NO usan la misma forma. El manifiesto de
 * kon-games declara `"id": "kon-games"`, y en la base su fila se llama `games`,
 * de cuando los módulos del núcleo no llevaban prefijo. Las dos formas se
 * refieren al MISMO kon.
 *
 * `lib/sembrar-modulos.ts` ya normalizaba así para no crear una segunda fila al
 * sembrar, y lo dejó escrito: sin normalizar habría acabado con «el mismo kon
 * con dos identidades y dos estados contradictorios».
 *
 * Eso es exactamente lo que seguía pasando en las otras dos direcciones:
 *
 *   · AL LEER  (`GET /api/modules`) el kon salía DOS VECES —`kon-blog`
 *     encendido junto a `blog` apagado— porque la lista del grimoire fabricaba
 *     su clave arrancando el prefijo y nada volvía a juntarlas.
 *   · AL ESCRIBIR (`PATCH /api/modules/:key`) el `where(key = ...)` era exacto,
 *     así que encender la forma que no tenía fila INSERTABA una segunda.
 *
 * Por eso la regla vive aquí y no repetida en cada sitio: cada copia es una
 * oportunidad más de que una de ellas se quede atrás.
 */

/** Forma canónica para comparar: sin el prefijo `kon-`. */
export function claveCanonica(id: string): string {
  return id.replace(/^kon-/, "");
}

/** ¿Estas dos claves nombran al mismo kon? */
export function esElMismoKon(a: string, b: string): boolean {
  return claveCanonica(a) === claveCanonica(b);
}

/**
 * Busca en una colección la entrada de un kon, venga con prefijo o sin él.
 *
 * Prefiere la coincidencia EXACTA: si existen las dos filas —`games` y
 * `kon-games`—, la que se pidió gana. Solo cuando no hay exacta se cae a la
 * canónica, que es el caso de las filas heredadas.
 */
export function buscarPorClaveDeKon<T>(porClave: Map<string, T>, id: string): T | undefined {
  const exacta = porClave.get(id);
  if (exacta !== undefined) return exacta;

  const canonica = claveCanonica(id);
  for (const [k, v] of porClave) {
    if (claveCanonica(k) === canonica) return v;
  }
  return undefined;
}

// ═══════════════════════════════════════════════════════════════════════════
// UNA ENTRADA POR KON EN LA VISTA DE KONS
// ═══════════════════════════════════════════════════════════════════════════

export interface EntradaDeKon {
  key: string;
  grimoireId?: string | null;
  /** TODOS los grimoires que incluyen este kon, no solo el primero. */
  grimoireIds?: string[];
  isGrimoireActive?: boolean;
  enabledByGrimoire?: boolean;
  sidebarBadge?: string | null;
  [clave: string]: unknown;
}

/**
 * Funde las entradas que vienen de los grimoires con las del registro.
 *
 * ── LAS DOS VISTAS NO TIENEN LA MISMA REGLA ────────────────────────────────
 *
 * En la vista de GRIMOIRES un kon puede salir en varios: `kon-dms` lo incluyen
 * Corporate, SharePoint y VekDocs a la vez, y eso es correcto — cada uno lo
 * necesita y la tarjeta de cada uno debe reflejarlo.
 *
 * En la vista de KONS ese mismo kon es UNO. Tres tarjetas con tres
 * interruptores para la misma cosa no significan nada, y la primera versión de
 * la pantalla llegó a enseñarlas.
 *
 * ── POR QUÉ `grimoireIds` Y NO `grimoireId` ────────────────────────────────
 *
 * Al fusionar hay que quedarse con UNA entrada pero NO con un solo grimoire.
 * La versión anterior hacía `grimoireId ?? g.grimoireId`: se quedaba con el
 * primero que llegara y `kon-dms` aparecía como si fuera solo de Corporate.
 * Con siete kons compartidos hoy, eso es mentir en la insignia de siete.
 */
export function fusionarPorKon<T extends EntradaDeKon>(
  delRegistro: T[],
  deGrimoires: T[]
): { registro: T[]; soloDeGrimoire: T[] } {
  const porKon = new Map<string, T>();
  for (const e of delRegistro) porKon.set(claveCanonica(e.key), e);

  const soloDeGrimoire: T[] = [];

  for (const g of deGrimoires) {
    const yaEsta = porKon.get(claveCanonica(g.key));

    if (!yaEsta) {
      g.grimoireIds = g.grimoireId ? [g.grimoireId] : [];
      soloDeGrimoire.push(g);
      porKon.set(claveCanonica(g.key), g);
      continue;
    }

    yaEsta.grimoireIds ??= yaEsta.grimoireId ? [yaEsta.grimoireId] : [];
    if (g.grimoireId && !yaEsta.grimoireIds.includes(g.grimoireId)) {
      yaEsta.grimoireIds.push(g.grimoireId);
    }
    yaEsta.grimoireId ??= g.grimoireId ?? null;
    yaEsta.isGrimoireActive = Boolean(yaEsta.isGrimoireActive || g.isGrimoireActive);
    yaEsta.enabledByGrimoire = Boolean(yaEsta.enabledByGrimoire || g.enabledByGrimoire);
    yaEsta.sidebarBadge ??= g.sidebarBadge ?? null;
  }

  return { registro: delRegistro, soloDeGrimoire };
}
