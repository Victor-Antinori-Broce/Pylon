/**
 * The signed kon registry — manifest, signatures, tarballs, resolution, lockfile
 * and the CLI end to end, on a fake project and a local registry in a temp dir.
 *
 *   pnpm --filter @kitsuden/cli build && node --test tests/registro.test.mjs
 *
 * Keys are generated into the temp dir for each run: nothing is written to the
 * repository.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

const DIST = resolve(import.meta.dirname, "..", "dist");
const CLI = join(DIST, "index.js");
const m = (p) => import(new URL(`file:///${join(DIST, p).replace(/\\/g, "/")}`).href);

const semver = await m("registro/semver.js");
const manifiesto = await m("registro/manifiesto.js");
const firma = await m("registro/firma.js");
const tar = await m("registro/tar.js");
const permisos = await m("registro/permisos.js");
const resolverM = await m("registro/resolver.js");

let base;
before(() => {
  assert.ok(existsSync(CLI), "build the CLI first: pnpm --filter @kitsuden/cli build");
  base = mkdtempSync(join(tmpdir(), "kr-registro-"));
});
after(() => base && rmSync(base, { recursive: true, force: true }));

function escribir(ruta, contenido) {
  mkdirSync(join(ruta, ".."), { recursive: true });
  writeFileSync(ruta, typeof contenido === "string" ? contenido : JSON.stringify(contenido, null, 2));
}

const PUBLICABLE = {
  id: "kon-demo",
  name: "Demo",
  description: "A demo kon",
  version: "1.0.0",
  sdk: 1,
  kitsuden: ">=0.9.0",
  license: "MIT",
  author: "Tester",
  repository: "https://example.com/demo.git",
  permissions: { scopes: [], hosts: [], sensitive: [] },
};

// ── Manifest ────────────────────────────────────────────────────────────────

describe("manifest spec v1", () => {
  it("normalizes what existing kons declare (array deps, compatibility.kitsuden, table objects)", () => {
    const r = manifiesto.validarManifiesto({
      id: "kon-blog",
      name: "Blog",
      description: "x",
      version: "2.0.0",
      sdk: 1,
      compatibility: { kitsuden: ">=0.8.0" },
      dependencies: { kons: ["kon-media"], core: ["auth"] },
      tables: ["blog_posts", { name: "blog_tags", label: "Tags" }],
    });
    assert.ok(r.ok, r.errores.join("; "));
    assert.equal(r.manifiesto.kitsuden, ">=0.8.0");
    assert.deepEqual(r.manifiesto.dependencies, { "kon-media": "*" });
    assert.deepEqual(r.manifiesto.tables, ["blog_posts", "blog_tags"]);
    assert.equal(r.manifiesto.permissions, null);
  });

  it("publishing requires license, sdk, kitsuden range, author and an explicit permissions block", () => {
    const r = manifiesto.validarManifiesto({ id: "kon-x", name: "X", description: "x", version: "1.0.0" }, { paraPublicar: true });
    assert.equal(r.ok, false);
    const t = r.errores.join("\n");
    for (const campo of ["license", "sdk", "kitsuden", "author", "permissions"]) assert.match(t, new RegExp(campo));
    assert.ok(manifiesto.validarManifiesto(PUBLICABLE, { paraPublicar: true }).ok);
  });

  it("rejects bad ids, versions, SPDX, ranges, scopes and hosts", () => {
    const malo = (extra) => manifiesto.validarManifiesto({ ...PUBLICABLE, ...extra }, { paraPublicar: true });
    assert.equal(malo({ id: "Demo" }).ok, false);
    assert.equal(malo({ version: "1.0" }).ok, false);
    assert.equal(malo({ license: "MIT OR" }).ok, false);
    assert.equal(malo({ license: "(MIT" }).ok, false);
    assert.ok(malo({ license: "(MIT OR Apache-2.0) AND LicenseRef-Acme" }).ok);
    assert.equal(malo({ kitsuden: ">=banana" }).ok, false);
    assert.equal(malo({ dependencies: { kons: ["kon-a"], versions: { "kon-a": "^banana" } } }).ok, false);
    assert.equal(malo({ dependencies: { kons: [], versions: { "kon-a": "^1" } } }).ok, false, "range for an unlisted kon");
    assert.equal(malo({ dependencies: { kons: { "kon-a": "^1" } } }).ok, false, "object form is not publishable");
    assert.deepEqual(malo({ dependencies: { kons: ["kon-a"], versions: { "kon-a": "^1.2" } } }).manifiesto.dependencies, { "kon-a": "^1.2" });
    assert.equal(malo({ permissions: { scopes: ["Bad Scope"], hosts: [], sensitive: [] } }).ok, false);
    assert.equal(malo({ permissions: { scopes: [], hosts: ["https://x.com"], sensitive: [] } }).ok, false);
    assert.equal(malo({ permissions: { scopes: [], hosts: ["*"], sensitive: [] } }).ok, false);
    assert.equal(malo({ permissions: { scopes: [], hosts: [], sensitive: [], extra: [] } }).ok, false);
    assert.equal(malo({ dependencies: { kons: ["kon-demo"] } }).ok, false, "self dependency");
  });

  it("keeps the admin extension point's src rule (no .., no absolute, no URL, only js/css)", () => {
    for (const src of ["../../etc/passwd.js", "/abs.js", "https://cdn.x/a.js", "a\\b.js", "view.html", "x.ts"]) {
      const r = manifiesto.validarManifiesto(
        { ...PUBLICABLE, admin: { views: [{ id: "v", type: "element", element: "x-y", src }] } },
        { paraPublicar: true }
      );
      assert.equal(r.ok, false, src);
    }
    assert.ok(
      manifiesto.validarManifiesto(
        { ...PUBLICABLE, admin: { views: [{ id: "v", type: "element", element: "x-y", src: "./admin/v.js" }] } },
        { paraPublicar: true }
      ).ok
    );
  });

  it("refuses lifecycle (install) scripts in package.json", () => {
    const r = manifiesto.validarManifiesto(PUBLICABLE, {
      paraPublicar: true,
      paquete: { version: "1.0.0", scripts: { build: "tsc", postinstall: "node evil.js" } },
    });
    assert.equal(r.ok, false);
    assert.match(r.errores.join(), /postinstall/);
  });

  it("core compatibility ignores the core's pre-release tag (0.9.0-beta satisfies >=0.9.0)", () => {
    assert.ok(manifiesto.compatibleConElNucleo(">=0.9.0", "0.9.0-beta"));
    assert.equal(manifiesto.compatibleConElNucleo(">=1.0.0", "0.9.0-beta"), false);
  });
});

// ── Semver ──────────────────────────────────────────────────────────────────

describe("semver", () => {
  const casos = [
    ["1.2.3", "^1.0.0", true],
    ["2.0.0", "^1.0.0", false],
    ["0.2.5", "^0.2.0", true],
    ["0.3.0", "^0.2.0", false],
    ["0.0.4", "^0.0.3", false],
    ["1.2.9", "~1.2.0", true],
    ["1.3.0", "~1.2.0", false],
    ["1.9.9", "1.x", true],
    ["2.0.0-beta.1", "<2.0.0", false],
    ["2.0.0-beta.1", "^2.0.0-beta.0", true],
    ["2.0.0-beta.1", "*", false],
    ["1.5.0", ">=1.0.0 <2", true],
    ["3.0.0", "1.x || >=3", true],
    ["1.5.0", "1.0.0 - 1.4.0", false],
    ["1.4.0", "1.0.0 - 1.4", true],
    ["1.0.0", "=1.0.0", true],
  ];
  for (const [v, r, esperado] of casos) {
    it(`${v} ${esperado ? "satisfies" : "does not satisfy"} ${r}`, () => assert.equal(semver.satisfies(v, r), esperado));
  }
  it("maxSatisfying picks the highest", () => {
    assert.equal(semver.maxSatisfying(["1.0.0", "1.4.0", "2.0.0", "1.10.0"], "^1"), "1.10.0");
  });
});

// ── Signatures ──────────────────────────────────────────────────────────────

describe("signatures (minisign format, Ed25519)", () => {
  const { publica, secreta } = firma.generarClaves();
  const otra = firma.generarClaves();
  const datos = Buffer.from("kon package bytes");

  it("verifies and returns the signed comment", () => {
    const s = firma.firmarDatos(datos, firma.leerClaveSecreta(secreta), "kitsuden-kon id=kon-a version=1.0.0");
    assert.equal(firma.verificarFirma(datos, s, firma.leerClavePublica(publica)), "kitsuden-kon id=kon-a version=1.0.0");
  });

  it("fails on tampered data", () => {
    const s = firma.firmarDatos(datos, firma.leerClaveSecreta(secreta), "c");
    assert.throws(() => firma.verificarFirma(Buffer.from("kon package bytez"), s, firma.leerClavePublica(publica)), /does not match/);
  });

  it("fails with the wrong key", () => {
    const s = firma.firmarDatos(datos, firma.leerClaveSecreta(secreta), "c");
    assert.throws(() => firma.verificarFirma(datos, s, firma.leerClavePublica(otra.publica)), /expected/);
  });

  it("fails with the wrong key even if the key id is forged to match", () => {
    const s = firma.firmarDatos(datos, firma.leerClaveSecreta(secreta), "c");
    const real = firma.leerClavePublica(publica);
    const falsa = { keyId: real.keyId, clave: firma.leerClavePublica(otra.publica).clave };
    assert.throws(() => firma.verificarFirma(datos, s, falsa), /does not match/);
  });

  it("fails when the trusted comment is edited", () => {
    const s = firma.firmarDatos(datos, firma.leerClaveSecreta(secreta), "kitsuden-kon id=kon-a version=1.0.0");
    const editada = s.replace("version=1.0.0", "version=9.9.9");
    assert.throws(() => firma.verificarFirma(datos, editada, firma.leerClavePublica(publica)), /trusted comment/);
  });

  it("an encrypted secret key needs its passphrase", () => {
    const c = firma.generarClaves("correct horse");
    assert.throws(() => firma.leerClaveSecreta(c.secreta), /encrypted/);
    assert.throws(() => firma.leerClaveSecreta(c.secreta, "wrong"), /could not open/);
    assert.ok(firma.leerClaveSecreta(c.secreta, "correct horse"));
  });
});

// ── Tarballs ────────────────────────────────────────────────────────────────

/** A raw tar entry with any type and name (to craft hostile archives). */
function entrada(nombre, datos = Buffer.alloc(0), tipo = "0", enlace = "") {
  const h = Buffer.alloc(512, 0);
  h.write(nombre, 0, 100, "utf8");
  h.write("0000644\0", 100);
  h.write("0000000\0", 108);
  h.write("0000000\0", 116);
  h.write(datos.length.toString(8).padStart(11, "0") + "\0", 124);
  h.write("00000000000\0", 136);
  h.write("        ", 148);
  h.write(tipo, 156);
  h.write(enlace, 157, 100);
  h.write("ustar\0", 257);
  h.write("00", 263);
  let s = 0;
  for (const x of h) s += x;
  h.write(s.toString(8).padStart(6, "0") + "\0 ", 148);
  const relleno = Buffer.alloc((512 - (datos.length % 512)) % 512, 0);
  return Buffer.concat([h, datos, relleno]);
}
const tgzDe = (...entradas) => gzipSync(Buffer.concat([...entradas, Buffer.alloc(1024, 0)]));

