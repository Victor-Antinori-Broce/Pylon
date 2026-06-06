# API de Eliminación de Grimoires y Realms

## 🗑️ Eliminar Grimoires

### DELETE /api/modules/:key

Elimina un grimoire del sistema.

#### Parámetros de Query

- `force` (boolean, opcional): Si es `true`, fuerza la eliminación incluso si tiene dependencias

#### Ejemplos

**Eliminar un grimoire standalone:**

```bash
curl -X DELETE /api/modules/grimoire-crm
```

**Respuesta exitosa:**

```json
{
  "success": true,
  "deleted": true,
  "key": "grimoire-crm",
  "name": "Gremius CRM",
  "wasEnabled": false,
  "wasRealmGrimoire": false,
  "realmId": null,
  "message": "Grimoire grimoire-crm uninstalled successfully."
}
```

**Eliminar un grimoire de realm:**

```bash
curl -X DELETE /api/modules/grimoire-games
```

**Respuesta:**

```json
{
  "success": true,
  "deleted": true,
  "key": "grimoire-games",
  "name": "Games",
  "wasEnabled": true,
  "wasRealmGrimoire": true,
  "realmId": "gremius-cms-realm",
  "message": "Grimoire grimoire-games uninstalled. It was part of realm gremius-cms-realm.",
  "warning": "This grimoire had dependencies that may be affected."
}
```

**Error - Grimoire con dependencias:**

```bash
curl -X DELETE /api/modules/grimoire-games
```

```json
{
  "error": "Cannot delete grimoire",
  "message": "grimoire-games has active dependencies. Disable it first or use ?force=true to force deletion.",
  "blockers": [
    {
      "grimoire": "grimoire-esports",
      "grimoireName": "Esports",
      "table": "(dependency)",
      "column": "(dependsOn)",
      "label": "Esports depends on Games Catalog and has existing data",
      "rowCount": -1
    }
  ],
  "enabled": true,
  "realmId": "gremius-cms-realm"
}
```

**Forzar eliminación:**

```bash
curl -X DELETE "/api/modules/grimoire-games?force=true"
```

---

## 🏰 Eliminar Realms

### DELETE /api/system/realms/:id

Elimina un realm del sistema.

#### Parámetros de Query

- `deleteGrimoires` (boolean, opcional): Si es `true`, elimina también los grimoires asociados. Default: `false`
- `force` (boolean, opcional): Si es `true`, fuerza la eliminación incluso si está activo o tiene grimoires activos

#### Escenarios

### Escenario 1: Borrar Realm y Mantener Grimoires

```bash
curl -X DELETE /api/system/realms/gremius-cms-realm
# o explícitamente:
curl -X DELETE "/api/system/realms/gremius-cms-realm?deleteGrimoires=false"
```

**Respuesta:**

```json
{
  "success": true,
  "deletedRealm": "gremius-cms-realm",
  "realmName": "Gremius CMS Realm",
  "wasActive": false,
  "deletedGrimoires": [],
  "grimoiresKept": ["grimoire-games", "grimoire-esports", "grimoire-streamers"],
  "message": "Realm gremius-cms-realm deleted. 3 grimoires converted to standalone."
}
```

**Qué sucede:**

- El realm se "elimina" (ya no está disponible para activar)
- Los grimoires se convierten a "standalone" (grimoires independientes)
- Se mantiene `enabled` según su estado actual
- Se limpia `realmId` (queda como `null`)
- Se cambia `category` a `"optional"`
- Se limpia `sidebarBadge`

### Escenario 2: Borrar Realm y sus Grimoires

```bash
curl -X DELETE "/api/system/realms/gremius-cms-realm?deleteGrimoires=true"
```

**Respuesta:**

```json
{
  "success": true,
  "deletedRealm": "gremius-cms-realm",
  "realmName": "Gremius CMS Realm",
  "wasActive": true,
  "deletedGrimoires": ["grimoire-games", "grimoire-esports", "grimoire-streamers"],
  "grimoiresKept": [],
  "message": "Realm gremius-cms-realm deleted along with 3 grimoires.",
  "clearedActiveTheme": true
}
```

**Qué sucede:**

- El realm se elimina
- Todos sus grimoires se eliminan de la tabla `modules`
- Si estaba activo, se limpia `activeTheme` en `site_settings`

### Escenario 3: Error - Realm Activo

```bash
curl -X DELETE /api/system/realms/gremius-cms-realm
```

**Respuesta (error):**

```json
{
  "error": "Cannot delete realm",
  "message": "Realm gremius-cms-realm is currently active or has enabled grimoires. Deactivate it first or use ?force=true to force deletion.",
  "isActive": true,
  "enabledGrimoires": ["grimoire-games", "grimoire-esports", "grimoire-streamers"],
  "totalGrimoires": 3
}
```

### Escenario 4: Forzar Eliminación de Realm Activo

