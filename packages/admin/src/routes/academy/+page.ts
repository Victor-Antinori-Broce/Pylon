import { redirect } from "@sveltejs/kit";

// @ts-ignore — SvelteKit generated types
import type { PageLoad } from "./$types";

export const load: PageLoad = () => {
  throw redirect(308, "/g/kon-academy-lms");
};

/**
 * El destino era `/g/grimoire-academy-lms`, un id que no existe.
 *
 * Es daño colateral del renombrado grimoire → kon: se cambiaron los ids de los
 * paquetes y estos redirectores se quedaron con el nombre viejo, así que
 * llevaban a un 404. Como son redirectores, el 404 aparecía en OTRA ruta que la
 * que se pidió, que es lo que hace difícil relacionarlo con la causa.
 *
 * Lo vigila `tests/unit/enlaces-del-panel.test.ts`.
 */
