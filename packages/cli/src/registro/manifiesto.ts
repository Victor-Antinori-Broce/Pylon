/**
 * The kon manifest spec, version 1 — what a published kon declares
 * ============================================================================
 *
 * A published kon is described by its `kon.json`, the same file every kon
 * already has. Version 1 of the spec ("manifest": 1) does not invent a second
 * file: it fixes which fields a PUBLISHED kon must carry and normalizes the
 * spellings kons already use, so the existing 30 manifests stay valid inputs.
 *
 *   id            kon-<kebab>          required (same pattern as kon-schema.json)
 *   version       semver               required
 *   name, description                  required
 *   sdk           integer >= 1         kon SDK contract (GET /api/version → sdk.kons)
 *   kitsuden      semver range         core compatibility; also read from
 *                                      `compatibility.kitsuden` or
 *                                      package.json `kitsuden.minVersion` (→ ">=x")
 *   license       SPDX expression      required to publish
 *   author        string | {name,email?,url?}
 *   repository    string | {type?,url,directory?}
 *   dependencies.kons      ["kon-x"]  (an array: every existing reader expects one)
 *   dependencies.versions  {"kon-x": "^1.2.0"}  optional ranges; missing = any version
 *   tables        ["t"] or [{name:"t",…}] → names
 *   migrations    computed at pack time: the files of migrations/*.sql
 *   permissions   {scopes:[…], hosts:[…], sensitive:[…]} — what the user
 *                 consents to on install; required to publish (empty lists are
 *                 a valid, explicit "nothing")
 *
 * Every other field of kon.json (admin, mount, tier, madurez…) is kept as is.
 * The admin view `src` rule is the one of the admin extension point
 * (`packages/shared/src/admin-view.ts` → isSafeAssetPath), copied, NOT relaxed.
 */

import { coerceRelease, satisfies, valid, validRange } from "./semver.js";

export const MANIFEST_SPEC_VERSION = 1;

export interface PermisosDeclarados {
  scopes: string[];
  hosts: string[];
  sensitive: string[];
}

export interface ManifiestoNormalizado {
  manifest: number;
  id: string;
  name: string;
  version: string;
  description: string;
  sdk: number | null;
  kitsuden: string | null;
  license: string | null;
  author: { name: string; email?: string; url?: string } | null;
  repository: { type?: string; url: string; directory?: string } | null;
  dependencies: Record<string, string>;
  tables: string[];
  migrations: string[];
  permissions: PermisosDeclarados | null;
}

export interface ResultadoDeValidacion {
  ok: boolean;
  errores: string[];
  avisos: string[];
  manifiesto: ManifiestoNormalizado | null;
}

const KON_ID = /^kon-[a-z0-9]+(-[a-z0-9]+)*$/;
const SCOPE = /^!?[a-z0-9*][a-z0-9*:._-]{0,127}$/;
const HOST = /^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(:\d{1,5})?$/;
const OP_ID = /^[a-z0-9][a-z0-9:._-]{0,127}$/;
const TABLE = /^[a-z_][a-z0-9_]{0,62}$/;
const MIGRATION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.sql$/;

/** Kons that come with the core: a dependency on them is satisfied by the core. */
export const KONS_DEL_NUCLEO = new Set(["kon-datasets", "kon-media", "kon-blocks"]);

// Well-known SPDX ids. An expression with an id outside this list is accepted
// with a warning (the full list has 600+ ids); `LicenseRef-*` is always valid.
const SPDX_CONOCIDAS = new Set([
  "MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "MPL-2.0", "0BSD", "Unlicense",
  "GPL-2.0-only", "GPL-2.0-or-later", "GPL-3.0-only", "GPL-3.0-or-later",
  "LGPL-2.1-only", "LGPL-2.1-or-later", "LGPL-3.0-only", "LGPL-3.0-or-later",
  "AGPL-3.0-only", "AGPL-3.0-or-later", "EUPL-1.2", "CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0",
  "BUSL-1.1", "Zlib", "Artistic-2.0", "BlueOak-1.0.0", "Elastic-2.0", "SSPL-1.0",
]);
const SPDX_EXCEPCIONES = new Set(["Classpath-exception-2.0", "LLVM-exception", "GCC-exception-3.1"]);

/**
 * Syntax check of an SPDX license expression (`MIT`, `MIT OR Apache-2.0`,
 * `(GPL-2.0-only WITH Classpath-exception-2.0)`, `LicenseRef-Acme`).
 * Returns the unknown ids (for a warning) or throws on bad syntax.
 */