```bash
# Primero desactivar
curl -X DELETE /api/system/active-theme

# Luego eliminar
curl -X DELETE "/api/system/realms/gremius-cms-realm?deleteGrimoires=true&force=true"
```

---

## 📋 Listar Realms (Actualizado)

### GET /api/system/realms

Lista todos los realms con información detallada de sus grimoires.

**Respuesta:**

```json
[
  {
    "id": "gremius-cms-realm",
    "name": "Gremius CMS Realm",
    "description": "Complete esports and gaming ecosystem...",
    "version": "3.0.0",
    "isActive": true,
    "grimoires": {
      "required": ["grimoire-games", "grimoire-esports", "grimoire-streamers"],
      "optional": ["grimoire-crm", "grimoire-blog"],
      "details": [
        {
          "key": "grimoire-games",
          "name": "Games",
          "installed": true,
          "enabled": true,
          "isRealmLinked": true,
          "category": "realm"
        },
        {
          "key": "grimoire-crm",
          "name": "Gremius CRM",
          "installed": true,
          "enabled": false,
          "isRealmLinked": true,
          "category": "realm"
        }
      ],
      "installedCount": 5,
      "enabledCount": 3
    },
    "canDelete": false
  }
]
```

### GET /api/system/realms/:id

Obtiene información detallada de un realm específico.

**Respuesta:**

```json
{
  "id": "gremius-cms-realm",
  "name": "Gremius CMS Realm",
  "description": "Complete esports and gaming ecosystem...",
  "version": "3.0.0",
  "isActive": true,
  "grimoires": {
    "required": ["grimoire-games", "grimoire-esports", "grimoire-streamers"],
    "optional": ["grimoire-crm", "grimoire-blog"],
    "details": [
      {
        "key": "grimoire-games",
        "name": "Games",
        "installed": true,
        "enabled": true,
        "isRealmLinked": true,
        "realmId": "gremius-cms-realm",
        "category": "realm",
        "canDelete": false
      }
    ],
    "installedCount": 5,
    "enabledCount": 3
  },
  "canDelete": false,
  "canDeactivate": true
}
```

---

## 🔧 Flujos de Trabajo Completos

### Flujo 1: Instalar Realm, Probar, Desinstalar Todo

```bash
# 1. Instalar y activar realm
curl -X POST /api/system/realm-state \
  -d '{ "action": "activate", "realmId": "gremius-cms-realm" }'

# 2. Probar los grimoires...

# 3. Desactivar realm (apaga grimoires pero mantiene en DB)
curl -X DELETE /api/system/active-theme

# 4. Eliminar realm y todos sus grimoires
curl -X DELETE "/api/system/realms/gremius-cms-realm?deleteGrimoires=true&force=true"
```

### Flujo 2: Instalar Realm, Mantener Grimoires

```bash
# 1. Instalar y activar realm
curl -X POST /api/system/realm-state \
  -d '{ "action": "activate", "realmId": "gremius-cms-realm" }'

# 2. Desactivar realm
curl -X DELETE /api/system/active-theme

# 3. Eliminar realm pero mantener grimoires como standalone
curl -X DELETE "/api/system/realms/gremius-cms-realm?deleteGrimoires=false&force=true"

# 4. Los grimoires ahora son standalone, puedes usarlos individualmente
curl /api/modules/grimoire-games
# Response: { ..., "realmId": null, "category": "optional" }
```

### Flujo 3: Migrar Grimoires entre Realms

```bash
# 1. Realm A está activo con grimoires
# grimoire-crm está en realm-corporate

# 2. Eliminar realm A pero mantener grimoires
curl -X DELETE "/api/system/realms/realm-corporate?deleteGrimoires=false&force=true"

# 3. Activar realm B (que también usa grimoire-crm)
curl -X POST /api/system/realm-state \
  -d '{ "action": "activate", "realmId": "gremius-cms-realm" }'
# grimoire-crm se vincula automáticamente al nuevo realm
```

---

## ⚠️ Consideraciones Importantes

1. **Eliminación vs Desactivación**
   - **Desactivar**: Apaga el grimoire/realm pero mantiene los datos en DB
   - **Eliminar**: Borra de la DB (para grimoires) o desvincula (para realms)

2. **Dependencias**
   - Un grimoire no se puede eliminar si tiene dependencias activas
   - Usa `?force=true` para forzar (puede causar problemas)

3. **Realm Activo**
   - No se puede eliminar un realm que está activo
   - Desactívalo primero o usa `?force=true`

4. **Grimoires Standalone**
   - Cuando eliminas un realm con `deleteGrimoires=false`, los grimoires se convierten a "standalone"
   - Pueden usarse independientemente de cualquier realm
   - Mantienen sus datos y configuración

5. **Reversibilidad**
   - Si eliminas un realm sin borrar sus grimoires, puedes "recrear" el realm reactivándolo
   - Los grimoires se vincularán automáticamente de nuevo
