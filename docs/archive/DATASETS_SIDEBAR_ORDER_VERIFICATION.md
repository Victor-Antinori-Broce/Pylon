# ✅ Verificación: Orden del Sidebar al Prender/Apagar DataSets

## Estado: PROTEGIDO ✅

El orden del sidebar está garantizado para mantenerse consistente cuando DataSets se apaga y se vuelve a encender.

---

## 🔒 Garantías de Orden

### 1. Orden Definido Explícitamente

Cada item del sidebar tiene una propiedad `order` que determina su posición:

```typescript
const allNavItems: NavItem[] = [
  // Dashboard: Sin order (siempre primero)
  { path: "/", label: "Dashboard", icon: BookOpen },

  // ═══ CORE GRIMOIRES ═══
  // DataSets: order: 0 (SIEMPRE segundo cuando está habilitado)
  { path: "/datasets", label: "DataSets", ..., order: 0, category: "core" },

  // Otros Core: order: 1, 2, 3...
  { path: "/media", label: "Media Library", ..., order: 1, category: "core" },
  { path: "/blocks", label: "Page Builder", ..., order: 2, category: "core" },

  // ═══ OPTIONAL ═══
  { path: "/posts", label: "Blog Posts", ..., order: 10, category: "optional" },

  // ═══ REALM ═══
  { path: "/games", label: "Games", ..., order: 20, category: "realm" },
];
```

### 2. Lógica de Ordenamiento

```typescript
let visibleNavItems = $derived(
  [
    ...allNavItems.filter((item) => !item.moduleKey || moduleStore.enabledKeys.has(item.moduleKey)),
    ...filesystemNavItems,
  ].sort((a, b) => {
    // Dashboard (no order) always comes first
    if (a.path === "/") return -1;
    if (b.path === "/") return 1;

    // Then sort by order (undefined order goes to end)
    const orderA = a.order ?? 999;
    const orderB = b.order ?? 999;
    return orderA - orderB;
  })
);
```

---

## 🧪 Escenarios de Prueba

### Escenario 1: DataSets Encendido (Default)

```
Sidebar:
1. Dashboard                    ← Siempre primero
2. DataSets (order: 0)          ← PRIMER grimoire (después de Dashboard)
3. Media Library (order: 1)
4. Page Builder (order: 2)
5. ...
```

### Escenario 2: Apagar DataSets

```bash
PATCH /api/modules/grimoire-datasets
{ "enabled": false }
```

```
Sidebar:
1. Dashboard                    ← Siempre primero
2. Media Library (order: 1)     ← Ahora segundo (DataSets oculto)
3. Page Builder (order: 2)
4. ...
```

### Escenario 3: Volver a Encender DataSets

```bash
PATCH /api/modules/grimoire-datasets
{ "enabled": true }
```

```
Sidebar:
1. Dashboard                    ← Siempre primero
2. DataSets (order: 0)          ← Vuelve a su posición original
3. Media Library (order: 1)
4. Page Builder (order: 2)
5. ...
```

✅ **DataSets vuelve exactamente donde estaba** (posición 2, después de Dashboard)

---

## 🛡️ Protecciones Implementadas

### 1. Ningún Grimoire Puede Ir Arriba de DataSets

Si DataSets está habilitado (`order: 0`), **ningún** otro grimoire puede ir arriba de él excepto Dashboard:

- Core grimoires: `order: 1, 2, 3...` (mayor que 0)
- Optional grimoires: `order: 10, 11, 12...` (mucho mayor)
- Realm grimoires: `order: 20, 21, 22...` (mucho mayor)
- Filesystem grimoires: `order: undefined` → se convierte a `999` (últimos)

### 2. Persistencia del Orden

El orden no se almacena en la base de datos, se define en el código:

```typescript
// packages/admin/src/lib/components/layout/SidebarLayout.svelte
// Este archivo es la fuente única de verdad para el orden del sidebar
```

Cuando un grimoire se apaga:

1. Se filtra del array (`filter`)
2. El orden de los items restantes se mantiene
3. Cuando se enciende, se vuelve a agregar y se re-ordena

### 3. Reactividad Garantizada

```typescript
let visibleNavItems = $derived();
// ... lógica de filtrado y ordenamiento
```

- `$derived` recalcula automáticamente cuando `moduleStore.enabledKeys` cambia
- El sidebar se actualiza instantáneamente al togglear un grimoire
- No requiere refresh de página

---

## 📊 Comparación: Antes vs Después

### Antes (Sin ordenamiento explícito)

```
Problema: El orden dependía del orden del array original
Riesgo: Si se agregaban items dinámicamente, podían aparecer en cualquier lugar
```

### Después (Con ordenamiento explícito)

```
Solución: Propiedad 'order' en cada item
Garantía: DataSets siempre tiene order: 0, por lo que siempre está después de Dashboard
```

---

## 🎯 Reglas de Negocio Cumplidas

| Requisito                                        | Implementación                                         | Estado |
| ------------------------------------------------ | ------------------------------------------------------ | ------ |
| DataSets debe estar abajo del Dashboard          | `order: 0` (Dashboard no tiene order, siempre primero) | ✅     |
| Ningún otro grimoire puede ir arriba de DataSets | Todos los demás tienen `order >= 1`                    | ✅     |
| Orden se mantiene al aprender/encender           | Lógica `$derived` con `sort()`                         | ✅     |
| Orden persiste después de reinicio               | Hardcodeado en el código fuente                        | ✅     |

---

## 🔍 Código de Verificación

Para verificar que el orden funciona correctamente, abrir DevTools en el navegador:

```javascript
// En la consola del navegador (con la app de admin abierta)

// Verificar que DataSets tiene order: 0
const navItems = await (await fetch("/api/modules")).json();
const dataSets = navItems.docs.find((m) => m.key === "grimoire-datasets");
console.log(dataSets); // Debería mostrar el grimoire con su configuración

// El orden real se ve en el DOM
const sidebarItems = document.querySelectorAll("aside nav a");
sidebarItems.forEach((item, index) => {
  console.log(`${index}: ${item.textContent.trim()}`);
});
// Output esperado:
// 0: Dashboard
// 1: DataSets  <-- Siempre aquí cuando está habilitado
// 2: Media Library
// ...
```

---

## ✅ Checklist Final

- [x] DataSets tiene `order: 0` explícito
- [x] Dashboard siempre aparece primero (sin order, lógica especial)
- [x] Todos los demás grimoires tienen `order >= 1`
- [x] Lógica de `sort()` por order implementada
- [x] Reactividad con `$derived` garantizada
- [x] Función de ordenamiento pura (mismo input = mismo output)

---

## 🚀 Comportamiento Garantizado

**Sin importar cuántas veces se apague y encienda DataSets:**

1. ✅ Siempre aparecerá después de Dashboard
2. ✅ Siempre aparecerá antes que cualquier otro grimoire
3. ✅ Siempre estará en la posición #2 del sidebar (índice 1)
4. ✅ El orden nunca se "desordina" o mezcla

**DataSets es y siempre será el primer grimoire del sidebar (después de Dashboard).**
