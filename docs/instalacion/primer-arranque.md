# Primer arranque

Lo que hace sola la API la primera vez, cómo crear el primer administrador y
cómo activar los kons. Probado el **2026-10-15** sobre una instalación Docker
nueva (volúmenes vacíos) y sobre una local.

## 1. Lo que hace solo el primer arranque

En Docker, el contenedor de la API ejecuta `docker/start-with-check.sh` antes
de escuchar. En el log (`docker compose -f docker-compose.yml logs kitsuden_api`)
**(probado 2026-10-15)**:

| Paso            | Qué hace                                                                                                                                       | Si falla                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `[0/6]`         | Con `KITSUDEN_PUBLIC=true`, comprueba URLs públicas, correo y longitud del secreto                                                             | aborta (a propósito)                                                                          |
| `[1/6]`         | Espera a Postgres y prueba a **autenticarse** contra la base de mantenimiento `postgres`                                                       | distingue «el usuario no entra» (explica el caso del usuario cambiado) de «la base no existe» |
| `[2/6]` `[3/6]` | Crea la base y la extensión `vector` si faltan                                                                                                 | si `CREATE DATABASE` falla, para con el error en vez de seguir                                |
| `[4/6]`         | `scripts/migrate.ts` con el superusuario: cadena completa de migraciones (núcleo + kons activos) y políticas RLS; luego `verificar-esquema.ts` | **para el arranque**: un esquema a medias no arranca                                          |
|                 | Crea/actualiza el rol de la app (`APP_DB_USER`) con sus `GRANT` y `ALTER DEFAULT PRIVILEGES`                                                   | —                                                                                             |
| `[4.5/6]`       | `verify-rls.ts`: con un usuario inexistente, las tablas aisladas tienen que devolver 0 filas                                                   | **para el arranque**                                                                          |
| `[5/6]`         | Registra los kons encontrados en `packages/kons` (en la prueba: «Found 27 kons (6 active)»)                                                    | avisa y sigue                                                                                 |
| `[6/6]`         | Arranca la API                                                                                                                                 | —                                                                                             |

En una instalación nueva se activan por defecto (los de `apps/api/kitsuden.config.ts`
más el núcleo) **kon-media, kon-datasets, kon-blocks** (páginas, `/api/page-builder`),
**kon-blog, kon-analytics, kon-members, kon-newsletter, kon-crm y
kon-payments**. **kon-games no** está activo de serie.

## Migraciones

- En Docker no hay que hacer nada: cada arranque aplica las pendientes.
- Fuera de Docker: `cd apps/api && bun run scripts/migrate.ts` (o `pnpm db:migrate`).
- El historial está en la tabla `kitsuden_migrations` (nombre, checksum,
  duración). Una migración ya aplicada **no se edita**: el migrador se niega
  si cambia su checksum.
- **Base que ya existía sin ese historial** (montada a mano o con otra
  herramienta): lo primero es `bun run scripts/migrate.ts --baseline`, que
  marca lo presente como aplicado sin ejecutarlo. Sin eso, intentaría
  reaplicarlo todo.
- **Nunca** `--todos-los-kons` en un servidor (crea las tablas de todos los
  kons; es una comprobación de CI) ni `pnpm db:push`.

## 2. El primer administrador

Con **cero** usuarios, el panel (`http://127.0.0.1:3001`, o
`https://panel.tu-dominio`) abre la pantalla de alta del primer
administrador, que llama a `POST /api/system/setup`. Esa ruta solo funciona
con cero usuarios (después responde `403 System already initialized`) y deja
la cuenta como `admin` y con el correo ya verificado (una instalación nueva
aún no puede enviar correos).

```bash
curl -s http://127.0.0.1:3000/api/system/init-check     # {"initialized":false}
```

Sin el panel, por API:

```bash
curl -s -X POST http://127.0.0.1:3000/api/system/setup \
  -H 'content-type: application/json' -H 'origin: http://localhost:3001' \
  -d '{"name":"Tu nombre","email":"tu@correo","password":"<contraseña larga>"}'
# → {"success":true,"user":{…}}
```

Usa como `Origin` uno de los `ALLOWED_ORIGINS` de la API: better-auth lo
comprueba en sus rutas (`/api/auth/*`) y la API, en toda escritura hecha con
la cookie de sesión. Comprobación:

```bash
curl -s -c cookies.txt -X POST http://127.0.0.1:3000/api/auth/sign-in/email \
  -H 'content-type: application/json' -H 'origin: http://localhost:3001' \
  -d '{"email":"tu@correo","password":"…"}' -o /dev/null -w "%{http_code}\n"    # 200
```

En la versión del 2026-10-15 esa ruta respondía `401 Session required` y hacía
falta un rodeo con SQL; ya no: la ruta queda exenta de la puerta de
administración temprana (`RUTAS_SOLO_ADMIN_TEMPRANAS` en
`apps/api/src/middleware/auth-guard.ts`).

Haz esto **antes** de abrir la instalación al público: mientras no haya
administrador, el alta es de quien llegue primero.

## 3. Activar kons

Desde el panel: sección **Kons**, interruptor del kon. Por API,
con la sesión de un administrador **(probado 2026-10-15)**:

```bash
curl -s -b cookies.txt -H 'origin: http://localhost:3001' http://127.0.0.1:3000/api/modules       # lista y estado
curl -s -b cookies.txt -H 'origin: http://localhost:3001' -H 'content-type: application/json' \
  -X PATCH http://127.0.0.1:3000/api/modules/kon-games -d '{"enabled":true}'
# → {"key":"kon-games",…,"enabled":true,…,"requiresRestart":false,"mountedNow":true}
```

- Las **tablas** se crean en ese momento con `DATABASE_ADMIN_URL` (Docker la
  pone sola). Sin ella, el panel dice qué comando ejecutar
  (`bun run scripts/migrate.ts`) en vez de dejar el kon a medias.
- Las **rutas** quedan montadas sin reiniciar (`mountedNow: true`):
  `GET /api/games` pasó de 404 a 200 en la prueba.
- En la prueba del 2026-10-15, escribir con una **clave de agente** (Inti) en
  un kon recién activado en caliente dio `401 Unauthorized - Authentication
required` hasta reiniciar la API (`docker restart <contenedor de la API>`).
  No se ha vuelto a probar: si te pasa, reinicia.
- La tabla `modules` es la verdad sobre qué está activo;
  `apps/api/kitsuden.config.ts` solo **siembra** los que falten la primera vez.

El starter neutro solo necesita el núcleo (páginas y medios) y `kon-blog`,
activos de serie. Una web que llame a rutas de kons apagados carga igual, con
huecos.

## 4. Ajustes del sitio

En el panel, **Ajustes** (Settings): nombre del sitio y **Site URL** (la
URL pública de la web; manda sobre las variables de entorno para lo que la
API escribe con dirección absoluta).

## 5. Comprobación final

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/live                 # 200
curl -s http://127.0.0.1:3000/api/system/init-check                                 # {"initialized":true}
curl -s http://127.0.0.1:3000/api/version                                           # versión y contratos
docker compose -f docker-compose.yml ps                                              # todo healthy
```

`/api/version` solo anuncia los contratos cuyo kon está activo
([versiones.md](versiones.md)).
