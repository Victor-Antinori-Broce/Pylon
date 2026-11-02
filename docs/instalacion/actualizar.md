# Actualizar de versión

## Antes

1. Lee las notas de la versión y la [matriz de compatibilidad](versiones.md#matriz-de-compatibilidad):
   si sube la versión de un **contrato** que usa tu Inti, actualiza también
   `@intijs/adapter-kitsuden`.
2. Haz una copia **y comprueba que se lee**:

   ```bash
   docker exec -w /app/apps/api kitsuden_backup_prod bun run scripts/backup.ts
   ```

3. Etiqueta la imagen que funciona, para poder volver:

   ```bash
   docker tag kitsuden/api:latest kitsuden/api:antes-$(date +%F)
   docker tag kitsuden/admin:latest kitsuden/admin:antes-$(date +%F)
   ```

## Actualizar (Docker)

```bash
cd /opt/kitsuden                 # código nuevo: git pull
C="docker compose -f docker-compose.yml"          # o con -f docker-compose.tls.yml en público
$C build kitsuden_api kitsuden_admin              # + kitsuden_web con el overlay TLS
$C up -d
$C logs -f kitsuden_api                           # hasta «[6/6] Setup complete»
curl -s http://127.0.0.1:3000/api/version         # la versión nueva y sus contratos
```

- La API **migra sola** al arrancar (paso `[4/6]`); si una migración falla,
  el contenedor no arranca y el log dice cuál. No hay que ejecutar nada a mano.
- `kitsuden_backup` usa la imagen de la API: `up -d` lo recrea con la nueva.
- Si `up -d` no recrea un contenedor (Docker lo había relanzado por su cuenta),
  compara `docker inspect kitsuden_api_prod --format '{{.Image}}'` con
  `docker image inspect kitsuden/api:latest --format '{{.Id}}'`.
- La **web** del overlay TLS graba `SITE_URL`, `SITE_NAME` y `SITE_LOCALE` al
  compilar: cambiar `SITE_DOMAIN` (o esos nombres) exige recompilar `kitsuden_web`.
- En público, `./scripts/deploy.sh` hace el `build` y el `up -d` de todo (con
  tus `KITSUDEN_OVERLAYS`) sin parar lo que sirve mientras compila.
- Si la versión nueva añade kons que quieras usar, actívalos después
  ([primer-arranque.md](primer-arranque.md#3-activar-kons)).
- Si el volumen de medios viene de una imagen que corría como root, haz antes
  el `chown -R 1000:1000` de [servidor.md](servidor.md#la-api-corre-sin-root-uid-1000).

**(no probado como actualización real en esta guía**: se probaron por
separado la compilación, el arranque con migraciones y el reinicio de la API;
ni con el overlay TLS.)

## Actualizar (local)

```bash
git pull
pnpm install --frozen-lockfile
pnpm --filter @kitsuden/shared build
cd apps/api && bun run scripts/migrate.ts
```

## Volver atrás

```bash
docker tag kitsuden/api:antes-AAAA-MM-DD kitsuden/api:latest
docker compose -f docker-compose.yml up -d --no-deps kitsuden_api kitsuden_backup
```

Las migraciones **no se deshacen** solas: si la versión nueva migró la base y
la vieja no entiende el esquema, restaura la copia de antes
([copias.md](copias.md#restaurar-la-base)). Por eso la copia va primero.
