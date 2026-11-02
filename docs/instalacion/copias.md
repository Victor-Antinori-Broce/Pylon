# Copias y restauración

## Qué hay que guardar

| Qué              | Dónde vive                                               | Cómo se copia                                                                                                                                                             |
| ---------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base de datos    | volumen `kitsuden_postgres_prod`                         | `pg_dump -Fc` automático (servicio `kitsuden_backup`)                                                                                                                     |
| Medios subidos   | volumen `<proyecto>_kitsuden_uploads_prod` (`/app/data`) | tar automático cada `BACKUP_MEDIA_DIAS`                                                                                                                                   |
| `.env`           | raíz del repositorio                                     | **a mano**, fuera del servidor y cifrado: sin `KITSUDEN_SECRETS_KEY` (o `BETTER_AUTH_SECRET` si no la definiste) los secretos guardados en la base no se pueden descifrar |
| Certificados TLS | `kitsuden_caddy_data`                                    | no hace falta: Caddy los vuelve a pedir                                                                                                                                   |

## Las copias automáticas

`kitsuden_backup` (misma imagen que la API) hace en bucle **(probado)**:

```
Volcando a kitsuden-2026-10-15T18-29-49.dump …
  ok  kitsuden-2026-10-15T18-29-49.dump  (268 KB, 680 objetos, 1276ms)
  verificado con pg_restore --list
medios: copiando /medios → medios-2026-10-15T17-54-22.tar
```

- Volcado con el **superusuario** (con el rol de la app `pg_dump` fallaría por
  RLS), verificado con `pg_restore --list` nada más escribirlo; se guardan
  `BACKUP_KEEP`.
- Tras el volcado, `docker/backup-medios.sh` copia el volumen de medios (solo
  lectura) cada `BACKUP_MEDIA_DIAS` y conserva `BACKUP_MEDIA_KEEP`.
- Healthcheck «unhealthy» si la última copia buena es demasiado vieja.
- En una instalación nueva, la **primera** copia sale antes de que la API
  termine de migrar (en la prueba: 1 KB, 2 objetos). Es normal; la siguiente
  ya lleva todo. Para forzar una:

```bash
docker exec -w /app/apps/api kitsuden_backup_prod bun run scripts/backup.ts
docker exec kitsuden_backup_prod ls -la /backups
```

**Todo queda en el volumen `kitsuden_backups_prod`, en el mismo disco.**
Protege de un borrado o de una migración rota, no de perder la máquina. Para
eso, sácalas fuera (snapshots del proveedor, o `rclone` a un almacenamiento de
objetos desde un cron del host) y **prueba a restaurar** alguna de vez en
cuando. Un ejemplo **(no probado)**:

```bash
# /etc/cron.d/kitsuden-fuera  (con rclone ya configurado como «fuera:»)
30 5 * * * root rclone sync /var/lib/docker/volumes/kitsuden_backups_prod/_data fuera:kitsuden-copias --max-age 15d
```

## Restaurar la base

Los volcados los hace el `pg_dump` de la imagen de la API, que es **más nuevo
que el servidor** (17 o posterior según cuándo se compiló la imagen; en la
prueba, `pg_dump (PostgreSQL) 18.6` contra Postgres 16). El `pg_restore` de la imagen de Postgres 16 **no los lee**
(`unsupported version … in file header`): restaura siempre con la imagen de la
API.

**(probado 2026-10-15)**, a una base nueva junto a la existente:

```bash
# 1. base vacía de destino
docker exec kitsuden_db_prod sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE kitsuden_restaurada"'

# 2. pg_restore desde la imagen de la API, en la red de la pila
docker run --rm --network kitsuden_net_prod -v kitsuden_backups_prod:/b:ro --env-file .env \
  --entrypoint sh kitsuden/api:latest -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore -h kitsuden_db_prod -U "$POSTGRES_USER" -d kitsuden_restaurada -j 4 /b/kitsuden-AAAA-MM-DDTHH-MM-SS.dump'
```

Resultado esperado: dos errores `unrecognized configuration parameter
"transaction_timeout"` (un `SET` de pg_dump ≥ 17 que Postgres 16 no conoce;
inocuo) y `pg_restore` termina con código 1 por ellos. Comprobación: mismas
cifras en las dos bases (en la prueba: 80 tablas, 61 filas en
`kitsuden_migrations`, 1 juego, 1 página, 1 usuario en ambas).

Para **sustituir** la base en uso:

```bash
docker compose -f docker-compose.yml stop kitsuden_api kitsuden_backup
# o bien --clean --if-exists en pg_restore, o DROP DATABASE + CREATE DATABASE antes
# … restaurar sobre POSTGRES_DB como arriba …
docker compose -f docker-compose.yml up -d
```

Al arrancar, la API aplica las migraciones que la copia no tuviera y vuelve a
dar permisos al rol de la app. Si el rol `kitsuden_app` no existe en un
servidor nuevo, créalo antes (`CREATE ROLE kitsuden_app NOLOGIN`): las tablas
restauradas llevan sus `GRANT`. Si el `POSTGRES_USER` del destino es otro,
añade `--no-owner --role=<usuario>`.

### Llevar los datos a otra máquina

Es lo mismo con un volcado copiado:

```bash
# origen: sacar el último volcado del volumen
docker run --rm -v kitsuden_backups_prod:/b:ro -v "$PWD":/out alpine \
  sh -c 'cp "$(ls -1 /b/kitsuden-*.dump | tail -1)" /out/'
scp kitsuden-*.dump usuario@servidor:/tmp/
```

En el destino, **antes** del primer arranque completo: compila la imagen de la
API, arranca solo `kitsuden_db`, crea el rol de la app
(`CREATE ROLE kitsuden_app NOLOGIN`) y restaura con el `pg_restore` de la
imagen de la API como arriba, montando `/tmp` en lugar del volumen de copias.
Al arrancar, la API aplica las migraciones que le falten a la copia.

## Restaurar los medios

```bash
docker run --rm -v <proyecto>_kitsuden_uploads_prod:/d -v kitsuden_backups_prod:/b:ro alpine \
  sh -c 'tar -xf /b/medios-AAAA-MM-DDTHH-MM-SS.tar -C /d && chown -R 1000:1000 /d && find /d -type f | wc -l'
```

**(no probado en esta guía; una restauración byte a byte se probó el
2026-10-12).** El `chown` es imprescindible: la API corre sin root (uid 1000)
y sin él las subidas desde el panel fallan.
