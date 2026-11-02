/**
 * En producción, un 5xx no le cuenta a quien no es admin qué falló por dentro.
 * ============================================================================
 *
 * `app.onError` ya oculta el detalle de las excepciones. Pero decenas de
 * handlers capturan el error ellos mismos y responden
 * `c.json({ error, message: (error as Error).message }, 500)`, y el mensaje de
 * un fallo de Drizzle trae la consulta SQL entera con sus parámetros (tablas,
 * columnas, a veces el email que se acababa de enviar). Auditoría 2026-10-15:
 * `POST /api/datasets/:id/query`, accesible a cualquier cuenta, lo hacía.
 *
 * Arreglarlos uno a uno deja fuera el siguiente que se escriba; esto es la
 * red: tras el handler, si la respuesta es un 5xx en JSON, el entorno es
 * producción y quien pregunta no es admin (ni un agente con scope `admin`),
 * el cuerpo se sustituye por uno genérico con el `requestId` para buscarlo en
 * el log. El admin sigue viendo el detalle: depura desde el panel.
 */
import { createMiddleware } from "hono/factory";

export function debeOcultarDetalle(params: {
  estado: number;
  esJson: boolean;
  enProduccion: boolean;
  esAdmin: boolean;
}): boolean {
  return params.enProduccion && params.estado >= 500 && params.esJson && !params.esAdmin;
}

export function erroresSinDetalle(enProduccion: () => boolean) {
  return createMiddleware(async (c, next) => {
    await next();
    // La salud ya filtra su detalle (`detalleDeSalud`) y su cuerpo lo leen
    // los monitores aunque responda 503.
    if (c.req.path.startsWith("/api/health")) return;
    const res = c.res;
    const get = c.get as (k: string) => unknown;
    const user = get("user") as { role?: string } | null | undefined;
    const agente = get("agent") as { scopes?: string[] } | undefined;
    const esAdmin = user?.role === "admin" || agente?.scopes?.includes("admin") === true;
    if (
      !debeOcultarDetalle({
        estado: res.status,
        esJson: (res.headers.get("content-type") ?? "").includes("application/json"),
        enProduccion: enProduccion(),
        esAdmin,
      })
    ) {
      return;
    }
    const cabeceras = new Headers(res.headers);
    cabeceras.delete("content-length");
    c.res = new Response(
      JSON.stringify({
        error: res.status === 503 ? "Service Unavailable" : "Internal Server Error",
        requestId: get("requestId") ?? null,
      }),
      { status: res.status, headers: cabeceras }
    );
  });
}
