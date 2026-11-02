import path from "path";

import {
  defineOperacion,
  esUuid,
  messageOf,
  routerDeOperaciones,
  type OperacionCualquiera,
} from "@kitsuden/engine";
import type { KonContext } from "@kitsuden/shared";
import { eq } from "drizzle-orm";
import type { Context, Hono } from "hono";

import {
  CacheBorrada,
  ParamId,
  ParamPreset,
  PuntoFocalEntrada,
  PuntoFocalGuardado,
  PuntoFocalLeido,
  QueryTransformacion,
} from "./media.esquemas";
import { KON_ID } from "./media.routes";
import { media } from "./media.schema";
import { ImageTransformer, transformPresets, type TransformOptions } from "./src/transformer.js";

/**
 * Create transform routes for on-the-fly image transformation
 *
 * Routes:
 * - GET /transform/:id?w=800&h=600&fit=cover&f=webp
 * - GET /preset/:id/:preset (thumbnail, small, medium, large, hero)
 * - POST /focal-point/:id (set focal point for smart cropping)
 */
export function operacionesDeTransformacion(ctx: KonContext): OperacionCualquiera[] {
  /**
   * Lo que no necesita la transacción de la petición, fuera de ella.
   *
   * Una transformación es trabajo LARGO (leer el original del almacén, sharp,
   * guardar el resultado) y solo necesita de la base la fila del medio. Leída
   * fuera de la transacción (`segundoPlano`, como el sistema: la ruta es
   * pública y sirve cualquier medio por id, así que no se abre nada que la RLS
   * cerrara), la petición no tiene una conexión ocupada mientras sharp trabaja
   * (regla 3 del SDK de kons).
   */
  const fuera = <T>(fn: () => Promise<T>): Promise<T> =>
    ctx.db.segundoPlano ? ctx.db.segundoPlano(fn) : fn();

  /**
   * GET /transform/:id - Transform image on-the-fly
   *
   * Query params:
   * - w, width: Target width
   * - h, height: Target height
   * - fit: resize fit (cover, contain, fill, inside, outside)
   * - pos, position: crop position (center, top, right, bottom, left)
   * - f, format: output format (jpeg, png, webp, avif)
   * - q, quality: quality 1-100
   * - fp: focal point (format: "x,y" where x,y are 0-1)
   */
  /**
   * Genera (o reutiliza) una transformación y SIRVE sus bytes.
   *
   * Antes redirigía a `getSignedDownloadUrl(transformKey)` sin comprobar que
   * existiera: con almacenamiento local esa función solo compone la URL
   * pública, así que TODA URL de preset acababa en un 404 de `/media/...` de un
   * fichero que nadie había generado. Y si llegaba a generar, leía el original
   * con `fetch` sobre una ruta relativa (falla en el servidor) y guardaba con
   * `ctx.storage.upload`, que no existe.
   *
   * Ahora lee con `ctx.storage.get` (igual en disco y en S3): si la
   * transformación está guardada se sirve tal cual; si no, se genera desde el
   * original, se guarda para la próxima vez y se sirve.
   */
  async function servirTransformacion(c: Context, id: string, query: Record<string, string>) {
    if (!esUuid(id)) return c.json({ error: "Media not found" }, 404);

    try {
      const [doc] = await fuera(
        async () => await ctx.db.instance.select().from(media).where(eq(media.id, id)).limit(1)
      );
      if (!doc) return c.json({ error: "Media not found" }, 404);
      if (!doc.mimeType?.startsWith("image/")) {
        return c.json({ error: "Not an image file" }, 400);
      }

      // Lo que llega por la URL lo pide CUALQUIERA (la ruta es pública): fuera
      // de rango es 400, no trabajo para sharp.
      let options: TransformOptions;
      try {
        options = leerOpcionesDeTransformacion(
          query,
          doc.metadata as Record<string, unknown> | undefined
        );
      } catch (err) {
        return c.json({ error: messageOf(err) }, 400);
      }

      // El formato de salida se fija ANTES de buscar en caché: la clave y el
      // Content-Type de lo guardado dependen de él. Sin formato pedido se
      // conserva el del original (lo que haría sharp), o webp si sharp no sabe
      // escribirlo (svg, ico…).
      const formato = formatoDeSalida(options.format, doc.mimeType);
      options.format = formato;

      const cacheKey = ImageTransformer.generateKey(options);
      const transformKey = `transforms/${doc.id}/${path.parse(doc.filename).name}_${cacheKey}.${formato}`;
      const tipo = `image/${formato}`;

      const guardada = await ctx.storage.get(transformKey);
      if (guardada) return servirImagen(c, guardada, tipo);

      const original = await ctx.storage.get(doc.key);
      if (!original) {
        ctx.logger.warn("Transform: falta el original", { id: doc.id });
        return c.json({ error: "Original file not found" }, 404);
      }

      const transformer = new ImageTransformer(original);
      const result = await transformer.transform(options);
      transformer.destroy();

      // Guardar es una optimización: si falla, se sirve igual.
      try {
        await ctx.storage.put(transformKey, result.buffer, tipo);
      } catch (err) {
        ctx.logger.warn("Transform: no se pudo guardar en caché", { error: messageOf(err) });
      }

      return servirImagen(c, result.buffer, tipo);
    } catch (err: unknown) {
      ctx.logger.error("Transform failed:", { error: messageOf(err) });
      return c.json({ error: "Transform failed" }, 500);
    }
  }

  /**
   * GET /transform/:id - Transform image on-the-fly
   *
   * Query params:
   * - w, width: Target width
   * - h, height: Target height
   * - fit: resize fit (cover, contain, fill, inside, outside)
   * - pos, position: crop position (center, top, right, bottom, left)
   * - f, format: output format (jpeg, png, webp, avif)
   * - q, quality: quality 1-100
   * - fp: focal point (format: "x,y" where x,y are 0-1)
   */
  const ops: OperacionCualquiera[] = [];

  ops.push(
    defineOperacion({
      id: "transformar-imagen",
      metodo: "GET",
      ruta: "/transform/:id",
      resumen: "Transform an image on the fly",
      descripcion:
        "Serves the image resized/cropped/converted as asked (w, h, fit, pos, f, q, fp). The result is cached in storage and served with a one-year immutable Cache-Control.",
      acceso: "publico",
      entrada: { params: ParamId, query: QueryTransformacion },
      salida: { tipo: "image/*", descripcion: "The transformed image bytes" },
      errores: ["KITSUDEN_E_BAD_REQUEST", "KITSUDEN_E_NOT_FOUND"],
      mcp: { excluir: "returns image bytes, not JSON; agents use the URL instead" },
      manejar: async (_entrada, { c }) =>
        servirTransformacion(c, c.req.param("id") as string, c.req.query()),
    })
  );

  /**
   * GET /preset/:id/:preset - Apply named preset
   *
   * Presets: thumbnail, small, medium, large, hero
   *
   * Se sirve aquí mismo, sin redirigir a `/api/media/transform/...`: la
   * redirección daba por hecho el punto de montaje y costaba una petición más.
   */
  ops.push(
    defineOperacion({
      id: "imagen-con-preset",
      metodo: "GET",
      ruta: "/preset/:id/:preset",
      resumen: "Image with a named preset",
      descripcion:
        "Serves the image with a named size: thumbnail (150x150), small (400x300), medium (800x600), large (1200x800) or hero (1920x1080).",
      acceso: "publico",
      entrada: { params: ParamPreset },
      salida: { tipo: "image/*", descripcion: "The transformed image bytes" },
      errores: ["KITSUDEN_E_BAD_REQUEST", "KITSUDEN_E_NOT_FOUND"],
      mcp: { excluir: "returns image bytes, not JSON; agents use the URL instead" },
      manejar: async (entrada, { c }) => {
        const id = entrada.params.id;
        const presetName = entrada.params.preset;
        if (!esUuid(id)) return c.json({ error: "Media not found" }, 404);

        const preset = Object.hasOwn(transformPresets, presetName)
          ? transformPresets[presetName]
          : undefined;
        if (!preset) {
          return c.json(
            {
              error: "Unknown preset",
              available: Object.keys(transformPresets),
            },
            400
          );
        }

        const query: Record<string, string> = {};
        if (preset.width) query.w = String(preset.width);
        if (preset.height) query.h = String(preset.height);
        if (preset.fit) query.fit = preset.fit;
        if (preset.position) query.pos = preset.position;
        if (preset.format) query.f = preset.format;
        if (preset.quality) query.q = String(preset.quality);

        return servirTransformacion(c, id, query);
      },
    })
  );

  /**
   * POST /focal-point/:id - Set focal point for smart cropping
   *
   * Body: { x: number, y: number } (0-1)
   */
  ops.push(
    defineOperacion({
      id: "fijar-punto-focal",
      metodo: "POST",
      ruta: "/focal-point/:id",
      resumen: "Set the focal point of an image",
      descripcion:
        "Stores the point (x, y between 0 and 1) that smart crops keep in frame. Setting the same point twice leaves the same state.",
      acceso: "sesion",
      permiso: { politica: { recurso: "media", accion: "update" } },
      idempotente: true,
      entrada: { params: ParamId, cuerpo: PuntoFocalEntrada },
      salida: { esquema: PuntoFocalGuardado },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async (entrada, { c }) => {
        const id = c.req.param("id") as string;
        if (!esUuid(id)) return c.json({ error: "Media not found" }, 404);
        const body = entrada.cuerpo ?? {};

        if (typeof body.x !== "number" || typeof body.y !== "number") {
          return c.json({ error: "x and y must be numbers" }, 400);
        }

        if (body.x < 0 || body.x > 1 || body.y < 0 || body.y > 1) {
          return c.json({ error: "x and y must be between 0 and 1" }, 400);
        }

        try {
          const [doc] = await ctx.db.instance.select().from(media).where(eq(media.id, id)).limit(1);

          if (!doc) {
            return c.json({ error: "Media not found" }, 404);
          }

          // Update metadata with focal point
          const metadata = {
            ...doc.metadata,
            focalPoint: { x: body.x, y: body.y },
          };

          await ctx.db.instance
            .update(media)
            .set({ metadata, updatedAt: new Date() })
            .where(eq(media.id, id));

          return c.json({
            success: true,
            focalPoint: metadata.focalPoint,
          });
        } catch (err: unknown) {
          ctx.logger.error("Failed to set focal point:", { error: messageOf(err) });
          return c.json({ error: messageOf(err) }, 500);
        }
      },
    })
  );

  /**
   * GET /focal-point/:id - Get focal point
   */
  ops.push(
    defineOperacion({
      id: "leer-punto-focal",
      metodo: "GET",
      ruta: "/focal-point/:id",
      resumen: "Get the focal point of an image",
      descripcion: "The stored focal point, or the centre (0.5, 0.5) when none was set.",
      acceso: "publico",
      entrada: { params: ParamId },
      salida: { esquema: PuntoFocalLeido },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async (_entrada, { c }) => {
        const id = c.req.param("id") as string;
        if (!esUuid(id)) return c.json({ error: "Media not found" }, 404);

        const [doc] = await ctx.db.instance.select().from(media).where(eq(media.id, id)).limit(1);

        if (!doc) {
          return c.json({ error: "Media not found" }, 404);
        }

        return c.json({
          focalPoint: doc.metadata?.focalPoint || { x: 0.5, y: 0.5 },
        });
      },
    })
  );

  /**
   * DELETE /cache/:id - Clear all transforms for an image
   */
  ops.push(
    defineOperacion({
      id: "vaciar-cache-de-imagen",
      metodo: "DELETE",
      ruta: "/cache/:id",
      resumen: "Clear the cached transforms of an image",
      descripcion:
        "Deletes every stored transformation of the image; they are regenerated on the next request. The original is not touched.",
      acceso: "sesion",
      permiso: { politica: { recurso: "media", accion: "update" } },
      // Borra caché regenerable, no datos: no es «sensible».
      sensible: false,
      entrada: { params: ParamId },
      salida: { esquema: CacheBorrada },
      manejar: async (_entrada, { c }) => {
        const id = c.req.param("id") as string;
        // El id va dentro de una ruta del almacén (`transforms/<id>/`): sin esto,
        // `..` o `/` en el parámetro listaba y borraba fuera de esa carpeta.
        if (!esUuid(id)) return c.json({ error: "Media not found" }, 404);

        try {
          // `ctx.storage.list` devuelve claves. Antes se llamaba a un `list` que no
          // existía en ningún almacén (con un `as any` que lo escondía): 500 siempre.
          const transforms = await ctx.storage.list(`transforms/${id}/`);

          for (const clave of transforms) {
            await ctx.storage.delete(clave);
          }

          return c.json({
            success: true,
            cleared: transforms.length,
          });
        } catch (err: unknown) {
          ctx.logger.error("Failed to clear cache:", { error: messageOf(err) });
          return c.json({ error: messageOf(err) }, 500);
        }
      },
    })
  );

  return ops;
}

