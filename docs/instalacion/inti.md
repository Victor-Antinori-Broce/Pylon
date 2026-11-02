# Conectar Inti (edición visual)

[Inti](https://github.com/Victor-Antinori-Broce/inti) es una capa de edición
visual para webs Astro: un editor abre la web pública, ve marcas sobre los
bloques y los edita en su sitio. Vive en otro repositorio (paquetes
`@intijs/*`) y **no depende de Kitsuden**: también funciona con WordPress, con
su propio adaptador. Con Kitsuden habla con la API a través de
`@intijs/adapter-kitsuden`. Kitsuden sigue siendo _headless_ y funciona igual
sin Inti.

```
 editor (navegador, con su cookie de sesión de Kitsuden)
    │  1. pide la página
    ▼
 web Astro con INTI=true ── 2. reenvía la cookie a GET /api/auth/get-session ──► API
    │                         (¿rol admin|editor?)                              ▲
    │  3. edición → /_actions/inti.* (servidor de la web)                        │
    └──── 4. adaptador con la CLAVE DE AGENTE (scope contenido:editar) ──────────┘
```

Dos credenciales distintas, y conviene no confundirlas:

|                                                                     | Quién la tiene                                                   | Para qué                                                                               |
| ------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Sesión de editor** (cookie de better-auth)                        | el navegador de cada persona                                     | decidir **quién** puede editar: solo usuarios con rol `admin` o `editor` ven el editor |
| **Clave de agente** `kitsuden_agent_…` con scope `contenido:editar` | **solo** el servidor de la web (variable de entorno al arrancar) | **escribir** en la API. Nunca llega al navegador ni se graba al compilar               |

## 1. Qué hace falta

- Kitsuden con `kon-blocks` (páginas, activo de serie) y, para editar fichas
  de juego, `kon-games` ([primer-arranque.md](primer-arranque.md#3-activar-kons)).
- Una web Astro preparada para Inti. El starter neutro
  (`packages/starters/kitsuden-starter-basic`) lo está: sin Inti no lleva
  nada de Inti, y con `INTI=true` y los dos paquetes instalados añade el editor.
- `@intijs/core` y `@intijs/adapter-kitsuden`, que **no** están en npm: se
  instalan desde git, los dos del **mismo** commit:

  ```bash
  cd packages/starters/kitsuden-starter-basic     # o la carpeta de tu web
  pnpm add "github:Victor-Antinori-Broce/inti#<commit>&path:/packages/core" \
           "github:Victor-Antinori-Broce/inti#<commit>&path:/packages/adapter-kitsuden"
  ```

  Fíjate en la barra después de `path:`. Cada paquete se compila al
  instalarse (su script `prepare`). Con **pnpm 10**, que no ejecuta los
  scripts de las dependencias si no se le permite, añade al
  `pnpm-workspace.yaml` de la web:

  ```yaml
  onlyBuiltDependencies:
    - "@intijs/core"
    - "@intijs/adapter-kitsuden"
  ```

  pnpm 9 los ejecuta de serie. Dentro del monorepo de Kitsuden, `pnpm add`
  cambia el `package.json` del starter y el `pnpm-lock.yaml` de la raíz: hazlo
  en tu copia, no en un cambio para el repositorio.

- Versiones compatibles: [versiones.md](versiones.md#matriz-de-compatibilidad).

## 2. La clave de agente

Debe ser una clave de **agente** (`kitsuden_agent_…`), con **solo** el scope
`contenido:editar`. Ese scope abre exactamente las escrituras del constructor
de páginas (`/api/page-builder`) y las dos rutas de la capa editorial de los
juegos (`PATCH /api/games/:id/bloques/:bloqueId/editorial`,
`PUT /api/games/:id/bloques/orden`); todo lo demás responde 403 (probado
2026-10-15: `PATCH /api/settings` y `POST /api/games` → 403). Las claves
`kitsuden_sk_*` no sirven: no dejan identidad de agente y reciben 401.

Desde el panel: **Agentes → nuevo agente** con scope `contenido:editar`. O
por API con la sesión de un administrador:

```bash
curl -s -X POST http://127.0.0.1:3000/api/admin/agents -b cookies.txt \
  -H 'origin: http://localhost:3001' -H 'content-type: application/json' \
  -d '{"name":"Inti","type":"custom","scopes":["contenido:editar"]}'
# → 201 {"success":true,"data":{"agent":{…},"apiKey":"kitsuden_agent_…"}}
```

La clave se enseña **una sola vez**: guárdala en el entorno del servidor de
la web (`INTI_KITSUDEN_TOKEN`), no en un fichero del repositorio.

Hasta el 2026-10-15 las claves creadas así no autenticaban (se guardaban sin
`key_id`, y un `_` dentro del secreto confundía al analizador) y hacía falta
crearlas con un script dentro del contenedor. Ya no: el alta guarda el
`key_id` y el analizador lee la clave por posición.

Comprobación (sustituye el slug si ya existe):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:3000/api/page-builder/pages \
  -H "Authorization: Bearer $INTI_KITSUDEN_TOKEN" -H 'content-type: application/json' \
  -d '{"title":"Prueba","slug":"prueba-inti","status":"draft"}'        # 201
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH http://127.0.0.1:3000/api/settings \
  -H "Authorization: Bearer $INTI_KITSUDEN_TOKEN" -H 'content-type: application/json' -d '{}'   # 403
```

Si acabas de activar `kon-games` en caliente y la edición de juegos con la
clave da 401, reinicia la API (visto el 2026-10-15,
[primer-arranque.md](primer-arranque.md#3-activar-kons)).

## 3. La web con `INTI=true`

Con el starter neutro:

```bash
cd packages/starters/kitsuden-starter-basic
INTI=true pnpm build                         # NUNCA con la clave en el entorno
INTI_KITSUDEN_TOKEN=kitsuden_agent_… KITSUDEN_API_URL=http://localhost:3000 pnpm start
```

`astro.config.mjs` quita la clave del entorno al compilar, por si acaso.
`INTI_ADAPTER` e `INTI_KITSUDEN_ENDPOINT` se completan solos (`kitsuden` y
`KITSUDEN_API_URL`). `INTI=true` sin los paquetes instalados para la
compilación con un mensaje que apunta al README del starter.

Con `INTI=true` la web añade: el middleware que reconoce editores, las
acciones de escritura en `/_actions/inti.*` y el editor. Sin la variable,
nada de eso entra en el paquete (lo comprueba `tests/build.test.mjs` del
starter). La imagen Docker de la web (`docker/Dockerfile.web`) se compila sin
Inti; para incluirlo, añade los paquetes al starter y pasa
`--build-arg INTI=true` (no probado).

## 4. La sesión de editor y la cookie

El editor solo aparece si la petición a la **web** trae la cookie de sesión de
better-auth (`better-auth.session_token`, o `__Secure-better-auth.…` por
https) y la API, al reenviársela, contesta con un usuario `admin` o `editor`.
La cookie la pone la **API** al iniciar sesión, para **su** host. Por eso
importa dónde vive cada cosa:

- **En local** (web en `localhost:4321`, API en `localhost:3000`): las cookies
  no distinguen puertos, así que la sesión iniciada en el panel o en la API
  llega a la web. Usa `localhost` en las dos, **no** mezcles con `127.0.0.1`
  (son hosts distintos para el navegador).
- **En un servidor con dominio** (web en `ejemplo.com`, panel/API en
  `panel.ejemplo.com`): la cookie de better-auth es **solo del host** que la
  emite (`panel.ejemplo.com`); la web no la recibe y **nadie** ve el editor.
  Hace falta una cookie del dominio padre. better-auth lo permite con
  `advanced.crossSubDomainCookies: { enabled: true, domain: "ejemplo.com" }`
  en `apps/api/src/lib/auth.ts`, que **hoy no está configurado** (no hay
  variable para ello). Alternativa sin tocar la API: servir también
  `/api/auth/*` desde el dominio de la web (un `handle /api/auth/*` hacia la
  API en el bloque `{$SITE_DOMAIN}` de `docker/Caddyfile`) e iniciar sesión
  desde allí. **(no probado)**. En ambos casos `ALLOWED_ORIGINS` debe incluir
  el origen de la web.

## 5. Problemas típicos

| Síntoma                                                                            | Causa                                                                                                       |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| La escritura devuelve `writing needs token`                                        | falta `INTI_KITSUDEN_TOKEN` al **arrancar** la web                                                          |
| `token has to be an agent key`                                                     | es una `kitsuden_sk_*`                                                                                      |
| `401 Invalid or expired API key`                                                   | clave revocada, mal copiada, o de una API anterior al 2026-10-15                                            |
| `401 Unauthorized - Authentication required` en juegos                             | kon activado en caliente: reinicia la API                                                                   |
| `403` en todo menos páginas y capa editorial                                       | correcto: es el scope `contenido:editar`                                                                    |
| `Kitsuden X habla «page-builder» v2 y @intijs/adapter-kitsuden … solo entiende v1` | versiones incompatibles: [versiones.md](versiones.md)                                                       |
| `Kitsuden X no declara el contrato «games-editorial» …`                            | lo normal es que el kon que lo sirve esté apagado (`kon-games`; `kon-blocks` para `page-builder`): actívalo |
| `[KitsudenAdapter] /api/version no existe …` (aviso)                               | Kitsuden sin la ruta de versión: funciona, sin comprobación                                                 |
| Nadie ve el editor en producción                                                   | la cookie no llega a la web (§4)                                                                            |

Documentación del adaptador (opciones, regla de índice, fichas de juego):
`apps/docs/src/content/docs/adapters/kitsuden.mdx` en el repositorio de Inti.
