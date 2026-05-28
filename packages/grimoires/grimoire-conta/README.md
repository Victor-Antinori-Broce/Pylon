# Conta — General Ledger Engine

**Motor de Libro Mayor General** para GremiusCMS. Diseñado para ser **moldeable**: sirve tanto para una tienda de café como para una firma de abogados.

> "El motor no sabe qué es un abogado. Solo entiende Cuentas, Asientos y Balance."

## 🏛️ Arquitectura

```
Journals        → Encabezados de asiento (fecha, descripción, metadata)
LedgerEntries   → Líneas de partida doble (cuenta, debe, haber, moneda)
T-Accounts      → Vistas agregadas computadas en tiempo real (NO son tablas)
```

### Principios de diseño

1. **Motor separado de la lógica de negocio**: El grimoire solo maneja el ledger. La lógica específica (honorarios legales, ventas de café) vive en capas superiores.
2. **Metadata JSONB**: Cada `journal` y `ledgerEntry` lleva un campo `metadata` donde puedes guardar datos de dominio (`case_id`, `store_id`, `sku`) sin alterar el schema.
3. **Plantillas de Asientos**: Traducen eventos de negocio a asientos contables automáticamente.
4. **Decimal.js**: Toda la aritmética monetaria usa precisión decimal infinita. **Nunca** usamos `number` float de JS para dinero.
5. **Multidivisa nativa**: Cada línea de ledger registra su `currency` y `exchangeRate`.

## 📦 Estructura

```
packages/grimoires/grimoire-conta/
├── package.json                  # Dependencias (decimal.js, dayjs, etc.)
├── grimoire.json                 # Manifiesto
├── conta.schema.ts               # Drizzle schema (8 tablas)
├── conta.service.ts              # Motor contable (Decimal.js)
├── conta.routes.ts               # API REST
├── index.ts                      # Entry point defineGrimoire
├── tsconfig.json
└── README.md                     # Este archivo
```

## 🔧 Instalación

1. El grimoire es **auto-descubierto** por `apps/api/gremius.config.ts`.
2. Aparece detectado pero `enabled: false` por seguridad.
3. Actívalo en `gremius.config.ts` o vía CLI:
   ```bash
   gremius plugin enable conta
   ```
4. Genera migraciones:
   ```bash
   cd apps/api && bunx drizzle-kit generate
   ```
5. Levanta la API y corre:
   ```bash
   curl -X POST http://localhost:3000/api/conta/seed \
     -H "Cookie: session=..."
   ```

## 💰 Manejo de Dinero

**Crítico**: Este grimoire usa `Decimal.js` en la capa de aplicación y `numeric(19,4)` en PostgreSQL.

```typescript
import { Decimal } from "decimal.js";

const total = new Decimal("1000.50");
const taxRate = new Decimal("0.07");
const tax = total.times(taxRate); // 70.0350
```

Nunca envíes montos como `number` (float). Envía strings:

```json
{
  "debit": "1000.50",
  "credit": "0"
}
```

## 🧬 Metadata JSONB (Moldeable)

Guarda datos específicos del dominio sin tocar el schema:

```json
POST /api/conta/journals
{
  "date": "2025-01-15",
  "description": "Honorarios caso Smith",
  "metadata": {
    "case_id": "SMITH-2025-001",
    "client_id": "cli_123",
    "practice_area": "litigation"
  },
  "lines": [
    {
      "accountId": "...",
      "debit": "5000.00",
      "metadata": { "case_id": "SMITH-2025-001" }
    },
    {
      "accountId": "...",
      "credit": "5000.00",
      "metadata": { "case_id": "SMITH-2025-001" }
    }
  ]
}
```

Luego filtra reportes por metadata en capas superiores.

## 📋 Plantillas de Asientos

Las plantillas traducen eventos de negocio a asientos contables:

```bash
POST /api/conta/templates
{
  "name": "Legal Fees with Tax",
  "templateType": "legal_fees",
  "rules": [
    {
      "accountCode": "1200",
      "side": "debit",
      "amountFormula": "total",
      "description": "A/R from client"
    },
    {
      "accountCode": "4000",
      "side": "credit",
      "amountFormula": "total - (total * taxRate)",
      "description": "Revenue net of tax"
    },
    {
      "accountCode": "2200",
      "side": "credit",
      "amountFormula": "total * taxRate",
      "description": "Tax payable"
    }
  ],
  "requiredMetadata": ["client_id"]
}
```

Aplicar una plantilla:

```bash
POST /api/conta/templates/:id/apply
{
  "variables": { "total": 1000, "taxRate": 0.07 },
  "metadata": { "client_id": "45" }
}
```

Esto devuelve las líneas de ledger listas para ser enviadas a `POST /api/conta/journals`.

## 🏦 Trust Accounting (Fondos de Terceros)

El motor marca cuentas con `isTrustAccount = true`. Legalmente, el dinero del cliente **nunca** se mezcla con el de la firma.

```bash
# Ver balance de una cuenta trust (opcionalmente filtrado por expediente)
GET /api/conta/trust-balances?accountId=TRUST_ACCOUNT_ID&matterId=MATTER_ID
```

Asiento típico de depósito en trust:

```json
{
  "date": "2025-01-15",
  "description": "Depósito fondos cliente Smith",
  "journalType": "trust_deposit",
  "status": "posted",
  "lines": [
    { "accountId": "BANK_TRUST_ID", "debit": "5000.00" },
    { "accountId": "CLIENT_TRUST_FUNDS_ID", "credit": "5000.00" }
  ]
}
```

## 🧾 Disbursements (Gastos Reembolsables)

Registra gastos que la firma paga de su bolsillo y luego factura al cliente:

```bash
POST /api/conta/disbursements
{
  "matterId": "matter_123",
  "description": "Pago perito médico",
  "amount": "850.00",
  "paidFromAccountId": "BANK_OPERATING_ID"
}
```

Esto crea automáticamente el asiento:
- **Dr** Disbursements Receivable (Activo)
- **Cr** Bank Operating (Activo)

Luego factúralo:

```bash
POST /api/conta/disbursements/:id/bill
```

Esto genera el asiento de facturación:
- **Dr** A/R Clients (Activo)
- **Cr** Disbursements Receivable (Activo)

## 📊 T-Account (Cuenta T)

Las Cuentas T no son tablas. Son **vistas computadas** del ledger:

```bash
GET /api/conta/t-account/ACCOUNT_ID?dateFrom=2025-01-01&dateTo=2025-01-31
```

Respuesta:

```json
{
  "data": {
    "account": { ... },
    "openingBalance": "1000.00",
    "movements": [
      { "date": "2025-01-10", "debit": "500.00", "credit": "0", "balance": "1500.00" },
      { "date": "2025-01-15", "debit": "0", "credit": "200.00", "balance": "1300.00" }
    ],
    "closingBalance": "1300.00"
  }
}
```

## 📈 Reportes Financieros

| Endpoint | Descripción |
|----------|-------------|
| `GET /api/conta/reports/trial-balance` | Balance de comprobación |
| `GET /api/conta/reports/balance-sheet?asOf=2025-01-31` | Balance general |
| `GET /api/conta/reports/profit-loss?dateFrom=...&dateTo=...` | Estado de resultados |

## 🛡️ Validación Automática

Antes de postear cualquier asiento, el motor verifica:

1. `∑debits == ∑credits`
2. Al menos 2 líneas de ledger
3. Ninguna línea tiene ambos lados (debit y credit simultáneos)

Puedes pre-validar sin guardar:

```bash
POST /api/conta/journals/validate
{
  "lines": [
    { "accountId": "...", "debit": "100", "credit": "0" },
    { "accountId": "...", "debit": "0", "credit": "100" }
  ]
}
```

## 🚀 API Endpoints

### Setup
- `POST /seed` — Crear plan de cuentas y monedas por defecto

### Currencies
- `GET /currencies`
- `POST /currencies`

### Accounts
- `GET /accounts?type=asset&isTrust=true`
- `POST /accounts`
- `PATCH /accounts/:id`
- `DELETE /accounts/:id`

### Counterparties
- `GET /counterparties`
- `POST /counterparties`

### Matters
- `GET /matters?clientId=...`
- `POST /matters`

### Templates
- `GET /templates`
- `POST /templates`
- `POST /templates/:id/apply`

### Journals
- `GET /journals`
- `POST /journals/validate`
- `POST /journals`
- `GET /journals/:id`
- `POST /journals/:id/post`
- `POST /journals/:id/reverse`

### T-Account & Trust
- `GET /t-account/:accountId`
- `GET /trust-balances?accountId=...&matterId=...`

### Disbursements
- `GET /disbursements`
- `POST /disbursements`
- `POST /disbursements/:id/bill`
- `POST /disbursements/:id/pay`

### Reports
- `GET /reports/trial-balance`
- `GET /reports/balance-sheet`
- `GET /reports/profit-loss`