export function validarSpdx(expr: string): { desconocidas: string[] } {
  if (typeof expr !== "string" || !expr.trim() || expr.length > 256) throw new Error("empty or too long");
  const tokens = expr.match(/\(|\)|[A-Za-z0-9.+-]+|\S/g) ?? [];
  const desconocidas: string[] = [];
  let i = 0;
  const id = (permitirExcepcion = false): void => {
    const t = tokens[i++];
    if (!t || !/^[A-Za-z0-9.-]+\+?$/.test(t) || ["AND", "OR", "WITH"].includes(t)) {
      throw new Error(`expected a license id at "${t ?? "end"}"`);
    }
    const sinMas = t.replace(/\+$/, "");
    if (permitirExcepcion) {
      if (!SPDX_EXCEPCIONES.has(sinMas)) desconocidas.push(sinMas);
    } else if (!sinMas.startsWith("LicenseRef-") && !SPDX_CONOCIDAS.has(sinMas)) {
      desconocidas.push(sinMas);
    }
  };
  const primario = (): void => {
    if (tokens[i] === "(") {
      i++;
      expresion();
      if (tokens[i++] !== ")") throw new Error("unbalanced parenthesis");
      return;
    }
    id();
    if (tokens[i] === "WITH") {
      i++;
      id(true);
    }
  };
  const expresion = (): void => {
    primario();
    while (tokens[i] === "AND" || tokens[i] === "OR") {
      i++;
      primario();
    }
  };
  expresion();
  if (i !== tokens.length) throw new Error(`unexpected "${tokens[i]}"`);
  return { desconocidas };
}

/** The admin extension point's rule for an admin asset `src` — do not relax. */
export function esRutaDeArtefactoSegura(src: string): boolean {
  if (!src || typeof src !== "string") return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return false;
  if (src.startsWith("//")) return false;
  if (src.startsWith("/")) return false;
  if (src.includes("..")) return false;
  if (src.includes("\0") || src.includes("\\")) return false;
  return /\.(js|mjs|css|map)$/.test(src);
}

function texto(x: unknown): string | null {
  return typeof x === "string" && x.trim() ? x.trim() : null;
}

function lista(x: unknown, campo: string, patron: RegExp, errores: string[]): string[] {
  if (x === undefined) return [];
  if (!Array.isArray(x)) {
    errores.push(`${campo} must be an array of strings`);
    return [];
  }
  const salida: string[] = [];
  for (const v of x) {
    if (typeof v !== "string" || !patron.test(v)) errores.push(`${campo}: invalid entry ${JSON.stringify(v)}`);
    else if (!salida.includes(v)) salida.push(v);
  }
  if (salida.length > 500) errores.push(`${campo}: more than 500 entries`);
  return salida.sort();
}

export interface OpcionesDeValidacion {
  /** Publishing (or installing from a registry) requires license + permissions. */
  paraPublicar?: boolean;
  /** package.json of the kon, if any (version, license, author, repository, scripts). */
  paquete?: Record<string, unknown> | null;
  /** Files under migrations/ (pack time). */
  migraciones?: string[];
}

/**
 * Validates and normalizes a kon.json (+ its package.json). Never throws: the
 * result lists every error, so `kon publish` can show all of them at once.
 */
