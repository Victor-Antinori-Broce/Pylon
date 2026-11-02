/**
 * Signatures: Ed25519 in the minisign format, offline, with node:crypto only
 * ============================================================================
 *
 * WHY THIS AND NOT SIGSTORE (the decision, in short — docs/kons/registry.md has
 * the long version):
 *
 *   · Verification must work OFFLINE and in a Docker build with no network:
 *     a minisign signature is checked with one 32-byte public key. Sigstore
 *     keyless verification needs a trusted root (TUF), a Rekor inclusion proof
 *     and an OIDC identity policy — doable offline with a bundle, but it brings
 *     the sigstore-js dependency tree into the one code path that must trust
 *     nothing.
 *   · Third parties publish from anywhere, not only from a CI with OIDC.
 *   · Zero new dependencies: node:crypto has Ed25519 and BLAKE2b-512.
 *   · The format is minisign's, so users can also check a package with the
 *     `minisign` tool (`minisign -Vm kon-x-1.0.0.tgz -P <key>`; format-level
 *     compatibility, not yet tested against the binary).
 *     Minisign's "trusted comment" is SIGNED: we put the kon id, version and
 *     SHA-256 in it, so a valid signature cannot be replayed onto another kon.
 *
 * Sigstore stays a possible SECOND signature later (provenance from CI) — the
 * index entry has room for it — but it is not the root of trust.
 *
 * Formats (https://jedisct1.github.io/minisign/):
 *   public key:  "untrusted comment: …\n" + base64("Ed" + keyId[8] + pk[32])
 *   signature:   "untrusted comment: …\n" + base64("ED" + keyId[8] + sig[64]) + "\n"
 *                "trusted comment: <text>\n" + base64(globalSig[64]) + "\n"
 *   "ED" = Ed25519 over BLAKE2b-512(file); globalSig = Ed25519(sig ‖ text).
 *   The legacy "Ed" (Ed25519 over the raw file) is accepted when verifying.
 *
 * Secret keys are NOT in minisign's scrypt format: they are a JSON file with a
 * PKCS#8 PEM, encrypted (AES-256-CBC, OpenSSL's PEM encryption) when
 * KITSUDEN_SIGNING_PASSPHRASE is set. They never go in a repository.
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign as firmar,
  verify as verificar,
  type KeyObject,
} from "node:crypto";

export class ErrorDeFirma extends Error {}

export interface ClavePublica {
  /** 8 bytes, as minisign stores them. */
  keyId: Buffer;
  /** Raw 32-byte Ed25519 key. */
  clave: Buffer;
}

export interface ClaveSecreta {
  keyId: Buffer;
  privada: KeyObject;
}

/** Key id as minisign prints it: the 8 bytes as a little-endian u64, upper hex. */
export function idDeClave(keyId: Buffer): string {
  return Buffer.from(keyId).reverse().toString("hex").toUpperCase();
}

function crudaDePublica(k: KeyObject): Buffer {
  const jwk = k.export({ format: "jwk" }) as { x?: string };
  if (!jwk.x) throw new ErrorDeFirma("not an Ed25519 key");
  return Buffer.from(jwk.x, "base64url");
}

function objetoDePublica(cruda: Buffer): KeyObject {
  return createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: cruda.toString("base64url") }, format: "jwk" });
}

export function generarClaves(passphrase?: string): { publica: string; secreta: string; keyId: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const keyId = randomBytes(8);
  const pk = crudaDePublica(publicKey);
  const id = idDeClave(keyId);
  const publica = `untrusted comment: minisign public key ${id}\n${Buffer.concat([Buffer.from("Ed"), keyId, pk]).toString("base64")}\n`;
  const pem = privateKey.export(
    passphrase ? { type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase } : { type: "pkcs8", format: "pem" }
  ) as string;
  const secreta =
    JSON.stringify(
      {
        format: "kitsuden-signing-key",
        version: 1,
        keyId: keyId.toString("hex"),
        publicKey: Buffer.concat([Buffer.from("Ed"), keyId, pk]).toString("base64"),
        encrypted: Boolean(passphrase),
        pkcs8: pem,
      },
      null,
      2
    ) + "\n";
  return { publica, secreta, keyId: id };
}

/** A public key: the minisign file, or just its base64 line. */
export function leerClavePublica(texto: string): ClavePublica {
  const lineas = String(texto).trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const b64 = lineas.find((l) => !l.startsWith("untrusted comment:")) ?? "";
  const b = Buffer.from(b64, "base64");
  if (b.length !== 42 || b.subarray(0, 2).toString("latin1") !== "Ed") {
    throw new ErrorDeFirma("not a minisign Ed25519 public key");
  }
  return { keyId: Buffer.from(b.subarray(2, 10)), clave: Buffer.from(b.subarray(10)) };
}

export function clavePublicaEnBase64(k: ClavePublica): string {
  return Buffer.concat([Buffer.from("Ed"), k.keyId, k.clave]).toString("base64");
}

