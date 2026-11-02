/**
 * Los healthcheck tienen que apuntar a rutas que existan
 * ============================================================================
 *
 * Un healthcheck contra una ruta inexistente **falla siempre**, y el síntoma no
 * se parece en nada a la causa. Pasó dos veces seguidas:
 *
 *   · `docker-compose.yml` consultaba `/api/live`. Las rutas de observabilidad
 *     se montan en la RAÍZ (`app.route("/", observabilityRoutes)`), así que la
 *     buena es `/live`. La API arrancaba, respondía 200 en `/api/health`, y
 *     compose decía `dependency failed to start ... is unhealthy`. El admin
 *     nunca llegaba a levantarse, porque depende de `service_healthy`.
 *
 *   · `Dockerfile.prod` consultaba `http://localhost:80/` en la imagen del
 *     admin. Ahí `localhost` resuelve primero a `::1`, y nginx escucha solo en
 *     IPv4 (`listen 80;`). El sitio se servía perfectamente en el puerto 3001 y
 *     el contenedor figuraba `unhealthy` para siempre, con
 *     `wget: can't connect to remote host: Connection refused` de única pista.
 *
 * Los dos son errores de una línea que costaron un ciclo de build cada uno.
 *
 * ── QUÉ COMPRUEBA ──────────────────────────────────────────────────────────
 *
 * 1. Que la ruta HTTP de cada healthcheck esté declarada en el código.
 * 2. Que ninguno use `localhost` como destino, por el problema de IPv6.
 *
 * No levanta nada: lee los ficheros. Una prueba que necesitara Docker no se
 * ejecutaría en CI y no serviría de nada.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");

interface Chequeo {
  fichero: string;
  url: string;
  ruta: string;
  host: string;
}

/** Extrae las URLs http(s) que aparecen dentro de un healthcheck. */
function chequeosDe(fichero: string): Chequeo[] {
  const ruta = join(RAIZ, fichero);
  if (!existsSync(ruta)) return [];

  const texto = readFileSync(ruta, "utf-8");
  const salida: Chequeo[] = [];

  for (const linea of texto.split("\n")) {
    // Solo líneas que forman parte de un healthcheck: las que invocan wget o
    // curl. Así no se cuelan URLs de comentarios o de variables de entorno.
    if (!/\b(wget|curl)\b/.test(linea)) continue;
    if (linea.trimStart().startsWith("#")) continue;

    for (const m of linea.matchAll(/https?:\/\/([^/\s"']+)(\/[^\s"'|)]*)?/g)) {
      salida.push({
        fichero,
        url: m[0],
        host: m[1] ?? "",
        ruta: (m[2] ?? "/").replace(/\/$/, "") || "/",
      });
    }
  }
  return salida;
}

/**
 * Rutas HTTP que la aplicación declara de verdad.
 *
 * Se calculan uniendo el prefijo de montaje con el camino de cada handler,
 * porque el fallo de `/api/live` fue exactamente eso: la ruta existía, el
 * prefijo no.
 */
function rutasDeclaradas(): Set<string> {
  const rutas = new Set<string>(["/"]);

  // Handlers montados en la raíz por critical-features.
  const observabilidad = join(RAIZ, "apps", "api", "src", "lib", "observability.ts");
  if (existsSync(observabilidad)) {
    const fuente = readFileSync(observabilidad, "utf-8");
    for (const m of fuente.matchAll(/observabilityRoutes\.get\(\s*["'](\/[^"']*)["']/g)) {
      rutas.add(m[1]!);
    }
  }

  // Handlers declarados con su ruta completa en el índice de la API.
  const indice = join(RAIZ, "apps", "api", "src", "index.ts");
  if (existsSync(indice)) {
    const fuente = readFileSync(indice, "utf-8");
    for (const m of fuente.matchAll(/app\.(?:get|all)\(\s*["'](\/[^"']*)["']/g)) {
      rutas.add(m[1]!);
    }
  }

  return rutas;
}

/**
 * Healthchecks de servicios AJENOS, que no consultan nuestra API: su ruta no
 * está en nuestro código. Van con nombre y apellidos, comprobados a mano,
 * para que una ruta de la API mal escrita no pase por «es de otro».
 *
 *   · SeaweedFS (perfil s3): su S3 expone `/healthz` en el 8333. Comprobado
 *     el 2026-09-21 con la imagen 4.47: 200, y el contenedor queda `healthy`.
 */
const DE_SERVICIOS_AJENOS: Record<string, string[]> = {
  "127.0.0.1:8333": ["/healthz"],
};

describe("los healthcheck apuntan a rutas reales", () => {
  const chequeos = [...chequeosDe("docker-compose.yml"), ...chequeosDe("docker/Dockerfile.prod")];
  const declaradas = rutasDeclaradas();

  it("se han encontrado healthchecks", () => {
    // Si el extractor deja de encajar, esta prueba pasaría sin mirar nada.
    expect(chequeos.length).toBeGreaterThan(0);
  });

  it("se han encontrado rutas declaradas", () => {
    expect(declaradas.size).toBeGreaterThan(2);
  });

  for (const c of chequeos) {
    it(`${c.fichero}: ${c.url}`, () => {
      // El admin es nginx sirviendo ficheros estáticos: su "/" no está en el
      // código de la API, así que solo se le exige lo del host.
      const esRaiz = c.ruta === "/";
      const esDeOtroServicio = DE_SERVICIOS_AJENOS[c.host]?.includes(c.ruta) ?? false;

      expect(
        esRaiz || esDeOtroServicio || declaradas.has(c.ruta),
        `El healthcheck de ${c.fichero} consulta '${c.ruta}', que la aplicación ` +
          `no declara. Un healthcheck contra una ruta inexistente falla siempre: ` +
          `el contenedor se queda 'unhealthy' aunque funcione, y todo lo que ` +
          `dependa de 'service_healthy' no arranca nunca.\n` +
          `Rutas declaradas: ${[...declaradas].sort().join(", ")}`
      ).toBe(true);

      expect(
        c.host.startsWith("localhost"),
        `El healthcheck de ${c.fichero} usa 'localhost'. En las imágenes alpine ` +
          `eso resuelve primero a ::1, y un servidor que escuche solo en IPv4 ` +
          `—como nginx con 'listen 80;'— rechaza la conexión. Usa 127.0.0.1.`
      ).toBe(false);
    });
  }
});
