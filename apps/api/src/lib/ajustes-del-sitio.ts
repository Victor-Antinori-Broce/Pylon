/**
 * La URL pública del sitio, leída del panel
 * ============================================================================
 *
 * Configuración general → Site URL se guarda en `site_settings`, y hasta ahora
 * no la leía nadie: el contexto de kons tomaba la variable de entorno. Este
 * módulo es la lectura en vivo que reciben los kons como `ctx.sitio`.
 *
 * Caché de 30 s porque cada URL de wiki la necesita y es una fila que casi
 * nunca cambia. Guardar los ajustes la invalida (`olvidarAjustesDelSitio`), así
 * que un cambio en el panel se ve en la siguiente petición, no medio minuto
 * después.
 *
 * Vive aparte de module-loader para que la ruta de ajustes pueda invalidarla
 * sin importar el cargador de kons (y sin abrir un ciclo de imports).
 */

import { urlPublicaEfectiva } from "@kitsuden/shared";

import { db } from "../db";
import { siteSettings } from "../db/schema";

const TTL_MS = 30_000;

let enCache: { valor: string; caduca: number } | null = null;

export async function urlPublicaDelSitio(): Promise<string> {
  if (enCache && enCache.caduca > Date.now()) return enCache.valor;

  let delPanel: string | null = null;
  try {
    const [ajustes] = await db
      .select({ siteUrl: siteSettings.siteUrl })
      .from(siteSettings)
      .limit(1);
    delPanel = ajustes?.siteUrl ?? null;
  } catch {
    // Sin base de datos se sigue sirviendo con el entorno: generar una URL de
    // wiki no debería depender de que la tabla de ajustes responda.
  }

  const valor = urlPublicaEfectiva(delPanel, process.env.SITE_URL);
  enCache = { valor, caduca: Date.now() + TTL_MS };
  return valor;
}

/** La llama quien guarda los ajustes del sitio. */
export function olvidarAjustesDelSitio(): void {
  enCache = null;
}
