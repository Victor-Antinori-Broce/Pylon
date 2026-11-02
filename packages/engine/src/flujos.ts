/**
 * Kitsuden — Operaciones que hacen `yield`: flujos sobre SSE estándar (kitsuden2.md C5)
 * ============================================================================
 *
 *   defineOperacion({
 *     id: "progreso-de-importacion", metodo: "GET", ruta: "/imports/:id/progress",
 *     salida: { flujo: true, esquema: z.object({ hechos: z.number(), total: z.number() }) },
 *     async *manejar({ params }) {
 *       for await (const paso of importar(params.id)) yield paso;
 *     },
 *   })
 *
 * Se sirve como Server-Sent Events ESTÁNDAR (`text/event-stream`), no como un
 * protocolo RPC propio: cualquier `EventSource`, `curl -N` o proxy lo
 * entiende, y no aleja de MCP (que recibe la lista de eventos).
 *
 *   id: 1
 *   data: {"hechos":1,"total":3}
 *
 *   event: end
 *   data: {"count":3}
 *
 * Si el generador lanza: `event: error` con el problem+json y se cierra.
 * Cada evento se valida contra `salida.esquema` (el de UN evento): un evento
 * que no cumple es un fallo del servidor y corta el flujo con un error.
 *
 * ── LA TRANSACCIÓN ─────────────────────────────────────────────────────────
 *
 * Un flujo dura más que la petición: la transacción RLS de la petición se
 * confirma al devolver la `Response`, y una consulta posterior iría a una
 * conexión ya devuelta. Cada PASO del generador (lo que corre entre dos
 * `yield`) va en su propia transacción RLS corta con quien pregunta
 * (`enTransaccionRls`): `repo()` y el `db` del kon ven a ese usuario, la RLS
 * aplica, y mientras el flujo espera no retiene ninguna conexión. Lo que el
 * generador haga en un paso se confirma al pasar al siguiente.
 */

import type { Context } from "hono";

import { segundoPlano, enTransaccionRls, type ConexionTransaccional, type UsuarioRls } from "./rls-peticion";

/** Lo mínimo de un esquema Zod para validar un evento. */
interface EsquemaDeEvento {
  safeParse(v: unknown): { success: true; data: unknown } | { success: false; error: { message: string } };
}

export interface EventoSse {
  event?: string;
  id?: string;
  data: string;
}

/** Un evento en el formato del cable (las líneas de `data` se parten por los saltos). */
export function eventoSse(e: EventoSse): string {
  let out = "";
  if (e.id !== undefined) out += `id: ${e.id}\n`;
  if (e.event) out += `event: ${e.event}\n`;
  for (const linea of e.data.split(/\r?\n/)) out += `data: ${linea}\n`;
  return `${out}\n`;
}

/** Lee eventos SSE de un texto completo (MCP, pruebas). Ignora comentarios (`:`). */
export function leerEventosSse(texto: string): EventoSse[] {
  const eventos: EventoSse[] = [];
  for (const bloque of texto.split(/\r?\n\r?\n/)) {
    if (!bloque.trim()) continue;
    const ev: EventoSse = { data: "" };
    const datos: string[] = [];
    for (const linea of bloque.split(/\r?\n/)) {
      if (!linea || linea.startsWith(":")) continue;
      const i = linea.indexOf(":");
      const campo = i === -1 ? linea : linea.slice(0, i);
      const valor = i === -1 ? "" : linea.slice(i + 1).replace(/^ /, "");
      if (campo === "data") datos.push(valor);
      else if (campo === "event") ev.event = valor;
      else if (campo === "id") ev.id = valor;
    }
    if (datos.length === 0 && !ev.event) continue;
    ev.data = datos.join("\n");
    eventos.push(ev);
  }
  return eventos;
}

/** Cada cuánto, como mucho, sale algo por un flujo que espera (comentario `: ping`). */
const LATIDO_MS = 15_000;

function esIterableAsincrono(v: unknown): v is AsyncIterable<unknown> {
  return typeof (v as { [Symbol.asyncIterator]?: unknown })?.[Symbol.asyncIterator] === "function";
}

