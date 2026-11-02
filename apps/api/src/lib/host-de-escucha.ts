/**
 * En qué dirección escucha la API (`HOST`).
 *
 * Sin `hostname`, bun elegía por su cuenta y en Windows acababa escuchando
 * solo en `localhost` (IPv6, `::1`): `http://127.0.0.1:3001` daba conexión
 * rechazada, y las herramientas que no prueban IPv6 primero (o que se
 * configuran con la IP) no llegaban a la API.
 *
 * Por defecto `0.0.0.0` (todas las interfaces IPv4): es lo que necesita el
 * contenedor —Docker reenvía a la IP del contenedor, no a su loopback— y lo
 * que bun hacía ya en Linux. Lo que se expone FUERA lo decide el `ports:` de
 * docker-compose (`127.0.0.1:3000:3000` por defecto), no esto. Para limitar
 * la API de desarrollo al propio equipo: `HOST=127.0.0.1`; para doble pila,
 * `HOST=::`.
 */
export function hostDeEscucha(env: Record<string, string | undefined> = process.env): string {
  const host = (env.HOST ?? "").trim();
  return host || "0.0.0.0";
}
