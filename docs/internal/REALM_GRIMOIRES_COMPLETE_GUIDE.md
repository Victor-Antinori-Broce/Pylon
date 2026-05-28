# Realm Grimoires - Guía Completa de Funcionamiento

## 🎯 Comportamiento Deseado

1. **Activar un Realm** → Auto-instala y activa todos sus grimoires
2. **Desactivar un Realm** → Auto-desactiva todos sus grimoires (opcionalmente puede mantenerlos activos)
3. **Control Individual** → Cada grimoire puede encenderse/apagarse individualmente
4. **Indicador Visual** → Grimoires activos por el realm muestran "Active by Realm"

## 📡 API Endpoints

### Activar un Realm

```http
PATCH /api/system/active-theme
Content-Type: application/json

{
  "themeId": "gremius-cms-realm"
}
```

**O usando el nuevo endpoint:**

```http
POST /api/system/realm-state
Content-Type: application/json

{
  "action": "activate",
  "realmId": "gremius-cms-realm",
  "options": {
    "disablePreviousRealm": true  // Desactiva el realm anterior y sus grimoires
  }
}
```

**Respuesta:**
```json
{
  "success": true,
  "action": "activate",
  "activeRealm": "gremius-cms-realm",
  "installedModules": ["grimoire-games", "grimoire-esports"],
  "activatedModules": ["grimoire-games", "grimoire-esports", "grimoire-streamers"],
  "realmGrimoires": ["grimoire-games", "grimoire-esports", "grimoire-streamers"],
  "previousRealm": null,
  "message": "Realm gremius-cms-realm activated. Installed 2 new grimoires and activated 3 total."
}
```

### Desactivar un Realm

```http
DELETE /api/system/active-theme
```

**O usando el nuevo endpoint:**

```http
POST /api/system/realm-state
Content-Type: application/json

{
  "action": "deactivate",
  "realmId": "gremius-cms-realm",  // opcional, si no se envía desactiva el actual
  "options": {
    "keepGrimoiresEnabled": false  // Si es true, mantiene los grimoires activos
  }
}
```

**Respuesta:**
```json
{
  "success": true,
  "action": "deactivate",
  "deactivatedRealm": "gremius-cms-realm",
  "deactivatedModules": ["grimoire-games", "grimoire-esports", "grimoire-streamers"],
  "keptEnabled": false,
  "message": "Realm gremius-cms-realm deactivated. Disabled 3 grimoires."
}
```

### Control Individual de Grimoires

```http
PATCH /api/modules/grimoire-games
Content-Type: application/json

{
  "enabled": false
}
```

**Respuesta:**
```json
{
  "key": "grimoire-games",
  "name": "Games",
  "enabled": false,
  "realmId": "gremius-cms-realm",
  "enabledByRealm": false,
  "isRealmGrimoire": true
}
```

```http
PATCH /api/modules/grimoire-games
Content-Type: application/json

{
  "enabled": true
}
```

**Respuesta:**
```json
{
  "key": "grimoire-games",
  "name": "Games",
  "enabled": true,
  "realmId": "gremius-cms-realm",
  "enabledByRealm": true,
  "isRealmGrimoire": true
}
```

## 🔄 Flujos de Trabajo

### Escenario 1: Activar Realm (Todo Automático)

```
Usuario: Activa "gremius-cms-realm"
    ↓
Sistema:
  1. Lee realm.json → [grimoire-games, grimoire-esports, grimoire-streamers]
  2. Para cada grimoire:
     - Inserta en DB: enabled=true, realmId="gremius-cms-realm"
     - Ejecuta migraciones
  3. Guarda activeTheme="gremius-cms-realm"
    ↓
Resultado: Todos los grimoires activos con badge "Active by Realm"
```

### Escenario 2: Desactivar Realm (Todo Automático)

```
Usuario: Desactiva realm actual
    ↓
Sistema:
  1. Busca todos los módulos con realmId="gremius-cms-realm"
  2. Para cada uno: enabled=false
  3. Limpia activeTheme
    ↓
Resultado: Todos los grimoires del realm desactivados
```

### Escenario 3: Desactivar Realm pero Mantener Grimoires

```
Usuario: Desactiva realm con opción keepGrimoiresEnabled=true
    ↓
Sistema:
  1. Limpia activeTheme
  2. NO desactiva los grimoires
    ↓
Resultado: Realm desactivado pero grimoires siguen funcionando
```

