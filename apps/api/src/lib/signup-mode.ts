/**
 * Can strangers create accounts? (`KITSUDEN_SIGNUP=open|closed`)
 * ============================================================================
 *
 * `readAccess: "authenticated"` means "anyone with an account": with sign-up
 * open and no way to close it, that was anyone on the internet. Closed by default
 * in production: an agent backend has no public accounts unless its operator
 * says so. A site with public accounts sets `KITSUDEN_SIGNUP=open`.
 *
 * An unknown value counts as closed: a typo must not open registration.
 */

type Env = Record<string, string | undefined>;

export function signUpClosed(env: Env = process.env): boolean {
  const mode = env["KITSUDEN_SIGNUP"]?.trim().toLowerCase();
  if (mode === "open") return false;
  if (mode === "closed") return true;
  if (mode) {
    console.warn(`[auth] KITSUDEN_SIGNUP must be "open" or "closed": treating "${mode}" as closed.`);
    return true;
  }
  return env["NODE_ENV"] === "production";
}
