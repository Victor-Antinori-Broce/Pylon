/**
 * Las operaciones del SDK de kons de un fichero fuente, troceadas.
 *
 * Para las pruebas que leen el código de un kon (qué comprueba cada ruta):
 * desde el SDK una ruta ya no es `router.get("/x", …)` sino una declaración
 * `defineOperacion({ …, metodo: "GET", ruta: "/x", …, manejar })`. Cada trozo
 * va de su `metodo:` al `metodo:` de la siguiente, así que incluye su `acceso`,
 * su `permiso` y el cuerpo del handler.
 */
export interface OperacionDeFuente {
  metodo: string;
  ruta: string;
  cuerpo: string;
}

export function operacionesDeFuente(fuente: string): OperacionDeFuente[] {
  const re = /metodo:\s*"(GET|POST|PUT|PATCH|DELETE)",\s*ruta:\s*"([^"]*)"/g;
  const marcas = [...fuente.matchAll(re)].map((m) => ({
    metodo: m[1]!,
    ruta: m[2]!,
    indice: m.index!,
  }));
  return marcas.map((m, i) => ({
    metodo: m.metodo,
    ruta: m.ruta,
    cuerpo: fuente.slice(m.indice, marcas[i + 1]?.indice ?? fuente.length),
  }));
}
