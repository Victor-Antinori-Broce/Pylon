# Actions Unification Guide

This document describes the unified Actions system that replaces the separate Workers and Webhooks systems.

## Overview

The Actions system unifies three previously separate concepts:
- **Workers** (scheduled/event-driven code execution)
- **Webhooks** (outgoing HTTP notifications)
- **Agents** (AI-driven actions)

Into a single cohesive system with:
- One database table (`actions`)
- One API endpoint (`/api/actions`)
- One execution engine (`ActionEngine`)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         API Layer                            │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ /api/actions│  │/api/functions│  │/api/webhooks │       │
│  │   (new)     │  │  (legacy)    │  │   (legacy)   │       │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘       │
│         │                │                  │               │
│         └────────────────┴──────────────────┘               │
│                          │                                   │
│                   ┌──────▼───────┐                          │
│                   │ ActionEngine │                          │
│                   └──────┬───────┘                          │
│                          │                                   │
│    ┌─────────────────────┼─────────────────────┐            │
│    │                     │                     │            │
│ ┌──▼───┐           ┌────▼────┐          ┌─────▼─────┐      │
│ │ Code │           │Webhook  │          │  Agent    │      │
│ │Exec  │           │  Out    │          │           │      │
│ └──────┘           └─────────┘          └───────────┘      │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

### actions table

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| name | varchar(200) | Action name |
| slug | varchar(200) | URL-friendly identifier |
| type | enum | `code`, `webhook_out`, `webhook_in`, `agent` |
| trigger | enum | `manual`, `cron`, `event`, `http` |
| triggerConfig | jsonb | Trigger-specific configuration |
| config | jsonb | Action-specific configuration |
| status | enum | `active`, `paused`, `error` |

### action_executions table

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| actionId | uuid | Reference to actions |
| status | enum | `pending`, `running`, `success`, `error`, `timeout` |
| triggerType | enum | How the execution was triggered |
| logs | text | Captured console output |
| result | jsonb | Execution result |
| durationMs | integer | Execution time |

## Action Types

### Code Actions (`type: "code"`)

Execute JavaScript/TypeScript code in a sandboxed environment.

```typescript
// Example config
{
  code: "export default async function(context) { ... }",
  timeoutMs: 5000,
  memoryLimitMb: 64,
  envVars: { API_KEY: "secret" }
}
```

### Webhook Out (`type: "webhook_out"`)

Send HTTP requests to external services.

```typescript
// Example config
{
  url: "https://hooks.slack.com/services/...",
  headers: { "Authorization": "Bearer ..." },
  secret: "signing-secret",
  retryPolicy: { maxRetries: 3, backoffMs: 1000 }
}
```

### Webhook In (`type: "webhook_in"`)

Receive HTTP requests from external services.

```typescript
// Example triggerConfig
{
  httpMethod: "POST",
  httpPath: "/webhooks/stripe"
}

// Example config
{
  authType: "hmac" // or "bearer" or "none"
}
```

### Agent Actions (`type: "agent"`)

Execute AI agent workflows.

```typescript
// Example config
{
  agentId: "support-bot",
  promptTemplate: "Handle this inquiry: {{message}}",
  model: "gpt-4"
}
```

## API Reference

### List Actions

```http
GET /api/actions?type=code&trigger=cron&status=active
```

### Create Action

```http
POST /api/actions
Content-Type: application/json

{
  "name": "Daily Report",
  "type": "code",
  "trigger": "cron",
  "triggerConfig": {
    "cronExpression": "0 9 * * *"
  },
  "config": {
    "code": "export default async function(ctx) { ... }",
    "timeoutMs": 10000
  }
}
```

### Execute Action

```http
POST /api/actions/:id/execute
Content-Type: application/json

{
  "trigger": "manual",
  "payload": { "key": "value" }
}
```

## Migration Guide

### Phase 1: UI Unification (Completed)
- New `/actions` page combines Workers and Webhooks UI
- Legacy routes redirect to new page
- No backend changes

### Phase 2: Backend Implementation (Completed)
1. New `actions` and `action_executions` tables
2. ActionEngine with unified execution
3. New `/api/actions` endpoints
4. Backward-compatible legacy APIs

### Phase 3: Data Migration (Current)
1. Run schema migration:
   ```bash
   bunx drizzle-kit push
   ```

2. Migrate data:
   ```bash
   bun run apps/api/src/db/migrations/migrate-to-actions.ts
   ```

3. Verify migration:
   ```bash
   # Check that all data is migrated
   # Test all actions work correctly
   ```

4. Clean up legacy tables (after verification):
   ```bash
   bun run apps/api/src/db/migrations/cleanup-legacy-actions.ts --execute --force
   ```

## Backward Compatibility

During the transition period:
- `/api/functions` → delegates to ActionEngine
- `/api/webhooks` → delegates to ActionEngine
- Legacy UI redirects to new Actions UI

The system automatically detects if an action has been migrated and routes accordingly.

## Event System

Actions can be triggered by:

1. **Manual**: Explicit API call
2. **Cron**: Scheduled execution
3. **Event**: System events (entry:created, entry:updated, etc.)
4. **HTTP**: Incoming webhook requests

Event mapping:
```typescript
"entry:created" → "entry.created"
"entry:updated" → "entry.updated"
"entry:deleted" → "entry.deleted"
"post:published" → "post.published"
```

## Error Handling

Actions are automatically disabled after 10 consecutive errors.

Error tracking:
- Stored in `actions.errorCount`
- Last error message in `actions.lastError`
- Full error details in `action_executions.errorMessage`

## Future Enhancements

Potential new action types:
- `email`: Send email notifications
- `sms`: Send SMS messages
- `queue`: Add to external queue
- `transform`: Data transformation pipelines

## Troubleshooting

### Actions not executing
1. Check status is `active`
2. Verify trigger configuration
3. Check `action_executions` for error logs

### Migration issues
1. Run verification: `migrate-to-actions.ts` logs
2. Check `actions.legacy_id` mapping
3. Compare counts between old and new tables

### Performance
- Actions execute in isolated sandboxes (code type)
- Webhooks have configurable retry policies
- Event dispatch is fire-and-forget (non-blocking)
