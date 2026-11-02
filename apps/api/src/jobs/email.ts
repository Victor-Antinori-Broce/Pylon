/**
 * Kitsuden — Worker de correo
 * ============================================================================
 *
 * Consume la cola `kitsuden-email` (Postgres, lib/queue.ts) y delega en el
 * Mailer del engine. Entrega «al menos una vez»: si el proceso muere entre el
 * envío y el cierre del trabajo, el correo puede salir dos veces.
 *
 * ANTES: este archivo tenía los templates HTML inline, la config SMTP y la
 * lógica de envío — 183 líneas que ningún kon podía extender.
 * AHORA: solo es el puente cola → Mailer. Los correos son Mailables
 * registrados (`apps/api/src/mail/system-mails.ts`), el driver es
 * intercambiable (smtp/resend/log/memory) y los kons registran los suyos.
 *
 * El nombre del job ES el nombre del Mailable, así encolar un correo nuevo no
 * requiere tocar este archivo:
 *
 *   await emailQueue.add("system.welcome", { to, name });
 *   await emailQueue.add("crm.deal-won", { to, dealId });   // desde un kon
 */

// Ciclo email↔queue DELIBERADO y seguro: queue.ts nos carga con un
// `await import()` lazy en runtime (registerEmailWorker), así que la arista
// de vuelta no existe en tiempo de carga estática y nada se queda a medias.
//
// El aviso cae aquí, en la fachada, y no en el import de `../lib/queue`: el
// camino que cierra el círculo entra por el índice del engine. Por eso la
// excepción va en esta línea.
// eslint-disable-next-line import/no-cycle -- la arista de vuelta es dinámica
import { mail } from "../../../../packages/engine/src/mail";

import { ErrorPermanente, queue, type TrabajoDeCola } from "../../../../packages/engine/src/cola";
import { COLA_DE_CORREO } from "../lib/queue";

/**
 * Payload de un job de correo. `to` es lo único obligatorio; el resto lo
 * consume el Mailable correspondiente.
 */
interface MailJobData extends Record<string, unknown> {
  to?: string;
  /** Idioma del destinatario; si falta se usa el default del Mailer. */
  locale?: string;
}

export async function processEmailJob(job: TrabajoDeCola) {
  const data = (job.payload ?? {}) as MailJobData;

  // El nombre del job identifica al Mailable.
  if (mail.has(job.nombre)) {
    const result = await mail.send(job.nombre, data, data.locale);

    if (!result.ok) {
      // Se relanza para que la cola aplique su política de reintentos: un
      // fallo de red al enviar SÍ debe reintentarse.
      throw new Error(result.error ?? `No se pudo enviar "${job.nombre}"`);
    }

    console.log(
      `  📧 [${mail.driverName}] ${job.nombre} → ${result.message.to.join(", ")} (${result.messageId ?? "sin id"})`
    );
    return { sent: true, messageId: result.messageId };
  }

  // Compatibilidad: jobs con subject/html/text sueltos (sin Mailable).
  const { to, subject, html, text } = data as {
    to?: string;
    subject?: string;
    html?: string;
    text?: string;
  };

  if (!to || !subject) {
    // Reintentarlo no lo arregla: a la «dead letter», visible en el panel.
    throw new ErrorPermanente(`Job de correo "${job.nombre}" sin Mailable registrado ni subject`);
  }

  // Se registra al vuelo un Mailable anónimo para reusar driver y logging.
  const adHoc = `adhoc:${job.nombre}`;
  if (!mail.has(adHoc)) {
    mail.register({
      name: adHoc,
      envelope: (d: any) => ({ to: d.to, subject: d.subject }),
      content: (d: any) => ({ html: d.html ?? "", text: d.text }),
    });
  }

  const result = await mail.send(adHoc, { to, subject, html, text }, data.locale);
  if (!result.ok) throw new Error(result.error ?? "Fallo al enviar");
  return { sent: true, messageId: result.messageId };
}

/** Arranca el worker de la cola de correo. */
export function registerEmailWorker() {
  console.log(`  📧 Email Worker: driver "${mail.driverName}" · ${mail.list().length} mailables`);

  if (mail.driverName === "log") {
    console.log(
      "     ℹ️  Sin credenciales: los correos se imprimen en consola. " +
        "Configura RESEND_API_KEY o SMTP_HOST para enviarlos de verdad."
    );
  }

  queue.handle(COLA_DE_CORREO, processEmailJob, { concurrencia: 2 });
}