describe("package tarballs", () => {
  it("are deterministic and round-trip", () => {
    const f = [
      { ruta: "kon.json", datos: Buffer.from("{}") },
      { ruta: "src/a.ts", datos: Buffer.from("export {}") },
    ];
    const a = tar.empaquetar(f);
    const b = tar.empaquetar([...f].reverse());
    assert.ok(a.equals(b));
    assert.deepEqual(
      tar.leerPaquete(a).map((x) => x.ruta),
      ["kon.json", "src/a.ts"]
    );
    assert.equal(tar.huellaDeFicheros(tar.leerPaquete(a)), tar.huellaDeFicheros(f));
  });

  const hostiles = [
    ["path traversal", entrada("package/../../evil.js", Buffer.from("x")), /traversal/],
    ["absolute path", entrada("/etc/passwd", Buffer.from("x")), /outside package/],
    ["windows drive", entrada("package/C:/x.js", Buffer.from("x")), /forbidden character|absolute/],
    ["backslash", entrada("package/a\\..\\..\\x.js", Buffer.from("x")), /forbidden character/],
    ["symlink", entrada("package/link", Buffer.alloc(0), "2", "/etc/passwd"), /links are not allowed/],
    ["hard link", entrada("package/link", Buffer.alloc(0), "1", "package/kon.json"), /links are not allowed/],
    ["device", entrada("package/dev", Buffer.alloc(0), "3"), /not allowed/],
    ["pax header", entrada("package/x", Buffer.from("30 path=../../x\n"), "x"), /not allowed/],
    ["reserved name", entrada("package/CON.js", Buffer.from("x")), /reserved/],
    ["outside package/", entrada("other/x.js", Buffer.from("x")), /outside package/],
  ];
  for (const [nombre, e, error] of hostiles) {
    it(`rejects a ${nombre} entry`, () => assert.throws(() => tar.leerPaquete(tgzDe(e)), error));
  }

  it("rejects case-insensitive duplicates", () => {
    const t = tgzDe(entrada("package/Kon.json", Buffer.from("a")), entrada("package/kon.json", Buffer.from("b")));
    assert.throws(() => tar.leerPaquete(t), /duplicate/);
  });

  it("rejects a corrupted header checksum", () => {
    const e = entrada("package/a.js", Buffer.from("x"));
    e[0] = "b".charCodeAt(0);
    assert.throws(() => tar.leerPaquete(tgzDe(e)), /checksum/);
  });

  it("rejects a gzip bomb beyond the expanded limit", () => {
    const grande = Buffer.alloc(tar.LIMITES.expandido + 1024 * 1024, 0);
    assert.throws(() => tar.leerPaquete(gzipSync(grande)), /expands beyond/);
  });

  it("extracts only into a new empty folder, never through an existing file", () => {
    const destino = join(base, "extraer");
    mkdirSync(destino, { recursive: true });
    writeFileSync(join(destino, "ya.txt"), "x");
    assert.throws(() => tar.extraer([{ ruta: "a.js", datos: Buffer.from("x") }], destino), /not empty/);
  });

  it("packing refuses symlinks and secret-looking files", (t) => {
    const dir = join(base, "pack-src");
    escribir(join(dir, "kon.json"), "{}");
    escribir(join(dir, ".env"), "SECRET=1");
    assert.throws(() => tar.ficherosParaEmpaquetar(dir), /secret/);
    rmSync(join(dir, ".env"));
    escribir(join(dir, ".env.example"), "SECRET=");
    assert.equal(tar.ficherosParaEmpaquetar(dir).length, 2);
    try {
      symlinkSync(join(dir, "kon.json"), join(dir, "enlace.json"), "file");
    } catch {
      t.skip("no symlink privilege on this machine");
      return;
    }
    assert.throws(() => tar.ficherosParaEmpaquetar(dir), /symlinks/);
  });
});