/** El router REST de las transformaciones, generado de sus operaciones. */
export function createTransformRouter(ctx: KonContext): Hono {
  return routerDeOperaciones(KON_ID, operacionesDeTransformacion(ctx), ctx);
}

/**
 * Topes de una transformación pedida por URL.
 *
 * `GET /transform/:id` es PÚBLICA (la usan las webs para logos y portadas), y
 * cada combinación distinta de parámetros es un trabajo nuevo de sharp y una
 * entrada nueva en la caché. Antes `w`/`h`/`q` pasaban tal cual (`parseInt`
 * sin tope, NaN incluido) y `fit`/`format`/`position` se pasaban a sharp sin
 * mirar: un formato desconocido o una anchura de 10^9 se convertían en 500 o
 * en trabajo inútil.
 */
export const LIMITES_DE_TRANSFORMACION = { lado: 4096 } as const;

/** Escalones de lado (px): los anchos habituales de `srcset` hasta 4096. */
const ESCALONES_DE_LADO = [
  16, 32, 48, 64, 96, 100, 128, 150, 160, 192, 200, 256, 300, 320, 384, 400, 480, 512, 600, 640, 720,
  768, 800, 960, 1024, 1080, 1200, 1280, 1440, 1536, 1600, 1920, 2048, 2560, 3072, 3840, 4096,
];
const ESCALONES_DE_CALIDAD = [40, 50, 60, 70, 75, 80, 85, 90, 95, 100];

