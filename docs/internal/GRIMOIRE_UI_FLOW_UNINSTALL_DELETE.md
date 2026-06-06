# Flujo de UI: Uninstall vs Delete en Grimoires

## 🎯 Filosofía de Diseño

Dado que los **grimoires son módulos de negocio completos** (como un CRM o un sistema de inventario), seguimos el principio:

> **"Uninstall"** desactiva pero preserva datos.  
> **"Delete"** elimina permanentemente solo después de confirmación explícita.

---

## 📊 Estados de un Grimoire

```
┌─────────────────┐    Uninstall     ┌─────────────────┐    Delete/Purge    ┌─────────────────┐
│   INSTALLED     │ ───────────────▶ │  UNINSTALLED    │ ───────────────▶   │    DELETED      │
│   (Activo)      │   (Preserva      │  (Datos         │   (Elimina         │   (Gone forever) │
│                 │    datos)        │   preservados)  │    permanentemente)│                 │
│ • En menú       │                  │ • Fuera de menú │                    │                 │
│ • API activa    │                  │ • API inactiva  │                    │                 │
│ • Tablas con    │                  │ • Tablas        │                    │                 │
│   datos         │                  │   intactas      │                    │                 │
└─────────────────┘                  └─────────────────┘                    └─────────────────┘
         │                                    │
         │                                    │
         ▼                                    ▼
   [Uninstall btn]                      [Recover btn]
   (Acción principal)                   [Delete btn]
                                        (Zona peligrosa)
```

---

## 🎨 UI Propuesta

### 1. Vista de Grimoires Instalados

```
┌─────────────────────────────────────────────────────────────────────┐
│ INSTALLED GRIMOIRES                                    [+ Add New]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 🎮 Games Catalog                                    [⚙️] [🗑️]   │ │
│ │    Status: ✅ Active    Data: 150 games, 23 platforms           │ │
│ │    Realm: Gremius CMS Realm                                     │ │
│ │                                                                 │ │
│ │    Last edit: 2 hours ago                                       │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 📚 Academy LMS                                      [⚙️] [🗑️]   │ │
│ │    Status: ⏸️  Disabled    Data: 12 courses, 45 students        │ │
│ │                                                                 │ │
│ │    [Enable]  [Uninstall]                                        │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2. Modal de Confirmación - Uninstall

```
┌─────────────────────────────────────────────────────────────────────┐
│  🗑️  Uninstall "Games Catalog"?                                    │
│                                                                     │
│  This will remove the grimoire from the system but PRESERVE         │
│  all your data for future recovery.                                 │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  📊 Data that will be preserved:                            │   │
│  │                                                             │   │
│  │  • 150 games in 'games' table                              │   │
│  │  • 23 platforms in 'platforms' table                       │   │
│  │  • 47 screenshots in media library                         │   │
│  │  • All configurations and settings                         │   │
│  │                                                             │   │
│  │  Total: ~4.2 MB of data                                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  After uninstalling, you can:                                       │
│  ✓ Recover anytime and continue where you left off                  │
│  ✓ The grimoire will appear in "Uninstalled (Data Preserved)"       │
│                                                                     │
│  [Cancel]                    [Uninstall - Preserve Data]            │
└─────────────────────────────────────────────────────────────────────┘
```

### 3. Sección "Uninstalled (Data Preserved)"

```
┌─────────────────────────────────────────────────────────────────────┐
│ UNINSTALLED (DATA PRESERVED)                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ These grimoires have been uninstalled but their data is preserved.  │
│ You can recover them or permanently delete their data.              │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 🎮 Games Catalog                                                │ │
│ │    Uninstalled: 3 days ago                                      │ │
│ │    💾 Data preserved: 150 games, 23 platforms (~4.2 MB)        │ │
│ │                                                                 │ │
│ │    [⬇️ Recover & Restore]    [⚠️ Delete Data...]                │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 🏢 CRM                                                          │ │
│ │    Uninstalled: 1 week ago                                      │ │
│ │    💾 Data preserved: 45 contacts, 12 deals (~1.8 MB)          │ │
│ │                                                                 │ │
│ │    [⬇️ Recover & Restore]    [⚠️ Delete Data...]                │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  💡 Tip: Consider exporting data before permanent deletion          │
│  [Export All Uninstalled Data]                                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 4. Modal de Confirmación - Delete (Zona Peligrosa)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ⚠️  DELETE DATA PERMANENTLY                                        │
│                                                                     │
│  You are about to PERMANENTLY DELETE all data for:                  │
│                                                                     │
│  🎮 Games Catalog                                                   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ❌ This will IRREVERSIBLY DELETE:                          │   │
│  │                                                             │   │
│  │  • Table 'games' (150 records)                             │   │
│  │  • Table 'platforms' (23 records)                          │   │
│  │  • Table 'games_to_platforms' (89 records)                 │   │
│  │  • Table 'games_to_tags' (156 records)                     │   │
│  │  • Associated media files (47 images)                      │   │
│  │                                                             │   │
│  │  ⚠️  This action CANNOT BE UNDONE.                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  🔒 Security Challenge:                                             │
│  Type "games" to confirm permanent deletion:                        │
│  ┌─────────────────────────────────────────┐                       │
│  │ [games                                ] │                       │
│  └─────────────────────────────────────────┘                       │
│                                                                     │
│  [Cancel]                  [Export First]     [Delete Forever]      │
└─────────────────────────────────────────────────────────────────────┘
```

### 5. Vista de Recuperación

```
┌─────────────────────────────────────────────────────────────────────┐
│  ⬇️  Recover "Games Catalog"                                        │
│                                                                     │
│  This grimoire was uninstalled on Jan 15, 2024.                    │
│  We found the following data:                                       │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  📊 Preserved Data:                                         │   │
│  │                                                             │   │
│  │  ✅ games table          150 records                       │   │
│  │  ✅ platforms table       23 records                       │   │
│  │  ✅ configurations        Found                            │   │
│  │  ✅ media associations    47 files                         │   │
│  │                                                             │   │
│  │  Last activity: 3 days ago                                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  After recovery, the grimoire will be:                              │
│  • Reinstalled and ENABLED                                          │
│ • All data will be immediately accessible                           │
│  • It will reappear in the main menu                                │
│                                                                     │
│  [Cancel]                              [Recover & Restore All]      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔧 API Endpoints para esta UI

