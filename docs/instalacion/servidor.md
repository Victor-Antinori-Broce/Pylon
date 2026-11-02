# Instalación en un servidor (Docker)

La forma recomendada: API, panel, base de datos, Valkey y copias en
contenedores, con un solo `docker compose`. Dos variantes, que comparten casi
todo:

- **Sin dominio / red interna** (secciones 1 a 6): todo escucha en
  `127.0.0.1`; se entra por túnel SSH o desde la propia máquina. Es también la
  forma de probar una instalación antes de abrirla.
- **Público con dominio y TLS** (secciones 7 a 12): lo mismo más el overlay
  `docker-compose.tls.yml` (Caddy en 80/443 y la web pública en un
  contenedor), en un VPS.

Todo lo marcado **(probado 2026-10-15)** se ejecutó en una copia limpia de la
carpeta, con una pila con otros nombres (ver
[al final](#una-segunda-instalación-en-la-misma-máquina)) para no tocar la
instalación que ya había en la máquina. Lo del modo público **no** se ha
probado con un dominio real.

```
                Internet ──► :80/:443  Caddy (kitsuden_proxy_prod)  TLS Let's Encrypt
                               │
    ┌──────────────────────────┼──────────────────────────────────────┐
    │ SITE_DOMAIN              │ KITSUDEN_DOMAIN (panel.<dominio>)     │
    │  todo ──► web :4321      │  /media/* ──► API :3000              │
    │  (la web hace de proxy   │  resto    ──► panel (nginx :80)      │
    │   de /img y /media)      │              └─ /api/* ──► API :3000 │
    └──────────────────────────┴──────────────────────────────────────┘
       API (bun) ──► Postgres 16 + pgvector, Valkey     (sin puertos fuera)
       backup    ──► pg_dump diario + tar de medios semanal
```

| Servicio          | Imagen                                     | Puerto en el host                 |
| ----------------- | ------------------------------------------ | --------------------------------- |
| `kitsuden_api`    | `docker/Dockerfile.prod --target api`      | 127.0.0.1:3000                    |
| `kitsuden_admin`  | `docker/Dockerfile.prod --target admin`    | 127.0.0.1:3001                    |
| `kitsuden_db`     | `pgvector/pgvector:pg16`                   | 127.0.0.1:5432                    |
| `kitsuden_state`  | `valkey/valkey:7-alpine`                   | 127.0.0.1:6379                    |
| `kitsuden_backup` | la de la API                               | ninguno                           |
| `kitsuden_proxy`  | `caddy:2.10-alpine` (solo overlay TLS)     | 80, 443 (lo único público)        |
| `kitsuden_web`    | `docker/Dockerfile.web` (solo overlay TLS) | ninguno (solo Caddy llega a ella) |

## 1. Llevar el código

```bash
git clone https://github.com/Victor-Antinori-Broce/kitsuden.git /opt/kitsuden
cd /opt/kitsuden
```

El clon trae todo lo necesario para compilar las imágenes (lo que es público
lo decide el `.gitignore` de la raíz). La carpeta puede llamarse como quieras:
el nombre del proyecto de compose lo fija `COMPOSE_PROJECT_NAME` en el `.env`.

## 2. Configurar `.env`

```bash
cp .env.production.example .env
chmod 600 .env
openssl rand -hex 32                   # uno por cada secreto
nano .env
```

La plantilla lleva huecos `<...>`; `scripts/deploy.sh` se niega a seguir
mientras quede alguno. Para una instalación **sin dominio** basta con (cada
variable explicada en [variables.md](variables.md)):

```dotenv
COMPOSE_PROJECT_NAME=kitsuden
POSTGRES_USER=kitsuden
POSTGRES_PASSWORD=<openssl rand -hex 24>
POSTGRES_DB=kitsuden_prod
APP_DB_USER=kitsuden_app
APP_DB_PASSWORD=<openssl rand -hex 24>
BETTER_AUTH_SECRET=<openssl rand -hex 32>
KITSUDEN_SECRETS_KEY=<openssl rand -hex 32>
SITIO_API_CLAVE=<openssl rand -hex 32>
```

Las de dominio y correo (`SITE_DOMAIN`, `ACME_EMAIL`, `MAIL_FROM`,
`RESEND_API_KEY`/`SMTP_*`) solo las exige el overlay TLS; sin él, borra esas
líneas o déjalas vacías.

Comprobar sin imprimir secretos **(probado 2026-10-15)**:

```bash
docker compose -f docker-compose.yml config -q && echo OK
```

`docker compose config` a secas imprime las cadenas de conexión con la
contraseña: no lo uses en una terminal compartida ni lo pegues en un ticket.

## 3. Compilar las imágenes

```bash
docker compose -f docker-compose.yml build kitsuden_api kitsuden_admin
```

**(probado 2026-10-15)**: 21 min en la prueba (la API compila todos los kons;
el panel, SvelteKit). Termina con `kitsuden/api:latest Built` y
`kitsuden/admin:latest Built`.

- Usa siempre `-f docker-compose.yml`: sin `-f`, compose mezcla
  `docker-compose.override.yml` si existe (fichero local de desarrollo:
  enciende SeaweedFS).
- Nunca `docker build -f docker/Dockerfile.prod` sin `--target`: tiene dos
  etapas finales y sin `--target api` sale el nginx del panel con el nombre de
  la API. `docker compose build` ya pone el `target` correcto.
- No hay imágenes publicadas de este proyecto. Sin `build`, `up -d` intentaría
  **descargar** `kitsuden/api:latest` de Docker Hub, un nombre que no es
  necesariamente de este proyecto. El overlay TLS lo impide con
  `pull_policy: build`; sin él, compila siempre antes.

## 4. Arrancar

```bash
docker compose -f docker-compose.yml up -d
docker compose -f docker-compose.yml ps
```

**(probado 2026-10-15)**: 2 min 20 s hasta `kitsuden_api … Healthy` y el panel
arrancado. Lo que hace la API en su primer arranque (`docker/start-with-check.sh`)
está en [primer-arranque.md](primer-arranque.md#1-lo-que-hace-solo-el-primer-arranque).

Comprobaciones **(probado 2026-10-15)**:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/live                    # 200
curl -s http://127.0.0.1:3000/api/system/init-check                                    # {"initialized":false}
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/page-builder/block-types   # 200
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3001/                        # 200 (panel)
```

`/health` hace comprobaciones profundas (base, caché, cola) y es más lento;
para saber si el proceso vive, `/live` (en la raíz, sin `/api`).

Desde otro ordenador, por túnel SSH:

```bash
ssh -L 3001:127.0.0.1:3001 -L 3000:127.0.0.1:3000 usuario@servidor
# y en el navegador: http://localhost:3001
```

### La API corre sin root (uid 1000)

La imagen de la API (`docker/Dockerfile.prod`) corre como el usuario `bun`
(uid/gid 1000). En una instalación nueva no hay que hacer nada: el volumen de
medios nace vacío y hereda el dueño de `/app/data` de la imagen.

**Si actualizas una instalación que ya existía** (imagen anterior que corría
como root, medios copiados con `docker cp` o restaurados), el volumen es de
root y las subidas desde el panel fallan con `EACCES`. Una vez, con la API
parada:

```bash
docker compose -f docker-compose.yml stop kitsuden_api
docker volume ls | grep uploads          # p. ej. kitsuden_kitsuden_uploads_prod
docker run --rm -v <volumen>:/d alpine chown -R 1000:1000 /d
docker run --rm -v <volumen>:/d alpine sh -c 'find /d ! -uid 1000 | wc -l'   # 0
docker compose -f docker-compose.yml up -d kitsuden_api
```

El nombre del volumen lleva delante el `COMPOSE_PROJECT_NAME`. El contenedor
de copias (`kitsuden_backup`) usa la misma imagen pero corre como root
(`user: "0:0"` en `docker-compose.yml`): escribe en un volumen de copias que es
de root y lee los medios montados solo lectura.

## 5. Primer arranque

Crear el administrador, activar kons y comprobar: [primer-arranque.md](primer-arranque.md).

## 6. La web pública

En un servidor público, la web va en el contenedor `kitsuden_web` del overlay
TLS: el starter neutro (`packages/starters/kitsuden-starter-basic`) compilado
por `docker/Dockerfile.web` y servido por Node en :4321, detrás de Caddy. Para
compilarla o servir otra web, ver [webs-con-el-starter.md](webs-con-el-starter.md).

---

## 7. Preparar un VPS

Para abrirlo al público con dominio y TLS **(no probado con un dominio real)**.
Un Ubuntu 24.04 limpio, con un usuario sin root con `sudo` y clave SSH:

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install ca-certificates curl git ufw unattended-upgrades

# Docker desde su repositorio oficial (no el paquete docker.io de Ubuntu)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"   # y volver a entrar

# Cortafuegos: SSH, HTTP, HTTPS.
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 443/udp
sudo ufw enable

# Con 4 GB de RAM o menos: swap, o las compilaciones pueden quedarse sin memoria
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

**Docker se salta `ufw`** para los puertos publicados: lo que protege
Postgres, Valkey y la API es que escuchan en `127.0.0.1` (`BIND_ADDRESS`), no
el cortafuegos. No pongas `BIND_ADDRESS=0.0.0.0` en un servidor.

Recursos orientativos: con la pila en reposo y una base pequeña, unos 1–1,5 GB
de RAM; lo que más pide es **compilar** en el propio servidor (la API compila
todos los kons). 2 vCPU y 8 GB van holgados; con 4 GB, añade la swap de arriba.

### DNS

En el proveedor del dominio, registros **A** a la IP del servidor para los
tres nombres que sirve Caddy (`docker/Caddyfile`):

| Nombre                                              | Qué es                                            |
| --------------------------------------------------- | ------------------------------------------------- |
| `SITE_DOMAIN` (`ejemplo.com`)                       | la web pública                                    |
| `www.SITE_DOMAIN`                                   | redirige a la de arriba                           |
| `KITSUDEN_DOMAIN` (por defecto `panel.ejemplo.com`) | el panel y la API que usa el navegador (`/api/*`) |

Caddy no podrá sacar certificados hasta que resuelvan y los puertos 80 y 443
lleguen al servidor.

**IPv6 (AAAA):** sin IPv6 activado en Docker, las conexiones IPv6 entran por
el `docker-proxy` y Caddy ve como origen la pasarela de Docker (172.x) para
**todos** los visitantes IPv6: el límite de peticiones los contaría como uno
solo. Lo sencillo: **no publiques AAAA** al principio. Para IPv6 de verdad hay
que activarlo en Docker (`/etc/docker/daemon.json`: `"ipv6": true, "ip6tables": true`)
y `enable_ipv6: true` en la red `kitsuden_net_prod` (no probado).

## 8. Configurar el modo público

Además de lo de la [sección 2](#2-configurar-env), en el `.env`:

```dotenv
SITE_DOMAIN=ejemplo.com
KITSUDEN_DOMAIN=                       # vacío = panel.ejemplo.com
ACME_EMAIL=ops@ejemplo.com             # avisos de Let's Encrypt
RESEND_API_KEY=<clave>                 # o SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_SECURE
MAIL_FROM=Mi sitio <noreply@ejemplo.com>
```

- **Correo obligatorio.** El overlay pone `KITSUDEN_PUBLIC=true`, y en ese
  modo la API **no arranca** sin un transporte de correo o con `MAIL_FROM` en
  `@localhost` (paso `[0/6]`): la recuperación de contraseña se imprimiría en
  la consola. Es a propósito.
- **TLS**: lo pone Caddy solo (Let's Encrypt), con los certificados en el
  volumen `kitsuden_caddy_data`. Sin ese volumen se pedirían en cada
  recreación, y Let's Encrypt limita cuántos emite por semana.
- Secretos **nuevos** para el servidor: no reutilices los de tu máquina de
  desarrollo.

Comprobar sin imprimir secretos:

```bash
docker compose -f docker-compose.yml -f docker-compose.tls.yml config -q && echo OK
./scripts/deploy.sh --comprobar        # lo mismo, más los huecos <...> y los permisos de .env
```

## 9. Primer arranque público

```bash
./scripts/deploy.sh
```

El script compila (API, panel y web), arranca con
`docker compose -f docker-compose.yml -f docker-compose.tls.yml up -d --remove-orphans`
y espera hasta 5 min a que todo esté sano; nunca imprime el `.env` ni
`docker compose config`. A mano es lo mismo:

```bash
C="docker compose -f docker-compose.yml -f docker-compose.tls.yml"
$C build
$C up -d
$C ps                      # todo «healthy» en 2-3 min; el backup tarda más en estarlo
$C logs -f kitsuden_api    # [0/6] debe pasar la comprobación de configuración pública
```

Luego, el primer administrador en `https://panel.ejemplo.com`
([primer-arranque.md](primer-arranque.md#2-el-primer-administrador)) y, en el
panel, **Ajustes → Site URL** = `https://ejemplo.com`.

### Otra web en lugar del starter

`kitsuden_web` es el starter neutro. Para servir otra web, un overlay más que
redefina `kitsuden_web` (y, si hace falta, monte otro `Caddyfile` en
`kitsuden_proxy`), pasado **después** del TLS:

```bash
docker compose -f docker-compose.yml -f docker-compose.tls.yml -f docker-compose.miweb.yml up -d --build
```

`scripts/deploy.sh` lo añade solo si se lo dices con `KITSUDEN_OVERLAYS`
(ficheros separados por comas), en el entorno o como una línea del `.env`:

```bash
KITSUDEN_OVERLAYS=docker-compose.miweb.yml ./scripts/deploy.sh
```

Del `.env` el script lee **solo** esa línea; el resto no se carga en su shell.

## 10. Comprobar desde fuera

```bash
curl -sI https://ejemplo.com/ | head -1                    # 200
curl -sI https://www.ejemplo.com/ | grep -i location       # → https://ejemplo.com/
curl -s  https://panel.ejemplo.com/api/version
curl -sI https://panel.ejemplo.com/ | head -1              # 200 (panel)
nc -zv <IP> 5432 3000 3001 6379                            # deben FALLAR: solo 80/443 abiertos
```

## 11. Registros, hora y memoria

- El overlay TLS rota los registros (`json-file`, 5 × 10 MB por contenedor).
  `docker compose -f docker-compose.yml -f docker-compose.tls.yml logs --since 1h kitsuden_api`.
- API, base y copias trabajan en UTC; la web usa `TZ` (por defecto `UTC`).
- Límites de memoria del overlay: base 2 GB, API 1,5 GB, web 512 MB, Valkey
  384 MB, copias 512 MB, Caddy 256 MB, panel 128 MB. Un contenedor que muere
  con código 137 ha llegado a su límite.

## 12. Antes de abrir

- [ ] `POSTGRES_PASSWORD`, `APP_DB_PASSWORD` y el resto de secretos nuevos y largos.
- [ ] Correo real configurado y probado (recuperar contraseña).
- [ ] Primer administrador creado; **Site URL** del panel = dominio real.
- [ ] Copia fuera de la máquina decidida y probada ([copias.md](copias.md)).
- [ ] `nc -zv` de la sección 10: solo 80/443 abiertos.

Actualizar: [actualizar.md](actualizar.md). Copias y restauración: [copias.md](copias.md).

## Una segunda instalación en la misma máquina

`docker-compose.yml` fija `container_name` (`kitsuden_api_prod`…), los nombres
de volúmenes (`kitsuden_postgres_prod`…) y la red (`kitsuden_net_prod`). Una
segunda pila con esos nombres **chocaría con la primera o, peor, usaría sus
volúmenes**. Además las imágenes se etiquetan `kitsuden/api:latest`: compilar
otra copia **pisa la etiqueta** de la instalación existente.

Para probar (lo que se hizo para esta guía), un overlay que lo cambia todo
**(probado 2026-10-15)**:

```yaml
# compose.prueba.yml — nombres, volúmenes, red, imágenes y puertos propios.
# Los nombres *_prod que el compose usa como HOST se dan como alias DENTRO de
# esta red aislada (la API conecta a kitsuden_db_prod, el panel a kitsuden_api_prod).
services:
  kitsuden_db:
    container_name: kprueba_db
    networks: { kitsuden_net_prod: { aliases: [kitsuden_db_prod] } }
  kitsuden_state:
    container_name: kprueba_state
    networks: { kitsuden_net_prod: { aliases: [kitsuden_state_prod] } }
  kitsuden_api:
    container_name: kprueba_api
    networks: { kitsuden_net_prod: { aliases: [kitsuden_api_prod] } }
  kitsuden_admin:
    container_name: kprueba_admin
  kitsuden_backup:
    container_name: kprueba_backup
volumes:
  kitsuden_uploads_prod: { name: kprueba_uploads }
  kitsuden_postgres_prod: { name: kprueba_postgres }
  kitsuden_seaweedfs_prod: { name: kprueba_seaweedfs }
  kitsuden_valkey_prod: { name: kprueba_valkey }
  kitsuden_backups_prod: { name: kprueba_backups }
networks:
  kitsuden_net_prod: { name: kprueba_net }
```

y en su `.env`, además de los secretos:

```dotenv
COMPOSE_PROJECT_NAME=kprueba
KITSUDEN_API_IMAGE=kprueba/api:prueba
KITSUDEN_ADMIN_IMAGE=kprueba/admin:prueba
KITSUDEN_WEB_IMAGE=kprueba/web:prueba
API_PORT=3390
ADMIN_PORT=3391
DB_PORT=5490
VALKEY_PORT=6390
```

```bash
docker compose -f docker-compose.yml -f compose.prueba.yml config | grep -E "container_name|name: k|image:"   # revisar ANTES de up
docker compose -f docker-compose.yml -f compose.prueba.yml up -d
# … y para borrarla entera, con sus volúmenes:
docker compose -f docker-compose.yml -f compose.prueba.yml down -v
docker image rm kprueba/api:prueba kprueba/admin:prueba
```

(Ese `config | grep` solo enseña nombres e imágenes, no secretos.) Con el
overlay TLS **no** sirve tal cual: Caddy publica 80/443, que solo puede tener
una pila por máquina.
