/**
 * Lo que tiene que seguir siendo cierto para que `./install.sh` funcione
 * ============================================================================
 *
 * La instalación nueva es justo lo que nadie repite: quien desarrolla ya tiene
 * la base creada. Así se escaparon tres fallos que solo se vieron siguiendo el
 * README sobre una base vacía (2026-10-31): la cola sin permisos, el login con
 * «Invalid origin» en la URL que el propio README recomendaba, y el interruptor
 * de kons sin rol de DDL.
 *
 * Se comprueba leyendo los ficheros, como arranque-base-que-falta.test.ts: la
 * prueba de verdad es una instalación entera y tarda 15 minutos.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const raiz = join(__dirname, "..", "..");
const leer = (f: string) => readFileSync(join(raiz, f), "utf8");

describe("docker/start-with-check.sh", () => {
  const arranque = leer("docker/start-with-check.sh");

  it("crea el rol de la app ANTES de migrar: las migraciones le dan permisos solo si existe", () => {
    const crear = arranque.indexOf('CREATE ROLE "${APP_USER}"');
    const migrar = arranque.indexOf('DATABASE_URL="$DB_ADMIN_URL" bun run scripts/migrate.ts');
    expect(crear).toBeGreaterThan(-1);
    expect(migrar).toBeGreaterThan(-1);
    expect(crear).toBeLessThan(migrar);
  });

  it("calcula APP_USER y APP_PASS antes de usarlos", () => {
    expect(arranque.indexOf("APP_USER=$(")).toBeLessThan(arranque.indexOf('CREATE ROLE "${APP_USER}"'));
    expect(arranque.indexOf("APP_PASS=$(")).toBeLessThan(arranque.indexOf('CREATE ROLE "${APP_USER}"'));
  });
});

describe("docker-compose.yml", () => {
  const compose = leer("docker-compose.yml");

  // Un despliegue existente no define KITSUDEN_INSTANCE. Si el valor por defecto
  // cambiara, sus volúmenes dejarían de ser los suyos: arrancaría con la base vacía.
  it.each(["postgres", "valkey", "backups", "seaweedfs", "net"])(
    "el nombre por defecto de %s sigue siendo el de siempre",
    (recurso) => {
      expect(compose).toContain(`name: \${KITSUDEN_INSTANCE:-kitsuden}_${recurso}_prod`);
    }
  );

  it("el volumen de medios sigue sin `name:` (su nombre depende del proyecto)", () => {
    expect(compose).toMatch(/^ {2}kitsuden_uploads_prod:\r?\n {2}kitsuden_postgres_prod:/m);
  });

  it("no quedan contenedores con nombre fijo: chocarían con otra instalación", () => {
    const fijos = compose.match(/^\s+container_name: (?!\$\{KITSUDEN_INSTANCE:-kitsuden\}_).*$/gm);
    expect(fijos).toBeNull();
  });

  it("los orígenes por defecto incluyen 127.0.0.1, la URL que usa la documentación", () => {
    expect(compose).toContain("http://127.0.0.1:3001}");
  });

  it("le pasa a la API el rol de DDL y el issuer de OAuth", () => {
    expect(compose).toContain("- DATABASE_DDL_URL=${DDL_DB_PASSWORD:+postgresql://");
    expect(compose).toContain("- OAUTH_ISSUER_URL=${OAUTH_ISSUER_URL:-}");
  });
});

describe("docker/nginx-admin.conf", () => {
  it("llega a la API por el nombre del servicio, que no cambia con la instancia", () => {
    const conf = leer("docker/nginx-admin.conf");
    expect(conf).toContain("proxy_pass http://kitsuden_api:3000;");
    expect(conf).not.toContain("kitsuden_api_prod");
  });
});

describe("crear un agente desde el panel", () => {
  it("le da permisos que permitan usar las herramientas: solo lectura por defecto", () => {
    const vista = leer("packages/admin/src/views/system-tools/AgentsView.svelte");
    expect(vista).toContain('let acceso = $state("read-only");');
    expect(vista).toContain("scopes: [...(ACCESOS.find(");
    expect(vista).not.toContain('"full-admin"');
  });

  it("la API valida esos permisos en vez de ignorarlos", () => {
    const ruta = leer("apps/api/src/routes/agents-v1.ts");
    expect(ruta).toContain('validScopes = normalizarScopes(scopes ?? ["mcp:connect"]);');
    expect(ruta).toContain("scopes: validScopes,");
  });
});

describe(".env.production.example", () => {
  const ejemplo = leer(".env.production.example");

  it("trae el rol de DDL por rellenar: sin él no se puede activar un kon desde el panel", () => {
    expect(ejemplo).toMatch(/^DDL_DB_PASSWORD=<openssl rand -hex 32>/m);
  });

  it("no deja activo un issuer de OAuth de ejemplo", () => {
    expect(ejemplo).not.toMatch(/^OAUTH_ISSUER_URL=/m);
  });
});

describe.each([
  ["install.sh", "KITSUDEN_INSTANCE=$instancia"],
  ["install.ps1", "KITSUDEN_INSTANCE=$instancia"],
])("%s", (fichero, instancia) => {
  const script = leer(fichero);

  it("no arranca en una carpeta con despliegue propio ni con un .env ajeno", () => {
    expect(script).toContain("docker-compose.override.yml");
    expect(script).toContain("# Created by install.sh");
    expect(script).toContain("scripts/deploy.sh");
  });

  it("elige su propia instancia e imágenes: no reutiliza las de otra instalación", () => {
    expect(script).toContain(instancia);
    expect(script).toContain("KITSUDEN_API_IMAGE=$instancia/api:latest");
    expect(script).toContain("KITSUDEN_ADMIN_IMAGE=$instancia/admin:latest");
    expect(script).toContain("_postgres_prod");
  });

  it("usa siempre -f docker-compose.yml: un override no debe colarse", () => {
    expect(script).toContain("docker compose -f docker-compose.yml");
  });
});