export function validarManifiesto(crudo: unknown, o: OpcionesDeValidacion = {}): ResultadoDeValidacion {
  const errores: string[] = [];
  const avisos: string[] = [];
  if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) {
    return { ok: false, errores: ["kon.json is not a JSON object"], avisos, manifiesto: null };
  }
  const m = crudo as Record<string, any>;
  const pkg = (o.paquete ?? null) as Record<string, any> | null;

  if (m.manifest !== undefined && m.manifest !== MANIFEST_SPEC_VERSION) {
    errores.push(`manifest: this CLI understands spec version ${MANIFEST_SPEC_VERSION}, the kon declares ${JSON.stringify(m.manifest)}`);
  }

  const id = texto(m.id);
  if (!id || !KON_ID.test(id)) errores.push(`id: must match ${KON_ID} (got ${JSON.stringify(m.id)})`);

  const version = texto(m.version) ?? texto(pkg?.version);
  if (!version || !valid(version)) errores.push(`version: must be semver (got ${JSON.stringify(m.version)})`);
  if (pkg?.version && m.version && pkg.version !== m.version) {
    (o.paraPublicar ? errores : avisos).push(
      `version: kon.json says ${m.version} and package.json says ${pkg.version}; they must match`
    );
  }

  const name = texto(m.name);
  if (!name) errores.push("name: required");
  const description = texto(m.description) ?? texto(pkg?.description);
  if (!description) errores.push("description: required");

  let sdk: number | null = null;
  if (m.sdk !== undefined) {
    if (!Number.isInteger(m.sdk) || m.sdk < 1) errores.push(`sdk: must be an integer >= 1`);
    else sdk = m.sdk;
  } else if (o.paraPublicar) {
    errores.push("sdk: required to publish (the kon SDK version the kon is written for)");
  }

  let kitsuden: string | null =
    texto(m.kitsuden) ?? texto(m.compatibility?.kitsuden) ?? (texto(pkg?.kitsuden?.minVersion) ? `>=${pkg!.kitsuden.minVersion}` : null);
  if (kitsuden && !validRange(kitsuden)) {
    errores.push(`kitsuden: not a semver range (${JSON.stringify(kitsuden)})`);
    kitsuden = null;
  }
  if (!kitsuden && o.paraPublicar) errores.push('kitsuden: required to publish (core compatibility range, e.g. ">=0.9.0 <2")');

  const license = texto(m.license) ?? texto(pkg?.license);
  if (license) {
    try {
      const { desconocidas } = validarSpdx(license);
      if (desconocidas.length) avisos.push(`license: not a well-known SPDX id: ${desconocidas.join(", ")}`);
    } catch (e) {
      errores.push(`license: not an SPDX expression (${(e as Error).message})`);
    }
  } else if (o.paraPublicar) {
    errores.push('license: required to publish (an SPDX expression such as "MIT"; "LicenseRef-<name>" for your own)');
  }

  let author: ManifiestoNormalizado["author"] = null;
  const a = m.author ?? pkg?.author;
  if (typeof a === "string" && a.trim()) author = { name: a.trim() };
  else if (a && typeof a === "object" && texto(a.name)) {
    author = { name: a.name.trim(), ...(texto(a.email) ? { email: a.email } : {}), ...(texto(a.url) ? { url: a.url } : {}) };
  } else if (a !== undefined) errores.push("author: must be a string or {name, email?, url?}");
  if (!author && o.paraPublicar) errores.push("author: required to publish");

  let repository: ManifiestoNormalizado["repository"] = null;
  const r = m.repository ?? pkg?.repository;
  if (typeof r === "string" && r.trim()) repository = { url: r.trim() };
  else if (r && typeof r === "object" && texto(r.url)) {
    repository = {
      ...(texto(r.type) ? { type: r.type } : {}),
      url: r.url,
      ...(texto(r.directory) ? { directory: r.directory } : {}),
    };
  } else if (r !== undefined) errores.push("repository: must be a URL string or {type?, url, directory?}");
  if (repository && !/^(https:\/\/|git\+https:\/\/|git@|ssh:\/\/)/.test(repository.url)) {
    avisos.push(`repository: ${repository.url} is not an https/ssh URL`);
  }
  if (!repository && o.paraPublicar) avisos.push("repository: not declared (recommended)");

  const dependencies: Record<string, string> = {};
  const d = m.dependencies;
  const deps = Array.isArray(d) ? d : d?.kons;
  const rangos = !Array.isArray(d) && d?.versions !== undefined ? d.versions : {};
  if (!rangos || typeof rangos !== "object" || Array.isArray(rangos)) errores.push("dependencies.versions: must be an {id: range} object");
  if (Array.isArray(deps)) {
    for (const x of deps) {
      if (typeof x !== "string" || !KON_ID.test(x)) errores.push(`dependencies.kons: invalid id ${JSON.stringify(x)}`);
      else dependencies[x] = "*";
    }
    for (const [k, v] of Object.entries((rangos ?? {}) as Record<string, unknown>)) {
      if (!(k in dependencies)) errores.push(`dependencies.versions.${k}: not listed in dependencies.kons`);
      else if (typeof v !== "string" || !validRange(v)) errores.push(`dependencies.versions.${k}: not a semver range`);
      else dependencies[k] = v;
    }
  } else if (deps && typeof deps === "object") {
    if (o.paraPublicar) {
      errores.push(
        "dependencies.kons: must be an array of ids (the API loader, `kon add --from` and the Docker installer read it); " +
          'put version ranges in dependencies.versions, e.g. {"kons": ["kon-a"], "versions": {"kon-a": "^1.2.0"}}'
      );
    }
    for (const [k, v] of Object.entries(deps as Record<string, unknown>)) {
      if (!KON_ID.test(k)) errores.push(`dependencies.kons: invalid id ${JSON.stringify(k)}`);
      else if (typeof v !== "string" || !validRange(v)) errores.push(`dependencies.kons.${k}: not a semver range`);
      else dependencies[k] = v;
    }
  } else if (deps !== undefined) errores.push("dependencies.kons: must be an array of ids or an {id: range} object");
  if (id && dependencies[id]) errores.push("dependencies.kons: a kon cannot depend on itself");

  const tables: string[] = [];
  if (m.tables !== undefined) {
    if (!Array.isArray(m.tables)) errores.push("tables: must be an array");
    else {
      for (const t of m.tables) {
        const n = typeof t === "string" ? t : t?.name;
        if (typeof n !== "string" || !TABLE.test(n)) errores.push(`tables: invalid table ${JSON.stringify(n)}`);
        else if (!tables.includes(n)) tables.push(n);
      }
    }
  }
  tables.sort();

  const migrations = (o.migraciones ?? (Array.isArray(m.migrations) ? m.migrations : [])) as unknown[];
  const migracionesValidas: string[] = [];
  for (const f of migrations) {
    if (typeof f !== "string" || !MIGRATION.test(f)) errores.push(`migrations: invalid file name ${JSON.stringify(f)}`);
    else migracionesValidas.push(f);
  }
  migracionesValidas.sort();

  let permissions: PermisosDeclarados | null = null;
  if (m.permissions !== undefined) {
    const p = m.permissions;
    if (!p || typeof p !== "object" || Array.isArray(p)) errores.push("permissions: must be an object");
    else {
      for (const k of Object.keys(p)) {
        if (!["scopes", "hosts", "sensitive"].includes(k)) errores.push(`permissions.${k}: unknown field`);
      }
      permissions = {
        scopes: lista(p.scopes, "permissions.scopes", SCOPE, errores),
        hosts: lista(
          Array.isArray(p.hosts) ? p.hosts.map((h: unknown) => (typeof h === "string" ? h.toLowerCase() : h)) : p.hosts,
          "permissions.hosts",
          HOST,
          errores
        ),
        sensitive: lista(p.sensitive, "permissions.sensitive", OP_ID, errores),
      };
      if (permissions.hosts.includes("*")) errores.push("permissions.hosts: a bare * is not allowed");
    }
  } else if (o.paraPublicar) {
    errores.push(
      'permissions: required to publish — {"scopes": [], "hosts": [], "sensitive": []} (empty lists are an explicit "none")'
    );
  }

  // Admin views: same rule as the admin extension point.
  const views = m.admin?.views;
  if (Array.isArray(views)) {
    for (const v of views) {
      if (v?.type === "element" && !esRutaDeArtefactoSegura(String(v.src ?? "").replace(/^\.\//, ""))) {
        errores.push(`admin.views[${v.id}].src: ${JSON.stringify(v.src)} is not a safe asset path (relative, no "..", .js/.mjs/.css/.map)`);
      }
    }
  }

  // No install scripts: pnpm runs a workspace package's lifecycle scripts.
  const scripts = pkg?.scripts && typeof pkg.scripts === "object" ? Object.keys(pkg.scripts) : [];
  const prohibidos = scripts.filter((s) => SCRIPTS_PROHIBIDOS.has(s));
  if (prohibidos.length) {
    errores.push(`package.json: lifecycle scripts are not allowed in a published kon (${prohibidos.join(", ")})`);
  }

  const ok = errores.length === 0;
  return {
    ok,
    errores,
    avisos,
    manifiesto: ok
      ? {
          manifest: MANIFEST_SPEC_VERSION,
          id: id!,
          name: name!,
          version: version!,
          description: description!,
          sdk,
          kitsuden,
          license,
          author,
          repository,
          dependencies,
          tables,
          migrations: migracionesValidas,
          permissions,
        }
      : null,
  };
}

/** npm/pnpm lifecycle scripts that run on install, pack or publish. */
export const SCRIPTS_PROHIBIDOS = new Set([
  "preinstall", "install", "postinstall", "preuninstall", "uninstall", "postuninstall",
  "prepare", "preprepare", "postprepare", "prepublish", "prepack", "postpack",
  "pnpm:devPreinstall", "dependencies",
]);

/** Does this core version satisfy the kon's `kitsuden` range? (pre-release tag ignored) */
export function compatibleConElNucleo(rango: string | null, versionDelNucleo: string | null): boolean {
  if (!rango || !versionDelNucleo) return true;
  const v = coerceRelease(versionDelNucleo);
  return v ? satisfies(v, rango) : false;
}