// ── Permission diff ─────────────────────────────────────────────────────────

describe("permission diff", () => {
  const mf = (p, extra = {}) => ({ ...manifiesto.validarManifiesto({ ...PUBLICABLE, permissions: p, ...extra }).manifiesto });
  it("wildcards cover narrower scopes and hosts", () => {
    const d = permisos.diffDePermisos(
      { manifiesto: mf({ scopes: ["datasets:*:read"], hosts: ["*.example.com"], sensitive: [] }) },
      { manifiesto: mf({ scopes: ["datasets:clients:read"], hosts: ["api.example.com"], sensitive: [] }, { version: "1.1.0" }) }
    );
    assert.equal(permisos.amplia(d), false);
  });
  it("new scopes, hosts, sensitive ops and dropped denials widen", () => {
    const antes = mf({ scopes: ["kon:demo:read", "!kon:demo:delete"], hosts: [], sensitive: [] });
    for (const p of [
      { scopes: ["kon:demo:read", "kon:demo:write", "!kon:demo:delete"], hosts: [], sensitive: [] },
      { scopes: ["kon:demo:read", "!kon:demo:delete"], hosts: ["evil.example"], sensitive: [] },
      { scopes: ["kon:demo:read", "!kon:demo:delete"], hosts: [], sensitive: ["borrar-todo"] },
      { scopes: ["kon:demo:read"], hosts: [], sensitive: [] },
    ]) {
      assert.equal(permisos.amplia(permisos.diffDePermisos({ manifiesto: antes }, { manifiesto: mf(p, { version: "2.0.0" }) })), true, JSON.stringify(p));
    }
  });
});

