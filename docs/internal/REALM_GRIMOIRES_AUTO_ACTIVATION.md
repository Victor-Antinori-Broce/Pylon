# Realm Grimoires - Auto Activación y Control Individual

## Resumen de Cambios

Este documento describe los cambios realizados para implementar:
1. **Auto-instalación** de grimoires al instalar un realm
2. **Auto-activación** de grimoires al activar un realm
3. **Control individual** de grimoires de realm (pueden apagarse/encenderse individualmente)
4. **Indicador visual** "Activo por el realm" para grimoires activados vía realm

## Cambios Realizados

### 1. `apps/api/src/routes/system.ts`

#### Nueva función: `getRealmGrimoires(realmId)`
```typescript
async function getRealmGrimoires(realmId: string): Promise<{ required: string[]; optional: string[] }>
```
Obtiene todos los grimoires (requeridos y opcionales) de un realm desde su `realm.json`.

#### Modificación: `PATCH /active-theme`
- **Antes**: Solo activaba el tema/realm, los grimoires debían activarse manualmente
- **Después**: 
  - Auto-instala todos los grimoires del realm en la tabla `modules`
  - Auto-activa todos los grimoires del realm
  - Guarda `realmId` en cada módulo para identificar que pertenecen al realm
  - Ejecuta migraciones automáticamente para cada grimoire
  - Retorna lista de grimoires instalados y activados

**Campos guardados en DB para grimoires de realm:**
- `key`: ID del grimoire
- `name`: Nombre del grimoire
- `category`: "realm"
- `enabled`: true
- `realmId`: ID del realm al que pertenece
- `sidebarBadge`: "Active by Realm" (indicador visual)

**Respuesta del endpoint:**
```json
{
  "success": true,
  "activeTheme": "gremius-cms-realm",
  "installedModules": ["grimoire-games", "grimoire-esports"],
  "activatedModules": ["grimoire-games", "grimoire-esports", "grimoire-streamers"],
  "realmGrimoires": ["grimoire-games", "grimoire-esports", "grimoire-streamers"],
  "message": "Realm activated. Installed 2 new grimoires and activated 3 total."
}
```

### 2. `apps/api/src/routes/modules.ts`

#### Modificación: `GET /` (Listar módulos)

**Nuevos campos en la respuesta:**
- `enabledByRealm`: Boolean que indica si está activo porque su realm está activo
- `realmId`: ID del realm al que pertenece (si aplica)
- `sidebarBadge`: "Active by Realm" cuando aplica
- `canToggle`: Ahora siempre `true` (todos los grimoires pueden togglearse)

**Lógica de `enabled`:**
```typescript
const enabledByRealm = stored?.realmId === activeTheme && activeTheme !== null;
const enabled = configFlag !== undefined
  ? configFlag
  : enabledByRealm
    ? true
    : (stored ? stored.enabled : defaultEnabled(m.category));
```

#### Modificación: `GET /:key` (Obtener un módulo)

**Nuevos campos:**
- `enabledByRealm`: Boolean
- `isRealmGrimoire`: Boolean
- `sidebarBadge`: String ("Active by Realm" cuando aplica)
- `canToggle`: Siempre `true`

#### Modificación: `GET /:key/check` (Verificar si puede desactivarse)

**Cambios:**
- Removida la restricción que impedía desactivar grimoires de realm
- Agregado `isRealmGrimoire` en la respuesta
- Agregado `realmId` en la respuesta
- Agregado `warning` cuando es un grimoire de realm

**Respuesta:**
```json
{
  "canDisable": true,
  "blockers": [],
  "warnings": [],
  "isRealmGrimoire": true,
  "realmId": "gremius-cms-realm",
  "warning": "This grimoire is part of a realm. Disabling it may affect realm functionality."
}
```

#### Modificación: `PATCH /:key` (Toggle módulo)

**Cambios:**
- Removida la restricción que impedía togglear grimoires de realm
- Agregado cálculo de `enabledByRealm` en la respuesta
- Agregado `isRealmGrimoire` en la respuesta

## Flujo de Funcionamiento

### Instalación/Activación de un Realm

1. **Usuario activa un realm** via `PATCH /api/system/active-theme`
   ```json
   { "themeId": "gremius-cms-realm" }
   ```

2. **Sistema lee** `realm.json` del realm y obtiene lista de grimoires
   ```json
   {
     "grimoires": ["grimoire-games", "grimoire-esports", "grimoire-streamers"],
     "optional_grimoires": ["grimoire-crm", "grimoire-blog"]
   }
   ```

