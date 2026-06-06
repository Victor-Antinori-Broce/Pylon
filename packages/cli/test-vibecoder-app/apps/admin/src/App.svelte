<script lang="ts">
  import { onMount } from "svelte";

  import GameStatsWidget from "./components/widgets/GameStatsWidget.svelte";
  import RecentActivityWidget from "./components/widgets/RecentActivityWidget.svelte";
  import WebhookStatusWidget from "./components/widgets/WebhookStatusWidget.svelte";
  import { checkSession } from "./lib/auth.svelte";
  import ProtectedRoutes from "./lib/ProtectedRoutes.svelte";
  import { componentRegistry } from "./lib/registry.svelte";
  import { loadTheme } from "./lib/theme.svelte";
  
  // Importar widgets para registro
  
  onMount(async () => {
    // 1. Cargar tema primero
    await loadTheme();
    
    // 2. Configurar módulos habilitados
    componentRegistry.setEnabledModules(["games", "webhooks", "analytics", "core"]);
    
    // 3. Registrar widgets dinámicos
    // En una app real, esto vendría de la API o de módulos cargados dinámicamente
    componentRegistry.registerWidget({
      id: "gremio-webhook-status",
      slot: "dashboard:top",
      component: WebhookStatusWidget,
      order: 10,
      module: "webhooks",
      props: { showFailedOnly: false }
    });
    
    componentRegistry.registerWidget({
      id: "gremio-game-stats",
      slot: "dashboard:stats",
      component: GameStatsWidget,
      order: 5,
      module: "games",
      props: { title: "Game Statistics", showChart: true }
    });
    
    componentRegistry.registerWidget({
      id: "gremio-recent-activity",
      slot: "dashboard:sidebar",
      component: RecentActivityWidget,
      order: 10,
      module: "core",
      props: { limit: 5 }
    });
    
    // 4. Verificar sesión de usuario
    await checkSession();
    
    console.log("🚀 Gremius Admin initialized");
    console.log("📦 Registered widgets:", componentRegistry.getSlots());
  });
</script>

<!--
  App.svelte — Root Component
  
  Inicializa el sistema de registro de componentes dinámicos
  y maneja el enrutamiento SPA.
-->
<ProtectedRoutes />