### Escenario 4: Control Individual (Apagar un Grimoire Específico)

```
Usuario: Desactiva grimoire-games manualmente
    ↓
Sistema:
  1. Actualiza enabled=false para grimoire-games
  2. Mantiene realmId="gremius-cms-realm" (sigue vinculado al realm)
    ↓
Resultado: grimoire-games desactivado, otros del realm siguen activos
```

### Escenario 5: Reactivar un Grimoire Individual

```
Usuario: Reactiva grimoire-games manualmente
    ↓
Sistema:
  1. Actualiza enabled=true para grimoire-games
    ↓
Resultado: grimoire-games activo de nuevo
```

### Escenario 6: Cambiar de Realm

```
Usuario: Activa "realm-corporate" (estaba "gremius-cms-realm")
    ↓
Sistema:
  1. Desactiva grimoires de "gremius-cms-realm"
  2. Activa grimoires de "realm-corporate"
  3. Actualiza activeTheme
    ↓
Resultado: Solo los grimoires del nuevo realm están activos
```

## 🗃️ Estructura de Datos

### Tabla `site_settings`

| Campo | Valor | Descripción |
|-------|-------|-------------|
| `activeTheme` | `"gremius-cms-realm"` | Realm actualmente activo |
| `activeTheme` | `null` | Ningún realm activo |

### Tabla `modules`

#### Grimoire Activo por Realm
```sql
SELECT * FROM modules WHERE key = 'grimoire-games';
```

| key | name | category | enabled | realmId | sidebarBadge |
|-----|------|----------|---------|---------|--------------|
| grimoire-games | Games | realm | true | gremius-cms-realm | Active by Realm |

#### Grimoire Desactivado Manualmente
```sql
SELECT * FROM modules WHERE key = 'grimoire-games';
```

| key | name | category | enabled | realmId | sidebarBadge |
|-----|------|----------|---------|---------|--------------|
| grimoire-games | Games | realm | false | gremius-cms-realm | Active by Realm |

#### Grimoire Standalone (no de realm)
```sql
SELECT * FROM modules WHERE key = 'grimoire-crm';
```

| key | name | category | enabled | realmId | sidebarBadge |
|-----|------|----------|---------|---------|--------------|
| grimoire-crm | CRM | optional | true | null | null |

## 🎨 Respuestas de API Detalladas

### GET /api/modules

```json
{
  "activeTheme": "gremius-cms-realm",
  "categories": {
    "theme": {
      "label": "Realm Grimoires",
      "description": "Active realm: gremius-cms-realm",
      "modules": [
        {
          "key": "grimoire-games",
          "name": "Games Catalog",
          "enabled": true,
          "realmId": "gremius-cms-realm",
          "enabledByRealm": true,
          "canToggle": true,
          "sidebarBadge": "Active by Realm",
          "isRealmActive": true
        },
        {
          "key": "grimoire-esports",
          "name": "Esports",
          "enabled": true,
          "realmId": "gremius-cms-realm",
          "enabledByRealm": true,
          "canToggle": true,
          "sidebarBadge": "Active by Realm",
          "isRealmActive": true
        }
      ]
    }
  }
}
```

### GET /api/modules/grimoire-games (Activo por Realm)

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

### GET /api/modules/grimoire-games (Desactivado Manualmente)

```json
{
  "key": "grimoire-games",
  "name": "Games Catalog",
  "enabled": false,
  "realmId": "gremius-cms-realm",
  "enabledByRealm": false,
  "isRealmGrimoire": true,
  "canToggle": true,
  "sidebarBadge": "Active by Realm"
}
```

## ⚠️ Notas Importantes

1. **Desactivar un Realm ≠ Desinstalar Grimoires**
   - Los grimoires permanecen en la tabla `modules`
   - Solo cambia el campo `enabled`
   - El `realmId` se mantiene para saber a qué realm pertenecen

2. **Reactivar un Realm**
   - Cuando se reactiva un realm, todos sus grimoires se vuelven a activar
   - Incluyendo los que fueron desactivados manualmente

3. **Cambiar de Realm**
   - Los grimoires del realm anterior se desactivan automáticamente
   - Los grimoires del nuevo realm se activan automáticamente
   - Puedes usar `disablePreviousRealm: false` para mantener ambos activos

4. **Control Individual Persistente**
   - Si desactivas manualmente un grimoire y luego desactivas/reactivas el realm
   - El grimoire seguirá desactivado hasta que lo actives manualmente o reactivas el realm
