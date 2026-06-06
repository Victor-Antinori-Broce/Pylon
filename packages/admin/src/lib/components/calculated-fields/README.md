# Calculated Fields / KPI System

Sistema de campos calculados integrado en el DataExplorer. Reemplaza la necesidad de un grimoire separado para KPIs.

## Componentes

### FormulaBuilder

Constructor visual de fórmulas matemáticas.

```svelte
<script>
  import { FormulaBuilder } from "$lib/components/calculated-fields";

  const fields = [
    { name: "price", label: "Price", type: "number" },
    { name: "quantity", label: "Quantity", type: "number" },
    { name: "discount", label: "Discount %", type: "number" },
  ];

  let formula = "{price} * {quantity} * (1 - {discount} / 100)";
</script>

<FormulaBuilder availableFields={fields} bind:value={formula} />
```

### KpiCreator

Wizard completo para crear campos calculados con todos los tipos soportados.

```svelte
<script>
  import { KpiCreator } from "$lib/components/calculated-fields";

  const fields = [
    { name: "revenue", label: "Revenue", type: "number" },
    { name: "cost", label: "Cost", type: "number" },
  ];

  function handleSave(field) {
    console.log("New calculated field:", field);
  }
</script>

<KpiCreator availableFields={fields} onSave={handleSave} />
```

## Tipos de Campos Calculados

| Tipo          | Descripción          | Uso típico                    |
| ------------- | -------------------- | ----------------------------- |
| `formula`     | Expresión matemática | `{price} * {quantity}`        |
| `count`       | Contar registros     | Número de órdenes por cliente |
| `sum`         | Sumar valores        | Total de ventas por categoría |
| `average`     | Promedio             | Valor promedio de pedido      |
| `concat`      | Unir textos          | `{firstName} {lastName}`      |
| `date_diff`   | Diferencia de fechas | Días desde la última compra   |
| `conditional` | IF/THEN/ELSE         | `{status} = 'active' ? 1 : 0` |
| `lookup`      | Buscar en otra tabla | Nombre del cliente desde ID   |

## Funciones Disponibles

### Matemáticas

- `ABS(x)` - Valor absoluto
- `ROUND(x, n)` - Redondear a n decimales
- `CEIL(x)` - Redondear arriba
- `FLOOR(x)` - Redondear abajo
- `MIN(a, b)` - Mínimo
- `MAX(a, b)` - Máximo

### Texto

- `LEN(text)` - Longitud
- `UPPER(text)` - Mayúsculas
- `LOWER(text)` - Minúsculas
- `TRIM(text)` - Quitar espacios
- `SUBSTRING(text, start, length)` - Extraer substring

### Fecha

- `NOW()` - Fecha/hora actual
- `TODAY()` - Fecha actual
- `YEAR(date)` - Año
- `MONTH(date)` - Mes
- `DAY(date)` - Día
- `DATEDIFF(date1, date2)` - Días entre fechas

### Lógica

- `IF(condition, true, false)` - Condicional
- `AND(a, b)` - Y lógico
- `OR(a, b)` - O lógico
- `NOT(a)` - Negación
- `COALESCE(a, b, ...)` - Primer valor no nulo
- `ISNULL(field, default)` - Valor por defecto si nulo

## Formato de Salida

```typescript
{
  type: "currency",
  currency: "USD",
  decimals: 2,
  prefix: "$",
  suffix: ""
}
```

Tipos de formato:

- `text` - Texto plano
- `number` - Número con decimales configurables
- `currency` - Moneda con símbolo
- `percentage` - Porcentaje
- `duration` - Duración (días, horas, minutos)
- `badge` - Estado visual con color

## Ejemplos de KPIs

### Revenue Total

```json
{
  "name": "total_revenue",
  "label": "Total Revenue",
  "type": "sum",
  "config": {
    "sourceTable": "orders",
    "sourceField": "amount"
  },
  "format": {
    "type": "currency",
    "currency": "USD"
  },
  "isKpi": true,
  "target": 100000
}
```

### Tasa de Conversión

```json
{
  "name": "conversion_rate",
  "label": "Conversion Rate",
  "type": "formula",
  "config": {
    "expression": "{conversions} / {visitors} * 100"
  },
  "format": {
    "type": "percentage",
    "decimals": 2
  }
}
```

### Cliente VIP

```json
{
  "name": "is_vip",
  "label": "VIP Status",
  "type": "conditional",
  "config": {
    "condition": {
      "field": "lifetime_value",
      "operator": "gte",
      "value": 10000
    },
    "trueValue": "VIP",
    "falseValue": "Regular"
  },
  "format": {
    "type": "badge",
    "color": "gold"
  }
}
```

### Días Inactivo

```json
{
  "name": "days_inactive",
  "label": "Days Inactive",
  "type": "date_diff",
  "config": {
    "startField": "last_login",
    "endField": null,
    "unit": "days"
  },
  "format": {
    "type": "number",
    "suffix": " days"
  },
  "isKpi": true,
  "warningThreshold": 30
}
```

## Integración con DataExplorer

Los campos calculados se configuran en el grimoire.json y el DataExplorer los renderiza automáticamente:

```json
{
  "tables": [
    {
      "name": "customers",
      "fields": {
        "lifetime_value": {
          "type": "calculated",
          "config": {
            "type": "sum",
            "sourceTable": "orders",
            "sourceField": "total"
          }
        },
        "is_vip": {
          "type": "calculated",
          "config": {
            "type": "conditional",
            "condition": { "field": "lifetime_value", "operator": "gte", "value": 10000 }
          }
        }
      }
    }
  ]
}
```

## Diferencia con el antiguo grimoire-formulas

| Aspecto       | Antiguo grimoire-formulas | Nuevo sistema integrado   |
| ------------- | ------------------------- | ------------------------- |
| Ubicación     | Grimoire separado         | Feature del core          |
| UI            | Vista custom separada     | Integrado en DataExplorer |
| Configuración | JSON manual               | Builder visual            |
| Tipos         | Solo fórmulas             | 8 tipos de cálculo        |
| Formatos      | Limitado                  | 6 tipos de formato        |
| KPIs          | No soportado              | Targets y alertas         |
| Relaciones    | No soportado              | Agregaciones de tablas    |

## Migración desde grimoire-formulas

Si tenías campos calculados en el grimoire-formulas, migra así:

```typescript
// Antes (grimoire-formulas)
{
  "name": "total",
  "expression": "price * quantity"
}

// Después (campo calculado en tabla)
{
  "name": "total",
  "type": "formula",
  "config": {
    "expression": "{price} * {quantity}"
  }
}
```
