# Centro de Control AI - Componentes

## Visión General

Sistema de UI para gestión y monitoreo de agentes AI en GremiusCMS.

## Componentes

### Timeline

Visualización de pasos de ejecución de un agente.

```svelte
<script>
  import { Timeline } from "$lib/components/agents";

  const steps = [
    {
      id: "1",
      traceId: "trace-1",
      stepType: "thinking",
      content: { thought: "Analizando..." },
      tokensUsed: 45,
      latencyMs: 120,
      createdAt: new Date().toISOString(),
    },
  ];
</script>

<Timeline {steps} />
```

### ChatInterface

Panel de chat interactivo para el playground.

```svelte
<script>
  import { ChatInterface } from "$lib/components/agents";

  let messages = [];
  let loading = false;

  function handleSend(message) {
    // Enviar al API
  }
</script>

<ChatInterface {messages} {loading} agentName="Mi Agente" onSend={handleSend} />
```

### TokenDisplay

Muestra tokens de forma segura (one-time display).

```svelte
<script>
  import { TokenDisplay } from "$lib/components/agents";

  let token = "grm_agent_xxxxxxxxxxxxxxxx";
</script>

<TokenDisplay {token} />
```

## Design System

### Titanio Theme

- **Background**: `#0a0a0f`
- **Surface**: `#12121a`
- **Accent**: Indigo 500 (`#6366f1`)
- **Success**: Emerald 500
- **Warning**: Amber 500
- **Danger**: Red 500

## Rutas

- `/agents` - Listado de agentes
- `/agents/:id` - Detalle del agente (tabs: playground, settings, traces)
- `/traces` - Explorador de traces

## API Endpoints

Ver `src/lib/services/agents.ts` para la documentación completa de métodos.