/** El primer escalón ≥ n (el último si n lo supera). */
function escalonar(n: number | undefined, escalones: readonly number[]): number | undefined {
  if (n === undefined) return undefined;
  return escalones.find((e) => e >= n) ?? escalones[escalones.length - 1];
}

type FormatoDeSalida = "jpeg" | "png" | "webp" | "avif" | "gif";
const ESCRIBIBLES: Record<string, FormatoDeSalida> = {
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

/**
 * El formato en que sale una transformación: el pedido, o el del original si
 * no se pidió ninguno (o se pidió `auto`), o webp si el original no es algo
 * que sharp sepa escribir.
 */
export function formatoDeSalida(
  pedido: TransformOptions["format"],
  mimeOriginal: string | null | undefined
): FormatoDeSalida {
  if (pedido && pedido !== "auto") return pedido;
  return ESCRIBIBLES[(mimeOriginal ?? "").toLowerCase()] ?? "webp";
}

/** Los bytes de una imagen, cacheables un año (la URL cambia si cambia la imagen). */
function servirImagen(c: Context, bytes: Buffer, tipo: string) {
  c.header("Content-Type", tipo);
  c.header("Cache-Control", "public, max-age=31536000, immutable");
  c.header("X-Content-Type-Options", "nosniff");
  return c.body(new Uint8Array(bytes));
}

const AJUSTES = new Set(["cover", "contain", "fill", "inside", "outside"]);
const POSICIONES = new Set(["center", "top", "right", "bottom", "left", "entropy", "attention"]);
const FORMATOS = new Set(["jpeg", "png", "webp", "avif", "gif", "auto"]);

function entero(
  valor: string | undefined,
  nombre: string,
  min: number,
  max: number
): number | undefined {
  if (valor === undefined || valor === "") return undefined;
  if (!/^[0-9]{1,6}$/.test(valor)) throw new Error(`${nombre} debe ser un entero`);
  const n = Number(valor);
  if (n < min || n > max) throw new Error(`${nombre} debe estar entre ${min} y ${max}`);
  return n;
}

/**
 * Lee y VALIDA las opciones de transformación de la URL. Lanza con un mensaje
 * legible si algo está fuera de lo permitido (la ruta lo convierte en 400).
 */
export function leerOpcionesDeTransformacion(
  query: Record<string, string>,
  metadata?: Record<string, unknown>
): TransformOptions {
  const options: TransformOptions = {};
  const lado = LIMITES_DE_TRANSFORMACION.lado;

  // Tamaños y calidades a una REJILLA fija (auditoría 2026-10-25): cada
  // combinación distinta se renderiza con sharp y se guarda para siempre, y
  // `?w=4093`, `?w=4094`… quemaban CPU y disco sin fin desde una petición
  // anónima. Se redondea hacia arriba al siguiente escalón.
  options.width = escalonar(entero(query.w ?? query.width, "w", 1, lado), ESCALONES_DE_LADO);
  options.height = escalonar(entero(query.h ?? query.height, "h", 1, lado), ESCALONES_DE_LADO);
  if (options.width === undefined) delete options.width;
  if (options.height === undefined) delete options.height;

  if (query.fit) {
    if (!AJUSTES.has(query.fit)) throw new Error("fit no válido");
    options.fit = query.fit as TransformOptions["fit"];
  }
  const pos = query.pos ?? query.position;
  if (pos) {
    if (!POSICIONES.has(pos)) throw new Error("position no válida");
    options.position = pos as TransformOptions["position"];
  }
  const formato = query.f ?? query.format;
  if (formato) {
    if (!FORMATOS.has(formato)) throw new Error("format no válido (jpeg, png, webp, avif, gif)");
    options.format = formato as TransformOptions["format"];
  }
  const calidad = escalonar(entero(query.q ?? query.quality, "q", 1, 100), ESCALONES_DE_CALIDAD);
  if (calidad !== undefined) options.quality = calidad;

  const dentro = (x: unknown) => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1;
  if (query.fp) {
    const [x, y] = query.fp.split(",").map(Number);
    if (!dentro(x) || !dentro(y)) throw new Error("fp debe ser x,y entre 0 y 1");
    // En pasos de 0,05 (21×21 posiciones), por lo mismo que los tamaños
    options.focalPoint = { x: Math.round(x * 20) / 20, y: Math.round(y * 20) / 20 };
  } else if (metadata?.focalPoint) {
    const fp = metadata.focalPoint as { x?: unknown; y?: unknown };
    if (dentro(fp.x) && dentro(fp.y)) options.focalPoint = { x: fp.x as number, y: fp.y as number };
  }

  return options;
}