// ── Resolver ────────────────────────────────────────────────────────────────

function indiceDe(kons, advisories = []) {
  const k = {};
  for (const [id, versiones] of Object.entries(kons)) {
    k[id] = { owners: ["K"], versions: {} };
    for (const [v, extra] of Object.entries(versiones)) {
      const { yanked, kitsuden, ...mextra } = extra;
      k[id].versions[v] = {
        yanked: Boolean(yanked),
        keyId: "K",
        manifest: { id, version: v, sdk: 1, kitsuden: kitsuden ?? ">=0.9.0", dependencies: {}, tables: [], migrations: [], permissions: null, ...mextra },
      };
    }
  }
  return { format: "kitsuden-kon-index", version: 1, serial: 1, kons: k, advisories, publishers: {}, revokedKeys: [] };
}

describe("resolution and lockfile", () => {
  const base = { versionDelNucleo: "0.9.0-beta", sdkDelNucleo: 1 };
  const plan = (r) => Object.fromEntries(r.plan.map((e) => [e.id, e.version]));

  it("picks the highest version that satisfies every range, dependencies first", () => {
    const indice = indiceDe({
      "kon-a": { "1.0.0": {}, "1.5.0": {}, "2.0.0": {} },
      "kon-b": { "1.0.0": { dependencies: { "kon-a": "^1.2.0" } } },
    });
    const r = resolverM.resolver({ ...base, indice, pedidos: { "kon-b": "*" } });
    assert.deepEqual(plan(r), { "kon-a": "1.5.0", "kon-b": "1.0.0" });
    assert.equal(r.plan[0].id, "kon-a");
  });

  it("reports a conflict with who asked for what", () => {
    const indice = indiceDe({
      "kon-a": { "1.0.0": {}, "2.0.0": {} },
      "kon-b": { "1.0.0": { dependencies: { "kon-a": "^1" } } },
    });
    assert.throws(() => resolverM.resolver({ ...base, indice, pedidos: { "kon-b": "*", "kon-a": "^2" } }), /no version of kon-a fits[\s\S]*kon-b@1.0.0/);
  });

  it("refuses yanked versions", () => {
    const indice = indiceDe({ "kon-a": { "1.0.0": { yanked: true } } });
    assert.throws(() => resolverM.resolver({ ...base, indice, pedidos: { "kon-a": "1.0.0" } }), /yanked/);
  });

  it("keeps a yanked version the lockfile pins (warning), but update refuses it", () => {
    const indice = indiceDe({ "kon-a": { "1.0.0": { yanked: true }, "0.9.0": {} } });
    const bloqueo = { lockfileVersion: 1, registries: {}, kons: { "kon-a": { version: "1.0.0" } } };
    const r = resolverM.resolver({ ...base, indice, pedidos: { "kon-a": "*" }, bloqueo });
    assert.equal(plan(r)["kon-a"], "1.0.0");
    assert.match(r.avisos.join(), /yanked/);
    const u = resolverM.resolver({ ...base, indice, pedidos: { "kon-a": "*" }, bloqueo, actualizar: "all" });
    assert.equal(plan(u)["kon-a"], "0.9.0");
  });

  it("refuses revoked versions even when locked", () => {
    const indice = indiceDe({ "kon-a": { "1.0.0": {} } }, [
      { id: "KKA-1", kon: "kon-a", versions: "<=1.0.0", severity: "critical", summary: "backdoor", revoked: true },
    ]);
    const bloqueo = { lockfileVersion: 1, registries: {}, kons: { "kon-a": { version: "1.0.0" } } };
    assert.throws(() => resolverM.resolver({ ...base, indice, pedidos: { "kon-a": "=1.0.0" }, bloqueo }), /revoked/);
  });

  it("skips versions for a newer core or SDK", () => {
    const indice = indiceDe({ "kon-a": { "1.0.0": {}, "2.0.0": { kitsuden: ">=1.0.0" }, "3.0.0": { sdk: 2 } } });
    assert.equal(plan(resolverM.resolver({ ...base, indice, pedidos: { "kon-a": "*" } }))["kon-a"], "1.0.0");
  });

  it("prefers the locked version until update lifts it", () => {
    const indice = indiceDe({ "kon-a": { "1.0.0": {}, "1.1.0": {} } });
    const bloqueo = { lockfileVersion: 1, registries: {}, kons: { "kon-a": { version: "1.0.0" } } };
    assert.equal(plan(resolverM.resolver({ ...base, indice, pedidos: { "kon-a": "^1" }, bloqueo }))["kon-a"], "1.0.0");
    assert.equal(
      plan(resolverM.resolver({ ...base, indice, pedidos: { "kon-a": "^1" }, bloqueo, actualizar: new Set(["kon-a"]) }))["kon-a"],
      "1.1.0"
    );
  });

  it("core kons and source-installed kons satisfy dependencies", () => {
    const indice = indiceDe({ "kon-b": { "1.0.0": { dependencies: { "kon-media": "*", "kon-local": "^1" } } } });
    const r = resolverM.resolver({ ...base, indice, pedidos: { "kon-b": "*" }, instaladosFuera: { "kon-local": "1.2.0" } });
    assert.deepEqual(plan(r), { "kon-b": "1.0.0" });
    assert.throws(
      () => resolverM.resolver({ ...base, indice, pedidos: { "kon-b": "*" }, instaladosFuera: { "kon-local": "0.1.0" } }),
      /installed from a source folder/
    );
  });

  it("parses id@range requests", () => {
    const id = (n) => (n.startsWith("kon-") ? n : `kon-${n}`);
    assert.deepEqual(resolverM.leerPedido("blog@^2.1", id), { id: "kon-blog", rango: "^2.1" });
    assert.deepEqual(resolverM.leerPedido("blog", id), { id: "kon-blog", rango: "*" });
  });
});

