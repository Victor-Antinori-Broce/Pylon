# Crear una web con el starter

Kitsuden es _headless_: la web pública es un proyecto aparte que lee la API.
El repositorio trae un punto de partida neutro,
**`packages/starters/kitsuden-starter-basic`** (paquete
`@kitsuden/starter-basic`): una web Astro 7 renderizada en el servidor
(`@astrojs/node` _standalone_) que enseña

- las **páginas** del constructor de páginas, por slug;
- el **blog** (lista paginada y entrada);
- las **imágenes** de la biblioteca de medios, servidas desde el origen de la
  propia web;
- 404, 503 cuando la API no responde, SEO básico (canónicas, Open Graph,
  `sitemap.xml`, `robots.txt`), tema claro/oscuro e interfaz en inglés con un
  diccionario por idioma.

Solo necesita el núcleo de Kitsuden (páginas y medios) y `kon-blog`, activos
de serie. La referencia completa (estructura, bloques, rutas de la API que
usa, idiomas, tests) es su
[README](../../packages/starters/kitsuden-starter-basic/README.md); esta
página resume lo necesario para instalarla.

## Variables

Plantilla: `.env.example` del starter.

| Variable                      | Cuándo se lee             | Para qué                                                                                                                                                                                                   |
| ----------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KITSUDEN_API_URL`            | al arrancar               | Por dónde llega **este servidor** a la API. En Docker, la dirección interna (`http://kitsuden_api_prod:3000`). En Windows con la API local, `localhost`.                                                   |
| `SITE_URL`                    | al compilar               | Origen público de la web: canónicas, Open Graph y mapa del sitio. Cambiarlo exige recompilar.                                                                                                              |
| `SITE_NAME`                   | al compilar               | Nombre en la cabecera, el `<title>` y el pie.                                                                                                                                                              |
| `SITE_LOCALE`                 | al compilar               | Idioma de la interfaz; también se pasa al blog como `?locale=`.                                                                                                                                            |
| `KITSUDEN_SITE_KEY`           | al arrancar               | Opcional y secreta: el mismo valor que `SITIO_API_CLAVE` de la API. Con ella la API cuenta el límite de peticiones por visitante y no para toda la web a la vez.                                           |
| `KITSUDEN_TRUST_PROXY`        | al arrancar               | Opcional (`false`). Detrás de un proxy inverso (Caddy, nginx), `true` toma la IP del visitante de la **última** entrada de `X-Forwarded-For`, la que añade el proxy. Solo si el proxy es la única entrada. |
| `PORT`, `HOST`                | al arrancar               | Del servidor Node (`4321` y `0.0.0.0` en la imagen Docker).                                                                                                                                                |
| `INTI`, `INTI_KITSUDEN_TOKEN` | al compilar / al arrancar | Solo para Inti ([inti.md](inti.md)).                                                                                                                                                                       |

Añade el origen de la web a `ALLOWED_ORIGINS` de la API si el navegador va a
llamar a la API desde ella (sesión, editor de Inti).

## Desarrollo

```bash
cd packages/starters/kitsuden-starter-basic
cp .env.example .env              # KITSUDEN_API_URL=http://localhost:3000, SITE_URL=http://localhost:4321
pnpm dev                          # http://localhost:4321 (con la API en marcha)
```

(Desde la raíz del monorepo, `pnpm --filter @kitsuden/starter-basic dev`.) En
el panel, crea una página con el slug `home` (o márcala como portada), añade
bloques y publícala: sale en `/`. Cada página publicada se sirve en `/<slug>`
y aparece en la cabecera; las entradas publicadas del blog, en `/blog`.

## Compilar y servir (sin Docker)

```bash
cd packages/starters/kitsuden-starter-basic
SITE_URL=https://ejemplo.com pnpm build
KITSUDEN_API_URL=http://localhost:3000 PORT=4321 HOST=0.0.0.0 pnpm start   # node ./dist/server/entry.mjs
```

Al ser renderizada en el servidor, lo que se publica en el panel aparece sin
recompilar; la API cachea las lecturas públicas entre 1 y 5 minutos.

## Con Docker

La imagen `docker/Dockerfile.web` compila el starter (Node 22 y pnpm 9.15.4,
solo las dependencias del starter) y lo sirve sin root en :4321. Es el
servicio `kitsuden_web` del overlay TLS, detrás de Caddy
([servidor.md](servidor.md#9-primer-arranque-público)):

```bash
docker compose -f docker-compose.yml -f docker-compose.tls.yml build kitsuden_web
```

El overlay le pasa `SITE_URL=https://${SITE_DOMAIN}`, `SITE_NAME` y
`SITE_LOCALE` al compilar, y al arrancar `KITSUDEN_API_URL=http://kitsuden_api_prod:3000`,
`KITSUDEN_SITE_KEY=${SITIO_API_CLAVE}` y `KITSUDEN_TRUST_PROXY=true`. Suelta,
sin compose:

```bash
docker build -f docker/Dockerfile.web --target web \
  --build-arg SITE_URL=https://ejemplo.com -t kitsuden/web .
docker run -p 127.0.0.1:4321:4321 -e KITSUDEN_API_URL=http://<api>:3000 kitsuden/web
```

La imagen se compila **sin** Inti.

## Tu propia web

Lo normal es copiar el starter y cambiarlo: bloques nuevos en `src/blocks/`
(y registrarlos en `src/blocks/index.ts`), otro idioma en `src/i18n/`,
estilos y plantillas en `src/layouts` y `src/components`. Para copiarlo sin
`node_modules`, `dist` ni `.env`, el CLI del repositorio lo hace solo
(`kitsuden new mi-web --api-url http://localhost:3000`; ver
`packages/cli/README.md`: el CLI no está en npm, se ejecuta desde el
repositorio con `node packages/cli/dist/index.js`).

Fija las versiones de las dependencias con `~` (como hace el starter:
`astro ~7.3.8`, `@astrojs/node ~11.1.7`) para que una reinstalación no te
suba a una versión con cambios.

### Dentro del monorepo

El `pnpm-workspace.yaml` de la raíz solo incluye
`packages/starters/kitsuden-starter-*`. Si copias el starter **dentro** de
`packages/starters/` con otro nombre (`packages/starters/mi-web`), queda fuera
del espacio de trabajo a propósito, para que el `pnpm-lock.yaml` de la raíz
solo describa lo que está en el repositorio. Esa carpeta necesita:

- su propio `pnpm-workspace.yaml`, que la convierte en un espacio de trabajo
  aparte:

  ```yaml
  packages:
    - "."
  ```

- y su propio `pnpm-lock.yaml`: `pnpm --dir packages/starters/mi-web install`
  (no probado con una copia del starter neutro);
- con Inti y pnpm 10, `onlyBuiltDependencies` en ese `pnpm-workspace.yaml`
  ([inti.md](inti.md#1-qué-hace-falta)).

Fuera del monorepo (otra carpeta, otro repositorio) funciona igual: el starter
no importa nada del monorepo.

### Servirla en producción

Un overlay de compose propio que redefina `kitsuden_web` (otro `Dockerfile`,
otros argumentos) y, si la web necesita otras rutas o dominios, otro
`Caddyfile` montado en `kitsuden_proxy`. Se pasa después del TLS, o con
`KITSUDEN_OVERLAYS` en `scripts/deploy.sh`
([servidor.md](servidor.md#otra-web-en-lugar-del-starter)).