function problema(status: number, code: string, title: string, detail?: string) {
  return { type: "about:blank", title, status, code, ...(detail ? { detail } : {}) };
}

export interface OpcionesDeFlujo {
  /** De dónde se abren las transacciones de cada paso (el `db` del kon). */
  db: ConexionTransaccional | null;
  usuario: UsuarioRls | null;
  esquema: EsquemaDeEvento | undefined;
  /** `kon/op`, para los mensajes. */
  donde: string;
  /** Para avisar de un fallo (al log del anfitrión). */
  alFallar?: (err: unknown) => void;
}

/**
 * La `Response` SSE de un flujo. `resultado` es lo que devolvió `manejar`.
 * Lanza (antes de abrir el flujo) si no es un `AsyncIterable`.
 */
export function respuestaDeFlujo(c: Context, resultado: unknown, o: OpcionesDeFlujo): Response {
  if (!esIterableAsincrono(resultado)) {
    throw new Error(`${o.donde}: salida.flujo exige que manejar devuelva un AsyncIterable (async function*)`);
  }
  const iterador = resultado[Symbol.asyncIterator]();
  const codificar = new TextEncoder();
  let n = 0;
  let cerrado = false;

  // Un paso del generador, en su transacción RLS corta (ver la cabecera).
  const paso = (): Promise<IteratorResult<unknown>> =>
    segundoPlano(() =>
      o.db ? enTransaccionRls(o.db, o.usuario, () => iterador.next()) : iterador.next()
    );

  const flujo = new ReadableStream<Uint8Array>({
    async pull(controlador) {
      if (cerrado) return;
      const enviar = (e: EventoSse) => controlador.enqueue(codificar.encode(eventoSse(e)));
      const cerrar = () => {
        cerrado = true;
        controlador.close();
      };
      try {
        // Un paso que tarda (el generador espera algo) no deja la conexión
        // muda: un comentario SSE cada 15 s la mantiene viva tras proxies que
        // cortan lo inactivo. `EventSource` y el SDK lo ignoran.
        const pendiente = paso();
        let r: IteratorResult<unknown> | undefined;
        while (!r) {
          let reloj: ReturnType<typeof setTimeout> | undefined;
          const latido = new Promise<null>((ok) => {
            reloj = setTimeout(() => ok(null), LATIDO_MS);
          });
          const listo = await Promise.race([pendiente.then((x) => ({ x })), latido]);
          clearTimeout(reloj);
          if (listo) r = listo.x;
          else controlador.enqueue(codificar.encode(": ping\n\n"));
        }
        if (r.done) {
          enviar({ event: "end", data: JSON.stringify({ count: n }) });
          cerrar();
          return;
        }
        let valor = r.value;
        if (o.esquema) {
          const v = o.esquema.safeParse(valor);
          if (!v.success) {
            o.alFallar?.(new Error(`${o.donde}: evento ${n + 1} no cumple el esquema: ${v.error.message}`));
            enviar({
              event: "error",
              data: JSON.stringify(problema(500, "KITSUDEN_E_INTERNAL", "Invalid event", "An event did not match its schema.")),
            });
            cerrar();
            await iterador.return?.(undefined);
            return;
          }
          valor = v.data;
        }
        n++;
        enviar({ id: String(n), data: JSON.stringify(valor) });
      } catch (err) {
        o.alFallar?.(err);
        const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 500;
        const code = typeof (err as { code?: unknown })?.code === "string" ? (err as { code: string }).code : "KITSUDEN_E_INTERNAL";
        enviar({
          event: "error",
          data: JSON.stringify(
            status < 500
              ? problema(status, code, (err as Error).message ?? "Error")
              : problema(500, "KITSUDEN_E_INTERNAL", "Internal error")
          ),
        });
        cerrar();
      }
    },
    async cancel() {
      // El cliente se fue: se cierra el generador (sus `finally` corren).
      cerrado = true;
      await segundoPlano(() => iterador.return?.(undefined));
    },
  });

  return new Response(flujo, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      // nginx/Caddy: sin búfer, cada evento sale al momento.
      "x-accel-buffering": "no",
      ...(c.res?.headers.get("x-request-id") ? { "x-request-id": c.res.headers.get("x-request-id")! } : {}),
    },
  });
}