// ── CLI end to end ──────────────────────────────────────────────────────────

describe("kitsuden kon (registry) end to end", () => {
  let proyecto, registro, fuentes, claves;

  const cli = (args, env = {}) =>
    spawnSync(process.execPath, [CLI, "kon", ...args], {
      encoding: "utf8",
      env: { ...process.env, KITSUDEN_API_URL: "", KITSUDEN_KONS_SOURCE: "", KITSUDEN_PUBLIC: "", KITSUDEN_KON_REGISTRY: "", ...env },
    });
  const enProyecto = (args, env) => cli([...args, "--root", proyecto], env);
  const declarados = () => JSON.parse(readFileSync(join(proyecto, "kitsuden.kons.json"), "utf8")).kons;
  const bloqueo = () => JSON.parse(readFileSync(join(proyecto, "kitsuden.kons.lock"), "utf8"));

  function konFuente(id, version, extra = {}) {
    const dir = join(fuentes, `${id}-${version}`);
    rmSync(dir, { recursive: true, force: true });
    escribir(join(dir, "kon.json"), {
      ...PUBLICABLE,
      id,
      name: id,
      version,
      tables: [`${id.replace(/-/g, "_")}_items`],
      ...extra,
    });
    escribir(join(dir, "package.json"), { name: `@kitsuden/${id}`, version, scripts: { build: "tsc" } });
    escribir(join(dir, "index.ts"), `export const kon = "${id}@${version}";\n`);
    escribir(join(dir, "migrations", "0001_init.sql"), `CREATE TABLE IF NOT EXISTS ${id.replace(/-/g, "_")}_items (id int);\n`);
    escribir(join(dir, "node_modules", "junk", "x.js"), "never packed");
    return dir;
  }
  const publicar = (dir, ...extra) => cli(["publish", dir, "--registry", registro, "--key", claves.editor + ".key", "--index-key", claves.registro + ".key", ...extra]);

  before(() => {
    proyecto = join(base, "proyecto");
    registro = join(base, "registro");
    fuentes = join(base, "fuentes");
    const k = join(base, "claves");
    claves = { editor: join(k, "editor"), registro: join(k, "registro"), otra: join(k, "otra") };
    escribir(join(proyecto, "package.json"), { name: "kitsuden", version: "0.9.0-beta", private: true });
    escribir(join(proyecto, "pnpm-workspace.yaml"), 'packages:\n  - "packages/kons/*"\n');
    escribir(join(proyecto, "packages", "kons", "package.json"), { name: "@kitsuden/kons", private: true });
    escribir(join(proyecto, "packages", "shared", "src", "operaciones.ts"), "export const VERSION_SDK_DE_KONS = 1;\n");
    escribir(
      join(proyecto, "apps", "api", "scripts", "migrate.ts"),
      `import { writeFileSync } from "node:fs";\nwriteFileSync("migrate-args.json", JSON.stringify(process.argv.slice(2)));\n`
    );
    for (const c of Object.values(claves)) {
      const r = cli(["keygen", "--out", c]);
      assert.equal(r.status, 0, r.stderr + r.stdout);
    }
    const pub = readFileSync(claves.registro + ".pub", "utf8").trim().split("\n")[1];
    escribir(join(proyecto, "kitsuden.registries.json"), { default: "local", registries: { local: { url: registro, key: pub } } });
  });

  it("keygen refuses to write a secret key inside a git repository", () => {
    const r = cli(["keygen", "--out", resolve(import.meta.dirname, "no-debe-existir")]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /inside a git repository/);
    assert.ok(!existsSync(resolve(import.meta.dirname, "no-debe-existir.key")));
  });

  it("publish refuses a manifest without license and permissions", () => {
    const dir = konFuente("kon-mal", "1.0.0", { license: undefined, permissions: undefined });
    const r = publicar(dir);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /license[\s\S]*permissions/);
  });

  it("publishes three kons (one depending on another) into a local registry", () => {
    let r = publicar(konFuente("kon-base", "1.0.0"));
    assert.equal(r.status, 0, r.stderr + r.stdout);
    r = publicar(konFuente("kon-base", "1.2.0"));
    assert.equal(r.status, 0, r.stderr + r.stdout);
    r = publicar(
      konFuente("kon-app", "1.0.0", {
        dependencies: { kons: ["kon-base", "kon-media"], versions: { "kon-base": "^1.1.0" } },
        permissions: { scopes: ["kon:app:read"], hosts: ["api.example.com"], sensitive: [] },
      })
    );
    assert.equal(r.status, 0, r.stderr + r.stdout);
    r = publicar(konFuente("kon-solo", "1.0.0"));
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const indice = JSON.parse(readFileSync(join(registro, "index.json"), "utf8"));
    assert.deepEqual(Object.keys(indice.kons).sort(), ["kon-app", "kon-base", "kon-solo"]);
    assert.ok(existsSync(join(registro, "index.json.minisig")));
    assert.ok(existsSync(join(registro, "packages", "kon-app", "kon-app-1.0.0.tgz.minisig")));
    // Immutable versions.
    r = publicar(konFuente("kon-solo", "1.0.0"));
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /immutable/);
  });

  it("the same folder packs to the same bytes (deterministic)", () => {
    const dir = konFuente("kon-det", "1.0.0");
    const a = cli(["publish", dir, "--registry", registro, "--key", claves.editor + ".key", "--index-key", claves.registro + ".key", "--dry-run"]);
    const b = cli(["publish", dir, "--registry", registro, "--key", claves.editor + ".key", "--index-key", claves.registro + ".key", "--dry-run"]);
    assert.equal(a.status, 0, a.stderr);
    assert.equal(a.stdout.match(/sha256 (\w+)/)[1], b.stdout.match(/sha256 (\w+)/)[1]);
  });

  it("another key cannot publish a kon it does not own", () => {
    const r = cli(["publish", konFuente("kon-solo", "1.1.0"), "--registry", registro, "--key", claves.otra + ".key", "--index-key", claves.registro + ".key"]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /is owned by/);
  });

  it("search and info read the signed index", () => {
    let r = enProyecto(["search", "kon-"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /kon-app[\s\S]*kon-base/);
    r = enProyecto(["info", "app"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /api\.example\.com/);
    assert.match(r.stdout, /kon-base@\^1\.1\.0/);
  });

  it("add without a terminal and without --yes shows the permissions and installs nothing", () => {
    const r = enProyecto(["add", "app", "--no-install", "--no-migrate"]);
    assert.equal(r.status, 3, r.stderr + r.stdout);
    assert.match(r.stdout, /api\.example\.com/);
    assert.match(r.stderr, /confirmation required/);
    assert.ok(!existsSync(join(proyecto, "packages", "kons", "kon-app")));
    assert.ok(!existsSync(join(proyecto, "kitsuden.kons.lock")));
  });

  it("add --yes installs the kon and its dependency, writes the lockfile and runs the normal runner", () => {
    const r = enProyecto(["add", "app@^1", "--yes", "--no-install"]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const d = declarados();
    assert.equal(d["kon-app"].source, "registry:local");
    assert.equal(d["kon-base"].version, "1.2.0");
    assert.ok(!existsSync(join(proyecto, "packages", "kons", "kon-app", "node_modules")));
    const b = bloqueo();
    assert.equal(b.kons["kon-app"].requested, "^1");
    assert.equal(b.kons["kon-base"].version, "1.2.0");
    assert.equal(b.kons["kon-app"].contentHash, d["kon-app"].hash, "installed copy hash = signed content hash");
    assert.equal(b.kons["kon-app"].license, "MIT");
    assert.match(b.kons["kon-app"].sha256, /^[0-9a-f]{64}$/);
    assert.ok(b.kons["kon-app"].signed);
    const args = JSON.parse(readFileSync(join(proyecto, "apps", "api", "migrate-args.json"), "utf8"));
    assert.deepEqual(args.sort(), ["--kon", "--kon", "kon-app", "kon-base"].sort());
    const staging = join(proyecto, ".kitsuden", "registry-staging");
    assert.ok(!existsSync(staging) || readdirSync(staging).length === 0, "staging is cleaned up");
  });

  it("kon list still works and shows the registry kons", () => {
    const r = enProyecto(["list"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /ok\s+kon-app/);
  });

  it("verify passes, then fails after an installed file is edited", () => {
    let r = enProyecto(["verify"]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const f = join(proyecto, "packages", "kons", "kon-app", "index.ts");
    const original = readFileSync(f, "utf8");
    writeFileSync(f, original + "// tampered\n");
    r = enProyecto(["verify"]);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /differs from the signed package/);
    writeFileSync(f, original);
  });

  it("verify --file checks a package offline with the publisher key", () => {
    const tgz = join(registro, "packages", "kon-solo", "kon-solo-1.0.0.tgz");
    let r = cli(["verify", "--file", tgz, "--key", claves.editor + ".pub"]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    r = cli(["verify", "--file", tgz, "--key", claves.otra + ".pub"]);
    assert.notEqual(r.status, 0);
  });

  it("an update that widens hosts is refused with --yes alone and accepted with --accept-wider", () => {
    let r = publicar(
      konFuente("kon-app", "1.1.0", {
        dependencies: { kons: ["kon-base"], versions: { "kon-base": "^1.1.0" } },
        permissions: { scopes: ["kon:app:read"], hosts: ["api.example.com", "exfil.example.net"], sensitive: [] },
      })
    );
    assert.equal(r.status, 0, r.stderr);
    r = enProyecto(["outdated"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /kon-app\s+1\.0\.0\s+1\.1\.0/);
    r = enProyecto(["update", "app", "--yes", "--no-install", "--no-migrate"]);
    assert.equal(r.status, 3, r.stderr + r.stdout);
    assert.match(r.stdout, /\+ exfil\.example\.net/);
    assert.match(r.stderr, /accept-wider/);
    assert.equal(bloqueo().kons["kon-app"].version, "1.0.0");
    r = enProyecto(["update", "app", "--yes", "--accept-wider", "--no-install", "--no-migrate"]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(bloqueo().kons["kon-app"].version, "1.1.0");
  });

  it("a tampered tarball is refused and nothing changes", () => {
    const tgz = join(registro, "packages", "kon-solo", "kon-solo-1.0.0.tgz");
    const original = readFileSync(tgz);
    const malo = Buffer.from(original);
    malo[malo.length - 20] ^= 0xff;
    writeFileSync(tgz, malo);
    const antes = JSON.stringify(declarados());
    const r = enProyecto(["add", "solo", "--yes", "--no-install", "--no-migrate"]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /tampered/);
    assert.equal(JSON.stringify(declarados()), antes);
    assert.ok(!existsSync(join(proyecto, "packages", "kons", "kon-solo")));
    writeFileSync(tgz, original);
  });

  it("an edited index (hash swapped by whoever controls the host) is refused", () => {
    // Attacker with write access to the host replaces the package AND the
    // index entry's hash, but cannot sign the index with the registry key.
    const indiceRuta = join(registro, "index.json");
    const original = readFileSync(indiceRuta);
    const j = JSON.parse(original);
    j.kons["kon-solo"].versions["1.0.0"].sha256 = "0".repeat(64);
    writeFileSync(indiceRuta, JSON.stringify(j));
    const r = enProyecto(["add", "solo", "--yes", "--no-install", "--no-migrate"]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /registry index signature/);
    writeFileSync(indiceRuta, original);
  });

  it("the wrong registry key is refused", () => {
    const r = enProyecto(["search", "--registry", registro, "--registry-key", claves.otra + ".pub"]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /registry index signature/);
  });

  it("--allow-unsigned is refused when KITSUDEN_PUBLIC=true", () => {
    const r = enProyecto(["search", "--allow-unsigned"], { KITSUDEN_PUBLIC: "true" });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /KITSUDEN_PUBLIC=true/);
  });

  it("an unsigned package is refused without --allow-unsigned", () => {
    const sig = join(registro, "packages", "kon-solo", "kon-solo-1.0.0.tgz.minisig");
    const original = readFileSync(sig);
    rmSync(sig);
    let r = enProyecto(["add", "solo", "--yes", "--no-install", "--no-migrate"]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /not signed/);
    r = enProyecto(["add", "solo", "--yes", "--no-install", "--no-migrate", "--allow-unsigned"], { KITSUDEN_PUBLIC: "true" });
    assert.notEqual(r.status, 0);
    writeFileSync(sig, original);
  });

  it("a yanked version is refused for a new install", () => {
    let r = cli(["yank", "kon-solo@1.0.0", "--registry", registro, "--index-key", claves.registro + ".key", "--reason", "broken"]);
    assert.equal(r.status, 0, r.stderr);
    r = enProyecto(["add", "solo@1.0.0", "--yes", "--no-install", "--no-migrate"]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /yanked \(broken\)/);
  });

  it("a revoked version is refused even though the lockfile pins it", () => {
    let r = cli([
      "yank", "kon-base@1.2.0", "--registry", registro, "--index-key", claves.registro + ".key",
      "--revoke", "--advisory", "malicious build", "--severity", "critical",
    ]);
    assert.equal(r.status, 0, r.stderr);
    r = enProyecto(["verify"]);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /REVOKED/);
    r = enProyecto(["sync", "--no-install", "--no-migrate"]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /revoked/);
  });

  it("an older index (rollback) is refused once a newer serial was seen", () => {
    const vistos = bloqueo().registries.local.serial;
    assert.ok(vistos > 1);
    const b = bloqueo();
    b.registries.local.serial = vistos + 100;
    writeFileSync(join(proyecto, "kitsuden.kons.lock"), JSON.stringify(b));
    const r = enProyecto(["search"]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /rollback/);
    b.registries.local.serial = vistos;
    writeFileSync(join(proyecto, "kitsuden.kons.lock"), JSON.stringify(b));
  });

  it("remove drops the kon from the lockfile", () => {
    const r = enProyecto(["remove", "app", "--no-install"]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.ok(!bloqueo().kons["kon-app"]);
  });

  it("source installs (--from) still work alongside the registry", () => {
    const dir = konFuente("kon-local", "1.0.0");
    const r = enProyecto(["add", "local", "--from", dir, "--no-install", "--no-migrate"]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(declarados()["kon-local"].mode, "copy");
  });
});

// Hash helper sanity (the content hash equals the copy installer's algorithm).
describe("content hash", () => {
  it("matches path\\0bytes\\0 over sorted files", () => {
    const f = [{ ruta: "b", datos: Buffer.from("2") }, { ruta: "a", datos: Buffer.from("1") }];
    const h = createHash("sha256").update("a\0").update("1").update("\0").update("b\0").update("2").update("\0").digest("hex");
    assert.equal(tar.huellaDeFicheros(f), h);
  });
});
