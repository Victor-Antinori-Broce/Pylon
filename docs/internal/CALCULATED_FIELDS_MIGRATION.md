# Migración: Eliminación de grimoire-formulas + Sistema de Campos Calculados

## ✅ Eliminado

### grimoire-formulas

```
packages/grimoires/grimoire-formulas/     ← ELIMINADO
packages/admin/src/views/formulas/            ← ELIMINADO
```

**Razón**: Era una vista custom innecesaria. Los campos calculados deben ser una **feature del core**, no un grimoire separado.

---

## ✅ Creado: Sistema de Campos Calculados Integrado

### 1. Tipos del Core

```
packages/core/src/types/calculated-fields.ts
```

Define:

- `CalculatedField` - Interfaz completa de campo calculado
- 8 tipos de cálculo: formula, count, sum, average, concat, date_diff, conditional, lookup
- Funciones disponibles: ABS, ROUND, LEN, IF, AND, OR, etc.
- Operadores: +, -, \*, /, %, ^, =, !=, >, <, etc.

### 2. Componentes del Admin

```
packages/admin/src/lib/components/calculated-fields/
├── FormulaBuilder.svelte      ← Builder visual de fórmulas
├── KpiCreator.svelte          ← Wizard completo (3 pasos)
├── index.ts                   ← Exports
└── README.md                  ← Documentación
```

#### FormulaBuilder

- Drag & drop visual de campos, operadores y funciones
- Preview en tiempo real
- Soporte para sintaxis `{fieldName}`

#### KpiCreator (Wizard)

**Paso 1**: Info básica + selección de tipo
**Paso 2**: Configuración según tipo

- Formula: Editor visual
- Count/Sum/Average: Tabla y campo fuente
- Concat: Lista de campos + separador
- Date Diff: Campos de fecha
- Conditional: IF/THEN/ELSE visual
  **Paso 3**: Formato de salida + targets

### 3. Dataset Creator

```
packages/admin/src/views/datasets/DatasetCreator.svelte
```

Wizard de 4 pasos:

1. Basic Info
2. Native Fields
3. Calculated Fields + KPIs
4. Review

---

## 📊 Comparación: Antes vs Después

| Aspecto           | Antes (grimoire-formulas) | Después (Sistema Integrado) |
| ----------------- | ------------------------- | --------------------------- |
| **Arquitectura**  | Grimoire separado         | Feature del core            |
| **Ubicación**     | Vista custom aparte       | Integrado en DataExplorer   |
| **Configuración** | JSON manual               | Builder visual              |
| **Tipos**         | Solo fórmulas             | 8 tipos de cálculo          |
| **Formatos**      | Limitado                  | 6 tipos (currency, %, etc.) |
| **KPIs**          | ❌ No soportado           | ✅ Targets y alertas        |
| **Agregaciones**  | ❌ No soportado           | ✅ Count/Sum/Avg de tablas  |
| **Relaciones**    | ❌ No soportado           | ✅ Lookup entre tablas      |

---

## 🎯 Tipos de Campos Calculados Soportados

| Tipo          | Descripción          | Ejemplo                     |
| ------------- | -------------------- | --------------------------- |
| `formula`     | Expresión matemática | `{price} * {qty}`           |
| `count`       | Contar registros     | Órdenes por cliente         |
| `sum`         | Sumar valores        | Total de ventas             |
| `average`     | Promedio             | Valor promedio              |
| `concat`      | Unir textos          | `{first} {last}`            |
| `date_diff`   | Diferencia fechas    | Días inactivo               |
| `conditional` | IF/THEN/ELSE         | `{status}='active' ? 1 : 0` |
| `lookup`      | Buscar en tabla      | Nombre desde ID             |

---

## 🔧 Uso en un Dataset

```typescript
// DatasetCreator.svelte
import { KpiCreator } from "$lib/components/calculated-fields";

const fields = [
  { name: "price", label: "Price", type: "number" },
  { name: "quantity", label: "Qty", type: "number" },
];

function addKpi(field: CalculatedField) {
  // field contiene toda la configuración
  console.log(field);
  /*
  {
    id: "...",
    name: "total_revenue",
    label: "Total Revenue",
    type: "formula",
    config: {
      expression: "{price} * {quantity}"
    },
    format: {
      type: "currency",
      currency: "USD"
    },
    isKpi: true,
    target: 100000,
    dependsOn: ["price", "quantity"]
  }
  */
}
```

---

## 📁 Archivos Modificados/Creados

### Eliminados

- ❌ `packages/grimoires/grimoire-formulas/`
- ❌ `packages/admin/src/views/formulas/FormulasView.svelte`

### Creados

- ✅ `packages/core/src/types/calculated-fields.ts`
- ✅ `packages/admin/src/lib/components/calculated-fields/FormulaBuilder.svelte`
- ✅ `packages/admin/src/lib/components/calculated-fields/KpiCreator.svelte`
- ✅ `packages/admin/src/lib/components/calculated-fields/index.ts`
- ✅ `packages/admin/src/lib/components/calculated-fields/README.md`
- ✅ `packages/admin/src/views/datasets/DatasetCreator.svelte`
- ✅ `packages/admin/src/lib/data-explorer/` (field registry + componentes)

---

## 🚀 Próximos Pasos

1. **Integrar con DataExplorer**: Que los campos calculados del grimoire.json se rendericen automáticamente
2. **API Backend**: Endpoints para evaluar fórmulas y agregaciones
3. **Persistencia**: Guardar configuración de campos calculados en la base de datos
4. **Validación**: Validar expresiones y dependencias circulares

---

## ✨ Beneficios

1. **Cero vistas custom innecesarias** - Todo es config o core
2. **UX amigable** - Builder visual intuitivo
3. **Reutilizable** - Cualquier dataset puede tener KPIs
4. **Extensible** - Fácil agregar nuevos tipos de cálculo
5. **Consistente** - Misma UI para todos los campos calculados