export function leerClaveSecreta(texto: string, passphrase?: string): ClaveSecreta {
  let j: { format?: string; keyId?: string; pkcs8?: string; encrypted?: boolean; publicKey?: string };
  try {
    j = JSON.parse(texto);
  } catch {
    throw new ErrorDeFirma("not a kitsuden signing key file");
  }
  if (j.format !== "kitsuden-signing-key" || !j.keyId || !j.pkcs8) throw new ErrorDeFirma("not a kitsuden signing key file");
  if (j.encrypted && !passphrase) throw new ErrorDeFirma("the signing key is encrypted: set KITSUDEN_SIGNING_PASSPHRASE");
  let privada: KeyObject;
  try {
    privada = createPrivateKey(j.encrypted ? { key: j.pkcs8, format: "pem", passphrase } : { key: j.pkcs8, format: "pem" });
  } catch {
    throw new ErrorDeFirma("could not open the signing key (wrong passphrase?)");
  }
  if (privada.asymmetricKeyType !== "ed25519") throw new ErrorDeFirma("the signing key is not Ed25519");
  const keyId = Buffer.from(j.keyId, "hex");
  if (keyId.length !== 8) throw new ErrorDeFirma("bad key id in the signing key file");
  if (j.publicKey) {
    const pub = leerClavePublica(j.publicKey);
    if (!pub.clave.equals(crudaDePublica(createPublicKey(privada)))) throw new ErrorDeFirma("key file is inconsistent");
  }
  return { keyId, privada };
}

export function publicaDeSecreta(s: ClaveSecreta): ClavePublica {
  return { keyId: s.keyId, clave: crudaDePublica(createPublicKey(s.privada)) };
}

function blake2b(datos: Buffer): Buffer {
  return createHash("blake2b512").update(datos).digest();
}

/** A minisign signature file for `datos`, with a signed `comentario`. */
export function firmarDatos(datos: Buffer, s: ClaveSecreta, comentario: string): string {
  if (/[\r\n]/.test(comentario)) throw new ErrorDeFirma("trusted comment must be one line");
  const sig = firmar(null, blake2b(datos), s.privada);
  const global = firmar(null, Buffer.concat([sig, Buffer.from(comentario, "utf8")]), s.privada);
  return (
    `untrusted comment: signature from kitsuden kon key ${idDeClave(s.keyId)}\n` +
    `${Buffer.concat([Buffer.from("ED"), s.keyId, sig]).toString("base64")}\n` +
    `trusted comment: ${comentario}\n` +
    `${global.toString("base64")}\n`
  );
}

export interface FirmaLeida {
  algoritmo: "ED" | "Ed";
  keyId: Buffer;
  firma: Buffer;
  comentario: string;
  global: Buffer;
}

export function leerFirma(texto: string): FirmaLeida {
  const l = String(texto).split(/\r?\n/);
  if (l.length < 4 || !l[0]!.startsWith("untrusted comment:") || !l[2]!.startsWith("trusted comment: ")) {
    throw new ErrorDeFirma("not a minisign signature");
  }
  const b = Buffer.from(l[1]!.trim(), "base64");
  const alg = b.subarray(0, 2).toString("latin1");
  if (b.length !== 74 || (alg !== "ED" && alg !== "Ed")) throw new ErrorDeFirma("unsupported signature algorithm");
  const global = Buffer.from(l[3]!.trim(), "base64");
  if (global.length !== 64) throw new ErrorDeFirma("bad global signature");
  return {
    algoritmo: alg as "ED" | "Ed",
    keyId: Buffer.from(b.subarray(2, 10)),
    firma: Buffer.from(b.subarray(10)),
    comentario: l[2]!.slice("trusted comment: ".length),
    global,
  };
}

/**
 * Verifies a minisign signature against ONE key. Returns the trusted comment
 * (already authenticated) or throws. Never returns on a mismatch.
 */
export function verificarFirma(datos: Buffer, firmaTexto: string, clave: ClavePublica): string {
  const f = leerFirma(firmaTexto);
  if (!f.keyId.equals(clave.keyId)) {
    throw new ErrorDeFirma(`signed with key ${idDeClave(f.keyId)}, expected ${idDeClave(clave.keyId)}`);
  }
  const pub = objetoDePublica(clave.clave);
  const mensaje = f.algoritmo === "ED" ? blake2b(datos) : datos;
  if (!verificar(null, mensaje, pub, f.firma)) throw new ErrorDeFirma("signature does not match the data (tampered?)");
  if (!verificar(null, Buffer.concat([f.firma, Buffer.from(f.comentario, "utf8")]), pub, f.global)) {
    throw new ErrorDeFirma("trusted comment signature does not match (tampered?)");
  }
  return f.comentario;
}

/** `kitsuden-kon id=kon-x version=1.0.0 sha256=…` → {id, version, sha256}. */
export function camposDelComentario(comentario: string): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const parte of comentario.split(/\s+/)) {
    const i = parte.indexOf("=");
    if (i > 0) salida[parte.slice(0, i)] = parte.slice(i + 1);
    else if (parte) salida["#"] = parte;
  }
  return salida;
}