3. **Para cada grimoire del realm:**
   - Busca información en el filesystem (grimoire.json)
   - Inserta/actualiza registro en tabla `modules` con:
     - `enabled: true`
     - `realmId: "gremius-cms-realm"`
     - `sidebarBadge: "Active by Realm"`
   - Ejecuta migraciones del grimoire

4. **Activa el realm** guardando `activeTheme` en `site_settings`

5. **Retorna** lista de grimoires instalados y activados

### Visualización en Admin

1. **GET /api/modules** retorna todos los módulos con:
   - `enabledByRealm: true` para grimoires activos vía realm
   - `sidebarBadge: "Active by Realm"` para indicador visual
   - `canToggle: true` para todos (permitiendo control individual)

2. **El frontend puede mostrar:**
   - "Activo por el realm: {realmId}" cuando `enabledByRealm === true`
   - Toggle switch habilitado para todos los grimoires

### Control Individual

1. **Usuario puede desactivar** un grimoire de realm vía `PATCH /api/modules/:key`
   ```json
   { "enabled": false }
   ```

2. **Sistema:**
   - Actualiza `enabled: false` en la tabla `modules`
   - Mantiene `realmId` (para saber que aún pertenece al realm)
   - El grimoire se desactiva pero mantiene su asociación al realm

3. **Si el usuario reactiva el realm:**
   - El sistema vuelve a activar todos los grimoires del realm
   - Incluyendo los que fueron desactivados manualmente

## Estructura de Datos

### Tabla `modules`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `key` | varchar(100) | ID del grimoire (ej: "grimoire-games") |
| `name` | varchar(200) | Nombre del grimoire |
| `category` | varchar(100) | "realm" para grimoires de realm |
| `enabled` | boolean | Estado activo/inactivo |
| `realmId` | varchar(100) | ID del realm al que pertenece (null si es standalone) |
| `sidebarBadge` | varchar(50) | "Active by Realm" o null |
| `settings` | jsonb | Configuración del módulo |

### Ejemplo de Registro

```sql
-- Grimoire activo por el realm gremius-cms-realm
INSERT INTO modules (
  key, name, category, enabled, realmId, sidebarBadge, settings
) VALUES (
  'grimoire-games', 
  'Games', 
  'realm', 
  true, 
  'gremius-cms-realm',
  'Active by Realm',
  '{}'
);
```

## API Endpoints Actualizados

### `PATCH /api/system/active-theme`

**Request:**
```json
{
  "themeId": "gremius-cms-realm"
}
```

**Response:**
```json
{
  "success": true,
  "activeTheme": "gremius-cms-realm",
  "installedModules": ["grimoire-games", "grimoire-esports"],
  "activatedModules": ["grimoire-games", "grimoire-esports", "grimoire-streamers"],
  "realmGrimoires": ["grimoire-games", "grimoire-esports", "grimoire-streamers"],
  "message": "Realm activated. Installed 2 new grimoires and activated 3 total."
}
```

### `GET /api/modules`

**Response (simplificado):**
```json
{
  "activeTheme": "gremius-cms-realm",
  "categories": {
    "theme": {
      "label": "Realm Grimoires",
      "modules": [
        {
          "key": "grimoire-games",
          "name": "Games Catalog",
          "enabled": true,
          "realmId": "gremius-cms-realm",
          "enabledByRealm": true,
          "canToggle": true,
          "sidebarBadge": "Active by Realm"
        }
      ]
    }
  }
}
```

### `GET /api/modules/:key`

**Response:**
```json
{
  "key": "grimoire-games",
  "name": "Games Catalog",
  "enabled": true,
  "realmId": "gremius-cms-realm",
  "enabledByRealm": true,
  "isRealmGrimoire": true,
  "canToggle": true,
  "sidebarBadge": "Active by Realm"
}
```

### `PATCH /api/modules/:key`

**Request:**
```json
{
  "enabled": false
}
```

**Response:**
```json
{
  "key": "grimoire-games",
  "name": "Games Catalog",
  "enabled": false,
  "realmId": "gremius-cms-realm",
  "enabledByRealm": false,
  "isRealmGrimoire": true
}
```

## Notas de Implementación

1. **Backward Compatibility**: Los cambios son compatibles con el código existente. Los endpoints anteriores siguen funcionando.

2. **Migraciones**: Las migraciones de grimoires se ejecutan automáticamente cuando se activa un realm.

3. **Idempotencia**: Activar un realm múltiples veces no causa problemas. Los grimoires ya instalados simplemente se actualizan.

4. **Desactivación manual**: Cuando un usuario desactiva un grimoire de realm manualmente, el `realmId` se mantiene en la DB para saber que pertenece al realm.

5. **Reactivación del realm**: Si el realm se vuelve a activar, todos sus grimoires (incluyendo los desactivados manualmente) se reactivan.