### Uninstall (Soft Delete)

```http
POST /api/modules/grimoire-games/uninstall
```

**Response:**

```json
{
  "success": true,
  "action": "uninstall",
  "key": "grimoire-games",
  "dataPreserved": {
    "hasData": true,
    "totalRows": 418,
    "tables": [
      { "name": "games", "rowCount": 150 },
      { "name": "platforms", "rowCount": 23 }
    ]
  },
  "message": "Grimoire uninstalled. Data preserved: 418 rows in 4 tables."
}
```

### Listar con Sección Uninstalled

```http
GET /api/modules
```

**Response (simplificado):**

```json
{
  "categories": {
    "optional": { "modules": [...] },
    "uninstalled": {
      "label": "Uninstalled (Data Preserved)",
      "modules": [
        {
          "key": "grimoire-games",
          "name": "Games Catalog",
          "status": "uninstalled",
          "hasPreservedData": true,
          "dataSummary": {
            "totalRows": 418,
            "tables": [
              { "name": "games", "rows": 150 },
              { "name": "platforms", "rows": 23 }
            ]
          },
          "canRecover": true,
          "canDelete": true,
          "actions": ["recover", "delete"]
        }
      ]
    }
  }
}
```

### Recover

```http
POST /api/modules/grimoire-games/recover
```

**Response:**

```json
{
  "success": true,
  "action": "recover",
  "key": "grimoire-games",
  "dataRestored": {
    "totalRows": 418,
    "tables": [...]
  },
  "message": "Grimoire recovered successfully with 418 rows of data."
}
```

### Delete Permanente (con purge)

```http
DELETE /api/modules/grimoire-games?purge=true&force=true
```

**Response:**

```json
{
  "success": true,
  "action": "delete",
  "purge": true,
  "dataDeleted": {
    "tablesDropped": 4,
    "tables": ["games", "platforms", "games_to_platforms", "games_to_tags"],
    "totalRows": 418
  },
  "warning": "This action is irreversible. Data has been permanently deleted."
}
```

---

## 🎭 Flujos de Usuario

### Escenario 1: "Ya no uso este módulo pero quiero guardar los datos"

```
Usuario ve Games Catalog en lista
    ↓
Click en 🗑️ Uninstall
    ↓
Modal: "Preservar 150 juegos?"
    ↓
[Confirmar]
    ↓
Games Catalog desaparece de "Installed"
    ↓
Aparece en "Uninstalled (Data Preserved)"
    ↓
Usuario puede recuperarlo cuando quiera
```

### Escenario 2: "Recuperé el módulo que desinstalé"

```
Usuario va a "Uninstalled (Data Preserved)"
    ↓
Ve Games Catalog con "150 games preserved"
    ↓
Click en [⬇️ Recover & Restore]
    ↓
Modal: "Restaurar 418 registros?"
    ↓
[Confirmar]
    ↓
Games Catalog vuelve a "Installed" ✅
    ↓
Todos los datos están exactamente igual
```

### Escenario 3: "Quiero borrar todo definitivamente"

```
Usuario va a "Uninstalled (Data Preserved)"
    ↓
Ve Games Catalog
    ↓
Click en [⚠️ Delete Data...]
    ↓
Modal Zona Peligrosa
    ↓
Muestra TODO lo que se borrará
    ↓
Challenge: escribe "games"
    ↓
[Delete Forever]
    ↓
Games Catalog desaparece completamente
    ↓
Tablas eliminadas de la base de datos
```

### Escenario 4: "Me equivoqué, quiero recuperar"

```
Usuario desinstaló Games Catalog hace 2 semanas
    ↓
No ha borrado los datos todavía
    ↓
Va a "Uninstalled (Data Preserved)"
    ↓
Click en [⬇️ Recover]
    ↓
¡Listo! Todo vuelve exactamente como estaba
```

---

## ✅ Ventajas de este Diseño

| Aspecto                    | Beneficio                                                 |
| -------------------------- | --------------------------------------------------------- |
| **Sin miedo al uninstall** | Los usuarios desinstalan sin temor a perder datos         |
| **Recuperación simple**    | Un click y todo vuelve exactamente igual                  |
| **Limpieza gradual**       | Primero desinstalan, deciden después si borrar            |
| **Transparencia**          | Ven exactamente qué datos se preservan                    |
| **Seguridad**              | Delete requiere confirmación explícita y typing challenge |
| **Auditoría**              | Siempre saben qué desinstalaron y cuándo                  |

---

## 🚀 Implementación

Los endpoints ya están implementados en `apps/api/src/routes/modules.ts`:

- `POST /:key/uninstall` - Desinstala preservando datos
- `POST /:key/recover` - Recupera un grimoire desinstalado
- `DELETE /:key?purge=true` - Elimina permanentemente (requiere purge flag)
- `GET /` - Lista incluye sección "uninstalled" con datos preservados
