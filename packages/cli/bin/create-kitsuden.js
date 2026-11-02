#!/usr/bin/env node

/**
 * create-kitsuden — npx create-kitsuden my-app
 *
 * El equivalente a `django-admin startproject`: crea un backend Kitsuden listo
 * para correr sin instalar nada más.
 *
 * Por defecto arranca en MODO LITE (PostgreSQL embebido vía PGlite): sin
 * Docker, sin Valkey, sin MinIO — `npx create-kitsuden my-app` y ya corre.
 * Para el stack completo (Postgres + Valkey + MinIO en Docker):
 *
 *   npx create-kitsuden my-app --full
 *
 * Otras opciones:
 *   --template=blog|saas|ecommerce   plantilla de proyecto
 *   --no-start                       no arrancar tras crear
 */

import { initCommand } from "../dist/commands/init.js";

const args = process.argv.slice(2);
const projectName = args.find((a) => !a.startsWith("-"));

const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split("=").slice(1).join("=") : undefined;
};

// Lite es el default; --full pide el stack dockerizado completo.
const lite = !flag("full");

initCommand(projectName, {
  template: value("template") ?? "default",
  mode: lite ? "lite" : "vibecoder",
  database: lite ? "lite" : "postgres",
  lite,
  autoStart: !flag("no-start"),
});
