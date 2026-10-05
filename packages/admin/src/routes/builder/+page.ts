import { redirect } from "@sveltejs/kit";

/**
 * `/builder` → el editor de páginas del Page Builder.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OJO CON EL DESTINO: HAY DOS COSAS QUE SE LLAMAN «BUILDER»
 *
 *   · `kon-blocks`  → **Page Builder**, el de bloques. Es CORE y es este.
 *   · `kon-character-builder` → el motor de *character builders* (stats, slots, build
 *     codes). Es `specialized` y viene APAGADO de fábrica.
 *
 * Esta redirección apuntaba a `/g/kon-character-builder`, o sea al segundo. Como está
 * desactivado, pulsar «nueva página» dentro del Page Builder llevaba a
 * «este kon no está activado» — un callejón sin salida en un kon que SÍ estaba
 * activo, y sin ninguna pista de por qué.
 *
 * `system-tools-builder` es la clave que `grimoire-loader` mapea a
 * `BuilderView`, que es el editor de verdad.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const load = () => {
  throw redirect(308, "/g/system-tools/builder");
};
