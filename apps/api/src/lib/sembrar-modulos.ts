/**
 * Siembra: el fichero de configuración pobla la base UNA vez
 * ============================================================================
 *
 * ── EL PROBLEMA QUE RESUELVE ───────────────────────────────────────────────
 *
 * Había DOS sitios diciendo qué kons están activos:
 *
 *   · `kitsuden.config.ts` — un fichero de código, con `enabled: true/false`.
 *   · la tabla `modules`   — lo que el usuario enciende desde el panel.
 *
 * Y no solo se duplicaban: el fichero PISABA a la base. `/api/modules` hacía
 *
 *     const enabled = configFlag !== undefined ? configFlag : stored.enabled;
 *
 * así que apagar kon-media desde el panel se guardaba y, al recargar, el
 * interruptor volvía solo. El panel mentía.
 *
 * ── EL REPARTO DE PAPELES ──────────────────────────────────────────────────
 *
 * A partir de aquí, cada uno tiene UN papel y no el del otro:
 *
 *   · el fichero es la SEMILLA — qué viene encendido de fábrica. Se lee cuando
 *     la base todavía no sabe nada de ese kon.
 *   · la tabla `modules` es la VERDAD en ejecución. Lo que mande el panel.
 *
 * Por eso esta función NUNCA pisa una fila existente: en cuanto la base tiene
 * una opinión sobre un kon, esa opinión gana. Sembrar es rellenar huecos, no
 * imponer.
 *
 * ── POR QUÉ LA BASE Y NO EL FICHERO ────────────────────────────────────────
 *
 * En producción con varias réplicas, el fichero viaja DENTRO de cada imagen y
 * la base es compartida. Si divergen, cada réplica cree una cosa distinta —y
 * el fichero no puede cambiar sin desplegar, mientras que activar un kon ya
 * funciona en caliente (ver `lib/kons-diferidos.ts`).
 *
 * ── RECONCILIAR A PROPÓSITO ────────────────────────────────────────────────
 *
 * Quien quiera el flujo de git —el estado deseado en el repositorio— tiene
 * `scripts/sembrar-modulos.ts --forzar`, que sí impone el fichero sobre la
 * base. Explícito y cuando se pide, no por sorpresa en cada arranque.
 */

import { sql } from "drizzle-orm";

import { db, isPgMem } from "../db";

/**
 * Clave canónica para comparar: sin el prefijo `kon-`.
 *
 * La tabla `modules` y los manifiestos NO usan la misma forma. El manifiesto de
 * kon-games declara `"id": "kon-games"` y en la base la fila se llama `games`,
 * de cuando los módulos del núcleo no llevaban prefijo.
 *
 * Sin normalizar, sembrar habría creado una SEGUNDA fila `kon-games` con
 * `enabled=false` mientras `games` seguía en `true`: el mismo kon con dos
 * identidades y dos estados contradictorios, que es peor que el problema que
 * esta siembra vino a resolver. Lo destapó el `--dry-run` antes de escribir.
 */
function clave(id: string): string {
  return id.replace(/^kon-/, "");
}

export interface ResultadoSiembra {
  /** Kons que no estaban en la base y se han creado. */
  sembrados: string[];
  /** Kons cuya fila ya existía: la base ya tenía una opinión y se respeta. */
  respetados: string[];
  /** Solo con `--forzar`: filas cuyo `enabled` se ha sobrescrito. */
  impuestos: string[];
}

interface KonSemilla {
  id: string;
  enabled: boolean;
  core?: boolean;
}

/**
 * Lee las semillas del fichero de configuración.
 *
 * Se importa de forma perezosa porque `kitsuden.config.ts` hace descubrimiento
 * por sistema de ficheros al cargarse, y eso no debe pasar en cada import de
 * este módulo.
 */
