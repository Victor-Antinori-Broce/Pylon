/**
 * Kitsuden — Mail: layout y componentes
 * ============================================================================
 *
 * El equivalente a los Markdown Mailables de Laravel: un layout compartido más
 * componentes (botón, panel, tabla…), en vez de HTML inline duplicado en cada
 * correo.
 *
 * Por qué funciones y no un motor de plantillas: el HTML de correo exige
 * estilos inline y tablas (Outlook no soporta CSS moderno), así que un motor
 * genérico no ayuda — lo que ayuda es que los estilos vivan en UN sitio. Aquí
 * los componentes encapsulan esa fealdad y el autor del correo solo compone.
 *
 *   content: (data, ctx) => ({
 *     html: layout({
 *       appName: ctx.appName,
 *       body: heading("Bienvenido") + paragraph("...") + button("Entrar", url),
 *     }),
 *   })
 *
 * TODO el escapado va aquí: cualquier dato que entre a un componente se escapa,
 * porque un correo con datos de usuario sin escapar es una inyección de HTML.
 */

export interface LayoutOptions {
  /** Cuerpo ya compuesto (usa los componentes de abajo). */
  body: string;
  appName?: string;
  /** Pie personalizado. Por defecto, aviso de correo automático. */
  footer?: string;
  /** Color de acento para botones y títulos. */
  accent?: string;
  /** Texto del preheader (lo que se ve en la bandeja antes de abrir). */
  preheader?: string;
}

/** Escapa HTML. Se aplica a TODO dato dinámico. */
export function esc(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

/** Solo permite http(s) y mailto: evita `javascript:` en enlaces. */
function safeUrl(url: string): string {
  return /^(https?:|mailto:)/i.test(url.trim()) ? esc(url) : "#";
}

const ACCENT = "#0891b2";

/**
 * Envoltorio del correo: tabla centrada, tipografía segura y modo oscuro.
 * Usa tablas y estilos inline a propósito — es lo único que renderiza igual
 * en Outlook, Gmail y Apple Mail.
 */
export function layout(options: LayoutOptions): string {
  const accent = options.accent ?? ACCENT;
  const appName = esc(options.appName ?? "Kitsuden");
  const footer =
    options.footer ??
    `Este correo lo envió tu instancia de ${appName}. Si no esperabas este mensaje, puedes ignorarlo.`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<title>${appName}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f7;">
${
  options.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(options.preheader)}</div>`
    : ""
}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;
                  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <tr><td style="padding:28px 32px 8px;">
        <div style="font-size:18px;font-weight:700;color:${accent};letter-spacing:-.01em;">${appName}</div>
      </td></tr>
      <tr><td style="padding:8px 32px 28px;color:#33333d;font-size:15px;line-height:1.65;">
${options.body}
      </td></tr>
      <tr><td style="padding:0 32px 28px;">
        <hr style="border:none;border-top:1px solid #e8e8ee;margin:0 0 16px;" />
        <p style="margin:0;color:#8b8b9a;font-size:12px;line-height:1.6;">${esc(footer)}</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ── Componentes ──────────────────────────────────────────────────────────────

export function heading(text: string): string {
  return `<h1 style="margin:0 0 14px;font-size:20px;font-weight:650;color:#16161d;line-height:1.35;">${esc(text)}</h1>`;
}

export function paragraph(text: string): string {
  return `<p style="margin:0 0 14px;color:#44444f;font-size:15px;line-height:1.65;">${esc(text)}</p>`;
}

/** Botón de acción. La URL se valida (nada de `javascript:`). */
export function button(label: string, url: string, accent = ACCENT): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;">
  <tr><td style="border-radius:8px;background:${accent};">
    <a href="${safeUrl(url)}"
       style="display:inline-block;padding:12px 26px;color:#ffffff;font-size:15px;font-weight:600;
              text-decoration:none;border-radius:8px;">${esc(label)}</a>
  </td></tr>
</table>`;
}

/** Bloque destacado (códigos, avisos). */
export function panel(text: string): string {
  return `<div style="margin:18px 0;padding:14px 16px;background:#f6f6fa;border-radius:8px;
              border-left:3px solid ${ACCENT};color:#44444f;font-size:14px;line-height:1.6;">${esc(text)}</div>`;
}

/** Código de un solo uso, en monoespaciada y grande. */
export function code(value: string): string {
  return `<div style="margin:18px 0;padding:16px;background:#f6f6fa;border-radius:8px;text-align:center;
              font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:26px;
              letter-spacing:.18em;color:#16161d;font-weight:600;">${esc(value)}</div>`;
}

/** Tabla clave/valor (resúmenes de pedido, detalles). */
export function table(rows: [string, string][]): string {
  const body = rows
    .map(
      ([k, v]) =>
        `<tr>
          <td style="padding:8px 0;color:#8b8b9a;font-size:14px;">${esc(k)}</td>
          <td style="padding:8px 0;color:#16161d;font-size:14px;text-align:right;font-weight:500;">${esc(v)}</td>
        </tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;">${body}</table>`;
}

// ── Texto plano ──────────────────────────────────────────────────────────────

/**
 * Deriva la alternativa en texto desde el HTML.
 *
 * Importa más de lo que parece: sin `text/plain` los filtros de spam penalizan
 * el mensaje. Al generarlo automáticamente, ningún correo se queda sin él.
 */
export function htmlToText(html: string): string {
  return (
    html
      .replace(/<head[\s\S]*?<\/head>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      // Conservar el destino de los enlaces: "Entrar (https://…)"
      .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
      .replace(/<\/(p|div|h[1-6]|tr|li)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .split("\n")
      .map((l) => l.trim())
      .join("\n")
      .trim()
  );
}