async function semillas(): Promise<KonSemilla[]> {
  const config = await import("../../kitsuden.config");

  /**
   * `getConfig()`, no `staticConfig`.
   *
   * `staticConfig` son DOS listas escritas a mano. Un kon nuevo en disco no
   * entra en ellas, así que la siembra no le creaba fila y el descubrimiento
   * automático —que sí existe, y que anuncia «Auto-discovered kon» en el
   * arranque— se quedaba sin llegar a la base. Con 28 kons en disco, la lista
   * iba dos por detrás: kon-comments y kon-ecommerce.
   *
   * `getConfig()` ya hace la mezcla correcta: lo escrito a mano MANDA sobre
   * su `enabled`, y lo descubierto se añade apagado. Así un kon nuevo aparece
   * en el panel para poder encenderlo, sin encenderse solo.
   */
  let cfg: { core?: KonSemilla[]; features?: KonSemilla[] };
  try {
    cfg = await config.getConfig();
  } catch {
    // El descubrimiento toca el disco. Si falla, sembrar la lista estática es
    // mejor que no sembrar nada.
    cfg = config.staticConfig;
  }

  return [
    ...(cfg.core ?? []).map((k) => ({ id: k.id, enabled: k.enabled, core: true })),
    ...(cfg.features ?? []).map((k) => ({ id: k.id, enabled: k.enabled })),
  ];
}

/** Metadatos de presentación para una fila nueva, si el registro los conoce. */
async function metadatosDe(id: string): Promise<{ name: string; category: string }> {
  try {
    const { CORE_MODULES } = await import("../services/module-registry");
    const def = CORE_MODULES.find((m: { key: string }) => m.key === id);
    if (def) return { name: def.name, category: def.category };
  } catch {
    // El registro es opcional para sembrar: sin él la fila queda con el id como
    // nombre, que es feo pero cierto. Peor sería no sembrar.
  }
  return { name: id.replace(/^kon-/, ""), category: "optional" };
}

/**
 * Rellena en `modules` los kons que la configuración declara y la base no
 * conoce todavía.
 *
 * Idempotente: en el segundo arranque no siembra nada. Es seguro llamarla en
 * cada inicio, y de hecho debe llamarse así — un kon nuevo que aparezca en el
 * fichero tras una actualización tiene que llegar a la base sin intervención.
 */
export async function sembrarModulos(
  opciones: { forzar?: boolean } = {}
): Promise<ResultadoSiembra> {
  const resultado: ResultadoSiembra = { sembrados: [], respetados: [], impuestos: [] };

  /**
   * En pg-mem no se siembra.
   *
   * pg-mem es la base en memoria de las pruebas, y su soporte de SQL es
   * parcial: rechaza este mismo INSERT. Pero el motivo de fondo no es ese —es
   * que sembrar la configuración real dentro de una base de pruebas no
   * significa nada, y cada suite monta el estado que necesita.
   *
   * Se descubrió al romper diez pruebas de golpe: el arranque de la API importa
   * este módulo, así que la siembra corría también ahí.
   */
  if (isPgMem) return resultado;

  let existentes: Map<string, boolean>;
  /** De clave canónica al nombre REAL de la fila, para actualizar la correcta. */
  let clavesReales = new Map<string, string>();
  try {
    const filas = (await db.execute(sql.raw(`SELECT key, enabled FROM modules`))) as unknown as {
      rows?: { key: string; enabled: boolean }[];
    };
    const lista = Array.isArray(filas) ? filas : (filas.rows ?? []);
    // Indexado por clave canónica: `games` y `kon-games` son el mismo kon.
    existentes = new Map(lista.map((f) => [clave(f.key), f.enabled]));
    clavesReales = new Map(lista.map((f) => [clave(f.key), f.key]));
  } catch {
    // La tabla aún no existe: se está arrancando antes de migrar. No es un
    // error y no se inventa nada — la siguiente llamada, ya migrado, sembrará.
    return resultado;
  }

  for (const semilla of await semillas()) {
    const actual = existentes.get(clave(semilla.id));

    if (actual === undefined) {
      const meta = await metadatosDe(semilla.id);
      await db.execute(
        sql`INSERT INTO modules (key, name, category, enabled, settings) VALUES (${semilla.id}, ${meta.name}, ${semilla.core ? "core" : meta.category}, ${semilla.enabled}, '{}'::jsonb) ON CONFLICT (key) DO NOTHING`
      );
      resultado.sembrados.push(semilla.id);
      continue;
    }

    if (opciones.forzar && actual !== semilla.enabled) {
      // Se actualiza la fila REAL, que puede llamarse `games` y no `kon-games`.
      const clavaEnLaBase = clavesReales.get(clave(semilla.id)) ?? semilla.id;
      await db.execute(
        sql`UPDATE modules SET enabled = ${semilla.enabled} WHERE key = ${clavaEnLaBase}`
      );
      resultado.impuestos.push(semilla.id);
      continue;
    }

    resultado.respetados.push(semilla.id);
  }

  return resultado;
}
